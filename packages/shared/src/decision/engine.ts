import {
  ThreatHypothesis,
  type BehaviourObservation,
  type DecisionInputSummary,
  type IdentityBand,
  type ThreatDecision,
} from '@aegisdrive/types';
import { SIGNAL_CALIBRATION_SOURCE } from '../behaviour/catalogue';
import { scoreThreat, type ContextualEvidence } from '../behaviour/threat-score';
import { assessConfidence } from './confidence';
import { buildGraph, explainGraph } from './graph';
import { HYPOTHESIS_PRIOR_SOURCE } from './hypotheses';
import { infer } from './inference';
import { LIKELIHOOD_SOURCE } from './likelihoods';
import { resolveDecision } from './policy';

/**
 * The Threat Decision Engine.
 *
 * Orchestrates the engines that came before it and reaches a decision.
 *
 * ## What it reuses rather than replaces
 *
 * - `fuseIdentity` (Phase 4) remains the authority on driver confidence. Its
 *   band arrives here as evidence.
 * - `scoreThreat` (Phase 5) remains the authority on hijacking-evidence
 *   strength. It is called here and its score recorded, but the *decision*
 *   comes from the multi-hypothesis posterior.
 * - `SIGNAL_CALIBRATION` (Phase 5) supplies the hijacking column of the
 *   likelihood matrix directly, so the two engines cannot drift.
 * - `deriveCabinSignals` (Phase 6) produced the observations upstream.
 *
 * There is no second scorer here. Every number this engine adds is about
 * *which explanation fits*, which is a question none of the others asked.
 *
 * ## Why the threat score is still computed
 *
 * Two reasons, and neither is redundancy. It is the continuity of the operator
 * interface — the Command Centre and every alert built in Phase 5 speak in
 * threat scores — and it is a cross-check: a high threat score against a
 * `SENSOR_FAILURE` posterior is exactly the disagreement worth surfacing, and
 * it is only visible if both are computed.
 */

export const DECISION_ENGINE_VERSION = 'decision-engine-v1' as const;

export interface DecideInput {
  organizationId: string;
  vehicleId: string | null;
  driverId: string | null;

  observations: readonly BehaviourObservation[];
  identityBand?: IdentityBand | null;
  /** 0-100 driver confidence from the identity engine. */
  identityConfidence?: number | null;

  /** Non-behavioural evidence for the Phase 5 threat score. */
  context?: readonly ContextualEvidence[];

  /** Cabin sensors enrolled against this vehicle. */
  sensorsExpected?: number;
  /** Of those, how many were healthy and contributing. */
  sensorsHealthy?: number;

  /** Per-deployment prior multipliers, from `scalePriors`. */
  priors?: Readonly<Record<ThreatHypothesis, number>>;

  /** Injectable so a replay reproduces the original decision exactly. */
  now?: Date;
}

/** The decision, minus the fields only persistence can supply. */
export type DecisionResult = Omit<ThreatDecision, 'id' | 'organizationId'> & {
  organizationId: string;
};

