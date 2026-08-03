import type { Request, Response } from 'express';
import { asyncHandler, sendSuccess } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as telemetryService from './telemetry.service';
import type { IngestTelemetryInput, TelemetryWindowQuery } from './telemetry.schema';

export const ingestTelemetryHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await telemetryService.ingestTelemetry(
    requirePrincipal(req),
    req.body as IngestTelemetryInput,
  );
  // 202: the frames are durable, but the risk engine has not scored them yet.
  sendSuccess(res, result, 202);
});

export const telemetryWindowHandler = asyncHandler(async (req: Request, res: Response) => {
  const points = await telemetryService.getTelemetryWindow(
    requirePrincipal(req),
    req.params.vehicleId as string,
    req.query as unknown as TelemetryWindowQuery,
  );
  sendSuccess(res, points);
});

export const latestTelemetryHandler = asyncHandler(async (req: Request, res: Response) => {
  const point = await telemetryService.getLatestTelemetry(
    requirePrincipal(req),
    req.params.vehicleId as string,
  );
  sendSuccess(res, point);
});
