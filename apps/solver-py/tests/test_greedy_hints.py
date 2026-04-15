"""Stage 9 carryover §1 — tests for the enhanced greedy (round-robin + 1-swap).

The Stage 5 parity run showed the Python greedy placing 329/340 on the
stress-a-shape Tier 2 fixture vs the legacy TS greedy's 331/340. The
diagnosis was: pure MRV ordering lets one class hog early-chosen slots
and leaves later classes with fewer legal tuples than they deserve; a
class-round-robin plus a single-move repair pass closes the gap.

These tests pin the new behaviour on small deterministic fixtures and
verify:

  - round-robin distributes placements across classes when capacity is
    just-enough
  - existing behaviour on simple inputs is unchanged
  - determinism holds across repeated calls
"""

from __future__ import annotations

from typing import Any

from solver_py.schema import SolverInputV2
from solver_py.solver.hints import greedy_assign
from solver_py.solver.lessons import build_lessons
from solver_py.solver.pruning import build_legal_assignments
from solver_py.solver.slots import enumerate_slots
from tests._builders import (
    build_input,
    build_period_grid,
    competency,
    curriculum_entry,
    teacher,
)


def _run_greedy(inp: SolverInputV2) -> tuple[int, int, set[int]]:
    """Return ``(placed_count, total_lessons, chosen_la_idxs)``."""
    slots = enumerate_slots(inp)
    lessons = build_lessons(inp)
    legal, legal_by_lesson, _ = build_legal_assignments(inp, lessons, slots)
    chosen = greedy_assign(inp, lessons, slots, legal, legal_by_lesson)
    return len(chosen), len(lessons), chosen


def _two_class_yg(grid: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "year_group_id": "yg-1",
        "year_group_name": "Year 1",
        "sections": [
            {"class_id": "C1", "class_name": "Y1-A", "student_count": 20},
            {"class_id": "C2", "class_name": "Y1-B", "student_count": 20},
        ],
        "period_grid": grid,
    }


def test_round_robin_balances_placement_across_classes() -> None:
    """Both classes should receive at least one placement, even when the
    single teacher can only satisfy one class fully within the grid.

    Pre-fix (pure MRV-global, ties broken by lesson index) greedy would
    place both of class C1's lessons on round 1 because its lesson indices
    are lower, leaving none for C2. Round-robin forces the placement order
    to alternate classes, so C2 gets a lesson on round 1 too.
    """
    grid = build_period_grid(weekdays=1, periods_per_day=2)
    inp = build_input(
        year_groups=[_two_class_yg(grid)],
        curriculum=[curriculum_entry(min_periods=2)],
        teachers=[
            teacher(
                staff_id="T1",
                competencies=[competency(subject_id="maths")],
                max_per_week=4,
                max_per_day=2,
            )
        ],
    )
    _, total, chosen = _run_greedy(inp)
    assert total == 4  # 2 classes × 2 periods/week

    slots = enumerate_slots(inp)
    lessons = build_lessons(inp)
    legal, legal_by_lesson, _ = build_legal_assignments(inp, lessons, slots)
    placed_classes = {lessons[legal[la].lesson_idx].class_id for la in chosen}
    assert placed_classes == {"C1", "C2"}, (
        f"round-robin should place one lesson per class; got classes={placed_classes}"
    )


def test_greedy_is_stable_on_minimal_feasible_input() -> None:
    """A trivially-feasible fixture should be fully placed."""
    grid = build_period_grid(weekdays=1, periods_per_day=2)
    inp = build_input(
        year_groups=[
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "C1", "class_name": "A", "student_count": 20}
                ],
                "period_grid": grid,
            }
        ],
        curriculum=[curriculum_entry(min_periods=2)],
        teachers=[
            teacher(
                staff_id="T1",
                competencies=[competency(subject_id="maths")],
                max_per_week=10,
                max_per_day=2,
            )
        ],
    )
    placed, total, _ = _run_greedy(inp)
    assert placed == total == 2


def test_greedy_spreads_multi_period_subject_across_days() -> None:
    """STRESS-021 regression guard: a 5-period subject should land on 4+
    distinct weekdays when capacity allows, not cluster into 2-3 days.

    Setup: 1 class, 1 subject requiring 5 periods/week, 1 teacher fully
    available, 5 weekdays × 2 periods/day = 10 slots. The greedy has
    genuine freedom to place 5 lessons anywhere — without the day-spread
    bias it would park all 5 on Mon-Wed because candidate index order
    enumerates slot 0 (Mon P0), slot 1 (Mon P1), slot 2 (Tue P0), …
    """
    grid = build_period_grid(weekdays=5, periods_per_day=2)
    inp = build_input(
        year_groups=[
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "C1", "class_name": "Y1-A", "student_count": 20}
                ],
                "period_grid": grid,
            }
        ],
        curriculum=[curriculum_entry(subject_id="maths", min_periods=5, max_per_day=2)],
        teachers=[
            teacher(
                staff_id="T1",
                competencies=[competency(subject_id="maths")],
                max_per_week=20,
                max_per_day=2,
            )
        ],
    )
    slots = enumerate_slots(inp)
    lessons = build_lessons(inp)
    legal, legal_by_lesson, _ = build_legal_assignments(inp, lessons, slots)
    chosen = greedy_assign(inp, lessons, slots, legal, legal_by_lesson)

    # Recover which weekdays got used by any chosen la_idx.
    slot_by_id = {s.slot_id: s for s in slots}
    weekdays_used = {slot_by_id[legal[la].slot_id].weekday for la in chosen}
    assert len(chosen) == 5, f"expected 5 placements, got {len(chosen)}"
    assert len(weekdays_used) >= 4, (
        f"day-spread failure: maths placed across {sorted(weekdays_used)} "
        f"({len(weekdays_used)} days) — STRESS-021 expects ≥ 4 days"
    )


def test_greedy_determinism_same_input_same_placements() -> None:
    """Repeated calls on identical input must return identical ``la_idx`` sets."""
    grid = build_period_grid(weekdays=5, periods_per_day=4)
    year_groups = [
        {
            "year_group_id": "yg-1",
            "year_group_name": "Year 1",
            "sections": [
                {"class_id": f"C{i}", "class_name": f"Class {i}", "student_count": 20}
                for i in range(3)
            ],
            "period_grid": grid,
        }
    ]
    inp = build_input(
        year_groups=year_groups,
        curriculum=[
            curriculum_entry(subject_id="maths", min_periods=3),
            curriculum_entry(subject_id="english", min_periods=3),
        ],
        teachers=[
            teacher(
                staff_id=f"T{i}",
                competencies=[
                    competency(subject_id="maths"),
                    competency(subject_id="english"),
                ],
                max_per_week=20,
                max_per_day=4,
            )
            for i in range(3)
        ],
    )

    slots = enumerate_slots(inp)
    lessons = build_lessons(inp)
    legal, legal_by_lesson, _ = build_legal_assignments(inp, lessons, slots)
    chosen_a = greedy_assign(inp, lessons, slots, legal, legal_by_lesson)
    chosen_b = greedy_assign(inp, lessons, slots, legal, legal_by_lesson)
    assert chosen_a == chosen_b
