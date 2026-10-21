import { AUDIT_ACTION } from '../../constants/audit.js';
import { PRIORITY_RANK } from '../../constants/rules.js';
import { TASK_STATUS, UNRESOLVED_STATUSES } from '../../constants/tasks.js';
import { Task } from '../../models/Task.js';
import { User } from '../../models/User.js';
import { auditEntry, recordAudit } from '../audit/audit.service.js';

/**
 * Applies the rule engine's verdict to the tasks collection - idempotently.
 *
 * For every (order, rule) pair:
 *  rule fires, no task yet            -> CREATE (upsert on the unique {orderId, ruleType} key)
 *  rule fires, task open              -> keep it; refresh details only if the order data changed
 *  rule fires, task resolved          -> REOPEN only if the order data changed since; else leave resolved
 *  rule no longer fires, task open    -> AUTO-RESOLVE only if the order data changed (e.g. now delivered)
 *  rule no longer fires, data same    -> leave alone (a config change or disabled rule never
 *                                        silently closes work someone is doing)
 * So uploading the same file twice changes nothing at all.
 */

const keyOf = (orderId, ruleType) => `${orderId}|${ruleType}`;

const snapshot = (order) => ({
  customer: { name: order.customerName, phone: order.phone },
  orderValue: order.orderValue,
  orderDate: order.orderDate,
  paymentType: order.paymentType,
  orderStatus: order.status,
});

function newTaskDocument(order, exception, now) {
  return {
    orderId: order.orderId,
    order: order._id,
    ruleType: exception.ruleType,
    reason: exception.reason,
    priority: exception.priority,
    priorityRank: PRIORITY_RANK[exception.priority],
    actionRequired: exception.actionRequired,
    deadline: exception.deadline,
    ...snapshot(order),
    assignedTo: order.assignedTo ?? null,
    status: TASK_STATUS.OPEN,
    detectedAt: now,
    lastDetectedAt: now,
    sourceHash: order.sourceHash,
  };
}

async function loadNames(userIds, session) {
  const users = await User.find({ _id: { $in: userIds } })
    .select('name employeeCode')
    .session(session)
    .lean();
  return new Map(users.map((u) => [u._id.toString(), u]));
}

/**
 * @param {Array<{ order, exceptions }>} evaluations output of engine.evaluate for one chunk
 * @param {{ now: Date, actor: {id, name}, note: string, session }} ctx
 */
