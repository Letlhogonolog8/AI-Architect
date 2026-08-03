import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Module-level env validation (src/config/env.ts) runs at import time for
    // almost every unit under test, so a baseline valid configuration has to be
    // in place before any test file's imports execute.
    env: {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://aegis:aegis@localhost:5432/aegisdrive_test?schema=public',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long-and-different',
      LOG_LEVEL: 'fatal',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});
