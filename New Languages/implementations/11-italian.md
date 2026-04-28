# Implementation 11 — Italian (`it`) Tier 2 Catalogue

> **Phase:** 5 — Tier 2 Languages (was P5-IT)
> **Wave:** 11 (serial — first Tier 2 implementation; introduces the Tier 2 runtime guard)
> **Depends on:** 10 complete & deployed
> **Deploys:** API restart + worker restart + web restart
> **Model:** Sonnet 4.6 / Max effort (Romance language, well-supported; Sonnet sufficient)

---

## Goal

Ship Italian (`it`) as the **first** Tier 2 locale. Tier 2 means: parent + student surface only — staff/admin/regulatory/payroll/HR/finance back-office namespaces are NOT translated and the `it.json` file simply doesn't have keys for them.

After this implementation:

- `apps/web/messages/it.json` exists with 100% parity against the Tier 2 namespace allowlist (see `apps/web/i18n/tier-scopes.ts` from implementation 01).
- Notification catalogue: `notifications.it.json` covers ONLY parent-relevant notification keys (subset of the system notification keys).
- PDF catalogues: `messages/{type}.it.json` for ONLY parent-relevant types (`receipt`, `invoice`, `household-statement`, `report-card`). NOT for staff types like `des-inspection`, `safeguarding-compliance`, `payslip`, `pastoral-summary`, `sst-activity`, `transcript`, `trip-leader-pack`, `wellbeing-programme`, `report-card-modern` (modern variant if staff-only).
- **NEW: route-level Tier 2 guard.** When the resolved user locale is `it` (or any other Tier 2 locale) and they navigate to an out-of-scope path, the request redirects to the same path under the tenant's default locale.
- Registry: `it.active = true`, `tier: 2`.
- Playwright `it-ltr` + `it-mobile` projects with baselines covering parent + student surfaces only.
- NHQS gets `'it'` appended to `supported_locales`.
- Translation parity test enforces 100% match against the allowlist subset for `it`, ignores out-of-scope namespaces.

## Critical safety constraints

- **Tier 2 parity test is allowlist-bound.** Confirm `translation-parity.spec.ts` from 02 is correctly handling the `tier: 2` branch via `TIER_2_NAMESPACES`. If it isn't, fix that test FIRST (cross-reference 02 Task 2).
- **Out-of-scope keys must be ABSENT from `it.json`** (not present-but-empty). The parity test asserts both directions: every in-scope English key has an Italian translation, AND no out-of-scope keys appear in Italian.
- **The route-level guard MUST NOT 500.** A Tier 2 user navigating to `/it/finance/payroll` redirects (`307` or `308`) to `/<default>/finance/payroll`. It does NOT throw `MISSING_MESSAGE`.
- **Hard-error for IN-scope missing keys still applies.** If a parent-portal page references a key the it.json file forgot, that 500s. Parity test catches this in CI.

---

## Files to create / modify

### Translations (Tier 2 subset only)

- **Create:** `apps/web/messages/it.json` — only namespaces in `TIER_2_NAMESPACES`.
- **Create:** `apps/api/src/modules/notifications/messages/notifications.it.json` — only parent-relevant keys.
- **Create:** `apps/api/src/modules/pdf-rendering/templates/messages/{receipt|invoice|household-statement|report-card}.it.json`.

### Route guard

- **Create:** `apps/web/src/middleware/tier2-route-guard.ts` (or extend the existing middleware).
- **Modify:** `apps/web/src/middleware.ts` to invoke the guard.
- **Create:** `apps/web/i18n/tier-routes.ts` — maps URL prefixes to namespaces and decides if a path is in-scope for Tier 2.
- **Create:** `apps/web/i18n/tier-routes.spec.ts` — unit test the in-scope decision function.

### Registry

- **Modify:** `apps/web/i18n/registry.ts` — flip `it.active = true`.

### Playwright

- **Modify:** `apps/web/e2e/playwright.config.ts` — add `it-ltr` + `it-mobile` projects (parent + student routes only).
- **Create baselines** under `apps/web/e2e/__snapshots__/.../it-ltr/` for parent + student surface.
- **Create:** `apps/web/e2e/tier2-route-guard.spec.ts` — Playwright test that visiting `/it/<staff-route>` redirects to the default locale.

### Glossary

- **Modify:** `New Languages/glossary.md` — add Italian column (Tier 2 entries only need parent-relevant terms).

### Tenant rollout

- Apply on prod: `UPDATE tenants SET supported_locales = supported_locales || '{it}'::text[] WHERE slug = 'nhqs';`

### Docs

- **Modify:** `New Languages/IMPLEMENTATION_LOG.md`
- **Modify:** `docs/architecture/danger-zones.md` — add Tier 2 guard entry.

---

