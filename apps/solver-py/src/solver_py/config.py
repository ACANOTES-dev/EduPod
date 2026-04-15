"""Runtime configuration for the solver-py sidecar."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Process-wide settings sourced from environment variables."""

    model_config = SettingsConfigDict(env_prefix="", case_sensitive=True)

    SOLVER_PY_PORT: int = Field(default=5557, ge=1, le=65535)
    LOG_LEVEL: str = Field(default="INFO")


settings = Settings()
