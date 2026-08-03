"""Voice stress analysis.

Turns prosodic measurements of cabin speech into baseline-relative departures.

## What this is, stated precisely

Four standard acoustic quantities, each compared against the same speaker's own
baseline:

  * **F0** — fundamental frequency, the pitch of the voice.
  * **Jitter** — cycle-to-cycle variation in F0.
  * **Shimmer** — cycle-to-cycle variation in amplitude.
  * **Speaking rate** — syllables per second.

These are reproducible measurements with decades of phonetics behind them. Under
physical exertion and autonomic arousal they shift, reliably and measurably.

## What this is not, and why it matters more than what it is

**It is not a lie detector, and it is not layered voice stress analysis.**

Commercial voice-stress products — LVA, CVSA and their descendants — have failed
independent validation repeatedly. National Institute of Justice evaluations
found deception detection at chance level. Those products are still sold, still
deployed by police forces, and still wrong.

They fail because the inference is unavailable, not because the measurement is.
Prosody shifts under arousal; arousal has dozens of causes; nothing in the
acoustic signal distinguishes between them. A raised F0 is equally consistent
with terror, with a heated argument about a delivery window, and with shouting
over an open window at 120 km/h.

This module therefore reports departures and never a conclusion. The catalogue
in `packages/shared/src/behaviour/catalogue.ts` backs that up with numbers:
vocal signals carry the **lowest detector reliability of any class** (0.40-0.45)
and likelihood ratios between 1.5 and 2.0 — meaning a strong vocal departure
barely moves the threat score by itself. That is the correct outcome. It is not
a tuning problem to be fixed later.

## Content is never processed

No transcription, no keyword spotting, no language identification, no speaker
identification. Speakers are *counted* — "there are four voices in a vehicle that
should have one" is operationally decisive and needs no identification — and the
count is discarded with the audio.

The single exception is the enrolled duress phrase, matched acoustically against
a template the driver deliberately registered in order to signal with it. That is
the driver choosing to send a message, not the system reading their conversation,
and it is classified as `EXPLICIT` evidence rather than behavioural for exactly
that reason.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime

import structlog

from app.behaviour.schemas import (
    BehaviourObservation,
    BehaviourSignal,
    VoiceMeasure,
    VoiceStressResponse,
)

logger = structlog.get_logger(__name__)

MODEL_ID = "prosody-v1"

#: The measure set. Names are deliberately acoustic rather than interpretive —
#: `f0_mean`, never `tension`.
MEASURE_NAMES: tuple[str, ...] = (
    "f0_mean",
    "f0_variability",
    "jitter",
    "shimmer",
    "speech_rate",
    "intensity",
)

#: Seconds of clean speech below which prosody is not worth computing.
#:
#: F0 statistics over two seconds of speech are dominated by which words
#: happened to be said. Three seconds is already marginal; five is the floor at
#: which the measures start describing the speaker rather than the sentence.
MINIMUM_ANALYSED_SECONDS = 5.0

#: Signal-to-noise below which the audio is refused outright.
MINIMUM_AUDIO_QUALITY = 0.45

#: Standard deviations past which a departure becomes a catalogue signal.
SIGNAL_SIGMA_THRESHOLD = 2.0

#: How long the cabin may be silent, with occupants aboard, before it is notable.
PROLONGED_SILENCE_SECONDS = 90.0


def deviation(value: float, stats: dict[str, float] | None) -> float | None:
    """Z-score against the speaker's baseline. None when incomparable."""
    if stats is None:
        return None

    sigma = stats.get("standardDeviation", 0.0)
    if sigma <= 1e-6:
        return None

    return (value - stats.get("mean", 0.0)) / sigma


