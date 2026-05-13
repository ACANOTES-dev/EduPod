# Deep-Dive Evidence — Batch 2 (Money + Analytics)

> Raw agent investigation report. Saved verbatim from the deep-dive pass on 2026-05-13.
> Modules: finance, payroll, budgeting, analytics_advanced.

========================================

## Module: finance

display_name_proposal: "Finance Management"
description_proposal: "Invoices, payments, discounts, refunds, credit notes, payment plans, scholarships, and household statements."

### API

api_module_dir: `apps/api/src/modules/finance`
controllers:

- discounts.controller.ts: gating=none, key=n/a, endpoints=5
- fee-assignments.controller.ts: gating=none, key=n/a, endpoints=5
- fee-generation.controller.ts: gating=none, key=n/a, endpoints=2
- fee-structures.controller.ts: gating=none, key=n/a, endpoints=5
- fee-types.controller.ts: gating=none, key=n/a, endpoints=5
- finance-dashboard.controller.ts: gating=none, key=n/a, endpoints=5
- finance-enhanced.controller.ts: gating=none, key=n/a, endpoints=39
- household-statements.controller.ts: gating=none, key=n/a, endpoints=2
- invoices.controller.ts: gating=none, key=n/a, endpoints=13
- parent-finance.controller.ts: gating=none, key=n/a, endpoints=5
- payments.controller.ts: gating=none, key=n/a, endpoints=8
- refunds.controller.ts: gating=none, key=n/a, endpoints=5
- stripe-webhook.controller.ts: gating=none, key=n/a, endpoints=1
  exported_services: [InvoicesService, PaymentsService, ReceiptsService, ScholarshipsService, PaymentRemindersService, RecurringInvoicesService, LateFeesService, FinanceReadFacade, StripeService, FeeAssignmentsService, FeeStructuresService]
  consumed_by_modules: [registration, compliance, admissions, budgeting, reports]

### Frontend

routes: ~41 pages under `apps/web/src/app/[locale]/(school)/finance/` (invoices, payments, discounts, fee structures, fee types, fee assignments, household statements, household-level views, etc.)
nav_locations: School → Finance hub
module_aware_files: none detected

### Worker

queues: 'finance' (BullMQ)
crons: overdue-detection (cadence unverified)
processors: [finance-queue, overdue-detection, invoice-approval-callback, stripe-refund-reconciliation]

### Data

primary_tables: [Invoice, InvoiceLine, Payment, PaymentAllocation, Refund, FeeType, FeeStructure, HouseholdFeeAssignment, InvoiceReminder, RecurringInvoiceConfig, LateFeeConfig, LateFeeApplication, PaymentPlanRequest, Scholarship, Household, HouseholdEmergencyContact, HouseholdParent]
table_count: ~17

### Permissions

permission_count: 4
sample_permission_keys: ['finance.manage', 'finance.view', 'finance.process_payments', 'finance.issue_refunds']

### Notifications

notification_types: ['invoice.issued', 'payment.received', 'payment.failed']

### PDF

template_keys: ['invoice', 'receipt', 'household-statement']

### Current gating state

api_enforcement: none
frontend_enforcement: none (unverified)
worker_enforcement: none
in_seed_module_keys: yes
default_enabled: yes (unverified)

### Gaps to fix

- No `@ModuleEnabled('finance')` decorator on ANY controller. Add to all 13 controllers at class level + `ModuleEnabledGuard` to `@UseGuards()`.
- Finance routes in Next.js app have no tenant module checks.
- Worker processors (overdue-detection, invoice-approval-callback, stripe-refund-reconciliation) dispatch without per-tenant checks.
- **Stripe webhook controller**: special case — webhook receives Stripe events asynchronously. Should NOT be gated at the controller; instead, the handler should silently no-op for tenants with finance disabled (preserve idempotency, log the skip).

### Disable impact

hidden_when_off: All finance routes (/finance, /finance/invoices, /finance/payments, etc.), parent payment portal, school dashboard finance widgets, household billing statements.
data_status: Data preserved in DB; UI hidden; API returns 403 Forbidden if `@ModuleEnabled` guard is added.
risk_if_disabled_today: high — Finance is mission-critical for school billing. Disabling without data preservation visibility would confuse admins. Currently no gating, so would break unexpectedly.
risk_if_re_enabled_later: Low — data is timestamped and complete; re-enabling exposes full audit trail.

========================================

## Module: payroll

display_name_proposal: "Payroll Management"
description_proposal: "Salary runs, payslips, compensation, deductions, allowances, and payroll reports."

