# Implementation 15 — Variance Dashboard

> **Wave:** 4
> **Depends on:** 01 (schema), 06 (variance service), 08 (variance refresh worker)
> **Deploys:** web restart only (`pm2 restart web`)

---

## Goal

Build the variance dashboard at `/finance/budgeting/models/[id]/variance`. This is the "is reality matching the plan" view — what the principal opens every Monday once the academic year is in progress.

The page reads from `variance_cache` via `GET /v1/budgeting/financial-models/:id/variance`, displays a categorised table of Planned / Actual / Variance / Variance %, lets users log manual actuals for ops categories where there's no automated source, and exposes a manual refresh button that enqueues the `budgeting:variance-refresh` worker job for this model.

The page must handle three explicit states cleanly: (a) **not ready** — the model has no published snapshot yet OR the academic year hasn't started; (b) **ready, fresh data**; (c) **ready, refreshing in progress**. Per PLAN.md §8.4: NEVER show zeros when no data exists; never show stale numbers without a refresh hint.

## What to change

### 1. Variance page — `apps/web/src/app/[locale]/(school)/finance/budgeting/models/[id]/variance/page.tsx`

NEW. `'use client'`.

**State:**

```typescript
type VarianceState = {
  model: FinancialModel | null;
  variance: {
    rows: VarianceRow[]; // array of cache rows
    refreshed_at: string | null;
    snapshot_id: string | null;
    snapshot_version: number | null;
  } | null;
  selectedPeriod: { type: 'month' | 'term' | 'year'; label: string };
  availablePeriods: Array<{ type: 'month' | 'term' | 'year'; label: string }>;
  isLoading: boolean;
  isRefreshing: boolean;
  refreshError: string | null;
  manualActualsModalOpen: boolean;
  manualActualsLineItemKey: string | null;
};
```

`VarianceRow` shape (matches `variance_cache` row, defined in `@school/shared/budgeting/variance.ts`):

```typescript
type VarianceRow = {
  category: 'income' | 'staff_costs' | 'operations' | 'capital' | 'reserves_and_adjustments';
  subcategory: string;
  line_item_key: string; // e.g. 'income.tuition_gross'
  display_name: string;
  planned: number;
  actual: number;
  variance: number;
  variance_pct: number;
  drivers_json: Record<string, unknown> | null; // present for tuition lines (variance "why" tooltip data)
  is_manual_entry_allowed: boolean;
};
```

**Effect: load model + variance.** Sequential (variance depends on model existence):

```typescript
const modelRes = await apiClient<{ data: FinancialModel }>(
  `/api/v1/budgeting/financial-models/${id}`,
);
// If model.current_snapshot_id is null OR new Date(model.fiscal_year_start) > new Date():
//   skip variance fetch, render the not-ready empty state
const variance = await apiClient<{ data: VarianceResponse }>(
  `/api/v1/budgeting/financial-models/${id}/variance?period_type=${selectedPeriod.type}&period_label=${encodeURIComponent(selectedPeriod.label)}`,
);
```

`VarianceResponse` shape (defined by impl 06):

```typescript
type VarianceResponse = {
  rows: VarianceRow[];
  refreshed_at: string;
  snapshot_id: string;
  snapshot_version: number;
  available_periods: Array<{ type: 'month' | 'term' | 'year'; label: string }>;
  is_refreshing: boolean; // true if a refresh job is currently in flight
};
```

**Layout:**

```
<div className="flex flex-col gap-6 pb-10 p-6">
  <PageHeader title={t('title')} description={modelName} back={...} />
  {!ready ? (
    <NotReadyEmptyState />
  ) : (
    <>
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <VariancePeriodSelector ... />
        <RefreshButton ... />
      </header>
      <VarianceTable ... />
    </>
  )}
  <ManualActualsModal ... open={manualActualsModalOpen} ... />
</div>
```

PageHeader `back` prop: `{ href: \`/finance/budgeting/models/${id}\`, label: t('backToWorkspace') }`.

### 2. Not-ready empty state

Inline component (or a tiny `_components/not-ready-empty-state.tsx`). Two distinct flavours:

- **No published snapshot**: "Variance will be available once the model is published. Publish a snapshot to start tracking actuals." with a CTA "Publish snapshot" linking to `/snapshots`.
- **Fiscal year hasn't started**: "Variance will be available once the {fiscal_year_label} academic year begins (starts {date})." No CTA — just informational.

Determined by: `if (!model.current_snapshot_id) → no snapshot`; `else if (new Date(model.fiscal_year_start) > new Date()) → not started`; `else → ready`.

The not-ready state must NEVER display a table with zeros. The user should see no numeric content at all in this state — only the explanation.

### 3. Period selector — `_components/variance-period-selector.tsx`

NEW. Two-tier picker.

