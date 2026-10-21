import * as ruleConfigService from './ruleConfig.service.js';
import { runRuleEvaluation } from './ruleEvaluation.service.js';

const actorOf = (req) => ({ id: req.user.id, name: req.user.name });

export async function list(_req, res) {
  res.json({ data: await ruleConfigService.listRuleConfigs() });
}

export async function getOne(req, res) {
  res.json({ data: await ruleConfigService.getRuleConfig(req.params.ruleType) });
}

export async function update(req, res) {
  res.json({
    data: await ruleConfigService.updateRuleConfig(req.params.ruleType, req.body, actorOf(req)),
  });
}

export async function evaluate(req, res) {
  const summary = await runRuleEvaluation({
    now: req.body.asOf ?? new Date(),
    actor: actorOf(req),
    note: 'Manual rule evaluation',
  });
  res.json({ data: summary });
}
