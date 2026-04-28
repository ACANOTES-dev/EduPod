# Implementation 03 — Tenant Gating UI + Language Picker Refactor

> **Phase:** 1 — Foundation (was P1C)
> **Wave:** 3 (serial — no Phase 4/5 implementation can ship without the picker reading `supported_locales`)
> **Depends on:** 02 complete & deployed
> **Deploys:** API restart + web restart + worker restart
> **Model:** Opus 4.7 / Standard

---

## Goal

After this ships:

1. The user-menu language picker (`apps/web/src/components/user-menu.tsx`) is no longer a binary `EN ↔ AR` toggle. It's a dynamic dropdown sourced from the tenant's `supported_locales` and the registry, showing native names.
2. The profile-page locale selector applies the same filter.
3. Backend has a platform-admin-only endpoint to PATCH `Tenant.supported_locales`.
4. Platform-admin frontend (under `(platform)/`) has a UI to flip `supported_locales` per tenant.
5. Backend validates locale on every write that takes a locale (e.g., `User.preferred_locale`, eventually `Household.secondary_locale`) — value must be in `tenant.supported_locales`.

By the end of this implementation, NHQS users see only `en` and `ar` in the picker (no Tier 1/2 locale is yet active anyway). The platform-admin UI works such that a future toggle of, say, `fr` (after implementation 07 ships) becomes a one-click operation rather than a SQL command.

## Critical safety constraints

- **Never trust the client.** Every locale-related write on the backend MUST validate against `tenant.supported_locales`. Don't move the check into Zod alone — the schema accepts any registered locale; the tenant-level check is the actual guard.
- **Backwards compatibility for existing users.** If a user previously had `preferred_locale = 'ar'` and the platform admin removes `ar` from `supported_locales`, the user's preferred locale is no longer valid. Don't allow `supported_locales` removal that would orphan users — block with a 409 + clear error.
- **Do not flip `default_locale` here.** The CHECK constraint added in 01 enforces `default_locale = ANY(supported_locales)`. If a platform admin tries to remove the default, return 409 — they must change `default_locale` first (separate flow already exists).

---

## Files to create / modify

### Frontend

- **Modify:** `apps/web/src/components/user-menu.tsx` — replace the EN/AR toggle with a registry-aware dropdown.
- **Modify:** `apps/web/src/app/[locale]/(school)/profile/page.tsx` (or the actual profile page path) — same dropdown pattern.
- **Create:** `apps/web/src/components/locale-picker.tsx` — reusable component.
- **Create:** `apps/web/src/lib/use-tenant-supported-locales.ts` — React hook.
- **Create:** `apps/web/src/app/[locale]/(platform)/admin/tenants/[tenantId]/locales/page.tsx` — platform admin UI.

### Backend

- **Modify:** `apps/api/src/modules/tenants/tenants.controller.ts` — add `PATCH /v1/admin/tenants/:id/supported-locales`.
- **Modify:** `apps/api/src/modules/tenants/tenants.service.ts` — `updateSupportedLocales(tenantId, locales)`.
- **Create:** `apps/api/src/modules/tenants/tenants.service.update-supported-locales.spec.ts` — service-layer unit tests.
- **Modify:** `apps/api/src/modules/users/users.service.ts` — when writing `preferred_locale`, validate against tenant's `supported_locales`.
- **Modify:** `apps/api/src/modules/auth/auth.service.ts` — same validation if it's where preferred_locale is set on register.

### Shared

- **Modify:** `packages/shared/src/i18n/locale-codes.ts` — add `updateSupportedLocalesSchema`.

### Tests

- **Create:** `apps/web/src/components/locale-picker.spec.tsx` — component test.
- **Create:** `apps/api/test/admin-tenant-locales.e2e-spec.ts` — e2e for the new admin endpoint.
- **Create:** `apps/web/e2e/locale-picker.spec.ts` — Playwright smoke (NHQS user sees only en + ar; platform admin can flip).

### Docs

- **Modify:** `docs/architecture/feature-map.md` — flag for user (do NOT auto-update).
- **Modify:** `New Languages/IMPLEMENTATION_LOG.md` — flip status.

---

