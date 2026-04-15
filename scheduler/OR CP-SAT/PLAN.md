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
Stage 9.5.1: Early-stop + supervision fixture + STRESS-021 (model-impacting Wave-5 deferrals; raises budget ceiling to 1h)
  ↓
Stage 9.5.2: Scale proof — tier-4/5/6 fixtures (Irish secondary / MAT / college-level; state-of-the-art bar)
  ↓
Stage 10: Contract reshape (SolverInputV2/OutputV2 restructured to CP-SAT-native shape; sidecar + client + result_json consumers updated)
  ↓
Stage 11: Orchestration rebuild (assembleSolverInput rewritten from scratch against the new contract; scheduler-orchestration cleaned of SCHED-013…028 scar tissue)
  ↓
Stage 12: Diagnostics module overhaul (state-of-the-art explainability layer — pre-solve feasibility sweep, CP-SAT IIS extraction, plain-English translation, ranked solutions with quantified impact; pairs with the solver to make the complete enterprise product)
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
- Stage 9.5.1 closes three Wave-5 deferrals that directly affect solver behaviour (early-stop, supervision fixture, STRESS-021). Must follow Stage 9 (which produced the deferral list) and precede 9.5.2 (whose budget expansion depends on early-stop existing).
- Stage 9.5.2 measures CP-SAT at state-of-the-art scale (tier-4/5/6). Depends on Stage 9.5.1's early-stop because the expanded 1-hour budget is only safe with a working halt mechanism.
- Stage 10 reshapes the contract; doing it before Stage 7 would mean maintaining two contract shapes during the critical migration window.
- Stage 11 depends on Stage 10's new contract shape. It's the final cleanup.
- Stage 12 depends on a stable CP-SAT in production (Stage 9 green) and the final contract shape (Stage 11 done) because the diagnostics module consumes both the solver's output and its internal infeasibility certificates. Landing it earlier would mean rebuilding against a shifting target.

### Why diagnostics gets its own stage

A state-of-the-art solver without an equally-capable diagnostics layer is a half-product for the intended audience. School administrators are not optimisation engineers; they cannot read an unassigned-slots list and infer that their only Arabic teacher is over-subscribed. They need the system to say so plainly and show them exactly what to change. The migration is not truly "enterprise-grade" until the explanation layer is at parity with the solver layer. Stage 12 is the stage that gets us there.

## Stage summary

| Stage | Name                            | Touches                                                                                                                                                                                | Proven by                                                                                                                                            |
| ----- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Python sidecar scaffold         | New `apps/solver-py/` with `pyproject.toml`, FastAPI, `/health`, Dockerfile                                                                                                            | `curl localhost:5557/health` returns 200 locally                                                                                                     |
| 2     | JSON contract                   | `apps/solver-py/schema/*.py` pydantic models; round-trip fixture                                                                                                                       | pytest round-trips a `SolverInputV2` fixture without data loss                                                                                       |
| 3     | CP-SAT model — hard constraints | `apps/solver-py/solver/*.py` CP-SAT variable + hard constraint builders                                                                                                                | pytest on 5 fixture inputs; every solution has 0 hard violations OR returns UNSAT cleanly                                                            |
| 4     | CP-SAT model — soft preferences | `apps/solver-py/solver/soft.py`, scoring function, quality metrics                                                                                                                     | pytest — soft score on fixtures matches or exceeds legacy output                                                                                     |
| 5     | Parity testing                  | `packages/shared/src/scheduler/__tests__/cp-sat-parity.test.ts`; local double-run against legacy                                                                                       | CP-SAT unassigned ≤ legacy unassigned on 3 scale tiers — **this is the cutover gate**                                                                |
| 6     | Worker IPC integration          | `solver-v2.processor.ts` always calls sidecar; `cp-sat-client.ts`; worker unit tests. No prod deploy yet.                                                                              | Unit tests pass; local worker hits sidecar; ts + py test suites green                                                                                |
| 7     | Production cutover              | Atomic deploy — rsync sidecar, `pip install`, add `solver-py` to `ecosystem.config.cjs`, rsync worker change, pm2 restart                                                              | Sidecar online on prod; every tenant solves via CP-SAT end-to-end                                                                                    |
| 8     | Legacy retire                   | Delete `solver-v2.ts`, `constraints-v2.ts`, `domain-v2.ts`, `soft-scoring-v2.ts`, their specs                                                                                          | Full `turbo test` green post-deletion; worker simpler                                                                                                |
| 9     | Full stress re-run              | Re-run Wave 1 + Wave 2 + Wave 3 scenarios against CP-SAT backend                                                                                                                       | All scenarios pass; completeness at 100% on realistic input; determinism verified                                                                    |
| 9.5.1 | Early-stop + deferrals          | CP-SAT `SolutionCallback` halts on greedy-match stagnation + gap closure; supervision fixture rebuilt at realistic density; STRESS-021 capacity residual fixed; budget ceiling → 3600s | Easy solves close in seconds regardless of budget; supervision 100% at realistic density; STRESS-021 40/40 pairs span ≥ 4 days                       |
| 9.5.2 | Scale proof                     | Tier-4/5/6 synthetic fixtures (Irish-secondary large / MAT / college); escalating-budget matrix; diminishing-returns analysis; per-size budget recommendations                         | ≥98% tier-4, ≥95% tier-5, ≥90% tier-6 (or diagnosed ceiling); budget knees measured; `max_memory_restart` verified adequate                          |
| 10    | Contract reshape                | `SolverInputV2` / `SolverOutputV2` restructured to CP-SAT-native shape; sidecar pydantic models; client; result_json consumers (UI, apply)                                             | Every consumer of `result_json` works against the new shape; Stage 9 scenarios re-pass                                                               |
| 11    | Orchestration rebuild           | `scheduler-orchestration.service.assembleSolverInput` rewritten against the new contract; legacy scar tissue removed                                                                   | New orchestration emits the Stage 10 shape; Stage 9 scenarios re-pass; code surface smaller                                                          |
| 12    | Diagnostics module overhaul     | `SchedulingDiagnosticsService` rebuilt on CP-SAT infeasibility certificates + pre-solve feasibility sweep; Python IIS endpoint; review-page UI; plain-English translation registry     | Synthetic infeasible fixtures diagnose root causes within 50 ms; non-technical user test validates every top-5 solution is actionable without jargon |

