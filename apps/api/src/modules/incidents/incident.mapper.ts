import type { Incident as IncidentRow } from '@prisma/client';
import type { GeoPosition, Incident } from '@aegisdrive/types';

export type IncidentRowWithCount = IncidentRow & {
  _count?: { evidence: number };
};

function toPosition(row: IncidentRow): GeoPosition | null {
  if (row.longitude === null || row.latitude === null) return null;
  return { longitude: row.longitude, latitude: row.latitude };
}

export function toIncidentDto(row: IncidentRowWithCount): Incident {
  return {
    id: row.id,
    organizationId: row.organizationId,
    reference: row.reference,
    type: row.type,
    severity: row.severity,
    status: row.status,
    title: row.title,
    summary: row.summary,
    vehicleId: row.vehicleId,
    driverId: row.driverId,
    position: toPosition(row),
    detectedAt: row.detectedAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    assignedToUserId: row.assignedToUserId,
    aiConfidence: row.aiConfidence,
    evidenceCount: row._count?.evidence ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
