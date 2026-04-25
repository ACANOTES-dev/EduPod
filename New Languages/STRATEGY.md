# Multi-Language Expansion — Strategy

**Last updated:** 2026-04-25
**Status:** Spec under review (Phase 0)
**Owner:** info@acanotes.com
**Operating model:** Claude Opus 4.7 (1M context); Sonnet 4.6 acceptable for low-risk language sessions

---

## 1. Mission

Expand SDB from **English + Arabic** (the current state) to:

- **Tier 1 — Full native support (4 new languages):** Irish (`ga`), French (`fr`), German (`de`), Spanish (`es`). Total fully-supported set after rollout: **English, Arabic, Irish, French, German, Spanish (6 languages)**.
- **Tier 2 — Parent + student surface only (3 starter languages, expandable):** Italian (`it`), Romanian (`ro`), Polish (`pl`). Strict scope: parent portal, student portal, auth flows, public pages, and parent-relevant notifications/emails/SMS/WhatsApp/PDFs. Staff portal, settings, finance back-office, regulatory, payroll, HR are explicitly **not** translated for Tier 2.
- **Dual-language household communications:** households opt-in to receive every parent communication in **both** the school's default language **and** their household secondary language. Default-language version always sent and is the canonical source of truth for any discrepancy.

> **Note on Italian:** During brainstorming, the user's confirmed Tier 1 list was Irish, French, German, Spanish (4 languages). Italian was in the original wishlist but not explicitly in the Tier 1 confirmation. It is placed in Tier 2 here. Promotion to Tier 1 is a one-line config change if desired.

---

## 2. Working Constraints (Non-Negotiable)

These constraints come directly from the user and override defaults from `superpowers:writing-plans` or `superpowers:using-git-worktrees`:

| Constraint                                           | Detail                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No worktrees, no branches, no PRs**                | All work happens directly on `main`                                                                                                                                                                                                    |
| **Strictly one session at a time**                   | Sessions are sequential at the codebase level. A new session may begin only after the previous one is **fully deployed and Playwright-verified**                                                                                       |
| **Definition of "done"**                             | Local pass → `git commit` → `git push` to `main` → CI green → production deploy successful → Playwright verification on the deployed app passes → IMPLEMENTATION_LOG.md updated with commit SHA + deploy timestamp + Playwright result |
| **English + Arabic message files are sacred**        | `apps/web/messages/en.json` and `apps/web/messages/ar.json` are canonical references. They must never be corrupted. New locales replicate the **shape** of `en.json`                                                                   |
| **Hard-error on missing keys**                       | `next-intl` configured to throw on missing keys. Translation parity test is a **CI hard gate**. No English fallback in production                                                                                                      |
| **NHQS pilot, then GA**                              | New locales are enabled only for the NHQS tenant during build. After human QA passes, locale is enabled for additional tenants via `Tenant.supported_locales`                                                                          |
| **Arabic placeholder cleanup is part of Phase 1**    | Existing `[AR] …` placeholder strings (regulatory namespace) must be 100% cleaned **before** the hard-error flag flips, otherwise existing AR users break                                                                              |
| **AI does the translation; humans QA in production** | Agent generates 80% of translations using Opus 4.7 max effort. Native-speaker reviewers flag inaccuracies as bug-log items post-launch; agent fixes in subsequent micro-sessions                                                       |

---

## 3. Tier Scope Definitions

### 3.1 Tier 1 — Full native support

**Surface:** the entire app — all 442+ pages, all 14 PDF template types, all 13+ notification template types, all marketing/auth/public pages, settings, finance back-office, payroll, HR, regulatory, scheduler, etc.

**Languages:** Irish (`ga`), French (`fr`), German (`de`), Spanish (`es`).

**Translation volume per language:** ~17,500 keys × 118 namespaces (current `en.json` shape).

**Quality bar:** translation parity 100%, zero `MISSING_MESSAGE` warnings on any page, native reviewer-approved (post-launch).

### 3.2 Tier 2 — Parent + student surface

**Surface (translated):**

