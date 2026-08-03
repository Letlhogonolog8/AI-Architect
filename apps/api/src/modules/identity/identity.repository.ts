import type { Prisma } from '@prisma/client';
import type {
  ConsentBasis,
  EnrolmentStatus,
  IdentityBand,
  IdentityModality,
  PaginationQuery,
} from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

/**
 * Identity persistence.
 *
 * Two rules beyond the usual tenant scoping:
 *
 *   1. **No method returns `templateRef` into a DTO path.** The handle is
 *      selected only where the verification service needs it, never in a list
 *      or detail read that reaches a controller.
 *   2. **Assessments are append-only.** There is no update method and there
 *      must not be one — an identity assessment is a record of what the system
 *      concluded at a moment in time, and it may be produced in an
 *      investigation.
 */

// ============================================================================
// Enrolments
// ============================================================================

/** Fields safe to return outward. Deliberately excludes `templateRef`. */
const ENROLMENT_PUBLIC_FIELDS = {
  id: true,
  organizationId: true,
  driverId: true,
  occupantId: true,
  modality: true,
  status: true,
  modelId: true,
  templateVersion: true,
  sampleCount: true,
  enrolmentQuality: true,
  consentBasis: true,
  consentRecordedAt: true,
  consentWithdrawnAt: true,
  expiresAt: true,
  lastVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PublicEnrolment = Prisma.IdentityEnrolmentGetPayload<{
  select: typeof ENROLMENT_PUBLIC_FIELDS;
}>;

export async function findEnrolments(filter: {
  organizationId: string;
  driverId?: string;
  occupantId?: string;
  modality?: IdentityModality;
  status?: EnrolmentStatus;
}): Promise<PublicEnrolment[]> {
  return prisma.identityEnrolment.findMany({
    where: {
      organizationId: filter.organizationId,
      driverId: filter.driverId,
      occupantId: filter.occupantId,
      modality: filter.modality,
      status: filter.status,
    },
    orderBy: { createdAt: 'desc' },
    select: ENROLMENT_PUBLIC_FIELDS,
  });
}

/**
 * Active enrolments with their template handles.
 *
 * The only function that exposes `templateRef`, and it is called exclusively by
 * the verification service when dispatching a comparison to the AI gateway.
 * Nothing on a controller path may call this.
 */
export async function findActiveTemplatesForDriver(
  organizationId: string,
  driverId: string,
): Promise<
  Array<{ id: string; modality: IdentityModality; templateRef: string; modelId: string }>
> {
  const rows = await prisma.identityEnrolment.findMany({
    where: {
      organizationId,
      driverId,
      status: 'ACTIVE',
      consentWithdrawnAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true, modality: true, templateRef: true, modelId: true },
  });

  return rows.map((row) => ({ ...row, modality: row.modality as IdentityModality }));
}

export async function insertEnrolment(
  organizationId: string,
  data: {
    driverId: string | null;
    occupantId: string | null;
    modality: IdentityModality;
    templateRef: string;
    modelId: string;
    sampleCount: number;
    enrolmentQuality: number;
    consentBasis: ConsentBasis;
    expiresAt: Date | null;
  },
): Promise<PublicEnrolment> {
  return prisma.identityEnrolment.create({
    data: {
      organizationId,
      driverId: data.driverId,
      occupantId: data.occupantId,
      modality: data.modality,
      status: 'ACTIVE',
      templateRef: data.templateRef,
      modelId: data.modelId,
      sampleCount: data.sampleCount,
      enrolmentQuality: data.enrolmentQuality,
      consentBasis: data.consentBasis,
      consentRecordedAt: new Date(),
      expiresAt: data.expiresAt,
    },
    select: ENROLMENT_PUBLIC_FIELDS,
  });
}

/**
 * Supersedes any existing active enrolment for the same subject and modality.
 *
 * Re-enrolment rather than update: the old template is revoked and a new one
 * created, so the history of which template produced which assessment stays
 * intact. Overwriting would make past assessments unreproducible.
 */
export async function revokeActiveEnrolments(
  organizationId: string,
  subject: { driverId?: string; occupantId?: string },
  modality: IdentityModality,
): Promise<number> {
  const result = await prisma.identityEnrolment.updateMany({
    where: {
      organizationId,
      driverId: subject.driverId,
      occupantId: subject.occupantId,
      modality,
      status: 'ACTIVE',
    },
    data: { status: 'REVOKED' },
  });

  return result.count;
}

/**
 * Withdraws consent.
 *
 * Sets the status and clears the template handle in one statement. The row
 * survives so the *fact* of enrolment and its withdrawal remains auditable —
 * deleting it would destroy the evidence that consent was properly obtained and
 * properly honoured.
 */
export async function withdrawConsent(
  organizationId: string,
  enrolmentId: string,
): Promise<PublicEnrolment | null> {
  const result = await prisma.identityEnrolment.updateMany({
    where: { id: enrolmentId, organizationId },
    data: {
      status: 'WITHDRAWN',
      consentWithdrawnAt: new Date(),
      // The handle is cleared here; the evidence service destroys the wrapped
      // template itself on its next sweep.
      templateRef: '',
    },
  });

  if (result.count === 0) return null;

  return prisma.identityEnrolment.findUnique({
    where: { id: enrolmentId },
    select: ENROLMENT_PUBLIC_FIELDS,
  });
}

export async function touchVerified(enrolmentIds: string[]): Promise<void> {
  if (enrolmentIds.length === 0) return;

  await prisma.identityEnrolment.updateMany({
    where: { id: { in: enrolmentIds } },
    data: { lastVerifiedAt: new Date() },
  });
}

// ============================================================================
// Assessments
// ============================================================================

export interface AssessmentFilter extends PaginationQuery {
  organizationId: string;
  driverId?: string;
  vehicleId?: string;
  band?: IdentityBand;
  from?: Date;
  to?: Date;
}

export async function insertAssessment(data: {
  organizationId: string;
  driverId: string | null;
  vehicleId: string | null;
  confidence: number;
  band: IdentityBand;
  fusedLogLikelihoodRatio: number;
  contributions: Prisma.InputJsonValue;
  missingModalities: Prisma.InputJsonValue;
  spoofDetected: boolean;
  occupantCount: number | null;
  unrecognisedCount: number | null;
  expectedCount: number | null;
  unexpectedOccupancy: boolean;
  policyVersion: string;
}) {
  return prisma.identityAssessment.create({ data });
}

export async function findAssessments(filter: AssessmentFilter) {
  const where: Prisma.IdentityAssessmentWhereInput = {
    organizationId: filter.organizationId,
    driverId: filter.driverId,
    vehicleId: filter.vehicleId,
    band: filter.band,
    assessedAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };

  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.identityAssessment.findMany({
      where,
      orderBy: { assessedAt: 'desc' },
      skip,
      take,
    }),
    prisma.identityAssessment.count({ where }),
  ]);

  return { rows, total };
}

