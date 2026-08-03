import type { Prisma } from '@prisma/client';
import {
  AlertType,
  AuditAction,
  IdentityBand,
  IdentityModality,
  IncidentSeverity,
  type AuthUser,
  type IdentityAssessment,
  type ModalityObservation,
  type OccupancyAssessment,
  type Paginated,
} from '@aegisdrive/types';
import {
  ConflictError,
  NotFoundError,
  explainAssessment,
  fuseIdentity,
  normalisePagination,
  paginate,
  effectivePolicy,
} from '@aegisdrive/shared';
import { moduleLogger } from '../../core/logger';
import { recordAudit } from '../audit-logs/audit.service';
import { raiseAlert } from '../alerts/alert.service';
import { createIncident } from '../incidents/incident.service';
import { IncidentType } from '@aegisdrive/types';
import * as repository from './identity.repository';
import { toAssessmentDto } from './identity.mapper';

const log = moduleLogger('identity');

/**
 * Continuous Identity Engine.
 *
 * Consumes modality observations, fuses them into a driver confidence score,
 * and applies the response policy.
 *
 * **Fusion happens here, in TypeScript, not in the model service.** Combining
 * calibrated scores is deterministic arithmetic; keeping it out of Python means
 * the confidence figure can be recomputed and explained without loading a
 * model, and the API, console and mobile app all agree on what it means.
 */

export interface SubmitObservationsInput {
  driverId: string;
  vehicleId: string | null;
  observations: ModalityObservation[];
  occupancy: OccupancyAssessment | null;
}

/**
 * The engine's main entry point.
 *
 * Called by the AI gateway after it has scored a sample, and by the mobile app
 * for device and interaction observations. Every call produces a durable
 * assessment — including the boring ones, because a gap in the record is
 * indistinguishable from the engine having been switched off.
 */
export async function submitObservations(
  user: AuthUser,
  input: SubmitObservationsInput,
): Promise<IdentityAssessment> {
  const fused = fuseIdentity({
    observations: input.observations,
    occupancy: input.occupancy,
  });

  const row = await repository.insertAssessment({
    organizationId: user.organizationId,
    driverId: input.driverId,
    vehicleId: input.vehicleId,
    confidence: fused.confidence,
    band: fused.band,
    fusedLogLikelihoodRatio: fused.fusedLogLikelihoodRatio,
    contributions: fused.contributions as unknown as Prisma.InputJsonValue,
    missingModalities: fused.missingModalities as unknown as Prisma.InputJsonValue,
    spoofDetected: fused.spoofDetected,
    occupantCount: input.occupancy?.occupantCount ?? null,
    unrecognisedCount: input.occupancy?.unrecognisedCount ?? null,
    expectedCount: input.occupancy?.expectedCount ?? null,
    unexpectedOccupancy: input.occupancy?.unexpectedOccupancy ?? false,
    policyVersion: fused.policyVersion,
  });

  // Freshens the enrolments that contributed, so an unused template can be
  // identified and expired rather than lingering indefinitely.
  const usedEnrolments = input.observations
    .map((observation) => observation.enrolmentId)
    .filter((id): id is string => id !== null);
  await repository.touchVerified(usedEnrolments);

  await applyResponse(user, row.id, input, fused);

  return toAssessmentDto(row);
}

/**
 * Applies the identity policy.
 *
 * The policy layer decides *what* may happen; this executes it. Note what is
 * absent: there is no immobilisation branch. `permitAutonomousImmobilisation`
 * is `false` on every band by construction, so there is nothing to act on —
 * see `docs/adr/0007-biometric-identity.md`.
 */
