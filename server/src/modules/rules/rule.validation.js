import { z } from 'zod';
import { PRIORITY_VALUES, RULE_TYPE_VALUES } from '../../constants/rules.js';
import { dateTimeString } from '../../utils/validation.js';

export const ruleTypeParamSchema = z.object({ ruleType: z.enum(RULE_TYPE_VALUES) });

// The shape of `params` differs per rule, so here we only require "name -> number";
// the rule's own Zod schema validates the exact keys and ranges in the service.
export const updateRuleSchema = z
  .object({
    enabled: z.boolean(),
    params: z.record(z.string(), z.number()),
    priority: z.enum(PRIORITY_VALUES),
    deadlineHours: z.number().min(0.25).max(720),
    action: z.string().trim().min(5).max(500),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Provide at least one field' });

export const evaluateBodySchema = z.object({
  asOf: dateTimeString.optional(),
});
