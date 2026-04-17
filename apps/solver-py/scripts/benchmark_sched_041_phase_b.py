"""SCHED-041 §B — targeted A/B benchmark for ``num_search_workers`` 1 vs 8.

Runs the same fixture through the in-process ``solve()`` function twice:
once with the workers pinned to 1 (pre-fix behaviour), once with the
production default of 8 (Phase B fix). Captures the full
``SolverDiagnosticsV3`` block for both runs and prints a side-by-side
comparison of the SCHED-041 signatures:

  - placement count and score
  - first_solution_wall_time (when did CP-SAT find its first feasible?)
  - improvements_found (strictly-better objective ticks)
  - cp_sat_improved_on_greedy (did we beat the Python greedy?)
  - termination_reason (optimal / feasible_at_deadline / unknown_at_deadline)
  - num_branches / num_conflicts / num_lp_iterations (search shape)

This isn't the Stage 9.5.2 scale-proof harness (``benchmark_scale.py``);
it's a focused diff report for Phase B decision-making and the
``solver-performance-2026-04.md`` write-up.

Usage (from repo root):

    python3 apps/solver-py/scripts/benchmark_sched_041_phase_b.py \\
        --fixture realistic \\
        --budget 30 \\
        --seed 42

    # Tier-4 parity fixture at 120s budget
    python3 apps/solver-py/scripts/benchmark_sched_041_phase_b.py \\
        --fixture tier-4 --budget 120 --seed 42

Exit code is 0 on success, 2 if the workers=8 run regresses placement
below workers=1 — a crude guard against multi-worker pathologies at
smaller scales.
"""

# ruff: noqa: E501 — diagnostics table rows are declarative; breaking them
# across lines would sacrifice the column-aligned readability that makes
# the A/B comparison useful. Scripts are not subject to hotspot budgets.

from __future__ import annotations

import argparse
import importlib
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = REPO_ROOT / "apps" / "solver-py" / "tests" / "fixtures"
sys.path.insert(0, str(REPO_ROOT / "apps" / "solver-py" / "src"))
sys.path.insert(0, str(REPO_ROOT / "apps" / "solver-py"))

# Imports are deferred until path is set up.
from solver_py.schema import SolverInputV2  # noqa: E402
from solver_py.solver import solve  # noqa: E402
from solver_py.solver.telemetry import SolverTelemetry  # noqa: E402


@dataclass
class ABResult:
    workers: int
    wall_seconds: float
    entries: int
    unassigned: int
    score: int
    max_score: int
    diagnostics: dict[str, Any]


def _load_fixture(name: str) -> SolverInputV2:
    """Load one of the supported fixtures into a V2 payload.

    - ``realistic`` → the Stage 3 realistic baseline (10 classes × 8 subjects).
    - ``tier-4`` → the Tier-4 Irish-secondary fixture (JSON).
    - ``tier-5`` → the Tier-5 multi-campus fixture (JSON) — memory-heavy.
    """
    if name == "realistic":
        from scripts.realistic_baseline import make_realistic_baseline_payload

        return SolverInputV2.model_validate(make_realistic_baseline_payload(seed=42))
    if name == "tier-4":
        path = FIXTURES_DIR / "tier-4-irish-secondary-large.seed42.json"
        return SolverInputV2.model_validate(json.loads(path.read_text()))
    if name == "tier-5":
        path = FIXTURES_DIR / "tier-5-multi-campus-large.seed7.json"
        return SolverInputV2.model_validate(json.loads(path.read_text()))
    raise SystemExit(f"Unknown fixture: {name}. Choose from realistic / tier-4 / tier-5.")


def _run_one(
    payload: SolverInputV2, *, workers: int, budget_seconds: int, seed: int
) -> ABResult:
    """Run a single solve with the workers constant monkey-patched."""
    solve_mod = importlib.import_module("solver_py.solver.solve")
    original = solve_mod._CP_SAT_NUM_SEARCH_WORKERS
    solve_mod._CP_SAT_NUM_SEARCH_WORKERS = workers
    try:
        payload_copy = payload.model_copy(deep=True)
        payload_copy.settings.max_solver_duration_seconds = budget_seconds
        payload_copy.settings.solver_seed = seed

        telemetry = SolverTelemetry()
        start = time.perf_counter()
        out = solve(payload_copy, telemetry=telemetry)
        wall = time.perf_counter() - start

        diag = telemetry.to_diagnostics().model_dump()
    finally:
        solve_mod._CP_SAT_NUM_SEARCH_WORKERS = original

    return ABResult(
        workers=workers,
        wall_seconds=wall,
        entries=len(out.entries),
        unassigned=len(out.unassigned),
        score=out.score,
        max_score=out.max_score,
        diagnostics=diag,
    )


