"""Behaviour analyser contract, registry and safety rails.

Defines the interface a cabin analyser must implement, the rails that hold
whichever implementation is installed, and an unavailable-by-default posture
that reports honestly.

## Why the default reports unavailable rather than returning a plausible score

A pose analyser that returns "no signals detected" for everything looks like it
works. The dashboard renders, the threat scorer produces a number, and nobody
notices that the cabin has been unmonitored for a month — until a hijacking is
missed. In a product whose output can put armed responders next to a citizen,
failing loudly is the only safe default.

## Installing an analyser

    from app.behaviour.engine import register_analyser
    register_analyser(AnalyserKind.POSE, MoveNetPoseAnalyser())

Everything that is *policy* rather than *inference* — quality gating, signal
admissibility, persistence thresholds, the affect-claim guard — is applied here
rather than inside the analyser, so it cannot differ between implementations or
be quietly relaxed inside a vendor SDK.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import StrEnum

import structlog

from app.behaviour.schemas import (
    AbnormalityRequest,
    AbnormalityResponse,
    ArousalRequest,
    ArousalResponse,
    BehaviourObservation,
    BehaviourSignal,
    CabinRequest,
    CabinResponse,
    PoseRequest,
    PoseResponse,
    VoiceStressRequest,
    VoiceStressResponse,
)

logger = structlog.get_logger(__name__)


class AnalyserKind(StrEnum):
    POSE = "POSE"
    AROUSAL = "AROUSAL"
    VOICE = "VOICE"
    CABIN = "CABIN"


class AnalyserUnavailableError(RuntimeError):
    """No analyser is installed for this capability."""


class InputRejectedError(ValueError):
    """Input failed the quality gate before analysis was attempted."""


class AffectClaimError(RuntimeError):
    """An analyser returned an emotion label.

    Raised rather than sanitised, because an analyser that emits affect
    categories was built against a different contract than this one and its
    other outputs cannot be trusted either. See the guard below.
    """


# ---------------------------------------------------------------------------
# Persistence thresholds
# ---------------------------------------------------------------------------
#
# Mirrors `minimumDurationSeconds` in
# `packages/shared/src/behaviour/catalogue.ts`. Both sides enforce it, because a
# threshold checked in only one place eventually is not checked.
#
# Most false positives in cabin analysis are transients: a pothole reads as a
# motion burst, a shoulder check reads as a sustained torso turn, a cough reads
# as raised vocal effort. Requiring persistence removes the bulk of them at
# almost no cost to genuine detection, because real events last.

MINIMUM_DURATION_SECONDS: dict[BehaviourSignal, float] = {
    BehaviourSignal.HANDS_RAISED: 1.5,
    BehaviourSignal.WRISTS_CONSTRAINED: 8.0,
    BehaviourSignal.HANDS_OFF_WHEEL_MOVING: 4.0,
    BehaviourSignal.TORSO_TURNED_SUSTAINED: 6.0,
    BehaviourSignal.SLUMPED_POSTURE: 5.0,
    BehaviourSignal.DRIVER_POSITION_VACATED: 4.0,
    BehaviourSignal.OCCUPANT_ENCROACHING_DRIVER: 3.0,
    BehaviourSignal.ELEVATED_MOTION_ENERGY: 3.0,
    BehaviourSignal.SUDDEN_MOTION_BURST: 0.5,
    BehaviourSignal.TREMOR_BAND_MOTION: 10.0,
    BehaviourSignal.ABNORMAL_STILLNESS: 45.0,
    BehaviourSignal.RAISED_VOCAL_EFFORT: 3.0,
    BehaviourSignal.PITCH_ELEVATION: 4.0,
    BehaviourSignal.SPEECH_RATE_DEPARTURE: 5.0,
    BehaviourSignal.VOCAL_INSTABILITY: 5.0,
    BehaviourSignal.UNEXPECTED_SPEAKER_COUNT: 5.0,
    BehaviourSignal.PROLONGED_SILENCE_OCCUPIED: 90.0,
    BehaviourSignal.DURESS_PHRASE_SPOKEN: 0.0,
    BehaviourSignal.OCCUPANCY_INCREASE_AT_STOP: 0.0,
    BehaviourSignal.RAPID_MULTI_ENTRY: 0.0,
    BehaviourSignal.DOOR_OPEN_IN_MOTION: 1.0,
    BehaviourSignal.BELT_RELEASED_IN_MOTION: 1.0,
    BehaviourSignal.ERRATIC_CONTROL_INPUT: 10.0,
    BehaviourSignal.HARSH_MANOEUVRE_BURST: 0.0,
    BehaviourSignal.UNCHARACTERISTIC_OVERSPEED: 20.0,
}

#: Below this input quality, analysis is refused rather than attempted.
#:
#: Analysing an unusable input produces meaningless signals that the threat
#: scorer would then weight and act on. Refusing is more useful: a missing
#: analyser is correctly treated as absence of evidence, whereas a garbage
#: signal is treated as evidence.
MINIMUM_INPUT_QUALITY: dict[AnalyserKind, float] = {
    AnalyserKind.POSE: 0.35,
    AnalyserKind.AROUSAL: 0.30,
    # Highest bar of the four. Cabin audio at speed is frequently unusable, and
    # prosodic measures degrade faster than anything else in this engine.
    AnalyserKind.VOICE: 0.45,
    AnalyserKind.CABIN: 0.35,
}


# ---------------------------------------------------------------------------
# The affect guard
# ---------------------------------------------------------------------------
#
# Substrings that must never appear in a signal name or an indicator name.
#
# This is the one rule in the engine enforced against the *analyser* rather than
# against its input, and it is the most important one. Inferring emotion from
# faces or voices is scientifically unsupported — facial configurations do not
# map reliably onto emotional states across people and contexts — and under the
# EU AI Act, inferring emotion from workers outside a safety purpose is a
# prohibited practice rather than a regulated one.
#
# A vendor SDK dropped in behind this contract will very likely want to return
# `emotion: "fear"`, because that is what the market asks for. This guard makes
# that a hard error at the boundary instead of a field that quietly reaches an
# operator's screen and gets believed.

_PROHIBITED_AFFECT_TERMS: frozenset[str] = frozenset(
    {
        "emotion",
        "affect",
        "fear",
        "fearful",
        "anger",
        "angry",
        "sad",
        "sadness",
        "happy",
        "happiness",
        "disgust",
        "surprise",
        "contempt",
        "anxiety",
        "anxious",
        "panic",
        "distress_emotion",
        "mood",
        "sentiment",
        "deception",
        "deceptive",
        "lying",
        "truthfulness",
        "guilt",
        "intent",
    }
)


def guard_against_affect_claims(names: list[str], source: str) -> None:
    """Rejects any output that names an emotion, mood or deception state.

    Raises rather than filtering. An analyser emitting these was built against a
    different contract, and the rest of its output cannot be trusted to mean
    what this engine assumes it means.
    """
    for name in names:
        lowered = name.lower()
        for term in _PROHIBITED_AFFECT_TERMS:
            if term in lowered:
                raise AffectClaimError(
                    f"Analyser '{source}' returned '{name}', which names an emotional, "
                    f"mood or deception state. This engine reports physical measurements "
                    f"only — see docs/adr/0008-behaviour-intelligence.md. Inferring "
                    f"emotion is not scientifically supported and, for workers, is a "
                    f"prohibited practice under the EU AI Act."
                )


# ---------------------------------------------------------------------------
# Analyser contracts
# ---------------------------------------------------------------------------


class CabinAnalyser(ABC):
    """Base for every analyser. Narrow by design."""

    #: Versioned, e.g. `pose-v2`. Enforced by the API's schema and by pydantic.
    model_id: str

    @abstractmethod
    async def is_available(self) -> bool: ...

    @abstractmethod
    async def assess_input_quality(self, ref: str) -> float:
        """Score input usability in [0, 1]. Must not require a baseline."""


class PoseAnalyser(CabinAnalyser):
    """Skeletal posture over a short frame sequence."""

    @abstractmethod
    async def analyse(self, request: PoseRequest) -> PoseResponse: ...


class ArousalAnalyser(CabinAnalyser):
    """Physiological arousal proxies. Never an emotion."""

    @abstractmethod
    async def analyse(self, request: ArousalRequest) -> ArousalResponse: ...


class VoiceAnalyser(CabinAnalyser):
    """Speech prosody. Never speech content, except an enrolled duress phrase."""

    @abstractmethod
    async def analyse(self, request: VoiceStressRequest) -> VoiceStressResponse: ...


class CabinDynamicsAnalyser(CabinAnalyser):
    """Aggregate cabin composition and movement. Never per-passenger."""

    @abstractmethod
    async def analyse(self, request: CabinRequest) -> CabinResponse: ...


_analysers: dict[AnalyserKind, CabinAnalyser] = {}


def register_analyser(kind: AnalyserKind, analyser: CabinAnalyser) -> None:
    """Installs an analyser. Called once at startup by a build that has one."""
    _analysers[kind] = analyser
    logger.info("analyser.registered", kind=kind, model_id=analyser.model_id)


def registered_kinds() -> list[str]:
    return sorted(str(kind) for kind in _analysers)


async def available_kinds() -> list[str]:
    ready = [kind for kind, analyser in _analysers.items() if await analyser.is_available()]
    return sorted(str(kind) for kind in ready)


def _require(kind: AnalyserKind) -> CabinAnalyser:
    analyser = _analysers.get(kind)

    if analyser is None:
        raise AnalyserUnavailableError(
            f"No {kind} analyser is installed in this build. Install the 'vision' or "
            f"'inference' extra and register one; the behaviour engine will not "
            f"fabricate a signal. See services/ai/README.md."
        )

    return analyser


async def _gate_input(kind: AnalyserKind, analyser: CabinAnalyser, ref: str) -> float:
    if not await analyser.is_available():
        raise AnalyserUnavailableError(f"The {kind} analyser is installed but not ready.")

    quality = await analyser.assess_input_quality(ref)
    minimum = MINIMUM_INPUT_QUALITY[kind]

    if quality < minimum:
        raise InputRejectedError(
            f"Input quality {quality:.2f} is below the {minimum} minimum for {kind}. "
            f"An unusable input produces meaningless signals, and a meaningless "
            f"signal is weighted as evidence."
        )

    return quality


def admissible(observations: list[BehaviourObservation], source: str) -> list[BehaviourObservation]:
    """Drops observations that fail the persistence gate.

    Also runs the affect guard over the signal names. Both checks happen here,
    after the analyser has returned, so that no implementation can skip them.
    """
    guard_against_affect_claims([str(o.signal) for o in observations], source)

    kept: list[BehaviourObservation] = []

    for observation in observations:
        minimum = MINIMUM_DURATION_SECONDS.get(observation.signal)

        if minimum is None:
            # An unknown signal is not passed through. The catalogue is closed
            # so that an operator never sees a label nobody validated.
            logger.warning(
                "behaviour.unknown_signal", signal=observation.signal, source=source
            )
            continue

        if observation.duration_seconds < minimum:
            logger.debug(
                "behaviour.transient_dropped",
                signal=observation.signal,
                duration=observation.duration_seconds,
                minimum=minimum,
            )
            continue

        kept.append(observation)

    return kept


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


async def analyse_pose(request: PoseRequest) -> PoseResponse:
    analyser = _require(AnalyserKind.POSE)
    await _gate_input(AnalyserKind.POSE, analyser, request.sequence_ref)

    assert isinstance(analyser, PoseAnalyser)
    response = await analyser.analyse(request)
    response.signals = admissible(response.signals, analyser.model_id)

    return response


async def analyse_arousal(request: ArousalRequest) -> ArousalResponse:
    analyser = _require(AnalyserKind.AROUSAL)
    await _gate_input(AnalyserKind.AROUSAL, analyser, request.sequence_ref)

    assert isinstance(analyser, ArousalAnalyser)
    response = await analyser.analyse(request)

    # Indicator names go through the affect guard too. This is the surface most
    # likely to grow a `fear_score` field, because that is what the datasheets
    # of every commercial affect SDK advertise.
    guard_against_affect_claims([i.name for i in response.indicators], analyser.model_id)

    return response


async def analyse_voice(request: VoiceStressRequest) -> VoiceStressResponse:
    analyser = _require(AnalyserKind.VOICE)
    await _gate_input(AnalyserKind.VOICE, analyser, request.audio_ref)

    assert isinstance(analyser, VoiceAnalyser)
    response = await analyser.analyse(request)

    guard_against_affect_claims([m.name for m in response.measures], analyser.model_id)
    response.signals = admissible(response.signals, analyser.model_id)

    return response


async def analyse_cabin(request: CabinRequest) -> CabinResponse:
    analyser = _require(AnalyserKind.CABIN)
    await _gate_input(AnalyserKind.CABIN, analyser, request.sequence_ref)

    assert isinstance(analyser, CabinDynamicsAnalyser)
    response = await analyser.analyse(request)
    response.signals = admissible(response.signals, analyser.model_id)

    for pose in response.poses:
        pose.signals = admissible(pose.signals, pose.model_id)

    return response


async def analyse_abnormality(request: AbnormalityRequest) -> AbnormalityResponse:
    """Abnormality needs no analyser — it is arithmetic over supplied features.

    Implemented in `app.behaviour.abnormal` rather than behind the registry,
    because there is no model to install: it compares a feature vector against a
    baseline. Kept in this service anyway so the feature extraction and the
    comparison stay in one place.
    """
    from app.behaviour.abnormal import score_window

    return score_window(request)
