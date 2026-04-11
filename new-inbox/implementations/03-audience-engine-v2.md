# Implementation 03 — Audience Engine v2

> **Wave:** 2 (parallel with 02, 04, 05)
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Build the **smart audience engine** that powers every broadcast: built-in providers (school / year / class / section / household / staff / handpicked / fees-in-arrears / event-attendees / trip-roster / saved-group), saved audiences (static and dynamic), and AND/OR/NOT composition. The existing `apps/api/src/modules/communications/audience-resolution.service.ts` is **extended**, not replaced — its current scopes (`school`, `year_group`, `class`, `household`, `custom`) become first-class providers in the new registry, and the announcement dispatcher keeps working unchanged throughout the rebuild.

## What to build

### 1. The provider registry

`apps/api/src/modules/inbox/audience/providers/provider.interface.ts`

```ts
export interface AudienceProvider {
  readonly key: string; // matches the JSON discriminator
  readonly displayName: string; // for the frontend chip builder
  readonly paramsSchema: ZodSchema; // Zod schema for params
  resolve(tenantId: string, params: unknown): Promise<{ user_ids: string[] }>;
}
```

`apps/api/src/modules/inbox/audience/audience-provider.registry.ts`

```ts
@Injectable()
export class AudienceProviderRegistry {
  private readonly providers = new Map<string, AudienceProvider>();
  register(provider: AudienceProvider): void;
  get(key: string): AudienceProvider; // throws UNKNOWN_AUDIENCE_PROVIDER
  list(): AudienceProvider[];
}
```

Providers self-register via `OnModuleInit` in their respective modules (or in `InboxModule` for inbox-owned providers). Cross-module providers (e.g. `fees_in_arrears`) live in their owning module (`FinanceModule`) and register themselves.

### 2. Built-in providers (inbox-owned)

Create one file per provider under `apps/api/src/modules/inbox/audience/providers/`:

| File                              | Key                   | Backed by                                                                      |
| --------------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| `school.provider.ts`              | `school`              | `ParentReadFacade` + `StaffReadFacade` (union of all active parents and staff) |
| `parents-school.provider.ts`      | `parents_school`      | `ParentReadFacade.findAllActiveIds`                                            |
| `staff-all.provider.ts`           | `staff_all`           | `StaffReadFacade.findAllActiveIds`                                             |
| `staff-role.provider.ts`          | `staff_role`          | `StaffReadFacade.findIdsByRoles`                                               |
| `department.provider.ts`          | `department`          | `DepartmentsReadFacade.findStaffIdsByDepartments`                              |
| `year-group-parents.provider.ts`  | `year_group_parents`  | existing logic from communications/audience-resolution                         |
| `class-parents.provider.ts`       | `class_parents`       | existing logic                                                                 |
| `section-parents.provider.ts`     | `section_parents`     | new — needs `SectionsReadFacade.findStudentIdsBySection`                       |
| `household.provider.ts`           | `household`           | existing logic                                                                 |
| `year-group-students.provider.ts` | `year_group_students` | `StudentReadFacade.findIdsByYearGroups` (new method needed)                    |
| `class-students.provider.ts`      | `class_students`      | `ClassesReadFacade.findEnrolledStudentIds`                                     |
| `handpicked.provider.ts`          | `handpicked`          | echoes `params.user_ids` after validating they exist in tenant                 |
| `saved-audience.provider.ts`      | `saved_audience`      | calls `SavedAudiencesService.resolve(saved_audience_id)`                       |

Each provider:

- Defines its `paramsSchema` in Zod, exported from `packages/shared/src/inbox/audience/`.
- Implements `resolve(tenantId, params)` returning a deduped string array.
- Has its own `.spec.ts` with at least 3 tests: empty result, populated result, RLS isolation (parent in another tenant not returned).

### 3. Cross-module providers

These live in their **owning** modules, not in `InboxModule`. They self-register via the registry in their module's `OnModuleInit`.

#### 3a. `apps/api/src/modules/finance/audience/fees-in-arrears.provider.ts`

```ts
@Injectable()
export class FeesInArrearsProvider implements AudienceProvider {
  readonly key = 'fees_in_arrears';
  readonly displayName = 'Parents in arrears';
  readonly paramsSchema = z.object({
    min_overdue_amount: z.number().int().nonnegative().optional(),
    min_overdue_days: z.number().int().nonnegative().optional(),
  });

  async resolve(tenantId, params) {
    // 1. Use FinanceReadFacade.findStudentIdsWithOverdueInvoices(tenantId, { minAmount, minDays })
    // 2. Map student ids → parent ids via ParentReadFacade.findParentIdsByStudentIds
    // 3. Return { user_ids }
  }
}
```