def _print_comparison(a: ABResult, b: ABResult, fixture: str, budget: int) -> None:
    """Print a two-column comparison of the A (workers=1) and B (workers=8) runs."""
    rows: list[tuple[str, str, str]] = [
        ("fixture", fixture, fixture),
        ("budget (s)", str(budget), str(budget)),
        ("num_search_workers", str(a.workers), str(b.workers)),
        ("wall seconds", f"{a.wall_seconds:.2f}", f"{b.wall_seconds:.2f}"),
        ("placed entries", str(a.entries), str(b.entries)),
        ("unassigned", str(a.unassigned), str(b.unassigned)),
        ("reported score", f"{a.score}/{a.max_score}", f"{b.score}/{b.max_score}"),
        ("───────────────────────", "───────────", "───────────"),
        ("termination_reason", _s(a.diagnostics, "termination_reason"), _s(b.diagnostics, "termination_reason")),
        ("solution_info", _s(a.diagnostics, "solution_info"), _s(b.diagnostics, "solution_info")),
        ("greedy_hint_score", _s(a.diagnostics, "greedy_hint_score"), _s(b.diagnostics, "greedy_hint_score")),
        ("first_solution_obj", _s(a.diagnostics, "first_solution_objective"), _s(b.diagnostics, "first_solution_objective")),
        ("first_solution_wall_s", _s(a.diagnostics, "first_solution_wall_time_seconds"), _s(b.diagnostics, "first_solution_wall_time_seconds")),
        ("final_objective_value", _s(a.diagnostics, "final_objective_value"), _s(b.diagnostics, "final_objective_value")),
        ("final_objective_bound", _s(a.diagnostics, "final_objective_bound"), _s(b.diagnostics, "final_objective_bound")),
        ("final_relative_gap", _s(a.diagnostics, "final_relative_gap"), _s(b.diagnostics, "final_relative_gap")),
        ("improvements_found", _s(a.diagnostics, "improvements_found"), _s(b.diagnostics, "improvements_found")),
        ("improved_on_greedy", _s(a.diagnostics, "cp_sat_improved_on_greedy"), _s(b.diagnostics, "cp_sat_improved_on_greedy")),
        ("───────────────────────", "───────────", "───────────"),
        ("num_branches", _s(a.diagnostics, "num_branches"), _s(b.diagnostics, "num_branches")),
        ("num_conflicts", _s(a.diagnostics, "num_conflicts"), _s(b.diagnostics, "num_conflicts")),
        ("num_lp_iterations", _s(a.diagnostics, "num_lp_iterations"), _s(b.diagnostics, "num_lp_iterations")),
        ("solver_wall_time_s", _s(a.diagnostics, "solver_wall_time_seconds"), _s(b.diagnostics, "solver_wall_time_seconds")),
        ("solver_user_time_s", _s(a.diagnostics, "solver_user_time_seconds"), _s(b.diagnostics, "solver_user_time_seconds")),
    ]

    col_widths = [max(len(str(cell)) for cell in col) for col in zip(*rows, strict=True)]
    col_widths = [max(w, 10) for w in col_widths]

    def _format_row(r: tuple[str, str, str]) -> str:
        return (
            f"{r[0]:<{col_widths[0]}}  "
            f"{r[1]:>{col_widths[1]}}  "
            f"{r[2]:>{col_widths[2]}}"
        )

    header = f"{'':<{col_widths[0]}}  {'A (workers=1)':>{col_widths[1]}}  {'B (workers=8)':>{col_widths[2]}}"
    print("═" * len(header))
    print("SCHED-041 §B — A/B benchmark")
    print("═" * len(header))
    print(header)
    print("─" * len(header))
    for r in rows:
        print(_format_row(r))
    print("─" * len(header))

    # Regression verdict
    verdict = "PASS"
    if b.entries < a.entries:
        verdict = f"FAIL — workers=8 placed {b.entries} vs workers=1 {a.entries}"
    elif b.entries == a.entries and b.score < a.score:
        verdict = f"DEGRADE — same placements, score dropped {a.score}→{b.score}"
    print(f"Regression verdict: {verdict}")


def _s(d: dict[str, Any], key: str) -> str:
    """Stringify a diagnostics value for printing, with None → '—'."""
    v = d.get(key)
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:.3f}" if abs(v) < 1e6 else f"{v:.2e}"
    return str(v)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fixture",
        choices=("realistic", "tier-4", "tier-5"),
        default="realistic",
        help="Fixture to run. realistic ~ Tier-2 proxy; tier-4 = Stage 9.5.2 Irish-secondary.",
    )
    parser.add_argument(
        "--budget",
        type=int,
        default=30,
        help="max_solver_duration_seconds per run. Default 30s.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="solver_seed for both runs. Default 42.",
    )
    parser.add_argument(
        "--output-json",
        default=None,
        help="Optional path to write the raw diagnostics for both runs.",
    )
    args = parser.parse_args()

    fixture = _load_fixture(args.fixture)

    sys.stderr.write(f"[run A] workers=1, budget={args.budget}s…\n")
    a = _run_one(fixture, workers=1, budget_seconds=args.budget, seed=args.seed)
    sys.stderr.write(
        f"  → placed {a.entries}, wall {a.wall_seconds:.1f}s, "
        f"termination {a.diagnostics.get('termination_reason')}\n"
    )

    sys.stderr.write(f"[run B] workers=8, budget={args.budget}s…\n")
    b = _run_one(fixture, workers=8, budget_seconds=args.budget, seed=args.seed)
    sys.stderr.write(
        f"  → placed {b.entries}, wall {b.wall_seconds:.1f}s, "
        f"termination {b.diagnostics.get('termination_reason')}\n"
    )

    _print_comparison(a, b, args.fixture, args.budget)

    if args.output_json:
        Path(args.output_json).write_text(
            json.dumps(
                {
                    "fixture": args.fixture,
                    "budget_seconds": args.budget,
                    "seed": args.seed,
                    "workers_1": a.diagnostics,
                    "workers_8": b.diagnostics,
                    "workers_1_entries": a.entries,
                    "workers_8_entries": b.entries,
                    "workers_1_wall_seconds": a.wall_seconds,
                    "workers_8_wall_seconds": b.wall_seconds,
                },
                indent=2,
                default=str,
            )
        )
        sys.stderr.write(f"Wrote raw diagnostics to {args.output_json}\n")

    # Return code 2 if workers=8 regresses placement (for CI gating).
    return 2 if b.entries < a.entries else 0


if __name__ == "__main__":
    sys.exit(main())
