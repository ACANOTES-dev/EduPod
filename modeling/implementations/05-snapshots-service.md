# Implementation 05 — Snapshots service

> **Wave:** 2
> **Depends on:** 01, 02
> **Deploys:** API restart only

---

## Goal

Build the publish / version / restore mechanism for `FinancialModelSnapshot`. Publishing a model serialises the **full state at publish time** — drivers, all scenarios with their merged drivers, every current line item (derived / custom / override / locked), totals, per-pupil economics, the source snapshot, and the user-supplied executive summary — into one immutable `payload JSONB` row, increments the `version_number`, and updates the parent model's `current_snapshot_id` pointer.

A published snapshot is a **point-in-time, self-contained record**. The PDF and Excel renderers (Phase 09) must be able to produce a board pack from `payload` alone, without re-querying the live model. That self-containment is what makes the snapshot the historical record schools can show their boards months or years later.

This phase also ships **restore** — duplicating an old snapshot's drivers + line items into a new draft state on the parent model, so the user can roll back without losing the original snapshot.

## What to change

### 1. New folder — `apps/api/src/modules/budgeting/snapshots/`

Files:

- `snapshots.controller.ts`
- `snapshots.service.ts`
- `snapshots.service.spec.ts`
- `dto/` — thin re-exports from `@school/shared/budgeting/snapshots`.

Plugs into `BudgetingModule` via fix-forward edit on Phase 03's module file (Rule 17 — wait for the owner's commit, layer hunks on top).

### 2. Shared schema additions — `packages/shared/src/budgeting/snapshots.ts`

Phase 01 created this file with the `FinancialModelStatus` enum + a Zod equivalent. Phase 05 adds:

```typescript
import { z } from 'zod';
import { driversSchema, partialDriversSchema } from './drivers';
import { sourceDataSnapshotSchema } from './source-data';

// ─── Publish DTO ──────────────────────────────────────────────────────────────
export const publishSnapshotSchema = z.object({
  executive_summary: z.string().min(1).max(20_000),
});
export type PublishSnapshotDto = z.infer<typeof publishSnapshotSchema>;

// ─── List query ──────────────────────────────────────────────────────────────
export const listSnapshotsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListSnapshotsQueryDto = z.infer<typeof listSnapshotsQuerySchema>;

// ─── Snapshot payload schema (the immutable state blob) ──────────────────────
// This shape is what gets persisted to financial_model_snapshots.payload.
// It must be self-contained — the renderer (Phase 09) reads ONLY this blob.
export const snapshotPayloadSchema = z.object({
  schema_version: z.literal(1), // bump if we ever evolve the shape
  model: z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    fiscal_year_start: z.string(), // ISO date
    fiscal_year_end: z.string(),
    horizon_years: z.number().int().min(1).max(5),
    drivers: driversSchema,
  }),
  scenarios: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      position: z.number().int(),
      driver_overrides: partialDriversSchema,
      merged_drivers: driversSchema, // pre-merged for renderer convenience
      notes: z.string().nullable(),
      computed: z.object({
        line_items: z.array(
          z.object({
            category: z.string(),
            subcategory: z.string(),
            name: z.string(),
            fiscal_year: z.number().int(),
            amount: z.number(),
          }),
        ),
        totals_by_year: z.array(
          z.object({
            fiscal_year: z.number().int(),
            revenue: z.number(),
            expenditure: z.number(),
            net_result: z.number(),
          }),
        ),
        per_pupil_unit_economics: z.array(
          z.object({
            fiscal_year: z.number().int(),
            revenue_per_student: z.number(),
            expenditure_per_student: z.number(),
            net_per_student: z.number(),
            revenue_per_household: z.number(),
            breakeven_students: z.number().nullable(),
          }),
        ),
      }),
    }),
  ),
  base_case: z.object({
    line_items: z.array(
      z.object({
        id: z.string().uuid(),
        category: z.string(),
        subcategory: z.string(),
        name: z.string(),
        fiscal_year: z.number().int(),
        source: z.enum(['driver_derived', 'custom', 'override']),
        amount: z.number(),
        is_locked: z.boolean(),
        notes: z.string().nullable(),
        references_event_budget_id: z.string().uuid().nullable(),
      }),
    ),
    totals_by_year: z.array(
      z.object({
        fiscal_year: z.number().int(),
        revenue: z.number(),
        expenditure: z.number(),
        net_result: z.number(),
      }),
    ),
    per_pupil_unit_economics: z.array(
      z.object({
        fiscal_year: z.number().int(),
        revenue_per_student: z.number(),
        expenditure_per_student: z.number(),
        net_per_student: z.number(),
        revenue_per_household: z.number(),
        breakeven_students: z.number().nullable(),
      }),
    ),
  }),
  source_snapshot: sourceDataSnapshotSchema,
  executive_summary: z.string(),
  published_at: z.string().datetime(),
  published_by: z.object({
    user_id: z.string().uuid(),
    name: z.string().nullable(),
  }),
});
export type SnapshotPayload = z.infer<typeof snapshotPayloadSchema>;
```

