"""Input contract — pydantic v2 mirror of TypeScript ``SolverInputV2``.

Field names, optionality, and literal sets must stay byte-compatible with
``packages/shared/src/scheduler/types-v2.ts``. Drift is asserted by the
round-trip test in ``apps/solver-py/tests/test_schema_roundtrip.py`` and
the TypeScript-side contract test ``cp-sat-contract.test.ts``.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

PeriodType = Literal["teaching", "break_supervision", "assembly", "lunch_duty", "free"]
SupervisionMode = Literal["none", "yard", "classroom_previous", "classroom_next"]
PreferenceType = Literal["subject", "class_pref", "time_slot"]
PreferencePriority = Literal["low", "medium", "high"]


class _Strict(BaseModel):
    """Base model — unknown fields fail loudly so contract drift surfaces fast."""

    model_config = ConfigDict(extra="forbid")


class PeriodSlotV2(_Strict):
    weekday: int = Field(ge=0, le=6)
    period_order: int = Field(ge=0)
    start_time: str
    end_time: str
    period_type: PeriodType
    supervision_mode: SupervisionMode
    break_group_id: str | None


class YearGroupSection(_Strict):
    class_id: str
    class_name: str
    student_count: int | None


class YearGroupInput(_Strict):
    year_group_id: str
    year_group_name: str
    sections: list[YearGroupSection]
    period_grid: list[PeriodSlotV2]


class CurriculumEntry(_Strict):
    year_group_id: str
    subject_id: str
    subject_name: str
    min_periods_per_week: int
    max_periods_per_day: int
    preferred_periods_per_week: int | None
    requires_double_period: bool
    double_period_count: int | None
    required_room_type: str | None
    preferred_room_id: str | None
    class_id: str | None = None


class TeacherCompetencyEntry(_Strict):
    subject_id: str
    year_group_id: str
    class_id: str | None


class TeacherAvailabilityWindow(_Strict):
    weekday: int = Field(ge=0, le=6)
    from_: str = Field(alias="from")
    to: str

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class TeacherPreferenceInput(_Strict):
    id: str
    preference_type: PreferenceType
    preference_payload: Any
    priority: PreferencePriority


class TeacherInputV2(_Strict):
    staff_profile_id: str
    name: str
    competencies: list[TeacherCompetencyEntry]
    availability: list[TeacherAvailabilityWindow]
    preferences: list[TeacherPreferenceInput]
    max_periods_per_week: int | None
    max_periods_per_day: int | None
    max_supervision_duties_per_week: int | None


class BreakGroupInput(_Strict):
    break_group_id: str
    name: str
    year_group_ids: list[str]
    required_supervisor_count: int


class RoomInfoV2(_Strict):
    room_id: str
    room_type: str
    capacity: int | None
    is_exclusive: bool


class RoomClosureInput(_Strict):
    room_id: str
    date_from: str
    date_to: str


class PinnedEntryV2(_Strict):
    schedule_id: str
    class_id: str
    subject_id: str | None
    year_group_id: str | None
    room_id: str | None
    teacher_staff_id: str | None
    weekday: int = Field(ge=0, le=6)
    period_order: int = Field(ge=0)


class StudentOverlapV2(_Strict):
    class_id_a: str
    class_id_b: str


class ClassRoomOverride(_Strict):
    class_id: str
    subject_id: str | None
    preferred_room_id: str | None
    required_room_type: str | None


class ClassSubjectOverrideAudit(_Strict):
    class_id: str
    subject_id: str
    baseline_periods: int | None
    override_periods: int
    reason: Literal["class_subject_override"]


class PreferenceWeights(_Strict):
    low: int
    medium: int
    high: int


class GlobalSoftWeights(_Strict):
    even_subject_spread: int
    minimise_teacher_gaps: int
    room_consistency: int
    workload_balance: int
    break_duty_balance: int


class SolverSettingsV2(_Strict):
    max_solver_duration_seconds: int
    preference_weights: PreferenceWeights
    global_soft_weights: GlobalSoftWeights
    solver_seed: int | None


class SolverInputV2(_Strict):
    year_groups: list[YearGroupInput]
    curriculum: list[CurriculumEntry]
    teachers: list[TeacherInputV2]
    rooms: list[RoomInfoV2]
    room_closures: list[RoomClosureInput]
    break_groups: list[BreakGroupInput]
    pinned_entries: list[PinnedEntryV2]
    student_overlaps: list[StudentOverlapV2]
    class_room_overrides: list[ClassRoomOverride] | None = None
    overrides_applied: list[ClassSubjectOverrideAudit] | None = None
    settings: SolverSettingsV2
