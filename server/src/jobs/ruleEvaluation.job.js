import cron from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { runRuleEvaluation } from '../modules/rules/ruleEvaluation.service.js';

/**
 * Re-runs the rules on a schedule (default every 15 minutes, IST).
 *
 * Why it is needed: several rules are about *time passing*, not about new data. An order that
 * was 1 hour unconfirmed at upload becomes "more than 2 hours unconfirmed" an hour later with
 * no new file. Without a scheduler it would only be flagged on the next upload - exactly the
 * "forgotten order" problem the system exists to prevent.
 */
export function startRuleEvaluationJob() {
  if (!env.RULE_ENGINE_CRON_ENABLED) {
    logger.info('Scheduled rule evaluation is disabled');
    return null;
  }

  const job = cron.schedule(
    env.RULE_ENGINE_CRON,
    async () => {
      try {
        await runRuleEvaluation({ note: 'Scheduled rule evaluation' });
      } catch (err) {
        // A failed run must not crash the server; the next tick simply tries again.
        logger.error({ err }, 'Scheduled rule evaluation failed');
      }
    },
    { name: 'rule-evaluation', timezone: 'Asia/Kolkata', noOverlap: true },
  );
  logger.info(`Scheduled rule evaluation: "${env.RULE_ENGINE_CRON}" (Asia/Kolkata)`);
  return job;
}
