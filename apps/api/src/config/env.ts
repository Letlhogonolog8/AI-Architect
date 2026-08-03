import { z } from 'zod';

/**
 * Environment contract.
 *
 * Validated once, at import time, before anything else boots. A container that
 * is missing a secret must crash on startup with a precise message rather than
 * fail an hour later inside a request handler.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string.'),
    REDIS_URL: z.string().url('REDIS_URL must be a valid Redis connection string.'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters.'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters.'),
    JWT_ISSUER: z.string().default('aegisdrive.ai'),
    JWT_AUDIENCE: z.string().default('aegisdrive-clients'),
    /** Short by design: revocation is handled by the refresh session, not by waiting this out. */
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

    /** Comma-separated origins. Wildcards are rejected: credentials are sent cross-origin. */
    CORS_ORIGINS: z.string().default('http://localhost:5173'),

    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(300),

    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

    /** Base URL of the Python inference gateway. Optional until services/ai is deployed. */
    AI_SERVICE_URL: z.string().url().optional(),
    /** Shared secret for service-to-service calls from the background workers. */
    INTERNAL_SERVICE_TOKEN: z.string().min(32).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message:
          'Access and refresh secrets must differ so a leaked access key cannot mint sessions.',
      });
    }

    if (value.CORS_ORIGINS.includes('*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message:
          'Wildcard origins are not permitted in production; credentials are sent cross-origin.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const report = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    // Logging is not configured yet, so this deliberately goes straight to stderr.
    process.stderr.write(`Invalid environment configuration:\n${report}\n`);
    process.exit(1);
  }

  return parsed.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

/** Parsed, trimmed allow-list used by the CORS and Socket.IO handshake checks. */
export const corsOrigins: string[] = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
