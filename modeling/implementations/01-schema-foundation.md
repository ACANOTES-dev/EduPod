# Implementation 01 — Schema Foundation

> **Wave:** 1 (serial, no parallelism — everything depends on this)
> **Depends on:** nothing
> **Deploys:** migration + API + worker + web restart (shared types regenerate)

---

## Goal

Land every DB, Prisma, permission, and seed change the Modeling rebuild needs in a single coordinated migration so Wave 2+ can code against stable types. **Zero business logic** in this phase — just the foundation.

## What to change

### 1. Prisma schema (`packages/prisma/schema.prisma`)

#### 1a. New enums

```prisma
enum FinancialModelStatus {
  draft
  published
  archived
}

enum FinancialModelLineItemSource {
  driver_derived
  custom
  override
}

enum FinancialModelLineItemCategory {
  income
  staff_costs
  operations
  capital
  reserves_and_adjustments
}

enum EventBudgetType {
  trip
  fundraiser
  sports_day
  performance
  capital_purchase
  other
}

enum EventBudgetStatus {
  draft
  confirmed
  fees_generated
  completed
  cancelled
}

enum EventBudgetPaymentPlan {
  one_off
  two_payments
  three_payments
  four_payments
}

enum VarianceCachePeriodType {
  month
  term
  year
}
```

#### 1b. New model: `FinancialModel`

```prisma
model FinancialModel {
  id                    String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id             String                 @db.Uuid
  name                  String                 @db.VarChar(255)
  description           String?                @db.Text
  fiscal_year_start     DateTime               @db.Date
  fiscal_year_end       DateTime               @db.Date
  horizon_years         Int                    @default(1) @db.SmallInt   // 1, 3, or 5
  drivers               Json                   @db.JsonB                  // canonical driver shape; see packages/shared/src/budgeting/drivers.ts
  source_snapshot_json  Json                   @db.JsonB                  // captured students/staff/fees state at creation
  status                FinancialModelStatus   @default(draft)
  current_snapshot_id   String?                @db.Uuid                   // latest published snapshot id (denormalised for read speed)
  created_by            String                 @db.Uuid
  created_at            DateTime               @default(now()) @db.Timestamptz()
  updated_at            DateTime               @default(now()) @updatedAt @db.Timestamptz()
  archived_at           DateTime?              @db.Timestamptz()

  tenant                Tenant                 @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  creator               User                   @relation(fields: [created_by], references: [id])
  scenarios             Scenario[]
  line_items            FinancialModelLineItem[]
  snapshots             FinancialModelSnapshot[]
  variance_cache        VarianceCache[]
  shareable_links       ShareableLink[]

  @@index([tenant_id, fiscal_year_start(sort: Desc)], map: "idx_financial_models_tenant_fy")
  @@index([tenant_id, status], map: "idx_financial_models_tenant_status")
  @@map("financial_models")
}
```

#### 1c. New model: `Scenario`

```prisma
model Scenario {
  id                  String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String          @db.Uuid
  parent_model_id     String          @db.Uuid
  name                String          @db.VarChar(64)
  position            Int             @default(0) @db.SmallInt           // 0..2 — display order; max 3 alternatives
  driver_overrides    Json            @db.JsonB                          // partial driver shape; only the deltas vs base
  notes               String?         @db.Text
  created_at          DateTime        @default(now()) @db.Timestamptz()
  updated_at          DateTime        @default(now()) @updatedAt @db.Timestamptz()

  tenant              Tenant          @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  parent_model        FinancialModel  @relation(fields: [parent_model_id], references: [id], onDelete: Cascade)
  line_items          FinancialModelLineItem[]

  @@unique([parent_model_id, position], map: "uq_scenarios_parent_position")
  @@index([tenant_id, parent_model_id], map: "idx_scenarios_tenant_parent")
  @@map("scenarios")
}
```

#### 1d. New model: `FinancialModelLineItem`

```prisma
model FinancialModelLineItem {
  id                          String                          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                   String                          @db.Uuid
  parent_model_id             String                          @db.Uuid
  scenario_id                 String?                         @db.Uuid                                       // NULL = base case
  category                    FinancialModelLineItemCategory
  subcategory                 String                          @db.VarChar(128)                               // e.g. "Tuition (gross)"
  name                        String                          @db.VarChar(255)
  fiscal_year                 Int                             @db.SmallInt                                   // 1..5
  source                      FinancialModelLineItemSource
  amount                      Decimal                         @db.Decimal(12, 2)
  is_locked                   Boolean                         @default(false)
  notes                       String?                         @db.Text
  references_event_budget_id  String?                         @db.Uuid                                       // optional FK to event_budgets
  created_at                  DateTime                        @default(now()) @db.Timestamptz()
  updated_at                  DateTime                        @default(now()) @updatedAt @db.Timestamptz()

  tenant                      Tenant                          @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  parent_model                FinancialModel                  @relation(fields: [parent_model_id], references: [id], onDelete: Cascade)
  scenario                    Scenario?                       @relation(fields: [scenario_id], references: [id], onDelete: Cascade)
  referenced_event_budget     EventBudget?                    @relation(fields: [references_event_budget_id], references: [id], onDelete: SetNull)

  @@index([tenant_id, parent_model_id, scenario_id, fiscal_year], map: "idx_fmli_tenant_parent_scenario_year")
  @@index([tenant_id, parent_model_id, category, subcategory], map: "idx_fmli_category")
  @@map("financial_model_line_items")
}
```

