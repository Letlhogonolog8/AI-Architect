import {
  ThreatEvidenceClass,
  ThreatHypothesis,
  type BehaviourObservation,
  type HypothesisPosterior,
  type IdentityBand,
} from '@aegisdrive/types';
import { SIGNAL_CALIBRATION, admitObservation } from '../behaviour/catalogue';
import { ALL_HYPOTHESES, HYPOTHESIS_PRIORS } from './hypotheses';
import { identityLikelihoodFor, likelihoodFor } from './likelihoods';

/**
 * Multi-hypothesis Bayesian inference.
 *
 * ## The arithmetic
 *
 *     P(H_i | e) =        P(e | H_i) · P(H_i)
 *                  ─────────────────────────────────
 *                     Σ_j  P(e | H_j) · P(H_j)
 *
 * Computed in log space and normalised across the hypothesis set. The
 * normalisation is the whole point: because the hypotheses are exhaustive and
 * mutually exclusive, evidence for one **actively reduces** belief in the
 * others. A single-hypothesis score cannot do that, and it is why a threat axis
 * alone sends an ambulance case to an armed response team.
 *
 * ## Why the correlation discount is per class, per hypothesis
 *
 * Signals within one evidence class share a failure mode, so they are
 * discounted geometrically the same way the behaviour scorer does it. The
 * discount is applied per hypothesis rather than globally, because the ranking
 * of "which signal is strongest" differs by hypothesis: slumped posture is the
 * dominant motion-class signal under `MEDICAL` and a minor one under
 * `HIJACKING`, and discounting by the hijacking ranking would silently
 * suppress the medical reading.
 *
 * ## What this does not do
 *
 * It does not re-score anything Phase 5 already scored. The hijacking column
 * comes from `SIGNAL_CALIBRATION`, and `scoreThreat` remains the authority on
 * hijacking-evidence strength. This engine asks a different question of the
 * same numbers.
 */

export const INFERENCE_VERSION = 'decision-inference-v1' as const;

/**
 * Discount per additional signal within one evidence class.
 *
 * Matches the behaviour engine's `WITHIN_CLASS_DISCOUNT`. Signals in one class
 * share not just error modes but their underlying cause — a struggle trips
 * every motion detector at once, and that is one event rather than four.
 */
const WITHIN_CLASS_DISCOUNT = 0.6;

/**
 * Ceiling on any single hypothesis' accumulated log-likelihood.
 *
 * Without it, six correlated signals can drive a posterior to 1.0 and the
 * engine reports certainty it has no basis for. Six is generous — it
 * corresponds to a millionfold shift in the odds — and it exists to stop
 * runaway accumulation rather than to shape ordinary outcomes.
 */
const MAXIMUM_LOG_LIKELIHOOD = 6;

/**
 * Anomaly probability below which the leading hypothesis is reported as
 * `NORMAL`.
 *
 * Must stay below the smallest `notifyThreshold` in `HYPOTHESIS_POLICIES`
 * (currently 0.0005, on `MEDICAL`) so that it can never suppress a hypothesis
 * that would otherwise have triggered an action. It exists to keep quiet trips
 * labelled quiet, not to gate anything.
 */
const ANOMALY_FLOOR = 0.0004;

export interface InferenceInput {
  observations: readonly BehaviourObservation[];
  identityBand?: IdentityBand | null;
  /** 0-1 confidence in the identity assessment. Shrinks its likelihoods. */
  identityConfidence?: number | null;
  /** Per-deployment priors. Defaults to `HYPOTHESIS_PRIORS`. */
  priors?: Readonly<Record<ThreatHypothesis, number>>;
  /** Injectable so a replay reproduces the original result exactly. */
  now?: Date;
}

export interface InferenceResult {
  posteriors: HypothesisPosterior[];
  /**
   * The leading **non-normal** hypothesis by conditional posterior.
   *
   * `NORMAL` only when no evidence was admitted at all. Otherwise the engine
   * always has a best explanation for whatever it saw, even when the
   * probability that anything is wrong is very small — those are separate
   * questions and this answers the second.
   */
  leading: HypothesisPosterior;
  /** `1 − P(NORMAL | evidence)`. How likely it is that anything is wrong. */
  anomalyProbability: number;
  /** Evidence classes that contributed at least one admitted observation. */
  evidenceClasses: ThreatEvidenceClass[];
  /** Observations that were admitted. Drives the confidence calculation. */
  admittedCount: number;
  /**
   * 0-1. How peaked the **conditional** distribution is.
   *
   * Measured over the non-normal hypotheses, because that is where the
   * discrimination question lives. Measuring it over the full set would report
   * near-perfect discrimination on every quiet trip — `NORMAL` owns the mass
   * regardless — which is exactly the wrong signal.
   */
  discrimination: number;
}

