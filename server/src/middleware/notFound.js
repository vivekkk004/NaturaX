import { NotFoundError } from '../errors/index.js';

/** Catches any request that did not match a route and forwards a 404 to the error handler. */
export function notFound(req, _res, next) {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
}
