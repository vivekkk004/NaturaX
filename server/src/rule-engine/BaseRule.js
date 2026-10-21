import { z } from 'zod';
import { DATA_STATUS } from '../constants/order.js';
import { addHours } from '../utils/dates.js';

/**
 * Contract every rule implements. A rule is a small class:
 *   static type / label / description   - identity (shown in the UI)
 *   static paramsSchema                  - Zod schema for its configurable thresholds
 *   static paramFields                   - how the UI should label those thresholds
 *   static defaults                      - first-run configuration (DB is the source of truth after that)
 *   matches(order, now)                  - the business condition
 *   reason(order, now)                   - human explanation with the actual numbers
 *
 * A rule instance is created with its *current* config from the database, so changing a
 * threshold in the Rule Settings page changes behaviour on the next evaluation - no deploy.
 * Rules are pure: they never read the clock (`now` is passed in) or the database.
 */
export class BaseRule {
  static type = '';
  static label = '';
  static description = '';
  static paramsSchema = z.object({});
  static paramFields = [];
  static defaults = {
    enabled: true,
    params: {},
    priority: 'MEDIUM',
    deadlineHours: 24,
    action: '',
  };

  /** @param {{ params: object, priority: string, deadlineHours: number, action: string }} config */
  constructor(config) {
    this.config = config;
    this.params = config.params ?? {};
  }

  get type() {
    return this.constructor.type;
  }

  /**
   * Business rules only look at orders whose data is trustworthy. The PDF: "Do not flag an order
   * if the required information is unavailable; identify it as needing data correction instead."
   */
  applies(order, now) {
    return order.dataStatus === DATA_STATUS.VALID && this.matches(order, now);
  }

  matches() {
    throw new Error(`${this.constructor.name} must implement matches(order, now)`);
  }

  reason() {
    throw new Error(`${this.constructor.name} must implement reason(order, now)`);
  }

  /** The exception: why, how urgent, what to do, and by when. */
  buildException(order, now) {
    return {
      ruleType: this.type,
      reason: this.reason(order, now),
      priority: this.config.priority,
      actionRequired: this.config.action,
      deadline: addHours(now, this.config.deadlineHours),
    };
  }
}
