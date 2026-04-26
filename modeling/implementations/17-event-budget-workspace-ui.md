# Implementation 17 — Event Budget Workspace UI

> **Wave:** 4
> **Depends on:** 01, 02, 07
> **Deploys:** web restart only

---

## Goal

Build the **trip / event calculator workspace** — the focused, calculator-first surface that lets a class teacher, head of year, or finance officer model a trip / fundraiser / sports day / capital purchase end-to-end. Lighter-weight than the financial-model workspace: collapsible driver accordion on the left, a live-updating output card on the right, scenario chips below, per-household breakdown when scoped to a class or year group, and a status-aware action footer.

The page is the user's home for one event budget across its full lifecycle: `draft → confirmed → fees_generated → completed` (plus terminal `cancelled`). The "Generate fees" cross-module action begins here but the modal + dry-run live in phase 18.

## What to change

### 1. Route — `apps/web/src/app/[locale]/(school)/finance/budgeting/events/[id]/page.tsx` — NEW

`'use client'` page component. Fetches the event budget on mount, renders the workspace, owns the local optimistic state.

Top-level shape:

```tsx
'use client';

// 1. External
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

// 2. Internal shared
import {
  runEventEngine,
  eventDriversSchema,
  type EventDrivers,
  type EventEngineOutputs,
} from '@school/shared/budgeting';
import { Card, CardContent, CardHeader } from '@school/ui';
import { Button } from '@school/ui';
import { toast } from '@school/ui';

// 3. Relative parents
import { apiClient, unwrap } from '@/lib/api-client';
import { usePermissions } from '@/lib/permissions';

// 4. Relative siblings
import { EventDriverInputs } from './_components/event-driver-inputs';
import { EventOutputCard } from './_components/event-output-card';
import { EventScenarioChips } from './_components/event-scenario-chips';
import { PerHouseholdBreakdown } from './_components/per-household-breakdown';
import { EventActionsFooter } from './_components/event-actions-footer';
```

State (typed top-level):

- `event: EventBudgetWithRelations | null` — full payload from `GET /v1/budgeting/event-budgets/:id`.
- `selectedScenarioId: string | null` — `null` means base case; otherwise the active alternative.
- `output: EventEngineOutputs` — derived via `runEventEngine`. Recomputed on every driver / participant / household-share change.
- `isSaving: boolean` — debounce indicator.
- `loadError: string | null`.

Form: a single `useForm<EventBudgetEditableShape>` with `zodResolver(eventBudgetEditableSchema)`. The schema combines `eventDriversSchema` plus the editable metadata (name, event_date, event_end_date, class_id, year_group_id, participant_count, household_share_pct, payment_plan, notes).

The drivers slice of the form is what feeds `runEventEngine`. We watch the form via `form.watch()` so output recomputes synchronously without a network round-trip.

Layout:

```
┌────────────────────────────────────────────────────────────────────┐
│  Header: name (editable), event_date, class/yg autocomplete,        │
│  participant count, status badge, breadcrumb                         │
├────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────┐  ┌────────────────────────────┐  │
│  │  EventDriverInputs          │  │  EventOutputCard           │  │
│  │  (collapsible accordion)    │  │  (sticky on desktop)       │  │
│  │                             │  │                            │  │
│  │  - Transport                │  │  Total cost                │  │
│  │  - Tickets                  │  │  Per student               │  │
│  │  - Food                     │  │  Per household             │  │
│  │  - Accommodation            │  │  Breakeven                 │  │
│  │  - Chaperones               │  │  School subsidy            │  │
│  │  - Equipment hire           │  │                            │  │
│  │  - Contingency %            │  │  Live, animated numbers    │  │
│  │  - Custom lines             │  └────────────────────────────┘  │
│  └─────────────────────────────┘                                  │
├────────────────────────────────────────────────────────────────────┤
│  EventScenarioChips: [ Base ] [ Group rate ] [ Bigger group ] [+]   │
├────────────────────────────────────────────────────────────────────┤
│  PerHouseholdBreakdown (when class_id or year_group_id is set)      │
├────────────────────────────────────────────────────────────────────┤
│  EventActionsFooter (status-driven)                                 │
└────────────────────────────────────────────────────────────────────┘
```

