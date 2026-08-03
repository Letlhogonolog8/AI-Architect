import {
  SeatEvidenceSource,
  SeatPosition,
  SeatState,
  type OccupancyCount,
  type SeatOccupancy,
} from '@aegisdrive/types';

/**
 * Occupant counting and seat fusion.
 *
 * ## Counting, and only counting
 *
 * ADR-0007 decision 4 established that occupants are counted and never
 * identified. This is where that becomes enforceable rather than aspirational:
 * the functions below take counts and seat states and return counts and seat
 * states. There is no parameter here that could carry an embedding, and no
 * return value that could carry an attribute.
 *
 * The operationally decisive signal — "there are four people in a vehicle that
 * should have one" — needs no identification whatsoever.
 *
 * ## Why raw counts are never used directly
 *
 * Per-frame occupant counts flicker badly in real cabins. An occupant leans out
 * of frame, a headrest occludes a face, a rear passenger is briefly lost to
 * glare. A system that alerted on the instantaneous count would report a
 * phantom passenger several times per trip, and operators would learn within a
 * week to ignore occupancy alerts entirely.
 *
 * So the count is stabilised with hysteresis before anything downstream sees it.
 */

export const OCCUPANCY_MODEL_VERSION = 'occupancy-v1' as const;

/**
 * Consecutive observations required to accept a *rise* in the count.
 *
 * Low, because under-counting is the dangerous error. A hijacking adds
 * occupants, and every observation spent confirming is a second the control
 * room does not have.
 */
const RISE_CONFIRMATIONS = 2;

/**
 * Consecutive observations required to accept a *fall*.
 *
 * Deliberately higher than `RISE_CONFIRMATIONS`, and the asymmetry is the whole
 * design. An occupant who disappears from view has usually been occluded, not
 * removed; accepting that quickly would let the count drop back to normal in
 * the middle of an incident and silently withdraw the evidence.
 *
 * The asymmetry biases toward over-reporting occupants, which produces a
 * recoverable false alarm rather than an unrecoverable silence.
 */
const FALL_CONFIRMATIONS = 5;

/**
 * One extra occupant is unremarkable — a colleague, a lift, a passenger the trip
 * did not declare. Two or more above expectation is the pattern worth looking
 * at, because a hijacking typically adds several people at once.
 *
 * Matches `OCCUPANCY_TOLERANCE` in `identity/policy.ts`; both engines must
 * agree on what "unexpected" means or an operator sees two different answers to
 * the same question.
 */
const OCCUPANCY_TOLERANCE = 1;

/** Below this the count is reported but flagged as untrustworthy. */
const MINIMUM_COUNT_CONFIDENCE = 0.6;

/**
 * Rolling state the stabiliser carries between observations.
 *
 * Held by the caller rather than in module state so that a replay reproduces
 * the original sequence exactly, and so two vehicles cannot contaminate each
 * other's counts.
 */
export interface OccupancyTrackerState {
  stableCount: number;
  /** The count currently accumulating confirmations, if it differs from stable. */
  pendingCount: number | null;
  pendingObservations: number;
  stableSinceMs: number;
}

export function initialTrackerState(count: number, nowMs: number): OccupancyTrackerState {
  return {
    stableCount: count,
    pendingCount: null,
    pendingObservations: 0,
    stableSinceMs: nowMs,
  };
}

export interface OccupancyObservation {
  instantaneousCount: number;
  /** 0-1 confidence in this frame's count. */
  confidence: number;
  seats: readonly SeatOccupancy[];
  expectedCount: number | null;
  /** Seats no sensor could resolve this window. */
  unobservedPositions: readonly SeatPosition[];
  observedAtMs: number;
}

export interface StabilisedOccupancy {
  count: OccupancyCount;
  state: OccupancyTrackerState;
}

/**
 * Folds one observation into the stabilised count.
 *
 * A low-confidence observation does not reset the pending run and does not
 * contribute to it — it is skipped. Treating a glare-blinded frame as
 * "confirmed zero occupants" would be worse than ignoring it, and treating it
 * as a contradiction would make the count impossible to move during exactly the
 * lighting conditions a hijacking is likely to happen in.
 */
export function stabiliseOccupancy(
  observation: OccupancyObservation,
  previous: OccupancyTrackerState,
): StabilisedOccupancy {
  let state = { ...previous };

  if (observation.confidence >= MINIMUM_COUNT_CONFIDENCE) {
    state = advance(state, observation.instantaneousCount, observation.observedAtMs);
  }

  const stableForSeconds = Math.max(0, (observation.observedAtMs - state.stableSinceMs) / 1000);

  const unexpected =
    observation.expectedCount !== null &&
    observation.confidence >= MINIMUM_COUNT_CONFIDENCE &&
    state.stableCount > observation.expectedCount + OCCUPANCY_TOLERANCE;

  return {
    state,
    count: {
      instantaneousCount: observation.instantaneousCount,
      stableCount: state.stableCount,
      expectedCount: observation.expectedCount,
      seats: [...observation.seats],
      confidence: round3(effectiveConfidence(observation, stableForSeconds)),
      stableForSeconds: round3(stableForSeconds),
      unexpectedOccupancy: unexpected,
      unobservedPositions: [...observation.unobservedPositions],
      modelId: OCCUPANCY_MODEL_VERSION,
      countedAt: new Date(observation.observedAtMs).toISOString(),
    },
  };
}

