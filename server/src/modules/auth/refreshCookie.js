import { env } from '../../config/env.js';

export const REFRESH_COOKIE = 'refreshToken';

/**
 * SameSite mode for the refresh cookie.
 *
 * - "strict" whenever possible: the browser then never sends the cookie with requests started by
 *   another site (CSRF protection). That is the case in development (Vite proxy) and whenever the
 *   UI is served from the same site as the API.
 * - "none" in production when an *allowed* UI origin on another site calls the API directly
 *   (Vercel UI -> Render API). Otherwise the browser would refuse to send the cookie back and the
 *   user would be logged out on every reload. CORS still only lets the allowed origins read
 *   responses, and SameSite=None must always be combined with Secure.
 *
 * @param {{ configured?: string, isProduction: boolean, origin?: string, host?: string, allowedOrigins: string[] }} ctx
 */
export function resolveSameSite({ configured, isProduction, origin, host, allowedOrigins }) {
  if (configured) return configured;
  if (!isProduction || !origin || !allowedOrigins.includes(origin)) return 'strict';
  return new URL(origin).host === host ? 'strict' : 'none';
}

/**
 * Cookie options for the refresh token: httpOnly (page scripts cannot read it, so XSS can't steal
 * it), limited to the auth endpoints, expiring with the token.
 */
export function refreshCookieOptions(req) {
  const sameSite = resolveSameSite({
    configured: env.COOKIE_SAME_SITE,
    isProduction: env.isProduction,
    origin: req.get('origin'),
    host: req.get('host'),
    allowedOrigins: env.CLIENT_ORIGIN,
  });
  return {
    httpOnly: true,
    secure: env.isProduction || sameSite === 'none',
    sameSite,
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}
