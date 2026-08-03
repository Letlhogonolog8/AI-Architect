import { Router } from 'express';
import { authenticate, requirePermissions, validate } from '../../middleware';
import {
  calibrationReviewHandler,
  decideHandler,
  getDecisionHandler,
  listDecisionsHandler,
  overrideHandler,
  vehicleDecisionHandler,
} from './decision.controller';
import {
  decideSchema,
  decisionIdParamSchema,
  listDecisionsQuerySchema,
  overrideSchema,
  vehicleIdParamSchema,
} from './decision.schema';

/**
 * Threat Decision Engine routes.
 *
 * Only two permissions, because the engine decides rather than acts. Everything
 * it recommends is committed through the permission that action already
 * requires — `incident:dispatch` to send responders, `vehicle:immobilise` to
 * stop a vehicle. A `decision:*` permission that could dispatch would be a way
 * around those, and the whole point of the engine is that it recommends to a
 * human rather than acting.
 *
 * ## Routes that deliberately do not exist
 *
 * **Nothing accepts a decision.** `POST /decisions` takes a *behaviour
 * assessment id* and infers; it does not accept a posterior, a hypothesis or a
 * graph. An endpoint that accepted a finished decision would let a caller
 * assert a conclusion the engine never reached, and the record would be
 * indistinguishable from a real one.
 *
 * **No decision can be edited or deleted.** The record is append-only. It may
 * be produced in an investigation — including one into whether the response it
 * recommended was justified — and a mutable one is worth nothing there.
 *
 * **An override can be recorded once.** Not revisable, for the same reason:
 * a disagreement that can be walked back is neither evidence nor a calibration
 * signal.
 */
export const decisionRoutes: Router = Router();

decisionRoutes.use(authenticate);

/**
 * Runs the engine over a recorded behaviour assessment.
 *
 * Gated on `behaviour:submit` rather than a decision permission: the caller is
 * the AI gateway continuing the pipeline it started, not an operator asking a
 * question. Reading the result needs `decision:read`, which the gateway does
 * not hold.
 */
decisionRoutes.post(
  '/',
  requirePermissions('behaviour:submit'),
  validate({ body: decideSchema }),
  decideHandler,
);

decisionRoutes.get(
  '/',
  requirePermissions('decision:read'),
  validate({ query: listDecisionsQuerySchema }),
  listDecisionsHandler,
);

/**
 * Override rates by hypothesis.
 *
 * Mounted before `/:decisionId` so `calibration-review` is not parsed as an id.
 *
 * This is the platform's only source of ground truth. Nobody knows what a
 * decision *should* have been until a human has looked at the footage, so a
 * hypothesis operators routinely correct is the clearest evidence available
 * that its priors or likelihoods are wrong.
 */
decisionRoutes.get(
  '/calibration-review',
  requirePermissions('decision:read'),
  calibrationReviewHandler,
);

decisionRoutes.get(
  '/vehicles/:vehicleId',
  requirePermissions('decision:read'),
  validate({ params: vehicleIdParamSchema }),
  vehicleDecisionHandler,
);

/** The full record, including the decision graph and the rejected hypotheses. */
decisionRoutes.get(
  '/:decisionId',
  requirePermissions('decision:read'),
  validate({ params: decisionIdParamSchema }),
  getDecisionHandler,
);

/**
 * Records a human disagreeing with the engine.
 *
 * Separate from `decision:read` because recording a disagreement is an
 * accountable act, and because override rates drive recalibration — they should
 * come from people whose judgement is answerable rather than from anyone with a
 * login.
 *
 * The reason has a real minimum length. "Wrong" tells a future analyst nothing
 * about *why* the engine was wrong, which is the only part that can improve it.
 */
decisionRoutes.post(
  '/:decisionId/override',
  requirePermissions('decision:override'),
  validate({ params: decisionIdParamSchema, body: overrideSchema }),
  overrideHandler,
);
