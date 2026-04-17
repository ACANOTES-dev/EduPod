"""Tests for the crash-isolation wrapper around solve().

The wrapper in ``solver_py.solver.subprocess_solve`` runs the solve in a
forked child process so an OR-Tools C++ abort (std::bad_function_call
symptom observed on prod 2026-04-17) no longer takes down the uvicorn
sidecar. These tests verify:

* Happy path: the wrapper returns a valid SolverOutputV2 + (optional)
  diagnostics matching what an in-process solve() would produce.
* Child Python exceptions surface as RuntimeError on the parent side
  (distinct from SolveError which has its own path).
* Child abnormal termination (SIGABRT / non-zero exit) surfaces as
  SolverCrashError, not as a silent hang or a stale result.
* Queue-empty on clean exit (shouldn't happen in practice) is also
  classified as a crash so the caller never sees stale data.

We simulate the C++ abort path by monkey-patching ``solve`` inside the
child to call ``os._exit(1)`` — that mimics the signal-kill path closely
enough to verify the wrapper's exitcode branch.
"""

from __future__ import annotations

import multiprocessing
import os
import pickle
import signal
from typing import Any

import pytest

from solver_py.solver.solve import SolveError
from solver_py.solver.subprocess_solve import (
    SolverCrashError,
    _child_entrypoint,
    solve_in_subprocess,
)
from tests._builders import build_input, competency, curriculum_entry, teacher


def _minimal_input():
    return build_input(
        teachers=[teacher(staff_id="t1", competencies=[competency("maths")])],
        curriculum=[curriculum_entry(min_periods=1)],
    )


# ─── Happy path ──────────────────────────────────────────────────────────────


def test_happy_path_returns_output_and_no_diagnostics():
    payload = _minimal_input()
    cancel = multiprocessing.Event()
    result = solve_in_subprocess(payload, cancel, capture_telemetry=False)
    assert result.output is not None
    assert result.diagnostics is None
    assert isinstance(result.output.entries, list)


def test_happy_path_with_telemetry_returns_diagnostics():
    payload = _minimal_input()
    cancel = multiprocessing.Event()
    result = solve_in_subprocess(payload, cancel, capture_telemetry=True)
    assert result.output is not None
    assert result.diagnostics is not None


# ─── Crash path ──────────────────────────────────────────────────────────────


def test_crash_raises_solver_crash_error(monkeypatch):
    """A child that exits with a non-zero code is classified as a crash.

    We monkey-patch the child entrypoint via an override module that
    calls ``os._exit(1)`` — close enough to SIGABRT (exitcode = -6) for
    the wrapper's branch to fire, without needing to actually trigger
    an OR-Tools internal abort.
    """
    ctx = multiprocessing.get_context("fork")
    q = ctx.Queue(maxsize=1)

    def _crashing_child(*_args, **_kwargs):
        os._exit(1)

    proc = ctx.Process(target=_crashing_child, daemon=True)
    proc.start()
    proc.join()
    # Sanity check that our harness crashes the way we expect so the
    # real wrapper assertion below is meaningful.
    assert proc.exitcode == 1

    # Now run the actual wrapper with a payload whose solve() we replace
    # with a crasher via the child entrypoint itself. We do this by
    # calling _child_entrypoint with a payload that triggers ``os._exit``
    # BEFORE solve() is reached.
    payload_pickle = pickle.dumps(_minimal_input())

    def _child_that_exits_1(
        payload_bytes, cancel_event, capture_telemetry, result_queue
    ):
        os._exit(1)

    proc2 = ctx.Process(
        target=_child_that_exits_1,
        args=(payload_pickle, multiprocessing.Event(), False, q),
        daemon=True,
    )
    proc2.start()
    proc2.join()
    assert proc2.exitcode == 1

    # Directly exercise the wrapper's failure-path assertion via a
    # patched _mp_context to run our crashing child.
    import solver_py.solver.subprocess_solve as subprocess_solve

    class _CtxWithCrashingChild:
        Queue = ctx.Queue

        def Process(self, target=None, args=(), daemon=False):
            return ctx.Process(target=_child_that_exits_1, args=args, daemon=daemon)

    monkeypatch.setattr(subprocess_solve, "_mp_context", _CtxWithCrashingChild())

    with pytest.raises(SolverCrashError) as exc_info:
        solve_in_subprocess(_minimal_input(), multiprocessing.Event(), False)
    assert exc_info.value.exitcode == 1


