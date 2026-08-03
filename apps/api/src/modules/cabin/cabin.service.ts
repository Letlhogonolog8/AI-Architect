import type { Prisma } from '@prisma/client';
import {
  AlertType,
  AuditAction,
  IncidentSeverity,
  SensorHealth,
  type AuthUser,
  type CabinSnapshot,
  type ObjectDetection,
  type OccupancyCount,
  type Paginated,
  type SeatOccupancy,
  type SeatPosition,
  type TamperState,
  type WeaponAssessment,
} from '@aegisdrive/types';
import {
  CABIN_RETENTION,
  ConflictError,
  NotFoundError,
  assessWeapon,
  deriveCabinSignals,
  deriveHealth,
  humaniseClass,
  initialTrackerState,
  normalisePagination,
  paginate,
  stabiliseOccupancy,
  validateEnrolment,
  type OccupancyTrackerState,
} from '@aegisdrive/shared';
import { moduleLogger } from '../../core/logger';
import { recordAudit } from '../audit-logs/audit.service';
import { raiseAlert } from '../alerts/alert.service';
import * as repository from './cabin.repository';
import { toDetectionDto, toSensorDto } from './cabin.mapper';
import type {
  EnrolSensorBody,
  ListDetectionsQuery,
  SensorHeartbeatBody,
  SubmitSnapshotBody,
  UpdateSensorBody,
} from './cabin.schema';

const log = moduleLogger('cabin');

/**
 * Cabin Intelligence Engine.
 *
 * Ingests perception windows, assesses weapon candidates, stabilises occupant
 * counts, and hands the resulting signals to the Behaviour Intelligence Engine.
 *
 * **This service scores nothing.** It produces `BehaviourObservation[]` via
 * `deriveCabinSignals` and stops. Threat scoring lives in
 * `packages/shared/src/behaviour/threat-score.ts`, which holds the calibration,
 * the base rate and the corroboration rules — putting a second scorer here
 * would mean two sets of constants and two answers to the same question.
 */

/**
 * Per-vehicle occupancy tracker state.
 *
 * In memory, and deliberately not persisted. The tracker is a smoothing filter
 * over a few minutes of frames, not a record — persisting it would add a write
 * on every window for no operational gain, and a restart losing it costs at
 * most a few seconds of re-settling.
 *
 * Keyed by vehicle so two vehicles cannot contaminate each other's counts. On a
 * multi-node deployment each node settles independently, which is acceptable
 * because the stabilised count converges within seconds either way.
 */
const occupancyTrackers = new Map<string, OccupancyTrackerState>();

// ============================================================================
// Ingest
// ============================================================================

export interface SnapshotResult {
  detectionId: string;
  weapon: WeaponAssessment | null;
  occupancy: OccupancyCount | null;
  /** Signals for the Behaviour Intelligence Engine to score. */
  signals: ReturnType<typeof deriveCabinSignals>;
}

/**
 * Ingests one cabin analysis window.
 *
 * Returns the derived signals rather than scoring them. The caller — the AI
 * gateway — submits them to `POST /behaviour/observations` alongside whatever
 * identity and contextual evidence it holds, so that the threat score is
 * computed once, from a complete evidence set, in one place.
 */
