import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `src/config/env.ts` validates and exits at import time, so each case needs a
 * fresh module instance built from its own `process.env` — `vi.resetModules()`
 * plus a dynamic import, rather than the static import used everywhere else.
 */
const REQUIRED: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

const originalEnv = { ...process.env };

async function importEnv() {
  vi.resetModules();
  return import('./env');
}

/** Both process.exit and stderr are stubbed so a rejected config never actually kills the test runner. */
function stubExit(): void {
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit called');
  });
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
}

describe('env', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, ...REQUIRED, NODE_ENV: 'development' };
    // Cleared so a value set in the host shell (e.g. PORT for an unrelated dev
    // server) cannot masquerade as this schema's own default.
    delete process.env.CORS_ORIGINS;
    delete process.env.PORT;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('accepts a minimal valid configuration and applies documented defaults', async () => {
    const { env, isDevelopment } = await importEnv();

    expect(env.PORT).toBe(4000);
    expect(env.RATE_LIMIT_MAX_REQUESTS).toBe(300);
    expect(isDevelopment).toBe(true);
  });

  it('rejects a JWT secret shorter than 32 characters', async () => {
    process.env.JWT_ACCESS_SECRET = 'too-short';
    stubExit();

    await expect(importEnv()).rejects.toThrow('process.exit called');
  });

  it('rejects a non-URL DATABASE_URL', async () => {
    process.env.DATABASE_URL = 'not-a-connection-string';
    stubExit();

    await expect(importEnv()).rejects.toThrow('process.exit called');
  });

  it('rejects matching access and refresh secrets in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://app.aegisdrive.ai';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_ACCESS_SECRET;
    stubExit();

    await expect(importEnv()).rejects.toThrow('process.exit called');
  });

  it('rejects a wildcard CORS origin in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = '*';
    stubExit();

    await expect(importEnv()).rejects.toThrow('process.exit called');
  });

  it('allows distinct secrets and a concrete origin in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://app.aegisdrive.ai';

    const { env, isProduction } = await importEnv();

    expect(isProduction).toBe(true);
    expect(env.CORS_ORIGINS).toBe('https://app.aegisdrive.ai');
  });

  it('trims and splits CORS_ORIGINS into the parsed allow-list', async () => {
    process.env.CORS_ORIGINS = ' http://a.test , http://b.test ,,';

    const { corsOrigins } = await importEnv();

    expect(corsOrigins).toEqual(['http://a.test', 'http://b.test']);
  });
});
