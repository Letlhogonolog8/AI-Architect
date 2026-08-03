import { PrismaClient } from '@prisma/client';
import { pino } from 'pino';
import { EvidenceStatus } from '@aegisdrive/types';
import { hasObjectStore, serviceEnv } from './config';

/**
 * Evidence integrity worker.
 *
 * Periodically re-reads sealed artefacts from the object store, recomputes
 * their SHA-256 and compares it to the digest recorded at seal time.
 *
 * **Why re-verify something already sealed.** Bit rot, a botched storage
 * migration and a malicious edit all look identical from the database's point
 * of view — the row still says SEALED. The only way to know an artefact is
 * still the artefact is to hash the bytes again. Discovering corruption in a
 * courtroom is discovering it too late.
 *
 * A mismatch flips the row to CORRUPTED and appends a custody event. It is
 * never silently repaired: an artefact whose bytes changed is no longer
 * evidence, and pretending otherwise is the worst thing this system could do.
 */
const logger = pino({ level: serviceEnv.LOG_LEVEL, base: { service: 'evidence' } });
const prisma = new PrismaClient();

let running = true;

/**
 * Fetches an object and returns its SHA-256.
 *
 * Unimplemented until a storage provider is chosen — see
 * `docs/architecture/evidence-chain-of-custody.md`. It throws rather than
 * returning a placeholder digest: a function that fabricates a checksum would
 * mark every artefact corrupt, or worse, mark a corrupt one clean.
 */
async function computeStoredChecksum(storageKey: string): Promise<string> {
  throw new Error(
    `Object store integration is not configured; cannot verify '${storageKey}'. Set STORAGE_* to enable verification.`,
  );
}

async function verifyBatch(): Promise<{ checked: number; corrupted: number }> {
  const sealed = await prisma.evidence.findMany({
    where: { status: { in: [EvidenceStatus.SEALED, EvidenceStatus.VERIFIED] } },
    orderBy: { updatedAt: 'asc' },
    take: serviceEnv.VERIFY_BATCH_SIZE,
    select: { id: true, storageKey: true, checksum: true },
  });

  let corrupted = 0;

  for (const artefact of sealed) {
    const actual = await computeStoredChecksum(artefact.storageKey);
    const matches = actual === artefact.checksum;

    if (!matches) corrupted += 1;

    await prisma.$transaction([
      prisma.evidence.update({
        where: { id: artefact.id },
        data: { status: matches ? EvidenceStatus.VERIFIED : EvidenceStatus.CORRUPTED },
      }),
      prisma.evidenceCustodyEvent.create({
        data: {
          evidenceId: artefact.id,
          action: 'VERIFIED',
          actorEmail: 'system:evidence-service',
          notes: matches
            ? 'Periodic integrity check passed.'
            : `Integrity check FAILED. Expected ${artefact.checksum}, computed ${actual}.`,
        },
      }),
    ]);

    if (!matches) {
      logger.error(
        { evidenceId: artefact.id, expected: artefact.checksum, actual },
        'EVIDENCE INTEGRITY FAILURE',
      );
    }
  }

  return { checked: sealed.length, corrupted };
}

async function main(): Promise<void> {
  await prisma.$connect();

  if (!hasObjectStore) {
    logger.warn(
      'No object store configured. Integrity verification is disabled; the worker will idle.',
    );
  }

  logger.info(
    { intervalMs: serviceEnv.VERIFY_INTERVAL_MS, retentionDays: serviceEnv.RETENTION_DAYS },
    'Evidence integrity worker started',
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
    if (hasObjectStore) {
      try {
        const result = await verifyBatch();
        if (result.checked > 0) logger.info(result, 'Integrity sweep complete');
      } catch (error) {
        logger.error({ err: error }, 'Integrity sweep failed');
      }
    }

    await new Promise((resolve) => setTimeout(resolve, serviceEnv.VERIFY_INTERVAL_MS));
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Evidence worker crashed');
  process.exit(1);
});
