import type { Request, Response } from 'express';
import { asyncHandler, sendPaginated } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import { listAuditLogs } from './audit.service';
import type { ListAuditLogsQuery } from './audit.schema';

export const listAuditLogsHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = requirePrincipal(req);
  const query = req.query as unknown as ListAuditLogsQuery;

  const page = await listAuditLogs({
    organizationId: user.organizationId,
    page: query.page,
    pageSize: query.pageSize,
    sortOrder: query.sortOrder,
    action: query.action,
    actorUserId: query.actorUserId,
    resourceType: query.resourceType,
    from: query.from,
    to: query.to,
  });

  sendPaginated(res, page);
});
