# Hotspot Metrics

Generated: 2026-04-19

Tracked maintainability hotspots and their current cyclomatic complexity budgets and file-level line counts. The CI check fails if any monitored function exceeds its complexity budget or any file exceeds its line budget. This report should be refreshed after each maintainability wave.

## Wave History

| Wave   | Date       | Summary                                                                                                         |
| ------ | ---------- | --------------------------------------------------------------------------------------------------------------- |
| Wave 1 | 2026-04-01 | Maintainability audit baseline after Phase D service decomposition and shared frontend pattern extraction.      |
| Wave 2 | 2026-04-02 | Expanded hotspot tracking to top 10 API, top 3 worker, and top 3 frontend files. Added file-level line budgets. |

## Budgeted Hotspots — Function Complexity

### apps/api/src/modules/pastoral/services/concern.service.ts

Pastoral concern lifecycle and sharing remain one of the highest-risk maintainability hotspots because the service coordinates access control, state changes, and cross-entity relationship writes.

| Function               | Line | Current complexity | Budget | Status |
| ---------------------- | ---- | ------------------ | ------ | ------ |
| ConcernService.getById | 285  | 10                 | 10     | PASS   |

### apps/api/src/modules/behaviour/behaviour-students.service.ts

Behaviour student views still aggregate history, summary, and parent-facing information across several tables, so new logic should stay bounded as the module evolves.

| Function                                   | Line | Current complexity | Budget | Status |
| ------------------------------------------ | ---- | ------------------ | ------ | ------ |
| BehaviourStudentsService.listStudents      | 42   | 6                  | 6      | PASS   |
| BehaviourStudentsService.getStudentProfile | 139  | 2                  | 2      | PASS   |

### apps/api/src/modules/gradebook/report-cards/report-cards.service.ts

Report cards remain a high-change module with lifecycle orchestration, approval flow, and query responsibilities that can regress into a god service without guardrails.

| Function                   | Line | Current complexity | Budget | Status |
| -------------------------- | ---- | ------------------ | ------ | ------ |
| ReportCardsService.publish | 136  | 3                  | 12     | PASS   |
| ReportCardsService.update  | 69   | 5                  | 10     | PASS   |

### apps/api/src/modules/homework/homework-analytics.service.ts

Homework analytics aggregates trend, correlation, and pattern data across multiple tables with heavy branching for time-window and grouping logic.

| Function                                     | Line | Current complexity | Budget | Status |
| -------------------------------------------- | ---- | ------------------ | ------ | ------ |
| HomeworkAnalyticsService.studentTrends       | 64   | 1                  | 23     | PASS   |
| HomeworkAnalyticsService.correlationAnalysis | 74   | 1                  | 16     | PASS   |
| HomeworkAnalyticsService.loadAnalysis        | 52   | 1                  | 11     | PASS   |

### apps/api/src/modules/safeguarding/safeguarding-concerns.service.ts

Safeguarding concern reporting and triage involves access-controlled detail mapping, multi-step status transitions, and sensitive data handling.

| Function                                              | Line | Current complexity | Budget | Status |
| ----------------------------------------------------- | ---- | ------------------ | ------ | ------ |
| SafeguardingConcernsService.mapConcernDetail          | 963  | 22                 | 24     | PASS   |
| SafeguardingConcernsService.reportConcern::closure@74 | 74   | 18                 | 20     | PASS   |
| SafeguardingConcernsService.listConcerns              | 306  | 17                 | 19     | PASS   |

### apps/api/src/modules/pastoral/services/pastoral-dsar.service.ts

DSAR processing aggregates records across all pastoral entities with complex record-type routing, summary assembly, and multi-entity fetch logic.

| Function                                        | Line | Current complexity | Budget | Status |
| ----------------------------------------------- | ---- | ------------------ | ------ | ------ |
| PastoralDsarService.getRecordSummary            | 902  | 28                 | 30     | PASS   |
| PastoralDsarService.routeForReview::closure@164 | 164  | 20                 | 22     | PASS   |
| PastoralDsarService.fetchEntityRecord           | 767  | 18                 | 20     | PASS   |

