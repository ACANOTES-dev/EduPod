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

| #   | Stage                                    | Status     | Owner (session/date) | Notes                                                        |
| --- | ---------------------------------------- | ---------- | -------------------- | ------------------------------------------------------------ |
| 1   | Schema migration + cover-teacher removal | `complete` | Claude / 2026-04-13  | Migration live on prod; commit `3893bec7`.                   |
| 2   | Solver core updates                      | `complete` | Claude / 2026-04-14  | Commit `d76344bb`; pin/pool model live on prod.              |
| 3   | API surface updates                      | `complete` | Claude / 2026-04-14  | Commit `477b0076`; competency API + coverage per-class live. |
| 4   | Competencies page UI rebuild             | `complete` | Claude / 2026-04-14  | Commit `ed5ea305`; competencies + coverage UI live on prod.  |
| 5   | Seed NHQS data                           | `pending`  | —                    | Blocked by Stage 4                                           |
| 6   | Generate end-to-end on NHQS              | `pending`  | —                    | Blocked by Stage 5                                           |
| 7   | Substitutes page + table                 | `pending`  | —                    | Blocked by Stage 6                                           |
| 8   | Downstream rewire                        | `pending`  | —                    | Blocked by Stage 7                                           |

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

_Pending — will be populated when Stage 5 completes._

### Stage 6 — Generate end-to-end on NHQS

_Pending — will be populated when Stage 6 completes._

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
