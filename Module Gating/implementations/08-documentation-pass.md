# Implementation 08 — Documentation Pass

> **Phase:** 1 — Foundation
> **Wave:** W1
> **Depends on:** 01–07
> **Deploys:** No prod deploy; docs only
> **Model:** Sonnet 4.6 acceptable

---

## Goal

Update the architecture documentation so the new module gating system is discoverable, future contributors don't accidentally violate its invariants, and the existing pre-flight checklist catches "did you handle gating?" before code review.

---

## Critical safety constraints

- **No content removed from existing docs.** Only additions/clarifications. Existing `feature-map.md` entries stay; new "Gateable" annotations are added inline.
- **Preserve the test contract** in `apps/api/test/architecture-docs.spec.ts`. Every doc edit must keep the existing assertions green — bump the "Last verified" + "previously" pattern (per the recent fix in commit 3b5df1cd).

---

## Files to create / modify

### Modify

- **`docs/architecture/feature-map.md`** — every gateable module's section header gains a "**Gateable:** yes (key: `<x>`)" line. Core modules gain "**Gateable:** no — core" if it's not obvious. Quick Reference table gains a "Gateable" column.
- **`docs/architecture/danger-zones.md`** — add two new entries:
  - **DZ-MG-1**: Default-deny on missing `tenantModule` rows. Adding a new gateable module key without running the backfill migration instantly 404s every existing tenant on that endpoint.
  - **DZ-MG-2**: Cache invalidation must fire on every toggle. The toggle handler MUST call `TenantModuleService.invalidateCache` AND publish on the cache-bus. Skipping either causes stale state for up to 5 minutes (TTL fallback).
  - **DZ-MG-3**: Webhook handlers (Stripe, Resend, Twilio) must NOT fail for a tenant with the relevant module disabled. They ack the webhook (return 200) and silently no-op. Otherwise the provider retries, generating noise.
- **`docs/architecture/pre-flight-checklist.md`** — add gating checks to §2 (schema), §4 (event/job), §5 (danger zones), §6 (after-change architecture update).
- **`docs/architecture/state-machines.md`** — add a one-paragraph note in the catalog index for `tenantModule.is_enabled` (synthetic — boolean toggle; transitions fire audit log + cache invalidation).
- **`apps/api/test/architecture-docs.spec.ts`** — add new assertions verifying the new doc content lands. Specifically:
  - `feature-map.md` mentions "Gateable" at least 20 times (one per gateable module).
  - `danger-zones.md` contains "DZ-MG-1", "DZ-MG-2", "DZ-MG-3".
  - `pre-flight-checklist.md` contains "Module Gating" or similar reference.

### Create

- **`docs/runbooks/module-gating-operations.md`** — operator-facing runbook: how to toggle a module via the admin console (or via emergency direct DB access), how to verify a tenant's module state, how to debug "this user reports they can't access X" with the new system.

---

## feature-map.md — annotation pattern

For each gateable module's section, add a header line:

```markdown
### 9. Attendance

> **Gateable:** no — core (base sessions). The AI-powered scan feature is gated by `ai_functions`.
> ...

### 10. Gradebook & Report Cards

> **Gateable:** yes — module key `gradebook` (default ON)
> ...
```

For the Quick Reference table, add a "Gateable" column:

```markdown
| Domain | Backend | Endpoints | Pages | Worker | Gateable |
| ------ | ------- | --------- | ----- | ------ | -------- |
| ...    | ...     | ...       | ...   | ...    | yes/no   |
```

## danger-zones.md — new entries

