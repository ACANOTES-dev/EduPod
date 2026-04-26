# Implementation 21 — Polish: Translations, Mobile, A11y, Smoke, Docs

> **Wave:** 5 (single implementation)
> **Depends on:** 12, 13, 14, 15, 16, 17, 18, 19, 20 (all Wave 4 complete)
> **Deploys:** web restart only

---

## Goal

Close the rebuild with the cross-cutting polish work that lifts the budgeting module from "it works" to "it ships":

1. Complete English + Arabic translations for every key declared in phases 12–20.
2. Mobile-responsive sweep at 375px across every new page.
3. Accessibility audit — keyboard navigation, screen-reader labels, focus management, contrast.
4. Playwright smoke pack covering the full module end-to-end (without issuing real invoices).
5. Architecture docs updates — `feature-map.md`, `module-blast-radius.md`, `event-job-catalog.md`, `state-machines.md`.

This is one session's work, but it's a substantial pass — budget several hours.

## What to change

### 1. Translation sweep — English

Single coherent pass over `apps/web/messages/en.json`. Every key declared across phases 12–20 lands here with proper values.

**Keys declared across prior phases (verify each has a real value, not a placeholder):**

#### `budgeting.hub.*` (phase 12)

- `.title`, `.subtitle`
- `.tiles.financialModels.title` / `.description`
- `.tiles.eventBudgets.title` / `.description`
- `.tiles.settings.title` / `.description`
- `.recentActivity.heading`, `.recentActivity.empty`
- `.quickActions.newModel`, `.quickActions.newEvent`

#### `budgeting.financialModels.list.*` (phase 12)

- `.title`, `.subtitle`, `.empty.title`, `.empty.body`
- `.filters.status.draft`, `.published`, `.archived`
- `.row.lastModified`, `.row.fiscalYear`, `.row.statusBadge`
- `.actions.openModel`, `.duplicateModel`, `.archiveModel`

#### `budgeting.eventBudgets.list.*` (phase 12)

- `.title`, `.subtitle`, `.empty.title`, `.empty.body`
- `.filters.eventType.*` (one per `EventBudgetType`)
- `.row.eventDate`, `.row.participantCount`, `.row.statusBadge`

#### `budgeting.financialModels.workspace.*` (phase 13)

- `.title`, `.statusBadges.*`
- `.kpiStrip.totalRevenue`, `.totalExpenditure`, `.netResult`, `.revenuePerStudent`, `.expenditurePerStudent`, `.netPerStudent`, `.breakevenStudents`
- `.kpiTooltips.*` (one per KPI)
- `.scenarioStrip.base`, `.addScenario`, `.deleteScenario`, `.renameScenario`
- `.lineItemTable.columns.*`, `.row.actions.editAmount`, `.lockLine`, `.unlockLine`, `.markCustom`, `.delete`
- `.driversDrawer.title`, `.section.enrollmentGrowth`, `.feeUplift`, `.staffHeadcount`, `.salaryUplift`, `.discountCapture`, `.scholarshipCapture`, `.utilitiesInflation`, `.materialsInflation`, `.capex`, `.donations`, `.grants`, `.custom`
- `.publishButton`, `.publishModal.*`, `.archiveButton`, `.duplicateButton`
- `.warnings.noFeeStructure`, `.noPriorActuals`, `.negativeHeadcount`, `.staleEventReference`

#### `budgeting.financialModels.compare.*` (phase 14)

- `.title`, `.viewToggle.chart`, `.cards`, `.table`
- `.scenarioColumn.base`, `.scenarioColumnLabel` (with `name`)
- `.kpiStrip.*` (mirror of workspace)
- `.chart.legend.revenue`, `.expenditure`, `.netResult`
- `.cards.section.kpis`, `.assumptions`, `.lineItems`
- `.table.columns.*`

#### `budgeting.financialModels.variance.*` (phase 15)

- `.title`, `.refreshNow`, `.lastRefreshed` (with relative time)
- `.periodSelector.month`, `.term`, `.year`
- `.empty.title`, `.empty.body`
- `.table.columns.planned`, `.actual`, `.variance`, `.variancePct`
- `.tooltip.driversTitle`, `.driver.enrollmentDelta`, `.feeDelta`, `.discountDelta`
- `.manualEntry.modal.title`, `.modal.body`, `.modal.lineItem`, `.modal.amount`, `.modal.period`, `.modal.save`

