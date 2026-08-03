import type { Prisma } from '@prisma/client';
import type {
  AuthUser,
  DroneSupportStatus,
  DroneTask,
  Geofence,
  GeofenceEvaluation,
  GeofenceEvent,
  GeoPoint,
  Paginated,
  RecoveryCase,
  RecoveryCaseDetail,
  RecoveryDashboard,
  RecoveryStatus as RecoveryStatusType,
  RecoveryTrackPoint,
  SearchAssignment,
} from '@aegisdrive/types';
import {
  AuditAction,
  DroneTaskStatus,
  RecoveryStatus as Status,
  IncidentSeverity,
  OPEN_RECOVERY_STATUSES,
  VehicleStatus,
} from '@aegisdrive/types';
import {
  CacheKey,
  CacheTtlSeconds,
  ConflictError,
  DroneProviderUnavailableError,
  NotFoundError,
  RECOVERY_DASHBOARD_WINDOW_DAYS,
  geofenceContains,
  normalisePagination,
  paginate,
  registeredDroneProvider,
  resolveCrossing,
} from '@aegisdrive/shared';
import { cached } from '../../cache/redis';
import { moduleLogger } from '../../core/logger';
import { recordAudit } from '../audit-logs/audit.service';
import { emitGeofenceBreach, emitRecoveryTrack, emitRecoveryUpdated } from '../../realtime/emitter';
import { findVehicleById, updateVehicleById } from '../vehicles/vehicle.repository';
import * as repository from './recovery.repository';
import {
  toCaseDetailDto,
  toCaseDto,
  toDroneTaskDto,
  toGeofenceDto,
  toGeofenceEventDto,
  toSearcherDto,
  toTrackPointDto,
} from './recovery.mapper';
import type {
  AddTrackPointInput,
  AssignSearcherInput,
  ChangeCaseStatusInput,
  CreateGeofenceInput,
  EvaluateGeofenceInput,
  ListCasesQuery,
  ListGeofencesQuery,
  OpenCaseInput,
  TaskDroneInput,
  UpdateCaseInput,
  UpdateDroneTaskInput,
  UpdateGeofenceInput,
  UpdateSearcherInput,
} from './recovery.schema';

const log = moduleLogger('recovery');

const DRONE_UNAVAILABLE_REASON =
  'No drone-support provider is installed; aerial tasking is architecture-only in this build.';

/**
 * Permitted recovery transitions.
 *
 * Active states move freely between one another — a recovery slides from
 * TRACKING to LOCATED to INTERCEPTING and back as the picture changes.
 * `SUSPENDED` returns to work; a `LOST` cold case can reopen on a fresh lead;
 * `RECOVERED` and `CLOSED` are terminal.
 */
const ALLOWED_TRANSITIONS: Record<RecoveryStatusType, readonly RecoveryStatusType[]> = {
  [Status.OPEN]: [
    Status.TRACKING,
    Status.LOCATED,
    Status.INTERCEPTING,
    Status.RECOVERED,
    Status.LOST,
    Status.CLOSED,
    Status.SUSPENDED,
  ],
  [Status.TRACKING]: [
    Status.OPEN,
    Status.LOCATED,
    Status.INTERCEPTING,
    Status.RECOVERED,
    Status.LOST,
    Status.CLOSED,
    Status.SUSPENDED,
  ],
  [Status.LOCATED]: [
    Status.TRACKING,
    Status.INTERCEPTING,
    Status.RECOVERED,
    Status.LOST,
    Status.CLOSED,
    Status.SUSPENDED,
  ],
  [Status.INTERCEPTING]: [
    Status.TRACKING,
    Status.LOCATED,
    Status.RECOVERED,
    Status.LOST,
    Status.CLOSED,
    Status.SUSPENDED,
  ],
  [Status.SUSPENDED]: [
    Status.OPEN,
    Status.TRACKING,
    Status.LOCATED,
    Status.INTERCEPTING,
    Status.LOST,
    Status.CLOSED,
  ],
  [Status.LOST]: [Status.OPEN, Status.TRACKING, Status.RECOVERED, Status.CLOSED],
  [Status.RECOVERED]: [],
  [Status.CLOSED]: [],
};

