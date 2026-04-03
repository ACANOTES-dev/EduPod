---
name: SW-1B — Concern Logging & Audit Events
description: Concern CRUD with versioned narratives, pastoral event audit writer, masked authorship, tenant-configurable categories, and tier-based access enforcement. The first feature layer on top of SW-1A infrastructure.
phase: 1
sub_phase: B
dependencies:
  - SW-1A (infrastructure — schema, migrations, RLS policies, immutability triggers, permissions, module scaffolding)
status: NOT STARTED
estimated_files: 14 new, 3 modified
---

# SW-1B — Concern Logging & Audit Events

## What this sub-phase delivers

1. **Concern Service** — Full CRUD for `pastoral_concerns`: create, list (paginated + tier-filtered), get (with version history), update metadata, escalate tier, mark shareable with parents. Auto-tier logic for `child_protection` and `self_harm` categories.
2. **Concern Version Service** — Append-only narrative versioning via `pastoral_concern_versions`. Initial version (v1) created with the concern. Amendments create new versions with mandatory reason. No updates or deletes exposed.
3. **Pastoral Event Service** — The immutable audit chronology writer. INSERT-only into `pastoral_events`. Non-blocking fire-and-forget pattern. Zod-validated payloads per event type. Query methods for student chronology and entity history.
4. **Concerns Controller** — REST endpoints for all concern operations. Tier-based permission enforcement. Zod-validated inputs from shared package.
5. **Masked Authorship** — Response DTO transformation that strips `logged_by_user_id` and replaces author name with "Author masked" when `author_masked = true`, except for DLP users (Tier 3 access grant holders).
6. **Concern Categories from Tenant Settings** — Reads categories from `tenant_settings.pastoral.concern_categories`. Validates concern category against tenant's active categories at creation time. Endpoint to list available categories for frontend dropdowns.
7. **Shared Zod Schemas** — All request/response schemas for concerns, versions, and pastoral events defined in `packages/shared`.

## Prerequisites (from SW-1A — must all be complete)

- [ ] Prisma schema includes `pastoral_concerns`, `pastoral_concern_versions`, `pastoral_events`, `cp_access_grants` tables
- [ ] Migration applied with all RLS policies: `pastoral_concerns_tiered_access`, standard RLS on `pastoral_concern_versions` and `pastoral_events`
- [ ] Immutability triggers active: `trg_immutable_pastoral_events`, `trg_immutable_concern_versions`
- [ ] Tier downgrade prevention trigger: `trg_prevent_tier_downgrade`
- [ ] Auto-tier escalation trigger: `trg_auto_escalate_cp_category` (sets tier=3 for `child_protection`/`self_harm`)
- [ ] `app.current_user_id` set in RLS middleware alongside `app.current_tenant_id`
- [ ] Permissions seeded: `pastoral.log_concern`, `pastoral.view_tier1`, `pastoral.view_tier2`, `pastoral.manage_cp_access`
- [ ] `pastoral` module key registered in `tenant_modules`
- [ ] `PastoralModule` scaffolded in `apps/api/src/modules/pastoral/pastoral.module.ts`
- [ ] `tenant_settings.pastoral` JSONB key schema defined in shared package with default concern categories

---

## File inventory

### New files to create

| #   | File path                                                                | Purpose                                                                |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1   | `packages/shared/src/pastoral/schemas/concern.schema.ts`                 | Zod schemas for concern creation, update, listing, escalation, sharing |
| 2   | `packages/shared/src/pastoral/schemas/concern-version.schema.ts`         | Zod schemas for narrative amendment                                    |
| 3   | `packages/shared/src/pastoral/schemas/pastoral-event.schema.ts`          | Zod schemas for all pastoral event payloads (event type union)         |
| 4   | `packages/shared/src/pastoral/schemas/index.ts`                          | Barrel export for all pastoral schemas                                 |
| 5   | `packages/shared/src/pastoral/index.ts`                                  | Barrel export for the pastoral package directory                       |
| 6   | `apps/api/src/modules/pastoral/services/concern.service.ts`              | Core concern CRUD + tier escalation + shareable marking                |
| 7   | `apps/api/src/modules/pastoral/services/concern-version.service.ts`      | Append-only narrative versioning                                       |
| 8   | `apps/api/src/modules/pastoral/services/pastoral-event.service.ts`       | Immutable audit event writer + query methods                           |
| 9   | `apps/api/src/modules/pastoral/controllers/concerns.controller.ts`       | REST endpoints for concerns                                            |
| 10  | `apps/api/src/modules/pastoral/pastoral.constants.ts`                    | Severity levels, tier values, default categories, auto-tier mapping    |
| 11  | `apps/api/src/modules/pastoral/services/concern.service.spec.ts`         | Unit tests for ConcernService                                          |
| 12  | `apps/api/src/modules/pastoral/services/concern-version.service.spec.ts` | Unit tests for ConcernVersionService                                   |
| 13  | `apps/api/src/modules/pastoral/services/pastoral-event.service.spec.ts`  | Unit tests for PastoralEventService                                    |
| 14  | `apps/api/test/pastoral-concerns.e2e.spec.ts`                            | Integration + RLS leakage tests for concern endpoints                  |

