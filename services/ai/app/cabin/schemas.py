"""Cabin Intelligence wire contracts.

Mirrors `packages/types/src/cabin.ts`. The duplication is the cost of this
service being Python; the mitigation is that the API validates every payload
against its own Zod schemas, so drift surfaces as a 400 in CI rather than as a
wrong detection reaching an operator.

## Three rules every schema here obeys

**No frame or audio buffer crosses this boundary in either direction.** Media
arrives by opaque reference to something the caller has already staged, is
analysed in memory, and is discarded inside the request. Nothing in this file
can carry pixels or samples, so nothing downstream can accidentally persist
them.

**No detection identifies anyone.** Occupants are counted; seats are tracked by
position. There is no face embedding, no per-occupant record and no field that
could hold one — ADR-0007 decision 4, carried into the layer where it is
actually enforceable.

**Ambiguity is carried, not resolved.** Every classification schema has an
`alternatives` list. A detector choosing between a handgun and a phone must say
so; reading the argmax and discarding the rest is how a mobile phone becomes an
armed-response callout.
"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

MODEL_ID_PATTERN = r"^[a-z0-9][a-z0-9-]*-v\d+$"


class CameraPlacement(StrEnum):
    """Mirrors `CameraPlacement` in packages/types/src/cabin.ts."""

    DRIVER_FACING = "DRIVER_FACING"
    CABIN_WIDE = "CABIN_WIDE"
    REAR_CABIN = "REAR_CABIN"
    CARGO = "CARGO"


class TamperState(StrEnum):
    CLEAR = "CLEAR"
    OBSTRUCTED = "OBSTRUCTED"
    BLINDED = "BLINDED"
    MISALIGNED = "MISALIGNED"
    DISCONNECTED = "DISCONNECTED"


class SeatPosition(StrEnum):
    DRIVER = "DRIVER"
    FRONT_PASSENGER = "FRONT_PASSENGER"
    REAR_LEFT = "REAR_LEFT"
    REAR_CENTRE = "REAR_CENTRE"
    REAR_RIGHT = "REAR_RIGHT"


class SeatState(StrEnum):
    OCCUPIED = "OCCUPIED"
    EMPTY = "EMPTY"
    OBJECT = "OBJECT"
    UNKNOWN = "UNKNOWN"


class DetectedObjectClass(StrEnum):
    """The closed object taxonomy.

    The confusables — PHONE, WALLET, BOTTLE, TOOL, KEYS, REMOTE_CONTROL — are
    here because they are what a handgun gets mistaken for. A model restricted
    to threat classes has no way to say "this is probably a phone": it will
    label a dark rectangular object in a hand as a handgun, because that is the
    only answer available to it. Including the confusables gives the ambiguity
    somewhere to go.
    """

    HANDGUN = "HANDGUN"
    LONG_GUN = "LONG_GUN"
    KNIFE = "KNIFE"
    BLUNT_WEAPON = "BLUNT_WEAPON"

    ROPE_OR_STRAP = "ROPE_OR_STRAP"
    CABLE_TIE = "CABLE_TIE"
    ADHESIVE_TAPE = "ADHESIVE_TAPE"

    PHONE = "PHONE"
    WALLET = "WALLET"
    BOTTLE = "BOTTLE"
    TOOL = "TOOL"
    KEYS = "KEYS"
    REMOTE_CONTROL = "REMOTE_CONTROL"

    BAG = "BAG"
    BOX = "BOX"
    LAPTOP = "LAPTOP"
    DOCUMENT = "DOCUMENT"
    FOOD_OR_DRINK = "FOOD_OR_DRINK"

    PERSON = "PERSON"
    SEATBELT = "SEATBELT"
    UNKNOWN_OBJECT = "UNKNOWN_OBJECT"


WEAPON_CLASSES: frozenset[DetectedObjectClass] = frozenset(
    {
        DetectedObjectClass.HANDGUN,
        DetectedObjectClass.LONG_GUN,
        DetectedObjectClass.KNIFE,
        DetectedObjectClass.BLUNT_WEAPON,
    }
)

RESTRAINT_CLASSES: frozenset[DetectedObjectClass] = frozenset(
    {
        DetectedObjectClass.ROPE_OR_STRAP,
        DetectedObjectClass.CABLE_TIE,
        DetectedObjectClass.ADHESIVE_TAPE,
    }
)


class AcousticEventType(StrEnum):
    GLASS_BREAK = "GLASS_BREAK"
    IMPACT = "IMPACT"
    GUNSHOT = "GUNSHOT"
    DOOR_SLAM = "DOOR_SLAM"
    ALARM = "ALARM"
    SHOUTING = "SHOUTING"


# ============================================================================
# Object detection
# ============================================================================


class ClassScore(BaseModel):
    object_class: DetectedObjectClass
    confidence: float = Field(ge=0.0, le=1.0)


class ObjectDetection(BaseModel):
    """One tracked object.

    `alternatives` is the product, not diagnostic detail. An operator deciding
    whether to treat a driver as armed must see that the model was choosing
    between a handgun at 0.55 and a phone at 0.38 — those are the same pixels,
    and the second reading is by far the more common one.
    """

    object_class: DetectedObjectClass
    confidence: float = Field(ge=0.0, le=1.0)
    #: Competing classifications above the reporting floor, strongest first.
    alternatives: list[ClassScore] = Field(default_factory=list, max_length=8)
    #: Normalised [x, y, width, height], origin top-left.
    bounding_box: tuple[float, float, float, float]
    nearest_position: SeatPosition | None = None
    persistence_frames: int = Field(ge=0)
    persistence_seconds: float = Field(ge=0.0)
    frame_quality: float = Field(ge=0.0, le=1.0)
    model_id: str = Field(pattern=MODEL_ID_PATTERN)
    detected_at: datetime


class ObjectDetectionRequest(BaseModel):
    """Analyse a staged frame sequence for objects.

    A sequence rather than a single frame, because persistence is most of the
    false-positive budget: a real weapon is tracked across frames, a reflection
    is not.
    """

    sequence_ref: str = Field(min_length=8, max_length=256)
    duration_seconds: float = Field(gt=0, le=120)
    placement: CameraPlacement
    #: Restrict to these classes. Empty means the full taxonomy.
    classes_of_interest: list[DetectedObjectClass] = Field(default_factory=list)


class ObjectDetectionResponse(BaseModel):
    detections: list[ObjectDetection] = Field(default_factory=list)
    frames_analysed: int = Field(ge=0)
    mean_frame_quality: float = Field(ge=0.0, le=1.0)
    model_id: str = Field(pattern=MODEL_ID_PATTERN)


# ============================================================================
# Occupancy and seats
# ============================================================================


class SeatObservation(BaseModel):
    position: SeatPosition
    state: SeatState
    confidence: float = Field(ge=0.0, le=1.0)


class OccupancyRequest(BaseModel):
    sequence_ref: str = Field(min_length=8, max_length=256)
    duration_seconds: float = Field(gt=0, le=120)
    placement: CameraPlacement
    expected_count: int | None = Field(default=None, ge=0, le=20)


class OccupancyResponse(BaseModel):
    """A count, and nothing else.

    No embeddings, no attributes, no per-occupant record. The operationally
    decisive signal — "four people in a vehicle that should have one" — needs no
    identification whatsoever, and building the capability anyway creates a
    facility that is eventually misused.

    Temporal stabilisation happens in the API
    (`packages/shared/src/cabin/occupancy.ts`), which holds the per-vehicle
    tracker state. This returns the instantaneous read.
    """

    instantaneous_count: int = Field(ge=0)
    seats: list[SeatObservation] = Field(default_factory=list)
    #: Seats this placement could not resolve. Not the same as empty.
    unobserved_positions: list[SeatPosition] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    model_id: str = Field(pattern=MODEL_ID_PATTERN)


# ============================================================================
# Tamper
# ============================================================================


class TamperRequest(BaseModel):
    sequence_ref: str = Field(min_length=8, max_length=256)
    duration_seconds: float = Field(gt=0, le=120)
    #: Reference histogram from installation, for misalignment comparison.
    calibration_ref: str | None = None


class TamperResponse(BaseModel):
    """Why a camera cannot see.

    The engine reports the obstruction and does not attempt to say whether it is
    tape or grime — that distinction is not recoverable from the image, and
    guessing it would either cry wolf on every gravel road or miss a
    deliberately covered lens.
    """

    state: TamperState
    confidence: float = Field(ge=0.0, le=1.0)
    #: 0-1 fraction of the frame that is unusable.
    obstructed_fraction: float = Field(ge=0.0, le=1.0)
    mean_quality: float = Field(ge=0.0, le=1.0)
    model_id: str = Field(pattern=MODEL_ID_PATTERN)


# ============================================================================
# Audio
# ============================================================================


class AcousticAlternative(BaseModel):
    type: AcousticEventType
    confidence: float = Field(ge=0.0, le=1.0)


class AcousticEvent(BaseModel):
    type: AcousticEventType
    confidence: float = Field(ge=0.0, le=1.0)
    peak_db: float
    duration_seconds: float = Field(ge=0.0)
    audio_quality: float = Field(ge=0.0, le=1.0)
    alternatives: list[AcousticAlternative] = Field(default_factory=list, max_length=5)
    model_id: str = Field(pattern=MODEL_ID_PATTERN)
    detected_at: datetime


class AcousticRequest(BaseModel):
    """Analyse a window of cabin audio for non-speech events.

    **Events, never content.** No transcription, no keyword spotting, no
    language identification. A breaking window and a gunshot have short, loud,
    distinctive spectral profiles recognisable without any understanding of what
    anyone is saying — which is the entire reason a live cabin microphone is
    defensible.
    """

    audio_ref: str = Field(min_length=8, max_length=256)
    duration_seconds: float = Field(gt=0, le=300)
    #: Rolling ambient level, for relative thresholds.
    baseline_db: float | None = None


class AcousticResponse(BaseModel):
    events: list[AcousticEvent] = Field(default_factory=list)
    analysed_seconds: float = Field(ge=0.0)
    audio_quality: float = Field(ge=0.0, le=1.0)
    model_id: str = Field(pattern=MODEL_ID_PATTERN)


class CabinCapabilitiesResponse(BaseModel):
    registered: list[str]
    available: list[str]
    taxonomy: list[str]
    signal_mapping_location: str
    prohibited_uses: list[str]
    note: str
