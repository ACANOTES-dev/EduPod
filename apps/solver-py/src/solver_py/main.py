"""FastAPI entry point for the OR-Tools CP-SAT scheduling sidecar.

Stage 1 scaffold: serves /health and a stubbed /solve route. The real
CP-SAT model lands in Stage 3.

Stage 9.5.1 post-close amendment (2026-04-15): /solve is now an async
handler that delegates the CPU-bound solve to ``asyncio.to_thread`` so
the event loop stays responsive during the solve. An in-process
registry keyed on ``X-Request-Id`` lets ``DELETE /solve/{request_id}``
raise a cooperative cancel flag checked by ``EarlyStopCallback`` on
its next solution callback. Concurrency capped at 1 via
``asyncio.Semaphore(1)`` — memory estimator + concurrent solves are
Part 2 scope.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from solver_py import __version__
from solver_py.config import settings
from solver_py.schema import SolverInputV2
from solver_py.schema.v3 import SolverInputV3
from solver_py.schema.v3.adapters import v2_output_to_v3, v3_input_to_v2
from solver_py.solver import SolveError, solve


class _JsonLogFormatter(logging.Formatter):
    """Minimal JSON line formatter — keeps log shipping tools happy."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, datefmt="%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in ("request_id", "method", "path", "status_code", "duration_ms"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def _configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonLogFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.LOG_LEVEL.upper())


_configure_logging()
logger = logging.getLogger("solver_py")

app = FastAPI(
    title="solver-py",
    version=__version__,
    description="OR-Tools CP-SAT scheduling sidecar for EduPod.",
)


# ─── Cooperative cancellation registry (amendment) ───────────────────────────
#
# Each active /solve registers a ``threading.Event`` keyed on its request_id.
# DELETE /solve/{request_id} sets the flag; EarlyStopCallback checks it on
# every CP-SAT solution callback and calls ``StopSearch()`` when set.
#
# Why in-process: the sidecar is a single pm2 process with a 2 GB memory
# cap and ``asyncio.Semaphore(1)`` concurrency — there is at most one
# solve in-flight at any time on this instance. Distributed registries
# (Redis, etc.) are out of scope until Part 2 introduces multi-solve
# concurrency.
#
# ``_inflight_lock`` protects the dict against concurrent mutation from
# different asyncio tasks. A threading.Lock is sufficient because all
# mutations happen on the asyncio event-loop thread (the dict is
# read/written from the /solve and DELETE handlers, never from inside
# the worker thread running CP-SAT).
_inflight: dict[str, threading.Event] = {}
_inflight_lock = threading.Lock()

# Single-solve concurrency cap. Lifting this requires the Part 2 memory
# estimator so we don't blow past pm2's max_memory_restart under
# simultaneous Tier-3 solves.
_solve_semaphore = asyncio.Semaphore(1)


@app.middleware("http")
async def request_logging_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    # Stash on request.state so downstream handlers don't re-derive it.
    request.state.request_id = request_id
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.exception(
            "request failed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "duration_ms": duration_ms,
            },
        )
        raise
    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    response.headers["x-request-id"] = request_id
    logger.info(
        "request handled",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled exception", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": str(exc)}},
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.post("/solve")
async def solve_endpoint(payload: SolverInputV2, request: Request) -> JSONResponse:
    """Solve a scheduling instance.

    The solve runs in a worker thread via ``asyncio.to_thread`` so the
    event loop can service DELETE /solve/{request_id} concurrently. A
    ``threading.Event`` cancel-flag is registered in ``_inflight`` and
    plumbed into the CP-SAT solution callback — on DELETE the flag is
    set and CP-SAT halts cooperatively on its next callback invocation.

    The registry is keyed on the caller-supplied ``X-Request-Id``
    header. When the header is absent (e.g. manual probes) we mint a
    UUID so the registry always has an addressable key.
    """
    request_id: str = getattr(request.state, "request_id", "") or uuid.uuid4().hex
    cancel_flag = threading.Event()
    with _inflight_lock:
        _inflight[request_id] = cancel_flag

    logger.info(
        "received solve request",
        extra={
            "request_id": request_id,
            "year_groups": len(payload.year_groups),
            "classes": sum(len(yg.sections) for yg in payload.year_groups),
            "teachers": len(payload.teachers),
            "curriculum_entries": len(payload.curriculum),
            "pinned_entries": len(payload.pinned_entries),
            "rooms": len(payload.rooms),
            "break_groups": len(payload.break_groups),
        },
    )

    try:
        async with _solve_semaphore:
            try:
                # ortools 9.15.6755's solver.Solve() releases the GIL
                # (verified via concurrent-thread pytest), so asyncio.to_thread
                # keeps the event loop responsive while CP-SAT is working.
                result = await asyncio.to_thread(solve, payload, cancel_flag)
            except SolveError as exc:
                logger.exception("solver could not decide")
                return JSONResponse(
                    status_code=500,
                    content={
                        "error": {
                            "code": "SOLVER_INDETERMINATE",
                            "message": str(exc),
                        },
                    },
                )
    finally:
        # Unregister on every exit path — success, SolveError, unhandled
        # exception — so a later DELETE for this id returns 404 instead of
        # pointlessly setting a flag no callback will ever read.
        with _inflight_lock:
            _inflight.pop(request_id, None)

    logger.info(
        "solve complete",
        extra={
            "request_id": request_id,
            "entries": len(result.entries),
            "unassigned": len(result.unassigned),
            "score": result.score,
            "max_score": result.max_score,
            "duration_ms": result.duration_ms,
        },
    )
    return JSONResponse(
        status_code=200,
        content=result.model_dump(mode="json"),
    )


