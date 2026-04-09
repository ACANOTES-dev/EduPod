# Implementation 01 — Database Foundation

**Wave:** 1 (blocks everything else)
**Depends on:** nothing
**Blocks:** 02, 03, 04, 05, 06 (all subsequent implementations)
**Can run in parallel with:** nothing
**Complexity:** high (schema design, RLS policies, migrations, Zod schemas, seeds)

---

## 1. Purpose

Land the complete database foundation for the Report Cards redesign: new tables, new columns, enum updates, RLS policies, Zod schemas in `@school/shared`, and default tenant seeds. This implementation is a single non-interruptible unit because schema changes must land atomically and every subsequent implementation depends on the final shape.

**Authoritative source:** `report-card-spec/design-spec.md` Section 5 (Data model).

---

## 2. Scope

### In scope

1. Prisma schema additions and modifications in `packages/prisma/schema.prisma`
2. One Prisma migration generated via `prisma migrate dev` with a descriptive name
3. RLS policies added to `packages/prisma/rls/post_migrate.sql` (or wherever the project places them — verify first)
4. Seed updates in `packages/prisma/seed.ts` for default content-scope template rows and default tenant settings row
5. Zod schemas and TypeScript types added to `packages/shared/src/` for every new entity and every JSONB payload
6. Unit tests for every non-trivial Zod `.refine()` rule
7. RLS leakage tests (one per new tenant-scoped table) in `apps/api/test/`

### Out of scope (belongs to later implementations)

- Services, controllers, endpoints — **no code in `apps/api/src/modules/`**
- Frontend pages
- Worker processors
- Existing `ReportCard` / `ReportCardTemplate` business logic changes — this implementation only alters their schema, not their usage

---

## 3. Prerequisites before starting

1. Pull latest `main` and confirm `pnpm install` is clean
2. Read `report-card-spec/design-spec.md` Section 5 end to end
3. Read `report-card-spec/implementations/00-common-knowledge.md` end to end
4. Confirm you can run `pnpm --filter @school/prisma prisma migrate dev` locally
5. Confirm your local DB is accessible and the existing migrations apply cleanly

---

## 4. Task breakdown

### 4.1 Prisma schema additions

In `packages/prisma/schema.prisma`, add the following. All new tables follow the project's column conventions (UUID PKs, TIMESTAMPTZ with defaults, snake_case column names).

#### 4.1.1 New enums

```prisma
enum CommentWindowStatus {
  scheduled
  open
  closed
}

enum TeacherRequestType {
  open_comment_window
  regenerate_reports
}

enum TeacherRequestStatus {
  pending
  approved
  rejected
  completed
  cancelled
}

enum ReportCardContentScope {
  grades_only
  // future: grades_homework, grades_attendance, grades_homework_attendance, full_master
}
```

Also extend the existing `ReportCardStatus` enum with a new value:

```prisma
enum ReportCardStatus {
  draft
  published
  superseded  // NEW — set on rows overwritten by regeneration
  // ... preserve any other existing values
}
```

Verify existing enum values first by reading the current schema — do not delete or rename anything.

#### 4.1.2 New model: `ReportCommentWindow`

```prisma
model ReportCommentWindow {
  id                 String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id          String              @db.Uuid
  academic_period_id String              @db.Uuid
  opens_at           DateTime            @db.Timestamptz()
  closes_at          DateTime            @db.Timestamptz()
  status             CommentWindowStatus @default(scheduled)
  opened_by_user_id  String              @db.Uuid
  closed_at          DateTime?           @db.Timestamptz()
  closed_by_user_id  String?             @db.Uuid
  instructions       String?             @db.Text
  created_at         DateTime            @default(now()) @db.Timestamptz()
  updated_at         DateTime            @default(now()) @updatedAt @db.Timestamptz()

  tenant          Tenant         @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  academic_period AcademicPeriod @relation(fields: [academic_period_id], references: [id], onDelete: Cascade)
  opened_by       User           @relation("comment_window_opener", fields: [opened_by_user_id], references: [id], onDelete: Restrict)
  closed_by       User?          @relation("comment_window_closer", fields: [closed_by_user_id], references: [id], onDelete: SetNull)

  @@index([tenant_id, status], name: "idx_report_comment_windows_tenant_status")
  @@index([tenant_id, academic_period_id], name: "idx_report_comment_windows_period")
  @@map("report_comment_windows")
}
```

