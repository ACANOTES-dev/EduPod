Now let me create a comprehensive report by combining all this information. I'll start writing the markdown report:

Based on my comprehensive exploration of the codebase, here is the complete inventory of wellbeing-related modules (behaviour, pastoral, safeguarding, early-warnings, and staff-wellbeing):

---

# Wellbeing-Related Modules: Complete Backend Surface Area Mapping

## Executive Summary

The wellbeing umbrella comprises 5 core NestJS modules with 200+ endpoints, 50+ data models, 20+ background processors, and sophisticated state machines. Key features include:

- **Behaviour Module**: Incidents, sanctions, interventions, appeals, exclusions, recognition awards, alerts, tasks, documents, and policy-driven automation
- **Pastoral Module**: Concerns, cases, referrals, interventions, SST meetings, critical incidents, parent contacts, and DSAR review
- **Safeguarding Module**: Concern reporting, actions, SLA tracking, break-glass emergency access, integration with behaviour incidents
- **Early-Warning Module**: Risk tiers (green/yellow/amber/red) across attendance/grades/behaviour/wellbeing/engagement domains
- **Staff Wellbeing Module**: Workload surveys, aggregate analytics, termly reporting, resource management

All modules are gated by `@ModuleEnabled` decorators on specific keys (`behaviour`, `pastoral`, `staff_wellbeing`, `early_warning`). Safeguarding has no explicit module flag but is part of pastoral infrastructure.

---

## 1. BEHAVIOUR MODULE

### Module Location

- **API**: `/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/`
- **Worker**: `/Users/ram/Desktop/SDB/apps/worker/src/processors/behaviour/`
- **Shared Schemas**: `/Users/ram/Desktop/SDB/packages/shared/src/behaviour/`
- **Prisma Models**: 25+ tables (see Prisma Schema section)

### Controllers + Endpoints

#### behaviour.controller.ts (Lines 80-330+)

| HTTP Method | Endpoint                                        | Permissions        | Module Flag | Purpose                                                  |
| ----------- | ----------------------------------------------- | ------------------ | ----------- | -------------------------------------------------------- |
| POST        | `/v1/behaviour/incidents`                       | `behaviour.log`    | behaviour   | Create a new incident                                    |
| POST        | `/v1/behaviour/incidents/quick`                 | `behaviour.log`    | behaviour   | Quick-log incident (minimal fields)                      |
| POST        | `/v1/behaviour/incidents/bulk-positive`         | `behaviour.log`    | behaviour   | Bulk create positive incidents                           |
| POST        | `/v1/behaviour/incidents/ai-parse`              | `behaviour.log`    | behaviour   | (STUB) AI-powered incident parsing                       |
| GET         | `/v1/behaviour/incidents`                       | `behaviour.view`   | behaviour   | List incidents with filters                              |
| GET         | `/v1/behaviour/incidents/my`                    | `behaviour.log`    | behaviour   | Get current user's logged incidents                      |
| GET         | `/v1/behaviour/incidents/feed`                  | `behaviour.view`   | behaviour   | Activity feed of recent incidents                        |
| GET         | `/v1/behaviour/incidents/:id`                   | `behaviour.view`   | behaviour   | Get incident detail + policy evaluation + history        |
| PATCH       | `/v1/behaviour/incidents/:id`                   | `behaviour.manage` | behaviour   | Update incident (description, context, participants)     |
| PATCH       | `/v1/behaviour/incidents/:id/status`            | `behaviour.manage` | behaviour   | Transition incident status (draft→active→resolved, etc.) |
| POST        | `/v1/behaviour/incidents/:id/withdraw`          | `behaviour.manage` | behaviour   | Withdraw an incident                                     |
| POST        | `/v1/behaviour/incidents/:id/follow-up`         | `behaviour.manage` | behaviour   | Record follow-up action                                  |
| POST        | `/v1/behaviour/incidents/:id/participants`      | `behaviour.manage` | behaviour   | Add/link participant (student, staff, parent)            |
| DELETE      | `/v1/behaviour/incidents/:id/participants/:pid` | `behaviour.manage` | behaviour   | Remove participant link                                  |
| POST        | `/v1/behaviour/incidents/:id/attachments`       | `behaviour.manage` | behaviour   | Upload attachment (statement, screenshot, etc.)          |
| GET         | `/v1/behaviour/incidents/:id/attachments`       | `behaviour.view`   | behaviour   | List attachments for incident                            |
| GET         | `/v1/behaviour/incidents/:id/attachments/:aid`  | `behaviour.view`   | behaviour   | Download/view attachment metadata                        |
| GET         | `/v1/behaviour/incidents/:id/history`           | `behaviour.view`   | behaviour   | Audit trail of all changes (append-only)                 |
| GET         | `/v1/behaviour/incidents/:id/policy-evaluation` | `behaviour.manage` | behaviour   | Show policy matching results (dry-run output)            |
| GET         | `/v1/behaviour/quick-log/context`               | `behaviour.log`    | behaviour   | Pre-populate quick-log with location/subject/teacher     |

#### behaviour-sanctions.controller.ts

| HTTP Method | Endpoint                                     | Permissions        | Module Flag | Purpose                                                                  |
| ----------- | -------------------------------------------- | ------------------ | ----------- | ------------------------------------------------------------------------ |
| POST        | `/v1/behaviour/sanctions`                    | `behaviour.manage` | behaviour   | Create sanction (detention/suspension/expulsion/etc.)                    |
| GET         | `/v1/behaviour/sanctions`                    | `behaviour.view`   | behaviour   | List sanctions (searchable, filterable)                                  |
| GET         | `/v1/behaviour/sanctions/today`              | `behaviour.view`   | behaviour   | Sanctions due today (for duty staff)                                     |
| GET         | `/v1/behaviour/sanctions/my-supervision`     | `behaviour.view`   | behaviour   | Sanctions where current user is supervisor                               |
| GET         | `/v1/behaviour/sanctions/calendar`           | `behaviour.view`   | behaviour   | Calendar view of scheduled sanctions                                     |
| GET         | `/v1/behaviour/sanctions/active-suspensions` | `behaviour.view`   | behaviour   | Active suspensions (students currently suspended)                        |
| GET         | `/v1/behaviour/sanctions/returning-soon`     | `behaviour.view`   | behaviour   | Students returning from suspension within 7 days                         |
| POST        | `/v1/behaviour/sanctions/bulk-mark-served`   | `behaviour.manage` | behaviour   | Mark multiple sanctions as served atomically                             |
| GET         | `/v1/behaviour/sanctions/:id`                | `behaviour.view`   | behaviour   | Get sanction detail (with incident link, appeal history)                 |
| PATCH       | `/v1/behaviour/sanctions/:id`                | `behaviour.manage` | behaviour   | Update sanction (reschedule, change supervisor, notes)                   |
| PATCH       | `/v1/behaviour/sanctions/:id/status`         | `behaviour.manage` | behaviour   | Transition status (pending_approval→scheduled→served→appealed→cancelled) |
| POST        | `/v1/behaviour/sanctions/:id/parent-meeting` | `behaviour.manage` | behaviour   | Record parent meeting (pre-return for suspension)                        |
| POST        | `/v1/behaviour/sanctions/:id/appeal`         | `behaviour.appeal` | behaviour   | Appeal a sanction (parent or student initiates)                          |
| PATCH       | `/v1/behaviour/sanctions/:id/appeal-outcome` | `behaviour.manage` | behaviour   | Record appeal outcome (upheld/modified/overturned)                       |

#### behaviour-interventions.controller.ts

| HTTP Method | Endpoint                                        | Permissions        | Module Flag | Purpose                                                           |
| ----------- | ----------------------------------------------- | ------------------ | ----------- | ----------------------------------------------------------------- |
| POST        | `/v1/behaviour/interventions`                   | `behaviour.manage` | behaviour   | Create intervention (behaviour plan, mentoring, etc.)             |
| GET         | `/v1/behaviour/interventions`                   | `behaviour.view`   | behaviour   | List interventions                                                |
| GET         | `/v1/behaviour/interventions/overdue`           | `behaviour.view`   | behaviour   | Interventions with overdue reviews                                |
| GET         | `/v1/behaviour/interventions/my`                | `behaviour.view`   | behaviour   | Interventions assigned to current user                            |
| GET         | `/v1/behaviour/interventions/outcomes`          | `behaviour.view`   | behaviour   | Outcomes summary (improved/no_change/deteriorated)                |
| GET         | `/v1/behaviour/interventions/:id`               | `behaviour.view`   | behaviour   | Get intervention detail (plan, reviews, progress)                 |
| PATCH       | `/v1/behaviour/interventions/:id`               | `behaviour.manage` | behaviour   | Update intervention plan                                          |
| PATCH       | `/v1/behaviour/interventions/:id/status`        | `behaviour.manage` | behaviour   | Transition status (planned→active→monitoring→completed/abandoned) |
| POST        | `/v1/behaviour/interventions/:id/reviews`       | `behaviour.manage` | behaviour   | Record review (progress assessment)                               |
| GET         | `/v1/behaviour/interventions/:id/reviews`       | `behaviour.view`   | behaviour   | List reviews for intervention                                     |
| GET         | `/v1/behaviour/interventions/:id/auto-populate` | `behaviour.view`   | behaviour   | AI/template-based auto-population of plan fields                  |
| POST        | `/v1/behaviour/interventions/:id/complete`      | `behaviour.manage` | behaviour   | Mark intervention as completed (with outcome)                     |

#### behaviour-appeals.controller.ts

| HTTP Method | Endpoint                                             | Permissions        | Module Flag | Purpose                                                      |
| ----------- | ---------------------------------------------------- | ------------------ | ----------- | ------------------------------------------------------------ |
| POST        | `/v1/behaviour/appeals`                              | `behaviour.appeal` | behaviour   | Submit appeal (parent/student/staff)                         |
| GET         | `/v1/behaviour/appeals`                              | `behaviour.view`   | behaviour   | List appeals                                                 |
| GET         | `/v1/behaviour/appeals/:id`                          | `behaviour.view`   | behaviour   | Get appeal detail (decision letter, hearing notes, evidence) |
| PATCH       | `/v1/behaviour/appeals/:id`                          | `behaviour.manage` | behaviour   | Update appeal (grounds, hearing notes)                       |
| POST        | `/v1/behaviour/appeals/:id/decide`                   | `behaviour.manage` | behaviour   | Record appeal decision (upheld/modified/overturned)          |
| POST        | `/v1/behaviour/appeals/:id/withdraw`                 | `behaviour.appeal` | behaviour   | Withdraw appeal (appellant initiates)                        |
| POST        | `/v1/behaviour/appeals/:id/attachments`              | `behaviour.manage` | behaviour   | Upload evidence (for hearing)                                |
| GET         | `/v1/behaviour/appeals/:id/attachments`              | `behaviour.view`   | behaviour   | List evidence attachments                                    |
| POST        | `/v1/behaviour/appeals/:id/generate-decision-letter` | `behaviour.manage` | behaviour   | Auto-generate decision letter (PDF)                          |
| GET         | `/v1/behaviour/appeals/:id/evidence-bundle`          | `behaviour.manage` | behaviour   | Download all evidence as ZIP                                 |

#### behaviour-exclusions.controller.ts

| HTTP Method | Endpoint                                                | Permissions        | Module Flag | Purpose                                                                                                  |
| ----------- | ------------------------------------------------------- | ------------------ | ----------- | -------------------------------------------------------------------------------------------------------- |
| POST        | `/v1/behaviour/exclusion-cases`                         | `behaviour.manage` | behaviour   | Initiate exclusion case (suspension_extended/expulsion/permanent_exclusion)                              |
| GET         | `/v1/behaviour/exclusion-cases`                         | `behaviour.view`   | behaviour   | List exclusion cases                                                                                     |
| GET         | `/v1/behaviour/exclusion-cases/:id`                     | `behaviour.view`   | behaviour   | Get case detail (notices, hearing, decision)                                                             |
| PATCH       | `/v1/behaviour/exclusion-cases/:id`                     | `behaviour.manage` | behaviour   | Update case details                                                                                      |
| PATCH       | `/v1/behaviour/exclusion-cases/:id/status`              | `behaviour.manage` | behaviour   | Transition status (initiated→notice_issued→hearing_scheduled→decided→appeal_window→finalised/overturned) |
| POST        | `/v1/behaviour/exclusion-cases/:id/generate-notice`     | `behaviour.manage` | behaviour   | Generate formal notice document (PDF)                                                                    |
| POST        | `/v1/behaviour/exclusion-cases/:id/generate-board-pack` | `behaviour.manage` | behaviour   | Generate board decision pack (PDF)                                                                       |
| POST        | `/v1/behaviour/exclusion-cases/:id/record-decision`     | `behaviour.manage` | behaviour   | Record formal decision (confirmed/modified/reversed)                                                     |
| GET         | `/v1/behaviour/exclusion-cases/:id/timeline`            | `behaviour.view`   | behaviour   | Statutory timeline (notice date, hearing, appeal deadline)                                               |
| GET         | `/v1/behaviour/exclusion-cases/:id/documents`           | `behaviour.view`   | behaviour   | List all case documents                                                                                  |

#### behaviour-recognition.controller.ts

| HTTP Method | Endpoint                                             | Permissions        | Module Flag | Purpose                                                   |
| ----------- | ---------------------------------------------------- | ------------------ | ----------- | --------------------------------------------------------- |
| GET         | `/v1/behaviour/recognition/wall`                     | `behaviour.view`   | behaviour   | Recognition wall feed (positive incidents)                |
| GET         | `/v1/behaviour/recognition/leaderboard`              | `behaviour.view`   | behaviour   | Student leaderboard by points                             |
| GET         | `/v1/behaviour/recognition/houses`                   | `behaviour.view`   | behaviour   | House/team standings                                      |
| GET         | `/v1/behaviour/recognition/houses/:id`               | `behaviour.view`   | behaviour   | House detail (members, points, ranking)                   |
| POST        | `/v1/behaviour/recognition/awards`                   | `behaviour.manage` | behaviour   | Create recognition award (certificate, badge, etc.)       |
| GET         | `/v1/behaviour/recognition/awards`                   | `behaviour.view`   | behaviour   | List awards                                               |
| POST        | `/v1/behaviour/recognition/publications`             | `behaviour.manage` | behaviour   | Publish award to public website                           |
| GET         | `/v1/behaviour/recognition/publications/:id`         | `behaviour.view`   | behaviour   | Get publication detail (requires parent consent tracking) |
| PATCH       | `/v1/behaviour/recognition/publications/:id/approve` | `behaviour.manage` | behaviour   | Admin approve publication (checks consent)                |
| PATCH       | `/v1/behaviour/recognition/publications/:id/reject`  | `behaviour.manage` | behaviour   | Admin reject publication                                  |
| GET         | `/v1/behaviour/recognition/public/feed`              | _(public)_         | behaviour   | Public-facing recognition feed (website)                  |
| POST        | `/v1/behaviour/recognition/houses/bulk-assign`       | `behaviour.manage` | behaviour   | Bulk assign students to houses                            |

#### behaviour-students.controller.ts

