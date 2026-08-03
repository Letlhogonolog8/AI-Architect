import {
  BehaviourSignal,
  IdentityBand,
  ThreatEvidenceClass,
  type BehaviourObservation,
  type DuressAssessment,
  type ISODateString,
  type ThreatContribution,
  type ThreatScore,
} from '@aegisdrive/types';
import { riskScoreToThreatLevel } from '../utils/risk';
import { SIGNAL_CALIBRATION, admitObservation, effectiveLikelihoodRatio } from './catalogue';

/**
 * Threat scoring.
 *
 * Combines cabin behaviour, identity, context and physical vehicle state into
 * the number an operator acts on.
 *
 * ## The arithmetic
 *
 * Evidence combines as a product of likelihood ratios, which is a sum in log
 * space:
 *
 *     log10(LR_total) = Σ  log10(LR_i)
 *     posterior odds  = prior odds × LR_total
 *
 * Same machinery as the Continuous Identity Engine, and for the same reason:
 * likelihood ratios are the only representation in which independent evidence
 * combines correctly. Assigning "points" to signals and adding them produces a
 * number with no probabilistic meaning, which is then displayed next to a
 * percentage sign as though it had one.
 *
 * ## The base rate, which is the whole problem
 *
 * Hijacking is rare. South Africa records on the order of 22,000 carjackings a
 * year against several billion vehicle-hours of driving — roughly **one event
 * per 200,000 trip-hours**. Any detector operating against a base rate that low
 * spends almost all of its firings being wrong, no matter how good it is.
 *
 * Concretely, at the default base rate, with the calibration in this file:
 *
 *     score 65 (HIGH)    → LR ~400    → PPV ~0.2%
 *     score 85 (SEVERE)  → LR ~2,500  → PPV ~1.2%
 *     score 100          → LR 10,000  → PPV ~4.8%
 *
 * **Even maximal evidence leaves the alarm far more likely to be false than
 * true.** That is not a failure of this engine; it is what a low base rate does
 * to any detector, and a product claiming a confident hijacking call on a
 * general fleet is either hiding the base rate or has not computed it.
 *
 * It is also why `baseRatePerTripHour` is configurable and recorded. On a fleet
 * whose actual rate is one event per 1,000 trip-hours — cash-in-transit, night
 * routes — the same numbers become operationally decisive:
 *
 *     score 65  → PPV ~29%
 *     score 85  → PPV ~71%
 *
 * Same evidence, same arithmetic, completely different meaning. Getting the base
 * rate right for a deployment matters more than any other number here.
 *
 * So the engine reports **both**:
 *
 *   - `score`, 0-100, evidence strength — what drives the band and the response.
 *   - `positivePredictiveValue` — how often evidence this strong is real.
 *
 * An operator who sees only the first will dispatch armed responders to a
 * citizen. An operator who sees both will send someone to look. The second
 * number is the one that keeps this product from hurting people, and it is
 * displayed on every assessment rather than buried in a settings page.
 *
 * The score still drives the response, and deliberately so — waiting for a
 * PPV above 50% on a general fleet would mean never responding at all. The
 * point of the PPV is to set the *kind* of response, not to gate it: a 0.2%
 * posterior justifies a phone call, not a firearm.
 *
 * ## Corroboration
 *
 * A high score requires evidence from more than one class. One failing sensor
 * generates a pile of mutually consistent signals that look overwhelming and
 * are in fact one broken camera. Independent classes are what make agreement
 * informative, so a score built entirely from a single class is capped — and
 * the cap is reported, not applied silently.
 */

export const THREAT_POLICY_VERSION = 'threat-score-v1' as const;

/**
 * Events per trip-hour, absent a tenant-specific figure.
 *
 * Derived from national carjacking statistics against estimated national
 * vehicle-hours. It is an order-of-magnitude estimate and is recorded on every
 * assessment precisely because it is a choice: a fleet running cash-in-transit
 * routes at night faces a base rate orders of magnitude higher than a suburban
 * commuter, and the same evidence means something different for each.
 *
 * Configure per deployment. Do not leave this at the default and then read the
 * PPV as though it described your fleet.
 */
