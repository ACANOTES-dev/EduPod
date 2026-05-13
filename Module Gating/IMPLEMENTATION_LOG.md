# Module Gating — Implementation Log

> Mirrors the format of `New Languages/IMPLEMENTATION_LOG.md`. Update as each implementation lands.
> **Last updated:** 2026-05-13

---

## Status legend

- ⏳ **planned** — spec exists, not started
- 🚧 **in progress** — code being written or in review
- 📦 **merged** — code merged to main, awaiting deploy
- 🚀 **deployed** — code on production
- ✅ **shipped** — deployed AND verified on production (smoke test passed)
- ❌ **blocked** — requires a decision before continuing
- 🔁 **superseded** — replaced by a newer spec

---

## Implementation index

| #   | Spec                                                                                             | Wave | Status |
| --- | ------------------------------------------------------------------------------------------------ | ---- | ------ |
| 01  | [Canonical module registry](implementations/01-canonical-module-registry.md)                     | W1   | 📦     |
| 02  | [Seed data corrections + migration](implementations/02-seed-data-corrections.md)                 | W1   | 📦     |
| 03  | [API enforcement layer](implementations/03-api-enforcement-layer.md)                             | W1   | 📦     |
| 04  | [Frontend gating system](implementations/04-frontend-gating-system.md)                           | W1   | 📦     |
| 05  | [Worker gating layer](implementations/05-worker-gating-layer.md)                                 | W1   | 📦     |
| 06  | [Redis cache + invalidation](implementations/06-redis-cache-invalidation.md)                     | W1   | 📦     |
| 07  | [Test contract](implementations/07-test-contract.md)                                             | W1   | 📦     |
| 08  | [Documentation pass](implementations/08-documentation-pass.md)                                   | W1   | 📦     |
| 09  | [Communications split](implementations/09-communications-split.md)                               | W2   | 📦     |
| 10  | [Already-enforced verification](implementations/10-already-enforced-verification.md)             | W2   | 📦     |
| 11  | [Partial-enforcement completion](implementations/11-partial-enforcement-completion.md)           | W2   | 📦     |
| 12  | [Admissions full enforcement](implementations/12-admissions-full-enforcement.md)                 | W3   | 📦     |
| 13  | [Gradebook full enforcement](implementations/13-gradebook-full-enforcement.md)                   | W3   | 📦     |
| 14  | [Finance full enforcement](implementations/14-finance-full-enforcement.md)                       | W3   | 📦     |
| 15  | [Homework full enforcement](implementations/15-homework-full-enforcement.md)                     | W3   | ⏳     |
| 16  | [Auto-scheduling full enforcement](implementations/16-auto-scheduling-full-enforcement.md)       | W3   | ⏳     |
| 17  | [Compliance / regulatory split](implementations/17-compliance-regulatory-split.md)               | W3   | ⏳     |
| 18  | [New toggle: leave](implementations/18-new-toggle-leave.md)                                      | W4   | ⏳     |
| 19  | [New toggle: school_closures](implementations/19-new-toggle-school-closures.md)                  | W4   | ⏳     |
| 20  | [Trips placeholder + analytics ghost-key cleanup](implementations/20-trips-analytics-cleanup.md) | W4   | ⏳     |
| 21  | [Migration runbook for existing tenants](implementations/21-migration-runbook.md)                | W5   | ⏳     |
| 22  | [Admin console handoff spec](implementations/22-admin-console-handoff.md)                        | W5   | ⏳     |

---

## Phase 0 — Spec & Strategy

### P0 — Strategy & implementation log

- ⏳ STRATEGY.md drafted 2026-05-13 by Opus 4.7 (1M context) after parallel deep-dive of all 20+ gateable + ~50 core modules.
- ⏳ Glossary drafted 2026-05-13.
- ⏳ Implementation specs (01–22) drafted 2026-05-13.
- ⏳ Awaiting user review of master spec before execution begins.

### Notes

- The deep-dive evidence for each module is preserved in `_evidence/batch-{1..6}.md`. Future sessions can verify any per-module claim by reading the corresponding evidence file.
- Critical pre-existing bug surfaced during the deep-dive: `engagement` and `early_warning` are decorated with `@ModuleEnabled` but missing from the `MODULE_KEYS` seed array. Combined with the guard's default-deny on missing rows, both modules are currently completely blocked for all tenants. **This is a real production bug today** — implementation 02 must run before any other enforcement to fix it.

---

## Phase 1 — Foundation (Wave W1)

### 01 — Canonical module registry

#### Acceptance

- [x] `packages/shared/src/modules/registry.ts` exists and exports `ModuleKey`, `ModuleDefinition`, `MODULE_REGISTRY`, `MODULE_KEYS`.
- [x] All 20 module keys (per STRATEGY §5.1) are defined with `display_name`, `description`, `default_enabled`, `category`.
- [x] `MODULE_KEYS` is a `ReadonlySet<ModuleKey>` derived from the registry (no parallel list).
- [x] Type-only import works from API + worker + web (`packages/shared` is consumed by all three).
- [x] Unit test in `packages/shared/src/modules/registry.spec.ts` asserts: 20 entries, no duplicate keys, every key matches the `ModuleKey` union.

#### Commits / CI / Deploy / Notes

- Commit: `feat(module-gating): add canonical module registry`
- CI: not run remotely; local package checks passed:
  - `pnpm --filter @school/shared test -- --runTestsByPath src/modules/registry.spec.ts`
  - `pnpm --filter @school/shared type-check`
  - `pnpm --filter @school/shared lint`
- Deploy: not deployed; server access treated as not granted for this pass.
- Notes: `packages/shared/src/constants/modules.ts` now delegates to the canonical registry so older imports keep working without preserving a second module list. `packages/shared/package.json` exposes `@school/shared/modules` and `@school/shared/modules/*` for direct consumers.

---

### 02 — Seed data corrections + migration

#### Acceptance

