import { z } from 'zod';
import { TELEMETRY_HOT_RETENTION_DAYS } from '@aegisdrive/shared';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  /** How often the retention sweep runs. Hourly is ample for a daily cutoff. */
  SWEEP_INTERVAL_MS: z.coerce.number().int().min(60_000).default(3_600_000),

  /**
   * Rows deleted per sweep iteration. Deliberately small: a single unbounded
   * DELETE on the largest table in the system takes a long lock and stalls
   * ingest, which is the one thing that must never stop.
   */
  SWEEP_BATCH_SIZE: z.coerce.number().int().min(100).max(50_000).default(5_000),

  RETENTION_DAYS: z.coerce.number().int().min(1).default(TELEMETRY_HOT_RETENTION_DAYS),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const report = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  process.stderr.write(`Invalid telemetry-service configuration:\n${report}\n`);
  process.exit(1);
}

export const serviceEnv = parsed.data;
