# Multi-Language Expansion — Implementation Log

**Project:** Add 4 Tier-1 (`ga`, `fr`, `de`, `es`) and 3 Tier-2 (`it`, `ro`, `pl`) languages to SDB.
**Strategy:** see `STRATEGY.md` in this folder.
**Specs:** see `implementations/01-…` through `implementations/13-…` in this folder.
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

> Implementations are numbered 1–13 (sequential at codebase level — only one runs at a time).
> Within Phase 4 and Phase 5, the _content_ is reorderable (FR ↔ ES ↔ DE ↔ GA, and IT ↔ RO ↔ PL). The numbering below reflects the **recommended execution order** (easiest → hardest within each tier).

| #   | Phase                 | Spec                                                         | Locale / Topic                             | Status         | Model      | Effort   |
| --- | --------------------- | ------------------------------------------------------------ | ------------------------------------------ | -------------- | ---------- | -------- |
| 01  | 1 — Foundation        | `implementations/01-schema-rls-locale-registry.md`           | Schema, RLS, locale registry               | ⚪ Pending     | Opus 4.7   | High     |
| 02  | 1 — Foundation        | `implementations/02-arabic-cleanup-hard-error-flip.md`       | Arabic cleanup + hard-error flip           | 🟡 In progress | Opus 4.7   | Max      |
| 03  | 1 — Foundation        | `implementations/03-tenant-gating-ui-language-picker.md`     | Tenant gating UI + language picker         | ⚪ Pending     | Opus 4.7   | Standard |
| 04  | 2 — Refactor          | `implementations/04-pdf-templates-locale-driven-refactor.md` | PDF templates: locale-driven refactor      | ⚪ Pending     | Opus 4.7   | Max      |
| 05  | 2 — Refactor          | `implementations/05-notification-template-refactor.md`       | NotificationTemplate refactor              | ⚪ Pending     | Opus 4.7   | High     |
| 06  | 3 — Dispatch          | `implementations/06-dual-language-household-dispatch.md`     | Dual-language household dispatch fanout    | ⚪ Pending     | Opus 4.7   | High     |
| 07  | 4 — Tier 1            | `implementations/07-french.md`                               | French (`fr`) full catalogue + Playwright  | ⚪ Pending     | Opus 4.7   | High     |
| 08  | 4 — Tier 1            | `implementations/08-spanish.md`                              | Spanish (`es`) full catalogue + Playwright | ⚪ Pending     | Opus 4.7   | High     |
| 09  | 4 — Tier 1            | `implementations/09-german.md`                               | German (`de`) full catalogue + Playwright  | ⚪ Pending     | Opus 4.7   | Max      |
| 10  | 4 — Tier 1            | `implementations/10-irish.md`                                | Irish (`ga`) full catalogue + Playwright   | ⚪ Pending     | Opus 4.7   | Max      |
| 11  | 5 — Tier 2            | `implementations/11-italian.md`                              | Italian (`it`) parent+student catalogue    | ⚪ Pending     | Sonnet 4.6 | Max      |
| 12  | 5 — Tier 2            | `implementations/12-romanian.md`                             | Romanian (`ro`) parent+student catalogue   | ⚪ Pending     | Opus 4.7   | High     |
| 13  | 5 — Tier 2            | `implementations/13-polish.md`                               | Polish (`pl`) parent+student catalogue     | ⚪ Pending     | Opus 4.7   | Max      |
| —   | 6 — Rollout (rolling) | (no spec; ops only)                                          | Per-tenant `supported_locales` flips       | ⚪ Pending     | n/a        | n/a      |

**Critical path:** 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → Phase 6 rollout

**Sequential at the codebase level** (no worktrees / no branches / no PRs). Only one implementation runs on the codebase at a time.

> **Legacy ID mapping** (for historical reference — the strategy still uses these in some places):
> 01=P1A · 02=P1B · 03=P1C · 04=P2A · 05=P2B · 06=P3 · 07=P4-FR · 08=P4-ES · 09=P4-DE · 10=P4-GA · 11=P5-IT · 12=P5-RO · 13=P5-PL.

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
- **Status:** 🟡 In progress
- **Model:** Opus 4.7 / High effort
- **Depends on:** P0 approved
- **Began:** 2026-04-28
- **Completed:** —