## Detailed task breakdown

### Task 1 — `useTenantSupportedLocales` hook

**Files:**

- Create: `apps/web/src/lib/use-tenant-supported-locales.ts`

- [ ] **Step 1.1 — Write the hook:**

```ts
// apps/web/src/lib/use-tenant-supported-locales.ts
'use client';

import * as React from 'react';

import { LOCALE_REGISTRY, type LocaleEntry } from '../../i18n/registry';
import { apiClient } from './api-client';

type TenantConfig = { id: string; default_locale: string; supported_locales: string[] };

/**
 * Returns the locales the current tenant supports, filtered to those that are
 * also active in the registry (i.e., have a message file shipped). The
 * intersection prevents the picker from showing a locale that hasn't yet had
 * its Phase 4/5 implementation merge.
 */
export function useTenantSupportedLocales(): {
  locales: LocaleEntry[];
  defaultLocale: string;
  loading: boolean;
} {
  const [config, setConfig] = React.useState<TenantConfig | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    apiClient<TenantConfig>('/v1/tenants/me')
      .then((res) => {
        if (!cancelled) setConfig(res);
      })
      .catch((err) => {
        console.error('[useTenantSupportedLocales]', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const locales = React.useMemo(() => {
    if (!config) return [];
    const allowed = new Set(config.supported_locales);
    return LOCALE_REGISTRY.filter((l) => l.active && allowed.has(l.code));
  }, [config]);

  return {
    locales,
    defaultLocale: config?.default_locale ?? 'en',
    loading,
  };
}
```

- [ ] **Step 1.2 — Commit:**

```bash
git add apps/web/src/lib/use-tenant-supported-locales.ts
git commit -m "feat(web): add useTenantSupportedLocales hook"
```

### Task 2 — Reusable `LocalePicker` component

**Files:**

- Create: `apps/web/src/components/locale-picker.tsx`
- Create: `apps/web/src/components/locale-picker.spec.tsx`

- [ ] **Step 2.1 — Write the component:**

```tsx
// apps/web/src/components/locale-picker.tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { useLocale } from 'next-intl';

import { LOCALE_REGISTRY } from '../../i18n/registry';
import { useTenantSupportedLocales } from '../lib/use-tenant-supported-locales';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

/**
 * Dropdown showing the intersection of:
 *   - locales the registry marks as active (i.e., a message file ships)
 *   - locales the current tenant has enabled (Tenant.supported_locales)
 *
 * Selection causes a navigation to the same path under the new locale segment.
 */
export function LocalePicker(): React.ReactElement | null {
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale();
  const { locales, loading } = useTenantSupportedLocales();

  if (loading || locales.length <= 1) {
    // Hide the picker if only one locale is enabled — no choice to offer.
    return null;
  }

  const onChange = React.useCallback(
    (next: string) => {
      // Pathname is always /<locale>/...; replace the first segment.
      const segments = pathname.split('/');
      segments[1] = next;
      router.push(segments.join('/'));
    },
    [pathname, router],
  );

  return (
    <Select value={currentLocale} onValueChange={onChange}>
      <SelectTrigger aria-label="Language" className="min-w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((entry) => (
          <SelectItem key={entry.code} value={entry.code}>
            <span className="flex items-center gap-2">
              <span className="text-text-secondary text-sm uppercase">{entry.code}</span>
              <span>{entry.nativeName}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2.2 — Component test:**

```tsx
// apps/web/src/components/locale-picker.spec.tsx
import { render, screen } from '@testing-library/react';

import { LocalePicker } from './locale-picker';

jest.mock('../lib/use-tenant-supported-locales', () => ({
  useTenantSupportedLocales: () => ({
    locales: [
      {
        code: 'en',
        englishName: 'English',
        nativeName: 'English',
        direction: 'ltr',
        tier: 1,
        active: true,
      },
      {
        code: 'ar',
        englishName: 'Arabic',
        nativeName: 'العربية',
        direction: 'rtl',
        tier: 1,
        active: true,
      },
    ],
    defaultLocale: 'en',
    loading: false,
  }),
}));

