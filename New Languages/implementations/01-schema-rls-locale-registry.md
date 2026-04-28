# Implementation 01 — Schema, RLS, Locale Registry

> **Phase:** 1 — Foundation (was P1A)
> **Wave:** 1 (serial — everything downstream depends on this)
> **Depends on:** nothing (P0 strategy approved)
> **Deploys:** migration + API restart + worker restart + web restart (shared types regenerate)
> **Model:** Opus 4.7 / High effort

---

## Goal

Land the database, registry, and shared-package foundations the entire multi-language expansion needs in a single coordinated migration. After this ships:

- `Tenant.supported_locales TEXT[]` exists and every existing tenant is backfilled to `['en','ar']`.
- `Household.secondary_locale` and `Household.dual_language_opt_in` exist (still null/false for everyone — UI lands in 03).
- `apps/web/i18n/registry.ts` is the single source of truth for locale metadata (code, English name, native name, direction, tier).
- `apps/web/i18n/config.ts` derives its `locales` array from the registry; only `en` and `ar` are flagged active — `ga`, `fr`, `de`, `es`, `it`, `ro`, `pl` are registered but not yet active.
- `apps/web/i18n/tier-scopes.ts` exports the `tier_2_namespaces` allowlist (the parent + student surface) used by the parity test in 02 and the runtime guard in 11.
- Zod schemas for the new locale operations exist in `@school/shared`.

**Zero behaviour change for existing en + ar users.** No new tenant locale becomes selectable in this implementation — that lands in 03.

## Critical safety constraints

