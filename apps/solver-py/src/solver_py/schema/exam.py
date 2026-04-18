"""Exam-solver input/output contracts — pydantic v2 mirror of
``packages/shared/src/schemas/exam-scheduling.schema.ts`` (``ExamSolverInput`` /
``ExamSolverOutput``).

Authoritative TypeScript source lives in ``@school/shared``. Field names,
ordering and optionality must stay byte-compatible with the TS side.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Strict(BaseModel):
    """Base model — unknown fields fail loudly so contract drift surfaces fast."""

    model_config = ConfigDict(extra="forbid")


class ExamSolverExam(_Strict):
    exam_subject_config_id: str
    year_group_id: str
    subject_id: str
    paper_number: Literal[1, 2]
    duration_minutes: int = Field(ge=1, le=600)
    student_count: int = Field(ge=0)
    invigilators_required: int = Field(ge=0, le=50)
    mode: Literal["in_person", "online"]


class ExamSolverRoom(_Strict):
    room_id: str
    capacity: int = Field(ge=1)


class ExamSolverInvigilator(_Strict):
    staff_profile_id: str


class ExamSolverWindow(_Strict):
    start: str
    end: str


class ExamSolverInput(_Strict):
    session_id: str
    start_date: str
    end_date: str
    allowed_weekdays: list[int] = Field(min_length=1, max_length=7)
    morning_window: ExamSolverWindow
    afternoon_window: ExamSolverWindow
    min_gap_minutes: int = Field(ge=0, le=480)
    max_exams_per_day_per_yg: int = Field(ge=1, le=10)
    max_solver_duration_seconds: int = Field(ge=10, le=3600)
    exams: list[ExamSolverExam]
    rooms: list[ExamSolverRoom]
    invigilators: list[ExamSolverInvigilator]


class ExamSolverRoomAssignment(_Strict):
    room_id: str
    capacity: int
    student_count_in_room: int


class ExamSolverSlot(_Strict):
    exam_subject_config_id: str
    paper_number: Literal[1, 2]
    date: str
    start_time: str
    end_time: str
    room_assignments: list[ExamSolverRoomAssignment]
    invigilator_ids: list[str]


class ExamSolverOutput(_Strict):
    status: Literal["optimal", "feasible", "infeasible", "unknown"]
    slots: list[ExamSolverSlot]
    solve_time_ms: int
    message: str | None = None

    # Early-stop telemetry (all optional — older sidecar builds + the
    # degenerate early-return paths omit them). Mirrors the timetable
    # solver's `solver_diagnostics` surface, narrowed to the exam case.
    early_stop_triggered: bool = False
    termination_reason: Literal[
        "stagnation", "gap", "cancelled", "not_triggered"
    ] = "not_triggered"
    improvements_found: int = 0
    first_solution_wall_time_seconds: float | None = None
    final_objective_value: float | None = None
    time_saved_ms: int = 0
