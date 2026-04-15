"""Stage 3 — infeasibility tier.

Covers graceful degradation:

  - Demand exceeds available teaching slots → unplaced lessons appear in
    ``unassigned`` (graceful, not an exception).
  - A subject with no competent teacher → that lesson is unassigned with
    a clear reason.
  - A subject requiring a room type that doesn't exist → unassigned.
"""

from __future__ import annotations

from solver_py.solver import solve
from tests._builders import (
    build_input,
    build_period_grid,
    competency,
    curriculum_entry,
    teacher,
)


def test_demand_exceeds_capacity_yields_unassigned() -> None:
    inp = build_input(
        year_groups=[
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "class-A", "class_name": "Y1-A", "student_count": 20}
                ],
                # Only 2 teaching slots in the whole week.
                "period_grid": build_period_grid(weekdays=1, periods_per_day=2),
            }
        ],
        curriculum=[curriculum_entry(min_periods=5, max_per_day=2)],
        teachers=[teacher(staff_id="t1", competencies=[competency()])],
    )
    out = solve(inp)
    placed = [e for e in out.entries if not e.is_pinned]
    assert len(placed) == 2  # capacity-bounded
    assert len(out.unassigned) == 3
    assert all(u.subject_id == "maths" for u in out.unassigned)


def test_subject_with_no_competent_teacher_is_unassigned() -> None:
    inp = build_input(
        curriculum=[
            curriculum_entry(subject_id="science", min_periods=2, max_per_day=1)
        ],
        teachers=[
            teacher(staff_id="t1", competencies=[competency(subject_id="maths")])
        ],
    )
    out = solve(inp)
    assert len(out.entries) == 0
    assert len(out.unassigned) == 2
    assert all("competent teacher" in u.reason.lower() for u in out.unassigned)


def test_required_room_type_with_no_matching_room_is_unassigned() -> None:
    inp = build_input(
        curriculum=[
            curriculum_entry(
                subject_id="science",
                min_periods=2,
                max_per_day=1,
                required_room_type="lab",
            )
        ],
        teachers=[
            teacher(
                staff_id="t1", competencies=[competency(subject_id="science")]
            )
        ],
        # Only a classroom — no labs.
    )
    out = solve(inp)
    assert len(out.entries) == 0
    assert len(out.unassigned) == 2
    assert all("lab" in u.reason for u in out.unassigned)
