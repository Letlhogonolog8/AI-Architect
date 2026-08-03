import type { Prisma } from '@prisma/client';
import {
  AuditAction,
  type AuthUser,
  type GeoPoint,
  type RouteCandidate,
  type SafeHaven,
  type SegmentHazard,
} from '@aegisdrive/types';
import {
  ConflictError,
  NotFoundError,
  NotImplementedError,
  RouteProviderUnavailableError,
  buildEquityReport,
  computeHazardRate,
  normalisePagination,
  paginate,
  planRoute,
  rankHavens,
  recordEquity,
} from '@aegisdrive/shared';
import { moduleLogger } from '../../core/logger';
import { recordAudit } from '../audit-logs/audit.service';
import * as repository from './corridor.repository';
import { toHavenDto, toPlanDto, toShareDto } from './corridor.mapper';
import type {
  CreateHavenBody,
  EquityQuery,
  GrantPoliceShareBody,
  HavenQuery,
  ListPlansQuery,
  PlanRouteBody,
  RecordHazardBody,
} from './corridor.schema';

const log = moduleLogger('corridor');

/**
 * SafeCorridor service.
 *
 * Plans routes, curates hazard data, ranks safe havens, and administers
 * time-bounded police visibility grants.
 *
 * **Route planning currently returns 501.** The hazard model, the objective,
 * the detour bounds, haven coverage, recalculation hysteresis and equity
 * accounting are all built. What is missing is a road-graph provider to turn
 * two coordinates into candidate paths — ADR-0004 deferred the map integration
 * and that still stands. The failure is loud rather than a fabricated straight
 * line between two points.
 */

export async function planRouteForRequest(user: AuthUser, input: PlanRouteBody) {
  const havens = (await repository.findHavens(user.organizationId)).map(toHavenDto);

  try {
    const result = await planRoute({
      request: {
        origin: input.origin,
        destination: input.destination,
        waypoints: input.waypoints,
        departAt: input.departAt,
        vehicleId: input.vehicleId,
        riskAversion: input.riskAversion,
      },
      // Hazards and traffic are keyed by segment, and segments only exist once
      // a provider has returned a path. With no provider these are empty and
      // the call fails before they are read.
      hazardsBySegment: new Map<string, SegmentHazard[]>(),
      trafficBySegment: new Map(),
      havens,
    });

    return persistPlan(user, input, result, havens);
  } catch (error) {
    if (error instanceof RouteProviderUnavailableError) {
      // 501, not 500. A deployment fact rather than a fault, and the same
      // posture the AI gateway takes for a missing model: the caller asked for
      // something this build cannot do, and inventing a route would be worse
      // than saying so.
      throw new NotImplementedError(error.message);
    }

    throw error;
  }
}

async function persistPlan(
  user: AuthUser,
  input: PlanRouteBody,
  result: Awaited<ReturnType<typeof planRoute>>,
  havens: readonly SafeHaven[],
) {
  void havens;

  const row = await repository.insertPlan({
    organizationId: user.organizationId,
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    chosen: result.chosen as unknown as Prisma.InputJsonValue,
    rejected: result.rejected as unknown as Prisma.InputJsonValue,
    totalTransitSeconds: result.chosen.totalTransitSeconds,
    expectedIncidents: result.chosen.expectedIncidents,
    detourSeconds: result.chosen.detourSeconds,
    riskReduction: result.chosen.riskReduction,
    riskAversion: result.riskAversion,
    riskAversionMinutesPerIncident: result.riskAversionMinutesPerIncident,
    rationale: result.rationale as unknown as Prisma.InputJsonValue,
    constraints: result.constraints as unknown as Prisma.InputJsonValue,
    departAt: new Date(input.departAt),
    engineVersion: result.engineVersion,
    hazardCalibrationSource: result.hazardCalibrationSource,
    providerId: result.providerId,
  });

  // Written on every plan, including the ones with no detour. A record only of
  // the trips that cost extra would understate the denominator and make the
  // equity report read better than reality.
  await recordPlanEquity(user, row.id, input.destination, result.chosen, result.fastest);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'route_plan',
    resourceId: row.id,
    metadata: {
      vehicleId: input.vehicleId,
      riskAversion: result.riskAversion,
      detourSeconds: result.chosen.detourSeconds,
      riskReduction: result.chosen.riskReduction,
      constraints: result.constraints,
      providerId: result.providerId,
    },
  });

  return toPlanDto(row);
}

