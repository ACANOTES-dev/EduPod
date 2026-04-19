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
import time
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
        # Wall-clock timestamp (``time.monotonic()``) of the last time we
        # ENTERED ``OnSolutionCallback``, regardless of whether it produced
        # an improvement. The WallClockWatchdog below reads this from another
        # thread to detect "CP-SAT has gone quiet" — which the
        # callback-gated stagnation trigger cannot observe because CP-SAT
        # only fires the callback on *strict improvements*. Without the
        # watchdog, a plateau run burns the full budget and — on teardown —
        # frequently crashes the child process (SOLVER_CRASH observed on
        # NHQS pilot 2026-04-17, run 5a38a832). Initialised at construction
        # time so the "time since last callback" measurement from the
        # watchdog is meaningful even if the callback never fires at all.
        self._last_callback_monotonic: float = time.monotonic()
        self._triggered = False
        self._reason: EarlyStopReason = "not_triggered"
        # SCHED-041 §A telemetry — trajectory captured on the fly so the
        # post-solve diagnostics can distinguish "CP-SAT found its first
        # feasible at 3ms" from "CP-SAT took 47s to find one and then
        # never improved". ``improvements_found`` counts strictly-better
        # objective values seen — 0 is the SCHED-041 plateau signature.
        self._first_solution_objective: float | None = None
        self._first_solution_wall_time: float | None = None
        self._improvements_found = 0

    @property
    def triggered(self) -> bool:
        return self._triggered

    @property
    def reason(self) -> EarlyStopReason:
        return self._reason

    @property
    def first_solution_objective(self) -> float | None:
        return self._first_solution_objective

    @property
    def first_solution_wall_time(self) -> float | None:
        return self._first_solution_wall_time

    @property
    def improvements_found(self) -> int:
        return self._improvements_found

    @property
    def last_callback_monotonic(self) -> float:
        """Monotonic timestamp of the most recent callback entry.

        Read by :class:`WallClockWatchdog` from a daemon thread. The
        callback-gated triggers below only fire when CP-SAT actually
        invokes the callback — this timestamp lets an outside observer
        detect "callback hasn't fired in N seconds" even on plateau
        runs where CP-SAT stops producing improvements entirely.
        """
        return self._last_callback_monotonic

    def mark_watchdog_triggered(self) -> None:
        """Record that the wall-clock watchdog halted the search.

        Called by :class:`WallClockWatchdog` just before it invokes
        ``solver.stop_search()``. Sets ``triggered = True`` and
        ``reason = 'stagnation'`` so the post-solve telemetry surfaces
        the halt reason consistently with the callback-driven path.
        """
        if not self._triggered:
            self._triggered = True
            self._reason = "stagnation"

    def OnSolutionCallback(self) -> None:  # noqa: N802 — CP-SAT API
        """Called on every new solution CP-SAT discovers."""
        # Watchdog heartbeat — must happen BEFORE any early-return so the
        # wall-clock watchdog sees the callback ran even when it doesn't
        # produce an improvement.
        self._last_callback_monotonic = time.monotonic()
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

        # SCHED-041 §A — record first solution arrival time the very first
        # time the callback fires with a valid objective. Needed to tell
        # "CP-SAT accepted the hint and started at greedy score immediately"
        # from "CP-SAT rejected the hint and took 47s to find its own
        # first feasible". The hint-accepted case is the 320/393 plateau
        # symptom; the hint-rejected case is a different problem.
        if self._first_solution_objective is None:
            self._first_solution_objective = current
            self._first_solution_wall_time = wall

        # Track best + last improvement.
        improved = self._best_objective is None or current > self._best_objective
        if improved:
            self._best_objective = current
            self._last_improvement_wall = wall
            self._improvements_found += 1

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


class WallClockWatchdog:
    """Daemon thread that calls ``solver.stop_search()`` on silent plateaus.

    CP-SAT only invokes ``OnSolutionCallback`` when it finds a STRICTLY
    IMPROVING solution. On NHQS-shaped inputs the greedy hint is
    typically accepted as the first incumbent and CP-SAT then searches
    unsuccessfully for an improvement for the full ``max_time_in_seconds``
    budget. The callback never fires again, so
    :class:`EarlyStopCallback`'s stagnation trigger cannot see the
    plateau and the solver burns the entire budget — after which its
    native worker threads frequently race the interpreter shutdown and
    crash the child process (exitcode=1, observed 2026-04-17, NHQS run
    5a38a832, 60-minute budget, zero placements persisted).

    This watchdog runs in a background thread and polls
    :attr:`EarlyStopCallback.last_callback_monotonic` every
    ``poll_interval_seconds``. If ``(now - last_callback) > threshold``
    it calls ``solver.stop_search()`` — a thread-safe CP-SAT method —
    and the main solve returns with the current incumbent. Because the
    watchdog uses ``time.monotonic()`` instead of CP-SAT's wall clock,
    it works even when CP-SAT has stopped ticking the solution
    callback entirely.

    Usage::

        watchdog = WallClockWatchdog(solver, callback, threshold_seconds=80)
        watchdog.start()
        try:
            status = solver.solve(model, callback)
        finally:
            watchdog.stop()
    """

    def __init__(
        self,
        solver: cp_model.CpSolver,
        callback: EarlyStopCallback,
        threshold_seconds: float,
        poll_interval_seconds: float = 2.0,
    ) -> None:
        if threshold_seconds <= 0:
            raise ValueError("threshold_seconds must be positive")
        self._solver = solver
        self._callback = callback
        self._threshold = threshold_seconds
        # Poll interval bounded below by ``threshold / 8`` so the actual
        # stop-fire happens within ~12 % of the target threshold even on
        # very short thresholds used in tests. Bounded above by 5 s so
        # production (threshold ~80 s) isn't polling wastefully often.
        self._poll_interval = min(max(poll_interval_seconds, threshold_seconds / 8), 5.0)
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._fired = False

    @property
    def fired(self) -> bool:
        """True iff the watchdog called ``solver.stop_search()``."""
        return self._fired

    def start(self) -> None:
        if self._thread is not None:
            raise RuntimeError("WallClockWatchdog already started")
        self._thread = threading.Thread(
            target=self._run,
            name="solver-wall-clock-watchdog",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        thread = self._thread
        if thread is not None and thread.is_alive():
            # Short join so we don't stall the caller's post-solve path.
            # The thread is a daemon, so a missed join won't keep the
            # interpreter alive past teardown.
            thread.join(timeout=self._poll_interval * 2)
        self._thread = None

    def _run(self) -> None:
        while not self._stop_event.wait(self._poll_interval):
            silent_for = time.monotonic() - self._callback.last_callback_monotonic
            if silent_for >= self._threshold:
                self._fired = True
                self._callback.mark_watchdog_triggered()
                # ``stop_search`` is documented as thread-safe on CpSolver.
                # The main solve() returns on the next internal check —
                # typically within a few hundred milliseconds.
                self._solver.stop_search()
                return


__all__ = ["EarlyStopCallback", "EarlyStopReason", "WallClockWatchdog"]
