import { PrismaClient } from '@prisma/client';
import { pino } from 'pino';
import { serviceEnv } from './config';

/**
 * Telemetry retention worker.
 *
 * `telemetry` is by far the largest table in the platform: a 500-vehicle fleet
 * reporting every five seconds writes roughly 8.6 million rows a day. Left
 * alone it makes every query on the table slower and the backups unusable.
 *
 * This worker deletes rows past the hot-retention cutoff **in bounded batches**.
 * The batching is the whole point: a single `DELETE FROM telemetry WHERE
 * recordedAt < …` would hold locks for minutes and stall ingest, and ingest is
 * the one path that cannot stop — a dropped frame during a hijacking is
 * evidence that does not exist.
 *
 * Aggregation into daily per-vehicle rollups, so history survives the deletion,
 * is the next milestone: see `docs/architecture/telemetry-pipeline.md`.
 */
const logger = pino({ level: serviceEnv.LOG_LEVEL, base: { service: 'telemetry' } });
const prisma = new PrismaClient();

let running = true;

function cutoffDate(): Date {
  return new Date(Date.now() - serviceEnv.RETENTION_DAYS * 86_400_000);
}

/**
 * Deletes one batch. Returns how many rows went, so the caller can keep
 * sweeping while there is still a backlog and then back off.
 */
async function sweepBatch(cutoff: Date): Promise<number> {
  const doomed = await prisma.telemetry.findMany({
    where: { recordedAt: { lt: cutoff } },
    select: { id: true },
    take: serviceEnv.SWEEP_BATCH_SIZE,
  });

  if (doomed.length === 0) return 0;

  const result = await prisma.telemetry.deleteMany({
    where: { id: { in: doomed.map((row) => row.id) } },
  });

  return result.count;
}

async function runSweep(): Promise<void> {
  const cutoff = cutoffDate();
  let total = 0;

  // Bounded so a large backlog cannot monopolise the database for an entire
  // interval. Whatever is left is picked up on the next pass.
  const maxBatches = 20;

  for (let batch = 0; batch < maxBatches && running; batch += 1) {
    const deleted = await sweepBatch(cutoff);
    total += deleted;
    if (deleted < serviceEnv.SWEEP_BATCH_SIZE) break;

    // Yields to ingest between batches rather than hammering straight through.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (total > 0) {
    logger.info({ deleted: total, cutoff: cutoff.toISOString() }, 'Retention sweep complete');
  }
}

async function main(): Promise<void> {
  await prisma.$connect();

  logger.info(
    { retentionDays: serviceEnv.RETENTION_DAYS, intervalMs: serviceEnv.SWEEP_INTERVAL_MS },
    'Telemetry retention worker started',
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    running = false;
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  while (running) {
    try {
      await runSweep();
    } catch (error) {
      logger.error({ err: error }, 'Retention sweep failed');
    }

    await new Promise((resolve) => setTimeout(resolve, serviceEnv.SWEEP_INTERVAL_MS));
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Telemetry worker crashed');
  process.exit(1);
});
