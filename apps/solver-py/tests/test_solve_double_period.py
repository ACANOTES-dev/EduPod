"""Stage 3 — double-period requirement.

A curriculum entry with ``requires_double_period=True`` and
``double_period_count=N`` forces ``N`` pairs of consecutive teaching
slots, same teacher and same room each pair. Stage 3 enforces the
pairing as a hard constraint via the model's anchor/follower channel.
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


def test_double_period_pair_is_consecutive_same_teacher_same_room() -> None:
    inp = build_input(
        year_groups=[
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "class-A", "class_name": "Y1-A", "student_count": 20}
                ],
                "period_grid": build_period_grid(weekdays=2, periods_per_day=4),
            }
        ],
        curriculum=[
            curriculum_entry(
                subject_id="science",
                min_periods=2,
                max_per_day=2,
                requires_double=True,
                double_count=1,
            )
        ],
        teachers=[
            teacher(
                staff_id="t1",
                competencies=[competency(subject_id="science")],
                max_per_week=10,
            ),
            teacher(
                staff_id="t2",
                competencies=[competency(subject_id="science")],
                max_per_week=10,
            ),
        ],
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
    )
    out = solve(inp)
    assert len(out.unassigned) == 0
    assert len(out.entries) == 2

    # Same weekday, consecutive period_order, same teacher, same room.
    e1, e2 = sorted(out.entries, key=lambda e: (e.weekday, e.period_order))
    assert e1.weekday == e2.weekday
    assert e2.period_order == e1.period_order + 1
    assert e1.teacher_staff_id == e2.teacher_staff_id
    assert e1.room_id == e2.room_id
