import { z } from 'zod';
import { enumSchema, isoDateSchema, paginationQuerySchema, uuidSchema } from '@aegisdrive/shared';
import { BehaviourSignal, IdentityBand, ThreatEvidenceClass, ThreatLevel } from '@aegisdrive/types';

/**
 * Behaviour validation.
 *
 * Two schemas matter most in this file, and both matter for what they refuse.
 *
 * **There is no endpoint that accepts a frame, an audio buffer or a keypoint
 * series.** The API receives *derived signals* from the AI gateway and the
 * mobile app. Raw cabin data never traverses this boundary, so there is nothing
 * here to validate it with — which is the point.
 *
 * **There is no field anywhere that carries an emotion label.** The signal
 * catalogue is a closed enum of observable behaviours, so a caller cannot
 * introduce `fear` or `distress` as a free-form value even by accident. The
 * Python side enforces the same rule from the other direction via
 * `guard_against_affect_claims`; both ends check, because a rule enforced in
 * one place eventually is not enforced.
 */

const unitSchema = z.number().min(0).max(1);

export const behaviourObservationSchema = z.object({
  signal: enumSchema(BehaviourSignal),
  strength: unitSchema,
  detectorConfidence: unitSchema,
  quality: unitSchema,
  /**
   * Null is meaningful and distinct from zero: zero means "exactly at this
   * person's baseline", null means "no baseline exists to compare against".
   * The scorer halves a signal's weight in the second case.
   */
  baselineDeviation: z.number().min(-20).max(20).nullable().default(null),
  durationSeconds: z.number().min(0).max(3600),
  observedAt: isoDateSchema,
  modelId: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]*-v\d+$/, 'Must be a versioned model id, e.g. `pose-v2`.')
    .max(64),
});

/**
 * Non-behavioural evidence the caller folds in.
 *
 * Accepted from the caller rather than looked up here because the threat scorer
 * must be able to run against a fixed evidence set for replay. An assessment
 * that silently re-queried live threat events would score differently every
 * time it was recomputed, and this record may be produced in an investigation.
 */
export const contextualEvidenceSchema = z.object({
  evidenceClass: enumSchema(ThreatEvidenceClass),
  source: z.string().trim().min(1).max(64),
  /** Capped well below the per-signal ceiling. A caller cannot buy a SEVERE. */
  likelihoodRatio: z.number().min(0.01).max(100),
  confidence: unitSchema,
  observedAt: isoDateSchema,
  halfLifeSeconds: z.number().int().min(1).max(86_400),
  description: z.string().trim().min(1).max(280),
});

export const submitBehaviourSchema = z.object({
  driverId: uuidSchema.nullable().default(null),
  vehicleId: uuidSchema.nullable().default(null),
  /**
   * Capped at 24. A caller submitting more is either malfunctioning or trying
   * to swamp the scorer with correlated evidence — and the within-class
   * discount already means the twenty-fifth signal is worth nothing.
   */
  observations: z.array(behaviourObservationSchema).min(1).max(24),
  context: z.array(contextualEvidenceSchema).max(12).default([]),
  identityBand: enumSchema(IdentityBand).nullable().default(null),
  identityAssessedAt: isoDateSchema.nullable().default(null),

  /** Cabin composition. Counts only — nobody is identified. */
  occupantCount: z.number().int().min(0).max(20).nullable().default(null),
  expectedCount: z.number().int().min(0).max(20).nullable().default(null),
  speakerCount: z.number().int().min(0).max(20).nullable().default(null),

  /**
   * Arousal indicators, from which the composite index is computed here rather
   * than accepted from the caller. The caller supplies measurements; the API
   * decides what they add up to.
   */
  arousalIndicators: z
    .array(
      z.object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(48)
          .regex(
            /^[a-z][a-z0-9_]*$/,
            'Must be a snake_case measurement name, e.g. `motion_energy`.',
          ),
        deviation: z.number().min(-20).max(20),
        quality: unitSchema,
        signalClass: z.enum(['POSTURE', 'MOTION', 'VOCAL', 'CABIN', 'CONTROL']),
      }),
    )
    .max(16)
    .default([]),

  /** Cabin feature vector for abnormality scoring against the driver's baseline. */
  features: z.record(z.string().max(48), z.number()).default({}),
  observedSeconds: z.number().int().min(0).max(3600).default(0),
});

export const listAssessmentsQuerySchema = paginationQuerySchema.extend({
  driverId: uuidSchema.optional(),
  vehicleId: uuidSchema.optional(),
  level: enumSchema(ThreatLevel).optional(),
  /** Filter to assessments where coercion was indicated. */
  duressIndicated: z.coerce.boolean().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const driverIdParamSchema = z.object({ driverId: uuidSchema });
export const vehicleIdParamSchema = z.object({ vehicleId: uuidSchema });

export type BehaviourObservationBody = z.infer<typeof behaviourObservationSchema>;
export type SubmitBehaviourBody = z.infer<typeof submitBehaviourSchema>;
export type ListAssessmentsQuery = z.infer<typeof listAssessmentsQuerySchema>;