Mobile (≤ 767px): driver accordion + output card stack vertically. Output card is "sticky" via `sticky top-16` only at `md:` and above; on mobile it sits above the accordion in document order so users see the live total above the drivers as they edit.

Header (status-driven heading): on render, the page checks `event.status` and:

- `draft` — title is editable (a borderless input that submits on blur).
- `confirmed` / `fees_generated` / `completed` / `cancelled` — title is read-only display text. A small disabled-input affordance with a tooltip "This budget is locked" on the input wrapper.

Initial fetch: `useEffect(() => { ... fetchEvent(); }, [id])`. On 404, shows a friendly empty state with a "Back to events" button.

Permissions: gate the entire page on `budgeting.view`. Read users can see the workspace but the form fields are visually disabled, scenario chips are non-interactive, and the action footer is collapsed to "Export PDF" only. Use `usePermissions().has('budgeting.manage')` to compute `canEdit`.

### 2. `_components/event-driver-inputs.tsx` — NEW

Collapsible accordion of driver sections. Built on shadcn `Accordion` with `type="multiple"` so multiple sections can be open simultaneously.

Sections, in order:

1. **Transport** — `unit_cost` (number, currency), `units` (integer), `notes` (textarea).
2. **Tickets** — `per_student_cost`, `count`.
3. **Food** — `per_person_cost`, `count`.
4. **Accommodation** — `per_night_cost`, `nights`, `count`.
5. **Chaperones** — `count`, `per_chaperone_cost`.
6. **Equipment hire** — repeating `items[]` with `name` + `cost`. Add/remove rows.
7. **Contingency %** — slider 0..30 with numeric input echo.
8. **Custom lines** — repeating `name` + `amount`. Add/remove rows.

Props:

```ts
type Props = {
  form: UseFormReturn<EventBudgetEditableShape>;
  canEdit: boolean;
  isLoading: boolean;
};
```

Implementation notes:

- Each section header shows a one-line summary on the right ("£420 / 21 students" for transport when filled). Updates as the user types.
- Section open state persists in `localStorage` keyed by `event-budget:${id}:accordion` so users don't lose their place when navigating away and back.
- Currency inputs: a small `<CurrencyInput>` wrapper that handles thousand-separators and locale-correct decimal points. Reads `tenant.currency_code` from the auth context.
- Empty / unfilled sections show "No transport budgeted" placeholder text in the header summary, and the body is collapsed by default.
- All inputs use `react-hook-form`'s `register()` or `Controller` for the slider. Numeric fields use `valueAsNumber: true`.
- All labels via `useTranslations('budgeting.eventBudgets.drivers')`.

### 3. `_components/event-output-card.tsx` — NEW

Live-updating big card. The user's eyes track this number as they tweak drivers — animation matters.

Props:

```ts
type Props = {
  output: EventEngineOutputs;
  currencyCode: string;
  participantCount: number;
  householdCount: number;
  householdSharePct: number;
};
```

Layout (single Card with header + content):

```
┌─────────────────────────────────────────────────┐
│  Total cost                                      │
│  £4,250.00                              [tooltip]│
│  Inc. 5% contingency · 21 students              │
├─────────────────────────────────────────────────┤
│  Per student        Per household                │
│  £202.38            £315.50 (avg)                │
├─────────────────────────────────────────────────┤
│  Breakeven          School subsidy               │
│  21 students        £0                           │
└─────────────────────────────────────────────────┘
```

Animation:

- Numbers animate value-to-value via a custom hook `useAnimatedNumber(value, durationMs = 300)` that interpolates with `requestAnimationFrame`. Implementation lives co-located: `_components/use-animated-number.ts`.
- When `participant_count = 0` or `household_count = 0`, the dependent stats render as "—" and a small inline help-text explains why (e.g. "Set participant count to see per-student cost").

Currency formatting uses `Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, minimumFractionDigits: 2 })`. The `locale` is taken from `useLocale()`.

