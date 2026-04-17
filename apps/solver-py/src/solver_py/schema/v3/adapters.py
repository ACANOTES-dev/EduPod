"""V3 ↔ V2 adapters.

Stage 10 introduces the v3 contract but the solver pipeline still operates
on v2 internally. These adapters bridge the gap:

  - ``v3_input_to_v2``: converts a ``SolverInputV3`` into a ``SolverInputV2``
    so the existing ``solve()`` function can run unchanged.
  - ``v2_output_to_v3``: converts a ``SolverOutputV2`` back into a
    ``SolverOutputV3`` with the CP-SAT-native fields populated.

Stage 11 rewrites ``assembleSolverInput`` to emit v3 directly. At that point
these adapters become internal-only (sidecar serves /v3/solve natively).
"""

from __future__ import annotations

from solver_py.schema.input import (
    BreakGroupInput,
    ClassRoomOverride,
    ClassSubjectOverrideAudit,
    CurriculumEntry,
    GlobalSoftWeights,
    PeriodSlotV2,
    PinnedEntryV2,
    PreferenceWeights,
    RoomClosureInput,
    RoomInfoV2,
    SolverInputV2,
    SolverSettingsV2,
    StudentOverlapV2,
    TeacherAvailabilityWindow,
    TeacherCompetencyEntry,
    TeacherInputV2,
    TeacherPreferenceInput,
    YearGroupInput,
    YearGroupSection,
)
from solver_py.schema.output import (
    SolverOutputV2,
)
from solver_py.schema.v3.input import (
    SolverInputV3,
)
from solver_py.schema.v3.output import (
    AssignmentV3,
    ObjectiveBreakdownEntry,
    PreferenceBreakdownEntryV3,
    PreferenceSatisfactionV3,
    QualityMetricRangeV3,
    QualityMetricsV3,
    SolverDiagnosticsV3,
    SolverOutputV3,
    SolveStatusV3,
    UnassignedDemandV3,
)


