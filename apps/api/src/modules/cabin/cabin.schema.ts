import { z } from 'zod';
import { enumSchema, isoDateSchema, paginationQuerySchema, uuidSchema } from '@aegisdrive/shared';
import {
  AcousticEventType,
  CameraPlacement,
  DetectedObjectClass,
  DoorPosition,
  DoorState,
  SeatEvidenceSource,
  SeatPosition,
  SeatState,
  SensorHealth,
  TamperState,
} from '@aegisdrive/types';

/**
 * Cabin validation.
 *
 * The important schemas here are the ones that constrain rather than the ones
 * that accept.
 *
 * **Nothing accepts media.** There is no base64 field, no data URI, no upload
 * multipart. The API receives detections; frames and audio reach durable
 * storage only through the evidence service, when an incident is opened.
 *
 * **Nothing accepts an identity.** No embedding, no demographic attribute, no
 * cross-trip occupant handle. The object taxonomy is a closed enum, so a
 * caller cannot introduce `face` as a free-form class even by accident.
 *
 * **A weapon detection must carry its ambiguity set.** `alternatives` is
 * required and must be non-empty on weapon classes — see
 * `objectDetectionSchema`. A detector that suppresses its own uncertainty on
 * the highest-stakes class in the taxonomy is misconfigured, and the API
 * rejects it rather than storing a confident number nobody should trust.
 */

const unitSchema = z.number().min(0).max(1);

const modelIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]*-v\d+$/, 'Must be a versioned model id, e.g. `cabin-objects-v2`.')
  .max(64);

const classScoreSchema = z.object({
  objectClass: enumSchema(DetectedObjectClass),
  confidence: unitSchema,
});

const WEAPON_CLASS_VALUES = ['HANDGUN', 'LONG_GUN', 'KNIFE', 'BLUNT_WEAPON'] as const;

export const objectDetectionSchema = z
  .object({
    objectClass: enumSchema(DetectedObjectClass),
    confidence: unitSchema,
    alternatives: z.array(classScoreSchema).max(8).default([]),
    boundingBox: z.tuple([
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
    ]),
    nearestPosition: enumSchema(SeatPosition).nullable().default(null),
    persistenceFrames: z.number().int().min(0).max(100_000),
    persistenceSeconds: z.number().min(0).max(3600),
    frameQuality: unitSchema,
    modelId: modelIdSchema,
    detectedAt: isoDateSchema,
  })
  .refine(
    (value) =>
      !WEAPON_CLASS_VALUES.includes(value.objectClass as (typeof WEAPON_CLASS_VALUES)[number]) ||
      value.alternatives.length > 0,
    {
      message:
        'A weapon-class detection must carry its ambiguity set. A detector reporting a weapon with no alternatives has either solved a problem nobody has solved or been configured to suppress its own uncertainty, and its confidence cannot be read at face value.',
      path: ['alternatives'],
    },
  );

export const seatOccupancySchema = z.object({
  position: enumSchema(SeatPosition),
  state: enumSchema(SeatState),
  confidence: unitSchema,
  source: enumSchema(SeatEvidenceSource),
  conflicted: z.boolean().default(false),
  beltFastened: z.boolean().nullable().default(null),
});

export const doorSnapshotSchema = z.object({
  position: enumSchema(DoorPosition),
  state: enumSchema(DoorState),
  locked: z.boolean().nullable().default(null),
  changedAt: isoDateSchema.nullable().default(null),
  speedKphAtChange: z.number().min(0).max(400).nullable().default(null),
});

export const acousticEventSchema = z.object({
  type: enumSchema(AcousticEventType),
  confidence: unitSchema,
  peakDb: z.number().min(0).max(200),
  durationSeconds: z.number().min(0).max(300),
  audioQuality: unitSchema,
  alternatives: z
    .array(z.object({ type: enumSchema(AcousticEventType), confidence: unitSchema }))
    .max(5)
    .default([]),
  modelId: modelIdSchema,
  detectedAt: isoDateSchema,
});

/**
 * A cabin analysis window.
 *
 * Windowed rather than per-frame. A per-frame ingest would produce forty
 * submissions a second, each individually meaningless, and would leave the
 * within-class correlation discount doing all the work downstream.
 */