`FinanceReadFacade` gains a new method `findStudentIdsWithOverdueInvoices(tenantId, { minAmount, minDays })`. Implement it as a single SQL query inside the existing RLS-scoped facade method pattern. Cover with at least 5 unit tests in `finance-read.facade.spec.ts`.

Register the provider in `FinanceModule.onModuleInit` by injecting `AudienceProviderRegistry` and calling `.register(this.feesInArrearsProvider)`.

#### 3b. `apps/api/src/modules/events/audience/event-attendees.provider.ts` (STUB)

```ts
@Injectable()
export class EventAttendeesProvider implements AudienceProvider {
  readonly key = 'event_attendees';
  readonly displayName = 'Event RSVPs';
  readonly paramsSchema = z.object({
    event_id: z.string().uuid(),
    status: z.enum(['confirmed', 'declined', 'maybe', 'any']).default('confirmed'),
  });

  async resolve(): Promise<{ user_ids: string[] }> {
    throw new ServiceUnavailableException({
      code: 'AUDIENCE_PROVIDER_NOT_WIRED',
      message: 'event_attendees provider is stubbed for v1; events module wires the resolver.',
    });
  }
}
```

The provider exists, registers itself, and is selectable in the UI but throws a structured error if invoked. The frontend treats this error as "this audience type is coming soon" and disables the chip with a tooltip. The events module owns wiring the real resolver in a future implementation.

#### 3c. `apps/api/src/modules/trips/audience/trip-roster.provider.ts` (STUB)

Same pattern as event-attendees. Returns the structured error.

These two stubs must be **registered**, not absent — the registry needs to know they exist so the chip builder can show them in a "coming soon" state.

### 4. The composer

`apps/api/src/modules/inbox/audience/audience-composer.ts`

Pure-function set algebra over provider outputs.

```ts
type AudienceDefinition =
  | { provider: string; params: Record<string, unknown> }
  | { operator: 'and' | 'or'; operands: AudienceDefinition[] }
  | { operator: 'not'; operand: AudienceDefinition };

async function composeAudience(
  definition: AudienceDefinition,
  tenantId: string,
  registry: AudienceProviderRegistry,
): Promise<{ user_ids: string[] }>;
```

The walker:

1. Leaf (`provider`) → `registry.get(provider).resolve(tenantId, params)` → returns set
2. `and` → resolve all operands → set intersection
3. `or` → resolve all operands → set union
4. `not` → resolve operand → set complement against the **universe**

The **universe** for `NOT` is the union of all active users in the tenant (parents + staff + students). Compute it on-demand per composition (cached for the duration of one resolve call). Document this clearly — `NOT` without a parent positive operand is rarely what users want, but the engine handles it for completeness.

Composition with deeply nested trees: enforce a max depth of 5 in `audience-definition.schema.ts` (Zod refinement). Reject deeper trees with `AUDIENCE_DEFINITION_TOO_DEEP`.

### 5. `AudienceResolutionServiceV2`

`apps/api/src/modules/inbox/audience/audience-resolution.service.ts`

The main service consumed by the conversations service (impl 04) and the saved-audiences service (below).

```ts
@Injectable()
export class AudienceResolutionService {
  constructor(
    private readonly registry: AudienceProviderRegistry,
    private readonly composer: AudienceComposer,
    private readonly savedAudiencesService: SavedAudiencesService,
  ) {}

  async resolve(
    tenantId: string,
    definition: AudienceDefinition,
  ): Promise<AudienceResolutionResult>;

  async resolveSavedAudience(
    tenantId: string,
    savedAudienceId: string,
  ): Promise<AudienceResolutionResult>;

  async previewCount(
    tenantId: string,
    definition: AudienceDefinition,
  ): Promise<{ count: number; sample: Array<{ user_id: string; display_name: string }> }>;
}

type AudienceResolutionResult = {
  user_ids: string[];
  resolved_at: Date;
  definition: AudienceDefinition; // echoed back for snapshot persistence
};
```

`previewCount` returns the count + a 5-user sample (for the chip builder UI to show "≈ 142 recipients" with names). Sample is a stable random pick (use the user IDs sorted, take top 5 for determinism in tests).

### 6. `SavedAudiencesService`

`apps/api/src/modules/inbox/audience/saved-audiences.service.ts`

CRUD for the `saved_audiences` table.