Add the inverse relations on `Tenant`, `AcademicPeriod`, and `User` (two named relations on `User`).

**Unique partial index** — Prisma does not natively support unique partial indexes, so add it via a raw SQL statement inside the migration (in the migration's `.sql` file):

```sql
CREATE UNIQUE INDEX report_comment_windows_one_open_per_tenant
  ON report_comment_windows (tenant_id)
  WHERE status = 'open';
```

**Check constraint:**

```sql
ALTER TABLE report_comment_windows
  ADD CONSTRAINT report_comment_windows_closes_after_opens
  CHECK (closes_at > opens_at);
```

#### 4.1.3 New model: `ReportCardSubjectComment`

```prisma
model ReportCardSubjectComment {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id             String    @db.Uuid
  student_id            String    @db.Uuid
  subject_id            String    @db.Uuid
  class_id              String    @db.Uuid
  academic_period_id    String    @db.Uuid
  author_user_id        String    @db.Uuid
  comment_text          String    @db.Text
  is_ai_draft           Boolean   @default(false)
  finalised_at          DateTime? @db.Timestamptz()
  finalised_by_user_id  String?   @db.Uuid
  last_ai_drafted_at    DateTime? @db.Timestamptz()
  created_at            DateTime  @default(now()) @db.Timestamptz()
  updated_at            DateTime  @default(now()) @updatedAt @db.Timestamptz()

  tenant          Tenant         @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  student         Student        @relation(fields: [student_id], references: [id], onDelete: Cascade)
  subject         Subject        @relation(fields: [subject_id], references: [id], onDelete: Cascade)
  class_entity    Class          @relation(fields: [class_id], references: [id], onDelete: Cascade)
  academic_period AcademicPeriod @relation(fields: [academic_period_id], references: [id], onDelete: Cascade)
  author          User           @relation("subject_comment_author", fields: [author_user_id], references: [id], onDelete: Restrict)
  finalised_by    User?          @relation("subject_comment_finaliser", fields: [finalised_by_user_id], references: [id], onDelete: SetNull)

  @@unique([tenant_id, student_id, subject_id, academic_period_id], name: "idx_subj_comments_unique")
  @@index([tenant_id, author_user_id, academic_period_id], name: "idx_subj_comments_teacher")
  @@index([tenant_id, class_id, subject_id, academic_period_id], name: "idx_subj_comments_class")
  @@map("report_card_subject_comments")
}
```

#### 4.1.4 New model: `ReportCardOverallComment`

```prisma
model ReportCardOverallComment {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id             String    @db.Uuid
  student_id            String    @db.Uuid
  class_id              String    @db.Uuid
  academic_period_id    String    @db.Uuid
  author_user_id        String    @db.Uuid
  comment_text          String    @db.Text
  finalised_at          DateTime? @db.Timestamptz()
  finalised_by_user_id  String?   @db.Uuid
  created_at            DateTime  @default(now()) @db.Timestamptz()
  updated_at            DateTime  @default(now()) @updatedAt @db.Timestamptz()

  tenant          Tenant         @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  student         Student        @relation(fields: [student_id], references: [id], onDelete: Cascade)
  class_entity    Class          @relation(fields: [class_id], references: [id], onDelete: Cascade)
  academic_period AcademicPeriod @relation(fields: [academic_period_id], references: [id], onDelete: Cascade)
  author          User           @relation("overall_comment_author", fields: [author_user_id], references: [id], onDelete: Restrict)
  finalised_by    User?          @relation("overall_comment_finaliser", fields: [finalised_by_user_id], references: [id], onDelete: SetNull)

  @@unique([tenant_id, student_id, academic_period_id], name: "idx_overall_comments_unique")
  @@index([tenant_id, class_id, academic_period_id], name: "idx_overall_comments_class")
  @@map("report_card_overall_comments")
}
```

#### 4.1.5 New model: `ReportCardTeacherRequest`

```prisma
model ReportCardTeacherRequest {
  id                    String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id             String                @db.Uuid
  requested_by_user_id  String                @db.Uuid
  request_type          TeacherRequestType
  academic_period_id    String                @db.Uuid
  target_scope_json     Json?
  reason                String                @db.Text
  status                TeacherRequestStatus  @default(pending)
  reviewed_by_user_id   String?               @db.Uuid
  reviewed_at           DateTime?             @db.Timestamptz()
  review_note           String?               @db.Text
  resulting_run_id      String?               @db.Uuid
  resulting_window_id   String?               @db.Uuid
  created_at            DateTime              @default(now()) @db.Timestamptz()
  updated_at            DateTime              @default(now()) @updatedAt @db.Timestamptz()

  tenant          Tenant               @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  requested_by    User                 @relation("teacher_request_author", fields: [requested_by_user_id], references: [id], onDelete: Restrict)
  reviewed_by     User?                @relation("teacher_request_reviewer", fields: [reviewed_by_user_id], references: [id], onDelete: SetNull)
  academic_period AcademicPeriod       @relation(fields: [academic_period_id], references: [id], onDelete: Cascade)
  resulting_run   ReportCardBatchJob?  @relation(fields: [resulting_run_id], references: [id], onDelete: SetNull)
  resulting_window ReportCommentWindow? @relation(fields: [resulting_window_id], references: [id], onDelete: SetNull)

  @@index([tenant_id, status], name: "idx_teacher_requests_status")
  @@index([tenant_id, requested_by_user_id], name: "idx_teacher_requests_user")
  @@map("report_card_teacher_requests")
}
```

#### 4.1.6 New model: `ReportCardTenantSettings`

```prisma
model ReportCardTenantSettings {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id      String   @unique @db.Uuid
  settings_json  Json
  created_at     DateTime @default(now()) @db.Timestamptz()
  updated_at     DateTime @default(now()) @updatedAt @db.Timestamptz()

  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@map("report_card_tenant_settings")
}
```

#### 4.1.7 Column additions — existing tables

**`Student`** — add:

```prisma
preferred_second_language String? @db.VarChar(10)
```

**`ReportCard`** — rename and add:

```prisma
// RENAME
overall_comment_text String? @db.Text  // was: teacher_comment

// ADD
subject_comments_json       Json?
personal_info_fields_json   Json?
pdf_storage_key             String?  @db.VarChar(512)
template_id                 String?  @db.Uuid  // becomes required after backfill
```

Add the relation if `template_id` doesn't already have one:

```prisma
template ReportCardTemplate? @relation("report_card_template", fields: [template_id], references: [id], onDelete: Restrict)
```

**`ReportCardTemplate`** — add:

```prisma
content_scope ReportCardContentScope @default(grades_only)
```

**`ReportCardBatchJob`** — add:

```prisma
scope_type                    String?  @db.VarChar(32)  // 'year_group' | 'class' | 'individual'
scope_ids_json                Json?
personal_info_fields_json     Json?
languages_requested           String[] @default([])
students_generated_count      Int      @default(0)
students_blocked_count        Int      @default(0)
errors_json                   Json?
```

### 4.2 Migration generation

Run:

```bash
pnpm --filter @school/prisma prisma migrate dev --name add-report-cards-redesign-foundation
```

Then hand-edit the generated migration to add:

1. The unique partial index on `report_comment_windows`
2. The check constraint on `report_comment_windows`
3. A backfill statement for `ReportCard.template_id` that points all existing rows at the default template (create one first if none exists)
4. After backfill, alter `ReportCard.template_id` to `NOT NULL` (this will need a separate follow-up migration if the backfill can't run in the same transaction)

### 4.3 RLS policies

In `packages/prisma/rls/post_migrate.sql` (verify the exact filename), add policies for all five new tables:

```sql
-- ─── report_comment_windows ───────────────────────────────────────────────
ALTER TABLE report_comment_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_comment_windows FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_comment_windows_tenant_isolation ON report_comment_windows;
CREATE POLICY report_comment_windows_tenant_isolation ON report_comment_windows
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── report_card_subject_comments ─────────────────────────────────────────
ALTER TABLE report_card_subject_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_subject_comments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_card_subject_comments_tenant_isolation ON report_card_subject_comments;
CREATE POLICY report_card_subject_comments_tenant_isolation ON report_card_subject_comments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── report_card_overall_comments ─────────────────────────────────────────
ALTER TABLE report_card_overall_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_overall_comments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_card_overall_comments_tenant_isolation ON report_card_overall_comments;
CREATE POLICY report_card_overall_comments_tenant_isolation ON report_card_overall_comments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── report_card_teacher_requests ─────────────────────────────────────────
ALTER TABLE report_card_teacher_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_teacher_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_card_teacher_requests_tenant_isolation ON report_card_teacher_requests;
CREATE POLICY report_card_teacher_requests_tenant_isolation ON report_card_teacher_requests
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── report_card_tenant_settings ──────────────────────────────────────────
ALTER TABLE report_card_tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_tenant_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_card_tenant_settings_tenant_isolation ON report_card_tenant_settings;
CREATE POLICY report_card_tenant_settings_tenant_isolation ON report_card_tenant_settings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Verify that `ReportCard` and `ReportCardTemplate` already have RLS policies (they should — they're existing tables). If they don't, add them in the same file.

### 4.4 Zod schemas in `@school/shared`

Create or update files under `packages/shared/src/report-cards/`:

- `comment-window.schema.ts` — schemas for `ReportCommentWindow` create/update
- `subject-comment.schema.ts` — schemas for subject comment create/update/finalise
- `overall-comment.schema.ts` — schemas for overall comment create/update/finalise
- `teacher-request.schema.ts` — schemas for request submit/review, including the `target_scope_json` shape
- `tenant-settings.schema.ts` — the JSONB payload schema (see design-spec §5.5)
- `content-scope.schema.ts` — the `ReportCardContentScope` enum mirror
- `second-language.schema.ts` — the `preferred_second_language` enum (`'ar'` only for v1, extensible)
- `index.ts` — re-exports

Every JSONB field MUST have a corresponding Zod schema that validates structure. Every `.refine()` rule must have a test.

Examples of `.refine()` rules to enforce:

- `createCommentWindowSchema`: `closes_at > opens_at` (path: `closes_at`)
- `submitTeacherRequestSchema`: if `request_type === 'regenerate_reports'`, then `target_scope_json` is required; if `request_type === 'open_comment_window'`, `target_scope_json` must be null
- `tenantSettingsSchema`: `principal_signature_storage_key` and `principal_name` must be consistent (both null or both set — your call whether to enforce)

### 4.5 Seeds

In `packages/prisma/seed.ts`:

1. On seed, for every tenant that doesn't already have a `report_card_tenant_settings` row, insert a default one with:
   ```json
   {
     "matrix_display_mode": "grade",
     "show_top_rank_badge": false,
     "default_personal_info_fields": [
       "full_name",
       "student_number",
       "date_of_birth",
       "class_name",
       "year_group",
       "homeroom_teacher"
     ],
     "require_finalised_comments": true,
     "allow_admin_force_generate": true,
     "principal_signature_storage_key": null,
     "principal_name": null,
     "grade_threshold_set_id": null,
     "default_template_id": null
   }
   ```
2. For every tenant, ensure a default "Grades Only" `ReportCardTemplate` row exists with `content_scope = 'grades_only'` for both `en` and `ar` locales.
3. After the templates exist, set each tenant's `default_template_id` in settings to point at the English grades-only template.

### 4.6 Permissions registry

Register the three new permissions in the permission seed (verify the exact location — search for an existing permission seed file in `packages/prisma/seed.ts` or `apps/api/src/modules/permissions/`):

- `report_cards.view`
- `report_cards.comment`
- `report_cards.manage`

Map them to the existing role templates (teacher gets `report_cards.comment`; principal/vice-principal gets `report_cards.manage`; front-office admin gets `report_cards.view`). Do not invent new roles — extend the existing role→permission mapping.

---

## 5. Files to create or modify

### Create

- `packages/shared/src/report-cards/comment-window.schema.ts`
- `packages/shared/src/report-cards/subject-comment.schema.ts`
- `packages/shared/src/report-cards/overall-comment.schema.ts`
- `packages/shared/src/report-cards/teacher-request.schema.ts`
- `packages/shared/src/report-cards/tenant-settings.schema.ts`
- `packages/shared/src/report-cards/content-scope.schema.ts`
- `packages/shared/src/report-cards/second-language.schema.ts`
- `packages/shared/src/report-cards/index.ts`
- `packages/shared/src/report-cards/__tests__/*.spec.ts` (one per schema with `.refine()` rules)
- `apps/api/test/report-cards/rls-leakage.e2e-spec.ts` — RLS leakage tests for all five new tables
- A new Prisma migration folder under `packages/prisma/migrations/`

### Modify

- `packages/prisma/schema.prisma` — all additions in §4.1
- `packages/prisma/rls/post_migrate.sql` (or equivalent) — policies in §4.3
- `packages/prisma/seed.ts` — seed data for default settings + default templates + permissions registry
- `packages/shared/src/index.ts` — re-export the new `report-cards` barrel

### Do NOT modify

- Any files under `apps/api/src/modules/` — services/controllers belong to implementations 02–06
- Any files under `apps/web/src/` — frontend belongs to implementations 07–10
- `apps/worker/src/processors/` — processor refactor belongs to implementation 04

---

## 6. Testing requirements

### 6.1 Zod schema tests (unit)

For every schema with `.refine()` rules, add a `.spec.ts` under `packages/shared/src/report-cards/__tests__/`. Test:

- Happy path (valid input parses)
- Every `.refine()` rule rejects its invalid case with the correct `path`
- Every enum rejects unknown values
- Every required field rejects missing

### 6.2 RLS leakage tests (integration)

Create `apps/api/test/report-cards/rls-leakage.e2e-spec.ts`. For each of the five new tenant-scoped tables:

1. Create a row as Tenant A (use the existing test fixture helper — read an existing e2e file in `apps/api/test/` to see the pattern)
2. Switch RLS context to Tenant B
3. Attempt to `findMany` / `findFirst` on the table
4. Assert the result is empty (Tenant A's row must NOT leak)
5. Attempt to update Tenant A's row while in Tenant B's context
6. Assert the update affects zero rows

Do this for all five tables. Without these tests, the implementation is not complete.

### 6.3 Migration smoke test

Run:

```bash
pnpm --filter @school/prisma prisma migrate reset --force
pnpm --filter @school/prisma prisma migrate deploy
pnpm --filter @school/prisma prisma db seed
```

Verify the migration applies cleanly from scratch and the seed runs without errors. Verify the default template rows and settings rows exist.

### 6.4 Full regression

```bash
turbo test
turbo lint
turbo type-check
```

All three must pass before the implementation is considered complete. Log the results in your implementation log entry.

---

## 7. Security / RLS checklist

- [ ] Every new table has `tenant_id UUID NOT NULL` with an FK
- [ ] Every new table has `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
- [ ] Every new table has a policy named `{table_name}_tenant_isolation`
- [ ] Every new table has a USING clause AND a WITH CHECK clause
- [ ] The `report_comment_windows` unique partial index is present
- [ ] The `report_comment_windows` check constraint (`closes_at > opens_at`) is present
- [ ] The `ReportCardTenantSettings` table has a unique constraint on `tenant_id` (one row per tenant)
- [ ] `Student.preferred_second_language` is `VARCHAR(10)` and nullable
- [ ] `ReportCardStatus` enum has the new `superseded` value
- [ ] All new enums are `snake_case` values in PostgreSQL
- [ ] Zod schemas match the Prisma schema exactly (field names, types, optionality)
- [ ] Every JSONB column has a Zod schema that validates it

---

## 8. Acceptance criteria

The implementation is complete when:

1. `pnpm --filter @school/prisma prisma migrate reset --force` succeeds from scratch
2. `pnpm --filter @school/prisma prisma db seed` creates default settings and templates for every tenant
3. `turbo test` passes with all new tests green, including:
   - Zod schema unit tests
   - RLS leakage tests for all five new tables
4. `turbo lint` passes with zero errors
5. `turbo type-check` passes with zero errors
6. Running the DI verification script (from `00-common-knowledge.md` §3.7) still succeeds
7. The default tenant settings row for each tenant matches the schema in §4.5
8. `report_cards.view`, `report_cards.comment`, and `report_cards.manage` are registered in the permissions seed and mapped to the correct existing roles
9. The implementation is committed with a conventional commit message referencing impl 01
10. The `implementation-log.md` entry has been appended with all required fields

---

## 9. Architecture doc update check

After completion, determine whether any of these need updating:

| File                                       | Update condition                                                                                                 | Decision                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `docs/architecture/module-blast-radius.md` | Did you add a cross-module import?                                                                               | NO — this impl only touches schema/shared/prisma |
| `docs/architecture/event-job-catalog.md`   | Did you add a job/cron?                                                                                          | NO                                               |
| `docs/architecture/state-machines.md`      | **YES** — you're adding two new state machines: `CommentWindowStatus` and `TeacherRequestStatus`. Document both. | **REQUIRED**                                     |
| `docs/architecture/danger-zones.md`        | Did you find a hidden coupling?                                                                                  | If yes, add                                      |
| `docs/architecture/feature-map.md`         | Do NOT update unilaterally. Ask user first.                                                                      | N/A here                                         |

**Required update for impl 01:** add both new state machines to `docs/architecture/state-machines.md` with their valid transitions:

- `CommentWindowStatus`: `scheduled → open → closed`; `open → closed`; `closed → open` (reopen is allowed)
- `TeacherRequestStatus`: `pending → approved → completed`; `pending → rejected`; `pending → cancelled`

---

## 10. Completion log stub

Copy this stub into `implementation-log.md` and fill it in when done:

```markdown
### Implementation 01: Database Foundation

- **Completed at:** YYYY-MM-DD HH:MM
- **Completed by:** <agent>
- **Branch / commit:** `<branch>` @ `<sha>`
- **Pull request:** <url or "direct to main">
- **Status:** ✅ complete
- **Summary:** Landed Prisma schema changes for 5 new tables, 1 new student column, ReportCard extensions, RLS policies, Zod schemas, default seeds, and permission registry updates.

**What changed:**

- `packages/prisma/schema.prisma` — added 5 models, 1 column on Student, 5 columns on ReportCard, 1 column on ReportCardTemplate, 7 columns on ReportCardBatchJob, 4 new enums, extended ReportCardStatus
- `packages/prisma/migrations/<timestamp>_add_report_cards_redesign_foundation/migration.sql` — new migration
- `packages/prisma/rls/post_migrate.sql` — RLS policies for 5 new tables
- `packages/prisma/seed.ts` — default tenant settings, default templates, permission registry updates
- `packages/shared/src/report-cards/*.ts` — Zod schemas + types

**Database changes:**

- Migration: `add-report-cards-redesign-foundation`
- New tables: `report_comment_windows`, `report_card_subject_comments`, `report_card_overall_comments`, `report_card_teacher_requests`, `report_card_tenant_settings`
- New columns: `students.preferred_second_language`, `report_cards.*` (5 columns), `report_card_templates.content_scope`, `report_card_batch_jobs.*` (7 columns)

**Test coverage:**

- Unit specs added: N (Zod schemas)
- Integration/E2E specs added: 1 (RLS leakage)
- RLS leakage tests: 5 tables, all passing
- `turbo test`: ✅
- `turbo lint`: ✅
- `turbo type-check`: ✅

**Architecture docs updated:**

- `docs/architecture/state-machines.md` — added CommentWindowStatus and TeacherRequestStatus state machines
- Others: not required

**Regression check:**

- `turbo test`: ✅ all green
- Unrelated failures: none

**Blockers or follow-ups:**

- Implementations 02–06 are now unblocked and can proceed (some in parallel).

**Notes for the next agent:**

- The `ReportCard.template_id` field is now required. All existing rows were backfilled to point at the default "Grades Only" template.
- The default tenant settings JSONB payload structure is defined in `packages/shared/src/report-cards/tenant-settings.schema.ts` — treat that as the source of truth.
```

---

## 11. If you get stuck

- **Migration generation fails:** verify Prisma schema syntax. The `@@unique` with partial index is NOT supported by Prisma natively — you must do the partial index via raw SQL in the migration file.
- **RLS policy SQL fails:** verify the table name matches exactly (snake_case, no typos). Verify the policy name doesn't already exist.
- **Zod schema doesn't compile:** you probably referenced a type before defining it. Order matters.
- **Tests fail because `Tenant` or `User` relations don't exist:** you forgot to add the inverse relation on the parent model. Every new FK requires an inverse.

If truly stuck, document the blocker in the implementation log and hand off.
