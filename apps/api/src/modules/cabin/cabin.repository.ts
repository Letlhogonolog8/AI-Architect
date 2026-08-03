import type { Prisma } from '@prisma/client';
import type {
  CameraPlacement,
  PaginationQuery,
  SensorHealth,
  TamperState,
} from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

/**
 * Cabin persistence.
 *
 * Three rules beyond the usual tenant scoping:
 *
 *   1. **No column here holds media.** Frames and audio reach durable storage
 *      only through the evidence service, when an incident is opened, where
 *      they inherit a retention clock and a chain of custody. A detection row
 *      is a class, a confidence and a box.
 *
 *   2. **Detections are append-only.** There is no general update method. The
 *      single exception is `recordWeaponVerdict`, which writes a human's
 *      determination *alongside* the detection without altering it — that is
 *      the point of requiring one.
 *
 *   3. **No bulk media export.** Reads are scoped to a vehicle, a sensor or a
 *      page of recent windows. There is no method that walks every detection
 *      across a fleet, because nothing operational needs it and a
 *      driver-monitoring report would.
 */

// ============================================================================
// Sensors
// ============================================================================

export async function findSensorsForVehicle(organizationId: string, vehicleId: string) {
  return prisma.cabinSensor.findMany({
    where: { organizationId, vehicleId },
    orderBy: { placement: 'asc' },
  });
}

export async function findSensorById(organizationId: string, sensorId: string) {
  return prisma.cabinSensor.findFirst({ where: { id: sensorId, organizationId } });
}

export async function findSensorBySerial(organizationId: string, serialNumber: string) {
  return prisma.cabinSensor.findUnique({
    where: { organizationId_serialNumber: { organizationId, serialNumber } },
  });
}

export async function insertSensor(
  organizationId: string,
  data: {
    vehicleId: string;
    serialNumber: string;
    label: string;
    placement: CameraPlacement;
    audioOnly: boolean;
    firmwareVersion: string;
    recordingIndicatorFitted: boolean;
  },
) {
  return prisma.cabinSensor.create({ data: { organizationId, ...data } });
}

export async function updateSensor(
  organizationId: string,
  sensorId: string,
  data: { label?: string; analysisEnabled?: boolean; firmwareVersion?: string },
) {
  const result = await prisma.cabinSensor.updateMany({
    where: { id: sensorId, organizationId },
    data,
  });

  if (result.count === 0) return null;
  return prisma.cabinSensor.findUnique({ where: { id: sensorId } });
}

/**
 * Records a heartbeat and the health derived from it.
 *
 * Health is written by the service from observed behaviour rather than accepted
 * from the device, because a tampered device is exactly the one whose
 * self-report cannot be trusted — a covered camera reports itself perfectly
 * healthy, because it is. Those are just frames of tape.
 */
export async function recordHeartbeat(
  organizationId: string,
  serialNumber: string,
  data: {
    meanQuality: number;
    tamper: TamperState;
    health: SensorHealth;
    lastFrameAt: Date | null;
  },
) {
  const result = await prisma.cabinSensor.updateMany({
    where: { organizationId, serialNumber },
    data: { ...data, lastSeenAt: new Date() },
  });

  if (result.count === 0) return null;

  return prisma.cabinSensor.findUnique({
    where: { organizationId_serialNumber: { organizationId, serialNumber } },
  });
}

export async function deleteSensor(organizationId: string, sensorId: string): Promise<boolean> {
  const result = await prisma.cabinSensor.deleteMany({ where: { id: sensorId, organizationId } });
  return result.count > 0;
}

// ============================================================================
// Detections
// ============================================================================

export interface DetectionFilter extends PaginationQuery {
  organizationId: string;
  vehicleId?: string;
  sensorId?: string;
  weaponCandidates?: boolean;
  awaitingReview?: boolean;
  from?: Date;
  to?: Date;
}

export async function insertDetection(data: {
  organizationId: string;
  vehicleId: string;
  sensorId: string | null;
  objects: Prisma.InputJsonValue;
  occupantCount: number | null;
  stableCount: number | null;
  expectedCount: number | null;
  seats: Prisma.InputJsonValue;
  unobservedSeats: Prisma.InputJsonValue;
  acousticEvents: Prisma.InputJsonValue;
  weaponCandidateClass: string | null;
  weaponConfidence: number | null;
  weaponPpv: number | null;
  weaponBaseRate: number | null;
  weaponCaveats: Prisma.InputJsonValue;
  weaponCorroborated: boolean;
  degradedSensors: Prisma.InputJsonValue;
  windowSeconds: number;
  capturedAt: Date;
  pipelineVersion: string;
}) {
  return prisma.cabinDetection.create({ data });
}

export async function findDetections(filter: DetectionFilter) {
  const where: Prisma.CabinDetectionWhereInput = {
    organizationId: filter.organizationId,
    vehicleId: filter.vehicleId,
    sensorId: filter.sensorId,
    weaponCandidateClass: filter.weaponCandidates ? { not: null } : undefined,
    weaponVerdict: filter.awaitingReview ? null : undefined,
    capturedAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };

  // `awaitingReview` on its own would match every ordinary window, since none
  // of them has a verdict. It only means anything alongside a candidate.
  if (filter.awaitingReview) where.weaponCandidateClass = { not: null };

  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.cabinDetection.findMany({
      where,
      orderBy: { capturedAt: 'desc' },
      skip,
      take,
    }),
    prisma.cabinDetection.count({ where }),
  ]);

  return { rows, total };
}

export async function findDetectionById(organizationId: string, detectionId: string) {
  return prisma.cabinDetection.findFirst({ where: { id: detectionId, organizationId } });
}

export async function findLatestForVehicle(organizationId: string, vehicleId: string) {
  return prisma.cabinDetection.findFirst({
    where: { organizationId, vehicleId },
    orderBy: { capturedAt: 'desc' },
  });
}

/**
 * Records an operator's determination on a weapon candidate.
 *
 * Guarded on `weaponVerdict: null`, so a verdict can be set exactly once. A
 * re-reviewable verdict would let a determination be quietly reversed after the
 * fact, and this record may be produced in an investigation — including one
 * into whether the response was justified.
 */
export async function recordWeaponVerdict(
  organizationId: string,
  detectionId: string,
  data: { verdict: 'CONFIRMED' | 'REJECTED'; userId: string },
) {
  const result = await prisma.cabinDetection.updateMany({
    where: {
      id: detectionId,
      organizationId,
      weaponCandidateClass: { not: null },
      weaponVerdict: null,
    },
    data: {
      weaponVerdict: data.verdict,
      weaponVerifiedById: data.userId,
      weaponVerifiedAt: new Date(),
    },
  });

  if (result.count === 0) return null;
  return prisma.cabinDetection.findUnique({ where: { id: detectionId } });
}
