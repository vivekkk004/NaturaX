import { z } from 'zod';
import { endOfIstDay, parseDateValue, startOfIstDay } from './dates.js';

/** Reusable Zod building blocks shared by several modules. */

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a valid id');

export const idParamSchema = z.object({ id: objectId });

/** Query-string booleans arrive as text: "true"/"false". */
export const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Any date/time format the importer accepts (IST unless an offset is given) -> Date. */
export const dateTimeString = z.string().transform((value, ctx) => {
  const parsed = parseDateValue(value);
  if (!parsed) {
    ctx.addIssue({
      code: 'custom',
      message: 'must be a valid date, e.g. 2026-10-20 or 2026-10-20T14:30',
    });
    return z.NEVER;
  }
  return parsed.date;
});

/** Inclusive date-range filter: ?dateFrom=2026-10-01&dateTo=2026-10-20 covers both whole IST days. */
export const dateRangeQuery = {
  dateFrom: dateTimeString.transform(startOfIstDay).optional(),
  dateTo: dateTimeString.transform(endOfIstDay).optional(),
};

export const passwordSchema = z
  .string()
  .min(8, 'must be at least 8 characters')
  .max(72, 'must be at most 72 characters') // bcrypt ignores bytes beyond 72
  .regex(/[A-Za-z]/, 'must contain a letter')
  .regex(/\d/, 'must contain a number');