A11y:

- Card has `aria-label={t('outputCardAriaLabel', { total })}`.
- Each stat row has `role="group"` with a label/value pair semantically associated.
- Animation respects `prefers-reduced-motion`: when set, numbers snap.

### 4. `_components/event-scenario-chips.tsx` — NEW

Horizontal row of chips: base + up to 3 alternatives + an inline "+ Add scenario" affordance when fewer than 3 alternatives exist.

Props:

```ts
type Props = {
  scenarios: EventBudgetScenarioRow[];
  selectedScenarioId: string | null; // null = base case
  onSelect: (scenarioId: string | null) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (scenarioId: string, name: string) => Promise<void>;
  onDelete: (scenarioId: string) => Promise<void>;
  canEdit: boolean;
};
```

Behaviour:

- Click chip → `onSelect`. The page-level state swaps `selectedScenarioId`. Driver inputs and output card both react: when an alternative is selected, the form's `defaults` are reset to `mergeDriverOverrides(base, scenario.driver_overrides)`.
- Right-click (or long-press on mobile) on a chip opens a context menu: Rename / Delete (alternatives only — base is fixed).
- Inline "+ Add scenario" — opens an inline input. On submit, calls `POST /v1/budgeting/event-budgets/:id/scenarios` with `{ name }`. Disabled when 3 alternatives already exist.
- Active chip uses primary tokens (`bg-primary text-primary-foreground`); inactive uses `bg-muted text-muted-foreground`. Hover/focus rings on every chip.
- Horizontally scrollable on mobile via `overflow-x-auto` with snap points. ZERO physical-direction classes — all `start-`/`end-`.

A11y: chip group is `role="tablist"`, each chip `role="tab" aria-selected={isSelected}`. Keyboard: arrow-left / arrow-right move selection (RTL-aware via `dir`).

### 5. `_components/per-household-breakdown.tsx` — NEW

Renders only when `event.class_id` is set, OR when `event.year_group_id` is set AND the user has clicked "Show all participating households" (collapsed by default for year groups because the list can be long).

Reads `event.per_household_breakdown` from the API response — this is computed server-side by joining the participating students against the `Household` table.

Shape from API (assumed; phase 07 service):

```ts
type PerHouseholdBreakdown = Array<{
  household_id: string;
  household_label: string;
  student_ids: string[];
  student_names: string[];
  participating_student_count: number;
  amount: number; // total amount this household will be invoiced
}>;
```

UI:

