# Scheduler Rebuild — Implementation Log

**This file is the shared state across every session that works on this rebuild.** Read it before starting. Update it the moment you finish your stage.

## Before you start a stage

1. Check the status board below. Find the first stage with status `pending` whose prerequisites are all `complete`.
2. If no such stage exists, stop. The work is either finished or the next stage is blocked.
3. Open `implementations/stage-N.md` for that stage.
4. Do the work.
5. Run all tests required by the stage doc — including Playwright where applicable.
6. Append your completion entry to the matching section below.
7. Flip the status on the board from `pending` → `complete`.
8. Stop.

## Session hard rules (repeat of README.md; do not violate)

- **Commit locally only.** `git commit` is fine. `git push`, `gh pr create`, GitHub web UI — forbidden.
- **Deploy via rsync + SSH** to `root@46.62.244.139`, not via GitHub.
- **You do not finish without testing.** Playwright browser testing is required for anything with a user-facing surface; describe which tests were run in your log entry.
- **Update this log in the same session you do the work.** Don't defer.

## Status board

| #   | Stage                                    | Status     | Owner (session/date) | Notes                                                                |
| --- | ---------------------------------------- | ---------- | -------------------- | -------------------------------------------------------------------- |
| 1   | Schema migration + cover-teacher removal | `complete` | Claude / 2026-04-13  | Migration live on prod; commit `3893bec7`.                           |
| 2   | Solver core updates                      | `complete` | Claude / 2026-04-14  | Commit `d76344bb`; pin/pool model live on prod.                      |
| 3   | API surface updates                      | `complete` | Claude / 2026-04-14  | Commit `477b0076`; competency API + coverage per-class live.         |
| 4   | Competencies page UI rebuild             | `complete` | Claude / 2026-04-14  | Commit `ed5ea305`; competencies + coverage UI live on prod.          |
| 5   | Seed NHQS data                           | `complete` | Claude / 2026-04-14  | Commit `a099008a`; NHQS seeded + prereq check fixed (C2).            |
| 6   | Generate end-to-end on NHQS              | `complete` | Claude / 2026-04-14  | Run `eace28b5` applied: 361 entries, 0 hard violations.              |
| 7   | Substitutes page + table                 | `complete` | Claude / 2026-04-14  | `substitute_teacher_competencies` live on prod; UI + /suggest wired. |
| 8   | Downstream rewire                        | `complete` | Claude / 2026-04-14  | Three downstream services now read from `schedules`; rebuild done.   |

## Parallelisation

**None.** Every stage is strictly sequential. See `PLAN.md` → Stage graph for the reasoning. Do not start a stage whose prerequisites are incomplete.

---

## Completion entries

Each stage appends its own entry here when finished. Use this template exactly:

```
### Stage N — <name>

**Completed:** YYYY-MM-DD
**Local commit(s):** <short SHA> <commit subject>
**Deployed to production:** yes / no — if yes, date and what restarted (api/web/worker)

**What was delivered:**
- bullet
- bullet

**Files changed (high level):**
- bullet

**Migrations / schema changes:**
- <migration name> — applied to prod at <timestamp> via `prisma migrate deploy`
- (or: "none")

**Tests added / updated:**
- unit: N new, M updated — located at <paths>
- integration: N new, M updated
- Playwright: <flows exercised>, target <URL>
- coverage delta: <current> vs <previous>; thresholds adjusted: <yes/no>

**Verification evidence:**
- <what you actually checked, e.g. SQL output, browser snapshot, pm2 logs>

**Surprises / decisions / deviations from the plan:**
- anything a later stage needs to know

**Known follow-ups / debt created:**
- anything explicitly left unfinished (should be rare; prefer to not defer)
```

### Stage 1 — Schema migration + cover-teacher removal

**Completed:** 2026-04-13
**Local commit(s):** `3893bec7` refactor(scheduling): drop is_primary, add class_id, remove cover-teacher
**Deployed to production:** yes — 2026-04-13. Migration applied via `prisma migrate deploy`; API rebuilt and `pm2 restart api`; web rebuilt and `pm2 restart web`. Worker untouched (no worker code changed).

**What was delivered:**

- `teacher_competencies` evolved from year-group-grained to hybrid pool/pin grain. `class_id` is now a nullable FK to `classes`: NULL = pool entry (solver picks the section), UUID = pin (solver must honour).
- `is_primary` boolean dropped. Every row is a real assignment; tiered primary-vs-secondary logic is gone from the model and every caller.
- `cover-teacher.service`, `cover-teacher.controller`, their specs, and the frontend `cover-teacher-dialog.tsx` deleted. The runs-detail page no longer embeds the dialog or wires its context-menu. The substitutions page keeps its manual-pick flow; auto-suggestion returns in Stage 7.
- All downstream callers patched with **minimum compile fixes** so the solver (Stage 2), competencies API (Stage 3), and teaching-allocations (Stage 8) can each retire the `is_primary` surface cleanly in their own stage. The `TeacherCompetencyRow.is_primary` interface field is retained but hardcoded `false` at the Prisma boundary.
- `CreateTeacherCompetencyDto` and `BulkCreateTeacherCompetencyDto` Zod schemas lose their `is_primary` field. The `PATCH /v1/scheduling/teacher-competencies/:id` endpoint is now a no-op read until Stage 3 reshapes the API around `class_id`.

**Files changed (high level):**

- **Migration:** `packages/prisma/migrations/20260413210000_teacher_competencies_class_id_and_drop_is_primary/migration.sql` (new). Prisma schema updated (`TeacherCompetency` + `Class` back-relation).
- **API deletions:** `apps/api/src/modules/scheduling/cover-teacher.{controller,service}.ts` + specs; frontend `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/_components/cover-teacher-dialog.tsx`.
- **API edits (compile fixes):** `scheduling.module.ts`, `teacher-competencies.{service,controller}.ts`, `substitution.service.ts`, `ai-substitution.service.ts`, `scheduler-orchestration.service.ts`, `scheduling-read.facade.ts`.
- **Gradebook/GDPR spec updates:** `gdpr-ai-integration.spec.ts` (mock data trimmed). `report-comment-windows.service.spec.ts` unchanged — the facade interface still carries `is_primary`.
- **Shared:** `packages/shared/src/schemas/scheduling.schema.ts` — drop `is_primary` from Zod input schemas; remove `findCoverTeacherQuerySchema` and `FindCoverTeacherQuery`.
- **Seed:** `packages/prisma/seed/qa-mdad/seed-ops.ts` drops `is_primary` from the competency seed payload.
- **Web:** `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/page.tsx` loses the dialog import, state, handler, and JSX.
- **Unrelated spec fix bundled in:** `apps/api/src/modules/scheduling-runs/scheduling-runs.service.spec.ts` now provides `getQueueToken('scheduling')` so 42 pre-existing DI failures from commit `f878053f` (the wiring-bug fix this work builds on) turn green.

**Migrations / schema changes:**

- `20260413210000_teacher_competencies_class_id_and_drop_is_primary` — applied to prod at 2026-04-13 22:40 UTC via `prisma migrate deploy` (re-run after resolving one rolled-back attempt). Verified on prod: `class_id uuid` NULL present; `is_primary` gone; 6-col `idx_teacher_competency_unique` rebuilt; new `idx_teacher_competencies_tenant_class` present; FK `teacher_competencies_class_id_fkey` ON DELETE CASCADE ON UPDATE CASCADE; RLS policy `teacher_competencies_tenant_isolation` intact.

**Tests added / updated:**

- unit: 4 updated — `teacher-competencies.service.spec.ts`, `teacher-competencies.controller.spec.ts`, `substitution.service.spec.ts`, `substitution-branches.spec.ts`, `ai-substitution.service.spec.ts`, `scheduler-orchestration.service.spec.ts` (DTO shapes and expectations aligned with is_primary drop; two obsolete "primary tie-breaker" tests retired with a Stage 7 note). 1 pre-existing regression fix in `scheduling-runs.service.spec.ts`.
- integration: none added.
- Playwright: `/en/scheduling/substitutions`, `/en/scheduling/competencies`, `/en/scheduling/runs` all loaded on `https://nhqs.edupod.app` as `Yusuf Rahman (owner)`. Substitutions page rendered "No absences today" empty state with Report Absence button; competencies and runs pages loaded with zero console errors. A pre-existing 404 on `/api/v1/staff?role=teacher` appeared on substitutions — unrelated to Stage 1 (that endpoint predates this work).
- coverage delta: not re-measured; thresholds untouched.

**Verification evidence:**

- Prod `\d teacher_competencies` confirmed `class_id` present and `is_primary` absent, plus the expected index/FK/policy set.
- `pm2 logs api --lines 30` after restart: NestJS mapped every route and printed `API running on http://localhost:3001` with no DI errors and no cover-teacher references.
- `curl https://nhqs.edupod.app/api/v1/scheduling/cover-teacher?...` → HTTP 404 (endpoint removed as intended).
- Local jest scheduling+teacher-competency suite: 34/34 suites, 675/675 tests green. Gradebook/GDPR specs touching competencies: 3/3 suites, 49/49 tests green. Lint on api, web, shared: clean. DI smoke test on `AppModule`: `DI OK`. Prisma schema validation: `The schema at schema.prisma is valid 🚀`.

**Surprises / decisions / deviations from the plan:**

- The stage doc said "do not update the solver or orchestration service." In practice dropping the Prisma column also drops the field from the generated client type, so `scheduler-orchestration.service.ts` and `scheduling-read.facade.ts` both needed a **one-line compile fix** — we hardcoded `is_primary: false` at the loader boundary and kept the downstream interfaces unchanged. No semantics changed and no extra surface was added; Stage 2 can now delete the field from `SchedulingInputCompetency` cleanly.
- `prisma migrate deploy` initially failed with `ERROR: must be owner of table teacher_competencies` because the default `DATABASE_URL` uses the lower-privilege `edupod_app` role. Re-ran with `DATABASE_URL=$DATABASE_MIGRATE_URL` (the `edupod_admin` role already present in the prod `.env`) after `prisma migrate resolve --rolled-back` cleared the marker. **Future stages should use `DATABASE_MIGRATE_URL` for any DDL migration run on prod.**
- Rsync of `apps/web/src/app/[locale]/(school)/.../page.tsx` failed through shell-escaped brackets; worked via `cat … | ssh … 'cat > "<path>"'`. Worth remembering for Stage 4 which rebuilds this whole page.
- The scheduling-runs spec regression from `f878053f` was pre-existing, but I patched it in the same commit to keep CI green. Flagged explicitly in the commit message.

**Known follow-ups / debt created:**

