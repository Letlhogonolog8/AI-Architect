import { ThreatEvidenceClass, type DecisionConfidence } from '@aegisdrive/types';
import { SIGNAL_CALIBRATION_SOURCE } from '../behaviour/catalogue';
import { HYPOTHESIS_PRIOR_SOURCE } from './hypotheses';
import { LIKELIHOOD_SOURCE } from './likelihoods';

/**
 * Epistemic confidence: how much the engine trusts its own answer.
 *
 * ## Not the same thing as the probability
 *
 * The posterior says how likely an explanation is *given* the evidence.
 * Confidence says how good that evidence was. They move independently, and
 * conflating them destroys the distinction that matters most operationally:
 *
 * - High probability, high confidence → act.
 * - High probability, **low** confidence → a confident-looking answer built on
 *   one degraded camera. Escalate to a human; do not dispatch on it.
 * - Low probability, high confidence → genuine all-clear. Stay silent.
 * - Low probability, **low** confidence → the engine is blind. This is *not*
 *   an all-clear, and reporting it as one is how a monitoring system fails
 *   silently at the moment it is needed.
 *
 * The last row is the reason this type exists. A single "confidence" number
 * cannot distinguish "we are sure nothing is wrong" from "we cannot see", and a
 * system that renders both as a quiet dashboard has misled its operator in the
 * more dangerous direction.
 */

export const CONFIDENCE_VERSION = 'decision-confidence-v1' as const;

/** Evidence classes the engine expects to hear from on a fully instrumented vehicle. */
const EXPECTED_EVIDENCE_CLASSES: readonly ThreatEvidenceClass[] = [
  ThreatEvidenceClass.BEHAVIOURAL,
  ThreatEvidenceClass.ACOUSTIC,
  ThreatEvidenceClass.PHYSICAL,
  ThreatEvidenceClass.IDENTITY,
];

/** Admitted observations below which the engine has not seen enough to judge. */
const SUFFICIENT_OBSERVATIONS = 4;

/**
 * Confidence ceiling while the calibration is still shipped estimates.
 *
 * The likelihood tables, the priors and the behaviour catalogue are all
 * structured estimates rather than numbers fitted to deployment data. An engine
 * running on them can be directionally right and must not present itself as
 * precise, so its confidence is capped until someone has done the fitting.
 *
 * This travels with every decision. An unfitted engine cannot quietly become a
 * fitted-looking one.
 */
const UNFITTED_CALIBRATION_CEILING = 0.7;

export interface ConfidenceInput {
  /** Evidence classes that contributed at least one admitted observation. */
  evidenceClasses: readonly ThreatEvidenceClass[];
  /** Admitted observations. */
  observationCount: number;
  /** Sensors the vehicle is expected to have. */
  sensorsExpected: number;
  /** Sensors that were healthy and contributing. */
  sensorsHealthy: number;
  /** 0-1 peakedness of the posterior, from `infer`. */
  discrimination: number;
}

export function assessConfidence(input: ConfidenceInput): DecisionConfidence {
  const limitations: string[] = [];

  // ------------------------------------------------------------- coverage
  const present = new Set(input.evidenceClasses);
  const covered = EXPECTED_EVIDENCE_CLASSES.filter((entry) => present.has(entry));
  const evidenceCoverage = covered.length / EXPECTED_EVIDENCE_CLASSES.length;

  const missing = EXPECTED_EVIDENCE_CLASSES.filter((entry) => !present.has(entry));
  if (missing.length > 0) {
    limitations.push(
      `No evidence from ${missing.map((entry) => entry.toLowerCase()).join(', ')}. A hypothesis supported by one class of sensor is much weaker than the same posterior supported by several.`,
    );
  }

  // -------------------------------------------------------- sensor health
  const sensorHealth =
    input.sensorsExpected > 0
      ? clamp01(input.sensorsHealthy / input.sensorsExpected)
      : // No sensors expected means an uninstrumented vehicle, not a healthy
        // one. Treated as low rather than perfect, because the alternative is
        // reporting maximum confidence for a vehicle nobody is watching.
        0.3;

  if (input.sensorsExpected === 0) {
    limitations.push(
      'No cabin sensors are enrolled against this vehicle. Any conclusion rests on telemetry and identity alone.',
    );
  } else if (input.sensorsHealthy < input.sensorsExpected) {
    limitations.push(
      `${input.sensorsExpected - input.sensorsHealthy} of ${input.sensorsExpected} cabin sensors were not contributing.`,
    );
  }

  // ----------------------------------------------------- data sufficiency
  const dataSufficiency = clamp01(input.observationCount / SUFFICIENT_OBSERVATIONS);

  if (input.observationCount === 0) {
    limitations.push(
      'No admitted observations. The posterior is the prior — this is what the engine believes before looking, not a finding.',
    );
  } else if (input.observationCount < SUFFICIENT_OBSERVATIONS) {
    limitations.push(
      `Only ${input.observationCount} observation${input.observationCount === 1 ? '' : 's'} cleared the admission gates.`,
    );
  }

  // ------------------------------------------------------- calibration
  const fitted =
    !SIGNAL_CALIBRATION_SOURCE.startsWith('structured-estimates') &&
    !LIKELIHOOD_SOURCE.startsWith('structured-estimates') &&
    !HYPOTHESIS_PRIOR_SOURCE.startsWith('structured-estimates');

  const calibrationTrust = fitted ? 1 : UNFITTED_CALIBRATION_CEILING;

  if (!fitted) {
    limitations.push(
      'Priors and likelihoods are structured estimates, not values fitted to this deployment. Relative ordering is defensible; absolute probabilities are not.',
    );
  }

  if (input.discrimination < 0.3) {
    limitations.push(
      'The posterior is close to flat — several explanations fit the evidence about equally well. This is a result, not a fault, and it means a human should look rather than that nothing is happening.',
    );
  }

  /**
   * The composite is a **geometric** mean, not arithmetic.
   *
   * Any single collapsed factor should collapse the whole figure. An engine
   * with perfect sensor health, full coverage and fitted calibration that has
   * seen zero observations knows nothing, and an arithmetic mean would still
   * report 0.75. The geometric mean reports near zero, which is the truth.
   */
  const overall = geometricMean([
    evidenceCoverage,
    sensorHealth,
    calibrationTrust,
    dataSufficiency,
  ]);

  return {
    overall: round3(overall),
    evidenceCoverage: round3(evidenceCoverage),
    sensorHealth: round3(sensorHealth),
    calibrationTrust: round3(calibrationTrust),
    dataSufficiency: round3(dataSufficiency),
    discrimination: round3(input.discrimination),
    limitations,
  };
}

/**
 * Whether a low-probability result may be reported as an all-clear.
 *
 * False when confidence is poor. "Nothing detected" from a healthy sensor suite
 * is reassurance; the same words from a vehicle whose cameras are all obscured
 * is the opposite, and the console must not render them identically.
 */
export function isTrustworthyAllClear(confidence: DecisionConfidence): boolean {
  return confidence.overall >= 0.5 && confidence.sensorHealth >= 0.5;
}

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) return 0;

  // A zero factor makes the product zero, which is the intended behaviour —
  // guarded only against a negative slipping in from a bad input.
  const product = values.reduce((total, value) => total * clamp01(value), 1);

  return Math.pow(product, 1 / values.length);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