function isTerminal(status: RecoveryStatusType): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

// =========================================================================
// Vehicle Recovery — cases
// =========================================================================

/**
 * Opens a recovery case for a stolen vehicle.
 *
 * Flips the vehicle to STOLEN as a side effect — the case existing and the
 * vehicle's tracked state must not disagree — and seeds the last-known position
 * from the request or the vehicle's last telemetry fix.
 */
export async function openCase(user: AuthUser, input: OpenCaseInput): Promise<RecoveryCaseDetail> {
  const vehicle = await findVehicleById(user.organizationId, input.vehicleId);
  if (!vehicle) throw new NotFoundError('Vehicle', input.vehicleId);

  const existing = await repository.findOpenCaseForVehicle(user.organizationId, input.vehicleId);
  if (existing) {
    throw new ConflictError(`A recovery is already open for this vehicle (${existing.reference}).`);
  }

  const lastKnown: GeoPoint | null =
    input.position ??
    (vehicle.lastLongitude !== null && vehicle.lastLatitude !== null
      ? { longitude: vehicle.lastLongitude, latitude: vehicle.lastLatitude }
      : null);
  const lastSeenAt = input.position ? new Date() : (vehicle.lastSeenAt ?? null);

  const reference = await repository.allocateRecoveryReference(user.organizationId);

  const row = await repository.insertCase(user.organizationId, {
    reference,
    status: Status.OPEN,
    priority: input.priority ?? IncidentSeverity.HIGH,
    vehicle: { connect: { id: input.vehicleId } },
    ...(input.incidentId ? { incident: { connect: { id: input.incidentId } } } : {}),
    openedByUserId: user.id,
    lastKnownLongitude: lastKnown?.longitude ?? null,
    lastKnownLatitude: lastKnown?.latitude ?? null,
    lastSeenAt,
    outcome: input.note ?? null,
  });

  if (vehicle.status !== VehicleStatus.STOLEN) {
    await updateVehicleById(user.organizationId, input.vehicleId, {
      status: VehicleStatus.STOLEN,
    });
  }

  log.warn(
    { recoveryCaseId: row.id, reference, vehicleId: input.vehicleId },
    'Recovery case opened',
  );

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'recovery_case',
    resourceId: row.id,
    metadata: { reference, vehicleId: input.vehicleId, incidentId: input.incidentId ?? null },
  });

  emitRecoveryUpdated(toCaseDto(row));
  return toCaseDetailDto(row);
}

export async function listCases(
  user: AuthUser,
  query: ListCasesQuery,
): Promise<Paginated<RecoveryCase>> {
  const pagination = normalisePagination(query);

  const { rows, total } = await repository.findCases({
    ...pagination,
    organizationId: user.organizationId,
    status: query.status,
    priority: query.priority,
    vehicleId: query.vehicleId,
    openOnly: query.openOnly,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });

  return paginate(rows.map(toCaseDto), pagination, total);
}

export async function getCase(user: AuthUser, caseId: string): Promise<RecoveryCaseDetail> {
  const row = await repository.findCaseById(user.organizationId, caseId);
  if (!row) throw new NotFoundError('Recovery case', caseId);
  return toCaseDetailDto(row);
}

export async function updateCase(
  user: AuthUser,
  caseId: string,
  input: UpdateCaseInput,
): Promise<RecoveryCaseDetail> {
  const existing = await repository.findCaseById(user.organizationId, caseId);
  if (!existing) throw new NotFoundError('Recovery case', caseId);

  const row = await repository.updateCaseById(user.organizationId, caseId, {
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
  });
  if (!row) throw new NotFoundError('Recovery case', caseId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'recovery_case',
    resourceId: caseId,
    metadata: { changed: Object.keys(input) },
  });

  emitRecoveryUpdated(toCaseDto(row));
  return toCaseDetailDto(row);
}

