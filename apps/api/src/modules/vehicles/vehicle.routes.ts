import { Router } from 'express';
import { authenticate, requirePermissions, validate } from '../../middleware';
import {
  changeVehicleStatusHandler,
  createVehicleHandler,
  deleteVehicleHandler,
  getVehicleHandler,
  immobiliseVehicleHandler,
  listVehiclesHandler,
  updateVehicleHandler,
} from './vehicle.controller';
import {
  changeVehicleStatusSchema,
  createVehicleSchema,
  immobiliseVehicleSchema,
  listVehiclesQuerySchema,
  updateVehicleSchema,
  vehicleIdParamSchema,
} from './vehicle.schema';

export const vehicleRoutes: Router = Router();

vehicleRoutes.use(authenticate);

vehicleRoutes.get(
  '/',
  requirePermissions('vehicle:read'),
  validate({ query: listVehiclesQuerySchema }),
  listVehiclesHandler,
);

vehicleRoutes.post(
  '/',
  requirePermissions('vehicle:create'),
  validate({ body: createVehicleSchema }),
  createVehicleHandler,
);

vehicleRoutes.get(
  '/:vehicleId',
  requirePermissions('vehicle:read'),
  validate({ params: vehicleIdParamSchema }),
  getVehicleHandler,
);

vehicleRoutes.patch(
  '/:vehicleId',
  requirePermissions('vehicle:update'),
  validate({ params: vehicleIdParamSchema, body: updateVehicleSchema }),
  updateVehicleHandler,
);

vehicleRoutes.post(
  '/:vehicleId/status',
  requirePermissions('vehicle:update'),
  validate({ params: vehicleIdParamSchema, body: changeVehicleStatusSchema }),
  changeVehicleStatusHandler,
);

/** Countermeasure. Gated on its own permission, held only by SECURITY and ADMIN. */
vehicleRoutes.post(
  '/:vehicleId/immobilise',
  requirePermissions('vehicle:immobilise'),
  validate({ params: vehicleIdParamSchema, body: immobiliseVehicleSchema }),
  immobiliseVehicleHandler,
);

vehicleRoutes.delete(
  '/:vehicleId',
  requirePermissions('vehicle:delete'),
  validate({ params: vehicleIdParamSchema }),
  deleteVehicleHandler,
);
