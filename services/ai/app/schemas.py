"""Wire contracts.

These mirror the TypeScript types in `packages/types`. The duplication is the
cost of the service being Python; the mitigation is that the API validates
every payload this service sends against its own Zod schemas, so a drift
between the two surfaces as a 400 in CI rather than as corrupt data.
"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class ThreatLevel(StrEnum):
    """Mirrors `ThreatLevel` in packages/types/src/enums.ts."""

    MINIMAL = "MINIMAL"
    GUARDED = "GUARDED"
    ELEVATED = "ELEVATED"
    HIGH = "HIGH"
    SEVERE = "SEVERE"


class ThreatEventType(StrEnum):
    """Mirrors `ThreatEventType` in packages/types/src/enums.ts."""

    HOTSPOT_ENTRY = "HOTSPOT_ENTRY"
    KNOWN_OFFENDER_PROXIMITY = "KNOWN_OFFENDER_PROXIMITY"
    TAILING_DETECTED = "TAILING_DETECTED"
    ROUTE_DEVIATION = "ROUTE_DEVIATION"
    UNUSUAL_STOP = "UNUSUAL_STOP"
    CROWD_FORMATION = "CROWD_FORMATION"
    WEAPON_DETECTED = "WEAPON_DETECTED"
    DURESS_SPEECH = "DURESS_SPEECH"
    JAMMER_DETECTED = "JAMMER_DETECTED"


class GeoPoint(BaseModel):
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


class TelemetryFrame(BaseModel):
    """One position report, as stored by the API."""

    recorded_at: datetime
    position: GeoPoint
    speed_kph: float | None = None
    heading: float | None = None
    ignition_on: bool = False
    harsh_braking: bool = False
    harsh_acceleration: bool = False


class RiskScoreRequest(BaseModel):
    vehicle_id: str
    organization_id: str
    # A window rather than a single point: risk is a property of a trajectory.
    # A stationary vehicle at 02:00 in a hotspot and one parked at home look
    # identical from one frame.
    frames: list[TelemetryFrame] = Field(min_length=1, max_length=1000)


class RiskScoreResponse(BaseModel):
    vehicle_id: str
    risk_score: int = Field(ge=0, le=100)
    threat_level: ThreatLevel
    confidence: float = Field(ge=0.0, le=1.0)
    model_id: str
    # Ranked drivers of the score. Required, not optional: an operator asked to
    # act on a number must be able to see why the model produced it.
    contributing_factors: list[str] = Field(default_factory=list)


class ThreatDetection(BaseModel):
    """Emitted to `POST /api/v1/threat-events` on the API."""

    type: ThreatEventType
    level: ThreatLevel
    confidence: float = Field(ge=0.0, le=1.0)
    model_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*-v\d+$")
    description: str
    vehicle_id: str | None = None
    position: GeoPoint | None = None


class HealthResponse(BaseModel):
    status: str
    environment: str
    loaded_models: list[str]
    inference_available: bool
