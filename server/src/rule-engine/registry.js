import { UnconfirmedOrderRule } from './rules/unconfirmedOrder.rule.js';
import { DispatchDelayRule } from './rules/dispatchDelay.rule.js';
import { ShipmentDelayRule } from './rules/shipmentDelay.rule.js';
import { FailedDeliveryRule } from './rules/failedDelivery.rule.js';
import { HighValueDelayRule } from './rules/highValueDelay.rule.js';
import { DataCorrectionRule } from './rules/dataCorrection.rule.js';

/**
 * The list of every rule the engine knows. Adding a rule =
 *   1. create rules/<name>.rule.js extending BaseRule
 *   2. add its type to constants/rules.js and its class here
 * Its default config is inserted into the DB automatically on the next start.
 */
export const RULE_CLASSES = [
  UnconfirmedOrderRule,
  DispatchDelayRule,
  ShipmentDelayRule,
  FailedDeliveryRule,
  HighValueDelayRule,
  DataCorrectionRule,
];

export const RULES_BY_TYPE = new Map(RULE_CLASSES.map((RuleClass) => [RuleClass.type, RuleClass]));
