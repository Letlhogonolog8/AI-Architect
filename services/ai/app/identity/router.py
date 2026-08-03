"""Identity engine HTTP surface.

Everything here returns **scores**, never verdicts. Deciding what a score means
is the fusion engine's job in `packages/shared/src/identity/fusion.ts`, which
has the other modalities, the calibration and the policy. Thresholding here as
well would put the same decision in two places with two sets of constants.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, status

from app.identity.engine import (
    RecogniserUnavailableError,
    SampleRejectedError,
    available_modalities,
    build_template,
    compare,
    registered_modalities,
)
from app.identity.schemas import (
    ComparisonRequest,
    ComparisonResponse,
    EnrolmentRequest,
    EnrolmentResponse,
    OccupancyRequest,
    OccupancyResponse,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/identity", tags=["identity"])


@router.get("/capabilities")
async def capabilities() -> dict[str, object]:
    """What this build can actually do.

    Consumed by the API and surfaced in the console, so an operator can see that
    face recognition is not running rather than wondering why every assessment
    is UNCERTAIN.
    """
    ready = await available_modalities()

    return {
        "registered": registered_modalities(),
        "available": ready,
        "fusion_location": "packages/shared/src/identity/fusion.ts",
        "note": (
            "This service returns per-modality scores only. Fusion, banding and "
            "response policy are computed in the API from these scores."
        ),
    }


@router.post("/compare", response_model=ComparisonResponse)
async def compare_sample(request: ComparisonRequest) -> ComparisonResponse:
    """Compares a sample against an enrolled template."""
    try:
        return await compare(request)

    except RecogniserUnavailableError as error:
        # 501, not 500. The caller asked for something this build cannot do; it
        # is a deployment fact, not a fault, and the API drops the modality
        # rather than retrying.
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(error)
        ) from error

    except SampleRejectedError as error:
        # 422, not 400. The request was well-formed; the *sample* was not usable.
        # The API turns this into a missing modality rather than a failure.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error


@router.post("/enrol", response_model=EnrolmentResponse)
async def enrol(request: EnrolmentRequest) -> EnrolmentResponse:
    """Builds a wrapped template from several samples.

    The only thing returned is a handle. The embedding is wrapped under the
    tenant key and never leaves this service.
    """
    try:
        return await build_template(request)

    except RecogniserUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(error)
        ) from error

    except SampleRejectedError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error


@router.post("/occupancy", response_model=OccupancyResponse)
async def assess_occupancy(request: OccupancyRequest) -> OccupancyResponse:
    """Counts cabin occupants and matches only consenting, enrolled ones.

    **Not implemented, and the shape of the eventual implementation is
    constrained.** When a detector is installed it must count faces and compare
    only against `known_template_refs`. It must not compute or return an
    embedding, a bounding box, or any attribute for an unrecognised person —
    the count is the product, and a passenger who has not consented is counted
    and forgotten inside the request.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=(
            "Occupancy detection is not implemented in this build. It requires a "
            "face-detection model (counting only) plus the enrolled-occupant "
            "matcher. Unrecognised occupants are counted and never identified — "
            "see docs/adr/0007-biometric-identity.md."
        ),
    )
