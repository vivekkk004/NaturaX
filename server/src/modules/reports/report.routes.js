import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '../../constants/roles.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { startOfIstDay } from '../../utils/dates.js';
import { dateTimeString } from '../../utils/validation.js';
import { REPORT_SECTIONS } from './report.service.js';
import * as reportController from './report.controller.js';

const router = Router();

const dailyQuery = z.object({
  date: dateTimeString.transform(startOfIstDay).optional(), // default: today (IST)
});
const dailyCsvQuery = dailyQuery.extend({
  section: z.enum(['all', ...REPORT_SECTIONS]).default('all'),
});

router.use(authenticate, authorize(ROLES.MANAGER));

router.get('/daily', validate({ query: dailyQuery }), reportController.daily);
router.get('/daily/csv', validate({ query: dailyCsvQuery }), reportController.dailyCsv);

export default router;