def analyse_prosody(
    measures: dict[str, float],
    baseline: dict[str, dict[str, float]],
    *,
    speaker_count: int,
    expected_speaker_count: int | None,
    analysed_seconds: float,
    audio_quality: float,
    silence_seconds: float,
    occupied: bool,
    duress_phrase_detected: bool = False,
) -> VoiceStressResponse:
    """Converts acoustic measurements into departures and catalogue signals."""
    observed_at = datetime.now(UTC)

    if audio_quality < MINIMUM_AUDIO_QUALITY or analysed_seconds < MINIMUM_ANALYSED_SECONDS:
        # Refused rather than reported weakly. Cabin audio at speed is often
        # unusable, and a prosodic departure computed from noise is not a weak
        # measurement — it is a measurement of the road surface.
        logger.debug(
            "voice.window_refused",
            audio_quality=round(audio_quality, 3),
            analysed_seconds=round(analysed_seconds, 1),
        )
        return VoiceStressResponse(
            measures=[],
            signals=_duress_signal(observed_at, audio_quality)
            if duress_phrase_detected
            else [],
            speaker_count=speaker_count,
            expected_speaker_count=expected_speaker_count,
            duress_phrase_detected=duress_phrase_detected,
            audio_quality=round(audio_quality, 3),
            analysed_seconds=round(analysed_seconds, 2),
            baseline_missing=not baseline,
            model_id=MODEL_ID,
        )

    departures: list[VoiceMeasure] = []
    comparable = 0

    for name in MEASURE_NAMES:
        value = measures.get(name)
        if value is None or not math.isfinite(value):
            continue

        z = deviation(value, baseline.get(name))
        if z is None:
            continue

        comparable += 1
        departures.append(VoiceMeasure(name=name, deviation=round(z, 3)))

    signals = _derive_signals(
        departures,
        observed_at=observed_at,
        analysed_seconds=analysed_seconds,
        audio_quality=audio_quality,
    )

    # Speaker counting does not depend on a baseline and survives poor audio far
    # better than prosody does, which makes it the most useful thing this
    # analyser produces.
    if expected_speaker_count is not None and speaker_count > expected_speaker_count:
        signals.append(
            BehaviourObservation(
                signal=BehaviourSignal.UNEXPECTED_SPEAKER_COUNT,
                strength=round(
                    min(1.0, (speaker_count - expected_speaker_count) / 3.0), 3
                ),
                detector_confidence=round(min(1.0, audio_quality + 0.15), 3),
                quality=round(audio_quality, 3),
                baseline_deviation=None,
                duration_seconds=round(analysed_seconds, 2),
                observed_at=observed_at,
                model_id=MODEL_ID,
            )
        )

    if occupied and silence_seconds >= PROLONGED_SILENCE_SECONDS:
        signals.append(
            BehaviourObservation(
                signal=BehaviourSignal.PROLONGED_SILENCE_OCCUPIED,
                strength=round(min(1.0, silence_seconds / 300.0), 3),
                detector_confidence=round(audio_quality, 3),
                quality=round(audio_quality, 3),
                baseline_deviation=None,
                duration_seconds=round(silence_seconds, 2),
                observed_at=observed_at,
                model_id=MODEL_ID,
            )
        )

    if duress_phrase_detected:
        signals.extend(_duress_signal(observed_at, audio_quality))

    logger.debug(
        "voice.analysed",
        comparable_measures=comparable,
        speakers=speaker_count,
        signals=[str(s.signal) for s in signals],
    )

    return VoiceStressResponse(
        measures=departures,
        signals=signals,
        speaker_count=speaker_count,
        expected_speaker_count=expected_speaker_count,
        duress_phrase_detected=duress_phrase_detected,
        audio_quality=round(audio_quality, 3),
        analysed_seconds=round(analysed_seconds, 2),
        baseline_missing=comparable == 0,
        model_id=MODEL_ID,
    )


def _derive_signals(
    departures: list[VoiceMeasure],
    *,
    observed_at: datetime,
    analysed_seconds: float,
    audio_quality: float,
) -> list[BehaviourObservation]:
    """Maps acoustic departures onto catalogue signals."""
    by_name = {measure.name: measure.deviation for measure in departures}

    mapping: list[tuple[BehaviourSignal, float | None]] = [
        (BehaviourSignal.PITCH_ELEVATION, by_name.get("f0_mean")),
        (BehaviourSignal.RAISED_VOCAL_EFFORT, by_name.get("intensity")),
        (BehaviourSignal.SPEECH_RATE_DEPARTURE, _magnitude(by_name.get("speech_rate"))),
        (BehaviourSignal.VOCAL_INSTABILITY, _combined_instability(by_name)),
    ]

    observations: list[BehaviourObservation] = []

    for signal, z in mapping:
        if z is None or z < SIGNAL_SIGMA_THRESHOLD:
            continue

        observations.append(
            BehaviourObservation(
                signal=signal,
                strength=round(min(1.0, z / 5.0), 3),
                # Confidence is bounded by audio quality and then held below
                # 0.85 regardless. The literature does not support treating any
                # prosodic inference as near-certain, and the number an operator
                # sees should reflect that rather than the SDK's optimism.
                detector_confidence=round(min(0.85, audio_quality), 3),
                quality=round(audio_quality, 3),
                baseline_deviation=round(z, 3),
                duration_seconds=round(analysed_seconds, 2),
                observed_at=observed_at,
                model_id=MODEL_ID,
            )
        )

    return observations


def _magnitude(value: float | None) -> float | None:
    """Speech rate matters in both directions — faster *or* slower than usual."""
    return None if value is None else abs(value)


def _combined_instability(by_name: dict[str, float]) -> float | None:
    """Jitter and shimmer combined.

    Reported as one signal because they are near-duplicates: both measure
    cycle-to-cycle irregularity, and they rise together. Emitting them
    separately would let one acoustic phenomenon count twice in a scorer that is
    already discounting within-class correlation.
    """
    jitter = by_name.get("jitter")
    shimmer = by_name.get("shimmer")

    present = [value for value in (jitter, shimmer) if value is not None]
    if not present:
        return None

    return sum(present) / len(present)


def _duress_signal(observed_at: datetime, audio_quality: float) -> list[BehaviourObservation]:
    """The enrolled duress phrase.

    Reported even when the window was otherwise refused for poor audio. The
    driver deliberately chose to send this, and discarding it because the road
    was loud would defeat the entire point of giving them a phrase.
    """
    return [
        BehaviourObservation(
            signal=BehaviourSignal.DURESS_PHRASE_SPOKEN,
            strength=1.0,
            detector_confidence=round(max(0.7, min(0.95, audio_quality + 0.3)), 3),
            quality=round(max(0.5, audio_quality), 3),
            baseline_deviation=None,
            duration_seconds=0.0,
            observed_at=observed_at,
            model_id=MODEL_ID,
        )
    ]
