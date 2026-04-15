"""Stage 4 — soft-preference scoring and quality metrics.

Each test isolates one signal and asserts the solver favours the
higher-scoring placement. Determinism + quality_metrics shape are
checked alongside.
"""

from __future__ import annotations

from solver_py.solver import solve
from tests._builders import (
    build_input,
    build_period_grid,
    competency,
    curriculum_entry,
    default_settings,
    teacher,
)


def _zero_global(except_for: str | None = None, value: int = 10) -> dict[str, int]:
    weights = {
        "even_subject_spread": 0,
        "minimise_teacher_gaps": 0,
        "room_consistency": 0,
        "workload_balance": 0,
        "break_duty_balance": 0,
    }
    if except_for is not None:
        weights[except_for] = value
    return weights


def _settings_with(global_weights: dict[str, int], **kwargs: object) -> dict[str, object]:
    s = default_settings(**kwargs)
    s["global_soft_weights"] = global_weights
    return s


# ─── Quality metrics envelope ────────────────────────────────────────────────


def test_quality_metrics_populated_on_every_response() -> None:
    """Stage 3 left ``quality_metrics`` as ``None``; Stage 4 always populates."""
    inp = build_input(
        curriculum=[curriculum_entry(min_periods=3, max_per_day=1)],
        teachers=[teacher(staff_id="t1", competencies=[competency()])],
    )
    out = solve(inp)
    assert out.quality_metrics is not None
    assert out.quality_metrics.teacher_gap_index is not None
    assert out.quality_metrics.day_distribution_variance is not None
    assert isinstance(out.quality_metrics.preference_breakdown, list)


# ─── Teacher preferences (class_pref / time_slot) ────────────────────────────


def test_time_slot_preference_pulls_lesson_to_preferred_period() -> None:
    """Two teaching slots, one lesson — a high-priority preference for slot 1
    should beat slot 0."""
    grid = [
        {
            "weekday": 0,
            "period_order": 0,
            "start_time": "08:00",
            "end_time": "08:45",
            "period_type": "teaching",
            "supervision_mode": "none",
            "break_group_id": None,
        },
        {
            "weekday": 0,
            "period_order": 1,
            "start_time": "09:00",
            "end_time": "09:45",
            "period_type": "teaching",
            "supervision_mode": "none",
            "break_group_id": None,
        },
    ]
    teacher_payload = teacher(staff_id="t1", competencies=[competency()])
    teacher_payload["preferences"] = [
        {
            "id": "p1",
            "preference_type": "time_slot",
            "preference_payload": {"weekday": 0, "period_order": 1, "preferred": True},
            "priority": "high",
        }
    ]
    inp = build_input(
        year_groups=[
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "class-A", "class_name": "Y1-A", "student_count": 20}
                ],
                "period_grid": grid,
            }
        ],
        curriculum=[curriculum_entry(min_periods=1, max_per_day=1)],
        teachers=[teacher_payload],
        settings=_settings_with(_zero_global()),
    )
    out = solve(inp)
    placed = [e for e in out.entries if not e.is_pinned]
    assert len(placed) == 1
    assert placed[0].period_order == 1
    # Preference satisfaction attached and honoured.
    sat = placed[0].preference_satisfaction
    assert any(s.preference_id == "p1" and s.satisfied for s in sat)


def test_avoid_time_slot_preference_pushes_lesson_away() -> None:
    """``preferred=False`` is an avoid pref — solver should pick the other slot."""
    grid = [
        {
            "weekday": 0,
            "period_order": 0,
            "start_time": "08:00",
            "end_time": "08:45",
            "period_type": "teaching",
            "supervision_mode": "none",
            "break_group_id": None,
        },
        {
            "weekday": 0,
            "period_order": 1,
            "start_time": "09:00",
            "end_time": "09:45",
            "period_type": "teaching",
            "supervision_mode": "none",
            "break_group_id": None,
        },
    ]
    teacher_payload = teacher(staff_id="t1", competencies=[competency()])
    teacher_payload["preferences"] = [
        {
            "id": "avoid-1",
            "preference_type": "time_slot",
            "preference_payload": {"weekday": 0, "period_order": 1, "preferred": False},
            "priority": "high",
        }
    ]
    inp = build_input(
        year_groups=[
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "class-A", "class_name": "Y1-A", "student_count": 20}
                ],
                "period_grid": grid,
            }
        ],
        curriculum=[curriculum_entry(min_periods=1, max_per_day=1)],
        teachers=[teacher_payload],
        settings=_settings_with(_zero_global()),
    )
    out = solve(inp)
    placed = [e for e in out.entries if not e.is_pinned]
    assert len(placed) == 1
    assert placed[0].period_order == 0


