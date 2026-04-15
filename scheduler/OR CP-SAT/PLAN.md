# OR-Tools CP-SAT Migration — Plan

## Why this work exists

The existing `solveV2` engine in `packages/shared/src/scheduler/` is a hand-written TypeScript CSP heuristic: greedy assignment with repair and limited backtracking, time-bounded at 120 seconds, wall-clock terminated. It was built quickly and has three structural problems that Wave 1 + Wave 2 stress testing surfaced:

1. **Incomplete placement.** On the smallest tested tenant (20 teachers, 10 classes, 66 curriculum entries, 272 period demand) the solver leaves 49–60 of 272 slots unassigned — an 18–22% miss rate. Admins get a `failed` status (SCHED-017 made sure of that), but no schedule is produced. At the realistic scale of Irish secondary schools (40–80 teachers, 20–40 classes, 200+ curriculum rows) the problem worsens because backtracking depth grows exponentially with the search space.
2. **Non-determinism under seeding.** `solver_seed = 0` does not produce identical output across runs (SCHED-025). The algorithm uses wall-clock termination, so the same input finishes at different points in the search tree.
3. **Unprovable scalability.** Because it's a hand-rolled heuristic, there's no published upper bound on its behaviour at larger scale. The 120s cap already gets hit at the smallest tested input.

Timetabling is **NP-complete**. A hand-rolled heuristic was always going to hit a ceiling. The right fix is a mature constraint solver with decades of engineering behind it — one that treats the problem declaratively and uses lazy clause generation, conflict-driven learning, and portfolio parallel search to find provably optimal or near-optimal solutions. That's OR-Tools CP-SAT.

## The target architecture

### What stays the same

- **`scheduler-orchestration.service.assembleSolverInput(...)`** — the TypeScript function that loads tenant data and produces the `SolverInputV2` JSON object. Unchanged. This is the orchestration layer; CP-SAT consumes its output directly.
- **The `SolverInputV2` / `SolverOutputV2` shape** — these are the contract. The legacy solver and CP-SAT both consume input of this shape and produce output of this shape. Stage 2 formalises it as a versioned JSON schema on both sides.
- **The BullMQ worker pipeline.** `solver-v2.processor.ts` continues to claim runs, run the solver (whichever backend), and persist results in three short transactions. CP-SAT lives inside the "Step 2 — solve" phase, not the transaction boundaries.
- **All RLS and tenant isolation.** CP-SAT is a pure compute layer — it never touches the database. Tenant isolation is enforced before the data reaches it.

### What's new

- **`apps/solver-py/`** — a new Python sidecar service. FastAPI server exposing `POST /solve` which accepts a `SolverInputV2` JSON body and returns a `SolverOutputV2` JSON response. Internally it uses `ortools.sat.python.cp_model` to build and solve the CSP.
- **`pydantic` models** in `apps/solver-py/schema/` that mirror the TypeScript `SolverInputV2` / `SolverOutputV2` types. Single source of truth for the over-the-wire contract, with strict validation on both ends.
- **An HTTP client in `packages/shared/src/scheduler/cp-sat-client.ts`** — thin wrapper around `fetch` that POSTs input, awaits output, handles timeouts, surfaces structured errors.
- **A direct cutover at Stage 7.** The sidecar and the worker change deploy atomically; from that moment on, every tenant is solving via CP-SAT. No per-tenant feature flag. Parity (Stage 5) is the gate that proves CP-SAT is ready; once passed, the project commits fully. Rollback path is `git revert` + rsync redeploy, measured in seconds.
- **A deploy artifact for the sidecar.** pm2-managed Python process on the production server (matches current ops posture of api/web/worker). Chosen in Stage 7.

### The flow, end-to-end

```
Admin clicks Generate
    ↓
API: POST /v1/scheduling/runs/trigger
    ↓
scheduler-orchestration.service.triggerSolverRun
    ├─ prerequisites check (unchanged)
    ├─ assembleSolverInput (unchanged — builds JSON)
    ├─ create scheduling_runs row (config_snapshot = input JSON)
    └─ enqueue BullMQ job (unchanged)
        ↓
Worker: solver-v2.processor.processJob
    ├─ Step 1: claim run (short txn; sets status=running)
    ├─ Step 2: SOLVE
    │   └─ HTTP POST http://localhost:5557/solve  (input JSON)
    │       └─ Python: pydantic parse → build CP-SAT model →
    │                   solver.Solve() → serialise SolverOutputV2
    └─ Step 3: persist results (short txn; updateMany with status=running guard)
```

