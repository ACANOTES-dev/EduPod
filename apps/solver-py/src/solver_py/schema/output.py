"""Output contract — pydantic v2 mirror of TypeScript ``SolverOutputV2``.

Authoritative TypeScript source: ``packages/shared/src/scheduler/types-v2.ts``.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from solver_py.schema.input import PreferenceType


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PreferenceSatisfaction(_Strict):
    preference_id: str
    teacher_staff_id: str
    satisfied: bool
    weight: int


class SolverAssignmentV2(_Strict):
    class_id: str
    subject_id: str | None
    year_group_id: str
    room_id: str | None
    teacher_staff_id: str | None
    weekday: int = Field(ge=0, le=6)
    period_order: int = Field(ge=0)
    start_time: str
    end_time: str
    is_pinned: bool
    break_group_id: str | None
    is_supervision: bool
    preference_satisfaction: list[PreferenceSatisfaction]


class UnassignedSlotV2(_Strict):
    year_group_id: str
    subject_id: str | None
    class_id: str | None
    periods_remaining: int
    reason: str


class QualityMetricRange(_Strict):
    min: int | float
    avg: int | float
    max: int | float


class PreferenceBreakdownEntry(_Strict):
    preference_type: PreferenceType
    honoured: int
    violated: int


class QualityMetricsV2(_Strict):
    teacher_gap_index: QualityMetricRange
    day_distribution_variance: QualityMetricRange
    preference_breakdown: list[PreferenceBreakdownEntry]


class ConstraintSummary(_Strict):
    tier1_violations: int
    tier2_violations: int
    tier3_violations: int


class SolverOutputV2(_Strict):
    entries: list[SolverAssignmentV2]
    unassigned: list[UnassignedSlotV2]
    score: int
    max_score: int
    duration_ms: int
    constraint_summary: ConstraintSummary
    quality_metrics: QualityMetricsV2 | None = None
