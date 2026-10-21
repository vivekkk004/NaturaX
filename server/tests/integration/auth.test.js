import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import { RefreshToken } from '../../src/models/RefreshToken.js';
import { ROLES } from '../../src/constants/roles.js';
import { useTestDatabase } from '../helpers/db.js';
import { createUser, loginAs, TEST_PASSWORD } from '../helpers/auth.js';

useTestDatabase();
const app = createApp();

const cookieValue = (setCookie) => setCookie.find((c) => c.startsWith('refreshToken='));

describe('POST /api/auth/login', () => {
  it('returns an access token, the user (without password hash) and an httpOnly refresh cookie', async () => {
    const user = await createUser({ role: ROLES.MANAGER });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email.toUpperCase(), password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user).toMatchObject({ email: user.email, role: 'MANAGER' });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const cookie = cookieValue(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it('gives the same 401 for a wrong password, an unknown email and a deactivated account', async () => {
    const user = await createUser();
    const inactive = await createUser({ isActive: false });

    const attempts = await Promise.all([
      request(app).post('/api/auth/login').send({ email: user.email, password: 'Wrong1234' }),
      request(app).post('/api/auth/login').send({ email: 'nobody@test.in', password: 'Wrong1234' }),
      request(app).post('/api/auth/login').send({ email: inactive.email, password: TEST_PASSWORD }),
    ]);

    for (const res of attempts) {
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }
  });

  it('validates the request body', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.field)).toEqual(['email', 'password']);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user for a valid token', async () => {
    const { user, auth } = await loginAs(app);

    const res = await request(app).get('/api/auth/me').set(auth);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(user.id);
  });

  it('rejects missing, forged and expired tokens with distinct codes', async () => {
    const { user } = await loginAs(app);
    const expired = jwt.sign({ role: user.role }, process.env.JWT_ACCESS_SECRET, {
      subject: user.id,
      issuer: 'naturax-api',
      audience: 'naturax-client',
      expiresIn: -10,
    });
    const forged = jwt.sign({ role: 'MANAGER' }, 'some-other-secret-of-sufficient-length!!', {
      subject: user.id,
    });

    const missing = await request(app).get('/api/auth/me');
    const bad = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    const old = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);

    expect([missing.status, bad.status, old.status]).toEqual([401, 401, 401]);
    expect(missing.body.error.code).toBe('UNAUTHORIZED');
    expect(bad.body.error.code).toBe('INVALID_TOKEN');
    expect(old.body.error.code).toBe('TOKEN_EXPIRED');
  });
});

describe('POST /api/auth/refresh (rotation)', () => {
  it('issues a new access token and a new refresh token, consuming the old one', async () => {
    const { cookie } = await loginAs(app);

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(cookieValue(res.headers['set-cookie'])).not.toBe(cookieValue(cookie));
    // The old token is now revoked: using it again (inside the grace window) just fails.
    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(reuse.status).toBe(401);
  });

  it('revokes the whole token family when an old token is reused after the grace window', async () => {
    const { cookie } = await loginAs(app);
    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    const newCookie = rotated.headers['set-cookie'];

    // Pretend the first token was rotated a minute ago and is now replayed by an attacker.
    await RefreshToken.updateMany(
      { revokedAt: { $ne: null } },
      { $set: { revokedAt: new Date(Date.now() - 60_000) } },
    );
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(replay.status).toBe(401);

    // The legitimate user's newer token was revoked too -> must log in again.
    const legit = await request(app).post('/api/auth/refresh').set('Cookie', newCookie);
    expect(legit.status).toBe(401);
  });

  it('fails without a cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_REFRESH_TOKEN');
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token and clears the cookie', async () => {
    const { cookie } = await loginAs(app);

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(cookieValue(res.headers['set-cookie'])).toMatch(/refreshToken=;/);

    const after = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(after.status).toBe(401);
  });
});
