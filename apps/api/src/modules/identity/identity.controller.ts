import type { Request, Response } from 'express';
import {
  asyncHandler,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as identityService from './identity.service';
import type {
  CreateOccupantBody,
  DeviceAttestationBody,
  EnrolBody,
  ListAssessmentsQuery,
  RespondToChallengeBody,
  SubmitObservationsBody,
} from './identity.schema';

export const submitObservationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as SubmitObservationsBody;

  const assessment = await identityService.submitObservations(requirePrincipal(req), {
    driverId: body.driverId,
    vehicleId: body.vehicleId,
    observations: body.observations,
    occupancy: body.occupancy,
  });

  sendCreated(res, assessment, `/api/v1/identity/assessments/${assessment.id}`);
});

export const listAssessmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListAssessmentsQuery;

  const page = await identityService.listAssessments(requirePrincipal(req), {
    driverId: query.driverId,
    vehicleId: query.vehicleId,
    band: query.band,
    page: query.page,
    pageSize: query.pageSize,
  });

  sendPaginated(res, page);
});

export const driverConfidenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const assessment = await identityService.getDriverConfidence(
    requirePrincipal(req),
    req.params.driverId as string,
  );

  sendSuccess(res, assessment);
});

export const enrolHandler = asyncHandler(async (req: Request, res: Response) => {
  const enrolment = await identityService.enrol(requirePrincipal(req), req.body as EnrolBody);
  sendCreated(res, enrolment, `/api/v1/identity/enrolments/${enrolment.id}`);
});

export const listEnrolmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as { driverId?: string; occupantId?: string };
  const enrolments = await identityService.listEnrolments(requirePrincipal(req), query);
  sendSuccess(res, enrolments);
});

export const withdrawConsentHandler = asyncHandler(async (req: Request, res: Response) => {
  const enrolment = await identityService.withdrawConsent(
    requirePrincipal(req),
    req.params.enrolmentId as string,
  );
  sendSuccess(res, enrolment);
});

export const deviceAttestationHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await identityService.recordDeviceAttestation(
    requirePrincipal(req),
    req.body as DeviceAttestationBody,
  );

  // The observation is returned so the caller can fold it into its next
  // submission rather than making a second round trip for it.
  sendSuccess(res, { device: result.device, observation: result.observation });
});

export const listDevicesHandler = asyncHandler(async (req: Request, res: Response) => {
  const devices = await identityService.listDevices(
    requirePrincipal(req),
    req.params.driverId as string,
  );
  sendSuccess(res, devices);
});

export const respondToChallengeHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as RespondToChallengeBody;

  const challenge = await identityService.respondToChallenge(
    requirePrincipal(req),
    req.params.challengeId as string,
    body.outcome,
  );

  sendSuccess(res, challenge);
});

export const listOccupantsHandler = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await identityService.listOccupants(requirePrincipal(req)));
});

export const createOccupantHandler = asyncHandler(async (req: Request, res: Response) => {
  const occupant = await identityService.createOccupant(
    requirePrincipal(req),
    req.body as CreateOccupantBody,
  );
  sendCreated(res, occupant, `/api/v1/identity/occupants/${occupant.id}`);
});
