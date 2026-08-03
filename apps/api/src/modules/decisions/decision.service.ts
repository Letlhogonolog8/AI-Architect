import type { Prisma } from '@prisma/client';
import {
  AuditAction,
  DecisionAction,
  IncidentType,
  ThreatHypothesis,
  type AuthUser,
  type BehaviourObservation,
  type IdentityBand,
  type ThreatHypothesis as Hypothesis,
} from '@aegisdrive/types';
import {
  ConflictError,
  HYPOTHESIS_LABEL,
  NotFoundError,
  decide,
  normalisePagination,
  paginate,
} from '@aegisdrive/shared';
import { moduleLogger } from '../../core/logger';
import { recordAudit } from '../audit-logs/audit.service';
import { createIncident } from '../incidents/incident.service';
import * as behaviourRepository from '../behaviour/behaviour.repository';
import * as repository from './decision.repository';
import { toDecisionDto } from './decision.mapper';
import type { DecideBody, ListDecisionsQuery, OverrideBody } from './decision.schema';

const log = moduleLogger('decision');

/**
 * Threat Decision Engine service.
 *
 * Runs the engine over a recorded behaviour assessment and persists the result.
 *
 * **The evidence is read from the stored assessment rather than accepted from
 * the caller.** A decision must be reproducible from its own record, and that
 * only holds if the evidence it was computed from is the evidence that was
 * durably recorded. Accepting signals on the request would let a caller assert
 * a conclusion from evidence nobody else ever saw.
 */

export async function runDecision(user: AuthUser, input: DecideBody) {
  const source = await behaviourRepository.findAssessmentById(
    user.organizationId,
    input.behaviourAssessmentId,
  );

  if (!source) {
    throw new NotFoundError('Behaviour assessment', input.behaviourAssessmentId);
  }

  const observations = parseSignals(source.signals);

  const result = decide({
    organizationId: user.organizationId,
    vehicleId: input.vehicleId ?? source.vehicleId,
    driverId: input.driverId ?? source.driverId,
    observations,
    identityBand: (source.identityBand as IdentityBand | null) ?? null,
    // The behaviour assessment stores the band but not the identity engine's
    // own confidence figure, so the shrink defaults to full weight. Recorded
    // here rather than silently assumed: when the assessment carries a
    // confidence, pass it.
    identityConfidence: null,
    sensorsExpected: input.sensorsExpected,
    sensorsHealthy: input.sensorsHealthy,
  });

  const row = await repository.insertDecision({
    organizationId: user.organizationId,
    vehicleId: result.vehicleId,
    driverId: result.driverId,
    leadingHypothesis: result.leadingHypothesis,
    anomalyProbability: result.anomalyProbability,
    hypothesisConfidence: result.hypothesisConfidence,
    posteriors: result.posteriors as unknown as Prisma.InputJsonValue,
    confidenceOverall: result.confidence.overall,
    confidenceDetail: result.confidence as unknown as Prisma.InputJsonValue,
    actions: result.actions as unknown as Prisma.InputJsonValue,
    autonomyLevel: result.autonomyLevel,
    severity: result.severity,
    constraints: result.constraints as unknown as Prisma.InputJsonValue,
    graph: result.graph as unknown as Prisma.InputJsonValue,
    explanation: result.explanation as unknown as Prisma.InputJsonValue,
    inputs: result.inputs as unknown as Prisma.InputJsonValue,
    decidedAt: new Date(result.decidedAt),
    engineVersion: result.engineVersion,
    calibrationSource: result.calibrationSource,
  });

  if (result.leadingHypothesis !== ThreatHypothesis.NORMAL) {
    log.info(
      {
        decisionId: row.id,
        hypothesis: result.leadingHypothesis,
        anomalyProbability: result.anomalyProbability,
        hypothesisConfidence: result.hypothesisConfidence,
        confidence: result.confidence.overall,
        actions: result.actions,
      },
      'Decision reached',
    );
  }

  if (result.actions.includes(DecisionAction.OPEN_INCIDENT)) {
    await openIncidentFor(user, result);
  }

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'threat_decision',
    resourceId: row.id,
    metadata: {
      hypothesis: result.leadingHypothesis,
      anomalyProbability: result.anomalyProbability,
      hypothesisConfidence: result.hypothesisConfidence,
      confidence: result.confidence.overall,
      actions: result.actions,
      constraints: result.constraints.map((constraint) => constraint.code),
      engineVersion: result.engineVersion,
      calibrationSource: result.calibrationSource,
    },
  });

  return toDecisionDto(row);
}

/**
 * Maps a hypothesis onto the incident type it corresponds to.
 *
 * The medical and collision rows are the reason this mapping exists rather than
 * everything opening as `ATTEMPTED_HIJACKING`. An incident typed as a hijacking
 * routes to armed response; the same event typed as `MEDICAL` routes to an
 * ambulance, and getting that wrong is the failure this whole engine was built
 * to prevent.
 */
