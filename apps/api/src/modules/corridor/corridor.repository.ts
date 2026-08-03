import type { Prisma } from '@prisma/client';
import type {
  HazardSource,
  IncidentType,
  PaginationQuery,
  RiskAversion,
  SafeHavenKind,
} from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

/**
 * Corridor persistence.
 *
 * Four rules beyond the usual tenant scoping:
 *
 *   1. **No query groups hazard by area.** There is no column to group on and
 *      no method that would produce an area-level risk figure. Adding one would
 *      be the change to argue about, because a "risk by suburb" report is the
 *      artefact that turns segment-level routing into redlining.
 *
 *   2. **Route plans are append-only.** Superseding writes a pointer on the old
 *      plan rather than mutating it. A route that put a driver somewhere may be
 *      examined later, and "we replaced it" is not a record.
 *
 *   3. **Police shares resolve only while live.** `findLivePoliceShare` filters
 *      on expiry and revocation in the query, so an expired grant returns
 *      nothing rather than returning data a caller must remember to check.
 *
 *   4. **Equity records are never deleted.** They are the evidence that the
 *      router's cost was monitored, and they outlive the plans they describe.
 */

// ============================================================================
// Hazards
// ============================================================================

export async function findHazardsForSegments(segmentIds: readonly string[]) {
  if (segmentIds.length === 0) return [];

  return prisma.segmentHazard.findMany({
    where: {
      segmentId: { in: [...segmentIds] },
      OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
    },
  });
}

export async function upsertHazard(
  organizationId: string,
  data: {
    segmentId: string;
    incidentType: IncidentType;
    ratePerMillionVehicleHours: number;
    activeFromHour: number | null;
    activeToHour: number | null;
    confidence: number;
    observationCount: number;
    exposureVehicleHours: number;
    source: HazardSource;
    reportingBiasPossible: boolean;
    validFrom: Date;
  },
) {
  return prisma.segmentHazard.create({
    data: { organizationId, ...data, lastComputedAt: new Date() },
  });
}

export async function findSegmentByRef(externalRef: string) {
  return prisma.roadSegment.findUnique({ where: { externalRef } });
}

export async function findSegmentById(segmentId: string) {
  return prisma.roadSegment.findUnique({ where: { id: segmentId } });
}

// ============================================================================
// Safe havens
// ============================================================================

