import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTION } from '../../constants/audit.js';
import { ROLES } from '../../constants/roles.js';
import { TASK_STATUS } from '../../constants/tasks.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../errors/index.js';
import { AuditLog } from '../../models/AuditLog.js';
import { RuleConfig } from '../../models/RuleConfig.js';
import { Task } from '../../models/Task.js';
import { User } from '../../models/User.js';
import { formatDuration } from '../../rule-engine/format.js';
import { addHours, formatIst, hoursBetween } from '../../utils/dates.js';
import { paginate } from '../../utils/pagination.js';
import { auditEntry, recordAudit } from '../audit/audit.service.js';
import { buildTaskFilter, taskScope } from './taskQuery.js';

const PEOPLE = [
  { path: 'assignedTo', select: 'name employeeCode' },
  { path: 'resolvedBy', select: 'name employeeCode' },
];
const DEFAULT_DEADLINE_HOURS = 24;

/**
 * Who may move a task from which status to which. Employees work their own tasks forward;
 * only a manager can reopen a resolved task.
 */
const TRANSITIONS = {
  [ROLES.EMPLOYEE]: {
    OPEN: ['IN_PROGRESS', 'RESOLVED'],
    IN_PROGRESS: ['OPEN', 'RESOLVED'],
    RESOLVED: [],
  },
  [ROLES.MANAGER]: {
    OPEN: ['IN_PROGRESS', 'RESOLVED'],
    IN_PROGRESS: ['OPEN', 'RESOLVED'],
    RESOLVED: ['OPEN', 'IN_PROGRESS'],
  },
};

export async function listTasks(query, user) {
  const { page, limit, sort } = query;
  const filter = buildTaskFilter(query, user);
  return paginate(
    Task,
    filter,
    { page, limit, sort: sort.replace('priority', 'priorityRank') },
    {
      populate: PEOPLE,
    },
  );
}

export async function getTask(id, user) {
  const task = await Task.findOne({ _id: id, ...taskScope(user) }).populate(PEOPLE);
  // 404 (not 403) for someone else's task: don't reveal that it exists.
  if (!task) throw new NotFoundError('Task not found');
  return task;
}

export async function getTaskHistory(id, user) {
  await getTask(id, user); // access check
  return AuditLog.find({ task: id }).sort({ createdAt: 1, _id: 1 });
}

/**
 * Status change + its audit entry in one transaction.
 * The update is conditional on the status we read ("optimistic locking"): if someone else
 * changed the task in the meantime, nothing is written and the caller gets 409.
 */
export async function updateTaskStatus(id, { status, note }, actor) {
  const updated = await withTransaction(async (session) => {
    const task = await Task.findOne({ _id: id, ...taskScope(actor) }).session(session);
    if (!task) throw new NotFoundError('Task not found');
    if (task.status === status) throw new BadRequestError(`Task is already ${status}`);
    if (!TRANSITIONS[actor.role][task.status].includes(status)) {
      throw new BadRequestError(
        task.status === TASK_STATUS.RESOLVED
          ? 'Only a manager can reopen a resolved task'
          : `Cannot change status from ${task.status} to ${status}`,
      );
    }

    const now = new Date();
    const changes = { status };
    if (status === TASK_STATUS.RESOLVED) {
      Object.assign(changes, {
        resolvedAt: now,
        resolvedBy: actor.id,
        resolutionNote: note ?? null,
      });
    } else if (task.status === TASK_STATUS.RESOLVED) {
      Object.assign(changes, { resolvedAt: null, resolvedBy: null, resolutionNote: null });
    }

    const result = await Task.findOneAndUpdate(
      { _id: task._id, status: task.status },
      { $set: changes },
      { returnDocument: 'after', session },
    );
    if (!result) throw new ConflictError('Task was changed by someone else - reload and try again');

    await recordAudit(
      [
        auditEntry({
          action: AUDIT_ACTION.STATUS_CHANGED,
          actor,
          task: result,
          oldValue: { status: task.status },
          newValue: { status },
          note: note ?? null,
        }),
      ],
      session,
    );
    return result;
  });
  return updated.populate(PEOPLE);
}

/**
 * Manager assigns or reassigns a task (live challenge 5: "reassign an overdue task").
 *
 * - If the task is overdue, the new owner gets a fresh deadline (now + the rule's deadline hours,
 *   or an explicit one), because inheriting a deadline that has already passed is meaningless.
 * - `slaBreached` is set to true and stays true: the SLA miss is still counted in metrics.
 * - Task update and audit entry (old -> new owner and deadline) are one transaction.
 */
export async function assignTask(id, { assignedTo, deadline, note }, actor) {
  const updated = await withTransaction(async (session) => {
    const task = await Task.findById(id).session(session);
    if (!task) throw new NotFoundError('Task not found');
    if (task.status === TASK_STATUS.RESOLVED) {
      throw new BadRequestError('Resolved tasks cannot be reassigned - reopen the task first');
    }

    const assignee = await User.findById(assignedTo).session(session);
    if (!assignee || !assignee.isActive) {
      throw new BadRequestError('Assignee not found or deactivated');
    }
    if (task.assignedTo?.equals(assignee._id)) {
      throw new BadRequestError(`Task is already assigned to ${assignee.name}`);
    }

    const now = new Date();
    const wasOverdue = task.deadline < now;
    let newDeadline = deadline ?? task.deadline;
    if (!deadline && wasOverdue) {
      const config = await RuleConfig.findOne({ ruleType: task.ruleType }).session(session).lean();
      newDeadline = addHours(now, config?.deadlineHours ?? DEFAULT_DEADLINE_HOURS);
    }
    if (newDeadline <= now) throw new BadRequestError('The deadline must be in the future');

    const previous = task.assignedTo
      ? await User.findById(task.assignedTo).select('name employeeCode').session(session).lean()
      : null;

    const result = await Task.findOneAndUpdate(
      { _id: task._id, assignedTo: task.assignedTo, status: task.status },
      {
        $set: {
          assignedTo: assignee._id,
          deadline: newDeadline,
          ...(wasOverdue && { slaBreached: true }),
        },
      },
      { returnDocument: 'after', session },
    );
    if (!result) throw new ConflictError('Task was changed by someone else - reload and try again');

    const context = wasOverdue
      ? `Task was overdue by ${formatDuration(hoursBetween(task.deadline, now))}; ` +
        `new deadline ${formatIst(newDeadline)}; SLA breach kept on record`
      : null;
    await recordAudit(
      [
        auditEntry({
          action: previous ? AUDIT_ACTION.REASSIGNED : AUDIT_ACTION.TASK_ASSIGNED,
          actor,
          task: result,
          oldValue: {
            assignedTo: previous?._id ?? null,
            name: previous?.name ?? 'Unassigned',
            deadline: task.deadline,
            overdue: wasOverdue,
          },
          newValue: {
            assignedTo: assignee._id,
            name: assignee.name,
            employeeCode: assignee.employeeCode,
            deadline: newDeadline,
          },
          note: [note, context].filter(Boolean).join(' | ') || null,
        }),
      ],
      session,
    );
    return result;
  });
  return updated.populate(PEOPLE);
}
