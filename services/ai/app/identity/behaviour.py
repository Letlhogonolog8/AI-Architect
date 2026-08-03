"""Behavioural authentication.

Scores how closely a window of driving matches a driver's baseline.

## Why this is statistics rather than a neural network

Driving style is weakly discriminative — people overlap heavily, and the same
person drives differently when tired, late or on an unfamiliar road. A deep
model would fit that noise and produce confident nonsense. A Mahalanobis-style
distance over a handful of interpretable features produces a weaker signal that
is *honest about being weak*, which the fusion engine handles correctly by
giving it a low LLR cap.

It is also explainable by construction: "your braking was 3.2 standard
deviations from your baseline" is something an operator can act on, and a
driver can contest.

## What is deliberately not a feature

No positions, no destinations, no times of day, no route identifiers. Those
would discriminate far better than driving style does — and a system built on
them would be tracking where people go, not who they are. The features below
are all shape-of-driving statistics that carry no location information.
"""

from __future__ import annotations

import math

import structlog

from app.identity.schemas import BehaviourResponse, BehaviourWindow, SampleQuality

logger = structlog.get_logger(__name__)

MODEL_ID = "behaviour-v1"

#: The feature set. Adding one requires re-baselining every driver, so the list
#: is versioned with the model id rather than edited in place.
FEATURE_NAMES: tuple[str, ...] = (
    "mean_acceleration_ms2",
    "acceleration_variance",
    "mean_deceleration_ms2",
    "harsh_brake_rate_per_hour",
    "harsh_accel_rate_per_hour",
    "mean_cornering_g",
    "speed_variance_kph",
    "following_distance_index",
    "lane_stability_index",
    "idle_ratio",
)

#: Trips below this and the baseline has not seen enough variation to be a
#: baseline — it is a snapshot of a few journeys.
MINIMUM_BASELINE_TRIPS = 12

#: Seconds of driving below which a window is too short to characterise.
MINIMUM_WINDOW_SECONDS = 180


class BehaviourBaseline:
    """A driver's per-feature mean and standard deviation."""

    def __init__(self, features: dict[str, dict[str, float]], trip_count: int) -> None:
        self._features = features
        self.trip_count = trip_count

    def deviation(self, name: str, value: float) -> float | None:
        """Z-score for one feature. None when the baseline lacks it."""
        stats = self._features.get(name)
        if stats is None:
            return None

        sigma = stats.get("standardDeviation", 0.0)

        # A zero-variance feature means every observed trip was identical, which
        # in real telemetry means the sensor was stuck. Treating it as infinitely
        # discriminative would let one broken signal dominate the score.
        if sigma <= 1e-6:
            return None

        return (value - stats.get("mean", 0.0)) / sigma

    @property
    def is_sufficient(self) -> bool:
        return self.trip_count >= MINIMUM_BASELINE_TRIPS

    def distinctiveness(self) -> float:
        """How distinctive this driver is, 0-1.

        A driver whose features sit at population norms with wide variance
        cannot be told apart from anyone else, however good the model is. The
        score is surfaced so a weak baseline is visible rather than silently
        producing weak comparisons forever.
        """
        spreads = [
            stats.get("standardDeviation", 0.0)
            for stats in self._features.values()
            if stats.get("standardDeviation", 0.0) > 0
        ]

        if not spreads:
            return 0.0

        # Tight, consistent driving is distinctive; high variance is not.
        mean_spread = sum(spreads) / len(spreads)
        return max(0.0, min(1.0, 1.0 / (1.0 + mean_spread)))


def score_window(window: BehaviourWindow, baseline: BehaviourBaseline) -> BehaviourResponse:
    """Scores a driving window against a baseline.

    Returns a low-quality result rather than raising when the baseline is thin,
    so the fusion engine drops the modality instead of the caller having to
    special-case it.
    """
    if not baseline.is_sufficient:
        return BehaviourResponse(
            score=0.5,
            quality=SampleQuality(
                overall=0.0,
                reasons=[
                    f"Baseline built from {baseline.trip_count} trips; "
                    f"{MINIMUM_BASELINE_TRIPS} are required before it discriminates."
                ],
            ),
            model_id=MODEL_ID,
            baseline_insufficient=True,
        )

    if window.observed_seconds < MINIMUM_WINDOW_SECONDS:
        return BehaviourResponse(
            score=0.5,
            quality=SampleQuality(
                overall=0.0,
                reasons=[
                    f"Window of {window.observed_seconds}s is shorter than the "
                    f"{MINIMUM_WINDOW_SECONDS}s minimum."
                ],
            ),
            model_id=MODEL_ID,
        )

    deviations: dict[str, float] = {}

    for name in FEATURE_NAMES:
        value = window.features.get(name)
        if value is None:
            continue

        z = baseline.deviation(name, value)
        if z is not None:
            deviations[name] = round(z, 3)

    if not deviations:
        return BehaviourResponse(
            score=0.5,
            quality=SampleQuality(
                overall=0.0,
                reasons=["No features could be compared against the baseline."],
            ),
            model_id=MODEL_ID,
        )

    # Root-mean-square z-score. Squaring means one wildly deviant feature
    # matters more than several mildly deviant ones — which is the right
    # emphasis, since a genuine impostor tends to differ sharply on a few
    # habits rather than slightly on all of them.
    rms = math.sqrt(sum(z * z for z in deviations.values()) / len(deviations))

    # Half-normal survival function maps distance to a similarity score:
    # z=0 -> 1.0, z=1 -> 0.61, z=2 -> 0.14, z=3 -> 0.011.
    score = math.exp(-0.5 * rms * rms)

    # Coverage is the honest quality measure here: a score from three features
    # is weaker evidence than the same score from ten.
    coverage = len(deviations) / len(FEATURE_NAMES)

    quality = SampleQuality(
        overall=round(min(1.0, coverage * (0.5 + 0.5 * baseline.distinctiveness())), 3),
        reasons=(
            []
            if coverage > 0.7
            else [f"Only {len(deviations)} of {len(FEATURE_NAMES)} features were available."]
        ),
    )

    logger.debug(
        "behaviour.scored",
        driver_id=window.driver_id,
        rms_z=round(rms, 3),
        score=round(score, 3),
        features_compared=len(deviations),
    )

    return BehaviourResponse(
        score=round(score, 4),
        quality=quality,
        model_id=MODEL_ID,
        feature_deviations=deviations,
    )


def update_baseline(
    existing: dict[str, dict[str, float]],
    trip_count: int,
    window: BehaviourWindow,
) -> dict[str, dict[str, float]]:
    """Folds a new window into the baseline with Welford's online algorithm.

    Online rather than batch because the alternative is retaining every trip's
    features indefinitely to recompute from — which is exactly the accumulation
    of driving history this design avoids. Welford keeps only the running mean
    and variance, so the raw trips can be discarded immediately.
    """
    updated: dict[str, dict[str, float]] = {}
    n = trip_count + 1

    for name in FEATURE_NAMES:
        value = window.features.get(name)
        previous = existing.get(name)

        if value is None:
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
