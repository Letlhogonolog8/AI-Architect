"""Abnormal behaviour detection.

Scores how far a window of cabin behaviour sits from the driver's own normal.

## Why the comparison is personal rather than population-wide

A population anomaly detector flags whoever is least like its training data. In
practice that means it flags the same people repeatedly — the ones who work
night shifts, whose cabins are noisier, whose bodies move differently, whose
first language is not the one the acoustic model was fitted on. Those people are
not more dangerous; they are further from the mean. A system built that way
delivers its false accusations to the same addresses every week, and in this
product a false accusation can arrive with armed responders attached.

Comparing a driver only against their own history removes that failure mode
entirely. The cost is that the engine can say nothing about a driver until a
baseline exists, and it says so plainly rather than guessing.

## Why this is statistics rather than a learned model

Same reason as `app/identity/behaviour.py`: there is no labelled corpus of
hijacking cabin footage, so a deep model would be fitted to some available proxy
and would produce confident nonsense. A z-score against a per-person baseline is
a weaker claim that is honest about being weak, and it is explainable by
construction — "your cabin was four standard deviations quieter than your
normal" is something an operator can act on and a driver can contest.

The arithmetic is mirrored in `packages/shared/src/behaviour/abnormality.ts`,
which is where the API computes it. Both exist because the API must be able to
score without a round trip to this service, and this service must be able to
score during feature extraction. The two are kept byte-identical in behaviour;
the TypeScript side is authoritative if they ever disagree.
"""

from __future__ import annotations

import math

import structlog

from app.behaviour.schemas import AbnormalityRequest, AbnormalityResponse

logger = structlog.get_logger(__name__)

MODEL_ID = "abnormality-v1"

#: The feature set. Adding one invalidates every existing baseline, so the list
#: is versioned with the model id rather than edited in place.
#:
#: Every entry is a shape-of-behaviour statistic. None carries location,
#: destination, route identity or time of day — those would discriminate better
#: and would make the baseline a movement-tracking record of a named worker.
FEATURE_NAMES: tuple[str, ...] = (
    "motion_energy_mean",
    "motion_energy_variance",
    "postural_shift_rate",
    "head_movement_rate",
    "occupant_count_mean",
    "vocal_intensity_mean",
    "vocal_f0_mean",
    "speech_rate_mean",
    "speech_presence_ratio",
    "control_input_variance",
)

#: Windows required before a baseline discriminates. Below this, the standard
#: deviations are dominated by however the first few trips happened to go, and
#: every subsequent normal trip reads as an anomaly.
MINIMUM_BASELINE_WINDOWS = 20

#: Seconds below which a window is too short to characterise.
MINIMUM_WINDOW_SECONDS = 60


def score_window(request: AbnormalityRequest) -> AbnormalityResponse:
    """Scores a behaviour window against the driver's baseline.

    Returns a zero score with `baseline_insufficient` set rather than raising
    when the baseline is thin, so the threat scorer drops the contribution
    instead of every caller having to special-case it.
    """
    if request.baseline_window_count < MINIMUM_BASELINE_WINDOWS:
        return AbnormalityResponse(
            abnormality_score=0.0,
            deviations={},
            coverage=0.0,
            baseline_insufficient=True,
            model_id=MODEL_ID,
        )

    if request.observed_seconds < MINIMUM_WINDOW_SECONDS:
        return AbnormalityResponse(
            abnormality_score=0.0,
            deviations={},
            coverage=0.0,
            baseline_insufficient=False,
            model_id=MODEL_ID,
        )

    deviations: dict[str, float] = {}

    for name in FEATURE_NAMES:
        value = request.features.get(name)
        if value is None or not math.isfinite(value):
            continue

        stats = request.baseline.get(name)
        if stats is None:
            continue

        sigma = stats.get("standardDeviation", 0.0)

        # A zero-variance feature means every observed window was identical,
        # which in real sensor data means the sensor was stuck. Treating it as
        # infinitely discriminative would let one broken input dominate.
        if sigma <= 1e-6:
            continue

        deviations[name] = round((value - stats.get("mean", 0.0)) / sigma, 3)

    if not deviations:
        return AbnormalityResponse(
            abnormality_score=0.0,
            deviations={},
            coverage=0.0,
            baseline_insufficient=False,
            model_id=MODEL_ID,
        )

    # Root-mean-square over absolute z-scores. Both directions count: a cabin
    # that has gone abnormally *quiet* is as much a departure as one that has
    # gone abnormally loud, and in a hijacking it is the more common of the two.
    rms = math.sqrt(sum(z * z for z in deviations.values()) / len(deviations))

    # Half-normal mapping: z=1 → 0.39, z=2 → 0.86, z=3 → 0.99.
    abnormality = 1 - math.exp(-0.5 * rms * rms)

    coverage = len(deviations) / len(FEATURE_NAMES)

    logger.debug(
        "abnormality.scored",
        driver_id=request.driver_id,
        rms_z=round(rms, 3),
        features_compared=len(deviations),
        coverage=round(coverage, 3),
    )

    return AbnormalityResponse(
        # Coverage scales the score directly: an anomaly seen in three features
        # is a weaker claim than the same anomaly in ten, and the score should
        # say so rather than leaving it to a caveat nobody reads.
        abnormality_score=round(min(1.0, abnormality * coverage), 4),
        deviations=dict(
            sorted(deviations.items(), key=lambda item: abs(item[1]), reverse=True)
        ),
        coverage=round(coverage, 3),
        baseline_insufficient=False,
        model_id=MODEL_ID,
    )


def update_baseline(
    existing: dict[str, dict[str, float]],
    window_count: int,
    features: dict[str, float],
) -> dict[str, dict[str, float]]:
    """Folds a window into the baseline with Welford's online algorithm.

    Online rather than batch, for the same reason as the identity baseline: the
    alternative is retaining every window's features indefinitely so the
    baseline can be recomputed, which is precisely the accumulating behavioural
    record this design exists to avoid. Welford keeps only a running mean and
    variance, so the window can be discarded the moment it is folded in.
    """
    updated: dict[str, dict[str, float]] = {}
    n = window_count + 1

    for name in FEATURE_NAMES:
        value = features.get(name)
        previous = existing.get(name)

        if value is None or not math.isfinite(value):
            if previous is not None:
                updated[name] = previous
            continue

        if previous is None:
            updated[name] = {"mean": value, "standardDeviation": 0.0, "m2": 0.0}
            continue

        mean = previous.get("mean", 0.0)
        m2 = previous.get("m2", 0.0)

        delta = value - mean
        new_mean = mean + delta / n
        new_m2 = m2 + delta * (value - new_mean)

        updated[name] = {
            "mean": new_mean,
            "m2": new_m2,
            "standardDeviation": math.sqrt(new_m2 / n) if n > 1 else 0.0,
        }

    return updated
