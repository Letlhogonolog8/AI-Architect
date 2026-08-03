import type { Request, Response } from 'express';
import { asyncHandler, sendSuccess } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as dashboardService from './dashboard.service';

export const fleetSnapshotHandler = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await dashboardService.getFleetSnapshot(requirePrincipal(req)));
});

export const analyticsSummaryHandler = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await dashboardService.getAnalyticsSummary(requirePrincipal(req)));
});