## Detailed task breakdown

### Task 1 — Build the Tier 2 route guard

This is the new infrastructure piece that lands with the first Tier 2 implementation. Subsequent Tier 2 implementations (12, 13) reuse it.

**Files:**

- Create: `apps/web/i18n/tier-routes.ts`
- Create: `apps/web/i18n/tier-routes.spec.ts`
- Create: `apps/web/src/middleware/tier2-route-guard.ts`
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1.1 — Test the in-scope decision first:**

```ts
// apps/web/i18n/tier-routes.spec.ts
import { isPathInTier2Scope } from './tier-routes';

describe('isPathInTier2Scope', () => {
  it('parent routes are in scope', () => {
    expect(isPathInTier2Scope('/parent/dashboard')).toBe(true);
    expect(isPathInTier2Scope('/parent/household')).toBe(true);
    expect(isPathInTier2Scope('/parent/children/abc/grades')).toBe(true);
  });

  it('student routes are in scope', () => {
    expect(isPathInTier2Scope('/student/dashboard')).toBe(true);
  });

  it('public routes are in scope', () => {
    expect(isPathInTier2Scope('/login')).toBe(true);
    expect(isPathInTier2Scope('/register')).toBe(true);
    expect(isPathInTier2Scope('/contact')).toBe(true);
  });

  it('staff/admin/regulatory routes are out of scope', () => {
    expect(isPathInTier2Scope('/finance/payroll')).toBe(false);
    expect(isPathInTier2Scope('/admin/tenants')).toBe(false);
    expect(isPathInTier2Scope('/regulatory/des-inspection')).toBe(false);
    expect(isPathInTier2Scope('/staff/dashboard')).toBe(false);
    expect(isPathInTier2Scope('/settings/users')).toBe(false);
  });

  it('locale prefix is stripped before matching', () => {
    expect(isPathInTier2Scope('/it/parent/dashboard')).toBe(true);
    expect(isPathInTier2Scope('/it/finance/payroll')).toBe(false);
  });
});
```

- [ ] **Step 1.2 — Implement:**

```ts
// apps/web/i18n/tier-routes.ts
//
// Decide whether a given URL path is in scope for Tier 2 locales (parent +
// student surface). Out-of-scope paths trigger a redirect to the tenant
// default locale via the middleware guard.

import { REGISTERED_LOCALE_CODES } from './registry';

const IN_SCOPE_PREFIXES = [
  '/parent',
  '/student',
  '/profile', // user profile is in scope
  '/login',
  '/logout',
  '/register',
  '/forgot-password',
  '/mfa',
  '/contact',
  '/admissions', // public admissions
  '/verification',
  '/', // landing
];

const OUT_OF_SCOPE_PREFIXES = [
  '/staff',
  '/teacher',
  '/admin',
  '/platform',
  '/finance',
  '/regulatory',
  '/safeguarding',
  '/payroll',
  '/hr',
  '/leave',
  '/scheduler',
  '/gradebook',
  '/reports', // staff reports authoring (parent report viewing is under /parent/.../reports)
  '/behaviour', // staff behaviour module (parent view is under /parent/...)
  '/settings',
];

function stripLocalePrefix(path: string): string {
  const segs = path.split('/');
  if (segs.length >= 2 && REGISTERED_LOCALE_CODES.includes(segs[1]!)) {
    return '/' + segs.slice(2).join('/');
  }
  return path;
}

export function isPathInTier2Scope(path: string): boolean {
  const stripped = stripLocalePrefix(path);
  // Out-of-scope wins ties (in case of overlapping prefixes — none today, but safe).
  if (OUT_OF_SCOPE_PREFIXES.some((p) => stripped === p || stripped.startsWith(p + '/')))
    return false;
  if (
    IN_SCOPE_PREFIXES.some((p) => stripped === p || stripped.startsWith(p === '/' ? '/' : p + '/'))
  )
    return true;
  // Default: out of scope (safer to redirect than to surface a missing-key 500).
  return false;
}
```

- [ ] **Step 1.3 — The guard:**

```ts
// apps/web/src/middleware/tier2-route-guard.ts
import { NextRequest, NextResponse } from 'next/server';

import { LOCALE_REGISTRY } from '../../i18n/registry';
import { isPathInTier2Scope } from '../../i18n/tier-routes';

/**
 * If the URL locale is a Tier 2 locale AND the path is out of scope, redirect
 * to the same path under the tenant default locale (read from a cookie or
 * inferred elsewhere).
 *
 * Returns null if no redirect is needed (the caller continues to the next
 * middleware step).
 */
export function tier2RouteGuard(req: NextRequest): NextResponse | null {
  const url = new URL(req.url);
  const segs = url.pathname.split('/');
  const localeSeg = segs[1];
  if (!localeSeg) return null;

  const entry = LOCALE_REGISTRY.find((l) => l.code === localeSeg);
  if (!entry || entry.tier !== 2 || !entry.active) return null;

  if (isPathInTier2Scope(url.pathname)) return null;

  // Out-of-scope: redirect to tenant default. Read the default from a cookie
  // set on login (existing infra), fallback to 'en'.
  const tenantDefault = req.cookies.get('tenant_default_locale')?.value ?? 'en';
  segs[1] = tenantDefault;
  url.pathname = segs.join('/');
  return NextResponse.redirect(url, 308); // permanent — user-bookmarked URL repairs
}
```

