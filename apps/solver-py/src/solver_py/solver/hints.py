"""Greedy initial assignment used as a CP-SAT solution hint.

CP-SAT struggles to find a first-feasible solution on the realistic
baseline (260 lessons × 30 slots × ~4 teachers) within a single-worker
30s budget — the symmetry between interchangeable lessons of the same
(class, subject) blows up the search frontier. A simple greedy
pre-assignment, fed to ``model.add_hint``, gives the solver a
warm-start that cuts time-to-feasible from > 30s down to seconds.

The greedy is intentionally simple: lessons in MRV order (fewest legal
tuples first), pick the first legal ``(slot, teacher)`` that respects
the class, teacher-day, teacher-week, and per-(room_type, time_group)
budgets. Conflicts are skipped, not back-tracked — partial hints are
fine; CP-SAT treats hints as soft suggestions.
"""

from __future__ import annotations

from collections import defaultdict

from solver_py.schema import PinnedEntryV2, SolverInputV2
from solver_py.solver.lessons import Lesson
from solver_py.solver.pruning import LegalAssignment
from solver_py.solver.slots import PhysicalSlot


def greedy_assign(
    input_payload: SolverInputV2,
    lessons: list[Lesson],
    slots: list[PhysicalSlot],
    legal: list[LegalAssignment],
    legal_by_lesson: dict[int, list[int]],
) -> set[int]:
    """Return the set of ``la_idx`` values that the greedy chooses to place."""
    slot_by_id: dict[int, PhysicalSlot] = {s.slot_id: s for s in slots}

    # Capacity bookkeeping
    class_busy: set[tuple[str, int]] = set()
    teacher_busy: set[tuple[int, int]] = set()
    teacher_week_count: dict[int, int] = defaultdict(int)
    teacher_day_count: dict[tuple[int, int], int] = defaultdict(int)
    subject_class_day_count: dict[tuple[str, str, int], int] = defaultdict(int)

    # Room-type / time-group capacity, mirroring model.py section D
    closed_rooms = {rc.room_id for rc in input_payload.room_closures}
    exclusive_by_type: dict[str, int] = defaultdict(int)
    has_nonexclusive_by_type: dict[str, bool] = defaultdict(bool)
    for room in input_payload.rooms:
        if room.room_id in closed_rooms:
            continue
        if room.is_exclusive:
            exclusive_by_type[room.room_type] += 1
        else:
            has_nonexclusive_by_type[room.room_type] = True
    rooms_used_at_tg: dict[tuple[str | None, int], int] = defaultdict(int)

    _absorb_pinned_load(
        input_payload.pinned_entries,
        slots,
        teacher_week_count,
        teacher_day_count,
        teacher_busy,
        class_busy,
        subject_class_day_count,
        rooms_used_at_tg,
    )

    # MRV: lessons with fewest legal options first.
    order = sorted(
        range(len(lessons)),
        key=lambda i: (len(legal_by_lesson.get(i, [])), i),
    )

    chosen: set[int] = set()
    chosen_by_pair: dict[int, tuple[int, int]] = {}  # double_pair_index -> (slot, teacher)

    for lesson_idx in order:
        lesson = lessons[lesson_idx]
        candidates = legal_by_lesson.get(lesson_idx, [])
        if not candidates:
            continue

        teacher_cap_week = input_payload.teachers[0].max_periods_per_week  # placeholder

        # Followers must align with anchor's (slot, teacher) — already constrained
        # by the model; in greedy we just trust the solver to handle followers.
        # We only hint the anchor; CP-SAT will follow.

        for la_idx in candidates:
            la = legal[la_idx]
            slot = slot_by_id[la.slot_id]
            tg = slot.time_group_id
            teacher_idx = la.teacher_idx
            teacher = input_payload.teachers[teacher_idx]

            if (lesson.class_id, tg) in class_busy:
                continue
            if (teacher_idx, tg) in teacher_busy:
                continue
            if (
                teacher.max_periods_per_week is not None
                and teacher_week_count[teacher_idx] >= teacher.max_periods_per_week
            ):
                continue
            if (
                teacher.max_periods_per_day is not None
                and teacher_day_count[(teacher_idx, slot.weekday)]
                >= teacher.max_periods_per_day
            ):
                continue
            day_key = (lesson.class_id, lesson.subject_id, slot.weekday)
            if subject_class_day_count[day_key] >= lesson.max_periods_per_day:
                continue

            room_type = lesson.required_room_type
            if room_type is None:
                pool_full = (
                    not has_nonexclusive_by_type
                    and rooms_used_at_tg[(None, tg)] >= sum(exclusive_by_type.values())
                )
                if pool_full:
                    continue
            else:
                pool_full = (
                    not has_nonexclusive_by_type.get(room_type, False)
                    and rooms_used_at_tg[(room_type, tg)]
                    >= exclusive_by_type.get(room_type, 0)
                )
                if pool_full:
                    continue

            # Double-period: anchor records (slot, teacher); follower must match.
            if (
                lesson.requires_double_period
                and lesson.double_pair_index is not None
            ):
                if lesson.double_pair_index in chosen_by_pair:
                    target = chosen_by_pair[lesson.double_pair_index]
                    if (la.slot_id, la.teacher_idx) != target:
                        continue
                else:
                    chosen_by_pair[lesson.double_pair_index] = (
                        la.slot_id, la.teacher_idx,
                    )

            chosen.add(la_idx)
            class_busy.add((lesson.class_id, tg))
            teacher_busy.add((teacher_idx, tg))
            teacher_week_count[teacher_idx] += 1
            teacher_day_count[(teacher_idx, slot.weekday)] += 1
            subject_class_day_count[day_key] += 1
            rooms_used_at_tg[(room_type, tg)] += 1
            _ = teacher_cap_week  # unused placeholder
            break

    return chosen


def _absorb_pinned_load(
    pinned: list[PinnedEntryV2],
    slots: list[PhysicalSlot],
    teacher_week_count: dict[int, int],
    teacher_day_count: dict[tuple[int, int], int],
    teacher_busy: set[tuple[int, int]],
    class_busy: set[tuple[str, int]],
    subject_class_day_count: dict[tuple[str, str, int], int],
    rooms_used_at_tg: dict[tuple[str | None, int], int],
) -> None:
    slot_by_keys: dict[tuple[str, int, int], PhysicalSlot] = {
        (s.year_group_id, s.weekday, s.period_order): s for s in slots
    }
    for pin in pinned:
        slot: PhysicalSlot | None = None
        if pin.year_group_id is not None:
            slot = slot_by_keys.get((pin.year_group_id, pin.weekday, pin.period_order))
        if slot is None:
            for s in slots:
                if s.weekday == pin.weekday and s.period_order == pin.period_order:
                    slot = s
                    break
        if slot is None:
            continue
        tg = slot.time_group_id
        class_busy.add((pin.class_id, tg))
        if pin.subject_id is not None:
            subject_class_day_count[(pin.class_id, pin.subject_id, slot.weekday)] += 1


__all__ = ["greedy_assign"]
