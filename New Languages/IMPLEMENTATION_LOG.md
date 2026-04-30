# Multi-Language Expansion — Implementation Log

**Project:** Add 4 Tier-1 (`ga`, `fr`, `de`, `es`) and 3 Tier-2 (`it`, `ro`, `pl`) languages to SDB.
**Strategy:** see `STRATEGY.md` in this folder.
**Specs:** see `implementations/01-…` through `implementations/13-…` in this folder, with `12.5` reserved for the PDF catalogue extraction pass.
**Started:** 2026-04-25 (Phase 0 spec authored)

---

## Status legend

- ⚪ **Pending** — not yet started
- 🟡 **In progress** — implementation is currently active or partially complete
- 🟢 **Complete & deployed** — all checks passed, deployed to production, Playwright-verified, codebase released to next implementation
- 🔴 **Blocked / Failed** — implementation hit an issue that prevents completion; details in the entry's "Notes" section

An implementation is **not 🟢** until: local tests pass + commit on main + CI green + production deploy succeeds + Playwright verification passes + log entry updated with commit SHA(s) + deploy timestamp.

---

## Implementation index

> Implementations are numbered 1–13 plus 12.5 (sequential at codebase level — only one runs at a time).
> Within Phase 4 and Phase 5, the _content_ is reorderable (FR ↔ ES ↔ DE ↔ GA, and IT ↔ RO ↔ PL). The numbering below reflects the **recommended execution order** (easiest → hardest within each tier).
> Implementation 12.5 is a fixed architecture gate before 13, not a language rollout.

| #    | Phase                  | Spec                                                         | Locale / Topic                             | Status                 | Model      | Effort   |
| ---- | ---------------------- | ------------------------------------------------------------ | ------------------------------------------ | ---------------------- | ---------- | -------- |
| 01   | 1 — Foundation         | `implementations/01-schema-rls-locale-registry.md`           | Schema, RLS, locale registry               | 🟢 Complete & deployed | Opus 4.7   | High     |
| 02   | 1 — Foundation         | `implementations/02-arabic-cleanup-hard-error-flip.md`       | Arabic cleanup + hard-error flip           | 🟢 Complete & deployed | GPT-5.5    | Max      |
| 03   | 1 — Foundation         | `implementations/03-tenant-gating-ui-language-picker.md`     | Tenant gating UI + language picker         | 🟢 Complete & deployed | GPT-5.5    | Standard |
| 04   | 2 — Refactor           | `implementations/04-pdf-templates-locale-driven-refactor.md` | PDF templates: locale-driven refactor      | 🟢 Complete & deployed | GPT-5.5    | Max      |
| 05   | 2 — Refactor           | `implementations/05-notification-template-refactor.md`       | NotificationTemplate refactor              | 🟢 Complete & deployed | GPT-5.5    | High     |
| 06   | 3 — Dispatch           | `implementations/06-dual-language-household-dispatch.md`     | Dual-language household dispatch fanout    | 🟢 Complete & deployed | GPT-5.5    | High     |
| 07   | 4 — Tier 1             | `implementations/07-french.md`                               | French (`fr`) full catalogue + Playwright  | 🟢 Complete & deployed | GPT-5.5    | High     |
| 08   | 4 — Tier 1             | `implementations/08-spanish.md`                              | Spanish (`es`) full catalogue + Playwright | 🟢 Complete & deployed | GPT-5.5    | High     |
| 09   | 4 — Tier 1             | `implementations/09-german.md`                               | German (`de`) full catalogue + Playwright  | 🟢 Complete & deployed | GPT-5.5    | High     |
| 10   | 4 — Tier 1             | `implementations/10-irish.md`                                | Irish (`ga`) full catalogue + Playwright   | 🟢 Complete & deployed | GPT-5.5    | Max      |
| 11   | 5 — Tier 2             | `implementations/11-italian.md`                              | Italian (`it`) parent+student catalogue    | 🟢 Complete & deployed | Sonnet 4.6 | Max      |
| 12   | 5 — Tier 2             | `implementations/12-romanian.md`                             | Romanian (`ro`) parent+student catalogue   | ⚪ Pending             | Opus 4.7   | High     |
| 12.5 | 5.5 — PDF Architecture | `(to author) implementations/12.5-pdf-message-catalogues.md` | PDF templates: per-template catalogues     | ⚪ Pending             | GPT-5.5    | Max      |
| 13   | 5 — Tier 2             | `implementations/13-polish.md`                               | Polish (`pl`) parent+student catalogue     | ⚪ Pending             | Opus 4.7   | Max      |
| —    | 6 — Rollout (rolling)  | (no spec; ops only)                                          | Per-tenant `supported_locales` flips       | ⚪ Pending             | n/a        | n/a      |

**Critical path:** 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 12.5 → 13 → Phase 6 rollout

**Sequential at the codebase level** (no worktrees / no branches / no PRs). Only one implementation runs on the codebase at a time.

> **Legacy ID mapping** (for historical reference — the strategy still uses these in some places):
> 01=P1A · 02=P1B · 03=P1C · 04=P2A · 05=P2B · 06=P3 · 07=P4-FR · 08=P4-ES · 09=P4-DE · 10=P4-GA · 11=P5-IT · 12=P5-RO · 12.5=P5.5-PDF-CATALOGUES · 13=P5-PL.

---

## Phase 0 — Spec & Strategy

### P0 — Strategy & implementation log

- **Status:** 🟢 Complete (documentation only — no production deploy)
- **Model:** Opus 4.7 / High effort
- **Began:** 2026-04-25
- **Completed:** 2026-04-28 (this rewrite numbered the specs and produced the per-implementation blueprints)
- **Tasks:**
  - [x] Audit current i18n infrastructure (frontend, backend, worker, tests)
  - [x] Brainstorm scope, tiers, dual-language model, launch threshold, pacing
  - [x] Archive obsolete prior strategy files to `_archive/`
  - [x] Write `STRATEGY.md`
  - [x] Write `IMPLEMENTATION_LOG.md` (this file)
  - [x] Author per-implementation specs under `implementations/01-13`
  - [x] Renumber from alphanumeric (P1A/P2B/P4-FR…) to plain numbers (01–13)
  - [ ] Spec self-review — pending user
  - [ ] Commit deliverables on `main` — pending user
  - [ ] User review gate

### Notes

- This phase does not deploy to production (no code changes); the deliverable is documentation + planning. The "deploy" gate doesn't apply.
- The slash command equivalent (`/NL <id>`) can be authored from the existing `/SW`, `/BH`, `/WBR` templates and would invoke `implementations/<NN>-*.md`. Not authored here — wait for user direction on whether to keep the rebuild slash-command pattern.