### Files to modify

| #   | File path                                          | Change                                                                                   |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | `apps/api/src/modules/pastoral/pastoral.module.ts` | Register ConcernService, ConcernVersionService, PastoralEventService, ConcernsController |
| 2   | `packages/shared/src/index.ts`                     | Add `export * from './pastoral'` barrel                                                  |
| 3   | `packages/shared/src/pastoral/schemas/index.ts`    | Barrel exports (created in SW-1A if scaffolded, otherwise new)                           |

---

## Shared Zod schemas

### `packages/shared/src/pastoral/schemas/concern.schema.ts`

```
createConcernSchema
  - student_id:            z.string().uuid()
  - category:              z.string().min(1).max(50)       -- validated against tenant settings at service layer
  - severity:              z.enum(['routine', 'elevated', 'urgent', 'critical'])
  - narrative:             z.string().min(10).max(10000)   -- rich text, stored as first version
  - occurred_at:           z.string().datetime()
  - location:              z.string().max(255).nullable().optional()
  - witnesses:             z.array(witnessSchema).optional()
  - actions_taken:         z.string().max(5000).nullable().optional()
  - follow_up_needed:      z.boolean().default(false)
  - follow_up_suggestion:  z.string().max(2000).nullable().optional()
  - case_id:               z.string().uuid().nullable().optional()
  - behaviour_incident_id: z.string().uuid().nullable().optional()
  - author_masked:         z.boolean().default(false)
  - tier:                  z.number().int().min(1).max(3).optional()  -- optional; auto-set by trigger for CP categories

witnessSchema
  - type:  z.enum(['staff', 'student'])
  - id:    z.string().uuid()
  - name:  z.string()

updateConcernMetadataSchema
  - severity:              z.enum(['routine', 'elevated', 'urgent', 'critical']).optional()
  - follow_up_needed:      z.boolean().optional()
  - follow_up_suggestion:  z.string().max(2000).nullable().optional()
  - case_id:               z.string().uuid().nullable().optional()

escalateConcernTierSchema
  - new_tier:  z.number().int().min(2).max(3)
  - reason:    z.string().min(1).max(2000)

shareConcernWithParentSchema
  - share_level:  z.enum(['category_only', 'category_summary', 'full_detail'])

listConcernsQuerySchema
  - page:          z.coerce.number().int().min(1).default(1)
  - pageSize:      z.coerce.number().int().min(1).max(100).default(20)
  - student_id:    z.string().uuid().optional()
  - category:      z.string().optional()
  - severity:      z.enum(['routine', 'elevated', 'urgent', 'critical']).optional()
  - tier:          z.coerce.number().int().min(1).max(3).optional()
  - case_id:       z.string().uuid().optional()
  - from:          z.string().optional()
  - to:            z.string().optional()
  - sort:          z.enum(['occurred_at', 'created_at', 'severity']).default('created_at')
  - order:         z.enum(['asc', 'desc']).default('desc')
```

### `packages/shared/src/pastoral/schemas/concern-version.schema.ts`

```
amendNarrativeSchema
  - new_narrative:     z.string().min(10).max(10000)
  - amendment_reason:  z.string().min(1).max(2000)
```

### `packages/shared/src/pastoral/schemas/pastoral-event.schema.ts`

Define a discriminated union of event payload schemas using `event_type` as the discriminator. Every event type from the master spec's event schema table that is relevant to SW-1B must have a corresponding Zod schema.

**Event types handled in SW-1B:**

| Event type                   | Payload fields                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `concern_created`            | `concern_id`, `student_id`, `category`, `severity`, `tier`, `narrative_version: 1`, `narrative_snapshot`, `source: 'manual'` |
| `concern_tier_escalated`     | `concern_id`, `old_tier`, `new_tier`, `reason`, `authorised_by_user_id`                                                      |
| `concern_narrative_amended`  | `concern_id`, `version_number`, `previous_narrative`, `new_narrative`, `reason`                                              |
| `concern_accessed`           | `concern_id`, `tier`                                                                                                         |
| `concern_shared_with_parent` | `concern_id`, `share_level`, `shared_by_user_id`                                                                             |
| `concern_acknowledged`       | `concern_id`, `acknowledged_by_user_id`                                                                                      |

