import cron from 'node-cron';
import { z } from 'zod';

/**
 * Every environment variable the server reads is declared and validated here, once, at startup.
 * If something is missing or malformed the process exits immediately with a clear message,
 * instead of failing later in some random request ("fail fast").
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(5),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(15),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(500),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  // Auth
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  // Serve the built React app (client/dist) from Express: one process, one port.
  // Defaults to on in production; development uses the Vite dev server instead.
  SERVE_CLIENT: z.enum(['true', 'false']).optional(),

  // Rule engine scheduler
  RULE_ENGINE_CRON: z
    .string()
    .default('*/15 * * * *')
    .refine((expr) => cron.validate(expr), 'RULE_ENGINE_CRON must be a valid cron expression'),
  RULE_ENGINE_CRON_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    // Logger is not configured yet (it depends on env), so console is the only option here.
    console.error(`Invalid environment configuration:\n${problems.join('\n')}`);
    process.exit(1);
  }
  return Object.freeze({
    ...result.data,
    isProduction: result.data.NODE_ENV === 'production',
    isTest: result.data.NODE_ENV === 'test',
    serveClient: result.data.SERVE_CLIENT
      ? result.data.SERVE_CLIENT === 'true'
      : result.data.NODE_ENV === 'production',
  });
}

export const env = loadEnv();
