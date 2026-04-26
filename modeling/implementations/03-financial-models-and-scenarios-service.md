# Implementation 03 — Financial Models + Scenarios services

> **Wave:** 2
> **Depends on:** 01, 02
> **Deploys:** API restart only

---

## Goal

Build the NestJS controllers + services for `FinancialModel` and `Scenario`. They live in the same implementation because scenarios are children of models and the workflows are tightly coupled — creating a model captures a source snapshot and runs the engine for the base case, while creating an alternative scenario merges driver overrides on top of that base and re-runs the engine on demand.

This phase also lands the `BudgetingModule` shell — the registration point that subsequent Wave 2 / Wave 3 sub-services (line items, snapshots, variance, event budgets, exports, shareable links) plug into. Phase 03 owns that shell, registers it in `apps/api/src/app.module.ts`, and pulls the read facades + sibling services it needs (`FinanceReadFacade`, `PayrollReadFacade`, `StudentsService`, `StaffProfilesService`, `ClassesService`, `HouseholdsService`, `YearGroupsService`).

## What to change

### 1. New module shell — `apps/api/src/modules/budgeting/budgeting.module.ts`

This file is the central registration point for every budgeting sub-service. Phase 03 owns initial creation under Rule 17 — subsequent Wave 2 phases append providers/controllers via fix-forward edits, never via parallel writes.

```typescript
import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { ClassesModule } from '../classes/classes.module';
import { FinanceModule } from '../finance/finance.module';
import { HouseholdsModule } from '../households/households.module';
import { PayrollModule } from '../payroll/payroll.module';
import { RbacModule } from '../rbac/rbac.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';
import { StudentsModule } from '../students/students.module';
import { TenantsModule } from '../tenants/tenants.module';

import { FinancialModelsController } from './financial-models/financial-models.controller';
import { FinancialModelsService } from './financial-models/financial-models.service';
import { ScenariosController } from './scenarios/scenarios.controller';
import { ScenariosService } from './scenarios/scenarios.service';

@Module({
  imports: [
    AcademicsModule, // YearGroupsService for source snapshot
    ClassesModule, // ClassesService (needed by Phase 07; pre-registered to keep deploys mechanical)
    FinanceModule, // FinanceReadFacade for prior-year revenue / discount / donation actuals
    HouseholdsModule, // HouseholdsService (needed by Phase 07; pre-registered)
    PayrollModule, // PayrollReadFacade for prior-year staff cost actuals
    RbacModule, // PermissionGuard dependency
    StaffProfilesModule, // StaffProfileReadFacade for staff_by_department snapshot
    StudentsModule, // StudentReadFacade for active student counts by year group
    TenantsModule, // TenantReadFacade for currency_code, fiscal year metadata
  ],
  controllers: [FinancialModelsController, ScenariosController],
  providers: [FinancialModelsService, ScenariosService],
  exports: [FinancialModelsService, ScenariosService],
})
export class BudgetingModule {}
```

Register in `apps/api/src/app.module.ts` by adding `BudgetingModule` to the `imports` array near the existing finance/payroll registrations (alphabetical position: between `BehaviourModule` and `ChildProtectionModule`). One-line import added at the top of the file:

```typescript
import { BudgetingModule } from './modules/budgeting/budgeting.module';
```

### 2. DTO re-exports — `apps/api/src/modules/budgeting/financial-models/dto/`

Following the project's thin-re-export convention. Each DTO file imports from `@school/shared/budgeting` and re-exports the schema + inferred type:

```typescript
// dto/create-financial-model.dto.ts
import { createFinancialModelSchema } from '@school/shared/budgeting';
import type { CreateFinancialModelDto } from '@school/shared/budgeting';
export { createFinancialModelSchema };
export type { CreateFinancialModelDto };
```

Schemas needed (Phase 02 has already declared the engine-side primitives; this phase adds the API-shaped DTOs to `packages/shared/src/budgeting/financial-models.ts` and exports them through the existing `@school/shared/budgeting` barrel):

