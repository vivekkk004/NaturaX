import mongoose from 'mongoose';
import { PRIORITY_VALUES, RULE_TYPE_VALUES } from '../constants/rules.js';
import { toJSONPlugin } from './plugins/toJSON.js';

/**
 * The live, manager-editable configuration of each rule. This collection - not the code - is
 * the source of truth: "change the dispatch deadline from 24h to 12h" is one field update here.
 * `params` is validated against the rule's own Zod schema in the rules service.
 */
const ruleConfigSchema = new mongoose.Schema(
  {
    ruleType: { type: String, enum: RULE_TYPE_VALUES, required: true, unique: true },
    enabled: { type: Boolean, default: true },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    priority: { type: String, enum: PRIORITY_VALUES, required: true },
    deadlineHours: { type: Number, required: true, min: 0.25, max: 720 },
    action: { type: String, required: true, maxlength: 500 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false }, // keep `params: {}` for rules without parameters
);

ruleConfigSchema.plugin(toJSONPlugin);

export const RuleConfig = mongoose.model('RuleConfig', ruleConfigSchema);