- The migration MUST apply cleanly to a fresh DB **and** to a snapshot of NHQS prod before the production deploy proceeds. Test both locally before pushing.
- `supported_locales` MUST be backfilled for every existing tenant in the same migration that adds the column — otherwise the CHECK constraint fires and the migration fails on prod.
- Backfill rule (single, simple): every existing tenant gets `supported_locales = ARRAY['en','ar']` regardless of `default_locale`. Rationale: every existing tenant could already serve both languages, so this preserves status quo. Trim later via 03 admin UI if a tenant should drop one.
- Existing en + ar Playwright suite must pass post-deploy. Hard-error flag is NOT flipped here (that's 02). The behaviour change in this impl is purely additive.

---

## Files to create / modify

### Database

- **Create migration directory:** `packages/prisma/migrations/<TIMESTAMP>_add_locale_expansion_columns/`
  - `migration.sql` — adds columns + backfill + CHECK constraint
  - `post_migrate.sql` — re-applies/extends RLS policies for `households` if needed (it shouldn't — these are columns on an existing tenant-scoped table)

### Prisma schema

- **Modify:** `packages/prisma/schema.prisma`
  - Add `supported_locales String[] @default(["en"]) @db.VarChar(10)` to `Tenant` (the runtime default applies to _new_ tenants only; existing rows are explicitly backfilled in the migration).
  - Add `secondary_locale String? @db.VarChar(10)` to `Household`.
  - Add `dual_language_opt_in Boolean @default(false)` to `Household`.

### Frontend i18n infrastructure

- **Create:** `apps/web/i18n/registry.ts` — the single locale registry.
- **Modify:** `apps/web/i18n/config.ts` — derive `locales` from registry.
- **Modify:** `apps/web/i18n/request.ts` — load message file based on registry-validated locale (no behaviour change, just a tighter validation surface).
- **Create:** `apps/web/i18n/tier-scopes.ts` — `tier_2_namespaces` allowlist.

### Shared schemas

- **Create:** `packages/shared/src/i18n/locale-codes.ts` — exports the union type and `Zod` schemas for `supported_locales`, `secondary_locale`, `dual_language_opt_in`.
- **Modify:** `packages/shared/src/index.ts` — re-export the new module.

### Backend

- **Modify:** `apps/api/src/modules/tenants/tenants.service.ts` — read `supported_locales` (no write surface yet — that's 03).
- **Modify:** `apps/api/src/modules/households/households.service.ts` — read `secondary_locale` and `dual_language_opt_in` (no write surface yet — that's 06).

### Tests

- **Create:** `apps/web/i18n/registry.spec.ts` — unit tests for registry shape and lookup helpers.
- **Create:** `apps/web/i18n/tier-scopes.spec.ts` — unit test that allowlist is a subset of `en.json` namespaces.
- **Create:** `packages/shared/src/i18n/locale-codes.spec.ts` — Zod schema unit tests.
- **Create:** `apps/api/test/households-locale-rls.e2e-spec.ts` — RLS leakage test for new Household columns (Tenant A vs Tenant B isolation).
- **Create:** `apps/api/test/tenants-supported-locales-rls.e2e-spec.ts` — RLS leakage test for `Tenant.supported_locales`.

### Docs

- **Modify:** `docs/architecture/feature-map.md` — flag pending update (not yet — wait for the user per `feature-map-maintenance.md`).
- **Modify:** `docs/architecture/danger-zones.md` — add an entry: "Hard-error parity gate — any new key added after 02 must land in all locale message files in the same commit."
- **Modify:** `New Languages/IMPLEMENTATION_LOG.md` — flip status to In Progress at start, Complete & Deployed at end.

---

## Detailed task breakdown

### Task 1 — Add the locale registry

**Files:**

- Create: `apps/web/i18n/registry.ts`

```ts
// apps/web/i18n/registry.ts
//
// Single source of truth for every locale the platform knows about.
// "active" locales are runtime-loadable (a message file exists);
// "registered" locales are metadata-only until the matching Phase 4/5
// session ships their message file.

export type LocaleTier = 1 | 2;

export type LocaleEntry = {
  /** ISO 639-1 (or composite) locale code used in URLs and database. */
  code: string;
  /** English-language name for admin surfaces. */
  englishName: string;
  /** Native-language name for end-user pickers. */
  nativeName: string;
  /** Text direction. Only 'ar' is RTL today. */
  direction: 'ltr' | 'rtl';
  /** Tier 1 = full app surface, Tier 2 = parent + student surface only. */
  tier: LocaleTier;
  /**
   * `true` once the locale has a complete message file shipped via a Phase
   * 4/5 implementation. The runtime config gates loading on this flag.
   */
  active: boolean;
};

export const LOCALE_REGISTRY: readonly LocaleEntry[] = [
  // Active baseline — shipped before this expansion.
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

  // Tier 1 — registered, not yet active. Each Phase 4 implementation flips
  // its entry to active: true in the same commit that ships the message file.
  {
    code: 'ga',
    englishName: 'Irish',
    nativeName: 'Gaeilge',
    direction: 'ltr',
    tier: 1,
    active: false,
  },
  {
    code: 'fr',
    englishName: 'French',
    nativeName: 'Français',
    direction: 'ltr',
    tier: 1,
    active: false,
  },
  {
    code: 'de',
    englishName: 'German',
    nativeName: 'Deutsch',
    direction: 'ltr',
    tier: 1,
    active: false,
  },
  {
    code: 'es',
    englishName: 'Spanish',
    nativeName: 'Español',
    direction: 'ltr',
    tier: 1,
    active: false,
  },

  // Tier 2 — parent + student surface only.
  {
    code: 'it',
    englishName: 'Italian',
    nativeName: 'Italiano',
    direction: 'ltr',
    tier: 2,
    active: false,
  },
  {
    code: 'ro',
    englishName: 'Romanian',
    nativeName: 'Română',
    direction: 'ltr',
    tier: 2,
    active: false,
  },
  {
    code: 'pl',
    englishName: 'Polish',
    nativeName: 'Polski',
    direction: 'ltr',
    tier: 2,
    active: false,
  },
] as const;

export const REGISTERED_LOCALE_CODES = LOCALE_REGISTRY.map((l) => l.code);
export const ACTIVE_LOCALE_CODES = LOCALE_REGISTRY.filter((l) => l.active).map((l) => l.code);

export function getLocaleEntry(code: string): LocaleEntry | undefined {
  return LOCALE_REGISTRY.find((l) => l.code === code);
}

export function isActiveLocale(code: string): boolean {
  return ACTIVE_LOCALE_CODES.includes(code);
}

export function isRegisteredLocale(code: string): boolean {
  return REGISTERED_LOCALE_CODES.includes(code);
}
```

- [ ] **Step 1.1 — Write the unit test first**

Create `apps/web/i18n/registry.spec.ts`:

```ts
import {
  ACTIVE_LOCALE_CODES,
  REGISTERED_LOCALE_CODES,
  getLocaleEntry,
  isActiveLocale,
  isRegisteredLocale,
  LOCALE_REGISTRY,
} from './registry';

describe('locale registry', () => {
  it('en and ar are active', () => {
    expect(isActiveLocale('en')).toBe(true);
    expect(isActiveLocale('ar')).toBe(true);
  });

  it('all 7 expansion locales are registered but not active', () => {
    for (const code of ['ga', 'fr', 'de', 'es', 'it', 'ro', 'pl']) {
      expect(isRegisteredLocale(code)).toBe(true);
      expect(isActiveLocale(code)).toBe(false);
    }
  });

  it('only ar is RTL', () => {
    const rtl = LOCALE_REGISTRY.filter((l) => l.direction === 'rtl').map((l) => l.code);
    expect(rtl).toEqual(['ar']);
  });

  it('every code is unique', () => {
    expect(new Set(REGISTERED_LOCALE_CODES).size).toBe(REGISTERED_LOCALE_CODES.length);
  });

  it('getLocaleEntry returns undefined for unknown code', () => {
    expect(getLocaleEntry('xx')).toBeUndefined();
  });

  it('Tier 2 locales are flagged tier 2', () => {
    for (const code of ['it', 'ro', 'pl']) {
      expect(getLocaleEntry(code)?.tier).toBe(2);
    }
  });
});
```

- [ ] **Step 1.2 — Run the test, expect FAIL** (`registry.ts` doesn't exist yet — but you'll create both in the same commit, so just run after writing `registry.ts`)
- [ ] **Step 1.3 — Write `registry.ts` from the snippet above.**
- [ ] **Step 1.4 — Run the test, expect PASS:** `pnpm --filter @school/web test -- registry.spec`
- [ ] **Step 1.5 — Commit (do NOT push yet — bundle with later commits in this implementation):**

```bash
git add apps/web/i18n/registry.ts apps/web/i18n/registry.spec.ts
git commit -m "feat(i18n): add locale registry as single source of truth"
```

### Task 2 — Refactor `config.ts` to derive from registry

**Files:**

- Modify: `apps/web/i18n/config.ts`
- Modify: `apps/web/i18n/request.ts`

- [ ] **Step 2.1 — Replace `apps/web/i18n/config.ts` with:**

```ts
// apps/web/i18n/config.ts
//
// Active locales are derived from the registry. Adding a locale to the active
// list happens in two places at once: flip `active: true` in registry.ts AND
// ship the matching messages/{locale}.json file. Both must land in the same
// commit so this array never references a missing file at runtime.

import { ACTIVE_LOCALE_CODES, type LocaleEntry } from './registry';

export const locales = ACTIVE_LOCALE_CODES as readonly string[];
export type Locale = (typeof ACTIVE_LOCALE_CODES)[number];
export const defaultLocale: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export type { LocaleEntry };
```

- [ ] **Step 2.2 — Update `apps/web/i18n/request.ts` to use the typed guard:**

```ts
import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, isLocale } from './config';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 2.3 — Verify:** `pnpm --filter @school/web type-check` and `pnpm --filter @school/web test -- request.spec` (if a test exists; if not, add a minimal smoke test).

- [ ] **Step 2.4 — Commit:**

```bash
git add apps/web/i18n/config.ts apps/web/i18n/request.ts
git commit -m "refactor(i18n): derive active locales from registry"
```

### Task 3 — Add the Tier 2 namespace allowlist

**Files:**

- Create: `apps/web/i18n/tier-scopes.ts`
- Create: `apps/web/i18n/tier-scopes.spec.ts`

- [ ] **Step 3.1 — Open `apps/web/messages/en.json` and list the top-level namespaces**, then catalogue which ones a parent or student would ever see. The allowlist must include (non-exhaustive — verify against actual `en.json`): `common`, `auth`, `parent`, `student`, `notifications`, `errors`, `forms.consent`, `forms.appeal`, `forms.household_edit`, `public.landing`, `public.contact`, `public.admissions`, `pdf.receipt`, `pdf.invoice`, `pdf.household_statement`, `pdf.report_card`. Adjust to match real keys.

- [ ] **Step 3.2 — Write the test first:**

```ts
// apps/web/i18n/tier-scopes.spec.ts
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { TIER_2_NAMESPACES } from './tier-scopes';

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

function loadEn(): Record<string, Json> {
  const path = resolve(__dirname, '..', 'messages', 'en.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, Json>;
}

describe('Tier 2 namespace allowlist', () => {
  const en = loadEn();
  const topLevelKeys = new Set(Object.keys(en));

  it('every top-level namespace in the allowlist exists in en.json', () => {
    const orphans = TIER_2_NAMESPACES.map((ns) => ns.split('.')[0]!).filter(
      (root) => !topLevelKeys.has(root),
    );
    expect(orphans).toEqual([]);
  });

  it('allowlist has no duplicate entries', () => {
    expect(new Set(TIER_2_NAMESPACES).size).toBe(TIER_2_NAMESPACES.length);
  });

  it('allowlist excludes staff/admin/regulatory/payroll namespaces', () => {
    const forbidden = ['staff', 'admin', 'platform', 'regulatory', 'payroll', 'hr', 'leave'];
    const leak = TIER_2_NAMESPACES.filter((ns) => forbidden.some((f) => ns.startsWith(f)));
    expect(leak).toEqual([]);
  });
});
```

- [ ] **Step 3.3 — Create `apps/web/i18n/tier-scopes.ts`:**

```ts
// apps/web/i18n/tier-scopes.ts
//
// Tier 2 locales (it, ro, pl as of this writing) only translate the parent
// and student surface. Other namespaces fall back to the tenant default
// locale at runtime via the route-level guard added in implementation 11.
//
// This list governs the translation-parity test for Tier 2 locales: the
// parity gate enforces 100% match against this subset, ignoring out-of-scope
// namespaces.

export const TIER_2_NAMESPACES: readonly string[] = [
  // Common UI primitives shared everywhere a parent or student lands
  'common',
  'auth',
  'errors',
  'validation',

  // Parent + student portals
  'parent',
  'student',

  // Self-service forms parents/students fill in
  'forms.consent',
  'forms.appeal',
  'forms.household_edit',
  'forms.profile',

  // Notifications visible to parents/students (in-app, email, SMS, WhatsApp)
  'notifications.parent',
  'notifications.student',

  // Public/marketing surfaces
  'public.landing',
  'public.contact',
  'public.admissions',
  'public.verification',

  // Parent-relevant PDF templates (receipt, invoice, statement, report card)
  'pdf.receipt',
  'pdf.invoice',
  'pdf.household_statement',
  'pdf.report_card',
] as const;

export type Tier2Namespace = (typeof TIER_2_NAMESPACES)[number];
```

> **Note:** the exact namespace list must be cross-checked against `en.json`. If the test in 3.2 fails, adjust the allowlist (or the `en.json` namespace structure if a real namespace is missing). Do NOT short-circuit by deleting failing assertions.

- [ ] **Step 3.4 — Run the test, expect PASS:** `pnpm --filter @school/web test -- tier-scopes.spec`
- [ ] **Step 3.5 — Commit:**

```bash
git add apps/web/i18n/tier-scopes.ts apps/web/i18n/tier-scopes.spec.ts
git commit -m "feat(i18n): add Tier 2 namespace allowlist for parent+student surface"
```

### Task 4 — Add Zod schemas for the new locale operations

**Files:**

- Create: `packages/shared/src/i18n/locale-codes.ts`
- Create: `packages/shared/src/i18n/locale-codes.spec.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 4.1 — Write the test first:**

```ts
// packages/shared/src/i18n/locale-codes.spec.ts
import {
  localeCodeSchema,
  supportedLocalesSchema,
  householdLocaleUpdateSchema,
} from './locale-codes';

describe('locale-codes schemas', () => {
  it('localeCodeSchema accepts every registered locale', () => {
    for (const code of ['en', 'ar', 'ga', 'fr', 'de', 'es', 'it', 'ro', 'pl']) {
      expect(localeCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('localeCodeSchema rejects unknown codes', () => {
    expect(localeCodeSchema.safeParse('xx').success).toBe(false);
    expect(localeCodeSchema.safeParse('en-US').success).toBe(false);
    expect(localeCodeSchema.safeParse('').success).toBe(false);
  });

  it('supportedLocalesSchema requires non-empty unique array', () => {
    expect(supportedLocalesSchema.safeParse(['en']).success).toBe(true);
    expect(supportedLocalesSchema.safeParse(['en', 'ar']).success).toBe(true);
    expect(supportedLocalesSchema.safeParse([]).success).toBe(false);
    expect(supportedLocalesSchema.safeParse(['en', 'en']).success).toBe(false);
  });

  it('householdLocaleUpdateSchema accepts partial updates', () => {
    expect(householdLocaleUpdateSchema.safeParse({ secondary_locale: 'fr' }).success).toBe(true);
    expect(householdLocaleUpdateSchema.safeParse({ dual_language_opt_in: true }).success).toBe(
      true,
    );
    expect(householdLocaleUpdateSchema.safeParse({ secondary_locale: null }).success).toBe(true);
    expect(householdLocaleUpdateSchema.safeParse({ secondary_locale: 'xx' }).success).toBe(false);
  });
});
```

- [ ] **Step 4.2 — Create `packages/shared/src/i18n/locale-codes.ts`:**

```ts
import { z } from 'zod';

// Mirror the registry codes exactly. Keep this file dependency-free so the
// shared package stays independent of frontend-only code (the registry).
export const REGISTERED_LOCALES = ['en', 'ar', 'ga', 'fr', 'de', 'es', 'it', 'ro', 'pl'] as const;
export type RegisteredLocale = (typeof REGISTERED_LOCALES)[number];

export const localeCodeSchema = z.enum(REGISTERED_LOCALES);

export const supportedLocalesSchema = z
  .array(localeCodeSchema)
  .min(1, 'At least one locale must be supported')
  .refine((arr) => new Set(arr).size === arr.length, 'Duplicate locale in supported_locales');

export const householdLocaleUpdateSchema = z
  .object({
    secondary_locale: localeCodeSchema.nullable().optional(),
    dual_language_opt_in: z.boolean().optional(),
  })
  .strict();

export type SupportedLocales = z.infer<typeof supportedLocalesSchema>;
export type HouseholdLocaleUpdate = z.infer<typeof householdLocaleUpdateSchema>;
```

- [ ] **Step 4.3 — Re-export from `packages/shared/src/index.ts`:**

```ts
// Add this line in the appropriate alphabetical position:
export * from './i18n/locale-codes';
```

- [ ] **Step 4.4 — Run tests:** `pnpm --filter @school/shared test -- locale-codes.spec`
- [ ] **Step 4.5 — Commit:**

```bash
git add packages/shared/src/i18n/ packages/shared/src/index.ts
git commit -m "feat(shared): add Zod schemas for locale operations"
```

### Task 5 — Write the Prisma schema migration

**Files:**

- Modify: `packages/prisma/schema.prisma`

- [ ] **Step 5.1 — Update the `Tenant` model**, adding the new column directly after `default_locale`:

```prisma
model Tenant {
  id                        String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name                      String       @db.VarChar(255)
  slug                      String       @unique @db.VarChar(100)
  status                    TenantStatus @default(active)
  default_locale            String       @default("en") @db.VarChar(10)
  supported_locales         String[]     @default(["en"]) @db.VarChar(10)  // NEW
  timezone                  String       @db.VarChar(100)
  // ...rest unchanged
}
```

- [ ] **Step 5.2 — Update the `Household` model**, adding the two new columns after `country`:

```prisma
model Household {
  // ...existing fields...
  postal_code               String?         @db.VarChar(30)
  secondary_locale          String?         @db.VarChar(10)   // NEW
  dual_language_opt_in      Boolean         @default(false)   // NEW
  needs_completion          Boolean         @default(false)
  // ...rest unchanged
}
```

- [ ] **Step 5.3 — Generate the migration:**

```bash
cd packages/prisma
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/edupod_dev \
  npx prisma migrate dev --create-only --name add_locale_expansion_columns
```

- [ ] **Step 5.4 — Edit the generated `migration.sql`** to add the backfill, the CHECK constraint, and the index. Final shape:

```sql
-- Add the new columns
ALTER TABLE "tenants"
  ADD COLUMN "supported_locales" VARCHAR(10)[] NOT NULL DEFAULT ARRAY['en']::VARCHAR(10)[];

ALTER TABLE "households"
  ADD COLUMN "secondary_locale" VARCHAR(10),
  ADD COLUMN "dual_language_opt_in" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every existing tenant supports en + ar (preserves status quo —
-- both languages have always been served. Platform admins can trim a
-- tenant's array later via the admin UI shipped in implementation 03).
UPDATE "tenants"
SET "supported_locales" = ARRAY['en','ar']::VARCHAR(10)[]
WHERE "supported_locales" = ARRAY['en']::VARCHAR(10)[];

-- Enforce that default_locale is always one of the supported locales.
ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_default_locale_in_supported"
  CHECK ("default_locale" = ANY ("supported_locales"));

-- Index to speed up lookups (e.g., admin filter "tenants supporting fr").
CREATE INDEX "idx_tenants_supported_locales"
  ON "tenants" USING GIN ("supported_locales");
```

> **Why backfill before adding the CHECK constraint?** Adding the constraint while existing rows fail it would error. The backfill MUST land first.

- [ ] **Step 5.5 — Apply the migration locally:**

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/edupod_dev \
  npx prisma migrate dev
```

Verify in psql:

```sql
\d tenants
\d households
SELECT slug, default_locale, supported_locales FROM tenants;
-- Expected: every tenant has supported_locales = {en,ar}
```

- [ ] **Step 5.6 — Test against an NHQS prod snapshot.** Pull a fresh dump (with user permission), restore to a local sandbox DB, run `npx prisma migrate deploy`, verify columns populated correctly. **If this fails, fix BEFORE pushing.**

- [ ] **Step 5.7 — Commit:**

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations/<TIMESTAMP>_add_locale_expansion_columns/
git commit -m "feat(db): add locale expansion columns + backfill existing tenants

- Tenant.supported_locales TEXT[] (backfilled to {en,ar} for existing rows)
- Household.secondary_locale TEXT NULL
- Household.dual_language_opt_in BOOLEAN DEFAULT false
- CHECK constraint: default_locale IN supported_locales
- GIN index on supported_locales"
```

### Task 6 — RLS leakage tests for the new columns

**Files:**

- Create: `apps/api/test/tenants-supported-locales-rls.e2e-spec.ts`
- Create: `apps/api/test/households-locale-rls.e2e-spec.ts`

- [ ] **Step 6.1 — Tenants RLS test:**

```ts
// apps/api/test/tenants-supported-locales-rls.e2e-spec.ts
//
// RLS leakage check: Tenant A's supported_locales must never be readable
// by a request authenticated as Tenant B. The tenants table is the rare
// case that does NOT enforce RLS via tenant_id (it IS the tenant) — but
// the supported_locales surface area introduced here is read through the
// tenants service, and we verify Tenant B cannot scope-up to read Tenant A.
//
// Pattern: standard e2e bootstrap, two tenants, two users. Assert that
// reading the tenant config endpoint as user-B returns user-B's tenant
// only.

import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { createTestTenant, createTestUserForTenant, getAuthToken } from './helpers';

describe('Tenant.supported_locales — RLS isolation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('a user from tenant B cannot read tenant A supported_locales', async () => {
    const tenantA = await createTestTenant({ slug: 'rls-tenant-a' });
    const tenantB = await createTestTenant({ slug: 'rls-tenant-b' });
    await createTestUserForTenant(tenantA.id, { email: 'a@rls.test' });
    const userB = await createTestUserForTenant(tenantB.id, { email: 'b@rls.test' });
    const tokenB = await getAuthToken(userB);

    // Hit the tenant-config endpoint that exposes supported_locales
    const res = await request(app.getHttpServer())
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(res.body.id).toBe(tenantB.id);
    // Cross-tenant probe: try to read tenant A by id
    await request(app.getHttpServer())
      .get(`/api/v1/tenants/${tenantA.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });
});
```

- [ ] **Step 6.2 — Households RLS test (parallel structure):**

```ts
// apps/api/test/households-locale-rls.e2e-spec.ts
//
// Tenant A creates a household with secondary_locale='fr'.
// Tenant B authenticates and tries to read the household — must 404 (RLS hides it).
// Tenant B cannot patch the household via direct id either — must 404.

import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  createTestTenant,
  createTestHousehold,
  createTestUserForTenant,
  getAuthToken,
} from './helpers';

describe('Household.secondary_locale + dual_language_opt_in — RLS isolation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('tenant B cannot read tenant A household locale columns', async () => {
    const tenantA = await createTestTenant({ slug: 'rls-hh-a' });
    const tenantB = await createTestTenant({ slug: 'rls-hh-b' });

    const householdA = await createTestHousehold(tenantA.id, {
      secondary_locale: 'fr',
      dual_language_opt_in: true,
    });
    const userB = await createTestUserForTenant(tenantB.id, { email: 'hh-b@rls.test' });
    const tokenB = await getAuthToken(userB);

    await request(app.getHttpServer())
      .get(`/api/v1/households/${householdA.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);

    // Negative: confirm A's user CAN read it
    const userA = await createTestUserForTenant(tenantA.id, { email: 'hh-a@rls.test' });
    const tokenA = await getAuthToken(userA);
    const ok = await request(app.getHttpServer())
      .get(`/api/v1/households/${householdA.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(ok.body.secondary_locale).toBe('fr');
    expect(ok.body.dual_language_opt_in).toBe(true);
  });
});
```

> **Note:** the helpers (`createTestTenant`, `createTestHousehold`, etc.) already exist in `apps/api/test/helpers/`. If a helper signature is missing the new fields, extend it to forward `secondary_locale` / `dual_language_opt_in` through to the Prisma create.

- [ ] **Step 6.3 — Run the e2e tests:**

```bash
cd apps/api
pnpm test:e2e -- tenants-supported-locales-rls households-locale-rls
```

Expected: both green.

- [ ] **Step 6.4 — Commit:**

```bash
git add apps/api/test/tenants-supported-locales-rls.e2e-spec.ts apps/api/test/households-locale-rls.e2e-spec.ts
# also include any helper changes
git commit -m "test(i18n): RLS leakage tests for tenant.supported_locales and household locale columns"
```

### Task 7 — Wire the new columns into the read path

**Files:**

- Modify: `apps/api/src/modules/tenants/tenants.service.ts`
- Modify: `apps/api/src/modules/households/households.service.ts`
- Modify: any DTO/select projections that should now include `supported_locales`, `secondary_locale`, `dual_language_opt_in`.

- [ ] **Step 7.1 — Update tenant `findById` / `findCurrent` selects** to include `supported_locales`. The shape of the response already returns `default_locale`; add the new column adjacent.
- [ ] **Step 7.2 — Update household `findById` / `findByTenant` selects** to include `secondary_locale` and `dual_language_opt_in`.
- [ ] **Step 7.3 — No write surface yet.** Tenant admins flip `supported_locales` in implementation 03; households flip the dual-language opt-in in implementation 06. Don't add controllers in this implementation.
- [ ] **Step 7.4 — Run the existing `tenants.service.spec.ts` and `households.service.spec.ts`:** ensure no regression.
- [ ] **Step 7.5 — Commit:**

```bash
git add apps/api/src/modules/tenants/ apps/api/src/modules/households/
git commit -m "feat(api): expose supported_locales and household locale columns in read paths"
```

### Task 8 — Architecture docs + danger-zone update

**Files:**

- Modify: `docs/architecture/danger-zones.md`

- [ ] **Step 8.1 — Append a new section to `danger-zones.md`:**

```markdown
## i18n hard-error parity gate (added 2026-04-XX, implementation 02)

