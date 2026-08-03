import type { Prisma } from '@prisma/client';
import {
  AlertType,
  AuditAction,
  IncidentSeverity,
  IncidentType,
  ThreatLevel,
  type ArousalIndicator,
  type AuthUser,
  type BehaviourAssessment,
  type BehaviourObservation,
  type IdentityBand,
  type Paginated,
} from '@aegisdrive/types';
import {
  ABNORMALITY_MODEL_VERSION,
  BASELINE_VALIDITY_DAYS,
  MINIMUM_BASELINE_WINDOWS,
  NotFoundError,
  SIGNAL_CALIBRATION,
  SIGNAL_CALIBRATION_SOURCE,
  assessAbnormality,
  assessArousal,
  assessDuress,
  effectiveBehaviourPolicy,
  explainArousal,
  normalisePagination,
  paginate,
  scoreThreat,
  updateCabinBaseline,
  type BaselineStatistics,
  type ContextualEvidence,
} from '@aegisdrive/shared';
import { moduleLogger } from '../../core/logger';
import { recordAudit } from '../audit-logs/audit.service';
import { raiseAlert } from '../alerts/alert.service';
import { createIncident } from '../incidents/incident.service';
import { emitBehaviourAssessed } from '../../realtime/emitter';
import * as repository from './behaviour.repository';
import { toAssessmentDto } from './behaviour.mapper';

const log = moduleLogger('behaviour');

/**
 * Behaviour Intelligence Engine.
 *
 * Consumes cabin measurements, scores the threat, and applies the response
 * policy.
 *
 * **Scoring happens here, in TypeScript, not in the model service.** Combining
 * calibrated likelihood ratios is deterministic arithmetic; keeping it out of
 * Python means the score can be recomputed and explained without loading a
 * model, and the API, console and mobile app all agree on what it means. Same
 * reasoning as the Continuous Identity Engine — see ADR-0007 decision 2.
 */

export interface SubmitBehaviourInput {
  driverId: string | null;
  vehicleId: string | null;
  observations: BehaviourObservation[];
  context: ContextualEvidence[];
  identityBand: IdentityBand | null;
  identityAssessedAt: string | null;
  occupantCount: number | null;
  expectedCount: number | null;
  speakerCount: number | null;
  arousalIndicators: ArousalIndicator[];
  features: Record<string, number>;
  observedSeconds: number;
}

/**
 * The engine's main entry point.
 *
 * Called by the AI gateway after it has analysed a cabin window, and by the
 * mobile app for control-input signals. Every call produces a durable
 * assessment — including the quiet ones, because a gap in the record is
 * indistinguishable from the engine having been switched off, and in an
 * investigation that difference matters.
 */
export async function submitBehaviour(
  user: AuthUser,
  input: SubmitBehaviourInput,
): Promise<BehaviourAssessment> {
  const baseline = input.driverId ? await loadBaseline(user.organizationId, input.driverId) : null;

  const abnormality = assessAbnormality({
    features: input.features,
    baseline: baseline?.features ?? null,
    baselineWindowCount: baseline?.windowCount ?? 0,
  });

  const arousal = assessArousal({
    indicators: input.arousalIndicators,
    baselineMissing: baseline === null,
  });

  const threat = scoreThreat({
    observations: input.observations,
    identityBand: input.identityBand,
    identityAssessedAt: input.identityAssessedAt,
    context: input.context,
  });

  const duress = assessDuress(input.observations, input.identityBand, threat);

  const row = await repository.insertAssessment({
    organizationId: user.organizationId,
    driverId: input.driverId,
    vehicleId: input.vehicleId,
    threatScore: threat.score,
    threatLevel: threat.level,
    positivePredictiveValue: threat.positivePredictiveValue,
    baseRatePerTripHour: threat.baseRatePerTripHour,
    logLikelihoodRatio: threat.logLikelihoodRatio,
    contributions: threat.contributions as unknown as Prisma.InputJsonValue,
    corroboratingClasses: threat.corroboratingClasses as unknown as Prisma.InputJsonValue,
    corroborationCapped: threat.corroborationCapped,
    capReason: threat.capReason,
    arousalIndex: arousal.confidence > 0 ? arousal.arousalIndex : null,
    arousalConfidence: arousal.confidence > 0 ? arousal.confidence : null,
    abnormalityScore: abnormality.baselineInsufficient ? null : abnormality.abnormalityScore,
    occupantCount: input.occupantCount,
    expectedCount: input.expectedCount,
    speakerCount: input.speakerCount,
    identityBand: input.identityBand,
    signals: input.observations as unknown as Prisma.InputJsonValue,
    duressIndicated: duress.indicated,
    duressConfidence: duress.indicated ? duress.confidence : null,
    duressDeliberate: duress.deliberateSignal,
    duressBasis: duress.basis as unknown as Prisma.InputJsonValue,
    policyVersion: threat.policyVersion,
    calibrationSource: SIGNAL_CALIBRATION_SOURCE,
  });

  await applyResponse(user, row.id, input, threat, arousal, duress);

  // The baseline only learns from windows the engine considered unremarkable.
  // Folding an incident into a driver's "normal" would teach the system that
  // hijackings are ordinary for that person, and it is also the obvious way to
  // poison a baseline deliberately — sit in a vehicle behaving strangely until
  // strange becomes the mean.
  if (
    input.driverId &&
    threat.level === ThreatLevel.MINIMAL &&
    Object.keys(input.features).length > 0
  ) {
    await foldBaselineWindow(
      user.organizationId,
      input.driverId,
      input.features,
      input.observedSeconds,
    );
  }

  const dto = toAssessmentDto(row);
  dto.threat.explanation = threat.explanation;

  // Broadcast to the control room only. Never to the vehicle room — see the
  // comment on `emitBehaviourAssessed`.
  emitBehaviourAssessed(dto);

  return dto;
}

