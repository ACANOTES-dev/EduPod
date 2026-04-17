"""Runtime configuration for the solver-py sidecar."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Process-wide settings sourced from environment variables."""

    model_config = SettingsConfigDict(env_prefix="", case_sensitive=True)

    SOLVER_PY_PORT: int = Field(default=5557, ge=1, le=65535)
    LOG_LEVEL: str = Field(default="INFO")

    # SCHED-041 §B — CP-SAT worker count. Default 8 (Phase B fix); override
    # via env to 1 for tenants where a memory audit shows multi-worker
    # exceeds the sidecar's pm2 max_memory_restart ceiling. Phase A
    # telemetry proved single-worker never reaches a feasible on NHQS-scale
    # input (393 demand × 45k placement vars) — 8 workers is the baseline
    # required to use LNS with the greedy hint. See
    # docs/operations/solver-performance-2026-04.md.
    CP_SAT_NUM_SEARCH_WORKERS: int = Field(default=8, ge=1, le=16)


settings = Settings()
