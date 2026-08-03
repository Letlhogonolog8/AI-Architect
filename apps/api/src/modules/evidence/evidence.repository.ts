import type { Evidence, Prisma } from '@prisma/client';
import type { EvidenceStatus, EvidenceType, PaginationQuery } from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

export interface EvidenceFilter extends PaginationQuery {
  organizationId: string;
  incidentId?: string;
  vehicleId?: string;
  type?: EvidenceType;
  status?: EvidenceStatus;
  search?: string;
}

function buildWhere(filter: EvidenceFilter): Prisma.EvidenceWhereInput {
  return {
    organizationId: filter.organizationId,
    incidentId: filter.incidentId,
    vehicleId: filter.vehicleId,
    type: filter.type,
    status: filter.status,
    ...(filter.search ? { label: { contains: filter.search, mode: 'insensitive' } } : {}),
  };
}

export async function findEvidence(filter: EvidenceFilter) {
  const where = buildWhere(filter);
  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.evidence.findMany({ where, orderBy: { capturedAt: 'desc' }, skip, take }),
    prisma.evidence.count({ where }),
  ]);

  return { rows, total };
}

export async function findEvidenceById(
  organizationId: string,
  evidenceId: string,
): Promise<Evidence | null> {
  return prisma.evidence.findFirst({ where: { id: evidenceId, organizationId } });
}

export async function insertEvidence(
  organizationId: string,
  data: Omit<Prisma.EvidenceCreateInput, 'organization'>,
): Promise<Evidence> {
  return prisma.evidence.create({
    data: { ...data, organization: { connect: { id: organizationId } } },
  });
}

export async function updateEvidenceById(
  organizationId: string,
  evidenceId: string,
  data: Prisma.EvidenceUpdateInput,
): Promise<Evidence | null> {
  const result = await prisma.evidence.updateMany({
    where: { id: evidenceId, organizationId },
    data,
  });

  if (result.count === 0) return null;
  return prisma.evidence.findUnique({ where: { id: evidenceId } });
}

/**
 * Appends to the chain of custody.
 *
 * There is no corresponding update or delete, and there must not be. A custody
 * chain with a gap or an edit is inadmissible, so the only supported operation
 * on this table is append.
 */
export async function appendCustodyEvent(input: {
  evidenceId: string;
  action: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  ipAddress?: string | null;
  notes?: string | null;
}): Promise<void> {
  await prisma.evidenceCustodyEvent.create({
    data: {
      evidenceId: input.evidenceId,
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail ?? null,
      ipAddress: input.ipAddress ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function findCustodyChain(evidenceId: string) {
  return prisma.evidenceCustodyEvent.findMany({
    where: { evidenceId },
    orderBy: { occurredAt: 'asc' },
  });
}

export async function countEvidenceByStatus(organizationId: string) {
  return prisma.evidence.groupBy({
    by: ['status'],
    where: { organizationId },
    _count: { _all: true },
  });
}
