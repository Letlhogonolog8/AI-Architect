import { Router } from 'express';
import { authenticate, requirePermissions, validate } from '../../middleware';
import {
  acknowledgeThreatEventHandler,
  getThreatEventHandler,
  listThreatEventsHandler,
  listThreatZonesHandler,
  recordThreatEventHandler,
} from './threat.controller';
import {
  listThreatEventsQuerySchema,
  recordThreatEventSchema,
  threatEventIdParamSchema,
} from './threat.schema';

export const threatRoutes: Router = Router();

threatRoutes.use(authenticate);

threatRoutes.get('/zones', requirePermissions('threat:read'), listThreatZonesHandler);

threatRoutes.get(
  '/',
  requirePermissions('threat:read'),
  validate({ query: listThreatEventsQuerySchema }),
  listThreatEventsHandler,
);

/** Written by the AI services and by analysts curating the threat picture. */
threatRoutes.post(
  '/',
  requirePermissions('threat:manage'),
  validate({ body: recordThreatEventSchema }),
  recordThreatEventHandler,
);

threatRoutes.get(
  '/:threatEventId',
  requirePermissions('threat:read'),
  validate({ params: threatEventIdParamSchema }),
  getThreatEventHandler,
);

threatRoutes.post(
  '/:threatEventId/acknowledge',
  requirePermissions('threat:read'),
  validate({ params: threatEventIdParamSchema }),
  acknowledgeThreatEventHandler,
);