Once implementation 02 ships, `next-intl` is configured to throw on any missing
key in production. Any new translation key added to `apps/web/messages/en.json`
MUST be added to **every** active locale's message file in the same commit, or
production renders 500 on any page that references the key.

CI enforces this via the parity test (`apps/web/src/__tests__/translation-parity.spec.ts`).
Do not skip the parity test. Do not add an English fallback "for safety" — that
re-introduces the silent-failure bug class hard-error was meant to eliminate.
```

- [ ] **Step 8.2 — Commit:**

```bash
git add docs/architecture/danger-zones.md
git commit -m "docs(architecture): document i18n hard-error parity gate"
```

### Task 9 — Update IMPLEMENTATION_LOG.md and push

- [ ] **Step 9.1 — Edit `New Languages/IMPLEMENTATION_LOG.md`:** flip 01 status to "🟢 Complete & Deployed" once verified post-deploy. List every commit SHA, the CI run URL, the deploy timestamp, and verification notes.

- [ ] **Step 9.2 — Pre-push branch-state check:**

```bash
git fetch origin main
git log --oneline origin/main..HEAD
# Inspect each commit. Confirm everything is from this implementation only — no
# sweep-up of files from a sibling session.
```

- [ ] **Step 9.3 — Push:**

```bash
git push origin main
gh run watch
```

- [ ] **Step 9.4 — On CI green + deploy success, verify in production:**

```bash
ssh root@46.62.244.139
sudo -u edupod psql edupod_prod -c "
  SELECT slug, default_locale, supported_locales
  FROM tenants
  ORDER BY slug;"
