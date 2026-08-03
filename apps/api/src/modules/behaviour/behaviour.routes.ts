import { Router } from 'express';
import { authenticate, ingestRateLimit, requirePermissions, validate } from '../../middleware';
import {
  baselineStatusHandler,
  calibrationHandler,
  driverThreatHandler,
  listAssessmentsHandler,
  resetBaselineHandler,
  submitBehaviourHandler,
  vehicleThreatHandler,
} from './behaviour.controller';
import {
  driverIdParamSchema,
  listAssessmentsQuerySchema,
  submitBehaviourSchema,
  vehicleIdParamSchema,
} from './behaviour.schema';

/**
 * Behaviour Intelligence Engine routes.
 *
 * Permissions split the same way as identity, because the capabilities differ
 * sharply in sensitivity:
 *
 *   - `behaviour:read`   — see a threat score and its evidence. Control-room work.
 *   - `behaviour:submit` — contribute measurements. Held by the AI gateway
 *                          service account and by drivers for their own vehicle.
 *   - `behaviour:manage` — reset a baseline, review calibration. Analysts.
 *
 * ## Four routes that deliberately do not exist
 *
 * **No export route.** There is no `behaviour:export` permission and no
 * endpoint to pair with one. These measurements are processed on a safety basis
 * for the protection of the data subject; bulk extraction across drivers has no
 * safety purpose, only a performance-management one, and that is a prohibited
 * use. Evidence for a specific incident travels with the incident record.
 *
 * **No raw-sample route.** Nothing here accepts a frame, an audio buffer or a
 * keypoint series. The API receives derived signals only.
 *
 * **No driver-facing read.** A driver holds `behaviour:submit` and not
 * `behaviour:read`. A driver who can see the engine's output can also see when
 * it has noticed something — and if they are being coerced, so can whoever is
 * sitting beside them.
 *
 * **No baseline write.** Baselines are grown from observed windows inside the
 * assessment path, never set. A settable baseline could be seeded to make a
 * driver look permanently normal, or permanently abnormal.
 */
export const behaviourRoutes: Router = Router();

behaviourRoutes.use(authenticate);

// ----------------------------------------------------------------- ingestion

/**
 * Ingest path. Rate-limited with the telemetry bucket because a cabin analyser
 * scoring every few seconds is device-class traffic, not operator traffic, and
 * must not be able to exhaust an operator's request budget.
 */
behaviourRoutes.post(
  '/observations',
  ingestRateLimit,
  requirePermissions('behaviour:submit'),
  validate({ body: submitBehaviourSchema }),
  submitBehaviourHandler,
);

// ----------------------------------------------------------------- reporting

behaviourRoutes.get(
  '/assessments',
  requirePermissions('behaviour:read'),
  validate({ query: listAssessmentsQuerySchema }),
  listAssessmentsHandler,
);

/** The current cabin picture for a vehicle — the engine's headline output. */
behaviourRoutes.get(
  '/vehicles/:vehicleId/threat',
  requirePermissions('behaviour:read'),
  validate({ params: vehicleIdParamSchema }),
  vehicleThreatHandler,
);

behaviourRoutes.get(
  '/drivers/:driverId/threat',
  requirePermissions('behaviour:read'),
  validate({ params: driverIdParamSchema }),
  driverThreatHandler,
);

// ------------------------------------------------------------------ baseline

/**
 * Baseline readiness. Returns coverage, not the statistics themselves — the
 * means and standard deviations of a named person's cabin behaviour are their
 * personal data and serve no purpose on an operator's screen.
 */
behaviourRoutes.get(
  '/drivers/:driverId/baseline',
  requirePermissions('behaviour:read'),
  validate({ params: driverIdParamSchema }),
  baselineStatusHandler,
);

/**
 * Erases a driver's baseline.
 *
 * Gated on `behaviour:manage` for the analyst case. A driver's own erasure
 * request is handled through the data-subject flow rather than this route, for
 * the same reason identity consent withdrawal is gated on `identity:read`: a
 * subject must never be blocked from erasure by an authorisation rule.
 */
behaviourRoutes.delete(
  '/drivers/:driverId/baseline',
  requirePermissions('behaviour:manage'),
  validate({ params: driverIdParamSchema }),
  resetBaselineHandler,
);

// --------------------------------------------------------------- calibration

/**
 * The calibration in force, and whether it was ever fitted to real data.
 *
 * A score nobody can interrogate is a score nobody should act on. This is the
 * route an analyst uses to see the likelihood ratio behind a false positive,
 * and to confirm whether the numbers are still the shipped estimates.
 */
behaviourRoutes.get('/calibration', requirePermissions('behaviour:read'), calibrationHandler);
