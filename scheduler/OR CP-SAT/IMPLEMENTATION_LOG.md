# OR-Tools CP-SAT Migration — Implementation Log

**This file is the shared state across every session that works on this migration.** Read it before starting. Update it the moment you finish your stage.

## Before you start a stage

1. Check the status board below. Find the first stage with status `pending` whose prerequisites are all `complete`.
2. If no such stage exists, stop. The work is either finished or the next stage is blocked.
3. Open `implementations/stage-N.md` for that stage.
4. Do the work.
5. Run all tests required by the stage doc — including parity / stress re-runs where applicable.
6. Append your completion entry to the matching section below.
7. Flip the status on the board from `pending` → `complete`.
8. Stop.

## Session hard rules (repeat of README.md; do not violate)

- **Commit locally only.** `git commit` is fine. `git push`, `gh pr create`, GitHub web UI — forbidden.
- **Deploy via rsync + SSH** to `root@46.62.244.139`, not via GitHub.
- **Direct cutover at Stage 7.** There is no per-tenant feature flag. The sidecar + worker change deploy atomically; every tenant is on CP-SAT from that moment. Parity (Stage 5) is the safety net that authorises cutover. Rollback is `git revert` + rsync.
- **You do not finish without testing.** Parity tests (Stage 5) and stress re-runs (Stage 9) are mandatory — describe which tests were run in your log entry.
- **Update this log in the same session you do the work.** Don't defer.

## Status board

| #   | Stage                              | Status     | Owner (session/date) | Notes                                                                      |
| --- | ---------------------------------- | ---------- | -------------------- | -------------------------------------------------------------------------- |
| 1   | Python sidecar scaffold            | `complete` | 2026-04-15           | FastAPI scaffold; /health 200, /solve stub 501; ruff + mypy + pytest green |
| 2   | JSON contract                      | `pending`  | —                    | —                                                                          |
| 3   | CP-SAT model — hard constraints    | `pending`  | —                    | —                                                                          |
| 4   | CP-SAT model — soft preferences    | `pending`  | —                    | —                                                                          |
| 5   | Parity testing (cutover gate)      | `pending`  | —                    | —                                                                          |
| 6   | Worker IPC integration             | `pending`  | —                    | —                                                                          |
| 7   | Production cutover (atomic deploy) | `pending`  | —                    | —                                                                          |
| 8   | Legacy retire                      | `pending`  | —                    | —                                                                          |
| 9   | Full stress re-run                 | `pending`  | —                    | —                                                                          |
| 10  | Contract reshape                   | `pending`  | —                    | —                                                                          |
| 11  | Orchestration rebuild              | `pending`  | —                    | —                                                                          |

## Parallelisation

**None.** Every stage is strictly sequential. See `PLAN.md` → Stage graph for the reasoning. Do not start a stage whose prerequisites are incomplete.

---

## Completion entries

Each stage appends its own entry here when finished. Use this template exactly:

```
### Stage N — <name>

**Completed:** YYYY-MM-DD
**Local commit(s):** <short SHA> <commit subject>
**Deployed to production:** yes / no — if yes, date and what restarted (api/web/worker/solver-py)

**What was delivered:**
- bullet
- bullet

**Files changed (high level):**
- bullet

**Tests added / updated:**
- unit (TS): N new, M updated — located at <paths>
- unit (Python / pytest): N new, M updated — located at <paths>
- parity: <describe if applicable>
- stress re-run: <which scenarios, outcomes>
- coverage delta: <current> vs <previous>

**Performance measurements (where applicable):**
- solve duration (p50 / p95): <legacy> vs <cp_sat>
- completeness ratio: <legacy> vs <cp_sat>
- memory peak (MB): <cp_sat>

**Verification evidence:**
- <what you actually checked, e.g. pm2 logs, SQL output, curl against sidecar>

**Surprises / decisions / deviations from the plan:**
- anything a later stage needs to know

**Known follow-ups / debt created:**
- anything explicitly left unfinished (should be rare; prefer to not defer)
```

---

### Stage 1 — Python sidecar scaffold

**Completed:** 2026-04-15
**Local commit(s):** _to be filled in by the same commit that lands this entry — see `git log` immediately after_
**Deployed to production:** no — Stage 1 is local-only by design; sidecar deploys at Stage 7

**What was delivered:**

