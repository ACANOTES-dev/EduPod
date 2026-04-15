"""Greedy initial assignment used as a CP-SAT solution hint.

CP-SAT struggles to find a first-feasible solution on the realistic
baseline (260 lessons × 30 slots × ~4 teachers) within a single-worker
30s budget — the symmetry between interchangeable lessons of the same
(class, subject) blows up the search frontier. A simple greedy
pre-assignment, fed to ``model.add_hint``, gives the solver a
warm-start that cuts time-to-feasible from > 30s down to seconds.

The greedy runs in three phases:

1. **Scarcity-scored round-robin per class.** Lessons are grouped by
   class; within each class, ordered by a scarcity score (double-period
   first, then fewer-eligible-teachers, then fewer-legal-tuples). The
   placement loop then round-robins across classes — one attempt from
   every class before starting round 2 — so no one class monopolises
   early slots. Mirrors ``solveGreedyWithRepair`` in the retired legacy
   TS solver, which had a measurable Tier-2 placement edge over a pure
   MRV-global greedy (331/340 vs 329/340 on the stress-a-shape parity
   fixture — Stage 5 carryover §1).

2. **1-swap repair.** For each still-unplaced lesson, we look for a
   candidate tuple whose only blocker is a *single* already-placed
   lesson; if that blocker itself has another legal slot in its
   candidate list, execute the swap (remove blocker, re-home blocker,
   place the repair target). Deterministic: iterate candidates in
   input order; commit the first swap found.

3. **Multi-round retry.** Up to 3 additional passes over the remaining
   unplaced lessons — cheap insurance in case a Phase-2 swap opened
   new capacity that a freshly-unplaced lesson can now consume.

Conflicts are skipped, not back-tracked — partial hints are fine; CP-SAT
treats hints as soft suggestions.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from solver_py.schema import PinnedEntryV2, SolverInputV2
from solver_py.solver.lessons import Lesson
from solver_py.solver.pruning import LegalAssignment
from solver_py.solver.slots import PhysicalSlot


@dataclass
class _State:
    """Mutable bookkeeping passed through the greedy phases."""

    class_busy: set[tuple[str, int]]
    teacher_busy: set[tuple[int, int]]
    teacher_week_count: dict[int, int]
    teacher_day_count: dict[tuple[int, int], int]
    subject_class_day_count: dict[tuple[str, str, int], int]
    rooms_used_at_tg: dict[tuple[str | None, int], int]
    chosen_la_by_lesson: dict[int, int]
    chosen_by_pair: dict[int, tuple[int, int]]


def greedy_assign(
    input_payload: SolverInputV2,
    lessons: list[Lesson],
    slots: list[PhysicalSlot],
    legal: list[LegalAssignment],
    legal_by_lesson: dict[int, list[int]],
) -> set[int]:
    """Return the set of ``la_idx`` values that the greedy chooses to place."""
    slot_by_id: dict[int, PhysicalSlot] = {s.slot_id: s for s in slots}
    lesson_by_la: dict[int, int] = {}
    for la_idx, la in enumerate(legal):
        lesson_by_la[la_idx] = la.lesson_idx

    # Room-type / time-group capacity mirrors model.py section D.
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

    state = _State(
        class_busy=set(),
        teacher_busy=set(),
        teacher_week_count=defaultdict(int),
        teacher_day_count=defaultdict(int),
        subject_class_day_count=defaultdict(int),
        rooms_used_at_tg=defaultdict(int),
        chosen_la_by_lesson={},
        chosen_by_pair={},
    )

    _absorb_pinned_load(
        input_payload.pinned_entries,
        slots,
        state,
    )

    # ─── Phase 1: scarcity-scored round-robin per class ─────────────────
    scarcity = _compute_scarcity(input_payload, lessons, legal, legal_by_lesson)
    by_class: dict[str, list[int]] = defaultdict(list)
    for lesson_idx, lesson in enumerate(lessons):
        by_class[lesson.class_id].append(lesson_idx)
    for idxs in by_class.values():
        idxs.sort(key=lambda i: (-scarcity[i], i))

    class_ids = sorted(by_class.keys())
    max_rounds = max((len(ls) for ls in by_class.values()), default=0)

    for round_i in range(max_rounds):
        for cid in class_ids:
            bucket = by_class[cid]
            if round_i >= len(bucket):
                continue
            lesson_idx = bucket[round_i]
            if lesson_idx in state.chosen_la_by_lesson:
                continue
            _try_place(
                lesson_idx,
                lessons,
                legal,
                legal_by_lesson,
                slot_by_id,
                input_payload,
                state,
                exclusive_by_type,
                has_nonexclusive_by_type,
            )

    # ─── Phase 2: 1-swap repair ─────────────────────────────────────────
    unplaced = [i for i in range(len(lessons)) if i not in state.chosen_la_by_lesson]
    for lesson_idx in unplaced:
        if lesson_idx in state.chosen_la_by_lesson:
            continue
        _try_one_swap(
            lesson_idx,
            lessons,
            legal,
            legal_by_lesson,
            lesson_by_la,
            slot_by_id,
            input_payload,
            state,
            exclusive_by_type,
            has_nonexclusive_by_type,
        )

    # ─── Phase 3: multi-round retry (cheap insurance) ───────────────────
    for _ in range(3):
        still_unplaced = [
            i for i in range(len(lessons)) if i not in state.chosen_la_by_lesson
        ]
        if not still_unplaced:
            break
        progress = False
        for lesson_idx in still_unplaced:
            if _try_place(
                lesson_idx,
                lessons,
                legal,
                legal_by_lesson,
                slot_by_id,
                input_payload,
                state,
                exclusive_by_type,
                has_nonexclusive_by_type,
            ):
                progress = True
        if not progress:
            break

    return set(state.chosen_la_by_lesson.values())


def _compute_scarcity(
    input_payload: SolverInputV2,
    lessons: list[Lesson],
    legal: list[LegalAssignment],
    legal_by_lesson: dict[int, list[int]],
) -> dict[int, int]:
    """Score per lesson_idx: higher = harder to place, should try first."""
    scores: dict[int, int] = {}
    for i, lesson in enumerate(lessons):
        score = 200 if lesson.requires_double_period else 100
        if lesson.subject_id:
            eligible_teachers = {
                legal[la_idx].teacher_idx for la_idx in legal_by_lesson.get(i, [])
            }
            score += max(0, 50 - len(eligible_teachers) * 10)
        if lesson.required_room_type:
            room_count = sum(
                1 for r in input_payload.rooms if r.room_type == lesson.required_room_type
            )
            score += max(0, 40 - room_count * 10)
        domain = legal_by_lesson.get(i, [])
        score += max(0, 30 - len(domain) // 5)
        scores[i] = score
    return scores


def _try_place(
    lesson_idx: int,
    lessons: list[Lesson],
    legal: list[LegalAssignment],
    legal_by_lesson: dict[int, list[int]],
    slot_by_id: dict[int, PhysicalSlot],
    input_payload: SolverInputV2,
    state: _State,
    exclusive_by_type: dict[str, int],
    has_nonexclusive_by_type: dict[str, bool],
) -> bool:
    """Try to place ``lesson_idx`` using the first legal candidate; commit if found."""
    if lesson_idx in state.chosen_la_by_lesson:
        return False
    lesson = lessons[lesson_idx]
    candidates = legal_by_lesson.get(lesson_idx, [])
    for la_idx in candidates:
        if _is_legal(
            la_idx,
            lesson,
            legal,
            slot_by_id,
            input_payload,
            state,
            exclusive_by_type,
            has_nonexclusive_by_type,
        ):
            _commit(la_idx, lesson_idx, lesson, legal, slot_by_id, state)
            return True
    return False


def _is_legal(
    la_idx: int,
    lesson: Lesson,
    legal: list[LegalAssignment],
    slot_by_id: dict[int, PhysicalSlot],
    input_payload: SolverInputV2,
    state: _State,
    exclusive_by_type: dict[str, int],
    has_nonexclusive_by_type: dict[str, bool],
) -> bool:
    """Check whether placing ``la_idx`` is legal given current state."""
    la = legal[la_idx]
    slot = slot_by_id[la.slot_id]
    tg = slot.time_group_id
    teacher_idx = la.teacher_idx
    teacher = input_payload.teachers[teacher_idx]

    if (lesson.class_id, tg) in state.class_busy:
        return False
    if (teacher_idx, tg) in state.teacher_busy:
        return False
    if (
        teacher.max_periods_per_week is not None
        and state.teacher_week_count[teacher_idx] >= teacher.max_periods_per_week
    ):
        return False
    if (
        teacher.max_periods_per_day is not None
        and state.teacher_day_count[(teacher_idx, slot.weekday)]
        >= teacher.max_periods_per_day
    ):
        return False
    day_key = (lesson.class_id, lesson.subject_id, slot.weekday)
    if state.subject_class_day_count[day_key] >= lesson.max_periods_per_day:
        return False

    room_type = lesson.required_room_type
    if room_type is None:
        pool_full = (
            not has_nonexclusive_by_type
            and state.rooms_used_at_tg[(None, tg)] >= sum(exclusive_by_type.values())
        )
        if pool_full:
            return False
    else:
        pool_full = (
            not has_nonexclusive_by_type.get(room_type, False)
            and state.rooms_used_at_tg[(room_type, tg)]
            >= exclusive_by_type.get(room_type, 0)
        )
        if pool_full:
            return False

    # Double-period: anchor records (slot, teacher); follower must match.
    if (
        lesson.requires_double_period
        and lesson.double_pair_index is not None
        and lesson.double_pair_index in state.chosen_by_pair
    ):
        target = state.chosen_by_pair[lesson.double_pair_index]
        if (la.slot_id, la.teacher_idx) != target:
            return False

    return True


def _commit(
    la_idx: int,
    lesson_idx: int,
    lesson: Lesson,
    legal: list[LegalAssignment],
    slot_by_id: dict[int, PhysicalSlot],
    state: _State,
) -> None:
    """Commit a legal placement into state."""
    la = legal[la_idx]
    slot = slot_by_id[la.slot_id]
    tg = slot.time_group_id
    teacher_idx = la.teacher_idx

    if (
        lesson.requires_double_period
        and lesson.double_pair_index is not None
        and lesson.double_pair_index not in state.chosen_by_pair
    ):
        state.chosen_by_pair[lesson.double_pair_index] = (la.slot_id, la.teacher_idx)

    state.chosen_la_by_lesson[lesson_idx] = la_idx
    state.class_busy.add((lesson.class_id, tg))
    state.teacher_busy.add((teacher_idx, tg))
    state.teacher_week_count[teacher_idx] += 1
    state.teacher_day_count[(teacher_idx, slot.weekday)] += 1
    state.subject_class_day_count[(lesson.class_id, lesson.subject_id, slot.weekday)] += 1
    state.rooms_used_at_tg[(lesson.required_room_type, tg)] += 1


def _rollback(
    la_idx: int,
    lesson_idx: int,
    lesson: Lesson,
    legal: list[LegalAssignment],
    slot_by_id: dict[int, PhysicalSlot],
    state: _State,
) -> None:
    """Undo a committed placement (mirror of :func:`_commit`)."""
    la = legal[la_idx]
    slot = slot_by_id[la.slot_id]
    tg = slot.time_group_id
    teacher_idx = la.teacher_idx

    del state.chosen_la_by_lesson[lesson_idx]
    state.class_busy.discard((lesson.class_id, tg))
    state.teacher_busy.discard((teacher_idx, tg))
    state.teacher_week_count[teacher_idx] -= 1
    state.teacher_day_count[(teacher_idx, slot.weekday)] -= 1
    day_key = (lesson.class_id, lesson.subject_id, slot.weekday)
    state.subject_class_day_count[day_key] -= 1
    state.rooms_used_at_tg[(lesson.required_room_type, tg)] -= 1

    # Double-period anchor: if this lesson was the anchor for its pair,
    # drop the pair entry so the pair can be re-anchored elsewhere.
    if lesson.requires_double_period and lesson.double_pair_index is not None:
        anchor = state.chosen_by_pair.get(lesson.double_pair_index)
        if anchor == (la.slot_id, la.teacher_idx):
            del state.chosen_by_pair[lesson.double_pair_index]


def _try_one_swap(
    lesson_idx: int,
    lessons: list[Lesson],
    legal: list[LegalAssignment],
    legal_by_lesson: dict[int, list[int]],
    lesson_by_la: dict[int, int],
    slot_by_id: dict[int, PhysicalSlot],
    input_payload: SolverInputV2,
    state: _State,
    exclusive_by_type: dict[str, int],
    has_nonexclusive_by_type: dict[str, bool],
) -> bool:
    """Try to place ``lesson_idx`` by displacing at most one already-placed lesson.

    Deterministic: iterate the target lesson's candidates in input order; for
    each blocked candidate, iterate blocker's alternative candidates in input
    order; commit the first swap that's fully legal.

    Double-period lessons are never swapped: moving them also requires moving
    their follower, and the complexity isn't worth the single-digit placement
    gain on realistic inputs.
    """
    lesson = lessons[lesson_idx]
    if lesson.requires_double_period:
        return False

    # Build a reverse lookup: placed_la_idx → lesson_idx of the occupier.
    placed_la = {la_idx: li for li, la_idx in state.chosen_la_by_lesson.items()}

    for la_u in legal_by_lesson.get(lesson_idx, []):
        # Enumerate reasons that la_u is currently blocked.
        la = legal[la_u]
        slot = slot_by_id[la.slot_id]
        tg = slot.time_group_id
        teacher_idx = la.teacher_idx

        # Find the blocker lesson, if any — must be a *single* placed lesson
        # whose removal would make la_u legal. Capacity-type blocks (day cap,
        # week cap, room-type pool) are multi-source; skip those.
        blocker_lesson_idx: int | None = None

        if (lesson.class_id, tg) in state.class_busy:
            # Which placed lesson is holding (class, tg)?
            for other_la_idx, other_li in placed_la.items():
                other = lessons[other_li]
                other_la = legal[other_la_idx]
                other_slot = slot_by_id[other_la.slot_id]
                if other.class_id == lesson.class_id and other_slot.time_group_id == tg:
                    blocker_lesson_idx = other_li
                    break
        elif (teacher_idx, tg) in state.teacher_busy:
            for other_la_idx, other_li in placed_la.items():
                other_la = legal[other_la_idx]
                other_slot = slot_by_id[other_la.slot_id]
                if other_la.teacher_idx == teacher_idx and other_slot.time_group_id == tg:
                    blocker_lesson_idx = other_li
                    break
        else:
            continue

        if blocker_lesson_idx is None:
            continue
        blocker = lessons[blocker_lesson_idx]
        if blocker.requires_double_period:
            # Don't split a double-period pair.
            continue

        blocker_la_idx = state.chosen_la_by_lesson[blocker_lesson_idx]
        _rollback(blocker_la_idx, blocker_lesson_idx, blocker, legal, slot_by_id, state)

        # Try to rehome the blocker.
        rehomed = False
        for alt_la in legal_by_lesson.get(blocker_lesson_idx, []):
            if alt_la == blocker_la_idx:
                continue
            if _is_legal(
                alt_la,
                blocker,
                legal,
                slot_by_id,
                input_payload,
                state,
                exclusive_by_type,
                has_nonexclusive_by_type,
            ):
                _commit(alt_la, blocker_lesson_idx, blocker, legal, slot_by_id, state)
                rehomed = True
                break

        if not rehomed:
            # Undo the rollback.
            _commit(blocker_la_idx, blocker_lesson_idx, blocker, legal, slot_by_id, state)
            continue

        # Now try to place la_u.
        if _is_legal(
            la_u,
            lesson,
            legal,
            slot_by_id,
            input_payload,
            state,
            exclusive_by_type,
            has_nonexclusive_by_type,
        ):
            _commit(la_u, lesson_idx, lesson, legal, slot_by_id, state)
            return True

        # Swap didn't pan out — roll back the rehome and restore the original.
        # rehomed_la is the alt we committed.
        new_la = state.chosen_la_by_lesson[blocker_lesson_idx]
        _rollback(new_la, blocker_lesson_idx, blocker, legal, slot_by_id, state)
        _commit(blocker_la_idx, blocker_lesson_idx, blocker, legal, slot_by_id, state)

    return False


def _absorb_pinned_load(
    pinned: list[PinnedEntryV2],
    slots: list[PhysicalSlot],
    state: _State,
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
        state.class_busy.add((pin.class_id, tg))
        if pin.subject_id is not None:
            state.subject_class_day_count[(pin.class_id, pin.subject_id, slot.weekday)] += 1


__all__ = ["greedy_assign"]
