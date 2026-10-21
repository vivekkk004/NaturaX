import { Router } from 'express';
import { ROLES } from '../../constants/roles.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { evaluateBodySchema, ruleTypeParamSchema, updateRuleSchema } from './rule.validation.js';
import * as ruleController from './rule.controller.js';

const router = Router();

// Changing business rules and triggering evaluations is a manager responsibility.
router.use(authenticate, authorize(ROLES.MANAGER));

router.get('/', ruleController.list);
// Declared before "/:ruleType" so "evaluate" is never mistaken for a rule type.
router.post('/evaluate', validate({ body: evaluateBodySchema }), ruleController.evaluate);
router.get('/:ruleType', validate({ params: ruleTypeParamSchema }), ruleController.getOne);
router.patch(
  '/:ruleType',
  validate({ params: ruleTypeParamSchema, body: updateRuleSchema }),
  ruleController.update,
);

export default router;
