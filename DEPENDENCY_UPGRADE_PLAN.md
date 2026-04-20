# Dependency Upgrade Plan — Pre-Launch Hardening

**Author:** Ram / Claude
**Date drafted:** 2026-04-20
**Target completion:** ~5 weeks (buffer +1 week). Revised upward from initial 4-week estimate after verified migration guides surfaced larger-than-expected blast radius on Prisma 7 (ESM conversion required), Stripe 22 (`new Stripe()` + Decimal type across finance module), Tailwind 4 (utility rename cascade + default value changes), and Next 16 (async params/cookies/headers migration).
**Goal:** Bring all 137 npm dependencies onto current stable versions so the platform ships launch-ready with 3–5 years of runway before the next forced major-bang migration.

---

## 1. Why now

- Launch is imminent. After tenants are live, upgrade windows shrink (downtime budget, change-control gates, customer impact).
- Current state: **137 npm deps**, 44 majors behind, 36 minors behind, 22 patches behind.
- `pnpm audit` today: **25 high-severity + 29 moderate CVEs** in the tree. Some of these touch auth/crypto paths — concrete security debt, not hypothetical.
- Node 22 LTS is maintained until April 2027. Major framework releases (Next 16, React 19, Nest 11, Prisma 7) have all shipped and are stable. This is the widest compatibility window we'll see for the next 18 months.
- Deferring another year lands us in the worst scenario: forced migration under customer-impact pressure when a Stripe API retires or a critical CVE drops.

---

## 2. Starting inventory (snapshot 2026-04-20)

Raw data: `/tmp/sdb-table.txt` (generated from `/tmp/sdb-packages.txt` + live `registry.npmjs.org` queries).

### Summary

| Status       | Count | Notes                                         |
| ------------ | ----- | --------------------------------------------- |
| ✓ current    | 34    | Leave alone                                   |
| patch behind | 22    | Trivial bump                                  |
| minor behind | 36    | Non-breaking features                         |
| MAJOR behind | 44    | Coordinated upgrades, phased                  |
| unresolved   | 1     | `eslint-plugin-school` (workspace-local, n/a) |

### Critical / foundation layer

All versions verified against GitHub release pages and npm registry on 2026-04-20.

| Package                 | Current | Latest                | Released   | Risk notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------- | --------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| node (runtime)          | 24.14   | 24 (LTS) / 22 (Maint) | —          | **Already on Active LTS (24, Krypton, EOL Apr 2028).** Node 22 (Jod) is in Maintenance LTS until Apr 2027. No change needed — earlier plan suggested downgrading to 22 but that was wrong; 24 is the current Active LTS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| pnpm                    | 9.15.4  | 10.33.0               | 2026-03-24 | Lockfile-format bump; hold for separate review window                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| typescript              | 5.7.2   | 6.0.3                 | 2026-04-16 | Touches every `.ts` file via type-check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| react / react-dom       | 18.3.1  | 19.2.5                | 2026-04-08 | `forwardRef` deprecated (ref now a prop); `<Context.Provider>` deprecated (use `<Context>`); ref callbacks can return cleanup fn (TS: implicit returns rejected); `useFormState` → `useActionState`; stricter hydration error reporting                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| next                    | 14.2.21 | 16.2.4                | 2026-04-15 | **2 majors behind.** Requires Node 20.9+ (ok), TS 5.1+ (ok). Default bundler = Turbopack. **Sync `cookies()` / `headers()` / `draftMode()` / `params` / `searchParams` all removed — must be `await`ed.** `middleware.ts` → `proxy.ts`. `next lint` removed. AMP removed. `serverRuntimeConfig` / `publicRuntimeConfig` removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| @nestjs/core (family)   | 10.4.15 | 11.1.19               | 2026-04-13 | **Express 5 is the new default** — path matcher changed (`/users/*` must become `/users/*path`). `Reflector.getAllAndMerge` returns object not array (single-entry case). `getAllAndOverride` return type now `T \| undefined`. `ConfigService.get` read-order changed. `CacheModule` now on cache-manager v6 (Keyv).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| prisma / @prisma/client | 6.1.0   | 7.7.0                 | 2026-04-07 | **Much more invasive than earlier plan captured.** (1) `url = env()` removed from schema — requires `prisma.config.ts`. (2) **Driver adapter now mandatory** — must install `@prisma/adapter-pg` and wire via `new PrismaClient({ adapter })`. (3) **ESM required** — monorepo is CJS today; either convert or keep prisma package isolated. (4) `prisma.$use()` middleware removed (we use `$extends` — ✓ OK). (5) `output` now mandatory on generator. (6) `--schema`, `--skip-generate`, `--skip-seed`, `--url` CLI flags removed. (7) Auto-seed on `migrate dev` gone — must run `prisma db seed` manually.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| zod                     | 3.25.76 | 4.3.6                 | 2026-01-22 | **Bigger surface than earlier plan captured.** String formats moved to top-level: `z.string().email()` → `z.email()`, same for `url/uuid/ip/cidr/base64url`. `ZodObject.merge()`/`.strict()`/`.passthrough()` deprecated → `.extend()` / `z.strictObject()` / `z.looseObject()`. `.strip()` / `.nonstrict()` / `.deepPartial()` removed. `invalid_type_error`/`required_error`/`errorMap` → unified `error` param. `ZodError.format()` / `.flatten()` deprecated → `z.treeifyError()`. `z.nativeEnum()` / `z.promise()` deprecated. `z.record(V)` single-arg removed → `z.record(K, V)`. `z.function()` no longer a schema — factory pattern. `.refine()` no longer respects type predicates. Infinite / non-safe integers rejected in `z.number().int()`. Issue type names all renamed (`$ZodIssueInvalidType`).                                                                                                                                                                                                                                       |
| tailwindcss             | 3.4.17  | 4.2.2                 | 2026-03-18 | **Bigger surface than earlier plan captured.** CSS-based config (JS config needs `@config` directive). `tailwindcss` no longer a PostCSS plugin — use `@tailwindcss/postcss` or `@tailwindcss/vite`. Removed: `postcss-import`, `autoprefixer` (both now automatic). Rename CASCADE on defaults: `shadow-sm` → `shadow-xs`, `shadow` → `shadow-sm`, `rounded-sm` → `rounded-xs`, `rounded` → `rounded-sm`, `blur-sm` → `blur-xs`, `blur` → `blur-sm`, `outline-none` → `outline-hidden`, `ring` → `ring-3`. `bg-opacity-*` / `text-opacity-*` / `border-opacity-*` / `divide-opacity-*` / `ring-opacity-*` removed → use `/opacity` modifier syntax. `flex-shrink-*` → `shrink-*`, `flex-grow-*` → `grow-*`. `!important` modifier syntax: `!` at end (`flex!` not `!flex`). **Default border color changed from `gray-200` to `currentColor`** — borders relying on default will break. **Default ring width changed from 3px to 1px.** Browser requirement: Safari 16.4+, Chrome 111+, Firefox 128+. `npx @tailwindcss/upgrade` codemod handles ~80%. |
| eslint                  | 8.57.0  | 10.2.1                | 2026-04-17 | 2 majors — flat config mandatory in 9+. `.eslintrc.*` → `eslint.config.js`. Our shared `packages/eslint-config` + custom `eslint-plugin-school` need rewriting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| jest                    | 29.7.0  | 30.3.0                | 2026-03-10 | Minor behavioural shifts. `testTimeout: 60_000` (just added) survives. Some custom matchers deprecated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### External service SDKs

