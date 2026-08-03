import { Router } from 'express';
import { authenticate, requirePermissions, validate } from '../../middleware';
import {
  acknowledgeActivationHandler,
  activateSosHandler,
  channelStatusHandler,
  dispatchActivationHandler,
  getActivationHandler,
  listActivationsHandler,
  resolveActivationHandler,
} from './sos.controller';
import {
  acknowledgeSosSchema,
  activateSosSchema,
  activationIdParamSchema,
  dispatchSosSchema,
  listActivationsQuerySchema,
  resolveSosSchema,
} from './sos.schema';

/**
 * Silent Emergency Engine routes.
 *
 * ## The split that matters
 *
 * `POST /activations` is the one route a driver reaches, on `sos:activate`.
 * Every other route is control-room only and a driver holds none of their
 * permissions — because a driver who can read an activation can read it under
 * duress, and a driver who could stand one down could be forced to. Raising the
 * alarm is the whole of the capability the cabin needs; everything after it
 * happens where the captor cannot see.
 *
 * ## Routes that deliberately do not exist
 *
 * **No vehicle-side stand-down.** There is no route a driver can call to cancel
 * an activation. `CANCELLED` is reachable only through `POST
 * /activations/:id/resolve`, which requires `sos:manage` — a control-room
 * permission. A cancel button in the cabin is the first thing an attacker
 * forces.
 *
 * **No activation deletion.** Every trigger, including the mistaken ones, stays
 * on the record; the false-alarm rate per method is measurable only if the
 * false alarms are still there to count.
 */
export const sosRoutes: Router = Router();

sosRoutes.use(authenticate);

/**
 * Raises a silent SOS. Held by `sos:activate`, which the driver role has and no
 * control-room role does. Returns a neutral `202` receipt that confirms nothing
 * — see the controller.
 */
sosRoutes.post(
  '/activations',
  requirePermissions('sos:activate'),
  validate({ body: activateSosSchema }),
  activateSosHandler,
);

sosRoutes.get(
  '/activations',
  requirePermissions('sos:read'),
  validate({ query: listActivationsQuerySchema }),
  listActivationsHandler,
);

/** Which external channels can actually be reached. Honest health surface. */
sosRoutes.get('/channels', requirePermissions('sos:read'), channelStatusHandler);

sosRoutes.get(
  '/activations/:activationId',
  requirePermissions('sos:read'),
  validate({ params: activationIdParamSchema }),
  getActivationHandler,
);

sosRoutes.post(
  '/activations/:activationId/acknowledge',
  requirePermissions('sos:manage'),
  validate({ params: activationIdParamSchema, body: acknowledgeSosSchema }),
  acknowledgeActivationHandler,
);

sosRoutes.post(
  '/activations/:activationId/resolve',
  requirePermissions('sos:manage'),
  validate({ params: activationIdParamSchema, body: resolveSosSchema }),
  resolveActivationHandler,
);

/**
 * Manually fans an activation out to police, security, family and the insurer,
 * or retries a failed dispatch. On `sos:dispatch` rather than `sos:manage`:
 * transmitting a person's live location to outside parties is a heavier act than
 * handling the alarm internally.
 */
sosRoutes.post(
  '/activations/:activationId/dispatch',
  requirePermissions('sos:dispatch'),
  validate({ params: activationIdParamSchema, body: dispatchSosSchema }),
  dispatchActivationHandler,
);
