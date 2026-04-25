# Multi-Language Expansion — Implementation Log

**Project:** Add 4 Tier-1 (`ga`, `fr`, `de`, `es`) and 3 Tier-2 (`it`, `ro`, `pl`) languages to SDB.
**Strategy:** see `STRATEGY.md` in this folder.
**Started:** 2026-04-25 (Phase 0 spec authored)

---

## Status legend

- ⚪ **Pending** — not yet started
- 🟡 **In progress** — session is currently active or partially complete
- 🟢 **Complete & deployed** — all checks passed, deployed to production, Playwright-verified, codebase released to next session
- 🔴 **Blocked / Failed** — session hit an issue that prevents completion; details in the entry's "Notes" section

A session is **not 🟢** until: local tests pass + commit on main + CI green + production deploy succeeds + Playwright verification passes + log entry updated with commit SHA(s) + deploy timestamp.

---

## Session index

| ID    | Phase               | Title                                          | Status         | Model      | Effort   |
| ----- | ------------------- | ---------------------------------------------- | -------------- | ---------- | -------- |
| P0    | 0 — Spec & Strategy | Strategy & implementation log                  | 🟡 In progress | Opus 4.7   | High     |
| P1A   | 1 — Foundation      | Schema, RLS, locale registry                   | ⚪ Pending     | Opus 4.7   | High     |
| P1B   | 1 — Foundation      | Arabic placeholder cleanup + hard-error flip   | ⚪ Pending     | Opus 4.7   | Max      |
| P1C   | 1 — Foundation      | Tenant gating UI + language picker refactor    | ⚪ Pending     | Opus 4.7   | Standard |
| P2A   | 2 — Refactor        | PDF templates: locale-driven refactor          | ⚪ Pending     | Opus 4.7   | Max      |
| P2B   | 2 — Refactor        | NotificationTemplate refactor                  | ⚪ Pending     | Opus 4.7   | High     |
| P3    | 3 — Dispatch        | Dual-language household dispatch fanout        | ⚪ Pending     | Opus 4.7   | High     |
| P4-GA | 4 — Tier 1          | Irish (Gaeilge) full catalogue + Playwright    | ⚪ Pending     | Opus 4.7   | Max      |
| P4-FR | 4 — Tier 1          | French full catalogue + Playwright             | ⚪ Pending     | Opus 4.7   | High     |
| P4-DE | 4 — Tier 1          | German full catalogue + Playwright             | ⚪ Pending     | Opus 4.7   | Max      |
| P4-ES | 4 — Tier 1          | Spanish full catalogue + Playwright            | ⚪ Pending     | Opus 4.7   | High     |
| P5-IT | 5 — Tier 2          | Italian parent+student catalogue + Playwright  | ⚪ Pending     | Sonnet 4.6 | Max      |
| P5-RO | 5 — Tier 2          | Romanian parent+student catalogue + Playwright | ⚪ Pending     | Opus 4.7   | High     |
| P5-PL | 5 — Tier 2          | Polish parent+student catalogue + Playwright   | ⚪ Pending     | Opus 4.7   | Max      |
| P6.\* | 6 — Rollout         | Per-tenant `supported_locales` flips           | ⚪ Pending     | n/a        | n/a      |

**Critical path:** P0 → P1A → P1B → P1C → P2A → P2B → P3 → P4-_ → P5-_ → P6.\*

**Sessions are sequential at the codebase level** (no worktrees/branches). Within Phase 4 and Phase 5, the order of `*-GA / *-FR / *-DE / *-ES` (and `*-IT / *-RO / *-PL`) is reorderable — they don't depend on each other content-wise — but **only one runs on the codebase at a time**.

---

## Phase 0 — Spec & Strategy

### P0 — Strategy & implementation log

