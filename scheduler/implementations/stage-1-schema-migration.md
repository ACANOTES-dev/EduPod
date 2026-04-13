# Stage 1 — Schema migration + cover-teacher removal

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 1 is `pending`. If it is already `complete`, stop. If the log shows mid-stage state (partial commit, migration partially applied), reconcile before continuing.

## Purpose

Two atomic changes that must land together because `cover-teacher.service` reads `is_primary` and won't compile after the schema change:

1. Evolve `teacher_competencies` from year-group-grained to hybrid pool/pin grain by adding a nullable `class_id` and removing `is_primary`.
2. Delete `cover-teacher.service`, its controller, and all references to it. The substitution board loses auto-suggestions; Stage 7 restores them against a new substitutes table.

After this stage, the solver won't yet _use_ `class_id` — that's Stage 2. The DB is just prepared.

## Prerequisites

- Wiring-bug fix (`scheduling-runs.service` enqueues `scheduling:solve-v2`) — **already live** on production at commit `f878053f` as of the orchestration kickoff. Verify `POST /v1/scheduling-runs` exists and compiles before starting.
- No other stage in this plan. This is the first.

## Scope — what to change

### A. Schema migration

**New migration:** `packages/prisma/migrations/<timestamp>_teacher_competencies_class_id_and_drop_is_primary/`

Use `pnpm --filter @school/prisma migrate dev --name teacher_competencies_class_id_and_drop_is_primary` to generate.

The migration must:

