# Stage 1 — Python sidecar scaffold

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 1 is `pending`. If it is already `complete`, stop. If the log shows mid-stage state, reconcile before continuing.

## Purpose

Create a new `apps/solver-py/` Python service with just enough structure to boot, serve a `/health` endpoint, and be deployable. No solving logic yet. This stage proves the ops path — that a Python process can live alongside api/web/worker on the production server without breaking anything.

## Prerequisites

- None inside this plan. This is the first stage.
- External: Python 3.12 installed locally for dev. Production server will get Python via package manager during deploy.

## Commit & deploy discipline (every session, non-negotiable)

- **Commit locally only.** `git commit` is fine; `git push`, `git push --force`, `gh pr create`, or any GitHub web-UI interaction are **forbidden**. `main` is rebased manually every ~2 days — pushing breaks that flow.
- **Deploy via rsync + SSH** directly to `root@46.62.244.139`. Server access is granted for this migration; use it. Never via GitHub Actions or any CI pipeline (a CI run takes ~3 hours and would stall the migration).
- **Acquire the server lock** at `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH, pm2, or rsync action. Release it with a summary when done.

This stage is **local only** — no server deploy, no lock required. Stages 7, 8, 10, 11 are the deploy stages.

---

## Scope — what to create

### A. `apps/solver-py/` directory layout

```
apps/solver-py/
├── pyproject.toml
├── requirements.txt           (generated / pinned)
├── README.md
├── src/
│   └── solver_py/
│       ├── __init__.py
│       ├── main.py             (FastAPI app + routes)
│       └── config.py           (env vars, logging setup)
├── tests/
│   ├── __init__.py
│   └── test_health.py
└── Dockerfile                  (optional — see Stage 7)
```

### B. `pyproject.toml`

```toml
[project]
name = "solver-py"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.30",
  "pydantic>=2.9",
  "ortools>=9.11",
]

[project.optional-dependencies]
dev = [
  "pytest>=8",
  "pytest-asyncio>=0.24",
  "httpx>=0.27",
  "ruff>=0.7",
  "mypy>=1.11",
]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.mypy]
strict = true
python_version = "3.12"
```

### C. `src/solver_py/main.py` — FastAPI skeleton

- Single `GET /health` route returning `{"status": "ok", "version": "0.1.0"}`.
- `POST /solve` exists but stubbed to `{"error": {"code": "NOT_IMPLEMENTED", "message": "Stage 3 will implement this"}}` with HTTP 501.
- Logging: structured JSON via `logging`, configured at app startup. Log `request_id` (generated if absent), method, path, duration, status.
- Global FastAPI exception handler that returns `{ "error": { "code": "INTERNAL_ERROR", "message": str(e) } }` with HTTP 500 — matches the NestJS error envelope shape.

### D. `src/solver_py/config.py`

- Reads `SOLVER_PY_PORT` (default `5557`), `LOG_LEVEL` (default `INFO`).
- Exports a `Settings` class (pydantic BaseSettings).

### E. Local dev workflow

- `uv venv` or `python -m venv .venv` inside `apps/solver-py/`.
- `pip install -e ".[dev]"` installs editable mode.
- `uvicorn solver_py.main:app --reload --port 5557` starts the server.
- Smoke test: `curl http://localhost:5557/health` returns 200 with the version JSON.

### F. `tests/test_health.py`

```python
from fastapi.testclient import TestClient
from solver_py.main import app

def test_health_returns_200_and_version():
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert "version" in r.json()
```

### G. A `README.md` inside `apps/solver-py/`

Short: what this service is (sidecar for OR-Tools CP-SAT scheduling), how to run locally, how tests work, deploy pointer to `scheduler/OR CP-SAT/implementations/stage-7-production-deployment.md`.

## Non-goals for this stage

- **Do not** write CP-SAT constraint modelling code. That's Stage 3.
- **Do not** implement `/solve`. Stub only. Stage 3 fills it in.
- **Do not** integrate with the TypeScript worker. Stage 6.
- **Do not** deploy to production. Stage 7.
- **Do not** define pydantic models for `SolverInputV2` / `SolverOutputV2`. Stage 2.

## Step-by-step

1. Create the directory tree above.
2. Write `pyproject.toml` with pinned OR-Tools (`ortools>=9.11`) and FastAPI.
3. Write `main.py` with `/health` + stub `/solve` routes, structured logging, exception handler.
4. Write `config.py` with `Settings` class.
5. Write `tests/test_health.py`.
6. Locally: `cd apps/solver-py && python -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"`.
7. Run `ruff check src tests` — must pass clean.
8. Run `mypy --strict src` — must pass clean.
9. Run `pytest` — must pass clean. Single test for health.
10. Start the server: `uvicorn solver_py.main:app --port 5557`. Curl `/health`, confirm 200. Curl `/solve` (any body), confirm 501 with `NOT_IMPLEMENTED`.
11. Update `.gitignore` at repo root to exclude `apps/solver-py/.venv/`, `apps/solver-py/**/__pycache__/`, `apps/solver-py/**/*.egg-info/`.
12. Commit locally:

    ```
    feat(scheduling): scaffold solver-py FastAPI sidecar for CP-SAT migration

    New apps/solver-py package — FastAPI app with health route and stub
    /solve route (501 NOT_IMPLEMENTED). Scaffolding only; CP-SAT modelling
    lands in stage 3. Local dev workflow: uv venv + pip install -e .[dev],
    uvicorn on port 5557. Tests: pytest on /health; ruff + mypy strict.

    Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
    ```

13. **Never `git push`. Never `gh pr create`.**

## Testing requirements

### Unit (pytest)

- `test_health.py` — confirms 200 and version field.

### Lint / type

- `ruff check` clean.
- `mypy --strict` clean.

### Manual smoke

- Curl `/health` locally.
- Curl `/solve` with any body — confirm 501 and the error envelope shape.

## Acceptance criteria — the stage is done when

- [ ] `apps/solver-py/` exists with the layout above.
- [ ] `pytest` passes locally.
- [ ] `ruff check` and `mypy --strict` pass locally.
- [ ] `curl localhost:5557/health` returns `{"status":"ok","version":"0.1.0"}`.
- [ ] `curl localhost:5557/solve` returns HTTP 501 with `NOT_IMPLEMENTED` error code.
- [ ] `.gitignore` updated to exclude Python build artefacts.
- [ ] Local commit created. Nothing pushed to GitHub.
- [ ] Completion entry appended to `../IMPLEMENTATION_LOG.md`.

## If something goes wrong

- **`ortools` fails to install on macOS:** it ships prebuilt wheels for Python 3.12 on arm64 and x86_64. If you're on Python 3.13, downgrade. If on Linux aarch64, may need to build from source.
- **Port 5557 in use:** pick another port via `SOLVER_PY_PORT=5558 uvicorn …`. Do not hardcode.
- **mypy complains about FastAPI imports:** install `fastapi` type stubs (`pip install types-fastapi` if it exists, otherwise ignore-imports for just that module).

## What the completion entry should include

Append to `../IMPLEMENTATION_LOG.md` using the template. Include:

- Exact `ortools` version pinned.
- Python version verified on.
- Output of `pytest -v` (trimmed).
- Commit SHA.
- Note whether local Python + pip path was `uv` or venv-based (Stage 7 will need to match).