---

## Phase 1 — Foundation

### 01 — Schema, RLS, locale registry

- **Spec:** `implementations/01-schema-rls-locale-registry.md`
- **Status:** 🟢 Complete & deployed
- **Model:** Opus 4.7 / High effort
- **Depends on:** P0 approved
- **Began:** 2026-04-28
- **Completed:** 2026-04-28

**Scope summary:**

- Migration `add_locale_expansion_columns`: `Tenant.supported_locales TEXT[]`, `Household.secondary_locale TEXT`, `Household.dual_language_opt_in BOOLEAN`. Backfill every existing tenant to `['en','ar']`. CHECK constraint `default_locale = ANY(supported_locales)`.
- New file `apps/web/i18n/registry.ts` — single source of truth for locale metadata (code, English name, native name, direction, tier, active flag).
- `apps/web/i18n/config.ts` — derive active `locales` array from registry.
- New file `apps/web/i18n/tier-scopes.ts` — `TIER_2_NAMESPACES` allowlist.
- Backend Zod schemas in `packages/shared/src/i18n/locale-codes.ts`.
- Tests: registry unit tests, allowlist subset test, RLS leakage tests for new Household columns and Tenant.supported_locales.

### Acceptance

- [x] Migration applies cleanly to fresh DB
- [x] Migration applies cleanly to NHQS prod snapshot
- [x] Existing en + ar Playwright suite passes (no regression)
- [x] CI green on main
- [x] Production deploy successful
- [x] Production verification: `SELECT supported_locales FROM tenants` shows `{en,ar}` for every row

### Commits / CI / Deploy / Playwright / Notes

- Commits:
  - `23a359ad` — `feat(i18n): add locale registry as single source of truth`
  - `22927f9e` — `refactor(i18n): derive active locales from registry`
  - `ee4710fe` — `feat(i18n): add Tier 2 namespace allowlist for parent+student surface`
  - `d09efe67` — `feat(shared): add Zod schemas for locale operations`
  - `21e88156` — `feat(db): add locale expansion columns + backfill existing tenants`
  - `ca9d6e88` — `test(i18n): rls leakage tests for tenant + household locale columns`
  - `a25b973e` — `feat(api): expose supported_locales and household locale columns in read paths`
  - `38a0afeb` — `docs(architecture): document i18n hard-error parity gate + flip impl 01 to in progress`
  - `d90c4456` — `test(reports): add supported_locales to TenantCoreRow mocks in report-export spec`
  - `ac6eb3da` — `fix(db): split locale CHECK + index into post_migrate.sql + add supported_locales to seed`
- CI / deploy:
  - Production run `25081384456` succeeded.
  - Deploy completed 2026-04-28 22:54 UTC.
- Notes:
  - Foundation is now released. Locale expansion columns are live, active runtime locales still remain `en` + `ar`, and downstream implementations can depend on the registry / tier-scope / shared-schema surface.

---

### 02 — Arabic placeholder cleanup + hard-error flip

- **Spec:** `implementations/02-arabic-cleanup-hard-error-flip.md`
- **Status:** 🟢 Complete & deployed
- **Model:** GPT-5.5 / **Max effort**
- **Depends on:** 01 complete
- **Began:** 2026-04-29
- **Completed:** 2026-04-29

**Scope summary:**

- Audit `ar.json` for `[AR] …` placeholders; translate to proper Arabic.
- Generalise `translation-parity.spec.ts` to N locales with Tier 2 allowlist branch.
- `next-intl` `onError`: throw in dev, Sentry-then-throw in prod.
- Extend `scripts/check-i18n.js` to scan all active locales.
- Add parity test as a CI hard gate on every push.

### Acceptance

- [x] AR placeholder audit: 0 remaining `[AR] …` strings
- [x] `translation-parity.spec.ts` passes for every active locale
- [x] `scripts/check-i18n.js` passes across active locales; parity gaps are `en=0, ar=0` (baseline tracked static missing keys remain `en=56, ar=56`)
- [x] Hard-error flag is on; missing key handler throws and is unit-tested
- [x] CI parity gate active
- [x] AR Playwright suite passes
- [x] Production deploy successful
- [x] Sentry: zero `MISSING_MESSAGE` exceptions in 30 minutes post-deploy

### Commits / CI / Deploy / Playwright / Notes

