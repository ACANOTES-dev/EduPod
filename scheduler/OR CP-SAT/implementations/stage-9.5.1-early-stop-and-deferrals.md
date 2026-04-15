# Stage 9.5.1 — Early-stop + supervision fixture + STRESS-021 (model-impacting deferrals)

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 9 is `complete` and Stage 9.5.1 is `pending`. If Stage 9 is not done, stop — this stage closes three specific deferrals from Stage 9's Wave 5 list and is meaningless without Stage 9's foundation.

## Purpose

Stage 9 landed the migration at 4.25 / 5 and closed all seven SCHED-### blockers. What it explicitly did not close were three deferrals on the Wave 5 list that **directly impact the solver's behaviour**:

1. **Early-stop SolutionCallback** — every production solve today consumes its full 120 s budget even when the greedy hint is already optimal. This is ~55 s of wasted compute per solve. It also blocks two downstream features: Stage 9.5.2's larger budgets can't be safe without early-stop, and Stage 12's what-if simulations cannot return in under 2 minutes without it.
2. **Supervision-heavy fixture triage** — Stage 9 Session 2a reduced the supervision fixture from 180 demand / 60 supply to 60 / 80 to prove structural correctness. That correctness is established, but the question of "how does CP-SAT behave on realistic secondary-school supervision density?" is still unmeasured.
3. **STRESS-021 capacity residual** — 2 of 40 `(class, subject)` pairs still pack into 3 days under the 2-per-day spread cap on stress-a. This is a P3 residual after Wave-4 fixes; Session 2c called it "capacity-constrained" and deferred it. The user's decision is to ship the best product we can — no partial retirement of known-wrong behaviour.

This stage closes all three. It also raises the budget ceiling from 120 s to a configurable 3600 s (1 hour) per tenant, since early-stop makes long budgets safe.

**The north star:** when Stage 9.5.1 ends, a small tenant's solve should finish in seconds (early-stop triggered, no change in output), a medium tenant's solve should finish when CP-SAT proves the greedy is optimal (or when it stops finding improvements), and a large tenant can configure up to 1 hour of budget without wasting CPU on solves that close early. Budget becomes a ceiling, not a runtime expectation.

## Prerequisites

- **Stage 9 complete.** All SCHED-### closed; status board row 9 = `complete`; solver rating 4.25/5 or equivalent post-Stage-9 state.
- 24 h post-Stage-8 observation window has closed cleanly (no `CpSatSolveError`, no sidecar 500s, no pm2 restart loops).
- Solver-py pinned at `ortools==9.15.6755` (Stage 5 carryover still in force; multi-worker retest still gated on upstream fixes).

## Commit & deploy discipline (every session, non-negotiable)

- **Commit locally only.** `git commit` is fine; `git push`, `git push --force`, `gh pr create`, or any GitHub web-UI interaction are **forbidden**. `main` is rebased manually every ~2 days — pushing breaks that flow.
- **Deploy via rsync + SSH** directly to `root@46.62.244.139`. Server access is granted for this migration; use it. Never via GitHub Actions or any CI pipeline.
- **Acquire the server lock** at `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH, pm2, or rsync action. Release it with a summary when done.

This stage deploys to production (sidecar rebuild + worker restart for the new env var defaults). Lock is required.

---

## Scope

### A. Early-stop SolutionCallback

**File:** new `apps/solver-py/src/solver_py/solver/early_stop.py`.

Implement a `CpSolverSolutionCallback` subclass that tracks the best objective and halts the solver when one of two conditions holds:

1. **Greedy-match stagnation**: current objective `>= greedy_hint_score` AND no improvement has been found for `stagnation_seconds` seconds.
2. **Relative-gap closure**: `(best_bound - current_objective) / max(1, |current_objective|) < gap_threshold` AND `min_runtime_seconds` have elapsed (so we don't early-stop before CP-SAT has had a chance to close the obvious gap).

```python
class EarlyStopCallback(cp_model.CpSolverSolutionCallback):
    def __init__(
        self,
        greedy_hint_score: int,
        stagnation_seconds: float = 8.0,
        gap_threshold: float = 0.001,
        min_runtime_seconds: float = 2.0,
    ) -> None: ...
