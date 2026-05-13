# Implementation 04 — Frontend Gating System

> **Phase:** 1 — Foundation
> **Wave:** W1
> **Depends on:** 01 (registry), 03 (API guard 404 envelope)
> **Deploys:** Web rebuild + API restart (`/me` endpoint extension)
> **Model:** Opus 4.7 / **Max effort** (touches morph-shell layout, axios interceptor, tenant context)

---

## Goal

Build the frontend half of the gating system. After this ships:

- The morph-shell nav filters out hubs whose `moduleKey` is not in the user's `enabled_modules` array.
- A `useModuleEnabled(key)` hook is available everywhere and returns a boolean.
- An `<IfModuleEnabled module="key">` component lets cross-cutting embeds skip rendering.
- A `/disabled?module=<key>` page exists to land users when they hit a disabled feature.
- The axios client intercepts `MODULE_DISABLED` responses, fires a toast, and redirects to the disabled page.
- `/me` returns `enabled_modules: ModuleKey[]` so the boot context has the data.

No nav entries change yet — that's per-module work in W2/W3. This spec ships the system so per-module work can plug in.

---

## Critical safety constraints

- **No nav changes yet.** The nav config gains support for an optional `moduleKey` field on each entry, but no entry sets it in this spec. After this spec, nav still renders identically. Per-module specs add the `moduleKey` annotations.
- **`/me` payload extension is additive.** Existing consumers of `/me` get the new `enabled_modules` field; old consumers ignore it. No breaking change.
- **Disabled landing page must not be redirected away from immediately.** If the user has `enabled_modules` containing `key`, the page should still render the "this was disabled" content (so a user who hits the URL via a stale cached link gets a clean explanation). Use the page only when explicitly redirected by the interceptor.
- **Disabled landing page is locale-aware.** `/[locale]/disabled?module=<key>` — the layout's locale segment must work normally. Translation keys go in `messages/{locale}.json` under `disabled.title`, `disabled.body`, `disabled.return_home`.

---

## Files to create / modify

### Create

- **`apps/web/src/hooks/use-module-enabled.ts`** — the React hook. ~30 lines.
- **`apps/web/src/components/if-module-enabled.tsx`** — the conditional render component. ~15 lines.
- **`apps/web/src/app/[locale]/disabled/page.tsx`** — the landing page. ~50 lines including translations.
- **`apps/web/src/app/[locale]/disabled/_components/disabled-content.tsx`** — the rendering component (client component for the query-param read).
- **`apps/web/src/lib/api/module-disabled-interceptor.ts`** — axios response interceptor that catches `MODULE_DISABLED` and fires the redirect.
- **`apps/web/src/__tests__/hooks/use-module-enabled.spec.tsx`** — unit test of the hook (3 cases: enabled, disabled, key not in registry).
- **`apps/web/src/__tests__/components/if-module-enabled.spec.tsx`** — unit test of the component.

### Modify

- **`apps/api/src/modules/auth/auth.controller.ts`** (or wherever `/me` lives) — extend the response DTO to include `enabled_modules: ModuleKey[]`. Pull from `TenantModuleService.getEnabledModules(tenantId)`.
- **`packages/shared/src/dto/auth/me-response.schema.ts`** (the Zod schema for `/me`) — add the new field.
- **`apps/web/src/lib/contexts/tenant-context.tsx`** (or the equivalent context provider that holds tenant-aware state) — read `enabled_modules` from `/me` response and expose via the context.
- **`apps/web/src/lib/api-client.ts`** — wire the new interceptor.
- **`apps/web/src/components/morph-shell/nav-config.ts`** — add `moduleKey?: ModuleKey` to the nav entry type. Add a filter helper `filterNavByModules(nav, enabledModules)` that the layout consumes at render time.
- **`apps/web/src/app/[locale]/(school)/layout.tsx`** (and `(parent)/`, `(school)/_components/morph-shell/`) — apply the filter helper to the nav entries before passing them to the morph shell.
- **`apps/web/messages/en.json`** + every other locale JSON — add the `disabled.*` translation keys. (At minimum English and Arabic — Tier 2 locales add via the i18n parity script.)

---

## Hook (full content)

```tsx
// apps/web/src/hooks/use-module-enabled.ts

'use client';

import { useTenantContext } from '@/lib/contexts/tenant-context';
import { type ModuleKey, isModuleKey } from '@school/shared';

/**
 * Returns true if the given module key is enabled for the current tenant.
 * Returns true for unknown keys (not in the registry) so that core /
 * pre-existing surfaces don't get accidentally hidden.
 */
export function useModuleEnabled(key: ModuleKey | string): boolean {
  const { enabledModules } = useTenantContext();
  if (!isModuleKey(key)) {
    // Unknown keys are treated as core (always enabled).
    return true;
  }
  return enabledModules.includes(key);
}
```

## Component (full content)

