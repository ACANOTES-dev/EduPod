# Implementation 14 — Scenario Compare View

> **Wave:** 4
> **Depends on:** 01 (schema), 03 (financial-models + scenarios services)
> **Deploys:** web restart only (`pm2 restart web`)

---

## Goal

Build the scenario compare view at `/finance/budgeting/models/[id]/compare`. Implements the **Q11/C Combined layout** — a persistent KPI strip across the top, then the body switches between three view modes via a segmented control: Chart (default), Cards, Table. Always renders base + up to 3 alternatives side-by-side.

The principal opens this view when they want to answer "what does the cautious case look like vs the growth case?" The KPI strip shows the headline numbers per scenario column; the body lets them dig in.

## What to change

### 1. Compare page — `apps/web/src/app/[locale]/(school)/finance/budgeting/models/[id]/compare/page.tsx`

NEW. `'use client'`.

**State:**

```typescript
type CompareState = {
  model: FinancialModelDetail | null;
  baseEngine: EngineOutputs | null; // computed from model.drivers
  scenarioEngines: Map<string, EngineOutputs>; // scenarioId -> EngineOutputs computed from merged drivers
  activeYear: number;
  view: 'chart' | 'cards' | 'table';
  isLoading: boolean;
  error: string | null;
};
```

**URL state**: `view` is read from / written to the URL query param (`?view=chart|cards|table`, default `chart`). Use `useSearchParams()` + `router.replace()` to keep URL in sync as the user toggles. `activeYear` is also URL-bound: `?year=1` (default 1).

**Effect: load model.** Same fetch as impl 13:

```typescript
const res = await apiClient<{ data: FinancialModelDetail }>(
  `/api/v1/budgeting/financial-models/${id}?include=scenarios,line_items`,
);
```

Then for each scenario + the base, compute engine output:

- Base: `runEngine({ drivers: model.drivers, source: model.source_snapshot_json, horizon_years: model.horizon_years })`.
- Each scenario: `runEngine({ drivers: mergeDriverOverrides(model.drivers, scenario.driver_overrides), source: model.source_snapshot_json, horizon_years: model.horizon_years })`.

These computations happen synchronously on the client — pure-TS, no API roundtrip. Even with 3 alternatives × multi-year, this completes in <50ms on a normal laptop.

**Layout** (mobile-first):

```
<div className="flex flex-col gap-6 pb-10 p-6">
  <PageHeader title={t('title')} description={... /* model name */} back={...} />
  <CompareKpiStrip ... />
  {model.horizon_years > 1 && <YearSelector ... />}
  <ViewToggle ... />
  {view === 'chart' && <CompareChart ... />}
  {view === 'cards' && <CompareCards ... />}
  {view === 'table' && <CompareTable ... />}
</div>
```

`PageHeader` `back` prop: `{ href: `/finance/budgeting/models/${id}`, label: 'Back to workspace' }`.

The page is read-only — no editing. Switching scenarios in compare mode doesn't write anything; users go back to the workspace to edit.

**Permissions**: `budgeting.view`. The page redirects to `/finance/budgeting` if missing. No `budgeting.manage` features here.

**No alternatives state**: when `model.scenarios.length === 0`, render an empty state instead of any of the views: "No alternative scenarios yet. Compare needs at least one alternative — add one from the workspace." with a "Back to workspace" button. Don't crash.

### 2. Compare KPI strip — `_components/compare-kpi-strip.tsx`

NEW. Persistent strip across the top, all 4 scenarios side-by-side.

- Props: `{ scenarios: Array<{ id: string | null; name: string; totals: YearTotals; perPupil: PerPupilEconomics }>; year: number; currencyCode: string; locale: string }`.
- Renders a horizontally scrollable row at <768px (`overflow-x-auto`); a 4-column grid at lg+.
- Each scenario gets a stacked card:
  - Scenario name at top (e.g. "Base case", "Cautious", "Growth", "Stress").
  - Revenue (currency, JetBrains Mono).
  - Expenditure (currency).
  - Net (currency, color-coded green/red).
  - Per-pupil net (smaller text).
  - **Delta vs base** badge: `+8.2k vs base` or `-12k vs base`, color-coded. The base scenario shows nothing in this slot (or shows "Base" pill).
- Visually de-emphasise the base column slightly (subtle background tint) so the alternatives stand out.

### 3. Compare chart — `_components/compare-chart.tsx`

NEW. Recharts grouped bar.

- Props: `{ scenarios: Array<{ id: string | null; name: string; totals: YearTotals }>; year: number; currencyCode: string; locale: string }`.
- Build the chart data:
  ```typescript
  const data = scenarios.map((s) => ({
    name: s.name,
    revenue: s.totals.revenue,
    expenditure: s.totals.expenditure,
    net: s.totals.net_result,
  }));
  ```
