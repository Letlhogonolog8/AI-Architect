import type { Prisma } from '@prisma/client';
import type { AuthUser, TelemetryPoint } from '@aegisdrive/types';
import { CacheKey, CacheTtlSeconds, NotFoundError } from '@aegisdrive/shared';
import { redis } from '../../cache/redis';
import { moduleLogger } from '../../core/logger';
import { emitVehiclePosition } from '../../realtime/emitter';
import { findVehicleById, updateLastPosition } from '../vehicles/vehicle.repository';
import {
  findLatestForVehicle,
  findTelemetryWindow,
  insertTelemetryBatch,
} from './telemetry.repository';
import type { IngestTelemetryInput, TelemetryWindowQuery } from './telemetry.schema';

const log = moduleLogger('telemetry');

export interface IngestResult {
  accepted: number;
  vehicleId: string;
}

/**
 * Ingests a batch of device frames.
 *
 * Ordering matters here. The batch is written first, then the vehicle's
 * denormalised position is updated from the newest frame, then the realtime
 * broadcast goes out. A broadcast before the write would let a client read
 * state the database does not yet have.
 *
 * Frames older than the vehicle's current `lastSeenAt` are still stored — a
 * late-arriving frame is history, and history is what the forensic replay
 * needs — but they do not move the live position backwards.
 */
export async function ingestTelemetry(
  user: AuthUser,
  input: IngestTelemetryInput,
): Promise<IngestResult> {
  const vehicle = await findVehicleById(user.organizationId, input.vehicleId);
  if (!vehicle) throw new NotFoundError('Vehicle', input.vehicleId);

  // Sorted ascending so the last element is unambiguously the newest frame,
  // whatever order the device chose to flush its buffer in.
  const frames = [...input.frames].sort(
    (a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt),
  );

  const rows: Prisma.TelemetryCreateManyInput[] = frames.map((frame) => ({
    organizationId: user.organizationId,
    vehicleId: input.vehicleId,
    source: input.source,
    recordedAt: new Date(frame.recordedAt),
    longitude: frame.position.longitude,
    latitude: frame.position.latitude,
    altitude: frame.position.altitude ?? null,
    heading: frame.position.heading ?? null,
    speedKph: frame.position.speedKph ?? null,
    accuracy: frame.position.accuracy ?? null,
    ignitionOn: frame.ignitionOn,
    fuelLevelPercent: frame.fuelLevelPercent ?? null,
    batteryVoltage: frame.batteryVoltage ?? null,
    engineTempC: frame.engineTempC ?? null,
    harshBraking: frame.harshBraking,
    harshAcceleration: frame.harshAcceleration,
    raw: (frame.raw ?? undefined) as Prisma.InputJsonValue | undefined,
  }));

  const accepted = await insertTelemetryBatch(rows);

  const newest = frames[frames.length - 1];
  if (!newest) return { accepted, vehicleId: input.vehicleId };

  const newestAt = new Date(newest.recordedAt);

  if (!vehicle.lastSeenAt || newestAt.getTime() > vehicle.lastSeenAt.getTime()) {
    await updateLastPosition(input.vehicleId, {
      longitude: newest.position.longitude,
      latitude: newest.position.latitude,
      heading: newest.position.heading ?? null,
      speedKph: newest.position.speedKph ?? null,
      recordedAt: newestAt,
    });

    await redis
      .set(
        CacheKey.vehicleLastPosition(input.vehicleId),
        JSON.stringify(newest.position),
        'EX',
        CacheTtlSeconds.vehicleLastPosition,
      )
      .catch((error: unknown) => log.warn({ err: error }, 'Failed to cache last position'));

    emitVehiclePosition(user.organizationId, {
      vehicleId: input.vehicleId,
      position: {
        longitude: newest.position.longitude,
        latitude: newest.position.latitude,
        heading: newest.position.heading ?? null,
        speedKph: newest.position.speedKph ?? null,
      },
      status: vehicle.status,
      riskScore: vehicle.riskScore,
      threatLevel: vehicle.threatLevel,
      recordedAt: newestAt.toISOString(),
    });
  }

  return { accepted, vehicleId: input.vehicleId };
}

export async function getTelemetryWindow(
  user: AuthUser,
  vehicleId: string,
  query: TelemetryWindowQuery,
): Promise<TelemetryPoint[]> {
  const vehicle = await findVehicleById(user.organizationId, vehicleId);
  if (!vehicle) throw new NotFoundError('Vehicle', vehicleId);

  const rows = await findTelemetryWindow({
    organizationId: user.organizationId,
    vehicleId,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    limit: query.limit,
  });

  return rows.map(toTelemetryDto);
}

export async function getLatestTelemetry(
  user: AuthUser,
  vehicleId: string,
): Promise<TelemetryPoint | null> {
  const row = await findLatestForVehicle(user.organizationId, vehicleId);
  return row ? toTelemetryDto(row) : null;
}

type TelemetryRow = Awaited<ReturnType<typeof findLatestForVehicle>>;

function toTelemetryDto(row: NonNullable<TelemetryRow>): TelemetryPoint {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    source: row.source,
    recordedAt: row.recordedAt.toISOString(),
    position: {
      longitude: row.longitude,
      latitude: row.latitude,
      altitude: row.altitude,
      heading: row.heading,
      speedKph: row.speedKph,
      accuracy: row.accuracy,
    },
    ignitionOn: row.ignitionOn,
    fuelLevelPercent: row.fuelLevelPercent,
    batteryVoltage: row.batteryVoltage,
    engineTempC: row.engineTempC,
    harshBraking: row.harshBraking,
    harshAcceleration: row.harshAcceleration,
    raw:
      row.raw && typeof row.raw === 'object' && !Array.isArray(row.raw)
        ? (row.raw as Record<string, unknown>)
        : null,
  };
}
