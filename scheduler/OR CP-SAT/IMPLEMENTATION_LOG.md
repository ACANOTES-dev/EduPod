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
| 2   | JSON contract                      | `complete` | 2026-04-15           | pydantic v2 mirror of types-v2.ts; round-trip + TS contract test green     |
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
**Local commit(s):** `a2d6f566` feat(scheduling): scaffold solver-py FastAPI sidecar for CP-SAT migration
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

---

### Stage 2 — JSON contract (pydantic mirror of SolverInputV2 / SolverOutputV2)

**Completed:** 2026-04-15
**Local commit(s):** `82af1e0f` feat(scheduling): define solver i/o contract as pydantic v2 models
**Deployed to production:** no — Stage 2 is local-only; sidecar deploys at Stage 7.

**What was delivered:**

- `apps/solver-py/src/solver_py/schema/` package with strict pydantic v2 mirrors of every published TypeScript type the wire contract carries:
  - **Input** (`schema/input.py`): `PeriodSlotV2`, `YearGroupSection`, `YearGroupInput`, `CurriculumEntry`, `TeacherCompetencyEntry`, `TeacherAvailabilityWindow`, `TeacherPreferenceInput`, `TeacherInputV2`, `BreakGroupInput`, `RoomInfoV2`, `RoomClosureInput`, `PinnedEntryV2`, `StudentOverlapV2`, `ClassRoomOverride`, `ClassSubjectOverrideAudit`, `PreferenceWeights`, `GlobalSoftWeights`, `SolverSettingsV2`, `SolverInputV2`. Literal aliases: `PeriodType`, `SupervisionMode`, `PreferenceType`, `PreferencePriority`.
  - **Output** (`schema/output.py`): `PreferenceSatisfaction`, `SolverAssignmentV2`, `UnassignedSlotV2`, `QualityMetricRange`, `PreferenceBreakdownEntry`, `QualityMetricsV2`, `ConstraintSummary`, `SolverOutputV2`.
  - All 27 models inherit from a `_Strict` base with `model_config = ConfigDict(extra="forbid")` so unknown fields fail loudly at parse time on either side of the wire.
- `/solve` stub now declares `payload: SolverInputV2` so FastAPI parses + validates the request body before the handler runs. On valid input the route logs a structured summary (year_groups / classes / teachers / curriculum_entries / pinned_entries / rooms / break_groups counts) and returns 501 `NOT_IMPLEMENTED` with the message "CP-SAT modelling lands in stage 3; input parsed cleanly." On invalid input FastAPI returns 422 with the standard pydantic `detail` array — Stage 6's TS client treats 422 as a contract bug, not a transient solver failure.
- Canonical fixture at `apps/solver-py/tests/fixtures/solver_input_minimal.json` (3.0 KB / 132 lines) — one year group with two sections, two curriculum entries (one baseline + one class-A override exercising SCHED-023 audit), one teacher with availability, preferences, and both pool + pinned competency entries, one room, one room closure, one break group, one pinned entry, one student overlap, one class-room override. Every optional field is explicitly present (`null` or `[]`) so pydantic round-trip yields byte-identical output.
- Round-trip pytest at `apps/solver-py/tests/test_schema_roundtrip.py` covers four cases: byte-for-byte equality after `model_validate` → `model_dump(mode="json", by_alias=True)`, rejection of unknown top-level field, rejection of unknown nested field (under `settings`), rejection of an invalid `period_type` literal.
- Updated `apps/solver-py/tests/test_health.py` so the `/solve` smoke now covers both the parsed-input → 501 path and the bogus-body → 422 path.
- TypeScript-side contract guard at `packages/shared/src/scheduler/__tests__/cp-sat-contract.test.ts`: loads the same fixture from `apps/solver-py/tests/fixtures/solver_input_minimal.json` (relative-path resolved via `__dirname`), asserts top-level shape, validates every period-grid slot's `period_type` and `supervision_mode` against the documented literal sets, validates every teacher preference's `preference_type` and `priority` against documented literals, asserts the full settings weight-key list, asserts JSON.stringify + parse round-trip equality, and asserts `overrides_applied[].reason === "class_subject_override"`.

**Files changed (high level):**

- `apps/solver-py/src/solver_py/schema/__init__.py`, `schema/input.py`, `schema/output.py` — new pydantic contract package.
- `apps/solver-py/src/solver_py/main.py` — `/solve` now declares `SolverInputV2` body and logs a structured summary.
- `apps/solver-py/tests/fixtures/solver_input_minimal.json` — canonical fixture shared with the TS side.
- `apps/solver-py/tests/test_schema_roundtrip.py` — new (4 tests).
- `apps/solver-py/tests/test_health.py` — updated `/solve` smoke (now: 501 on valid input, 422 on bogus input).
- `packages/shared/src/scheduler/__tests__/cp-sat-contract.test.ts` — new TS guard (6 tests).
- `scheduler/OR CP-SAT/IMPLEMENTATION_LOG.md` — status board flip + this entry.

**Tests added / updated:**

