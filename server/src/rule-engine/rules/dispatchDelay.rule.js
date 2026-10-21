import { z } from 'zod';
import { BaseRule } from '../BaseRule.js';
import { ORDER_STATUS } from '../../constants/order.js';
import { PRIORITY, RULE_TYPE } from '../../constants/rules.js';
import { hoursBetween } from '../../utils/dates.js';
import { formatDuration } from '../format.js';

/**
 * PDF rule 2: flag confirmed orders that have not been dispatched within 24 hours.
 * The file has no "confirmed at" timestamp, so the clock starts at the order date
 * (documented assumption). The live-interview change "24h -> 12h" is `thresholdHours`.
 */
export class DispatchDelayRule extends BaseRule {
  static type = RULE_TYPE.DISPATCH_DELAY;
  static label = 'Dispatch delay';
  static description = 'Confirmed order not dispatched within the threshold after it was placed.';
  static paramsSchema = z.object({ thresholdHours: z.number().positive().max(720) });
  static paramFields = [{ key: 'thresholdHours', label: 'Must dispatch within', unit: 'hours' }];
  static defaults = {
    enabled: true,
    params: { thresholdHours: 24 },
    priority: PRIORITY.MEDIUM,
    deadlineHours: 8,
    action:
      'Escalate to the warehouse to pack and dispatch today. If stock or packing is the issue, ' +
      'inform the customer of the new dispatch date.',
  };

  matches(order, now) {
    return (
      order.status === ORDER_STATUS.CONFIRMED &&
      !order.dispatchDate &&
      hoursBetween(order.orderDate, now) > this.params.thresholdHours
    );
  }

  reason(order, now) {
    return (
      `Confirmed but not dispatched ${formatDuration(hoursBetween(order.orderDate, now))} after ` +
      `the order was placed (limit ${this.params.thresholdHours}h)`
    );
  }
}
