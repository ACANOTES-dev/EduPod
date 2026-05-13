# Module Gating -> Admin Console Handoff

> **Status after Module Gating W5:** the gating foundation is in place across the API, tenant-user `/me` payload, frontend school shell, worker cache, and operations runbooks. The platform admin dashboard still owns the polished operator UI for managing tenant module toggles.
>
> **Linked dashboard spec:** `docs/superpowers/specs/2026-04-01-platform-admin-dashboard-design.md`.

## What You Get For Free

### Canonical Registry

The dashboard must render from `MODULE_REGISTRY`; do not hard-code a second module list.

```ts
import { MODULE_REGISTRY } from '@school/shared';
```

Each registry entry has:

- `key`: the stable `ModuleKey`.
- `display_name`: operator-facing name.
- `description`: tooltip/body copy for the card.
- `default_enabled`: tenant-onboarding default.
- `category`: one of `academic`, `finance_ops`, `people_care`, `communications`, `operations`, or `compliance`.
- `depends_on`: informational dependency hints only. The system never auto-cascades toggles.

There are 20 gateable keys. `analytics` is deliberately absent. `trips` is deliberately absent because trips remains a stub and is not gateable until a real trips module exists.

### Data

Every active production tenant has exactly 20 rows in `tenant_modules`, one per canonical registry key.

Prisma model:

```prisma
model TenantModule {
  id         String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id  String  @db.Uuid
  module_key String  @db.VarChar(100)
  is_enabled Boolean

  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, module_key], name: "idx_tenant_modules_tenant_module")
  @@index([tenant_id], name: "idx_tenant_modules_tenant")
  @@map("tenant_modules")
}
```

Missing rows are treated as disabled by design. If a tenant has missing module rows, treat it as a data drift incident and re-run the backfill path from `Module Gating/migration-runbook.md`.

### Read Tenant Module State

The existing platform-admin endpoint returns the tenant's rows ordered by module key.

```http
GET /api/v1/admin/tenants/:id/modules
Authorization: Bearer <platform-owner-jwt>
```

Response data shape:

```json
[
  {
    "id": "<tenant_module_uuid>",
    "tenant_id": "<tenant_uuid>",
    "module_key": "gradebook",
    "is_enabled": true
  }
]
```

### Toggle Tenant Module State

The existing toggle endpoint is key-in-path and uses `PATCH`.

```http
PATCH /api/v1/admin/tenants/:id/modules/:key
Authorization: Bearer <platform-owner-jwt>
Content-Type: application/json

{
  "is_enabled": false
}
```

Successful response data shape is the updated `tenantModule` row:

```json
{
  "id": "<tenant_module_uuid>",
  "tenant_id": "<tenant_uuid>",
  "module_key": "gradebook",
  "is_enabled": false
}
```

The handler currently does this, in order:

1. Validate the tenant exists.
2. Validate `:key` is a canonical `ModuleKey`.
3. Update the `tenant_modules.is_enabled` row.
4. Write an audit row through `SecurityAuditService.logModuleToggle`.
5. Delete Redis cache key `tenant_modules:<tenantId>`.
6. Publish a Redis invalidation event on `tenant_modules:invalidated`.
7. Return the updated row.

### Audit Log Contract

Module toggles are logged using the existing audit-log schema.

- `tenant_id`: the tenant being changed.
- `actor_user_id`: the platform/admin actor if provided by the request JWT.
- `entity_type`: `tenant_config`.
- `entity_id`: the tenant id.
- `action`: `module_toggle`.
- `metadata_json.category`: `security_event`.
- `metadata_json.sensitivity`: `elevated`.
- `metadata_json.module_key`: the module key.
- `metadata_json.is_enabled`: the new state.

For the W5 rollout snapshot, implementation 21 inserts one audit row per active tenant with:

- `action`: `module_gating.system_rolled_out`.
- `entity_type`: `tenant_config`.
- `metadata_json.modules_snapshot`: object map of module key to boolean enabled state.

### Cache And Propagation Contract

`TenantModuleService` caches enabled modules at:

```text
tenant_modules:<tenantId>
```

TTL is 5 minutes. Toggle writes must invalidate this key.

Redis pub/sub channel:

```text
tenant_modules:invalidated
```

Payload:

```json
{
  "tenantId": "<tenant_uuid>",
  "module_key": "gradebook",
  "is_enabled": false,
  "timestamp": 1778700000000
}
```

Workers subscribe to this channel and invalidate their local tenant-module cache on receipt. The frontend currently uses the polling fallback: authenticated tenant sessions refresh `/me` every 60 seconds, so nav visibility converges even without a websocket push channel.

### Tenant User `/me` Payload

Tenant-authenticated users receive enabled modules during auth boot.

```http
GET /api/v1/auth/me
```

Response includes:

```json
{
  "data": {
    "user": {},
    "enabled_modules": ["admissions", "gradebook", "finance"],
    "memberships": []
  }
}
```

Do not use `/me` for the platform admin toggle UI itself; use the platform-admin tenant modules endpoints above.

