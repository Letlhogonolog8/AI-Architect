import type { CabinDetection as DetectionRow, CabinSensor as SensorRow } from '@prisma/client';
import type {
  AcousticEvent,
  CabinSensor,
  CameraPlacement,
  DetectedObjectClass,
  ObjectDetection,
  SeatOccupancy,
  SeatPosition,
  SensorHealth,
  TamperState,
} from '@aegisdrive/types';

/**
 * Prisma row → wire DTO.
 *
 * The JSON columns are parsed defensively rather than cast. A detection written
 * by an earlier pipeline version may have a shape today's code does not expect,
 * and a historical window must still render rather than crash the incident view
 * an investigator has open — the screen where a cast failure would matter most.
 */

export function toSensorDto(row: SensorRow): CabinSensor {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    serialNumber: row.serialNumber,
    label: row.label,
    placement: row.placement as CameraPlacement,
    audioOnly: row.audioOnly,
    health: row.health as SensorHealth,
    tamper: row.tamper as TamperState,
    meanQuality: row.meanQuality,
    analysisEnabled: row.analysisEnabled,
    recordingIndicatorFitted: row.recordingIndicatorFitted,
    firmwareVersion: row.firmwareVersion,
    lastFrameAt: row.lastFrameAt?.toISOString() ?? null,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface CabinDetectionDto {
  id: string;
  organizationId: string;
  vehicleId: string;
  sensorId: string | null;

  objects: ObjectDetection[];
  occupantCount: number | null;
  stableCount: number | null;
  expectedCount: number | null;
  seats: SeatOccupancy[];
  unobservedSeats: SeatPosition[];
  acousticEvents: AcousticEvent[];

  /**
   * The weapon candidate, if any.
   *
   * `detectorConfidence` and `positivePredictiveValue` are both present and a
   * client must render both. They differ by roughly two orders of magnitude,
   * and showing the first alone is how an operator becomes certain about a
   * mobile phone.
   */
  weapon: {
    objectClass: DetectedObjectClass;
    detectorConfidence: number;
    positivePredictiveValue: number;
    baseRatePerCabinHour: number;
    caveats: string[];
    corroborated: boolean;
    verdict: 'CONFIRMED' | 'REJECTED' | null;
    verifiedByUserId: string | null;
    verifiedAt: string | null;
  } | null;

  degradedSensors: Array<{ sensorId: string; health: SensorHealth; tamper: TamperState }>;
  windowSeconds: number;
  capturedAt: string;
  pipelineVersion: string;
}

export function toDetectionDto(row: DetectionRow): CabinDetectionDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    sensorId: row.sensorId,

    objects: parseArray<ObjectDetection>(row.objects, isObjectDetection),
    occupantCount: row.occupantCount,
    stableCount: row.stableCount,
    expectedCount: row.expectedCount,
    seats: parseArray<SeatOccupancy>(row.seats, isSeatOccupancy),
    unobservedSeats: parseStringArray(row.unobservedSeats) as SeatPosition[],
    acousticEvents: parseArray<AcousticEvent>(row.acousticEvents, isAcousticEvent),

    weapon:
      row.weaponCandidateClass === null
        ? null
        : {
            objectClass: row.weaponCandidateClass as DetectedObjectClass,
            detectorConfidence: row.weaponConfidence ?? 0,
            positivePredictiveValue: row.weaponPpv ?? 0,
            baseRatePerCabinHour: row.weaponBaseRate ?? 0,
            caveats: parseStringArray(row.weaponCaveats),
            corroborated: row.weaponCorroborated,
            verdict: row.weaponVerdict as 'CONFIRMED' | 'REJECTED' | null,
            verifiedByUserId: row.weaponVerifiedById,
            verifiedAt: row.weaponVerifiedAt?.toISOString() ?? null,
          },

    degradedSensors: parseArray(row.degradedSensors, isDegradedSensor),
    windowSeconds: row.windowSeconds,
    capturedAt: row.capturedAt.toISOString(),
    pipelineVersion: row.pipelineVersion,
  };
}

function parseArray<T>(value: unknown, guard: (entry: Record<string, unknown>) => boolean): T[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (entry): entry is T =>
      typeof entry === 'object' && entry !== null && guard(entry as Record<string, unknown>),
  );
}

function isObjectDetection(entry: Record<string, unknown>): boolean {
  return typeof entry.objectClass === 'string' && typeof entry.confidence === 'number';
}

function isSeatOccupancy(entry: Record<string, unknown>): boolean {
  return typeof entry.position === 'string' && typeof entry.state === 'string';
}

function isAcousticEvent(entry: Record<string, unknown>): boolean {
  return typeof entry.type === 'string' && typeof entry.confidence === 'number';
}

function isDegradedSensor(entry: Record<string, unknown>): boolean {
  return typeof entry.sensorId === 'string' && typeof entry.health === 'string';
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}
