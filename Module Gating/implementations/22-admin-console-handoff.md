# Implementation 22 — Admin Console Handoff Spec

> **Phase:** 5 — Wave W5 (closure / handoff)
> **Wave:** W5
> **Depends on:** All previous specs (W1–W4) shipped
> **Deploys:** No code; this is a handoff document
> **Model:** Opus 4.7 (precision matters; this hands a ship-ready foundation to the next initiative)

---

## Goal

Document everything the platform admin dashboard team (or the next session executing the dashboard spec) needs to know to build the per-tenant module toggle UI on top of the now-complete gating foundation. After this ships, any session can pick up the dashboard work without needing to re-derive the architecture or hunt through 21 implementation specs.

The original platform admin dashboard spec lives at `docs/superpowers/specs/2026-04-01-platform-admin-dashboard-design.md`. This handoff doc bridges the gap between Module Gating's foundation and that dashboard's UI requirements.

---

## Critical safety constraints

- **The handoff doc must be self-contained.** A future session reading only this file (plus the dashboard spec it links to) should be able to start building UI on day 1 without re-reading the whole Module Gating folder.
- **Document what's complete vs. what the dashboard team must build.** Don't pretend the dashboard exists. Be explicit about handoff boundaries.

---

## Files to create

- **`Module Gating/admin-console-handoff.md`** — the handoff document. Full content below.

---

## Handoff document content

```markdown
# Module Gating → Admin Console Handoff

> **Status (post Module Gating W5):** Foundation complete. Per-tenant module gating works end-to-end across API, frontend, and worker. The admin console UI for managing module toggles is the next initiative.
>
> **Linked spec:** `docs/superpowers/specs/2026-04-01-platform-admin-dashboard-design.md` (the platform admin dashboard design — "Tenant Module Toggles" is one of its Layer 1 features).

## What you get for free

After Module Gating W1–W5 shipped, the following is in place and verified:

### Data

- Every tenant has exactly 20 rows in `tenantModule`, one per gateable key. Defaults per the registry. No missing rows in production.
- The `tenantModule` schema: `(tenant_id UUID, module_key TEXT, is_enabled BOOLEAN, created_at, updated_at)` with unique constraint on `(tenant_id, module_key)`.

### Server-side toggle endpoint
```

POST /v1/admin/tenants/:id/modules/toggle
Authorization: Bearer <platform_owner_jwt>
Content-Type: application/json

{
"module_key": "gradebook",
"is_enabled": false
}

```

Response:
```

200 OK
{
"data": {
"tenant_id": "<uuid>",
"module_key": "gradebook",
"is_enabled": false,
"updated_at": "2026-05-13T...Z"
}
}

```

The handler (already in place per impl 06) does:
1. Update the row.
2. Insert audit-log entry capturing actor, before/after state.
3. Invalidate Redis cache `tenant_modules:<tenantId>`.
4. Publish on `tenant_modules:invalidated` channel.
5. Return new state.

### Reading state for the admin console

```

GET /v1/admin/tenants/:id/modules
Authorization: Bearer <platform_owner_jwt>

```

(Verify this endpoint exists; if not, it's a small addition in the dashboard work.) Returns the full 20-row state for the tenant, suitable for rendering as toggle cards.

### `/me` payload extension (for tenant users)

```

GET /v1/auth/me

```

Response includes:
```

{
"data": {
"user": {...},
"tenant": {...},
"enabled_modules": ["admissions", "gradebook", ...] // 18-20 keys per the tenant's state
}
}

````

### Frontend consumption helpers (already wired)

- `useModuleEnabled(key)` hook
- `<IfModuleEnabled module={key}>` component
- Morph-shell nav filter (entries with `moduleKey` are auto-hidden when disabled)
- `/disabled?module=<key>` landing page (axios interceptor redirects on 404 MODULE_DISABLED)

### Module registry (your source of truth for the UI)

Import the registry and render the admin console from it:

