"""Identity engine wire contracts.

Mirrors `packages/types/src/identity.ts`. The duplication is the cost of this
service being Python; the mitigation is that the API validates every payload
against its own Zod schemas, so drift surfaces as a 400 in CI rather than as a
wrong identity decision.

**No schema in this file carries a raw biometric.** Samples are accepted as a
transient reference to an object the caller has already uploaded, scored, and
then discarded. Nothing here can be persisted into a model that would retain a
face or a voice.
"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class IdentityModality(StrEnum):
    """Mirrors `IdentityModality` in packages/types/src/identity.ts."""

    FACE = "FACE"
    VOICE = "VOICE"
    DEVICE = "DEVICE"
    BEHAVIOUR = "BEHAVIOUR"
    INTERACTION = "INTERACTION"
    EXPLICIT = "EXPLICIT"


class SampleQuality(BaseModel):
    """Why a sample scored the quality it did.

    Returned alongside every comparison so a low score can be attributed to a
    bad sample rather than to a different person — the distinction that decides
    whether an operator is paged.
    """

    overall: float = Field(ge=0.0, le=1.0)
    #: Face: pixels between the eyes. Voice: seconds of clean speech.
    resolution: float | None = Field(default=None, ge=0.0, le=1.0)
    #: Face: illumination adequacy. Voice: signal-to-noise ratio.
    signal: float | None = Field(default=None, ge=0.0, le=1.0)
    #: Face: yaw/pitch deviation from frontal. Voice: not applicable.
    pose: float | None = Field(default=None, ge=0.0, le=1.0)
    #: Fraction of the subject obscured.
    occlusion: float | None = Field(default=None, ge=0.0, le=1.0)
    reasons: list[str] = Field(default_factory=list)


class LivenessResult(BaseModel):
    """Presentation-attack detection.

    Runs **before** comparison, and its result overrides the comparison score
    entirely. A photograph held to a lens can score a near-perfect face match;
    without liveness the highest-confidence result the system can produce is
    also the easiest to forge.
    """

    is_live: bool
    confidence: float = Field(ge=0.0, le=1.0)
    #: `PRINT`, `REPLAY`, `MASK_3D`, `DEEPFAKE`, `AUDIO_REPLAY`, `SYNTHETIC_SPEECH`.
    attack_type: str | None = None
    model_id: str


class ComparisonRequest(BaseModel):
    """Compare a captured sample against an enrolled template.

    `sample_ref` and `template_ref` are opaque handles. The gateway resolves
    them, holds the decrypted vectors in memory for the duration of the
    comparison, and never writes either to disk.
    """

    sample_ref: str = Field(min_length=8, max_length=256)
    template_ref: str = Field(min_length=8, max_length=256)
    modality: IdentityModality
    #: Enrolment the template belongs to. Echoed back for correlation.
    enrolment_id: str


class ComparisonResponse(BaseModel):
    """One modality's opinion, in the shape the fusion engine consumes.

    Deliberately does **not** contain a verdict. Deciding whether 0.71 means
    "same person" is the fusion engine's job, and it needs the other modalities
    and the calibration to do it. A per-modality threshold here would make that
    decision twice, in two places, with two sets of constants.
    """

    modality: IdentityModality
    score: float = Field(ge=0.0, le=1.0)
    quality: SampleQuality
    liveness: LivenessResult | None = None
    model_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*-v\d+$")
    enrolment_id: str
    captured_at: datetime
    inference_ms: int


class EnrolmentRequest(BaseModel):
    """Build a template from several samples.

    Multiple samples are required, not preferred: a single-sample template
    encodes that day's lighting and that moment's expression, and then rejects
    the same person tomorrow.
    """

    #: At least three, so the template averages out capture conditions.
    sample_refs: list[str] = Field(min_length=3, max_length=20)
    modality: IdentityModality
    subject_ref: str
    #: Tenant key id. The template is wrapped under it before storage.
    key_id: str


class EnrolmentResponse(BaseModel):
    #: Handle to the wrapped template. The only thing that leaves this service.
    template_ref: str
    model_id: str
    template_version: int
    samples_accepted: int
    samples_rejected: int
    #: Mean quality across accepted samples. The API refuses below 0.6.
    enrolment_quality: float = Field(ge=0.0, le=1.0)
    rejection_reasons: list[str] = Field(default_factory=list)


class OccupancyRequest(BaseModel):
    frame_ref: str
    expected_count: int | None = Field(default=None, ge=0, le=20)
    #: Templates of consenting occupants. Only these can ever be matched.
    known_template_refs: list[str] = Field(default_factory=list, max_length=50)


class OccupancyResponse(BaseModel):
    """Cabin occupancy.

    **Counting, not identification.** `unrecognised_count` is a number and
    nothing else: no embedding, no bounding box, no attributes. A passenger who
    has not consented is counted and then forgotten within the request.

    The operationally useful signal — "three people in a vehicle that should
    have one" — needs no identification at all.
    """

    occupant_count: int = Field(ge=0)
    recognised_count: int = Field(ge=0)
    unrecognised_count: int = Field(ge=0)
    expected_count: int | None = None
    unexpected_occupancy: bool
    confidence: float = Field(ge=0.0, le=1.0)
    model_id: str
    #: Enrolment ids matched. Only ever ids of consenting, enrolled occupants.
    recognised_enrolment_ids: list[str] = Field(default_factory=list)


class BehaviourWindow(BaseModel):
    """A window of driving telemetry, reduced to features.

    Features only — no positions, no timestamps, no route. A behaviour model
    that consumed raw location would be a movement-tracking system, and its
    output would be indistinguishable from one.
    """

    driver_id: str
    #: Feature name to value. Names must match the baseline's feature set.
    features: dict[str, float]
    observed_seconds: int = Field(ge=0)


class BehaviourResponse(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    quality: SampleQuality
    model_id: str
    #: Per-feature z-scores against the baseline. Drives the explanation.
    feature_deviations: dict[str, float] = Field(default_factory=dict)
    #: True when the baseline has too few trips to discriminate.
    baseline_insufficient: bool = False
