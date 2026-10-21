import { describe, it, expect } from 'vitest';
import { resolveSameSite } from '../../src/modules/auth/refreshCookie.js';

const allowedOrigins = ['https://natura-x.vercel.app'];
const base = { isProduction: true, host: 'naturax.onrender.com', allowedOrigins };

describe('refresh cookie SameSite mode', () => {
  it('uses "none" for the allowed UI on another site in production (Vercel -> Render)', () => {
    expect(resolveSameSite({ ...base, origin: 'https://natura-x.vercel.app' })).toBe('none');
  });

  it('stays "strict" for same-site requests, unknown origins, no origin and development', () => {
    expect(
      resolveSameSite({
        ...base,
        origin: 'https://naturax.onrender.com',
        allowedOrigins: ['https://naturax.onrender.com'],
      }),
    ).toBe('strict');
    expect(resolveSameSite({ ...base, origin: 'https://evil.example' })).toBe('strict');
    expect(resolveSameSite({ ...base, origin: undefined })).toBe('strict');
    expect(
      resolveSameSite({ ...base, isProduction: false, origin: 'https://natura-x.vercel.app' }),
    ).toBe('strict');
  });

  it('respects an explicit COOKIE_SAME_SITE override', () => {
    expect(
      resolveSameSite({ ...base, configured: 'lax', origin: 'https://natura-x.vercel.app' }),
    ).toBe('lax');
  });
});
