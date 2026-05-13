# Implementation 07 — Test Contract

> **Phase:** 1 — Foundation
> **Wave:** W1
> **Depends on:** 01–06
> **Deploys:** No prod deploy; CI changes only
> **Model:** Opus 4.7 / Sonnet 4.6 acceptable

---

## Goal

Establish the three test categories that every per-module enforcement spec (W2/W3/W4) must satisfy before merging. Create scaffolds so each per-module spec can opt in without re-inventing the test pattern. Add a static-analysis test that catches "I added @ModuleEnabled but forgot to put `ModuleEnabledGuard` in @UseGuards" — the most common class of bug this initiative will face.

---

## Critical safety constraints

- **Scaffolds, not full coverage.** This spec ships the test files with `describe.each` over the registry but every `it` block is `it.skip` initially. As each per-module spec lands (W2/W3/W4), it un-skips its own tests and verifies they pass.
- **Static analysis must be a hard gate.** The "forgot the guard" check runs in CI and fails the build if any controller has `@ModuleEnabled` without `ModuleEnabledGuard` in `@UseGuards`.
- **Tests use the existing fixture builder.** No new tenant-creation infrastructure. Use `createTenantFixture` from `apps/api/test/tenant-fixture.builder.ts` (already imports the registry per implementation 02) and toggle modules via direct DB update + cache invalidation.

---

## Files to create / modify

### Create

- **`apps/api/test/module-gating-leakage.e2e-spec.ts`** — per-module integration test scaffold. ~150 lines.
- **`apps/api/test/_helpers/module-gating-fixtures.ts`** — helper functions: `createTenantWithModuleDisabled(prisma, key)`, `createTenantWithModuleEnabled(prisma, key)`, `disableModuleForTenant(prisma, tenantId, key, redis)` (toggles + invalidates).
- **`apps/api/src/common/guards/module-enabled-coverage.spec.ts`** — static analysis test. ~80 lines.
- **`apps/web/src/__tests__/module-gating/nav-filter.spec.ts`** — frontend nav filter test scaffold. ~100 lines.
- **`apps/worker/test/module-gating-worker.spec.ts`** — worker tenant-skip test scaffold. ~80 lines.

### Modify

