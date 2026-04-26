# Implementation 13 — Financial Model Workspace UI

> **Wave:** 4
> **Depends on:** 01 (schema), 02 (driver engine), 03 (financial-models service), 04 (line-items service)
> **Deploys:** web restart only (`pm2 restart web`)

---

## Goal

Build the central frontend surface of the rebuild: the financial model workspace at `/finance/budgeting/models/[id]`. Implements the **Q10/C Hybrid layout** — KPI strip across the top, scenario strip below, line-item table dominating the body, drivers slide in from the end edge as a drawer. Live recompute as the user tunes drivers, debounced persistence.

This is THE page the principal opens to plan next year. Everything must feel instant: editing a driver in the drawer recomputes the table in milliseconds (frontend runs the engine locally), then quietly persists 500ms later.

## What to change

### 1. Workspace page — `apps/web/src/app/[locale]/(school)/finance/budgeting/models/[id]/page.tsx`

NEW. `'use client'`. Top-level orchestrator for the workspace.

**State shape** (a single `useReducer` keeps state coherent across editor / drivers / scenario switching):

```typescript
type WorkspaceState = {
  model: FinancialModel | null; // server-shaped row
  drivers: Drivers; // mutable working copy
  source: SourceDataSnapshot; // captured at model creation; server-of-truth
  baseLineItems: ComputedLineItem[]; // recomputed locally as drivers change
  baseTotals: YearTotals[];
  perPupil: PerPupilEconomics[];
  scenarios: Scenario[]; // alternatives with their own driver_overrides
  activeScenarioId: string | null; // null = base case
  activeFiscalYear: number; // 1..horizon_years
  customLineItems: FinancialModelLineItem[]; // custom + override rows from server
  isDriversDrawerOpen: boolean;
  isLoading: boolean;
  isSaving: boolean;
  saveError: string | null;
  warnings: EngineWarning[];
};
```

**Reducer actions:** `LOAD_OK`, `LOAD_ERROR`, `SET_DRIVER`, `SET_PER_YEAR_DRIVER`, `SWITCH_SCENARIO`, `SWITCH_YEAR`, `OPEN_DRAWER` / `CLOSE_DRAWER`, `OPTIMISTIC_LINE_UPDATE`, `LINE_PERSIST_OK`, `LINE_PERSIST_ERROR`, `RECOMPUTE` (called after every `SET_DRIVER` to refresh `baseLineItems` / `baseTotals` / `perPupil`).

**Effect: initial load.** On mount, fetch the model:

```typescript
const res = await apiClient<{ data: FinancialModelDetail }>(
  `/api/v1/budgeting/financial-models/${id}?include=scenarios,line_items`,
);
```

