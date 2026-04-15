"""End-to-end solve orchestration.

Pipeline:
  1. Enumerate physical slots (with wall-clock equivalence groups).
  2. Generate lessons (resolving SCHED-023 overrides and pinned subtraction).
  3. Prune to legal ``(slot, teacher, room)`` tuples per lesson.
  4. Build the CP-SAT model.
  5. Configure the solver (timeout, seed, single worker for determinism).
  6. Solve.
  7. Translate the solver state into a ``SolverOutputV2`` — pinned entries
     pass through verbatim; placed lessons become ``SolverAssignmentV2``;
     unplaced lessons become ``UnassignedSlotV2`` with a reason; failure
     modes (``UNKNOWN``, ``MODEL_INVALID``) propagate as ``SolveError``.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from ortools.sat.python import cp_model

from solver_py.schema import (
    ConstraintSummary,
    PinnedEntryV2,
    SolverAssignmentV2,
    SolverInputV2,
    SolverOutputV2,
    UnassignedSlotV2,
)
from solver_py.solver.lessons import Lesson, build_lessons
from solver_py.solver.model import build_model
from solver_py.solver.pruning import LegalAssignment, build_legal_assignments
from solver_py.solver.slots import PhysicalSlot, enumerate_slots

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


def solve(input_payload: SolverInputV2) -> SolverOutputV2:
    """Solve a ``SolverInputV2`` and return a ``SolverOutputV2``."""
    start = time.perf_counter()

    slots = enumerate_slots(input_payload)
    lessons = build_lessons(input_payload)
    legal, legal_by_lesson, diagnostics = build_legal_assignments(
        input_payload, lessons, slots
    )
    built = build_model(input_payload, lessons, slots, legal, legal_by_lesson)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(
        input_payload.settings.max_solver_duration_seconds
    )
    solver.parameters.random_seed = input_payload.settings.solver_seed or 0
    solver.parameters.num_search_workers = 1  # Determinism; Stage 5 tunes.

    status = solver.solve(built.model)
    duration_ms = int(round((time.perf_counter() - start) * 1000))

    if status == cp_model.MODEL_INVALID:
        raise SolveError("CP-SAT reports MODEL_INVALID — model build is broken")
    if status == cp_model.UNKNOWN:
        # Ran out of time without a feasible solution — surface as failure.
        raise SolveError(
            f"CP-SAT timed out before finding any feasible solution "
            f"(max_time={solver.parameters.max_time_in_seconds}s)"
        )

    pinned_assignments = _pinned_to_assignments(input_payload.pinned_entries, slots)

    if status == cp_model.INFEASIBLE:
        return _build_infeasible_output(
            input_payload, lessons, pinned_assignments, diagnostics, duration_ms
        )

    # Status is OPTIMAL or FEASIBLE — extract the solution.
    return _build_solution_output(
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
    )


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
    return SolverOutputV2(
        entries=pinned_assignments,
        unassigned=unassigned,
        score=0,
        max_score=0,
        duration_ms=duration_ms,
        constraint_summary=ConstraintSummary(
            tier1_violations=0, tier2_violations=0, tier3_violations=0
        ),
        quality_metrics=None,
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
) -> SolverOutputV2:
    from solver_py.solver.model import BuiltModel

    assert isinstance(built, BuiltModel)
    slot_by_id: dict[int, PhysicalSlot] = {s.slot_id: s for s in slots}
    teacher_id_by_idx = [t.staff_profile_id for t in input_payload.teachers]
    room_id_by_idx = [r.room_id for r in input_payload.rooms]

    entries: list[SolverAssignmentV2] = list(pinned_assignments)
    placed_lesson_ids: set[int] = set()
    for la_idx, la in enumerate(legal):
        if solver.value(built.placement_vars[la_idx]) == 1:
            slot = slot_by_id[la.slot_id]
            lesson = lessons[la.lesson_idx]
            entries.append(
                SolverAssignmentV2(
                    class_id=lesson.class_id,
                    subject_id=lesson.subject_id,
                    year_group_id=lesson.year_group_id,
                    room_id=room_id_by_idx[la.room_idx] if la.room_idx != -1 else None,
                    teacher_staff_id=teacher_id_by_idx[la.teacher_idx],
                    weekday=slot.weekday,
                    period_order=slot.period_order,
                    start_time=slot.start_time,
                    end_time=slot.end_time,
                    is_pinned=False,
                    break_group_id=None,
                    is_supervision=False,
                    preference_satisfaction=[],
                )
            )
            placed_lesson_ids.add(la.lesson_idx)

    for (sup_slot_id, teacher_idx), sup_var in built.supervision_vars.items():
        if solver.value(sup_var) != 1:
            continue
        slot = slot_by_id[sup_slot_id]
        entries.append(
            SolverAssignmentV2(
                class_id="",  # Supervision is not class-bound; legacy uses ""
                subject_id=None,
                year_group_id=slot.year_group_id,
                room_id=None,
                teacher_staff_id=teacher_id_by_idx[teacher_idx],
                weekday=slot.weekday,
                period_order=slot.period_order,
                start_time=slot.start_time,
                end_time=slot.end_time,
                is_pinned=False,
                break_group_id=slot.break_group_id,
                is_supervision=True,
                preference_satisfaction=[],
            )
        )

    unassigned: list[UnassignedSlotV2] = []
    for lesson_idx, lesson in enumerate(lessons):
        if lesson_idx in placed_lesson_ids:
            continue
        if lesson_idx in built.placed_indicator:
            # Lesson HAD legal tuples but the optimizer left it unplaced
            # (graceful degradation under aggregate over-demand).
            reason = diagnostics.get(
                lesson_idx,
                "Could not be placed without violating a hard constraint "
                "(no compatible (slot, teacher, room) survives the aggregate constraints)",
            )
        else:
            reason = diagnostics.get(
                lesson_idx, "No legal (slot, teacher, room) tuple available"
            )
        unassigned.append(
            UnassignedSlotV2(
                year_group_id=lesson.year_group_id,
                subject_id=lesson.subject_id,
                class_id=lesson.class_id,
                periods_remaining=1,
                reason=reason,
            )
        )

    score = (
        int(round(solver.objective_value))
        if built.placed_indicator or built.supervision_vars
        else 0
    )
    return SolverOutputV2(
        entries=entries,
        unassigned=unassigned,
        score=score,
        max_score=len(built.placed_indicator) + len(built.supervision_vars),
        duration_ms=duration_ms,
        constraint_summary=ConstraintSummary(
            tier1_violations=0, tier2_violations=0, tier3_violations=0
        ),
        quality_metrics=None,
    )


__all__ = ["SolveError", "solve"]
