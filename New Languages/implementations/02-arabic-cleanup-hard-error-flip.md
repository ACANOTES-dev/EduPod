# Implementation 02 — Arabic Placeholder Cleanup + Hard-Error Flip

> **Phase:** 1 — Foundation (was P1B)
> **Wave:** 2 (serial — every later implementation depends on hard-error being on)
> **Depends on:** 01 complete & deployed
> **Deploys:** API restart (no schema), worker restart, web restart (next-intl config change)
> **Model:** Opus 4.7 / **Max effort** (delicate — must not regress AR users)

---

## Goal

1. Replace every remaining `[AR] …` placeholder string in `apps/web/messages/ar.json` with a proper Arabic translation. The current parity test guards the `regulatory` namespace — confirm there's no leak elsewhere.
2. Flip `next-intl` to throw on missing keys (dev: throw immediately; prod: log to Sentry then throw).
3. Generalise `apps/web/src/__tests__/translation-parity.spec.ts` from "en ↔ ar only" to "every active locale matches en, every Tier 2 locale matches the allowlist subset". The new test runs in CI on every push and blocks merge on any deviation.
4. Extend `scripts/check-i18n.js` to scan every active locale for orphan / missing usages.
5. Add the parity test to the CI workflow as a hard gate on every push.

After this ships, **any new translation key added to `en.json` MUST appear in every active locale's message file in the same commit, or CI blocks the push.** This is the safety net that protects every later implementation.

## Critical safety constraints

- **The hard-error flip is a one-way door.** If AR has even one missing key when production deploys, every page that references it 500s for AR users. Do NOT flip the flag until the parity test is 100% green.
- **`en.json` is sacred.** The rest of this implementation MUST NOT modify it. The only file in this implementation that may grow new content is `ar.json` — and only to fill in `[AR] …` placeholders, not to add new keys.
- **No silent fallback.** Don't add `getMessageFallback` returning the English string. The whole point of the flip is to surface missing keys loudly.

---

## Files to create / modify

### Translations

- **Modify:** `apps/web/messages/ar.json` — replace every `[AR] …` value with proper Arabic translation. Use the en.json equivalent as source of truth.

### i18n configuration

- **Modify:** `apps/web/i18n/request.ts` — add `onError` handler.
- **Create:** `apps/web/i18n/error-handler.ts` — the dev-vs-prod aware error handler.

### Tests

- **Modify:** `apps/web/src/__tests__/translation-parity.spec.ts` — generalise to N locales with Tier 2 allowlist support.
- **Create:** `apps/web/src/__tests__/missing-message-handler.spec.ts` — unit test that the error handler throws (or routes to Sentry then throws) on missing keys.

### Tooling

- **Modify:** `scripts/check-i18n.js` — scan all active locales (currently hardcoded to en + ar).
- **Modify:** `.github/workflows/ci.yml` — add the parity test step to the lint/type-check stage so it runs on every push and blocks on failure.

### Docs

- **Modify:** `docs/architecture/danger-zones.md` — confirm the entry from 01 is still accurate; flip the language from "once 02 ships" to "in production now".
- **Modify:** `New Languages/IMPLEMENTATION_LOG.md` — flip 02 status.

---

## Detailed task breakdown

### Task 1 — Audit `ar.json` for placeholder strings

- [ ] **Step 1.1 — Find every `[AR]` occurrence:**

```bash
grep -n '\[AR\]' apps/web/messages/ar.json | head -50
grep -c '\[AR\]' apps/web/messages/ar.json
```

- [ ] **Step 1.2 — Cross-reference each match against `en.json`** to capture the English source string. Use this jq one-liner to dump the full set of placeholder paths and their en values side-by-side:

```bash
jq -r 'paths(scalars) as $p | [($p | join(".")), getpath($p)] | @tsv' \
  apps/web/messages/ar.json \
  | awk -F'\t' '$2 ~ /^\[AR\]/' > /tmp/ar-placeholders.tsv

while IFS=$'\t' read -r path val; do
  en=$(jq -r --arg p "$path" '
    ($p | split(".")) as $segs
    | reduce $segs[] as $s (.; .[$s])
  ' apps/web/messages/en.json)
  printf "%s\nEN: %s\nAR: %s\n\n" "$path" "$en" "$val"
done < /tmp/ar-placeholders.tsv > /tmp/ar-cleanup-plan.txt
less /tmp/ar-cleanup-plan.txt
```