```ts
import { MODULE_REGISTRY } from '@school/shared';

// MODULE_REGISTRY = ReadonlyArray<ModuleDefinition>
// Each entry has: key, display_name, description, default_enabled, category, depends_on?

// Group by category for the UI (Academic, Finance/Ops, People Care, Communications, Operations, Compliance)
const groupedModules = Object.groupBy(MODULE_REGISTRY, m => m.category);
````

### Audit log

Every toggle is logged via the existing audit-log infrastructure. Schema field on the audit row:

- `action`: `'tenant.module.toggle'`
- `resource_type`: `'tenantModule'`
- `resource_id`: `'<tenantId>:<moduleKey>'`
- `payload`: `{ module_key, previous_state, new_state }`
- `actor_user_id`, `created_at` already present per the standard audit schema

The dashboard's "audit log viewer" (per the platform admin dashboard spec §3.3) can filter on `action = 'tenant.module.toggle'` to show toggle history.

### Health check

`TenantModuleService.assertCompleteness(tenantId)` returns `{ complete: boolean, missing: ModuleKey[] }`. The dashboard's "tenant health" panel should call this for the displayed tenant; flag missing rows visibly. Missing rows should never happen in production (impl 02 + DZ-MG-1) but if they do, the dashboard should surface so an operator can re-run the backfill.

## What the dashboard team must build

### UI for module toggle list (per tenant)

Per the platform admin dashboard spec §3.6 (or wherever module toggles land):

- A page at `/admin/tenants/:id/modules` showing the 20 gateable modules grouped by category.
- Each module rendered as a card with: display_name, description, current state (toggle), default_enabled hint, "X tenants have this enabled" telemetry (optional Layer 2).
- Toggle interaction: click → POST to the toggle endpoint → optimistic UI → on success, leave the new state; on failure, revert + toast error.
- Audit log preview: "Last toggled by Y on Z" beneath each card (read from the audit log).

### Bulk operations (Layer 2 / future)

Not required for V1. The platform admin dashboard spec mentions presets (Standard / Premium); those are out of scope for Module Gating's foundation but easy to add later as a list of module-key sets that the operator can apply as a batch.

### Dependent module warnings

When the operator toggles a parent module off (e.g., `finance`), surface a warning: "Disabling finance will leave budgeting in a broken state — also disable budgeting?" with a "yes / no / cancel" prompt. The `depends_on` field in the registry drives the warning; operator has the final say (no auto-cascade).

### Tenant onboarding default presets

For new tenants created via the admin console: a one-click "Standard preset" that applies `default_enabled` from the registry (already the new-tenant behavior; the dashboard just needs to label it).

### Compliance_advanced jurisdiction warning

When enabling `compliance_advanced` for a tenant: surface "This module enables DES/TUSLA/PPOD/CBA submission UIs. These features are Irish-jurisdiction specific. Confirm this tenant operates in Ireland." Operator confirms → enable proceeds. Just a UI hint; no enforcement.

## What's intentionally NOT in scope for the dashboard

- **Plans / tiers.** Per Module Gating STRATEGY §14. Dashboard exposes per-tenant per-module toggles, nothing else.
- **Per-feature granularity.** Module-level only. The `tenant_ai_flag` table (sub-toggles inside `ai_functions`) stays in the existing AI Settings page, not duplicated in the module toggle dashboard.
- **Time-bounded toggles.** Toggles are immediate and persistent.
- **Auto-disable cascade.** Dependent module warnings are UI hints only.
- **Per-user feature flags.** Tenant-level only.

## Key files for the dashboard team to read

- `Module Gating/STRATEGY.md` — full design context.
- `packages/shared/src/modules/registry.ts` — the canonical list (drives the UI).
- `apps/api/src/modules/tenants/tenants.controller.ts` — the existing toggle endpoint (for Q&A on shape).
- `apps/api/src/common/services/tenant-module.service.ts` — the read service.
- `Module Gating/migration-runbook.md` — operations procedures.
- `docs/runbooks/module-gating-operations.md` — operator-facing runbook.

## Interface contract (don't change without coordinating)

The following are the stable interfaces the dashboard depends on. If the dashboard team wants to add fields, they're additive. Removing or renaming fields requires re-coordinating across all four enforcement layers.

| Surface                                                      | Owner                 |
| ------------------------------------------------------------ | --------------------- |
| `POST /v1/admin/tenants/:id/modules/toggle` request shape    | Module Gating impl 06 |
| `tenant_modules:invalidated` Redis pub/sub channel + payload | Module Gating impl 06 |
| `/me` `enabled_modules` field                                | Module Gating impl 04 |
| `MODULE_REGISTRY` shape (`ModuleDefinition` interface)       | Module Gating impl 01 |
| `MODULE_DISABLED` 404 envelope                               | Module Gating impl 03 |
| `/[locale]/disabled` landing page                            | Module Gating impl 04 |

## Outstanding follow-ups (not blocking the dashboard)

- **WebSocket-based real-time invalidation.** Current state: frontend polls `/me` every 60s (per impl 06 Option B). Future: switch to push-based invalidation when the dashboard team's WebSocket infrastructure (per the platform admin dashboard spec §3.1) lands. Drop-in replacement; no API contract change.
- **Per-tenant default-preset library.** Out of scope for Module Gating; dashboard team can add as a separate feature once they have telemetry on which preset patterns operators use.
- **Bulk toggle for multiple tenants at once.** Probably needed for managing 50+ tenants. Out of scope; design when relevant.

```

---

## Acceptance

- [ ] `Module Gating/admin-console-handoff.md` exists with all sections above.
- [ ] The handoff doc is self-contained: a future session can read it + the platform admin dashboard spec and start building UI without further context.
- [ ] All API contracts referenced (toggle endpoint, /me, registry shape, MODULE_DISABLED envelope, channel name) are accurate per the actual implementation.
- [ ] Linked from STRATEGY.md "References" section as the closure doc.
- [ ] Linked from `docs/superpowers/specs/2026-04-01-platform-admin-dashboard-design.md` (add a one-line reference: "Module gating foundation: see `Module Gating/admin-console-handoff.md`").

---

## Notes

- This spec is the bridge between Module Gating (now done) and the platform admin dashboard (next initiative). It's intentionally thin on UI design — that's the dashboard team's job. It's heavy on contracts because contract drift is what kills handoffs.
- The "what's intentionally NOT in scope" section is critical. Without it, the dashboard team will reasonably assume features they want exist or are easy to add. Be explicit.
- After this ships, the Module Gating initiative is done. The IMPLEMENTATION_LOG.md gets a final "✅ shipped" status across all 22 specs.
```