### apps/api/src/modules/behaviour/behaviour-appeals.service.ts

Appeal lifecycle with decision branching, sanction reversal, and multi-party notification makes the decide and submit methods complex.

| Function                                    | Line | Current complexity | Budget | Status |
| ------------------------------------------- | ---- | ------------------ | ------ | ------ |
| BehaviourAppealsService.decide::closure@563 | 563  | 24                 | 29     | PASS   |
| BehaviourAppealsService.submit::closure@99  | 99   | 17                 | 19     | PASS   |
| BehaviourAppealsService.update::closure@443 | 443  | 17                 | 19     | PASS   |

### apps/api/src/modules/homework/homework.service.ts

Homework service manages CRUD, recurrence generation, and bulk operations with date computation and validation branching.

| Function                                | Line | Current complexity | Budget | Status       |
| --------------------------------------- | ---- | ------------------ | ------ | ------------ |
| HomeworkService.update::closure@252     | —    | Missing            | 19     | Needs review |
| HomeworkService.generateRecurrenceDates | 1148 | 17                 | 19     | PASS         |
| HomeworkService.bulkCreate::closure@892 | —    | Missing            | 16     | Needs review |

### apps/worker/src/processors/early-warning/signal-collection.utils.ts

Signal collection utilities contain the highest-complexity functions in the entire codebase; each collector aggregates data across multiple domains with extensive conditional logic.

| Function                 | Line | Current complexity | Budget | Status |
| ------------------------ | ---- | ------------------ | ------ | ------ |
| collectEngagementSignals | 1030 | 63                 | 65     | PASS   |
| collectWellbeingSignals  | 819  | 32                 | 34     | PASS   |
| collectGradesSignals     | 397  | 31                 | 33     | PASS   |

### apps/worker/src/cron/cron-scheduler.service.ts

Cron scheduler is low-complexity per method but extremely long; line budget is the primary control to prevent unbounded growth as new cron jobs are added.

| Function                          | Line | Current complexity | Budget | Status |
| --------------------------------- | ---- | ------------------ | ------ | ------ |
| CronSchedulerService.onModuleInit | 92   | 1                  | 3      | PASS   |

### apps/worker/src/processors/communications/dispatch-notifications.processor.ts

Notification dispatch handles multi-channel routing (email, SMS, WhatsApp, push) with per-channel formatting and error handling branching.

| Function                                  | Line | Current complexity | Budget | Status |
| ----------------------------------------- | ---- | ------------------ | ------ | ------ |
| DispatchNotificationsJob.dispatchEmail    | 357  | 10                 | 12     | PASS   |
| DispatchNotificationsJob.dispatchAll      | 306  | 8                  | 10     | PASS   |
| DispatchNotificationsJob.dispatchWhatsApp | 430  | 8                  | 10     | PASS   |

### apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx

SEN plan detail page is the largest frontend file with a monolithic component handling view, edit, review, and approval states in a single render function.

| Function                           | Line | Current complexity | Budget | Status |
| ---------------------------------- | ---- | ------------------ | ------ | ------ |
| SupportPlanDetailPage              | 119  | 18                 | 20     | PASS   |
| SupportPlanDetailPage::closure@537 | 537  | 11                 | 13     | PASS   |

### apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx

Appeal detail page has extreme render-function complexity with status-dependent UI sections, decision forms, and timeline rendering.

| Function         | Line | Current complexity | Budget | Status |
| ---------------- | ---- | ------------------ | ------ | ------ |
| AppealDetailPage | 215  | 43                 | 45     | PASS   |
| handleDecide     | 321  | 8                  | 10     | PASS   |

### apps/web/src/app/[locale]/(school)/settings/behaviour-admin/page.tsx

Behaviour admin settings page contains multiple tab components (operations, scope audit, retention) each with their own form handling and state.

| Function           | Line | Current complexity | Budget | Status |
| ------------------ | ---- | ------------------ | ------ | ------ |
| BehaviourAdminPage | 100  | 6                  | 8      | PASS   |
| ScopeAuditTab      | 546  | 6                  | 8      | PASS   |