export const submitSnapshotSchema = z.object({
  vehicleId: uuidSchema,
  contributingSensorIds: z.array(uuidSchema).max(8).default([]),

  objects: z.array(objectDetectionSchema).max(32).default([]),

  occupantCount: z.number().int().min(0).max(20).nullable().default(null),
  expectedCount: z.number().int().min(0).max(20).nullable().default(null),
  seats: z.array(seatOccupancySchema).max(5).default([]),
  unobservedSeats: z.array(enumSchema(SeatPosition)).max(5).default([]),
  /** 0-1 confidence in the instantaneous count. */
  occupancyConfidence: unitSchema.nullable().default(null),

  doors: z.array(doorSnapshotSchema).max(6).default([]),
  acousticEvents: z.array(acousticEventSchema).max(16).default([]),

  degradedSensors: z
    .array(
      z.object({
        sensorId: uuidSchema,
        health: enumSchema(SensorHealth),
        tamper: enumSchema(TamperState),
      }),
    )
    .max(8)
    .default([]),

  speedKph: z.number().min(0).max(400).nullable().default(null),
  windowSeconds: z.number().int().min(1).max(300),
  capturedAt: isoDateSchema,
  pipelineVersion: modelIdSchema,
});

// ============================================================================
// Sensor management
// ============================================================================

export const enrolSensorSchema = z.object({
  vehicleId: uuidSchema,
  serialNumber: z.string().trim().min(4).max(64),
  label: z.string().trim().min(1).max(96),
  placement: enumSchema(CameraPlacement),
  audioOnly: z.boolean().default(false),
  firmwareVersion: z.string().trim().max(32),
  /**
   * No default, deliberately. A caller must state this explicitly, and the
   * service refuses enrolment when it is false — an unmarked camera pointed at
   * a worker for an entire shift is a compliance failure, not a configuration
   * choice, and defaulting it to `true` would let one be enrolled by omission.
   */
  recordingIndicatorFitted: z.boolean(),
});

export const updateSensorSchema = z.object({
  label: z.string().trim().min(1).max(96).optional(),
  analysisEnabled: z.boolean().optional(),
  firmwareVersion: z.string().trim().max(32).optional(),
});

export const sensorHeartbeatSchema = z.object({
  serialNumber: z.string().trim().min(4).max(64),
  meanQuality: unitSchema,
  tamper: enumSchema(TamperState),
  lastFrameAt: isoDateSchema.nullable().default(null),
});

/**
 * An operator's determination on a weapon detection.
 *
 * `justification` is required on both verdicts, not just rejections. A
 * confirmation is what turns a low-confidence detector output into grounds for
 * an armed response, and it must be as accountable as a rejection is.
 */
export const weaponVerdictSchema = z.object({
  verdict: z.enum(['CONFIRMED', 'REJECTED']),
  justification: z.string().trim().min(10).max(1000),
});

export const listDetectionsQuerySchema = paginationQuerySchema.extend({
  vehicleId: uuidSchema.optional(),
  sensorId: uuidSchema.optional(),
  /** Only windows that produced a weapon candidate. */
  weaponCandidates: z.coerce.boolean().optional(),
  /** Weapon candidates nobody has reviewed yet. */
  awaitingReview: z.coerce.boolean().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const vehicleIdParamSchema = z.object({ vehicleId: uuidSchema });
export const sensorIdParamSchema = z.object({ sensorId: uuidSchema });
export const detectionIdParamSchema = z.object({ detectionId: uuidSchema });

export type SubmitSnapshotBody = z.infer<typeof submitSnapshotSchema>;
export type EnrolSensorBody = z.infer<typeof enrolSensorSchema>;
export type UpdateSensorBody = z.infer<typeof updateSensorSchema>;
export type SensorHeartbeatBody = z.infer<typeof sensorHeartbeatSchema>;
export type WeaponVerdictBody = z.infer<typeof weaponVerdictSchema>;
export type ListDetectionsQuery = z.infer<typeof listDetectionsQuerySchema>;