function advance(
  state: OccupancyTrackerState,
  observed: number,
  nowMs: number,
): OccupancyTrackerState {
  if (observed === state.stableCount) {
    // Agreement clears any pending change. A single stray frame should not
    // accumulate toward a transition across an entire trip.
    return { ...state, pendingCount: null, pendingObservations: 0 };
  }

  if (state.pendingCount !== observed) {
    return { ...state, pendingCount: observed, pendingObservations: 1 };
  }

  const observations = state.pendingObservations + 1;
  const required = observed > state.stableCount ? RISE_CONFIRMATIONS : FALL_CONFIRMATIONS;

  if (observations < required) {
    return { ...state, pendingObservations: observations };
  }

  return {
    stableCount: observed,
    pendingCount: null,
    pendingObservations: 0,
    stableSinceMs: nowMs,
  };
}

/**
 * Confidence in the *stable* count, which is not the confidence of the frame.
 *
 * A count that has only just settled is less trustworthy than one that has held
 * for a minute, however clean the current frame is. Unobserved seats cap it
 * outright — "we counted two" and "we counted two and could not see the back
 * row" must not report the same confidence.
 */
function effectiveConfidence(observation: OccupancyObservation, stableForSeconds: number): number {
  const settling = Math.min(1, 0.5 + stableForSeconds / 60);

  const observable = 5 - observation.unobservedPositions.length;
  const coverage = Math.max(0, observable / 5);

  return clamp01(observation.confidence * settling * coverage);
}

// ============================================================================
// Seat fusion
// ============================================================================

export interface SeatEvidence {
  position: SeatPosition;
  /** Vision's read, or null when the seat could not be seen. */
  vision: { state: SeatState; confidence: number } | null;
  /** Weight sensor, where the vehicle has one. */
  weightSensorOccupied: boolean | null;
  beltFastened: boolean | null;
}

/**
 * Fuses seat evidence from vision, weight and belt sensors.
 *
 * ## Conflicts are kept, not averaged
 *
 * When vision says empty and the weight sensor says occupied, the result is
 * `OCCUPIED` with `conflicted: true` — not a blended confidence, and not a
 * silent preference for whichever number is higher.
 *
 * The asymmetry is deliberate: **a weight sensor cannot be occluded and vision
 * can.** Vision missing an occupant is routine — a rear passenger leaning
 * forward, a blanket, glare. A weight sensor reporting mass with nobody there
 * is a hardware fault, which is rarer. So physical presence wins, and the
 * disagreement is surfaced so an operator can see the two disagreed rather than
 * being handed a number that quietly picked a side.
 */
export function fuseSeat(evidence: SeatEvidence): SeatOccupancy {
  const { vision, weightSensorOccupied, beltFastened } = evidence;

  const sources = [vision !== null, weightSensorOccupied !== null, beltFastened !== null].filter(
    Boolean,
  ).length;

  if (sources === 0) {
    return {
      position: evidence.position,
      state: SeatState.UNKNOWN,
      confidence: 0,
      source: SeatEvidenceSource.VISION,
      conflicted: false,
      beltFastened: null,
    };
  }

  // Physical presence beats vision, for the reason above.
  if (weightSensorOccupied === true) {
    const conflicted = vision !== null && vision.state === SeatState.EMPTY;

    return {
      position: evidence.position,
      state: SeatState.OCCUPIED,
      confidence: conflicted ? 0.8 : 0.95,
      source: sources > 1 ? SeatEvidenceSource.FUSED : SeatEvidenceSource.WEIGHT_SENSOR,
      conflicted,
      beltFastened,
    };
  }

  if (weightSensorOccupied === false && vision?.state === SeatState.OCCUPIED) {
    // Vision sees a person on a seat reporting no mass. Most often a bag
    // misread as an occupant, occasionally a child below the sensor threshold.
    // Reported as OBJECT with the conflict visible rather than resolved either
    // way, because both readings are plausible and the difference matters.
    return {
      position: evidence.position,
      state: SeatState.OBJECT,
      confidence: 0.5,
      source: SeatEvidenceSource.FUSED,
      conflicted: true,
      beltFastened,
    };
  }

  if (vision !== null) {
    return {
      position: evidence.position,
      state: vision.state,
      confidence: vision.confidence,
      source: sources > 1 ? SeatEvidenceSource.FUSED : SeatEvidenceSource.VISION,
      conflicted: false,
      beltFastened,
    };
  }

  // Belt alone. Weak: a fastened belt behind an empty seat is a common trick to
  // silence the chime, so it raises no more than a possibility.
  if (beltFastened === true) {
    return {
      position: evidence.position,
      state: SeatState.UNKNOWN,
      confidence: 0.3,
      source: SeatEvidenceSource.BELT_SENSOR,
      conflicted: false,
      beltFastened,
    };
  }

  return {
    position: evidence.position,
    state: weightSensorOccupied === false ? SeatState.EMPTY : SeatState.UNKNOWN,
    confidence: weightSensorOccupied === false ? 0.85 : 0,
    source: SeatEvidenceSource.WEIGHT_SENSOR,
    conflicted: false,
    beltFastened,
  };
}

/** Seats whose state no sensor could establish. */
export function unobservedSeats(seats: readonly SeatOccupancy[]): SeatPosition[] {
  return seats.filter((seat) => seat.state === SeatState.UNKNOWN).map((seat) => seat.position);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
