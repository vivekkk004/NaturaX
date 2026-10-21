import { ROLES } from '../../constants/roles.js';
import { PRIORITY } from '../../constants/rules.js';
import { TASK_STATUS, UNRESOLVED_STATUSES } from '../../constants/tasks.js';
import { Task } from '../../models/Task.js';
import { User } from '../../models/User.js';

/** Aggregation expression: 1 if the task is overdue at `now`, else 0. */
export const overdueFlag = (now) => ({
  $cond: [{ $and: [{ $in: ['$status', UNRESOLVED_STATUSES] }, { $lt: ['$deadline', now] }] }, 1, 0],
});

/**
 * Employee-wise pending work (dashboard widget + daily report section).
 * Counts unresolved tasks per owner; with `includeIdleEmployees`, active employees with zero
 * pending tasks are listed too (a manager wants to see who has capacity).
 * Unassigned tasks appear as one row with `employeeId: null`.
 */
export async function employeeWorkload(match, now, { includeIdleEmployees = false } = {}) {
  const rows = await Task.aggregate([
    { $match: { ...match, status: match.status ?? { $in: UNRESOLVED_STATUSES } } },
    {
      $group: {
        _id: '$assignedTo',
        open: { $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.OPEN] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.IN_PROGRESS] }, 1, 0] } },
        overdue: { $sum: overdueFlag(now) },
        highPriority: { $sum: { $cond: [{ $eq: ['$priority', PRIORITY.HIGH] }, 1, 0] } },
        total: { $sum: 1 },
      },
    },
  ]);

  const userFilter = includeIdleEmployees
    ? {
        $or: [
          { _id: { $in: rows.map((r) => r._id).filter(Boolean) } },
          { role: ROLES.EMPLOYEE, isActive: true },
        ],
      }
    : { _id: { $in: rows.map((r) => r._id).filter(Boolean) } };
  const users = await User.find(userFilter).select('name employeeCode').lean();
  const byId = new Map(rows.map((r) => [String(r._id), r]));

  const empty = { open: 0, inProgress: 0, overdue: 0, highPriority: 0, total: 0 };
  const result = users.map((u) => {
    const { _id, ...counts } = byId.get(String(u._id)) ?? { ...empty };
    return { employeeId: u._id, name: u.name, employeeCode: u.employeeCode, ...empty, ...counts };
  });
  const unassigned = byId.get('null');
  if (unassigned) {
    const { _id, ...counts } = unassigned;
    result.push({ employeeId: null, name: 'Unassigned', employeeCode: null, ...counts });
  }
  // Most loaded first: that is where a manager needs to act.
  return result.sort(
    (a, b) => b.overdue - a.overdue || b.total - a.total || a.name.localeCompare(b.name),
  );
}
