"""Stage 3 — yard-break supervision.

A break group requires ``required_supervisor_count`` teachers on every
yard supervision slot. Supervisors must be available at the slot's wall
clock, and a teacher cannot supervise + teach in the same time group.
``max_supervision_duties_per_week`` caps weekly supervision load.
"""

from __future__ import annotations

from solver_py.solver import solve
from tests._builders import build_input, competency, curriculum_entry, teacher


def _grid_with_yard_break() -> list[dict[str, object]]:
    """Two weekdays, three teaching slots each, with a yard break inserted
    after the first teaching slot of each day."""
    grid: list[dict[str, object]] = []
    for weekday in range(2):
        # Period 0: teaching 08:00–08:45
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
        # Period 1: yard break 08:45–09:00
        grid.append(
            {
                "weekday": weekday,
                "period_order": 1,
                "start_time": "08:45",
                "end_time": "09:00",
                "period_type": "break_supervision",
                "supervision_mode": "yard",
                "break_group_id": "yard-am",
            }
        )
        # Period 2: teaching 09:00–09:45
        grid.append(
            {
                "weekday": weekday,
                "period_order": 2,
                "start_time": "09:00",
                "end_time": "09:45",
                "period_type": "teaching",
                "supervision_mode": "none",
                "break_group_id": None,
            }
        )
    return grid


def test_yard_break_is_staffed_by_an_available_teacher() -> None:
    inp = build_input(
        year_groups=[
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "class-A", "class_name": "Y1-A", "student_count": 20}
                ],
                "period_grid": _grid_with_yard_break(),
            }
        ],
        curriculum=[curriculum_entry(min_periods=2, max_per_day=1)],
        teachers=[
            teacher(
                staff_id="t1",
                competencies=[competency()],
                max_per_week=10,
                max_supervision=5,
            ),
            teacher(
                staff_id="t2",
                competencies=[competency()],
                max_per_week=10,
                max_supervision=5,
            ),
        ],
        break_groups=[
            {
                "break_group_id": "yard-am",
                "name": "Morning yard",
                "year_group_ids": ["yg-1"],
                "required_supervisor_count": 1,
            }
        ],
    )
    out = solve(inp)
    supervision_entries = [e for e in out.entries if e.is_supervision]
    teaching_entries = [e for e in out.entries if not e.is_supervision and not e.is_pinned]

    # Two yard slots, one supervisor each.
    assert len(supervision_entries) == 2
    assert all(e.break_group_id == "yard-am" for e in supervision_entries)
    assert all(e.teacher_staff_id in {"t1", "t2"} for e in supervision_entries)
    # All curriculum demand placed.
    assert len(teaching_entries) == 2
    assert len(out.unassigned) == 0


def test_supervision_duty_cap_is_honoured() -> None:
    """Cap to 1 supervision per teacher per week: with 2 supervision slots
    needing one supervisor each and only two teachers available, each must
    take exactly one duty (no teacher does both)."""
    inp = build_input(
        year_groups=[
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "class-A", "class_name": "Y1-A", "student_count": 20}
                ],
                "period_grid": _grid_with_yard_break(),
            }
        ],
        curriculum=[curriculum_entry(min_periods=2, max_per_day=1)],
        teachers=[
            teacher(
                staff_id="t1",
                competencies=[competency()],
                max_per_week=10,
                max_supervision=1,
            ),
            teacher(
                staff_id="t2",
                competencies=[competency()],
                max_per_week=10,
                max_supervision=1,
            ),
        ],
        break_groups=[
            {
                "break_group_id": "yard-am",
                "name": "Morning yard",
                "year_group_ids": ["yg-1"],
                "required_supervisor_count": 1,
            }
        ],
    )
    out = solve(inp)
    supervision_entries = [e for e in out.entries if e.is_supervision]
    assert len(supervision_entries) == 2
    teachers_supervising = {e.teacher_staff_id for e in supervision_entries}
    assert teachers_supervising == {"t1", "t2"}  # split, not the same one twice
