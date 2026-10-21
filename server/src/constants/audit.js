/** Every kind of event the audit trail records. */
export const AUDIT_ACTION = Object.freeze({
  TASK_CREATED: 'TASK_CREATED',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  REASSIGNED: 'REASSIGNED',
  REOPENED: 'REOPENED',
  AUTO_RESOLVED: 'AUTO_RESOLVED',
  RULE_UPDATED: 'RULE_UPDATED',
});
export const AUDIT_ACTION_VALUES = Object.values(AUDIT_ACTION);

/** Name recorded when the system (scheduler, rule engine) acts without a human user. */
export const SYSTEM_ACTOR = Object.freeze({ id: null, name: 'System' });
