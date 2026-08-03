import type { Request, Response } from 'express';
import type { SosActivationReceipt } from '@aegisdrive/types';
import { asyncHandler, sendSuccess, sendPaginated } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as sosService from './sos.service';
import type {
  AcknowledgeSosInput,
  ActivateSosInput,
  DispatchSosInput,
  ListActivationsQuery,
  ResolveSosInput,
} from './sos.schema';

/**
 * Raises a silent SOS.
 *
 * Answers `202` with a single neutral receipt — `{ received: true }` — and
 * nothing else. No identifier, no status, no indication of what happened. This
 * is a security control, not an oversight: the response is identical for a fresh
 * emergency, a de-duplicated repeat, and anything an observer could provoke, so
 * a captor watching the driver's screen learns nothing from it. The real record
 * lives server-side, visible only to the control room.
 */
export const activateSosHandler = asyncHandler(async (req: Request, res: Response) => {
  await sosService.activateSos(requirePrincipal(req), req.body as ActivateSosInput);
  const receipt: SosActivationReceipt = { received: true };
  sendSuccess(res, receipt, 202);
});

export const listActivationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await sosService.listActivations(
    requirePrincipal(req),
    req.query as unknown as ListActivationsQuery,
  );
  sendPaginated(res, page);
});

export const getActivationHandler = asyncHandler(async (req: Request, res: Response) => {
  const activation = await sosService.getActivation(
    requirePrincipal(req),
    req.params.activationId as string,
  );
  sendSuccess(res, activation);
});

export const acknowledgeActivationHandler = asyncHandler(async (req: Request, res: Response) => {
  const activation = await sosService.acknowledgeActivation(
    requirePrincipal(req),
    req.params.activationId as string,
    req.body as AcknowledgeSosInput,
  );
  sendSuccess(res, activation);
});

export const resolveActivationHandler = asyncHandler(async (req: Request, res: Response) => {
  const activation = await sosService.resolveActivation(
    requirePrincipal(req),
    req.params.activationId as string,
    req.body as ResolveSosInput,
  );
  sendSuccess(res, activation);
});

export const dispatchActivationHandler = asyncHandler(async (req: Request, res: Response) => {
  const activation = await sosService.dispatchActivation(
    requirePrincipal(req),
    req.params.activationId as string,
    req.body as DispatchSosInput,
  );
  sendSuccess(res, activation);
});

export const channelStatusHandler = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, sosService.channelStatus());
});