const INCIDENT_TYPE_FOR: Partial<Record<Hypothesis, IncidentType>> = {
  [ThreatHypothesis.HIJACKING]: IncidentType.HIJACKING,
  [ThreatHypothesis.DURESS]: IncidentType.COERCION,
  [ThreatHypothesis.THEFT]: IncidentType.THEFT,
  [ThreatHypothesis.MEDICAL]: IncidentType.MEDICAL,
  [ThreatHypothesis.COLLISION]: IncidentType.COLLISION,
  [ThreatHypothesis.UNAUTHORISED_USE]: IncidentType.UNAUTHORISED_USE,
};

async function openIncidentFor(user: AuthUser, result: ReturnType<typeof decide>): Promise<void> {
  const type = INCIDENT_TYPE_FOR[result.leadingHypothesis];
  if (!type) return;

  await createIncident(user, {
    type,
    severity: result.severity,
    title: `${HYPOTHESIS_LABEL[result.leadingHypothesis]} — ${(result.hypothesisConfidence * 100).toFixed(0)}% of non-normal posterior`,
    summary: result.explanation.join('\n'),
    vehicleId: result.vehicleId,
    driverId: result.driverId,
    position: null,
    // The anomaly probability, not the conditional. The conditional says "if
    // something is wrong, this is what" — recording it as the incident's
    // confidence would overstate the case by two orders of magnitude on a
    // record that may reach a court.
    aiConfidence: result.anomalyProbability,
  });
}

/**
 * Records a human overriding the engine.
 *
 * Deliberately does **not** re-run anything or reverse the actions already
 * taken. An override is a statement about what the operator believes, recorded
 * against what the engine concluded; rewriting the decision would destroy the
 * comparison that makes overrides the platform's best calibration signal.
 */
export async function overrideDecision(user: AuthUser, decisionId: string, input: OverrideBody) {
  const row = await repository.recordOverride(user.organizationId, decisionId, {
    hypothesis: input.hypothesis,
    reason: input.reason,
    userId: user.id,
  });

  if (!row) {
    const existing = await repository.findDecisionById(user.organizationId, decisionId);
    if (!existing) throw new NotFoundError('Decision', decisionId);

    throw new ConflictError(
      `This decision was already overridden to ${existing.overrideHypothesis}. An override is recorded once — allowing it to be revised would let a disagreement be walked back, and both its evidentiary value and its use as a calibration signal depend on it standing.`,
    );
  }

  log.info(
    {
      decisionId,
      engineHypothesis: row.leadingHypothesis,
      operatorHypothesis: input.hypothesis,
      actorUserId: user.id,
    },
    'Decision overridden by operator',
  );

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'threat_decision',
    resourceId: decisionId,
    metadata: {
      engineHypothesis: row.leadingHypothesis,
      operatorHypothesis: input.hypothesis,
      reason: input.reason,
      engineVersion: row.engineVersion,
      calibrationSource: row.calibrationSource,
    },
  });

  return toDecisionDto(row);
}

export async function listDecisions(user: AuthUser, query: ListDecisionsQuery) {
  const pagination = normalisePagination(query);

  const { rows, total } = await repository.findDecisions({
    ...pagination,
    organizationId: user.organizationId,
    vehicleId: query.vehicleId,
    driverId: query.driverId,
    hypothesis: query.hypothesis,
    overriddenOnly: query.overriddenOnly,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });

  return paginate(rows.map(toDecisionDto), pagination, total);
}

export async function getDecision(user: AuthUser, decisionId: string) {
  const row = await repository.findDecisionById(user.organizationId, decisionId);
  if (!row) throw new NotFoundError('Decision', decisionId);

  return toDecisionDto(row);
}

export async function getVehicleDecision(user: AuthUser, vehicleId: string) {
  const row = await repository.findLatestForVehicle(user.organizationId, vehicleId);
  return row ? toDecisionDto(row) : null;
}

/**
 * Override rates by hypothesis, over the last 30 days.
 *
 * The calibration review surface. A hypothesis operators correct most of the
 * time is one whose priors or likelihoods are wrong, and this is the only place
 * that shows up — an offline evaluation has no ground truth to compare against,
 * but an operator who looked at the footage does.
 */
export async function getCalibrationReview(user: AuthUser) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const { byLeading, byOverride } = await repository.overrideStatistics(user.organizationId, since);

  const totals = new Map(byLeading.map((entry) => [entry.hypothesis, entry.count]));

  const corrections = byOverride.map((entry) => ({
    engineHypothesis: entry.engineHypothesis,
    operatorHypothesis: entry.operatorHypothesis,
    count: entry.count,
    ofTotal: totals.get(entry.engineHypothesis) ?? 0,
  }));

  return {
    windowDays: 30,
    decisionsByHypothesis: byLeading,
    corrections,
    note: 'A hypothesis that operators routinely correct is miscalibrated. Override rates are the only ground truth this platform has, because nobody knows what a decision should have been until a human looks at the footage.',
  };
}

function parseSignals(value: unknown): BehaviourObservation[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (entry): entry is BehaviourObservation =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).signal === 'string',
  );
}