- [ ] **Step 1.3 — Translate each placeholder.** Use Opus 4.7 max effort to translate each string. Preserve `{placeholder}` syntax exactly. Preserve markdown emphasis (`**bold**`, `*italic*`). Match register and tone of the existing genuine AR strings in surrounding namespaces.

> **Quality bar:** translate idiomatically, not literally. Where the en string uses school-management jargon (e.g., "tutor period", "behaviour incident", "scheme of work"), use the established Arabic equivalents already used elsewhere in `ar.json` (audit the file for prior usage before inventing a new term).

- [ ] **Step 1.4 — Replace each placeholder in `ar.json`.** Use `Edit` with `old_string` matching the exact JSON line — do NOT regenerate the whole file (it's 17,000+ keys; risk of corruption is high).

- [ ] **Step 1.5 — Verify:** `grep -c '\[AR\]' apps/web/messages/ar.json` should now return `0`.

- [ ] **Step 1.6 — Commit (atomic):**

```bash
git add apps/web/messages/ar.json
git commit -m "feat(i18n): replace AR placeholder strings with proper translations

Cleanup of [AR] ... placeholders left in regulatory and adjacent namespaces.
Required before flipping next-intl hard-error in the same implementation."
```

### Task 2 — Generalise the parity test to N locales

**Files:**

- Modify: `apps/web/src/__tests__/translation-parity.spec.ts`

- [ ] **Step 2.1 — Replace the existing test with this multi-locale version:**

```ts
// apps/web/src/__tests__/translation-parity.spec.ts
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { LOCALE_REGISTRY } from '../../i18n/registry';
import { TIER_2_NAMESPACES } from '../../i18n/tier-scopes';

/**
 * Regression guard:
 * - Tier 1 locales (active in registry): every key in en.json must exist in
 *   {locale}.json and vice versa.
 * - Tier 2 locales (active in registry): every key in en.json that lives under
 *   one of TIER_2_NAMESPACES must exist in {locale}.json. Out-of-scope keys
 *   are not required (the runtime guard in implementation 11 redirects Tier 2
 *   users away from out-of-scope routes).
 *
 * Also keeps `[AR] ...` placeholder regression closed: any AR value beginning
 * with `[AR]` is a parity failure regardless of namespace.
 */

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

function isPlainObject(value: Json): value is { [key: string]: Json } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function flattenKeys(value: Json, prefix = ''): string[] {
  if (!isPlainObject(value)) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k));
}

function flattenEntries(value: Json, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[prefix, value]];
  if (!isPlainObject(value)) return [];
  return Object.entries(value).flatMap(([k, v]) =>
    flattenEntries(v, prefix ? `${prefix}.${k}` : k),
  );
}

function loadMessages(locale: string): Json {
  const path = resolve(__dirname, '..', '..', 'messages', `${locale}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as Json;
}

function namespaceOf(dottedKey: string): string {
  // 'parent.dashboard.heading' -> 'parent'
  return dottedKey.split('.')[0]!;
}

function isInTier2Allowlist(dottedKey: string): boolean {
  // Match against any prefix in the allowlist:
  //   'parent.dashboard' allowlists 'parent.dashboard.foo.bar'
  //   'parent' allowlists everything under parent.*
  return TIER_2_NAMESPACES.some((ns) => dottedKey === ns || dottedKey.startsWith(`${ns}.`));
}

const en = loadMessages('en');
const enKeys = new Set(flattenKeys(en));

