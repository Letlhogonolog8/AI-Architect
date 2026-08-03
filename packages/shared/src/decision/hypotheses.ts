import { ThreatHypothesis } from '@aegisdrive/types';

/**
 * Hypothesis priors.
 *
 * ## Why these numbers are so lopsided
 *
 * Because reality is. Across a fleet's trip-hours, almost nothing happens. The
 * priors below say so explicitly, and every posterior the engine produces is
 * dominated by them until the evidence is genuinely strong.
 *
 * That is the correct behaviour and it is the thing most systems in this
 * category get wrong. A detector tuned to feel responsive — one that reaches
 * "probable hijacking" on a raised voice and an unrecognised face — is a
 * detector that has quietly assumed hijackings are common. They are not, and
 * the arithmetic should not pretend otherwise.
 *
 * ## The ordering matters more than the magnitudes
 *
 * Read down the list: **sensors fail more often than people are hijacked, and
 * colleagues borrow vehicles more often than either.** Those two facts do more
 * work in this engine than any likelihood ratio, because they are what stop a
 * dark camera and an unrecognised face from adding up to an armed response.
 *
 * ## Where these come from, and what that means
 *
 * `SENSOR_FAILURE` and `UNAUTHORISED_USE` are estimated from ordinary fleet
 * operations and are the two that a deployment can actually measure quickly —
 * both produce observable ground truth within weeks. `HIJACKING` and `THEFT`
 * derive from national crime statistics against estimated vehicle-hours, the
 * same basis as `DEFAULT_BASE_RATE_PER_TRIP_HOUR` in the behaviour engine.
 * `MEDICAL`, `COLLISION` and `DURESS` are structured estimates.
 *
 * They must be refitted per deployment. A cash-in-transit fleet at night and a
 * suburban delivery round do not share a prior on any row of this table, and
 * the same evidence means different things to each.
 */

export const HYPOTHESIS_PRIOR_SOURCE = 'structured-estimates-v1' as const;

/**
 * Prior probability that each hypothesis is true, per trip-hour.
 *
 * Sums to 1. `NORMAL` is defined as the remainder rather than stated, so the
 * distribution cannot silently stop being a distribution when someone edits a
 * row.
 */
const NON_NORMAL_PRIORS: Readonly<Record<Exclude<ThreatHypothesis, 'NORMAL'>, number>> =
  Object.freeze({
    // Cameras get dirty, microphones saturate, connectors vibrate loose. By a
    // wide margin the most common non-normal explanation for alarming evidence,
    // and the reason this hypothesis exists at all.
    [ThreatHypothesis.SENSOR_FAILURE]: 1.5e-4,

    // A colleague, a relief shift, a family member. Common, entirely legitimate,
    // and the single most likely explanation for an unrecognised driver.
    [ThreatHypothesis.UNAUTHORISED_USE]: 2.0e-5,

    [ThreatHypothesis.COLLISION]: 1.0e-5,

    // National carjacking statistics against estimated vehicle-hours. Matches
    // the behaviour engine's default base rate.
    [ThreatHypothesis.HIJACKING]: 5.0e-6,
    [ThreatHypothesis.THEFT]: 3.0e-6,

    [ThreatHypothesis.MEDICAL]: 2.0e-6,
    // Coercion without the vehicle being taken. Rarer than hijacking and much
    // harder to see, because the vehicle behaves normally throughout.
    [ThreatHypothesis.DURESS]: 1.0e-6,
  });

export const HYPOTHESIS_PRIORS: Readonly<Record<ThreatHypothesis, number>> = Object.freeze({
  ...NON_NORMAL_PRIORS,
  [ThreatHypothesis.NORMAL]:
    1 - Object.values(NON_NORMAL_PRIORS).reduce((total, prior) => total + prior, 0),
});

export const ALL_HYPOTHESES: readonly ThreatHypothesis[] = Object.freeze([
  ThreatHypothesis.NORMAL,
  ThreatHypothesis.SENSOR_FAILURE,
  ThreatHypothesis.UNAUTHORISED_USE,
  ThreatHypothesis.COLLISION,
  ThreatHypothesis.HIJACKING,
  ThreatHypothesis.THEFT,
  ThreatHypothesis.MEDICAL,
  ThreatHypothesis.DURESS,
]);

/** Human-facing labels. Used in explanations and on the console. */
export const HYPOTHESIS_LABEL: Readonly<Record<ThreatHypothesis, string>> = Object.freeze({
  [ThreatHypothesis.NORMAL]: 'Normal operation',
  [ThreatHypothesis.SENSOR_FAILURE]: 'Sensor failure',
  [ThreatHypothesis.UNAUTHORISED_USE]: 'Unauthorised but uncoerced driver',
  [ThreatHypothesis.COLLISION]: 'Collision',
  [ThreatHypothesis.HIJACKING]: 'Hijacking in progress',
  [ThreatHypothesis.THEFT]: 'Vehicle theft',
  [ThreatHypothesis.MEDICAL]: 'Medical emergency',
  [ThreatHypothesis.DURESS]: 'Driver under duress',
});

/**
 * Applies a per-deployment scaling to the priors.
 *
 * A cash-in-transit fleet running night routes faces a hijacking prior orders
 * of magnitude above the default. Rather than let a deployment edit the table —
 * which loses the provenance and the normalisation — it supplies multipliers,
 * and the result is renormalised here.
 *
 * `NORMAL` is recomputed as the remainder, so a deployment cannot accidentally
 * produce a distribution that does not sum to 1 and get a silently wrong
 * posterior out of it.
 */
export function scalePriors(
  multipliers: Partial<Record<ThreatHypothesis, number>>,
): Readonly<Record<ThreatHypothesis, number>> {
  const scaled: Record<string, number> = {};
  let nonNormalTotal = 0;

  for (const hypothesis of ALL_HYPOTHESES) {
    if (hypothesis === ThreatHypothesis.NORMAL) continue;

    const multiplier = Math.max(0, multipliers[hypothesis] ?? 1);
    const prior = HYPOTHESIS_PRIORS[hypothesis] * multiplier;

    scaled[hypothesis] = prior;
    nonNormalTotal += prior;
  }

  // A deployment that scales its priors past 1 in total has described a fleet
  // where something goes wrong every hour. Clamped rather than rejected: the
  // sensible reading is "almost always something", not an error, and refusing
  // would leave a misconfigured tenant with no decisions at all.
  if (nonNormalTotal >= 0.99) {
    const factor = 0.99 / nonNormalTotal;
    for (const key of Object.keys(scaled)) scaled[key] *= factor;
    nonNormalTotal = 0.99;
  }

  scaled[ThreatHypothesis.NORMAL] = 1 - nonNormalTotal;

  return Object.freeze(scaled as Record<ThreatHypothesis, number>);
}
