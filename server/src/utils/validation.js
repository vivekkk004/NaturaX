import { z } from 'zod';

/** Reusable Zod building blocks shared by several modules. */

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a valid id');

export const idParamSchema = z.object({ id: objectId });

/** Query-string booleans arrive as text: "true"/"false". */
export const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

export const passwordSchema = z
  .string()
  .min(8, 'must be at least 8 characters')
  .max(72, 'must be at most 72 characters') // bcrypt ignores bytes beyond 72
  .regex(/[A-Za-z]/, 'must contain a letter')
  .regex(/\d/, 'must contain a number');