**Scope summary:**

- Migration `add_locale_expansion_columns`: `Tenant.supported_locales TEXT[]`, `Household.secondary_locale TEXT`, `Household.dual_language_opt_in BOOLEAN`. Backfill every existing tenant to `['en','ar']`. CHECK constraint `default_locale = ANY(supported_locales)`.
- New file `apps/web/i18n/registry.ts` — single source of truth for locale metadata (code, English name, native name, direction, tier, active flag).
- `apps/web/i18n/config.ts` — derive active `locales` array from registry.
- New file `apps/web/i18n/tier-scopes.ts` — `TIER_2_NAMESPACES` allowlist.
- Backend Zod schemas in `packages/shared/src/i18n/locale-codes.ts`.
- Tests: registry unit tests, allowlist subset test, RLS leakage tests for new Household columns and Tenant.supported_locales.

### Acceptance

- [ ] Migration applies cleanly to fresh DB
- [ ] Migration applies cleanly to NHQS prod snapshot
- [ ] Existing en + ar Playwright suite passes (no regression)
- [ ] CI green on main
- [ ] Production deploy successful
- [ ] Production verification: `SELECT supported_locales FROM tenants` shows `{en,ar}` for every row

### Commits / CI / Deploy / Playwright / Notes

- (pending)

---

### 02 — Arabic placeholder cleanup + hard-error flip

- **Spec:** `implementations/02-arabic-cleanup-hard-error-flip.md`
- **Status:** 🟡 In progress — local implementation and regression verification complete; commit, CI, production deploy, production Sentry observation pending.
- **Model:** Opus 4.7 / **Max effort**
- **Depends on:** 01 complete
- **Began:** 2026-04-29
- **Completed:** —

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
- [ ] Production deploy successful
- [ ] Sentry: zero `MISSING_MESSAGE` exceptions in 30 minutes post-deploy

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
- Commit / CI / deploy / production Sentry observation pending.

---

### 03 — Tenant gating UI + language picker refactor

- **Spec:** `implementations/03-tenant-gating-ui-language-picker.md`
- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / Standard
- **Depends on:** 02 complete

**Scope summary:**

- `apps/web/src/components/locale-picker.tsx`: dynamic dropdown sourced from `tenant.supported_locales`.
- Replace binary EN/AR toggle in `user-menu.tsx` and profile page.
- Backend `PATCH /v1/admin/tenants/:id/supported-locales` with platform-admin permission and safety checks (block removing default; block removing locale users prefer).
- Platform-admin frontend in `(platform)/admin/tenants/[id]/locales`.
- Validation: every locale-related write checks the value is in `tenant.supported_locales`.

### Acceptance

- [ ] Picker dynamic + tenant-gated
- [ ] Profile selector enforces same filter
- [ ] Platform admin can flip `supported_locales` per tenant via UI
- [ ] CI green; production deploy successful
- [ ] Playwright: NHQS user sees en + ar only

### Commits / CI / Deploy / Playwright / Notes

- (pending)

---

## Phase 2 — Template Refactor

### 04 — PDF templates: locale-driven refactor

- **Spec:** `implementations/04-pdf-templates-locale-driven-refactor.md`
- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / **Max effort**
- **Depends on:** 03 complete

**Scope summary:**

- Refactor 13 PDF template types from file pair (`*-en.template.ts` + `*-ar.template.ts`) to a single locale-driven template per type.
- Extract strings to `messages/{type}.{locale}.json` (en + ar populated by porting from current file pairs).
- New Handlebars helpers: `t`, `formatDate`, `formatCurrency`, `formatNumber`, `getLocalizedSchoolName`.
- Pre-refactor PDF baselines committed; pixel-diff regression test enforces ≤1% threshold; blocks merge on regression.
- 13 PDF types: receipt, invoice, household-statement, report-card, report-card-modern, transcript, payslip, des-inspection, pastoral-summary, sst-activity, safeguarding-compliance, wellbeing-programme, trip-leader-pack.