- Local verification passed 2026-04-29:
  - `pnpm --filter @school/web test -- translation-parity --runInBand`
  - `pnpm --filter @school/web test -- missing-message-handler --runInBand`
  - `pnpm i18n:check`
  - `pnpm --filter @school/web type-check`
  - `pnpm --filter @school/web lint:ci`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm turbo run type-check`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm --filter @school/api lint`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm turbo run test` completed all non-shared packages; `@school/shared` was rerun directly after the shared worker stalled and passed with 50 suites / 947 tests.
  - `pnpm --filter @school/web build`
  - `pnpm --filter @school/web exec playwright test regulatory-rtl --config e2e/playwright.regulatory.config.ts --project=ar-rtl` — 33 Arabic RTL regulatory routes passed.
- Commits:
  - `c8119098` — `feat(i18n): harden Arabic catalogue parity`
  - `27eb5942` — `fix(i18n): nest wellbeing notification event messages`
- CI / deploy:
  - Initial run `25085264930` failed on a missing Arabic wellbeing notification nesting issue.
  - Follow-up run `25085726447` succeeded.
  - Deploy completed 2026-04-29 01:14 UTC.
- Notes:
  - Arabic placeholder cleanup is complete.
  - Multi-locale parity is now a hard CI gate.
  - `next-intl` missing messages now throw, with production Sentry reporting before the throw.
  - Implementation 03 is unblocked.

---

### 03 — Tenant gating UI + language picker refactor

- **Spec:** `implementations/03-tenant-gating-ui-language-picker.md`
- **Status:** 🟢 Complete & deployed
- **Model:** GPT-5.5 / Standard
- **Depends on:** 02 complete
- **Began:** 2026-04-29
- **Completed:** 2026-04-29

**Scope summary:**

- `apps/web/src/components/locale-picker.tsx`: dynamic dropdown sourced from `tenant.supported_locales`.
- Replace binary EN/AR toggle in `user-menu.tsx` and profile page.
- Backend `PATCH /v1/admin/tenants/:id/supported-locales` with platform-admin permission and safety checks (block removing default; block removing locale users prefer).
- Platform-admin frontend in `(platform)/admin/tenants/[id]/locales`.
- Validation: every locale-related write checks the value is in `tenant.supported_locales`.

### Acceptance

- [x] Picker dynamic + tenant-gated
- [x] Profile selector enforces same filter
- [x] Platform admin can flip `supported_locales` per tenant via UI
- [x] CI green; production deploy successful
- [x] Playwright: NHQS user sees en + ar only

### Commits / CI / Deploy / Playwright / Notes

- Commit: `8dd4b7fd` — `feat(i18n): add tenant-gated locale controls`
- Follow-up verification commits in the same deployment batch:
  - `53d53b5d` — `test(api): update language endpoints snapshot`
  - `e99923f4` — `test(api): stabilize integration collider split`
- CI / deploy:
  - Production run `25091631201` succeeded.
  - Deploy completed 2026-04-29 05:09 UTC.
- Local verification:
  - `pnpm --filter @school/shared test -- locale-codes --runInBand`
  - `pnpm --filter @school/api test -- tenants.service tenants.controller preferences.service --runInBand`
  - `pnpm --filter @school/web test -- locale-picker user-menu --runInBand`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm turbo run test --concurrency=1 -- --runInBand`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm lint:ci`
  - `pnpm type-check`
  - `pnpm build`
- Production verification:
  - NHQS user menu language picker shows exactly `en` and `ar`.
  - Production tenant rows verified with `supported_locales = {en,ar}` for every tenant.
- Notes:
  - Added `GET /api/v1/tenants/me` for tenant-supported-locale discovery.
  - Added platform-admin `PATCH /api/v1/admin/tenants/:id/supported-locales` with default-locale and active-user-preference safety checks.
  - User profile and preference writes now reject unsupported tenant locales.

---

## Phase 2 — Template Refactor

### 04 — PDF templates: locale-driven refactor

- **Spec:** `implementations/04-pdf-templates-locale-driven-refactor.md`
- **Status:** 🟢 Complete & deployed
- **Model:** GPT-5.5 / **Max effort**
- **Depends on:** 03 complete
- **Began:** 2026-04-29
- **Completed:** 2026-04-29

**Scope summary:**

- Refactor 13 PDF template types to expose one locale-driven template entrypoint per type.
- Preserve current en/ar output by delegating those unified entrypoints to the existing locale-specific renderers.
- New Handlebars helpers: `t`, `formatDate`, `formatCurrency`, `formatNumber`, `getLocalizedSchoolName`.
- Existing renderer tests cover locale dispatch and unsupported-locale hard errors.
- 13 PDF types: receipt, invoice, household-statement, report-card, report-card-modern, transcript, payslip, des-inspection, pastoral-summary, sst-activity, safeguarding-compliance, wellbeing-programme, trip-leader-pack.

### Acceptance

- [x] All 13 types route through one locale-aware template entrypoint while preserving existing en/ar renderer output
- [x] New Handlebars helpers added with unit tests
- [x] Existing PDF renderer tests cover locale routing and unsupported-locale hard errors
- [x] Production deploy successful
- [x] Manual verification: deployed API accepts only current template locales (`en`, `ar`) for PDF rendering

### Commits / CI / Deploy / Playwright / Notes

- Commit: `23d9e5f0` — `feat(pdf): route rendering through locale templates`
- CI / deploy:
  - Production run `25091631201` succeeded.
  - Deploy completed 2026-04-29 05:09 UTC.
- Local verification:
  - `pnpm --filter @school/api test -- pdf-rendering.service handlebars-i18n --runInBand`
  - `pnpm --filter @school/api type-check`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm --filter @school/api lint`
- Notes:
  - This implementation intentionally used compatibility wrappers (`{type}.template.ts`) over the existing en/ar template pair for each PDF type. That gives downstream language work one stable locale-aware entrypoint per template type without changing the current en/ar HTML.
  - Full per-template message JSON extraction and committed pixel-baseline artifacts were not introduced in this pass; the compatibility route preserves existing output by construction and keeps the new locale-entry contract available for Phase 4/5 additions.

---

### 05 — NotificationTemplate refactor

- **Spec:** `implementations/05-notification-template-refactor.md`
- **Status:** 🟢 Complete & deployed
- **Model:** GPT-5.5 / High effort
- **Depends on:** 04 complete
- **Began:** 2026-04-29
- **Completed:** 2026-04-29

**Scope summary:**

- Migrate system `notification_templates` rows to reference message-catalogue keys via `t:` prefix.
- Tenant-specific override rows untouched (raw Handlebars).
- New `TemplateRendererService` in `apps/api/src/modules/communications/template-renderer.service.ts` with hard-error policy on missing catalogue key.
- Update API dispatch and worker dispatch paths to resolve catalogue-backed templates by locale.
- Shared notification message catalogues live under `packages/shared/src/notifications/messages/`.

### Acceptance

- [x] All system rows reference `t:` keys
- [x] Tenant override rows untouched
- [x] `notifications.{en,ar}.json` exist and parse
- [x] Renderer unit + integration tested
- [x] Production deploy successful
- [x] Production verification confirms all system template bodies and non-null subjects resolve through catalogue refs

### Commits / CI / Deploy / Playwright / Notes

- Commit: `0e1904de` — `feat(notifications): catalogue-backed system templates`
- CI / deploy:
  - Production run `25091631201` succeeded.
  - Deploy completed 2026-04-29 05:09 UTC.
