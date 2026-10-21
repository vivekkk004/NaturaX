/** One value per exception category. A task is unique per (orderId, ruleType). */
export const RULE_TYPE = Object.freeze({
  UNCONFIRMED_ORDER: 'UNCONFIRMED_ORDER',
  DISPATCH_DELAY: 'DISPATCH_DELAY',
  SHIPMENT_DELAY: 'SHIPMENT_DELAY',
  FAILED_DELIVERY: 'FAILED_DELIVERY',
  HIGH_VALUE_DELAY: 'HIGH_VALUE_DELAY',
  DATA_CORRECTION: 'DATA_CORRECTION',
});
export const RULE_TYPE_VALUES = Object.values(RULE_TYPE);

export const PRIORITY = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' });
export const PRIORITY_VALUES = Object.values(PRIORITY);
