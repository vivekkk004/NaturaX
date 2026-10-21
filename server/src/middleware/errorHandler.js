import mongoose from 'mongoose';
import { AppError } from '../errors/index.js';
import { env } from '../config/env.js';

/**
 * Translates well-known library errors into our AppError shape, so the response
 * format is identical no matter where the error came from.
 */
function normalizeError(err) {
  if (err instanceof AppError) return err;

  // Malformed JSON body (thrown by express.json()).
  if (err.type === 'entity.parse.failed') {
    return new AppError('Request body is not valid JSON', { statusCode: 400, code: 'BAD_REQUEST' });
  }
  if (err.type === 'entity.too.large') {
    return new AppError('Request body is too large', {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return new AppError('Validation failed', {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details,
    });
  }
  if (err instanceof mongoose.Error.CastError) {
    return new AppError(`Invalid value for ${err.path}`, { statusCode: 400, code: 'BAD_REQUEST' });
  }
  // Unique index violation, e.g. a second user with the same email.
  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue ?? {});
    return new AppError(`Duplicate value for ${fields.join(', ') || 'a unique field'}`, {
      statusCode: 409,
      code: 'CONFLICT',
      details: err.keyValue,
    });
  }

  // Errors raised by Express itself (e.g. res.download of a missing file -> 404) carry a 4xx status.
  if (err.expose && err.status >= 400 && err.status < 500) {
    const notFound = err.status === 404;
    return new AppError(notFound ? 'File not found' : err.message, {
      statusCode: err.status,
      code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST',
    });
  }

  return null; // unknown -> programming error / infrastructure failure
}

// Express recognises error middleware by its 4 parameters, so `next` must stay in the signature.
export function errorHandler(err, req, res, next) {
  // A streamed response (CSV download) may fail after headers were sent: a JSON error body is no
  // longer possible, so hand over to Express, which aborts the connection.
  if (res.headersSent) {
    req.log?.error({ err }, 'Error after response started');
    return next(err);
  }

  const known = normalizeError(err);
  const statusCode = known?.statusCode ?? 500;

  // 5xx = bug or outage: log the full stack. 4xx = client mistake: the request logger
  // already records it at "warn", we just attach the reason to that same log line.
  if (statusCode >= 500) req.log?.error({ err }, 'Unhandled error');
  else res.locals.errorMessage = `${known.code}: ${known.message}`;

  res.status(statusCode).json({
    error: {
      code: known?.code ?? 'INTERNAL_ERROR',
      // Never leak internal messages / stack traces for unexpected errors in production.
      message: known?.message ?? (env.isProduction ? 'Something went wrong' : err.message),
      ...(known?.details !== undefined && { details: known.details }),
      requestId: req.id,
    },
  });
}