- Local verification:
  - `pnpm --filter @school/shared test -- notification-message-catalogue --runInBand`
  - `pnpm --filter @school/api test -- template-renderer notification-dispatch --runInBand`
  - `pnpm --filter @school/worker test -- dispatch-notifications --runInBand`
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/worker type-check`
  - `pnpm --filter @school/shared type-check`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm --filter @school/api lint`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm --filter @school/worker lint`
- Production verification:
  - Migration `20260429120000_migrate_system_notification_templates_to_catalogue` is applied.
  - `notification_templates` system rows: `138/138` body templates use `t:` refs.
  - `notification_templates` system rows: `138/138` subject templates are either `NULL` or use `t:` refs.
- Notes:
  - Production system-template inventory was captured before the migration in `New Languages/_evidence/notification-system-templates-pre-refactor.txt`.
  - Migration was dry-run against production with `BEGIN ... ROLLBACK` before deployment; every expected update matched the live row counts.
  - Tenant-specific override rows remain raw Handlebars.

---

## Phase 3 — Dual-Language Dispatch

### 06 — Dual-language household dispatch fanout

- **Spec:** `implementations/06-dual-language-household-dispatch.md`
- **Status:** 🟢 Complete & deployed
- **Model:** GPT-5.5 / High effort
- **Depends on:** 05 complete
- **Began:** 2026-04-29
- **Completed:** 2026-04-29

**Scope summary:**

- Household profile UI: `secondary_locale` dropdown + `dual_language_opt_in` toggle (`PATCH /v1/households/:id/locale-preferences`).
- Shared `fanoutNotification(notification, household)` helper with truth-table semantics, re-exported for worker use.
- Parent dashboard now returns household locale metadata.
- `NotificationsService.createBatch` expands eligible parent notifications into per-locale rows.
- Idempotency keys suffixed per locale.

### Acceptance

- [x] Household opt-in UI functional
- [x] Fanout correct in all four permutations
- [x] Idempotency: no duplicate emit on retry
- [x] Notification rows carry locale-specific idempotency keys when fanout fires
- [x] Production deploy successful
- [x] Playwright: NHQS parent household page renders dual-language controls and tenant-gated locale options

### Commits / CI / Deploy / Playwright / Notes

- Commit: `76d18ce6` — `feat(notifications): add household dual-language fanout`
- CI / deploy:
  - Production run `25091631201` succeeded.
  - Deploy completed 2026-04-29 05:09 UTC.
- Local verification:
  - `pnpm --filter @school/worker test -- notification-fanout --runInBand`
  - `pnpm --filter @school/shared test -- notification-fanout --runInBand`
  - `pnpm --filter @school/web test -- translation-parity --runInBand`
  - `pnpm --filter @school/api test -- notifications.service households.service dashboard.service dashboard.controller --runInBand`
  - API, web, shared, and worker type-check/lint passes.
  - API DI compile check passed after rebuilding `@school/shared`.
- Production verification:
  - NHQS parent account loads `/en/parent/household` on mobile viewport.
  - Page renders the dual-language opt-in switch and secondary-language picker.
  - Secondary-language picker shows only tenant-supported locales: `English` and `العربية`.
- Notes:
  - Parent dashboard now includes household locale metadata.
  - Added `PATCH /v1/households/:id/locale-preferences` for linked household parents.
  - `NotificationsService.createBatch` expands parent-recipient notifications into locale-specific rows when household dual-language opt-in applies.
  - Production browser verification did not create a new live family/payment event; live dispatch behavior is covered by service tests and the deployed database/template checks.

---

## Phase 4 — Tier 1 Languages

> Recommended execution order: 07 (FR) → 08 (ES) → 09 (DE) → 10 (GA). Easiest → hardest. User may reorder; only the codebase-sequential rule is hard.

### 07 — French (`fr`)

- **Spec:** `implementations/07-french.md`
- **Status:** 🟢 Complete & deployed
- **Model:** GPT-5.5 / High effort
- **Depends on:** 06 complete
- **Began:** 2026-04-29
- **Completed:** 2026-04-29

**Scope summary:**

- Translate `en.json` → `fr.json` (full active web catalogue).
- Translate notification catalogue entries into `notifications.fr.json`.
- Enable French PDF rendering through the current locale-template architecture with French label/date/status localization.
- Flip `fr.active = true` in registry.
- Add `fr-ltr` + `fr-mobile` Playwright projects plus French public visual/leak smoke baselines.
- Enable for NHQS via `UPDATE tenants SET supported_locales = supported_locales || '{fr}'::text[] WHERE slug = 'nhqs'`.

### Acceptance

- [x] Translation parity 100% against `en.json`
- [x] `pnpm i18n:check` passes with active locales `en`, `ar`, `fr`
- [x] Public `[fr]` login/contact visual + visible-text leak smoke passes
- [x] Notification dispatch and catalogue fallback tests pass
- [x] PDF French smoke path passes
- [x] Full local lint + type-check + regression tests pass
- [x] Production web build passes
- [x] Public en + ar visual smoke remains clean
- [x] NHQS-only `supported_locales` includes `fr`
- [x] CI green; production deploy successful

### Commits / CI / Deploy / Playwright / NHQS rollout / Notes

- Local verification passed 2026-04-29:
  - `pnpm --filter @school/web test -- translation-parity --runInBand`
  - `pnpm i18n:check`
  - `pnpm --filter @school/web test -- registry --runInBand`
  - `pnpm --filter @school/shared test -- notification-message-catalogue locale-codes --runInBand`
  - `pnpm --filter @school/api test -- pdf-rendering.service locale-template notification-templates.service --runInBand`
  - `pnpm --filter @school/api test -- template-renderer.service --runInBand`
  - `pnpm --filter @school/worker test -- dispatch-notifications --runInBand`
  - `pnpm --filter @school/web exec playwright test --config e2e/playwright.visual-smoke.config.ts --update-snapshots`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm test`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm type-check`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm lint`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm --filter @school/web build`
- Commits:
  - `0ce70ab5` — `docs(i18n): seed French rollout glossary`
  - `735f59f4` — `feat(i18n): add and activate French web locale`
  - `247bf0bc` — `feat(notifications): support French catalogue rendering`
  - `faa7e9ca` — `feat(pdf): enable French PDF rendering smoke path`
  - `505ea984` — `feat(i18n): accept registered locales in exports`
  - `ec9cc970` — `test(e2e): add French public visual smoke coverage`
- CI / deploy:
  - Production run `25095725330` succeeded.
  - Deploy completed 2026-04-29 07:25 UTC.
- NHQS rollout:
  - Production update applied 2026-04-29 12:25 UTC.
  - Readback: `nhqs.supported_locales = {en,ar,fr}`.
- Production verification:
  - Public `/fr/login` and `/fr/contact` returned 200 with `html lang="fr"` and no visible placeholder leaks.
  - NHQS owner login succeeded on `/fr/login`; `/fr/dashboard`, `/fr/students`, `/fr/finance`, and `/fr/profile` rendered in French with no visible placeholder leaks.
  - User-menu language picker showed `en`, `ar`, and `fr` for NHQS after the tenant flip.
- Notes:
  - `fr` is active in the runtime registry but tenant availability remains gated by each tenant's `supported_locales`.
  - Notification template lookup now falls back from non-English locales to the platform English catalogue-backed `t:` row, allowing the requested locale's catalogue to render without duplicating database template rows for every new language.
  - PDF rendering did not add `templates/messages/{type}.fr.json` files because implementation 04 left the live renderer on locale-specific TypeScript templates plus `renderLegacyLocaleTemplate`; French is enabled through that current extension point and covered by a smoke test.

---

### 08 — Spanish (`es`)

- **Spec:** `implementations/08-spanish.md`
- **Status:** 🟢 Complete & deployed
- **Model:** GPT-5.5 / High effort
- **Depends on:** 07 complete
- **Began:** 2026-04-29
- **Completed:** 2026-04-29

**Scope summary:**

- Extend `New Languages/glossary.md` with neutral Spanish terms.
- Translate `en.json` → `es.json` (full active web catalogue; tuteo, no voseo).
- Translate notification catalogue entries into `notifications.es.json`.
- Enable Spanish PDF rendering through the current locale-template architecture with Spanish label/date/status localization.
- Flip `es.active = true` in registry.
- Add `es-ltr` + `es-mobile` Playwright projects plus Spanish public visual/leak smoke baselines.
- Enable for NHQS via `UPDATE tenants SET supported_locales = supported_locales || '{es}'::text[] WHERE slug = 'nhqs'`.

### Acceptance

- [x] Translation parity 100% against `en.json`
- [x] `pnpm i18n:check` passes with active locales `en`, `ar`, `fr`, `es`
- [x] Public `[es]` login/contact visual + visible-text leak smoke passes
- [x] Notification dispatch and catalogue fallback tests pass
- [x] PDF Spanish smoke path passes
- [x] Full local lint + type-check + regression tests pass
- [x] Production web build passes
- [x] Public en + ar + fr + es visual smoke remains clean
- [x] NHQS-only `supported_locales` includes `es`
- [x] CI green; production deploy successful

### Commits / CI / Deploy / Playwright / NHQS rollout / Notes

- Local verification passed 2026-04-29:
  - `pnpm --filter @school/web test -- translation-parity --runInBand`
  - `pnpm i18n:check`
  - `pnpm --filter @school/web test -- registry --runInBand`
  - `pnpm --filter @school/shared test -- notification-message-catalogue locale-codes --runInBand`
  - `pnpm --filter @school/api test -- locale-template pdf-rendering.service --runInBand`
  - `pnpm --filter @school/api test -- template-renderer.service notification-templates.service --runInBand`
  - `pnpm --filter @school/worker test -- dispatch-notifications --runInBand`
  - `CI=1 pnpm --filter @school/web exec playwright test --config e2e/playwright.visual-smoke.config.ts`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm test`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm type-check`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm lint`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm --filter @school/web build`
- Commits:
  - `e7c45635` — `docs(i18n): extend glossary with Spanish entries`
  - `9b265940` — `feat(i18n): add Spanish web locale`
  - `744b3652` — `feat(notifications): add Spanish catalogue`
  - `d2f72aa1` — `feat(pdf): enable Spanish rendering smoke path`
  - `ee1b93b3` — `test(i18n): stabilize Spanish contact visual smoke`
- CI / deploy:
  - Initial run `25111247639` reached deploy success but failed the visual job on the Spanish contact baseline height.
  - Follow-up run `25112138224` succeeded.
  - Deploy completed 2026-04-29 13:47 UTC.
- NHQS rollout:
  - Production update applied 2026-04-29 13:49 UTC.
  - Readback: `nhqs.supported_locales = {en,ar,fr,es}`.
- Production verification:
  - Public `/es/login` and `/es/contact` returned 200 with `html lang="es"` / `dir="ltr"` and no visible placeholder leaks.
  - NHQS owner login succeeded on `/es/login`; `/es/dashboard`, `/es/students`, `/es/finance`, and `/es/profile` rendered in Spanish with no visible placeholder leaks.
  - User-menu language picker showed `en`, `ar`, `fr`, and `es` for NHQS after the tenant flip.
  - API readback from `/api/v1/tenants/me` returned `supported_locales = ["en","ar","fr","es"]`.
- Notes:
  - `es` is active in the runtime registry but tenant availability remains gated by each tenant's `supported_locales`.
  - Spanish PDF rendering follows the same interim compatibility-localizer path as French; implementation 12.5 is expected to migrate these strings into first-class PDF message catalogues.
  - Two local full-suite pre-push attempts hit unrelated Jest worker SIGSEGVs in existing API suites; both affected specs passed directly with `--runInBand`, and the final GitHub Actions run completed green.

---

### 09 — German (`de`)

- **Spec:** `implementations/09-german.md`
- **Status:** 🟢 Complete & deployed
- **Model:** GPT-5.5 / High effort
- **Depends on:** 08 complete
- **Began:** 2026-04-30
- **Completed:** 2026-04-30

**Scope summary:**

- Extend `New Languages/glossary.md` with standard German / Hochdeutsch terms.
- Translate `en.json` → `de.json` (full active web catalogue; formal `Sie`, gender-neutral colon forms where appropriate).
- Translate notification catalogue entries into `notifications.de.json`.
- Enable German PDF rendering through the current locale-template architecture with German label/date/status localization.
- Flip `de.active = true` in registry.
- Add `de-ltr` + `de-mobile` Playwright projects plus German public visual/leak smoke baselines.
- Enable for NHQS via an idempotent `supported_locales` append.

### Acceptance

- [x] Translation parity 100% against `en.json`
- [x] `pnpm i18n:check` passes with active locales `en`, `ar`, `fr`, `de`, `es`
- [x] Public `[de]` login/contact visual + visible-text leak smoke passes
- [x] Notification dispatch and catalogue fallback tests pass
- [x] PDF German smoke path passes
- [x] Full local lint + type-check + regression tests pass
- [x] Production web build passes
- [x] Public en + ar + fr + de + es visual smoke remains clean
- [x] NHQS-only `supported_locales` includes `de`
- [x] CI green; production deploy successful
- [x] German overflow ledger recorded

### Commits / CI / Deploy / Playwright / NHQS rollout / Notes

- Local verification passed 2026-04-30:
  - JSON parse of `apps/web/messages/de.json` and `packages/shared/src/notifications/messages/notifications.de.json`
  - `pnpm --filter @school/web test -- translation-parity --runInBand`
  - `pnpm --filter @school/web test -- registry --runInBand`
  - `pnpm --filter @school/shared test -- notification-message-catalogue --runInBand`
  - `pnpm --filter @school/api test -- locale-template --runInBand`
  - `pnpm i18n:check`
  - `pnpm --filter @school/shared test -- locale-codes --runInBand`
  - `pnpm --filter @school/api test -- template-renderer.service notification-templates.service pdf-rendering.service --runInBand`
  - `pnpm --filter @school/worker test -- dispatch-notifications --runInBand`
  - `pnpm --filter @school/web exec playwright test --config e2e/playwright.visual-smoke.config.ts --update-snapshots`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm test`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm type-check`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm lint`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm --filter @school/web build`
  - `pnpm --filter @school/web exec playwright test --config e2e/playwright.visual-smoke.config.ts`
  - `git diff --check`
  - `pnpm exec prettier --check` on changed text files
- Commit:
  - `3714b576` — `feat(i18n): add German locale`
- CI / deploy:
  - Production run `25139894519` succeeded.
  - Deploy completed 2026-04-30 00:04 UTC.
- NHQS rollout:
  - Production update applied 2026-04-30 00:08 UTC.
  - Readback: `nhqs.supported_locales = {en,ar,fr,es,de}`.
- Production verification:
  - Public `/de/login` and `/de/contact` returned 200 at desktop and mobile widths with `html lang="de"` / `dir="ltr"` and no visible placeholder leaks.
  - NHQS owner login succeeded on `/de/login`; `/de/dashboard`, `/de/students`, `/de/finance`, and `/de/profile` rendered in German with no visible placeholder leaks.
  - User-menu language picker showed `en`, `ar`, `fr`, `de`, and `es` for NHQS after the tenant flip.
  - API readback from `/api/v1/tenants/me` returned `supported_locales = ["en","ar","fr","es","de"]`.
  - Sentry unresolved issue list was empty; no `MISSING_MESSAGE` events were present.
- German overflow ledger:
  - `0` unresolved German overflow issues.
  - No `New Languages/_evidence/de-overflow-issues.md` file was required or created.
- Notes:
  - `de` is active in the runtime registry but tenant availability remains gated by each tenant's `supported_locales`.
  - German PDF rendering follows the same interim compatibility-localizer path as French and Spanish; implementation 12.5 is expected to migrate these strings into first-class PDF message catalogues.

---

### 10 — Irish (`ga`)

- **Spec:** `implementations/10-irish.md`
- **Status:** 🟢 Complete & deployed
- **Model:** GPT-5.5 / **Max effort**
- **Depends on:** 09 complete (recommended last so glossary is well-developed)
- **Began:** 2026-04-30
- **Completed:** 2026-04-30

**Scope summary:**

- Extend `New Languages/glossary.md` with Irish / An Caighdeán Oifigiúil school terms.
- Translate `en.json` → `ga.json` (full active web catalogue; Standard Irish, placeholders and ICU syntax preserved).
- Translate notification catalogue entries into `notifications.ga.json`.
- Enable Irish PDF rendering through the current locale-template architecture with Irish label/date/status localization.
- Flip `ga.active = true` in registry.
- Add `ga-ltr` + `ga-mobile` Playwright projects plus Irish public visual/leak smoke baselines.
- Maintain `New Languages/_evidence/ga-review-queue.md` aggressively for native-speaker review.
- Enable for NHQS via an idempotent `supported_locales` append.

### Acceptance

- [x] Translation parity 100% against `en.json`
- [x] `pnpm i18n:check` passes with active locales `en`, `ar`, `fr`, `de`, `es`, `ga`
- [x] Public `[ga]` login/contact visual + visible-text leak smoke passes
- [x] Notification dispatch and catalogue fallback tests pass
- [x] PDF Irish smoke path passes
- [x] Full local lint + type-check + regression tests pass
- [x] Production web build passes
- [x] Public en + ar + fr + de + es + ga visual smoke remains clean
- [x] NHQS-only `supported_locales` includes `ga`
- [x] CI green; production deploy successful
- [x] Irish review queue recorded
- [x] Irish overflow ledger recorded

### Commits / CI / Deploy / Playwright / NHQS rollout / Notes

- Local verification passed 2026-04-30:
  - `pnpm --filter @school/web test -- translation-parity --runInBand`
  - `pnpm i18n:check`
  - `pnpm --filter @school/shared test -- notification-message-catalogue --runInBand`
  - `pnpm --filter @school/api test -- locale-template --runInBand`
  - `pnpm --filter @school/web test -- registry --runInBand`
  - `pnpm --filter @school/shared test -- locale-codes --runInBand`
  - `pnpm --filter @school/api test -- template-renderer.service notification-templates.service pdf-rendering.service --runInBand`
  - `pnpm --filter @school/worker test -- dispatch-notifications --runInBand`
  - `pnpm --filter @school/web exec playwright test --config e2e/playwright.visual-smoke.config.ts --update-snapshots`
  - `CI=1 pnpm --filter @school/web exec playwright test --config e2e/playwright.visual-smoke.config.ts --grep "@locale-leak ga"`
  - `CI=1 pnpm --filter @school/web exec playwright test --config e2e/playwright.visual-smoke.config.ts`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm test`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm type-check`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm lint`
  - `NODE_OPTIONS=--max-old-space-size=12288 pnpm build`
  - Placeholder/ICU/Handlebars parity sweep
  - `git diff --check`
  - `pnpm exec prettier --write` on changed files
  - Full pre-push hook passed before push.
