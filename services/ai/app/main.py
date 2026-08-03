"""AEGISDRIVE inference gateway.

Architecture only: the HTTP surface and the boundary with the API are defined,
no models are served yet. Endpoints that would need a model return 501 rather
than a fabricated score — a made-up risk number in a hijacking-prevention
product is worse than no number, because an operator would act on it.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import Depends, FastAPI, HTTPException, status

from app.behaviour.router import router as behaviour_router
from app.cabin.router import router as cabin_router
from app.config import Settings, get_settings
from app.identity.router import router as identity_router
from app.registry import ModelRegistry
from app.schemas import HealthResponse, RiskScoreRequest, RiskScoreResponse

logger = structlog.get_logger(__name__)

registry: ModelRegistry | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Builds the registry once per process rather than per request."""
    global registry

    settings = get_settings()
    registry = ModelRegistry(settings.model_registry_path)

    logger.info(
        "gateway.started",
        environment=settings.environment,
        inference_available=registry.inference_available,
    )

    yield

    logger.info("gateway.stopped")


app = FastAPI(
    title="AEGISDRIVE AI Inference Gateway",
    version="0.1.0",
    lifespan=lifespan,
    # No public docs: this service is reachable only from inside the cluster.
    docs_url="/internal/docs",
    openapi_url="/internal/openapi.json",
)


# The Continuous Identity Engine's scoring surface. Fusion and banding live
# in the API (packages/shared/src/identity/fusion.ts); this contributes
# per-modality scores only.
app.include_router(identity_router)

# The Behaviour Intelligence Engine's measurement surface. Threat scoring,
# banding and response policy live in the API
# (packages/shared/src/behaviour/threat-score.ts); this contributes physical
# measurements only, and infers no emotional state — see
# docs/adr/0008-behaviour-intelligence.md.
app.include_router(behaviour_router)

# The Cabin Intelligence Engine's perception surface. Returns detections only:
# object classes with their ambiguity sets, occupant counts, seat states, tamper
# conditions and acoustic events. It identifies nobody and processes no speech
# content — see docs/adr/0009-cabin-intelligence.md.
app.include_router(cabin_router)


@app.get("/health/live", tags=["health"])
async def liveness() -> dict[str, str]:
    """Liveness probe. Answers only 'is the process running'."""
    return {"status": "alive"}


@app.get("/health/ready", response_model=HealthResponse, tags=["health"])
async def readiness(settings: Settings = Depends(get_settings)) -> HealthResponse:
    """Readiness probe, including which models are resident."""
    active = registry
    return HealthResponse(
        status="ready",
        environment=settings.environment,
        loaded_models=active.loaded() if active else [],
        inference_available=active.inference_available if active else False,
    )


@app.post("/v1/risk-score", response_model=RiskScoreResponse, tags=["inference"])
async def score_risk(request: RiskScoreRequest) -> RiskScoreResponse:
    """Scores a telemetry window.

    Returns 501 until a trained `risk-vN` artefact exists. Returning a
    heuristic here would be worse than failing: the API would persist it as a
    model-derived score, the console would render it beside a confidence
    figure, and an operator would treat a guess as an assessment.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=(
            "No risk model is deployed. See services/ai/README.md for the model "
            "governance requirements a model must satisfy before it can serve traffic."
        ),
    )
