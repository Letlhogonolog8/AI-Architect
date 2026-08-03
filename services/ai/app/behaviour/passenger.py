"""Passenger behaviour — cabin dynamics.

Derives signals from how the cabin's composition changes: who gets in, when,
how quickly, and whether anyone moves into the driver's space.

## The boundary this module is built around

**Aggregate only. Never per-person.**

ADR-0007 established that passengers are counted and never identified. This
module extends the same boundary from identity to behaviour: there is no
per-passenger profile, no per-passenger score, and no return value here that
could carry one.

A passenger in a ride-share, a colleague catching a lift, a child in the back —
none of them has consented to behavioural analysis, and there is no lawful basis
to build a record of one. Nor is one needed. The operationally decisive signal is
a property of the cabin, not of any individual in it:

    two people entered a stationary vehicle within four seconds,
    the occupant count went from one to three,
    and the driver's hands went up.

That sentence contains everything an operator needs and identifies nobody.

## Seats, not people

`OccupantPosition` is a seat. Tracking by seat is what allows "someone is leaning
into the driver's space" to be distinguished from "a passenger is sitting in the
back", which is a distinction the product genuinely needs. It does not require
knowing who is in the seat, and this module never asks.

Position tracking is also deliberately shallow: it survives one occupant swapping
seats and does not attempt to maintain identity across an occlusion. A tracker
that did would be building exactly the per-person record this boundary excludes.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import structlog

from app.behaviour.schemas import (
    BehaviourObservation,
    BehaviourSignal,
)

logger = structlog.get_logger(__name__)

MODEL_ID = "cabin-dynamics-v1"

#: Seconds within which multiple entries count as one rapid event.
#:
#: Four seconds. Two people getting into a car normally takes longer — doors,
#: bags, a word with the driver. Several occupants inside four seconds is a
#: coordinated entry, which is the pattern worth surfacing.
RAPID_ENTRY_WINDOW_SECONDS = 4.0

#: Occupants entering inside the window before it counts as rapid multi-entry.
RAPID_ENTRY_MINIMUM_OCCUPANTS = 2

#: Speed above which an open door or released belt stops being ordinary.
#:
#: Walking pace. Below this, a door opening is someone getting out at a gate,
#: which happens constantly on delivery routes.
MOTION_SPEED_THRESHOLD_KPH = 8.0


@dataclass(frozen=True)
class OccupancyEvent:
    """A change in cabin composition.

    Carries a seat and a timestamp. Deliberately carries nothing else — no
    embedding, no bounding box, no attribute of the person who caused it.
    """

    at: datetime
    occupant_count: int
    #: Speed at the moment of the change, when telemetry was available.
    speed_kph: float | None = None


@dataclass(frozen=True)
class CabinState:
    """Everything the dynamics rules need, and nothing more."""

    occupant_count: int
    expected_count: int | None
    speed_kph: float | None
    driver_belt_fastened: bool | None
    any_door_open: bool
    #: Recent composition changes, oldest first.
    recent_events: tuple[OccupancyEvent, ...] = ()
    detection_confidence: float = 1.0


def derive_cabin_signals(
    state: CabinState,
    *,
    previous: CabinState | None = None,
    observed_at: datetime | None = None,
) -> list[BehaviourObservation]:
    """Turns a cabin state transition into signals.

    Every rule here is a plain comparison over counts and vehicle state. That is
    the point: cabin dynamics are the most *reliable* evidence class this engine
    produces precisely because they need no inference. A door sensor either
    fired or it did not.
    """
    now = observed_at or datetime.now(UTC)
    observations: list[BehaviourObservation] = []

    moving = (state.speed_kph or 0.0) > MOTION_SPEED_THRESHOLD_KPH
    stationary = (state.speed_kph or 0.0) <= 1.0

    # ----------------------------------------------------- occupancy increase
    if previous is not None and state.occupant_count > previous.occupant_count:
        gained = state.occupant_count - previous.occupant_count

        if stationary:
            observations.append(
                _observation(
                    BehaviourSignal.OCCUPANCY_INCREASE_AT_STOP,
                    # Low strength by design. This is what picking someone up
                    # looks like, and it is only meaningful in combination.
                    strength=min(1.0, gained / 3.0),
                    confidence=state.detection_confidence,
                    duration=0.0,
                    at=now,
                )
            )

    # -------------------------------------------------------- rapid entry
    rapid = _rapid_entry_strength(state.recent_events)
    if rapid is not None:
        observations.append(
            _observation(
                BehaviourSignal.RAPID_MULTI_ENTRY,
                strength=rapid,
                confidence=state.detection_confidence,
                duration=0.0,
                at=now,
            )
        )

    # ------------------------------------------------------------ door/belt
    #
    # These come from vehicle sensors rather than from vision, which is why the
    # catalogue gives them a detector reliability of 0.9 — the highest of any
    # behavioural signal. There is nothing to infer.
    if moving and state.any_door_open:
        observations.append(
            _observation(
                BehaviourSignal.DOOR_OPEN_IN_MOTION,
                strength=min(1.0, (state.speed_kph or 0.0) / 60.0),
                confidence=0.95,
                duration=1.0,
                at=now,
            )
        )

    if moving and state.driver_belt_fastened is False:
        was_fastened = previous is None or previous.driver_belt_fastened is not False

        # Only the *release* is reported, not a persistently unfastened belt.
        # Plenty of drivers never buckle up; that is a road-safety matter and
        # explicitly not something this engine is permitted to act on, since
        # `permitPerformanceManagement` is false. A belt released mid-journey is
        # a different event.
        if was_fastened:
            observations.append(
                _observation(
                    BehaviourSignal.BELT_RELEASED_IN_MOTION,
                    strength=min(1.0, (state.speed_kph or 0.0) / 60.0),
                    confidence=0.95,
                    duration=1.0,
                    at=now,
                )
            )

    logger.debug(
        "cabin.analysed",
        occupants=state.occupant_count,
        expected=state.expected_count,
        moving=moving,
        signals=[str(o.signal) for o in observations],
    )

    return observations


def _rapid_entry_strength(events: tuple[OccupancyEvent, ...]) -> float | None:
    """Occupants gained inside the rapid-entry window."""
    if len(events) < 2:
        return None

    latest = events[-1]
    window_start = latest.at.timestamp() - RAPID_ENTRY_WINDOW_SECONDS

    in_window = [event for event in events if event.at.timestamp() >= window_start]
    if len(in_window) < 2:
        return None

    gained = in_window[-1].occupant_count - in_window[0].occupant_count

    if gained < RAPID_ENTRY_MINIMUM_OCCUPANTS:
        return None

    return min(1.0, gained / 3.0)


def _observation(
    signal: BehaviourSignal,
    *,
    strength: float,
    confidence: float,
    duration: float,
    at: datetime,
) -> BehaviourObservation:
    return BehaviourObservation(
        signal=signal,
        strength=round(max(0.0, min(1.0, strength)), 3),
        detector_confidence=round(max(0.0, min(1.0, confidence)), 3),
        quality=round(max(0.0, min(1.0, confidence)), 3),
        baseline_deviation=None,
        duration_seconds=duration,
        observed_at=at,
        model_id=MODEL_ID,
    )


def unexpected_occupancy(state: CabinState, tolerance: int = 1) -> bool:
    """Whether occupancy exceeds expectation by more than the tolerance.

    Mirrors `isOccupancyUnexpected` in
    `packages/shared/src/identity/policy.ts`, including the tolerance of one:
    a single extra occupant is unremarkable — a colleague, a lift, a passenger
    the trip did not declare. Two or more above expectation is the pattern worth
    looking at, because a hijacking typically adds several people at once.
    """
    if state.expected_count is None:
        return False

    # A low-confidence count in a dark cabin is not evidence of anything.
    if state.detection_confidence < 0.6:
        return False

    return state.occupant_count > state.expected_count + tolerance
