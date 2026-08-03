import type { Prisma } from '@prisma/client';
import type { IncidentSeverity, PaginationQuery, ThreatHypothesis } from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

/**
 * Decision persistence.
 *
 * Append-only, with one exception. `recordOverride` writes a human's
 * disagreement alongside the decision without altering what the engine
 * concluded — that separation is the point. A record that let the conclusion be
 * edited after the fact would be worthless in an investigation into whether the
 * response was justified, which is precisely when it will be read.
 */

export interface DecisionFilter extends PaginationQuery {
  organizationId: string;
  vehicleId?: string;
  driverId?: string;
  hypothesis?: ThreatHypothesis;
  overriddenOnly?: boolean;
  from?: Date;
  to?: Date;
}

export async function insertDecision(data: {
  organizationId: string;
  vehicleId: string | null;
  driverId: string | null;
  leadingHypothesis: ThreatHypothesis;
  anomalyProbability: number;
  hypothesisConfidence: number;
  posteriors: Prisma.InputJsonValue;
  confidenceOverall: number;
  confidenceDetail: Prisma.InputJsonValue;
  actions: Prisma.InputJsonValue;
  autonomyLevel: string;
  severity: IncidentSeverity;
  constraints: Prisma.InputJsonValue;
  graph: Prisma.InputJsonValue;
  explanation: Prisma.InputJsonValue;
  inputs: Prisma.InputJsonValue;
  decidedAt: Date;
  engineVersion: string;
  calibrationSource: string;
}) {
  return prisma.threatDecision.create({ data });
}

export async function findDecisions(filter: DecisionFilter) {
  const where: Prisma.ThreatDecisionWhereInput = {
    organizationId: filter.organizationId,
    vehicleId: filter.vehicleId,
    driverId: filter.driverId,
    leadingHypothesis: filter.hypothesis,
    overrideHypothesis: filter.overriddenOnly ? { not: null } : undefined,
    decidedAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };

  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.threatDecision.findMany({ where, orderBy: { decidedAt: 'desc' }, skip, take }),
    prisma.threatDecision.count({ where }),
  ]);

  return { rows, total };
}

export async function findDecisionById(organizationId: string, decisionId: string) {
  return prisma.threatDecision.findFirst({ where: { id: decisionId, organizationId } });
}

export async function findLatestForVehicle(organizationId: string, vehicleId: string) {
  return prisma.threatDecision.findFirst({
    where: { organizationId, vehicleId },
    orderBy: { decidedAt: 'desc' },
  });
}

/**
 * Records a human's disagreement with the engine.
 *
 * Guarded on `overrideHypothesis: null`, so an override is written exactly
 * once. A revisable override would let the disagreement itself be walked back,
 * which destroys both its evidentiary value and its use as a calibration
 * signal.
 */
export async function recordOverride(
  organizationId: string,
  decisionId: string,
  data: { hypothesis: ThreatHypothesis; reason: string; userId: string },
) {
  const result = await prisma.threatDecision.updateMany({
    where: { id: decisionId, organizationId, overrideHypothesis: null },
    data: {
      overrideHypothesis: data.hypothesis,
      overrideReason: data.reason,
      overrideByUserId: data.userId,
      overrideAt: new Date(),
    },
  });

  if (result.count === 0) return null;
  return prisma.threatDecision.findUnique({ where: { id: decisionId } });
}

/**
 * Override counts by hypothesis, for calibration review.
 *
 * The one aggregate query in this module, and the reason the override data is
 * first-class rather than buried in the audit log. An engine that operators
 * routinely correct on the same hypothesis is miscalibrated in a way no offline
 * evaluation reveals, and this is the query that shows it.
 */
export async function overrideStatistics(organizationId: string, since: Date) {
  const [byLeading, byOverride] = await prisma.$transaction([
    prisma.threatDecision.groupBy({
      by: ['leadingHypothesis'],
      where: { organizationId, decidedAt: { gte: since } },
      orderBy: { leadingHypothesis: 'asc' },
      _count: true,
    }),
    prisma.threatDecision.groupBy({
      by: ['leadingHypothesis', 'overrideHypothesis'],
      where: { organizationId, decidedAt: { gte: since }, overrideHypothesis: { not: null } },
      orderBy: [{ leadingHypothesis: 'asc' }, { overrideHypothesis: 'asc' }],
      _count: true,
    }),
  ]);

  return {
    byLeading: byLeading.map((entry) => ({
      hypothesis: entry.leadingHypothesis as ThreatHypothesis,
      count: entry._count,
    })),
    byOverride: byOverride.map((entry) => ({
      engineHypothesis: entry.leadingHypothesis as ThreatHypothesis,
      operatorHypothesis: entry.overrideHypothesis as ThreatHypothesis,
      count: entry._count,
    })),
  };
}
