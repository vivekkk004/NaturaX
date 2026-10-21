import pino from 'pino';
import { env } from './env.js';

/**
 * Structured JSON logger. In development the output is pretty-printed for humans;
 * in production it stays JSON so log tools (ELK, Loki, CloudWatch) can index it.
 */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  // Never let credentials reach the logs, even if someone logs a whole request.
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash'],
  transport:
    env.isProduction || env.isTest
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});
