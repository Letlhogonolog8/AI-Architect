import type { Request, Response } from 'express';
import { asyncHandler, sendCreated, sendPaginated, sendSuccess } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as cabinService from './cabin.service';
import type {
  EnrolSensorBody,
  ListDetectionsQuery,
  SensorHeartbeatBody,
  SubmitSnapshotBody,
  UpdateSensorBody,
  WeaponVerdictBody,
} from './cabin.schema';

export const submitSnapshotHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await cabinService.submitSnapshot(
    requirePrincipal(req),
    req.body as SubmitSnapshotBody,
  );

  // The derived signals come back so the AI gateway can fold them into its
  // behaviour submission rather than making a second round trip for them.
  sendCreated(res, result, `/api/v1/cabin/detections/${result.detectionId}`);
});

export const listDetectionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await cabinService.listDetections(
    requirePrincipal(req),
    req.query as unknown as ListDetectionsQuery,
  );

  sendPaginated(res, page);
});

export const vehicleCabinHandler = asyncHandler(async (req: Request, res: Response) => {
  const detection = await cabinService.getVehicleCabin(
    requirePrincipal(req),
    req.params.vehicleId as string,
  );

  sendSuccess(res, detection);
});

export const weaponVerdictHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as WeaponVerdictBody;

  const detection = await cabinService.recordWeaponVerdict(
    requirePrincipal(req),
    req.params.detectionId as string,
    { verdict: body.verdict, justification: body.justification },
  );

  sendSuccess(res, detection);
});

export const listSensorsHandler = asyncHandler(async (req: Request, res: Response) => {
  const sensors = await cabinService.listSensors(
    requirePrincipal(req),
    req.params.vehicleId as string,
  );

  sendSuccess(res, sensors);
});

export const enrolSensorHandler = asyncHandler(async (req: Request, res: Response) => {
  const sensor = await cabinService.enrolSensor(requirePrincipal(req), req.body as EnrolSensorBody);

  sendCreated(res, sensor, `/api/v1/cabin/sensors/${sensor.id}`);
});

export const updateSensorHandler = asyncHandler(async (req: Request, res: Response) => {
  const sensor = await cabinService.updateSensor(
    requirePrincipal(req),
    req.params.sensorId as string,
    req.body as UpdateSensorBody,
  );

  sendSuccess(res, sensor);
});

export const heartbeatHandler = asyncHandler(async (req: Request, res: Response) => {
  const sensor = await cabinService.recordHeartbeat(
    requirePrincipal(req),
    req.body as SensorHeartbeatBody,
  );

  sendSuccess(res, sensor);
});

export const removeSensorHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await cabinService.removeSensor(
    requirePrincipal(req),
    req.params.sensorId as string,
  );

  sendSuccess(res, result);
});

export const retentionPolicyHandler = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, cabinService.getRetentionPolicy());
});
