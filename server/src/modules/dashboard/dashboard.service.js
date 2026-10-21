import { IMPORT_STATUS } from '../../constants/importIssues.js';
import { DATA_STATUS } from '../../constants/order.js';
import { ROLES } from '../../constants/roles.js';
import { PRIORITY, RULE_TYPE_VALUES } from '../../constants/rules.js';
import { UNRESOLVED_STATUSES } from '../../constants/tasks.js';
import { ImportBatch } from '../../models/ImportBatch.js';
import { Order } from '../../models/Order.js';
import { Task } from '../../models/Task.js';
import { RULES_BY_TYPE } from '../../rule-engine/registry.js';
import { buildTaskFilter } from '../tasks/taskQuery.js';
import { employeeWorkload, overdueFlag } from '../tasks/taskStats.js';

const HIGH_PRIORITY_LIMIT = 10;

/** Order-level filter derived from the same dashboard filters (date + employee). */
function buildOrderFilter({ assignedTo, dateFrom, dateTo }, user) {
  const filter = {};
  if (dateFrom || dateTo) {
    filter.orderDate = {};
    if (dateFrom) filter.orderDate.$gte = dateFrom;
    if (dateTo) filter.orderDate.$lte = dateTo;
  }
  if (assignedTo) filter.assignedTo = assignedTo === 'unassigned' ? null : assignedTo;
  if (user.role === ROLES.EMPLOYEE) filter.assignedTo = user.id;
  return filter;
}

/**
 * Everything the dashboard shows, in one call, honouring the PDF's filters:
 * date (order date), exception type, employee and priority.
 *
 * - Order counts use date + employee (exception type/priority do not apply to orders).
 * - Task widgets use all four filters.
 * - One $facet aggregation computes every task widget in a single pass over the matching tasks.
 */
export async function getDashboard(query, user) {
  const now = new Date();
  const { ruleType, priority, assignedTo, dateFrom, dateTo } = query;
  const taskMatch = buildTaskFilter(
    { ruleType, priority, assignedTo, dateFrom, dateTo },
    user,
    now,
  );
  const orderMatch = buildOrderFilter({ assignedTo, dateFrom, dateTo }, user);
  const unresolved = { status: { $in: UNRESOLVED_STATUSES } };
  const isManager = user.role === ROLES.MANAGER;

  const [totalOrders, needsCorrection, [facets], employees, lastImport] = await Promise.all([
    Order.countDocuments(orderMatch),
    Order.countDocuments({ ...orderMatch, dataStatus: DATA_STATUS.NEEDS_CORRECTION }),
    Task.aggregate([
      { $match: taskMatch },
      {
        $facet: {
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          overdue: [{ $match: { ...unresolved, deadline: { $lt: now } } }, { $count: 'count' }],
          // "Orders requiring attention" = distinct orders with at least one unresolved task.
          ordersRequiringAttention: [
            { $match: unresolved },
            { $group: { _id: '$orderId' } },
            { $count: 'count' },
          ],
          byCategory: [
            {
              $group: {
                _id: '$ruleType',
                total: { $sum: 1 },
                unresolved: { $sum: { $cond: [{ $in: ['$status', UNRESOLVED_STATUSES] }, 1, 0] } },
                overdue: { $sum: overdueFlag(now) },
              },
            },
          ],
          byPriority: [
            { $match: unresolved },
            { $group: { _id: '$priority', count: { $sum: 1 } } },
          ],
          highPriority: [
            { $match: { ...unresolved, priority: PRIORITY.HIGH } },
            { $sort: { deadline: 1 } },
            { $limit: HIGH_PRIORITY_LIMIT },
            {
              $lookup: {
                from: 'users',
                localField: 'assignedTo',
                foreignField: '_id',
                as: 'assignee',
                pipeline: [{ $project: { name: 1, employeeCode: 1 } }],
              },
            },
          ],
        },
      },
    ]),
    employeeWorkload(taskMatch, now, { includeIdleEmployees: isManager && !assignedTo }),
    isManager
      ? ImportBatch.findOne({ status: IMPORT_STATUS.COMPLETED })
          .sort({ createdAt: -1 })
          .select('originalName createdAt summary taskSummary')
          .lean()
      : null,
  ]);

  const statusCount = (s) => facets.byStatus.find((b) => b._id === s)?.count ?? 0;
  const priorityCount = (p) => facets.byPriority.find((b) => b._id === p)?.count ?? 0;

  return {
    generatedAt: now,
    filters: { ruleType, priority, assignedTo, dateFrom, dateTo },
    totals: {
      totalOrders,
      needsCorrection,
      ordersRequiringAttention: facets.ordersRequiringAttention[0]?.count ?? 0,
      openTasks: statusCount('OPEN'),
      inProgressTasks: statusCount('IN_PROGRESS'),
      resolvedTasks: statusCount('RESOLVED'),
      unresolvedTasks: statusCount('OPEN') + statusCount('IN_PROGRESS'),
      overdueTasks: facets.overdue[0]?.count ?? 0,
      highPriorityUnresolved: priorityCount(PRIORITY.HIGH),
    },
    // Every category is listed (zeros included) so charts keep a stable shape.
    byCategory: RULE_TYPE_VALUES.map((type) => {
      const row = facets.byCategory.find((c) => c._id === type);
      return {
        ruleType: type,
        label: RULES_BY_TYPE.get(type)?.label ?? type,
        total: row?.total ?? 0,
        unresolved: row?.unresolved ?? 0,
        overdue: row?.overdue ?? 0,
      };
    }),
    byPriority: Object.values(PRIORITY).map((p) => ({ priority: p, unresolved: priorityCount(p) })),
    byEmployee: employees,
    highPriorityCases: facets.highPriority.map(({ assignee, ...task }) => ({
      id: task._id,
      orderId: task.orderId,
      ruleType: task.ruleType,
      reason: task.reason,
      actionRequired: task.actionRequired,
      status: task.status,
      deadline: task.deadline,
      isOverdue: task.deadline < now,
      customer: task.customer,
      orderValue: task.orderValue,
      assignedTo: assignee[0]
        ? { id: assignee[0]._id, name: assignee[0].name, employeeCode: assignee[0].employeeCode }
        : null,
    })),
    lastImport,
  };
}
