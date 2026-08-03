"""Cabin detector contracts, registry and safety rails.

Defines the interface a cabin detector must implement, the rails that hold
whichever implementation is installed, and an unavailable-by-default posture
that reports honestly.

## Why the default reports unavailable

An object detector that returns an empty list for everything looks like it
works. Frames flow, the pipeline runs, the dashboard renders "no threats" — and
nobody notices the cabin has been unmonitored for a month until a hijacking is
missed. Returning 501 is the only safe default for a component whose silence is
indistinguishable from safety.

## Installing a detector

    from app.cabin.engine import register_detector, DetectorKind
    register_detector(DetectorKind.OBJECT, YoloCabinDetector())

Everything that is *policy* rather than inference — the closed taxonomy, the
ambiguity requirement, persistence gating, the identification guard — is applied
here rather than inside the detector, so it cannot differ between vendors or be
quietly relaxed inside an SDK.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import StrEnum

import structlog

from app.cabin.schemas import (
    WEAPON_CLASSES,
    AcousticRequest,
    AcousticResponse,
    ObjectDetection,
    ObjectDetectionRequest,
    ObjectDetectionResponse,
    OccupancyRequest,
    OccupancyResponse,
    TamperRequest,
    TamperResponse,
)

logger = structlog.get_logger(__name__)


class DetectorKind(StrEnum):
    OBJECT = "OBJECT"
    OCCUPANCY = "OCCUPANCY"
    TAMPER = "TAMPER"
    ACOUSTIC = "ACOUSTIC"


class DetectorUnavailableError(RuntimeError):
    """No detector is installed for this capability."""


class InputRejectedError(ValueError):
    """Input failed the quality gate before analysis was attempted."""


class IdentificationAttemptError(RuntimeError):
    """A detector returned something that identifies a person.

    Raised rather than stripped. A detector emitting identity attributes was
    built against a different contract, and the rest of its output cannot be
    trusted to respect the boundaries this engine depends on.
    """


# ---------------------------------------------------------------------------
# The identification guard
# ---------------------------------------------------------------------------
#
# Field names that must never appear in a detector's output.
#
# ADR-0007 decision 4 established that occupants are counted and never
# identified. That boundary is trivial to state and easy to breach by accident:
# most off-the-shelf person detectors ship with face embedding, age estimation,
# gender classification and re-identification in the same model, enabled by
# default, because that is what the datasheets advertise.
#
# This makes the breach a hard error at the boundary instead of a field that
# quietly reaches a database and becomes a biometric corpus nobody authorised.

_PROHIBITED_IDENTITY_TERMS: frozenset[str] = frozenset(
    {
        "embedding",
        "faceprint",
        "face_vector",
        "descriptor",
        "identity",
        "person_id",
        "track_id_global",
        "reid",
        "re_identification",
        "age",
        "gender",
        "sex",
        "ethnicity",
        "race",
        "skin_tone",
        "emotion",
        "affect",
    }
)


def guard_against_identification(field_names: list[str], source: str) -> None:
    """Rejects detector output that identifies or classifies a person."""
    for name in field_names:
        lowered = name.lower()
        for term in _PROHIBITED_IDENTITY_TERMS:
            if term in lowered:
                raise IdentificationAttemptError(
                    f"Detector '{source}' returned '{name}', which identifies or "
                    f"classifies a person. The cabin engine counts occupants and "
                    f"never identifies them — see docs/adr/0007-biometric-identity.md "
                    f"and docs/adr/0009-cabin-intelligence.md. Disable re-identification "
                    f"and demographic heads before registering this detector."
                )


# ---------------------------------------------------------------------------
# Gates
# ---------------------------------------------------------------------------

#: Below this input quality, analysis is refused rather than attempted.
#:
#: Each threshold is a separate judgement rather than a shared default.
MINIMUM_INPUT_QUALITY: dict[DetectorKind, float] = {
    # Highest bar of the four. Object classification degrades fastest with
    # image quality, and it is the detector whose errors are most costly.
    DetectorKind.OBJECT: 0.40,
    DetectorKind.OCCUPANCY: 0.30,
    # Tamper detection deliberately has no floor: it is the detector whose whole
    # job is to fire when quality collapses. Gating it on quality would switch
    # off the obstruction alarm exactly when the lens gets covered.
    DetectorKind.TAMPER: 0.0,
    DetectorKind.ACOUSTIC: 0.35,
}

#: A weapon-class detection below this confidence is dropped before it leaves
#: this service.
#:
#: Matches `WEAPON_REPORTING_FLOOR` in `packages/shared/src/cabin/weapon.ts`.
#: Both sides enforce it, because a threshold checked in one place eventually is
#: not checked.
WEAPON_REPORTING_FLOOR = 0.75

#: Seconds a weapon candidate must be tracked before it is reported.
WEAPON_MINIMUM_PERSISTENCE_SECONDS = 2.0

#: Weapon detections must carry an ambiguity set, or be rejected.
#:
#: A detector confidently reporting a handgun with no alternatives has either
#: solved a problem nobody has solved, or been configured to suppress its own
#: uncertainty. Both are reasons to distrust the output, and the second is far
#: more likely.
REQUIRE_WEAPON_ALTERNATIVES = True


# ---------------------------------------------------------------------------
# Detector contracts
# ---------------------------------------------------------------------------


class CabinDetector(ABC):
    """Base for every cabin detector."""

    #: Versioned, e.g. `cabin-objects-v2`. Enforced by pydantic and by the API.
    model_id: str

    @abstractmethod
    async def is_available(self) -> bool: ...

    @abstractmethod
    async def assess_input_quality(self, ref: str) -> float:
        """Score input usability in [0, 1]."""


class ObjectDetector(CabinDetector):
    @abstractmethod
    async def detect(self, request: ObjectDetectionRequest) -> ObjectDetectionResponse: ...


class OccupancyDetector(CabinDetector):
    @abstractmethod
    async def count(self, request: OccupancyRequest) -> OccupancyResponse: ...


class TamperDetector(CabinDetector):
    @abstractmethod
    async def assess(self, request: TamperRequest) -> TamperResponse: ...


class AcousticDetector(CabinDetector):
    @abstractmethod
    async def detect(self, request: AcousticRequest) -> AcousticResponse: ...


_detectors: dict[DetectorKind, CabinDetector] = {}


def register_detector(kind: DetectorKind, detector: CabinDetector) -> None:
    """Installs a detector. Called once at startup by a build that has one."""
    _detectors[kind] = detector
    logger.info("cabin.detector_registered", kind=kind, model_id=detector.model_id)


def registered_kinds() -> list[str]:
    return sorted(str(kind) for kind in _detectors)


async def available_kinds() -> list[str]:
    ready = [kind for kind, detector in _detectors.items() if await detector.is_available()]
    return sorted(str(kind) for kind in ready)


def _require(kind: DetectorKind) -> CabinDetector:
    detector = _detectors.get(kind)

    if detector is None:
        raise DetectorUnavailableError(
            f"No {kind} detector is installed in this build. Install the 'vision' "
            f"extra and register one; the cabin engine will not fabricate a "
            f"detection. See services/ai/README.md."
        )

    return detector


async def _gate(kind: DetectorKind, detector: CabinDetector, ref: str) -> float:
    if not await detector.is_available():
        raise DetectorUnavailableError(f"The {kind} detector is installed but not ready.")

    quality = await detector.assess_input_quality(ref)
    minimum = MINIMUM_INPUT_QUALITY[kind]

    if quality < minimum:
        raise InputRejectedError(
            f"Input quality {quality:.2f} is below the {minimum} minimum for {kind}. "
            f"An unusable input produces meaningless detections, and a meaningless "
            f"detection is weighted as evidence."
        )

    return quality


def admit_detections(
    detections: list[ObjectDetection], source: str
) -> list[ObjectDetection]:
    """Applies the weapon gates and drops anything that fails them.

    Non-weapon detections pass through untouched — a misclassified bag costs
    nothing. Weapon classes are held to the confidence floor, the persistence
    floor and the ambiguity requirement, because they are the only detections
    that can end with an armed responder beside a citizen.
    """
    kept: list[ObjectDetection] = []

    for detection in detections:
        if detection.object_class not in WEAPON_CLASSES:
            kept.append(detection)
            continue

        if detection.confidence < WEAPON_REPORTING_FLOOR:
            logger.debug(
                "cabin.weapon_below_floor",
                confidence=detection.confidence,
                floor=WEAPON_REPORTING_FLOOR,
                source=source,
            )
            continue

        if detection.persistence_seconds < WEAPON_MINIMUM_PERSISTENCE_SECONDS:
            logger.debug(
                "cabin.weapon_transient",
                persistence=detection.persistence_seconds,
                source=source,
            )
            continue

        if REQUIRE_WEAPON_ALTERNATIVES and not detection.alternatives:
            # Rejected, not passed through with a warning. A detector that
            # suppresses its own uncertainty on the highest-stakes class in the
            # taxonomy is misconfigured, and its confidence cannot be read at
            # face value.
            logger.warning(
                "cabin.weapon_no_alternatives",
                object_class=detection.object_class,
                confidence=detection.confidence,
                source=source,
            )
            continue

        kept.append(detection)

    return kept


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


async def detect_objects(request: ObjectDetectionRequest) -> ObjectDetectionResponse:
    detector = _require(DetectorKind.OBJECT)
    await _gate(DetectorKind.OBJECT, detector, request.sequence_ref)

    assert isinstance(detector, ObjectDetector)
    response = await detector.detect(request)

    guard_against_identification(
        [field for detection in response.detections for field in detection.model_dump()],
        detector.model_id,
    )
    response.detections = admit_detections(response.detections, detector.model_id)

    return response


async def count_occupants(request: OccupancyRequest) -> OccupancyResponse:
    detector = _require(DetectorKind.OCCUPANCY)
    await _gate(DetectorKind.OCCUPANCY, detector, request.sequence_ref)

    assert isinstance(detector, OccupancyDetector)
    response = await detector.count(request)

    # The surface most likely to grow an identity field, because every
    # off-the-shelf person detector offers re-identification as a feature.
    guard_against_identification(list(response.model_dump().keys()), detector.model_id)

    return response


async def assess_tamper(request: TamperRequest) -> TamperResponse:
    detector = _require(DetectorKind.TAMPER)
    await _gate(DetectorKind.TAMPER, detector, request.sequence_ref)

    assert isinstance(detector, TamperDetector)
    return await detector.assess(request)


async def detect_acoustic(request: AcousticRequest) -> AcousticResponse:
    detector = _require(DetectorKind.ACOUSTIC)
    await _gate(DetectorKind.ACOUSTIC, detector, request.audio_ref)

    assert isinstance(detector, AcousticDetector)
    return await detector.detect(request)
