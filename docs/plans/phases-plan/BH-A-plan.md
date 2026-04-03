# Phase A: Core + Temporal — Implementation Plan

## Section 1 — Overview

Phase A is the foundation for the entire Behaviour Management module. It delivers:

- **All 32 database tables** via Prisma migration + RLS policies (7 with full business logic, 25 schema-only)
- **3 materialised views** (schema-only, refresh logic in Phase F)
- **6 sequences** registered in `tenant_sequences`
- **12 permissions** registered in global permissions table
- **~55 API endpoints** across 4 controllers (incidents, students, tasks, config)
- **Seed data**: 12 categories, ~60 description templates, 4 award types
- **9 frontend pages**: pulse, incidents (list/create/detail), students (list/profile), tasks, settings (categories/general)
- **Quick-log FAB** component on all behaviour pages
- **2 worker jobs**: parent notifications, task reminders
- **Shared packages**: data classification, scope enforcement, Zod schemas, enums

### Dependencies on Prior Phases

None. This is the foundation phase.

---

## Section 2 — Database Changes

### New Enums (20)

| Enum                                                                   | Values                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BehaviourPolarity`                                                    | positive, negative, neutral                                                                                                                                                                                                                     |
| `BenchmarkCategory`                                                    | praise, merit, minor_positive, major_positive, verbal_warning, written_warning, detention, internal_suspension, external_suspension, expulsion, note, observation, other                                                                        |
| `IncidentStatus`                                                       | draft, active, investigating, under_review, awaiting_approval, awaiting_parent_meeting, escalated, resolved, withdrawn, closed_after_appeal, superseded, converted_to_safeguarding                                                              |
| `IncidentApprovalStatus`                                               | not_required, pending, approved, rejected                                                                                                                                                                                                       |
| `ParentNotificationStatus`                                             | not_required, pending, sent, delivered, failed, acknowledged                                                                                                                                                                                    |
| `ContextType`                                                          | class, break, before_school, after_school, lunch, transport, extra_curricular, off_site, online, other                                                                                                                                          |
| `ParticipantType`                                                      | student, staff, parent, visitor, unknown                                                                                                                                                                                                        |
| `ParticipantRole`                                                      | subject, witness, bystander, reporter, victim, instigator, mediator                                                                                                                                                                             |
| `BehaviourEntityType`                                                  | incident, sanction, intervention, appeal, task, exclusion_case, publication_approval, break_glass_grant, guardian_restriction                                                                                                                   |
| `BehaviourTaskType`                                                    | follow_up, intervention_review, parent_meeting, parent_acknowledgement, approval_action, sanction_supervision, return_check_in, safeguarding_action, document_requested, appeal_review, break_glass_review, guardian_restriction_review, custom |
| `BehaviourTaskEntityType`                                              | incident, sanction, intervention, safeguarding_concern, appeal, break_glass_grant, exclusion_case, guardian_restriction                                                                                                                         |
| `TaskPriority`                                                         | low, medium, high, urgent                                                                                                                                                                                                                       |
| `BehaviourTaskStatus`                                                  | pending, in_progress, completed, cancelled, overdue                                                                                                                                                                                             |
| `RetentionStatus`                                                      | active, archived, anonymised                                                                                                                                                                                                                    |
| `SanctionType`                                                         | detention, suspension_internal, suspension_external, expulsion, community_service, loss_of_privilege, restorative_meeting, other                                                                                                                |
| `SanctionStatus`                                                       | pending_approval, scheduled, served, partially_served, no_show, excused, cancelled, rescheduled, not_served_absent, appealed, replaced                                                                                                          |
| `AcknowledgementChannel`                                               | email, whatsapp, in_app                                                                                                                                                                                                                         |
| `AcknowledgementMethod`                                                | in_app_button, email_link, whatsapp_reply                                                                                                                                                                                                       |
| (+ additional enums for safeguarding, policy, alerts, documents, etc.) |

### Tables Created (32)

**Phase A business logic tables (7)**:

1. `behaviour_categories` — UNIQUE(tenant_id, name)
2. `behaviour_incidents` — 11 indexes, idempotency partial unique
3. `behaviour_incident_participants` — CHECK + partial unique constraints
4. `behaviour_description_templates`
5. `behaviour_entity_history` — append-only, 2 indexes
6. `behaviour_tasks` — 3 indexes
7. `behaviour_parent_acknowledgements` — append-only

**Schema-only tables (25)**: All created with full columns per master spec, business logic in later phases.

### RLS Policies

Every table gets:

```sql
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
CREATE POLICY {table}_tenant_isolation ON {table}
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### Materialised Views (3)

