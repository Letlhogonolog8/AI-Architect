"""Cabin Intelligence HTTP surface.

Everything here returns **detections**, never verdicts and never signals.
Mapping a detection onto a behaviour signal is a policy decision and lives in
`packages/shared/src/cabin/signals.ts`; scoring it lives in
`packages/shared/src/behaviour/threat-score.ts`.

Three layers, three languages' worth of separation, one reason: the number an
operator acts on must be recomputable and explainable without loading a model.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, status

from app.cabin.engine import (
    DetectorUnavailableError,
    IdentificationAttemptError,
    InputRejectedError,
    assess_tamper,
    available_kinds,
    count_occupants,
    detect_acoustic,
    detect_objects,
    registered_kinds,
)
from app.cabin.schemas import (
    AcousticRequest,
    AcousticResponse,
    CabinCapabilitiesResponse,
    DetectedObjectClass,
    ObjectDetectionRequest,
    ObjectDetectionResponse,
    OccupancyRequest,
    OccupancyResponse,
    TamperRequest,
    TamperResponse,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/cabin", tags=["cabin"])


@router.get("/capabilities", response_model=CabinCapabilitiesResponse)
async def capabilities() -> CabinCapabilitiesResponse:
    """What this build can actually see and hear.

    Surfaced in the console so an operator can tell "no weapon detected" from
    "no weapon detector installed". A monitoring system that is silently
    unmonitored is worse than one that is visibly offline, because the first
    reads as reassurance.
    """
    return CabinCapabilitiesResponse(
        registered=registered_kinds(),
        available=await available_kinds(),
        taxonomy=[str(entry) for entry in DetectedObjectClass],
        signal_mapping_location="packages/shared/src/cabin/signals.ts",
        prohibited_uses=[
            "Identifying any occupant, including by face embedding or re-identification.",
            "Inferring age, gender, ethnicity or emotional state from any occupant.",
            "Transcribing, keyword-spotting or otherwise processing speech content.",
            "Retaining frames or audio outside an opened incident.",
            "Treating a weapon detection as a finding of fact without human review.",
            "Driving the recording indicator from detection state.",
        ],
        note=(
            "This service returns detections only — object classes with their ambiguity "
            "sets, occupant counts, seat states, tamper conditions and acoustic events. "
            "It identifies nobody and processes no speech content. Weapon detections "
            "require human confirmation by contract and never escalate alone. See "
            "docs/adr/0009-cabin-intelligence.md."
        ),
    )


def _raise_for(error: Exception) -> None:
    """Maps engine errors onto the status codes the API expects."""
    if isinstance(error, DetectorUnavailableError):
        # 501, not 500. A deployment fact rather than a fault; the API records
        # the class as unavailable rather than retrying.
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(error)
        ) from error

    if isinstance(error, InputRejectedError):
        # 422, not 400. The request was well-formed; the *input* was not usable.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error

    if isinstance(error, IdentificationAttemptError):
        # 500, deliberately. A detector returning identity attributes is a
        # misconfigured deployment, not a bad request — nothing the caller can
        # change fixes it, and it must page someone rather than degrade quietly.
        logger.error("cabin.identification_rejected", detail=str(error))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(error)
        ) from error

    raise error


@router.post("/objects", response_model=ObjectDetectionResponse)
async def objects(request: ObjectDetectionRequest) -> ObjectDetectionResponse:
    """Detect objects in a staged frame sequence.

    Weapon-class detections are held to the highest gates in the platform: a
    0.75 confidence floor, two seconds of tracking, and a populated ambiguity
    set. A detector confidently reporting a handgun with no alternatives is
    rejected — it has either solved a problem nobody has solved, or been
    configured to suppress its own uncertainty, and the second is far likelier.
    """
    try:
        return await detect_objects(request)
    except Exception as error:  # remapped, then re-raised
        _raise_for(error)
        raise


@router.post("/occupancy", response_model=OccupancyResponse)
async def occupancy(request: OccupancyRequest) -> OccupancyResponse:
    """Count occupants and attribute them to seats.

    **Counting, never identifying.** No embedding is computed and no occupant is
    tracked across trips. Placement gates what may be reported: a driver-facing
    camera cannot return a cabin occupant count, because "1" would be a
    confident wrong answer in a vehicle carrying four.

    Temporal stabilisation happens in the API — this is the instantaneous read.
    """
    try:
        return await count_occupants(request)
    except Exception as error:
        _raise_for(error)
        raise


@router.post("/tamper", response_model=TamperResponse)
async def tamper(request: TamperRequest) -> TamperResponse:
    """Assess whether a camera has stopped being able to see.

    The one detector with no input-quality gate, because its entire job is to
    fire when quality collapses. Gating it would switch off the obstruction
    alarm at the moment the lens is covered.

    It reports the obstruction and does not guess whether it is tape or grime —
    that is not recoverable from the image.
    """
    try:
        return await assess_tamper(request)
    except Exception as error:
        _raise_for(error)
        raise


@router.post("/acoustic", response_model=AcousticResponse)
async def acoustic(request: AcousticRequest) -> AcousticResponse:
    """Detect non-speech acoustic events.

    Glass, impacts, gunshots, alarms — spectral signatures, not speech. No
    transcription, no keyword spotting, no speaker identification. Every event
    carries its ambiguity set, so a "gunshot" the detector nearly called a door
    slam arrives labelled as such.
    """
    try:
        return await detect_acoustic(request)
    except Exception as error:
        _raise_for(error)
        raise
