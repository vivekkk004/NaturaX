import { z } from 'zod';
import { ROLE_VALUES } from '../../constants/roles.js';
import { listQuerySchema } from '../../utils/pagination.js';
import { booleanString, passwordSchema } from '../../utils/validation.js';

const employeeCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,20}$/, 'must be 3-20 letters, digits or dashes (e.g. EMP001)');

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email('must be a valid email')),
  employeeCode,
  password: passwordSchema,
  role: z.enum(ROLE_VALUES).default('EMPLOYEE'),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    role: z.enum(ROLE_VALUES),
    isActive: z.boolean(),
    password: passwordSchema,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Provide at least one field' });

export const listUsersQuerySchema = listQuerySchema({
  sortFields: ['name', 'email', 'employeeCode', 'createdAt'],
  defaultSort: 'name',
}).extend({
  role: z.enum(ROLE_VALUES).optional(),
  isActive: booleanString.optional(),
  search: z.string().trim().max(100).optional(),
});