async function applyResponse(
  user: AuthUser,
  assessmentId: string,
  input: SubmitObservationsInput,
  fused: ReturnType<typeof fuseIdentity>,
): Promise<void> {
  // `effectivePolicy` folds occupancy into the band's base policy. Occupancy can
  // only ever escalate — a correct headcount says nothing about who is driving.
  const policy = effectivePolicy(fused.band, input.occupancy);
  const explanation = explainAssessment(fused);

  if (fused.band === IdentityBand.SUSPECT || fused.band === IdentityBand.IMPOSTOR) {
    log.warn(
      {
        assessmentId,
        driverId: input.driverId,
        vehicleId: input.vehicleId,
        band: fused.band,
        confidence: fused.confidence,
        spoofDetected: fused.spoofDetected,
      },
      'Identity assessment below threshold',
    );
  }

  if (policy.raiseAlert && policy.alertSeverity) {
    await raiseAlert(user, {
      type: AlertType.ANOMALY,
      severity: policy.alertSeverity,
      title: `Driver identity ${fused.band.toLowerCase()} — confidence ${fused.confidence}%`,
      // The explanation is carried into the alert rather than left in a log.
      // An operator deciding how to respond must see the evidence, not a score.
      message: [policy.description, '', ...explanation].join('\n'),
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      incidentId: null,
    });
  }

  if (policy.openIncident) {
    await createIncident(user, {
      type: IncidentType.UNAUTHORISED_USE,
      severity: policy.alertSeverity ?? IncidentSeverity.CRITICAL,
      title: `Possible unauthorised driver — confidence ${fused.confidence}%`,
      summary: [policy.description, '', ...explanation].join('\n'),
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      position: null,
      // The fused posterior, expressed as the model confidence the incident
      // record expects.
      aiConfidence: (100 - fused.confidence) / 100,
    });
  }

  if (policy.challengeDriver) {
    // Only one challenge outstanding at a time. Repeatedly prompting a driver
    // whose camera is simply obscured is noise that teaches them to dismiss it.
    const existing = await repository.findPendingChallenge(user.organizationId, input.driverId);

    if (!existing) {
      await repository.insertChallenge({
        organizationId: user.organizationId,
        driverId: input.driverId,
        assessmentId,
        method: 'DEVICE_BIOMETRIC',
        expiresAt: new Date(Date.now() + 5 * 60_000),
      });
    }
  }

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'identity_assessment',
    resourceId: assessmentId,
    metadata: {
      band: fused.band,
      confidence: fused.confidence,
      spoofDetected: fused.spoofDetected,
      policyVersion: fused.policyVersion,
      modalities: fused.contributions.map((entry) => entry.modality),
    },
  });
}

// ============================================================================
// Reads
// ============================================================================

export interface ListAssessmentsInput {
  driverId?: string;
  vehicleId?: string;
  band?: IdentityBand;
  page?: number;
  pageSize?: number;
}

export async function listAssessments(
  user: AuthUser,
  input: ListAssessmentsInput,
): Promise<Paginated<IdentityAssessment>> {
  const pagination = normalisePagination(input);

  const { rows, total } = await repository.findAssessments({
    ...pagination,
    organizationId: user.organizationId,
    driverId: input.driverId,
    vehicleId: input.vehicleId,
    band: input.band,
  });

  return paginate(rows.map(toAssessmentDto), pagination, total);
}

export async function getDriverConfidence(
  user: AuthUser,
  driverId: string,
): Promise<IdentityAssessment | null> {
  const row = await repository.findLatestAssessment(user.organizationId, driverId);
  return row ? toAssessmentDto(row) : null;
}

// ============================================================================
// Enrolment
// ============================================================================

export interface EnrolInput {
  driverId: string | null;
  occupantId: string | null;
  modality: IdentityModality;
  /** Handle returned by the AI gateway after it built and wrapped the template. */
  templateRef: string;
  modelId: string;
  sampleCount: number;
  enrolmentQuality: number;
  consentBasis: 'EXPLICIT_CONSENT' | 'CONTRACT' | 'VITAL_INTERESTS';
  /** Days until the template must be refreshed. */
  validityDays: number;
}

/** Below this, a template is too weak to be usable and enrolment is refused. */
const MINIMUM_ENROLMENT_QUALITY = 0.6;
/** Below this many samples, the template will not generalise. */
const MINIMUM_SAMPLE_COUNT = 3;

