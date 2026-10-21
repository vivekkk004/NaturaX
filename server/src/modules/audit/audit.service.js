import { AuditLog } from '../../models/AuditLog.js';

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