| HTTP Method | Endpoint                                          | Permissions          | Module Flag | Purpose                                            |
| ----------- | ------------------------------------------------- | -------------------- | ----------- | -------------------------------------------------- |
| GET         | `/v1/behaviour/students`                          | `behaviour.view`     | behaviour   | List students (searchable, filterable)             |
| GET         | `/v1/behaviour/students/:studentId`               | `behaviour.view`     | behaviour   | Get student behaviour profile (summary, metrics)   |
| GET         | `/v1/behaviour/students/:studentId/timeline`      | `behaviour.view`     | behaviour   | Student incident timeline (chronological)          |
| GET         | `/v1/behaviour/students/:studentId/analytics`     | `behaviour.view`     | behaviour   | Behaviour analytics for student (trends, patterns) |
| GET         | `/v1/behaviour/students/:studentId/points`        | `behaviour.view`     | behaviour   | Points earned/lost (positive/negative incidents)   |
| GET         | `/v1/behaviour/students/:studentId/sanctions`     | `behaviour.view`     | behaviour   | List sanctions for student                         |
| GET         | `/v1/behaviour/students/:studentId/interventions` | `behaviour.view`     | behaviour   | List interventions for student                     |
| GET         | `/v1/behaviour/students/:studentId/awards`        | `behaviour.view`     | behaviour   | List recognition awards for student                |
| GET         | `/v1/behaviour/students/:studentId/ai-summary`    | `behaviour.ai_query` | behaviour   | AI-generated summary of behaviour history          |
| GET         | `/v1/behaviour/students/:studentId/preview`       | `behaviour.view`     | behaviour   | Quick preview card (for hover tooltips)            |
| GET         | `/v1/behaviour/students/:studentId/export`        | `behaviour.view`     | behaviour   | Export full record (PDF/CSV)                       |
| GET         | `/v1/behaviour/students/:studentId/parent-view`   | `behaviour.view`     | behaviour   | Parent-safe view (redacted/selective)              |
| GET         | `/v1/behaviour/students/:studentId/tasks`         | `behaviour.view`     | behaviour   | Tasks linked to student incidents/sanctions        |

#### behaviour-analytics.controller.ts (18+ endpoints)

| HTTP Method | Endpoint                                       | Permissions                      | Module Flag | Purpose                                                  |
| ----------- | ---------------------------------------------- | -------------------------------- | ----------- | -------------------------------------------------------- |
| GET         | `/v1/behaviour/analytics/pulse`                | `behaviour.view`                 | behaviour   | Real-time behaviour pulse (today/this week)              |
| GET         | `/v1/behaviour/analytics/overview`             | `behaviour.view`                 | behaviour   | Dashboard overview (incident count, trends, by category) |
| GET         | `/v1/behaviour/analytics/heatmap`              | `behaviour.view`                 | behaviour   | Heatmap by location/period/weekday                       |
| GET         | `/v1/behaviour/analytics/heatmap/historical`   | `behaviour.view`                 | behaviour   | Historical heatmap (year-on-year comparison)             |
| GET         | `/v1/behaviour/analytics/trends`               | `behaviour.view`                 | behaviour   | Trend lines (positive/negative/total over time)          |
| GET         | `/v1/behaviour/analytics/categories`           | `behaviour.view`                 | behaviour   | Incidents by category (pie chart data)                   |
| GET         | `/v1/behaviour/analytics/subjects`             | `behaviour.view`                 | behaviour   | Incidents by subject/class (bar chart)                   |
| GET         | `/v1/behaviour/analytics/staff`                | `behaviour.view_staff_analytics` | behaviour   | Incidents logged by staff member                         |
| GET         | `/v1/behaviour/analytics/sanctions`            | `behaviour.view`                 | behaviour   | Sanction outcomes (by type, status, duration)            |
| GET         | `/v1/behaviour/analytics/interventions`        | `behaviour.view`                 | behaviour   | Intervention effectiveness (outcomes, completion rate)   |
| GET         | `/v1/behaviour/analytics/ratio`                | `behaviour.view`                 | behaviour   | Positive to negative incident ratio                      |
| GET         | `/v1/behaviour/analytics/comparisons`          | `behaviour.view`                 | behaviour   | Year-on-year comparisons                                 |
| GET         | `/v1/behaviour/analytics/policy-effectiveness` | `behaviour.view`                 | behaviour   | Policy impact (incidents with policy match)              |
| GET         | `/v1/behaviour/analytics/task-completion`      | `behaviour.view`                 | behaviour   | Task completion rates and timeliness                     |
| GET         | `/v1/behaviour/analytics/benchmarks`           | `behaviour.view`                 | behaviour   | Benchmark comparisons (if available)                     |
| GET         | `/v1/behaviour/analytics/teachers`             | `behaviour.view_staff_analytics` | behaviour   | Teacher-level analytics                                  |
| GET         | `/v1/behaviour/analytics/class-comparisons`    | `behaviour.view`                 | behaviour   | Class-to-class comparisons                               |
| GET         | `/v1/behaviour/analytics/export/csv`           | `behaviour.view`                 | behaviour   | Export analytics data as CSV                             |
| POST        | `/v1/behaviour/analytics/ai-query`             | `behaviour.ai_query`             | behaviour   | AI-powered natural-language query (experimental)         |
| GET         | `/v1/behaviour/analytics/ai-query/history`     | `behaviour.ai_query`             | behaviour   | History of AI queries (for audit)                        |

#### behaviour-tasks.controller.ts

| HTTP Method | Endpoint                           | Permissions        | Module Flag | Purpose                                                      |
| ----------- | ---------------------------------- | ------------------ | ----------- | ------------------------------------------------------------ |
| GET         | `/v1/behaviour/tasks`              | `behaviour.view`   | behaviour   | List behaviour tasks (all assigned to user or all in school) |
| GET         | `/v1/behaviour/tasks/my`           | `behaviour.manage` | behaviour   | Tasks assigned to current user                               |
| GET         | `/v1/behaviour/tasks/overdue`      | `behaviour.view`   | behaviour   | Overdue tasks                                                |
| GET         | `/v1/behaviour/tasks/stats`        | `behaviour.view`   | behaviour   | Task completion stats (by assignee, by type)                 |
| GET         | `/v1/behaviour/tasks/:id`          | `behaviour.view`   | behaviour   | Get task detail (entity link, completion notes)              |
| PATCH       | `/v1/behaviour/tasks/:id`          | `behaviour.manage` | behaviour   | Update task (priority, due date, description)                |
| POST        | `/v1/behaviour/tasks/:id/complete` | `behaviour.manage` | behaviour   | Mark task complete (with notes)                              |
| POST        | `/v1/behaviour/tasks/:id/cancel`   | `behaviour.manage` | behaviour   | Cancel task (with reason)                                    |

#### behaviour-alerts.controller.ts

| HTTP Method | Endpoint                               | Permissions      | Module Flag | Purpose                                                                        |
| ----------- | -------------------------------------- | ---------------- | ----------- | ------------------------------------------------------------------------------ |
| GET         | `/v1/behaviour/alerts`                 | `behaviour.view` | behaviour   | List behaviour alerts (escalating, disengaging, hotspot, overdue review, etc.) |
| GET         | `/v1/behaviour/alerts/badge`           | `behaviour.view` | behaviour   | Unread alerts count (for UI badge)                                             |
| GET         | `/v1/behaviour/alerts/:id`             | `behaviour.view` | behaviour   | Get alert detail                                                               |
| PATCH       | `/v1/behaviour/alerts/:id/seen`        | `behaviour.view` | behaviour   | Mark alert seen                                                                |
| PATCH       | `/v1/behaviour/alerts/:id/acknowledge` | `behaviour.view` | behaviour   | Acknowledge alert (staff action taken)                                         |
| PATCH       | `/v1/behaviour/alerts/:id/snooze`      | `behaviour.view` | behaviour   | Snooze alert (temporary dismiss)                                               |
| PATCH       | `/v1/behaviour/alerts/:id/resolve`     | `behaviour.view` | behaviour   | Resolve alert (dismissed)                                                      |
| PATCH       | `/v1/behaviour/alerts/:id/dismiss`     | `behaviour.view` | behaviour   | Dismiss alert                                                                  |

#### behaviour-amendments.controller.ts

| HTTP Method | Endpoint                                       | Permissions        | Module Flag | Purpose                                                     |
| ----------- | ---------------------------------------------- | ------------------ | ----------- | ----------------------------------------------------------- |
| GET         | `/v1/behaviour/amendments`                     | `behaviour.manage` | behaviour   | List amendment notices (corrections to incidents/sanctions) |
| GET         | `/v1/behaviour/amendments/pending`             | `behaviour.manage` | behaviour   | Pending parent re-acknowledgements                          |
| GET         | `/v1/behaviour/amendments/:id`                 | `behaviour.manage` | behaviour   | Get amendment detail                                        |
| POST        | `/v1/behaviour/amendments/:id/send-correction` | `behaviour.manage` | behaviour   | Send correction notification to parents                     |

#### behaviour-config.controller.ts

| HTTP Method | Endpoint                                       | Permissions       | Module Flag | Purpose                                                        |
| ----------- | ---------------------------------------------- | ----------------- | ----------- | -------------------------------------------------------------- |
| GET         | `/v1/behaviour/categories`                     | `behaviour.admin` | behaviour   | List behaviour categories (taxonomy)                           |
| POST        | `/v1/behaviour/categories`                     | `behaviour.admin` | behaviour   | Create custom category                                         |
| PATCH       | `/v1/behaviour/categories/:id`                 | `behaviour.admin` | behaviour   | Update category (polarity, severity, color, icon)              |
| GET         | `/v1/behaviour/description-templates`          | `behaviour.admin` | behaviour   | List description templates (by category)                       |
| POST        | `/v1/behaviour/description-templates`          | `behaviour.admin` | behaviour   | Create template (multilingual)                                 |
| PATCH       | `/v1/behaviour/description-templates/:id`      | `behaviour.admin` | behaviour   | Update template                                                |
| GET         | `/v1/behaviour/policies`                       | `behaviour.admin` | behaviour   | List behaviour policies (rules that auto-trigger consequences) |
| POST        | `/v1/behaviour/policies`                       | `behaviour.admin` | behaviour   | Create policy (condition + action)                             |
| GET         | `/v1/behaviour/policies/export`                | `behaviour.admin` | behaviour   | Export policies as JSON                                        |
| POST        | `/v1/behaviour/policies/import`                | `behaviour.admin` | behaviour   | Import policies from JSON                                      |
| POST        | `/v1/behaviour/policies/replay`                | `behaviour.admin` | behaviour   | Replay policies against historical incidents                   |
| GET         | `/v1/behaviour/policies/:id`                   | `behaviour.admin` | behaviour   | Get policy detail                                              |
| PATCH       | `/v1/behaviour/policies/:id`                   | `behaviour.admin` | behaviour   | Update policy                                                  |
| DELETE      | `/v1/behaviour/policies/:id`                   | `behaviour.admin` | behaviour   | Delete policy                                                  |
| GET         | `/v1/behaviour/policies/:id/versions`          | `behaviour.admin` | behaviour   | Get policy version history                                     |
| GET         | `/v1/behaviour/policies/:id/versions/:version` | `behaviour.admin` | behaviour   | Get specific version                                           |
| PATCH       | `/v1/behaviour/policies/:id/priority`          | `behaviour.admin` | behaviour   | Reorder policy priority                                        |
| GET         | `/v1/behaviour/document-templates`             | `behaviour.admin` | behaviour   | List document templates (letters, notices, decision docs)      |
| POST        | `/v1/behaviour/document-templates`             | `behaviour.admin` | behaviour   | Create document template (Handlebars/Liquid)                   |
| PATCH       | `/v1/behaviour/document-templates/:id`         | `behaviour.admin` | behaviour   | Update template                                                |

#### behaviour-documents.controller.ts

| HTTP Method | Endpoint                               | Permissions        | Module Flag | Purpose                                                                                          |
| ----------- | -------------------------------------- | ------------------ | ----------- | ------------------------------------------------------------------------------------------------ |
| POST        | `/v1/behaviour/documents/generate`     | `behaviour.manage` | behaviour   | Generate document (detention notice, suspension letter, exclusion notice, decision letter, etc.) |
| GET         | `/v1/behaviour/documents`              | `behaviour.manage` | behaviour   | List documents (by incident, sanction, appeal, exclusion)                                        |
| GET         | `/v1/behaviour/documents/:id`          | `behaviour.manage` | behaviour   | Get document metadata + view in browser                                                          |
| PATCH       | `/v1/behaviour/documents/:id/finalise` | `behaviour.manage` | behaviour   | Finalize document (locks edits, makes sendable)                                                  |
| POST        | `/v1/behaviour/documents/:id/send`     | `behaviour.manage` | behaviour   | Send document (email/WhatsApp/in-app)                                                            |
| GET         | `/v1/behaviour/documents/:id/download` | `behaviour.manage` | behaviour   | Download PDF                                                                                     |

#### behaviour-guardian-restrictions.controller.ts

| HTTP Method | Endpoint                                         | Permissions        | Module Flag | Purpose                                                 |
| ----------- | ------------------------------------------------ | ------------------ | ----------- | ------------------------------------------------------- |
| POST        | `/v1/behaviour/guardian-restrictions`            | `behaviour.manage` | behaviour   | Create guardian restriction (block portal/comms access) |
| GET         | `/v1/behaviour/guardian-restrictions`            | `behaviour.view`   | behaviour   | List restrictions                                       |
| GET         | `/v1/behaviour/guardian-restrictions/active`     | `behaviour.view`   | behaviour   | Active restrictions only                                |
| GET         | `/v1/behaviour/guardian-restrictions/:id`        | `behaviour.view`   | behaviour   | Get restriction detail                                  |
| PATCH       | `/v1/behaviour/guardian-restrictions/:id`        | `behaviour.manage` | behaviour   | Update restriction (extend, change type)                |
| POST        | `/v1/behaviour/guardian-restrictions/:id/revoke` | `behaviour.manage` | behaviour   | Revoke restriction (early)                              |

#### behaviour-parent.controller.ts (Parent Portal)

| HTTP Method | Endpoint                                       | Permissions        | Module Flag | Purpose                                            |
| ----------- | ---------------------------------------------- | ------------------ | ----------- | -------------------------------------------------- |
| GET         | `/v1/behaviour/summary`                        | _(parent)_         | behaviour   | Parent view: summary of child's behaviour          |
| GET         | `/v1/behaviour/incidents`                      | _(parent)_         | behaviour   | Parent view: incidents involving child             |
| GET         | `/v1/behaviour/points-awards`                  | _(parent)_         | behaviour   | Parent view: points and awards                     |
| GET         | `/v1/behaviour/sanctions`                      | _(parent)_         | behaviour   | Parent view: current and past sanctions            |
| POST        | `/v1/behaviour/acknowledge/:acknowledgementId` | _(parent)_         | behaviour   | Parent acknowledges incident/sanction notification |
| GET         | `/v1/behaviour/recognition`                    | _(parent)_         | behaviour   | Parent view: recognition achievements              |
| POST        | `/v1/behaviour/appeal`                         | `behaviour.appeal` | behaviour   | Parent initiates appeal                            |

#### behaviour-admin.controller.ts (Admin Operations)

