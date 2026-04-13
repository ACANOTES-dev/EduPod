# Finance Module — Parent E2E Test Specification

**Module:** Finance (Parent Portal surface — viewing invoices, paying via Stripe, downloading receipts, requesting payment plans)
**Perspective:** Parent — user with role `parent` and at least one `Parent.user_id` link plus one or more linked students via `parent_student_links`. Default permissions: `parent.view_finances`, `parent.make_payments`. NO finance-admin permissions.
**Surface:**

- `/[locale]/dashboard/parent` → Finances tab (`FinancesTab` component inside the parent dashboard)
- No standalone `/finance/*` routes (the entire `/finance/*` tree is admin-only; parents MUST receive a 403 or redirect when navigating directly)
- Stripe Checkout redirect flow (external domain, but the round-trip back into the app is in scope)
  **Last Updated:** 2026-04-12
  **Baseline commit:** `384ba761` (full spec-pack command set)

---

## Table of Contents

1. [Prerequisites & Test Data](#1-prerequisites--test-data)
2. [Out of Scope for This Spec](#2-out-of-scope-for-this-spec)
3. [Global Environment Setup (DevTools, Storage, Locale)](#3-global-environment-setup-devtools-storage-locale)
4. [Access Control — Parent MUST NOT See Admin Finance Surface](#4-access-control--parent-must-not-see-admin-finance-surface)
5. [Parent Dashboard — Tabs & Navigation](#5-parent-dashboard--tabs--navigation)
6. [Parent Dashboard — Action Center (Overview tab)](#6-parent-dashboard--action-center-overview-tab)
7. [Finances Tab — Loading / Empty / Error States](#7-finances-tab--loading--empty--error-states)
8. [Finances Tab — Outstanding Balance Card](#8-finances-tab--outstanding-balance-card)
9. [Finances Tab — Invoices List (card layout)](#9-finances-tab--invoices-list-card-layout)
10. [Finances Tab — Invoice Status Badge & Variant Map](#10-finances-tab--invoice-status-badge--variant-map)
11. [Finances Tab — "Pay Now" (Stripe Checkout)](#11-finances-tab--pay-now-stripe-checkout)
12. [Stripe Checkout — Round-Trip & Success URL](#12-stripe-checkout--round-trip--success-url)
13. [Stripe Checkout — Cancel URL & Error Paths](#13-stripe-checkout--cancel-url--error-paths)
14. [Finances Tab — "Request Payment Plan" Modal](#14-finances-tab--request-payment-plan-modal)
15. [Payment Plan Request — Installments Editor](#15-payment-plan-request--installments-editor)
16. [Payment Plan Request — Submit & Lifecycle](#16-payment-plan-request--submit--lifecycle)
17. [Payment Plan — Accept Counter-Offer](#17-payment-plan--accept-counter-offer)
18. [Finances Tab — Payment History Table](#18-finances-tab--payment-history-table)
19. [Finances Tab — Receipt Download](#19-finances-tab--receipt-download)
20. [Receipt PDF — Content & Branding](#20-receipt-pdf--content--branding)
21. [Cross-Household Isolation — Parent Can Only See Own Data](#21-cross-household-isolation--parent-can-only-see-own-data)
22. [Cross-Tenant Isolation — Parent Cannot Enumerate Other Tenants](#22-cross-tenant-isolation--parent-cannot-enumerate-other-tenants)
23. [Permission Guard Tests (Negative Assertions)](#23-permission-guard-tests-negative-assertions)
24. [Arabic / RTL Verification](#24-arabic--rtl-verification)
25. [Mobile Responsiveness (375px Viewport)](#25-mobile-responsiveness-375px-viewport)
26. [Console & Network Health](#26-console--network-health)
27. [Backend Endpoint Map (Parent Surface)](#27-backend-endpoint-map-parent-surface)
28. [Data Invariants — Parent-Facing Reads](#28-data-invariants--parent-facing-reads)
29. [Observations & Bugs Flagged During Walkthrough](#29-observations--bugs-flagged-during-walkthrough)
30. [Sign-Off](#30-sign-off)

---

## 1. Prerequisites & Test Data

**Multi-tenant test environment is MANDATORY.** A single-tenant Playwright run cannot validate tenant isolation. Provision the following before running this spec:

**Tenant A** (slug `nhqs`):

- Currency `EUR`, tenant branding `{ invoice_prefix: 'INV', receipt_prefix: 'REC', display_name: 'Nurul Huda Quality School' }`
- `tenant_stripe_configs.stripe_enabled = true`, Stripe test keys (`pk_test_*` / `sk_test_*` / `whsec_*`) configured
- 1 billing household `H-A1` with a billing parent `PA1` (linked student `SA1`)
- Invoices on `H-A1`:
  - `INV-A1` status `issued`, total €200, balance €200
  - `INV-A2` status `partially_paid`, total €500, balance €120
  - `INV-A3` status `overdue` (due_date in past), total €100, balance €100
  - `INV-A4` status `paid`, total €50, balance 0
  - `INV-A5` status `draft` (parent MUST NOT see this)
  - `INV-A6` status `void`, total €80, balance 0
  - `INV-A7` status `cancelled`, balance 0
  - `INV-A8` status `written_off`, write-off amount €100
  - `INV-A9` status `pending_approval` (parent MUST NOT see this)
- At least 2 `payment` rows for `H-A1`: one `posted` Stripe, one `posted` cash, one `refunded_partial`
- At least 1 `receipt` row per posted payment

**Tenant B** (slug `test-b`):

- Currency `USD`, `tenant_stripe_configs.stripe_enabled = false` (test the "Stripe disabled" branch)
- Household `H-B1` with billing parent `PB1` (linked student `SB1`)
- Invoices on `H-B1`: at least one `issued`, at least one `overdue`, at least one `paid`

**Parent user accounts:**

- `PA1@nhqs.edupod.app` — linked to `SA1` only in Tenant A; `parent.view_finances` + `parent.make_payments` granted
- `PA2@nhqs.edupod.app` — a SECOND parent in Tenant A, linked to a DIFFERENT household `H-A2` (for §21 cross-household isolation)
- `PB1@test-b.edupod.app` — parent in Tenant B, linked to `SB1`
- One parent with NO linked students: `PA3@nhqs.edupod.app` (for the "no linked students" empty state in §7)

**Browser / env setup:**

- Chrome DevTools open (Console + Network + Application tabs)
- Clear all application storage before each run
- Desktop pass at 1440×900; mobile pass at 375×667 (iPhone SE)
- Run locale passes: one `en`, one `ar`
- JWT in memory, refresh in httpOnly cookie — confirm no tokens leak to localStorage or sessionStorage

---

## 2. Out of Scope for This Spec

This spec exercises the UI-visible parent surface of the finance module. It does NOT cover:

- **RLS leakage across tenants at the DB layer** → `/e2e-integration` (direct Prisma queries bypassing the HTTP layer)
- **Parent-to-parent isolation at the SQL level** → `/e2e-integration` (SELECT FROM invoices returning only rows where `household_id IN (parent's linked households)`)
- **Stripe webhook signature + idempotency** → `/e2e-integration` (raw-body HMAC posting, `checkout.session.completed`, `charge.refunded` routing)
- **BullMQ jobs triggered by parent actions** (e.g. payment confirmation → receipt render → notification dispatch) → `/e2e-worker-test`
- **Load / throughput / checkout-session burst** → `/e2e-perf`
- **Security hardening** (OWASP Top 10, JWT replay across tenants, CSRF, Stripe key exfiltration) → `/e2e-security-audit`
- **Admin-facing finance UI** → `E2E/7_finance/admin_view/finance-e2e-spec.md`
- **Full receipt PDF content rendering correctness** → `/e2e-integration` (pdf-parse assertions on bytes)
- **Browser / device matrix beyond desktop Chrome and 375px mobile emulation** → deferred to manual QA
- **Stripe API live availability** — webhook/checkout flows are tested against Stripe test-mode. Real production Stripe outages are not simulated here.

A tester who runs ONLY this spec has completed a thorough parent-portal finance pass. They have NOT validated cross-tenant isolation at the DB layer — that is `/e2e-integration`'s job.

---

## 3. Global Environment Setup (DevTools, Storage, Locale)

| #   | What to Check                                                             | Expected Result                                                                                                                                                                | Pass/Fail |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 3.1 | Log in as `PA1@nhqs.edupod.app`, navigate to `/{locale}/dashboard/parent` | 200 response. `GET /api/v1/dashboard/parent` fires and returns `{ data: { greeting, students: [...] } }`. Spinner resolves to tab bar.                                         |           |
| 3.2 | Confirm `<html dir>` matches locale                                       | `dir="ltr"` when `locale=en`, `dir="rtl"` when `locale=ar`. `<html lang>` matches locale.                                                                                      |           |
| 3.3 | Inspect localStorage + sessionStorage                                     | Empty for all keys relating to finance / auth tokens / currency. JWT lives in memory only; refresh in httpOnly cookie.                                                         |           |
| 3.4 | Inspect cookies                                                           | One `refresh_token` httpOnly cookie. No plaintext JWT cookie. No Stripe customer ID exposed client-side.                                                                       |           |
| 3.5 | Kill the network then refresh                                             | Parent dashboard renders the loading skeleton, then falls back to "empty students" empty-state if no data. Console logs `[ParentDashboard.fetchDashboard]` error. No 500 page. |           |
| 3.6 | Hard-refresh while on Finances tab                                        | Tab selection resets to `overview` (not persisted). `GET /api/v1/parent/finances` does NOT fire until the Finances tab is clicked.                                             |           |
| 3.7 | Switch to Finances tab                                                    | `GET /api/v1/parent/finances` fires exactly once per tab activation. Repeated clicks do NOT re-fire (data already in state).                                                   |           |
| 3.8 | Inspect response of `GET /api/v1/parent/finances`                         | Response shape: `{ data: { outstanding_balance: number, currency_code: string, invoices: ParentInvoice[], payments: ParentPayment[], stripe_enabled: boolean } }`.             |           |
| 3.9 | No accidental admin-finance request                                       | Network tab must show ZERO calls to `/api/v1/finance/*` (admin namespace). Only `/api/v1/parent/*` and `/api/v1/dashboard/parent` are allowed.                                 |           |

---

## 4. Access Control — Parent MUST NOT See Admin Finance Surface

| #    | What to Check                                                                                                                                       | Expected Result                                                                                                                                                   | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1  | As PA1, navigate directly to `/en/finance`                                                                                                          | Server/middleware returns 403 or redirects to `/{locale}/dashboard/parent`. If it renders a page, the page MUST NOT call `GET /api/v1/finance/dashboard`.         |           |
| 4.2  | Direct navigate `/en/finance/invoices`                                                                                                              | 403 / redirect. No admin data leaks into the DOM. Network tab shows the failed attempt (if any).                                                                  |           |
| 4.3  | Direct navigate `/en/finance/payments`                                                                                                              | 403 / redirect.                                                                                                                                                   |           |
| 4.4  | Direct navigate `/en/finance/refunds`                                                                                                               | 403 / redirect.                                                                                                                                                   |           |
| 4.5  | Direct navigate `/en/finance/statements/<any-household-id>`                                                                                         | 403 / redirect. Even if the id happens to belong to the parent's own household, the admin UI MUST be denied — parents use the dashboard tab, not the admin shell. |           |
| 4.6  | Direct navigate `/en/finance/reports` / `/en/finance/audit-trail`                                                                                   | 403 / redirect.                                                                                                                                                   |           |
| 4.7  | Attempt `curl -H "Authorization: Bearer <parent_jwt>" <api>/v1/finance/invoices`                                                                    | 403 FORBIDDEN with body `{ error: { code: 'FORBIDDEN', message: '...' } }`. Verify no invoice data leaks in the response body.                                    |           |
| 4.8  | Attempt `curl <api>/v1/finance/payments` as parent                                                                                                  | 403 FORBIDDEN.                                                                                                                                                    |           |
| 4.9  | Attempt `curl <api>/v1/finance/refunds` as parent                                                                                                   | 403 FORBIDDEN.                                                                                                                                                    |           |
| 4.10 | Attempt `curl <api>/v1/finance/household-statements/<own-id>` as parent                                                                             | 403 FORBIDDEN — the parent can only read statements via their own `/v1/parent/*` surface, which is more restricted than the admin endpoint.                       |           |
| 4.11 | Attempt `curl <api>/v1/finance/credit-notes` as parent                                                                                              | 403 FORBIDDEN.                                                                                                                                                    |           |
| 4.12 | Attempt `curl <api>/v1/finance/dashboard` as parent                                                                                                 | 403 FORBIDDEN. Parent does NOT have `finance.view` permission and MUST NOT see tenant-wide financial KPIs.                                                        |           |
| 4.13 | Shell-only affordance check — search the parent DOM for "Generate Fees", "Write off", "Approve refund", "Void invoice", "Bulk issue", "Audit trail" | NONE of these strings appear in any parent-rendered DOM. Those are admin-only labels.                                                                             |           |
| 4.14 | Navigation bar check                                                                                                                                | The school shell's top-level nav for a parent MUST NOT include a "Finance" entry. Finance is surfaced only as the Finances tab inside the parent dashboard.       |           |

---

## 5. Parent Dashboard — Tabs & Navigation

| #   | What to Check                                 | Expected Result                                                                                                                                    | Pass/Fail |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Initial render with at least 1 linked student | `<nav>` renders with four buttons: `overview` (GraduationCap icon), `grades` (FileText), `timetable` (Calendar), `finances` (CreditCard).          |           |
| 5.2 | No linked students (PA3 fixture)              | Tab bar is NOT rendered. A single empty-state illustration renders, instructing the parent that no students are linked yet.                        |           |
| 5.3 | Click Finances tab                            | `activeTab` becomes `finances`. Content area renders `<FinancesTab>`. Underline indicator moves to the Finances button (border-primary).           |           |
| 5.4 | Click Overview tab                            | Returns to the overview. `<FinancesTab>` unmounts (data in state is retained but the component tree is torn down).                                 |           |
| 5.5 | Keyboard navigation                           | Tab + Enter on each button switches tabs. `aria-selected` / `role="tab"` attributes present (verify via DevTools accessibility tree).              |           |
| 5.6 | Active tab styling                            | Active tab button has `border-primary text-primary`; inactive has `border-transparent text-text-secondary`. -mb-px ensures the underline aligns.   |           |
| 5.7 | Icon rendering                                | Each tab shows its lucide-react icon (`h-4 w-4`) left of the label; in RTL, icon is on the right of the label (logical `me-2` / `ms-0` mirroring). |           |
| 5.8 | Tab hover                                     | Inactive tabs change to `text-text-primary` on hover. Active tab keeps its primary color.                                                          |           |

---

## 6. Parent Dashboard — Action Center (Overview tab)

The overview tab fires three parallel fetches used for the Action Center summary cards. These fetches run even when the user never clicks the Finances tab.

| #   | What to Check                                       | Expected Result                                                                                                                                                        | Pass/Fail |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | On overview mount                                   | Three parallel requests fire: `GET /api/v1/parent/engagement/pending-forms`, `GET /api/v1/parent/engagement/events?page=1&pageSize=20`, `GET /api/v1/parent/finances`. |           |
| 6.2 | `outstandingPayments` calculation                   | Equals `financeResponse.data.invoices.filter(i => ['issued','partially_paid','overdue'].includes(i.status)).length`. Rendered in the Action Center card.               |           |
| 6.3 | Outstanding payment count = 0 fixture               | If parent has no issued/partially_paid/overdue invoices, the Action Center card shows `0` or the card is hidden per the Action Center component rules.                 |           |
| 6.4 | Outstanding payment count > 0 fixture (PA1 fixture) | Card shows `3` (INV-A1 + INV-A2 + INV-A3). Voided / paid / written-off / draft / pending_approval invoices are NOT counted.                                            |           |
| 6.5 | `GET /api/v1/parent/finances` fails                 | Action Center gracefully degrades: `outstandingPayments = 0`. Console logs `[DashboardParentPage]` error. No user-visible crash.                                       |           |
| 6.6 | Click the "Outstanding payments" Action Center tile | Sets `activeTab = 'finances'` (or navigates to the tab if the tile is a link). Confirm exact behaviour with product.                                                   |           |

---

## 7. Finances Tab — Loading / Empty / Error States

| #   | What to Check                                                  | Expected Result                                                                                                                                                                             | Pass/Fail |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | Click Finances tab for the first time                          | Component mounts. `isLoading === true`. Three skeleton cards render with `h-20 animate-pulse rounded-2xl bg-surface-secondary`.                                                             |           |
| 7.2 | Request resolves with data                                     | Skeleton clears. Outstanding balance card + invoices section + payment history section render.                                                                                              |           |
| 7.3 | Request 500s                                                   | Console logs `[FinancesTab]` error. `<EmptyState icon={CreditCard} title={t('parentDashboard.financesUnavailable')} description={t('parentDashboard.financesUnavailableDesc')} />` renders. |           |
| 7.4 | Request 403s (parent lost permission mid-session)              | Empty state renders (same as above). Optionally: session-refresh flow kicks in if the 403 is due to expired JWT.                                                                            |           |
| 7.5 | Response has `invoices: []` and `payments: []` (new parent)    | Outstanding balance card renders `0.00 {currency}`. Invoices section renders `<EmptyState icon={FileText} title={noInvoices}>`. Payment history shows `{noPayments}` paragraph.             |           |
| 7.6 | Response has `stripe_enabled: false`                           | Invoice cards for unpaid invoices show `t('parentDashboard.contactSchoolForPayment')` instead of a Pay Now button. Request Payment Plan button STILL shows.                                 |           |
| 7.7 | Rapid tab-switching between overview/grades/timetable/finances | `GET /api/v1/parent/finances` fires at most once (tab unmount does NOT clear the data state). After initial load, re-clicking the tab does not re-fire.                                     |           |

---

## 8. Finances Tab — Outstanding Balance Card

| #   | What to Check          | Expected Result                                                                                                                                                             | Pass/Fail |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Balance > 0            | Card renders with `text-danger-700` color. Value formatted `toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })`. Wrapped in `<p dir="ltr">`. |           |
| 8.2 | Balance = 0            | Color switches to `text-success-700`. Value `0.00 EUR` (or tenant currency).                                                                                                |           |
| 8.3 | Currency code rendered | Rendered as a suffix after the number (e.g. `420.00 EUR`). NOT wrapped in `<CurrencyDisplay>` (this tab uses raw toLocaleString per `finances-tab.tsx` line 217).           |           |
| 8.4 | Label                  | Small `text-sm font-medium text-text-secondary` with `t('parentDashboard.outstandingBalance')`.                                                                             |           |
| 8.5 | RTL locale             | Value stays LTR (the `dir="ltr"` on the `<p>` guarantees this). Label flows right-to-left in Arabic.                                                                        |           |
| 8.6 | Outer container        | `rounded-2xl border border-border bg-surface p-6`.                                                                                                                          |           |
| 8.7 | Numerals policy        | Always Western numerals (0-9) — never Arabic-Indic digits, even in `ar` locale. Matches CLAUDE.md permanent constraint.                                                     |           |

---

## 9. Finances Tab — Invoices List (card layout)

Invoices are rendered as a vertical stack of cards, one per invoice, sorted as the API returns them (most recent first).

| #    | What to Check                                            | Expected Result                                                                                                                                                        | Pass/Fail |
| ---- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1  | Section title                                            | `<h3>` with `t('parentDashboard.invoices')`.                                                                                                                           |           |
| 9.2  | Card container                                           | `flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center` — mobile stacked, desktop side-by-side.                               |           |
| 9.3  | Invoice number                                           | `font-mono text-xs font-medium text-text-secondary`. Prefix per tenant branding (e.g. `INV-202604-000042`).                                                            |           |
| 9.4  | Invoice description                                      | Renders only when non-null. `mt-0.5 text-sm text-text-secondary`.                                                                                                      |           |
| 9.5  | Due date line                                            | `mt-1 text-xs text-text-tertiary`. Format: `{tf('date')}: {formatDate(invoice.due_date)}`. `formatDate` uses locale — verify Arabic locale shows Arabic month name.    |           |
| 9.6  | Balance amount                                           | Right-aligned within the card's right column. `text-sm font-semibold text-text-primary` inside `<p dir="ltr">`. Format `toLocaleString(...)` with 2dp + currency code. |           |
| 9.7  | Partial payment indicator                                | When `balance_amount !== total_amount`, a sub-line renders `{t('of')} {total toLocaleString}`. Both values LTR.                                                        |           |
| 9.8  | Fully paid invoice                                       | Balance equals total → the "of total" sub-line is hidden. Only the full total displays.                                                                                |           |
| 9.9  | Invoices statuses that MUST be filtered out of this list | `draft`, `pending_approval` must NEVER appear — the backend filters these out. Verify by inspecting the response body and the DOM.                                     |           |
| 9.10 | Invoices that SHOULD appear                              | `issued`, `partially_paid`, `paid`, `overdue`, `void`, `cancelled`, `written_off` — but only the first four are actionable. Verify all appear in the response.         |           |
| 9.11 | Empty invoices                                           | `<EmptyState icon={FileText} title={t('parentDashboard.noInvoices')} description={t('parentDashboard.noInvoicesDesc')} />` renders below the section title.            |           |
| 9.12 | Long invoice description                                 | Text wraps (no truncation). Card grows vertically. Balance stays right-aligned on desktop, stacks below on mobile.                                                     |           |

---

## 10. Finances Tab — Invoice Status Badge & Variant Map

The parent tab maps `InvoiceStatus` → `StatusBadge` variant via `invoiceStatusVariant` (file `finances-tab.tsx` lines 63-76).

| #     | Status             | Expected Variant | Expected Label (via `.replace(/_/g, ' ')`)                                                                              | Pass/Fail |
| ----- | ------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1  | `draft`            | `neutral`        | "draft" — **this status should not appear in parent list, flag if seen**                                                |           |
| 10.2  | `pending_approval` | `warning`        | "pending approval" — **ditto, flag if seen**                                                                            |           |
| 10.3  | `issued`           | `info`           | "issued"                                                                                                                |           |
| 10.4  | `partially_paid`   | `warning`        | "partially paid"                                                                                                        |           |
| 10.5  | `paid`             | `success`        | "paid"                                                                                                                  |           |
| 10.6  | `overdue`          | `danger`         | "overdue"                                                                                                               |           |
| 10.7  | `void`             | `neutral`        | "void"                                                                                                                  |           |
| 10.8  | `cancelled`        | `neutral`        | "cancelled"                                                                                                             |           |
| 10.9  | `written_off`      | `info`           | "written off"                                                                                                           |           |
| 10.10 | Observation flag   | —                | Labels are NOT translated — they use raw `.replace(/_/g, ' ')`. Arabic users will see English labels here. Flag in §29. |           |
| 10.11 | Badge `dot` prop   | All variants     | The badge always renders `<StatusBadge status={variant} dot>` → small coloured dot prefix to the label.                 |           |

---

## 11. Finances Tab — "Pay Now" (Stripe Checkout)

"Pay Now" is visible when `stripe_enabled === true` and the invoice status is one of `issued | partially_paid | overdue`.

| #     | What to Check                                                | Expected Result                                                                                                                                                                                                                     | Pass/Fail |
| ----- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1  | Button render                                                | Primary button, `size="sm"`, label `{tf('payNow')}` with `<CreditCard className="me-1.5 h-3.5 w-3.5" />` icon prefix. RTL flips to `ms-1.5`.                                                                                        |           |
| 11.2  | Click → request fires                                        | `POST /api/v1/parent/finances/invoices/{invoice_id}/checkout` (observation: frontend uses `/parent/finances/invoices/...` but backend exposes `/parent/invoices/.../pay` — flag in §29).                                            |           |
| 11.3  | Request payload                                              | Empty body per `finances-tab.tsx:110`. (Observation: the parent-finance controller schema `checkoutSessionSchema` requires `{ success_url, cancel_url }` — flag bug.)                                                               |           |
| 11.4  | Response success                                             | `{ checkout_url: string }` → `window.location.href = res.checkout_url` (full-page redirect to Stripe).                                                                                                                              |           |
| 11.5  | Response failure (500 / 400 / 403 / 404)                     | Toast error with `tf('paymentRecordFailed')`. `payingId` resets to `null`. No redirect occurs.                                                                                                                                      |           |
| 11.6  | Button while waiting                                         | Disabled. `<CreditCard>` replaced with `<Loader2 className="... animate-spin" />`. `payingId === invoice.id`.                                                                                                                       |           |
| 11.7  | Two Pay Now buttons clicked in quick succession              | Only the most recent click drives `payingId`. Both buttons are disabled while one is active (because `disabled={payingId === invoice.id}` is per-invoice, but the first click starts the redirect before the second is registered). |           |
| 11.8  | Stripe disabled at tenant level (`stripe_enabled = false`)   | Button does NOT render. Instead a hint span `t('parentDashboard.contactSchoolForPayment')` shows. Request Payment Plan button still renders.                                                                                        |           |
| 11.9  | Invoice status `paid` / `void` / `cancelled` / `written_off` | Action buttons section does not render (the `isUnpaid` guard excludes these statuses).                                                                                                                                              |           |
| 11.10 | Re-click Pay Now after redirect-back                         | New checkout session is created each time — the endpoint MUST NOT return a stale `checkout_url` from a previous session. Verify with two sequential attempts.                                                                       |           |
| 11.11 | Attempt to pay another household's invoice (cross-household) | If PA1 crafts a request with `H-A2`'s invoice id, backend MUST return 403 `INVOICE_ACCESS_DENIED` (verified in §21). UI never surfaces this path; manual curl test only.                                                            |           |

---

## 12. Stripe Checkout — Round-Trip & Success URL

After the parent completes payment on Stripe's hosted page, Stripe redirects the browser back to the configured `success_url`.

| #     | What to Check                                                     | Expected Result                                                                                                                                                                                                                              | Pass/Fail |
| ----- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1  | Configured success URL                                            | Determined by backend at session creation. Expected pattern `https://<tenant>.edupod.app/{locale}/dashboard/parent?payment=success&invoice={id}`.                                                                                            |           |
| 12.2  | Complete Stripe test card `4242 4242 4242 4242`                   | Stripe processes the payment. Redirects back to success URL within ~3-5s.                                                                                                                                                                    |           |
| 12.3  | Landing on `?payment=success`                                     | Parent dashboard loads. Toast success "Payment received" (or equivalent). Finances tab auto-selects OR overview shows updated outstanding total.                                                                                             |           |
| 12.4  | `GET /api/v1/parent/finances` after redirect                      | Fires fresh on next tab activation. New outstanding balance reflects the payment (may be eventually-consistent if the webhook hasn't processed yet).                                                                                         |           |
| 12.5  | Webhook race                                                      | If the user lands back before the `checkout.session.completed` webhook has been delivered, outstanding may still show the pre-payment balance. Polling is NOT implemented — parent manually refreshes. Flag in §29 if product wants polling. |           |
| 12.6  | Invoice card refreshes after balance update                       | Once the webhook processes, the next `GET /parent/finances` reflects the new `partially_paid` or `paid` status and updated balance.                                                                                                          |           |
| 12.7  | Payment History row appears                                       | New row shows the Stripe payment with reference `PAY-YYYYMM-xxxxx` (or tenant-prefixed), `received_at` ≈ now, `amount` = paid amount, download button.                                                                                       |           |
| 12.8  | Stripe test card with 3D Secure challenge (`4000 0025 0000 3155`) | Stripe prompts for the challenge. After approval, round-trip completes as in 12.3.                                                                                                                                                           |           |
| 12.9  | Amount paid = invoice balance exactly                             | Invoice transitions `issued`/`partially_paid`/`overdue` → `paid` after webhook. Balance becomes 0. Payment method = `stripe`. Payment `external_provider = 'stripe'`, `external_event_id` set to the Stripe payment intent id.               |           |
| 12.10 | Amount paid < balance                                             | Invoice becomes `partially_paid`. New balance = old_balance − amount_paid ± 0.01.                                                                                                                                                            |           |
| 12.11 | Locale preserved                                                  | Round-trip preserves `{locale}` in the URL — Arabic users land back on the Arabic dashboard, not default locale.                                                                                                                             |           |

---

## 13. Stripe Checkout — Cancel URL & Error Paths

| #    | What to Check                                               | Expected Result                                                                                                                                                                                   | Pass/Fail |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Parent clicks "Back" on Stripe hosted page                  | Redirects to `cancel_url` → pattern `https://<tenant>.edupod.app/{locale}/dashboard/parent?payment=cancelled`. Toast info (or silent).                                                            |           |
| 13.2 | Outstanding balance unchanged                               | No payment row created. Invoice status unchanged. `GET /parent/finances` returns the same data.                                                                                                   |           |
| 13.3 | Stripe test card `4000 0000 0000 0002` (declined)           | Stripe shows the failure screen. Cancel/return flow applies. Outstanding balance unchanged.                                                                                                       |           |
| 13.4 | Stripe test card `4000 0000 0000 9995` (insufficient funds) | Same as 13.3.                                                                                                                                                                                     |           |
| 13.5 | Network loss mid-redirect                                   | User stays on Stripe's hosted page or sees a generic error. No application-side data change. Subsequent `GET /parent/finances` is consistent.                                                     |           |
| 13.6 | Cancel session server-side (manual Stripe dashboard action) | Webhook `checkout.session.expired` is handled (covered in `/e2e-integration`). Parent UI is unaffected until next data fetch.                                                                     |           |
| 13.7 | Duplicate Pay Now (user clicks twice before redirect)       | First click starts the redirect; second click races. Backend creates at most one `checkout_session` per invoice/time-window — race protection covered in `/e2e-integration`. UI observation only. |           |

---

## 14. Finances Tab — "Request Payment Plan" Modal

The button is visible alongside "Pay Now" when the invoice status is `issued | partially_paid | overdue`. It opens a modal.

| #    | What to Check                | Expected Result                                                                                                                                                | Pass/Fail |
| ---- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------- | --- |
| 14.1 | Button                       | Outline, `size="sm"`, label `{tf('paymentPlans.requestPlan')}`. Always rendered for unpaid invoices (independent of `stripe_enabled`).                         |           |
| 14.2 | Click opens modal            | `<Dialog open={true}>` with `sm:max-w-lg`. Title `{tf('paymentPlans.requestTitle')}`.                                                                          |           |
| 14.3 | Description sentence         | ICU interpolation: `{tf('paymentPlans.requestDescription', { number: invoice_number, amount: balance_amount.toLocaleString(...), currency: currency_code })}`. |           |
| 14.4 | Seed state                   | 2 empty installments (due_date `""`, amount `0`). Reason textarea empty. Submit button disabled.                                                               |           |
| 14.5 | Close with X / click-outside | Modal state resets on next open (`openPlanModal` resets installments + reason).                                                                                |           |
| 14.6 | Cancel button                | `variant="outline"`, label `{tf('cancel')}`. Closes modal without submitting. Disabled while `submittingPlan === true`.                                        |           |
| 14.7 | Submit button label          | `{tf('paymentPlans.submitRequest')}`. When submitting, prepends `<Loader2 className="me-2 h-4 w-4 animate-spin" />`.                                           |           |
| 14.8 | Submit disabled condition    | `disabled={submittingPlan                                                                                                                                      |           | !planReason}` — cannot submit until reason is non-empty. |     |
| 14.9 | Reason textarea              | 3 rows, placeholder `{tf('paymentPlans.reasonPlaceholder')}`.                                                                                                  |           |

---

## 15. Payment Plan Request — Installments Editor

| #     | What to Check                          | Expected Result                                                                                                                                        | Pass/Fail |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------------------------- | --- |
| 15.1  | Initial installment count              | 2 rows rendered.                                                                                                                                       |           |
| 15.2  | Add Installment button                 | Appends a new `{ due_date: '', amount: 0 }` row. No upper bound enforced client-side; verify backend rejects > N per business rule.                    |           |
| 15.3  | Remove installment (×)                 | Only visible when `planInstallments.length > 2`. Removes the row. Cannot reduce below 2.                                                               |           |
| 15.4  | Date input                             | `<input type="date">` styled with `flex-1 rounded-lg border ...`. Parses to `YYYY-MM-DD`.                                                              |           |
| 15.5  | Amount input                           | `<input type="number" min="0.01" step="0.01">` with `dir="ltr"`. Width `w-28` (desktop) / `w-full` wouldn't fit the row layout.                        |           |
| 15.6  | Amount parsing                         | `parseFloat(value)                                                                                                                                     |           | 0` — empty string becomes 0. |     |
| 15.7  | Zero / empty installments              | Rows with empty `due_date` OR `amount <= 0` are filtered out at submit time (`filter((i) => i.due_date && i.amount > 0)`).                             |           |
| 15.8  | Filtered-to-zero                       | If EVERY row gets filtered (all empty), the POST goes with `proposed_installments: []` — backend MUST reject with 400 `INVALID_INSTALLMENTS` (verify). |           |
| 15.9  | Sum of installments vs invoice balance | Client does not validate sum = balance. The server SHOULD reject sum ≠ balance (verify in `/e2e-integration`). Spec flags this as a gap.               |           |
| 15.10 | Date before invoice due_date           | Client does not validate. Server behaviour documented in `/e2e-integration`.                                                                           |           |
| 15.11 | Max installment count                  | Document-only: if product enforces a cap (e.g. max 12), confirm backend rejects beyond that. Client has no cap.                                        |           |
| 15.12 | Add/remove rapid sequence              | State updates are functional (`setPlanInstallments((prev) => ...)`); no stale-closure bugs when adding/removing quickly.                               |           |

---

## 16. Payment Plan Request — Submit & Lifecycle

| #     | What to Check                      | Expected Result                                                                                                                                                                | Pass/Fail |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 16.1  | Submit with valid inputs           | `POST /api/v1/parent/finances/payment-plan-requests` (observation: backend exposes `POST /v1/parent/invoices/:id/request-payment-plan` — endpoint mismatch, flag in §29).      |           |
| 16.2  | Request body                       | `{ invoice_id, proposed_installments: [...], reason }` per `finances-tab.tsx:167`.                                                                                             |           |
| 16.3  | Success                            | Toast `{tf('paymentPlans.requestSubmitted')}`. Modal closes. `submittingPlan = false`.                                                                                         |           |
| 16.4  | Failure                            | Toast error `{tf('paymentPlans.requestFailed')}`. Console logs `[FinancesTab]`. Modal stays open.                                                                              |           |
| 16.5  | Validation error at client         | Empty reason + submit click → toast `{tf('paymentPlans.validationError')}` (checked in `handleSubmitPlan`).                                                                    |           |
| 16.6  | Duplicate request for same invoice | Second submission → backend responds 409 `DUPLICATE_PAYMENT_PLAN_REQUEST` (verify). UI surfaces toast error.                                                                   |           |
| 16.7  | Payment plan status after submit   | Backend creates `payment_plan_requests` row with `status = 'pending'`. Admin-side sees it in the pending queue (verified in admin spec §66-§67).                               |           |
| 16.8  | After plan is approved by admin    | `status = 'active'`. Parent sees the plan details somewhere — observation: the parent tab does NOT currently render pending/active plans. Flag if product wants this surfaced. |           |
| 16.9  | After plan is rejected             | Parent sees the rejection somewhere. Same observation as 16.8 — current UI does not expose plan states.                                                                        |           |
| 16.10 | After plan is counter-offered      | The parent must be able to accept the counter via the endpoint `POST /v1/parent/payment-plans/:id/accept`. UI surface for this is NOT built yet — flag.                        |           |

---

## 17. Payment Plan — Accept Counter-Offer

Backend endpoint `POST /v1/parent/payment-plans/:id/accept` exists. The current parent UI has NO button for it. This section documents the expected behaviour once the UI is built.

| #    | What to Check    | Expected Result                                                                                                                               | Pass/Fail |
| ---- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1 | Build status     | Currently UNBUILT in the FinancesTab. Parent has NO way to accept a counter-offer through the UI. Tester marks this row FAIL to flag the gap. |           |
| 17.2 | Backend endpoint | `POST /v1/parent/payment-plans/:id/accept` with `@RequiresPermission('parent.view_finances')`. Verified by admin spec tester via curl.        |           |
| 17.3 | Success response | Plan status transitions `counter_offered` → `active`. Backend verifies current user is the `requested_by_parent_id` for that plan.            |           |
| 17.4 | Not-owner case   | Parent PA2 attempts to accept PA1's plan → backend returns 403 or 404. Verify in `/e2e-integration`.                                          |           |

---

## 18. Finances Tab — Payment History Table

| #     | What to Check        | Expected Result                                                                                                                                                | Pass/Fail |
| ----- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1  | Section title        | `<h3>` with `t('parentDashboard.paymentHistory')`.                                                                                                             |           |
| 18.2  | Table container      | `overflow-x-auto rounded-xl border border-border`.                                                                                                             |           |
| 18.3  | Table                | `<table className="w-full text-sm">` with 4 columns: Reference, Date, Amount, Actions.                                                                         |           |
| 18.4  | Column 1 — reference | Monospace xs, text-text-secondary. Format matches backend generator e.g. `REC-202604-000017`.                                                                  |           |
| 18.5  | Column 2 — date      | `formatDate(payment.received_at)` — locale-aware.                                                                                                              |           |
| 18.6  | Column 3 — amount    | Right-aligned, monospace, semibold, primary color. `<td dir="ltr">`. Format `toLocaleString(...)` with 2dp + currency code suffix.                             |           |
| 18.7  | Column 4 — actions   | Ghost button, size sm, icon `<Download className="me-1 h-3.5 w-3.5">` + label `{t('parentDashboard.receipt')}`.                                                |           |
| 18.8  | Empty state          | `{noPayments}` paragraph, not an EmptyState component.                                                                                                         |           |
| 18.9  | Status filter        | Backend returns only `['posted', 'refunded_partial', 'refunded_full']` per `parent-finance.controller.ts:69`. `pending` / `failed` / `voided` MUST NOT appear. |           |
| 18.10 | Sort order           | Descending by `received_at` per controller `orderBy: { received_at: 'desc' }`. Most recent at top.                                                             |           |
| 18.11 | Pagination           | Controller caps at `take: 50`. No pagination UI — if a parent has > 50 payments, older ones are hidden. Flag if product wants pagination.                      |           |
| 18.12 | Currency consistency | Every row's currency_code should be identical per household. Verify all rows show the same currency.                                                           |           |
| 18.13 | Refunded payment row | `status = refunded_partial` or `refunded_full` — row still shows the ORIGINAL amount paid. Refunds are NOT deducted from the displayed amount.                 |           |

---

## 19. Finances Tab — Receipt Download

| #    | What to Check                  | Expected Result                                                                                                                                                                                | Pass/Fail |
| ---- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | Click Download                 | Sets `downloadingId = payment.id`. `window.open(\`${baseUrl}/api/v1/parent/finances/payments/${paymentId}/receipt\`, '\_blank')` opens a new tab.                                              |           |
| 19.2 | URL base                       | Uses `process.env.NEXT_PUBLIC_API_URL` (falls back to `""`). In production, absolute URL to API host.                                                                                          |           |
| 19.3 | Endpoint mismatch (bug)        | **Frontend calls `/parent/finances/payments/:id/receipt`; backend has `/parent/students/:studentId/finances` etc. but NO receipt download endpoint for parents.** This is a bug — flag in §29. |           |
| 19.4 | Button state                   | Disabled while `downloadingId === payment.id`. The client immediately resets it after `window.open` returns, so the disabled state is ~instant.                                                |           |
| 19.5 | Auth flow for receipt download | `window.open` opens in a new tab — JWT in memory does NOT transfer to the new tab. Either the cookie-based auth picks up, OR the download fails. Test both paths.                              |           |
| 19.6 | Receipt PDF opens in new tab   | If auth passes, Content-Type `application/pdf`, Content-Disposition `inline; filename=\"receipt-REC-YYYYMM-xxxxx.pdf\"`. Browser renders inline PDF viewer.                                    |           |
| 19.7 | Cross-household attempt        | Parent PA1 crafts a receipt URL for PA2's payment → backend MUST return 403 / 404. Verify in §21.                                                                                              |           |
| 19.8 | Cross-tenant attempt           | Parent PA1 crafts a receipt URL against `test-b.edupod.app` → 404 or 403. Verify in §22.                                                                                                       |           |

---

## 20. Receipt PDF — Content & Branding

Parent receipts are assumed to use the same rendering pipeline as admin receipts. Deep content verification lives in `/e2e-integration`; this row set covers visible checks.

| #     | What to Check              | Expected Result                                                                                                          | Pass/Fail |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 20.1  | PDF opens in new tab       | Browser native PDF viewer renders it. No parsing errors.                                                                 |           |
| 20.2  | Tenant logo                | Present at top-left (LTR) / top-right (RTL). Matches `tenantBranding.logo_url`.                                          |           |
| 20.3  | Tenant name                | `tenantBranding.display_name` ("Nurul Huda Quality School" for Tenant A).                                                |           |
| 20.4  | Receipt number             | Matches DB `receipts.receipt_number`. Prefix per `tenantBranding.receipt_prefix`.                                        |           |
| 20.5  | Household & billing parent | Shows household_name + billing_parent_name (parent's own household).                                                     |           |
| 20.6  | Paid amount & currency     | Formatted with the household's currency. 2dp.                                                                            |           |
| 20.7  | Date                       | `issued_at` formatted per template locale (`?locale=ar` → Arabic).                                                       |           |
| 20.8  | Arabic (RTL) locale        | Open the receipt via `?locale=ar` — template direction flips, Arabic text renders, numerics stay LTR (Western numerals). |           |
| 20.9  | Allocation breakdown       | If the payment is allocated across multiple invoices, the receipt lists each allocation with invoice number + amount.    |           |
| 20.10 | Support email / phone      | From `tenantBranding.support_email` / `tenantBranding.support_phone`. Both LTR.                                          |           |
| 20.11 | Copy/save PDF              | User can save the PDF locally. File size reasonable (< 200KB typical per the /e2e-perf spec budget).                     |           |

---

## 21. Cross-Household Isolation — Parent Can Only See Own Data

This is the single most important section for the parent spec. A parent MUST NOT be able to read another household's finances in the same tenant.

| #     | What to Check                                                                                       | Expected Result                                                                                                                                                            | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.1  | Login as PA1 (linked to H-A1) — hit `GET /parent/finances`                                          | Response contains ONLY H-A1's invoices + payments. No H-A2 rows present.                                                                                                   |           |
| 21.2  | Login as PA2 (linked to H-A2) — hit `GET /parent/finances`                                          | Response contains ONLY H-A2's data.                                                                                                                                        |           |
| 21.3  | PA1 attempts `POST /parent/invoices/{INV-A2-H-A2}/pay` via curl (where INV-A2-H-A2 belongs to H-A2) | 403 `INVOICE_ACCESS_DENIED` per `parent-finance.controller.ts:220`. No checkout_session created.                                                                           |           |
| 21.4  | PA1 attempts `POST /parent/invoices/{INV-A2-H-A2}/request-payment-plan` via curl                    | 403 `INVOICE_ACCESS_DENIED`. No `payment_plan_requests` row created.                                                                                                       |           |
| 21.5  | PA1 attempts `GET /parent/finances/payments/{PAYMENT-H-A2}/receipt` via curl                        | Receipt endpoint (if it exists — currently a frontend-only path per §19.3) MUST reject. Document expected 403/404.                                                         |           |
| 21.6  | PA1 sees no H-A2 invoice numbers in the DOM                                                         | Search the entire rendered DOM for any invoice number belonging to H-A2 — must not exist.                                                                                  |           |
| 21.7  | Browser DevTools "Application" storage                                                              | No cached data from H-A2. `react-query` / local state is scoped to the authenticated user.                                                                                 |           |
| 21.8  | Switch accounts in the same browser (logout PA1 → login PA2)                                        | After login PA2, `/parent/finances` returns H-A2 data. No leak from PA1's cached state.                                                                                    |           |
| 21.9  | Parent with TWO linked students in different households                                             | Fixture-dependent. If PA1 is linked to SA1 (H-A1) AND SA2 (H-A2), `parent-finance.controller.ts:202-210` aggregates household_ids — parent sees BOTH households' invoices. |           |
| 21.10 | Removed link                                                                                        | After `parent_student_links.delete`, PA1 loses access to that student's household. Next `GET /parent/finances` returns only remaining households.                          |           |

---

## 22. Cross-Tenant Isolation — Parent Cannot Enumerate Other Tenants

| #    | What to Check                                                                  | Expected Result                                                                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 22.1 | PA1 (Tenant A) logs in via `https://nhqs.edupod.app`                           | JWT issued with `tenant_id` = Tenant A's id. Session establishes.                                                                                                                                        |           |
| 22.2 | PA1 re-uses the JWT against `https://test-b.edupod.app/api/v1/parent/finances` | 401 / 403. Token's `tenant_id` mismatches host tenant. No cross-tenant data returned.                                                                                                                    |           |
| 22.3 | Database-level isolation                                                       | `SELECT * FROM invoices WHERE household_id = '<H-B1-id>'` returning data to PA1 is impossible because RLS forces `tenant_id = current_setting('app.current_tenant_id')`. Verified in `/e2e-integration`. |           |
| 22.4 | Request with forged `tenant_id` body param                                     | Backend ignores body `tenant_id` — always uses the session's tenant context. Tested via manipulated POST to `/parent/invoices/{id}/pay`.                                                                 |           |
| 22.5 | Checkout session metadata                                                      | Stripe `session.metadata.tenant_id` is set server-side to the session tenant, NOT to any user-provided value. Verified in `/e2e-integration` webhook tests.                                              |           |
| 22.6 | Parent directly types another tenant's URL                                     | Redirect to tenant A's login (or generic login). No tenant B data surfaced.                                                                                                                              |           |
| 22.7 | Cookie scoping                                                                 | `refresh_token` cookie `Domain=.edupod.app` — browser may send it on sub-subdomains but backend rejects on tenant mismatch. Confirm by reading the cookie's SameSite and Domain attrs.                   |           |

---

## 23. Permission Guard Tests (Negative Assertions)

These are explicit "parent must NOT" checks. Each row = one attack surface.

| #     | What to Check                                                  | Expected Result                                                                                                      | Pass/Fail |
| ----- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------- |
| 23.1  | Parent attempts `POST /v1/finance/invoices` (admin create)     | 403 FORBIDDEN. Missing `finance.manage`.                                                                             |           |
| 23.2  | Parent attempts `PATCH /v1/finance/invoices/:id`               | 403. Missing `finance.manage`.                                                                                       |           |
| 23.3  | Parent attempts `POST /v1/finance/invoices/:id/issue`          | 403.                                                                                                                 |           |
| 23.4  | Parent attempts `POST /v1/finance/invoices/:id/void`           | 403.                                                                                                                 |           |
| 23.5  | Parent attempts `POST /v1/finance/invoices/:id/write-off`      | 403.                                                                                                                 |           |
| 23.6  | Parent attempts `POST /v1/finance/payments`                    | 403. Missing `finance.manage`.                                                                                       |           |
| 23.7  | Parent attempts `POST /v1/finance/payments/:id/allocations`    | 403.                                                                                                                 |           |
| 23.8  | Parent attempts `GET /v1/finance/payments`                     | 403. Missing `finance.view`.                                                                                         |           |
| 23.9  | Parent attempts `POST /v1/finance/refunds`                     | 403. Missing `finance.issue_refunds`.                                                                                |           |
| 23.10 | Parent attempts `POST /v1/finance/refunds/:id/approve`         | 403.                                                                                                                 |           |
| 23.11 | Parent attempts `GET /v1/finance/refunds`                      | 403. Missing `finance.view`.                                                                                         |           |
| 23.12 | Parent attempts `POST /v1/finance/credit-notes`                | 403. Missing `finance.manage_credit_notes`.                                                                          |           |
| 23.13 | Parent attempts `POST /v1/finance/credit-notes/apply`          | 403.                                                                                                                 |           |
| 23.14 | Parent attempts `POST /v1/finance/fee-structures`              | 403.                                                                                                                 |           |
| 23.15 | Parent attempts `POST /v1/finance/fee-generation/preview`      | 403.                                                                                                                 |           |
| 23.16 | Parent attempts `POST /v1/finance/fee-generation/confirm`      | 403.                                                                                                                 |           |
| 23.17 | Parent attempts `POST /v1/finance/scholarships`                | 403.                                                                                                                 |           |
| 23.18 | Parent attempts `POST /v1/finance/bulk/issue`                  | 403. Missing `finance.bulk_operations`.                                                                              |           |
| 23.19 | Parent attempts `POST /v1/finance/bulk/export`                 | 403.                                                                                                                 |           |
| 23.20 | Parent attempts `GET /v1/finance/audit-trail`                  | 403.                                                                                                                 |           |
| 23.21 | Parent attempts `GET /v1/finance/dashboard`                    | 403. Missing `finance.view`.                                                                                         |           |
| 23.22 | Parent attempts `GET /v1/finance/dashboard/debt-breakdown`     | 403.                                                                                                                 |           |
| 23.23 | Parent attempts `GET /v1/finance/reports/aging`                | 403. Missing `finance.view_reports`.                                                                                 |           |
| 23.24 | Parent attempts `GET /v1/finance/reports/custom`               | 403.                                                                                                                 |           |
| 23.25 | Parent attempts `POST /v1/finance/reminders/due-soon`          | 403. Missing `finance.manage`.                                                                                       |           |
| 23.26 | Parent attempts `POST /v1/finance/invoices/:id/apply-late-fee` | 403.                                                                                                                 |           |
| 23.27 | Parent without `parent.view_finances` permission               | `GET /v1/parent/finances` returns 403. UI shows the "unavailable" empty state.                                       |           |
| 23.28 | Parent without `parent.make_payments` permission               | `POST /parent/invoices/:id/pay` returns 403. UI MUST hide the Pay Now button for a parent who lacks this permission. |           |
| 23.29 | JWT with tampered `permissions` claim                          | JWT signature verification fails → 401 `INVALID_TOKEN`.                                                              |           |

---

## 24. Arabic / RTL Verification

| #     | What to Check                     | Expected Result                                                                                                                                             | Pass/Fail |
| ----- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 24.1  | `/ar/dashboard/parent` URL        | Page loads with Arabic UI. `<html dir="rtl" lang="ar">`.                                                                                                    |           |
| 24.2  | Finances tab label                | Translated via `t('parentDashboard.financesTab')`. No English fallback.                                                                                     |           |
| 24.3  | Outstanding balance card          | Label translated. Value stays LTR (`<p dir="ltr">`). Western numerals only.                                                                                 |           |
| 24.4  | Invoice card — status badge label | **Observation:** Label uses `invoice.status.replace(/_/g, ' ')` — NOT translated. Arabic users see "issued", "partially paid" etc. in English. Flag in §29. |           |
| 24.5  | Invoice number                    | `<span>` with `font-mono` — LTR read direction because invoice numbers have Latin chars + digits. If no explicit `dir="ltr"`, verify it doesn't reverse.    |           |
| 24.6  | Due date line                     | `formatDate(invoice.due_date)` — Arabic month name if locale is ar. Numerals remain Western per project rule.                                               |           |
| 24.7  | Balance and "of total"            | Both wrapped `<p dir="ltr">`. Currency code stays on the right side in LTR direction inside the LTR wrapper.                                                |           |
| 24.8  | Pay Now button                    | Label `tf('payNow')` translated. Icon `me-1.5` mirrors to the right edge of the label in RTL.                                                               |           |
| 24.9  | Request Payment Plan button       | Label `tf('paymentPlans.requestPlan')` translated.                                                                                                          |           |
| 24.10 | Request Payment Plan modal title  | `tf('paymentPlans.requestTitle')` translated.                                                                                                               |           |
| 24.11 | Description ICU                   | `tf('paymentPlans.requestDescription', { number, amount, currency })` — Arabic text with variables interpolated. Numerics remain LTR.                       |           |
| 24.12 | Installment rows                  | Date input + amount input side by side. In RTL, date is on right, amount on left. `dir="ltr"` is on the amount input only.                                  |           |
| 24.13 | Add Installment / × Remove        | Translated labels. × symbol acceptable cross-locale.                                                                                                        |           |
| 24.14 | Reason textarea + label           | Translated placeholder. Textarea has natural RTL text direction in Arabic locale.                                                                           |           |
| 24.15 | Toast messages (success + error)  | All toasts translated. No English fallback for Arabic users.                                                                                                |           |
| 24.16 | Empty state illustrations         | Icons render identically. Title + description translated.                                                                                                   |           |
| 24.17 | Payment history table             | Column headers translated. Reference column stays LTR (monospace). Date + amount LTR. Download button label `t('parentDashboard.receipt')` translated.      |           |
| 24.18 | Receipt PDF                       | `?locale=ar` — Arabic template loads (see §20.8).                                                                                                           |           |

---

## 25. Mobile Responsiveness (375px Viewport)

Every interactive surface must be usable at 375px (iPhone SE).

| #     | What to Check                          | Expected Result                                                                                                           | Pass/Fail |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| 25.1  | `/en/dashboard/parent` at 375px        | No horizontal scroll. Main content respects `p-4` minimum padding.                                                        |           |
| 25.2  | Tab bar                                | Four tabs fit in the viewport or horizontally scroll. Text wraps if needed. Each tab has ≥ 44px tap height.               |           |
| 25.3  | Outstanding balance card               | Full width. Text reflows. Currency suffix wraps if needed.                                                                |           |
| 25.4  | Invoice cards                          | Stacked vertically (`flex flex-col` without `sm:flex-row`). Balance section drops below metadata section. Actions stack.  |           |
| 25.5  | Action buttons row                     | Pay Now + Request Plan wrap to two lines if needed. Each button ≥ 44×44px.                                                |           |
| 25.6  | Payment history table                  | `overflow-x-auto` wrapper allows horizontal scroll. Receipt action column sticks or scrolls naturally.                    |           |
| 25.7  | Receipt download button                | Icon + label fit. Tap target ≥ 44×44px.                                                                                   |           |
| 25.8  | Payment Plan modal                     | `sm:max-w-lg` — on mobile, modal is near-full-width. Content scrolls vertically. Installment rows stack OK.               |           |
| 25.9  | Date + amount inputs in modal          | Date input full width; amount input `w-28`. Both tap-friendly. Amount keyboard `type=number` triggers numeric pad on iOS. |           |
| 25.10 | Reason textarea                        | Full width. 3 rows, wraps naturally.                                                                                      |           |
| 25.11 | Modal footer buttons                   | Cancel + Submit stack or flow. Each ≥ 44×44px.                                                                            |           |
| 25.12 | No layout shift during skeleton → data | CLS < 0.1 when data resolves.                                                                                             |           |
| 25.13 | Stripe redirect behaviour on mobile    | `window.location.href` full redirect works in mobile Safari. Return URL opens in the same tab.                            |           |
| 25.14 | Receipt PDF opens in mobile Safari     | Safari's in-browser PDF viewer renders; download-to-Files works.                                                          |           |

---

## 26. Console & Network Health

| #     | What to Check                               | Expected Result                                                                                                                                                                | Pass/Fail |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 26.1  | Full pass of the parent finance tab         | Zero uncaught errors in the console. Only deliberate `console.error('[FinancesTab]', err)` / `[DashboardParentPage]` / `[ParentDashboard...]` logs fire on actual error paths. |           |
| 26.2  | No 4xx unless expected                      | Expected 401 only when the user is unauthenticated. Expected 403 only on cross-tenant / cross-household attempts. No 429 rate-limit surprises.                                 |           |
| 26.3  | No 5xx                                      | Every call should resolve to 2xx or a documented error. 5xx is a P0 bug — flag immediately.                                                                                    |           |
| 26.4  | No 404 on known endpoint patterns           | Any 404 on `/api/v1/parent/finances*` paths flags an endpoint-mismatch bug (§29).                                                                                              |           |
| 26.5  | Bundle loaded exactly once                  | No duplicate bundle fetches on tab switches.                                                                                                                                   |           |
| 26.6  | No polling while on non-finance tab         | `GET /parent/finances` does NOT fire on an interval. Only fires on Finances-tab click.                                                                                         |           |
| 26.7  | CORS / credential inclusion                 | Requests include credentials (`Authorization: Bearer <jwt>` header OR cookie). CORS `Access-Control-Allow-Credentials: true` from the API host.                                |           |
| 26.8  | Stripe checkout redirect — browser console  | No mixed-content warnings. No console errors from Stripe's hosted page (out of project scope, but flag if unusual).                                                            |           |
| 26.9  | Network tab cleanliness after Stripe return | After `?payment=success` landing, no spurious re-fetch loops. `GET /parent/finances` fires at most once.                                                                       |           |
| 26.10 | `sessionStorage.clear()` mid-session        | Nothing in sessionStorage is load-bearing — wiping it does not break the session.                                                                                              |           |

---

## 27. Backend Endpoint Map (Parent Surface)

Exercised via the UI (or direct curl for permission tests). Parent-specific endpoints are in `parent-finance.controller.ts` under `@Controller('v1/parent')`.

| Method | Path                                           | Permission                                                                                         | UI Source                                     | Notes                                                                                                                       |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/parent/students/:studentId/finances`      | `parent.view_finances`                                                                             | (not yet consumed)                            | Per-student finance view. Returns `{ household_id, household_name, total_outstanding_balance, invoices, payment_history }`. |
| GET    | `/v1/parent/finances`                          | **UNKNOWN — endpoint MISSING in backend but called from `FinancesTab` & Action Center.** (§29 bug) | `finances-tab.tsx:100`, `parent/page.tsx:166` | Bug candidate.                                                                                                              |
| POST   | `/v1/parent/invoices/:id/pay`                  | `parent.make_payments`                                                                             | (expected from Pay Now)                       | Backend returns `{ session_id, checkout_url }`. Requires `{ success_url, cancel_url }` in body per `checkoutSessionSchema`. |
| POST   | `/v1/parent/finances/invoices/:id/checkout`    | **UNKNOWN — endpoint MISSING in backend.** (§29 bug)                                               | `finances-tab.tsx:110`                        | Bug candidate — frontend path doesn't match backend `/parent/invoices/:id/pay`.                                             |
| GET    | `/v1/parent/finances/payments/:id/receipt`     | **UNKNOWN — endpoint MISSING in backend.** (§29 bug)                                               | `finances-tab.tsx:124`                        | Bug candidate.                                                                                                              |
| POST   | `/v1/parent/invoices/:id/request-payment-plan` | `parent.view_finances`                                                                             | (expected from plan modal)                    | Zod schema `requestPaymentPlanSchema`.                                                                                      |
| POST   | `/v1/parent/finances/payment-plan-requests`    | **UNKNOWN — endpoint MISSING in backend.** (§29 bug)                                               | `finances-tab.tsx:164`                        | Bug candidate — frontend path doesn't match backend `/parent/invoices/:id/request-payment-plan`.                            |
| POST   | `/v1/parent/payment-plans/:id/accept`          | `parent.view_finances`                                                                             | (no UI yet — §17)                             | Backend-only.                                                                                                               |
| GET    | `/v1/dashboard/parent`                         | (any authenticated parent)                                                                         | `parent/page.tsx:110`                         | Dashboard greeting + student list.                                                                                          |

All `/v1/finance/*` admin endpoints MUST return 403 for parents (§23).

---

## 28. Data Invariants — Parent-Facing Reads

Run these as the tester after each finance-affecting flow. They verify the data the parent sees is internally consistent.

| #     | Invariant                                            | Query / Assertion                                                                                                                                                                                      | Pass/Fail |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 28.1  | Outstanding balance = sum of unpaid invoice balances | `SELECT SUM(balance_amount) FROM invoices WHERE household_id IN (parent's households) AND status IN ('issued','partially_paid','overdue')` must equal `ParentFinancesData.outstanding_balance` ± 0.01. |           |
| 28.2  | Invoice list excludes draft + pending_approval       | Response body invoices array has NO row with status `draft` or `pending_approval`.                                                                                                                     |           |
| 28.3  | Payment list excludes pending / failed / voided      | Response body payments array contains ONLY `posted`, `refunded_partial`, `refunded_full`.                                                                                                              |           |
| 28.4  | Currency consistency                                 | Every invoice and payment has `currency_code = tenant.currency_code`. No mixed currencies.                                                                                                             |           |
| 28.5  | `stripe_enabled` matches tenant config               | `tenant_stripe_configs.stripe_enabled` in the DB must equal the field in the response.                                                                                                                 |           |
| 28.6  | After Stripe checkout success (webhook landed)       | Balance of the paid invoice decreases by the paid amount ± 0.01. Invoice status moved to `partially_paid` or `paid`.                                                                                   |           |
| 28.7  | After payment plan request submit                    | `payment_plan_requests` row exists with `household_id` matching parent's linked household, `requested_by_parent_id` = parent.id, `status = 'pending'`.                                                 |           |
| 28.8  | No orphan                                            | Every invoice in response has a matching household row. Every payment has a matching payment row.                                                                                                      |           |
| 28.9  | RLS is enforced                                      | Direct Prisma query WITHOUT `SET LOCAL app.current_tenant_id` returns zero rows — verified in `/e2e-integration` §RLS matrix.                                                                          |           |
| 28.10 | Parent-household linkage is respected                | Parent can only see households where at least one of their `parent_student_links.student_id.household_id` matches the invoice's `household_id`.                                                        |           |

---

## 29. Observations & Bugs Flagged During Walkthrough

### Endpoint mismatches (likely P1 bugs — frontend calling non-existent backend routes)

1. **`GET /api/v1/parent/finances` (no studentId)** — called by `FinancesTab` (line 100) and the parent dashboard Action Center (line 166). Backend only exposes `GET /v1/parent/students/:studentId/finances` (per `parent-finance.controller.ts:50`). If this frontend call 404s in prod, the Finances tab and Action Center will silently degrade to empty. Priority: P1.
2. **`POST /api/v1/parent/finances/invoices/:id/checkout`** — called by `handlePayNow` (line 109). Backend exposes `POST /v1/parent/invoices/:id/pay`. Different path. Priority: P1.
3. **`POST /api/v1/parent/finances/payment-plan-requests`** — called by `handleSubmitPlan` (line 164). Backend exposes `POST /v1/parent/invoices/:id/request-payment-plan` (per `parent-finance.controller.ts:123`). Different path and different body shape. Priority: P1.
4. **`GET /api/v1/parent/finances/payments/:id/receipt`** — called by `handleDownloadReceipt` (line 124). No matching backend controller. Receipts ARE accessible to admins at `/v1/finance/payments/:id/receipt/pdf`, but no parent-scoped alias exists. Priority: P1.
5. **Missing Zod body on checkout POST** — `handlePayNow` sends an empty body, but backend `checkoutSessionSchema` requires `{ success_url, cancel_url }`. Request would 400 immediately. Priority: P1.

### UI / translation gaps (P2)

6. **Invoice status badge label uses `.replace(/_/g, ' ')`** — renders English words ("issued", "partially paid", "overdue") regardless of locale. Arabic users get mixed-language UI. Fix: use `tf('invoiceStatus.' + status)` keys. Line 252.
7. **"of total" suffix uses `t('of')`** but raw numeric amount is `toLocaleString(undefined, ...)` — Arabic locale uses the browser default, may display Arabic digits unexpectedly despite the `dir="ltr"` wrapper. Verify and pin numerals to `'en-US'` if needed. Line 273.
8. **Parent plan state never rendered** — once a parent submits a payment plan request, the Finances tab does NOT show the pending request anywhere. Parent has no visibility into whether admin approved/rejected/countered. §16.8-16.10. Priority: P2.
9. **Accept counter-offer has no UI** — backend endpoint exists (`POST /v1/parent/payment-plans/:id/accept`) but no button in the parent UI (§17). Priority: P2.

### Design observations (P3 — nice-to-haves)

10. **No auto-refresh after Stripe return** — when the user lands on `?payment=success`, outstanding balance only updates once they re-click the Finances tab. Poll or re-fetch on detected `?payment=success` query param. §12.5.
11. **No pagination on payment history** — if a household has > 50 historical payments, older ones are hidden. `parent-finance.controller.ts:80` caps at `take: 50`. §18.11.
12. **Payment Plan modal does not validate sum of installments vs invoice balance** — client allows proposing plans where the sum of installments doesn't match the balance. Server MAY accept or reject — verify in `/e2e-integration` §16. §15.9.

### Security observations (P2 — confirmed in `/e2e-security-audit`)

13. **`window.open(...)` for receipt PDF** opens a new tab that may lack auth headers (JWT in memory isn't shared). Cookie-based auth must carry the request. If the endpoint ever adds JWT-only auth, downloads will break silently. §19.5.

(Do NOT silently fix any of the above — the user decides which to ship.)

---

## 30. Sign-Off

| Reviewer Name | Date | Pass | Fail | Overall Result |
| ------------- | ---- | ---- | ---- | -------------- |
|               |      |      |      |                |

**Instructions for tester:**

- Mark every row Pass or Fail.
- For any Fail, record: (a) the section + row ID; (b) the observed result; (c) a screenshot or network-log snippet; (d) the environment (tenant, locale, viewport, user).
- File every fail as a ticket with one of: `bug/parent-finance`, `bug/rls`, `bug/translation`, `bug/rtl`, `bug/mobile`, `bug/security`, `bug/api-mismatch`.
- Escalate any security / RLS fails (§21, §22, §23) immediately — these are P0 blockers for tenant onboarding.
- If you discover issues not flagged in §29, append them to a new "Observations — additional" block below this table and raise tickets.

**Do NOT consider the parent finance surface "tested" until every row in every section has been exercised.**
