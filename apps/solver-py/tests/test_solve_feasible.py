"""Stage 3 — feasibility tier.

Covers:

  - Basic single-class single-subject placement.
  - SCHED-023 class-subject override (different demand per class).
  - Required room type filtering.
  - Pinned entries pass through and consume slots.
  - Determinism: two runs with the same seed produce the same output.
"""

from __future__ import annotations

from collections import Counter

import pytest

from solver_py.solver import solve
from tests._builders import (
    build_input,
    build_period_grid,
    competency,
    curriculum_entry,
    teacher,
)


def _no_double_booked_teachers(entries: list[object]) -> bool:
    seen: set[tuple[str, int, int]] = set()
    for e in entries:
        teacher_id = e.teacher_staff_id  # type: ignore[attr-defined]
        if teacher_id is None:
            continue
        key = (teacher_id, e.weekday, e.period_order)  # type: ignore[attr-defined]
        if key in seen:
            return False
        seen.add(key)
    return True


def _no_double_booked_classes(entries: list[object]) -> bool:
    seen: set[tuple[str, int, int]] = set()
    for e in entries:
        class_id = e.class_id  # type: ignore[attr-defined]
        if not class_id or e.is_supervision:  # type: ignore[attr-defined]
            continue
        key = (class_id, e.weekday, e.period_order)  # type: ignore[attr-defined]
        if key in seen:
            return False
        seen.add(key)
    return True


# ─── Tier 1: minimal feasible ─────────────────────────────────────────────────


def test_basic_one_class_one_subject_one_teacher() -> None:
    inp = build_input(
        curriculum=[curriculum_entry(min_periods=3, max_per_day=1)],
        teachers=[teacher(staff_id="t1", competencies=[competency()])],
    )
    out = solve(inp)
    assert len(out.unassigned) == 0, [u.reason for u in out.unassigned]
    assert len(out.entries) == 3
    assert all(e.teacher_staff_id == "t1" for e in out.entries)
    assert all(e.subject_id == "maths" for e in out.entries)
    assert _no_double_booked_classes(list(out.entries))
    assert _no_double_booked_teachers(list(out.entries))


# ─── Tier 2: SCHED-023 override ───────────────────────────────────────────────


def test_class_subject_override_supersedes_baseline() -> None:
    inp = build_input(
        year_groups=[
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "class-A", "class_name": "Y1-A", "student_count": 20},
                    {"class_id": "class-B", "class_name": "Y1-B", "student_count": 20},
                ],
                "period_grid": build_period_grid(),
            }
        ],
        curriculum=[
            curriculum_entry(min_periods=3, max_per_day=1),  # baseline
            curriculum_entry(min_periods=5, max_per_day=2, class_id="class-A"),  # override
        ],
        teachers=[
            teacher(
                staff_id="t1",
                competencies=[competency(class_id=None)],
                max_per_week=20,
            ),
            teacher(
                staff_id="t2",
                competencies=[competency(class_id=None)],
                max_per_week=20,
            ),
        ],
        rooms=[
            {
                "room_id": "room-1",
                "room_type": "classroom",
                "capacity": 30,
                "is_exclusive": False,
            },
            {
                "room_id": "room-2",
                "room_type": "classroom",
                "capacity": 30,
                "is_exclusive": False,
            },
        ],
    )
    out = solve(inp)
    assert len(out.unassigned) == 0, [u.reason for u in out.unassigned]
    counts = Counter(e.class_id for e in out.entries)
    assert counts["class-A"] == 5  # override wins
    assert counts["class-B"] == 3  # baseline applies
    assert _no_double_booked_classes(list(out.entries))
    assert _no_double_booked_teachers(list(out.entries))


# ─── Tier 3: room-type filter ─────────────────────────────────────────────────


def test_required_room_type_forces_lab_assignment() -> None:
    inp = build_input(
        curriculum=[
            curriculum_entry(
                subject_id="science",
                subject_name="Science",
                min_periods=2,
                max_per_day=1,
                required_room_type="lab",
            )
        ],
        teachers=[
            teacher(staff_id="t1", competencies=[competency(subject_id="science")])
        ],
        rooms=[
            {
                "room_id": "room-1",
                "room_type": "classroom",
                "capacity": 30,
                "is_exclusive": True,
            },
            {
                "room_id": "lab-1",
                "room_type": "lab",
                "capacity": 24,
                "is_exclusive": True,
            },
        ],
    )
    out = solve(inp)
    assert len(out.entries) == 2
    assert all(e.room_id == "lab-1" for e in out.entries)


# ─── Tier 4: pinned passthrough ───────────────────────────────────────────────


def test_pinned_entries_pass_through_and_consume_demand() -> None:
    inp = build_input(
        curriculum=[curriculum_entry(min_periods=3, max_per_day=1)],
        teachers=[
            teacher(
                staff_id="t1",
                competencies=[competency()],
                max_per_week=10,
            )
        ],
        pinned_entries=[
            {
                "schedule_id": "pin-1",
                "class_id": "class-A",
                "subject_id": "maths",
                "year_group_id": "yg-1",
                "room_id": "room-1",
                "teacher_staff_id": "t1",
                "weekday": 0,
                "period_order": 0,
            }
        ],
    )
    out = solve(inp)
    assert len(out.unassigned) == 0
    pinned_entries = [e for e in out.entries if e.is_pinned]
    placed_entries = [e for e in out.entries if not e.is_pinned]
    assert len(pinned_entries) == 1
    assert len(placed_entries) == 2  # 3 demanded - 1 pinned
    assert _no_double_booked_classes(list(out.entries))
    assert _no_double_booked_teachers(list(out.entries))


# ─── Tier 5: determinism ──────────────────────────────────────────────────────


def test_determinism_same_seed_produces_same_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """SCHED-041 §B caveat: CP-SAT multi-worker is non-deterministic (each
    worker races independently). Production runs with ``num_search_workers=8``
    per Phase B fix, trading determinism for the ability to actually find
    feasibility on NHQS-scale inputs. This test force-pins workers=1 via
    the module-scope constant to validate the solver's own determinism
    guarantee under the single-worker path that the determinism invariant
    still holds for. The scheduling service records ``solver_seed`` so
    prod reproduction is still possible when the corresponding seed-1
    workers=1 debug rerun is invoked from the admin tools.
    """
    import importlib

    # See test_solver_diagnostics.py — solver_py.solver.__init__ shadows
    # the submodule name, so ``importlib.import_module`` is required.
    solve_mod = importlib.import_module("solver_py.solver.solve")
    monkeypatch.setattr(solve_mod, "_CP_SAT_NUM_SEARCH_WORKERS", 1)

    def make() -> object:
        inp = build_input(
            curriculum=[
                curriculum_entry(subject_id="maths", min_periods=4, max_per_day=2),
                curriculum_entry(
                    subject_id="english",
                    subject_name="English",
                    min_periods=3,
                    max_per_day=1,
                ),
            ],
            teachers=[
                teacher(
                    staff_id="t1",
                    competencies=[
                        competency(subject_id="maths"),
                        competency(subject_id="english"),
                    ],
                    max_per_week=20,
                )
            ],
        )
        out = solve(inp)
        return [
            (e.class_id, e.subject_id, e.weekday, e.period_order, e.teacher_staff_id)
            for e in sorted(
                out.entries,
                key=lambda e: (e.weekday, e.period_order, e.subject_id or ""),
            )
        ]

    assert make() == make()
