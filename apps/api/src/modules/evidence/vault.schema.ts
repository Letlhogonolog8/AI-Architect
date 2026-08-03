import { z } from 'zod';
import { MAX_EXPORT_BUNDLE_ITEMS, paginationQuerySchema, uuidSchema } from '@aegisdrive/shared';

/**
 * Assembles a court-export bundle from one or more sealed artefacts.
 *
 * The recipient and reason are required and recorded, as they already are for a
 * single-artefact disclosure — a court bundle is a disclosure too, and an
 * unattributed one is not admissible.
 */
export const createExportBundleSchema = z.object({
  evidenceIds: z.array(uuidSchema).min(1).max(MAX_EXPORT_BUNDLE_ITEMS),
  incidentId: uuidSchema.nullish(),
  recipient: z.string().trim().min(2).max(160),
  reason: z.string().trim().min(10).max(500),
});

export const listExportBundlesQuerySchema = paginationQuerySchema.extend({
  incidentId: uuidSchema.optional(),
});

export const bundleIdParamSchema = z.object({ bundleId: uuidSchema });
export const incidentIdParamSchema = z.object({ incidentId: uuidSchema });

export type CreateExportBundleInput = z.infer<typeof createExportBundleSchema>;
export type ListExportBundlesQuery = z.infer<typeof listExportBundlesQuerySchema>;
