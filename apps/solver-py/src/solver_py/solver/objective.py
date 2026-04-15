"""Assemble the CP-SAT objective.

Two contributions:

  1. **Placement** (Stage 3) — ``placed[l]`` indicators + supervision-fill
     booleans, weighted so a placed lesson with zero satisfied
     preferences strictly out-scores an unplaced lesson with every
     preference satisfied.
  2. **Soft signals** (Stage 4) — every term emitted by
     ``soft_constraints.build_soft_constraints`` summed with its
     coefficient.

The two are summed and handed to ``model.maximize``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ortools.sat.python import cp_model

from solver_py.schema import SolverInputV2
from solver_py.solver.lessons import Lesson
from solver_py.solver.soft_constraints import ObjectiveTerm, SoftBuildOutput


@dataclass
class ObjectiveAssembled:
    placement_weight: int
    soft_terms: list[ObjectiveTerm]


def assemble_objective(
    model: cp_model.CpModel,
    input_payload: SolverInputV2,
    lessons: list[Lesson],
    placed_indicator: dict[int, cp_model.IntVar],
    supervision_vars: dict[tuple[int, int], cp_model.IntVar],
    soft: SoftBuildOutput,
) -> ObjectiveAssembled:
    """Add ``model.maximize(...)`` covering placement + soft terms."""
    placement_weight = _compute_placement_weight(input_payload, lessons, soft)

    parts: list[Any] = []
    if placed_indicator:
        parts.append(placement_weight * sum(placed_indicator.values()))
    if supervision_vars:
        parts.append(placement_weight * sum(supervision_vars.values()))
    for coeff, expr in soft.objective_terms:
        parts.append(coeff * expr)

    if parts:
        model.maximize(sum(parts))

    return ObjectiveAssembled(placement_weight=placement_weight, soft_terms=soft.objective_terms)


def _compute_placement_weight(
    input_payload: SolverInputV2,
    lessons: list[Lesson],
    soft: SoftBuildOutput,
) -> int:
    """A placement weight strictly greater than the largest possible soft delta.

    Bounded by: every teacher preference satisfied (sum of pref weights) +
    the worst-case global penalty span (``sum(global_soft_weights) *
    total_lessons``). Multiply by 2 for a comfortable safety margin —
    CP-SAT integer coefficients are happy up to ~10⁹ so we have headroom.
    """
    total_lessons = max(len(lessons), 1)
    g = input_payload.settings.global_soft_weights
    global_sum = (
        g.even_subject_spread
        + g.minimise_teacher_gaps
        + g.room_consistency
        + g.workload_balance
        + g.break_duty_balance
    )
    pref_sum = sum(p.weight for p in soft.teacher_pref_vars)
    bound = global_sum * total_lessons + pref_sum
    return max(2 * bound + 1, 1)


__all__ = ["ObjectiveAssembled", "assemble_objective"]
