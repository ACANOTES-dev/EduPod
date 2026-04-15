# Stage 9 — Full stress re-run (Waves 1, 2, 3 against CP-SAT)

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 8 is `complete` (rollout + legacy retire) and Stage 9 is `pending`.

## Purpose

Re-run the entire stress-test pack — Wave 1 (75 solver + UI scenarios), Wave 2 (5 cross-tenant + data-integrity), and Wave 3 (3 worker/infrastructure) — against the CP-SAT backend on each stress tenant. Confirm:

1. **Every SCHED-### fix from the legacy era still holds.** No regressions introduced by the migration.
2. **Solver-specific bugs are now closed.** SCHED-017 (partial completion) and SCHED-025 (non-determinism) should be permanently resolved.
3. **Completeness target hit.** 100% placement on stress-a baseline; < 60s median solve time.
4. **Scale proven.** Tier 3 Irish-secondary fixture (60 teachers / 30 classes / 200 curriculum entries) solves in < 60s with 100% placement.

When this stage is complete, the scheduler is production-ready — the rating moves from 2.5/5 (prototype) to a defensible 4+/5.

## Prerequisites

- **Stage 8 complete.** Legacy retired, every tenant on CP-SAT.
- Stress pack in `E2E/5_operations/Scheduling/STRESS-TEST-PLAN.md` intact.
- Server lock available.

## Commit & deploy discipline (every session, non-negotiable)

