import type {
  PoliceRouteShare as ShareRow,
  RoutePlan as PlanRow,
  SafeHaven as HavenRow,
} from '@prisma/client';
import type {
  PoliceRouteShare,
  RiskAversion,
  RouteCandidate,
  RoutePlan,
  SafeHaven,
  SafeHavenKind,
} from '@aegisdrive/types';

/**
 * Prisma row → wire DTO.
 *
 * The JSON columns are parsed defensively rather than cast, for the reason that
 * applies across this codebase: a plan written by an earlier engine version may
 * have a shape today's code does not expect, and a historical route must still
 * render when someone is asking why a driver was sent that way.
 */

export function toHavenDto(row: HavenRow): SafeHaven {
  return {
    id: row.id,
    organizationId: row.organizationId,
    kind: row.kind as SafeHavenKind,
    name: row.name,
    address: row.address,
    position: { longitude: row.longitude, latitude: row.latitude },
    isTwentyFourHour: row.isTwentyFourHour,
    openFromHour: row.openFromHour,
    openToHour: row.openToHour,
    hasArmedSecurity: row.hasArmedSecurity,
    hasCctv: row.hasCctv,
    hasLighting: row.hasLighting,
    hasStandingArrangement: row.hasStandingArrangement,
    contactNumber: row.contactNumber,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPlanDto(row: PlanRow): RoutePlan {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    driverId: row.driverId,
    chosen: parseCandidate(row.chosen),
    rejected: parseCandidates(row.rejected),
    riskAversion: row.riskAversion as RiskAversion,
    riskAversionMinutesPerIncident: row.riskAversionMinutesPerIncident,
    rationale: parseStringArray(row.rationale),
    constraints: parseStringArray(row.constraints),
    plannedAt: row.plannedAt.toISOString(),
    departAt: row.departAt.toISOString(),
    engineVersion: row.engineVersion,
    hazardCalibrationSource: row.hazardCalibrationSource,
    supersededByPlanId: row.supersededByPlanId,
    supersededReason: row.supersededReason,
  };
}

/**
 * A share, as returned to the operator who granted it.
 *
 * Carries no route data. Resolving a share into an actual route is
 * `resolvePoliceShare`, which checks expiry, revocation and incident status in
 * the query — so listing grants for review never leaks the thing the grant
 * controls access to.
 */
export function toShareDto(row: ShareRow): PoliceRouteShare {
  return {
    id: row.id,
    organizationId: row.organizationId,
    incidentId: row.incidentId,
    vehicleId: row.vehicleId,
    routePlanId: row.routePlanId,
    recipientReference: row.recipientReference,
    justification: row.justification,
    grantedByUserId: row.grantedByUserId,
    grantedAt: row.grantedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedByUserId: row.revokedByUserId,
    accessCount: row.accessCount,
    lastAccessedAt: row.lastAccessedAt?.toISOString() ?? null,
    expiresWithIncident: true,
  };
}

const EMPTY_CANDIDATE: RouteCandidate = {
  id: '',
  label: '',
  legs: [],
  totalDistanceMetres: 0,
  totalTransitSeconds: 0,
  expectedIncidents: 0,
  objectiveMinutes: 0,
  detourSeconds: 0,
  riskReduction: 0,
  confidence: 0,
  havenCoverage: { reachableCount: 0, longestGapSeconds: 0, hasUncoveredStretch: false },
};

function parseCandidate(value: unknown): RouteCandidate {
  if (typeof value !== 'object' || value === null) return EMPTY_CANDIDATE;

  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string') return EMPTY_CANDIDATE;

  return { ...EMPTY_CANDIDATE, ...(record as unknown as RouteCandidate) };
}

function parseCandidates(value: unknown): RouteCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseCandidate).filter((candidate) => candidate.id !== '');
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}
