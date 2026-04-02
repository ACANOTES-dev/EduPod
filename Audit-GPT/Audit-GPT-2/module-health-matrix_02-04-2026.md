# Module Health Matrix — 02-04-2026

| Module | Purpose | Risk level | Test health | Architecture health | Security / reliability concern | Refactor priority |
| --- | --- | --- | --- | --- | --- | --- |
| `auth` | Login, sessions, MFA, tenant switching, permission bootstrap | High | Strong unit coverage, but concentrated in one hotspot | Poor | `AuthService` is a 1,128-line god service; login throttling is email-only | Now |
| `finance` | Invoices, payments, allocations, receipts | High | Mixed; weak on transaction-critical money paths | Mixed | `confirmAllocations()` uses row locks, raw SQL, rebalance, and receipt side effects with thin tests; overdue state drift exists in worker | Now |
| `approvals` | Shared approval workflow for finance, payroll, announcements, and more | Critical | Mixed; no evidence of concurrency protection tests | Mixed | Approve/reject/cancel are non-atomic; callback status can remain failed after successful domain mutation | Now |
| `behaviour` | Incidents, sanctions, appeals, notifications, safeguarding-adjacent flows | High | Mixed | Poor | Largest API module; direct foreign-table reads; duplicated sensitive projection logic | Next |
| `pastoral` | Cases, meetings, referrals, reports, child-protection adjacency | High | Mixed | Poor | Large module with forward references; `PastoralReportService` is a report factory hotspot | Next |
| `gradebook` | Assessments, analytics, grading snapshots | High | Unknown to mixed | Poor | High cross-module coupling through direct Prisma reads of foreign tables | Next |
| `attendance` | Attendance sessions, reporting, orchestration | Medium | Better than hotspot modules | Better | Healthier decomposition, but school-closures test drift shows harness fragility nearby | Later |
| `reports` | Cross-module analytics and reporting reads | Medium | Mixed | Mixed to improving | `ReportsDataAccessService` is a good seam, but its `unknown` returns weaken type safety | Later |
| `worker/communications` | Notification dispatch, retries, fallback chains | High | Mixed-red | Mixed | Retry scan exists but is not scheduled; helper suites are red; failure handling is only partially asserted | Now |
| `worker/compliance` | DSAR export, erasure, anonymisation | High | Red | Mixed | Spec is syntactically broken and contains no executable tests for an irreversible flow | Now |
| `worker/security` | Cross-tenant key rotation for encrypted secrets | High | Absent for key rotation | Mixed | `key-rotation.processor.ts` is the only untested processor and operates across tenants on one-way-risk data | Now |
| `ops/health/deploy` | CI, deploy, health checks, rollback, observability | High | N/A | Mixed | Build and deploy scaffolding are real strengths, but schema rollback is manual, worker health is narrow, and frontend Sentry is outdated | Next |

## Notes

- Risk level combines business criticality with observed defect/change risk.
- Test health reflects observed trustworthiness, not raw test counts.
- Architecture health reflects cohesion, boundary cleanliness, and blast radius.
- Refactor priority is the recommended order for dedicated engineering attention, not a statement that every module must be rewritten.
