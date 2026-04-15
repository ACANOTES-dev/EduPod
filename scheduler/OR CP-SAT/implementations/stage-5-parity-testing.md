# Stage 5 — Parity testing

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 4 is `complete` and Stage 5 is `pending`.

## Purpose

Run the legacy TypeScript solver and the CP-SAT sidecar side-by-side on identical inputs. Prove CP-SAT matches or beats the legacy solver on every measurable dimension. If CP-SAT regresses on any input, fix the model before Stage 6.

This is the gate — without Stage 5 green, we don't flip any feature flag on a real tenant.

## Prerequisites

- **Stage 4 complete.** CP-SAT produces feasible, scored output with populated quality metrics.
- Legacy solver still works (it does — Waves 1+2 stress tests confirmed).

## Commit & deploy discipline (every session, non-negotiable)

- **Commit locally only.** `git commit` is fine; `git push`, `git push --force`, `gh pr create`, or any GitHub web-UI interaction are **forbidden**. `main` is rebased manually every ~2 days — pushing breaks that flow.
- **Deploy via rsync + SSH** directly to `root@46.62.244.139`. Server access is granted for this migration; use it. Never via GitHub Actions or any CI pipeline (a CI run takes ~3 hours and would stall the migration).
- **Acquire the server lock** at `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH, pm2, or rsync action. Release it with a summary when done.

This stage is **local only** — parity testing runs on a developer machine. No server deploy, no lock required.

---

## Scope — what to measure

For each test input, run both backends and record:

| Metric                         | How                                              | CP-SAT target                        |
| ------------------------------ | ------------------------------------------------ | ------------------------------------ |
| Entries placed                 | `output.entries.length`                          | ≥ legacy                             |
| Unassigned entries             | `output.unassigned.length` + `periods_remaining` | ≤ legacy                             |
| Hard constraint violations     | Run `validateSchedule(entries)` on each output   | 0 (both should hit 0)                |
| Soft preference score          | `output.score / output.max_score`                | ≥ legacy                             |
| Solve duration (wall clock ms) | `output.duration_ms`                             | ≤ legacy                             |
| Memory peak                    | `/usr/bin/time -v` on the sidecar process        | < 2 GB (matches worker cap)          |
| Determinism under fixed seed   | Same input twice → identical output              | Yes (CP-SAT); No (legacy, SCHED-025) |

## Scope — the inputs

Three scale tiers, plus targeted adversarial fixtures:

### Tier 1 — Tiny (smoke)

- 3 classes, 5 teachers, 3 subjects, 20 periods.
- From `packages/shared/src/scheduler/__tests__/class-subject-override.test.ts` → `buildTwoClassInput`.
- Expected: both backends place 100%.

### Tier 2 — Baseline (stress-a default)

- 6 year groups, 10 classes, 20 teachers, 66 curriculum entries, 40 periods (5 × 8).
- Dump the current `config_snapshot` from a stress-a scheduling run (SCHED-017 era) and save as a fixture.
- Expected: legacy produces 80% placement (matches Wave 1 observation); CP-SAT target is 100%.

### Tier 3 — Realistic Irish school (synthetic)

- 9 year groups, 30 classes, 60 teachers, 200 curriculum entries, 45 periods.
- Generated synthetically; checked into the repo at `packages/shared/src/scheduler/__tests__/fixtures/tier-3-irish-secondary.json`.
- Expected: legacy likely produces < 70% placement (solver hits timeout); CP-SAT target is 100% in < 60s.

### Adversarial fixtures

- **Over-demand:** more curriculum hours than available teacher-periods. Both should return `unassigned` cleanly with `reason`.
- **Pin conflict:** two pinned entries double-book a teacher. Input validation should reject before solver (not in solver scope).
- **No-solution:** every teacher is maxed out on availability except one, who's competent for only half the curriculum. Expected: both backends return unassigned with a clear reason.
- **All-pinned:** every `(class, subject, period)` is pinned. Solver has nothing to do. Both should return the pin set untouched in under 1s.

## File layout

```
packages/shared/src/scheduler/__tests__/
├── cp-sat-parity.test.ts           (NEW — the parity harness)
└── fixtures/
    ├── tier-1-tiny.json            (NEW)
    ├── tier-2-stress-a-baseline.json   (NEW)
    ├── tier-3-irish-secondary.json     (NEW)
    ├── adv-over-demand.json        (NEW)
    ├── adv-pin-conflict.json       (NEW)
    ├── adv-no-solution.json        (NEW)
    └── adv-all-pinned.json         (NEW)
