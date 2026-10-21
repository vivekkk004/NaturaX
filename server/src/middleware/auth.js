import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../utils/tokens.js';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';

/**
 * Authentication: "who are you?" Reads `Authorization: Bearer <access token>`,
 * verifies it and puts the caller on `req.user` for the rest of the chain.
 */
export function authenticate(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, name: payload.name };
    return next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('Access token expired', 'TOKEN_EXPIRED'));
    }
    return next(new UnauthorizedError('Invalid access token', 'INVALID_TOKEN'));
  }
}

/**
 * Authorization (RBAC): "are you allowed to do this?" Always placed after `authenticate`.
 * Usage: router.post('/', authenticate, authorize(ROLES.MANAGER), handler)
 */
export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!allowedRoles.includes(req.user.role)) return next(new ForbiddenError());
    return next();
  };
}