### Acceptance

- [ ] All 13 types render in en + ar identically pre/post (≤1% pixel diff)
- [ ] New Handlebars helpers added with unit tests
- [ ] PDF regression test added to CI hard gate
- [ ] Production deploy successful
- [ ] Manual verification: receipt + report card on NHQS visually identical

### Commits / CI / Deploy / Playwright / Notes

- (pending)

---

### 05 — NotificationTemplate refactor

- **Spec:** `implementations/05-notification-template-refactor.md`
- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / High effort
- **Depends on:** 04 complete

**Scope summary:**

- Migrate system `notification_templates` rows to reference message-catalogue keys via `t:` prefix.
- Tenant-specific override rows untouched (raw Handlebars).
- New file `apps/api/src/modules/notifications/template-renderer.ts` with hard-error policy on missing key.
- Update `dispatch-notifications.processor.ts` to use renderer.
- Resend / Twilio / WhatsApp adapters pass locale through.

### Acceptance

- [ ] All system rows reference `t:` keys
- [ ] Tenant override rows untouched
- [ ] `notifications.{en,ar}.json` exist and parse
- [ ] Renderer unit + integration tested
- [ ] Production deploy successful
- [ ] Real `payment.received` on NHQS renders correctly in en + ar

### Commits / CI / Deploy / Playwright / Notes

- (pending)

---

## Phase 3 — Dual-Language Dispatch

### 06 — Dual-language household dispatch fanout

- **Spec:** `implementations/06-dual-language-household-dispatch.md`
- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / High effort
- **Depends on:** 05 complete

**Scope summary:**

- Household profile UI: `secondary_locale` dropdown + `dual_language_opt_in` toggle (`PATCH /v1/households/:id/locale-preferences`).
- New service `fanoutNotification(notification, household)` in worker with truth-table semantics.
- Idempotency keys suffixed per locale.
- Audit log entries for both dispatches when fanout fires.
- Integration test: real dispatch produces exactly two rows when opt-in fires.

### Acceptance

- [ ] Household opt-in UI functional
- [ ] Fanout correct in all four permutations
- [ ] Idempotency: no duplicate emit on retry
- [ ] Audit log shows both entries with locale tags
- [ ] Production deploy successful
- [ ] Live verification on NHQS: dual-language opt-in produces two notifications

### Commits / CI / Deploy / Playwright / Notes

- (pending)

---

## Phase 4 — Tier 1 Languages

> Recommended execution order: 07 (FR) → 08 (ES) → 09 (DE) → 10 (GA). Easiest → hardest. User may reorder; only the codebase-sequential rule is hard.

### 07 — French (`fr`)

- **Spec:** `implementations/07-french.md`
- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / High effort
- **Depends on:** 06 complete
- **Began:** —
- **Completed:** —

**Scope summary:**

- Translate `en.json` → `fr.json` (full catalogue, all 118 namespaces).
- Translate `notifications.en.json` → `notifications.fr.json`.
- Translate all 13 PDF type catalogues `messages/{type}.fr.json`.
- Flip `fr.active = true` in registry.
- Add `fr-ltr` + `fr-mobile` Playwright projects + commit baselines.
- Enable for NHQS via `UPDATE tenants SET supported_locales = supported_locales || '{fr}'::text[] WHERE slug = 'nhqs'`.

### Acceptance

- [ ] Translation parity 100% against `en.json`
- [ ] No `MISSING_MESSAGE` warnings on any route in `[fr]/`
- [ ] Smoke + leak + visual + dispatch + PDF tests pass
- [ ] en + ar visual regression: clean
- [ ] NHQS-only `supported_locales` includes `fr`
- [ ] CI green; production deploy successful

### Commits / CI / Deploy / Playwright / NHQS rollout / Notes

- (pending)

---

### 08 — Spanish (`es`)