#### `budgeting.financialModels.snapshots.*` (phase 16)

- `.title`, `.empty.title`, `.empty.body`
- `.row.version`, `.publishedBy`, `.publishedAt`
- `.actions.viewSnapshot`, `.exportPdf`, `.exportExcel`, `.restoreToDraft`, `.shareSnapshot`
- `.detailDrawer.heading`, `.executiveSummary`, `.scenarios`, `.assumptions`, `.lineItems`

#### `budgeting.eventBudgets.workspace.*` (phase 17)

- All keys per phase 17 spec
- `.title`, `.statusBadges.*`
- `.drivers.transport.label`, `.unitCostLabel`, `.unitsLabel`, `.notesLabel`
- `.drivers.tickets.*`, `.food.*`, `.accommodation.*`, `.chaperones.*`, `.equipmentHire.*`, `.contingency.*`, `.customLines.*`
- `.outputCard.totalCost`, `.perStudent`, `.perHousehold`, `.breakeven`, `.schoolSubsidy`
- `.scenarioChips.base`, `.addScenario`
- `.perHousehold.heading`, `.column.household`, `.studentsParticipating`, `.amount`
- `.actions.confirm`, `.cancel`, `.save`, `.complete`, `.markSchoolFunded`, `.generateFees`, `.exportPdf`, `.viewInvoicesInFinance`, `.cancelBlockedByFees`

#### `budgeting.eventBudgets.generateFees.*` (phase 18)

- All keys per phase 18 spec
- `.title`, `.subtitle`
- `.summary.totalToInvoice`, `.schoolSubsidy`, `.householdCount`, `.studentCount`
- `.paymentPlan.oneOff`, `.split` (with `count` and `dates`)
- `.households.tableHeader.household`, `.students`, `.amount`
- `.actions.generateFees`, `.backToEvent`, `.viewInvoices`
- `.confirm.title`, `.body`, `.checkbox`, `.cancel`, `.confirm`
- `.success.title`, `.body`, `.viewInvoices`
- `.errors.<code>.title` / `.body` for every code in phase 18

#### `budgeting.share.*` (phase 19)

- All authenticated keys: `.manage.title`, `.subtitle`, `.issueLink`, `.activeLinksHeading`, `.inactiveLinksHeading`, `.row.expiresIn`, `.row.viewedNTimes`, `.row.lastViewed`, `.row.scenarios`, `.row.copyUrl`, `.row.revoke`, `.row.urlCopied`
- `.manage.modal.*` (full modal copy)
- `.manage.revokeConfirm.*`
- All public keys: `.public.title`, `.subtitle.*`, `.tabs.summary`, `.scenarios`, `.lineItems`, `.assumptions`
- `.public.errors.expired`, `.revoked`, `.notFound`, `.wrongPassword`
- `.public.password.*` (full password prompt copy)
- `.public.confidential`

#### `budgeting.settings.*` (phase 20)

- All keys per phase 20 spec
- `.title`, `.subtitle`
- `.sections.financialModels`, `.eventBudgets`, `.exports`, `.shareableLinks`
- `.fields.defaultHorizon.label` / `.helper` / `.option1Year` / `.option3Years` / `.option5Years`
- `.fields.defaultHouseholdShare.*`, `.defaultContingency.*`, `.defaultExportFormat.*`, `.shareableLinkMaxDays.*`, `.hiddenKpiKeys.*`
- `.kpiNames.*`
- `.discardChanges`, `.save`, `.saving`, `.saveSuccess`, `.saveError`

#### `budgeting.exports.*` (phase 20)

- `.exportPdf`, `.exportExcel`, `.exportBoth`
- `.rendering`, `.tryAgainIn` (with seconds)
- `.downloadPdf`, `.downloadExcel`
- `.retryPdf`, `.retryExcel`
- `.errors.renderFailed`, `.timeout`, `.unknown`

#### Cross-cutting keys

- `budgeting.errors.notFound`, `.permissionDenied`, `.serverError`, `.networkError`
- `budgeting.common.confirmCancel`, `.dismiss`, `.close`, `.copy`, `.copied`
- `budgeting.common.relativeTime.justNow`, `.minutesAgo`, `.hoursAgo`, `.daysAgo`, `.weeksAgo`, `.expiresIn` (with units)

**Verification step:** run a grep against the messages file:

