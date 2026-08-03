import { z } from 'zod';
import { enumSchema, paginationQuerySchema, uuidSchema } from '@aegisdrive/shared';
import { AlertStatus, AlertType, IncidentSeverity } from '@aegisdrive/types';

export const listAlertsQuerySchema = paginationQuerySchema.extend({
  status: enumSchema(AlertStatus).optional(),
  type: enumSchema(AlertType).optional(),
  severity: enumSchema(IncidentSeverity).optional(),
  vehicleId: uuidSchema.optional(),
  incidentId: uuidSchema.optional(),
});

export const raiseAlertSchema = z.object({
  type: enumSchema(AlertType),
  severity: enumSchema(IncidentSeverity),
  title: z.string().trim().min(4).max(160),
  message: z.string().trim().min(4).max(2_000),
  vehicleId: uuidSchema.nullish(),
  driverId: uuidSchema.nullish(),
  incidentId: uuidSchema.nullish(),
});

export const acknowledgeAlertSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

/** Suppression needs a reason: silencing an alert class is a reviewable decision. */
export const suppressAlertSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

export const alertIdParamSchema = z.object({ alertId: uuidSchema });

export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;
export type RaiseAlertInput = z.infer<typeof raiseAlertSchema>;
export type AcknowledgeAlertInput = z.infer<typeof acknowledgeAlertSchema>;
export type SuppressAlertInput = z.infer<typeof suppressAlertSchema>;
