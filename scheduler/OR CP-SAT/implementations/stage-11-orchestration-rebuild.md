# Stage 11 — Orchestration rebuild (assembleSolverInput from scratch)

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 10 is `complete` (v3 contract shipped alongside v2) and Stage 11 is `pending`.

## Purpose

`scheduler-orchestration.service.assembleSolverInput` is 700+ lines of TypeScript that:

- loads tenant data through a constellation of `*ReadFacade` classes,
- hand-threads it into the `SolverInputV2` shape,
- layers in SCHED-013 / 017 / 018 / 023 / 025 / 026 / 028 patches over the years,
- coerces Prisma result types into solver types via deep casts.

It works. Stage 9's stress re-run proved it. But it's become complex enough that the blast radius of any change touches the whole file. This stage rebuilds it **from scratch** against the Stage-10 v3 contract, removes the scar tissue, and makes the orchestration layer small enough to own comfortably.

When this stage finishes, the worker calls `solveViaCpSatV3`, the orchestration emits `SolverInputV3`, the sidecar's v2 endpoint + v2 types + v2 client path all get deleted, and `assembleSolverInput` fits in a readable ~250 lines.

## Prerequisites

- **Stage 10 complete.** v3 contract defined on both sides; sidecar serves both v2 and v3 endpoints.
- v2 runs still tagged `'v2'` in `result_json`; v3 hasn't produced runs yet.

## Commit & deploy discipline (every session, non-negotiable)

