import type { Request, Response } from 'express';
import { asyncHandler, sendCreated, sendPaginated, sendSuccess } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as evidenceService from './evidence.service';
import type {
  ExportEvidenceInput,
  ListEvidenceQuery,
  RegisterEvidenceInput,
  SealEvidenceInput,
} from './evidence.schema';

export const listEvidenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await evidenceService.listEvidence(
    requirePrincipal(req),
    req.query as unknown as ListEvidenceQuery,
  );
  sendPaginated(res, page);
});

export const getEvidenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const evidence = await evidenceService.getEvidence(
    requirePrincipal(req),
    req.params.evidenceId as string,
  );
  sendSuccess(res, evidence);
});

export const registerEvidenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const evidence = await evidenceService.registerEvidence(
    requirePrincipal(req),
    req.body as RegisterEvidenceInput,
  );
  sendCreated(res, evidence, `/api/v1/evidence/${evidence.id}`);
});

export const sealEvidenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const evidence = await evidenceService.sealEvidence(
    requirePrincipal(req),
    req.params.evidenceId as string,
    req.body as SealEvidenceInput,
  );
  sendSuccess(res, evidence);
});

export const exportEvidenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const evidence = await evidenceService.exportEvidence(
    requirePrincipal(req),
    req.params.evidenceId as string,
    req.body as ExportEvidenceInput,
  );
  sendSuccess(res, evidence);
});

export const custodyChainHandler = asyncHandler(async (req: Request, res: Response) => {
  const chain = await evidenceService.getCustodyChain(
    requirePrincipal(req),
    req.params.evidenceId as string,
  );
  sendSuccess(res, chain);
});
