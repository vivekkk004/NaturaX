import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const JWT_OPTIONS = { issuer: 'naturax-api', audience: 'naturax-client' };

/**
 * Short-lived access token (default 15 min). Stateless: the API verifies the signature
 * without a DB lookup, which keeps every request fast. Short expiry limits the damage
 * if one leaks, and deactivated users are cut off at the next refresh at the latest.
 */
export function signAccessToken(user) {
  return jwt.sign({ role: user.role, name: user.name }, env.JWT_ACCESS_SECRET, {
    ...JWT_OPTIONS,
    subject: user.id,
    jwtid: crypto.randomUUID(), // unique per token, even when two are signed in the same second
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    algorithm: 'HS256',
  });
}

/** Throws jwt.TokenExpiredError / jwt.JsonWebTokenError on failure. */
export function verifyAccessToken(token) {
  // Pinning the algorithm blocks "alg: none" and algorithm-confusion attacks.
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { ...JWT_OPTIONS, algorithms: ['HS256'] });
}

/** Refresh tokens are opaque random strings (not JWTs) - they are only ever checked against the DB. */
export function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
