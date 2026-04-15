"""SCHED-018 / STRESS-030 — class-level preferred-room override is honoured.

The ``class_scheduling_requirements`` table carries class-level room
preferences (e.g. Y11-A Science goes in LAB02). Orchestration emits these
as ``ClassRoomOverride`` rows with ``subject_id=null`` (class-wildcard).
The Python sidecar's ``_assign_rooms`` post-solve pass looks up the
preferred room by ``(class_id, lesson.subject_id)`` first and falls back
to the class-wildcard ``(class_id, None)``.

Before the fix, only the subject-specific key was consulted and the
wildcard entry was silently ignored.
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


def _base_payload_with_two_rooms() -> dict:
    grid = build_period_grid(weekdays=1, periods_per_day=2)
    return dict(
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
        curriculum=[curriculum_entry(subject_id="maths", min_periods=2)],
        teachers=[
            teacher(
                staff_id="T1",
                competencies=[competency(subject_id="maths")],
                max_per_week=10,
                max_per_day=2,
            )
        ],
        rooms=[
            {"room_id": "ROOM-A", "room_type": "classroom", "capacity": 30, "is_exclusive": True},
            {"room_id": "ROOM-B", "room_type": "classroom", "capacity": 30, "is_exclusive": True},
        ],
    )


def test_class_wildcard_override_is_honoured() -> None:
    """Class-level override with subject_id=null routes every lesson for
    that class to the preferred room."""
    payload = _base_payload_with_two_rooms()
    payload["class_room_overrides"] = [
        {
            "class_id": "C1",
            "subject_id": None,  # class-wildcard
            "preferred_room_id": "ROOM-B",
            "required_room_type": None,
        }
    ]
    inp = build_input(**payload)
    out = solve(inp)
    placed = [e for e in out.entries if not e.is_supervision and e.class_id == "C1"]
    assert len(placed) == 2
    rooms_used = {e.room_id for e in placed}
    assert rooms_used == {"ROOM-B"}, (
        f"class-wildcard override should pin all lessons to ROOM-B; got {rooms_used}"
    )


def test_no_override_leaves_room_choice_open() -> None:
    """Baseline: without an override the solver may choose either room."""
    payload = _base_payload_with_two_rooms()
    # no class_room_overrides set
    inp = build_input(**payload)
    out = solve(inp)
    placed = [e for e in out.entries if not e.is_supervision and e.class_id == "C1"]
    assert len(placed) == 2
    assigned_rooms = {e.room_id for e in placed}
    # At least one room is assigned — the exact choice is up to the solver
    # but the sidecar must never leave room_id null on a placed teaching lesson.
    assert None not in assigned_rooms
