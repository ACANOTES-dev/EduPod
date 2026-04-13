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

| #   | Stage                                    | Status     | Owner (session/date) | Notes                                           |
| --- | ---------------------------------------- | ---------- | -------------------- | ----------------------------------------------- |
| 1   | Schema migration + cover-teacher removal | `complete` | Claude / 2026-04-13  | Migration live on prod; commit `3893bec7`.      |
| 2   | Solver core updates                      | `complete` | Claude / 2026-04-14  | Commit `d76344bb`; pin/pool model live on prod. |
| 3   | API surface updates                      | `pending`  | —                    | Unblocked by Stage 2                            |
| 4   | Competencies page UI rebuild             | `pending`  | —                    | Blocked by Stage 3                              |
| 5   | Seed NHQS data                           | `pending`  | —                    | Blocked by Stage 4                              |
| 6   | Generate end-to-end on NHQS              | `pending`  | —                    | Blocked by Stage 5                              |
| 7   | Substitutes page + table                 | `pending`  | —                    | Blocked by Stage 6                              |
| 8   | Downstream rewire                        | `pending`  | —                    | Blocked by Stage 7                              |

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

_Pending — will be populated when Stage 3 completes._

### Stage 4 — Competencies page UI rebuild

_Pending — will be populated when Stage 4 completes._

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