export function infer(input: InferenceInput): InferenceResult {
  const now = input.now ?? new Date();
  const priors = input.priors ?? HYPOTHESIS_PRIORS;

  const admitted = admitObservations(input.observations, now);
  const evidenceClasses = [
    ...new Set(
      admitted.map(({ observation }) => SIGNAL_CALIBRATION[observation.signal].evidenceClass),
    ),
  ];

  const logLikelihoods = new Map<ThreatHypothesis, number>();
  const support = new Map<ThreatHypothesis, Array<{ signal: string; likelihoodRatio: number }>>();

  for (const hypothesis of ALL_HYPOTHESES) {
    const { total, contributions } = accumulate(admitted, hypothesis);

    let logLikelihood = total;

    if (input.identityBand) {
      const identityRatio = identityLikelihoodFor(
        input.identityBand,
        hypothesis,
        input.identityConfidence ?? 1,
      );

      if (Math.abs(Math.log10(identityRatio)) >= 0.01) {
        logLikelihood += Math.log10(identityRatio);
        contributions.push({
          signal: `IDENTITY_${input.identityBand}`,
          likelihoodRatio: round3(identityRatio),
        });
      }
    }

    logLikelihoods.set(
      hypothesis,
      Math.max(-MAXIMUM_LOG_LIKELIHOOD, Math.min(MAXIMUM_LOG_LIKELIHOOD, logLikelihood)),
    );
    support.set(
      hypothesis,
      contributions.sort((a, b) => b.likelihoodRatio - a.likelihoodRatio).slice(0, 6),
    );
  }

  const posteriors = normalise(priors, logLikelihoods, support);

  const normal = posteriors.find((entry) => entry.hypothesis === ThreatHypothesis.NORMAL);
  const anomalyProbability = round4(1 - (normal?.posterior ?? 1));

  const nonNormal = posteriors.filter((entry) => entry.hypothesis !== ThreatHypothesis.NORMAL);

  // Below the floor the leading hypothesis is reported as NORMAL.
  //
  // The conditional distribution is defined at every anomaly probability, and
  // on a completely quiet trip it still names a best non-normal explanation —
  // usually SENSOR_FAILURE, because it has the largest prior. Reporting that as
  // "the leading hypothesis" on a trip where nothing happened is noise, and it
  // would put a spurious label on every ordinary journey.
  //
  // The floor sits below the lowest notify threshold in the policy table, so
  // this can never suppress a hypothesis that would have triggered an action.
  const leading =
    admitted.length === 0 || anomalyProbability < ANOMALY_FLOOR
      ? (normal ?? posteriors[0]!)
      : (nonNormal.sort((a, b) => b.conditional - a.conditional)[0] ?? posteriors[0]!);

  return {
    posteriors,
    leading,
    anomalyProbability,
    evidenceClasses,
    admittedCount: admitted.length,
    discrimination: discriminationOf(nonNormal),
  };
}

interface AdmittedObservation {
  observation: BehaviourObservation;
  ageSeconds: number;
}

/**
 * Applies the behaviour engine's admission gates.
 *
 * Reused rather than reimplemented so a signal cannot be admissible to one
 * engine and inadmissible to the other. Only the strongest observation per
 * signal is kept — three detections of raised hands in one window is one fact
 * about the trip, not three independent pieces of evidence.
 */
function admitObservations(
  observations: readonly BehaviourObservation[],
  now: Date,
): AdmittedObservation[] {
  const strongest = new Map<string, AdmittedObservation>();

  for (const observation of observations) {
    const ageSeconds = Math.max(0, (now.getTime() - Date.parse(observation.observedAt)) / 1000);

    if (!Number.isFinite(ageSeconds)) continue;
    if (!admitObservation(observation, ageSeconds).admitted) continue;

    const weight = observation.strength * observation.detectorConfidence * observation.quality;
    const existing = strongest.get(observation.signal);

    if (
      !existing ||
      weight >
        existing.observation.strength *
          existing.observation.detectorConfidence *
          existing.observation.quality
    ) {
      strongest.set(observation.signal, { observation, ageSeconds });
    }
  }

  return [...strongest.values()];
}

/**
 * Accumulates log-likelihood for one hypothesis, with the within-class discount.
 *
 * Ranking is recomputed per hypothesis, which is the subtle and necessary part:
 * the strongest signal under `MEDICAL` is not the strongest under `HIJACKING`,
 * and reusing one ranking would discount the wrong signals.
 */