- New `apps/solver-py/` Python 3.12 service: FastAPI app exposing `GET /health` (200, `{"status":"ok","version":"0.1.0"}`) and stub `POST /solve` (501, `{"error":{"code":"NOT_IMPLEMENTED",...}}`).
- Structured JSON logging middleware emitting `request_id`, `method`, `path`, `status_code`, `duration_ms`; `x-request-id` echoed in response headers and generated when absent.
- Global FastAPI exception handler that returns the NestJS-style envelope `{"error":{"code":"INTERNAL_ERROR","message":...}}`.
- `Settings` class (pydantic-settings) reading `SOLVER_PY_PORT` (default 5557) and `LOG_LEVEL` (default INFO).
- Pinned dependencies in `pyproject.toml`; resolved snapshot in `requirements.txt` for the Stage 7 server install.
- Repo-root `.gitignore` extended to exclude `apps/solver-py/.venv/`, `__pycache__/`, `*.egg-info/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`.
- Local README documenting the dev loop, smoke checks, and a pointer to the Stage 7 deploy doc.

**Files changed (high level):**

- `apps/solver-py/pyproject.toml`, `requirements.txt`, `README.md` — package metadata, pinned deps, dev README.
- `apps/solver-py/src/solver_py/__init__.py`, `config.py`, `main.py` — package, settings, FastAPI app.
- `apps/solver-py/tests/__init__.py`, `tests/test_health.py` — pytest smoke for `/health` and `/solve` stub.
- `.gitignore` — Python build/cache artefacts under `apps/solver-py/`.
- `scheduler/OR CP-SAT/IMPLEMENTATION_LOG.md` — status board flip + this entry.

**Tests added / updated:**

- unit (Python / pytest): 2 new — `apps/solver-py/tests/test_health.py` (health 200 + version, solve stub 501 + `NOT_IMPLEMENTED`).
- unit (TS): 0 new, 0 updated — TS side untouched this stage.
- parity: n/a — model lands at Stage 4; parity gate at Stage 5.
- stress re-run: n/a — Stage 9.
- coverage delta: n/a (new package; first tests).

**Performance measurements (where applicable):**

- Cold-start uvicorn → first `/health` round-trip: ~150–300 ms locally (process boot dominates).
- `/health` steady-state latency: < 5 ms (loopback, no work). `/solve` stub returns immediately.
- Real solve durations measured at Stage 5 onward; budget noted in PLAN.md is < 500 ms client-perceived round-trip overhead.

**Verification evidence:**

- `ruff check src tests` → "All checks passed!"
- `mypy --strict src` → "Success: no issues found in 3 source files"
- `pytest -v` → 2 passed in 0.26 s.
- `uvicorn solver_py.main:app --port 5557` boots cleanly; `curl -si /health` returns HTTP 200 with the expected body and `x-request-id` header; `curl -si -X POST /solve -d '{}'` returns HTTP 501 with `{"error":{"code":"NOT_IMPLEMENTED","message":"Stage 3 will implement this"}}`.
- `python -c "from ortools.sat.python import cp_model; cp_model.CpModel(); print('ortools OK')"` succeeds — runtime CP-SAT module loads in the venv (Stage 3 prereq).

**Surprises / decisions / deviations from the plan:**

- Pinned `ortools==9.15.6755` (latest published wheel for Python 3.12 / arm64 at install time). The plan asked for `>=9.11`; 9.15 is within range.
- Used `python -m venv .venv` rather than `uv venv`. `uv` is not installed on this dev machine and the plan accepts either ("`uv venv` or `python -m venv .venv`"). Stage 7 server install must mirror this — plain `python3.12 -m venv .venv && pip install -r requirements.txt` is the documented path.
- Added `pydantic-settings` (pydantic v2 split BaseSettings into a separate package). Not in the stage doc's dep list but required for the `Settings` class the doc asks for.
- Added a second pytest case for the `/solve` stub (501 + `NOT_IMPLEMENTED`) on top of the doc's single `/health` test — the acceptance criteria explicitly require both endpoints to be smoke-testable, so it felt right to lock both in CI from day one.
- Generated `requirements.txt` via `pip freeze --exclude-editable` so Stage 7 has a reproducible install set without needing `pip-compile`.
- Working branch is `wave3-stress-scheduling` (not `main`). Commit lands there per the project's local-only commit policy; the user rebases to `main` on their own cadence.

**Known follow-ups / debt created:**

- None for Stage 1. The `/solve` stub is intentional and is replaced in Stage 3.
- Stage 7 will need: (a) Python 3.12 installed on the production server, (b) a venv at the chosen path, (c) `pm2` entry on port 5557, (d) `pip install -r requirements.txt` matching this snapshot. Flag this when Stage 7 is picked up — `requirements.txt` in this commit is the pinned target.
