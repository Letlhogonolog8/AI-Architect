"""Arousal analysis — the "stress detection" component, named for what it does.

Turns a window of physiological proxy measurements into standard-deviation
departures from a person's own baseline.

## Read this before changing anything in this file

**Nothing here detects stress, and nothing here detects an emotion.**

What is measured is autonomic *arousal* — how much a body is moving, how loudly
and quickly it is speaking, how often its posture shifts — expressed as a
departure from that same body's resting pattern. Arousal is real, physical and
measurable.

The emotion attached to it is not recoverable from the outside. Barrett et al.
(2019), *Emotional Expressions Reconsidered*, is the standard reference: facial
and vocal configurations do not map reliably onto emotional states across
people, cultures and situations. The identical elevated reading is produced by a
hijacking, an argument with a dispatcher, a near miss at a taxi rank, a hot
cabin, a fast song, and running forty minutes late.

The last five are thousands of times more common than the first.

So this module reports the measurement and stops. A field named `fear` would be
believed by whoever read it, and it would be wrong nearly every time it fired —
in a system that can send armed responders to a citizen. `engine.py` enforces
this at the boundary via `guard_against_affect_claims`, which rejects any
analyser that tries to return an affect label.

## Why the composite index is computed elsewhere

The indicators come from here; the single 0-1 index is assembled in
`packages/shared/src/behaviour/arousal.ts`. Same reason identity fusion lives in
TypeScript: the number may be produced in an investigation and has to be
recomputable and explainable without loading a model, with the API, console and
mobile app all agreeing on what it means.
"""

from __future__ import annotations

import math
from datetime import datetime

import structlog

from app.behaviour.schemas import (
    ArousalIndicator,
    ArousalRequest,
    ArousalResponse,
    BehaviourObservation,
    BehaviourSignal,
    BehaviourSignalClass,
    SignalQuality,
)

logger = structlog.get_logger(__name__)

MODEL_ID = "arousal-features-v1"

#: The proxy set, with the class each belongs to.
#:
#: Every entry is something a sensor measures directly. None of them is an
#: inference about what the person is experiencing.
INDICATOR_CLASSES: dict[str, BehaviourSignalClass] = {
    "motion_energy": BehaviourSignalClass.MOTION,
    "postural_shift_rate": BehaviourSignalClass.POSTURE,
    "head_movement_rate": BehaviourSignalClass.POSTURE,
    "vocal_f0": BehaviourSignalClass.VOCAL,
    "vocal_intensity": BehaviourSignalClass.VOCAL,
    "speech_rate": BehaviourSignalClass.VOCAL,
    "control_input_variance": BehaviourSignalClass.CONTROL,
}

#: Standard deviations past which a departure is reported as a signal.
#:
#: Two sigma. Under a normal approximation that fires on roughly 2.5% of a
#: person's own windows, which at one window a minute is about once an hour of
#: driving — frequent enough to be useful in combination, and far too frequent to
#: alert on alone. The threat scorer treats it accordingly.
SIGNAL_SIGMA_THRESHOLD = 2.0

#: Below this, the window is too short for the slower proxies to mean anything.
MINIMUM_WINDOW_SECONDS = 20


def deviation(value: float, stats: dict[str, float] | None) -> float | None:
    """Z-score against a baseline entry.

    Returns None rather than 0 when the baseline is missing or degenerate. Zero
    would read as "exactly average", which is a claim; None is the absence of
    one, and the scorer treats the two very differently.
    """
    if stats is None:
        return None

    sigma = stats.get("standardDeviation", 0.0)

    # A zero-variance baseline means every observed window was identical, which
    # in real sensor data means the sensor was stuck. Treating it as infinitely
    # discriminative would let one broken input dominate every assessment.
    if sigma <= 1e-6:
        return None

    return (value - stats.get("mean", 0.0)) / sigma


