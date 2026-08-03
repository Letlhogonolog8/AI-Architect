import type { Alert as AlertRow } from '@prisma/client';
import type { Alert } from '@aegisdrive/types';

export function toAlertDto(row: AlertRow): Alert {
  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    status: row.status,
    severity: row.severity,
    title: row.title,
    message: row.message,
    vehicleId: row.vehicleId,
    driverId: row.driverId,
    incidentId: row.incidentId,
    raisedAt: row.raisedAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    acknowledgedByUserId: row.acknowledgedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
