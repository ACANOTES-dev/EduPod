"""Pydantic mirrors of the TypeScript SolverInputV2 / SolverOutputV2 contract.

Authoritative TypeScript source: ``packages/shared/src/scheduler/types-v2.ts``.
Drift is guarded by ``apps/solver-py/tests/test_schema_roundtrip.py`` (Python
side) and ``packages/shared/src/scheduler/__tests__/cp-sat-contract.test.ts``
(TypeScript side) — both consume the same JSON fixture.
"""

from solver_py.schema.input import (
    BreakGroupInput,
    ClassRoomOverride,
    ClassSubjectOverrideAudit,
    CurriculumEntry,
    GlobalSoftWeights,
    PeriodSlotV2,
    PeriodType,
    PinnedEntryV2,
    PreferencePriority,
    PreferenceType,
    PreferenceWeights,
    RoomClosureInput,
    RoomInfoV2,
    SolverInputV2,
    SolverSettingsV2,
    StudentOverlapV2,
    SupervisionMode,
    TeacherAvailabilityWindow,
    TeacherCompetencyEntry,
    TeacherInputV2,
    TeacherPreferenceInput,
    YearGroupInput,
    YearGroupSection,
)
from solver_py.schema.output import (
    ConstraintSummary,
    PreferenceBreakdownEntry,
    PreferenceSatisfaction,
    QualityMetricRange,
    QualityMetricsV2,
    SolverAssignmentV2,
    SolverOutputV2,
    UnassignedSlotV2,
)

__all__ = [
    "BreakGroupInput",
    "ClassRoomOverride",
    "ClassSubjectOverrideAudit",
    "ConstraintSummary",
    "CurriculumEntry",
    "GlobalSoftWeights",
    "PeriodSlotV2",
    "PeriodType",
    "PinnedEntryV2",
    "PreferenceBreakdownEntry",
    "PreferencePriority",
    "PreferenceSatisfaction",
    "PreferenceType",
    "PreferenceWeights",
    "QualityMetricRange",
    "QualityMetricsV2",
    "RoomClosureInput",
    "RoomInfoV2",
    "SolverAssignmentV2",
    "SolverInputV2",
    "SolverOutputV2",
    "SolverSettingsV2",
    "StudentOverlapV2",
    "SupervisionMode",
    "TeacherAvailabilityWindow",
    "TeacherCompetencyEntry",
    "TeacherInputV2",
    "TeacherPreferenceInput",
    "UnassignedSlotV2",
    "YearGroupInput",
    "YearGroupSection",
]
