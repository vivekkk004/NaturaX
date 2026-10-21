import mongoose from 'mongoose';
import { ROLES } from '../../constants/roles.js';
import { TASK_STATUS, UNRESOLVED_STATUSES } from '../../constants/tasks.js';
import { escapeRegex } from '../../utils/pagination.js';

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * One filter builder shared by the task list, the dashboard and the daily report, so the
 * same filter always means the same thing everywhere.
 *
 * ObjectIds are cast explicitly because aggregation pipelines (dashboard) - unlike find() -
 * do not cast strings to ObjectIds.
 *
 * @param {object} query  validated filters: status, ruleType, priority, assignedTo, overdue,
 *                        search, dateFrom/dateTo (order date)
 * @param {{ id: string, role: string }} user  employees are always limited to their own tasks
 * @param {Date} now      reference time for "overdue"
 */
export function buildTaskFilter(query, user, now = new Date()) {
  const filter = {};
  const { status, ruleType, priority, assignedTo, overdue, search, dateFrom, dateTo } = query;

  if (status === 'UNRESOLVED') filter.status = { $in: UNRESOLVED_STATUSES };
  else if (status) filter.status = status;
  if (ruleType) filter.ruleType = ruleType;
  if (priority) filter.priority = priority;
  if (assignedTo) filter.assignedTo = assignedTo === 'unassigned' ? null : toObjectId(assignedTo);

  if (overdue) {
    // Overdue only exists for unresolved tasks; an explicit RESOLVED status filter wins and finds none.
    filter.status =
      status === TASK_STATUS.RESOLVED ? status : (filter.status ?? { $in: UNRESOLVED_STATUSES });
    filter.deadline = { $lt: now };
  }

  if (dateFrom || dateTo) {
    filter.orderDate = {};
    if (dateFrom) filter.orderDate.$gte = dateFrom;
    if (dateTo) filter.orderDate.$lte = dateTo;
  }

  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { orderId: pattern },
      { 'customer.name': pattern },
      { 'customer.phone': pattern },
    ];
  }

  // Applied last: an employee can never widen their scope with a query parameter.
  if (user.role === ROLES.EMPLOYEE) filter.assignedTo = toObjectId(user.id);
  return filter;
}

/** Scope for reading a single task: employees only see tasks assigned to them. */
export function taskScope(user) {
  return user.role === ROLES.EMPLOYEE ? { assignedTo: user.id } : {};
}