### API

api_module_dir: `apps/api/src/modules/payroll`
controllers:

- compensation.controller.ts: gating=class, key='payroll', endpoints=5
- payroll-dashboard.controller.ts: gating=class, key='payroll', endpoints=1
- payroll-enhanced.controller.ts: gating=class, key='payroll', endpoints=56
- payroll-entries.controller.ts: gating=none, key=n/a, endpoints=2
- payroll-reports.controller.ts: gating=class, key='payroll', endpoints=10
- payroll-runs.controller.ts: gating=class, key='payroll', endpoints=19
- payslips.controller.ts: gating=class, key='payroll', endpoints=6
  exported_services: [PayrollRunsService, StaffAttendanceService, ClassDeliveryService, PayrollAllowancesService, PayrollDeductionsService, PayrollInputResolver, FinalisationService]
  consumed_by_modules: [compliance, reports]

### Frontend

routes: ~11 pages under `apps/web/src/app/[locale]/(school)/payroll/` (runs, payslips, compensation, reports, dashboard, one-offs, adjustments, deductions, allowances, etc.)
nav_locations: School → Payroll hub
module_aware_files: none detected (unverified)

### Worker

queues: 'payroll' (BullMQ)
crons: session-generation (cadence unverified)
processors: [payroll-queue, session-generation, approval-callback, mass-export]

### Data

primary_tables: [PayrollRun, PayrollEntry, Payslip, Compensation, StaffAttendance, ClassDelivery, PayrollAdjustment, PayrollAllowance, PayrollDeduction, PayrollOneOff, LateFeeApplication (shared with finance), SchedulingScenario (shared with scheduling)]
table_count: ~10

### Permissions

permission_count: 13
sample_permission_keys: ['payroll.view', 'payroll.create_run', 'payroll.finalise_run', 'payroll.generate_payslips', 'payroll.manage_compensation']

### Notifications

notification_types: ['payroll.finalised', 'payslip.generated']

### PDF

template_keys: ['payslip']

### Current gating state

api_enforcement: partial (6 of 7 controllers gate on 'payroll'; payroll-entries.controller.ts does NOT)
frontend_enforcement: unknown
worker_enforcement: none
in_seed_module_keys: yes
default_enabled: yes

### Gaps to fix

- `payroll-entries.controller.ts` is missing `@ModuleEnabled('payroll')` and `ModuleEnabledGuard`. Add both.
- Worker processors have no per-tenant module checks; dispatch happens regardless of tenant setting.
- Frontend routes have no module awareness (unverified, but high confidence given pattern).

### Disable impact

hidden_when_off: All payroll routes (/payroll, /payroll/runs, /payroll/payslips, /payroll/compensation, /payroll/reports), staff self-service portal, school dashboard payroll widgets.
data_status: Data preserved; API returns 403; UI hidden.
risk_if_disabled_today: high — Payroll is business-critical. Staff expect payslips. Disabling mid-cycle breaks transparency.
risk_if_re_enabled_later: Low — full audit trail preserved; re-enabling shows complete salary history.

========================================

## Module: budgeting

display_name_proposal: "Budgeting & Financial Modeling"
description_proposal: "Financial models, scenarios, line-item variance analysis, event budgets, and board-pack exports."

### API

api_module_dir: `apps/api/src/modules/budgeting`
controllers:

- event-budgets/event-budgets.controller.ts: gating=none, key=n/a, endpoints=13
- exports/exports.controller.ts: gating=none, key=n/a, endpoints=3
- financial-models/financial-models.controller.ts: gating=none, key=n/a, endpoints=6
- line-items/line-items.controller.ts: gating=none, key=n/a, endpoints=4
- scenarios/scenarios.controller.ts: gating=none, key=n/a, endpoints=5
- shareable-links/shareable-links.controller.ts: gating=none, key=n/a, endpoints=3
- shareable-links/shareable-links.public.controller.ts: gating=none (public, no auth), key=n/a, endpoints=1
- snapshots/snapshots.controller.ts: gating=none, key=n/a, endpoints=4
- tenant-preferences/tenant-preferences.controller.ts: gating=none, key=n/a, endpoints=2
- trip-fee-integration/trip-fee-integration.controller.ts: gating=none, key=n/a, endpoints=3
- variance/variance.controller.ts: gating=none, key=n/a, endpoints=3
  exported_services: [FinancialModelsService, ScenariosService, LineItemsService, SnapshotsService, VarianceActualsSourceService, EventBudgetsService, PdfRendererService, ExcelRendererService]
  consumed_by_modules: none detected (BudgetingModule is a terminal leaf; imported by app-level, no cross-module consumers)