- [ ] **Step 1.4 — Wire into existing middleware** (`apps/web/src/middleware.ts`). It already runs auth + locale resolution; insert the guard call before the next-intl handoff:

```ts
// In middleware.ts:
import { tier2RouteGuard } from './middleware/tier2-route-guard';

export function middleware(req: NextRequest) {
  // ...existing checks...
  const tier2Redirect = tier2RouteGuard(req);
  if (tier2Redirect) return tier2Redirect;
  // ...existing next-intl handoff...
}
```

- [ ] **Step 1.5 — Run unit + Playwright redirect smoke** (Playwright test created in Task 7).
- [ ] **Step 1.6 — Commit:**

```bash
git add apps/web/i18n/tier-routes.ts apps/web/i18n/tier-routes.spec.ts apps/web/src/middleware/tier2-route-guard.ts apps/web/src/middleware.ts
git commit -m "feat(i18n): Tier 2 route guard — redirect out-of-scope paths to tenant default"
```

### Task 2 — Extend the glossary with Italian (Tier 2 subset)

Same shape as 07/08/09/10 glossary tasks. Italian is similar to French in difficulty — most terms borrow recognisably from Latin / Romance roots. Focus on parent-facing terms (Tier 2 doesn't need staff/admin/regulatory glossary).

```markdown
| English term           | Italian                      | Notes                                                                      |
| ---------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| Parent–teacher meeting | Riunione genitori-insegnanti | Standard term                                                              |
| Report card            | Pagella                      |                                                                            |
| Attendance             | Frequenza                    |                                                                            |
| Tuition fees           | Rette scolastiche            |                                                                            |
| Receipt                | Ricevuta                     |                                                                            |
| Invoice                | Fattura                      |                                                                            |
| Statement              | Estratto conto               |                                                                            |
| Behaviour              | Condotta                     | "Comportamento" also acceptable; "condotta" is more formal/school-specific |
| Year group / class     | Classe                       |                                                                            |
| Headteacher            | Dirigente scolastico         | Or "preside" (less formal)                                                 |
```

### Task 3 — Generate the Italian Tier 2 catalogue

Sub-agent prompt customisations:

```
Translate from English to Italian for the parent + student surface ONLY.
Use formal "Lei" address (schools talk to parents formally).
Use Standard Italian (Toscano-Romano register), not regional variants.
Hard rules 1-10 same as 07.
11. Translate ONLY the namespaces in this allowlist: <paste TIER_2_NAMESPACES>
12. Do NOT translate any string outside the allowlist.
```

- [ ] **Step 3.1 — Build the Tier 2 subset of `en.json`** to feed sub-agents:

```bash
# Build a slice of en.json restricted to Tier 2 namespaces.
node -e '
const ns = [/* paste TIER_2_NAMESPACES here */];
const en = JSON.parse(require("fs").readFileSync("apps/web/messages/en.json", "utf8"));
const out = {};
for (const path of ns) {
  const segs = path.split(".");
  let src = en, dst = out;
  for (let i = 0; i < segs.length - 1; i++) {
    if (!src[segs[i]]) break;
    dst[segs[i]] = dst[segs[i]] || {};
    src = src[segs[i]]; dst = dst[segs[i]];
  }
  const last = segs[segs.length - 1];
  if (src && src[last] !== undefined) dst[last] = src[last];
}
process.stdout.write(JSON.stringify(out, null, 2));
' > /tmp/en-tier2-subset.json
```

- [ ] **Step 3.2 — Dispatch sub-agents** (Sonnet 4.6 — cheaper, sufficient for IT) to translate batches of the subset.
- [ ] **Step 3.3 — Merge into `apps/web/messages/it.json`.** Run parity:

```bash
pnpm --filter @school/web test -- translation-parity
```

It will run the Tier 2 branch for `it`. Expect green.

- [ ] **Step 3.4 — Commit:**

```bash
git add apps/web/messages/it.json
git commit -m "feat(i18n): add Italian Tier 2 catalogue (parent + student surface)"
```

### Task 4 — Notification + parent-relevant PDF catalogues

- [ ] **Step 4.1 — Build a parent-relevant subset of `notifications.en.json`** (skip staff-only template keys like `incident_logged_to_staff` if any). Translate. Save as `notifications.it.json`.
- [ ] **Step 4.2 — Translate the 4 parent-relevant PDF templates' message catalogues** (`receipt.it.json`, `invoice.it.json`, `household-statement.it.json`, `report-card.it.json`).
- [ ] **Step 4.3 — Update the renderer to gracefully handle missing locale catalogues for non-parent PDF types**: if a staff user (locale resolution returns the tenant default, never a Tier 2 locale) requests a payslip, no Italian catalogue is needed. The renderer already throws `MISSING_NOTIFICATION_LOCALE` — that's correct behaviour because a Tier 2 user shouldn't be receiving a payslip notification anyway. But add a defensive check: if the resolved render locale isn't in `tenant.supported_locales`, fall back to default.

- [ ] **Step 4.4 — Commit.**

### Task 5 — Registry flip + Playwright

- [ ] **Step 5.1 — `it.active = true` in registry.**
- [ ] **Step 5.2 — Add `it-ltr` + `it-mobile` projects.** **Restrict the project's testMatch** to parent + student + public spec files only — staff specs would fail because the routes redirect under Tier 2.
- [ ] **Step 5.3 — Generate baselines** (parent + student surface only).

### Task 6 — Tier 2 leak detector

Same pattern as 07–10, but only for parent + student routes (not finance, not regulatory).

### Task 7 — Tier 2 redirect Playwright test

```ts
// apps/web/e2e/tier2-route-guard.spec.ts
import { test, expect } from '@playwright/test';

test('Tier 2 user navigating to /it/finance/payroll redirects to tenant default', async ({
  page,
}) => {
  // ... set tenant_default_locale cookie to 'en' and visit:
  await page.goto('/it/finance/payroll');
  await page.waitForURL('**/en/finance/payroll');
  expect(page.url()).toContain('/en/finance/payroll');
});

test('Tier 2 user navigating to /it/parent/dashboard stays on the it segment', async ({ page }) => {
  await page.goto('/it/parent/dashboard');
  await page.waitForURL('**/it/parent/dashboard');
  expect(page.url()).toContain('/it/parent/dashboard');
});
```

### Task 8 — Push, deploy, NHQS rollout

Same as 07. Enable `it` for NHQS via SQL.

### Task 9 — Production verification

- [ ] **Step 9.1 — Smoke parent flows in Italian.**
- [ ] **Step 9.2 — Visit `/it/finance/payroll` directly** — confirm redirect to `/en/finance/payroll` (or whatever the tenant default is).
- [ ] **Step 9.3 — No `MISSING_MESSAGE` events in Sentry.**
- [ ] **Step 9.4 — Append completion entry to `IMPLEMENTATION_LOG.md`.**

---

## Acceptance criteria

- [ ] `it.json` parity 100% against the Tier 2 allowlist subset
- [ ] `it.json` contains NO out-of-scope keys (parity asserts this)
- [ ] Notification + parent PDF catalogues exist
- [ ] Registry: `it.active = true`, `tier: 2`
- [ ] Tier 2 route guard redirects out-of-scope paths under `/it`
- [ ] Playwright it-ltr + it-mobile + baselines (parent + student only)
- [ ] Tier 2 redirect spec passes
- [ ] No `MISSING_MESSAGE` in Sentry on parent + student `[it]` routes
- [ ] CI green; production deploy successful
- [ ] NHQS `supported_locales` includes `it`
- [ ] en+ar+fr+es+de+ga regression clean
- [ ] Glossary updated
- [ ] `IMPLEMENTATION_LOG.md` updated

---

## Verification commands

```bash
turbo lint && turbo type-check && turbo test
pnpm --filter @school/web exec playwright test --project=it-ltr --project=it-mobile
pnpm --filter @school/web exec playwright test --grep "tier2-route-guard"
pnpm --filter @school/web exec playwright test --grep "@locale-leak it"

# Post-deploy
APP_URL=https://nhqs.edupod.app pnpm --filter @school/web exec playwright test --project=it-ltr --grep "@smoke"
```

---

## Rollback

Same as 07. `array_remove(supported_locales, 'it')` and revert code commits.

---

## Notes for the executor

- The Tier 2 route guard is shipped HERE. Implementations 12 and 13 reuse it without adding a new guard — they just rely on `tier: 2` in their registry entries.
- Italian is the easiest Tier 2 language. Sonnet 4.6 / Max effort handles it well. Don't escalate to Opus unnecessarily.
- The glossary doesn't need to be exhaustive for Tier 2 — only parent-facing terms.
- Watch for "Lei" vs "tu" register slips. Default to "Lei" (formal). Schools never address parents informally.