## Target metrics — how we know this migration was worth it

The migration is measured against **two distinct benchmarks** because the two tenants we test against represent fundamentally different classes of input, and conflating them produces misleading results.

### Benchmark 1 — stress-a: the feasibility reference (100% target)

`stress-a` is seeded by `packages/prisma/scripts/stress-seed.ts --mode baseline` (20 teachers with full competency coverage, 10 classes, 11 subjects, 25 rooms, 40-slot period grid, curriculum at **32 of 40** weekly periods with deliberate slack). It is explicitly designed so that a 100% placement is mathematically guaranteed to exist. Any miss on stress-a is a solver failure, not a data failure.

**This is the fixture we use to prove the solver itself is correct and fast.** Both Stage 5 parity and Stage 9 stress re-runs treat stress-a as the pass/fail gate for the solver's theoretical ceiling.

| Metric                         | Legacy TS solver | CP-SAT target       |
| ------------------------------ | ---------------- | ------------------- |
| Curriculum placed              | 80%              | 100%                |
| Hard constraint violations     | 0                | 0                   |
| Solver duration (median)       | 120 s (timeout)  | < 10 s              |
| Deterministic under fixed seed | No (SCHED-025)   | Yes                 |
| Scale to 80 teachers           | Unproven         | < 60 s, 100% placed |

### Benchmark 2 — nhqs and production tenants: the real-world benchmark (≥ legacy + diagnosed)

`nhqs` and future production tenants are seeded organically by the tenant themselves — curriculum, teachers, competencies, and availability reflect real staffing choices, with no guarantee of mathematical feasibility. A tenant may hire one Arabic teacher for four year groups and demand 30 periods of Arabic per week with only 28 teacher-periods available. No solver can place what doesn't exist.

**Real-world tenants therefore have a different pass criterion:**

| Metric                         | Target                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Placement completeness         | ≥ legacy solver, AND every unassigned lesson has a diagnosed reason surfaced to the tenant admin                                                       |
| Hard constraint violations     | 0                                                                                                                                                      |
| Solver duration (median)       | < 30 s                                                                                                                                                 |
| Deterministic under fixed seed | Yes                                                                                                                                                    |
| Feasibility ceiling diagnosis  | Pre-solve diagnostics identify structural infeasibility in < 50 ms; post-solve diagnostics explain any remaining gaps with CP-SAT IIS-based root cause |

The distinction matters because "hit 100% on NHQS" is not a valid success criterion in principle — we do not know a priori that the NHQS data is feasible, and nobody on the team has audited it row by row. Stage 12 exists precisely to make this distinction visible to the tenant: **"97% placed — and here are the 3 structural data issues that block the remaining 3%"** is a far stronger product than "97% placed" with no explanation.

### Benchmark 3 — tier-4/5/6 state-of-the-art scale proof (measured in Stage 9.5.2)

The first two benchmarks measure correctness on datasets we know. Benchmark 3 measures scale: can CP-SAT handle a genuine 1000-lesson Irish secondary week, a 2000-lesson MAT / multi-campus workload, or a 3000+ lesson college-level timetable — all within a configurable budget that reaches up to 1 hour?

