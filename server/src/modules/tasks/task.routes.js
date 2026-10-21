import { Router } from 'express';
import { ROLES } from '../../constants/roles.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParamSchema } from '../../utils/validation.js';
import { assignTaskSchema, listTasksQuerySchema, updateStatusSchema } from './task.validation.js';
import * as taskController from './task.controller.js';

const router = Router();

// Both roles use these routes; the service limits employees to their own tasks.
router.use(authenticate);

router.get('/', validate({ query: listTasksQuerySchema }), taskController.list);
router.get('/:id', validate({ params: idParamSchema }), taskController.getById);
router.get('/:id/audit', validate({ params: idParamSchema }), taskController.history);
router.patch(
  '/:id/status',
  validate({ params: idParamSchema, body: updateStatusSchema }),
  taskController.updateStatus,
);
// Only a manager can (re)assign work.
router.patch(
  '/:id/assign',
  authorize(ROLES.MANAGER),
  validate({ params: idParamSchema, body: assignTaskSchema }),
  taskController.assign,
);

export default router;
