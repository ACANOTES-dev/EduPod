"""Stage 3 acceptance: the realistic baseline must converge in budget.

The Stage 3 completion entry flagged that single-worker CP-SAT could not
crack the 260-lesson realistic baseline within 30 s — the model size
(380K placement BoolVars × 1.2M atMostOne literals) stalled CP-SAT
presolve. Stage 4 closed that gap by:

  1. Dropping the room dimension from CP-SAT (rooms assigned greedily
     post-solve via :func:`solve._assign_rooms`), shrinking the model
     by ~14× to 26K BoolVars.
  2. Switching to deterministic parallel search (``num_search_workers=8``
     + ``interleave_search=True``) so the multi-core dev box is used.
  3. Seeding CP-SAT with a greedy hint and falling back to that hint
     when CP-SAT can't improve within the budget.

This test pins the new behaviour so a future change can't regress it.
"""

from __future__ import annotations

import time

from scripts.realistic_baseline import make_realistic_baseline_payload
from solver_py.schema import SolverInputV2
from solver_py.solver import solve


def test_realistic_baseline_solves_within_5s_budget() -> None:
    """260 lessons, 8 subjects, 20 teachers, 15 rooms — must converge in
    budget (5 s here; production default is 30 s) and place at least 95 %
    of demand. Determinism is verified separately."""
    payload = make_realistic_baseline_payload()
    payload["settings"]["max_solver_duration_seconds"] = 5
    inp = SolverInputV2.model_validate(payload)

    start = time.perf_counter()
    out = solve(inp)
    elapsed = time.perf_counter() - start

    total_demand = len(out.entries) + len(out.unassigned)
    assert total_demand == 260
    placed_ratio = len(out.entries) / total_demand
    # Greedy fallback already hits 252/260 (96.9%). Anything below is a regression.
    assert placed_ratio >= 0.95, (
        f"Only {len(out.entries)}/{total_demand} placed in {elapsed:.2f}s — "
        f"regressed below the greedy floor."
    )
    # Wall time is allowed a small overhead beyond the budget for greedy +
    # solve-shutdown; cap at +2s.
    assert elapsed < 7.5, f"Took {elapsed:.2f}s, expected under 7.5s for a 5s budget"

    assert out.quality_metrics is not None
    assert out.constraint_summary.tier1_violations == 0


def test_realistic_baseline_is_deterministic_across_runs() -> None:
    """Same input must produce byte-identical output across repeated runs
    (modulo ``duration_ms``)."""
    payload = make_realistic_baseline_payload()
    payload["settings"]["max_solver_duration_seconds"] = 5
    inp = SolverInputV2.model_validate(payload)

    run_a = solve(inp).model_dump(mode="json")
    run_b = solve(inp).model_dump(mode="json")
    run_a["duration_ms"] = 0
    run_b["duration_ms"] = 0
    assert run_a == run_b