jest.mock('next-intl', () => ({ useLocale: () => 'en' }));
jest.mock('next/navigation', () => ({
  usePathname: () => '/en/dashboard',
  useRouter: () => ({ push: jest.fn() }),
}));

describe('LocalePicker', () => {
  it('renders both supported locales by native name', () => {
    render(<LocalePicker />);
    // Open the trigger to expose options:
    const trigger = screen.getByRole('combobox', { name: /language/i });
    expect(trigger).toBeInTheDocument();
  });

  it('hides itself when only one locale is supported', () => {
    jest.resetModules();
    jest.doMock('../lib/use-tenant-supported-locales', () => ({
      useTenantSupportedLocales: () => ({
        locales: [
          {
            code: 'en',
            englishName: 'English',
            nativeName: 'English',
            direction: 'ltr',
            tier: 1,
            active: true,
          },
        ],
        defaultLocale: 'en',
        loading: false,
      }),
    }));
    const { LocalePicker: Reloaded } = require('./locale-picker');
    const { container } = render(<Reloaded />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2.3 — Run:** `pnpm --filter @school/web test -- locale-picker`. Adjust the test imports if they hit the trigger differently.

- [ ] **Step 2.4 — Commit:**

```bash
git add apps/web/src/components/locale-picker.tsx apps/web/src/components/locale-picker.spec.tsx
git commit -m "feat(web): add reusable LocalePicker component"
```

### Task 3 — Refactor `user-menu.tsx` to use the picker

**Files:**

- Modify: `apps/web/src/components/user-menu.tsx`

- [ ] **Step 3.1 — Read the current `user-menu.tsx`** to understand the existing locale toggle (find the `Link href={...}` or `<button>` that flips between en and ar).

- [ ] **Step 3.2 — Replace the binary toggle** with `<LocalePicker />`. Keep the existing markup structure — only swap the locale-toggle slot.

- [ ] **Step 3.3 — Apply the same change to the profile page** (search for the existing locale selector — likely under `apps/web/src/app/[locale]/(school)/profile/`).

- [ ] **Step 3.4 — Run:** `pnpm --filter @school/web type-check` + `pnpm --filter @school/web test`.

- [ ] **Step 3.5 — Commit:**

```bash
git add apps/web/src/components/user-menu.tsx apps/web/src/app/[locale]/(school)/profile/
git commit -m "refactor(web): replace binary EN/AR toggle with LocalePicker in user menu and profile"
```

### Task 4 — Backend: update-supported-locales endpoint

**Files:**

- Modify: `packages/shared/src/i18n/locale-codes.ts`
- Modify: `apps/api/src/modules/tenants/tenants.controller.ts`
- Modify: `apps/api/src/modules/tenants/tenants.service.ts`
- Create: `apps/api/src/modules/tenants/tenants.service.update-supported-locales.spec.ts`

- [ ] **Step 4.1 — Add the schema** to `packages/shared/src/i18n/locale-codes.ts`:

```ts
export const updateSupportedLocalesSchema = z.object({
  supported_locales: supportedLocalesSchema,
});
export type UpdateSupportedLocalesDto = z.infer<typeof updateSupportedLocalesSchema>;
```

- [ ] **Step 4.2 — Service: `updateSupportedLocales` with safety checks:**

```ts
// apps/api/src/modules/tenants/tenants.service.ts (additions)
import {
  type SupportedLocales,
  REGISTERED_LOCALES,
} from '@school/shared';

async updateSupportedLocales(
  tenantId: string,
  next: SupportedLocales,
): Promise<{ id: string; supported_locales: string[] }> {
  // Always go via an interactive transaction so RLS + CHECK constraint apply.
  return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, default_locale: true, supported_locales: true },
    });
    if (!tenant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: `Tenant "${tenantId}" not found` });
    }

    // 1. Default must remain in the new list (CHECK constraint catches this
    // too, but a clean error is friendlier than a constraint violation).
    if (!next.includes(tenant.default_locale)) {
      throw new ConflictException({
        code: 'DEFAULT_LOCALE_NOT_IN_LIST',
        message: `Cannot remove default locale "${tenant.default_locale}" from supported_locales. Change the default first.`,
      });
    }

    // 2. Removing a locale that users have set as preferred_locale would
    // orphan them. Block until those users are migrated.
    const removed = tenant.supported_locales.filter((l) => !next.includes(l));
    if (removed.length > 0) {
      const orphaned = await tx.user.count({
        where: {
          memberships: { some: { tenant_id: tenantId } },
          preferred_locale: { in: removed },
        },
      });
      if (orphaned > 0) {
        throw new ConflictException({
          code: 'LOCALE_HAS_USERS',
          message: `Cannot remove locales [${removed.join(',')}] — ${orphaned} user(s) still have one as preferred_locale.`,
        });
      }
    }

    const updated = await tx.tenant.update({
      where: { id: tenantId },
      data: { supported_locales: next },
      select: { id: true, supported_locales: true },
    });
    return updated;
  }) as unknown as { id: string; supported_locales: string[] };
}
```

- [ ] **Step 4.3 — Controller: route + permission:**

```ts
// apps/api/src/modules/tenants/tenants.controller.ts (additions)

// PATCH /v1/admin/tenants/:id/supported-locales
@Patch('admin/:id/supported-locales')
@RequiresPermission('platform.tenant.manage')
async updateSupportedLocales(
  @Param('id', ParseUUIDPipe) id: string,
  @Body(new ZodValidationPipe(updateSupportedLocalesSchema)) body: UpdateSupportedLocalesDto,
) {
  return this.tenantsService.updateSupportedLocales(id, body.supported_locales);
}
```

> **Permission note:** `platform.tenant.manage` is platform-admin only. If that permission doesn't exist yet, add it to the seeds in `packages/prisma/seed/permissions.ts` and grant it via the platform admin role. Backfill existing platform admin role memberships so the test user has it.

- [ ] **Step 4.4 — Unit test the service:**

```ts
// apps/api/src/modules/tenants/tenants.service.update-supported-locales.spec.ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TenantsService } from './tenants.service';
import { buildMockPrisma } from '../../testing/mock-prisma';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (prisma: unknown) => prisma,
}));

describe('TenantsService — updateSupportedLocales', () => {
  let service: TenantsService;
  let prisma: ReturnType<typeof buildMockPrisma>;

  const TENANT_ID = '00000000-0000-0000-0000-000000000001';

  beforeEach(async () => {
    prisma = buildMockPrisma();
    const module = await Test.createTestingModule({
      providers: [TenantsService, { provide: 'PrismaService', useValue: prisma }],
    }).compile();
    service = module.get(TenantsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('throws NotFoundException when tenant id is unknown', async () => {
    prisma.tenant.findUnique.mockResolvedValueOnce(null);
    await expect(service.updateSupportedLocales(TENANT_ID, ['en'])).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('blocks removing the default locale', async () => {
    prisma.tenant.findUnique.mockResolvedValueOnce({
      id: TENANT_ID,
      default_locale: 'en',
      supported_locales: ['en', 'ar'],
    });
    await expect(service.updateSupportedLocales(TENANT_ID, ['ar'])).rejects.toMatchObject({
      status: 409,
      response: { code: 'DEFAULT_LOCALE_NOT_IN_LIST' },
    });
  });

  it('blocks removing a locale that users still prefer', async () => {
    prisma.tenant.findUnique.mockResolvedValueOnce({
      id: TENANT_ID,
      default_locale: 'en',
      supported_locales: ['en', 'ar'],
    });
    prisma.user.count.mockResolvedValueOnce(3);
    await expect(service.updateSupportedLocales(TENANT_ID, ['en'])).rejects.toMatchObject({
      status: 409,
      response: { code: 'LOCALE_HAS_USERS' },
    });
  });

  it('updates when no constraints fire', async () => {
    prisma.tenant.findUnique.mockResolvedValueOnce({
      id: TENANT_ID,
      default_locale: 'en',
      supported_locales: ['en'],
    });
    prisma.tenant.update.mockResolvedValueOnce({
      id: TENANT_ID,
      supported_locales: ['en', 'ar', 'fr'],
    });
    await expect(
      service.updateSupportedLocales(TENANT_ID, ['en', 'ar', 'fr']),
    ).resolves.toMatchObject({ supported_locales: ['en', 'ar', 'fr'] });
  });
});
```

- [ ] **Step 4.5 — E2E test:**

```ts
// apps/api/test/admin-tenant-locales.e2e-spec.ts
//
// PATCH /v1/admin/tenants/:id/supported-locales
//   - 403 if caller is not platform admin
//   - 200 + updated row when caller is platform admin
//   - 409 when default_locale would be removed
//   - 409 when there are users with preferred_locale = removed locale

// (Standard NestJS bootstrap with test helpers — pattern mirrors existing
// e2e files. Keep this terse here; the executor will fill in helpers from
// `apps/api/test/helpers/`.)
```

- [ ] **Step 4.6 — Update `users.service.ts` and `auth.service.ts`** to validate `preferred_locale` against the user's tenant `supported_locales`:

```ts
// In users.service.ts (or wherever preferred_locale is written):
async updateUserLocale(userId: string, tenantId: string, preferred_locale: string): Promise<void> {
  return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { supported_locales: true },
    });
    if (!tenant || !tenant.supported_locales.includes(preferred_locale)) {
      throw new BadRequestException({
        code: 'LOCALE_NOT_SUPPORTED',
        message: `Locale "${preferred_locale}" is not enabled for this tenant.`,
      });
    }
    await tx.user.update({ where: { id: userId }, data: { preferred_locale } });
  }) as unknown as void;
}
```

- [ ] **Step 4.7 — Run unit + e2e:**

```bash
pnpm --filter @school/api test -- tenants.service.update-supported-locales
pnpm --filter @school/api test:e2e -- admin-tenant-locales
```

- [ ] **Step 4.8 — Commit:**

```bash
git add packages/shared/src/i18n/ \
        apps/api/src/modules/tenants/ \
        apps/api/src/modules/users/ \
        apps/api/src/modules/auth/ \
        apps/api/test/admin-tenant-locales.e2e-spec.ts
git commit -m "feat(api): add platform-admin endpoint to manage tenant supported_locales"
```

### Task 5 — Platform-admin frontend

**Files:**

- Create: `apps/web/src/app/[locale]/(platform)/admin/tenants/[tenantId]/locales/page.tsx`
- Probably also: `apps/web/src/app/[locale]/(platform)/admin/tenants/[tenantId]/_components/locale-manager.tsx`

- [ ] **Step 5.1 — Build the page** with a checklist of all registered locales (from registry), pre-checked according to current `tenant.supported_locales`. Save button calls `PATCH /v1/admin/tenants/:id/supported-locales`.

- [ ] **Step 5.2 — Use react-hook-form + zodResolver per `frontend.md`:**

```tsx
const form = useForm<UpdateSupportedLocalesDto>({
  resolver: zodResolver(updateSupportedLocalesSchema),
  defaultValues: { supported_locales: tenant.supported_locales },
});
```

- [ ] **Step 5.3 — Surface error codes**: render the 409 response codes (`DEFAULT_LOCALE_NOT_IN_LIST`, `LOCALE_HAS_USERS`) as user-friendly toasts with translatable messages.

- [ ] **Step 5.4 — Hook the page into the platform admin nav** (existing `(platform)` shell).

- [ ] **Step 5.5 — Commit:**

```bash
git add apps/web/src/app/[locale]/\(platform\)/admin/tenants/
git commit -m "feat(web): add platform admin UI to manage tenant supported_locales"
```

### Task 6 — Playwright smoke

**Files:**

- Create: `apps/web/e2e/locale-picker.spec.ts`

- [ ] **Step 6.1 — Write the journey test:**

```ts
// apps/web/e2e/locale-picker.spec.ts
import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './fixtures/auth';

test.describe('Locale picker — tenant gating', () => {
  test('NHQS user sees only en + ar in the picker', async ({ page }) => {
    await loginAsTestUser(page, { tenant: 'nhqs', role: 'admin' });
    const picker = page.getByRole('combobox', { name: /language/i });
    await picker.click();
    const options = await page.getByRole('option').allTextContents();
    expect(options.length).toBe(2);
    expect(options.some((t) => /english/i.test(t))).toBe(true);
    expect(options.some((t) => /العربية/.test(t))).toBe(true);
  });

  test('platform admin can flip a tenant supported_locales', async ({ page }) => {
    await loginAsTestUser(page, { role: 'platform_admin' });
    await page.goto('/en/admin/tenants/nhqs/locales');
    // (Adjust selectors to actual UI.) Toggle a hypothetical 'fr' checkbox.
    // Save.
    // Reload as NHQS user — but since 'fr' is not yet active in the registry,
    // it stays hidden. Re-toggle it off to leave NHQS in clean state.
    // (After implementation 07 ships, this test will see 'fr' appear.)
  });
});
```

- [ ] **Step 6.2 — Run locally:** `pnpm --filter @school/web exec playwright test --grep locale-picker`

- [ ] **Step 6.3 — Commit:**

```bash
git add apps/web/e2e/locale-picker.spec.ts
git commit -m "test(e2e): Playwright coverage for locale picker tenant gating"
```

### Task 7 — Local regression sweep, push, deploy, verify

- [ ] **Step 7.1 — Local checks:**

```bash
turbo lint
turbo type-check
turbo test
pnpm --filter @school/web exec playwright test --grep locale-picker
```

- [ ] **Step 7.2 — Pre-push branch state:**

```bash
git fetch origin main
git log --oneline origin/main..HEAD
```

- [ ] **Step 7.3 — Push + watch:**

```bash
git push origin main
gh run watch
```

- [ ] **Step 7.4 — Post-deploy verification on NHQS:**
  - Log in as NHQS user. Open user menu. Confirm picker shows English + العربية only. Switch between them — page navigates correctly.
  - Log in as platform admin. Open `/en/admin/tenants/nhqs/locales`. Confirm only `en` + `ar` are checked. Try to uncheck `en` — expect a 409 toast (default locale).

- [ ] **Step 7.5 — Append completion entry to `IMPLEMENTATION_LOG.md`:** commit SHAs, CI run URL, deploy timestamp, Playwright result, manual verification notes. Push.

---

## Acceptance criteria

- [ ] User-menu locale picker is dynamic (driven by `useTenantSupportedLocales`)
- [ ] Profile page locale selector uses the same component
- [ ] Platform admin endpoint `PATCH /v1/admin/tenants/:id/supported-locales` exists with permission `platform.tenant.manage`
- [ ] Endpoint blocks: removing default_locale, removing a locale users still prefer
- [ ] `users.service.ts` validates `preferred_locale` against tenant's `supported_locales`
- [ ] Platform admin UI renders, saves, and surfaces error toasts on 409
- [ ] Component tests + service unit tests + e2e + Playwright all green
- [ ] CI green; production deploy successful
- [ ] NHQS user sees picker with en + ar only on production
- [ ] Platform admin UI works on production
- [ ] `IMPLEMENTATION_LOG.md` updated

---

## Verification commands

```bash
turbo lint && turbo type-check && turbo test
pnpm --filter @school/web exec playwright test --grep locale-picker

# Post-deploy spot-check
ssh root@46.62.244.139 "sudo -u edupod psql edupod_prod -c \"SELECT slug, supported_locales FROM tenants WHERE slug = 'nhqs';\""
```

---

## Rollback

```bash
# Revert all commits in this implementation
git revert <last-sha>..<first-sha>
git push origin main
# CI redeploys. The picker reverts to the binary toggle. The new admin
# endpoint disappears. No DB rollback required (no schema changes here).
```

---

## Notes for the executor

- `(platform)` route group already exists. Mirror the surrounding pages' style and shell.
- Follow `frontend.md` rules: react-hook-form + zodResolver, logical CSS properties (no `pl-`, `pr-`, etc.), no inline styles, no hardcoded hex colours.
- The 409 codes (`DEFAULT_LOCALE_NOT_IN_LIST`, `LOCALE_HAS_USERS`) need translation keys added to `en.json` AND `ar.json` in this same commit (per the hard-error gate). Don't add them to any other locale's file — those don't exist yet.
- After deploy, flag the user that `feature-map.md` may need updating (per `feature-map-maintenance.md`). Do NOT auto-update.
