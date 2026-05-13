# Implementation 06 — Redis Cache + Pub/Sub Invalidation

> **Phase:** 1 — Foundation
> **Wave:** W1
> **Depends on:** 03 (guard), 04 (frontend), 05 (TenantModuleService)
> **Deploys:** API restart + worker restart + web rebuild (subscriber)
> **Model:** Opus 4.7

---

## Goal

When the admin console flips a tenant's module toggle, every consumer of the cached module state must see the update within seconds — without restarting any service. After this ships:

- Toggle handler invalidates the per-tenant Redis cache key.
- Toggle handler publishes `tenant_modules:invalidated` on Redis pub/sub with `{ tenantId, module_key, is_enabled }`.
- Web frontend subscribes (via the existing comms-cache-bus pattern) and refetches `/me` for the affected user's session.
- Worker also subscribes (so any in-flight cron-dispatch picks up the change on next iteration).

This is the propagation layer. Implementation 05 set up the read; this spec sets up the write notification.

---

## Critical safety constraints

- **Existing pub/sub pattern reused.** `apps/api/src/modules/communications/comms-cache-bus.service.ts` is the prior art. Follow its pattern (subscribe at boot, dispatch handler per channel, fail-safe on error).
- **Pub/sub failures don't block the toggle.** If Redis pub/sub fails, the toggle still completes (DB write + cache delete already happened). Log the publish failure but return success.
- **No assumed delivery.** Pub/sub is fire-and-forget. The 5-minute cache TTL is the worst-case bound for staleness. The pub/sub is a best-effort fast-path.
- **Frontend subscriber is per-user.** The web app's subscriber receives all tenant invalidations but only triggers a refetch if the event's `tenantId` matches the current user's tenant.

---

## Files to create / modify

### Create

- **`apps/api/src/common/services/tenant-module-cache-bus.service.ts`** — the publisher. Wraps the publish call. ~50 lines.
- **`apps/web/src/lib/realtime/tenant-module-subscriber.ts`** — the web subscriber. Reads from the existing realtime channel infrastructure (or sets up a new SSE/WebSocket connection if none exists; check current implementation). ~80 lines.
- **`apps/worker/src/shared/tenant-module-cache-bus.subscriber.ts`** — the worker subscriber. Listens to the channel and calls `TenantModuleService.invalidateCache(tenantId)` on receipt. ~40 lines.

### Modify

- **`apps/api/src/modules/tenants/tenants.controller.ts`** (or wherever the existing toggle endpoint `POST /v1/admin/tenants/:id/modules/toggle` lives) — after writing the DB update, call:
  1. `TenantModuleService.invalidateCache(tenantId)` — local Redis del
  2. `TenantModuleCacheBusService.publishInvalidation(tenantId, moduleKey, isEnabled)` — pub/sub publish
  3. Existing audit-log call — already in place; verify still works
- **`apps/api/src/common/common.module.ts`** — provide `TenantModuleCacheBusService`.
- **`apps/web/src/app/[locale]/layout.tsx`** (or root client provider) — mount the subscriber.
- **`apps/worker/src/main.ts`** — bootstrap the worker subscriber alongside the existing comms-cache-bus subscriber.

---

## Publisher skeleton

```ts
// apps/api/src/common/services/tenant-module-cache-bus.service.ts

import { Injectable, Logger, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import type { ModuleKey } from '@school/shared';

export interface TenantModuleInvalidationEvent {
  tenantId: string;
  moduleKey: ModuleKey;
  isEnabled: boolean;
  timestamp: number;
}

@Injectable()
export class TenantModuleCacheBusService {
  static readonly CHANNEL = 'tenant_modules:invalidated';
  private readonly logger = new Logger(TenantModuleCacheBusService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async publishInvalidation(
    tenantId: string,
    moduleKey: ModuleKey,
    isEnabled: boolean,
  ): Promise<void> {
    const event: TenantModuleInvalidationEvent = {
      tenantId,
      moduleKey,
      isEnabled,
      timestamp: Date.now(),
    };
    try {
      await this.redis.publish(TenantModuleCacheBusService.CHANNEL, JSON.stringify(event));
    } catch (err) {
      this.logger.warn(
        `Failed to publish tenant_modules invalidation for ${tenantId}/${moduleKey}: ${(err as Error).message}`,
      );
      // Best-effort. The 5-min TTL is the worst-case bound.
    }
  }
}
```

## Worker subscriber skeleton