export async function enrol(user: AuthUser, input: EnrolInput) {
  if (input.driverId === null && input.occupantId === null) {
    throw new ConflictError('An enrolment must belong to either a driver or an occupant.');
  }

  if (input.driverId !== null && input.occupantId !== null) {
    throw new ConflictError('An enrolment cannot belong to both a driver and an occupant.');
  }

  // A passenger has no employment relationship to imply a contractual basis.
  if (input.occupantId !== null && input.consentBasis !== 'EXPLICIT_CONSENT') {
    throw new ConflictError(
      'Occupant enrolment requires explicit consent. A contractual basis does not apply to a passenger.',
    );
  }

  if (input.enrolmentQuality < MINIMUM_ENROLMENT_QUALITY) {
    throw new ConflictError(
      `Enrolment quality ${input.enrolmentQuality.toFixed(2)} is below the ${MINIMUM_ENROLMENT_QUALITY} minimum. A weak template produces unreliable verification, which in this system means false accusations.`,
    );
  }

  if (input.sampleCount < MINIMUM_SAMPLE_COUNT) {
    throw new ConflictError(
      `At least ${MINIMUM_SAMPLE_COUNT} samples are required; ${input.sampleCount} were captured.`,
    );
  }

  // Re-enrolment supersedes rather than overwrites, so past assessments stay
  // attributable to the template that actually produced them.
  const revoked = await repository.revokeActiveEnrolments(
    user.organizationId,
    { driverId: input.driverId ?? undefined, occupantId: input.occupantId ?? undefined },
    input.modality,
  );

  const enrolment = await repository.insertEnrolment(user.organizationId, {
    driverId: input.driverId,
    occupantId: input.occupantId,
    modality: input.modality,
    templateRef: input.templateRef,
    modelId: input.modelId,
    sampleCount: input.sampleCount,
    enrolmentQuality: input.enrolmentQuality,
    consentBasis: input.consentBasis,
    expiresAt: new Date(Date.now() + input.validityDays * 86_400_000),
  });

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'identity_enrolment',
    resourceId: enrolment.id,
    metadata: {
      modality: input.modality,
      consentBasis: input.consentBasis,
      supersededCount: revoked,
      modelId: input.modelId,
    },
  });

  return enrolment;
}

export async function listEnrolments(
  user: AuthUser,
  filter: { driverId?: string; occupantId?: string },
) {
  return repository.findEnrolments({
    organizationId: user.organizationId,
    driverId: filter.driverId,
    occupantId: filter.occupantId,
  });
}

/**
 * Withdraws consent and destroys the template.
 *
 * Always permitted, immediately, with no approval step. Consent that cannot be
 * withdrawn easily is not consent, and both POPIA and GDPR treat it that way.
 */
export async function withdrawConsent(user: AuthUser, enrolmentId: string) {
  const enrolment = await repository.withdrawConsent(user.organizationId, enrolmentId);
  if (!enrolment) throw new NotFoundError('Enrolment', enrolmentId);

  log.info(
    { enrolmentId, actorUserId: user.id },
    'Biometric consent withdrawn; template destroyed',
  );

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.DELETE,
    resourceType: 'identity_enrolment',
    resourceId: enrolmentId,
    metadata: { consentWithdrawn: true, modality: enrolment.modality },
  });

  return enrolment;
}

// ============================================================================
// Device fingerprinting
// ============================================================================

export interface DeviceAttestationInput {
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
}

/** A device must be seen for this long without anomalies before it is trusted. */
const TRUST_PROBATION_MS = 7 * 86_400_000;

/**
 * Records a device check-in and returns it as an identity observation.
 *
 * The scoring is intentionally simple and legible rather than learned: this is
 * an attestation result, not a similarity measurement, and a model here would
 * add opacity without adding accuracy.
 */