The `FinancialModelDetail` shape (defined in impl 03's response transformer) is:

```typescript
type FinancialModelDetail = {
  ...FinancialModelBaseFields;
  source_snapshot_json: SourceDataSnapshot;
  drivers: Drivers;
  scenarios: Array<{ id: string; name: string; position: number; driver_overrides: PartialDrivers; notes: string | null }>;
  line_items: FinancialModelLineItem[];        // all rows for this model (base + scenario)
};
```

If `204` / not found → router.replace to `/models` and toast "Model not found".

After load, dispatch `LOAD_OK` and run `runEngine({ drivers, source, horizon_years: model.horizon_years })` to populate `baseLineItems` / `baseTotals` / `perPupil`.

**Effect: debounced persist.** A `useEffect` watches `drivers` and on change debounces 500ms via `setTimeout` (clear on next change), then `apiClient<{ data: FinancialModelDetail }>(`/api/v1/budgeting/financial-models/${id}`, { method: 'PATCH', body: JSON.stringify({ drivers: state.drivers }) })`. Server returns the **server-recomputed** line items; we reconcile by replacing local `baseLineItems` with the server's response (this is the "server is the source of truth" reconciliation — local engine is for instant feedback only). On error, set `saveError`, surface a toast.

**Live recompute optimization.** When the user is actively typing in the drawer, recompute on each keystroke locally. We don't issue an API call for each keystroke — debounce handles persistence. If the user closes the drawer before the debounce fires, force-flush the pending save.

**Layout** (mobile-first):

```
<div className="flex flex-col gap-4 pb-10">
  <WorkspaceHeader ... />
  <KpiStrip ... />
  <ScenarioStrip ... />
  {model.horizon_years > 1 && <YearSelector ... />}
  <LineItemTable ... />
</div>
<DriversDrawer ... />   {/* portal-mounted, slides from end */}
```

`WorkspaceHeader` (inline component or a tiny separate file):

- Editable model name (click pencil icon → input → blur to save). Permission: `budgeting.manage`.
- Status badge: Draft / Published v3 / Archived.
- Action buttons row (right side LTR, left RTL via flex order):
  - `Drivers` (opens drawer; primary, prominent)
  - `Compare scenarios` (link to `/compare`; gated on at least one scenario existing — disabled tooltip if none)
  - `Variance` (link to `/variance`; gated on `currentSnapshotId !== null` — disabled "Publish first" tooltip otherwise)
  - `Snapshots` (link to `/snapshots`)
  - `Publish` (gated on `budgeting.publish` AND status === 'draft'). Opens publish modal — for impl 13 the button is a link/intent; the actual modal is owned by impl 16. Until 16 ships, the button can route to `/snapshots` where the publish action will live, OR be temporarily disabled with a "Coming after impl 16" tooltip. Implementing session must pick one — the simplest is "disabled with tooltip, enable after 16 ships" but check impl 16's status when this phase actually executes.
- On mobile: collapse buttons into a kebab menu, leaving only `Drivers` visible inline.

### 2. KPI strip — `_components/kpi-strip.tsx`

NEW. 4 stat cards across the top.

- Props: `{ totals: YearTotals; perPupil: PerPupilEconomics; year: number; currencyCode: string; locale: string; isSaving: boolean }`.
- 4 tiles (use `@school/ui` `StatCard` if it has the right shape; otherwise build inline reusing the existing `KpiTile` pattern from finance hub):
  1. **Revenue** — `totals.revenue`, formatted with `CurrencyDisplay`, JetBrains Mono. Subtitle: "Year {year}".
  2. **Expenditure** — `totals.expenditure`, currency. Red accent if it exceeds revenue.
  3. **Net result** — `totals.net_result`, currency. Green if positive, red if negative.
  4. **Per pupil** — `perPupil.net_per_student`, currency. Subtitle: `${formatCurrency(perPupil.revenue_per_student)} / ${formatCurrency(perPupil.expenditure_per_student)}` (revenue/expenditure mini-breakdown).
- Mobile: 2-column grid (`grid-cols-2 lg:grid-cols-4`).
- A subtle "Saving…" indicator pinned to one corner when `isSaving`.

### 3. Scenario strip — `_components/scenario-strip.tsx`

NEW. Below the KPI strip. Horizontally scrollable on mobile.

- Props: `{ scenarios: Scenario[]; activeScenarioId: string | null; onSwitch: (id: string | null) => void; canManage: boolean; modelId: string }`.
- Renders chips: first chip is "Base case" (active when `activeScenarioId === null`); then up to 3 chips for each alternative, ordered by `position`. After the last alternative, if `scenarios.length < 3` AND `canManage`, render a "+ Add scenario" chip that opens a small modal asking for name → POSTs to `/api/v1/budgeting/financial-models/${modelId}/scenarios`. Each chip is a button with active-state styling (filled background when active, ghost when not).
- Right side of the strip: a "Manage" link to `/compare?manage=true` (impl 14) when there are alternatives — useful for renaming / deleting.
- When the user clicks an alternative chip, dispatch `SWITCH_SCENARIO`. The reducer:
  1. Sets `activeScenarioId`.
  2. Computes effective drivers via `mergeDriverOverrides(state.drivers, scenario.driver_overrides)`.
  3. Runs `runEngine` against those.
  4. Replaces the table's view with the recomputed lines.
- Persist switching only as a UI state thing — switching scenarios doesn't write anything to the backend. It's a view-mode toggle.
- The drawer also reflects active scenario: when an alternative is active, drawer inputs show the **merged** values, but edits write to the scenario's `driver_overrides` not the base `drivers`. This is the trickiest piece — see §4 below.

### 4. Drivers drawer — `_components/drivers-drawer.tsx`

NEW. Slides in from the **end edge** (right in LTR, left in RTL). On mobile becomes a full-screen sheet.

- Built on `@school/ui` `Sheet` component (`<Sheet side="end">`).
- Props: `{ open: boolean; onClose: () => void; drivers: Drivers; activeScenario: Scenario | null; horizonYears: number; activeYear: number; sourceData: SourceDataSnapshot; onDriverChange: (path: DriverPath, value: unknown) => void }`.
- Layout inside the sheet:
  - Header: "Drivers" + close button. Subtitle showing which scenario is active (e.g. "Editing: Base case" or "Editing: Cautious — overrides only").
  - Tabs (or section accordion): "Enrollment & fees", "Staff", "Operations", "Capital", "Other income".
  - Per-section editable fields:
    - **Enrollment & fees** — for each `year_group_id` in `sourceData.students_by_year_group`, render two number inputs:
      - "Enrollment growth %" (driver `enrollment_growth_pct_by_year_group[ygId]`)
      - "Fee uplift %" (driver `fee_uplift_pct_by_year_group[ygId]`)
      - Plus 2 read-only summary fields per year group: current active count, current annual fee per student.
      - Discount capture % and Scholarship capture % below as flat numeric inputs.
    - **Staff** — for each `department_id` in `sourceData.staff_by_department`:
      - "Headcount delta" — integer stepper (`-` / value / `+`).
      - Read-only: current headcount, total annual payroll.
      - At the section bottom: "Salary uplift %" flat numeric input.
    - **Operations** — flat numeric inputs:
      - Utilities inflation %
      - Materials inflation %
      - Read-only context: prior-year actual utilities / materials (from `sourceData.prior_year_actuals`).
    - **Capital** — list view of `drivers.capex_items`:
      - Each item: name input, amount input, fiscal year select (1..horizonYears), notes optional.
      - "+ Add capex item" button at the bottom (generates a new item with `id = nanoid()`).
      - Trash icon per row to delete.
    - **Other income** — donations forecast (numeric), grants forecast (numeric).
- Each input has logical-property spacing (`mt-4` for top-margin between rows is fine — `mt` is logical for vertical), but never `pl-` / `pr-` etc. Use `ps-` / `pe-`.
- Each field's `onChange` calls `onDriverChange(path, value)`. The parent reducer translates this:
  - If `activeScenarioId === null`: write to `state.drivers[path]` directly.
  - If `activeScenarioId !== null`: write to `state.scenarios[i].driver_overrides[path]`. The merged drivers + recompute happen automatically on the next render.
- Multi-year support: when `horizon_years > 1`, render a small "Apply to year:" selector at the top of the drawer (default "All years" or "Year 1"). When set to a specific year, edits target `drivers.per_year[year][path]` instead of the top-level `drivers[path]`. This enables the "year 2 has different fee uplift than year 1" use case from PLAN.md §4.2.
- Warnings panel (sticky at the bottom): show `state.warnings` as a list when non-empty (e.g. "No fee structure for Year 7 — assumed 0 revenue"). Dismissible with "x" per warning (but they reappear on next recompute since they're derived from engine output — that's intentional).
- Mobile: `<Sheet side="bottom">` with full-height. The sheet's content scrolls; close handle at the top.

The drawer's input components should be lightweight wrappers around shadcn `Input` / `Select` from `@school/ui`. Number inputs use `inputMode="decimal"` and accept negative values where appropriate (headcount delta).

### 5. Line item table — `_components/line-item-table.tsx`

NEW. The body of the workspace. Categorised, editable rows.

- Props:
  ```typescript
  {
    lineItems: ComputedLineItem[];                  // engine output (base case OR merged scenario)
    customLineItems: FinancialModelLineItem[];     // server rows: source = 'custom' | 'override' for the active scenario
    activeYear: number;
    activeScenarioId: string | null;
    currencyCode: string;
    locale: string;
    canManage: boolean;
    modelId: string;
    onLineMutate: (action: LineMutationAction) => void;
  }
  ```
- Logical layout: `<div>` (no `<table>` element on mobile, keeps things simpler — but use a real `<table>` at `md:` and above for accessibility / keyboard nav).

- Five collapsible category sections (use `_components/category-section.tsx`):
  - Income
  - Staff Costs
  - Operations
  - Capital
  - Reserves & Adjustments
- Each section header shows the category name + the year's category total + an "Add line" button (gated on `canManage`).
- Inside the section, rows are computed by **merging** `lineItems` (engine output, source `driver_derived`) with the relevant `customLineItems` (source `custom` | `override`). Override rows replace their derived counterparts (matched by `category` + `subcategory`); custom rows append.
- Each row's columns:
  - Name (truncate w/ tooltip).
  - Source badge: "Driver" (gray) / "Custom" (blue) / "Override" (amber). Lock icon (filled when `is_locked`).
  - Amount: clickable to edit inline. JetBrains Mono. On click → input swap; on blur → `onLineMutate({ type: 'EDIT', lineItemId, newAmount })` which posts `PATCH /api/v1/budgeting/financial-models/${modelId}/line-items/${lineItemId}` (or POST to create a new override if the row was originally `driver_derived`). Optimistic update; reconcile on response.
  - Notes hover (popover on hover for a row with `notes`).
  - References-event chip when `references_event_budget_id` is set (renders a small "Linked to: {event.name}" pill).
  - Trash icon (only for `custom` and `override` rows; deleting an `override` reverts to the underlying `driver_derived` value).
- Mobile: each section becomes a card with a "Show {N} lines" button that expands to show rows stacked vertically; tap a row to open an edit popover (`@school/ui` `Popover` or modal).
- Locking: clicking the lock icon toggles `is_locked` via PATCH. Locked rows survive driver changes (they don't recompute).

### 6. Category section — `_components/category-section.tsx`

NEW. Collapsible group used by line-item-table.

- Props: `{ title: string; total: number; items: React.ReactNode; defaultOpen?: boolean; onAddLine?: () => void; canManage: boolean }`.
- Renders a clickable header that toggles open state (chevron icon, `rotate-90` when open).
- Header right side shows the section's currency total.
- When open, renders `items` (the rows) and the "+ Add line" button at the bottom if `canManage` and `onAddLine` provided.

### 7. Add-line modal — `_components/add-line-modal.tsx`

NEW. For creating custom lines.

- Props: `{ open: boolean; onClose: () => void; modelId: string; scenarioId: string | null; year: number; defaultCategory: FinancialModelLineItemCategory; onCreated: (line: FinancialModelLineItem) => void }`.
- react-hook-form + zodResolver, schema `addLineItemSchema` from `@school/shared/budgeting` (request impl 04 to expose if not present).
- Fields: name (required), category (Select, default from props), subcategory (text input — free-form), fiscal year (Select 1..horizonYears, default from props), amount (number, required), notes (textarea optional), references_event_budget_id (optional autocomplete searching `/api/v1/budgeting/event-budgets`).
- Submit: `POST /api/v1/budgeting/financial-models/${modelId}/line-items` with `{ scenario_id, source: 'custom', ...form }`. On success, `onCreated(returnedLine)` which the workspace appends to `customLineItems`.
- Permission: `budgeting.manage`.

### 8. Edit-line popover — `_components/edit-line-popover.tsx`

NEW. The "click amount to edit" experience.

- Two modes:
  - **Inline** (desktop, on a `driver_derived` row): a quick numeric input swap; blur = save as `override`.
  - **Popover** (mobile or for `custom`/`override` rows with notes): full popover with name (read-only or editable depending on source), amount, notes, lock toggle, delete button.
- API calls:
  - Edit a `driver_derived` amount → POSTs a new override row: `POST /api/v1/budgeting/financial-models/${modelId}/line-items` with `source: 'override'`, the original derived row's `category` + `subcategory` + `fiscal_year`, the new amount.
  - Edit an existing `custom` or `override` row → `PATCH /line-items/${id}` with the new fields.
  - Toggle lock → PATCH with `is_locked`.
  - Delete a row → DELETE `/line-items/${id}` (custom and override only; never delete `driver_derived` — those don't exist as rows).

### 9. Year selector — `_components/year-selector.tsx`

NEW. Visible only when `model.horizon_years > 1`.

- Props: `{ horizon: 1 | 3 | 5; activeYear: number; onChange: (year: number) => void }`.
- Renders a horizontally scrollable chip group: "Year 1 (2026/27)" / "Year 2 (2027/28)" / "Year 3 (2028/29)". Active chip is filled.
- Mobile: horizontally scrollable with `overflow-x-auto`.
- Year-label format: derive from `model.fiscal_year_start` + offset year. The label displays the academic year shorthand (e.g. "2026/27" if start = Sep 2026).

### 10. Loading / error states

- Initial load: full-page skeleton — KPI tiles as `<Skeleton />`, a table-shaped skeleton below, no drawer.
- 404 model: redirect to `/models` with toast "Model not found".
- 403 (no permission): redirect to `/finance/budgeting` with toast "You don't have access to this model".
- Save error: a non-blocking toast "Failed to save changes — retrying…" plus a yellow banner pinned at the bottom of the screen with a Retry button. Implementing session decides if a retry is automatic (probably yes — schedule another save in 3 seconds with exponential backoff up to 30s).

### 11. Currency formatting

Use the existing `<CurrencyDisplay>` component from `apps/web/src/app/[locale]/(school)/finance/_components/currency-display.tsx` — copy/import the same pattern. Tenant currency code via `useTenantCurrency()` hook (already exists).

### 12. Translation keys

Add to `apps/web/messages/en.json`:

```json
{
  "financeBudgetingWorkspace": {
    "title": "Financial model",
    "loading": "Loading…",
    "saving": "Saving…",
    "saved": "Saved",
    "saveFailed": "Failed to save changes",
    "header": {
      "draft": "Draft",
      "publishedV": "Published v{n}",
      "archived": "Archived",
      "drivers": "Drivers",
      "compare": "Compare scenarios",
      "variance": "Variance",
      "snapshots": "Snapshots",
      "publish": "Publish snapshot",
      "publishDisabled": "Already published — create a new draft to edit",
      "varianceDisabled": "Publish a snapshot first to enable variance tracking",
      "compareDisabled": "Add an alternative scenario to compare"
    },
    "kpi": {
      "revenue": "Revenue",
      "expenditure": "Expenditure",
      "net": "Net result",
      "perPupil": "Per pupil",
      "year": "Year {n}"
    },
    "scenarios": {
      "base": "Base case",
      "addAlternative": "+ Add scenario",
      "newName": "Scenario name",
      "create": "Create scenario",
      "manage": "Manage scenarios"
    },
    "drawer": {
      "title": "Drivers",
      "editingBase": "Editing: Base case",
      "editingScenario": "Editing: {name} (overrides only)",
      "applyToYear": "Apply to year",
      "allYears": "All years",
      "yearN": "Year {n}",
      "sections": {
        "enrollmentFees": "Enrollment & fees",
        "staff": "Staff",
        "operations": "Operations",
        "capital": "Capital",
        "otherIncome": "Other income"
      },
      "fields": {
        "enrollmentGrowth": "Enrollment growth %",
        "feeUplift": "Fee uplift %",
        "discountCapture": "Discount capture %",
        "scholarshipCapture": "Scholarship capture %",
        "headcountDelta": "Headcount delta",
        "salaryUplift": "Salary uplift %",
        "utilitiesInflation": "Utilities inflation %",
        "materialsInflation": "Materials inflation %",
        "donationsForecast": "Donations forecast",
        "grantsForecast": "Grants forecast",
        "capexAdd": "+ Add capex item",
        "capexName": "Name",
        "capexAmount": "Amount",
        "capexFiscalYear": "Year",
        "capexNotes": "Notes"
      }
    },
    "table": {
      "categories": {
        "income": "Income",
        "staff_costs": "Staff Costs",
        "operations": "Operations",
        "capital": "Capital",
        "reserves_and_adjustments": "Reserves & Adjustments"
      },
      "addLine": "+ Add line",
      "source": {
        "driver_derived": "Driver",
        "custom": "Custom",
        "override": "Override"
      },
      "lockTitle": "Lock this line so it doesn't recompute",
      "unlockTitle": "Unlock — let drivers recompute",
      "deleteTitle": "Delete custom line"
    },
    "yearSelector": {
      "label": "Year",
      "yearN": "Year {n}",
      "academicYear": "{from}/{to}"
    },
    "addLineModal": {
      "title": "Add custom line",
      "name": "Name",
      "category": "Category",
      "subcategory": "Subcategory",
      "fiscalYear": "Fiscal year",
      "amount": "Amount",
      "notes": "Notes (optional)",
      "referencesEvent": "Linked event budget (optional)",
      "submit": "Add line",
      "cancel": "Cancel"
    }
  }
}
```

Mirror identical English strings into `messages/ar.json` (placeholder; phase 21 translates).

### 13. Mobile

- KPI strip: 2-col grid at <768px, 4-col at >=lg.
- Scenario strip: horizontal scroll with `overflow-x-auto`.
- Year selector: horizontal scroll.
- Line item table: stacked cards.
- Drivers drawer: bottom sheet at <768px (`<Sheet side="bottom" className="h-[90vh]">`), end-side at desktop (`<Sheet side="end">` resolving to right in LTR / left in RTL through the existing logical-direction handling in `@school/ui`).
- Header buttons: collapse to kebab menu on mobile leaving only the "Drivers" CTA.

### 14. RTL

- Drawer slides from the start side in RTL. The `Sheet` component's `side="end"` already resolves logically — confirm by inspecting `packages/ui/src/components/sheet.tsx` and adjust if it's hardcoded to `right`.
- All margins / paddings / borders use logical properties (`me-`, `ms-`, `pe-`, `ps-`, `border-s-`, `border-e-`, `start-`, `end-`).
- Numeric values use `dir="ltr"` on their inner span (currency, percentages).
- Chevrons / arrows use `rtl:rotate-180`.

### 15. API contract — server side

The implementation depends on impl 03 exposing:

- `GET /api/v1/budgeting/financial-models/:id?include=scenarios,line_items` → `FinancialModelDetail`.
- `PATCH /api/v1/budgeting/financial-models/:id` accepting `{ name?, description?, drivers? }` and returning the updated detail with **server-recomputed** line items.
- `POST /api/v1/budgeting/financial-models/:id/scenarios` → `{ name, position, driver_overrides }` → returns the scenario.
- `PATCH /api/v1/budgeting/financial-models/:id/scenarios/:sid` → `{ name?, driver_overrides? }`.
- `DELETE /api/v1/budgeting/financial-models/:id/scenarios/:sid`.

And impl 04 exposing:

- `POST /api/v1/budgeting/financial-models/:id/line-items` → creates a custom or override row.
- `PATCH /api/v1/budgeting/financial-models/:id/line-items/:lid` → updates amount / is_locked / notes.
- `DELETE /api/v1/budgeting/financial-models/:id/line-items/:lid`.

If any of these don't match impl 03 / 04's actual shape on phase 13's start day, surface the gap and pause — don't shim around it.

## Testing requirements

- **Unit tests** for components (Jest + RTL):
  - `kpi-strip.spec.tsx` — renders 4 tiles with correct values; net is green when positive, red when negative.
  - `scenario-strip.spec.tsx` — renders base + alternatives, click switches active.
  - `year-selector.spec.tsx` — formats academic year labels.
  - `line-item-table.spec.tsx` — merges custom + derived rows correctly; locked row shows lock icon.
  - `category-section.spec.tsx` — collapsible toggle.
  - `drivers-drawer.spec.tsx` — input change calls `onDriverChange` with correct path.
- **Integration test** for the workspace page (mocked apiClient):
  - Loads, populates KPI strip from `runEngine` output.
  - Editing a driver in the drawer recomputes the table within one render cycle.
  - Switch to alternative scenario → KPI / table reflect merged drivers.
  - Add a custom line via modal → row appears.
  - Override a derived line → POSTs an override; table reflects new value.
- **Engine call** in the test environment: import the actual `runEngine` from `@school/shared/budgeting` (don't mock it — its determinism is exactly what we want to test our wiring against).
- **Type-check + lint** at root.
- **No regression** — `pnpm turbo run test --filter=@school/web`.

## Post-deploy verification

1. Local gauntlet passes.
2. Commit (`feat(budgeting): financial model workspace UI`), rsync, chown, `pnpm --filter @school/web build`, `pm2 restart web`.
3. Confirm `/api/health` 200 and PM2 logs clean.
4. Acquire Playwright lock and run:
   - Authenticate as `owner@nhqs.test`.
   - Pre-condition: an NHQS financial model must exist (impl 12's create flow can seed one via `browser_evaluate(() => fetch('/api/v1/budgeting/financial-models', { method: 'POST', body: JSON.stringify({ name: 'NHQS 2026/27', fiscal_year_start: '2026-09-01', fiscal_year_end: '2027-08-31', horizon_years: 1 }) }))`).
   - `browser_navigate('https://nhqs.edupod.app/en/finance/budgeting/models/<id>')`.
   - Assert: KPI strip renders 4 stats with non-zero or "—" values; line-item table renders Income / Staff Costs / Operations sections at minimum.
   - Click "Drivers" — drawer slides in. Change `salary_uplift_pct` from 3 to 10. Wait 600ms. Assert: KPI strip's expenditure value increased; PATCH request was sent.
   - Switch to a scenario chip if any exist (or skip if none — the chip strip should still render with just the base case).
   - Add a custom line via the modal: category = Operations, subcategory = "IT subscriptions", amount = 12000. Assert the row appears in the Operations section.
   - Capture `browser_console_messages(level: 'error')`. Assert empty.
5. Mobile run at 375px — confirm:
   - KPI tiles stack 2x2.
   - Drawer becomes a bottom sheet.
   - Line item table is stacked cards.
6. Release Playwright lock; append the §5 record with the exact pages covered, console-error count (zero), and run timestamp.

## Follow-ups

- Impl 14 will live under the same `models/[id]/compare` segment.
- Impl 15 / 16 / 19 will use the same workspace header's button row.
- `useRequiresPermission` and `useTenantCurrency` may not exist by exactly those names in the existing codebase — implementing session checks `apps/web/src/lib/` and the existing finance pages and reuses whatever pattern is current.
- The publish modal lives in impl 16. Impl 13's "Publish" button is intentionally inert (or routed to /snapshots) until 16 ships.
- The compare-scenarios button gates on `model.scenarios.length >= 1` — if the user has zero alternatives, the button is disabled with a tooltip "Add an alternative scenario to compare".

## Rollback

`git revert <commit-sha>` then `pm2 restart web`. The revert removes the new page and `_components/`. Anyone navigating to `/models/[id]` after revert hits a 404 — they can still get to the list page. No DB changes; permissions unaffected. The workspace state is in-memory only; no client-side storage to clean up.
