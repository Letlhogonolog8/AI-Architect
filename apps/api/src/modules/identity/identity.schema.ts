import { z } from 'zod';
import { enumSchema, isoDateSchema, paginationQuerySchema, uuidSchema } from '@aegisdrive/shared';
import { ConsentBasis, IdentityBand, IdentityModality } from '@aegisdrive/types';

/**
 * Identity validation.
 *
 * The most important schema in this file is the one that is **absent**: there
 * is no endpoint that accepts an image, an audio clip or a raw embedding. The
 * API receives *scores* from the AI gateway and *template handles* from the
 * enrolment flow. Raw biometrics never traverse this boundary, so there is
 * nothing here to validate them with.
 */

const scoreSchema = z.number().min(0).max(1);

export const modalityObservationSchema = z.object({
  modality: enumSchema(IdentityModality),
  score: scoreSchema,
  quality: scoreSchema,
  capturedAt: isoDateSchema,
  /** Versioned model. An unversioned id makes the decision unauditable. */
  modelId: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]*-v\d+$/, 'Must be a versioned model id, e.g. `face-embed-v2`.')
    .max(64),
  enrolmentId: uuidSchema.nullable(),
  spoofDetected: z.boolean().default(false),
  spoofConfidence: scoreSchema.nullable().default(null),
});

export const occupancySchema = z.object({
  occupantCount: z.number().int().min(0).max(20),
  recognisedCount: z.number().int().min(0).max(20),
  unrecognisedCount: z.number().int().min(0).max(20),
  expectedCount: z.number().int().min(0).max(20).nullable(),
  unexpectedOccupancy: z.boolean(),
  confidence: scoreSchema,
  modelId: z.string().trim().max(64),
  assessedAt: isoDateSchema,
});

export const submitObservationsSchema = z.object({
  driverId: uuidSchema,
  vehicleId: uuidSchema.nullable(),
  // Capped: a caller submitting fifty observations is either malfunctioning or
  // attempting to swamp the fusion with correlated evidence.
  observations: z.array(modalityObservationSchema).min(1).max(12),
  occupancy: occupancySchema.nullable().default(null),
});

export const listAssessmentsQuerySchema = paginationQuerySchema.extend({
  driverId: uuidSchema.optional(),
  vehicleId: uuidSchema.optional(),
  band: enumSchema(IdentityBand).optional(),
});

/**
 * Enrolment.
 *
 * `templateRef` is an opaque handle the AI gateway returns after it has built
 * and wrapped the template. The API never sees the vector, and the pattern
 * check exists to reject a caller mistakenly posting raw data into this field.
 */
export const enrolSchema = z
  .object({
    driverId: uuidSchema.nullable().default(null),
    occupantId: uuidSchema.nullable().default(null),
    modality: enumSchema(IdentityModality),
    templateRef: z
      .string()
      .trim()
      .regex(
        /^tpl_[A-Za-z0-9_-]{16,128}$/,
        'Must be a template handle issued by the AI gateway, not template data.',
      ),
    modelId: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]*-v\d+$/, 'Must be a versioned model id.')
      .max(64),
    sampleCount: z.number().int().min(1).max(100),
    enrolmentQuality: scoreSchema,
    consentBasis: enumSchema(ConsentBasis),
    validityDays: z.number().int().min(1).max(730).default(365),
  })
  .refine((value) => (value.driverId === null) !== (value.occupantId === null), {
    message: 'Provide exactly one of driverId or occupantId.',
    path: ['driverId'],
  });

export const deviceAttestationSchema = z.object({
  installationId: z.string().trim().min(8).max(128),
  fingerprintHash: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-f0-9]{64}$/, 'Must be a hex-encoded SHA-256 digest.'),
  driverId: uuidSchema.nullable().default(null),
  platform: z.enum(['IOS', 'ANDROID']),
  osVersion: z.string().trim().max(32),
  deviceModel: z.string().trim().max(64),
  manufacturer: z.string().trim().max(64),
  attestation: z.enum(['VERIFIED', 'UNVERIFIED', 'FAILED', 'UNSUPPORTED']),
  compromised: z.boolean().default(false),
  emulated: z.boolean().default(false),
});

export const respondToChallengeSchema = z.object({
  outcome: z.enum(['PASSED', 'FAILED', 'DECLINED']),
});

export const createOccupantSchema = z.object({
  displayName: z.string().trim().min(1).max(96),
  relationship: z.string().trim().min(1).max(64),
});

export const driverIdParamSchema = z.object({ driverId: uuidSchema });
export const enrolmentIdParamSchema = z.object({ enrolmentId: uuidSchema });
export const challengeIdParamSchema = z.object({ challengeId: uuidSchema });

export type SubmitObservationsBody = z.infer<typeof submitObservationsSchema>;
export type ListAssessmentsQuery = z.infer<typeof listAssessmentsQuerySchema>;
export type EnrolBody = z.infer<typeof enrolSchema>;
export type DeviceAttestationBody = z.infer<typeof deviceAttestationSchema>;
export type RespondToChallengeBody = z.infer<typeof respondToChallengeSchema>;
export type CreateOccupantBody = z.infer<typeof createOccupantSchema>;