/**
 * Applies the behaviour policy.
 *
 * The policy layer decides *what* may happen; this executes it. Note what is
 * absent, in both cases deliberately:
 *
 *   - **No immobilisation branch.** `permitAutonomousImmobilisation` is `false`
 *     on every level by construction, so there is nothing to act on.
 *   - **No driver notification branch.** `notifyDriver` is `false` on every
 *     level. If duress is plausible, an in-vehicle reaction warns an attacker in
 *     front of the victim; if it is not, the only thing left to say is a
 *     performance remark this engine has no lawful basis to make.
 */
async function applyResponse(
  user: AuthUser,
  assessmentId: string,
  input: SubmitBehaviourInput,
  threat: ReturnType<typeof scoreThreat>,
  arousal: ReturnType<typeof assessArousal>,
  duress: ReturnType<typeof assessDuress>,
): Promise<void> {
  const policy = effectiveBehaviourPolicy(threat, duress);

  if (threat.level === ThreatLevel.HIGH || threat.level === ThreatLevel.SEVERE) {
    log.warn(
      {
        assessmentId,
        driverId: input.driverId,
        vehicleId: input.vehicleId,
        threatScore: threat.score,
        positivePredictiveValue: threat.positivePredictiveValue,
        duressIndicated: duress.indicated,
        corroboratingClasses: threat.corroboratingClasses,
      },
      'Behaviour assessment above alerting threshold',
    );
  }

  const narrative = buildNarrative(policy.description, threat, arousal, duress);

  if (policy.raiseAlert && policy.alertSeverity) {
    await raiseAlert(user, {
      type: AlertType.ANOMALY,
      severity: policy.alertSeverity,
      // The PPV is in the title, not buried in the body. An operator scanning a
      // list of alerts must see the confidence at the same moment they see the
      // score, or the score is all they will act on.
      title: `Cabin behaviour ${threat.level.toLowerCase()} — score ${threat.score}, ${(threat.positivePredictiveValue * 100).toFixed(1)}% likely genuine`,
      message: narrative,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      incidentId: null,
    });
  }

  if (policy.openIncident) {
    await createIncident(user, {
      type: duress.indicated ? IncidentType.COERCION : IncidentType.ATTEMPTED_HIJACKING,
      severity: policy.alertSeverity ?? IncidentSeverity.CRITICAL,
      title: duress.indicated
        ? `Possible driver duress — score ${threat.score}`
        : `Cabin behaviour severe — score ${threat.score}`,
      summary: narrative,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      position: null,
      // The calibrated posterior, not the display score. An incident record
      // carrying 0.83 when the evidence actually supports 0.05 would misinform
      // every downstream decision made from it, including in court.
      aiConfidence: threat.positivePredictiveValue,
    });
  }

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'behaviour_assessment',
    resourceId: assessmentId,
    metadata: {
      threatScore: threat.score,
      threatLevel: threat.level,
      positivePredictiveValue: threat.positivePredictiveValue,
      corroborationCapped: threat.corroborationCapped,
      duressIndicated: duress.indicated,
      policyVersion: threat.policyVersion,
      calibrationSource: SIGNAL_CALIBRATION_SOURCE,
      signals: input.observations.map((observation) => observation.signal),
    },
  });
}

