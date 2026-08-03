"""Body pose analysis.

Turns a sequence of skeletal keypoints into the posture signals the threat
scorer consumes.

## What is implemented here, and what is not

**The geometry is complete.** Every predicate below — hands above shoulders,
wrists held together, torso rotated past a shoulder check, an occupant inside the
driver's space envelope — is fully implemented, along with the temporal
aggregation that turns per-frame predicates into sustained signals with a
duration and a strength.

**The keypoint estimator is not installed.** Producing keypoints from pixels
needs a pose model (MoveNet, RTMPose, or similar) and that is what
`PoseAnalyser` in `engine.py` is the contract for. Until one is registered the
HTTP surface returns 501.

That split is deliberate rather than incidental. The geometry is where the
product's judgement lives — what counts as "hands raised", how long a torso must
stay turned before it stops being a shoulder check — and it is reviewable,
testable and arguable in a way a model's weights are not. The estimator is a
commodity. Keeping the judgement in readable code means a decision that
contributed to dispatching armed responders can be examined line by line.

## Keypoints never leave this module

They arrive, produce signals, and are discarded inside the request. A retained
keypoint series is a continuous record of how a named worker's body moved across
months of their job, which is a far more invasive artefact than the video it was
derived from, and one nobody would think to look for in a database.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime

import structlog

from app.behaviour.schemas import (
    BehaviourObservation,
    BehaviourSignal,
    OccupantPosition,
)

logger = structlog.get_logger(__name__)

MODEL_ID = "pose-geometry-v1"

#: Keypoints the geometry needs. A frame missing any of these is incomplete and
#: contributes to a coverage figure rather than being silently interpolated —
#: interpolating an occluded wrist invents the exact evidence that matters most.
REQUIRED_KEYPOINTS: tuple[str, ...] = (
    "nose",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
)

#: Below this per-keypoint confidence the point is treated as absent.
KEYPOINT_CONFIDENCE_FLOOR = 0.3


@dataclass(frozen=True)
class Keypoint:
    """A normalised keypoint.

    Coordinates are in [0, 1] relative to the seat's crop, with `y` increasing
    downward in the usual image convention. Normalising per seat rather than per
    frame is what makes the thresholds below independent of camera placement.
    """

    x: float
    y: float
    confidence: float

    @property
    def present(self) -> bool:
        return self.confidence >= KEYPOINT_CONFIDENCE_FLOOR


Frame = dict[str, Keypoint]


def coverage(frame: Frame) -> float:
    """Fraction of required keypoints actually resolved in this frame."""
    present = sum(1 for name in REQUIRED_KEYPOINTS if name in frame and frame[name].present)
    return present / len(REQUIRED_KEYPOINTS)


# ---------------------------------------------------------------------------
# Per-frame predicates
# ---------------------------------------------------------------------------
#
# Each returns a strength in [0, 1], or None when the frame lacks the keypoints
# to decide. None is not zero: "the wrists were not visible" and "the wrists were
# visible and down" are different facts, and collapsing them would let an
# occluded camera read as reassurance.


def _midpoint(a: Keypoint, b: Keypoint) -> tuple[float, float]:
    return ((a.x + b.x) / 2, (a.y + b.y) / 2)


def _torso_scale(frame: Frame) -> float | None:
    """Shoulder-to-hip distance. The scale every other threshold is relative to.

    Using a body-relative scale rather than pixels is what keeps the thresholds
    working for a tall driver and a short one, and for a camera mounted six
    centimetres further back after a windscreen replacement.
    """
    needed = ("left_shoulder", "right_shoulder", "left_hip", "right_hip")
    if not all(name in frame and frame[name].present for name in needed):
        return None

    shoulder = _midpoint(frame["left_shoulder"], frame["right_shoulder"])
    hip = _midpoint(frame["left_hip"], frame["right_hip"])

    scale = math.dist(shoulder, hip)
    return scale if scale > 1e-3 else None


def hands_raised(frame: Frame) -> float | None:
    """Both wrists above shoulder height.

    Almost nobody does this while seated in a car for any ordinary reason, which
    is why it carries the highest likelihood ratio in the catalogue.
    """
    needed = ("left_wrist", "right_wrist", "left_shoulder", "right_shoulder")
    if not all(name in frame and frame[name].present for name in needed):
        return None

    scale = _torso_scale(frame)
    if scale is None:
        return None

    shoulder_y = (frame["left_shoulder"].y + frame["right_shoulder"].y) / 2

    # y increases downward, so "above" is a smaller y.
    left_rise = (shoulder_y - frame["left_wrist"].y) / scale
    right_rise = (shoulder_y - frame["right_wrist"].y) / scale

    if left_rise <= 0 or right_rise <= 0:
        return 0.0

    # Full strength when both wrists are a full torso-length above the shoulders.
    return min(1.0, min(left_rise, right_rise))


def wrists_constrained(frame: Frame) -> float | None:
    """Wrists held close together and low.

    Consistent with binding, and also with hands resting together in the lap —
    which is why the catalogue gives this a low detector reliability despite a
    high likelihood ratio, and why it needs eight seconds of persistence.
    """
    needed = ("left_wrist", "right_wrist", "left_hip", "right_hip")
    if not all(name in frame and frame[name].present for name in needed):
        return None

    scale = _torso_scale(frame)
    if scale is None:
        return None

    separation = math.dist(
        (frame["left_wrist"].x, frame["left_wrist"].y),
        (frame["right_wrist"].x, frame["right_wrist"].y),
    ) / scale

    hip_y = (frame["left_hip"].y + frame["right_hip"].y) / 2
    wrist_y = (frame["left_wrist"].y + frame["right_wrist"].y) / 2

    if wrist_y < hip_y:
        return 0.0

    # Strength rises as the wrists converge, saturating when they touch.
    return max(0.0, min(1.0, 1.0 - separation / 0.35))


def hands_off_wheel(frame: Frame, wheel_centre: tuple[float, float]) -> float | None:
    """Neither wrist near the steering wheel."""
    needed = ("left_wrist", "right_wrist")
    if not all(name in frame and frame[name].present for name in needed):
        return None

    scale = _torso_scale(frame)
    if scale is None:
        return None

    distances = [
        math.dist((frame[name].x, frame[name].y), wheel_centre) / scale
        for name in needed
    ]

    nearest = min(distances)
    if nearest < 0.6:
        return 0.0

    return max(0.0, min(1.0, (nearest - 0.6) / 0.8))


def torso_turned(frame: Frame) -> float | None:
    """Shoulder line rotated away from square-on.

    Measured by shoulder-line foreshortening: as the torso rotates, the apparent
    distance between the shoulders shrinks relative to the torso length.
    """
    needed = ("left_shoulder", "right_shoulder")
    if not all(name in frame and frame[name].present for name in needed):
        return None

    scale = _torso_scale(frame)
    if scale is None:
        return None

    width = math.dist(
        (frame["left_shoulder"].x, frame["left_shoulder"].y),
        (frame["right_shoulder"].x, frame["right_shoulder"].y),
    ) / scale

    # A square-on seated torso runs roughly 0.9-1.1 shoulder widths per torso
    # length. Below 0.55 the subject is turned well past a shoulder check.
    if width >= 0.55:
        return 0.0

    return max(0.0, min(1.0, (0.55 - width) / 0.35))


def slumped(frame: Frame) -> float | None:
    """Head dropped below the normal seated envelope.

    Also the signature of a medical emergency, not only of an assault. The
    response policy escalates this to a human rather than to a countermeasure
    for exactly that reason.
    """
    if "nose" not in frame or not frame["nose"].present:
        return None

    needed = ("left_shoulder", "right_shoulder")
    if not all(name in frame and frame[name].present for name in needed):
        return None

    scale = _torso_scale(frame)
    if scale is None:
        return None

    shoulder_y = (frame["left_shoulder"].y + frame["right_shoulder"].y) / 2
    head_rise = (shoulder_y - frame["nose"].y) / scale

    # Seated upright, the nose sits roughly 0.35-0.6 torso lengths above the
    # shoulder line. Below 0.15 the head has dropped to or past shoulder height.
    if head_rise >= 0.15:
        return 0.0

    return max(0.0, min(1.0, (0.15 - head_rise) / 0.3))


def encroaching_driver(frame: Frame, driver_envelope_x: tuple[float, float]) -> float | None:
    """A non-driver occupant's keypoints inside the driver's space.

    Applied to a passenger's skeleton, with the driver's lateral envelope given
    in the same normalised frame.
    """
    tracked = [name for name in ("left_wrist", "right_wrist", "nose") if name in frame]
    present = [frame[name] for name in tracked if frame[name].present]

    if not present:
        return None

    low, high = driver_envelope_x
    intrusions = [
        max(0.0, min(1.0, (high - point.x) / max(1e-3, high - low)))
        for point in present
        if low <= point.x <= high
    ]

    if not intrusions:
        return 0.0

    return max(intrusions)


# ---------------------------------------------------------------------------
# Temporal aggregation
# ---------------------------------------------------------------------------


@dataclass
class SustainedRun:
    """The longest continuous run in which a predicate held."""

    duration_seconds: float
    mean_strength: float
    coverage: float


def longest_run(
    values: list[float | None],
    frame_interval_seconds: float,
    threshold: float = 0.15,
) -> SustainedRun:
    """Finds the longest continuous stretch above `threshold`.

    Frames where the predicate returned None break neither the run nor count
    toward it. A wrist occluded for two frames mid-gesture should not reset a
    genuine six-second signal, but it should not be counted as evidence either —
    so it is skipped, and reflected in the coverage figure the caller uses to
    discount the whole observation.
    """
    best_duration = 0.0
    best_sum = 0.0
    best_count = 0

    run_duration = 0.0
    run_sum = 0.0
    run_count = 0

    decided = 0

    for value in values:
        if value is None:
            continue

        decided += 1

        if value >= threshold:
            run_duration += frame_interval_seconds
            run_sum += value
            run_count += 1

            if run_duration > best_duration:
                best_duration = run_duration
                best_sum = run_sum
                best_count = run_count
        else:
            run_duration = 0.0
            run_sum = 0.0
            run_count = 0

    return SustainedRun(
        duration_seconds=best_duration,
        mean_strength=(best_sum / best_count) if best_count else 0.0,
        coverage=(decided / len(values)) if values else 0.0,
    )


def derive_pose_signals(
    frames: list[Frame],
    frame_interval_seconds: float,
    position: OccupantPosition,
    vehicle_moving: bool,
    wheel_centre: tuple[float, float] = (0.5, 0.62),
    driver_envelope_x: tuple[float, float] = (0.0, 0.35),
) -> list[BehaviourObservation]:
    """Turns a keypoint sequence into posture signals.

    This is the whole of the pose judgement, and it is deliberately plain code.
    """
    if not frames:
        return []

    observed_at = datetime.now(UTC)
    mean_coverage = sum(coverage(frame) for frame in frames) / len(frames)

    is_driver = position == OccupantPosition.DRIVER
    candidates: list[tuple[BehaviourSignal, list[float | None]]] = [
        (BehaviourSignal.HANDS_RAISED, [hands_raised(f) for f in frames]),
        (BehaviourSignal.WRISTS_CONSTRAINED, [wrists_constrained(f) for f in frames]),
        (BehaviourSignal.TORSO_TURNED_SUSTAINED, [torso_turned(f) for f in frames]),
        (BehaviourSignal.SLUMPED_POSTURE, [slumped(f) for f in frames]),
    ]

    if is_driver and vehicle_moving:
        candidates.append(
            (
                BehaviourSignal.HANDS_OFF_WHEEL_MOVING,
                [hands_off_wheel(f, wheel_centre) for f in frames],
            )
        )

    if not is_driver:
        candidates.append(
            (
                BehaviourSignal.OCCUPANT_ENCROACHING_DRIVER,
                [encroaching_driver(f, driver_envelope_x) for f in frames],
            )
        )

    observations: list[BehaviourObservation] = []

    for signal, series in candidates:
        run = longest_run(series, frame_interval_seconds)

        if run.duration_seconds <= 0:
            continue

        observations.append(
            BehaviourObservation(
                signal=signal,
                strength=round(run.mean_strength, 3),
                # Confidence is driven by how much of the sequence could be
                # decided at all. A signal derived from a mostly-occluded
                # skeleton is reported with the low confidence it deserves,
                # rather than being dropped and losing the information that
                # something was seen.
                detector_confidence=round(min(1.0, run.coverage), 3),
                quality=round(mean_coverage, 3),
                baseline_deviation=None,
                duration_seconds=round(run.duration_seconds, 2),
                observed_at=observed_at,
                model_id=MODEL_ID,
            )
        )

    # An empty driver seat is a property of the sequence rather than of a
    # skeleton, so it is derived from coverage instead of from a predicate.
    if is_driver and vehicle_moving:
        vacated = _driver_vacated(frames, frame_interval_seconds, observed_at)
        if vacated is not None:
            observations.append(vacated)

    logger.debug(
        "pose.analysed",
        position=position,
        frames=len(frames),
        coverage=round(mean_coverage, 3),
        signals=[str(o.signal) for o in observations],
    )

    return observations


def _driver_vacated(
    frames: list[Frame],
    frame_interval_seconds: float,
    observed_at: datetime,
) -> BehaviourObservation | None:
    """Detects a driver's seat with no skeleton in it while the vehicle moves.

    Reported with deliberately low confidence. Keypoint dropout in a dark cabin
    is indistinguishable from an empty seat, and this signal carries a high
    likelihood ratio — so overstating the detector's certainty here is the
    fastest route to a false hijacking alarm at night.
    """
    empties = [1.0 if coverage(frame) < 0.2 else 0.0 for frame in frames]
    run = longest_run([value for value in empties], frame_interval_seconds, threshold=0.5)

    if run.duration_seconds <= 0:
        return None

    return BehaviourObservation(
        signal=BehaviourSignal.DRIVER_POSITION_VACATED,
        strength=1.0,
        detector_confidence=0.5,
        quality=0.5,
        baseline_deviation=None,
        duration_seconds=round(run.duration_seconds, 2),
        observed_at=observed_at,
        model_id=MODEL_ID,
    )
