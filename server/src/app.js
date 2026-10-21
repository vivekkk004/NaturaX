import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { CLIENT_DIST_PATH } from './config/paths.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import apiRoutes from './routes.js';

/**
 * Production: serve the built React app. Hashed assets are cached long-term; every other
 * non-API path returns index.html so client-side routes (/tasks, /reports ...) work on reload.
 */
function serveClient(app) {
  const indexFile = path.join(CLIENT_DIST_PATH, 'index.html');
  if (!fs.existsSync(indexFile)) {
    logger.warn(`SERVE_CLIENT is on but ${indexFile} is missing - run "npm run build" first`);
    return;
  }
  app.use(
    '/assets',
    express.static(path.join(CLIENT_DIST_PATH, 'assets'), { immutable: true, maxAge: '1y' }),
  );
  app.use(express.static(CLIENT_DIST_PATH, { index: false }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(indexFile));
}

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
  // Behind a hosting proxy (Render, Vercel rewrite...) the client IP is in X-Forwarded-For;
  // without this, rate limiting would treat every user as the proxy's single IP.
  if (env.trustProxy) app.set('trust proxy', env.trustProxy);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN, // already split and normalised in config/env.js
      credentials: true, // the refresh-token cookie must travel with requests
      exposedHeaders: ['Content-Disposition', 'X-Request-Id'], // lets the UI read CSV filenames
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

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

  if (env.serveClient) serveClient(app);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