- **`apps/api/jest.integration.config.js`** — ensure `module-gating-leakage.e2e-spec.ts` is picked up by the integration runner.
- **`apps/api/jest.config.js`** — ensure `module-enabled-coverage.spec.ts` runs in the unit test job.
- **`scripts/run-integration-tests.sh`** — `module-gating-leakage` is added to the parallel suite (it's per-tenant fixture, no shared state).

---

## Module-gating leakage e2e (scaffold)

```ts
// apps/api/test/module-gating-leakage.e2e-spec.ts

/**
 * Per-module gating leakage tests.
 *
 * For each gateable module, verify:
 *   1. With the module DISABLED, sample endpoints return 404 MODULE_DISABLED.
 *   2. With the module ENABLED (default), sample endpoints return 200 (or
 *      whatever happy-path status is appropriate for the endpoint).
 *
 * As each per-module enforcement spec lands (W2/W3/W4), un-skip its block
 * and ensure the assertions pass on its target endpoints.
 */
import { type INestApplication } from '@nestjs/common';
import { type PrismaClient } from '@prisma/client';
import request from 'supertest';
import { MODULE_REGISTRY, type ModuleKey } from '@school/shared';
import { closeTestApp, createTestApp, login } from './helpers';
import {
  createTenantFixture,
  deleteTenantFixture,
  type TenantFixture,
} from './tenant-fixture.builder';
import { disableModuleForTenant, enableModuleForTenant } from './_helpers/module-gating-fixtures';

interface ModuleGatingProbe {
  key: ModuleKey;
  // Sample endpoints to probe. List 2-3 representative GET routes.
  probes: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }>;
}

const PROBES: ReadonlyArray<ModuleGatingProbe> = [
  // W2 — already-enforced
  { key: 'pastoral', probes: [{ method: 'GET', path: '/api/v1/pastoral/cases' }] },
  { key: 'behaviour', probes: [{ method: 'GET', path: '/api/v1/behaviour/incidents' }] },
  { key: 'sen', probes: [{ method: 'GET', path: '/api/v1/sen/profiles' }] },
  { key: 'staff_wellbeing', probes: [{ method: 'GET', path: '/api/v1/wellbeing/surveys' }] },

  // W2 — completion
  { key: 'payroll', probes: [{ method: 'GET', path: '/api/v1/payroll/runs' }] },
  { key: 'parent_inquiries', probes: [{ method: 'GET', path: '/api/v1/parent-inquiries' }] },
  { key: 'website', probes: [{ method: 'GET', path: '/api/v1/website/pages' }] },
  { key: 'ai_functions', probes: [{ method: 'GET', path: '/api/v1/ai-flags' }] },

  // W2 — communications split
  { key: 'communications_outbound', probes: [{ method: 'GET', path: '/api/v1/announcements' }] },
  { key: 'engagement', probes: [{ method: 'GET', path: '/api/v1/engagement/events' }] },

  // W3 — full enforcement
  { key: 'admissions', probes: [{ method: 'GET', path: '/api/v1/admissions/dashboard' }] },
  { key: 'gradebook', probes: [{ method: 'GET', path: '/api/v1/gradebook/grades' }] },
  { key: 'finance', probes: [{ method: 'GET', path: '/api/v1/finance/invoices' }] },
  { key: 'homework', probes: [{ method: 'GET', path: '/api/v1/homework/assignments' }] },
  { key: 'auto_scheduling', probes: [{ method: 'GET', path: '/api/v1/scheduling/dashboard' }] },
  { key: 'budgeting', probes: [{ method: 'GET', path: '/api/v1/budgeting/financial-models' }] },
  {
    key: 'compliance_advanced',
    probes: [{ method: 'GET', path: '/api/v1/regulatory/des/submissions' }],
  },

  // W4 — new toggles
  { key: 'leave', probes: [{ method: 'GET', path: '/api/v1/leave/requests' }] },
  { key: 'school_closures', probes: [{ method: 'GET', path: '/api/v1/school-closures' }] },

  // early_warning is a special case — frontend nav doesn't expose it; test the API direct.
  { key: 'early_warning', probes: [{ method: 'GET', path: '/api/v1/early-warning/students' }] },
];

describe('Module gating leakage', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();
    fixture = await createTenantFixture(prisma);
    const auth = await login(app, fixture.ownerEmail, fixture.password, fixture.domainName);
    token = auth.accessToken;
  }, 60_000);

  afterAll(async () => {
    await deleteTenantFixture(prisma, fixture);
    await prisma.$disconnect();
    await closeTestApp();
  });

  describe.each(PROBES)('module: $key', ({ key, probes }) => {
    // TODO: un-skip per spec wave as enforcement lands.
    // For now, skip every block; per-module spec un-skips its own.
    it.skip('returns 404 MODULE_DISABLED when module is disabled', async () => {
      await disableModuleForTenant(prisma, fixture.tenantId, key);
      for (const probe of probes) {
        const req =
          probe.method === 'GET'
            ? request(app.getHttpServer()).get(probe.path)
            : request(app.getHttpServer())
                .post(probe.path)
                .send(probe.body ?? {});
        const res = await req
          .set('Authorization', `Bearer ${token}`)
          .set('Host', fixture.domainName);
        expect(res.status).toBe(404);
        expect(res.body.error?.code).toBe('MODULE_DISABLED');
        expect(res.body.error?.module).toBe(key);
      }
    });

    it.skip('returns happy-path responses when module is enabled', async () => {
      await enableModuleForTenant(prisma, fixture.tenantId, key);
      for (const probe of probes) {
        const req =
          probe.method === 'GET'
            ? request(app.getHttpServer()).get(probe.path)
            : request(app.getHttpServer())
                .post(probe.path)
                .send(probe.body ?? {});
        const res = await req
          .set('Authorization', `Bearer ${token}`)
          .set('Host', fixture.domainName);
        // Allow 200 (data) or 404-without-MODULE_DISABLED (resource doesn't exist for this fixture).
        // What we MUST NOT see is 404 with code MODULE_DISABLED.
        expect(res.body.error?.code).not.toBe('MODULE_DISABLED');
      }
    });
  });
});
```

## Helper functions

```ts
// apps/api/test/_helpers/module-gating-fixtures.ts

import type { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import type { ModuleKey } from '@school/shared';

const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:5564';

export async function disableModuleForTenant(
  prisma: PrismaClient,
  tenantId: string,
  key: ModuleKey,
): Promise<void> {
  await prisma.tenantModule.upsert({
    where: { tenant_id_module_key: { tenant_id: tenantId, module_key: key } },
    create: { tenant_id: tenantId, module_key: key, is_enabled: false },
    update: { is_enabled: false },
  });
  // Bypass cache for immediate effect in tests.
  const redis = new Redis(TEST_REDIS_URL);
  await redis.del(`tenant_modules:${tenantId}`);
  await redis.quit();
}

export async function enableModuleForTenant(
  prisma: PrismaClient,
  tenantId: string,
  key: ModuleKey,
): Promise<void> {
  await prisma.tenantModule.upsert({
    where: { tenant_id_module_key: { tenant_id: tenantId, module_key: key } },
    create: { tenant_id: tenantId, module_key: key, is_enabled: true },
    update: { is_enabled: true },
  });
  const redis = new Redis(TEST_REDIS_URL);
  await redis.del(`tenant_modules:${tenantId}`);
  await redis.quit();
}
```

## Static analysis test (the must-have safety net)

```ts
// apps/api/src/common/guards/module-enabled-coverage.spec.ts

import { readFileSync } from 'fs';
import { glob } from 'glob';
import { resolve } from 'path';

describe('Module enabled guard coverage (static analysis)', () => {
  it('every controller with @ModuleEnabled also has ModuleEnabledGuard in @UseGuards', () => {
    const repoRoot = resolve(__dirname, '../../../../..');
    const controllerFiles = glob.sync('apps/api/src/modules/**/*.controller.ts', {
      cwd: repoRoot,
      ignore: '**/*.spec.ts',
    });

    const violations: Array<{ file: string; reason: string }> = [];

    for (const relPath of controllerFiles) {
      const content = readFileSync(resolve(repoRoot, relPath), 'utf-8');

      const hasModuleEnabled = /@ModuleEnabled\(/.test(content);
      if (!hasModuleEnabled) continue;

      const hasGuard = /ModuleEnabledGuard/.test(content);
      if (!hasGuard) {
        violations.push({
          file: relPath,
          reason: 'has @ModuleEnabled decorator but does not import or use ModuleEnabledGuard',
        });
        continue;
      }

      // Check that ModuleEnabledGuard appears inside a @UseGuards(...) call
      const useGuardsMatches = content.match(/@UseGuards\(([^)]+)\)/g) ?? [];
      const inAnyUseGuards = useGuardsMatches.some((m) => /ModuleEnabledGuard/.test(m));
      if (!inAnyUseGuards) {
        violations.push({
          file: relPath,
          reason: 'imports ModuleEnabledGuard but does not include it in any @UseGuards(...)',
        });
      }
    }

    if (violations.length > 0) {
      const summary = violations.map((v) => `  - ${v.file}: ${v.reason}`).join('\n');
      throw new Error(
        `Module gating coverage violations (${violations.length}):\n${summary}\n\n` +
          `Every controller decorated with @ModuleEnabled MUST also have ` +
          `ModuleEnabledGuard in @UseGuards(...). See Module Gating/STRATEGY.md §4.2.`,
      );
    }
  });
});
```

## Frontend nav filter scaffold

```tsx
// apps/web/src/__tests__/module-gating/nav-filter.spec.tsx

import { describe, it, expect } from '@jest/globals';
import { MODULE_REGISTRY, type ModuleKey } from '@school/shared';
import { filterNavByModules } from '@/components/morph-shell/nav-config';

describe('Nav filter — per module', () => {
  it.each(MODULE_REGISTRY)('hides $key entries when disabled', ({ key }) => {
    const nav = [
      { id: 'home', label: 'Home', moduleKey: undefined },
      { id: key, label: key, moduleKey: key as ModuleKey },
      { id: 'other', label: 'Other', moduleKey: 'pastoral' as ModuleKey }, // some other module
    ];
    const allEnabled = MODULE_REGISTRY.map((m) => m.key);
    const withoutThis = allEnabled.filter((k) => k !== key);

    const filtered = filterNavByModules(nav, withoutThis);
    expect(filtered.find((n) => n.id === key)).toBeUndefined();
    expect(filtered.find((n) => n.id === 'home')).toBeDefined();
  });
});
```

## Worker tenant-skip scaffold

```ts
// apps/worker/test/module-gating-worker.spec.ts

import { describe, it, expect } from '@jest/globals';
import { TenantModuleService } from '../../api/src/common/services/tenant-module.service';

describe('Worker module gating', () => {
  // Per cron-dispatch processor: prove that disabling the module results in
  // zero per-tenant jobs being enqueued for that tenant.
  it.skip.each([
    ['pastoral', 'PastoralCronDispatchProcessor'],
    ['behaviour', 'BehaviourCronDispatchProcessor'],
    ['early_warning', 'EarlyWarningProcessor'],
    // Per-module specs un-skip their own as enforcement lands.
  ])('skips disabled-tenant fan-out for %s', async (key, processorName) => {
    // Setup: one tenant with module enabled, one with module disabled.
    // Trigger: invoke the processor's process() method.
    // Assert: only the enabled tenant gets a per-tenant job enqueued.
  });
});
```

---

## Acceptance

- [ ] `apps/api/test/module-gating-leakage.e2e-spec.ts` exists with `describe.each` over `PROBES` and the disabled/enabled `it.skip` blocks ready to be un-skipped per-spec.
- [ ] `apps/api/test/_helpers/module-gating-fixtures.ts` exists with `disableModuleForTenant` + `enableModuleForTenant`.
- [ ] `apps/api/src/common/guards/module-enabled-coverage.spec.ts` exists and runs in the unit job. Currently no violations expected (existing 6 enforced modules already comply); fails the build if a future spec ships an unguarded `@ModuleEnabled`.
- [ ] `apps/web/src/__tests__/module-gating/nav-filter.spec.tsx` exists with per-module skip-able tests.
- [ ] `apps/worker/test/module-gating-worker.spec.ts` exists with per-cron-dispatcher skip-able tests.
- [ ] Run `pnpm --filter @school/api run test:integration` locally and confirm the new spec is picked up (skipped tests visible in output).
- [ ] Run `pnpm --filter @school/api run test` locally and confirm the static analysis test passes (no violations).

---

## Notes

- The `PROBES` table in the e2e spec is the canonical list of what gets tested per module. Per-module specs (W2/W3/W4) extend the probes list (add more endpoints) and un-skip their `it` blocks. They MUST add at least one probe per controller they newly gate.
- The static analysis spec is the highest-value test in this entire initiative. It costs ~50ms and prevents the most common failure mode. Make sure it runs in CI's unit job (early), not just integration (late).
- Per-module specs should also add 1-2 endpoint-specific tests in the controller's existing `*.controller.spec.ts` (e.g., a unit test that the controller's first method returns 404 MODULE_DISABLED when a mocked service throws). The leakage spec covers the broader integration check.
- The frontend nav filter test is intentionally minimal — once `filterNavByModules` is correct, the rest is wiring. Per-module specs verify their nav entries gain the `moduleKey` annotation.