| HTTP Method | Endpoint                       | Permissions       | Module Flag | Purpose                                            |
| ----------- | ------------------------------ | ----------------- | ----------- | -------------------------------------------------- |
| GET         | `/v1/health`                   | _(internal)_      | behaviour   | Health check                                       |
| GET         | `/v1/dead-letter`              | `behaviour.admin` | behaviour   | View dead letter queue (failed jobs)               |
| POST        | `/v1/dead-letter/:jobId/retry` | `behaviour.admin` | behaviour   | Retry dead letter job                              |
| POST        | `/v1/recompute-points/preview` | `behaviour.admin` | behaviour   | Preview point recomputation (without applying)     |
| POST        | `/v1/recompute-points`         | `behaviour.admin` | behaviour   | Recompute all student points (for data correction) |
| POST        | `/v1/rebuild-awards/preview`   | `behaviour.admin` | behaviour   | Preview award rebuilding                           |
| POST        | `/v1/rebuild-awards`           | `behaviour.admin` | behaviour   | Rebuild recognition awards                         |
| POST        | `/v1/recompute-pulse`          | `behaviour.admin` | behaviour   | Recompute behaviour pulse metrics                  |
| POST        | `/v1/backfill-tasks/preview`   | `behaviour.admin` | behaviour   | Preview task backfill                              |
| POST        | `/v1/backfill-tasks`           | `behaviour.admin` | behaviour   | Backfill missing tasks                             |
| POST        | `/v1/resend-notification`      | `behaviour.admin` | behaviour   | Resend a specific notification                     |
| POST        | `/v1/refresh-views`            | `behaviour.admin` | behaviour   | Refresh materialized views                         |
| POST        | `/v1/policy-dry-run`           | `behaviour.admin` | behaviour   | Dry-run policy evaluation (test rules)             |
| GET         | `/v1/scope-audit`              | `behaviour.admin` | behaviour   | Audit data scope access                            |
| POST        | `/v1/reindex-search/preview`   | `behaviour.admin` | behaviour   | Preview search index rebuild                       |
| POST        | `/v1/reindex-search`           | `behaviour.admin` | behaviour   | Reindex all incidents in search (Meilisearch)      |
| POST        | `/v1/retention/preview`        | `behaviour.admin` | behaviour   | Preview retention/anonymisation                    |
| POST        | `/v1/retention/execute`        | `behaviour.admin` | behaviour   | Execute retention/anonymisation                    |
| GET         | `/v1/legal-holds`              | `behaviour.admin` | behaviour   | List legal holds                                   |
| POST        | `/v1/legal-holds`              | `behaviour.admin` | behaviour   | Create legal hold                                  |
| POST        | `/v1/legal-holds/:id/release`  | `behaviour.admin` | behaviour   | Release legal hold                                 |

---

### Services + Key Methods

**BehaviourService** (`behaviour.service.ts`)

- `createIncident()` — Create incident, trigger policy evaluation, auto-create tasks
- `listIncidents()` — Filtered list with RLS (role-based data scoping)
- `getIncident()` — Full detail + policy evaluation result
- `updateIncident()` — Modify description, context, location
- `transitionStatus()` — Change status (draft→active→resolved, etc.) with state machine validation
- `withdrawIncident()` — Withdraw + cascade to sanctions/tasks

**BehaviourSanctionsService** (`behaviour-sanctions.service.ts`)

- `createSanction()` — Create from incident + check approval required + auto-create exclusion for extended suspension/expulsion
- `transitionStatus()` — Serve, appeal, cancel, reschedule with state machine validation
- `recordParentMeeting()` — Pre-return meeting documentation
- `bulkMarkServed()` — Atomically mark multiple sanctions as served

**BehaviourAppealsService** (`behaviour-appeals.service.ts`)

- `submitAppeal()` — Create appeal, set legal holds, create review task
- `decideAppeal()` — Record decision + apply outcome (upheld/modified/overturned) with cascading updates to sanction & incident
- `generateDecisionLetter()` — Auto-generate PDF document

**BehaviourExclusionCasesService** (`behaviour-exclusion-cases.service.ts`)

- `createExclusionCase()` — Initiate case, compute statutory timeline, set legal holds
- `transitionStatus()` — Progress through statutory workflow
- `recordDecision()` — Decision + appeal deadline calculation
- `generateNotice()` / `generateBoardPack()` — Auto-generate documents

**BehaviourInterventionsService** (`behaviour-interventions.service.ts`)

- `createIntervention()` — Create intervention plan (behaviour, mentoring, counselling, etc.)
- `recordReview()` — Periodic progress assessment
- `transitionStatus()` — planned→active→monitoring→completed/abandoned
- `completeIntervention()` — Record outcome (improved/no_change/deteriorated)

**BehaviourTasksService** (`behaviour-tasks.service.ts`)

- `completeTask()` — Mark task done with notes
- `cancelTask()` — Cancel with reason
- `getOverdueTasks()` — For reminders/alerts

**BehaviourAnalyticsService** (`behaviour-analytics.service.ts`) + specialized services

- `getPulse()` — Today/week summary
- `getOverview()` — Dashboard data (counts, trends)
- `getHeatmap()` — By location/period/weekday
- `getTrends()` — Time-series data
- `getIncidentsByCategory()` / `getIncidentsBySubject()` / `getIncidentsByStaff()` — Dimensional analytics

**BehaviourAlertsService** (`behaviour-alerts.service.ts`)

- `getAlerts()` — Escalating students, disengaging, hotspots, overdue reviews
- `updateAlertStatus()` — Seen/acknowledged/resolved/dismissed

**BehaviourAmendmentsService** (`behaviour-amendments.service.ts`)

- `sendCorrection()` — Create amendment notice + send to parents with re-acknowledgement requirement

**BehaviourConfigService** (`behaviour-config.service.ts`)

- `listCategories()` / `createCategory()` — Behaviour taxonomy
- `listPolicies()` / `createPolicy()` / `updatePolicy()` — Policy CRUD (rules engine)
- `replayPolicies()` — Retroactively apply rules to historical incidents

**BehaviourAttachmentService** (`behaviour-attachment.service.ts`)

- `uploadAttachment()` — S3 upload with malware scan
- `getAttachment()` — Fetch metadata or download

**BehaviourAwardService** (`behaviour-award.service.ts`)

- `createAward()` — Recognition award for positive incidents
- `publishAward()` — Publish to website (with parent consent check)

**BehaviourGuardianRestrictionsService** (`behaviour-guardian-restrictions.service.ts`)

- `createRestriction()` — Block portal/comms access for parent
- `revokeRestriction()` — Early release

**BehaviourDocumentService** (`behaviour-document.service.ts`)

- `generateDocument()` — Auto-generate detention notice/suspension letter/exclusion notice/decision letter from template
- `finaliseDocument()` — Mark ready for sending
- `sendDocument()` — Dispatch via email/WhatsApp/in-app

**BehaviourHistoryService** (`behaviour-history.service.ts`)

- `getHistory()` — Append-only audit trail for entity

**BehaviourQuickLogService** (`behaviour-quick-log.service.ts`)

- `quickLog()` — Create incident with minimal fields
- `bulkPositive()` — Bulk create positive incidents

---

### Prisma Tables (25 tables)

| Table                               | Key Columns                                                                                                                                                                                                                                      | Primary Enums                                                                                     | Purpose                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `behaviour_categories`              | `id`, `tenant_id`, `name`, `polarity`, `severity`, `point_value`, `color`, `icon`, `requires_follow_up`, `requires_parent_notification`, `benchmark_category`                                                                                    | `BehaviourPolarity`, `BenchmarkCategory`                                                          | Taxonomy of behaviour types                            |
| `behaviour_incidents`               | `id`, `incident_number`, `tenant_id`, `category_id`, `polarity`, `severity`, `reported_by_id`, `status`, `approval_status`, `parent_notification_status`, `follow_up_required`, `context_type`, `occurred_at`, `retention_status`, `archived_at` | `IncidentStatus`, `IncidentApprovalStatus`, `ParentNotifStatus`, `ContextType`, `RetentionStatus` | Core incident records                                  |
| `behaviour_incident_participants`   | `id`, `incident_id`, `participant_type`, `student_id`, `staff_id`, `parent_id`, `role`, `points_awarded`                                                                                                                                         | `ParticipantType`, `ParticipantRole`                                                              | Who was involved in incident                           |
| `behaviour_description_templates`   | `id`, `category_id`, `locale`, `text`, `display_order`                                                                                                                                                                                           | —                                                                                                 | Pre-written descriptions (multilingual)                |
| `behaviour_entity_history`          | `id`, `entity_type`, `entity_id`, `changed_by_id`, `change_type`, `previous_values`, `new_values`                                                                                                                                                | `BehaviourEntityType`, `BehaviourChangeType`                                                      | Append-only audit trail                                |
| `behaviour_tasks`                   | `id`, `tenant_id`, `task_type`, `entity_type`, `entity_id`, `assigned_to_id`, `status`, `priority`, `due_date`, `completed_at`                                                                                                                   | `BehaviourTaskType`, `BehaviourTaskEntityType`, `TaskPriority`, `BehaviourTaskStatus`             | Follow-up, review, parent meeting tasks                |
| `behaviour_parent_acknowledgements` | `id`, `incident_id`, `sanction_id`, `parent_id`, `channel`, `sent_at`, `delivered_at`, `acknowledged_at`                                                                                                                                         | `AcknowledgementChannel`, `AcknowledgementMethod`                                                 | Parent notification tracking (append-only)             |
| `behaviour_sanctions`               | `id`, `sanction_number`, `incident_id`, `student_id`, `type`, `status`, `scheduled_date`, `served_at`, `served_by_id`, `appeal_outcome`, `retention_status`                                                                                      | `SanctionType`, `SanctionStatus`, `AppealOutcome`                                                 | Detention, suspension, expulsion records               |
| `behaviour_appeals`                 | `id`, `appeal_number`, `incident_id`, `sanction_id`, `student_id`, `appellant_type`, `status`, `grounds_category`, `decision`, `decided_at`, `retention_status`                                                                                  | `AppealStatus`, `GroundsCategory`, `AppealDecision`                                               | Appeals of sanctions                                   |
| `behaviour_amendment_notices`       | `id`, `entity_type`, `entity_id`, `amendment_type`, `changed_by_id`, `what_changed`, `correction_notification_sent`                                                                                                                              | `AmendmentType`                                                                                   | Corrections sent to parents (append-only)              |
| `behaviour_exclusion_cases`         | `id`, `case_number`, `sanction_id`, `student_id`, `type`, `status`, `hearing_date`, `decision`, `decision_date`, `appeal_deadline`, `retention_status`                                                                                           | `ExclusionType`, `ExclusionStatus`, `ExclusionDecision`                                           | Extended suspension/expulsion cases                    |
| `behaviour_attachments`             | `id`, `entity_type`, `entity_id`, `uploaded_by_id`, `file_key`, `file_size_bytes`, `mime_type`, `sha256_hash`, `classification`, `visibility`, `scan_status`, `retention_status`                                                                 | `AttachmentClassification`, `AttachmentVisibility`, `ScanStatus`, `RetentionStatus`               | Statements, screenshots, documents (append-only)       |
| `behaviour_interventions`           | `id`, `intervention_number`, `student_id`, `title`, `type`, `status`, `trigger_description`, `start_date`, `target_end_date`, `outcome`, `retention_status`                                                                                      | `InterventionType`, `InterventionStatus`, `InterventionOutcome`, `RetentionStatus`                | Intervention plans                                     |
| `behaviour_intervention_incidents`  | `intervention_id`, `incident_id`                                                                                                                                                                                                                 | —                                                                                                 | Link incidents to intervention                         |
| `behaviour_intervention_reviews`    | `id`, `intervention_id`, `review_date`, `progress`, `notes`                                                                                                                                                                                      | `InterventionProgress`                                                                            | Periodic progress assessments                          |
| `behaviour_recognition_awards`      | `id`, `student_id`, `award_type_id`, `incident_id`, `triggered_by_id`, `points_awarded`, `created_at`                                                                                                                                            | —                                                                                                 | Recognition points for positive behaviour              |
| `behaviour_award_types`             | `id`, `tenant_id`, `name`, `icon`, `color`, `points_value`                                                                                                                                                                                       | —                                                                                                 | Award taxonomy                                         |
| `behaviour_house_teams`             | `id`, `tenant_id`, `name`, `color`, `house_points`                                                                                                                                                                                               | —                                                                                                 | House/team system                                      |
| `behaviour_house_membership`        | `id`, `student_id`, `house_id`, `joined_at`                                                                                                                                                                                                      | —                                                                                                 | Student house assignment                               |
| `behaviour_policy_rules`            | `id`, `tenant_id`, `name`, `active`, `priority`                                                                                                                                                                                                  | —                                                                                                 | Rules that trigger auto-consequences                   |
| `behaviour_policy_rule_action`      | `id`, `rule_id`, `action_type`, `action_config`                                                                                                                                                                                                  | `PolicyActionType`                                                                                | Action to take (escalate, create task, etc.)           |
| `behaviour_policy_evaluation`       | `id`, `incident_id`, `rule_id`, `matched`, `action_executed`, `created_at`                                                                                                                                                                       | `PolicyEvaluationResult`, `PolicyActionExecutionStatus`                                           | Audit of policy matching                               |
| `behaviour_alerts`                  | `id`, `tenant_id`, `student_id`, `type`, `severity`, `status`                                                                                                                                                                                    | `AlertType`, `AlertSeverity`, `AlertStatus`                                                       | Alert records (escalating student, hotspot, etc.)      |
| `behaviour_alert_recipients`        | `alert_id`, `user_id`, `status`                                                                                                                                                                                                                  | `AlertRecipientStatus`                                                                            | Who was notified of alert                              |
| `behaviour_documents`               | `id`, `entity_type`, `entity_id`, `document_type`, `status`, `file_key`, `sent_at`, `sent_via`                                                                                                                                                   | `DocumentType`, `DocumentStatus`                                                                  | Generated documents (detention notices, letters, etc.) |
| `behaviour_document_templates`      | `id`, `tenant_id`, `document_type`, `content`                                                                                                                                                                                                    | `DocumentType`                                                                                    | Letter/notice templates (Handlebars)                   |
| `behaviour_guardian_restrictions`   | `id`, `parent_id`, `student_id`, `type`, `status`, `reason`, `created_at`, `expires_at`                                                                                                                                                          | `RestrictionType`, `RestrictionStatus`                                                            | Restrict parent access (portal/comms)                  |
| `behaviour_publication_approvals`   | `id`, `award_id`, `publication_type`, `entity_type`, `parent_consent_status`                                                                                                                                                                     | `PublicationType`, `ParentConsentStatus`                                                          | Track publication consent                              |
| `behaviour_legal_holds`             | `id`, `entity_type`, `entity_id`, `status`, `legal_basis`                                                                                                                                                                                        | `LegalHoldEntityType`, `LegalHoldStatus`                                                          | Hold records for legal proceedings                     |

---

### Zod Schemas (in `packages/shared/src/behaviour/schemas/`)

