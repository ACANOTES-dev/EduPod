# Implementation 11 — Queue Sub-Pages

> **Wave:** 4 (parallelizable with 10, 12, 13, 14)
> **Depends on:** 01, 02, 03, 06, 07
> **Deploys:** Web restart only

---

## Goal

Build the four queue sub-pages that sit under the Admissions dashboard: Ready to Admit, Waiting List, Conditional Approval, and Rejected. Each is a purpose-built view tuned to the admin tasks that belong there. No more "one table with status filters" — each queue has its own layout and its own action set.

## General principles

- Every queue page is a client component with imperative `apiClient` calls (repo convention).
- Rows are grouped by `target_year_group_id` with collapsible sections. This is how schools think about admissions — "who's in the pipe for Second Class?" — not as a flat timeline.
- FIFO order within each year group: `ORDER BY apply_date ASC`.
- Every page shares a common sub-header component that shows the parent dashboard breadcrumb + live counts + a capacity badge for each year group.
- Actions live inline on the row (mobile: collapse to kebab menu).

## Pages to build

### 11.1 — `/admissions/ready-to-admit/page.tsx`

**Purpose:** the admin's primary queue. Everything here is waiting for a decision.

**Layout:**

- Sub-header with back-to-dashboard link, live count, and a capacity chip per visible year group: `Second Class — 48 / 50 enrolled, 2 conditional, 0 free` (red when 0 free).
- Grouped by year group, sorted by year group `display_order`.
- Each row shows: application number, student name + age, parent name + contact, apply_date (relative: "3 days ago"), FIFO position within the year group.
- Row actions (right-aligned):
  - **Approve** (primary) → calls the existing state machine endpoint to move to `conditional_approval`. On success, triggers a toast "Application moved to Conditional Approval — payment link will be emailed to the parent."
  - **Reject** (outline, red) → opens a dialog requiring a rejection reason (mandatory, min 10 chars), then calls the state machine.
  - **View** (ghost) → navigates to the detail page.
- Bulk select is **not** supported — admin decisions should be individual and intentional.

**Capacity re-check warning:**

- Before enabling the Approve button, the frontend re-fetches the dashboard summary's capacity block. If the target year group shows `available_seats <= 0`, the Approve button is disabled with a tooltip "Year group at capacity — reject another application or wait for one to be withdrawn."
- Even if the button is enabled, the backend re-checks at transition time (belt + suspenders).

**API:**

```
GET /v1/applications?status=ready_to_admit&group_by=year_group&page=1&pageSize=50

Response:
{
  data: Array<{
    year_group_id: string;
    year_group_name: string;
    capacity: { total: number; enrolled: number; conditional: number; available: number };
    applications: Array<{
      id: string;
      application_number: string;
      student_first_name: string;
      student_last_name: string;
      date_of_birth: string;
      apply_date: string;
      fifo_position: number; // rank within year group queue
      submitted_by_parent: { first_name: string; last_name: string; email: string; phone: string } | null;
    }>;
  }>;
  meta: { total: number };
}
```

Backend service method lives in `applicationsService`. Grouping is done in-memory after fetching the tenant's apps for the target status.

### 11.2 — `/admissions/waiting-list/page.tsx`

**Purpose:** the waiting room. Read-only most of the time because auto-promotion handles the common case.

**Layout:**

- Sub-header with back link, live count, and a clarifying note: "Applications auto-promote to Ready to Admit when a seat opens."
- Two sections:
  - **Waiting** — applications with `status='waiting_list'` and `waiting_list_substatus IS NULL`. Grouped by year group.
  - **Awaiting Year Setup** — applications with `waiting_list_substatus='awaiting_year_setup'`. Grouped by target academic year + year group. Shown with a muted style and a tooltip explaining "The school has not yet configured classes for this academic year. Applications auto-promote once classes are created."
- Each row shows the same info as Ready to Admit plus `fifo_position`.
- Row actions:
  - **View** (ghost)
  - **Reject** (outline, red) — for the rare case where the school wants to proactively reject before capacity becomes available.
  - **Manual Promote** (outline, amber) — visible only when the target year group has at least one free seat. Lets an admin promote out of FIFO order (e.g. sibling priority). Opens a confirmation dialog explaining the FIFO bypass and requiring a short justification note (appended as an internal note on the application).

**Capacity pressure indicator:**

- Above each year group section, show the same capacity chip as Ready to Admit. If the chip shows "0 free", the Manual Promote button is disabled.

### 11.3 — `/admissions/conditional-approval/page.tsx`

**Purpose:** the payment room. Admins come here to chase payments, record cash/bank, or override.

**Layout:**