export const DEFAULT_BASE_RATE_PER_TRIP_HOUR = 5e-6;

/**
 * Ceiling on total log10 LR, and the denominator of the 0-100 display mapping.
 *
 * Set to match what the evidence model can actually produce, not to a round
 * number. Per-signal contributions are capped at 1.3 log10 units and discounted
 * geometrically within a class, so a realistic corroborated event — hands
 * raised, a door open at speed, several occupants entering at once, identity
 * suspect — accumulates around 2.5-3.0. A ceiling well above that would compress
 * every real assessment into the bottom third of the scale and the engine would
 * never alert; a ceiling below it would saturate on ordinary traffic.
 *
 * At 4.0 the bands land where they should: that corroborated event reaches HIGH,
 * a single failing sensor's worth of correlated signals reaches the
 * single-class cap, and SEVERE requires evidence this catalogue can only reach
 * with genuine multi-class corroboration.
 *
 * This constant is a **calibration decision, not a formatting one.** Changing it
 * moves every band for every fleet.
 */
const MAXIMUM_TOTAL_LOG_LR = 4;

/** Score at which a single-class assessment is capped. Top of ELEVATED. */
const SINGLE_CLASS_SCORE_CAP = 55;

/**
 * Discount applied per additional signal within the same class.
 *
 * Signals in one class are strongly correlated — a struggle trips every motion
 * detector at once, and that is one event, not four. The strongest keeps full
 * weight, the second 0.6, the third 0.36, and so on. Steeper than the identity
 * engine's 0.75 because behaviour signals within a class share not just error
 * modes but their underlying cause.
 */
const WITHIN_CLASS_DISCOUNT = 0.6;

/**
 * Identity band as a likelihood ratio.
 *
 * Note that `VERIFIED` is only mildly exculpatory rather than strongly so, and
 * that is the important entry in this table. Confirming the enrolled driver is
 * behind the wheel is decent evidence against *vehicle theft* and almost no
 * evidence against *hijacking*, because in a hijacking the driver is usually
 * still in the car — that is what makes it a hijacking rather than a theft.
 * A system that treated a verified face as reassurance would go quiet at
 * exactly the wrong moment.
 */
const IDENTITY_LIKELIHOOD_RATIO: Readonly<Record<IdentityBand, number>> = Object.freeze({
  [IdentityBand.VERIFIED]: 0.7,
  [IdentityBand.PROBABLE]: 0.9,
  [IdentityBand.UNCERTAIN]: 1.0,
  [IdentityBand.SUSPECT]: 6,
  [IdentityBand.IMPOSTOR]: 30,
});

/** Non-behavioural evidence supplied by the caller. */
export interface ContextualEvidence {
  evidenceClass: ThreatEvidenceClass;
  /** Stable identifier, e.g. a `ThreatEventType` or `PANIC_BUTTON`. */
  source: string;
  likelihoodRatio: number;
  /** 0-1. Shrinks the ratio toward 1. */
  confidence: number;
  observedAt: ISODateString;
  halfLifeSeconds: number;
  description: string;
}

export interface ThreatScoreInput {
  observations: readonly BehaviourObservation[];
  identityBand?: IdentityBand | null;
  identityAssessedAt?: ISODateString | null;
  context?: readonly ContextualEvidence[];
  /** Override the default. Should be set per tenant and per operating profile. */
  baseRatePerTripHour?: number;
  /** Injectable so a replay reproduces the original score exactly. */
  now?: Date;
}