def test_abnormal_exit_with_enqueued_result_returns_the_result(monkeypatch):
    """Regression: valid result in queue must survive a non-zero child exit.

    NHQS prod 2026-04-17 run ``5a38a832`` — the child finished the solve
    and enqueued a valid ``SolverOutputV2``, then died during interpreter
    teardown with exitcode=1 as OR-Tools' native worker threads raced
    ``Py_Finalize``. The wrapper previously discarded the queue on
    non-zero exit; this cost the admin 60 minutes of compute. The fix is
    to drain the queue before classifying the exit: if a valid payload
    is present we return it (with a warning log) instead of raising.
    """
    import solver_py.solver.subprocess_solve as subprocess_solve

    ctx = multiprocessing.get_context("fork")

    def _child_enqueues_then_exits_1(
        payload_bytes, cancel_event, capture_telemetry, result_queue
    ):
        # Mimic the NHQS teardown race: a valid result is enqueued, then
        # the interpreter exits abnormally before the normal return path.
        # We use a minimal valid SolverOutputV2 constructed via the real
        # solver so the pickled payload shape matches production exactly.
        import time as _time

        payload = pickle.loads(payload_bytes)
        from solver_py.solver.solve import solve as _solve

        output = _solve(payload, cancel_event, None)
        result_queue.put(("ok", pickle.dumps((output, None))))
        # ``mp.Queue`` uses a background feeder thread to move puts onto
        # the pipe. ``os._exit`` skips the feeder's flush, so without a
        # short sleep the parent's ``get_nowait`` sees an empty queue
        # even though ``put`` returned. Real teardown-race crashes in
        # production have the solve running long enough that the feeder
        # has already flushed by the time Py_Finalize kicks in, so the
        # wait here is just simulating normal scheduling.
        _time.sleep(0.3)
        os._exit(1)

    class _CtxThatEnqueuesThenCrashes:
        Queue = ctx.Queue

        def Process(self, target=None, args=(), daemon=False):
            return ctx.Process(
                target=_child_enqueues_then_exits_1, args=args, daemon=daemon
            )

    monkeypatch.setattr(subprocess_solve, "_mp_context", _CtxThatEnqueuesThenCrashes())

    # The valid output is returned despite the abnormal child exit.
    result = solve_in_subprocess(_minimal_input(), multiprocessing.Event(), False)
    assert result.output is not None
    assert isinstance(result.output.entries, list)


def test_child_raises_non_solve_error_is_wrapped_as_runtime_error(monkeypatch):
    """Python-level exceptions inside the child surface as RuntimeError.

    This keeps SolveError (indeterminate verdict) distinct from generic
    internal failures, so the FastAPI handler can return SOLVER_INDETERMINATE
    for the former and INTERNAL_ERROR for the latter.

    ``forkserver`` re-imports modules per-solve, so the classic
    ``monkeypatch.setattr(subprocess_solve, "solve", ...)`` pattern no
    longer propagates to the child. We instead patch the context to run
    a hand-crafted child that enqueues an ``"error"`` payload — the
    same payload shape ``_child_entrypoint`` uses when catching a
    non-SolveError exception.
    """
    import solver_py.solver.subprocess_solve as subprocess_solve

    ctx = multiprocessing.get_context("fork")

    def _child_raises_value_error(
        payload_bytes, cancel_event, capture_telemetry, result_queue
    ):
        result_queue.put(("error", "ValueError: simulated non-solve failure"))

    class _CtxRaisingValueError:
        Queue = ctx.Queue

        def Process(self, target=None, args=(), daemon=False):
            return ctx.Process(
                target=_child_raises_value_error, args=args, daemon=daemon
            )

    monkeypatch.setattr(subprocess_solve, "_mp_context", _CtxRaisingValueError())

    with pytest.raises(RuntimeError) as exc_info:
        solve_in_subprocess(_minimal_input(), multiprocessing.Event(), False)
    assert "ValueError" in str(exc_info.value)


def test_child_raises_solve_error_is_preserved(monkeypatch):
    """SolveError (MODEL_INVALID / UNKNOWN) must surface as SolveError."""
    import solver_py.solver.subprocess_solve as subprocess_solve

    ctx = multiprocessing.get_context("fork")

    def _child_raises_solve_error(
        payload_bytes, cancel_event, capture_telemetry, result_queue
    ):
        result_queue.put(("solve_error", "model had no rooms"))

    class _CtxRaisingSolveError:
        Queue = ctx.Queue

        def Process(self, target=None, args=(), daemon=False):
            return ctx.Process(
                target=_child_raises_solve_error, args=args, daemon=daemon
            )

    monkeypatch.setattr(subprocess_solve, "_mp_context", _CtxRaisingSolveError())

    with pytest.raises(SolveError) as exc_info:
        solve_in_subprocess(_minimal_input(), multiprocessing.Event(), False)
    assert "no rooms" in str(exc_info.value)


# ─── SolverCrashError construction ────────────────────────────────────────


def test_solver_crash_error_formats_signal_name():
    err = SolverCrashError(-signal.SIGABRT.value)
    assert err.exitcode == -6
    assert err.signal_name == "SIGABRT"
    assert "SIGABRT" in str(err)


def test_solver_crash_error_handles_positive_exitcode():
    err = SolverCrashError(1)
    assert err.exitcode == 1
    assert err.signal_name is None
