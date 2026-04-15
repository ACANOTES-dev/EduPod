"""Smoke tests for /health and /solve.

Stage 1 covered the bare endpoint shapes. Stage 2 wired the /solve stub
to parse the SolverInputV2 contract — invalid bodies now error at
pydantic with HTTP 422; only a structurally valid payload reaches the
501 NOT_IMPLEMENTED path.
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


def test_solve_returns_501_when_input_parses() -> None:
    payload = json.loads(FIXTURE_PATH.read_text())
    response = client.post("/solve", json=payload)
    assert response.status_code == 501
    body = response.json()
    assert body["error"]["code"] == "NOT_IMPLEMENTED"


def test_solve_returns_422_when_input_is_bogus() -> None:
    response = client.post("/solve", json={"bogus": True})
    assert response.status_code == 422
    body = response.json()
    assert "detail" in body
