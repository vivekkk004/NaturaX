export const TASK_STATUS = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
});
export const TASK_STATUS_VALUES = Object.values(TASK_STATUS);

/** "Unresolved" = still needs someone's attention. Overdue = unresolved and past its deadline. */
export const UNRESOLVED_STATUSES = Object.freeze([TASK_STATUS.OPEN, TASK_STATUS.IN_PROGRESS]);
