# Phase C: Sanctions + Exclusions + Appeals — Implementation Plan

## Section 1 — Overview

Phase C delivers the full sanction lifecycle, exclusion case workflow, appeal system, and amendment workflow. It builds on Phase A's database tables and Phase B's policy engine (specifically the `create_sanction` action).

**Dependencies on prior phases:**

- Phase A: All 32 tables including `behaviour_sanctions`, `behaviour_exclusion_cases`, `behaviour_appeals`, `behaviour_amendment_notices`, `behaviour_entity_history`, `behaviour_tasks`, `behaviour_legal_holds`, `behaviour_parent_acknowledgements`
- Phase B: Policy engine's `create_sanction` action in `PolicyEvaluationEngine`, approval module integration
- Established patterns: `BehaviourHistoryService` for entity history, `BehaviourTasksService` for task creation, `SequenceService` for number generation, `school-calendar.ts` for school day calculations

## Section 2 — Database Changes

Phase A created all 4 tables. Phase C adds:

### Schema modifications

1. **Add `superseded` to `SanctionStatus` enum** — needed for reschedule workflow (old sanction → superseded, new sanction created)
2. **Add missing indexes** (not created in Phase A):
   - `behaviour_sanctions`: `(tenant_id, scheduled_date, status)`, `(tenant_id, supervised_by_id, scheduled_date)`, `(tenant_id, type, status)`, partial `(tenant_id, suspension_end_date) WHERE suspension_end_date IS NOT NULL`
   - `behaviour_appeals`: `(tenant_id, incident_id)`, partial `(tenant_id, sanction_id) WHERE sanction_id IS NOT NULL`, `(tenant_id, submitted_at DESC)`
   - `behaviour_exclusion_cases`: partial `(tenant_id, appeal_deadline) WHERE appeal_deadline IS NOT NULL`, `(tenant_id, status, appeal_deadline)`
   - `behaviour_amendment_notices`: partial `(tenant_id, correction_notification_sent) WHERE correction_notification_sent = false`

### RLS policies

All 4 tables already have tenant isolation RLS from Phase A. No changes needed.

## Section 3 — API Endpoints

### Sanctions Controller (14 endpoints)

| Method | Path                          | Permission              | Description              |
| ------ | ----------------------------- | ----------------------- | ------------------------ |
| POST   | /sanctions                    | behaviour.manage        | Create sanction manually |
| GET    | /sanctions                    | behaviour.manage        | List with filters        |
| GET    | /sanctions/:id                | behaviour.manage        | Full detail              |
| PATCH  | /sanctions/:id                | behaviour.manage        | Update fields            |
| PATCH  | /sanctions/:id/status         | behaviour.manage        | Status transition        |
| GET    | /sanctions/today              | behaviour.manage        | Today's sanctions        |
| GET    | /sanctions/my-supervision     | behaviour.view          | My supervised            |
| POST   | /sanctions/:id/parent-meeting | behaviour.manage        | Record meeting           |
| POST   | /sanctions/:id/appeal         | behaviour.manage/appeal | Lodge appeal             |
| PATCH  | /sanctions/:id/appeal-outcome | behaviour.manage        | Record outcome           |
| GET    | /sanctions/calendar           | behaviour.manage        | Calendar view            |
| GET    | /sanctions/active-suspensions | behaviour.manage        | Active suspensions       |
| GET    | /sanctions/returning-soon     | behaviour.manage        | Returning students       |
| POST   | /sanctions/bulk-mark-served   | behaviour.manage        | Bulk mark served         |

### Appeals Controller (10 endpoints)

| Method | Path                                  | Permission                 | Description                       |
| ------ | ------------------------------------- | -------------------------- | --------------------------------- |
| POST   | /appeals                              | behaviour.manage/appeal    | Submit appeal                     |
| GET    | /appeals                              | behaviour.manage           | List with filters                 |
| GET    | /appeals/:id                          | behaviour.manage           | Full detail                       |
| PATCH  | /appeals/:id                          | behaviour.manage           | Update (assign reviewer, hearing) |
| POST   | /appeals/:id/decide                   | behaviour.manage           | Record decision                   |
| POST   | /appeals/:id/withdraw                 | behaviour.manage/appellant | Withdraw                          |
| POST   | /appeals/:id/attachments              | behaviour.manage           | Upload evidence                   |
| GET    | /appeals/:id/attachments              | behaviour.manage           | List evidence                     |
| POST   | /appeals/:id/generate-decision-letter | behaviour.manage           | Generate letter                   |
| GET    | /appeals/:id/evidence-bundle          | behaviour.manage           | Export bundle                     |

### Exclusion Cases Controller (10 endpoints)