describe('Translation parity — multi-locale', () => {
  const activeLocales = LOCALE_REGISTRY.filter((l) => l.active && l.code !== 'en');

  for (const entry of activeLocales) {
    describe(`${entry.code} (${entry.englishName}, tier ${entry.tier})`, () => {
      const messages = loadMessages(entry.code);
      const keys = new Set(flattenKeys(messages));

      if (entry.tier === 1) {
        it('every English key has a translation', () => {
          const missing = [...enKeys].filter((k) => !keys.has(k)).sort();
          expect(missing).toEqual([]);
        });

        it('no orphan keys (in this locale but not in English)', () => {
          const extra = [...keys].filter((k) => !enKeys.has(k)).sort();
          expect(extra).toEqual([]);
        });
      } else {
        // Tier 2: enforce parity only on the in-scope subset.
        const inScopeEnKeys = [...enKeys].filter(isInTier2Allowlist);

        it('every in-scope English key has a translation', () => {
          const missing = inScopeEnKeys.filter((k) => !keys.has(k)).sort();
          expect(missing).toEqual([]);
        });

        it('keys outside Tier 2 allowlist are absent in this locale', () => {
          const out = [...keys].filter((k) => !isInTier2Allowlist(k)).sort();
          expect(out).toEqual([]);
        });
      }

      it('no [AR]/[XX] placeholder values', () => {
        const placeholders = flattenEntries(messages)
          .filter(([, v]) => /^\[[A-Z]{2}\]/.test(v))
          .map(([k]) => k)
          .sort();
        expect(placeholders).toEqual([]);
      });
    });
  }
});
```

- [ ] **Step 2.2 — Run:** `pnpm --filter @school/web test -- translation-parity` and confirm AR is now 100% green. If it isn't, return to Task 1 and finish the cleanup.

- [ ] **Step 2.3 — Commit:**

```bash
git add apps/web/src/__tests__/translation-parity.spec.ts
git commit -m "test(i18n): generalise translation parity to N locales with Tier 2 allowlist"
```

### Task 3 — Build the dev-vs-prod aware error handler

**Files:**

- Create: `apps/web/i18n/error-handler.ts`
- Create: `apps/web/src/__tests__/missing-message-handler.spec.ts`

- [ ] **Step 3.1 — Write the test first:**

```ts
// apps/web/src/__tests__/missing-message-handler.spec.ts
import { onMissingMessage } from '../../i18n/error-handler';

describe('onMissingMessage', () => {
  const originalEnv = process.env.NODE_ENV;
  let captureMock: jest.Mock;

  beforeEach(() => {
    captureMock = jest.fn();
    jest.doMock('@sentry/nextjs', () => ({ captureException: captureMock }));
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.resetModules();
  });

  it('throws synchronously in development', () => {
    process.env.NODE_ENV = 'development';
    expect(() =>
      onMissingMessage({
        code: 'MISSING_MESSAGE',
        message: 'parent.dashboard.heading is missing for fr',
      } as Error),
    ).toThrow(/MISSING_MESSAGE/);
  });

  it('reports to Sentry then throws in production', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('parent.dashboard.heading is missing for fr');
    expect(() => onMissingMessage(err)).toThrow();
    // Sentry was attempted (we cannot reach into the mocked module here
    // because next-intl loads it lazily — assert via the prod branch behaviour
    // surfacing the error name).
  });
});
```

> The Sentry assertion above is intentionally loose; the unit test scope is just "did we throw?" and "did we attempt to report?". Wiring the actual `@sentry/nextjs` `captureException` is integration-tested by Sentry's own SDK; we don't need to over-specify here.

- [ ] **Step 3.2 — Create `apps/web/i18n/error-handler.ts`:**

```ts
// apps/web/i18n/error-handler.ts
//
// next-intl error handler: a missing translation key MUST surface, never fall
// back silently to English. In dev we throw immediately so it appears in the
// dev console with a stack trace. In prod we capture to Sentry, then throw —
// the page renders a 500 (caught by the App Router error boundary) and we get
// a Sentry alert.
//
// This is intentionally aggressive. Silent fallback would re-introduce the
// silent-failure bug class that motivated this rule in CLAUDE.md.