The whole backend switch is **one function call site** in the worker. Everything around it is untouched.

### Why direct cutover, not feature flag

The feature-flag version of this plan would have kept the legacy TypeScript solver alongside CP-SAT, selected per-tenant via `scheduling.solver_backend`. I chose against it for three reasons:

1. **Parity (Stage 5) is already the safety net.** If CP-SAT demonstrably matches or beats legacy on three scale tiers plus adversarial fixtures before we deploy, the flag is buying very little.
2. **Rsync rollback is near-instant.** Deploys don't go through a three-hour CI pipeline; they're 30-second rsync pushes. `git revert <stage-7-commit> && rsync && pm2 restart worker` restores legacy faster than most feature-flag toggles propagate.
3. **Dual-backend code is maintenance debt.** An `if (backend === 'cp_sat')` branch plus the full legacy solver lingering in the codebase is two orders of magnitude more cognitive load than a single clean integration. Every later change would have to consider both paths.

The trade-off: if a pathological tenant input exposes a CP-SAT model bug in production, every tenant feels it for the rollback window. Parity testing mitigates this. So does Stage 9's full stress re-run before declaring the migration done.

## Stage graph

All stages are **strictly sequential**. Each stage depends on every prior stage being complete. **No parallelisation.** Do not start a stage whose prerequisites are not marked complete in the log.

```
Stage 1: Python sidecar scaffold (FastAPI + ortools + health check; nothing solves yet)
  ↓
Stage 2: JSON contract (pydantic models mirror SolverInputV2/OutputV2; round-trip fixture)
  ↓
Stage 3: CP-SAT model — hard constraints (teacher / class / room no-overlap, competency, availability, curriculum demand)
  ↓
Stage 4: CP-SAT model — soft preferences and scoring (preference weights, spread, gaps, room consistency, workload balance)
  ↓
Stage 5: Parity testing (local side-by-side on identical inputs; CP-SAT must match or beat on every metric — this is the cutover gate)
  ↓
Stage 6: Worker IPC integration (worker always calls the sidecar; lands locally only — prod is not yet ready)
  ↓
Stage 7: Production cutover (atomic deploy: sidecar + worker change push together; every tenant on CP-SAT at once)
  ↓
Stage 8: Legacy retire (delete solver-v2.ts, constraints-v2.ts, domain-v2.ts, soft-scoring-v2.ts and their specs)
  ↓
Stage 9: Full stress re-run (Waves 1, 2, 3 against CP-SAT on stress-a/b/c/d; prove regressions absent, completeness improved)
  ↓
Stage 10: Contract reshape (SolverInputV2/OutputV2 restructured to CP-SAT-native shape; sidecar + client + result_json consumers updated)
  ↓
Stage 11: Orchestration rebuild (assembleSolverInput rewritten from scratch against the new contract; scheduler-orchestration cleaned of SCHED-013…028 scar tissue)
```

### Why sequential

- Stage 2 needs Stage 1's service scaffold to host the pydantic models.
- Stage 3 needs Stage 2's contract to know what shape to model.
- Stage 4 needs Stage 3's hard-constraint model as a base.
- Stage 5 needs a complete CP-SAT model (Stage 4 done) to compare against.
- Stage 6 cannot integrate without a working backend.
- Stage 7 cannot deploy without the client integration of Stage 6.
- Stage 8 cannot delete legacy until Stage 7's cutover is live and stable.
- Stage 9 validates the cutover — must wait until legacy is gone so the one engine is what's measured.
- Stage 10 reshapes the contract; doing it before Stage 7 would mean maintaining two contract shapes during the critical migration window.
- Stage 11 depends on Stage 10's new contract shape. It's the final cleanup.

## Stage summary