# Expected: every row shows supported_locales = {en,ar}.
```

- [ ] **Step 9.5 — Run the existing en + ar Playwright smoke** on the deployed app:

```bash
pnpm --filter @school/web exec playwright test --grep "@smoke" --project=en-ltr
pnpm --filter @school/web exec playwright test --grep "@smoke" --project=ar-rtl
```

Expected: both green. **No regression** is the bar — we have not changed runtime locale behaviour, just landed schema + registry plumbing.

- [ ] **Step 9.6 — Append the completion entry to `New Languages/IMPLEMENTATION_LOG.md`** with:
  - Commit SHA list
  - CI run URL
  - Deploy timestamp
  - Production verification SQL output
  - Playwright result

- [ ] **Step 9.7 — Final commit (log entry):**

```bash
git add New\ Languages/IMPLEMENTATION_LOG.md
git commit -m "docs(i18n): mark implementation 01 complete"
git push origin main
```

---

## Acceptance criteria

- [ ] Migration `add_locale_expansion_columns` applied cleanly to fresh DB
- [ ] Migration applied cleanly to NHQS prod snapshot pre-push
- [ ] Every existing tenant in production shows `supported_locales = {en,ar}`
- [ ] CHECK constraint `tenants_default_locale_in_supported` exists and rejects invalid combinations
- [ ] `apps/web/i18n/registry.ts` exists with all 9 locales
- [ ] `apps/web/i18n/config.ts` derives active locales from registry
- [ ] `apps/web/i18n/tier-scopes.ts` exists with allowlist matching real `en.json` namespaces
- [ ] `packages/shared/src/i18n/locale-codes.ts` exposes Zod schemas for new operations
- [ ] All new unit tests pass
- [ ] Both new RLS leakage e2e tests pass
- [ ] `turbo lint` clean
- [ ] `turbo type-check` clean
- [ ] `turbo test` green (full regression)
- [ ] CI green on `main`
- [ ] Production deploy successful
- [ ] en + ar Playwright smoke pass on deployed app (no regression)
- [ ] `IMPLEMENTATION_LOG.md` updated with commit SHAs + deploy timestamp + verification result

---

## Verification commands (cheat sheet)

```bash
# Local
turbo lint
turbo type-check
turbo test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/edupod_dev \
  npx prisma migrate dev