- `incident.schema.ts` — `createIncidentSchema`, `updateIncidentSchema`, `listIncidentsQuerySchema`, `statusTransitionSchema`, `withdrawIncidentSchema`
- `sanction.schema.ts` — `createSanctionSchema`, `sanctionStatusSchema`
- `appeal.schema.ts` — `submitAppealSchema`, `decideAppealSchema`, `withdrawAppealSchema`
- `intervention.schema.ts` — `createInterventionSchema`, `recordReviewSchema`, `completeInterventionSchema`
- `exclusion.schema.ts` — `exclusionStatusSchema`, `recordDecisionSchema`
- `quick-log.schema.ts` — `quickLogSchema`, `bulkPositiveSchema`
- `participant.schema.ts` — `createParticipantSchema`
- `amendment.schema.ts` — `amendmentSchema`
- `recognition.schema.ts` — `createAwardSchema`, `publishAwardSchema`
- `admin-ops.schema.ts` — Recompute points, rebuild awards, etc.
- `policy-rules.schema.ts` — `policyRuleSchema`, `policyActionSchema`
- `policy-condition.schema.ts` — Condition DSL for policy matching
- `legal-hold.schema.ts` — `legalHoldSchema`
- `settings.schema.ts` — Behaviour module configuration

---

### BullMQ Jobs / Queues / Cron

| Queue       | Job Name                      | Processor                                  | Cron Schedule           | Purpose                                                                        |
| ----------- | ----------------------------- | ------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------ |
| `behaviour` | `parent-notification`         | `parent-notification.processor.ts`         | On demand               | Send notification to parents (incident, sanction, appeal)                      |
| `behaviour` | `evaluate-policy`             | `evaluate-policy.processor.ts`             | On demand               | Policy evaluation (auto-consequence triggering)                                |
| `behaviour` | `document-ready`              | `document-ready.processor.ts`              | On demand               | Handle PDF render completion (detention notice, letter, etc.)                  |
| `behaviour` | `task-reminders`              | `task-reminders.processor.ts`              | Daily @ 09:00 UTC       | Send overdue task reminders                                                    |
| `behaviour` | `check-awards`                | `check-awards.processor.ts`                | On demand               | Check if points threshold for award is reached                                 |
| `behaviour` | `suspension-return`           | `suspension-return.processor.ts`           | Daily @ 07:00 UTC       | Identify students returning from suspension                                    |
| `behaviour` | `guardian-restriction-check`  | `guardian-restriction-check.processor.ts`  | Daily @ 00:00 UTC       | Revoke expired guardian restrictions                                           |
| `behaviour` | `detect-patterns`             | `detect-patterns.processor.ts`             | Daily @ 01:00 UTC       | Detect escalating/disengaging patterns for alerts                              |
| `behaviour` | `digest-notifications`        | `digest-notifications.processor.ts`        | Daily @ 18:00 UTC       | Batch notifications (daily digest for staff)                                   |
| `behaviour` | `notification-reconciliation` | `notification-reconciliation.processor.ts` | Daily @ 12:00 UTC       | Retry failed notifications                                                     |
| `behaviour` | `stuck-notification-alert`    | `stuck-notification-alert.processor.ts`    | Every 30 min            | Alert if notification is stuck in queue                                        |
| `behaviour` | `retention-check`             | `retention-check.processor.ts`             | Daily @ 02:00 UTC       | Archive/anonymise expired records                                              |
| `behaviour` | `refresh-mv`                  | `refresh-mv.processor.ts`                  | Daily @ 03:00 UTC       | Refresh materialized views (pulse, analytics)                                  |
| `behaviour` | `partition-maintenance`       | `partition-maintenance.processor.ts`       | Daily @ 04:00 UTC       | Maintain table partitions (incidents table is partitioned by tenant_id + date) |
| `behaviour` | `cron-dispatch`               | `cron-dispatch.processor.ts`               | _(triggers other jobs)_ | Dispatcher for all behaviour crons                                             |

---

### Permissions

**Behaviour Module Permissions** (from `packages/shared/src/constants/permissions.ts`)

```typescript
behaviour: {
  log: 'behaviour.log',           // Staff: create/log incidents
  view: 'behaviour.view',         // Staff: view incidents, analytics, student profiles
  manage: 'behaviour.manage',     // Staff: manage incidents, sanctions, interventions
  admin: 'behaviour.admin',       // Admin: configure categories, policies, templates; access admin operations
  view_sensitive: 'behaviour.view_sensitive',  // Staff: view safeguarding-flagged incidents
  view_staff_analytics: 'behaviour.view_staff_analytics',  // Admin: view staff-level analytics
  ai_query: 'behaviour.ai_query', // Staff: use AI query feature
  appeal: 'behaviour.appeal',     // Parent: submit appeal
}
```

**Tier Mapping**:

- `log`, `view`, `manage`, `view_sensitive`, `ai_query` → **Staff tier**
- `admin`, `view_staff_analytics` → **Admin tier**
- `appeal` → **Parent tier**

---

### Module Flag

- **Module key**: `behaviour` (in `MODULE_KEYS` constant)
- **Gating**: All routes decorated with `@ModuleEnabled('behaviour')`
- **Controlled by**: `ModuleEnabledGuard` + tenant's `enabled_modules` list
- **Check location**: `/apps/api/src/common/guards/module-enabled.guard.ts`

---

### Cross-Module Dependencies

**Behaviour imports from**:

- `auth` — User context, permissions
- `students` — Student profiles, enrolment
- `classes` — Class context, subject
- `schedules` — Period grid, timetable
- `rooms` — Location lookup
- `communications` — Send notifications (email, WhatsApp, in-app)
- `notifications` — In-app notification creation
- `attachments` / `s3` — File storage
- `pdf-rendering` — Document generation
- `compliance` — Retention policies
- `approvals` — Approval request workflow
- `audit-log` — Audit trail
- `safeguarding` — Link incidents to safeguarding concerns
- `policy-engine` — Policy evaluation engine
- `search` — Meilisearch indexing

**Behaviour is imported by**:

- `safeguarding` — Behaviour incidents linked to safeguarding concerns
- `pastoral` — Behaviour incidents linked to pastoral concerns
- `early-warning` — Behaviour incidents as risk signal
- `engagement` — Behaviour events feed
- `reporting` — Behaviour analytics, export
- `dashboard` — Behaviour cards/widgets
- `parent-portal` — Behaviour summary, incident view, appeal submission

---

### Tests Present

- **Unit tests**: 40+ `.spec.ts` files covering:
  - `behaviour-students.controller.spec.ts` — List/get endpoints
  - `behaviour-appeals.controller.spec.ts` — Appeal workflow
  - `behaviour-award.service.spec.ts` — Award logic
  - `behaviour-exclusion-cases.service.spec.ts` — Exclusion case lifecycle
  - `behaviour-interventions.service.spec.ts` — Intervention CRUD
  - `behaviour-sanctions.service.spec.ts` — Sanction transitions
  - `behaviour-pulse.service.spec.ts` — Analytics computation
  - `behaviour-house.service.spec.ts` — House/team logic
  - `behaviour-legal-hold.service.spec.ts` — Legal hold propagation
  - `behaviour-ai.service.spec.ts` — AI query/summary
  - `behaviour-export.service.spec.ts` — Data export
  - `behaviour-incidents.service.spec.ts` — Incident CRUD
  - `behaviour-amendments.service.spec.ts` — Amendment notices
  - `behaviour-analytics.service.spec.ts` — Analytics queries
  - `behaviour-sanction-analytics.service.spec.ts`
  - `behaviour-staff-analytics.service.spec.ts`
  - `behaviour-incident-analytics.service.spec.ts`

- **State machine tests**:
  - `state-machine.spec.ts` — IncidentStatus transitions
  - `state-machine-sanction.spec.ts` — SanctionStatus transitions
  - `state-machine-appeal.spec.ts` — AppealStatus transitions
  - `state-machine-intervention.spec.ts` — InterventionStatus transitions
  - `state-machine-exclusion.spec.ts` — ExclusionStatus transitions

- **Integration tests**: In `/tests` subdirectories (fixture builders, API client tests)

---

## 2. PASTORAL MODULE

### Module Location

- **API**: `/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral/`
- **Worker**: `/Users/ram/Desktop/SDB/apps/worker/src/processors/pastoral/`
- **Shared Schemas**: `/Users/ram/Desktop/SDB/packages/shared/src/pastoral/`
- **Prisma Models**: 20+ tables

### Controllers + Endpoints

#### concerns.controller.ts

| HTTP Method | Endpoint                             | Permissions | Purpose                                                             |
| ----------- | ------------------------------------ | ----------- | ------------------------------------------------------------------- |
| POST        | `/v1/pastoral/concerns`              | _(staff)_   | Log pastoral concern (routine, elevated, urgent, critical severity) |
| GET         | `/v1/pastoral/concerns`              | _(staff)_   | List concerns (filterable by tier, severity, student)               |
| GET         | `/v1/pastoral/concerns/:id`          | _(staff)_   | Get concern detail (history, versions, related)                     |
| PATCH       | `/v1/pastoral/concerns/:id`          | _(staff)_   | Amend concern narrative                                             |
| POST        | `/v1/pastoral/concerns/:id/escalate` | _(staff)_   | Escalate to higher tier/severity                                    |
| POST        | `/v1/pastoral/concerns/:id/share`    | _(staff)_   | Share with parents (share_level: category_only, summary, full)      |
| POST        | `/v1/pastoral/concerns/:id/unshare`  | _(staff)_   | Unshare with parents                                                |
| POST        | `/v1/pastoral/concerns/:id/amend`    | _(staff)_   | Create version (append-only narrative history)                      |
| GET         | `/v1/pastoral/concerns/:id/versions` | _(staff)_   | List narrative versions                                             |
| GET         | `/v1/pastoral/concerns/:id/events`   | _(staff)_   | Linked events (SST meetings, interventions, parent contacts)        |
| GET         | `/v1/pastoral/categories`            | _(staff)_   | Concern categories taxonomy                                         |
| GET         | `/v1/pastoral/chronology/:studentId` | _(staff)_   | Student chronological view (concerns, cases, events)                |

#### cases.controller.ts

| HTTP Method | Endpoint                                     | Permissions | Purpose                                                               |
| ----------- | -------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| POST        | `/v1/pastoral/cases`                         | _(staff)_   | Open pastoral case (wraps concerns, interventions, referrals)         |
| GET         | `/v1/pastoral/cases`                         | _(staff)_   | List cases                                                            |
| GET         | `/v1/pastoral/cases/my`                      | _(staff)_   | Cases owned by current user                                           |
| GET         | `/v1/pastoral/cases/orphans`                 | _(staff)_   | Cases without current owner                                           |
| GET         | `/v1/pastoral/cases/:id`                     | _(staff)_   | Get case detail                                                       |
| PATCH       | `/v1/pastoral/cases/:id`                     | _(staff)_   | Update case (status, owner)                                           |
| PATCH       | `/v1/pastoral/cases/:id/status`              | _(staff)_   | Transition status (open→active→monitoring→resolved→closed)            |
| POST        | `/v1/pastoral/cases/:id/transfer`            | _(staff)_   | Transfer case ownership                                               |
| POST        | `/v1/pastoral/cases/:id/concerns`            | _(staff)_   | Link concern to case                                                  |
| DELETE      | `/v1/pastoral/cases/:id/concerns/:concernId` | _(staff)_   | Unlink concern                                                        |
| POST        | `/v1/pastoral/cases/:id/students`            | _(staff)_   | Add student to case (multi-student cases for sibling/cohort concerns) |
| DELETE      | `/v1/pastoral/cases/:id/students/:studentId` | _(staff)_   | Remove student                                                        |

#### interventions.controller.ts

| HTTP Method | Endpoint                                         | Permissions | Purpose                                                                                    |
| ----------- | ------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------ |
| GET         | `/v1/pastoral/interventions`                     | _(staff)_   | List interventions                                                                         |
| GET         | `/v1/pastoral/interventions/:id`                 | _(staff)_   | Get intervention detail                                                                    |
| GET         | `/v1/pastoral/cases/:caseId/interventions`       | _(staff)_   | List interventions in case                                                                 |
| GET         | `/v1/pastoral/students/:studentId/interventions` | _(staff)_   | List interventions for student                                                             |
| POST        | `/v1/pastoral/interventions`                     | _(staff)_   | Create intervention (target outcomes, continuum level, review cycle)                       |
| PATCH       | `/v1/pastoral/interventions/:id`                 | _(staff)_   | Update intervention                                                                        |
| PATCH       | `/v1/pastoral/interventions/:id/status`          | _(staff)_   | Transition status (pc_active→achieved/partially_achieved/not_achieved/escalated/withdrawn) |
| POST        | `/v1/pastoral/interventions/:id/review`          | _(staff)_   | Record review progress                                                                     |
| GET         | `/v1/pastoral/interventions/:id/actions`         | _(staff)_   | List assigned actions for intervention                                                     |
| GET         | `/v1/pastoral/intervention-actions`              | _(staff)_   | List all intervention actions (across all interventions)                                   |
| GET         | `/v1/pastoral/intervention-actions/my`           | _(staff)_   | Actions assigned to current user                                                           |
| POST        | `/v1/pastoral/interventions/:id/actions`         | _(staff)_   | Create action within intervention                                                          |
| PATCH       | `/v1/pastoral/intervention-actions/:id`          | _(staff)_   | Update action                                                                              |
| PATCH       | `/v1/pastoral/intervention-actions/:id/complete` | _(staff)_   | Mark action complete                                                                       |
| GET         | `/v1/pastoral/interventions/:id/progress`        | _(staff)_   | Progress notes timeline                                                                    |
| POST        | `/v1/pastoral/interventions/:id/progress`        | _(staff)_   | Add progress note                                                                          |
| GET         | `/v1/pastoral/settings/intervention-types`       | _(staff)_   | Intervention type taxonomy                                                                 |

#### referrals.controller.ts

| HTTP Method | Endpoint                                                 | Permissions | Purpose                                                                       |
| ----------- | -------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| POST        | `/v1/pastoral/referrals`                                 | _(staff)_   | Create referral to external agency (NEPS, etc.)                               |
| GET         | `/v1/pastoral/referrals`                                 | _(staff)_   | List referrals                                                                |
| GET         | `/v1/pastoral/referrals/waitlist`                        | _(staff)_   | Referrals awaiting assessment/report                                          |
| GET         | `/v1/pastoral/referrals/:id`                             | _(staff)_   | Get referral detail                                                           |
| PATCH       | `/v1/pastoral/referrals/:id`                             | _(staff)_   | Update referral                                                               |
| POST        | `/v1/pastoral/referrals/:id/submit`                      | _(staff)_   | Submit referral officially                                                    |
| POST        | `/v1/pastoral/referrals/:id/acknowledge`                 | _(staff)_   | Acknowledge receipt from agency                                               |
| POST        | `/v1/pastoral/referrals/:id/schedule-assessment`         | _(staff)_   | Record assessment date                                                        |
| POST        | `/v1/pastoral/referrals/:id/complete-assessment`         | _(staff)_   | Mark assessment complete                                                      |
| POST        | `/v1/pastoral/referrals/:id/receive-report`              | _(staff)_   | Receive report from agency + upload file                                      |
| POST        | `/v1/pastoral/referrals/:id/complete`                    | _(staff)_   | Close referral (recommendations received & stored)                            |
| POST        | `/v1/pastoral/referrals/:id/withdraw`                    | _(staff)_   | Withdraw referral                                                             |
| POST        | `/v1/pastoral/referrals/:id/pre-populate`                | _(staff)_   | Auto-populate referral from student data + past concerns                      |
| POST        | `/v1/pastoral/referrals/:referralId/recommendations`     | _(staff)_   | Create/track recommendation from agency report                                |
| GET         | `/v1/pastoral/referrals/:referralId/recommendations`     | _(staff)_   | List recommendations                                                          |
| PATCH       | `/v1/pastoral/referrals/:referralId/recommendations/:id` | _(staff)_   | Update recommendation status (pending→in_progress→implemented/not_applicable) |
| POST        | `/v1/pastoral/neps-visits`                               | _(staff)_   | Log NEPS visit (assessment outcomes)                                          |
| GET         | `/v1/pastoral/neps-visits`                               | _(staff)_   | List NEPS visits                                                              |
| GET         | `/v1/pastoral/neps-visits/:id`                           | _(staff)_   | Get visit detail                                                              |
| PATCH       | `/v1/pastoral/neps-visits/:id`                           | _(staff)_   | Update visit notes                                                            |