export function scoreThreat(input: ThreatScoreInput): ThreatScore {
  const now = input.now ?? new Date();
  const baseRate = input.baseRatePerTripHour ?? DEFAULT_BASE_RATE_PER_TRIP_HOUR;

  const contributions: ThreatContribution[] = [];

  // ------------------------------------------------------------- behaviour
  for (const observation of selectStrongestPerSignal(input.observations)) {
    const ageSeconds = ageInSeconds(observation.observedAt, now);
    const admission = admitObservation(observation, ageSeconds);

    if (!admission.admitted) continue;

    const calibration = SIGNAL_CALIBRATION[observation.signal];
    const lr = effectiveLikelihoodRatio(observation, ageSeconds);

    contributions.push({
      evidenceClass: calibration.evidenceClass,
      source: observation.signal,
      likelihoodRatio: lr,
      weight: 1,
      contribution: Math.log10(lr),
      ageSeconds,
      description: calibration.description,
    });
  }

  // -------------------------------------------------------------- identity
  if (input.identityBand) {
    const lr = IDENTITY_LIKELIHOOD_RATIO[input.identityBand];
    const ageSeconds = input.identityAssessedAt ? ageInSeconds(input.identityAssessedAt, now) : 0;

    contributions.push({
      evidenceClass: ThreatEvidenceClass.IDENTITY,
      source: `IDENTITY_${input.identityBand}`,
      likelihoodRatio: lr,
      weight: 1,
      contribution: Math.log10(lr),
      ageSeconds,
      description: `Driver identity assessed as ${input.identityBand.toLowerCase()}`,
    });
  }

  // ------------------------------------------------------- context/physical
  for (const evidence of input.context ?? []) {
    const ageSeconds = ageInSeconds(evidence.observedAt, now);
    const decay = Math.pow(0.5, ageSeconds / Math.max(1, evidence.halfLifeSeconds));

    // Shrink toward 1, never toward 0 — a stale or low-confidence contextual
    // signal is uninformative, not exculpatory.
    const shrink = clamp01(evidence.confidence * decay);
    const lr = 1 + (evidence.likelihoodRatio - 1) * shrink;

    if (Math.abs(Math.log10(lr)) < 0.01) continue;

    contributions.push({
      evidenceClass: evidence.evidenceClass,
      source: evidence.source,
      likelihoodRatio: lr,
      weight: shrink,
      contribution: Math.log10(lr),
      ageSeconds,
      description: evidence.description,
    });
  }

  const discounted = applyWithinClassDiscount(contributions);

  const rawLogLr = discounted.reduce((total, entry) => total + entry.contribution, 0);
  const logLr = Math.min(MAXIMUM_TOTAL_LOG_LR, rawLogLr);

  // Evidence strength on a 0-100 scale. A display mapping of the log LR, not a
  // probability — the probability is `positivePredictiveValue` below, and the
  // two are deliberately kept apart.
  const rawScore = Math.round((Math.max(0, logLr) / MAXIMUM_TOTAL_LOG_LR) * 100);

  const corroborating = [
    ...new Set(
      discounted.filter((entry) => entry.contribution > 0).map((entry) => entry.evidenceClass),
    ),
  ];

  const capped = applyCorroborationCap(rawScore, corroborating);

  return {
    score: capped.score,
    level: riskScoreToThreatLevel(capped.score),
    positivePredictiveValue: posteriorProbability(baseRate, logLr),
    baseRatePerTripHour: baseRate,
    logLikelihoodRatio: round3(logLr),
    contributions: discounted.sort((a, b) => b.contribution - a.contribution),
    corroboratingClasses: corroborating,
    corroborationCapped: capped.capped,
    capReason: capped.reason,
    explanation: explainThreat(discounted, capped, baseRate, logLr),
    scoredAt: now.toISOString(),
    policyVersion: THREAT_POLICY_VERSION,
  };
}

/**
 * Posterior probability that the event is genuine.
 *
 *     posterior odds = prior odds × LR
 *     P = odds / (1 + odds)
 *
 * The number this returns is usually small, and it is supposed to be. See the
 * base-rate discussion at the top of this file.
 */
export function posteriorProbability(baseRate: number, logLikelihoodRatio: number): number {
  const prior = Math.min(0.5, Math.max(1e-9, baseRate));
  const priorOdds = prior / (1 - prior);
  const posteriorOdds = priorOdds * Math.pow(10, logLikelihoodRatio);

  return round4(posteriorOdds / (1 + posteriorOdds));
}

/**
 * Caps a score built from a single evidence class.
 *
 * The exemption for `EXPLICIT` is the one place a single class may carry a high
 * score, and it is not an inference: a driver pressing the panic button or
 * speaking their duress phrase is testimony. Doubting it because no camera
 * agreed would defeat the point of giving them the button.
 */
