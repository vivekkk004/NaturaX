import { z } from 'zod';
import { AUDIT_ACTION_VALUES } from '../../constants/audit.js';
import { RULE_TYPE_VALUES } from '../../constants/rules.js';
import { listQuerySchema } from '../../utils/pagination.js';
import { dateRangeQuery, objectId } from '../../utils/validation.js';

export const listAuditQuerySchema = listQuerySchema({
  sortFields: ['createdAt'],
  defaultSort: '-createdAt',
}).extend({
  action: z.enum(AUDIT_ACTION_VALUES).optional(),
  orderId: z.string().trim().max(50).optional(),
  ruleType: z.enum(RULE_TYPE_VALUES).optional(),
  taskId: objectId.optional(),
  performedBy: z.union([objectId, z.literal('system')]).optional(),
  ...dateRangeQuery, // on the entry's timestamp
});
