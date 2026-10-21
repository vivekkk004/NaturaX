import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // env.js validates process.env on import, so test values must exist before any app code loads.
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/naturax_test',
      LOG_LEVEL: 'silent',
      JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      BCRYPT_SALT_ROUNDS: '4', // fast hashing keeps the suite quick; production uses 12
      UPLOAD_DIR: 'tests/.uploads', // never mix test files with real uploads; deleted after the run
      RULE_ENGINE_CRON_ENABLED: 'false',
    },
    // One throwaway in-memory MongoDB replica set for the whole run (supports transactions).
    globalSetup: ['tests/setup/globalSetup.js'],
    // Integration test files share that server; each uses its own database name.
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
