import type { Request, Response } from 'express';
import {
  asyncHandler,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as vehicleService from './vehicle.service';
import type {
  ChangeVehicleStatusInput,
  CreateVehicleInput,
  ImmobiliseVehicleInput,
  ListVehiclesQuery,
  UpdateVehicleInput,
} from './vehicle.schema';

/**
 * Controllers do three things and nothing else: pull the principal, hand
 * already-validated input to a service, and pick a response shape. No business
 * rules and no Prisma calls live at this layer.
 */

export const listVehiclesHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await vehicleService.listVehicles(
    requirePrincipal(req),
    req.query as unknown as ListVehiclesQuery,
  );
  sendPaginated(res, page);
});

export const getVehicleHandler = asyncHandler(async (req: Request, res: Response) => {
  const vehicle = await vehicleService.getVehicle(
    requirePrincipal(req),
    req.params.vehicleId as string,
  );
  sendSuccess(res, vehicle);
});

export const createVehicleHandler = asyncHandler(async (req: Request, res: Response) => {
  const vehicle = await vehicleService.createVehicle(
    requirePrincipal(req),
    req.body as CreateVehicleInput,
  );
  sendCreated(res, vehicle, `/api/v1/vehicles/${vehicle.id}`);
});

export const updateVehicleHandler = asyncHandler(async (req: Request, res: Response) => {
  const vehicle = await vehicleService.updateVehicle(
    requirePrincipal(req),
    req.params.vehicleId as string,
    req.body as UpdateVehicleInput,
  );
  sendSuccess(res, vehicle);
});

export const changeVehicleStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const vehicle = await vehicleService.changeVehicleStatus(
    requirePrincipal(req),
    req.params.vehicleId as string,
    req.body as ChangeVehicleStatusInput,
  );
  sendSuccess(res, vehicle);
});

export const immobiliseVehicleHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as ImmobiliseVehicleInput;
  const vehicle = await vehicleService.immobiliseVehicle(
    requirePrincipal(req),
    req.params.vehicleId as string,
    body.reason,
    body.incidentId,
  );
  sendSuccess(res, vehicle);
});

export const deleteVehicleHandler = asyncHandler(async (req: Request, res: Response) => {
  await vehicleService.deleteVehicle(requirePrincipal(req), req.params.vehicleId as string);
  sendNoContent(res);
});
