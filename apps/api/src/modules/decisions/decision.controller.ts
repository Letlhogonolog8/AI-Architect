import type { Request, Response } from 'express';
import { asyncHandler, sendCreated, sendPaginated, sendSuccess } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as decisionService from './decision.service';
import type { DecideBody, ListDecisionsQuery, OverrideBody } from './decision.schema';

export const decideHandler = asyncHandler(async (req: Request, res: Response) => {
  const decision = await decisionService.runDecision(requirePrincipal(req), req.body as DecideBody);

  sendCreated(res, decision, `/api/v1/decisions/${decision.id}`);
});

export const listDecisionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await decisionService.listDecisions(
    requirePrincipal(req),
    req.query as unknown as ListDecisionsQuery,
  );

  sendPaginated(res, page);
});

export const getDecisionHandler = asyncHandler(async (req: Request, res: Response) => {
  const decision = await decisionService.getDecision(
    requirePrincipal(req),
    req.params.decisionId as string,
  );

  sendSuccess(res, decision);
});

export const vehicleDecisionHandler = asyncHandler(async (req: Request, res: Response) => {
  const decision = await decisionService.getVehicleDecision(
    requirePrincipal(req),
    req.params.vehicleId as string,
  );

  sendSuccess(res, decision);
});

export const overrideHandler = asyncHandler(async (req: Request, res: Response) => {
  const decision = await decisionService.overrideDecision(
    requirePrincipal(req),
    req.params.decisionId as string,
    req.body as OverrideBody,
  );

  sendSuccess(res, decision);
});

export const calibrationReviewHandler = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await decisionService.getCalibrationReview(requirePrincipal(req)));
});
