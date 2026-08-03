import { z } from 'zod';
import { enumSchema, isoDateSchema, paginationQuerySchema, uuidSchema } from '@aegisdrive/shared';
import { EvidenceStatus, EvidenceType } from '@aegisdrive/types';

/** Lowercase hex SHA-256. Any other length or alphabet is a client bug. */
const checksumSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-f0-9]{64}$/, 'Must be a hex-encoded SHA-256 digest.');

export const listEvidenceQuerySchema = paginationQuerySchema.extend({
  incidentId: uuidSchema.optional(),
  vehicleId: uuidSchema.optional(),
  type: enumSchema(EvidenceType).optional(),
  status: enumSchema(EvidenceStatus).optional(),
  search: z.string().trim().min(1).max(64).optional(),
});

/**
 * Registers an artefact *before* the bytes are uploaded.
 *
 * The client computes the checksum locally and declares it here; the evidence
 * service verifies the stored object against this value before sealing. A
 * checksum supplied after upload would prove nothing.
 */
export const registerEvidenceSchema = z.object({
  type: enumSchema(EvidenceType),
  label: z.string().trim().min(1).max(160),
  mimeType: z
    .string()
    .trim()
    .regex(/^[\w.+-]+\/[\w.+-]+$/, 'Must be a valid MIME type.')
    .max(128),
  sizeBytes: z.number().int().min(1).max(21_474_836_480),
  durationSeconds: z.number().int().min(0).max(86_400).nullish(),
  checksum: checksumSchema,
  capturedAt: isoDateSchema,
  incidentId: uuidSchema.nullish(),
  vehicleId: uuidSchema.nullish(),
});

export const sealEvidenceSchema = z.object({
  /** Recomputed by the evidence service after the upload completes. */
  checksum: checksumSchema,
});

export const exportEvidenceSchema = z.object({
  /** Recorded in the custody chain. Required for law-enforcement disclosure. */
  reason: z.string().trim().min(10).max(500),
  recipient: z.string().trim().min(2).max(160),
});

export const evidenceIdParamSchema = z.object({ evidenceId: uuidSchema });

export type ListEvidenceQuery = z.infer<typeof listEvidenceQuerySchema>;
export type RegisterEvidenceInput = z.infer<typeof registerEvidenceSchema>;
export type SealEvidenceInput = z.infer<typeof sealEvidenceSchema>;
export type ExportEvidenceInput = z.infer<typeof exportEvidenceSchema>;
