# Implementation 18 — Trip → Fee Generation Flow UI

> **Wave:** 4
> **Depends on:** 01, 07, 10
> **Deploys:** web restart only

---

## Goal

Build the dedicated page that walks the user through the **trip → fee generation flow**: dry-run preview → confirmation modal → cross-module transactional write into Finance → success state. This is the user-facing surface for the most consequential write the budgeting module makes — every household × student × amount combination is reviewable before a single invoice is issued.

The page lives outside the event workspace because the flow is multi-step, the dry-run preview is information-dense, and the confirmation modal needs to dominate the viewport. Per `PLAN.md §10.3`, the action is explicit and opt-in. Per smoke-test conventions, **production smoke tests must NOT actually confirm-and-generate-fees** (don't issue real invoices) — they exercise the dry-run UI only.

## What to change

### 1. Route — `apps/web/src/app/[locale]/(school)/finance/budgeting/events/[id]/generate-fees/page.tsx` — NEW

`'use client'` page component. Three states it can be in:

1. **Loading** — initial fetch in flight or 202 still rendering.
2. **Preview** — dry-run results visible, "Generate fees" button armed.
3. **Confirming** — modal open, user reviewing the totals + checkbox.
4. **Success** — fees issued, deep-link to Finance.
5. **Error** — friendly error state with the structured code + message.

Top-level component wires:

```tsx
'use client';

// 1. External
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

// 2. Internal shared
import { Card, CardContent, CardHeader } from '@school/ui';
import { Button } from '@school/ui';
import { toast } from '@school/ui';

// 3. Relative parents
import { apiClient, unwrap } from '@/lib/api-client';
import { usePermissions } from '@/lib/permissions';

// 4. Relative siblings
import { GenerateFeesConfirmModal } from './_components/generate-fees-confirm-modal';
import { GenerateFeesSuccessState } from './_components/generate-fees-success-state';
import { GenerateFeesErrorState } from './_components/generate-fees-error-state';
```

Page state:

```ts
type PreviewResult = {
  total_amount: number;
  total_school_subsidy: number;
  household_count: number;
  student_count: number;
  payment_plan: 'one_off' | 'two_payments' | 'three_payments' | 'four_payments';
  payment_plan_dates: string[]; // ISO dates when payment_plan != 'one_off'
  households: Array<{
    household_id: string;
    household_label: string;
    students: Array<{ student_id: string; student_name: string }>;
    amount: number;
  }>;
  warnings: Array<{ code: string; message: string }>;
};

type ViewState =
  | { kind: 'loading' }
  | { kind: 'preview'; data: PreviewResult }
  | { kind: 'confirming'; data: PreviewResult }
  | { kind: 'success'; runId: string; invoiceCount: number }
  | { kind: 'error'; code: string; message: string; recoverable: boolean };
```

Initial mount:

```ts
React.useEffect(() => {
  let cancelled = false;
  void (async () => {
    try {
      const response = await apiClient<{ data: PreviewResult }>(
        `/api/v1/budgeting/event-budgets/${id}/generate-fees/preview`,
      );
      if (cancelled) return;
      setView({ kind: 'preview', data: unwrap(response) });
    } catch (err) {
      if (cancelled) return;
      console.error('[generate-fees-preview]', err);
      setView({
        kind: 'error',
        code: err.code ?? 'UNKNOWN_ERROR',
        message: err.message ?? t('errors.unknownError'),
        recoverable: err.code !== 'EVENT_NOT_CONFIRMED',
      });
    }
  })();
  return () => {
    cancelled = true;
  };
}, [id]);
```

Page-level layout:

```
┌────────────────────────────────────────────────────────────────────┐
│ Breadcrumb: Finance / Budgeting / Events / <event name> / Generate │
├────────────────────────────────────────────────────────────────────┤
│  Header                                                             │
│  - Title: "Generate fees for <event name>"                          │
│  - Subtitle: event date · participant count · household_share_pct   │
│  - "Back to event" button (start-aligned)                           │
├────────────────────────────────────────────────────────────────────┤
│  PreviewSummary (header card)                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ Total to │ │ School   │ │ Households│ │ Students │               │
│  │ invoice  │ │ subsidy  │ │ to invoice│ │ involved │               │
│  │ £4,250   │ │ £0       │ │ 18        │ │ 21       │               │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘               │
├────────────────────────────────────────────────────────────────────┤
│  Payment plan summary                                                │
│  "One-off invoice due 2026-09-01" or                                 │
│  "3 payments: 2026-09-01 · 2026-12-01 · 2027-03-01"                 │
├────────────────────────────────────────────────────────────────────┤
│  HouseholdsTable                                                     │
│  ┌──────────────┬─────────────────────┬──────────┐                  │
│  │ Household    │ Students            │ Amount   │                  │
│  ├──────────────┼─────────────────────┼──────────┤                  │
│  │ Smith family │ Alice (4A), Bob (6B)│ £472.20  │                  │
│  │ Khan family  │ Sara (4A)           │ £236.10  │                  │
│  │ ...          │ ...                 │ ...      │                  │
│  └──────────────┴─────────────────────┴──────────┘                  │
├────────────────────────────────────────────────────────────────────┤
│  Footer: [ Generate fees → ] [ Back to event ]                       │
└────────────────────────────────────────────────────────────────────┘
```

Mobile (< 640px): household table collapses to cards. KPI strip collapses to 2-column grid. Footer becomes vertical stack.

### 2. Permission gate at page mount

Stack required (per `PLAN.md §10.1`):

- `budgeting.view`
- `budgeting.generate_fees`
- `finance.manage`

The frontend re-checks at page load via `usePermissions().hasAll(['budgeting.view', 'budgeting.generate_fees', 'finance.manage'])`. If missing, render the error state immediately with code `INSUFFICIENT_PERMISSIONS` and a friendly message naming which permissions the user lacks. The backend still re-checks at request time and rejects with 403 — the frontend gate is purely UX.

### 3. `_components/generate-fees-confirm-modal.tsx` — NEW

The "are you really sure" modal. Built on shadcn `Dialog`. Becomes a full-screen `Sheet` on mobile (< 768px).

Props:

```ts
type Props = {
  open: boolean;
  onClose: () => void;
  preview: PreviewResult;
  eventName: string;
  isSubmitting: boolean;
  onConfirm: () => Promise<void>;
};
```

Content:

```
┌─────────────────────────────────────────────────────────┐
│  Generate fees for <event name>                          │
│  ─────────────────────────────────────────────────       │
│                                                           │
│  This will create:                                        │
│  - <X> invoices                                           │
│  - For <Y> households                                     │
│  - For a total of <currency-formatted amount>             │
│                                                           │
│  Payment plan: <plan summary>                             │
│                                                           │
│  Households (collapsed, expandable):                      │
│  ▶ Show all <Y> households                                │
│                                                           │
│  ─────────────────────────────────────────────────       │
│  ☐ I understand this will invoice <Y> households for      │
│      a total of £<amount>.                                │
│                                                           │
│  [Cancel]                          [Confirm and generate] │
└─────────────────────────────────────────────────────────┘
```

Behaviour:

- Confirmation checkbox MUST be ticked before the "Confirm and generate" button enables.
- The button shows a spinner while `isSubmitting`.
- On submit, calls `onConfirm()` which fires `POST /v1/budgeting/event-budgets/:id/generate-fees` with body `{ confirm: true }`.
- On success: parent transitions to `success` view; modal unmounts.
- On error: modal stays open, shows an inline error banner at the top with the structured `{ code, message }`. Cancel + retry both work.

A11y:

- Dialog has `aria-labelledby` and `aria-describedby` set to the title and the "this will create" paragraph.
- Checkbox has explicit `aria-checked`; label is fully clickable via `<label>` wrap.
- Focus moves to the checkbox on open; focus returns to the "Generate fees" trigger on close.
- ESC key closes (when not submitting); the Cancel button is the keyboard primary action.

### 4. `_components/generate-fees-success-state.tsx` — NEW

Renders after the POST succeeds.

Props:

```ts
type Props = {
  runId: string;
  invoiceCount: number;
  totalAmount: number;
  currencyCode: string;
  eventId: string;
};
```

Content:

```
┌─────────────────────────────────────────────────────────┐
│                       ✓                                   │
│       Fees generated successfully                         │
│                                                           │
│       <X> invoices created · £<amount> total              │
│                                                           │
│  ┌──────────────────────────────────────────┐            │
│  │ View invoices in Finance →                │            │
│  └──────────────────────────────────────────┘            │
│                                                           │
│  [ Back to event ]    [ Back to budgeting hub ]           │
└─────────────────────────────────────────────────────────┘
```

The "View invoices in Finance" button deep-links to `/finance/invoices?fee_generation_run_id=<runId>` — the existing Finance UI's invoices list filtered by the run ID. This is how users hop into the new invoices to send them out / set up payment reminders.

A11y: the success heading is `role="status" aria-live="polite"` so screen readers announce it.

### 5. `_components/generate-fees-error-state.tsx` — NEW

Friendly, structured error rendering.

Props:

```ts
type Props = {
  code: string;
  message: string;
  recoverable: boolean;
  eventId: string;
};
```

Layout:

```
┌─────────────────────────────────────────────────────────┐
│                       ⚠                                   │
│       <Localized error title for the code>                │
│                                                           │
│       <message>                                           │
│                                                           │
│  [ Try again ]   [ Back to event ]                        │
│  (Try again hidden when !recoverable)                     │
└─────────────────────────────────────────────────────────┘
```

Specific code mappings (each gets a `budgeting.eventBudgets.generateFees.errors.<code>.title` translation key):

- `EVENT_NOT_CONFIRMED` (recoverable: false) — "This trip must be confirmed before generating fees. Open the event workspace and click Confirm first."
- `INSUFFICIENT_PERMISSIONS` (recoverable: false) — "You don't have permission to generate fees. You need: <list of missing perms>."
- `FEES_ALREADY_GENERATED` (recoverable: false) — "Fees for this event have already been generated. View them in Finance."
- `EVENT_CANCELLED` (recoverable: false) — "Cancelled events can't generate fees."
- `HOUSEHOLD_SHARE_ZERO` (recoverable: false) — "Household share is set to 0%. Use 'Mark school-funded' instead."
- `NO_PARTICIPANTS` (recoverable: false) — "No participants assigned to this event."
- `FEE_STRUCTURE_CREATION_FAILED` (recoverable: true) — "Couldn't set up the fee structure. Try again, or contact support if the problem persists."
- `INVOICE_CREATION_FAILED` (recoverable: true) — "One or more invoices couldn't be created and the whole batch was rolled back. Try again, or contact support."
- `UNKNOWN_ERROR` (recoverable: true) — generic.

The "Try again" button refetches the preview (resets state to `loading` then to `preview` on success).

### 6. API contract (consumed; defined in phase 10)

- `GET /v1/budgeting/event-budgets/:id/generate-fees/preview` — read-only dry run. Returns the `PreviewResult` shape. Permission: `budgeting.view`.
- `POST /v1/budgeting/event-budgets/:id/generate-fees` — body `{ confirm: true }`. Returns `{ data: { run_id, invoice_count, total_amount } }` on success. Permission stack as above. Wrapped server-side in `createRlsClient(...).$transaction()` per `PLAN.md §10.3`. Idempotent: if the event is already `fees_generated`, returns 409 with code `FEES_ALREADY_GENERATED`.

Both responses come back wrapped in `{ data: T }` per the API's `ResponseTransformInterceptor`.

### 7. Status pre-check

If the event's status is NOT `confirmed`, the page short-circuits to the error state with code `EVENT_NOT_CONFIRMED` BEFORE making the preview call. The page reads the event row from a small companion call:

```ts
const event = await apiClient<{ data: EventBudgetRow }>(`/api/v1/budgeting/event-budgets/${id}`);
if (event.data.status !== 'confirmed') {
  setView({
    kind: 'error',
    code: 'EVENT_NOT_CONFIRMED',
    message: t('errors.eventNotConfirmed.body'),
    recoverable: false,
  });
  return;
}
```

This avoids users seeing a "preview" that the API would reject anyway.

### 8. Match against per-household breakdown from phase 17

The household × student × amount table on this page MUST match what phase 17's `per-household-breakdown.tsx` shows. The shape comes from the same backend service (phase 07 + phase 10), so the only divergence is rendering — both should pull `households` from the same source-of-truth shape.

The Playwright smoke (phase 21) asserts this directly.

### 9. i18n

All strings under `budgeting.eventBudgets.generateFees.*`. Keys:

- `.title`
- `.subtitle`
- `.summary.totalToInvoice`
- `.summary.schoolSubsidy`
- `.summary.householdCount`
- `.summary.studentCount`
- `.paymentPlan.oneOff`
- `.paymentPlan.split` (with `count` and `dates` interpolation)
- `.households.tableHeader.household`
- `.households.tableHeader.students`
- `.households.tableHeader.amount`
- `.actions.generateFees`
- `.actions.backToEvent`
- `.actions.viewInvoices`
- `.confirm.title`
- `.confirm.body` (with interpolated `count` and `total`)
- `.confirm.checkbox` (with interpolated `count` and `total`)
- `.confirm.cancel`
- `.confirm.confirm`
- `.success.title`
- `.success.body`
- `.success.viewInvoices`
- `.errors.<code>.title`
- `.errors.<code>.body`

### 10. Mobile

- Households table → vertical card stack at `< sm:`. Each card renders household label / students list / amount.
- KPI strip → 2-column grid at `< sm:`.
- Modal becomes a full-screen `Sheet` (slide from end-side) at `< md:`.
- Footer buttons stack vertically at `< sm:`.
- Touch targets ≥ 44×44px on confirmation checkbox + buttons.

### 11. Smoke-test discipline

The Playwright smoke (phase 21) MUST stop short of confirming. Concretely:

- Load the generate-fees page on a confirmed test event.
- Assert the preview renders with N households and M students.
- Click "Generate fees" — assert the modal opens.
- Assert the household × student totals in the modal match the per-household breakdown from phase 17 for the same event.
- Click "Cancel" on the modal — assert it closes and no POST was issued.
- DO NOT tick the checkbox + confirm. The smoke covers UI only.

Document this convention in the page's component-level JSDoc so future contributors know.

### 12. Permission-aware redirect

If the user lacks any of `budgeting.view` / `budgeting.generate_fees` / `finance.manage`, the page renders the `INSUFFICIENT_PERMISSIONS` error state. We do NOT redirect — staying on-page lets the user understand WHY they can't proceed (which permissions are missing) and click "Back to event".

## Testing requirements

- **Component tests:**
  - `generate-fees-confirm-modal.spec.tsx` — checkbox gates the confirm button, ESC key closes when not submitting, focus management is correct.
  - `generate-fees-success-state.spec.tsx` — deep-link href is correct, currency renders correctly per locale.
  - `generate-fees-error-state.spec.tsx` — every code maps to its title/body translation, recoverable codes show the "Try again" button.

- **Page-level test:** `generate-fees/page.spec.tsx` — mock the `apiClient`, walk through the four happy/error transitions:
  - confirmed event + valid permissions → loading → preview → confirming → success.
  - draft event → error state with `EVENT_NOT_CONFIRMED`.
  - missing permissions → error state with `INSUFFICIENT_PERMISSIONS`.
  - 500 from the preview endpoint → error state with `UNKNOWN_ERROR`.

- **Playwright smoke (phase 21):**
  - Load `/finance/budgeting/events/<confirmed-test-event-id>/generate-fees` as `owner@nhqs.test`.
  - Capture `browser_console_messages(level: 'error')`; assert empty.
  - Assert the page rendered the household breakdown.
  - Assert each household's amount matches what `/v1/budgeting/event-budgets/:id` returned in phase 17's per-household breakdown.
  - Click "Generate fees", assert modal opens, click Cancel.
  - Verify no `POST /generate-fees` request was issued (network mock).

Per memory: cap Playwright at ~20 minutes; delete screenshots.

## Post-deploy verification

1. Rsync `apps/web/`. `pm2 restart web`.
2. Open the URL on a known-confirmed test event in NHQS.
3. Verify preview renders without errors.
4. Click Generate fees → modal opens → tick checkbox → button enables → click Cancel.
5. Spot-check the error path: open the URL on a `draft` event — verify `EVENT_NOT_CONFIRMED` error state.
6. Spot-check the permission path: log in as a user without `budgeting.generate_fees` — verify `INSUFFICIENT_PERMISSIONS` state.
7. Confirm console: zero errors.
8. **DO NOT** actually confirm-and-generate fees on production. The page is wired but the production smoke is dry-run only.

## Follow-ups for subsequent waves

- Phase 19 (shareable link UI) is independent.
- Phase 20 (outputs UI + settings) — settings page exposes the per-tenant `default_household_share_pct` which feeds the trip's default in phase 17.
- Phase 21 (polish) writes the master smoke that walks the dry-run flow end-to-end on production.

## Rollback

`git revert <sha>`. Web-only restart. Phase 18 is purely a new route + new components — no shared file edits, no schema changes. Reverting leaves phase 17's "Generate fees" button on the workspace page broken (it still navigates to a now-404 route). To soft-revert, additionally hide that button in phase 17 by reverting that commit too. Document this in the rollback record.
