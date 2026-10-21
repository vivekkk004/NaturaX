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
    },
  },
});