### Frontend

routes: under `apps/web/src/app/[locale]/(school)/finance/budgeting/` (integration with finance hub; separate route tree exists for financial models, scenarios, exports, shareable links)
nav_locations: School → Finance → Budgeting sub-hub
module_aware_files: none detected

### Worker

queues: 'budgeting' (BullMQ)
crons: shareable-link-cleanup (cadence unverified)
processors: [budgeting-queue, shareable-link-cleanup, board-pack-render, variance-refresh]

### Data

primary_tables: [FinancialModel, Scenario, FinancialModelLineItem, FinancialModelSnapshot, EventBudget, EventBudgetScenario, VarianceCache]
table_count: ~7

### Permissions

permission_count: 4
sample_permission_keys: ['budgeting.view', 'budgeting.manage', 'budgeting.publish', 'budgeting.share']

### Notifications

notification_types: none (unverified; likely none specific to budgeting itself)

### PDF

template_keys: none (budgeting renders board packs via PdfRenderer + ExcelRenderer; no predefined template)

### Current gating state

api_enforcement: none
frontend_enforcement: none
worker_enforcement: none
in_seed_module_keys: yes (in seed.ts line 52; **missing from fixture.builder.ts** — test fixture gap)
default_enabled: yes

### Gaps to fix

- No `@ModuleEnabled('budgeting')` on ANY of the 11 controllers. Add class-level decorator + `ModuleEnabledGuard` to all.
- `budgeting` is in seed.ts MODULE_KEYS but **NOT in** `apps/api/test/tenant-fixture.builder.ts` (line 29–46). Fixture is out of sync; tests will not reflect prod module state.
- Worker processors have no per-tenant checks.
- Frontend (under finance/budgeting) has no module awareness.
- Public shareable link controller (`shareable-links.public.controller.ts`) is intentionally ungated (public access). Document this; add a short-lived token check.

### Disable impact

hidden_when_off: All budgeting routes (/finance/budgeting/models, /scenarios, /snapshots, /exports, /shareable-links, /variance), board-pack renders, scenario analysis, line-item variance reports, event budget planning.
data_status: Data preserved; API returns 403; UI hidden.
risk_if_disabled_today: medium — Budgeting is planning/forecasting; disabling mid-planning cycle breaks continuity, but won't break operational billing (finance module separate).
risk_if_re_enabled_later: Low — models, scenarios, and snapshots are versioned; re-enabling exposes full planning history.

========================================

## Module: analytics_advanced (Proposed New Toggle)

display_name_proposal: "Advanced Analytics & Reporting"
description_proposal: "Custom reports, dashboards, AI predictions, board reports, compliance reports, KPI analysis, and shareable report exports."

### API

api_module_dir: `apps/api/src/modules/reports` (primary); ancillary modules: dashboard, people-dashboard, early-warning (separate gate), wellbeing-aggregate (shared with wellbeing)
controllers:

- reports.controller.ts: gating=none, key=n/a, endpoints=6
- reports-enhanced.controller.ts: gating=none, key=n/a (marked `@SensitiveDataAccess('analytics')`), endpoints=76
- ai-predictions.controller.ts: gating=none, key=n/a, endpoints=unverified
- saved-report-draft/saved-report-draft.controller.ts: gating=none, key=n/a, endpoints=unverified
- ai-ask-ai/ai-ask-ai.controller.ts: gating=none, key=n/a, endpoints=unverified
- compliance-report/compliance-report.controller.ts: gating=none, key=n/a, endpoints=unverified
- reports-settings/reports-settings.controller.ts: gating=none, key=n/a, endpoints=unverified
- subject-registry/subject-registry.controller.ts: gating=none, key=n/a, endpoints=unverified
- report-sharing/report-sharing.controller.ts: gating=none, key=n/a, endpoints=unverified
- dashboard/dashboard.controller.ts: gating=none, key=n/a, endpoints=unverified
  exported_services: [UnifiedDashboardService, CustomReportBuilderService, BoardReportService, ComplianceReportService, ReportSharingService, ReportExportService, QueryEngineService, and 15+ analytics/aggregation services]
  consumed_by_modules: none (reports is a terminal consumer of finance, payroll, academics, attendance, behaviour, etc.)

### Frontend