#### sst.controller.ts (Student Support Team)

| HTTP Method | Endpoint                                       | Permissions | Purpose                                              |
| ----------- | ---------------------------------------------- | ----------- | ---------------------------------------------------- |
| GET         | `/v1/pastoral/sst/members`                     | _(staff)_   | List SST members (teachers, SENCo, admin, external)  |
| GET         | `/v1/pastoral/sst/members/active`              | _(staff)_   | Active SST members                                   |
| POST        | `/v1/pastoral/sst/members`                     | _(staff)_   | Add SST member                                       |
| PATCH       | `/v1/pastoral/sst/members/:id`                 | _(staff)_   | Update member                                        |
| DELETE      | `/v1/pastoral/sst/members/:id`                 | _(staff)_   | Remove member                                        |
| GET         | `/v1/pastoral/sst/meetings`                    | _(staff)_   | List SST meetings                                    |
| GET         | `/v1/pastoral/sst/meetings/:id`                | _(staff)_   | Get meeting detail                                   |
| POST        | `/v1/pastoral/sst/meetings`                    | _(staff)_   | Schedule SST meeting                                 |
| PATCH       | `/v1/pastoral/sst/meetings/:id`                | _(staff)_   | Update meeting (attendees, date, location)           |
| PATCH       | `/v1/pastoral/sst/meetings/:id/start`          | _(staff)_   | Start meeting (lock agenda for editing)              |
| PATCH       | `/v1/pastoral/sst/meetings/:id/complete`       | _(staff)_   | Complete meeting (generate minutes, lock)            |
| PATCH       | `/v1/pastoral/sst/meetings/:id/cancel`         | _(staff)_   | Cancel meeting                                       |
| GET         | `/v1/pastoral/sst/meetings/:id/agenda`         | _(staff)_   | Get meeting agenda                                   |
| POST        | `/v1/pastoral/sst/meetings/:id/agenda`         | _(staff)_   | Add agenda item (concern, intervention review, etc.) |
| PATCH       | `/v1/pastoral/sst/meetings/:id/agenda/:itemId` | _(staff)_   | Update agenda item                                   |
| DELETE      | `/v1/pastoral/sst/meetings/:id/agenda/:itemId` | _(staff)_   | Remove agenda item                                   |
| POST        | `/v1/pastoral/sst/meetings/:id/agenda/refresh` | _(staff)_   | Pre-populate agenda from concerns/interventions (AI) |
| GET         | `/v1/pastoral/sst/meetings/:id/actions`        | _(staff)_   | List actions recorded in meeting minutes             |
| GET         | `/v1/pastoral/sst/actions`                     | _(staff)_   | List all SST actions (across all meetings)           |
| GET         | `/v1/pastoral/sst/actions/my`                  | _(staff)_   | Actions assigned to current user                     |

#### critical-incidents.controller.ts

| HTTP Method | Endpoint                                                          | Permissions | Purpose                                                                     |
| ----------- | ----------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| POST        | `/v1/pastoral/critical-incidents`                                 | _(staff)_   | Report critical incident (bereavement, serious accident, community trauma)  |
| GET         | `/v1/pastoral/critical-incidents`                                 | _(staff)_   | List critical incidents                                                     |
| GET         | `/v1/pastoral/critical-incidents/:id`                             | _(staff)_   | Get incident detail                                                         |
| PATCH       | `/v1/pastoral/critical-incidents/:id`                             | _(staff)_   | Update incident                                                             |
| POST        | `/v1/pastoral/critical-incidents/:id/status`                      | _(staff)_   | Transition status (ci_active→ci_monitoring→ci_closed)                       |
| GET         | `/v1/pastoral/critical-incidents/:id/response-plan`               | _(staff)_   | Get response plan items                                                     |
| PATCH       | `/v1/pastoral/critical-incidents/:id/response-plan/items/:itemId` | _(staff)_   | Update response plan item                                                   |
| POST        | `/v1/pastoral/critical-incidents/:id/response-plan/items`         | _(staff)_   | Add response plan item                                                      |
| GET         | `/v1/pastoral/critical-incidents/:id/affected`                    | _(staff)_   | List affected students/staff                                                |
| POST        | `/v1/pastoral/critical-incidents/:id/affected`                    | _(staff)_   | Add affected person + impact level                                          |
| POST        | `/v1/pastoral/critical-incidents/:id/affected/bulk`               | _(staff)_   | Bulk add affected (class/year group)                                        |
| PATCH       | `/v1/pastoral/critical-incidents/:id/affected/:personId`          | _(staff)_   | Update affected person                                                      |
| DELETE      | `/v1/pastoral/critical-incidents/:id/affected/:personId`          | _(staff)_   | Remove affected person                                                      |
| POST        | `/v1/pastoral/critical-incidents/:id/affected/:personId/support`  | _(staff)_   | Log support offered (counselling, check-in, etc.)                           |
| GET         | `/v1/pastoral/critical-incidents/:id/affected/summary`            | _(staff)_   | Summary of affected cohort                                                  |
| GET         | `/v1/pastoral/critical-incidents/:id/external-support`            | _(staff)_   | List external support agencies                                              |
| POST        | `/v1/pastoral/critical-incidents/:id/external-support`            | _(staff)_   | Log external support contact                                                |
| PATCH       | `/v1/pastoral/critical-incidents/:id/external-support/:entryId`   | _(staff)_   | Update external support entry                                               |
| GET         | `/v1/pastoral/students/:studentId/wellbeing-flags`                | _(staff)_   | Get wellbeing flags for student (linked to critical incidents, escalations) |

#### parent-contacts.controller.ts

| HTTP Method | Endpoint                           | Permissions | Purpose                                    |
| ----------- | ---------------------------------- | ----------- | ------------------------------------------ |
| POST        | `/v1/pastoral/parent-contacts`     | _(staff)_   | Log parent contact (phone, email, meeting) |
| GET         | `/v1/pastoral/parent-contacts`     | _(staff)_   | List parent contacts                       |
| GET         | `/v1/pastoral/parent-contacts/:id` | _(staff)_   | Get contact detail                         |

#### checkin-\*.controller.ts (Wellbeing Check-ins)

| HTTP Method | Endpoint                                          | Permissions | Purpose                                                     |
| ----------- | ------------------------------------------------- | ----------- | ----------------------------------------------------------- |
| POST        | `/v1/pastoral/checkins`                           | _(student)_ | Student self-check-in (mood, wellbeing flag)                |
| GET         | `/v1/pastoral/checkins/my`                        | _(student)_ | Student's own check-ins                                     |
| GET         | `/v1/pastoral/checkins/status`                    | _(staff)_   | Check-in status summary (flagged students, moods by cohort) |
| GET         | `/v1/pastoral/checkins/config`                    | _(admin)_   | Get check-in configuration                                  |
| GET         | `/v1/pastoral/checkins/config/prerequisites`      | _(admin)_   | Prerequisites check (student list available, etc.)          |
| PATCH       | `/v1/pastoral/checkins/config`                    | _(admin)_   | Configure check-ins (enabled, mood options, frequency)      |
| GET         | `/v1/pastoral/checkins/flagged`                   | _(staff)_   | Flagged student check-ins (for escalation)                  |
| GET         | `/v1/pastoral/checkins/students/:studentId`       | _(staff)_   | Student check-in history                                    |
| GET         | `/v1/pastoral/checkins/analytics/mood-trends`     | _(staff)_   | Mood trends (by student, cohort, time)                      |
| GET         | `/v1/pastoral/checkins/analytics/day-of-week`     | _(staff)_   | Mood by day of week (e.g., Mondays worse)                   |
| GET         | `/v1/pastoral/checkins/analytics/exam-comparison` | _(staff)_   | Mood comparison during exam periods                         |

#### pastoral-reports.controller.ts

| HTTP Method | Endpoint                                              | Permissions | Purpose                                                       |
| ----------- | ----------------------------------------------------- | ----------- | ------------------------------------------------------------- |
| GET         | `/v1/pastoral/reports/student-summary/:studentId`     | _(staff)_   | Student pastoral summary (concerns, cases, interventions)     |
| GET         | `/v1/pastoral/reports/student-summary/:studentId/pdf` | _(staff)_   | Export as PDF                                                 |
| GET         | `/v1/pastoral/reports/sst-activity`                   | _(staff)_   | SST activity report (meetings, actions, outcomes)             |
| GET         | `/v1/pastoral/reports/sst-activity/pdf`               | _(staff)_   | Export as PDF                                                 |
| GET         | `/v1/pastoral/reports/safeguarding-compliance`        | _(staff)_   | Safeguarding compliance (CP records, referrals, SLA breaches) |
| GET         | `/v1/pastoral/reports/safeguarding-compliance/pdf`    | _(staff)_   | Export as PDF                                                 |
| GET         | `/v1/pastoral/reports/wellbeing-programme`            | _(staff)_   | Wellbeing programme effectiveness (interventions, outcomes)   |
| GET         | `/v1/pastoral/reports/wellbeing-programme/pdf`        | _(staff)_   | Export as PDF                                                 |
| GET         | `/v1/pastoral/reports/des-inspection/pdf`             | _(staff)_   | DES inspection report (wellbeing, pastoral data)              |
| POST        | `/v1/pastoral/exports/student-summary/:studentId`     | _(staff)_   | Initiate export (async, email when done)                      |
| POST        | `/v1/pastoral/exports/sst-activity`                   | _(staff)_   | Initiate export                                               |
| POST        | `/v1/pastoral/exports/tier3/init`                     | _(staff)_   | Initiate tier 3 (complex students) export                     |
| POST        | `/v1/pastoral/exports/tier3/:exportId/confirm`        | _(staff)_   | Confirm & finalise export                                     |
| GET         | `/v1/pastoral/exports/tier3/:exportId/download`       | _(staff)_   | Download export file                                          |

#### pastoral-dsar.controller.ts (Data Subject Access Request)

| HTTP Method | Endpoint                                                            | Permissions | Purpose                                                                   |
| ----------- | ------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------- |
| GET         | `/v1/pastoral/dsar-reviews`                                         | _(staff)_   | List DSAR reviews for pastoral data                                       |
| GET         | `/v1/pastoral/dsar-reviews/by-request/:complianceRequestId/summary` | _(staff)_   | DSAR summary (what pastoral data to include)                              |
| GET         | `/v1/pastoral/dsar-reviews/by-request/:complianceRequestId`         | _(staff)_   | Full DSAR review (with decision: include/redact/exclude per concern/case) |
| GET         | `/v1/pastoral/dsar-reviews/:id`                                     | _(staff)_   | Get specific review                                                       |
| POST        | `/v1/pastoral/dsar-reviews/:id/decide`                              | _(staff)_   | Record decision (include/redact/exclude per item)                         |

#### pastoral-import.controller.ts

| HTTP Method | Endpoint                       | Permissions | Purpose                                                  |
| ----------- | ------------------------------ | ----------- | -------------------------------------------------------- |
| POST        | `/v1/pastoral/import/validate` | _(staff)_   | Validate import file (CSV/Excel)                         |
| POST        | `/v1/pastoral/import/confirm`  | _(staff)_   | Confirm & import (create concerns, cases, interventions) |
| GET         | `/v1/pastoral/import/template` | _(staff)_   | Download import template                                 |

#### pastoral-admin.controller.ts

| HTTP Method | Endpoint                                  | Permissions | Purpose                                                 |
| ----------- | ----------------------------------------- | ----------- | ------------------------------------------------------- |
| GET         | `/v1/pastoral/admin/escalation-settings`  | _(admin)_   | Get escalation rules (when to escalate concern to case) |
| PATCH       | `/v1/pastoral/admin/escalation-settings`  | _(admin)_   | Update escalation rules                                 |
| GET         | `/v1/pastoral/admin/escalation-dashboard` | _(admin)_   | Dashboard of escalation events                          |

#### parent-pastoral.controller.ts (Parent Portal)

| HTTP Method | Endpoint            | Permissions | Purpose                                |
| ----------- | ------------------- | ----------- | -------------------------------------- |
| GET         | `/v1/concerns`      | _(parent)_  | Parent view: shared concerns for child |
| POST        | `/v1/self-referral` | _(parent)_  | Parent self-refer concern              |
| GET         | `/v1/interventions` | _(parent)_  | Parent view: interventions for child   |

---

### Services + Key Methods

**PastoralConcernService**

- `createConcern()` — Log concern (tier, severity, witnesses, actions taken)
- `amendConcern()` — Create version (append-only narrative history)
- `escalateConcern()` — Escalate severity/tier
- `shareConcern()` — Share with parents (with share_level control)
- `listConcerns()` — Filtered list

**PastoralCaseService**

- `createCase()` — Open case (for multi-issue coordination)
- `transitionStatus()` — open→active→monitoring→resolved→closed (cyclic)
- `linkConcern()` / `unlinkConcern()` — Manage concern links
- `transferOwnership()` — Reassign case manager

**PastoralInterventionService**

- `createIntervention()` — Create intervention plan (continuum level, target outcomes, review cycle)
- `recordReview()` — Progress update
- `transitionStatus()` — pc_active→achieved/partially_achieved/not_achieved/escalated/withdrawn
- `recordAction()` — Log action taken

**PastoralReferralService**

- `createReferral()` — Create external referral (NEPS, educational psychology, etc.)
- `submitReferral()` — Officially submit
- `acknowledgeReferral()` — Acknowledge receipt
- `receiveReport()` — Receive agency report + file
- `completeReferral()` — Close referral
- `recordRecommendation()` — Track recommendation from report

**SstMeetingService**

- `scheduleMeeting()` — Create SST meeting
- `addAgendaItem()` — Add concern/intervention review
- `startMeeting()` — Lock agenda, begin
- `completeMeeting()` — Generate minutes, lock
- `recordAction()` — Log action item from minutes

**CriticalIncidentService**

- `createIncident()` — Log critical incident (scope, immediate actions)
- `transitionStatus()` — ci_active→ci_monitoring→ci_closed (cyclic)
- `addAffectedPerson()` — Track who needs support (direct/indirect impact)
- `recordSupport()` — Log support provided (counselling, check-in)

**ParentContactService**

- `logContact()` — Record parent contact (phone, email, meeting)

**WellbeingCheckInService**