| Method | Path                                     | Permission       | Description          |
| ------ | ---------------------------------------- | ---------------- | -------------------- |
| POST   | /exclusion-cases                         | behaviour.manage | Create from sanction |
| GET    | /exclusion-cases                         | behaviour.manage | List with filters    |
| GET    | /exclusion-cases/:id                     | behaviour.manage | Full detail          |
| PATCH  | /exclusion-cases/:id                     | behaviour.manage | Update fields        |
| PATCH  | /exclusion-cases/:id/status              | behaviour.manage | Status transition    |
| POST   | /exclusion-cases/:id/generate-notice     | behaviour.manage | Generate notice      |
| POST   | /exclusion-cases/:id/generate-board-pack | behaviour.manage | Generate board pack  |
| POST   | /exclusion-cases/:id/record-decision     | behaviour.manage | Record decision      |
| GET    | /exclusion-cases/:id/timeline            | behaviour.manage | Statutory timeline   |
| GET    | /exclusion-cases/:id/documents           | behaviour.manage | Case documents       |

### Amendments Controller (4 endpoints)

| Method | Path                            | Permission       | Description         |
| ------ | ------------------------------- | ---------------- | ------------------- |
| GET    | /amendments                     | behaviour.manage | List all            |
| GET    | /amendments/:id                 | behaviour.manage | Detail              |
| POST   | /amendments/:id/send-correction | behaviour.manage | Send correction     |
| GET    | /amendments/pending             | behaviour.manage | Pending corrections |

## Section 4 — Service Layer

### SanctionService (`behaviour-sanctions.service.ts`)

- `create(tenantId, userId, dto)` — manual creation with sequence, approval check, conflict check, exclusion auto-creation
- `createFromPolicy(tenantId, sanctionData)` — policy engine entry point
- `list(tenantId, filters, page, pageSize)` — paginated list
- `getById(tenantId, id)` — full detail with joins
- `update(tenantId, id, dto)` — update mutable fields
- `transitionStatus(tenantId, id, newStatus, reason, userId)` — state machine validated
- `getTodaySanctions(tenantId)` — today grouped by room/time
- `getMySupervision(tenantId, userId)` — my supervised sanctions
- `recordParentMeeting(tenantId, id, dto)` — meeting outcome
- `getCalendarView(tenantId, dateFrom, dateTo)` — date range view
- `getActiveSuspensions(tenantId)` — currently serving
- `getReturningSoon(tenantId)` — ending in 5 school days
- `bulkMarkServed(tenantId, dto)` — bulk transition with partial success
- `checkConflicts(tenantId, studentId, date, startTime, endTime)` — detention conflict check

### ExclusionCaseService (`behaviour-exclusion-cases.service.ts`)

- `createFromSanction(tenantId, sanctionId, tx)` — auto-creation in transaction
- `create(tenantId, dto)` — manual creation
- `list(tenantId, filters, page, pageSize)` — paginated list
- `getById(tenantId, id)` — full detail
- `update(tenantId, id, dto)` — update fields
- `transitionStatus(tenantId, id, newStatus, reason, userId)` — lifecycle transitions
- `generateNotice(tenantId, id)` — queue notice document
- `generateBoardPack(tenantId, id)` — queue board pack
- `recordDecision(tenantId, id, dto)` — record decision, compute appeal deadline
- `getTimeline(tenantId, id)` — statutory timeline with computed statuses
- `getDocuments(tenantId, id)` — all case documents

### AppealService (`behaviour-appeals.service.ts`)

- `submit(tenantId, userId, dto)` — create appeal, transition sanction, set legal hold
- `list(tenantId, filters, page, pageSize)` — paginated list
- `getById(tenantId, id)` — full detail
- `update(tenantId, id, dto)` — assign reviewer, schedule hearing
- `decide(tenantId, id, userId, dto)` — record decision, auto-apply outcomes
- `withdraw(tenantId, id, userId, reason)` — withdraw appeal
- `uploadAttachment(tenantId, id, file)` — upload evidence (stub)
- `getAttachments(tenantId, id)` — list evidence (stub)
- `generateDecisionLetter(tenantId, id)` — queue document (stub)
- `getEvidenceBundle(tenantId, id)` — queue bundle export (stub)

### AmendmentService (`behaviour-amendments.service.ts`)

- `createAmendmentNotice(params)` — detect changes, create notice, check lock
- `list(tenantId, filters, page, pageSize)` — all amendments
- `getById(tenantId, id)` — detail
- `sendCorrection(tenantId, id, userId)` — dispatch notification
- `getPending(tenantId, page, pageSize)` — pending corrections queue

## Section 5 — Frontend Pages

### `/behaviour/sanctions` — Sanction management list

- Filter bar: type, status, date range, student search
- List with inline "Mark Served" action
- Calendar toggle, "Today" shortcut button

### `/behaviour/sanctions/today` — Today's detentions supervisor screen

- Grouped by room/time, per-row status toggle, bulk select + mark served

### `/behaviour/appeals` — Appeal management list

- Status tabs, filter by grounds_category/date/student
- "Assign Reviewer" quick action

### `/behaviour/appeals/[id]` — Appeal detail

- Header, appellant info, status timeline, reviewer assignment
- Hearing scheduling, decision form, evidence, entity history

### `/behaviour/exclusions` — Exclusion case list