| Tier                             | Target shape                                | Placement bar                 | Budget knee expected |
| -------------------------------- | ------------------------------------------- | ----------------------------- | -------------------- |
| Tier 4 — Irish secondary (large) | ~50 classes, 80 teachers, ~1100 lessons     | ≥ 98 %                        | 120-180 s            |
| Tier 5 — MAT / multi-campus      | ~95 classes, 160 teachers, ~2200 lessons    | ≥ 95 %                        | 300-600 s            |
| Tier 6 — college / thousands     | ~130 sections, 180 lecturers, ~3200 lessons | ≥ 90 % (or diagnosed ceiling) | 1800 s               |

Stage 9.5.2 produces the actual measurements; the values above are expectations going in. If any tier misses the bar, the stage's deliverable is a faithful diagnosis (greedy quality at scale vs CP-SAT tree search at scale), not a forced fix.

### Budget architecture — why the ceiling is 1 hour, not 120 s

The legacy solver capped at a 120-second wall-clock timeout. When we migrated to CP-SAT we kept 120 s as the carry-forward value because nobody had challenged it. Stage 9 surfaced that the number is genuinely arbitrary: real scheduling software (Untis, aSc, enterprise OR solvers) routinely budgets in **minutes to hours**, not seconds, because timetable generation is a batch background task — admin clicks Generate, walks away, returns to a result. There is no UX pressure to finish in 2 minutes.

Stage 9.5.1 raises the soft ceiling to **3600 s (1 hour) per tenant**, configurable via `max_solver_duration_seconds`. The default for existing tenants stays at 60 s. Stage 9.5.2 measures appropriate defaults for each tier size.

**The ceiling is only safe because of early-stop.** Stage 9.5.1's `EarlyStopCallback` halts the solver when either (a) the objective matches the greedy-hint score with N seconds of stagnation, or (b) the objective-to-best-bound gap falls below a tuned threshold. In practice this means small-tenant solves finish in seconds regardless of the budget ceiling, and large-tenant solves use exactly the compute they need. The user experience is "the solver takes as long as the problem takes" — not "wait 1 hour no matter what."

**Two operational classes have different ceilings:**

| Operation                   | Ceiling | Rationale                                                                                    |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| Scheduling run              | 3600 s  | Batch background task; value of a correct schedule outweighs time-to-return                  |
| Stage 12 what-if simulation | 120 s   | UX-facing; admin interactively previews a config change; must return inside a tolerable wait |

Early-stop applies to both; the ceiling is the difference. Stage 12 uses the same sidecar with a shorter per-request budget.

### Combined migration pass criterion

The migration is complete when:

- stress-a hits 100 % placement with 0 hard violations, deterministic (Stage 9 — done).
- All tenants (stress-a/b/c/d + nhqs + any onboarded tenant) hit ≥ legacy placement with every gap diagnosed (Stage 12).
- Tier-4, tier-5, tier-6 hit their respective placement bars or a diagnosed ceiling (Stage 9.5.2).
- Early-stop provably closes fast on easy cases (Stage 9.5.1).
- No SCHED-### regression surfaces in 7 consecutive days of production traffic (Stage 8 window).

If any of these miss, we treat the migration as incomplete and debug before declaring done.

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

- **stress-a** — **the feasibility reference.** Seeded by `packages/prisma/scripts/stress-seed.ts --mode baseline`: 6 year groups (Y7–Y12), 10 classes, 20 teachers with full competency coverage, 11 subjects, 25 rooms, 40-slot period grid, curriculum at 32 of 40 weekly periods with deliberate slack. **Mathematically guaranteed to be 100% placeable.** Any miss here is a solver failure. Used as the pass/fail gate for Stage 5 parity and Stage 9 stress re-run.
- **stress-b, stress-c, stress-d** — stress-a-shape tenants with scale dials (more teachers, more classes, denser curriculum). Used in Stage 9 to validate the solver scales. Credentials in `E2E/5_operations/Scheduling/STRESS-TEST-PLAN.md` → "Credentials".
- **nhqs.edupod.app** — **the real-world messy-data benchmark.** Login `owner@nhqs.test` / `Password123!`. Seeded organically during pilot configuration; feasibility of the data is _unknown_ and may include structural issues (subject-demand > qualified-teacher-capacity, under-qualified staff for mandatory subjects, pin conflicts). This tenant proves the migration handles production-shaped input, and Stage 12 diagnostics ensures any gaps are explained rather than swept under a "97% placed" rug.
- **Optional future addition — a DB-backed Tier 3 fixture tenant** (`csp-tier-3` or similar) promoted from `packages/shared/src/scheduler/__tests__/fixtures/parity-fixtures.ts` → `tier-3-irish-secondary` (30 classes, 60 teachers, 200 curriculum entries, 45 slots). Mathematically feasible like stress-a but closer to a real Irish secondary's scale. Not required for any stage today; mentioned here for when the stress suite needs a bigger feasibility testbed.
- Production tenants onboarded after NHQS validates the cutover without incident.

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
