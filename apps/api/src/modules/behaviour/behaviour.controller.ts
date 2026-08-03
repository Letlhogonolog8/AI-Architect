import type { Request, Response } from 'express';
import { asyncHandler, sendCreated, sendSuccess, sendPaginated } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as behaviourService from './behaviour.service';
import type { ListAssessmentsQuery, SubmitBehaviourBody } from './behaviour.schema';

export const submitBehaviourHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as SubmitBehaviourBody;

  const assessment = await behaviourService.submitBehaviour(requirePrincipal(req), {
    driverId: body.driverId,
    vehicleId: body.vehicleId,
    observations: body.observations,
    context: body.context,
    identityBand: body.identityBand,
    identityAssessedAt: body.identityAssessedAt,
    occupantCount: body.occupantCount,
    expectedCount: body.expectedCount,
    speakerCount: body.speakerCount,
    arousalIndicators: body.arousalIndicators,
    features: body.features,
    observedSeconds: body.observedSeconds,
  });

  sendCreated(res, assessment, `/api/v1/behaviour/assessments/${assessment.id}`);
});

export const listAssessmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListAssessmentsQuery;

  const page = await behaviourService.listAssessments(requirePrincipal(req), {
    driverId: query.driverId,
    vehicleId: query.vehicleId,
    level: query.level,
    duressIndicated: query.duressIndicated,
    from: query.from,
    to: query.to,
    page: query.page,
    pageSize: query.pageSize,
  });

  sendPaginated(res, page);
});

export const vehicleThreatHandler = asyncHandler(async (req: Request, res: Response) => {
  const assessment = await behaviourService.getVehicleThreat(
    requirePrincipal(req),
    req.params.vehicleId as string,
  );

  sendSuccess(res, assessment);
});

export const driverThreatHandler = asyncHandler(async (req: Request, res: Response) => {
  const assessment = await behaviourService.getDriverThreat(
    requirePrincipal(req),
    req.params.driverId as string,
  );

  sendSuccess(res, assessment);
});

export const baselineStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const status = await behaviourService.getBaselineStatus(
    requirePrincipal(req),
    req.params.driverId as string,
  );

  sendSuccess(res, status);
});

export const resetBaselineHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await behaviourService.resetBaseline(
    requirePrincipal(req),
    req.params.driverId as string,
  );

  sendSuccess(res, result);
});

export const calibrationHandler = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, behaviourService.getCalibration());
});
