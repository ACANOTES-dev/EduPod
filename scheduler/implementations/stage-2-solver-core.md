# Stage 2 — Solver core updates

**Before you start:** open `../IMPLEMENTATION_LOG.md`. Confirm Stage 1 is `complete`. If not, stop — Stage 1 owns the schema change this stage depends on. Read Stage 1's completion entry to understand what was deployed and any surprises flagged.

## Purpose

Update the V2 solver to understand the hybrid `pool + pin` model introduced in Stage 1:

- Each `(class, subject)` in the curriculum is resolved first by looking for a **pin** (`class_id` matches), then by falling back to the **pool** (`class_id IS NULL` for that year group).
- Pinned slots have their teacher fixed before the search; the solver only picks time + room for them.
- Remove `is_primary` from every scoring path — it no longer exists on the table.
- Tighten the prerequisite check: every `(class, subject)` must have _either_ a pin _or_ at least one pool entry.

After this stage the solver and prereq service compile and behave correctly, but no live generation has been tested end-to-end yet — that is Stage 6.

## Prerequisites

- Stage 1 complete and deployed: `teacher_competencies` has `class_id` (nullable), no `is_primary`, and `cover-teacher.service` is gone.
- No other prerequisites.

## Scope — files that change

### Types

`packages/shared/src/scheduler/types-v2.ts`

- `TeacherCompetencyEntry` — replace `is_primary: boolean` with `class_id: string | null`.
- Add a discriminator concept in comments: `class_id === null → pool`; `class_id !== null → pin`.

### Solver core

`packages/shared/src/scheduler/solver-v2.ts`

- In the domain-generation pass, for each `(class, subject)` variable:
  1. Look up pins first: `competencies.filter(c => c.class_id === class.id && c.subject_id === subject.id)`. If a pin exists, the variable's domain for **teacher** is a singleton.
  2. Else look up pool: `competencies.filter(c => c.class_id === null && c.year_group_id === class.year_group_id && c.subject_id === subject.id)`. The variable's domain for teacher is the list of pool entries.
  3. If neither, emit the variable as unsatisfiable (solver fails fast; prereqs should have caught this).
- Remove the scoring arithmetic that adds `+50` for primary and `-15` for non-primary. Replace with a flat `0`. The solver's soft-score function must be re-tested to ensure the total max score still sums correctly (`soft_preference_max` on the run record).

`packages/shared/src/scheduler/domain-v2.ts`

- If this file constructs the `candidateTeachersFor(class, subject)` map, update it to the two-step lookup above.
- Add a helper `getTeacherAssignmentMode(class, subject, competencies): 'pinned' | 'pool' | 'missing'` for clarity and for reuse in prereq checks.

`packages/shared/src/scheduler/constraints-v2.ts`

- Any hard-constraint code that uses `is_primary` is dead and must be deleted.
- If there is an explicit teacher-double-booking check keyed on staff_id, nothing to change there — the constraint is teacher-scoped regardless of pin/pool.

`packages/shared/src/scheduler/validation.ts`

- The post-solver validator should no longer score `is_primary`. Update any `maxScore` constants accordingly.
- Add a validation: every entry in the produced schedule has a teacher assignment. (Paranoid check; solver should already guarantee this.)

`packages/shared/src/scheduler/index.ts`

- Re-export any newly added helpers (`getTeacherAssignmentMode`).

### Prereq service

`apps/api/src/modules/scheduling-runs/scheduling-prerequisites.service.ts`

- Change the "every curriculum entry has at least one primary teacher" check to: "every `(class, subject)` in the curriculum has at least one eligible teacher (pin or pool)."
- Iterate over each class in each year group that has curriculum, not over `(year_group, subject)`.
- Emit per-class failure details so the UI can point at which subclass is short a teacher.

### Orchestration read model

`apps/api/src/modules/scheduling/scheduler-orchestration.service.ts`

- Where it fetches teacher competencies to build the config snapshot, include the `class_id` field. No other change in Stage 2; Stage 3 rewires the DTO shape end-to-end.

## Non-goals

- Do **not** touch the `teacher-competencies.controller.ts` or `.service.ts` API surface or the Zod DTOs in `packages/shared`. That is Stage 3.
- Do **not** touch the frontend. That is Stage 4.
- Do **not** seed or wipe data. That is Stage 5.
- Do **not** trigger a live run. That is Stage 6.

## Step-by-step

