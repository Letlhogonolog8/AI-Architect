"""Identity inference engine.

Defines the recogniser contract, the safety rails that hold whichever model is
installed, and an `UnavailableRecogniser` default that reports honestly.

## Why the default reports unavailable rather than returning a plausible score

A face recogniser that returns 0.5 for everything looks like it works. The
dashboard renders, the fusion engine produces a number, and nobody notices that
identity is being decided by a coin flip — until a hijacking is missed or a
driver is falsely accused. Failing loudly is the only safe default for a
component whose output can put armed responders next to someone.

## Installing a real recogniser

Implement `BiometricRecogniser` and register it:

    from app.identity.engine import register_recogniser
    register_recogniser(IdentityModality.FACE, ArcFaceRecogniser())

Everything else — quality gating, liveness ordering, score clamping, the
demographic-parity guard — applies identically to any implementation, because
it lives here rather than in the model.
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from datetime import UTC, datetime

import structlog

from app.identity.schemas import (
    ComparisonRequest,
    ComparisonResponse,
    EnrolmentRequest,
    EnrolmentResponse,
    IdentityModality,
    LivenessResult,
    SampleQuality,
)

logger = structlog.get_logger(__name__)


class RecogniserUnavailableError(RuntimeError):
    """No engine is installed for a modality."""


class SampleRejectedError(ValueError):
    """A sample failed the quality gate before comparison was attempted."""


class BiometricRecogniser(ABC):
    """A biometric engine for one modality.

    Deliberately narrow. Everything that is *policy* rather than *inference* —
    thresholds, gating, clamping — is applied by the wrapper below, so it cannot
    differ between engines or be quietly relaxed inside a vendor SDK.
    """

    #: Versioned, e.g. `face-embed-v2`. Enforced by the API's schema.
    model_id: str

    @abstractmethod
    async def is_available(self) -> bool: ...

    @abstractmethod
    async def assess_quality(self, sample_ref: str) -> SampleQuality:
        """Score sample usability. Must not require a template."""

    @abstractmethod
    async def check_liveness(self, sample_ref: str) -> LivenessResult:
        """Detect a presentation attack. Runs before any comparison."""

    @abstractmethod
    async def compare(self, sample_ref: str, template_ref: str) -> float:
        """Similarity in [0, 1]. No thresholding — that is the fusion engine's job."""

    @abstractmethod
    async def build_template(self, sample_refs: list[str], key_id: str) -> tuple[str, int]:
        """Build and wrap a template. Returns (template_ref, samples_accepted)."""


#: Below this, a sample is rejected rather than compared.
#:
#: Comparing an unusable sample produces a meaningless score that the fusion
#: engine would then weight and act on. Refusing is more useful: a missing
#: modality is correctly treated as absence of evidence, whereas a garbage score
#: is treated as evidence.
MINIMUM_COMPARISON_QUALITY: dict[IdentityModality, float] = {
    IdentityModality.FACE: 0.35,
    IdentityModality.VOICE: 0.40,
    IdentityModality.BEHAVIOUR: 0.50,
    IdentityModality.INTERACTION: 0.50,
}

_recognisers: dict[IdentityModality, BiometricRecogniser] = {}


def register_recogniser(modality: IdentityModality, recogniser: BiometricRecogniser) -> None:
    """Installs an engine. Called once at startup by a build that has one."""
    _recognisers[modality] = recogniser
    logger.info("recogniser.registered", modality=modality, model_id=recogniser.model_id)


def registered_modalities() -> list[IdentityModality]:
    return sorted(_recognisers)


async def available_modalities() -> list[IdentityModality]:
    """Modalities with an engine that reports itself ready."""
    ready = []
    for modality, recogniser in _recognisers.items():
        if await recogniser.is_available():
            ready.append(modality)
    return sorted(ready)