export async function changeCaseStatus(
  user: AuthUser,
  caseId: string,
  input: ChangeCaseStatusInput,
): Promise<RecoveryCaseDetail> {
  const existing = await repository.findCaseById(user.organizationId, caseId);
  if (!existing) throw new NotFoundError('Recovery case', caseId);

  const permitted = ALLOWED_TRANSITIONS[existing.status as RecoveryStatusType];
  if (!permitted.includes(input.status)) {
    throw new ConflictError(
      permitted.length === 0
        ? `A recovery in ${existing.status} is closed and cannot change status.`
        : `A recovery in ${existing.status} may only move to: ${permitted.join(', ')}.`,
    );
  }

  const now = new Date();
  const isRecovered = input.status === Status.RECOVERED;
  const isClosure = input.status === Status.CLOSED || input.status === Status.LOST;

  const recoveredPosition =
    input.recoveredPosition ??
    (existing.lastKnownLongitude !== null && existing.lastKnownLatitude !== null
      ? { longitude: existing.lastKnownLongitude, latitude: existing.lastKnownLatitude }
      : null);

  const row = await repository.updateCaseById(user.organizationId, caseId, {
    status: input.status,
    ...(input.note ? { outcome: input.note } : {}),
    ...(isRecovered
      ? {
          recoveredAt: now,
          closedAt: now,
          recoveredLongitude: recoveredPosition?.longitude ?? null,
          recoveredLatitude: recoveredPosition?.latitude ?? null,
        }
      : {}),
    ...(isClosure ? { closedAt: now } : {}),
  });
  if (!row) throw new NotFoundError('Recovery case', caseId);

  if (isRecovered) {
    await updateVehicleById(user.organizationId, existing.vehicleId, {
      status: VehicleStatus.RECOVERED,
    });
  }

  log.warn(
    { recoveryCaseId: caseId, from: existing.status, to: input.status },
    'Recovery status changed',
  );

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'recovery_case',
    resourceId: caseId,
    metadata: { from: existing.status, to: input.status, note: input.note },
  });

  emitRecoveryUpdated(toCaseDto(row));
  return toCaseDetailDto(row);
}

// =========================================================================
// Stolen Vehicle Tracking
// =========================================================================

export interface TrackResult {
  trackPoint: RecoveryTrackPoint;
  /** Geofence crossings the sighting triggered, if any. */
  geofenceEvents: GeofenceEvent[];
}

/**
 * Records a sighting on a recovery track.
 *
 * Appends the fix (the track is append-only), advances the case's denormalised
 * last-known position when the sighting is newer than what is held, nudges a
 * freshly-opened case into TRACKING, and evaluates the sighting against the
 * active geofences — a stolen vehicle leaving its containment ring is exactly
 * the crossing the mesh exists to catch.
 */
export async function addTrackPoint(
  user: AuthUser,
  caseId: string,
  input: AddTrackPointInput,
): Promise<TrackResult> {
  const existing = await repository.findCaseById(user.organizationId, caseId);
  if (!existing) throw new NotFoundError('Recovery case', caseId);
  if (isTerminal(existing.status as RecoveryStatusType)) {
    throw new ConflictError(`A recovery in ${existing.status} cannot receive new sightings.`);
  }

  const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();

  const pointRow = await repository.insertTrackPoint({
    organizationId: user.organizationId,
    recoveryCaseId: caseId,
    longitude: input.position.longitude,
    latitude: input.position.latitude,
    heading: input.heading ?? null,
    speedKph: input.speedKph ?? null,
    accuracyMetres: input.accuracyMetres ?? null,
    source: input.source,
    confidence: input.confidence,
    note: input.note ?? null,
    recordedAt,
  });

  const isNewer = !existing.lastSeenAt || recordedAt >= existing.lastSeenAt;
  const advanceStatus = existing.status === Status.OPEN ? Status.TRACKING : undefined;

  const updates: Prisma.RecoveryCaseUpdateInput = {
    ...(isNewer
      ? {
          lastKnownLongitude: input.position.longitude,
          lastKnownLatitude: input.position.latitude,
          lastSeenAt: recordedAt,
        }
      : {}),
    ...(advanceStatus ? { status: advanceStatus } : {}),
  };

  const updatedCase =
    Object.keys(updates).length > 0
      ? await repository.updateCaseById(user.organizationId, caseId, updates)
      : existing;

  const trackPoint = toTrackPointDto(pointRow);
  emitRecoveryTrack(trackPoint);

  const geofenceEvents = await runGeofenceEvaluation(
    user.organizationId,
    existing.vehicleId,
    input.position,
  );

  if (updatedCase) emitRecoveryUpdated(toCaseDto(updatedCase));

  return { trackPoint, geofenceEvents };
}