| Stage | Name                            | Touches                                                                                                                                    | Proven by                                                                                   |
| ----- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 1     | Python sidecar scaffold         | New `apps/solver-py/` with `pyproject.toml`, FastAPI, `/health`, Dockerfile                                                                | `curl localhost:5557/health` returns 200 locally                                            |
| 2     | JSON contract                   | `apps/solver-py/schema/*.py` pydantic models; round-trip fixture                                                                           | pytest round-trips a `SolverInputV2` fixture without data loss                              |
| 3     | CP-SAT model — hard constraints | `apps/solver-py/solver/*.py` CP-SAT variable + hard constraint builders                                                                    | pytest on 5 fixture inputs; every solution has 0 hard violations OR returns UNSAT cleanly   |
| 4     | CP-SAT model — soft preferences | `apps/solver-py/solver/soft.py`, scoring function, quality metrics                                                                         | pytest — soft score on fixtures matches or exceeds legacy output                            |
| 5     | Parity testing                  | `packages/shared/src/scheduler/__tests__/cp-sat-parity.test.ts`; local double-run against legacy                                           | CP-SAT unassigned ≤ legacy unassigned on 3 scale tiers — **this is the cutover gate**       |
| 6     | Worker IPC integration          | `solver-v2.processor.ts` always calls sidecar; `cp-sat-client.ts`; worker unit tests. No prod deploy yet.                                  | Unit tests pass; local worker hits sidecar; ts + py test suites green                       |
| 7     | Production cutover              | Atomic deploy — rsync sidecar, `pip install`, add `solver-py` to `ecosystem.config.cjs`, rsync worker change, pm2 restart                  | Sidecar online on prod; every tenant solves via CP-SAT end-to-end                           |
| 8     | Legacy retire                   | Delete `solver-v2.ts`, `constraints-v2.ts`, `domain-v2.ts`, `soft-scoring-v2.ts`, their specs                                              | Full `turbo test` green post-deletion; worker simpler                                       |
| 9     | Full stress re-run              | Re-run Wave 1 + Wave 2 + Wave 3 scenarios against CP-SAT backend                                                                           | All scenarios pass; completeness at 100% on realistic input; determinism verified           |
| 10    | Contract reshape                | `SolverInputV2` / `SolverOutputV2` restructured to CP-SAT-native shape; sidecar pydantic models; client; result_json consumers (UI, apply) | Every consumer of `result_json` works against the new shape; Stage 9 scenarios re-pass      |
| 11    | Orchestration rebuild           | `scheduler-orchestration.service.assembleSolverInput` rewritten against the new contract; legacy scar tissue removed                       | New orchestration emits the Stage 10 shape; Stage 9 scenarios re-pass; code surface smaller |

## Target metrics — how we know this migration was worth it

After Stage 9 is complete, the solver must demonstrably hit the following on stress-a with the canonical baseline (20 teachers, 10 classes, 66 curriculum entries):

| Metric                         | Legacy TS solver (baseline) | CP-SAT target       |
| ------------------------------ | --------------------------- | ------------------- |
| Curriculum placed              | 80%                         | 100%                |
| Hard constraint violations     | 0                           | 0                   |
| Solver duration (median)       | 120 s (timeout hit)         | < 10 s              |
| Deterministic under fixed seed | No (SCHED-025)              | Yes                 |
| Scale to 80 teachers           | Unproven                    | < 60 s, 100% placed |

If any of these miss after Stage 9 we treat the migration as incomplete and debug the model before rollout.

## Shared conventions (read once; apply to every stage)

### Tenant isolation and RLS

- CP-SAT is **pure compute** — it never touches the database. Tenant isolation is enforced before data reaches the sidecar.
- The sidecar's `POST /solve` endpoint is **tenant-agnostic** by design. It receives a `SolverInputV2` JSON blob containing only the data the solver needs. No tenant IDs, no user IDs, no credentials.
- Sidecar binds to `localhost` only on the production server. It is never exposed to the internet. Nginx does not proxy to it.
- If a future requirement adds remote solve offloading, that design must revisit this assumption explicitly.

### TypeScript

- Strict mode. No `any`, no `@ts-ignore`, no `as unknown as X` except the single documented RLS-client exception.
- Error handling: `try/catch` blocks must either show a toast (user-triggered) or `console.error('[ServiceName.method]', err)` (background). Empty catches are forbidden.
- All API inputs validated with Zod schemas from `packages/shared`. DTOs are re-exports.

### Python

- Python 3.12 minimum. Use `pyproject.toml` + `uv` or `pip` for dependency management.
- **Type-hinted everywhere.** `mypy --strict` on the sidecar package; CI fails on untyped functions.
- `pydantic` v2 for all request/response shapes. Never pass raw dicts across the HTTP boundary.
- `ruff check` + `ruff format` for lint. No `noqa` suppressions without a documented reason.
- Error handling: FastAPI exception handlers translate internal errors into structured JSON responses `{ "code": "...", "message": "...", "details": {...} }` matching the NestJS error shape.
- No `print`; use `logging` with structured fields.

### Commits

- Conventional commits: `feat(scheduling): ...`, `fix(scheduling): ...`, `refactor(scheduling): ...`.
- Co-author footer: `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`.
- Commit **locally only**. Never `git push`. Never `gh pr create`.

