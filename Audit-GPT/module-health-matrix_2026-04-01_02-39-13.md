# Module Health Matrix

Audit timestamp: `2026-04-01_02-39-13`

Legend:

- Risk level: `Low` / `Medium` / `High`
- Test health: `Strong` / `Moderate` / `Weak` / `Very weak`
- Architecture health: `Strong` / `Moderate` / `Weak`
- Refactor priority: `Now` / `Next` / `Later`

| Module                                | Purpose                                                             | Risk level | Test health | Architecture health | Security / reliability concern                                                                               | Refactor priority |
| ------------------------------------- | ------------------------------------------------------------------- | ---------- | ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------- |
| Auth                                  | Login, sessions, MFA, password reset, tenant switching              | Medium     | Strong      | Moderate            | MFA secret stored plaintext; password reset delivery unfinished                                              | Next              |
| RBAC / Control Plane                  | Memberships, roles, permissions, tenant resolution                  | High       | Moderate    | Moderate            | Control-plane reads occur outside tenant-bound RLS transactions                                              | Now               |
| Finance                               | Invoices, payments, allocations, refunds, receipts                  | High       | Moderate    | Moderate            | Transaction-heavy invariants under-covered in default lane; approval handoff split across writes             | Now               |
| Approvals                             | Approval workflows and callback coordination                        | High       | Moderate    | Moderate            | Approval request creation is non-atomic with entity state transition; no one-open-request guard              | Now               |
| Scheduling                            | Timetables, substitutions, schedule runs                            | High       | Strong      | Moderate            | Good unit/e2e coverage, but default backend lane does not execute its e2e suite                              | Next              |
| Attendance                            | Attendance marking and related side effects                         | Medium     | Moderate    | Moderate            | Silent background-side-effect catch weakens diagnosability                                                   | Next              |
| Behaviour                             | Discipline, sanctions, interventions, parent-facing behaviour views | High       | Moderate    | Weak                | Largest module; direct foreign-table reads; sparse worker coverage in behaviour processors                   | Now               |
| Pastoral                              | Concerns, interventions, safeguarding-adjacent workflows            | High       | Moderate    | Weak                | `forwardRef` cycle with child protection; queue-chain fragility; very large concern service                  | Now               |
| Gradebook                             | Assessments, report cards, academic summaries                       | High       | Moderate    | Weak                | Cross-module reads are heavy; gradebook risk-detection worker lacks direct processor spec                    | Next              |
| Payroll                               | Payroll runs, finalisation, payslips                                | High       | Weak        | Moderate            | Approval callback path exists, but payroll worker coverage is absent in sampled processor-spec mapping       | Now               |
| Staff Wellbeing                       | Workload analytics and wellbeing metrics                            | Medium     | Moderate    | Weak                | `WorkloadComputeService` centralizes many analytics responsibilities in one file                             | Next              |
| GDPR                                  | Consent, DPA guard, privacy workflows                               | High       | Moderate    | Moderate            | Global DPA guard increases blast radius; service reads across many subject tables                            | Next              |
| Communications / Notifications Worker | Outbound notifications and dispatch orchestration                   | High       | Weak        | Weak                | Duplicate dispatch window, unscheduled failed-retry path, external sends inside DB transaction               | Now               |
| Frontend Shell and Critical Pages     | Route access, navigation, large school-facing pages                 | High       | Weak        | Weak                | Browser coverage is mostly visual smoke testing; mirrored unit tests drift from production logic; i18n drift | Now               |