export async function listTrack(
  user: AuthUser,
  caseId: string,
  query: ListCasesQuery,
): Promise<Paginated<RecoveryTrackPoint>> {
  const existing = await repository.findCaseById(user.organizationId, caseId);
  if (!existing) throw new NotFoundError('Recovery case', caseId);

  const pagination = normalisePagination(query);
  const { rows, total } = await repository.findTrack(user.organizationId, caseId, pagination);
  return paginate(rows.map(toTrackPointDto), pagination, total);
}

// =========================================================================
// Multi-vehicle Search
// =========================================================================

export async function assignSearcher(
  user: AuthUser,
  caseId: string,
  input: AssignSearcherInput,
): Promise<SearchAssignment> {
  const existing = await repository.findCaseById(user.organizationId, caseId);
  if (!existing) throw new NotFoundError('Recovery case', caseId);
  if (isTerminal(existing.status as RecoveryStatusType)) {
    throw new ConflictError(`A recovery in ${existing.status} cannot take new searchers.`);
  }

  const row = await repository.insertSearcher({
    organizationId: user.organizationId,
    recoveryCaseId: caseId,
    searcherReference: input.searcherReference,
    searcherVehicleId: input.searcherVehicleId ?? null,
    sectorCentreLongitude: input.sector?.centre.longitude ?? null,
    sectorCentreLatitude: input.sector?.centre.latitude ?? null,
    sectorRadiusMetres: input.sector?.radiusMetres ?? null,
    assignedByUserId: user.id,
    notes: input.notes ?? null,
  });

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.DISPATCH,
    resourceType: 'search_assignment',
    resourceId: row.id,
    metadata: {
      recoveryCaseId: caseId,
      searcher: input.searcherReference,
      searcherVehicleId: input.searcherVehicleId ?? null,
    },
  });

  const refreshed = await repository.findCaseById(user.organizationId, caseId);
  if (refreshed) emitRecoveryUpdated(toCaseDto(refreshed));
  return toSearcherDto(row);
}

export async function updateSearcher(
  user: AuthUser,
  assignmentId: string,
  input: UpdateSearcherInput,
): Promise<SearchAssignment> {
  const existing = await repository.findSearcherById(user.organizationId, assignmentId);
  if (!existing) throw new NotFoundError('Search assignment', assignmentId);

  const row = await repository.updateSearcherById(user.organizationId, assignmentId, {
    status: input.status,
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  });
  if (!row) throw new NotFoundError('Search assignment', assignmentId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'search_assignment',
    resourceId: assignmentId,
    metadata: { status: input.status },
  });

  return toSearcherDto(row);
}

export async function listSearchers(user: AuthUser, caseId: string): Promise<SearchAssignment[]> {
  const existing = await repository.findCaseById(user.organizationId, caseId);
  if (!existing) throw new NotFoundError('Recovery case', caseId);
  const rows = await repository.findSearchers(user.organizationId, caseId);
  return rows.map(toSearcherDto);
}

// =========================================================================
// Geofencing
// =========================================================================

export async function createGeofence(
  user: AuthUser,
  input: CreateGeofenceInput,
): Promise<Geofence> {
  if (input.recoveryCaseId) {
    const belongs = await repository.findCaseById(user.organizationId, input.recoveryCaseId);
    if (!belongs) throw new NotFoundError('Recovery case', input.recoveryCaseId);
  }

  const row = await repository.insertGeofence(user.organizationId, {
    name: input.name,
    kind: input.kind,
    trigger: input.trigger ?? 'ENTER_EXIT',
    centreLongitude: input.centre.longitude,
    centreLatitude: input.centre.latitude,
    radiusMetres: input.radiusMetres,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    createdByUserId: user.id,
    ...(input.recoveryCaseId ? { recoveryCase: { connect: { id: input.recoveryCaseId } } } : {}),
  });

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'geofence',
    resourceId: row.id,
    metadata: { kind: input.kind, radiusMetres: input.radiusMetres },
  });

  return toGeofenceDto(row);
}

