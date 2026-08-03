import { Router } from 'express';
import { authenticate, requirePermissions, validate } from '../../middleware';
import {
  addTrackPointHandler,
  assignSearcherHandler,
  changeCaseStatusHandler,
  createGeofenceHandler,
  deactivateGeofenceHandler,
  droneStatusHandler,
  evaluateGeofenceHandler,
  getCaseHandler,
  getGeofenceHandler,
  listCasesHandler,
  listDroneTasksHandler,
  listGeofenceEventsHandler,
  listGeofencesHandler,
  listSearchersHandler,
  listTrackHandler,
  openCaseHandler,
  recoveryDashboardHandler,
  taskDroneHandler,
  updateCaseHandler,
  updateDroneTaskHandler,
  updateGeofenceHandler,
  updateSearcherHandler,
} from './recovery.controller';
import {
  addTrackPointSchema,
  assignSearcherSchema,
  assignmentIdParamSchema,
  caseIdParamSchema,
  changeCaseStatusSchema,
  createGeofenceSchema,
  evaluateGeofenceSchema,
  geofenceIdParamSchema,
  listCasesQuerySchema,
  listGeofencesQuerySchema,
  openCaseSchema,
  taskDroneSchema,
  taskIdParamSchema,
  updateCaseSchema,
  updateDroneTaskSchema,
  updateGeofenceSchema,
  updateSearcherSchema,
} from './recovery.schema';

/**
 * Recovery Mesh routes.
 *
 * ## Routes that deliberately do not exist
 *
 * **No track deletion.** The stolen-vehicle track is append-only evidence.
 * There is no endpoint to remove a sighting and no `recovery:*` permission that
 * could authorise one — a track a reviewer cannot trust is worthless in a claim
 * or a prosecution.
 *
 * **No fabricated drone launch.** `POST /cases/:id/drone-tasks` records intent;
 * with no provider installed the task lands in `UNAVAILABLE`, never `LAUNCHED`.
 * There is no route that marks a flight airborne without a provider having said
 * so.
 */
export const recoveryRoutes: Router = Router();

recoveryRoutes.use(authenticate);

// ------------------------------------------------------------- dashboard + status

/** The Fleet Recovery Dashboard aggregate. Cached; polled by the whole room. */
recoveryRoutes.get('/dashboard', requirePermissions('recovery:read'), recoveryDashboardHandler);

/** Honest health surface for aerial support. False in this build. */
recoveryRoutes.get('/drones/status', requirePermissions('recovery:read'), droneStatusHandler);

// ----------------------------------------------------------------- cases

recoveryRoutes.post(
  '/cases',
  requirePermissions('recovery:manage'),
  validate({ body: openCaseSchema }),
  openCaseHandler,
);

recoveryRoutes.get(
  '/cases',
  requirePermissions('recovery:read'),
  validate({ query: listCasesQuerySchema }),
  listCasesHandler,
);

recoveryRoutes.get(
  '/cases/:caseId',
  requirePermissions('recovery:read'),
  validate({ params: caseIdParamSchema }),
  getCaseHandler,
);

recoveryRoutes.patch(
  '/cases/:caseId',
  requirePermissions('recovery:manage'),
  validate({ params: caseIdParamSchema, body: updateCaseSchema }),
  updateCaseHandler,
);

recoveryRoutes.post(
  '/cases/:caseId/status',
  requirePermissions('recovery:manage'),
  validate({ params: caseIdParamSchema, body: changeCaseStatusSchema }),
  changeCaseStatusHandler,
);

// ------------------------------------------------------- stolen-vehicle tracking

/**
 * Records a sighting. `recovery:track` rather than `recovery:manage`: the
 * pipelines and service accounts that feed the track — plate cameras, partner
 * networks — are not the operators who run the case.
 */
recoveryRoutes.post(
  '/cases/:caseId/track',
  requirePermissions('recovery:track'),
  validate({ params: caseIdParamSchema, body: addTrackPointSchema }),
  addTrackPointHandler,
);

recoveryRoutes.get(
  '/cases/:caseId/track',
  requirePermissions('recovery:read'),
  validate({ params: caseIdParamSchema, query: listCasesQuerySchema }),
  listTrackHandler,
);

// ---------------------------------------------------------- multi-vehicle search

recoveryRoutes.post(
  '/cases/:caseId/searchers',
  requirePermissions('recovery:dispatch'),
  validate({ params: caseIdParamSchema, body: assignSearcherSchema }),
  assignSearcherHandler,
);

recoveryRoutes.get(
  '/cases/:caseId/searchers',
  requirePermissions('recovery:read'),
  validate({ params: caseIdParamSchema }),
  listSearchersHandler,
);

recoveryRoutes.post(
  '/searchers/:assignmentId/status',
  requirePermissions('recovery:dispatch'),
  validate({ params: assignmentIdParamSchema, body: updateSearcherSchema }),
  updateSearcherHandler,
);

// ------------------------------------------------------------------- geofencing

recoveryRoutes.post(
  '/geofences',
  requirePermissions('recovery:manage'),
  validate({ body: createGeofenceSchema }),
  createGeofenceHandler,
);

recoveryRoutes.get(
  '/geofences',
  requirePermissions('recovery:read'),
  validate({ query: listGeofencesQuerySchema }),
  listGeofencesHandler,
);

/**
 * Evaluates a position against the active fences. `recovery:track` — a position
 * check writes to the append-only crossing log, so it is a submit, not a read.
 * Declared before `/geofences/:geofenceId` so `evaluate` is not read as an id.
 */
recoveryRoutes.post(
  '/geofences/evaluate',
  requirePermissions('recovery:track'),
  validate({ body: evaluateGeofenceSchema }),
  evaluateGeofenceHandler,
);

recoveryRoutes.get(
  '/geofences/:geofenceId',
  requirePermissions('recovery:read'),
  validate({ params: geofenceIdParamSchema }),
  getGeofenceHandler,
);

recoveryRoutes.patch(
  '/geofences/:geofenceId',
  requirePermissions('recovery:manage'),
  validate({ params: geofenceIdParamSchema, body: updateGeofenceSchema }),
  updateGeofenceHandler,
);

recoveryRoutes.post(
  '/geofences/:geofenceId/deactivate',
  requirePermissions('recovery:manage'),
  validate({ params: geofenceIdParamSchema }),
  deactivateGeofenceHandler,
);

recoveryRoutes.get(
  '/geofences/:geofenceId/events',
  requirePermissions('recovery:read'),
  validate({ params: geofenceIdParamSchema, query: listCasesQuerySchema }),
  listGeofenceEventsHandler,
);

// -------------------------------------------------------- drone support (arch.)

recoveryRoutes.post(
  '/cases/:caseId/drone-tasks',
  requirePermissions('recovery:dispatch'),
  validate({ params: caseIdParamSchema, body: taskDroneSchema }),
  taskDroneHandler,
);

recoveryRoutes.get(
  '/cases/:caseId/drone-tasks',
  requirePermissions('recovery:read'),
  validate({ params: caseIdParamSchema }),
  listDroneTasksHandler,
);

recoveryRoutes.post(
  '/drone-tasks/:taskId/status',
  requirePermissions('recovery:dispatch'),
  validate({ params: taskIdParamSchema, body: updateDroneTaskSchema }),
  updateDroneTaskHandler,
);
