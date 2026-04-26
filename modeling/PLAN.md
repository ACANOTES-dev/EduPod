# Budgeting & Analysis ("Modeling") — Master Plan

> **Status:** Plan locked. Implementation split into **21 tasks across 5 waves**. See `IMPLEMENTATION_LOG.md` for execution rules, wave ordering, and completion records.

---

## 1. Why we're building this

The Finance hub today exposes two real sub-modules — **Finance** (fee structures, invoicing, payments, statements, refunds) and **Payroll** (runs, compensation, payslips, dashboards) — plus a **third tile flagged "coming soon": Budgeting & Analysis** (`apps/web/src/app/[locale]/(school)/finance/page.tsx` HUB_CARDS, key `budgeting`, href `/finance/budgeting`, comingSoon: true). Clicking it lands on a placeholder page (`/finance/budgeting/page.tsx`) showing three teaser cards: Forecasting, Variance Analysis, Department Costs. Nothing is wired.

A school running on this platform today has to build its annual financial model in Excel, build trip-cost calculators in Excel, build the board pack in Excel + PowerPoint, and reconcile actuals manually against last year's plan in — yes — Excel. That's exactly the "five disconnected products" pain point we set out to solve. **The single feature most likely to make a principal say "I'd pay for this on its own" is a financial-modelling tool that's already populated from the school's real student/staff/fee data, supports four-way scenario comparison, tracks variance against the live finance and payroll modules, and generates a board pack in one click.**

This rebuild promotes the placeholder into a full sub-module that handles **two distinct use cases under one roof**:

1. **Annual Financial Models** — full-year (or 3- / 5-year) revenue & expenditure forecasts. Driver-based, scenario-comparable, variance-tracked, snapshot-publishable, board-pack exportable. The principal opens this when planning next year, when reviewing the current year mid-flight, or when prepping a board update.
2. **Event & Trip Budgets** — lightweight standalone calculators for trips, fundraisers, sports days, performances, capital-equipment purchases. Per-student / per-household / total / breakeven / contingency. Optionally pushes fees through to the existing Finance module to invoice households end-to-end.

The two workspaces share permissions, design language, and a few primitives (drivers, scenarios, snapshots) but they live as **separate first-class entry points** because their inputs, outputs, time horizons, and audiences are genuinely different. Conflating them produces a worse tool for both jobs.

The rebuild also sets up the architecture so that future AI capabilities (executive summary, variance explanation, scenario suggestion) plug into the existing `tenant_ai_flags` + `AnthropicClientService` infrastructure without churn — but **AI features are explicitly out of v1 scope** to keep the rebuild focused.

---

## 2. Scope

### In scope

