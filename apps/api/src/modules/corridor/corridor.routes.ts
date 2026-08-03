import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { uuidSchema } from '@aegisdrive/shared';
import {
  createHavenHandler,
  equityReportHandler,
  getPlanHandler,
  grantShareHandler,
  incidentSharesHandler,
  listHavensHandler,
  listPlansHandler,
  nearestHavensHandler,
  planRouteHandler,
  recordHazardHandler,
  resolveShareHandler,
  revokeShareHandler,
  verifyHavenHandler,
} from './corridor.controller';
import {
  createHavenSchema,
  equityQuerySchema,
  grantPoliceShareSchema,
  havenIdParamSchema,
  havenQuerySchema,
  listPlansQuerySchema,
  planIdParamSchema,
  planRouteSchema,
  recordHazardSchema,
  shareIdParamSchema,
} from './corridor.schema';

/**
 * SafeCorridor routes.
 *
 * ## Routes that deliberately do not exist
 *
 * **No destination exclusion.** There is no endpoint to mark a place
 * unreachable, no `avoidAreas` parameter, and no `corridor:exclude` permission
 * for one to sit behind. Risk avoidance chooses between ways of reaching a
 * destination; it never declines to reach one. That is the difference between
 * routing and redlining, and it is enforced by the absence of the route rather
 * than by a check inside one.
 *
 * **No area-level hazard write.** `POST /hazards` takes a segment id, an
 * incident count and an exposure denominator. There is no way to assert that a
 * neighbourhood is dangerous, and no way to enter a rate directly — a
 * hand-entered rate is a risk score wearing a unit.
 *
 * **No standing police feed.** A share is granted against an incident, expires,
 * and can be revoked. There is no subscription endpoint and no way to make a
 * grant permanent.
 *
 * **No equity report deletion.** The record of what the router cost people
 * outlives the plans it describes.
 */
export const corridorRoutes: Router = Router();

corridorRoutes.use(authenticate);

// -------------------------------------------------------------------- routing

corridorRoutes.post(
  '/plans',
  requirePermissions('corridor:plan'),
  validate({ body: planRouteSchema }),
  planRouteHandler,
);

corridorRoutes.get(
  '/plans',
  requirePermissions('corridor:read'),
  validate({ query: listPlansQuerySchema }),
  listPlansHandler,
);

corridorRoutes.get(
  '/plans/:planId',
  requirePermissions('corridor:read'),
  validate({ params: planIdParamSchema }),
  getPlanHandler,
);

// -------------------------------------------------------------------- hazards

/**
 * Records a confirmed-incident observation for a segment.
 *
 * Gated on `corridor:manage` — this is the data the router steers on, and
 * getting it wrong steers vehicles wrongly. The rate is computed from the count
 * and the exposure rather than accepted, and a reporting-biased source lowers
 * the confidence rather than adjusting the rate.
 */
corridorRoutes.post(
  '/hazards',
  requirePermissions('corridor:manage'),
  validate({ body: recordHazardSchema }),
  recordHazardHandler,
);

// --------------------------------------------------------------------- havens

corridorRoutes.get('/havens', requirePermissions('corridor:read'), listHavensHandler);

/**
 * Ranks the nearest safe havens to a position.
 *
 * Gated on `corridor:read`, which drivers hold: a driver in trouble needs to
 * know where to go, and a refuge list nobody in the vehicle can see is not a
 * safety feature.
 */
corridorRoutes.get(
  '/havens/nearest',
  requirePermissions('corridor:read'),
  validate({ query: havenQuerySchema }),
  nearestHavensHandler,
);

corridorRoutes.post(
  '/havens',
  requirePermissions('corridor:manage'),
  validate({ body: createHavenSchema }),
  createHavenHandler,
);

/**
 * Re-verifies a haven.
 *
 * Its own endpoint because verification is a claim someone is making — that
 * this place is still open and still qualifies — and a driver sent to a
 * forecourt that closed six months ago arrives somewhere dark believing they
 * are safe.
 */
corridorRoutes.post(
  '/havens/:havenId/verify',
  requirePermissions('corridor:manage'),
  validate({ params: havenIdParamSchema }),
  verifyHavenHandler,
);

// --------------------------------------------------------------------- equity

/**
 * The routing equity report.
 *
 * Deliberately on `corridor:read` rather than an administrative permission. The
 * point of measuring the detour burden is that somebody looks at it; behind a
 * rare permission it becomes a report nobody runs, which is indistinguishable
 * from not measuring.
 */
corridorRoutes.get(
  '/equity-report',
  requirePermissions('corridor:read'),
  validate({ query: equityQuerySchema }),
  equityReportHandler,
);

// ------------------------------------------------------------- police sharing

/**
 * Grants law enforcement time-bounded visibility of a vehicle's route.
 *
 * `corridor:share-police` is held by operators and security, and deliberately
 * **not** by the `POLICE` role: the party receiving the visibility must not
 * also be the party authorising it.
 *
 * Requires an incident, a named recipient, a written justification and an
 * expiry of at most twelve hours.
 */
corridorRoutes.post(
  '/police-shares',
  requirePermissions('corridor:share-police'),
  validate({ body: grantPoliceShareSchema }),
  grantShareHandler,
);

/**
 * Resolves a grant into the route it covers.
 *
 * Held by `corridor:read`, which the `POLICE` role has. Expiry, revocation and
 * incident closure are checked in the query, so a lapsed grant returns 404
 * rather than stale route data.
 */
corridorRoutes.get(
  '/police-shares/:shareId',
  requirePermissions('corridor:read'),
  validate({ params: shareIdParamSchema }),
  resolveShareHandler,
);

corridorRoutes.post(
  '/police-shares/:shareId/revoke',
  requirePermissions('corridor:share-police'),
  validate({ params: shareIdParamSchema }),
  revokeShareHandler,
);

/** Every grant issued against an incident, for review. Carries no route data. */
corridorRoutes.get(
  '/incidents/:incidentId/police-shares',
  requirePermissions('corridor:read'),
  validate({ params: z.object({ incidentId: uuidSchema }) }),
  incidentSharesHandler,
);
