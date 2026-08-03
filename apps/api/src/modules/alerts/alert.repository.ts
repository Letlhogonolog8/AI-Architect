import type { Alert, Prisma } from '@prisma/client';
import type { AlertStatus, AlertType, IncidentSeverity, PaginationQuery } from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

export interface AlertFilter extends PaginationQuery {
  organizationId: string;
  status?: AlertStatus;
  type?: AlertType;
  severity?: IncidentSeverity;
  vehicleId?: string;
  incidentId?: string;
}

function buildWhere(filter: AlertFilter): Prisma.AlertWhereInput {
  return {
    organizationId: filter.organizationId,
    status: filter.status,
    type: filter.type,
    severity: filter.severity,
    vehicleId: filter.vehicleId,
    incidentId: filter.incidentId,
  };
}

export async function findAlerts(filter: AlertFilter) {
  const where = buildWhere(filter);
  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.alert.findMany({ where, orderBy: { raisedAt: 'desc' }, skip, take }),
    prisma.alert.count({ where }),
  ]);

  return { rows, total };
}

export async function findAlertById(
  organizationId: string,
  alertId: string,
): Promise<Alert | null> {
  return prisma.alert.findFirst({ where: { id: alertId, organizationId } });
}

export async function insertAlert(
  organizationId: string,
  data: Omit<Prisma.AlertCreateInput, 'organization'>,
): Promise<Alert> {
  return prisma.alert.create({
    data: { ...data, organization: { connect: { id: organizationId } } },
  });
}

export async function updateAlertById(
  organizationId: string,
  alertId: string,
  data: Prisma.AlertUpdateInput,
): Promise<Alert | null> {
  const result = await prisma.alert.updateMany({ where: { id: alertId, organizationId }, data });
  if (result.count === 0) return null;
  return prisma.alert.findUnique({ where: { id: alertId } });
}

export async function countOpenAlerts(organizationId: string): Promise<number> {
  return prisma.alert.count({ where: { organizationId, status: 'OPEN' } });
}
