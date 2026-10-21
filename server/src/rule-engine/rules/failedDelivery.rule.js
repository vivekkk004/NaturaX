import { BaseRule } from '../BaseRule.js';
import { ORDER_STATUS, PAYMENT_TYPE } from '../../constants/order.js';
import { PRIORITY, RULE_TYPE } from '../../constants/rules.js';

/** PDF rule 4: flag shipments with a failed delivery attempt for immediate follow-up. */
export class FailedDeliveryRule extends BaseRule {
  static type = RULE_TYPE.FAILED_DELIVERY;
  static label = 'Failed delivery';
  static description =
    'A delivery attempt failed - needs immediate follow-up before the parcel is returned.';
  static defaults = {
    enabled: true,
    params: {},
    priority: PRIORITY.HIGH,
    deadlineHours: 4,
    action:
      'Call the customer today to confirm address and availability, then request a re-attempt ' +
      'from the courier so the parcel is not returned to origin (RTO).',
  };

  matches(order) {
    return order.status === ORDER_STATUS.DELIVERY_FAILED;
  }

  reason(order) {
    const cod = order.paymentType === PAYMENT_TYPE.COD ? ' (COD - risk of return)' : '';
    return `Delivery attempt failed: courier status "${order.rawStatus ?? order.status}"${cod}`;
  }
}
