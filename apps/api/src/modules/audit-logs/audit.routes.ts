import { Router } from 'express';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { listAuditLogsHandler } from './audit.controller';
import { listAuditLogsQuerySchema } from './audit.schema';

/**
 * Audit trail is read-only over HTTP. There is no create, update or delete
 * route by design — entries are written from inside the API only.
 */
export const auditLogRoutes: Router = Router();

auditLogRoutes.use(authenticate);

auditLogRoutes.get(
  '/',
  requirePermissions('audit:read'),
  validate({ query: listAuditLogsQuerySchema }),
  listAuditLogsHandler,
);
