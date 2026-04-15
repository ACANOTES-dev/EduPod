"""Per-lesson pruning — compute legal ``(slot, teacher, room)`` tuples.

Generates, for every ``Lesson``, the set of ``LegalAssignment`` triples
the solver should be allowed to choose from. Pruning enforces the legacy
v2 invariants up-front (so they never appear as CP-SAT constraints):

- Teacher competency, with pin/pool resolution
  (``class_id != null`` competency entry → pinned to that class;
  ``class_id == null`` → pool member).
- Teacher availability windows, extended for adjacent classroom breaks.
- Period type must be ``teaching``.
- Room must match ``required_room_type`` when set.
- Closed rooms removed (legacy v2 blocks the room for the whole week —
  granular per-date filtering is a separate stage).
"""

from __future__ import annotations

from dataclasses import dataclass

from solver_py.schema import SolverInputV2, TeacherInputV2
from solver_py.solver.lessons import Lesson
from solver_py.solver.slots import (
    PhysicalSlot,
    adjacent_classroom_break_window,
    teaching_slots_by_year_group,
)


@dataclass(frozen=True)
class LegalAssignment:
    lesson_idx: int
    slot_id: int
    teacher_idx: int
    room_idx: int  # -1 = no room (room-less lesson)


def _competent_teachers(
    teachers: list[TeacherInputV2], class_id: str, year_group_id: str, subject_id: str
) -> list[int]:
    """Indices of teachers competent for ``(class, year_group, subject)``.

    Pin/pool resolution mirrors ``resolveTeacherCandidates`` in the legacy:
    a competency entry with matching ``class_id`` pins the teacher; a
    ``class_id == null`` entry adds the teacher to the pool. If any pin
    exists, only pins are returned; otherwise the pool is returned.
    """
    pinned: list[int] = []
    pooled: list[int] = []
    for idx, teacher in enumerate(teachers):
        for comp in teacher.competencies:
            if comp.subject_id != subject_id or comp.year_group_id != year_group_id:
                continue
            if comp.class_id == class_id:
                pinned.append(idx)
                break
            if comp.class_id is None:
                pooled.append(idx)
                break
    return pinned if pinned else pooled


def _teacher_available(
    teacher: TeacherInputV2, weekday: int, window_start: str, window_end: str
) -> bool:
    """A teacher is available if any availability entry covers the window.

    An empty availability list is treated as "always available", matching
    the legacy semantics (``checkTeacherAvailabilityV2`` returns true when
    no day rules exist).
    """
    if not teacher.availability:
        return True
    for av in teacher.availability:
        if av.weekday != weekday:
            continue
        if av.from_ <= window_start and av.to >= window_end:
            return True
    return False


def _eligible_rooms(
    input_payload: SolverInputV2, required_type: str | None
) -> list[int]:
    """Indices of rooms matching ``required_type`` and not in any closure window.

    Like the legacy v2: a room appears in any ``room_closures`` row → it's
    excluded for the whole week. Per-date filtering is deferred.
    """
    closed = {rc.room_id for rc in input_payload.room_closures}
    eligible: list[int] = []
    for idx, room in enumerate(input_payload.rooms):
        if room.room_id in closed:
            continue
        if required_type is not None and room.room_type != required_type:
            continue
        eligible.append(idx)
    return eligible


def build_legal_assignments(
    input_payload: SolverInputV2,
    lessons: list[Lesson],
    slots: list[PhysicalSlot],
) -> tuple[list[LegalAssignment], dict[int, list[int]], dict[int, str]]:
    """Compute legal placements per lesson.

    Returns:
      - The flat list of legal assignments.
      - A mapping ``lesson_idx -> [legal_assignment_idx, ...]``.
      - A mapping ``lesson_idx -> diagnostic`` for lessons whose legal
        set is empty (used to populate ``unassigned`` rather than raise).
    """
    teaching_by_yg = teaching_slots_by_year_group(slots)
    legal: list[LegalAssignment] = []
    by_lesson: dict[int, list[int]] = {}
    diagnostics: dict[int, str] = {}

    for lesson_idx, lesson in enumerate(lessons):
        rooms = _eligible_rooms(input_payload, lesson.required_room_type)
        teachers = _competent_teachers(
            input_payload.teachers,
            lesson.class_id,
            lesson.year_group_id,
            lesson.subject_id,
        )
        candidate_slots = teaching_by_yg.get(lesson.year_group_id, [])

        if not teachers:
            diagnostics[lesson_idx] = (
                f"No competent teacher for class={lesson.class_id} subject={lesson.subject_id}"
            )
            by_lesson[lesson_idx] = []
            continue
        if not candidate_slots:
            diagnostics[lesson_idx] = (
                f"No teaching slots in year group {lesson.year_group_id}"
            )
            by_lesson[lesson_idx] = []
            continue
        if lesson.required_room_type is not None and not rooms:
            diagnostics[lesson_idx] = (
                f"No room of required type '{lesson.required_room_type}' for "
                f"class={lesson.class_id} subject={lesson.subject_id}"
            )
            by_lesson[lesson_idx] = []
            continue

        local_indices: list[int] = []
        room_choices: list[int] = rooms if rooms else [-1]

        for slot in candidate_slots:
            window_start, window_end = adjacent_classroom_break_window(
                slot, teaching_by_yg.get(lesson.year_group_id, [])
            )
            for teacher_idx in teachers:
                teacher = input_payload.teachers[teacher_idx]
                if not _teacher_available(
                    teacher, slot.weekday, window_start, window_end
                ):
                    continue
                for room_idx in room_choices:
                    legal_idx = len(legal)
                    legal.append(
                        LegalAssignment(
                            lesson_idx=lesson_idx,
                            slot_id=slot.slot_id,
                            teacher_idx=teacher_idx,
                            room_idx=room_idx,
                        )
                    )
                    local_indices.append(legal_idx)

        if not local_indices:
            diagnostics[lesson_idx] = (
                f"No legal (slot, teacher, room) tuple for class={lesson.class_id} "
                f"subject={lesson.subject_id} — every candidate teacher unavailable "
                f"in every teaching slot"
            )
        by_lesson[lesson_idx] = local_indices

    return legal, by_lesson, diagnostics
