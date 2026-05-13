# Implementation 05 — Worker Gating Layer

> **Phase:** 1 — Foundation
> **Wave:** W1
> **Depends on:** 01 (registry), 03 (guard refactor uses TenantModuleService)
> **Deploys:** API restart + worker restart
> **Model:** Opus 4.7 (foundation; both API and worker import the new service)

---

## Goal

Introduce a single `TenantModuleService` (used by the API guard, the worker, and the `/me` endpoint) that wraps `tenantModule` table reads + Redis cache. Document the two worker patterns (cron-dispatch tenant-skip, job-level guard) and provide template code so per-module worker specs can plug in with minimal repetition.

After this ships, every worker file that needs to consult tenant module state has a single import + a single call to make. Per-module worker enforcement (W2/W3) just calls `TenantModuleService.isEnabled(tenantId, key)` at the right place in the cron dispatcher or processor.

---

## Critical safety constraints

- **Single source of truth for the read.** The API guard, the worker patterns, and the `/me` endpoint all consult `TenantModuleService.isEnabled` and `TenantModuleService.getEnabledModules`. No module should read `tenantModule` directly from Prisma elsewhere.
- **Worker imports must work without dragging the full Nest module graph.** The worker bootstraps its own NestJS app with a thin imports list. The new service goes in `apps/api/src/common/services/` (so it lives in the API namespace) but is exported via a clean `WorkerSharedServicesModule` for worker consumption.
- **Cache reads in the worker must use the same Redis key as the API.** Cross-process cache coherency: when the admin console flips a toggle, both API and worker re-read on next request. Implementation 06 covers the invalidation publish.
- **Backwards compat for existing per-tenant cron dispatchers.** `pastoral` and `behaviour` already do tenant iteration with module checks. Their existing checks switch to the new service in this spec without changing behaviour.

---

## Files to create / modify

### Create

- **`apps/api/src/common/services/tenant-module.service.ts`** — the service. ~120 lines including JSDoc.
- **`apps/api/src/common/services/tenant-module.service.spec.ts`** — unit tests (cache hit, cache miss, multiple keys, invalidation).
- **`apps/worker/src/shared/worker-shared-services.module.ts`** — wraps `TenantModuleService` for worker DI without depending on the full API module graph.
- **`docs/runbooks/worker-module-gating-patterns.md`** — short doc explaining the two patterns + when to use each, with example snippets.

### Modify

- **`apps/api/src/common/guards/module-enabled.guard.ts`** — switch from direct Prisma read to `TenantModuleService.isEnabled`. The SAFETY comment from spec 03 stays.
- **`apps/api/src/common/common.module.ts`** (or wherever shared services are registered) — provide + export `TenantModuleService`.
- **`apps/api/src/modules/auth/auth.controller.ts`** (or wherever `/me` lives) — inject `TenantModuleService` and use it for the new `enabled_modules` field.
- **Existing pastoral cron dispatcher** (`apps/worker/src/processors/pastoral/cron-dispatch.processor.ts`) — refactor to use `TenantModuleService.isEnabled('pastoral', tenantId)` instead of inline `tenantModule.findFirst`.
- **Existing behaviour cron dispatcher** (`apps/worker/src/processors/behaviour/cron-dispatch.processor.ts`) — same refactor.
- **Existing early_warning cron dispatcher** — same refactor.

---

## Service skeleton

```ts
// apps/api/src/common/services/tenant-module.service.ts

import { Injectable, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import type { PrismaClient } from '@prisma/client';
import { type ModuleKey, MODULE_KEYS_ARRAY, isModuleKey } from '@school/shared';

@Injectable()
export class TenantModuleService {
  private static readonly CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
  private static readonly CACHE_PREFIX = 'tenant_modules:';

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  /**
   * Returns the array of enabled module keys for the given tenant.
   * Cached in Redis with 5-minute TTL. Cache is invalidated by the
   * admin console toggle handler (see implementation 06).
   *
   * SAFETY: a module key absent from the returned array is treated
   * as DISABLED. This includes the case where the tenantModule row
   * is missing entirely (default-deny). The migration backfill
   * (implementation 02) ensures every tenant has a row for every
   * registry key, so missing rows in production indicate a bug.
   */
  async getEnabledModules(tenantId: string): Promise<ModuleKey[]> {
    const cacheKey = `${TenantModuleService.CACHE_PREFIX}${tenantId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ModuleKey[];
    }

    const rows = await this.prisma.tenantModule.findMany({
      where: { tenant_id: tenantId, is_enabled: true },
      select: { module_key: true },
    });

    const keys = rows.map((r) => r.module_key).filter(isModuleKey); // drop any non-canonical keys defensively

    await this.redis.setex(cacheKey, TenantModuleService.CACHE_TTL_SECONDS, JSON.stringify(keys));
    return keys;
  }

  /**
   * Returns true if the named module is enabled for the tenant.
   * Convenience wrapper over getEnabledModules.
   */
  async isEnabled(tenantId: string, key: ModuleKey): Promise<boolean> {
    const enabled = await this.getEnabledModules(tenantId);
    return enabled.includes(key);
  }

  /**
   * Invalidate the per-tenant cache. Called by the admin console toggle
   * handler. The pub/sub publish for cross-process notification is
   * handled separately (implementation 06).
   */
  async invalidateCache(tenantId: string): Promise<void> {
    const cacheKey = `${TenantModuleService.CACHE_PREFIX}${tenantId}`;
    await this.redis.del(cacheKey);
  }

  /**
   * Returns true if every module in the registry has a row for this
   * tenant. Used by the deploy verification step + admin console
   * health check.
   */
  async assertCompleteness(tenantId: string): Promise<{ complete: boolean; missing: ModuleKey[] }> {
    const rows = await this.prisma.tenantModule.findMany({
      where: { tenant_id: tenantId },
      select: { module_key: true },
    });
    const present = new Set(rows.map((r) => r.module_key));
    const missing = MODULE_KEYS_ARRAY.filter((k) => !present.has(k));
    return { complete: missing.length === 0, missing };
  }
}
```

## Worker shared services module

```ts
// apps/worker/src/shared/worker-shared-services.module.ts

