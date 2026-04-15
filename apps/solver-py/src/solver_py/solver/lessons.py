"""Lesson generation — turns curriculum demand into placeable lesson units.

A ``Lesson`` is one period that needs to be placed by the solver. The
generator:

1. Resolves SCHED-023 class-subject overrides — when a curriculum row has
   ``class_id != null``, it supersedes the year-group baseline for that one
   class. Other classes in the year group still use the baseline.
2. Subtracts pinned periods from each ``(class, subject)`` demand. If a
   lesson is already pinned, the solver doesn't need to place it again.
3. Pairs lessons that share ``requires_double_period=True`` into anchor +
   follower pairs so the model can constrain them onto consecutive slots
   with the same teacher and room.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from solver_py.schema import CurriculumEntry, SolverInputV2


@dataclass(frozen=True)
class Lesson:
    """One period of demand the solver must place."""

    lesson_id: str
    class_id: str
    year_group_id: str
    subject_id: str
    subject_name: str
    max_periods_per_day: int
    required_room_type: str | None
    preferred_room_id: str | None
    requires_double_period: bool
    double_pair_index: int | None
    """Lessons sharing the same ``double_pair_index`` form a consecutive pair.
    None for single-period lessons or for lessons whose double-period demand
    is fully satisfied by pinned entries."""


def _override_keys(input_payload: SolverInputV2) -> set[tuple[str, str]]:
    """Set of ``(class_id, subject_id)`` pairs that have a class-specific override."""
    keys: set[tuple[str, str]] = set()
    for entry in input_payload.curriculum:
        if entry.class_id is not None:
            keys.add((entry.class_id, entry.subject_id))
    return keys


def _pinned_demand(input_payload: SolverInputV2) -> dict[tuple[str, str], int]:
    """How many periods of each ``(class, subject)`` are already pinned (teaching only)."""
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for pin in input_payload.pinned_entries:
        if pin.subject_id is None:
            continue
        counts[(pin.class_id, pin.subject_id)] += 1
    return counts


def _curriculum_for_class(
    input_payload: SolverInputV2,
    class_id: str,
    year_group_id: str,
    overrides: set[tuple[str, str]],
) -> list[CurriculumEntry]:
    """Resolve the effective curriculum entries for a single class.

    Class-specific overrides take precedence over the year-group baseline
    for the matched ``(class, subject)`` pair only.
    """
    effective: list[CurriculumEntry] = []
    seen_subjects: set[str] = set()
    for entry in input_payload.curriculum:
        if entry.year_group_id != year_group_id:
            continue
        if entry.class_id is not None and entry.class_id == class_id:
            effective.append(entry)
            seen_subjects.add(entry.subject_id)
    for entry in input_payload.curriculum:
        if entry.year_group_id != year_group_id or entry.class_id is not None:
            continue
        if entry.subject_id in seen_subjects:
            continue
        if (class_id, entry.subject_id) in overrides:
            continue
        effective.append(entry)
    return effective


def build_lessons(input_payload: SolverInputV2) -> list[Lesson]:
    """Materialise the lesson list the solver must place."""
    overrides = _override_keys(input_payload)
    pinned_counts = _pinned_demand(input_payload)
    lessons: list[Lesson] = []
    next_double_pair_index = 0

    for yg in input_payload.year_groups:
        for section in yg.sections:
            entries = _curriculum_for_class(
                input_payload, section.class_id, yg.year_group_id, overrides
            )
            for entry in entries:
                pinned = pinned_counts.get((section.class_id, entry.subject_id), 0)
                remaining = max(entry.min_periods_per_week - pinned, 0)
                if remaining == 0:
                    continue

                doubles_required = (
                    entry.double_period_count if entry.requires_double_period else 0
                ) or 0
                doubles_to_place = max(doubles_required - (pinned // 2), 0)

                # First emit lessons that participate in double-period pairs.
                doubles_emitted = 0
                while doubles_emitted < doubles_to_place and remaining >= 2:
                    pair_index = next_double_pair_index
                    next_double_pair_index += 1
                    for slot_idx in range(2):
                        lessons.append(
                            Lesson(
                                lesson_id=(
                                    f"{section.class_id}::{entry.subject_id}"
                                    f"::dp{pair_index}::{slot_idx}"
                                ),
                                class_id=section.class_id,
                                year_group_id=yg.year_group_id,
                                subject_id=entry.subject_id,
                                subject_name=entry.subject_name,
                                max_periods_per_day=entry.max_periods_per_day,
                                required_room_type=entry.required_room_type,
                                preferred_room_id=entry.preferred_room_id,
                                requires_double_period=True,
                                double_pair_index=pair_index,
                            )
                        )
                    doubles_emitted += 1
                    remaining -= 2

                # Then emit standalone single-period lessons.
                for single_idx in range(remaining):
                    lessons.append(
                        Lesson(
                            lesson_id=f"{section.class_id}::{entry.subject_id}::s{single_idx}",
                            class_id=section.class_id,
                            year_group_id=yg.year_group_id,
                            subject_id=entry.subject_id,
                            subject_name=entry.subject_name,
                            max_periods_per_day=entry.max_periods_per_day,
                            required_room_type=entry.required_room_type,
                            preferred_room_id=entry.preferred_room_id,
                            requires_double_period=False,
                            double_pair_index=None,
                        )
                    )

    return lessons