- **Status:** 🟡 In progress
- **Model:** Opus 4.7 / High effort
- **Began:** 2026-04-25
- **Completed:** —
- **Tasks:**
  - [x] Audit current i18n infrastructure (frontend, backend, worker, tests)
  - [x] Brainstorm scope, tiers, dual-language model, launch threshold, pacing
  - [x] Archive obsolete prior strategy files to `_archive/`
  - [x] Write `STRATEGY.md`
  - [x] Write `IMPLEMENTATION_LOG.md`
  - [ ] Spec self-review
  - [ ] Commit P0 deliverables on `main`
  - [ ] User review gate
  - [ ] Transition to `superpowers:writing-plans` skill to author per-session blueprints under `sessions/`

### Commits (on main)

- (pending) `docs(i18n): add Multi-Language Expansion strategy + implementation log`

### Notes

- This session does not deploy to production (no code changes); the deliverable is documentation + planning. The "deploy" gate doesn't apply to P0.

---

## Phase 1 — Foundation

### P1A — Schema, RLS, locale registry

- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / High effort
- **Depends on:** P0 approved
- **Began:** —
- **Completed:** —

**Scope (summary; full blueprint in `sessions/P1A-schema-rls.md` after writing-plans):**

- Migration: `add_locale_expansion_columns`
  - `Tenant.supported_locales TEXT[] NOT NULL DEFAULT ARRAY['en']::TEXT[]`
  - `Tenant.default_locale = ANY(supported_locales)` CHECK constraint
  - `Household.secondary_locale TEXT NULL`
  - `Household.dual_language_opt_in BOOLEAN NOT NULL DEFAULT false`
