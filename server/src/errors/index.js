/**
 * Custom error hierarchy. Services throw these; the central error handler turns them
 * into HTTP responses. Services therefore never touch `res` and stay HTTP-agnostic.
 *
 * `isOperational = true` marks an *expected* failure (bad input, missing record) whose
 * message is safe to show the client. Anything else is treated as a bug: logged in full,
 * but the client only sees a generic 500 message.
 */
export class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', details } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details) {
    super(message, { statusCode: 400, code: 'BAD_REQUEST', details });
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details) {
    super(message, { statusCode: 400, code: 'VALIDATION_ERROR', details });
  }
}

export class UnauthorizedError extends AppError {
  // `code` lets the client tell "token expired -> silently refresh" apart from "log in again".
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
    super(message, { statusCode: 401, code });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, { statusCode: 403, code: 'FORBIDDEN' });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, { statusCode: 404, code: 'NOT_FOUND' });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', details) {
    super(message, { statusCode: 409, code: 'CONFLICT', details });
  }
}
