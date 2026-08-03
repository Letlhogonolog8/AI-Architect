import { Router } from 'express';
import { authenticate, ingestRateLimit, requirePermissions, validate } from '../../middleware';
import {
  ingestTelemetryHandler,
  latestTelemetryHandler,
  telemetryWindowHandler,
} from './telemetry.controller';
import {
  ingestTelemetrySchema,
  telemetryWindowQuerySchema,
  vehicleIdParamSchema,
} from './telemetry.schema';

export const telemetryRoutes: Router = Router();

telemetryRoutes.use(authenticate);

/** Device ingest. Its own rate-limit bucket so it cannot starve operator traffic. */
telemetryRoutes.post(
  '/',
  ingestRateLimit,
  requirePermissions('telemetry:ingest'),
  validate({ body: ingestTelemetrySchema }),
  ingestTelemetryHandler,
);

telemetryRoutes.get(
  '/vehicles/:vehicleId',
  requirePermissions('telemetry:read'),
  validate({ params: vehicleIdParamSchema, query: telemetryWindowQuerySchema }),
  telemetryWindowHandler,
);

telemetryRoutes.get(
  '/vehicles/:vehicleId/latest',
  requirePermissions('telemetry:read'),
  validate({ params: vehicleIdParamSchema }),
  latestTelemetryHandler,
);
