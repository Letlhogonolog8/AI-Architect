import type { Prisma, Telemetry } from '@prisma/client';
import { prisma } from '../../db/prisma';

export interface TelemetryWindow {
  organizationId: string;
  vehicleId: string;
  from?: Date;
  to?: Date;
  limit: number;
}

/**
 * Telemetry persistence.
 *
 * This is the highest-volume table in the system, so the read and write paths
 * are deliberately narrow: no joins, no counts, and every query uses the
 * `(vehicleId, recordedAt DESC)` index.
 */

export async function insertTelemetryBatch(
  rows: Prisma.TelemetryCreateManyInput[],
): Promise<number> {
  // `createMany` is one round trip and one statement. `skipDuplicates` makes the
  // ingest endpoint idempotent under the at-least-once delivery that flaky
  // in-vehicle links produce.
  const result = await prisma.telemetry.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

export async function findTelemetryWindow(window: TelemetryWindow): Promise<Telemetry[]> {
  return prisma.telemetry.findMany({
    where: {
      organizationId: window.organizationId,
      vehicleId: window.vehicleId,
      recordedAt: window.from || window.to ? { gte: window.from, lte: window.to } : undefined,
    },
    orderBy: { recordedAt: 'desc' },
    take: window.limit,
  });
}

export async function findLatestForVehicle(
  organizationId: string,
  vehicleId: string,
): Promise<Telemetry | null> {
  return prisma.telemetry.findFirst({
    where: { organizationId, vehicleId },
    orderBy: { recordedAt: 'desc' },
  });
}

/** Retention sweep, invoked by `services/telemetry` rather than by a request. */
export async function deleteTelemetryOlderThan(cutoff: Date): Promise<number> {
  const result = await prisma.telemetry.deleteMany({ where: { recordedAt: { lt: cutoff } } });
  return result.count;
}
