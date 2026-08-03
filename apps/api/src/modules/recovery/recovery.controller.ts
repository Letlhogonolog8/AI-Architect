import type { Request, Response } from 'express';
import { asyncHandler, sendCreated, sendPaginated, sendSuccess } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as recoveryService from './recovery.service';
import type {
  AddTrackPointInput,
  AssignSearcherInput,
  ChangeCaseStatusInput,
  CreateGeofenceInput,
  EvaluateGeofenceInput,
  ListCasesQuery,
  ListGeofencesQuery,
  OpenCaseInput,
  TaskDroneInput,
  UpdateCaseInput,
  UpdateDroneTaskInput,
  UpdateGeofenceInput,
  UpdateSearcherInput,
} from './recovery.schema';

// ------------------------------------------------------------------- cases

export const openCaseHandler = asyncHandler(async (req: Request, res: Response) => {
  const created = await recoveryService.openCase(requirePrincipal(req), req.body as OpenCaseInput);
  sendCreated(res, created, `/api/v1/recovery/cases/${created.id}`);
});

export const listCasesHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await recoveryService.listCases(
    requirePrincipal(req),
    req.query as unknown as ListCasesQuery,
  );
  sendPaginated(res, page);
});

export const getCaseHandler = asyncHandler(async (req: Request, res: Response) => {
  const detail = await recoveryService.getCase(requirePrincipal(req), req.params.caseId as string);
  sendSuccess(res, detail);
});

export const updateCaseHandler = asyncHandler(async (req: Request, res: Response) => {
  const detail = await recoveryService.updateCase(
    requirePrincipal(req),
    req.params.caseId as string,
    req.body as UpdateCaseInput,
  );
  sendSuccess(res, detail);
});

export const changeCaseStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const detail = await recoveryService.changeCaseStatus(
    requirePrincipal(req),
    req.params.caseId as string,
    req.body as ChangeCaseStatusInput,
  );
  sendSuccess(res, detail);
});

// ------------------------------------------------------------------- track

export const addTrackPointHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await recoveryService.addTrackPoint(
    requirePrincipal(req),
    req.params.caseId as string,
    req.body as AddTrackPointInput,
  );
  sendCreated(res, result);
});

export const listTrackHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await recoveryService.listTrack(
    requirePrincipal(req),
    req.params.caseId as string,
    req.query as unknown as ListCasesQuery,
  );
  sendPaginated(res, page);
});

// --------------------------------------------------------------- searchers

export const assignSearcherHandler = asyncHandler(async (req: Request, res: Response) => {
  const searcher = await recoveryService.assignSearcher(
    requirePrincipal(req),
    req.params.caseId as string,
    req.body as AssignSearcherInput,
  );
  sendCreated(res, searcher);
});

export const listSearchersHandler = asyncHandler(async (req: Request, res: Response) => {
  const searchers = await recoveryService.listSearchers(
    requirePrincipal(req),
    req.params.caseId as string,
  );
  sendSuccess(res, searchers);
});

export const updateSearcherHandler = asyncHandler(async (req: Request, res: Response) => {
  const searcher = await recoveryService.updateSearcher(
    requirePrincipal(req),
    req.params.assignmentId as string,
    req.body as UpdateSearcherInput,
  );
  sendSuccess(res, searcher);
});

// -------------------------------------------------------------- geofencing

export const createGeofenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const geofence = await recoveryService.createGeofence(
    requirePrincipal(req),
    req.body as CreateGeofenceInput,
  );
  sendCreated(res, geofence, `/api/v1/recovery/geofences/${geofence.id}`);
});

export const listGeofencesHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await recoveryService.listGeofences(
    requirePrincipal(req),
    req.query as unknown as ListGeofencesQuery,
  );
  sendPaginated(res, page);
});

export const getGeofenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const geofence = await recoveryService.getGeofence(
    requirePrincipal(req),
    req.params.geofenceId as string,
  );
  sendSuccess(res, geofence);
});

export const updateGeofenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const geofence = await recoveryService.updateGeofence(
    requirePrincipal(req),
    req.params.geofenceId as string,
    req.body as UpdateGeofenceInput,
  );
  sendSuccess(res, geofence);
});

export const deactivateGeofenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const geofence = await recoveryService.deactivateGeofence(
    requirePrincipal(req),
    req.params.geofenceId as string,
  );
  sendSuccess(res, geofence);
});

export const evaluateGeofenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const evaluation = await recoveryService.evaluateGeofences(
    requirePrincipal(req),
    req.body as EvaluateGeofenceInput,
  );
  sendSuccess(res, evaluation);
});

export const listGeofenceEventsHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await recoveryService.listGeofenceEvents(
    requirePrincipal(req),
    req.params.geofenceId as string,
    req.query as unknown as ListCasesQuery,
  );
  sendPaginated(res, page);
});

// ------------------------------------------------------------------ drones

export const taskDroneHandler = asyncHandler(async (req: Request, res: Response) => {
  const task = await recoveryService.taskDrone(
    requirePrincipal(req),
    req.params.caseId as string,
    req.body as TaskDroneInput,
  );
  sendCreated(res, task);
});

export const listDroneTasksHandler = asyncHandler(async (req: Request, res: Response) => {
  const tasks = await recoveryService.listDroneTasks(
    requirePrincipal(req),
    req.params.caseId as string,
  );
  sendSuccess(res, tasks);
});

export const updateDroneTaskHandler = asyncHandler(async (req: Request, res: Response) => {
  const task = await recoveryService.updateDroneTask(
    requirePrincipal(req),
    req.params.taskId as string,
    req.body as UpdateDroneTaskInput,
  );
  sendSuccess(res, task);
});

export const droneStatusHandler = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, recoveryService.droneSupportStatus());
});

// --------------------------------------------------------------- dashboard

export const recoveryDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const dashboard = await recoveryService.getRecoveryDashboard(requirePrincipal(req));
  sendSuccess(res, dashboard);
});
