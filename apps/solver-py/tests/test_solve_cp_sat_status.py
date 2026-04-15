"""Stage 6 — ``cp_sat_status`` observability field.

The worker persists ``cp_sat_status`` onto ``scheduling_runs.result_json.meta``
and logs one structured line per solve so operators can bucket runs by solver
outcome during Stage 7's observation window. This test pins that:

  - Every solve response carries a non-null ``cp_sat_status`` in the output
    envelope.
  - A trivially-feasible fixture reports ``optimal`` (CP-SAT proves
    optimality — the objective has nothing left to improve).
  - A no-competent-teacher fixture reports ``infeasible`` OR returns with no
    entries and a tier-2 reason — either way the status is one of the four
    legal literals.
"""

from __future__ import annotations

from typing import get_args

from solver_py.schema import CpSatStatus
from solver_py.solver import solve
from tests._builders import (
    build_input,
    competency,
    curriculum_entry,
    teacher,
)

_VALID_STATUSES = set(get_args(CpSatStatus))


def test_cp_sat_status_is_set_on_every_response() -> None:
    inp = build_input(
        curriculum=[curriculum_entry(min_periods=3, max_per_day=1)],
        teachers=[teacher(staff_id="t1", competencies=[competency()])],
    )
    out = solve(inp)
    assert out.cp_sat_status in _VALID_STATUSES


def test_cp_sat_status_optimal_on_trivially_feasible_fixture() -> None:
    """CP-SAT proves optimality when the solution space is small enough —
    the basic one-class / one-subject fixture exhausts the search tree
    quickly and returns ``optimal``."""
    inp = build_input(
        curriculum=[curriculum_entry(min_periods=3, max_per_day=1)],
        teachers=[teacher(staff_id="t1", competencies=[competency()])],
    )
    out = solve(inp)
    assert out.cp_sat_status == "optimal"


def test_cp_sat_status_set_when_pruning_eliminates_all_demand() -> None:
    """When no teacher is competent for the required subject, the legal-
    assignment pruner removes every placement variable before CP-SAT sees
    the model. The solver still runs on an empty placement set and must
    report a valid status — not ``None``."""
    inp = build_input(
        curriculum=[curriculum_entry(subject_id="science", min_periods=2, max_per_day=1)],
        teachers=[teacher(staff_id="t1", competencies=[competency(subject_id="maths")])],
    )
    out = solve(inp)
    assert len(out.entries) == 0
    assert out.cp_sat_status in _VALID_STATUSES
