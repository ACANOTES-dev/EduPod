# Implementation 03 — API Enforcement Layer

> **Phase:** 1 — Foundation
> **Wave:** W1
> **Depends on:** 01 — Canonical module registry
> **Deploys:** API restart
> **Model:** Opus 4.7 (foundation; touches the existing guard that other code depends on)

---

## Goal

Tighten the existing `@ModuleEnabled` decorator + `ModuleEnabledGuard` so they're type-safe (typos become TS errors), respond with a clean envelope (404 + structured `MODULE_DISABLED` code), and document the missing-row default-deny behaviour inline. No behavioural change for existing decorated controllers — they continue to enforce the same way; the upgrade is in ergonomics + response shape + types.

---

## Critical safety constraints

- **Backwards compatible at the controller level.** Every existing `@ModuleEnabled('pastoral')` etc. still works without modification.
- **Response code change is a deliberate UX choice.** Old: `403 Forbidden`. New: `404 Not Found` with `{ code: 'MODULE_DISABLED', module: '<key>', message: '...' }`. The 404 hides feature existence from external probers + matches "this endpoint doesn't exist for you" semantics. Frontend interceptor catches the code and shows the redirect (not a generic 404 page).
- **No new gating added.** This spec only improves the guard infrastructure. No new controllers gain decorators here.
- **Type narrowing is enforced.** `@ModuleEnabled` accepts `ModuleKey` only — strings outside the union fail TS check.

---

## Files to create / modify

### Modify

- **`apps/api/src/common/decorators/module-enabled.decorator.ts`** — type the key argument as `ModuleKey`. See full content below.
- **`apps/api/src/common/guards/module-enabled.guard.ts`** — switch from `ForbiddenException` to `NotFoundException` with structured payload. Add inline `// SAFETY:` comment about default-deny on missing rows. See full content below.
- **`apps/api/src/common/guards/module-enabled.guard.spec.ts`** — update existing tests to assert the new 404 + envelope shape; add a test for missing-row → 404; add a test for module enabled → next.
- **`apps/api/src/common/exceptions/module-disabled.exception.ts`** — new `NotFoundException` subclass for clean throws. (Optional but cleans up the call sites.)

### Modify (transitively)

- Anywhere in `apps/api/test/` that asserts `403 Forbidden` from a `@ModuleEnabled`-gated endpoint must change to `404` with the new envelope. Run `grep -rn "@ModuleEnabled" apps/api/test/` to find affected tests; expect ~5–10 hits.

---

## Decorator (full new content)

```ts
// apps/api/src/common/decorators/module-enabled.decorator.ts

import { SetMetadata } from '@nestjs/common';
import type { ModuleKey } from '@school/shared';

export const MODULE_ENABLED_KEY = 'moduleEnabled';

/**
 * Decorate a controller class (or method) to require the named module to be
 * enabled for the current tenant. Used together with `ModuleEnabledGuard`
 * (which must be present in @UseGuards alongside this decorator).
 *
 * Type argument: only canonical `ModuleKey` values from the registry are
 * accepted at compile time. Typos become TypeScript errors.
 *
 * Behaviour when the tenant's module is disabled (or the row is missing —
 * see SAFETY note in `module-enabled.guard.ts`): the guard throws
 * `ModuleDisabledException` (404 with `{ code: 'MODULE_DISABLED', module }`).
 */
export const ModuleEnabled = <K extends ModuleKey>(key: K) => SetMetadata(MODULE_ENABLED_KEY, key);
```

## Guard (key change excerpts)

```ts
// apps/api/src/common/guards/module-enabled.guard.ts (relevant section)

import { Injectable, CanActivate, ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type ModuleKey } from '@school/shared';
import { MODULE_ENABLED_KEY } from '../decorators/module-enabled.decorator';
import { ModuleDisabledException } from '../exceptions/module-disabled.exception';

@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, /* + existing deps */) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const requiredKey = this.reflector.getAllAndOverride<ModuleKey | undefined>(
      MODULE_ENABLED_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    if (!requiredKey) return true; // controller doesn't require gating

    const tenantId = /* existing tenant context resolution */;

    const enabled = await this.tenantModuleService.isEnabled(tenantId, requiredKey);

    if (!enabled) {
      // SAFETY: `isEnabled` returns false in BOTH cases:
      //   (a) tenantModule row exists with is_enabled=false
      //   (b) NO tenantModule row exists for this (tenant, key) pair
      //
      // Case (b) is "default deny." This is intentional but means every
      // gateable module key MUST have a tenantModule row provisioned for
      // every tenant before enforcement of that key can ship. The
      // canonical-registry backfill migration (Module Gating impl 02)
      // is the only place that guarantees this invariant. Adding a new
      // module key without running a fresh backfill will instantly 404
      // existing tenants on that endpoint.
      //
      // See Module Gating/STRATEGY.md §4.2 + §9 for the design rationale.
      throw new ModuleDisabledException(requiredKey);
    }

    return true;
  }
}
```

## Exception class (new file)

```ts
// apps/api/src/common/exceptions/module-disabled.exception.ts

import { NotFoundException } from '@nestjs/common';
import type { ModuleKey } from '@school/shared';

export class ModuleDisabledException extends NotFoundException {
  constructor(moduleKey: ModuleKey) {
    super({
      code: 'MODULE_DISABLED',
      module: moduleKey,
      message: 'This feature is disabled by your administrator.',
    });
  }
}
```

---

## Acceptance

- [ ] `apps/api/src/common/decorators/module-enabled.decorator.ts` accepts `ModuleKey` only; typos like `@ModuleEnabled('grdaebook')` fail `turbo type-check`.
- [ ] `ModuleEnabledGuard` throws `ModuleDisabledException` (404) instead of `ForbiddenException` (403).
- [ ] Response envelope from a disabled module's endpoint is `{ error: { code: 'MODULE_DISABLED', module: '<key>', message: '...' } }`. Verified via curl against a test setup.
- [ ] `module-enabled.guard.spec.ts` covers: enabled → next(); disabled (row exists) → 404 MODULE_DISABLED; missing row → 404 MODULE_DISABLED; controller without @ModuleEnabled → next().
- [ ] All existing `@ModuleEnabled` controllers (pastoral, behaviour, sen, etc.) still pass their existing tests — but those tests now assert 404 instead of 403.
- [ ] Inline SAFETY comment present in the guard explaining the default-deny rationale + pointing to STRATEGY §4.2.

---

## Notes

- The 403 → 404 change is technically a public-API contract change. Mitigation: no external API consumers exist today (NHQS + stress tenants use the web UI only). The frontend axios interceptor (implementation 04) handles the new envelope. We update the API docs in implementation 08.
- `ModuleEnabledGuard` reads from `TenantModuleService.isEnabled` (created in implementation 05). To avoid a circular wave dependency: this spec keeps the existing direct DB access in the guard, then implementation 05 refactors to inject `TenantModuleService`. Both can ship in W1 without conflict.
