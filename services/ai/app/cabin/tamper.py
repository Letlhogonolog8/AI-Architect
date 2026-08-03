"""Camera tamper detection.

Decides whether a camera has stopped being able to see, and why.

## Fully implemented, and unusually so

Unlike the object and person detectors, this needs no learned model. Obstruction,
saturation and defocus are measurable directly from image statistics — variance,
histogram concentration, edge energy — and the classical measures are more
robust than a model would be, because they degrade predictably rather than
producing confident nonsense on inputs unlike their training set.

That matters here more than elsewhere: this is the detector whose entire job is
to work when everything else has stopped working.

## The one thing it deliberately will not do

It does not try to distinguish tape from grime. Both produce a low-variance,
low-edge-energy frame and the difference is not recoverable from the image.
Guessing would either cry wolf on every gravel road or miss a deliberately
covered lens, so the engine reports the obstruction and lets corroboration
decide — a dirty lens on a Tuesday morning is a maintenance ticket, the same
reading thirty seconds after an unexpected stop is evidence.
"""

from __future__ import annotations

from dataclasses import dataclass

import structlog

from app.cabin.schemas import TamperResponse, TamperState

logger = structlog.get_logger(__name__)

MODEL_ID = "cabin-tamper-v1"

#: Below this normalised luminance variance, the frame carries no structure.
#: A covered lens, a lens cap, a frame of tape.
OBSTRUCTION_VARIANCE_THRESHOLD = 0.015

#: Above this fraction of pixels at or near saturation, the sensor is blinded.
#: A torch or headlight pointed into the lens.
BLINDING_SATURATION_THRESHOLD = 0.55

#: Below this normalised edge energy the image is defocused or fogged.
DEFOCUS_EDGE_THRESHOLD = 0.08

#: Histogram correlation with the installation reference, below which the
#: camera is pointing somewhere else.
MISALIGNMENT_CORRELATION_THRESHOLD = 0.45

#: Consecutive seconds a condition must hold before it is reported.
#:
#: Every one of these conditions occurs transiently in normal driving —
#: oncoming headlights blind a lens for a second, a hand passes the camera, a
#: tunnel drops the variance to nothing. Requiring persistence removes almost
#: all of that at no cost to detecting a lens that has actually been covered,
#: because tape does not come off after two seconds.
MINIMUM_PERSISTENCE_SECONDS = 10.0


@dataclass(frozen=True)
class FrameStatistics:
    """Per-frame image statistics. No pixels, and no way to reconstruct them."""

    #: Normalised luminance variance, 0-1.
    luminance_variance: float
    #: Fraction of pixels at or near saturation, 0-1.
    saturated_fraction: float
    #: Normalised edge energy, 0-1.
    edge_energy: float
    #: Correlation with the installation reference histogram, -1 to 1.
    reference_correlation: float | None = None


def classify_frame(stats: FrameStatistics) -> TamperState:
    """Classifies one frame's condition.

    Order matters. Blinding is checked before obstruction because a saturated
    frame also has low variance — a torch pointed at the lens would otherwise
    read as tape, and the two call for different responses.
    """
    if stats.saturated_fraction >= BLINDING_SATURATION_THRESHOLD:
        return TamperState.BLINDED

    if stats.luminance_variance <= OBSTRUCTION_VARIANCE_THRESHOLD:
        return TamperState.OBSTRUCTED

    if stats.edge_energy <= DEFOCUS_EDGE_THRESHOLD:
        # Defocus and heavy fogging present identically and both mean the same
        # thing operationally: the camera is producing frames nobody can use.
        return TamperState.OBSTRUCTED

    if (
        stats.reference_correlation is not None
        and stats.reference_correlation < MISALIGNMENT_CORRELATION_THRESHOLD
    ):
        return TamperState.MISALIGNED

    return TamperState.CLEAR


def assess_sequence(
    frames: list[FrameStatistics],
    frame_interval_seconds: float,
) -> TamperResponse:
    """Assesses a frame sequence for tamper.

    Reports the dominant non-clear condition, and only if it persisted. A
    sequence that flickers between clear and obstructed is a passing shadow, not
    a covered lens.
    """
    if not frames:
        return TamperResponse(
            state=TamperState.DISCONNECTED,
            confidence=1.0,
            obstructed_fraction=1.0,
            mean_quality=0.0,
            model_id=MODEL_ID,
        )

    classifications = [classify_frame(stats) for stats in frames]

    longest_state, longest_run = _longest_non_clear_run(classifications)
    run_seconds = longest_run * frame_interval_seconds

    impaired = sum(1 for state in classifications if state is not TamperState.CLEAR)
    obstructed_fraction = impaired / len(classifications)

    # Quality here is deliberately crude — mean edge energy — because the
    # detailed quality figure comes from the detectors that consume the frames.
    # This one only has to be good enough to say "usable" or "not".
    mean_quality = sum(stats.edge_energy for stats in frames) / len(frames)

    if longest_state is None or run_seconds < MINIMUM_PERSISTENCE_SECONDS:
        return TamperResponse(
            state=TamperState.CLEAR,
            confidence=round(1.0 - obstructed_fraction, 3),
            obstructed_fraction=round(obstructed_fraction, 3),
            mean_quality=round(min(1.0, mean_quality), 3),
            model_id=MODEL_ID,
        )

    # Confidence in the *classification*, not in what caused it. A fully covered
    # lens across the whole window is an unambiguous reading; the engine still
    # has no idea whether it is tape or mud, and does not claim to.
    confidence = min(1.0, obstructed_fraction * 1.2)

    logger.info(
        "cabin.tamper_detected",
        state=longest_state,
        run_seconds=round(run_seconds, 1),
        obstructed_fraction=round(obstructed_fraction, 3),
    )

    return TamperResponse(
        state=longest_state,
        confidence=round(confidence, 3),
        obstructed_fraction=round(obstructed_fraction, 3),
        mean_quality=round(min(1.0, mean_quality), 3),
        model_id=MODEL_ID,
    )


def _longest_non_clear_run(
    classifications: list[TamperState],
) -> tuple[TamperState | None, int]:
    """Longest continuous run of a single non-clear state."""
    best_state: TamperState | None = None
    best_run = 0

    current_state: TamperState | None = None
    current_run = 0

    for state in classifications:
        if state is TamperState.CLEAR:
            current_state, current_run = None, 0
            continue

        if state == current_state:
            current_run += 1
        else:
            current_state, current_run = state, 1

        if current_run > best_run:
            best_state, best_run = current_state, current_run

    return best_state, best_run