/**
 * Assembles the operator-facing narrative.
 *
 * Every part is generated from the arithmetic rather than written by hand, so
 * it cannot drift from the numbers it describes. The duress section is included
 * because an operator must know *before* they act that contacting the vehicle
 * could endanger the driver.
 */
function buildNarrative(
  policyDescription: string,
  threat: ReturnType<typeof scoreThreat>,
  arousal: ReturnType<typeof assessArousal>,
  duress: ReturnType<typeof assessDuress>,
): string {
  const sections: string[] = [policyDescription, ''];

  sections.push(...threat.explanation);

  if (arousal.confidence > 0) {
    sections.push('', ...explainArousal(arousal));
  }

  if (duress.indicated) {
    sections.push(
      '',
      'DURESS INDICATED — DO NOT CONTACT THE VEHICLE.',
      duress.deliberateSignal
        ? 'The driver deliberately signalled duress.'
        : `Evidence pattern consistent with coercion (confidence ${(duress.confidence * 100).toFixed(0)}%). This is not proof.`,
      'Any in-vehicle prompt, call or visible status change tells whoever is beside the driver that the system has noticed. Make contact by a channel the vehicle cannot observe.',
      ...duress.basis.map((line) => `  • ${line}`),
    );
  }

  return sections.join('\n');
}

// ============================================================================
// Baselines
// ============================================================================

interface LoadedBaseline {
  features: Record<string, BaselineStatistics>;
  windowCount: number;
  observedMinutes: number;
}

async function loadBaseline(
  organizationId: string,
  driverId: string,
): Promise<LoadedBaseline | null> {
  const row = await repository.findBaseline(organizationId, driverId, ABNORMALITY_MODEL_VERSION);
  if (!row) return null;

  // An expired baseline is treated as absent rather than used with a caveat. A
  // person's ordinary changes — new route, new vehicle, a healed injury — and a
  // stale baseline does not fail safe: it reads ordinary change as anomaly,
  // which here means suspecting someone of being hijacked because they changed
  // cars.
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    log.info({ driverId, expiredAt: row.expiresAt }, 'Cabin baseline expired; treated as absent');
    return null;
  }

  return {
    features: (row.features as Record<string, BaselineStatistics> | null) ?? {},
    windowCount: row.windowCount,
    observedMinutes: row.observedMinutes,
  };
}

async function foldBaselineWindow(
  organizationId: string,
  driverId: string,
  features: Record<string, number>,
  observedSeconds: number,
): Promise<void> {
  const existing = await repository.findBaseline(
    organizationId,
    driverId,
    ABNORMALITY_MODEL_VERSION,
  );

  const currentFeatures = (existing?.features as Record<string, BaselineStatistics> | null) ?? {};
  const windowCount = existing?.windowCount ?? 0;

  const updated = updateCabinBaseline(currentFeatures, windowCount, features);
  const nextCount = windowCount + 1;

  await repository.foldWindow(organizationId, {
    driverId,
    modelId: ABNORMALITY_MODEL_VERSION,
    features: updated as unknown as Prisma.InputJsonValue,
    windowCount: nextCount,
    observedMinutes: (existing?.observedMinutes ?? 0) + Math.round(observedSeconds / 60),
    status: nextCount >= MINIMUM_BASELINE_WINDOWS ? 'ACTIVE' : 'PENDING',
    expiresAt: new Date(Date.now() + BASELINE_VALIDITY_DAYS * 86_400_000),
  });
}

export interface BaselineStatus {
  driverId: string;
  modelId: string;
  windowCount: number;
  requiredWindows: number;
  observedMinutes: number;
  usable: boolean;
  status: string;
  expiresAt: string | null;
  lastUpdatedAt: string;
  /** Feature names the baseline can compare. Never the statistics themselves. */
  comparableFeatures: string[];
}

/**
 * A driver's baseline status.
 *
 * Returns coverage and readiness, not the statistics. The means and standard
 * deviations of a named person's cabin behaviour are their personal data and
 * serve no operational purpose on a screen — an operator needs to know whether
 * abnormality can be assessed, not what the driver's mean vocal intensity is.
 */