```markdown
## DZ-MG-1: Default-Deny on Missing tenantModule Rows

**Risk**: The `ModuleEnabledGuard` returns `404 MODULE_DISABLED` when the requested module has no `tenantModule` row for the current tenant. This is intentional security posture (default-deny), but means: **adding a new gateable module key without backfilling rows for existing tenants will instantly 404 those tenants on the gated endpoint.**
**Location**: `apps/api/src/common/guards/module-enabled.guard.ts`, `packages/shared/src/modules/registry.ts`, `packages/prisma/migrations/<latest_module_backfill>/migration.sql`
**Status**: ACTIVE (Module Gating Wave 1, 2026-05-13)

The pre-existing `engagement` and `early_warning` keys were enforced via `@ModuleEnabled` for months without seed rows — every tenant got 403 on those endpoints. The Module Gating impl 02 backfill silently fixed both. This bug class will recur if a future contributor adds a registry entry without running a fresh backfill.

**Rule**: Adding or renaming a key in `MODULE_REGISTRY` requires a Prisma migration that backfills `tenantModule` rows for every existing tenant × the new key, with the `default_enabled` value from the registry. The migration must end with the verification SQL assertion (every tenant has exactly N rows where N = MODULE_REGISTRY.length). Adding a registry entry without the backfill is a production incident.

**Regression tests**: `apps/api/src/common/guards/module-enabled.guard.spec.ts` covers missing-row → 404. The migration's `post_migrate.sql` covers row-count completeness. The admin console health check (impl 22) surfaces "tenant X has missing module rows" on the dashboard.

---

## DZ-MG-2: Cache Invalidation Must Fire on Every Toggle

**Risk**: `TenantModuleService.getEnabledModules` caches in Redis with 5-minute TTL. The admin console toggle handler MUST call `TenantModuleService.invalidateCache(tenantId)` AND `TenantModuleCacheBusService.publishInvalidation(...)` after writing the DB update. Skipping either step causes API/worker/frontend to serve stale state for up to 5 minutes — toggle "appears to do nothing" from the operator's perspective.
**Location**: `apps/api/src/common/services/tenant-module.service.ts`, `apps/api/src/common/services/tenant-module-cache-bus.service.ts`, the toggle endpoint handler in `apps/api/src/modules/tenants/tenants.controller.ts`
**Status**: ACTIVE

If the toggle handler is refactored later, both the local invalidation AND the pub/sub publish must remain. The pub/sub notifies workers + other API instances + the frontend (via the polling subscriber, impl 06). The local invalidation handles the toggling instance.

**Rule**: Any code path that writes `tenantModule.is_enabled` MUST be followed by both invalidation steps in the same transaction or immediately after. There is no circumstance in production where it is acceptable to update the row without firing invalidation.

**Regression tests**: Toggle handler tests verify both `invalidateCache` and `publishInvalidation` are called (via spies). Manual e2e: toggle a module, confirm an open browser tab updates within 60 seconds.

---

## DZ-MG-3: Webhook Handlers Must Ack Even When Module Is Disabled

**Risk**: Stripe webhooks, Resend webhooks, Twilio webhooks, etc. arrive asynchronously from external providers. If the relevant tenant has the corresponding module disabled (e.g., finance disabled when Stripe sends a `payment.succeeded`), the webhook controller MUST still respond 200 to the provider — silently no-op internally. Returning 4xx triggers the provider's retry policy and floods the queue with retried events that will all fail the same way.
**Location**: `apps/api/src/modules/finance/stripe-webhook.controller.ts`, `apps/api/src/modules/communications/webhook.controller.ts`, any future webhook controller for an external provider
**Status**: ACTIVE (Module Gating impl 14 will operationalize for Stripe; communications webhooks per impl 09)

Webhook controllers are the ONE class of route that must NOT use `@ModuleEnabled`. The check happens INSIDE the handler: read the event payload, identify the tenant, check module state via `TenantModuleService.isEnabled`, and either dispatch the work (if enabled) or log + return 200 (if disabled).

**Rule**: New webhook controllers added in the future must follow this pattern. Documented in the API enforcement section of pre-flight checklist (§4). The relevant modules' implementation specs (14 finance, 09 communications) include explicit webhook handler patterns.

**Regression tests**: Per-webhook unit tests verify: "when tenant has module disabled, handler returns 200 and does not enqueue any job." Failing this test means the provider will retry indefinitely.
```

## pre-flight-checklist.md — additions

```markdown
### 2c. Module Gating Check (if adding/renaming a gateable module)

- [ ] Am I adding a new key to `packages/shared/src/modules/registry.ts`? -> Must follow with a Prisma migration backfilling `tenantModule` rows for every tenant × the new key (DZ-MG-1)
- [ ] Am I adding `@ModuleEnabled('key')` to a controller? -> `ModuleEnabledGuard` MUST be in `@UseGuards`. The static analysis test catches this; verify it runs.
- [ ] Am I adding a new webhook controller for an external provider? -> Use the inline TenantModuleService check pattern, NOT `@ModuleEnabled` (DZ-MG-3)

### 4. Event/Job Check (if touching BullMQ or async flows)

- [ ] ... (existing items) ...
- [ ] Am I adding a new cron-dispatch processor that fans out per-tenant? -> Use Pattern A (TenantModuleService.isEnabled per tenant before enqueuing the per-tenant job). See `docs/runbooks/worker-module-gating-patterns.md`.
- [ ] Am I adding an event-driven processor (webhook callback, user-triggered job)? -> Use Pattern B (check tenant module state at top of process(); silently return if disabled). Same runbook.

### 5. Danger Zone Check

- [ ] ... (existing items) ...
- [ ] If touching the toggle endpoint, the guard, the cache, or pub/sub: review DZ-MG-1, DZ-MG-2, DZ-MG-3 in order — they almost always apply together

### 6. Architecture Update

- [ ] ... (existing items) ...
- [ ] Did I add a new module to the registry? -> Update `feature-map.md` Gateable column; verify `architecture-docs.spec.ts` still passes
```