```

The parity test:

- Calls `solveV2(input)` for the legacy backend.
- POSTs the same input to `http://localhost:5557/solve` for CP-SAT.
- Validates both outputs with `validateSchedule`.
- Compares the metrics table above.
- Writes a `parity-report-<date>.md` to `/tmp/` summarising the run.

## Non-goals for this stage

- **Do not** flip any feature flag.
- **Do not** deploy the sidecar to production yet.
- **Do not** optimise CP-SAT further if it already beats legacy.
- **Do not** touch the worker (Stage 6).

## Step-by-step

1. Extract Tier 2 fixture from a real stress-a `scheduling_runs.config_snapshot`. Use `pg_dump -t scheduling_runs --data-only --column-inserts` + filter to a single run, or just copy the JSONB field from the prod DB (read-only).
2. Generate Tier 3 fixture — write a small JS script at `packages/shared/src/scheduler/__tests__/fixtures/generate-tier-3.ts` that emits the synthetic 60-teacher input. Check the output into the repo.
3. Write the adversarial fixtures by hand.
4. Build `cp-sat-parity.test.ts` — the harness. Must be able to run standalone (`pnpm --filter @school/shared test -- cp-sat-parity`). Assumes the sidecar is running on localhost:5557. If not, the test skips with a clear message (not a failure).
5. Run the parity test. Collect the report.
6. **If CP-SAT regresses on any tier:**
   - Tier 1 regression → Stage 3 bug (hard constraint missing). Go back to Stage 3.
   - Tier 2/3 regression on completeness → investigate pruning, check for over-tight constraints.
   - Regression on score → revisit Stage 4 weights.
7. **If legacy beats CP-SAT on duration by > 3×:** likely means CP-SAT is exploring too much of the tree. Try `solver.parameters.num_search_workers = 4` and `solver.parameters.cp_model_presolve = True`.
8. Document findings. Attach parity report to the completion entry.
9. Commit locally:

   ```
   test(scheduling): cp-sat parity harness + fixtures

   Side-by-side parity testing of legacy solveV2 vs CP-SAT sidecar on three
   scale tiers (tiny / stress-a baseline / synthetic Irish secondary) plus
   four adversarial fixtures. CP-SAT beats legacy on placement completeness
   <stats>, matches on hard violations (0), and is deterministic under
   fixed seed. Parity report at /tmp/parity-report-<date>.md.

   Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
   ```

## Testing requirements

- Parity test harness passes CI.
- Generated parity report attached to the completion entry.
- Skip-safe when the sidecar isn't running (CI that doesn't spin up Python still passes, just with a skipped test).

## Acceptance criteria

- [ ] All three tier fixtures and four adversarial fixtures checked in.
- [ ] Parity harness runs end-to-end.
- [ ] CP-SAT ≥ legacy on entries placed across all tiers.
- [ ] CP-SAT matches legacy on hard violations (both 0).
- [ ] CP-SAT deterministic under fixed seed.
- [ ] Parity report generated with full metrics table.
- [ ] Local commit created.
- [ ] Completion entry appended with the full parity metrics table.

## If something goes wrong

- **Parity test flakes on CI:** make sure the test skips if the sidecar isn't reachable rather than failing. Actual parity validation happens on developer machines + the server in Stage 7.
- **CP-SAT regresses on specific fixture:** freeze a minimal reproducing case in a dedicated test file, add to Stage 3/4 test suite, fix in Stage 3/4 scope. Do not ship Stage 5 with a known regression.
- **Solve duration is worse on Tier 1 (tiny):** CP-SAT has fixed startup + presolve overhead (~200-500ms). For truly tiny inputs legacy might win on wall clock. Acceptable — the important tier is Tier 2 and 3.

## What the completion entry should include

- Full parity metrics table (tier × metric).
- Parity report file path.
- Any fixtures that had to be tweaked before both backends agreed.
- Commit SHA.