def test_class_pref_picks_teacher_who_wants_the_class() -> None:
    """Two teachers competent for the same subject; t2 prefers class-A.
    Solver should pick t2 for class-A."""
    t1 = teacher(staff_id="t1", competencies=[competency()])
    t2 = teacher(staff_id="t2", competencies=[competency()])
    t2["preferences"] = [
        {
            "id": "p1",
            "preference_type": "class_pref",
            "preference_payload": {"class_id": "class-A", "preferred": True},
            "priority": "high",
        }
    ]
    inp = build_input(
        curriculum=[curriculum_entry(min_periods=1, max_per_day=1)],
        teachers=[t1, t2],
        settings=_settings_with(_zero_global()),
    )
    out = solve(inp)
    placed = [e for e in out.entries if not e.is_pinned]
    assert len(placed) == 1
    assert placed[0].teacher_staff_id == "t2"


def test_subject_pref_is_in_breakdown_violated_count() -> None:
    """Legacy never marks 'subject' prefs satisfied — they always land in
    ``preference_breakdown.violated``."""
    t1 = teacher(staff_id="t1", competencies=[competency()])
    t1["preferences"] = [
        {
            "id": "subj-1",
            "preference_type": "subject",
            "preference_payload": {"subject_id": "maths"},
            "priority": "low",
        }
    ]
    inp = build_input(
        curriculum=[curriculum_entry(min_periods=1, max_per_day=1)],
        teachers=[t1],
    )
    out = solve(inp)
    assert out.quality_metrics is not None
    breakdown = {b.preference_type: b for b in out.quality_metrics.preference_breakdown}
    assert "subject" in breakdown
    assert breakdown["subject"].violated >= 1
    assert breakdown["subject"].honoured == 0


# ─── Even subject spread ─────────────────────────────────────────────────────


def test_even_subject_spread_distributes_lessons_across_days() -> None:
    """3 lessons, 3 weekdays × 1 period — with spread weight, the solver
    should pick one per day rather than clumping. Without spread weight,
    the solver may clump (it picks the cheapest feasible placement)."""
    grid = []
    for weekday in range(3):
        grid.append(
            {
                "weekday": weekday,
                "period_order": 0,
                "start_time": "08:00",
                "end_time": "08:45",
                "period_type": "teaching",
                "supervision_mode": "none",
                "break_group_id": None,
            }
        )
        grid.append(
            {
                "weekday": weekday,
                "period_order": 1,
                "start_time": "09:00",
                "end_time": "09:45",
                "period_type": "teaching",
                "supervision_mode": "none",
                "break_group_id": None,
            }
        )

    inp = build_input(
        year_groups=[
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "class-A", "class_name": "Y1-A", "student_count": 20}
                ],
                "period_grid": grid,
            }
        ],
        curriculum=[curriculum_entry(min_periods=3, max_per_day=2)],
        teachers=[teacher(staff_id="t1", competencies=[competency()])],
        settings=_settings_with(_zero_global("even_subject_spread", value=50)),
    )
    out = solve(inp)
    placed = [e for e in out.entries if not e.is_pinned]
    weekdays_used = {e.weekday for e in placed}
    assert len(placed) == 3
    assert weekdays_used == {0, 1, 2}  # one per day, perfectly spread


# ─── Room consistency ───────────────────────────────────────────────────────


def test_room_consistency_prefers_curriculum_preferred_room() -> None:
    inp = build_input(
        curriculum=[
            curriculum_entry(
                subject_id="science",
                min_periods=2,
                max_per_day=1,
                preferred_room_id="room-2",
            )
        ],
        teachers=[teacher(staff_id="t1", competencies=[competency(subject_id="science")])],
        rooms=[
            {
                "room_id": "room-1",
                "room_type": "classroom",
                "capacity": 30,
                "is_exclusive": True,
            },
            {
                "room_id": "room-2",
                "room_type": "classroom",
                "capacity": 30,
                "is_exclusive": True,
            },
        ],
        settings=_settings_with(_zero_global("room_consistency", value=20)),
    )
    out = solve(inp)
    placed = [e for e in out.entries if not e.is_pinned]
    assert len(placed) == 2
    assert all(e.room_id == "room-2" for e in placed)


# ─── Workload balance ───────────────────────────────────────────────────────