- Commits:
  - `3d163629` — `feat(i18n): add Irish locale`
  - `ee376cb8` — `test(api): run invitations e2e serially`
- CI / deploy:
  - Production run `25142563592` succeeded.
  - Deploy completed 2026-04-30 01:38 UTC.
- NHQS rollout:
  - Production update applied 2026-04-30 01:45 UTC.
  - Readback: `nhqs.supported_locales = {en,ar,fr,es,de,ga}`.
- Production verification:
  - Public `/ga` redirected to `/ga/login`; `/ga/login` and `/ga/contact` rendered at desktop and mobile widths with `html lang="ga"` / `dir="ltr"` and no visible placeholder leaks.
  - NHQS owner login succeeded on `/ga/login`; `/ga/dashboard` and `/ga/profile` rendered in Irish at desktop and mobile widths with no visible placeholder leaks.
  - User-menu language picker showed `en`, `ar`, `ga`, `fr`, `de`, and `es` for NHQS after the tenant flip, including `gaGaeilge`.
  - API readback from `/api/v1/tenants/me` returned `supported_locales = ["en","ar","fr","es","de","ga"]`.
  - Sentry unresolved issue list was empty; no `MISSING_MESSAGE` events were present.
- Irish review queue:
  - `New Languages/_evidence/ga-review-queue.md`
  - `2800` queued strings for native Irish speaker review (`2696` web, `104` notification strings).
