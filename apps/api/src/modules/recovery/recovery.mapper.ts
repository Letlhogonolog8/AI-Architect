import type {
  DroneTask as DroneTaskRow,
  Geofence as GeofenceRow,
  GeofenceEvent as GeofenceEventRow,
  RecoveryCase as RecoveryCaseRow,
  RecoveryTrackPoint as TrackPointRow,
  SearchAssignment as SearchAssignmentRow,
} from '@prisma/client';
import type {
  DroneObjective,
  DroneTask,
  DroneTaskStatus,
  Geofence,
  GeofenceEvent,
  GeofenceEventType,
  GeofenceKind,
  GeofenceTrigger,
  GeoPoint,
  IncidentSeverity,
  RecoveryCase,
  RecoveryCaseDetail,
  RecoveryStatus,
  RecoveryTrackPoint,
  SearchAssignment,
  SearchAssignmentStatus,
  TrackSource,
} from '@aegisdrive/types';

type CaseRowWithMesh = RecoveryCaseRow & {
  track?: TrackPointRow[];
  searchers?: SearchAssignmentRow[];
  geofences?: GeofenceRow[];
  droneTasks?: DroneTaskRow[];
};

function point(longitude: number | null, latitude: number | null): GeoPoint | null {
  if (longitude === null || latitude === null) return null;
  return { longitude, latitude };
}

export function toCaseDto(row: RecoveryCaseRow): RecoveryCase {
  return {
    id: row.id,
    organizationId: row.organizationId,
    reference: row.reference,
    vehicleId: row.vehicleId,
    incidentId: row.incidentId,
    status: row.status as RecoveryStatus,
    priority: row.priority as IncidentSeverity,
    lastKnownPosition: point(row.lastKnownLongitude, row.lastKnownLatitude),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    openedByUserId: row.openedByUserId,
    openedAt: row.openedAt.toISOString(),
    recoveredAt: row.recoveredAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    recoveredPosition: point(row.recoveredLongitude, row.recoveredLatitude),
    outcome: row.outcome,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toTrackPointDto(row: TrackPointRow): RecoveryTrackPoint {
  return {
    id: row.id,
    organizationId: row.organizationId,
    recoveryCaseId: row.recoveryCaseId,
    position: { longitude: row.longitude, latitude: row.latitude },
    heading: row.heading,
    speedKph: row.speedKph,
    accuracyMetres: row.accuracyMetres,
    source: row.source as TrackSource,
    confidence: row.confidence,
    note: row.note,
    recordedAt: row.recordedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toSearcherDto(row: SearchAssignmentRow): SearchAssignment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    recoveryCaseId: row.recoveryCaseId,
    searcherVehicleId: row.searcherVehicleId,
    searcherReference: row.searcherReference,
    status: row.status as SearchAssignmentStatus,
    sectorCentre: point(row.sectorCentreLongitude, row.sectorCentreLatitude),
    sectorRadiusMetres: row.sectorRadiusMetres,
    assignedByUserId: row.assignedByUserId,
    assignedAt: row.assignedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    notes: row.notes,
  };
}

export function toGeofenceDto(row: GeofenceRow): Geofence {
  return {
    id: row.id,
    organizationId: row.organizationId,
    recoveryCaseId: row.recoveryCaseId,
    name: row.name,
    kind: row.kind as GeofenceKind,
    trigger: row.trigger as GeofenceTrigger,
    centre: { longitude: row.centreLongitude, latitude: row.centreLatitude },
    radiusMetres: row.radiusMetres,
    isActive: row.isActive,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toGeofenceEventDto(row: GeofenceEventRow): GeofenceEvent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    geofenceId: row.geofenceId,
    vehicleId: row.vehicleId,
    type: row.type as GeofenceEventType,
    position: { longitude: row.longitude, latitude: row.latitude },
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toDroneTaskDto(row: DroneTaskRow): DroneTask {
  return {
    id: row.id,
    organizationId: row.organizationId,
    recoveryCaseId: row.recoveryCaseId,
    droneReference: row.droneReference,
    objective: row.objective as DroneObjective,
    status: row.status as DroneTaskStatus,
    target: point(row.targetLongitude, row.targetLatitude),
    providerId: row.providerId,
    externalReference: row.externalReference,
    failureReason: row.failureReason,
    requestedByUserId: row.requestedByUserId,
    requestedAt: row.requestedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCaseDetailDto(row: CaseRowWithMesh): RecoveryCaseDetail {
  return {
    ...toCaseDto(row),
    track: (row.track ?? []).map(toTrackPointDto),
    searchers: (row.searchers ?? []).map(toSearcherDto),
    geofences: (row.geofences ?? []).map(toGeofenceDto),
    droneTasks: (row.droneTasks ?? []).map(toDroneTaskDto),
  };
}