- Status tabs, compliance indicator (amber/red for overdue steps)
- Appeal deadline counter

### `/behaviour/exclusions/[id]` — Exclusion case detail

- Statutory timeline checklist, formal notice, hearing, board pack
- Decision form, appeal section, documents, entity history

### `/behaviour/amendments` — Amendment work queue

- Tabs: Pending / All, "Send Correction" action per row

## Section 6 — Background Jobs

### `behaviour:suspension-return`

- Queue: `behaviour`, Trigger: daily cron at 07:00 tenant timezone
- Creates `return_check_in` tasks 3 school days before suspension end
- Idempotent via existing task check

## Section 7 — Implementation Order

1. Database: Prisma schema updates (add `superseded` enum value, add indexes) + migration
2. Shared: Sanction/exclusion/appeal state machines + Zod schemas in packages/shared
3. Services: SanctionService, ExclusionCaseService, AppealService, AmendmentService
4. Controllers: 4 controllers with all 38 endpoints
5. Worker: suspension-return processor
6. Frontend: 7 pages
7. Module wiring: Register all in BehaviourModule

## Section 8 — Files to Create

### packages/shared/src/behaviour/

- `state-machine-sanction.ts` — sanction state machine
- `state-machine-exclusion.ts` — exclusion case state machine
- `state-machine-appeal.ts` — appeal state machine
- `schemas/sanction.schema.ts` — all sanction Zod schemas
- `schemas/exclusion.schema.ts` — all exclusion Zod schemas
- `schemas/appeal.schema.ts` — all appeal Zod schemas
- `schemas/amendment.schema.ts` — all amendment Zod schemas

### apps/api/src/modules/behaviour/

- `behaviour-sanctions.service.ts`
- `behaviour-sanctions.controller.ts`
- `behaviour-exclusion-cases.service.ts`
- `behaviour-exclusions.controller.ts`
- `behaviour-appeals.service.ts`
- `behaviour-appeals.controller.ts`
- `behaviour-amendments.service.ts`
- `behaviour-amendments.controller.ts`

### apps/worker/src/processors/behaviour/

- `suspension-return.processor.ts`

### apps/web/src/app/[locale]/(school)/behaviour/

- `sanctions/page.tsx`
- `sanctions/today/page.tsx`
- `appeals/page.tsx`
- `appeals/[id]/page.tsx`
- `exclusions/page.tsx`
- `exclusions/[id]/page.tsx`
- `amendments/page.tsx`

### packages/prisma/migrations/

- `{timestamp}_phase_c_sanctions_indexes/migration.sql`

## Section 9 — Files to Modify

- `packages/prisma/schema.prisma` — Add `superseded` to SanctionStatus, add indexes
- `packages/shared/src/behaviour/index.ts` — Export new state machines
- `packages/shared/src/behaviour/enums.ts` — Add sanction/exclusion/appeal enum constants
- `packages/shared/src/behaviour/schemas/index.ts` — Export new schemas
- `apps/api/src/modules/behaviour/behaviour.module.ts` — Register new services and controllers
- `apps/api/src/modules/behaviour/behaviour.service.ts` — Wire amendment check into incident update
- `apps/worker/src/worker.module.ts` — Register suspension-return processor
- `architecture/module-blast-radius.md` — Update behaviour module exports
- `architecture/event-job-catalog.md` — Add suspension-return job
- `architecture/state-machines.md` — Add sanction, exclusion, appeal state machines

## Section 10 — Key Context for Executor

### Patterns from prior phases:

- **State machines**: Follow `state-machine.ts` pattern — `Record<string, string[]>` transition map, `isValidTransition()`, `getValidTransitions()`, `isTerminalStatus()`
- **History recording**: Call `BehaviourHistoryService.record()` within transaction for every state change
- **Sequence generation**: `SequenceService.nextNumber(tenantId, type, tx, prefix)` — returns formatted string
- **School day calculation**: Use `addSchoolDays()` from `school-calendar.ts` with closure checker
- **Queue enqueue**: Wrap in try/catch, don't fail the main operation if queue fails
- **Prisma enum mapping**: Use `@map()` for DB values that differ from TypeScript names (e.g., `withdrawn_appeal @map("withdrawn")`)
- **Controller decorators**: `@ModuleEnabled('behaviour')`, `@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)`, `@RequiresPermission('behaviour.manage')`
- **Policy engine integration**: `createFromPolicy()` method called by action dispatcher in `policy-evaluation-engine.ts`

### Gotchas:

- `AppellantType` uses mapped values: `parent_appellant @map("parent")` etc.
- `ExclusionStatus.hearing_scheduled_exc @map("hearing_scheduled")` — disambiguates from AppealStatus.hearing_scheduled
- `AppealOutcome` vs `AppealDecision` — sanction has `appeal_outcome` (upheld/modified_appeal/overturned_appeal), appeal has `decision` (upheld_original/modified/overturned)
- The `SanctionStatus` enum doesn't have `superseded` yet — add via migration
- Amendment notices are append-only (no `updated_at`)