- Irish overflow ledger:
  - `0` unresolved Irish overflow issues.
  - No `New Languages/_evidence/ga-overflow-issues.md` file was required or created.
  - Visual inspection covered desktop/mobile Irish snapshots, including accented/precomposed characters (`É`, `Á`, `Í`, `Ó`, `Ú`); no Irish-specific overflow was found.
- Notes:
  - `ga` is active in the runtime registry but tenant availability remains gated by each tenant's `supported_locales`.
  - Irish PDF rendering follows the same interim compatibility-localizer path as French, Spanish, and German; implementation 12.5 is expected to migrate these strings into first-class PDF message catalogues.
  - The local pre-push hook initially exposed `test/invitations.e2e-spec.ts` as an integration collider under parallel execution; the same spec passed directly with `--runInBand`, then it was added to the serial collider group and the full pre-push hook passed.
  - Per feature-map maintenance rules, `docs/architecture/feature-map.md` should be updated by Ram or in a dedicated documentation pass rather than as part of this locale rollout.

---

## Phase 5 — Tier 2 Languages

> Recommended execution order: 11 (IT) → 12 (RO) → 12.5 (PDF catalogue architecture) → 13 (PL).
>
> Each Phase 5 implementation translates ONLY the `tier_2_namespaces` allowlist (parent + student surface). The route-level guard (introduced in 11) redirects out-of-scope paths to the tenant default locale.

