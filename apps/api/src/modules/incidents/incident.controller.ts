import type { Request, Response } from 'express';
import {
  asyncHandler,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as incidentService from './incident.service';
import type {
  AddTimelineNoteInput,
  ChangeIncidentStatusInput,
  CreateIncidentInput,
  DispatchInput,
  ListIncidentsQuery,
  UpdateIncidentInput,
} from './incident.schema';

export const listIncidentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await incidentService.listIncidents(
    requirePrincipal(req),
    req.query as unknown as ListIncidentsQuery,
  );
  sendPaginated(res, page);
});

export const getIncidentHandler = asyncHandler(async (req: Request, res: Response) => {
  const incident = await incidentService.getIncident(
    requirePrincipal(req),
    req.params.incidentId as string,
  );
  sendSuccess(res, incident);
});

export const createIncidentHandler = asyncHandler(async (req: Request, res: Response) => {
  const incident = await incidentService.createIncident(
    requirePrincipal(req),
    req.body as CreateIncidentInput,
  );
  sendCreated(res, incident, `/api/v1/incidents/${incident.id}`);
});

export const updateIncidentHandler = asyncHandler(async (req: Request, res: Response) => {
  const incident = await incidentService.updateIncident(
    requirePrincipal(req),
    req.params.incidentId as string,
    req.body as UpdateIncidentInput,
  );
  sendSuccess(res, incident);
});

export const changeIncidentStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const incident = await incidentService.changeIncidentStatus(
    requirePrincipal(req),
    req.params.incidentId as string,
    req.body as ChangeIncidentStatusInput,
  );
  sendSuccess(res, incident);
});

export const dispatchHandler = asyncHandler(async (req: Request, res: Response) => {
  const incident = await incidentService.dispatchResponder(
    requirePrincipal(req),
    req.params.incidentId as string,
    req.body as DispatchInput,
  );
  sendSuccess(res, incident);
});

export const getTimelineHandler = asyncHandler(async (req: Request, res: Response) => {
  const timeline = await incidentService.getTimeline(
    requirePrincipal(req),
    req.params.incidentId as string,
  );
  sendSuccess(res, timeline);
});

export const addTimelineNoteHandler = asyncHandler(async (req: Request, res: Response) => {
  await incidentService.addTimelineNote(
    requirePrincipal(req),
    req.params.incidentId as string,
    req.body as AddTimelineNoteInput,
  );
  sendNoContent(res);
});