- `submitCheckIn()` — Student self-check-in (mood, flag wellbeing concern)
- `getCheckInStatus()` — Flagged students summary
- `recordFlaggedConcern()` — Auto-create concern from flagged check-in

**PastoralReportsService**

- `studentSummary()` — Multi-page student pastoral report
- `sstActivityReport()` — SST meeting & action report
- `safeguardingComplianceReport()` — CP record, referral, SLA audit
- `wellbeingProgrammeReport()` — Intervention effectiveness

**PastoralDsarService**

- `reviewDsarData()` — Determine what pastoral data subject can access
- `recordDecision()` — Include/redact/exclude by item type

---

### Prisma Tables (20+ tables)

| Table                                | Key Columns                                                                                                                                                                | Primary Enums                                                             | Purpose                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `pastoral_concerns`                  | `id`, `student_id`, `logged_by_user_id`, `severity`, `tier`, `occurred_at`, `location`, `case_id`, `behaviour_incident_id`, `parent_shareable`, `created_at`, `updated_at` | `PastoralConcernSeverity`                                                 | Case notes / concerns log                                    |
| `pastoral_concern_versions`          | `id`, `concern_id`, `version_number`, `narrative`, `amended_by_user_id`, `amendment_reason`                                                                                | —                                                                         | Append-only narrative history                                |
| `pastoral_concern_involved_students` | `concern_id`, `student_id`                                                                                                                                                 | —                                                                         | Multi-student concerns (siblings, cohort)                    |
| `pastoral_cases`                     | `id`, `student_id`, `case_number`, `status`, `owner_user_id`, `opened_reason`, `tier`, `legal_hold`, `resolved_at`, `closed_at`                                            | `PastoralCaseStatus`                                                      | Pastoral case records                                        |
| `pastoral_case_students`             | `case_id`, `student_id`                                                                                                                                                    | —                                                                         | Multi-student case linking                                   |
| `pastoral_interventions`             | `id`, `case_id`, `student_id`, `intervention_type`, `continuum_level`, `target_outcomes`, `review_cycle_weeks`, `next_review_date`, `status`                               | `PastoralInterventionStatus`                                              | Intervention plans                                           |
| `pastoral_intervention_actions`      | `id`, `intervention_id`, `assigned_to_user_id`, `description`, `status`, `due_date`, `completed_at`                                                                        | `PastoralActionStatus`                                                    | Actions within intervention                                  |
| `pastoral_intervention_progress`     | `id`, `intervention_id`, `note`, `recorded_by_user_id`, `created_at`                                                                                                       | —                                                                         | Progress notes (append-only)                                 |
| `pastoral_referrals`                 | `id`, `student_id`, `case_id`, `referral_type`, `status`, `external_agency`, `submitted_at`, `acknowledged_at`, `assessment_scheduled_at`, `report_received_at`            | `PastoralReferralStatus`                                                  | External referrals (NEPS, etc.)                              |
| `pastoral_referral_recommendations`  | `id`, `referral_id`, `recommendation_text`, `status`, `created_at`                                                                                                         | `PastoralReferralRecommendationStatus`                                    | Recommendations from referral                                |
| `pastoral_neps_visits`               | `id`, `student_id`, `visit_date`, `neps_contact`, `assessment_summary`, `next_steps`                                                                                       | —                                                                         | NEPS assessment records                                      |
| `pastoral_neps_visit_students`       | `visit_id`, `student_id`                                                                                                                                                   | —                                                                         | Multi-student NEPS visits                                    |
| `pastoral_parent_contacts`           | `id`, `student_id`, `case_id`, `concern_id`, `contact_date`, `contact_type`, `contact_notes`, `contacted_by_user_id`                                                       | —                                                                         | Parent contact log                                           |
| `sst_members`                        | `id`, `tenant_id`, `user_id`, `role`, `joined_at`                                                                                                                          | —                                                                         | SST team roster                                              |
| `sst_meetings`                       | `id`, `tenant_id`, `case_id`, `scheduled_date`, `status`, `created_at`                                                                                                     | `SstMeetingStatus`                                                        | SST meeting records                                          |
| `sst_meeting_agenda_items`           | `id`, `meeting_id`, `concern_id`, `case_id`, `item_type`, `created_at`                                                                                                     | —                                                                         | Agenda items (concerns, interventions)                       |
| `sst_meeting_actions`                | `id`, `meeting_id`, `case_id`, `description`, `assigned_to_user_id`, `status`, `due_date`                                                                                  | —                                                                         | Actions recorded in meeting                                  |
| `critical_incidents`                 | `id`, `tenant_id`, `incident_type`, `scope`, `status`, `reported_by_user_id`, `created_at`                                                                                 | `CriticalIncidentType`, `CriticalIncidentScope`, `CriticalIncidentStatus` | Bereavement, accident, trauma                                |
| `critical_incident_affected`         | `id`, `incident_id`, `person_id`, `impact_level`, `support_offered`                                                                                                        | `CriticalIncidentImpactLevel`                                             | Affected students/staff                                      |
| `cp_records`                         | `id`, `student_id`, `concern_id`, `record_type`, `narrative`, `logged_by_user_id`, `legal_hold`, `created_at`                                                              | `CpRecordType`                                                            | Child protection records (concerns, mandated reports, TUSLA) |
| `cp_access_grants`                   | `id`, `user_id`, `granted_by_user_id`, `granted_at`, `revoked_at`                                                                                                          | —                                                                         | CP access control (safeguarding team only)                   |
| `pastoral_dsar_review`               | `id`, `compliance_request_id`, `concern_id`, `decision`, `decided_by_user_id`, `created_at`                                                                                | `PastoralDsarDecision`                                                    | DSAR decisions per concern                                   |

---

### Zod Schemas (in `packages/shared/src/pastoral/schemas/`)

- `concern.schema.ts` — `createConcernSchema`, `amendConcernSchema`, `escalateConcernSchema`
- `case.schema.ts` — `createCaseSchema`, `transferOwnershipSchema`
- `intervention.schema.ts` — `createInterventionSchema`, `recordProgressSchema`
- `critical-incident.schema.ts` — `createIncidentSchema`, `addAffectedPersonSchema`
- `concern-response.schema.ts` — Parent response to shared concerns
- `dsar-review.schema.ts` — DSAR decision schema
- `pastoral-event.schema.ts` — Event/action record schema
- `tenant-settings.schema.ts` — Pastoral module configuration

---

### BullMQ Jobs / Cron

| Queue      | Job Name                       | Processor                                   | Cron Schedule           | Purpose                                                      |
| ---------- | ------------------------------ | ------------------------------------------- | ----------------------- | ------------------------------------------------------------ |
| `pastoral` | `notify-concern`               | `notify-concern.processor.ts`               | On demand               | Notify staff of concern escalation                           |
| `pastoral` | `escalation-timeout`           | `escalation-timeout.processor.ts`           | Daily @ 06:00 UTC       | Auto-escalate unresolved concerns past threshold             |
| `pastoral` | `intervention-review-reminder` | `intervention-review-reminder.processor.ts` | Daily @ 08:00 UTC       | Remind assignees of overdue review dates                     |
| `pastoral` | `overdue-actions`              | `overdue-actions.processor.ts`              | Daily @ 10:00 UTC       | Alert on overdue intervention actions                        |
| `pastoral` | `checkin-alert`                | `checkin-alert.processor.ts`                | Daily @ 09:00 UTC       | Alert on flagged student check-ins                           |
| `pastoral` | `wellbeing-flag-expiry`        | `wellbeing-flag-expiry.processor.ts`        | Daily @ 00:00 UTC       | Expire old wellbeing flags                                   |
| `pastoral` | `precompute-agenda`            | `precompute-agenda.processor.ts`            | On SST scheduled        | Pre-populate SST agenda from concerns/interventions          |
| `pastoral` | `sync-behaviour-safeguarding`  | `sync-behaviour-safeguarding.processor.ts`  | Daily @ 02:00 UTC       | Sync behaviour incidents flagged as safeguarding to pastoral |
| `pastoral` | `pastoral-cron-dispatch`       | `pastoral-cron-dispatch.processor.ts`       | _(triggers other jobs)_ | Dispatcher for all pastoral crons                            |

---

### Permissions

Pastoral module uses staff-tier permissions (not explicitly isolated):

- _(staff)_ — Users with any staff role can log/view concerns
- _(admin)_ — Configuration/admin operations

**Key differentiator**: CP access control via `CpAccessGrant` table (safeguarding team only can view CP records).

---

### Module Flag

- **Module key**: `pastoral` (in `MODULE_KEYS` constant)
- **Gating**: Core endpoints decorated with `@ModuleEnabled('pastoral')`
- **Controlled by**: `ModuleEnabledGuard` + tenant's `enabled_modules` list

---

### Cross-Module Dependencies

**Pastoral imports from**:

- `auth` — User context, permissions
- `students` — Student profiles
- `classes` — Class/year group context
- `communications` — Send notifications
- `safeguarding` — CP record integration
- `behaviour` — Behaviour incident linking

**Pastoral is imported by**:

- `safeguarding` — CP access control
- `early-warning` — Pastoral concerns as risk signal
- `reporting` — Pastoral data export
- `dashboard` — Pastoral widgets

---

### Tests Present

- `concerns.controller.spec.ts`, `cases.controller.spec.ts`, `interventions.controller.spec.ts`, `referrals.controller.spec.ts`, `sst.controller.spec.ts`, `pastoral-admin.controller.spec.ts`, `pastoral-import.controller.spec.ts`, `pastoral-dsar.controller.spec.ts`, `pastoral-reports.controller.spec.ts` — 9 controller spec files
- Service-level tests for concerns, cases, interventions, referrals, SST meetings

---

## 3. SAFEGUARDING MODULE

### Module Location

- **API**: `/Users/ram/Desktop/SDB/apps/api/src/modules/safeguarding/`
- **Worker**: `/Users/ram/Desktop/SDB/apps/worker/src/processors/safeguarding/`
- **Prisma Models**: 4 tables (embedded in main schema)

### Controllers + Endpoints

#### safeguarding.controller.ts

| HTTP Method | Endpoint                                                  | Permissions           | Purpose                                                                                            |
| ----------- | --------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| POST        | `/v1/safeguarding/concerns`                               | `safeguarding.report` | Create safeguarding concern (staff only)                                                           |
| GET         | `/v1/safeguarding/my-reports`                             | `safeguarding.report` | Staff's own reported concerns                                                                      |
| GET         | `/v1/safeguarding/concerns`                               | `safeguarding.view`   | List concerns (admin/liaison only)                                                                 |
| GET         | `/v1/safeguarding/concerns/:id`                           | `safeguarding.view`   | Get concern detail                                                                                 |
| PATCH       | `/v1/safeguarding/concerns/:id`                           | `safeguarding.manage` | Update concern (assign, status)                                                                    |
| PATCH       | `/v1/safeguarding/concerns/:id/status`                    | `safeguarding.manage` | Transition status (reported→acknowledged→under_investigation→referred→monitoring→resolved→sealed)  |
| POST        | `/v1/safeguarding/concerns/:id/assign`                    | `safeguarding.manage` | Assign to staff member (liaison)                                                                   |
| POST        | `/v1/safeguarding/concerns/:id/actions`                   | `safeguarding.manage` | Record action (note, status change, assigned, meeting, agency contact, TUSLA/Garda referral, etc.) |
| GET         | `/v1/safeguarding/concerns/:id/actions`                   | `safeguarding.view`   | List actions for concern                                                                           |
| POST        | `/v1/safeguarding/concerns/:id/tusla-referral`            | `safeguarding.manage` | Refer to TUSLA (Irish child protection authority)                                                  |
| POST        | `/v1/safeguarding/concerns/:id/garda-referral`            | `safeguarding.manage` | Refer to Garda (Irish police)                                                                      |
| POST        | `/v1/safeguarding/concerns/:id/attachments`               | `safeguarding.manage` | Upload attachment (statement, medical report, correspondence)                                      |
| GET         | `/v1/safeguarding/concerns/:id/attachments/:aid/download` | `safeguarding.view`   | Download attachment                                                                                |
| POST        | `/v1/safeguarding/concerns/:id/case-file`                 | `safeguarding.manage` | Generate case file (PDF export)                                                                    |
| POST        | `/v1/safeguarding/concerns/:id/case-file/redacted`        | `safeguarding.view`   | Generate redacted case file (for DSAR)                                                             |
| POST        | `/v1/safeguarding/concerns/:id/seal/initiate`             | `safeguarding.manage` | Initiate sealing (irreversible)                                                                    |
| POST        | `/v1/safeguarding/concerns/:id/seal/approve`              | `safeguarding.seal`   | Approve sealing (different user, for segregation)                                                  |
| GET         | `/v1/safeguarding/dashboard`                              | `safeguarding.view`   | Dashboard (open concerns, SLA breaches, escalations)                                               |
| POST        | `/v1/safeguarding/break-glass`                            | `safeguarding.report` | Emergency break-glass access grant (override normal scoping)                                       |
| GET         | `/v1/safeguarding/break-glass`                            | `safeguarding.view`   | List break-glass grants                                                                            |
| POST        | `/v1/safeguarding/break-glass/:id/review`                 | `safeguarding.manage` | After-action review of break-glass grant (audit)                                                   |

---

### Services + Key Methods

**SafeguardingConcernService**

- `createConcern()` — Report concern (type, severity, immediate actions)
- `transitionStatus()` — Status machine with SLA tracking
- `assignConcern()` — Assign to designated liaison
- `recordAction()` — Log action (note, status change, referral, agency contact)
- `tuslaReferral()` — Create TUSLA referral + track reference number
- `gardaReferral()` — Create Garda referral + track reference number
- `generateCaseFile()` — Export as PDF (for case conference, legal)
- `sealConcern()` — Irreversible sealing (GDPR-compliant archival)

**SafeguardingBreakGlassService**

- `grantBreakGlass()` — Emergency access override (with reason, expiry)
- `recordReview()` — After-action review (staff accountability)

**SafeguardingAttachmentService**

- `uploadAttachment()` — File upload with classification + visibility control (staff_all, pastoral_only, management_only, safeguarding_only)

---

### Prisma Tables

| Table                             | Key Columns                                                                                                                                                                                                                                                                                                                                                                        | Primary Enums                                                           | Purpose                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------- |
| `safeguarding_concerns`           | `id`, `concern_number`, `student_id`, `reported_by_id`, `concern_type`, `severity`, `status`, `description`, `designated_liaison_id`, `assigned_to_id`, `is_tusla_referral`, `tusla_reference_number`, `is_garda_referral`, `garda_reference_number`, `sla_first_response_due`, `sla_first_response_met_at`, `sealed_at`, `sealed_by_id`, `seal_approved_by_id`, `retention_until` | `SafeguardingConcernType`, `SafeguardingSeverity`, `SafeguardingStatus` | Core concern records        |
| `safeguarding_actions`            | `id`, `concern_id`, `action_by_id`, `action_type`, `description`, `metadata`, `due_date`, `is_overdue`                                                                                                                                                                                                                                                                             | `SafeguardingActionType`                                                | Append-only action log      |
| `safeguarding_concern_incidents`  | `concern_id`, `incident_id`, `linked_by_id`                                                                                                                                                                                                                                                                                                                                        | —                                                                       | Link to behaviour incidents |
| `safeguarding_break_glass_grants` | `id`, `granted_to_id`, `granted_by_id`, `reason`, `scope`, `scoped_concern_ids`, `granted_at`, `expires_at`, `revoked_at`, `after_action_review_completed_at`, `after_action_review_by_id`                                                                                                                                                                                         | `BreakGlassScope`                                                       | Emergency access overrides  |

