"""Pydantic models for the /diagnose endpoint (Stage 12 §B)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from solver_py.schema.v3.input import SolverInputV3
from solver_py.schema.v3.output import SolverOutputV3


class DiagnoseRequest(BaseModel, extra="forbid"):
    """POST /diagnose request body."""

    input: SolverInputV3
    output: SolverOutputV3
    max_subsets: int = Field(default=8, ge=1, le=20)


class BlockingConstraint(BaseModel):
    """A single constraint that blocks lesson placement."""

    type: str
    detail: str
    teacher_id: str | None = None
    teacher_ids: list[str] | None = None
    subject_id: str | None = None
    room_type: str | None = None
    shortfall_periods: int | None = None
    pin_count: int | None = None
    available_slots: int | None = None
    total_demand: int | None = None


class DiagnoseLesson(BaseModel):
    """A lesson identified in a blocking subset."""

    lesson_id: str
    class_id: str
    subject_id: str


class DiagnoseSubset(BaseModel):
    """A subset of lessons blocked by a set of constraints."""

    lessons: list[DiagnoseLesson]
    blocking_constraints: list[BlockingConstraint]


class DiagnoseResponse(BaseModel):
    """POST /diagnose response body."""

    subsets: list[DiagnoseSubset]
    timed_out: bool
    duration_ms: float
