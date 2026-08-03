import type { AuditLog as AuditLogRow } from '@prisma/client';
import type { AuditAction, AuditLog } from '@aegisdrive/types';

/** Prisma row → wire DTO. Dates become ISO strings; `Json` narrows to a record. */
export function toAuditLogDto(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    organizationId: row.organizationId,
    action: row.action as AuditAction,
    actorUserId: row.actorUserId,
    actorEmail: row.actorEmail,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
    createdAt: row.createdAt.toISOString(),
  };
}