The base-case `line_items` array deliberately includes `is_locked`, `source`, and `notes` so the renderer can flag locked / overridden lines distinctly in the PDF.

### 3. `SnapshotsService` — `apps/api/src/modules/budgeting/snapshots/snapshots.service.ts`

```typescript
@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scenariosService: ScenariosService,
    @InjectQueue('budgeting') private readonly budgetingQueue: Queue,
  ) {}

  async findAll(
    tenantId: string,
    parentModelId: string,
    query: ListSnapshotsQueryDto,
  ): Promise<PaginatedResult<SnapshotSummary>>;
  async findOne(
    tenantId: string,
    parentModelId: string,
    snapshotId: string,
  ): Promise<SnapshotWithSignedUrls>;
  async publish(
    tenantId: string,
    userId: string,
    parentModelId: string,
    dto: PublishSnapshotDto,
  ): Promise<SnapshotWithSignedUrls>;
  async restore(
    tenantId: string,
    userId: string,
    parentModelId: string,
    snapshotId: string,
  ): Promise<{ id: string; status: 'draft' }>;
}
```

**`findAll`** — paginated read of snapshots for a given model, ordered `published_at DESC` (the newest version first). Each row excludes `payload` (large JSON) — only metadata: `id, version_number, executive_summary, published_at, published_by, pdf_object_key, excel_object_key, rendered_at`. Returns `{ data, meta }`.

**`findOne`** — returns the full snapshot row INCLUDING `payload`. If `pdf_object_key` and/or `excel_object_key` are set, the service generates time-limited signed URLs via the existing `S3Module`'s service (Hetzner Object Storage signing — pattern in use throughout the codebase). 1-hour TTL. URLs are returned alongside the row but never persisted. Throws `NotFoundException({ code: 'SNAPSHOT_NOT_FOUND' })` when missing or wrong tenant.

**`publish`** — the core method. Steps:

1. Verify parent model exists for tenant and is NOT archived. Throw `NotFoundException` / `ConflictException({ code: 'CANNOT_PUBLISH_ARCHIVED_MODEL' })` accordingly.
2. Inside one RLS transaction:
   a. Read the parent model with all base-case line items (`scenario_id IS NULL`).
   b. Read all scenarios for the model.
   c. For each scenario, call `scenariosService.runEngineForScenario(parentModel, scenario)` to get the merged drivers + computed lines + totals + per-pupil. (Phase 03 exposes this as a service-to-service method.)
   d. Run the engine for the base case to compute `totals_by_year` + `per_pupil_unit_economics` from the live line items (we re-derive these from the stored line items rather than re-running the engine, so locked / override / custom values are reflected — see the helper `aggregateLiveLineItems` below).
   e. Read the publishing user's name (`tx.user.findFirst`) for the `published_by` block.
   f. Compute the next `version_number`: `MAX(version_number) + 1` for this `parent_model_id`, defaulting to 1 when none.
   g. Assemble the `payload` per `snapshotPayloadSchema`. Validate via `snapshotPayloadSchema.parse(payload)` before insert — a bad shape is a 500, not a silent corruption.
   h. Insert the snapshot row.
   i. Update the parent model: `current_snapshot_id = snapshot.id`. If `model.status === 'draft'`, transition to `'published'`. If already `published`, leave the status — the new snapshot just becomes the latest version (the `current_snapshot_id` pointer covers the "what's the live version" question).

