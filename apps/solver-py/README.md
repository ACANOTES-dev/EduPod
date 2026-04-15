# solver-py

OR-Tools CP-SAT scheduling sidecar for EduPod. Pure compute, tenant-agnostic, binds
to localhost only — see `scheduler/OR CP-SAT/PLAN.md` for the full architecture.

Stage 1 status: **scaffold only**. `/health` is live; `/solve` returns HTTP 501
with `NOT_IMPLEMENTED`. Real CP-SAT modelling lands in Stage 3.

## Local development

```bash
cd apps/solver-py
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn solver_py.main:app --reload --port 5557
```

Smoke checks:

```bash
curl http://localhost:5557/health   # → 200, {"status":"ok","version":"0.1.0"}
curl -X POST http://localhost:5557/solve -d '{}'  # → 501, NOT_IMPLEMENTED envelope
```

Override the port via `SOLVER_PY_PORT` (default `5557`) and log level via
`LOG_LEVEL` (default `INFO`).

## Tests, lint, type-check

```bash
.venv/bin/pytest          # unit tests
.venv/bin/ruff check src tests
.venv/bin/mypy --strict src
```

All three must pass clean before committing.

## Deploy

Deployment is **not** part of this stage. The sidecar is rolled out alongside the
worker change in Stage 7. See
`scheduler/OR CP-SAT/implementations/stage-7-production-cutover.md` for the rsync

- pm2 procedure (runs as the `edupod` user inside the venv on port 5557, bound to
  localhost only).

## Hard rules

- **Never `git push`** from this folder. Local commits only; deploys go via
  rsync + SSH per `scheduler/OR CP-SAT/README.md`.
- The sidecar never touches the database. It accepts a `SolverInputV2` JSON blob
  and returns a `SolverOutputV2` JSON blob — tenant isolation is enforced before
  the request reaches it.
