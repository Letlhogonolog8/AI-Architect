import { z } from 'zod';
import { enumSchema, isoDateSchema, paginationQuerySchema, uuidSchema } from '@aegisdrive/shared';
import { ThreatHypothesis } from '@aegisdrive/types';

/**
 * Decision validation.
 *
 * The engine is invoked from inside the API rather than called with a
 * pre-computed decision, so there is **no endpoint that accepts a posterior, a
 * hypothesis or a graph**. A caller submits evidence; the API infers. That
 * boundary is what makes a decision reproducible — an endpoint accepting a
 * finished decision would let any caller assert a conclusion the engine never
 * reached, and the record would be indistinguishable from a real one.
 */

export const decideSchema = z.object({
  vehicleId: uuidSchema.nullable().default(null),
  driverId: uuidSchema.nullable().default(null),
  /**
   * The behaviour assessment whose signals should be decided on.
   *
   * A reference rather than the signals themselves. The assessment is already
   * durable, already validated and already carries its own provenance; passing
   * the signals again would let the decision be computed from evidence that
   * differs from what was recorded, which is the one thing a replayable record
   * cannot tolerate.
   */
  behaviourAssessmentId: uuidSchema,
  /** Cabin sensors enrolled on the vehicle, and how many were contributing. */
  sensorsExpected: z.number().int().min(0).max(16).default(0),
  sensorsHealthy: z.number().int().min(0).max(16).default(0),
});

/**
 * A human disagreeing with the engine.
 *
 * `reason` has a real minimum length. An override is the platform's most
 * valuable calibration signal and a one-word reason destroys it — "wrong" tells
 * a future analyst nothing about *why* the engine was wrong, which is the only
 * part that can improve it.
 */
export const overrideSchema = z.object({
  hypothesis: enumSchema(ThreatHypothesis),
  reason: z.string().trim().min(20).max(1000),
});

export const listDecisionsQuerySchema = paginationQuerySchema.extend({
  vehicleId: uuidSchema.optional(),
  driverId: uuidSchema.optional(),
  hypothesis: enumSchema(ThreatHypothesis).optional(),
  /** Only decisions a human disagreed with. The calibration review queue. */
  overriddenOnly: z.coerce.boolean().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const decisionIdParamSchema = z.object({ decisionId: uuidSchema });
export const vehicleIdParamSchema = z.object({ vehicleId: uuidSchema });

export type DecideBody = z.infer<typeof decideSchema>;
export type OverrideBody = z.infer<typeof overrideSchema>;
export type ListDecisionsQuery = z.infer<typeof listDecisionsQuerySchema>;