- `ALTER TABLE teacher_competencies ADD COLUMN class_id UUID NULL REFERENCES classes(id) ON UPDATE CASCADE ON DELETE CASCADE`.
- `DROP COLUMN is_primary` from `teacher_competencies`.
- Drop the old unique constraint (`(tenant_id, academic_year_id, staff_profile_id, subject_id, year_group_id)`) and create the new one: `UNIQUE (tenant_id, academic_year_id, staff_profile_id, subject_id, year_group_id, class_id)`. Note that Postgres treats `NULL` as distinct for uniqueness, which is the behaviour we want — two rows for the same `(teacher, subject, year_group)` where one has `class_id = NULL` and the other has `class_id = <uuid>` are distinct, and that's fine.
- Create index `idx_teacher_competencies_tenant_class` on `(tenant_id, class_id)` for efficient pin lookups.
- RLS policy unchanged (predicate uses only `tenant_id`); no `post_migrate.sql` edit needed unless the table is newly-created (it isn't).

Update `packages/prisma/schema.prisma`:

```prisma
model TeacherCompetency {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String   @db.Uuid
  academic_year_id    String   @db.Uuid
  staff_profile_id    String   @db.Uuid
  subject_id          String   @db.Uuid
  year_group_id       String   @db.Uuid
  class_id            String?  @db.Uuid                          // NEW
  // is_primary removed                                          // REMOVED
  created_at          DateTime @default(now())  @db.Timestamptz(6)
  updated_at          DateTime @default(now()) @updatedAt @db.Timestamptz(6)

  tenant         Tenant        @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  academic_year  AcademicYear  @relation(fields: [academic_year_id], references: [id], onDelete: Cascade)
  staff_profile  StaffProfile  @relation(fields: [staff_profile_id], references: [id], onDelete: Cascade)
  subject        Subject       @relation(fields: [subject_id], references: [id], onDelete: Cascade)
  year_group     YearGroup     @relation(fields: [year_group_id], references: [id], onDelete: Cascade)
  class          Class?        @relation(fields: [class_id], references: [id], onDelete: Cascade)  // NEW

  @@unique([tenant_id, academic_year_id, staff_profile_id, subject_id, year_group_id, class_id])
  @@index([tenant_id, class_id])
  @@map("teacher_competencies")
}
```

Leave the `Class` model untouched — add the back-relation `teacher_competencies TeacherCompetency[]` if it doesn't already exist.

### B. Cover-teacher removal

Delete these files:

- `apps/api/src/modules/scheduling/cover-teacher.service.ts`
- `apps/api/src/modules/scheduling/cover-teacher.service.spec.ts` (if present)
- Any `cover-teacher.controller.ts` or route file.

Remove from `apps/api/src/modules/scheduling/scheduling.module.ts`:

- Remove `CoverTeacherService` from `providers` and `exports`.
- Remove any `CoverTeacherController` from `controllers`.
- Remove related imports.

Grep the codebase for remaining references — **every hit must be removed**, including:

```bash
grep -rn "cover-teacher\|CoverTeacher\|coverTeacher" apps/ packages/
```

Expected remaining surfaces that will need stub edits, not hard deletions:

- `apps/api/src/modules/scheduling/substitutions.service.ts` (or wherever the substitution assignment flow lives) — if it calls `CoverTeacherService.suggestCover(...)`, remove that call and substitute with a comment referencing Stage 7: `// Auto-suggestion deferred to Stage 7 substitutes table`. The return type of the substitution-suggestion endpoint should become an empty array (or the endpoint deleted entirely if no UI relies on it — verify first).
- Frontend `/scheduling/substitutions/page.tsx` may call a suggest endpoint; if so, delete the call and surrounding UI. Leave a placeholder: the page still allows manual substitute assignment without suggestions. Playwright confirms the page still loads.

### C. Regenerate Prisma client

`pnpm --filter @school/prisma generate` — or let `migrate dev` do it.

Check that `packages/shared/src/prisma-types.ts` (if it exists) doesn't export any `is_primary` type alias.

## Non-goals for this stage

- Do **not** update the solver or the orchestration service. They'll still compile because they read existing fields; `is_primary` removal from them happens in Stage 2.
- Do **not** touch the frontend competencies page. That's Stage 4.
- Do **not** seed or wipe any NHQS data. That's Stage 5.

## Step-by-step

1. Pull latest local `main` into your working tree. Confirm `git status` is clean of scheduler-related changes.
2. Create the migration: `pnpm --filter @school/prisma migrate dev --name teacher_competencies_class_id_and_drop_is_primary`. This runs it against your local dev DB.
3. Inspect the generated SQL in `packages/prisma/migrations/<timestamp>_.../migration.sql`. Confirm it contains the ADD COLUMN, DROP COLUMN, and uniqueness changes exactly as described above. Hand-edit if needed.
4. Update `packages/prisma/schema.prisma` if `migrate dev` hasn't already. Generate client: `pnpm --filter @school/prisma generate`.
5. Delete the cover-teacher files. Remove module registrations. Grep-verify zero references remain.
6. Adjust the one or two callers (substitutions service, substitutions frontend) so the app still compiles. Keep the manual-pick flow intact.
7. Run `turbo type-check` from repo root. Must pass clean (pre-existing test-file errors in unrelated modules are acceptable per `CLAUDE.md`).
8. Run `turbo lint --filter=@school/api`. Clean.
9. Run the DI smoke test from `../PLAN.md` → "Module registration discipline". Must print `DI OK`.
10. Run tests that touch the modified files:
    - `pnpm --filter @school/api test -- --testPathPattern='scheduling|teacher-competenc'`
    - Update any unit tests that referenced `is_primary` or imported `CoverTeacherService` — delete or adjust.
11. Commit locally:

    ```bash
    git add packages/prisma/migrations packages/prisma/schema.prisma \
            apps/api/src/modules/scheduling apps/web/...
    git commit -m "refactor(scheduling): drop is_primary, add class_id to competencies, remove cover-teacher

    ...
    Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
    ```

    **Never `git push`. Never `gh pr create`.**

12. Deploy schema + code to production:
    - Rsync changed source files: the migration directory, schema.prisma, and the API source changes.
    - On server: `sudo -u edupod bash -lc 'cd /opt/edupod/app && pnpm --filter @school/prisma generate'`.
    - On server: `sudo -u edupod bash -lc 'cd /opt/edupod/app && pnpm --filter @school/prisma migrate deploy'` — this applies the migration to production. **Never use `migrate dev` on the server.**
    - Rebuild API: `sudo -u edupod bash -lc 'cd /opt/edupod/app && pnpm --filter @school/api build'`. Fix dist ownership first if permissions block it (`chown -R edupod:edupod /opt/edupod/app/apps/api/dist`).
    - Restart: `sudo -u edupod pm2 restart api`.
13. Verify on prod:
    ```bash
    ssh root@46.62.244.139 "docker exec edupod-postgres-1 psql -U edupod_admin -d school_platformedupod_prod -c '\d teacher_competencies'"
    ```
    Confirm `class_id uuid` column exists and `is_primary` is gone. Check `sudo -u edupod pm2 logs api --lines 30 --nostream` for clean startup, no DI errors.

## Testing requirements

### Unit

- All tests in `apps/api/src/modules/scheduling/**/*.spec.ts` must pass. Update any that referenced the removed fields.
- If you delete `cover-teacher.service.spec.ts`, remove it from any test index.

### Integration

- `apps/api/test/` — any e2e test that hit the cover-teacher endpoint must be deleted or adjusted. Run `pnpm --filter @school/api test:e2e -- --testPathPattern=scheduling` and confirm green.

### Browser (Playwright)

Even though this stage is schema-level, the substitution flow is user-visible. Exercise it to confirm the UI still loads:

1. Navigate to `https://nhqs.edupod.app/en/scheduling/substitutions` as `owner@nhqs.test` / `Password123!`.
2. Confirm the page loads without a console error.
3. If the page renders a "suggest substitute" button, confirm it is now absent or gracefully says "manual picker only" — whichever you implemented in step 6.
4. Attach a snapshot to the log entry.

### Coverage

`turbo test -- --coverage` on affected workspaces. Thresholds in `jest.config.js` are a floor — ratchet up to `current - 2%` if coverage improved.

## Acceptance criteria — the stage is done when

- [x] Migration applied to prod; `\d teacher_competencies` on prod confirms `class_id` exists and `is_primary` is gone.
- [x] `cover-teacher` source files deleted; `grep -rn "CoverTeacher" apps/ packages/` returns zero results.
- [x] `turbo type-check` passes on the local tree (excluding pre-existing unrelated spec errors).
- [x] `turbo lint` clean.
- [x] DI smoke test prints `DI OK`.
- [x] Unit + integration tests green on local.
- [x] API restarts clean on prod; pm2 logs show no boot errors.
- [x] `/scheduling/substitutions` loads on prod without console errors (Playwright snapshot attached).
- [x] Local commit created. Nothing pushed to GitHub.
- [x] Completion entry appended to `../IMPLEMENTATION_LOG.md` with all template fields filled.

## If something goes wrong

- **Migration fails on production** (existing data violates new constraint): the old unique constraint on 5 columns will not break when we add a 6th nullable column, but check the Postgres logs. If it does fail, investigate before retrying. Do not `DROP TABLE` under any circumstances.
- **DI smoke test fails**: the most common cause is a missing `imports` entry after the cover-teacher removal. Re-grep for `SchedulingModule`, check every `providers`/`exports`.
- **Frontend shows "Cannot GET /api/v1/scheduling/cover-teacher"**: you missed a caller. Grep the web app for `cover-teacher` or `coverTeacher` and remove.

## What the completion entry should include

Append to `../IMPLEMENTATION_LOG.md` → "Stage 1" section using the template in that file. Specifically:

- The exact migration name and the timestamp at which `prisma migrate deploy` ran on prod.
- The commit SHA(s) for the local commit.
- Full list of deleted files under "Files changed".
- The Playwright URL and what you verified.
- Any surprises — e.g. if a caller of `cover-teacher` was found in an unexpected module.