- **Commit locally only.** `git commit` is fine; `git push`, `git push --force`, `gh pr create`, or any GitHub web-UI interaction are **forbidden**. `main` is rebased manually every ~2 days — pushing breaks that flow.
- **Deploy via rsync + SSH** directly to `root@46.62.244.139`. Server access is granted for this migration; use it. Never via GitHub Actions or any CI pipeline (a CI run takes ~3 hours and would stall the migration).
- **Acquire the server lock** at `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH, pm2, or rsync action. Release it with a summary when done.

This stage is mostly **remote API probing + scenario walkthroughs** against the stress tenants. Any bug-fix sub-cycle that touches the server (e.g. redeploying a sidecar model fix) requires the lock.

---

## Carryovers from Stage 5 (must address in this stage)

Stage 5 parity testing deferred four items to Stage 9 because they are scale-dependent and need the full stress pack to exercise properly. Do not declare Stage 9 complete without resolving them.

### 1. Port the legacy 1-swap repair pass to the Python greedy

**Context:** Stage 5 Tier 2 (stress-a-shape, 340 lessons) showed CP-SAT 329/340 vs legacy 331/340 — a -0.6 % regression. Diagnosis: Stage 4's greedy in `apps/solver-py/src/solver_py/solver/hints.py` is MRV-only; legacy's greedy has a 1-swap repair pass that can move an already-placed lesson aside to fit a new one. CP-SAT given the MRV greedy as a hint cannot find the swap moves inside a 30 s budget; the greedy floor becomes the ceiling.

**What to do:**

- Read `packages/shared/src/scheduler/solver-v2.ts` — specifically the repair phase after initial greedy placement — and port the 1-swap logic to `apps/solver-py/src/solver_py/solver/hints.py`.
- Keep the port deterministic (lex-ordered candidate selection; fixed iteration order).
- Add pytest fixtures that reproduce the Tier 2 regression (pull `packages/shared/src/scheduler/__tests__/fixtures/parity-fixtures.ts` → `tier-2-stress-a-baseline` and run it through the Python greedy directly). Before the port: greedy places 329. After: greedy places 331+. Assert.
- Re-run the Stage 5 parity harness (`pnpm exec jest --testPathPattern=cp-sat-parity`) and confirm Tier 2 placement is now ≥ legacy. Attach the updated parity report to the Stage 9 completion entry as evidence.

**Do not** attempt to improve the hint via CP-SAT parameter tuning instead — the problem is hint quality at the greedy stage, not search strategy at the solver stage. A tuning workaround is debt.

### 2. Verify the formalised 100 % feasibility benchmark on real stress-a data

**Context:** Stage 5's Tier 2 fixture is a synthetic builder (`parity-fixtures.ts` → `buildTier2StressABaseline`) that matches stress-a's dimensions but is not stress-a's actual seed. PLAN.md formalised stress-a (from `packages/prisma/scripts/stress-seed.ts --mode baseline`) as the 100 % placement benchmark, but that benchmark was never actually measured — both backends in Stage 5 landed below 100 % on the synthetic equivalent, leaving the question open: is stress-a itself 100 % feasible, or does the benchmark need revising?

**What to do:**

- Trigger a solve on the real `stress-a.edupod.app` tenant after running `packages/prisma/scripts/stress-seed.ts --mode baseline --tenant-slug stress-a` to ensure baseline data is present.
- Record placement ratio, solve duration (median of 5 runs), hard/soft violation counts, deterministic reproducibility.
- **Expected outcome: CP-SAT places 340/340 in < 10 s.** If it doesn't, investigate in this order:
  1. Is the stress-seed output actually feasible? Run the Stage 12 pre-solve feasibility sweep against the seeded data (if Stage 12 has shipped by then; if not, do a manual capacity check).
  2. If feasible, is the 1-swap repair port from §1 enough to close the gap?
  3. If both hold and we still miss 100 %, update PLAN.md's target-metrics section honestly — the bar stays "≥ legacy + diagnosed," but stress-a drops from "100 % guaranteed feasibility reference" to "well-slack feasibility reference."
- Whatever the measurement is, publish it verbatim in the completion entry. Do not massage.

### 3. Parity on supervision-heavy fixtures

**Context:** Stage 5's seven fixtures all use `break_groups: []`. Yard-supervision behaviour is exercised by `apps/solver-py/tests/test_solve_supervision.py` and by Wave 1 on legacy, but a parity comparison — the side-by-side legacy-vs-CP-SAT measurement — was never run on supervision-heavy inputs.

**What to do:**

- Add a new fixture to `packages/shared/src/scheduler/__tests__/fixtures/parity-fixtures.ts`: `tier-2-with-supervision` — stress-a-shape plus `break_groups` representing morning break + lunch, with supervision demand distributed across 4-6 staff. Keep deterministic via mulberry32.
- Re-run the parity harness with the new fixture. CP-SAT must: (a) match or beat legacy on placed count, (b) match or beat on Tier 2 violations, (c) honour supervision assignments without over-subscribing teachers on duty.
- Append the supervision row to the parity matrix in the completion entry.

### 4. Multi-worker retest — only if OR-Tools fixes the bugs upstream

**Context:** Stage 4 shipped `num_search_workers = 8` + `interleave_search = True` + `repair_hint = True`. Stage 5 found two OR-Tools 9.15 bugs in that config (budget overrun and segfault) and reverted to single-worker. Stage 7 pinned `ortools==9.15.6755`. If Google releases a newer OR-Tools with fixes for both bugs, Stage 9 is the stage where we retest.

**What to do — only if upstream fixes land:**

- Check the OR-Tools release notes for fixes to `interleave_search` budget discipline AND `MinimizeL1DistanceWithHint` segfaulting with `repair_hint`. Both must be fixed; one is not enough.
- If both fixed: bump `ortools==` in `pyproject.toml`, re-run the full Stage 5 parity harness, confirm zero regression, confirm budget is honoured, confirm no segfault. Re-run Stage 9 scenarios with the new version. If any regression surfaces, roll back the pin.
- If not fixed: leave `num_search_workers = 1` as-is. Note in the completion entry that the retest was attempted but blocked on upstream.

This item is deliberately gated on an external signal. Do not spend time chasing multi-worker if the bugs are still upstream — single-worker + greedy fallback is correct and ships a valid product.

---

## Scope — the full re-run

### Re-run Wave 1 (STRESS-001 → STRESS-075)

These were originally distributed across sessions A / B / C / D on four stress tenants. Same distribution applies. Each scenario that involves a solve call now exercises CP-SAT implicitly. For each scenario:

- If the scenario was originally ✅ PASS → must still pass.
- If the scenario was originally ✅ PASS (caveat with a SCHED-###) → the caveat must either be closed or re-verified as still acceptable.
- If the scenario was originally ❌ FAIL due to SCHED-017 / SCHED-025 → re-run; must now be PASS.
- If any new failure surfaces → investigate, fix, re-run.

Scenario outcomes feed a new "Wave 4 — CP-SAT regression sweep" section in `STRESS-TEST-PLAN.md`.

### Re-run Wave 2 (STRESS-076 → STRESS-080)

- STRESS-076 (archived teachers) — confirm CP-SAT still filters via SCHED-028 input-stage filter. Sidecar doesn't see archived teachers; no change expected.
- STRESS-077 (class deletion) — unchanged; orchestration-layer concern.
- STRESS-078 (room deletion) — unchanged; API-layer guard.
- STRESS-079 (RLS cross-tenant) — unchanged; sidecar is tenant-agnostic but orchestration enforces tenant scope.
- STRESS-080 (year rollover) — unchanged; data-layer concern.

### Re-run Wave 3 (STRESS-081 → STRESS-083)

- **STRESS-081 (worker crash mid-solve).** The worker's three-phase transaction pattern (SCHED-027) still applies. The CP-SAT solve is now HTTP round-trip — if the worker is killed mid-solve, the sidecar keeps solving, the worker dies, the BullMQ lock expires, the job retries on the new worker, which re-claims and re-solves. Expected: run eventually reaches terminal state.
- **STRESS-082 (Redis unavailable).** Orthogonal to CP-SAT. Unchanged.
- **STRESS-083 (solve timeout enforcement).** CP-SAT honours `solver.parameters.max_time_in_seconds`. The HTTP timeout (max_solver_duration + 30s) caps the total round-trip. Verify both layers enforce.

### New scenarios specific to CP-SAT

Add three CP-SAT-specific scenarios to the stress pack:

- **STRESS-084 (sidecar unavailable mid-trigger).** `pm2 stop solver-py`. Admin triggers a solve. Expected: worker's `solveViaCpSat` fails with a network error, run marked `failed` with a clear message. Admin can re-trigger after pm2 restart.
- **STRESS-085 (sidecar OOM).** Feed a huge fixture (Tier 3 × 3) that exceeds the 2GB memory cap. pm2 restarts the sidecar mid-solve. Run fails cleanly. (This scenario is harder to stage; describe it as "rare" and measure sidecar memory peaks on the Tier 3 fixture to estimate headroom.)
- **STRESS-086 (determinism under seed).** Trigger the same solve twice with identical input and `solver_seed = 42`. Assert `result_json.entries` are byte-identical. This closes SCHED-025.

## Prerequisites per tenant

Each stress tenant should already have its baseline data from the original Wave 1 run. If any tenant's baseline was nuked during Stage 8 rollout testing, re-seed via `packages/prisma/scripts/create-stress-tenants.ts` before re-running.

## Step-by-step

### Preparation

1. Acquire server lock for the duration of Stage 9 (this is a long sitting; document that in the lock entry).
2. Confirm all four stress tenants are on `cp_sat` and have baseline data.
3. Re-run `packages/prisma/scripts/sync-missing-permissions.ts` if any RBAC drifted since original Wave 1.
4. Add a new "Wave 4" section to `STRESS-TEST-PLAN.md` mirroring the Wave 1 tracker table.

### Wave 1 re-run

5. Distribute across stress-a / stress-b / stress-c / stress-d exactly as Wave 1 did. (Full allocation matrix is in the original `STRESS-TEST-PLAN.md` under `Wave 1 — 4 sessions in parallel`. For the re-run, one session walks through all four tenants sequentially, not in parallel.)
6. For each scenario, record the outcome in the Wave 4 table.
7. Any FAIL → stop, diagnose, fix (in the CP-SAT model if it's a solver bug; elsewhere if orchestration), commit, deploy, re-run.

### Wave 2 re-run

8. Same walkthrough for STRESS-076 → STRESS-080. Most should pass unchanged.

### Wave 3 re-run

9. Same for STRESS-081 → STRESS-083.

### New CP-SAT scenarios

10. Execute STRESS-084 / 085 / 086.

### Target metrics validation

11. On stress-a with the baseline fixture, capture:
    - Placement ratio: **target 100%** (legacy: 78–82%).
    - Median solve duration across 5 runs: **target < 10s** (legacy: 120s timeout).
    - Hard violations (via validateSchedule): **target 0**.
    - Soft score / max_score: **target ≥ legacy median**.
12. On Tier 3 synthetic Irish fixture:
    - Placement: **target 100%**.
    - Duration: **target < 60s**.
13. Publish the measurements table in the completion entry AND in `BUG-LOG.md`'s Wave 4 summary.

### Bug log housekeeping

14. Close remaining solver-related SCHED-### bugs if CP-SAT resolves them:
    - SCHED-017 (partial as completed) — closed at end of Stage 8.
    - SCHED-018 (preferred_room not threaded) — if CP-SAT honours, close.
    - SCHED-024 (isolated-singleton doubles) — CP-SAT's double-period modelling should resolve this; verify.
    - SCHED-025 (non-determinism) — closed at end of Stage 8; STRESS-086 is the final proof.
    - SCHED-026 (quality metrics) — already populated; verify UI surface still works with CP-SAT values.

### Deploy & verify

15. Commit the Wave 4 tracker updates + bug log closures:

    ```
    test(scheduling): wave 4 full stress re-run against cp-sat backend

    Re-ran all 83 stress scenarios (wave 1+2+3) plus 3 new cp-sat-specific
    scenarios (sidecar unavailable, sidecar OOM, determinism under seed).
    Outcome: all scenarios PASS. Placement on stress-a baseline: 100% (was
    78-82%). Median solve duration: <T> s (was 120s timeout). Tier 3 Irish
    synthetic fixture: 100% placement in <T2> s. SCHED-017, 018, 024, 025
    closed. Scheduler moves from 2.5/5 to production-ready.

    Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
    ```

16. Release the server lock with a detailed summary.

## Testing requirements

- Every Wave 1 scenario re-run (75 scenarios across 4 stress tenants).
- Every Wave 2 scenario re-run (5 scenarios).
- Every Wave 3 scenario re-run (3 scenarios).
- 3 new CP-SAT-specific scenarios.
- Target-metrics table captured and published.

## Acceptance criteria

- [ ] Wave 4 tracker row for every scenario filled with ✅ PASS / ❌ FAIL.
- [ ] No ❌ FAIL remaining at time of completion.
- [ ] Stress-a baseline: 100% placement, < 10s median (**real stress-a seed per Stage 5 carryover §2, not the synthetic Tier 2 fixture**).
- [ ] 1-swap repair ported to Python greedy per Stage 5 carryover §1; parity harness re-run shows Tier 2 ≥ legacy.
- [ ] Supervision-heavy parity fixture added and measured per Stage 5 carryover §3; CP-SAT matches or beats legacy.
- [ ] Multi-worker retest attempted per Stage 5 carryover §4 — either re-enabled after upstream fix, or documented as still blocked.
- [ ] Tier 3 synthetic: 100% placement, < 60s.
- [ ] Determinism under seed confirmed (STRESS-086 passes).
- [ ] SCHED-017, 025 permanently closed with CP-SAT evidence.
- [ ] SCHED-018, 024, 026 reviewed and closed or re-classified.
- [ ] Server lock released with final summary.
- [ ] Commit + completion entry in `../IMPLEMENTATION_LOG.md`.

## If something goes wrong

- **A Wave 1 scenario that was ✅ PASS is now ❌ FAIL:** CP-SAT model has a gap. Isolate the specific constraint, fix Stage 3/4, re-deploy sidecar, re-run that scenario only.
- **Placement ratio < 100% on stress-a baseline:** either a modelling bug or genuine infeasibility. If over-demand, that's correct behaviour and the bug is in the data. If feasible, fix the model.
- **Solve duration worse than expected:** likely `num_search_workers = 1` (kept for determinism). Try `num_search_workers = 4` for non-determinism-sensitive tenants; keep 1 for tenants where repeatability matters. Document the tradeoff.
- **STRESS-086 fails (different output on same seed):** check `num_search_workers = 1` is set. Portfolio parallel search is non-deterministic by design.

## What the completion entry should include

- Full Wave 4 tracker table (copy from STRESS-TEST-PLAN.md).
- Target-metrics table (before / after for every metric on stress-a and Tier 3).
- Before/after solver rating (2.5/5 → X/5 with justification).
- Which SCHED-### bugs closed and how each was verified.
- Any open findings to defer to a future Wave 5.
- Commit SHA.