import { Module } from '@nestjs/common';
import { TenantModuleService } from '../../../api/src/common/services/tenant-module.service';
// Worker already wires its own PRISMA_CLIENT + REDIS_CLIENT providers.
// This module re-uses them by re-providing TenantModuleService as
// a worker-scoped provider.

@Module({
  providers: [TenantModuleService],
  exports: [TenantModuleService],
})
export class WorkerSharedServicesModule {}
```

(Confirm the exact relative import path during implementation; the worker may have a different convention for cross-app imports — adjust to follow the project's existing pattern.)

## Pattern A — cron dispatcher tenant-skip

```ts
// Template — apply to cron-dispatch processors that fan out per-tenant.

@Processor(QUEUE_NAMES.PASTORAL)
export class PastoralCronDispatchProcessor extends WorkerHost {
  constructor(
    private readonly tenantModule: TenantModuleService,
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== PASTORAL_CRON_DISPATCH_DAILY_JOB) return;

    const activeTenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    for (const { id: tenantId } of activeTenants) {
      const enabled = await this.tenantModule.isEnabled(tenantId, 'pastoral');
      if (!enabled) {
        this.logger.log(`Skipping pastoral cron dispatch for tenant ${tenantId} — module disabled`);
        continue;
      }
      await this.fanoutQueue.add(
        PASTORAL_OVERDUE_ACTIONS_JOB,
        { tenant_id: tenantId },
        { jobId: `pastoral:overdue:${tenantId}:${Date.now()}` },
      );
    }
  }
}
```

## Pattern B — job-level guard (event-driven processors)

```ts
// Template — apply to processors that handle one-off events
// (webhooks, user-triggered jobs).

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class DispatchNotificationsProcessor extends WorkerHost {
  constructor(private readonly tenantModule: TenantModuleService) { super(); }

  async process(job: Job<{ tenant_id: string; ... }>): Promise<void> {
    const enabled = await this.tenantModule.isEnabled(job.data.tenant_id, 'communications_outbound');
    if (!enabled) {
      this.logger.log(`Dropping outbound notification for tenant ${job.data.tenant_id} — module disabled`);
      return; // ack as success — disabled state is normal, not an error
    }
    // … existing dispatch logic …
  }
}
```

---

## Acceptance

- [ ] `TenantModuleService` exists with `getEnabledModules`, `isEnabled`, `invalidateCache`, `assertCompleteness`.
- [ ] Service unit tests cover: cache hit, cache miss → DB read → re-cache, isEnabled true/false, invalidateCache deletes the key, assertCompleteness lists missing keys.
- [ ] `WorkerSharedServicesModule` exposes the service for worker consumption.
- [ ] Existing `module-enabled.guard.ts` refactored to inject and use `TenantModuleService` instead of direct Prisma read. SAFETY comment retained.
- [ ] `/me` endpoint uses `TenantModuleService.getEnabledModules` to populate `enabled_modules`.
- [ ] Pastoral, behaviour, early_warning cron dispatchers refactored to use the service. Existing cron tests still pass.
- [ ] `docs/runbooks/worker-module-gating-patterns.md` documents Pattern A + Pattern B with the snippets above.
- [ ] Static analysis (lint or grep) confirms no `prisma.tenantModule.findMany` outside `TenantModuleService` (sole source of truth).

---

## Notes

- The Redis cache TTL of 5 minutes is a pragmatic balance: short enough that a missed pub/sub invalidation only causes brief drift; long enough that high-traffic API requests don't hammer Postgres. Most reads will be cache hits.
- The `assertCompleteness` method is used in two places: (1) implementation 02's migration verification step, (2) implementation 22's admin console health check (will surface "tenant has missing module rows — re-run backfill").
- The worker shared services module name is intentionally separate from existing worker modules — it represents code that is logically owned by the API but consumed by the worker. If the project has an existing convention for this, follow it.
- Pattern A vs Pattern B choice: cron-dispatchers (one job → many tenants) use Pattern A so the SKIP is explicit per-tenant. Event-driven processors (webhook callbacks, user actions) use Pattern B so the SKIP happens inline at the job. Both ack as success — disabled is not an error.