routes: ~22 pages under `apps/web/src/app/[locale]/(school)/reports/` (custom-reports, dashboards, kpis, board-reports, compliance-reports, filters, saved-drafts, sharing); ~10 pages under `/dashboard/` (executive KPI summary, school health score); people-dashboard routes; wellbeing-aggregate routes
nav_locations: School → Reports hub; School → Dashboard; School → People; Wellbeing → Aggregate
module_aware_files: none detected

### Worker

queues: none dedicated (reports uses finance/payroll queues for data refresh)
crons: scheduled-reports (cadence unverified)
processors: board-pack-render (shared with budgeting module), scheduled-reports (unverified processor location)

### Data

primary_tables: (read-only façade over 20+ operational tables; no direct ownership. Snapshot tables: PeriodGradeSnapshot, StudentCompetencySnapshot, GpaSnapshot, BroadcastAudienceSnapshot, SavedReportDraft, ReportShare, ReportSettingsPreference)
table_count: ~5 owned; ~20+ read via façades

### Permissions

permission_count: 0 specific (inherits from consuming modules: finance.view, payroll.view, academics.view, attendance.view, behaviour.view, etc.)
sample_permission_keys: (none; analytics cross-module read pattern does not gate analytics separately)

### Notifications

notification_types: none specific to analytics

### PDF

template_keys: none (renders via ReportExportService + custom PDF/Excel renderers; no templates)

### Current gating state

api_enforcement: none (though `@SensitiveDataAccess('analytics')` marker exists on reports-enhanced.controller.ts, it is NOT a functional guard)
frontend_enforcement: none
worker_enforcement: none
in_seed_module_keys: yes (key='analytics' exists in seed.ts + fixture.builder.ts, but is NEVER enforced anywhere)
default_enabled: yes

### Gaps to fix

- Seed has `'analytics'` key but it's a ghost toggle — **no `@ModuleEnabled('analytics')` anywhere in the codebase**.
- `@SensitiveDataAccess('analytics')` on reports-enhanced.controller.ts is a marker, NOT a gate; it does not check tenant module state.
- **DECISION**: Is `analytics_advanced` a real new toggle, or fold it into existing module keys? Current recommendation: **fold it into module-level gates** (finance.view, payroll.view, gradebook.view gates reports that depend on those modules). A standalone `analytics_advanced` gate would be redundant overhead.

### Disable impact

hidden_when_off: Custom reports, board reports, compliance reports, KPI dashboards, AI predictions, executive dashboard, people dashboard, aggregate wellbeing views, shareable report links.
data_status: Data preserved (snapshots, saved drafts, sharing links remain in DB); UI hidden; API returns 403 if gated.
risk_if_disabled_today: medium — Analytics is a planning/insight tool, not operational. Disabling mid-term planning breaks insight continuity.
risk_if_re_enabled_later: Low — reports and snapshots are versioned/timestamped; re-enabling exposes full historical analysis.

---

## Summary & Recommendations (batch 2)

| Module                 | API Gating     | Frontend Gating | Worker Gating | Seed Status                 | Fix Priority                          |
| ---------------------- | -------------- | --------------- | ------------- | --------------------------- | ------------------------------------- |
| **finance**            | 0/13           | unknown         | no            | in seed                     | Critical                              |
| **payroll**            | 6/7            | unknown         | no            | in seed                     | High                                  |
| **budgeting**          | 0/11           | none            | no            | in seed; **out of fixture** | Critical                              |
| **analytics_advanced** | n/a (proposed) | n/a             | no            | ghost key                   | Design decision — recommend deprecate |

### Actionable Path Forward

1. **Finance** — Add `@ModuleEnabled('finance')` + `ModuleEnabledGuard` to all 13 controllers. Update worker processors to check tenant module state before dispatching jobs. Add frontend module-aware route guards.

2. **Payroll** — Complete partial gating: add decorator to `payroll-entries.controller.ts`. Wire worker processors (session-generation, approval-callback, mass-export) to check tenant module state. Frontend same as finance.

3. **Budgeting** — Add `@ModuleEnabled('budgeting')` to all 11 controllers. **CRITICAL: sync fixture.builder.ts MODULE_KEYS to include 'budgeting'**. Wire worker processors. Frontend same.

4. **Analytics_Advanced** — **Recommendation: Do NOT create a new toggle.** Instead, gate reports/dashboards via existing module keys (finance.view gates finance-specific reports, payroll.view gates payroll-specific, etc.). This avoids permission cartesian explosion and keeps gating aligned with data access. If a school disables finance, they naturally lose finance analytics. The existing `'analytics'` key in seed should be deprecated.
