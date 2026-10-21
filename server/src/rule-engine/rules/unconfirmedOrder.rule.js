import { z } from 'zod';
import { BaseRule } from '../BaseRule.js';
import { ORDER_STATUS } from '../../constants/order.js';
import { PRIORITY, RULE_TYPE } from '../../constants/rules.js';
import { hoursBetween } from '../../utils/dates.js';
import { formatDuration } from '../format.js';

/** PDF rule 1: flag orders that have remained unconfirmed for more than 2 hours. */
export class UnconfirmedOrderRule extends BaseRule {
  static type = RULE_TYPE.UNCONFIRMED_ORDER;
  static label = 'Unconfirmed order';
  static description = 'Order is still unconfirmed longer than the threshold after it was placed.';
  static paramsSchema = z.object({ thresholdHours: z.number().positive().max(720) });
  static paramFields = [
    { key: 'thresholdHours', label: 'Unconfirmed for more than', unit: 'hours' },
  ];
  static defaults = {
    enabled: true,
    params: { thresholdHours: 2 },
    priority: PRIORITY.MEDIUM,
    deadlineHours: 4,
    action:
      'Call the customer to confirm the order. For COD, also confirm the address and that they ' +
      'will accept the parcel. Cancel after two unanswered attempts.',
  };

  matches(order, now) {
    return (
      order.status === ORDER_STATUS.UNCONFIRMED &&
      hoursBetween(order.orderDate, now) > this.params.thresholdHours
    );
  }

  reason(order, now) {
    return (
      `Order unconfirmed for ${formatDuration(hoursBetween(order.orderDate, now))} ` +
      `(limit ${this.params.thresholdHours}h)`
    );
  }
}
