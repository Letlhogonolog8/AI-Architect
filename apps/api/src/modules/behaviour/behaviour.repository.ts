import type { Prisma } from '@prisma/client';
import type { IdentityBand, PaginationQuery, ThreatLevel } from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

/**
 * Behaviour persistence.
 *
 * Three rules beyond the usual tenant scoping:
 *
 *   1. **Assessments are append-only.** There is no update method and there must
 *      not be one. An assessment records what the system concluded at a moment
 *      in time and it may be produced in an investigation; a mutable one is
 *      worth nothing as evidence.
 *
 *   2. **There is no bulk export method.** Not an oversight — the absence is the
 *      control. These rows are processed on a safety basis for the protection
 *      of the data subject, and bulk extraction across drivers has no safety
 *      purpose, only a performance-management one. Reads here are scoped to a
 *      driver, a vehicle or a page of recent activity.
 *
 *   3. **Baselines are grown, never set.** `foldWindow` is the only write path,
 *      so a baseline always reflects driving that actually happened and cannot
 *      be seeded to make a driver look normal — or abnormal.
 */

// ============================================================================
// Assessments
// ============================================================================

export interface AssessmentFilter extends PaginationQuery {
  organizationId: string;
  driverId?: string;
  vehicleId?: string;
  level?: ThreatLevel;
  duressIndicated?: boolean;
  from?: Date;
  to?: Date;
}

export async function insertAssessment(data: {
  organizationId: string;
  driverId: string | null;
  vehicleId: string | null;
  threatScore: number;
  threatLevel: ThreatLevel;
  positivePredictiveValue: number;
  baseRatePerTripHour: number;
  logLikelihoodRatio: number;
  contributions: Prisma.InputJsonValue;
  corroboratingClasses: Prisma.InputJsonValue;
  corroborationCapped: boolean;
  capReason: string | null;
  arousalIndex: number | null;
  arousalConfidence: number | null;
  abnormalityScore: number | null;
  occupantCount: number | null;
  expectedCount: number | null;
  speakerCount: number | null;
  identityBand: IdentityBand | null;
  signals: Prisma.InputJsonValue;
  duressIndicated: boolean;
  duressConfidence: number | null;
  duressDeliberate: boolean;
  duressBasis: Prisma.InputJsonValue;
  policyVersion: string;
  calibrationSource: string;
}) {
  return prisma.behaviourAssessment.create({ data });
}

export async function findAssessments(filter: AssessmentFilter) {
  const where: Prisma.BehaviourAssessmentWhereInput = {
    organizationId: filter.organizationId,
    driverId: filter.driverId,
    vehicleId: filter.vehicleId,
    threatLevel: filter.level,
    duressIndicated: filter.duressIndicated,
    assessedAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };

  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.behaviourAssessment.findMany({
      where,
      orderBy: { assessedAt: 'desc' },
      skip,
      take,
    }),
    prisma.behaviourAssessment.count({ where }),
  ]);

  return { rows, total };
}

export async function findAssessmentById(organizationId: string, assessmentId: string) {
  return prisma.behaviourAssessment.findFirst({
    where: { id: assessmentId, organizationId },
  });
}

/** The current behaviour picture for a vehicle — its newest assessment. */
export async function findLatestForVehicle(organizationId: string, vehicleId: string) {
  return prisma.behaviourAssessment.findFirst({
    where: { organizationId, vehicleId },
    orderBy: { assessedAt: 'desc' },
  });
}

export async function findLatestForDriver(organizationId: string, driverId: string) {
  return prisma.behaviourAssessment.findFirst({
    where: { organizationId, driverId },
    orderBy: { assessedAt: 'desc' },
  });
}

// ============================================================================
// Baselines
// ============================================================================

export async function findBaseline(organizationId: string, driverId: string, modelId: string) {
  return prisma.cabinBaseline.findFirst({
    where: { organizationId, driverId, modelId },
  });
}

/**
 * Folds one observed window into a driver's baseline.
 *
 * The only write path for baseline statistics. The caller has already run
 * Welford's update, so the raw window can be discarded the moment this returns —
 * which is the whole reason the update is online rather than batch. Retaining
 * every window so the baseline could be recomputed would build exactly the
 * accumulating behavioural record the design exists to avoid.
 */
export async function foldWindow(
  organizationId: string,
  data: {
    driverId: string;
    modelId: string;
    features: Prisma.InputJsonValue;
    windowCount: number;
    observedMinutes: number;
    status: 'PENDING' | 'ACTIVE';
    expiresAt: Date;
  },
) {
  return prisma.cabinBaseline.upsert({
    where: { driverId_modelId: { driverId: data.driverId, modelId: data.modelId } },
    create: {
      organizationId,
      driverId: data.driverId,
      modelId: data.modelId,
      features: data.features,
      windowCount: data.windowCount,
      observedMinutes: data.observedMinutes,
      status: data.status,
      expiresAt: data.expiresAt,
      lastUpdatedAt: new Date(),
    },
    update: {
      features: data.features,
      windowCount: data.windowCount,
      observedMinutes: data.observedMinutes,
      status: data.status,
      expiresAt: data.expiresAt,
      lastUpdatedAt: new Date(),
    },
  });
}

/**
 * Discards a driver's baseline entirely.
 *
 * Needed for two very different reasons, and both are legitimate. A driver may
 * ask for it — their behavioural statistics are their personal data and they can
 * require erasure. And an analyst may need it after a change that invalidates
 * the baseline, such as the driver moving to a different vehicle class, because
 * a stale baseline reads ordinary change as anomaly.
 */
export async function deleteBaseline(organizationId: string, driverId: string): Promise<number> {
  const result = await prisma.cabinBaseline.deleteMany({
    where: { organizationId, driverId },
  });

  return result.count;
}

export async function findBaselinesForOrganization(organizationId: string) {
  return prisma.cabinBaseline.findMany({
    where: { organizationId },
    orderBy: { lastUpdatedAt: 'desc' },
    select: {
      id: true,
      driverId: true,
      modelId: true,
      windowCount: true,
      observedMinutes: true,
      status: true,
      expiresAt: true,
      lastUpdatedAt: true,
      createdAt: true,
    },
  });
}