- Sub-header with back link + live count + "X expiring in the next 48 hours" badge (red when > 0).
- Sort order: `payment_deadline ASC` (most urgent first). Not grouped by year group — urgency is the axis.
- Each row shows:
  - Application number, student name, parent contact.
  - Payment amount (formatted: `€700.00 EUR`).
  - Payment deadline (absolute date + relative: "in 3 days" / "overdue by 2 days").
  - Payment status pill: `awaiting_payment` (default), `near_expiry` (< 48h), `overdue` (past deadline, still in conditional_approval — these exist briefly before the cron reverts them).
- Row actions (three buttons, all inline):
  - **Copy Payment Link** (ghost) — calls `POST /v1/applications/:id/payment-link/regenerate` (impl 06) to get a fresh Stripe checkout URL, copies to clipboard, shows toast "Link copied. Share with the parent."
  - **Record Payment** (outline) — opens a modal with three tabs: Cash, Bank Transfer, Stripe (stripe is informational only — "emailed to parent, waiting for completion"). Cash tab has amount input + receipt number + notes. Bank tab has amount + reference + date + notes. Amounts are pre-filled with the expected upfront and CANNOT be lower. Submits to `POST /v1/applications/:id/payment/cash` or `/bank-transfer` (impl 07).
  - **Force Approve Without Payment** (outline, yellow) — visible only to users with the override role (from tenant settings). Opens a modal with override type selector, actual amount collected input (can be 0), and a mandatory justification textarea. Submits to `POST /v1/applications/:id/payment/override` (impl 07).
- Row actions (additional, lower visibility):
  - **Reject** — rejects with reason, releases seat.

**API (new endpoint):**

```
GET /v1/applications?status=conditional_approval&page=1&pageSize=50

Response includes payment fields:
{
  data: Array<{
    // ... standard fields ...
    payment_amount_cents: number;
    payment_deadline: string;
    stripe_checkout_session_id: string | null;
    has_active_payment_link: boolean; // true if session is still valid
    payment_urgency: 'normal' | 'near_expiry' | 'overdue';
  }>;
  meta: { total: number, near_expiry_count: number, overdue_count: number };
}
```

### 11.4 — `/admissions/rejected/page.tsx`

**Purpose:** archive. Read-only.

**Layout:**

- Sub-header with back link + live count.
- Flat table, paginated, sorted by `reviewed_at DESC`.
- Each row shows: application number, student name, parent name, rejection reason (truncated), rejected by (user name), rejected on (date).
- Row action: **View** only.
- Search box filters by student name or parent name.

### 11.5 — Shared components

Extract to `apps/web/src/app/[locale]/(school)/admissions/_components/`:

- `queue-header.tsx` — sub-header with breadcrumb, counts, and capacity chips.
- `application-row.tsx` — the shared row layout used by Ready to Admit and Waiting List.
- `capacity-chip.tsx` — the small "48/50 · 2 cond · 0 free" pill.
- `payment-record-modal.tsx` — cash / bank tabs.
- `force-approve-modal.tsx` — override flow.
- `reject-dialog.tsx` — rejection reason prompt.

## Translations

Add a rich `admissionsQueues` namespace to `en.json` covering all labels, modals, tooltips, and empty states. Arabic parallel. Keep keys short and hierarchical (`admissionsQueues.readyToAdmit.approveButton`).

## Role gates

- `admissions.view`: can see all four queue pages read-only.
- `admissions.manage`: can take row actions (approve, reject, record payment).
- Override role (per tenant setting): can see and use Force Approve.
- `front_office`: can view and record cash payments and approve, but cannot use Force Approve.

Use `useRoleCheck` to conditionally render buttons.

## Tests

- Component tests for each page covering role visibility, action dispatching, and error toasts.
- Capacity chip disables Approve button when at zero.
- Payment modal rejects amounts below expected.
- Force Approve modal requires min 20 char justification.
- FIFO ordering within year groups.

## Deployment

1. Commit locally.
2. Patch → production.
3. Build `@school/web`, restart web.
4. Smoke test:
   - Visit each of the four queue pages on production.
   - Verify dashboard cards route correctly.
   - Verify a test application flow end-to-end: submit → ready to admit → approve → conditional approval → record cash → approved → student appears in Students list.
5. Update `IMPLEMENTATION_LOG.md`.

## Definition of done

- Four queue pages exist and render.
- Shared components extracted.
- Role-aware actions.
- Translations added.
- End-to-end flow works in production against a test application.
- Web restarted on production.
- Completion record added to the log.

## Notes for downstream implementations

- **12 (detail page)** is the target of every "View" action — make sure the href format matches.
- **15 (cleanup)** removes the old status-tab table on `admissions/page.tsx` (which becomes the dashboard in impl 10 — already done by that wave, this impl just takes over the sub-routes).
