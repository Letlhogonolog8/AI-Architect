import { Router } from 'express';
import { authenticate, ingestRateLimit, requirePermissions, validate } from '../../middleware';
import {
  createOccupantHandler,
  deviceAttestationHandler,
  driverConfidenceHandler,
  enrolHandler,
  listAssessmentsHandler,
  listDevicesHandler,
  listEnrolmentsHandler,
  listOccupantsHandler,
  respondToChallengeHandler,
  submitObservationsHandler,
  withdrawConsentHandler,
} from './identity.controller';
import {
  challengeIdParamSchema,
  createOccupantSchema,
  deviceAttestationSchema,
  driverIdParamSchema,
  enrolSchema,
  enrolmentIdParamSchema,
  listAssessmentsQuerySchema,
  respondToChallengeSchema,
  submitObservationsSchema,
} from './identity.schema';

/**
 * Continuous Identity Engine routes.
 *
 * Permissions are split more finely here than anywhere else in the API, because
 * the capabilities differ sharply in sensitivity:
 *
 *   - `identity:read`   — see a confidence score. Routine control-room work.
 *   - `identity:submit` — contribute an observation. Held by drivers (own device)
 *                         and the AI gateway service account.
 *   - `identity:enrol`  — register someone's biometric template. This is
 *                         processing special-category personal data and is
 *                         restricted to administrators.
 *   - `identity:manage` — withdraw consent, manage occupants.
 *
 * **There is no route that returns a template, and no route that accepts a raw
 * biometric sample.** Both absences are deliberate and load-bearing.
 */
export const identityRoutes: Router = Router();

identityRoutes.use(authenticate);

// ----------------------------------------------------------------- assessment

/**
 * Ingest path. Rate-limited with the telemetry bucket because a cabin camera
 * scoring at 1 Hz is device-class traffic, not operator traffic, and must not
 * be able to exhaust an operator's request budget.
 */
identityRoutes.post(
  '/observations',
  ingestRateLimit,
  requirePermissions('identity:submit'),
  validate({ body: submitObservationsSchema }),
  submitObservationsHandler,
);

identityRoutes.get(
  '/assessments',
  requirePermissions('identity:read'),
  validate({ query: listAssessmentsQuerySchema }),
  listAssessmentsHandler,
);

/** The driver confidence score — the engine's headline output. */
identityRoutes.get(
  '/drivers/:driverId/confidence',
  requirePermissions('identity:read'),
  validate({ params: driverIdParamSchema }),
  driverConfidenceHandler,
);

// ------------------------------------------------------------------ enrolment

identityRoutes.get('/enrolments', requirePermissions('identity:read'), listEnrolmentsHandler);

identityRoutes.post(
  '/enrolments',
  requirePermissions('identity:enrol'),
  validate({ body: enrolSchema }),
  enrolHandler,
);

/**
 * Consent withdrawal.
 *
 * Gated on `identity:read` rather than `identity:manage` on purpose: a subject
 * must never be blocked from withdrawing consent by an authorisation rule.
 * Consent that is hard to withdraw is not consent, and both POPIA and GDPR
 * treat it that way.
 */
identityRoutes.delete(
  '/enrolments/:enrolmentId',
  requirePermissions('identity:read'),
  validate({ params: enrolmentIdParamSchema }),
  withdrawConsentHandler,
);

// --------------------------------------------------------------------- device

identityRoutes.post(
  '/devices/attest',
  ingestRateLimit,
  requirePermissions('identity:submit'),
  validate({ body: deviceAttestationSchema }),
  deviceAttestationHandler,
);

identityRoutes.get(
  '/drivers/:driverId/devices',
  requirePermissions('identity:read'),
  validate({ params: driverIdParamSchema }),
  listDevicesHandler,
);

// ----------------------------------------------------------------- challenges

/**
 * A driver answers their own challenge, so this needs only `identity:submit`.
 * The outcome is recorded as a signal and never used alone to downgrade
 * identity — a driver under duress may be unable to respond.
 */
identityRoutes.post(
  '/challenges/:challengeId/respond',
  requirePermissions('identity:submit'),
  validate({ params: challengeIdParamSchema, body: respondToChallengeSchema }),
  respondToChallengeHandler,
);

// ------------------------------------------------------------------ occupants

identityRoutes.get('/occupants', requirePermissions('identity:read'), listOccupantsHandler);

identityRoutes.post(
  '/occupants',
  requirePermissions('identity:manage'),
  validate({ body: createOccupantSchema }),
  createOccupantHandler,
);