- [x] `apps/api/test/tenant-fixture.builder.ts`: `MODULE_KEYS` constant deleted, replaced with import from `@school/shared/modules/registry`.
- [x] `packages/prisma/seed.ts`: same — uses `MODULE_REGISTRY` to provision modules for new tenants.
- [x] New Prisma migration: backfills `tenantModule` rows for every existing tenant × every key in `MODULE_REGISTRY` (using `default_enabled`). Removes rows for deprecated keys (`analytics`).
- [x] Migration is idempotent (safe to re-run).
- [x] Migration includes a final SQL assertion: `SELECT tenant_id FROM tenants WHERE id NOT IN (SELECT tenant_id FROM tenant_modules GROUP BY tenant_id HAVING COUNT(*) = 20)` returns 0 rows. Migration aborts if assertion fails.
- [ ] Production run on NHQS + 4 stress tenants verified: each tenant has exactly 20 `tenantModule` rows post-migration, defaults match the registry.

#### Commits / CI / Deploy / Notes

- Commit: `fix(module-gating): backfill tenant module registry rows`
- CI: not run remotely; local checks passed:
  - `pnpm --filter @school/prisma type-check`
  - `pnpm --filter @school/prisma build`
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/api test -- --runTestsByPath src/modules/tenants/tenants.service.spec.ts`
  - `NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @school/api lint` (warnings only; first run without explicit heap OOMed)
  - `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint apps/api/src/modules/tenants/tenants.service.ts apps/api/src/modules/tenants/tenants.service.spec.ts apps/api/test/tenant-fixture.builder.ts packages/prisma/seed.ts packages/prisma/scripts/create-stress-tenants.ts` (warnings only)
- Deploy: not deployed; no production verification yet.
- Notes: API tenant provisioning and the stress-tenant script were also moved to `MODULE_REGISTRY` so fresh tenants, fixtures, seed, and stress tenants share the same defaults. The migration preserves `communications=false` by copying it to `communications_outbound=false`, then removes all non-canonical `tenant_modules` keys so each tenant has exactly 20 rows. Local DB migration execution was not run because no local `DATABASE_URL` / `DATABASE_MIGRATE_URL` is configured in this session.

---

### 03 — API enforcement layer

#### Acceptance

- [x] `@ModuleEnabled` decorator typed `<K extends ModuleKey>(key: K)` so typos become TS errors.
- [x] `ModuleEnabledGuard` returns `NotFoundException` with `{ code: 'MODULE_DISABLED', module: key, message: '...' }` instead of `ForbiddenException`.
- [x] Guard's missing-row default-deny behaviour documented inline with `// SAFETY:` comment + reference to STRATEGY §4.2.
- [x] All existing usages of `@ModuleEnabled` still pass tests.
- [x] New unit test in guard spec: missing row → 404 MODULE_DISABLED.

#### Commits / CI / Deploy / Notes

- Commit: `fix(module-gating): return structured disabled-module errors`
- CI: not run remotely; local checks passed:
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/api test -- --runTestsByPath src/common/guards/module-enabled.guard.spec.ts src/common/filters/all-exceptions.filter.spec.ts src/modules/communications/announcements.controller.spec.ts src/modules/communications/notification-templates.controller.spec.ts src/modules/communications/notifications.controller.spec.ts`
  - `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint apps/api/src/common/decorators/module-enabled.decorator.ts apps/api/src/common/guards/module-enabled.guard.ts apps/api/src/common/guards/module-enabled.guard.spec.ts apps/api/src/common/exceptions/module-disabled.exception.ts apps/api/src/common/filters/all-exceptions.filter.ts apps/api/src/common/filters/all-exceptions.filter.spec.ts apps/api/src/modules/communications/announcements.controller.ts apps/api/src/modules/communications/notification-templates.controller.ts apps/api/src/modules/communications/notifications.controller.ts`
- Deploy: not deployed.
- Notes: Added `ModuleDisabledException` and preserved the top-level `error.module` field in `AllExceptionsFilter` so the frontend interceptor can redirect by module key. Existing communications surfaces that were already decorated with the deprecated `communications` key were moved to `communications_outbound`; this preserves current access after implementation 02 removes the old row and does not add new communications gating.

---

### 04 — Frontend gating system

#### Acceptance

- [x] `apps/web/src/hooks/use-module-enabled.ts` exports `useModuleEnabled(key: ModuleKey): boolean`.
- [x] `apps/web/src/components/if-module-enabled.tsx` exports `<IfModuleEnabled module={key}>{children}</IfModuleEnabled>`.
- [x] `/me` endpoint extended: response includes `enabled_modules: ModuleKey[]`. New field is populated server-side from canonical tenant module rows.
- [x] Frontend boot context (the existing auth provider) populates `enabledModules` from `/me`.
- [x] Morph-shell nav config supports a `moduleKey?: ModuleKey` field on each entry; render-time filter hides entries whose key is not in `enabledModules`.
- [x] New route `/[locale]/disabled` exists; reads `?module=<key>` query param; shows "this feature is disabled by your admin" with a Return to home link.
- [x] API client has an interceptor path that catches `MODULE_DISABLED` 404s, fires a toast, and redirects to `/disabled?module=<key>`.

#### Commits / CI / Deploy / Notes

- Commit: `feat(module-gating): add frontend gating foundation`
- CI: not run remotely; local checks passed:
  - `pnpm --filter @school/api test -- --runTestsByPath src/modules/auth/auth.service.spec.ts src/modules/auth/auth.controller.spec.ts`
  - `pnpm --filter @school/web test -- --runTestsByPath src/hooks/use-module-enabled.spec.ts src/components/if-module-enabled.spec.ts src/lib/api-client.spec.ts 'src/app/[locale]/(school)/layout.spec.ts'`
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/web type-check`
  - `pnpm --filter @school/shared type-check`
  - `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/auth.service.spec.ts apps/api/src/modules/auth/auth.controller.spec.ts packages/shared/src/schemas/auth.schema.ts apps/web/src/providers/auth-provider.tsx apps/web/src/hooks/use-module-enabled.ts apps/web/src/hooks/use-module-enabled.spec.ts apps/web/src/components/if-module-enabled.tsx apps/web/src/components/if-module-enabled.spec.ts apps/web/src/components/hub-tile.tsx apps/web/src/lib/nav-config.ts 'apps/web/src/app/[locale]/(school)/layout.tsx' 'apps/web/src/app/[locale]/(school)/layout.spec.ts' apps/web/src/lib/api-client.ts apps/web/src/lib/api-client.spec.ts apps/web/src/lib/handle-api-error.ts 'apps/web/src/app/[locale]/disabled/page.tsx' 'apps/web/src/app/[locale]/disabled/_components/disabled-content.tsx'` (warnings only)
  - `pnpm --filter @school/web test -- --runTestsByPath src/__tests__/translation-parity.spec.ts src/__tests__/i18n/tier-scopes.spec.ts`
  - `pnpm turbo test`