- Table on desktop: columns Household / Students participating / Total amount.
- Cards on mobile: stacked, each card shows the same data.
- Empty state: "No participating households yet — set a class or year group above."
- Permission-aware: read users still see this (it's a finance preview, not editing).

The component owns NO state; props-driven. The "show all" toggle for year-group breakdowns lives on the parent page.

A11y: table has `aria-label`. The currency cells use `<bdi>` to keep the number LTR inside RTL flow.

### 6. `_components/event-actions-footer.tsx` — NEW

Sticky footer at the bottom of the workspace. Status-driven button set:

```ts
type Props = {
  status: EventBudgetStatus;
  householdSharePct: number;
  feeGenerationRunId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  canManage: boolean;
  canGenerateFees: boolean; // budgeting.generate_fees && finance.manage
  onSave: () => Promise<void>;
  onConfirm: () => Promise<void>;
  onCancel: () => Promise<void>;
  onComplete: () => Promise<void>;
  onMarkSchoolFunded: () => Promise<void>;
  onGenerateFees: () => void; // navigates to /events/[id]/generate-fees
  onExportPdf: () => Promise<void>;
};
```

Button matrix:

| Status                                    | Buttons (in order)                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `draft`                                   | [Save] [Confirm →] [Cancel]                                                   |
| `confirmed` and `household_share_pct > 0` | [Generate fees →] [Cancel] [Export PDF]                                       |
| `confirmed` and `household_share_pct = 0` | [Mark school-funded →] [Cancel] [Export PDF]                                  |
| `fees_generated`                          | [View invoices in Finance] [Cancel — must void in Finance first] [Export PDF] |
| `completed`                               | [Export PDF] (read-only banner)                                               |
| `cancelled`                               | [Export PDF] (read-only banner)                                               |

The "Cancel" button when status is `fees_generated` is disabled with a tooltip explaining the user must void the fee assignments in Finance first (per `PLAN.md §10.4`).

Save button visibility: only when `isDirty && canManage`. Auto-save fires on driver changes (debounced 500ms via the page-level effect); the explicit Save button forces an immediate save.

Export PDF: kicks off the `GET /v1/budgeting/event-budgets/:id/exports/pdf` endpoint (phase 09 / 20). On 202, shows toast "Rendering PDF — try again in 30s"; on 200 with download URL, triggers the download.

The Generate fees button has a small icon-with-arrow indicator and navigates via `router.push('./generate-fees')`. Disabled (with explanatory tooltip) when `!canGenerateFees`.

### 7. API contract (consumed; defined in phase 07)

- `GET /v1/budgeting/event-budgets/:id` — returns:
  ```ts
  {
    data: {
      event: EventBudgetRow;
      scenarios: EventBudgetScenarioRow[];
      computed_output: EventEngineOutputs;             // for the active selection (server-side default to base)
      per_household_breakdown: PerHouseholdBreakdown;
      class_summary?: { id: string; name: string; student_count: number };
      year_group_summary?: { id: string; name: string; student_count: number };
    }
  }
  ```
- `PATCH /v1/budgeting/event-budgets/:id` — body is the editable shape (name, dates, class_id, year_group_id, participant_count, drivers, household_share_pct, payment_plan, notes). Debounced 500ms.
- `POST /v1/budgeting/event-budgets/:id/scenarios` — `{ name, driver_overrides? }`. Returns the new scenario row.
- `PATCH /v1/budgeting/event-budgets/:id/scenarios/:scenario_id` — updates name or driver_overrides.
- `DELETE /v1/budgeting/event-budgets/:id/scenarios/:scenario_id`.
- `POST /v1/budgeting/event-budgets/:id/confirm` — body empty. Server validates required fields (event_date, participant_count > 0) and transitions status to `confirmed`.
- `POST /v1/budgeting/event-budgets/:id/cancel` — transitions to `cancelled`. Server rejects with 409 if `status = 'fees_generated'`.
- `POST /v1/budgeting/event-budgets/:id/complete` — `confirmed → completed` (post-trip closure).
- `POST /v1/budgeting/event-budgets/:id/mark-school-funded` — fees-generation alternative when household_share_pct = 0; transitions to `fees_generated` without invoicing.

All wrapped in `apiClient<{ data: T }>(...)` and then `unwrap()`-ed at the call site.

Error handling:

- 404 → friendly empty state with back link.
- 403 → "You don't have permission to view this event budget."
- 409 (state transition rejected) → toast with the structured message, page reloads to fetch fresh server state.
- 500 → toast + console.error.

### 8. Permission-aware UI

All edit affordances gated on `usePermissions().has('budgeting.manage')`. The "Generate fees" button additionally requires `budgeting.generate_fees` AND `finance.manage` (see `PLAN.md §10.1`). The frontend hides the button when missing; the backend re-checks at request time per phase 18.

Read-only mode (when canEdit = false):

- All form inputs are visually disabled (`disabled` + reduced opacity).
- Scenario chips are clickable to view but the "+ Add" affordance is hidden.
- Footer collapses to [Export PDF] only.

### 9. i18n

All new strings keyed under `budgeting.eventBudgets.workspace.*`. Examples:

- `budgeting.eventBudgets.workspace.title`
- `budgeting.eventBudgets.workspace.statusBadge.draft` / `.confirmed` / `.fees_generated` / `.completed` / `.cancelled`
- `budgeting.eventBudgets.drivers.transport.label`
- `budgeting.eventBudgets.drivers.transport.unitCostLabel`
- `budgeting.eventBudgets.outputCard.totalCost`
- `budgeting.eventBudgets.outputCard.perStudent`
- `budgeting.eventBudgets.actions.confirm`
- `budgeting.eventBudgets.actions.generateFees`
- `budgeting.eventBudgets.actions.markSchoolFunded`
- `budgeting.eventBudgets.actions.cancelBlockedByFees`

English values land in `messages/en.json` in this phase. Arabic placeholder values land in `messages/ar.json` (translation polish in phase 21).

### 10. Styling rules

- Tailwind only. ZERO physical direction classes (per `.claude/rules/frontend.md`).
- Theme tokens: `bg-background`, `text-text-primary`, `text-text-secondary`, `border-border`, `bg-card`. No hex literals.
- `Figtree` (already wired) for UI text; `JetBrains Mono` for numeric values in the output card and per-household table.
- Mobile minimum 44×44 touch targets on chips, footer buttons, accordion triggers.
- `min-w-0 overflow-x-hidden` on the main flex container per the frontend rules' shell-stability requirement.

### 11. Auto-save lifecycle

- `form.watch()` subscribes to all driver and metadata field changes.
- Debounced 500ms via `lodash.debounce` (already a project dep).
- On every flush: PATCH the editable shape. Optimistic update — the form is the source of truth.
- Failures: toast + revert local form state to the last server-confirmed snapshot.
- Saving indicator: `isSaving` boolean drives a small spinner next to the title (e.g. "Saving..." / "Saved 4s ago").

## Testing requirements

- **Component tests:**
  - `event-output-card.spec.tsx` — renders correct currency formatting, animates numbers, shows placeholder when participant_count = 0.
  - `event-scenario-chips.spec.tsx` — emits onSelect when clicked, blocks add when 3 alternatives exist, keyboard arrow navigation works.
  - `event-driver-inputs.spec.tsx` — accordion open state persists, slider for contingency_pct emits correct values, equipment_hire repeating rows work.
  - `event-actions-footer.spec.tsx` — table-driven test of every status × household_share_pct combination renders the expected button set.
  - `per-household-breakdown.spec.tsx` — renders empty state when no class/year_group, table on desktop, cards on mobile.

- **Page-level test:** `events/[id]/page.spec.tsx` — mock `apiClient`, render the page, assert workspace mounts, simulate driver edit, verify `runEventEngine` recomputes and the output card updates within one tick.

- **Playwright smoke (phase 21 will fold these into the master pack):**
  - Load `/finance/budgeting/events/<id>` for a draft test event in NHQS.
  - Type `42` into the transport unit-cost input.
  - Assert the output card's "Total cost" updates within 500ms.
  - Click "Group rate" scenario chip; assert driver inputs swap to the scenario's overrides.
  - Capture `browser_console_messages(level: 'error')`; assert empty.

Per memory: cap Playwright verification at ~20 minutes; delete any screenshots created.

## Post-deploy verification

1. Rsync `apps/web/` to production. `pm2 restart web`.
2. Open `https://nhqs.edupod.app/finance/budgeting/events/<seeded-test-event-id>` as `owner@nhqs.test`.
3. Verify the workspace renders with the seeded drivers + output card.
4. Edit a driver — verify the output card animates and the network tab shows the debounced PATCH after 500ms.
5. Click a scenario chip — verify the form resets to the scenario's effective drivers.
6. Resize to 375px — verify driver accordion + output card stack vertically with no horizontal overflow.
7. Spot-check a tenant where the user lacks `budgeting.manage` — workspace should render read-only.
8. Confirm console: zero errors.

## Follow-ups for subsequent waves

- Phase 18 owns the `/generate-fees` route this page navigates to.
- Phase 20 owns the export PDF / Excel buttons; this page wires the call but the polled-rendering UI primitive is shared.
- Phase 21 (polish) translates Arabic strings, runs the full Playwright pack, audits keyboard navigation through the accordion + scenario chips.
- Phase 12 (hub) links to this page from the "Recent event budgets" list.

## Rollback

`git revert <sha>`. Web-only restart. Phase 17 is purely a new route + new components — no shared file edits, so revert is clean. The backend endpoints from phase 07 remain intact and unused.
