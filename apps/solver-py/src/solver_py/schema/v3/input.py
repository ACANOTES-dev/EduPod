"""V3 input contract — pydantic v2 mirror of TypeScript ``SolverInputV3``.

Authoritative TypeScript source: ``packages/shared/src/scheduler/types-v3.ts``.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

PeriodTypeV3 = Literal["teaching", "break_supervision", "assembly", "lunch_duty", "free"]
SupervisionModeV3 = Literal["none", "yard", "classroom_previous", "classroom_next"]
PreferenceTypeV3 = Literal["subject", "class_pref", "time_slot"]
PreferencePriorityV3 = Literal["low", "medium", "high"]


class _Strict(BaseModel):
    """Base model — unknown fields fail loudly so contract drift surfaces fast."""

    model_config = ConfigDict(extra="forbid")


class PeriodSlotV3(_Strict):
    index: int = Field(ge=0)
    year_group_id: str
    weekday: int = Field(ge=0, le=6)
    period_order: int = Field(ge=0)
    start_time: str
    end_time: str
    period_type: PeriodTypeV3
    supervision_mode: SupervisionModeV3
    break_group_id: str | None


class ClassV3(_Strict):
    class_id: str
    class_name: str
    year_group_id: str
    year_group_name: str
    student_count: int | None


class SubjectV3(_Strict):
    subject_id: str
    subject_name: str


class TeacherCompetencyV3(_Strict):
    subject_id: str
    year_group_id: str
    class_id: str | None


class TeacherAvailabilityV3(_Strict):
    weekday: int = Field(ge=0, le=6)
    from_: str = Field(alias="from")
    to: str

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class TeacherV3(_Strict):
    staff_profile_id: str
    name: str
    competencies: list[TeacherCompetencyV3]
    availability: list[TeacherAvailabilityV3]
    max_periods_per_week: int | None
    max_periods_per_day: int | None
    max_supervision_duties_per_week: int | None


class RoomV3(_Strict):
    room_id: str
    room_type: str
    capacity: int | None
    is_exclusive: bool


class RoomClosureV3(_Strict):
    room_id: str
    date_from: str
    date_to: str


class BreakGroupV3(_Strict):
    break_group_id: str
    name: str
    year_group_ids: list[str]
    required_supervisor_count: int


class DemandV3(_Strict):
    class_id: str
    subject_id: str
    periods_per_week: int
    max_per_day: int | None
    required_doubles: int
    required_room_type: str | None


class ClassPreferenceV3(_Strict):
    class_id: str
    subject_id: str
    preferred_periods_per_week: int | None
    preferred_room_id: str | None


class TeacherPreferenceV3(_Strict):
    id: str
    teacher_staff_id: str
    preference_type: PreferenceTypeV3
    preference_payload: Any
    priority: PreferencePriorityV3


class GlobalSoftWeightsV3(_Strict):
    even_subject_spread: int
    minimise_teacher_gaps: int
    room_consistency: int
    workload_balance: int
    break_duty_balance: int


class PreferenceWeightsV3(_Strict):
    low: int
    medium: int
    high: int


class PreferencesV3(_Strict):
    class_preferences: list[ClassPreferenceV3]
    teacher_preferences: list[TeacherPreferenceV3]
    global_weights: GlobalSoftWeightsV3
    preference_weights: PreferenceWeightsV3


class PinnedAssignmentV3(_Strict):
    schedule_id: str
    class_id: str
    subject_id: str | None
    period_index: int = Field(ge=0)
    teacher_staff_id: str | None
    room_id: str | None


class StudentOverlapV3(_Strict):
    class_id_a: str
    class_id_b: str


class SolverSettingsV3(_Strict):
    max_solver_duration_seconds: int
    solver_seed: int | None


class ConstraintSnapshotEntry(_Strict):
    type: str
    description: str
    details: dict[str, Any]


class SolverInputV3(_Strict):
    period_slots: list[PeriodSlotV3]
    classes: list[ClassV3]
    subjects: list[SubjectV3]
    teachers: list[TeacherV3]
    rooms: list[RoomV3]
    room_closures: list[RoomClosureV3]
    break_groups: list[BreakGroupV3]
    demand: list[DemandV3]
    preferences: PreferencesV3
    pinned: list[PinnedAssignmentV3]
    student_overlaps: list[StudentOverlapV3]
    settings: SolverSettingsV3
    constraint_snapshot: list[ConstraintSnapshotEntry]
