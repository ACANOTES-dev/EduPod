# Hotspot Metrics

Generated: 2026-04-01

Tracked maintainability hotspots and their current cyclomatic complexity budgets. The CI check fails if any monitored function exceeds its budget, and this report should be refreshed after each maintainability wave.

## Wave History

| Wave   | Date       | Summary                                                                                                    |
| ------ | ---------- | ---------------------------------------------------------------------------------------------------------- |
| Wave 1 | 2026-04-01 | Maintainability audit baseline after Phase D service decomposition and shared frontend pattern extraction. |

## Budgeted Hotspots

### apps/api/src/modules/pastoral/services/concern.service.ts

Pastoral concern lifecycle and sharing remain one of the highest-risk maintainability hotspots because the service coordinates access control, state changes, and cross-entity relationship writes.

| Function               | Line | Current complexity | Budget | Status |
| ---------------------- | ---- | ------------------ | ------ | ------ |
| ConcernService.list    | 278  | 15                 | 15     | PASS   |
| ConcernService.getById | 379  | 10                 | 10     | PASS   |

### apps/api/src/modules/behaviour/behaviour-students.service.ts

Behaviour student views still aggregate history, summary, and parent-facing information across several tables, so new logic should stay bounded as the module evolves.

| Function                                   | Line | Current complexity | Budget | Status |
| ------------------------------------------ | ---- | ------------------ | ------ | ------ |
| BehaviourStudentsService.listStudents      | 34   | 6                  | 6      | PASS   |
| BehaviourStudentsService.getStudentProfile | 124  | 2                  | 2      | PASS   |

### apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts

Workload calculations mix personal, aggregate, and trend concerns; budgets help keep future additions inside the extracted helpers rather than back in the facade.

| Function                                                         | Line | Current complexity | Budget | Status |
| ---------------------------------------------------------------- | ---- | ------------------ | ------ | ------ |
| WorkloadComputeService.getAggregateTimetableQuality::closure@617 | 617  | 12                 | 12     | PASS   |
| WorkloadComputeService.getAggregateWorkloadSummary::closure@459  | 459  | 10                 | 10     | PASS   |

### apps/api/src/modules/gradebook/report-cards/report-cards.service.ts

Report cards remain a high-change module with lifecycle orchestration, approval flow, and query responsibilities that can regress into a god service without guardrails.

| Function                   | Line | Current complexity | Budget | Status |
| -------------------------- | ---- | ------------------ | ------ | ------ |
| ReportCardsService.publish | 223  | 3                  | 12     | PASS   |
| ReportCardsService.update  | 156  | 5                  | 10     | PASS   |