- **New backend module** at `apps/api/src/modules/budgeting/` with sub-services for financial models, drivers, scenarios, line items, snapshots, variance, event budgets, exports, shareable links, and trip→fee integration.
- **Driver engine** in `packages/shared/src/budgeting/` — pure TypeScript, dependency-free, runs identically on backend and frontend. Computes the entire derived line-item set from a tenant's real student/staff/fee/class data plus a driver assumption set.
- **11 canonical drivers** shipped in v1 (enrollment growth %, fee uplift %, staff headcount delta, salary uplift %, discount capture %, scholarship capture %, utilities inflation %, materials inflation %, capex items, donations forecast, grants forecast). Custom drivers allowed via the same JSONB structure.
- **Financial models** with configurable horizon (1 / 3 / 5 years), default 1. Multi-year drivers can compound or be overridden per-year.
- **Scenarios** — every model has a base case + up to 3 alternative scenarios. Alternatives store **driver overrides only**; line items recompute on demand.
- **Line items** — driver-derived by default; can be added (custom), overridden (manual value), or locked (won't recompute when drivers change). Three sources: `driver_derived`, `custom`, `override`.
- **Lifecycle** — light: `draft → published (versioned snapshot) → archived`. Each publish creates an immutable `model_snapshot` row carrying the full state at publish time.
- **Variance tracking** — once the academic year is in progress, the model's "Variance" view shows budget vs actual per line per period. Actuals join from the existing `Invoice` / `Payment` / `PayrollEntry` / `Discount` data via read-only facades. Materialised cache (`variance_cache`) refreshed nightly per active model + an explicit "Refresh" button on the variance page.
- **Event/trip budgets** — separate entity with its own simpler driver set (transport, tickets, food, accommodation, chaperones, contingency %, school subsidy %). Per-student / per-household / total / breakeven outputs.
- **Trip → fee integration** — explicit user-initiated action that pushes the trip's cost into the existing Finance module via `FeeAssignmentsService` inside one transaction. Permission gated (`budgeting.generate_fees` AND `finance.manage`). Includes free / cost-recovery / subsidised / payment-plan modes.
- **Outputs (3 channels)** — PDF board pack (Puppeteer, branded template), read-only shareable URL (tokenised, time-limited, optionally password-protected, scenarios-visibility-configurable, no household PII), Excel export (exceljs, structured workbook with Info / Drivers / Base Case / Scenarios / Variance sheets).
- **Workers** — `budgeting:variance-refresh` (cron, nightly per tenant), `budgeting:board-pack-render` (on-demand, async PDF generation), `budgeting:shareable-link-cleanup` (cron, daily, expires old links).
- **Frontend route tree** under the existing `/finance/budgeting/*` path. The "coming soon" placeholder is replaced with a real hub showing two big tiles (Financial Models / Event Budgets) and recent items.
- **Workspace UI** — financial model workspace uses the **Hybrid layout** validated in brainstorming: KPI strip across the top, scenarios strip below, line-item table dominates the body, drivers slide in from the right. Scenario compare view uses **Combined view**: persistent KPI strip + chart in the body + Chart / Cards / Table toggle.
- **Mobile + a11y pass** — usable at 375px; keyboard navigation for the line-item table, drivers drawer, and scenario picker; screen-reader labels on every chart and stat.
- **Bilingual** — every new label is keyed in `en.json` + `ar.json` with full RTL parity. Numbers stay LTR per project convention.
- **Smoke tests (Playwright)** — pass covering hub landing, model creation flow, driver edit + recompute, scenario create + compare, snapshot publish, variance view, event budget creation, trip→fee generation flow (dry-run only — no live invoice issued during smoke), shareable link issue + public view.
- **Architecture docs updated** — `docs/architecture/feature-map.md` (new section), `module-blast-radius.md` (budgeting consumes finance + payroll facades), `event-job-catalog.md` (3 new BullMQ jobs), `state-machines.md` (financial-model lifecycle, event-budget lifecycle).

### Out of scope for this rebuild

- **No AI features in v1.** No executive-summary narration, no variance explanation, no scenario suggestion. Architecture is AI-ready (driver/line-item state is structured JSON, snapshots are immutable, variance is materialised) but the Anthropic-backed surfaces are deferred to a follow-on cycle to keep this rebuild tractable.
- **No collaborative authoring in v1.** Solo workspace per CLAUDE-Q1 answer C. No "submitted for review", no department-head sub-budget submissions, no in-product comments. Architecture leaves room (snapshots are versioned, shareable links exist, audit log captures every mutation) but the multi-user submission flow is a v2.
- **No multi-currency.** Per `CLAUDE.md` "Permanent Constraints" — single currency per tenant. Drivers, scenarios, line items, exports all use the tenant's `tenant.currency_code`.
- **No data warehouse / OLAP cube.** Variance is materialised but stays in the OLTP database. If a tenant grows past the point where this is acceptable, we add a snapshot table with hourly aggregations — but we don't pre-optimise.
- **No automatic budget approval workflow.** The lifecycle is `draft → published → archived` per Q8 answer C. No "pending board approval" state. The publish-snapshot semantics give the school what they actually need (a frozen reference point) without simulating a workflow that doesn't exist yet.
- **No trip-payment-collection UI in this module.** Once a trip pushes fees to the Finance module via the integration service, the existing Finance UI handles collection. We don't duplicate the household payments view inside Budgeting.
- **No "AI ask" / natural-language driver editing.** Same reason as no-AI: deferred.
- **No imports from external accounting tools** (QuickBooks, Xero, Sage). Excel export is the data-portability story; imports are a later cycle.
- **No revisions to existing Finance / Payroll modules' public API.** The budgeting module _consumes_ read-only facades from finance and payroll. It does not re-shape those modules. The single write path into Finance is `FeeAssignmentsService` for trip→fee generation, and we use the existing service as-is.

---

## 3. The two workspaces

The single most consequential design call (CLAUDE-Q2 answer A) is that **annual financial models and event/trip budgets are separate first-class workspaces**, not two views on the same entity.

### 3.1 Why separate

| Dimension             | Annual Financial Model                                  | Event / Trip Budget                                        |
| --------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| **Time horizon**      | 1 / 3 / 5 academic years                                | A single date or short window (a day, a week)              |
| **Inputs (drivers)**  | Enrollment, fees, staff, salaries, inflation, capex     | Transport, tickets, food, chaperones, subsidy, contingency |
| **Outputs**           | Revenue / expenditure / net result + per-student lens   | Per-student fee, per-household fee, breakeven, total cost  |
| **Audience**          | Board of directors, principal, bursar                   | Class teacher, head of year, finance officer               |
| **Lifecycle**         | Draft → published snapshot → archived; variance-tracked | Draft → confirmed → fees-generated (optional) → completed  |
| **Scenario shape**    | Base + 3 alternatives spanning the whole year(s)        | Base + 3 alternatives spanning trip configurations         |
| **Export**            | PDF board pack, Excel, shareable URL                    | PDF "trip cost summary" sheet, optionally Excel            |
| **Integration write** | None (read-only consumption of finance/payroll actuals) | Optional, explicit, transactional push to FeeAssignments   |

Forcing these into one entity would either weigh down the trip calculator with annual-model complexity, or strip the annual model of the depth it needs. Keeping them separate lets each be pitch-perfect for its job. They share permissions, design tokens, the underlying driver/line-item primitives, and the snapshot mechanism — but nothing else.

### 3.2 What they share

- **Driver engine** — same `packages/shared/src/budgeting/engine.ts` runs both. The trip calculator uses a smaller driver set; the annual model uses the full one.
- **Scenario shape** — base case + up to 3 alternatives, alternatives stored as driver overrides only.
- **Snapshots** — both can publish snapshots (the trip's snapshot is what "freezes the cost" before fees are generated).
- **Audit trail** — every mutation logs through the existing `AuditLogInterceptor`.
- **Permissions** — `budgeting.view`, `budgeting.manage` apply to both.

### 3.3 Cross-link (light)

- An annual model can **reference** a trip budget as a line item ("School trips: estimate £24,000 — see itemised list"). The reference is by `event_budget_id`; the value is the trip's confirmed total. If the trip's total changes after the model is published, the model's reference value goes stale (we surface this in a "stale references" badge but don't auto-update — the snapshot is authoritative).
- Trip budgets do **not** reference annual models. They're standalone.

---

## 4. Drivers — the assumption layer

The annual model is **assumptions-first** (CLAUDE-Q4 answer C). The user opens a new model, picks the academic year, and the screen pre-populates with a complete projected budget computed from the tenant's real student / staff / fee / class data plus a default driver set. Then they tune drivers and watch the model recompute.

### 4.1 Canonical driver set (v1)

These are the 11 drivers shipped in the platform's default driver registry. Custom drivers are allowed via the same JSONB shape with a tenant-local id (`custom.<key>`).

| Driver key                            | Type                       | Default                                          | Drives                                      |
| ------------------------------------- | -------------------------- | ------------------------------------------------ | ------------------------------------------- |
| `enrollment_growth_pct_by_year_group` | `Record<yearGroupId, pct>` | per-yg from current rolling 3-yr average         | Tuition revenue, per-pupil cost denominator |
| `fee_uplift_pct_by_year_group`        | `Record<yearGroupId, pct>` | 0% (locked to current `FeeStructure`)            | Tuition revenue                             |
| `staff_headcount_delta_by_department` | `Record<deptId, integer>`  | 0 per department                                 | Staff costs                                 |
| `salary_uplift_pct`                   | `number`                   | 3%                                               | Staff costs                                 |
| `discount_capture_pct`                | `number`                   | rolling avg of `Discount` table                  | Net tuition (subtracted from gross)         |
| `scholarship_capture_pct`             | `number`                   | rolling avg                                      | Net tuition (subtracted from gross)         |
| `utilities_inflation_pct`             | `number`                   | 4%                                               | Operations expenditure                      |
| `materials_inflation_pct`             | `number`                   | 3%                                               | Operations expenditure                      |
| `capex_items`                         | `CapexItem[]`              | empty array                                      | Capital expenditure                         |
| `donations_forecast`                  | `number`                   | last completed year actual (from finance facade) | Other income                                |
| `grants_forecast`                     | `number`                   | last completed year actual                       | Other income                                |

### 4.2 Driver storage shape

Drivers live in a single `drivers JSONB` column on the `financial_models` table for the base case, and in a `driver_overrides JSONB` column on the `scenarios` table for alternatives. The shape is validated by Zod in `packages/shared/src/budgeting/drivers.ts`:

```typescript
const driversSchema = z.object({
  enrollment_growth_pct_by_year_group: z.record(z.string().uuid(), z.number()),
  fee_uplift_pct_by_year_group: z.record(z.string().uuid(), z.number()),
  staff_headcount_delta_by_department: z.record(z.string().uuid(), z.number().int()),
  salary_uplift_pct: z.number(),
  discount_capture_pct: z.number(),
  scholarship_capture_pct: z.number(),
  utilities_inflation_pct: z.number(),
  materials_inflation_pct: z.number(),
  capex_items: z.array(capexItemSchema),
  donations_forecast: z.number(),
  grants_forecast: z.number(),
  custom: z.record(z.string(), z.unknown()).default({}),
  // Multi-year overrides — when present, year N uses the override; otherwise compounds from year 1.
  per_year: z.record(z.number().int(), partialDriversSchema).optional(),
});
```

`per_year` is the multi-year driver-override mechanism (CLAUDE-Q6 answer B). When the model has `horizon_years > 1` and a `per_year[N]` override is present, year N uses the override values; otherwise year N's drivers compound from year 1's values.

### 4.3 Driver engine (the math)

A single pure-TypeScript module in `packages/shared/src/budgeting/engine.ts` computes the entire derived line-item set from a model's drivers + a tenant's source data snapshot. The same code runs:

- On the **backend** when the model is created (initial population) and when a snapshot is published (immutable state at publish time).
- On the **frontend** as the user tunes drivers, for live recompute without a round-trip.

The engine takes:

```typescript
type EngineInputs = {
  drivers: Drivers; // base case or scenario merge
  source: SourceDataSnapshot; // students, staff, fees, classes, prior-year actuals, etc.
  horizon_years: 1 | 3 | 5;
  fiscal_year_start: Date;
};
```

and returns:

```typescript
type EngineOutputs = {
  line_items: ComputedLineItem[]; // derived, structured by category
  totals_by_year: YearTotals[]; // revenue, expenditure, net per year
  per_pupil_unit_economics: PerPupilEconomics;
  warnings: EngineWarning[]; // e.g. "no FeeStructure for Year 7 — assumed 0 revenue"
};
```

The `source` snapshot is captured by the backend when the model is created, so the engine is deterministic. Re-tuning drivers does NOT re-fetch from the database; the model carries its `source_snapshot_json` for the lifetime of the draft. On publish, the snapshot is folded into the immutable `model_snapshots.payload_json`.

### 4.4 Custom drivers

A school can add a custom driver (`custom.<key>`) that participates in the model in one of two ways:

1. **Pure data** — the custom driver is a number / record / array referenced by a custom line item formula. (e.g. `custom.canteen_subsidy_pct = 12`, referenced by a custom "Canteen subsidy" line item.)
2. **Pure label** — the custom driver is just a labelled assumption written into the snapshot for transparency. (e.g. `custom.notes = "Assumes the new gym opens in September; annual maintenance ~£15,000"`.)

The platform driver list is curated. We do not allow tenants to extend it via a UI in v1 (no "Add a new driver" button). Custom drivers are reachable via the JSONB shape but are not a first-class UI feature in v1. Reason: keeping the canonical set tight prevents tenant drift away from the core model. v2 may expose a UI for this if there's demand.

---

## 5. Scenarios — base case + 3 alternatives

Per CLAUDE-Q3 answer A. Every financial model has one **base case** (the working budget — what the principal would actually present to the board) and up to **three alternative scenarios** that override specific driver assumptions. Same shape applies to event budgets.

### 5.1 Storage

- The base case lives on the `financial_models` row itself (`drivers JSONB`, `horizon_years`, plus its derived line items in `financial_model_line_items` rows where `scenario_id IS NULL`).
- Each alternative scenario is a row in `scenarios` with `parent_model_id`, `name`, and a `driver_overrides JSONB` blob holding only the deltas vs. the base case's drivers.
- Computed line items for a scenario are derived on demand by **merging** `base.drivers` with `scenario.driver_overrides`, running the engine, and returning the result. Optionally cached in `financial_model_line_items` rows where `scenario_id = <scenario.id>` (for the variance view's stability — see §7).

### 5.2 Override merging

The merge is recursive and deterministic. For each driver key:

- If the scenario's `driver_overrides` has a value, use it.
- Otherwise use the base case's value.
- For `per_year` overrides, merge per-year. A scenario can override Year 2 drivers without touching Year 1.
- For `capex_items`, the merge rule is **replace** not append (so an alternative scenario can blank capex by setting it to `[]`).
- For `custom`, a scenario can add new custom drivers or override existing ones.

The merge is implemented in `packages/shared/src/budgeting/scenario-merge.ts` and is unit-tested as a pure function.

### 5.3 Naming + semantics

The base case is conceptually unnamed — its identity is "the model itself". Alternatives are named by the user (Cautious / Growth / Stress / etc.). A model can have 0–3 alternatives; we cap at 3 because the compare view's UI is designed for at most 4 columns (base + 3).

### 5.4 Promote to base

Per CLAUDE-Q3 answer A (no scenario promotion). The base is fixed for the life of the model. If the user wants to "promote" a scenario, they edit the base case's drivers to match. This keeps the data model simple and reflects how boards actually think — one canonical answer plus sensitivities, not four equal candidates.

### 5.5 Compare view — 4-up

Per CLAUDE-Q11 answer C ("Combined" — KPI strip + chart + toggle). The compare view always shows base first, then up to 3 alternatives in user-defined order, with a `View as: Chart / Cards / Table` toggle. The KPI strip across the top is persistent. See §10.5 for full UX.

---

## 6. Line items — derived, custom, override, locked

The model's line items are the actual numbers. Each line item belongs to a category (Income / Staff / Operations / Capital / Other) and a fiscal year (1, 2, or 3 for a 3-year horizon). Each line item has one of three sources:

| Source           | Origin                                                       | Editable?                               | Recomputes when drivers change?          |
| ---------------- | ------------------------------------------------------------ | --------------------------------------- | ---------------------------------------- |
| `driver_derived` | Computed by the engine from drivers + source snapshot        | No (manual edit converts to `override`) | Yes                                      |
| `custom`         | Manually added by the user, never derived from any driver    | Yes                                     | No — sits unaffected on top of the model |
| `override`       | A `driver_derived` line whose value the user manually edited | Yes                                     | No — locked to the user's value          |

Plus a flag:

| Flag        | Meaning                                                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `is_locked` | The user has explicitly locked this line. It will never recompute, even if its source changes. Locked overrides survive driver changes, snapshot recomputes, and source-data refreshes. |

Lock is the user's escape hatch for "the engine doesn't know about our locked utility contract; here's the actual number, leave it alone".

### 6.1 Categories (chart of accounts)

A canonical category tree ships in v1. Custom categories are NOT supported in v1 (per the YAGNI heuristic — schools can put a custom line in any category and most don't care about category structure beyond Income / Costs / Capital).

```
Income
├─ Tuition (gross)
├─ Tuition (net of discounts/scholarships)
├─ Donations
├─ Grants
├─ Other income

Staff Costs
├─ Teaching salaries
├─ Admin salaries
├─ Senior leadership salaries
├─ Support staff salaries
├─ Employer contributions
├─ Other staff costs

Operations
├─ Utilities
├─ Cleaning
├─ Maintenance
├─ IT (software + hardware)
├─ Insurance
├─ Materials
├─ Marketing
├─ Trips & events (estimated)
├─ Other operations

Capital
├─ Building
├─ Equipment
├─ IT infrastructure
├─ Other capital

Reserves & Adjustments
├─ Contingency
├─ Reserves transfer
├─ Prior-year adjustments
```

Trip & event line items in the **annual model** are typically estimated (custom line items) rather than derived. Once a trip is actually planned, its `event_budget_id` is referenced as the source so the principal can see the breakdown.

### 6.2 Per-pupil unit economics

The engine also computes:

- `revenue_per_student = total_revenue / total_active_students`
- `expenditure_per_student = total_expenditure / total_active_students`
- `net_per_student = net_result / total_active_students`
- `revenue_per_household = total_revenue / total_active_households`
- `breakeven_students = total_expenditure / avg_fee_per_student`

These appear in the workspace KPI strip (CLAUDE-Q10 — "Per pupil" KPI) and on the board pack.

### 6.3 Storage

Every line item is one row in `financial_model_line_items`:

```
financial_model_line_items
  id, tenant_id, parent_model_id
  scenario_id NULL          # NULL = base case; populated = belongs to alternative scenario
  category, subcategory     # e.g. ('Income', 'Tuition (gross)')
  name                      # display name; usually inherited from category for derived lines
  fiscal_year SMALLINT      # 1, 2, or 3 (within the horizon)
  source ENUM               # 'driver_derived' | 'custom' | 'override'
  amount NUMERIC(12,2)
  is_locked BOOLEAN DEFAULT false
  notes TEXT NULL
  references_event_budget_id UUID NULL  # for trips/events referenced from the model
  created_at, updated_at
```

For a scenario, when the engine runs, we either:

- Stream the computed lines back as ephemeral output (no DB write — the user is just exploring), OR
- Persist them as `scenario_id`-tagged rows when the model is published or when the variance view needs a stable reference (see §7).

---

## 7. Snapshots & lifecycle

Per CLAUDE-Q8 answer C. Lifecycle is light: `draft → published → archived`. Versioned snapshots are the "freeze the moment" mechanism.

### 7.1 States

| State       | Editable?              | Variance?                                  | Visible in UI                    |
| ----------- | ---------------------- | ------------------------------------------ | -------------------------------- |
| `draft`     | Yes                    | Yes (against the latest published, if any) | Yes — the working surface        |
| `published` | No (creates new draft) | Yes (against itself)                       | Yes — read-only with a banner    |
| `archived`  | No                     | No                                         | Filterable list under "Archived" |

A published model is **immutable**. Editing it creates a new draft (v2, v3, ...) that, when published, supersedes the prior published snapshot as the "current" version. The prior published snapshot stays accessible forever for historical reference ("what did we present to the board on March 12?").

### 7.2 Snapshot row shape

Every publish creates one row in `financial_model_snapshots`:

```
financial_model_snapshots
  id, tenant_id, parent_model_id
  version_number SMALLINT     # 1, 2, 3 — increments per parent model
  payload JSONB               # full state — drivers, scenarios, line items, totals, source snapshot
  published_at TIMESTAMPTZ
  published_by UUID           # FK to users
  pdf_object_key VARCHAR(512) NULL  # set asynchronously by the board-pack worker
  excel_object_key VARCHAR(512) NULL
  rendered_at TIMESTAMPTZ NULL
```

The snapshot's `payload` is the canonical historical record. The board-pack PDF (and Excel) are render _outputs_ that can be regenerated from the payload at any time.

### 7.3 Publishing flow

1. User clicks **Publish snapshot** on a draft model.
2. Confirmation modal: "This freezes a version of the model. You can keep editing in a new draft afterwards. Continue?"
3. Backend serialises drivers + scenarios + line items + totals + source snapshot into `payload`. Sets `version_number = MAX(current) + 1`. Commits.
4. Background job `budgeting:board-pack-render` enqueues. PDF + Excel render asynchronously to object storage. URLs land on the snapshot row when ready.
5. UI flips the model status badge to "Published v2 · 12 March 2026". A "Create draft to edit" button appears in place of the disabled fields.
6. Audit log entry written.

### 7.4 Restoring an old snapshot

A user with `budgeting.publish` permission can restore a prior published snapshot as the new base draft. This duplicates the snapshot's drivers + line items into a new draft on the same parent model. The old snapshot stays in history. Useful for "we changed our minds, go back to the v1 plan as the working baseline".

### 7.5 Archive

A model in any state can be archived. Archive hides it from default lists; data is retained. Unarchive restores it. Hard delete is gated to Owner-tier roles only and writes an audit entry.

---

## 8. Variance tracking

Per CLAUDE-Q5 answer A. Once the academic year is in progress, the model's "Variance" view shows budget vs. actual per line per period. This is the feature most likely to convert the module from "build a thing for the board" to "the principal opens this every Monday".

### 8.1 What we compare

Per line item per period (month / term / academic year):

- **Planned** — the line item amount from the model's _latest published snapshot_ (or the base case if no snapshot yet).
- **Actual** — real, materialised number sourced from:
  - Tuition revenue → `Invoice` + `Payment` joined on `due_date` / `received_at` per period
  - Discounts / scholarships → `Discount` table, applied per period
  - Staff costs → `PayrollEntry` rows, summed per period
  - Operations / capital → currently **manual entry** (the school logs actual non-payroll expenditure per period via a simple form on the variance page). v2 may integrate with an expenses module if one ships.
- **Variance** = `actual - planned`
- **Variance %** = `(actual - planned) / planned`
- **Drivers of variance** — for tuition lines, the engine identifies _why_: enrollment delta, fee delta, discount delta. This populates a hover tooltip ("£18k below plan: Year 4 enrollment came in 12 students lower than projected, accounts for £14k of the gap; discount uptake 2.1pp higher than projected accounts for £4k").

### 8.2 Materialised cache

Every active model's variance is precomputed nightly into `variance_cache`:

```
variance_cache
  id, tenant_id, parent_model_id, snapshot_id
  period_type ENUM             # 'month' | 'term' | 'year'
  period_label VARCHAR(32)     # 'Sep 2026' | 'Term 1 2026/27' | '2026/27'
  line_item_key VARCHAR(128)   # composite of category + subcategory
  planned NUMERIC(12,2)
  actual NUMERIC(12,2)
  variance NUMERIC(12,2)
  variance_pct NUMERIC(7,2)
  drivers_json JSONB           # the "why" breakdown for tuition lines
  refreshed_at TIMESTAMPTZ
```

Index: `(tenant_id, parent_model_id, period_label)`.

### 8.3 Refresh worker

`budgeting:variance-refresh` BullMQ job:

- **Schedule** — cron, every night at 02:00 in the tenant's timezone (per `tenant.timezone`).
- **Payload** — `{ tenant_id }` (per tenant; iterates all `financial_models` where `status = 'published'` and `fiscal_year_start <= now <= fiscal_year_end`).
- **Action** — computes variance for the active model + writes rows to `variance_cache`. Idempotent — wipes the model's cache rows and rewrites them per refresh. Wrapped in `createRlsClient(...).$transaction()` per platform RLS rules.
- **Manual refresh** — the variance UI has a "Refresh now" button that enqueues the job for the model on demand. Permission: `budgeting.view`.

### 8.4 Variance UI

A new top-level tab on the financial model workspace: **Variance**. Shows:

- **Period selector** — Month / Term / Year. Default to current month while year is in progress.
- **Per-category variance table** — Income / Staff / Operations / Capital, with sub-rows for line items. Columns: Planned / Actual / Variance / Variance %. Conditional formatting: green / amber / red bands.
- **Drivers-of-variance tooltip** — hover any tuition line to see why.
- **Refresh state** — "Refreshed 4 hours ago" with a manual refresh button.
- **No mock fallback** — if the cache is empty (model not yet published, or year not started), the page shows "Variance will be available once the model is published and the academic year begins." It does NOT display zeros or stale data.

---

## 9. Event / Trip Budgets — the lightweight workspace

Per CLAUDE-Q2 answer A. Trips, fundraisers, sports days, performances, and one-off purchases live in their own simpler workspace.

### 9.1 Entity shape

```
event_budgets
  id, tenant_id
  name VARCHAR(255)            # "Class 2A — Dublin Zoo"
  event_type ENUM              # 'trip' | 'fundraiser' | 'sports_day' | 'performance' | 'capital_purchase' | 'other'
  event_date DATE NULL         # the trip date or event window start
  event_end_date DATE NULL
  class_id UUID NULL           # optional FK if scoped to a single class
  year_group_id UUID NULL      # optional FK if scoped to a year group
  participant_count INTEGER    # count of students participating; defaults from class enrolment if class_id set
  drivers JSONB                # event-specific drivers (see §9.2)
  status ENUM                  # 'draft' | 'confirmed' | 'fees_generated' | 'completed' | 'cancelled'
  household_share_pct NUMERIC(5,2)  # 0..100; how much households pay (rest is school subsidy)
  payment_plan ENUM            # 'one_off' | 'two_payments' | 'three_payments' | 'four_payments'
  fee_generation_run_id UUID NULL  # FK once fees are pushed to Finance
  notes TEXT NULL
  created_by UUID, created_at, updated_at
```

Plus the same scenarios mechanism as financial models:

```
event_budget_scenarios
  id, tenant_id, parent_event_budget_id
  name VARCHAR(64)              # "Discount group rate", "Larger group", etc.
  driver_overrides JSONB
  created_at
```

### 9.2 Event drivers

Smaller, simpler driver set than the annual model:

| Driver key        | Type                                | Drives                               |
| ----------------- | ----------------------------------- | ------------------------------------ |
| `transport`       | `{ unit_cost, units, notes }`       | Transport line                       |
| `entry_tickets`   | `{ per_student_cost, count }`       | Tickets                              |
| `food`            | `{ per_person_cost, count }`        | Food                                 |
| `accommodation`   | `{ per_night_cost, nights, count }` | Lodging (overseas / overnight trips) |
| `chaperones`      | `{ count, per_chaperone_cost }`     | Staff cost portion                   |
| `equipment_hire`  | `{ items: Array<{ name, cost }>}`   | Misc                                 |
| `contingency_pct` | `number`                            | Buffer on total                      |
| `custom_lines`    | `Array<{ name, amount }>`           | Additional misc                      |

The trip engine computes:

- `total_cost`
- `per_student_cost = total_cost / participant_count`
- `per_household_cost = (per_student_cost) summed by household for the participating students`
- `school_subsidy_amount = total_cost * (1 - household_share_pct/100)`
- `household_total = total_cost * (household_share_pct/100)`
- `breakeven_participants = total_cost_with_chaperones_and_fixed / per_student_variable`

Per-household cost is computed by joining the student list of the trip against `Household` (a household with two participating siblings pays double the per-student amount). This visualises the actual financial impact on each family — useful for the bursar deciding the household share %.

### 9.3 Event budget lifecycle

```
draft → confirmed → fees_generated → completed
  └→ cancelled (terminal)
```

- **draft**: the user is exploring numbers. No fees pushed.
- **confirmed**: the user has decided this is the trip they're running. Total + per-student cost are locked. (UI shows a "confirm" button after the user is happy with the numbers.)
- **fees_generated**: fees have been pushed to Finance via the integration service. `fee_generation_run_id` is populated. Cannot be edited (you'd void the existing invoices).
- **completed**: post-trip; the event happened. Allows close-out notes.
- **cancelled**: terminal. If `fees_generated`, must first void the fees in Finance before cancelling here.

### 9.4 Event budget UI

A focused, calculator-first workspace:

- **Top**: name + date + class/year-group selector + participant count.
- **Body left**: driver inputs (transport, tickets, food, etc.) — collapsible accordion sections.
- **Body right**: live-updating output card with total, per-student, per-household, breakeven, school subsidy.
- **Below**: scenario chips (base + up to 3 alternatives, e.g. "Group discount", "Bigger group", "Cheaper venue") with their own per-card output.
- **Footer**: actions — Confirm, Generate fees (gated), Export PDF, Mark cancelled.

---

## 10. Trip → Fee Integration

Per CLAUDE-Q7 answer B-with-refinement. Trip→fee generation is a real end-to-end action, but it's **explicit and opt-in** so the calculator stays safe to play with.

### 10.1 Permission stack

To generate fees, the acting user needs **all three** of:

- `budgeting.view` (to see the trip)
- `budgeting.generate_fees` (the generate-fees right itself)
- `finance.manage` (because they're creating financial obligations on households)

The "Generate fees" button is only visible if all three are present. The backend re-checks at request time.

### 10.2 Modes

The trip's `household_share_pct` and `payment_plan` together determine the fee shape:

- **Free (`household_share_pct = 0`)**: no fees generated. The trip is a pure cost line for the school. The "Generate fees" action is replaced with "Mark trip as school-funded".
- **Cost-recovery (`household_share_pct = 100`)**: full per-student cost is invoiced.
- **Subsidised (`0 < household_share_pct < 100`)**: per-student cost × pct is invoiced; remainder is school subsidy.
- **Payment plan**: if `payment_plan != 'one_off'`, the trip's per-student amount is split across N installments. Existing Finance module's `FeeAssignmentsService` supports payment plans; we hook into that.

### 10.3 The flow

1. User clicks **Generate fees**.
2. Backend computes a **dry-run preview**: list of households × students × per-household amount, total, payment plan dates if applicable. Returned to the UI as a confirmation modal.
3. User reviews. The modal lists every household the system will invoice, with their amount. The user confirms (or cancels).
4. On confirm, backend runs the integration service inside one `createRlsClient(...).$transaction()`:
   - Fetch / build a **fee structure** for this trip (existing `FeeStructure` table — we create one keyed `event:<event_budget_id>`).
   - For each participating student, call `FeeAssignmentsService.create()` with the household, fee structure, and payment plan.
   - Update `event_budgets.fee_generation_run_id`, set `event_budgets.status = 'fees_generated'`.
   - Write audit log entries.
   - Commit. If anything fails, the entire transaction rolls back — no partial invoicing.
5. UI flips the trip to `fees_generated` state. A **toast** confirms the action and links to the Finance module's view of the new invoices.
6. From here, household payment collection happens entirely in the existing Finance module. We do not duplicate it.

### 10.4 Voiding generated fees

If the trip is cancelled or fees need to be reversed, the user navigates to Finance, voids the assignments, then returns to the budgeting trip and clicks "Mark cancelled". The trip's status moves to `cancelled` and the `fee_generation_run_id` is preserved for audit. We do not auto-void from the budgeting side because finance-manage is the canonical fee-mutation path.

---

## 11. Outputs — PDF / Shareable URL / Excel

Per CLAUDE-Q9 answer C. Three output channels for the annual model.

### 11.1 PDF board pack

Generated by Puppeteer rendering a single branded HTML template. Sections:

1. **Cover page** — tenant logo, "Annual Financial Model — FY <year>", "Prepared by <user>", "Published <date>", version number.
2. **Executive summary** — KPIs (revenue, expenditure, net, per-pupil) + a 2-paragraph overview written by the user (auto-saved with the snapshot).
3. **Drivers** — the 11 canonical drivers with their values, formatted as a clean key-value table.
4. **Base case totals** — revenue / expenditure / net per year (multi-year if `horizon_years > 1`).
5. **Scenarios** — base + alternatives, side-by-side (chart + cards + table). Mirrors the Q11 compare view, statically rendered.
6. **Line items** — per-category breakdown (Income / Staff / Operations / Capital / Reserves).
7. **Per-pupil unit economics** — revenue, expenditure, net per student. Comparison to prior year actuals if available.
8. **Variance summary** — if the year is in progress, a snapshot of variance vs. plan. Skipped if no actuals yet.
9. **Capex appendix** — itemised capex list.
10. **Methodology / assumptions appendix** — list of every driver value with notes.
11. **Footer** — page numbers, "Confidential — Board of Directors", tenant name, generated timestamp.

PDF is generated **asynchronously** by the `budgeting:board-pack-render` worker job after publish, and on demand if regenerated. It's stored in object storage (Hetzner per existing setup); the URL is signed, 1-hour TTL.

### 11.2 Read-only shareable URL

Per the Q9 vision. Designed for board members who don't have logins to the platform.

#### URL shape

`https://<tenant>.edupod.app/finance/budgeting/share/<token>`

(Note: the `<tenant>.edupod.app` subdomain is per-tenant per existing platform pattern; the token is a UUID stored in `shareable_links`.)

#### Storage

```
shareable_links
  id, tenant_id
  token UUID UNIQUE                 # the URL secret
  parent_snapshot_id UUID            # snapshot it points at
  expires_at TIMESTAMPTZ NOT NULL    # never null — every link expires
  password_hash VARCHAR(255) NULL    # optional bcrypt
  scenarios_visible JSONB            # ['base', 'cautious', 'growth'] — which scenarios show on the public page
  view_count INTEGER DEFAULT 0
  last_viewed_at TIMESTAMPTZ NULL
  revoked_at TIMESTAMPTZ NULL
  created_by UUID, created_at, updated_at
```

#### Access flow

1. User on the published snapshot clicks **Share via link**.
2. Modal: choose expiry (7 / 14 / 30 / 90 days), set optional password, choose which scenarios are visible (base is always visible; alternatives are individually toggleable).
3. Backend creates the row, returns the URL. UI shows a copy button.
4. The public page lives at `/finance/budgeting/share/[token]` (open route, no auth). On load:
   - Fetches the snapshot via `SharedLinksService.resolveByToken(token, password_attempt)`.
   - If valid: renders a read-only, branded view of the snapshot. Includes KPIs, scenario compare, line items, but no edit affordances. Board members can interact (toggle scenarios, expand categories) but can't change anything.
   - If expired / revoked / wrong password: shows a friendly error.
5. Every load increments `view_count` and updates `last_viewed_at`.

#### Revoke

Owner-tier roles can revoke a link from the snapshot's "Shared links" panel. Revoke is immediate — sets `revoked_at`; `resolveByToken` returns null for any revoked link.

#### Cleanup

`budgeting:shareable-link-cleanup` runs daily and hard-deletes rows where `expires_at < now() - 30 days`. Records older than that are not retrievable in the audit trail, but the snapshot itself is unaffected.

#### Privacy

The shareable link page **never exposes household-level data, student-level data, or staff-level salaries**. It shows aggregate categories and totals. The "Shared link" preview before issue spells this out so the issuing user knows what the recipient sees.

### 11.3 Excel export

`exceljs`-based workbook with these sheets:

1. **Info** — tenant, model name, version, published date, fiscal year, currency, list of scenarios.
2. **Drivers** — every driver with its value, with a "Description" column.
3. **Base Case** — full line-item table by year × category with totals.
4. **Scenarios** — one sheet per alternative scenario, same shape.
5. **Variance** (if available) — variance summary by month/term, planned/actual/variance/pct.
6. **Capex** — itemised capex.
7. **Per-Pupil** — unit economics per year.

All currency cells use the tenant's currency code with proper Excel formatting. RTL/LTR is handled at the workbook level for Arabic locales.

Excel is generated **synchronously** for models where `total_line_items < 5000` (the common case); larger models go to the same `budgeting:board-pack-render` worker for async generation.

---

## 12. Component map

### 12.1 Backend — new files

```
apps/api/src/modules/budgeting/
├── budgeting.module.ts                          [NEW]
├── budgeting.controller.ts                      [NEW: hub endpoints — landing summary, recent activity]
│
├── financial-models/
│   ├── financial-models.controller.ts           [NEW]
│   ├── financial-models.service.ts              [NEW]
│   └── financial-models.service.spec.ts         [NEW]
│
├── drivers/
│   ├── drivers.controller.ts                    [NEW: GET defaults + tenant-scoped overrides]
│   ├── drivers.service.ts                       [NEW]
│   └── drivers.service.spec.ts                  [NEW]
│
├── scenarios/
│   ├── scenarios.controller.ts                  [NEW]
│   ├── scenarios.service.ts                     [NEW]
│   └── scenarios.service.spec.ts                [NEW]
│
├── line-items/
│   ├── line-items.controller.ts                 [NEW]
│   ├── line-items.service.ts                    [NEW]
│   └── line-items.service.spec.ts               [NEW]
│
├── snapshots/
│   ├── snapshots.controller.ts                  [NEW]
│   ├── snapshots.service.ts                     [NEW]
│   └── snapshots.service.spec.ts                [NEW]
│
├── variance/
│   ├── variance.controller.ts                   [NEW]
│   ├── variance.service.ts                      [NEW]
│   ├── variance-actuals-source.service.ts       [NEW: read-facade joins finance + payroll]
│   └── variance.service.spec.ts                 [NEW]
│
├── event-budgets/
│   ├── event-budgets.controller.ts              [NEW]
│   ├── event-budgets.service.ts                 [NEW]
│   ├── event-budget-scenarios.service.ts        [NEW]
│   └── event-budgets.service.spec.ts            [NEW]
│
├── trip-fee-integration/
│   ├── trip-fee-integration.controller.ts       [NEW: dry-run preview + confirm action]
│   ├── trip-fee-integration.service.ts          [NEW: cross-module write into finance]
│   └── trip-fee-integration.service.spec.ts     [NEW]
│
├── exports/
│   ├── exports.controller.ts                    [NEW]
│   ├── pdf-renderer.service.ts                  [NEW: Puppeteer-based]
│   ├── excel-renderer.service.ts                [NEW: exceljs-based]
│   └── exports.service.spec.ts                  [NEW]
│
├── shareable-links/
│   ├── shareable-links.controller.ts            [NEW]
│   ├── shareable-links.public.controller.ts     [NEW: open route /share/:token]
│   ├── shareable-links.service.ts               [NEW]
│   └── shareable-links.service.spec.ts          [NEW]
│
└── budgeting-read-facade.service.ts             [NEW: read-only consumption point for downstream modules]

apps/worker/src/processors/budgeting/
├── variance-refresh.processor.ts                [NEW]
├── board-pack-render.processor.ts               [NEW]
└── shareable-link-cleanup.processor.ts          [NEW]

apps/worker/src/base/
└── cron-scheduler.service.ts                    [updated: register 3 new cron jobs]
```

### 12.2 Shared types — new

```
packages/shared/src/budgeting/
├── index.ts                                     [NEW: barrel]
├── drivers.ts                                   [NEW: Zod schemas + canonical driver list]
├── scenarios.ts                                 [NEW: scenario shape + override schema]
├── line-items.ts                                [NEW: line-item shape + category enum]
├── snapshots.ts                                 [NEW]
├── variance.ts                                  [NEW]
├── event-budgets.ts                             [NEW]
├── shareable-links.ts                           [NEW]
├── engine.ts                                    [NEW: pure-TS calculation engine]
├── scenario-merge.ts                            [NEW: pure-TS driver-override merge]
└── source-data.ts                               [NEW: source snapshot shape]
```

### 12.3 Frontend — new files

```
apps/web/src/app/[locale]/(school)/finance/budgeting/
├── page.tsx                                     [REWRITE: hub landing — replace placeholder]
├── _components/
│   ├── hub-tile.tsx                             [NEW: big tile component]
│   └── recent-activity.tsx                      [NEW]
│
├── models/
│   ├── page.tsx                                 [NEW: list of financial models]
│   ├── new/page.tsx                             [NEW: create-new form]
│   ├── [id]/
│   │   ├── page.tsx                             [NEW: workspace (Q10/C layout)]
│   │   ├── compare/page.tsx                     [NEW: scenario compare (Q11/C)]
│   │   ├── variance/page.tsx                    [NEW: variance dashboard]
│   │   ├── snapshots/page.tsx                   [NEW: version history]
│   │   ├── share/page.tsx                       [NEW: shareable links manager]
│   │   └── _components/
│   │       ├── kpi-strip.tsx                    [NEW]
│   │       ├── scenario-strip.tsx               [NEW]
│   │       ├── line-item-table.tsx              [NEW]
│   │       ├── drivers-drawer.tsx               [NEW]
│   │       ├── compare-chart.tsx                [NEW]
│   │       ├── compare-cards.tsx                [NEW]
│   │       ├── compare-table.tsx                [NEW]
│   │       ├── variance-period-selector.tsx     [NEW]
│   │       ├── variance-table.tsx               [NEW]
│   │       ├── variance-drivers-tooltip.tsx     [NEW]
│   │       ├── publish-modal.tsx                [NEW]
│   │       └── snapshot-row.tsx                 [NEW]
│
├── events/
│   ├── page.tsx                                 [NEW: list of event budgets]
│   ├── new/page.tsx                             [NEW: create-new form]
│   ├── [id]/
│   │   ├── page.tsx                             [NEW: trip workspace]
│   │   ├── generate-fees/page.tsx               [NEW: trip→fee dry-run + confirm]
│   │   └── _components/
│   │       ├── event-driver-inputs.tsx          [NEW]
│   │       ├── event-output-card.tsx            [NEW]
│   │       ├── event-scenario-chips.tsx         [NEW]
│   │       ├── per-household-breakdown.tsx      [NEW]
│   │       └── generate-fees-confirm-modal.tsx  [NEW]
│
├── share/
│   └── [token]/
│       └── page.tsx                             [NEW: public read-only snapshot view]
│
└── settings/page.tsx                            [NEW: per-tenant budgeting prefs (default horizon, default subsidy %)]
```

### 12.4 Schema — new tables / columns

- `financial_models` — NEW.
- `scenarios` — NEW.
- `financial_model_line_items` — NEW.
- `financial_model_snapshots` — NEW.
- `event_budgets` — NEW.
- `event_budget_scenarios` — NEW.
- `variance_cache` — NEW.
- `shareable_links` — NEW.
- `budgeting_tenant_preferences` — NEW (default horizon, default subsidy %, default contingency %, hidden_kpi_keys).

All tenant-scoped. All with `FORCE ROW LEVEL SECURITY` + `<table>_tenant_isolation` policy mirrored into `packages/prisma/rls/policies.sql`.

### 12.5 Permissions — new

| Permission                | Default roles                                                |
| ------------------------- | ------------------------------------------------------------ |
| `budgeting.view`          | Owner, Principal, Vice Principal, Accounting                 |
| `budgeting.manage`        | Owner, Principal, Vice Principal, Accounting                 |
| `budgeting.publish`       | Owner, Principal, Vice Principal                             |
| `budgeting.share`         | Owner, Principal, Vice Principal                             |
| `budgeting.generate_fees` | Owner, Principal, Accounting (and requires `finance.manage`) |
| `budgeting.archive`       | Owner, Principal                                             |

### 12.6 BullMQ — new jobs

| Queue       | Job name                           | Schedule         | Payload                                                         |
| ----------- | ---------------------------------- | ---------------- | --------------------------------------------------------------- |
| `budgeting` | `budgeting:variance-refresh`       | cron 02:00 daily | `{ tenant_id }` (one job per active tenant)                     |
| `budgeting` | `budgeting:board-pack-render`      | on-demand        | `{ tenant_id, snapshot_id, format: 'pdf' \| 'excel' \| 'all' }` |
| `budgeting` | `budgeting:shareable-link-cleanup` | cron 03:00 daily | `{}` (cross-tenant, iterates expired links)                     |

### 12.7 Cross-module read facades consumed

The budgeting module consumes (read-only) from these existing services:

- `FinanceReadFacade` — invoices, payments, fee structures, discounts, household balances (for variance).
- `PayrollReadFacade` — payroll entries, period totals, headcount-by-department snapshots (for variance).
- `StudentsService` (or its facade) — active student counts per year group / class (for source snapshot at model creation).
- `StaffProfilesService` (or its facade) — active staff counts per department (for source snapshot).
- `ClassesService` — class lists per year group (for trip workspace defaults).
- `HouseholdsService` — household-to-student relationships (for per-household trip cost computation).

The single write the budgeting module makes into another module is via `FeeAssignmentsService.bulkCreate()` for trip fee generation (gated, transactional). Discussed in §10.

---

## 13. Phase breakdown

| Wave  | #   | Title                                                                              |
| ----- | --- | ---------------------------------------------------------------------------------- |
| **1** | 01  | Schema foundation (all tables, RLS, permissions, shared types)                     |
| **2** | 02  | Driver engine (pure-TS calculation library + canonical drivers)                    |
| **2** | 03  | Financial Models + Scenarios services (CRUD + override merging)                    |
| **2** | 04  | Line Items service (derived + custom + override + lock)                            |
| **2** | 05  | Snapshots service (publish + version + restore)                                    |
| **2** | 06  | Variance service (planned↔actual joins, cache reads, manual entry path)            |
| **2** | 07  | Event Budgets service + Event Budget Scenarios                                     |
| **3** | 08  | Variance Refresh worker (nightly cron)                                             |
| **3** | 09  | Export pipeline (PDF Puppeteer + Excel exceljs + Board Pack worker)                |
| **3** | 10  | Trip → Fee Integration service (cross-module transactional write)                  |
| **3** | 11  | Shareable Links service + cleanup worker                                           |
| **4** | 12  | Budgeting Hub landing + list pages (financial models + events)                     |
| **4** | 13  | Financial Model Workspace (Q10/C layout: KPI + scenarios + table + drivers drawer) |
| **4** | 14  | Scenario Compare View (Q11/C layout: KPI strip + chart + Chart/Cards/Table toggle) |
| **4** | 15  | Variance Dashboard view                                                            |
| **4** | 16  | Snapshots & Version History UI                                                     |
| **4** | 17  | Event Budget Workspace (trip calculator UI + per-household breakdown)              |
| **4** | 18  | Trip → Fee Generation Flow UI (dry-run preview + confirm modal)                    |
| **4** | 19  | Shareable Link UI + Public Read-Only Snapshot View                                 |
| **4** | 20  | Outputs UI (PDF / Excel triggers + downloads + Settings page)                      |
| **5** | 21  | Polish — translations, mobile, a11y, smoke tests, feature-map, docs                |

See `implementations/NN-*.md` for each phase's spec.
See `IMPLEMENTATION_LOG.md` for execution rules and completion records.
