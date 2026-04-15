"""Early-stop SolutionCallback for CP-SAT (Stage 9.5.1 §A + amendment).

CP-SAT's default behaviour is to use the entire wall-clock budget given
by ``max_time_in_seconds`` even when no further improvement is possible.
On easy fixtures that already match the greedy hint within seconds, this
wastes the remaining 50–110 s of every solve. Stage 9.5.1 raises the
budget ceiling to 3600 s; without an early-stop hook that ceiling would
turn 60 s of wasted compute into 3540 s.

This callback halts the search when one of three conditions holds:

  1. **External cancellation.** The caller set the ``cancel_flag``
     ``threading.Event`` (e.g. via ``DELETE /solve/{request_id}`` on the
     sidecar). Halts on the NEXT solution callback after the flag is
     raised. Added by the Stage 9.5.1 post-close amendment so an
     abandoned solve doesn't block the next request.
  2. **Greedy-match stagnation.** Once the current objective has reached
     or exceeded the greedy-hint floor AND no improvement has been
     observed for ``stagnation_seconds`` seconds, halt.
  3. **Relative-gap closure.** Once ``min_runtime_seconds`` have passed
     AND the gap between the current objective and the best objective
     bound is below ``gap_threshold``, halt. (The min-runtime guard
     prevents premature halts when CP-SAT trivially proves the bound
     equals the initial value.)

The callback uses ``self.WallTime()`` — CP-SAT's internal wall clock
that ticks consistently with its presolve/search phases — rather than
``time.monotonic()``. This keeps the halt point reproducible under a
fixed seed on the same hardware, which is the determinism guarantee
the regression harness relies on (STRESS-046 / STRESS-086).

Telemetry: after solve, ``triggered`` is ``True`` iff one of the three
conditions fired and ``StopSearch`` was called. ``reason`` is one of
``"cancelled"``, ``"stagnation"``, ``"gap"``, or ``"not_triggered"``.
The caller is expected to surface these into ``SolverOutputV2`` for the
worker's ``cp_sat.solve_complete`` log +
``scheduling_runs.result_json.meta``.
"""

from __future__ import annotations

import threading
from typing import Literal

from ortools.sat.python import cp_model

EarlyStopReason = Literal["stagnation", "gap", "cancelled", "not_triggered"]


class EarlyStopCallback(cp_model.CpSolverSolutionCallback):
    """Halt CP-SAT once it stops finding improvements past the greedy floor.

    Parameters
    ----------
    greedy_hint_score:
        The greedy-hint's objective value (or a tight lower bound on it).
        The stagnation trigger fires only after the search has reached
        this floor — before that, we want CP-SAT to keep searching even
        through long quiet stretches in case it's still climbing.
    stagnation_seconds:
        How many seconds without a new improvement (after the greedy
        floor is matched) before the stagnation trigger fires.
    gap_threshold:
        Relative gap below which the gap trigger fires. ``0.001`` means
        within 0.1 % of the best bound.
    min_runtime_seconds:
        How many seconds the search must run before the gap trigger is
        eligible. Prevents an early halt when the bound is trivially
        equal to the initial value (e.g. on degenerate fixtures).
    cancel_flag:
        Optional ``threading.Event`` checked at the top of every
        solution callback. When set, halt with
        ``reason='cancelled'``. Used by the sidecar's registry so
        ``DELETE /solve/{request_id}`` can cooperatively halt an
        in-flight solve without tearing down the process.
    """

    def __init__(
        self,
        greedy_hint_score: int,
        stagnation_seconds: float = 8.0,
        gap_threshold: float = 0.001,
        min_runtime_seconds: float = 2.0,
        cancel_flag: threading.Event | None = None,
    ) -> None:
        super().__init__()
        self._greedy_hint_score = greedy_hint_score
        self._stagnation_seconds = stagnation_seconds
        self._gap_threshold = gap_threshold
        self._min_runtime_seconds = min_runtime_seconds
        self._cancel_flag = cancel_flag
        self._best_objective: float | None = None
        self._last_improvement_wall: float = 0.0
        self._triggered = False
        self._reason: EarlyStopReason = "not_triggered"

    @property
    def triggered(self) -> bool:
        return self._triggered

    @property
    def reason(self) -> EarlyStopReason:
        return self._reason

    def OnSolutionCallback(self) -> None:  # noqa: N802 — CP-SAT API
        """Called on every new solution CP-SAT discovers."""
        # ── Trigger 0: external cancellation request ─────────────────────
        # Checked first so a DELETE /solve/{id} during an active solve halts
        # on the next callback regardless of the objective trajectory. The
        # cancel-flag path doesn't rely on the greedy floor or gap bound.
        if self._cancel_flag is not None and self._cancel_flag.is_set():
            self._triggered = True
            self._reason = "cancelled"
            self.stop_search()
            return

        try:
            current = self.objective_value
        except RuntimeError:
            # No objective set on the model — nothing to compare against.
            return

        wall = self.wall_time

        # Track best + last improvement.
        improved = self._best_objective is None or current > self._best_objective
        if improved:
            self._best_objective = current
            self._last_improvement_wall = wall

        # ── Trigger 1: stagnation past greedy floor ──────────────────────
        if (
            self._best_objective is not None
            and self._best_objective >= self._greedy_hint_score
            and (wall - self._last_improvement_wall) >= self._stagnation_seconds
        ):
            self._triggered = True
            self._reason = "stagnation"
            self.stop_search()
            return

        # ── Trigger 2: relative-gap closure ──────────────────────────────
        if wall < self._min_runtime_seconds:
            return
        try:
            best_bound = self.best_objective_bound
        except RuntimeError:
            return
        if self._best_objective is None:
            return
        denom = max(1.0, abs(self._best_objective))
        gap = (best_bound - self._best_objective) / denom
        if gap < self._gap_threshold:
            self._triggered = True
            self._reason = "gap"
            self.stop_search()


__all__ = ["EarlyStopCallback", "EarlyStopReason"]