def _to_optional_int(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    return int(str(value))


# ─── V3 input → V2 input ────────────────────────────────────────────────────


def v3_input_to_v2(v3: SolverInputV3) -> SolverInputV2:
    """Convert a V3 input payload to V2 so the existing solver can process it."""

    # Rebuild year_groups with nested sections and period_grid
    yg_map: dict[str, dict[str, str]] = {}  # yg_id -> {yg_name}
    yg_sections: dict[str, list[YearGroupSection]] = {}
    yg_grids: dict[str, list[PeriodSlotV2]] = {}

    for cls in v3.classes:
        yg_map[cls.year_group_id] = {"name": cls.year_group_name}
        yg_sections.setdefault(cls.year_group_id, []).append(
            YearGroupSection(
                class_id=cls.class_id,
                class_name=cls.class_name,
                student_count=cls.student_count,
            )
        )

    for slot in v3.period_slots:
        yg_map.setdefault(slot.year_group_id, {"name": slot.year_group_id})
        yg_grids.setdefault(slot.year_group_id, []).append(
            PeriodSlotV2(
                weekday=slot.weekday,
                period_order=slot.period_order,
                start_time=slot.start_time,
                end_time=slot.end_time,
                period_type=slot.period_type,
                supervision_mode=slot.supervision_mode,
                break_group_id=slot.break_group_id,
            )
        )

    year_groups = [
        YearGroupInput(
            year_group_id=yg_id,
            year_group_name=info["name"],
            sections=yg_sections.get(yg_id, []),
            period_grid=yg_grids.get(yg_id, []),
        )
        for yg_id, info in yg_map.items()
    ]

    # Build class → year_group lookup
    class_yg: dict[str, str] = {cls.class_id: cls.year_group_id for cls in v3.classes}

    # Rebuild curriculum from demand + class preferences
    pref_map: dict[tuple[str, str], tuple[int | None, str | None]] = {}
    for cp in v3.preferences.class_preferences:
        pref_map[(cp.class_id, cp.subject_id)] = (
            cp.preferred_periods_per_week,
            cp.preferred_room_id,
        )

    subject_names: dict[str, str] = {s.subject_id: s.subject_name for s in v3.subjects}

    curriculum: list[CurriculumEntry] = []
    for d in v3.demand:
        yg_id = class_yg.get(d.class_id, "")
        ppw, prid = pref_map.get((d.class_id, d.subject_id), (None, None))
        curriculum.append(
            CurriculumEntry(
                year_group_id=yg_id,
                subject_id=d.subject_id,
                subject_name=subject_names.get(d.subject_id, d.subject_id),
                min_periods_per_week=d.periods_per_week,
                max_periods_per_day=d.max_per_day or d.periods_per_week,
                preferred_periods_per_week=ppw,
                requires_double_period=d.required_doubles > 0,
                double_period_count=d.required_doubles if d.required_doubles > 0 else None,
                required_room_type=d.required_room_type,
                preferred_room_id=prid,
                class_id=d.class_id,
            )
        )

    # Rebuild teachers (re-attach preferences from v3.preferences.teacher_preferences)
    teacher_prefs_by_id: dict[str, list[TeacherPreferenceInput]] = {}
    for tp in v3.preferences.teacher_preferences:
        teacher_prefs_by_id.setdefault(tp.teacher_staff_id, []).append(
            TeacherPreferenceInput(
                id=tp.id,
                preference_type=tp.preference_type,
                preference_payload=tp.preference_payload,
                priority=tp.priority,
            )
        )

    teachers = [
        TeacherInputV2(
            staff_profile_id=t.staff_profile_id,
            name=t.name,
            competencies=[
                TeacherCompetencyEntry(
                    subject_id=c.subject_id,
                    year_group_id=c.year_group_id,
                    class_id=c.class_id,
                )
                for c in t.competencies
            ],
            availability=[
                TeacherAvailabilityWindow.model_validate(
                    {"from": a.from_, "to": a.to, "weekday": a.weekday}
                )
                for a in t.availability
            ],
            preferences=teacher_prefs_by_id.get(t.staff_profile_id, []),
            max_periods_per_week=t.max_periods_per_week,
            max_periods_per_day=t.max_periods_per_day,
            max_supervision_duties_per_week=t.max_supervision_duties_per_week,
        )
        for t in v3.teachers
    ]

    # Build period_index → (weekday, period_order, year_group_id) lookup for pinned
    slot_lookup: dict[int, tuple[int, int, str]] = {
        s.index: (s.weekday, s.period_order, s.year_group_id) for s in v3.period_slots
    }

    pinned_entries = []
    for p in v3.pinned:
        found = slot_lookup.get(p.period_index)
        wd, po, yg_id = found if found is not None else (0, 0, "")
        pinned_entries.append(
            PinnedEntryV2(
                schedule_id=p.schedule_id,
                class_id=p.class_id,
                subject_id=p.subject_id,
                year_group_id=yg_id,
                room_id=p.room_id,
                teacher_staff_id=p.teacher_staff_id,
                weekday=wd,
                period_order=po,
            )
        )

    # Extract class_room_overrides from class preferences that have preferred_room_id
    class_room_overrides = [
        ClassRoomOverride(
            class_id=cp.class_id,
            subject_id=cp.subject_id,
            preferred_room_id=cp.preferred_room_id,
            required_room_type=None,
        )
        for cp in v3.preferences.class_preferences
        if cp.preferred_room_id is not None
    ]

    # Convert constraint_snapshot back to overrides_applied where applicable
    overrides_applied: list[ClassSubjectOverrideAudit] = []
    for snap in v3.constraint_snapshot:
        if snap.type == "class_subject_override":
            overrides_applied.append(
                ClassSubjectOverrideAudit(
                    class_id=str(snap.details.get("class_id", "")),
                    subject_id=str(snap.details.get("subject_id", "")),
                    baseline_periods=_to_optional_int(snap.details.get("baseline_periods")),
                    override_periods=int(snap.details.get("override_periods", 0)),
                    reason="class_subject_override",
                )
            )

    return SolverInputV2(
        year_groups=year_groups,
        curriculum=curriculum,
        teachers=teachers,
        rooms=[
            RoomInfoV2(
                room_id=r.room_id,
                room_type=r.room_type,
                capacity=r.capacity,
                is_exclusive=r.is_exclusive,
            )
            for r in v3.rooms
        ],
        room_closures=[
            RoomClosureInput(room_id=rc.room_id, date_from=rc.date_from, date_to=rc.date_to)
            for rc in v3.room_closures
        ],
        break_groups=[
            BreakGroupInput(
                break_group_id=bg.break_group_id,
                name=bg.name,
                year_group_ids=bg.year_group_ids,
                required_supervisor_count=bg.required_supervisor_count,
            )
            for bg in v3.break_groups
        ],
        pinned_entries=pinned_entries,
        student_overlaps=[
            StudentOverlapV2(class_id_a=so.class_id_a, class_id_b=so.class_id_b)
            for so in v3.student_overlaps
        ],
        class_room_overrides=class_room_overrides if class_room_overrides else None,
        overrides_applied=overrides_applied if overrides_applied else None,
        settings=SolverSettingsV2(
            max_solver_duration_seconds=v3.settings.max_solver_duration_seconds,
            preference_weights=PreferenceWeights(
                low=v3.preferences.preference_weights.low,
                medium=v3.preferences.preference_weights.medium,
                high=v3.preferences.preference_weights.high,
            ),
            global_soft_weights=GlobalSoftWeights(
                even_subject_spread=v3.preferences.global_weights.even_subject_spread,
                minimise_teacher_gaps=v3.preferences.global_weights.minimise_teacher_gaps,
                room_consistency=v3.preferences.global_weights.room_consistency,
                workload_balance=v3.preferences.global_weights.workload_balance,
                break_duty_balance=v3.preferences.global_weights.break_duty_balance,
            ),
            solver_seed=v3.settings.solver_seed,
        ),
    )


# ─── V2 output → V3 output ──────────────────────────────────────────────────

# Mapping from v2's lowercase cp_sat_status to v3's uppercase SolveStatusV3.
# model_invalid was previously missing — the V2 solve path raises SolveError
# on MODEL_INVALID rather than returning it, so the gap was benign. We map
# it defensively in case a future V2 output surfaces that status.
_STATUS_MAP: dict[str, SolveStatusV3] = {
    "optimal": "OPTIMAL",
    "feasible": "FEASIBLE",
    "infeasible": "INFEASIBLE",
    "unknown": "UNKNOWN",
    "model_invalid": "MODEL_INVALID",
}


def v2_output_to_v3(
    v2: SolverOutputV2,
    v3_input: SolverInputV3,
    *,
    greedy_hint_score: int = 0,
    cp_sat_objective_value: int | float | None = None,
    cp_sat_improved_on_greedy: bool = False,
    objective_breakdown: list[ObjectiveBreakdownEntry] | None = None,
    diagnostics: SolverDiagnosticsV3 | None = None,
) -> SolverOutputV3:
    """Convert a V2 output to V3, enriched with CP-SAT-native signals.

    The extra keyword args come from the solve pipeline and carry data
    that the v2 output doesn't surface natively.

    ``diagnostics`` (SCHED-041 §A) is the structured telemetry block. When
    provided, it becomes ``SolverOutputV3.solver_diagnostics``. The
    kwargs ``greedy_hint_score`` / ``cp_sat_objective_value`` /
    ``cp_sat_improved_on_greedy`` are kept for backward compatibility
    with callers that only want the ``quality_metrics`` bucket populated;
    ``diagnostics`` is the superset and is preferred.
    """
    # Build slot lookup: (year_group_id, weekday, period_order) → period_index
    slot_lookup: dict[tuple[str, int, int], int] = {}
    # Also maintain a (weekday, period_order) fallback for entries without year_group context
    slot_fallback: dict[tuple[int, int], int] = {}
    for s in v3_input.period_slots:
        slot_lookup[(s.year_group_id, s.weekday, s.period_order)] = s.index
        slot_fallback.setdefault((s.weekday, s.period_order), s.index)

    # Map v2 cp_sat_status to v3 solve_status
    raw_status = v2.cp_sat_status or "unknown"
    # Handle cancelled: if early_stop_reason is 'cancelled', override status
    if v2.early_stop_reason == "cancelled":
        solve_status: SolveStatusV3 = "CANCELLED"
    else:
        solve_status = _STATUS_MAP.get(raw_status, "UNKNOWN")

    # Convert entries
    entries: list[AssignmentV3] = []
    for e in v2.entries:
        period_index = slot_lookup.get(
            (e.year_group_id, e.weekday, e.period_order),
            slot_fallback.get((e.weekday, e.period_order), 0),
        )
        entries.append(
            AssignmentV3(
                class_id=e.class_id,
                subject_id=e.subject_id,
                year_group_id=e.year_group_id,
                period_index=period_index,
                weekday=e.weekday,
                period_order=e.period_order,
                start_time=e.start_time,
                end_time=e.end_time,
                teacher_staff_id=e.teacher_staff_id,
                room_id=e.room_id,
                room_assignment_source="greedy_post_pass",
                is_pinned=e.is_pinned,
                is_supervision=e.is_supervision,
                break_group_id=e.break_group_id,
                preference_satisfaction=[
                    PreferenceSatisfactionV3(
                        preference_id=ps.preference_id,
                        teacher_staff_id=ps.teacher_staff_id,
                        satisfied=ps.satisfied,
                        weight=ps.weight,
                    )
                    for ps in e.preference_satisfaction
                ],
            )
        )

    # Convert unassigned — v2 has per-lesson rows already (CP-SAT emits 1 per lesson)
    unassigned: list[UnassignedDemandV3] = []
    for idx, u in enumerate(v2.unassigned):
        unassigned.append(
            UnassignedDemandV3(
                class_id=u.class_id or "",
                subject_id=u.subject_id,
                year_group_id=u.year_group_id,
                lesson_index=idx,
                reason=u.reason,
            )
        )

    # Quality metrics' CP-SAT-native fields prefer the telemetry diagnostics
    # when available — they are the canonical source. The legacy kwargs are
    # used as a fallback for callers that still populate them (e.g. the
    # direct-call parity tests) and for the diagnostics-missing path.
    qm_objective_value: int | float | None
    qm_greedy_score: int | float
    qm_improved: bool
    if diagnostics is not None:
        qm_objective_value = (
            diagnostics.final_objective_value
            if diagnostics.final_objective_value is not None
            else cp_sat_objective_value
        )
        qm_greedy_score = (
            diagnostics.greedy_hint_score
            if diagnostics.greedy_hint_score is not None
            else greedy_hint_score
        )
        qm_improved = diagnostics.cp_sat_improved_on_greedy or cp_sat_improved_on_greedy
    else:
        qm_objective_value = cp_sat_objective_value
        qm_greedy_score = greedy_hint_score
        qm_improved = cp_sat_improved_on_greedy

    # Convert quality metrics
    qm_v2 = v2.quality_metrics
    if qm_v2 is not None:
        quality_metrics = QualityMetricsV3(
            teacher_gap_index=QualityMetricRangeV3(
                min=qm_v2.teacher_gap_index.min,
                avg=qm_v2.teacher_gap_index.avg,
                max=qm_v2.teacher_gap_index.max,
            ),
            day_distribution_variance=QualityMetricRangeV3(
                min=qm_v2.day_distribution_variance.min,
                avg=qm_v2.day_distribution_variance.avg,
                max=qm_v2.day_distribution_variance.max,
            ),
            preference_breakdown=[
                PreferenceBreakdownEntryV3(
                    preference_type=pb.preference_type,
                    honoured=pb.honoured,
                    violated=pb.violated,
                )
                for pb in qm_v2.preference_breakdown
            ],
            cp_sat_objective_value=qm_objective_value,
            greedy_hint_score=qm_greedy_score,
            cp_sat_improved_on_greedy=qm_improved,
        )
    else:
        quality_metrics = QualityMetricsV3(
            teacher_gap_index=QualityMetricRangeV3(min=0, avg=0, max=0),
            day_distribution_variance=QualityMetricRangeV3(min=0, avg=0, max=0),
            preference_breakdown=[],
            cp_sat_objective_value=qm_objective_value,
            greedy_hint_score=qm_greedy_score,
            cp_sat_improved_on_greedy=qm_improved,
        )

    # Convert constraint_snapshot from v3 input (echo back)
    constraint_snapshot = list(v3_input.constraint_snapshot)

    return SolverOutputV3(
        solve_status=solve_status,
        entries=entries,
        unassigned=unassigned,
        quality_metrics=quality_metrics,
        objective_breakdown=objective_breakdown or [],
        hard_violations=v2.constraint_summary.tier1_violations,
        soft_score=v2.score,
        soft_max_score=v2.max_score,
        duration_ms=v2.duration_ms,
        constraint_snapshot=constraint_snapshot,
        early_stop_triggered=v2.early_stop_triggered,
        early_stop_reason=v2.early_stop_reason,
        time_saved_ms=v2.time_saved_ms,
        solver_diagnostics=diagnostics,
    )
