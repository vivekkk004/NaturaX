import { z } from 'zod';
import { BaseRule } from '../BaseRule.js';
import { ORDER_STATUS } from '../../constants/order.js';
import { PRIORITY, RULE_TYPE } from '../../constants/rules.js';
import { hoursBetween } from '../../utils/dates.js';
import { formatDuration, formatRupees } from '../format.js';

const FINISHED = [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED];

/**
 * PDF rule 5: flag orders worth more than ₹5,000 that remain undelivered beyond their
 * expected delivery date. Applies to any unfinished status (confirmed, dispatched, failed),
 * but only when an expected delivery date exists - without it the rule cannot be judged.
 */
export class HighValueDelayRule extends BaseRule {
  static type = RULE_TYPE.HIGH_VALUE_DELAY;
  static label = 'High-value order delayed';
  static description =
    'Order above the amount threshold still undelivered after its expected delivery date.';
  static paramsSchema = z.object({ amountThreshold: z.number().positive().max(10_000_000) });
  static paramFields = [{ key: 'amountThreshold', label: 'Order value above', unit: '₹' }];
  static defaults = {
    enabled: true,
    params: { amountThreshold: 5000 },
    priority: PRIORITY.HIGH,
    deadlineHours: 4,
    action:
      'Priority escalation: raise an urgent ticket with the courier and call the customer ' +
      'proactively with a confirmed delivery date.',
  };

  matches(order, now) {
    return (
      order.orderValue > this.params.amountThreshold &&
      !FINISHED.includes(order.status) &&
      Boolean(order.expectedDeliveryDate) &&
      now > order.expectedDeliveryDate
    );
  }

  reason(order, now) {
    return (
      `High-value order ${formatRupees(order.orderValue)} (above ` +
      `${formatRupees(this.params.amountThreshold)}) undelivered ` +
      `${formatDuration(hoursBetween(order.expectedDeliveryDate, now))} past expected delivery`
    );
  }
}