**Event types defined but NOT used until later sub-phases** (define the schemas now so the event writer is complete; they will be called from later sub-phases):

| Event type                        | First used in               |
| --------------------------------- | --------------------------- |
| `concern_note_added`              | SW-1D (cases link notes)    |
| `concern_auto_escalated`          | SW-1E (escalation timeouts) |
| `case_created`                    | SW-1D                       |
| `case_status_changed`             | SW-1D                       |
| `case_ownership_transferred`      | SW-1D                       |
| `intervention_created`            | SW-2B                       |
| `intervention_status_changed`     | SW-2B                       |
| `intervention_updated`            | SW-2B                       |
| `action_assigned`                 | SW-2A / SW-2B               |
| `action_completed`                | SW-2A / SW-2B               |
| `action_overdue`                  | SW-2A                       |
| `parent_contacted`                | SW-2C                       |
| `record_exported`                 | SW-3B                       |
| `cp_access_granted`               | SW-1C                       |
| `cp_access_revoked`               | SW-1C                       |
| `cp_record_accessed`              | SW-1C                       |
| `mandated_report_generated`       | SW-1C                       |
| `mandated_report_submitted`       | SW-1C                       |
| `dsar_review_routed`              | SW-3C                       |
| `dsar_review_completed`           | SW-3C                       |
| `checkin_alert_generated`         | SW-4A                       |
| `critical_concern_unacknowledged` | SW-1E                       |

All event payload schemas are defined in SW-1B so that `PastoralEventService.write()` can validate any event type from day one. The full set is defined here; later sub-phases only call `write()` with their event types.

---

## API endpoints

All endpoints are namespaced under `/api/v1/pastoral/`.

| Method  | Path                              | Permission             | Description                                                                                              |
| ------- | --------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `POST`  | `/pastoral/concerns`              | `pastoral.log_concern` | Create a new concern (with initial narrative version)                                                    |
| `GET`   | `/pastoral/concerns`              | `pastoral.view_tier1`  | List concerns (paginated, filtered). Tier 2 items require `pastoral.view_tier2`. Tier 3 filtered at RLS. |
| `GET`   | `/pastoral/concerns/:id`          | `pastoral.view_tier1`  | Get single concern with version history. Tier 2/3 access enforced.                                       |
| `PATCH` | `/pastoral/concerns/:id`          | `pastoral.view_tier2`  | Update concern metadata (severity, follow-up, case link). NOT narrative.                                 |
| `POST`  | `/pastoral/concerns/:id/escalate` | `pastoral.view_tier2`  | Escalate concern tier (one-way up). Audit event required.                                                |
| `POST`  | `/pastoral/concerns/:id/share`    | `pastoral.view_tier1`  | Mark concern as shareable with parents. Explicit opt-in.                                                 |
| `POST`  | `/pastoral/concerns/:id/amend`    | `pastoral.log_concern` | Amend narrative (creates new version with reason).                                                       |
| `GET`   | `/pastoral/concerns/:id/versions` | `pastoral.view_tier1`  | List all narrative versions for a concern (chronological).                                               |
| `GET`   | `/pastoral/concerns/:id/events`   | `pastoral.view_tier2`  | Get pastoral events for this concern (entity history).                                                   |
| `GET`   | `/pastoral/categories`            | `pastoral.log_concern` | List active concern categories from tenant settings.                                                     |
| `GET`   | `/pastoral/chronology/:studentId` | `pastoral.view_tier1`  | Get student pastoral chronology (all events for a student).                                              |

---

## Service method signatures

### ConcernService (`concern.service.ts`)

