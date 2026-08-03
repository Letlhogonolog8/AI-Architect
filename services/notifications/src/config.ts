import { z } from 'zod';

/**
 * Worker configuration. Validated at import so a misconfigured replica fails
 * on start rather than silently never delivering anything.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000).default(2_000),

  // Provider credentials. Absent in development, where every channel logs
  // instead of sending — see `channels.ts`.
  SMS_PROVIDER_KEY: z.string().optional(),
  EMAIL_PROVIDER_KEY: z.string().optional(),
  PUSH_PROVIDER_KEY: z.string().optional(),
  VOICE_PROVIDER_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const report = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  process.stderr.write(`Invalid notifications-service configuration:\n${report}\n`);
  process.exit(1);
}

export const serviceEnv = parsed.data;
