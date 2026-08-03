import { Router } from 'express';
import { authenticate, requirePermissions, validate } from '../../middleware';
import {
  addTimelineNoteHandler,
  changeIncidentStatusHandler,
  createIncidentHandler,
  dispatchHandler,
  getIncidentHandler,
  getTimelineHandler,
  listIncidentsHandler,
  updateIncidentHandler,
} from './incident.controller';
import {
  addTimelineNoteSchema,
  changeIncidentStatusSchema,
  createIncidentSchema,
  dispatchSchema,
  incidentIdParamSchema,
  listIncidentsQuerySchema,
  updateIncidentSchema,
} from './incident.schema';

export const incidentRoutes: Router = Router();

incidentRoutes.use(authenticate);

incidentRoutes.get(
  '/',
  requirePermissions('incident:read'),
  validate({ query: listIncidentsQuerySchema }),
  listIncidentsHandler,
);

incidentRoutes.post(
  '/',
  requirePermissions('incident:create'),
  validate({ body: createIncidentSchema }),
  createIncidentHandler,
);

incidentRoutes.get(
  '/:incidentId',
  requirePermissions('incident:read'),
  validate({ params: incidentIdParamSchema }),
  getIncidentHandler,
);

incidentRoutes.patch(
  '/:incidentId',
  requirePermissions('incident:update'),
  validate({ params: incidentIdParamSchema, body: updateIncidentSchema }),
  updateIncidentHandler,
);

incidentRoutes.post(
  '/:incidentId/status',
  requirePermissions('incident:update'),
  validate({ params: incidentIdParamSchema, body: changeIncidentStatusSchema }),
  changeIncidentStatusHandler,
);

incidentRoutes.post(
  '/:incidentId/dispatch',
  requirePermissions('incident:dispatch'),
  validate({ params: incidentIdParamSchema, body: dispatchSchema }),
  dispatchHandler,
);

incidentRoutes.get(
  '/:incidentId/timeline',
  requirePermissions('incident:read'),
  validate({ params: incidentIdParamSchema }),
  getTimelineHandler,
);

incidentRoutes.post(
  '/:incidentId/timeline',
  requirePermissions('incident:update'),
  validate({ params: incidentIdParamSchema, body: addTimelineNoteSchema }),
  addTimelineNoteHandler,
);
