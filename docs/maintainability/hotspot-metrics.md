# Hotspot Metrics

Generated: 2026-04-02

Tracked maintainability hotspots and their current cyclomatic complexity budgets and file-level line counts. The CI check fails if any monitored function exceeds its complexity budget or any file exceeds its line budget. This report should be refreshed after each maintainability wave.

## Wave History

| Wave | Date | Summary |
|------|------|---------|
| Wave 1 | 2026-04-01 | Maintainability audit baseline after Phase D service decomposition and shared frontend pattern extraction. |
| Wave 2 | 2026-04-02 | Expanded hotspot tracking to top 10 API, top 3 worker, and top 3 frontend files. Added file-level line budgets. |

## Budgeted Hotspots — Function Complexity

### apps/api/src/modules/pastoral/services/concern.service.ts

Pastoral concern lifecycle and sharing remain one of the highest-risk maintainability hotspots because the service coordinates access control, state changes, and cross-entity relationship writes.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| ConcernService.getById | 274 | 10 | 10 | PASS |

### apps/api/src/modules/behaviour/behaviour-students.service.ts

Behaviour student views still aggregate history, summary, and parent-facing information across several tables, so new logic should stay bounded as the module evolves.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| BehaviourStudentsService.listStudents | 35 | 6 | 6 | PASS |
| BehaviourStudentsService.getStudentProfile | 125 | 2 | 2 | PASS |

### apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts

Workload calculations mix personal, aggregate, and trend concerns; budgets help keep future additions inside the extracted helpers rather than back in the facade.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| WorkloadComputeService.getAggregateTimetableQuality::closure@617 | 617 | 12 | 12 | PASS |
| WorkloadComputeService.getAggregateWorkloadSummary::closure@459 | 459 | 10 | 10 | PASS |

### apps/api/src/modules/gradebook/report-cards/report-cards.service.ts

Report cards remain a high-change module with lifecycle orchestration, approval flow, and query responsibilities that can regress into a god service without guardrails.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| ReportCardsService.publish | 107 | 3 | 12 | PASS |
| ReportCardsService.update | 40 | 5 | 10 | PASS |

### apps/api/src/modules/households/households.service.ts

Household operations (create, merge, split) coordinate multi-entity writes across students, parents, addresses, and contacts with complex validation logic.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| HouseholdsService.split::closure@903 | 903 | 10 | 12 | PASS |
| HouseholdsService.create::closure@116 | 116 | 9 | 11 | PASS |
| HouseholdsService.merge::closure@726 | 726 | 9 | 11 | PASS |

### apps/api/src/modules/homework/homework-analytics.service.ts

Homework analytics aggregates trend, correlation, and pattern data across multiple tables with heavy branching for time-window and grouping logic.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| HomeworkAnalyticsService.studentTrends | 137 | 21 | 23 | PASS |
| HomeworkAnalyticsService.correlationAnalysis | 1003 | 14 | 16 | PASS |
| HomeworkAnalyticsService.loadAnalysis | 442 | 9 | 11 | PASS |

### apps/api/src/modules/behaviour/behaviour-sanctions.service.ts

Sanction lifecycle involves creation with approval routing, conflict detection, and status transition logic that can grow unbounded without guardrails.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| BehaviourSanctionsService.create::closure@55 | 55 | 25 | 27 | PASS |
| BehaviourSanctionsService.update::closure@412 | 412 | 22 | 24 | PASS |
| BehaviourSanctionsService.checkConflicts | 858 | 14 | 16 | PASS |

### apps/api/src/modules/behaviour/safeguarding-concerns.service.ts

Safeguarding concern reporting and triage involves access-controlled detail mapping, multi-step status transitions, and sensitive data handling.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| SafeguardingConcernsService.mapConcernDetail | 963 | 22 | 24 | PASS |
| SafeguardingConcernsService.reportConcern::closure@74 | 74 | 18 | 20 | PASS |
| SafeguardingConcernsService.listConcerns | 306 | 17 | 19 | PASS |

### apps/api/src/modules/pastoral/services/pastoral-dsar.service.ts

DSAR processing aggregates records across all pastoral entities with complex record-type routing, summary assembly, and multi-entity fetch logic.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| PastoralDsarService.getRecordSummary | 907 | 28 | 30 | PASS |
| PastoralDsarService.routeForReview::closure@162 | 162 | 20 | 22 | PASS |
| PastoralDsarService.fetchEntityRecord | 772 | 18 | 20 | PASS |

