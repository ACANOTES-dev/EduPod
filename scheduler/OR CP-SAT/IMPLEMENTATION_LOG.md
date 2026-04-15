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
| 3   | CP-SAT model — hard constraints    | `complete` | 2026-04-15           | per-cell BoolVars; all 16 hard constraints + supervision; 18 pytest tests  |
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

---

### Stage 3 — CP-SAT model: hard constraints

**Completed:** 2026-04-15
**Local commit(s):** _backfilled in the next commit — see the `feat(scheduling): cp-sat hard-constraint model` commit_
**Deployed to production:** no — Stage 3 is local-only; sidecar deploys at Stage 7.

**Variable shape — chosen and why:**

Per-lesson **boolean cells** with aggressive variable-generation pruning. For every legal `(lesson, slot, teacher, room)` tuple we allocate one `BoolVar`. Each hard constraint becomes a single linear sum (`<= 1` for no-overlap, `<= cap` for caps, `== placed[l]` for demand). Trade-off vs. the doc's recommended 3D `IntVar` (`teaches[c, s, p] = IntVar(0, num_teachers)`):

- The legacy already does pin/pool resolution at variable-generation time (`resolveTeacherCandidates` in `domain-v2.ts`). Booleans let us mirror that: one variable per legal tuple, none per illegal one. The 3D-int shape would force room-type matching and per-slot availability through `OnlyEnforceIf` chains, which CP-SAT handles less efficiently than direct sums.
- Booleans make double-period pairing trivial: `model.add(x[anchor_la] == x[follower_la])` for each compatible (teacher, room, consecutive-slot) match.
- Cost: more variables on dense problems. Mitigated by the pruning step (see counts below).

**What was delivered:**