export function decide(input: DecideInput): DecisionResult {
  const now = input.now ?? new Date();

  // Identity confidence arrives 0-100 from the identity engine and is used here
  // as a 0-1 shrink factor. Converting at the boundary rather than expecting
  // callers to normalise keeps one definition of the scale.
  const identityConfidence =
    input.identityConfidence === null || input.identityConfidence === undefined
      ? null
      : clamp01(input.identityConfidence / 100);

  const inference = infer({
    observations: input.observations,
    identityBand: input.identityBand,
    identityConfidence,
    priors: input.priors,
    now,
  });

  const confidence = assessConfidence({
    evidenceClasses: inference.evidenceClasses,
    observationCount: inference.admittedCount,
    sensorsExpected: input.sensorsExpected ?? 0,
    sensorsHealthy: input.sensorsHealthy ?? 0,
    discrimination: inference.discrimination,
  });

  const resolved = resolveDecision(
    inference.leading.hypothesis,
    inference.anomalyProbability,
    inference.leading.conditional,
    confidence,
  );

  // Computed for continuity and as a cross-check, not to drive the decision.
  const threat = scoreThreat({
    observations: input.observations,
    identityBand: input.identityBand,
    context: input.context,
    now,
  });

  const graph = buildGraph({
    observations: input.observations,
    identityBand: input.identityBand ?? null,
    posteriors: inference.posteriors,
    leading: inference.leading,
    actions: resolved.actions,
    constraints: resolved.constraints,
    confidenceOverall: confidence.overall,
  });

  const explanation = explainGraph(
    graph,
    inference.posteriors,
    confidence.overall,
    resolved.constraints,
  );

  const divergence = describeDivergence(inference.leading.hypothesis, threat.score);
  if (divergence) explanation.push(divergence);

  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    driverId: input.driverId,

    leadingHypothesis: inference.leading.hypothesis,
    anomalyProbability: inference.anomalyProbability,
    hypothesisConfidence: inference.leading.conditional,
    posteriors: inference.posteriors,

    confidence,

    actions: resolved.actions,
    autonomyLevel: resolved.autonomyLevel,
    severity: resolved.severity,
    constraints: resolved.constraints,

    graph,
    explanation,

    inputs: summariseInputs(input, threat.score, inference),

    decidedAt: now.toISOString(),
    engineVersion: DECISION_ENGINE_VERSION,
    calibrationSource: `${HYPOTHESIS_PRIOR_SOURCE}/${LIKELIHOOD_SOURCE}/${SIGNAL_CALIBRATION_SOURCE}`,
    override: null,
  };
}

/**
 * Surfaces disagreement between the threat score and the posterior.
 *
 * The interesting case is a high Phase 5 score against a `SENSOR_FAILURE` or
 * `MEDICAL` posterior. Both numbers are correct and they are answering
 * different questions — "how alarming does this look" versus "what is actually
 * happening" — and the gap between them is the most useful thing on the screen.
 *
 * An operator who sees only the score dispatches security to a stroke. One who
 * sees the disagreement stated understands why the engine is recommending an
 * ambulance instead, and can override it if they disagree.
 */
function describeDivergence(hypothesis: ThreatHypothesis, threatScore: number): string | null {
  if (threatScore < 40) return null;

  if (hypothesis === ThreatHypothesis.SENSOR_FAILURE) {
    return (
      `Note the disagreement: the threat score is ${threatScore}/100, but the evidence pattern is best explained by faulty sensors. ` +
      `Both readings are correct — the score measures how alarming this looks, the posterior measures what is most likely happening. ` +
      `Check the sensor health before treating this as an event.`
    );
  }

  if (hypothesis === ThreatHypothesis.MEDICAL || hypothesis === ThreatHypothesis.COLLISION) {
    return (
      `Note the disagreement: the threat score is ${threatScore}/100, but the evidence is best explained by a medical emergency or collision rather than an attack. ` +
      `A security response would delay the ambulance this needs. Confirm before dispatching armed responders.`
    );
  }

  if (hypothesis === ThreatHypothesis.UNAUTHORISED_USE) {
    return (
      `Note the disagreement: the threat score is ${threatScore}/100, but the evidence is best explained by an unrecognised driver with no sign of coercion — ` +
      `most often a colleague or an unlogged relief shift.`
    );
  }

  if (hypothesis === ThreatHypothesis.NORMAL) {
    return (
      `Note the disagreement: the threat score is ${threatScore}/100, but no explanation fits the evidence better than ordinary operation. ` +
      `This usually means several weak signals coincided.`
    );
  }

  return null;
}

function summariseInputs(
  input: DecideInput,
  threatScore: number,
  inference: ReturnType<typeof infer>,
): DecisionInputSummary {
  return {
    signals: input.observations.map((observation) => ({
      signal: observation.signal,
      strength: observation.strength,
      observedAt: observation.observedAt,
    })),
    identityBand: input.identityBand ?? null,
    identityConfidence: input.identityConfidence ?? null,
    threatScore,
    evidenceClasses: inference.evidenceClasses,
    sensorsExpected: input.sensorsExpected ?? 0,
    sensorsHealthy: input.sensorsHealthy ?? 0,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