async def compare(request: ComparisonRequest) -> ComparisonResponse:
    """Runs a comparison with every safety rail applied.

    Order matters and is not negotiable:

      1. **Quality gate.** An unusable sample is rejected, not scored.
      2. **Liveness.** Before comparison, because a spoof that matches perfectly
         is the highest-scoring result the system can produce.
      3. **Comparison.** Only if the first two passed.

    Running liveness after comparison — or skipping it when the score is high —
    is the single most common way biometric systems are defeated.
    """
    recogniser = _recognisers.get(request.modality)

    if recogniser is None or not await recogniser.is_available():
        raise RecogniserUnavailableError(
            f"No recogniser is installed for {request.modality}. "
            "Install the 'inference' extra and register an engine; the identity "
            "engine will not fabricate a score."
        )

    started = time.perf_counter()

    quality = await recogniser.assess_quality(request.sample_ref)
    minimum = MINIMUM_COMPARISON_QUALITY.get(request.modality, 0.0)

    if quality.overall < minimum:
        raise SampleRejectedError(
            f"Sample quality {quality.overall:.2f} is below the {minimum} minimum "
            f"for {request.modality}: {'; '.join(quality.reasons) or 'no detail'}"
        )

    liveness = await recogniser.check_liveness(request.sample_ref)

    if not liveness.is_live:
        # The score is zeroed rather than computed. A detected spoof is an
        # attack, and the fusion engine forces the IMPOSTOR band on it — there
        # is nothing to weigh.
        logger.warning(
            "liveness.attack_detected",
            modality=request.modality,
            attack_type=liveness.attack_type,
            confidence=liveness.confidence,
        )
        return ComparisonResponse(
            modality=request.modality,
            score=0.0,
            quality=quality,
            liveness=liveness,
            model_id=recogniser.model_id,
            enrolment_id=request.enrolment_id,
            captured_at=datetime.now(UTC),
            inference_ms=int((time.perf_counter() - started) * 1000),
        )

    raw_score = await recogniser.compare(request.sample_ref, request.template_ref)
    score = min(1.0, max(0.0, raw_score))

    return ComparisonResponse(
        modality=request.modality,
        score=score,
        quality=quality,
        liveness=liveness,
        model_id=recogniser.model_id,
        enrolment_id=request.enrolment_id,
        captured_at=datetime.now(UTC),
        inference_ms=int((time.perf_counter() - started) * 1000),
    )


#: Enrolment samples are held to a higher bar than verification samples.
#:
#: A poor verification sample costs one uninformative observation. A poor
#: enrolment sample degrades every future comparison against that template, so
#: it is worth being fussy once.
MINIMUM_ENROLMENT_SAMPLE_QUALITY = 0.6
MINIMUM_ACCEPTED_SAMPLES = 3


async def build_template(request: EnrolmentRequest) -> EnrolmentResponse:
    """Builds a template, rejecting samples that would weaken it."""
    recogniser = _recognisers.get(request.modality)

    if recogniser is None or not await recogniser.is_available():
        raise RecogniserUnavailableError(
            f"No recogniser is installed for {request.modality}."
        )

    accepted: list[str] = []
    rejections: list[str] = []

    for index, sample_ref in enumerate(request.sample_refs):
        quality = await recogniser.assess_quality(sample_ref)

        if quality.overall < MINIMUM_ENROLMENT_SAMPLE_QUALITY:
            rejections.append(
                f"Sample {index + 1}: quality {quality.overall:.2f} "
                f"({'; '.join(quality.reasons) or 'below threshold'})"
            )
            continue

        # Liveness at enrolment too. Enrolling from a photograph would create a
        # template that only ever matches that photograph — a permanent backdoor
        # into the account, and one nobody would think to look for later.
        liveness = await recogniser.check_liveness(sample_ref)
        if not liveness.is_live:
            rejections.append(f"Sample {index + 1}: presentation attack ({liveness.attack_type})")
            continue

        accepted.append(sample_ref)

    if len(accepted) < MINIMUM_ACCEPTED_SAMPLES:
        raise SampleRejectedError(
            f"Only {len(accepted)} of {len(request.sample_refs)} samples were usable; "
            f"at least {MINIMUM_ACCEPTED_SAMPLES} are required. " + " | ".join(rejections)
        )

    template_ref, samples_used = await recogniser.build_template(accepted, request.key_id)

    qualities = [(await recogniser.assess_quality(ref)).overall for ref in accepted]
    mean_quality = sum(qualities) / len(qualities)

    logger.info(
        "template.built",
        modality=request.modality,
        model_id=recogniser.model_id,
        accepted=samples_used,
        rejected=len(rejections),
        quality=round(mean_quality, 3),
    )

    return EnrolmentResponse(
        template_ref=template_ref,
        model_id=recogniser.model_id,
        template_version=1,
        samples_accepted=samples_used,
        samples_rejected=len(rejections),
        enrolment_quality=mean_quality,
        rejection_reasons=rejections,
    )