async function recordPlanEquity(
  user: AuthUser,
  planId: string,
  destination: GeoPoint,
  chosen: RouteCandidate,
  fastest: RouteCandidate,
): Promise<void> {
  const record = recordEquity({ routePlanId: planId, destination, chosen, fastest });

  await repository.insertEquityRecord({
    organizationId: user.organizationId,
    routePlanId: planId,
    destinationCell: record.destinationCell,
    baselineSeconds: record.baselineSeconds,
    chosenSeconds: record.chosenSeconds,
    detourSecondsAttributable: record.detourSecondsAttributable,
    riskReduction: record.riskReduction,
  });
}

// ============================================================================
// Hazards
// ============================================================================

/**
 * Records a confirmed-incident observation and recomputes the segment's rate.
 *
 * The rate is **computed here from counts and exposure**, never accepted from
 * the caller. An endpoint taking a rate directly would let an analyst enter a
 * number they eyeballed, and a hand-entered rate is a risk score wearing a
 * unit — exactly what this design replaced.
 */
export async function recordHazard(user: AuthUser, input: RecordHazardBody) {
  const segment = await repository.findSegmentById(input.segmentId);
  if (!segment) throw new NotFoundError('Road segment', input.segmentId);

  const hazard = computeHazardRate({
    segmentId: input.segmentId,
    incidentType: input.incidentType,
    confirmedIncidents: input.confirmedIncidents,
    exposureVehicleHours: input.exposureVehicleHours,
    activeFromHour: input.activeFromHour,
    activeToHour: input.activeToHour,
    source: input.source,
    observedFrom: input.observedFrom,
    observedUntil: input.observedUntil,
  });

  const row = await repository.upsertHazard(user.organizationId, {
    segmentId: input.segmentId,
    incidentType: input.incidentType,
    ratePerMillionVehicleHours: hazard.ratePerMillionVehicleHours,
    activeFromHour: hazard.activeFromHour,
    activeToHour: hazard.activeToHour,
    confidence: hazard.confidence,
    observationCount: hazard.observationCount,
    exposureVehicleHours: input.exposureVehicleHours,
    source: hazard.source,
    reportingBiasPossible: hazard.reportingBiasPossible,
    validFrom: new Date(input.observedFrom),
  });

  if (hazard.reportingBiasPossible) {
    log.info(
      { segmentId: input.segmentId, source: input.source, confidence: hazard.confidence },
      'Hazard recorded from a reporting-biased source; confidence lowered rather than rate adjusted',
    );
  }

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'segment_hazard',
    resourceId: row.id,
    metadata: {
      segmentId: input.segmentId,
      incidentType: input.incidentType,
      ratePerMillionVehicleHours: hazard.ratePerMillionVehicleHours,
      confidence: hazard.confidence,
      source: input.source,
      reportingBiasPossible: hazard.reportingBiasPossible,
    },
  });

  return {
    id: row.id,
    segmentId: row.segmentId,
    incidentType: row.incidentType,
    ratePerMillionVehicleHours: row.ratePerMillionVehicleHours,
    confidence: row.confidence,
    observationCount: row.observationCount,
    reportingBiasPossible: row.reportingBiasPossible,
    note: hazard.reportingBiasPossible
      ? 'This source measures reporting and policing intensity as well as crime. Confidence has been lowered rather than the rate adjusted, because the size of the bias is unknown and varies by area.'
      : null,
  };
}

// ============================================================================
// Safe havens
// ============================================================================

export async function listHavens(user: AuthUser) {
  return (await repository.findHavens(user.organizationId)).map(toHavenDto);
}

export async function nearestHavens(user: AuthUser, query: HavenQuery) {
  const havens = (await repository.findHavens(user.organizationId)).map(toHavenDto);

  return rankHavens({
    havens,
    from: { longitude: query.longitude, latitude: query.latitude },
    atHour: query.atHour ?? new Date().getUTCHours(),
    limit: query.limit,
  });
}

export async function createHaven(user: AuthUser, input: CreateHavenBody) {
  const row = await repository.insertHaven(user.organizationId, {
    kind: input.kind,
    name: input.name,
    address: input.address,
    longitude: input.position.longitude,
    latitude: input.position.latitude,
    isTwentyFourHour: input.isTwentyFourHour,
    openFromHour: input.openFromHour,
    openToHour: input.openToHour,
    hasArmedSecurity: input.hasArmedSecurity,
    hasCctv: input.hasCctv,
    hasLighting: input.hasLighting,
    hasStandingArrangement: input.hasStandingArrangement,
    contactNumber: input.contactNumber,
  });

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'safe_haven',
    resourceId: row.id,
    metadata: { kind: input.kind, name: input.name },
  });

  return toHavenDto(row);
}