#### 1e. New model: `FinancialModelSnapshot`

```prisma
model FinancialModelSnapshot {
  id                String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id         String          @db.Uuid
  parent_model_id   String          @db.Uuid
  version_number    Int             @db.SmallInt
  payload           Json            @db.JsonB                       // full state — drivers, scenarios, line items, totals, source
  executive_summary String?         @db.Text                        // user-written summary at publish time
  published_at      DateTime        @default(now()) @db.Timestamptz()
  published_by      String          @db.Uuid
  pdf_object_key    String?         @db.VarChar(512)
  excel_object_key  String?         @db.VarChar(512)
  rendered_at       DateTime?       @db.Timestamptz()

  tenant            Tenant          @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  parent_model      FinancialModel  @relation(fields: [parent_model_id], references: [id], onDelete: Cascade)
  publisher         User            @relation(fields: [published_by], references: [id])
  shareable_links   ShareableLink[]

  @@unique([parent_model_id, version_number], map: "uq_snapshot_parent_version")
  @@index([tenant_id, published_at(sort: Desc)], map: "idx_snapshots_tenant_recent")
  @@map("financial_model_snapshots")
}
```

#### 1f. New model: `EventBudget`

```prisma
model EventBudget {
  id                       String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                String                   @db.Uuid
  name                     String                   @db.VarChar(255)
  event_type               EventBudgetType
  event_date               DateTime?                @db.Date
  event_end_date           DateTime?                @db.Date
  class_id                 String?                  @db.Uuid
  year_group_id            String?                  @db.Uuid
  participant_count        Int                      @db.Integer
  drivers                  Json                     @db.JsonB
  status                   EventBudgetStatus        @default(draft)
  household_share_pct      Decimal                  @default(100) @db.Decimal(5, 2)   // 0..100
  payment_plan             EventBudgetPaymentPlan   @default(one_off)
  fee_generation_run_id    String?                  @db.Uuid
  fee_structure_id         String?                  @db.Uuid                          // FK to existing fee_structures created during fee generation
  notes                    String?                  @db.Text
  created_by               String                   @db.Uuid
  created_at               DateTime                 @default(now()) @db.Timestamptz()
  updated_at               DateTime                 @default(now()) @updatedAt @db.Timestamptz()

  tenant                   Tenant                   @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  creator                  User                     @relation(fields: [created_by], references: [id])
  class                    Class?                   @relation(fields: [class_id], references: [id], onDelete: SetNull)
  year_group               YearGroup?               @relation(fields: [year_group_id], references: [id], onDelete: SetNull)
  scenarios                EventBudgetScenario[]
  line_item_references     FinancialModelLineItem[]

  @@index([tenant_id, event_date(sort: Desc)], map: "idx_event_budgets_tenant_date")
  @@index([tenant_id, status], map: "idx_event_budgets_tenant_status")
  @@map("event_budgets")
}
```

#### 1g. New model: `EventBudgetScenario`

```prisma
model EventBudgetScenario {
  id                       String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                String        @db.Uuid
  parent_event_budget_id   String        @db.Uuid
  name                     String        @db.VarChar(64)
  position                 Int           @default(0) @db.SmallInt
  driver_overrides         Json          @db.JsonB
  notes                    String?       @db.Text
  created_at               DateTime      @default(now()) @db.Timestamptz()
  updated_at               DateTime      @default(now()) @updatedAt @db.Timestamptz()

  tenant                   Tenant        @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  parent_event_budget      EventBudget   @relation(fields: [parent_event_budget_id], references: [id], onDelete: Cascade)

  @@unique([parent_event_budget_id, position], map: "uq_event_budget_scenarios_parent_position")
  @@index([tenant_id, parent_event_budget_id], map: "idx_event_budget_scenarios_tenant_parent")
  @@map("event_budget_scenarios")
}
```

#### 1h. New model: `VarianceCache`