export async function listGeofences(
  user: AuthUser,
  query: ListGeofencesQuery,
): Promise<Paginated<Geofence>> {
  const pagination = normalisePagination(query);
  const { rows, total } = await repository.findGeofences({
    ...pagination,
    organizationId: user.organizationId,
    kind: query.kind,
    recoveryCaseId: query.recoveryCaseId,
    activeOnly: query.activeOnly,
  });
  return paginate(rows.map(toGeofenceDto), pagination, total);
}

export async function getGeofence(user: AuthUser, geofenceId: string): Promise<Geofence> {
  const row = await repository.findGeofenceById(user.organizationId, geofenceId);
  if (!row) throw new NotFoundError('Geofence', geofenceId);
  return toGeofenceDto(row);
}

export async function updateGeofence(
  user: AuthUser,
  geofenceId: string,
  input: UpdateGeofenceInput,
): Promise<Geofence> {
  const existing = await repository.findGeofenceById(user.organizationId, geofenceId);
  if (!existing) throw new NotFoundError('Geofence', geofenceId);

  const row = await repository.updateGeofenceById(user.organizationId, geofenceId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.radiusMetres !== undefined ? { radiusMetres: input.radiusMetres } : {}),
    ...(input.expiresAt !== undefined
      ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
      : {}),
  });
  if (!row) throw new NotFoundError('Geofence', geofenceId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'geofence',
    resourceId: geofenceId,
    metadata: { changed: Object.keys(input) },
  });

  return toGeofenceDto(row);
}

export async function deactivateGeofence(user: AuthUser, geofenceId: string): Promise<Geofence> {
  const existing = await repository.findGeofenceById(user.organizationId, geofenceId);
  if (!existing) throw new NotFoundError('Geofence', geofenceId);

  const row = await repository.updateGeofenceById(user.organizationId, geofenceId, {
    isActive: false,
  });
  if (!row) throw new NotFoundError('Geofence', geofenceId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'geofence',
    resourceId: geofenceId,
    metadata: { deactivated: true },
  });

  return toGeofenceDto(row);
}

/**
 * Evaluates a position against every active geofence.
 *
 * Reports which fences the point lies inside, and — when a `vehicleId` is given,
 * so the crossing has a subject with a before-and-after state — records and
 * emits any crossings the fences' triggers ask for.
 */
export async function evaluateGeofences(
  user: AuthUser,
  input: EvaluateGeofenceInput,
): Promise<GeofenceEvaluation> {
  const fences = await repository.findActiveGeofences(user.organizationId);

  const inside = fences
    .filter((fence) =>
      geofenceContains(
        input.position,
        { longitude: fence.centreLongitude, latitude: fence.centreLatitude },
        fence.radiusMetres,
      ),
    )
    .map((fence) => fence.id);

  const events = input.vehicleId
    ? await runGeofenceEvaluation(user.organizationId, input.vehicleId, input.position, fences)
    : [];

  return { inside, events };
}

export async function listGeofenceEvents(
  user: AuthUser,
  geofenceId: string,
  query: ListCasesQuery,
): Promise<Paginated<GeofenceEvent>> {
  const existing = await repository.findGeofenceById(user.organizationId, geofenceId);
  if (!existing) throw new NotFoundError('Geofence', geofenceId);

  const pagination = normalisePagination(query);
  const { rows, total } = await repository.findGeofenceEvents(
    user.organizationId,
    geofenceId,
    pagination,
  );
  return paginate(rows.map(toGeofenceEventDto), pagination, total);
}

/**
 * The shared crossing evaluator.
 *
 * The before-state comes from the last recorded crossing for the (fence,
 * vehicle) pair — an `ENTER` or `DWELL` means it was inside, an `EXIT` or no
 * event means it was outside. Only transitions the fence's trigger asks for are
 * recorded, so almost every position update writes nothing, which is what keeps
 * the fleet from drowning in events.
 */