- **Spec:** `implementations/08-spanish.md`
- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / High effort
- **Depends on:** 07 complete

**Scope summary:** Same shape as 07-FR. Use neutral Spanish (tuteo, no voseo). Watch UI overflow (~115% length).

### Acceptance / Sections

- (populated during execution; mirror 07 structure)

---

### 09 — German (`de`)

- **Spec:** `implementations/09-german.md`
- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / **Max effort**
- **Depends on:** 08 complete

**Scope summary:** Same shape as 07/08. Compound nouns + UI overflow are the #1 risk. Use formal "Sie", capitalise nouns.

### Acceptance / Sections

- (populated during execution)

---

### 10 — Irish (`ga`)

- **Spec:** `implementations/10-irish.md`
- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / **Max effort**
- **Depends on:** 09 complete (recommended last so glossary is well-developed)

**Scope summary:** Same shape as 07/08/09. Smaller AI training corpus + irregular grammar = highest QA risk in Tier 1. Maintain `ga-review-queue.md` for post-launch native-speaker QA.

### Acceptance / Sections

- (populated during execution)

---

## Phase 5 — Tier 2 Languages

> Recommended execution order: 11 (IT) → 12 (RO) → 13 (PL).
>
> Each Phase 5 implementation translates ONLY the `tier_2_namespaces` allowlist (parent + student surface). The route-level guard (introduced in 11) redirects out-of-scope paths to the tenant default locale.

### 11 — Italian (`it`)

- **Spec:** `implementations/11-italian.md`
- **Status:** ⚪ Pending
- **Model:** Sonnet 4.6 / Max effort
- **Depends on:** 10 complete

**Scope summary:** Translate `en.json` → `it.json` for the Tier 2 allowlist subset only. Translate parent-relevant PDF templates only (receipt, invoice, household-statement, report-card). Add Tier 2 route guard. Add `it-ltr` + `it-mobile` Playwright projects (parent+student). Enable for NHQS.

### Acceptance / Sections

- (populated during execution)

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

### 13 — Polish (`pl`)

- **Spec:** `implementations/13-polish.md`
- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / **Max effort**
- **Depends on:** 12 complete

**Scope summary:** Same shape as 11/12. Watch 7-case grammar, 3 genders, perfective/imperfective aspect. Maintain `pl-review-queue.md`.

### Acceptance / Sections

- (populated during execution)

---

## Phase 6 — Tenant rollout (rolling, operational)

Per locale, after NHQS QA passes:

| Locale       | Tenant          | Date enabled                 | Operator | Notes              |
| ------------ | --------------- | ---------------------------- | -------- | ------------------ |
| ga           | nhqs            | (pending 10 completion)      | —        | Pilot tenant       |
| fr           | nhqs            | (pending 07 completion)      | —        | Pilot tenant       |
| de           | nhqs            | (pending 09 completion)      | —        | Pilot tenant       |
| es           | nhqs            | (pending 08 completion)      | —        | Pilot tenant       |
| it           | nhqs            | (pending 11 completion)      | —        | Pilot tenant       |
| ro           | nhqs            | (pending 12 completion)      | —        | Pilot tenant       |
| pl           | nhqs            | (pending 13 completion)      | —        | Pilot tenant       |
| (per locale) | (other tenants) | (pending NHQS QA per locale) | —        | GA rollout post-QA |

---

## Summary metrics (live)

- **Total implementations planned:** 13 (excl. P0 + Phase 6 ops)
- **Implementations complete:** 0
- **Implementations in progress:** 0
- **Implementations pending:** 13
- **Implementations blocked:** 0
- **Languages live (NHQS):** en, ar
- **Languages live (other tenants):** en, ar
- **Translation parity status:** en ↔ ar (existing); other locales not yet active
- **Hard-error flag:** off (will flip in 02)
- **Visual suite in CI:** smoke only (will expand to full in Phase 4)

---

## Quick reference

### Commit message template

```
feat(i18n): <impl-id> <description>

- Phase: <phase number>
- Languages: <locale codes>
- Key count: <number>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
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
