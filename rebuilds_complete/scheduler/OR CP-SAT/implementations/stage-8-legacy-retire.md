# Stage 8 — Legacy retire

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 7 is `complete` and Stage 8 is `pending`.

## Purpose

Stage 7 cut every tenant over to CP-SAT atomically. The hand-rolled TypeScript solver still lives in the repo — kept there as a safety net so a `git revert` of Stage 7 can restore the previous engine in under a minute. That safety net is now being retired: 7 days of clean operation under CP-SAT means the legacy code no longer earns its maintenance overhead.

This stage deletes the legacy solver files, cleans up the scaffolding that supported the dual-path era, and closes the solver-specific SCHED-### bugs that CP-SAT resolved. After this stage, `apps/solver-py/` is the only scheduling engine in the codebase.

## Prerequisites

- **Stage 7 complete** and stable for **≥ 7 days** on production.
- No `CpSatSolveError` in the worker logs during that window.
- No P0/P1 scheduling bugs open.
- Full `turbo test` still green.

## Commit & deploy discipline (every session, non-negotiable)

- **Commit locally only.** `git commit` is fine; `git push`, `git push --force`, `gh pr create`, or any GitHub web-UI interaction are **forbidden**. `main` is rebased manually every ~2 days — pushing breaks that flow.
- **Deploy via rsync + SSH** directly to `root@46.62.244.139`. Server access is granted for this migration; use it. Never via GitHub Actions or any CI pipeline (a CI run takes ~3 hours and would stall the migration).
- **Acquire the server lock** at `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH, pm2, or rsync action. Release it with a summary when done.

This stage deploys the deletions to production (a worker rebuild + restart). Lock is required.

---

## Scope — delete everything the cutover made dead code

### A. Delete the legacy TS solver files

```
packages/shared/src/scheduler/solver-v2.ts
packages/shared/src/scheduler/solver-v2.spec.ts                  (if separate)
packages/shared/src/scheduler/constraints-v2.ts
packages/shared/src/scheduler/constraints-v2.spec.ts
packages/shared/src/scheduler/domain-v2.ts
packages/shared/src/scheduler/domain-v2.spec.ts                  (if separate)
packages/shared/src/scheduler/soft-scoring-v2.ts                 (or whatever the soft-scoring file is called)
packages/shared/src/scheduler/validateSchedule.ts                (if it only supports legacy output shape; otherwise keep)
packages/shared/src/scheduler/__tests__/solver-v2.test.ts
packages/shared/src/scheduler/__tests__/constraints-v2.test.ts
```

**Keep:**

- `packages/shared/src/scheduler/types-v2.ts` — the `SolverInputV2` / `SolverOutputV2` types. These are the contract; Stage 10 reshapes them.
- `packages/shared/src/scheduler/cp-sat-client.ts` + spec. The one remaining client.
- `packages/shared/src/scheduler/__tests__/cp-sat-parity.test.ts` — repurpose as a **CP-SAT regression harness**. Edit to run only against CP-SAT (no legacy call).
- `packages/shared/src/scheduler/__tests__/fixtures/*.json` — valuable regression fixtures.
- `packages/shared/src/scheduler/__tests__/class-subject-override.test.ts` — SCHED-023 regression test; update to call the CP-SAT sidecar or convert to a pure input-generation test.

### B. Clean up the package's index exports

`packages/shared/src/scheduler/index.ts` — remove every export of a deleted symbol: `solveV2`, `validateSchedule` (if deleted), `buildConstraints`, `generateTeachingVariables`, etc. Keep only what Stage 6 + Stage 7 rely on:

- Types from `types-v2.ts`.
- `solveViaCpSat` + `CpSatSolveError` + `CpSatClientOptions` from `cp-sat-client.ts`.

### C. Verify nothing outside `scheduler/` imports the deleted symbols

```bash
grep -rn "solveV2\|constraintsV2\|domainV2\|softScoringV2\|generateTeachingVariables\|validateSchedule" apps/ packages/
```

Every hit must be resolved. Expected remaining references:

- Documentation and bug-log entries — leave untouched (historical).
- `scheduler/OR CP-SAT/` planning docs — leave untouched (historical).

### D. Update the worker processor if anything still references legacy symbols

The Stage 6 change already removed `solveV2` at the integration site. Double-check by re-reading `apps/worker/src/processors/scheduling/solver-v2.processor.ts`. Delete any remaining legacy imports, comments, or commented-out legacy branches.

### E. Close resolved SCHED-### bugs in the bug log

Update `E2E/5_operations/Scheduling/BUG-LOG.md`:

- **SCHED-017** (partial completion flipped to failed) — status: `Resolved by CP-SAT migration (Stage 7+8)`. Verify CP-SAT produces 100% placement on the baseline stress-a fixture per Stage 9 evidence.
- **SCHED-018** (class-level preferred_room not threaded) — re-test against CP-SAT; if honoured, mark Resolved.
- **SCHED-024** (isolated-singleton doubles) — CP-SAT's double-period modelling should cover this; re-test and close if clean.
- **SCHED-025** (non-determinism) — status: `Resolved by CP-SAT migration`. Verified by STRESS-086 (to be added in Stage 9).
- **SCHED-026** (quality metrics) — already populated; verify the UI renders CP-SAT metric values correctly.

For each closure, append a short note to the bug-log entry describing how CP-SAT resolved it (link the relevant run ID from the Stage 9 validation).

### F. Run the full test suite

```bash
turbo lint
turbo type-check
turbo test
```

All three must be clean after deletions.

### G. DI smoke test

Per `CLAUDE.md` → "Module registration discipline". Must print `DI OK`.

## Non-goals

- **Do not** reshape the contract (`SolverInputV2` / `SolverOutputV2` stay as-is). Stage 10.
- **Do not** touch `assembleSolverInput`. Stage 11.
- **Do not** run a DB migration. There are no DB schema changes here.
- **Do not** delete `apps/solver-py/`. It's the only solver.

## Step-by-step

1. Acquire server lock.
2. Confirm 7-day window of clean CP-SAT operation via `pm2 logs worker` + run-status query in DB.
3. Delete the legacy TS files listed above.
4. Update `packages/shared/src/scheduler/index.ts` to drop deleted exports.
5. Update `cp-sat-parity.test.ts` to run only against CP-SAT (rename to `cp-sat-regression.test.ts` if the "parity" name no longer makes sense).
6. Grep for remaining references; resolve each.
7. Update `E2E/5_operations/Scheduling/BUG-LOG.md` — close resolved SCHED-### entries.
8. Run `turbo lint`, `turbo type-check`, `turbo test` — all clean.
9. DI smoke test — `DI OK`.
10. Commit locally:

    ```
    refactor(scheduling): retire legacy typescript solver (cp-sat is the only engine)

    7-day clean window under cp-sat since stage-7 cutover. Deleting legacy:
    - solver-v2.ts, constraints-v2.ts, domain-v2.ts, soft-scoring-v2.ts
    - associated specs
    - legacy exports from packages/shared/src/scheduler/index.ts

    Kept: types-v2.ts (contract; stage 10 reshapes), cp-sat-client, fixtures,
    class-subject-override + parity tests repurposed as cp-sat regression
    harness.

    Closed SCHED-017 (partial completion), SCHED-018 (preferred room),
    SCHED-024 (isolated doubles), SCHED-025 (non-determinism) in bug log
    with cp-sat run-id evidence. SCHED-026 verified still populated.

    Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
    ```

11. Rsync the deletions + index.ts to server, rebuild `@school/shared` + `@school/worker`, `pm2 restart worker`. Sidecar untouched.
12. 24h observation — `pm2 logs worker` for `CpSatSolveError`. Should still be zero.
13. Release server lock.

## Testing requirements

- `turbo lint`, `turbo type-check`, `turbo test` all green post-deletion.
- DI smoke test clean.
- 24h post-deploy observation: no new errors.
- Worker continues to solve successfully on stress-a (spot-check).

## Acceptance criteria

- [ ] Legacy TS solver files deleted (list in "Scope A" above).
- [ ] `packages/shared/src/scheduler/index.ts` cleaned; only CP-SAT surface + types remain.
- [ ] `grep` finds no remaining references to `solveV2 / constraintsV2 / domainV2 / softScoringV2` in `apps/` or `packages/` outside history / planning docs.
- [ ] SCHED-017, 018, 024, 025 closed in BUG-LOG.md with CP-SAT evidence; SCHED-026 re-verified.
- [ ] Full test suite green.
- [ ] DI smoke test clean.
- [ ] Deployed; worker restart successful; 24h observation clean.
- [ ] Commit created.
- [ ] Completion entry appended.

## If something goes wrong

- **A test fails after deletion:** something still references a deleted symbol. `grep` to find, resolve. Most likely culprits: worker spec files, shared `index.ts`, parity-test imports.
- **The worker can't start after rebuild:** check `@school/shared` exports. If `solveViaCpSat` was accidentally dropped too, re-add. DI smoke test catches this.
- **A post-deploy `CpSatSolveError` appears:** rollback Stage 8 (revert the deletions commit). Legacy is in git history; restoring is one revert + rsync away. But investigate first — Stage 7 proved CP-SAT is solid, so a sudden post-Stage-8 error is weird and probably unrelated to the deletion.

## What the completion entry should include

- File list actually deleted (git status + summary).
- Which SCHED-### bugs were closed and the run ID(s) proving it.
- Post-deletion test suite count + coverage delta.
- Size reduction: `wc -l` before / after on `packages/shared/src/scheduler/`.
- Commit SHA.