export async function submitSnapshot(
  user: AuthUser,
  input: SubmitSnapshotBody,
): Promise<SnapshotResult> {
  const capturedAt = new Date(input.capturedAt);

  const occupancy = stabilise(input, capturedAt);
  const weapon = assessWeapon({
    detections: input.objects as ObjectDetection[],
    // Only non-vision sources count. Passing another detection from the same
    // camera would let one sensor corroborate itself, which is the exact
    // failure the corroboration rule exists to prevent.
    corroboratingSources: nonVisionCorroboration(input),
  });

  const snapshot = buildSnapshot(user, input, occupancy, weapon, capturedAt);
  const signals = deriveCabinSignals({
    snapshot,
    previousOccupancy: null,
    speedKph: input.speedKph,
  });

  const row = await repository.insertDetection({
    organizationId: user.organizationId,
    vehicleId: input.vehicleId,
    sensorId: input.contributingSensorIds[0] ?? null,
    objects: input.objects as unknown as Prisma.InputJsonValue,
    occupantCount: input.occupantCount,
    stableCount: occupancy?.stableCount ?? null,
    expectedCount: input.expectedCount,
    seats: input.seats as unknown as Prisma.InputJsonValue,
    unobservedSeats: input.unobservedSeats as unknown as Prisma.InputJsonValue,
    acousticEvents: input.acousticEvents as unknown as Prisma.InputJsonValue,
    weaponCandidateClass: weapon.candidate?.objectClass ?? null,
    weaponConfidence: weapon.candidate?.confidence ?? null,
    weaponPpv: weapon.candidate ? weapon.positivePredictiveValue : null,
    weaponBaseRate: weapon.candidate ? weapon.baseRatePerCabinHour : null,
    weaponCaveats: weapon.caveats as unknown as Prisma.InputJsonValue,
    weaponCorroborated: weapon.corroborated,
    degradedSensors: input.degradedSensors as unknown as Prisma.InputJsonValue,
    windowSeconds: input.windowSeconds,
    capturedAt,
    pipelineVersion: input.pipelineVersion,
  });

  if (weapon.candidate) {
    await raiseWeaponReview(user, row.id, input.vehicleId, weapon);
  }

  return {
    detectionId: row.id,
    weapon: weapon.candidate ? weapon : null,
    occupancy,
    signals,
  };
}

/**
 * Puts a weapon candidate in front of a human.
 *
 * Raised at `MEDIUM`, never higher, and that ceiling is the point. The alert
 * says *look at this footage*, not *there is a weapon*. Escalation beyond
 * review requires the operator's confirmation plus corroborating evidence in
 * the threat score — a detector whose posterior is typically under one percent
 * must not be able to summon an armed response by itself.
 */
async function raiseWeaponReview(
  user: AuthUser,
  detectionId: string,
  vehicleId: string,
  weapon: WeaponAssessment,
): Promise<void> {
  const candidate = weapon.candidate;
  if (!candidate) return;

  log.warn(
    {
      detectionId,
      vehicleId,
      objectClass: candidate.objectClass,
      confidence: candidate.confidence,
      positivePredictiveValue: weapon.positivePredictiveValue,
      corroborated: weapon.corroborated,
    },
    'Weapon candidate detected; awaiting human review',
  );

  const message = [
    `A cabin camera classified an object as a ${humaniseClass(candidate.objectClass)} ` +
      `at ${(candidate.confidence * 100).toFixed(0)}% detector confidence.`,
    '',
    `Calibrated probability that a weapon is genuinely present: ` +
      `${(weapon.positivePredictiveValue * 100).toFixed(2)}%.`,
    '',
    'Review the footage before acting. This is not a finding of fact.',
    '',
    ...weapon.caveats.map((caveat) => `• ${caveat}`),
  ].join('\n');

  await raiseAlert(user, {
    type: AlertType.ANOMALY,
    severity: IncidentSeverity.MEDIUM,
    title: `Possible ${humaniseClass(candidate.objectClass)} in cabin — review required (${(weapon.positivePredictiveValue * 100).toFixed(1)}% likely genuine)`,
    message,
    vehicleId,
    driverId: null,
    incidentId: null,
  });

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'cabin_weapon_candidate',
    resourceId: detectionId,
    metadata: {
      objectClass: candidate.objectClass,
      confidence: candidate.confidence,
      positivePredictiveValue: weapon.positivePredictiveValue,
      alternatives: candidate.alternatives.map((entry) => entry.objectClass),
      corroborated: weapon.corroborated,
    },
  });
}

/**
 * Non-vision evidence that can corroborate a weapon detection.
 *
 * Acoustic events and door sensors qualify; another object from the same camera
 * does not. Sharing a failure mode is what makes two signals *not* corroboration
 * — see the evidence-class discussion in `packages/types/src/behaviour.ts`.
 */
function nonVisionCorroboration(input: SubmitSnapshotBody): string[] {
  const sources: string[] = [];

  for (const event of input.acousticEvents) {
    if (event.type === 'GLASS_BREAK' || event.type === 'GUNSHOT') {
      sources.push(`ACOUSTIC_${event.type}`);
    }
  }

  const movingWithDoorOpen =
    (input.speedKph ?? 0) > 8 &&
    input.doors.some((door) => door.state === 'OPEN' || door.state === 'AJAR');

  if (movingWithDoorOpen) sources.push('DOOR_OPEN_IN_MOTION');

  return sources;
}

