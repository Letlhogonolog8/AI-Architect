"""Behaviour engine wire contracts.

Mirrors `packages/types/src/behaviour.ts`. The duplication is the cost of this
service being Python; the mitigation is that the API validates every payload
against its own Zod schemas, so drift surfaces as a 400 in CI rather than as a
wrong threat score.

## Two rules every schema in this file obeys

**Nothing here names an emotion.** No `fear`, no `anger`, no `stress_level` as a
psychological state. Facial and vocal configurations do not reliably map onto
emotional states across people and contexts, so a field claiming otherwise would
be a confident lie in a product that dispatches armed responders. What is
modelled instead: skeletal geometry, motion energy, speech prosody, occupant
counts — measurements, and each one's departure from that person's own baseline.

**No raw sample is carried, in either direction.** Frames, audio and keypoint
series are referenced by an opaque handle the caller has already uploaded. They
are resolved, analysed in memory and discarded inside the request. A retained
keypoint series is a body-movement record of a named worker across months, and a
retained audio buffer is a recording of their conversations.
"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class BehaviourSignalClass(StrEnum):
    """Mirrors `BehaviourSignalClass` in packages/types/src/behaviour.ts."""

    POSTURE = "POSTURE"
    MOTION = "MOTION"
    VOCAL = "VOCAL"
    CABIN = "CABIN"
    CONTROL = "CONTROL"


class BehaviourSignal(StrEnum):
    """The closed catalogue of observable behaviours.

    Closed deliberately. An open-ended anomaly output would let a model invent
    categories nobody validated, and an operator would read meaning into a label
    that was never tested. Every name here describes something a person watching
    the footage could point at; none of them names a mental state.
    """

    HANDS_RAISED = "HANDS_RAISED"
    WRISTS_CONSTRAINED = "WRISTS_CONSTRAINED"
    HANDS_OFF_WHEEL_MOVING = "HANDS_OFF_WHEEL_MOVING"
    TORSO_TURNED_SUSTAINED = "TORSO_TURNED_SUSTAINED"
    SLUMPED_POSTURE = "SLUMPED_POSTURE"
    DRIVER_POSITION_VACATED = "DRIVER_POSITION_VACATED"
    OCCUPANT_ENCROACHING_DRIVER = "OCCUPANT_ENCROACHING_DRIVER"

    ELEVATED_MOTION_ENERGY = "ELEVATED_MOTION_ENERGY"
    SUDDEN_MOTION_BURST = "SUDDEN_MOTION_BURST"
    TREMOR_BAND_MOTION = "TREMOR_BAND_MOTION"
    ABNORMAL_STILLNESS = "ABNORMAL_STILLNESS"

    RAISED_VOCAL_EFFORT = "RAISED_VOCAL_EFFORT"
    PITCH_ELEVATION = "PITCH_ELEVATION"
    SPEECH_RATE_DEPARTURE = "SPEECH_RATE_DEPARTURE"
    VOCAL_INSTABILITY = "VOCAL_INSTABILITY"
    UNEXPECTED_SPEAKER_COUNT = "UNEXPECTED_SPEAKER_COUNT"
    PROLONGED_SILENCE_OCCUPIED = "PROLONGED_SILENCE_OCCUPIED"
    DURESS_PHRASE_SPOKEN = "DURESS_PHRASE_SPOKEN"

    OCCUPANCY_INCREASE_AT_STOP = "OCCUPANCY_INCREASE_AT_STOP"
    RAPID_MULTI_ENTRY = "RAPID_MULTI_ENTRY"
    DOOR_OPEN_IN_MOTION = "DOOR_OPEN_IN_MOTION"
    BELT_RELEASED_IN_MOTION = "BELT_RELEASED_IN_MOTION"

    ERRATIC_CONTROL_INPUT = "ERRATIC_CONTROL_INPUT"
    HARSH_MANOEUVRE_BURST = "HARSH_MANOEUVRE_BURST"
    UNCHARACTERISTIC_OVERSPEED = "UNCHARACTERISTIC_OVERSPEED"


class OccupantPosition(StrEnum):
    """A seat, never a person.

    `DRIVER` means the driver's seat. The behaviour engine does not identify
    anyone — that is the identity engine's job, under its own consent regime.
    """

    DRIVER = "DRIVER"
    FRONT_PASSENGER = "FRONT_PASSENGER"
    REAR_LEFT = "REAR_LEFT"
    REAR_CENTRE = "REAR_CENTRE"
    REAR_RIGHT = "REAR_RIGHT"
    UNKNOWN = "UNKNOWN"


MODEL_ID_PATTERN = r"^[a-z0-9][a-z0-9-]*-v\d+$"


class BehaviourObservation(BaseModel):
    """One detected signal.

    `strength` and `detector_confidence` are separate on purpose. A faint signal
    seen clearly and a strong signal seen through a dirty lens are different
    claims, and collapsing them into one number destroys exactly the distinction
    an operator needs to decide whether to believe it.
    """

    signal: BehaviourSignal
    strength: float = Field(ge=0.0, le=1.0)
    detector_confidence: float = Field(ge=0.0, le=1.0)
    quality: float = Field(ge=0.0, le=1.0)
    #: Departure from this subject's own baseline, in standard deviations.
    #: None when no baseline exists — the scorer halves the signal's weight.
    baseline_deviation: float | None = None
    duration_seconds: float = Field(ge=0.0)
    observed_at: datetime
    model_id: str = Field(pattern=MODEL_ID_PATTERN)


class SignalQuality(BaseModel):
    """Why an analyser scored the input quality it did."""

    overall: float = Field(ge=0.0, le=1.0)
    reasons: list[str] = Field(default_factory=list)


# ============================================================================
# Pose
# ============================================================================


class PoseRequest(BaseModel):
    """Analyse a short sequence of cabin frames for skeletal posture.

    A sequence rather than a frame: posture signals are defined by persistence.
    A single frame cannot distinguish "hands raised" from "mid-gesture", and
    that distinction is most of the false-positive budget.
    """

    #: Opaque handle to an already-uploaded frame sequence. Resolved, analysed
    #: and discarded inside this request.
    sequence_ref: str = Field(min_length=8, max_length=256)
    duration_seconds: float = Field(gt=0, le=120)
    vehicle_moving: bool
    expected_occupants: int | None = Field(default=None, ge=0, le=20)


class PoseResponse(BaseModel):
    """Derived posture signals.

    **No keypoints are returned.** The skeleton is consumed inside the request
    and discarded; what leaves is the signal list. Returning keypoints would
    make it trivial for a caller to accumulate a body-movement record of a named
    worker, which no part of this product has a lawful basis to hold.
    """

    position: OccupantPosition
    signals: list[BehaviourObservation] = Field(default_factory=list)
    #: Fraction of expected keypoints actually resolved. Low in darkness.
    keypoint_coverage: float = Field(ge=0.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0)
    quality: SignalQuality
    model_id: str = Field(pattern=MODEL_ID_PATTERN)


# ============================================================================
# Arousal
# ============================================================================


class ArousalIndicator(BaseModel):
    """One physiological proxy, as a departure from baseline."""

    #: `motion_energy`, `vocal_f0`, `speech_rate`, `postural_shift_rate`, …
    name: str
    deviation: float
    quality: float = Field(ge=0.0, le=1.0)
    signal_class: BehaviourSignalClass


class ArousalRequest(BaseModel):
    sequence_ref: str = Field(min_length=8, max_length=256)
    duration_seconds: float = Field(gt=0, le=300)
    #: Feature name to { mean, standardDeviation } for this subject.
    baseline: dict[str, dict[str, float]] = Field(default_factory=dict)


class ArousalResponse(BaseModel):
    """Observable physical activity relative to a person's own baseline.

    **Not an emotion, and not a stress level.** The same elevated reading is
    produced by a hijacking, an argument, a near miss, a hot cabin and running
    late — and the last four are thousands of times more common. The analyser
    reports the measurement; interpreting it needs context it does not have.

    The composite index itself is computed in TypeScript
    (`packages/shared/src/behaviour/arousal.ts`) from the indicators below, for
    the same reason identity fusion lives there: the number may be produced in
    an investigation and must be recomputable without loading a model.
    """

    indicators: list[ArousalIndicator] = Field(default_factory=list)
    baseline_missing: bool = False
    quality: SignalQuality
    model_id: str = Field(pattern=MODEL_ID_PATTERN)


# ============================================================================
# Voice
# ============================================================================


class VoiceStressRequest(BaseModel):
    """Prosodic analysis of a window of cabin audio.

    `duress_phrase_template_ref` is the only content-matching this engine ever
    performs, and it matches against a phrase the driver deliberately enrolled
    to signal with. Everything else is prosody: no transcription, no keyword
    spotting, no language identification.
    """

    audio_ref: str = Field(min_length=8, max_length=256)
    duration_seconds: float = Field(gt=0, le=300)
    baseline: dict[str, dict[str, float]] = Field(default_factory=dict)
    expected_speaker_count: int | None = Field(default=None, ge=0, le=20)
    duress_phrase_template_ref: str | None = None


class VoiceMeasure(BaseModel):
    """`f0_mean`, `f0_variability`, `jitter`, `shimmer`, `speech_rate`, `intensity`."""

    name: str
    deviation: float


class VoiceStressResponse(BaseModel):
    """Acoustic departures from a speaker's own baseline.

    ## What this is not

    It is not layered voice stress analysis and it is not a lie detector.
    Commercial voice-stress products have repeatedly failed independent
    validation — National Institute of Justice evaluations found deception
    detection at chance. Any analyser registered behind this contract that
    claims to detect deception is misusing it, and the engine's calibration
    reflects that scepticism: vocal signals carry the lowest detector
    reliability of any class.

    What is measured are four standard, reproducible acoustic quantities. Those
    measurements are real. What causes them is not recoverable from audio.
    """

    measures: list[VoiceMeasure] = Field(default_factory=list)
    signals: list[BehaviourObservation] = Field(default_factory=list)
    #: Distinct speakers detected. Counted, never identified.
    speaker_count: int = Field(ge=0)
    expected_speaker_count: int | None = None
    duress_phrase_detected: bool = False
    #: Signal-to-noise of the analysed audio. Road noise ruins this quickly.
    audio_quality: float = Field(ge=0.0, le=1.0)
    analysed_seconds: float = Field(ge=0.0)
    baseline_missing: bool = False
    model_id: str = Field(pattern=MODEL_ID_PATTERN)


# ============================================================================
# Cabin / passenger
# ============================================================================


class CabinRequest(BaseModel):
    sequence_ref: str = Field(min_length=8, max_length=256)
    duration_seconds: float = Field(gt=0, le=300)
    expected_occupants: int | None = Field(default=None, ge=0, le=20)
    vehicle_moving: bool
    #: Seconds since the vehicle last came to a stop, when known.
    seconds_since_stop: float | None = Field(default=None, ge=0)


class CabinResponse(BaseModel):
    """Cabin dynamics — the passenger behaviour surface.

    **Aggregate only, never per-person.** ADR-0007 established that passengers
    are counted and never identified; this extends the same boundary to
    behaviour. There is no per-passenger profile, no per-passenger score, and no
    field here that could carry one.

    A passenger has not consented to behavioural analysis and there is no lawful
    basis to build a record of one. The operationally useful signal — "two people
    entered a stationary vehicle within four seconds and the driver's hands went
    up" — is a property of the cabin, not of any individual in it.

    `poses` is keyed by *seat position*, which is what lets "someone is leaning
    into the driver's space" be distinguished from "a child is in the back". A
    seat is not an identity.
    """

    occupant_count: int = Field(ge=0)
    expected_count: int | None = None
    signals: list[BehaviourObservation] = Field(default_factory=list)
    poses: list[PoseResponse] = Field(default_factory=list)
    seconds_since_occupancy_change: float | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    model_id: str = Field(pattern=MODEL_ID_PATTERN)


# ============================================================================
# Abnormality
# ============================================================================


class AbnormalityRequest(BaseModel):
    """A behaviour window reduced to features.

    Features only — no positions, no destinations, no route identifiers, no
    times of day. Those would discriminate better and would make the baseline a
    movement-tracking record rather than a behavioural one.
    """

    driver_id: str
    features: dict[str, float]
    baseline: dict[str, dict[str, float]] = Field(default_factory=dict)
    baseline_window_count: int = Field(ge=0)
    observed_seconds: int = Field(ge=0)


class AbnormalityResponse(BaseModel):
    abnormality_score: float = Field(ge=0.0, le=1.0)
    deviations: dict[str, float] = Field(default_factory=dict)
    coverage: float = Field(ge=0.0, le=1.0)
    baseline_insufficient: bool = False
    model_id: str = Field(pattern=MODEL_ID_PATTERN)


class CapabilitiesResponse(BaseModel):
    """What this build can actually do.

    Surfaced in the console so an operator can see that pose analysis is not
    running, rather than wondering why every threat score is MINIMAL.
    """

    registered: list[str]
    available: list[str]
    scoring_location: str
    prohibited_uses: list[str]
    note: str
