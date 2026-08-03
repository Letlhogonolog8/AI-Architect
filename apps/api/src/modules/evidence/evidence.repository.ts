import type { Evidence, Prisma } from '@prisma/client';
import type { EvidenceStatus, EvidenceType, PaginationQuery } from '@aegisdrive/types';
import { custodyPayload, toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';
import { sha256Hex } from '../../core/crypto';

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
 * Appends to the chain of custody, hash-chained to the previous link.
 *
 * There is no corresponding update or delete, and there must not be. Beyond
 * append-only, the chain is now tamper-evident: each event's `entryHash` is the
 * SHA-256 of its own fields together with the previous event's hash, so removing
 * or altering any link breaks every hash after it. `occurredAt` is set here
 * rather than by a database default so the value that is hashed is the value
 * that is stored.
 *
 * Runs in a serialisable transaction: the previous hash must be read and the new
 * link written atomically, or two concurrent appends could chain off the same
 * predecessor and fork the chain.
 */
export async function appendCustodyEvent(input: {
  evidenceId: string;
  action: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  ipAddress?: string | null;
  notes?: string | null;
}): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const previous = await tx.evidenceCustodyEvent.findFirst({
        where: { evidenceId: input.evidenceId },
        orderBy: { occurredAt: 'desc' },
        select: { entryHash: true },
      });

      const prevHash = previous?.entryHash ?? null;
      const occurredAt = new Date();

      const entryHash = sha256Hex(
        custodyPayload({
          prevHash,
          evidenceId: input.evidenceId,
          action: input.action,
          actorUserId: input.actorUserId ?? null,
          actorEmail: input.actorEmail ?? null,
          ipAddress: input.ipAddress ?? null,
          notes: input.notes ?? null,
          occurredAt: occurredAt.toISOString(),
        }),
      );

      await tx.evidenceCustodyEvent.create({
        data: {
          evidenceId: input.evidenceId,
          action: input.action,
          actorUserId: input.actorUserId ?? null,
          actorEmail: input.actorEmail ?? null,
          ipAddress: input.ipAddress ?? null,
          notes: input.notes ?? null,
          prevHash,
          entryHash,
          occurredAt,
        },
      });
    },
    { isolationLevel: 'Serializable' },
  );
}

/** Sealed/verified artefacts by id, tenant-scoped — the inputs to a court bundle. */
export async function findEvidenceByIds(
  organizationId: string,
  evidenceIds: readonly string[],
): Promise<Evidence[]> {
  return prisma.evidence.findMany({
    where: { organizationId, id: { in: [...evidenceIds] } },
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