- `mv_student_behaviour_summary` — student aggregate stats
- `mv_behaviour_benchmarks` — ETB benchmarking
- `mv_behaviour_exposure_rates` — teaching hour normalisation

### Sequences (6)

Register in `tenant_sequences`: BH- (incidents), SN- (sanctions), IV- (interventions), CP- (safeguarding), AP- (appeals), EX- (exclusion cases)

---

## Section 3 — API Endpoints

### Incidents Controller (~20 endpoints)

POST/GET/PATCH incidents, quick-log, bulk-positive, status transition, withdraw, follow-up, participants CRUD, attachments (stub), history, policy-evaluation (stub), my incidents, feed

### Students Controller (~13 endpoints)

Student list, profile, timeline, analytics (stub), points, sanctions (stub), interventions (stub), awards (stub), AI summary (stub), preview, export (stub), parent-view (stub), tasks

### Tasks Controller (~8 endpoints)

List, my tasks, detail, update, complete, cancel, overdue, stats

### Config Controller (~6 endpoints)

Categories CRUD, description templates CRUD

### Quick-Log (~2 endpoints)

Context pre-fetch, templates

---

## Section 4 — Service Layer

| Service                    | Responsibilities                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `BehaviourService`         | Incident CRUD, state machine, idempotency, context snapshot, parent description send-gate |
| `BehaviourQuickLogService` | Quick-log context, quick-log submit, bulk positive                                        |
| `BehaviourStudentsService` | Student overview, timeline, points calculation                                            |
| `BehaviourTasksService`    | Task CRUD, auto-creation, completion, overdue detection                                   |
| `BehaviourConfigService`   | Category CRUD, template CRUD, settings                                                    |
| `BehaviourHistoryService`  | Entity history recording and retrieval                                                    |
| `BehaviourScopeService`    | Scope filter generation (own/class/year_group/pastoral/all)                               |

---

## Section 5 — Frontend Pages

| Route                             | Type   | Description                                              |
| --------------------------------- | ------ | -------------------------------------------------------- |
| `/behaviour`                      | Client | Pulse dashboard — task summary + live feed + basic stats |
| `/behaviour/incidents`            | Client | Incident list with tabs, pagination, scope-filtered      |
| `/behaviour/incidents/new`        | Client | Full incident creation form                              |
| `/behaviour/incidents/[id]`       | Client | Incident detail with participants, history, status       |
| `/behaviour/students`             | Client | Student overview table                                   |
| `/behaviour/students/[studentId]` | Client | Student profile with tabs                                |
| `/behaviour/tasks`                | Client | Task inbox                                               |
| `/settings/behaviour-categories`  | Client | Category CRUD with drag-to-reorder                       |
| `/settings/behaviour-general`     | Client | Module settings form                                     |

### Components

- `quick-log-fab.tsx` — FAB on all behaviour pages
- `quick-log-sheet.tsx` — Bottom sheet for quick-log
- `incident-card.tsx` — Incident card component
- `incident-status-badge.tsx` — Status badge
- `student-behaviour-header.tsx` — Student profile header
- `category-picker.tsx` — Category selection grid

---

## Section 6 — Background Jobs

### `behaviour:parent-notification`

Queue: notifications. Trigger: incident creation. Loads incident + participants, checks send-gate, dispatches via comms module, creates acknowledgement records.

### `behaviour:task-reminders`

Queue: behaviour. Trigger: daily cron 08:00 tenant TZ. Finds pending tasks due today, sends reminders. Marks overdue tasks.

---

## Section 7 — Implementation Order