function stabilise(input: SubmitSnapshotBody, capturedAt: Date): OccupancyCount | null {
  if (input.occupantCount === null) return null;

  const existing =
    occupancyTrackers.get(input.vehicleId) ??
    initialTrackerState(input.occupantCount, capturedAt.getTime());

  const { count, state } = stabiliseOccupancy(
    {
      instantaneousCount: input.occupantCount,
      confidence: input.occupancyConfidence ?? 0,
      seats: input.seats as SeatOccupancy[],
      expectedCount: input.expectedCount,
      unobservedPositions: input.unobservedSeats as SeatPosition[],
      observedAtMs: capturedAt.getTime(),
    },
    existing,
  );

  occupancyTrackers.set(input.vehicleId, state);
  return count;
}

function buildSnapshot(
  user: AuthUser,
  input: SubmitSnapshotBody,
  occupancy: OccupancyCount | null,
  weapon: WeaponAssessment,
  capturedAt: Date,
): CabinSnapshot {
  return {
    id: '',
    organizationId: user.organizationId,
    vehicleId: input.vehicleId,
    contributingSensorIds: input.contributingSensorIds,
    occupancy,
    objects: input.objects as ObjectDetection[],
    weapon,
    doors: input.doors,
    acousticEvents: input.acousticEvents,
    degradedSensors: input.degradedSensors as Array<{
      sensorId: string;
      health: SensorHealth;
      tamper: TamperState;
    }>,
    windowSeconds: input.windowSeconds,
    capturedAt: capturedAt.toISOString(),
    pipelineVersion: input.pipelineVersion,
  };
}

// ============================================================================
// Weapon review
// ============================================================================

/**
 * Records an operator's determination on a weapon candidate.
 *
 * The justification is required on confirmations as well as rejections. A
 * confirmation is what converts a detector output with a sub-one-percent
 * posterior into grounds for an armed response, and it should be at least as
 * accountable as saying "that was a phone".
 */
export async function recordWeaponVerdict(
  user: AuthUser,
  detectionId: string,
  input: { verdict: 'CONFIRMED' | 'REJECTED'; justification: string },
) {
  const row = await repository.recordWeaponVerdict(user.organizationId, detectionId, {
    verdict: input.verdict,
    userId: user.id,
  });

  if (!row) {
    const existing = await repository.findDetectionById(user.organizationId, detectionId);
    if (!existing) throw new NotFoundError('Cabin detection', detectionId);

    if (existing.weaponCandidateClass === null) {
      throw new ConflictError('This detection has no weapon candidate to review.');
    }

    throw new ConflictError(
      `This detection was already reviewed as ${existing.weaponVerdict}. A verdict is recorded once and cannot be revised — it may be produced in an investigation, including one into whether the response was justified.`,
    );
  }

  log.info(
    { detectionId, verdict: input.verdict, actorUserId: user.id },
    'Weapon candidate reviewed',
  );

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'cabin_weapon_candidate',
    resourceId: detectionId,
    metadata: {
      verdict: input.verdict,
      justification: input.justification,
      objectClass: row.weaponCandidateClass,
      detectorConfidence: row.weaponConfidence,
      positivePredictiveValue: row.weaponPpv,
    },
  });

  return toDetectionDto(row);
}

// ============================================================================
// Sensors
// ============================================================================

export async function enrolSensor(user: AuthUser, input: EnrolSensorBody) {
  const validation = validateEnrolment({
    recordingIndicatorFitted: input.recordingIndicatorFitted,
    serialNumber: input.serialNumber,
  });

  if (!validation.valid) throw new ConflictError(validation.reason);

  const existing = await repository.findSensorBySerial(user.organizationId, input.serialNumber);
  if (existing) {
    throw new ConflictError(
      `A sensor with serial ${input.serialNumber} is already enrolled against another vehicle. Remove it first — a sensor silently moving between vehicles would attribute one cabin's detections to another.`,
    );
  }

  const sensor = await repository.insertSensor(user.organizationId, {
    vehicleId: input.vehicleId,
    serialNumber: input.serialNumber,
    label: input.label,
    placement: input.placement,
    audioOnly: input.audioOnly,
    firmwareVersion: input.firmwareVersion,
    recordingIndicatorFitted: input.recordingIndicatorFitted,
  });

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'cabin_sensor',
    resourceId: sensor.id,
    metadata: {
      vehicleId: input.vehicleId,
      placement: input.placement,
      recordingIndicatorFitted: input.recordingIndicatorFitted,
    },
  });

  return toSensorDto(sensor);
}

