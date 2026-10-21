import { z } from 'zod';
import { IMPORT_STATUS } from '../../constants/importIssues.js';
import { listQuerySchema } from '../../utils/pagination.js';
import { dateTimeString } from '../../utils/validation.js';

/**
 * Optional `asOf` form field: the "current time" used to evaluate the file. Lets a demo or test
 * replay a sample file deterministically, e.g. asOf=2026-10-20T18:00 (IST).
 */
export const importBodySchema = z.object({
  asOf: dateTimeString.optional(),
});

export const listImportsQuerySchema = listQuerySchema({
  sortFields: ['createdAt', 'originalName'],
  defaultSort: '-createdAt',
}).extend({
  status: z.enum(Object.values(IMPORT_STATUS)).optional(),
});