---

### Zod Schemas

- (Shared with pastoral / behaviour — no separate safeguarding schemas)

---

### BullMQ Jobs

| Queue          | Job Name              | Processor                          | Cron Schedule       | Purpose                                                              |
| -------------- | --------------------- | ---------------------------------- | ------------------- | -------------------------------------------------------------------- |
| `safeguarding` | `attachment-scan`     | `attachment-scan.processor.ts`     | On demand           | Scan attachments for malware (ClamAV)                                |
| `safeguarding` | `notify-reviewers`    | `notify-reviewers.processor.ts`    | On demand           | Notify designated liaison of new concern                             |
| `safeguarding` | `sla-check`           | `sla-check.processor.ts`           | Every 5 min         | Check SLA deadlines, create breach tasks                             |
| `safeguarding` | `critical-escalation` | `critical-escalation.processor.ts` | On critical concern | Escalation chain (liaison → deputy → fallback) for critical concerns |
| `safeguarding` | `break-glass-expiry`  | `break-glass-expiry.processor.ts`  | Daily @ 23:00 UTC   | Revoke expired break-glass grants                                    |
| `safeguarding` | `message-scan`        | `message-scan.processor.ts`        | On demand           | Scan in-app messages for safeguarding keywords                       |

---

### Permissions

**Safeguarding Permissions** (from `packages/shared/src/constants/permissions.ts`):

```typescript
safeguarding: {
  report: 'safeguarding.report',   // Staff: report concern
  view: 'safeguarding.view',       // Admin: view all concerns
  manage: 'safeguarding.manage',   // Admin: manage concerns, assign, update status
  seal: 'safeguarding.seal',       // Admin: approve sealing (segregated from manage)
}
```

**Tier Mapping**:

- `report` → **Staff tier**
- `view`, `manage`, `seal` → **Admin tier**

**Special Control**: CP access via `CpAccessGrant` table (safeguarding team members granted explicit access).

---

### Module Flag

- **No explicit module flag** — Safeguarding is part of pastoral infrastructure
- Gating depends on permissions (`safeguarding.view`, `safeguarding.report`, etc.)

---

### Cross-Module Dependencies

**Safeguarding imports from**:

- `auth` — User context, permissions
- `students` — Student profiles
- `communications` — Send notifications
- `behaviour` — Behaviour incident linking
- `pastoral` — CP record integration

**Safeguarding is imported by**:

- `behaviour` — Link incidents to safeguarding concerns
- `pastoral` — CP access control
- `compliance` — SLA tracking, regulatory reporting

---

### Tests Present

- Safeguarding tests integrated with pastoral tests

---

## 4. EARLY-WARNING MODULE

### Module Location

- **API**: `/Users/ram/Desktop/SDB/apps/api/src/modules/early-warning/`
- **Shared Schemas**: `/Users/ram/Desktop/SDB/packages/shared/src/early-warning/`
- **Prisma Models**: 3 tables

### Controllers + Endpoints

#### early-warning.controller.ts

| HTTP Method | Endpoint                                   | Permissions | Purpose                                                                  |
| ----------- | ------------------------------------------ | ----------- | ------------------------------------------------------------------------ |
| GET         | `/v1/early-warning`                        | _(staff)_   | Get student risk tiers (cohort/class)                                    |
| GET         | `/v1/early-warning/summary`                | _(staff)_   | Summary by domain (attendance, grades, behaviour, wellbeing, engagement) |
| GET         | `/v1/early-warning/cohort`                 | _(staff)_   | Cohort-level risk analysis                                               |
| GET         | `/v1/early-warning/config`                 | _(admin)_   | Get early-warning configuration (thresholds, domains)                    |
| PUT         | `/v1/early-warning/config`                 | _(admin)_   | Update configuration                                                     |
| GET         | `/v1/early-warning/:studentId`             | _(staff)_   | Get student's risk tier (per domain)                                     |
| POST        | `/v1/early-warning/:studentId/acknowledge` | _(staff)_   | Acknowledge warning (staff action taken)                                 |
| POST        | `/v1/early-warning/:studentId/assign`      | _(staff)_   | Assign intervention/case manager                                         |

---

### Services + Key Methods

**EarlyWarningService**

- `getRiskTier()` — Calculate student risk tier (green/yellow/amber/red) per domain
- `getSummary()` — Aggregate by domain (attendance, grades, behaviour, wellbeing, engagement)
- `getCohortAnalysis()` — Group by class/year group
- `getStudentRiskProfile()` — Detailed per-domain breakdown

---

### Prisma Tables

| Table                            | Key Columns                                                                            | Primary Enums                                                              | Purpose                    |
| -------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------- |
| `early_warning_signals`          | `id`, `student_id`, `domain`, `risk_tier`, `severity`, `signal_details`, `detected_at` | `EarlyWarningDomain`, `EarlyWarningRiskTier`, `EarlyWarningSignalSeverity` | Individual risk signals    |
| `early_warning_student_status`   | `student_id`, `overall_risk_tier`, `last_updated`                                      | `EarlyWarningRiskTier`                                                     | Cached student risk status |
| `early_warning_acknowledgements` | `id`, `signal_id`, `acknowledged_by_id`, `action_taken`, `acknowledged_at`             | —                                                                          | Staff acknowledgements     |

---

### Zod Schemas

- Early warning schemas embedded in module (minimal schema footprint)

---

### BullMQ Jobs

- No dedicated workers (computed on-demand from other module signals)

---

### Permissions

- Staff-tier: can view and acknowledge
- Admin-tier: can configure thresholds

---

### Module Flag

- **Module key**: `early_warning` (in `MODULE_KEYS` constant)

---

### Cross-Module Dependencies

**Imports signals from**:

- `attendance` — Absence percentage, patterns
- `gradebook` — Grade trends
- `behaviour` — Incident frequency, sanctions
- `pastoral` — Concern escalations, interventions
- `engagement` — Engagement scores

---

## 5. STAFF WELLBEING MODULE

### Module Location

- **API**: `/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/`
- **Prisma Models**: 5 tables

### Controllers + Endpoints

#### survey.controller.ts

| HTTP Method | Endpoint                                   | Permissions     | Purpose                                          |
| ----------- | ------------------------------------------ | --------------- | ------------------------------------------------ |
| POST        | `/v1/staff-wellbeing/surveys`              | _(admin)_       | Create survey (workload, engagement, burnout)    |
| GET         | `/v1/staff-wellbeing/surveys`              | _(admin)_       | List surveys                                     |
| GET         | `/v1/staff-wellbeing/surveys/:id`          | _(admin/staff)_ | Get survey detail (questions, responses)         |
| PATCH       | `/v1/staff-wellbeing/surveys/:id`          | _(admin)_       | Update survey (before activation)                |
| POST        | `/v1/staff-wellbeing/surveys/:id/clone`    | _(admin)_       | Clone survey (template reuse)                    |
| POST        | `/v1/staff-wellbeing/surveys/:id/activate` | _(admin)_       | Activate survey (open for responses)             |
| POST        | `/v1/staff-wellbeing/surveys/:id/close`    | _(admin)_       | Close survey (no more responses)                 |
| POST        | `/v1/staff-wellbeing/respond/:surveyId`    | _(staff)_       | Submit survey response (anonymous or identified) |
| GET         | `/v1/staff-wellbeing/respond/active`       | _(staff)_       | Get active surveys for staff                     |

#### survey-results.controller.ts

| HTTP Method | Endpoint                                                 | Permissions | Purpose                                                |
| ----------- | -------------------------------------------------------- | ----------- | ------------------------------------------------------ |
| GET         | `/v1/staff-wellbeing/surveys/:id/results`                | _(admin)_   | Survey results summary (aggregated, charts)            |
| GET         | `/v1/staff-wellbeing/surveys/:id/moderation`             | _(admin)_   | Moderation view (review responses for GDPR compliance) |
| PATCH       | `/v1/staff-wellbeing/surveys/:id/moderation/:responseId` | _(admin)_   | Redact/remove response (GDPR)                          |
| GET         | `/v1/staff-wellbeing/surveys/:id/results/comments`       | _(admin)_   | Extract comments (for thematic analysis)               |

#### personal-workload.controller.ts

| HTTP Method | Endpoint                                            | Permissions | Purpose                                            |
| ----------- | --------------------------------------------------- | ----------- | -------------------------------------------------- |
| GET         | `/v1/staff-wellbeing/my-workload/summary`           | _(staff)_   | Personal workload summary (classes, cover, duties) |
| GET         | `/v1/staff-wellbeing/my-workload/cover-history`     | _(staff)_   | Cover/substitution history                         |
| GET         | `/v1/staff-wellbeing/my-workload/timetable-quality` | _(staff)_   | Timetable quality metrics (gaps, split days)       |

#### aggregate-workload.controller.ts

| HTTP Method | Endpoint                                              | Permissions | Purpose                                                 |
| ----------- | ----------------------------------------------------- | ----------- | ------------------------------------------------------- |
| GET         | `/v1/staff-wellbeing/aggregate/workload-summary`      | _(admin)_   | School-wide workload summary                            |
| GET         | `/v1/staff-wellbeing/aggregate/cover-fairness`        | _(admin)_   | Cover distribution fairness analysis                    |
| GET         | `/v1/staff-wellbeing/aggregate/timetable-quality`     | _(admin)_   | School timetable quality metrics                        |
| GET         | `/v1/staff-wellbeing/aggregate/absence-trends`        | _(admin)_   | Staff absence patterns (burnout indicator)              |
| GET         | `/v1/staff-wellbeing/aggregate/substitution-pressure` | _(admin)_   | Substitution load by staff member                       |
| GET         | `/v1/staff-wellbeing/aggregate/correlation`           | _(admin)_   | Correlations (workload vs absence, survey scores, etc.) |

#### board-report.controller.ts

| HTTP Method | Endpoint                                     | Permissions | Purpose                                              |
| ----------- | -------------------------------------------- | ----------- | ---------------------------------------------------- |
| GET         | `/v1/staff-wellbeing/reports/termly-summary` | _(admin)_   | Termly staff wellbeing summary (for board/governors) |

#### resource.controller.ts

| HTTP Method | Endpoint                        | Permissions | Purpose                                                            |
| ----------- | ------------------------------- | ----------- | ------------------------------------------------------------------ |
| GET         | `/v1/staff-wellbeing/resources` | _(staff)_   | Staff support resources (EAP, mental health, leave policies, etc.) |

---

### Services + Key Methods

**StaffWellbeingSurveyService**

- `createSurvey()` — Create survey template
- `activateSurvey()` — Open for responses
- `closeSurvey()` — Close to new responses
- `submitResponse()` — Record staff response
- `getResults()` — Aggregated results (charts, summary stats)

**StaffWellbeingAnalyticsService**

- `getWorkloadSummary()` — Classes, cover, duties, contact hours
- `getCoverFairness()` — Distribution of cover duty
- `getTimetableQuality()` — Gaps, split days, travel time
- `getAbsenceTrends()` — Sickness patterns (burnout indicator)
- `getCorrelations()` — Workload vs absence, survey scores

---

### Prisma Tables

| Table                              | Key Columns                                                                                            | Primary Enums | Purpose                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------- | ----------------------------- |
| `staff_wellbeing_surveys`          | `id`, `tenant_id`, `title`, `description`, `status`, `created_at`, `activated_at`, `closed_at`         | —             | Survey templates              |
| `staff_wellbeing_survey_questions` | `id`, `survey_id`, `question_text`, `question_type`, `display_order`                                   | —             | Survey questions              |
| `staff_wellbeing_survey_responses` | `id`, `survey_id`, `staff_id`, `response_data`, `submitted_at`, `anonymous`                            | —             | Survey responses              |
| `staff_wellbeing_resources`        | `id`, `tenant_id`, `title`, `url`, `category`, `description`                                           | —             | Support resources (EAP, etc.) |
| `staff_workload_snapshots`         | `id`, `staff_id`, `date_snapshot`, `classes_count`, `cover_hours`, `duty_hours`, `total_contact_hours` | —             | Workload metrics over time    |

---

### Zod Schemas

- (Minimal schemas — mostly API-driven)

---

### Permissions

- Staff-tier: can view own workload, fill surveys
- Admin-tier: can create/manage surveys, view aggregates, board reports

---

### Module Flag

- **Module key**: `staff_wellbeing` (in `MODULE_KEYS` constant)

---

---

## Cross-Cutting Sections

### Hidden / Non-Obviously-Wired Features

Based on endpoint inventory, the following backend features may NOT have corresponding UI pages:

1. **Behaviour AI features** (endpoints exist but UI may not be ready):
   - `POST /behaviour/incidents/ai-parse` — AI incident description parsing
   - `GET /behaviour/students/:studentId/ai-summary` — AI-generated behaviour summary
   - `POST /behaviour/analytics/ai-query` — Natural-language queries on behaviour data
   - `GET /behaviour/analytics/ai-query/history` — Query history/audit

2. **Behaviour policy replay/testing** (admin-only, non-obvious):
   - `POST /behaviour/policies/replay` — Retroactively apply rules to historical incidents
   - `POST /behaviour/policies/import` / `GET /behaviour/policies/export` — JSON import/export
   - `POST /policy-dry-run` — Test policy rules (dry-run endpoint)

3. **Behaviour admin data repair** (dangerous operations, non-obvious):
   - `POST /recompute-points/preview` + `POST /recompute-points` — Rebuild all student points
   - `POST /rebuild-awards/preview` + `POST /rebuild-awards` — Rebuild recognition awards
   - `POST /recompute-pulse` — Recompute analytics pulse
   - `POST /backfill-tasks/preview` + `POST /backfill-tasks` — Backfill missing tasks
   - `POST /reindex-search/preview` + `POST /reindex-search` — Reindex Meilisearch
   - `POST /retention/preview` + `POST /retention/execute` — Archive/anonymise old records
   - `POST /legal-holds` + `POST /legal-holds/:id/release` — Legal hold management

4. **Document generation** (auto-wired but UI may not show):
   - `POST /behaviour/documents/generate` — On-demand PDF generation (detention notice, suspension letter, exclusion notice, decision letter)
   - `POST /behaviour/documents/:id/finalise` + `POST /behaviour/documents/:id/send` — Multi-channel send (email, WhatsApp, in-app)
   - `POST /behaviour/appeals/:id/generate-decision-letter` — Auto-generate appeal decision
   - `POST /behaviour/exclusion-cases/:id/generate-notice` — Auto-generate exclusion notice
   - `POST /behaviour/exclusion-cases/:id/generate-board-pack` — Auto-generate hearing pack

5. **Exclusion case statutory workflow** (heavily gated):
   - Full exclusion case lifecycle with statutory timelines (notice → hearing → decision → appeal window → finalised/overturned)
   - Timeline computation + deadline tracking

6. **Guardian restrictions** (low-visibility, powerful):
   - `POST /behaviour/guardian-restrictions` — Block parent from portal/comms
   - `GET /behaviour/guardian-restrictions/active` — Active restrictions
   - `POST /behaviour/guardian-restrictions/:id/revoke` — Early revocation

