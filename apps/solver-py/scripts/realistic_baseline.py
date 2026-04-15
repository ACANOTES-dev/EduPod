"""Synthesise the Stage 3 'realistic baseline' fixture.

Shape mirrors the documented Stage 3 / Stage 5 baseline:
  - 10 classes (one year group), 8 subjects, 5×6 grid (Mon–Fri × 6 periods)
  - 20 specialist teachers, each competent for 1–2 subjects
  - 15 rooms (12 classroom + 3 lab)
  - One subject ('science') requires the lab room type
  - Generous teacher availability + per-week caps

The fixture is deterministic — same seed → same JSON. Used by the
``benchmark_realistic.py`` harness to profile build + solve.
"""

from __future__ import annotations

import random
from typing import Any


def make_realistic_baseline_payload(*, seed: int = 42) -> dict[str, Any]:
    rng = random.Random(seed)

    weekdays = 5
    periods_per_day = 6
    classes_per_yg = 10
    subjects = [
        ("maths", "Maths"),
        ("english", "English"),
        ("science", "Science"),
        ("history", "History"),
        ("geo", "Geography"),
        ("art", "Art"),
        ("music", "Music"),
        ("pe", "PE"),
    ]
    teacher_count = 20
    classroom_count = 12
    lab_count = 3

    # Period grid — teaching blocks 08:00–14:00 with 45-min slots.
    grid: list[dict[str, Any]] = []
    for weekday in range(weekdays):
        for period in range(periods_per_day):
            start_minutes = 8 * 60 + period * 60
            end_minutes = start_minutes + 45
            grid.append(
                {
                    "weekday": weekday,
                    "period_order": period,
                    "start_time": f"{start_minutes // 60:02d}:{start_minutes % 60:02d}",
                    "end_time": f"{end_minutes // 60:02d}:{end_minutes % 60:02d}",
                    "period_type": "teaching",
                    "supervision_mode": "none",
                    "break_group_id": None,
                }
            )

    sections = [
        {"class_id": f"class-{i}", "class_name": f"Y1-{chr(65 + i)}", "student_count": 24}
        for i in range(classes_per_yg)
    ]

    year_groups = [
        {
            "year_group_id": "yg-1",
            "year_group_name": "Year 1",
            "sections": sections,
            "period_grid": grid,
        }
    ]

    # Curriculum: each subject 3–5 periods/week.
    curriculum: list[dict[str, Any]] = []
    for subject_id, subject_name in subjects:
        curriculum.append(
            {
                "year_group_id": "yg-1",
                "subject_id": subject_id,
                "subject_name": subject_name,
                "min_periods_per_week": 4 if subject_id in {"maths", "english"} else 3,
                "max_periods_per_day": 2,
                "preferred_periods_per_week": None,
                "requires_double_period": False,
                "double_period_count": None,
                "required_room_type": "lab" if subject_id == "science" else None,
                "preferred_room_id": None,
                "class_id": None,
            }
        )

    # Teachers — each competent for 1–2 random subjects (pool entries).
    teachers: list[dict[str, Any]] = []
    subject_ids = [s for s, _ in subjects]
    for i in range(teacher_count):
        chosen = rng.sample(subject_ids, k=rng.choice([1, 2]))
        teachers.append(
            {
                "staff_profile_id": f"t-{i}",
                "name": f"Teacher {i}",
                "competencies": [
                    {"subject_id": s, "year_group_id": "yg-1", "class_id": None}
                    for s in chosen
                ],
                "availability": [],
                "preferences": [],
                "max_periods_per_week": 22,
                "max_periods_per_day": 5,
                "max_supervision_duties_per_week": None,
            }
        )

    rooms: list[dict[str, Any]] = []
    for i in range(classroom_count):
        rooms.append(
            {
                "room_id": f"room-c{i}",
                "room_type": "classroom",
                "capacity": 30,
                "is_exclusive": True,
            }
        )
    for i in range(lab_count):
        rooms.append(
            {
                "room_id": f"room-l{i}",
                "room_type": "lab",
                "capacity": 24,
                "is_exclusive": True,
            }
        )

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


__all__ = ["make_realistic_baseline_payload"]