- `createFinancialModelSchema` — `{ name, description?, fiscal_year_start, horizon_years, drivers? }` — `drivers` optional; when omitted the service builds defaults via `buildDefaultDrivers`.
- `updateFinancialModelSchema` — all top-level fields optional; supports clearable `description` (`.nullable().optional()`); when `drivers` is supplied the service re-runs the engine.
- `listFinancialModelsQuerySchema` — `{ page, pageSize, status?, search? }` extending the shared `paginationQuerySchema`.
- `createScenarioSchema` — `{ name, position?, driver_overrides, notes? }`.
- `updateScenarioSchema` — partial of the above.

### 3. `FinancialModelsService` — `apps/api/src/modules/budgeting/financial-models/financial-models.service.ts`

```typescript
@Injectable()
export class FinancialModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly yearGroupsService: YearGroupsService,
    private readonly financeReadFacade: FinanceReadFacade,
    private readonly payrollReadFacade: PayrollReadFacade,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  async findAll(tenantId: string, filters: ListFinancialModelsFilters): Promise<PaginatedResult>;
  async findOne(tenantId: string, id: string): Promise<FinancialModelWithChildren>;
  async create(
    tenantId: string,
    userId: string,
    dto: CreateFinancialModelDto,
  ): Promise<FinancialModelWithChildren>;
  async update(
    tenantId: string,
    id: string,
    dto: UpdateFinancialModelDto,
  ): Promise<FinancialModelWithChildren>;
  async archive(tenantId: string, id: string): Promise<{ id: string; status: 'archived' }>;
  async restore(
    tenantId: string,
    id: string,
  ): Promise<{ id: string; status: 'draft' | 'published' }>;
}
```

Key methods:

**`findAll`** — paginated read; no RLS transaction (every read includes `tenant_id` in `where`). Filters: `status` (`draft|published|archived`), `search` on `name`. Default order: `created_at DESC`. Returns `{ data, meta: { page, pageSize, total } }`. `archived_at IS NOT NULL` rows are excluded unless `status = 'archived'` is explicitly requested.

**`findOne`** — reads model + scenarios + base-case line items (`scenario_id IS NULL`) + the latest published snapshot pointer. Throws `NotFoundException({ code: 'FINANCIAL_MODEL_NOT_FOUND', message: ... })` when missing.

**`create`** — the heaviest method:

