import type { Prisma } from '@prisma/client';
import type { AuditAction, AuditLog, Paginated, PaginationQuery } from '@aegisdrive/types';
import { normalisePagination, paginate } from '@aegisdrive/shared';
import { moduleLogger } from '../../core/logger';
import { getRequestId } from '../../core/request-context';
import { findAuditLogs, insertAuditLog, type AuditWriteInput } from './audit.repository';
import { toAuditLogDto } from './audit.mapper';

const log = moduleLogger('audit');

export interface RecordAuditInput extends Omit<AuditWriteInput, 'requestId' | 'metadata'> {
  metadata?: Record<string, unknown>;
}

/**
 * Writes an audit entry.
 *
 * Never throws and never blocks the caller's response. An audit write failing
 * must not turn a successful operation into a 500 — but it *must* be loud in
 * the logs, because a silent gap in the trail is a compliance finding.
 *
 * Callers use `void recordAudit(...)`; the returned promise is resolved for
 * tests that need to await it.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    await insertAuditLog({
      ...input,
      requestId: getRequestId(),
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    });
  } catch (error) {
    log.error({ err: error, audit: input }, 'AUDIT WRITE FAILED — trail is incomplete');
  }
}

export interface ListAuditLogsInput extends Partial<PaginationQuery> {
  organizationId: string;
  action?: AuditAction;
  actorUserId?: string;
  resourceType?: string;
  from?: string;
  to?: string;
}

export async function listAuditLogs(input: ListAuditLogsInput): Promise<Paginated<AuditLog>> {
  const pagination = normalisePagination(input);

  const { rows, total } = await findAuditLogs({
    ...pagination,
    organizationId: input.organizationId,
    action: input.action,
    actorUserId: input.actorUserId,
    resourceType: input.resourceType,
    from: input.from ? new Date(input.from) : undefined,
    to: input.to ? new Date(input.to) : undefined,
  });

  return paginate(rows.map(toAuditLogDto), pagination, total);
}
