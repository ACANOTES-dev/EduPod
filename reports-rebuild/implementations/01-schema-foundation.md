# Implementation 01 — Schema Foundation

> **Wave:** 1 (serial, no parallelism — everything depends on this)
> **Depends on:** nothing
> **Deploys:** migration + API + worker + web restart (shared types regenerate)

---

## Goal

Land every DB, Prisma, permission, and seed change the Reports rebuild needs in a single coordinated migration so Wave 2+ can code against stable types. **Zero business logic** in this implementation — just the foundation.

## What to change

### 1. Prisma schema (`packages/prisma/schema.prisma`)

#### 1a. New enums

```prisma
enum SavedReportVisibility {
  private
  shared
}

enum ScheduledReportRunStatus {
  pending
  running
  succeeded
  failed
}

enum ReportAlertRunOutcome {
  ok
  threshold_crossed
  error
}

enum ReportShareFormat {
  pdf
  excel
  word
  all
}
```

#### 1b. Extend `SavedReport`

Add columns:

```prisma
description       String?                  @db.Text
visibility        SavedReportVisibility    @default(private)
is_favorite       Boolean                  @default(false)
last_executed_at  DateTime?                @db.Timestamptz()
last_executed_by  String?                  @db.Uuid
```

Plus index: `@@index([tenant_id, visibility], map: "idx_saved_reports_tenant_visibility")`.

#### 1c. New model: `SavedReportDraft`

Holds the in-progress builder state per (tenant, user). Uniqueness on `(tenant_id, user_id)` — one draft per user at a time.

```prisma
model SavedReportDraft {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id          String   @db.Uuid
  user_id            String   @db.Uuid
  subject_key        String   @db.VarChar(64)           // e.g. "student", "invoice"
  columns_json       Json     @db.JsonB                 // selected field ids + order
  filters_json       Json     @default("{}") @db.JsonB
  group_by_json      Json?    @db.JsonB
  chart_type         String?  @db.VarChar(32)
  chart_config_json  Json?    @db.JsonB
  updated_at         DateTime @default(now()) @updatedAt @db.Timestamptz()

  tenant             Tenant   @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  user               User     @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, user_id], map: "uq_saved_report_drafts_tenant_user")
  @@map("saved_report_drafts")
}
```

#### 1d. New model: `ScheduledReportRun`

Log of each scheduled-report execution — feeds the UI's "last N runs" view.

```prisma
model ScheduledReportRun {
  id                    String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id             String                   @db.Uuid
  scheduled_report_id   String                   @db.Uuid
  started_at            DateTime                 @default(now()) @db.Timestamptz()
  finished_at           DateTime?                @db.Timestamptz()
  status                ScheduledReportRunStatus
  row_count             Int?
  error_message         String?                  @db.Text
  artifact_object_key   String?                  @db.VarChar(512)  // S3 key
  delivered_via         String[]                 @default([])      // ['email', 'inbox']

  scheduled_report      ScheduledReport          @relation(fields: [scheduled_report_id], references: [id], onDelete: Cascade)

  @@index([tenant_id, scheduled_report_id, started_at(sort: Desc)], map: "idx_scheduled_report_runs_recent")
  @@index([tenant_id, status], map: "idx_scheduled_report_runs_status")
  @@map("scheduled_report_runs")
}
```

#### 1e. New model: `ReportAlertRun`

Log of each alert evaluation.

```prisma
model ReportAlertRun {
  id                String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id         String                 @db.Uuid
  report_alert_id   String                 @db.Uuid
  evaluated_at      DateTime               @default(now()) @db.Timestamptz()
  outcome           ReportAlertRunOutcome
  measured_value    Decimal?               @db.Decimal(12, 2)
  threshold_value   Decimal?               @db.Decimal(12, 2)
  notified_user_ids String[]               @default([])
  error_message     String?                @db.Text

  report_alert      ReportAlert            @relation(fields: [report_alert_id], references: [id], onDelete: Cascade)

  @@index([tenant_id, report_alert_id, evaluated_at(sort: Desc)], map: "idx_report_alert_runs_recent")
  @@map("report_alert_runs")
}
```