All versions verified via GitHub release pages on 2026-04-20.

| Package                 | Current | Latest   | Released   | Why it matters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stripe                  | 20.4.1  | 22.0.2   | 2026-04-16 | **2 majors behind and more invasive than earlier plan captured.** (1) **`Stripe` is now a true ES6 class** — `Stripe("sk_...")` without `new` no longer works; every instantiation in the codebase must use `new Stripe("sk_...")`. (2) Callback support removed — must use async/await (we already do). (3) Per-request `host` option removed — set once at client construction. (4) `decimal_string` fields (Price, Plan, InvoiceItem, Issuing.\*) now use `Stripe.Decimal` type — code reading these as `string` must use `Decimal.from()` / `.toString()`. (5) Pinned API version: `2026-03-25.dahlia` — align with Stripe dashboard webhook endpoint setting. (6) `Stripe.StripeContext` type → `StripeContextType`. (7) Node 16 support dropped (we're fine on 24). |
| resend                  | 4.1.0   | 6.12.0   | 2026-04-15 | 2 majors behind; transactional email is critical path. API surface cleaned up — audit all `resend.emails.send()` call sites.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| @anthropic-ai/sdk       | 0.80.0  | 0.90.0   | 2026-04-16 | Minor — AI function module. Note package is still pre-1.0 — breaking changes can land in minors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| @aws-sdk/client-s3      | 3.705.0 | 3.1032.0 | 2026-04-17 | Minor on paper but 300+ patch versions behind. AWS SDK v3 ships ~daily; bump to a recent version and pin. File uploads (Hetzner S3-compatible).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| twilio                  | 5.4.0   | 5.13.1   | 2026-03-24 | Minor — SMS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| @sentry/nestjs + nextjs | 10.44.0 | 10.49.0  | 2026-04-16 | Minor — error monitoring.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| puppeteer               | 23.11.0 | 24.41.0  | 2026-04-15 | PDF generation for report cards. Chrome version bundled is newer; browser launch API small shifts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| undici                  | 7.24.4  | 8.1.0    | 2026-04-13 | HTTP client (internal fetches). Minor response-type changes on major bump.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| bullmq                  | 5.31.0  | 5.74.2   | 2026-04-20 | Minor (within 5.x). BullMQ 5 is stable; no major bump needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Native/crypto

| Package  | Current | Latest | Notes                                                                                                          |
| -------- | ------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| bcryptjs | 3.0.3   | 3.0.3  | ✓ In use for password hashing (pure JS, no native binding)                                                     |
| bcrypt   | 5.1.1   | 6.0.0  | Listed as a dep but `bcryptjs` is the one called in auth code — audit whether `bcrypt` can be removed entirely |

### Things to leave alone

| Package                   | Current | Latest | Rationale                                                              |
| ------------------------- | ------- | ------ | ---------------------------------------------------------------------- |
| storybook + @storybook/\* | 8       | 10     | Dev-only tool; not shipped to users. Bump when convenient, not urgent. |
| @stryker-mutator/\*       | 8.6.0   | 9.6.1  | Mutation testing — not on critical path. Defer.                        |

---

## 3. Risk register (updated with verified breaking-change details)

| Risk                                                                       | Likelihood | Impact   | Mitigation                                                                          |
| -------------------------------------------------------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------- |
| **Prisma 7 ESM conversion + driver adapter**                               | **High**   | **High** | Flip to ESM on its own commit, adapter layer in a helper. Defer-candidate if slips. |
| **Next 16 async `params`/`cookies`/`headers`/`searchParams`**              | High       | High     | Run `@next/codemod upgrade` early; e2e suite covers most routes                     |
| **Stripe 22 `new Stripe()` + Decimal type on finance module**              | Medium     | Critical | Full Stripe-test mode replay of payment + webhook before merging                    |
| **Zod 4 → 150+ schemas need touching**                                     | High       | Medium   | Codemod handles mechanical renames; manual pass on `.refine()` / `error:`           |
| **Tailwind 4 default border color + ring width changes**                   | High       | Medium   | Grep for `border` / `ring` without explicit color; visual regression sweep          |
| **React 19 ref callback TS errors**                                        | Medium     | Medium   | Codemod available; TS errors surface at compile time                                |
| **NestJS 11 Express 5 wildcard routes**                                    | Medium     | Medium   | Grep route definitions for `*`; rename to named params                              |
| **NestJS 11 Reflector API change (return type shift)**                     | Medium     | Medium   | Audit custom decorator/guard code that reads metadata                               |
| **ESLint 10 flat config migration breaks `packages/eslint-plugin-school`** | Medium     | Low      | Custom plugin shape change; rewrite to flat-config plugin contract                  |
| **`pnpm audit` shows 25 high + 29 moderate CVEs today**                    | **High**   | Medium   | Phase 0 target: zero high/critical. Track per-phase.                                |
| **bcrypt vs bcryptjs confusion**                                           | Low        | High     | Code uses `bcryptjs` (pure JS). Drop `bcrypt` dep entirely in Phase 9.              |
| Flake rate worsens post-upgrade (native crashes)                           | Medium     | Low      | 20× flake harness (`.claude/tmp/flake-triage/`) rerun after each phase              |
| Visual regression on shell/morph/sub-strip navigation                      | Medium     | Medium   | Manual pass on Home + each module hub; existing Playwright screenshots              |
| Something breaks irreversibly mid-phase                                    | Low        | High     | Tag `deps-baseline-2026-04-20` before start; each phase = own branch                |

---

## 4. Upgrade strategy

### Principles

1. **One phase = one coherent theme** — don't mix a Prisma major with an eslint major. Failures are easier to diagnose when the blast radius is narrow.
2. **Green baseline first** — patch/minor sweep before anything else, so the baseline we're comparing against is clean.
3. **Validation = full local integration + CI green** at the end of every phase. No phase merges to main until CI is green.
4. **Pre-commit every phase on its own branch** named `deps/phase-N-{theme}`. Tag a baseline SHA first (`deps-baseline-2026-04-20`) for easy full-stack revert.
5. **Budget a 3-day rollback window per phase.** If a phase isn't green after 3 working days, freeze the upgrade, revert, and defer that major to post-launch. Don't compound breakage.
6. **Prisma 7 and Zod 4 are the two highest-risk phases.** If any major has to slip, these are the first candidates to defer (Prisma 6 is supported, Zod 3 is stable). Everything else is lower-risk.

### Ordering logic

```
  Node/TS/tooling  →  Prisma  →  Nest  →  React/Next  →  UI libs  →  Zod
  (foundation)        (ORM)      (API)    (web shell)    (visuals)   (schemas)
           ↓
   External SDKs  →  Test infra  →  Dev tools  →  CI/lockfile
```

- Foundation first: a clean Node + TS + eslint layer means every subsequent phase is validated on current-gen tooling.
- Prisma before Nest because Nest services import `@prisma/client` types — changing Prisma later would re-break Nest.
- Nest before Next because shared types in `packages/shared/` flow API → web.
- React/Next is its own big phase.
- UI libs (Tailwind, Radix, lucide, sonner, next-intl) after React because they all peer-depend on React.
- Zod last among blocking changes because its breaking surface is the widest.
- External SDKs + test infra + dev tools at the end — lower blast radius, easier to isolate.

---

## 5. Phased plan

Each phase lists: packages, breaking changes to expect, migration steps, validation, estimated effort.

### Phase 0 — Baseline + green sweep (days 1–3)

**Goal:** Patch/minor sweep, CVE fix, Node LTS pin. Establish a clean baseline.

**Packages (patches + minors only — 58 packages):**

- All ✓-labelled dependencies skipped.
- All 22 patch-behind deps — bulk bump.
- All 36 minor-behind deps — bulk bump.
- Resolve `pnpm audit` CVEs by bumping transitively where possible.

**Specific changes:**

- **Keep Node 24** — it's the current Active LTS (Krypton, EOL April 2028). Earlier plan draft suggested downgrading to 22; that's wrong. Node 22 is in Maintenance only.
- Already have `.nvmrc = 24` and `"node": ">=24"`. Optionally relax to `"node": ">=22 <27"` to keep both active LTSes compatible.
- Bump `packageManager` to latest `pnpm@9.x` patch (skip 10 this round — lockfile-format bump deserves its own review window).
- Run `pnpm update -r --latest-minor` (minors + patches across workspace).
- `pnpm audit --fix` — apply only non-breaking fixes automatically. Current baseline: **25 high + 29 moderate CVEs**; goal is zero high/critical after this phase.
- Manually review any remaining CVEs and document if unfixable-without-major.

**Validation:**

- `turbo lint` clean
- `turbo type-check` clean
- `turbo test` clean (all unit + integration)
- `bash scripts/run-integration-tests.sh both` green
- Spot-check: morph shell renders, login works, one tenant-scoped page loads

**Effort:** 2–3 days (should mostly be bulk-ops + test runs).

**Rollback:** Single revert commit.

---

### Phase 1 — TypeScript 6 + ESLint 10 + tooling (days 4–7)

**Goal:** Modernise the type-check / lint toolchain. No framework changes yet.

**Packages:**

- `typescript 5.7.2 → 6.0.3`
- `eslint 8.57.0 → 10.2.1` (migrate `.eslintrc.*` → `eslint.config.js` flat config — required at 9+)
- `@typescript-eslint/eslint-plugin` + `parser` (bump along with eslint)
- `eslint-config-prettier 9 → 10`
- `eslint-plugin-import 2.31 → 2.32`
- `prettier 3.4 → 3.8`
- `ts-jest 29.2.5 → 29.4.9` (still 29 — matches Jest 29)
- `ts-loader 9.5.1 → 9.5.7`
- `@swc/core 1.15 → 1.15.30`

**Breaking changes to handle:**

- ESLint flat config: our shared `packages/eslint-config` exports module.exports objects → convert to flat config arrays. Our custom rule `eslint-plugin-school` must export the new plugin contract (`{ rules: {...}, configs: {...} }`).
- TS 6: stricter type narrowing in some edge cases, particularly around `unknown` casts. Our strict-mode codebase should be largely immune but expect 10–30 new errors across the monorepo.
- `@typescript-eslint` 8.58+ requires TS ≥5.2 (we're fine).

**Migration steps:**

1. Rewrite `packages/eslint-config/*.js` as flat config.
2. Rewrite `packages/eslint-plugin-school/index.js` to flat-config plugin shape.
3. Bump TS, rerun `turbo type-check`, fix new errors file-by-file.
4. Bump eslint, rerun `turbo lint --fix`.
5. Bump prettier, run `pnpm format`.

**Validation:** same gates as Phase 0, plus `turbo build` on the web + api apps.

**Effort:** 4 days.

**Rollback:** One revert commit per package group; eslint flat-config migration is the largest blast-radius change here — keep it on its own branch.

---

### Phase 2 — Prisma 6 → 7 (days 8–12, +2 buffer)

**Goal:** Update the ORM. First high-risk major. **Biggest single migration of the plan** — bigger than initially estimated.

**Packages:**

- `prisma 6.1.0 → 7.7.0`
- `@prisma/client 6.1.0 → 7.7.0`
- `@prisma/adapter-pg` (NEW — must be installed)

**Breaking changes to handle (verified against official Prisma 7 upgrade guide):**

1. **Schema datasource change**
   - Remove `url = env("DATABASE_URL")` from `datasource db { }` block in `packages/prisma/schema.prisma`.
   - Create `packages/prisma/prisma.config.ts` with the datasource config.

2. **Driver adapter is now mandatory**
   - Install `@prisma/adapter-pg` as a runtime dependency in every package that uses `PrismaClient` (api, worker, tests).
   - Every `new PrismaClient()` must now take an adapter:
     ```typescript
     import { PrismaPg } from '@prisma/adapter-pg';
     const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
     export const prisma = new PrismaClient({ adapter });
     ```
   - This affects **~114 test files** that do `new PrismaClient(...)` directly. Consolidate them via a shared `getTestPrisma()` helper (optional follow-up).

3. **ESM module format required**
   - Prisma 7 client is ESM-only. The monorepo is currently CJS (NestJS tsconfig targets `CommonJS`). Two options:
     - (A) Flip whole monorepo to ESM (`"type": "module"`, `"module": "NodeNext"` in tsconfig) — large change, touches import paths, file extensions, `__dirname`/`__filename` usage.
     - (B) Keep backend on CJS and import the prisma client via dynamic `await import('@prisma/client')` — messy.
   - **Recommendation: (A)** bite the bullet with ESM migration since we're doing a platform-wide refresh anyway. Budget +1 day for the ESM flip.

4. **Generator output mandatory**
   - Add `output = "../node_modules/.prisma/client"` (or a custom path) to the `generator client {}` block.

5. **`prisma.$use()` middleware removed**
   - ✓ **We don't use `$use()`.** RLS middleware uses `prisma.$transaction` + `$extends` (`createRlsClient`). No change needed here.

6. **CLI flag removals**
   - `--schema`, `--skip-generate`, `--skip-seed`, `--url` removed from various `prisma *` commands.
   - Audit scripts/CI workflows that use these flags; replace with config-file equivalents.

7. **Auto-seed on migrate removed**
   - `prisma migrate dev` no longer auto-runs the seed script. CI / deploy scripts must call `prisma db seed` explicitly after migrate.

8. **Query engine changes**
   - Ensure Docker images / CI caches invalidate (new engine binary).
   - Confirm the query engine is available for Linux x64 (CI) and macOS arm64 (local dev).

**Migration steps:**

1. Flip monorepo to ESM first (on its own commit) — update `"type": "module"`, adjust tsconfigs, fix `__dirname` usages (we have a few).
2. Create `packages/prisma/prisma.config.ts`.
3. Install `@prisma/adapter-pg` across api, worker, tests.
4. Rewrite every `new PrismaClient(...)` instantiation to use the adapter.
5. Update schema: remove `url`, add `output` to generator.
6. `prisma generate` → inspect generated types for deltas.
7. `prisma migrate status` on `paralleltest` container.
8. `prisma migrate deploy` on a scratch DB to verify all 114 migrations apply.
9. Run integration tests — focus on RLS behaviour via `createRlsClient()`.
10. Audit the tenant-fixture builder (`apps/api/test/tenant-fixture.builder.ts`) for any Prisma-internal API usage (it uses `$executeRawUnsafe` and `$transaction` — should survive).

**Validation:**

- `turbo test` green across api + shared + worker
- Integration tests green (backend-serial + backend-parallel)
- Migration from production backup restores cleanly with the new client
- Query engine boot time acceptable (measure; previous baseline ~1s)

**Effort:** 5 days. ESM migration is the hidden cost — isolate that on its own commit.

**Rollback:** Revert packages + ESM flip + `prisma.config.ts`. If only the adapter layer is broken, keep ESM and revert only Prisma packages.

**Defer-candidate:** If ESM conversion takes longer than expected, freeze at Prisma 6.25 (latest 6.x) and defer 7.0 to post-launch. Prisma 6 is supported through at least 2027 — not an immediate risk.

---

### Phase 3 — NestJS 11 (days 11–13)

**Goal:** Backend framework major.

**Packages (coordinated set):**

- `@nestjs/common 10.4.15 → 11.1.19`
- `@nestjs/core 10.4.15 → 11.1.19`
- `@nestjs/platform-express 10.4.15 → 11.1.19`
- `@nestjs/testing 10.4.15 → 11.1.19`
- `@nestjs/schematics 10.2.3 → 11.1.0`
- `@nestjs/cli 10.4.9 → 11.0.21`
- `@nestjs/config 3.3.0 → 4.0.4`
- `@nestjs/swagger 7.4.2 → 11.3.0`
- `@nestjs/passport 10.0.3 → 11.0.5`
- `@nestjs/bullmq 10.2.3 → 11.0.4`
- `@nestjs/throttler 6.3.0 → 6.5.0` (minor)

**Breaking changes to handle (verified against NestJS 11 release notes):**

1. **Express 5 is now the default**
   - Wildcard route syntax changed: `/users/*` no longer captures rest of path; must use named param: `/users/*path`.
   - Audit any route with `*` that isn't already named.
   - Our tenant-resolution middleware + all controllers: grep for `*` in `@Controller`, `@Get`, `@Post`, `@All` decorators and in path strings.

2. **Reflector API changes**
   - `Reflector.getAllAndMerge` now returns the object directly when there's only one metadata entry (was array-of-one before).
   - `getAllAndOverride` return type is now `T | undefined` (was `T`).
   - Check all custom decorator + guard usage that reads metadata.

3. **ConfigService behavior**
   - `ConfigService#get` now allows custom config factories to override `process.env` values.
   - Read order: custom factories > `process.env` > defaults.
   - Audit for any place that relies on `process.env` winning.

4. **CacheModule on cache-manager v6**
   - New Keyv-based interface. If we use `CacheModule.register()` with a custom store, the API changed.
   - We don't currently use `CacheModule` heavily — quick grep to confirm.

5. **`setGlobalPrefix` regex support**
   - Known issue (nestjs/nest #16095) with specific regex patterns. We use plain `app.setGlobalPrefix('api')` — ✓ no regex, safe.

6. **`@nestjs/config` 4**
   - `ConfigService.get()` return type no longer defaults to `any` — requires explicit generic.

7. **`@nestjs/swagger` 11**
   - OpenAPI 3.1 is the default. Some decorator names changed.

8. **`@nestjs/bullmq` 11**
   - Aligns with BullMQ 5. `Worker.processor` contract unchanged.

9. **RxJS 7 → 8** (peer)
   - Internal mostly; watch for `Observable` type inference errors.

**Migration steps:**

1. Update all 11 `@nestjs/*` packages in a single lockfile update.
2. Run DI validation script from `CLAUDE.md` — catches module wiring breakage in seconds.
3. Grep-audit all route paths with `*`, update to named wildcards.
4. Grep-audit `Reflector.getAllAndMerge` / `getAllAndOverride` usage, add null checks where needed.
5. Fix `ConfigService.get<T>()` call sites — add explicit generics.
6. Swagger: regenerate OpenAPI spec, compare to baseline for spec drift.
7. Integration test pass over every route (e2e spec coverage already comprehensive).

**Validation:**

- DI smoke test: `npx ts-node -e "Test.createTestingModule({imports:[AppModule]}).compile()..."`
- `turbo test` green
- Integration tests green
- `GET /api/health` + `GET /api/v1/tenants` through the full guard stack

**Effort:** 3 days.

**Rollback:** Revert 11 package bumps atomically.

---

### Phase 4 — React 19 + Next 16 (days 14–18)

**Goal:** Frontend framework major. Largest visible change.

**Packages (coordinated set):**

- `react 18.3.1 → 19.2.5`
- `react-dom 18.3.1 → 19.2.5`
- `@types/react 18.3.18 → 19.2.14`
- `@types/react-dom 18.3.5 → 19.2.3`
- `next 14.2.21 → 16.2.4`
- `eslint-config-next 14.2.21 → 16.2.4`
- `@vitejs/plugin-react 4 → 6.0.1` (storybook/tests)

**Breaking changes to handle (React 19 — verified against react.dev release notes):**

1. **`forwardRef` deprecated** — `ref` is now a standard prop. Codebase audit needed but migration can stay opt-in within this phase; React still exports `forwardRef` through React 19.x.
2. **Ref callback return values: TypeScript-breaking** — implicit returns in ref callbacks are rejected. Convert:
   ```tsx
   // Before (TS error in React 19)
   <div ref={current => (instance = current)} />
   // After
   <div ref={current => { instance = current; }} />
   ```
3. **Ref callback cleanup** — ref functions can now return a cleanup function; old `ref(null)` on unmount deprecated.
4. **`<Context.Provider>` deprecated** — use `<Context>` directly as a provider.
5. **`useFormState` → `useActionState`** — we don't use this today.
6. **Stricter hydration error reporting** — real SSR/CSR mismatches will surface as new console errors. Good thing, but expect noise on first pass.
7. **`useRef<T>()` needs an initial value** under strict TS — audit all call sites.

**Breaking changes to handle (Next 16 — verified against official blog post):**

1. **Version requirements**: Node 20.9+ (✓ we're on 24), TS 5.1+ (✓ we're on 5.7), browsers: Chrome 111+ / Safari 16.4+.
2. **Removed APIs**:
   - AMP support (we don't use AMP).
   - `next lint` command — use ESLint directly; `next build` no longer runs linting.
   - `devIndicators.appIsrStatus` / `buildActivity` / `buildActivityPosition` options.
   - `serverRuntimeConfig` + `publicRuntimeConfig` → use env vars.
   - `experimental.turbopack` → top-level `turbopack`.
   - `experimental.ppr` + `experimental_ppr` → evolved into Cache Components.
   - `unstable_rootParams()`.
   - `next/image` with local `src` + query strings — requires `images.localPatterns` config now.
3. **Async-required APIs** (biggest migration surface):
   - `await params` — every page/layout that reads `params` prop must await it.
   - `await searchParams` — same.
   - `await cookies()`, `await headers()`, `await draftMode()` — from `next/headers`.
   - Metadata image route: `params` is now async, `id` from `generateImageMetadata` is `Promise<string>`.
   - Grep + fix every call site.
4. **`middleware.ts` → `proxy.ts`** (deprecation, not removal yet)
   - Rename the file, rename the exported function to `proxy`.
   - Logic unchanged. Express-style but on Node.js runtime now.
5. **Default bundler = Turbopack** — opt out with `next build --webpack` if needed. Our custom webpack config (if any) needs auditing.
6. **Image defaults changed**:
   - `images.minimumCacheTTL`: 60s → 14400s (4 hours).
   - `images.imageSizes`: `16` removed from defaults.
   - `images.qualities`: `[1..100]` → `[75]`; `quality` prop coerced to nearest.
   - `images.dangerouslyAllowLocalIP` defaults to blocking local IPs.
7. **Parallel routes require `default.js`** — all slots must have one; builds fail without.
8. **Prefetch cache complete rewrite** — no code changes required but behaviour (request count, transfer sizes) differs.
9. **`revalidateTag()` signature changed** — second arg `cacheLife` profile now required.
10. **`@next/eslint-plugin-next` defaults to flat config** — aligns with ESLint v10 (which we bump in Phase 1).

**Automated codemod:** `npx @next/codemod@canary upgrade latest` handles most mechanical changes (async params, image props, etc.). Run early, review the diff.

**Migration steps:**

1. Bump React + types first, run `turbo type-check` on `apps/web`, fix `useRef` etc.
2. Bump Next + eslint-config-next.
3. Run `pnpm --filter @school/web build` — fix any image-component / middleware errors.
4. Run `pnpm --filter @school/web dev`, smoke-test every major route:
   - Login, dashboard, students list, settings, finance, a report card
5. Full Playwright e2e pass — `pnpm --filter @school/web e2e`.

**Validation:**

- Web build green
- Playwright e2e green (or at parity with pre-upgrade flake rate)
- Manual: walk through 5 flagship flows in browser
- Visual: compare morph shell render vs. baseline screenshots

**Effort:** 5 days. This is the phase most likely to consume its full budget.

**Rollback:** 6-package revert; the eslint-config-next pin matters — must match the Next version.

---

### Phase 5 — UI library sweep (days 19–22)

**Goal:** All packages that peer-depend on React 19 or are directly consumed in `packages/ui` / `apps/web`.

**Packages:**

- `tailwindcss 3.4.17 → 4.2.2` (⚠ major — config overhaul)
- `autoprefixer 10.4.20 → 10.5.0`
- `postcss 8.4.49 → 8.5.10`
- All 10 `@radix-ui/*` packages (mix of patches + minors)
- `lucide-react 0.468.0 → 1.8.0` (major — icon package API)
- `next-intl 3.25.3 → 4.9.1` (major — required for Next 16)
- `next-themes 0.4.4 → 0.4.6`
- `react-hook-form 7.55.0 → 7.72.1` (minor)
- `@hookform/resolvers 3.9.1 → 5.2.2` (2 majors — Zod peer change; may block on Phase 6)
- `sonner 1.7.1 → 2.0.7` (major)
- `cmdk 1.0.4 → 1.1.1`
- `tailwind-merge 2.6.0 → 3.5.0` (major)
- `recharts 3.8.0 → 3.8.1`

**Breaking changes to handle (Tailwind 4 — verified against official upgrade guide):**

1. **PostCSS plugin moved** — `tailwindcss` is no longer a PostCSS plugin. Use `@tailwindcss/postcss` or `@tailwindcss/vite`.
2. **Auto-bundled utilities** — remove `postcss-import` and `autoprefixer` from config; now automatic.
3. **CSS-based config** — JS config still works but requires `@config "../../tailwind.config.js";` directive in the CSS entry.
4. **New import syntax**:
   ```css
   /* Before */
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   /* After */
   @import 'tailwindcss';
   ```
5. **Utility renames (cascade — requires grep-replace across the whole frontend)**:
   - `shadow-sm` → `shadow-xs`, `shadow` → `shadow-sm`
   - `drop-shadow-sm` → `drop-shadow-xs`, `drop-shadow` → `drop-shadow-sm`
   - `blur-sm` → `blur-xs`, `blur` → `blur-sm`
   - `backdrop-blur-sm` → `backdrop-blur-xs`, `backdrop-blur` → `backdrop-blur-sm`
   - `rounded-sm` → `rounded-xs`, `rounded` → `rounded-sm`
   - `outline-none` → `outline-hidden`
   - `ring` → `ring-3`
6. **Deprecated opacity utilities**:
   - `bg-opacity-*` → `bg-black/50` slash syntax (same for text/border/divide/ring/placeholder)
   - `flex-shrink-*` → `shrink-*`, `flex-grow-*` → `grow-*`
   - `overflow-ellipsis` → `text-ellipsis`
7. **Default value changes** (visual regression risk):
   - **Border color default**: `gray-200` → `currentColor`. Any element relying on default border will now take the text color.
   - **Ring width default**: 3px → 1px.
8. **`!important` syntax** — `!` at end: `flex!` not `!flex`.
9. **Arbitrary values for variables**: `bg-[--brand-color]` → `bg-(--brand-color)`.
10. **Browser requirements**: Safari 16.4+, Chrome 111+, Firefox 128+.
11. **Upgrade codemod available**: `npx @tailwindcss/upgrade` handles ~80%. Always review the diff.

**Breaking changes to handle (other UI libs):**

- **lucide-react 0 → 1.8**: icons now tree-shake correctly; named imports unchanged; some deprecated icons removed. Minor audit.
- **next-intl 3 → 4**: required for Next 16 compat. Server/client split clearer; middleware config format changes.
- **sonner 1 → 2**: `<Toaster />` prop API tightened; toast positioning defaults changed.
- **tailwind-merge 2 → 3**: requires Tailwind 4; class resolution cleaner.
- **@hookform/resolvers 3 → 5**: tied to Zod 4 (Phase 6) — bump together.

**Migration steps:**

1. Tailwind 4 first (has the widest blast radius) — migrate config, run full visual check.
2. Bump Radix UI packages (low risk).
3. lucide-react — run codemod if provided; grep-audit icon imports.
4. next-intl 4 — update middleware, test locale switching.
5. sonner 2 — audit `<Toaster>` placement, verify toast positioning.
6. Form stack (`react-hook-form`, `@hookform/resolvers`) — defer resolvers to Phase 6 if needed.

**Validation:**

- `pnpm --filter @school/web build` green
- Visual spot-check: login, dashboard, every hub tile, a form page, a table page, RTL in Arabic
- Playwright e2e green

**Effort:** 4 days.

**Rollback:** Tailwind 4 revert is the most involved (config file changes); revert per sub-group.

---

### Phase 6 — Zod 4 + form resolvers (days 23–25)

**Goal:** Validation library major. Breaking surface is wide but mechanical.

**Packages:**

- `zod 3.25.76 → 4.3.6`
- `@hookform/resolvers 3.9.1 → 5.2.2` (if not already done in Phase 5)

**Breaking changes to handle (verified against Zod v4 changelog):**

String format methods moved to top-level namespace:

- `.email()`, `.url()`, `.uuid()`, `.base64url()` deprecated on `z.string()` → use `z.email()`, `z.url()`, `z.uuid()`, `z.base64url()`.
- `.ip()` split → `.ipv4()` and `.ipv6()`. `.cidr()` split → `.cidrv4()` and `.cidrv6()`.
- `z.uuid()` stricter per RFC 9562/4122. `.base64url()` no longer allows padding.

Error customization unified:

- `message` parameter deprecated → `error` parameter.
- `invalid_type_error` and `required_error` removed.
- `errorMap` renamed to `error` (accepts string or `undefined` returns).
- Schema-level error maps now take priority over parse-time maps.

ZodError format changes:

- Issue type names renamed with `$Zod` prefix (e.g., `$ZodIssueInvalidType`).
- Several issue types merged into `$ZodIssueInvalidValue`.
- Removed: `ZodInvalidDateIssue`, `ZodNotFiniteIssue`, `ZodInvalidArgumentsIssue`.
- `ZodError.format()` / `.flatten()` deprecated → use `z.treeifyError()`.
- `.formErrors` removed entirely.
- `.addIssue()` / `.addIssues()` deprecated.

ZodObject method changes:

- `.merge()` deprecated → `.extend()`.
- `.strict()` / `.passthrough()` deprecated → `z.strictObject()` / `z.looseObject()`.
- `.strip()` / `.nonstrict()` / `.deepPartial()` removed entirely.

Other removals/deprecations:

- `z.nativeEnum()` deprecated → `z.enum()`.
- `z.promise()` deprecated.
- `z.record(V)` single-arg removed → `z.record(z.string(), V)` required.
- `z.function()` no longer a schema — standalone factory with `input`/`output` definitions; `.implementAsync()` for async.
- `.refine()` no longer respects type predicates. `ctx.path` dropped from refinement context.
- Infinite values (`POSITIVE_INFINITY`/`NEGATIVE_INFINITY`) no longer valid in `z.number()`.
- `.int()` only accepts safe integers (within `Number.MIN_SAFE_INTEGER` / `Number.MAX_SAFE_INTEGER`).
- `z.literal()` drops symbol support.
- `z.ostring()` / `z.onumber()` static factories removed.

**Blast radius:** `packages/shared/src/` alone has ~150+ Zod schemas. Every DTO in `apps/api/`, every form resolver in `apps/web/`, every job payload schema in `apps/worker/` uses these. Frontend toast-error mapper reads `ZodError.format()` output.

**Migration steps:**

1. Run official codemod if Zod publishes one (`npx zod-v3-to-v4` or similar — check before starting).
2. Grep + manual fix remaining call sites:
   - `.email()` / `.url()` / `.uuid()` / `.ip()` → top-level equivalents
   - `z.record(V)` → `z.record(z.string(), V)`
   - `.merge(` → `.extend(`
   - `.strict()` / `.passthrough()` → `z.strictObject()` / `z.looseObject()`
   - `invalid_type_error:` / `required_error:` → consolidated `error:`
   - `errorMap:` → `error:`
   - `z.nativeEnum` → `z.enum`
3. Audit `all-exceptions.filter.ts` for any Zod-specific error handling; update `.format()` → `z.treeifyError()`.
4. Audit frontend error-toast mapper — `ZodError` shape changes.
5. Rerun every form's `react-hook-form` + `zodResolver` test.
6. Run all API integration tests — Zod validation pipes need to emit the same 400 error shape.

**Validation:**

- Full test suite green
- Sample each Zod schema type (input string/number/date/enum/array/object/union) manually in browser
- Tenant-admin flow end-to-end (form-heavy flows like fee structure creation, student enrolment)

**Effort:** 3 days. Heavily mechanical once the codemod runs.

**Rollback:** Revert Zod + @hookform/resolvers. The codemod-applied changes are reviewable via `git diff`.

---

### Phase 7 — External service SDKs (days 26–28)

**Goal:** Update outward-facing integrations.

**Packages:**

- `stripe 20.4.1 → 22.0.2` (2 majors)
- `resend 4.1.0 → 6.12.0` (2 majors)
- `twilio 5.4.0 → 5.13.1` (minor)
- `@sentry/nestjs` + `@sentry/nextjs` 10.44 → 10.49 (minor)
- `@anthropic-ai/sdk 0.80.0 → 0.90.0`
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` — any recent `3.x` (AWS ships daily; pick a pinned version)
- `puppeteer 23.11.0 → 24.41.0` (PDF generation for report cards)
- `undici 7.24.4 → 8.1.0`

**Breaking changes to handle (Stripe 20 → 22 — verified against stripe-node CHANGELOG):**

This jumps **2 majors** (20 → 21 → 22) with real code impact:

1. **ES6 class requirement (v22)** — `Stripe("sk_...")` without `new` no longer works.

   ```typescript
   // Before (20.x)
   const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
   // After (22.x)
   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
   ```

   Grep every Stripe instantiation — likely in `apps/api/src/modules/finance/` and `apps/api/src/modules/stripe-config/`.

2. **Removed function arg patterns (v22)**:
   - No more API key as positional arg: `stripe.customers.retrieve('cus_123', 'sk_...')` → put key in `RequestOptions`.
   - No more host override per-request — set on client.
   - No more callback signatures (we already use async/await).
   - `apiKey` must be in `RequestOptions`, not mixed into `params`.

3. **`decimal_string` fields → `Stripe.Decimal` type (v21)** — affected across: `InvoiceItem`, `InvoiceLineItem`, `Plan`, `Price`, `CreditNoteLineItem`, `Issuing.*`, `Checkout.Session.currency_conversion.fx_rate`, `V2.Core.Account.percent_ownership`. Any code reading these as `string` or writing with template literals needs `Decimal.from("1.23")` / `.toString()`. Audit finance module carefully.

4. **Pinned API version: `2026-03-25.dahlia`** — align with webhook endpoint API version in Stripe dashboard. Old webhooks pinned to an earlier version will need re-pinning.

5. **Type export changes**:
   - `Stripe.StripeContext` removed as a type → use `StripeContextType`.
   - `Stripe.errors.StripeError` not a type → use `typeof Stripe.errors.StripeError` or `Stripe.ErrorType`.
   - CJS entry no longer has `.default` or `.Stripe` separate properties.

6. **Webhook signature param** now accepts `string[]` (Express compat) — should be transparent.

7. **Node 16 dropped** — we're on 24, fine.

**Breaking changes to handle (other SDKs):**

- **Resend 4 → 6 (2 majors)** — `Resend.emails.send()` signature cleaned up; batch send endpoint exists. Audit every send call in `apps/worker/` and `apps/api/`.
- **Puppeteer 23 → 24** — Chrome version bundled is newer; browser launch API small shifts. Regenerate sample report-card PDF, visual compare.
- **undici 7 → 8** — HTTP client used by internal fetches and some Node test libs. Response-type changes minor.
- **AWS SDK** (1000+ versions behind on patch) — bump to a recent `3.x` version in a single shot; all `@aws-sdk/*` packages version-aligned.
- **Twilio 5.4 → 5.13** (minor) — SMS; no major bump.
- **@sentry/\* 10.44 → 10.49** (minor) — error monitoring.
- **@anthropic-ai/sdk 0.80 → 0.90** (minor pre-1.0) — AI functions; minor can contain breaking changes on pre-1.0 packages, check diff carefully.

**Migration steps:**

1. **Stripe first** (highest risk):
   - Update every `Stripe(...)` → `new Stripe(...)` call.
   - Update API version string to `2026-03-25.dahlia`.
   - Audit finance module for `decimal_string` field reads — switch to `Stripe.Decimal`.
   - Replay a test webhook from `stripe listen --forward-to` against local API, verify signature validation.
   - Run payments flow on Stripe-test (test mode) — customer create → payment intent → webhook → invoice marked paid.
   - Update webhook endpoint API version in Stripe dashboard to match.
2. Resend: update send calls, verify template-id rendering (we use handlebars templates in `apps/worker/`).
3. Puppeteer: regenerate a sample report-card PDF, visual-compare to baseline.
4. AWS SDK: bulk bump, run file upload e2e.
5. Twilio + Sentry + Anthropic: minor bumps, verify one round-trip each.

**Validation:**

- Integration tests (webhooks, email send, PDF render) all green
- Live (dev-environment) round-trip: Stripe-test payment → webhook → invoice marked paid; Resend test email; puppeteer PDF gen

**Effort:** 3 days.

**Rollback:** Per-SDK revert; Stripe is the riskiest — keep API version string matched to code version.

---

### Phase 8 — Test + dev tooling (days 29–30)

**Goal:** Test infra and dev-only tools.

**Packages:**

- `jest 29.7.0 → 30.3.0`
- `@types/jest 29.5.14 → 30.0.0`
- `ts-jest` (stay on 29.x matching Jest version; bump to 30.x alongside Jest)
- `supertest 7.0.0 → 7.2.2` (minor)
- `@playwright/test 1.49.1 → 1.59.1` (minor)
- `@stryker-mutator/*` 8.6 → 9.6 (defer if time-constrained)
- `turbo 2.3.3 → 2.9.6` (minor)
- `vite 5 → 8.0.9` (storybook + tests)
- `storybook + @storybook/*` 8 → 10 (defer if time-constrained — dev-only)

**Breaking changes to handle:**

- **Jest 30**: default `testTimeout` behaviour unchanged; some custom matchers deprecated. We already set `testTimeout: 60_000` in `jest.integration.config.js` — survives unchanged.
- **Playwright 1.59**: minor; primarily perf improvements.
- **Storybook 10**: Vite 8 peer; MDX format shifts. Defer-able.

**Validation:**

- Full test suite on Jest 30
- Rerun the 20× flake harness (`.claude/tmp/flake-triage/run-loop.sh 20`) — confirm no regressions; ideally lower flake rate due to Jest 30 bugfixes.
- Playwright e2e smoke

**Effort:** 2 days (most of it is validation / flake measurement).

**Rollback:** Per-tool revert.

---

### Phase 9 — Final CI + lockfile audit (day 30+)

**Goal:** Ship-ready confirmation.

**Tasks:**

1. `pnpm install --lockfile-only` — ensure the lockfile fully reflects all phases.
2. `pnpm audit` — should now show **0 high, 0 critical**. Moderate count should drop to single digits.
3. `pnpm why <pkg>` on anything suspicious.
4. Delete any deps now genuinely unused (likely `bcrypt` if `bcryptjs` is the sole caller).
5. Full CI run on a PR branch — all jobs green:
   - backend-serial + backend-parallel
   - unit-tests (all 3 shards)
   - visual + build
6. Update `docs/governance/` with the new dep baseline.
7. Tag `deps-upgrade-2026-05-complete` on main after merge.

**Effort:** 1 day.

---

## 6. Validation framework

Each phase must pass these gates before merging to main:

| Gate                       | Command                                             | Failure action                          |
| -------------------------- | --------------------------------------------------- | --------------------------------------- |
| Type-check                 | `turbo type-check`                                  | Fix errors, do not suppress             |
| Lint                       | `turbo lint`                                        | Fix warnings too where possible         |
| Unit tests                 | `turbo test`                                        | All green                               |
| Integration serial         | `pnpm --filter @school/api test:integration:serial` | All green                               |
| Integration parallel (20×) | `bash .claude/tmp/flake-triage/run-loop.sh 20`      | Flake rate must be ≤ pre-phase baseline |
| Build                      | `turbo build`                                       | All apps build clean                    |
| Playwright e2e             | `pnpm --filter @school/web e2e`                     | Golden paths pass                       |
| `pnpm audit`               | `pnpm audit`                                        | Zero high/critical by end of plan       |
| DI smoke                   | (inline `ts-node` script from `CLAUDE.md`)          | `DI OK` in <5s                          |

**Baseline capture:** Before Phase 0, snapshot these metrics so each phase has a diff to compare against:

```bash
turbo test --json > .claude/tmp/deps-baseline/test-baseline.json
turbo build --json > .claude/tmp/deps-baseline/build-baseline.json
pnpm audit --json > .claude/tmp/deps-baseline/audit-baseline.json
bash .claude/tmp/flake-triage/run-loop.sh 20
cp -r .claude/tmp/flake-triage/runs .claude/tmp/deps-baseline/flake-baseline/
```

---

## 7. Rollback strategy

- **Branch-per-phase:** `deps/phase-0-baseline`, `deps/phase-1-ts-eslint`, …
- **Tag before starting:** `git tag deps-baseline-2026-04-20` at the pre-upgrade SHA.
- **Merge only after validation:** each phase branch merges to main only when all gates pass.
- **Three-day timeout per phase:** if a phase isn't green after three working days, close the branch and document what blocked. Revisit post-launch.
- **Prisma 7 and Zod 4 are defer-candidates.** If time runs short, freeze both at current majors and ship — Prisma 6 is supported through at least 2027, Zod 3 is stable.

---

## 8. What this plan explicitly does NOT do

- **Does not upgrade `pnpm 9 → 10`.** Separate concern; 9.x is supported and the lockfile format shift deserves its own review window.
- **Does not migrate away from any runtime.** Still Node, still Nest, still Next. No bun/deno side-quests.
- **Does not touch the monorepo structure.** No package splits, no new workspaces.
- **Does not refactor code beyond what the upgrades demand.** Temptation during an upgrade is to "also clean up X" — resist.

---

## 9. Post-upgrade hygiene (starting month 2)

Once this plan completes and ships, institute a **quarterly dependency pulse** (half a day):

1. `pnpm update -r --latest-minor` (patch + minor)
2. `pnpm audit --fix`
3. Review major-behind list — schedule any that matter
4. Commit, CI, done

That's what keeps the next 3–5 years flat instead of another month-long sprint. Budget ~2 hours per quarter, cap at half a day. If a dep wants more than that, defer it to the next scheduled window.

---

## 10. Success criteria

At the end of this plan, the repo must be in this state:

- ✅ Zero `high` or `critical` CVEs from `pnpm audit`
- ✅ At most 2 major-behind dependencies (currently 44 — should drop to ≤2 that are intentionally deferred and documented)
- ✅ All CI jobs green on main after merge
- ✅ Production deploy verified on the new stack
- ✅ `docs/governance/recovery-backlog.md` updated with any deferred majors (including why)
- ✅ `CLAUDE.md` updated if any convention changed (e.g., Tailwind config location, Prisma config file)
- ✅ Local integration flake rate ≤ pre-upgrade baseline (currently ~20% on Mac due to native Prisma/HTTP crashes — unchanged by upgrades but should not regress)

---

## Appendix A — Package inventory diff (snapshot 2026-04-20)

See `/tmp/sdb-packages.txt` and `/tmp/sdb-table.txt` for the full machine-readable list. Full columns: package name, current version range, latest version from registry, upgrade category.

Regeneration command:

```bash
# Collect all deps across workspace
node -e 'const fs=require("fs");const {execSync}=require("child_process");const files=execSync("find . -name package.json -not -path \"*/node_modules/*\" -not -path \"*/.next/*\" -not -path \"*/dist/*\" -not -path \"./.opencode/*\"").toString().trim().split("\n");const packages=new Map();for(const f of files){const pkg=JSON.parse(fs.readFileSync(f,"utf8"));for(const field of ["dependencies","devDependencies","peerDependencies"]){if(!pkg[field])continue;for(const [name,version] of Object.entries(pkg[field])){if(name.startsWith("@school/"))continue;if(!packages.has(name))packages.set(name,new Set());packages.get(name).add(version);}}}const entries=Array.from(packages.entries()).sort(([a],[b])=>a.localeCompare(b));for(const [name,versions] of entries){console.log(name+"|"+Array.from(versions).join(","));}' > /tmp/sdb-packages.txt

# Fetch latest versions
: > /tmp/sdb-latest.txt
cat /tmp/sdb-packages.txt | awk -F'|' '{print $1}' | while read pkg; do
  (latest=$(curl -s "https://registry.npmjs.org/${pkg}/latest" 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{console.log(JSON.parse(d).version||"?")}catch{console.log("?")}})')
   echo "${pkg}|${latest}" >> /tmp/sdb-latest.txt) &
  [ $(jobs -p | wc -l) -ge 15 ] && wait -n
done; wait
```

---

## Appendix B — Why certain packages are NOT upgraded

| Package             | Current | Latest | Defer reason                                                |
| ------------------- | ------- | ------ | ----------------------------------------------------------- |
| pnpm                | 9.15.4  | 10.x   | Lockfile format change; separate review window              |
| storybook + addons  | 8.x     | 10.3.5 | Dev-only; no user-facing impact. Upgrade opportunistically. |
| @stryker-mutator/\* | 8.6.0   | 9.6.1  | Mutation testing — not on critical path                     |

---

_This plan is a living document. Update the status of each phase as it completes. Strike-through rather than delete phases that are deferred post-launch, with the deferral rationale inline._

---

## Appendix C — Verification log (2026-04-20)

Version data verified against authoritative sources on this date. Sources:

**GitHub releases API** (`gh api repos/<org>/<repo>/releases/latest`):

| Package family          | Repo                                | Latest tag         | Released   |
| ----------------------- | ----------------------------------- | ------------------ | ---------- |
| react / react-dom       | facebook/react                      | v19.2.5            | 2026-04-08 |
| next                    | vercel/next.js                      | v16.2.4            | 2026-04-15 |
| @nestjs/\*              | nestjs/nest                         | v11.1.19           | 2026-04-13 |
| prisma / @prisma/client | prisma/prisma                       | 7.7.0              | 2026-04-07 |
| zod                     | colinhacks/zod                      | v4.3.6             | 2026-01-22 |
| tailwindcss             | tailwindlabs/tailwindcss            | v4.2.2             | 2026-03-18 |
| eslint                  | eslint/eslint                       | v10.2.1            | 2026-04-17 |
| jest                    | jestjs/jest                         | v30.3.0            | 2026-03-10 |
| typescript              | microsoft/TypeScript                | v6.0.3             | 2026-04-16 |
| stripe (node SDK)       | stripe/stripe-node                  | v22.0.2            | 2026-04-16 |
| resend                  | resend/resend-node                  | v6.12.0            | 2026-04-15 |
| puppeteer               | puppeteer/puppeteer                 | puppeteer-v24.41.0 | 2026-04-15 |
| next-intl               | amannn/next-intl                    | v4.9.1             | 2026-04-10 |
| lucide-react / lucide   | lucide-icons/lucide                 | 1.8.0              | 2026-04-09 |
| sonner                  | emilkowalski/sonner                 | v2.0.7             | 2025-08-02 |
| @hookform/resolvers     | react-hook-form/resolvers           | v5.2.2             | 2025-09-14 |
| @aws-sdk/\*             | aws/aws-sdk-js-v3                   | v3.1032.0          | 2026-04-17 |
| twilio                  | twilio/twilio-node                  | 5.13.1             | 2026-03-24 |
| @sentry/\*              | getsentry/sentry-javascript         | 10.49.0            | 2026-04-16 |
| @anthropic-ai/sdk       | anthropics/anthropic-sdk-typescript | sdk-v0.90.0        | 2026-04-16 |
| bcrypt                  | kelektiv/node.bcrypt.js             | v6.0.0             | 2025-04-21 |
| undici                  | nodejs/undici                       | v8.1.0             | 2026-04-13 |
| pnpm                    | pnpm/pnpm                           | v10.33.0           | 2026-03-24 |
| bullmq                  | taskforcesh/bullmq                  | v5.74.2            | 2026-04-20 |
| turbo                   | vercel/turbo                        | v2.9.6             | 2026-04-10 |
| vite                    | vitejs/vite                         | 8.0.9              | 2026-04-20 |
| helmet                  | helmetjs/helmet                     | 8.1.0              | (npm)      |
| storybook               | storybookjs/storybook               | v10.3.5            | 2026-04-07 |
| @stryker-mutator/\*     | stryker-mutator/stryker-js          | v9.6.1             | 2026-04-10 |
| @nestjs/bullmq          | nestjs/bull                         | 11.0.4             | 2025-10-10 |
| ioredis                 | luin/ioredis                        | v5.10.1            | 2026-03-19 |

**Node.js release schedule** (nodejs/release README):

- Node 24.x Krypton: **Active LTS** (transitioned 2025-10-28), EOL 2028-04-30.
- Node 22.x Jod: Maintenance LTS, EOL 2027-04-30.
- Node 20.x Iron: Maintenance LTS.

**Official migration guides consulted:**

- Prisma 7: https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-to-prisma-7
- Tailwind 4: https://tailwindcss.com/docs/upgrade-guide
- Zod 4: https://zod.dev/v4/changelog
- React 19: https://react.dev/blog/2024/12/05/react-19
- Next 16: https://nextjs.org/blog/next-16
- NestJS 11: GitHub release notes + community migration write-ups (official docs page was thin at time of verification)
- Stripe: https://github.com/stripe/stripe-node/blob/master/CHANGELOG.md (+ wiki migration guides for v21 and v22)

**Refresh this appendix** every 60 days (or when any phase begins) by rerunning the commands in Appendix A + rechecking each major's release notes.
