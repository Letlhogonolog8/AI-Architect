import type { Prisma } from '@prisma/client';
import type { AuditAction, PaginationQuery } from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

export interface AuditWriteInput {
  organizationId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export interface AuditFilter extends PaginationQuery {
  organizationId: string;
  action?: AuditAction;
  actorUserId?: string;
  resourceType?: string;
  from?: Date;
  to?: Date;
}

/**
 * Audit persistence.
 *
 * Deliberately write-and-read only. There is no update or delete method here,
 * and there must never be one: an audit trail that can be edited is not an
 * audit trail.
 */
export async function insertAuditLog(input: AuditWriteInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
      metadata: input.metadata,
    },
  });
}

function buildWhere(filter: AuditFilter): Prisma.AuditLogWhereInput {
  return {
    organizationId: filter.organizationId,
    action: filter.action,
    actorUserId: filter.actorUserId,
    resourceType: filter.resourceType,
    createdAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };
}

export async function findAuditLogs(filter: AuditFilter) {
  const where = buildWhere(filter);
  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.auditLog.count({ where }),
  ]);

  return { rows, total };
}
