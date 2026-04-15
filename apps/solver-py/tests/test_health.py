"""Smoke tests for the Stage 1 scaffold."""

from __future__ import annotations

from fastapi.testclient import TestClient

from solver_py.main import app

client = TestClient(app)


def test_health_returns_200_and_version() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "version" in body


def test_solve_stub_returns_501_not_implemented() -> None:
    response = client.post("/solve", json={})
    assert response.status_code == 501
    body = response.json()
    assert body["error"]["code"] == "NOT_IMPLEMENTED"