/** The current identity picture for a driver — their newest assessment. */
export async function findLatestAssessment(organizationId: string, driverId: string) {
  return prisma.identityAssessment.findFirst({
    where: { organizationId, driverId },
    orderBy: { assessedAt: 'desc' },
  });
}

// ============================================================================
// Device fingerprints
// ============================================================================

export async function upsertDeviceFingerprint(
  organizationId: string,
  data: {
    installationId: string;
    fingerprintHash: string;
    driverId: string | null;
    platform: string;
    osVersion: string;
    deviceModel: string;
    manufacturer: string;
    attestation: 'VERIFIED' | 'UNVERIFIED' | 'FAILED' | 'UNSUPPORTED';
    compromised: boolean;
    emulated: boolean;
  },
) {
  return prisma.deviceFingerprint.upsert({
    where: {
      organizationId_installationId: {
        organizationId,
        installationId: data.installationId,
      },
    },
    create: {
      organizationId,
      ...data,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
    update: {
      // `firstSeenAt` is deliberately not updated — the age of the device
      // relationship is what the trust probation is measured against.
      fingerprintHash: data.fingerprintHash,
      osVersion: data.osVersion,
      attestation: data.attestation,
      compromised: data.compromised,
      emulated: data.emulated,
      lastSeenAt: new Date(),
    },
  });
}

export async function findDeviceFingerprint(organizationId: string, installationId: string) {
  return prisma.deviceFingerprint.findUnique({
    where: { organizationId_installationId: { organizationId, installationId } },
  });
}

export async function findDevicesForDriver(organizationId: string, driverId: string) {
  return prisma.deviceFingerprint.findMany({
    where: { organizationId, driverId },
    orderBy: { lastSeenAt: 'desc' },
  });
}

export async function markDeviceTrusted(
  organizationId: string,
  installationId: string,
): Promise<void> {
  await prisma.deviceFingerprint.updateMany({
    where: { organizationId, installationId },
    data: { trusted: true },
  });
}

// ============================================================================
// Behaviour baselines
// ============================================================================

export async function findBehaviourBaseline(organizationId: string, driverId: string) {
  return prisma.behaviourBaseline.findFirst({
    where: { organizationId, driverId, status: 'ACTIVE' },
  });
}

export async function upsertBehaviourBaseline(
  organizationId: string,
  data: {
    driverId: string;
    modelId: string;
    tripCount: number;
    observedMinutes: number;
    features: Prisma.InputJsonValue;
    distinctiveness: number;
    status: EnrolmentStatus;
  },
) {
  return prisma.behaviourBaseline.upsert({
    where: { driverId_modelId: { driverId: data.driverId, modelId: data.modelId } },
    create: { organizationId, ...data, lastUpdatedAt: new Date() },
    update: {
      tripCount: data.tripCount,
      observedMinutes: data.observedMinutes,
      features: data.features,
      distinctiveness: data.distinctiveness,
      status: data.status,
      lastUpdatedAt: new Date(),
    },
  });
}

// ============================================================================
// Occupants and challenges
// ============================================================================

export async function findOccupants(organizationId: string) {
  return prisma.enrolledOccupant.findMany({
    where: { organizationId },
    orderBy: { displayName: 'asc' },
  });
}

export async function insertOccupant(
  organizationId: string,
  data: { displayName: string; relationship: string },
) {
  return prisma.enrolledOccupant.create({
    data: {
      organizationId,
      displayName: data.displayName,
      relationship: data.relationship,
      consentBasis: 'EXPLICIT_CONSENT',
      consentRecordedAt: new Date(),
      status: 'PENDING',
    },
  });
}

export async function insertChallenge(data: {
  organizationId: string;
  driverId: string;
  assessmentId: string;
  method: string;
  expiresAt: Date;
}) {
  return prisma.identityChallenge.create({ data });
}

export async function resolveChallenge(
  organizationId: string,
  challengeId: string,
  status: 'PASSED' | 'FAILED' | 'DECLINED',
) {
  const result = await prisma.identityChallenge.updateMany({
    where: { id: challengeId, organizationId, status: 'PENDING' },
    data: { status, respondedAt: new Date() },
  });

  if (result.count === 0) return null;
  return prisma.identityChallenge.findUnique({ where: { id: challengeId } });
}

export async function findPendingChallenge(organizationId: string, driverId: string) {
  return prisma.identityChallenge.findFirst({
    where: {
      organizationId,
      driverId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
    orderBy: { issuedAt: 'desc' },
  });
}
