import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { NotificationStatus } from '@aegisdrive/types';
import { serviceEnv } from './config';
import { deliver } from './channels';

/**
 * Notification delivery worker.
 *
 * The API enqueues rows in QUEUED and returns immediately. This process drains
 * them.
 *
 * **Why a database poll rather than a queue broker.** At the volumes this
 * platform sees — thousands of notifications a day, not millions a second — the
 * `notifications` table *is* an adequate queue, and it comes with durability,
 * transactional consistency with the alert that caused it, and no extra
 * infrastructure to operate at 3am. A Redis Stream or SQS becomes worthwhile
 * when a single Postgres cannot keep up; that threshold is documented in
 * `docs/architecture/scaling.md` and is a long way off.
 *
 * **Why the advisory lock.** Multiple replicas polling the same table would
 * each claim the same rows and deliver duplicates. A Postgres advisory lock
 * makes exactly one replica the drainer at a time, without a leader-election
 * dependency.
 */
const logger = pino({
  level: serviceEnv.LOG_LEVEL,
  base: { service: 'notifications' },
});

const prisma = new PrismaClient();
const redis = new Redis(serviceEnv.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });

/** Arbitrary but stable. Two services must never pick the same advisory key. */
const ADVISORY_LOCK_KEY = 4_815_162_342n;

const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 5;

let running = true;

async function acquireDrainLock(): Promise<boolean> {
  const [row] = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked
  `;
  return row?.locked ?? false;
}

async function releaseDrainLock(): Promise<void> {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
}

async function drainBatch(): Promise<number> {
  const queued = await prisma.notification.findMany({
    where: { status: NotificationStatus.QUEUED, attemptCount: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    include: { recipient: { select: { email: true, phoneNumber: true } } },
  });

  for (const notification of queued) {
    try {
      await deliver({
        channel: notification.channel,
        subject: notification.subject,
        body: notification.body,
        recipientEmail: notification.recipient.email,
        recipientPhone: notification.recipient.phoneNumber,
      });

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });
    } catch (error) {
      const attempts = notification.attemptCount + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          // Rows short of the attempt ceiling stay QUEUED so the next pass
          // retries them; only exhausted ones become terminally FAILED.
          status: exhausted ? NotificationStatus.FAILED : NotificationStatus.QUEUED,
          attemptCount: attempts,
          failureReason: error instanceof Error ? error.message : String(error),
        },
      });

      logger.warn(
        { notificationId: notification.id, attempts, exhausted, err: error },
        'Notification delivery failed',
      );
    }
  }

  return queued.length;
}

async function main(): Promise<void> {
  await prisma.$connect();
  await redis.connect();

  logger.info({ intervalMs: serviceEnv.POLL_INTERVAL_MS }, 'Notification worker started');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    running = false;
    await releaseDrainLock().catch(() => undefined);
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  while (running) {
    const holdsLock = await acquireDrainLock();

    if (holdsLock) {
      try {
        const drained = await drainBatch();
        if (drained > 0) logger.info({ drained }, 'Batch delivered');
      } catch (error) {
        logger.error({ err: error }, 'Drain cycle failed');
      } finally {
        await releaseDrainLock();
      }
    }

    await new Promise((resolve) => setTimeout(resolve, serviceEnv.POLL_INTERVAL_MS));
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Notification worker crashed');
  process.exit(1);
});