1. Database migrations and seed data (Prisma schema, migration, RLS, sequences, seed)
2. Shared types and Zod schemas (`packages/shared/src/behaviour/`)
3. Backend services (scope → history → config → incidents → quick-log → students → tasks)
4. Backend controllers (config → incidents → students → tasks)
5. Background job processors
6. Frontend pages and components
7. Translations (en + ar)

---

## Section 8 — Files to Create

### Backend

```
apps/api/src/modules/behaviour/
├── behaviour.module.ts
├── behaviour.controller.ts
├── behaviour.service.ts
├── behaviour-students.controller.ts
├── behaviour-students.service.ts
├── behaviour-tasks.controller.ts
├── behaviour-tasks.service.ts
├── behaviour-config.controller.ts
├── behaviour-config.service.ts
├── behaviour-quick-log.service.ts
├── behaviour-history.service.ts
└── behaviour-scope.service.ts
```

### Shared

```
packages/shared/src/behaviour/
├── index.ts
├── data-classification.ts
├── scope.ts
├── enums.ts
└── schemas/
    ├── incident.schema.ts
    ├── participant.schema.ts
    ├── quick-log.schema.ts
    ├── task.schema.ts
    ├── category.schema.ts
    ├── template.schema.ts
    └── settings.schema.ts
```

### Frontend

```
apps/web/src/app/[locale]/(school)/behaviour/
├── page.tsx
├── incidents/
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/page.tsx
├── students/
│   ├── page.tsx
│   └── [studentId]/page.tsx
└── tasks/page.tsx

apps/web/src/app/[locale]/(school)/settings/
├── behaviour-categories/page.tsx
└── behaviour-general/page.tsx

apps/web/src/components/behaviour/
├── quick-log-fab.tsx
├── quick-log-sheet.tsx
├── incident-card.tsx
├── incident-status-badge.tsx
├── student-behaviour-header.tsx
└── category-picker.tsx
```

### Worker

```
apps/worker/src/processors/behaviour/
├── parent-notification.processor.ts
└── task-reminders.processor.ts
```

---

## Section 9 — Files to Modify

| File                                                  | Change                                      |
| ----------------------------------------------------- | ------------------------------------------- |
| `packages/prisma/schema.prisma`                       | Add 20+ enums, 32 models                    |
| `packages/prisma/seed/permissions.ts`                 | Add 12 behaviour + safeguarding permissions |
| `packages/shared/src/index.ts`                        | Export behaviour module                     |
| `packages/shared/src/types/tenant-config.ts`          | Add `TenantSettingsBehaviour` interface     |
| `apps/api/src/app.module.ts`                          | Import `BehaviourModule`                    |
| `apps/web/messages/en.json`                           | Add `behaviour` namespace                   |
| `apps/web/messages/ar.json`                           | Add `behaviour` namespace (Arabic)          |
| `apps/web/src/components/sidebar.tsx` (or equivalent) | Add Behaviour nav item                      |

---

## Section 10 — Key Context for Executor

### Patterns to Follow

- **RLS**: `createRlsClient(prisma, { tenant_id })` → `$transaction(async (tx) => { ... })`
- **Controllers**: `@Controller('v1')`, `@UseGuards(AuthGuard, PermissionGuard)`, `@RequiresPermission('...')`
- **Validation**: `@Body(new ZodValidationPipe(schema))`, schemas in `@school/shared`
- **Pagination**: `{ data: T[], meta: { page, pageSize, total } }`
- **Sequences**: `SequenceService.nextNumber(tenantId, 'behaviour_incident', tx, 'BH')`
- **Frontend**: `apiClient<T>('/api/v1/...')`, `useTranslations('behaviour')`, `@school/ui` components
- **Worker**: Extend `TenantAwareJob`, check `tenant_id`, use RLS-scoped tx

### Gotchas

- `SequenceService.formatNumber` uses prefix arg — pass `'BH'` for incidents
- Frontend paths: `apps/web/src/app/[locale]/(school)/`
- UI imports from `@school/ui` not individual packages
- RTL: only `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-` — NEVER physical `ml-`, `mr-`, etc.
