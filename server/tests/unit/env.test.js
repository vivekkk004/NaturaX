import { afterEach, describe, it, expect, vi } from 'vitest';

const original = { ...process.env };

/** Re-imports config/env.js with extra variables (it validates process.env on import). */
async function loadEnv(vars) {
  vi.resetModules();
  Object.assign(process.env, vars);
  return (await import('../../src/config/env.js')).env;
}

afterEach(() => {
  process.env = { ...original };
  vi.resetModules();
});

describe('deployment-related configuration', () => {
  it('normalises CLIENT_ORIGIN: comma list, spaces and trailing slashes', async () => {
    const env = await loadEnv({
      CLIENT_ORIGIN: 'https://natura-x.vercel.app/ , http://localhost:5173',
    });
    expect(env.CLIENT_ORIGIN).toEqual(['https://natura-x.vercel.app', 'http://localhost:5173']);
  });

  it('leaves the cookie mode automatic and trusts one proxy only in production', async () => {
    const devEnv = await loadEnv({});
    expect(devEnv.COOKIE_SAME_SITE).toBeUndefined();
    expect(devEnv.trustProxy).toBe(0);
    expect((await loadEnv({ NODE_ENV: 'production' })).trustProxy).toBe(1);
  });

  it('rejects an invalid cookie mode', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(loadEnv({ COOKIE_SAME_SITE: 'sometimes' })).rejects.toThrow('exit');
    exit.mockRestore();
  });
});