```

**Behaviour:**

- On every new solution callback, record `best_objective = max(best_objective, current)` and `last_improvement_ts = now`.
- Check both halt conditions on every callback.
- When either fires, call `self.StopSearch()`.
- Expose `triggered: bool` and `reason: Literal["stagnation", "gap", "not_triggered"]` for post-solve telemetry.
- **Determinism:** the callback's timing checks use CP-SAT's internal wall clock (`self.WallTime()`), not Python's `time.monotonic()`. This keeps the halt point reproducible under fixed seed on the same hardware. Document the caveat: same halt reason across runs on the same box; halt-point drift across boxes is acceptable and expected (so is the legacy solver's, if it were still around).

**Wire into `solve.py`:**

Instantiate the callback after computing the greedy hint score, pass it to `solver.Solve(model, callback)`, and propagate `callback.triggered` + `callback.reason` into `SolverOutputV2.meta` as two new optional fields:

```python
meta.early_stop_triggered: bool
meta.early_stop_reason: Literal["stagnation", "gap", "not_triggered"]
meta.time_saved_ms: int  # (budget_ms - wall_ms) if triggered else 0
```

Also surface `time_saved_ms` in the worker's existing `cp_sat.solve_complete` log line and persist on `scheduling_runs.result_json.meta` (Stage 6 hook).

**Tunables:** `stagnation_seconds`, `gap_threshold`, and `min_runtime_seconds` all configurable via env vars with the defaults above. Stage 9.5.2 will calibrate defaults after scale testing.

**Unit tests (pytest):**

- Fixture A: solver finds optimal in 1 s → callback triggers with reason `gap` after `min_runtime_seconds`.
- Fixture B: solver matches greedy in 2 s, no improvement for 8 s → callback triggers with reason `stagnation`.
- Fixture C: solver finds steady improvement the whole budget → callback does NOT trigger; output matches full-budget run exactly (determinism).
- Fixture D: solver returns UNKNOWN (hint floor dominates) → callback's `triggered` is `False`; greedy fallback still returned correctly (regression vs Stage 4's lex-better selector).
- Fixture E: budget 120 s, early-stop fires at ~10 s on a small fixture → assert `time_saved_ms >= 100_000`.

### B. Supervision-heavy fixture rebuild

**Context:** `packages/shared/src/scheduler/__tests__/fixtures/parity-fixtures.ts` currently has `tier-2-with-supervision` at 60 demand / 80 supply (reduced in Stage 9 Session 2a). The reduction proved structural correctness; it did not prove CP-SAT handles realistic supervision density.

**Rebuild target:** a fixture that reflects the supervision shape of a real secondary school. Survey (inline in the fixture file header, not a separate research doc):

- Real Irish / UAE secondary schools have ~2-3 break periods per day (morning break, lunch, possibly afternoon break).
- Each break requires supervision in 3-6 distinct zones (yard, canteen, corridors, library, bus stop, car park).
- Typical roster: 2 teachers per zone per break, rotated across the week.
- Demand = zones × breaks × days. For a 9-yard / 3-break / 5-day week = 135 supervision-slots/week.
- Supply = teachers willing / available to do supervision. Typically 60-80 % of staff rostered at least once.

**Build two fixtures:**

1. `tier-3-supervision-realistic-medium` — 20 teachers, 4 zones, 3 breaks/day, 5 days → 60 supervision-slots + 200 lessons. Every teacher available for at most 2 supervision shifts/week. Goal: prove CP-SAT finds 100 % assignment without over-subscription.
2. `tier-3-supervision-realistic-large` — 60 teachers, 9 zones, 3 breaks/day, 5 days → 135 supervision-slots + 600 lessons. Deliberately tight supply (60 % of teachers cap at 2 shifts, 40 % cap at 1) so CP-SAT has to work to find a valid assignment.

Both fixtures deterministic via `mulberry32(seed)`. Add to `PARITY_FIXTURES` registry. Check in the fixtures + their JSON snapshots for Python round-trip tests.

**Harness integration:**

Extend `cp-sat-regression.test.ts` to run both new fixtures. Assertions:

- Placement: 100 % on teaching lessons.
- Supervision: 100 % of supervision-slots assigned (no uncovered break × zone).
- No over-subscription: every teacher's supervision count ≤ their cap.
- Break_duty_balance soft term: `(max - min) ≤ 1` across teachers with any duty on the `realistic-medium` fixture.

If either fixture produces < 100 % placement, that's a solver bug, not a fixture-design issue. Do not reduce the fixture; diagnose the bug.

### C. STRESS-021 capacity residual fix

**Context:** STRESS-021 (stress-a run, 40-class + 40-subject baseline) currently packs 2 of 40 `(class, subject)` pairs into 3 days under the 2-per-day spread cap. Stage 9 Session 2c attributes this to greedy behaviour under tight supply: the MRV (minimum remaining values) greedy places early into whichever day has capacity, and CP-SAT under the 30-120 s budget can't swap out to re-balance.

**Diagnosis (do this first):** run STRESS-021's reproducer as a pytest fixture. Capture the exact 2 pairs that pack. Confirm whether the packing is:

- (a) **Greedy-origin**: greedy places all 2 lessons of the pair on days 1-3; CP-SAT hint inherits; CP-SAT can't find a swap.
- (b) **Capacity-inherent**: given teacher availability + other placements, the pair CANNOT spread to ≥ 4 days — mathematically impossible.

If (b), the residual is genuine capacity constraint, not a solver defect. Document and close. Revisit only if a Stage 9.5.2 fixture reproduces it at scale.

If (a), fix in one of two places:

**Option 1: greedy swap-aware spreading** (`apps/solver-py/src/solver_py/solver/hints.py`).

Modify the MRV greedy's inner loop: when placing lesson N of a `(class, subject)` pair, prefer a day where lessons 1..N-1 of the pair are _not_ already placed, even if that day has tighter other constraints. Implemented as a tie-breaker in the candidate-ordering step. Tune weight so it doesn't break the Stage 9 1-swap port (which already fixes Tier-2 -0.6 % and shouldn't regress).

**Option 2: CP-SAT soft penalty on pair-packing** (`apps/solver-py/src/solver_py/solver/objective.py`).

Add a new soft term `pair_day_spread_penalty` that penalises each `(class, subject)` pair for which `distinct_days_used < min(pair_lesson_count, 5)`. Weight it just high enough to out-score a one-lesson swap but low enough to not dominate other soft terms.

**Decision rule:** implement Option 1 first (cheaper + faster to test). If STRESS-021 still fails after Option 1 with a clear greedy-origin, add Option 2 on top. If Option 1 alone resolves it, skip Option 2 — minimal change is better.

**Tests:**

- New pytest fixture `test_stress_021_spread.py` that pins the reproducer.
- Assert: after solve, `count_distinct_days_used(class, subject)` ≥ 4 for all pairs with `pair_lesson_count >= 4`.
- Re-run full parity harness; assert no regression on tier-1 / tier-2 / tier-3-irish placements.
- Re-run stress-a baseline in CI; assert 320 / 320 (post-Wave-4-fixes state) preserved.

### D. Budget ceiling raised to 3600 s per tenant

**Current state:** `CP_SAT_REQUEST_TIMEOUT_FLOOR_MS = 120000` (Stage 7), effective solver budget capped at 120 s by Stage 4's hardcoded `max_time_in_seconds`. Tenant setting `max_solver_duration_seconds` already exists but is capped at 120 in practice.

**Change:**

- Raise the soft ceiling to 3600 s (1 hour). Tenant can configure `max_solver_duration_seconds` up to this value.
- HTTP request-timeout floor formula unchanged in shape: `max(CP_SAT_REQUEST_TIMEOUT_FLOOR_MS, (budget + 60) * 1000)`. At 1-hour budget, that's 3660 s. Worker's `fetch` timeout must honour this.
- Default tenant budget **stays at 60 s**. Existing tenants unchanged unless they explicitly opt up. Tenant-config docs updated to explain the new ceiling + when to raise it.

**Why this is safe now and wasn't before:** early-stop (§A) guarantees that easy cases close in seconds regardless of budget. A 1-hour ceiling with early-stop means "the solver will use what it needs and no more." Without early-stop, raising the ceiling would have wasted up to 3540 s of CPU on every solve.

**Validation (belongs to Stage 9.5.2, called out here so §D lands with a safety check):**

Run STRESS-086 (determinism) + stress-a baseline with budget set to 600 s. Assert:

- Wall time < 30 s (early-stop triggered on the easy case).
- Output byte-identical to the 120 s run (early-stop doesn't change result, only runtime).

### E. Metrics + telemetry

Add to `SolverOutputV2.meta` (shipped in Stage 6) the three new fields from §A:

```typescript
meta.early_stop_triggered?: boolean;
meta.early_stop_reason?: 'stagnation' | 'gap' | 'not_triggered';
meta.time_saved_ms?: number;
```

Optional in the TS type to keep backward compatibility during the deploy window. Python side emits them unconditionally after §A lands.

Update `cp_sat.solve_complete` log line to include `early_stop_triggered` + `time_saved_ms`. Persist same fields on `scheduling_runs.result_json.meta`.

Stage 12's diagnostics will consume these: `early_stop_triggered = true` + `time_saved_ms > 30000` + `unassigned > 0` means "we stopped early but didn't hit 100% — the gap is structural, not budget." That's actionable diagnostic signal.

## Non-goals

- **Do not** implement what-if simulation endpoint. Stage 12.
- **Do not** restructure the solver model. Stage 10 reshapes the contract; this stage is solver-internal.
- **Do not** introduce multi-worker solve. Still blocked on upstream OR-Tools 9.15 bugs.
- **Do not** auto-tune `max_solver_duration_seconds` per tenant. Admin-configured default + our recommended values (from Stage 9.5.2) is sufficient; auto-tuning adds complexity without clear win.
- **Do not** fix the remaining Wave 5 P3 items (SCHED-019 symptom 2, bulk auto-assign, CSV export). Out of scope; those are product features, not solver behaviour.

## Step-by-step

1. Acquire server lock with reason "Stage 9.5.1 early-stop + deferrals".
2. Diagnose STRESS-021 as per §C. If (b) capacity-inherent, document and skip §C's fix; report in the completion entry.
3. Implement §A early-stop callback with unit tests. All five pytest fixtures green before moving on.
4. Implement §B supervision fixtures + harness assertions. Both new fixtures place 100 % without over-subscription.
5. Implement §C STRESS-021 fix (Option 1 first; Option 2 only if needed). Re-run full parity harness. No regression on tier-1 / tier-2 / tier-3.
6. Implement §D budget ceiling raise: update tenant-config docs, adjust HTTP timeout formula, validate with 600 s stress-a run.
7. Implement §E telemetry plumbing. Verify log line + `result_json.meta` both populated on a local smoke run.
8. Run full test suites: `pnpm --filter @school/shared test`, `pnpm --filter @school/worker test`, `apps/solver-py pytest`, DI smoke.
9. Commit locally (grouped):
   - `feat(scheduling): cp-sat early-stop callback with stagnation + gap halt`
   - `test(scheduling): realistic supervision fixtures + harness assertions`
   - `fix(scheduling): stress-021 pair-day-spread greedy fix`
   - `feat(scheduling): raise solver budget ceiling to 3600s per tenant`
   - `feat(scheduling): early-stop telemetry in result_json.meta + cp_sat.solve_complete log line`
10. Deploy via rsync:
    - `apps/solver-py/src/solver_py/solver/` (early_stop.py + solve.py updates + hints.py for STRESS-021 + objective.py if Option 2 landed)
    - `packages/shared/src/scheduler/__tests__/fixtures/parity-fixtures.ts` (supervision fixtures)
    - `packages/shared/src/scheduler/types-v2.ts` (meta field additions)
    - `apps/worker/src/processors/scheduling/solver-v2.processor.ts` (telemetry surface)
    - `ecosystem.config.cjs` if `CP_SAT_REQUEST_TIMEOUT_FLOOR_MS` changes
11. On server: `chown -R edupod:edupod`, rebuild `@school/shared` + `@school/worker`, `pm2 restart solver-py && pm2 restart worker`.
12. Verification runs on three tenants:
    - stress-a with default 60 s budget: assert early-stop triggers, wall < 30 s, 320/320 placement.
    - nhqs with raised 600 s budget: assert placement improvement over Stage 9 baseline of 373/438.
    - Small tenant (e.g. nhqs-shaped, smaller fixture): assert early-stop fires in < 5 s with no regression in output.
13. 24 h observation: watch for unexpected early-stop misses (e.g. a tenant where `triggered = false` on every run when it should be true). If observed, tune thresholds or add fixture.
14. Release server lock with summary.

## Testing requirements

- Pytest: 5 early-stop fixtures + 2 supervision-fixture assertions + 1 STRESS-021 reproducer + determinism regression. All green.
- TS: `cp-sat-regression.test.ts` passes with the two new supervision fixtures.
- DI smoke: `DI OK`.
- Stress pack: re-run STRESS-021, STRESS-086 post-deploy. Both PASS.
- Budget-ceiling validation: 600 s budget run on stress-a completes in < 30 s (early-stop working).
- NHQS re-run: 120 s baseline + 600 s extended; capture the delta.

## Acceptance criteria

- [ ] `early_stop.py` module present with `EarlyStopCallback` class, 5 pytest fixtures green.
- [ ] `solve.py` invokes the callback; `SolverOutputV2.meta` carries `early_stop_triggered`, `early_stop_reason`, `time_saved_ms`.
- [ ] Two supervision fixtures added to `parity-fixtures.ts`; harness asserts 100% supervision assignment + no over-subscription + balanced break_duty on both.
- [ ] STRESS-021 reproducer pytest passes (40/40 pairs span ≥ 4 days when `pair_lesson_count ≥ 4`), OR the residual is documented as capacity-inherent with math evidence.
- [ ] `max_solver_duration_seconds` ceiling raised to 3600 s; HTTP timeout formula updated; default tenant budget unchanged at 60 s.
- [ ] Worker log line + `result_json.meta` carry the new early-stop fields on every solve.
- [ ] 600 s budget run on stress-a: wall < 30 s, 320/320 placement, byte-identical output to 120 s run.
- [ ] NHQS 600 s run: placement ≥ Stage 9 baseline of 373/438; any improvement quantified; structural 8 still surface as diagnostics.
- [ ] Full test suites green: `@school/shared`, `@school/worker`, `apps/solver-py`. DI smoke `DI OK`.
- [ ] Deployed to production; 24 h observation clean; server lock released.
- [ ] Completion entry appended to `IMPLEMENTATION_LOG.md`; status-board row 9.5.1 flipped `pending` → `complete`.

## If something goes wrong

- **Early-stop causes non-determinism in the regression harness.** The callback's halt timing is using `self.WallTime()` — verify this. If the non-determinism persists, the root cause is almost certainly a `time.monotonic()` call somewhere in the stage-9 greedy path that got coupled to the early-stop's trigger. Fix at source; do not add a seed-scrambling workaround.
- **`tier-3-supervision-realistic-large` fails to place 100 %.** Distinguish fixture-design issue (demand > supply by the math) from solver bug: compute `total_supervision_supply = Σ (teacher.supervision_cap × 5 days)` and compare to `total_supervision_demand = zones × breaks × days`. If supply < demand, the fixture is infeasible by design — reduce until supply ≥ demand × 1.1 (some slack). If supply ≥ demand × 1.1 and the solver still can't place, it's a real solver bug — diagnose before shipping the stage.
- **STRESS-021 fix regresses stress-a or stress-c placement.** Option 1's greedy tie-break is too aggressive. Weight it lower, or guard it with `if pair_lesson_count >= 4` so short pairs don't get pushed around. If Option 1 can't be tuned without regression, fall back to Option 2 (CP-SAT soft penalty).
- **NHQS 600 s run places ≤ 373/438 (no improvement).** Unexpected — means the 57 "budget-bound" unassigned lessons are actually capacity-bound or greedy-floor-locked. Investigate by inspecting the hint and the IIS subsets; may need to wait for Stage 12's diagnostic module to unpack properly. If investigation confirms all 65 unassigned are structural, update the Stage 9 rating justification — NHQS capacity ceiling is real.
- **Budget ceiling raise breaks an existing tenant.** Almost impossible because the default is unchanged at 60 s and the ceiling only affects tenants that explicitly configure higher. But verify with a cross-tenant pre-deploy sweep: `SELECT id, settings->>'max_solver_duration_seconds' FROM tenants WHERE settings->>'max_solver_duration_seconds' IS NOT NULL;` — audit any tenant that already has a non-default value to ensure 3600 is still a safe upper bound for them.

## What the completion entry should include

- Pre/post wall time on stress-a at 120 s budget vs with early-stop enabled.
- Pre/post wall time on stress-a at 600 s budget with early-stop (should match).
- Early-stop trigger rate on the three smoke tenants.
- Supervision fixture placement + balance numbers.
- STRESS-021 residual status: fixed (with the specific option used) or documented capacity-inherent.
- NHQS 600 s run result — placement count + any structural-only diagnosis.
- Commit SHAs for each grouped commit.
- Solver rating update (projected 4.25 → 4.5 if all three land cleanly).
- Any fixtures or thresholds that needed tuning beyond the defaults defined in this doc.
