import type { Prisma, ThreatEvent } from '@prisma/client';
import type { PaginationQuery, ThreatEventType, ThreatLevel } from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

export interface ThreatEventFilter extends PaginationQuery {
  organizationId: string;
  type?: ThreatEventType;
  level?: ThreatLevel;
  vehicleId?: string;
  acknowledged?: boolean;
  from?: Date;
  to?: Date;
}

function buildWhere(filter: ThreatEventFilter): Prisma.ThreatEventWhereInput {
  return {
    organizationId: filter.organizationId,
    type: filter.type,
    level: filter.level,
    vehicleId: filter.vehicleId,
    acknowledged: filter.acknowledged,
    detectedAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };
}

export async function findThreatEvents(filter: ThreatEventFilter) {
  const where = buildWhere(filter);
  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.threatEvent.findMany({ where, orderBy: { detectedAt: 'desc' }, skip, take }),
    prisma.threatEvent.count({ where }),
  ]);

  return { rows, total };
}

export async function findThreatEventById(
  organizationId: string,
  threatEventId: string,
): Promise<ThreatEvent | null> {
  return prisma.threatEvent.findFirst({ where: { id: threatEventId, organizationId } });
}

export async function insertThreatEvent(
  organizationId: string,
  data: Omit<Prisma.ThreatEventCreateInput, 'organization'>,
): Promise<ThreatEvent> {
  return prisma.threatEvent.create({
    data: { ...data, organization: { connect: { id: organizationId } } },
  });
}

export async function acknowledgeThreatEventById(
  organizationId: string,
  threatEventId: string,
): Promise<ThreatEvent | null> {
  const result = await prisma.threatEvent.updateMany({
    where: { id: threatEventId, organizationId },
    data: { acknowledged: true },
  });

  if (result.count === 0) return null;
  return prisma.threatEvent.findUnique({ where: { id: threatEventId } });
}

/** Zones are either tenant-specific or global (`organizationId` null). */
export async function findActiveThreatZones(organizationId: string) {
  return prisma.threatZone.findMany({
    where: { isActive: true, OR: [{ organizationId }, { organizationId: null }] },
    orderBy: { level: 'desc' },
  });
}

export async function countUnacknowledgedByLevel(organizationId: string) {
  return prisma.threatEvent.groupBy({
    by: ['level'],
    where: { organizationId, acknowledged: false },
    _count: { _all: true },
  });
}
