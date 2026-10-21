import { ROLES } from '../../constants/roles.js';
import { AuditLog } from '../../models/AuditLog.js';
import { Task } from '../../models/Task.js';
import { escapeRegex, paginate } from '../../utils/pagination.js';

/**
 * Builds one audit entry. `actor` is `{ id, name }` of the responsible user, or SYSTEM_ACTOR.
 * The name is stored as a snapshot so the trail stays readable even if the user is renamed.
 */
export function auditEntry({
  action,
  actor,
  task = null,
  ruleType = task?.ruleType ?? null,
  oldValue = null,
  newValue = null,
  note = null,
}) {
  return {
    action,
    task: task?._id ?? null,
    orderId: task?.orderId ?? null,
    ruleType,
    performedBy: actor.id ?? null,
    performedByName: actor.name,
    oldValue,
    newValue,
    note,
  };
}

/** Appends entries in the caller's session, so they commit or roll back with the change they describe. */
export async function recordAudit(entries, session = null) {
  if (entries.length === 0) return;
  await AuditLog.insertMany(entries, { session });
}

/**
 * Read side of the audit trail. Managers see everything; employees see the history of
 * tasks currently assigned to them (never rule changes or other people's tasks).
 */
export async function listAudit(query, user) {
  const { page, limit, sort, action, orderId, ruleType, taskId, performedBy, dateFrom, dateTo } =
    query;
  const filter = {};
  if (action) filter.action = action;
  if (ruleType) filter.ruleType = ruleType;
  if (taskId) filter.task = taskId;
  if (performedBy) filter.performedBy = performedBy === 'system' ? null : performedBy;
  if (orderId) filter.orderId = new RegExp(escapeRegex(orderId), 'i');
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = dateFrom;
    if (dateTo) filter.createdAt.$lte = dateTo;
  }

  if (user.role === ROLES.EMPLOYEE) {
    const ownTaskIds = await Task.distinct('_id', { assignedTo: user.id });
    filter.task = taskId
      ? { $in: ownTaskIds.filter((id) => id.equals(taskId)) }
      : { $in: ownTaskIds };
  }
  return paginate(AuditLog, filter, { page, limit, sort });
}
