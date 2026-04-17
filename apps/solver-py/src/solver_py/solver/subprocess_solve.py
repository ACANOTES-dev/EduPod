"""Crash-isolated wrapper around ``solve()``.

OR-Tools' CP-SAT C++ layer can (rarely) abort the whole Python process
via ``std::terminate`` when it hits an internal invariant failure —
symptom seen on prod 2026-04-17 was::

    terminate called after throwing an instance of 'std::bad_function_call'
      what():  bad_function_call

A Python ``try/except`` can't catch this; once abort() has been called
the process is going down. Uvicorn dies with it, PM2 restarts, and the
worker that was waiting on ``POST /v3/solve`` gets ``fetch failed`` —
which the Node side surfaces as ``CP_SAT_UNREACHABLE``, misleading
everyone into thinking the network/service is the problem.

This wrapper runs ``solve()`` in a forked child process. If the child
dies with a non-zero exit code (SIGABRT = -6, SIGSEGV = -11, OOM kill,
etc.) we raise :class:`SolverCrashError` and the parent FastAPI
handler returns HTTP 500 with a structured ``SOLVER_CRASH`` code. The
uvicorn process stays alive, the sidecar keeps serving, and the next
solve request lands on a healthy process.

Scope notes
-----------
* We use ``multiprocessing`` with the ``fork`` start method so OR-Tools
  (large C++ footprint) is inherited via copy-on-write and we don't pay
  its import cost on every request. Linux-only — that's fine, prod runs
  on Debian and tests run under Linux CI.
* Cancellation is plumbed through a ``multiprocessing.Event`` which is
  duck-type-compatible with ``threading.Event`` (both expose
  ``is_set()``). EarlyStopCallback calls only ``.is_set()``, so the
  cooperative halt path continues to work across the fork boundary.
* Telemetry capture is optional — when the caller passes
  ``capture_telemetry=True`` the child runs a ``SolverTelemetry`` alongside
  the solve and returns ``telemetry.to_diagnostics()`` as a picklable
  dataclass. Mutating telemetry across a process boundary is impossible;
  callers must use the returned diagnostics object.
"""

from __future__ import annotations

import logging
import multiprocessing as _mp
import pickle
import signal
from dataclasses import dataclass
from typing import Any

from solver_py.schema import SolverInputV2, SolverOutputV2
from solver_py.solver.solve import SolveError, solve
from solver_py.solver.telemetry import SolverTelemetry

logger = logging.getLogger("solver_py.subprocess")

# Module-level fork context so tests can monkeypatch it with a different
# start method (``spawn`` on platforms where fork is unavailable).
_mp_context = _mp.get_context("fork")


class SolverCrashError(RuntimeError):
    """Raised when the solver subprocess terminated abnormally.

    ``exitcode`` follows Python's :attr:`multiprocessing.Process.exitcode`
    convention — negative values indicate signal termination
    (``-signum``), positive values indicate explicit ``sys.exit(code)``.
    """

    def __init__(self, exitcode: int, detail: str = "") -> None:
        signal_name: str | None = None
        if exitcode < 0:
            try:
                signal_name = signal.Signals(-exitcode).name
            except ValueError:
                signal_name = f"signal {-exitcode}"
        self.exitcode = exitcode
        self.signal_name = signal_name
        suffix = f" ({signal_name})" if signal_name else ""
        if detail:
            suffix += f" — {detail}"
        super().__init__(f"solver subprocess terminated abnormally, exitcode={exitcode}{suffix}")


def _child_entrypoint(
    payload_pickle: bytes,
    cancel_event: Any,
    capture_telemetry: bool,
    result_queue: Any,
) -> None:
    """Runs inside the forked child: decode, solve, enqueue, exit."""
    try:
        payload: SolverInputV2 = pickle.loads(payload_pickle)
        telemetry = SolverTelemetry() if capture_telemetry else None
        # cancel_event is an mp.Event; EarlyStopCallback only calls
        # .is_set() on it so duck-typing works across the fork boundary.
        output = solve(payload, cancel_event, telemetry)  # type: ignore[arg-type]
        diagnostics = telemetry.to_diagnostics() if telemetry is not None else None
        result_queue.put(("ok", pickle.dumps((output, diagnostics))))
    except SolveError as exc:
        # Distinct from a crash: the model was indeterminate. Surface the
        # message verbatim so the parent can rewrap as SOLVER_INDETERMINATE.
        result_queue.put(("solve_error", str(exc)))
    except BaseException as exc:  # noqa: BLE001
        # Any other Python-level exception inside the child. Still a
        # controlled return path — the parent will classify it as an
        # INTERNAL_ERROR rather than a crash.
        result_queue.put(("error", f"{type(exc).__name__}: {exc}"))


@dataclass
class SubprocessResult:
    output: SolverOutputV2
    # None when capture_telemetry was False.
    diagnostics: Any | None


def solve_in_subprocess(
    payload: SolverInputV2,
    cancel_event: Any,
    capture_telemetry: bool = False,
) -> SubprocessResult:
    """Run ``solve()`` in a child process; raise on abnormal termination.

    Parameters
    ----------
    payload:
        A picklable ``SolverInputV2`` instance.
    cancel_event:
        A ``multiprocessing.Event`` (or compatible); the child passes it
        to ``EarlyStopCallback`` for cooperative cancellation.
    capture_telemetry:
        When ``True`` the child attaches a :class:`SolverTelemetry` to
        the solve and the returned :class:`SubprocessResult.diagnostics`
        carries the post-solve :class:`SolverDiagnosticsV3`.

    Raises
    ------
    SolveError:
        The solver returned an indeterminate verdict (MODEL_INVALID,
        UNKNOWN without feasible). Same semantics as calling ``solve()``
        directly.
    SolverCrashError:
        The child process exited abnormally (SIGABRT / SIGSEGV / OOM /
        explicit sys.exit(nonzero)). The parent must NOT retry with the
        same payload without investigation — a deterministic C++ crash
        will repeat indefinitely. Use the dump-scheduling-run-snapshot
        script to capture the payload for offline debugging.
    RuntimeError:
        The child reported a non-SolveError Python exception. Wrapped
        with the class name so the cause is visible in logs.
    """
    q: Any = _mp_context.Queue(maxsize=1)
    proc = _mp_context.Process(
        target=_child_entrypoint,
        args=(pickle.dumps(payload), cancel_event, capture_telemetry, q),
        daemon=True,
    )
    proc.start()
    proc.join()

    exitcode = proc.exitcode if proc.exitcode is not None else -1

    if exitcode != 0:
        # Child died — either a C++ abort (negative exitcode) or a Python
        # sys.exit(nonzero). We don't try to read the queue because a
        # crash may have left it in an inconsistent state.
        logger.error(
            "solver subprocess terminated abnormally",
            extra={"exitcode": exitcode},
        )
        raise SolverCrashError(exitcode)

    if q.empty():
        # Clean exit but no result enqueued — shouldn't happen unless
        # _child_entrypoint itself was killed between the final except
        # and the queue put. Treat as a crash for safety.
        raise SolverCrashError(-1, detail="child exited cleanly without enqueueing a result")

    tag, data = q.get()
    if tag == "ok":
        output, diagnostics = pickle.loads(data)
        return SubprocessResult(output=output, diagnostics=diagnostics)
    if tag == "solve_error":
        raise SolveError(data)
    # tag == "error" — any other Python exception
    raise RuntimeError(f"solver subprocess raised: {data}")


__all__ = ["SolverCrashError", "SubprocessResult", "solve_in_subprocess"]