## File Line Budgets

| File                                                                          | Current lines | Budget | Utilisation | Status |
| ----------------------------------------------------------------------------- | ------------- | ------ | ----------- | ------ |
| apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts     | 322           | 372    | 87%         | PASS   |
| apps/api/src/modules/households/households.service.ts                         | 191           | 234    | 82%         | PASS   |
| apps/api/src/modules/homework/homework-analytics.service.ts                   | 78            | 1139   | 7%          | PASS   |
| apps/api/src/modules/behaviour/behaviour-sanctions.service.ts                 | 117           | 167    | 70%         | PASS   |
| apps/api/src/modules/safeguarding/safeguarding-concerns.service.ts            | 1071          | 1120   | 96%         | PASS   |
| apps/api/src/modules/pastoral/services/pastoral-dsar.service.ts               | 1051          | 1106   | 95%         | PASS   |
| apps/api/src/modules/attendance/attendance-upload.service.ts                  | 98            | 148    | 66%         | PASS   |
| apps/api/src/modules/behaviour/behaviour.service.ts                           | 96            | 146    | 66%         | PASS   |
| apps/api/src/modules/behaviour/behaviour-appeals.service.ts                   | 997           | 1038   | 96%         | PASS   |
| apps/api/src/modules/homework/homework.service.ts                             | 1205          | 1036   | 116%        | FAIL   |
| apps/worker/src/processors/early-warning/signal-collection.utils.ts           | 1332          | 1382   | 96%         | PASS   |
| apps/worker/src/cron/cron-scheduler.service.ts                                | 938           | 792    | 118%        | FAIL   |
| apps/worker/src/processors/communications/dispatch-notifications.processor.ts | 748           | 778    | 96%         | PASS   |
| apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx                | 965           | 1011   | 95%         | PASS   |
| apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx            | 934           | 989    | 94%         | PASS   |
| apps/web/src/app/[locale]/(school)/settings/behaviour-admin/page.tsx          | 905           | 988    | 92%         | PASS   |

## Needs Attention

Files above 80% of their line budget:

- **apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts**: 322/372 lines (87%) — Workload compute service mixes personal, aggregate, and trend logic now thin facade, across 322 lines
- **apps/api/src/modules/households/households.service.ts**: 191/234 lines (82%) — Household CRUD with merge/split orchestration now thin facade, across 184 lines
- **apps/api/src/modules/safeguarding/safeguarding-concerns.service.ts**: 1071/1120 lines (96%) — Safeguarding concern triage and access-controlled detail mapping across 1070 lines
- **apps/api/src/modules/pastoral/services/pastoral-dsar.service.ts**: 1051/1106 lines (95%) — DSAR processing with multi-entity record aggregation across 1056 lines
- **apps/api/src/modules/behaviour/behaviour-appeals.service.ts**: 997/1038 lines (96%) — Appeal lifecycle with decision branching and sanction reversal across 988 lines
- **apps/api/src/modules/homework/homework.service.ts**: 1205/1036 lines (116%) — Homework CRUD with recurrence generation and bulk operations across 986 lines
- **apps/worker/src/processors/early-warning/signal-collection.utils.ts**: 1332/1382 lines (96%) — Signal collection utilities with the highest complexity functions in the codebase across 1332 lines
- **apps/worker/src/cron/cron-scheduler.service.ts**: 938/792 lines (118%) — Cron scheduler grows as new jobs are added; line budget prevents unbounded expansion from 742 lines
- **apps/worker/src/processors/communications/dispatch-notifications.processor.ts**: 748/778 lines (96%) — Multi-channel notification dispatch with per-channel formatting across 728 lines
- **apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx**: 965/1011 lines (95%) — Largest frontend file; monolithic SEN plan detail component across 961 lines
- **apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx**: 934/989 lines (94%) — Appeal detail page with status-dependent UI and decision forms across 939 lines
- **apps/web/src/app/[locale]/(school)/settings/behaviour-admin/page.tsx**: 905/988 lines (92%) — Multi-tab behaviour admin settings page across 938 lines
