import { z } from 'zod';
import { BaseRule } from '../BaseRule.js';
import { ORDER_STATUS } from '../../constants/order.js';
import { PRIORITY, RULE_TYPE } from '../../constants/rules.js';
import { addHours, formatIst, hoursBetween } from '../../utils/dates.js';
import { formatDuration } from '../format.js';

/** PDF rule 3: flag dispatched orders whose expected delivery date has passed without delivery. */
export class ShipmentDelayRule extends BaseRule {
  static type = RULE_TYPE.SHIPMENT_DELAY;
  static label = 'Shipment delay';
  static description = 'Dispatched order still not delivered after its expected delivery date.';
  static paramsSchema = z.object({ graceHours: z.number().min(0).max(720) });
  static paramFields = [
    { key: 'graceHours', label: 'Grace period after expected delivery', unit: 'hours' },
  ];
  static defaults = {
    enabled: true,
    params: { graceHours: 0 },
    priority: PRIORITY.MEDIUM,
    deadlineHours: 24,
    action:
      'Check the tracking status with the courier, get a firm delivery date and send the ' +
      'customer an updated ETA.',
  };

  matches(order, now) {
    return (
      order.status === ORDER_STATUS.DISPATCHED &&
      Boolean(order.expectedDeliveryDate) &&
      now > addHours(order.expectedDeliveryDate, this.params.graceHours)
    );
  }

  reason(order, now) {
    return (
      `In transit ${formatDuration(hoursBetween(order.expectedDeliveryDate, now))} past the ` +
      `expected delivery (${formatIst(order.expectedDeliveryDate)})`
    );
  }
}
