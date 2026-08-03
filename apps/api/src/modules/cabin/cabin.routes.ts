import { Router } from 'express';
import { authenticate, ingestRateLimit, requirePermissions, validate } from '../../middleware';
import {
  enrolSensorHandler,
  heartbeatHandler,
  listDetectionsHandler,
  listSensorsHandler,
  removeSensorHandler,
  retentionPolicyHandler,
  submitSnapshotHandler,
  updateSensorHandler,
  vehicleCabinHandler,
  weaponVerdictHandler,
} from './cabin.controller';
import {
  detectionIdParamSchema,
  enrolSensorSchema,
  listDetectionsQuerySchema,
  sensorHeartbeatSchema,
  sensorIdParamSchema,
  submitSnapshotSchema,
  updateSensorSchema,
  vehicleIdParamSchema,
  weaponVerdictSchema,
} from './cabin.schema';

/**
 * Cabin Intelligence Engine routes.
 *
 * Permissions split more finely than anywhere except identity, because the
 * capabilities differ enormously in how invasive they are:
 *
 *   - `cabin:read`   — see detections and counts. Routine control-room work.
 *   - `cabin:submit` — contribute a perception window. The AI gateway.
 *   - `cabin:review` — rule on a weapon candidate. The determination that can
 *                      lead to an armed response.
 *   - `cabin:manage` — enrol and remove sensors.
 *   - `cabin:stream` — watch live interior video of a person at work.
 *
 * ## Why `cabin:stream` is its own permission
 *
 * Reading "3 occupants, one unattributed" and watching a live feed of a
 * driver's face for an hour are not the same act, and a role system that grants
 * them together has not understood the difference. Almost everything the
 * control room does is served by the first. The second is for an incident in
 * progress, and it is held by fewer people.
 *
 * The streaming endpoint itself belongs to the media service rather than this
 * router — the API does not proxy video — but the permission is defined here
 * with the rest of the cabin surface so the split is visible in one place.
 *
 * ## Routes that deliberately do not exist
 *
 * **No media ingest.** Nothing here accepts a frame or an audio buffer. Media
 * reaches durable storage only through the evidence service, when an incident
 * is opened, where it inherits a chain of custody.
 *
 * **No bulk detection export.** Reads are scoped to a vehicle or a page of
 * recent windows. A fleet-wide walk of every cabin detection has no operational
 * use and would be a driver-monitoring report.
 *
 * **No verdict revision.** A weapon determination is recorded once. It may be
 * produced in an investigation, including one into whether the response was
 * justified, and a revisable verdict is worth nothing there.
 */
export const cabinRoutes: Router = Router();

cabinRoutes.use(authenticate);

// ----------------------------------------------------------------- ingestion

/**
 * Ingest path. Rate-limited with the telemetry bucket: a cabin pipeline
 * submitting a window every few seconds is device-class traffic and must not be
 * able to exhaust an operator's request budget.
 */
cabinRoutes.post(
  '/snapshots',
  ingestRateLimit,
  requirePermissions('cabin:submit'),
  validate({ body: submitSnapshotSchema }),
  submitSnapshotHandler,
);

cabinRoutes.post(
  '/sensors/heartbeat',
  ingestRateLimit,
  requirePermissions('cabin:submit'),
  validate({ body: sensorHeartbeatSchema }),
  heartbeatHandler,
);

// ----------------------------------------------------------------- reporting

cabinRoutes.get(
  '/detections',
  requirePermissions('cabin:read'),
  validate({ query: listDetectionsQuerySchema }),
  listDetectionsHandler,
);

/** The current cabin picture for a vehicle. */
cabinRoutes.get(
  '/vehicles/:vehicleId/cabin',
  requirePermissions('cabin:read'),
  validate({ params: vehicleIdParamSchema }),
  vehicleCabinHandler,
);

// ------------------------------------------------------------ weapon review

/**
 * An operator's determination on a weapon candidate.
 *
 * Gated on `cabin:review`, which is deliberately narrower than `cabin:read`.
 * Confirming a weapon converts a detector output with a typically sub-one-percent
 * posterior into grounds for an armed response, and that is not a routine
 * triage action.
 *
 * A justification is required on confirmations as well as rejections.
 */
cabinRoutes.post(
  '/detections/:detectionId/weapon-verdict',
  requirePermissions('cabin:review'),
  validate({ params: detectionIdParamSchema, body: weaponVerdictSchema }),
  weaponVerdictHandler,
);

// ------------------------------------------------------------------- sensors

cabinRoutes.get(
  '/vehicles/:vehicleId/sensors',
  requirePermissions('cabin:read'),
  validate({ params: vehicleIdParamSchema }),
  listSensorsHandler,
);

/**
 * Enrols a sensor.
 *
 * Refused when `recordingIndicatorFitted` is false. Workers under continuous
 * camera observation must know the camera is there, and an unmarked
 * installation would otherwise surface only at audit — after months of footage
 * nobody was told about.
 */
cabinRoutes.post(
  '/sensors',
  requirePermissions('cabin:manage'),
  validate({ body: enrolSensorSchema }),
  enrolSensorHandler,
);

cabinRoutes.patch(
  '/sensors/:sensorId',
  requirePermissions('cabin:manage'),
  validate({ params: sensorIdParamSchema, body: updateSensorSchema }),
  updateSensorHandler,
);

cabinRoutes.delete(
  '/sensors/:sensorId',
  requirePermissions('cabin:manage'),
  validate({ params: sensorIdParamSchema }),
  removeSensorHandler,
);

// ----------------------------------------------------------------- retention

/**
 * The retention policy in force.
 *
 * Gated on `cabin:read` rather than an administrative permission, on purpose. A
 * driver, a works council or a regulator is entitled to see what is kept and
 * for how long without reading the source, and publishing it makes quietly
 * changing it harder.
 */
cabinRoutes.get('/retention-policy', requirePermissions('cabin:read'), retentionPolicyHandler);