```prisma
model VarianceCache {
  id              String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id       String                   @db.Uuid
  parent_model_id String                   @db.Uuid
  snapshot_id     String?                  @db.Uuid                                      // null until model is first published
  period_type     VarianceCachePeriodType
  period_label    String                   @db.VarChar(32)                               // 'Sep 2026', 'Term 1 2026/27', '2026/27'
  line_item_key   String                   @db.VarChar(128)                              // composite: 'income.tuition_gross'
  planned         Decimal                  @db.Decimal(12, 2)
  actual          Decimal                  @db.Decimal(12, 2)
  variance        Decimal                  @db.Decimal(12, 2)
  variance_pct    Decimal                  @db.Decimal(7, 2)
  drivers_json    Json?                    @db.JsonB
  refreshed_at    DateTime                 @default(now()) @db.Timestamptz()

  tenant          Tenant                   @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  parent_model    FinancialModel           @relation(fields: [parent_model_id], references: [id], onDelete: Cascade)

  @@unique([parent_model_id, period_type, period_label, line_item_key], map: "uq_variance_cache_unique_row")
  @@index([tenant_id, parent_model_id, period_type, period_label], map: "idx_variance_cache_lookup")
  @@map("variance_cache")
}
```

#### 1i. New model: `ShareableLink`

```prisma
model ShareableLink {
  id                  String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String                 @db.Uuid
  token               String                 @unique @db.Uuid
  parent_model_id     String                 @db.Uuid
  parent_snapshot_id  String                 @db.Uuid
  expires_at          DateTime               @db.Timestamptz()
  password_hash       String?                @db.VarChar(255)
  scenarios_visible   Json                   @db.JsonB                          // ['base', 'cautious', 'growth']
  view_count          Int                    @default(0)
  last_viewed_at      DateTime?              @db.Timestamptz()
  revoked_at          DateTime?              @db.Timestamptz()
  created_by          String                 @db.Uuid
  created_at          DateTime               @default(now()) @db.Timestamptz()
  updated_at          DateTime               @default(now()) @updatedAt @db.Timestamptz()

  tenant              Tenant                 @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  parent_model        FinancialModel         @relation(fields: [parent_model_id], references: [id], onDelete: Cascade)
  parent_snapshot     FinancialModelSnapshot @relation(fields: [parent_snapshot_id], references: [id], onDelete: Cascade)
  creator             User                   @relation(fields: [created_by], references: [id])

  @@index([tenant_id, expires_at], map: "idx_shareable_links_tenant_expiry")
  @@map("shareable_links")
}
```

#### 1j. New model: `BudgetingTenantPreferences`

```prisma
model BudgetingTenantPreferences {
  id                            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                     String   @unique @db.Uuid
  default_horizon_years         Int      @default(1) @db.SmallInt
  default_household_share_pct   Decimal  @default(100) @db.Decimal(5, 2)
  default_contingency_pct       Decimal  @default(5) @db.Decimal(5, 2)
  hidden_kpi_keys               String[] @default([])
  default_export_format         String   @default("pdf") @db.VarChar(16)
  shareable_link_max_days       Int      @default(30) @db.SmallInt
  updated_at                    DateTime @default(now()) @updatedAt @db.Timestamptz()
  updated_by                    String?  @db.Uuid

  tenant                        Tenant   @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@map("budgeting_tenant_preferences")
}
```

#### 1k. Back-relations on existing models

Wire reverse fields on `Tenant`, `User`, `Class`, `YearGroup` for the new models above.

### 2. Migration SQL (`packages/prisma/migrations/YYYYMMDDHHMMSS_budgeting_modeling_foundation/`)

Single migration directory. Files:

- `migration.sql` — generated Prisma migration SQL.
- `post_migrate.sql` — RLS policies + idempotent seed actions.

**RLS policies** (every new tenant-scoped table):

```sql
ALTER TABLE financial_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_models FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_models_tenant_isolation ON financial_models;
CREATE POLICY financial_models_tenant_isolation ON financial_models
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Repeat for: scenarios, financial_model_line_items, financial_model_snapshots,
-- event_budgets, event_budget_scenarios, variance_cache, shareable_links,
-- budgeting_tenant_preferences
```

Mirror these into `packages/prisma/rls/policies.sql` (the canonical catalogue).

### 3. Shared types (`packages/shared/src/budgeting/`)

Create the budgeting namespace with these files (Phase 02 will fill them out; Phase 01 just creates the scaffolding so other phases can import):

- `index.ts` — barrel export.
- `drivers.ts` — empty stub with a comment pointing to Phase 02.
- `scenarios.ts` — empty stub.
- `line-items.ts` — `FinancialModelLineItemCategory` + `FinancialModelLineItemSource` enum exports + Zod schemas matching the Prisma enums.
- `snapshots.ts` — `FinancialModelStatus` enum + Zod schema.
- `event-budgets.ts` — `EventBudgetType` + `EventBudgetStatus` + `EventBudgetPaymentPlan` enum exports + Zod schemas.
- `variance.ts` — `VarianceCachePeriodType` enum + Zod.
- `shareable-links.ts` — Zod schemas for the link create/list/revoke DTOs.