| Method           | Params                                                                                                        | Return                                                       | Description                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create`         | `tenantId: string, userId: string, dto: CreateConcernDto, ipAddress: string \| null`                          | `Promise<{ data: PastoralConcern }>`                         | Creates concern row + initial v1 narrative version + `concern_created` audit event. Validates category against tenant settings. If category has `auto_tier` in tenant config, sets tier accordingly. Sets `author_masked` if provided and tenant allows it (`masked_authorship_enabled`). |
| `list`           | `tenantId: string, userId: string, permissions: string[], query: ListConcernsQuery`                           | `Promise<{ data: ConcernListItem[], meta: PaginationMeta }>` | Paginated list. RLS handles Tier 3 filtering. Service additionally filters: if caller lacks `pastoral.view_tier2`, exclude `tier = 2` rows. Applies author masking to response DTOs.                                                                                                      |
| `getById`        | `tenantId: string, userId: string, permissions: string[], concernId: string, ipAddress: string \| null`       | `Promise<{ data: ConcernDetail }>`                           | Fetches concern + all versions. Writes `concern_accessed` audit event if tier >= 3 OR if tenant has access logging enabled for the concern's tier. Applies author masking.                                                                                                                |
| `updateMetadata` | `tenantId: string, userId: string, concernId: string, dto: UpdateConcernMetadataDto`                          | `Promise<{ data: PastoralConcern }>`                         | Updates severity, follow_up_needed, follow_up_suggestion, case_id. Does NOT touch narrative (that goes through ConcernVersionService).                                                                                                                                                    |
| `escalateTier`   | `tenantId: string, userId: string, concernId: string, dto: EscalateConcernTierDto, ipAddress: string \| null` | `Promise<{ data: PastoralConcern }>`                         | Sets new tier (must be higher than current). Writes `concern_tier_escalated` audit event. Trigger also prevents downgrade at DB level.                                                                                                                                                    |
| `markShareable`  | `tenantId: string, userId: string, concernId: string, dto: ShareConcernWithParentDto`                         | `Promise<{ data: PastoralConcern }>`                         | Sets `parent_shareable = true`, `parent_share_level`, `shared_by_user_id`, `shared_at`. Writes `concern_shared_with_parent` audit event.                                                                                                                                                  |
| `getCategories`  | `tenantId: string`                                                                                            | `Promise<{ data: ConcernCategory[] }>`                       | Reads `tenant_settings.pastoral.concern_categories` filtered to `active = true`.                                                                                                                                                                                                          |
| `acknowledge`    | `tenantId: string, userId: string, concernId: string, ipAddress: string \| null`                              | `Promise<void>`                                              | Sets `acknowledged_at` and `acknowledged_by_user_id` if not already set. Writes `concern_acknowledged` audit event. Called internally when a concern is first viewed by a non-author user.                                                                                                |

**Internal helpers (private):**

| Method                    | Purpose                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateCategory`        | Reads tenant settings, checks category key exists and is active. Extracts `auto_tier` if present.                                                                                                                                           |
| `applyAuthorMasking`      | Takes a concern DTO + caller's permissions + `cp_access_grants` status. If `author_masked = true` and caller does NOT have an active CP access grant, replaces `logged_by_user_id` with `null` and sets `author_name` to `"Author masked"`. |
| `resolveCallerTierAccess` | Given caller's permissions list and CP access grant status, returns max tier the caller can view (1, 2, or 3). Used for filtering and masking.                                                                                              |

### ConcernVersionService (`concern-version.service.ts`)