3. Outside the transaction (post-commit), enqueue the renderer:

```typescript
await this.budgetingQueue.add(
  'budgeting:board-pack-render',
  {
    tenant_id: tenantId,
    snapshot_id: snapshot.id,
    format: 'all', // PDF + Excel
  },
  {
    removeOnComplete: 10,
    removeOnFail: 50,
  },
);
```

The `budgeting` queue + the `budgeting:board-pack-render` job name are defined in Phase 09 (the worker side); Phase 05 only enqueues. The queue itself is registered in `apps/api/src/app.module.ts` via `BullModule.registerQueue({ name: 'budgeting' })` — Phase 05 owns this registration line under Rule 17 (we wire it here so the API can enqueue even if the worker processor isn't deployed yet; failures land in BullMQ's failed-jobs list and don't break the publish flow).

`Logger` used to record `Snapshot ${snapshot.id} published; render job enqueued` after success — useful for production debugging given the cross-service hand-off.

4. Return the persisted snapshot via `findOne` so signed URLs are generated consistently (PDF/Excel will still be `null` immediately after publish; the worker fills them in async and the UI polls `findOne`).

**Lifecycle rules** (per PLAN.md §7.1):

- `draft → published` when first publishing.
- `published → published` (status unchanged) on subsequent publishes — only `current_snapshot_id` updates.
- An archived model cannot be published.
- Editing a published model is the responsibility of `FinancialModelsService.update` (Phase 03), which flips status back to `draft` while leaving the `current_snapshot_id` pointer untouched. The next publish creates v_n+1.

**`restore`** — duplicates an old snapshot's drivers + line items into a new draft state on the parent model. The original snapshot stays in history. Steps:

1. Verify snapshot exists for the parent model + tenant.
2. Inside one RLS transaction:
   a. Update the parent model: `drivers = snapshot.payload.model.drivers`, `horizon_years = snapshot.payload.model.horizon_years`, `source_snapshot_json = snapshot.payload.source_snapshot`, `status = 'draft'`. We deliberately preserve `current_snapshot_id` — that pointer continues to reference whichever was the latest published version (which may or may not be the one being restored). The restore is a **draft state reset**, not a snapshot replacement.
   b. Delete every existing `financial_model_line_items` row for the parent model where `scenario_id IS NULL` (base-case lines being replaced).
   c. Insert the snapshot's base-case line items as new rows. Preserve `source`, `is_locked`, `notes`, `references_event_budget_id` so the user gets back the exact state they restored — including any custom / override / locked configuration.
   d. Delete every existing scenario for the parent model.
   e. Re-create scenarios from `snapshot.payload.scenarios` (only the persisted fields — `name`, `position`, `driver_overrides`, `notes`; the `merged_drivers` + `computed` blocks are output, not input).
3. Return `{ id: parentModelId, status: 'draft' }`.

Restore does NOT enqueue a board-pack render — there's no new snapshot, just a draft state reset. The user can publish fresh from the restored state.

Permission re-check: `budgeting.publish` is enforced at the controller layer.

### 4. `SnapshotsController` — `apps/api/src/modules/budgeting/snapshots/snapshots.controller.ts`

```typescript
@Controller('v1/budgeting/financial-models/:modelId/snapshots')
@UseGuards(AuthGuard, PermissionGuard)
export class SnapshotsController {
  constructor(private readonly snapshotsService: SnapshotsService) {}

  // GET /v1/budgeting/financial-models/:modelId/snapshots
  @Get()
  @RequiresPermission('budgeting.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Query(new ZodValidationPipe(listSnapshotsQuerySchema)) query: ListSnapshotsQueryDto,
  ) {
    return this.snapshotsService.findAll(tenant.tenant_id, modelId, query);
  }

  // GET /v1/budgeting/financial-models/:modelId/snapshots/:snapshotId
  @Get(':snapshotId')
  @RequiresPermission('budgeting.view')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
  ) {
    return this.snapshotsService.findOne(tenant.tenant_id, modelId, snapshotId);
  }

  // POST /v1/budgeting/financial-models/:modelId/snapshots/publish
  @Post('publish')
  @RequiresPermission('budgeting.publish')
  @HttpCode(HttpStatus.CREATED)
  async publish(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body(new ZodValidationPipe(publishSnapshotSchema)) dto: PublishSnapshotDto,
  ) {
    return this.snapshotsService.publish(tenant.tenant_id, user.user_id, modelId, dto);
  }

  // POST /v1/budgeting/financial-models/:modelId/snapshots/:snapshotId/restore
  @Post(':snapshotId/restore')
  @RequiresPermission('budgeting.publish')
  async restore(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
  ) {
    return this.snapshotsService.restore(tenant.tenant_id, user.user_id, modelId, snapshotId);
  }
}
```

### 5. Co-located spec — `snapshots.service.spec.ts`

Mock factories: `prisma.financialModel`, `prisma.financialModelLineItem`, `prisma.financialModelSnapshot`, `prisma.scenario`, `prisma.user`, `ScenariosService.runEngineForScenario`, `Queue.add`, `S3Service.getSignedUrl`. Stub `createRlsClient` per the standard pattern. Mock `snapshotPayloadSchema.parse` to passthrough or fail when testing payload validation.

### 6. Module wiring (fix-forward on `BudgetingModule` and `app.module.ts`)

After Phase 03 commits, append to `BudgetingModule`:

```typescript
imports: [
  // … Phase 03 imports
  BullModule.registerQueue({ name: 'budgeting' }),    // ← NEW (Phase 05)
],
controllers: [
  // … Phase 03 + 04 controllers
  SnapshotsController,
],
providers: [
  // … Phase 03 + 04 providers
  SnapshotsService,
],
exports: [
  // … Phase 03 + 04 exports
  SnapshotsService,
],
```

Add `BullModule.registerQueue({ name: 'budgeting' })` to `apps/api/src/app.module.ts` only if Phase 03 didn't (it didn't — Phase 05 is the first to need it). Pattern matches existing queue registrations (`pastoral`, `notifications`, etc.).