### Deployment

- Rsync source files to `/opt/edupod/app/` on `root@46.62.244.139`. Exclude `.git`, `node_modules`, `.next`, `dist`, `.env`, `.env.local`, `.turbo`, `*.tsbuildinfo`, `__pycache__`, `.venv`.
- After rsync: `chown -R edupod:edupod /opt/edupod/app/`.
- Python sidecar: rsync source, run `pip install -r requirements.txt` on server as `edupod` user inside the sidecar's venv, `pm2 restart solver-py` (or equivalent).
- The sidecar is added to `ecosystem.config.cjs` as a new pm2 process `solver-py` on port `5557`.

### Testing

- Unit tests co-located with source on both sides (`*.spec.ts`, `test_*.py`).
- Parity tests in `packages/shared/src/scheduler/__tests__/cp-sat-parity.test.ts` — compares legacy output to CP-SAT output on identical inputs.
- Stress scenarios re-run against CP-SAT in Stage 9 — reuses the existing `E2E/5_operations/Scheduling/STRESS-TEST-PLAN.md` scripts.

### Module registration discipline (TS side)

Before pushing any change that touches a NestJS module's `imports`/`exports`/`providers`, run the DI smoke test from `CLAUDE.md`.

## Canonical test tenants

- **stress-a, stress-b, stress-c, stress-d** — clones of NHQS used for the stress suite. Credentials in `E2E/5_operations/Scheduling/STRESS-TEST-PLAN.md` → "Credentials".
- **nhqs.edupod.app** — the canonical pilot tenant. Login `owner@nhqs.test` / `Password123!`. Flag flip for nhqs happens mid-Stage-8 only after stress-a/b/c/d are all green.
- Production tenants onboarded after NHQS validates flip without incident.

## Risks and mitigations

| Risk                                                                               | Mitigation                                                                                                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| CP-SAT model has constraint modelling bugs (places an incorrect schedule)          | Parity tests (Stage 5) compare to legacy; validateSchedule runs on CP-SAT output too                                                              |
| Sidecar process crashes / becomes unresponsive                                     | pm2 auto-restarts sidecar with `max_memory_restart=2G` + `min_uptime=30s`; worker surfaces sidecar errors as run failures                         |
| Cutover introduces a regression on a pathological input not seen in parity testing | `git revert <stage-7-commit> + rsync + pm2 restart worker` rolls back in under a minute. Legacy still in git history until Stage 8                |
| Sidecar adds deploy complexity / takes down the server                             | Stage 7 adds the sidecar as a standard pm2 app; same ops posture as api/web/worker                                                                |
| Python FFI latency eats into solve budget                                          | Stage 1 baseline: startup + one round-trip should be < 500ms; measured in Stage 5                                                                 |
| Team not fluent in constraint modelling                                            | Stage 3 + Stage 4 explicitly cite reference papers and OR-Tools example code for each constraint                                                  |
| Contract reshape (Stage 10) breaks result_json consumers                           | Stage 10 is gated behind Stage 9 success, so every consumer gets retested. `cp-sat-parity.test.ts` is repurposed as a Stage-10 regression harness |

## Canonical Reference Material

- `/Users/ram/Desktop/SDB/CLAUDE.md` — project-wide rules, RLS, conventions.
- `/Users/ram/Desktop/SDB/scheduler/README.md` + `PLAN.md` — the earlier rebuild orchestration package (sets the convention this one mirrors).
- `/Users/ram/Desktop/SDB/packages/shared/src/scheduler/types-v2.ts` — the SolverInputV2 / SolverOutputV2 types that both backends honour.
- `/Users/ram/Desktop/SDB/packages/shared/src/scheduler/solver-v2.ts` — the legacy solver being replaced. Read it to understand what CP-SAT must match or beat.
- `/Users/ram/Desktop/SDB/packages/shared/src/scheduler/constraints-v2.ts` — every hard constraint the legacy solver honours. Your CP-SAT model must honour all of these.
- `/Users/ram/Desktop/SDB/E2E/5_operations/Scheduling/BUG-LOG.md` — every SCHED-### the existing solver has. Stage 9 validates CP-SAT doesn't regress any of them.
- **OR-Tools CP-SAT documentation:** https://developers.google.com/optimization/cp/cp_solver (external; linked here for reference, not fetched).
- **Timetabling with CP-SAT reference examples:** `google/or-tools` GitHub repo, `examples/python/scheduling_with_transitions.py` and `examples/python/cover_rectangle_2d.py` (external; linked here for reference).
