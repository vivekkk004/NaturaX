import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('must be a valid email')),
  // No strength rules on login - only on creation. Login just compares.
  password: z.string().min(1, 'is required').max(200),
});
