import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import apiRoutes from './routes.js';

/**
 * Builds the Express app without starting a server. Keeping `listen()` out of here lets
 * integration tests (supertest) run the app in-process with no open port.
 *
 * Middleware order matters: security headers -> CORS -> body parsing -> logging ->
 * rate limit -> routes -> 404 -> error handler (always last).
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true, // the refresh-token cookie must travel with requests
      exposedHeaders: ['Content-Disposition', 'X-Request-Id'], // lets the UI read CSV filenames
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use(
    pinoHttp({
      logger,
      // Reuse an incoming id (from a proxy) or create one; echo it so a user can quote it in a bug report.
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] || crypto.randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      // One compact line per request; the error handler adds the failure reason via res.locals.
      customSuccessMessage: (req, res) => {
        const reason = res.locals.errorMessage ? ` - ${res.locals.errorMessage}` : '';
        return `${req.method} ${req.originalUrl} ${res.statusCode}${reason}`;
      },
      customErrorMessage: (req, res) => `${req.method} ${req.originalUrl} ${res.statusCode}`,
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );

  app.use('/api', apiLimiter, apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