```tsx
// apps/web/src/components/if-module-enabled.tsx

'use client';

import type { ReactNode } from 'react';
import type { ModuleKey } from '@school/shared';
import { useModuleEnabled } from '@/hooks/use-module-enabled';

interface IfModuleEnabledProps {
  module: ModuleKey;
  children: ReactNode;
  fallback?: ReactNode; // Optional alternative when disabled
}

export function IfModuleEnabled({ module, children, fallback = null }: IfModuleEnabledProps) {
  return useModuleEnabled(module) ? <>{children}</> : <>{fallback}</>;
}
```

## Disabled page (skeleton)

```tsx
// apps/web/src/app/[locale]/disabled/page.tsx

import { getTranslations } from 'next-intl/server';
import { DisabledContent } from './_components/disabled-content';

export default async function DisabledPage() {
  const t = await getTranslations('disabled');
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <DisabledContent title={t('title')} body={t('body')} returnHome={t('return_home')} />
    </main>
  );
}
```

```tsx
// apps/web/src/app/[locale]/disabled/_components/disabled-content.tsx

'use client';

import { useSearchParams, useRouter } from 'next/navigation';

export function DisabledContent({
  title,
  body,
  returnHome,
}: {
  title: string;
  body: string;
  returnHome: string;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const moduleKey = params.get('module') ?? 'unknown';

  return (
    <div className="max-w-md text-center">
      <h1 className="text-2xl font-medium text-text-primary">{title}</h1>
      <p className="mt-3 text-text-secondary">{body.replace('{module}', moduleKey)}</p>
      <button
        type="button"
        onClick={() => router.push('/')}
        className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        {returnHome}
      </button>
    </div>
  );
}
```

## Axios interceptor (skeleton)

```ts
// apps/web/src/lib/api/module-disabled-interceptor.ts

import type { AxiosError, AxiosInstance } from 'axios';
import { toast } from '@/components/ui/use-toast';

export function attachModuleDisabledInterceptor(client: AxiosInstance, getLocale: () => string) {
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<{ error?: { code?: string; module?: string; message?: string } }>) => {
      const payload = error.response?.data?.error;
      if (error.response?.status === 404 && payload?.code === 'MODULE_DISABLED') {
        toast({
          title: 'Feature unavailable',
          description: payload.message ?? 'This feature has been disabled by your administrator.',
          duration: 2000,
        });
        const locale = getLocale();
        window.location.href = `/${locale}/disabled?module=${payload.module ?? 'unknown'}`;
        return new Promise(() => {}); // never resolve — page is being replaced
      }
      return Promise.reject(error);
    },
  );
}
```

## Translation keys (en.json — others mirror via the existing parity script)

```json
{
  "disabled": {
    "title": "Feature unavailable",
    "body": "The feature you're trying to access ({module}) has been disabled by your school administrator. Please contact them if you believe this is a mistake.",
    "return_home": "Return to home"
  }
}
```

---

## Acceptance

- [ ] `useModuleEnabled` hook returns a boolean from the tenant context's `enabledModules` array.
- [ ] `<IfModuleEnabled>` component renders children only when enabled, optional fallback otherwise.
- [ ] `/me` endpoint returns `enabled_modules: ModuleKey[]` populated from `TenantModuleService.getEnabledModules`.
- [ ] Tenant context provider exposes `enabledModules` from the `/me` response on app boot.
- [ ] Morph-shell nav config supports an optional `moduleKey` field; `filterNavByModules(nav, enabledModules)` strips entries whose key is disabled.
- [ ] `/[locale]/disabled?module=<key>` page renders with locale-aware translations and a "return home" CTA.
- [ ] Axios interceptor catches `404 { code: 'MODULE_DISABLED' }`, shows toast, redirects to disabled page.
- [ ] Tests pass for hook, component, and interceptor (mocked axios).
- [ ] Manual e2e walkthrough: disable a module via direct DB update, refresh the app, confirm nav hides the hub; navigate directly to that module's URL, confirm redirect to disabled page with toast.

---

## Notes

- The interceptor uses `window.location.href` (full page navigation) rather than Next router push. This is intentional — it forces a fresh boot and `/me` re-fetch, avoiding any stale React Query cache for the disabled module's data.
- The `useModuleEnabled` hook returns `true` for unknown keys. This is deliberate: core modules (e.g., `students`, `attendance`) are not in the registry, but a developer might mistakenly call `useModuleEnabled('students')`. Returning `true` for unknown keys avoids breaking core surfaces if someone misuses the hook. The lint rule introduced in implementation 07 catches typos against the canonical list.
- The Tier 2 locales (Italian, Romanian) need the `disabled.*` translations too. The existing i18n check script (`scripts/check-i18n.js`) will flag missing keys; per the `tier-scopes.ts` contract, the `disabled` namespace must be added to both Tier 1 and Tier 2 scopes.
