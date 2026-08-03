"""Behaviour engine HTTP surface.

Everything here returns **measurements**, never verdicts. Combining them into a
threat score is the API's job, in
`packages/shared/src/behaviour/threat-score.ts`, which holds the calibration,
the base rate and the corroboration rules. Scoring here as well would put the
same decision in two places with two sets of constants that will drift.

The split is the same one the identity engine uses, for the same reason: the
number an operator acts on must be recomputable and explainable without loading
a model.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, status

from app.behaviour.engine import (
    AffectClaimError,
    AnalyserUnavailableError,
    InputRejectedError,
    analyse_abnormality,
    analyse_arousal,
    analyse_cabin,
    analyse_pose,
    analyse_voice,
    available_kinds,
    registered_kinds,
)
from app.behaviour.schemas import (
    AbnormalityRequest,
    AbnormalityResponse,
    ArousalRequest,
    ArousalResponse,
    CabinRequest,
    CabinResponse,
    CapabilitiesResponse,
    PoseRequest,
    PoseResponse,
    VoiceStressRequest,
    VoiceStressResponse,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/behaviour", tags=["behaviour"])


@router.get("/capabilities", response_model=CapabilitiesResponse)
async def capabilities() -> CapabilitiesResponse:
    """What this build can actually do.

    Surfaced in the console so an operator can see that pose analysis is not
    running, rather than wondering why every threat score is MINIMAL. A
    monitoring system that is silently unmonitored is worse than one that is
    visibly offline.
    """
    return CapabilitiesResponse(
        registered=registered_kinds(),
        available=await available_kinds(),
        scoring_location="packages/shared/src/behaviour/threat-score.ts",
        prohibited_uses=[
            "Emotion, mood or affect inference of any kind.",
            "Deception detection or any voice-stress lie-detection claim.",
            "Driver performance management, ranking, coaching or discipline.",
            "Per-passenger behavioural profiling.",
            "Autonomous immobilisation or any physical action without an operator.",
        ],
        note=(
            "This service returns physical measurements only — skeletal geometry, "
            "motion energy, speech prosody and occupant counts, each relative to the "
            "subject's own baseline. It does not infer emotional state. Threat "
            "scoring, banding and response policy are computed in the API. See "
            "docs/adr/0008-behaviour-intelligence.md."
        ),
    )


def _raise_for(error: Exception) -> None:
    """Maps engine errors onto the status codes the API expects."""
    if isinstance(error, AnalyserUnavailableError):
        # 501, not 500. The caller asked for something this build cannot do; it
        # is a deployment fact rather than a fault, and the API records the
        # class as unavailable rather than retrying.
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(error)
        ) from error

    if isinstance(error, InputRejectedError):
        # 422, not 400. The request was well-formed; the *input* was not usable.
        # The API turns this into a missing evidence class rather than a failure.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error

    if isinstance(error, AffectClaimError):
        # 500, and deliberately so. An analyser returning an emotion label is a
        # misconfigured deployment, not a bad request — the operator's payload
        # was fine and there is nothing they can change to fix it. It must page
        # someone rather than degrade quietly.
        logger.error("behaviour.affect_claim_rejected", detail=str(error))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(error)
        ) from error

    raise error


@router.post("/pose", response_model=PoseResponse)
async def pose(request: PoseRequest) -> PoseResponse:
    """Skeletal posture over a short frame sequence.

    Returns derived signals only. Keypoints are consumed and discarded inside
    the request — a retained keypoint series is a continuous record of how a
    named worker's body moved across months of their job.
    """
    try:
        return await analyse_pose(request)
    except Exception as error:  # remapped, then re-raised
        _raise_for(error)
        raise


@router.post("/arousal", response_model=ArousalResponse)
async def arousal(request: ArousalRequest) -> ArousalResponse:
    """Physical activity relative to the subject's own baseline.

    **Not stress, and not emotion.** The same elevated reading is produced by a
    hijacking, an argument, a near miss and running late — and the last three
    are thousands of times more common. The composite index is assembled in the
    API from these indicators.
    """
    try:
        return await analyse_arousal(request)
    except Exception as error:
        _raise_for(error)
        raise


@router.post("/voice", response_model=VoiceStressResponse)
async def voice(request: VoiceStressRequest) -> VoiceStressResponse:
    """Speech prosody relative to the speaker's own baseline.

    Not a lie detector. Commercial voice-stress products have failed independent
    validation repeatedly, and the calibration reflects that: vocal signals
    carry the lowest detector reliability of any class in this engine.

    No transcription and no speaker identification. Speakers are counted; the
    count is discarded with the audio.
    """
    try:
        return await analyse_voice(request)
    except Exception as error:
        _raise_for(error)
        raise


@router.post("/cabin", response_model=CabinResponse)
async def cabin(request: CabinRequest) -> CabinResponse:
    """Aggregate cabin dynamics.

    Counting and composition, never per-passenger profiling. An unenrolled
    passenger is counted and forgotten inside the request — see
    docs/adr/0007-biometric-identity.md, whose boundary this extends from
    identity to behaviour.
    """
    try:
        return await analyse_cabin(request)
    except Exception as error:
        _raise_for(error)
        raise


@router.post("/abnormality", response_model=AbnormalityResponse)
async def abnormality(request: AbnormalityRequest) -> AbnormalityResponse:
    """How far this window sits from the driver's own normal.

    Needs no model — it is a z-score against a baseline — so unlike the other
    routes it serves in every build. Compared against the driver's own history
    rather than a population, so that the engine cannot flag people for being
    statistically unusual.
    """
    return await analyse_abnormality(request)