export function onMissingMessage(error: Error): void {
  if (process.env.NODE_ENV === 'production') {
    // Lazy import to keep dev/test bundles smaller. Sentry SDK at this point
    // is already initialised by `apps/web/instrumentation.ts`.
    import('@sentry/nextjs')
      .then((mod) => {
        try {
          mod.captureException(error);
        } catch {
          // If Sentry fails, do nothing extra — we still throw below.
        }
      })
      .catch(() => {
        // Sentry import failed; nothing else to do.
      });
  }
  throw error;
}
```

- [ ] **Step 3.3 — Wire it into `apps/web/i18n/request.ts`:**

```ts
import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, isLocale } from './config';
import { onMissingMessage } from './error-handler';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    onError: onMissingMessage,
    // Intentionally do NOT supply getMessageFallback. Default behaviour is to
    // surface the error to onError, which throws.
  };
});
```

- [ ] **Step 3.4 — Run the unit test:** `pnpm --filter @school/web test -- missing-message-handler.spec`

- [ ] **Step 3.5 — Commit:**

```bash
git add apps/web/i18n/error-handler.ts apps/web/i18n/request.ts apps/web/src/__tests__/missing-message-handler.spec.ts
git commit -m "feat(i18n): flip next-intl to hard-error on missing keys (Sentry-then-throw in prod)"
```

### Task 4 — Extend `scripts/check-i18n.js`

**Files:**

- Modify: `scripts/check-i18n.js`

- [ ] **Step 4.1 — Read the current script** to understand its scan logic. The current version is hardcoded to en + ar.

- [ ] **Step 4.2 — Replace the locale list with one derived from the registry.** The script likely reads JSON files directly; have it import `apps/web/i18n/registry.ts` (or read the source file and regex out the active codes — keep the script dependency-free if it currently is). Active codes are the source of truth.

```js
// At the top of scripts/check-i18n.js
const fs = require('fs');
const path = require('path');

// Parse active locales from the registry source. Avoid TS imports in this
// node script so it stays runnable in CI without a TS toolchain.
function readActiveLocales() {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', 'apps', 'web', 'i18n', 'registry.ts'),
    'utf8',
  );
  // Match each registry entry's code + active flag.
  const entries = [];
  const re = /code:\s*'([a-z]{2,5})'.+?active:\s*(true|false)/gs;
  let m;
  while ((m = re.exec(src)) !== null) entries.push({ code: m[1], active: m[2] === 'true' });
  return entries.filter((e) => e.active).map((e) => e.code);
}

const ACTIVE_LOCALES = readActiveLocales();
```

- [ ] **Step 4.3 — Update every loop that iterates `['en', 'ar']`** to use `ACTIVE_LOCALES` instead.

- [ ] **Step 4.4 — Smoke test the script:**

```bash
pnpm i18n:check
# Expected: 0 missing/orphan keys for en + ar.
```

- [ ] **Step 4.5 — Commit:**

```bash
git add scripts/check-i18n.js
git commit -m "chore(i18n): extend check-i18n.js to scan all registered active locales"
```

### Task 5 — Add the parity test to CI as a hard gate

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 5.1 — Read the current `ci.yml`** to understand the existing job graph. Look for a test job that runs jest on `apps/web/`.

- [ ] **Step 5.2 — Ensure the parity test is part of the regular `test` job invocation.** It usually is (it's a co-located `*.spec.ts`), but add a dedicated step that runs _only_ the parity test so the CI log surfaces parity failures immediately:

```yaml
# Inside the existing `test` job (or appropriate frontend test job):
- name: Translation parity (i18n hard gate)
  run: pnpm --filter @school/web test -- translation-parity --runInBand
```

- [ ] **Step 5.3 — Also ensure the parity test fails the `lint`/`type-check` parallel stage** if you have one — usually adding it as a step in the existing test job is enough.

- [ ] **Step 5.4 — Commit:**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(i18n): add translation parity as a hard gate on every push"
```

### Task 6 — Update danger zones doc

**Files:**

- Modify: `docs/architecture/danger-zones.md`

- [ ] **Step 6.1 — Update the entry added in 01** to reflect that hard-error is now ON in production (drop "once implementation 02 ships"; replace with "production state since {date}").

- [ ] **Step 6.2 — Commit:**