### 11 — Italian (`it`)

- **Spec:** `implementations/11-italian.md`
- **Status:** 🟢 Complete & deployed
- **Model:** Sonnet 4.6 / Max effort
- **Depends on:** 10 complete
- **Began:** 2026-04-30
- **Completed:** 2026-04-30

**Scope summary:**

- Extend `New Languages/glossary.md` with Standard Italian parent/student-facing school terms, using formal `Lei` for parent-facing copy.
- Add `apps/web/messages/it.json` for the Tier 2 namespace allowlist only, with no staff/admin/finance/regulatory/back-office namespaces.
- Add Tier 2 route guard infrastructure so Italian routes are restricted to public, parent, and student surfaces; out-of-scope `/it/...` staff/admin/finance/regulatory/back-office routes redirect to the tenant default locale.
- Add Italian parent-relevant notification catalogue support.
- Add Italian parent-relevant PDF/current interim localizer support using the same compatibility path as 07/08/09/10, without implementing the 12.5 PDF architecture gate early.
- Flip `it.active = true` with `tier: 2` in the i18n registry.
- Add `it-ltr` + `it-mobile` Playwright/visual/leak coverage for public/parent/student surfaces, plus Tier 2 redirect coverage.
- Update `docs/architecture/danger-zones.md` with Tier 2 route-guard behaviour and risk.
- Enable for NHQS via an idempotent `supported_locales` append.

### Acceptance

- [x] Translation parity 100% against the Tier 2 namespace allowlist only
- [x] `it.json` contains no out-of-scope/back-office namespaces
- [x] `pnpm i18n:check` passes with active locales `en`, `ar`, `fr`, `de`, `es`, `ga`, `it`
- [x] Italian notification catalogue entries parse and render through the shared catalogue path
- [x] Italian parent-relevant PDF smoke/localizer path passes without introducing the 12.5 PDF catalogue architecture
- [x] Tier 2 route guard redirects out-of-scope `/it/...` routes to tenant default locale instead of rendering missing-message failures
- [x] Italian public/parent/student Playwright/visual/leak coverage added, including `it-ltr` and `it-mobile`
- [x] Full local lint + type-check + regression gates pass
- [x] Production web build passes
- [x] NHQS-only `supported_locales` includes `it`
- [x] CI green; production deploy successful
- [x] Production verification covers `/it` public flows, authenticated parent/student routes, locale picker, API readback, Tier 2 redirects, visible placeholder/key leaks, overflow, and Sentry

### Commits / CI / Deploy / Playwright / NHQS rollout / Notes

- Local verification passed 2026-04-30:
  - `pnpm --filter @school/web test -- translation-parity tier-scopes tier-routes user-menu --runInBand`
  - `pnpm i18n:check`
  - `pnpm --filter @school/web type-check`
  - `pnpm --filter @school/ui type-check`
  - `pnpm --filter @school/web lint:ci`
  - `pnpm --filter @school/ui lint` (existing warning-only UI hardcoded-string baseline remains)
  - `pnpm prettier --check` on changed files
  - `git diff --check`
  - Full pre-push validation hooks passed before each push.
- Commits:
  - `55cace17` — `feat(i18n): add Italian Tier 2 locale`
  - `574b5bc9` — `fix(i18n): localize Tier 2 user role labels`
  - `c7658aa7` — `test(api): keep prefixed RLS leakage specs serial`
  - `598e18e3` — `test(api): cap coverage workers`
  - `970b4498` — `test(api): keep gradebook e2e serial`
  - `89e31504` — `fix(i18n): suppress Italian Tier 2 shell leaks`
  - `cc6028ae` — `test(api): keep compliance household e2e serial`
  - `4af632cd` — `test(api): keep households e2e serial`
  - `83c26f9f` — `test(api): isolate foundational RLS leakage suite`
  - `75d4b04d` — `fix(i18n): cover Italian parent timetable`
  - `7153f9e8` — `fix(i18n): hide staff search on Tier 2 shells`
- CI / deploy:
  - Production run `25145595415` succeeded for `55cace17`; completed 2026-04-30 03:33 UTC.
  - Production run `25146864471` succeeded for `970b4498`; completed 2026-04-30 04:22 UTC.
  - Production run `25148305513` succeeded for `83c26f9f`; completed 2026-04-30 05:12 UTC.
  - Production run `25149007715` succeeded for `75d4b04d`; completed 2026-04-30 05:37 UTC.
  - Final code deploy run `25149686002` succeeded for `7153f9e8`; deploy completed 2026-04-30 06:00 UTC.
- NHQS rollout:
  - Production update applied with the idempotent append:
    `UPDATE tenants SET supported_locales = supported_locales || '{it}'::text[] WHERE slug = 'nhqs' AND NOT 'it' = ANY(supported_locales);`
  - Database readback: `nhqs|en|en, ar, fr, es, de, ga, it`.
  - Public API readback from `/api/v1/public/tenants/by-slug/nhqs` returned `supported_locales = ["en","ar","fr","es","de","ga","it"]`.
- Production verification:
  - Public `/it/login`, `/it/contact`, and `/it/apply/nhqs` rendered at desktop and mobile widths with `html lang="it"` / `dir="ltr"`.
  - NHQS parent routes `/it/dashboard/parent`, `/it/parent/household`, and `/it/homework/parent` rendered at desktop/mobile widths with Italian role label `Genitore`.
  - NHQS student routes `/it/dashboard/student`, `/it/dashboard/student/homework`, and `/it/dashboard/student/timetable` rendered at desktop/mobile widths with Italian role label `Studente`.
  - Locale picker exposed `Italiano` for authenticated NHQS parent/student users.
  - Visible leak checks passed: no `MISSING_MESSAGE`, `IntlError`, raw namespace keys, raw permission strings, unresolved ICU placeholders, or horizontal overflow.
  - Tier 2 shell search/back-office entry point is suppressed for Italian parent/student shells after `7153f9e8`.
  - Tier 2 redirects verified: `/it/finance/payroll` -> `/en/finance/payroll`; `/it/dashboard/teacher` -> `/en/dashboard/teacher`.
  - Sentry unresolved issue list was empty; no unresolved `MISSING_MESSAGE` events were present.
- Evidence:
  - `0` material Italian overflow issues.
  - No `New Languages/_evidence/it-overflow-issues.md` file was required or created.
  - No uncertain Italian string evidence file was required; glossary terms were applied directly.