1. Resolve tenant currency + active academic year metadata via `TenantReadFacade`.
2. Capture the **source snapshot** by composing reads:
   - `studentReadFacade.countActiveByYearGroup(tenantId)` → populates `students_by_year_group` (matches Phase 02's `sourceStudentByYearGroupSchema`).
   - `studentReadFacade.totalActiveCount(tenantId)` + `householdsService.countActive(tenantId)` → `total_active_students` / `total_active_households`.
   - `yearGroupsService.findAllForTenant(tenantId)` → year-group ids/names + drives default drivers.
   - `feeStructuresService.findAllForBudgeting(tenantId)` (or fall back to `prisma.feeStructure.findMany` filtered to active rows when no facade method exists yet) → `fees_by_year_group`.
   - `staffProfileReadFacade.summariseByDepartment(tenantId)` → `staff_by_department` (`headcount`, `total_annual_payroll`).
   - `financeReadFacade.priorYearActualsSummary(tenantId, fiscal_year_start)` → tuition revenue + discounts + donations + grants (returns `null` when no prior data; service surfaces a `NO_PRIOR_ACTUALS` warning).
   - `payrollReadFacade.priorYearStaffCosts(tenantId, fiscal_year_start)` → `staff_costs` total. Utilities/materials default to 0 (the engine emits `NO_PRIOR_ACTUALS` when missing).
3. Build defaults via `buildDefaultDrivers({ year_group_ids, department_ids, prior_year_donations_actual, prior_year_grants_actual, prior_year_discount_capture_pct, prior_year_scholarship_capture_pct })` from `@school/shared/budgeting`. If `dto.drivers` is provided, validate via `driversSchema.parse` and use it; otherwise use the defaults.
4. Run the engine: `runEngine({ drivers, source, horizon_years })`.
5. Persist the model + base-case line items inside one RLS transaction:

```typescript
const result = await createRlsClient(this.prisma, {
  tenant_id: tenantId,
  user_id: userId,
}).$transaction(async (tx) => {
  const txdb = tx as unknown as PrismaService;
  const model = await txdb.financialModel.create({
    data: {
      tenant_id: tenantId,
      name: dto.name,
      description: dto.description ?? null,
      fiscal_year_start: new Date(dto.fiscal_year_start),
      fiscal_year_end: addYears(new Date(dto.fiscal_year_start), dto.horizon_years ?? 1),
      horizon_years: dto.horizon_years ?? 1,
      drivers,
      source_snapshot_json: source,
      status: 'draft',
      created_by: userId,
    },
  });
  if (engineOutputs.line_items.length > 0) {
    await txdb.financialModelLineItem.createMany({
      data: engineOutputs.line_items.map((li) => ({
        tenant_id: tenantId,
        parent_model_id: model.id,
        scenario_id: null,
        category: li.category,
        subcategory: li.subcategory,
        name: li.name,
        fiscal_year: li.fiscal_year,
        source: 'driver_derived',
        amount: li.amount,
        is_locked: false,
      })),
    });
  }
  return model;
});
```

Engine warnings are returned in the response body (alongside `model`, `line_items`, `totals_by_year`, `per_pupil_unit_economics`) so the UI can surface "no fee structure for Year 7" up front.

**`update`** — accepts `name`, `description`, `horizon_years`, and `drivers`. When `drivers` changes (or `horizon_years` changes), re-run the engine and **replace only the rows where `source = 'driver_derived' AND is_locked = false AND scenario_id IS NULL`**. Locked overrides + custom lines survive untouched. This contract is the canonical hand-off between phase 03 and phase 04 (line-items service): phase 04's `is_locked` flag and `source = 'override' | 'custom'` rows are honoured here.

If the model is `published`, an update creates a new draft state — but since the lifecycle keeps a single `financial_models` row and only `financial_model_snapshots` are versioned, "creating a new draft" means flipping `status` back to `draft` while retaining `current_snapshot_id` (so the published version remains discoverable via the snapshots service).

```typescript
await createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId }).$transaction(
  async (tx) => {
    const txdb = tx as unknown as PrismaService;
    await txdb.financialModelLineItem.deleteMany({
      where: {
        tenant_id: tenantId,
        parent_model_id: id,
        scenario_id: null,
        source: 'driver_derived',
        is_locked: false,
      },
    });
    await txdb.financialModelLineItem.createMany({
      data: engineOutputs.line_items.map((li) => ({
        /* … */
      })),
    });
    await txdb.financialModel.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.horizon_years !== undefined && { horizon_years: dto.horizon_years }),
        ...(dto.drivers !== undefined && { drivers }),
        ...(model.status === 'published' && { status: 'draft' }),
      },
    });
  },
);
```

**`archive`** — soft delete only. Sets `archived_at = now()`, `status = 'archived'`. Does NOT cascade-delete scenarios / line items / snapshots — the data is preserved for unarchive. Hard delete is reserved for owner-tier and platform admin via a separate flow (out of scope for this phase). Permission: `budgeting.archive`.

**`restore`** — sets `archived_at = null`. Status returns to whatever it was before archive — for v1 we always restore as `draft` (since `status = 'archived'` overwrote the prior status; we accept this minor lossiness). Permission: `budgeting.archive`.

### 4. `FinancialModelsController` — `apps/api/src/modules/budgeting/financial-models/financial-models.controller.ts`

```typescript
@Controller('v1/budgeting/financial-models')
@UseGuards(AuthGuard, PermissionGuard)
export class FinancialModelsController {
  constructor(private readonly financialModelsService: FinancialModelsService) {}

  // GET /v1/budgeting/financial-models
  @Get()
  @RequiresPermission('budgeting.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listFinancialModelsQuerySchema))
    query: ListFinancialModelsQueryDto,
  ) {
    return this.financialModelsService.findAll(tenant.tenant_id, query);
  }

  // GET /v1/budgeting/financial-models/:id
  @Get(':id')
  @RequiresPermission('budgeting.view')
  async findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.financialModelsService.findOne(tenant.tenant_id, id);
  }

  // POST /v1/budgeting/financial-models
  @Post()
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createFinancialModelSchema)) dto: CreateFinancialModelDto,
  ) {
    return this.financialModelsService.create(tenant.tenant_id, user.user_id, dto);
  }

  // PATCH /v1/budgeting/financial-models/:id
  @Patch(':id')
  @RequiresPermission('budgeting.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateFinancialModelSchema)) dto: UpdateFinancialModelDto,
  ) {
    return this.financialModelsService.update(tenant.tenant_id, id, dto);
  }

  // DELETE /v1/budgeting/financial-models/:id  (soft archive)
  @Delete(':id')
  @RequiresPermission('budgeting.archive')
  @HttpCode(HttpStatus.OK)
  async archive(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.financialModelsService.archive(tenant.tenant_id, id);
  }

  // POST /v1/budgeting/financial-models/:id/restore
  @Post(':id/restore')
  @RequiresPermission('budgeting.archive')
  async restore(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.financialModelsService.restore(tenant.tenant_id, id);
  }
}
```

### 5. `ScenariosService` — `apps/api/src/modules/budgeting/scenarios/scenarios.service.ts`

```typescript
@Injectable()
export class ScenariosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, parentModelId: string): Promise<Scenario[]>;
  async findOne(
    tenantId: string,
    parentModelId: string,
    scenarioId: string,
  ): Promise<ScenarioWithComputed>;
  async create(
    tenantId: string,
    parentModelId: string,
    dto: CreateScenarioDto,
  ): Promise<ScenarioWithComputed>;
  async update(
    tenantId: string,
    parentModelId: string,
    scenarioId: string,
    dto: UpdateScenarioDto,
  ): Promise<ScenarioWithComputed>;
  async delete(
    tenantId: string,
    parentModelId: string,
    scenarioId: string,
  ): Promise<{ id: string }>;

  // Internal — re-used by line-items service (Phase 04) and snapshots (Phase 05)
  async resolveMergedDrivers(
    parentModel: FinancialModel,
    scenario: Scenario | null,
  ): Promise<Drivers>;
  async runEngineForScenario(
    parentModel: FinancialModel,
    scenario: Scenario | null,
  ): Promise<EngineOutputs>;
}
```

**`findAll`** — list scenarios ordered by `position ASC`, no RLS transaction.

**`findOne`** — resolves the parent model, merges drivers via `mergeDriverOverrides(parentModel.drivers, scenario.driver_overrides)`, runs the engine, and returns:

```typescript
{
  scenario: ScenarioRow,
  computed: {
    line_items: ComputedLineItem[],
    totals_by_year: YearTotals[],
    per_pupil_unit_economics: PerPupilEconomics[],
    warnings: EngineWarning[],
  }
}
```

The computed lines are NOT persisted — they're ephemeral. Phase 05 (snapshots) and Phase 06 (variance) decide later whether to persist scenario-tagged rows.

**`create`** — enforces the **3-scenario cap** server-side:

```typescript
const existingCount = await this.prisma.scenario.count({
  where: { tenant_id: tenantId, parent_model_id: parentModelId },
});
if (existingCount >= 3) {
  throw new ConflictException({
    code: 'SCENARIO_CAP_REACHED',
    message:
      'A financial model can have at most 3 alternative scenarios. Delete an existing scenario before adding a new one.',
  });
}
```

Validates `driver_overrides` via `partialDriversSchema.parse`. Position is auto-assigned to the next free slot (0, 1, or 2) when not provided. Wraps the insert in `createRlsClient(...).$transaction()`.

**`update`** — supports `name`, `position`, `driver_overrides`, `notes`. When `driver_overrides` changes, the engine re-runs (the response includes the freshly merged `computed` block). Position swaps preserve uniqueness via the `uq_scenarios_parent_position` constraint — the service detects a clash and reorders both rows in the same transaction.

**`delete`** — straight delete; the schema's `onDelete: Cascade` on `parent_model` covers cleanup of any phase 05/06 scenario-tagged rows. Wrapped in RLS transaction.

**`resolveMergedDrivers`** + **`runEngineForScenario`** are exported for Phase 04 (line-item override resets need the merged driver set) and Phase 05 (snapshot serialisation needs scenario-level computed totals).

### 6. `ScenariosController` — `apps/api/src/modules/budgeting/scenarios/scenarios.controller.ts`

Routes mounted under the parent model id:

```typescript
@Controller('v1/budgeting/financial-models/:modelId/scenarios')
@UseGuards(AuthGuard, PermissionGuard)
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

  // GET /v1/budgeting/financial-models/:modelId/scenarios
  @Get()
  @RequiresPermission('budgeting.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
  ) {
    return this.scenariosService.findAll(tenant.tenant_id, modelId);
  }

  // GET /v1/budgeting/financial-models/:modelId/scenarios/:scenarioId
  @Get(':scenarioId')
  @RequiresPermission('budgeting.view')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
  ) {
    return this.scenariosService.findOne(tenant.tenant_id, modelId, scenarioId);
  }

  // POST /v1/budgeting/financial-models/:modelId/scenarios
  @Post()
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body(new ZodValidationPipe(createScenarioSchema)) dto: CreateScenarioDto,
  ) {
    return this.scenariosService.create(tenant.tenant_id, modelId, dto);
  }

  // PATCH /v1/budgeting/financial-models/:modelId/scenarios/:scenarioId
  @Patch(':scenarioId')
  @RequiresPermission('budgeting.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Body(new ZodValidationPipe(updateScenarioSchema)) dto: UpdateScenarioDto,
  ) {
    return this.scenariosService.update(tenant.tenant_id, modelId, scenarioId, dto);
  }

  // DELETE /v1/budgeting/financial-models/:modelId/scenarios/:scenarioId
  @Delete(':scenarioId')
  @RequiresPermission('budgeting.manage')
  async delete(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
  ) {
    return this.scenariosService.delete(tenant.tenant_id, modelId, scenarioId);
  }
}
```

### 7. Co-located specs

- `financial-models.service.spec.ts`
- `scenarios.service.spec.ts`

Use the existing mock-prisma + `MOCK_FACADE_PROVIDERS` pattern from `apps/api/src/modules/finance/fee-structures.service.spec.ts`. Mock `createRlsClient` via `jest.mock('../../../common/middleware/rls.middleware')` — same pattern as other RLS-using services in the codebase.

## Testing requirements

**Unit / service spec coverage:**

- `FinancialModelsService.create`
  - Builds default drivers when `dto.drivers` is omitted, using year groups + departments from the read facades.
  - Captures source snapshot via the read facades (verify `studentReadFacade.countActiveByYearGroup`, `staffProfileReadFacade.summariseByDepartment`, `financeReadFacade.priorYearActualsSummary` are called with `tenantId`).
  - Persists the model + base-case line items in one RLS transaction.
  - Returns engine warnings alongside the model body.
  - Surfaces `NO_PRIOR_ACTUALS` warning when `financeReadFacade.priorYearActualsSummary` returns null.
- `FinancialModelsService.update`
  - With `drivers` change: deletes only `source = 'driver_derived' AND is_locked = false AND scenario_id IS NULL` rows, inserts fresh derived lines, leaves custom + override + locked rows intact.
  - On a `published` model: flips status to `draft` after update.
  - Throws `NotFoundException` when id is missing.
- `FinancialModelsService.archive` / `restore`
  - Archive sets `archived_at` and `status = 'archived'`.
  - Restore clears `archived_at`, status returns to `draft`.
- `ScenariosService.create`
  - Rejects creation when 3 scenarios already exist with `ConflictException({ code: 'SCENARIO_CAP_REACHED' })`.
  - Auto-assigns next free position (0, 1, or 2) when not supplied.
  - Persists in RLS transaction.
- `ScenariosService.findOne`
  - Returns merged drivers + computed line items + warnings.
  - Throws `NotFoundException` when scenario doesn't belong to the parent model.
- `ScenariosService.update`
  - Recomputes engine output when `driver_overrides` changes.
  - Position swap preserves uniqueness — both rows updated in one transaction.

**RLS leakage tests** (`apps/api/test/budgeting-financial-models.rls.spec.ts`):

- Tenant A creates a financial model + 1 scenario.
- Authenticate as Tenant B, request `GET /v1/budgeting/financial-models` — assert empty data array.
- Tenant B requests `GET /v1/budgeting/financial-models/<tenant-A-id>` — assert 404 (NOT 403 — leaking existence is also a leak).
- Tenant B requests `GET /v1/budgeting/financial-models/<tenant-A-id>/scenarios/<tenant-A-scenario-id>` — assert 404.
- Tenant B `POST` to scenarios with the same model id — assert 404 (the parent model lookup fails first).

**DI smoke** (per Rule 6 — required because `BudgetingModule` is new):

```bash
cd apps/api && DATABASE_URL=postgresql://x:x@localhost:5432/x \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=fakefakefakefakefakefakefakefake \
JWT_REFRESH_SECRET=fakefakefakefakefakefakefakefake \
ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
MFA_ISSUER=test PLATFORM_DOMAIN=test.local APP_URL=http://localhost:3000 \
npx ts-node -e "
import { Test } from '@nestjs/testing';
import { AppModule } from './src/app.module';
Test.createTestingModule({ imports: [AppModule] }).compile()
  .then(() => { console.log('DI OK'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
"
```

## Post-deploy verification

1. SSH into production, restart API: `pm2 restart api`. Confirm `/api/health → 200`.
2. As `owner@nhqs.test` (per memory `reference_test_accounts.md`), run a real authenticated `POST /api/v1/budgeting/financial-models` via Playwright `browser_evaluate` (per Rule 27a — backend impls drive verification through the cookie/auth path the eventual UI will use):
   ```javascript
   await fetch('/api/v1/budgeting/financial-models', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     credentials: 'include',
     body: JSON.stringify({
       name: 'FY 2026/27 Smoke Test',
       fiscal_year_start: '2026-09-01',
       horizon_years: 1,
     }),
   }).then((r) => r.json());
   ```
   Expect `201`, body containing `{ model: { id, status: 'draft', drivers: {...} }, line_items: [...], totals_by_year: [{...}], warnings: [...] }`.
3. `GET /api/v1/budgeting/financial-models` returns the just-created row.
4. `POST /api/v1/budgeting/financial-models/:id/scenarios` with `{ name: 'Cautious', driver_overrides: { salary_uplift_pct: 1.5 } }` → 201.
5. Repeat 3 times to hit the cap; the 4th attempt returns 409 `SCENARIO_CAP_REACHED`.
6. `DELETE /api/v1/budgeting/financial-models/:id` → 200, model now has `archived_at`. `POST /:id/restore` → 200, `archived_at` cleared.
7. SQL spot-check on production:
   ```sql
   SELECT id, name, status, horizon_years, archived_at IS NOT NULL AS archived
   FROM financial_models
   WHERE tenant_id = '<nhqs-tenant-id>'
   ORDER BY created_at DESC LIMIT 5;
   ```
8. Clean up the smoke-test row before recording completion (so the production tenant's data stays tidy): `DELETE` the model id created during verification.

## Follow-ups for subsequent waves

- Phase 04 (line-items service) extends `FinancialModelLineItem` mutation surface; the contract in `update` (replace only `source = 'driver_derived' AND is_locked = false`) is the load-bearing assumption.
- Phase 05 (snapshots service) reads the scenario merged outputs from `ScenariosService.runEngineForScenario` for `payload` serialisation.
- Phase 06 (variance service) joins `financial_model_line_items` (source = derived) against actual data — its tooltip relies on `computed_from` from the engine output, which is currently NOT persisted. Phase 06 will decide whether to extend the line-item table with a `computed_from JSONB` column or recompute from drivers on demand. Flag for Phase 06 design.
- Phase 12 (hub landing) reads `findAll` for the recent-activity feed. Backend pagination + filter shape is final after this phase ships.
- Phase 13 (workspace UI) consumes `findOne` (model + scenarios + base-case line items) for first paint, then `runEngine` on the frontend for live recompute as drivers are tuned. The source snapshot is the input.
- Phase 14 (compare view) calls `GET /:modelId/scenarios/:scenarioId` for each visible scenario.
- The DTO schemas added to `packages/shared/src/budgeting/financial-models.ts` ship in this phase's `@school/shared` rebuild (Wave 2 deploys — workers and web also pick up the schema, so a coordinated `pm2 restart` is recommended even though only API logic changed).

## Rollback

`git revert <commit-sha>`. No DB changes (no migration in this phase). On the server, after revert: `pm2 restart api` to drop the new module from the running process. The schema from Phase 01 is unaffected — the tables stay; only the API surface goes away. If a partial smoke-test model was created during verification and not cleaned up, leave it: it does no harm and Phase 03's next attempt will read it without trouble.