### Frontend Helpers Already Available

Tenant-facing school UI already has:

- `useModuleEnabled(key)`.
- `<IfModuleEnabled module={key}>...</IfModuleEnabled>`.
- Morph-shell nav filtering through `moduleKey`.
- `/[locale]/disabled?module=<key>` landing page.
- Global `apiClient` handling for `404 MODULE_DISABLED`, including redirect to the disabled landing page.

`MODULE_DISABLED` error envelope:

```json
{
  "error": {
    "code": "MODULE_DISABLED",
    "message": "This feature is disabled by your administrator.",
    "module": "gradebook"
  }
}
```

## What The Dashboard Team Must Build

### Tenant Module Toggle UI

Build the production operator UI at `/admin/tenants/:id/modules` from `MODULE_REGISTRY`.

Each module card should show:

- `display_name`.
- `description`.
- Current `is_enabled` state.
- `default_enabled` hint.
- Optional "last toggled by" audit summary from `action = 'module_toggle'`.

Toggle flow:

1. User clicks the toggle.
2. Optimistically update local UI.
3. `PATCH /api/v1/admin/tenants/:id/modules/:key` with `{ "is_enabled": <boolean> }`.
4. On success, keep the new state and refresh the row/audit summary.
5. On failure, revert the toggle and show a toast with the API error message.

### Dependency Warnings

Use `depends_on` as a warning source only. For example, if the operator disables `finance` while `budgeting` is enabled, show a warning that budgeting depends on finance. The operator decides whether to continue. Do not auto-cascade changes.

### Compliance Advanced Warning

When enabling `compliance_advanced`, show a jurisdiction warning: DES/TUSLA/PPOD/CBA features are Irish-jurisdiction specific. The warning is a UI confirmation, not a backend enforcement rule.

### Tenant Onboarding Preset

For new-tenant setup, expose a "registry defaults" preset that mirrors `MODULE_REGISTRY.default_enabled`. This is already what backend tenant creation uses; the dashboard should label it clearly for operators.

### Health Hint

Expose missing module rows as an operator-visible health issue.

`TenantModuleService.assertCompleteness(tenantId)` returns:

```ts
{ complete: boolean; missing: ModuleKey[] }
```

Missing rows should never happen in production after W5. If they do, direct the operator to `Module Gating/migration-runbook.md`.

## Intentionally Out Of Scope

- Plans or tiers.
- Per-feature gating.
- Per-user feature flags.
- Time-bounded toggles.
- Automatic dependency cascade.
- Duplicating `tenant_ai_flag` fine-grained AI controls in the module toggle UI.
- Gating trips while trips remains a stub.
- Reintroducing an `analytics` tenant-module key.

## Files To Read Next

- `Module Gating/STRATEGY.md`.
- `Module Gating/migration-runbook.md`.
- `docs/runbooks/module-gating-operations.md`.
- `packages/shared/src/modules/registry.ts`.
- `apps/api/src/modules/tenants/tenants.controller.ts`.
- `apps/api/src/modules/tenants/tenants.service.ts`.
- `apps/api/src/common/services/tenant-module.service.ts`.
- `apps/api/src/common/services/tenant-module-cache-bus.service.ts`.
- `apps/web/src/hooks/use-module-enabled.ts`.
- `apps/web/src/components/if-module-enabled.tsx`.
- `apps/web/src/lib/api-client.ts`.

## Stable Interface Contract

Coordinate before changing any of these:

| Surface                      | Current contract                                    |
| ---------------------------- | --------------------------------------------------- |
| Registry                     | `MODULE_REGISTRY`, `ModuleDefinition`, `ModuleKey`  |
| Read endpoint                | `GET /api/v1/admin/tenants/:id/modules`             |
| Toggle endpoint              | `PATCH /api/v1/admin/tenants/:id/modules/:key`      |
| Toggle body                  | `{ "is_enabled": boolean }`                         |
| Toggle audit action          | `module_toggle`                                     |
| W5 rollout audit action      | `module_gating.system_rolled_out`                   |
| Redis cache key              | `tenant_modules:<tenantId>`                         |
| Redis pub/sub channel        | `tenant_modules:invalidated`                        |
| Redis pub/sub payload fields | `tenantId`, `module_key`, `is_enabled`, `timestamp` |
| Tenant-user auth payload     | `/me` includes `enabled_modules: ModuleKey[]`       |
| Disabled-module envelope     | `404` with `error.code = MODULE_DISABLED`           |
| Tenant-facing disabled route | `/[locale]/disabled?module=<key>`                   |

## Outstanding Follow-Ups

- Websocket push for tenant-module invalidation in the dashboard. Current tenant-facing UI is eventually consistent via 60-second `/me` polling.
- Fleet-level adoption telemetry, such as "X tenants have this enabled."
- Bulk tenant operations for managing many tenants at once.
- Rich audit timeline in the platform dashboard. The raw audit rows exist now; the polished viewer is dashboard work.