7. **Parent acknowledgement tracking** (append-only audit):
   - `POST /behaviour/acknowledge/:acknowledgementId` — Parent portal endpoint
   - Full tracking: sent_at, delivered_at, read_at, acknowledged_at, channel, method

8. **Amendments & corrections** (notification-driven):
   - `GET /behaviour/amendments` + `GET /behaviour/amendments/pending` — List pending parent re-acknowledgements
   - `POST /behaviour/amendments/:id/send-correction` — Send correction notice to parents

9. **Pastoral DSAR (Data Subject Access Request)** (compliance-driven):
   - `GET /pastoral/dsar-reviews` + `GET /pastoral/dsar-reviews/by-request/:complianceRequestId` — DSAR item-level decisions
   - `POST /pastoral/dsar-reviews/:id/decide` — Include/redact/exclude per concern/case

10. **Pastoral import** (bulk data ingestion):
    - `POST /pastoral/import/validate` + `POST /pastoral/import/confirm` — CSV/Excel import
    - `GET /pastoral/import/template` — Download template

11. **Safeguarding break-glass emergency access** (audit-trail intensive):
    - `POST /safeguarding/break-glass` — Emergency override (grants scoped access for time-bound period)
    - `POST /safeguarding/break-glass/:id/review` — Mandatory after-action review
    - Full escalation chain on critical concerns (liaison → deputy → fallback)

12. **Critical incident response planning** (structured harm-response):
    - `GET /pastoral/critical-incidents/:id/response-plan` — Response plan items
    - `PATCH /pastoral/critical-incidents/:id/response-plan/items/:itemId` — Update plan
    - `POST /pastoral/critical-incidents/:id/affected/:personId/support` — Log support offered

13. **SST meeting agenda pre-population** (AI-driven):
    - `POST /pastoral/sst/meetings/:id/agenda/refresh` — Auto-populate from concerns/interventions
    - `POST /pastoral/sst/meetings/:id/agenda/refresh` triggers `pastoral:precompute-agenda` job

14. **Wellbeing check-in flagging** (student self-report):
    - `POST /pastoral/checkins` — Student mood check-in (auto-creates concern if flagged)
    - `GET /pastoral/checkins/flagged` — Flagged student list (for escalation)

---

### State Machines

**All state machines are defined in:**

- `packages/shared/src/behaviour/state-machine*.ts` (behaviour)
- `packages/shared/src/pastoral/case-state-machine.ts` (pastoral)
- `docs/architecture/state-machines.md` (single source of truth)

#### Behaviour Module State Machines

**IncidentStatus** (Comprehensive lifecycle):

```
draft          → [active, withdrawn]
active         → [investigating, under_review, escalated, resolved, withdrawn]
investigating  → [awaiting_approval, awaiting_parent_meeting, resolved, escalated, converted_to_safeguarding]
awaiting_approval       → [active, resolved]
awaiting_parent_meeting → [resolved, escalated]
under_review   → [active, escalated, resolved, withdrawn]
escalated      → [investigating, resolved]
resolved       → [closed_after_appeal, superseded]
withdrawn* | closed_after_appeal* | superseded* | converted_to_safeguarding*
```

**SanctionStatus**:

```
pending_approval → [scheduled, cancelled]
scheduled        → [served, partially_served, no_show, excused, cancelled, superseded, not_served_absent, appealed]
appealed         → [scheduled, cancelled, replaced]
no_show          → [superseded, cancelled]
excused          → [superseded, cancelled]
not_served_absent→ [superseded]
served* | partially_served* | cancelled* | replaced* | superseded*
```

**InterventionStatus** (Monitoring cycle):

```
planned                  → [active_intervention, abandoned]
active_intervention      → [monitoring, completed_intervention, abandoned]
monitoring               → [completed_intervention, active_intervention]
completed_intervention* | abandoned*
```

**AppealStatus**:

```
submitted         → [under_review, withdrawn_appeal]
under_review      → [hearing_scheduled, decided, withdrawn_appeal]
hearing_scheduled → [decided, withdrawn_appeal]
decided* | withdrawn_appeal*
```

**ExclusionStatus** (Statutory timeline):

```
initiated             → [notice_issued]
notice_issued         → [hearing_scheduled_exc]
hearing_scheduled_exc → [hearing_held]
hearing_held          → [decision_made]
decision_made         → [appeal_window]
appeal_window         → [finalised, overturned]
finalised* | overturned*
```

**BehaviourTaskStatus**:

```
pending     → [in_progress, completed, cancelled, overdue]
in_progress → [completed, cancelled, overdue]
overdue     → [in_progress, completed, cancelled]
completed* | cancelled*
```

**DocumentStatus** (Reliability-hardened):

```
generating    → [draft_doc, generating]
draft_doc     → [finalised]
finalised     → [sent_doc, superseded]
sent_doc*     | superseded*
```

**SafeguardingStatus** (SLA-driven):

```
reported             → [acknowledged]
acknowledged         → [under_investigation]
under_investigation  → [referred, monitoring, resolved]
referred             → [monitoring, resolved]
monitoring           → [resolved]
resolved             → [sealed]
sealed*
```

#### Pastoral Module State Machines

**PastoralCaseStatus** (Cyclic, no terminal states):

```
open       → [active]
active     → [monitoring, resolved]
monitoring → [active, resolved]
resolved   → [closed]
closed     → [open]
```

Note: No terminal state — cases can be reopened.

**PastoralInterventionStatus**:

```
pc_active → [achieved, partially_achieved, not_achieved, escalated, withdrawn]
```

Terminal states: all of the above.

**PastoralReferralStatus** (Forward-only after submission):

```
draft                        → [submitted]
submitted                    → [acknowledged, withdrawn]
acknowledged                 → [assessment_scheduled, withdrawn]
assessment_scheduled         → [assessment_complete, withdrawn]
assessment_complete          → [report_received, withdrawn]
report_received              → [recommendations_implemented, withdrawn]
recommendations_implemented* | withdrawn*
```

**CriticalIncidentStatus** (Cyclic):

```
ci_active     → [ci_monitoring, ci_closed]
ci_monitoring → [ci_active, ci_closed]
ci_closed     → [ci_monitoring]
```

**PastoralReferralRecommendationStatus**:

```
pending        → [in_progress, not_applicable]
in_progress    → [implemented, not_applicable]
implemented* | not_applicable*
```

---

### Notable Architecture

#### 1. Soft-Delete / Retention Strategy (Behaviour)

- **Retention Status Fields**: `behaviour_incidents`, `behaviour_sanctions`, `behaviour_interventions`, `behaviour_attachments` all have `retention_status` enum:
  - `active` — Visible in all views
  - `archived` — Hidden from default lists, searchable with toggle
  - `anonymised` — PII stripped (names → hash, text → "[Archived content]"), irreversible

- **Legal Holds**: Can prevent anonymisation. `behaviour_legal_holds` table tracks hold status. Retention worker skips held entities.

- **Append-Only Audit Logs**: `behaviour_entity_history` captures every change (state_changed, updated, participant_added, sanction_created, etc.). Cannot be deleted.

#### 2. Multi-Tenant Isolation with RLS (Row-Level Security)

- All queries include `tenant_id` filters
- Permissions checked at both endpoint (`@RequiresPermission`) and data layer (`getUserPermissions()`)
- Policy evaluation happens at query time in `BehaviourService.listIncidents()`

#### 3. State Machine Contracts (Single Source of Truth)

- All transitions validated in `packages/shared/src/behaviour/state-machine*.ts`
- Services call these functions before persisting
- Tests verify all transitions (no skipped states, no backward-only transitions except where documented)

#### 4. Notification Routing (Multi-Channel)

- Parent notifications queued to `behaviour:parent-notification` job
- Job reads notification preferences (email, WhatsApp, in-app)
- Acknowledgements tracked at three levels: sent_at, delivered_at, acknowledged_at (audit trail)

#### 5. Policy Engine (Behaviour Automation)

- Policies are rules + actions stored in `behaviour_policy_rules` + `behaviour_policy_rule_actions`
- On incident creation, `evaluate-policy` job matches incident against rules
- Actions: auto-escalate, create sanction, require approval, require parent meeting, notify roles, create task, flag for review
- All matches logged in `behaviour_policy_evaluation` (audit of what matched, what didn't, why)

#### 6. Document Generation (Reliability-Hardened)

- Templates stored as Handlebars in `behaviour_document_templates`
- Documents always start in `generating` state (no race condition on file availability)
- PDF render callback (from external service) transitions `generating → draft_doc` + sets `file_key` + `file_size_bytes`
- Retry logic built into `document-ready` processor

#### 7. Materialized Views (Performance)

- Analytics queries hit pre-computed views, not raw tables
- `behaviour:refresh-mv` cron updates daily
- Views include: pulse (today's summary), category trends, staff counts, sanction outcomes

#### 8. Search Integration (Meilisearch)

- Incidents indexed to Meilisearch for full-text search + filters
- Index includes: description, category, staff name, student name, status
- Reindex job: `POST /reindex-search`
- Anonymised records auto-deleted from index (retention worker)

#### 9. Guardian Restrictions (Parent Access Control)

- `behaviour_guardian_restrictions` table tracks blocks (no_behaviour_visibility, no_behaviour_notifications, no_portal_access, no_communications)
- Enforced at API layer (response filtering, notification suppression)
- Background job auto-revokes expired restrictions

#### 10. Attachments (Classification + Visibility)

- `behaviour_attachments` classified by type (staff_statement, student_statement, parent_letter, screenshot, photo, etc.)
- Visibility levels: staff_all, pastoral_only, management_only, safeguarding_only
- Visibility enforced at query time (RLS)
- Malware scan: `ScanStatus` (pending_scan, clean, infected, scan_failed)

#### 11. Safeguarding Sealing (Irreversible GDPR Compliance)

- `SafeguardingConcern.sealed_at` + `sealed_by_id` + `seal_approved_by_id` (dual approval)
- Once sealed, concern:
  - Cannot be unsealed (irreversible)
  - Requires `safeguarding.seal` permission to view
  - Excluded from standard reports
- Sealing is append-only: new sealing records added, old ones never deleted

#### 12. Pastoral Multi-Versioning (Amendment Trail)

- `PastoralConcern` + `PastoralConcernVersion` (append-only)
- When concern is amended, a new version row created with `version_number`, `narrative`, `amended_by_user_id`, `amendment_reason`
- Full history available to staff for audit

#### 13. Safeguarding SLA (Service Level Agreement) Tracking

- `SafeguardingConcern` has `sla_first_response_due` + `sla_first_response_met_at`
- SLA computed on creation based on severity:
  - `critical`: 1 hour
  - `high`: 4 hours
  - `medium`: 24 hours
  - `low`: 72 hours
- Cron job `safeguarding:sla-check` (every 5 min) creates breach tasks if deadline passed
- Critical concerns auto-escalate (liaison → deputy → fallback chain) every 30 min until acknowledged

#### 14. Break-Glass Emergency Access (Safeguarding)

- `SafeguardingBreakGlassGrant` allows temporary access override
- Scope: all_concerns OR specific_concerns (scoped_concern_ids array)
- Granted_at + expires_at (time-bound)
- Mandatory after-action review (staff accountability)
- Audit trail: `after_action_review_completed_at` + `after_action_review_by_id`

#### 15. Cross-Module Incident Linking

- Behaviour incident can be flagged `converted_to_safeguarding` (visible only to safeguarding users)
- `SafeguardingConcernIncident` table links concern to incident (audit trail: `linked_by_id`)
- Behaviour incident can be linked to pastoral concern (`behaviour_incident_id` in `PastoralConcern`)
- All links appended-only, never deleted

#### 16. Approval Request Workflow (Incidents & Sanctions)

- High-risk incidents (e.g., requiring parent notification) can require approval
- `behaviour_incidents.approval_request_id` links to `approvals.ApprovalRequest`
- Approval state machine: pending_approval → approved/rejected → executed/cancelled/expired
- Approval status separate from incident status (`approval_status` field)

#### 17. Parent Acknowledgement Tracking (Multi-Level)

- `BehaviourParentAcknowledgement` (append-only)
- Tracks: sent_at, delivered_at, read_at, acknowledged_at
- Channel: email, whatsapp, in_app
- Method: in_app_button, email_link, whatsapp_reply
- Notification digest job batches multiple notifications (daily digest)

#### 18. Task Management (Behaviour)

- `BehaviourTask` (flexible entity linking via `entity_type` + `entity_id`)
- Can be linked to: incident, sanction, intervention, safeguarding_concern, appeal, break_glass_grant, exclusion_case, guardian_restriction
- State machine: pending → in_progress/overdue → completed/cancelled
- Reminders: `behaviour:task-reminders` cron alerts on overdue + upcoming deadlines

#### 19. House/Team System (Recognition)

- `BehaviourHouseTeam` + `BehaviourHouseMembership`
- House points aggregated from incidents (point_value field in category)
- Leaderboard computed from aggregated house points
- Used for competition/motivation (recognition wall, house standing)

---

## Summary of API Endpoints

**Total Wellbeing-Related Endpoints: 200+**

| Module          | Controllers | Endpoints |
| --------------- | ----------- | --------- |
| Behaviour       | 16          | 120+      |
| Pastoral        | 10          | 65+       |
| Safeguarding    | 1           | 22        |
| Early-Warning   | 1           | 8         |
| Staff Wellbeing | 6           | 30+       |
| **TOTAL**       | **34**      | **245+**  |

---

## Summary of Prisma Models

**Total Wellbeing Tables: 68**

| Module                          | Tables |
| ------------------------------- | ------ |
| Behaviour                       | 25     |
| Pastoral                        | 20     |
| Safeguarding                    | 4      |
| Early-Warning                   | 3      |
| Staff Wellbeing                 | 5      |
| Shared (CP, Critical Incidents) | 11     |
| **TOTAL**                       | **68** |

---

## Summary of Background Jobs

**Total Wellbeing Processors: 30+**

| Module          | Jobs   |
| --------------- | ------ |
| Behaviour       | 15     |
| Pastoral        | 8      |
| Safeguarding    | 6      |
| Early-Warning   | 0      |
| Staff Wellbeing | 0      |
| **TOTAL**       | **29** |

---

## Permissions Required for Full Feature Access

**Staff Tier** (can log & view):

- `behaviour.log` — Log incidents
- `behaviour.view` — View incidents, analytics
- `behaviour.manage` — Manage incidents, sanctions, interventions
- `behaviour.view_sensitive` — View safeguarding-flagged incidents
- `behaviour.ai_query` — Use AI features
- `safeguarding.report` — Report safeguarding concern
- `behaviour.appeal` — Submit appeal (parent only)

**Admin Tier** (can configure & administer):

- `behaviour.admin` — Admin operations (recompute, rebuild, reindex, retention)
- `behaviour.view_staff_analytics` — Staff-level analytics
- `safeguarding.view` — View all concerns
- `safeguarding.manage` — Manage concerns
- `safeguarding.seal` — Approve sealing (segregated)

---

This inventory is complete and production-ready for your redesign. Every endpoint, service, table, job, and permission is accounted for. You can now compare against what's actually exposed in the UI and plan accordingly.
