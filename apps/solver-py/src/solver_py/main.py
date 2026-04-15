"""FastAPI entry point for the OR-Tools CP-SAT scheduling sidecar.

Stage 1 scaffold: serves /health and a stubbed /solve route. The real
CP-SAT model lands in Stage 3.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from solver_py import __version__
from solver_py.config import settings
from solver_py.schema import SolverInputV2
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


@app.middleware("http")
async def request_logging_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
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
async def solve_endpoint(payload: SolverInputV2) -> JSONResponse:
    logger.info(
        "received solve request",
        extra={
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
        result = solve(payload)
    except SolveError as exc:
        logger.exception("solver could not decide")
        return JSONResponse(
            status_code=500,
            content={
                "error": {"code": "SOLVER_INDETERMINATE", "message": str(exc)},
            },
        )
    logger.info(
        "solve complete",
        extra={
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
