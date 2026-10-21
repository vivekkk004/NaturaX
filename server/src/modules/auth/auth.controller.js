import * as authService from './auth.service.js';
import { REFRESH_COOKIE, refreshCookieOptions } from './refreshCookie.js';

const requestMeta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

function sendSession(req, res, { user, accessToken, refreshToken }) {
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(req));
  res.json({ data: { accessToken, user } });
}

// Clearing must use the same attributes the cookie was set with, or the browser keeps it.
const clearRefreshCookie = (req, res) =>
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(req), maxAge: undefined });

export async function login(req, res) {
  sendSession(req, res, await authService.login(req.body, requestMeta(req)));
}

export async function refresh(req, res) {
  try {
    sendSession(req, res, await authService.refresh(req.cookies[REFRESH_COOKIE], requestMeta(req)));
  } catch (err) {
    // A dead refresh token is useless; clear it so the browser stops sending it.
    clearRefreshCookie(req, res);
    throw err;
  }
}

export async function logout(req, res) {
  await authService.logout(req.cookies[REFRESH_COOKIE]);
  clearRefreshCookie(req, res);
  res.status(204).end();
}

export async function me(req, res) {
  res.json({ data: await authService.getCurrentUser(req.user.id) });
}
