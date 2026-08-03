import type { Request, Response } from 'express';
import { asyncHandler, sendCreated, sendPaginated, sendSuccess } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as vaultService from './vault.service';
import type { CreateExportBundleInput, ListExportBundlesQuery } from './vault.schema';

export const getSealHandler = asyncHandler(async (req: Request, res: Response) => {
  const seal = await vaultService.getSeal(requirePrincipal(req), req.params.evidenceId as string);
  sendSuccess(res, seal);
});

export const verifyEvidenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const verification = await vaultService.verifyEvidence(
    requirePrincipal(req),
    req.params.evidenceId as string,
  );
  sendSuccess(res, verification);
});

export const createExportBundleHandler = asyncHandler(async (req: Request, res: Response) => {
  const bundle = await vaultService.createCourtExport(
    requirePrincipal(req),
    req.body as CreateExportBundleInput,
  );
  sendCreated(res, bundle, `/api/v1/evidence/exports/${bundle.id}`);
});

export const getExportBundleHandler = asyncHandler(async (req: Request, res: Response) => {
  const bundle = await vaultService.getExportBundle(
    requirePrincipal(req),
    req.params.bundleId as string,
  );
  sendSuccess(res, bundle);
});

export const listExportBundlesHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await vaultService.listExportBundles(
    requirePrincipal(req),
    req.query as unknown as ListExportBundlesQuery,
  );
  sendPaginated(res, page);
});

export const replayTimelineHandler = asyncHandler(async (req: Request, res: Response) => {
  const timeline = await vaultService.getReplayTimeline(
    requirePrincipal(req),
    req.params.incidentId as string,
  );
  sendSuccess(res, timeline);
});

export const signerStatusHandler = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, vaultService.signerStatus());
});