| Method                 | Params                                                                                                   | Return                                        | Description                                                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createInitialVersion` | `tx: PrismaTransactionClient, tenantId: string, concernId: string, userId: string, narrative: string`    | `Promise<PastoralConcernVersion>`             | Creates v1 row in `pastoral_concern_versions`. Called within the concern creation transaction. `amendment_reason` is NULL for v1.                                                                                |
| `amendNarrative`       | `tenantId: string, userId: string, concernId: string, dto: AmendNarrativeDto, ipAddress: string \| null` | `Promise<{ data: PastoralConcernVersion }>`   | Determines next version number. Creates new version row with full new narrative text and mandatory `amendment_reason`. Writes `concern_narrative_amended` audit event with both previous and new narrative text. |
| `listVersions`         | `tenantId: string, concernId: string`                                                                    | `Promise<{ data: PastoralConcernVersion[] }>` | Returns all versions for a concern ordered by `version_number ASC`.                                                                                                                                              |

**Implementation detail:** `amendNarrative` must run inside an interactive transaction that:

1. Reads the current latest version (for previous narrative text and to compute next version number) using `SELECT ... FOR UPDATE` on the concern row to prevent concurrent amendments
2. Inserts the new version row
3. Writes the pastoral event

### PastoralEventService (`pastoral-event.service.ts`)

| Method                 | Params                                                                                   | Return                                                     | Description                                                                                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `write`                | `event: PastoralEventInput`                                                              | `Promise<void>`                                            | Core writer. Validates payload against the Zod schema for the given `event_type`. INSERTs into `pastoral_events`. **Non-blocking:** wraps the INSERT in a try/catch, logs errors but never throws to caller. Fire-and-forget. |
| `getStudentChronology` | `tenantId: string, studentId: string, page: number, pageSize: number`                    | `Promise<{ data: PastoralEvent[], meta: PaginationMeta }>` | All events for a student ordered by `created_at DESC`. RLS handles tier filtering.                                                                                                                                            |
| `getEntityHistory`     | `tenantId: string, entityType: string, entityId: string, page: number, pageSize: number` | `Promise<{ data: PastoralEvent[], meta: PaginationMeta }>` | All events for a specific entity (e.g., all events for concern X) ordered by `created_at DESC`.                                                                                                                               |

**PastoralEventInput type:**

```typescript
interface PastoralEventInput {
  tenant_id: string;
  event_type: PastoralEventType; // union of all event type strings
  entity_type: PastoralEntityType; // 'concern' | 'case' | 'intervention' | etc.
  entity_id: string;
  student_id: string | null;
  actor_user_id: string;
  tier: number; // 1 | 2 | 3
  payload: Record<string, unknown>; // validated by event-type-specific Zod schema
  ip_address: string | null;
}
```

**Critical implementation rules:**

- The `write()` method MUST validate the payload against the Zod schema for the given `event_type` before inserting. If validation fails, log the error and discard — do NOT insert malformed events.
- The `write()` method MUST NOT throw to the caller. Wrap the entire operation in try/catch. Log at `error` level on failure.
- Use the standard Prisma interactive transaction with RLS context (`createRlsClient`) for the INSERT.
- Do NOT use `void` fire-and-forget on the transaction itself — await it but catch errors. The non-blocking contract means the caller does not await `write()`, not that the write itself is unawait-ed internally.

---

## Masked authorship implementation

Masked authorship is implemented as a **DTO transformation** in `ConcernService`, not as a guard or interceptor. This keeps the logic contained and testable.

### Rules

| Viewer context                          | `author_masked = false` | `author_masked = true` |
| --------------------------------------- | ----------------------- | ---------------------- |
| Has active `cp_access_grants` row (DLP) | Shows real author       | Shows real author      |
| Has `pastoral.view_tier2` (SST)         | Shows real author       | Shows "Author masked"  |
| Has `pastoral.view_tier1` only          | Shows real author       | Shows "Author masked"  |

### Implementation

1. `ConcernService.list()` and `ConcernService.getById()` call `applyAuthorMasking()` on each concern DTO before returning.
2. `applyAuthorMasking()` checks:
   - If `author_masked === false`, return DTO as-is.
   - If `author_masked === true`:
     - Query `cp_access_grants` for the calling user (cache this per request).
     - If active grant exists: return DTO as-is (DLP sees everything).
     - Otherwise: set `logged_by_user_id = null`, set `author_name = "Author masked"`, set `author_masked_for_viewer = true`.
3. The response DTO includes an `author_masked_for_viewer` boolean so the frontend knows to display the mask indicator.
4. At creation time: if the caller sets `author_masked = true` but the tenant has `masked_authorship_enabled = false`, reject with 400.

---

## Tenant concern categories

### Default categories (defined in `pastoral.constants.ts`)

```typescript
const DEFAULT_CONCERN_CATEGORIES = [
  { key: 'academic', label: 'Academic', active: true },
  { key: 'social', label: 'Social', active: true },
  { key: 'emotional', label: 'Emotional', active: true },
  { key: 'behavioural', label: 'Behavioural', active: true },
  { key: 'attendance', label: 'Attendance', active: true },
  { key: 'family_home', label: 'Family / Home', active: true },
  { key: 'health', label: 'Health', active: true },
  { key: 'child_protection', label: 'Child Protection', auto_tier: 3, active: true },
  { key: 'bullying', label: 'Bullying', active: true },
  { key: 'self_harm', label: 'Self-harm / Suicidal Ideation', auto_tier: 3, active: true },
  { key: 'other', label: 'Other', active: true },
];
```

### Category validation flow

1. `ConcernService.create()` calls `validateCategory(tenantId, dto.category)`.
2. `validateCategory` reads `tenant_settings` for the tenant, parses `pastoral.concern_categories`.
3. Finds the category by `key` where `active = true`.
4. If not found or not active: throw `BadRequestException` with message `"Invalid or inactive concern category: {key}"`.
5. If found and has `auto_tier`: return the auto_tier value to the caller. The service sets the concern's `tier` to the higher of `dto.tier` (if provided) and `auto_tier`.
6. The DB trigger `trg_auto_escalate_cp_category` is the safety net — even if the service layer fails to set the tier, the trigger will enforce it for `child_protection` and `self_harm`.

### Categories endpoint

`GET /api/v1/pastoral/categories` returns the filtered list. This is a lightweight endpoint for populating frontend dropdowns. No special permission beyond `pastoral.log_concern`.

---

## Controller implementation details

### `ConcernsController` pattern

Follow the established pattern from `BehaviourController`:

```
@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
```

Each endpoint:

1. Extracts `@CurrentTenant() tenant: TenantContext` and `@CurrentUser() user: JwtPayload`.
2. Validates body with `@Body(new ZodValidationPipe(schema))`.
3. Validates query with `@Query(new ZodValidationPipe(schema))`.
4. Validates path params with `@Param('id', ParseUUIDPipe)`.
5. Delegates to the appropriate service method.
6. Returns the service response directly (controller is thin).

### Permission mapping per endpoint

| Endpoint                      | Decorator                                     |
| ----------------------------- | --------------------------------------------- |
| `POST /concerns`              | `@RequiresPermission('pastoral.log_concern')` |
| `GET /concerns`               | `@RequiresPermission('pastoral.view_tier1')`  |
| `GET /concerns/:id`           | `@RequiresPermission('pastoral.view_tier1')`  |
| `PATCH /concerns/:id`         | `@RequiresPermission('pastoral.view_tier2')`  |
| `POST /concerns/:id/escalate` | `@RequiresPermission('pastoral.view_tier2')`  |
| `POST /concerns/:id/share`    | `@RequiresPermission('pastoral.view_tier1')`  |
| `POST /concerns/:id/amend`    | `@RequiresPermission('pastoral.log_concern')` |
| `GET /concerns/:id/versions`  | `@RequiresPermission('pastoral.view_tier1')`  |
| `GET /concerns/:id/events`    | `@RequiresPermission('pastoral.view_tier2')`  |
| `GET /categories`             | `@RequiresPermission('pastoral.log_concern')` |
| `GET /chronology/:studentId`  | `@RequiresPermission('pastoral.view_tier1')`  |

**Tier-based response filtering in the service layer:**

- `GET /concerns` and `GET /concerns/:id`: If the caller has only `pastoral.view_tier1`, filter out `tier = 2` rows at the application layer. Tier 3 rows are already invisible via RLS (assuming the caller does not have a `cp_access_grants` row).
- The controller resolves the caller's permissions via `PermissionCacheService.getPermissions(membershipId)` and passes them to the service.

### IP address capture

Endpoints that trigger audit events (`create`, `getById`, `escalate`, `amend`) must pass `request.ip` to the service. Use `@Req() req: Request` and extract `req.ip`.

---

## Pastoral event write pattern (how services call the event writer)

All services follow this pattern when writing audit events:

```typescript
// Non-blocking — caller does NOT await this
void this.pastoralEventService.write({
  tenant_id: tenantId,
  event_type: 'concern_created',
  entity_type: 'concern',
  entity_id: concern.id,
  student_id: concern.student_id,
  actor_user_id: userId,
  tier: concern.tier,
  payload: {
    concern_id: concern.id,
    student_id: concern.student_id,
    category: concern.category,
    severity: concern.severity,
    tier: concern.tier,
    narrative_version: 1,
    narrative_snapshot: dto.narrative,
    source: 'manual',
  },
  ip_address: ipAddress,
});
```

The `void` ensures the caller does not await the promise. The `PastoralEventService.write()` method internally awaits but catches all errors.

---

## Test requirements

### Unit tests — `concern.service.spec.ts`

| Test                                                  | Description                                                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **creates a concern with valid data**                 | Happy path: create concern, verify row exists, verify v1 version created, verify `concern_created` event written.                                           |
| **validates category against tenant settings**        | Pass invalid category key -> `BadRequestException`. Pass inactive category -> `BadRequestException`.                                                        |
| **auto-sets tier to 3 for child_protection category** | Create concern with `category = 'child_protection'`. Verify `tier = 3` on returned concern.                                                                 |
| **auto-sets tier to 3 for self_harm category**        | Create concern with `category = 'self_harm'`. Verify `tier = 3` on returned concern.                                                                        |
| **rejects author_masked when tenant disables it**     | Set `masked_authorship_enabled = false` in tenant settings. Create concern with `author_masked = true` -> `BadRequestException`.                            |
| **applies author masking for non-DLP viewer**         | Create concern with `author_masked = true`. List as non-DLP user. Verify `logged_by_user_id` is null and `author_name` is "Author masked".                  |
| **DLP sees real author even when masked**             | Create concern with `author_masked = true`. Get as user with active `cp_access_grants`. Verify real author is visible.                                      |
| **filters tier 2 concerns for tier 1 viewers**        | Create tier 1 and tier 2 concerns. List as user with only `pastoral.view_tier1`. Verify tier 2 concerns are excluded.                                       |
| **includes tier 2 concerns for tier 2 viewers**       | Create tier 1 and tier 2 concerns. List as user with `pastoral.view_tier2`. Verify both are returned.                                                       |
| **escalates tier one-way only**                       | Escalate from 1 to 2: succeeds. Attempt to escalate from 2 to 1: fails (service throws before DB trigger would catch it).                                   |
| **writes concern_tier_escalated event on escalation** | Escalate tier. Verify `pastoral_events` row with `event_type = 'concern_tier_escalated'` and correct payload.                                               |
| **marks concern shareable with correct fields**       | Call `markShareable`. Verify `parent_shareable`, `parent_share_level`, `shared_by_user_id`, `shared_at` are set. Verify `concern_shared_with_parent` event. |
| **updates metadata without touching narrative**       | Call `updateMetadata` with new severity. Verify severity changed. Verify no new version row created.                                                        |
| **sets acknowledged_at on first non-author view**     | Create concern as user A. Get concern as user B. Verify `acknowledged_at` is set.                                                                           |
| **pagination returns correct meta**                   | Create 25 concerns. List with `page=2, pageSize=10`. Verify `meta.total = 25, meta.page = 2`.                                                               |

### Unit tests — `concern-version.service.spec.ts`

| Test                                        | Description                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **creates v1 with no amendment_reason**     | Create initial version. Verify `version_number = 1` and `amendment_reason IS NULL`.                                       |
| **creates amendment with mandatory reason** | Amend narrative. Verify `version_number = 2`, `amendment_reason` is set, previous text preserved.                         |
| **increments version number monotonically** | Amend twice. Verify versions 1, 2, 3 exist in correct order.                                                              |
| **writes concern_narrative_amended event**  | Amend narrative. Verify event payload contains `previous_narrative`, `new_narrative`, `reason`.                           |
| **lists versions in chronological order**   | Create 3 versions. List. Verify ordered by `version_number ASC`.                                                          |
| **prevents concurrent amendments**          | Simulate two concurrent amendments. Verify only one succeeds (the `SELECT ... FOR UPDATE` on the concern prevents races). |

### Unit tests — `pastoral-event.service.spec.ts`

| Test                                                    | Description                                                                                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **writes valid event**                                  | Call `write()` with valid `concern_created` payload. Verify row exists in `pastoral_events`.                                                   |
| **validates payload against event type schema**         | Call `write()` with `event_type = 'concern_created'` but missing required payload fields. Verify event is NOT written. Verify error is logged. |
| **never throws to caller**                              | Call `write()` with a payload that causes a DB error (e.g., missing `tenant_id`). Verify no exception propagates. Verify error is logged.      |
| **getStudentChronology returns paginated events**       | Write 15 events for a student. Query with `page=1, pageSize=10`. Verify 10 returned, correct `meta.total`.                                     |
| **getEntityHistory returns events for specific entity** | Write events for concern A and concern B. Query entity history for concern A. Verify only concern A events returned.                           |

### RLS leakage tests — `pastoral-concerns.e2e.spec.ts`

| Test                                                         | Description                                                                                                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **tenant isolation — Tenant B cannot see Tenant A concerns** | Create concern as Tenant A. Authenticate as Tenant B. `GET /concerns` returns empty. `GET /concerns/:id` returns 404.                                                                       |
| **tier 3 RLS — non-DLP user cannot see tier 3 concerns**     | Create tier 3 concern (category = child_protection). Authenticate as user WITHOUT `cp_access_grants`. `GET /concerns` does not include the tier 3 concern. `GET /concerns/:id` returns 404. |
| **tier 3 RLS — DLP user CAN see tier 3 concerns**            | Same setup. Authenticate as user WITH active `cp_access_grants`. `GET /concerns/:id` returns the concern.                                                                                   |
| **concern versions inherit concern RLS**                     | Create tier 3 concern. Amend narrative. Non-DLP user: `GET /concerns/:id/versions` returns 404 (cannot access the parent concern).                                                          |
| **pastoral events RLS**                                      | Create concern as Tenant A, generating events. Authenticate as Tenant B. `GET /chronology/:studentId` returns empty.                                                                        |

### Permission tests — `pastoral-concerns.e2e.spec.ts`

| Test                                                               | Description                                                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **403 without pastoral.log_concern on POST /concerns**             | Authenticate as user without `pastoral.log_concern`. `POST /concerns` returns 403.             |
| **403 without pastoral.view_tier1 on GET /concerns**               | Authenticate as user without `pastoral.view_tier1`. `GET /concerns` returns 403.               |
| **403 without pastoral.view_tier2 on PATCH /concerns/:id**         | Authenticate as user without `pastoral.view_tier2`. `PATCH /concerns/:id` returns 403.         |
| **403 without pastoral.view_tier2 on POST /concerns/:id/escalate** | Authenticate as user without `pastoral.view_tier2`. `POST /concerns/:id/escalate` returns 403. |

---

## Implementation sequence

Execute in this order within the sub-phase:

1. **Shared schemas** (concern, concern-version, pastoral-event) — these have no dependencies and unblock everything else.
2. **`pastoral.constants.ts`** — default categories, severity enum, auto-tier map.
3. **`PastoralEventService`** — the audit writer. Must be available before ConcernService and ConcernVersionService write events.
4. **`ConcernVersionService`** — narrative versioning. Used by ConcernService during creation and amendment.
5. **`ConcernService`** — the main service. Depends on PastoralEventService and ConcernVersionService.
6. **`ConcernsController`** — wires endpoints to services. Last to implement.
7. **Module registration** — update `pastoral.module.ts` with new providers and controllers.
8. **Unit tests** — write alongside each service (TDD encouraged).
9. **E2E / RLS tests** — after all services and controller are functional.
10. **Regression suite** — `turbo test` must pass with zero failures.

---

## Verification checklist

- [ ] `POST /concerns` creates a concern with all structured fields
- [ ] Initial narrative is stored as version 1 in `pastoral_concern_versions`
- [ ] `concern_created` event written to `pastoral_events` with correct payload
- [ ] Category validated against tenant's active categories
- [ ] `child_protection` category auto-sets tier to 3 (service layer + DB trigger)
- [ ] `self_harm` category auto-sets tier to 3 (service layer + DB trigger)
- [ ] `author_masked = true` hides author from non-DLP viewers
- [ ] `author_masked = true` shows real author to DLP users (cp_access_grants holders)
- [ ] `author_masked = true` rejected when tenant has `masked_authorship_enabled = false`
- [ ] `GET /concerns` returns paginated results with correct meta
- [ ] `GET /concerns` filters out tier 2 for users with only `pastoral.view_tier1`
- [ ] Tier 3 concerns invisible to users without `cp_access_grants` (verified at RLS level)
- [ ] `GET /concerns/:id` returns concern with all versions
- [ ] `GET /concerns/:id` writes `concern_accessed` event for tier 3 (always) and tier 1/2 (if configured)
- [ ] `GET /concerns/:id` sets `acknowledged_at` on first non-author view
- [ ] `PATCH /concerns/:id` updates metadata but does NOT create a new narrative version
- [ ] `POST /concerns/:id/escalate` increases tier and writes audit event
- [ ] Tier escalation fails if new_tier <= current tier (service + DB trigger)
- [ ] `POST /concerns/:id/share` sets parent_shareable fields and writes audit event
- [ ] `POST /concerns/:id/amend` creates new narrative version with mandatory reason
- [ ] `concern_narrative_amended` event contains both previous and new narrative text
- [ ] `GET /concerns/:id/versions` returns all versions chronologically
- [ ] `GET /categories` returns active categories from tenant settings
- [ ] `GET /chronology/:studentId` returns paginated student event chronology
- [ ] `PastoralEventService.write()` never throws to caller
- [ ] `PastoralEventService.write()` validates payload with Zod before inserting
- [ ] `PastoralEventService.write()` logs errors at `error` level on failure
- [ ] All append-only tables reject UPDATE/DELETE (verified by immutability triggers from SW-1A)
- [ ] Tenant B cannot see Tenant A concerns (RLS leakage test)
- [ ] Non-DLP user cannot see tier 3 concerns (RLS leakage test)
- [ ] Permission tests: 403 for each endpoint without required permission
- [ ] `turbo test` passes with zero regressions
- [ ] `turbo lint` passes
- [ ] `turbo type-check` passes

---

## Files created/modified summary

| Action | File                                                                     | Type                |
| ------ | ------------------------------------------------------------------------ | ------------------- |
| CREATE | `packages/shared/src/pastoral/schemas/concern.schema.ts`                 | Zod schemas         |
| CREATE | `packages/shared/src/pastoral/schemas/concern-version.schema.ts`         | Zod schemas         |
| CREATE | `packages/shared/src/pastoral/schemas/pastoral-event.schema.ts`          | Zod schemas         |
| CREATE | `packages/shared/src/pastoral/schemas/index.ts`                          | Barrel export       |
| CREATE | `packages/shared/src/pastoral/index.ts`                                  | Barrel export       |
| CREATE | `apps/api/src/modules/pastoral/pastoral.constants.ts`                    | Constants           |
| CREATE | `apps/api/src/modules/pastoral/services/concern.service.ts`              | Service             |
| CREATE | `apps/api/src/modules/pastoral/services/concern-version.service.ts`      | Service             |
| CREATE | `apps/api/src/modules/pastoral/services/pastoral-event.service.ts`       | Service             |
| CREATE | `apps/api/src/modules/pastoral/controllers/concerns.controller.ts`       | Controller          |
| CREATE | `apps/api/src/modules/pastoral/services/concern.service.spec.ts`         | Unit tests          |
| CREATE | `apps/api/src/modules/pastoral/services/concern-version.service.spec.ts` | Unit tests          |
| CREATE | `apps/api/src/modules/pastoral/services/pastoral-event.service.spec.ts`  | Unit tests          |
| CREATE | `apps/api/test/pastoral-concerns.e2e.spec.ts`                            | E2E + RLS tests     |
| MODIFY | `apps/api/src/modules/pastoral/pastoral.module.ts`                       | Module registration |
| MODIFY | `packages/shared/src/index.ts`                                           | Barrel export       |