```bash
grep -E '\[MISSING TRANSLATION\]|\[TODO\]|TODO:' apps/web/messages/en.json
```

Must return zero matches.

**Stub key cleanup:** scan for keys added during phases 12–20 that ended up unused. Delete them. Use:

```bash
node scripts/check-translations.js budgeting
```

(adapt the existing reports-rebuild script for the budgeting namespace).

### 2. Translation sweep — Arabic

Full parity in `apps/web/messages/ar.json`. Every key added to `en.json` gets an Arabic translation.

Translation guidelines:

- Use existing translations as a reference for tone (e.g. financial / accounting terms used in the existing Finance / Payroll modules).
- Numbers stay in Western numerals (0–9) per CLAUDE.md.
- Currency symbols: keep the tenant's currency symbol; do NOT translate the currency code.
- Dates: Gregorian calendar in both locales.
- For driver / KPI labels, use Arabic accounting terminology common in MENA-region school accounting.
- Reuse phrases from the Finance module wherever the same concept exists (e.g. "Revenue" should match the existing Finance module's translation).

Specific glossary checks:

- "Driver" → use the existing translation for "assumption" / "محرك" depending on what the rest of the app uses
- "Snapshot" → "لقطة" (consistent with existing usage if present)
- "Scenario" → "سيناريو"
- "Line item" → "بند"
- "Variance" → "الانحراف" or "الفرق" — match what's used in Finance
- "Per-student" / "Per-household" → align with admissions / fees module
- "Trip" / "Event" → "رحلة" / "فعالية"
- "Shareable link" → "رابط للمشاركة"

**RTL parity verification:**

- Open every new page with `?locale=ar` and verify visual mirroring is correct:
  - `/finance/budgeting` (hub)
  - `/finance/budgeting/models`
  - `/finance/budgeting/models/[id]` (workspace)
  - `/finance/budgeting/models/[id]/compare`
  - `/finance/budgeting/models/[id]/variance`
  - `/finance/budgeting/models/[id]/snapshots`
  - `/finance/budgeting/models/[id]/share`
  - `/finance/budgeting/events`
  - `/finance/budgeting/events/[id]` (workspace)
  - `/finance/budgeting/events/[id]/generate-fees`
  - `/finance/budgeting/share/[token]` (public — no auth)
  - `/finance/budgeting/settings`
- For each: check drivers drawer slides from start (right in Arabic), scenario chips order, KPI cards left-to-right alignment, table columns, modal positioning.
- Currency cells use `<bdi>` so numbers stay LTR inside RTL flow.
- Tooltip arrows point the correct direction.
- Iconography: arrow icons (e.g. "Generate fees →") flip in RTL via the existing `rtl:rotate-180` utility.

### 3. Mobile responsiveness pass

Sweep every new page at 375px (iPhone SE viewport) AND 414px (iPhone Pro Max). Reference `.claude/rules/frontend.md` "Mobile Responsiveness — Mandatory" section.

**Pages to verify:**

- `/finance/budgeting` (hub) — tile grid collapses to single column at `<sm:`. Each tile is full-width with ≥ 44×44px tap targets. Recent activity collapses to card list.
- `/finance/budgeting/models` (list) — table converts to vertical card stack, each card showing key fields. Filter controls stack vertically; scroll if many.
- `/finance/budgeting/models/[id]` (workspace, phase 13) — KPI strip 2-column grid; scenarios horizontally scrollable; line-item table full-width with horizontal scroll OR collapsed to per-category accordion. Drivers drawer becomes full-screen sheet on mobile.
- `/finance/budgeting/models/[id]/compare` (phase 14) — view toggle stays usable; cards stack vertically; chart resizes correctly to viewport width.
- `/finance/budgeting/models/[id]/variance` (phase 15) — period selector full-width; variance table horizontal scroll on mobile; tooltips reposition to stay in viewport.
- `/finance/budgeting/models/[id]/snapshots` (phase 16) — list of snapshots as cards. Detail drawer becomes full-screen sheet.
- `/finance/budgeting/models/[id]/share` (phase 19 authenticated) — link rows as cards, modal as sheet.
- `/finance/budgeting/events` (list) — card list at mobile.
- `/finance/budgeting/events/[id]` (workspace, phase 17) — driver accordion + output card stack vertically (output card on top); per-household table collapses to cards; scenario chips horizontal scroll.
- `/finance/budgeting/events/[id]/generate-fees` (phase 18) — KPI strip 2-col, household table → cards, modal as sheet, footer buttons stack vertically.
- `/finance/budgeting/share/[token]` (public, phase 19) — fully responsive; tabs scroll horizontally; KPI strip 2-col; tables → cards.
- `/finance/budgeting/settings` (phase 20) — already single column; verify radio cards stack vertically and sliders are touch-friendly.

**Common fixes (apply inline when found):**

- `min-w-0` on flex children inside `flex-1` containers.
- `overflow-x-auto` on table wrappers.
- `w-full` on inputs.
- `text-base` (16px) minimum on input fields to prevent iOS Safari auto-zoom.
- `flex-col sm:flex-row` for any horizontal layout that should stack on mobile.
- Touch targets ≥ 44×44px on every interactive element. Add `min-h-11 min-w-11` where missing.
- Long unbreakable strings (URLs, emails, tokens): `break-all` or `overflow-wrap: break-word`.
- ZERO physical direction classes — convert any stragglers to logical (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`).

### 4. Accessibility pass

Reference WCAG AA. Run an `axe-core` audit on each new page.

#### Keyboard navigation

- Tab through every interactive element in document order.
- Focus is always visible (default ring or token-defined).
- Modals: focus moves to the modal on open; ESC closes; focus returns to the trigger on close.
- Workspace drivers drawer: opens on click, focus moves to first input; Escape closes; arrow keys navigate between sections.
- Scenario chips: arrow keys move selection (RTL-aware via `dir`); Enter/Space selects.
- Line-item table: arrow keys navigate cells; Enter opens edit modal for actionable cells.
- Form fields: Tab order matches visual order; Shift+Tab reverses; Enter submits.
- Skip link (`<a href="#main-content">Skip to main content</a>`) at the top of every page — verify focus skips correctly.

#### ARIA labels

- Every icon-only button has `aria-label` (Copy URL, Revoke, Delete scenario, etc.).
- Charts have `aria-label` describing the data + a hidden `<table>` fallback for screen readers.
- KPI cards have `aria-label` including the value and unit.
- Status badges have `aria-label` (e.g. "Status: Draft").
- Loading spinners have `aria-busy="true"` on the parent + `<span class="sr-only">Loading</span>`.
- Error toasts use `role="alert"` (auto via shadcn `toast`).
- Form fields have associated `<label>` elements.
- Required fields have `aria-required="true"` and `aria-invalid` on validation errors.
- Tab navigation in the public snapshot view uses `role="tablist"` / `role="tab"` / `role="tabpanel"` correctly.

#### Screen reader test

Use VoiceOver (macOS) and NVDA (Windows-equivalent if available) on at minimum:

- `/finance/budgeting/models/[id]` (workspace) — KPI values announced, drivers drawer announced when opened, scenario chip selection announced.
- `/finance/budgeting/events/[id]` (event workspace) — output card values, driver section labels.
- `/finance/budgeting/share/[token]` (public) — page hierarchy makes sense, scenarios tab navigation works, no PII leak in screen reader speech.
- `/finance/budgeting/events/[id]/generate-fees` — confirmation modal announced clearly, checkbox state announced.

#### Color contrast

- Verify every text/background combination meets WCAG AA (4.5:1 for body, 3:1 for large text).
- Status badges (Draft / Published / Archived / Confirmed / Cancelled) — verify each badge passes against its background.
- Variance conditional formatting (green / amber / red bands) — verify each passes against the table background AND each color is distinguishable for color-blind users (use shape/icon as well as color where possible).

#### Error states

- Form validation errors: associated with the input via `aria-describedby` and announced via `aria-live="polite"`.
- Network errors: toast with `role="alert"` (auto via shadcn).
- Page-level errors (404, 403): rendered with semantic heading hierarchy so screen readers announce them as the main content.

### 5. Playwright smoke pack

New suite: `apps/web/e2e/budgeting.spec.ts`.

The smoke is THE test for this phase. Must pass green from a clean state.

**Setup:**

- Use the NHQS test tenant (`owner@nhqs.test`, password from project memory).
- Suite runs against `https://nhqs.edupod.app/`.
- Each scenario is a separate `test()` block; suite runs serially because they share state (e.g. test 4 expects test 3's saved model to exist).

**Smoke scenarios:**

1. **Hub loads.** Navigate to `/finance/budgeting`. Assert two tiles (Financial Models / Event Budgets) + a settings link visible. Assert recent activity loads.

2. **Create financial model.** Navigate to `/finance/budgeting/models/new`. Fill form (name "Smoke FY2026/27", fiscal year start = next September, horizon = 1 year). Submit. Assert redirect to workspace.

3. **Tune drivers.** In workspace, open drivers drawer. Modify `enrollment_growth_pct_by_year_group` for Year 7 to 5%. Assert KPI strip's "Total revenue" updates within 500ms (the engine runs client-side). Close drawer.

4. **Create scenario.** Click "+ Add scenario", enter name "Cautious", submit. Assert chip appears. Click chip; modify `salary_uplift_pct` to 5%. Click base chip; assert drivers revert to base values.

5. **Publish snapshot.** Click Publish. In the modal, enter a 1-line executive summary. Confirm. Assert status badge flips to "Published v1".

6. **Variance.** Navigate to `/finance/budgeting/models/<id>/variance`. Assert the page renders the empty state ("Variance will be available once the year is in progress") OR variance data if the year has started.

7. **Snapshot list.** Navigate to `/finance/budgeting/models/<id>/snapshots`. Assert the v1 snapshot is listed. Open the detail drawer.

8. **Export PDF (mock).** Click Export PDF on the snapshot. Assert button transitions to rendering state. Wait up to 30 seconds for download URL OR mock the response. Assert state machine handled correctly. **Skip the actual download** — too flaky in CI.

9. **Create event budget.** Navigate to `/finance/budgeting/events/new`. Fill form (name "Smoke trip Q4", event type = trip, event date = future date, class_id = a known seeded class, participant count = 20). Submit. Assert redirect to event workspace.

10. **Trip drivers.** Modify transport unit cost. Assert output card updates. Switch to a "Group rate" scenario. Assert driver values swap.

11. **Confirm trip.** Click Confirm. Assert status badge flips to "Confirmed".

12. **Generate fees dry-run.** Click Generate fees → navigates to `/events/<id>/generate-fees`. Assert preview renders with N households / M students. Click "Generate fees" → modal opens. Assert household table in modal matches phase 17's per-household breakdown (sample 3 rows). Click Cancel. **DO NOT** confirm — production smoke is dry-run only per phase 18 convention.

13. **Issue shareable link.** Navigate to `/finance/budgeting/models/<id>/share`. Click "Issue new shareable link". Fill form (snapshot v1, 7-day expiry, no password, base + alternative scenarios visible). Submit. Capture the issued URL.

14. **Public view.** Open the issued URL in a new browser context (incognito; `browser_tabs new` with cleared cookies). Assert the public page renders the snapshot. Assert NO household / student / staff names visible. Assert tabs navigate correctly.

15. **Revoke link.** Back in authenticated context, click Revoke on the link. Confirm. Refresh the public URL — assert "revoked" friendly error renders.

16. **Settings.** Navigate to `/finance/budgeting/settings`. Modify `default_household_share_pct` from 100 to 75. Save. Assert toast. Reload — assert value persisted.

**Cleanup:** at the end of the suite, archive the seeded model and event budget, revoke any links, reset settings to 100% household share. Don't leave smoke artifacts polluting the tenant.

**Target runtime:** < 15 minutes total. If longer, split into multiple files or selectively skip lower-priority scenarios.

**Per-memory:** cap Playwright verification at ~20 minutes; spot-check; delete any screenshot files; release the Playwright lock.

### 6. Architecture docs updates

Per `.claude/rules/architecture-policing.md` (mandatory).

#### `docs/architecture/feature-map.md` — UPDATE

Add a new "Budgeting & Analysis" section under Finance. Single coherent section covering:

- **What it does** (1 paragraph): driver-based annual financial modelling + lightweight event/trip calculator + variance tracking + 3 output channels (PDF, Excel, shareable link).
- **Backend modules:** `apps/api/src/modules/budgeting/` (with sub-services list — financial-models, drivers, scenarios, line-items, snapshots, variance, event-budgets, trip-fee-integration, exports, shareable-links).
- **Endpoints:** list every `/v1/budgeting/...` route from phases 03–11. Format as a table with method / path / permission.
- **Worker jobs:** `budgeting:variance-refresh` (cron), `budgeting:board-pack-render` (on-demand), `budgeting:shareable-link-cleanup` (cron).
- **Frontend pages:** list every new route under `/finance/budgeting/...`.
- **Tables:** financial_models, scenarios, financial_model_line_items, financial_model_snapshots, event_budgets, event_budget_scenarios, variance_cache, shareable_links, budgeting_tenant_preferences.
- **Permissions:** budgeting.view, budgeting.manage, budgeting.publish, budgeting.share, budgeting.generate_fees, budgeting.archive.
- **Cross-module dependencies:** consumes FinanceReadFacade, PayrollReadFacade, StudentsService, StaffProfilesService, ClassesService, HouseholdsService. Single write into FeeAssignmentsService for trip→fee generation.

Update the "Quick Reference" table at the top of the file:

- Total endpoint count: + the count of new budgeting endpoints.
- Total page count: + 13 new pages.
- Total worker jobs: + 3.
- Update "Last verified" date.

Format consistently with existing sections in the file.

#### `docs/architecture/module-blast-radius.md` — UPDATE

Add the budgeting module's exports + cross-module consumption.

Section format follows the existing module entries:

```
## Budgeting

### Exports
- `BudgetingReadFacade.getActiveModel(tenant_id)` — used by: (none in v1)
- `BudgetingTenantPreferences` — read by: phase 13 workspace, phase 17 event workspace, phase 19 share modal, phase 20 settings page

### Consumes (read-only)
- `FinanceReadFacade.invoicesByPeriod(tenant_id, range)` — for variance actuals
- `FinanceReadFacade.paymentsByPeriod(tenant_id, range)` — for variance actuals
- `FinanceReadFacade.discountsByPeriod(tenant_id, range)` — for variance actuals
- `PayrollReadFacade.entriesByPeriod(tenant_id, range)` — for variance staff costs
- `StudentsService.activeCountByYearGroup(tenant_id)` — for source snapshot at model creation
- `StaffProfilesService.activeCountByDepartment(tenant_id)` — for source snapshot at model creation
- `ClassesService.findByTenant(tenant_id)` — for trip workspace defaults
- `HouseholdsService.findByStudentIds(tenant_id, student_ids)` — for per-household trip cost computation

### Consumes (write — single explicit cross-module write)
- `FeeAssignmentsService.bulkCreate(...)` — trip→fee generation, gated by `budgeting.generate_fees` AND `finance.manage`. Wrapped in single transaction. Permission and transaction enforced in `BudgetingTripFeeIntegrationService`.

### What breaks if Budgeting changes
- (none — no module currently consumes Budgeting)

### What breaks if its dependencies change
- Variance breaks if Finance / Payroll read facades change shape — variance service has integration tests covering this
- Trip→fee integration breaks if `FeeAssignmentsService.bulkCreate` signature changes — phase 10 has tests pinned to the current signature
- Source snapshots become stale (but valid) if students / staff move tables — historic snapshots stay valid; new models pick up the new shape
```

#### `docs/architecture/event-job-catalog.md` — UPDATE

Add the 3 new BullMQ jobs:

```
## Budgeting

### budgeting:variance-refresh
- Queue: `budgeting`
- Schedule: cron — daily at 02:00 in tenant timezone
- Payload: `{ tenant_id }`
- Trigger: cron only; manual trigger via "Refresh now" button on variance page enqueues with same payload
- Side effects: rewrites `variance_cache` rows for the tenant's active models (status=published, fiscal_year_start <= now <= fiscal_year_end). Idempotent — wipes the model's cache rows and rewrites them per refresh. Wrapped in `createRlsClient(...).$transaction()`.
- Fan-out: cron iterates all tenants; per-tenant work iterates active models inside the tenant's RLS context.

### budgeting:board-pack-render
- Queue: `budgeting`
- Schedule: on-demand
- Payload: `{ tenant_id, snapshot_id, format: 'pdf' | 'excel' | 'all' }`
- Trigger: `POST /v1/budgeting/financial-models/:id/snapshots/:sid/exports/:format` enqueues this job when the snapshot doesn't have a current rendered output. Also enqueued automatically post-publish for `format: 'all'`.
- Side effects: renders PDF (Puppeteer) and/or Excel (exceljs) into Hetzner object storage; updates `financial_model_snapshots.pdf_object_key`, `.excel_object_key`, `.rendered_at`.
- Render time: typically 5–30s; large models (5k+ line items) can take 60–90s. Async via this queue so the API thread isn't blocked.

### budgeting:shareable-link-cleanup
- Queue: `budgeting`
- Schedule: cron — daily at 03:00 UTC (cross-tenant)
- Payload: `{}`
- Trigger: cron only
- Side effects: hard-deletes `shareable_links` rows where `expires_at < now() - 30 days`. Per `PLAN.md §11.2`, links that have been expired for more than 30 days are not retrievable in the audit trail.
- Fan-out: single cross-tenant query; doesn't iterate tenants explicitly (the `expires_at < now() - 30 days` filter is global).
```

#### `docs/architecture/state-machines.md` — UPDATE

Add the financial-model lifecycle:

```
## financial_models.status

```

draft ──── publish ───→ published ──── archive ───→ archived
↑ │  
 └──── create-draft ─────┘

```

| Transition | From | To | Side effects |
|-----------|------|-----|--------------|
| publish | draft | published | Creates `financial_model_snapshots` row with version_number = MAX + 1. Enqueues `budgeting:board-pack-render` for PDF + Excel. Audit log entry. |
| create-draft | published | (new draft) | Duplicates drivers + scenarios + line items into a new model row in `draft`. Old published row stays untouched. |
| archive | draft / published | archived | Sets `archived_at`. Hides from default lists. Variance refresh stops including this model. |
| restore-snapshot | published | (new draft) | Duplicates a specific snapshot's payload into a new draft. |

Validation locus: `apps/api/src/modules/budgeting/financial-models/financial-models.service.ts` — `VALID_TRANSITIONS` Record map.
```

Add the event-budget lifecycle:

```
## event_budgets.status

```

draft ── confirm ──→ confirmed ── generate-fees ──→ fees_generated ── complete ──→ completed
│ │ │
└────── cancel ───────┴──────── cancel ─────────────────── cancel? ────┘ (terminal)
(blocked when fees_generated)

```

| Transition | From | To | Side effects |
|-----------|------|-----|--------------|
| confirm | draft | confirmed | Validates required fields (event_date, participant_count > 0). Audit log. |
| generate-fees | confirmed (household_share_pct > 0) | fees_generated | Calls FeeAssignmentsService.bulkCreate inside one createRlsClient transaction. Sets fee_generation_run_id. Audit log. |
| mark-school-funded | confirmed (household_share_pct = 0) | fees_generated | Marks the trip as school-funded. No FeeAssignments side effect. Audit log. |
| complete | confirmed / fees_generated | completed | Post-trip closure. Audit log. |
| cancel | draft / confirmed | cancelled | Audit log. |
| cancel | fees_generated | (rejected with 409) | Cannot cancel after fees generated. User must void in Finance first, then re-cancel manually if desired. |
| cancel | completed | (rejected) | Cannot cancel a completed event. |

Validation locus: `apps/api/src/modules/budgeting/event-budgets/event-budgets.service.ts` — `VALID_TRANSITIONS` Record map.
```

Verify both new state machines link from the `state-machines.md` index at the top of the file.

#### `docs/architecture/danger-zones.md` — UPDATE

Add a new entry for trip→fee integration:

```
## Trip → Fee Integration (Budgeting → Finance write)

The single explicit write path from the budgeting module into the Finance module. It's the most consequential cross-module write in the platform — every household × student × amount combination becomes a real invoice.

### What's risky
- Permission gating must hold across all three rights (budgeting.view + budgeting.generate_fees + finance.manage). Backend re-checks at request time even when the frontend hides the button.
- The transaction must be all-or-nothing. Partial invoicing (e.g. half the households succeed, half fail) would be a finance-data corruption event.
- The dry-run preview MUST match the actual invoicing exactly. Drift between preview and write would mean users invoice amounts they didn't see.
- Voiding generated fees lives on the Finance side; we don't auto-void from budgeting because finance.manage is the canonical fee-mutation path.

### Mitigations
- All three permissions checked in BudgetingTripFeeIntegrationController.
- Single createRlsClient(...).$transaction(...) wraps fetch fee structure → bulkCreate → update event_budgets row → audit logs. Any failure rolls back the entire batch.
- Dry-run uses the same code path as the write (just with a flag preventing the actual writes), so drift is structurally impossible.
- Smoke tests on production never confirm the actual fee generation (per phase 18 convention).

### Where to look first when something goes wrong
- `apps/api/src/modules/budgeting/trip-fee-integration/trip-fee-integration.service.ts`
- Audit log filtered by `trip_fee_integration` action.
- `event_budgets.fee_generation_run_id` — links to the FeeGenerationRun row in Finance.
```

### 7. Per-task acceptance criteria

The polish session must complete every one of these before flipping to `completed`:

1. **Translations:** every key under `budgeting.*` namespace has both EN + AR values. Run `node scripts/check-translations.js budgeting` — zero `[MISSING TRANSLATION]` placeholders.
2. **Mobile:** open Chrome DevTools at 375px, walk every new page. Capture any overflow / unreachable touch target / unreadable text. Fix inline. Re-walk to confirm.
3. **A11y:** Tab through the workspace using only the keyboard. Confirm every interactive control is reachable + announced. Test screen reader (VoiceOver) on at least the workspace + event workspace + public snapshot view + generate-fees pages.
4. **Smoke:** Playwright suite in `apps/web/e2e/budgeting.spec.ts` runs green from a clean state. Document any flaky scenarios in the completion record.
5. **Architecture docs:** all four files (`feature-map.md`, `module-blast-radius.md`, `event-job-catalog.md`, `state-machines.md`) updated. Commit message references each file changed. Optional: `danger-zones.md` updated with the trip→fee entry.

### 8. Final deploy verification

After all the above are deployed:

1. Run the full smoke pack against production NHQS.
2. Manual walkthrough as a principal would: hub → create model → drivers → publish → variance → snapshots → export PDF → create trip → generate-fees dry-run → issue shareable link → public view → settings.
3. Check production logs for warnings — RLS-related 403s on stress tenants are expected; any 500s are bugs.
4. Confirm `variance_cache`, `financial_model_snapshots`, `shareable_links` are receiving rows over 24 hours.
5. Confirm the cron jobs registered: `pm2 logs worker | grep budgeting` shows variance-refresh + shareable-link-cleanup attempts.
6. Post the final completion record to `IMPLEMENTATION_LOG.md` §5 summarising the rebuild — list every shipped phase, the key user-visible features, the architecture docs updated, and any deferred items.

## Testing requirements

- **Translation coverage script:** `node scripts/check-translations.js budgeting` reports zero missing keys in either locale. Run as a CI step.
- **A11y violations:** scanned via `axe-core` (or `@axe-core/playwright`) on each page — zero serious violations. Document any waived issues with rationale.
- **Smoke pack:** `pnpm --filter @school/web test:e2e budgeting.spec.ts` green.
- **Unit / integration tests:** Wave 1–4 tests still pass; no regressions from polish changes. Run `pnpm turbo run test --filter=@school/web --filter=@school/shared`.

## Post-deploy verification

Full manual walkthrough per §8 above.

## Follow-ups

None in scope. This is the final phase of the rebuild.

**Deferred items (documented in the completion record but explicitly NOT blocking this rebuild — these are v2 candidates):**

- AI features: executive summary narration, variance explanation, scenario suggestion, natural-language driver editing.
- Multi-user collaborative authoring: department-head sub-budget submissions, "submitted for review" state, in-product comments.
- Custom driver UI: tenants extending the canonical 11-driver list via a UI (currently JSONB-only).
- Custom category UI: tenants extending the chart-of-accounts categories.
- Approval workflow: "pending board approval" state.
- Data warehouse migration: hourly aggregations table for tenants past the OLTP comfort point.
- External imports: QuickBooks, Xero, Sage. Excel export remains the data-portability story.
- Trip payment collection inside the Budgeting module: stays in Finance per `PLAN.md` out-of-scope §2.

## Rollback

`git revert <sha>` — polish-only phase. Reverting loses:

- Translation values (Arabic translations specifically).
- Mobile responsiveness fixes (any tweaks made inline during the mobile pass).
- A11y improvements (ARIA labels, keyboard handlers, focus management additions).
- Playwright smoke tests.
- Architecture documentation updates.

Functional regressions from rolling this back are minimal — the underlying functionality from phases 12–20 remains intact. Reverting just leaves the module rougher around the edges.

If revert is needed because the smoke uncovered a deeper bug: revert the polish commit, fix the bug in a new commit, then re-land polish on top. Don't fold polish + bugfix into one revert.