Verify with the AppModule DI smoke (Rule 6) — adding a new `@InjectQueue` constructor dep is exactly the kind of change the smoke catches.

### 7. Permission seed — `budgeting.publish`

Phase 01 already seeded this permission. No change needed here. Verify in production that `owner@nhqs.test` has it (per the test-account memory).

## Testing requirements

**Spec coverage:**

- `publish`
  - Increments `version_number` from `MAX + 1` (1 → 2, 2 → 3, etc.).
  - First publish on a `draft` model transitions status to `'published'`.
  - Subsequent publishes on a `'published'` model leave status unchanged but update `current_snapshot_id`.
  - Throws `ConflictException({ code: 'CANNOT_PUBLISH_ARCHIVED_MODEL' })` when model is archived.
  - Validates `payload` against `snapshotPayloadSchema` before insert; a malformed payload (mock invalid scenario) throws.
  - Enqueues `budgeting:board-pack-render` job exactly once per publish, post-commit, with `{ tenant_id, snapshot_id, format: 'all' }`.
  - Includes ALL line-item rows (derived + custom + override + locked) in `payload.base_case.line_items`.
  - Includes scenario `merged_drivers` (computed via `mergeDriverOverrides`) for renderer convenience.
- `restore`
  - Replaces the parent model's `drivers`, `horizon_years`, `source_snapshot_json` from the snapshot's payload.
  - Deletes existing base-case line items + scenarios; re-inserts from snapshot.
  - Preserves `source` / `is_locked` / `notes` on restored line items.
  - Sets `status = 'draft'`.
  - Leaves `current_snapshot_id` untouched (the original published version is still the latest).
  - Throws `NotFoundException` when snapshot doesn't belong to the parent model.
- `findAll` / `findOne`
  - Sorted by `published_at DESC`.
  - Excludes `payload` from list response.
  - `findOne` includes `payload` and signed URLs (when object keys present).
  - Throws `NotFoundException` for missing or wrong-tenant snapshots.
- **Versioning regression** — publish twice; assert `version_number` 1 then 2; both rows retrievable via `findOne`; `findAll` returns both with correct order.
- **Restore regression** — publish v1, edit drivers, publish v2, then restore v1 → parent model's drivers match v1's drivers; v1 + v2 snapshots both still in DB.

**RLS leakage** (`apps/api/test/budgeting-snapshots.rls.spec.ts`):