- Render a `<BarChart>` from `recharts` with grouped bars: revenue (green), expenditure (red), net (blue). X axis = scenario names. Y axis = currency, tick formatter using `Intl.NumberFormat(locale, { notation: 'compact', currency: currencyCode })`.
- Tooltip: hover any bar → tooltip card showing the scenario name + revenue / expenditure / net broken out.
- Legend at the bottom.
- Height: 360px on desktop, 280px on mobile.
- Mobile: chart stays rendered but constrained; the tooltip becomes a tap-and-hold popover.
- Accessibility: the chart has a `<title>` element via `aria-label="Scenario comparison chart"` and a hidden description listing scenario totals (so screen readers can read the underlying data).

### 4. Compare cards — `_components/compare-cards.tsx`

NEW. The 4-up cards view (preserving the Q11/A pattern as a view mode).

- Props: same shape as `CompareChart` but receives full `EngineOutputs` per scenario for richer detail.
- Renders a 4-column grid at lg+ (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`); 1-column on mobile.
- Each card:
  - Scenario name as header.
  - Revenue / Expenditure / Net stack (large numbers).
  - "Drivers summary" — 2-column mini-list of the 4–5 most-changed driver values vs the base case (when the scenario is base, list the absolute values; when alternative, show "salary_uplift_pct: 5% (+2pp vs base)" style).
  - A mini horizontal bar showing the revenue/expenditure ratio (no chart library, just two divs with widths).
  - A "View detail" link that switches the view to `table` and scrolls to that scenario's column.
- Mobile-first: stacked cards full-width.
- The drivers-summary computation: import `mergeDriverOverrides` from `@school/shared/budgeting`. For each scenario, compute the merged drivers, then diff against base on a fixed list of "headline" driver keys (salary_uplift_pct, enrollment growth average, fee uplift average, donations forecast, grants forecast, capex total). Render the top 5 with the highest absolute delta. The diffing helper can live inline in this component or in a `_lib/scenario-diff.ts` if the implementing session prefers.

### 5. Compare table — `_components/compare-table.tsx`

NEW. Cross-tab: rows = line items, columns = scenarios.

- Props:
  ```typescript
  {
    scenarios: Array<{
      id: string | null;
      name: string;
      lineItems: ComputedLineItem[]; // for the active year
    }>;
    year: number;
    currencyCode: string;
    locale: string;
  }
  ```
- Build the row set: for the active year, gather all unique `(category, subcategory)` pairs across all scenarios, sorted by category order then subcategory alphabetical.
- Group rows by category with sticky category headers.
- For each row, render N+1 columns (1 first column for the line name, N for the scenarios — the **first scenario column is always the base**):
  - Line name (truncate w/ tooltip).
  - Per scenario: amount (currency), beneath it `[delta vs base]` (e.g. `-£3,983 (-6%)`) color-coded. Base column shows the value with no delta.
- Use a real `<table>` element wrapped in `<div className="overflow-x-auto">`. First column is sticky-left (sticky-start logically — `start-0` + `sticky` + a background fill). Mobile: shows 2 columns at a time (base + 1 selected alternative); a chip group above the table lets the user pick which alternative to view.
- Color coding rules:
  - **Income lines (category = `income`)**: alternative larger than base = green (better); smaller = red (worse).
  - **Cost lines (`staff_costs`, `operations`, `capital`)**: alternative larger = red (worse); smaller = green (better).
- Bottom totals row: revenue / expenditure / net per scenario column.

### 6. View toggle — `_components/view-toggle.tsx`

NEW. Segmented control (Chart / Cards / Table).

- Props: `{ view: 'chart' | 'cards' | 'table'; onChange: (next: 'chart' | 'cards' | 'table') => void }`.
- Three buttons in a single rounded container with active-state styling. Use `@school/ui` `ToggleGroup` if present; otherwise build inline with three `<Button variant="ghost">` and a `data-active` attribute styled in Tailwind.
- Icon + label per option (`BarChart3` / `LayoutGrid` / `Table` from lucide).
- Mobile: still shows three buttons; if cramped, label is hidden and only icon remains (`sm:flex` toggle).
- Accessibility: role="radiogroup", each button role="radio" with `aria-checked`.

### 7. Year selector

REUSE the `<YearSelector>` component from impl 13 (`apps/web/src/app/[locale]/(school)/finance/budgeting/models/[id]/_components/year-selector.tsx`). Both pages live under the same `_components` directory, so import it directly.

### 8. Mobile

- KPI strip: horizontal scroll. Each scenario's stacked card maintains a min-width (e.g. `min-w-[200px]`) so content stays readable.
- Chart view: chart at 280px height, fits within the container.
- Cards view: 1 column.
- Table view: shows 2 columns (base + 1 selected alternative). Chip selector at the top to pick which alternative.
- View toggle: shrinks to icon-only on small screens.

### 9. RTL

- Charts: Recharts handles RTL natively for axes, but check tooltip positioning at runtime. If RTL flips look wrong, set `<BarChart layout="horizontal">` explicitly.
- Sticky-start on the table's first column uses `start-0 sticky` (logical). Background fill is `bg-surface`.
- Delta badges always render numeric in `dir="ltr"` regardless of locale.

### 10. Translation keys

Add to `apps/web/messages/en.json`:

```json
{
  "financeBudgetingCompare": {
    "title": "Compare scenarios",
    "back": "Back to workspace",
    "noScenarios": "No alternative scenarios yet",
    "noScenariosBody": "Compare needs at least one alternative scenario. Add one from the workspace.",
    "addAlternative": "Add an alternative",
    "viewToggle": {
      "chart": "Chart",
      "cards": "Cards",
      "table": "Table"
    },
    "kpi": {
      "revenue": "Revenue",
      "expenditure": "Expenditure",
      "net": "Net",
      "perPupil": "/ pupil",
      "deltaVsBase": "vs base",
      "basePill": "Base"
    },
    "chart": {
      "ariaLabel": "Scenario comparison chart",
      "legendRevenue": "Revenue",
      "legendExpenditure": "Expenditure",
      "legendNet": "Net"
    },
    "cards": {
      "driversSummary": "Drivers summary",
      "viewDetail": "View detail"
    },
    "table": {
      "linesHeader": "Line item",
      "totalsRow": "Total",
      "revenueLabel": "Revenue",
      "expenditureLabel": "Expenditure",
      "netLabel": "Net result",
      "mobileScenarioPicker": "Compare {name} vs Base"
    }
  }
}
```

Mirror identical English strings into `messages/ar.json`.

### 11. URL handling

Use `useSearchParams()` + `useRouter()` to keep `view` and `year` in the URL:

```typescript
const setView = (next: 'chart' | 'cards' | 'table') => {
  const url = new URL(window.location.href);
  url.searchParams.set('view', next);
  router.replace(url.pathname + url.search, { scroll: false });
};
```

This keeps the back button working as users toggle and lets them share a specific view via copy-paste link.

## Testing requirements

- **Component tests** (Jest + RTL):
  - `compare-kpi-strip.spec.tsx` — renders 4 cards when 3 alternatives + base; renders just 1 (base) when no alternatives; deltas render correctly.
  - `compare-chart.spec.tsx` — passes correct data to Recharts (snapshot-test the data structure, not the SVG).
  - `compare-cards.spec.tsx` — renders driver-diff lines correctly.
  - `compare-table.spec.tsx` — color-codes income green/red appropriately; cost lines flip the polarity; sticky-start column applies.
  - `view-toggle.spec.tsx` — clicking each button calls `onChange` with the right value.
- **Integration test** for the page (mocked apiClient):
  - Loads model with 2 scenarios → all three views render the right number of columns.
  - Clicking the toggle switches between views and updates URL.
  - Year selector updates `year` URL param.
  - Empty-state shows when scenarios array is empty.
- **No regression** — `pnpm turbo run test --filter=@school/web`.
- **Type-check + lint** at root.

## Post-deploy verification

1. Local gauntlet passes.
2. Commit (`feat(budgeting): scenario compare view (chart / cards / table)`), rsync, chown, `pnpm --filter @school/web build`, `pm2 restart web`.
3. `/api/health` 200; PM2 logs clean.
4. Acquire Playwright lock and run:
   - Authenticate as `owner@nhqs.test`.
   - Pre-condition: NHQS model from impl 12/13 needs at least one alternative scenario. Either create one via `browser_evaluate(() => fetch('/api/v1/budgeting/financial-models/<id>/scenarios', { method: 'POST', body: JSON.stringify({ name: 'Cautious', position: 0, driver_overrides: { salary_uplift_pct: 5, enrollment_growth_pct_by_year_group: {} } }) }))` or via the workspace UI from impl 13 if its scenario-strip "+ Add" button is wired.
   - `browser_navigate('https://nhqs.edupod.app/en/finance/budgeting/models/<id>/compare')`.
   - Assert: KPI strip renders 2+ scenario cards (base + Cautious). Chart view default. URL contains `view=chart`.
   - Click "Cards" → assert URL becomes `view=cards`, the cards view replaces the chart.
   - Click "Table" → assert URL `view=table`, table renders with N+1 columns. Sticky first column visible while scrolling horizontally.
   - Resize to 375px → assert table shows base + scenario-picker chip (only 2 columns visible). Chart shrinks to fit. Cards stack vertically.
   - Capture `browser_console_messages(level: 'error')`. Assert empty (Recharts has been finicky historically — if a "ResizeObserver loop limit exceeded" warning appears, treat as benign and note it but don't block).
5. Release Playwright lock; append §5 record.

## Follow-ups

- The chart view's color tokens may need tuning during phase 21's design polish.
- The drivers-diff computation in compare-cards may extract to a reusable lib if impl 16 (snapshots history) wants to show a similar diff.
- The mobile scenario-picker chip in the table is a deliberate compromise — consider a swipe-to-scroll gesture as a phase 21 enhancement if user feedback warrants it.

## Rollback

`git revert <commit-sha>` then `pm2 restart web`. The revert removes the compare page; the workspace's "Compare scenarios" button (built in impl 13) will route to a 404 — acceptable given the link from the workspace will also need re-wiring on revert. No DB changes, no permission changes.
