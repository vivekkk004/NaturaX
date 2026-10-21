import { z } from 'zod';
import { PRIORITY_VALUES, RULE_TYPE_VALUES } from '../../constants/rules.js';
import { TASK_STATUS_VALUES } from '../../constants/tasks.js';
import { listQuerySchema } from '../../utils/pagination.js';
import { booleanString, dateRangeQuery, dateTimeString, objectId } from '../../utils/validation.js';

/** Filters shared by the task list, dashboard and reports. */
export const taskFilterFields = {
  status: z.enum([...TASK_STATUS_VALUES, 'UNRESOLVED']).optional(),
  ruleType: z.enum(RULE_TYPE_VALUES).optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  assignedTo: z.union([objectId, z.literal('unassigned')]).optional(),
  overdue: booleanString.optional(),
  search: z.string().trim().max(100).optional(),
  ...dateRangeQuery,
};

export const listTasksQuerySchema = listQuerySchema({
  sortFields: [
    'deadline',
    'priority',
    'detectedAt',
    'orderDate',
    'orderValue',
    'orderId',
    'updatedAt',
  ],
  defaultSort: 'deadline', // most urgent first
}).extend(taskFilterFields);

const note = z.string().trim().max(1000).optional();

export const updateStatusSchema = z.object({
  status: z.enum(TASK_STATUS_VALUES),
  note,
});

export const assignTaskSchema = z.object({
  assignedTo: objectId,
  // Optional explicit deadline; overdue tasks get a fresh one automatically if omitted.
  deadline: dateTimeString.optional(),
  note,
});
