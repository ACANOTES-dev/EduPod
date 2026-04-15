"""Smoke tests for /health and /solve.

Stage 3 wired ``/solve`` to a real CP-SAT model. Valid input → 200 with
a ``SolverOutputV2`` body. Invalid input → 422 with pydantic detail.
The Stage 2 minimal fixture is over-demanded (curriculum exceeds the
2-slot grid) — so it still parses cleanly and the solver returns a
graceful response with the curriculum lessons in ``unassigned``.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from solver_py.main import app

client = TestClient(app)
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "solver_input_minimal.json"


def test_health_returns_200_and_version() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "version" in body


def test_solve_returns_200_with_solver_output_envelope() -> None:
    """Stage-2 fixture is intentionally over-demanded — the solver responds
    with a ``SolverOutputV2`` whose ``unassigned`` list explains why each
    lesson couldn't be placed. The body shape is what matters here."""
    payload = json.loads(FIXTURE_PATH.read_text())
    response = client.post("/solve", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert "entries" in body
    assert "unassigned" in body
    assert "constraint_summary" in body
    assert isinstance(body["duration_ms"], int)
    # Stage 6 observability contract — every response carries a CP-SAT status.
    assert body["cp_sat_status"] in {"optimal", "feasible", "infeasible", "unknown"}
    # The pinned class-A maths cell passes through.
    assert any(e["is_pinned"] for e in body["entries"])
    # Remaining curriculum demand can't fit the 1-slot teaching grid.
    assert len(body["unassigned"]) > 0


def test_solve_returns_422_when_input_is_bogus() -> None:
    response = client.post("/solve", json={"bogus": True})
    assert response.status_code == 422
    body = response.json()
    assert "detail" in body
