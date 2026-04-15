"""STRESS-021 day-spread reproducer (Stage 9.5.1 §C diagnosis).

Stage 9 Session 2c post-Wave-4-fixes reported 38/40 (class, subject)
pairs with ``min_periods_per_week >= 4`` now spread across >= 4 days
on stress-a. The remaining 2 pairs pack 2+2+1 into 3 days under the
per-day cap of 2.

Stage 9.5.1 §C requires distinguishing:

  - (a) **Greedy-origin:** the greedy's commit order left the target
    pair's only-competent teachers committed to other (class, subject)
    lessons on Thu/Fri. A smarter tie-breaker (Option 1) could shift
    one earlier placement to free a 4th day.
  - (b) **Capacity-inherent:** given the exact shape + per-day caps,
    no placement exists where the pair spans >= 4 days. Math guarantees
    the pack.

This test synthesises a stress-a-shaped fixture and diagnoses the
residual behaviour. On current post-Stage-9 greedy, it either passes
(all 4+ period pairs span >= 4 days, so STRESS-021 is fully closed and
the 2 residuals were a production-specific quirk not reproducible in
synthetic), or it reproduces the pack and we have a concrete test to
aim Option 1 at.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import pytest

from solver_py.schema import SolverInputV2
from solver_py.solver.hints import greedy_assign
from solver_py.solver.lessons import build_lessons
from solver_py.solver.pruning import build_legal_assignments
from solver_py.solver.slots import enumerate_slots

# ─── Fixture: stress-a shape ────────────────────────────────────────────────


def _stress_a_shape_payload() -> dict[str, Any]:
    """10 classes × 11 subjects × 32 periods/class/week shape.

    Mirrors the stress-a seed in ``packages/prisma/scripts/stress-seed.ts``:

      - 6 year groups (Y7-Y12) with 1-2 classes each, total 10.
      - 11 subjects: Maths/English at 5 p/wk, Irish/Science at 4, Hist/Geo at 3,
        Religion/PE/Art at 2, IT/Music at 1. Total 32 p/wk/class.
      - 20 teachers, every teacher competent in every subject for every YG
        (full 20 × 66 = 1320 competency rows in production — we mirror the
        shape in the fixture with inline competencies).
      - 25 rooms; per-day cap 2; weekly cap 20.
      - 8 periods × 5 days = 40 slots.
    """
    weekdays = 5
    periods_per_day = 8
    classes = [
        ("Y7-A", "yg-7"),
        ("Y7-B", "yg-7"),
        ("Y8-A", "yg-8"),
        ("Y8-B", "yg-8"),
        ("Y9-A", "yg-9"),
        ("Y9-B", "yg-9"),
        ("Y10-A", "yg-10"),
        ("Y10-B", "yg-10"),
        ("Y11-A", "yg-11"),
        ("Y12-A", "yg-12"),
    ]
    subjects = [
        ("maths", 5),
        ("english", 5),
        ("irish", 4),
        ("science", 4),
        ("history", 3),
        ("geo", 3),
        ("religion", 2),
        ("pe", 2),
        ("art", 2),
        ("it", 1),
        ("music", 1),
    ]
    year_group_ids = sorted({yg for _, yg in classes})

    grid: list[dict[str, Any]] = []
    for weekday in range(weekdays):
        for period in range(periods_per_day):
            base = 8 * 60 + period * 60
            grid.append(
                {
                    "weekday": weekday,
                    "period_order": period,
                    "start_time": f"{base // 60:02d}:{base % 60:02d}",
                    "end_time": f"{(base + 45) // 60:02d}:{(base + 45) % 60:02d}",
                    "period_type": "teaching",
                    "supervision_mode": "none",
                    "break_group_id": None,
                }
            )

    year_groups: list[dict[str, Any]] = []
    for yg_id in year_group_ids:
        year_groups.append(
            {
                "year_group_id": yg_id,
                "year_group_name": yg_id,
                "sections": [
                    {"class_id": cid, "class_name": cid, "student_count": 24}
                    for cid, yg in classes
                    if yg == yg_id
                ],
                "period_grid": grid,
            }
        )

    curriculum: list[dict[str, Any]] = []
    for yg_id in year_group_ids:
        for subject_id, periods in subjects:
            curriculum.append(
                {
                    "year_group_id": yg_id,
                    "subject_id": subject_id,
                    "subject_name": subject_id.title(),
                    "min_periods_per_week": periods,
                    "max_periods_per_day": 2,
                    "preferred_periods_per_week": None,
                    "requires_double_period": False,
                    "double_period_count": None,
                    "required_room_type": None,
                    "preferred_room_id": None,
                    "class_id": None,
                }
            )

    # 20 teachers, each competent for every subject for every year group.
    teachers: list[dict[str, Any]] = []
    for i in range(20):
        teachers.append(
            {
                "staff_profile_id": f"t-{i}",
                "name": f"Teacher {i}",
                "competencies": [
                    {"subject_id": s, "year_group_id": yg, "class_id": None}
                    for yg in year_group_ids
                    for s, _ in subjects
                ],
                "availability": [],
                "preferences": [],
                "max_periods_per_week": 20,
                "max_periods_per_day": 8,
                "max_supervision_duties_per_week": None,
            }
        )

    rooms: list[dict[str, Any]] = [
        {"room_id": f"r-{i}", "room_type": "classroom", "capacity": 30, "is_exclusive": True}
        for i in range(25)
    ]

    return {
        "year_groups": year_groups,
        "curriculum": curriculum,
        "teachers": teachers,
        "rooms": rooms,
        "room_closures": [],
        "break_groups": [],
        "pinned_entries": [],
        "student_overlaps": [],
        "class_room_overrides": None,
        "overrides_applied": None,
        "settings": {
            "max_solver_duration_seconds": 30,
            "preference_weights": {"low": 1, "medium": 3, "high": 5},
            "global_soft_weights": {
                "even_subject_spread": 1,
                "minimise_teacher_gaps": 1,
                "room_consistency": 1,
                "workload_balance": 1,
                "break_duty_balance": 1,
            },
            "solver_seed": 0,
        },
    }


def _run_greedy_and_tally(
    inp: SolverInputV2,
) -> dict[tuple[str, str], set[int]]:
    """Return ``{(class_id, subject_id): set_of_weekdays}`` from greedy output."""
    slots = enumerate_slots(inp)
    lessons = build_lessons(inp)
    legal, legal_by_lesson, _ = build_legal_assignments(inp, lessons, slots)
    chosen = greedy_assign(inp, lessons, slots, legal, legal_by_lesson)

    slot_by_id = {s.slot_id: s for s in slots}
    days_by_pair: dict[tuple[str, str], set[int]] = defaultdict(set)
    for la_idx in chosen:
        la = legal[la_idx]
        lesson = lessons[la.lesson_idx]
        slot = slot_by_id[la.slot_id]
        days_by_pair[(lesson.class_id, lesson.subject_id)].add(slot.weekday)
    return days_by_pair


def test_stress_021_stressa_shape_spread_greedy() -> None:
    """Diagnostic: record how many pairs with pair_lesson_count >= 4 span >= 4 days.

    This test does NOT assert a pass bar — it records a diagnostic. The
    acceptance-criteria test is ``test_stress_021_spread_assertion`` below.
    """
    payload = _stress_a_shape_payload()
    inp = SolverInputV2.model_validate(payload)
    days_by_pair = _run_greedy_and_tally(inp)

    # Stress-a shape: pairs with periods >= 4 are Maths (5), English (5),
    # Irish (4), Science (4) across 10 classes = 40 pairs.
    pair_count = sum(1 for _, _ in _pairs_with_min_4_periods(payload))
    long_pairs = [
        (cid, sid)
        for cid, sid in _pairs_with_min_4_periods(payload)
        if (cid, sid) in days_by_pair
    ]
    assert pair_count >= 40, f"expected >= 40 long pairs, got {pair_count}"

    # Tally spread distribution.
    spread_histogram: dict[int, int] = defaultdict(int)
    for cid, sid in long_pairs:
        spread_histogram[len(days_by_pair[(cid, sid)])] += 1
    # Diagnostic output — pytest -s shows this in the run.
    print("\nSTRESS-021 stress-a-shape greedy spread histogram:")
    for spread, count in sorted(spread_histogram.items()):
        print(f"  {spread} distinct days: {count} pairs")
    packed = [
        (cid, sid, len(days_by_pair[(cid, sid)]))
        for cid, sid in long_pairs
        if len(days_by_pair[(cid, sid)]) < 4
    ]
    print(f"  total packed pairs (< 4 days): {len(packed)}")
    for cid, sid, n in packed[:10]:
        print(f"    {cid} {sid} -> {n} days")


def _pairs_with_min_4_periods(payload: dict[str, Any]) -> list[tuple[str, str]]:
    """Enumerate (class_id, subject_id) pairs whose curriculum demands >= 4."""
    demand_by_yg: dict[str, dict[str, int]] = defaultdict(dict)
    for row in payload["curriculum"]:
        if row["min_periods_per_week"] >= 4:
            demand_by_yg[row["year_group_id"]][row["subject_id"]] = row[
                "min_periods_per_week"
            ]
    out: list[tuple[str, str]] = []
    for yg in payload["year_groups"]:
        yg_id = yg["year_group_id"]
        for section in yg["sections"]:
            for sid in demand_by_yg.get(yg_id, {}):
                out.append((section["class_id"], sid))
    return out


def test_stress_021_spread_assertion_stressa_shape() -> None:
    """Stage 9.5.1 §C acceptance bar: every pair with >= 4 p/wk demand
    spans >= 4 distinct weekdays in the greedy output.

    If this fails, the diagnostic test above shows which pairs packed and
    by how much — use it to design Option 1 (greedy tie-breaker) or
    Option 2 (CP-SAT soft penalty).
    """
    payload = _stress_a_shape_payload()
    inp = SolverInputV2.model_validate(payload)
    days_by_pair = _run_greedy_and_tally(inp)
    long_pairs = _pairs_with_min_4_periods(payload)
    packed = [
        (cid, sid, len(days_by_pair.get((cid, sid), set())))
        for cid, sid in long_pairs
        if len(days_by_pair.get((cid, sid), set())) < 4
    ]
    assert not packed, (
        f"{len(packed)} of {len(long_pairs)} long pairs packed into < 4 days: "
        f"{packed[:5]}"
    )


# ─── Tight-supply variant: designed to trigger the pack behaviour ────────────


def _tight_supply_payload() -> dict[str, Any]:
    """Minimal 3-class / 5-subject / 3-teacher fixture that can exhibit packing.

    Shape:
      - 1 year group, 3 classes.
      - 2 subjects at 5 periods/week (Maths, English) + 3 subjects at 3 p/wk.
        Total 19 p/wk/class × 3 classes = 57 total demand.
      - Grid: 8 periods × 5 days = 40 slots per class.
      - 3 teachers, each competent in all 5 subjects. Weekly cap 20 (so no
        single teacher can carry the 57-lesson load; greedy must rotate).
      - Per-day cap on each subject: 2.

    This shape has enough slack that 5-period subjects CAN spread to 5 days,
    but the round-robin's choice order may still create pack-prone
    teacher-commitment patterns. Used as the Option-1 tie-break test.
    """
    weekdays = 5
    periods_per_day = 8
    grid: list[dict[str, Any]] = []
    for weekday in range(weekdays):
        for period in range(periods_per_day):
            base = 8 * 60 + period * 60
            grid.append(
                {
                    "weekday": weekday,
                    "period_order": period,
                    "start_time": f"{base // 60:02d}:{base % 60:02d}",
                    "end_time": f"{(base + 45) // 60:02d}:{(base + 45) % 60:02d}",
                    "period_type": "teaching",
                    "supervision_mode": "none",
                    "break_group_id": None,
                }
            )

    year_groups = [
        {
            "year_group_id": "yg-1",
            "year_group_name": "Year 1",
            "sections": [
                {"class_id": "C1", "class_name": "C1", "student_count": 24},
                {"class_id": "C2", "class_name": "C2", "student_count": 24},
                {"class_id": "C3", "class_name": "C3", "student_count": 24},
            ],
            "period_grid": grid,
        }
    ]

    subjects = [("maths", 5), ("english", 5), ("history", 3), ("geo", 3), ("art", 3)]
    curriculum = [
        {
            "year_group_id": "yg-1",
            "subject_id": sid,
            "subject_name": sid.title(),
            "min_periods_per_week": p,
            "max_periods_per_day": 2,
            "preferred_periods_per_week": None,
            "requires_double_period": False,
            "double_period_count": None,
            "required_room_type": None,
            "preferred_room_id": None,
            "class_id": None,
        }
        for sid, p in subjects
    ]

    teachers = [
        {
            "staff_profile_id": f"t-{i}",
            "name": f"Teacher {i}",
            "competencies": [
                {"subject_id": s, "year_group_id": "yg-1", "class_id": None}
                for s, _ in subjects
            ],
            "availability": [],
            "preferences": [],
            "max_periods_per_week": 20,
            "max_periods_per_day": 8,
            "max_supervision_duties_per_week": None,
        }
        for i in range(3)
    ]

    rooms = [
        {"room_id": f"r-{i}", "room_type": "classroom", "capacity": 30, "is_exclusive": True}
        for i in range(10)
    ]

    return {
        "year_groups": year_groups,
        "curriculum": curriculum,
        "teachers": teachers,
        "rooms": rooms,
        "room_closures": [],
        "break_groups": [],
        "pinned_entries": [],
        "student_overlaps": [],
        "class_room_overrides": None,
        "overrides_applied": None,
        "settings": {
            "max_solver_duration_seconds": 30,
            "preference_weights": {"low": 1, "medium": 3, "high": 5},
            "global_soft_weights": {
                "even_subject_spread": 1,
                "minimise_teacher_gaps": 1,
                "room_consistency": 1,
                "workload_balance": 1,
                "break_duty_balance": 1,
            },
            "solver_seed": 0,
        },
    }


def test_stress_021_tight_supply_spread() -> None:
    """On a tight-supply 3-class fixture, every >= 4-period pair spans >= 4 days."""
    payload = _tight_supply_payload()
    inp = SolverInputV2.model_validate(payload)
    days_by_pair = _run_greedy_and_tally(inp)
    long_pairs = _pairs_with_min_4_periods(payload)
    packed = [
        (cid, sid, len(days_by_pair.get((cid, sid), set())))
        for cid, sid in long_pairs
        if len(days_by_pair.get((cid, sid), set())) < 4
    ]
    assert not packed, f"tight-supply fixture packed {len(packed)} pairs: {packed}"


# ─── Determinism sanity (guards the Option 1 fix against non-determinism) ─────


def test_stress_021_greedy_determinism() -> None:
    """STRESS-021 fixture must produce identical greedy output across runs."""
    payload = _stress_a_shape_payload()
    inp = SolverInputV2.model_validate(payload)
    a = _run_greedy_and_tally(inp)
    b = _run_greedy_and_tally(inp)
    assert a == b


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
