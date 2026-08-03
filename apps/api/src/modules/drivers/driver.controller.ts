import type { Request, Response } from 'express';
import {
  asyncHandler,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as driverService from './driver.service';
import type {
  ChangeDriverStatusInput,
  CreateDriverInput,
  ListDriversQuery,
  UpdateDriverInput,
} from './driver.schema';

export const listDriversHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await driverService.listDrivers(
    requirePrincipal(req),
    req.query as unknown as ListDriversQuery,
  );
  sendPaginated(res, page);
});

export const getDriverHandler = asyncHandler(async (req: Request, res: Response) => {
  const driver = await driverService.getDriver(
    requirePrincipal(req),
    req.params.driverId as string,
  );
  sendSuccess(res, driver);
});

export const createDriverHandler = asyncHandler(async (req: Request, res: Response) => {
  const driver = await driverService.createDriver(
    requirePrincipal(req),
    req.body as CreateDriverInput,
  );
  sendCreated(res, driver, `/api/v1/drivers/${driver.id}`);
});

export const updateDriverHandler = asyncHandler(async (req: Request, res: Response) => {
  const driver = await driverService.updateDriver(
    requirePrincipal(req),
    req.params.driverId as string,
    req.body as UpdateDriverInput,
  );
  sendSuccess(res, driver);
});

export const changeDriverStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const driver = await driverService.changeDriverStatus(
    requirePrincipal(req),
    req.params.driverId as string,
    req.body as ChangeDriverStatusInput,
  );
  sendSuccess(res, driver);
});

export const deleteDriverHandler = asyncHandler(async (req: Request, res: Response) => {
  await driverService.deleteDriver(requirePrincipal(req), req.params.driverId as string);
  sendNoContent(res);
});