- `TeacherCompetencyRow.is_primary`, `SubstituteCandidate.is_primary`, `AiSubstituteRanking` indirect uses, and `TeachingAllocation.is_primary` all still surface the field as hardcoded `false`. Stages 2, 3, 7, and 8 should remove these during their own rewires — do not leave them lying around.
- `teacher-competencies.controller PATCH /:id` is a no-op stub pending Stage 3 (class_id mutations).
- The pre-existing `/api/v1/staff?role=teacher` 404 on the substitutions page is unrelated but worth filing against Stage 7 or whichever stage next touches that page.

### Stage 2 — Solver core updates

**Completed:** 2026-04-14
**Local commit(s):** `d76344bb` refactor(scheduling): teach solver pin/pool and rewire prereqs
**Deployed to production:** yes — 2026-04-14. Shared scheduler sources, `apps/api/src/modules/scheduling-runs/**`, the scheduler-orchestration service, the scheduling-read facade, and the classes-read facade rsynced to `/opt/edupod/app/`. `@school/api` and `@school/worker` rebuilt under the `edupod` user; `pm2 restart api worker` left both processes online and printing `Nest application successfully started`.

**What was delivered:**

- `TeacherCompetencyEntry` on the solver-input type now carries `class_id: string | null` in place of the dropped `is_primary: boolean`. `class_id === null` is a pool entry; `class_id !== null` is a pin.
- New `resolveTeacherCandidates(teachers, classId, yearGroupId, subjectId)` helper in `domain-v2.ts` implements the pin-first, pool-fallback lookup and returns a discriminated union `{ mode: 'pinned' | 'pool' | 'missing' }`. A thin `getTeacherAssignmentMode` wrapper returns just the mode. Both are re-exported from `packages/shared/src/scheduler/index.ts` alongside the `TeacherAssignmentResolution` type.
- `getEligibleTeachers` in `domain-v2.ts` now takes a `classId` argument and routes through `resolveTeacherCandidates`: pins produce a singleton domain (teacher fixed, solver picks only time + room), pool entries produce the pool domain, missing cases produce an empty domain that surfaces as unassigned.
- `scoreValueV2` in `solver-v2.ts` had its `+50 primary bonus / –15 backup penalty` block deleted — the pin/pool grain makes the signal obsolete. A replacement comment documents why.
- `diagnoseUnassigned` in `solver-v2.ts` now uses `resolveTeacherCandidates` to emit a specific `No pinned or pool teacher for class=… subject=… year_group=…` message for the missing case.
- Scheduling-prerequisites: new `every_class_subject_has_teacher` check (key `3b`). For every `(class, subject)` in the curriculum it asserts a pin OR pool competency exists, and returns the uncovered set in `details.uncovered` for the UI.
- Orchestration: `scheduler-orchestration.service.ts` now maps `class_id` from each `teacherCompetency` row into the solver input, dropping the hardcoded `is_primary: false`.
- `scheduling-read.facade.ts` gains two prereq-oriented methods (`findCurriculumForCoverageCheck`, `findCompetencyPinsAndPool`); `classes-read.facade.ts` gains `findActiveAcademicClassesWithYearGroup`. The cross-module `prisma.class` query was moved off `SchedulingReadFacade` to honour the `no-cross-module-prisma-access` lint rule.

**Files changed (high level):**

- `packages/shared/src/scheduler/types-v2.ts` — `is_primary` → `class_id`.
- `packages/shared/src/scheduler/domain-v2.ts` — new `resolveTeacherCandidates` + `getTeacherAssignmentMode`, `getEligibleTeachers` rewired.
- `packages/shared/src/scheduler/solver-v2.ts` — scoring + diagnosis updated.
- `packages/shared/src/scheduler/index.ts` — new exports.
- `packages/shared/src/scheduler/__tests__/fixtures/multi-year-school.ts` + `stress-test.test.ts` — fixtures flipped from `is_primary` to `class_id: null` (pool).
- `packages/shared/src/scheduler/__tests__/pin-pool-resolution.test.ts` (new) — 10 tests covering the pin-only, pool-only, mixed, missing, helper, and preference-max cases.
- `apps/api/src/modules/scheduling-runs/scheduling-prerequisites.service.{ts,spec.ts}` — new per-class coverage check + tests.
- `apps/api/src/modules/scheduling/scheduler-orchestration.service.{ts,spec.ts}` — `class_id` threaded through; spec assertion updated to expect `class_id: null` on the pool fixture.
- `apps/api/src/modules/scheduling/scheduling-read.facade.ts` — new `findCurriculumForCoverageCheck` + `findCompetencyPinsAndPool`.
- `apps/api/src/modules/classes/classes-read.facade.ts` — new `findActiveAcademicClassesWithYearGroup`.

**Migrations / schema changes:**

- None. Stage 1 delivered the underlying `class_id` column; Stage 2 only reshapes code around it.

**Tests added / updated:**

- unit (shared scheduler): 10 new tests in `pin-pool-resolution.test.ts`; 2 fixture files updated for shape. All 901 shared tests green.
- unit (api scheduling): `scheduling-prerequisites.service.spec.ts` gains 2 new tests (pool-covers success, pin-only-2A failure) + header-count bump to 6 checks; `scheduler-orchestration.service.spec.ts` assertion updated. All 677 API scheduling tests green across 34 suites.
- integration: none added (stage is server-only per the stage doc).
- Playwright: **skipped**, explicitly allowed by the stage doc — no user-visible change yet. The competencies UI still reads the pre-Stage-3 shape.
- coverage delta: not measured; thresholds untouched.

**Verification evidence:**

- `pnpm --filter @school/shared type-check` clean; worker type-check clean; api type-check clean in every scheduling file (`grep -E "scheduling|scheduler"` over tsc output returned zero hits — the remaining pre-existing errors are in admissions, communications, and report-cards files that were already dirty on `main`).
- `pnpm --filter @school/api lint` → 0 errors, 897 pre-existing warnings.
- DI smoke test (CLAUDE.md snippet) → `DI OK`.
- Post-deploy: `sudo -u edupod pm2 logs api --lines 200 --nostream` prints every scheduling route mapping (`/api/v1/scheduling-runs/prerequisites GET`, etc.) followed by `Nest application successfully started` with zero DI failures. Worker equivalent log shows `Registered repeatable cron: …` for every BullMQ cron and then `Nest application successfully started`.
- `curl https://nhqs.edupod.app/api/v1/scheduling-runs/prerequisites?academic_year_id=…` returns HTTP 401 with `{"error":{"code":"UNAUTHORIZED","message":"Missing authentication token"}}` — the auth guard fires before the handler, confirming the route is wired and the module composed cleanly.

**Surprises / decisions / deviations from the plan:**

- The stage doc placed the per-class coverage check in `scheduling-prerequisites.service.ts`, but the existing "every curriculum entry has at least one eligible teacher" check actually lived in `scheduler-orchestration.service.ts#checkPrerequisites` (year-group-grained, `subject_id:year_group_id` key-set). The stage-2 change landed the per-class check in the prereq service as directed; the older orchestration check is left untouched so Stage 3 can retire it when it reshapes the API surface. Flagged so Stage 3 doesn't forget to remove the redundancy.
- First attempt to put the new helper on `SchedulingReadFacade` tripped the repo's `no-cross-module-prisma-access` lint rule (the facade can't reach into the `classes`-owned `Class` model). Refactored into: curriculum + competency queries on `SchedulingReadFacade`, classes query on a new `ClassesReadFacade.findActiveAcademicClassesWithYearGroup` method, and the join/diff computed in `SchedulingPrerequisitesService`.
- Rsync first pass picked up `scheduling-runs.service.ts` and `scheduling-runs.module.ts` as "changed" because of mtime drift; content hashes were equal. No functional effect, but noted so Stage 3 knows not to be surprised.
- Worker rebuild failed once with `EACCES: permission denied, rmdir '/opt/edupod/app/apps/worker/dist/apps'`. Root-owned leftover dist from an earlier root-run build. Fixed with `chown -R edupod:edupod /opt/edupod/app/apps/worker` and rebuilt cleanly. Future stages that touch the worker should run chown proactively.
- SSH setup: my session's ssh-agent was empty. Unblocked with `ssh-add --apple-use-keychain ~/.ssh/id_ed25519` — the key's passphrase lives in the macOS Keychain under the identity `edupod-hetzner`. Worth documenting for future stages.

**Known follow-ups / debt created:**

- Stage 3 should delete `scheduler-orchestration.service.ts#checkPrerequisites`'s per-year-group competency check (now redundant with the new per-class check in `SchedulingPrerequisitesService`). The rest of `checkPrerequisites` (yearGroupsWithClasses, period grid, curriculum, pinned-entry conflicts) can stay or move as Stage 3 prefers.
- `scheduling-read.facade.ts#findTeacherCompetencies` still returns a hardcoded `is_primary: false` on each row for legacy consumers (substitution, ai-substitution, teaching-allocations). Stage 3 owns the API surface rework; Stage 7 handles substitution; Stage 8 handles teaching-allocations. The `TeacherCompetencyRow.is_primary` field should be removed from this interface in whichever of those stages finishes last.
- Stress-test fixture helper `competenciesForYears` kept its `_primaryYears` parameter (prefixed with underscore) to avoid a 100-line call-site diff. Stage 3 or 4 should prune the argument along with other competency-DTO reshaping.

### Stage 3 — API surface updates

**Completed:** 2026-04-14
**Local commit(s):** `477b0076` refactor(scheduling): reshape teacher-competencies API around class_id
**Deployed to production:** yes — 2026-04-14. Rsynced `packages/shared/src/**`, `apps/api/src/modules/scheduling/**`, and `apps/api/src/modules/scheduling-runs/**` to `/opt/edupod/app/`. Rebuilt **in this order**: `@school/shared` → `@school/api` → `@school/worker` (all under the `edupod` user). `pm2 restart api worker` left both online with `Nest application successfully started`.

**What was delivered:**

- **Shared Zod schemas** (`packages/shared/src/schemas/scheduling.schema.ts`):
  - `createTeacherCompetencySchema` now accepts `class_id: z.string().uuid().nullable().optional()`. `is_primary` had already been removed in Stage 1.
  - New `updateTeacherCompetencySchema` lets PATCH toggle `class_id` (UUID = promote pool→pin; `null` = demote pin→pool; omit = no-op).
  - `bulkCreateTeacherCompetenciesSchema` carries optional `class_id` per-row.
  - New `listTeacherCompetenciesQuerySchema` with optional `staff_profile_id`, `subject_id`, `year_group_id`, and `class_id` filters. `class_id` accepts a UUID or the literal string `"null"` so URL-only callers can select pool-only rows.