- Props: `{ selected: { type: 'month' | 'term' | 'year'; label: string }; available: Array<{ type: 'month' | 'term' | 'year'; label: string }>; onChange: (next) => void }`.
- Top tier: 3-button segmented control: Month / Term / Year (filled active state).
- Bottom tier: dropdown showing periods of the selected type. Default selection on first render = the latest period (newest by chronological order). The "available periods" are computed server-side based on what's in `variance_cache` for this model.
- Mobile: tier 1 stays horizontal segmented; tier 2 stays as a dropdown.
- Persists selection to URL: `?period_type=month&period_label=Sep%202026`.

### 4. Variance table — `_components/variance-table.tsx`

NEW. The body of the page.

- Props: `{ rows: VarianceRow[]; currencyCode: string; locale: string; onLogManualActual: (lineItemKey: string) => void; canManage: boolean }`.
- Group rows by category. Render category sections with sticky category headers showing the category total (sum of rows' planned / actual / variance / variance_pct). Sub-rows expand on click.
- Wrap the table in `<div className="overflow-x-auto">`. First column (line name) is sticky-start.
- Columns: Line item / Planned / Actual / Variance / Variance % / Actions.
- Conditional formatting on the variance % column:
  - 0–5% absolute → green band (`bg-emerald-50` / `text-emerald-700`).
  - 5–15% → amber (`bg-amber-50` / `text-amber-700`).
  - > 15% → red (`bg-red-50` / `text-red-700`).
  - For income rows where actual > planned (positive variance), green. Where actual < planned, polarity flips (red when bigger negative).
  - For cost rows the polarity is opposite: actual > planned (overspend) is bad → red.
- Each currency cell uses JetBrains Mono via `<CurrencyDisplay>`. Variance cell shows the absolute amount + the % stacked.
- Hover any row → if `drivers_json` is present (for tuition lines), show the "drivers of variance" tooltip — see §5.
- Actions cell:
  - For rows where `is_manual_entry_allowed`: show a "+ Log actual" button (gated on `canManage`), opens the manual-actuals modal.
  - For rows where actuals come from auto sources (Finance / Payroll), show a small label "Auto" with a tooltip explaining the source.
- Grand totals at the very top of the table (or just below the period selector): Revenue / Expenditure / Net with their variance amounts and %s.
- Mobile (<768px): table shape is preserved with horizontal scroll. Sticky first column. The actions cell collapses to an icon button.

### 5. Variance drivers tooltip — `_components/variance-drivers-tooltip.tsx`

NEW. The "why" tooltip for tuition lines.

- Props: `{ row: VarianceRow }`. Returns `null` if `row.drivers_json` is empty.
- Renders a tooltip (via `@school/ui` `HoverCard` or `Tooltip` with rich content) on hover. On mobile: tap the row → modal pops up with same content.
- Inside, parse `drivers_json` and render a humanised explanation. Schema (defined by impl 06's variance service):

  ```typescript
  type TuitionDriversJson = {
    enrollment_delta_amount: number; // how much of the variance is enrollment-driven
    enrollment_delta_students: number; // signed integer: actual enrollment minus planned
    fee_delta_amount: number;
    fee_delta_pct: number;
    discount_delta_amount: number;
    discount_delta_pct: number;
    other_amount: number; // residual unexplained
  };
  ```

- Render lines like:

  > **£18k below plan**
  > • Year 4 enrollment came in 12 students lower than projected (£14k of the gap)
  > • Discount uptake 2.1pp higher than projected (£4k)
  > • Other / unexplained: £0

  Numbers in JetBrains Mono. Currency uses `<CurrencyDisplay>`.

- For non-tuition rows where `drivers_json` is null, the tooltip simply doesn't render. The hover effect is also suppressed so users don't get an empty tooltip.

### 6. Manual actuals modal — `_components/manual-actuals-modal.tsx`

NEW. For ops + capital lines where actuals must be entered manually.

- Props:
  ```typescript
  {
    open: boolean;
    onClose: () => void;
    modelId: string;
    lineItemKey: string;
    period: { type: 'month' | 'term' | 'year'; label: string };
    currentActual: number;        // pre-fill if there's already an entry for this period
    onSaved: () => void;
  }
  ```
- react-hook-form + zodResolver. Schema `manualActualsSchema` from `@school/shared/budgeting`:
  ```typescript
  z.object({
    line_item_key: z.string(),
    period_type: z.enum(['month', 'term', 'year']),
    period_label: z.string(),
    actual: z.number().min(0),
    notes: z.string().optional(),
  });
  ```
- Fields: actual amount (currency input, required), notes (textarea optional).
- Submit: `POST /api/v1/budgeting/financial-models/${modelId}/variance/manual-actuals` with the form values. On success: refresh the variance fetch (the parent page re-fetches), close modal, toast "Actual logged".
- Permission: `budgeting.manage`. The button to open this modal is hidden when permission is missing (also enforced by the line's `is_manual_entry_allowed` flag).
- Allowlist enforcement (defensive): the impl 06 backend should return `is_manual_entry_allowed: true` only for approved keys (Operations: Cleaning, Maintenance, Marketing, Other operations; Capital: any). The frontend trusts that flag — it doesn't reimplement the allowlist.

### 7. Refresh button — `_components/refresh-button.tsx`

NEW. Calls `POST /variance/refresh` and shows progress.

- Props: `{ modelId: string; refreshedAt: string | null; isRefreshing: boolean; onRefreshComplete: () => void; canTrigger: boolean }`.
- Renders a button with a refresh icon (`RefreshCw` from lucide). Label: "Refresh now".
- Right side of the button: a relative-time string `t('refreshedAgo', { time: formatRelative(refreshedAt) })` ("Refreshed 4 hours ago"). When `refreshedAt` is null: "Never refreshed".
- Click handler: `apiClient<{ data: { job_id: string } }>('/api/v1/budgeting/financial-models/${modelId}/variance/refresh', { method: 'POST' })`. On success, switch the button to "Refreshing…" + a small spinner + the icon spinning (`animate-spin`).
- After enqueueing, poll: every 5 seconds, refetch the variance endpoint and check `is_refreshing`. When false, call `onRefreshComplete()` and show toast "Variance updated". Cap polling at 60 seconds (12 polls) and timeout with a softer toast "Refresh is taking longer than expected — check back in a minute".
- Errors: catch and toast "Failed to refresh — please try again".
- Disabled when `canTrigger === false` (permission `budgeting.view` is sufficient — the refresh button is reachable to anyone who can view; it's a read-only operation triggering a recompute).
- Mobile: button text shrinks to icon-only at <640px; relative-time stays visible above the button as a small caption.

### 8. URL state

Persist `period_type` and `period_label` in the URL query string. Default values: latest period from `available_periods` on initial load — once `available_periods` arrives, if URL has no params, set them to the latest. Use `router.replace()` so back button isn't polluted.

### 9. Translation keys

Add to `apps/web/messages/en.json`:

```json
{
  "financeBudgetingVariance": {
    "title": "Variance",
    "backToWorkspace": "Back to workspace",
    "notReady": {
      "noSnapshot": {
        "title": "Variance will be available once the model is published",
        "body": "Publish a snapshot to start tracking actuals against your plan.",
        "cta": "Publish snapshot"
      },
      "yearNotStarted": {
        "title": "Variance will be available once {fiscalYear} begins",
        "body": "The academic year starts {date}."
      }
    },
    "period": {
      "month": "Month",
      "term": "Term",
      "year": "Year",
      "selectPeriod": "Select period"
    },
    "refresh": {
      "label": "Refresh now",
      "refreshing": "Refreshing…",
      "ago": "Refreshed {time}",
      "neverRefreshed": "Never refreshed",
      "completed": "Variance updated",
      "failed": "Failed to refresh — please try again",
      "slow": "Refresh is taking longer than expected — check back in a minute"
    },
    "table": {
      "lineItem": "Line item",
      "planned": "Planned",
      "actual": "Actual",
      "variance": "Variance",
      "variancePct": "Variance %",
      "actions": "Actions",
      "logActual": "+ Log actual",
      "auto": "Auto",
      "autoTooltip": "Pulled automatically from {source}",
      "totals": {
        "revenue": "Revenue",
        "expenditure": "Expenditure",
        "net": "Net"
      },
      "categories": {
        "income": "Income",
        "staff_costs": "Staff Costs",
        "operations": "Operations",
        "capital": "Capital",
        "reserves_and_adjustments": "Reserves & Adjustments"
      }
    },
    "tooltip": {
      "headlineBelow": "{amount} below plan",
      "headlineAbove": "{amount} above plan",
      "enrollmentLine": "{yearGroup} enrolment came in {students} students {direction} than projected ({amount} of the gap)",
      "feeLine": "Fee uptake {direction} planned by {pct}pp ({amount})",
      "discountLine": "Discount uptake {direction} planned by {pct}pp ({amount})",
      "otherLine": "Other / unexplained: {amount}"
    },
    "manualActuals": {
      "title": "Log actual for {lineName}",
      "period": "Period: {period}",
      "actual": "Actual amount",
      "notes": "Notes (optional)",
      "submit": "Save actual",
      "cancel": "Cancel",
      "saved": "Actual logged"
    }
  }
}
```

Mirror the same English values into `messages/ar.json`.

### 10. Mobile

- Period selector: tier 1 horizontal; tier 2 dropdown (full width).
- Table: horizontal scroll with sticky-start first column.
- Tooltips become tap-to-open modals (use `@school/ui` `Modal` instead of `Tooltip` when `useMediaQuery('(max-width: 768px)')` returns true; or use `@school/ui` `HoverCard` which already adapts).
- Refresh button: icon-only at small screens.
- Manual actuals modal: full-screen sheet on mobile.

### 11. RTL

- Sticky-start first column uses `start-0`.
- Currency / numeric values: render inside `<span dir="ltr">`.
- All margins / paddings use logical properties.
- Variance bands (green/amber/red) — colors are direction-agnostic but ensure the icon (small arrow indicating up/down) flips correctly with `rtl:rotate-...` if used.

## Testing requirements

- **Component tests** (Jest + RTL):
  - `variance-period-selector.spec.tsx` — Month/Term/Year toggle calls onChange with correct type.
  - `variance-table.spec.tsx`:
    - Conditional formatting bands apply at 4% (green), 8% (amber), 20% (red).
    - Income vs cost polarity flips correctly.
    - Manual entry button only shows when `is_manual_entry_allowed`.
    - Sticky-start first column applied.
  - `variance-drivers-tooltip.spec.tsx` — renders enrollment / fee / discount / other lines from `drivers_json`; returns null when drivers_json is empty.
  - `manual-actuals-modal.spec.tsx` — submits form, calls onSaved.
  - `refresh-button.spec.tsx` — clicking enqueues the request; polls; calls onRefreshComplete on completion.
- **Integration test** for the page:
  - Loads with no snapshot → renders not-ready state. No table rendered. No console errors.
  - Loads with snapshot but year not yet started → renders the "year not started" message.
  - Loads ready model → variance table populated.
  - Switching period type re-fetches with the right query params.
  - Clicking refresh enqueues + polls + refreshes UI.
  - Manual actuals modal flow: open → submit → close → variance refetched.
- **No regression** — `pnpm turbo run test --filter=@school/web`.
- **Type-check + lint** at root.

## Post-deploy verification

1. Local gauntlet passes.
2. Commit (`feat(budgeting): variance dashboard`), rsync, chown, `pnpm --filter @school/web build`, `pm2 restart web`.
3. `/api/health` 200; PM2 logs clean.
4. Acquire Playwright lock and run:
   - Authenticate as `owner@nhqs.test`.
   - Pre-condition: NHQS needs a published snapshot AND variance_cache rows. Two test models cover the states:
     - **State A — not ready**: navigate to a draft model's variance page. Assert: not-ready empty state visible, no table.
     - **State B — ready** (a published model whose fiscal_year_start has passed). If NHQS doesn't have such a model, create one via:
       ```
       browser_evaluate(() => fetch('/api/v1/budgeting/financial-models', { method: 'POST', body: JSON.stringify({ name: 'NHQS 2024/25 (backdated)', fiscal_year_start: '2024-09-01', fiscal_year_end: '2025-08-31', horizon_years: 1 }) }))
       ```
       Then publish it and trigger a variance refresh via `POST /variance/refresh`.
   - `browser_navigate('https://nhqs.edupod.app/en/finance/budgeting/models/<published-id>/variance')`.
   - Assert: period selector renders. Variance table renders rows.
   - Click "Refresh now" → button switches to "Refreshing…", spinner spins. Wait up to 60s. Assert: button returns to "Refresh now" + new "Refreshed N seconds ago" timestamp.
   - Hover a tuition row → assert tooltip renders with enrollment/fee/discount breakdown.
   - Click "+ Log actual" on an Operations / Maintenance row → modal opens. Type 12000 → submit. Assert: modal closes, table re-fetched, the row's actual updates.
   - Resize to 375px:
     - Period selector tier 1 still horizontal.
     - Table horizontal-scrolls with sticky-start first column.
     - Refresh button is icon-only.
   - Capture `browser_console_messages(level: 'error')`. Assert empty.
5. Release Playwright lock; append §5 record.

## Follow-ups

- The "manual entry allowlist" lives server-side (impl 06's `is_manual_entry_allowed` flag). The frontend doesn't reimplement it; if a phase 21 review wants the allowlist visible in code as a constant for design review, lift it from impl 06 into `@school/shared/budgeting/variance.ts`.
- Polling cadence (5s, 60s cap) is a reasonable default — phase 21 may want to tune it based on observed worker latency.
- The variance endpoint signature presumes impl 06 returns `available_periods` and `is_refreshing` flags. If those fields aren't there, request them in impl 06 before this phase deploys.

## Rollback

`git revert <commit-sha>` then `pm2 restart web`. The revert removes the variance page entirely; any link to it from the workspace (impl 13's "Variance" button) will hit a 404. No DB changes; no permission changes; manual actuals already persisted to `variance_cache` survive.
