import { z } from 'zod';
import {
  MAX_GEOFENCE_RADIUS_METRES,
  MIN_GEOFENCE_RADIUS_METRES,
  enumSchema,
  geoPointSchema,
  isoDateSchema,
  paginationQuerySchema,
  uuidSchema,
} from '@aegisdrive/shared';
import {
  DroneObjective,
  DroneTaskStatus,
  GeofenceKind,
  GeofenceTrigger,
  IncidentSeverity,
  RecoveryStatus,
  SearchAssignmentStatus,
  TrackSource,
} from '@aegisdrive/types';

const radiusSchema = z
  .number()
  .int()
  .min(MIN_GEOFENCE_RADIUS_METRES)
  .max(MAX_GEOFENCE_RADIUS_METRES);

// ------------------------------------------------------------------- cases

export const openCaseSchema = z.object({
  vehicleId: uuidSchema,
  incidentId: uuidSchema.nullish(),
  priority: enumSchema(IncidentSeverity).optional(),
  /** Last known position at the moment the case is opened, when there is one. */
  position: geoPointSchema.nullish(),
  note: z.string().trim().min(1).max(1_000).optional(),
});

export const listCasesQuerySchema = paginationQuerySchema.extend({
  status: enumSchema(RecoveryStatus).optional(),
  priority: enumSchema(IncidentSeverity).optional(),
  vehicleId: uuidSchema.optional(),
  /** Shorthand for "everything still being worked". */
  openOnly: z.coerce.boolean().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const updateCaseSchema = z
  .object({
    priority: enumSchema(IncidentSeverity).optional(),
    outcome: z.string().trim().min(1).max(2_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const changeCaseStatusSchema = z.object({
  status: enumSchema(RecoveryStatus),
  note: z.string().trim().min(1).max(1_000).optional(),
  /** Where it was recovered. Accepted (and encouraged) when moving to RECOVERED. */
  recoveredPosition: geoPointSchema.nullish(),
});

// ------------------------------------------------------------------- track

export const addTrackPointSchema = z.object({
  position: geoPointSchema,
  heading: z.number().min(0).max(360).nullish(),
  speedKph: z.number().min(0).nullish(),
  accuracyMetres: z.number().min(0).nullish(),
  source: enumSchema(TrackSource),
  confidence: z.number().min(0).max(1),
  note: z.string().trim().min(1).max(500).optional(),
  /** When the sighting occurred. Defaults to now for a live feed. */
  recordedAt: isoDateSchema.optional(),
});

// --------------------------------------------------------------- searchers

const sectorSchema = z.object({
  centre: geoPointSchema,
  radiusMetres: radiusSchema,
});

export const assignSearcherSchema = z.object({
  searcherReference: z.string().trim().min(2).max(160),
  /** A fleet vehicle tasked to search, when the searcher is one of ours. */
  searcherVehicleId: uuidSchema.nullish(),
  sector: sectorSchema.nullish(),
  notes: z.string().trim().min(1).max(1_000).optional(),
});

export const updateSearcherSchema = z.object({
  status: enumSchema(SearchAssignmentStatus),
  notes: z.string().trim().min(1).max(1_000).optional(),
});

// -------------------------------------------------------------- geofencing

export const createGeofenceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  kind: enumSchema(GeofenceKind),
  trigger: enumSchema(GeofenceTrigger).optional(),
  centre: geoPointSchema,
  radiusMetres: radiusSchema,
  /** Bind the fence to a recovery case, or leave null for a fleet-wide fence. */
  recoveryCaseId: uuidSchema.nullish(),
  expiresAt: isoDateSchema.nullish(),
});

export const updateGeofenceSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    isActive: z.boolean().optional(),
    radiusMetres: radiusSchema.optional(),
    expiresAt: isoDateSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const listGeofencesQuerySchema = paginationQuerySchema.extend({
  kind: enumSchema(GeofenceKind).optional(),
  recoveryCaseId: uuidSchema.optional(),
  activeOnly: z.coerce.boolean().optional(),
});

export const evaluateGeofenceSchema = z.object({
  position: geoPointSchema,
  /**
   * The vehicle whose crossing to record. Without it the evaluation only reports
   * which fences the point lies inside — a crossing needs a subject to have a
   * before-and-after state.
   */
  vehicleId: uuidSchema.nullish(),
});

// ------------------------------------------------------------------ drones

export const taskDroneSchema = z.object({
  droneReference: z.string().trim().min(2).max(120),
  objective: enumSchema(DroneObjective),
  target: geoPointSchema.nullish(),
});

export const updateDroneTaskSchema = z.object({
  status: enumSchema(DroneTaskStatus),
  externalReference: z.string().trim().min(1).max(160).optional(),
  failureReason: z.string().trim().min(1).max(500).optional(),
});

// ------------------------------------------------------------------ params

export const caseIdParamSchema = z.object({ caseId: uuidSchema });
export const assignmentIdParamSchema = z.object({ assignmentId: uuidSchema });
export const geofenceIdParamSchema = z.object({ geofenceId: uuidSchema });
export const taskIdParamSchema = z.object({ taskId: uuidSchema });

export type OpenCaseInput = z.infer<typeof openCaseSchema>;
export type ListCasesQuery = z.infer<typeof listCasesQuerySchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
export type ChangeCaseStatusInput = z.infer<typeof changeCaseStatusSchema>;
export type AddTrackPointInput = z.infer<typeof addTrackPointSchema>;
export type AssignSearcherInput = z.infer<typeof assignSearcherSchema>;
export type UpdateSearcherInput = z.infer<typeof updateSearcherSchema>;
export type CreateGeofenceInput = z.infer<typeof createGeofenceSchema>;
export type UpdateGeofenceInput = z.infer<typeof updateGeofenceSchema>;
export type ListGeofencesQuery = z.infer<typeof listGeofencesQuerySchema>;
export type EvaluateGeofenceInput = z.infer<typeof evaluateGeofenceSchema>;
export type TaskDroneInput = z.infer<typeof taskDroneSchema>;
export type UpdateDroneTaskInput = z.infer<typeof updateDroneTaskSchema>;