export async function recordDeviceAttestation(
  user: AuthUser,
  input: DeviceAttestationInput,
): Promise<{
  device: Awaited<ReturnType<typeof repository.upsertDeviceFingerprint>>;
  observation: ModalityObservation;
}> {
  const existing = await repository.findDeviceFingerprint(
    user.organizationId,
    input.installationId,
  );

  // A changed hardware fingerprint under the same installation id means the app
  // was restored onto different hardware — the clearest device-level attack
  // signal there is.
  const hardwareChanged = existing !== null && existing.fingerprintHash !== input.fingerprintHash;

  const device = await repository.upsertDeviceFingerprint(user.organizationId, input);

  const trustEligible =
    !input.compromised &&
    !input.emulated &&
    !hardwareChanged &&
    Date.now() - device.firstSeenAt.getTime() > TRUST_PROBATION_MS;

  if (trustEligible && !device.trusted) {
    await repository.markDeviceTrusted(user.organizationId, input.installationId);
  }

  const score = scoreDevice({
    known: existing !== null,
    hardwareChanged,
    attestation: input.attestation,
    compromised: input.compromised,
    emulated: input.emulated,
    trusted: device.trusted || trustEligible,
  });

  if (hardwareChanged || input.compromised || input.emulated) {
    log.warn(
      {
        installationId: input.installationId,
        driverId: input.driverId,
        hardwareChanged,
        compromised: input.compromised,
        emulated: input.emulated,
      },
      'Device integrity signal',
    );
  }

  return {
    device,
    observation: {
      modality: IdentityModality.DEVICE,
      score,
      // Attestation is either available or not; there is no partial sample
      // quality the way there is for a face in poor light.
      quality: 1,
      capturedAt: new Date().toISOString(),
      modelId: 'device-attest-v1',
      enrolmentId: null,
      // An emulator in this product is not a spoofed sample — it is a spoofed
      // *device*, which is the same class of attack and treated identically.
      spoofDetected: input.emulated,
      spoofConfidence: input.emulated ? 0.95 : null,
    },
  };
}

function scoreDevice(signals: {
  known: boolean;
  hardwareChanged: boolean;
  attestation: string;
  compromised: boolean;
  emulated: boolean;
  trusted: boolean;
}): number {
  if (signals.emulated) return 0;
  if (signals.hardwareChanged) return 0.05;
  if (!signals.known) return 0.35; // A new device is not evidence either way.

  let score = signals.trusted ? 0.92 : 0.75;

  if (signals.attestation === 'VERIFIED') score += 0.06;
  if (signals.attestation === 'FAILED') score -= 0.4;
  if (signals.attestation === 'UNSUPPORTED') score -= 0.05;

  // A rooted device can forge every other signal it sends, so its own
  // attestation is worth little.
  if (signals.compromised) score -= 0.45;

  return Math.min(1, Math.max(0, score));
}

export async function listDevices(user: AuthUser, driverId: string) {
  return repository.findDevicesForDriver(user.organizationId, driverId);
}

// ============================================================================
// Challenges
// ============================================================================

export async function respondToChallenge(
  user: AuthUser,
  challengeId: string,
  outcome: 'PASSED' | 'FAILED' | 'DECLINED',
) {
  const challenge = await repository.resolveChallenge(user.organizationId, challengeId, outcome);
  if (!challenge) throw new NotFoundError('Challenge', challengeId);

  // A failed challenge is logged but does NOT itself downgrade identity. A
  // driver being hijacked may be physically unable to answer, and treating
  // silence as guilt is how this system would hurt the people it protects.
  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'identity_challenge',
    resourceId: challengeId,
    metadata: { outcome, method: challenge.method },
  });

  return challenge;
}

// ============================================================================
// Occupants
// ============================================================================

export async function listOccupants(user: AuthUser) {
  return repository.findOccupants(user.organizationId);
}

export async function createOccupant(
  user: AuthUser,
  input: { displayName: string; relationship: string },
) {
  const occupant = await repository.insertOccupant(user.organizationId, input);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'enrolled_occupant',
    resourceId: occupant.id,
    metadata: { relationship: input.relationship },
  });

  return occupant;
}
