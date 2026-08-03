import { z } from 'zod';
import {
  enumSchema,
  geoPointSchema,
  isoDateSchema,
  paginationQuerySchema,
  uuidSchema,
} from '@aegisdrive/shared';
import { IncidentSeverity, IncidentStatus, IncidentType } from '@aegisdrive/types';

export const listIncidentsQuerySchema = paginationQuerySchema.extend({
  status: enumSchema(IncidentStatus).optional(),
  severity: enumSchema(IncidentSeverity).optional(),
  type: enumSchema(IncidentType).optional(),
  vehicleId: uuidSchema.optional(),
  driverId: uuidSchema.optional(),
  assignedToUserId: uuidSchema.optional(),
  /** Shorthand for "everything still needing attention". */
  openOnly: z.coerce.boolean().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  search: z.string().trim().min(1).max(64).optional(),
});

export const createIncidentSchema = z.object({
  type: enumSchema(IncidentType),
  severity: enumSchema(IncidentSeverity),
  title: z.string().trim().min(4).max(160),
  summary: z.string().trim().min(10).max(5_000),
  vehicleId: uuidSchema.nullish(),
  driverId: uuidSchema.nullish(),
  position: geoPointSchema.nullish(),
  detectedAt: isoDateSchema.optional(),
  /**
   * Only populated by the AI services. An operator filing an incident by hand
   * leaves it null, which is how the analytics split human from model detections.
   */
  aiConfidence: z.number().min(0).max(1).nullish(),
});

export const updateIncidentSchema = z
  .object({
    severity: enumSchema(IncidentSeverity).optional(),
    title: z.string().trim().min(4).max(160).optional(),
    summary: z.string().trim().min(10).max(5_000).optional(),
    assignedToUserId: uuidSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const changeIncidentStatusSchema = z.object({
  status: enumSchema(IncidentStatus),
  note: z.string().trim().min(3).max(1_000).optional(),
});

export const addTimelineNoteSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
});

export const dispatchSchema = z.object({
  /** Free-text until the responder directory lands, e.g. "Armed Response Unit 7". */
  responder: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(1_000).optional(),
});

export const incidentIdParamSchema = z.object({ incidentId: uuidSchema });

export type ListIncidentsQuery = z.infer<typeof listIncidentsQuerySchema>;
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
export type ChangeIncidentStatusInput = z.infer<typeof changeIncidentStatusSchema>;
export type AddTimelineNoteInput = z.infer<typeof addTimelineNoteSchema>;
export type DispatchInput = z.infer<typeof dispatchSchema>;