```ts
// apps/worker/src/shared/tenant-module-cache-bus.subscriber.ts

import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { TenantModuleService } from '../../../api/src/common/services/tenant-module.service';
import { TenantModuleCacheBusService } from '../../../api/src/common/services/tenant-module-cache-bus.service';
import type { TenantModuleInvalidationEvent } from '../../../api/src/common/services/tenant-module-cache-bus.service';

@Injectable()
export class TenantModuleCacheBusSubscriber implements OnModuleInit {
  private readonly logger = new Logger(TenantModuleCacheBusSubscriber.name);

  constructor(
    @Inject('REDIS_SUBSCRIBER_CLIENT') private readonly subscriber: Redis,
    private readonly tenantModule: TenantModuleService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.subscriber.subscribe(TenantModuleCacheBusService.CHANNEL);
    this.subscriber.on('message', async (channel, raw) => {
      if (channel !== TenantModuleCacheBusService.CHANNEL) return;
      try {
        const event = JSON.parse(raw) as TenantModuleInvalidationEvent;
        await this.tenantModule.invalidateCache(event.tenantId);
        this.logger.log(
          `Invalidated worker cache for tenant ${event.tenantId} (module ${event.moduleKey})`,
        );
      } catch (err) {
        this.logger.warn(`Failed to handle tenant_modules invalidation: ${(err as Error).message}`);
      }
    });
  }
}
```

## Frontend subscriber

The frontend pattern depends on whether the existing realtime infrastructure pushes events to clients (e.g., via Server-Sent Events or WebSocket) or whether the admin console toggle is the only trigger and the user makes a fresh API call within seconds anyway.

**Option A (preferred if SSE/WebSocket exists):** Subscribe to the channel server-side, push relevant events to the user's open SSE/WebSocket connection, frontend triggers a `/me` refetch on receipt.

**Option B (pragmatic fallback if no realtime exists yet):** Frontend polls `/me` every 60 seconds via a hook. On change in `enabled_modules`, refilter nav. This is a simpler interim solution; can swap to Option A later.

For this implementation: **start with Option B** because it avoids introducing a new WebSocket dependency. Document Option A as a follow-up in the migration runbook (implementation 21).

```ts
// apps/web/src/lib/realtime/tenant-module-subscriber.ts (Option B)

'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenantContext } from '@/lib/contexts/tenant-context';

const POLL_INTERVAL_MS = 60_000;

export function TenantModuleSubscriber() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenantContext();

  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [tenantId, queryClient]);

  return null; // mount-only side effect
}
```

Mount this component in the school/parent layout near the morph-shell so it's loaded for every authenticated session.

---

## Acceptance

- [ ] `TenantModuleCacheBusService.publishInvalidation` writes a JSON event to Redis pub/sub channel `tenant_modules:invalidated`.
- [ ] Toggle handler at `POST /v1/admin/tenants/:id/modules/toggle` calls (in order): DB write → audit-log → invalidateCache → publishInvalidation. Returns 200 with new state.
- [ ] Worker subscriber subscribes at boot, invalidates worker-side cache on receipt.
- [ ] Frontend subscriber (Option B for now) polls `/me` every 60s; on change in `enabled_modules`, the nav re-filters automatically (React Query cache invalidation triggers re-render).
- [ ] Manual e2e: toggle a module via the API, observe within ≤60s that nav updates in an open browser tab without page refresh.
- [ ] Pub/sub failure path: if `redis.publish` throws, the toggle still returns 200 (the DB + cache del already succeeded). A warning is logged. Verified via mock.
- [ ] Backend test: toggling fires both `invalidateCache` (verified via spy) and `publishInvalidation` (verified by counting Redis publishes).

---

## Notes

- Option B (60s polling) is intentional pragmatism for W1. The admin console UX is acceptable with up-to-60s lag for toggle propagation. If users complain, swap to Option A (push-based) in a follow-up. The trade-off is documented in implementation 21.
- The pub/sub channel name `tenant_modules:invalidated` is namespaced and won't collide with existing channels. Reuse the same Redis instance.
- Worker has TWO Redis clients: one for BullMQ (job operations) and one for general cache. The subscriber uses the cache client. Verify the existing convention (`REDIS_CLIENT` vs `REDIS_SUBSCRIBER_CLIENT`).
- The 5-minute cache TTL remains the safety net. Even if pub/sub completely fails, all caches refresh within 5 minutes.
- Audit-log entry already exists in the toggle handler (it was written before this spec). Confirm during implementation that it logs: `tenant_id`, `module_key`, `previous_state`, `new_state`, `actor_user_id`, `actor_role`.