async function runGeofenceEvaluation(
  organizationId: string,
  vehicleId: string,
  position: GeoPoint,
  preloaded?: Awaited<ReturnType<typeof repository.findActiveGeofences>>,
): Promise<GeofenceEvent[]> {
  const fences = preloaded ?? (await repository.findActiveGeofences(organizationId));
  const events: GeofenceEvent[] = [];

  for (const fence of fences) {
    const isInside = geofenceContains(
      position,
      { longitude: fence.centreLongitude, latitude: fence.centreLatitude },
      fence.radiusMetres,
    );

    const last = await repository.lastGeofenceEventForVehicle(organizationId, fence.id, vehicleId);
    const wasInside = last ? last.type !== 'EXIT' : false;

    const crossing = resolveCrossing(fence.trigger, wasInside, isInside);
    if (!crossing) continue;

    const eventRow = await repository.insertGeofenceEvent({
      organizationId,
      geofenceId: fence.id,
      vehicleId,
      type: crossing,
      longitude: position.longitude,
      latitude: position.latitude,
    });

    const dto = toGeofenceEventDto(eventRow);
    log.warn(
      { geofenceId: fence.id, vehicleId, type: crossing, kind: fence.kind },
      'Geofence crossing recorded',
    );
    emitGeofenceBreach(dto);
    events.push(dto);
  }

  return events;
}

// =========================================================================
// Drone Support (architecture only)
// =========================================================================

/**
 * Tasks aerial support for a recovery.
 *
 * With no provider registered — every deployment in this build — the task is
 * recorded as `UNAVAILABLE`: the intent is captured, and the platform says
 * plainly that it cannot fly it, rather than fabricating a launch. When a
 * certified-operator provider is installed, the task is handed to it and its
 * accept/fail result recorded.
 */
export async function taskDrone(
  user: AuthUser,
  caseId: string,
  input: TaskDroneInput,
): Promise<DroneTask> {
  const existing = await repository.findCaseById(user.organizationId, caseId);
  if (!existing) throw new NotFoundError('Recovery case', caseId);
  if (isTerminal(existing.status as RecoveryStatusType)) {
    throw new ConflictError(`A recovery in ${existing.status} cannot task aerial support.`);
  }

  const created = await repository.insertDroneTask({
    organizationId: user.organizationId,
    recoveryCaseId: caseId,
    droneReference: input.droneReference,
    objective: input.objective,
    status: DroneTaskStatus.REQUESTED,
    targetLongitude: input.target?.longitude ?? null,
    targetLatitude: input.target?.latitude ?? null,
    requestedByUserId: user.id,
  });

  const provider = registeredDroneProvider();
  let updateData: Prisma.DroneTaskUpdateInput;

  if (!provider) {
    updateData = { status: DroneTaskStatus.UNAVAILABLE, failureReason: DRONE_UNAVAILABLE_REASON };
    log.warn(
      { droneTaskId: created.id, recoveryCaseId: caseId },
      'Drone task recorded UNAVAILABLE — no provider installed',
    );
  } else {
    try {
      const result = await provider.task({
        droneReference: input.droneReference,
        objective: input.objective,
        target: input.target ?? null,
      });
      updateData = {
        status: result.accepted ? DroneTaskStatus.ACCEPTED : DroneTaskStatus.REQUESTED,
        providerId: provider.providerId,
        externalReference: result.externalReference ?? null,
      };
    } catch (error) {
      const reason =
        error instanceof DroneProviderUnavailableError
          ? error.message
          : 'The drone provider rejected the task.';
      updateData = { status: DroneTaskStatus.FAILED, failureReason: reason };
      log.error({ err: error, droneTaskId: created.id }, 'Drone tasking failed');
    }
  }

  const updated = await repository.updateDroneTaskById(user.organizationId, created.id, updateData);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.DISPATCH,
    resourceType: 'drone_task',
    resourceId: created.id,
    metadata: { objective: input.objective, status: (updated ?? created).status },
  });

  const refreshed = await repository.findCaseById(user.organizationId, caseId);
  if (refreshed) emitRecoveryUpdated(toCaseDto(refreshed));

  return toDroneTaskDto(updated ?? created);
}

