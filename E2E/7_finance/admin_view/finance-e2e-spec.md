# Finance Module — Admin / Owner E2E Test Specification

**Module:** Finance (Billing, Payments, Refunds, Credit Notes, Scholarships, Discounts, Payment Plans, Reporting, Statements, Audit Trail)
**Perspective:** Admin / School Principal / Accounting — users with all `finance.*` permissions. No sub-role splitting; a future revision will split into principal-only, accounting-only, front-office-only surfaces.
**Pages covered:** 24 unique authenticated admin routes under `/{locale}/finance/*` + 1 Stripe webhook + 3 PDF streams + 1 CSV export endpoint + ~90 distinct backend API endpoints.
**Last updated:** 2026-04-12 — this is a full rewrite of the admin spec. Prior inline `[flagged §97]` annotations have been removed; the current behaviour described in each row is the post-fix behaviour verified on `nhqs.edupod.app` (Playwright walkthrough, zero console errors).
**Baseline commit:** `384ba761` (full /e2e spec-pack command set)

---

## Table of Contents

1. [Prerequisites & Test Data (Multi-Tenant)](#1-prerequisites--test-data-multi-tenant)
2. [Out of Scope for This Spec](#2-out-of-scope-for-this-spec)
3. [Global Environment Setup](#3-global-environment-setup)
4. [Shared Components](#4-shared-components)
5. [Finance Dashboard (Hub)](#5-finance-dashboard-hub)
6. [Dashboard — KPI Strip, Pending Actions, Quick Actions](#6-dashboard--kpi-strip-pending-actions-quick-actions)
7. [Dashboard — Pipeline, Aging, Debt Breakdown, Overdue, Recent Payments, Navigate](#7-dashboard--pipeline-aging-debt-breakdown-overdue-recent-payments-navigate)
8. [Financial Overview — Household List & Detail](#8-financial-overview--household-list--detail)
9. [Fee Types — List + CRUD](#9-fee-types--list--crud)
10. [Fee Structures — List + New + Edit + Field Reference](#10-fee-structures--list--new--edit--field-reference)
11. [Fee Assignments — List + New + Field Reference](#11-fee-assignments--list--new--field-reference)
12. [Fee Generation Wizard (Configuration → Preview → Confirmation)](#12-fee-generation-wizard-configuration--preview--confirmation)
13. [Fee Generation — Edge Cases & Idempotency](#13-fee-generation--edge-cases--idempotency)
14. [Invoices — List](#14-invoices--list)
15. [Invoice Detail — Header, Metrics, Actions](#15-invoice-detail--header-metrics-actions)
16. [Invoice Detail — Lines / Payments / Installments Tabs](#16-invoice-detail--lines--payments--installments-tabs)
17. [Invoice Detail — Pending Approval & Write-Off Banners](#17-invoice-detail--pending-approval--write-off-banners)
18. [Invoice — State Machine (Full Transition Graph)](#18-invoice--state-machine-full-transition-graph)
19. [Payments — List](#19-payments--list)
20. [Payments — New (Manual Entry)](#20-payments--new-manual-entry)
21. [Payment Detail — Header, Metrics, Allocations, Refunds, Receipt PDF](#21-payment-detail--header-metrics-allocations-refunds-receipt-pdf)
22. [Payment — State Machine & Allocation Invariants](#22-payment--state-machine--allocation-invariants)
23. [Refunds — List](#23-refunds--list)
24. [Refunds — Create Modal (Payment Search, Amount, Reason)](#24-refunds--create-modal-payment-search-amount-reason)
25. [Refunds — Approve / Reject / Execute](#25-refunds--approve--reject--execute)
26. [Refunds — State Machine & Invariants](#26-refunds--state-machine--invariants)
27. [Credit Notes — List, Create, Apply, Expanded Row](#27-credit-notes--list-create-apply-expanded-row)
28. [Discounts — List + New + Edit + Auto-Apply](#28-discounts--list--new--edit--auto-apply)
29. [Scholarships — List, Create, Revoke](#29-scholarships--list-create-revoke)
30. [Payment Plans — List, Create (Admin), Expanded Row, Cancel](#30-payment-plans--list-create-admin-expanded-row-cancel)
31. [Payment Plans — Approve / Reject / Counter-Offer](#31-payment-plans--approve--reject--counter-offer)
32. [Reports — Aging / Fee Performance / Custom / CSV Export](#32-reports--aging--fee-performance--custom--csv-export)
33. [Household Statements — List, Detail Ledger, PDF](#33-household-statements--list-detail-ledger-pdf)
34. [Debt Breakdown — Bucket Filter & Table](#34-debt-breakdown--bucket-filter--table)
35. [Audit Trail — List & Filters](#35-audit-trail--list--filters)
36. [Late Fee Configurations (Backend-Only API)](#36-late-fee-configurations-backend-only-api)
37. [Recurring Invoice Configurations (Backend-Only API)](#37-recurring-invoice-configurations-backend-only-api)
38. [Payment Reminder Endpoints (Backend-Only API)](#38-payment-reminder-endpoints-backend-only-api)
39. [Bulk Operations (Backend-Only API)](#39-bulk-operations-backend-only-api)
40. [Stripe Webhook — Signature & Idempotency](#40-stripe-webhook--signature--idempotency)
41. [Currency Update Endpoint](#41-currency-update-endpoint)
42. [End-to-End Flow Matrix](#42-end-to-end-flow-matrix)
43. [Permission & Role Guard Tests](#43-permission--role-guard-tests)
44. [Tenant Isolation (RLS) UI-Side Tests](#44-tenant-isolation-rls-ui-side-tests)
45. [Arabic / RTL Verification](#45-arabic--rtl-verification)
46. [Mobile Responsiveness (375px Viewport)](#46-mobile-responsiveness-375px-viewport)
47. [Console & Network Health](#47-console--network-health)
48. [Data Invariants — After Each Major Flow](#48-data-invariants--after-each-major-flow)
49. [Backend Endpoint Map (All 90 Admin Routes)](#49-backend-endpoint-map-all-90-admin-routes)
50. [Observations & Bugs Flagged During Walkthrough](#50-observations--bugs-flagged-during-walkthrough)
51. [Sign-Off](#51-sign-off)

---

## 1. Prerequisites & Test Data (Multi-Tenant)

A **multi-tenant fixture is mandatory**. Single-tenant Playwright runs cannot validate tenant isolation, so provision the following before starting this spec.

### Tenant A — `nhqs.edupod.app` (primary)

**Config:**

- Currency `EUR`; tenant branding `{ invoice_prefix: 'INV', receipt_prefix: 'REC', display_name: 'Nurul Huda Quality School', logo_url, support_email, support_phone }`
- `tenant_stripe_configs.stripe_enabled = true`, test keys `pk_test_*` / `sk_test_*` / `whsec_*`
- Finance settings: `requireApprovalForInvoiceIssue = true` on one pass; `= false` on another; `paymentReminderEnabled = true`; `reminderChannel = 'email'`; `dueSoonDays = 3`; `finalNoticeDays = 14`; `autoIssueRecurringInvoices = false`
- At least one active academic year with year groups `YG-A` (10 students), `YG-B` (10 students), `YG-C` (empty)

**Entities (fixture minimums, all idempotent via seed script):**

- 4 fee types: `Tuition` (custom), `Transport` (custom), `Books` (custom), plus seeded `Miscellaneous` (system)
- 3 fee structures: `Tuition — YG-A` (€1000 term), `Transport — Global` (€150 monthly), `Registration — YG-B` (€200 one-off)
- 3 discounts: one `fixed=50`, one `percent=10`, one `percent=100 auto_apply=true auto_condition.type='sibling' min_students=2`
- 20 households across YG-A and YG-B with billing parents; one household `H-NOBILL` without billing parent (for §12 warning); one sibling household with ≥2 students (for auto-sibling discount test)
- ≥1 fee assignment per household × fee structure; one ongoing assignment ready to be ended in §11
- Invoices across all nine statuses (see §18)
- Payments across all six statuses (§22)
- Refunds across all five statuses (§26)
- ≥1 credit note with `remaining_balance > 0`, and ≥1 fully used
- ≥1 payment plan per status: `pending`, `counter_offered`, `approved`, `active`, `completed`, `cancelled`, `rejected`
- ≥1 scholarship per status: `active`, `expired`, `revoked`
- ≥10 audit-trail rows across finance entities

**User accounts:**

- `admin1@nhqs.edupod.app` — full `finance.*` permissions. Primary subject.
- `admin2@nhqs.edupod.app` — distinct admin for self-approval-block tests (§25.10)
- `teacher@nhqs.edupod.app` — no finance permissions (negative 403 tests §43)
- `parent1@nhqs.edupod.app` — parent of a `YG-A` student (for §42 end-to-end flows)

### Tenant B — `test-b.edupod.app` (hostile pair)

**Config:**

- Currency `USD`; different prefixes; `tenant_stripe_configs.stripe_enabled = false`
- Year group `YG-B-BETA` with different student fixture

**Entities:** Identical schema; different data — 50 invoices, 15 payments; overlapping ids are seeded to collide on the first byte so that any UUID leakage is visually detectable in logs.

**User accounts:**

- `admin@test-b.edupod.app` — for cross-tenant hostile-pair tests (§44)

### Browser setup

- Chrome DevTools open (Console + Network + Application)
- Clear all application storage before each run
- Desktop pass: 1440×900; mobile pass: 375×667; locales: `en` and `ar`
- JWT is in memory (no localStorage / sessionStorage); refresh token in httpOnly cookie

---

## 2. Out of Scope for This Spec

This spec exercises the UI-visible surface of the finance module as a human (or Playwright agent) clicking through the admin shell. It does NOT cover:

- **RLS leakage and cross-tenant isolation at the DB/API layer** → `/e2e-integration` (multi-tenant matrix, direct-API cross-reads, encrypted-field access control)
- **Stripe webhook signature + idempotency** → `/e2e-integration` (raw-body HMAC posting, replay deduplication, event-type routing)
- **API contract tests bypassing the UI** → `/e2e-integration` (every endpoint × every permission role, every Zod boundary, every invalid state transition)
- **DB-level invariants after each flow** → `/e2e-integration` (machine-executable version). UI-side, see §48.
- **Concurrency / race conditions** → `/e2e-integration` (parallel-call tests, SELECT FOR UPDATE, atomic-guard exercises)
- **BullMQ jobs, cron schedulers, async chains** → `/e2e-worker-test` (only 2 processors exist: `invoice-approval-callback` and `overdue-detection`; other "reminders"/"late-fee" operations are synchronous per worker survey)
- **Latency, throughput, PDF render time, bundle size** → `/e2e-perf`
- **Security hardening (OWASP Top 10, JWT replay, CSRF, Stripe key leakage, decimal precision attacks)** → `/e2e-security-audit`
- **PDF content correctness (text extraction assertions)** → `/e2e-integration` (via `pdf-parse`)
- **Browser / device matrix beyond desktop Chrome + 375px mobile** → manual QA cycle
- **Parent-portal finance surface** → `E2E/7_finance/parent_view/finance-e2e-spec.md`

A tester running ONLY this spec is doing a thorough admin-shell smoke + regression pass. They are NOT doing a full tenant-readiness check. For the latter, run `/e2e-full`.

---

## 3. Global Environment Setup

| #   | What to Check                                                       | Expected Result                                                                                                               | Pass/Fail |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | Log in as admin1, navigate to `/{locale}/finance`                   | `GET /api/v1/finance/dashboard` returns 200 with `{ data: FinanceDashboardData }`.                                            |           |
| 3.2 | `GET /api/v1/finance/dashboard/currency?_t=<ts>` fires exactly once | Response `{ data: { currency_code: 'EUR' } }`. `_t` cache-bust query present — ensures no 304 hang.                           |           |
| 3.3 | Hard refresh                                                        | Dashboard skeleton renders briefly (animate-pulse), then data. No FOUC of "undefined 0.00" or "$0.00".                        |           |
| 3.4 | Kill the network, refresh                                           | Console logs `[FinanceDashboard]` error; loading skeleton persists / empty-state renders. No unhandled crash, no 500 page.    |           |
| 3.5 | `<html dir>` + `<html lang>` attributes                             | Match the active locale (`ltr`/`en` or `rtl`/`ar`).                                                                           |           |
| 3.6 | localStorage / sessionStorage after load                            | Both empty for `/finance/*` routes. No JWT / refresh tokens stored client-side.                                               |           |
| 3.7 | Cookies after load                                                  | One httpOnly `refresh_token`. No other auth cookies.                                                                          |           |
| 3.8 | `useTenantCurrency` cache-bust                                      | `_t=<Date.now()>` is appended to every call; browser never serves a 304.                                                      |           |
| 3.9 | Legacy response shape handling                                      | If the API returns `{ currency_code }` (no `data` wrapper), the hook falls back correctly. No "USD default stuck" regression. |           |

---

## 4. Shared Components

### 4A. CurrencyDisplay (`<CurrencyDisplay amount currency_code className locale />`)

| #    | What to Check                                     | Expected Result                                                                                                                                                                               | Pass/Fail |
| ---- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4A.1 | `amount=1234.5, currency_code='EUR', locale='en'` | Renders `€1,234.50` inside `<span dir="ltr">`. Two decimals guaranteed via Intl.NumberFormat.                                                                                                 |           |
| 4A.2 | `locale='ar'`                                     | Uses `ar-SA` locale formatting; Western numerals (per CLAUDE.md permanent constraint); `<span dir="ltr">` preserved.                                                                          |           |
| 4A.3 | `amount=NaN`                                      | Treated as 0 → renders `€0.00`. No `NaN` in output.                                                                                                                                           |           |
| 4A.4 | `currency_code` undefined / empty / `'XX'` (<3)   | Falls back to `USD`. Never renders literal `undefined 0.00`.                                                                                                                                  |           |
| 4A.5 | `currency_code='eur'` (lowercase)                 | Uppercased before Intl → `€1,234.50`.                                                                                                                                                         |           |
| 4A.6 | `currency_code='FAKECCY'` (Intl rejects)          | Console `[CurrencyDisplay]` error; fallback string `FAKECCY 1234.50`. No crash.                                                                                                               |           |
| 4A.7 | `className` prop                                  | Applied to the `<span>`.                                                                                                                                                                      |           |
| 4A.8 | Every amount on every finance page wrapped in LTR | DOM audit: every currency value across dashboard / overview / invoice detail / payment detail / refund list / credit-note list / reports / statements / debt-breakdown is `<span dir="ltr">`. |           |

### 4B. HouseholdSelector

| #    | What to Check              | Expected Result                                                                                                                           | Pass/Fail |
| ---- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4B.1 | Trigger render             | Button shows `t('selectHousehold')` placeholder + `<Search>` icon. Aria: `role="combobox"`, `aria-expanded="false"`.                      |           |
| 4B.2 | Popover width              | Matches trigger width via `w-[--radix-popover-trigger-width]`.                                                                            |           |
| 4B.3 | Initial load               | `GET /api/v1/households?pageSize=50` fires; first 50 households render.                                                                   |           |
| 4B.4 | Search                     | Fetches on every search change (no debounce at component level — the API is already paginated). Results repopulate the list.              |           |
| 4B.5 | Select a household         | Combobox closes; trigger shows selected name; `onValueChange(id)` fires.                                                                  |           |
| 4B.6 | Value outside current page | `selectedFallback` effect fetches `/api/v1/households/{id}`; trigger shows the correct name even though the row isn't in the 50-row list. |           |
| 4B.7 | Disabled prop              | Trigger renders with `disabled` styling; popover does not open.                                                                           |           |

### 4C. MultiCheckSelect

| #    | What to Check        | Expected Result                         | Pass/Fail |
| ---- | -------------------- | --------------------------------------- | --------- |
| 4C.1 | No selection         | Trigger shows `allLabel`.               |           |
| 4C.2 | One or more selected | Trigger shows comma-separated labels.   |           |
| 4C.3 | Click outside        | Dropdown closes.                        |           |
| 4C.4 | Toggle checkboxes    | State updates via `onChange(values[])`. |           |

### 4D. PdfPreviewModal

| #    | What to Check            | Expected Result                                                                                              | Pass/Fail |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------ | --------- |
| 4D.1 | Open modal with `pdfUrl` | Fetches `${NEXT_PUBLIC_API_URL}${pdfUrl}` with auth header → blob → iframe `src=<objectURL>`. Height `60vh`. |           |
| 4D.2 | Loading state            | Spinner shown while fetching.                                                                                |           |
| 4D.3 | Error                    | Error state + translation key `pdfLoadError`.                                                                |           |
| 4D.4 | Print button             | Opens new window with PDF, triggers print dialog.                                                            |           |
| 4D.5 | Download button          | Anchor with `download` attribute + object URL.                                                               |           |
| 4D.6 | Modal close / unmount    | Blob URL revoked (`URL.revokeObjectURL`); no leak.                                                           |           |

### 4E. Status Badges (Invoice / Payment / Refund)

| #    | Badge         | Status → Variant Map                                                                                                                                          | Label source                  | Pass/Fail |
| ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------- |
| 4E.1 | InvoiceStatus | draft→neutral; pending_approval→warning; issued→info; partially_paid→warning; paid→success; overdue→danger; void→neutral; cancelled→neutral; written_off→info | `t('invoiceStatus.<status>')` |           |
| 4E.2 | PaymentStatus | pending→warning; posted→success; failed→danger; voided→neutral; refunded_partial→info; refunded_full→info                                                     | `t('paymentStatus.<status>')` |           |
| 4E.3 | RefundStatus  | pending_approval→warning; approved→info; executed→success; failed→danger; rejected→neutral                                                                    | `t('refundStatus.<status>')`  |           |
| 4E.4 | All locales   | Labels translated in English and Arabic.                                                                                                                      | —                             |           |

### 4F. useTenantCurrency Hook

| #    | What to Check                                      | Expected Result                                                                                                      | Pass/Fail |
| ---- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------- |
| 4F.1 | Hook call on mount                                 | Single fetch to `/api/v1/finance/dashboard/currency?_t=<ts>`.                                                        |           |
| 4F.2 | Default return before fetch resolves               | `'USD'` (hard default).                                                                                              |           |
| 4F.3 | Both response shapes handled                       | `{ currency_code }` and `{ data: { currency_code } }` both parse.                                                    |           |
| 4F.4 | Tenant change (logout / login as different tenant) | Effect deps `[]` means hook remounts per component mount — switching tenants re-fetches on the next component mount. |           |

---

## 5. Finance Dashboard (Hub)

**URL:** `/{locale}/finance`
**API:** `GET /api/v1/finance/dashboard` (perm `finance.view`)

| #   | What to Check          | Expected Result                                                                                                                                                                                                                                                                                       | Pass/Fail |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Navigate to `/finance` | 200. Single fetch to `/dashboard`. `FinanceDashboardData` populates the entire page (hub is a single-fetch page).                                                                                                                                                                                     |           |
| 5.2 | Layout shell           | Morphing shell top bar + finance sub-strip. No legacy sidebar. Sub-strip shows: Dashboard, Invoices, Payments, Refunds, Credit Notes, Discounts, Scholarships, Payment Plans, Fee Structures, Fee Assignments, Fee Types, Fee Generation, Overview, Statements, Debt Breakdown, Reports, Audit Trail. |           |
| 5.3 | Hub-only deep link     | Loading skeleton (DashboardSkeleton) until data resolves.                                                                                                                                                                                                                                             |           |
| 5.4 | Print affordance       | Not present on the hub; only on specific sub-pages (debt breakdown §34, custom report §32.10, statement §33.14).                                                                                                                                                                                      |           |

---

## 6. Dashboard — KPI Strip, Pending Actions, Quick Actions

| #   | What to Check                                  | Expected Result                                                                                                                                                                                      | Pass/Fail |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | KPI Expected Revenue card                      | Shows `totalInvoiced` via `<CurrencyDisplay>`; sub-label "X active invoices". Card links to `/{locale}/finance/overview`.                                                                            |           |
| 6.2 | KPI Received Payments card                     | Shows `totalReceived`. Links to overview.                                                                                                                                                            |           |
| 6.3 | KPI Outstanding Amount card                    | Shows `totalOutstanding` + dynamic "X overdue invoices" sub-label when count > 0. Links to overview with `?overdue=yes` (verify query handoff).                                                      |           |
| 6.4 | KPI Outstanding % card                         | Shows percentage; color threshold: >30 danger-700; >15 warning-700; else success-700. Links to `/{locale}/finance/reports`.                                                                          |           |
| 6.5 | Pending Actions banner — pending refunds       | Renders only when `pendingRefundApprovals > 0`. Click → `/finance/refunds?status=pending_approval`.                                                                                                  |           |
| 6.6 | Pending Actions banner — pending payment plans | Visible only when `pendingPaymentPlans > 0`. Click → `/finance/payment-plans?status=pending`.                                                                                                        |           |
| 6.7 | Pending Actions banner — draft invoices        | Visible only when `draftInvoices > 0`. Click → `/finance/invoices?status=draft`.                                                                                                                     |           |
| 6.8 | Quick Actions — four cards                     | Generate Fees → `/finance/fee-generation`; Record Payment → `/finance/payments/new`; Create Invoice → `/finance/invoices` with `?action=new` or equivalent; View Statements → `/finance/statements`. |           |
| 6.9 | Quick Actions — keyboard focus ring            | Each card has a visible focus ring on Tab.                                                                                                                                                           |           |

---

## 7. Dashboard — Pipeline, Aging, Debt Breakdown, Overdue, Recent Payments, Navigate

| #    | What to Check                                  | Expected Result                                                                                                                       | Pass/Fail    |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------- | --- |
| 7.1  | Invoice Pipeline horizontal bar                | Segments for: draft, pending_approval, issued, partially_paid, overdue, paid. Each segment click → `/finance/invoices?status=<key>`.  |              |
| 7.2  | Aging Overview                                 | Buckets: current, 1-30, 31-60, 61-90, 90+. Labels via `t('agingCurrent'                                                               | 'aging1to30' | ...)`. Values via `<CurrencyDisplay>`. |     |
| 7.3  | Household Debt Breakdown — four segmented bars | 0-10%, 10-30%, 30-50%, 50+. Each segment click → `/finance/debt-breakdown?bucket=<key>`.                                              |              |
| 7.4  | Top debtors preview                            | ≤6 cards rendered, each linking to `/finance/statements/{household_id}`. If data has <6, renders what's available (empty state if 0). |              |
| 7.5  | Overdue Invoices section                       | Cards per overdue invoice. Row click → `/finance/invoices/{id}` via `useRouter().push` (soft nav, NOT `window.location.assign`).      |              |
| 7.6  | Overdue invoice — CurrencyDisplay on balance   | Uses `<CurrencyDisplay>`; no raw number leak.                                                                                         |              |
| 7.7  | Recent Payments table                          | 6 columns: reference (mono), household (EntityLink `/households/{id}`), amount (`<CurrencyDisplay>`), status badge, date, actions.    |              |
| 7.8  | Recent Payments row click                      | Navigate to `/finance/payments/{id}` via soft nav.                                                                                    |              |
| 7.9  | Recent Payments — Receipt PDF action           | Opens `PdfPreviewModal` with `pdfUrl = /api/v1/finance/payments/{id}/receipt/pdf`.                                                    |              |
| 7.10 | Recent Payments — View Statement action        | Soft nav to `/finance/statements/{household_id}`.                                                                                     |              |
| 7.11 | Finance Navigate modules grid                  | Shows cards linking to every major sub-page (same entries as the sub-strip). Each card is permission-gated (admin sees all).          |              |
| 7.12 | Empty states                                   | If data is empty (aging all zero, etc.) the section shows `t('noData')` without layout jump.                                          |              |

---

## 8. Financial Overview — Household List & Detail

**URLs:** `/{locale}/finance/overview` + `/{locale}/finance/overview/[householdId]`
**API:** `GET /api/v1/finance/dashboard/household-overview?page=&pageSize=20&search=&status=&overdue=`

| #    | What to Check             | Expected Result                                                                                                             | Pass/Fail |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1  | List page — back button   | Icon-only `<ArrowLeft>` → `/{locale}/finance`. RTL mirrors to right side.                                                   |           |
| 8.2  | List page — summary strip | When rows exist: Total Expected, Total Received (success-700), Total Outstanding (danger-700) via `<CurrencyDisplay>`.      |           |
| 8.3  | List page — status legend | Three badges with descriptions: Fully Paid (success), Partially Paid (warning), Unpaid (danger).                            |           |
| 8.4  | List page — filters       | Search input, Status select (all/fully_paid/partially_paid/unpaid), Overdue select (all/yes/no). Each filter resets page=1. |           |
| 8.5  | List page — 7 columns     | household_name, household_number (mono), status badge, total, paid, balance (danger-700 if >0), overdue (Yes/No).           |           |
| 8.6  | List page — row click     | `/finance/overview/{household_id}`.                                                                                         |           |
| 8.7  | List page — empty state   | `<EmptyState icon={Users}>` when no rows.                                                                                   |           |
| 8.8  | Pagination — pageSize 20  | Server-side. `meta.total` drives total pages.                                                                               |           |
| 8.9  | Detail — data fetch       | Fetches the household + its invoices + aging breakdown.                                                                     |           |
| 8.10 | Detail — invoice list     | Columns match §14 invoice list. Clicking an invoice opens detail.                                                           |           |
| 8.11 | Detail — totals           | Total billed, total received, outstanding per `<CurrencyDisplay>`.                                                          |           |

---

## 9. Fee Types — List + CRUD

**URL:** `/{locale}/finance/fee-types`
**APIs:** `GET|POST|PATCH|DELETE /api/v1/finance/fee-types`

| #   | What to Check   | Expected Result                                                                                                                      | Pass/Fail |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 9.1 | List page       | Paginated list with columns: name, description, `is_system` badge, active toggle, actions.                                           |           |
| 9.2 | Create fee type | Modal with `name` (1-150), `description` (optional). POST creates with `is_system=false, active=true`. Success toast + list refresh. |           |
| 9.3 | Edit fee type   | Inline or modal. PATCH with fields. `is_system=true` rows are read-only (name/description inputs disabled).                          |           |
| 9.4 | Delete fee type | Confirm dialog. DELETE. 409 `FEE_STRUCTURES_EXIST` if any fee structure references it — toast surfaces the error.                    |           |
| 9.5 | Active toggle   | PATCH with `{ active: !active }`. Optimistic update, rollback on error.                                                              |           |
| 9.6 | Uniqueness      | Creating with duplicate name → 409 `DUPLICATE_NAME`. Toast surfaces.                                                                 |           |

---

## 10. Fee Structures — List + New + Edit + Field Reference

**URLs:** `/fee-structures`, `/fee-structures/new`, `/fee-structures/[id]`

| #     | What to Check                                            | Expected Result                                                                                                                                        | Pass/Fail |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 10.1  | List page columns                                        | name, fee_type, year_group (or "—"), amount (`<CurrencyDisplay>`), billing_frequency (translated), active/inactive (translated).                       |           |
| 10.2  | List — empty state                                       | `<EmptyState>` with CTA "New" button, but CTA is gated by `canManage` — non-managers see only the illustration.                                        |           |
| 10.3  | Delete action                                            | Confirm dialog → DELETE. 409 if active assignments exist → `ACTIVE_ASSIGNMENTS_EXIST`.                                                                 |           |
| 10.4  | /new — form scaffolded via react-hook-form + zodResolver | Uses `createFeeStructureSchema`. Fields below.                                                                                                         |           |
| 10.5  | Field: name                                              | 1-150 chars, required.                                                                                                                                 |           |
| 10.6  | Field: fee_type_id                                       | Select of active fee types; required.                                                                                                                  |           |
| 10.7  | Field: year_group_id                                     | Optional — unscoped (global) when omitted.                                                                                                             |           |
| 10.8  | Field: amount                                            | Decimal, positive, 2dp; required.                                                                                                                      |           |
| 10.9  | Field: billing_frequency                                 | Select: `one_off`, `term`, `monthly`, `custom`. Labels via `t('feeStructures.freqOneOff/Term/Monthly/Custom')`.                                        |           |
| 10.10 | Submit                                                   | POST → 201. Redirect to list with success toast.                                                                                                       |           |
| 10.11 | Edit page                                                | Pre-fills form from `GET /fee-structures/:id`. PATCH on submit. Cannot change `fee_type_id` once active assignments exist (confirm backend behaviour). |           |
| 10.12 | Validation errors                                        | Each Zod failure surfaces inline under the field with `t('feeStructures.error.*')` key or `t('required')`.                                             |           |

---

## 11. Fee Assignments — List + New + Field Reference

**URLs:** `/fee-assignments`, `/fee-assignments/new`

| #    | What to Check          | Expected Result                                                                                                                                                                    | Pass/Fail |
| ---- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | List columns           | household, student (or "—" for household-wide), fee_structure, discount (or "—"), effective_from, effective_to (or `t('ongoing')`).                                                |           |
| 11.2 | End assignment action  | `POST /fee-assignments/:id/end` sets `effective_to = today`. Row updates.                                                                                                          |           |
| 11.3 | /new form              | `household_id` (HouseholdSelector), `student_id` (optional — household-wide when empty), `fee_structure_id` (select of active), `discount_id` (optional), `effective_from` (date). |           |
| 11.4 | Duplicate guard        | Submitting with the same household/student/structure triad → 409 `DUPLICATE_ASSIGNMENT`.                                                                                           |           |
| 11.5 | Inactive fee structure | 400 `FEE_STRUCTURE_INACTIVE` if selected structure is inactive.                                                                                                                    |           |
| 11.6 | Submit success         | 201 + redirect to `/fee-assignments` + success toast.                                                                                                                              |           |

---

## 12. Fee Generation Wizard (Configuration → Preview → Confirmation)

**URL:** `/{locale}/finance/fee-generation`
**APIs:** `POST /finance/fee-generation/preview` (`finance.manage`), `POST /finance/fee-generation/confirm` (`finance.manage`)

### Step 1 — Configuration

| #    | What to Check                             | Expected Result                                                                                                | Pass/Fail |
| ---- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Year group select                         | MultiCheckSelect populated from `GET /year-groups`. Required.                                                  |           |
| 12.2 | billing_period_start / billing_period_end | Date inputs. Zod refine: `end >= start`. Error message `t('dateRangeInvalid')`.                                |           |
| 12.3 | due_date                                  | Must be ≥ `billing_period_start`.                                                                              |           |
| 12.4 | Invoice prefix preview                    | Shows derived prefix (`invoice_prefix` from branding) + preview number pattern.                                |           |
| 12.5 | Click Next                                | Validates form; `POST /preview` with `{ year_group_ids, billing_period_start, billing_period_end, due_date }`. |           |

### Step 2 — Preview

| #     | What to Check                  | Expected Result                                                                                               | Pass/Fail |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------- |
| 12.6  | Preview renders                | Table: household, student count, fee breakdown, total per household. Totals row at bottom.                    |           |
| 12.7  | Missing billing parent warning | Households in `H-NOBILL` flagged with `<Alert>` — "Missing billing parent" — and excluded from counts.        |           |
| 12.8  | Sibling auto-discount applied  | Households with ≥2 students + auto-discount `percent=100 auto_apply` show the discount line in the breakdown. |           |
| 12.9  | Re-run preview                 | Re-hitting the endpoint returns the same result — the wizard is idempotent at preview stage.                  |           |
| 12.10 | Back button                    | Returns to Step 1 preserving form values.                                                                     |           |

### Step 3 — Confirmation

| #     | What to Check               | Expected Result                                                                                                                                                                        | Pass/Fail |
| ----- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.11 | Confirmation screen         | Summary of counts. "Confirm generation" button.                                                                                                                                        |           |
| 12.12 | POST /confirm               | Creates one invoice per household per fee assignment — matches preview lines 1:1.                                                                                                      |           |
| 12.13 | Success toast               | `t('feeGeneration.successCount', { count })` and navigation to `/finance/invoices?status=draft`.                                                                                       |           |
| 12.14 | Approval workflow triggered | When `requireApprovalForInvoiceIssue=true`, new invoices are created in `draft` and users must issue (via §15) which transitions to `pending_approval` — verify via §18 state machine. |           |

---

## 13. Fee Generation — Edge Cases & Idempotency

| #    | What to Check                                        | Expected Result                                                                                                                                                       | Pass/Fail |
| ---- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Re-run same (year_group, billing_period_start) triad | Invoices with the same `(household_id, billing_period_start)` key ALREADY exist → backend returns 0 new invoices; UI surfaces "no new invoices generated" info toast. |           |
| 13.2 | Period boundaries inclusive                          | `billing_period_start` inclusive; `billing_period_end` inclusive (test by setting start=end).                                                                         |           |
| 13.3 | Empty year group                                     | No students → no invoices. Confirm button still works, toast "0 invoices generated".                                                                                  |           |
| 13.4 | Date ordering violated (back to §12.2)               | Preview returns 400; UI surfaces the Zod error inline.                                                                                                                |           |
| 13.5 | Tenant branding currency mismatch                    | Tenant currency is `EUR` but a structure somehow has currency `USD` → preview should flag mismatch and reject. (Multi-currency is forbidden per CLAUDE.md).           |           |

---

## 14. Invoices — List

**URL:** `/{locale}/finance/invoices`
**API:** `GET /api/v1/finance/invoices?page=&pageSize=20&search=&status=&date_from=&date_to=&include_lines=true`

| #     | What to Check                      | Expected Result                                                                                                                                                                          | Pass/Fail |
| ----- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1  | Toolbar search input               | `ps-9` for search icon. 300ms debounce before firing. `?search=` added.                                                                                                                  |           |
| 14.2  | Status dropdown                    | all / draft / pending_approval / issued / partially_paid / paid / overdue / void / cancelled / written_off. Default `all` (parameter omitted).                                           |           |
| 14.3  | Status dropdown hydration from URL | `?status=issued` in URL selects `issued` in the dropdown on mount.                                                                                                                       |           |
| 14.4  | Date range                         | date_from / date_to inputs. Empty → omitted.                                                                                                                                             |           |
| 14.5  | Filter change                      | Page resets to 1. New fetch.                                                                                                                                                             |           |
| 14.6  | Row flattening                     | `include_lines=true` returns invoice with lines; UI flattens so each line is a row. `rowKey = {invoiceId}_{lineId}` or `{invoiceId}` if no line.                                         |           |
| 14.7  | Columns                            | issue_date (or "—"), invoice_number (mono link → detail), household (EntityLink), student_name, student_number (mono or "—"), status badge, total (`<CurrencyDisplay>` right), due_date. |           |
| 14.8  | Column translations                | Headers use `t('issueDate')`, `t('invoiceNumber')`, `t('household')`, `t('colStudent')`, `t('colStudentNumber')`, `t('total')`, `t('dueDate')`.                                          |           |
| 14.9  | Empty state                        | `<EmptyState icon={FileText} title={t('noInvoices')} description={t('noInvoicesDesc')}>`.                                                                                                |           |
| 14.10 | Pagination                         | 20 per page.                                                                                                                                                                             |           |

---

## 15. Invoice Detail — Header, Metrics, Actions

**URL:** `/{locale}/finance/invoices/[id]`
**API:** `GET /api/v1/finance/invoices/:id`

| #     | What to Check                                       | Expected Result                                                                                                                                                                        | Pass/Fail |
| ----- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | --------------- | --- |
| 15.1  | RecordHub title                                     | `invoice_number`. Subtitle = `household.household_name`. Reference field = `invoice_number`.                                                                                           |           |
| 15.2  | Status badge                                        | `<InvoiceStatusBadge status={status}>` — variant per §4E.1.                                                                                                                            |           |
| 15.3  | Metrics strip                                       | Household (EntityLink), Issue Date, Due Date, Subtotal, Discount, Total, Paid, Balance. Each currency via `<CurrencyDisplay>`. Labels via translation keys.                            |           |
| 15.4  | Issue action — status draft + approval NOT required | Button enabled. POST `/invoices/:id/issue` → status becomes `issued`, `issue_date = now`. Toast `t('issueSuccess')`.                                                                   |           |
| 15.5  | Issue action — status draft + approval required     | POST → status becomes `pending_approval`; approval_request created. Pending banner appears (§17).                                                                                      |           |
| 15.6  | Issue action — invalid status (e.g. already issued) | 400 `INVALID_STATUS_TRANSITION` → toast error `t('issueFailed')` with `message`.                                                                                                       |           |
| 15.7  | Void action                                         | Confirm modal with description `t('voidConfirmDescription')` + label `t('voidInvoiceAction')`. POST `/invoices/:id/void`. Balance cleared. Toast `t('voidSuccess')`.                   |           |
| 15.8  | Cancel action — only on draft                       | Confirm modal with `t('cancelConfirmDescription')` + `t('cancelInvoiceAction')`. POST `/invoices/:id/cancel`. 400 `INVALID_STATUS_TRANSITION` if status ≠ draft.                       |           |
| 15.9  | Write-off action — requires reason                  | Confirm modal `t('writeOffConfirmDescription')` + textarea. Empty reason → toast `t('writeOffRequiresReason')` (client-side guard). POST with `{ write_off_reason }`.                  |           |
| 15.10 | PDF button                                          | Opens PdfPreviewModal with `pdfUrl = /api/v1/finance/invoices/:id/pdf?locale=<locale>`. Content-Type `application/pdf`. Content-Disposition `inline; filename="invoice-{number}.pdf"`. |           |
| 15.11 | Print button (within PDF modal)                     | Covered in §4D.4.                                                                                                                                                                      |           |
| 15.12 | Approve / Reject pending-approval                   | Buttons render when status = `pending_approval` AND user has the approver role on the approval request. Covered fully in §17.                                                          |           |
| 15.13 | Loading button labels                               | During async actions: Issuing... / Voiding... / Cancelling... / Writing Off... — labels via `t('issuing'                                                                               | 'voiding' | 'cancelling' | 'writingOff')`. |     |

---

## 16. Invoice Detail — Lines / Payments / Installments Tabs

### Lines tab

| #    | What to Check             | Expected Result                                                                                                               | Pass/Fail |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | Lines table               | Columns: description, student_name (optional), quantity, unit_amount (`<CurrencyDisplay>`), line_total. Totals row at bottom. |           |
| 16.2 | Empty (no lines)          | Empty state text. Rare — invoices without lines are corrupted data.                                                           |           |
| 16.3 | Long description wrapping | Wraps to multiple lines; table scrolls horizontally on mobile.                                                                |           |

### Payments tab

| #    | What to Check            | Expected Result                                                                                                         | Pass/Fail |
| ---- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.4 | Payment allocations list | Columns: payment_reference (mono link → `/payments/:id`), received_at, allocated_amount, method. Total allocated shown. |           |
| 16.5 | Empty                    | `t('noAllocations')`.                                                                                                   |           |

### Installments tab

| #    | What to Check           | Expected Result                                                                                                                           | Pass/Fail |
| ---- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.6 | Form fields             | `installments[]` — due_date + amount per row. Add/remove buttons. Totals-vs-balance helper text `t('remaining')` / `t('overLabel')`.      |           |
| 16.7 | Submit                  | POST `/invoices/:id/installments` → replaces all existing installments. Toast `t('installmentPlanCreated')`.                              |           |
| 16.8 | Sum vs balance          | Client-side warning if sum ≠ balance; server still accepts (sum-of-installments validation is documented as an integration-test concern). |           |
| 16.9 | Delete all installments | DELETE `/invoices/:id/installments`. Confirms. Toast on success.                                                                          |           |

### Tab labels

| #     | What to Check         | Expected Result                                                             | Pass/Fail |
| ----- | --------------------- | --------------------------------------------------------------------------- | --------- |
| 16.10 | Tab labels translated | `tabLines`, `tabPayments`, `tabInstallments`. No hardcoded English strings. |           |

---

## 17. Invoice Detail — Pending Approval & Write-Off Banners

| #    | What to Check                  | Expected Result                                                                                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 17.1 | Pending approval banner        | Only shown when `status === pending_approval && approval` exists. Warning style. Shows `requested_by` name + date. `t('pendingApproval')`.                                                                               |           |
| 17.2 | Approve button — approver only | User with matching role can approve. POST `/approvals/requests/:id/approve` (module: approvals). Invoice transitions to `issued`; `approval_request.callback_status='executed'` after worker job runs (§40 worker spec). |           |
| 17.3 | Reject button                  | POST `/approvals/requests/:id/reject`. Invoice stays in `draft`; approval_request marked rejected.                                                                                                                       |           |
| 17.4 | Self-approval block            | If `requested_by_user_id === current_user_id`, approve/reject buttons are hidden / disabled.                                                                                                                             |           |
| 17.5 | Write-off banner               | Only when `status === written_off && write_off_reason`. Info style. Shows reason text.                                                                                                                                   |           |

---

## 18. Invoice — State Machine (Full Transition Graph)

Run each valid transition and each illegal transition (illegal ones covered in `/e2e-integration`). UI must refuse illegal transitions by hiding/disabling buttons.

| From → To                                 | Trigger / Endpoint                     | UI button                     | Expected result                                                 | Pass/Fail |
| ----------------------------------------- | -------------------------------------- | ----------------------------- | --------------------------------------------------------------- | --------- |
| draft → pending_approval                  | POST /issue with approval required     | "Issue"                       | status `pending_approval`; approval banner; Issue button hidden |           |
| draft → issued                            | POST /issue without approval required  | "Issue"                       | status `issued`; issue_date set                                 |           |
| pending_approval → issued                 | approval approved → worker callback    | (approver clicks Approve)     | status `issued`; approval banner removed                        |           |
| pending_approval → draft                  | approval rejected                      | (approver clicks Reject)      | status `draft`; banner removed                                  |           |
| issued → partially_paid                   | payment allocation < balance           | (via §21 Confirm Allocations) | balance decreases; status updates                               |           |
| issued → paid                             | payment allocation == balance          | (via §21 Confirm Allocations) | balance = 0                                                     |           |
| partially_paid → paid                     | further allocation to zero             | (via §21)                     | balance = 0                                                     |           |
| issued / partially_paid → overdue         | due_date passed (via worker or manual) | (worker `overdue-detection`)  | status `overdue`; `last_overdue_notified_at` set                |           |
| overdue → paid                            | payment allocation to zero             | (via §21)                     | status `paid`                                                   |           |
| any payable → written_off                 | POST /write-off                        | "Write off"                   | balance cleared; write-off banner                               |           |
| any → void                                | POST /void                             | "Void"                        | balance cleared; status `void`                                  |           |
| draft → cancelled                         | POST /cancel                           | "Cancel"                      | status `cancelled`                                              |           |
| void / cancelled / paid / written_off → x | (terminal)                             | (buttons hidden)              | Backend 400 `INVALID_STATUS_TRANSITION` if attempted            |           |

---

## 19. Payments — List

**URL:** `/{locale}/finance/payments`
**APIs:** `GET /api/v1/finance/payments` (`finance.view`) + `GET /api/v1/finance/payments/staff` (`finance.manage`)

| #    | What to Check             | Expected Result                                                                                                                                                                                                         | Pass/Fail |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | "New Payment" button      | Visible only when `canManage === true` (role `school_principal` / `accounting`). Hidden for view-only roles.                                                                                                            |           |
| 19.2 | Filters                   | Reference search (no debounce), Status (all/pending/posted/failed/voided/refunded_partial/refunded_full), Method (cash/bank_transfer/card_manual/stripe/all), Staff filter (async — `GET /payments/staff`), Date range. |           |
| 19.3 | Columns                   | payment_reference (mono), household (EntityLink), amount (`<CurrencyDisplay>`), method (translated via `methodLabelKeyMap`), received_at, accepted_by (staff name / "Stripe" / bank name).                              |           |
| 19.4 | Staff filter empty        | When no staff have accepted payments, the filter dropdown shows only "All". Dropdown label `t('acceptedBy')`.                                                                                                           |           |
| 19.5 | Row click                 | Navigate to `/finance/payments/{id}`.                                                                                                                                                                                   |           |
| 19.6 | Empty state — manager     | `<EmptyState icon={Banknote}>` with "New Payment" CTA.                                                                                                                                                                  |           |
| 19.7 | Empty state — non-manager | Same empty state, no CTA.                                                                                                                                                                                               |           |

---

## 20. Payments — New (Manual Entry)

**URL:** `/{locale}/finance/payments/new`

| #    | What to Check                                  | Expected Result                                                                                                                                                                                                            | Pass/Fail |
| ---- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.1 | Form via react-hook-form + createPaymentSchema | Fields: `household_id` (HouseholdSelector), `payment_method` (select: cash/bank_transfer/card_manual — no stripe in manual form), `amount` (number >0, 2dp), `received_at` (datetime-local), `reason` (optional textarea). |           |
| 20.2 | Submit                                         | POST `/api/v1/finance/payments` with `received_at` as ISO string. 201 → navigate to `/finance/payments/{id}`. Toast `t('paymentRecorded')`.                                                                                |           |
| 20.3 | Validation errors surface inline               | Missing household → `t('required')`. Amount ≤ 0 → `t('amountMustBePositive')`. Invalid datetime → `t('dateInvalid')`.                                                                                                      |           |
| 20.4 | Submit disabled while submitting               | Button label changes to `t('recording')` with Loader2 icon.                                                                                                                                                                |           |
| 20.5 | Backend 400 / 500                              | Toast `t('paymentRecordFailed')`. Stays on form with values preserved.                                                                                                                                                     |           |
| 20.6 | Info banner                                    | "Payment reference will be auto-generated" text.                                                                                                                                                                           |           |

---

## 21. Payment Detail — Header, Metrics, Allocations, Refunds, Receipt PDF

**URL:** `/{locale}/finance/payments/[id]`

| #     | What to Check                            | Expected Result                                                                                                                                                                                 | Pass/Fail |
| ----- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.1  | Header                                   | Title `payment_reference`; subtitle `household.household_name` (EntityLink `/households/{id}` — note: locale-prefixed).                                                                         |           |
| 21.2  | Status badge                             | `<PaymentStatusBadge status={status}>`.                                                                                                                                                         |           |
| 21.3  | Metrics strip                            | Amount, Method (translated), Received, Allocated (sum), Unallocated. Each currency via `<CurrencyDisplay>`.                                                                                     |           |
| 21.4  | Allocations tab — list                   | Columns: invoice_number (mono link), allocated_amount, allocated_at.                                                                                                                            |           |
| 21.5  | Allocation panel — Suggest button        | GET `/api/v1/finance/payments/:id/allocations/suggest` (`finance.manage`). Populates the panel rows. Toast error `t('suggestFailed')` on failure.                                               |           |
| 21.6  | Allocation panel — Confirm button        | POST `/api/v1/finance/payments/:id/allocations` with `{ allocations: [{ invoice_id, amount }, ...] }`. Backend updates invoice.balance + payment.status atomically.                             |           |
| 21.7  | Confirm — 400 ALLOCATION_EXCEEDS_PAYMENT | Toast `t('confirmAllocationsFailed')` with specific message.                                                                                                                                    |           |
| 21.8  | Confirm — no outstanding for household   | Toast `t('noOutstandingForHousehold')`.                                                                                                                                                         |           |
| 21.9  | Refunds tab                              | List of refunds against this payment. Columns: refund_reference, amount, status, requested_by, reason. Create Refund button (§24).                                                              |           |
| 21.10 | Receipt PDF                              | Opens modal with `pdfUrl = /api/v1/finance/payments/:id/receipt/pdf`. Content-Disposition filename uses `receipt-{number}.pdf` when receipt exists; falls back to UUID otherwise (Logger warn). |           |
| 21.11 | Allocation panel — over-allocation       | Sum of row amounts > payment.amount → client-side warning + server 400.                                                                                                                         |           |
| 21.12 | Posted payment                           | Subsequent allocations confirmed transition status pending → posted.                                                                                                                            |           |

---

## 22. Payment — State Machine & Allocation Invariants

| From → To                        | Trigger                                            | UI surface                       | Pass/Fail |
| -------------------------------- | -------------------------------------------------- | -------------------------------- | --------- |
| pending → posted                 | Confirm allocations                                | §21.6                            |           |
| posted → refunded_partial        | Refund executed (partial amount)                   | §25                              |           |
| posted → refunded_full           | Refund executed (full amount)                      | §25                              |           |
| refunded_partial → refunded_full | Second refund to full                              | §25                              |           |
| any → voided                     | Admin void (if implemented — confirm with product) | Not currently in the admin UI    |           |
| any → failed                     | External provider failure                          | Webhook or Stripe refund failure |           |

**Invariants after each mutation:**

- `SUM(allocated_amount WHERE payment_id=?) ≤ amount ± 0.01`
- `SUM(refunds.amount WHERE status='executed' AND payment_id=?) ≤ amount ± 0.01`
- `status = 'posted'` iff there's at least one allocation and no refund has reduced the available amount to zero
- See §48 for full invariant queries

---

## 23. Refunds — List

**URL:** `/{locale}/finance/refunds`

| #    | What to Check        | Expected Result                                                                                                                       | Pass/Fail |
| ---- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 23.1 | List columns         | refund_reference, payment_reference, household, amount, status badge, requested_by, reason (truncated), actions (dynamic per status). |           |
| 23.2 | Status filter        | all / pending_approval / approved / executed / failed / rejected. Resets page=1.                                                      |           |
| 23.3 | Create Refund button | Visible only when `canManage`. Opens create modal (§24).                                                                              |           |
| 23.4 | Empty state          | `<EmptyState icon={RotateCcw}>` when no rows + no filter.                                                                             |           |
| 23.5 | Pagination           | 20 per page.                                                                                                                          |           |

---

## 24. Refunds — Create Modal (Payment Search, Amount, Reason)

| #    | What to Check                | Expected Result                                                                                                                                                    | Pass/Fail |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 24.1 | Search phase                 | `GET /api/v1/finance/payments?search=<query>&pageSize=10`. Results render cards: reference, amount, household, refundable_amount = amount − sum(executed refunds). |           |
| 24.2 | Click a result               | Moves to detail phase. Selected payment summary shown.                                                                                                             |           |
| 24.3 | Change Payment button        | Returns to search phase.                                                                                                                                           |           |
| 24.4 | Amount input                 | type=number, min=0.01, step=0.01, max=refundable_amount. Client-side rejects out-of-range.                                                                         |           |
| 24.5 | Reason textarea              | Required non-empty.                                                                                                                                                |           |
| 24.6 | Submit                       | POST `/api/v1/finance/refunds` with `{ payment_id, amount, reason }`. 201. Modal closes; list refreshes. Toast `t('refundCreated')`.                               |           |
| 24.7 | 400 AMOUNT_EXCEEDS_AVAILABLE | Toast `t('refundExceedsAvailable')`.                                                                                                                               |           |
| 24.8 | 400 INVALID_PAYMENT_STATUS   | Toast error; modal stays open.                                                                                                                                     |           |

---

## 25. Refunds — Approve / Reject / Execute

| #     | What to Check                        | Expected Result                                                                                                                                                                                          | Pass/Fail |
| ----- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 25.1  | Approve — pending_approval row       | POST `/refunds/:id/approve` with optional `{ comment }`. Success toast `t('approveSuccess')`. Status → `approved`. Actions updated.                                                                      |           |
| 25.2  | Approve — self-approval blocked      | If refund `requested_by_user_id === current_user_id`, backend returns 403 `CANNOT_APPROVE_OWN_REFUND` (or similar). UI either hides the button OR surfaces the error. Test with admin1 + admin2 fixture. |           |
| 25.3  | Reject — modal                       | Textarea with `t('rejectCommentLabel')` label + `t('rejectCommentPlaceholder')`. Reject button disabled until non-empty.                                                                                 |           |
| 25.4  | Reject — POST                        | `POST /refunds/:id/reject` with `{ comment }`. Success toast `t('rejectSuccess')`. Status → `rejected`.                                                                                                  |           |
| 25.5  | Execute — approved row               | POST `/refunds/:id/execute`. If payment.method === 'stripe', calls Stripe.createRefund() via StripeService. If method is cash/bank_transfer/card_manual, purely DB state transition.                     |           |
| 25.6  | Execute — Stripe failure             | `STRIPE_REFUND_FAILED` → refund status → `failed`, `failure_reason` stored. Toast error.                                                                                                                 |           |
| 25.7  | Execute — transitions payment status | Payment → `refunded_partial` if cumulative refunded < payment.amount; → `refunded_full` if equal to payment.amount.                                                                                      |           |
| 25.8  | Loading state per row                | `actionLoading` flag per-id — only the clicked button shows spinner.                                                                                                                                     |           |
| 25.9  | Toast set                            | approveSuccess/Failed, rejectSuccess/Failed, executeSuccess/Failed — all translated.                                                                                                                     |           |
| 25.10 | Second admin required                | admin2 must approve admin1-requested refunds; verify with fixture.                                                                                                                                       |           |

---

## 26. Refunds — State Machine & Invariants

| From → To                   | Trigger                | UI    | Pass/Fail |
| --------------------------- | ---------------------- | ----- | --------- |
| pending_approval → approved | POST /approve          | §25.1 |           |
| pending_approval → rejected | POST /reject           | §25.3 |           |
| approved → executed         | POST /execute          | §25.5 |           |
| approved → failed           | Stripe execute failure | §25.6 |           |

**Invariants:**

- `SUM(refunds.amount WHERE status='executed' AND payment_id=?) ≤ payment.amount ± 0.01`
- Payment.status derives correctly from refund sum (§22.4, §48)

---

## 27. Credit Notes — List, Create, Apply, Expanded Row

**URL:** `/{locale}/finance/credit-notes`

| #    | What to Check                                | Expected Result                                                                                                                                                                                                       | Pass/Fail |
| ---- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 27.1 | List columns                                 | credit_note_number (mono), household (EntityLink), amount, remaining_balance (danger-700 if >0, success-700 if 0), reason (truncated), status badge (open/partially_used/fully_used/cancelled), issued_at, issued_by. |           |
| 27.2 | Create modal (`finance.manage_credit_notes`) | Form fields: household_id (HouseholdSelector), amount (>0), reason (1-2000). POST `/credit-notes`. 201. Generates `credit_note_number` via sequence.                                                                  |           |
| 27.3 | Apply modal                                  | Select an invoice (must belong to the credit note's household). Enter applied_amount. POST `/credit-notes/apply`. Validates credit_note.remaining_balance ≥ applied_amount AND invoice.balance ≥ applied_amount.      |           |
| 27.4 | Expanded row (click to expand)               | Shows application history — invoice_number, applied_amount, applied_at, applied_by.                                                                                                                                   |           |
| 27.5 | Apply — INSUFFICIENT_CREDIT_BALANCE          | Toast error; modal stays open.                                                                                                                                                                                        |           |
| 27.6 | Apply — INVALID_INVOICE_STATUS               | Toast error (invoice already paid/void/etc.).                                                                                                                                                                         |           |
| 27.7 | Status transitions                           | `open → partially_used` once any application exists; `partially_used → fully_used` when remaining_balance = 0.                                                                                                        |           |

---

## 28. Discounts — List + New + Edit + Auto-Apply

| #    | What to Check               | Expected Result                                                                                                                                                                                                        | Pass/Fail |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 28.1 | List columns                | name, discount_type (fixed/percent), value (% or `<CurrencyDisplay>` depending on type), auto_apply badge, active/inactive.                                                                                            |           |
| 28.2 | New form (`finance.manage`) | Fields: name (1-150), discount_type (select), value, active (default true), auto_apply (checkbox), auto_condition (object: type='sibling', min_students, or other rules) shown only when auto_apply=true.              |           |
| 28.3 | Zod refinements             | If discount_type=percent AND value>100 → 400. If auto_apply=true AND auto_condition missing → 400. Inline error via `makeDiscountFormSchema` factory using `t('discountPercentMax')` + `t('autoApplyNeedsCondition')`. |           |
| 28.4 | Update                      | PATCH includes same refinements (update schema inherits create refinements).                                                                                                                                           |           |
| 28.5 | Delete                      | Confirm → DELETE. 409 if active assignments reference it.                                                                                                                                                              |           |
| 28.6 | Auto-apply sibling rule     | With `type='sibling', min_students=2`, the discount auto-applies during fee generation (§12) for households with ≥2 students.                                                                                          |           |
| 28.7 | Back button                 | Uses `tCommon('back')` label.                                                                                                                                                                                          |           |

---

## 29. Scholarships — List, Create, Revoke

| #    | What to Check                                | Expected Result                                                                                                                                                               | Pass/Fail |
| ---- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 29.1 | List columns                                 | name, student, discount_type (fixed/percent), value, status (active/expired/revoked), award_date, renewal_date (or "—"), actions.                                             |           |
| 29.2 | Create modal (`finance.manage_scholarships`) | Fields: name, description (optional), student_id, discount_type, value, award_date, renewal_date (optional), fee_structure_id (optional — restrict to that structure's fees). |           |
| 29.3 | Zod                                          | Percent value ≤ 100 (via refine). POST → 201.                                                                                                                                 |           |
| 29.4 | Revoke modal                                 | Textarea for `reason` (required). POST `/scholarships/:id/revoke`. Status → `revoked`. `revocation_reason` stored.                                                            |           |
| 29.5 | Expired auto-transition                      | When `renewal_date < today`, a cron SHOULD transition `active → expired`. (Observation: no cron registered in worker — this transition may not be automatic; flag in §50.)    |           |
| 29.6 | Filter                                       | By status (all / active / expired / revoked) and student.                                                                                                                     |           |

---

## 30. Payment Plans — List, Create (Admin), Expanded Row, Cancel

**URL:** `/{locale}/finance/payment-plans`

| #    | What to Check      | Expected Result                                                                                                                                                                                                  | Pass/Fail |
| ---- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 30.1 | List columns       | household, invoice (link), original_balance, discount_amount (or "—"), status badge, installment count, reviewed_at, actions.                                                                                    |           |
| 30.2 | Empty state gating | Empty state ONLY when `statusFilter === 'active'` — other filters show data-table empty state instead.                                                                                                           |           |
| 30.3 | Status filter      | all / pending / approved / rejected / counter_offered / active / completed / cancelled.                                                                                                                          |           |
| 30.4 | Admin Create modal | POST `/payment-plans/admin-create` — `{ household_id, original_balance, discount_amount, discount_reason, installments[], admin_notes }`. Skips parent-request flow; creates plan in `approved` status directly. |           |
| 30.5 | Expanded row       | Shows proposed_installments details (date + amount + paid/outstanding per installment), admin_notes.                                                                                                             |           |
| 30.6 | Cancel action      | Confirm → POST `/payment-plans/:id/cancel`. Status → `cancelled`. Linked invoices' installments become invalid — verify invoice behaviour.                                                                       |           |

---

## 31. Payment Plans — Approve / Reject / Counter-Offer

| #    | What to Check                                | Expected Result                                                                                                                                                                       | Pass/Fail |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 31.1 | Approve (only on pending)                    | POST `/:id/approve` with optional `{ admin_notes }`. Status → `approved`. Creates invoice installments matching the plan's proposed_installments. Toast success.                      |           |
| 31.2 | Reject (only on pending)                     | POST `/:id/reject` with required `{ admin_notes }`. Status → `rejected`. Toast.                                                                                                       |           |
| 31.3 | Counter-offer (only on pending)              | POST `/:id/counter-offer` with `{ proposed_installments, admin_notes }`. Status → `counter_offered`. Parent must accept via `POST /parent/payment-plans/:id/accept` (not admin-side). |           |
| 31.4 | Admin approval triggers installment creation | On approve, invoice installments are created atomically. Verify `/invoices/:id/installments` reflects the plan.                                                                       |           |
| 31.5 | Invalid status transition                    | POST /approve on already-approved plan → 400 `INVALID_STATUS`.                                                                                                                        |           |

---

## 32. Reports — Aging / Fee Performance / Custom / CSV Export

**URL:** `/{locale}/finance/reports`

| #     | What to Check                     | Expected Result                                                                                                                                                                                                                  | Pass/Fail                                                                                               |
| ----- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --- |
| 32.1  | Tabs                              | Aging / Fee Performance / Custom. Date-range filter applies to Aging + Custom (fee performance ignores dates per backend contract).                                                                                              |                                                                                                         |
| 32.2  | Aging tab                         | `GET /api/v1/finance/reports/aging?date_from&date_to`. Redis cache key `finance:aging:{tenantId}:{date_from}:{date_to}`.                                                                                                         |                                                                                                         |
| 32.3  | Aging — buckets                   | 0-30, 31-60, 61-90, 90+. Currency via `<CurrencyDisplay>`. Color thresholds per row count.                                                                                                                                       |                                                                                                         |
| 32.4  | Fee Performance tab               | `GET /reports/fee-structure-performance`. Cache `finance:fee-structure-perf:{tenantId}` — ignores date filters.                                                                                                                  |                                                                                                         |
| 32.5  | Fee Performance columns           | fee_structure name, households_assigned (mono xs secondary LTR), total_billed, total_collected, collection_rate (1dp + %), default_rate (1dp + %). Color: ≥80 success-700 bold; ≥50 warning-700 bold; else danger-700 bold.      |                                                                                                         |
| 32.6  | Custom tab — filters              | year_group MultiCheckSelect, fee_type MultiCheckSelect, status (all/outstanding/paid), date range. Generate button.                                                                                                              |                                                                                                         |
| 32.7  | Custom — Generate                 | `GET /api/v1/finance/reports/custom?year_group_ids=csv&fee_type_ids=csv&date_from&date_to&status`. Each generate fires fresh (no cache). `status=all` omitted from query.                                                        |                                                                                                         |
| 32.8  | Custom — 11 columns               | student_name, student_number (mono xs LTR), class, household_name, billing_parent_name, billing_parent_phone (mono LTR), billing_parent_email (break-all LTR), fee_type, amount_billed, amount_paid, balance (danger-700 if >0). |                                                                                                         |
| 32.9  | Custom — tfoot totals             | "Total" label spans 8 cols. Sum of billed / paid / balance via `<CurrencyDisplay>`. Balance total always danger-700.                                                                                                             |                                                                                                         |
| 32.10 | Custom — Print                    | `window.print()`.                                                                                                                                                                                                                |                                                                                                         |
| 32.11 | Custom — Export CSV (client-side) | Generates CSV with `\uFEFF` BOM (Excel UTF-8 compat), MIME `text/csv;charset=utf-8;`. Filename `custom-finance-report-{YYYY-MM-DD}.csv`. Headers use translation keys. Double quotes in cells escaped by doubling.               |                                                                                                         |
| 32.12 | Other tabs — Export CSV           | Opens `/api/v1/finance/reports/export?report=aging                                                                                                                                                                               | fee_performance[&date_from&date_to]`in new tab via`window.open`. Custom tab is client-side (see 32.11). |     |
| 32.13 | Error paths                       | `console.error('[FinanceReportsPage]', err)`; `console.error('[CustomReportBuilder] loadOptions'                                                                                                                                 | 'generate', err)`.                                                                                      |     |

---

## 33. Household Statements — List, Detail Ledger, PDF

**URLs:** `/{locale}/finance/statements`, `/{locale}/finance/statements/[householdId]`

| #     | What to Check                | Expected Result                                                                                                                                                                                  | Pass/Fail      |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ----------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------- | --- |
| 33.1  | List — parallel fetches      | `GET /api/v1/households?page=&pageSize=20&search=` + `GET /api/v1/finance/dashboard/household-overview?pageSize=100`. Merged in memory on household_id.                                          |                |
| 33.2  | List columns                 | household_name, household_number (mono / "—"), billing_parent_name, phone (LTR / "—"), outstanding (`<CurrencyDisplay>` danger-text / "—"), Actions: View Statement button → `/statements/{id}`. |                |
| 33.3  | Empty state                  | `<EmptyState icon={ScrollText}>` (no action).                                                                                                                                                    |                |
| 33.4  | Detail — initial date range  | `fromDate = 12mo ago`, `toDate = today` (ISO `yyyy-mm-dd`).                                                                                                                                      |                |
| 33.5  | Detail — header              | PageHeader title `t('householdStatementTitle')`, description=`data.household.household_name`. Action: Preview PDF (`<FileText>` + `t('previewPdf')`).                                            |                |
| 33.6  | Detail — DateRangeFilter     | `<Calendar>` + label `t('from')` + date input + label `t('to')` + date input. Refetches on change.                                                                                               |                |
| 33.7  | Detail — ledger header       | Columns: `t('date')`, `t('type')`, `t('reference')`, `t('description')`, `t('debit')` (end), `t('credit')` (end), `t('runningBalance')` (end).                                                   |                |
| 33.8  | Detail — opening balance row | colspan=4, `t('openingBalance')`, debit/credit "—", running balance = opening_balance (default 0).                                                                                               |                |
| 33.9  | Detail — entry rows          | (a) formatted date; (b) `<EntryTypeBadge>` via `entryTypeLabelKeyMap` → `t('entryInvoice'                                                                                                        | 'entryPayment' | 'entryAllocation' | 'entryRefund' | 'entryWriteOff')`; (c) reference mono max-w-[180px] truncated; (d) description max-w-[300px]; (e-g) debit/credit/running balance. |     |
| 33.10 | Detail — sign convention     | `invoice_issued` → debit=total. `write_off` (if >0) → credit=write_off_amount. `payment_received` → credit=amount. `refund` → debit=refund_amount. Running balance = cumulative.                 |                |
| 33.11 | Detail — closing balance row | colspan=4, `t('closingBalance')`, running balance semibold.                                                                                                                                      |                |
| 33.12 | Detail — empty               | `<p>{t('noTransactions')}</p>` in bottom card.                                                                                                                                                   |                |
| 33.13 | Detail — currency formatting | `Intl.NumberFormat('en-US', style=currency)`. null → "—". Invalid code → USD fallback. Fallback on Intl error → `"{code} {value.toFixed(2)}"`.                                                   |                |
| 33.14 | PDF                          | PdfPreviewModal with `pdfUrl = /api/v1/finance/household-statements/{id}/pdf?date_from=&date_to=`. Content-Disposition `inline; filename="statement-{id}.pdf"`. `?locale=ar` → Arabic template.  |                |
| 33.15 | PDF date range — day-end     | `date_to` parsed as `T23:59:59.999Z` → includes same-day payments.                                                                                                                               |                |

---

## 34. Debt Breakdown — Bucket Filter & Table

**URL:** `/{locale}/finance/debt-breakdown[?bucket=0_10|10_30|30_50|50_plus]`

| #    | What to Check       | Expected Result                                                                                                                                                                                            | Pass/Fail |
| ---- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 34.1 | Navigate            | `GET /api/v1/finance/dashboard/debt-breakdown[?bucket]`. Reads `?bucket` on mount.                                                                                                                         |           |
| 34.2 | Header              | Back button → `/finance`. PageHeader `t('debtBreakdown.title')`. Action: Print (`<Printer>` + `t('debtBreakdown.print')`).                                                                                 |           |
| 34.3 | Bucket tabs         | all, 0_10, 10_30, 30_50, 50_plus. Active tab `bg-primary text-white shadow-sm`; inactive `border border-border bg-surface`. Colored dot for non-all: success-400 / warning-400 / warning-600 / danger-500. |           |
| 34.4 | URL sync            | Clicking a bucket tab writes `router.replace(pathname?bucket=X)` (or clears it for all). Browser back/forward + deep-linking work.                                                                         |           |
| 34.5 | Summary strip       | Only when `!isLoading && rows.length > 0`. Two blocks: households count via `t('householdsPluralLabel')` (no appended literal `s`), total outstanding (`<CurrencyDisplay>` text-lg font-bold danger-600).  |           |
| 34.6 | Table columns       | household_name, billing_parent_name ("—"), billing_parent_phone (mono LTR "—"), total_billed, outstanding, pct_owed (pill), invoice_count (mono secondary LTR).                                            |           |
| 34.7 | pct pill thresholds | ≤10 success; ≤30 warning; ≤50 warning-dark; else danger.                                                                                                                                                   |           |
| 34.8 | Row click           | `window.location.assign('/{locale}/finance/statements/{household_id}')` (hard nav).                                                                                                                        |           |
| 34.9 | Error path          | `console.error('[DebtBreakdown]', err)` + `setRows([])` (stale data cleared).                                                                                                                              |           |

---

## 35. Audit Trail — List & Filters

**URL:** `/{locale}/finance/audit-trail`

| #    | What to Check                          | Expected Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Pass/Fail |
| ---- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 35.1 | pageSize=25 (differs from other lists) | API returns `pageSize=25`. Pagination computes `Math.ceil(total/25)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |           |
| 35.2 | Export CSV                             | `window.open(\`${NEXT_PUBLIC_API_URL}/api/v1/audit-logs/export?domain=finance&...\`, '\_blank')` — domain filter included.                                                                                                                                                                                                                                                                                                                                                                                                                   |           |
| 35.3 | entity_type filter                     | all/invoice/payment/refund/receipt/fee_structure/fee_type/discount/fee_assignment/credit_note/scholarship. Translated labels.                                                                                                                                                                                                                                                                                                                                                                                                                |           |
| 35.4 | search + date_from + date_to           | Search over actor name / reference / description. Dates mobile-friendly `w-full sm:w-[150px]`.                                                                                                                                                                                                                                                                                                                                                                                                                                               |           |
| 35.5 | Columns                                | created_at (mono xs secondary LTR), actor (name / "—"), action pill (create=success/update=info/delete=danger color classes), entity_type (underscores → spaces, capitalize), reference (`getEntityReference(row)` priority: invoice_number > receipt_number > payment_reference > credit_note_number > name > reference > 8-char truncated uuid + "…" > "—"; may include `<a>` link via ENTITY_LINK_MAP for invoice/payment/refund/fee_structure/credit_note/scholarship), description (ICU keys `auditDescCreated/Updated/Deleted/Other`). |           |

---

## 36. Late Fee Configurations (Backend-Only API)

No UI. Exercise via curl / Postman.

| #     | What to Check                                | Expected Result                                                                                  | Pass/Fail                                                                                                 |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --- |
| 36.1  | GET `/api/v1/finance/late-fee-configs`       | Paginated list. `finance.view`.                                                                  |                                                                                                           |
| 36.2  | POST valid body                              | `{ name, fee_type: fixed                                                                         | percent, value, grace_period_days, max_applications, frequency_days? }`. `finance.manage_late_fees`. 201. |     |
| 36.3  | PATCH `/api/v1/finance/late-fee-configs/:id` | 200 on success (method is PATCH — previously PUT).                                               |                                                                                                           |
| 36.4  | Apply late fee                               | `POST /api/v1/finance/invoices/:id/apply-late-fee[?config_id=<id>]`. `finance.manage_late_fees`. |                                                                                                           |
| 36.5  | 400 INVALID_INVOICE_STATUS                   | Invoice not payable → 400.                                                                       |                                                                                                           |
| 36.6  | 400 WITHIN_GRACE_PERIOD                      | `due_date + grace_period_days > today`.                                                          |                                                                                                           |
| 36.7  | 400 MAX_LATE_FEE_APPLICATIONS_REACHED        | Already applied `max_applications` times.                                                        |                                                                                                           |
| 36.8  | 400 TOO_SOON_FOR_NEXT_APPLICATION            | `frequency_days` not elapsed since last application.                                             |                                                                                                           |
| 36.9  | fixed vs percent math                        | fixed → line amount = value; percent → line amount = roundMoney(invoice.total × value/100).      |                                                                                                           |
| 36.10 | 404 LATE_FEE_CONFIG_NOT_FOUND                | config_id not in tenant.                                                                         |                                                                                                           |

---

## 37. Recurring Invoice Configurations (Backend-Only API)

| #    | What to Check                           | Expected Result                                                              | Pass/Fail                                             |
| ---- | --------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- | --- |
| 37.1 | GET `/api/v1/finance/recurring-configs` | List. `finance.view`.                                                        |                                                       |
| 37.2 | POST body                               | `{ fee_structure_id, frequency: monthly                                      | term, next_generation_date }`. 201. `finance.manage`. |     |
| 37.3 | frequency `one_off`/`custom`            | 400 — schema only accepts `monthly` / `term`.                                |                                                       |
| 37.4 | PATCH `/recurring-configs/:id`          | 200. (Previously PUT; now PATCH.)                                            |                                                       |
| 37.5 | POST `/recurring-configs/generate`      | Returns `{ generated: n }`. Synchronous (no worker job — per worker survey). |                                                       |
| 37.6 | autoIssueRecurringInvoices=false        | New invoices status `draft`, `issue_date=null`.                              |                                                       |
| 37.7 | autoIssueRecurringInvoices=true         | status `issued`, `issue_date=now`.                                           |                                                       |
| 37.8 | computeNextDate                         | monthly → +1 month; term → +90 days. `last_generated_at = now`.              |                                                       |

---

## 38. Payment Reminder Endpoints (Backend-Only API)

| #    | What to Check                             | Expected Result                                                                                                                                             | Pass/Fail |
| ---- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 38.1 | POST `/api/v1/finance/reminders/due-soon` | `{ sent: n }`. `finance.manage`. Synchronous.                                                                                                               |           |
| 38.2 | paymentReminderEnabled=false              | `{ sent: 0 }`, no reminder rows written.                                                                                                                    |           |
| 38.3 | Dedupe                                    | Invoice already has a `due_soon` reminder → skipped.                                                                                                        |           |
| 38.4 | POST `/reminders/overdue`                 | Qualifying: status ∈ {overdue,issued,partially_paid} AND past due AND no prior overdue reminder.                                                            |           |
| 38.5 | POST `/reminders/final-notice`            | Qualifying: status ∈ {overdue,issued,partially_paid} AND past due+finalNoticeDays AND no prior final_notice reminder.                                       |           |
| 38.6 | Note                                      | **Reminder dispatch is NOT integrated with notifications module** — the service writes the dedupe row but does not send email/whatsapp/in_app. Flag in §50. |           |

---

## 39. Bulk Operations (Backend-Only API)

| #    | What to Check                     | Expected Result                                                                           | Pass/Fail                                                   |
| ---- | --------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --- |
| 39.1 | POST `/api/v1/finance/bulk/issue` | Body `{ invoice_ids[] }` (max 200). Issues each. Returns `{ succeeded: [], failed: [] }`. |                                                             |
| 39.2 | POST `/bulk/void`                 | Voids each.                                                                               |                                                             |
| 39.3 | POST `/bulk/remind`               | Queues reminders.                                                                         |                                                             |
| 39.4 | POST `/bulk/export`               | JSON body with format=csv                                                                 | pdf. Returns JSON (not file stream) — intentional, see §50. |     |
| 39.5 | 400 max exceeded                  | >200 ids → 400 from Zod `bulkInvoiceIdsSchema`.                                           |                                                             |

---

## 40. Stripe Webhook — Signature & Idempotency

| #    | What to Check                      | Expected Result                                                                                                                           | Pass/Fail |
| ---- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 40.1 | POST `/api/v1/stripe/webhook`      | No auth guard. Requires `stripe-signature` header + raw body. `@SkipThrottle()` decorator applied — high-frequency webhooks pass through. |           |
| 40.2 | Missing signature                  | 400 `INVALID_SIGNATURE`.                                                                                                                  |           |
| 40.3 | Invalid signature                  | 400 `INVALID_SIGNATURE`.                                                                                                                  |           |
| 40.4 | Missing tenant_id metadata         | 400 `MISSING_TENANT_ID`.                                                                                                                  |           |
| 40.5 | Tenant mismatch                    | 400 `TENANT_MISMATCH`.                                                                                                                    |           |
| 40.6 | Valid `checkout.session.completed` | Records payment (status=posted), allocates to invoice by metadata.invoice_id, invoice status transitions.                                 |           |
| 40.7 | Duplicate delivery                 | Second delivery is idempotent — no duplicate payment rows. Verified via `external_event_id` unique in payments table.                     |           |
| 40.8 | `charge.refunded`                  | Updates payment status to refunded_partial/refunded_full. Refund row updated with executed state.                                         |           |
| 40.9 | Unknown event type                 | Logged + 200 returned (ignored). Does NOT fail.                                                                                           |           |

Full webhook contract tests (signature + idempotency + tenant mismatch matrix) live in `/e2e-integration`.

---

## 41. Currency Update Endpoint

| #    | What to Check                              | Expected Result                                                                                                                                                         | Pass/Fail |
| ---- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 41.1 | GET `/api/v1/finance/dashboard/currency`   | `{ data: { currency_code: 'EUR' } }` (tenant currency).                                                                                                                 |           |
| 41.2 | PATCH `/api/v1/finance/dashboard/currency` | `finance.manage`. Body `{ currency_code: 'USD' }`. 200. Updates tenant currency.                                                                                        |           |
| 41.3 | Invalid code                               | 400 (Zod 3-char alpha validation).                                                                                                                                      |           |
| 41.4 | Multi-currency prohibition                 | Changing currency when existing invoices/payments have a different code should be blocked or warned. Per CLAUDE.md "no multi-currency", this is a permanent constraint. |           |

---

## 42. End-to-End Flow Matrix

Each row is a complete workflow. Run top-to-bottom; each depends on prior fixtures in this section holding.

| #    | Flow                                                    | Expected post-conditions                                                                                                                                                                    | Pass/Fail |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 42.1 | Fee setup → generation → invoice → payment → allocation | Fee type + structure + assignment exist. Generation creates N invoices. Manual payment matches one invoice. Allocation confirms. Invoice `paid`, payment `posted`, balance invariant holds. |           |
| 42.2 | Stripe checkout → auto-allocation → receipt             | Parent pays via Stripe test card. Webhook `checkout.session.completed` → payment row + allocation + receipt. Invoice status `paid`. Receipt PDF opens.                                      |           |
| 42.3 | Partial payment → credit note → invoice closure         | €500 invoice partially paid €300 → `partially_paid`. Issue credit note €200 + apply → invoice `paid`.                                                                                       |           |
| 42.4 | Refund request → approve → execute → reversal           | Stripe payment € 200 → refund €100 → Stripe refund executed → payment `refunded_partial`. Invoice balance reverts to €100 (reversal of allocation).                                         |           |
| 42.5 | Overdue invoice → late fee → reminder → write-off       | Invoice past due → `overdue` via worker (§40 worker spec). Late fee applied via §36. Reminder sent via §38. Write-off via §15.9 → status `written_off`.                                     |           |
| 42.6 | Payment plan request → admin counter → parent accept    | Parent requests plan → admin counters (§31.3). Parent accepts (tested in parent spec). Plan → `approved`. Installments created on invoice.                                                  |           |
| 42.7 | Approval-required invoice issue                         | tenantSettings.requireApprovalForInvoiceIssue=true. admin1 issues draft → `pending_approval`. admin2 approves → `issued` (after worker runs `invoice-approval-callback`).                   |           |
| 42.8 | Scholarship application → revocation                    | Create scholarship (§29.2). Applied to future invoice lines. Revoke (§29.4) → reversal check.                                                                                               |           |

---

## 43. Permission & Role Guard Tests

| #     | Role                                    | Endpoint                            | Expected                        | Pass/Fail |
| ----- | --------------------------------------- | ----------------------------------- | ------------------------------- | --------- |
| 43.1  | teacher (no finance.\*)                 | GET /finance/invoices               | 403                             |           |
| 43.2  | teacher                                 | POST /finance/payments              | 403                             |           |
| 43.3  | finance.view (only)                     | POST /finance/invoices              | 403 (needs finance.manage)      |           |
| 43.4  | finance.view                            | POST /finance/refunds               | 403                             |           |
| 43.5  | finance.manage (no manage_credit_notes) | POST /finance/credit-notes          | 403                             |           |
| 43.6  | finance.manage                          | POST /finance/scholarships          | 403 (needs manage_scholarships) |           |
| 43.7  | finance.view_reports only               | GET /finance/reports/custom         | 200                             |           |
| 43.8  | finance.view_reports only               | POST /finance/bulk/issue            | 403 (needs bulk_operations)     |           |
| 43.9  | unauthenticated                         | GET /finance/dashboard              | 401                             |           |
| 43.10 | parent                                  | any /finance/\* admin endpoint      | 403                             |           |
| 43.11 | cross-tenant admin                      | GET /finance/invoices/{tenant-B-id} | 404 (never 200 with B data)     |           |
| 43.12 | expired JWT                             | any endpoint                        | 401                             |           |
| 43.13 | JWT with tampered permissions           | any endpoint                        | 401 (signature invalid)         |           |

Full role × endpoint matrix in `/e2e-security-audit`.

---

## 44. Tenant Isolation (RLS) UI-Side Tests

The DB-level RLS matrix lives in `/e2e-integration`. This section covers observable-from-UI tenant leakage checks.

| #    | What to Check                                              | Expected Result                                                                                                                                                        | Pass/Fail |
| ---- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 44.1 | Log in as Tenant A admin                                   | Dashboard shows ONLY Tenant A data — zero Tenant B invoices, zero Tenant B households referenced anywhere in the DOM.                                                  |           |
| 44.2 | Currency mismatch check                                    | Tenant A UI shows EUR everywhere; switching to Tenant B shows USD. No currency mixing in any page.                                                                     |           |
| 44.3 | Direct-URL cross-tenant attempt                            | As Tenant A admin, navigate to `/finance/invoices/{tenant-B-invoice-id}`. Backend returns 404 — UI shows "Invoice not found" empty state. Never renders Tenant B data. |           |
| 44.4 | Same for payments, refunds, credit notes, statements, etc. | Each cross-tenant direct URL returns 404 in the API and an empty/404 UI. No leak.                                                                                      |           |
| 44.5 | Logout + login Tenant B                                    | Dashboard renders Tenant B data (50 invoices, 15 payments, USD). No cached Tenant A data visible.                                                                      |           |
| 44.6 | Sequence numbers per-tenant                                | `invoice_number` starts at 1 per tenant. Tenant A's INV-202604-000001 and Tenant B's INV-202604-000001 coexist. Verified via §49 endpoint map.                         |           |

---

## 45. Arabic / RTL Verification

| #     | What to Check                     | Expected Result                                                                                                                             | Pass/Fail |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | -------------- | --- |
| 45.1  | `<html dir="rtl" lang="ar">`      | Every `/ar/*` page.                                                                                                                         |           |
| 45.2  | Logical spacing everywhere        | No `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`/`text-right` classes in any finance component. Lint enforces this (zero-tolerance). |           |
| 45.3  | Currency wrapped LTR              | Every amount `<span dir="ltr">`. Western numerals.                                                                                          |           |
| 45.4  | Date formatting                   | Gregorian calendar + Arabic month name (e.g. "إبريل") but Western numerals for day/year.                                                    |           |
| 45.5  | Invoice/receipt PDFs `?locale=ar` | Template direction flips; Arabic content; numerics LTR.                                                                                     |           |
| 45.6  | Status badge labels               | Translated via `t('invoiceStatus.*')` etc.                                                                                                  |           |
| 45.7  | Aging buckets                     | Translated via `AGING_BUCKET_LABEL_KEYS`.                                                                                                   |           |
| 45.8  | Statement ledger entry type       | Translated via `entryTypeLabelKeyMap`.                                                                                                      |           |
| 45.9  | Method labels                     | `methodLabelKeyMap` → `t('stripe                                                                                                            | cash      | bankTransfer | cardManual')`. |     |
| 45.10 | Installment status                | `installmentStatusLabelKeyMap` → `t('pending                                                                                                | paid      | overdue')`.  |                |
| 45.11 | Toast messages                    | All translated. No English fallback.                                                                                                        |           |
| 45.12 | Pluralization                     | `householdsPluralLabel` key correctly handles 0/1/many.                                                                                     |           |
| 45.13 | Audit description                 | ICU keys `auditDescCreated/Updated/Deleted/Other` with `{entity}`/`{ref}` interpolation.                                                    |           |
| 45.14 | Empty state illustrations         | Identical; titles + descriptions translated.                                                                                                |           |

---

## 46. Mobile Responsiveness (375px Viewport)

| #     | What to Check           | Expected Result                                                                      | Pass/Fail |
| ----- | ----------------------- | ------------------------------------------------------------------------------------ | --------- |
| 46.1  | Top-level finance shell | Morph bar collapsed; hamburger opens nav overlay. Sub-strip horizontally scrollable. |           |
| 46.2  | Dashboard KPI cards     | Stack vertically (grid-cols-1 at <sm, grid-cols-2 at sm, grid-cols-4 at lg).         |           |
| 46.3  | Quick Actions           | 2×2 grid at sm; 1×4 stack at xs.                                                     |           |
| 46.4  | Tables                  | Every finance table wraps in `overflow-x-auto`. First column sticky optional.        |           |
| 46.5  | Status/filter toolbars  | Wrap; selects full width on mobile.                                                  |           |
| 46.6  | Invoice list            | Horizontal scroll on small viewport. Action buttons collapse to kebab menu if > 3.   |           |
| 46.7  | Modals                  | `sm:max-w-lg` → full-width on mobile. Content scrolls.                               |           |
| 46.8  | Fee generation wizard   | Each step fits viewport. Preview table scrolls horizontally.                         |           |
| 46.9  | HouseholdSelector       | Popover width = trigger width (`--radix-popover-trigger-width`).                     |           |
| 46.10 | Tap targets             | Every interactive element ≥ 44×44px.                                                 |           |
| 46.11 | Input font-size         | ≥ 16px to prevent iOS auto-zoom on focus.                                            |           |
| 46.12 | No horizontal overflow  | Main content `flex-1 min-w-0 overflow-x-hidden`. Verify via DevTools.                |           |
| 46.13 | Currency values         | Never break/wrap mid-number. `whitespace-nowrap` where necessary.                    |           |

---

## 47. Console & Network Health

| #    | What to Check               | Expected Result                                                                                                                                     | Pass/Fail |
| ---- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 47.1 | Full pass                   | Zero uncaught errors. Only deliberate `console.error('[...]', err)` logs fire on actual error paths.                                                |           |
| 47.2 | No unexpected 4xx           | Expected 401 only on auth flows; 403 only on deliberate permission tests (§43); 404 only on direct-URL cross-tenant tests (§44). No 429 surprises.  |           |
| 47.3 | No 5xx                      | Any 5xx = P0. Flag immediately.                                                                                                                     |           |
| 47.4 | Polling cadence             | None. Dashboard + lists are imperative fetches, not intervals.                                                                                      |           |
| 47.5 | Debounce                    | 300ms on invoice-list search. No debounce on payment-list reference search (by design).                                                             |           |
| 47.6 | `_t` cache-bust on currency | Always present. No 304s on currency.                                                                                                                |           |
| 47.7 | CSRF / CORS                 | Bearer token in Authorization header. `credentials: 'include'` for refresh flow. CORS `Access-Control-Allow-Origin` matches the tenant origin only. |           |
| 47.8 | No localStorage tokens      | Confirmed (§3.6).                                                                                                                                   |           |
| 47.9 | No duplicate bundle fetches | Each page's JS bundle loads exactly once per navigation.                                                                                            |           |

---

## 48. Data Invariants — After Each Major Flow

Run the corresponding SQL (or API read) after each flow and assert the invariant holds. See `/e2e-integration` for the full machine-executable matrix.

| #     | Invariant                                                    | Check                                                                                                                                                                   | Pass/Fail |
| ----- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 48.1  | Invoice balance equation                                     | `SELECT balance_amount FROM invoices WHERE id=?` = `total_amount - SUM(payment_allocations.allocated_amount WHERE invoice_id=?) - COALESCE(write_off_amount,0)` ± 0.01. |           |
| 48.2  | Payment allocation cap                                       | `SUM(payment_allocations.allocated_amount WHERE payment_id=?) <= payment.amount` ± 0.01.                                                                                |           |
| 48.3  | Refund cap                                                   | `SUM(refunds.amount WHERE payment_id=? AND status='executed') <= payment.amount` ± 0.01.                                                                                |           |
| 48.4  | Payment status derived                                       | payment.status = 'posted' iff sum of executed refunds < amount; = 'refunded_partial' iff 0<sum<amount; = 'refunded_full' iff sum=amount.                                |           |
| 48.5  | Credit note remaining balance                                | `credit_notes.remaining_balance = amount - SUM(credit_note_applications.applied_amount WHERE credit_note_id=?)` ± 0.01; >= 0.                                           |           |
| 48.6  | Credit note status derived                                   | status = 'open' iff remaining_balance = amount; 'partially_used' iff 0<r<amount; 'fully_used' iff r=0; 'cancelled' is terminal.                                         |           |
| 48.7  | Fee generation — one invoice per (household, billing_period) | `SELECT COUNT(*) FROM invoices WHERE household_id=? AND billing_period_start=?` after §12 confirm = expected count; 0 duplicates.                                       |           |
| 48.8  | Every tenant-scoped write has correct tenant_id              | `SELECT DISTINCT tenant_id FROM invoices WHERE id IN (<just-created-ids>)` returns exactly Tenant A's id.                                                               |           |
| 48.9  | Sequence monotonicity                                        | `tenant_sequences.current_value` strictly increases for each `(tenant_id, sequence_type)` pair; no gaps by design.                                                      |           |
| 48.10 | Audit log consistency                                        | Every mutation has an `audit_log` row with correct actor_id, entity_type, entity_id, action, before/after.                                                              |           |
| 48.11 | No orphan rows                                               | Every FK is valid after the flow. E.g. payment_allocations.payment_id + .invoice_id both exist and belong to the same tenant.                                           |           |

---

## 49. Backend Endpoint Map (All 90 Admin Routes)

Tester confirms each returns 2xx for admin and 403 for non-finance roles. Routes are grouped by controller.

### fee-types.controller + fee-structures.controller + fee-assignments.controller + discounts.controller

| Method | Path                                | Permission     | Spec § |
| ------ | ----------------------------------- | -------------- | ------ |
| GET    | /v1/finance/fee-types               | finance.view   | §9     |
| GET    | /v1/finance/fee-types/:id           | finance.view   | §9     |
| POST   | /v1/finance/fee-types               | finance.manage | §9     |
| PATCH  | /v1/finance/fee-types/:id           | finance.manage | §9     |
| DELETE | /v1/finance/fee-types/:id           | finance.manage | §9     |
| GET    | /v1/finance/fee-structures          | finance.view   | §10    |
| GET    | /v1/finance/fee-structures/:id      | finance.view   | §10    |
| POST   | /v1/finance/fee-structures          | finance.manage | §10    |
| PATCH  | /v1/finance/fee-structures/:id      | finance.manage | §10    |
| DELETE | /v1/finance/fee-structures/:id      | finance.manage | §10    |
| GET    | /v1/finance/fee-assignments         | finance.view   | §11    |
| GET    | /v1/finance/fee-assignments/:id     | finance.view   | §11    |
| POST   | /v1/finance/fee-assignments         | finance.manage | §11    |
| PATCH  | /v1/finance/fee-assignments/:id     | finance.manage | §11    |
| POST   | /v1/finance/fee-assignments/:id/end | finance.manage | §11    |
| GET    | /v1/finance/discounts               | finance.view   | §28    |
| GET    | /v1/finance/discounts/:id           | finance.view   | §28    |
| POST   | /v1/finance/discounts               | finance.manage | §28    |
| PATCH  | /v1/finance/discounts/:id           | finance.manage | §28    |
| DELETE | /v1/finance/discounts/:id           | finance.manage | §28    |

### fee-generation

| Method | Path                               | Permission     | Spec § |
| ------ | ---------------------------------- | -------------- | ------ |
| POST   | /v1/finance/fee-generation/preview | finance.manage | §12    |
| POST   | /v1/finance/fee-generation/confirm | finance.manage | §12    |

### invoices

| Method | Path                                    | Permission               | Spec §    |
| ------ | --------------------------------------- | ------------------------ | --------- |
| GET    | /v1/finance/invoices                    | finance.view             | §14       |
| GET    | /v1/finance/invoices/:id                | finance.view             | §15       |
| GET    | /v1/finance/invoices/:id/preview        | finance.view             | §15       |
| GET    | /v1/finance/invoices/:id/pdf            | finance.view             | §15 (PDF) |
| POST   | /v1/finance/invoices                    | finance.manage           | §42       |
| PATCH  | /v1/finance/invoices/:id                | finance.manage           | §15       |
| POST   | /v1/finance/invoices/:id/issue          | finance.manage           | §15       |
| POST   | /v1/finance/invoices/:id/void           | finance.manage           | §15       |
| POST   | /v1/finance/invoices/:id/cancel         | finance.manage           | §15       |
| POST   | /v1/finance/invoices/:id/write-off      | finance.manage           | §15       |
| GET    | /v1/finance/invoices/:id/installments   | finance.view             | §16       |
| POST   | /v1/finance/invoices/:id/installments   | finance.manage           | §16       |
| DELETE | /v1/finance/invoices/:id/installments   | finance.manage           | §16       |
| POST   | /v1/finance/invoices/:id/apply-late-fee | finance.manage_late_fees | §36       |

### payments

| Method | Path                                         | Permission     | Spec §    |
| ------ | -------------------------------------------- | -------------- | --------- |
| GET    | /v1/finance/payments                         | finance.view   | §19       |
| GET    | /v1/finance/payments/staff                   | finance.manage | §19       |
| GET    | /v1/finance/payments/:id                     | finance.view   | §21       |
| POST   | /v1/finance/payments                         | finance.manage | §20       |
| GET    | /v1/finance/payments/:id/allocations/suggest | finance.manage | §21       |
| POST   | /v1/finance/payments/:id/allocations         | finance.manage | §21       |
| GET    | /v1/finance/payments/:id/receipt             | finance.view   | §21       |
| GET    | /v1/finance/payments/:id/receipt/pdf         | finance.view   | §21 (PDF) |

### refunds

| Method | Path                            | Permission     | Spec § |
| ------ | ------------------------------- | -------------- | ------ |
| GET    | /v1/finance/refunds             | finance.view   | §23    |
| POST   | /v1/finance/refunds             | finance.manage | §24    |
| POST   | /v1/finance/refunds/:id/approve | finance.manage | §25    |
| POST   | /v1/finance/refunds/:id/reject  | finance.manage | §25    |
| POST   | /v1/finance/refunds/:id/execute | finance.manage | §25    |

### credit-notes / scholarships / late-fee-configs / recurring-configs / payment-plans / audit-trail

| Method | Path                                        | Permission                  | Spec § |
| ------ | ------------------------------------------- | --------------------------- | ------ |
| GET    | /v1/finance/credit-notes                    | finance.view                | §27    |
| GET    | /v1/finance/credit-notes/:id                | finance.view                | §27    |
| POST   | /v1/finance/credit-notes                    | finance.manage_credit_notes | §27    |
| POST   | /v1/finance/credit-notes/apply              | finance.manage_credit_notes | §27    |
| GET    | /v1/finance/late-fee-configs                | finance.view                | §36    |
| GET    | /v1/finance/late-fee-configs/:id            | finance.view                | §36    |
| POST   | /v1/finance/late-fee-configs                | finance.manage_late_fees    | §36    |
| PATCH  | /v1/finance/late-fee-configs/:id            | finance.manage_late_fees    | §36    |
| GET    | /v1/finance/scholarships                    | finance.view                | §29    |
| GET    | /v1/finance/scholarships/:id                | finance.view                | §29    |
| POST   | /v1/finance/scholarships                    | finance.manage_scholarships | §29    |
| POST   | /v1/finance/scholarships/:id/revoke         | finance.manage_scholarships | §29    |
| GET    | /v1/finance/recurring-configs               | finance.view                | §37    |
| GET    | /v1/finance/recurring-configs/:id           | finance.view                | §37    |
| POST   | /v1/finance/recurring-configs               | finance.manage              | §37    |
| PATCH  | /v1/finance/recurring-configs/:id           | finance.manage              | §37    |
| POST   | /v1/finance/recurring-configs/generate      | finance.manage              | §37    |
| GET    | /v1/finance/payment-plans                   | finance.view                | §30    |
| POST   | /v1/finance/payment-plans/admin-create      | finance.manage              | §30    |
| GET    | /v1/finance/payment-plans/:id               | finance.view                | §30    |
| POST   | /v1/finance/payment-plans/:id/approve       | finance.manage              | §31    |
| POST   | /v1/finance/payment-plans/:id/reject        | finance.manage              | §31    |
| POST   | /v1/finance/payment-plans/:id/counter-offer | finance.manage              | §31    |
| POST   | /v1/finance/payment-plans/:id/cancel        | finance.manage              | §30    |
| GET    | /v1/finance/audit-trail                     | finance.view                | §35    |

### reports / dashboard / statements / reminders / bulk / webhook

| Method | Path                                          | Permission              | Spec §       |
| ------ | --------------------------------------------- | ----------------------- | ------------ |
| GET    | /v1/finance/reports/aging                     | finance.view_reports    | §32          |
| GET    | /v1/finance/reports/revenue-by-period         | finance.view_reports    | §32 (direct) |
| GET    | /v1/finance/reports/collection-by-year-group  | finance.view_reports    | §32 (direct) |
| GET    | /v1/finance/reports/payment-methods           | finance.view_reports    | direct       |
| GET    | /v1/finance/reports/fee-structure-performance | finance.view_reports    | §32          |
| GET    | /v1/finance/reports/custom                    | finance.view_reports    | §32          |
| GET    | /v1/finance/reports/export                    | finance.view_reports    | §32.12       |
| GET    | /v1/finance/dashboard                         | finance.view            | §5           |
| GET    | /v1/finance/dashboard/debt-breakdown          | finance.view            | §34          |
| GET    | /v1/finance/dashboard/household-overview      | finance.view            | §8           |
| GET    | /v1/finance/dashboard/currency                | finance.view            | §41          |
| PATCH  | /v1/finance/dashboard/currency                | finance.manage          | §41          |
| GET    | /v1/finance/household-statements/:householdId | finance.view            | §33          |
| GET    | /v1/finance/household-statements/:id/pdf      | finance.view            | §33 (PDF)    |
| POST   | /v1/finance/reminders/due-soon                | finance.manage          | §38          |
| POST   | /v1/finance/reminders/overdue                 | finance.manage          | §38          |
| POST   | /v1/finance/reminders/final-notice            | finance.manage          | §38          |
| POST   | /v1/finance/bulk/issue                        | finance.bulk_operations | §39          |
| POST   | /v1/finance/bulk/void                         | finance.bulk_operations | §39          |
| POST   | /v1/finance/bulk/remind                       | finance.bulk_operations | §39          |
| POST   | /v1/finance/bulk/export                       | finance.bulk_operations | §39          |
| POST   | /v1/stripe/webhook                            | (signature-auth)        | §40          |

**Not in scope (parent-only, documented in `parent_view` spec):**
`GET /v1/parent/students/:studentId/finances`, `POST /v1/parent/invoices/:id/pay`, `POST /v1/parent/invoices/:id/request-payment-plan`, `POST /v1/parent/payment-plans/:id/accept`.

---

## 50. Observations & Bugs Flagged During Walkthrough

These are issues found during the spec walkthrough. User decides which to fix before hand-off vs backlog. Do NOT silently fix.

### P1 — parent-side endpoint mismatches (also in parent spec §29)

1. Frontend calls `/api/v1/parent/finances`, `/api/v1/parent/finances/invoices/:id/checkout`, `/api/v1/parent/finances/payments/:id/receipt`, `/api/v1/parent/finances/payment-plan-requests` — none exist on backend (`parent-finance.controller.ts` exposes `students/:id/finances`, `invoices/:id/pay`, `invoices/:id/request-payment-plan`). Parent portal is broken in production. P1.

### P2 — worker/cron gaps

2. **No cron scheduled for `overdue-detection` job** (per worker survey). The processor exists but `CronSchedulerService` has no registration for it. Currently overdue transitions would only happen if someone manually triggers the job. P2 — schedule it in CronSchedulerService.
3. **Payment reminders dispatch is synchronous with no notifications integration.** `PaymentRemindersService.sendDueSoonReminders` writes dedupe rows but does not dispatch email/whatsapp/in_app. Reminders are a no-op in production from the parent's perspective. P2.
4. **Scholarship auto-expiration** — no cron transitions `active → expired` when `renewal_date < today`. Scholarships stay `active` forever unless manually revoked. P2.
5. **Recurring invoice generation is synchronous** — `POST /recurring-configs/generate` must be called manually; no daily cron invokes it. P2.
6. **Late fee auto-application has no cron** — same pattern. P2.

### P2 — business-logic gaps

7. **Bulk export returns JSON, not a file stream.** §39.4. Changing to stream would change the consumer contract; deferred.
8. **Custom-report CSV is client-generated** while Aging/Fee-Performance CSV use server `/reports/export`. Inconsistency is deferred — both approaches work. P3.
9. **Reject / approve self-block not enforced in UI** — tester must verify backend enforces it (§25.2). Flag if UI lets admin1 even try to approve their own refund.

### P3 — translation / polish

10. **Some audit descriptions use ICU interpolation with `{entity}`/`{ref}`** — confirm English + Arabic both interpolate correctly (no raw `{entity}` leaking).
11. **Stripe webhook event type routing** — confirm all 4 handled types (`checkout.session.completed`, `charge.refunded`, `checkout.session.expired`, `payment_intent.payment_failed`) have integration-test coverage. §40.
12. **Shared state machine module** — invoice/refund/credit-note/payment-plan/scholarship state transitions live inside each service. A cross-module refactor is out of scope; integration tests per service compensate.

---

## 51. Sign-Off

| Reviewer Name | Date | Pass | Fail | Overall Result |
| ------------- | ---- | ---- | ---- | -------------- |
|               |      |      |      |                |

**Instructions for tester:**

- Mark each row Pass or Fail.
- For any Fail, record: (a) section + row ID; (b) observed result; (c) screenshot / network log; (d) environment (tenant, locale, viewport, user).
- File every fail as a ticket with one of: `bug/finance`, `bug/rls`, `bug/translation`, `bug/rtl`, `bug/mobile`, `bug/api`.
- Escalate any security / RLS failures (§43, §44) immediately — these are P0 blockers for tenant onboarding.
- If you discover issues not flagged in §50, append to a new "Observations — additional" block below this table and raise tickets.

**Do NOT consider the module "tested" until every row in every section has been exercised.** Partial signoff defeats the purpose of this spec.
