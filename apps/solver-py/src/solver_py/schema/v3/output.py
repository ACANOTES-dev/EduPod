"""V3 output contract — pydantic v2 mirror of TypeScript ``SolverOutputV3``.

Authoritative TypeScript source: ``packages/shared/src/scheduler/types-v3.ts``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from solver_py.schema.v3.input import ConstraintSnapshotEntry, PreferenceTypeV3

SolveStatusV3 = Literal[
    "OPTIMAL", "FEASIBLE", "INFEASIBLE", "MODEL_INVALID", "UNKNOWN", "CANCELLED"
]
EarlyStopReasonV3 = Literal["stagnation", "gap", "cancelled", "not_triggered"]
RoomAssignmentSource = Literal["solver", "greedy_post_pass"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PreferenceSatisfactionV3(_Strict):
    preference_id: str
    teacher_staff_id: str
    satisfied: bool
    weight: int


class AssignmentV3(_Strict):
    class_id: str
    subject_id: str | None
    year_group_id: str
    period_index: int = Field(ge=0)
    weekday: int = Field(ge=0, le=6)
    period_order: int = Field(ge=0)
    start_time: str
    end_time: str
    teacher_staff_id: str | None
    room_id: str | None
    room_assignment_source: RoomAssignmentSource
    is_pinned: bool
    is_supervision: bool
    break_group_id: str | None
    preference_satisfaction: list[PreferenceSatisfactionV3]


class UnassignedDemandV3(_Strict):
    class_id: str
    subject_id: str | None
    year_group_id: str
    lesson_index: int
    reason: str


class QualityMetricRangeV3(_Strict):
    min: int | float
    avg: int | float
    max: int | float


class PreferenceBreakdownEntryV3(_Strict):
    preference_type: PreferenceTypeV3
    honoured: int
    violated: int


class QualityMetricsV3(_Strict):
    teacher_gap_index: QualityMetricRangeV3
    day_distribution_variance: QualityMetricRangeV3
    preference_breakdown: list[PreferenceBreakdownEntryV3]
    cp_sat_objective_value: int | float | None
    greedy_hint_score: int | float
    cp_sat_improved_on_greedy: bool


class ObjectiveBreakdownEntry(_Strict):
    term_name: str
    weight: int | float
    contribution: int | float
    best_possible: int | float


class SolverOutputV3(_Strict):
    solve_status: SolveStatusV3
    entries: list[AssignmentV3]
    unassigned: list[UnassignedDemandV3]
    quality_metrics: QualityMetricsV3
    objective_breakdown: list[ObjectiveBreakdownEntry]
    hard_violations: int
    soft_score: int
    soft_max_score: int
    duration_ms: int
    constraint_snapshot: list[ConstraintSnapshotEntry]
    early_stop_triggered: bool
    early_stop_reason: EarlyStopReasonV3
    time_saved_ms: int