export async function verifyHaven(user: AuthUser, havenId: string) {
  const row = await repository.markHavenVerified(user.organizationId, havenId);
  if (!row) throw new NotFoundError('Safe haven', havenId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'safe_haven',
    resourceId: havenId,
    metadata: { verified: true },
  });

  return toHavenDto(row);
}

// ============================================================================
// Plans
// ============================================================================

export async function listPlans(user: AuthUser, query: ListPlansQuery) {
  const pagination = normalisePagination(query);

  const { rows, total } = await repository.findPlans({
    ...pagination,
    organizationId: user.organizationId,
    vehicleId: query.vehicleId,
    driverId: query.driverId,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });

  return paginate(rows.map(toPlanDto), pagination, total);
}

export async function getPlan(user: AuthUser, planId: string) {
  const row = await repository.findPlanById(user.organizationId, planId);
  if (!row) throw new NotFoundError('Route plan', planId);

  return toPlanDto(row);
}

// ============================================================================
// Equity
// ============================================================================

/**
 * The routing equity report.
 *
 * Gated on `corridor:read` rather than an administrative permission, and
 * deliberately so. The point of measuring the detour burden is that somebody
 * looks at it; putting it behind a rare permission would make it a report
 * nobody runs, which is indistinguishable from not measuring at all.
 */
export async function getEquityReport(user: AuthUser, query: EquityQuery) {
  const since = new Date(Date.now() - query.windowDays * 86_400_000);
  const rows = await repository.findEquityRecords(user.organizationId, since);

  return buildEquityReport(
    rows.map((row) => ({
      routePlanId: row.routePlanId,
      destinationCell: row.destinationCell,
      baselineSeconds: row.baselineSeconds,
      chosenSeconds: row.chosenSeconds,
      detourSecondsAttributable: row.detourSecondsAttributable,
      riskReduction: row.riskReduction,
      recordedAt: row.recordedAt.toISOString(),
    })),
    query.windowDays,
  );
}

// ============================================================================
// Police sharing
// ============================================================================

export async function grantPoliceShare(user: AuthUser, input: GrantPoliceShareBody) {
  const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000);

  const row = await repository.insertPoliceShare({
    organizationId: user.organizationId,
    incidentId: input.incidentId,
    vehicleId: input.vehicleId,
    routePlanId: input.routePlanId,
    recipientReference: input.recipientReference,
    justification: input.justification,
    grantedByUserId: user.id,
    expiresAt,
  });

  log.warn(
    {
      shareId: row.id,
      incidentId: input.incidentId,
      vehicleId: input.vehicleId,
      recipient: input.recipientReference,
      expiresAt,
      grantedBy: user.id,
    },
    'Police route visibility granted',
  );

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.EXPORT,
    resourceType: 'police_route_share',
    resourceId: row.id,
    metadata: {
      incidentId: input.incidentId,
      vehicleId: input.vehicleId,
      recipientReference: input.recipientReference,
      justification: input.justification,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return toShareDto(row);
}

/**
 * Resolves a share for a recipient.
 *
 * Returns nothing at all when the grant has expired, been revoked, or its
 * incident has closed. Those three conditions are in the query rather than
 * checked here, so there is no path by which a lapsed grant still yields route
 * data because somebody forgot a conditional.
 */
export async function resolvePoliceShare(shareId: string) {
  const share = await repository.findLivePoliceShare(shareId);

  if (!share) {
    throw new NotFoundError(
      'Live route share',
      `${shareId} (expired, revoked, or its incident has been closed)`,
    );
  }

  await repository.recordShareAccess(shareId);

  return {
    shareId: share.id,
    vehicleId: share.vehicleId,
    incidentId: share.incidentId,
    expiresAt: share.expiresAt.toISOString(),
    route: share.routePlan ? toPlanDto(share.routePlan) : null,
  };
}

export async function revokePoliceShare(user: AuthUser, shareId: string) {
  const row = await repository.revokePoliceShare(user.organizationId, shareId, user.id);

  if (!row) {
    throw new ConflictError(
      'That share is already revoked, or does not belong to this organisation.',
    );
  }

  log.info({ shareId, revokedBy: user.id }, 'Police route visibility revoked');

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'police_route_share',
    resourceId: shareId,
    metadata: { revoked: true, accessCount: row.accessCount },
  });

  return toShareDto(row);
}

export async function listSharesForIncident(user: AuthUser, incidentId: string) {
  const rows = await repository.findPoliceSharesForIncident(user.organizationId, incidentId);
  return rows.map(toShareDto);
}