#### 1f. New model: `ReportShareLog`

Audit of every share action. Captures who shared what to whom in which format, and the inbox conversation it produced.

```prisma
model ReportShareLog {
  id              String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id       String             @db.Uuid
  saved_report_id String             @db.Uuid
  shared_by       String             @db.Uuid
  shared_at       DateTime           @default(now()) @db.Timestamptz()
  format          ReportShareFormat
  conversation_id String?            @db.Uuid             // null if inbox share failed
  recipients_json Json               @db.JsonB            // audience snapshot at share time
  message_body    String?            @db.Text

  saved_report    SavedReport        @relation(fields: [saved_report_id], references: [id], onDelete: Cascade)
  sharer          User               @relation(fields: [shared_by], references: [id])

  @@index([tenant_id, shared_at(sort: Desc)], map: "idx_report_share_log_tenant_recent")
  @@index([tenant_id, saved_report_id, shared_at(sort: Desc)], map: "idx_report_share_log_report")
  @@map("report_share_log")
}
```

#### 1g. New model: `ReportsKpiTenantPreferences`

Tenant visibility toggles for each of the 10 KPI cards. Per-tenant, not per-user. One row per tenant.

```prisma
model ReportsKpiTenantPreferences {
  id                          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                   String   @unique @db.Uuid
  hidden_kpi_keys             String[] @default([])
  updated_at                  DateTime @default(now()) @updatedAt @db.Timestamptz()
  updated_by                  String?  @db.Uuid

  tenant                      Tenant   @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@map("reports_kpi_tenant_preferences")
}
```

#### 1h. Back-relations on existing models

Wire up relations for `User`, `Tenant`, `SavedReport`, `ScheduledReport`, `ReportAlert` — add the reverse fields for the new models above.

### 2. Migration SQL (`packages/prisma/migrations/YYYYMMDDHHMMSS_reports_rebuild_foundation/`)

Single migration directory. Files:

- `migration.sql` — the generated Prisma migration SQL.
- `post_migrate.sql` — RLS policies (required by `.claude/rules/prisma.md`).

**RLS policies** (every new tenant-scoped table):

```sql
ALTER TABLE saved_report_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_report_drafts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saved_report_drafts_tenant_isolation ON saved_report_drafts;
CREATE POLICY saved_report_drafts_tenant_isolation ON saved_report_drafts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Repeat for: scheduled_report_runs, report_alert_runs, report_share_log, reports_kpi_tenant_preferences
```

Mirror these into `packages/prisma/rls/policies.sql` (the canonical catalogue).

### 3. Shared types (`packages/shared/src/reports/`)

Create or extend the shared reports namespace:

- `packages/shared/src/reports/index.ts` — barrel export.
- `packages/shared/src/reports/subjects.ts` — `ReportSubjectKey` union (`'student' | 'staff' | 'household' | 'class' | 'invoice' | 'application' | 'behaviour_incident' | 'safeguarding_concern' | 'attendance_record' | 'grade' | 'payroll_entry'`).
- `packages/shared/src/reports/ai-flags.ts` — `reportsAiModuleKeySchema` Zod enum (`'reports_narration' | 'reports_ask_ai' | 'reports_predictions'`) and `ReportsAiModuleKey` type. Mirror the shape of `wellbeingAiModuleKeySchema` in `@school/shared/wellbeing`.
- `packages/shared/src/reports/kpi.ts` — `ReportKpiKey` union of the 10 KPI keys, `reportKpiTooltipSchema`, and tenant-preferences DTOs.
- `packages/shared/src/reports/saved-report-draft.ts` — Zod schemas and DTOs for the draft CRUD.
- `packages/shared/src/reports/share.ts` — share-request Zod schema + DTO.

