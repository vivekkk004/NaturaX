import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTION } from '../../constants/audit.js';
import { NotFoundError, ValidationError } from '../../errors/index.js';
import { RuleConfig } from '../../models/RuleConfig.js';
import { RULE_CLASSES, RULES_BY_TYPE } from '../../rule-engine/registry.js';
import { auditEntry, recordAudit } from '../audit/audit.service.js';

const EDITABLE_FIELDS = ['enabled', 'params', 'priority', 'deadlineHours', 'action'];

/**
 * Inserts the code defaults for any rule that has no config in the DB yet. `$setOnInsert`
 * means existing (possibly manager-edited) configs are never overwritten - after the first
 * start, the database is the source of truth.
 */
export async function ensureRuleConfigs() {
  if ((await RuleConfig.countDocuments()) >= RULE_CLASSES.length) return;
  await RuleConfig.bulkWrite(
    RULE_CLASSES.map((RuleClass) => ({
      updateOne: {
        filter: { ruleType: RuleClass.type },
        update: { $setOnInsert: { ruleType: RuleClass.type, ...RuleClass.defaults } },
        upsert: true,
      },
    })),
  );
}

/** Raw configs for the engine. */
export async function loadRuleConfigs() {
  await ensureRuleConfigs();
  return RuleConfig.find().lean();
}

/** Config + the rule's description from code, in the order the rules are registered. */
function present(config) {
  const RuleClass = RULES_BY_TYPE.get(config.ruleType);
  return {
    ruleType: config.ruleType,
    label: RuleClass.label,
    description: RuleClass.description,
    paramFields: RuleClass.paramFields,
    enabled: config.enabled,
    params: config.params,
    priority: config.priority,
    deadlineHours: config.deadlineHours,
    action: config.action,
    updatedBy: config.updatedBy ?? null,
    updatedAt: config.updatedAt,
  };
}

export async function listRuleConfigs() {
  await ensureRuleConfigs();
  const configs = await RuleConfig.find().populate('updatedBy', 'name').lean();
  const order = RULE_CLASSES.map((R) => R.type);
  return configs
    .filter((c) => RULES_BY_TYPE.has(c.ruleType))
    .sort((a, b) => order.indexOf(a.ruleType) - order.indexOf(b.ruleType))
    .map(present);
}

export async function getRuleConfig(ruleType) {
  await ensureRuleConfigs();
  const config = await RuleConfig.findOne({ ruleType }).populate('updatedBy', 'name').lean();
  if (!config || !RULES_BY_TYPE.has(ruleType)) throw new NotFoundError('Rule not found');
  return present(config);
}

/** Merges partial params onto the current ones and validates them with the rule's own schema. */
function validateParams(RuleClass, currentParams, incoming) {
  const merged = { ...currentParams, ...incoming };
  const result = RuleClass.paramsSchema.strict().safeParse(merged);
  if (!result.success) {
    throw new ValidationError(
      'Invalid rule parameters',
      result.error.issues.map((i) => ({
        location: 'body',
        field: ['params', ...i.path].join('.'),
        message: i.message,
      })),
    );
  }
  return result.data;
}

/**
 * The live-interview change "dispatch deadline 24h -> 12h":
 *   PATCH /api/rules/DISPATCH_DELAY  { "params": { "thresholdHours": 12 } }
 * Takes effect on the next evaluation (import, scheduled run or "Run rules now").
 * The change itself is audited with old -> new values.
 */
export async function updateRuleConfig(ruleType, changes, actor) {
  const RuleClass = RULES_BY_TYPE.get(ruleType);
  if (!RuleClass) throw new NotFoundError('Rule not found');
  await ensureRuleConfigs();

  await withTransaction(async (session) => {
    const config = await RuleConfig.findOne({ ruleType }).session(session);
    const before = Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, config[f]]));

    const next = { ...changes };
    if (changes.params) next.params = validateParams(RuleClass, config.params, changes.params);

    const changedFields = EDITABLE_FIELDS.filter(
      (f) => f in next && JSON.stringify(next[f]) !== JSON.stringify(before[f]),
    );
    if (changedFields.length === 0) return;

    config.set({ ...next, updatedBy: actor.id });
    config.markModified('params'); // Mixed type: tell Mongoose the object changed
    await config.save({ session });

    await recordAudit(
      [
        auditEntry({
          action: AUDIT_ACTION.RULE_UPDATED,
          actor,
          ruleType,
          oldValue: Object.fromEntries(changedFields.map((f) => [f, before[f]])),
          newValue: Object.fromEntries(changedFields.map((f) => [f, next[f]])),
          note: `Rule "${RuleClass.label}" updated`,
        }),
      ],
      session,
    );
  });

  return getRuleConfig(ruleType);
}