- Tenant A publishes a snapshot.
- Tenant B `GET /v1/budgeting/financial-models/<tenant-A-model-id>/snapshots` → 404 on the parent model lookup, not Tenant A's data.
- Tenant B `GET .../snapshots/<tenant-A-snapshot-id>` → 404.
- Tenant B `POST .../snapshots/publish` → 404.
- Tenant B `POST .../snapshots/<tenant-A-snapshot-id>/restore` → 404.

## Post-deploy verification

1. `pm2 restart api` on production. `/api/health → 200`.
2. As `owner@nhqs.test`, drive via Playwright `browser_evaluate`:
   - Re-use a financial model from Phase 03 / 04 smoke (or create a fresh one).
   - `POST /api/v1/budgeting/financial-models/:id/snapshots/publish` with `{ executive_summary: 'Smoke test publish — please ignore.' }` → 201, response `version_number: 1`.
   - `GET .../snapshots` → list of 1 row.
   - `GET .../snapshots/:snapshotId` → full payload returned; `pdf_object_key` / `excel_object_key` may be null (worker hasn't run yet — Phase 09 ships the renderer).
   - Edit drivers via Phase 03's PATCH endpoint, then publish again → `version_number: 2`, parent model `current_snapshot_id` updated to v2.
   - `POST .../snapshots/<v1-snapshot-id>/restore` → 200, parent model status `draft`. `GET .../snapshots` still shows both v1 and v2.
3. SQL check on production:
   ```sql
   SELECT version_number, jsonb_array_length(payload -> 'scenarios') AS scenario_count,
          jsonb_array_length(payload -> 'base_case' -> 'line_items') AS line_count
     FROM financial_model_snapshots
     WHERE parent_model_id = '<smoke-model-id>'
     ORDER BY version_number;
   ```
   Confirm `payload` is well-formed and self-contained (line + scenario counts match the live model state at publish time).
4. BullMQ check: enqueued jobs visible in the `budgeting` queue (delayed/waiting state until Phase 09 ships the worker; this is expected for now).
5. Clean up smoke snapshots before flipping the row to `completed` — run `DELETE FROM financial_model_snapshots WHERE parent_model_id = '<smoke-model-id>'` in psql, then drop the model itself.

## Follow-ups for subsequent waves

- Phase 06 (variance) joins variance against the snapshot's `payload.base_case.line_items` for "planned" values. The variance UI's KPI strip pulls totals from `payload.base_case.totals_by_year`.
- Phase 09 (export pipeline) ships the `budgeting:board-pack-render` worker processor that reads `payload` and renders PDF + Excel to object storage. The processor updates `pdf_object_key` / `excel_object_key` / `rendered_at` on the snapshot row.
- Phase 11 (shareable links) creates `shareable_links` rows pointing at a `parent_snapshot_id`. The public `/share/:token` route reads `payload` directly, so the link survives even if the live model is later edited.
- Phase 16 (snapshots & version history UI) reads `findAll` for the timeline view + `findOne` for the side-pane payload preview + signed URL downloads.
- The `current_snapshot_id` denormalised pointer on `financial_models` saves a join in the hub list (Phase 12) — show "Published v3" inline without joining `financial_model_snapshots`.
- A future cycle may add a `purge_snapshots` cron for tenants with an explicit retention policy. Out of scope here; flagged for governance backlog.

## Rollback

`git revert <commit-sha>`. Manual cleanup if smoke snapshots were left in production:

```sql
-- Drop any test snapshots created during verification (run only when reverting)
DELETE FROM shareable_links WHERE parent_snapshot_id IN (
  SELECT id FROM financial_model_snapshots WHERE executive_summary LIKE '%Smoke test%'
);
DELETE FROM financial_model_snapshots WHERE executive_summary LIKE '%Smoke test%';
UPDATE financial_models SET current_snapshot_id = NULL
  WHERE current_snapshot_id NOT IN (SELECT id FROM financial_model_snapshots);
```

The `budgeting` BullMQ queue registration stays — it's harmless without consumers, and Phase 09 will need it. If the revert is total (all of Phase 05's commits dropped), also remove `BullModule.registerQueue({ name: 'budgeting' })` from `app.module.ts`.

After revert: `pm2 restart api`. Phase 03 + 04 services keep working; only the snapshots surface goes away.