Export the budgeting namespace from `@school/shared` via the existing subpath export system (`@school/shared/budgeting`).

### 4. Permission seeding

Update `packages/prisma/src/seed/permissions.ts` (or equivalent) with new permission keys:

- `budgeting.view`
- `budgeting.manage`
- `budgeting.publish`
- `budgeting.share`
- `budgeting.generate_fees`
- `budgeting.archive`

Extend the role defaults:

- Owner, Principal, Vice Principal → all 6 permissions.
- Accounting → `budgeting.view`, `budgeting.manage`, `budgeting.generate_fees` (paired with their existing `finance.manage`).
- Front Office → `budgeting.view` only (read access for the trip calculator).
- Teacher → no new permissions (they may have access to event budgets via a future scoped permission; v1 keeps teachers out of budgeting).

Idempotent upsert pattern — same code must be safe to run repeatedly. Backfill onto every existing tenant's system roles.

### 5. Module key registration

The budgeting module gets registered in the module registry (wherever `module_keys` are tracked for the tenant module-enabled gate). Module key: `budgeting`. Default: enabled.

### 6. Feature map — no update this phase

Do NOT update `docs/architecture/feature-map.md`. Phase 21 (polish) owns the single coherent update at the end.

## Testing requirements

- **Prisma schema compiles** — `pnpm --filter @school/prisma prisma format && pnpm --filter @school/prisma prisma validate`.
- **Migration generates cleanly** — `pnpm --filter @school/prisma migrate dev --name budgeting_modeling_foundation` on a scratch DB.
- **RLS leakage test** — one spec covering all 9 new tenant-scoped tables. Create data as Tenant A, authenticate as Tenant B, assert empty result. Co-located: `apps/api/test/budgeting-foundation.rls.spec.ts`.
- **Seed idempotency** — run the permission seed twice; second run produces no new rows, no errors.
- **Full API module DI check** — the verification command from `CLAUDE.md` (the ts-node `Test.createTestingModule({ imports: [AppModule] })` invocation) must pass. Nothing should be broken by the new relations.

## Post-deploy verification

1. SSH into production and run `pnpm --filter @school/prisma migrate:deploy`. Confirm all 9 new tables exist (`\dt financial_models scenarios financial_model_line_items financial_model_snapshots event_budgets event_budget_scenarios variance_cache shareable_links budgeting_tenant_preferences` in `psql`).
2. Confirm RLS is on:
   ```sql
   SELECT relname, relrowsecurity, relforcerowsecurity
   FROM pg_class
   WHERE relname IN ('financial_models', 'scenarios', 'financial_model_line_items',
                     'financial_model_snapshots', 'event_budgets', 'event_budget_scenarios',
                     'variance_cache', 'shareable_links', 'budgeting_tenant_preferences');
   ```
   Every row must show both booleans `t`.
3. Confirm permission backfill: for each tenant, `SELECT permission_key FROM role_permissions WHERE permission_key LIKE 'budgeting.%';` — at least 6 keys present.
4. Restart api/worker/web (shared types regenerate).
5. Health check endpoint returns 200.
6. Login to NHQS as owner, navigate to `/finance/budgeting` — should load existing placeholder UI unchanged. No new UI from this phase.

## Follow-ups for subsequent waves

- Wave 2 impl 02 fills in `@school/shared/budgeting/drivers.ts`, `engine.ts`, `scenario-merge.ts`, and `source-data.ts` with the actual driver schemas and calculation engine.
- Wave 2 impls 03–07 build the services on top of these tables.
- Wave 3 impls 08, 11 add the BullMQ queues.
- Wave 4 impls 12, 17, 20 read `BudgetingTenantPreferences` for default values.
- Phase 11 (Shareable Links) consumes `shareable_links.password_hash`; the link CREATE flow hashes via bcrypt — this column accepts that.

## Rollback

`git revert <commit-sha>` then on the server run a down-migration:

```sql
DROP TABLE budgeting_tenant_preferences, shareable_links, variance_cache,
  event_budget_scenarios, event_budgets, financial_model_snapshots,
  financial_model_line_items, scenarios, financial_models CASCADE;

DROP TYPE "VarianceCachePeriodType", "EventBudgetPaymentPlan",
  "EventBudgetStatus", "EventBudgetType", "FinancialModelLineItemCategory",
  "FinancialModelLineItemSource", "FinancialModelStatus";
```

The permission inserts can stay; they're idempotent and orthogonal to the schema.
