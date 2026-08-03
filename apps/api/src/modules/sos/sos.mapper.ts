import type {
  EmergencyDispatch as EmergencyDispatchRow,
  SosActivation as SosActivationRow,
} from '@prisma/client';
import type {
  EmergencyChannel,
  EmergencyDispatch,
  EmergencyDispatchPayload,
  GeoPoint,
  SosActivation,
  SosActivationDetail,
  SosActivationMethod,
  SosStatus,
} from '@aegisdrive/types';

export type SosActivationRowWithDispatches = SosActivationRow & {
  dispatches?: EmergencyDispatchRow[];
};

function toPosition(row: SosActivationRow): GeoPoint | null {
  if (row.longitude === null || row.latitude === null) return null;
  return { longitude: row.longitude, latitude: row.latitude };
}

export function toDispatchDto(row: EmergencyDispatchRow): EmergencyDispatch {
  return {
    id: row.id,
    organizationId: row.organizationId,
    activationId: row.activationId,
    channel: row.channel as EmergencyChannel,
    status: row.status as EmergencyDispatch['status'],
    recipientReference: row.recipientReference,
    recipientContact: row.recipientContact,
    providerId: row.providerId,
    externalReference: row.externalReference,
    payload: row.payload as unknown as EmergencyDispatchPayload,
    attemptCount: row.attemptCount,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toActivationDto(row: SosActivationRow): SosActivation {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    driverId: row.driverId,
    method: row.method as SosActivationMethod,
    status: row.status as SosStatus,
    covert: row.covert,
    position: toPosition(row),
    confidence: row.confidence,
    source: row.source,
    incidentId: row.incidentId,
    activatedAt: row.activatedAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    acknowledgedByUserId: row.acknowledgedByUserId,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedByUserId: row.resolvedByUserId,
    dispositionNote: row.dispositionNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toActivationDetailDto(row: SosActivationRowWithDispatches): SosActivationDetail {
  return {
    ...toActivationDto(row),
    dispatches: (row.dispatches ?? []).map(toDispatchDto),
  };
}
