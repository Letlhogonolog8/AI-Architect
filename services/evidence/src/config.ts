import { z } from 'zod';
import { EVIDENCE_RETENTION_DAYS } from '@aegisdrive/shared';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  /** How often sealed artefacts are re-verified against their stored digest. */
  VERIFY_INTERVAL_MS: z.coerce.number().int().min(60_000).default(21_600_000),
  VERIFY_BATCH_SIZE: z.coerce.number().int().min(1).max(1_000).default(50),

  /**
   * Minimum retention. The evidence service refuses to purge anything younger,
   * regardless of what a caller asks for — a chain-of-custody floor is not a
   * runtime preference.
   */
  RETENTION_DAYS: z.coerce
    .number()
    .int()
    .min(EVIDENCE_RETENTION_DAYS)
    .default(EVIDENCE_RETENTION_DAYS),

  /** Object store. Absent in development, where verification is skipped. */
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const report = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  process.stderr.write(`Invalid evidence-service configuration:\n${report}\n`);
  process.exit(1);
}

export const serviceEnv = parsed.data;

/** True once an object store is configured; verification is a no-op until then. */
export const hasObjectStore = Boolean(
  serviceEnv.STORAGE_ENDPOINT && serviceEnv.STORAGE_BUCKET && serviceEnv.STORAGE_ACCESS_KEY,
);
