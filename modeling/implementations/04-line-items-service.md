# Implementation 04 — Line Items service

> **Wave:** 2
> **Depends on:** 01, 02
> **Deploys:** API restart only

---

## Goal

Build the service for managing `FinancialModelLineItem` rows beyond the default rows that Phase 03's "create model" flow inserts. Phase 03 owns derived-line population (and replacement on driver changes); Phase 04 owns the **mutation surface** that lets users add custom lines, override derived lines, lock lines against driver recompute, unlock them, delete custom/override lines, and reset overrides back to driver-derived.

The contract this phase locks in is the line-item state machine across the three sources (`driver_derived`, `custom`, `override`) and the `is_locked` flag. Phase 03's `FinancialModelsService.update` already honours half of this contract (it must skip locked + non-derived rows when re-running the engine); Phase 04 is the other half.

## What to change

### 1. New folder — `apps/api/src/modules/budgeting/line-items/`

Files:

- `line-items.controller.ts`
- `line-items.service.ts`
- `line-items.service.spec.ts`
- `dto/` — thin re-exports of schemas from `@school/shared/budgeting/line-items` (Phase 01 created the file stub; Phase 02 declared the enums; this phase fleshes out the create / update / reset DTOs and the canonical category list as a Zod enum).

The service + controller plug into `BudgetingModule` (Phase 03 owns the module file; Phase 04 appends `LineItemsController` to `controllers` and `LineItemsService` to `providers` via fix-forward edit per Rule 17 — wait for Phase 03's commit, pull, then layer hunks on top).

### 2. Shared schema additions — `packages/shared/src/budgeting/line-items.ts`

Phase 01 / 02 already export the `FinancialModelLineItemCategory` and `FinancialModelLineItemSource` enums + their Zod equivalents. Phase 04 adds:

```typescript
// Canonical category × subcategory list — mirrors PLAN.md §6.1
// Used to validate `custom` line items so users can't invent random subcategories.
export const lineItemSubcategoryByCategory = {
  income: ['tuition_gross', 'tuition_net', 'donations', 'grants', 'other_income'],
  staff_costs: [
    'teaching_salaries',
    'admin_salaries',
    'senior_leadership_salaries',
    'support_staff_salaries',
    'employer_contributions',
    'other_staff_costs',
  ],
  operations: [
    'utilities',
    'cleaning',
    'maintenance',
    'it',
    'insurance',
    'materials',
    'marketing',
    'trips_and_events_estimated',
    'other_operations',
  ],
  capital: ['building', 'equipment', 'it_infrastructure', 'other_capital'],
  reserves_and_adjustments: ['contingency', 'reserves_transfer', 'prior_year_adjustments'],
} as const;

export const lineItemCategorySchema = z.enum([
  'income',
  'staff_costs',
  'operations',
  'capital',
  'reserves_and_adjustments',
]);

// Validate (category, subcategory) is a known pair OR mark it as ad-hoc with a clear `name`.
// For v1 we ALLOW arbitrary subcategory strings on `custom` lines but pin them to one of the canonical
// categories — schools can write any subcategory name they want, but the bucket is fixed.
export const createLineItemSchema = z.object({
  category: lineItemCategorySchema,
  subcategory: z.string().min(1).max(128),
  name: z.string().min(1).max(255),
  fiscal_year: z.number().int().min(1).max(5),
  amount: z.number(),
  scenario_id: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
  references_event_budget_id: z.string().uuid().optional(),
});

export const updateLineItemSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    amount: z.number().optional(), // when set on a `driver_derived` row, source flips to `override`
    is_locked: z.boolean().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });
```

`scenario_id` on the create schema lets users add a custom line specific to an alternative scenario (carrying `scenario_id` non-null). Phase 03's base-case derived rows always have `scenario_id IS NULL`; Phase 04's custom + override rows can be either base or scenario-tagged.

### 3. `LineItemsService` — `apps/api/src/modules/budgeting/line-items/line-items.service.ts`

```typescript
@Injectable()
export class LineItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scenariosService: ScenariosService,
  ) {}

  async createCustom(
    tenantId: string,
    parentModelId: string,
    dto: CreateLineItemDto,
  ): Promise<FinancialModelLineItemRow>;

  async update(
    tenantId: string,
    parentModelId: string,
    lineId: string,
    dto: UpdateLineItemDto,
  ): Promise<FinancialModelLineItemRow>;

  async delete(tenantId: string, parentModelId: string, lineId: string): Promise<{ id: string }>;

  async resetToDerived(
    tenantId: string,
    parentModelId: string,
    lineId: string,
  ): Promise<FinancialModelLineItemRow>;
}
```

**`createCustom`** — adds a custom line with `source = 'custom'`. Steps:

1. Verify parent model exists for tenant. Throw `NotFoundException({ code: 'FINANCIAL_MODEL_NOT_FOUND' })` otherwise.
2. If `dto.scenario_id` provided, verify the scenario belongs to the parent model. Throw `NotFoundException({ code: 'SCENARIO_NOT_FOUND' })` if not.
3. If `dto.references_event_budget_id` provided, verify the event budget exists for the same tenant (Phase 07 owns event budgets — we check existence via `prisma.eventBudget.findFirst({ where: { id, tenant_id } })` and throw `BadRequestException({ code: 'EVENT_BUDGET_NOT_FOUND' })` if missing).
4. Validate `fiscal_year ≤ parent_model.horizon_years`. Throw `BadRequestException({ code: 'FISCAL_YEAR_OUT_OF_RANGE' })` otherwise.
5. Insert in RLS transaction:

```typescript
return await createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId }).$transaction(
  async (tx) => {
    const txdb = tx as unknown as PrismaService;
    return txdb.financialModelLineItem.create({
      data: {
        tenant_id: tenantId,
        parent_model_id: parentModelId,
        scenario_id: dto.scenario_id ?? null,
        category: dto.category,
        subcategory: dto.subcategory,
        name: dto.name,
        fiscal_year: dto.fiscal_year,
        source: 'custom',
        amount: dto.amount,
        is_locked: false,
        notes: dto.notes ?? null,
        references_event_budget_id: dto.references_event_budget_id ?? null,
      },
    });
  },
);
```

**`update`** — covers four logical operations behind one PATCH endpoint:

1. **Override a driver-derived line** — when `dto.amount` is supplied and the row is currently `source = 'driver_derived'`, the row is converted: `source = 'override'`, `amount = dto.amount`. The original derived value is NOT preserved (the user can `resetToDerived` to recompute it).
2. **Edit an override or custom amount** — same field, same handler; just no source flip required.
3. **Lock / unlock** — `dto.is_locked` flips the flag. Locking a derived line is a real use case ("the engine doesn't know about our locked utility contract; here's the actual number, leave it alone") so we allow `is_locked = true` on derived rows without converting source.
4. **Update notes** — straightforward field; `dto.notes = null` clears.

```typescript
return await createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId }).$transaction(
  async (tx) => {
    const txdb = tx as unknown as PrismaService;
    const line = await txdb.financialModelLineItem.findFirst({
      where: { id: lineId, tenant_id: tenantId, parent_model_id: parentModelId },
    });
    if (!line) {
      throw new NotFoundException({
        code: 'LINE_ITEM_NOT_FOUND',
        message: `Line item with id "${lineId}" not found on financial model "${parentModelId}"`,
      });
    }
    const data: Prisma.FinancialModelLineItemUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.is_locked !== undefined) data.is_locked = dto.is_locked;
    if (dto.amount !== undefined) {
      data.amount = dto.amount;
      if (line.source === 'driver_derived') {
        data.source = 'override';
      }
    }
    return txdb.financialModelLineItem.update({ where: { id: lineId }, data });
  },
);
```

**`delete`** — removes the line. Allowed only when `source IN ('custom', 'override')`. A `driver_derived` row cannot be deleted directly — it would just reappear on the next driver recompute, and deleting it leaves an inconsistent state. To "remove" a derived line, the user adjusts the underlying driver. Service rejects with:

```typescript
if (line.source === 'driver_derived') {
  throw new ForbiddenException({
    code: 'CANNOT_DELETE_DERIVED_LINE',
    message:
      'Driver-derived line items cannot be deleted directly. Adjust the underlying driver, or override the value to zero, or lock the line.',
  });
}
```

`onDelete: Cascade` from the parent model handles bulk cleanup when the model itself is deleted (out of scope here — `FinancialModelsService.archive` is soft).

**`resetToDerived`** — reverts an `override` row back to `driver_derived` by recomputing its amount from the current drivers + source snapshot:

1. Look up the line; reject with `BadRequestException({ code: 'NOT_AN_OVERRIDE' })` if `source !== 'override'`.
2. Look up the parent model. Resolve the effective drivers (base case OR base+scenario merge if `line.scenario_id` is non-null) via `ScenariosService.resolveMergedDrivers` (defined in Phase 03 as an internal service-to-service method).
3. Run `runEngine({ drivers, source: parentModel.source_snapshot_json, horizon_years })`.
4. Find the matching computed line by `(category, subcategory, fiscal_year)`. If none found (e.g. the underlying driver no longer produces this line), reject with `BadRequestException({ code: 'NO_DERIVED_VALUE_AVAILABLE', message: 'Drivers no longer produce a derived value for this line. Delete or edit the override instead.' })`.
5. Update the row: `source = 'driver_derived'`, `amount = computed.amount`, leave `is_locked` as-is. Wrap in RLS transaction.

This action is the user's escape hatch for "I overrode this number, but actually I want it driven by the model again."

### 4. `LineItemsController` — `apps/api/src/modules/budgeting/line-items/line-items.controller.ts`

```typescript
@Controller('v1/budgeting/financial-models/:modelId/line-items')
@UseGuards(AuthGuard, PermissionGuard)
export class LineItemsController {
  constructor(private readonly lineItemsService: LineItemsService) {}

  // POST /v1/budgeting/financial-models/:modelId/line-items
  @Post()
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.CREATED)
  async createCustom(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body(new ZodValidationPipe(createLineItemSchema)) dto: CreateLineItemDto,
  ) {
    return this.lineItemsService.createCustom(tenant.tenant_id, modelId, dto);
  }

  // PATCH /v1/budgeting/financial-models/:modelId/line-items/:lineId
  @Patch(':lineId')
  @RequiresPermission('budgeting.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body(new ZodValidationPipe(updateLineItemSchema)) dto: UpdateLineItemDto,
  ) {
    return this.lineItemsService.update(tenant.tenant_id, modelId, lineId, dto);
  }

  // DELETE /v1/budgeting/financial-models/:modelId/line-items/:lineId
  @Delete(':lineId')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.lineItemsService.delete(tenant.tenant_id, modelId, lineId);
  }

  // POST /v1/budgeting/financial-models/:modelId/line-items/:lineId/reset-to-derived
  @Post(':lineId/reset-to-derived')
  @RequiresPermission('budgeting.manage')
  async resetToDerived(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.lineItemsService.resetToDerived(tenant.tenant_id, modelId, lineId);
  }
}
```

### 5. Co-located spec — `line-items.service.spec.ts`

Mock `prisma.financialModelLineItem` (`findFirst`, `create`, `update`, `delete`), `prisma.financialModel` (`findFirst`), `prisma.scenario` (`findFirst`), `prisma.eventBudget` (`findFirst`), and `ScenariosService.resolveMergedDrivers` via `jest.fn()`. Mock `createRlsClient` per the standard pattern. Stub `runEngine` from `@school/shared/budgeting` via `jest.mock('@school/shared/budgeting')` so the spec is unit-scoped.

### 6. Module wiring (fix-forward edit on `budgeting.module.ts`)

After Phase 03 has committed `BudgetingModule`, append:

```typescript
// imports stay the same as Phase 03
controllers: [
  FinancialModelsController,
  ScenariosController,
  LineItemsController,                  // ← NEW
],
providers: [
  FinancialModelsService,
  ScenariosService,
  LineItemsService,                     // ← NEW
],
exports: [
  FinancialModelsService,
  ScenariosService,
  LineItemsService,                     // ← NEW (Phase 09 export pipeline reads line items at render time)
],
```

## Testing requirements

**Spec coverage:**

- `createCustom`
  - Inserts row with `source = 'custom'`, `is_locked = false`.
  - Throws `NotFoundException` when parent model missing.
  - Throws `NotFoundException` when `scenario_id` doesn't belong to the model.
  - Throws `BadRequestException({ code: 'FISCAL_YEAR_OUT_OF_RANGE' })` when `fiscal_year > horizon_years`.
  - Throws `BadRequestException({ code: 'EVENT_BUDGET_NOT_FOUND' })` when `references_event_budget_id` is invalid.
  - Persists in RLS transaction (mock `createRlsClient` + assert called).
- `update`
  - `dto.amount` on a `driver_derived` row → row becomes `source = 'override'`, retains `is_locked` value.
  - `dto.amount` on an `override` row → stays `source = 'override'`.
  - `dto.amount` on a `custom` row → stays `source = 'custom'`.
  - `dto.is_locked = true` on a `driver_derived` row → stays `source = 'driver_derived'`, `is_locked = true`.
  - `dto.notes = null` clears notes.
  - Throws `NotFoundException` when line doesn't belong to the parent model.
- `delete`
  - Deletes `custom` rows.
  - Deletes `override` rows.
  - Throws `ForbiddenException({ code: 'CANNOT_DELETE_DERIVED_LINE' })` for `driver_derived`.
  - Throws `NotFoundException` when line missing.
- `resetToDerived`
  - Recomputes the matching `(category, subcategory, fiscal_year)` line from drivers, updates row with new amount, flips source to `driver_derived`.
  - Preserves `is_locked` flag.
  - Throws `BadRequestException({ code: 'NOT_AN_OVERRIDE' })` for non-override rows.
  - Throws `BadRequestException({ code: 'NO_DERIVED_VALUE_AVAILABLE' })` when engine output has no matching key.
  - Calls `ScenariosService.resolveMergedDrivers` when the line has `scenario_id` set.

**Integration / RLS leakage** (`apps/api/test/budgeting-line-items.rls.spec.ts`):

- Tenant A creates a model and a custom line.
- Authenticate as Tenant B; `POST /v1/budgeting/financial-models/<tenant-A-id>/line-items` → 404.
- `PATCH .../line-items/<tenant-A-line-id>` → 404.
- `DELETE .../line-items/<tenant-A-line-id>` → 404.
- `POST .../line-items/<tenant-A-line-id>/reset-to-derived` → 404.

**Contract test** — verify Phase 03's `FinancialModelsService.update` continues to skip `is_locked = true` and `source = 'override'` / `source = 'custom'` rows when re-running the engine (regression test in `financial-models.service.spec.ts`, owned by Phase 03; flagged in the completion record so the Phase 03 author folds the assertion in).

## Post-deploy verification

1. `pm2 restart api` on production. `/api/health → 200`.
2. As `owner@nhqs.test`, drive a real flow via Playwright `browser_evaluate` (per Rule 27a):
   - Create a model (re-uses Phase 03's smoke flow).
   - `POST /api/v1/budgeting/financial-models/:id/line-items` with `{ category: 'operations', subcategory: 'maintenance', name: 'Roof repairs', fiscal_year: 1, amount: 12000 }` → 201, body has `source: 'custom'`.
   - `PATCH .../line-items/<derived-line-id>` with `{ amount: 99999 }` → 200, source flips to `override`.
   - `PATCH .../line-items/<derived-line-id>` with `{ is_locked: true }` → 200, `is_locked: true`.
   - `POST .../line-items/<override-line-id>/reset-to-derived` → 200, source back to `driver_derived` and amount matches engine recompute.
   - `DELETE .../line-items/<custom-line-id>` → 200.
   - `DELETE .../line-items/<derived-line-id>` → 403 with `CANNOT_DELETE_DERIVED_LINE`.
3. SQL spot-check on production: `SELECT id, source, is_locked, amount FROM financial_model_line_items WHERE parent_model_id = '<smoke-model-id>'` — confirm `source` column has expected values.
4. Trigger a `PATCH` on the model with new drivers (Phase 03 endpoint) — confirm via SQL that locked + override + custom rows survive while driver-derived rows are replaced.
5. Clean up the smoke model + lines before flipping the row to `completed`.

## Follow-ups for subsequent waves

- Phase 06 (variance) will join `financial_model_line_items` against actuals using `(category, subcategory, fiscal_year)` as the join key. Custom lines + overrides feed into the planned column the same as derived lines.
- Phase 09 (export pipeline) consumes line items in published-snapshot order — the renderer reads from snapshot payload, not from the live table, so this phase doesn't directly affect export contracts.
- Phase 13 (workspace UI) wires the line-item table to all four operations (POST custom, PATCH amount/lock/notes, DELETE, POST reset-to-derived). The UI should hide DELETE on `driver_derived` rows (matching the backend rejection).
- Phase 17 (event budget UI) — when an event budget is referenced from a financial model line item via `references_event_budget_id`, the budget UI should warn if the budget is changed after the model published a snapshot. Out of scope here but flagged.

## Rollback

`git revert <commit-sha>`. No DB changes (no migration). On revert, `pm2 restart api` to drop the service. Phase 03's `BudgetingModule` registration list shrinks — the fix-forward edit reverts cleanly because the additions are append-only. Any custom / override / locked rows added during smoke verification stay in the DB (harmless — they belong to a smoke-test model that should be cleaned up separately).
