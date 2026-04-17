"""SCHED-041 §A — solver telemetry capture.

Bridges OR-Tools CP-SAT's ``CpSolver`` internals and ``EarlyStopCallback``
state into the durable ``SolverDiagnosticsV3`` contract. This is the
observability layer that lets operators answer "what actually happened
during the 3,600 s CP-SAT budget?" — SCHED-041 was diagnosed blind
because the sidecar exposed ``early_stop_reason`` but nothing about
the objective trajectory, branch/conflict counts, or hint survival.

Flow:
    telemetry = SolverTelemetry(
        greedy_chosen=greedy_chosen,
        placement_vars_count=len(built.placement_vars),
    )
    ... solver.solve(model, callback) ...
    telemetry.capture_after_solve(solver, callback, status, budget_seconds)
    diagnostics = telemetry.to_diagnostics()  # → SolverDiagnosticsV3

The telemetry object is passed into ``solve()`` as an optional parameter;
omitted, ``solve()`` runs with its prior behaviour (every existing test
path stays green because no capture happens unless asked).

Defensive design: every field is optional. If an OR-Tools property raises
(the Python bindings raise ``RuntimeError`` when you access
``solver.objective_value`` after an UNKNOWN return) we swallow the error
and leave the field ``None`` — partial diagnostics beat no diagnostics.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from solver_py.schema.v3.output import SolverDiagnosticsV3, TerminationReasonV3
from solver_py.solver.early_stop import EarlyStopCallback

# CP-SAT response_stats() dumps to ~2-3 KB on a typical solve but can balloon
# with deep search trees. Cap to keep ``scheduling_runs.solver_diagnostics``
# JSONB rows small enough not to bloat the row cache on large tenants.
_RESPONSE_STATS_MAX_CHARS = 16_384


@dataclass
class SolverTelemetry:
    """Mutable container for CP-SAT telemetry over one solve call.

    Constructed before ``solver.solve()``, populated during and after via
    ``record_greedy`` / ``capture_after_solve``, then serialised to
    ``SolverDiagnosticsV3`` via ``to_diagnostics()``.
    """

    # ─── Pre-solve state ──────────────────────────────────────────────────
    placement_vars_count: int | None = None
    placement_vars_hinted_to_1: int | None = None
    greedy_hint_score: int | None = None
    greedy_placement_count: int | None = None

    # ─── Post-solve counters ──────────────────────────────────────────────
    or_tools_version: str | None = None
    response_stats_text: str | None = None
    solver_wall_time_seconds: float | None = None
    solver_user_time_seconds: float | None = None
    solver_deterministic_time: float | None = None
    num_booleans: int | None = None
    num_branches: int | None = None
    num_conflicts: int | None = None
    num_binary_propagations: int | None = None
    num_integer_propagations: int | None = None
    num_restarts: int | None = None
    num_lp_iterations: int | None = None
    num_search_workers: int | None = None
    max_time_in_seconds: float | None = None
    random_seed: int | None = None
    final_objective_value: float | None = None
    final_objective_bound: float | None = None
    final_relative_gap: float | None = None
    solution_info: str | None = None
    termination_reason: TerminationReasonV3 | None = None

    # ─── Callback-sourced trajectory ──────────────────────────────────────
    first_solution_objective: float | None = None
    first_solution_wall_time_seconds: float | None = None
    improvements_found: int = 0
    cp_sat_improved_on_greedy: bool = False

    # Internal bookkeeping — used by ``record_greedy`` to remember the
    # hint's score so the callback / solver tap can compare without
    # re-deriving. Private; not serialised.
    _greedy_score_for_compare: float | None = field(default=None, repr=False)

    # ─── Lifecycle hooks ──────────────────────────────────────────────────
    def record_greedy(
        self,
        *,
        greedy_placement_count: int,
        greedy_hint_score: int,
        placement_vars_count: int,
    ) -> None:
        """Called after the greedy warm-start + add_hint loop.

        Records the hint score so ``capture_after_solve`` can decide if
        CP-SAT improved on it. Assumes every placement_var gets a hint
        (1 or 0) — matches the current solve.py pipeline.
        """
        self.greedy_placement_count = greedy_placement_count
        self.greedy_hint_score = greedy_hint_score
        self.placement_vars_count = placement_vars_count
        # We hint all vars; the number hinted to 1 == size of greedy_chosen.
        self.placement_vars_hinted_to_1 = greedy_placement_count
        self._greedy_score_for_compare = float(greedy_hint_score)

    def capture_after_solve(
        self,
        solver: cp_model.CpSolver,
        callback: EarlyStopCallback,
        status: cp_model.CpSolverStatus | int,
        *,
        budget_seconds: float,
    ) -> None:
        """Pull counters + final objective from CP-SAT after ``solve()`` returns.

        ``status`` is the raw OR-Tools return value (``cp_model.OPTIMAL``
        et al). Accepts both ``CpSolverStatus`` (the strict type OR-Tools
        returns from ``CpSolver.solve()``) and ``int`` (so tests can pass
        raw status constants). We avoid importing the schema-level
        ``CpSatStatus`` Literal here to keep this module independent
        of schema wiring; translation happens inline below.
        """
        # Version — best-effort; some OR-Tools builds expose this on the
        # module, others don't. Falls through to None on ImportError.
        try:
            from ortools import __version__ as ortools_version  # type: ignore[attr-defined]

            self.or_tools_version = str(ortools_version)
        except Exception:
            self.or_tools_version = None

        # Solver parameters we asked for — easier to read back here than
        # at the call site, and independent of whether the solve itself
        # honoured them (OR-Tools may override silently).
        try:
            self.num_search_workers = int(solver.parameters.num_search_workers)
        except Exception:
            self.num_search_workers = None
        try:
            self.max_time_in_seconds = float(solver.parameters.max_time_in_seconds)
        except Exception:
            self.max_time_in_seconds = None
        try:
            self.random_seed = int(solver.parameters.random_seed)
        except Exception:
            self.random_seed = None

        # Counters — every one is wrapped because OR-Tools raises on
        # some accessors when the solve errored out early.
        self.solver_wall_time_seconds = _safe_float(lambda: solver.wall_time)
        self.solver_user_time_seconds = _safe_float(lambda: solver.user_time)
        self.num_booleans = _safe_int(lambda: solver.num_booleans)
        self.num_branches = _safe_int(lambda: solver.num_branches)
        self.num_conflicts = _safe_int(lambda: solver.num_conflicts)
        # ResponseProto carries the richer counters; wrap because the
        # accessor can raise when no response was produced.
        try:
            response = solver.response_proto
            self.solver_deterministic_time = float(response.deterministic_time)
            self.num_binary_propagations = int(response.num_binary_propagations)
            self.num_integer_propagations = int(response.num_integer_propagations)
            self.num_restarts = int(response.num_restarts)
            self.num_lp_iterations = int(response.num_lp_iterations)
            # solution_info is the label CP-SAT attaches to the best
            # solution ("LNS #3", "fixed_search", "first_solution_heuristic").
            # Non-empty only when a solution was found.
            if response.solution_info:
                self.solution_info = str(response.solution_info)
        except Exception:
            # ResponseProto unavailable — leave the fields None.
            pass

        # response_stats_text — truncated multi-line dump for ops grep.
        try:
            stats = solver.response_stats()
            if isinstance(stats, str) and stats:
                self.response_stats_text = stats[:_RESPONSE_STATS_MAX_CHARS]
        except Exception:
            self.response_stats_text = None

        # Final objective + bound. Both accessors raise when the solve
        # returned without an objective (INFEASIBLE proof, UNKNOWN).
        self.final_objective_value = _safe_float(lambda: solver.objective_value)
        self.final_objective_bound = _safe_float(lambda: solver.best_objective_bound)
        if (
            self.final_objective_value is not None
            and self.final_objective_bound is not None
        ):
            denom = max(1.0, abs(self.final_objective_value))
            self.final_relative_gap = (
                self.final_objective_bound - self.final_objective_value
            ) / denom

        # Callback-sourced trajectory.
        self.first_solution_objective = callback.first_solution_objective
        self.first_solution_wall_time_seconds = callback.first_solution_wall_time
        self.improvements_found = callback.improvements_found

        # Did CP-SAT beat greedy? Only meaningful when we have both.
        if (
            self._greedy_score_for_compare is not None
            and self.final_objective_value is not None
        ):
            self.cp_sat_improved_on_greedy = (
                self.final_objective_value > self._greedy_score_for_compare
            )

        # Unified termination bucket.
        self.termination_reason = _compute_termination_reason(
            status=status,
            early_stop_triggered=callback.triggered,
            early_stop_reason=callback.reason,
            wall_time=self.solver_wall_time_seconds,
            budget_seconds=budget_seconds,
        )

    def to_diagnostics(self) -> SolverDiagnosticsV3:
        """Snapshot the current telemetry into the Pydantic schema."""
        return SolverDiagnosticsV3(
            or_tools_version=self.or_tools_version,
            response_stats_text=self.response_stats_text,
            solver_wall_time_seconds=self.solver_wall_time_seconds,
            solver_user_time_seconds=self.solver_user_time_seconds,
            solver_deterministic_time=self.solver_deterministic_time,
            num_booleans=self.num_booleans,
            num_branches=self.num_branches,
            num_conflicts=self.num_conflicts,
            num_binary_propagations=self.num_binary_propagations,
            num_integer_propagations=self.num_integer_propagations,
            num_restarts=self.num_restarts,
            num_lp_iterations=self.num_lp_iterations,
            num_search_workers=self.num_search_workers,
            max_time_in_seconds=self.max_time_in_seconds,
            random_seed=self.random_seed,
            greedy_hint_score=self.greedy_hint_score,
            greedy_placement_count=self.greedy_placement_count,
            final_objective_value=self.final_objective_value,
            final_objective_bound=self.final_objective_bound,
            final_relative_gap=self.final_relative_gap,
            first_solution_objective=self.first_solution_objective,
            first_solution_wall_time_seconds=self.first_solution_wall_time_seconds,
            improvements_found=self.improvements_found,
            cp_sat_improved_on_greedy=self.cp_sat_improved_on_greedy,
            placement_vars_count=self.placement_vars_count,
            placement_vars_hinted_to_1=self.placement_vars_hinted_to_1,
            termination_reason=self.termination_reason,
            solution_info=self.solution_info,
        )


# ─── Helpers ────────────────────────────────────────────────────────────────


def _safe_int(fn: object) -> int | None:
    try:
        value = fn()  # type: ignore[operator]
    except Exception:
        return None
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_float(fn: object) -> float | None:
    try:
        value = fn()  # type: ignore[operator]
    except Exception:
        return None
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _compute_termination_reason(
    *,
    status: cp_model.CpSolverStatus | int,
    early_stop_triggered: bool,
    early_stop_reason: str,
    wall_time: float | None,
    budget_seconds: float,
) -> TerminationReasonV3:
    """Map (CP-SAT status, early-stop state, wall time) → unified reason.

    Priority order: callback-driven halts beat status-based ones (because
    a cancel/gap/stagnation is what actually stopped execution, even though
    CP-SAT's status is whatever it was holding at halt). Then OPTIMAL /
    INFEASIBLE / MODEL_INVALID are terminal proofs. FEASIBLE and UNKNOWN
    fall into the deadline bucket when no early-stop was invoked.
    """
    # Callback-driven halts take precedence over the CP-SAT status.
    if early_stop_triggered:
        if early_stop_reason == "cancelled":
            return "cancelled"
        if early_stop_reason == "stagnation":
            return "early_stop_stagnation"
        if early_stop_reason == "gap":
            return "early_stop_gap"
        # Unexpected reason: fall through to status-based inference.

    if status == cp_model.OPTIMAL:
        return "optimal"
    if status == cp_model.INFEASIBLE:
        return "infeasible"
    if status == cp_model.MODEL_INVALID:
        return "model_invalid"
    # FEASIBLE or UNKNOWN without an early-stop means we spent the budget.
    # Distinguish between "at least one feasible was found" (FEASIBLE) and
    # "nothing was found" (UNKNOWN) — both are deadline-bucket but operators
    # care about the difference.
    if status == cp_model.FEASIBLE:
        return "feasible_at_deadline"
    return "unknown_at_deadline"


__all__ = ["SolverTelemetry"]