function applyCorroborationCap(
  score: number,
  corroborating: readonly ThreatEvidenceClass[],
): { score: number; capped: boolean; reason: string | null } {
  if (corroborating.includes(ThreatEvidenceClass.EXPLICIT)) {
    return { score, capped: false, reason: null };
  }

  if (corroborating.length >= 2) {
    return { score, capped: false, reason: null };
  }

  if (score <= SINGLE_CLASS_SCORE_CAP) {
    return { score, capped: false, reason: null };
  }

  const only = corroborating[0] ?? 'none';

  return {
    score: SINGLE_CLASS_SCORE_CAP,
    capped: true,
    reason:
      `All supporting evidence came from a single class (${only}), so the score was held at ${SINGLE_CLASS_SCORE_CAP} ` +
      `rather than ${score}. A single failing sensor produces many mutually consistent signals; ` +
      `corroboration from an independent class is required before this engine will report a higher threat.`,
  };
}

/**
 * Discounts correlated evidence within a class.
 *
 * Applied only to positive contributions. Evidence that *lowers* the score is
 * not discounted for correlation — the asymmetry is deliberate, and it errs
 * toward keeping the score up rather than talking it down.
 */
function applyWithinClassDiscount(
  contributions: readonly ThreatContribution[],
): ThreatContribution[] {
  const rankByClass = new Map<ThreatEvidenceClass, Map<string, number>>();

  for (const evidenceClass of new Set(contributions.map((entry) => entry.evidenceClass))) {
    const positives = contributions
      .filter((entry) => entry.evidenceClass === evidenceClass && entry.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution);

    const ranks = new Map<string, number>();
    positives.forEach((entry, index) => ranks.set(entry.source, index));
    rankByClass.set(evidenceClass, ranks);
  }

  return contributions.map((entry) => {
    const rank = rankByClass.get(entry.evidenceClass)?.get(entry.source);
    if (rank === undefined || rank === 0) return entry;

    const discount = Math.pow(WITHIN_CLASS_DISCOUNT, rank);

    return {
      ...entry,
      weight: entry.weight * discount,
      contribution: entry.contribution * discount,
    };
  });
}

/**
 * Only the strongest observation per signal is used.
 *
 * Three detections of raised hands in one window is one fact about the trip,
 * not three independent pieces of evidence. Accumulating them would let a
 * high-frame-rate camera outvote every other sensor by sampling faster.
 */
function selectStrongestPerSignal(
  observations: readonly BehaviourObservation[],
): BehaviourObservation[] {
  const strongest = new Map<BehaviourSignal, BehaviourObservation>();

  for (const observation of observations) {
    const existing = strongest.get(observation.signal);
    const weight = observation.strength * observation.detectorConfidence * observation.quality;

    if (!existing) {
      strongest.set(observation.signal, observation);
      continue;
    }

    const existingWeight = existing.strength * existing.detectorConfidence * existing.quality;

    if (weight > existingWeight) strongest.set(observation.signal, observation);
  }

  return [...strongest.values()];
}

/**
 * Operator-facing explanation.
 *
 * Generated from the contributions rather than written by hand, so it cannot
 * drift from the arithmetic that produced the score. The base-rate line is
 * always present, including on low scores — the caveat is least likely to be
 * read at the moment it matters most.
 */
function explainThreat(
  contributions: readonly ThreatContribution[],
  capped: { score: number; capped: boolean; reason: string | null },
  baseRate: number,
  logLr: number,
): string[] {
  const lines: string[] = [];

  const supporting = contributions
    .filter((entry) => entry.contribution > 0.02)
    .sort((a, b) => b.contribution - a.contribution);

  for (const entry of supporting) {
    lines.push(
      `${entry.description} — raises the odds ${formatMultiple(entry.likelihoodRatio)} (${entry.evidenceClass.toLowerCase()}, ${formatAge(entry.ageSeconds)} old).`,
    );
  }

  const lowering = contributions.filter((entry) => entry.contribution < -0.02);
  for (const entry of lowering) {
    lines.push(`${entry.description} — lowers the odds.`);
  }

  if (supporting.length === 0) {
    lines.push('No evidence above the reporting threshold.');
  }

  if (capped.capped && capped.reason) lines.push(capped.reason);

  const ppv = posteriorProbability(baseRate, logLr);
  lines.push(
    `Against a base rate of one event per ${Math.round(1 / baseRate).toLocaleString('en-ZA')} trip-hours, ` +
      `evidence this strong corresponds to roughly a ${(ppv * 100).toFixed(1)}% probability that an incident is genuinely in progress. ` +
      `Verify before dispatching an armed response.`,
  );

  return lines;
}

