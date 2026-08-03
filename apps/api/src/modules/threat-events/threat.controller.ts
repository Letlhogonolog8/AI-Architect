import type { Request, Response } from 'express';
import { asyncHandler, sendCreated, sendPaginated, sendSuccess } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as threatService from './threat.service';
import type { ListThreatEventsQuery, RecordThreatEventInput } from './threat.schema';

export const listThreatEventsHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await threatService.listThreatEvents(
    requirePrincipal(req),
    req.query as unknown as ListThreatEventsQuery,
  );
  sendPaginated(res, page);
});

export const getThreatEventHandler = asyncHandler(async (req: Request, res: Response) => {
  const event = await threatService.getThreatEvent(
    requirePrincipal(req),
    req.params.threatEventId as string,
  );
  sendSuccess(res, event);
});

export const recordThreatEventHandler = asyncHandler(async (req: Request, res: Response) => {
  const event = await threatService.recordThreatEvent(
    requirePrincipal(req),
    req.body as RecordThreatEventInput,
  );
  sendCreated(res, event, `/api/v1/threat-events/${event.id}`);
});

export const acknowledgeThreatEventHandler = asyncHandler(async (req: Request, res: Response) => {
  const event = await threatService.acknowledgeThreatEvent(
    requirePrincipal(req),
    req.params.threatEventId as string,
  );
  sendSuccess(res, event);
});

export const listThreatZonesHandler = asyncHandler(async (req: Request, res: Response) => {
  const zones = await threatService.listThreatZones(requirePrincipal(req));
  sendSuccess(res, zones);
});
