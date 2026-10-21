import { env } from '../../config/env.js';
import * as authService from './auth.service.js';

export const REFRESH_COOKIE = 'refreshToken';

/**
 * The refresh token lives in an httpOnly cookie: JavaScript in the page cannot read it,
 * so an XSS bug cannot steal it. `path` limits it to the auth endpoints, and
 * SameSite=strict stops other sites from making the browser send it (CSRF).
 * COOKIE_SAME_SITE=none is only for a UI calling the API on another site directly; browsers
 * accept SameSite=None only together with Secure.
 */
const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProduction || env.COOKIE_SAME_SITE === 'none',
  sameSite: env.COOKIE_SAME_SITE,
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
});

const requestMeta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

function sendSession(res, { user, accessToken, refreshToken }) {
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
  res.json({ data: { accessToken, user } });
}

export async function login(req, res) {
  sendSession(res, await authService.login(req.body, requestMeta(req)));
}

export async function refresh(req, res) {
  try {
    sendSession(res, await authService.refresh(req.cookies[REFRESH_COOKIE], requestMeta(req)));
  } catch (err) {
    // A dead refresh token is useless; clear it so the browser stops sending it.
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
    throw err;
  }
}

export async function logout(req, res) {
  await authService.logout(req.cookies[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
}

export async function me(req, res) {
  res.json({ data: await authService.getCurrentUser(req.user.id) });
}