def analyse_window(
    features: dict[str, float],
    baseline: dict[str, dict[str, float]],
    observed_seconds: float,
    input_quality: float,
) -> ArousalResponse:
    """Converts raw proxy measurements into baseline-relative indicators."""
    if observed_seconds < MINIMUM_WINDOW_SECONDS:
        return ArousalResponse(
            indicators=[],
            baseline_missing=not baseline,
            quality=SignalQuality(
                overall=0.0,
                reasons=[
                    f"Window of {observed_seconds:.0f}s is shorter than the "
                    f"{MINIMUM_WINDOW_SECONDS}s minimum."
                ],
            ),
            model_id=MODEL_ID,
        )

    indicators: list[ArousalIndicator] = []
    uncomparable: list[str] = []

    for name, signal_class in INDICATOR_CLASSES.items():
        value = features.get(name)
        if value is None or not math.isfinite(value):
            continue

        z = deviation(value, baseline.get(name))

        if z is None:
            uncomparable.append(name)
            continue

        indicators.append(
            ArousalIndicator(
                name=name,
                deviation=round(z, 3),
                quality=round(input_quality, 3),
                signal_class=signal_class,
            )
        )

    reasons: list[str] = []
    if uncomparable:
        reasons.append(
            f"No usable baseline for: {', '.join(sorted(uncomparable))}. "
            "These proxies were measured but could not be compared."
        )

    coverage = len(indicators) / len(INDICATOR_CLASSES)
    if coverage < 0.5:
        reasons.append(
            f"Only {len(indicators)} of {len(INDICATOR_CLASSES)} proxies were comparable."
        )

    logger.debug(
        "arousal.analysed",
        comparable=len(indicators),
        uncomparable=len(uncomparable),
        window_seconds=observed_seconds,
    )

    return ArousalResponse(
        indicators=indicators,
        baseline_missing=len(indicators) == 0,
        quality=SignalQuality(
            overall=round(min(1.0, coverage * input_quality), 3),
            reasons=reasons,
        ),
        model_id=MODEL_ID,
    )


def derive_motion_signals(
    indicators: list[ArousalIndicator],
    window_seconds: float,
    observed_at: datetime,
    input_quality: float,
) -> list[BehaviourObservation]:
    """Promotes sufficiently large motion departures into catalogue signals.

    Only the motion class is promoted here. Vocal departures become signals in
    `voice_stress.py`, where the audio quality that produced them is known —
    promoting them from this side would attach a video quality figure to an
    audio measurement, and the scorer would weight it wrongly.
    """
    observations: list[BehaviourObservation] = []

    motion = next((i for i in indicators if i.name == "motion_energy"), None)

    if motion is not None and motion.deviation >= SIGNAL_SIGMA_THRESHOLD:
        observations.append(
            BehaviourObservation(
                signal=BehaviourSignal.ELEVATED_MOTION_ENERGY,
                # Saturates at five sigma. Beyond that the measurement is more
                # likely to be a sensor fault than a person moving even harder.
                strength=round(min(1.0, motion.deviation / 5.0), 3),
                detector_confidence=round(motion.quality, 3),
                quality=round(input_quality, 3),
                baseline_deviation=motion.deviation,
                duration_seconds=window_seconds,
                observed_at=observed_at,
                model_id=MODEL_ID,
            )
        )

    # Abnormal stillness is the mirror case, and in a hijacking it is the more
    # common of the two: a person with a weapon against them holds very still.
    # A stress detector that only looked for elevation would miss it entirely.
    if motion is not None and motion.deviation <= -SIGNAL_SIGMA_THRESHOLD:
        observations.append(
            BehaviourObservation(
                signal=BehaviourSignal.ABNORMAL_STILLNESS,
                strength=round(min(1.0, abs(motion.deviation) / 5.0), 3),
                detector_confidence=round(motion.quality, 3),
                quality=round(input_quality, 3),
                baseline_deviation=motion.deviation,
                duration_seconds=window_seconds,
                observed_at=observed_at,
                model_id=MODEL_ID,
            )
        )

    return observations


def request_to_features(request: ArousalRequest) -> dict[str, float]:
    """Placeholder for the extraction step a registered analyser performs.

    Deliberately raises. Deriving motion energy and postural shift rates from a
    frame sequence needs a vision pipeline; returning zeros here would produce an
    arousal index of exactly baseline for every driver, which reads as "nothing
    is wrong" rather than as "nothing was measured".
    """
    raise NotImplementedError(
        "Feature extraction from a frame sequence requires a registered arousal "
        "analyser. Install the 'vision' extra and register one — see "
        "app/behaviour/engine.py. The engine will not substitute zeros for "
        "measurements it did not take."
    )
