import { BaseRule } from '../BaseRule.js';
import { DATA_STATUS } from '../../constants/order.js';
import { SEVERITY } from '../../constants/importIssues.js';
import { PRIORITY, RULE_TYPE } from '../../constants/rules.js';

const MAX_REASON_LENGTH = 500;

/**
 * Not one of the PDF's five rules (agreed addition): an order with bad data is never flagged by
 * the business rules, so without this task it could be forgotten - the exact problem the
 * system exists to solve. It creates a low-priority "fix the data" task for the owner.
 */
export class DataCorrectionRule extends BaseRule {
  static type = RULE_TYPE.DATA_CORRECTION;
  static label = 'Data correction needed';
  static description =
    'Order data is incomplete or invalid, so the business rules cannot evaluate it.';
  static defaults = {
    enabled: true,
    params: {},
    priority: PRIORITY.LOW,
    deadlineHours: 24,
    action:
      'Correct the listed fields in the order sheet / source system and re-upload the file so ' +
      'the order can be checked.',
  };

  // Overrides the base guard: this rule is the one that looks at NEEDS_CORRECTION orders.
  applies(order) {
    return order.dataStatus === DATA_STATUS.NEEDS_CORRECTION;
  }

  reason(order) {
    const errors = (order.dataIssues ?? [])
      .filter((i) => i.severity === SEVERITY.ERROR)
      .map((i) => i.message);
    const text = `Data needs correction: ${errors.join('; ') || 'invalid data'}`;
    return text.length > MAX_REASON_LENGTH ? `${text.slice(0, MAX_REASON_LENGTH - 1)}…` : text;
  }
}