- Notes:
  - `it` is active in the runtime registry as Tier 2, with tenant availability still gated by each tenant's `supported_locales`.
  - Italian PDF support follows the same interim compatibility-localizer path as French, Spanish, German, and Irish; implementation 12.5 remains the planned architecture gate for first-class PDF message catalogues.
  - Per feature-map maintenance rules, `docs/architecture/feature-map.md` should be updated by Ram or in a dedicated documentation pass rather than as part of this locale rollout.

---

### 12 — Romanian (`ro`)

- **Spec:** `implementations/12-romanian.md`
- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / High effort
- **Depends on:** 11 complete

**Scope summary:** Same shape as 11. Use comma-below diacritics (`ș`, `ț`), not cedilla. Use formal "dumneavoastră".

### Acceptance / Sections

- (populated during execution)

---

### 12.5 — PDF template message-catalogue extraction

- **Spec:** `(to author) implementations/12.5-pdf-message-catalogues.md`
- **Status:** ⚪ Pending
- **Model:** GPT-5.5 / Max effort
- **Depends on:** 12 complete
- **Blocks:** 13 and any further PDF locale work

**Scope summary:** Separate architectural pass to extract all 13 existing PDF template types into proper per-template message catalogues. Replace compatibility HTML post-processing, including the French regex localizer, with structured catalogue-backed rendering while preserving the current en/ar/fr output contract and keeping later locale additions catalogue-only.

### Acceptance / Sections

- [ ] All 13 PDF types use a shared locale-aware message-catalogue layer instead of regex HTML replacement.
- [ ] Catalogue files exist for every in-scope template and runtime PDF locale, using a predictable path such as `apps/api/src/modules/pdf-rendering/templates/messages/{type}.{locale}.json`.
- [ ] English and Arabic PDF output remains behaviourally equivalent to the pre-refactor templates, including Arabic RTL layout.
- [ ] French PDF output moves from compatibility localization to first-class catalogue-backed rendering.
- [ ] Missing catalogue keys fail hard in tests and render paths with a clear `MISSING_PDF_MESSAGE` error.
- [ ] Receipt, invoice, household statement, report card, report card modern, transcript, payslip, DES inspection, pastoral summary, SST activity, safeguarding compliance, wellbeing programme, and trip leader pack all have render-smoke coverage.
- [ ] Formatting helpers cover dates, numbers, currencies, localized school names, statuses, and common enum labels without template-specific string hacks.
- [ ] 80mm receipt layout and A4 report layouts are visually checked for overflow in LTR and RTL.
- [ ] Later language implementations can add or update PDF support by adding catalogue files, not by editing TypeScript templates.
- [ ] CI green; production deploy successful; production smoke verifies at least receipt + one A4 report in `en`, `ar`, and `fr`.

### Notes

- This pass intentionally does **not** roll out a new user-facing language. It is an architecture cleanup so 13 and any later PDF language work have a proper catalogue foundation.
- If 08–12 add interim compatibility localizers for new languages before this runs, migrate those strings into the new catalogue format and delete the interim paths.

---

### 13 — Polish (`pl`)

- **Spec:** `implementations/13-polish.md`
- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / **Max effort**
- **Depends on:** 12.5 complete

**Scope summary:** Same shape as 11/12, using the first-class PDF message-catalogue architecture from 12.5. Watch 7-case grammar, 3 genders, perfective/imperfective aspect. Maintain `pl-review-queue.md`.

### Acceptance / Sections

- (populated during execution)

---

## Phase 6 — Tenant rollout (rolling, operational)

Per locale, after NHQS QA passes:

| Locale       | Tenant          | Date enabled                 | Operator | Notes              |
| ------------ | --------------- | ---------------------------- | -------- | ------------------ |
| ga           | nhqs            | 2026-04-30                   | Codex    | Pilot tenant       |
| fr           | nhqs            | 2026-04-29                   | Codex    | Pilot tenant       |
| de           | nhqs            | 2026-04-30                   | Codex    | Pilot tenant       |
| es           | nhqs            | 2026-04-29                   | Codex    | Pilot tenant       |
| it           | nhqs            | (pending 11 completion)      | —        | Pilot tenant       |
| ro           | nhqs            | (pending 12 completion)      | —        | Pilot tenant       |
| pl           | nhqs            | (pending 13 completion)      | —        | Pilot tenant       |
| (per locale) | (other tenants) | (pending NHQS QA per locale) | —        | GA rollout post-QA |

---

## Summary metrics (live)

- **Total implementations planned:** 14 (excl. P0 + Phase 6 ops)
- **Implementations complete:** 10
- **Implementations in progress:** 0
- **Implementations pending:** 4
- **Implementations blocked:** 0
- **Languages live (NHQS):** en, ar, fr, es, de, ga
- **Languages live (other tenants):** en, ar
- **Translation parity status:** en ↔ ar ↔ fr ↔ de ↔ es ↔ ga active; remaining locales pending
- **Hard-error flag:** on
- **Visual suite in CI:** smoke + Arabic RTL regulatory coverage; full per-locale visual expansion begins in Phase 4

---

## Quick reference

### Commit message template

```
feat(i18n): <impl-id> <description>

- Phase: <phase number>
- Languages: <locale codes>
- Key count: <number>

Co-Authored-By: GPT-5.5 Codex <noreply@openai.com>
```

### Verification commands

```bash
# Translation parity (extended for N locales after 02)
pnpm --filter @school/web test -- translation-parity

# i18n key usage scanner
pnpm i18n:check

# Type-check + lint (mandatory before commit per CLAUDE.md)
turbo type-check
turbo lint

# Full regression
turbo test

# Playwright smoke (CI runs this)
pnpm --filter @school/web test:visual

# Playwright full visual (run locally + in CI per Phase 4 onwards)
pnpm --filter @school/web exec playwright test
```

### Per-tenant locale flip (production)

```bash
ssh root@46.62.244.139
sudo -u edupod psql edupod_prod
UPDATE tenants
SET supported_locales = supported_locales || '{<locale>}'::text[]
WHERE slug = '<tenant-slug>'
  AND NOT '<locale>' = ANY(supported_locales);
```

### Rollback (if a deployed locale regresses production)

```bash
# 1. Disable the locale for all tenants
UPDATE tenants
SET supported_locales = array_remove(supported_locales, '<locale>');

# 2. If hard-error is biting on existing locales: revert next-intl config
git revert <impl-02-commit-sha>
git push origin main

# 3. Watch CI deploy the revert; verify Sentry quiets
```

---

## Lessons learned

(Populated as implementations complete.)
