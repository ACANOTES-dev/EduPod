"""Test helpers for constructing ``SolverInputV2`` fixtures inline.

The Stage 2 JSON fixture is a contract guard. Solver tests parameterise
heavily — passing one big builder beats maintaining a JSON file per
permutation.
"""

from __future__ import annotations

from typing import Any

from solver_py.schema import SolverInputV2


def build_period_grid(
    *,
    weekdays: int = 5,
    periods_per_day: int = 4,
    start_hour: int = 8,
    period_minutes: int = 45,
) -> list[dict[str, Any]]:
    grid: list[dict[str, Any]] = []
    for weekday in range(weekdays):
        for period in range(periods_per_day):
            total_minutes = (start_hour * 60) + period * period_minutes
            start_h, start_m = divmod(total_minutes, 60)
            end_total = total_minutes + period_minutes
            end_h, end_m = divmod(end_total, 60)
            grid.append(
                {
                    "weekday": weekday,
                    "period_order": period,
                    "start_time": f"{start_h:02d}:{start_m:02d}",
                    "end_time": f"{end_h:02d}:{end_m:02d}",
                    "period_type": "teaching",
                    "supervision_mode": "none",
                    "break_group_id": None,
                }
            )
    return grid


def default_settings(*, seed: int = 0, max_seconds: int = 30) -> dict[str, Any]:
    return {
        "max_solver_duration_seconds": max_seconds,
        "preference_weights": {"low": 1, "medium": 3, "high": 5},
        "global_soft_weights": {
            "even_subject_spread": 1,
            "minimise_teacher_gaps": 1,
            "room_consistency": 1,
            "workload_balance": 1,
            "break_duty_balance": 1,
        },
        "solver_seed": seed,
    }


def build_input(**overrides: Any) -> SolverInputV2:
    """Build a ``SolverInputV2`` with sensible defaults overridable via kwargs.

    Defaults: 1 yg, 1 class, 1 teacher, 1 room, no closures, no pinned,
    no break groups, default settings, no curriculum (caller adds).
    """
    payload: dict[str, Any] = {
        "year_groups": [
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "class-A", "class_name": "Y1-A", "student_count": 20}
                ],
                "period_grid": build_period_grid(),
            }
        ],
        "curriculum": [],
        "teachers": [
            {
                "staff_profile_id": "t1",
                "name": "Teacher One",
                "competencies": [],
                "availability": [],
                "preferences": [],
                "max_periods_per_week": None,
                "max_periods_per_day": None,
                "max_supervision_duties_per_week": None,
            }
        ],
        "rooms": [
            {
                "room_id": "room-1",
                "room_type": "classroom",
                "capacity": 30,
                "is_exclusive": True,
            }
        ],
        "room_closures": [],
        "break_groups": [],
        "pinned_entries": [],
        "student_overlaps": [],
        "class_room_overrides": None,
        "overrides_applied": None,
        "settings": default_settings(),
    }
    payload.update(overrides)
    return SolverInputV2.model_validate(payload)


def curriculum_entry(
    *,
    year_group_id: str = "yg-1",
    subject_id: str = "maths",
    subject_name: str = "Maths",
    min_periods: int = 3,
    max_per_day: int = 2,
    requires_double: bool = False,
    double_count: int | None = None,
    required_room_type: str | None = None,
    preferred_room_id: str | None = None,
    class_id: str | None = None,
) -> dict[str, Any]:
    return {
        "year_group_id": year_group_id,
        "subject_id": subject_id,
        "subject_name": subject_name,
        "min_periods_per_week": min_periods,
        "max_periods_per_day": max_per_day,
        "preferred_periods_per_week": None,
        "requires_double_period": requires_double,
        "double_period_count": double_count,
        "required_room_type": required_room_type,
        "preferred_room_id": preferred_room_id,
        "class_id": class_id,
    }


def teacher(
    *,
    staff_id: str,
    name: str | None = None,
    competencies: list[dict[str, Any]] | None = None,
    availability: list[dict[str, Any]] | None = None,
    max_per_week: int | None = None,
    max_per_day: int | None = None,
    max_supervision: int | None = None,
) -> dict[str, Any]:
    return {
        "staff_profile_id": staff_id,
        "name": name or staff_id.upper(),
        "competencies": competencies or [],
        "availability": availability or [],
        "preferences": [],
        "max_periods_per_week": max_per_week,
        "max_periods_per_day": max_per_day,
        "max_supervision_duties_per_week": max_supervision,
    }


def competency(
    subject_id: str = "maths",
    year_group_id: str = "yg-1",
    class_id: str | None = None,
) -> dict[str, Any]:
    return {
        "subject_id": subject_id,
        "year_group_id": year_group_id,
        "class_id": class_id,
    }
