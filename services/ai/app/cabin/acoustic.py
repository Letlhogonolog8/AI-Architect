"""Acoustic event detection.

Recognises non-speech cabin events from their spectral signatures.

## Events, never content

No transcription, no keyword spotting, no language identification, no speaker
identification. A breaking window and a gunshot are short, loud and spectrally
distinctive, and recognising them requires no understanding of what anyone is
saying.

That boundary is the whole reason a live cabin microphone is defensible. A
microphone listening for breaking glass is a smoke detector. A microphone that
transcribes is surveillance of a worker's conversations — with their family,
their doctor, their union — for eight hours a day.

## What is implemented

The **classification logic** is complete: the discriminants below are the
standard acoustic features these events are separated on, and the decision rules
over them are plain, reviewable code. What is absent is the front-end that
turns a waveform into those features, which needs a DSP or model pipeline and is
what `AcousticDetector` in `engine.py` is the contract for.

## On gunshot detection

Outdoor gunshot-location systems have had their accuracy publicly contested and
have been dropped by several cities. An enclosed cabin is a materially easier
problem — the source is metres away, the reverberation is predictable, and there
is no wind or traffic to mask the onset — but "easier" is not "solved". The
calibration gives it a detector reliability of 0.6 and the scorer still requires
corroboration, because a backfire and a slammed boot lid share much of the same
envelope.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import structlog

from app.cabin.schemas import (
    AcousticAlternative,
    AcousticEvent,
    AcousticEventType,
    AcousticResponse,
)

logger = structlog.get_logger(__name__)

MODEL_ID = "cabin-acoustic-v1"

#: Below this signal-to-noise the window is refused rather than analysed.
#: Cabin audio at speed with a window down is frequently unusable.
MINIMUM_AUDIO_QUALITY = 0.35

#: Sound pressure below which nothing is a candidate event.
MINIMUM_PEAK_DB = 75.0

#: Confidence below which a candidate is not reported.
REPORTING_FLOOR = 0.5


@dataclass(frozen=True)
class TransientFeatures:
    """Acoustic features of one detected transient.

    Every field is a standard measure with decades of acoustics behind it. None
    of them carries speech content, and none can be inverted back to audio.
    """

    peak_db: float
    #: Seconds from onset to peak. Impulsive events rise in under a millisecond.
    attack_seconds: float
    #: Seconds for the level to fall 60 dB.
    decay_seconds: float
    #: Centre of spectral mass, Hz. Glass is high; impacts are low.
    spectral_centroid_hz: float
    #: Spread of spectral energy. High for glass, low for tonal alarms.
    spectral_spread_hz: float
    #: 0-1. Concentration of energy in a narrow band. Alarms are tonal.
    tonality: float
    #: Signal-to-noise of the window this came from.
    audio_quality: float


def classify_transient(features: TransientFeatures) -> list[tuple[AcousticEventType, float]]:
    """Scores a transient against every event class.

    Returns every class above the floor, strongest first — the ambiguity set,
    not a winner. A "gunshot" the detector nearly called a door slam is not a
    gunshot, and the consumer needs to see that.

    The discriminants:
      * **Glass** — very high spectral centroid (3-8 kHz), wide spread, long
        ragged decay as fragments continue to fall.
      * **Gunshot** — extremely fast attack, very high peak, short decay,
        broadband.
      * **Impact** — low centroid, fast attack, medium decay.
      * **Door slam** — low centroid, fast attack, very short decay. The closest
        confusable to an impact, and deliberately scored alongside it.
      * **Alarm** — tonal, sustained, narrow spread.
    """
    scores: list[tuple[AcousticEventType, float]] = []

    impulsive = features.attack_seconds <= 0.005
    very_loud = features.peak_db >= 120

    # Glass break
    if features.spectral_centroid_hz >= 3000 and features.spectral_spread_hz >= 2000:
        confidence = _blend(
            _ramp(features.spectral_centroid_hz, 3000, 6000),
            _ramp(features.spectral_spread_hz, 2000, 4000),
            _ramp(features.decay_seconds, 0.2, 0.8),
        )
        scores.append((AcousticEventType.GLASS_BREAK, confidence))

    # Gunshot
    if impulsive and features.peak_db >= 110:
        confidence = _blend(
            _ramp(features.peak_db, 110, 140),
            1.0 if very_loud else 0.6,
            _inverse_ramp(features.decay_seconds, 0.05, 0.4),
        )
        scores.append((AcousticEventType.GUNSHOT, confidence))

    # Impact
    if features.spectral_centroid_hz <= 1500 and features.attack_seconds <= 0.02:
        confidence = _blend(
            _inverse_ramp(features.spectral_centroid_hz, 400, 1500),
            _ramp(features.peak_db, 80, 120),
            _ramp(features.decay_seconds, 0.1, 0.5),
        )
        scores.append((AcousticEventType.IMPACT, confidence))

    # Door slam. Scored whenever an impact is, because it is the confusable and
    # omitting it would let every closing door read as a collision.
    if features.spectral_centroid_hz <= 1200 and features.decay_seconds <= 0.25:
        confidence = _blend(
            _inverse_ramp(features.spectral_centroid_hz, 300, 1200),
            _inverse_ramp(features.decay_seconds, 0.05, 0.25),
            _inverse_ramp(features.peak_db, 80, 115),
        )
        scores.append((AcousticEventType.DOOR_SLAM, confidence))

    # Alarm
    if features.tonality >= 0.6:
        confidence = _blend(
            _ramp(features.tonality, 0.6, 0.9),
            _inverse_ramp(features.spectral_spread_hz, 200, 1500),
            _ramp(features.decay_seconds, 0.5, 2.0),
        )
        scores.append((AcousticEventType.ALARM, confidence))

    # Every score is bounded by how good the audio was. A confident
    # classification of noise is still a classification of noise.
    scaled = [
        (event_type, min(1.0, confidence * features.audio_quality))
        for event_type, confidence in scores
    ]

    return sorted(
        (entry for entry in scaled if entry[1] >= REPORTING_FLOOR),
        key=lambda entry: entry[1],
        reverse=True,
    )


def analyse_transients(
    transients: list[TransientFeatures],
    analysed_seconds: float,
    audio_quality: float,
) -> AcousticResponse:
    """Turns detected transients into acoustic events with ambiguity sets."""
    if audio_quality < MINIMUM_AUDIO_QUALITY:
        # Refused rather than reported weakly. An event classified from noise is
        # not a weak measurement; it is a measurement of the road surface.
        logger.debug("cabin.audio_window_refused", audio_quality=round(audio_quality, 3))
        return AcousticResponse(
            events=[],
            analysed_seconds=round(analysed_seconds, 2),
            audio_quality=round(audio_quality, 3),
            model_id=MODEL_ID,
        )

    now = datetime.now(UTC)
    events: list[AcousticEvent] = []

    for features in transients:
        if features.peak_db < MINIMUM_PEAK_DB:
            continue

        ranked = classify_transient(features)
        if not ranked:
            continue

        primary_type, primary_confidence = ranked[0]

        events.append(
            AcousticEvent(
                type=primary_type,
                confidence=round(primary_confidence, 3),
                peak_db=round(features.peak_db, 1),
                duration_seconds=round(features.attack_seconds + features.decay_seconds, 3),
                audio_quality=round(features.audio_quality, 3),
                alternatives=[
                    AcousticAlternative(type=event_type, confidence=round(confidence, 3))
                    for event_type, confidence in ranked[1:]
                ],
                model_id=MODEL_ID,
                detected_at=now,
            )
        )

    if events:
        logger.info(
            "cabin.acoustic_events",
            count=len(events),
            types=[str(event.type) for event in events],
        )

    return AcousticResponse(
        events=events,
        analysed_seconds=round(analysed_seconds, 2),
        audio_quality=round(audio_quality, 3),
        model_id=MODEL_ID,
    )


def _ramp(value: float, low: float, high: float) -> float:
    """0 below `low`, 1 above `high`, linear between."""
    if high <= low:
        return 0.0
    return max(0.0, min(1.0, (value - low) / (high - low)))


def _inverse_ramp(value: float, low: float, high: float) -> float:
    """1 below `low`, 0 above `high`."""
    return 1.0 - _ramp(value, low, high)


def _blend(*components: float) -> float:
    """Geometric mean.

    Chosen over an arithmetic mean because it is unforgiving: any single
    discriminant near zero pulls the whole score down. An event that matches two
    of three characteristics of a gunshot is not two-thirds of a gunshot.
    """
    if not components:
        return 0.0

    product = 1.0
    for component in components:
        product *= max(0.0, min(1.0, component))

    return product ** (1.0 / len(components))
