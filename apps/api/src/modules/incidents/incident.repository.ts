import type { Prisma } from '@prisma/client';
import type {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  PaginationQuery,
} from '@aegisdrive/types';
import { OPEN_INCIDENT_STATUSES } from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

const WITH_EVIDENCE_COUNT = { _count: { select: { evidence: true } } } as const;

export interface IncidentFilter extends PaginationQuery {
  organizationId: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  type?: IncidentType;
  vehicleId?: string;
  driverId?: string;
  assignedToUserId?: string;
  openOnly?: boolean;
  from?: Date;
  to?: Date;
  search?: string;
}

const SORTABLE_FIELDS = new Set<keyof Prisma.IncidentOrderByWithRelationInput>([
  'detectedAt',
  'severity',
  'status',
  'createdAt',
  'updatedAt',
]);

function buildOrderBy(filter: IncidentFilter): Prisma.IncidentOrderByWithRelationInput {
  const field = filter.sortBy as keyof Prisma.IncidentOrderByWithRelationInput | undefined;
  if (field && SORTABLE_FIELDS.has(field)) return { [field]: filter.sortOrder ?? 'desc' };
  return { detectedAt: 'desc' };
}

function buildWhere(filter: IncidentFilter): Prisma.IncidentWhereInput {
  return {
    organizationId: filter.organizationId,
    status: filter.openOnly ? { in: [...OPEN_INCIDENT_STATUSES] } : filter.status,
    severity: filter.severity,
    type: filter.type,
    vehicleId: filter.vehicleId,
    driverId: filter.driverId,
    assignedToUserId: filter.assignedToUserId,
    detectedAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
    ...(filter.search
      ? {
          OR: [
            { reference: { contains: filter.search, mode: 'insensitive' } },
            { title: { contains: filter.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export async function findIncidents(filter: IncidentFilter) {
  const where = buildWhere(filter);
  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.incident.findMany({
      where,
      orderBy: buildOrderBy(filter),
      skip,
      take,
      include: WITH_EVIDENCE_COUNT,
    }),
    prisma.incident.count({ where }),
  ]);

  return { rows, total };
}

export async function findIncidentById(organizationId: string, incidentId: string) {
  return prisma.incident.findFirst({
    where: { id: incidentId, organizationId },
    include: WITH_EVIDENCE_COUNT,
  });
}

export async function insertIncident(
  organizationId: string,
  data: Omit<Prisma.IncidentCreateInput, 'organization'>,
) {
  return prisma.incident.create({
    data: { ...data, organization: { connect: { id: organizationId } } },
    include: WITH_EVIDENCE_COUNT,
  });
}

export async function updateIncidentById(
  organizationId: string,
  incidentId: string,
  data: Prisma.IncidentUpdateInput,
) {
  const result = await prisma.incident.updateMany({
    where: { id: incidentId, organizationId },
    data,
  });

  if (result.count === 0) return null;

  return prisma.incident.findUnique({
    where: { id: incidentId },
    include: WITH_EVIDENCE_COUNT,
  });
}

export async function appendTimelineEntry(input: {
  incidentId: string;
  kind: string;
  message: string;
  actorUserId?: string | null;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.incidentTimelineEntry.create({
    data: {
      incidentId: input.incidentId,
      kind: input.kind,
      message: input.message,
      actorUserId: input.actorUserId ?? null,
      metadata: input.metadata,
    },
  });
}

export async function findTimeline(incidentId: string) {
  return prisma.incidentTimelineEntry.findMany({
    where: { incidentId },
    orderBy: { occurredAt: 'asc' },
  });
}

/**
 * Allocates the next per-tenant, per-year reference.
 *
 * Runs inside a serialisable transaction because two incidents detected in the
 * same millisecond would otherwise be handed the same number. Volume is low
 * enough (tens per day per tenant) that the serialisation cost is irrelevant.
 */
export async function allocateReference(organizationId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `INC-${year}-`;

  return prisma.$transaction(
    async (tx) => {
      const latest = await tx.incident.findFirst({
        where: { organizationId, reference: { startsWith: prefix } },
        orderBy: { reference: 'desc' },
        select: { reference: true },
      });

      const lastSequence = latest ? Number.parseInt(latest.reference.slice(prefix.length), 10) : 0;
      const next = Number.isNaN(lastSequence) ? 1 : lastSequence + 1;

      return `${prefix}${String(next).padStart(6, '0')}`;
    },
    { isolationLevel: 'Serializable' },
  );
}

export async function countIncidentsByStatus(organizationId: string) {
  return prisma.incident.groupBy({
    by: ['status'],
    where: { organizationId },
    _count: { _all: true },
  });
}

export async function countOpenBySeverity(organizationId: string) {
  return prisma.incident.groupBy({
    by: ['severity'],
    where: { organizationId, status: { in: [...OPEN_INCIDENT_STATUSES] } },
    _count: { _all: true },
  });
}
