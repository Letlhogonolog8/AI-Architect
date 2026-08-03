import { PrismaClient, type Prisma } from '@prisma/client';
import { env, isDevelopment, isProduction } from '../config/env';
import { logger } from '../core/logger';
import { dbSlowQueriesTotal } from '../observability/metrics';

/**
 * Prisma emits logs either to stdout or as events. Events are the only option
 * that routes through Pino, so the client is parameterised with the event names
 * it will emit — that is what makes `prisma.$on('query', …)` type-check.
 */
type PrismaLogEvent = 'query' | 'warn' | 'error';

const LOG_DEFINITIONS: Prisma.LogDefinition[] = [
  { emit: 'event', level: 'query' },
  { emit: 'event', level: 'warn' },
  { emit: 'event', level: 'error' },
];

export type AegisPrismaClient = PrismaClient<Prisma.PrismaClientOptions, PrismaLogEvent>;

/**
 * Prisma client singleton.
 *
 * `globalThis` caching survives `tsx watch` reloads; without it every save
 * opens a fresh connection pool and the database runs out of slots within a
 * few minutes of development.
 */
const globalForPrisma = globalThis as unknown as { prisma?: AegisPrismaClient };

export const prisma: AegisPrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient<Prisma.PrismaClientOptions, PrismaLogEvent>({
    datasources: { db: { url: env.DATABASE_URL } },
    log: LOG_DEFINITIONS,
  });

if (isDevelopment) {
  globalForPrisma.prisma = prisma;
}

prisma.$on('warn', (event) => logger.warn({ prisma: event }, 'Prisma warning'));
prisma.$on('error', (event) => logger.error({ prisma: event }, 'Prisma error'));

// Slow-query surfacing runs in every environment, production included — that
// is the one environment this matters most in. The threshold is deliberately
// low: telemetry reads are the hot path and a 200ms query there is already a
// problem. Logged at `warn` (not `debug`) in production so it is visible at
// the platform's default LOG_LEVEL=info without anyone having to turn on
// verbose logging after the fact; see docs/postgres-optimization.md for how
// to act on ApiHighLatencyP95 alongside this.
prisma.$on('query', (event) => {
  if (event.duration < 200) return;

  dbSlowQueriesTotal.inc();
  const log = isProduction ? logger.warn.bind(logger) : logger.debug.bind(logger);
  log({ durationMs: event.duration, query: event.query }, 'Slow query');
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('PostgreSQL connection established');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('PostgreSQL connection closed');
}

/** Liveness probe used by the health endpoint and the container health check. */
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Database health check failed');
    return false;
  }
}