- Deploy: not deployed.
- Notes: The repo uses a fetch-based `apiClient`, not Axios, so the module-disabled handling was wired into that client instead of adding an Axios-only adapter. Existing `/me/modules` support remains in place for backward compatibility; `/me` now returns `enabled_modules` for boot-time context. The nav filtering system is active but no nav entries set `moduleKey` in this implementation, matching the spec's "no nav changes yet" constraint. Manual DB toggle walkthrough and production verification were not run because no local DB / server access was available in this session.

---

### 05 — Worker gating layer

#### Acceptance

- [x] New `TenantModuleService` in `apps/api/src/common/services/tenant-module.service.ts` (also re-exported for worker use). Methods: `isEnabled(tenantId, key) → Promise<boolean>`, `getEnabledModules(tenantId) → Promise<ModuleKey[]>`.
- [x] Existing guard refactored to use `TenantModuleService` (single source).
- [x] Worker has a thin import path for the same service (worker doesn't depend on the full Nest module graph).
- [x] Pattern A (cron-dispatch tenant skip) documented with examples: `pastoral`, `behaviour`, and `early_warning` cron dispatchers consult `TenantModuleService` before enqueueing tenant work.
- [x] Pattern B (job-level guard) documented with an example template processor.
- [ ] Static sweep shows no direct `tenantModule.findMany` outside `TenantModuleService`.

#### Commits / CI / Deploy / Notes

- Commit: `feat(module-gating): add worker gating service`
- CI: not run remotely; local checks passed:
  - `pnpm --filter @school/api test -- --runTestsByPath src/common/services/tenant-module.service.spec.ts src/common/guards/module-enabled.guard.spec.ts src/modules/auth/auth.service.spec.ts src/modules/auth/auth.controller.spec.ts src/modules/tenants/tenants.service.spec.ts src/modules/tenants/tenant-read.facade.spec.ts`
  - `pnpm --filter @school/worker test -- --runTestsByPath src/processors/pastoral/pastoral-cron-dispatch.processor.spec.ts src/processors/behaviour/cron-dispatch.processor.spec.ts src/processors/early-warning/compute-daily.processor.spec.ts src/processors/early-warning/weekly-digest.processor.spec.ts`
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/worker type-check`
  - `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint apps/api/src/common/services/tenant-module.service.ts apps/api/src/common/services/tenant-module.service.spec.ts apps/api/src/common/common.module.ts apps/api/src/common/guards/module-enabled.guard.ts apps/api/src/common/guards/module-enabled.guard.spec.ts apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/auth.service.spec.ts apps/api/src/modules/tenants/tenant-read.facade.ts apps/api/src/modules/tenants/tenant-read.facade.spec.ts apps/api/src/modules/tenants/tenants.service.ts apps/api/src/modules/tenants/tenants.service.spec.ts apps/worker/src/shared/worker-shared-services.module.ts apps/worker/src/worker.module.ts apps/worker/src/processors/pastoral/pastoral-cron-dispatch.processor.ts apps/worker/src/processors/pastoral/pastoral-cron-dispatch.processor.spec.ts apps/worker/src/processors/behaviour/cron-dispatch.processor.ts apps/worker/src/processors/behaviour/cron-dispatch.processor.spec.ts apps/worker/src/processors/early-warning/compute-daily.processor.ts apps/worker/src/processors/early-warning/compute-daily.processor.spec.ts apps/worker/src/processors/early-warning/weekly-digest.processor.ts apps/worker/src/processors/early-warning/weekly-digest.processor.spec.ts` (warnings only)
- Deploy: not deployed; server access was not granted for this pass.
- Notes: `TenantModuleService` now owns cached enabled-module reads for the API guard, `/me`, tenant module list reads, and worker gating examples. The service also exposes `invalidateCache`, which implementation 06 will wire into pub/sub invalidation. `rg ".tenantModule.findMany"` still finds pre-existing `staff_wellbeing` cron readers (`eap-refresh-check`, `workload-metrics`) and their test mocks; those are intentionally left as a W2 follow-up rather than expanding this W1 foundation commit into full staff-wellbeing enforcement.

---

### 06 — Redis cache + invalidation

#### Acceptance

- [x] `TenantModuleService.getEnabledModules` reads from Redis key `tenant_modules:{tenantId}` with 5-min TTL; falls back to DB and re-caches on miss.
- [x] On toggle (admin console flips a module): handler `DEL tenant_modules:{tenantId}` AND publishes `tenant_modules:invalidated` on Redis pub/sub channel with `{ tenantId, module_key, is_enabled }`.
- [x] Frontend has a subscriber (Option B) that polls `/me` every 60 seconds for authenticated tenant sessions so nav re-filters from refreshed `enabled_modules`.
- [x] Worker subscriber subscribes at boot and invalidates worker-side cache on receipt.
- [x] Backend test: toggling fires both the cache delete and the pub/sub event.
- [x] Frontend test: polling subscriber triggers `/me` refresh for authenticated tenant sessions and stays inactive while auth is unresolved.

#### Commits / CI / Deploy / Notes

- Commit: `feat(module-gating): add cache invalidation bus`
- CI: not run remotely; local checks passed:
  - `pnpm --filter @school/api test -- --runTestsByPath src/common/services/tenant-module-cache-bus.service.spec.ts src/common/services/tenant-module.service.spec.ts src/modules/tenants/tenants.service.spec.ts`
  - `pnpm --filter @school/worker test -- --runTestsByPath src/shared/tenant-module-cache-bus.subscriber.spec.ts`
  - `pnpm --filter @school/web test -- --runTestsByPath src/lib/realtime/tenant-module-subscriber.spec.ts`
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/worker type-check`
  - `pnpm --filter @school/web type-check`
  - `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint apps/api/src/common/services/tenant-module-cache-bus.service.ts apps/api/src/common/services/tenant-module-cache-bus.service.spec.ts apps/api/src/common/services/tenant-module.service.ts apps/api/src/common/common.module.ts apps/api/src/modules/tenants/tenants.service.ts apps/api/src/modules/tenants/tenants.service.spec.ts apps/worker/src/shared/worker-shared-services.module.ts apps/worker/src/shared/tenant-module-cache-bus.subscriber.ts apps/worker/src/shared/tenant-module-cache-bus.subscriber.spec.ts` (warnings only)
  - `(cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint src/lib/realtime/tenant-module-subscriber.ts src/lib/realtime/tenant-module-subscriber.spec.ts 'src/app/[locale]/layout.tsx' src/providers/auth-provider.tsx')`
- Deploy: not deployed; server access was not granted for this pass.
- Notes: Pub/sub publish failures are logged and do not block the toggle after the DB write, audit log, and local cache delete. The frontend uses the spec's Option B polling fallback because the app has no tenant-module push channel yet; Option A remains a later upgrade path.

---

### 07 — Test contract

#### Acceptance

- [x] `apps/api/test/module-gating-leakage.e2e-spec.ts` created with `describe.each(MODULE_REGISTRY.filter(default_enabled))` scaffolding. Per module: provision tenant, disable module, sample endpoints, assert 404 MODULE_DISABLED. Re-enable, assert non-MODULE_DISABLED. Skipped initially with TODO markers; specific modules opt in as their wave lands.
- [x] `apps/api/test/_helpers/module-gating-fixtures.ts` created with `disableModuleForTenant`, `enableModuleForTenant`, `createTenantWithModuleDisabled`, and `createTenantWithModuleEnabled`.
- [x] `apps/web/src/__tests__/module-gating/nav-filter.spec.ts` created with the same per-module pattern.
- [x] `apps/api/src/common/guards/module-enabled-coverage.spec.ts`: a STATIC analysis test that scans every controller file in `apps/api/src/modules/`. If a controller has `@ModuleEnabled`, it MUST have `ModuleEnabledGuard` in `@UseGuards`. Failures listed by file. Failure count is 0.
- [x] Worker scaffold `apps/worker/test/module-gating-worker.spec.ts` created with skipped per-processor fan-out cases.
- [x] All three test scaffolds are picked up by existing Jest patterns for API integration/unit, web unit, and worker unit jobs; no config change was needed.

#### Commits / CI / Deploy / Notes

- Commit: `test(module-gating): add gating contract scaffolds`
- CI: not run remotely; local checks passed:
  - `pnpm --filter @school/api test -- --runTestsByPath src/common/guards/module-enabled-coverage.spec.ts`
  - `pnpm --filter @school/web test -- --runTestsByPath src/__tests__/module-gating/nav-filter.spec.ts`
  - `pnpm --filter @school/worker test -- --runTestsByPath test/module-gating-worker.spec.ts` (suite intentionally skipped)
  - `(cd apps/api && npx jest --config jest.integration.config.js --runInBand --runTestsByPath test/module-gating-leakage.e2e-spec.ts)` (suite intentionally skipped; 36 skipped tests visible)
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/web type-check`
  - `pnpm --filter @school/worker type-check`
  - `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint apps/api/src/common/guards/module-enabled-coverage.spec.ts apps/api/test/_helpers/module-gating-fixtures.ts apps/api/test/module-gating-leakage.e2e-spec.ts apps/worker/test/module-gating-worker.spec.ts`
  - `(cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint src/__tests__/module-gating/nav-filter.spec.ts)`
- Deploy: not deployed; server access was not granted for this pass.
- Notes: `pnpm --filter @school/api run test:integration -- --runTestsByPath ...` cannot target a single file because `scripts/run-integration-tests.sh` only accepts `serial`, `parallel`, or `both`; the targeted integration pickup check was run directly through `jest.integration.config.js`.

---

### 08 — Documentation pass

#### Acceptance

- [x] `docs/architecture/feature-map.md`: every entry's section header gains a "**Gateable:** yes/no/partial" line; Quick Reference gains a Gateable column; deprecated `analytics` key is explicitly called out as unused.
- [x] `docs/architecture/danger-zones.md`: new entries DZ-MG-1 (default-deny on missing row), DZ-MG-2 (cache invalidation must fire on toggle), and DZ-MG-3 (webhooks ack/no-op when disabled).
- [x] `docs/architecture/pre-flight-checklist.md`: module gating checks added for registry/schema, controllers/guards, toggle cache invalidation, workers, danger zones, and after-change architecture updates.
- [x] `docs/architecture/state-machines.md`: `tenantModule.is_enabled` catalog entry added with audit log + Redis invalidation + pub/sub side effects.
- [x] `docs/runbooks/module-gating-operations.md` exists with toggle, verification, access-debugging, and emergency rollback procedures.
- [x] `2026-04-27` historical reference preserved in docs that already carried the Communications Overhaul baseline.

#### Commits / CI / Deploy / Notes

- Commit: `docs(module-gating): document gating operations`
- CI: not run remotely; local checks passed:
  - `(cd apps/api && npx jest --config jest.integration.config.js --runInBand --runTestsByPath test/architecture-docs.spec.ts)`
  - `pnpm --filter @school/api type-check`
  - `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint apps/api/test/architecture-docs.spec.ts`
- Deploy: not deployed; server access was not granted for this pass.
- Notes: `architecture-docs.spec.ts` now checks for Gateable annotations, DZ-MG entries, module-gating pre-flight language, and the `tenantModule.is_enabled` state-machine catalog note. The operations runbook includes emergency direct DB/Redis commands for operator use only when the admin UI is unavailable.

---

## Phase 2 — Wave W2 (verification + completion)

### 09 — Communications split

_See implementations/09-communications-split.md for full spec._

#### Acceptance

- [x] New module key `communications_outbound` added to registry (in spec 01); `communications` removed if not already.
- [x] Outbound controllers gated under `@ModuleEnabled('communications_outbound')`: announcements, notification-templates, notifications.controller's /admin/failed, email-domain, whatsapp-template.
- [x] Outbound processors guarded: dispatch-notifications, publish-announcement, announcement-approval-callback, retry-failed.
- [x] Inbox-related endpoints + processors NOT gated (notifications.controller list/unread/read; inbox-dispatch-channels.processor).
- [x] Webhook handlers ack 200 after valid signature and skip provider handoff/status mutation when `communications_outbound` is disabled.
- [x] Module-gating leakage test for `communications_outbound` passes.
- [ ] Smoke test on production NHQS: toggling `communications_outbound` off stops new announcements but inbox conversations still work.

#### Commits / CI / Deploy / Notes

- Commit: `feat(module-gating): split outbound communications gate`
- CI: not run remotely yet; local checks passed:
  - `pnpm --filter @school/api test -- --runTestsByPath src/modules/communications/webhooks/communications-webhooks.controller.spec.ts src/modules/communications/webhook.service.spec.ts src/common/guards/module-enabled-coverage.spec.ts`
  - `pnpm --filter @school/api test -- --runTestsByPath src/modules/communications/deliverability/email-domain.controller.spec.ts src/modules/communications/whatsapp-templates/whatsapp-template.controller.spec.ts src/modules/communications/announcements.controller.spec.ts src/modules/communications/notification-templates.controller.spec.ts src/modules/communications/notifications.controller.spec.ts`
  - `pnpm --filter @school/worker test -- --runTestsByPath src/processors/communications/dispatch-notifications.processor.spec.ts src/processors/communications/publish-announcement.processor.spec.ts src/processors/communications/announcement-approval-callback.processor.spec.ts src/processors/communications/retry-failed.processor.spec.ts`
  - `pnpm --filter @school/web test -- --runTestsByPath src/__tests__/module-gating/nav-filter.spec.ts`
  - `(cd apps/api && npx jest --config jest.integration.config.js --runInBand --runTestsByPath test/module-gating-leakage.e2e-spec.ts)`
  - API DI compile check with fake env (`DI OK`)
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/worker type-check`
  - `pnpm --filter @school/web type-check`
  - `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint ...` on the touched API/worker/web/test files (warnings only: pre-existing cross-module configuration imports in communications webhooks; dispatch processor max-lines)
- Deploy: not deployed yet; production smoke not run in this implementation commit.
- Notes: The repo uses the existing fetch-based `apiClient`, not Axios; no Axios path was added. The communications morph-bar hub stays visible because inbox is core, while the admin nav entry, announcements card, and outbound settings tiles are hidden behind `communications_outbound`. Legacy platform webhooks have no URL tenant, so the skip check runs after notification lookup in `WebhookService`; per-tenant Resend/Twilio webhooks check immediately after signature verification and event recording.

---

### 10 — Already-enforced verification

#### Acceptance

- [x] `pastoral`, `behaviour`, `sen`, `staff_wellbeing`: every controller verified to have `@ModuleEnabled` + `ModuleEnabledGuard`.
- [x] Frontend nav for these 4 modules: nav entries gain `moduleKey`; nav filter hides them when disabled.
- [x] Module-gating leakage tests pass for all 4.
- [ ] Smoke test on NHQS: each module can be toggled off and back on; nav updates immediately; no orphan endpoints reachable when off.

#### Commits / CI / Deploy / Notes

- Commit: `fix(module-gating): verify wellbeing module gates`
- CI: not run remotely yet; local checks passed:
  - `pnpm --filter @school/api test -- --runTestsByPath src/common/guards/module-enabled-coverage.spec.ts`
  - `pnpm --filter @school/web test -- --runTestsByPath src/__tests__/module-gating/nav-filter.spec.ts`
  - `(cd apps/api && npx jest --config jest.integration.config.js --runInBand --runTestsByPath test/module-gating-leakage.e2e-spec.ts)` (now active for `sen`, `behaviour`, `pastoral`, `staff_wellbeing`, plus prior `communications_outbound`)
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/web type-check`
  - `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint ...` on touched API/web/test files (warnings only: pre-existing cross-module imports in `behaviour-recognition.controller.ts`, plus the repo's Next pages-directory warning)
- Deploy: not deployed yet; production smoke not run in this implementation commit.
- Notes: Verification found four behaviour controllers that were not already gated (`behaviour-recognition`, `behaviour-interventions`, `behaviour-guardian-restrictions`, `behaviour-parent`), so this implementation includes the missing `@ModuleEnabled('behaviour')` / `ModuleEnabledGuard` wiring instead of staying frontend-only. Corrected the staff-wellbeing leakage probe from `/api/v1/wellbeing/surveys` to the actual `/api/v1/staff-wellbeing/surveys` route and included default-off `sen` in the active leakage cases.

---

### 11 — Partial-enforcement completion

#### Acceptance

- [x] `payroll`: `payroll-entries.controller.ts` gains `@ModuleEnabled('payroll')` + `ModuleEnabledGuard`.
- [x] `parent_inquiries`: cron processors (stale-inquiry-detection, inquiry-notification) gain tenant module check.
- [x] `ai_functions`: ungated AI surfaces gain `@ModuleEnabled('ai_functions')` (gradebook AI, scheduling ai-substitution, attendance scan, GDPR AI audit). Service-layer fallback in `AnthropicClientService.beforeRequest()`.
- [x] `website`: contact-submissions.controller adds `@ModuleEnabled('website')` for consistency. public-website + public-contact remain ungated (documented).
- [x] Module-gating leakage tests pass for `payroll`, `parent_inquiries`, `ai_functions`, `website`.
- [ ] Smoke test on NHQS: toggles verified for payroll, parent inquiries, AI functions, and website; public website still loads while admin website management is disabled.

#### Commits / CI / Deploy / Notes

- Commit: `fix(module-gating): complete partial enforcement gates`
- CI: not run remotely yet; local checks passed:
  - `pnpm --filter @school/api test -- --runTestsByPath src/modules/ai/anthropic-client.service.spec.ts src/modules/scheduling/ai-substitution.service.spec.ts src/modules/attendance/attendance-scan.service.spec.ts src/modules/gdpr/__tests__/ai-audit.service.spec.ts src/modules/gradebook/ai/ai-comments.service.spec.ts src/common/guards/module-enabled-coverage.spec.ts`
  - `pnpm --filter @school/api test -- --runTestsByPath src/modules/gradebook/ai/nl-query.service.spec.ts`
  - `pnpm --filter @school/worker test -- --runTestsByPath src/processors/communications/inquiry-notification.processor.spec.ts src/processors/communications/stale-inquiry-detection.processor.spec.ts`
  - `pnpm --filter @school/web test -- --runTestsByPath src/__tests__/module-gating/nav-filter.spec.ts`
  - `(cd apps/api && npx jest --config jest.integration.config.js --runInBand --runTestsByPath test/module-gating-leakage.e2e-spec.ts)` (now active for `payroll`, `parent_inquiries`, `ai_functions`, `website`, plus prior W2 modules)
  - API DI compile check with fake env (`DI OK`)
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/worker type-check`
  - `pnpm --filter @school/web type-check`
  - `NODE_OPTIONS=--max-old-space-size=14336 pnpm --filter @school/api exec eslint ...` on touched API/test files (warnings only: pre-existing cross-module imports/max-lines in AI/gradebook/reporting services and specs)
  - `pnpm --filter @school/worker exec eslint ...` on touched worker files
  - `pnpm --filter @school/web exec eslint ...` on touched web files
- Deploy: not deployed yet; production smoke not run in this implementation commit.
- Notes: `contact-submissions.controller.ts` was already gated before this pass; this implementation verified it and documented the public/admin website split on the public controllers. The parent-inquiries leakage probe was corrected from the stale `/api/v1/parent-inquiries` path to the actual `/api/v1/inquiries` controller route. `AnthropicClientService.createMessage` now requires a tenant id and checks `ai_functions` before creating provider requests; all current API call sites were updated to pass the tenant context so missed route-level gates fail closed.

---

## Phase 3 — Wave W3 (full enforcement pass)

### 12 — Admissions full enforcement

#### Acceptance

- [x] All 6 controllers under `apps/api/src/modules/admissions/` gain `@ModuleEnabled('admissions')` + `ModuleEnabledGuard` at class level.
- [x] Admissions cron processors gain tenant module check (skip on disabled).
- [x] Frontend `/admissions` routes hidden via nav filter.
- [x] Public admissions form (`public-admissions.controller.ts`) remains ungated; documented as intentional.
- [x] Module-gating leakage test passes for `admissions`.
- [ ] Smoke test on NHQS: admissions admin/parent views toggle off and back on; public admissions intake still accepts submissions while disabled.

#### Commits / CI / Deploy / Notes

- Commit: `feat(module-gating): enforce admissions module gate`
- CI: not run remotely yet; local checks passed:
  - `pnpm --filter @school/api test -- --runTestsByPath src/modules/admissions/admission-forms.controller.spec.ts src/modules/admissions/applications.controller.spec.ts src/modules/admissions/parent-applications.controller.spec.ts src/modules/admissions/public-admissions.controller.spec.ts src/common/guards/module-enabled-coverage.spec.ts`
  - `pnpm --filter @school/worker test -- --runTestsByPath src/processors/admissions/admissions-application-received.processor.spec.ts src/processors/admissions/admissions-application-withdrawn.processor.spec.ts src/processors/admissions/admissions-payment-link.processor.spec.ts src/processors/admissions/admissions-payment-expiry.processor.spec.ts`
  - `pnpm --filter @school/web test -- --runTestsByPath src/__tests__/module-gating/nav-filter.spec.ts`
  - `(cd apps/api && npx jest --config jest.integration.config.js --runInBand --runTestsByPath test/module-gating-leakage.e2e-spec.ts)` (now active for `admissions`, plus prior W2/W3 modules)
  - `(cd apps/api && npx jest --config jest.integration.config.js --runInBand --runTestsByPath test/public-admissions.e2e-spec.ts)`
  - API DI compile check with fake env (`DI OK`)
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/worker type-check`
  - `pnpm --filter @school/web type-check`
  - `NODE_OPTIONS=--max-old-space-size=14336 pnpm --filter @school/api lint` (warnings only: pre-existing cross-module imports/max-lines)
  - `pnpm --filter @school/worker lint` (warnings only: pre-existing max-lines)
  - `pnpm --filter @school/web lint` (warnings only: pre-existing i18n/hooks/max-lines)
- Deploy: not deployed yet; production smoke not run in this implementation commit.
- Notes: `public-admissions.controller.ts` stays intentionally ungated so prospective applicants can submit before they have any tenant relationship. `admissions-payment-expiry` is a cross-tenant cron with no tenant payload, so it skips disabled tenants inside the per-tenant loop rather than using a top-level payload check. The admissions leakage probe was corrected to the actual `/api/v1/admissions/dashboard-summary` route and paired with `/api/v1/applications`; the public admissions e2e suite now verifies intake remains open while the module is disabled.

---

### 13 — Gradebook full enforcement

#### Acceptance

- [x] All 14 controllers under `apps/api/src/modules/gradebook/` gain `@ModuleEnabled('gradebook')` + `ModuleEnabledGuard` at class level.
- [x] Gradebook cron processors gain tenant module check (gradebook-risk-detection, report-card-auto-generate, report-card-generation, mass-report-card-pdf, s3-report-card-storage-writer).
- [x] Frontend `/gradebook`, `/report-cards`, `/report-comments`, `/transcripts` hidden via nav filter when disabled.
- [x] Module-gating leakage test passes for `gradebook`.
- [x] Worker tests pass for the report-card pipeline (disabled -> no render/S3 upload).
- [ ] Smoke test on NHQS: gradebook/report cards/report comments/parent views toggle off and back on; previously published PDFs are not deleted and access is restored after re-enable.

#### Commits / CI / Deploy / Notes

- Commit: `feat(module-gating): enforce gradebook module gate`
- CI: not run remotely yet; local checks passed:
  - `pnpm --filter @school/api test -- --runTestsByPath src/common/guards/module-enabled.guard.spec.ts src/common/guards/module-enabled-coverage.spec.ts src/modules/gradebook/assessment-categories.controller.spec.ts src/modules/gradebook/gradebook-advanced.controller.spec.ts src/modules/gradebook/gradebook-insights.controller.spec.ts src/modules/gradebook/gradebook.controller.spec.ts src/modules/gradebook/grading-scales.controller.spec.ts src/modules/gradebook/parent-gradebook.controller.spec.ts src/modules/gradebook/transcripts.controller.spec.ts src/modules/gradebook/report-cards/report-card-overall-comments.controller.spec.ts src/modules/gradebook/report-cards/report-card-subject-comments.controller.spec.ts src/modules/gradebook/report-cards/report-card-teacher-requests.controller.spec.ts src/modules/gradebook/report-cards/report-card-tenant-settings.controller.spec.ts src/modules/gradebook/report-cards/report-cards-enhanced.controller.spec.ts src/modules/gradebook/report-cards/report-cards.controller.spec.ts src/modules/gradebook/report-cards/report-comment-windows.controller.spec.ts`
  - `pnpm --filter @school/worker test -- --runTestsByPath src/processors/gradebook/gradebook-risk-detection.processor.spec.ts src/processors/gradebook/report-card-auto-generate.processor.spec.ts src/processors/gradebook/report-card-generation.processor.spec.ts src/processors/gradebook/mass-report-card-pdf.processor.spec.ts src/processors/gradebook/s3-report-card-storage-writer.spec.ts`
  - `pnpm --filter @school/web test -- --runTestsByPath src/__tests__/module-gating/nav-filter.spec.ts`
  - `(cd apps/api && npx jest --config jest.integration.config.js --runInBand --runTestsByPath test/module-gating-leakage.e2e-spec.ts)` (now active for `gradebook`, plus prior W2/W3 modules)
  - API DI compile check with fake env (`DI OK`)
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/worker type-check`
  - `pnpm --filter @school/web type-check`
  - `NODE_OPTIONS=--max-old-space-size=14336 pnpm --filter @school/api lint` (warnings only: pre-existing cross-module imports/max-lines)
  - `pnpm --filter @school/worker lint` (warnings only: pre-existing max-lines)
  - `pnpm --filter @school/web lint` (warnings only: pre-existing i18n/hooks/max-lines)
- Deploy: not deployed yet; production smoke not run in this implementation commit.
- Notes: `ModuleEnabledGuard` now enforces all class and method `@ModuleEnabled` metadata instead of letting method metadata override the class. This preserves the intended double gate for gradebook AI paths: `gradebook` must be enabled and `ai_functions` must also be enabled. The gradebook leakage probe uses actual routes (`/api/v1/gradebook/assessments`, `/api/v1/report-cards`, `/api/v1/transcripts/students/:studentId`) rather than the stale `/api/v1/gradebook/grades` path. Parent gradebook/report-card routes are class-gated with the same `gradebook` toggle as staff/admin routes; parent nav has no dedicated gradebook entry in the current config.

---

### 14 — Finance full enforcement

#### Acceptance

- [x] All 12 admin/parent finance controllers under `apps/api/src/modules/finance/` gain `@ModuleEnabled('finance')` + `ModuleEnabledGuard` at class level.
- [x] Stripe webhook controller (`stripe-webhook.controller.ts`) remains ungated; handler verifies the Stripe signature, checks tenant module state inline, and silently no-ops if disabled (200 to Stripe, log skip).
- [x] Finance cron processors gain tenant module check (overdue-detection, invoice-approval-callback, stripe-refund-reconciliation).
- [x] Frontend `/finance` hidden via nav filter when disabled; parent dashboard finances tab and parent finance prefetch are hidden/skipped when disabled.
- [x] Module-gating leakage test passes for `finance`.

#### Commits / CI / Deploy / Notes

- Commit: `feat(module-gating): enforce finance module gate`
- CI: not run remotely yet; local checks passed:
  - `pnpm --filter @school/api test -- --runTestsByPath src/modules/finance/stripe-webhook.controller.spec.ts src/common/guards/module-enabled-coverage.spec.ts`
  - `pnpm --filter @school/worker test -- --runTestsByPath src/processors/finance/overdue-detection.processor.spec.ts src/processors/finance/invoice-approval-callback.processor.spec.ts src/processors/finance/stripe-refund-reconciliation.processor.spec.ts src/processors/finance/finance-queue.processor.spec.ts`
  - `pnpm --filter @school/web test -- --runTestsByPath src/__tests__/module-gating/nav-filter.spec.ts`
  - `(cd apps/api && npx jest --config jest.integration.config.js --runInBand --runTestsByPath test/module-gating-leakage.e2e-spec.ts --testNamePattern=finance)`
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/worker type-check`
  - `pnpm --filter @school/web type-check`
  - `NODE_OPTIONS=--max-old-space-size=14336 pnpm exec eslint ...` on touched API/worker/web/test files (warnings only: pre-existing cross-module imports/max-lines plus the repo's Next pages-directory warning)
- Deploy: not deployed yet; production smoke not run in this implementation commit.
- Notes: `stripe-webhook.controller.ts` intentionally has no `@ModuleEnabled` decorator. `StripeService` now exposes `verifyWebhookEvent` and `processWebhookEvent` so the controller can verify Stripe's signature before the finance-module skip and still return 200 for disabled tenants. The parent-facing finance impact is enforced by hiding the parent dashboard finances tab and skipping parent finance summary prefetch when `finance` is disabled. No code touched `tenant_sequences`; local/prod sequence SELECT verification was not run because this pass avoided disruptive module off/on production toggles.

---

### 15 — Homework full enforcement

#### Acceptance

- [ ] All 6 controllers under `apps/api/src/modules/homework/` gain `@ModuleEnabled('homework')` + `ModuleEnabledGuard` at class level.
- [ ] Homework cron processors gain tenant module check (completion-reminder, digest-homework, generate-recurring, homework-queue, overdue-detection).
- [ ] Frontend `/homework`, `/learning/homework` hidden via nav filter when disabled.
- [ ] Module-gating leakage test passes for `homework`.

#### Commits / CI / Deploy / Notes

_(populate when implementing)_

---

### 16 — Auto-scheduling full enforcement

#### Acceptance

- [ ] All 13 controllers under `apps/api/src/modules/scheduling/` and `apps/api/src/modules/scheduling-runs/` gain `@ModuleEnabled('auto_scheduling')` + `ModuleEnabledGuard` at class level.
- [ ] `scheduling-public.controller.ts` — decision documented (recommend keep ungated since publicly published timetables should remain visible) — confirmed in spec.
- [ ] Scheduling worker processors gain tenant module check (SolverV2Processor, ExamSolverProcessor, SchedulingStaleReaperProcessor).
- [ ] Frontend `/scheduling/*` hidden via nav filter when disabled.
- [ ] Module-gating leakage test passes for `auto_scheduling`.

#### Commits / CI / Deploy / Notes

_(populate when implementing)_

---

### 17 — Compliance / regulatory split

#### Acceptance

- [ ] `compliance_advanced` added to registry; `compliance` (the old gateable key) is NOT in the gateable registry (it's promoted to core).
- [ ] `regulatory.controller.ts` 67 endpoints split: DES/TUSLA/PPOD/CBA paths gated `@ModuleEnabled('compliance_advanced')` at method level; core paths remain ungated.
- [ ] `retention-policies.controller.ts`: advanced policy methods gated; basic policies ungated.
- [ ] `gdpr/*.controller.ts` (all 7): remain ungated (legal requirement).
- [ ] Frontend: `/settings/compliance` always visible; `/settings/regulatory` always visible; sub-sections (DES, TUSLA) conditional on `compliance_advanced`.
- [ ] Module-gating leakage test passes for `compliance_advanced`.

#### Commits / CI / Deploy / Notes

_(populate when implementing)_

---

## Phase 4 — Wave W4 (new toggles)

### 18 — New toggle: leave

#### Acceptance

- [ ] `leave` added to registry with default_enabled=true, category='operations'.
- [ ] `apps/api/src/modules/leave/leave-requests.controller.ts` and `payroll-attendance.controller.ts` gain `@ModuleEnabled('leave')` + `ModuleEnabledGuard`.
- [ ] Frontend `/leave`, `/settings/leave-types`, `/scheduling/leave-requests` hidden via nav filter when disabled.
- [ ] Module-gating leakage test passes for `leave`.

#### Commits / CI / Deploy / Notes

_(populate when implementing)_

---

### 19 — New toggle: school_closures

#### Acceptance

- [ ] `school_closures` added to registry with default_enabled=true, category='operations'.
- [ ] `apps/api/src/modules/school-closures/school-closures.controller.ts` gains `@ModuleEnabled('school_closures')` + `ModuleEnabledGuard`.
- [ ] Frontend `/settings/school-closures` hidden via nav filter when disabled.
- [ ] Documented: scheduling/attendance/finance services that READ closures are unaffected by the toggle (closures continue to be honoured if previously set; only the management UI is hidden).
- [ ] Module-gating leakage test passes for `school_closures`.

#### Commits / CI / Deploy / Notes

_(populate when implementing)_

---

### 20 — Trips placeholder + analytics ghost-key cleanup

#### Acceptance

- [ ] `analytics` key removed from any remaining seed/test reference (registry already excludes it).
- [ ] `trips` confirmed NOT in registry (it's a stub; deferred).
- [ ] If trips will not be implemented in the next 6 months, document in feature-map that the trips stub exists for inbox audience-provider only and is not gateable.
- [ ] No code references `tenantModule.module_key = 'analytics'` anywhere in the codebase.

#### Commits / CI / Deploy / Notes

_(populate when implementing)_

---

## Phase 5 — Wave W5 (closure)

### 21 — Migration runbook for existing tenants

#### Acceptance

- [ ] `Module Gating/migration-runbook.md` documents: pre-migration verification (SQL count assertion), execution command, post-migration verification (every tenant has 20 rows), rollback plan (delete the new tenantModule rows; the schema column stays).
- [ ] Audit-log row inserted for the migration: who ran it, when, with the registry snapshot.
- [ ] NHQS verified post-migration: dashboard loads normally, all expected nav entries visible, no toast/redirect storms.
- [ ] 4 stress tenants verified.

#### Commits / CI / Deploy / Notes

_(populate when implementing)_

---

### 22 — Admin console handoff spec

#### Acceptance

- [ ] `Module Gating/admin-console-handoff.md` documents: existing `POST /v1/admin/tenants/:id/modules/toggle` endpoint shape; `/me` payload shape; audit-log schema for module changes; the disabled landing page contract; the cache invalidation pub/sub channel name + payload shape.
- [ ] References the platform admin dashboard spec (`docs/superpowers/specs/2026-04-01-platform-admin-dashboard-design.md`) and notes which sections it satisfies.
- [ ] Documents what the dashboard team must build (the UI itself; bulk operations; presets; warnings on dependent modules) and what they get for free (gating works; toggling fires audit + invalidation; frontend reacts to changes).

#### Commits / CI / Deploy / Notes

_(populate when implementing)_

---

## Summary metrics (live)

| Metric                                 | Current                                                                          | Target (post-W5)                 |
| -------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------- |
| Gateable modules in registry           | 0                                                                                | 20                               |
| Modules with full API enforcement      | 6 (pastoral, behaviour, sen, staff_wellbeing, parent_inquiries, payroll-partial) | 20                               |
| Modules with frontend nav gating       | 0                                                                                | 20                               |
| Modules with worker gating             | 3 (pastoral, behaviour, early_warning)                                           | every gateable module with crons |
| Existing tenants migrated              | 0                                                                                | 5 (NHQS + 4 stress)              |
| Module-gating leakage tests            | 0                                                                                | 20                               |
| Production deploys for this initiative | 0                                                                                | ~22 (per spec)                   |

---

## Quick reference

### Verification commands

```bash
# Verify a tenant has all 20 module rows
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM tenant_modules WHERE tenant_id = '<id>';"
# Expected: 20

# List a tenant's enabled modules
psql "$DATABASE_URL" -c "SELECT module_key, is_enabled FROM tenant_modules WHERE tenant_id = '<id>' ORDER BY module_key;"

# Run module-gating leakage tests for one module
cd apps/api && npx jest --config jest.integration.config.js \
  --testPathPattern="module-gating-leakage" \
  --testNamePattern="<module_key>"

# Toggle a module via API (replace with real platform_owner JWT)
curl -X POST https://nhqs.edupod.app/api/v1/admin/tenants/<id>/modules/toggle \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{ "module_key": "gradebook", "is_enabled": false }'
```

### Per-tenant module flip (production)

```bash
# Recommended: through the admin console UI (post-W5).
# Emergency: direct DB update (only with operator approval — does NOT fire cache invalidation)
psql "$DATABASE_URL" -c "UPDATE tenant_modules SET is_enabled = false WHERE tenant_id = '<id>' AND module_key = '<key>';"
# Then manually invalidate the cache:
redis-cli DEL "tenant_modules:<id>"
```

### Rollback (if a deployed module's gating regresses production)

```bash
# Re-enable the module for all tenants (emergency unblock)
psql "$DATABASE_URL" -c "UPDATE tenant_modules SET is_enabled = true WHERE module_key = '<key>';"
# Invalidate caches for all tenants
redis-cli --scan --pattern "tenant_modules:*" | xargs redis-cli DEL
```

---

## Lessons learned

_(populate as the work proceeds)_