# Pre-push
git fetch origin main
git log --oneline origin/main..HEAD

# Post-deploy
ssh root@46.62.244.139 "sudo -u edupod psql edupod_prod -c 'SELECT slug, supported_locales FROM tenants;'"
pnpm --filter @school/web exec playwright test --grep "@smoke"
```

---

## Rollback

If the migration fails on prod or post-deploy verification surfaces a regression:

```bash
# 1. Revert all commits in this implementation
git revert <last-commit>..<first-commit>
git push origin main
# CI will deploy the revert.

# 2. Manually unwind the schema change in psql (if the migration was partial):
ssh root@46.62.244.139
sudo -u edupod psql edupod_prod
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_default_locale_in_supported;
DROP INDEX IF EXISTS idx_tenants_supported_locales;
ALTER TABLE tenants DROP COLUMN IF EXISTS supported_locales;
ALTER TABLE households DROP COLUMN IF EXISTS secondary_locale;
ALTER TABLE households DROP COLUMN IF EXISTS dual_language_opt_in;
-- Then `prisma migrate resolve --rolled-back <migration-name>` to clear the migration history entry.
```

> **Hard rule:** schema rollback on production is high-stakes. Coordinate with the user before running. Do NOT do this autonomously.

---

## Notes for the executor

- This implementation lands the foundation. **Do not** add a UI, backend write endpoint, or behaviour change beyond what's listed.
- Resist the temptation to update `user-menu.tsx` here — that's implementation 03.
- Do NOT touch `apps/web/messages/en.json` or `apps/web/messages/ar.json`. Those files are sacred — only implementation 02 modifies `ar.json`, and only by replacing `[AR] …` placeholders.
- The `Tenant.supported_locales` write endpoint is intentionally absent here — it lands in 03. Until then, the only way to flip a tenant's locale list is direct SQL on prod (which is exactly the workflow the strategy expects for early NHQS rollout).
- If the `feature-map.md` would benefit from an update, flag it to the user at the end per `feature-map-maintenance.md` — do NOT auto-update.