def test_workload_balance_splits_load_between_two_teachers() -> None:
    """4 lessons, 2 equally competent teachers — balance weight should split
    them 2-2 rather than dumping all 4 on one teacher."""
    inp = build_input(
        year_groups=[
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "class-A", "class_name": "Y1-A", "student_count": 20}
                ],
                "period_grid": build_period_grid(weekdays=4, periods_per_day=1),
            }
        ],
        curriculum=[curriculum_entry(min_periods=4, max_per_day=1)],
        teachers=[
            teacher(staff_id="t1", competencies=[competency()]),
            teacher(staff_id="t2", competencies=[competency()]),
        ],
        settings=_settings_with(_zero_global("workload_balance", value=50)),
    )
    out = solve(inp)
    placed = [e for e in out.entries if not e.is_pinned]
    assert len(placed) == 4
    counts = {"t1": 0, "t2": 0}
    for e in placed:
        if e.teacher_staff_id is not None:
            counts[e.teacher_staff_id] += 1
    assert counts["t1"] == 2
    assert counts["t2"] == 2


# ─── Break-duty balance ─────────────────────────────────────────────────────


def test_break_duty_balance_distributes_supervision_across_eligible_staff() -> None:
    """4 yard breaks, 2 supervisors. Without balance weight either teacher
    could take all 4. With it, the load splits 2-2."""
    grid = []
    for weekday in range(4):
        grid.append(
            {
                "weekday": weekday,
                "period_order": 0,
                "start_time": "08:00",
                "end_time": "08:45",
                "period_type": "break_supervision",
                "supervision_mode": "yard",
                "break_group_id": "yard-am",
            }
        )

    inp = build_input(
        year_groups=[
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "class-A", "class_name": "Y1-A", "student_count": 20}
                ],
                "period_grid": grid,
            }
        ],
        curriculum=[],
        teachers=[
            teacher(staff_id="t1", competencies=[], max_supervision=10),
            teacher(staff_id="t2", competencies=[], max_supervision=10),
        ],
        break_groups=[
            {
                "break_group_id": "yard-am",
                "name": "Morning yard",
                "year_group_ids": ["yg-1"],
                "required_supervisor_count": 1,
            }
        ],
        settings=_settings_with(_zero_global("break_duty_balance", value=50)),
    )
    out = solve(inp)
    sup = [e for e in out.entries if e.is_supervision]
    assert len(sup) == 4
    counts = {"t1": 0, "t2": 0}
    for e in sup:
        if e.teacher_staff_id is not None:
            counts[e.teacher_staff_id] += 1
    assert counts["t1"] == 2
    assert counts["t2"] == 2


# ─── Determinism + quality-metrics shape ─────────────────────────────────────


def test_determinism_with_soft_signals_active() -> None:
    """Same seed + single worker → byte-identical output even with the
    full soft objective active."""
    t1 = teacher(staff_id="t1", competencies=[competency()])
    t1["preferences"] = [
        {
            "id": "p1",
            "preference_type": "time_slot",
            "preference_payload": {"weekday": 0, "preferred": True},
            "priority": "medium",
        }
    ]
    payload = build_input(
        curriculum=[curriculum_entry(min_periods=4, max_per_day=2)],
        teachers=[t1],
        settings=_settings_with(
            {
                "even_subject_spread": 5,
                "minimise_teacher_gaps": 5,
                "room_consistency": 5,
                "workload_balance": 5,
                "break_duty_balance": 5,
            }
        ),
    )
    a = solve(payload).model_dump(mode="json")
    b = solve(payload).model_dump(mode="json")
    a["duration_ms"] = 0
    b["duration_ms"] = 0
    assert a == b


def test_placement_strictly_dominates_preference() -> None:
    """A placement of a single lesson must out-score satisfying any number
    of preferences when both are options. Tested by giving the solver a
    choice between (place lesson and dissatisfy avoid-prefs) vs (don't
    place anything and satisfy avoid-prefs). The solver must place."""
    grid = [
        {
            "weekday": 0,
            "period_order": 0,
            "start_time": "08:00",
            "end_time": "08:45",
            "period_type": "teaching",
            "supervision_mode": "none",
            "break_group_id": None,
        }
    ]
    teacher_payload = teacher(staff_id="t1", competencies=[competency()])
    teacher_payload["preferences"] = [
        {
            "id": "avoid-1",
            "preference_type": "time_slot",
            "preference_payload": {"weekday": 0, "period_order": 0, "preferred": False},
            "priority": "high",
        }
    ]
    inp = build_input(
        year_groups=[
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "class-A", "class_name": "Y1-A", "student_count": 20}
                ],
                "period_grid": grid,
            }
        ],
        curriculum=[curriculum_entry(min_periods=1, max_per_day=1)],
        teachers=[teacher_payload],
    )
    out = solve(inp)
    placed = [e for e in out.entries if not e.is_pinned]
    assert len(placed) == 1
    sat = placed[0].preference_satisfaction
    assert any(s.preference_id == "avoid-1" and not s.satisfied for s in sat)