All new keys exported from the root `@school/shared` index via the existing subpath export system.

### 4. Permission seeding

Update `packages/prisma/src/seed/permissions.ts` (or equivalent) with new permission keys:

- `reports.builder`
- `reports.share`
- `reports.settings`
- `reports.ai.narration`
- `reports.ai.ask_ai`
- `reports.ai.predictions`

And extend the role defaults:

- Owner, Principal, Vice Principal → all new permissions.
- Accounting → `reports.builder`, `reports.share`.
- Teacher → no new permissions (they already have `reports.view` which stays unchanged).
- Front Office → `reports.builder` (read/build reports about students and applications; existing finance gate still applies to finance fields inside the tree).

Write an idempotent upsert pattern — the same code must be safe to run repeatedly.

### 5. AI flag module-key seeding

In `packages/prisma/src/seed/tenant-ai-flags.ts` (or equivalent used by the wellbeing seeding), extend the list of module keys the tenant-creation flow seeds to `false`:

- `reports_narration`
- `reports_ask_ai`
- `reports_predictions`

When a new tenant is created, `tenant_ai_flags` gets three new rows per tenant, all `enabled: false`.

Also: a one-off backfill migration (inline SQL in `post_migrate.sql`) that inserts these three rows for **every existing tenant** if they don't already exist. `INSERT ... ON CONFLICT DO NOTHING`.

### 6. Feature map — no update this phase

Do NOT update `docs/architecture/feature-map.md`. Phase 22 owns the single coherent update at the end.

## Testing requirements

- **Prisma schema compiles** — `pnpm --filter @school/prisma prisma format && pnpm --filter @school/prisma prisma validate`.
- **Migration generates cleanly** — `pnpm --filter @school/prisma migrate dev --name reports_rebuild_foundation` on a scratch DB.
- **RLS leakage test** — one spec per new tenant-scoped table. Create data as Tenant A, authenticate as Tenant B, assert empty result. Co-located under `apps/api/src/modules/reports/rls/*.spec.ts` (or wherever existing RLS specs live).
- **Seed idempotency** — run the permission + AI flag seeds twice; second run produces no new rows, no errors.
- **Full API module DI check** — the verification command from `CLAUDE.md` (the ts-node `Test.createTestingModule({ imports: [AppModule] })` invocation) must pass. Nothing should be broken by the new relations.

## Post-deploy verification

1. SSH into production and run `pnpm --filter @school/prisma migrate:deploy`. Confirm all 5 new tables exist (`\dt saved_report_drafts scheduled_report_runs report_alert_runs report_share_log reports_kpi_tenant_preferences` in `psql`).
2. Confirm RLS is on: `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('saved_report_drafts', ...);` — every row must show both booleans `t`.
3. Confirm tenant*ai_flags backfill: for each tenant, `SELECT module_key, enabled FROM tenant_ai_flags WHERE tenant_id = '<tenant>' AND module_key LIKE 'reports*%';`— 3 rows, all`enabled=false`.
4. Restart api/worker/web (shared types regenerate).
5. Health check endpoint returns 200.
6. Login to NHQS as owner, navigate to `/reports` — should load existing mock dashboard unchanged. No new UI from this phase.

## Follow-ups for subsequent waves

- Wave 2 consumes `saved_report_drafts` (impl 16 UI), `SavedReport` extensions (impls 02 + 16), and the new AI module keys (impls 10, 11, 12, 21).
- Wave 3 consumes `scheduled_report_runs` (impl 08), `report_alert_runs` (impl 09), `report_share_log` (impl 13).
- Wave 4 consumes `reports_kpi_tenant_preferences` (impls 14, 21).

## Rollback

If this phase needs reversal: `git revert <commit-sha>` then on the server run a down-migration that drops the 5 new tables and the new columns on `saved_reports`. The AI flag backfill rows can stay; they're harmless with no code reading them. Do NOT revert the permission inserts — they're idempotent and orthogonal to the schema.