- unit (Python / pytest): 4 new in `test_schema_roundtrip.py` (byte-for-byte round-trip, extra-top-level rejection, extra-nested rejection, invalid-literal rejection); 1 updated + 1 new in `test_health.py` (renamed the old 501 case to `test_solve_returns_501_when_input_parses` using the fixture, added `test_solve_returns_422_when_input_is_bogus`). Total in `apps/solver-py`: 7 tests, all green.
- unit (TS / jest): 6 new in `cp-sat-contract.test.ts` covering top-level shape, period-grid literals, preference literals, settings weight keys, JSON round-trip, and override-audit reason literal. All green.
- parity: n/a (Stage 5).
- stress re-run: n/a (Stage 9).
- coverage delta: solver-py grew from 2 → 7 tests covering every model in the schema package; jest in `@school/shared` grew by one suite (6 tests).

**Performance measurements (where applicable):**

- `pytest` whole-suite wall time: 0.12 s (cold).
- jest `cp-sat-contract` suite wall time: 0.21 s.
- `/solve` round-trip overhead with the minimal fixture (loopback, pydantic parse + log): under a millisecond observable; below curl's reporting resolution. Real solve budget targets land in Stage 5.

**Verification evidence:**

- `ruff check src tests` → clean (one auto-fix on import ordering in `schema/__init__.py` after generation; ruff `--fix` re-sorted the import block alphabetically).
- `mypy --strict src` → "Success: no issues found in 6 source files".
- `pytest -v` → 7 passed in 0.12 s.
- `pnpm --filter @school/shared test -- --testPathPattern=cp-sat-contract` → 6 passed in 0.21 s.
- `curl -si -X POST http://localhost:5557/solve -H 'Content-Type: application/json' -d @apps/solver-py/tests/fixtures/solver_input_minimal.json` → HTTP 501 with `{"error":{"code":"NOT_IMPLEMENTED","message":"CP-SAT modelling lands in stage 3; input parsed cleanly."}}` and `x-request-id` header.
- `curl -si -X POST http://localhost:5557/solve -H 'Content-Type: application/json' -d '{"bogus":true}'` → HTTP 422 with detailed pydantic `detail[]` listing every missing required key plus `extra_forbidden` for the unknown `bogus` key.

**Surprises / decisions / deviations from the plan:**

- **Stage doc named several types that don't exist verbatim in `types-v2.ts`.** The doc lists `TeacherCompetencyInput` / `TeacherAvailabilityWindow` / `TeacherPreferenceInput` / `SolverUnassignedEntry` / `SolverQualityMetrics`; the actual TS names are `TeacherCompetencyEntry` (anonymous availability and preference shapes — promoted to standalone pydantic models on this side and named `TeacherAvailabilityWindow` and `TeacherPreferenceInput` for clarity) / `UnassignedSlotV2` / `QualityMetricsV2`. Followed the TS source as authoritative per the doc's own instruction ("Open `packages/shared/src/scheduler/types-v2.ts` in full. The authoritative types are: ..."). Future stages should treat the type names in `types-v2.ts` as canonical; the stage docs are a guide, not the contract.
- **Stage doc literal sets for `period_type` and `supervision_mode` are stale.** Real values are `'teaching' | 'break_supervision' | 'assembly' | 'lunch_duty' | 'free'` and `'none' | 'yard' | 'classroom_previous' | 'classroom_next'` respectively. The pydantic `Literal[...]` aliases mirror the live TS unions, not the doc snippet. The fixture exercises both `teaching` + `none` and `break_supervision` + `yard` so drift surfaces immediately.
- **Added `ClassRoomOverride` to the input schema** — present in `types-v2.ts` (used by the SCHED-018 room-override path in the legacy solver) but missing from the stage doc's enumerated list. Made it optional in `SolverInputV2` to match the TS `?` and keeps existing input fixtures backward-compatible.
- **`TeacherAvailabilityWindow.from`** — `from` is a Python keyword. Aliased the field to `from_` with `Field(alias="from")` and `populate_by_name=True`; on dump with `by_alias=True` the wire key is `from` so the TS contract is preserved.
- **Round-trip strategy: a "complete" minimal fixture rather than `exclude_none=True` on dump.** pydantic `model_dump` emits every field by default (`null` for absent optionals), which would diverge from a sparse fixture. Filling every optional explicitly in the fixture keeps the round-trip equality check honest and forces the test to exercise every nullable code path. Future fixtures (Stage 5 parity inputs) can choose to omit optionals and use `exclude_none=True` if they want; the contract supports both.
- **Strict everywhere via a `_Strict` base.** `model_config = ConfigDict(extra="forbid")` on every model, not just the root. Slightly stricter than the stage doc's troubleshooting note (which suggests root-only). Trade-off accepted: nested drift fails fast at the cost of needing to explicitly add new fields when extending — that's what we want during a contract migration.
- **TS contract test path-resolves the fixture via `__dirname` rather than copying the JSON.** Single source of truth: there is one fixture file, both ends consume it. If either end's view of the fixture diverges, both tests fail together — which is the point.
- **Pre-commit prettier reformatted `IMPLEMENTATION_LOG.md` with blank lines after `**bold:**` headers.** The log entries below this point follow that style; functionally identical.

**Known follow-ups / debt created:**

- None. Contract is locked; Stage 3 can build the CP-SAT model against it directly.
- Stage 5's parity test will need a richer fixture set (multi-class, multi-day, multi-subject) — the minimal fixture here is a contract guard, not a parity benchmark.
- If `types-v2.ts` ever gains a new field, **both** `cp-sat-contract.test.ts` (literal sets) and `schema/input.py` (or `output.py`) must be updated in the same change. The `extra="forbid"` config will fail the round-trip test at the first sign of divergence — that's the fail-loud pin.