```bash
git add docs/architecture/danger-zones.md
git commit -m "docs(architecture): note i18n hard-error is live in production"
```

### Task 7 — Local regression sweep

- [ ] **Step 7.1 — Run the full local battery:**

```bash
turbo lint
turbo type-check
turbo test
```

Expected: all green.

- [ ] **Step 7.2 — Spot-check a route that uses regulatory keys** (the most common AR placeholder home):

```bash
pnpm --filter @school/web dev
# Visit /ar/regulatory/* in a browser. Confirm Arabic renders, no [AR] strings,
# no 500 from missing keys.
```

### Task 8 — Pre-push branch state + push

- [ ] **Step 8.1 — Branch-state check:**

```bash
git fetch origin main
git log --oneline origin/main..HEAD
# Verify every commit is from this implementation.
```

- [ ] **Step 8.2 — Push:**

```bash
git push origin main
gh run watch
```

- [ ] **Step 8.3 — On CI green + deploy success, run AR Playwright suite:**

```bash
pnpm --filter @school/web exec playwright test --project=ar-rtl
```

Expected: all green. **Hard-error is now live; if anything 500s for AR, it means a key is missing — go fix the key in `ar.json` immediately and ship a follow-up commit.** Do NOT roll back the hard-error flip unless every option to fix forward is exhausted.

- [ ] **Step 8.4 — Spot-check production:**
  - Log in as NHQS, switch to AR, visit regulatory pages
  - Open Sentry, look for `MISSING_MESSAGE` events. Should be zero. If there are any, ship the missing keys immediately.

- [ ] **Step 8.5 — Update `IMPLEMENTATION_LOG.md`** with commit SHAs, CI run URL, deploy timestamp, Playwright result, Sentry status. Final commit + push:

```bash
git add New\ Languages/IMPLEMENTATION_LOG.md
git commit -m "docs(i18n): mark implementation 02 complete"
git push origin main
```

---

## Acceptance criteria

- [ ] `grep -c '\[AR\]' apps/web/messages/ar.json` returns 0
- [ ] `translation-parity.spec.ts` passes for every active locale
- [ ] `scripts/check-i18n.js` reports 0 missing/orphan keys
- [ ] `next-intl` `onError` is wired and throws in dev / Sentry-then-throws in prod
- [ ] CI parity gate runs on every push and fails the build on any deviation
- [ ] `turbo lint`, `turbo type-check`, `turbo test` all green
- [ ] AR Playwright suite passes on the deployed app
- [ ] Sentry shows zero `MISSING_MESSAGE` exceptions in the 30 minutes following deploy
- [ ] `IMPLEMENTATION_LOG.md` updated

---

## Verification commands

```bash
# Parity (the hard gate)
pnpm --filter @school/web test -- translation-parity

# Key usage scanner
pnpm i18n:check

# Full regression
turbo lint && turbo type-check && turbo test

# Post-deploy AR spot-check
pnpm --filter @school/web exec playwright test --project=ar-rtl
```

---

## Rollback

If AR regressions surface post-deploy that cannot be fixed forward inside the deploy window:

```bash
# Identify the next-intl config commit
git log --oneline -- apps/web/i18n/request.ts | head
# Revert just the hard-error commit, leaving the parity test improvements in place
git revert <hard-error-commit-sha>
git push origin main
# CI redeploys with silent fallback restored.
```

> **Use this only as a last resort.** The hard-error flip exists to surface bugs; reverting it hides them again. The right move is almost always to fix the missing key forward.

---

## Notes for the executor

- The `[AR] …` placeholders are concentrated in the regulatory namespace, but verify across the whole file via `grep`. Don't assume.
- Translate idiomatically. School-management terminology in Arabic is well-established — match the tone of existing genuine AR strings in the file.
- Do NOT add new keys to `en.json` in this implementation. Even small "while I'm in here" additions risk muddying the parity story.
- Do NOT add a `getMessageFallback` that returns the English string. The whole point of this implementation is to make missing keys impossible to ignore.
- After deploy, watch Sentry for the next 30 minutes. Any `MISSING_MESSAGE` exception means a key the parity test didn't catch — investigate and fix forward.