export async function updateDroneTask(
  user: AuthUser,
  taskId: string,
  input: UpdateDroneTaskInput,
): Promise<DroneTask> {
  const existing = await repository.findDroneTaskById(user.organizationId, taskId);
  if (!existing) throw new NotFoundError('Drone task', taskId);

  const row = await repository.updateDroneTaskById(user.organizationId, taskId, {
    status: input.status,
    ...(input.externalReference !== undefined
      ? { externalReference: input.externalReference }
      : {}),
    ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
  });
  if (!row) throw new NotFoundError('Drone task', taskId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'drone_task',
    resourceId: taskId,
    metadata: { status: input.status },
  });

  return toDroneTaskDto(row);
}

export async function listDroneTasks(user: AuthUser, caseId: string): Promise<DroneTask[]> {
  const existing = await repository.findCaseById(user.organizationId, caseId);
  if (!existing) throw new NotFoundError('Recovery case', caseId);
  const rows = await repository.findDroneTasks(user.organizationId, caseId);
  return rows.map(toDroneTaskDto);
}

/** Honest health surface: whether aerial support can actually be fulfilled. */
export function droneSupportStatus(): DroneSupportStatus {
  const provider = registeredDroneProvider();
  return {
    configured: provider !== null,
    providerId: provider?.providerId ?? null,
    note: provider ? 'Aerial support is available.' : DRONE_UNAVAILABLE_REASON,
  };
}

// =========================================================================
// Fleet Recovery Dashboard
// =========================================================================

/**
 * The Fleet Recovery Dashboard aggregate.
 *
 * A single cached read the whole control room polls. Recovery rate and mean time
 * to recover are computed over a trailing window — last quarter's performance is
 * what says whether the mesh is working now, not an all-time average dominated
 * by history nobody can still act on.
 */
export async function getRecoveryDashboard(user: AuthUser): Promise<RecoveryDashboard> {
  return cached(
    CacheKey.recoveryDashboard(user.organizationId),
    CacheTtlSeconds.recoveryDashboard,
    async () => {
      const now = Date.now();
      const since = new Date(now - RECOVERY_DASHBOARD_WINDOW_DAYS * 86_400 * 1_000);
      const since24 = new Date(now - 24 * 3_600 * 1_000);

      const [
        statusCounts,
        terminal,
        searchersDeployed,
        activeGeofences,
        geofenceBreaches24h,
        dronesTasked,
        dronesAirborne,
      ] = await Promise.all([
        repository.countCasesByStatus(user.organizationId),
        repository.findTerminalCasesSince(user.organizationId, since),
        repository.countActiveSearchers(user.organizationId),
        repository.countActiveGeofences(user.organizationId),
        repository.countGeofenceBreachesSince(user.organizationId, since24),
        repository.countDroneTasks(user.organizationId),
        repository.countAirborneDrones(user.organizationId),
      ]);

      const casesByStatus = statusCounts.map((r) => ({
        status: r.status as RecoveryStatusType,
        count: r._count._all,
      }));
      const activeCases = casesByStatus
        .filter((c) => OPEN_RECOVERY_STATUSES.includes(c.status))
        .reduce((sum, c) => sum + c.count, 0);

      const recoveredRows = terminal.filter((t) => t.status === Status.RECOVERED);
      const recoveredInWindow = recoveredRows.length;
      const lostInWindow = terminal.filter((t) => t.status === Status.LOST).length;
      const closedInWindow = terminal.filter((t) => t.status === Status.CLOSED).length;
      const terminalTotal = recoveredInWindow + lostInWindow + closedInWindow;

      const recoveryRate = terminalTotal > 0 ? recoveredInWindow / terminalTotal : null;

      const durations = recoveredRows
        .filter((t) => t.recoveredAt)
        .map((t) => (t.recoveredAt as Date).getTime() - t.openedAt.getTime());
      const meanTimeToRecoverMinutes =
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60_000)
          : null;

      return {
        activeCases,
        casesByStatus,
        windowDays: RECOVERY_DASHBOARD_WINDOW_DAYS,
        recoveredInWindow,
        lostInWindow,
        recoveryRate,
        meanTimeToRecoverMinutes,
        searchersDeployed,
        activeGeofences,
        geofenceBreaches24h,
        dronesTasked,
        dronesAirborne,
        droneSupportConfigured: registeredDroneProvider() !== null,
        generatedAt: new Date().toISOString(),
      } satisfies RecoveryDashboard;
    },
  );
}
