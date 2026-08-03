import { z } from 'zod';
import { enumSchema, isoDateSchema, paginationQuerySchema, uuidSchema } from '@aegisdrive/shared';
import { AuditAction } from '@aegisdrive/types';

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  action: enumSchema(AuditAction).optional(),
  actorUserId: uuidSchema.optional(),
  resourceType: z.string().trim().min(1).max(64).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
