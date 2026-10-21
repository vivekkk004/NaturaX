/** Display labels for the API's enum values. Mirrors server/src/constants. */

export const ROLES = { MANAGER: 'MANAGER', EMPLOYEE: 'EMPLOYEE' };

export const RULE_LABELS = {
  UNCONFIRMED_ORDER: 'Unconfirmed order',
  DISPATCH_DELAY: 'Dispatch delay',
  SHIPMENT_DELAY: 'Shipment delay',
  FAILED_DELIVERY: 'Failed delivery',
  HIGH_VALUE_DELAY: 'High-value delayed',
  DATA_CORRECTION: 'Data correction',
};

export const TASK_STATUS_LABELS = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
};

export const PRIORITY_LABELS = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

export const ORDER_STATUS_LABELS = {
  UNCONFIRMED: 'Unconfirmed',
  CONFIRMED: 'Confirmed',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  DELIVERY_FAILED: 'Delivery failed',
  CANCELLED: 'Cancelled',
};

export const DATA_STATUS_LABELS = { VALID: 'Valid', NEEDS_CORRECTION: 'Needs correction' };

export const PAYMENT_LABELS = { PREPAID: 'Prepaid', COD: 'COD' };

export const AUDIT_ACTION_LABELS = {
  TASK_CREATED: 'Task created',
  TASK_ASSIGNED: 'Assigned',
  STATUS_CHANGED: 'Status changed',
  REASSIGNED: 'Reassigned',
  REOPENED: 'Reopened',
  AUTO_RESOLVED: 'Auto-resolved',
  RULE_UPDATED: 'Rule updated',
};

export const REPORT_SECTION_LABELS = {
  new: 'New exceptions',
  unresolved: 'Unresolved',
  overdue: 'Overdue',
  'high-priority': 'High priority',
  'employee-pending': 'Employee-wise pending',
};

/** Turns a label map into <select> options. */
export const toOptions = (labels) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
export const MAX_UPLOAD_MB = 5;
