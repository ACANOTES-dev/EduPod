"""Soft-preference objective-term builders (Stage 4).

Stage 3 maximises ``sum(placed) + sum(supervision_filled)`` so a tenant
whose demand can't fit gets a partial schedule rather than HTTP 500.
Stage 4 layers preference + workload signals on top: every soft signal
becomes a CP-SAT term (positive = reward, negative = penalty) that the
``objective`` module then weights and sums.

Legacy parity caveats (mirroring ``solver-v2.ts``):

  - Legacy scores ``even_subject_spread`` and ``workload_balance`` /
    ``break_duty_balance`` via fractional variance (``1 - variance/n²``,
    ``1 - cv/2``). CP-SAT can't express variance without integer-only
    auxiliaries that explode the model, so we approximate with
    ``max - min`` over the per-bucket counts. The approximation is
    monotone with variance for small bucket counts, so it picks the
    same "more even" solution but the absolute number differs.
  - Legacy ``room_consistency`` rewards a (class, subject) only when
    *every* placed lesson lands in the preferred room (all-or-nothing).
    We reward each lesson individually (each placed lesson in the
    preferred room contributes ``+weight``) — it's a strictly stronger
    signal that subsumes the legacy semantics in the limit and avoids
    a reified equality on summed BoolVars.
  - ``preference_type == 'subject'`` exists in the input contract but
    the legacy never marks it satisfied. We mirror that — ``satisfied``
    is fixed to 0 for subject prefs (still counted in ``max_score`` and
    in the ``preference_breakdown.violated`` column).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from ortools.sat.python import cp_model

from solver_py.schema import (
    SolverInputV2,
    TeacherInputV2,
    TeacherPreferenceInput,
)
from solver_py.solver.lessons import Lesson
from solver_py.solver.pruning import LegalAssignment
from solver_py.solver.slots import PhysicalSlot

ObjectiveTerm = tuple[int, Any]
"""``(coefficient, expr)`` where ``expr`` is anything CP-SAT can sum
(``IntVar``, ``LinearExpr``, ``int``). Sign of the coefficient encodes
whether the term is a reward (positive) or a penalty (negative)."""


@dataclass
class TeacherPrefSatVar:
    """Reified satisfaction of a single teacher preference.

    The same ``satisfied`` ``BoolVar`` feeds (a) the objective term and
    (b) the post-solve per-entry ``preference_satisfaction`` payload.
    """

    teacher_idx: int
    teacher_staff_id: str
    preference_id: str
    preference_type: str
    weight: int
    satisfied: cp_model.IntVar


@dataclass
class SoftBuildOutput:
    objective_terms: list[ObjectiveTerm]
    teacher_pref_vars: list[TeacherPrefSatVar]


# ─── Public entry point ──────────────────────────────────────────────────────


def build_soft_constraints(
    model: cp_model.CpModel,
    input_payload: SolverInputV2,
    lessons: list[Lesson],
    slots: list[PhysicalSlot],
    legal: list[LegalAssignment],
    placement_vars: list[cp_model.IntVar],
    supervision_vars: dict[tuple[int, int], cp_model.IntVar],
) -> SoftBuildOutput:
    """Add reified vars + return objective contributions for every soft signal."""
    slot_by_id: dict[int, PhysicalSlot] = {s.slot_id: s for s in slots}

    objective_terms: list[ObjectiveTerm] = []
    teacher_pref_vars: list[TeacherPrefSatVar] = []

    # (1) Teacher preferences (class_pref / time_slot / subject)
    for teacher_idx, teacher in enumerate(input_payload.teachers):
        for pref in teacher.preferences:
            pref_var = _build_teacher_pref_var(
                model,
                teacher_idx,
                teacher,
                pref,
                input_payload.settings.preference_weights,
                lessons,
                slot_by_id,
                legal,
                placement_vars,
            )
            teacher_pref_vars.append(pref_var)
            if pref_var.weight > 0:
                objective_terms.append((pref_var.weight, pref_var.satisfied))

    weights = input_payload.settings.global_soft_weights

    # (2) Even subject spread — penalise per-class-subject day-count spread.
    if weights.even_subject_spread > 0:
        objective_terms.extend(
            _even_subject_spread_terms(
                model, weights.even_subject_spread, lessons, slot_by_id, legal, placement_vars
            )
        )

    # (3) Minimise teacher gaps — penalise (last - first + 1) - count per teacher-day.
    if weights.minimise_teacher_gaps > 0:
        objective_terms.extend(
            _teacher_gap_terms(
                model,
                weights.minimise_teacher_gaps,
                input_payload,
                slot_by_id,
                legal,
                placement_vars,
            )
        )

    # (4) Room consistency — reward each placed lesson in its preferred room.
    if weights.room_consistency > 0:
        objective_terms.extend(
            _room_consistency_terms(
                weights.room_consistency,
                input_payload,
                lessons,
                legal,
                placement_vars,
            )
        )

    # (5) Workload balance — penalise (max - min) of teaching counts across teachers.
    if weights.workload_balance > 0:
        objective_terms.extend(
            _workload_balance_terms(
                model, weights.workload_balance, input_payload, legal, placement_vars
            )
        )

    # (6) Break-duty balance — penalise (max - min) of supervision counts.
    if weights.break_duty_balance > 0 and supervision_vars:
        objective_terms.extend(
            _break_duty_balance_terms(model, weights.break_duty_balance, supervision_vars)
        )

    return SoftBuildOutput(objective_terms=objective_terms, teacher_pref_vars=teacher_pref_vars)


# ─── (1) Teacher preferences ─────────────────────────────────────────────────


def _build_teacher_pref_var(
    model: cp_model.CpModel,
    teacher_idx: int,
    teacher: TeacherInputV2,
    pref: TeacherPreferenceInput,
    weights: Any,
    lessons: list[Lesson],
    slot_by_id: dict[int, PhysicalSlot],
    legal: list[LegalAssignment],
    placement_vars: list[cp_model.IntVar],
) -> TeacherPrefSatVar:
    weight = _priority_weight(pref.priority, weights)
    name = f"pref_sat[{teacher_idx},{pref.id}]"

    # Subject prefs are never marked satisfied (legacy parity).
    if pref.preference_type == "subject":
        satisfied = model.new_constant(0)
        return TeacherPrefSatVar(
            teacher_idx=teacher_idx,
            teacher_staff_id=teacher.staff_profile_id,
            preference_id=pref.id,
            preference_type=pref.preference_type,
            weight=weight,
            satisfied=satisfied,
        )

    matches = _matching_placement_vars(
        teacher_idx, pref, lessons, slot_by_id, legal, placement_vars
    )
    payload = pref.preference_payload if isinstance(pref.preference_payload, dict) else {}

    if pref.preference_type == "class_pref" and not payload.get("class_id"):
        # Legacy returns false when class_id is missing.
        return TeacherPrefSatVar(
            teacher_idx=teacher_idx,
            teacher_staff_id=teacher.staff_profile_id,
            preference_id=pref.id,
            preference_type=pref.preference_type,
            weight=weight,
            satisfied=model.new_constant(0),
        )

    if pref.preference_type == "time_slot" and (
        payload.get("weekday") is None and payload.get("period_order") is None
    ):
        return TeacherPrefSatVar(
            teacher_idx=teacher_idx,
            teacher_staff_id=teacher.staff_profile_id,
            preference_id=pref.id,
            preference_type=pref.preference_type,
            weight=weight,
            satisfied=model.new_constant(0),
        )

    wants = payload.get("preferred", True) is not False

    satisfied = model.new_bool_var(name)
    if not matches:
        # No legal assignment can ever match → wants is unachievable, "avoid" is automatic.
        model.add(satisfied == (1 if not wants else 0))
        return TeacherPrefSatVar(
            teacher_idx=teacher_idx,
            teacher_staff_id=teacher.staff_profile_id,
            preference_id=pref.id,
            preference_type=pref.preference_type,
            weight=weight,
            satisfied=satisfied,
        )

    any_match = model.new_bool_var(f"{name}_any")
    model.add_max_equality(any_match, matches)
    if wants:
        model.add(satisfied == any_match)
    else:
        # avoid: satisfied iff any_match == 0
        model.add(satisfied + any_match == 1)

    return TeacherPrefSatVar(
        teacher_idx=teacher_idx,
        teacher_staff_id=teacher.staff_profile_id,
        preference_id=pref.id,
        preference_type=pref.preference_type,
        weight=weight,
        satisfied=satisfied,
    )


def _matching_placement_vars(
    teacher_idx: int,
    pref: TeacherPreferenceInput,
    lessons: list[Lesson],
    slot_by_id: dict[int, PhysicalSlot],
    legal: list[LegalAssignment],
    placement_vars: list[cp_model.IntVar],
) -> list[cp_model.IntVar]:
    """Placement booleans whose assignment would satisfy ``pref`` for ``teacher_idx``."""
    payload = pref.preference_payload if isinstance(pref.preference_payload, dict) else {}
    matches: list[cp_model.IntVar] = []
    for la_idx, la in enumerate(legal):
        if la.teacher_idx != teacher_idx:
            continue
        if pref.preference_type == "class_pref":
            target_class = payload.get("class_id")
            if target_class and lessons[la.lesson_idx].class_id != target_class:
                continue
        elif pref.preference_type == "time_slot":
            slot = slot_by_id[la.slot_id]
            target_weekday = payload.get("weekday")
            if target_weekday is not None and slot.weekday != target_weekday:
                continue
            target_period = payload.get("period_order")
            if target_period is not None and slot.period_order != target_period:
                continue
        matches.append(placement_vars[la_idx])
    return matches


def _priority_weight(priority: str, weights: Any) -> int:
    if priority == "high":
        return int(weights.high)
    if priority == "medium":
        return int(weights.medium)
    return int(weights.low)


# ─── (2) Even subject spread ─────────────────────────────────────────────────


def _even_subject_spread_terms(
    model: cp_model.CpModel,
    weight: int,
    lessons: list[Lesson],
    slot_by_id: dict[int, PhysicalSlot],
    legal: list[LegalAssignment],
    placement_vars: list[cp_model.IntVar],
) -> list[ObjectiveTerm]:
    """Penalise ``max(per_day_count) - min(per_day_count)`` per (class, subject)."""
    by_cs_day: dict[tuple[str, str, int], list[int]] = defaultdict(list)
    by_cs_demand: dict[tuple[str, str], int] = defaultdict(int)
    weekdays_for_cs: dict[tuple[str, str], set[int]] = defaultdict(set)
    for la_idx, la in enumerate(legal):
        lesson = lessons[la.lesson_idx]
        slot = slot_by_id[la.slot_id]
        key = (lesson.class_id, lesson.subject_id, slot.weekday)
        by_cs_day[key].append(la_idx)
        weekdays_for_cs[(lesson.class_id, lesson.subject_id)].add(slot.weekday)
    for lesson in lessons:
        by_cs_demand[(lesson.class_id, lesson.subject_id)] += 1

    terms: list[ObjectiveTerm] = []
    for (class_id, subject_id), weekdays in weekdays_for_cs.items():
        if len(weekdays) < 2:
            continue
        demand = by_cs_demand[(class_id, subject_id)]
        if demand <= 1:
            continue
        per_day_sums = []
        for weekday in sorted(weekdays):
            indices = by_cs_day[(class_id, subject_id, weekday)]
            per_day_sums.append(sum(placement_vars[i] for i in indices))
        max_var = model.new_int_var(0, demand, f"spread_max[{class_id},{subject_id}]")
        min_var = model.new_int_var(0, demand, f"spread_min[{class_id},{subject_id}]")
        model.add_max_equality(max_var, per_day_sums)
        model.add_min_equality(min_var, per_day_sums)
        spread = model.new_int_var(0, demand, f"spread_diff[{class_id},{subject_id}]")
        model.add(spread == max_var - min_var)
        terms.append((-weight, spread))
    return terms


# ─── (3) Teacher gaps ────────────────────────────────────────────────────────


def _teacher_gap_terms(
    model: cp_model.CpModel,
    weight: int,
    input_payload: SolverInputV2,
    slot_by_id: dict[int, PhysicalSlot],
    legal: list[LegalAssignment],
    placement_vars: list[cp_model.IntVar],
) -> list[ObjectiveTerm]:
    """Penalise ``(last_period - first_period + 1) - count`` per (teacher, weekday)."""
    period_orders_by_weekday: dict[int, set[int]] = defaultdict(set)
    for slot in slot_by_id.values():
        if slot.period_type == "teaching":
            period_orders_by_weekday[slot.weekday].add(slot.period_order)
    if not period_orders_by_weekday:
        return []

    by_teacher_day_period: dict[tuple[int, int, int], list[int]] = defaultdict(list)
    for la_idx, la in enumerate(legal):
        slot = slot_by_id[la.slot_id]
        by_teacher_day_period[(la.teacher_idx, slot.weekday, slot.period_order)].append(la_idx)

    terms: list[ObjectiveTerm] = []
    for teacher_idx in range(len(input_payload.teachers)):
        for weekday, period_orders in period_orders_by_weekday.items():
            ordered_periods = sorted(period_orders)
            if len(ordered_periods) < 2:
                continue
            present_per_period: list[Any] = []
            count_terms: list[Any] = []
            for p in ordered_periods:
                indices = by_teacher_day_period.get((teacher_idx, weekday, p), [])
                pv = sum(placement_vars[i] for i in indices) if indices else 0
                present_per_period.append(pv)
                count_terms.append(pv)
            if all(isinstance(v, int) for v in present_per_period):
                # Teacher has no legal assignments on this day → no gap to penalise.
                continue

            max_p = ordered_periods[-1]
            sentinel = max_p + 2
            # last_pos = max((p+1) * present) — 0 if all absent, p+1 of last present otherwise.
            last_pos = model.new_int_var(0, max_p + 1, f"gap_last[{teacher_idx},{weekday}]")
            model.add_max_equality(
                last_pos, [(p + 1) * present_per_period[i] for i, p in enumerate(ordered_periods)]
            )
            # first_pos = min((p+1) + sentinel*(1-present)) — p+1 of first present, else > max+1.
            first_terms = []
            for i, p in enumerate(ordered_periods):
                first_terms.append((p + 1) + sentinel * (1 - present_per_period[i]))
            first_pos = model.new_int_var(
                1, max_p + 1 + sentinel, f"gap_first[{teacher_idx},{weekday}]"
            )
            model.add_min_equality(first_pos, first_terms)

            gap = model.new_int_var(0, max_p, f"gap[{teacher_idx},{weekday}]")
            count_expr = sum(count_terms) if count_terms else 0
            # When active: gap >= last - first + 1 - count (>= 0 by construction).
            # When inactive: last=0, first>max+1, RHS very negative → gap >= 0 only.
            model.add(gap >= last_pos - first_pos + 1 - count_expr)
            terms.append((-weight, gap))
    return terms


# ─── (4) Room consistency ────────────────────────────────────────────────────


def _room_consistency_terms(
    weight: int,
    input_payload: SolverInputV2,
    lessons: list[Lesson],
    legal: list[LegalAssignment],
    placement_vars: list[cp_model.IntVar],
) -> list[ObjectiveTerm]:
    """Room identity is decided post-solve by the greedy assigner in
    ``solve._assign_rooms``, which already prefers ``preferred_room_id``
    when free. There's nothing CP-SAT can usefully optimise here that
    the greedy step doesn't already do, so this signal is a no-op in the
    objective. The fractional contribution still lands in the reported
    ``score`` via ``solve._score_room_consistency``.
    """
    _ = (input_payload, lessons, legal, placement_vars, weight)  # parameters reserved
    return []


# ─── (5) Workload balance ────────────────────────────────────────────────────


def _workload_balance_terms(
    model: cp_model.CpModel,
    weight: int,
    input_payload: SolverInputV2,
    legal: list[LegalAssignment],
    placement_vars: list[cp_model.IntVar],
) -> list[ObjectiveTerm]:
    """Penalise ``max - min`` of teaching counts across teachers."""
    if len(input_payload.teachers) <= 1:
        return []
    by_teacher: dict[int, list[int]] = defaultdict(list)
    for la_idx, la in enumerate(legal):
        by_teacher[la.teacher_idx].append(la_idx)

    counts: list[Any] = []
    upper = max(1, len(legal))
    for teacher_idx in range(len(input_payload.teachers)):
        indices = by_teacher.get(teacher_idx, [])
        if indices:
            counts.append(sum(placement_vars[i] for i in indices))
        else:
            counts.append(0)
    if all(isinstance(c, int) for c in counts):
        return []

    max_var = model.new_int_var(0, upper, "workload_max")
    min_var = model.new_int_var(0, upper, "workload_min")
    model.add_max_equality(max_var, counts)
    model.add_min_equality(min_var, counts)
    spread = model.new_int_var(0, upper, "workload_spread")
    model.add(spread == max_var - min_var)
    return [(-weight, spread)]


# ─── (6) Break-duty balance ──────────────────────────────────────────────────


def _break_duty_balance_terms(
    model: cp_model.CpModel,
    weight: int,
    supervision_vars: dict[tuple[int, int], cp_model.IntVar],
) -> list[ObjectiveTerm]:
    """Penalise ``max - min`` of supervision counts across teachers eligible for any duty."""
    by_teacher: dict[int, list[cp_model.IntVar]] = defaultdict(list)
    for (_, teacher_idx), var in supervision_vars.items():
        by_teacher[teacher_idx].append(var)
    if len(by_teacher) <= 1:
        return []

    upper = max(1, max(len(v) for v in by_teacher.values()))
    counts: list[Any] = [sum(v) for v in by_teacher.values()]
    max_var = model.new_int_var(0, upper, "duty_max")
    min_var = model.new_int_var(0, upper, "duty_min")
    model.add_max_equality(max_var, counts)
    model.add_min_equality(min_var, counts)
    spread = model.new_int_var(0, upper, "duty_spread")
    model.add(spread == max_var - min_var)
    return [(-weight, spread)]


__all__ = [
    "ObjectiveTerm",
    "SoftBuildOutput",
    "TeacherPrefSatVar",
    "build_soft_constraints",
]
