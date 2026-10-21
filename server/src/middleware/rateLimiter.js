import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

function limitExceededHandler(req, res, _next, options) {
  res.status(options.statusCode).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later',
      requestId: req.id,
    },
  });
}

/** Broad limit for the whole API: protects against scripted abuse and accidental request loops. */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: limitExceededHandler,
});
