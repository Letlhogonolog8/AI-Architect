import {
  IdentityBand,
  IncidentSeverity,
  type IdentityPolicy,
  type OccupancyAssessment,
} from '@aegisdrive/types';

/**
 * What the platform may do at each identity band.
 *
 * ## The constraint this file exists to enforce
 *
 * **`permitAutonomousImmobilisation` is `false` on every band, and the type
 * makes it impossible to set otherwise.**
 *
 * Face recognition has well-documented, demographically uneven error rates. In
 * a product that can stop a vehicle, a false reject is not an inconvenience —
 * immobilising a car on a highway can kill someone, and the burden would fall
 * hardest on the drivers the models serve worst. There is no confidence
 * threshold at which a biometric mismatch alone justifies that.
 *
 * So the strongest automated response to an identity signal is *escalating it
 * to a human*. Immobilisation stays behind `vehicle:immobilise`, a written
 * justification, and an operator who has seen the corroborating evidence.
 *
 * The field is typed `false` rather than `boolean` so that a future change
 * cannot quietly flip it — it has to be a deliberate type change that shows up
 * in review.
 */

export const IDENTITY_POLICY_VERSION = 'identity-policy-v1' as const;

export const IDENTITY_POLICIES: Readonly<Record<IdentityBand, IdentityPolicy>> = Object.freeze({
  [IdentityBand.VERIFIED]: {
    band: IdentityBand.VERIFIED,
    raiseAlert: false,
    alertSeverity: null,
    challengeDriver: false,
    escalateCapture: false,
    openIncident: false,
    permitAutonomousImmobilisation: false,
    description:
      'Multiple modalities agree. Normal operation; nothing is surfaced to the control room.',
  },

  [IdentityBand.PROBABLE]: {
    band: IdentityBand.PROBABLE,
    raiseAlert: false,
    alertSeverity: null,
    challengeDriver: false,
    escalateCapture: false,
    openIncident: false,
    permitAutonomousImmobilisation: false,
    description:
      'Consistent with the enrolled driver on thinner evidence — typically one sensor unavailable. No action; the engine keeps sampling.',
  },

  [IdentityBand.UNCERTAIN]: {
    band: IdentityBand.UNCERTAIN,
    raiseAlert: false,
    alertSeverity: null,
    // A challenge, not an alert. Uncertainty is overwhelmingly a sensor
    // problem — a dark cabin, a noisy road — and alerting on it would bury the
    // control room in noise until they stopped reading identity alerts at all.
    challengeDriver: true,
    escalateCapture: true,
    openIncident: false,
    permitAutonomousImmobilisation: false,
    description:
      'Not enough evidence either way. The driver is asked to confirm identity and capture rate increases. Nothing is raised to the control room yet.',
  },

  [IdentityBand.SUSPECT]: {
    band: IdentityBand.SUSPECT,
    raiseAlert: true,
    alertSeverity: IncidentSeverity.HIGH,
    challengeDriver: true,
    escalateCapture: true,
    openIncident: false,
    permitAutonomousImmobilisation: false,
    description:
      'Evidence actively contradicts the enrolled driver. An operator is alerted and the driver is challenged. No incident is opened automatically — an operator decides.',
  },

  [IdentityBand.IMPOSTOR]: {
    band: IdentityBand.IMPOSTOR,
    raiseAlert: true,
    alertSeverity: IncidentSeverity.CRITICAL,
    // Not challenged. At this band the working assumption is that the person
    // holding the phone is not the driver, and a challenge would tell them the
    // system has noticed.
    challengeDriver: false,
    escalateCapture: true,
    openIncident: true,
    permitAutonomousImmobilisation: false,
    description:
      'Strong evidence of a different person, or a detected spoof. An incident is opened and the control room is alerted at critical severity. Immobilisation remains an operator decision.',
  },
});

export function policyFor(band: IdentityBand): IdentityPolicy {
  return IDENTITY_POLICIES[band];
}

/**
 * Occupancy tolerance.
 *
 * One extra occupant is unremarkable — a colleague, a lift, a passenger the
 * trip did not declare. Two or more above expectation is the pattern worth
 * looking at, because a hijacking typically adds several people at once.
 */
const OCCUPANCY_TOLERANCE = 1;

export function isOccupancyUnexpected(occupancy: OccupancyAssessment): boolean {
  if (occupancy.expectedCount === null) return false;

  // A low-confidence count in a dark cabin is not evidence of anything.
  if (occupancy.confidence < 0.6) return false;

  return occupancy.occupantCount > occupancy.expectedCount + OCCUPANCY_TOLERANCE;
}

/**
 * Combines identity and occupancy into the effective response.
 *
 * Occupancy can only ever *escalate*. A verified driver with three unexpected
 * passengers is worth an operator's attention; the same driver alone is not.
 * It cannot de-escalate — a correct occupancy count says nothing about who is
 * behind the wheel.
 */
export function effectivePolicy(
  band: IdentityBand,
  occupancy: OccupancyAssessment | null,
): IdentityPolicy {
  const base = policyFor(band);

  if (!occupancy || !isOccupancyUnexpected(occupancy)) return base;

  if (band === IdentityBand.VERIFIED || band === IdentityBand.PROBABLE) {
    return {
      ...base,
      raiseAlert: true,
      alertSeverity: IncidentSeverity.MEDIUM,
      escalateCapture: true,
      description: `${base.description} Escalated: ${occupancy.occupantCount} occupants detected against ${occupancy.expectedCount ?? 0} expected.`,
    };
  }

  return {
    ...base,
    alertSeverity: IncidentSeverity.CRITICAL,
    openIncident: true,
    description: `${base.description} Escalated: unexpected occupancy alongside an identity mismatch.`,
  };
}