- Parent portal pages (children's attendance, grades, behaviour, reports, fees, invoices, inbox, notifications)
- Student portal pages (anything a logged-in student sees)
- Auth flows (login, password reset, MFA, school selection, register)
- Public pages (landing, contact, online admissions application, verification flows)
- Self-service forms (consent, appeals, household info edit, profile)
- All notification templates parents/students receive (in-app, email, SMS, WhatsApp)
- Parent-relevant PDF templates: receipt, invoice, household statement, report card

**Surface (NOT translated):**

- Staff portal, teacher portal, admin portal, platform admin
- Settings, regulatory, compliance, safeguarding admin, payroll, HR, leave management
- Finance back-office (reconciliation, scholarships, refunds workflows for staff)
- Reports authoring, behaviour incident logging (staff side), scheduler, gradebook authoring

**Languages:** Italian (`it`), Romanian (`ro`), Polish (`pl`). Expandable.

**Translation volume per language:** ~5,000 keys (estimated 25-30% of `en.json`, exact subset to be cataloged in Phase 1 deliverable).

**Quality bar:** translation parity 100% **for the in-scope namespaces**, zero `MISSING_MESSAGE` on parent + student pages. A `tier_2_namespaces` allowlist, defined once in Phase 1, governs which namespaces the parity test enforces per Tier 2 locale.

### 3.3 Dual-language household communications

**Schema additions to `Household`:**

- `secondary_locale TEXT NULL` — locale code; null = no secondary
- `dual_language_opt_in BOOLEAN NOT NULL DEFAULT false`

**Dispatcher behaviour:**

- For every parent-bound notification, the `NotificationDispatcher.fanout(notification, household)` service decides:
  - If `dual_language_opt_in === true` AND `secondary_locale IS NOT NULL` AND `secondary_locale !== resolved_default_locale` → emit **two** notification rows (default first, secondary second)
  - Otherwise → emit one notification row (default-language only)
- Idempotency keys are suffixed with the locale code so the second notification doesn't get deduped against the first
- Default-language version is always sent first (audit trail preserves ordering)
- The default-language version is canonical: any discrepancy with the secondary translation defers to the default

---

## 4. Architectural Pillars

### 4.1 Schema-first foundation

- `Tenant.supported_locales TEXT[] NOT NULL DEFAULT ARRAY['en']::TEXT[]` — array of locale codes the tenant has enabled
- `Tenant.default_locale` already exists; add CHECK constraint that `default_locale = ANY(supported_locales)`
- `Household.secondary_locale TEXT NULL`
- `Household.dual_language_opt_in BOOLEAN NOT NULL DEFAULT false`
- New migration follows `YYYYMMDDHHMMSS_add_locale_expansion_columns` naming
- RLS policies updated for `Household` if the new columns interact with existing policies (they shouldn't — they're columns, not new tables)
- **Backfill rule (single, simple):** every existing tenant gets `supported_locales = ['en', 'ar']` regardless of `default_locale`. Rationale: every existing tenant could already serve both languages, so this preserves the status quo. The platform admin can later trim a tenant's array (e.g., remove `'ar'`) via the Phase 1C admin UI

### 4.2 Locale-driven templates (refactor away from file pairs)

**Today:** PDF templates are file pairs (`receipt-en.template.ts` + `receipt-ar.template.ts`, 14 types × 2 = 28 files; would become 84 if naively duplicated for 6 locales).

**Refactor target:** 14 universal templates that consume strings from message files via Handlebars helpers:

- `formatDate(date, locale)` — uses `Intl.DateTimeFormat` with `fmtLocale(locale)` (preserves the Western-numerals + Gregorian-calendar policy)
- `formatCurrency(amount, locale, currency)` — uses `Intl.NumberFormat`
- `formatNumber(value, locale)`
- `t(key, locale)` — Handlebars helper that resolves a string from the message catalogue (loaded server-side at template render time)
- `getLocalizedSchoolName(tenant, locale)` — generalises the existing `school_name_ar` pattern

**Critical safety constraint:** the en + ar PDFs produced after refactor must be **byte-identical or visually identical** to the en + ar PDFs produced before refactor. Phase 2 includes a regression test that renders representative en + ar PDFs before and after, asserts pixel-equality (or below a 1% diff threshold), and blocks merge if regressed.

**Notification template refactor:** today the `NotificationTemplate` table has one row per `template_key + channel + locale`. Tenant-specific overrides remain DB rows (tenants customise content). System defaults are migrated to **message-catalogue-backed** templates: a system row references `t:notification.invoice_issued.subject` instead of hard-coding the string. The dispatcher resolves the i18n key at render time. This eliminates the 13 × N-locales × 4-channels combinatorial explosion for system templates.

### 4.3 Hard-error & parity enforcement

- `apps/web/i18n/request.ts` configured with an `onError` that throws (development) or routes to Sentry + throws (production)
- `apps/web/src/__tests__/translation-parity.spec.ts` extended to:
  - Loop over **all** locales in `apps/web/i18n/config.ts`
  - For Tier 1 locales, require 100% structural match against `en.json`
  - For Tier 2 locales, require 100% match against the **Tier 2 namespace allowlist** subset of `en.json`
  - Block CI on any deviation
- `scripts/check-i18n.js` extended to validate all locales (it already supports this; just needs new locales added to its scan list)
- Pre-flight: Phase 1 includes the Arabic placeholder cleanup as Session 1B (see §5.2). Hard-error flag flips only after AR is 100%.

### 4.4 Tenant gating

- **Two-layer model:**
  - **Active locales** (`apps/web/i18n/config.ts` → `locales` array): the platform-wide list of locales that have message files and are runtime-loadable. Initially `['en', 'ar']`. Each Phase 4/5 session adds its locale here once translations are 100% complete.
  - **Supported locales** (`Tenant.supported_locales`): per-tenant subset of the active list. Each entry must exist in active locales (validated). NHQS gets new locales added here first; other tenants follow after QA.
- The locale registry (`apps/web/i18n/registry.ts`, new in P1A) holds metadata for all locales — both active and not-yet-active — so the admin UI can display all locales but only **active** locales are selectable for `supported_locales`
- Frontend language picker (in `apps/web/src/components/user-menu.tsx`) shows the intersection of: active locales × tenant's `supported_locales`
- Profile page locale selector applies the same filter
- Backend validates: any locale-related operation (e.g., setting `User.preferred_locale`, `Household.secondary_locale`) checks the value is within `tenant.supported_locales`
- Rollout workflow: locale ships to NHQS only (`UPDATE tenants SET supported_locales = supported_locales || '{fr}'::text[] WHERE slug = 'nhqs'`) → human QA → flip for additional tenants tenant-by-tenant or all at once

### 4.5 AI-driven translation, namespace-batched

- Each Tier 1 / Tier 2 language session orchestrates sub-agents to translate batches of namespaces
- Translation prompt includes:
  - The current `en.json` source-of-truth strings for the namespace
  - Cross-references to existing `ar.json` for the same namespace (for tone calibration on context that's school-specific)
  - Glossary of school-management domain terms (built up Phase 1, shared across all language sessions)
  - Instructions to preserve `{placeholder}` syntax exactly, preserve casing, preserve emphasis (markdown / `**bold**`), and translate idiomatically rather than literally
- Sub-agents return JSON; primary agent merges, runs parity test, deploys

---

## 5. Phase Structure

### Phase overview

| Phase                         | Sessions             | Sequence                                                                                | Outcome                                                                                                                |
| ----------------------------- | -------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **0. Spec & Strategy**        | 1 (this doc)         | —                                                                                       | STRATEGY.md + IMPLEMENTATION_LOG.md committed                                                                          |
| **1. Foundation**             | 3                    | Strict sequential                                                                       | Schema + RLS, AR cleanup, hard-error flip, language-picker UI, tenant gate enforcement                                 |
| **2. Template Refactor**      | 2                    | Strict sequential, after Phase 1                                                        | PDF templates locale-driven; NotificationTemplate seeding refactored. EN + AR outputs verified byte/visually identical |
| **3. Dual-Language Dispatch** | 1                    | Strict sequential, after Phase 2                                                        | Household opt-in UI; dispatcher fanout; integration tests                                                              |
| **4. Tier 1 Languages**       | 4 (one per language) | **Sequential at codebase level**, but **independent in content** — order is reorderable | Irish, French, German, Spanish: full message catalogue, NHQS-enabled                                                   |
| **5. Tier 2 Languages**       | 3                    | Sequential at codebase level, independent in content                                    | Italian, Romanian, Polish: in-scope namespaces, NHQS-enabled                                                           |
| **6. Tenant Rollout**         | rolling, ad-hoc      | After NHQS QA per locale                                                                | Per-tenant `supported_locales` flips                                                                                   |

**Total implementation sessions: 13** (excluding Phase 0 spec and rolling Phase 6 ops work).

### 5.1 Phase 0 — Spec & Strategy (current session)

**Output:**

- This document (`STRATEGY.md`)
- `IMPLEMENTATION_LOG.md` — session tracker with all 13 implementation sessions enumerated, status `Pending`
- Recommended slash command (`/NL <session-id>`) similar to existing `/SW`, `/BH`, `/WBR` patterns — created via the `superpowers:writing-plans` skill in the next conversational turn

**Verification:** user reads + approves both files.

### 5.2 Phase 1 — Foundation (sessions P1A, P1B, P1C)

#### Session P1A — Schema, RLS, locale infrastructure

**Model:** Opus 4.7 / **High effort**
**Scope:**

- Migration: `add_locale_expansion_columns` — `Tenant.supported_locales TEXT[]`, `Household.secondary_locale TEXT`, `Household.dual_language_opt_in BOOLEAN`. Backfill `Tenant.supported_locales` from `default_locale`.
- CHECK constraint: `default_locale = ANY(supported_locales)`
- `apps/web/i18n/config.ts` — change `locales` to be derived from a single `LANGUAGES` registry that includes metadata (code, English name, native name, direction, tier). Add `ga`, `fr`, `de`, `es`, `it`, `ro`, `pl` to the registry but do NOT add them to the active `locales` list yet (they're registered metadata-only until Phase 4/5)
- Build the `tier_2_namespaces` allowlist (catalogue which namespaces the parent + student surface uses) as a constant in `apps/web/i18n/tier-scopes.ts`
- Backend: Zod schemas for new locale operations (`supported_locales`, `secondary_locale`, `dual_language_opt_in`)
- Tests: Jest unit tests for the registry, the allowlist, and the schema. RLS leakage test for new `Household` columns (Tenant A vs Tenant B isolation)
  **Acceptance:** migration applies cleanly to a fresh DB and to a snapshot of NHQS prod; all tests pass; CI green on `main`; deployment succeeds; existing en + ar functionality unchanged in Playwright verification.

#### Session P1B — Arabic placeholder cleanup + hard-error flip

**Model:** Opus 4.7 / **Max effort** (delicate, must not regress AR users)
**Scope:**

- Audit `apps/web/messages/ar.json` for any `[AR] …` placeholder strings (regulatory namespace especially); replace with proper Arabic translations
- Run translation-parity test until 100% pass for `en` ↔ `ar`
- Flip `next-intl` `getRequestConfig` to `onError: throw` (or a dev-vs-prod aware error throw)
- Extend translation-parity test to support N locales (currently hard-coded to en/ar)
- Extend `scripts/check-i18n.js` to scan all registered locales
- Update CI workflow to run parity test on every PR
  **Acceptance:** AR is 100% complete; hard-error flips on; all existing pages work in en + ar; CI parity gate active; deployed and verified.

#### Session P1C — Tenant gating UI + language picker refactor

**Model:** Opus 4.7 / Standard
**Scope:**

- `apps/web/src/components/user-menu.tsx` — replace the binary `EN ↔ AR` toggle with a dynamic dropdown sourced from `tenant.supported_locales`. Show language native names from the registry
- Profile page locale selector — same filter
- Backend: `Tenant.supported_locales` admin endpoint (platform admin only) for flipping locales per-tenant
- Frontend admin UI for super-admin to flip `supported_locales` per tenant (lives in `(platform)` route group)
- Tests: Playwright journey — login as NHQS user, open profile, only see en + ar (since no T1 locales are enabled yet); platform admin enables `fr` for NHQS, NHQS user reloads, sees en + ar + fr in dropdown but `fr` still has no translations so they can't actually switch (this is fine — Phase 4 fills the catalogue)
  **Acceptance:** picker dynamic; tenant gate enforced; admin UI works; deployed; Playwright pass.

### 5.3 Phase 2 — Template Refactor (sessions P2A, P2B)

#### Session P2A — PDF templates: file-pair refactor to locale-driven

**Model:** Opus 4.7 / **Max effort** (architectural; must not corrupt en/ar PDFs)
**Scope:**

- For each of the 14 PDF template types in `apps/api/src/modules/pdf-rendering/templates/`:
  - Merge `*-en.template.ts` and `*-ar.template.ts` into a single `*.template.ts`
  - Extract all string content to a new `pdf-templates.{locale}.json` message catalogue per locale (Phase 1 created the en + ar catalogues by porting from the file pairs)
  - Replace string literals in templates with `{{t 'key.path'}}` Handlebars calls
  - Replace `school_name_ar` references with `{{getLocalizedSchoolName tenant locale}}`
  - Replace inline `toLocaleString('ar-u-nu-latn-ca-gregory')` with `{{formatDate date locale}}`
- New Handlebars helpers: `formatDate`, `formatCurrency`, `formatNumber`, `t`, `getLocalizedSchoolName`
- **Regression test:** parallel render — render every PDF type for both en and ar, both pre-refactor and post-refactor. Pixel-diff with 1% threshold. Block merge if any PDF regresses
  **Acceptance:** all 14 types render identically pre/post in en + ar; new tests added to CI; deployed; verified in production by generating a sample receipt and payslip and inspecting them.

#### Session P2B — NotificationTemplate refactor + email/SMS/WhatsApp helpers

**Model:** Opus 4.7 / High effort
**Scope:**

- Migrate system `NotificationTemplate` rows to reference message-catalogue keys (e.g., `subject_template = 't:notification.invoice_issued.subject'`)
- Update `dispatch-notifications.processor.ts` to resolve `t:` references against the message catalogue at render time
- Tenant-specific override rows continue to work as before (raw Handlebars strings)
- Add migration for the system rows; tenant rows untouched
- Update Resend/Twilio provider integration to pass locale to the renderer
- Tests: dispatch a `payment.received` notification in en + ar, verify rendered output matches today's behaviour; dispatch in `fr` (using a temporary en-translated stub), verify renderer doesn't throw on missing key (because Phase 1 has hard-error on, this means the Phase 4 language sessions must populate notification keys)
  **Acceptance:** all existing notification flows still work in en + ar; new infrastructure ready for Phase 4 to add new-locale strings; deployed; verified by triggering a real notification on NHQS and checking the rendered output.

### 5.4 Phase 3 — Dual-language dispatch (session P3)

**Model:** Opus 4.7 / High effort
**Scope:**

- Household profile UI: add controls for `secondary_locale` (dropdown of `tenant.supported_locales`) and `dual_language_opt_in` (toggle)
- `NotificationDispatcher.fanout(notification, household)` service: implements the two-emit rule from §3.3
- Idempotency key suffixing per locale
- Audit log entry for both dispatched notifications
- Tests:
  - Unit: `fanout()` with `opt_in=false` → 1 notification; `opt_in=true` + `secondary=null` → 1; `opt_in=true` + `secondary='fr'` + `default='en'` → 2; `opt_in=true` + `secondary='en'` + `default='en'` → 1 (no-op)
  - Integration: trigger a `payment.received` for a household with `opt_in=true` + `secondary='fr'`, assert two emails sent (one en, one fr) — but since `fr` is not yet populated, this test uses a stubbed locale or the en stub from Phase 2. Phase 4 enables real cross-locale dispatch
- Playwright: parent logs in, navigates to household settings, toggles dual-language, picks secondary, saves; verifies persistence
  **Acceptance:** household opt-in UI lives; dispatch fanout works; tests green; deployed; verified on NHQS.

### 5.5 Phase 4 — Tier 1 Languages (sessions P4-GA, P4-FR, P4-DE, P4-ES)

Each session has the **same shape**:

1. **Pre-flight:** previous session is fully deployed and Playwright-verified (see Per-Session Protocol §6)
2. **Generate:** orchestrator agent dispatches sub-agents to translate `en.json` namespaces in batches of 10-15. Sub-agent prompt includes the en strings, the ar strings (for tone reference), the glossary, and instructions on placeholder preservation
3. **Merge & validate:** assemble `messages/{locale}.json`; run translation parity test until 100% pass
4. **Notification + PDF catalogues:** generate `pdf-templates.{locale}.json` and the new-locale notification keys
5. **Add to active locales:** add the locale code to `apps/web/i18n/config.ts` active locales array
6. **Enable for NHQS:** `UPDATE tenants SET supported_locales = supported_locales || '{<new>}'::text[] WHERE slug = 'nhqs'` (run on the deploy server post-deploy)
7. **Deploy:** commit, push, CI, deploy
8. **Verify (Playwright):** the deploying session is responsible for running the full Playwright verification on the deployed app — all routes in `[<new>]` segment, plus visual regression on en + ar to confirm no regression. See §7 for the verification spec
9. **Log:** append complete entry to IMPLEMENTATION_LOG.md with commit SHA, deploy timestamp, Playwright pass

**Per-language model recommendations:**

| Session | Language        | Model    | Effort  | Rationale                                                                                                              |
| ------- | --------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| P4-GA   | Irish (Gaeilge) | Opus 4.7 | **Max** | Smaller training corpus; irregular grammar; school-domain terminology often borrowed from English. Hardest of the four |
| P4-FR   | French          | Opus 4.7 | High    | Well-supported language; school terminology mature in FR. Watch UI overflow (10-30% length increase)                   |
| P4-DE   | German          | Opus 4.7 | **Max** | Compound nouns (Klassenarbeit, Schulleiterzimmer) frequently overflow buttons/labels. Rigorous review needed           |
| P4-ES   | Spanish         | Opus 4.7 | High    | Well-supported; consider neutral Spanish (not regional ES-MX vs ES-ES) for breadth                                     |

**Order recommendation:** P4-FR → P4-ES → P4-DE → P4-GA (easiest to hardest). User may override.

### 5.6 Phase 5 — Tier 2 Languages (sessions P5-IT, P5-RO, P5-PL)

Same shape as Phase 4, but:

- Translation scope limited to `tier_2_namespaces` allowlist (defined Phase 1)
- Parity test enforces 100% match against the allowlist subset, ignores out-of-scope namespaces
- Out-of-scope namespaces fall back to **default tenant locale** at runtime — but since Tier 2 users only navigate to in-scope pages (parent + student portal), they never hit a missing key. (Hard-error policy still applies — if a Tier 2 user _did_ somehow navigate to an out-of-scope page, the page would error. We accept this and add a runtime guard: if the user's resolved locale is a Tier 2 locale and they navigate to an out-of-scope path, the page redirects to the same path under the tenant default locale)

**Per-language model recommendations:**

| Session | Language | Model      | Effort  | Rationale                                                                    |
| ------- | -------- | ---------- | ------- | ---------------------------------------------------------------------------- |
| P5-IT   | Italian  | Sonnet 4.6 | Max     | Romance language, well-supported; Sonnet 4.6 sufficient                      |
| P5-RO   | Romanian | Opus 4.7   | High    | Romance language but Slavic-influenced grammar; mid-difficulty               |
| P5-PL   | Polish   | Opus 4.7   | **Max** | Complex grammar (7 cases, aspect, gendered verbs). Highest QA risk in Tier 2 |

**Order recommendation:** P5-IT → P5-RO → P5-PL.

### 5.7 Phase 6 — Tenant rollout (rolling, operational)

Per-locale, after NHQS QA passes:

- Confirm with user that the locale is QA-approved
- For each tenant that should receive the locale: `UPDATE tenants SET supported_locales = supported_locales || '{<locale>}'::text[] WHERE slug = '<tenant>'`
- Document tenant-by-tenant in IMPLEMENTATION_LOG.md §Rollout

This is operations work, not a session in the same sense.

---

## 6. Per-Session Execution Protocol

Every implementation session (Phases 1-5) runs the same loop:

```text
1. Read STRATEGY.md and IMPLEMENTATION_LOG.md
2. Verify previous session entry shows status = "complete & deployed"
3. Append "Begin" entry: timestamp, session ID, model, effort
4. Execute the session's scope
5. Local checks: turbo lint, turbo type-check, turbo test (mandatory per CLAUDE.md regression rule)
6. Commit on main with conventional commit message
7. Push to GitHub (main)
8. Watch CI: gh run watch
9. If CI fails: read logs (gh run view --log-failed), fix forward, repeat from step 6
10. CI passes → CI deploys to production → wait for deployment success
11. (Optional) Run Playwright verification on the deployed app — see §7
12. Append "Complete" entry: commit SHA(s), CI run URL, deploy timestamp, Playwright pass status
13. Release codebase — next session may now begin
```

**No skipping.** A session is not done until it deploys and verifies. If verification fails, the session reverts the deploy or fixes forward — but does not declare itself complete.

---

## 7. Playwright Verification Per Session

Every session deploys to production. The deploying session is responsible for verifying the deployment via Playwright before releasing the codebase to the next session.

### 7.1 Verification spec (per language session, P4 + P5)

For each session that ships a new locale, the Playwright verification must include:

1. **Smoke test — login + navigation**
   - Log in as NHQS test user (admin@school.test, password from env)
   - Switch to the new locale via profile menu
   - Assert URL contains `/<locale>/`
   - Navigate to: home, dashboard, students list, finance dashboard (T1 only), parent portal, student portal, profile
   - Assert no `MISSING_MESSAGE` warnings in console
   - Assert no 500 errors

2. **Locale switch journey**
   - Switch from default → new locale → default → new locale, verify state preserved across navigation

3. **Hardcoded English leak detector**
   - For each route in scope, snapshot the DOM
   - Run a stop-word scan: page must not contain English common words from a curated list (e.g., "Save", "Cancel", "Edit", "Delete", "Settings", etc.) **except** in known-safe locations (proper nouns, brand terms, code identifiers, currency codes)
   - Fails if more than threshold matches

4. **Visual regression**
   - Capture per-route snapshots in the new locale
   - Compare against committed baselines (committed in the same session as PR-equivalent — but since we're working in main, committed in the same commit batch)
   - Also run en + ar visual regression to confirm no regression on existing locales

5. **Translation parity (Jest, runs in CI)**
   - All locales loop; new locale required to be 100%

6. **Notification dispatch test (Jest integration)**
   - Create a test household with `secondary_locale = <new>` and `opt_in = true`
   - Fire `payment.received` notification
   - Assert two notification rows created — one in tenant default, one in new locale, both rendered correctly

7. **PDF render test (Jest)**
   - Render a sample receipt and report card in the new locale
   - Assert no Handlebars errors, no missing-key errors
   - Visual diff against a committed baseline PDF

### 7.2 Verification spec (Phase 1-3 sessions, no new locale)

- Run en + ar Playwright suite to confirm no regression
- Run translation parity test (en ↔ ar must remain 100%)
- Spot-check the specific functionality changed in the session (schema migration: query the new columns; PDF refactor: generate sample PDFs; dispatch fanout: trigger a test dispatch)

### 7.3 Full visual suite in CI

User authorised enabling the full visual suite in CI (since we work in main, there's no merge gate to defer it to). Configure `apps/web/e2e/playwright.config.ts` to run in CI on every push. Per-locale projects (en-ltr, ar-rtl, mobile-en, mobile-ar) extended with new-locale projects added by each Phase 4/5 session.

---

## 8. Logging Format (`IMPLEMENTATION_LOG.md`)

Each session appends a structured entry:

```markdown
## P4-FR — French (fr)

- **Status:** 🟢 Complete & Deployed
- **Model:** Opus 4.7 / High effort
- **Began:** 2026-04-26 09:14 UTC
- **Completed:** 2026-04-26 14:32 UTC
- **Duration:** 5h 18m

### Commits (on main)

- `c1a2b3d` — feat(i18n): add French locale registry entry + tier scope
- `d4e5f6a` — feat(i18n): generate fr.json (full catalogue, 17,498 keys)
- `g7h8i9b` — feat(i18n): add French notification + PDF template strings
- `j0k1l2c` — test(i18n): French Playwright smoke + visual baselines

### CI / Deploy

- CI run: https://github.com/ACANOTES-dev/EduPod/actions/runs/<id>
- Deployed at: 2026-04-26 14:14 UTC
- Verified at: 2026-04-26 14:32 UTC

### Playwright

- Smoke test: ✅ pass
- Locale switch: ✅ pass
- Hardcoded English leak: ✅ 0 matches
- Visual regression (fr): ✅ 217 baselines committed
- Visual regression (en + ar): ✅ no regression
- Notification dispatch: ✅ pass
- PDF render: ✅ pass

### NHQS rollout

- `supported_locales` for NHQS: ['en','ar','fr']
- Other tenants: not yet flipped (awaiting human QA)

### Notes

- 47 strings flagged for human review (compound noun overflow on 3 buttons; idiomatic phrasing on 6 error messages)
- Glossary updated with 12 new school-domain terms
```

---

## 9. Model & Effort Recommendation Summary

| Session                             | Model      | Effort   | Rationale                             |
| ----------------------------------- | ---------- | -------- | ------------------------------------- |
| P1A — Schema, RLS                   | Opus 4.7   | High     | RLS-sensitive schema work             |
| P1B — AR cleanup + hard-error       | Opus 4.7   | **Max**  | Delicate; AR must not regress         |
| P1C — Tenant gating UI              | Opus 4.7   | Standard | Routine UI + admin                    |
| P2A — PDF refactor                  | Opus 4.7   | **Max**  | Architectural; en/ar must not corrupt |
| P2B — NotificationTemplate refactor | Opus 4.7   | High     | Architectural                         |
| P3 — Dispatch fanout                | Opus 4.7   | High     | Concurrency + idempotency reasoning   |
| P4-GA — Irish                       | Opus 4.7   | **Max**  | Hardest language; weak AI training    |
| P4-FR — French                      | Opus 4.7   | High     | Standard Romance language work        |
| P4-DE — German                      | Opus 4.7   | **Max**  | Compound nouns + UI overflow          |
| P4-ES — Spanish                     | Opus 4.7   | High     | Standard work; choose neutral ES      |
| P5-IT — Italian                     | Sonnet 4.6 | Max      | Romance; Sonnet sufficient            |
| P5-RO — Romanian                    | Opus 4.7   | High     | Mid-difficulty grammar                |
| P5-PL — Polish                      | Opus 4.7   | **Max**  | Complex grammar; QA risk              |

---

## 10. Risks & Mitigations

| Risk                                                            | Likelihood | Impact       | Mitigation                                                                                                                                                                   |
| --------------------------------------------------------------- | ---------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Irish AI quality below acceptable                               | High       | Medium       | Opus 4.7 max effort; post-launch human reviewer specifically for ga; reviewer flags inaccuracies as bug-log entries; agent fixes in micro-sessions                           |
| en.json corruption during refactor                              | Low        | **Critical** | en.json never edited in Phase 2/4/5. Only Phase 1B touches en.json (and only via the registry constant relocation, no string changes). PR-style review of any en.json diff   |
| ar.json regression after hard-error flip                        | Medium     | High         | Phase 1B requires AR 100% before flipping. Rollback path: revert the `next-intl` config change to silent fallback if AR regression discovered post-flip                      |
| PDF refactor produces visually different en/ar output           | Medium     | High         | Phase 2A regression test enforces pixel-equality / 1% diff threshold. Block merge on regression                                                                              |
| Tenant locale gating bypass                                     | Low        | Medium       | `Tenant.supported_locales` enforced at backend on user write operations; URL-based locale switch validated server-side                                                       |
| Hard-error breaks production for an existing key that's missing | Low        | Critical     | Phase 1B includes the AR cleanup and parity test as the gate. Any new key added after Phase 1 must be added to all locales in the same commit (CI parity gate enforces this) |
| Tier 2 user navigates to out-of-scope page → 500                | Medium     | Medium       | Phase 5 includes a route-level guard that detects Tier 2 locales on out-of-scope routes and redirects to the same path in the tenant default locale                          |
| Dual-language dispatch causes notification duplication          | Low        | Medium       | Idempotency keys suffixed per locale; integration test asserts exactly two notifications, not three                                                                          |
| Visual regression false positives on en/ar baselines            | Medium     | Low          | 1% pixel-diff threshold; baselines re-captured if any cosmetic refactor lands                                                                                                |
| AI translation drift across sessions                            | Medium     | Medium       | Glossary file (`New Languages/glossary.md`) built up Phase 1 and shared across all language sessions to enforce consistent terminology                                       |

---

## 11. Out of Scope

- **Calendar localisation** — always Gregorian per CLAUDE.md
- **Multi-currency** — always single currency per tenant per CLAUDE.md
- **New RTL languages** — none in this expansion (only existing AR remains RTL)
- **Server-side error message translation** — backend continues to send `{ code, message }` with English `message`; frontend translates from `code`
- **Translation memory infrastructure (Lokalise/Crowdin)** — explicitly rejected in favour of AI-driven workflow
- **Email subject-line translation for tenant-customised templates** — only system templates are message-catalogue-backed; tenant overrides remain raw strings (tenants own their customisations)
- **i18next-parser, FormatJS extract, or other static extraction** — `scripts/check-i18n.js` already AST-walks for usage; no additional tooling needed
- **Voice / audio / video content** — no localised media in this scope
- **Marketing site** outside `apps/web/` — out of scope (separate property)

---

## 12. Cross-References

- Existing i18n config: `apps/web/i18n/config.ts`, `apps/web/i18n/request.ts`
- Message files: `apps/web/messages/en.json` (canonical), `apps/web/messages/ar.json`
- Locale switcher UI: `apps/web/src/components/user-menu.tsx`
- Format helpers: `apps/web/src/lib/i18n-format.ts` (already supports `fmtLocale(locale)` for Western numerals + Gregorian)
- Translation parity test: `apps/web/src/__tests__/translation-parity.spec.ts` (extend in Phase 1B)
- i18n usage scanner: `scripts/check-i18n.js` (extend in Phase 1B)
- PDF templates: `apps/api/src/modules/pdf-rendering/templates/` (refactor target Phase 2A)
- Notification templates: `apps/api/src/modules/communications/` + `NotificationTemplate` table
- Worker dispatch: `apps/worker/src/processors/communications/dispatch-notifications.processor.ts`
- Existing rebuild patterns to mimic: `/SW`, `/BH`, `/WBR`, `/inbox`, `/new-admissions` slash commands

---

## 13. Next Steps

After user approval of this strategy:

1. Invoke `superpowers:writing-plans` skill to create per-session implementation blueprints under `New Languages/sessions/`:
   - `P1A-schema-rls.md`
   - `P1B-arabic-cleanup-hard-error.md`
   - `P1C-tenant-gating-ui.md`
   - `P2A-pdf-refactor.md`
   - `P2B-notification-template-refactor.md`
   - `P3-dual-language-dispatch.md`
   - `P4-GA-irish.md`, `P4-FR-french.md`, `P4-DE-german.md`, `P4-ES-spanish.md`
   - `P5-IT-italian.md`, `P5-RO-romanian.md`, `P5-PL-polish.md`
2. Create matching slash command (`/NL <session-id>`) following the existing `/SW`, `/BH`, `/WBR` template at `.claude/commands/NL.md`
3. Build the glossary scaffold at `New Languages/glossary.md`
4. Begin P1A execution
