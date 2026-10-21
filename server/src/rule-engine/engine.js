import { RULES_BY_TYPE } from './registry.js';

/**
 * Turns stored rule configs into rule instances. Disabled rules are simply not built,
 * so they can never fire.
 * @param {Array<{ ruleType, enabled, params, priority, deadlineHours, action }>} configs
 */
export function buildRules(configs) {
  return configs
    .filter((config) => config.enabled && RULES_BY_TYPE.has(config.ruleType))
    .map((config) => new (RULES_BY_TYPE.get(config.ruleType))(config));
}

/** All exceptions one order raises right now. An order can raise several (e.g. delayed AND high value). */
export function evaluateOrder(order, rules, now) {
  return rules
    .filter((rule) => rule.applies(order, now))
    .map((rule) => rule.buildException(order, now));
}

/**
 * Pure evaluation of many orders: no database, no clock. Same input -> same output,
 * which is what makes the engine unit-testable and the sample data reproducible.
 * @returns {Array<{ order, exceptions }>}
 */
export function evaluate(orders, rules, now) {
  return orders.map((order) => ({ order, exceptions: evaluateOrder(order, rules, now) }));
}
