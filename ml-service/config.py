"""Environment-driven configuration for the GigGuard ML service."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


def _require_env(name: str) -> str:
    """Return a required environment variable or raise a clear error."""
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


@dataclass(frozen=True)
class Settings:
    """Typed runtime settings loaded from environment variables."""

    database_url: str
    flask_env: str
    ml_service_port: int
    sac_model_path: str
    if_model_path: str
    log_level: str


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Load and cache ML service settings."""
    return Settings(
        database_url=_require_env("DATABASE_URL"),
        flask_env=os.getenv("FLASK_ENV", "production"),
        ml_service_port=int(os.getenv("ML_SERVICE_PORT", "5001")),
        sac_model_path=os.getenv("SAC_MODEL_PATH", "models/sac_premium_v1.zip"),
        if_model_path=os.getenv("IF_MODEL_PATH", "models/isolation_forest.pkl"),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
    )

