import { z } from 'zod';
import {
  enumSchema,
  geoPointSchema,
  isoDateSchema,
  paginationQuerySchema,
  uuidSchema,
} from '@aegisdrive/shared';
import { EmergencyChannel, SosActivationMethod, SosStatus } from '@aegisdrive/types';

/**
 * The stand-down dispositions an operator may record.
 *
 * A subset of `SosStatus` — the three terminal states a human reaches
 * deliberately. `ACTIVATED`, `DISPATCHING` and `ACKNOWLEDGED` are not here
 * because they are lifecycle states the engine moves through, not judgements
 * anyone records.
 */
export const SOS_DISPOSITIONS = [
  SosStatus.RESOLVED,
  SosStatus.CANCELLED,
  SosStatus.FALSE_ALARM,
] as const;

export const activateSosSchema = z
  .object({
    method: enumSchema(SosActivationMethod),
    vehicleId: uuidSchema.nullish(),
    driverId: uuidSchema.nullish(),
    position: geoPointSchema.nullish(),
    /** Free-text provenance, e.g. `mobile-app`. Defaults server-side. */
    source: z.string().trim().min(1).max(120).optional(),
    /**
     * Only meaningful for a `DECISION_ENGINE` activation. Rejected for every
     * other method: a human pressing a button is not a probability, and
     * accepting a confidence for one would invite fabricating certainty about
     * intent that the engine does not have.
     */
    confidence: z.number().min(0).max(1).nullish(),
  })
  .refine(
    (value) =>
      value.method === SosActivationMethod.DECISION_ENGINE ||
      value.confidence === undefined ||
      value.confidence === null,
    {
      message: 'confidence is only accepted for DECISION_ENGINE activations.',
      path: ['confidence'],
    },
  );

export const listActivationsQuerySchema = paginationQuerySchema.extend({
  status: enumSchema(SosStatus).optional(),
  method: enumSchema(SosActivationMethod).optional(),
  vehicleId: uuidSchema.optional(),
  driverId: uuidSchema.optional(),
  /** Shorthand for "everything still needing the control room". */
  openOnly: z.coerce.boolean().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const acknowledgeSosSchema = z
  .object({
    note: z.string().trim().min(1).max(1_000).optional(),
  })
  .default({});

export const resolveSosSchema = z.object({
  disposition: enumSchema({
    RESOLVED: SosStatus.RESOLVED,
    CANCELLED: SosStatus.CANCELLED,
    FALSE_ALARM: SosStatus.FALSE_ALARM,
  }),
  /**
   * Required when standing an activation down as a false alarm: a mistaken
   * silent SOS is the signal that calibrates the trigger that produced it, and a
   * disposition with no reason teaches nothing.
   */
  note: z.string().trim().min(1).max(2_000).optional(),
});

/**
 * Manually (re)dispatch an activation to external parties.
 *
 * With no `channel`, re-runs the fan-out for every channel the activation's
 * method targets that has not already been reached. With a `channel`, dispatches
 * to exactly that party — the case where an operator, having spoken to a family
 * member on the phone, adds a channel the automatic path did not.
 */
export const dispatchSosSchema = z
  .object({
    channel: enumSchema(EmergencyChannel).optional(),
    recipientReference: z.string().trim().min(2).max(160).optional(),
    recipientContact: z.string().trim().min(3).max(200).optional(),
  })
  .default({});

export const activationIdParamSchema = z.object({ activationId: uuidSchema });

export type ActivateSosInput = z.infer<typeof activateSosSchema>;
export type ListActivationsQuery = z.infer<typeof listActivationsQuerySchema>;
export type AcknowledgeSosInput = z.infer<typeof acknowledgeSosSchema>;
export type ResolveSosInput = z.infer<typeof resolveSosSchema>;
export type DispatchSosInput = z.infer<typeof dispatchSosSchema>;
