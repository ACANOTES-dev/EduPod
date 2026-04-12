# Finance Module — Admin / Owner E2E Test Specification

**Module:** Finance (Billing, Payments, Refunds, Reporting)
**Perspective:** Admin / Owner / School Principal — user with every `finance.*` permission (no role splitting yet; future work will break this spec into sub-role specs).
**Pages Covered:** 24 unique authenticated routes (plus 3 PDF streams, 1 Stripe webhook, 1 CSV export endpoint, 90 distinct backend API endpoints).
**Last Updated:** 2026-04-12

---

## Table of Contents

1. [Prerequisites & Test Data](#1-prerequisites--test-data)
2. [Global Environment Setup (DevTools, Storage, Locale)](#2-global-environment-setup-devtools-storage-locale)
3. [Shared Components — CurrencyDisplay](#3-shared-components--currencydisplay)
4. [Shared Components — HouseholdSelector](#4-shared-components--householdselector)
5. [Shared Components — MultiCheckSelect](#5-shared-components--multicheckselect)
6. [Shared Components — PdfPreviewModal](#6-shared-components--pdfpreviewmodal)
7. [Shared Components — Status Badges (Invoice, Payment, Refund)](#7-shared-components--status-badges-invoice-payment-refund)
8. [Shared Components — useTenantCurrency Hook](#8-shared-components--usetenantcurrency-hook)
9. [Finance Dashboard (Hub)](#9-finance-dashboard-hub)
10. [Dashboard — KPI Strip](#10-dashboard--kpi-strip)
11. [Dashboard — Pending Actions Banner](#11-dashboard--pending-actions-banner)
12. [Dashboard — Quick Actions Grid](#12-dashboard--quick-actions-grid)
13. [Dashboard — Invoice Pipeline](#13-dashboard--invoice-pipeline)
14. [Dashboard — Aging Overview](#14-dashboard--aging-overview)
15. [Dashboard — Household Debt Breakdown](#15-dashboard--household-debt-breakdown)
16. [Dashboard — Overdue Invoices](#16-dashboard--overdue-invoices)
17. [Dashboard — Finance Navigate (Modules Grid)](#17-dashboard--finance-navigate-modules-grid)
18. [Dashboard — Recent Payments Table](#18-dashboard--recent-payments-table)
19. [Financial Overview — Household List](#19-financial-overview--household-list)
20. [Financial Overview — Household Detail](#20-financial-overview--household-detail)
21. [Fee Types — List & CRUD](#21-fee-types--list--crud)
22. [Fee Structures — List](#22-fee-structures--list)
23. [Fee Structures — New](#23-fee-structures--new)
24. [Fee Structures — Edit](#24-fee-structures--edit)
25. [Fee Structure Form — Field Reference](#25-fee-structure-form--field-reference)
26. [Fee Assignments — List](#26-fee-assignments--list)
27. [Fee Assignments — New](#27-fee-assignments--new)
28. [Fee Assignment Form — Field Reference](#28-fee-assignment-form--field-reference)
29. [Fee Generation Wizard — Step 1 (Configuration)](#29-fee-generation-wizard--step-1-configuration)
30. [Fee Generation Wizard — Step 2 (Preview)](#30-fee-generation-wizard--step-2-preview)
31. [Fee Generation Wizard — Step 3 (Confirmation)](#31-fee-generation-wizard--step-3-confirmation)
32. [Fee Generation — Edge Cases & Idempotency](#32-fee-generation--edge-cases--idempotency)
33. [Invoices — List](#33-invoices--list)
34. [Invoice Detail — Header & Metrics](#34-invoice-detail--header--metrics)
35. [Invoice Detail — Actions (Issue / Void / Cancel / Write-Off / PDF)](#35-invoice-detail--actions-issue--void--cancel--write-off--pdf)
36. [Invoice Detail — Lines Tab](#36-invoice-detail--lines-tab)
37. [Invoice Detail — Payments Tab](#37-invoice-detail--payments-tab)
38. [Invoice Detail — Installments Tab](#38-invoice-detail--installments-tab)
39. [Invoice Detail — Pending Approval Banner](#39-invoice-detail--pending-approval-banner)
40. [Invoice Detail — Write-Off Reason Banner](#40-invoice-detail--write-off-reason-banner)
41. [Invoice — State Machine (Full Transition Graph)](#41-invoice--state-machine-full-transition-graph)
42. [Payments — List](#42-payments--list)
43. [Payments — New (Manual Entry)](#43-payments--new-manual-entry)
44. [Payment Detail — Header & Metrics](#44-payment-detail--header--metrics)
45. [Payment Detail — Allocations Tab & Allocation Panel](#45-payment-detail--allocations-tab--allocation-panel)
46. [Payment Detail — Refunds Tab](#46-payment-detail--refunds-tab)
47. [Payment Detail — Receipt PDF](#47-payment-detail--receipt-pdf)
48. [Payment — State Machine & Allocation Invariants](#48-payment--state-machine--allocation-invariants)
49. [Refunds — List](#49-refunds--list)
50. [Refunds — Create Modal (Payment Search)](#50-refunds--create-modal-payment-search)
51. [Refunds — Create Modal (Amount & Reason)](#51-refunds--create-modal-amount--reason)
52. [Refunds — Approve / Reject / Execute Actions](#52-refunds--approve--reject--execute-actions)
53. [Refunds — State Machine & Invariants](#53-refunds--state-machine--invariants)
54. [Credit Notes — List](#54-credit-notes--list)
55. [Credit Notes — Create Modal](#55-credit-notes--create-modal)
56. [Credit Notes — Apply Modal](#56-credit-notes--apply-modal)
57. [Credit Notes — Expanded Row (Application History)](#57-credit-notes--expanded-row-application-history)
58. [Discounts — List](#58-discounts--list)
59. [Discounts — New](#59-discounts--new)
60. [Discounts — Edit](#60-discounts--edit)
61. [Discount Form — Field Reference & Auto-Apply](#61-discount-form--field-reference--auto-apply)
62. [Scholarships — List](#62-scholarships--list)
63. [Scholarships — Create Modal](#63-scholarships--create-modal)
64. [Scholarships — Revoke Modal](#64-scholarships--revoke-modal)
65. [Payment Plans — List](#65-payment-plans--list)
66. [Payment Plans — Create Modal](#66-payment-plans--create-modal)
67. [Payment Plans — Expanded Row & Cancel Action](#67-payment-plans--expanded-row--cancel-action)
68. [Reports — Aging Tab](#68-reports--aging-tab)
69. [Reports — Fee Performance Tab](#69-reports--fee-performance-tab)
70. [Reports — Custom Report Builder](#70-reports--custom-report-builder)
71. [Reports — CSV Export](#71-reports--csv-export)
72. [Household Statements — List](#72-household-statements--list)
73. [Household Statements — Detail Ledger](#73-household-statements--detail-ledger)
74. [Household Statements — PDF](#74-household-statements--pdf)
75. [Debt Breakdown — Bucket Filter & Table](#75-debt-breakdown--bucket-filter--table)
76. [Audit Trail — List & Filters](#76-audit-trail--list--filters)
77. [Late Fee Configurations (Backend-Only API)](#77-late-fee-configurations-backend-only-api)
78. [Recurring Invoice Configurations (Backend-Only API)](#78-recurring-invoice-configurations-backend-only-api)
79. [Payment Reminder Endpoints (Backend-Only API)](#79-payment-reminder-endpoints-backend-only-api)
80. [Bulk Operations (Backend-Only API)](#80-bulk-operations-backend-only-api)
81. [Stripe Webhook — Signature & Idempotency](#81-stripe-webhook--signature--idempotency)
82. [Currency Update Endpoint](#82-currency-update-endpoint)
83. [End-to-End Flow — Fee Setup → Invoice → Payment → Allocation](#83-end-to-end-flow--fee-setup--invoice--payment--allocation)
84. [End-to-End Flow — Stripe Checkout → Auto-Allocation → Receipt](#84-end-to-end-flow--stripe-checkout--auto-allocation--receipt)
85. [End-to-End Flow — Partial Payment → Credit Note → Invoice Closure](#85-end-to-end-flow--partial-payment--credit-note--invoice-closure)
86. [End-to-End Flow — Refund Request → Approve → Execute → Reversal](#86-end-to-end-flow--refund-request--approve--execute--reversal)
87. [End-to-End Flow — Overdue Invoice → Late Fee → Reminder → Write-Off](#87-end-to-end-flow--overdue-invoice--late-fee--reminder--write-off)
88. [End-to-End Flow — Payment Plan Request → Admin Counter → Parent Accept](#88-end-to-end-flow--payment-plan-request--admin-counter--parent-accept)
89. [End-to-End Flow — Approval-Required Invoice Issue](#89-end-to-end-flow--approval-required-invoice-issue)
90. [End-to-End Flow — Scholarship Application → Revocation](#90-end-to-end-flow--scholarship-application--revocation)
91. [Permission & Role Guard Tests](#91-permission--role-guard-tests)
92. [Tenant Isolation (RLS) Tests](#92-tenant-isolation-rls-tests)
93. [Arabic / RTL Verification](#93-arabic--rtl-verification)
94. [Mobile Responsiveness (375px Viewport)](#94-mobile-responsiveness-375px-viewport)
95. [Console & Network Health](#95-console--network-health)
96. [Backend Endpoint Map (All 90 Admin Routes)](#96-backend-endpoint-map-all-90-admin-routes)
97. [Observations, Inconsistencies & Bugs Flagged During Walkthrough](#97-observations-inconsistencies--bugs-flagged-during-walkthrough)
98. [Sign-Off](#98-sign-off)

---

## 1. Prerequisites & Test Data

Before executing this spec, ensure the following are in place. **Without these, entire sections cannot be exercised.** Treat the prerequisites as a checklist — do not start the spec until every item is provisioned.

**Tenant configuration:**

- One test tenant (e.g., `nhqs.edupod.app`) onboarded with currency set in `tenantCurrency` (not `USD` — e.g., `EUR` so that currency-leakage bugs are visible).
- Tenant branding configured with `invoice_prefix`, `receipt_prefix`, `display_name`, logo, support email, support phone. (Tests assume `invoice_prefix = 'INV'`, `receipt_prefix = 'REC'` unless noted.)
- At least one active academic year with three year groups (YG-A with 10 students, YG-B with 10 students, YG-C empty).
- Finance settings: `requireApprovalForInvoiceIssue=true` on one test run (to exercise approval path) and `=false` on another (to exercise direct path). `paymentReminderEnabled=true`, `reminderChannel=email`, `dueSoonDays=3`, `finalNoticeDays=14`, `autoIssueRecurringInvoices=false` (default).
- Stripe test keys configured: publishable `pk_test_...`, secret `sk_test_...`, webhook secret `whsec_...`. Without these, sections 81 and 84 cannot run.

**User accounts:**

- Admin / School Principal — full `finance.*` permissions (the subject of this spec). Attach `finance.manage`, `finance.view`, `finance.view_reports`, `finance.manage_credit_notes`, `finance.manage_late_fees`, `finance.manage_scholarships`, `finance.bulk_operations`, `finance.process_payments`, `finance.issue_refunds`, `finance.write_off`, `finance.override_refund_guard`. No other role splitting is attempted here.
- Teacher account (no finance permissions) — used only for the negative 403 spot-checks in §91.
- Parent account (for end-to-end flows in §84, §86, §88 that require parent-side actions).
- A second admin user distinct from the test admin — required for §52 refund self-approval block tests (a refund cannot be approved by the same user who requested it).

**Test data:**

- Four fee types: `Tuition Fees` (custom), `Transport` (custom), `Books` (custom), plus the tenant-seeded `Miscellaneous` system fee type.
- Three fee structures: `Tuition — YG-A` (€1000, `term`, linked to `Tuition Fees` and YG-A), `Transport — Global` (€150, `monthly`, unscoped year group, linked to `Transport`), `Registration — YG-B` (€200, `one_off`, linked to `Miscellaneous` and YG-B).
- At least three discounts: one `fixed` of value 50, one `percent` of value 10, and one `percent` of value 100 with `auto_apply=true, auto_condition.type='sibling', min_students=2` for sibling-detection tests.
- At least 20 households with billing parents, split across the three year groups. At least one household without a billing parent (for the "missing billing parent" warning in §30). At least one sibling household (two students linked) for the auto-sibling discount test.
- At least one fee assignment per household per fee structure, `effective_from` in the past; one ongoing assignment that will end via §26.
- At least one invoice in each of the nine invoice statuses (`draft`, `pending_approval`, `issued`, `partially_paid`, `paid`, `overdue`, `void`, `cancelled`, `written_off`). The `overdue` status can be forced by backdating `due_date` and letting the cron transition it; alternatively create an invoice whose due_date is in the past and use the API to set status directly is not possible — rely on the `finance:overdue-detection` cron.
- At least two payments in each of `posted`, `failed`, `voided`, `refunded_partial`, `refunded_full`. `pending` is rare on manual entry (manual always starts `posted`) — seed one via SQL if required for list-filter coverage.
- At least one refund in each of `pending_approval`, `approved`, `executed`, `rejected`, `failed`.
- At least one credit note with remaining balance > 0, and one fully used (applied to an invoice down to zero).
- At least one payment plan per status: `active`, `completed`, `cancelled`, plus one `pending` parent-initiated request and one `counter_offered` for full coverage.
- At least one scholarship per status: `active`, `expired`, `revoked`.
- At least 10 entries in the audit trail for finance entities (any combination of create/update/delete on invoices, payments, refunds, fee types, discounts).

**Browser setup:**

- Chrome DevTools open, Console + Network tabs visible. Clear all application storage (cookies, localStorage, sessionStorage, service workers) before starting so stale tenant-currency caches do not leak between tenants.
- Screen resolution 1440×900 for desktop pass; secondary pass at 375×667 (iPhone SE) for §94.
- Language test: one pass with `locale=en`, one pass with `locale=ar` for §93.

---

## 2. Global Environment Setup (DevTools, Storage, Locale)

| #    | What to Check                                                                                            | Expected Result                                                                                                                                          | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1  | Log in as admin, navigate to `/{locale}/finance`                                                         | `GET /api/v1/finance/dashboard` returns 200. Response body is `{ data: FinanceDashboardData }` (single-envelope). No other unexpected requests fire.     |           |
| 2.2  | Console Network tab — confirm `GET /api/v1/finance/dashboard/currency?_t=<timestamp>` fires exactly once | Single request. Response `{ data: { currency_code: 'EUR' } }` (or tenant-configured code). Cache-busting `_t` query string present.                      |           |
| 2.3  | Inspect `<html>` element's `dir` attribute                                                               | `dir="ltr"` when locale is `en`; `dir="rtl"` when locale is `ar`.                                                                                        |           |
| 2.4  | Inspect `<html>` element's `lang` attribute                                                              | Matches the active locale (`en` / `ar`).                                                                                                                 |           |
| 2.5  | Hard-refresh the page                                                                                    | Dashboard skeleton renders (animate-pulse rectangles) briefly, then real content. No FOUC of "undefined 0.00" or `$0.00` before the real currency loads. |           |
| 2.6  | Kill the network, then refresh                                                                           | Console logs `[FinanceDashboard]` error; page shows loading state indefinitely or empty state after timeout — **no unhandled crash, no 500 page**.       |           |
| 2.7  | localStorage and sessionStorage after load                                                               | Both empty for `/finance/*` routes (JWT stored in memory only; refresh token in httpOnly cookie). No tokens stored client-side.                          |           |
| 2.8  | Cookies after load                                                                                       | One httpOnly `refresh_token` cookie. No other auth cookies.                                                                                              |           |
| 2.9  | Refresh `useTenantCurrency` behaviour — simulate a 304 Not Modified from the browser cache               | Hook still receives a valid `currency_code` because `_t=<Date.now()>` cache-bust query string prevents 304s.                                             |           |
| 2.10 | Simulate API returning legacy shape `{ currency_code: 'EUR' }` (no `data:` wrapper)                      | Hook reads `res.currency_code` fallback path and still resolves correctly. No "USD default stuck" regression.                                            |           |

---

## 3. Shared Components — CurrencyDisplay

`<CurrencyDisplay amount={number} currency_code={string} className={string} locale={string} />` — wraps Intl.NumberFormat and renders inside `<span dir="ltr">`.

| #    | What to Check                                                                                                                                                                                     | Expected Result                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1  | Pass `amount=1234.5, currency_code='EUR', locale='en'`                                                                                                                                            | Renders `€1,234.50` inside `<span dir="ltr">`. Two decimal places guaranteed.                                                                            |           |
| 3.2  | Pass same amount with `locale='ar'`                                                                                                                                                               | Renders in `ar-SA` locale formatting (Arabic parens direction, western numerals per CLAUDE.md permanent constraints). Still `dir="ltr"` on the `<span>`. |           |
| 3.3  | Pass `amount=NaN`                                                                                                                                                                                 | Treats as 0 and renders `€0.00`.                                                                                                                         |           |
| 3.4  | Pass `currency_code=undefined`                                                                                                                                                                    | Falls back to `USD` and renders `$0.00` style — **does not** render literal `undefined 0.00`.                                                            |           |
| 3.5  | Pass `currency_code='eur'` (lowercase)                                                                                                                                                            | Uppercases before passing to Intl. Renders `€1,234.50`.                                                                                                  |           |
| 3.6  | Pass `currency_code=''` (empty string)                                                                                                                                                            | Falls back to `USD`.                                                                                                                                     |           |
| 3.7  | Pass `currency_code='XX'` (<3 chars)                                                                                                                                                              | Falls back to `USD`.                                                                                                                                     |           |
| 3.8  | Pass a code Intl rejects (e.g., `currency_code='FAKECCY'`)                                                                                                                                        | `console.error('[CurrencyDisplay]', err)` logged; fallback string `FAKECCY 1234.50` rendered. No crash.                                                  |           |
| 3.9  | Pass `className="text-danger-700"`                                                                                                                                                                | Class is applied to the `<span>`; colour override visible.                                                                                               |           |
| 3.10 | Inspect DOM — verify every amount on the dashboard, overview, invoice detail, payment detail, refund list, credit-note list, reports, statements, debt-breakdown is wrapped in `<span dir="ltr">` | Every currency value is LTR-wrapped. Arabic pages keep numerics LTR-readable (no Arabic-Indic digits).                                                   |           |

---

## 4. Shared Components — HouseholdSelector

Popover combobox with server-side search; used in fee-assignments/new, payments/new, credit-notes (create), payment-plans (create).

| #    | What to Check                                                                      | Expected Result                                                                                                                                                | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1  | Open a page containing the selector (e.g., `/finance/fee-assignments/new`)         | Trigger button renders with placeholder `t('selectHousehold')`; trailing `<Search>` icon visible. Aria attributes: `role="combobox"`, `aria-expanded="false"`. |           |
| 4.2  | Click the trigger                                                                  | Popover opens with width matching the trigger (`w-[--radix-popover-trigger-width]`). Aria-expanded flips to `true`.                                            |           |
| 4.3  | Without typing, observe initial load                                               | `GET /api/v1/households?pageSize=50` fires. First 50 households render as selectable items.                                                                    |           |
| 4.4  | Type `"ali"` in the CommandInput                                                   | `GET /api/v1/households?pageSize=50&search=ali` fires. List filters to matching households.                                                                    |           |
| 4.5  | Clear the search field                                                             | List resets to the unfiltered top 50.                                                                                                                          |           |
| 4.6  | Close the popover with Escape                                                      | Popover closes; aria-expanded `false`.                                                                                                                         |           |
| 4.7  | Select a household                                                                 | `onValueChange` fires with the household id. Popover closes. Trigger text updates to the household name.                                                       |           |
| 4.8  | Re-open the popover with a value already selected                                  | Selected household is highlighted in the list. Trigger continues to show the name.                                                                             |           |
| 4.9  | Reload the form with a pre-filled `value` whose household is NOT in the default 50 | Trigger falls back to placeholder (known subtle issue). Expected behaviour: spec flags this in §97.                                                            |           |
| 4.10 | Search with zero results (e.g., `"zzzzzzzz"`)                                      | CommandEmpty message `t('noHouseholdsFound')` renders inside the popover.                                                                                      |           |
| 4.11 | Pass `disabled={true}`                                                             | Trigger is disabled (`aria-disabled`, visual muted state). Popover will not open.                                                                              |           |
| 4.12 | Inspect console for `[HouseholdSelector]` errors during a failed search            | Error logged to console; empty list renders; no toast, no crash.                                                                                               |           |

---

## 5. Shared Components — MultiCheckSelect

Custom multi-select dropdown used by the Custom Report Builder for year-group and fee-type multi-selection.

| #   | What to Check                                        | Expected Result                                                                                                                         | Pass/Fail |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Navigate to `/finance/reports`, switch to Custom tab | Two `MultiCheckSelect` triggers render: one for year groups, one for fee types. Triggers show their `allLabel` text when no selections. |           |
| 5.2 | Click the Year Group trigger                         | Dropdown panel opens below the trigger (`absolute z-50`). Chevron rotates 180°.                                                         |           |
| 5.3 | Click outside the dropdown                           | Dropdown closes (mousedown listener registered on document).                                                                            |           |
| 5.4 | Check two year groups                                | Trigger text updates to comma-separated labels.                                                                                         |           |
| 5.5 | Uncheck one                                          | Trigger text updates to the remaining label.                                                                                            |           |
| 5.6 | When no options loaded                               | Dropdown panel shows the `placeholder` prop text instead of a list.                                                                     |           |
| 5.7 | Tab-focus into the trigger, press Space              | (Check keyboard accessibility; implementation uses a `<button>` trigger.) Dropdown opens.                                               |           |
| 5.8 | Inspect styling — focus outline visible on trigger   | `focus:outline-none focus:ring-2 focus:ring-primary` applied.                                                                           |           |

---

## 6. Shared Components — PdfPreviewModal

Used on dashboard recent-payments, invoice detail, payment detail, household statement detail.

| #    | What to Check                                                                           | Expected Result                                                                                                                                                                  | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1  | Click an action that opens a PDF preview (e.g., "Preview PDF" on invoice detail)        | `<Dialog>` opens. `DialogContent` uses `max-w-4xl w-[90vw]`. Toolbar (Print, Download) renders disabled. Loader spinner (`Loader2` animate-spin) visible inside `h-[60vh]` card. |           |
| 6.2  | Network tab — observe PDF fetch                                                         | Single `GET /{pdfUrl}` with `Authorization: Bearer <jwt>` header and `credentials: 'include'`. Response Content-Type `application/pdf`.                                          |           |
| 6.3  | After fetch completes                                                                   | `<iframe src={blobUrl}>` renders the PDF inside `h-[60vh] w-full`. Print and Download buttons enable.                                                                            |           |
| 6.4  | Click Print                                                                             | Opens the blob URL in a new window and calls `window.print()` on load.                                                                                                           |           |
| 6.5  | Click Download                                                                          | Anchor download with filename `{title-kebab-lowercase}.pdf` (e.g., `invoice-pdf.pdf`). File saved to Downloads folder.                                                           |           |
| 6.6  | Close the dialog (ESC, overlay click, X button)                                         | Dialog closes. Second `useEffect` revokes and nulls `blobUrl` — confirm via DevTools that subsequent re-open fetches the PDF again.                                              |           |
| 6.7  | Kill the network and trigger the modal                                                  | Fetch throws; modal body shows `<p class="text-sm text-danger-text">{t('pdfLoadError')}</p>`. Print/Download remain disabled. `console.error('[PdfPreviewModal]', err)` logged.  |           |
| 6.8  | Trigger with `pdfUrl=null`                                                              | Modal opens and stays in loading state (empty iframe). No fetch fires.                                                                                                           |           |
| 6.9  | Inspect response Content-Type on real fetches for each PDF: invoice, receipt, statement | All three return `Content-Type: application/pdf` and `Content-Disposition: inline; filename="..."`. None return `attachment`.                                                    |           |
| 6.10 | After a slow PDF fetch (e.g., large statement)                                          | Spinner visible throughout. No partial/torn UI.                                                                                                                                  |           |

---

## 7. Shared Components — Status Badges (Invoice, Payment, Refund)

Each status badge renders a `<StatusBadge>` with a semantic colour variant, a dot, and a localised label.

### 7a. InvoiceStatusBadge — variant map

| Status             | Variant   | Label (English fallback) |
| ------------------ | --------- | ------------------------ |
| `draft`            | `neutral` | Draft                    |
| `pending_approval` | `warning` | Pending Approval         |
| `issued`           | `info`    | Issued                   |
| `partially_paid`   | `warning` | Partially Paid           |
| `paid`             | `success` | Paid                     |
| `overdue`          | `danger`  | Overdue                  |
| `void`             | `neutral` | Void                     |
| `cancelled`        | `neutral` | Cancelled                |
| `written_off`      | `info`    | Written Off              |

### 7b. PaymentStatusBadge — variant map

| Status             | Variant   | Label              |
| ------------------ | --------- | ------------------ |
| `pending`          | `warning` | Pending            |
| `posted`           | `success` | Posted             |
| `failed`           | `danger`  | Failed             |
| `voided`           | `neutral` | Voided             |
| `refunded_partial` | `info`    | Partially Refunded |
| `refunded_full`    | `info`    | Fully Refunded     |

### 7c. RefundStatusBadge — variant map

| Status             | Variant   | Label            |
| ------------------ | --------- | ---------------- |
| `pending_approval` | `warning` | Pending Approval |
| `approved`         | `info`    | Approved         |
| `executed`         | `success` | Executed         |
| `failed`           | `danger`  | Failed           |
| `rejected`         | `neutral` | Rejected         |

| #   | What to Check                                                                        | Expected Result                                                                                                                                             | Pass/Fail |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | Render every InvoiceStatus in the invoice list; verify badge colour and label        | Matches table 7a for all 9 statuses.                                                                                                                        |           |
| 7.2 | Render every PaymentStatus in the payment list                                       | Matches table 7b for all 6 statuses.                                                                                                                        |           |
| 7.3 | Render every RefundStatus in the refunds list                                        | Matches table 7c for all 5 statuses.                                                                                                                        |           |
| 7.4 | Check translation key resolution: `t('invoiceStatus.draft')` etc.                    | Keys exist in both `en.json` and `ar.json`. If the key is missing the English fallback `Draft`/`Paid`/etc renders (this is intentional via `defaultValue`). |           |
| 7.5 | Verify dot styling — each badge renders a coloured `·` dot to the start of the label | Dot colour matches variant colour.                                                                                                                          |           |

---

## 8. Shared Components — useTenantCurrency Hook

Cached hook returning the tenant's configured currency code.

| #   | What to Check                                            | Expected Result                                                                                                                                                  | Pass/Fail |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | On every finance page load                               | Exactly one `GET /api/v1/finance/dashboard/currency?_t=<timestamp>` fires. Cache-busting query string present.                                                   |           |
| 8.2 | Default value while loading                              | `'USD'` (prevents `Intl` from receiving undefined). Amounts rendered momentarily as `$0.00` before real value arrives — **must not** render as `undefined 0.00`. |           |
| 8.3 | Response envelope — `{ data: { currency_code: 'EUR' } }` | Hook reads `res.data.currency_code` and returns `'EUR'`.                                                                                                         |           |
| 8.4 | Legacy response — `{ currency_code: 'EUR' }`             | Hook reads `res.currency_code` (fallback) and returns `'EUR'`.                                                                                                   |           |
| 8.5 | Empty response — `{}`                                    | Hook stays at `'USD'` default; no crash.                                                                                                                         |           |
| 8.6 | Unmount before response arrives                          | Cancelled flag prevents `setCurrency` after unmount. No React warning in console.                                                                                |           |
| 8.7 | Error response (500)                                     | `console.error('[useTenantCurrency]', err)` logged; hook stays at `'USD'` default.                                                                               |           |

---

## 9. Finance Dashboard (Hub)

**URL:** `/{locale}/finance`
**API:** `GET /api/v1/finance/dashboard` (permission `finance.view`)
**Translation namespace:** `finance`

| #    | What to Check                        | Expected Result                                                                                                                                                               | Pass/Fail |
| ---- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1  | Navigate to `/{locale}/finance`      | Page loads. Network tab shows one `GET /api/v1/finance/dashboard` returning 200. Response shape `{ data: FinanceDashboardData }`. No other requests except the currency hook. |           |
| 9.2  | Title renders                        | `<h1>` text = `t('financeHub')`. Class `text-2xl font-semibold tracking-tight text-text-primary`.                                                                             |           |
| 9.3  | Description line                     | `<p>` text = `t('financeHubDesc')`. Class `mt-1 text-sm text-text-secondary`.                                                                                                 |           |
| 9.4  | Loading skeleton — on slow network   | Animated-pulse rectangles: 1 × `h-8 w-56`, 4 × `h-28 rounded-2xl`, 2 × `h-48 rounded-2xl`, 1 × `h-64 rounded-2xl`. All `bg-surface-secondary`, container `p-6 space-y-6`.     |           |
| 9.5  | Loaded but data is null              | Header `t('financeHub')` + centred card `t('noDashboardData')` render. No crash.                                                                                              |           |
| 9.6  | Error state                          | On a 500, `console.error('[FinanceDashboard]', err)`; page stays in loading state or renders empty state. No toast.                                                           |           |
| 9.7  | No auto-refresh fires                | Stay on the page for 2 minutes with DevTools Network tab filtered on `/api/v1/`. Only the initial dashboard + currency requests appear. Dashboard page is one-shot.           |           |
| 9.8  | No permission filtering UI-side      | Entire dashboard renders for admin. Front-office users see the same dashboard — permission filtering is server-side in `finance.view`.                                        |           |
| 9.9  | Page layout                          | Outer `<main>`: `space-y-6 p-6`. Responsive: `p-4` at sm breakpoint.                                                                                                          |           |
| 9.10 | No URL query params produced or read | DevTools URL remains `/{locale}/finance`. No `?` suffix on load.                                                                                                              |           |

---

## 10. Dashboard — KPI Strip

Four KPI tiles in a grid (`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4`).

| #     | What to Check                                   | Expected Result                                                                                                                                                                                                                                  | Pass/Fail |
| ----- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 10.1  | First KPI — Expected Revenue                    | Label `t('expectedRevenue')`, icon `Receipt`, accent `bg-primary/10 text-primary`. Value = tenant-currency-formatted `data.expected_revenue` inside `<p dir="ltr">` with `text-[28px] font-bold leading-tight tracking-tight text-text-primary`. |           |
| 10.2  | Expected Revenue subtitle                       | `<subtitle> = ${(invoice_status_counts.issued ?? 0) + (invoice_status_counts.partially_paid ?? 0)} ${t('activeInvoices')}`. Updates live with data.                                                                                              |           |
| 10.3  | Second KPI — Received Payments                  | Label `t('receivedPayments')`, icon `TrendingUp`, accent `bg-success-100 text-success-700`, value `formatCurrency(data.received_payments)`. No subtitle.                                                                                         |           |
| 10.4  | Third KPI — Outstanding Amount                  | Label `t('outstandingAmount')`, icon `TrendingDown`, accent `bg-danger-100 text-danger-700`, value `formatCurrency(data.outstanding)`. Subtitle only when `overdue_invoices.length > 0`: `"${count} ${t('overdueInvoicesCount')}"`.              |           |
| 10.5  | Fourth tile — Outstanding Percentage split card | Top half: `((outstanding/expected_revenue)*100).toFixed(1)%` with `dir="ltr"`. Colour threshold: `>30%` danger-600, `>15%` warning-600, else success-600. When `outstanding=0` OR `expected_revenue=0` → success-600 and value `"0.0%"`.         |           |
| 10.6  | Outstanding Percentage — bottom half            | Link to `/{locale}/finance/reports`. Icon `BadgeDollarSign` in `bg-info-100 text-info-700`. Text `t('navReports')`. Right arrow appears on hover.                                                                                                |           |
| 10.7  | Click any of the first three KPIs               | Navigates to `/{locale}/finance/overview`.                                                                                                                                                                                                       |           |
| 10.8  | Click the fourth tile link                      | Navigates to `/{locale}/finance/reports`.                                                                                                                                                                                                        |           |
| 10.9  | Verify numeric formatting                       | All 4 values wrapped in `<p dir="ltr">` or `<span dir="ltr">`. Tenant currency (`€` for EUR) prefixes amount, not `$`.                                                                                                                           |           |
| 10.10 | When `expected_revenue === 0`                   | Outstanding % defaults to `"0.0%"` with success colour (no division-by-zero NaN).                                                                                                                                                                |           |

---

## 11. Dashboard — Pending Actions Banner

`<PendingActionsBanner>` renders a flex-wrap row of chips only for non-zero counts.

| #    | What to Check                                                                    | Expected Result                                                                                                                                      | Pass/Fail |
| ---- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Seed: 2 refunds `pending_approval`, 1 payment plan `pending`, 3 invoices `draft` | All 3 chips render with counts.                                                                                                                      |           |
| 11.2 | Refunds chip                                                                     | Label `t('refundsAwaitingApproval')`, icon `RotateCcw`, colour `text-info-600 bg-info-100`. Href `/{locale}/finance/refunds`. Trailing `ArrowRight`. |           |
| 11.3 | Payment plans chip                                                               | Label `t('paymentPlansAwaiting')`, icon `Clock`, colour `text-warning-600 bg-warning-100`. Href `/{locale}/finance/payment-plans`.                   |           |
| 11.4 | Drafts chip                                                                      | Label `t('draftInvoices')`, icon `FileText`, colour `text-text-tertiary bg-surface-secondary`. Href `/{locale}/finance/invoices?status=draft`.       |           |
| 11.5 | Click a chip                                                                     | Navigates correctly, and the target page filter is applied (drafts → invoice list filtered on draft status).                                         |           |
| 11.6 | All three counts zero                                                            | Banner does not render (returns `null`).                                                                                                             |           |
| 11.7 | RTL locale                                                                       | Chips flow right-to-left; `ArrowRight` icon rotates `rtl:rotate-180` (if wrapped with that class in the shared component).                           |           |

---

## 12. Dashboard — Quick Actions Grid

Four quick-action tiles (`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4`).

| #    | What to Check                | Expected Result                                                                                                                 | Pass/Fail |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Tile 1 — Generate Fees       | Icon `Zap`, accent `bg-primary/10 text-primary`, label `t('generateFees')`, href `/{locale}/finance/fee-generation`.            |           |
| 12.2 | Tile 2 — Record Payment      | Icon `CreditCard`, accent `bg-success-100 text-success-700`, label `t('recordPayment')`, href `/{locale}/finance/payments/new`. |           |
| 12.3 | Tile 3 — Create Invoice      | Icon `Receipt`, accent `bg-info-100 text-info-700`, label `t('createInvoice')`, href `/{locale}/finance/invoices`.              |           |
| 12.4 | Tile 4 — View Statements     | Icon `ScrollText`, accent `bg-warning-100 text-warning-700`, label `t('viewStatements')`, href `/{locale}/finance/statements`.  |           |
| 12.5 | Click each tile sequentially | Correctly navigates to the target; back-button returns to dashboard.                                                            |           |
| 12.6 | Hover styling                | Tiles gain subtle hover state (background secondary).                                                                           |           |

---

## 13. Dashboard — Invoice Pipeline

`<InvoicePipeline counts={invoice_status_counts} />` — six-stage horizontal view.

| #    | What to Check                       | Expected Result                                                                                                                                                                                                                                                            | Pass/Fail |
| ---- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Header                              | Title `t('invoicePipeline')`. `<Link>` to `/{locale}/finance/invoices` labelled `t('viewAll')`.                                                                                                                                                                            |           |
| 13.2 | Segmented bar (only when total > 0) | `h-3 rounded-full bg-surface-secondary` with six colored segments for draft / pending_approval / issued / partially_paid / overdue / paid.                                                                                                                                 |           |
| 13.3 | Stage tiles grid                    | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`. Six tiles in order draft, pending_approval, issued, partially_paid, overdue, paid. Each tile = big number in stage colour + small label below.                                                                                |           |
| 13.4 | Stage colours (per PIPELINE_STAGES) | draft `text-text-tertiary bg-text-tertiary/30`; pending_approval `text-warning-600 bg-warning-400`; issued `text-info-600 bg-info-400`; partially_paid `text-warning-600 bg-warning-500`; overdue `text-danger-600 bg-danger-500`; paid `text-success-600 bg-success-500`. |           |
| 13.5 | Click any stage tile                | Navigates to `/{locale}/finance/invoices?status=<stage>` with the correct query param.                                                                                                                                                                                     |           |
| 13.6 | When a stage count is 0             | Tile still renders with `0` — no empty state.                                                                                                                                                                                                                              |           |
| 13.7 | When `totalActive === 0`            | Segmented bar does not render; tiles still render with zeros.                                                                                                                                                                                                              |           |

---

## 14. Dashboard — Aging Overview

`<AgingOverview aging={data.aging_summary} />`.

| #    | What to Check                                                              | Expected Result                                                                                                                                                                                                                                                              | Pass/Fail |
| ---- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1 | Header                                                                     | Title `t('agingOverview')`. Link `t('fullReport')` to `/{locale}/finance/reports`.                                                                                                                                                                                           |           |
| 14.2 | Five rows — one per bucket: `current`, `1_30`, `31_60`, `61_90`, `90_plus` | Labels (hardcoded English in `AGING_BUCKET_LABELS`): `"Current"`, `"1–30 days"`, `"31–60 days"`, `"61–90 days"`, `"90+ days"`. Flagged in §97 as non-translated.                                                                                                             |           |
| 14.3 | Row colour — per `AGING_COLORS`                                            | current: bar `bg-success-100`, chip `text-success-700`. 1_30: bar `bg-warning-100`, chip `text-warning-700`. 31_60: bar `bg-warning-200`, chip `text-warning-800`. 61_90: bar `bg-danger-100`, chip `text-danger-700`. 90_plus: bar `bg-danger-200`, chip `text-danger-800`. |           |
| 14.4 | Bar width                                                                  | `Math.max(pct, pct > 0 ? 3 : 0)%` — any non-zero bucket is at least 3% wide visually. Pct computed from bucket total / grand total × 100.                                                                                                                                    |           |
| 14.5 | Right side — total + count                                                 | Monetary total with `dir="ltr"` (tenant currency format). Count chip showing bucket.count.                                                                                                                                                                                   |           |
| 14.6 | Bucket with zero count                                                     | Row still renders with `—` or `0` and 0% width bar.                                                                                                                                                                                                                          |           |

---

## 15. Dashboard — Household Debt Breakdown

`HouseholdDebtBreakdown` component — 4 buckets + top debtors grid.

| #    | What to Check                                        | Expected Result                                                                                                                                                                                                                                                         | Pass/Fail |
| ---- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1 | Header                                               | Title `t('householdDebtBreakdown')`. Subtitle `${total} ${t('householdsTotal')}`. Right link `t('viewFullBreakdown')` → `/{locale}/finance/debt-breakdown`. Trailing `ArrowRight`.                                                                                      |           |
| 15.2 | Segmented bar (only when total > 0)                  | `flex h-4 overflow-hidden rounded-full bg-surface-secondary`. Four coloured segments: 0_10 success-400, 10_30 warning-400, 30_50 warning-600, 50_plus danger-500.                                                                                                       |           |
| 15.3 | Segment is a `<Link>`                                | Each segment links to `/{locale}/finance/debt-breakdown?bucket=<filter>` (e.g., `?bucket=0_10`). `title` attr shows `"{label}: {count}"`.                                                                                                                               |           |
| 15.4 | Bucket cards grid                                    | `grid-cols-2 sm:grid-cols-4`. 4 cards: Dot + label `t(labelKey)` + big number. If `count === 0`, card gets `opacity-50`. Card is clickable → `/debt-breakdown?bucket=...`.                                                                                              |           |
| 15.5 | Bucket colour dots                                   | 0_10 `bg-success-400`, 10_30 `bg-warning-400`, 30_50 `bg-warning-600`, 50_plus `bg-danger-500`.                                                                                                                                                                         |           |
| 15.6 | Zero bucket colour                                   | Number inside zero-count card uses `text-text-tertiary` instead of bucket colour.                                                                                                                                                                                       |           |
| 15.7 | Top debtors list — only when `topDebtors.length > 0` | Header `t('topDebtors')` + link `t('viewAll')` → `/{locale}/finance/debt-breakdown`. Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. First 6 debtors shown.                                                                                                           |           |
| 15.8 | Debtor row                                           | Rank badge (h-6 w-6, `bg-danger-100 text-danger-700`), household name (truncated), `${invoice_count} ${count === 1 ? t('invoice') : t('invoicesLabel')}`, amount in `dir="ltr" font-mono text-danger-600`. Row links to `/{locale}/finance/statements/${household_id}`. |           |
| 15.9 | Click a debtor row                                   | Navigates to statement detail for that household.                                                                                                                                                                                                                       |           |

---

## 16. Dashboard — Overdue Invoices

`<OverdueInvoices invoices={data.overdue_invoices} />` — renders a red-bordered card.

| #    | What to Check                         | Expected Result                                                                                                                                                                                                                                           | Pass/Fail |
| ---- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | When `data.overdue_invoices` is empty | Component returns `null`. Card does not render.                                                                                                                                                                                                           |           |
| 16.2 | When at least one overdue invoice     | Card outlined `border-danger-200`. Header with `AlertTriangle` (danger-500 colour) + title `t('overdueInvoices')` + right link `t('viewAll')` → `/{locale}/finance/invoices?status=overdue`.                                                              |           |
| 16.3 | Table columns                         | `t('invoiceNumber')` (start), `t('household')` (start), `t('balance')` (end), `t('daysOverdue')` (end).                                                                                                                                                   |           |
| 16.4 | Row click                             | Uses hard nav `window.location.assign('/{locale}/finance/invoices/{id}')` (not `router.push`). Flagged in §97 as inconsistency.                                                                                                                           |           |
| 16.5 | Cells                                 | Invoice number `font-mono text-primary`; household `text-text-primary`; balance `font-mono dir="ltr"` + tenant currency; days overdue inside red pill `rounded-md bg-danger-100 px-2 py-0.5 text-xs font-semibold text-danger-700` as `${days_overdue}d`. |           |

---

## 17. Dashboard — Finance Navigate (Modules Grid)

Three grouped sections of module-navigation cards (`lg:grid-cols-3`).

| #    | What to Check                           | Expected Result                                                                                                                                | Pass/Fail |
| ---- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1 | Top heading                             | `t('financeModules')`.                                                                                                                         |           |
| 17.2 | Setup group — `t('navSetup')`           | Five cards: Fee Types (Layers), Fee Structures (Calculator), Discounts (Percent), Special Fee Assignment (FileText), Scholarships (Award).     |           |
| 17.3 | Operations group — `t('navOperations')` | Six cards: Overview (Receipt), Fee Generation (Zap), Invoices (FileText), Payments (CreditCard), Credit Notes (FileText), Refunds (RotateCcw). |           |
| 17.4 | Monitoring group — `t('navMonitoring')` | Four cards: Statements (ScrollText), Payment Plans (Clock), Reports (BadgeDollarSign), Audit Trail (ShieldCheck).                              |           |
| 17.5 | Each card                               | Left icon tile (recolours primary on hover), title `t(titleKey)`, description `t(descKey)`. Entire card is a `<Link>`.                         |           |
| 17.6 | Click each card                         | All 15 cards navigate to the expected finance sub-route.                                                                                       |           |
| 17.7 | No back button or external nav leakage  | Clicking a card stays within `/finance/*`.                                                                                                     |           |

---

## 18. Dashboard — Recent Payments Table

Card titled `t('recentPayments')`.

| #     | What to Check                                     | Expected Result                                                                                                                                 | Pass/Fail                                                                                                                                                                                                     |
| ----- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 18.1  | Card header                                       | Title `t('recentPayments')` + right link `t('viewAll')` → `/{locale}/finance/payments`.                                                         |                                                                                                                                                                                                               |
| 18.2  | Table columns (in `overflow-x-auto`)              | `t('reference')` (start), `t('household')` (start), `t('totalAmount')` (end), `t('status')` (start), `t('date')` (start), `t('actions')` (end). |                                                                                                                                                                                                               |
| 18.3  | Empty state — `data.recent_payments.length === 0` | Single row `colSpan={6}`, centred, text `t('noRecentPayments')`.                                                                                |                                                                                                                                                                                                               |
| 18.4  | Row interaction                                   | `cursor-pointer hover:bg-surface-secondary`. Click navigates to `/{locale}/finance/payments/{id}`.                                              |                                                                                                                                                                                                               |
| 18.5  | Reference cell                                    | `font-mono text-text-secondary max-w-[180px] truncate`.                                                                                         |                                                                                                                                                                                                               |
| 18.6  | Household cell                                    | `font-medium text-text-primary`.                                                                                                                |                                                                                                                                                                                                               |
| 18.7  | Total cell                                        | `text-end font-mono text-text-primary` + `dir="ltr"`. Uses `formatCurrency` (raw Intl, no currency symbol — see §97 hardcoded string note).     |                                                                                                                                                                                                               |
| 18.8  | Status cell                                       | `<PaymentStatusBadge>` from §7b.                                                                                                                |                                                                                                                                                                                                               |
| 18.9  | Date cell                                         | `whitespace-nowrap`, `new Date(received_at).toLocaleDateString()` (no explicit locale arg — browser default).                                   |                                                                                                                                                                                                               |
| 18.10 | Actions cell — two inline buttons with `          | ` separator                                                                                                                                     | Receipt PDF: `stopPropagation`, sets `receiptPdfUrl = /api/v1/finance/payments/{id}/receipt/pdf`, opens modal. View Statement: `stopPropagation`, navigates to `/{locale}/finance/statements/{household_id}`. |     |
| 18.11 | Click Receipt PDF button                          | Opens PdfPreviewModal (covered in §6). Modal loads the PDF successfully.                                                                        |                                                                                                                                                                                                               |
| 18.12 | Click View Statement                              | Navigates to the household's statement.                                                                                                         |                                                                                                                                                                                                               |
| 18.13 | Row click vs button click                         | Row onClick fires `router.push(paymentDetail)`. Buttons call `stopPropagation` so row click does not fire alongside button click.               |                                                                                                                                                                                                               |

---

## 19. Financial Overview — Household List

**URL:** `/{locale}/finance/overview`
**API:** `GET /api/v1/finance/dashboard/household-overview?page=&pageSize=20&[search][status][overdue]` (perm `finance.view`)

| #     | What to Check                                                   | Expected Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Pass/Fail                    |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | --- |
| 19.1  | Navigate to the page                                            | `GET /household-overview?page=1&pageSize=20` fires. Response `{ data: HouseholdOverviewRow[], meta: { page, pageSize, total } }`.                                                                                                                                                                                                                                                                                                                                                                |                              |
| 19.2  | Header                                                          | Back arrow link to `/{locale}/finance`. Then `<PageHeader>` with title `t('overview.title')` and description `t('overview.description')`.                                                                                                                                                                                                                                                                                                                                                        |                              |
| 19.3  | Summary strip — shown only when `!isLoading && rows.length > 0` | Three stat blocks: hardcoded English labels `"Total Expected"`, `"Total Received"`, `"Total Outstanding"` with `CurrencyDisplay`. Received green, Outstanding red, Expected primary. Vertical dividers `h-8 w-px bg-border`. (Labels flagged in §97.)                                                                                                                                                                                                                                            |                              |
| 19.4  | Status legend card                                              | Title `t('overview.legendTitle')`. Three legend rows with `StatusBadge dot`: fully_paid/`success`/`t('overview.fullyPaid')` + desc; partially_paid/`warning`/`t('overview.partiallyPaid')` + desc; unpaid/`danger`/`t('overview.unpaid')` + desc.                                                                                                                                                                                                                                                |                              |
| 19.5  | Toolbar — search input                                          | `<Input placeholder={t('searchHouseholds')} class="ps-9">` with `<Search>` icon start-aligned.                                                                                                                                                                                                                                                                                                                                                                                                   |                              |
| 19.6  | Toolbar — status select                                         | Options: `''` (label `"${t('overview.colStatus')}: All"`), `fully_paid`, `partially_paid`, `unpaid`.                                                                                                                                                                                                                                                                                                                                                                                             |                              |
| 19.7  | Toolbar — overdue select                                        | Options: `''` (label `"${t('overview.colOverdue')}: All"`), `true` (`t('overview.yes')`), `false` (`t('overview.no')`).                                                                                                                                                                                                                                                                                                                                                                          |                              |
| 19.8  | Type in search                                                  | `GET /household-overview?...&search=<q>` fires. Page resets to 1.                                                                                                                                                                                                                                                                                                                                                                                                                                |                              |
| 19.9  | Change status filter                                            | `GET /household-overview?...&status=<s>` fires. Page resets to 1.                                                                                                                                                                                                                                                                                                                                                                                                                                |                              |
| 19.10 | Change overdue filter                                           | `GET /household-overview?...&overdue=<t                                                                                                                                                                                                                                                                                                                                                                                                                                                          | f>` fires. Page resets to 1. |     |
| 19.11 | Columns — order and rendering                                   | (1) `household_name` link to `/finance/overview/{id}`; (2) `household_number` `font-mono text-xs text-text-secondary` or `--`; (3) `status` StatusBadge; (4) `total` end-aligned `CurrencyDisplay font-medium`; (5) `paid` end-aligned `CurrencyDisplay text-text-secondary`; (6) `balance` end-aligned, colour `font-medium text-danger-text` if > 0, else `text-text-secondary`; (7) `overdue` either `t('overview.yes')` in `text-danger-text` or `t('overview.no')` in `text-text-tertiary`. |                              |
| 19.12 | Click a household name                                          | Navigates to `/{locale}/finance/overview/{householdId}`.                                                                                                                                                                                                                                                                                                                                                                                                                                         |                              |
| 19.13 | Row click                                                       | Equivalent navigation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                              |
| 19.14 | Pagination                                                      | `onPageChange=setPage`. Server-side pagination. `pageSize=20` hardcoded.                                                                                                                                                                                                                                                                                                                                                                                                                         |                              |
| 19.15 | Empty state — no filters applied and 0 rows                     | `<EmptyState icon={Users} title={t('overview.noData')} description={t('overview.noDataDesc')} />`.                                                                                                                                                                                                                                                                                                                                                                                               |                              |
| 19.16 | Empty state — filters applied and 0 rows                        | DataTable shows its own empty state (not the full EmptyState component).                                                                                                                                                                                                                                                                                                                                                                                                                         |                              |
| 19.17 | Error path                                                      | `console.error('[FinancialOverviewPage]', err)`; rows reset to `[]`, total 0. No toast.                                                                                                                                                                                                                                                                                                                                                                                                          |                              |

---

## 20. Financial Overview — Household Detail

**URL:** `/{locale}/finance/overview/[householdId]`

| #     | What to Check                                              | Expected Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Pass/Fail |
| ----- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.1  | Navigate with a valid householdId                          | Two parallel requests: `GET /api/v1/households/{id}` and `GET /api/v1/finance/invoices?household_id={id}&pageSize=100`.                                                                                                                                                                                                                                                                                                                                                                                         |           |
| 20.2  | Loading skeleton                                           | Title pulse `h-8 w-64`, 3 × `h-24 rounded-2xl` cards, 6 × `h-10 rounded-lg` rows, all `bg-surface-secondary`.                                                                                                                                                                                                                                                                                                                                                                                                   |           |
| 20.3  | Header                                                     | Back link to `/{locale}/finance/overview`. Title = `household?.household_name ?? '--'`.                                                                                                                                                                                                                                                                                                                                                                                                                         |           |
| 20.4  | Three summary cards (`sm:grid-cols-3`)                     | Total Billed (variant default, `text-text-primary`), Total Paid (variant success, `text-success-700`), Outstanding Balance (variant danger, `text-danger-600`). All three share `bg-surface border-border`.                                                                                                                                                                                                                                                                                                     |           |
| 20.5  | Derived summaries                                          | totalBilled = sum(invoices.total_amount). totalBalance = sum(invoices.balance_amount). totalPaid = totalBilled - totalBalance.                                                                                                                                                                                                                                                                                                                                                                                  |           |
| 20.6  | Empty invoices                                             | `<EmptyState icon={FileText} title={t('householdStatement.noInvoices')} description="" />`.                                                                                                                                                                                                                                                                                                                                                                                                                     |           |
| 20.7  | DataTable columns                                          | (1) `invoice_number` button link to `/{locale}/finance/invoices/{id}` `font-mono text-xs text-primary`; (2) status `<InvoiceStatusBadge>`; (3) description — `--` if no lines, truncated first-line desc if 1, `t('householdStatement.multipleItems')` if >1; (4) `total_amount` CurrencyDisplay font-medium; (5) paid = `total_amount - balance_amount` text-text-secondary; (6) `balance_amount` danger-text if > 0 else text-text-secondary; (7) `due_date` formatDate; (8) `issue_date` formatDate or `--`. |           |
| 20.8  | Click a row                                                | Navigates to invoice detail `/{locale}/finance/invoices/{id}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |           |
| 20.9  | Pagination effectively inactive                            | Since `pageSize=100` and `total=invoices.length`, pagination bar typically does not appear for small lists.                                                                                                                                                                                                                                                                                                                                                                                                     |           |
| 20.10 | Invalid householdId (UUID that does not exist)             | `GET /households/{id}` returns 404. Console log `[HouseholdInvoiceOverview]` error. Page shows empty state (no crash).                                                                                                                                                                                                                                                                                                                                                                                          |           |
| 20.11 | Currency — tenant currency overrides invoice.currency_code | Tests use tenant `EUR`; even if some invoice has `currency_code='USD'` (legacy), display uses tenant `EUR`. (Per code comment that invoice.currency_code is unreliable for historical records.)                                                                                                                                                                                                                                                                                                                 |           |
| 20.12 | Error path                                                 | `console.error('[HouseholdInvoiceOverview]', err)`; no UI error state beyond empty rendering.                                                                                                                                                                                                                                                                                                                                                                                                                   |           |

---

## 21. Fee Types — List & CRUD

**URL:** `/{locale}/finance/fee-types`
**APIs:** `GET /api/v1/finance/fee-types?page=&pageSize=20[&search][&active]`, `POST /api/v1/finance/fee-types`, `PATCH /api/v1/finance/fee-types/:id`, `DELETE /api/v1/finance/fee-types/:id`

Role gate: `canManage = hasAnyRole('school_principal','accounting')` controls Create/Edit/Delete affordances — admin has this.

| #     | What to Check                                              | Expected Result                                                                                                                                                                                                                                                                                                                                                                                   | Pass/Fail |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------- | --- |
| 21.1  | Navigate to page                                           | List fetches. Response `{ data: FeeType[], meta: { total } }`.                                                                                                                                                                                                                                                                                                                                    |           |
| 21.2  | Header                                                     | Back button `<Button variant="ghost">` with `ArrowLeft rtl:rotate-180` + `tCommon('back')` → `/{locale}/finance`. Create button (`canManage`): `Plus` icon + `t('feeTypes.createNew')`.                                                                                                                                                                                                           |           |
| 21.3  | Toolbar — search                                           | `<Input placeholder={tCommon('search')} class="ps-9">` with `Search` icon.                                                                                                                                                                                                                                                                                                                        |           |
| 21.4  | Toolbar — status select                                    | Options: `all` → `tCommon('all')`, `true` → `t('active')`, `false` → `t('inactive')`.                                                                                                                                                                                                                                                                                                             |           |
| 21.5  | Columns                                                    | (1) `name` `font-medium text-text-primary`; (2) `description` `text-text-secondary` or em-dash; (3) `is_system` → blue `<Badge variant="info">{t('feeTypes.system')}</Badge>` else `<span>{t('feeTypes.custom')}</span>`; (4) `active` `<StatusBadge>` success/neutral + `t('active')`/`t('inactive')`; (5) actions (canManage only): Pencil (edit) + Trash (delete, only when `!row.is_system`). |           |
| 21.6  | Row click (canManage)                                      | Opens edit dialog with pre-filled row. Without canManage, click does nothing.                                                                                                                                                                                                                                                                                                                     |           |
| 21.7  | Create button                                              | Opens dialog titled `t('feeTypes.createNew')`. Name input (autoFocus, no maxLength, placeholder `t('feeTypes.name')`, required). Description textarea (rows=3, placeholder `t('feeTypes.descriptionField')`).                                                                                                                                                                                     |           |
| 21.8  | Submit create with empty name                              | Save button disabled (`!form.name.trim()`).                                                                                                                                                                                                                                                                                                                                                       |           |
| 21.9  | Submit create with valid name                              | `POST /api/v1/finance/fee-types` body `{ name, description: description                                                                                                                                                                                                                                                                                                                           |           | null }`. Returns 201. Toast `tCommon('created')`. Dialog closes. List refreshes. |     |
| 21.10 | Create duplicate name                                      | Server returns 409 `DUPLICATE_NAME`. Toast `toast.error(err.message ?? t('feeTypes.title'))`.                                                                                                                                                                                                                                                                                                     |           |
| 21.11 | Edit a row                                                 | Dialog opens with title `t('feeTypes.editTitle')`. Fields pre-filled. Submit triggers `PATCH`. On success toast `tCommon('saved')`.                                                                                                                                                                                                                                                               |           |
| 21.12 | Delete a custom fee type                                   | Confirm dialog titled `tCommon('confirmDelete')`, body `t('feeTypes.deleteConfirm')`. Cancel/Delete buttons. Delete = `variant="destructive"`.                                                                                                                                                                                                                                                    |           |
| 21.13 | Delete — confirm                                           | `DELETE /api/v1/finance/fee-types/:id` returns 200 (soft-delete, not 204). Toast `tCommon('deleted')`. List refreshes.                                                                                                                                                                                                                                                                            |           |
| 21.14 | Delete — fee type with fee-structures referencing it       | Server returns 400 `FEE_STRUCTURES_EXIST`. Toast shows error message from server.                                                                                                                                                                                                                                                                                                                 |           |
| 21.15 | Delete — system fee type                                   | Trash button not rendered (`!row.is_system` guard). Confirm via DOM.                                                                                                                                                                                                                                                                                                                              |           |
| 21.16 | Pagination                                                 | `pageSize=20`. `onPageChange=setPage`. Page resets to 1 on search/filter change.                                                                                                                                                                                                                                                                                                                  |           |
| 21.17 | Empty state (no filters, 0 rows)                           | `<EmptyState icon={DollarSign} title={t('feeTypes.noFeeTypes')} description={t('feeTypes.noFeeTypesDesc')} action={canManage ? { label: t('feeTypes.createNew'), onClick: openCreateDialog } : undefined} />`.                                                                                                                                                                                    |           |
| 21.18 | Permission-denied (simulate) — log in as teacher, navigate | API returns 403 `finance.view`. Page shows no rows / empty state. Console logs error.                                                                                                                                                                                                                                                                                                             |           |
| 21.19 | API query with `active=true`                               | Only active fee types returned.                                                                                                                                                                                                                                                                                                                                                                   |           |
| 21.20 | API query with `active=false`                              | Only inactive fee types returned.                                                                                                                                                                                                                                                                                                                                                                 |           |

---

## 22. Fee Structures — List

**URL:** `/{locale}/finance/fee-structures`
**API:** `GET /api/v1/finance/fee-structures?page=&pageSize=20[&search][&active]`

| #    | What to Check                       | Expected Result                                                                                                                                                                                                                                                                                                            | Pass/Fail |
| ---- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 22.1 | Navigate                            | List fetches. Secondary `GET /api/v1/year-groups?pageSize=100` also fires (data discarded by page, but request observable).                                                                                                                                                                                                |           |
| 22.2 | Header                              | Back link labelled `"Back"` (hardcoded English, flagged in §97). New button (`canManage`) → `fee-structures/new` (relative).                                                                                                                                                                                               |           |
| 22.3 | Toolbar — search                    | Placeholder `t('feeStructures.searchPlaceholder')`.                                                                                                                                                                                                                                                                        |           |
| 22.4 | Toolbar — status select             | `all` → `tCommon('all')`, `true` → `t('active')`, `false` → `t('inactive')`.                                                                                                                                                                                                                                               |           |
| 22.5 | Columns                             | (1) `name` font-medium text-primary; (2) `amount` CurrencyDisplay tenant currency mono; (3) `billing_frequency` — hardcoded English labels `One-off`/`Per Term`/`Monthly`/`Custom` (flagged in §97); (4) `year_group` → `row.year_group?.name ?? '—'`; (5) `active` StatusBadge + hardcoded `Active`/`Inactive` (flagged). |           |
| 22.6 | Row click                           | `router.push('fee-structures/{id}')` — relative.                                                                                                                                                                                                                                                                           |           |
| 22.7 | Empty state (no search, status=all) | `<EmptyState icon={DollarSign} title={t('feeStructures.emptyTitle')} description={t('feeStructures.emptyDescription')} action={{ label: t('feeStructures.newButton'), onClick: ... }} />`. Note: action is NOT gated by `canManage` here (inconsistency with fee-types — flagged in §97).                                  |           |
| 22.8 | Pagination                          | `pageSize=20`. Page resets on filter change.                                                                                                                                                                                                                                                                               |           |
| 22.9 | Error path                          | `console.error('[FinanceFeeStructuresPage]', err)`. Reset to empty, total 0.                                                                                                                                                                                                                                               |           |

---

## 23. Fee Structures — New

**URL:** `/{locale}/finance/fee-structures/new`

| #    | What to Check             | Expected Result                                                                                                                                              | Pass/Fail |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------------------- | --- | ------------- | --- |
| 23.1 | Navigate                  | Page renders with `<PageHeader title={t('feeStructures.newTitle')}>` + Back button (`router.back()`).                                                        |           |
| 23.2 | Form renders              | `<FeeStructureForm onSubmit=handleSubmit submitLabel={t('feeStructures.createButton')} onCancel={() => router.push('/{locale}/finance/fee-structures')} />`. |           |
| 23.3 | Submit                    | `POST /api/v1/finance/fee-structures` body `{ name, amount, billing_frequency, year_group_id                                                                 |           | undefined, fee_type_id |     | undefined }`. |     |
| 23.4 | On success                | Redirects to `/{locale}/finance/fee-structures`. No toast.                                                                                                   |           |
| 23.5 | On error (400 validation) | Error surfaced inline via `FeeStructureForm`'s `formError` state (no toast). Console: no `[FeeStructureForm]` log for server errors (only for load errors).  |           |

---

## 24. Fee Structures — Edit

**URL:** `/{locale}/finance/fee-structures/[id]`

| #    | What to Check                      | Expected Result                                                                    | Pass/Fail |
| ---- | ---------------------------------- | ---------------------------------------------------------------------------------- | --------- | ---------------------------------- | --- |
| 24.1 | Navigate with valid id             | `GET /api/v1/finance/fee-structures/{id}` returns 200. Form pre-fills with values. |           |
| 24.2 | Loading UI                         | `h-8 w-48` pulse + `h-64 rounded-xl` pulse. `bg-surface-secondary`.                |           |
| 24.3 | Error UI — 404 or network failure  | Back button (`router.back()`) + `<p class="text-sm text-danger-text">{error        |           | t('feeStructures.notFound')}</p>`. |     |
| 24.4 | Edit form includes `active` switch | Only in edit mode (`isEdit=true`).                                                 |           |
| 24.5 | Submit                             | `PATCH /api/v1/finance/fee-structures/{id}` body includes `active`.                |           |
| 24.6 | On success                         | Redirect to list.                                                                  |           |

---

## 25. Fee Structure Form — Field Reference

Shared form for create + edit. Uses RHF + `zodResolver(feeStructureFormSchema)` (extends `createFeeStructureSchema` with `.extend({ active: z.boolean().optional() })`).

| #     | What to Check                         | Expected Result                                                                                                                                                                            | Pass/Fail |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 25.1  | On mount                              | Two parallel fetches: `GET /year-groups?pageSize=100` and `GET /finance/fee-types?pageSize=100&active=true`.                                                                               |           |
| 25.2  | Name field                            | `<Input id="name" maxLength={150}>` `sm:col-span-2`. Required — schema `z.string().min(1).max(150)`. Error shown in `text-danger-text`.                                                    |           |
| 25.3  | Amount field                          | `<Input type="number" step="0.01" min="0.01" dir="ltr" {...register('amount', { valueAsNumber: true })}>`. Required — `z.number().positive()`.                                             |           |
| 25.4  | Billing frequency — Controller Select | Options: one_off `t('feeStructures.freqOneOff')`, term `t('feeStructures.freqTerm')`, monthly `t('freqMonthly')`, custom `t('freqCustom')`. Default `one_off`.                             |           |
| 25.5  | Year group Select                     | Placeholder `t('feeStructures.yearGroupPlaceholder')`. Item `"none" → t('feeStructures.allYearGroups')` maps to empty string; other items list year_group ids.                             |           |
| 25.6  | Fee type Select (spans 2 cols)        | Placeholder `t('feeStructures.feeTypePlaceholder')`. Item `"none" → t('feeStructures.noFeeType')` maps to `undefined`. Helper text `t('feeStructures.feeTypeHelp')`.                       |           |
| 25.7  | Active Switch                         | Only in edit mode. Label `t('feeStructures.fieldActive')`.                                                                                                                                 |           |
| 25.8  | Submit — client validation failures   | (a) Empty name → error "Required"; (b) Amount ≤ 0 → "Must be positive"; (c) Missing billing_frequency → "Required". Each shown inline.                                                     |           |
| 25.9  | Submit server errors                  | `setFormError(err?.error?.message ?? tc('errorGeneric'))`. Shown above action buttons.                                                                                                     |           |
| 25.10 | Cancel                                | Calls `onCancel` (navigate back to list).                                                                                                                                                  |           |
| 25.11 | Submit loading state                  | Button disabled; label = `tc('loading')`.                                                                                                                                                  |           |
| 25.12 | Server 409 DUPLICATE_NAME             | `formError` shows server message.                                                                                                                                                          |           |
| 25.13 | Server 400 YEAR_GROUP_NOT_FOUND       | If you send an invalid `year_group_id` via devtools, expect 400; form displays error.                                                                                                      |           |
| 25.14 | Inherit name from fee_type            | If `name` is empty but `fee_type_id` is set, service inherits name from the fee type. Flag: current UI requires non-empty name (RHF rejects) — inheritance only works via API direct call. |           |

---

## 26. Fee Assignments — List

**URL:** `/{locale}/finance/fee-assignments`
**API:** `GET /api/v1/finance/fee-assignments?page=&pageSize=20[&household_id]`

| #     | What to Check                           | Expected Result                                                                                                                                                                                                                                                                                                 | Pass/Fail |
| ----- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 26.1  | Navigate                                | List fetches.                                                                                                                                                                                                                                                                                                   |           |
| 26.2  | Header                                  | Back link `<Link>` (inline, hardcoded `"Back"` — flagged §97) → `/{locale}/finance`. New button (canManage) → `fee-assignments/new`.                                                                                                                                                                            |           |
| 26.3  | Toolbar — HouseholdSelector             | `<HouseholdSelector value={householdFilter} placeholder={t('feeAssignments.filterByHousehold')}>`. Clear filter button appears when `householdFilter` truthy; text `t('feeAssignments.clearFilter')`.                                                                                                           |           |
| 26.4  | Columns                                 | (1) household name font-medium; (2) student name or em-dash; (3) fee_structure.name; (4) discount.name or em-dash; (5) effective_dates — `${formatDateShort(effective_from)} – ${effective_to ? formatDateShort(effective_to) : 'Ongoing'}` (hardcoded English "Ongoing", flagged §97). Wrapped in `dir="ltr"`. |           |
| 26.5  | `formatDateShort` format                | `toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })` — e.g., `"12 Apr 2026"`. Parse failures log `[FinanceFeeAssignmentsPage]` and return raw string.                                                                                                                             |           |
| 26.6  | Empty state (no filter, 0 rows)         | EmptyState + action (canManage).                                                                                                                                                                                                                                                                                |           |
| 26.7  | No row click                            | Rows are NOT navigable. Flagged §97.                                                                                                                                                                                                                                                                            |           |
| 26.8  | Filter by household                     | Toolbar selector updates `householdFilter`. Request fires with `&household_id=<id>`. Page resets to 1.                                                                                                                                                                                                          |           |
| 26.9  | End an active assignment via direct API | `POST /api/v1/finance/fee-assignments/{id}/end` returns 200. Re-fetch shows `effective_to` populated, removed from active-only filters.                                                                                                                                                                         |           |
| 26.10 | End already-ended assignment            | Server returns 400 `ALREADY_ENDED`.                                                                                                                                                                                                                                                                             |           |
| 26.11 | Pagination `pageSize=20`                | Server pagination.                                                                                                                                                                                                                                                                                              |           |

---

## 27. Fee Assignments — New

**URL:** `/{locale}/finance/fee-assignments/new`

| #    | What to Check                         | Expected Result                                                                                         | Pass/Fail |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------- | --- | ----------------------------- | --- |
| 27.1 | Navigate                              | Page with PageHeader title `t('feeAssignments.newTitle')`, Back button (`router.back()`). Form renders. |           |
| 27.2 | Submit valid                          | `POST /api/v1/finance/fee-assignments` body `{ household_id, student_id                                 |           | undefined, fee_structure_id, discount_id |     | undefined, effective_from }`. |     |
| 27.3 | On success                            | Redirect to `/{locale}/finance/fee-assignments`. No toast.                                              |           |
| 27.4 | On failure (duplicate assignment 409) | Error displayed in form.                                                                                |           |

---

## 28. Fee Assignment Form — Field Reference

Uses local Zod schema (NOT shared), RHF.

| #     | What to Check                     | Expected Result                                                                                                                                        | Pass/Fail |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 28.1  | On mount                          | Parallel fetches: `GET /fee-structures?pageSize=100&active=true`, `GET /discounts?pageSize=100&active=true`.                                           |           |
| 28.2  | On household change               | If truthy: `GET /students?pageSize=100&household_id=<id>` populates student dropdown. If empty: `setStudents([])` + `form.setValue('student_id', '')`. |           |
| 28.3  | Household field                   | `<HouseholdSelector>` (see §4). `sm:col-span-2`. UUID validation.                                                                                      |           |
| 28.4  | Student field (optional)          | Select populated by household-scoped students. No student = household-level assignment.                                                                |           |
| 28.5  | Fee structure field               | Select from active fee structures. Required.                                                                                                           |           |
| 28.6  | Discount field (optional)         | Select from active discounts.                                                                                                                          |           |
| 28.7  | Effective from field              | `<Input type="date">`. Defaults to today (`new Date().toISOString().slice(0,10)` — UTC). Regex `/^\d{4}-\d{2}-\d{2}$/` enforced.                       |           |
| 28.8  | Submit — duplicate assignment     | Server 409 `DUPLICATE_ASSIGNMENT`. Form displays error.                                                                                                |           |
| 28.9  | Submit — inactive fee structure   | Server 400 `FEE_STRUCTURE_INACTIVE`. Form displays error.                                                                                              |           |
| 28.10 | Submit — missing household        | Should be blocked by client validation. Otherwise 400 `HOUSEHOLD_NOT_FOUND` (from facade).                                                             |           |
| 28.11 | Submit — student not in household | 400 `STUDENT_NOT_FOUND`.                                                                                                                               |           |
| 28.12 | Cancel button                     | Navigates to `/{locale}/finance/fee-assignments`.                                                                                                      |           |

---

## 29. Fee Generation Wizard — Step 1 (Configuration)

**URL:** `/{locale}/finance/fee-generation`
3-step wizard. Page renders `<FeeGenerationWizard />` inside `<PageHeader title={t('feeGeneration.title')}>`.

| #     | What to Check                                                        | Expected Result                                                                                                                                                                                                                                                                                                                | Pass/Fail |
| ----- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 29.1  | On mount                                                             | Three parallel fetches: `GET /year-groups?pageSize=100`, `GET /finance/fee-types?pageSize=100&active=true`, `GET /finance/fee-structures?pageSize=100&active=true`.                                                                                                                                                            |           |
| 29.2  | Step indicator                                                       | 3 pills with labels `t('feeGeneration.step1Label')`, `step2Label`, `step3Label`. Active pill `bg-primary-50 text-primary-700`, completed pill `bg-success-fill text-success-text` + `<Check>` icon, future pill `bg-surface-secondary text-text-tertiary` + circled number. Separator `<ChevronRight class="rtl:rotate-180">`. |           |
| 29.3  | Year Groups card                                                     | Heading `t('feeGeneration.selectYearGroups')`. Grid `sm:grid-cols-2 md:grid-cols-3` of `<label><Checkbox /></label>`. Label class `flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-surface-secondary`.                                                                                     |           |
| 29.4  | Year Groups empty state                                              | When `yearGroups.length === 0` → `t('feeGeneration.noYearGroups')` in `text-sm text-text-tertiary col-span-full`.                                                                                                                                                                                                              |           |
| 29.5  | Fee Types card                                                       | Heading `t('feeGeneration.issueFeeFor')`. Subtitle `t('feeGeneration.issueFeeForDesc')` in `text-xs text-text-tertiary`. Same checkbox grid pattern; each item shows name + optional truncated description.                                                                                                                    |           |
| 29.6  | Matching structures info panel                                       | When both sets non-empty, shows `rounded-lg bg-surface-secondary px-3 py-2` with `t('feeGeneration.matchingStructures', { count: resolvedFeeStructureIds.length })`. Count derived from intersection of selected year groups + fee types (treats `null` year_group as unscoped).                                               |           |
| 29.7  | Billing Period card                                                  | Heading `t('feeGeneration.billingPeriod')`. Grid `sm:grid-cols-3`: billing_start `<Input type="date" dir="ltr" required>` labelled `t('feeGeneration.fieldPeriodStart')`, billing_end labelled `t('feeGeneration.fieldPeriodEnd')`, due_date labelled `t('feeGeneration.fieldDueDate')`.                                       |           |
| 29.8  | Preview button — disabled conditions                                 | `canProceedStep1 = selectedYearGroups.size > 0 && selectedFeeTypes.size > 0 && resolvedFeeStructureIds.length > 0 && billingPeriodStart && billingPeriodEnd && dueDate`. Button disabled when false or `previewLoading`.                                                                                                       |           |
| 29.9  | Preview button label                                                 | `t('feeGeneration.previewButton')` + `<ChevronRight class="ms-2 rtl:rotate-180">`. During load, `<Loader2 class="me-2 animate-spin">` prefix.                                                                                                                                                                                  |           |
| 29.10 | Click Preview with valid inputs                                      | `POST /api/v1/finance/fee-generation/preview` body `{ year_group_ids, fee_structure_ids, billing_period_start, billing_period_end, due_date }`. Response `{ data: PreviewData }`. Transitions to Step 2.                                                                                                                       |           |
| 29.11 | Preview fails (400)                                                  | `setPreviewError(ex?.error?.message ?? tc('errorGeneric'))`. Error rendered inline as `<p class="text-sm text-danger-text">`. No toast. Stay on Step 1.                                                                                                                                                                        |           |
| 29.12 | Preview — inverted dates (billing_period_start > billing_period_end) | Zod schema does NOT enforce ordering — request succeeds but may return 0 valid lines. E2E flags this as a gap in §97.                                                                                                                                                                                                          |           |

---

## 30. Fee Generation Wizard — Step 2 (Preview)

| #     | What to Check                         | Expected Result                                                                                                                                                                                                                                                                                                                                                     | Pass/Fail |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------- | --- |
| 30.1  | On entry                              | Summary cards grid (4 cols): Total Households (`liveSummary.households`), Total Lines (`liveSummary.lines`), Total Amount (`<CurrencyDisplay>` tenant currency), Duplicates Excluded (from `preview.summary.duplicates_excluded`).                                                                                                                                  |           |
| 30.2  | `liveSummary` recomputed on toggle    | When a household is toggled into `excludedHouseholds`: `households`, `lines`, `totalAmount` all decrement based on non-excluded non-duplicate lines.                                                                                                                                                                                                                |           |
| 30.3  | Missing billing parent warning banner | When `preview.summary.missing_billing_parent_count > 0`: `rounded-xl border border-warning-fill bg-warning-fill/30 p-4` with `t('feeGeneration.missingBillingParentWarning', { count })` in `text-sm font-medium text-warning-text`.                                                                                                                                |           |
| 30.4  | Preview table columns                 | (1) Include checkbox `t('feeGeneration.colInclude')`; (2) Household; (3) Student; (4) Fee Structure; (5) Base Amount CurrencyDisplay; (6) Discount — `"{discount_name} ({amount})"` or em-dash; (7) Line Total; (8) Flags — `<StatusBadge>` children for `is_duplicate` (neutral, `t('duplicate')`) and `missing_billing_parent` (warning, `t('noBillingParent')`). |           |
| 30.5  | Row styling                           | Duplicate: `opacity-40 bg-surface-secondary`. Excluded: `opacity-60`. Otherwise normal.                                                                                                                                                                                                                                                                             |           |
| 30.6  | Duplicate checkbox                    | `disabled={isDuplicate}`, checked = `!isExcluded && !isDuplicate`. Duplicates cannot be toggled.                                                                                                                                                                                                                                                                    |           |
| 30.7  | Toggle exclude                        | Clicking household's checkbox toggles the household in `excludedHouseholds` set. All of that household's lines get `opacity-60`.                                                                                                                                                                                                                                    |           |
| 30.8  | Empty preview (0 lines)               | Single row `colSpan={8}` centred, text `t('feeGeneration.noPreviewLines')`. Confirm button disabled.                                                                                                                                                                                                                                                                |           |
| 30.9  | Back button                           | `<Button variant="outline">{tc('back')}</Button>` returns to Step 1 with state preserved (selections intact).                                                                                                                                                                                                                                                       |           |
| 30.10 | Confirm button — disabled conditions  | `confirmLoading                                                                                                                                                                                                                                                                                                                                                     |           | (liveSummary?.lines ?? 0) === 0`. |     |
| 30.11 | Confirm button label                  | `t('feeGeneration.confirmButton')`. During submit, `<Loader2 class="me-2 animate-spin">` prefix.                                                                                                                                                                                                                                                                    |           |
| 30.12 | Click Confirm                         | `POST /api/v1/finance/fee-generation/confirm` body `{ year_group_ids, fee_structure_ids, billing_period_start, billing_period_end, due_date, excluded_household_ids }`. Response `{ data: { invoices_created, total_amount } }`. Transitions to Step 3.                                                                                                             |           |
| 30.13 | Confirm fails (400 NO_VALID_LINES)    | `setConfirmError(...)`. Error rendered inline. No toast.                                                                                                                                                                                                                                                                                                            |           |
| 30.14 | Confirm fails server-side (500)       | Same inline error treatment. Audit log entry NOT created.                                                                                                                                                                                                                                                                                                           |           |

---

## 31. Fee Generation Wizard — Step 3 (Confirmation)

| #    | What to Check          | Expected Result                                                                                                                                                                                                            | Pass/Fail |
| ---- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 31.1 | Success card           | `rounded-xl border border-success-fill bg-success-fill/20 p-8 text-center`. Circular icon container `bg-success-fill` with `<Check text-success-text>`. Heading `t('feeGeneration.successTitle')` `text-lg font-semibold`. |           |
| 31.2 | Two info lines         | `t('feeGeneration.invoicesCreated', { count })`, then `t('feeGeneration.totalGenerated'):` + `<CurrencyDisplay amount={total_amount} class="font-semibold text-text-primary">`.                                            |           |
| 31.3 | Action — View Invoices | `<Button variant="outline">` navigates to `/{locale}/finance/invoices`.                                                                                                                                                    |           |
| 31.4 | Action — Generate More | `<Button>` resets all 9 pieces of wizard state (selectedYearGroups, selectedFeeTypes, billingPeriodStart, billingPeriodEnd, dueDate, preview, excludedHouseholds, confirmResult; step → 1) and returns to Step 1.          |           |
| 31.5 | Audit trail entry      | After confirm, `GET /api/v1/finance/audit-trail` shows entity_type `fee_generation`, action `fee_generation_confirm`, metadata containing `invoices_created`, `total_amount`, `households_affected`, `fee_structure_ids`.  |           |

---

## 32. Fee Generation — Edge Cases & Idempotency

| #     | What to Check                                                   | Expected Result                                                                                                                                                                                             | Pass/Fail |
| ----- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 32.1  | Re-run preview with the same billing period + fee structures    | Duplicate rows are flagged `is_duplicate: true` (based on `(household, fee_structure, period_start, period_end, non-void/cancelled)` lookup). Summary `duplicates_excluded` reflects the duplicate count.   |           |
| 32.2  | Run confirm with a preview that is all duplicates               | 400 `NO_VALID_LINES`. No invoices created.                                                                                                                                                                  |           |
| 32.3  | Sibling discount auto-apply                                     | When a household has ≥ min_students students, percent sibling discount applied to qualifying lines; discount amount shown. Seeded via §1 prerequisites.                                                     |           |
| 32.4  | Percent discount > 100 fallback                                 | Cannot occur via UI (validation blocks). If a bad discount existed via direct DB insert, discount amount capped by `line_total`.                                                                            |           |
| 32.5  | Fixed discount > base amount                                    | Discount capped at base: `Math.min(value, baseAmount)`.                                                                                                                                                     |           |
| 32.6  | Household without primary billing parent                        | `missing_billing_parent: true` flag set on preview. Excluded from confirm via service filter (not preview exclusion — they still show up with warning badge but are automatically filtered out on confirm). |           |
| 32.7  | Year-group scoping precedence                                   | Line included iff fee_structure.year_group_id ∈ dto.year_group_ids OR student.year_group_id ∈ dto.year_group_ids OR neither has a year group.                                                               |           |
| 32.8  | After successful confirm                                        | Invoices created in `status='draft'`, one per household. `subtotal_amount = sum(base_amount)`, `discount_amount = sum(per-line discounts)`, `total_amount = balance_amount = sum(line_total)`.              |           |
| 32.9  | Invoice number format                                           | `{invoice_prefix}-{YYYYMM}-{padded_sequence}` — e.g., `INV-202604-00001`. Per-tenant `tenant_sequences.invoice` incremented.                                                                                |           |
| 32.10 | Concurrency (two admins confirming same preview simultaneously) | Both complete but second admin's lines may all be duplicates on the re-preview. First admin wins sequence; second gets `NO_VALID_LINES` if all duplicates.                                                  |           |

---

## 33. Invoices — List

**URL:** `/{locale}/finance/invoices`
**API:** `GET /api/v1/finance/invoices?page=&pageSize=20&include_lines=true[&search][&date_from][&date_to]`

| #     | What to Check                                     | Expected Result                                                                                                                                                                                                                                                        | Pass/Fail |
| ----- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 33.1  | Navigate                                          | List fetches with `include_lines=true`. Response `{ data: Invoice[], meta: { total } }`.                                                                                                                                                                               |           |
| 33.2  | Header                                            | Title `t('navInvoices')`, description `"View invoices by student"` (hardcoded English, flagged §97). No action buttons (invoices created via wizard).                                                                                                                  |           |
| 33.3  | Filters                                           | Search input `t('searchInvoices')` `ps-9` icon; date_from `<Input type="date">` `w-full sm:w-[150px]`; date_to same. All local state; do NOT sync to URL.                                                                                                              |           |
| 33.4  | Row flattening                                    | Invoices without lines → 1 row (`studentName: null`, `studentNumber: null`, rowKey = invoice.id). Invoices with lines → N rows, rowKey = `${invoice.id}_${line.id}`, student name from line.student.                                                                   |           |
| 33.5  | Columns (hardcoded English headers — flagged §97) | (1) Issue Date formatDate or `--`; (2) Invoice # font-mono text-xs text-primary-600 link to detail; (3) Household `<EntityLink>` or `--`; (4) Student name or `--`; (5) Student # font-mono; (6) Total end-align CurrencyDisplay font-medium; (7) Due Date formatDate. |           |
| 33.6  | Invoice # button                                  | `stopPropagation` then `router.push('/finance/invoices/{id}')`.                                                                                                                                                                                                        |           |
| 33.7  | Row click                                         | `router.push('/finance/invoices/{invoiceId}')`.                                                                                                                                                                                                                        |           |
| 33.8  | Empty state (no filters, 0 rows)                  | `<EmptyState icon={FileText} title={t('noInvoicesYet')} description="No invoices this term -- create fee assignments first, then run the fee generation wizard." />`. Description hardcoded English. Flagged §97.                                                      |           |
| 33.9  | Search keystroke triggers refetch                 | No debounce — every keystroke fires a request. Flagged §97 as potential rate-limit risk.                                                                                                                                                                               |           |
| 33.10 | Deep-link from dashboard                          | `/finance/invoices?status=draft` is produced by dashboard links. Page does NOT read `status` from URL — list does not filter by that param. Flagged §97.                                                                                                               |           |
| 33.11 | Filter by `status=draft,overdue` (via direct URL) | API request includes `status=draft,overdue`; schema `.transform(s => s.split(','))` parses into an array.                                                                                                                                                              |           |
| 33.12 | Pagination `pageSize=20`                          | Server pagination. Page resets on filter change.                                                                                                                                                                                                                       |           |
| 33.13 | Error path                                        | `console.error('[FinanceInvoicesPage]', err)`; reset invoices + total.                                                                                                                                                                                                 |           |
| 33.14 | Load 200 invoices + scroll                        | Pagination controls render; "Next" moves to page 2.                                                                                                                                                                                                                    |           |

---

## 34. Invoice Detail — Header & Metrics

**URL:** `/{locale}/finance/invoices/[id]`
**API:** `GET /api/v1/finance/invoices/{id}` → `{ data: InvoiceDetail }` with nested `lines`, `payment_allocations`, `installments`, `household`, optional `approval_request`.

| #    | What to Check                                      | Expected Result                                                                                                                                                                                                                                                                                                                                                                                       | Pass/Fail |
| ---- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 34.1 | Navigate to `/finance/invoices/{valid-id}`         | One fetch. Loading shows 3 skeletons (title, header, content).                                                                                                                                                                                                                                                                                                                                        |           |
| 34.2 | Invalid id                                         | `<div>{t('invoiceNotFound')}</div>` — no redirect.                                                                                                                                                                                                                                                                                                                                                    |           |
| 34.3 | RecordHub header                                   | `title = invoice_number`, `subtitle = household.household_name`, `reference = invoice_number`, `status = { label, variant }` from map in §7a.                                                                                                                                                                                                                                                         |           |
| 34.4 | 8 metrics (hardcoded English labels — flagged §97) | (1) Household `<EntityLink>`; (2) Issue Date formatDate or `'--'`; (3) Due Date formatDate; (4) Subtotal CurrencyDisplay; (5) Discount CurrencyDisplay `text-success-text`; (6) Total CurrencyDisplay `font-bold`; (7) Paid = `total_amount - balance_amount` CurrencyDisplay `text-success-text`; (8) Balance CurrencyDisplay — colour `font-bold text-danger-text` if > 0 else `text-success-text`. |           |
| 34.5 | Tabs (hardcoded English labels — flagged §97)      | `Lines` → §36; `Payments` → §37; `Installments` → §38.                                                                                                                                                                                                                                                                                                                                                |           |
| 34.6 | No auto-refresh                                    | Only re-fetches via `onActionComplete` or `onInstallmentsCreated` callbacks from child components.                                                                                                                                                                                                                                                                                                    |           |

---

## 35. Invoice Detail — Actions (Issue / Void / Cancel / Write-Off / PDF)

Actions rendered in `<InvoiceActions>` component inside RecordHub.

### State-based availability

| Button      | Available when                                                                               |
| ----------- | -------------------------------------------------------------------------------------------- |
| Issue       | `status === 'draft'`                                                                         |
| Void        | `status IN ['issued','overdue'] AND balance_amount === total_amount` (no payments allocated) |
| Cancel      | `status IN ['draft','pending_approval']`                                                     |
| Write Off   | `status IN ['issued','partially_paid','overdue']`                                            |
| Preview PDF | `status NOT IN ['draft','cancelled']`                                                        |

| #     | What to Check                                                                                     | Expected Result                                                                                                                                                                                                                                                       | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 35.1  | Status `draft` — Issue button visible                                                             | `<Button>` with `<Send>` icon + `t('issue2')`. Click → `POST /api/v1/finance/invoices/{id}/issue`.                                                                                                                                                                    |           |
| 35.2  | Status `draft` — issue with `requireApprovalForInvoiceIssue=false`                                | Response 200. Invoice transitions to `issued`, `issue_date=now`. Toast `'Invoice issued successfully'` (hardcoded — flagged §97). Refetch fires.                                                                                                                      |           |
| 35.3  | Status `draft` — issue with `requireApprovalForInvoiceIssue=true` AND user lacks direct authority | Response: invoice transitions to `pending_approval`, `approval_request_id` populated. UI shows Pending Approval banner (§39).                                                                                                                                         |           |
| 35.4  | Status `draft` — issue with `requireApprovalForInvoiceIssue=true` AND user has direct authority   | Response 200; transitions directly to `issued`.                                                                                                                                                                                                                       |           |
| 35.5  | Issue already-issued invoice                                                                      | Server 400 `INVALID_STATUS_TRANSITION`. Toast `'Failed to issue invoice'` (hardcoded).                                                                                                                                                                                |           |
| 35.6  | Void button — click opens confirm modal                                                           | Title `t('voidInvoice')`, description `"This will void the invoice. This action cannot be undone. Are you sure?"` (hardcoded). Confirm label `"Void Invoice"` (hardcoded), variant `destructive`.                                                                     |           |
| 35.7  | Void — confirm                                                                                    | `POST /api/v1/finance/invoices/{id}/void`. On success: toast `'Invoice voided successfully'` (hardcoded). Refetch. Status → `void`.                                                                                                                                   |           |
| 35.8  | Void — invoice with payments                                                                      | Server 400 `PAYMENTS_EXIST`. Toast error. UI also guards (button not rendered when balance ≠ total).                                                                                                                                                                  |           |
| 35.9  | Cancel button — opens confirm modal                                                               | Title `t('cancelInvoice')`, description `"This will cancel the invoice. This action cannot be undone. Are you sure?"` (hardcoded). Confirm `"Cancel Invoice"` (hardcoded), variant `destructive`.                                                                     |           |
| 35.10 | Cancel — confirm with status `draft`                                                              | `POST /cancel`. On success: toast `'Invoice cancelled successfully'`. Transitions to `cancelled`.                                                                                                                                                                     |           |
| 35.11 | Cancel with status `pending_approval`                                                             | Service first cancels the linked approval request via `approvalRequestsService.cancel`, then updates invoice status. Verify `approval_request.status === 'cancelled'` via audit trail.                                                                                |           |
| 35.12 | Cancel — invalid status                                                                           | Server 400 `INVALID_STATUS_TRANSITION`.                                                                                                                                                                                                                               |           |
| 35.13 | Write Off button — opens modal                                                                    | Title `t('writeOffInvoice')`, description `"Provide a reason for writing off this invoice. This action cannot be undone."` (hardcoded). Body: `<Textarea placeholder={t('enterWriteOffReason')} rows={3}>`. Confirm `"Write Off"` (hardcoded), variant `destructive`. |           |
| 35.14 | Write Off — submit empty reason                                                                   | Client validation `toast.error('Write-off reason is required')` (hardcoded). Request not sent.                                                                                                                                                                        |           |
| 35.15 | Write Off — submit valid reason                                                                   | `POST /api/v1/finance/invoices/{id}/write-off` body `{ write_off_reason }`. Toast `'Invoice written off successfully'`. Status → `written_off`. `write_off_amount` set to current balance; `balance_amount` set to 0.                                                 |           |
| 35.16 | Close write-off modal without submitting                                                          | `writeOffReason` state cleared.                                                                                                                                                                                                                                       |           |
| 35.17 | Preview PDF button                                                                                | Opens PdfPreviewModal (§6). Title `t('invoicePdf')`, pdfUrl `/api/v1/finance/invoices/{id}/pdf`.                                                                                                                                                                      |           |
| 35.18 | PDF response                                                                                      | Content-Type `application/pdf`, Content-Disposition `inline; filename="invoice-{invoice_number}.pdf"`. Uses tenant branding from `TenantReadFacade.findBranding`.                                                                                                     |           |
| 35.19 | PDF with `?locale=ar`                                                                             | Request `GET /api/v1/finance/invoices/{id}/pdf?locale=ar` renders Arabic template (if PdfRenderingService supports).                                                                                                                                                  |           |
| 35.20 | Error logging                                                                                     | All catches log `console.error('[InvoiceActions]', err)`.                                                                                                                                                                                                             |           |
| 35.21 | Post-action behaviour                                                                             | All successful actions close the modal (if applicable) and call `onActionComplete()` → refetch.                                                                                                                                                                       |           |

---

## 36. Invoice Detail — Lines Tab

| #    | What to Check    | Expected Result                                                                                                                                                                                                                                                                    | Pass/Fail |
| ---- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 36.1 | Empty            | `<p>{t('noInvoiceLines')}</p>` in `text-sm text-text-tertiary`.                                                                                                                                                                                                                    |           |
| 36.2 | Columns          | (1) Description `t('description')` start; (2) Student `tCommon('student')` or `--`; (3) Fee Structure `t('feeStructure')` or `--`; (4) Qty `t('qty')` end; (5) Unit Amount `t('unitAmount')` end CurrencyDisplay; (6) Line Total `t('lineTotal')` end CurrencyDisplay font-medium. |           |
| 36.3 | Row styling      | `border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary`.                                                                                                                                                                                             |           |
| 36.4 | Currency display | Uses tenant currency code.                                                                                                                                                                                                                                                         |           |

---

## 37. Invoice Detail — Payments Tab

| #    | What to Check   | Expected Result                                                                                                                                                                                                                                                                                                                                                       | Pass/Fail |
| ---- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 37.1 | Empty           | `<p>{t('noPaymentsAllocatedToThis')}</p>`.                                                                                                                                                                                                                                                                                                                            |           |
| 37.2 | Columns         | (1) Payment Reference `t('paymentReference2')` — `<EntityLink type=payment href="/finance/payments/{id}">`; (2) Method `t('method')` — mapped via `methodLabelMap` (stripe/cash/bank_transfer/card_manual with hardcoded English labels — flagged §97); (3) Amount Allocated `t('amountAllocated')` end CurrencyDisplay font-medium; (4) Date `t('date')` formatDate. |           |
| 37.3 | Allocation rows | One row per `payment_allocations` entry. Shows allocated amount (not full payment amount).                                                                                                                                                                                                                                                                            |           |

---

## 38. Invoice Detail — Installments Tab

| #    | What to Check                                                                                               | Expected Result                                                                                                                                                                                                                                            | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 38.1 | Gate — `canCreateInstallments = installments.length === 0 && status IN ['draft','issued','partially_paid']` | Create Plan button visible only under this condition.                                                                                                                                                                                                      |           |
| 38.2 | Create Plan button                                                                                          | `<Plus>` + `t('createInstallmentPlan')`. Opens InstallmentForm modal.                                                                                                                                                                                      |           |
| 38.3 | Empty state                                                                                                 | `<p>{t('noInstallmentPlanForThis')}</p>`.                                                                                                                                                                                                                  |           |
| 38.4 | Table                                                                                                       | Columns: Due Date `t('dueDate')` start formatDate; Amount `t('amount')` end CurrencyDisplay; Status `t('status')` StatusBadge — variant map (pending→warning, paid→success, overdue→danger) + hardcoded labels `Pending`, `Paid`, `Overdue` (flagged §97). |           |
| 38.5 | InstallmentForm modal (see §38b below)                                                                      | Opens on click.                                                                                                                                                                                                                                            |           |

### 38b. Installment Form Modal

| #     | What to Check                | Expected Result                                                                                                                                                       | Pass/Fail |
| ----- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------- | --- |
| 38.6  | Dialog                       | Title `t('createInstallmentPlan')`, description `t('splitTheInvoiceTotalInto')`. Content `max-w-lg`.                                                                  |           |
| 38.7  | Invoice total summary        | `t('invoiceTotal')` + CurrencyDisplay.                                                                                                                                |           |
| 38.8  | Rows default                 | 2 empty rows `{ due_date: '', amount: '' }`.                                                                                                                          |           |
| 38.9  | Add row button               | `t('addInstallment')`, `<Plus>` icon. Appends `{ due_date: '', amount: '' }`.                                                                                         |           |
| 38.10 | Remove row button            | `<Trash2>` per row, disabled when `rows.length <= 1`.                                                                                                                 |           |
| 38.11 | Running total panel          | `t('totalAllocated')` CurrencyDisplay — colour `font-medium text-success-text` when `                                                                                 | remaining | < 0.01`, else `font-medium text-danger-text`. If remaining ≠ 0, shows `(Remaining: <amt>)`or`(Over: <amt>)` (hardcoded English — flagged §97). |           |
| 38.12 | Cancel                       | `t('cancel')`. Disabled when submitting.                                                                                                                              |           |
| 38.13 | Submit — disabled conditions | `!isValid                                                                                                                                                             |           | isSubmitting`. isValid = rows ≥ 1 AND all rows have due_date + amount > 0 AND `                                                                | remaining | < 0.01`. |     |
| 38.14 | Submit label                 | `isSubmitting ? 'Creating...' : 'Create Plan'` (hardcoded — flagged §97).                                                                                             |           |
| 38.15 | Submit valid                 | `POST /api/v1/finance/invoices/{id}/installments` body `{ installments: [{ due_date, amount }, ...] }`. Response 201. Toast `'Installment plan created'` (hardcoded). |           |
| 38.16 | Submit sum mismatch          | Server 400 `INSTALLMENT_SUM_MISMATCH`. Toast `'Failed to create installment plan'`.                                                                                   |           |
| 38.17 | Post-success                 | Rows reset to 2 empty. Parent calls `onInstallmentsCreated` which refetches.                                                                                          |           |
| 38.18 | Error log                    | `console.error('[InstallmentForm]', err)`.                                                                                                                            |           |
| 38.19 | Delete installments via API  | `DELETE /api/v1/finance/invoices/{id}/installments` returns 200. UI doesn't expose this — verify via direct API call.                                                 |           |

---

## 39. Invoice Detail — Pending Approval Banner

| #    | What to Check                                 | Expected Result                                                                                                                                                     | Pass/Fail |
| ---- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 39.1 | Render condition                              | `status === 'pending_approval' && approval != null`.                                                                                                                |           |
| 39.2 | Banner styling                                | `rounded-xl border border-warning-border bg-warning-surface px-6 py-4`.                                                                                             |           |
| 39.3 | Content                                       | Title `t('pendingApproval')`. Line: `t('requestedBy2')` + `approval.requested_by_name ?? 'Unknown'` + (if `requested_at` present) `on ${formatDate(requested_at)}`. |           |
| 39.4 | Approval granted externally (worker callback) | After `finance:on-approval` job processes, invoice transitions to `issued`. Banner disappears on refetch.                                                           |           |

---

## 40. Invoice Detail — Write-Off Reason Banner

| #    | What to Check    | Expected Result                                                                                                                 | Pass/Fail |
| ---- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 40.1 | Render condition | `status === 'written_off' && write_off_reason` truthy.                                                                          |           |
| 40.2 | Banner           | `rounded-xl border border-border bg-surface-secondary px-6 py-4`. Title `t('writeOffReason')`, body `invoice.write_off_reason`. |           |

---

## 41. Invoice — State Machine (Full Transition Graph)

Source of truth: `packages/shared/src/constants/invoice-status.ts`.

```
draft            → pending_approval | issued | cancelled
pending_approval → issued | cancelled
issued           → partially_paid | paid | overdue | void | written_off
partially_paid   → paid | written_off
overdue          → partially_paid | paid | void | written_off
paid             → [terminal]
void             → [terminal]
cancelled        → [terminal]
written_off      → [terminal]
```

Derived status via `deriveInvoiceStatus(currentStatus, balance, total, dueDate, writeOff)`:

- `currentStatus IN ['void','cancelled','pending_approval']` → unchanged
- `writeOff > 0 && |balance| < 0.005` → `'written_off'`
- `|balance| < 0.005` → `'paid'`
- `balance > 0.005 && |balance - total| > 0.005` → `'partially_paid'`
- `|balance - total| < 0.005 && dueDate < now` → `'overdue'`
- else → `'issued'`

| #    | What to Check                                 | Expected Result                                                                                                | Pass/Fail                                                               |
| ---- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- |
| 41.1 | Valid transition — draft → issued             | Issue action succeeds.                                                                                         |                                                                         |
| 41.2 | Invalid transition — paid → draft             | 400 `INVALID_STATUS_TRANSITION`.                                                                               |                                                                         |
| 41.3 | Invalid transition — cancelled → issued       | 400.                                                                                                           |                                                                         |
| 41.4 | Invalid transition — void → partially_paid    | 400.                                                                                                           |                                                                         |
| 41.5 | Terminal states refuse all transitions        | 400 for every attempt on `paid`, `void`, `cancelled`, `written_off`.                                           |                                                                         |
| 41.6 | Optimistic concurrency on PATCH               | `expected_updated_at` must match `existing.updated_at` within 1000ms; otherwise 409 `CONCURRENT_MODIFICATION`. |                                                                         |
| 41.7 | Update invoice while status ≠ draft           | 400 `INVALID_STATUS_TRANSITION` (reuses the code).                                                             |                                                                         |
| 41.8 | Overdue auto-transition                       | `finance:overdue-detection` cron transitions `issued                                                           | partially_paid → overdue` daily for past-due invoices with balance > 0. |     |
| 41.9 | Status recalculation after payment allocation | `recalculateBalance` derives new status from `deriveInvoiceStatus`. No transition validation (trusted).        |                                                                         |

---

## 42. Payments — List

**URL:** `/{locale}/finance/payments`
**APIs:** `GET /api/v1/finance/payments/staff`, `GET /api/v1/finance/payments?page=&pageSize=20[&search][&status][&payment_method][&date_from][&date_to][&accepted_by_user_id]`

Role gate `canManage = hasAnyRole('school_principal','accounting')` controls "New Payment" button and empty-state CTA.

| #     | What to Check                                               | Expected Result                                                                                                                                                                                                                                                                                                                                       | Pass/Fail |
| ----- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 42.1  | Navigate                                                    | Parallel fetches: staff (`GET /staff` returns `{ data: StaffOption[] }`), payments list.                                                                                                                                                                                                                                                              |           |
| 42.2  | Header                                                      | Title `t('navPayments')`, description `"View and manage incoming payments"` (hardcoded — flagged §97). `canManage` → New Payment button (`<Plus>` + `t('newPayment')`) → `/finance/payments/new`.                                                                                                                                                     |           |
| 42.3  | Toolbar — search                                            | Placeholder `${t('searchByReference')}...` `ps-9`.                                                                                                                                                                                                                                                                                                    |           |
| 42.4  | Toolbar — status select                                     | `all` `t('allStatuses')`, `pending`, `posted`, `failed`, `voided`, `refunded_partial`, `refunded_full` (each with localised key).                                                                                                                                                                                                                     |           |
| 42.5  | Toolbar — method select                                     | `all` `t('allMethods')`, `cash`, `bank_transfer`, `card_manual`, `stripe`. Note stripe included here (but not in manual entry form).                                                                                                                                                                                                                  |           |
| 42.6  | Toolbar — staff select                                      | `all` `t('allStaff')`, items from `/staff` endpoint showing `staff.name`.                                                                                                                                                                                                                                                                             |           |
| 42.7  | Toolbar — date_from + date_to                               | Separate date inputs.                                                                                                                                                                                                                                                                                                                                 |           |
| 42.8  | Columns                                                     | (1) Reference — font-mono text-xs text-text-secondary; (2) Household `<EntityLink>`; (3) Total end CurrencyDisplay font-medium; (4) Method — hardcoded label from `methodLabelMap`; (5) Date formatDate; (6) Accepted By — Stripe literal for stripe method, `t('bankTransfer')` for bank_transfer without posted_by, else `${first} ${last}` or `—`. |           |
| 42.9  | Row click                                                   | `router.push('/finance/payments/{id}')`.                                                                                                                                                                                                                                                                                                              |           |
| 42.10 | Empty state (no filters, 0 rows)                            | `<EmptyState icon={Banknote} title={t('noPaymentsYet')} description="Record your first payment to get started." action={canManage ? { label: 'Record Payment', onClick: ... } : undefined} />`. Hardcoded English flagged §97.                                                                                                                        |           |
| 42.11 | Filter by status=pending                                    | `GET /payments?status=pending`.                                                                                                                                                                                                                                                                                                                       |           |
| 42.12 | Filter by payment_method=stripe                             | `GET /payments?payment_method=stripe`.                                                                                                                                                                                                                                                                                                                |           |
| 42.13 | Filter by accepted_by_user_id                               | Uses staff select value.                                                                                                                                                                                                                                                                                                                              |           |
| 42.14 | Search across reference + household name + household number | Server-side OR search (`payment_reference`, `household_name`, `household_number` all ilike).                                                                                                                                                                                                                                                          |           |
| 42.15 | Pagination `pageSize=20`                                    | Server pagination. Page resets on filter change.                                                                                                                                                                                                                                                                                                      |           |
| 42.16 | Error path                                                  | `console.error('[FinancePaymentsPage]', err)`.                                                                                                                                                                                                                                                                                                        |           |

---

## 43. Payments — New (Manual Entry)

**URL:** `/{locale}/finance/payments/new`

| #     | What to Check                                      | Expected Result                                                                                                                                                                                                | Pass/Fail |
| ----- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 43.1  | Navigate                                           | PageHeader title `t('newPayment')`, description `"Record a manual payment from a household"` (hardcoded — flagged §97).                                                                                        |           |
| 43.2  | Form container                                     | `rounded-xl border border-border bg-surface p-6`.                                                                                                                                                              |           |
| 43.3  | Form uses RHF + `zodResolver(createPaymentSchema)` | Validation matches §Zod shared schema.                                                                                                                                                                         |           |
| 43.4  | Intro paragraph                                    | `<p>{t('paymentRefAutoNote')}</p>` in `text-sm text-text-secondary`.                                                                                                                                           |           |
| 43.5  | Household field (span 2)                           | `<HouseholdSelector value={household_id} placeholder={t('searchAndSelectHousehold')}>`. UUID required.                                                                                                         |           |
| 43.6  | Payment method select                              | Placeholder `t('selectMethod')`. Items: `cash`, `bank_transfer`, `card_manual` only. Stripe NOT offered (webhook-only).                                                                                        |           |
| 43.7  | Amount input                                       | `<Input type="number" step="0.01" min="0" placeholder="0.00" {...register('amount', { valueAsNumber: true })}>`. Required and positive.                                                                        |           |
| 43.8  | Received at input                                  | `<Input type="datetime-local" value={receivedAtLocal}>`. Syncs to RHF via `setValue('received_at', ISO)`. Default = now.                                                                                       |           |
| 43.9  | Reason field (span 2, optional)                    | `<Textarea placeholder={t('optionalNotesAboutThisPayment')} rows={2}>`. Trim; `undefined` if blank. Max 1000.                                                                                                  |           |
| 43.10 | Submit valid                                       | `POST /api/v1/finance/payments` body `{ household_id, payment_method, amount, received_at (ISO), reason? }`. Response `{ data: { id } }`. Toast `t('paymentRecorded')`.                                        |           |
| 43.11 | Submit button label                                | `isSubmitting ? 'Recording...' : 'Record Payment'` (hardcoded — flagged §97).                                                                                                                                  |           |
| 43.12 | Field errors                                       | Inline `<p class="text-xs text-danger-text">` below each input.                                                                                                                                                |           |
| 43.13 | Submit — missing household                         | Zod blocks at client.                                                                                                                                                                                          |           |
| 43.14 | Submit — server 400 HOUSEHOLD_NOT_FOUND            | Toast `t('paymentRecordFailed')`. Console `[PaymentForm]`.                                                                                                                                                     |           |
| 43.15 | Post-success                                       | `onSuccess(paymentId)` → `router.push('/finance/payments/{paymentId}')`.                                                                                                                                       |           |
| 43.16 | Payment reference generated                        | Server creates via `sequenceService.nextNumber(tenantId, 'payment', undefined, 'PAYREF')` → e.g., `PAYREF-000001`. Status `posted`, `posted_by_user_id = currentUser`, `currency_code = tenant.currency_code`. |           |
| 43.17 | Direct navigation as non-manager                   | No page-level role guard. API enforces `finance.manage`. If user lacks it, 403.                                                                                                                                |           |

---

## 44. Payment Detail — Header & Metrics

**URL:** `/{locale}/finance/payments/[id]`
**API:** `GET /api/v1/finance/payments/{id}`

| #    | What to Check                                                           | Expected Result                                                                                                                                                                                                                                                                                                                                                                        | Pass/Fail |
| ---- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 44.1 | Navigate valid                                                          | Fetch returns `{ data: PaymentDetail }` with `allocations`, `receipt`, `refunds`, `household`. Loading shows 3 skeletons.                                                                                                                                                                                                                                                              |           |
| 44.2 | Invalid id                                                              | `<div>{t('paymentNotFound')}</div>` in `text-text-tertiary`.                                                                                                                                                                                                                                                                                                                           |           |
| 44.3 | Computed frontend fields                                                | `allocated_amount = sum(alloc.allocated_amount ?? alloc.amount ?? 0)`. `unallocated_amount = amount - allocated_amount`.                                                                                                                                                                                                                                                               |           |
| 44.4 | RecordHub header                                                        | title=`payment_reference`, subtitle=`household.household_name`, reference=`payment_reference`, status from §7b map.                                                                                                                                                                                                                                                                    |           |
| 44.5 | 7 metrics (hardcoded English labels except `Accepted By` — flagged §97) | (1) Household `<EntityLink>` (note: href lacks `/{locale}` prefix — inconsistency vs list page, flagged §97); (2) Amount CurrencyDisplay font-bold; (3) Method label; (4) Received `formatDateTime`; (5) Allocated CurrencyDisplay text-success-text; (6) Unallocated CurrencyDisplay — text-warning-text if > 0 else no colour; (7) Accepted By `t('acceptedBy')` — user name or `—`. |           |
| 44.6 | Action — Receipt PDF button                                             | `<Button variant="outline">` with `<FileText>` + `t('receiptPdf')`. Opens PdfPreviewModal titled `t('receiptPdf')` with url `/api/v1/finance/payments/{id}/receipt/pdf`.                                                                                                                                                                                                               |           |
| 44.7 | Payment note banner (conditional on `payment.reason`)                   | `rounded-xl border border-border bg-surface-secondary px-6 py-4`. Title `t('paymentNote')`, body `payment.reason`.                                                                                                                                                                                                                                                                     |           |
| 44.8 | Tabs (hardcoded `Allocations` and `Refunds` — flagged §97)              | Allocations → §45, Refunds → §46.                                                                                                                                                                                                                                                                                                                                                      |           |

---

## 45. Payment Detail — Allocations Tab & Allocation Panel

### Gate logic

- `isAllocated = payment.allocations.length > 0`
- `canAllocate = payment.unallocated_amount > 0 && status IN ['pending','posted']`

| #     | What to Check                         | Expected Result                                                                                                                                                                                                                                                                                                                                     | Pass/Fail |
| ----- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------- | --- |
| 45.1  | When `isAllocated`                    | Table renders. Columns: Invoice `t('invoice')` link, Due Date formatDate, Invoice Total end CurrencyDisplay, Allocated end CurrencyDisplay font-medium, Date formatDate(alloc.created_at).                                                                                                                                                          |           |
| 45.2  | When `canAllocate` AND `!isAllocated` | `<AllocationPanel paymentId paymentAmount=unallocated currencyCode onAllocationComplete=fetchPayment>` renders.                                                                                                                                                                                                                                     |           |
| 45.3  | Neither                               | `<p>{t('noAllocationsForThisPayment')}</p>`.                                                                                                                                                                                                                                                                                                        |           |
| 45.4  | Allocation Panel header               | `<h3>{t('allocatePayment')}</h3>` + `<Button variant="outline" size="sm" onClick=handleSuggest>` with `<Sparkles>` + `isSuggesting ? 'Suggesting...' : 'Suggest Allocations'` (hardcoded — flagged §97).                                                                                                                                            |           |
| 45.5  | Before any suggestion                 | Empty card `rounded-xl border border-dashed border-border p-8` with `t('clickSuggestAllocationsToAuto')`.                                                                                                                                                                                                                                           |           |
| 45.6  | Click Suggest                         | `GET /api/v1/finance/payments/{id}/allocations/suggest` (permission `finance.manage`). Response populates rows with FIFO invoices.                                                                                                                                                                                                                  |           |
| 45.7  | Suggest no results                    | `toast.info('No outstanding invoices found for this household')` (hardcoded — flagged §97).                                                                                                                                                                                                                                                         |           |
| 45.8  | Suggest error                         | Toast `'Failed to fetch allocation suggestions'` (hardcoded). Console `[AllocationPanel]`.                                                                                                                                                                                                                                                          |           |
| 45.9  | Row columns                           | (1) Invoice `t('invoice')` font-mono text-xs text-primary-700; (2) Due Date; (3) Balance Amount CurrencyDisplay; (4) Allocate input `<Input type="number" step="0.01" min="0" max={invoice_balance} className="w-32 text-end">` + exceed warning `<span class="text-xs text-danger-text">{t('exceedsBalance')}</span>` when `amt > balance + 0.01`. |           |
| 45.10 | Running totals panel                  | Payment Amount CurrencyDisplay; Total Allocated CurrencyDisplay (colour: `danger-text` if > amount+0.01 else `success-text`); Remaining CurrencyDisplay — `danger-text` if < -0.01, `warning-text` if > 0.01, else `text-tertiary`.                                                                                                                 |           |
| 45.11 | Over-allocation warning               | When `totalAllocated > paymentAmount + 0.01`: `<p>{t('totalAllocationsCannotExceedThe')}</p>` in `text-xs text-danger-text`.                                                                                                                                                                                                                        |           |
| 45.12 | Confirm button                        | `<Button onClick=handleConfirm>` with `<Check>` + `isConfirming ? 'Confirming...' : 'Confirm Allocations'` (hardcoded — flagged §97). Disabled when `!isValid                                                                                                                                                                                       |           | isConfirming`. |     |
| 45.13 | isValid                               | `rows.length > 0 AND some amt > 0 AND totalAllocated <= paymentAmount + 0.01 AND every row (amt === 0 OR 0 < amt <= balance + 0.01)`.                                                                                                                                                                                                               |           |
| 45.14 | Submit                                | `POST /api/v1/finance/payments/{id}/allocations` body `{ allocations: [{ invoice_id, amount }, ...] }`. Response 201. Toast `'Allocations confirmed'` (hardcoded).                                                                                                                                                                                  |           |
| 45.15 | Server concurrency guard              | Uses `SELECT FOR UPDATE` on payment + invoices inside RLS tx. Race: two admins allocating same payment concurrently — one wins, the other gets `INVALID_STATUS` (payment already fully allocated).                                                                                                                                                  |           |
| 45.16 | Server 400 ALLOCATION_EXCEEDS_PAYMENT | Thrown when newTotal > remaining + 0.01. Toast shows.                                                                                                                                                                                                                                                                                               |           |
| 45.17 | Server 400 INVOICE_NOT_FOUND          | Thrown for stale invoice id.                                                                                                                                                                                                                                                                                                                        |           |
| 45.18 | Server 400 HOUSEHOLD_MISMATCH         | Thrown when allocating to invoice belonging to a different household.                                                                                                                                                                                                                                                                               |           |
| 45.19 | Server 400 ALLOCATION_EXCEEDS_BALANCE | Thrown when alloc.amount > invoice.balance + 0.01.                                                                                                                                                                                                                                                                                                  |           |
| 45.20 | Post-success                          | Receipt auto-created (first time) via `receiptsService.createForPayment`. Invoice balances recalculated via `invoicesService.recalculateBalance` inside same tx.                                                                                                                                                                                    |           |
| 45.21 | Verify via invoice detail             | After allocation, invoice's Payments tab shows the allocation.                                                                                                                                                                                                                                                                                      |           |
| 45.22 | Verify via receipt endpoint           | `GET /api/v1/finance/payments/{id}/receipt` returns receipt object. Subsequent allocations do NOT re-create receipt (idempotent).                                                                                                                                                                                                                   |           |

---

## 46. Payment Detail — Refunds Tab

| #    | What to Check                 | Expected Result                                                                                                                                      | Pass/Fail |
| ---- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 46.1 | Empty                         | `<p>{t('noRefundsForThisPayment')}</p>`.                                                                                                             |           |
| 46.2 | Columns                       | (1) Amount `t('amount')` end; (2) Reason `t('reason')`; (3) Status `t('status')` `<RefundStatusBadge>`; (4) Date `t('date')` formatDate(created_at). |           |
| 46.3 | After creating a refund (§50) | Refund appears in this tab.                                                                                                                          |           |

---

## 47. Payment Detail — Receipt PDF

| #    | What to Check                          | Expected Result                                                                                                                                          | Pass/Fail |
| ---- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 47.1 | Click Receipt PDF                      | PdfPreviewModal opens. Fetches `/api/v1/finance/payments/{id}/receipt/pdf`.                                                                              |           |
| 47.2 | Content-Type                           | `application/pdf`.                                                                                                                                       |           |
| 47.3 | Content-Disposition                    | `inline; filename="receipt-{id}.pdf"` (uses payment UUID in filename — not receipt_number, flagged §97).                                                 |           |
| 47.4 | PDF content                            | Shows payment_reference, household name, billing parent, allocations list, outstanding before/after snapshot (approximation: `remainingAfter + amount`). |           |
| 47.5 | Snapshot accuracy                      | `outstandingBefore` is an approximation, not a true event-time replay. Documented in snapshot logic.                                                     |           |
| 47.6 | Locale query `?locale=ar`              | Request `GET /receipt/pdf?locale=ar` renders Arabic template.                                                                                            |           |
| 47.7 | Receipt from Stripe-originated payment | For payments created via Stripe webhook, `issued_by_user_id = null` (system-generated). Receipt still renders.                                           |           |

---

## 48. Payment — State Machine & Allocation Invariants

Payment statuses: `pending | posted | failed | voided | refunded_partial | refunded_full`.

Observed transitions (no central VALID_TRANSITIONS map):

```
pending          → posted | failed | voided
posted           → refunded_partial | refunded_full | voided
failed           → pending
refunded_partial → refunded_full
voided           → [terminal]
refunded_full    → [terminal]
```

| #    | What to Check                            | Expected Result                                                                                                       | Pass/Fail |
| ---- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| 48.1 | Manual payment creation                  | Starts as `posted` (no pending step).                                                                                 |           |
| 48.2 | Stripe webhook payment creation          | Starts as `posted`. `external_provider = 'stripe'`, `external_event_id = payment_intent_id`.                          |           |
| 48.3 | Attempt to allocate a `failed` payment   | 400 `INVALID_STATUS`.                                                                                                 |           |
| 48.4 | Attempt to allocate a `voided` payment   | 400 `INVALID_STATUS`.                                                                                                 |           |
| 48.5 | Refund execution transitions             | Post-refund: `totalRefunded >= amount - 0.01` → `refunded_full`; `> 0` → `refunded_partial`; else revert to `posted`. |           |
| 48.6 | Refund can cause partial→full transition | Multiple refunds summing to full amount transitions to `refunded_full`.                                               |           |
| 48.7 | Refund rejection/failure                 | Does NOT transition payment status.                                                                                   |           |
| 48.8 | isValidPaymentTransition helper exists   | Exported from `packages/shared/src/finance/state-machine-payment.ts` for future use.                                  |           |

---

## 49. Refunds — List

**URL:** `/{locale}/finance/refunds`
**API:** `GET /api/v1/finance/refunds?page=&pageSize=20[&search][&status]`

Role gate: `canManage = hasAnyRole('school_principal','accounting')`.

| #     | What to Check                       | Expected Result                                                                                                                                                                                                                          | Pass/Fail |
| ----- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 49.1  | Navigate                            | List fetches.                                                                                                                                                                                                                            |           |
| 49.2  | Header                              | Title `t('refunds')`, description `t('refundsDescription')`. `canManage` → Create Refund button (`<Plus>` + `t('createRefund')`).                                                                                                        |           |
| 49.3  | Toolbar                             | Search `tCommon('search')` ps-9; status select `all`/`pending_approval`/`approved`/`executed`/`failed`/`rejected`.                                                                                                                       |           |
| 49.4  | Columns                             | (1) Refund Reference `t('refundReference')` font-mono; (2) Payment Reference; (3) Household; (4) Total Amount CurrencyDisplay mono; (5) Status `<RefundStatusBadge>`; (6) Requested By; (7) Reason truncated max-w-[200px]; (8) Actions. |           |
| 49.5  | Actions — pending_approval status   | Approve (`variant=outline`, `t('approve')`) + Reject (`variant=outline text-danger-text border-danger-border hover:bg-danger-50`, `t('reject')`). Both call `e.stopPropagation()`.                                                       |           |
| 49.6  | Actions — approved status           | Execute button (primary, `t('execute')`).                                                                                                                                                                                                |           |
| 49.7  | Actions — else                      | `<span>--</span>` in `text-xs text-text-tertiary`.                                                                                                                                                                                       |           |
| 49.8  | `actionLoading` state               | Disables action buttons while in-flight.                                                                                                                                                                                                 |           |
| 49.9  | Empty state (no search, status=all) | `<EmptyState icon={RotateCcw} title={t('noRefunds')} description={t('noRefundsDesc')} />`. No action CTA.                                                                                                                                |           |
| 49.10 | Pagination `pageSize=20`            | Page resets on filter change.                                                                                                                                                                                                            |           |
| 49.11 | Error logs                          | `[FinanceRefundsPage]`, `[fetchRefunds]`.                                                                                                                                                                                                |           |

---

## 50. Refunds — Create Modal (Payment Search)

| #    | What to Check                                            | Expected Result                                                                                                                                                                     | Pass/Fail |
| ---- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 50.1 | Click Create Refund                                      | Dialog opens. Title `t('createRefund')`.                                                                                                                                            |           |
| 50.2 | Initial state                                            | Payment search mode. Input placeholder `t('searchPaymentPlaceholder')`. Search button (`<Search>` icon, `variant=outline size=sm`).                                                 |           |
| 50.3 | Enter key in search input                                | Triggers `handleSearchPayments`.                                                                                                                                                    |           |
| 50.4 | Debounced search                                         | 300ms debounce via `setTimeout` in `useEffect`.                                                                                                                                     |           |
| 50.5 | Search API                                               | `GET /api/v1/finance/payments?search={q}&pageSize=10`.                                                                                                                              |           |
| 50.6 | Loading                                                  | `<p>{tCommon('loading')}...</p>`.                                                                                                                                                   |           |
| 50.7 | Results list (`max-h-[240px] overflow-y-auto space-y-2`) | Each result a full-width button showing `payment_reference` (mono), amount CurrencyDisplay, household name or em-dash, and `refundable: {amount}` with `<span dir="ltr">` wrapping. |           |
| 50.8 | No results                                               | `<p>{t('noPaymentsFound')}</p>`.                                                                                                                                                    |           |
| 50.9 | Search error                                             | `console.error('[RefundsPage.searchPayments]', err)`.                                                                                                                               |           |

---

## 51. Refunds — Create Modal (Amount & Reason)

| #     | What to Check                                      | Expected Result                                                                                                                                                                                                                                      | Pass/Fail |
| ----- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------- | --- | ---------------------------------------------------------------------------------- | --- |
| 51.1  | After selecting a payment                          | Summary card `rounded-lg border border-border bg-surface-secondary p-3`. Header `t('selectedPayment')` + `<Button variant="ghost" size="sm">{t('changePayment')}</Button>`.                                                                          |           |
| 51.2  | Summary rows                                       | `t('reference')`, `t('household')`, `t('totalAmount')`, `t('method')` (method capitalised via `.replace(/_/g, ' ')` — hardcoded transformation, flagged §97), `t('refundable')` (manual number format, `dir="ltr"`, `text-success-700 font-medium`). |           |
| 51.3  | Amount input                                       | `<Input type="number" min="0.01" step="0.01" max={refundable} placeholder="0.00" dir="ltr">`.                                                                                                                                                        |           |
| 51.4  | Reason textarea                                    | `<Textarea placeholder={t('refundReasonPlaceholder')} rows={3}>`. Required (schema `min(1).max(1000)`).                                                                                                                                              |           |
| 51.5  | Footer — Cancel                                    | `<Button variant="outline">{tCommon('cancel')}</Button>`. Closes and resets.                                                                                                                                                                         |           |
| 51.6  | Footer — Create                                    | `<Button onClick=handleCreateRefund disabled={creating                                                                                                                                                                                               |           | !refundAmount |     | !refundReason.trim()}>`. Label `creating ? tCommon('saving') : t('createRefund')`. |     |
| 51.7  | Submit — invalid amount (NaN, ≤ 0) or reason empty | Toast `t('refundValidationError')`. Request not sent.                                                                                                                                                                                                |           |
| 51.8  | Submit — amount > refundable                       | Toast `t('refundExceedsPayment')`. Request not sent.                                                                                                                                                                                                 |           |
| 51.9  | Submit valid                                       | `POST /api/v1/finance/refunds` body `{ payment_id, amount, reason }`. Toast `t('refundCreated')`. Modal closes, refetch.                                                                                                                             |           |
| 51.10 | Submit server 400 INVALID_PAYMENT_STATUS           | Toast `t('refundCreateFailed')`. Console `[RefundsPage.createRefund]`.                                                                                                                                                                               |           |
| 51.11 | Submit server 400 REFUND_EXCEEDS_AVAILABLE         | Toast `t('refundCreateFailed')`.                                                                                                                                                                                                                     |           |
| 51.12 | Submit server 400 INVOICE_VOID_OR_WRITTEN_OFF      | When one of the allocated invoices has been voided/written_off, refund creation blocked.                                                                                                                                                             |           |

---

## 52. Refunds — Approve / Reject / Execute Actions

All admin-performed inline from the list. No separate modals; reason/comment is optional for approve/reject via UI (though schema requires non-empty `admin_notes`/`comment` for rejections — server enforces). UI does not collect comment — sends empty — service on reject will 400 if not provided by direct API.

Observations:

- UI sends no comment body on approve/reject via this page. The service signatures accept `refundApprovalCommentSchema` (comment optional) and `refundRejectionCommentSchema` (comment required min 1). Reject via this UI will thus 400 — flagged §97.

| #     | What to Check                                        | Expected Result                                                                                                                                                                                                                                                                                                                          | Pass/Fail |
| ----- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 52.1  | Click Approve on a `pending_approval` refund         | `POST /api/v1/finance/refunds/{id}/approve` body `{}` (empty — no comment from UI).                                                                                                                                                                                                                                                      |           |
| 52.2  | Self-approval guard                                  | Server 400 `SELF_APPROVAL_BLOCKED` when requester = approver. Use secondary admin to approve.                                                                                                                                                                                                                                            |           |
| 52.3  | Status race guard                                    | Atomic `updateMany` with status predicate. If status changed between render and click, server 400 `INVALID_STATUS`.                                                                                                                                                                                                                      |           |
| 52.4  | Click Reject on a `pending_approval` refund          | `POST /reject` — **fails** because UI sends empty body and Zod requires `comment` min(1). Flagged §97 — reject via UI is effectively broken until UI collects reason.                                                                                                                                                                    |           |
| 52.5  | Direct API POST /reject with `{ comment: 'Reason' }` | Server 200. Status → `rejected`. `failure_reason` = comment.                                                                                                                                                                                                                                                                             |           |
| 52.6  | Click Execute on an `approved` refund                | `POST /execute`.                                                                                                                                                                                                                                                                                                                         |           |
| 52.7  | Execute success path                                 | Status → `executed`. `executed_at = now`. Allocations reversed LIFO — `unallocated` decremented first, then allocations oldest-first-reversed. Each touched allocation triggers `invoicesService.recalculateBalance`. Payment status recomputed: `refunded_full` if sum ≥ amount-0.01, `refunded_partial` if > 0, else back to `posted`. |           |
| 52.8  | Execute on non-approved                              | 400 `INVALID_STATUS`.                                                                                                                                                                                                                                                                                                                    |           |
| 52.9  | Execute concurrency                                  | Two admins executing simultaneously — one wins via atomic updateMany; the other gets 400 with message about concurrent execution.                                                                                                                                                                                                        |           |
| 52.10 | No Stripe-side refund triggered                      | `execute()` only reverses allocations; Stripe refund is via separate `StripeService.processRefund` path (not called here). For full tenant onboarding, this needs to be wired. Flagged §97.                                                                                                                                              |           |
| 52.11 | No toast on approve/reject/execute success           | Current UI comment: "error handled by apiClient". No success feedback. Flagged §97.                                                                                                                                                                                                                                                      |           |
| 52.12 | Refetch on completion                                | List refreshes to show new status.                                                                                                                                                                                                                                                                                                       |           |

---

## 53. Refunds — State Machine & Invariants

```
pending_approval → approved   (via /approve, self-approval blocked)
pending_approval → rejected   (via /reject, comment required)
approved         → executed   (via /execute)
approved         → failed     (if execute throws, DB sets status failed)
executed         → [terminal]
rejected         → [terminal]
failed           → [terminal]
```

| #    | What to Check                                                                               | Expected Result                                                                                                                                                                            | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 53.1 | Create → approve → execute happy path                                                       | All transitions succeed. Payment status updates post-execute.                                                                                                                              |           |
| 53.2 | Create → reject path                                                                        | Terminal state.                                                                                                                                                                            |           |
| 53.3 | Create on voided payment                                                                    | 400 `INVALID_PAYMENT_STATUS`.                                                                                                                                                              |           |
| 53.4 | Create > unrefunded                                                                         | 400 `REFUND_EXCEEDS_AVAILABLE`.                                                                                                                                                            |           |
| 53.5 | Create while one allocation's invoice is void/written_off                                   | 400 `INVOICE_VOID_OR_WRITTEN_OFF`.                                                                                                                                                         |           |
| 53.6 | Refund reference format                                                                     | `REF-{YYYYMM}-{padded}` (or `REF-{receipt_prefix}-{YYYYMM}-{padded}` if branding set). Sequence key: `refund`. Note: `refund` is not in canonical `SEQUENCE_TYPES` constant (flagged §97). |           |
| 53.7 | Invariant: `refund.amount <= payment.amount - sum(non-rejected, non-failed refunds) + 0.01` | Validated on create.                                                                                                                                                                       |           |

---

## 54. Credit Notes — List

**URL:** `/{locale}/finance/credit-notes`
**API:** `GET /api/v1/finance/credit-notes?page=&pageSize=20`

Role gate: `canManage = hasAnyRole('school_principal','accounting')`.

| #    | What to Check                  | Expected Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Pass/Fail |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 54.1 | Navigate                       | List fetches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |           |
| 54.2 | Header                         | Title `t('creditNotes.title')`, description `t('creditNotes.description')`. `canManage` → Create button (`<Plus>` + `t('creditNotes.create')`).                                                                                                                                                                                                                                                                                                                                 |           |
| 54.3 | Columns                        | (1) Credit Note Number `t('creditNotes.number')` font-mono; (2) Household font-medium; (3) Total Amount end CurrencyDisplay font-medium; (4) Remaining Balance end CurrencyDisplay — `font-semibold text-success-700` if > 0 else `text-text-tertiary`; (5) Status StatusBadge — `remaining_balance > 0 ? 'success' + t('creditNotes.statusOpen') : 'neutral' + t('creditNotes.statusFullyUsed')`; (6) Issued By `issued_by_name`; (7) Date formatDate(issued_at); (8) Actions. |           |
| 54.4 | Actions column — Apply button  | `canManage && remaining_balance > 0`: `<Button size="sm" variant="outline">{t('creditNotes.apply')}</Button>` with `stopPropagation + void openApplyModal(row)`.                                                                                                                                                                                                                                                                                                                |           |
| 54.5 | Actions column — Expand button | Toggle `<ChevronDown>` when expanded else `<ChevronRight>`. Toggles `expandedRow` id. Only one row expanded at a time.                                                                                                                                                                                                                                                                                                                                                          |           |
| 54.6 | Row click                      | Same as expand toggle (`setExpandedRow(cn.id ? null : cn.id)` — behaviour depends on design).                                                                                                                                                                                                                                                                                                                                                                                   |           |
| 54.7 | Empty state (no credit notes)  | `<EmptyState icon={Receipt} title={t('creditNotes.emptyTitle')} description={t('creditNotes.emptyDescription')} action={canManage ? {...} : undefined} />`.                                                                                                                                                                                                                                                                                                                     |           |
| 54.8 | Credit note number format      | `{prefix}-{YYYYMM}-{padded}` — e.g., `CN-202604-00001`. Sequence key `credit_note`.                                                                                                                                                                                                                                                                                                                                                                                             |           |
| 54.9 | Pagination `pageSize=20`       | Server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |           |

---

## 55. Credit Notes — Create Modal

| #     | What to Check                       | Expected Result                                                                                                                                              | Pass/Fail |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------------- | --- |
| 55.1  | Open modal                          | On open, `GET /api/v1/households?pageSize=100` fires to populate dropdown. Title `t('creditNotes.createTitle')`.                                             |           |
| 55.2  | Household select                    | Populated from households list, placeholder `t('selectHousehold')`. Required.                                                                                |           |
| 55.3  | Amount input                        | `<Input type="number" min="0.01" step="0.01" placeholder="0.00" dir="ltr">`. Required and positive.                                                          |           |
| 55.4  | Reason textarea                     | `<Textarea placeholder={t('creditNotes.reasonPlaceholder')} rows={3}>`. Required min 1, max 2000.                                                            |           |
| 55.5  | Cancel                              | `<Button variant="outline">{t('cancel')}</Button>`.                                                                                                          |           |
| 55.6  | Submit — disabled                   | `creating                                                                                                                                                    |           | missing_fields`. |     |
| 55.7  | Validation                          | Household set + amount > 0 (not NaN) + reason trim non-empty. Else `toast.error(t('creditNotes.validationError'))`.                                          |           |
| 55.8  | Submit valid                        | `POST /api/v1/finance/credit-notes` body `{ household_id, amount, reason }`. Permission `finance.manage_credit_notes`.                                       |           |
| 55.9  | Success                             | Toast `t('creditNotes.created')`. Modal closes, reset, refetch.                                                                                              |           |
| 55.10 | Failure (household not found etc.)  | Toast `t('creditNotes.createFailed')`. Console `[FinanceCreditNotesPage]`.                                                                                   |           |
| 55.11 | Sequence error (missing tenant row) | Previously caused 500 when `tenant_sequences` row missing. Fixed via backfill migration — verify a credit note can be created on a freshly onboarded tenant. |           |

---

## 56. Credit Notes — Apply Modal

| #     | What to Check                                  | Expected Result                                                                                                                                                                  | Pass/Fail |
| ----- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 56.1  | Open Apply modal for a credit note             | `GET /api/v1/finance/invoices?household_id={id}&status=issued,partially_paid,overdue&pageSize=100` fires. Response populates open-invoice dropdown.                              |           |
| 56.2  | Title                                          | `t('creditNotes.applyTitle')`.                                                                                                                                                   |           |
| 56.3  | Available balance display                      | `t('creditNotes.availableBalance'):` + `<span class="font-semibold text-success-700" dir="ltr">{balance.toLocaleString(2dp)}</span>`.                                            |           |
| 56.4  | Invoice select                                 | Placeholder `t('creditNotes.selectInvoicePlaceholder')`. Item label format: `{invoice_number} — {balance_amount.toLocaleString(2dp)} {currencyCode}`.                            |           |
| 56.5  | Amount input                                   | `<Input type="number" min="0.01" step="0.01" max={availableBalance}>`.                                                                                                           |           |
| 56.6  | Cancel button                                  | Closes modal.                                                                                                                                                                    |           |
| 56.7  | Apply button                                   | `<Button onClick=handleApply disabled={applying}>`. Label `applying ? t('saving') : t('creditNotes.applyAction')`.                                                               |           |
| 56.8  | Validation                                     | invoice_id + amount > 0 (not NaN). Else `toast.error(t('creditNotes.validationError'))`.                                                                                         |           |
| 56.9  | Submit                                         | `POST /api/v1/finance/credit-notes/apply` body `{ credit_note_id, invoice_id, applied_amount }`. Permission `finance.manage_credit_notes`.                                       |           |
| 56.10 | Success                                        | Toast `t('creditNotes.applied')`. Modal closes, refetch.                                                                                                                         |           |
| 56.11 | Apply more than remaining balance              | Server 400 `INSUFFICIENT_CREDIT_BALANCE`. Toast `t('creditNotes.applyFailed')`.                                                                                                  |           |
| 56.12 | Apply to non-payable invoice (draft/void/etc.) | Server 400 `INVALID_INVOICE_STATUS`.                                                                                                                                             |           |
| 56.13 | Apply to already-paid invoice                  | Server 400 `INVOICE_ALREADY_PAID` (when invoice balance is 0).                                                                                                                   |           |
| 56.14 | Applied amount auto-caps                       | `min(dto.applied_amount, invoice.balance_amount)` — if user sends more than balance, server silently caps (and returns `applied_amount` in response equal to the capped amount). |           |
| 56.15 | After apply                                    | Credit note `remaining_balance` decremented. Invoice `balance_amount` decremented. Invoice status → `paid` if balance < 0.005, else `partially_paid`.                            |           |

---

## 57. Credit Notes — Expanded Row (Application History)

| #    | What to Check                          | Expected Result                                                                                                                                                                                                         | Pass/Fail |
| ---- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 57.1 | Expand a credit note with applications | Card `rounded-xl border border-border bg-surface-secondary p-4` below the row. Heading `t('creditNotes.applicationHistory')` uppercase.                                                                                 |           |
| 57.2 | Empty applications                     | `t('creditNotes.noApplications')`.                                                                                                                                                                                      |           |
| 57.3 | Application table columns              | Reference `t('reference')` (invoice_number mono), Total Amount `t('totalAmount')` end (applied_amount.toLocaleString(2dp) dir="ltr"), Applied By `t('creditNotes.appliedBy')`, Date `t('date')` formatDate(applied_at). |           |
| 57.4 | Multiple applications                  | All shown chronologically.                                                                                                                                                                                              |           |

---

## 58. Discounts — List

**URL:** `/{locale}/finance/discounts`

| #    | What to Check            | Expected Result                                                                                                                                                                                                                                                                                                                            | Pass/Fail |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 58.1 | Navigate                 | List fetches. Role gate `canManage = hasAnyRole('school_principal','accounting')`.                                                                                                                                                                                                                                                         |           |
| 58.2 | Header                   | Back link hardcoded `"Back"` (flagged §97) + New Discount button (canManage).                                                                                                                                                                                                                                                              |           |
| 58.3 | Toolbar — search         | `t('discounts.searchPlaceholder')` ps-9. No debounce.                                                                                                                                                                                                                                                                                      |           |
| 58.4 | Toolbar — status select  | `all`/`true`/`false` → tCommon('all')/t('active')/t('inactive').                                                                                                                                                                                                                                                                           |           |
| 58.5 | Columns                  | (1) Name `t('discounts.colName')` font-medium; (2) Type `t('discounts.colType')` — `percent` → `t('discounts.typePercent')` else `t('discounts.typeFixed')`; (3) Value — `{value}%` or `value.toFixed(2)` — font-mono text-sm text-text-primary dir="ltr"; (4) Status `<StatusBadge>` dot + `Active`/`Inactive` (hardcoded — flagged §97). |           |
| 58.6 | Row click                | `router.push('discounts/{id}')`.                                                                                                                                                                                                                                                                                                           |           |
| 58.7 | Empty state              | EmptyState icon=Percent, action gated by canManage.                                                                                                                                                                                                                                                                                        |           |
| 58.8 | Pagination `pageSize=20` | Server.                                                                                                                                                                                                                                                                                                                                    |           |

---

## 59. Discounts — New

**URL:** `/{locale}/finance/discounts/new`

| #    | What to Check             | Expected Result                                                                                                                                          | Pass/Fail |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 59.1 | Navigate                  | PageHeader title `t('discounts.newTitle')` + Back button (`router.back()`). DiscountForm renders.                                                        |           |
| 59.2 | Submit                    | `POST /api/v1/finance/discounts` body `{ name, discount_type, value, auto_apply, auto_condition }`. `active` omitted (server defaults).                  |           |
| 59.3 | Success                   | Redirect to `/{locale}/finance/discounts`.                                                                                                               |           |
| 59.4 | autoCondition computation | `null` unless `auto_apply && auto_condition_type`. If sibling with `min_students` → `{ type: 'sibling', min_students }`. If staff → `{ type: 'staff' }`. |           |

---

## 60. Discounts — Edit

**URL:** `/{locale}/finance/discounts/[id]`

| #    | What to Check                                               | Expected Result                                                                                                                                                                       | Pass/Fail |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------ | --- |
| 60.1 | Navigate                                                    | `GET /api/v1/finance/discounts/{id}` returns `{ data: DiscountDetail }`.                                                                                                              |           |
| 60.2 | Loading                                                     | Skeleton `h-8 w-48 rounded-lg bg-surface-secondary animate-pulse` + `h-64 rounded-xl`.                                                                                                |           |
| 60.3 | Error                                                       | Back button + `<p class="text-sm text-danger-text">{error                                                                                                                             |           | t('discounts.notFound')}</p>`. |     |
| 60.4 | Submit                                                      | `PATCH /api/v1/finance/discounts/{id}` body includes `active`.                                                                                                                        |           |
| 60.5 | Success                                                     | Redirect to list.                                                                                                                                                                     |           |
| 60.6 | Update with `discount_type=percent, value=150` via devtools | `updateDiscountSchema` does NOT enforce the refinement (present only on create). Request passes Zod; service-layer percent cap rejects with 400 `INVALID_PERCENT_VALUE`. Flagged §97. |           |

---

## 61. Discount Form — Field Reference & Auto-Apply

Uses RHF + local schema `discountFormSchema`.

| #     | What to Check                               | Expected Result                                                                                                                                                                                 | Pass/Fail |
| ----- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 61.1  | Section 1 — Details card                    | Heading `t('discounts.sectionDetails')`.                                                                                                                                                        |           |
| 61.2  | Name                                        | `<Input id="name" maxLength={150}>`. Min 1.                                                                                                                                                     |           |
| 61.3  | Discount type Select                        | `fixed` / `percent`. No placeholder (always default).                                                                                                                                           |           |
| 61.4  | Value input                                 | `<Input type="number" step="0.01" min="0.01" max={watchDiscountType==='percent' ? '100' : undefined} dir="ltr">`. When percent, `pe-8` class + `<span class="absolute end-3">%</span>` overlay. |           |
| 61.5  | Active Switch (isEdit only)                 | `<Switch id="active" checked={field.value ?? true}>`. Label `t('discounts.fieldActive')`.                                                                                                       |           |
| 61.6  | Section 2 — Auto-Apply                      | `<h2>{t('discounts.autoApplyTitle')}</h2>` + `<p>{t('discounts.autoApplyDesc')}</p>`. Enable switch `<Switch id="auto_apply">` + label `t('discounts.enableAutoApply')`.                        |           |
| 61.7  | Expanded block when auto_apply=true         | `ms-8 space-y-4 border-s-2 border-primary-200 ps-4` indentation. Condition type Select (sibling/staff).                                                                                         |           |
| 61.8  | Sibling condition                           | Shows `min_students` input (`type=number min=2 dir="ltr" w-full sm:w-24`). Helper text `t('discounts.minStudentsDesc')`.                                                                        |           |
| 61.9  | Staff condition                             | Shows paragraph `t('discounts.staffDesc')`. No extra input.                                                                                                                                     |           |
| 61.10 | Submit — invalid percent value > 100        | Client validation: `"Percentage discount value must be <= 100"` (hardcoded English — flagged §97). Path `['value']`.                                                                            |           |
| 61.11 | Submit — auto_apply=true without condition  | Client validation: `"Select a condition type for automatic discounts"` (hardcoded English — flagged §97). Path `['auto_condition_type']`.                                                       |           |
| 61.12 | Cancel button                               | Calls `onCancel`.                                                                                                                                                                               |           |
| 61.13 | Submit button                               | `isSubmitting ? tc('loading') : (submitLabel ?? tc('save'))`.                                                                                                                                   |           |
| 61.14 | Deactivate discount with active assignments | Via `DELETE /api/v1/finance/discounts/{id}`, server returns 400 `ACTIVE_ASSIGNMENTS_EXIST` with count in message.                                                                               |           |
| 61.15 | Sequence duplicate-name check               | Server enforces unique name within tenant → 409 `DUPLICATE_NAME`.                                                                                                                               |           |

---

## 62. Scholarships — List

**URL:** `/{locale}/finance/scholarships`
**API:** `GET /api/v1/finance/scholarships?page=&pageSize=20[&status]`

| #    | What to Check                                                    | Expected Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Pass/Fail |
| ---- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 62.1 | Navigate                                                         | List fetches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |           |
| 62.2 | Header                                                           | Back link hardcoded `"Back"` (flagged §97). Create button (canManage) `<Plus>` + `t('scholarships.create')`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |           |
| 62.3 | Status tabs (`flex flex-wrap gap-1 border-b border-border pb-2`) | `all` `t('allStatuses')`, `active` `t('scholarships.status_active')`, `expired` `t('status_expired')`, `revoked` `t('status_revoked')`. Active tab `bg-primary-100 text-primary-700`.                                                                                                                                                                                                                                                                                                                                                                                                              |           |
| 62.4 | Columns                                                          | (1) Name font-bold primary; (2) Student name secondary; (3) Type — `t('scholarships.typePercent')` or `t('typeFixed')`; (4) Value end — percent: `{value}%` font-mono font-semibold text-text-primary dir="ltr"; fixed: CurrencyDisplay font-semibold; (5) Status StatusBadge — active/success, expired/neutral, revoked/danger; (6) Award Date formatDate; (7) Renewal Date formatDate or em-dash; (8) Fee Structure — `fee_structure_name ?? t('scholarships.allFees')`; (9) Actions (canManage && status='active'): Revoke button `text-danger-700 hover:bg-danger-50 hover:border-danger-300`. |           |
| 62.5 | Click Revoke                                                     | Opens revoke modal, pre-loads `revokeTarget`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |           |
| 62.6 | Empty state (no filter, 0 rows)                                  | EmptyState icon=Award.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |           |
| 62.7 | Pagination `pageSize=20`                                         | Page resets on status filter change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |           |

---

## 63. Scholarships — Create Modal

| #     | What to Check                   | Expected Result                                                                                                                                                                                  | Pass/Fail |
| ----- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 63.1  | Open modal                      | Dialog `sm:max-w-lg`. Title `t('scholarships.createTitle')`. Parallel fetches: `GET /students?pageSize=500&status=active` + `GET /fee-structures?pageSize=200`.                                  |           |
| 63.2  | Name input                      | Required. Placeholder `t('scholarships.namePlaceholder')`.                                                                                                                                       |           |
| 63.3  | Student select                  | Required. Placeholder `t('scholarships.selectStudent')`. Items: `{first_name} {last_name}`. Loaded with status=active only.                                                                      |           |
| 63.4  | Discount type Select            | `percent` → `typePercent`, `fixed` → `typeFixed`.                                                                                                                                                |           |
| 63.5  | Value input                     | `<Input type="number" min="0" step={percent ? '1' : '0.01'} max={percent ? '100' : undefined} dir="ltr">`.                                                                                       |           |
| 63.6  | Fee structure Select (optional) | First option `value=""` → `t('scholarships.allFees')`. Subsequent items list fee structures.                                                                                                     |           |
| 63.7  | Award date + Renewal date       | Both `<Input type="date">` (2-col grid). Award required, renewal optional.                                                                                                                       |           |
| 63.8  | Submit — validation             | Require name, student_id, value, award_date. Else `toast.error(t('scholarships.validationError'))`.                                                                                              |           |
| 63.9  | Submit valid                    | `POST /api/v1/finance/scholarships` body `{ name, student_id, discount_type, value, fee_structure_id (or null), award_date, renewal_date (or null) }`. Permission `finance.manage_scholarships`. |           |
| 63.10 | Success                         | Toast `t('scholarships.created')`, close, refetch.                                                                                                                                               |           |
| 63.11 | Failure                         | Toast `t('scholarships.createFailed')`.                                                                                                                                                          |           |
| 63.12 | Percent value > 100             | Server 400 `INVALID_PERCENT_VALUE`.                                                                                                                                                              |           |
| 63.13 | Invalid student                 | Server 400 `STUDENT_NOT_FOUND`.                                                                                                                                                                  |           |

---

## 64. Scholarships — Revoke Modal

| #     | What to Check                                              | Expected Result                                                                                                                                                                       | Pass/Fail |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------- | --- |
| 64.1  | Open modal (click Revoke)                                  | Title `t('scholarships.revokeTitle')`.                                                                                                                                                |           |
| 64.2  | Body                                                       | `<p>{t('scholarships.revokeConfirm', { name: revokeTarget.name })}</p>`. Label `t('scholarships.revocationReason')` + Textarea placeholder `t('revocationReasonPlaceholder')` rows=3. |           |
| 64.3  | Cancel                                                     | Outline `t('cancel')`.                                                                                                                                                                |           |
| 64.4  | Revoke button                                              | `variant="destructive"`. Disabled when `revoking                                                                                                                                      |           | !revokeReason`. Label `revoking ? t('saving') : t('scholarships.revokeAction')`. |     |
| 64.5  | Validation                                                 | Missing target or reason → `toast.error(t('scholarships.revocationReasonRequired'))`.                                                                                                 |           |
| 64.6  | Submit                                                     | `POST /api/v1/finance/scholarships/{id}/revoke` body `{ reason }`.                                                                                                                    |           |
| 64.7  | Success                                                    | Toast `t('scholarships.revoked')`, close, refetch. Status → `revoked`, `revocation_reason` stored.                                                                                    |           |
| 64.8  | Failure                                                    | Toast `t('scholarships.revokeFailed')`.                                                                                                                                               |           |
| 64.9  | Revoke non-active scholarship (already expired or revoked) | Server 400 `INVALID_STATUS`.                                                                                                                                                          |           |
| 64.10 | `markExpired` cron                                         | When `renewal_date < today`, background cron transitions `active → expired`. Verify via list.                                                                                         |           |

---

## 65. Payment Plans — List

**URL:** `/{locale}/finance/payment-plans`
**API:** `GET /api/v1/finance/payment-plans?page=&pageSize=20[&status]`

| #    | What to Check          | Expected Result                                                                                                                                                                                                                                                                                                                                                                                                                                            | Pass/Fail |
| ---- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 65.1 | Navigate               | List fetches. Default `statusFilter='active'`.                                                                                                                                                                                                                                                                                                                                                                                                             |           |
| 65.2 | Header                 | Title `t('paymentPlans.title')`, description. Create button (canManage) `<Plus>` + `t('paymentPlans.createPlan')`. No back link on this page.                                                                                                                                                                                                                                                                                                              |           |
| 65.3 | Status tabs            | Order: active, completed, cancelled, all. Labels from translation keys.                                                                                                                                                                                                                                                                                                                                                                                    |           |
| 65.4 | Columns                | (1) household_name (primary text or '-'); (2) original_balance CurrencyDisplay; (3) discount — green CurrencyDisplay if > 0 else '-'; (4) plan_total = original - discount font-semibold; (5) installments_count = length of `proposed_installments_json`; (6) status StatusBadge — active/success, completed/info, cancelled/danger, else neutral; (7) created_at formatDate; (8) Actions: Expand chevron + (canManage && status='active') Cancel button. |           |
| 65.5 | Cancel button          | `<Button size="sm" variant="outline" text-danger-700 hover:bg-danger-50>` with `<XCircle me-1>` + `t('cancel')`. `disabled={cancelling===row.id}`.                                                                                                                                                                                                                                                                                                         |           |
| 65.6 | Click Cancel           | `POST /api/v1/finance/payment-plans/{id}/cancel`. Toast `t('paymentPlans.cancelled')` on success; `t('paymentPlans.cancelFailed')` on error.                                                                                                                                                                                                                                                                                                               |           |
| 65.7 | Cancel non-active plan | Server 400 `INVALID_STATUS`.                                                                                                                                                                                                                                                                                                                                                                                                                               |           |
| 65.8 | Empty state            | EmptyState icon=CalendarClock. Action gated by canManage. Renders regardless of filter (note: different from other pages — flagged §97).                                                                                                                                                                                                                                                                                                                   |           |
| 65.9 | Pagination             | `pageSize=20`.                                                                                                                                                                                                                                                                                                                                                                                                                                             |           |

---

## 66. Payment Plans — Create Modal

`sm:max-w-2xl max-h-[90vh] overflow-y-auto`

| #     | What to Check                                | Expected Result                                                                                                                                                                                                          | Pass/Fail       |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | --------------------------------- | --- | -------------------------- | --- | ------------------------- | --- | ------------------------------------------------------------------------------ | --- |
| 66.1  | Open modal                                   | Reset form, open. Title `t('paymentPlans.createTitle')`.                                                                                                                                                                 |                 |
| 66.2  | Household selector                           | `<HouseholdSelector>`. When value changes, fetch `GET /api/v1/finance/dashboard/household-overview?search=&pageSize=100` to find outstanding balance.                                                                    |                 |
| 66.3  | Balance loading state                        | `<RefreshCw animate-spin>` + `t('paymentPlans.loadingBalance')`.                                                                                                                                                         |                 |
| 66.4  | Balance loaded + non-null                    | Label `t('paymentPlans.currentOutstanding')` + CurrencyDisplay.                                                                                                                                                          |                 |
| 66.5  | Original balance input                       | `<Input type="number" min="0.01" step="0.01" placeholder="0.00" dir="ltr">`.                                                                                                                                             |                 |
| 66.6  | Discount amount input                        | `<Input type="number">` placeholder "0.00" dir="ltr".                                                                                                                                                                    |                 |
| 66.7  | Discount reason input                        | `<Input>` placeholder `t('paymentPlans.discountReasonPlaceholder')`.                                                                                                                                                     |                 |
| 66.8  | Plan total block                             | `t('paymentPlans.planTotal'):` + bold CurrencyDisplay. When `parsedDiscount > 0`: helper line shows `original - discount` breakdown.                                                                                     |                 |
| 66.9  | Number of installments                       | `<Input type="number" min="1" max="60" className="w-full sm:w-24">`.                                                                                                                                                     |                 |
| 66.10 | Auto-generate button                         | `<Button size="sm" variant="outline">` with `<RefreshCw>` + `t('paymentPlans.autoGenerate')`. Disabled when `planTotal <= 0`.                                                                                            |                 |
| 66.11 | Auto-generate algorithm                      | base = `floor((planTotal/count)*100)/100`; remainder added to first installment; monthly cadence starting 1st of next month.                                                                                             |                 |
| 66.12 | Add installment button                       | `<Plus>` + `t('paymentPlans.addInstallment')`. Appends row dated +1 month from last (or empty).                                                                                                                          |                 |
| 66.13 | Installment rows                             | Index mono; `<Input type="date">`; `<Input type="number" dir="ltr">`; Trash button `<Trash2>` text-danger-600.                                                                                                           |                 |
| 66.14 | Installment total row                        | `t('paymentPlans.installmentTotal')` + sum — `text-danger-700` if `totalMismatch` (                                                                                                                                      | sum - planTotal | > 0.01), else `text-success-700`. |     |
| 66.15 | Mismatch warning                             | `<p class="text-xs text-danger-600">{t('paymentPlans.totalMustMatch')} ({planTotal})</p>` when mismatched.                                                                                                               |                 |
| 66.16 | Admin notes                                  | `<Textarea rows={2} placeholder={t('paymentPlans.notesPlaceholder')}>`.                                                                                                                                                  |                 |
| 66.17 | Close modal                                  | Resets entire form via `onOpenChange` handler.                                                                                                                                                                           |                 |
| 66.18 | Cancel button                                | `<Button variant="outline">{t('cancel')}</Button>`.                                                                                                                                                                      |                 |
| 66.19 | Submit button                                | Disabled conditions: `creating                                                                                                                                                                                           |                 | !selectedHouseholdId              |     | parsedOriginalBalance <= 0 |     | installments.length === 0 |     | totalMismatch`. Label `creating ? t('saving') : t('paymentPlans.createPlan')`. |     |
| 66.20 | Submit validation                            | Missing household, balance ≤ 0, 0 installments → `toast.error(t('paymentPlans.validationError'))`. Mismatch → `toast.error(t('paymentPlans.totalMustMatch'))`. Any row missing due_date or amount ≤ 0 → validationError. |                 |
| 66.21 | Submit valid                                 | `POST /api/v1/finance/payment-plans/admin-create` body `{ household_id, original_balance, discount_amount, discount_reason?, installments: [...], admin_notes? }`.                                                       |                 |
| 66.22 | Success                                      | Toast `t('paymentPlans.created')`. Modal closes + reset. Refetch. Status `active`.                                                                                                                                       |                 |
| 66.23 | Failure — HOUSEHOLD_NOT_FOUND                | Toast `t('paymentPlans.createFailed')`.                                                                                                                                                                                  |                 |
| 66.24 | Failure — INVALID_PLAN_TOTAL (planTotal ≤ 0) | Toast `createFailed`.                                                                                                                                                                                                    |                 |
| 66.25 | Failure — INSTALLMENT_SUM_MISMATCH           | Toast.                                                                                                                                                                                                                   |                 |

---

## 67. Payment Plans — Expanded Row & Cancel Action

| #    | What to Check                             | Expected Result                                                                              | Pass/Fail |
| ---- | ----------------------------------------- | -------------------------------------------------------------------------------------------- | --------- |
| 67.1 | Click expand chevron                      | Row toggles expanded. Chevron rotates.                                                       |           |
| 67.2 | Expanded card                             | Heading `t('paymentPlans.installmentSchedule')` uppercase.                                   |           |
| 67.3 | Installment lines                         | Numbered `#1`, `#2`... monospace. Due date formatDate. Amount CurrencyDisplay font-semibold. |           |
| 67.4 | Discount reason (if plan.discount_reason) | Label `t('paymentPlans.discountReason')` + body text.                                        |           |
| 67.5 | Admin notes (if plan.admin_notes)         | Label `t('paymentPlans.adminNotes')` + body.                                                 |           |
| 67.6 | Collapse                                  | Second click on chevron collapses.                                                           |           |

---

## 68. Reports — Aging Tab

**URL:** `/{locale}/finance/reports` (default tab `aging`)
**API:** `GET /api/v1/finance/reports/aging[?date_from][&date_to]` (permission `finance.view_reports`)

| #     | What to Check                          | Expected Result                                                                                                                                                               | Pass/Fail |
| ----- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 68.1  | Navigate                               | Page loads with tab `aging` active. Fetches aging immediately.                                                                                                                |           |
| 68.2  | Header action (when not on custom tab) | `<Button variant="outline">{t('reports.exportCsv')}</Button>` with `<Download>` icon.                                                                                         |           |
| 68.3  | Date range filter                      | Card `rounded-xl border bg-surface p-4` containing label `t('reports.dateRange')` + two `<Input type="date">` + Apply button (`t('reports.apply')`).                          |           |
| 68.4  | Tab navigation `<nav>`                 | Three tabs: `aging` `t('reports.tabAging')`, `fee_performance` `t('reports.tabFeePerformance')`, `custom` `t('reports.tabCustom')`. Active tab `border-primary text-primary`. |           |
| 68.5  | Loading state                          | Shared spinner `h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700` when `isLoading && activeTab !== 'custom'`.                               |           |
| 68.6  | Response envelope handling             | API may return raw map or `{ data: ... }` wrapper. Frontend checks both.                                                                                                      |           |
| 68.7  | Bucket keys                            | API returns `current`, `overdue_1_30`, `overdue_31_60`, `overdue_61_90`, `overdue_90_plus`. Frontend maps to internal keys `current`, `1_30`, `31_60`, `61_90`, `90_plus`.    |           |
| 68.8  | Empty state                            | `<p>{t('reports.noData')}</p>` centered, tertiary.                                                                                                                            |           |
| 68.9  | Bucket row header button               | Click to expand. Shows `bucketLabel[bucket]`, `{bucket.invoice_count} ${t('reports.invoices')}`, currency total in `text-danger-700`.                                         |           |
| 68.10 | Bucket label mapping                   | `current` → `t('reports.bucketCurrent')`, `1_30` → `bucket1to30`, `31_60` → `bucket31to60`, `61_90` → `bucket61to90`, `90_plus` → `bucket90plus`.                             |           |
| 68.11 | Expanded bucket table                  | Columns: `t('household')`, `t('totalAmount')`, `t('reports.oldestDays')`. Rows: household_name, CurrencyDisplay amount, `{oldest_days}d` with `dir="ltr"`.                    |           |
| 68.12 | Re-click same bucket                   | Collapses. Only one bucket expanded at a time.                                                                                                                                |           |
| 68.13 | Apply date filter                      | Refetches with `?date_from=&date_to=`. Redis cache key `finance:aging:{tenantId}:{date_from}:{date_to}`.                                                                      |           |
| 68.14 | Switch tabs                            | `custom` tab returns early from fetch. Aging/fee_performance tabs re-fetch.                                                                                                   |           |
| 68.15 | Error path                             | `console.error('[FinanceReportsPage]', err)`.                                                                                                                                 |           |

---

## 69. Reports — Fee Performance Tab

**API:** `GET /api/v1/finance/reports/fee-structure-performance` (perm `finance.view_reports`)

| #    | What to Check                 | Expected Result                                                                                                                                                                                                                                                                                        | Pass/Fail |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 69.1 | Switch to Fee Performance tab | Fetches the report. Cache key `finance:fee-structure-perf:{tenantId}` (ignores date filters).                                                                                                                                                                                                          |           |
| 69.2 | Container                     | `overflow-x-auto rounded-xl border border-border`.                                                                                                                                                                                                                                                     |           |
| 69.3 | Empty state                   | `t('reports.noData')` centered.                                                                                                                                                                                                                                                                        |           |
| 69.4 | Columns                       | `t('reports.feeStructure')`, `t('reports.householdsAssigned')`, `t('reports.totalBilled')`, `t('reports.totalCollected')`, `t('reports.collectionRate')`, `t('reports.defaultRate')`.                                                                                                                  |           |
| 69.5 | Row rendering                 | name medium primary; total_assigned mono secondary LTR; total_billed + total_collected CurrencyDisplay mono; collection rate `total_collected / total_billed * 100` (0 if billed=0), formatted to 1dp + `%`. Colours: ≥80 text-success-700 bold; ≥50 text-warning-700 bold; else text-danger-700 bold. |           |
| 69.6 | default_rate cell             | `font-mono text-danger-700` with 1dp `%`.                                                                                                                                                                                                                                                              |           |

---

## 70. Reports — Custom Report Builder

Inside `<CustomReportBuilder />`.
**API:** `GET /api/v1/finance/reports/custom[?year_group_ids=<csv>][&fee_type_ids=<csv>][&date_from][&date_to][&status]` (perm `finance.view_reports`)

| #     | What to Check                | Expected Result                                                                                                                                                                                                                                                                                                                          | Pass/Fail |
| ----- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 70.1  | Switch to Custom tab         | Renders builder. On mount: `GET /year-groups` + `GET /finance/fee-types?pageSize=100` parallel.                                                                                                                                                                                                                                          |           |
| 70.2  | Action row                   | Print button (`<Printer>` + `t('reports.customPrint')`); Export CSV button (`<Download>` + `t('reports.exportCsv')`, disabled when `customData.length === 0`).                                                                                                                                                                           |           |
| 70.3  | Filter grid                  | `sm:grid-cols-2 lg:grid-cols-3`. Year group MultiCheckSelect; Fee type MultiCheckSelect; Status select (all/outstanding/paid); Date from/to inputs; Generate button full width.                                                                                                                                                          |           |
| 70.4  | Status options               | `all` → `t('reports.customStatusAll')`; `outstanding` → `customStatusOutstanding`; `paid` → `customStatusPaid`.                                                                                                                                                                                                                          |           |
| 70.5  | Click Generate               | `GET /api/v1/finance/reports/custom?<params>`. Sets `generated=true`.                                                                                                                                                                                                                                                                    |           |
| 70.6  | Loading spinner              | Same as parent page spinner.                                                                                                                                                                                                                                                                                                             |           |
| 70.7  | Empty results                | `<p>{t('reports.customNoResults')}</p>`.                                                                                                                                                                                                                                                                                                 |           |
| 70.8  | Results table hint           | `{count} {t('reports.invoices')}` print:hidden.                                                                                                                                                                                                                                                                                          |           |
| 70.9  | 11 table columns             | student_name, student_number (mono xs LTR or em-dash), class, household_name, billing_parent_name or em-dash, billing_parent_phone mono LTR, billing_parent_email break-all LTR, fee_type, amount_billed CurrencyDisplay, amount_paid CurrencyDisplay, balance CurrencyDisplay — balance colour danger-700 bold if > 0 else success-700. |           |
| 70.10 | `<tfoot>` totals             | Label `t('reports.customTotal')` spanning 8 cols. Sums of billed/paid/balance via CurrencyDisplay; balance total always danger-700.                                                                                                                                                                                                      |           |
| 70.11 | Print button                 | Calls `window.print()`.                                                                                                                                                                                                                                                                                                                  |           |
| 70.12 | Export CSV (client-side)     | Generates CSV with `\uFEFF` BOM, MIME `text/csv;charset=utf-8;`. Headers use translation keys. Download filename `custom-finance-report-{YYYY-MM-DD}.csv`.                                                                                                                                                                               |           |
| 70.13 | CSV columns escape           | Double quotes doubled inside cells, wrapped in `"..."`.                                                                                                                                                                                                                                                                                  |           |
| 70.14 | year_group_ids passed as CSV | `?year_group_ids=uuid1,uuid2`. Schema `preprocess` unpacks to array server-side.                                                                                                                                                                                                                                                         |           |
| 70.15 | status=all                   | Omitted from query (only `outstanding` or `paid` sent).                                                                                                                                                                                                                                                                                  |           |
| 70.16 | No caching on custom report  | Each generate fires a fresh request.                                                                                                                                                                                                                                                                                                     |           |
| 70.17 | Error logs                   | `[CustomReportBuilder] loadOptions` and `[CustomReportBuilder] generate`.                                                                                                                                                                                                                                                                |           |

---

## 71. Reports — CSV Export

| #    | What to Check                                    | Expected Result                                                                                                                                                                         | Pass/Fail |
| ---- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 71.1 | Click Export CSV on Aging or Fee Performance tab | `window.open(\`${NEXT_PUBLIC_API_URL}/api/v1/finance/reports/export?report=aging\` (or `fee_performance`) + `date_from`/`date_to`, '\_blank')`.                                         |           |
| 71.2 | Network                                          | Fires in new tab. If auth cookie accepted, returns file. NOTE: controller-layer streaming for `/reports/export` is not documented in the backend map — flagged in §97 for verification. |           |
| 71.3 | Custom tab CSV                                   | Generated client-side (see §70.12), not via `/export`.                                                                                                                                  |           |
| 71.4 | With date filters                                | Query params include `date_from` + `date_to` when set.                                                                                                                                  |           |

---

## 72. Household Statements — List

**URL:** `/{locale}/finance/statements`
**APIs:** `GET /api/v1/households?page=&pageSize=20[&search]` + `GET /api/v1/finance/dashboard/household-overview?pageSize=100`

| #    | What to Check            | Expected Result                                                                                                                                                                                                                                                                                                                                                | Pass/Fail |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 72.1 | Navigate                 | Parallel fetches.                                                                                                                                                                                                                                                                                                                                              |           |
| 72.2 | Header                   | Title `t('statements')`, description `t('statementsDescription')`. No action buttons.                                                                                                                                                                                                                                                                          |           |
| 72.3 | Toolbar — search only    | `<Input placeholder="${tCommon('search')}..." class="ps-9">`.                                                                                                                                                                                                                                                                                                  |           |
| 72.4 | Columns                  | (1) household_name font-medium; (2) household_number font-mono or `--`; (3) billing_parent_name or `--`; (4) phone LTR or `--`; (5) outstanding — `--` if null/0, else CurrencyDisplay text-sm font-mono font-medium text-danger-text; (6) Actions: `<Button size="sm" variant="outline">{t('viewStatement')}</Button>` → `/{locale}/finance/statements/{id}`. |           |
| 72.5 | Balance lookup           | Built from the parallel overview call. Merged in-memory.                                                                                                                                                                                                                                                                                                       |           |
| 72.6 | Row click                | Navigates to statement detail.                                                                                                                                                                                                                                                                                                                                 |           |
| 72.7 | Empty state (no search)  | `<EmptyState icon={ScrollText} title={t('noHouseholds')} description={t('noHouseholdsDesc')} />`. No action.                                                                                                                                                                                                                                                   |           |
| 72.8 | Pagination `pageSize=20` | Server.                                                                                                                                                                                                                                                                                                                                                        |           |
| 72.9 | Error path               | `console.error('[FinanceStatementsPage]', err)`; clears rows+total.                                                                                                                                                                                                                                                                                            |           |

---

## 73. Household Statements — Detail Ledger

**URL:** `/{locale}/finance/statements/[householdId]`
**API:** `GET /api/v1/finance/household-statements/{householdId}[?date_from][&date_to]`

| #     | What to Check             | Expected Result                                                                                                                                                                                                                                                                                                                                           | Pass/Fail |
| ----- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 73.1  | Navigate                  | Fetch returns `{ data: HouseholdStatementData }`. Initial `fromDate=12mo ago`, `toDate=today` (ISO yyyy-mm-dd).                                                                                                                                                                                                                                           |           |
| 73.2  | Loading skeleton          | Title `h-8 w-64` + subtitle `h-4 w-48` + 8 × `h-10` rows. `bg-surface-secondary animate-pulse`.                                                                                                                                                                                                                                                           |           |
| 73.3  | No data                   | `<EmptyState icon={FileText} title={t('noStatementData')} description={t('noStatementDataDesc')} />`.                                                                                                                                                                                                                                                     |           |
| 73.4  | DateRangeFilter           | Calendar icon + label `t('from')` + date input; label `t('to')` + date input. Raw `<input type="date">` (styled).                                                                                                                                                                                                                                         |           |
| 73.5  | Re-fetch on filter change | Effect refires when `fromDate`/`toDate` change.                                                                                                                                                                                                                                                                                                           |           |
| 73.6  | PageHeader                | Title `t('householdStatementTitle')`, description `data.household.household_name`. Action: Preview PDF button (`<FileText>` + `t('previewPdf')`).                                                                                                                                                                                                         |           |
| 73.7  | Billing parent line       | `"{t('billingParent')}: {name}"` when present.                                                                                                                                                                                                                                                                                                            |           |
| 73.8  | Ledger table              | Container `rounded-2xl border bg-surface overflow-hidden`. Headers: `t('date')`, `t('type')`, `t('reference')`, `t('description')`, `t('debit')` end, `t('credit')` end, `t('runningBalance')` end.                                                                                                                                                       |           |
| 73.9  | Opening balance row       | `colspan=4` `t('openingBalance')`, debit/credit `--`, running balance = formatted opening_balance (default 0).                                                                                                                                                                                                                                            |           |
| 73.10 | Entry rows                | (a) date toLocaleDateString (browser locale); (b) `<EntryTypeBadge>` — variant + hardcoded labels `Invoice`, `Payment`, `Allocation`, `Refund`, `Write-off` (flagged §97); (c) reference mono truncated max-w-[180px]; (d) description truncated max-w-[300px]; (e) debit formatted or `--`; (f) credit formatted or `--`; (g) running balance formatted. |           |
| 73.11 | Entry types & signs       | `invoice_issued` → debit=total; `write_off` (if > 0) → credit=write_off_amount; `payment_received` → credit=amount; `refund` → debit=refund_amount.                                                                                                                                                                                                       |           |
| 73.12 | Sort                      | By date string ISO. Running balance = +debit, -credit rounded per step.                                                                                                                                                                                                                                                                                   |           |
| 73.13 | Closing balance row       | `colspan=4` `t('closingBalance')`, debit/credit `--`, running balance semibold.                                                                                                                                                                                                                                                                           |           |
| 73.14 | Empty entries             | `<p>{t('noTransactions')}</p>` in bottom card.                                                                                                                                                                                                                                                                                                            |           |
| 73.15 | Currency formatting       | `formatAmount(value, code)` Intl.NumberFormat('en-US' locale, style=currency). `null` → `'--'`. Invalid code → `USD`. Fallback `"{code} {value.toFixed(2)}"` on Intl error.                                                                                                                                                                               |           |
| 73.16 | Error path                | `console.error('[FinanceStatementsPage]', err)`. `setData(null)`.                                                                                                                                                                                                                                                                                         |           |

---

## 74. Household Statements — PDF

| #    | What to Check                    | Expected Result                                                                                                                              | Pass/Fail |
| ---- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 74.1 | Click Preview PDF                | PdfPreviewModal opens with `title={t('statementPdf')}`, pdfUrl `/api/v1/finance/household-statements/{householdId}/pdf?date_from=&date_to=`. |           |
| 74.2 | Response                         | Content-Type `application/pdf`, Content-Disposition `inline; filename="statement-{householdId}.pdf"`. Uses tenant branding.                  |           |
| 74.3 | With locale `?locale=ar`         | Renders Arabic template.                                                                                                                     |           |
| 74.4 | Date window inclusive of day-end | `date_to` parsed as `T23:59:59.999Z` to include same-day payments.                                                                           |           |

---

## 75. Debt Breakdown — Bucket Filter & Table

**URL:** `/{locale}/finance/debt-breakdown[?bucket=0_10|10_30|30_50|50_plus]`
**API:** `GET /api/v1/finance/dashboard/debt-breakdown[?bucket]`

| #     | What to Check       | Expected Result                                                                                                                                                                                                                                                                              | Pass/Fail |
| ----- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 75.1  | Navigate            | `GET /debt-breakdown` fires. Reads `?bucket=` from URL on mount.                                                                                                                                                                                                                             |           |
| 75.2  | Header              | Back button (`<ArrowLeft>` icon-only link to `/{locale}/finance`). PageHeader title `t('debtBreakdown.title')`, description. Action: Print button (`<Printer>` + `t('debtBreakdown.print')`) → `window.print()`.                                                                             |           |
| 75.3  | Bucket filter tabs  | `all`/`0_10`/`10_30`/`30_50`/`50_plus`. Active tab `bg-primary text-white shadow-sm`. Inactive `border border-border bg-surface`. Coloured dot next to non-all tabs: success-400 / warning-400 / warning-600 / danger-500.                                                                   |           |
| 75.4  | Summary strip       | Only when `!isLoading && rows.length > 0`. Two stat blocks with vertical divider. Households count (with appended literal `s` — flagged §97). Total outstanding CurrencyDisplay text-lg font-bold text-danger-600.                                                                           |           |
| 75.5  | Loading skeleton    | 6 × `h-12 rounded-lg bg-surface-secondary animate-pulse`.                                                                                                                                                                                                                                    |           |
| 75.6  | Empty state         | `<p>{t('debtBreakdown.noResults')}</p>`.                                                                                                                                                                                                                                                     |           |
| 75.7  | Table columns       | household_name primary; billing_parent_name or em-dash; billing_parent_phone mono LTR or em-dash; total_billed CurrencyDisplay mono text-secondary; outstanding CurrencyDisplay mono font-semibold text-primary; pct_owed pill with threshold-based color; invoice_count mono secondary LTR. |           |
| 75.8  | pct pill thresholds | `≤10` success (text-success-700 bg-success-100); `≤30` warning (text-warning-700 bg-warning-100); `≤50` warning dark (text-warning-800 bg-warning-200); else danger (text-danger-700 bg-danger-100).                                                                                         |           |
| 75.9  | Row click           | `window.location.assign('/{locale}/finance/statements/{household_id}')` (hard nav).                                                                                                                                                                                                          |           |
| 75.10 | URL query handoff   | `?bucket=10_30` pre-filters; `useEffect` on `searchParams` syncs state. Clicking a bucket tab does NOT update URL. Flagged §97.                                                                                                                                                              |           |
| 75.11 | Error path          | `console.error('[DebtBreakdown]', err)`. Rows NOT reset on error (unique vs other pages). Flagged §97.                                                                                                                                                                                       |           |

---

## 76. Audit Trail — List & Filters

**URL:** `/{locale}/finance/audit-trail`
**API:** `GET /api/v1/finance/audit-trail?page=&pageSize=25[&search][&entity_type][&date_from][&date_to]`

| #     | What to Check                 | Expected Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Pass/Fail |
| ----- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 76.1  | Navigate                      | List fetches. `pageSize=25` (differs from 20 elsewhere).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |           |
| 76.2  | Header                        | Title `t('auditTrail.title')`, description. Export CSV button `<Download>` + `t('reports.exportCsv')`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |           |
| 76.3  | Toolbar — search              | `<Input placeholder={t('auditTrail.searchPlaceholder')} class="ps-9">`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |           |
| 76.4  | Toolbar — entity_type select  | `all`/invoice/payment/refund/receipt/fee_structure/fee_type/discount/fee_assignment/credit_note/scholarship. Labels from t() keys.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |           |
| 76.5  | Toolbar — date_from + date_to | `w-full sm:w-[150px]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |           |
| 76.6  | Columns                       | (1) created_at `t('auditTrail.timestamp')` — formatTimestamp mono xs secondary LTR; (2) actor `t('auditTrail.user')` — `{first} {last}` or em-dash; (3) action `t('auditTrail.action')` — colored pill `actionBadgeClass` (create=success-100/700, update=info-100/700, delete=danger-100/700); (4) entity_type `t('auditTrail.entityType')` — underscores → spaces, capitalize; (5) reference `t('auditTrail.reference')` — from `getEntityReference(row)` with metadata_json fields priority (invoice_number/receipt_number/payment_reference/credit_note_number/name/reference/first 8 chars + `…`/em-dash) + optional `<a>` link via `ENTITY_LINK_MAP` (invoice/payment/refund/fee_structure/credit_note/scholarship); (6) description `t('auditTrail.descriptionCol')` — hardcoded English prefixes `Created`, `Updated`, `Deleted`, else `{action} {entity}{ref}` (flagged §97). |           |
| 76.7  | Filter by entity_type         | `GET /audit-trail?entity_type=invoice`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |           |
| 76.8  | Export CSV                    | `window.open(\`${NEXT_PUBLIC_API_URL}/api/v1/audit-logs/export?domain=finance&...\`, '\_blank')`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |           |
| 76.9  | Pagination `pageSize=25`      | Server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |           |
| 76.10 | Error path                    | `console.error('[FinanceAuditTrailPage]', err)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |           |

---

## 77. Late Fee Configurations (Backend-Only API)

No UI. Exercise via Postman/curl.

| #     | What to Check                                                                  | Expected Result                                                                                                                                      | Pass/Fail |
| ----- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 77.1  | GET `/api/v1/finance/late-fee-configs`                                         | Paginated list. Perm `finance.view`.                                                                                                                 |           |
| 77.2  | POST with valid body                                                           | `{ name, fee_type: 'fixed'\|'percent', value, grace_period_days, max_applications, frequency_days? }`. Perm `finance.manage_late_fees`. 201 Created. |           |
| 77.3  | PUT `/api/v1/finance/late-fee-configs/:id` (note PUT, not PATCH — flagged §97) | 200 on success.                                                                                                                                      |           |
| 77.4  | Apply late fee                                                                 | `POST /api/v1/finance/invoices/:id/apply-late-fee[?config_id=<id>]`. Perm `finance.manage_late_fees`.                                                |           |
| 77.5  | Apply — invoice not payable                                                    | 400 `INVALID_INVOICE_STATUS`.                                                                                                                        |           |
| 77.6  | Apply — within grace period                                                    | 400 `WITHIN_GRACE_PERIOD`.                                                                                                                           |           |
| 77.7  | Apply — max_applications reached                                               | 400 `MAX_LATE_FEE_APPLICATIONS_REACHED`.                                                                                                             |           |
| 77.8  | Apply — too soon (frequency_days not elapsed)                                  | 400 `TOO_SOON_FOR_NEXT_APPLICATION`.                                                                                                                 |           |
| 77.9  | Apply — fixed fee_type                                                         | Line `"Late fee: {config.name}", quantity=1, unit_amount=value, line_total=value`. Invoice total + balance incremented.                              |           |
| 77.10 | Apply — percent fee_type                                                       | `lateFeeAmount = roundMoney(invoiceTotal * value/100)`.                                                                                              |           |
| 77.11 | Verify idempotency                                                             | Applying twice same day with `max_applications=1` → second call 400 `MAX_LATE_FEE_APPLICATIONS_REACHED`.                                             |           |
| 77.12 | Missing config                                                                 | 404 `LATE_FEE_CONFIG_NOT_FOUND`.                                                                                                                     |           |

---

## 78. Recurring Invoice Configurations (Backend-Only API)

| #    | What to Check                                                                        | Expected Result                                                       | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | --------- |
| 78.1 | GET `/api/v1/finance/recurring-configs`                                              | List. Perm `finance.view`.                                            |           |
| 78.2 | POST body `{ fee_structure_id, frequency: 'monthly'\|'term', next_generation_date }` | 201. Perm `finance.manage`.                                           |           |
| 78.3 | Frequency `one_off` or `custom`                                                      | 400 (schema only accepts `monthly` or `term`).                        |           |
| 78.4 | PUT `/recurring-configs/:id` (PUT not PATCH — flagged §97)                           | 200.                                                                  |           |
| 78.5 | POST `/recurring-configs/generate`                                                   | 200. Returns `{ generated: number }`.                                 |           |
| 78.6 | Generate — autoIssueRecurringInvoices=false                                          | New invoices status `draft`, `issue_date=null`.                       |           |
| 78.7 | Generate — autoIssueRecurringInvoices=true                                           | New invoices status `issued`, `issue_date=now`.                       |           |
| 78.8 | Generate — computeNextDate                                                           | monthly → +1 month; term/other → +90 days. `last_generated_at = now`. |           |

---

## 79. Payment Reminder Endpoints (Backend-Only API)

| #    | What to Check                                     | Expected Result                                                                                                 | Pass/Fail |
| ---- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| 79.1 | POST `/api/v1/finance/reminders/due-soon`         | Returns `{ sent: n }`. Perm `finance.manage`.                                                                   |           |
| 79.2 | Short-circuit when `paymentReminderEnabled=false` | Returns `{ sent: 0 }` without writing reminder rows.                                                            |           |
| 79.3 | Dedupe                                            | Invoice already has `due_soon` reminder → not included.                                                         |           |
| 79.4 | POST `/reminders/overdue`                         | Qualifying: status IN (overdue,issued,partially_paid) AND past due AND no prior overdue reminder.               |           |
| 79.5 | POST `/reminders/final-notice`                    | Qualifying: due_date < now - finalNoticeDays AND status IN (overdue, partially_paid) AND no prior final_notice. |           |
| 79.6 | Channel=`both`                                    | Creates both email + whatsapp rows for each qualifying invoice.                                                 |           |
| 79.7 | Implementation note                               | Currently only writes dedup rows (no notification service call wired). Flagged §97.                             |           |

---

## 80. Bulk Operations (Backend-Only API)

All endpoints perm `finance.bulk_operations`.

| #    | What to Check                                                     | Expected Result                                                                                                                                                 | Pass/Fail |
| ---- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 80.1 | POST `/api/v1/finance/bulk/issue` body `{ invoice_ids: [...] }`   | Returns `{ total, succeeded, failed, errors: [{ invoice_id, error }] }`.                                                                                        |           |
| 80.2 | Bulk issue — empty array                                          | 400 `NO_INVOICE_IDS`.                                                                                                                                           |           |
| 80.3 | Bulk issue — more than 200 ids                                    | 400 (schema `max(200)`).                                                                                                                                        |           |
| 80.4 | Bulk issue — approval required                                    | Each invoice individually checked. Those needing approval transition to `pending_approval`; others to `issued`. `hasDirectAuthority=false` — never auto-bypass. |           |
| 80.5 | POST `/bulk/void`                                                 | Same shape. Per-invoice errors captured.                                                                                                                        |           |
| 80.6 | Bulk void — invoice with payments                                 | Individual call fails with `PAYMENTS_EXIST`. Added to `errors[]`. Overall call still 200.                                                                       |           |
| 80.7 | POST `/bulk/remind` body `{ invoice_ids }`                        | Hard-codes `reminder_type='overdue'`, `channel='email'`. Idempotent per day per invoice.                                                                        |           |
| 80.8 | POST `/bulk/export` body `{ invoice_ids, format?: 'csv'\|'pdf' }` | Returns JSON (not a CSV stream). Actual file rendering is service-layer. Flagged §97 — inconsistent with other export endpoints.                                |           |

---

## 81. Stripe Webhook — Signature & Idempotency

**Endpoint:** `POST /api/v1/stripe/webhook` — no AuthGuard/PermissionGuard, signature-auth only.

| #     | What to Check                                        | Expected Result                                                                                                                                                                                                | Pass/Fail |
| ----- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 81.1  | POST without `stripe-signature` header               | 400 or 500 from signature verification.                                                                                                                                                                        |           |
| 81.2  | POST without metadata.tenant_id                      | 400 `MISSING_TENANT_ID`. Stripe will retry.                                                                                                                                                                    |           |
| 81.3  | POST with invalid signature                          | `INVALID_SIGNATURE` error. Stripe retries.                                                                                                                                                                     |           |
| 81.4  | Webhook secret resolution order                      | Env `STRIPE_WEBHOOK_SECRET` first; else per-tenant `tenant_stripe_configs.stripe_webhook_secret_encrypted`. Missing both → `WEBHOOK_SECRET_MISSING`.                                                           |           |
| 81.5  | Event type `checkout.session.completed` (regular)    | Metadata needs `invoice_id` + `household_id`. Creates payment `status=posted`, `external_provider=stripe`, `external_event_id=payment_intent.id`. Allocates to invoice. Recalculates balance. Creates receipt. |           |
| 81.6  | Event type `checkout.session.completed` (admissions) | metadata.purpose='admissions'. Different code path (handleAdmissionsCheckoutCompleted).                                                                                                                        |           |
| 81.7  | Duplicate event delivery (regular)                   | `payment.findFirst({ external_event_id: payment_intent_id })` — skip. 200 OK.                                                                                                                                  |           |
| 81.8  | Duplicate event delivery (admissions)                | `admissions_payment_events.stripe_event_id = event.id` — skip.                                                                                                                                                 |           |
| 81.9  | Amount mismatch (admissions)                         | 400 `AMOUNT_MISMATCH_METADATA` if metadata cents ≠ application.payment_amount_cents; `AMOUNT_MISMATCH_ACTUAL` if session.amount_total ≠ expected.                                                              |           |
| 81.10 | Tenant mismatch                                      | `TENANT_MISMATCH` when metadata.tenant_id ≠ resolved tenant.                                                                                                                                                   |           |
| 81.11 | Event type `checkout.session.expired` (admissions)   | Logged only; admissions cron handles revert.                                                                                                                                                                   |           |
| 81.12 | Event type `payment_intent.payment_failed`           | Logged warn only.                                                                                                                                                                                              |           |
| 81.13 | Unknown event type                                   | Logged, no-op. 200 OK.                                                                                                                                                                                         |           |
| 81.14 | Rate limit skip                                      | `@SkipThrottle()` on the controller. Multiple webhooks per second accepted.                                                                                                                                    |           |
| 81.15 | Raw body handling                                    | `req.rawBody` used (requires `rawBody: true` in Nest factory). If missing, falls back to `Buffer.from(JSON.stringify(req.body))`.                                                                              |           |

---

## 82. Currency Update Endpoint

**Endpoints:** `GET /api/v1/finance/dashboard/currency`, `PATCH /api/v1/finance/dashboard/currency` body `{ currency_code }`.

| #    | What to Check                                    | Expected Result                                                                                                                                                    | Pass/Fail |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 82.1 | GET as admin                                     | 200. Response `{ data: { currency_code: 'EUR' } }`.                                                                                                                |           |
| 82.2 | PATCH body `{ currency_code: 'USD' }`            | Perm `finance.manage`. 200. Tenant's currency_code updated.                                                                                                        |           |
| 82.3 | PATCH body `{}`                                  | 400 validation (min(1)).                                                                                                                                           |           |
| 82.4 | PATCH body `{ currency_code: 'X' }` (length < 1) | Schema allows min 1 max 10 — `'X'` passes schema but Intl may reject. Service accepts any string.                                                                  |           |
| 82.5 | After PATCH                                      | Existing invoices/payments keep old currency_code (per-record snapshot). New records use the new code. Frontend `useTenantCurrency` reflects update on next fetch. |           |

---

## 83. End-to-End Flow — Fee Setup → Invoice → Payment → Allocation

| #     | Step                                                                                                                                          | Expected Result                                                                                                                                      | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 83.1  | Navigate to `/finance/fee-types`. Create `"Tuition Fees"` fee type.                                                                           | 201; row appears in list. Audit entry created.                                                                                                       |           |
| 83.2  | Navigate to `/finance/fee-structures/new`. Create `"Tuition — YG-A"` with amount 1000, term, linked to fee type + YG-A.                       | Redirect to list; row appears. Audit entry.                                                                                                          |           |
| 83.3  | Navigate to `/finance/discounts/new`. Create a `fixed` discount `"Early Bird"` value 50.                                                      | Redirect; appears.                                                                                                                                   |           |
| 83.4  | Navigate to `/finance/fee-assignments/new`. Pick a test household + the new fee structure + Early Bird discount + today's date. Submit.       | Redirect to list; new assignment shown.                                                                                                              |           |
| 83.5  | Navigate to `/finance/fee-generation`. Select YG-A + Tuition Fees fee type. Billing period Jan-Jun 2026. Due date Jan 15 2026. Click Preview. | Step 2 loads. Preview shows household's line with base 1000, discount 50, line_total 950.                                                            |           |
| 83.6  | Click Confirm.                                                                                                                                | Step 3 success. `invoices_created=1, total_amount=950`. Invoice in draft status.                                                                     |           |
| 83.7  | Click View Invoices. Open the new invoice.                                                                                                    | Detail page shows Lines tab with 1 line. Status `draft`.                                                                                             |           |
| 83.8  | Click Issue. (Assume `requireApprovalForInvoiceIssue=false`.)                                                                                 | Toast success. Invoice status → `issued`. `issue_date=now`.                                                                                          |           |
| 83.9  | Navigate to `/finance/payments/new`. Select same household. Method cash. Amount 500. Reason "Partial tuition". Submit.                        | Redirect to payment detail. `payment_reference=PAYREF-000001`, status `posted`, unallocated 500.                                                     |           |
| 83.10 | In Allocation Panel, click Suggest Allocations.                                                                                               | Returns the invoice as candidate with suggested_amount=500. Row pre-populated.                                                                       |           |
| 83.11 | Click Confirm Allocations.                                                                                                                    | Toast `'Allocations confirmed'`. Allocation created. Invoice balance updated from 950 to 450. Invoice status `partially_paid`. Receipt auto-created. |           |
| 83.12 | Return to invoice detail. Payments tab shows the allocation of 500.                                                                           | Verified.                                                                                                                                            |           |
| 83.13 | Download receipt PDF.                                                                                                                         | Modal loads, PDF renders, showing allocation against the invoice.                                                                                    |           |
| 83.14 | Record another payment of 450. Allocate to same invoice.                                                                                      | Invoice status → `paid`. Balance 0.                                                                                                                  |           |
| 83.15 | Invoice state transitions into terminal `paid`. Attempt to Void/Cancel/Write-Off via direct API.                                              | All return 400 INVALID_STATUS_TRANSITION.                                                                                                            |           |

---

## 84. End-to-End Flow — Stripe Checkout → Auto-Allocation → Receipt

Requires Stripe test keys + parent account.

| #    | Step                                                              | Expected Result                                                                                                                                                                                            | Pass/Fail |
| ---- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 84.1 | Create an invoice and issue it (admin). Balance 100.              | Invoice `issued` with balance > 0.                                                                                                                                                                         |           |
| 84.2 | Log in as parent. Navigate to parent portal → invoice. Click Pay. | `POST /api/v1/parent/invoices/{id}/pay` returns `{ session_id, checkout_url }`.                                                                                                                            |           |
| 84.3 | Stripe checkout completes. Webhook fires.                         | `POST /api/v1/stripe/webhook` event `checkout.session.completed`.                                                                                                                                          |           |
| 84.4 | Server response                                                   | Payment created `status=posted, payment_method=stripe, external_provider=stripe, external_event_id=pi_...`. Allocation to the invoice. Invoice `recalculateBalance`. Receipt auto-created (`userId=null`). |           |
| 84.5 | Replay the same webhook (Stripe dashboard: resend)                | `payment.findFirst({ external_event_id })` short-circuits. No duplicate payment. Log only.                                                                                                                 |           |
| 84.6 | Admin views the payment                                           | Payment reference format `PAYREF-000002`. Method `stripe`. `accepted_by` column shows `Stripe`.                                                                                                            |           |
| 84.7 | Admin views the invoice                                           | Status → `paid`. Payments tab shows the allocation.                                                                                                                                                        |           |
| 84.8 | Stripe config missing (tenant had no `tenantStripeConfig`)        | Parent's Pay button call returns 400/500 `STRIPE_NOT_CONFIGURED`.                                                                                                                                          |           |
| 84.9 | Stripe config has wrong webhook secret                            | Webhook verification fails. Stripe retries.                                                                                                                                                                |           |

---

## 85. End-to-End Flow — Partial Payment → Credit Note → Invoice Closure

| #    | Step                                                            | Expected Result                                                                                                         | Pass/Fail |
| ---- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 85.1 | Issue an invoice of 1000. Allocate payment of 600.              | Invoice `partially_paid`, balance 400.                                                                                  |           |
| 85.2 | Admin creates a credit note for 400.                            | 201. CN-202604-00001. Remaining balance 400.                                                                            |           |
| 85.3 | Click Apply on the credit note. Select the invoice. Amount 400. | 200. Invoice balance 0, status `paid`. Credit note remaining 0, status `fully_used`. Application history shows the row. |           |
| 85.4 | Attempt to apply more than remaining                            | 400 INSUFFICIENT_CREDIT_BALANCE.                                                                                        |           |
| 85.5 | Credit note auto-caps applied amount                            | If user enters 500 but invoice balance is 400, server caps at 400. Response `applied_amount=400`.                       |           |
| 85.6 | Apply to written-off invoice                                    | 400 INVALID_INVOICE_STATUS.                                                                                             |           |

---

## 86. End-to-End Flow — Refund Request → Approve → Execute → Reversal

| #     | Step                                                               | Expected Result                                                                                                                                                                                             | Pass/Fail |
| ----- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 86.1  | Start with a paid invoice (total 1000, fully paid by one payment). | Invoice `paid`. Payment `posted` with allocation.                                                                                                                                                           |           |
| 86.2  | Admin 1 creates a refund request for 300.                          | 201. Refund `pending_approval`, `refund_reference=REF-...-000001`.                                                                                                                                          |           |
| 86.3  | Admin 1 attempts Approve on own refund                             | 400 SELF_APPROVAL_BLOCKED. Flagged in §52.                                                                                                                                                                  |           |
| 86.4  | Admin 2 clicks Approve                                             | 200. Status → `approved`.                                                                                                                                                                                   |           |
| 86.5  | Admin clicks Reject (UI sends empty comment)                       | 400 (schema requires `comment min 1`). **Flagged bug** §97.                                                                                                                                                 |           |
| 86.6  | Via API, Reject with `{ comment: 'Customer changed mind' }`        | 200. Status → `rejected`, `failure_reason` stored.                                                                                                                                                          |           |
| 86.7  | Execute an approved refund                                         | 200. Status → `executed`. Allocations reversed LIFO. Invoice balance: 0 + 300 = 300 (unpaid), status transitions `paid → partially_paid`. Payment recomputed: refunded sum 300 → status `refunded_partial`. |           |
| 86.8  | Execute a second refund of 700 on the same payment                 | After execute: total refunded 1000 → status `refunded_full`. Invoice balance 1000, status `issued` (derived).                                                                                               |           |
| 86.9  | Attempt to execute a non-approved refund                           | 400 INVALID_STATUS.                                                                                                                                                                                         |           |
| 86.10 | Concurrency: two admins execute simultaneously                     | One wins (atomic updateMany). The other gets 400 with concurrent-execution message.                                                                                                                         |           |
| 86.11 | Stripe-side refund not triggered                                   | `execute()` does NOT call `StripeService.processRefund`. Flagged §97 — manual wiring needed for Stripe refunds.                                                                                             |           |

---

## 87. End-to-End Flow — Overdue Invoice → Late Fee → Reminder → Write-Off

| #     | Step                                                                                                                                                | Expected Result                                                                                         | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| 87.1  | Create an invoice with due_date in the past (via API: backdated `issue_date` + `due_date`).                                                         | Draft then issue.                                                                                       |           |
| 87.2  | Run overdue cron (or wait)                                                                                                                          | `finance:overdue-detection` transitions status to `overdue`.                                            |           |
| 87.3  | POST `/reminders/due-soon`                                                                                                                          | If invoice not yet overdue, reminder created. Otherwise 0.                                              |           |
| 87.4  | POST `/reminders/overdue`                                                                                                                           | Qualifying invoice reminded once; reminder row `type=overdue`. Subsequent calls short-circuit.          |           |
| 87.5  | POST `/reminders/final-notice`                                                                                                                      | Only when due_date < now - finalNoticeDays (14 by default).                                             |           |
| 87.6  | Via API, create late fee config `{ name: 'Late Fee', fee_type: 'fixed', value: 25, grace_period_days: 3, max_applications: 2, frequency_days: 7 }`. | 201.                                                                                                    |           |
| 87.7  | Apply late fee within grace period                                                                                                                  | 400 WITHIN_GRACE_PERIOD.                                                                                |           |
| 87.8  | Apply late fee after grace period                                                                                                                   | 200. New line `"Late fee: Late Fee"` added. Invoice total + balance +25.                                |           |
| 87.9  | Apply again within 7 days                                                                                                                           | 400 TOO_SOON_FOR_NEXT_APPLICATION.                                                                      |           |
| 87.10 | Apply third time at max_applications                                                                                                                | 400 MAX_LATE_FEE_APPLICATIONS_REACHED.                                                                  |           |
| 87.11 | Navigate to invoice. Click Write Off. Reason "Uncollectible".                                                                                       | Status → `written_off`. write_off_amount = current balance. balance=0. Dashboard outstanding decreases. |           |

---

## 88. End-to-End Flow — Payment Plan Request → Admin Counter → Parent Accept

| #    | Step                                                                                                 | Expected Result                                                                                                   | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 88.1 | Parent logs in, navigates to an overdue invoice. Requests a payment plan with proposed installments. | `POST /parent/invoices/{id}/request-payment-plan` creates `paymentPlanRequest` with status `pending`.             |           |
| 88.2 | Admin navigates to `/finance/payment-plans?status=pending`                                           | Sees the request.                                                                                                 |           |
| 88.3 | Admin counter-offers via API `POST /payment-plans/{id}/counter-offer` with different installments    | Status → `counter_offered`. `proposed_installments_json` replaced with admin's.                                   |           |
| 88.4 | Parent clicks Accept counter-offer (parent portal)                                                   | `POST /parent/payment-plans/{id}/accept`. Ownership verified. Status → `approved`. Invoice installments replaced. |           |
| 88.5 | Invoice installments tab                                                                             | Shows the new installment schedule.                                                                               |           |
| 88.6 | Admin rejects another request via API with empty notes                                               | 400 (schema requires admin_notes).                                                                                |           |
| 88.7 | Admin rejects with valid notes                                                                       | Status → `rejected`.                                                                                              |           |
| 88.8 | Pending duplicate: parent submits a second request while one pending                                 | 400 PENDING_REQUEST_EXISTS.                                                                                       |           |

---

## 89. End-to-End Flow — Approval-Required Invoice Issue

| #    | Step                                                              | Expected Result                                                                                                                                | Pass/Fail |
| ---- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 89.1 | Enable `requireApprovalForInvoiceIssue=true` in finance settings. | Setting persisted.                                                                                                                             |           |
| 89.2 | User without direct-authority role creates + issues an invoice.   | Status → `pending_approval`, `approval_request_id` populated. Pending Approval banner visible.                                                 |           |
| 89.3 | Approver approves via approval module.                            | BullMQ `finance:on-approval` job fires. Invoice status → `issued`, `issue_date=now`. Banner disappears.                                        |           |
| 89.4 | Approver rejects.                                                 | Approval rejected. Invoice stays `pending_approval` OR transitions back to `draft` depending on approvals module behaviour. Verify per module. |           |
| 89.5 | Cancel pending_approval invoice                                   | Service calls `approvalRequestsService.cancel` then updates status to `cancelled`. Audit trail shows both cancellation events.                 |           |
| 89.6 | User WITH direct authority issues an invoice                      | Status → `issued` directly (no approval step).                                                                                                 |           |

---

## 90. End-to-End Flow — Scholarship Application → Revocation

| #    | Step                                                                                                    | Expected Result                                                                                                                       | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 90.1 | Create a scholarship on a student for `percent` 50 on fee structure "Tuition — YG-A". Award date today. | 201. Status `active`.                                                                                                                 |           |
| 90.2 | Generate fees for that student's household                                                              | Preview shows base 1000, discount 500 (scholarship overlaps discount logic — verify service caps at 100% value and picks the larger). |           |
| 90.3 | Revoke the scholarship                                                                                  | Open Revoke modal. Reason required. Submit. Status → `revoked`.                                                                       |           |
| 90.4 | Regenerate fees                                                                                         | No scholarship discount applied.                                                                                                      |           |
| 90.5 | Verify scholarship cron                                                                                 | When `renewal_date < today`, `markExpired` cron moves status `active → expired`.                                                      |           |
| 90.6 | Revoke an already-revoked scholarship                                                                   | 400 INVALID_STATUS.                                                                                                                   |           |

---

## 91. Permission & Role Guard Tests

Admin has all `finance.*` permissions by default. This section verifies the gates by using accounts with deliberately reduced permissions (teacher/parent/custom role).

| #     | What to Check                                                                                         | Expected Result                                               | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------- |
| 91.1  | Teacher GET `/api/v1/finance/dashboard`                                                               | 403 `PermissionDenied` (teacher lacks `finance.view`).        |           |
| 91.2  | Teacher GET `/api/v1/finance/invoices`                                                                | 403.                                                          |           |
| 91.3  | Teacher GET `/api/v1/finance/payments`                                                                | 403.                                                          |           |
| 91.4  | Teacher POST `/api/v1/finance/fee-types`                                                              | 403 `finance.manage`.                                         |           |
| 91.5  | Teacher GET `/api/v1/finance/reports/aging`                                                           | 403 `finance.view_reports`.                                   |           |
| 91.6  | Role with `finance.view` only — POST fee-type                                                         | 403 `finance.manage`.                                         |           |
| 91.7  | Role with `finance.view` + `finance.manage` but NOT `finance.manage_credit_notes` — POST credit-notes | 403.                                                          |           |
| 91.8  | Role with `finance.view` + `finance.manage` but NOT `finance.bulk_operations` — POST /bulk/issue      | 403.                                                          |           |
| 91.9  | Role with only `finance.manage_scholarships` — POST scholarship                                       | 200. But POST fee-type → 403.                                 |           |
| 91.10 | Parent GET `/api/v1/finance/*` (admin namespace)                                                      | 403.                                                          |           |
| 91.11 | Unauthenticated GET `/api/v1/finance/dashboard`                                                       | 401.                                                          |           |
| 91.12 | Unauthenticated POST `/api/v1/stripe/webhook` without signature                                       | 400 (no auth required but signature verification fails).      |           |
| 91.13 | Admin access — verify every `finance.*` endpoint returns 200 for admin                                | All routes in §96 return 200 when called with valid payloads. |           |
| 91.14 | School owner — verify broad finance access                                                            | Same as admin.                                                |           |
| 91.15 | Front office — typically has finance.view only                                                        | Cannot create/modify finance entities.                        |           |

---

## 92. Tenant Isolation (RLS) Tests

Create data as Tenant A (e.g., `nhqs`). Authenticate as Tenant B (`other-tenant`). Attempt to read/modify.

| #     | What to Check                                                            | Expected Result                                                                                                                                                                           | Pass/Fail |
| ----- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 92.1  | GET `/finance/invoices` as Tenant B                                      | Only Tenant B's invoices returned. Tenant A's never leak.                                                                                                                                 |           |
| 92.2  | GET `/finance/invoices/{tenant_A_invoice_id}` as Tenant B                | 404 INVOICE_NOT_FOUND (RLS hides the row).                                                                                                                                                |           |
| 92.3  | PATCH Tenant A's invoice as Tenant B                                     | 404.                                                                                                                                                                                      |           |
| 92.4  | POST /finance/invoices as Tenant B with valid body                       | 201 scoped to Tenant B. Verify via direct SQL that `tenant_id` matches Tenant B.                                                                                                          |           |
| 92.5  | GET `/finance/payments` as Tenant B                                      | No Tenant A payments.                                                                                                                                                                     |           |
| 92.6  | GET `/finance/refunds` as Tenant B                                       | No Tenant A refunds.                                                                                                                                                                      |           |
| 92.7  | GET `/finance/credit-notes` as Tenant B                                  | No Tenant A.                                                                                                                                                                              |           |
| 92.8  | GET `/finance/fee-types` as Tenant B                                     | No Tenant A fee types. System fee types are per-tenant (each tenant has its own "Miscellaneous").                                                                                         |           |
| 92.9  | GET `/finance/scholarships` as Tenant B                                  | Scoped correctly.                                                                                                                                                                         |           |
| 92.10 | GET `/finance/audit-trail` as Tenant B                                   | No Tenant A audit entries.                                                                                                                                                                |           |
| 92.11 | Stripe webhook with Tenant A's metadata delivered to Tenant B's endpoint | Actually the endpoint is per-environment. Tenant resolution happens from metadata.tenant_id. If the metadata claims Tenant B but the session was created for Tenant A, `TENANT_MISMATCH`. |           |
| 92.12 | Sequence counters per tenant                                             | Tenant A `invoice` sequence at 100; Tenant B at 1. First invoice created under Tenant B still yields `INV-202604-000001`.                                                                 |           |

---

## 93. Arabic / RTL Verification

| #     | What to Check                                        | Expected Result                                                                                                                                                  | Pass/Fail          |
| ----- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------- | --- |
| 93.1  | Navigate to `/ar/finance`                            | `<html dir="rtl">`. Page content mirrors.                                                                                                                        |                    |
| 93.2  | Morph bar + sub-strip                                | Horizontal scroll direction reversed. Start/end logical spacing respected.                                                                                       |                    |
| 93.3  | Currency amounts                                     | All wrapped in `<span dir="ltr">`. Western numerals (0-9). No `undefined 0.00`.                                                                                  |                    |
| 93.4  | Gregorian dates                                      | Dates shown in Gregorian calendar, not Hijri. `formatDate` uses browser locale but the code paths coerce to `en-GB` in several places (e.g., `formatDateShort`). |                    |
| 93.5  | Invoice/payment/refund references                    | Font-mono, `dir="ltr"`.                                                                                                                                          |                    |
| 93.6  | Phone, email                                         | `dir="ltr"`. Break-all on long emails.                                                                                                                           |                    |
| 93.7  | ChevronRight icons                                   | `rtl:rotate-180` — verify rotation on wizard step indicator, preview button.                                                                                     |                    |
| 93.8  | ArrowLeft back icons                                 | `rtl:rotate-180` on all back buttons (fee types, fee structures, fee assignments, scholarships, discounts, debt-breakdown).                                      |                    |
| 93.9  | Logical CSS                                          | Verify every element uses `start-`/`end-`/`ms-`/`me-`/`ps-`/`pe-`. No `left-`/`right-`/`ml-`/`pr-` in rendered DOM.                                              |                    |
| 93.10 | Input direction for numbers/dates                    | `dir="ltr"` applied to `<Input type="number">`, `<Input type="date">`, `<Input type="datetime-local">`.                                                          |                    |
| 93.11 | Text direction for descriptions/names                | `dir="rtl"` inherited from `<html>`. Descriptive text flows RTL.                                                                                                 |                    |
| 93.12 | Status badge colours                                 | Identical in LTR and RTL.                                                                                                                                        |                    |
| 93.13 | Aging buckets hardcoded English labels               | Visible as English in Arabic mode. Flagged §97 — should be translated.                                                                                           |                    |
| 93.14 | Invoice status, payment status, refund status labels | In `ar.json` use the translation keys; hardcoded English fallback only triggers if key missing.                                                                  |                    |
| 93.15 | Translation file parity                              | Run `find messages/ -name '\*.json'                                                                                                                              | xargs jq '.finance | keys'`and diff. No key exists only in`en.json`. |     |

---

## 94. Mobile Responsiveness (375px Viewport)

Use DevTools device emulation at iPhone SE (375×667).

| #     | What to Check                                                  | Expected Result                                                                                                                                | Pass/Fail |
| ----- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 94.1  | Finance dashboard at 375px                                     | Shell's sub-strip horizontally scrollable. KPI tiles stack (`grid-cols-1`). No horizontal overflow.                                            |           |
| 94.2  | Quick-actions grid                                             | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`. At 375px: single column.                                                                          |           |
| 94.3  | Debt breakdown segmented bar                                   | Renders without overflow. Bucket cards `grid-cols-2 sm:grid-cols-4`.                                                                           |           |
| 94.4  | Overview household list                                        | Table inside `overflow-x-auto`. Rows horizontally scrollable. No viewport overflow.                                                            |           |
| 94.5  | Invoice list table                                             | Wrapped in `overflow-x-auto`.                                                                                                                  |           |
| 94.6  | Invoice detail tabs                                            | Tab labels scroll horizontally if 4+ tabs. Touch targets ≥ 44px.                                                                               |           |
| 94.7  | Payment detail 7 metrics                                       | Stack on mobile into `grid-cols-1` (confirm with RecordHub default).                                                                           |           |
| 94.8  | Payment form inputs                                            | All `w-full`. `text-base` font size (≥16px prevents iOS zoom).                                                                                 |           |
| 94.9  | Create modals (credit note, refund, scholarship, payment plan) | `sm:max-w-lg` / `sm:max-w-2xl` at larger breakpoints; full-width on mobile. Max height `max-h-[90vh]` with `overflow-y-auto` on payment-plans. |           |
| 94.10 | Fee generation wizard step 1                                   | Year groups + fee types grids: `sm:grid-cols-2 md:grid-cols-3`. Single column at 375px.                                                        |           |
| 94.11 | Preview table columns                                          | Horizontally scrollable (inside TableWrapper).                                                                                                 |           |
| 94.12 | Audit trail table                                              | Inside `overflow-x-auto`.                                                                                                                      |           |
| 94.13 | Statement ledger                                               | `rounded-2xl overflow-hidden`. Consider horizontal scroll on narrow screens — verify.                                                          |           |
| 94.14 | PDF modal                                                      | `max-w-4xl w-[90vw]` — uses 90% of viewport width on all sizes.                                                                                |           |
| 94.15 | Input focus                                                    | No iOS auto-zoom on `<Input type="number">` or `<Input type="date">`. All inputs min `text-base`.                                              |           |

---

## 95. Console & Network Health

Open DevTools Console + Network tab while running the spec.

| #     | What to Check                                                         | Expected Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Pass/Fail |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 95.1  | Console — zero uncaught JavaScript errors                             | No red errors during normal navigation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |           |
| 95.2  | Console — expected error logs                                         | Only the tagged logs during deliberate failures: `[FinanceDashboard]`, `[FinancialOverviewPage]`, `[HouseholdInvoiceOverview]`, `[FinanceFeeStructuresPage]`, `[FinanceFeeAssignmentsPage]`, `[FeeGenerationWizard]`, `[FinanceInvoicesPage]`, `[InvoiceActions]`, `[InstallmentForm]`, `[PaymentForm]`, `[AllocationPanel]`, `[FinanceRefundsPage]`, `[RefundsPage.searchPayments]`, `[RefundsPage.createRefund]`, `[fetchRefunds]`, `[FinanceCreditNotesPage]`, `[FinanceScholarshipsPage]`, `[PaymentPlansPage]`, `[FinanceReportsPage]`, `[CustomReportBuilder] loadOptions`, `[CustomReportBuilder] generate`, `[FinanceStatementsPage]`, `[DebtBreakdown]`, `[FinanceAuditTrailPage]`, `[FeeStructureForm]`, `[setPayment]`, `[setInvoice]`, `[useTenantCurrency]`, `[CurrencyDisplay]`, `[HouseholdSelector]`, `[PdfPreviewModal]`. |           |
| 95.3  | Network — no 429 rate limits                                          | Rate limit thresholds not hit during normal flows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |           |
| 95.4  | Network — expected 4xx responses                                      | Only on deliberate tests: 400 invalid-transition, 400 exceeds-balance, 403 permission-denied, 404 not-found, 409 duplicate-name, 409 concurrent-modification.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |           |
| 95.5  | Network — dashboard currency request fires exactly once per page load | `GET /finance/dashboard/currency?_t=...`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |           |
| 95.6  | Network — no duplicate requests                                       | Each fetch fires once per trigger (search keystroke is the one exception on invoices list — flagged §97).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |           |
| 95.7  | Network — no aborted requests mid-flight                              | No `AbortError` in console.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |           |
| 95.8  | No requests to external domains except Stripe checkout redirect       | All API calls to `${NEXT_PUBLIC_API_URL}`. Stripe redirects only when explicitly invoked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |           |
| 95.9  | Correct Content-Type on PDFs                                          | `application/pdf` for invoices/receipts/statements.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |           |
| 95.10 | Correct Content-Disposition inline                                    | `inline; filename="..."` on all 3 PDF endpoints.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |           |
| 95.11 | Auth headers present                                                  | `Authorization: Bearer <jwt>` on every `/api/v1/*` request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |           |
| 95.12 | Cookies — refresh_token httpOnly cookie                               | Included in requests via `credentials: 'include'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |           |

---

## 96. Backend Endpoint Map (All 90 Admin Routes)

Exercised via UI and direct API calls as part of this spec. Tester should confirm each endpoint returns 200 for admin and 403 for non-finance roles.

| Method | Path                                              | Permission                  | Spec Section     |
| ------ | ------------------------------------------------- | --------------------------- | ---------------- |
| GET    | /v1/finance/fee-types                             | finance.view                | §21              |
| GET    | /v1/finance/fee-types/:id                         | finance.view                | §21              |
| POST   | /v1/finance/fee-types                             | finance.manage              | §21              |
| PATCH  | /v1/finance/fee-types/:id                         | finance.manage              | §21              |
| DELETE | /v1/finance/fee-types/:id                         | finance.manage              | §21              |
| GET    | /v1/finance/fee-structures                        | finance.view                | §22              |
| GET    | /v1/finance/fee-structures/:id                    | finance.view                | §24              |
| POST   | /v1/finance/fee-structures                        | finance.manage              | §23              |
| PATCH  | /v1/finance/fee-structures/:id                    | finance.manage              | §24              |
| DELETE | /v1/finance/fee-structures/:id                    | finance.manage              | §22              |
| GET    | /v1/finance/discounts                             | finance.view                | §58              |
| GET    | /v1/finance/discounts/:id                         | finance.view                | §60              |
| POST   | /v1/finance/discounts                             | finance.manage              | §59              |
| PATCH  | /v1/finance/discounts/:id                         | finance.manage              | §60              |
| DELETE | /v1/finance/discounts/:id                         | finance.manage              | §61              |
| GET    | /v1/finance/fee-assignments                       | finance.view                | §26              |
| GET    | /v1/finance/fee-assignments/:id                   | finance.view                | §26              |
| POST   | /v1/finance/fee-assignments                       | finance.manage              | §27              |
| PATCH  | /v1/finance/fee-assignments/:id                   | finance.manage              | §26              |
| POST   | /v1/finance/fee-assignments/:id/end               | finance.manage              | §26              |
| POST   | /v1/finance/fee-generation/preview                | finance.manage              | §29              |
| POST   | /v1/finance/fee-generation/confirm                | finance.manage              | §30              |
| GET    | /v1/finance/invoices                              | finance.view                | §33              |
| GET    | /v1/finance/invoices/:id                          | finance.view                | §34              |
| GET    | /v1/finance/invoices/:id/preview                  | finance.view                | §34              |
| GET    | /v1/finance/invoices/:id/pdf                      | finance.view                | §35 (PDF stream) |
| POST   | /v1/finance/invoices                              | finance.manage              | §83              |
| PATCH  | /v1/finance/invoices/:id                          | finance.manage              | §41              |
| POST   | /v1/finance/invoices/:id/issue                    | finance.manage              | §35              |
| POST   | /v1/finance/invoices/:id/void                     | finance.manage              | §35              |
| POST   | /v1/finance/invoices/:id/cancel                   | finance.manage              | §35              |
| POST   | /v1/finance/invoices/:id/write-off                | finance.manage              | §35              |
| GET    | /v1/finance/invoices/:id/installments             | finance.view                | §38              |
| POST   | /v1/finance/invoices/:id/installments             | finance.manage              | §38              |
| DELETE | /v1/finance/invoices/:id/installments             | finance.manage              | §38              |
| POST   | /v1/finance/invoices/:id/apply-late-fee           | finance.manage_late_fees    | §77              |
| GET    | /v1/finance/payments                              | finance.view                | §42              |
| GET    | /v1/finance/payments/staff                        | finance.view                | §42              |
| GET    | /v1/finance/payments/:id                          | finance.view                | §44              |
| POST   | /v1/finance/payments                              | finance.manage              | §43              |
| GET    | /v1/finance/payments/:id/allocations/suggest      | finance.manage              | §45              |
| POST   | /v1/finance/payments/:id/allocations              | finance.manage              | §45              |
| GET    | /v1/finance/payments/:id/receipt                  | finance.view                | §45              |
| GET    | /v1/finance/payments/:id/receipt/pdf              | finance.view                | §47 (PDF stream) |
| GET    | /v1/finance/refunds                               | finance.view                | §49              |
| POST   | /v1/finance/refunds                               | finance.manage              | §51              |
| POST   | /v1/finance/refunds/:id/approve                   | finance.manage              | §52              |
| POST   | /v1/finance/refunds/:id/reject                    | finance.manage              | §52              |
| POST   | /v1/finance/refunds/:id/execute                   | finance.manage              | §52              |
| POST   | /v1/stripe/webhook                                | (signature-auth)            | §81              |
| GET    | /v1/finance/household-statements/:householdId     | finance.view                | §73              |
| GET    | /v1/finance/household-statements/:householdId/pdf | finance.view                | §74 (PDF stream) |
| GET    | /v1/finance/dashboard                             | finance.view                | §9               |
| GET    | /v1/finance/dashboard/debt-breakdown              | finance.view                | §75              |
| GET    | /v1/finance/dashboard/household-overview          | finance.view                | §19              |
| GET    | /v1/finance/dashboard/currency                    | finance.view                | §82              |
| PATCH  | /v1/finance/dashboard/currency                    | finance.manage              | §82              |
| GET    | /v1/finance/credit-notes                          | finance.view                | §54              |
| GET    | /v1/finance/credit-notes/:id                      | finance.view                | §54              |
| POST   | /v1/finance/credit-notes                          | finance.manage_credit_notes | §55              |
| POST   | /v1/finance/credit-notes/apply                    | finance.manage_credit_notes | §56              |
| GET    | /v1/finance/late-fee-configs                      | finance.view                | §77              |
| GET    | /v1/finance/late-fee-configs/:id                  | finance.view                | §77              |
| POST   | /v1/finance/late-fee-configs                      | finance.manage_late_fees    | §77              |
| PUT    | /v1/finance/late-fee-configs/:id                  | finance.manage_late_fees    | §77              |
| GET    | /v1/finance/scholarships                          | finance.view                | §62              |
| GET    | /v1/finance/scholarships/:id                      | finance.view                | §62              |
| POST   | /v1/finance/scholarships                          | finance.manage_scholarships | §63              |
| POST   | /v1/finance/scholarships/:id/revoke               | finance.manage_scholarships | §64              |
| POST   | /v1/finance/reminders/due-soon                    | finance.manage              | §79              |
| POST   | /v1/finance/reminders/overdue                     | finance.manage              | §79              |
| POST   | /v1/finance/reminders/final-notice                | finance.manage              | §79              |
| GET    | /v1/finance/recurring-configs                     | finance.view                | §78              |
| GET    | /v1/finance/recurring-configs/:id                 | finance.view                | §78              |
| POST   | /v1/finance/recurring-configs                     | finance.manage              | §78              |
| PUT    | /v1/finance/recurring-configs/:id                 | finance.manage              | §78              |
| POST   | /v1/finance/recurring-configs/generate            | finance.manage              | §78              |
| GET    | /v1/finance/reports/aging                         | finance.view_reports        | §68              |
| GET    | /v1/finance/reports/revenue-by-period             | finance.view_reports        | §70 / direct     |
| GET    | /v1/finance/reports/collection-by-year-group      | finance.view_reports        | §70 / direct     |
| GET    | /v1/finance/reports/payment-methods               | finance.view_reports        | direct           |
| GET    | /v1/finance/reports/fee-structure-performance     | finance.view_reports        | §69              |
| GET    | /v1/finance/reports/custom                        | finance.view_reports        | §70              |
| GET    | /v1/finance/payment-plans                         | finance.view                | §65              |
| POST   | /v1/finance/payment-plans/admin-create            | finance.manage              | §66              |
| GET    | /v1/finance/payment-plans/:id                     | finance.view                | §67              |
| POST   | /v1/finance/payment-plans/:id/approve             | finance.manage              | §88              |
| POST   | /v1/finance/payment-plans/:id/reject              | finance.manage              | §88              |
| POST   | /v1/finance/payment-plans/:id/counter-offer       | finance.manage              | §88              |
| POST   | /v1/finance/payment-plans/:id/cancel              | finance.manage              | §65              |
| GET    | /v1/finance/audit-trail                           | finance.view                | §76              |
| POST   | /v1/finance/bulk/issue                            | finance.bulk_operations     | §80              |
| POST   | /v1/finance/bulk/void                             | finance.bulk_operations     | §80              |
| POST   | /v1/finance/bulk/remind                           | finance.bulk_operations     | §80              |
| POST   | /v1/finance/bulk/export                           | finance.bulk_operations     | §80              |

**Not in scope (parent-only, listed for completeness):** `GET /v1/parent/students/:studentId/finances`, `POST /v1/parent/invoices/:id/pay`, `POST /v1/parent/invoices/:id/request-payment-plan`, `POST /v1/parent/payment-plans/:id/accept`.

---

## 97. Observations, Inconsistencies & Bugs Flagged During Walkthrough

The following issues were surfaced during the code walkthrough. They are not blockers for running the spec but should be filed as tickets.

### Translation debt (hardcoded English strings)

1. **Invoice detail tabs** (`Lines`, `Payments`, `Installments`) and **payment detail tabs** (`Allocations`, `Refunds`) are hardcoded English — not translated.
2. **Invoice list column headers** (`Issue Date`, `Invoice #`, `Household`, `Student`, `Student #`, `Total`, `Due Date`) — hardcoded English.
3. **Invoice list empty-state description** (`"No invoices this term -- create fee assignments first, then run the fee generation wizard."`) — hardcoded.
4. **Invoice status labels in detail page** (`Draft`, `Pending Approval`, `Issued`, `Partially Paid`, `Paid`, `Overdue`, `Void`, `Cancelled`, `Written Off`) — hardcoded English. Badge still resolves translations via `defaultValue`, but the detail page's own label map is hardcoded.
5. **Payment status labels in detail page** (`Pending`, `Posted`, `Failed`, `Voided`, `Partially Refunded`, `Fully Refunded`) — hardcoded.
6. **Payment method labels everywhere** (`Stripe`, `Cash`, `Bank Transfer`, `Card (Manual)`) — hardcoded.
7. **Installment status labels** (`Pending`, `Paid`, `Overdue`) — hardcoded.
8. **RecordHub metric labels on invoice + payment details** (`Household`, `Issue Date`, `Due Date`, `Subtotal`, `Discount`, `Total`, `Paid`, `Balance`, `Amount`, `Method`, `Received`, `Allocated`, `Unallocated`) — hardcoded.
9. **Fee structure billing frequency labels** (`One-off`, `Per Term`, `Monthly`, `Custom`) + fee structure list status (`Active`, `Inactive`) — hardcoded.
10. **Discount list status labels** (`Active`, `Inactive`) — hardcoded.
11. **Invoice action modal labels** (`Void Invoice`, `Cancel Invoice`, `Write Off`, `Create Plan`) + confirmation descriptions (`This will void the invoice...`) — hardcoded.
12. **Toast messages in InvoiceActions, InstallmentForm, AllocationPanel** (`Invoice issued successfully`, `Invoice voided successfully`, `Allocations confirmed`, `Failed to issue invoice`, etc.) — hardcoded.
13. **Button labels during loading** (`Creating...`, `Recording...`, `Confirming...`, `Suggesting...`, `Record Payment`, `Create Plan`, `Suggest Allocations`, `Confirm Allocations`) — hardcoded.
14. **Back link text on discounts, scholarships, debt-breakdown list pages** — literal `"Back"` string (English) rather than `tc('back')`.
15. **Fee assignment list `"Ongoing"`** label — hardcoded English.
16. **Aging bucket labels** in dashboard's `AgingOverview` component (`Current`, `1–30 days`, ...) — hardcoded.
17. **Statement ledger entry type labels** (`Invoice`, `Payment`, `Allocation`, `Refund`, `Write-off`) — hardcoded.
18. **Audit trail description prefixes** (`Created`, `Updated`, `Deleted`) — hardcoded.
19. **Debt breakdown summary** appends a literal `"s"` to pluralise the household label — incorrect for Arabic.
20. **DiscountForm refinement error messages** (`"Percentage discount value must be <= 100"`, `"Select a condition type for automatic discounts"`) — hardcoded in the schema.
21. **InstallmentForm running total helper text** (`"Remaining"`, `"Over"`) — hardcoded.
22. **Refund modal method transformation** — uses `payment_method.replace(/_/g, ' ')` instead of the localised method label.

### Functional inconsistencies

23. **Fee structure empty-state CTA is NOT gated by `canManage`** — non-managers still see the "New" button on the empty state (only the toolbar version is gated).
24. **Invoice list `status` query-param from dashboard links is not read by the page** — dashboard emits `?status=draft` links that the invoice list ignores. The server accepts status in the URL but the UI does not sync.
25. **Household link on payment detail lacks `/{locale}` prefix**, while the payment list page includes it — inconsistent navigation.
26. **Dashboard OverdueInvoices row click uses `window.location.assign` (hard nav)** instead of `router.push`, causing a full page reload.
27. **Invoice list search input has no debounce** — every keystroke fires a network request.
28. **No status filter exposed in the invoice list toolbar** despite server supporting it.
29. **Debt-breakdown page bucket tabs do not update the URL** when clicked — the URL query is read on mount only. Direct deep-link works but interactive filter does not update history.
30. **Debt-breakdown error path does not reset rows** — if a fetch fails, the stale rows remain on screen.
31. **Payment plans empty state renders regardless of filter** — shows "create your first plan" even when the user is filtering `status=cancelled`.
32. **HouseholdSelector falls back to placeholder when value refers to a household not in the current 50 results** — e.g., after editing and reopening, a long search may show the placeholder.
33. **Refund reject UI sends empty body but schema requires `comment` min 1** — clicking Reject on the list **always 400s**. UI must be updated to collect a comment.
34. **Refund approve/reject/execute actions show no success toast** — users get no feedback on success; the list just refetches silently.
35. **Refund execute does NOT trigger Stripe-side refund** — `StripeService.processRefund` is a separate path not wired into `execute()`. For tenants using Stripe, this means refunds only reverse local allocations without actually refunding the customer.
36. **`refund` is not in the canonical `SEQUENCE_TYPES` constant** per README DZ-04. Sequence calls work but the constant list should be updated.
37. **Late-fee-configs and recurring-configs use `PUT` for updates** — inconsistent with every other finance resource which uses `PATCH`.
38. **`POST /v1/finance/bulk/export` returns JSON** — not a CSV/PDF stream. Inconsistent with other export endpoints which use controller-level streaming.
39. **Fee generation Zod schema does not enforce date ordering** — `billing_period_start > billing_period_end` passes Zod; service may return 0 valid lines or behave unexpectedly.
40. **`updateDiscountSchema` does not carry `.refine()` rules from `createDiscountSchema`** — PATCH with percent > 100 passes Zod; service-layer check catches it.
41. **Payment reminders service only writes dedup rows** — comment indicates "in practice this would call the notifications service or queue a job". Actual message delivery is not wired for the finance domain.
42. **Receipt PDF filename uses payment UUID** (`receipt-{uuid}.pdf`) rather than the receipt_number.
43. **`formatCurrency` helper in `dashboard-sections.tsx` does NOT apply currency symbol** — uses `toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})` only. Caller must prepend the symbol separately. In the dashboard's recent-payments table, this results in a bare number with no currency indicator.
44. **`getStaff` endpoint permission is `finance.view`** — exposes staff identity to any finance-viewer.

### Documentation / testability

45. **No shared `reportQuerySchema` export** — inlined in `finance-enhanced.controller.ts`. Test fixtures must duplicate the shape.
46. **`isValidPaymentTransition` helper exists in `packages/shared/src/finance/state-machine-payment.ts` but is not used by `PaymentsService`** — transitions are enforced implicitly via status gates scattered across the codebase.
47. **No shared state-machine files for invoice / refund / credit-note / payment-plan / scholarship** — only payment has one. Transition logic is per-service.
48. **Custom report builder's CSV export generates client-side, not via backend `/export`** — unlike Aging and Fee Performance tabs which use `window.open` on the server endpoint.

---

## 98. Sign-Off

| Reviewer Name | Date | Pass | Fail | Overall Result |
| ------------- | ---- | ---- | ---- | -------------- |
|               |      |      |      |                |

**Instructions for tester:**

- Mark each row Pass or Fail.
- For any Fail, record: (a) the section + row ID; (b) the observed result; (c) a screenshot or network log snippet; (d) the environment (tenant, locale, viewport size, user role).
- File every fail as a ticket with one of the tags: `bug/finance`, `bug/rls`, `bug/translation`, `bug/rtl`, `bug/mobile`, `bug/api`.
- Escalate any security/RLS failures (§92) immediately — these are P0 blockers for tenant onboarding.
- If you discover inconsistencies not flagged in §97, append them to a new "Observations — additional" block below this table and raise tickets.

**Do NOT consider the module "tested" until every row in every section has been exercised.** Partial signoff defeats the purpose of this spec.

---