export async function findHavens(organizationId: string) {
  return prisma.safeHaven.findMany({
    where: { organizationId, isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function insertHaven(
  organizationId: string,
  data: {
    kind: SafeHavenKind;
    name: string;
    address: string;
    longitude: number;
    latitude: number;
    isTwentyFourHour: boolean;
    openFromHour: number | null;
    openToHour: number | null;
    hasArmedSecurity: boolean;
    hasCctv: boolean;
    hasLighting: boolean;
    hasStandingArrangement: boolean;
    contactNumber: string | null;
  },
) {
  return prisma.safeHaven.create({
    data: { organizationId, ...data, lastVerifiedAt: new Date() },
  });
}

/**
 * Marks a haven as re-verified.
 *
 * Its own operation rather than a field on a general update, because
 * verification is a claim someone is making — "I confirmed this place is still
 * open and still qualifies" — and it should be as deliberate and as auditable
 * as any other assertion the platform records.
 */
export async function markHavenVerified(organizationId: string, havenId: string) {
  const result = await prisma.safeHaven.updateMany({
    where: { id: havenId, organizationId },
    data: { lastVerifiedAt: new Date() },
  });

  if (result.count === 0) return null;
  return prisma.safeHaven.findUnique({ where: { id: havenId } });
}

export async function deactivateHaven(organizationId: string, havenId: string) {
  const result = await prisma.safeHaven.updateMany({
    where: { id: havenId, organizationId },
    data: { isActive: false },
  });

  return result.count > 0;
}

// ============================================================================
// Route plans
// ============================================================================

export interface PlanFilter extends PaginationQuery {
  organizationId: string;
  vehicleId?: string;
  driverId?: string;
  from?: Date;
  to?: Date;
}

export async function insertPlan(data: {
  organizationId: string;
  vehicleId: string | null;
  driverId: string | null;
  chosen: Prisma.InputJsonValue;
  rejected: Prisma.InputJsonValue;
  totalTransitSeconds: number;
  expectedIncidents: number;
  detourSeconds: number;
  riskReduction: number;
  riskAversion: RiskAversion;
  riskAversionMinutesPerIncident: number;
  rationale: Prisma.InputJsonValue;
  constraints: Prisma.InputJsonValue;
  departAt: Date;
  engineVersion: string;
  hazardCalibrationSource: string;
  providerId: string;
}) {
  return prisma.routePlan.create({ data });
}

export async function findPlans(filter: PlanFilter) {
  const where: Prisma.RoutePlanWhereInput = {
    organizationId: filter.organizationId,
    vehicleId: filter.vehicleId,
    driverId: filter.driverId,
    plannedAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };

  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.routePlan.findMany({ where, orderBy: { plannedAt: 'desc' }, skip, take }),
    prisma.routePlan.count({ where }),
  ]);

  return { rows, total };
}

export async function findPlanById(organizationId: string, planId: string) {
  return prisma.routePlan.findFirst({ where: { id: planId, organizationId } });
}

export async function findActivePlanForVehicle(organizationId: string, vehicleId: string) {
  return prisma.routePlan.findFirst({
    where: { organizationId, vehicleId, supersededByPlanId: null },
    orderBy: { plannedAt: 'desc' },
  });
}

/**
 * Points an old plan at its replacement.
 *
 * The old plan is not deleted or rewritten — only annotated. The chain of
 * supersessions is how an investigator reconstructs what the driver was told
 * and when it changed, which is exactly the question a re-routed trip raises.
 */
export async function supersedePlan(
  organizationId: string,
  planId: string,
  supersededByPlanId: string,
  reason: string,
) {
  await prisma.routePlan.updateMany({
    where: { id: planId, organizationId, supersededByPlanId: null },
    data: { supersededByPlanId, supersededReason: reason },
  });
}

// ============================================================================
// Equity
// ============================================================================

export async function insertEquityRecord(data: {
  organizationId: string;
  routePlanId: string;
  destinationCell: string;
  baselineSeconds: number;
  chosenSeconds: number;
  detourSecondsAttributable: number;
  riskReduction: number;
}) {
  return prisma.routingEquityRecord.create({ data });
}

export async function findEquityRecords(organizationId: string, since: Date) {
  return prisma.routingEquityRecord.findMany({
    where: { organizationId, recordedAt: { gte: since } },
    orderBy: { recordedAt: 'desc' },
  });
}

// ============================================================================
// Police sharing
// ============================================================================

export async function insertPoliceShare(data: {
  organizationId: string;
  incidentId: string;
  vehicleId: string;
  routePlanId: string | null;
  recipientReference: string;
  justification: string;
  grantedByUserId: string;
  expiresAt: Date;
}) {
  return prisma.policeRouteShare.create({ data });
}

/**
 * Resolves a grant only while it is live.
 *
 * Expiry and revocation are in the `where` clause rather than checked by the
 * caller. A grant that has lapsed returns nothing at all, so there is no code
 * path in which stale route data reaches a recipient because someone forgot a
 * conditional.
 */
export async function findLivePoliceShare(shareId: string) {
  return prisma.policeRouteShare.findFirst({
    where: {
      id: shareId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      incident: { status: { in: ['DETECTED', 'TRIAGED', 'ESCALATED', 'RESPONDING'] } },
    },
    include: { routePlan: true },
  });
}

export async function recordShareAccess(shareId: string) {
  await prisma.policeRouteShare.update({
    where: { id: shareId },
    data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
  });
}

export async function revokePoliceShare(organizationId: string, shareId: string, userId: string) {
  const result = await prisma.policeRouteShare.updateMany({
    where: { id: shareId, organizationId, revokedAt: null },
    data: { revokedAt: new Date(), revokedByUserId: userId },
  });

  if (result.count === 0) return null;
  return prisma.policeRouteShare.findUnique({ where: { id: shareId } });
}

export async function findPoliceSharesForIncident(organizationId: string, incidentId: string) {
  return prisma.policeRouteShare.findMany({
    where: { organizationId, incidentId },
    orderBy: { grantedAt: 'desc' },
  });
}