```ts
async list(tenantId: string, filter?: { kind?: SavedAudienceKind }): Promise<SavedAudience[]>;
async get(tenantId: string, id: string): Promise<SavedAudience>;
async create(tenantId: string, userId: string, dto: CreateSavedAudienceDto): Promise<SavedAudience>;
async update(tenantId: string, id: string, dto: UpdateSavedAudienceDto): Promise<SavedAudience>;
async delete(tenantId: string, id: string): Promise<void>;
async resolve(tenantId: string, id: string): Promise<{ user_ids: string[] }>;
```

`create` validates the `definition_json` against the `audience-definition.schema.ts` Zod schema. Names must be unique per tenant (DB constraint enforces this; service surfaces a friendly `SAVED_AUDIENCE_NAME_TAKEN` error).

`resolve` for static audiences just reads the `user_ids` from `definition_json.user_ids` and validates they still exist in the tenant. For dynamic audiences it walks the definition through the composer.

### 7. Saved audiences controller

`apps/api/src/modules/inbox/audience/saved-audiences.controller.ts`

```
GET    /v1/inbox/audiences                          → list
GET    /v1/inbox/audiences/:id                       → get
POST   /v1/inbox/audiences                           → create
PATCH  /v1/inbox/audiences/:id                       → update
DELETE /v1/inbox/audiences/:id                       → delete
POST   /v1/inbox/audiences/preview                   → preview a definition (no save)
GET    /v1/inbox/audiences/:id/resolve               → resolve a saved audience to user_ids (admin only)
GET    /v1/inbox/audiences/providers                 → list of available providers + their schemas
```

All behind `@RequiresPermission('inbox.send')` (the same permission that gates broadcasting). The `:id/resolve` and `providers` endpoints are read-only.

### 8. Module wiring

The `InboxModule` from impl 02 gains the audience-related providers:

- `AudienceProviderRegistry` (singleton)
- `AudienceComposer`
- `AudienceResolutionService`
- `SavedAudiencesService`
- `SavedAudiencesController`
- All the inbox-owned providers (school, parents-school, staff-all, etc.)

`FinanceModule` gains:

- `FeesInArrearsProvider` — exported and self-registered

`EventsModule` and `TripsModule`:

- The stub providers — exported and self-registered

If `EventsModule` or `TripsModule` doesn't exist yet, create empty placeholder modules with just the stub provider for now (and a `// TODO: implementation N — wire real provider` comment). This is a deliberate stub; the registry must know about all v1 provider keys.

## Tests

- Each provider has a unit test (3+ scenarios each).
- `audience-composer.spec.ts` — set algebra: AND, OR, NOT, nested mix, depth limit, empty operand handling.
- `audience-resolution.service.spec.ts` — full flow from definition → resolved user_ids, including saved-audience indirection.
- `saved-audiences.service.spec.ts` — CRUD, name uniqueness, definition validation, RLS isolation across tenants.
- `fees-in-arrears.provider.spec.ts` — at least 4 scenarios: no overdue, only some over threshold, mixed amounts, RLS isolation.
- Stub providers throw `AUDIENCE_PROVIDER_NOT_WIRED` and the test verifies the structured error.

## Watch out for

- **Cross-module Prisma access.** Providers in `inbox/audience/providers/` MUST NOT touch `prisma.invoice`, `prisma.event`, or `prisma.trip` directly. The cross-module providers live in their owning modules and use their owning module's read facade. The lint rule `no-cross-module-prisma-access` enforces this — if it fires, route the access through the right facade.
- **`NOT` semantics.** A bare `NOT { handpicked: [a, b, c] }` resolves to `universe - {a, b, c}` which is virtually everyone in the tenant. Make sure the test covers this and the frontend warns the user when they save a definition whose top-level operator is `NOT`.
- **Provider param validation.** Reject unknown params at the schema layer. Don't `params as any`.
- **Circular saved-audience references.** A saved audience that references another saved audience is allowed, but cycles must be detected. Track resolved-saved-audience-ids in the composition walker and throw `SAVED_AUDIENCE_CYCLE_DETECTED` on revisit. Cover with a test.
- **Existing announcements service.** It still uses the old `apps/api/src/modules/communications/audience-resolution.service.ts`. **Do not delete** that file in this implementation. Wave 3 (impl 06) bridges the old and the new — for now both exist side by side. The new one lives at `apps/api/src/modules/inbox/audience/audience-resolution.service.ts` to avoid name collision.

## Deployment notes

- API restart only.
- Smoke test:
  - `GET /v1/inbox/audiences/providers` as Principal → returns the full list including the two stubs (with a `wired: false` flag on stubs).
  - `POST /v1/inbox/audiences/preview` with `{ definition: { provider: 'parents_school', params: {} } }` → returns the parent count for the tenant.
  - `POST /v1/inbox/audiences/preview` with the `fees_in_arrears` provider → returns the count of parents-with-arrears.
