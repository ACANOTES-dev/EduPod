"""End-to-end solve orchestration.

Pipeline:
  1. Enumerate physical slots (with wall-clock equivalence groups).
  2. Generate lessons (resolving SCHED-023 overrides and pinned subtraction).
  3. Prune to legal ``(slot, teacher, room)`` tuples per lesson.
  4. Build the CP-SAT model (hard constraints, no objective).
  5. Add soft-preference reified vars + objective terms.
  6. Configure the solver (timeout, seed, single worker for determinism).
  7. Solve, with the Stage 9.5.1 EarlyStopCallback halting on
     greedy-match stagnation or relative-gap closure.
  8. Translate the solver state into a ``SolverOutputV2`` — pinned entries
     pass through verbatim; placed lessons become ``SolverAssignmentV2``;
     unplaced lessons become ``UnassignedSlotV2`` with a reason; failure
     modes (``UNKNOWN``, ``MODEL_INVALID``) propagate as ``SolveError``.
     Each non-pinned entry carries the teacher's full preference-satisfaction
     list, mirroring the legacy.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from collections import defaultdict
from dataclasses import dataclass

from ortools.sat.python import cp_model

from solver_py.schema import (
    ConstraintSummary,
    CpSatStatus,
    EarlyStopReason,
    PinnedEntryV2,
    PreferenceSatisfaction,
    SolverAssignmentV2,
    SolverInputV2,
    SolverOutputV2,
    UnassignedSlotV2,
)
from solver_py.solver.early_stop import EarlyStopCallback
from solver_py.solver.hints import greedy_assign
from solver_py.solver.lessons import Lesson, build_lessons
from solver_py.solver.model import build_model
from solver_py.solver.objective import assemble_objective
from solver_py.solver.pruning import LegalAssignment, build_legal_assignments
from solver_py.solver.quality_metrics import build_quality_metrics
from solver_py.solver.slots import PhysicalSlot, enumerate_slots
from solver_py.solver.soft_constraints import (
    SoftBuildOutput,
    TeacherPrefSatVar,
    build_soft_constraints,
)

logger = logging.getLogger(__name__)


class SolveError(RuntimeError):
    """Raised when the solver cannot decide one way or the other.

    Distinct from ``INFEASIBLE`` (which is a valid result — every lesson
    goes to ``unassigned``). ``SolveError`` covers ``MODEL_INVALID`` (a
    bug in the model build) and ``UNKNOWN`` returned with no feasible
    solution after the timeout (typically a too-short
    ``max_solver_duration_seconds``).
    """


@dataclass
class _SolveResult:
    output: SolverOutputV2


def solve(
    input_payload: SolverInputV2,
    cancel_flag: threading.Event | None = None,
) -> SolverOutputV2:
    """Solve a ``SolverInputV2`` and return a ``SolverOutputV2``.

    ``cancel_flag`` is plumbed through the Stage 9.5.1 post-close amendment:
    when the sidecar receives ``DELETE /solve/{request_id}`` it sets the
    event, and ``EarlyStopCallback`` cooperatively halts the CP-SAT search
    on its next solution callback. A cancelled solve still returns a valid
    ``SolverOutputV2`` — greedy fallback plus whatever CP-SAT found before
    the halt — with ``early_stop_reason='cancelled'``.
    """
    start = time.perf_counter()

    slots = enumerate_slots(input_payload)
    lessons = build_lessons(input_payload)
    legal, legal_by_lesson, diagnostics = build_legal_assignments(input_payload, lessons, slots)
    built = build_model(input_payload, lessons, slots, legal, legal_by_lesson)
    soft = build_soft_constraints(
        built.model,
        input_payload,
        lessons,
        slots,
        legal,
        built.placement_vars,
        built.supervision_vars,
    )
    objective_meta = assemble_objective(
        built.model,
        input_payload,
        lessons,
        built.placed_indicator,
        built.supervision_vars,
        soft,
    )

    # Greedy warm-start hint — without it CP-SAT can take >30s to find a
    # first feasible on the realistic baseline (260 lessons / 26K legal).
    # With it the solver typically converges to a near-optimal placement
    # in <2s on a 4-core dev box. Hints are soft; they can only help.
    greedy_chosen = greedy_assign(input_payload, lessons, slots, legal, legal_by_lesson)
    for la_idx, var in enumerate(built.placement_vars):
        built.model.add_hint(var, 1 if la_idx in greedy_chosen else 0)

    solver = cp_model.CpSolver()
    budget_seconds = float(input_payload.settings.max_solver_duration_seconds)
    solver.parameters.max_time_in_seconds = budget_seconds
    solver.parameters.random_seed = input_payload.settings.solver_seed or 0
    # Single worker keeps the budget honest — ``interleave_search`` with
    # 8 workers blew through ``max_time_in_seconds`` by 4-7× on Tier 3
    # parity inputs (each interleaved chunk runs to completion before the
    # budget is checked, OR-Tools 9.15). With the greedy fallback in
    # ``_build_greedy_output`` we always have a valid output even when
    # CP-SAT returns UNKNOWN, so single-worker is the right call:
    # deterministic, in-budget, and the floor is the greedy hint.
    solver.parameters.num_search_workers = 1
    # Note: ``repair_hint = True`` segfaults inside CP-SAT 9.15's
    # ``MinimizeL1DistanceWithHint`` when ``interleave_search`` is on
    # (Check failed: heuristics.fixed_search != nullptr). Single-worker
    # path doesn't trigger that crash either way.

    # Stage 9.5.1 §A — early-stop callback halts CP-SAT when it stops
    # finding improvements past the greedy floor or when the relative
    # objective gap closes below ``gap_threshold``. Tunables come from
    # env vars so production can adjust without redeploying source.
    placement_weight = objective_meta.placement_weight
    greedy_hint_score = placement_weight * len(greedy_chosen)
    callback = EarlyStopCallback(
        greedy_hint_score=greedy_hint_score,
        stagnation_seconds=float(os.environ.get("CP_SAT_EARLY_STOP_STAGNATION_SECONDS", "8")),
        gap_threshold=float(os.environ.get("CP_SAT_EARLY_STOP_GAP_THRESHOLD", "0.001")),
        min_runtime_seconds=float(
            os.environ.get("CP_SAT_EARLY_STOP_MIN_RUNTIME_SECONDS", "2")
        ),
        cancel_flag=cancel_flag,
    )

    status = solver.solve(built.model, callback)
    duration_ms = int(round((time.perf_counter() - start) * 1000))
    early_stop_triggered: bool = callback.triggered
    early_stop_reason: EarlyStopReason = callback.reason
    # Budget-bound fallback: if cancel arrived during the solve but the
    # callback never fired (CP-SAT never found a feasible, so no solution
    # callbacks), still stamp the output with ``reason='cancelled'`` so the
    # caller can see the sidecar acknowledged the cancel even though it
    # couldn't halt CP-SAT mid-budget. The greedy output below is still
    # a valid schedule — the cancel is metadata, not a failure.
    if (
        not early_stop_triggered
        and cancel_flag is not None
        and cancel_flag.is_set()
    ):
        early_stop_triggered = True
        early_stop_reason = "cancelled"
    # ``time_saved_ms`` is the budget remaining when we halted. 0 when the
    # callback didn't fire OR when the solver ran past budget (negative
    # clamped to 0).
    time_saved_ms = (
        max(int(round((budget_seconds - solver.wall_time) * 1000)), 0)
        if early_stop_triggered
        else 0
    )

    if status == cp_model.MODEL_INVALID:
        raise SolveError("CP-SAT reports MODEL_INVALID — model build is broken")

    pinned_assignments = _pinned_to_assignments(input_payload.pinned_entries, slots)

    def _stamp_early_stop(output: SolverOutputV2) -> SolverOutputV2:
        output.early_stop_triggered = early_stop_triggered
        output.early_stop_reason = early_stop_reason
        output.time_saved_ms = time_saved_ms
        return output

    if status == cp_model.INFEASIBLE:
        return _stamp_early_stop(
            _build_infeasible_output(
                input_payload, lessons, pinned_assignments, diagnostics, duration_ms, soft
            )
        )

    greedy_output = _build_greedy_output(
        input_payload,
        lessons,
        slots,
        legal,
        greedy_chosen,
        pinned_assignments,
        diagnostics,
        duration_ms,
        soft,
        cp_sat_status="unknown",
    )

    if status == cp_model.UNKNOWN:
        # CP-SAT couldn't find a solution within the budget — fall back to the
        # greedy placement we already built as the hint. Stage 3 acceptance
        # criterion requires the realistic baseline to converge in budget;
        # this guarantees a valid output even when CP-SAT punts.
        return _stamp_early_stop(greedy_output)

    cpsat_status: CpSatStatus = "optimal" if status == cp_model.OPTIMAL else "feasible"
    cpsat_output = _build_solution_output(
        input_payload,
        lessons,
        slots,
        legal,
        legal_by_lesson,
        built,
        solver,
        pinned_assignments,
        diagnostics,
        duration_ms,
        soft,
        cp_sat_status=cpsat_status,
    )

    # CP-SAT can occasionally land on a solution with fewer placed lessons
    # than the greedy seed (the soft objective trades a placement for a
    # local soft win). Always return the lex-better of the two:
    # (placed_count desc, score desc). When we fall back to greedy, the
    # status reported is still what CP-SAT itself returned — callers can
    # see the solver finished but the greedy placement was preferred.
    cpsat_key = (len(cpsat_output.entries), cpsat_output.score)
    greedy_key = (len(greedy_output.entries), greedy_output.score)
    if cpsat_key >= greedy_key:
        return _stamp_early_stop(cpsat_output)
    greedy_output.cp_sat_status = cpsat_status
    return _stamp_early_stop(greedy_output)


def _pinned_to_assignments(
    pinned: list[PinnedEntryV2], slots: list[PhysicalSlot]
) -> list[SolverAssignmentV2]:
    """Convert pinned entries into output assignments verbatim."""
    by_keys: dict[tuple[str, int, int], PhysicalSlot] = {}
    by_weekday_period: dict[tuple[int, int], PhysicalSlot] = {}
    for s in slots:
        by_keys[(s.year_group_id, s.weekday, s.period_order)] = s
        by_weekday_period.setdefault((s.weekday, s.period_order), s)

    out: list[SolverAssignmentV2] = []
    for pin in pinned:
        slot: PhysicalSlot | None = None
        if pin.year_group_id is not None:
            slot = by_keys.get((pin.year_group_id, pin.weekday, pin.period_order))
        if slot is None:
            slot = by_weekday_period.get((pin.weekday, pin.period_order))
        if slot is None:
            continue
        out.append(
            SolverAssignmentV2(
                class_id=pin.class_id,
                subject_id=pin.subject_id,
                year_group_id=slot.year_group_id,
                room_id=pin.room_id,
                teacher_staff_id=pin.teacher_staff_id,
                weekday=pin.weekday,
                period_order=pin.period_order,
                start_time=slot.start_time,
                end_time=slot.end_time,
                is_pinned=True,
                break_group_id=slot.break_group_id,
                is_supervision=slot.supervision_mode == "yard",
                preference_satisfaction=[],
            )
        )
    return out


def _build_infeasible_output(
    input_payload: SolverInputV2,
    lessons: list[Lesson],
    pinned_assignments: list[SolverAssignmentV2],
    diagnostics: dict[int, str],
    duration_ms: int,
    soft: SoftBuildOutput,
) -> SolverOutputV2:
    unassigned: list[UnassignedSlotV2] = []
    for lesson_idx, lesson in enumerate(lessons):
        unassigned.append(
            UnassignedSlotV2(
                year_group_id=lesson.year_group_id,
                subject_id=lesson.subject_id,
                class_id=lesson.class_id,
                periods_remaining=1,
                reason=diagnostics.get(
                    lesson_idx,
                    "CP-SAT reported INFEASIBLE — at least one hard constraint is unsatisfiable",
                ),
            )
        )
    max_score = sum(p.weight for p in soft.teacher_pref_vars)
    return SolverOutputV2(
        entries=pinned_assignments,
        unassigned=unassigned,
        score=0,
        max_score=max_score,
        duration_ms=duration_ms,
        constraint_summary=ConstraintSummary(
            tier1_violations=0, tier2_violations=0, tier3_violations=0
        ),
        quality_metrics=build_quality_metrics(input_payload, pinned_assignments, []),
        cp_sat_status="infeasible",
    )


def _build_solution_output(
    input_payload: SolverInputV2,
    lessons: list[Lesson],
    slots: list[PhysicalSlot],
    legal: list[LegalAssignment],
    legal_by_lesson: dict[int, list[int]],
    built: object,
    solver: cp_model.CpSolver,
    pinned_assignments: list[SolverAssignmentV2],
    diagnostics: dict[int, str],
    duration_ms: int,
    soft: SoftBuildOutput,
    cp_sat_status: CpSatStatus,
) -> SolverOutputV2:
    from solver_py.solver.model import BuiltModel

    assert isinstance(built, BuiltModel)
    slot_by_id: dict[int, PhysicalSlot] = {s.slot_id: s for s in slots}
    teacher_id_by_idx = [t.staff_profile_id for t in input_payload.teachers]

    # Per-entry preference_satisfaction is the teacher's full list of prefs
    # tagged with whether each was satisfied — same row attached to every
    # non-pinned entry that teacher took, mirroring the legacy.
    per_entry_satisfaction = _extract_pref_satisfaction(soft.teacher_pref_vars, solver)
    by_teacher = _group_satisfaction_by_teacher(per_entry_satisfaction)

    entries: list[SolverAssignmentV2] = list(pinned_assignments)
    placed_lesson_ids: set[int] = set()
    placed_records: list[tuple[int, LegalAssignment]] = []
    for la_idx, la in enumerate(legal):
        if solver.value(built.placement_vars[la_idx]) != 1:
            continue
        placed_records.append((la_idx, la))
        placed_lesson_ids.add(la.lesson_idx)

    room_assignments = _assign_rooms(
        input_payload, lessons, slots, placed_records, pinned_assignments
    )

    for la_idx, la in placed_records:
        slot = slot_by_id[la.slot_id]
        lesson = lessons[la.lesson_idx]
        teacher_id = teacher_id_by_idx[la.teacher_idx]
        entries.append(
            SolverAssignmentV2(
                class_id=lesson.class_id,
                subject_id=lesson.subject_id,
                year_group_id=lesson.year_group_id,
                room_id=room_assignments.get(la_idx),
                teacher_staff_id=teacher_id,
                weekday=slot.weekday,
                period_order=slot.period_order,
                start_time=slot.start_time,
                end_time=slot.end_time,
                is_pinned=False,
                break_group_id=None,
                is_supervision=False,
                preference_satisfaction=by_teacher.get(teacher_id, []),
            )
        )

    for (sup_slot_id, teacher_idx), sup_var in built.supervision_vars.items():
        if solver.value(sup_var) != 1:
            continue
        slot = slot_by_id[sup_slot_id]
        teacher_id = teacher_id_by_idx[teacher_idx]
        entries.append(
            SolverAssignmentV2(
                class_id="",  # Supervision is not class-bound; legacy uses "".
                subject_id=None,
                year_group_id=slot.year_group_id,
                room_id=None,
                teacher_staff_id=teacher_id,
                weekday=slot.weekday,
                period_order=slot.period_order,
                start_time=slot.start_time,
                end_time=slot.end_time,
                is_pinned=False,
                break_group_id=slot.break_group_id,
                is_supervision=True,
                preference_satisfaction=by_teacher.get(teacher_id, []),
            )
        )

    unassigned: list[UnassignedSlotV2] = []
    for lesson_idx, lesson in enumerate(lessons):
        if lesson_idx in placed_lesson_ids:
            continue
        if lesson_idx in built.placed_indicator:
            reason = diagnostics.get(
                lesson_idx,
                "Could not be placed without violating a hard constraint "
                "(no compatible (slot, teacher, room) survives the aggregate constraints)",
            )
        else:
            reason = diagnostics.get(lesson_idx, "No legal (slot, teacher, room) tuple available")
        unassigned.append(
            UnassignedSlotV2(
                year_group_id=lesson.year_group_id,
                subject_id=lesson.subject_id,
                class_id=lesson.class_id,
                periods_remaining=1,
                reason=reason,
            )
        )

    score = _compute_reported_score(input_payload, entries, soft, per_entry_satisfaction)
    max_score = _compute_max_score(input_payload, soft)
    return SolverOutputV2(
        entries=entries,
        unassigned=unassigned,
        score=score,
        max_score=max_score,
        duration_ms=duration_ms,
        constraint_summary=ConstraintSummary(
            tier1_violations=0, tier2_violations=0, tier3_violations=0
        ),
        quality_metrics=build_quality_metrics(input_payload, entries, per_entry_satisfaction),
        cp_sat_status=cp_sat_status,
    )


def _build_greedy_output(
    input_payload: SolverInputV2,
    lessons: list[Lesson],
    slots: list[PhysicalSlot],
    legal: list[LegalAssignment],
    greedy_chosen: set[int],
    pinned_assignments: list[SolverAssignmentV2],
    diagnostics: dict[int, str],
    duration_ms: int,
    soft: SoftBuildOutput,
    cp_sat_status: CpSatStatus,
) -> SolverOutputV2:
    """Translate the greedy hint into a full ``SolverOutputV2``.

    Used when CP-SAT returns ``UNKNOWN`` — the greedy already passes
    every hard constraint by construction, so the schedule is valid
    even though CP-SAT didn't certify optimality.
    """
    slot_by_id: dict[int, PhysicalSlot] = {s.slot_id: s for s in slots}
    teacher_id_by_idx = [t.staff_profile_id for t in input_payload.teachers]

    placed_records: list[tuple[int, LegalAssignment]] = [
        (la_idx, legal[la_idx]) for la_idx in sorted(greedy_chosen)
    ]
    room_assignments = _assign_rooms(
        input_payload, lessons, slots, placed_records, pinned_assignments
    )

    entries: list[SolverAssignmentV2] = list(pinned_assignments)
    placed_lesson_ids: set[int] = set()
    for la_idx, la in placed_records:
        slot = slot_by_id[la.slot_id]
        lesson = lessons[la.lesson_idx]
        teacher_id = teacher_id_by_idx[la.teacher_idx]
        entries.append(
            SolverAssignmentV2(
                class_id=lesson.class_id,
                subject_id=lesson.subject_id,
                year_group_id=lesson.year_group_id,
                room_id=room_assignments.get(la_idx),
                teacher_staff_id=teacher_id,
                weekday=slot.weekday,
                period_order=slot.period_order,
                start_time=slot.start_time,
                end_time=slot.end_time,
                is_pinned=False,
                break_group_id=None,
                is_supervision=False,
                # Greedy fallback — no preference reification, no satisfaction.
                preference_satisfaction=[],
            )
        )
        placed_lesson_ids.add(la.lesson_idx)

    unassigned: list[UnassignedSlotV2] = []
    for lesson_idx, lesson in enumerate(lessons):
        if lesson_idx in placed_lesson_ids:
            continue
        unassigned.append(
            UnassignedSlotV2(
                year_group_id=lesson.year_group_id,
                subject_id=lesson.subject_id,
                class_id=lesson.class_id,
                periods_remaining=1,
                reason=diagnostics.get(
                    lesson_idx,
                    "Greedy fallback could not place this lesson "
                    "(CP-SAT timed out before improving on the greedy seed)",
                ),
            )
        )

    score = sum(_global_soft_score(input_payload, entries))
    max_score = _compute_max_score(input_payload, soft)
    return SolverOutputV2(
        entries=entries,
        unassigned=unassigned,
        score=score,
        max_score=max_score,
        duration_ms=duration_ms,
        constraint_summary=ConstraintSummary(
            tier1_violations=0, tier2_violations=0, tier3_violations=0
        ),
        quality_metrics=build_quality_metrics(input_payload, entries, []),
        cp_sat_status=cp_sat_status,
    )


def _assign_rooms(
    input_payload: SolverInputV2,
    lessons: list[Lesson],
    slots: list[PhysicalSlot],
    placed_records: list[tuple[int, LegalAssignment]],
    pinned_assignments: list[SolverAssignmentV2],
) -> dict[int, str | None]:
    """Greedy room assignment, deterministic by (lesson_idx, la_idx).

    For each placement, prefer the lesson's ``preferred_room_id`` (or its
    SCHED-018 class-room override) when free at the time-group; otherwise
    fall back to any free exclusive room of the required type. Pinned
    assignments and earlier placements occupy their slots, so later
    placements pick around them. Double-period followers reuse their
    anchor's room.
    """
    slot_by_id: dict[int, PhysicalSlot] = {s.slot_id: s for s in slots}
    rooms_by_type: dict[str | None, list[str]] = defaultdict(list)
    nonexclusive_by_type: dict[str | None, list[str]] = defaultdict(list)
    closed = {rc.room_id for rc in input_payload.room_closures}
    for room in input_payload.rooms:
        if room.room_id in closed:
            continue
        if room.is_exclusive:
            rooms_by_type[room.room_type].append(room.room_id)
        else:
            # Non-exclusive rooms (gym, hall) can host multiple lessons at the
            # same time — capacity vs student_count is checked post-solve by
            # the admin layer.
            nonexclusive_by_type[room.room_type].append(room.room_id)

    # SCHED-018 / STRESS-030 fix:
    # Orchestration emits ``ClassRoomOverride`` rows with ``subject_id=null``
    # (class_scheduling_requirements is a class-level table — it doesn't
    # have a subject_id column; the override applies to every subject for
    # that class). The override lookup below tries the subject-specific
    # key first (for any future sibling table that does carry subject_id),
    # then falls back to the class-wildcard entry — ``(class_id, None)``.
    # Before this fix the lookup used ``(lesson.class_id, lesson.subject_id)``
    # exclusively, so the wildcard entry was silently ignored and every
    # class-level preferred-room rule was dropped on the floor.
    overrides: dict[tuple[str, str | None], str] = {}
    for ovr in input_payload.class_room_overrides or []:
        if ovr.preferred_room_id is None:
            continue
        overrides[(ovr.class_id, ovr.subject_id)] = ovr.preferred_room_id

    used: set[tuple[str, int]] = set()
    for pin in pinned_assignments:
        if pin.room_id is None:
            continue
        slot_keys = (pin.weekday, pin.period_order)
        # Find every time-group this pin spans.
        for s in slots:
            if (s.weekday, s.period_order) == slot_keys and s.year_group_id == pin.year_group_id:
                used.add((pin.room_id, s.time_group_id))

    anchor_room: dict[int, str | None] = {}  # double_pair_index -> chosen room

    sorted_records = sorted(
        placed_records, key=lambda r: (lessons[r[1].lesson_idx].lesson_id, r[0])
    )
    assignments: dict[int, str | None] = {}
    for la_idx, la in sorted_records:
        lesson = lessons[la.lesson_idx]
        slot = slot_by_id[la.slot_id]
        tg = slot.time_group_id

        # Followers reuse anchor's room when possible.
        if (
            lesson.requires_double_period
            and lesson.double_pair_index is not None
            and lesson.double_pair_index in anchor_room
        ):
            chosen = anchor_room[lesson.double_pair_index]
            if chosen is not None:
                used.add((chosen, tg))
                assignments[la_idx] = chosen
                continue

        candidate_rooms: list[str] = []
        preferred = (
            overrides.get((lesson.class_id, lesson.subject_id))
            or overrides.get((lesson.class_id, None))
            or lesson.preferred_room_id
        )
        if lesson.required_room_type is None:
            type_pool = [rid for pool in rooms_by_type.values() for rid in pool]
            ne_pool = [rid for pool in nonexclusive_by_type.values() for rid in pool]
        else:
            type_pool = list(rooms_by_type.get(lesson.required_room_type, []))
            ne_pool = list(nonexclusive_by_type.get(lesson.required_room_type, []))
        if preferred and (preferred in type_pool or preferred in ne_pool):
            candidate_rooms.append(preferred)
        for rid in type_pool:
            if rid != preferred:
                candidate_rooms.append(rid)
        for rid in ne_pool:
            if rid != preferred:
                candidate_rooms.append(rid)

        chosen = None
        for rid in candidate_rooms:
            # Non-exclusive rooms can be re-used at the same time-group.
            if rid in [r for pool in nonexclusive_by_type.values() for r in pool]:
                chosen = rid
                break
            if (rid, tg) in used:
                continue
            chosen = rid
            break
        if chosen is not None and not any(chosen in pool for pool in nonexclusive_by_type.values()):
            used.add((chosen, tg))
        assignments[la_idx] = chosen
        if (
            lesson.requires_double_period
            and lesson.double_pair_index is not None
            and lesson.double_pair_index not in anchor_room
        ):
            anchor_room[lesson.double_pair_index] = chosen
    return assignments


def _extract_pref_satisfaction(
    pref_vars: list[TeacherPrefSatVar], solver: cp_model.CpSolver
) -> list[PreferenceSatisfaction]:
    out: list[PreferenceSatisfaction] = []
    for pv in pref_vars:
        out.append(
            PreferenceSatisfaction(
                preference_id=pv.preference_id,
                teacher_staff_id=pv.teacher_staff_id,
                satisfied=bool(solver.value(pv.satisfied)),
                weight=pv.weight,
            )
        )
    return out


def _group_satisfaction_by_teacher(
    sats: list[PreferenceSatisfaction],
) -> dict[str, list[PreferenceSatisfaction]]:
    grouped: dict[str, list[PreferenceSatisfaction]] = defaultdict(list)
    for s in sats:
        grouped[s.teacher_staff_id].append(s)
    return grouped


def _compute_reported_score(
    input_payload: SolverInputV2,
    entries: list[SolverAssignmentV2],
    soft: SoftBuildOutput,
    per_entry_satisfaction: list[PreferenceSatisfaction],
) -> int:
    """Reported ``score`` mirrors the legacy: honoured-pref weights +
    global-soft-weight contribution. The CP-SAT objective is internal —
    callers care about the legacy-shaped score because the constraint
    report and admin UI compare it against ``max_score``."""
    score = 0
    for sat in per_entry_satisfaction:
        if sat.satisfied:
            score += sat.weight
    for slot_score in _global_soft_score(input_payload, entries):
        score += slot_score
    return score


def _compute_max_score(input_payload: SolverInputV2, soft: SoftBuildOutput) -> int:
    pref_max = sum(p.weight for p in soft.teacher_pref_vars)
    g = input_payload.settings.global_soft_weights
    global_max = (
        max(g.even_subject_spread, 0)
        + max(g.minimise_teacher_gaps, 0)
        + max(g.room_consistency, 0)
        + max(g.workload_balance, 0)
        + max(g.break_duty_balance, 0)
    )
    return pref_max + global_max


def _global_soft_score(
    input_payload: SolverInputV2, entries: list[SolverAssignmentV2]
) -> list[int]:
    """Each global soft signal contributes ``weight * fraction_in_[0,1]``,
    rounded to int. Keeps the reported score stable + bounded."""
    g = input_payload.settings.global_soft_weights
    contributions: list[int] = []
    if g.even_subject_spread > 0:
        score = _score_even_spread(input_payload, entries)
        contributions.append(round(score * g.even_subject_spread))
    if g.minimise_teacher_gaps > 0:
        score = _score_minimise_gaps(input_payload, entries)
        contributions.append(round(score * g.minimise_teacher_gaps))
    if g.room_consistency > 0:
        score = _score_room_consistency(input_payload, entries)
        contributions.append(round(score * g.room_consistency))
    if g.workload_balance > 0:
        score = _score_workload_balance(input_payload, entries)
        contributions.append(round(score * g.workload_balance))
    if g.break_duty_balance > 0:
        score = _score_break_duty_balance(entries)
        contributions.append(round(score * g.break_duty_balance))
    return contributions


def _score_even_spread(input_payload: SolverInputV2, entries: list[SolverAssignmentV2]) -> float:
    total = 0.0
    count = 0
    for curriculum in input_payload.curriculum:
        yg = next(
            (y for y in input_payload.year_groups if y.year_group_id == curriculum.year_group_id),
            None,
        )
        if yg is None:
            continue
        for section in yg.sections:
            section_entries = [
                e
                for e in entries
                if e.class_id == section.class_id and e.subject_id == curriculum.subject_id
            ]
            if not section_entries:
                continue
            count += 1
            total += _spread_score(section_entries)
    return total / count if count else 1.0


def _spread_score(section_entries: list[SolverAssignmentV2]) -> float:
    if len(section_entries) <= 1:
        return 1.0
    day_counts: dict[int, int] = defaultdict(int)
    for e in section_entries:
        day_counts[e.weekday] += 1
    counts = list(day_counts.values())
    n = len(section_entries)
    k = len(counts)
    mean = n / k
    variance = sum((c - mean) ** 2 for c in counts) / k
    max_variance = n**2
    if max_variance == 0:
        return 1.0
    return max(0.0, 1.0 - variance / max_variance)


def _score_minimise_gaps(input_payload: SolverInputV2, entries: list[SolverAssignmentV2]) -> float:
    if not input_payload.teachers or not entries:
        return 1.0
    total_gaps = 0
    max_possible = 0
    for teacher in input_payload.teachers:
        teacher_entries = [e for e in entries if e.teacher_staff_id == teacher.staff_profile_id]
        by_day: dict[int, list[int]] = defaultdict(list)
        for e in teacher_entries:
            by_day[e.weekday].append(e.period_order)
        for orders in by_day.values():
            if len(orders) <= 1:
                continue
            span = max(orders) - min(orders) + 1
            total_gaps += span - len(orders)
            max_possible += span - 1
    if max_possible == 0:
        return 1.0
    return max(0.0, 1.0 - total_gaps / max_possible)


def _score_room_consistency(
    input_payload: SolverInputV2, entries: list[SolverAssignmentV2]
) -> float:
    total = 0
    satisfied = 0
    for curriculum in input_payload.curriculum:
        if curriculum.preferred_room_id is None:
            continue
        yg = next(
            (y for y in input_payload.year_groups if y.year_group_id == curriculum.year_group_id),
            None,
        )
        if yg is None:
            continue
        for section in yg.sections:
            section_entries = [
                e
                for e in entries
                if e.class_id == section.class_id and e.subject_id == curriculum.subject_id
            ]
            if not section_entries:
                continue
            total += 1
            if all(e.room_id == curriculum.preferred_room_id for e in section_entries):
                satisfied += 1
    return satisfied / total if total else 1.0


def _score_workload_balance(
    input_payload: SolverInputV2, entries: list[SolverAssignmentV2]
) -> float:
    if len(input_payload.teachers) <= 1:
        return 1.0
    counts = [
        sum(1 for e in entries if e.teacher_staff_id == t.staff_profile_id and not e.is_supervision)
        for t in input_payload.teachers
    ]
    mean = sum(counts) / len(counts)
    if mean == 0:
        return 1.0
    variance = sum((c - mean) ** 2 for c in counts) / len(counts)
    std_dev = variance**0.5
    cv = std_dev / mean
    return float(max(0.0, 1.0 - cv / 2))


def _score_break_duty_balance(entries: list[SolverAssignmentV2]) -> float:
    sup = [e for e in entries if e.is_supervision]
    if not sup:
        return 1.0
    counts_map: dict[str, int] = defaultdict(int)
    for e in sup:
        if e.teacher_staff_id is not None:
            counts_map[e.teacher_staff_id] += 1
    counts = list(counts_map.values())
    if len(counts) <= 1:
        return 1.0
    mean = sum(counts) / len(counts)
    if mean == 0:
        return 1.0
    variance = sum((c - mean) ** 2 for c in counts) / len(counts)
    std_dev = variance**0.5
    cv = std_dev / mean
    return float(max(0.0, 1.0 - cv / 2))


__all__ = ["SolveError", "solve"]
