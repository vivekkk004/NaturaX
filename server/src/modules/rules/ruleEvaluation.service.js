import { withTransaction } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { SYSTEM_ACTOR } from '../../constants/audit.js';
import { DATA_STATUS, ORDER_STATUS } from '../../constants/order.js';
import { UNRESOLVED_STATUSES } from '../../constants/tasks.js';
import { Order } from '../../models/Order.js';
import { Task } from '../../models/Task.js';
import { buildRules, evaluate } from '../../rule-engine/engine.js';
import { syncTasks } from '../tasks/taskSync.service.js';
import { loadRuleConfigs } from './ruleConfig.service.js';

const CHUNK_SIZE = 500;

// Orders in these states can still raise an exception. Delivered/cancelled orders are only
// re-checked if they still have an open task (so it can auto-resolve).
const ACTIVE_ORDER_STATUSES = [
  ORDER_STATUS.UNCONFIRMED,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.DISPATCHED,
  ORDER_STATUS.DELIVERY_FAILED,
];

// Runs are serialised inside this process (an import and the scheduler never interleave).
// Across processes, the unique index + conditional updates keep the data correct.
let queue = Promise.resolve();
function runExclusive(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/**
 * Evaluates every relevant order against the current rule configs and syncs tasks.
 * Triggered by: an import, the scheduler, or a manager clicking "Run rules now".
 *
 * @param {{ now?: Date, actor?: {id, name}, note?: string }} options
 *   `now` is injectable so the same data always gives the same result (demos, tests).
 */
export function runRuleEvaluation({
  now = new Date(),
  actor = SYSTEM_ACTOR,
  note = 'Rule evaluation',
} = {}) {
  return runExclusive(async () => {
    const startedAt = Date.now();
    const rules = buildRules(await loadRuleConfigs());

    // Remember SLA misses permanently, even if the task is later reassigned with a new deadline.
    await Task.updateMany(
      { status: { $in: UNRESOLVED_STATUSES }, deadline: { $lt: now }, slaBreached: false },
      { $set: { slaBreached: true } },
    );

    const ordersWithOpenTasks = await Task.distinct('order', {
      status: { $in: UNRESOLVED_STATUSES },
    });
    const cursor = Order.find({
      $or: [
        { dataStatus: DATA_STATUS.NEEDS_CORRECTION },
        { status: { $in: ACTIVE_ORDER_STATUSES } },
        { _id: { $in: ordersWithOpenTasks } },
      ],
    })
      .sort({ _id: 1 })
      .lean()
      .cursor({ batchSize: CHUNK_SIZE });

    const summary = {
      asOf: now,
      evaluatedOrders: 0,
      created: 0,
      reopened: 0,
      autoResolved: 0,
      refreshed: 0,
      unchanged: 0,
      createdByRule: {},
    };

    // Process in chunks: bounded memory for big datasets, one transaction per chunk.
    const processChunk = async (orders) => {
      const evaluations = evaluate(orders, rules, now);
      const { counts, createdByRule } = await withTransaction((session) =>
        syncTasks(evaluations, { now, actor, note, session }),
      );
      summary.evaluatedOrders += orders.length;
      for (const [key, value] of Object.entries(counts)) summary[key] += value;
      for (const [ruleType, n] of Object.entries(createdByRule)) {
        summary.createdByRule[ruleType] = (summary.createdByRule[ruleType] ?? 0) + n;
      }
    };

    let chunk = [];
    for await (const order of cursor) {
      chunk.push(order);
      if (chunk.length === CHUNK_SIZE) {
        await processChunk(chunk);
        chunk = [];
      }
    }
    if (chunk.length) await processChunk(chunk);

    summary.durationMs = Date.now() - startedAt;
    logger.info({ ...summary, trigger: note }, 'Rule evaluation finished');
    return summary;
  });
}
