import { z } from 'zod';
import { enumSchema, geoPositionSchema, isoDateSchema, uuidSchema } from '@aegisdrive/shared';
import { TelemetrySource } from '@aegisdrive/types';

export const telemetryFrameSchema = z.object({
  recordedAt: isoDateSchema,
  position: geoPositionSchema,
  ignitionOn: z.boolean().default(false),
  fuelLevelPercent: z.number().min(0).max(100).nullish(),
  batteryVoltage: z.number().min(0).max(60).nullish(),
  engineTempC: z.number().min(-50).max(250).nullish(),
  harshBraking: z.boolean().default(false),
  harshAcceleration: z.boolean().default(false),
  raw: z.record(z.unknown()).nullish(),
});

/**
 * Devices batch frames to survive patchy coverage, so ingest is batch-first.
 * The cap of 500 bounds both the request body and the single `createMany`.
 */
export const ingestTelemetrySchema = z.object({
  vehicleId: uuidSchema,
  source: enumSchema(TelemetrySource),
  frames: z.array(telemetryFrameSchema).min(1).max(500),
});

export const telemetryWindowQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(5_000).default(500),
});

export const vehicleIdParamSchema = z.object({ vehicleId: uuidSchema });

export type TelemetryFrame = z.infer<typeof telemetryFrameSchema>;
export type IngestTelemetryInput = z.infer<typeof ingestTelemetrySchema>;
export type TelemetryWindowQuery = z.infer<typeof telemetryWindowQuerySchema>;
