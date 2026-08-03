import { Router } from 'express';
import { authenticate, requirePermissions, validate } from '../../middleware';
import {
  changeDriverStatusHandler,
  createDriverHandler,
  deleteDriverHandler,
  getDriverHandler,
  listDriversHandler,
  updateDriverHandler,
} from './driver.controller';
import {
  changeDriverStatusSchema,
  createDriverSchema,
  driverIdParamSchema,
  listDriversQuerySchema,
  updateDriverSchema,
} from './driver.schema';

export const driverRoutes: Router = Router();

driverRoutes.use(authenticate);

driverRoutes.get(
  '/',
  requirePermissions('driver:read'),
  validate({ query: listDriversQuerySchema }),
  listDriversHandler,
);

driverRoutes.post(
  '/',
  requirePermissions('driver:create'),
  validate({ body: createDriverSchema }),
  createDriverHandler,
);

driverRoutes.get(
  '/:driverId',
  requirePermissions('driver:read'),
  validate({ params: driverIdParamSchema }),
  getDriverHandler,
);

driverRoutes.patch(
  '/:driverId',
  requirePermissions('driver:update'),
  validate({ params: driverIdParamSchema, body: updateDriverSchema }),
  updateDriverHandler,
);

driverRoutes.post(
  '/:driverId/status',
  requirePermissions('driver:update'),
  validate({ params: driverIdParamSchema, body: changeDriverStatusSchema }),
  changeDriverStatusHandler,
);

driverRoutes.delete(
  '/:driverId',
  requirePermissions('driver:delete'),
  validate({ params: driverIdParamSchema }),
  deleteDriverHandler,
);