### apps/api/src/modules/attendance/attendance-upload.service.ts

Attendance bulk upload parses CSV/XLSX with row-level validation, conflict detection, and transactional commit that concentrates branching in a single flow.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| AttendanceUploadService.processUpload | 213 | 25 | 27 | PASS |
| AttendanceUploadService.parseXlsx | 937 | 15 | 17 | PASS |
| AttendanceUploadService.parseCsv | 840 | 12 | 14 | PASS |

### apps/api/src/modules/behaviour/behaviour.service.ts

Core behaviour incident service with the highest single-function complexity in the codebase; createIncident orchestrates validation, participant handling, escalation, and notification dispatch.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| BehaviourService.createIncident::closure@71 | 71 | 46 | 48 | PASS |
| BehaviourService.addParticipant::closure@787 | 787 | 19 | 21 | PASS |
| BehaviourService.listIncidents | 334 | 17 | 19 | PASS |

### apps/api/src/modules/behaviour/behaviour-appeals.service.ts

Appeal lifecycle with decision branching, sanction reversal, and multi-party notification makes the decide and submit methods complex.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| BehaviourAppealsService.decide::closure@563 | 563 | 27 | 29 | PASS |
| BehaviourAppealsService.submit::closure@99 | 99 | 17 | 19 | PASS |
| BehaviourAppealsService.update::closure@443 | 443 | 17 | 19 | PASS |

### apps/api/src/modules/homework/homework.service.ts

Homework service manages CRUD, recurrence generation, and bulk operations with date computation and validation branching.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| HomeworkService.update::closure@250 | 250 | 17 | 19 | PASS |
| HomeworkService.generateRecurrenceDates | 929 | 17 | 19 | PASS |
| HomeworkService.bulkCreate::closure@894 | 894 | 14 | 16 | PASS |

### apps/worker/src/processors/early-warning/signal-collection.utils.ts

Signal collection utilities contain the highest-complexity functions in the entire codebase; each collector aggregates data across multiple domains with extensive conditional logic.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| collectEngagementSignals | 1030 | 63 | 65 | PASS |
| collectWellbeingSignals | 819 | 32 | 34 | PASS |
| collectGradesSignals | 397 | 31 | 33 | PASS |

### apps/worker/src/cron/cron-scheduler.service.ts

Cron scheduler is low-complexity per method but extremely long; line budget is the primary control to prevent unbounded growth as new cron jobs are added.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| CronSchedulerService.onModuleInit | 74 | 1 | 3 | PASS |

### apps/worker/src/processors/communications/dispatch-notifications.processor.ts

Notification dispatch handles multi-channel routing (email, SMS, WhatsApp, push) with per-channel formatting and error handling branching.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| DispatchNotificationsJob.dispatchEmail | 352 | 10 | 12 | PASS |
| DispatchNotificationsJob.dispatchAll | 301 | 8 | 10 | PASS |
| DispatchNotificationsJob.dispatchWhatsApp | 425 | 8 | 10 | PASS |

### apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx

SEN plan detail page is the largest frontend file with a monolithic component handling view, edit, review, and approval states in a single render function.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| SupportPlanDetailPage | 115 | 18 | 20 | PASS |
| SupportPlanDetailPage::closure@533 | 533 | 11 | 13 | PASS |

### apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx

Appeal detail page has extreme render-function complexity with status-dependent UI sections, decision forms, and timeline rendering.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| AppealDetailPage | 215 | 43 | 45 | PASS |
| handleDecide | 316 | 8 | 10 | PASS |

### apps/web/src/app/[locale]/(school)/settings/behaviour-admin/page.tsx

Behaviour admin settings page contains multiple tab components (operations, scope audit, retention) each with their own form handling and state.

| Function | Line | Current complexity | Budget | Status |
|----------|------|--------------------|--------|--------|
| BehaviourAdminPage | 100 | 6 | 8 | PASS |
| ScopeAuditTab | 553 | 6 | 8 | PASS |

## File Line Budgets

