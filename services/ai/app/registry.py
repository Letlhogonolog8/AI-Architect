"""Model registry.

Loads versioned ONNX artefacts and exposes them by identifier. The registry
exists so that no call site anywhere in this service references a model by a
bare name — `tailing` is not a model, `tailing-v3` is.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

# Matches the API's own validation on `modelId`. Both sides enforce it because
# provenance that is only checked in one place eventually is not checked.
MODEL_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*-v\d+$")


@dataclass(frozen=True)
class ModelCard:
    """Metadata that must exist before a model may serve traffic.

    `false_positive_cost` is not documentation. In this domain a false positive
    dispatches armed responders to an innocent person, so the operating
    threshold is a safety decision that has to be stated explicitly rather than
    inherited from whatever the training run happened to optimise.
    """

    model_id: str
    task: str
    input_description: str
    output_description: str
    false_positive_cost: str
    minimum_confidence: float


class ModelRegistry:
    """Lazily loads and caches inference sessions."""

    def __init__(self, registry_path: str) -> None:
        self._path = Path(registry_path)
        self._sessions: dict[str, Any] = {}
        self._cards: dict[str, ModelCard] = {}

    @property
    def inference_available(self) -> bool:
        """True when ONNX Runtime is installed.

        The gateway is deliberately importable without it, so that the API
        contract can be exercised in CI without pulling a 300 MB native wheel.
        """
        try:
            import onnxruntime  # noqa: F401
        except ImportError:
            return False
        return True

    def loaded(self) -> list[str]:
        return sorted(self._sessions)

    def register_card(self, card: ModelCard) -> None:
        if not MODEL_ID_PATTERN.match(card.model_id):
            raise ValueError(
                f"'{card.model_id}' is not a versioned model id. "
                "Use the form '<name>-v<n>', e.g. 'tailing-v3'."
            )
        self._cards[card.model_id] = card

    def card(self, model_id: str) -> ModelCard:
        try:
            return self._cards[model_id]
        except KeyError as error:
            raise LookupError(f"No model card registered for '{model_id}'.") from error

    def load(self, model_id: str) -> Any:
        """Returns a cached inference session, loading it on first use."""
        if model_id in self._sessions:
            return self._sessions[model_id]

        # A model without a card cannot be served. The card carries the
        # confidence floor and the false-positive cost, and serving without
        # those is serving a decision nobody has signed off.
        card = self.card(model_id)

        try:
            import onnxruntime
        except ImportError as error:
            raise RuntimeError(
                "onnxruntime is not installed. Install the 'inference' extra to serve models."
            ) from error

        artefact = self._path / f"{model_id}.onnx"
        if not artefact.exists():
            raise FileNotFoundError(f"Model artefact not found: {artefact}")

        session = onnxruntime.InferenceSession(str(artefact))
        self._sessions[model_id] = session

        logger.info(
            "model.loaded",
            model_id=model_id,
            task=card.task,
            minimum_confidence=card.minimum_confidence,
        )

        return session
