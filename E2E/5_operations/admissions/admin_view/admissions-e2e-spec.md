# Admissions Module — Admin E2E Test Specification

**Module:** Admissions (Operations)
**Perspective:** Admin (school_owner, school_principal, admin, school_vice_principal, front_office — role-specific affordances noted per row)
**Pages Covered:** 10 authenticated staff routes + 7 detail-page tab/modal surfaces
**Backend endpoints exercised:** 28 (see §34)
**Spec version:** 2.0 (2026-04-12) — replaces the pre-redesign draft under the same path
**Pack companion:** part of `/e2e-full admissions` — sibling specs live alongside under `integration/`, `worker/`, `perf/`, `security/`

---

## Table of Contents

1. [Prerequisites & Test Data](#1-prerequisites--test-data)
2. [Out of Scope (pointers to sibling specs)](#2-out-of-scope)
3. [Global UI Shell — Morph Bar & Sub-strip](#3-global-ui-shell)
4. [Admissions Dashboard / Hub — `/admissions`](#4-admissions-dashboard)
5. [Ready-to-Admit Queue — `/admissions/ready-to-admit`](#5-ready-to-admit-queue)
6. [Waiting List Queue — `/admissions/waiting-list`](#6-waiting-list-queue)
7. [Conditional-Approval Queue — `/admissions/conditional-approval`](#7-conditional-approval-queue)
8. [Approved Archive — `/admissions/approved`](#8-approved-archive)
9. [Rejected Archive — `/admissions/rejected`](#9-rejected-archive)
10. [Admissions Analytics — `/admissions/analytics`](#10-admissions-analytics)
11. [Form Preview — `/admissions/form-preview`](#11-form-preview)
12. [Admissions Settings — `/admissions/settings`](#12-admissions-settings)
13. [Application Detail — Header & Meta Strip](#13-detail-header)
14. [Application Detail — Application Tab](#14-detail-application)
15. [Application Detail — Timeline Tab](#15-detail-timeline)
16. [Application Detail — Notes Tab](#16-detail-notes)
17. [Application Detail — Payment Tab](#17-detail-payment)
18. [Detail Actions — `ready_to_admit` state](#18-actions-ready-to-admit)
19. [Detail Actions — `conditional_approval` state](#19-actions-conditional-approval)
20. [Detail Actions — `waiting_list` state](#20-actions-waiting-list)
21. [Detail Actions — `approved` / terminal states](#21-actions-terminal)
22. [Reject Dialog](#22-reject-dialog)
23. [Force-Approve-with-Override Modal](#23-force-approve-modal)
24. [Record Cash Payment Modal](#24-record-cash-modal)
25. [Record Bank-Transfer Modal](#25-record-bank-transfer-modal)
26. [Manual Promote Dialog (waiting-list)](#26-manual-promote-dialog)
27. [Queue Components — shared primitives](#27-queue-components)
28. [State Machine — full transition graph](#28-state-machine)
29. [End-to-end flows — 8 flows](#29-end-to-end-flows)
30. [Data Invariants — SQL checks after each flow](#30-data-invariants)
31. [Arabic / RTL Behaviour](#31-rtl)
32. [Console & Network Health](#32-console-network)
33. [Permission Matrix — affordance visibility by role](#33-permission-matrix)
34. [Backend Endpoint Map](#34-endpoint-map)
35. [Observations & Findings from the walkthrough](#35-observations)
36. [Sign-off Table](#36-signoff)

Legend: every row has columns `# | What to Check | Expected Result | Pass/Fail`. API paths are prefixed with `/v1/...` (the `/api` prefix is applied by the gateway). Where a row is a pure negative assertion, the Expected Result column states the HTTP status code **and** what the UI should render instead (empty state, toast, 404 page, etc.).

---

## 1. Prerequisites & Test Data <a id="1-prerequisites--test-data"></a>

This spec CANNOT be run on a single tenant. Cross-tenant leakage is validated by navigating to Tenant B's resources while authenticated as Tenant A — a single-tenant environment makes every row in section 5 through 27 silently pass.

### 1.1 Tenants (2 minimum)

| Slug       | Currency | Country | Upfront % | Payment window | Allow cash | Allow bank transfer | Override role      | Seeded state                                             |
| ---------- | -------- | ------- | --------- | -------------- | ---------- | ------------------- | ------------------ | -------------------------------------------------------- |
| `tenant-a` | EUR      | IE      | 100       | 7 days         | true       | true                | `school_owner`     | 20 applications across all 7 lifecycle states (see §1.4) |
| `tenant-b` | USD      | US      | 50        | 14 days        | false      | true                | `school_principal` | 50 applications across all 7 lifecycle states (see §1.4) |

Settings live under `tenants.admissions_settings` JSONB; confirm via `GET /v1/settings/admissions` as an admin of each tenant.

### 1.2 Users (≥ 4 per tenant)

For EACH tenant seed at minimum the following accounts (all with password `Password123!`):

| Label           | Role              | Purpose                                                              |
| --------------- | ----------------- | -------------------------------------------------------------------- |
| `owner@...`     | school_owner      | Override authority, settings, approvals                              |
| `principal@...` | school_principal  | Approvals but NOT override in tenant-a (override delegated to owner) |
| `front@...`     | front_office      | Queue view only (no `admissions.manage`)                             |
| `parent@...`    | parent (external) | Parent portal view; cross-scope reject attempts                      |

Additional accounts for hostile matrix: `teacher@...` (role: teacher, no admissions permissions at all), `student@...` (role: student, same).

### 1.3 Year-group + capacity seed

Each tenant needs at least two (AcademicYear, YearGroup) pairs with non-zero, non-identical capacity:

- Tenant A: `2026/27` × `Year 1` (capacity 2), `2026/27` × `Year 2` (capacity 5)
- Tenant B: `2026/27` × `Kindergarten` (capacity 10), `2026/27` × `Grade 5` (capacity 0 — used to exercise zero-capacity routing)

### 1.4 Application state seeding

For each tenant, seed applications in all 7 lifecycle states:

| Status                 | Tenant A count | Tenant B count | Notes                                                               |
| ---------------------- | -------------- | -------------- | ------------------------------------------------------------------- |
| `submitted`            | 0              | 0              | Transient; never sits (auto-routed at submit)                       |
| `waiting_list`         | 3              | 8              | 1 per tenant carries `waiting_list_substatus='awaiting_year_setup'` |
| `ready_to_admit`       | 4              | 10             | With `target_year_group_id` set to the non-zero groups              |
| `conditional_approval` | 3              | 5              | At least one with `payment_deadline < now()` (for expiry)           |
| `approved`             | 4              | 15             | Each linked via `materialised_student_id` to a Student              |
| `rejected`             | 3              | 7              | With populated `rejection_reason`                                   |
| `withdrawn`            | 3              | 5              | Including at least one withdrawn by parent self-service             |

Record the `application_number` of at least one row of each state per tenant for use in deep-link and cross-tenant tests.

### 1.5 Form-definition seed

Each tenant gets exactly ONE `AdmissionFormDefinition` with `status='published'` (system form). Its field set must include at least one row of each `ApplicationFieldType` (short_text, long_text, number, date, boolean, single_select, multi_select, phone, email, country, yes_no) so the Form-Preview and Public-Apply specs can exercise rendering.

### 1.6 Payment fixtures

- Tenant A has ≥ 1 fee structure active on `Year 1` — `FinanceFeesFacade.resolveAnnualNetFeeCents` must return a non-zero amount. The seeded conditional_approval rows must have `payment_amount_cents > 0`.
- Tenant A also has ≥ 1 year_group with no fee structure at all (for the `NO_FEE_STRUCTURE_CONFIGURED` error path in §19).
- Stripe test mode keys configured in tenant settings so `/payment-link/regenerate` can create a real checkout session.

### 1.7 Multi-tenant hostile pair

Record at least one `application_id` and one `application_number` from Tenant B. These values are used in §§5.14, 13.9, 17.11 to prove Tenant A cannot see, list, mutate, or deep-link to Tenant B resources.

### 1.8 Test-date assumptions

All manual-time-based tests (payment expiry, apply_date sort) assume the test is run on or after **2026-04-12**. When seeding fixtures, set `apply_date` to at least three distinct values across `waiting_list` rows so FIFO ordering is visibly testable, and `payment_deadline` values both in the past and future.

---

## 2. Out of Scope <a id="2-out-of-scope"></a>

This spec exercises the UI-visible surface of the Admissions module as a human (or Playwright agent) clicking through the admin shell. It does NOT cover:

- **RLS leakage / cross-tenant isolation at the DB layer** → `integration/admissions-integration-spec.md` (multi-tenant matrix, direct-API cross-reads, Prisma-level tenant_id enforcement on every mutating call)
- **Stripe webhook signature + idempotency** → `integration/admissions-integration-spec.md` (raw-body HMAC POST, `stripe_event_id` dedup ledger, `checkout.session.completed` and `payment_intent.payment_failed` event routing)
- **API contract tests bypassing the UI** → `integration/admissions-integration-spec.md` (every endpoint × every role, every Zod boundary, every state-machine invalid transition with exact error code)
- **DB-level invariants after each flow** → covered here as §30 in human-readable form AND in `integration/` for the machine-executable version
- **Concurrency / race conditions** (parallel conditional_approval grabs on last seat, parallel webhook-vs-cash approvals) → `integration/admissions-integration-spec.md`
- **BullMQ jobs, cron schedulers, async side-effect chains** → `worker/admissions-worker-spec.md` (`notifications:admissions-payment-link` job, `admissions:payment-expiry` cron, `admissions:auto-promoted` notification)
- **Load / throughput / latency budgets** → `perf/admissions-perf-spec.md` (queue endpoints at 10k+ applications, analytics date-range aggregation, PDF receipt render)
- **Security hardening** → `security/admissions-security-spec.md` (OWASP Top 10, honeypot efficacy, IP rate-limit precision, payment amount tampering)
- **Long-lived regressions from modules outside Admissions** that import admissions services — tracked at the coverage-tracker level, not here
- **PDF content correctness** of generated admission receipts (the E2E spec verifies Content-Type / Content-Disposition; actual bytes go to `integration/`)
- **Browser / device matrix beyond desktop Chrome and 375px mobile emulation** — deferred to a manual QA cycle on Safari, Firefox, and iPad

A tester who runs ONLY this spec is doing a thorough admin-shell smoke + regression pass. They are NOT doing a full tenant-readiness check. For the latter, use `/e2e-full admissions` which runs all five specs in sequence.

---

## 3. Global UI Shell — Morph Bar & Sub-strip <a id="3-global-ui-shell"></a>

Apply to every authenticated route under this spec.

| #   | What to Check                                                                                        | Expected Result                                                                                                                                                                                                                    | Pass/Fail |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | Navigate to `/en/admissions` while signed in as Tenant A owner                                       | Morph bar renders at top; Admissions hub button is the active hub. Sub-strip below morph bar shows admission-module tabs (Dashboard, Ready-to-Admit, Waiting List, Conditional Approval, Approved, Rejected, Analytics, Settings). |           |
| 3.2 | Switch locale to `/ar/admissions`                                                                    | Entire shell flips to RTL (`<html dir="rtl">`). Morph bar logo stays start-aligned; navigation order mirrors. All Arabic strings present, none in English except brand names and numerals (see §31).                               |           |
| 3.3 | Hard-refresh any admissions page                                                                     | Morph bar + sub-strip do not remount with a visible flash. CLS ≤ 0.05 (measure via Lighthouse). No layout jump larger than 4px on initial paint.                                                                                   |           |
| 3.4 | Click between two admissions sub-strip tabs rapidly (e.g. Ready-to-Admit → Waiting List)             | Sub-strip active underline animates smoothly; no full-page reload; morph bar stays stable.                                                                                                                                         |           |
| 3.5 | Resize to 375px width                                                                                | Morph bar collapses to hamburger + admissions module title. Sub-strip becomes horizontally scrollable with overflow affordance (scroll hint on right edge). Every tab reachable by swipe.                                          |           |
| 3.6 | As `front_office` user (only `admissions.view`), confirm nav visibility                              | Settings tab is HIDDEN from sub-strip (requires `admissions.manage`). Form-Preview stays visible.                                                                                                                                  |           |
| 3.7 | As `teacher` user (no admissions permissions), navigate to `/en/admissions`                          | Hub is HIDDEN from top-level morph bar; direct URL returns 403 or redirects to `/en/` landing with toast `PERMISSION_DENIED`.                                                                                                      |           |
| 3.8 | Notifications bell (in morph bar) while a `admissions_payment_link` notification is pending delivery | Unread counter increments by 1 when the worker inserts the notification row; clicking bell shows the notification text localised per `template_key`.                                                                               |           |

---

## 4. Admissions Dashboard / Hub — `/admissions` <a id="4-admissions-dashboard"></a>

Backend: `GET /v1/admissions/dashboard-summary` (permission `admissions.view`). Renders queue-count cards plus capacity-pressure strip per (AcademicYear, YearGroup).

### 4.1 Happy path

| #     | What to Check               | Expected Result                                                                                                                                                                                                                    | Pass/Fail |
| ----- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1.1 | Load page as Tenant A owner | Network panel shows exactly one `GET /v1/admissions/dashboard-summary` returning 200. Response JSON has keys `ready_to_admit`, `waiting_list`, `conditional_approval`, `approved`, `rejected`, `overrides`, `capacity_pressure[]`. |           |
| 4.1.2 | Queue-count cards           | Four cards visible: "Ready to Admit" (count 4), "Waiting List" (count 3), "Conditional Approval" (count 3), "Approved" (count 4). Each card is a clickable link to its queue.                                                      |           |
| 4.1.3 | Capacity-pressure strip     | Renders one row per (AcademicYear, YearGroup) with active applications. Each row shows: year group name, academic year, enrolled+conditional / capacity with colour grade (green <70%, amber 70-99%, red ≥100%).                   |           |
| 4.1.4 | Overrides counter           | Secondary line on hub shows "Overrides this term: N" where N = count of `AdmissionOverride` rows this academic term.                                                                                                               |           |
| 4.1.5 | Click "Ready to Admit" card | Navigates to `/admissions/ready-to-admit` — verify sub-strip tab becomes active.                                                                                                                                                   |           |
| 4.1.6 | Refresh dashboard           | Response cached for 0 seconds (no `Cache-Control: public`). Values always reflect current DB.                                                                                                                                      |           |

### 4.2 Empty + error states

| #     | What to Check                                                              | Expected Result                                                                                                                                           | Pass/Fail |
| ----- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.2.1 | Login to a tenant with zero applications (seed a third tenant temporarily) | Queue cards all show "0". Capacity-pressure strip renders heading plus an empty-state placeholder ("No active applications yet").                         |           |
| 4.2.2 | Throttle the API to return 500 for `dashboard-summary`                     | Cards render with skeleton + inline error "Failed to load dashboard summary"; console logs `[AdmissionsDashboard] Error`; a retry CTA re-issues the call. |           |
| 4.2.3 | As `front_office` (only `admissions.view`)                                 | Dashboard renders identically. Overrides counter is still shown (it is a view-only count).                                                                |           |
| 4.2.4 | As `teacher` hitting `/en/admissions` directly via URL                     | Frontend does not render; redirects to 403 page or lands on hub selection. `GET /v1/admissions/dashboard-summary` returns 403 code `PERMISSION_DENIED`.   |           |

### 4.3 Cross-tenant probes

| #     | What to Check                                                                                                       | Expected Result                                                                                                                                    | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.3.1 | Tenant A owner logged in. Devtools → replay `GET /v1/admissions/dashboard-summary` with `Host: tenant-b.edupod.app` | 401 (session does not match host) or 403 if the Host-based routing accepts it — NEVER 200 with Tenant B counts.                                    |           |
| 4.3.2 | Tenant A owner. Intercept response and swap in Tenant B's JSON (e.g. via browser debugger)                          | Capacity-pressure rows show year-groups that do not exist in Tenant A — tester notes visual mismatch (this is a UI-trust check, not a code check). |           |

---

## 5. Ready-to-Admit Queue — `/admissions/ready-to-admit` <a id="5-ready-to-admit-queue"></a>

Backend: `GET /v1/applications/queues/ready-to-admit` (`admissions.view`).

| #    | What to Check                                                                                                                 | Expected Result                                                                                                                                                                                              | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 5.1  | Page load                                                                                                                     | Network panel shows `GET /v1/applications/queues/ready-to-admit` returning 200. Response shape: `{ data: ApplicationRow[], meta: { total, grouped_by_year_group } }`.                                        |           |
| 5.2  | Queue rows                                                                                                                    | Rows grouped by (AcademicYear, YearGroup) with capacity chip in group header showing `enrolled+conditional / capacity`. Within a group rows ordered by `apply_date` ASC (FIFO).                              |           |
| 5.3  | ApplicationRow content                                                                                                        | Per row: student full name (LTR even in Arabic), `application_number` (monospace), `apply_date` formatted Gregorian (e.g. `12 Apr 2026`), submitted_by parent name + email, year-group name, a "Review" CTA. |           |
| 5.4  | Capacity chip: seats available                                                                                                | Chip text reads "`X of Y seats available`". Colour green for ≥50% free, amber 10-49%, red 0-9%, destructive-red on 0 available with "Full — hold promotions".                                                |           |
| 5.5  | Capacity chip: zero capacity (Grade 5 in Tenant B)                                                                            | Chip reads "No capacity configured" in subdued tone. "Review" CTA on rows still works but §18.2 covers the gate on moving to conditional_approval.                                                           |           |
| 5.6  | Row click → navigates to `/admissions/{id}`                                                                                   | Morph bar stays; detail page loads; URL updates to `/admissions/:id`.                                                                                                                                        |           |
| 5.7  | Empty state                                                                                                                   | When zero ready-to-admit rows: full-width placeholder "Queue is empty — submitted applications auto-route here when seats are available".                                                                    |           |
| 5.8  | Search / filter bar                                                                                                           | Input searches `application_number` or student name (client-side debounce 300ms). Clearing the field restores full list.                                                                                     |           |
| 5.9  | Refresh (F5)                                                                                                                  | Re-fetches, preserving scroll position. No memory leak on repeated refresh (profile for 30 iterations — RSS growth < 5MB).                                                                                   |           |
| 5.10 | Role: `front_office` (view only)                                                                                              | Queue renders. Row "Review" CTA renders but `admissions.manage` guarded actions inside the detail page are disabled (see §18).                                                                               |           |
| 5.11 | Role: `teacher` direct URL                                                                                                    | 403 on network; UI redirects to hub-selector.                                                                                                                                                                |           |
| 5.12 | Arabic locale `/ar/admissions/ready-to-admit`                                                                                 | Group headers right-aligned; capacity chip remains readable; numbers stay Western (0-9); month abbreviations localised ("ابريل 12" or equivalent per translation file).                                      |           |
| 5.13 | Tenant isolation — set browser localStorage token for tenant-a user, then navigate to `/admissions/{tenant_b_application_id}` | Returns 404 page "Application not found"; backend returns 404 code `APPLICATION_NOT_FOUND`; NEVER 200 with tenant-b data.                                                                                    |           |
| 5.14 | Tenant isolation — `GET /v1/applications/queues/ready-to-admit` with `Authorization: Bearer <tenant-b token>`                 | Returns only tenant-b rows — never tenant-a rows in the response. Group headers show tenant-b year-groups exclusively.                                                                                       |           |
| 5.15 | Network tab: confirm no duplicate calls                                                                                       | Exactly 1 call per mount. On revisits from sub-strip, call is re-issued (no stale cache).                                                                                                                    |           |

---

## 6. Waiting List Queue — `/admissions/waiting-list` <a id="6-waiting-list-queue"></a>

Backend: `GET /v1/applications/queues/waiting-list` (`admissions.view`).

| #   | What to Check                                                                              | Expected Result                                                                                                                                                                                                                      | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 6.1 | Page load                                                                                  | 200 response; rows sorted by `apply_date` ASC; grouped by (AcademicYear, YearGroup) with FIFO position number shown in-row (`Position #3 in queue`).                                                                                 |           |
| 6.2 | Row with `waiting_list_substatus='awaiting_year_setup'`                                    | Row is rendered with a badge "Awaiting year setup" and is visually separated (indented under a sub-header) OR colour-tinted. Tooltip text: "This year-group has no classes configured yet. Promotion blocked until setup completes." |           |
| 6.3 | Manual-promote action (row-level kebab → "Promote manually")                               | Opens `ManualPromoteDialog`. Dialog requires justification ≥ 10 chars. See §26 for full dialog spec.                                                                                                                                 |           |
| 6.4 | Manual-promote when current user lacks `admissions.manage`                                 | Kebab item is HIDDEN. Directly POSTing `/v1/applications/:id/manual-promote` returns 403 `PERMISSION_DENIED`.                                                                                                                        |           |
| 6.5 | Auto-badge on newly-promoted rows (if admin loads the queue shortly after expiry cron ran) | Recently-promoted applications have moved to §5 (ready-to-admit) — verify that the waiting-list row count decremented.                                                                                                               |           |
| 6.6 | Row action: "Reject"                                                                       | Opens `RejectDialog` (see §22). Reject is permitted from `waiting_list` per state-machine (see §28).                                                                                                                                 |           |
| 6.7 | Row action: "Review / View detail"                                                         | Navigates to `/admissions/:id`.                                                                                                                                                                                                      |           |
| 6.8 | Empty state                                                                                | "No applicants on the waiting list" with subtitle "They will appear here when the ready-to-admit queue is full".                                                                                                                     |           |
| 6.9 | Pagination                                                                                 | If backend returns `meta.total > pageSize`, pager row appears at bottom with Page N of M.                                                                                                                                            |           |

---

## 7. Conditional-Approval Queue — `/admissions/conditional-approval` <a id="7-conditional-approval-queue"></a>

Backend: `GET /v1/applications/queues/conditional-approval` (`admissions.view`).

| #    | What to Check                             | Expected Result                                                                                                                                                                                         | Pass/Fail |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1  | Page load                                 | 200 response; rows sorted by payment `urgency` (computed: `payment_deadline ASC`, with nulls-last).                                                                                                     |           |
| 7.2  | Urgency badge per row                     | Three tiers by `payment_deadline - now()`: overdue (deadline in past) → red "Overdue", ≤ 48h → amber "Urgent", else default "Pending payment".                                                          |           |
| 7.3  | Row body: expected amount                 | Shows `payment_amount_cents / 100` formatted in tenant currency (EUR for A, USD for B). Currency symbol before/after per locale (LTR inputs always).                                                    |           |
| 7.4  | Row body: deadline                        | Human-readable countdown "Due in 3 days" / "Overdue by 2 hours". Gregorian calendar, Western numerals in Arabic locale.                                                                                 |           |
| 7.5  | Row kebab → "Record cash payment"         | Only visible if tenant setting `allow_cash=true` AND current user has `admissions.manage`. Opens `PaymentRecordModal` (cash variant).                                                                   |           |
| 7.6  | Row kebab → "Record bank transfer"        | Only visible if `allow_bank_transfer=true` AND `admissions.manage`. Opens `PaymentRecordModal` (bank variant).                                                                                          |           |
| 7.7  | Row kebab → "Force approve with override" | Only visible if current user has the tenant-configured `require_override_approval_role` role (school_owner for A, school_principal for B) AND `admissions.manage`. Opens `ForceApproveModal` (see §23). |           |
| 7.8  | Row kebab → "Regenerate payment link"     | Only if `admissions.manage`. Calls `POST /v1/applications/:id/payment-link/regenerate` — toast "Payment link regenerated and emailed".                                                                  |           |
| 7.9  | Row kebab → "Revert to waiting list"      | Calls internal `POST /v1/applications/:id/review` with `status='waiting_list'`. State machine allows this (see §28). Seat is released; downstream auto-promotion may fire.                              |           |
| 7.10 | Row kebab → "Reject"                      | Opens RejectDialog. Reject from conditional_approval is valid per state machine.                                                                                                                        |           |
| 7.11 | Row with past `payment_deadline`          | UI tolerates stale data until the `admissions:payment-expiry` cron fires (every 15 min). Row shows "Overdue" badge. An admin manually reverting via kebab is allowed in the meantime.                   |           |
| 7.12 | Empty state                               | "No applications are pending payment" with explanatory copy.                                                                                                                                            |           |

---

## 8. Approved Archive — `/admissions/approved` <a id="8-approved-archive"></a>

Backend: `GET /v1/applications/queues/approved` (`admissions.view`). Pagination + search.

| #   | What to Check                                   | Expected Result                                                                                                                                                           | Pass/Fail |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Page load (default page 1, pageSize 20)         | 200 response; rows sorted by `reviewed_at DESC`. Columns: application_number, student name, year group, approved on, payment source (stripe/cash/bank_transfer/override). |           |
| 8.2 | Search by student name                          | Client-side debounce 300ms; `?search=` appended to request. Results filter server-side; pagination resets to 1.                                                           |           |
| 8.3 | Search with SQL-like characters (`%`, `'`, `;`) | Request proceeds safely; backend treats as literal — no 500, results may be empty. (SQLi hardening is covered in security spec.)                                          |           |
| 8.4 | Row click → detail page                         | Detail page loads; state-specific actions (§21) show nothing mutating — application is in terminal state.                                                                 |           |
| 8.5 | Link to materialised student                    | Row shows a chip "→ Student S-1A-042". Clicking navigates to `/students/{student_id}` (Students module — not scope of this spec beyond redirect verification).            |           |
| 8.6 | Empty state                                     | "No approved applications yet".                                                                                                                                           |           |
| 8.7 | Permission — role `front_office`                | Queue renders but row-level "Unapprove" type actions do not exist (none are valid per state machine — approved is terminal).                                              |           |
| 8.8 | Arabic                                          | Right-aligned layout; application_number stays LTR; dates Gregorian; currency amounts LTR inside bidirectional context.                                                   |           |

---

## 9. Rejected Archive — `/admissions/rejected` <a id="9-rejected-archive"></a>

Backend: `GET /v1/applications/queues/rejected` (`admissions.view`). Pagination + search.

| #   | What to Check         | Expected Result                                                                                                                      | Pass/Fail |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 9.1 | Page load             | Rows sorted by `reviewed_at DESC`. Each row shows rejection_reason (truncated with "See more" expand).                               |           |
| 9.2 | Search by reason text | `?search=` matches rejection_reason via case-insensitive ILIKE (or equivalent full-text). Backend-side only; client does not filter. |           |
| 9.3 | Row click → detail    | Detail page shows reason full text, timeline entry "Rejected by {user} on {date} — Reason: {rejection_reason}".                      |           |
| 9.4 | Empty state           | "No rejected applications".                                                                                                          |           |
| 9.5 | Role `front_office`   | Queue renders; no mutating actions available.                                                                                        |           |

---

## 10. Admissions Analytics — `/admissions/analytics` <a id="10-admissions-analytics"></a>

Backend: `GET /v1/applications/analytics` (`admissions.view`). Accepts `form_definition_id?`, `date_from?`, `date_to?`.

| #     | What to Check                                                           | Expected Result                                                                                                                                                                   | Pass/Fail |
| ----- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1  | Page load with no filters                                               | Default date range = last 90 days. Response returns: total submissions, acceptance rate %, avg time-to-approval (days), rejection-reason breakdown, daily submission count array. |           |
| 10.2  | Date range picker                                                       | Two date inputs with Gregorian calendar. Invalid ranges (`date_from > date_to`) disable Apply button with inline hint "Start date must be before end date".                       |           |
| 10.3  | Select a specific `form_definition_id` from dropdown                    | Filters all metrics to that form. Dropdown lists only the tenant's forms; cross-tenant form IDs are not returned by backend.                                                      |           |
| 10.4  | KPI cards                                                               | Cards: Total submissions (N), Acceptance rate (pct), Avg time to approval (days), Currently in waiting list (N). Each card has a tooltip explaining the calculation.              |           |
| 10.5  | Chart: submissions by day                                               | Recharts LineChart; x-axis Gregorian dates; missing days render as 0 (not gap). RTL-aware axis (right-origin in Arabic).                                                          |           |
| 10.6  | Chart: rejection reason breakdown                                       | Horizontal bar chart with top-10 reasons. "Other (N)" bar catches remainder. Uses token-based colours, not hardcoded hex.                                                         |           |
| 10.7  | Export CSV button (if present)                                          | Downloads `admissions-analytics-{date}.csv`. Content-Type `text/csv`. Rows include a header + per-day tallies.                                                                    |           |
| 10.8  | Role `front_office`                                                     | Page visible.                                                                                                                                                                     |           |
| 10.9  | Role `teacher`                                                          | Direct URL → 403; UI redirects.                                                                                                                                                   |           |
| 10.10 | Invalid `date_from` (malformed ISO) inserted via URL query manipulation | Backend returns 400 with Zod error `{ code: 'BAD_REQUEST', message: 'Invalid date' }`; UI shows banner "Invalid filter" and resets to defaults.                                   |           |

---

## 11. Form Preview — `/admissions/form-preview` <a id="11-form-preview"></a>

Backend: `GET /v1/admission-forms/system` (`admissions.view`).

| #    | What to Check                                  | Expected Result                                                                                                                                                                                                                                                                                                                                     | Pass/Fail |
| ---- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Page load                                      | 200 response with form definition + fields. Preview renders exactly how the public applicant will see it: household section, students section repeater (max 20), consents block.                                                                                                                                                                    |           |
| 11.2 | Field-type rendering                           | One visible example per `ApplicationFieldType`: short_text → single-line input; long_text → textarea; number → numeric input; date → date picker; boolean / yes_no → radio / switch; single_select → dropdown; multi_select → multi-pick pills; phone → phone input (LTR); email → email input (LTR); country → country selector with 2-char codes. |           |
| 11.3 | Required fields                                | Marker (red asterisk) next to label. Submitting an empty required field on this preview (it's a preview, so submission disabled) shows field-level hint "This field is required" styled identically to the real public form.                                                                                                                        |           |
| 11.4 | Conditional visibility                         | Fields with `conditional_visibility_json` honour the rule: e.g. "has_allergies: yes" reveals a follow-up textarea for details. Test by toggling the boolean — the dependent field appears/disappears live.                                                                                                                                          |           |
| 11.5 | Rebuild form action (only `admissions.manage`) | Button "Rebuild form" calls `POST /v1/admission-forms/system/rebuild`. Response 200 with new form definition. UI reloads preview; toast "Form rebuilt (version {N})".                                                                                                                                                                               |           |
| 11.6 | Rebuild as `front_office`                      | Button is HIDDEN; direct POST returns 403.                                                                                                                                                                                                                                                                                                          |           |
| 11.7 | Version bump visible                           | Preview header shows `version_number`; after rebuild the number increments by 1.                                                                                                                                                                                                                                                                    |           |
| 11.8 | Arabic                                         | Labels and help text render in Arabic if translation keys are set; otherwise falls back to English with no ghost keys visible.                                                                                                                                                                                                                      |           |
| 11.9 | Preview submission (should be disabled)        | No Submit button rendered; if one appears it should show tooltip "Preview only — submit via the public form".                                                                                                                                                                                                                                       |           |

---

## 12. Admissions Settings — `/admissions/settings` <a id="12-admissions-settings"></a>

Backend: `GET /v1/settings/admissions` / `PATCH /v1/settings/admissions` (permission `admissions.manage`). (Lives in settings module — admissions surfaces its subset.)

| #     | What to Check                                           | Expected Result                                                                                                                                                                                                    | Pass/Fail |
| ----- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 12.1  | Page load                                               | Form pre-populated with tenant settings: `upfront_percentage` (0-100 integer), `payment_window_days` (1-90 integer), `allow_cash` (bool), `allow_bank_transfer` (bool), `require_override_approval_role` (select). |           |
| 12.2  | Change `upfront_percentage` to 150                      | Zod schema rejects with inline error "Must be between 0 and 100"; Save button disabled.                                                                                                                            |           |
| 12.3  | Change `payment_window_days` to 0                       | Inline error "Must be ≥ 1".                                                                                                                                                                                        |           |
| 12.4  | Change `payment_window_days` to 365                     | Inline error "Must be ≤ 90".                                                                                                                                                                                       |           |
| 12.5  | Toggle `allow_cash=false`                               | Save → 200. Subsequently, on conditional-approval queue (§7.5) the "Record cash" kebab item must be hidden.                                                                                                        |           |
| 12.6  | Toggle `allow_bank_transfer=false`                      | Save → 200. "Record bank transfer" item hidden in §7.6.                                                                                                                                                            |           |
| 12.7  | Both `allow_cash=false` and `allow_bank_transfer=false` | Valid; UI shows warning banner "Only Stripe payments enabled — ensure Stripe keys are configured". Admin-override path still allowed.                                                                              |           |
| 12.8  | Change `require_override_approval_role` to `teacher`    | Select only offers roles with a role_id that exists. "teacher" is not in the override-eligible list per backend validation — selector doesn't show it.                                                             |           |
| 12.9  | Role `front_office`                                     | Page is forbidden; direct URL returns 403; UI navigates back to hub with toast.                                                                                                                                    |           |
| 12.10 | Save success toast                                      | "Admissions settings updated." Plus console.log-level info if instrumented; no error in console.                                                                                                                   |           |
| 12.11 | Network failure on save                                 | Toast "Failed to save — please retry". Settings form re-enables for edit.                                                                                                                                          |           |

---

## 13. Application Detail — Header & Meta Strip <a id="13-detail-header"></a>

Route: `/admissions/:id`. Backend: `GET /v1/applications/:id` (`admissions.view`).

| #     | What to Check                                            | Expected Result                                                                                                                                                                                                                                                       | Pass/Fail |
| ----- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1  | Header content                                           | Shows student full name (first + middle + last); `application_number` (monospace, LTR); current status badge (coloured per state: submitted=grey, waiting_list=blue, ready_to_admit=teal, conditional_approval=amber, approved=green, rejected=red, withdrawn=slate). |           |
| 13.2  | Meta strip                                               | Sub-header row with: date of birth (if captured), target academic year + year group, submitted by parent (name + email, email LTR), apply_date, last reviewed_at + reviewed_by user name.                                                                             |           |
| 13.3  | Capacity panel                                           | Right-hand panel (below meta) shows current seat availability for this year group (same data shape as capacity chip in §5.4). Updates live on action (e.g. after moving to conditional_approval, available drops by 1).                                               |           |
| 13.4  | Tabs — Application, Timeline, Notes, Payment             | Four tabs. Active tab underlined. Tab labels localised. Payment tab hidden for terminal states that never had payment (rare edge).                                                                                                                                    |           |
| 13.5  | Status transition buttons                                | Buttons render per state (see §§18–21). Disabled buttons include tooltip explaining WHY ("Cannot approve from submitted — must move to ready_to_admit first").                                                                                                        |           |
| 13.6  | 404 on unknown id                                        | Page renders "Application not found" with back-to-queue CTA. Backend returns 404 `APPLICATION_NOT_FOUND`.                                                                                                                                                             |           |
| 13.7  | 404 on malformed id (`/admissions/not-a-uuid`)           | Backend `ParseUUIDPipe` returns 400 `BAD_UUID`. Frontend shows 404 page (same shell).                                                                                                                                                                                 |           |
| 13.8  | Optimistic-concurrency `expected_updated_at` is captured | On page load the frontend stashes `application.updated_at` in state for later PATCH calls (see §22, §23). Verify via devtools React state inspector or network payload on next mutation.                                                                              |           |
| 13.9  | Cross-tenant — open Tenant A detail with Tenant B token  | 404 `APPLICATION_NOT_FOUND`. UI shows "Application not found" page. NEVER 200 with Tenant B data.                                                                                                                                                                     |           |
| 13.10 | Deep-link preservation on refresh                        | Refresh (F5) re-loads the same application. URL remains `/admissions/:id`.                                                                                                                                                                                            |           |

---

## 14. Application Detail — Application Tab <a id="14-detail-application"></a>

Backend: `GET /v1/applications/:id/preview` feeds this tab (permission `admissions.view`).

| #    | What to Check                                                         | Expected Result                                                                                                                                                                                                        | Pass/Fail |
| ---- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1 | Tab content                                                           | Renders the applicant's submitted payload field-by-field in two columns at desktop / single column at 375px. Reused form-field-type renderers from §11.                                                                |           |
| 14.2 | Consent block                                                         | Shows `consents` JSON interpreted: Health Data (Yes/No), WhatsApp channel (Yes/No), AI Features (grading/comments/risk/progress — each Yes/No). Dates captured at time of submission.                                  |           |
| 14.3 | Multiple students in same batch                                       | If `submission_batch_id` is set AND other applications share it, panel shows "Sibling applications (N): " with chips linking to each sibling's detail page. Hover tooltip on each chip shows sibling's status.         |           |
| 14.4 | Fields hidden from staff (`visible_to_staff=false`)                   | NOT rendered. Verify with a seeded field that has `visible_to_staff=false` — it must not appear in the panel even in raw JSON view.                                                                                    |           |
| 14.5 | Field rendering correctness                                           | Each field type renders read-only: number as formatted number, date in Gregorian LTR format, phone with country code prefix LTR, yes_no as chip, long_text with whitespace preserved, multi_select as comma-separated. |           |
| 14.6 | XSS payload in a free-text field (seeded `<script>alert(1)</script>`) | Rendered as escaped text; no script execution; console clean. (Deeper XSS / stored-XSS coverage in security spec.)                                                                                                     |           |
| 14.7 | Print / export (if CTA exists)                                        | CTA "Print" opens browser print dialog with the tab contents laid out paginated. CTA "Export PDF" (if present) calls `GET /v1/applications/:id/preview?format=pdf` — verify Content-Type `application/pdf`.            |           |
| 14.8 | Loading state                                                         | Skeleton for 4 field rows until preview data arrives.                                                                                                                                                                  |           |

---

## 15. Application Detail — Timeline Tab <a id="15-detail-timeline"></a>

Backend: timeline is derived from ApplicationNote + status-transition events stored on the application row.

| #     | What to Check                                           | Expected Result                                                                                                                                                                                         | Pass/Fail |
| ----- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1  | Tab load                                                | Vertical timeline, most-recent-first. Each entry: timestamp (ISO + relative "2 hours ago"), actor name + role, event type label, plus detail body where present (e.g. rejection reason, override type). |           |
| 15.2  | Submitted event                                         | Entry: "Application submitted by {parent_name}" with apply_date timestamp.                                                                                                                              |           |
| 15.3  | Auto-route event                                        | Entry: "Auto-routed to {ready_to_admit or waiting_list}" with reason ("capacity available" or "queue full").                                                                                            |           |
| 15.4  | Moved to conditional_approval event                     | Entry: "Moved to Conditional Approval by {actor}" with payment_amount (formatted currency) and payment_deadline.                                                                                        |           |
| 15.5  | Payment received (Stripe)                               | Entry: "Stripe payment completed — {amount}" with reference to `AdmissionsPaymentEvent.id`.                                                                                                             |           |
| 15.6  | Cash payment recorded                                   | Entry: "Cash payment recorded by {actor}: {amount}, receipt #{receipt_number or '—'}".                                                                                                                  |           |
| 15.7  | Bank transfer recorded                                  | Entry: "Bank transfer recorded by {actor}: {amount}, reference {transfer_reference}, date {transfer_date}".                                                                                             |           |
| 15.8  | Force approve override                                  | Entry: "Admission override by {actor} — Type: {full_waiver/partial_waiver/deferred_payment}. Justification: {justification}". Actor role must be authorised per tenant settings.                        |           |
| 15.9  | Auto-promoted from waiting_list                         | Entry: "Promoted to Ready to Admit (seat freed by payment-window expiry of application #{other_app_number})".                                                                                           |           |
| 15.10 | Manually promoted                                       | Entry: "Manually promoted by {actor}. Justification: {justification}".                                                                                                                                  |           |
| 15.11 | Rejected                                                | Entry: "Rejected by {actor}. Reason: {rejection_reason}".                                                                                                                                               |           |
| 15.12 | Withdrawn by parent                                     | Entry: "Withdrawn by parent {parent_name}".                                                                                                                                                             |           |
| 15.13 | Withdrawn by staff                                      | Entry: "Withdrawn by {actor} (staff)".                                                                                                                                                                  |           |
| 15.14 | Reverted to waiting_list (payment expiry cron)          | Entry: "Reverted to Waiting List by System (reason: payment_expired). Seat released." Actor attribution: original approver ID.                                                                          |           |
| 15.15 | Timezone display                                        | All timestamps render in tenant timezone with tz abbreviation, or in the user's browser tz with abbreviation. Stored UTC — consistent with API value.                                                   |           |
| 15.16 | Timeline pagination / virtualisation for long histories | For > 50 events, either paginated (load more) or virtualised scroll. No performance cliff.                                                                                                              |           |
| 15.17 | Empty state                                             | Never empty for real applications (at minimum the submission event exists). If timeline blank, flag as data corruption.                                                                                 |           |

---

## 16. Application Detail — Notes Tab <a id="16-detail-notes"></a>

Backend: `GET /v1/applications/:applicationId/notes` / `POST /v1/applications/:applicationId/notes` (`admissions.view` / `admissions.manage`).

| #     | What to Check                                           | Expected Result                                                                                                                                                                                           | Pass/Fail |
| ----- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1  | Tab load                                                | List of notes, newest-first. Each row: author name + role, timestamp (relative + absolute), note body, `is_internal` chip (green "Internal" or blue "Parent-visible").                                    |           |
| 16.2  | New-note composer                                       | Textarea (10,000 char max — client-side counter). Toggle "Parent can see this note". Save → `POST /v1/applications/:applicationId/notes` payload `{ note, is_internal }`.                                 |           |
| 16.3  | Save success                                            | Toast "Note added". Composer clears. List pre-pends the new note without full reload.                                                                                                                     |           |
| 16.4  | Server error on save                                    | Toast "Failed to add note" with console error; composer retains content for retry.                                                                                                                        |           |
| 16.5  | Empty note submit                                       | Save disabled; Zod schema requires note length ≥ 1.                                                                                                                                                       |           |
| 16.6  | Role `front_office`                                     | List visible; composer HIDDEN (no `admissions.manage`). Direct POST returns 403.                                                                                                                          |           |
| 16.7  | Role `front_office` attempting to hit POST via devtools | 403 `PERMISSION_DENIED`. No row inserted (verify via re-GET).                                                                                                                                             |           |
| 16.8  | System-generated notes                                  | Notes created by the state machine (e.g. "Reverted to waiting list — reason payment_expired") appear in list with author = System (or the responsible admin's user id, per §15.14 rules). Badge "System". |           |
| 16.9  | Note character limit                                    | 10,000 char max; 10,001 char input blocked at client; server also rejects with 400 if bypassed.                                                                                                           |           |
| 16.10 | XSS payload in note body                                | Saved as-is in DB. On render, escaped; no script execution. (Exhaustive XSS in security spec.)                                                                                                            |           |
| 16.11 | Internal note visible only to staff                     | Log in as parent who submitted the application → parent portal (`/applications/:id`) does NOT show `is_internal=true` notes. Verify via network response filtering.                                       |           |
| 16.12 | Append-only: note cannot be edited or deleted           | No edit/delete affordance in the UI. No `PATCH /v1/applications/:appId/notes/:id` endpoint exists; attempting returns 404.                                                                                |           |

---

## 17. Application Detail — Payment Tab <a id="17-detail-payment"></a>

Backend data comes from `application` row + `AdmissionsPaymentEvent` history.

| #     | What to Check                                                                                       | Expected Result                                                                                                                                                                                   | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1  | Tab load — `conditional_approval` state                                                             | Section: Expected amount (currency + formatted), Payment deadline (absolute + countdown), Payment link (if `stripe_checkout_session_id` is set) with "Copy link" and "Open link" buttons.         |           |
| 17.2  | Tab load — `approved` state                                                                         | Section: Amount received, source (Stripe/cash/bank transfer/override), received_at timestamp, reference (Stripe event id / receipt_number / transfer_reference / override justification excerpt). |           |
| 17.3  | Payment-events list                                                                                 | Table of `AdmissionsPaymentEvent` rows per application: stripe_event_id (last 8 chars), amount, status (succeeded / failed / received_out_of_band), created_at. Newest first.                     |           |
| 17.4  | Regenerate link button (when `conditional_approval`)                                                | Calls `POST /v1/applications/:id/payment-link/regenerate`. On 200, tab re-fetches; `stripe_checkout_session_id` changes. Toast "Payment link regenerated and emailed".                            |           |
| 17.5  | Regenerate link on `approved` state                                                                 | Button HIDDEN; if POSTed directly, backend returns 400 `INVALID_STATUS` (`application.status` must be `conditional_approval`).                                                                    |           |
| 17.6  | Regenerate link with no Stripe keys configured                                                      | Backend returns 400/412 with code `STRIPE_NOT_CONFIGURED`. Toast explains and links to settings.                                                                                                  |           |
| 17.7  | Copy link                                                                                           | Copies full checkout URL to clipboard. Toast "Payment link copied".                                                                                                                               |           |
| 17.8  | Open link                                                                                           | Opens Stripe Checkout in a new tab. Tab shows the session with correct tenant + amount + currency.                                                                                                |           |
| 17.9  | Record cash (shortcut from tab)                                                                     | Opens `RecordCashModal` (§24). Upon completion, tab reloads and shows approved-state content.                                                                                                     |           |
| 17.10 | Record bank transfer (shortcut from tab)                                                            | Opens `RecordBankTransferModal` (§25). Same outcome.                                                                                                                                              |           |
| 17.11 | Cross-tenant: Tenant A admin attempts `POST /v1/applications/{tenant_b_id}/payment-link/regenerate` | 404 `APPLICATION_NOT_FOUND`. Zero side effect on Tenant B's application (verify via re-GET of B's app — `stripe_checkout_session_id` unchanged).                                                  |           |
| 17.12 | Out-of-band Stripe event arrived earlier                                                            | If `AdmissionsPaymentEvent.status='received_out_of_band'` exists, event-list row shows a distinct badge "Out of band" and an explanatory tooltip. No duplicate row gets created on replay.        |           |
| 17.13 | Role `front_office`                                                                                 | Tab visible. All mutating buttons (regenerate, record cash/bank) HIDDEN.                                                                                                                          |           |

---

## 18. Detail Actions — `ready_to_admit` state <a id="18-actions-ready-to-admit"></a>

| #    | What to Check                                                                                                        | Expected Result                                                                                                                                                                                                                                                                                                                        | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1 | Buttons visible                                                                                                      | "Approve → Conditional Approval", "Reject", "Withdraw".                                                                                                                                                                                                                                                                                |           |
| 18.2 | Approve with no fee structure on the year group                                                                      | Backend returns 400 `NO_FEE_STRUCTURE_CONFIGURED` — toast "Cannot approve: no fee structure configured for this year group". Application stays in `ready_to_admit`. No seat consumption.                                                                                                                                               |           |
| 18.3 | Approve while seats are consumed concurrently                                                                        | If between page load and click another app was moved to conditional_approval and no seats remain, backend returns 400 `NO_AVAILABLE_SEATS`. Toast explains. State unchanged.                                                                                                                                                           |           |
| 18.4 | Approve success path                                                                                                 | `POST /v1/applications/:id/review { status: 'conditional_approval', expected_updated_at }` returns 200 with updated application. UI re-renders: status badge → amber "Conditional Approval". `payment_amount_cents` and `payment_deadline` populated. Timeline adds entry (§15.4). Payment-link worker job enqueued (see worker spec). |           |
| 18.5 | Approve with stale `expected_updated_at` (simulate by waiting then patching another field first from second session) | 409 `CONCURRENT_MODIFICATION`. Toast "Application was updated by someone else — please refresh". UI re-fetches.                                                                                                                                                                                                                        |           |
| 18.6 | Reject                                                                                                               | Opens RejectDialog (§22). Valid per state machine: `ready_to_admit → rejected`.                                                                                                                                                                                                                                                        |           |
| 18.7 | Withdraw (staff)                                                                                                     | Confirm dialog. `POST /v1/applications/:id/withdraw` — 200. Status → `withdrawn` (terminal). Seat released. Auto-promotion may follow.                                                                                                                                                                                                 |           |
| 18.8 | Permission — `front_office`                                                                                          | All three buttons HIDDEN. Direct `POST /v1/applications/:id/review` returns 403.                                                                                                                                                                                                                                                       |           |

---

## 19. Detail Actions — `conditional_approval` state <a id="19-actions-conditional-approval"></a>

| #     | What to Check                                         | Expected Result                                                                                                                                                                                                                           | Pass/Fail |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1  | Buttons visible                                       | "Record cash payment" (if `allow_cash`), "Record bank transfer" (if `allow_bank_transfer`), "Force approve with override" (if current user has required role), "Regenerate payment link", "Revert to waiting list", "Reject", "Withdraw". |           |
| 19.2  | Record cash success                                   | `POST /v1/applications/:id/payment/cash` 200. Status → `approved`. Timeline + payment tab update. Invoice + Payment + Allocation created (finance bridge).                                                                                |           |
| 19.3  | Record bank transfer success                          | `POST /v1/applications/:id/payment/bank-transfer` 200. Status → `approved`. Finance records created with `payment_source='bank_transfer'`.                                                                                                |           |
| 19.4  | Force approve success (with authorised role)          | `POST /v1/applications/:id/payment/override` 200. Status → `approved`. AdmissionOverride row created with `override_type`, `actual_amount_collected_cents`, `justification`. Timeline entry (§15.8).                                      |           |
| 19.5  | Force approve when role is insufficient               | Button HIDDEN; direct POST returns 403 `PERMISSION_DENIED` with message referencing `require_override_approval_role`.                                                                                                                     |           |
| 19.6  | Revert to waiting_list                                | `POST /v1/applications/:id/review { status: 'waiting_list' }` 200. Status → `waiting_list`. `payment_amount_cents` and `payment_deadline` cleared. Seat released. Auto-promotion may run.                                                 |           |
| 19.7  | Reject                                                | RejectDialog opens. State machine allows `conditional_approval → rejected`. On success, seat released.                                                                                                                                    |           |
| 19.8  | Withdraw                                              | State machine allows `conditional_approval → withdrawn`. On success, seat released.                                                                                                                                                       |           |
| 19.9  | Approve directly to `approved` via `/review` endpoint | 400 `INVALID_STATUS_TRANSITION`. `review` endpoint only reaches `approved` via payment / override paths — skipping payment is deliberately impossible from `review`.                                                                      |           |
| 19.10 | Record cash when `allow_cash=false`                   | Button HIDDEN; direct POST returns 400 `CASH_PAYMENT_DISABLED`. No status change, no finance writes.                                                                                                                                      |           |
| 19.11 | Record bank transfer when `allow_bank_transfer=false` | Button HIDDEN; direct POST returns 400 `BANK_TRANSFER_DISABLED`.                                                                                                                                                                          |           |
| 19.12 | Amount paid ≠ expected (cash)                         | See §24 for modal-level validation. Service enforces `amount_cents >= 1` integer; partial handling depends on tenant policy — default behaviour: must equal `application.payment_amount_cents` otherwise 400 `AMOUNT_MISMATCH`.           |           |

---

## 20. Detail Actions — `waiting_list` state <a id="20-actions-waiting-list"></a>

| #    | What to Check                                                   | Expected Result                                                                                                                                  | Pass/Fail |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 20.1 | Buttons visible                                                 | "Manually promote to Ready-to-Admit" (requires `admissions.manage` + justification), "Reject", "Withdraw".                                       |           |
| 20.2 | Manual promote — seats available                                | Opens ManualPromoteDialog (§26). On confirm, `POST /v1/applications/:id/manual-promote` 200. Status → `ready_to_admit`. Timeline entry §15.10.   |           |
| 20.3 | Manual promote — seats unavailable                              | Backend 400 `NO_AVAILABLE_SEATS`. Dialog shows error and remains open.                                                                           |           |
| 20.4 | Manual promote — `waiting_list_substatus='awaiting_year_setup'` | Backend 400 `YEAR_GROUP_NOT_SET_UP`. Toast "Year group has no classes configured yet — configure classes before promoting".                      |           |
| 20.5 | Reject                                                          | Valid transition. RejectDialog.                                                                                                                  |           |
| 20.6 | Withdraw                                                        | Valid transition. Status → `withdrawn` (terminal).                                                                                               |           |
| 20.7 | Promote with justification < 10 chars                           | Backend 400 with Zod error `{ code: 'BAD_REQUEST', message: 'justification must be at least 10 characters' }`. Dialog renders field-level error. |           |
| 20.8 | Promote with justification > 2000 chars                         | Backend 400. Dialog shows inline char-count warning before submission (client enforces < 2000).                                                  |           |

---

## 21. Detail Actions — `approved` / terminal states <a id="21-actions-terminal"></a>

| #    | What to Check                                            | Expected Result                                                                                                                 | Pass/Fail |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.1 | Approved state buttons                                   | No mutating buttons. Detail page shows "Application is approved — linked to Student {student_number}". Link to Students module. |           |
| 21.2 | Rejected state buttons                                   | No mutating buttons. Rejection reason displayed. Link to Rejected Archive.                                                      |           |
| 21.3 | Withdrawn state buttons                                  | No mutating buttons. "Withdrawn by {parent / actor}" shown.                                                                     |           |
| 21.4 | Any `POST /v1/applications/:id/review` on terminal state | 400 `INVALID_STATUS_TRANSITION`.                                                                                                |           |
| 21.5 | Any payment POST on terminal state                       | 400 `INVALID_STATUS`. No writes.                                                                                                |           |
| 21.6 | Any manual-promote POST on terminal state                | 400 `INVALID_STATUS_TRANSITION`.                                                                                                |           |
| 21.7 | Cross-linking from terminal state (approved → student)   | `materialised_student_id` non-null; link is clickable; navigates to `/students/:id` within same tenant.                         |           |

---

## 22. Reject Dialog <a id="22-reject-dialog"></a>

Open path: §18, §19, §20 or queue kebab.

| #    | What to Check                                                      | Expected Result                                                                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 22.1 | Dialog content                                                     | Title "Reject application {application_number}", required textarea for reason, Cancel + Reject buttons.                                                                                                  |           |
| 22.2 | Required reason                                                    | Submit disabled until reason has ≥ 1 char. Max 5,000 chars (counter visible after 4,800).                                                                                                                |           |
| 22.3 | Submit success                                                     | `POST /v1/applications/:id/review { status: 'rejected', expected_updated_at, rejection_reason }` 200. Dialog closes; page re-fetches. Seat released if state was ready_to_admit or conditional_approval. |           |
| 22.4 | Reject from invalid state (e.g. `approved`) via URL-forged request | 400 `INVALID_STATUS_TRANSITION`.                                                                                                                                                                         |           |
| 22.5 | `expected_updated_at` stale                                        | 409 `CONCURRENT_MODIFICATION`. Dialog shows banner "Application was updated by another user". Tester instructed to close and retry.                                                                      |           |
| 22.6 | Cancel                                                             | Dialog closes; no mutation.                                                                                                                                                                              |           |
| 22.7 | Permission — `front_office` opening dialog                         | Dialog not openable (trigger hidden). Direct POST returns 403.                                                                                                                                           |           |
| 22.8 | Reason with XSS payload                                            | Saved; rendered escaped on timeline + rejected archive.                                                                                                                                                  |           |
| 22.9 | Dialog a11y                                                        | First focusable element (reason textarea) focused on open. Escape closes. Aria-labels present. Trap focus within dialog.                                                                                 |           |

---

## 23. Force-Approve-with-Override Modal <a id="23-force-approve-modal"></a>

Open path: conditional_approval queue or detail (§19.4). Two variants — detail modal (`[id]/_components/force-approve-modal.tsx`) and queue modal (shared `_components/force-approve-modal.tsx`).

| #     | What to Check                                           | Expected Result                                                                                                                                                                                                                                                                                                                                      | Pass/Fail |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 23.1  | Dialog content                                          | Title "Force approve with override". Fields: `override_type` radio (full_waiver, partial_waiver, deferred_payment), `actual_amount_collected_cents` number (shown in currency units), `justification` textarea (≥ 20 chars, ≤ 2000 chars). Cancel + Approve buttons. Warning banner "This action is audited. It bypasses normal payment processing." |           |
| 23.2  | `override_type='full_waiver'`                           | `actual_amount_collected_cents` auto-sets to 0 and becomes read-only. Justification still required.                                                                                                                                                                                                                                                  |           |
| 23.3  | `override_type='partial_waiver'` with amount > expected | Inline error "Must be ≤ expected amount ({amount})". Submit disabled.                                                                                                                                                                                                                                                                                |           |
| 23.4  | `override_type='deferred_payment'`                      | `actual_amount_collected_cents` can be 0. Justification must describe the payment plan.                                                                                                                                                                                                                                                              |           |
| 23.5  | Justification < 20 chars                                | Client + server 400. Message "Justification must be at least 20 characters".                                                                                                                                                                                                                                                                         |           |
| 23.6  | Submit success                                          | `POST /v1/applications/:id/payment/override` 200. Modal closes. Status → `approved`. AdmissionOverride row created. Finance records created. Timeline entry §15.8.                                                                                                                                                                                   |           |
| 23.7  | Submit by user without required role                    | Button HIDDEN. Direct POST returns 403 `PERMISSION_DENIED` with code referencing `require_override_approval_role`.                                                                                                                                                                                                                                   |           |
| 23.8  | Submit twice (double-click)                             | Idempotent: only one `AdmissionOverride` created (guard via optimistic lock and button-disabled-on-submit). Second click either disabled or returns 409 `CONCURRENT_MODIFICATION`.                                                                                                                                                                   |           |
| 23.9  | XSS payload in justification                            | Saved; rendered escaped on timeline and overrides list.                                                                                                                                                                                                                                                                                              |           |
| 23.10 | `override_type` out of enum                             | Backend 400 Zod error. UI radio group does not allow invalid values.                                                                                                                                                                                                                                                                                 |           |
| 23.11 | Application in non-`conditional_approval` state         | Modal-trigger HIDDEN. Direct POST returns 400 `INVALID_STATUS`.                                                                                                                                                                                                                                                                                      |           |

---

## 24. Record Cash Payment Modal <a id="24-record-cash-modal"></a>

Path: conditional_approval queue or detail (§19.2). Component: `[id]/_components/record-cash-modal.tsx` (detail) and `_components/payment-record-modal.tsx` (queue).

| #     | What to Check                       | Expected Result                                                                                                                                                                                       | Pass/Fail |
| ----- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 24.1  | Dialog content                      | Title "Record cash payment". Fields: `amount_cents` (displayed in currency units, integer cents under the hood), `receipt_number` (optional, ≤ 100 chars), `notes` (optional, ≤ 1000). Cancel + Save. |           |
| 24.2  | Amount pre-filled with expected     | Prefilled with `application.payment_amount_cents` when modal opens.                                                                                                                                   |           |
| 24.3  | Amount = 0                          | Zod: 400 "Must be > 0". Save disabled.                                                                                                                                                                |           |
| 24.4  | Amount negative                     | Same.                                                                                                                                                                                                 |           |
| 24.5  | Amount not integer cents (0.125)    | Zod: 400 "Must be an integer number of cents" — currency-unit input rounds to cents before submit; if raw cents input, non-int rejected.                                                              |           |
| 24.6  | Receipt number > 100 chars          | Inline error "Max 100 characters".                                                                                                                                                                    |           |
| 24.7  | Notes > 1000 chars                  | Inline error "Max 1000 characters".                                                                                                                                                                   |           |
| 24.8  | Save success                        | 200. Status → `approved`. Payment tab reloads. Timeline entry §15.6. Finance records created.                                                                                                         |           |
| 24.9  | Save when tenant `allow_cash=false` | Trigger was hidden; direct POST returns 400 `CASH_PAYMENT_DISABLED`. No writes.                                                                                                                       |           |
| 24.10 | Save on non-conditional_approval    | 400 `INVALID_STATUS`.                                                                                                                                                                                 |           |
| 24.11 | Permission `front_office`           | Trigger HIDDEN. Direct POST 403.                                                                                                                                                                      |           |

---

## 25. Record Bank-Transfer Modal <a id="25-record-bank-transfer-modal"></a>

Path: §19.3. Component: `[id]/_components/record-bank-transfer-modal.tsx`.

| #    | What to Check                                                  | Expected Result                                                                                                                                                                                             | Pass/Fail |
| ---- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 25.1 | Dialog content                                                 | Title "Record bank transfer". Fields: `amount_cents` (currency display), `transfer_reference` (required, 1-100 chars), `transfer_date` (date picker, required, must be ≤ today), `notes` (optional ≤ 1000). |           |
| 25.2 | Empty `transfer_reference`                                     | Save disabled; inline "Required".                                                                                                                                                                           |           |
| 25.3 | `transfer_date` > today                                        | Inline "Cannot be in the future".                                                                                                                                                                           |           |
| 25.4 | `transfer_date` before a plausible window (e.g. > 90 days old) | Inline warning "More than 90 days ago — please confirm" (soft warn, not block). Save still allowed.                                                                                                         |           |
| 25.5 | Amount rules                                                   | Same as §24 amount rules.                                                                                                                                                                                   |           |
| 25.6 | Save success                                                   | 200. Status → `approved`. Timeline §15.7.                                                                                                                                                                   |           |
| 25.7 | Save when tenant `allow_bank_transfer=false`                   | Trigger hidden; direct POST 400 `BANK_TRANSFER_DISABLED`.                                                                                                                                                   |           |
| 25.8 | Permission `front_office`                                      | Trigger hidden. Direct POST 403.                                                                                                                                                                            |           |

---

## 26. Manual Promote Dialog <a id="26-manual-promote-dialog"></a>

Path: §6.3, §20.2. Component: `_components/manual-promote-dialog.tsx`.

| #    | What to Check             | Expected Result                                                                                                                                                      | Pass/Fail |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 26.1 | Dialog content            | Title "Manually promote to Ready-to-Admit". Warning: "This overrides FIFO order. The action is audited." Textarea `justification` (10-2000 chars). Cancel + Confirm. |           |
| 26.2 | Confirm                   | `POST /v1/applications/:id/manual-promote { justification }` 200. Dialog closes. Status → `ready_to_admit`.                                                          |           |
| 26.3 | No capacity               | Confirm returns 400 `NO_AVAILABLE_SEATS`. Dialog shows inline error and remains open.                                                                                |           |
| 26.4 | Awaiting year-setup       | 400 `YEAR_GROUP_NOT_SET_UP`.                                                                                                                                         |           |
| 26.5 | Justification < 10        | Zod 400. Inline error.                                                                                                                                               |           |
| 26.6 | Justification > 2000      | Inline error pre-submit.                                                                                                                                             |           |
| 26.7 | Permission `front_office` | Trigger hidden. Direct POST 403.                                                                                                                                     |           |
| 26.8 | Justification with XSS    | Saved; rendered escaped on timeline.                                                                                                                                 |           |

---

## 27. Queue Components — shared primitives <a id="27-queue-components"></a>

Co-located at `apps/web/src/app/[locale]/(school)/admissions/_components/`.

### 27.1 ApplicationRow

| #      | What to Check | Expected Result                                                                                                               | Pass/Fail |
| ------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 27.1.1 | Row render    | Student name LTR; application_number monospace; apply_date Gregorian. Row is keyboard-focusable, Enter → navigates to detail. |           |
| 27.1.2 | Kebab menu    | Keyboard-accessible (open with Enter or Space). Menu items render per state (see §§18-20).                                    |           |
| 27.1.3 | Hover state   | Row shows background accent; no layout shift.                                                                                 |           |
| 27.1.4 | 375px layout  | Row collapses to stacked layout with application_number + name on line 1, year group + date on line 2, kebab aligned end.     |           |

### 27.2 CapacityChip

| #      | What to Check          | Expected Result                                                        | Pass/Fail |
| ------ | ---------------------- | ---------------------------------------------------------------------- | --------- |
| 27.2.1 | Green zone             | `available / total` ≥ 50% free → green text + bg-green-subtle.         |           |
| 27.2.2 | Amber zone             | 10-49% free → amber.                                                   |           |
| 27.2.3 | Red zone               | 0-9% free → red.                                                       |           |
| 27.2.4 | Destructive zone       | 0 free → destructive red; text "Full".                                 |           |
| 27.2.5 | No capacity configured | Grey; text "No capacity configured".                                   |           |
| 27.2.6 | Tooltip on hover       | "Enrolled: {X}, Holding seat (conditional): {Y}, Total capacity: {Z}". |           |

### 27.3 QueueHeader

| #      | What to Check                         | Expected Result                                                       | Pass/Fail |
| ------ | ------------------------------------- | --------------------------------------------------------------------- | --------- |
| 27.3.1 | Sticky on scroll                      | Queue header + capacity chip sticks to top when scrolling long queue. |           |
| 27.3.2 | Year-group name, academic year, count | Header text: "{year_group_name} — {academic_year_label} — {count}".   |           |

### 27.4 PaymentRecordModal (queue-level, shared dialog)

Same behaviour as §§24, 25 — verify the shared modal is used correctly from queue context and that it passes tenant-level flags (`allow_cash`/`allow_bank_transfer`) correctly.

### 27.5 ForceApproveModal (queue-level)

Same as §23 — verify the queue-invocation variant passes the application context correctly (application_id, expected_amount_cents).

### 27.6 RejectDialog (queue-level)

Same as §22 — verify reuse from queue context.

---

## 28. State Machine — full transition graph <a id="28-state-machine"></a>

Source: `application-state-machine.service.ts` VALID_TRANSITIONS map.

```
submitted → [ready_to_admit, waiting_list]
waiting_list → [ready_to_admit, rejected, withdrawn]
ready_to_admit → [conditional_approval, rejected, withdrawn]
conditional_approval → [approved, waiting_list, rejected, withdrawn]
approved → []          (terminal)
rejected → []          (terminal)
withdrawn → []         (terminal)
```

Each row of this section is a **transition test** — the UI must either allow it successfully or block it with the correct error. This test is UI-driven; integration spec covers the same matrix via direct HTTP.

| #     | From → To                                              | Trigger                                                          | Expected Result                                                              | Pass/Fail |
| ----- | ------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| 28.1  | submitted → ready_to_admit                             | Auto (via `createPublic` when seats available)                   | Implicit during submission; no UI action. Verify via queue after submission. |           |
| 28.2  | submitted → waiting_list                               | Auto (seats full)                                                | Same.                                                                        |           |
| 28.3  | waiting_list → ready_to_admit                          | Manual promote (§26) OR auto-promotion (seat freed)              | Status changes. Timeline entry.                                              |           |
| 28.4  | waiting_list → rejected                                | Reject dialog (§22)                                              | Status → rejected. Reason captured.                                          |           |
| 28.5  | waiting_list → withdrawn                               | Withdraw button (detail) or parent self-service                  | Status → withdrawn. Seat not freed (was not holding).                        |           |
| 28.6  | ready_to_admit → conditional_approval                  | Approve (§18.4)                                                  | Status changes. Payment amount/deadline set. Seat held. Worker job queued.   |           |
| 28.7  | ready_to_admit → rejected                              | Reject                                                           | Rejected. Seat freed. Auto-promotion may trigger.                            |           |
| 28.8  | ready_to_admit → withdrawn                             | Withdraw                                                         | Withdrawn. Seat freed. Auto-promotion may trigger.                           |           |
| 28.9  | conditional_approval → approved                        | Payment (Stripe webhook, cash §19.2, bank §19.3, override §19.4) | Status → approved. Student materialised. Finance records created.            |           |
| 28.10 | conditional_approval → waiting_list                    | Revert (§19.6) OR cron expiry                                    | Status → waiting_list. Payment fields cleared. Seat freed.                   |           |
| 28.11 | conditional_approval → rejected                        | Reject                                                           | Rejected. Seat freed.                                                        |           |
| 28.12 | conditional_approval → withdrawn                       | Withdraw                                                         | Withdrawn. Seat freed.                                                       |           |
| 28.13 | INVALID: submitted → approved                          | `/review { status: 'approved' }` from submitted                  | 400 `INVALID_STATUS_TRANSITION`.                                             |           |
| 28.14 | INVALID: submitted → rejected                          | `/review { status: 'rejected' }` from submitted                  | 400 `INVALID_STATUS_TRANSITION`. (Reject valid only from later states.)      |           |
| 28.15 | INVALID: waiting_list → conditional_approval           | `/review` from waiting_list                                      | 400. Must manually promote first.                                            |           |
| 28.16 | INVALID: approved → anything                           | `/review` from approved                                          | 400.                                                                         |           |
| 28.17 | INVALID: rejected → anything                           | `/review` from rejected                                          | 400.                                                                         |           |
| 28.18 | INVALID: withdrawn → anything                          | `/review` from withdrawn                                         | 400.                                                                         |           |
| 28.19 | INVALID: ready_to_admit → approved (bypassing payment) | `/review { status: 'approved' }` from ready_to_admit             | 400 `INVALID_STATUS_TRANSITION` — approved only reachable via payment path.  |           |

---

## 29. End-to-End flows — 8 flows <a id="29-end-to-end-flows"></a>

Each flow is a scripted click-through — a tester opens a new browser session, follows the steps, and reports Pass/Fail on the final state + every intermediate assertion.

### 29.1 Flow A — New-family public application, auto-routes to ready_to_admit, approved via Stripe

1. Unauthenticated → navigate to `/en/apply/{tenant-a-slug}`.
2. Select "New family" mode.
3. Fill household payload + 1 student (national id, DOB, target year group `Year 1`).
4. Check consents. Submit.
5. Network: `POST /v1/public/admissions/applications` 201. Response includes created application id.
6. Redirect to `/apply/{tenant-a-slug}/submitted`.
7. Log in as Tenant A owner.
8. Dashboard shows ready-to-admit count increased by 1 (assuming Year 1 had available seats).
9. Navigate to Ready-to-Admit queue → find the new row (by application_number).
10. Open detail page. Application tab shows submitted data.
11. Click "Approve → Conditional Approval". Expected `payment_amount_cents` > 0. Toast "Approved".
12. Copy payment link from Payment tab. Open in a private tab. Complete Stripe checkout with test card `4242 4242 4242 4242`.
13. Back on staff view: Payment tab refreshes. Status → `approved`. AdmissionsPaymentEvent row with status `succeeded` added. Timeline entries for submission, route, approve, Stripe completion.

Pass/Fail:

### 29.2 Flow B — New-family public application auto-routes to waiting_list, then manual promote

1. Pre-seed: Year 1 capacity = 2; already has 2 ready_to_admit or enrolled.
2. Submit public application as in 29.1.
3. Staff view: new application shows up in waiting_list (FIFO).
4. Click "Manually promote"; enter justification "Exception approved by owner".
5. Verify status → `ready_to_admit`. Timeline entry §15.10.
6. Proceed to approve and pay as 29.1.

Pass/Fail:

### 29.3 Flow C — Cash payment from conditional_approval

1. Starting from a conditional_approval app in seeded fixtures.
2. Tenant A has `allow_cash=true`. Admin user with `admissions.manage` logged in.
3. Open Payment tab → click "Record cash payment".
4. Amount pre-filled with expected. Enter receipt_number `CASH-0001`. Save.
5. Network: `POST /v1/applications/:id/payment/cash` 200. Status → approved.
6. Verify timeline, payment tab, student materialised, finance invoice + payment + allocation created.

Pass/Fail:

### 29.4 Flow D — Bank transfer payment

1. Starting from conditional_approval. Tenant A `allow_bank_transfer=true`.
2. Click "Record bank transfer". Enter reference `BANK-REF-001`, transfer_date today.
3. Save → 200. Status → approved. Timeline §15.7.

Pass/Fail:

### 29.5 Flow E — Force approve with override

1. Starting from conditional_approval. User is `school_owner` (authorised in Tenant A).
2. Click "Force approve with override". Select `partial_waiver`, actual amount = 50% of expected, justification "Financial hardship documented by letter dated 2026-04-10, see attached email thread."
3. Save → 200. Status → approved. AdmissionOverride row created. Timeline §15.8.

Pass/Fail:

### 29.6 Flow F — Payment expiry and auto-revert to waiting_list

1. Pre-seed: a conditional_approval app with `payment_deadline = now() - 1 hour`.
2. Trigger cron manually via worker admin endpoint OR wait up to 15 min for `admissions:payment-expiry`.
3. Refresh staff Admissions view.
4. Verify original app → `waiting_list` with substatus. Seat released. Timeline entry §15.14.
5. If an auto-promotion candidate exists in same (year, year_group), verify that app → `ready_to_admit`. Timeline §15.9.

Pass/Fail:

### 29.7 Flow G — Rejection from ready_to_admit

1. Open a ready_to_admit app. Click "Reject".
2. Enter reason "Student is outside target age range for Year 1 (age verified on 2026-04-12)."
3. Submit → 200. Status → rejected. Seat released. Auto-promotion may run.
4. Verify in Rejected Archive and in timeline.

Pass/Fail:

### 29.8 Flow H — Parent self-withdraw (parent_view spec covers the full flow; admin verifies outcome)

1. Parent logs in, withdraws their application (flow in parent spec).
2. Admin opens detail → status `withdrawn`. Seat released. Timeline entry §15.12.

Pass/Fail:

---

## 30. Data Invariants — SQL checks after each flow <a id="30-data-invariants"></a>

A tester runs these queries against the tenant's Postgres (or the internal admin SQL console) inside an RLS-scoped connection. Each row is a single assertion. Tolerance on monetary equality is ±0.01 (1 cent).

| #     | What to assert                                                               | Expected query + result                                                                                                                                                                                        | Pass/Fail |
| ----- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 30.1  | Every application row has tenant_id = current tenant                         | `SELECT COUNT(*) FROM applications WHERE tenant_id != current_setting('app.current_tenant_id')::uuid` → 0                                                                                                      |           |
| 30.2  | application_number unique per tenant                                         | `SELECT application_number, COUNT(*) FROM applications WHERE tenant_id=? GROUP BY application_number HAVING COUNT(*) > 1` → 0 rows                                                                             |           |
| 30.3  | application_number sequence is monotonic per tenant                          | Convert suffix digits of application_number to int, `SELECT max(n)-min(n)+1 = COUNT(*) FROM ...` — i.e. no gaps unless by design                                                                               |           |
| 30.4  | After approve (§29.6), payment_amount_cents > 0                              | `SELECT payment_amount_cents FROM applications WHERE id = ?` → matches `FinanceFeesFacade.resolveAnnualNetFeeCents * upfront_percentage / 100`                                                                 |           |
| 30.5  | After approve, payment_deadline = reviewed_at + settings.payment_window_days | `SELECT (payment_deadline - reviewed_at) FROM applications WHERE id=?` ≈ `'{payment_window_days} days'::interval` ± 1s                                                                                         |           |
| 30.6  | After approve → payment Stripe success, status='approved'                    | `SELECT status FROM applications WHERE id=?` = 'approved'                                                                                                                                                      |           |
| 30.7  | AdmissionsPaymentEvent row exists per Stripe success                         | `SELECT COUNT(*) FROM admissions_payment_events WHERE application_id=? AND status='succeeded'` ≥ 1                                                                                                             |           |
| 30.8  | Stripe event deduplication                                                   | `SELECT stripe_event_id, COUNT(*) FROM admissions_payment_events WHERE tenant_id=? GROUP BY stripe_event_id HAVING COUNT(*) > 1` → 0 rows                                                                      |           |
| 30.9  | After approve, Student materialised                                          | `SELECT materialised_student_id FROM applications WHERE id=?` IS NOT NULL AND `SELECT COUNT(*) FROM students WHERE id=that_id AND tenant_id=?` = 1                                                             |           |
| 30.10 | Invoice + Payment + Allocation created                                       | After cash/bank/override/Stripe approve: exactly one `invoices` row, one `payments` row, one `payment_allocations` row linking them, with matching amounts. No orphans.                                        |           |
| 30.11 | Invoice balance formula                                                      | `SELECT total_amount - COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_id=i.id),0) - COALESCE(write_off_amount,0) FROM invoices i WHERE i.id=?` = `balance_amount` ±0.01         |           |
| 30.12 | Conditional_approval holds a seat                                            | Count of `applications WHERE tenant_id=? AND target_academic_year_id=? AND target_year_group_id=? AND status IN ('ready_to_admit','conditional_approval')` PLUS enrolled students = `available_seats_consumed` |           |
| 30.13 | Waiting_list applications do NOT hold a seat                                 | Seat calculation (§12 code) excludes waiting_list status                                                                                                                                                       |           |
| 30.14 | After reject, seat released (if previously holding)                          | If prior state was ready_to_admit or conditional_approval: re-count §30.12 — count decreases by 1                                                                                                              |           |
| 30.15 | After withdraw, seat released (if previously holding)                        | Same principle                                                                                                                                                                                                 |           |
| 30.16 | After payment_expiry cron                                                    | Rows with previous `status='conditional_approval'` AND `payment_deadline < now()` now have `status='waiting_list'`, `payment_amount_cents IS NULL`, `payment_deadline IS NULL`                                 |           |
| 30.17 | After cron, ApplicationNote created per reverted application                 | `SELECT note FROM application_notes WHERE application_id=?` includes the system-generated "payment_expired" note                                                                                               |           |
| 30.18 | AdmissionOverride immutable: no updated_at column                            | Schema inspection: `\d admission_overrides` shows no `updated_at`                                                                                                                                              |           |
| 30.19 | ApplicationNote append-only                                                  | Same inspection: `application_notes` has no `updated_at`                                                                                                                                                       |           |
| 30.20 | Materialised student has status='applicant' at conversion time               | `SELECT status FROM students WHERE id=?` = 'applicant' (until enrolled by principal separately)                                                                                                                |           |
| 30.21 | AdmissionOverride amount bounds                                              | `SELECT * FROM admission_overrides WHERE actual_amount_cents < 0 OR actual_amount_cents > expected_amount_cents + 1000` → 0 rows (tolerance for rounding)                                                      |           |
| 30.22 | Override row references existing approver                                    | `SELECT COUNT(*) FROM admission_overrides o LEFT JOIN users u ON u.id=o.approved_by_user_id WHERE u.id IS NULL` → 0                                                                                            |           |
| 30.23 | Every application has a form_definition_id pointing to its tenant's form     | `SELECT COUNT(*) FROM applications a JOIN admission_form_definitions d ON d.id=a.form_definition_id WHERE a.tenant_id != d.tenant_id` → 0                                                                      |           |
| 30.24 | Submission_batch_id consistency                                              | For rows sharing a submission_batch_id: same tenant, all rows created within 1 minute of each other                                                                                                            |           |
| 30.25 | `materialised_student_id` uniqueness                                         | `SELECT materialised_student_id, COUNT(*) FROM applications WHERE materialised_student_id IS NOT NULL GROUP BY materialised_student_id HAVING COUNT(*) > 1` → 0                                                |           |
| 30.26 | Cross-tenant check                                                           | `SELECT DISTINCT tenant_id FROM applications` executed within RLS-scoped conn → only one tenant_id present                                                                                                     |           |

---

## 31. Arabic / RTL Behaviour <a id="31-rtl"></a>

| #     | What to Check                                    | Expected Result                                                                                                                                         | Pass/Fail |
| ----- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 31.1  | `/ar/admissions` loads                           | `<html dir="rtl" lang="ar">` at DOM root. All pages mirror; no `left/right` physical classes leak through.                                              |           |
| 31.2  | Application numbers (`APP-2026-000042`) stay LTR | Wrapped in `<span dir="ltr">` inside Arabic text context.                                                                                               |           |
| 31.3  | Currency amounts stay LTR                        | `€1,234.56` renders left-to-right regardless of surrounding Arabic text.                                                                                |           |
| 31.4  | Dates are Gregorian with Western numerals (0-9)  | "12 أبريل 2026" (or translation-file equivalent) — digits are 1,2,4,6 not ١,٢,٤,٦.                                                                      |           |
| 31.5  | Phone and email inputs                           | LTR even under Arabic locale. Cursor moves left-to-right.                                                                                               |           |
| 31.6  | Queue group headers                              | Right-aligned; year-group name and count mirror position appropriately.                                                                                 |           |
| 31.7  | Modals and dialogs                               | Close button (X) appears at the left edge (mirror of English right edge). Primary action buttons are at the start-aligned edge per Arabic convention.   |           |
| 31.8  | Analytics charts                                 | x-axis origin at the right; tooltip pointing directions mirror. Legend swaps left-right.                                                                |           |
| 31.9  | Morph bar & sub-strip mirror                     | Brand logo on the right, user avatar on the left. Module sub-strip active-underline direction matches RTL.                                              |           |
| 31.10 | Logical CSS properties in every admissions page  | Grep each admissions page file: zero occurrences of `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `border-l-`, `border-r-`. |           |

---

## 32. Console & Network Health <a id="32-console-network"></a>

| #    | What to Check                                        | Expected Result                                                                                                                                                         | Pass/Fail |
| ---- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 32.1 | Open each admissions page with DevTools console open | Zero uncaught errors. No React key warnings, no hydration mismatches, no 404s on static assets.                                                                         |           |
| 32.2 | 4xx during permission tests is deliberate            | 401/403/404 during permission tests are marked with "(expected — permission/cross-tenant test)" in the tester's notes — not a fail.                                     |           |
| 32.3 | No 429                                               | Routine admin flow does not hit `TOO_MANY_REQUESTS`. If it does on any step, escalate — rate limiting is covered in security spec but should not fire under normal use. |           |
| 32.4 | Polling cadence                                      | Admissions pages do NOT poll. Data is fetched on mount + explicit refresh. If any poll is observed, note the cadence for review.                                        |           |
| 32.5 | Websocket connections                                | None required. If one opens unprompted, note it.                                                                                                                        |           |
| 32.6 | Response sizes                                       | Queue endpoints ≤ 200KB per page of 20. Detail endpoint ≤ 100KB. Log any response > 500KB for perf spec follow-up.                                                      |           |
| 32.7 | Service Worker / caching                             | Admissions resources not aggressively cached. Logout clears any session-stored state (verify via Application → Local Storage panel).                                    |           |
| 32.8 | Memory usage                                         | Navigate through 20 applications detail pages. RSS growth ≤ 30MB. No listener leak (Performance tab → Detached DOM nodes count stable).                                 |           |

---

## 33. Permission Matrix — affordance visibility by role <a id="33-permission-matrix"></a>

Applies to each admissions UI action (not each endpoint — that's in the security spec). Columns: `school_owner | school_principal | school_vice_principal | admin | front_office | teacher | parent | student | unauth | cross-tenant_admin`.

| #     | Affordance                                      | owner | principal | vice | admin | front_office | teacher | parent | student | unauth | xtenant_admin |
| ----- | ----------------------------------------------- | ----- | --------- | ---- | ----- | ------------ | ------- | ------ | ------- | ------ | ------------- |
| 33.1  | View Dashboard hub                              | OK    | OK        | OK   | OK    | OK           | —       | —      | —       | 401    | 404/empty     |
| 33.2  | View any queue                                  | OK    | OK        | OK   | OK    | OK           | —       | —      | —       | 401    | 404/empty     |
| 33.3  | View detail page                                | OK    | OK        | OK   | OK    | OK           | —       | own    | —       | 401    | 404           |
| 33.4  | Approve `ready_to_admit → conditional_approval` | OK    | OK        | OK   | OK    | —            | —       | —      | —       | 401    | 404           |
| 33.5  | Record cash payment                             | OK    | OK        | OK   | OK    | —            | —       | —      | —       | 401    | 404           |
| 33.6  | Record bank transfer                            | OK    | OK        | OK   | OK    | —            | —       | —      | —       | 401    | 404           |
| 33.7  | Force approve with override                     | OK\*  | OK\*      | —    | —     | —            | —       | —      | —       | 401    | 404           |
| 33.8  | Manual promote from waiting_list                | OK    | OK        | OK   | OK    | —            | —       | —      | —       | 401    | 404           |
| 33.9  | Reject                                          | OK    | OK        | OK   | OK    | —            | —       | —      | —       | 401    | 404           |
| 33.10 | Withdraw (staff)                                | OK    | OK        | OK   | OK    | —            | —       | —      | —       | 401    | 404           |
| 33.11 | Withdraw (parent)                               | —     | —         | —    | —     | —            | —       | own    | —       | 401    | 404           |
| 33.12 | Create note (is_internal)                       | OK    | OK        | OK   | OK    | —            | —       | —      | —       | 401    | 404           |
| 33.13 | View internal notes                             | OK    | OK        | OK   | OK    | OK           | —       | —      | —       | 401    | 404           |
| 33.14 | View parent-visible notes                       | OK    | OK        | OK   | OK    | OK           | —       | own    | —       | 401    | 404           |
| 33.15 | Rebuild system form                             | OK    | OK        | OK   | OK    | —            | —       | —      | —       | 401    | 404           |
| 33.16 | Admissions settings edit                        | OK    | OK        | OK   | OK    | —            | —       | —      | —       | 401    | 404           |
| 33.17 | View overrides audit log                        | OK    | OK        | OK   | OK    | —            | —       | —      | —       | 401    | 404           |
| 33.18 | Regenerate payment link                         | OK    | OK        | OK   | OK    | —            | —       | —      | —       | 401    | 404           |
| 33.19 | Analytics                                       | OK    | OK        | OK   | OK    | OK           | —       | —      | —       | 401    | 404           |

`*` = only the role configured in `admissions.require_override_approval_role` per tenant. Defaults to `school_owner`. The other role may be `school_principal` or admin per tenant configuration. Non-configured roles get 403.

Any `OK` cell gets tested via the UI click-path. Any `—` or 4xx cell gets tested by either (a) verifying the UI affordance is hidden and (b) direct HTTP attempt returns the stated code.

---

## 34. Backend Endpoint Map <a id="34-endpoint-map"></a>

| Method | Path                                           | Permission                       | Exercised in section                        | Notes                                                    |
| ------ | ---------------------------------------------- | -------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| GET    | `/v1/admissions/dashboard-summary`             | admissions.view                  | §4                                          | Dashboard hub                                            |
| GET    | `/v1/applications`                             | admissions.view                  | §5–§9 (baseline listing)                    | List with filters                                        |
| GET    | `/v1/applications/queues/ready-to-admit`       | admissions.view                  | §5                                          |                                                          |
| GET    | `/v1/applications/queues/waiting-list`         | admissions.view                  | §6                                          |                                                          |
| GET    | `/v1/applications/queues/conditional-approval` | admissions.view                  | §7                                          |                                                          |
| GET    | `/v1/applications/queues/approved`             | admissions.view                  | §8                                          |                                                          |
| GET    | `/v1/applications/queues/rejected`             | admissions.view                  | §9                                          |                                                          |
| GET    | `/v1/applications/analytics`                   | admissions.view                  | §10                                         | Date-range + form filter                                 |
| GET    | `/v1/applications/:id`                         | admissions.view                  | §13                                         | Detail                                                   |
| GET    | `/v1/applications/:id/preview`                 | admissions.view                  | §14                                         | Field-by-field preview                                   |
| POST   | `/v1/applications/:id/review`                  | admissions.manage                | §18, §19, §20, §22 (reject)                 | Generic transition w/ expected_updated_at                |
| POST   | `/v1/applications/:id/withdraw`                | admissions.manage                | §18, §19, §20, §21                          | Staff withdraw                                           |
| GET    | `/v1/applications/:applicationId/notes`        | admissions.view                  | §16                                         |                                                          |
| POST   | `/v1/applications/:applicationId/notes`        | admissions.manage                | §16                                         |                                                          |
| POST   | `/v1/applications/:id/manual-promote`          | admissions.manage                | §20.2, §26                                  |                                                          |
| POST   | `/v1/applications/:id/payment-link/regenerate` | admissions.manage                | §17.4                                       |                                                          |
| POST   | `/v1/applications/:id/payment/cash`            | admissions.manage                | §19.2, §24                                  |                                                          |
| POST   | `/v1/applications/:id/payment/bank-transfer`   | admissions.manage                | §19.3, §25                                  |                                                          |
| POST   | `/v1/applications/:id/payment/override`        | admissions.manage + role check   | §19.4, §23                                  | Role must match tenant `require_override_approval_role`  |
| GET    | `/v1/admission-overrides`                      | admissions.manage                | §17 (event list in some variants)           | Cross-tenant filtered                                    |
| GET    | `/v1/admission-forms/system`                   | admissions.view                  | §11                                         |                                                          |
| POST   | `/v1/admission-forms/system/rebuild`           | admissions.manage                | §11.5                                       |                                                          |
| POST   | `/v1/public/admissions/applications`           | PUBLIC (unauth, IP rate-limited) | §29.1 (parent/public spec primary)          | Exercised from admin side only as read-back verification |
| GET    | `/v1/public/admissions/form`                   | PUBLIC                           | §11 (cross-check)                           | Parent spec primary                                      |
| GET    | `/v1/parent/applications`                      | AuthGuard only                   | parent spec primary; admin cross-check only |                                                          |
| GET    | `/v1/parent/applications/:id`                  | AuthGuard + ownership            | parent spec primary                         |                                                          |
| POST   | `/v1/parent/applications/:id/withdraw`         | AuthGuard + ownership            | parent spec primary; §29.8 verify           |                                                          |
| GET    | `/v1/settings/admissions`                      | admissions.manage                | §12                                         | Settings subset                                          |
| PATCH  | `/v1/settings/admissions`                      | admissions.manage                | §12                                         |                                                          |

28 endpoints total. All guarded endpoints return 401 without a token, 403 with a valid token missing permission, 404 for cross-tenant ids, 400 for Zod/state errors, 409 for `expected_updated_at` mismatches.

---

## 35. Observations & Findings from the walkthrough <a id="35-observations"></a>

These are items the spec-author noticed while tracing the code paths. NOT silently fixed — surfaced for triage. Severity is the spec-author's best guess; product owner decides.

| #     | Severity | Location                                                                    | Observation                                                                                                                                                                                                                                                                               |
| ----- | -------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OB-01 | P2       | `applications.service.ts` / `createPublic`                                  | Honeypot `website_url` is accepted as optional — confirm the service silently drops submissions where honeypot is non-empty (expected) AND emits a security-audit log line. If it drops silently without any log, we lose detection signal for bots. Security spec covers the audit.      |
| OB-02 | P2       | `applications.service.ts` / `findOne`                                       | The detail endpoint assembles timeline + notes + capacity in one call. Verify N+1 bounded (perf spec covers the measurement).                                                                                                                                                             |
| OB-03 | P3       | `admissions-payment.controller.ts`                                          | `AdmissionOverridesController.list` returns paginated overrides but does not expose filters by `approved_by_user_id` or `created_at` range — investigator experience may be poor. Product decision.                                                                                       |
| OB-04 | P1       | `application-state-machine.service.ts` / `moveToConditionalApproval`        | `SELECT ... FOR UPDATE` on the application row protects against double-approve but not against two admins racing two DIFFERENT ready_to_admit apps for the same last seat in the same year_group. Integration spec covers the capacity-level race. Flag if no capacity-level lock exists. |
| OB-05 | P2       | Payment link expiry (Stripe `expires_at: min(payment_deadline, now + 23h)`) | If `payment_deadline` is > 24h away, Stripe link silently expires at 23h. Parent sees "Session expired" with no admin-visible indication. Consider surfacing the real Stripe expiry in the admin Payment tab.                                                                             |
| OB-06 | P2       | `payment-expiry` cron                                                       | Cron runs every 15 min; a payment completing within 14 min before deadline can race with the revert. Integration spec covers race test. Flag if the `markApproved` call doesn't recheck status post-lock.                                                                                 |
| OB-07 | P3       | `admissions-rate-limit.service.ts`                                          | IP rate limit uses Cloudflare header first; if the deployment is behind a different proxy, the actual client IP may be `127.0.0.1` for all requests, defeating rate limiting. Deployment architecture spec should document the proxy chain (defer).                                       |
| OB-08 | P2       | `admissions-settings` payload shape                                         | `require_override_approval_role` validation relies on string role name; if a role is renamed without a migration updating the setting, overrides silently fall back to the default role.                                                                                                  |
| OB-09 | P3       | Reject flow                                                                 | `rejection_reason` field is required when target is `rejected` but the state-machine also accepts `target=rejected` with an omitted reason in certain paths (verify). If so, rejection archive may show empty reason for older rows — legacy data.                                        |
| OB-10 | P2       | Multi-student submission (`submission_batch_id`)                            | Siblings may resolve to different queues (one ready_to_admit, one waiting_list) based on per-year capacity. Ensure parent email mentions per-student status individually — not "application received" generically.                                                                        |
| OB-11 | P1       | `manually promote`                                                          | Promote sets status to `ready_to_admit` but does not consume a seat (that happens on conditional_approval). Two parallel manual-promotes against the same year_group can over-queue ready_to_admit rows beyond capacity. Product decision: is that acceptable (just ordering) or a bug?   |
| OB-12 | P3       | Frontend Settings page                                                      | `allow_cash=false` and `allow_bank_transfer=false` + Stripe keys missing is a dead-end — no payment paths possible except override. Consider a guard in settings to prevent it.                                                                                                           |
| OB-13 | P2       | Audit-log inspection                                                        | Timeline is derived from notes+row-state rather than a dedicated audit_log table. Some actions (e.g. regenerate payment link) may not leave a timeline entry. Verify — if no entry, flag for addition.                                                                                    |
| OB-14 | P2       | Parent portal                                                               | Filter excludes `is_internal=true` notes. Double-check any join joined-load does NOT over-fetch internal notes to the client and filter on the frontend (that would be an information leak — security spec covers).                                                                       |
| OB-15 | P3       | Form rebuild                                                                | Bumps `version_number` but does not invalidate in-flight public form sessions. Parents mid-submit may post to a stale `form_definition_id`. Behaviour TBD: accept but tag as outdated? Reject with a helpful message? Product decision.                                                   |

---

## 36. Sign-off Table <a id="36-signoff"></a>

| Section                          | Reviewer | Date | Pass | Fail | Notes |
| -------------------------------- | -------- | ---- | ---- | ---- | ----- |
| 1 — Prerequisites                |          |      |      |      |       |
| 3 — Global UI Shell              |          |      |      |      |       |
| 4 — Dashboard                    |          |      |      |      |       |
| 5 — Ready-to-Admit queue         |          |      |      |      |       |
| 6 — Waiting-list queue           |          |      |      |      |       |
| 7 — Conditional-Approval queue   |          |      |      |      |       |
| 8 — Approved archive             |          |      |      |      |       |
| 9 — Rejected archive             |          |      |      |      |       |
| 10 — Analytics                   |          |      |      |      |       |
| 11 — Form Preview                |          |      |      |      |       |
| 12 — Settings                    |          |      |      |      |       |
| 13 — Detail header               |          |      |      |      |       |
| 14 — Application tab             |          |      |      |      |       |
| 15 — Timeline tab                |          |      |      |      |       |
| 16 — Notes tab                   |          |      |      |      |       |
| 17 — Payment tab                 |          |      |      |      |       |
| 18-21 — Detail actions per state |          |      |      |      |       |
| 22 — Reject dialog               |          |      |      |      |       |
| 23 — Force-approve modal         |          |      |      |      |       |
| 24 — Record cash modal           |          |      |      |      |       |
| 25 — Record bank-transfer modal  |          |      |      |      |       |
| 26 — Manual-promote dialog       |          |      |      |      |       |
| 27 — Queue components            |          |      |      |      |       |
| 28 — State machine               |          |      |      |      |       |
| 29 — End-to-end flows A-H        |          |      |      |      |       |
| 30 — Data invariants             |          |      |      |      |       |
| 31 — Arabic / RTL                |          |      |      |      |       |
| 32 — Console & Network Health    |          |      |      |      |       |
| 33 — Permission matrix           |          |      |      |      |       |
| **Overall**                      |          |      |      |      |       |

**Module admin-UI release-ready when every section is signed off Pass with zero observations outstanding at severity P0 or P1.**
