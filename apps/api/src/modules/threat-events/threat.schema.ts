import { z } from 'zod';
import {
  enumSchema,
  geoPointSchema,
  isoDateSchema,
  paginationQuerySchema,
  uuidSchema,
} from '@aegisdrive/shared';
import { ThreatEventType, ThreatLevel } from '@aegisdrive/types';

export const listThreatEventsQuerySchema = paginationQuerySchema.extend({
  type: enumSchema(ThreatEventType).optional(),
  level: enumSchema(ThreatLevel).optional(),
  vehicleId: uuidSchema.optional(),
  acknowledged: z.coerce.boolean().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

/**
 * Threat events are produced by models, not people. `modelId` is mandatory:
 * an automated decision that cannot be traced back to the model and version
 * that made it is not auditable, and this platform's decisions have legal
 * consequences.
 */
export const recordThreatEventSchema = z.object({
  type: enumSchema(ThreatEventType),
  level: enumSchema(ThreatLevel),
  confidence: z.number().min(0).max(1),
  modelId: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]*-v\d+$/, 'Must be a versioned model id, e.g. `tailing-v3`.')
    .max(64),
  description: z.string().trim().min(4).max(2_000),
  vehicleId: uuidSchema.nullish(),
  incidentId: uuidSchema.nullish(),
  position: geoPointSchema.nullish(),
  detectedAt: isoDateSchema.optional(),
});

export const threatEventIdParamSchema = z.object({ threatEventId: uuidSchema });

export type ListThreatEventsQuery = z.infer<typeof listThreatEventsQuerySchema>;
export type RecordThreatEventInput = z.infer<typeof recordThreatEventSchema>;