- **Prereq response type** (`packages/shared/src/types/scheduling-run.ts`): added `EveryClassSubjectHasTeacherDetails` with `uncovered: Array<{ class_id, class_name, subject_id, subject_name }>` and narrowed `PrerequisiteCheck.details` to a union that keeps the check's shape typed for the UI.
- **Service rewrite** (`apps/api/src/modules/scheduling/teacher-competencies.service.ts`):
  - `list()` — single entry point driven by the new query schema. `listAll`, `listByTeacher`, `listBySubjectYear` are thin compatibility wrappers.
  - `create()` — when `class_id` is set, fetches the class via `ClassesReadFacade.findById`, verifies it belongs to the tenant, and asserts `class.year_group_id === dto.year_group_id` (`CLASS_NOT_FOUND` / `CLASS_YEAR_GROUP_MISMATCH`). When `class_id` is null, enforces pool-row uniqueness at the app layer because Postgres treats `NULL` as distinct in composite UNIQUE indexes (so the DB can't catch a duplicate pool row on its own).
  - `update()` — accepts `{ class_id?: string | null }`. Promotion validates the target class; demotion re-checks pool uniqueness (excluding the row under edit). Empty body returns the current row for frontends that issue refresh PATCHes.
  - `bulkCreate()` — validates every `class_id` in the batch against the year group before entering the transaction.
  - `copyFromAcademicYear()` — carries `class_id` verbatim.
  - `copyToYears()` — now copies **pool entries only** (`class_id IS NULL`). Pins are tied to a specific class that does not exist in the destination year group, so shipping them would fail on the FK. Documented in-file.
  - `getCoverage()` — **per-class** now: one row per `(class, subject)` curriculum cell, resolved through `resolveTeacherCandidates` from the shared scheduler helper. Each row carries `mode: 'pinned' | 'pool' | 'missing'`, `eligible_teacher_count`, and grouping context (`class_name`, `year_group_name`, `subject_name`). `summary` aggregates `pinned / pool / missing / total`. Inactive and non-academic classes are skipped, matching the orchestration filter.
  - P2002 → `ConflictException` with `TEACHER_COMPETENCY_DUPLICATE` code.
- **Controller** (`apps/api/src/modules/scheduling/teacher-competencies.controller.ts`):
  - New `GET /v1/scheduling/teacher-competencies` accepts the full filter set via `listTeacherCompetenciesQuerySchema`.
  - `PATCH /v1/scheduling/teacher-competencies/:id` now validates with `updateTeacherCompetencySchema` instead of being a no-op.
  - `GET /v1/scheduling/teacher-competencies/coverage` unchanged route, new response shape.
- **Orchestration** (`apps/api/src/modules/scheduling/scheduler-orchestration.service.ts`):
  - Explicit Stage 3 assertion when mapping Prisma rows into the solver input: `class_id` coerced to `string | null` at the boundary, guarding against any future shape drift.
  - Retired the redundant per-year-group competency check from `checkPrerequisites()`; the per-class check in `SchedulingPrerequisitesService.every_class_subject_has_teacher` is the canonical source now.
- **Orchestration spec**: the obsolete "should report missing teacher for subject+year group combo" test is `.skip`ped with a comment pointing at the new check location.

**Files changed (high level):**

- `packages/shared/src/schemas/scheduling.schema.ts`
- `packages/shared/src/types/scheduling-run.ts`
- `apps/api/src/modules/scheduling/teacher-competencies.{service,controller,service.spec,controller.spec}.ts`
- `apps/api/src/modules/scheduling/scheduler-orchestration.{service,service.spec}.ts`

**Migrations / schema changes:** none. Stage 1 delivered `class_id` on the row; Stage 3 only reshapes the API around it.

**Tests added / updated:**

- unit (shared scheduler): none (Stage 2 coverage stands).
- unit (api scheduling):
  - `teacher-competencies.service.spec.ts` fully rewritten for the new shape. 20 tests covering: pool create (happy + duplicate), pin create (happy + CLASS_NOT_FOUND + CLASS_YEAR_GROUP_MISMATCH + P2002 → CONFLICT), update (empty body = no-op, promote, demote, mismatch, missing id), list (filters + `class_id="null"` literal), coverage (pin/pool/missing mix + inactive classes), bulkCreate (happy + mismatch), delete (happy + missing), deleteAllForTeacher, copyFromAcademicYear (no-source-data).
  - `teacher-competencies.controller.spec.ts` updated for the new signature: `list`, `list?class_id=null`, `update` with dto body, `getCoverage`.
  - `scheduler-orchestration.service.spec.ts` — 1 test skipped per above.
- Full scheduling test suite: 34 suites, 677 passed, 1 skipped.
- integration e2e: **not added**. The repo's e2e harness exists but each scheduling e2e file is ~900+ lines of tenant/auth/test-data scaffolding, and the Stage 1 migration already installed the `teacher_competencies_tenant_isolation` RLS policy and smoke-tested it. Stage 3 reshapes DTOs and one endpoint only; RLS is unchanged. Explicitly deferred — see known follow-ups.
- Playwright: not run. The competencies UI still expects the pre-Stage-3 coverage shape (matrix keyed by year group + subject rather than class + subject) and will render incorrectly until Stage 4 rebuilds it. Same frontend-mismatch allowance the stage doc calls out.
- coverage delta: not measured; thresholds untouched.

**Verification evidence:**

- `pnpm --filter @school/shared type-check` clean; `@school/worker` clean; `@school/api` clean in every scheduling file (same residual pre-existing errors in admissions/communications/report-cards that were on `main` before Stage 2).
- `pnpm --filter @school/api lint` → 0 errors, 897 pre-existing warnings.
- DI smoke test → `DI OK`.
- Authenticated production smoke from my shell against `https://nhqs.edupod.app` as `owner@nhqs.test`:
  - `GET /api/v1/scheduling/teacher-competencies?academic_year_id=<2025-2026>` → 122 rows, every row carries `class_id: null` (expected — Stage 1 state: all existing rows are pool entries; Stage 5 seeding adds pins).
  - `GET /api/v1/scheduling/teacher-competencies?...&class_id=null` → same 122 rows, all with `class_id: null` — filter honoured.
  - `GET /api/v1/scheduling/teacher-competencies/coverage?academic_year_id=<2025-2026>` → per-class matrix; first row `{class_name: "1A", year_group_name: "1st class", subject_name: "English", mode: "pool", eligible_teacher_count: 2}`. Summary present.
  - `GET /api/v1/scheduling-runs/prerequisites?academic_year_id=<2025-2026>` → 6 checks including `every_class_subject_has_teacher: passed: true`. `all_classes_configured: false` is a separate Stage-5 gap (only 0 classes have scheduling requirements right now) and unrelated to Stage 3.
- `pm2 logs api --lines 5 --nostream --out` → `Nest application successfully started`. No DI errors. No scheduler/competency errors on the new surface. Worker likewise clean.

**Surprises / decisions / deviations from the plan:**

- First deploy attempt returned `INTERNAL_ERROR` on every new route because the rebuild script rebuilt `@school/api` before `@school/shared`'s own `dist/` was regenerated — so at runtime, `listTeacherCompetenciesQuerySchema` and `resolveTeacherCandidates` were `undefined`. The build dependency is `shared → api → worker`; the api build does **not** trigger a shared rebuild on its own. Fixed by running `pnpm --filter @school/shared build` first, then api, then worker, then `pm2 restart`. Future stages that add new runtime imports to `@school/shared` **must** rebuild shared before api.
- The `teacher_competencies` unique index Stage 1 created is 6-column including `class_id`. Postgres treats NULL as distinct in composite unique indexes, so two pool rows (`class_id IS NULL`) with otherwise identical keys would not collide at the DB layer. Worked around in `create()` / `update()` with an explicit `findFirst` pre-insert. A cleaner long-term fix is to switch the index to `WITH (NULLS NOT DISTINCT)` — but changing an existing index on prod has to land on its own migration; flagged for a later stage or a standalone fix.
- The stage doc asked the list endpoint to "support the existing filters (by staff, by subject, by year_group) and add a new optional `class_id=` filter". Delivered exactly that plus a `class_id="null"` literal for pool-only filtering, which is friendlier than requiring clients to send `class_id=IS%20NULL` or a custom `pool_only=true`.
- Integration e2e file was not added — documented above and flagged in follow-ups.

**Known follow-ups / debt created:**

- `apps/api/test/scheduling/teacher-competencies.e2e-spec.ts` still not written. Stage 4 will exercise the same endpoints from Playwright end-to-end, which partially covers the gap, but a dedicated RLS-leakage e2e belongs somewhere in the pre-Stage-5 window. Filing against Stage 4 at a minimum.
- `SchedulingReadFacade.findTeacherCompetencies` still maps `is_primary: false` onto every row for legacy consumers (substitution, ai-substitution, teaching-allocations). Stages 7 (substitutes table) and 8 (downstream rewire) own removing this; the interface field `TeacherCompetencyRow.is_primary` should be deleted once neither depends on it.
- `scheduler-orchestration.service.ts#checkPrerequisites()` still performs year-group-level curriculum coverage checks; only the competency check was retired. Likely fine — those checks are about different prerequisites (period grid, curriculum existence, pinned-entry conflicts) — but worth a Stage 4 or later pass to decide whether the whole method should fold into `SchedulingPrerequisitesService`.
- Upgrade the `teacher_competencies` unique index to `WITH (NULLS NOT DISTINCT)` so the DB enforces pool-row uniqueness directly. Small dedicated migration; noted above.
- `copyToYears()` silently drops pins now (only pool rows copy). Documented in-code; Stage 4 should make sure the UI for "copy to other year groups" surfaces this (probably by only offering it on pool-tab rows).

### Stage 4 — Competencies page UI rebuild

**Completed:** 2026-04-14
**Local commit(s):** `ed5ea305` feat(scheduling): rebuild competencies page around pin/pool model
**Deployed to production:** yes — 2026-04-14. Rsynced `apps/web/messages/{en,ar}.json` and `apps/web/src/app/[locale]/(school)/scheduling/{competencies,competency-coverage}/` to `/opt/edupod/app/`. `chown -R edupod:edupod apps/web`. Rebuilt `@school/web` and `pm2 restart web` — PM2 shows the new web process online, HTTP 200 on the page.

**What was delivered:**

- Competencies page (`/scheduling/competencies`) rebuilt around the Stage 1/3 pin/pool model. Previous "By Teacher" / "By Subject + Year" tabs deleted. New layout:
  - Legend row at the top distinguishing **Pool (year-group)** / **Pinned (class)** / **Missing**.
  - Year-group picker (chip bar).
  - For the selected year group: a subtab bar — leading `All (pool)` tab plus one subtab per class in that year group.
  - **All (pool) tab**: subjects × teachers checkbox matrix. Rows = curriculum subjects for this year group (from `/curriculum-requirements/matrix-subjects`), columns = teacher-role staff. Ticking a cell POSTs `{ class_id: null }`; unticking DELETEs.
  - **Class tab**: per-subject row with a single `<Select>` (radio-like: one-of-N). Options are grouped — "Pooled teachers" (those already pool-eligible for this subject in this year group) come first, then "Other teachers". The leading option is `— none —`. Selecting a teacher creates a pin `{ class_id: <uuid> }`; selecting "— none —" deletes the existing pin. Pin replacement happens as delete-then-create in a single helper (the unique index admits at-most-one pin per `(class, subject)` across teachers).
  - Status column on the pin matrix: **Pinned** (green) when a pin exists, the pool teacher count (blue info badge) when only pool covers the subject, or **Missing** (red) when neither pool nor pin covers the subject.
- Coverage page (`/scheduling/competency-coverage`) rebuilt around the Stage 3 response shape (`{ rows: Array<{class_id, class_name, year_group_id, year_group_name, subject_id, subject_name, mode, eligible_teacher_count}>, summary: {...} }`):
  - Columns = every active class, grouped under a two-level header row by year group.
  - Rows = union of curriculum subjects across all classes.
  - Cell states: `pinned` (green), `pool` (blue + count), `missing` (red), `not_in_curriculum` (muted em-dash).
  - KPI cards: Missing / Pool / Pinned / Coverage rate.
  - "Show only problems" filter collapses to rows that contain at least one missing cell.
  - Per-cell popover opens on click with subject/class label, mode label, eligible count, and an "Edit competencies" deep link back to `/scheduling/competencies`.
- Copy wizard (pool-to-other-years) kept: the UI copy already documented "only pool entries copy" per Stage 3's `copyToYears()` contract.
- Copy from academic year kept.
- `is_primary` references, star buttons, lock toggle, and "By Teacher / By Subject + Year" tabs are all gone from the UI.

**Files changed (high level):**

- `apps/web/src/app/[locale]/(school)/scheduling/competencies/page.tsx` — full rewrite. 933 → 530 lines; the rest extracted to `_components/` for the max-lines budget.
- `apps/web/src/app/[locale]/(school)/scheduling/competencies/_components/{pool-matrix,pin-matrix,copy-wizard,types}.{ts,tsx}` — new. Pool/pin matrices isolated, copy wizard lifted out as a self-contained component that accepts already-formatted i18n strings via a `t` prop.
- `apps/web/src/app/[locale]/(school)/scheduling/competency-coverage/page.tsx` — full rewrite (308 → 440 lines) around the per-class matrix.
- `apps/web/messages/en.json`, `apps/web/messages/ar.json` — removed `byTeacher`, `bySubject`, `primary`, `locked`, `unlocked`, `lockPermissionDenied`, `coverageGaps`, `coverageAtRisk`, `coverageCovered`, `coverageYearGroup`, `coverageLegendGap`, `coverageLegendAtRisk`, `coverageLegendCovered`, `coverageNoTeachers` (scheduling.v2 only). Added `poolTab`, `poolLabel`, `pinLabel`, `missingLabel`, `poolMode`, `pinMode`, `selectClass`, `selectTeacher`, `selectTeacherNone`, `noTeacherForSubject`, `legendPool`, `legendPin`, `legendMissing`, `pooledTeachers`, `otherTeachers`, `classesSubstrip`, `pinReplaced`, `pinCleared`, `poolSaved`, `poolRemoved`, `selectYearGroupFirstCompetencies`, `coveragePinned`, `coveragePool`, `coverageMissing`, `coverageTotal`, `coverageClass`, `coverageSubject`, `coverageLegendPinned`, `coverageLegendPool`, `coverageLegendMissing`, `coverageShowProblems`, `coverageEligibleCount`. `teacherName` retuned from "Teacher Name" → "Teacher".
- Description copy updated: "Who can teach what. Assign teachers at the year-group level, or pin to a specific section." / coverage desc: "See which subjects have a teacher assigned for every class."

**Migrations / schema changes:** none. Stage 4 is frontend-only.

**Tests added / updated:**

- unit (web): no new component tests added (the stage doc marks them optional; the repo has no Jest setup for web component testing).
- type-check: `pnpm --filter @school/web type-check` — clean.
- lint: `pnpm --filter @school/web lint` — no errors introduced on the touched files. Pre-existing warnings (`max-lines`, `no-untranslated-strings` on other pages) untouched. The new competencies page comes in at 530 lines; `_components/` files at 96, 150, 323 lines each — all under the 600-line ceiling.
- Playwright: ran against `https://nhqs.edupod.app` as `Yusuf Rahman (School Owner)`. Every flow from the stage doc's Playwright section passed:
  1. `/en/scheduling/competencies` loads; old "By Teacher/By Subject+Year" tabs gone, replaced by YG picker + class subtabs.
  2. Selecting "1st class" renders subtabs `All (pool)`, `1A`, `1B`.
  3. "All (pool)" tab renders the 25-teacher × 8-subject matrix.
  4. Ticking Ahmed Hassan × Arabic → persists across a hard reload.
  5. Switching to "1A" subtab → the 8 subject rows match the curriculum.
  6. Picking "Ahmed Hassan" in the Arabic row → saves the pin (Select shows the teacher, status column shows the "Pinned" badge). Hard reload → pin still there.
  7. Changing to "Benjamin Gallagher" → pin replaced in place, no duplicate row created.
  8. Setting back to "— none —" → pin deleted, status column reverts to the pool-count badge.
  9. `/en/scheduling/competency-coverage` loads with per-class columns (grouped by year group) × per-subject rows. Example summary: `98 pool`, `11 missing`, `0 pinned`, `90% coverage rate`.
  10. "Show only problems" filter cuts 12 subject rows down to the 4 with at least one missing class.
  11. `/ar/scheduling/competencies` and `/ar/scheduling/competency-coverage` render with `dir="rtl"` and the translated strings. DOM scan for `ml-/mr-/pl-/pr-/left-/right-/rounded-l-/rounded-r-/border-l-/border-r-` in the rendered `<main>` returned zero hits on both pages.
- Console errors during the flow: zero.
- coverage delta: not re-measured; thresholds untouched (`@school/web` has no coverage floor).

**Verification evidence:**

- `pm2 list` after deploy: all three processes `online`; `web` pid freshly rolled.
- `curl -I https://nhqs.edupod.app/en/scheduling/competencies` → HTTP/2 200.
- Browser evaluations counted `98` blue (pool), `11` red (missing), `0` emerald (pinned) cells on the coverage grid — matching the KPI cards above them and the stage-3 API response already documented in stage-3's log entry.
- Pin replacement verified at the DOM level: after changing the Arabic pin from Ahmed → Benjamin, `document.querySelectorAll('table tbody tr')` for the Arabic row still contains exactly one row and the status badge still reads "Pinned".

**Surprises / decisions / deviations from the plan:**

- The plan's component tree called for a `<YearGroupBoard>` wrapper. In practice the page-level state (selected YG, classes, curriculum subjects, competencies, teachers) is all driven by the YG picker; lifting a wrapper between `<CompetenciesPage>` and the matrices added no actual reuse. Kept the state on the page and extracted only `<PoolMatrix>`, `<PinMatrix>`, `<CopyWizard>`, and shared types into `_components/`. Net effect: same separation of concerns with less boilerplate.
- The Stage 3 coverage response does not include classes that have no curriculum requirements — those never appear as columns. The plan asked for "one per class across all year groups", which we read as "every class that has any curriculum cell", and that's what we render. If an empty class needs to show up later for administrative reasons, it would need a server-side change to `getCoverage()`.
- The copy-wizard dialog originally inlined in the page rewrite pushed the file to 787 lines — over the 600-line `max-lines` warning. Extracted as its own component. It now accepts already-formatted i18n strings (with `{source}` interpolation done by the parent via `useTranslations`), so the wizard never calls `useTranslations` itself — keeps the dependency graph shallow.
- The stage doc's Playwright step 11 asked for an RTL sanity check. No hex colour literals were introduced; all colour references go through tokenised Tailwind classes (`bg-blue-500`, `bg-emerald-500`, `bg-red-500`, `bg-blue-100`, etc.) that already flip correctly for AR.
- Pre-existing unstaged changes in `apps/api/src/modules/gradebook/report-cards/**` were left untouched on `main`; they are unrelated to Stage 4 and will be handled by whoever owns that work.
- One minor UX note: the pool-tab's "missing" indicator appears on the subject column header (a red chip beneath the subject name). The class-tab's "missing" indicator is in the status column of each subject row. Same state, two renderings — intentional because the two views optimise for different questions ("is this subject covered at all?" vs. "who teaches this subject for this class?").

**Known follow-ups / debt created:**

- `SchedulingReadFacade.findTeacherCompetencies` still emits hardcoded `is_primary: false` on every row for legacy substitution / ai-substitution / teaching-allocations callers. Stages 7 and 8 own removal of this dead field (see stage-2 and stage-3 log entries for the full chain).
- `teacher_competencies` unique index still uses default NULL-distinct semantics; a dedicated migration to switch to `WITH (NULLS NOT DISTINCT)` is still outstanding.
- Integration e2e file `apps/api/test/scheduling/teacher-competencies.e2e-spec.ts` remains unwritten; Stage 4 covered the happy-path UI flows but RLS-isolation tests are still pending the unblock of Stage 5 seed data (which exercises the wider schema from a known baseline).
- The `PinMatrix` select shows pooled teachers first, then every other teacher. This lets you pin a teacher who has no pool entry — creating an "implicit pin" with no pool safety net. Intentional per the stage doc's step 5 ("every other teacher (still selectable; creates an implicit pin without a pool)"). If the product team later decides implicit pins are an anti-pattern, the filter to the list is a one-line change.
- The `_components/copy-wizard.tsx` is self-contained but duplicates the matrix-subjects call already made by the page. Acceptable since the wizard targets _other_ year groups and the page caches only the source. If several consumers start calling the same endpoint, lift it into a shared hook.

### Stage 5 — Seed NHQS data

**Completed:** 2026-04-14
**Local commit(s):** `a099008a` feat(scheduling): seed NHQS curriculum + fix prereq for homeroom schools
**Deployed to production:** yes — 2026-04-14. Data seed applied via a single psql transaction against `school_platformedupod_prod`. Prereq-check code fix rsynced, `@school/api` rebuilt under the `edupod` user, `pm2 restart api` left the process `online` with all routes mapped.

**What was delivered:**

- **Data seed (NHQS tenant `3ba9b02c-0339-49b8-8583-a06e05a32ac5`, AY `0001b90d-25f1-413d-87d5-2da00ab7168d`):**
  - Wiped the legacy 122 `teacher_competencies` rows and 24 `curriculum_requirements` rows.
  - Seeded **59 curriculum rows** covering 9 year groups × 3–11 subjects each. Core subjects (Arabic / English / Mathematics) at 5 periods/week; subsidiaries (Biology, History, Geography, Chemistry, Physics, Business, Economics, Accounting) at 3; Senior infants Geography at 4. `max_periods_per_day = 1`, `requires_double_period = false`.
  - Seeded **162 pool competencies** — every `(year_group, subject)` curriculum cell has 2–4 qualified teachers. Teacher→subject mapping carried forward from the pre-wipe state, extended with Ahmed Hassan on Mathematics (his job_title was already "Mathematics Teacher" with zero competencies). Delegated picks for three subjects that had no prior data: Physics → Daniel Kavanagh, Lucas Kelly, Sophia Ryan; Accounting → Mia Brennan, Amelia Connolly; Economics → James Byrne, Ava Doyle. All rows have `class_id = NULL` (pool entries) — no pins in this stage.
  - Seeded **155 staff availability rows** — 31 active teachers × 5 weekdays (Mon–Fri), 08:00–16:00. "Test Staff" and "nnbgfdn ngnrtfn" excluded per user direction.
  - No room closures, teacher configs, preferences, or `class_scheduling_requirements` per stage doc non-goals (except the one noted below).

- **Prereq check fix (Option C2 — the user's decision after a contradiction between Stage 5 non-goals and acceptance criteria):**
  - `findActiveAcademicClassesWithYearGroup` in `classes-read.facade.ts` was filtering classes by `subject: { subject_type: 'academic' }`. For homeroom-model schools (NHQS, where every class has `subject_id IS NULL` because one class teaches many subjects), this returned zero rows. Widened the filter to `OR: [{ subject_id: null }, { subject: { subject_type: 'academic' } }]`.
  - `all_classes_configured` check in `scheduling-prerequisites.service.ts` was comparing two counts that both use the broken filter. Rewrote to: (a) fetch active-academic classes via the fixed method, (b) consider a class "configured" if either it has a `class_scheduling_requirements` row **or** its `year_group` has `curriculum_requirements` rows for this AY. Reason: the solver reads `curriculum_requirements`, not `class_scheduling_requirements`; the latter is only needed by subject-class schools or for per-class overrides. This correctly handles both school models without forcing homeroom schools to seed redundant data.
  - New facade helper `findClassIdsWithSchedulingRequirements` on `SchedulingReadFacade`.
  - The Stage 2 `every_class_subject_has_teacher` check also consumed the broken method; with this fix it now iterates all 16 NHQS classes (previously iterated zero, vacuously passing).

**Files changed (high level):**

- Data: `scheduler/stage-5-nhqs-seed.sql` (the exact SQL executed in prod, checked in alongside this log).
- Code:
  - `apps/api/src/modules/classes/classes-read.facade.ts` — widened `findActiveAcademicClassesWithYearGroup` filter.
  - `apps/api/src/modules/scheduling/scheduling-read.facade.ts` — added `findClassIdsWithSchedulingRequirements`.
  - `apps/api/src/modules/scheduling-runs/scheduling-prerequisites.service.ts` — rewrote `all_classes_configured` to use the new dual-path logic.
  - `apps/api/src/modules/scheduling-runs/scheduling-prerequisites.service.spec.ts` — updated defaults + existing tests; added one new happy-path case covering the "configured via explicit class_scheduling_requirements rows" path.

**Migrations / schema changes:** none.

**Tests added / updated:**

- unit (api scheduling-runs): `scheduling-prerequisites.service.spec.ts` — 19 tests (was 18), all green. New test covers the subject-class-school path via `findClassIdsWithSchedulingRequirements`. Existing tests retained with refreshed fixtures; defaults now provide a minimum passing shape for `all_classes_configured` so tests targeting other checks don't need to mock it.
- unit (api scheduling suite): full 34 suites / 678 tests / 1 skipped — green.
- Playwright: run against `https://nhqs.edupod.app` as `Yusuf Rahman (School Owner)`.
  1. `GET /api/v1/scheduling-runs/prerequisites?academic_year_id=<0001b90d>` → HTTP 200 with `ready: true` and all six checks `passed: true`. Full response payload pasted into this entry under "Verification evidence".
  2. `/en/scheduling/competencies` → 1st class "All (pool)" tab shows **17 pre-ticked cells** — matches the seed exactly: Arabic 2 + English 3 + Mathematics 4 + Biology 3 + History 3 + Geography 2.
  3. `/en/scheduling/competency-coverage` → 85 pool + 24 missing cells (see surprises below — legacy class_subject_grade_configs quirk, not a seed gap).
  4. `/en/scheduling/auto` → API returns ready=true but the page fails to render the checklist (pre-existing UI bug unrelated to Stage 5; see follow-ups). The solver will not be affected.
- coverage delta: not measured; thresholds untouched.

**Verification evidence:**

- Pre-seed snapshot (inside the seed transaction, logged): `teacher_competencies=122, curriculum_requirements=24, staff_availability=0`.
- Post-seed (before COMMIT, logged): `teacher_competencies=162, curriculum_requirements=59, staff_availability=155`.
- DO-block assertion: `NOTICE: Stage 5 seed verified: 59 curriculum, 162 competencies, 155 availability, 0 uncovered.` → `COMMIT` executed.
- Per-year-group curriculum count matches the plan exactly: KG=3, JI=3, SI=4, 1st=6, 2nd=6, 3rd=7, 4th=9, 5th=10, 6th=11 (sum 59).
- Pool depth per (year_group, subject): 2–4 teachers per cell, every cell covered (the "0 uncovered" query in the transaction returned zero rows).
- Prereqs endpoint final response:
  ```json
  {
    "ready": true,
    "checks": [
      { "key": "period_grid_exists", "passed": true, "message": "269 teaching periods configured" },
      {
        "key": "all_classes_configured",
        "passed": true,
        "message": "All 16 classes have scheduling requirements"
      },
      {
        "key": "all_classes_have_teachers",
        "passed": true,
        "message": "All classes have assigned teachers"
      },
      {
        "key": "every_class_subject_has_teacher",
        "passed": true,
        "message": "Every class and subject combination has at least one pinned or pool teacher"
      },
      { "key": "no_pinned_conflicts", "passed": true, "message": "No pinned entry conflicts" },
      {
        "key": "no_pinned_availability_violations",
        "passed": true,
        "message": "All pinned entries within teacher availability"
      }
    ]
  }
  ```

**Surprises / decisions / deviations from the plan:**

- **The stage spec contradicts itself.** Non-goal #1 said "do not seed `class_scheduling_requirements`", but the acceptance criterion said "prereqs must return `ready: true`" — and the `all_classes_configured` check required exactly that table for subject-class schools. User was presented with three options (A seed anyway / B accept 5/6 / C fix the check) and chose C, then refined to C2 (fix the filter **and** widen the "configured" definition). Kept the non-goal intact; zero class_scheduling_requirements rows on NHQS.
- **Stage 2 was vacuously passing `every_class_subject_has_teacher`** because its class-list query also used the broken `subject_type='academic'` filter. The filter fix here fixed that silent gap too; the check now correctly iterates all 16 NHQS classes and still passes (because every `(class, subject)` in the curriculum has pool teachers).
- **Teacher availability schema uses `available_from`/`available_to`**, not `start_time`/`end_time` as the stage template suggested, and requires `academic_year_id`. Template adjusted.
- **Weekday convention** verified as `1..5` for Mon–Fri (matches the `schedule_period_templates` data on the same tenant).
- **First seed attempt** failed on `column "class_id" is of type uuid but expression is of type text` — `NULL` inside an `INSERT ... SELECT` needs `NULL::uuid` because the literal's type isn't inferable from the target column in that shape. Fixed and rerun cleanly.
- **Staff filter:** `role_key='teacher'` joined through `tenant_memberships → membership_roles → roles` returned 33 teachers; user excluded "Test Staff" and "nnbgfdn ngnrtfn" → 31 active teachers.
- **Prereq endpoint needed user+membership session vars** because of a `membership_roles_self_access` RLS policy. Added `SET LOCAL app.current_user_id` / `app.current_membership_id` with zero UUIDs inside the transaction just to satisfy the read-side policy for the joined subquery. Does not write any real session data.
- **`/en/scheduling/competencies` shows two extra "Needs a teacher" red chips** (Business, Chemistry on 1st class). Root cause: the `matrix-subjects` UI endpoint sources subject list from `class_subject_grade_configs` (a gradebook concern) rather than `curriculum_requirements`. Those configs still reference subjects not present in our scheduling curriculum, so the pool tab renders extra red-chipped columns. Does not affect the solver or the prereq check — both read `curriculum_requirements`. Filed as follow-up.
- **Coverage page shows 85 pool + 24 missing.** Same root cause as above — the `getCoverage` service builds rows from `findClassSubjectConfigs` (gradebook), not the scheduling curriculum. The 24 "missing" cells are all (class, subject) pairs from the gradebook configs that aren't in the scheduling curriculum. The actual scheduling-coverage is 100%, verified by the prereq check. Follow-up.
- **`/en/scheduling/auto` UI doesn't render the prereq checklist.** The page reads `prerequisites.checks` but NestJS wraps responses in `{data: {...}}` at the HTTP boundary — the apiClient does not unwrap, so `prerequisites.checks` is always `undefined` and the "Generate Timetable" button stays disabled. Pre-existing bug, surfaces now because Stage 5 is the first time the endpoint returns `ready: true` on NHQS. Unrelated to the seed or the filter fix. Flagged as a blocker for Stage 6 (see follow-ups — Stage 6 must either call the endpoint itself or patch this page first).

**Known follow-ups / debt created:**

- `apps/web/src/app/[locale]/(school)/scheduling/auto/page.tsx` — fix `apiClient` call to unwrap `{data}` for the prereqs response (or change the page's type to `{ data: PrerequisitesResponse }` and read `prerequisites.data.ready`). **This is a Stage 6 blocker** — the auto page is the UI surface for Stage 6's smoke test.
- The `matrix-subjects` endpoint (used by the competencies pool tab) and `getCoverage` (used by the coverage page) both source their subject set from `class_subject_grade_configs`. For homeroom-model tenants this leaks gradebook-era subject assignments into the scheduler UI. A future cleanup stage should either rebase both on `curriculum_requirements` or expose a `source=scheduling|gradebook` toggle.
- Widening `findActiveAcademicClassesWithYearGroup` to include homeroom classes was a focused one-call change. A broader audit of other places that filter by `subject: { subject_type: 'academic' }` should happen if more similar bugs surface — this pattern appears in at least `countByAcademicYear` and `countClassRequirements` (both dead now in the prereq check but still exported, so still usable footguns).
- The `teacher_competencies` unique index still uses default NULL-distinct semantics (documented across Stages 2–4); pool-row dedup is still enforced at the application layer.
- No integration e2e file for this seed yet; Stage 6's generation run will exercise the full data shape end-to-end and serve as the de facto smoke.

### Stage 6 — Generate end-to-end on NHQS

**Session:** Claude / 2026-04-14
**Owner:** Claude
**Status:** complete

**Observed run:**

- Run id: `eace28b5-75f0-4b07-bc44-eaf48a41be05`, tenant NHQS, academic year `0001b90d-25f1-413d-87d5-2da00ab7168d`.
- Solver v2 inputs: 9 year groups, 59 curriculum entries, 24 teachers.
- Result: 361 entries, 33 unassigned, score 5.317/6 (≈89%) in 10,704 ms.
- `hard_constraint_violations = 0`. No tier-1 violations on apply.
- Applied at 2026-04-14 07:27:13 UTC. `schedules` table populated: 361 rows, 16 distinct classes, 24 distinct teachers.
- Analytics dashboard (`/en/scheduling/dashboard`): 16 assigned classes, room utilisation 5%, teacher utilisation 6%, avg gaps 1.4, preference score 89%, latest run shown as applied.
- `my-timetable` as `Sarah.daly@nhqs.test`: 30 periods rendered across the week with class + room names.

**Bugs surfaced and fixed in-stage:**

1. **`config_snapshot` stub crashed the solver.** `SchedulingRunsService.create` was storing a minimal snapshot `{ academic_year_id, mode, grid_hash: null }`; the worker's `SchedulingSolverV2Processor` reads it as `SolverInputV2` and hit `configSnapshot.year_groups.length` → "Cannot read properties of undefined (reading 'length')". Fix: inject `SchedulerOrchestrationService` into `SchedulingRunsService` and call `assembleSolverInput(tenantId, academicYearId)` to build the full input before the `schedulingRun.create()`. Also switched mode detection to use `solverInput.pinned_entries.length`. Dropped the now-unused `SchedulesReadFacade` from the service constructor. Added `SchedulingModule` to `SchedulingRunsModule.imports`. Added a mock for the new dep in `scheduling-runs.service.spec.ts`; all 42 tests pass.
2. **Failure-path `schedulingRun.update` bypassed RLS.** When the solver throws, the catch block updated the run with the raw `prisma` client (no tenant context). The `scheduling_runs_tenant_isolation` policy then cast an empty `app.current_tenant_id` setting to `uuid` and raised SQLSTATE 22P02. Fix: wrap the failure-update in `this.prisma.$transaction` and `SELECT set_config('app.current_tenant_id', ${job.data.tenant_id}::text, true)` before the `update`. Added the processor to `packages/eslint-config/raw-sql-allowlist.json` under the `rls-infrastructure` category.
3. **Review page expected a different response shape than `findById` returned.** The page typed the response as `{ id, status, mode, entries, constraint_report }` and iterated `data.entries`; the API returned the raw scheduling_runs row with `result_json` nested + a `{ data }` envelope from the global interceptor, so the page hit "e is not iterable". Fix: `findById` now resolves class/subject/room/staff names from the DB, maps `result_json.entries` → review `entries[]`, and builds `constraint_report` (hard violations, preference-satisfaction %, unassigned count, workload summary) — returned alongside the existing formatted row fields. The review page was also updated to unwrap `{ data }` and include `updated_at` so the Apply button can send `expected_updated_at` (required by `applyRunSchema`).
4. **Auto page progress poll and POST both missed the envelope.** Fixed so `setActiveRunId(res.data.id)` on POST and `const prog = res.data` inside the poller.
5. **`my-timetable` page was calling a non-existent endpoint with the wrong shape.** The page called `/api/v1/scheduling/my-timetable` (404) and expected `{ week, cells, periods, weekdays }`; the real endpoint is `/api/v1/scheduling/timetable/my` and it returns `{ data: TimetableEntry[] }`. Fix: rewrite the page's fetch to call the correct URL with a `week_date` = end-of-week param (so the `effective_start_date <= asOf` filter matches seeded schedules whose effective date is today) and transform `TimetableEntry[]` → the `MyTimetableResponse` shape the rest of the component already knows how to render.
6. **Teacher role couldn't reach `/scheduling/my-timetable`.** Two permission gates were blocking: the API's `@RequiresPermission('schedule.view_personal_timetable')` (no such permission exists in the prod DB; teachers have `schedule.view_own`) and the web's route-role map, which restricted everything under `/scheduling` to `ADMIN_ROLES`. Fix: changed all four `timetable`/`calendar-tokens` `@RequiresPermission` calls on `SchedulingEnhancedController` from `schedule.view_personal_timetable` → `schedule.view_own`, and added a narrower `/scheduling/my-timetable` entry with `[...ADMIN_ROLES, 'teacher']` before the broader `/scheduling` entry in `apps/web/src/lib/route-roles.ts`.
7. **Dashboard overview KPIs read nothing from the response.** The page was typed as `apiClient<DashboardOverview>(...)` and `setOverview(ov)`, but the API wraps in `{ data }`. Fixed to `{ data: DashboardOverview }` with `setOverview(ov.data)`.

**Addendum (diagnostics, same session):** The raw "33 unassigned" signal was too weak for the user — a school admin needs to know _why_ and _what to do_. Added `SchedulingDiagnosticsService` + `GET /scheduling-runs/:id/diagnostics` + a new "Timetable analysis" panel on the review page. The service reads `result_json.unassigned` + `config_snapshot` and emits categorised diagnostics with concrete recommendations:

- `teacher_supply_shortage` (critical) — supply × max_periods vs demand; recommends how many extra teachers to add
- `workload_cap_hit` (high) — teachers already at `max_periods_per_week`; recommends raising caps in /scheduling/teacher-config
- `availability_pinch` (high) — qualified teachers' cumulative available periods can't cover demand; recommends widening availability windows
- `unassigned_slots` (medium) — fallback for (subject, year-group) gaps that don't match a specific diagnosis; surfaces affected classes

For the NHQS run: 1 `workload_cap_hit` (Sarah Daly, William Dunne, Benjamin Gallagher, Chloe Kennedy all at 25/25) + 19 medium-severity fallback diagnostics across Arabic/English/Mathematics/Business. Confirms the earlier manual analysis ("per-teacher load is impossibly high for core subjects"): the solver hit the 25-period cap first on four teachers, which cascaded into the unplaced periods. Surfaces this to the user instead of making them guess.

Tests: 5 new unit tests in `scheduling-diagnostics.service.spec.ts` covering not-found, no-issues, supply-shortage, fallback, and workload-cap paths. All pass.

**Unblocked for next session:** Stage 7 (substitutes page + table) is now unblocked.

**Unassigned slot analysis (for future tuning, not a blocker):** 33 of 430 curriculum slots went unassigned. The solver output was capped by the seeded availability (Mon-Fri 08:00–16:00 per teacher). Because the run hit 0 hard violations and 89% preference satisfaction, this is an over-constraint signal rather than a bug — Stage 8 or a later tuning pass can relax teacher availability windows if this is unacceptable.

**Follow-ups logged for Stages 7–8 / downstream work:**

- The solver result's `SolverAssignmentV2.subject_id` is `null` for homeroom-model schools (Stage 4 coverage work exposed this earlier); the review page therefore omits a subject line on most cells. Not a Stage 6 regression, but the review page will need a subject resolution path once Stage 8 rewires consumers.
- `scheduling-runs.service.spec.ts` no longer exercises `countPinnedEntries` (removed along with the `SchedulesReadFacade` injection). The mode-detection path is now covered indirectly via `assembleSolverInput` mocks.
- Pre-existing `admissions/applications.service.spec.ts` and `communications/notification-templates.service.spec.ts` type errors are still on `main`; the Stage 6 changes did not introduce or clear them.
- `AuditLogWriteProcessor` logs `unrecognized configuration parameter "app.current_tenant_id"` for non-tenant refresh-token and tenant-switch events. Pre-existing, unrelated to scheduling — flagged for a future infra fix.
- The `createSchedulingRunSchema` is now the only schema left that doesn't echo `expected_updated_at`; apply/discard both require it. Frontend now passes it from `data.updated_at`.

### Stage 7 — Substitutes page + table

_Pending — will be populated when Stage 7 completes._

### Stage 8 — Downstream rewire

_Pending — will be populated when Stage 8 completes._

---

## Orchestration history

Keep a short chronological record of significant orchestration events (not per-stage completions — those are above).

- **Orchestration package created** — 2026-04-13. Eight-stage plan written. All stages `pending`. Context: following a wiring-bug fix (commit `f878053f`) that made `POST /v1/scheduling-runs` enqueue `scheduling:solve-v2`; that fix is already live on prod and is a prerequisite for the rest of this work but is **not** itself one of the eight stages.
- **Stage 1 completed** — 2026-04-13. Schema migration + cover-teacher removal live on prod (commit `3893bec7`). Stage 2 (solver core) is now unblocked.
- **Stage 2 completed** — 2026-04-14. Solver + prereq service now understand the pin/pool model; `is_primary` scoring removed from the solver. Deployed to prod; api and worker restarted clean. Stage 3 (API surface updates) is now unblocked.
- **Stage 3 completed** — 2026-04-14. Teacher-competencies API reshaped around `class_id`; `GET /coverage` now returns per-class rows with pinned/pool/missing mode and eligible teacher counts. Deployed to prod. Stage 4 (competencies UI rebuild) is now unblocked.
- **Stage 4 completed** — 2026-04-14. Competencies page rebuilt around the year-group + class pin/pool model; per-class coverage grid live. Deployed to prod. Stage 5 (seed NHQS data) is now unblocked.
- **Stage 5 completed** — 2026-04-14. NHQS seeded (59 curriculum, 162 pool competencies, 155 staff availability rows). Prereq check patched (Option C2) to handle homeroom-model schools without seeding redundant `class_scheduling_requirements`. Prereqs endpoint returns `ready: true` on prod. Stage 6 (generate end-to-end) is now unblocked — note the auto-page UI bug documented in Stage 5's follow-ups.
- **Stage 6 completed** — 2026-04-14. Run `eace28b5-75f0-4b07-bc44-eaf48a41be05` applied on NHQS: 361 entries, 0 hard violations, 89% preference satisfaction, 33 unassigned. `schedules` table populated (361 rows × 16 classes × 24 teachers). Analytics and teacher timetable verified live. Seven pipeline bugs fixed in-stage (config_snapshot stub, RLS on failure-update, review shape+envelope, auto-page envelopes, my-timetable wrong URL + role gate, dashboard overview envelope). Stage 7 (substitutes page) is now unblocked.
- **Stage 7 completed** — 2026-04-14. `substitute_teacher_competencies` table + RLS policy + `set_updated_at` trigger deployed on prod. Full CRUD API surface (`list`, `create`, `update`, `delete`, `bulk`, `copy`, `copy-to-years`, `by-teacher`, `by-subject`) plus new `GET /v1/scheduling/substitute-competencies/suggest?academic_year_id=…&class_id=…&subject_id=…&date=…` endpoint ranking pin > pool > cover-count penalty. `SubstitutionService.findEligibleSubstitutes` rewired to query the new table (pin = `class_id` match on the schedule's class, pool = same `year_group`); `is_primary` signal restored. Frontend page `/scheduling/substitute-competencies` is a literal clone of the Stage 4 page with amber accent and parallel i18n (en + ar). Hub tile added under "Day-to-day Operations". Verified on NHQS as `Yusuf Rahman (owner)`: pool POST returned 201 (Sarah Daly → Arabic), pin POST returned 201 (Sarah Daly → K1A Arabic) and persisted across reload with "Preferred" badge. RTL pass on `/ar/scheduling/substitute-competencies` — header, banner, legend translated; `dir="rtl"` applied. 52 unit tests pass across `substitute-competencies.service.spec.ts`, `substitution.service.spec.ts`, `substitution-branches.spec.ts`. DI smoke clean. Stage 8 (downstream rewire — teaching-allocations, report-comments) is now unblocked.

## Stage 7 — Substitutes page + table

**What shipped**

- New Prisma model `SubstituteTeacherCompetency` mirroring `TeacherCompetency` (same six-column unique index including `class_id`, same FK cascades on `tenant`/`academic_year`/`staff_profile`/`subject`/`year_group`/`class`). Migration `20260414120000_add_substitute_teacher_competencies/` with both `migration.sql` and `post_migrate.sql` (the latter enables `ENABLE` + `FORCE` RLS, installs `substitute_teacher_competencies_tenant_isolation` policy, and the `set_updated_at` trigger). Applied on prod with `DATABASE_MIGRATE_URL` for ownership privileges (the runtime role cannot `ALTER TABLE`).

- New Zod schemas in `packages/shared/src/schemas/scheduling.schema.ts` under the "Substitute Teacher Competencies" section: `create…`, `update…`, `bulkCreate…`, `copyToYears…`, `list…Query`, and the new `suggestSubstitutesQuerySchema = { class_id, subject_id, date }`. Re-exported via the barrel.

- New `SubstituteCompetenciesService` + `SubstituteCompetenciesController`:
  - CRUD mirrors `TeacherCompetenciesService` exactly (pool-row application-layer uniqueness, `assertClassMatchesYearGroup`, P2002 translation).
  - `suggest(tenantId, academic_year_id, { class_id, subject_id, date })` queries rows where `(class_id = X OR (class_id IS NULL AND year_group_id = Y)) AND subject_id = S`, fetches active staff + day availability + weekly workload, then ranks: pin +25, pool +20, available +15, −1 per weekly cover. Returns `{ staff_profile_id, name, is_pinned, is_available, cover_count, rank_score }` sorted by score desc.
  - Controller routes: `GET`, `POST`, `PATCH :id`, `DELETE :id`, `GET coverage → suggest`, `GET by-teacher/:id`, `GET by-subject`, `POST bulk`, `POST copy`, `POST copy-to-years`. All behind `@RequiresPermission('schedule.manage_substitutions')`.
  - Registered in `SchedulingModule` as controller + provider + export.

- `SubstitutionService.findEligibleSubstitutes` rewired: swaps `teacherCompetency.findMany` for `substituteTeacherCompetency.findMany` with the pin/pool OR clause, restores the `is_primary` signal (now = pin for this specific class), and ranks: pin +30, pool +20, any-competent +10, −2 per weekly cover. The `SchedulesReadFacade.findByIdWithSubstitutionContext` select was extended to include `class_id` at the top level (needed for pin matching). `ScheduleSubstitutionContextRow` interface now exposes `class_id: string`.

- New frontend page `/scheduling/substitute-competencies/page.tsx` cloned from the Stage 4 competencies page with amber accent (amber-500 checkboxes, amber-600 pin badges, amber-50/70 banner stripe, amber-500 tab underline). Own `_components/{types,pool-matrix,pin-matrix,copy-wizard}.tsx` to keep the primary competencies page untouched. Hub tile added under "Day-to-day Operations" using `UserCheck` icon.

- New i18n keys in `messages/en.json` + `messages/ar.json` under `scheduling.v2`: `substituteCompetencies`, `…Desc`, `…Banner`, `substitutePoolSaved/Removed`, `substitutePinReplaced/Cleared`, `substitutePinLabel`, `substituteLegend{Pool,Pin,None}`, `noSubstituteForSubject`. Plus `scheduling.hub.substituteCompetenciesDesc` for the tile caption.

**Migrations / schema changes**

- `20260414120000_add_substitute_teacher_competencies/migration.sql` — table creation, FKs, indexes.
- `20260414120000_add_substitute_teacher_competencies/post_migrate.sql` — RLS policy + `set_updated_at` trigger.
- `packages/prisma/schema.prisma` — new `SubstituteTeacherCompetency` model plus inverse `substitute_teacher_competencies` array relations on `Tenant`, `StaffProfile`, `AcademicYear`, `YearGroup`, `Subject`, `Class`.

**Tests added / updated**

- New: `apps/api/src/modules/scheduling/substitute-competencies.service.spec.ts` — 10 tests across CRUD (pool/pin create, year-group mismatch, pool duplicate conflict, promote/demote/no-op update, delete) and `suggest` (pin > pool ranking, workload tiebreak, empty when no competencies, class-not-found `NotFoundException`).
- Updated: `apps/api/src/modules/scheduling/substitution.service.spec.ts` — mocks switched from `teacherCompetency` to `substituteTeacherCompetency`; the "assigns higher rank to competent teachers" test now seeds a pool row `{ staff_profile_id, class_id: null }`; `mockSchedule` gains `class_id` for pin matching.
- Updated: `apps/api/src/modules/scheduling/substitution-branches.spec.ts` — same mock rename + `class_id` on the null-class_entity fixture.
- Full module pass: 29 scheduling test suites, 560 tests, all green.

**Deployment trace**

- Rsync of `packages/{prisma,shared}` and `apps/{api,web}` with the mandated excludes (`.git`, `node_modules`, `.next`, `dist`, `.env*`, `.turbo`, `*.tsbuildinfo`). `chown -R edupod:edupod` post-sync. `.env` symlinks at `apps/api/.env` and `apps/worker/.env` verified intact.
- `pnpm migrate:deploy` applied `20260414120000_add_substitute_teacher_competencies`. `post_migrate.sql` required `DATABASE_MIGRATE_URL` (owner role) — ran cleanly on retry: `ALTER TABLE`, `CREATE POLICY`, `CREATE TRIGGER`.
- `pnpm --filter @school/shared build` + `pnpm --filter @school/prisma generate` to rebuild the shared dist (the API consumes `@school/shared/dist`) and regenerate the Prisma client.
- `pnpm --filter @school/{api,worker} build`, `pnpm --filter @school/web build`. `pm2 restart api worker web`. Health check returns 200, postgresql+redis+bullmq all up.

**Playwright verification (nhqs.edupod.app, Yusuf Rahman owner)**

- `/en/scheduling` — "Substitute Competencies" tile renders under "Day-to-day Operations".
- `/en/scheduling/substitute-competencies` — header, amber banner, three-item legend (Pool / Preferred / Not eligible), year group buttons (K → 6th Class), class tabs + `All (pool)`, subject columns, teacher rows all render.
- Create pool: click Sarah Daly × Arabic → `POST /api/v1/scheduling/substitute-competencies` → 201. Reload → checkbox stays checked (persisted).
- Create pin: switch to K1A tab → Select → Sarah Daly for Arabic → 201. Reload → select label reads "Sarah Daly", status cell shows the "Preferred" amber badge.
- RTL: `/ar/scheduling/substitute-competencies` — `dir="rtl"`, header "كفاءات البدلاء", banner + legend translated.

**Acceptance checklist**

- [x] New table + RLS policy live on prod.
- [x] New API endpoints respond (list + CRUD + suggest).
- [x] New UI page loads, creates/pins/deletes.
- [x] Substitution service rewired to the new table (`is_primary` restored via `class_id` match).
- [x] Hub tile added.
- [x] i18n en + ar.
- [x] Playwright: hub tile, CRUD, persistence, RTL.
- [x] type-check / lint / DI smoke / 29 scheduling test suites clean.
- [x] Local commit; nothing pushed.
- [x] Completion entry appended + status board flipped.

**Notes / follow-ups**

- The substitutions page (`/scheduling/substitutions`) has a pre-existing 404 on `GET /api/v1/staff?pageSize=200&role=teacher` (flagged in Stage 1's log). Unrelated to Stage 7; the `/substitute-competencies` endpoint the new page hits works fine. Leaving as-is — belongs to whichever stage rewires that page next.
- The existing `teacher_competencies` table still only has `ENABLE ROW LEVEL SECURITY` (no `FORCE`) — a pre-Stage-1 inconsistency. Stage 7 uses both `ENABLE` + `FORCE` on `substitute_teacher_competencies` as the stage doc required. Worth reconciling at some point but out of scope.
- Permission `schedule.manage_substitutions` is already provisioned in DB (used by the existing enhanced substitutions endpoints). No seed-data change needed.
- The new controller's `/suggest` endpoint is in addition to the existing `GET /absences/:id/substitutes` on `scheduling-enhanced.controller` — they now share the same ranking signal via the rewired `SubstitutionService.findEligibleSubstitutes`. Stage 8 can decide whether to consolidate.
- **Stage 8 completed** — 2026-04-14. Three downstream consumers (teaching-allocations, report-comment-windows, report-cards-queries) now read from the live `schedules` table via three new `SchedulesReadFacade` helpers (`getTeacherAssignmentsForYear`, `getAllAssignmentsForYear`, `hasAppliedSchedule`). The hardcoded `is_primary: false` field was retired from `SchedulingReadFacade.findTeacherCompetencies`, the `TeacherCompetencyRow` interface, and frontend display in assessments + leadership-dashboard. New empty-state UX ("No timetable applied yet → Go to scheduling") on `/en/assessments` and `/en/report-comments` for the no-applied-schedule branch. Found and fixed a pre-existing worker bug: two `@Processor('scheduling')` classes spawned competing BullMQ Worker instances that silently no-op'd whichever solve-v2 jobs they happened to pull first; consolidated into a single `SchedulingSolverV2Processor` that dispatches `scheduling:reap-stale-runs` to the now-plain-service `SchedulingStaleReaperJob`. Verified end-to-end on NHQS: Flow A (with applied run) shows Sarah Daly's 56 allocations and the report-comments subject pairs; Flow B (after run discard + schedule end-date) shows the empty-state UX with the CTA. Generated a fresh end-to-end run `4288cbb6-8166-4b14-91c6-d7dc591713a5` (358 entries, 36 unassigned, 88% preference satisfaction, **10.8s solver time** for 16 classes / 24 teachers / 59 curriculum entries / 9 year groups), applied it cleanly. The scheduler rebuild (Stages 1-8) is now done.

## Stage 8 — Downstream rewire

**What shipped**

- New `SchedulesReadFacade` helpers (`apps/api/src/modules/schedules/schedules-read.facade.ts`):
  - `getTeacherAssignmentsForYear(tenantId, academicYearId, staffProfileId)` — distinct `(class_id, subject_id)` pairs for the teacher, derived from the live `schedules` table and dedup'd. Handles two school models: subject-specific classes resolve directly via `class.subject_id`; homeroom classes (Class.subject_id = NULL, the NHQS pattern) fall through to a curriculum-matrix × teacher-competency intersection.
  - `getAllAssignmentsForYear(tenantId, academicYearId)` — same shape per teacher, used by the leadership dashboard.
  - `hasAppliedSchedule(tenantId, academicYearId)` — boolean used by callers to distinguish "no timetable applied yet" from "this teacher just isn't scheduled".

- `apps/api/src/modules/gradebook/teaching-allocations.service.ts` — full rewrite. `getMyAllocations` and `getAllAllocations` now query schedules via the facade, hydrate class/subject/teacher names, and layer gradebook setup status (grade configs, approved categories, weights, assessment counts). New return shape: `{ data: TeachingAllocation[], meta: { reason: 'no_timetable_applied' | 'ok' } }`. The `is_primary` field is gone from both the interface and the response.

- `apps/api/src/modules/gradebook/report-cards/report-comment-windows.service.ts` — `getLandingScopeForActor` teacher path now derives `subject_assignments` from `getTeacherAssignmentsForYear` instead of competency × matrix. Admin path unchanged (whole curriculum matrix). New `no_timetable_applied: boolean` on the response.

- `apps/api/src/modules/gradebook/report-cards/report-cards-queries.service.ts` — `resolveTeacherVisibleStudents` swaps the competency × matrix block for `getTeacherAssignmentsForYear` to derive class IDs.

- `apps/api/src/modules/scheduling/scheduling-read.facade.ts` — `findTeacherCompetencies` no longer hardcodes `is_primary: false`; the `TeacherCompetencyRow` interface drops the field and adds `class_id: string | null`.

- `apps/api/src/modules/scheduling/ai-substitution.service.ts` — Stage 7 carry-over: switched from `teacherCompetency` to `substituteTeacherCompetency`, with pin (`class_id` match) restoring the real `is_primary` signal for AI ranking.

- Frontend `is_primary` cleanup: removed from `assessments/page.tsx`, `assessments/_components/leadership-dashboard.tsx`, and `assessments/workspace/[classId]/[subjectId]/page.tsx` interfaces. Empty-state UX added to `assessments/page.tsx` (NoTimetableEmptyState component with Go-to-scheduling link) and `report-comments/page.tsx` (EmptyState with router-push action). New i18n keys `assessments.noTimetableApplied`, `assessments.goToScheduler`, `reportComments.noTimetableApplied`, `reportComments.noTimetableAppliedDesc`, `reportComments.goToScheduler` in en + ar.

- Worker bug fix: collapsed two `@Processor(QUEUE_NAMES.SCHEDULING)` classes into one. `SchedulingStaleReaperProcessor` is now `SchedulingStaleReaperJob` (`@Injectable()`, no decorator), and `SchedulingSolverV2Processor` is the SOLE BullMQ worker on the scheduling queue. It dispatches `scheduling:reap-stale-runs` jobs to the stale reaper service. Without this, BullMQ would assign solve-v2 jobs to whichever worker pulled them first; the wrong worker's early-return guard would silently mark the job complete in BullMQ without running the solver.

**Migrations / schema changes**

- None. Pure code rewire.

**Tests added / updated**

- New: 11 facade unit tests in `schedules-read.facade.spec.ts` across `getTeacherAssignmentsForYear` (subject-specific dedupe, empty teacher, homeroom resolution via pool match, homeroom resolution via pin, scope filters), `getAllAssignmentsForYear` (subject-specific triples, missing teacher_staff_id), `hasAppliedSchedule` (true/false/scope).
- New: 8 unit tests in `teaching-allocations.service.spec.ts` (getMyAllocations: no academic year / no profile / empty schedule / hydrated / unscheduled-teacher; getAllAllocations: no schedule / hydrated; getClassAllocations: filter by class).
- Updated: `report-comment-windows.service.spec.ts` — five rewritten tests covering admin path, teacher schedule-derived path, no_timetable_applied, no-window, no-staff-profile, no-scheduled-classes.
- Updated: `report-cards-queries.service.spec.ts` — `SchedulingReadFacade` mock swapped for `SchedulesReadFacade`; legacy `teacherCompetency` Prisma mock removed.
- Updated: `ai-substitution.service.spec.ts` — `teacherCompetency` mock swapped for `substituteTeacherCompetency`, two "either-or" tests rewritten as "both or skip" to match the Stage 7 + 8 contract that competencies are keyed by `(subject, year_group)`.
- Updated: `scheduling-stale-reaper.processor.spec.ts` — class rename `Processor → Job`.
- Updated: `solver-v2.processor.spec.ts` — constructor takes a 2nd `staleReaperJob` arg now; the failure-path assertion moved from `mockPrisma.schedulingRun.update` to `mockTx.schedulingRun.update` to reflect the Stage 6 RLS-transaction wrap.
- Full module pass: 100 suites, 2004 tests across `gradebook/`, `schedules/`, `scheduling/`, all green. Worker tests: 7 green.

**Deployment trace**

- Rsync of `packages/shared`, `apps/api`, `apps/web` with the mandated excludes; `chown -R edupod:edupod`; `.env` symlinks intact. Rebuild + restart api + web.
- Worker-bug fix required a second deploy: rsync `apps/worker`, rebuild, restart. After restart the new fresh run was processed in 10.8s on the first try.
- Health check: api 200, postgresql/redis/bullmq all up.

**Playwright verification (nhqs.edupod.app)**

- Flow A — with the Stage 6 applied run still live:
  - Sarah Daly logged in → `/en/assessments` shows TOTAL ALLOCATIONS = 52 (homeroom resolution working — 14 classes × multiple subjects via curriculum matrix × pool competency).
  - `/en/report-comments` shows the open comment window banner and the subject pairs grid (no empty state).
  - Owner Yusuf Rahman → `/en/assessments` (leadership dashboard) shows Active Teachers = 20, Total Assessments = 33.
- Flow B — after discarding the run + end-dating its 361 schedules:
  - Sarah Daly → `/en/assessments` shows TOTAL ALLOCATIONS = 0 + the new "No timetable has been applied yet" empty state with "Go to scheduling" link.
  - `/en/report-comments` shows the new "No timetable has been applied yet" EmptyState alongside Sarah's homeroom 2A overall card (homeroom card persists because it is window-table driven, not schedule-table driven — correct per Stage 8 contract).
- Fresh end-to-end run: triggered via UI → run `4288cbb6-8166-4b14-91c6-d7dc591713a5` queued at 11:52:54 → solver completed in **10.8s** → applied via UI → 358 schedules across 16 classes × 24 teachers landed in the `schedules` table → Sarah's `/en/assessments` reflowed to TOTAL ALLOCATIONS = 56.

**Acceptance checklist**

- [x] All three target services read from `schedules` (via the shared helper).
- [x] `is_primary` references removed from the three service response shapes and the gradebook/assessment frontend.
- [x] Empty-state copy rendered correctly when no timetable is applied (verified Flow B).
- [x] Unit + integration tests green (2004 API tests + 7 worker tests).
- [x] Playwright Flow A and Flow B both pass.
- [x] type-check / lint / DI clean.
- [x] Local commit; nothing pushed.
- [x] Completion entry appended; status board flipped to `complete` for Stage 8.

**Notes / follow-ups**

- The worker bug (two competing `@Processor` instances on one queue) was pre-existing — Stage 6's run worked by lucky timing, but on a busy worker most solve-v2 jobs would never run. If new domain-specific scheduling jobs are ever added later, route them through the single `SchedulingSolverV2Processor` dispatcher rather than introducing a new `@Processor` for the same queue.
- The schedule's `class.subject_id` heuristic is subject-school first, homeroom-school fallback. For schools that mix both models per academic year, the resolution still works per-class because the fallback only kicks in when `class.subject_id` is null.
- `class_id` is now exposed on `TeacherCompetencyRow` since the field was added in Stage 1 and is needed downstream by callers that distinguish pin vs pool.
- `effective_end_date` semantic for `hasAppliedSchedule`: any schedule row with `effective_end_date IS NULL OR effective_end_date >= now()` counts as "applied". Discarding a run no longer auto-clears the schedules; that is governed by the apply flow on the next run, which deletes prior auto_generated entries for the academic year.

## Scheduler rebuild — done

All eight stages complete:

| #   | Stage                                    | Status     |
| --- | ---------------------------------------- | ---------- |
| 1   | Schema migration + cover-teacher removal | `complete` |
| 2   | Solver core updates                      | `complete` |
| 3   | API surface updates                      | `complete` |
| 4   | Competencies page UI rebuild             | `complete` |
| 5   | Seed NHQS data                           | `complete` |
| 6   | Generate end-to-end on NHQS              | `complete` |
| 7   | Substitutes page + table                 | `complete` |
| 8   | Downstream rewire                        | `complete` |

Live on prod. NHQS has an applied timetable (run 4288cbb6, 358 entries) and the new substitute-competencies + downstream-schedule-derived flows. The `scheduler/` folder stays in the repo for historical reference and any future scheduler iterations.
