import type { Request, Response } from 'express';
import { asyncHandler, sendCreated, sendPaginated, sendSuccess } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as corridorService from './corridor.service';
import type {
  CreateHavenBody,
  EquityQuery,
  GrantPoliceShareBody,
  HavenQuery,
  ListPlansQuery,
  PlanRouteBody,
  RecordHazardBody,
} from './corridor.schema';

export const planRouteHandler = asyncHandler(async (req: Request, res: Response) => {
  const plan = await corridorService.planRouteForRequest(
    requirePrincipal(req),
    req.body as PlanRouteBody,
  );

  sendCreated(res, plan, `/api/v1/corridor/plans/${plan.id}`);
});

export const listPlansHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await corridorService.listPlans(
    requirePrincipal(req),
    req.query as unknown as ListPlansQuery,
  );

  sendPaginated(res, page);
});

export const getPlanHandler = asyncHandler(async (req: Request, res: Response) => {
  const plan = await corridorService.getPlan(requirePrincipal(req), req.params.planId as string);
  sendSuccess(res, plan);
});

export const recordHazardHandler = asyncHandler(async (req: Request, res: Response) => {
  const hazard = await corridorService.recordHazard(
    requirePrincipal(req),
    req.body as RecordHazardBody,
  );

  sendCreated(res, hazard, '/api/v1/corridor/hazards');
});

export const listHavensHandler = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await corridorService.listHavens(requirePrincipal(req)));
});

export const nearestHavensHandler = asyncHandler(async (req: Request, res: Response) => {
  const havens = await corridorService.nearestHavens(
    requirePrincipal(req),
    req.query as unknown as HavenQuery,
  );

  sendSuccess(res, havens);
});

export const createHavenHandler = asyncHandler(async (req: Request, res: Response) => {
  const haven = await corridorService.createHaven(
    requirePrincipal(req),
    req.body as CreateHavenBody,
  );

  sendCreated(res, haven, `/api/v1/corridor/havens/${haven.id}`);
});

export const verifyHavenHandler = asyncHandler(async (req: Request, res: Response) => {
  const haven = await corridorService.verifyHaven(
    requirePrincipal(req),
    req.params.havenId as string,
  );

  sendSuccess(res, haven);
});

export const equityReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const report = await corridorService.getEquityReport(
    requirePrincipal(req),
    req.query as unknown as EquityQuery,
  );

  sendSuccess(res, report);
});

export const grantShareHandler = asyncHandler(async (req: Request, res: Response) => {
  const share = await corridorService.grantPoliceShare(
    requirePrincipal(req),
    req.body as GrantPoliceShareBody,
  );

  sendCreated(res, share, `/api/v1/corridor/police-shares/${share.id}`);
});

export const resolveShareHandler = asyncHandler(async (req: Request, res: Response) => {
  const resolved = await corridorService.resolvePoliceShare(req.params.shareId as string);
  sendSuccess(res, resolved);
});

export const revokeShareHandler = asyncHandler(async (req: Request, res: Response) => {
  const share = await corridorService.revokePoliceShare(
    requirePrincipal(req),
    req.params.shareId as string,
  );

  sendSuccess(res, share);
});

export const incidentSharesHandler = asyncHandler(async (req: Request, res: Response) => {
  const shares = await corridorService.listSharesForIncident(
    requirePrincipal(req),
    req.params.incidentId as string,
  );

  sendSuccess(res, shares);
});
