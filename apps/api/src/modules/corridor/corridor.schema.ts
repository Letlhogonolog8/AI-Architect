import { z } from 'zod';
import {
  enumSchema,
  geoPointSchema,
  isoDateSchema,
  paginationQuerySchema,
  uuidSchema,
} from '@aegisdrive/shared';
import { HazardSource, IncidentType, RiskAversion, SafeHavenKind } from '@aegisdrive/types';

/**
 * Corridor validation.
 *
 * The important schemas here are the ones that are **absent**, and each absence
 * is a design constraint rather than an oversight.
 *
 * **No `avoidAreas` on a route request.** There is no polygon-exclusion field,
 * no "avoid suburb" list and no destination blocklist. Risk avoidance happens
 * in the objective, against segment hazards, where it is bounded by a detour
 * cap and counted for equity review. A caller-supplied avoidance polygon would
 * bypass all of that and redline invisibly.
 *
 * **No area-level hazard.** `recordHazardSchema` takes a segment id. There is
 * no field for a suburb, a district or an area type, and no way to express
 * "this neighbourhood is dangerous".
 *
 * **No `PLATFORM_ALERT` hazard source.** The enum comes from `@aegisdrive/types`
 * and does not contain one. The platform's own alerts never become its risk
 * map — that loop manufactures the pattern it claims to find.
 */

export const planRouteSchema = z.object({
  origin: geoPointSchema,
  destination: geoPointSchema,
  waypoints: z.array(geoPointSchema).max(12).default([]),
  departAt: isoDateSchema,
  vehicleId: uuidSchema.nullable().default(null),
  driverId: uuidSchema.nullable().default(null),
  riskAversion: enumSchema(RiskAversion).default(RiskAversion.STANDARD),
});

/**
 * A confirmed-incident observation feeding a segment's hazard rate.
 *
 * `exposureVehicleHours` is required and has a real minimum. Without a
 * denominator an incident count is not a rate — two incidents on a road nobody
 * drives and two on the M1 are entirely different facts, and only the exposure
 * distinguishes them. Accepting a count alone would invite a hand-entered
 * "risk score" through the back door.
 */
export const recordHazardSchema = z.object({
  segmentId: uuidSchema,
  incidentType: enumSchema(IncidentType),
  confirmedIncidents: z.number().int().min(0).max(100_000),
  exposureVehicleHours: z.number().min(1).max(100_000_000),
  activeFromHour: z.number().int().min(0).max(23).nullable().default(null),
  activeToHour: z.number().int().min(0).max(23).nullable().default(null),
  source: enumSchema(HazardSource),
  observedFrom: isoDateSchema,
  observedUntil: isoDateSchema,
});

export const createHavenSchema = z.object({
  kind: enumSchema(SafeHavenKind),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(240),
  position: geoPointSchema,
  isTwentyFourHour: z.boolean().default(false),
  openFromHour: z.number().int().min(0).max(23).nullable().default(null),
  openToHour: z.number().int().min(0).max(23).nullable().default(null),
  hasArmedSecurity: z.boolean().default(false),
  hasCctv: z.boolean().default(false),
  hasLighting: z.boolean().default(false),
  hasStandingArrangement: z.boolean().default(false),
  contactNumber: z.string().trim().max(32).nullable().default(null),
});

export const havenQuerySchema = z.object({
  longitude: z.coerce.number().min(-180).max(180),
  latitude: z.coerce.number().min(-90).max(90),
  /** Local hour for opening-hours checks. Defaults to now, server-side. */
  atHour: z.coerce.number().int().min(0).max(23).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

/**
 * A grant of route visibility to law enforcement.
 *
 * `incidentId` is required, not nullable. There is no incident-free sharing:
 * continuous location sharing of a worker with the police is surveillance with
 * an extra step, and the one case that justifies it — a vehicle being hijacked,
 * and officers who might intercept it — always has an incident attached.
 *
 * `expiresInMinutes` is capped at twelve hours. A grant that outlives the
 * shift it was issued in has stopped being incident-scoped.
 */
export const grantPoliceShareSchema = z.object({
  incidentId: uuidSchema,
  vehicleId: uuidSchema,
  routePlanId: uuidSchema.nullable().default(null),
  recipientReference: z.string().trim().min(2).max(120),
  justification: z.string().trim().min(20).max(1000),
  expiresInMinutes: z.number().int().min(5).max(720).default(120),
});

export const listPlansQuerySchema = paginationQuerySchema.extend({
  vehicleId: uuidSchema.optional(),
  driverId: uuidSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const equityQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(7).max(180).default(30),
});

export const planIdParamSchema = z.object({ planId: uuidSchema });
export const havenIdParamSchema = z.object({ havenId: uuidSchema });
export const shareIdParamSchema = z.object({ shareId: uuidSchema });

export type PlanRouteBody = z.infer<typeof planRouteSchema>;
export type RecordHazardBody = z.infer<typeof recordHazardSchema>;
export type CreateHavenBody = z.infer<typeof createHavenSchema>;
export type HavenQuery = z.infer<typeof havenQuerySchema>;
export type GrantPoliceShareBody = z.infer<typeof grantPoliceShareSchema>;
export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;
export type EquityQuery = z.infer<typeof equityQuerySchema>;