- **Commit locally only.** `git commit` is fine; `git push`, `git push --force`, `gh pr create`, or any GitHub web-UI interaction are **forbidden**. `main` is rebased manually every ~2 days — pushing breaks that flow.
- **Deploy via rsync + SSH** directly to `root@46.62.244.139`. Server access is granted for this migration; use it. Never via GitHub Actions or any CI pipeline (a CI run takes ~3 hours and would stall the migration).
- **Acquire the server lock** at `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH, pm2, or rsync action. Release it with a summary when done.

This stage ends with **two production deploys** — the v3 switchover and, after a 3-day observation window, the v2 deletion. Lock required for both.

---

## Scope — rebuild, not refactor

This is a rebuild. Start from an empty file and write it fresh. The existing `assembleSolverInput` is reference, not scaffold.

### A. Decompose the orchestration layer

Today `scheduler-orchestration.service.ts` is ~1400 lines. After this stage it should split into:

```
apps/api/src/modules/scheduling/orchestration/
├── scheduler-orchestration.service.ts    (thin: triggerRun / cancelRun / applyRun; no assembly logic)
├── assemble-solver-input.ts              (the rebuilt assembly; emits SolverInputV3)
├── assemble/
│   ├── load-tenant-data.ts               (single pass: facades → normalised records)
│   ├── build-period-slots.ts             (weekday/period_order → integer indexes)
│   ├── build-demand.ts                   (curriculum + overrides → demand[])
│   ├── build-preferences.ts              (teacher prefs + curriculum soft signals → PreferencesV3)
│   ├── build-pinned.ts                   (schedule table → PinnedAssignmentV3[])
│   └── build-constraint-snapshot.ts      (every non-default decision → audit entries)
└── verify-input.ts                        (pre-flight checks; replaces the ad-hoc "prerequisites" logic)
```

Each file is ≤ 200 lines and has a single purpose. Each has its own spec.

### B. Read every SCHED-### in scope and ensure the rebuild preserves the fix

Legacy scar tissue that must be carried across as **first-class orchestration behaviour**, not as patches:

- **SCHED-013** — RLS context must be set on every DB access. `load-tenant-data.ts` uses the existing `createRlsClient` transaction pattern. No raw Prisma queries outside RLS.
- **SCHED-017** — a run with unfulfilled demand must be marked `failed`, not `completed`. This is now semantically enforced by the v3 contract's `solve_status`: the worker maps `solve_status === 'FEASIBLE' && unassigned.length > 0` to run status `failed`. The orchestration doesn't need to care.
- **SCHED-018** — `class_scheduling_requirements.preferred_room_id` is threaded. `build-preferences.ts` surfaces it in `PreferencesV3.class_preferences[].preferred_room_id`. No longer dropped.
- **SCHED-023** — class-subject overrides supersede year-group baseline. `build-demand.ts` handles this explicitly, emitting one `DemandV3` row per `(class, subject)` and respecting overrides. The legacy "override filter in `domain-v2.ts`" is gone; the shape makes the behaviour implicit.
- **SCHED-024** — isolated-singleton doubles. CP-SAT's native double-period modelling handles this; no orchestration action required.
- **SCHED-025** — determinism under seed. `settings.solver_seed` is passed to the sidecar as today.
- **SCHED-026** — quality metrics. Emitted by the sidecar; orchestration doesn't touch them.
- **SCHED-028** — archived teachers filtered. `load-tenant-data.ts` filters `employment_status === 'active'` at source. One line; no downstream opportunity to re-introduce archived teachers.

For each, the rebuild must include a pytest (on the sidecar side) or Jest test (on the orchestration side) that specifically asserts the expected behaviour. Name the test after the SCHED-###.

### C. Switch the worker to v3

After the new `assembleSolverInput` is emitting `SolverInputV3`, update `solver-v2.processor.ts` to call `solveViaCpSatV3` (from Stage 10). The worker is now entirely on v3; v2 is dead at runtime.

### D. Delete v2 code

Once v3 runs on prod and has been stable for ≥ 3 days:

- Delete `types-v2.ts`.
- Delete `cp-sat-client.ts`'s legacy `solveViaCpSat` function; keep only `solveViaCpSatV3` (rename to `solveViaCpSat` if you prefer — the "v3" suffix is now noise).
- Delete the sidecar's `/solve` endpoint + v2 pydantic models.
- Delete the `result_schema_version` branch in every consumer; every run is v3 now. (Old v2 runs in the DB are historical — leave them alone, but every read path now just reads v3 shape.)
  - Exception: if historical v2 runs in the DB need to be displayed, write a one-shot read-time adapter that converts v2-shaped `result_json` to v3 shape on the fly. Simpler than migrating the data.

### E. Update docs

- `scheduler/OR CP-SAT/PLAN.md` → "The flow, end-to-end" diagram updated for v3.
- `docs/architecture/event-job-catalog.md` → the `scheduling:solve-v2` job name stays (data in BullMQ is historical); but the body documentation updates to v3 shape.

## Non-goals

- **Do not** introduce new features in the solver. This is a clean rebuild of the existing behaviour on a cleaner contract, nothing more.
- **Do not** change DB schema.
- **Do not** change `triggerSolverRun` / `cancelRun` / `applyRun` public API shapes. The HTTP contract those endpoints expose is unrelated to the solver input shape.

## Step-by-step

1. Acquire server lock.
2. Scaffold the new `orchestration/` directory.
3. Rebuild `load-tenant-data.ts` first — it's the foundation. Write its spec. Green.
4. Rebuild `build-period-slots.ts`. Spec. Green.
5. Rebuild `build-demand.ts` (SCHED-023-sensitive — specific test). Green.
6. Rebuild `build-preferences.ts` (SCHED-018-sensitive — specific test). Green.
7. Rebuild `build-pinned.ts`. Spec. Green.
8. Rebuild `build-constraint-snapshot.ts`. Spec. Green.
9. Rebuild `assemble-solver-input.ts` — the top-level orchestrator. Composes the above into a `SolverInputV3`. Spec covers end-to-end.
10. Rebuild `verify-input.ts` — pre-flight checks. Covers prerequisites that were previously embedded in `triggerSolverRun`.
11. Slim `scheduler-orchestration.service.ts` — it now dispatches to `assemble-solver-input.ts` and does nothing solver-related itself. ~400 lines → ~150 lines.
12. Switch the worker to `solveViaCpSatV3`. Update `solver-v2.processor.spec.ts`.
13. Full `turbo test` + `turbo type-check` + `turbo lint` + sidecar pytest + ruff + mypy — all green. Any failure here blocks deploy.
14. DI smoke test — `DI OK`.
15. Parity: run the Stage-5 parity harness against the new orchestration. v3 output vs legacy v2 output on the same Tier 2 input — semantic equivalence asserted.
16. Commit locally:

    ```
    refactor(scheduling): rebuild assembleSolverInput on v3 contract

    Replaces 1400-line scheduler-orchestration.service.ts with a decomposed
    orchestration layer: load-tenant-data, build-period-slots, build-demand,
    build-preferences, build-pinned, build-constraint-snapshot + a thin
    assembleSolverInput orchestrator. Every SCHED-013/017/018/023/024/025
    /026/028 behaviour carried as first-class orchestration logic with a
    named regression spec. Worker switched to solveViaCpSatV3.

    Code surface: 1400 → <N> lines. Per-file cap 200 lines. Every SCHED-###
    spec named after its bug.

    v2 shape deletions happen in a follow-up commit after ≥ 3 days of
    stable v3 runs on prod.

    Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
    ```

17. Rsync, rebuild api + worker + shared, `pm2 restart api worker`. Sidecar already has the v3 endpoint from Stage 10.
18. Smoke on stress-a, stress-b, nhqs — all three solve via v3 end-to-end. `result_json.result_schema_version === 'v3'`.
19. Release server lock. Observe 3 days.
20. After 3 days clean: follow Section D to delete v2 code. Separate commit, separate deploy, same level of rigour.

## Testing requirements

- Per-file spec for each decomposed orchestration module.
- Integration test for `assembleSolverInput` end-to-end producing `SolverInputV3`.
- Named SCHED-### regression specs (one per bug in the "scar tissue" list).
- Stage-5 parity harness re-run post-rebuild, v2 vs v3.
- Stage-9 stress-scenario subset re-run on the rebuilt orchestration: STRESS-001, STRESS-035, STRESS-040, STRESS-046, STRESS-076, STRESS-079, STRESS-086. If all seven pass, rebuild is trustworthy.
- 3-day observation window between v3 switchover and v2 deletion.

## Acceptance criteria

- [ ] Orchestration decomposed into ≤200-line modules under `orchestration/`.
- [ ] `assembleSolverInput` emits `SolverInputV3`.
- [ ] Every SCHED-### in scope has a named regression spec that asserts its fix.
- [ ] Worker calls `solveViaCpSatV3`.
- [ ] Parity v2 vs v3 on Tier 2 shows semantic equivalence.
- [ ] 7-scenario stress subset re-run green.
- [ ] 3-day post-deploy observation clean.
- [ ] v2 deletion commit created and deployed (after 3-day window).
- [ ] Completion entry appended in `../IMPLEMENTATION_LOG.md`.

## If something goes wrong

- **The rebuild introduces a subtle regression not caught by specs:** the Stage-9 scenario subset is the second line of defence. If a scenario fails, isolate the specific orchestration module, add a regression spec, fix, redeploy.
- **v3 behaviour diverges from v2 on an input nobody thought about:** roll back by reverting the "switch worker to v3" commit. v2 code still exists at that point. Investigate offline, fix, retry.
- **v2 deletion breaks a forgotten consumer:** the `result_schema_version` branch should have kept old consumers working, but if one missed the Stage-10 update, `grep` for `result_json` usages. Fix in a patch commit.

## What the completion entry should include

- Line-count reduction: before / after for `scheduler-orchestration.service.ts` + total orchestration surface.
- List of decomposed modules with spec locations.
- Named SCHED-### regression specs with paths.
- Parity and stress-subset evidence.
- v2 deletion commit SHA.
- Final rating of the solver (was 2.5/5 at end of Wave 2; track progression).