## state-machines.md — index entry

```markdown
- **`tenantModule.is_enabled`** — `schema.prisma:<line>` — boolean, not an enum. Transitions: `false ↔ true` triggered exclusively by the admin console toggle endpoint. Side effects: audit log row + Redis cache invalidation + pub/sub publish. Default-deny semantics on missing row (see DZ-MG-1).
```

## docs/runbooks/module-gating-operations.md (new file)

````markdown
# Module Gating — Operations Runbook

## Toggle a module for a tenant

**Preferred (post Wave 5):** Admin console at `/admin/tenants/:id/modules`.

**Emergency (production):**

```bash
# 1. Update the row
psql "$DATABASE_URL" -c "UPDATE tenant_modules SET is_enabled = false WHERE tenant_id = '<id>' AND module_key = '<key>';"

# 2. Invalidate the API + worker cache
redis-cli DEL "tenant_modules:<id>"

# 3. Publish the invalidation event (frontend will pick up on next /me poll)
redis-cli PUBLISH "tenant_modules:invalidated" '{"tenantId":"<id>","moduleKey":"<key>","isEnabled":false,"timestamp":'$(date +%s%3N)'}'
```
````

## Verify a tenant's module state

```bash
psql "$DATABASE_URL" -c "SELECT module_key, is_enabled, updated_at FROM tenant_modules WHERE tenant_id = '<id>' ORDER BY module_key;"
# Expected: 20 rows (one per gateable module). If fewer, run the backfill migration.
```

## Debug "user can't access feature X"

1. Confirm the user's tenant id (from JWT claims or session lookup).
2. Check the relevant module's `is_enabled`:
   ```bash
   psql "$DATABASE_URL" -c "SELECT is_enabled FROM tenant_modules WHERE tenant_id = '<id>' AND module_key = '<key>';"
   ```
3. If row missing → run backfill migration (impl 02).
4. If row exists with `is_enabled = false` → operator disabled it on purpose; check audit log.
5. If row exists with `is_enabled = true` but user still gets 404 → check the controller actually has `@ModuleEnabled` AND `ModuleEnabledGuard` in `@UseGuards`. Check the cache: `redis-cli GET "tenant_modules:<id>"`.

## Re-enable everything for a tenant (e.g., NHQS rollback)

```bash
psql "$DATABASE_URL" -c "UPDATE tenant_modules SET is_enabled = true WHERE tenant_id = '<id>' AND module_key NOT IN ('sen', 'compliance_advanced');"
# (Skip sen + compliance_advanced because they default off.)
redis-cli DEL "tenant_modules:<id>"
```

```

---

## Acceptance

- [ ] `feature-map.md` has Gateable annotations on every relevant section + a Gateable column in Quick Reference.
- [ ] `danger-zones.md` has DZ-MG-1, DZ-MG-2, DZ-MG-3 with full content.
- [ ] `pre-flight-checklist.md` has §2c + additions to §4, §5, §6.
- [ ] `state-machines.md` has the `tenantModule.is_enabled` index entry.
- [ ] `apps/api/test/architecture-docs.spec.ts` updated with new assertions; runs green.
- [ ] `docs/runbooks/module-gating-operations.md` exists with the three procedures.
- [ ] `2026-04-27` historical reference preserved in any doc whose "Last verified" gets bumped (per the recent commit 3b5df1cd pattern — never drop the historical date).

---

## Notes

- This is the easiest of the W1 specs to do well or do badly. Done badly = stale docs that lie about the system. Done well = a future contributor following the pre-flight checklist catches their own mistakes.
- The `architecture-docs.spec.ts` updates need to follow the existing pattern. New assertions match content presence (e.g., `expect(content).toContain('DZ-MG-1')`).
- The runbook is operator-facing; keep it concrete with copy-pasteable commands.
```