// ============================================================================
// Duress
// ============================================================================

/** Signals whose combination is consistent with a driver acting under coercion. */
const COERCION_SIGNALS: readonly BehaviourSignal[] = [
  BehaviourSignal.HANDS_RAISED,
  BehaviourSignal.WRISTS_CONSTRAINED,
  BehaviourSignal.OCCUPANT_ENCROACHING_DRIVER,
  BehaviourSignal.ABNORMAL_STILLNESS,
  BehaviourSignal.PROLONGED_SILENCE_OCCUPIED,
  BehaviourSignal.UNEXPECTED_SPEAKER_COUNT,
  BehaviourSignal.TORSO_TURNED_SUSTAINED,
];

/**
 * Assesses whether the pattern is consistent with duress.
 *
 * ## The distinction this function exists to draw
 *
 * Duress and unauthorised use look similar in the score and call for opposite
 * responses. If identity says the enrolled driver is still at the wheel and the
 * cabin evidence is bad, the working assumption is that the driver is **in the
 * vehicle and being coerced** — so nothing may be surfaced to the cabin, and
 * contact must be made by a channel the attacker cannot observe.
 *
 * If identity says impostor, the driver has most likely been removed, and the
 * situation is a theft or an abduction. The response is different, and treating
 * the two alike would mean either warning an attacker in front of a victim or
 * withholding contact from a driver who is alone and safe.
 *
 * The output is never proof. A driver may be silent because they are tired, and
 * they may be coerced while behaving perfectly normally.
 */
export function assessDuress(
  observations: readonly BehaviourObservation[],
  identityBand: IdentityBand | null,
  threat: ThreatScore,
): DuressAssessment {
  const deliberate = observations.some(
    (observation) => observation.signal === BehaviourSignal.DURESS_PHRASE_SPOKEN,
  );

  const coercion = observations.filter((observation) =>
    COERCION_SIGNALS.includes(observation.signal),
  );

  const basis: string[] = [];

  if (deliberate) {
    basis.push('The driver spoke their enrolled duress phrase.');
  }

  for (const observation of coercion) {
    basis.push(SIGNAL_CALIBRATION[observation.signal].description);
  }

  // The driver is presumed present unless identity actively says otherwise.
  // Absent an identity reading, presuming presence is the cautious choice: it
  // keeps in-vehicle feedback suppressed, and the cost of staying quiet when
  // the driver is safe is far lower than the cost of speaking up when they are
  // not.
  const driverPresumedPresent = identityBand !== IdentityBand.IMPOSTOR;

  const indicated =
    deliberate || (driverPresumedPresent && coercion.length >= 2 && threat.score >= 40);

  let confidence = 0;

  if (deliberate) {
    confidence = 0.9;
  } else if (indicated) {
    // Deliberately modest even when several signals agree. Coercion inferred
    // from posture and silence is a weak claim, and rounding it up would invite
    // an operator to treat it as established.
    confidence = Math.min(0.6, 0.15 * coercion.length + threat.score / 400);
  }

  return {
    indicated,
    confidence: round3(confidence),
    deliberateSignal: deliberate,
    basis,
    suppressInVehicleFeedback: true,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function ageInSeconds(timestamp: string, now: Date): number {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return 0;

  return Math.max(0, (now.getTime() - parsed) / 1000);
}

function formatMultiple(likelihoodRatio: number): string {
  if (likelihoodRatio < 1) return `${(1 / likelihoodRatio).toFixed(1)}× against`;
  return `${likelihoodRatio.toFixed(1)}×`;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