- Backfill `Tenant.supported_locales = ['en', 'ar']` for every existing tenant (simplified rule per STRATEGY.md §4.1 — preserves both currently-served languages; platform admin can trim a tenant's array later via the P1C admin UI)
- New file: `apps/web/i18n/registry.ts` — single source of truth for locale metadata (code, English name, native name, direction, tier)
- `apps/web/i18n/config.ts` — derive active `locales` array from registry; register all new locales as metadata-only (not yet in active set)
- New file: `apps/web/i18n/tier-scopes.ts` — `tier_2_namespaces` allowlist
- Backend Zod schemas for new locale operations
- Tests: Jest unit tests for registry + allowlist + schemas; RLS leakage test for new Household columns

### Acceptance

- [ ] Migration applies cleanly to fresh DB
- [ ] Migration applies cleanly to NHQS prod snapshot
- [ ] Existing en + ar Playwright suite passes (no regression)
- [ ] CI green on main
- [ ] Production deploy successful
- [ ] Production verification: spot-check that schema changes are live (psql query into NHQS)

### Commits (on main)

- (pending)

### CI / Deploy

- (pending)

### Playwright verification

- (pending — Phase 1 only requires regression check on en + ar)

### Notes

- (none yet)

---

### P1B — Arabic placeholder cleanup + hard-error flip

- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / **Max effort**
- **Depends on:** P1A complete
- **Began:** —
- **Completed:** —

**Scope:**

- Audit `apps/web/messages/ar.json` for `[AR] …` placeholder strings
- Translate placeholders to proper Arabic
- Run `translation-parity.spec.ts` until 100% pass for `en` ↔ `ar`
- Flip `next-intl` `getRequestConfig` to `onError: throw` (dev) / Sentry-then-throw (prod)
- Extend translation-parity test to support N locales
- Extend `scripts/check-i18n.js` to scan all registered locales
- Update CI workflow to enforce parity gate on every push

### Acceptance

- [ ] AR placeholder audit: 0 remaining `[AR] …` strings
- [ ] `translation-parity.spec.ts` passes
- [ ] `scripts/check-i18n.js` reports 0 missing/orphan keys for en + ar
- [ ] Hard-error flag is on; missing key in dev throws visibly
- [ ] CI parity gate active
- [ ] AR Playwright suite (regulatory + general) passes
- [ ] Production deploy successful

### Commits (on main)

- (pending)

### CI / Deploy

- (pending)

### Playwright verification

- (pending — focus on AR regression + verify hard-error doesn't break existing pages)

### Notes

- (none yet)

---

### P1C — Tenant gating UI + language picker refactor

- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / Standard
- **Depends on:** P1B complete

**Scope:**

- `apps/web/src/components/user-menu.tsx`: replace binary EN ↔ AR toggle with dynamic dropdown sourced from `tenant.supported_locales`
- Profile page locale selector: same filter
- Backend: `Tenant.supported_locales` admin endpoint (platform-admin-only)
- Frontend: super-admin UI in `(platform)/` for flipping `supported_locales` per tenant
- Tests: Playwright journey for tenant-gated picker behaviour

### Acceptance

- [ ] Picker shows only locales in tenant's `supported_locales`
- [ ] Profile selector enforces same filter
- [ ] Platform admin can flip `supported_locales` per tenant via UI
- [ ] CI green
- [ ] Production deploy successful
- [ ] Playwright: NHQS user sees en + ar only (since no T1 yet); admin enables fr; reload shows fr in picker

### Commits (on main)

- (pending)

### CI / Deploy

- (pending)

### Playwright verification

- (pending)

### Notes

- (none yet)

---

## Phase 2 — Template Refactor

### P2A — PDF templates: locale-driven refactor

- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / **Max effort**
- **Depends on:** P1 complete (all of P1A, P1B, P1C)

**Scope:**

- Refactor 14 PDF template types from file-pair (`*-en.template.ts` + `*-ar.template.ts`) to a single locale-driven template per type
- Extract string content to `pdf-templates.{locale}.json` (en + ar populated as part of refactor)
- New Handlebars helpers: `t`, `formatDate`, `formatCurrency`, `formatNumber`, `getLocalizedSchoolName`
- Regression test: render every PDF type pre/post in en + ar, pixel-diff at 1% threshold; block merge on regression
- The 14 PDF types: report-card, transcript, invoice, receipt, household-statement, payslip, report-card-modern, pastoral-summary, sst-activity, safeguarding-compliance, wellbeing-programme, trip-leader-pack, des-inspection, (compliance variants)

### Acceptance

- [ ] All 14 types render in en + ar identically pre/post (≤1% pixel diff)
- [ ] New Handlebars helpers added with unit tests
- [ ] PDF regression test added to CI
- [ ] Production deploy successful
- [ ] Manual verification: generate sample receipt + report card on NHQS, visually inspect

### Commits (on main)

- (pending)

### CI / Deploy

- (pending)

### Playwright verification

- (pending — PDF generation triggered via API, verify no regression)

### Notes

- (none yet)

---

### P2B — NotificationTemplate refactor

- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / High effort
- **Depends on:** P2A complete

**Scope:**

- Migrate system `NotificationTemplate` rows to reference message-catalogue keys via `t:` prefix
- Update `dispatch-notifications.processor.ts` to resolve `t:` references at render time
- Tenant-specific override rows continue to work as raw Handlebars strings
- Migration: update system rows; tenant rows untouched
- Update Resend / Twilio providers to pass locale to renderer
- Tests: send test notification in en + ar, verify identical to pre-refactor output; send in `fr` (using temp en stub) — verify renderer doesn't throw

### Acceptance

- [ ] All existing en + ar notification flows work identically pre/post
- [ ] System rows migrated; tenant rows untouched
- [ ] Renderer resolves `t:` references correctly
- [ ] Production deploy successful
- [ ] Manual verification: trigger a real `payment.received` notification on NHQS; check rendered output

### Commits (on main)

- (pending)

### CI / Deploy

- (pending)

### Playwright verification

- (pending — verify notification UI on NHQS shows correct content)

### Notes

- (none yet)

---

## Phase 3 — Dual-Language Dispatch

### P3 — Dual-language household dispatch fanout

- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / High effort
- **Depends on:** P2 complete

**Scope:**

- Household profile UI: `secondary_locale` dropdown + `dual_language_opt_in` toggle
- New service: `NotificationDispatcher.fanout(notification, household)`
- Idempotency keys suffixed per locale
- Audit log entries for both dispatched notifications
- Unit tests: all permutations of `opt_in` × `secondary_locale` × `default_locale`
- Integration test: trigger `payment.received` for opt-in household; assert two notification rows
- Playwright: parent profile flow

### Acceptance

- [ ] Household opt-in UI functional
- [ ] Dispatcher fanout correct in all permutations
- [ ] Idempotency: no duplicate emit on retry
- [ ] Audit log shows both entries
- [ ] Production deploy successful
- [ ] Playwright pass

### Commits (on main)

- (pending)

### CI / Deploy

- (pending)

### Playwright verification

- (pending)

### Notes

- (none yet)

---

## Phase 4 — Tier 1 Languages

> **Order recommendation:** P4-FR → P4-ES → P4-DE → P4-GA (easiest to hardest). User may reorder.
>
> Each P4 session has the same shape — see STRATEGY.md §5.5. Per-session log entries below.

### P4-GA — Irish (Gaeilge)

- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / **Max effort**
- **Depends on:** P3 complete; recommended after P4-FR/ES/DE so glossary is well-developed
- **Began:** —
- **Completed:** —

**Scope:**

- Translate `en.json` → `ga.json` (full catalogue, all 118 namespaces)
- Translate `pdf-templates.en.json` → `pdf-templates.ga.json`
- Generate notification-template strings for `ga`
- Add `ga` to active locales in `apps/web/i18n/config.ts`
- Enable `ga` for NHQS via SQL on prod server: `UPDATE tenants SET supported_locales = supported_locales || '{ga}'::text[] WHERE slug = 'nhqs'`
- Commit Playwright baselines for `ga` (per-route snapshots)
- Run full Playwright verification spec (smoke, locale switch, leak detector, visual, parity, dispatch, PDF render)

### Acceptance

- [ ] Translation parity: 100% match against `en.json` shape
- [ ] No `MISSING_MESSAGE` warnings on any route in `[ga]/` segment
- [ ] All Playwright smoke + visual + dispatch + PDF tests pass
- [ ] en + ar visual regression: no regression
- [ ] NHQS-only: `supported_locales = ['en','ar','ga']` (or whatever T1 are already there)
- [ ] CI green
- [ ] Production deploy successful

### Commits (on main)

- (pending)

### CI / Deploy

- (pending)

### Playwright verification

- (pending)

### NHQS rollout

- (pending)

### Other tenants

- (gated; awaiting human QA on NHQS)

### Notes

- Glossary updates: (pending)
- Strings flagged for human review: (pending)

---

### P4-FR — French

- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / High effort
- **Depends on:** P3 complete
- **Began:** —
- **Completed:** —

**Scope:** Same shape as P4-GA but for `fr`.

### Acceptance / Commits / CI / Playwright / Rollout / Notes

- (sections identical to P4-GA, populated during execution)

---

### P4-DE — German

- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / **Max effort**
- **Depends on:** P3 complete

**Scope:** Same shape as P4-GA but for `de`. Pay special attention to compound noun overflow on buttons and labels.

### Acceptance / Commits / CI / Playwright / Rollout / Notes

- (populated during execution)

---

### P4-ES — Spanish

- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / High effort
- **Depends on:** P3 complete

**Scope:** Same shape as P4-GA but for `es`. Use neutral Spanish (not regional ES-MX vs ES-ES).

### Acceptance / Commits / CI / Playwright / Rollout / Notes

- (populated during execution)

---

## Phase 5 — Tier 2 Languages

> **Order recommendation:** P5-IT → P5-RO → P5-PL.
>
> Each P5 session translates only the `tier_2_namespaces` allowlist (parent + student surface). Out-of-scope namespaces fall back to tenant default with a route-level guard. See STRATEGY.md §5.6.

### P5-IT — Italian

- **Status:** ⚪ Pending
- **Model:** Sonnet 4.6 / Max effort
- **Depends on:** P4 complete

**Scope:**

- Translate `en.json` → `it.json` for the `tier_2_namespaces` allowlist subset only
- Translate parent-relevant PDF templates (receipt, invoice, household statement, report card)
- Generate parent-relevant notification-template strings
- Add `it` to active locales
- Add route-level guard: if user's resolved locale is `it` and they navigate outside the allowlist, redirect to the same path under tenant default locale
- Enable for NHQS, run full Playwright verification

### Acceptance

- [ ] Translation parity: 100% match against `en.json` for in-scope namespaces only
- [ ] Out-of-scope guard works: visiting `/it/finance/payroll` redirects to `/en/finance/payroll`
- [ ] No `MISSING_MESSAGE` on parent + student surface in `[it]/`
- [ ] Playwright smoke pass on parent + student routes
- [ ] en + ar regression: clean
- [ ] CI green; production deploy successful

### Commits / CI / Playwright / Rollout / Notes

- (populated during execution)

---

### P5-RO — Romanian

- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / High effort
- **Depends on:** P4 complete

**Scope:** Same shape as P5-IT but for `ro`.

### Sections

- (populated during execution)

---

### P5-PL — Polish

- **Status:** ⚪ Pending
- **Model:** Opus 4.7 / **Max effort**
- **Depends on:** P4 complete

**Scope:** Same shape as P5-IT but for `pl`. Watch for grammar complexity (cases, gendered verbs).

### Sections

- (populated during execution)

---

## Phase 6 — Tenant rollout

> Per-locale, per-tenant. Each row appended after NHQS QA passes for that locale.

| Locale       | Tenant          | Date enabled                 | Operator | Notes              |
| ------------ | --------------- | ---------------------------- | -------- | ------------------ |
| ga           | nhqs            | (pending P4-GA completion)   | —        | Pilot tenant       |
| fr           | nhqs            | (pending P4-FR completion)   | —        | Pilot tenant       |
| de           | nhqs            | (pending P4-DE completion)   | —        | Pilot tenant       |
| es           | nhqs            | (pending P4-ES completion)   | —        | Pilot tenant       |
| it           | nhqs            | (pending P5-IT completion)   | —        | Pilot tenant       |
| ro           | nhqs            | (pending P5-RO completion)   | —        | Pilot tenant       |
| pl           | nhqs            | (pending P5-PL completion)   | —        | Pilot tenant       |
| (per locale) | (other tenants) | (pending NHQS QA per locale) | —        | GA rollout post-QA |

---

## Summary metrics (live)

- **Total sessions planned:** 13 (excl. P0 + Phase 6 ops)
- **Sessions complete:** 0
- **Sessions in progress:** 1 (P0)
- **Sessions pending:** 13
- **Sessions blocked:** 0
- **Languages live (NHQS):** en, ar
- **Languages live (other tenants):** en, ar
- **Translation parity status:** en ↔ ar (existing); other locales not yet active
- **Hard-error flag:** off (will flip in P1B)
- **Visual suite in CI:** smoke only (will expand to full in Phase 4)

---

## Quick reference

### Commit message template

```
feat(i18n): <session-id> <description>

- Phase: <phase number>
- Languages: <locale codes>
- Key count: <number>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### Verification commands

```bash
# Translation parity (extended for N locales after P1B)
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
sudo -u postgres psql edupod_prod
UPDATE tenants
SET supported_locales = supported_locales || '{<locale>}'::text[]
WHERE slug = '<tenant-slug>';
```

### Rollback (if a deployed locale regresses production)

```bash
# 1. Disable the locale for all tenants
UPDATE tenants
SET supported_locales = array_remove(supported_locales, '<locale>');

# 2. If hard-error is biting on existing locales: revert next-intl config
git revert <P1B-commit-sha>
git push origin main

# 3. Watch CI deploy the revert; verify Sentry quiets
```

---

## Lessons learned

(Populated as sessions complete.)