@app.delete("/solve/{request_id}")
async def cancel_solve_endpoint(request_id: str) -> JSONResponse:
    """Cooperatively cancel an in-flight solve.

    Sets the matching cancel flag; returns 200 immediately. The actual
    halt happens inside the solver's next solution-callback invocation.

    Returns 404 when the id is unknown — either the solve has already
    completed (and been unregistered), or it was never registered in
    the first place. 404 is the right signal for the worker client
    either way: fire-and-forget, don't retry.
    """
    with _inflight_lock:
        flag = _inflight.get(request_id)
    if flag is None:
        logger.info(
            "cancel request — unknown id",
            extra={"request_id": request_id},
        )
        return JSONResponse(
            status_code=404,
            content={
                "error": {
                    "code": "UNKNOWN_REQUEST_ID",
                    "message": f"No in-flight solve for request_id '{request_id}'",
                },
            },
        )
    flag.set()
    logger.info(
        "cancel flag raised",
        extra={"request_id": request_id},
    )
    return JSONResponse(
        status_code=200,
        content={"cancelled": True, "request_id": request_id},
    )


# ─── V3 endpoint (Stage 10) ─────────────────────────────────────────────────


@app.post("/v3/solve")
async def solve_v3_endpoint(
    payload: SolverInputV3, request: Request
) -> JSONResponse:
    """Solve a scheduling instance using the V3 contract.

    Internally converts V3 input → V2, runs the existing solver, then
    converts V2 output → V3. The V3 contract is CP-SAT-native: integer
    period indices, split demand/preferences, required solve_status and
    early-stop fields, objective_breakdown, room_assignment_source.

    Stage 11 will have assembleSolverInput emit V3 directly; at that
    point this adapter path becomes the only path and /solve (V2) is
    deprecated.
    """
    request_id: str = (
        getattr(request.state, "request_id", "") or uuid.uuid4().hex
    )
    cancel_flag = threading.Event()
    with _inflight_lock:
        _inflight[request_id] = cancel_flag

    logger.info(
        "received v3 solve request",
        extra={
            "request_id": request_id,
            "classes": len(payload.classes),
            "teachers": len(payload.teachers),
            "demand_entries": len(payload.demand),
            "period_slots": len(payload.period_slots),
            "pinned_entries": len(payload.pinned),
            "rooms": len(payload.rooms),
            "break_groups": len(payload.break_groups),
        },
    )

    # Convert V3 → V2 for the existing solver pipeline
    v2_input = v3_input_to_v2(payload)

    try:
        async with _solve_semaphore:
            try:
                v2_result = await asyncio.to_thread(
                    solve, v2_input, cancel_flag
                )
            except SolveError as exc:
                logger.exception("solver could not decide (v3)")
                return JSONResponse(
                    status_code=500,
                    content={
                        "error": {
                            "code": "SOLVER_INDETERMINATE",
                            "message": str(exc),
                        },
                    },
                )
    finally:
        with _inflight_lock:
            _inflight.pop(request_id, None)

    # Convert V2 output → V3
    v3_result = v2_output_to_v3(v2_result, payload)

    logger.info(
        "v3 solve complete",
        extra={
            "request_id": request_id,
            "solve_status": v3_result.solve_status,
            "entries": len(v3_result.entries),
            "unassigned": len(v3_result.unassigned),
            "soft_score": v3_result.soft_score,
            "soft_max_score": v3_result.soft_max_score,
            "duration_ms": v3_result.duration_ms,
        },
    )
    return JSONResponse(
        status_code=200,
        content=v3_result.model_dump(mode="json"),
    )
