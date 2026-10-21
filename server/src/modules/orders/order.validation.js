import { z } from 'zod';
import {
  DATA_STATUS_VALUES,
  ORDER_STATUS_VALUES,
  PAYMENT_TYPE_VALUES,
} from '../../constants/order.js';
import { listQuerySchema } from '../../utils/pagination.js';
import { dateRangeQuery, objectId } from '../../utils/validation.js';

export const listOrdersQuerySchema = listQuerySchema({
  sortFields: ['orderDate', 'orderValue', 'orderId', 'expectedDeliveryDate', 'updatedAt'],
  defaultSort: '-orderDate',
}).extend({
  dataStatus: z.enum(DATA_STATUS_VALUES).optional(),
  status: z.enum(ORDER_STATUS_VALUES).optional(),
  paymentType: z.enum(PAYMENT_TYPE_VALUES).optional(),
  // An employee id, or "unassigned" for orders whose employee could not be matched.
  assignedTo: z.union([objectId, z.literal('unassigned')]).optional(),
  search: z.string().trim().max(100).optional(),
  ...dateRangeQuery,
});
