"""Service configuration, validated at import."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment contract for the inference gateway.

    Validated on first access so a misconfigured container fails at start
    rather than on the first inference request.
    """

    model_config = SettingsConfigDict(env_file=".env", env_prefix="AI_", extra="ignore")

    environment: str = "development"
    log_level: str = "INFO"
    host: str = "0.0.0.0"
    port: int = 8000

    # The gateway writes results back through the API's public endpoints rather
    # than the database, so every automated decision passes the same
    # validation, RBAC and audit path a human decision does.
    api_base_url: str = "http://localhost:4000"
    internal_service_token: str | None = None

    model_registry_path: str = Field(
        default="./models",
        description="Directory holding versioned ONNX artefacts.",
    )

    # Below this, an inference is discarded rather than reported. Dispatching
    # armed responders on a coin flip is worse than missing a signal, so the
    # default is deliberately conservative.
    min_confidence: float = Field(default=0.65, ge=0.0, le=1.0)

    request_timeout_seconds: float = Field(default=10.0, gt=0)


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor. FastAPI dependencies resolve through this."""
    return Settings()