1. Read current state of every file listed under "Scope". Diff it against this plan. If something has changed since the plan was written, update the plan doc first and note it in the log.
2. Update `types-v2.ts`. Run `turbo type-check` after the single-file edit to see which downstream files now break — this is your dependency map for the rest of the work.
3. Update `solver-v2.ts` and `domain-v2.ts` together. Write the pin-first two-step lookup as a single helper (`resolveTeacherCandidates`) that returns `{ mode: 'pinned', teacher_id } | { mode: 'pool', teacher_ids: string[] } | { mode: 'missing' }`. Use it in one place.
4. Delete `is_primary` scoring everywhere. Grep: `grep -rn "is_primary" packages/shared/src/scheduler/`. Every hit must be removed or become dead code deleted.
5. Update `validation.ts` — adjust `max_score` constants so `(achieved / max) * 100` still produces sensible health scores. Document the new max in a comment.
6. Update `scheduling-prerequisites.service.ts` — per-class check. Use `resolveTeacherCandidates` from the shared package for consistency with the solver.
7. Update `scheduler-orchestration.service.ts` to `SELECT class_id` alongside the existing fields. Map it into the solver input.
8. Run `turbo type-check` on `packages/shared`, `apps/api`, `apps/worker`. Must be clean in these workspaces (other spec-file warnings in unrelated modules are acceptable).
9. Run `turbo lint` on the same workspaces.
10. Write / update unit tests (see "Testing requirements" below).
11. Run DI smoke test from `../PLAN.md`. Must print `DI OK`.
12. Deploy:
    - Rsync `packages/shared/src/scheduler/**`, `apps/api/src/modules/scheduling-runs/**`, and `apps/api/src/modules/scheduling/scheduler-orchestration.service.ts`.
    - Rebuild `@school/api` and `@school/worker` on the server (both consume the shared package).
    - Restart `api` and `worker` PM2 processes.
13. Smoke-test on prod (no actual scheduler run yet — just verify it compiles):
    - `sudo -u edupod pm2 logs api --lines 30 --nostream` — clean.
    - `sudo -u edupod pm2 logs worker --lines 30 --nostream` — clean.
    - Hit the prerequisites endpoint: `curl -H 'cookie: ...' https://api.nhqs.edupod.app/api/v1/scheduling-runs/prerequisites?academic_year_id=<current>`. Must return a well-formed response (even if it says prereqs fail — that's expected, we haven't seeded yet).
14. Commit locally and append completion entry to the log.

## Testing requirements

### Unit tests (mandatory)

Add or update tests in `packages/shared/src/scheduler/solver-v2.spec.ts`:

- **Pin-only case:** one competency with `class_id = '2A'`, no pool entries. Solver must assign the pinned teacher to 2A and fail prereq (or produce unassigned) for any other 2-class curriculum entry.
- **Pool-only case:** three competencies with `class_id = NULL` for Year 2 English. Solver must assign one of the three teachers to each of 2A and 2B. Teachers can be reused across sections; solver's double-booking check handles temporal conflicts.
- **Mixed:** pin Sarah to 2A English, pool David and Michael for Year 2 English. Solver assigns Sarah to 2A (fixed), picks David or Michael for 2B.
- **Missing:** curriculum requires 2A English; no pin, no pool. Prereq check rejects.
- **Preference satisfaction max-score:** construct a seeded run with no preferences and verify `soft_preference_max` returned from `validation.ts` matches the new constant (document the new max alongside).

Add or update tests in `apps/api/src/modules/scheduling-runs/scheduling-prerequisites.service.spec.ts`:

- Curriculum has `(Year 2, English)`; teacher has pool entry for Year 2 English; class 2A and 2B both exist → prereq passes.
- Same as above but only 2A has a class-level competency, 2B has neither pin nor pool → prereq fails with an error that identifies 2B specifically.

### Integration

Run the full `apps/api` test suite: `pnpm --filter @school/api test`. Must be green.

### Browser

This stage is server-only and has no user-visible change yet. A browser pass is **not required** for Stage 2 — the UI still uses the pre-stage-3 API shape. Document explicitly in the log that Playwright was skipped and why.

### Coverage

Coverage on `packages/shared/src/scheduler/` should improve with the new tests. Check the delta and ratchet `jest.config.js` if coverage went up. Never lower a threshold.

## Acceptance criteria

- [x] All listed files updated.
- [x] No `is_primary` references remain in `packages/shared/src/scheduler/` or `apps/api/src/modules/scheduling*/`.
- [x] `turbo type-check` clean for `@school/shared`, `@school/api`, `@school/worker`.
- [x] DI smoke test `DI OK`.
- [x] New unit tests cover pin-only, pool-only, mixed, and missing cases.
- [x] Prereq service tests cover per-class success and failure.
- [x] Deployed to prod; api and worker restart clean; no boot errors.
- [x] Prerequisites endpoint reachable and returns a valid payload.
- [x] Local commit; nothing pushed.
- [x] Completion entry appended to the log with the test list.

## If something goes wrong

- **Solver tests fail with "domain empty"**: you likely missed the fallback from pin → pool in `resolveTeacherCandidates`. Add logging and re-run.
- **Prereq check accepts a pool-only setup where the pool is empty**: the per-class iteration is wrong. Iterate classes inside year_group, not year_group alone.
- **Worker fails to start on prod**: shared package not rebuilt. Ensure `packages/shared` was transpiled, or that the worker imports from source per the existing tsconfig (check `apps/worker/tsconfig.json`).
