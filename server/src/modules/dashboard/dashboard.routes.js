import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { taskFilterFields } from '../tasks/task.validation.js';
import * as dashboardController from './dashboard.controller.js';

const router = Router();

// The PDF's dashboard filters: date, exception type, employee, priority.
const dashboardQuerySchema = z.object({
  ruleType: taskFilterFields.ruleType,
  priority: taskFilterFields.priority,
  assignedTo: taskFilterFields.assignedTo,
  dateFrom: taskFilterFields.dateFrom,
  dateTo: taskFilterFields.dateTo,
});

// Both roles: managers see everything, employees see their own numbers.
router.get(
  '/',
  authenticate,
  validate({ query: dashboardQuerySchema }),
  dashboardController.summary,
);

export default router;
