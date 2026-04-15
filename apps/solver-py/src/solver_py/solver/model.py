"""Build the CP-SAT model from a pruned set of legal assignments.

Per-lesson boolean cells over ``(lesson, slot, teacher)`` only — room
identity is assigned post-solve by ``solve._assign_rooms`` so the
variable count stays manageable on realistic inputs. Each placement
implicitly consumes one room of the lesson's required type at that
time-group; the per-(room_type, time_group) capacity constraint
guarantees feasibility before the greedy assigner runs.

Sections (in declaration order):

  A. Per-lesson placement gated by ``placed[l]``. ``sum(x[la]) == placed[l]``.
     The placement booleans + supervision booleans feed the objective —
     ``solver.objective.assemble_objective`` weights them so a placed
     lesson with zero satisfied preferences strictly out-scores an
     unplaced lesson with every preference satisfied.
  B. Subject ``max_periods_per_day`` per ``(class, subject, weekday)``.
  C. Class no-overlap per ``time_group_id``.
  D. Per-(room_type, time_group) capacity — number of placements needing
     a room of type T at time-group TG must not exceed the count of
     eligible exclusive rooms of that type. Replaces the per-room
     no-overlap of earlier drafts; cuts the variable count on
     interchangeable-room baselines by ~10×.
  E. Teacher caps — ``max_periods_per_week`` and ``max_periods_per_day``.
  F. Double-period pairing — anchor + follower share teacher and
     consecutive periods on the same weekday (rooms paired post-solve).
  G. Yard-break supervision — required supervisor count per slot,
     supervision-duty cap per teacher (week).
  H. Combined teacher no-overlap per ``time_group_id`` — teaching legals
     + supervision vars + pinned load all share the single ≤ 1 budget.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from ortools.sat.python import cp_model

from solver_py.schema import PinnedEntryV2, SolverInputV2, TeacherInputV2
from solver_py.solver.lessons import Lesson
from solver_py.solver.pruning import LegalAssignment
from solver_py.solver.slots import (
    PhysicalSlot,
    supervision_slots_by_break_group,
    teaching_slots_by_year_group,
)


@dataclass
class BuiltModel:
    """Outputs of ``build_model`` — handed to the orchestrator."""

    model: cp_model.CpModel
    placement_vars: list[cp_model.IntVar]
    placed_indicator: dict[int, cp_model.IntVar]
    supervision_vars: dict[tuple[int, int], cp_model.IntVar]
    """``supervision_vars[(slot_id, teacher_idx)]`` for yard-break supervision."""


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _teacher_available_for_supervision(teacher: TeacherInputV2, slot: PhysicalSlot) -> bool:
    """Wall-clock availability for yard-break supervision (no break extension)."""
    if not teacher.availability:
        return True
    for av in teacher.availability:
        if av.weekday != slot.weekday:
            continue
        if av.from_ <= slot.start_time and av.to >= slot.end_time:
            return True
    return False


@dataclass
class _PinnedLoad:
    """Pre-aggregated pinned-entry side-effects."""

    teacher_tg: dict[tuple[int, int], int]
    class_tg: dict[tuple[str, int], int]
    room_tg: dict[tuple[int, int], int]
    teacher_week: dict[int, int]
    teacher_day: dict[tuple[int, int], int]
    subject_class_day: dict[tuple[str, str, int], int]
    sup_per_teacher_week: dict[int, int]
    supervisors_at_slot: dict[tuple[str, int], int]


def _build_pinned_load(
    pinned: list[PinnedEntryV2],
    slots: list[PhysicalSlot],
    teacher_id_to_idx: dict[str, int],
    room_id_to_idx: dict[str, int],
) -> _PinnedLoad:
    teacher_tg: dict[tuple[int, int], int] = defaultdict(int)
    class_tg: dict[tuple[str, int], int] = defaultdict(int)
    room_tg: dict[tuple[int, int], int] = defaultdict(int)
    teacher_week: dict[int, int] = defaultdict(int)
    teacher_day: dict[tuple[int, int], int] = defaultdict(int)
    subject_class_day: dict[tuple[str, str, int], int] = defaultdict(int)
    sup_per_teacher_week: dict[int, int] = defaultdict(int)
    supervisors_at_slot: dict[tuple[str, int], int] = defaultdict(int)

    slot_by_keys: dict[tuple[str, int, int], PhysicalSlot] = {
        (s.year_group_id, s.weekday, s.period_order): s for s in slots
    }

    for pin in pinned:
        candidate: PhysicalSlot | None = None
        if pin.year_group_id is not None:
            candidate = slot_by_keys.get((pin.year_group_id, pin.weekday, pin.period_order))
        if candidate is None:
            for s in slots:
                if s.weekday == pin.weekday and s.period_order == pin.period_order:
                    candidate = s
                    break
        if candidate is None:
            continue

        is_supervision = candidate.supervision_mode == "yard"

        teacher_idx = (
            teacher_id_to_idx.get(pin.teacher_staff_id)
            if pin.teacher_staff_id is not None
            else None
        )
        if teacher_idx is not None:
            teacher_tg[(teacher_idx, candidate.time_group_id)] += 1
            if not is_supervision:
                teacher_week[teacher_idx] += 1
                teacher_day[(teacher_idx, candidate.weekday)] += 1
            else:
                sup_per_teacher_week[teacher_idx] += 1

        if not is_supervision:
            class_tg[(pin.class_id, candidate.time_group_id)] += 1
            if pin.subject_id is not None:
                subject_class_day[(pin.class_id, pin.subject_id, candidate.weekday)] += 1

        if pin.room_id is not None:
            room_idx = room_id_to_idx.get(pin.room_id)
            if room_idx is not None:
                room_tg[(room_idx, candidate.time_group_id)] += 1

        if is_supervision and candidate.break_group_id is not None:
            supervisors_at_slot[(candidate.break_group_id, candidate.slot_id)] += 1

    return _PinnedLoad(
        teacher_tg=teacher_tg,
        class_tg=class_tg,
        room_tg=room_tg,
        teacher_week=teacher_week,
        teacher_day=teacher_day,
        subject_class_day=subject_class_day,
        sup_per_teacher_week=sup_per_teacher_week,
        supervisors_at_slot=supervisors_at_slot,
    )


def _build_next_teaching_lookup(
    slots: list[PhysicalSlot],
) -> dict[int, int | None]:
    """For each teaching slot, the slot_id of the next consecutive teaching
    slot in the same year-group + weekday (consecutive ``period_order``), or
    None if no such slot exists."""
    by_yg = teaching_slots_by_year_group(slots)
    next_teaching: dict[int, int | None] = {}
    for yg_slots in by_yg.values():
        by_day: dict[int, list[PhysicalSlot]] = defaultdict(list)
        for s in yg_slots:
            by_day[s.weekday].append(s)
        for slots_today in by_day.values():
            ordered = sorted(slots_today, key=lambda s: s.period_order)
            for i, s in enumerate(ordered):
                next_slot = (
                    ordered[i + 1]
                    if i + 1 < len(ordered)
                    and ordered[i + 1].period_order == s.period_order + 1
                    else None
                )
                next_teaching[s.slot_id] = next_slot.slot_id if next_slot else None
    return next_teaching


# ─── Main builder ────────────────────────────────────────────────────────────


def build_model(
    input_payload: SolverInputV2,
    lessons: list[Lesson],
    slots: list[PhysicalSlot],
    legal: list[LegalAssignment],
    legal_by_lesson: dict[int, list[int]],
) -> BuiltModel:
    """Build the CP-SAT model for the given pruned lesson set."""
    model = cp_model.CpModel()
    slot_by_id: dict[int, PhysicalSlot] = {s.slot_id: s for s in slots}
    teacher_id_to_idx = {t.staff_profile_id: i for i, t in enumerate(input_payload.teachers)}
    room_id_to_idx = {r.room_id: i for i, r in enumerate(input_payload.rooms)}

    pinned_load = _build_pinned_load(
        input_payload.pinned_entries, slots, teacher_id_to_idx, room_id_to_idx
    )

    # ─── A. Per-lesson placement variables ─────────────────────────────────────
    placement_vars: list[cp_model.IntVar] = [
        model.new_bool_var(f"x[{i}]") for i in range(len(legal))
    ]
    placed_indicator: dict[int, cp_model.IntVar] = {}
    for lesson_idx, la_indices in legal_by_lesson.items():
        if not la_indices:
            continue
        placed = model.new_bool_var(f"placed[{lesson_idx}]")
        placed_indicator[lesson_idx] = placed
        model.add(sum(placement_vars[la_idx] for la_idx in la_indices) == placed)

    # ─── B. Subject max periods per day per class ─────────────────────────────
    by_subject_class_day: dict[tuple[str, str, int], list[int]] = defaultdict(list)
    cap_lookup: dict[tuple[str, str], int] = {}
    for la_idx, la in enumerate(legal):
        lesson = lessons[la.lesson_idx]
        slot = slot_by_id[la.slot_id]
        by_subject_class_day[(lesson.class_id, lesson.subject_id, slot.weekday)].append(la_idx)
        cap_lookup[(lesson.class_id, lesson.subject_id)] = lesson.max_periods_per_day
    for (class_id, subject_id, weekday), indices in by_subject_class_day.items():
        cap = cap_lookup[(class_id, subject_id)] - pinned_load.subject_class_day.get(
            (class_id, subject_id, weekday), 0
        )
        if cap < 0:
            for idx in indices:
                model.add(placement_vars[idx] == 0)
        else:
            model.add(sum(placement_vars[idx] for idx in indices) <= cap)

    # ─── C. Class no-overlap per time_group ───────────────────────────────────
    by_class_tg: dict[tuple[str, int], list[int]] = defaultdict(list)
    for la_idx, la in enumerate(legal):
        lesson = lessons[la.lesson_idx]
        slot = slot_by_id[la.slot_id]
        by_class_tg[(lesson.class_id, slot.time_group_id)].append(la_idx)
    for (class_id, tg), indices in by_class_tg.items():
        capacity = 1 - pinned_load.class_tg.get((class_id, tg), 0)
        if capacity <= 0:
            for idx in indices:
                model.add(placement_vars[idx] == 0)
        else:
            model.add(sum(placement_vars[idx] for idx in indices) <= capacity)

    # ─── D. Per-(room_type, time_group) capacity ──────────────────────────────
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
    total_exclusive = sum(exclusive_by_type.values())
    has_any_nonexclusive = any(has_nonexclusive_by_type.values())

    by_type_tg: dict[tuple[str | None, int], list[int]] = defaultdict(list)
    for la_idx, la in enumerate(legal):
        lesson = lessons[la.lesson_idx]
        slot = slot_by_id[la.slot_id]
        by_type_tg[(lesson.required_room_type, slot.time_group_id)].append(la_idx)

    pinned_room_load_at_tg: dict[tuple[str, int], int] = defaultdict(int)
    for (room_idx, tg), count in pinned_load.room_tg.items():
        if room_idx >= len(input_payload.rooms):
            continue
        room = input_payload.rooms[room_idx]
        if not room.is_exclusive:
            continue
        pinned_room_load_at_tg[(room.room_type, tg)] += count

    unlimited = max(len(legal), 1)
    for (room_type, tg), indices in by_type_tg.items():
        if room_type is None:
            # Lesson with no required_room_type — uses any exclusive room
            # not already pinned at this time-group, OR any non-exclusive room.
            if has_any_nonexclusive:
                capacity = unlimited
            else:
                pinned_here = sum(
                    pinned_room_load_at_tg.get((rt, tg), 0) for rt in exclusive_by_type
                )
                capacity = total_exclusive - pinned_here
        else:
            if has_nonexclusive_by_type.get(room_type, False):
                capacity = unlimited
            else:
                capacity = exclusive_by_type.get(room_type, 0) - pinned_room_load_at_tg.get(
                    (room_type, tg), 0
                )
        if capacity <= 0:
            for idx in indices:
                model.add(placement_vars[idx] == 0)
        else:
            model.add(sum(placement_vars[idx] for idx in indices) <= capacity)

    # ─── E. Teacher caps (max periods per week / per day) ─────────────────────
    by_teacher: dict[int, list[int]] = defaultdict(list)
    by_teacher_day: dict[tuple[int, int], list[int]] = defaultdict(list)
    for la_idx, la in enumerate(legal):
        slot = slot_by_id[la.slot_id]
        by_teacher[la.teacher_idx].append(la_idx)
        by_teacher_day[(la.teacher_idx, slot.weekday)].append(la_idx)
    for teacher_idx, teacher in enumerate(input_payload.teachers):
        if teacher.max_periods_per_week is not None:
            cap = teacher.max_periods_per_week - pinned_load.teacher_week.get(teacher_idx, 0)
            indices = by_teacher.get(teacher_idx, [])
            if cap < 0:
                for idx in indices:
                    model.add(placement_vars[idx] == 0)
            elif indices:
                model.add(sum(placement_vars[idx] for idx in indices) <= cap)
        if teacher.max_periods_per_day is not None:
            for weekday in range(7):
                cap = teacher.max_periods_per_day - pinned_load.teacher_day.get(
                    (teacher_idx, weekday), 0
                )
                indices = by_teacher_day.get((teacher_idx, weekday), [])
                if cap < 0:
                    for idx in indices:
                        model.add(placement_vars[idx] == 0)
                elif indices:
                    model.add(sum(placement_vars[idx] for idx in indices) <= cap)

    # ─── F. Double-period pairing ─────────────────────────────────────────────
    next_teaching = _build_next_teaching_lookup(slots)
    pairs: dict[int, list[int]] = defaultdict(list)
    for lesson_idx, lesson in enumerate(lessons):
        if lesson.double_pair_index is not None:
            pairs[lesson.double_pair_index].append(lesson_idx)
    for lesson_indices in pairs.values():
        if len(lesson_indices) != 2:
            continue
        anchor_idx, follower_idx = lesson_indices  # emitted in this order in lessons.py
        anchor_legal = legal_by_lesson.get(anchor_idx, [])
        follower_legal = legal_by_lesson.get(follower_idx, [])
        follower_lookup: dict[tuple[int, int], int] = {}
        for la_idx in follower_legal:
            la = legal[la_idx]
            follower_lookup[(la.teacher_idx, la.slot_id)] = la_idx

        for la_idx in anchor_legal:
            la = legal[la_idx]
            next_slot_id = next_teaching.get(la.slot_id)
            if next_slot_id is None:
                model.add(placement_vars[la_idx] == 0)
                continue
            match = follower_lookup.get((la.teacher_idx, next_slot_id))
            if match is None:
                model.add(placement_vars[la_idx] == 0)
                continue
            model.add(placement_vars[la_idx] == placement_vars[match])

        anchor_lookup: dict[tuple[int, int], int] = {}
        for la_idx in anchor_legal:
            la = legal[la_idx]
            next_slot_id = next_teaching.get(la.slot_id)
            if next_slot_id is not None:
                anchor_lookup[(la.teacher_idx, next_slot_id)] = la_idx
        for la_idx in follower_legal:
            la = legal[la_idx]
            if (la.teacher_idx, la.slot_id) not in anchor_lookup:
                model.add(placement_vars[la_idx] == 0)

    # ─── G. Yard-break supervision ────────────────────────────────────────────
    supervision_vars: dict[tuple[int, int], cp_model.IntVar] = {}
    sup_slots_by_bg = supervision_slots_by_break_group(slots)
    for break_group in input_payload.break_groups:
        bg_id = break_group.break_group_id
        sup_slots = sup_slots_by_bg.get(bg_id, [])
        for slot in sup_slots:
            slot_supervision_vars: list[cp_model.IntVar] = []
            for teacher_idx, teacher in enumerate(input_payload.teachers):
                if not _teacher_available_for_supervision(teacher, slot):
                    continue
                var = model.new_bool_var(f"sup[{slot.slot_id},{teacher_idx}]")
                supervision_vars[(slot.slot_id, teacher_idx)] = var
                slot_supervision_vars.append(var)
            already = pinned_load.supervisors_at_slot.get((bg_id, slot.slot_id), 0)
            need = max(break_group.required_supervisor_count - already, 0)
            if not slot_supervision_vars and need > 0:
                # Required supervisors but nobody available — leave the
                # constraint satisfiable (need=0) and let the orchestrator
                # report an unfilled supervision slot. CP-SAT can't help.
                continue
            model.add(sum(slot_supervision_vars) == need)

    for teacher_idx, teacher in enumerate(input_payload.teachers):
        if teacher.max_supervision_duties_per_week is None:
            continue
        teacher_sup_vars = [
            v for (sid, t_idx), v in supervision_vars.items() if t_idx == teacher_idx
        ]
        cap = teacher.max_supervision_duties_per_week - pinned_load.sup_per_teacher_week.get(
            teacher_idx, 0
        )
        if cap < 0:
            for v in teacher_sup_vars:
                model.add(v == 0)
        elif teacher_sup_vars:
            model.add(sum(teacher_sup_vars) <= cap)

    # ─── H. Combined teacher no-overlap per time_group ─────────────────────────
    teaching_by_teacher_tg: dict[tuple[int, int], list[int]] = defaultdict(list)
    for la_idx, la in enumerate(legal):
        slot = slot_by_id[la.slot_id]
        teaching_by_teacher_tg[(la.teacher_idx, slot.time_group_id)].append(la_idx)
    sup_by_teacher_tg: dict[tuple[int, int], list[cp_model.IntVar]] = defaultdict(list)
    for (sup_slot_id, teacher_idx), sup_var in supervision_vars.items():
        sup_slot = slot_by_id[sup_slot_id]
        sup_by_teacher_tg[(teacher_idx, sup_slot.time_group_id)].append(sup_var)

    seen_teacher_tg: set[tuple[int, int]] = set()
    for key in teaching_by_teacher_tg:
        seen_teacher_tg.add(key)
    for key in sup_by_teacher_tg:
        seen_teacher_tg.add(key)
    for teacher_idx, tg in seen_teacher_tg:
        capacity = 1 - pinned_load.teacher_tg.get((teacher_idx, tg), 0)
        teaching_indices = teaching_by_teacher_tg.get((teacher_idx, tg), [])
        sup_vars_here = sup_by_teacher_tg.get((teacher_idx, tg), [])
        if capacity <= 0:
            for idx in teaching_indices:
                model.add(placement_vars[idx] == 0)
            for v in sup_vars_here:
                model.add(v == 0)
        else:
            terms: list[cp_model.IntVar] = [
                placement_vars[i] for i in teaching_indices
            ] + sup_vars_here
            if terms:
                model.add(sum(terms) <= capacity)

    # Objective is assembled by ``solver.objective.assemble_objective`` so the
    # Stage 4 soft-preference terms can layer on top of the Stage 3 placement
    # contribution. Doing it here would force a re-call of ``model.maximize``,
    # which CP-SAT does not support cleanly.
    return BuiltModel(
        model=model,
        placement_vars=placement_vars,
        placed_indicator=placed_indicator,
        supervision_vars=supervision_vars,
    )


__all__ = ["BuiltModel", "build_model"]