export async function syncTasks(evaluations, { now, actor, note, session }) {
  const counts = { created: 0, reopened: 0, autoResolved: 0, refreshed: 0, unchanged: 0 };
  const createdByRule = {};
  const audits = [];

  const existing = await Task.find({ orderId: { $in: evaluations.map((e) => e.order.orderId) } })
    .session(session)
    .lean();
  const byKey = new Map(existing.map((t) => [keyOf(t.orderId, t.ruleType), t]));
  const byOrder = Map.groupBy(existing, (t) => t.orderId);

  const toCreate = [];
  const toTouch = [];
  const toRefresh = [];
  const toReopen = [];
  const toAutoResolve = [];

  for (const { order, exceptions } of evaluations) {
    const firing = new Set();

    for (const exception of exceptions) {
      firing.add(exception.ruleType);
      const task = byKey.get(keyOf(order.orderId, exception.ruleType));
      const dataChanged = task && task.sourceHash !== order.sourceHash;

      if (!task) toCreate.push({ order, exception });
      else if (task.status === TASK_STATUS.RESOLVED) {
        if (dataChanged) toReopen.push({ task, order, exception });
        else counts.unchanged += 1;
      } else if (dataChanged) toRefresh.push({ task, order, exception });
      else toTouch.push(task._id);
    }

    for (const task of byOrder.get(order.orderId) ?? []) {
      if (firing.has(task.ruleType) || !UNRESOLVED_STATUSES.includes(task.status)) continue;
      if (task.sourceHash !== order.sourceHash) toAutoResolve.push({ task, order });
      else counts.unchanged += 1;
    }
  }

  // --- CREATE: upsert keyed on the unique index. If another process inserted the same task a
  // moment earlier, the upsert matches it instead of inserting a duplicate.
  if (toCreate.length) {
    const result = await Task.bulkWrite(
      toCreate.map(({ order, exception }) => ({
        updateOne: {
          filter: { orderId: order.orderId, ruleType: exception.ruleType },
          update: { $setOnInsert: newTaskDocument(order, exception, now) },
          upsert: true,
        },
      })),
      { ordered: false, session },
    );

    const insertedAt = Object.entries(result.upsertedIds ?? {});
    const names = await loadNames(
      insertedAt.map(([index]) => toCreate[index].order.assignedTo).filter(Boolean),
      session,
    );
    for (const [index, taskId] of insertedAt) {
      const { order, exception } = toCreate[index];
      const task = { _id: taskId, orderId: order.orderId, ruleType: exception.ruleType };
      counts.created += 1;
      createdByRule[exception.ruleType] = (createdByRule[exception.ruleType] ?? 0) + 1;

      audits.push(
        auditEntry({
          action: AUDIT_ACTION.TASK_CREATED,
          actor,
          task,
          newValue: {
            reason: exception.reason,
            priority: exception.priority,
            deadline: exception.deadline,
            status: TASK_STATUS.OPEN,
          },
          note,
        }),
      );
      const assignee = order.assignedTo && names.get(order.assignedTo.toString());
      audits.push(
        auditEntry({
          action: AUDIT_ACTION.TASK_ASSIGNED,
          actor,
          task,
          oldValue: { assignedTo: null },
          newValue: assignee
            ? { assignedTo: assignee._id, name: assignee.name, employeeCode: assignee.employeeCode }
            : { assignedTo: null, name: 'Unassigned' },
          note: assignee
            ? 'Assigned from the order file'
            : 'No matching employee - unassigned queue',
        }),
      );
    }
    counts.unchanged += toCreate.length - insertedAt.length;
  }

  // --- STILL FIRING, NOTHING CHANGED: just record that we saw it again.
  if (toTouch.length) {
    await Task.updateMany(
      { _id: { $in: toTouch } },
      { $set: { lastDetectedAt: now } },
      { session },
    );
    counts.unchanged += toTouch.length;
  }

  // --- STILL FIRING, ORDER DATA CHANGED: refresh what the employee sees; keep status/owner/deadline.
  if (toRefresh.length) {
    await Task.bulkWrite(
      toRefresh.map(({ task, order, exception }) => ({
        updateOne: {
          filter: { _id: task._id },
          update: {
            $set: {
              reason: exception.reason,
              ...snapshot(order),
              sourceHash: order.sourceHash,
              lastDetectedAt: now,
            },
          },
        },
      })),
      { ordered: false, session },
    );
    counts.refreshed += toRefresh.length;
  }

  // --- State transitions use a conditional update (status + hash in the filter): if two
  // evaluations race, only one wins and only the winner writes an audit entry.
  for (const { task, order, exception } of toReopen) {
    const reopened = await Task.findOneAndUpdate(
      { _id: task._id, status: TASK_STATUS.RESOLVED, sourceHash: task.sourceHash },
      {
        $set: {
          status: TASK_STATUS.OPEN,
          reason: exception.reason,
          priority: exception.priority,
          priorityRank: PRIORITY_RANK[exception.priority],
          actionRequired: exception.actionRequired,
          deadline: exception.deadline,
          ...snapshot(order),
          resolvedAt: null,
          resolvedBy: null,
          resolutionNote: null,
          slaBreached: false, // a new occurrence gets a fresh deadline
          sourceHash: order.sourceHash,
          lastDetectedAt: now,
        },
        $inc: { reopenCount: 1 },
      },
      { session },
    );
    if (!reopened) continue;
    counts.reopened += 1;
    audits.push(
      auditEntry({
        action: AUDIT_ACTION.REOPENED,
        actor,
        task,
        oldValue: { status: TASK_STATUS.RESOLVED },
        newValue: {
          status: TASK_STATUS.OPEN,
          reason: exception.reason,
          deadline: exception.deadline,
        },
        note: `${note}: order data changed and the problem is still present`,
      }),
    );
  }

  for (const { task, order } of toAutoResolve) {
    const resolutionNote = `Auto-resolved: condition no longer applies (order status now ${order.status ?? 'unknown'}, data status ${order.dataStatus})`;
    const resolved = await Task.findOneAndUpdate(
      { _id: task._id, status: { $in: UNRESOLVED_STATUSES }, sourceHash: task.sourceHash },
      {
        $set: {
          status: TASK_STATUS.RESOLVED,
          resolvedAt: now,
          resolvedBy: null,
          resolutionNote,
          ...snapshot(order),
          sourceHash: order.sourceHash,
        },
      },
      { session },
    );
    if (!resolved) continue;
    counts.autoResolved += 1;
    audits.push(
      auditEntry({
        action: AUDIT_ACTION.AUTO_RESOLVED,
        actor,
        task,
        oldValue: { status: task.status },
        newValue: { status: TASK_STATUS.RESOLVED },
        note: `${note}: ${resolutionNote}`,
      }),
    );
  }

  await recordAudit(audits, session);
  return { counts, createdByRule };
}
