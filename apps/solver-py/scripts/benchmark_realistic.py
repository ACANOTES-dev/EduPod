"""Profile the realistic baseline end-to-end.

Run with:
  python -m scripts.benchmark_realistic [--workers N] [--time S] [--quiet] [--profile]

Prints a stage-by-stage timing breakdown:
  - slot enumeration
  - lesson generation
  - legal-tuple pruning (legal count + time)
  - hard model build
  - soft model build
  - CP-SAT solve (status, objective, walltime)

Also reports placement %, unassigned count, and (with --profile) cProfile
top-30 by cumulative time of the build path.
"""

from __future__ import annotations

import argparse
import cProfile
import pstats
import time

from ortools.sat.python import cp_model

from scripts.realistic_baseline import make_realistic_baseline_payload
from solver_py.schema import SolverInputV2
from solver_py.solver.lessons import build_lessons
from solver_py.solver.model import build_model
from solver_py.solver.objective import assemble_objective
from solver_py.solver.pruning import build_legal_assignments
from solver_py.solver.slots import enumerate_slots
from solver_py.solver.soft_constraints import build_soft_constraints


def _run_once(
    payload: SolverInputV2, *, workers: int, time_limit: float, log_search: bool
) -> dict[str, object]:
    timings: dict[str, float] = {}

    t = time.perf_counter()
    slots = enumerate_slots(payload)
    timings["slots"] = time.perf_counter() - t

    t = time.perf_counter()
    lessons = build_lessons(payload)
    timings["lessons"] = time.perf_counter() - t

    t = time.perf_counter()
    legal, legal_by_lesson, _ = build_legal_assignments(payload, lessons, slots)
    timings["pruning"] = time.perf_counter() - t

    t = time.perf_counter()
    built = build_model(payload, lessons, slots, legal, legal_by_lesson)
    timings["hard_model"] = time.perf_counter() - t

    t = time.perf_counter()
    soft = build_soft_constraints(
        built.model, payload, lessons, slots, legal, built.placement_vars, built.supervision_vars
    )
    assemble_objective(
        built.model, payload, lessons, built.placed_indicator, built.supervision_vars, soft
    )
    timings["soft_objective"] = time.perf_counter() - t

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.random_seed = payload.settings.solver_seed or 0
    solver.parameters.num_search_workers = workers
    if workers > 1:
        solver.parameters.interleave_search = True  # deterministic parallel
    if log_search:
        solver.parameters.log_search_progress = True

    t = time.perf_counter()
    status = solver.solve(built.model)
    timings["solve"] = time.perf_counter() - t

    placed_lessons = (
        sum(1 for v in built.placed_indicator.values() if solver.value(v) == 1)
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        else 0
    )

    has_solution = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
    return {
        "lessons": len(lessons),
        "slots": len(slots),
        "legal": len(legal),
        "placement_vars": len(built.placement_vars),
        "supervision_vars": len(built.supervision_vars),
        "soft_terms": len(soft.objective_terms),
        "teacher_pref_vars": len(soft.teacher_pref_vars),
        "status": solver.status_name(status),
        "objective": solver.objective_value if has_solution else None,
        "best_bound": solver.best_objective_bound if has_solution else None,
        "placed_lessons": placed_lessons,
        "timings": timings,
        "wall_total": sum(timings.values()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--time", type=float, default=30.0)
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--profile", action="store_true")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--repeat",
        type=int,
        default=1,
        help="Repeat the solve N times (median reported).",
    )
    args = parser.parse_args()

    payload_dict = make_realistic_baseline_payload(seed=args.seed)
    payload = SolverInputV2.model_validate(payload_dict)

    print(
        f"Realistic baseline: {len(payload.year_groups[0].sections)} classes × "
        f"{len(payload.curriculum)} subjects × {len(payload.year_groups[0].period_grid)} slots, "
        f"{len(payload.teachers)} teachers, {len(payload.rooms)} rooms"
    )
    print(f"Settings: workers={args.workers}, time_limit={args.time}s, seed={args.seed}")
    print()

    if args.profile:
        profiler = cProfile.Profile()
        profiler.enable()

    results = []
    for run in range(args.repeat):
        result = _run_once(
            payload, workers=args.workers, time_limit=args.time, log_search=not args.quiet
        )
        results.append(result)
        if args.repeat > 1:
            solve_secs = result["timings"]["solve"]
            print(f"--- run {run + 1}: status={result['status']} solve={solve_secs:.2f}s")

    if args.profile:
        profiler.disable()

    final = results[len(results) // 2]
    print(f"\nLessons: {final['lessons']} | Slots: {final['slots']} | Legal: {final['legal']}")
    print(
        f"Vars: placement={final['placement_vars']} supervision={final['supervision_vars']} "
        f"teacher_pref={final['teacher_pref_vars']} soft_terms={final['soft_terms']}"
    )
    print(
        f"Status: {final['status']} | Objective: {final['objective']} "
        f"(bound: {final['best_bound']})"
    )
    print(f"Placed lessons: {final['placed_lessons']} / {final['lessons']}")
    print("\nTimings (seconds):")
    for stage, secs in final["timings"].items():
        print(f"  {stage:20s} {secs:8.4f}")
    print(f"  {'WALL TOTAL':20s} {final['wall_total']:8.4f}")

    if args.profile:
        print("\ncProfile top 30 by cumulative time:\n")
        pstats.Stats(profiler).sort_stats("cumulative").print_stats(30)


if __name__ == "__main__":
    main()