function accumulate(
  admitted: readonly AdmittedObservation[],
  hypothesis: ThreatHypothesis,
): { total: number; contributions: Array<{ signal: string; likelihoodRatio: number }> } {
  const byClass = new Map<
    ThreatEvidenceClass,
    Array<{ signal: string; log: number; ratio: number }>
  >();

  for (const { observation, ageSeconds } of admitted) {
    const ratio = likelihoodFor(observation, hypothesis, ageSeconds);
    const log = Math.log10(ratio);

    if (Math.abs(log) < 0.01) continue;

    const evidenceClass = SIGNAL_CALIBRATION[observation.signal].evidenceClass;
    const bucket = byClass.get(evidenceClass) ?? [];

    bucket.push({ signal: observation.signal, log, ratio });
    byClass.set(evidenceClass, bucket);
  }

  let total = 0;
  const contributions: Array<{ signal: string; likelihoodRatio: number }> = [];

  for (const bucket of byClass.values()) {
    // Discount only the supporting signals. Evidence that argues *against* a
    // hypothesis is not softened for correlation — the asymmetry errs toward
    // keeping a hypothesis suppressed rather than talking it up.
    const supporting = bucket.filter((entry) => entry.log > 0).sort((a, b) => b.log - a.log);
    const opposing = bucket.filter((entry) => entry.log <= 0);

    supporting.forEach((entry, index) => {
      const discounted = entry.log * Math.pow(WITHIN_CLASS_DISCOUNT, index);
      total += discounted;
      contributions.push({ signal: entry.signal, likelihoodRatio: round3(entry.ratio) });
    });

    for (const entry of opposing) {
      total += entry.log;
      contributions.push({ signal: entry.signal, likelihoodRatio: round3(entry.ratio) });
    }
  }

  return { total, contributions };
}

/**
 * Normalises log-likelihoods and priors into a posterior distribution.
 *
 * Uses the log-sum-exp trick — subtracting the maximum before exponentiating —
 * so that a strongly supported hypothesis does not overflow to infinity and
 * take the whole distribution to NaN. With log-likelihoods capped at 6 and
 * priors down at 1e-6, the exponents span twelve orders of magnitude and naive
 * exponentiation loses precision well before it overflows.
 */
function normalise(
  priors: Readonly<Record<ThreatHypothesis, number>>,
  logLikelihoods: Map<ThreatHypothesis, number>,
  support: Map<ThreatHypothesis, Array<{ signal: string; likelihoodRatio: number }>>,
): HypothesisPosterior[] {
  const logPosteriors = ALL_HYPOTHESES.map((hypothesis) => {
    const prior = Math.max(1e-12, priors[hypothesis] ?? 0);
    const logLikelihood = logLikelihoods.get(hypothesis) ?? 0;

    return { hypothesis, prior, logLikelihood, logJoint: Math.log10(prior) + logLikelihood };
  });

  const maxLogJoint = Math.max(...logPosteriors.map((entry) => entry.logJoint));
  const weights = logPosteriors.map((entry) => Math.pow(10, entry.logJoint - maxLogJoint));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);

  // Renormalise across the non-normal hypotheses to get the conditional
  // distribution — "given that something is wrong, what is it?". This is where
  // the discrimination between a medical emergency and a hijacking actually
  // lives, because those priors differ by a factor of a few rather than by the
  // six orders of magnitude separating either from NORMAL.
  const nonNormalWeight = logPosteriors.reduce(
    (total, entry, index) =>
      entry.hypothesis === ThreatHypothesis.NORMAL ? total : total + weights[index]!,
    0,
  );

  return logPosteriors
    .map((entry, index) => ({
      hypothesis: entry.hypothesis,
      prior: entry.prior,
      logLikelihood: round3(entry.logLikelihood),
      posterior: round4(totalWeight > 0 ? weights[index]! / totalWeight : 0),
      conditional:
        entry.hypothesis === ThreatHypothesis.NORMAL
          ? 0
          : round4(nonNormalWeight > 0 ? weights[index]! / nonNormalWeight : 0),
      supportingSignals: support.get(entry.hypothesis) ?? [],
    }))
    .sort((a, b) => b.posterior - a.posterior);
}

/**
 * How peaked the posterior is, from its normalised Shannon entropy.
 *
 * 1 means one hypothesis owns the mass; 0 means the distribution is flat and
 * the engine has learned nothing that separates the explanations.
 *
 * Reported rather than hidden. "We are confident nothing is wrong" and "we
 * cannot tell what is happening" are different answers demanding opposite
 * responses — silence in the first case, a human in the second — and a system
 * that reports only the leading posterior cannot distinguish them.
 */
function discriminationOf(posteriors: readonly HypothesisPosterior[]): number {
  const probabilities = posteriors
    .map((entry) => entry.conditional)
    .filter((probability) => probability > 0);

  if (probabilities.length <= 1) return 1;

  const entropy = -probabilities.reduce(
    (total, probability) => total + probability * Math.log(probability),
    0,
  );
  const maximumEntropy = Math.log(posteriors.length);

  return round3(Math.max(0, Math.min(1, 1 - entropy / maximumEntropy)));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