export async function getBaselineStatus(user: AuthUser, driverId: string): Promise<BaselineStatus> {
  const row = await repository.findBaseline(
    user.organizationId,
    driverId,
    ABNORMALITY_MODEL_VERSION,
  );

  if (!row) throw new NotFoundError('Cabin baseline', driverId);

  const features = (row.features as Record<string, BaselineStatistics> | null) ?? {};
  const expired = row.expiresAt !== null && row.expiresAt.getTime() < Date.now();

  return {
    driverId,
    modelId: row.modelId,
    windowCount: row.windowCount,
    requiredWindows: MINIMUM_BASELINE_WINDOWS,
    observedMinutes: row.observedMinutes,
    usable: !expired && row.windowCount >= MINIMUM_BASELINE_WINDOWS,
    status: expired ? 'EXPIRED' : row.status,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUpdatedAt: row.lastUpdatedAt.toISOString(),
    comparableFeatures: Object.entries(features)
      .filter(([, stats]) => (stats?.standardDeviation ?? 0) > 1e-6)
      .map(([name]) => name)
      .sort(),
  };
}

/**
 * Erases a driver's cabin baseline.
 *
 * Two legitimate callers, both served by the same operation. A driver may
 * require erasure of their behavioural statistics, which are their personal
 * data. An analyst may need to reset a baseline invalidated by a change of
 * vehicle or route profile, because a stale baseline reads ordinary change as
 * anomaly.
 */
export async function resetBaseline(
  user: AuthUser,
  driverId: string,
): Promise<{ deleted: number }> {
  const deleted = await repository.deleteBaseline(user.organizationId, driverId);

  log.info({ driverId, deleted, actorUserId: user.id }, 'Cabin baseline erased');

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.DELETE,
    resourceType: 'cabin_baseline',
    resourceId: driverId,
    metadata: { deleted },
  });

  return { deleted };
}

// ============================================================================
// Reads
// ============================================================================

export interface ListAssessmentsInput {
  driverId?: string;
  vehicleId?: string;
  level?: ThreatLevel;
  duressIndicated?: boolean;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listAssessments(
  user: AuthUser,
  input: ListAssessmentsInput,
): Promise<Paginated<BehaviourAssessment>> {
  const pagination = normalisePagination(input);

  const { rows, total } = await repository.findAssessments({
    ...pagination,
    organizationId: user.organizationId,
    driverId: input.driverId,
    vehicleId: input.vehicleId,
    level: input.level,
    duressIndicated: input.duressIndicated,
    from: input.from ? new Date(input.from) : undefined,
    to: input.to ? new Date(input.to) : undefined,
  });

  return paginate(rows.map(toAssessmentDto), pagination, total);
}

export async function getVehicleThreat(
  user: AuthUser,
  vehicleId: string,
): Promise<BehaviourAssessment | null> {
  const row = await repository.findLatestForVehicle(user.organizationId, vehicleId);
  return row ? toAssessmentDto(row) : null;
}

export async function getDriverThreat(
  user: AuthUser,
  driverId: string,
): Promise<BehaviourAssessment | null> {
  const row = await repository.findLatestForDriver(user.organizationId, driverId);
  return row ? toAssessmentDto(row) : null;
}

/**
 * The signal calibration in force, and its provenance.
 *
 * Exposed as an endpoint rather than kept internal because a score nobody can
 * interrogate is a score nobody should act on. An analyst reviewing a
 * false positive needs to see the likelihood ratio and detector reliability
 * that produced it, and `calibrationSource` tells them whether those numbers
 * were ever fitted to real data or are still the shipped estimates.
 */
export function getCalibration(): {
  source: string;
  fitted: boolean;
  warning: string | null;
  signals: Array<{
    signal: string;
    signalClass: string;
    evidenceClass: string;
    likelihoodRatio: number;
    detectorReliability: number;
    halfLifeSeconds: number;
    minimumDurationSeconds: number;
    description: string;
  }>;
} {
  const fitted = !SIGNAL_CALIBRATION_SOURCE.startsWith('structured-estimates');

  return {
    source: SIGNAL_CALIBRATION_SOURCE,
    fitted,
    warning: fitted
      ? null
      : 'These likelihood ratios are structured estimates, not measurements fitted to AEGISDRIVE data. Their relative ordering is defensible; their absolute magnitudes are not. They must be refitted per deployment from confirmed incidents and matched controls before this engine is used to dispatch anyone.',
    signals: Object.values(SIGNAL_CALIBRATION).map((entry) => ({
      signal: entry.signal,
      signalClass: entry.signalClass,
      evidenceClass: entry.evidenceClass,
      likelihoodRatio: entry.likelihoodRatio,
      detectorReliability: entry.detectorReliability,
      halfLifeSeconds: entry.halfLifeSeconds,
      minimumDurationSeconds: entry.minimumDurationSeconds,
      description: entry.description,
    })),
  };
}