| File | Current lines | Budget | Utilisation | Status |
|------|---------------|--------|-------------|--------|
| apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts | 1162 | 1211 | 96% | PASS |
| apps/api/src/modules/households/households.service.ts | 1123 | 1173 | 96% | PASS |
| apps/api/src/modules/homework/homework-analytics.service.ts | 1089 | 1139 | 96% | PASS |
| apps/api/src/modules/behaviour/behaviour-sanctions.service.ts | 1079 | 1129 | 96% | PASS |
| apps/api/src/modules/behaviour/safeguarding-concerns.service.ts | 1071 | 1120 | 96% | PASS |
| apps/api/src/modules/pastoral/services/pastoral-dsar.service.ts | 1056 | 1106 | 95% | PASS |
| apps/api/src/modules/attendance/attendance-upload.service.ts | 1041 | 1091 | 95% | PASS |
| apps/api/src/modules/behaviour/behaviour.service.ts | 1012 | 1062 | 95% | PASS |
| apps/api/src/modules/behaviour/behaviour-appeals.service.ts | 988 | 1038 | 95% | PASS |
| apps/api/src/modules/homework/homework.service.ts | 986 | 1036 | 95% | PASS |
| apps/worker/src/processors/early-warning/signal-collection.utils.ts | 1332 | 1382 | 96% | PASS |
| apps/worker/src/cron/cron-scheduler.service.ts | 742 | 792 | 94% | PASS |
| apps/worker/src/processors/communications/dispatch-notifications.processor.ts | 728 | 778 | 94% | PASS |
| apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx | 961 | 1011 | 95% | PASS |
| apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx | 939 | 989 | 95% | PASS |
| apps/web/src/app/[locale]/(school)/settings/behaviour-admin/page.tsx | 938 | 988 | 95% | PASS |

## Needs Attention

Files above 80% of their line budget:

- **apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts**: 1162/1211 lines (96%) — Workload compute service mixes personal, aggregate, and trend logic across 1161 lines
- **apps/api/src/modules/households/households.service.ts**: 1123/1173 lines (96%) — Household CRUD with merge/split orchestration across 1123 lines
- **apps/api/src/modules/homework/homework-analytics.service.ts**: 1089/1139 lines (96%) — Homework analytics with trend/correlation/pattern queries across 1089 lines
- **apps/api/src/modules/behaviour/behaviour-sanctions.service.ts**: 1079/1129 lines (96%) — Sanction lifecycle with approval routing and conflict detection across 1079 lines
- **apps/api/src/modules/behaviour/safeguarding-concerns.service.ts**: 1071/1120 lines (96%) — Safeguarding concern triage and access-controlled detail mapping across 1070 lines
- **apps/api/src/modules/pastoral/services/pastoral-dsar.service.ts**: 1056/1106 lines (95%) — DSAR processing with multi-entity record aggregation across 1056 lines
- **apps/api/src/modules/attendance/attendance-upload.service.ts**: 1041/1091 lines (95%) — Bulk attendance upload with CSV/XLSX parsing and validation across 1041 lines
- **apps/api/src/modules/behaviour/behaviour.service.ts**: 1012/1062 lines (95%) — Core behaviour incident service with the highest single-function complexity across 1012 lines
- **apps/api/src/modules/behaviour/behaviour-appeals.service.ts**: 988/1038 lines (95%) — Appeal lifecycle with decision branching and sanction reversal across 988 lines
- **apps/api/src/modules/homework/homework.service.ts**: 986/1036 lines (95%) — Homework CRUD with recurrence generation and bulk operations across 986 lines
- **apps/worker/src/processors/early-warning/signal-collection.utils.ts**: 1332/1382 lines (96%) — Signal collection utilities with the highest complexity functions in the codebase across 1332 lines
- **apps/worker/src/cron/cron-scheduler.service.ts**: 742/792 lines (94%) — Cron scheduler grows as new jobs are added; line budget prevents unbounded expansion from 742 lines
- **apps/worker/src/processors/communications/dispatch-notifications.processor.ts**: 728/778 lines (94%) — Multi-channel notification dispatch with per-channel formatting across 728 lines
- **apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx**: 961/1011 lines (95%) — Largest frontend file; monolithic SEN plan detail component across 961 lines
- **apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx**: 939/989 lines (95%) — Appeal detail page with status-dependent UI and decision forms across 939 lines
- **apps/web/src/app/[locale]/(school)/settings/behaviour-admin/page.tsx**: 938/988 lines (95%) — Multi-tab behaviour admin settings page across 938 lines

