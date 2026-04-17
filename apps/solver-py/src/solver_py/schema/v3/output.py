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
TerminationReasonV3 = Literal[
    # CP-SAT reached a terminal status on its own.
    "optimal",
    "feasible_at_deadline",
    "infeasible",
    "model_invalid",
    "unknown_at_deadline",
    # Cooperative halts initiated by the sidecar or solver harness.
    "cancelled",
    "early_stop_stagnation",
    "early_stop_gap",
]


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


class SolverDiagnosticsV3(_Strict):
    """SCHED-041 instrumentation — durable, queryable signal on what CP-SAT actually did.

    Populated by ``SolverTelemetry`` in the solve pipeline and attached to
    ``SolverOutputV3.solver_diagnostics``. The worker persists this to
    ``scheduling_runs.solver_diagnostics`` (separate column, not inside
    ``result_json``) so operators can run structured queries like
    "how many runs exhausted budget without improving on greedy?".

    All fields are optional — defaults are falsy/None so that older
    sidecar responses and UNKNOWN/MODEL_INVALID paths that skip
    instrumentation still round-trip.
    """

    # ─── Runtime environment ──────────────────────────────────────────────
    or_tools_version: str | None = None
    # Bytes-accurate OR-Tools response_stats() dump. Multi-line string, ~1-3 KB.
    # Ops use this for greppable triage; the structured fields below are the
    # queryable signal. Truncated to 16 KB to keep the JSONB cell small.
    response_stats_text: str | None = None

    # ─── Solver-level counters (ResponseProto) ────────────────────────────
    solver_wall_time_seconds: float | None = None
    solver_user_time_seconds: float | None = None
    solver_deterministic_time: float | None = None
    num_booleans: int | None = None
    num_branches: int | None = None
    num_conflicts: int | None = None
    num_binary_propagations: int | None = None
    num_integer_propagations: int | None = None
    num_restarts: int | None = None
    num_lp_iterations: int | None = None

    # ─── Worker parameters (what we asked CP-SAT to do) ───────────────────
    num_search_workers: int | None = None
    max_time_in_seconds: float | None = None
    random_seed: int | None = None

    # ─── Objective trajectory (the SCHED-041 core signal) ─────────────────
    # Score the greedy hint produces when evaluated against the objective
    # (placement_weight × placed_count + soft contribution, if captured).
    greedy_hint_score: int | None = None
    # Greedy placement count — how many lessons the warm-start placed.
    greedy_placement_count: int | None = None
    # CP-SAT's best objective value at termination. None if no feasible found.
    final_objective_value: float | None = None
    # CP-SAT's best upper bound at termination (maximisation → upper bound).
    final_objective_bound: float | None = None
    # (bound - value) / max(1, |value|). None if no objective set or unavailable.
    final_relative_gap: float | None = None
    # First solution's objective value + the wall time at which it arrived.
    # Distinguishes "hint accepted immediately" from "search found its own first
    # feasible late". None when CP-SAT returned INFEASIBLE/UNKNOWN.
    first_solution_objective: float | None = None
    first_solution_wall_time_seconds: float | None = None
    # Count of times the solution callback saw a strictly-better objective.
    # 0 means CP-SAT never improved — the SCHED-041 symptom.
    improvements_found: int = 0
    # True when the final objective beat the greedy hint score. The signal that
    # matters for deciding whether CP-SAT added value over the warm-start.
    cp_sat_improved_on_greedy: bool = False

    # ─── Presolve signals (hint survival) ─────────────────────────────────
    # Whether every placement_var got an add_hint call (should always be True
    # in current pipeline; the field exists so we can detect regressions).
    placement_vars_count: int | None = None
    placement_vars_hinted_to_1: int | None = None

    # ─── Terminal-state summary ───────────────────────────────────────────
    # Unified termination bucket — what actually stopped the solve.
    # Distinct from early_stop_reason (only tracks the callback path) and
    # solve_status (CP-SAT's raw state). Encodes deadline-vs-proven-vs-halted
    # in a single operator-readable field.
    termination_reason: TerminationReasonV3 | None = None
    # CP-SAT's solution_info string for the best solution (e.g. "LNS #3",
    # "first_solution_heuristic", "fixed_search"). Useful for understanding
    # which search strategy actually produced progress.
    solution_info: str | None = None


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
    # SCHED-041 §A (Phase A): structured CP-SAT telemetry. Optional during
    # rollout — older sidecar deploys omit it, and MODEL_INVALID / transport
    # failure paths return before telemetry is computed.
    solver_diagnostics: SolverDiagnosticsV3 | None = None