- `apps/solver-py/src/solver_py/solver/` package with five focused modules:
  - `slots.py` — flattens every year-group's grid into a global `PhysicalSlot` list with wall-clock equivalence groups (`time_group_id`). Two slots in different year-groups whose intervals overlap share one `time_group_id`, so teacher no-overlap fires across grids — same semantics as the legacy `checkTeacherDoubleBookingV2`. Also exposes `adjacent_classroom_break_window` for the `classroom_previous` / `classroom_next` availability extension.
  - `lessons.py` — generates one `Lesson` per period of demand. Resolves SCHED-023 class-subject overrides (a `class_id != null` curriculum entry supersedes the year-group baseline for that class only). Subtracts pinned periods from each `(class, subject)` demand. Emits double-period lessons in pair anchors (so the pair index lives inline in the lesson).
  - `pruning.py` — for every `Lesson` returns the set of legal `(slot_id, teacher_idx, room_idx)` tuples honouring competency (with pin/pool resolution mirroring `resolveTeacherCandidates`), availability (with classroom-break adjacency), required room type, room closures (blunt: any room in any closure window is excluded for the whole week, matching v2 legacy), and `period_type == "teaching"`. Lessons whose legal set is empty come back with a per-lesson diagnostic for the `unassigned` payload.
  - `model.py` — builds the `CpModel`. Eight constraint sections, all sectioned with comment dividers: per-lesson placement (gated by a `placed[l]` indicator), subject `max_periods_per_day` per `(class, subject, weekday)`, class no-overlap per `time_group_id`, exclusive-room no-overlap per `time_group_id`, teacher caps (`max_periods_per_week` and `max_periods_per_day`), double-period channel (anchor `==` follower at matching teacher/room/consecutive-slot), yard-break supervision (per-slot staffing `==` required count, supervision-duty cap per teacher), and combined teacher no-overlap per `time_group_id` that sums teaching + supervision + pinned load against the single ≤ 1 budget.
  - `solve.py` — orchestrator. Builds slots → lessons → pruned legal set → `CpModel`, configures the solver (`max_time_in_seconds = settings.max_solver_duration_seconds`, `random_seed = settings.solver_seed or 0`, `num_search_workers = 1` per the doc's determinism requirement), translates the solver state into a `SolverOutputV2`. Pinned entries pass through verbatim into `entries`; placed lessons become `SolverAssignmentV2`; unplaced lessons become `UnassignedSlotV2` with a reason. `MODEL_INVALID` and `UNKNOWN` are surfaced as `SolveError` (HTTP 500 envelope).
- `apps/solver-py/src/solver_py/main.py` — `/solve` now calls `solve()` and returns 200 with the `SolverOutputV2` body. `SolveError` becomes `{ "error": { "code": "SOLVER_INDETERMINATE", "message": ... } }` with HTTP 500.
- 18 pytest tests across five files exercising: basic feasibility, SCHED-023 overrides, required room type, pinned passthrough, determinism (same seed → same output across two runs), demand-exceeds-capacity → unassigned, no-competent-teacher → unassigned, no-matching-room-type → unassigned, double-period anchor + follower placed consecutively with same teacher and room, yard-break supervision staffing, supervision-duty cap. Plus a shared `tests/_builders.py` helper.
- `apps/solver-py/tests/test_health.py` updated: the Stage-2 minimal fixture (deliberately over-demanded — only one teaching slot in the grid) now returns 200 with the expected `SolverOutputV2` envelope, the pinned class-A maths cell passing through and the remaining curriculum demand surfacing as `unassigned`.

**Files changed (high level):**

- `apps/solver-py/src/solver_py/solver/__init__.py` — `solve` and `SolveError` exports.
- `apps/solver-py/src/solver_py/solver/slots.py` — slot enumeration + wall-clock equivalence + classroom-break adjacency.
- `apps/solver-py/src/solver_py/solver/lessons.py` — lesson generation with override + pinned + double-period handling.
- `apps/solver-py/src/solver_py/solver/pruning.py` — legal-tuple pruning + per-lesson diagnostics.
- `apps/solver-py/src/solver_py/solver/model.py` — `CpModel` construction (eight constraint sections, ~400 lines).
- `apps/solver-py/src/solver_py/solver/solve.py` — orchestrator + status translation.
- `apps/solver-py/src/solver_py/main.py` — `/solve` wired to `solve()`.
- `apps/solver-py/tests/_builders.py` — shared test fixture builder.
- `apps/solver-py/tests/test_solve_feasible.py`, `test_solve_infeasible.py`, `test_solve_double_period.py`, `test_solve_supervision.py` — per-tier and per-constraint tests.
- `apps/solver-py/tests/test_health.py` — updated Stage-2 fixture smoke from 501 to 200.
- `scheduler/OR CP-SAT/IMPLEMENTATION_LOG.md` — status board + this entry.

**Tests added / updated:**

- unit (Python / pytest): 13 new across 4 files; 1 updated in `test_health.py`. Total in `apps/solver-py`: 18 tests, all green.
- unit (TS): 0 new, 0 updated — TS side untouched.
- parity: n/a — Stage 5.
- stress re-run: n/a — Stage 9.
- coverage delta: solver package coverage starts here; 5 modules with end-to-end exercise via the per-tier tests (every constraint section has at least one test that fires it).

**Variable counts on the canonical fixtures:**

- minimal Stage-2 fixture (over-demanded; 7 lessons after pinned subtraction, 1 teaching slot): legal tuples = 4 (only class-B can place, and only against the one slot pinned to class-A).
- minimal-feasible (1 class, 1 subject, 3 lessons, 5×4 grid): legal = 60 (3 lessons × 20 teaching slots × 1 teacher × 1 room).
- 2-class override (2 classes, 1 subject, 8 lessons after override resolution, 5×4 grid, 2 teachers, 2 rooms): legal ≈ 320.
- 3-subject single-class (1 class, 3 subjects, 9 lessons, 5×4 grid): legal = 180.
- realistic baseline (10 classes, 8 subjects, 5×6 grid, 20 specialist teachers, 15 rooms): pruned legal = 270K. **Single-worker CP-SAT does not converge in 30 s on this size** — see the surprises section.

**Performance measurements (5-run median; single worker; seed=42):**

- minimal-feasible (3 lessons): p50 = 1 ms, p95 = 3 ms, 100 % placed.
- 2-class SCHED-023 override (8 lessons): p50 = 13 ms, p95 = 14 ms, 100 % placed.
- 3-subject single-class (9 lessons): p50 = 6 ms, p95 = 6 ms, 100 % placed.
- yard-supervision fixture (2 teaching + 2 supervision lessons): under 5 ms (assertion-bounded).
- double-period fixture (2 lessons, paired): under 10 ms.
- realistic baseline (10c × 8s × 5×6, 240 lessons, 270 K legal): single-worker CP-SAT returns `UNKNOWN` after 30 s. With `num_search_workers = 8` and a no-op all-zeros hint it reaches `FEASIBLE` (128/240 placements) in 10 s. Speed tuning is explicitly Stage 4/5 territory per the stage doc.

**Verification evidence:**

- `ruff check src tests` → "All checks passed!"
- `mypy --strict src` → "Success: no issues found in 12 source files".
- `pytest -v` → 18 passed in 0.37 s.
- `curl -X POST http://localhost:5557/solve` against:
  - the minimal Stage-2 fixture → HTTP 200, 2 entries (1 pinned + 1 placed for class-B), 7 unassigned, score 1/4, duration_ms = 2.
  - a feasible single-class three-subject fixture → HTTP 200, 9 entries, 0 unassigned, score 9/9, duration_ms = 7.

**Surprises / decisions / deviations from the plan:**

- **Variable shape locked to per-cell booleans, not 3D `IntVar`.** Documented above. The boolean shape lets pin/pool resolution and competency live entirely in pruning, which keeps the CP-SAT model linear and clean. The 3D-int shape is the cleaner formulation for a from-scratch design but doesn't map as well onto the legacy's existing semantics.
- **Module split is shallower than the doc suggests.** The doc proposes `hard_constraints.py` with one function per constraint and a pytest each. I bundled all eight constraint groups into `model.py` with section dividers (the constraint logic is mostly two-line linear sums — splitting into eight files for that would be busywork) and put per-constraint behaviour into separate test files instead. Tests are what really prove the constraints fire.
- **Graceful degradation via `placed[l]` indicator + `Maximize`.** The doc's "0 hard violations OR returns UNSAT cleanly" wording reads strict — but Stage 5 parity will need to match the legacy's partial-output behaviour on over-demanded inputs. So Stage 3 introduces a boolean `placed[l]` with `sum(x[la]) == placed[l]`, and an objective `maximize sum(placed) + sum(supervision_filled)`. This is a degenerate "soft" objective (placement count, not preference scoring) — Stage 4 will dominate it with a much larger coefficient and add real preference terms on top. Note in PR review: this means a tenant whose demand can't fit gets a partial schedule rather than HTTP 500.
- **Combined teacher no-overlap built last, not first.** Section H of `model.py` waits until both teaching legal-tuple booleans (§A) and supervision booleans (§G) exist, then issues the per-`(teacher_idx, time_group_id)` budget constraint over their union plus pinned load. Doing it earlier would force two separate constraints (one for teaching, one mixed with supervision); doing it last gives a single tight constraint — better for CP-SAT presolve.
- **Room closures stay blunt.** The legacy excludes any room appearing in `room_closures` for the entire week. The stage doc suggests refining to per-(weekday, period_order) blocked sets within the closure date range. I kept the legacy semantics for Stage 3 — Stage 5 parity is easier this way. Refinement is filed as a Stage 10/11 contract-reshape concern.
- **Single-worker CP-SAT struggles on the realistic baseline (240 lessons, 270K legal tuples).** With `num_search_workers = 1` and `max_time_in_seconds = 30`, the realistic baseline returns `UNKNOWN`. The stage doc explicitly says single worker for dev determinism and defers tuning to Stage 5. On 8 workers it reaches `FEASIBLE` 128/240 in 10 s; the model is correct, the search just hasn't been tuned. Kept single-worker so the Stage 5 parity tests have a stable starting point — Stage 5 will introduce deterministic parallel mode (CP-SAT supports `interleave_search` with seed for parallel determinism) and presolve tuning.
- **`UNKNOWN` is surfaced as `SolveError` → HTTP 500.** Different from `INFEASIBLE` (which produces a 200 with everything in `unassigned`). For the worker integration in Stage 6 this means the BullMQ job will retry on `UNKNOWN`. Once Stage 4/5 tuning lands, `UNKNOWN` should become rare; if it remains common in production, the model needs more tuning, not the worker.
- **OR-Tools API uses snake_case in the public stubs** (`new_bool_var`, `add`, `maximize`, `solve`, `value`) but exposes both schemes at runtime. Both the public docs and old examples use camelCase (`NewBoolVar`, `Add`, etc.). Switched to snake_case throughout to satisfy `mypy --strict` and follow the future-facing convention. `objective_value` is a property in the new stubs, not a method — easy to miss.
- **Field name collision.** `BuiltModel.cp_model` shadowed the imported `cp_model` module at type-annotation time and broke mypy. Renamed the field to `model`.
- **Pre-commit prettier may reformat the JSON fixture and markdown again on commit** — same story as Stages 1 and 2.

**Known follow-ups / debt created:**

- Speed tuning for realistic baselines — Stage 4/5. Specifically: enable deterministic parallel search (`num_search_workers > 1` with `parameters.interleave_search = true`), tune `parameters.linearization_level`, add solution hints for warm-start.
- Decide in Stage 5 whether `UNKNOWN` should soften to a partial-output 200 rather than a 500. Hinges on parity-test behaviour against the legacy on hard inputs.
- Room closures should eventually become per-(weekday, period_order) blocked sets within the closure date range — Stage 10/11 contract reshape.
- The Stage-3 "placed[l] indicator + Maximize" mechanism is a placement-count objective. Stage 4 must combine it with preference scoring such that placement weight strictly dominates (a placed lesson with 0 satisfied preferences must score higher than an unplaced lesson with all preferences satisfied).
- Constraint coverage on the test suite: every constraint group fires at least once but combinations (e.g. double-period + teacher cap saturating + supervision sharing the same teacher) aren't combinatorially exercised. Stage 5 parity will catch most combinatorial gaps via the legacy comparison; we may want a hypothesis-based property test in Stage 9.