export async function listSensors(user: AuthUser, vehicleId: string) {
  const rows = await repository.findSensorsForVehicle(user.organizationId, vehicleId);
  return rows.map(toSensorDto);
}

export async function updateSensor(user: AuthUser, sensorId: string, input: UpdateSensorBody) {
  const row = await repository.updateSensor(user.organizationId, sensorId, input);
  if (!row) throw new NotFoundError('Cabin sensor', sensorId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'cabin_sensor',
    resourceId: sensorId,
    metadata: { ...input },
  });

  return toSensorDto(row);
}

/**
 * Records a sensor heartbeat.
 *
 * Health is **derived here** from what the device is actually doing, never
 * taken from its self-report. A tampered device is precisely the one whose
 * self-report cannot be trusted: a camera with tape over the lens is powered,
 * running current firmware and producing frames at the expected rate. It will
 * report itself perfectly healthy, and it will be right about all of that.
 */
export async function recordHeartbeat(user: AuthUser, input: SensorHeartbeatBody) {
  const health = deriveHealth({
    lastFrameAt: input.lastFrameAt,
    meanQuality: input.meanQuality,
    tamper: input.tamper,
    analysisEnabled: true,
  });

  const row = await repository.recordHeartbeat(user.organizationId, input.serialNumber, {
    meanQuality: input.meanQuality,
    tamper: input.tamper,
    health,
    lastFrameAt: input.lastFrameAt ? new Date(input.lastFrameAt) : null,
  });

  if (!row) throw new NotFoundError('Cabin sensor', input.serialNumber);

  if (health === SensorHealth.IMPAIRED || health === SensorHealth.OFFLINE) {
    log.warn(
      { sensorId: row.id, vehicleId: row.vehicleId, health, tamper: input.tamper },
      'Cabin sensor cannot contribute',
    );
  }

  return toSensorDto(row);
}

export async function removeSensor(user: AuthUser, sensorId: string) {
  const removed = await repository.deleteSensor(user.organizationId, sensorId);
  if (!removed) throw new NotFoundError('Cabin sensor', sensorId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.DELETE,
    resourceType: 'cabin_sensor',
    resourceId: sensorId,
    metadata: {},
  });

  return { removed: true };
}

// ============================================================================
// Reads
// ============================================================================

export async function listDetections(user: AuthUser, query: ListDetectionsQuery) {
  const pagination = normalisePagination(query);

  const { rows, total } = await repository.findDetections({
    ...pagination,
    organizationId: user.organizationId,
    vehicleId: query.vehicleId,
    sensorId: query.sensorId,
    weaponCandidates: query.weaponCandidates,
    awaitingReview: query.awaitingReview,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });

  return paginate(rows.map(toDetectionDto), pagination, total) as Paginated<
    ReturnType<typeof toDetectionDto>
  >;
}

export async function getVehicleCabin(user: AuthUser, vehicleId: string) {
  const row = await repository.findLatestForVehicle(user.organizationId, vehicleId);
  return row ? toDetectionDto(row) : null;
}

/**
 * The retention policy in force.
 *
 * Exposed as an endpoint because a driver, a works council or a regulator is
 * entitled to see it without reading the source, and because publishing it
 * makes quietly changing it harder.
 */
export function getRetentionPolicy() {
  return {
    ...CABIN_RETENTION,
    explanation: [
      'Cabin frames and audio are processed in a rolling in-memory buffer and discarded. Nothing is written to durable storage during normal operation.',
      `When an incident is opened, the preceding ${CABIN_RETENTION.preIncidentBufferSeconds} seconds are committed to the evidence store, sealed, and subject to the chain of custody and its retention clock.`,
      'What persists outside an incident is detections only: object classes with their ambiguity sets, occupant counts, seat states and acoustic event types. No pixels, no audio samples, no identities.',
      'The recording indicator is constantly illuminated whenever a sensor is powered. It is never driven by detection state, because a light that changes tells an attacker the system has noticed.',
    ],
  };
}
