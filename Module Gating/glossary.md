# Module Gating — Glossary

Quick reference for terminology used across STRATEGY.md and the implementation specs.

---

## Module key

A short snake_case identifier for a gateable module. Example: `gradebook`, `auto_scheduling`, `communications_outbound`. Defined as a TypeScript union type in `packages/shared/src/modules/registry.ts`. The 20 module keys used by this system are the only valid values.

## Module registry

The single source of truth: `packages/shared/src/modules/registry.ts` (created in implementation 01). Exports `MODULE_REGISTRY` (an array of `ModuleDefinition`), `MODULE_KEYS` (a `Set<ModuleKey>`), and the `ModuleKey` type. Every other layer (seed, fixture, API guard, frontend hook, tests) imports from here. New gateable modules are added here first.

## Gateable module

A module that appears in the per-tenant admin console toggle list. There are 20 of them. Disabling a gateable module hides it from the tenant's UI, blocks its API endpoints (returns 404 MODULE_DISABLED), and skips its worker jobs.

## Core module

A module that is always-on for every tenant and never appears in the admin console. ~50 modules are core (foundational data, identity, schedule read-side, regulatory baseline, infrastructure). They're listed in §5.2 of STRATEGY.md.

## Enforcement layer

One of the four places where a module's enabled state must be checked:

1. **API enforcement** — `@ModuleEnabled('key')` decorator + `ModuleEnabledGuard` on a NestJS controller
2. **Frontend enforcement** — `useModuleEnabled('key')` hook + nav filter + page guard + `<IfModuleEnabled>`
3. **Worker enforcement** — `TenantModuleService.isEnabled(tenantId, key)` check inside cron-dispatchers and processors
4. **Notification enforcement** — implicit; notifications are gated through whichever module owns their template_key

## Default-deny

The current `ModuleEnabledGuard` behaviour: if a tenant has no `tenantModule` row for the requested key, the guard throws (denies access). This is safer than default-allow but means every gateable key MUST have a `tenantModule` row for every tenant before enforcement can ship. The W1 migration backfill (implementation 02) ensures this.

## tenant_module / TenantModule

The Prisma model + Postgres table that stores per-tenant module state. Schema: `(tenant_id, module_key, is_enabled, created_at, updated_at)` with unique constraint on `(tenant_id, module_key)`. Already exists in the schema; we are populating + enforcing against it, not redesigning it.

## Backfill migration

A Prisma migration in implementation 02 that inserts a `tenantModule` row for every existing tenant × every key in MODULE_REGISTRY, using `default_enabled` from the registry. Idempotent (uses `INSERT ... ON CONFLICT DO NOTHING`). Removes rows for deprecated keys. Verifies row counts before completing.

## MODULE_DISABLED

The error code returned when a request hits a gated controller and the tenant's module is disabled. Response shape: `404 { error: { code: 'MODULE_DISABLED', module: '<key>', message: 'This feature is disabled by your administrator.' } }`. Frontend axios interceptor catches this code and triggers the disabled-page redirect.

## /disabled landing page

A new route at `/[locale]/disabled?module=<key>` that explains "this feature has been turned off by your admin" and links back to morph-shell home. Single shared page; module key is read from the query string.

## Mid-session flip

The user is using a feature; admin disables that feature mid-session. Defined behaviour in §8: next API call returns MODULE_DISABLED → toast → redirect to /disabled. We do not kill in-flight requests/jobs/transactions.

## Cron-dispatch tenant skip

The pattern used in worker enforcement: a cross-tenant cron (e.g., `behaviour:cron-dispatch-daily`) iterates the active tenants and only enqueues per-tenant jobs for tenants whose relevant module is enabled. Already used in `behaviour` and `pastoral`; will be extended to other modules in waves W2/W3.

## Module-aware nav

A nav config that filters out entries whose `moduleKey` is not in the user's `enabled_modules` array. Implemented via the `useModuleEnabled` hook and a filter applied at render time in the morph-shell layout.

## Communications split

The decomposition of the existing `communications` module key into:

- `communications_outbound` (gateable) — covers SMS/email/WhatsApp dispatch, announcements, notification templates
- inbox (core, ungateable) — in-app conversations and message reads

Detailed in implementation 09. The split is necessary because in-app inbox is a core product feature that should never be disabled, but the existing toggle was monolithic.

## Compliance split

The decomposition of `compliance`-related work into:

- `compliance` (core, ungateable) — DSAR, consent, privacy notices, DPA, data retention basics, audit logs, sub-processors, AI audit
- `compliance_advanced` (gateable) — DES, TUSLA, PPOD, CBA, regulatory submissions, regulatory calendar, advanced retention policies

Detailed in implementation 17. Driven by the legal requirement that core GDPR/DPA functionality cannot be disabled.

## Gating leakage test

The module-gating equivalent of the existing RLS leakage tests. Located at `apps/api/test/module-gating-leakage.e2e-spec.ts` (created in implementation 07). Per gated module, asserts that a tenant with the module disabled gets `404 MODULE_DISABLED` from sample endpoints. Catches "I added the decorator but forgot to wire the guard" class bugs.

## Wave (W1, W2, W3, W4, W5)

Sequential phases of the rollout. Defined in STRATEGY.md §11. Wave 1 (foundation) must land before any other wave. W2/W3/W4 specs are parallelisable across implementing sessions. W5 closes out with migration verification + admin console handoff.

## depends_on (informational only)

A field on `ModuleDefinition` listing other module keys this module functionally depends on. **Used for UI hints only**. We do NOT auto-disable dependents when a parent is disabled — the admin must explicitly disable each. Example: `budgeting` has `depends_on: ['finance']`, so disabling finance shows "budgeting will be in a broken state — also disable?" but the admin can ignore the hint.

## ai_functions (the unified AI toggle)

A single module key that gates all AI surfaces at the tenant level. The pre-existing `tenant_ai_flag` table and `@RequiresAiFlag` decorator stay as a finer per-AI-surface knob inside the AI Settings page (so power-user tenants can disable specific AI features without disabling all AI). The admin console only exposes `ai_functions` on/off; per-surface flags remain in the existing settings page.

## /me endpoint extension

The existing `GET /v1/auth/me` endpoint is extended in implementation 04 to include `enabled_modules: ModuleKey[]` in the response payload. Frontend uses this to populate the nav filter and the `useModuleEnabled` hook. Refreshed on cache invalidation (the pub/sub pattern in §4.5).

## TenantModuleService

A new NestJS service (created in implementation 05) that wraps the `tenantModule` table reads + the Redis cache. Single source for the API guard, the worker checks, and the `/me` endpoint to consult per-tenant module state. Avoids each layer doing its own DB query.
