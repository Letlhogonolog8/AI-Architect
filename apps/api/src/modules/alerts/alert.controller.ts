import type { Request, Response } from 'express';
import { asyncHandler, sendCreated, sendPaginated, sendSuccess } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as alertService from './alert.service';
import type {
  AcknowledgeAlertInput,
  ListAlertsQuery,
  RaiseAlertInput,
  SuppressAlertInput,
} from './alert.schema';

export const listAlertsHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await alertService.listAlerts(
    requirePrincipal(req),
    req.query as unknown as ListAlertsQuery,
  );
  sendPaginated(res, page);
});

export const getAlertHandler = asyncHandler(async (req: Request, res: Response) => {
  const alert = await alertService.getAlert(requirePrincipal(req), req.params.alertId as string);
  sendSuccess(res, alert);
});

export const raiseAlertHandler = asyncHandler(async (req: Request, res: Response) => {
  const alert = await alertService.raiseAlert(requirePrincipal(req), req.body as RaiseAlertInput);
  sendCreated(res, alert, `/api/v1/alerts/${alert.id}`);
});

export const acknowledgeAlertHandler = asyncHandler(async (req: Request, res: Response) => {
  const alert = await alertService.acknowledgeAlert(
    requirePrincipal(req),
    req.params.alertId as string,
    req.body as AcknowledgeAlertInput,
  );
  sendSuccess(res, alert);
});

export const suppressAlertHandler = asyncHandler(async (req: Request, res: Response) => {
  const alert = await alertService.suppressAlert(
    requirePrincipal(req),
    req.params.alertId as string,
    req.body as SuppressAlertInput,
  );
  sendSuccess(res, alert);
});
