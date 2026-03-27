# SW-2B: Intervention Plans — Implementation Spec

---
name: Intervention Plans
description: Full intervention plan lifecycle -- creation within cases, continuum-of-support tagging, configurable intervention types, action management with frequency support, append-only progress notes, review cycle reminders, and parent/student involvement tracking.
phase: 2B of 5
dependencies: SW-1D (cases & student chronology), SW-2A (SST meetings -- interventions reference SST meeting context, overdue cron shared)
status: NOT STARTED
---

> **Sub-phase**: SW-2B
> **Depends on**: SW-1D complete (pastoral_cases, pastoral_concerns, pastoral_events, case service working), SW-2A complete (SST meetings, overdue-actions cron operational)
> **Spec source**: master-spec.md v4 -- Section 5 (Intervention plans), database tables (pastoral_interventions, pastoral_intervention_actions, pastoral_intervention_progress), BullMQ jobs table
> **This document is self-contained. No need to open the master spec during implementation.**

---

## What This Sub-Phase Delivers

1. **Intervention plan service** -- create plans linked to cases, with intervention type, continuum level, target outcomes, review schedule, and status lifecycle
2. **Configurable intervention types** from tenant settings with sensible defaults
3. **Continuum of support mapping** -- Level 1 (whole-school), Level 2 (school support), Level 3 (school support plus) tag on each intervention
4. **Review cycle management** -- auto-calculate `next_review_date`, advance it after each review
5. **Parent involvement tracking** -- informed, consented, input recorded fields
6. **Student voice capture** -- age-appropriate documentation of student's perspective
7. **Intervention action service** -- CRUD for actions within plans, with frequency support and full status lifecycle
8. **Append-only progress notes** -- immutable progress recording via `pastoral_intervention_progress` (INSERT-only, trigger-enforced)
9. **Intervention review reminders** -- BullMQ job 7 days before `next_review_date`, reminder to case owner + SST
10. **Immutable audit events** for all intervention operations via `pastoral_events`

---

## Prerequisites

Before beginning SW-2B, verify the following are complete:

- [ ] `pastoral_cases` table exists with RLS, case service working (CRUD, status transitions, case_id available for FK)
- [ ] `pastoral_concerns` table exists with RLS, concern service working
- [ ] `pastoral_events` table exists (append-only, immutability trigger verified), `PastoralEventService` INSERT working
- [ ] `pastoral_interventions`, `pastoral_intervention_actions`, `pastoral_intervention_progress` tables exist in Prisma schema with RLS policies (created in SW-1A)
- [ ] Immutability trigger `trg_immutable_intervention_progress` is applied to `pastoral_intervention_progress`
- [ ] `tenant_settings.pastoral.intervention_types` configuration key is defined in the Zod schema with defaults
- [ ] Permission `pastoral.manage_interventions` is registered in the RBAC system
- [ ] SST services from SW-2A are operational (needed for review reminders to SST members)
- [ ] `pastoral:overdue-actions` daily cron from SW-2A is operational and already handles `pastoral_intervention_actions` (the query exists but returns zero rows until SW-2B creates data)
- [ ] BullMQ producer is available in the API app; `notifications` and `pastoral` queues are registered
- [ ] `TenantAwareJob` base class is working in the worker service

---

## Database Tables (Reference)

All tables were created in SW-1A. Reproduced here for implementer reference.

### pastoral_interventions

Intervention plans created within a case.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `case_id` | UUID NOT NULL FK -> pastoral_cases(id) | |
| `student_id` | UUID NOT NULL FK -> students(id) | |
| `intervention_type` | VARCHAR(50) NOT NULL | From `tenant_settings.pastoral.intervention_types` |
| `continuum_level` | SMALLINT NOT NULL | 1 (whole-school), 2 (school support), 3 (school support plus) |
| `target_outcomes` | JSONB NOT NULL | `[{description: string, measurable_target: string}]` |
| `review_cycle_weeks` | INTEGER NOT NULL DEFAULT 6 | |
| `next_review_date` | DATE NOT NULL | |
| `parent_informed` | BOOLEAN NOT NULL DEFAULT false | |
| `parent_consented` | BOOLEAN | NULL = not yet asked |
| `parent_input` | TEXT | |
| `student_voice` | TEXT | |
| `status` | VARCHAR(20) NOT NULL DEFAULT 'active' | 'active', 'achieved', 'partially_achieved', 'not_achieved', 'escalated', 'withdrawn' |
| `outcome_notes` | TEXT | |
| `created_by_user_id` | UUID NOT NULL FK -> users(id) | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Constraints:**
- `CHECK (continuum_level IN (1, 2, 3))`
- `CHECK (status IN ('active', 'achieved', 'partially_achieved', 'not_achieved', 'escalated', 'withdrawn'))`
- RLS: `tenant_id = current_setting('app.current_tenant_id')::uuid`
- Index: `(tenant_id, case_id)` -- for case-scoped intervention queries
- Index: `(tenant_id, student_id, status)` -- for student-scoped active intervention queries
- Index: `(tenant_id, next_review_date)` -- for review reminder queries and SST agenda generation
- Index: `(tenant_id, status, continuum_level)` -- for continuum-level reporting

### pastoral_intervention_actions

Actions assigned within an intervention plan.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `intervention_id` | UUID NOT NULL FK -> pastoral_interventions(id) | |
| `description` | TEXT NOT NULL | |
| `assigned_to_user_id` | UUID NOT NULL FK -> users(id) | |
| `frequency` | VARCHAR(50) | 'once', 'daily', 'weekly', 'fortnightly', 'as_needed' |
| `start_date` | DATE NOT NULL | |
| `due_date` | DATE | NULL for ongoing/recurring actions with no fixed end |
| `completed_at` | TIMESTAMPTZ | |
| `completed_by_user_id` | UUID FK -> users(id) | |
| `status` | VARCHAR(20) NOT NULL DEFAULT 'pending' | 'pending', 'in_progress', 'completed', 'overdue', 'cancelled' |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Constraints:**
- `CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue', 'cancelled'))`
- RLS: `tenant_id = current_setting('app.current_tenant_id')::uuid`
- Index: `(tenant_id, intervention_id)` -- for intervention-scoped action queries
- Index: `(tenant_id, assigned_to_user_id, status)` -- for "my actions" queries
- Index: `(tenant_id, status, due_date)` -- for overdue detection cron (shared with SW-2A)

### pastoral_intervention_progress (append-only)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `intervention_id` | UUID NOT NULL FK -> pastoral_interventions(id) | |
| `note` | TEXT NOT NULL | |
| `recorded_by_user_id` | UUID NOT NULL FK -> users(id) | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Constraints:**
- RLS: `tenant_id = current_setting('app.current_tenant_id')::uuid`
- **Immutability trigger:** `trg_immutable_intervention_progress` prevents UPDATE/DELETE at PostgreSQL level
- **No `updated_at` column.** Append-only.
- Index: `(tenant_id, intervention_id, created_at DESC)` -- for chronological progress listing

---

## State Machines

### Intervention Plan Lifecycle

```
active -> achieved              (all target outcomes met)
active -> partially_achieved    (some targets met, plan concluding)
active -> not_achieved          (targets not met, plan concluding without escalation)
active -> escalated             (student needs higher-level support -- triggers case status review)
active -> withdrawn             (plan no longer appropriate -- student left, situation changed)

TERMINAL: achieved, partially_achieved, not_achieved, escalated, withdrawn

NOTES:
- Only 'active' interventions can transition. Terminal statuses are final.
- When status changes to 'escalated', the service should flag the linked case
  for SST review (update case.next_review_date to today if it's in the future).
- When status changes to any terminal status, outcome_notes is required.
- Active interventions can be updated (target_outcomes, review_cycle_weeks, parent fields, student_voice).
- Terminal interventions are read-only (no field updates except via append-only progress notes).
```

Each transition generates a `pastoral_events` entry:
- `intervention_status_changed`: `{intervention_id, old_status, new_status, outcome_notes}`

### Intervention Action Lifecycle

```
pending -> in_progress          (assignee starts working on it)
pending -> completed            (assignee completes immediately)
pending -> cancelled            (action no longer needed)
pending -> overdue              (daily cron: due_date < today AND due_date IS NOT NULL)

in_progress -> completed        (assignee finishes)
in_progress -> cancelled        (action no longer needed)
in_progress -> overdue          (daily cron: due_date < today AND due_date IS NOT NULL)

overdue -> in_progress          (assignee resumes overdue action)
overdue -> completed            (assignee completes overdue action)
overdue -> cancelled            (action abandoned)

TERMINAL: completed, cancelled

FREQUENCY NOTE:
- Actions with frequency != 'once' and due_date = NULL are ongoing.
  They are not subject to the overdue cron (no due_date to compare against).
  They can only transition to 'completed' or 'cancelled' manually.
- Actions with frequency = 'once' must have a due_date.
```

Each transition generates a `pastoral_events` entry:
- `action_assigned`: `{action_id, source: 'intervention', intervention_id, assigned_to_user_id, description, due_date}`
- `action_completed`: `{action_id, completed_by_user_id}`
- `action_overdue`: `{action_id, assigned_to_user_id, due_date, days_overdue}`

---

## API Endpoints

### Intervention Plans

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/api/pastoral/interventions` | `pastoral.manage_interventions` | List interventions (paginated, filterable by case, student, status, continuum_level) |
| `GET` | `/api/pastoral/interventions/:id` | `pastoral.manage_interventions` | Get intervention detail (with actions and recent progress) |
| `GET` | `/api/pastoral/cases/:caseId/interventions` | `pastoral.manage_interventions` | List interventions for a specific case |
| `GET` | `/api/pastoral/students/:studentId/interventions` | `pastoral.manage_interventions` | List interventions for a specific student |
| `POST` | `/api/pastoral/interventions` | `pastoral.manage_interventions` | Create an intervention plan (linked to a case) |
| `PATCH` | `/api/pastoral/interventions/:id` | `pastoral.manage_interventions` | Update intervention fields (only when status = 'active') |
| `PATCH` | `/api/pastoral/interventions/:id/status` | `pastoral.manage_interventions` | Change intervention status (state machine enforced) |
| `POST` | `/api/pastoral/interventions/:id/review` | `pastoral.manage_interventions` | Record a review (advances next_review_date) |

### Intervention Actions

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/api/pastoral/interventions/:id/actions` | `pastoral.manage_interventions` | List actions for an intervention |
| `GET` | `/api/pastoral/intervention-actions` | `pastoral.manage_interventions` | List all intervention actions (paginated, filterable by status/assignee) |
| `GET` | `/api/pastoral/intervention-actions/my` | `pastoral.manage_interventions` | List actions assigned to current user |
| `POST` | `/api/pastoral/interventions/:id/actions` | `pastoral.manage_interventions` | Create an action within an intervention plan |
| `PATCH` | `/api/pastoral/intervention-actions/:id` | `pastoral.manage_interventions` | Update action (status transition, description, due_date) |
| `PATCH` | `/api/pastoral/intervention-actions/:id/complete` | `pastoral.manage_interventions` | Mark action as completed |

### Intervention Progress (Append-Only)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/api/pastoral/interventions/:id/progress` | `pastoral.manage_interventions` | List progress notes for an intervention (chronological) |
| `POST` | `/api/pastoral/interventions/:id/progress` | `pastoral.manage_interventions` | Add a progress note (INSERT-only, immutable) |

### Intervention Types (Tenant Settings)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/api/pastoral/settings/intervention-types` | `pastoral.manage_interventions` | List configured intervention types for the tenant |

**Note:** Intervention types are managed via the existing tenant settings endpoints. This GET endpoint is a convenience wrapper that returns `tenant_settings.pastoral.intervention_types` directly.

---

## Service Method Signatures

### InterventionService (`intervention.service.ts`)

```typescript
// CRUD
createIntervention(
  tenantId: string,
  data: CreateInterventionDto,
  actorUserId: string,
): Promise<PastoralIntervention>

getIntervention(
  tenantId: string,
  interventionId: string,
): Promise<InterventionWithDetails>

listInterventions(
  tenantId: string,
  filter: InterventionFilterDto,
): Promise<PaginatedResult<PastoralIntervention>>

listInterventionsForCase(
  tenantId: string,
  caseId: string,
): Promise<PastoralIntervention[]>

listInterventionsForStudent(
  tenantId: string,
  studentId: string,
  filter?: { status?: string; continuum_level?: number },
): Promise<PastoralIntervention[]>

// Update (only when status = 'active')
updateIntervention(
  tenantId: string,
  interventionId: string,
  data: UpdateInterventionDto,
  actorUserId: string,
): Promise<PastoralIntervention>

// Status transitions
changeStatus(
  tenantId: string,
  interventionId: string,
  data: ChangeInterventionStatusDto,
  actorUserId: string,
): Promise<PastoralIntervention>

// Review cycle
recordReview(
  tenantId: string,
  interventionId: string,
  data: RecordReviewDto,
  actorUserId: string,
): Promise<PastoralIntervention>

// Intervention types from tenant settings
getInterventionTypes(tenantId: string): Promise<InterventionType[]>

// Edit lockout check
assertInterventionEditable(intervention: PastoralIntervention): void  // throws if not 'active'
```

**`createIntervention` implementation notes:**
- Validates `case_id` exists and is in status 'open' or 'active'
- Validates `intervention_type` against `tenant_settings.pastoral.intervention_types`
- Validates `continuum_level` is 1, 2, or 3
- Validates `target_outcomes` JSONB against Zod schema (at least one outcome required)
- Calculates `next_review_date = created_at + review_cycle_weeks * 7 days`
- Enqueues `pastoral:intervention-review-reminder` delayed BullMQ job for 7 days before `next_review_date`
- Emits `pastoral_events` entry: `intervention_created`

**`changeStatus` implementation notes:**
- Validates state machine transition (only from 'active' to terminal states)
- Requires `outcome_notes` for all terminal transitions
- When status = 'escalated': updates the linked case's `next_review_date` to today (triggers SST review)
- Emits `pastoral_events` entry: `intervention_status_changed`
- Cancels any pending `pastoral:intervention-review-reminder` job for this intervention

**`recordReview` implementation notes:**
- Only valid when `status = 'active'`
- Advances `next_review_date` by `review_cycle_weeks` weeks from today
- Enqueues new `pastoral:intervention-review-reminder` delayed job for 7 days before the new `next_review_date`
- Accepts optional `review_notes` (written as a progress note via the append-only progress service)
- Emits `pastoral_events` entry: `intervention_updated` with `{changed_fields: ['next_review_date']}`

### InterventionActionService (`intervention-action.service.ts`)

```typescript
// CRUD
createAction(
  tenantId: string,
  interventionId: string,
  data: CreateInterventionActionDto,
  actorUserId: string,
): Promise<PastoralInterventionAction>

updateAction(
  tenantId: string,
  actionId: string,
  data: UpdateInterventionActionDto,
  actorUserId: string,
): Promise<PastoralInterventionAction>

completeAction(
  tenantId: string,
  actionId: string,
  actorUserId: string,
): Promise<PastoralInterventionAction>

listActionsForIntervention(
  tenantId: string,
  interventionId: string,
): Promise<PastoralInterventionAction[]>

listAllActions(
  tenantId: string,
  filter: InterventionActionFilterDto,
): Promise<PaginatedResult<PastoralInterventionAction>>

listMyActions(
  tenantId: string,
  userId: string,
  filter?: InterventionActionFilterDto,
): Promise<PaginatedResult<PastoralInterventionAction>>
```

**`createAction` implementation notes:**
- Validates that the parent intervention is in status 'active'
- If `frequency = 'once'`, `due_date` is required
- If `frequency != 'once'`, `due_date` is optional (ongoing actions may not have a fixed end)
- Emits `pastoral_events` entry: `action_assigned` with `source: 'intervention'`

**Overdue detection:** Handled by the shared `pastoral:overdue-actions` cron from SW-2A. That job queries `pastoral_intervention_actions` WHERE `status IN ('pending', 'in_progress')` AND `due_date IS NOT NULL` AND `due_date < today`.

### InterventionProgressService (append-only, could be inline in `intervention.service.ts`)

```typescript
// Append-only progress notes
addProgressNote(
  tenantId: string,
  interventionId: string,
  data: AddProgressNoteDto,
  actorUserId: string,
): Promise<PastoralInterventionProgress>

listProgressNotes(
  tenantId: string,
  interventionId: string,
): Promise<PastoralInterventionProgress[]>
```

**`addProgressNote` implementation notes:**
- Validates that the parent intervention exists (does NOT require status = 'active' -- progress notes can be added to terminal interventions as post-hoc documentation)
- INSERT only -- the immutability trigger prevents any UPDATE or DELETE
- Emits `pastoral_events` entry: `intervention_progress_added` (new event type, see audit events section)

---

## Zod Schemas

All schemas defined in `packages/shared/src/pastoral/schemas/intervention.schema.ts`.

```typescript
// --- Target Outcomes JSONB ---
export const targetOutcomeSchema = z.object({
  description: z.string().min(1),
  measurable_target: z.string().min(1),
});

export const targetOutcomesSchema = z.array(targetOutcomeSchema).min(1);

// --- Intervention CRUD ---
export const createInterventionSchema = z.object({
  case_id: z.string().uuid(),
  student_id: z.string().uuid(),
  intervention_type: z.string().min(1).max(50),
  continuum_level: z.number().int().min(1).max(3),
  target_outcomes: targetOutcomesSchema,
  review_cycle_weeks: z.number().int().min(1).max(52).default(6),
  parent_informed: z.boolean().default(false),
  parent_consented: z.boolean().nullable().optional(),
  parent_input: z.string().optional(),
  student_voice: z.string().optional(),
});
export type CreateInterventionDto = z.infer<typeof createInterventionSchema>;

export const updateInterventionSchema = z.object({
  intervention_type: z.string().min(1).max(50).optional(),
  continuum_level: z.number().int().min(1).max(3).optional(),
  target_outcomes: targetOutcomesSchema.optional(),
  review_cycle_weeks: z.number().int().min(1).max(52).optional(),
  parent_informed: z.boolean().optional(),
  parent_consented: z.boolean().nullable().optional(),
  parent_input: z.string().optional(),
  student_voice: z.string().optional(),
});
export type UpdateInterventionDto = z.infer<typeof updateInterventionSchema>;

export const changeInterventionStatusSchema = z.object({
  status: z.enum(['achieved', 'partially_achieved', 'not_achieved', 'escalated', 'withdrawn']),
  outcome_notes: z.string().min(1),
});
export type ChangeInterventionStatusDto = z.infer<typeof changeInterventionStatusSchema>;

export const recordReviewSchema = z.object({
  review_notes: z.string().optional(),
});
export type RecordReviewDto = z.infer<typeof recordReviewSchema>;

export const interventionFilterSchema = z.object({
  case_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  status: z.enum(['active', 'achieved', 'partially_achieved', 'not_achieved', 'escalated', 'withdrawn']).optional(),
  continuum_level: z.coerce.number().int().min(1).max(3).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type InterventionFilterDto = z.infer<typeof interventionFilterSchema>;

// --- Intervention Actions ---
export const createInterventionActionSchema = z.object({
  description: z.string().min(1),
  assigned_to_user_id: z.string().uuid(),
  frequency: z.enum(['once', 'daily', 'weekly', 'fortnightly', 'as_needed']).default('once'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine(
  (data) => data.frequency !== 'once' || data.due_date !== undefined,
  { message: 'due_date is required when frequency is "once"', path: ['due_date'] },
);
export type CreateInterventionActionDto = z.infer<typeof createInterventionActionSchema>;

export const updateInterventionActionSchema = z.object({
  description: z.string().min(1).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type UpdateInterventionActionDto = z.infer<typeof updateInterventionActionSchema>;

export const interventionActionFilterSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue', 'cancelled']).optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type InterventionActionFilterDto = z.infer<typeof interventionActionFilterSchema>;

// --- Progress Notes ---
export const addProgressNoteSchema = z.object({
  note: z.string().min(1),
});
export type AddProgressNoteDto = z.infer<typeof addProgressNoteSchema>;

// --- Intervention Type (from tenant settings) ---
export const interventionTypeSchema = z.object({
  key: z.string(),
  label: z.string(),
  active: z.boolean().default(true),
});
export type InterventionType = z.infer<typeof interventionTypeSchema>;
```

---

## Default Intervention Types (Tenant Settings Seed)

These are the defaults for `tenant_settings.pastoral.intervention_types`. Schools can add, rename, or deactivate types.

```typescript
const DEFAULT_INTERVENTION_TYPES = [
  { key: 'academic_support', label: 'Academic Support', active: true },
  { key: 'behavioural_support', label: 'Behavioural Support', active: true },
  { key: 'social_emotional', label: 'Social-Emotional Support', active: true },
  { key: 'attendance_support', label: 'Attendance Support', active: true },
  { key: 'external_referral', label: 'External Referral', active: true },
  { key: 'reasonable_accommodation', label: 'Reasonable Accommodation', active: true },
  { key: 'safety_plan', label: 'Safety Plan', active: true },
];
```

---

## BullMQ Jobs

### `pastoral:intervention-review-reminder`

| Property | Value |
|----------|-------|
| Queue | `notifications` |
| Trigger | Delayed job enqueued when an intervention is created or reviewed. Delay = `next_review_date - 7 days` |
| Payload | `{ tenant_id: string, user_id: string, intervention_id: string, case_id: string, student_id: string, next_review_date: string }` |
| Processor | `InterventionReviewReminderProcessor` in `apps/worker/` |
| Idempotency | Job ID = `intervention-review-${intervention_id}-${next_review_date}` -- prevents duplicate reminders if the review date hasn't changed |
| Retry | 2 retries with exponential backoff |
| Cancellation | When intervention status changes to a terminal state, remove the pending delayed job |

**Processor logic:**
1. Extend `TenantAwareJob`
2. Load the intervention; verify `status = 'active'` (if terminal, skip silently)
3. Verify `next_review_date` matches the payload (if it's been advanced by a review, skip -- a new job exists for the new date)
4. Load the case owner (`pastoral_cases.owner_user_id`)
5. Load active SST members (`sst_members` WHERE `active = true`)
6. Send in-app notification to case owner: "Intervention review due in 7 days for [student name] - [intervention type]"
7. Send in-app notification to all active SST members with the same message
8. Send email notification to case owner (via existing communications infrastructure)
9. Emit `pastoral_events` entry with event_type `intervention_review_reminder_sent`

### Shared: `pastoral:overdue-actions` (defined in SW-2A)

The daily cron from SW-2A already queries `pastoral_intervention_actions`. No additional job definition is needed. When SW-2B ships, the existing cron will start finding intervention actions to mark as overdue.

---

## Audit Events

All events are written to `pastoral_events` via `PastoralEventService` (append-only, immutability trigger enforced).

| event_type | entity_type | payload |
|------------|-------------|---------|
| `intervention_created` | `intervention` | `{intervention_id, case_id, student_id, type: intervention_type, continuum_level, target_outcomes, review_cycle_weeks, next_review_date, created_by_user_id}` |
| `intervention_updated` | `intervention` | `{intervention_id, previous_snapshot: JSONB, changed_fields: string[]}` |
| `intervention_status_changed` | `intervention` | `{intervention_id, old_status, new_status, outcome_notes}` |
| `intervention_reviewed` | `intervention` | `{intervention_id, old_next_review_date, new_next_review_date, review_notes?}` |
| `intervention_progress_added` | `intervention` | `{intervention_id, progress_id, recorded_by_user_id, note_preview: string}` |
| `action_assigned` | `intervention` | `{action_id, source: 'intervention', intervention_id, assigned_to_user_id, description, frequency, due_date}` |
| `action_completed` | `intervention` | `{action_id, completed_by_user_id}` |
| `action_overdue` | `intervention` | `{action_id, assigned_to_user_id, due_date, days_overdue}` |
| `intervention_review_reminder_sent` | `intervention` | `{intervention_id, case_id, next_review_date, recipients_count}` |

**Note on `note_preview`:** The `intervention_progress_added` event payload includes a truncated preview of the note (first 100 characters) for audit readability. The full note lives in `pastoral_intervention_progress`.

**Note on `intervention_updated`:** The `previous_snapshot` captures the full state of all mutable fields before the update, matching the pattern from the master spec's `intervention_updated` event.

---

## Controller Implementation Notes

### InterventionsController (`interventions.controller.ts`)

Located at `apps/api/src/modules/pastoral/controllers/interventions.controller.ts`.

- Thin controller pattern: validate input with Zod -> call service -> return response
- All endpoints require `@RequiresPermission('pastoral.manage_interventions')`
- Update and status-change endpoints check `assertInterventionEditable()` before allowing mutations
- Status-change endpoint validates state machine transitions
- Progress note POST validates that the intervention exists (no status check -- progress notes are always allowed)

### Response Shapes

**Intervention detail response** (GET `/:id`):
```typescript
{
  ...intervention,
  actions: PastoralInterventionAction[],       // all actions for this intervention
  recent_progress: PastoralInterventionProgress[], // last 10 progress notes
  case: { id, case_number, status },           // linked case summary
  student: { id, name },                       // student summary
}
```

**Intervention list response:**
```typescript
{
  data: PastoralIntervention[],
  meta: { page, pageSize, total }
}
```

### Pagination

All list endpoints use the standard EduPod pagination pattern:
```typescript
{ data: T[], meta: { page: number, pageSize: number, total: number } }
```

---

## Continuum of Support Mapping

Each intervention is tagged with a `continuum_level` matching the DES Wellbeing Framework:

| Level | Name | Description | Examples |
|-------|------|-------------|----------|
| 1 | Whole-school / classroom | Universal support available to all students | Classroom strategies, differentiation, SPHE programmes |
| 2 | School support | Targeted support for students identified as needing additional help | Small group interventions, learning support, check-in/check-out |
| 3 | School support plus | Intensive, individualised, multi-agency support | NEPS involvement, CAMHS referral, individualised behaviour plan, safety plan |

**NEPS referral significance:** NEPS requires documented evidence that Level 1 and Level 2 interventions were attempted before accepting a Level 3 referral. The `continuum_level` field on each intervention enables Phase 3 (SW-3A: NEPS Referrals) to auto-populate the referral form with "interventions attempted" evidence, filtered and grouped by continuum level.

---

## Escalation Side Effects

When an intervention's status changes to `escalated`:

1. The linked case's `next_review_date` is set to today (or left as-is if already in the past)
2. A `case_status_changed` event is NOT emitted (the case status itself doesn't change -- only the review urgency)
3. The escalation surfaces automatically in the next SST meeting agenda via the `auto_case_review` source (cases where `next_review_date <= meeting.scheduled_at`)
4. If the case is in status 'monitoring', the SST should consider moving it back to 'active' -- this is a human decision, not automated

---

## Test Requirements

### Unit Tests

| Test file | Coverage |
|-----------|----------|
| `intervention.service.spec.ts` | Create, update, status transitions (all valid + all blocked), review cycle advancement, escalation side effects, edit lockout on terminal status, intervention type validation against tenant settings |
| `intervention-action.service.spec.ts` | Create with frequency validation (once requires due_date), status transitions (all valid + all blocked), ongoing actions without due_date not marked overdue |
| `intervention-progress.service.spec.ts` | Add note (success), verify append-only (no update/delete via Prisma), list chronological order |

### Integration Tests

| Test | Description |
|------|-------------|
| Intervention full lifecycle | Create intervention on a case, add actions, add progress notes, record review (verify next_review_date advances), change status to 'achieved' with outcome_notes |
| Intervention escalation | Create intervention, change status to 'escalated', verify linked case's next_review_date set to today |
| Edit lockout on terminal | Change intervention to 'achieved', attempt PATCH update, verify 409 |
| Progress note immutability | Add progress note, attempt to update via raw Prisma call, verify trigger rejects UPDATE |
| Review cycle | Create intervention (6-week cycle), record review, verify next_review_date = today + 42 days |
| Action frequency validation | Create action with frequency='once' without due_date, verify 400 validation error |
| Action frequency ongoing | Create action with frequency='weekly' without due_date, verify success, verify not marked overdue by cron |
| Intervention types from tenant settings | Verify GET endpoint returns configured types, verify create rejects unknown type |
| Continuum level filtering | Create interventions at levels 1, 2, 3, filter by continuum_level, verify correct results |

### RLS Leakage Tests

| Test | Description |
|------|-------------|
| Interventions tenant isolation | Create intervention as Tenant A, query as Tenant B, verify empty result |
| Actions tenant isolation | Create intervention action as Tenant A, query as Tenant B, verify empty result |
| Progress notes tenant isolation | Create progress note as Tenant A, query as Tenant B, verify empty result |

### Permission Tests

| Test | Description |
|------|-------------|
| All endpoints require `pastoral.manage_interventions` | Attempt CRUD without permission, verify 403 |
| Progress note creation requires `pastoral.manage_interventions` | Attempt POST without permission, verify 403 |

### BullMQ Job Tests

| Test | Description |
|------|-------------|
| Review reminder fires at correct time | Create intervention, verify delayed job enqueued with correct delay |
| Review reminder skips terminal interventions | Create intervention, change to 'achieved', fire reminder job, verify no notification sent |
| Review reminder skips if next_review_date changed | Create intervention, record review (advances date), fire old reminder job, verify no notification sent |
| Reminder cancelled on terminal status | Change intervention to 'withdrawn', verify pending reminder job removed |

---

## Verification Checklist

Before marking SW-2B as complete:

- [ ] Intervention plan CRUD works (create, update, list by case, list by student, get detail)
- [ ] Intervention type validation against `tenant_settings.pastoral.intervention_types` works
- [ ] Continuum level (1, 2, 3) is validated and stored correctly
- [ ] Target outcomes JSONB validated (at least one outcome, each with description + measurable_target)
- [ ] `next_review_date` is auto-calculated from `review_cycle_weeks` on creation
- [ ] Review cycle advances `next_review_date` correctly on `recordReview()`
- [ ] All status transitions follow the state machine (active -> terminal only, blocked transitions throw)
- [ ] `outcome_notes` is required for all terminal status transitions
- [ ] Escalation sets linked case's `next_review_date` to today
- [ ] Edit lockout prevents PATCH on terminal interventions (409)
- [ ] Parent involvement fields (informed, consented, input) are stored and updateable
- [ ] Student voice field is stored and updateable
- [ ] Intervention actions CRUD works with full state machine
- [ ] Frequency validation enforces `due_date` required when `frequency = 'once'`
- [ ] Ongoing actions (`frequency != 'once'`, `due_date = NULL`) are not marked overdue by cron
- [ ] Progress notes are append-only (INSERT succeeds, UPDATE/DELETE blocked by trigger)
- [ ] Progress notes can be added to terminal interventions
- [ ] BullMQ `pastoral:intervention-review-reminder` fires 7 days before `next_review_date`
- [ ] Reminder sends to case owner + active SST members
- [ ] Reminder is cancelled when intervention reaches terminal status
- [ ] Reminder is idempotent (skips if intervention is terminal or date has changed)
- [ ] All mutations generate `pastoral_events` audit entries
- [ ] All RLS leakage tests pass (3 tests: interventions, actions, progress notes)
- [ ] All permission tests pass (`pastoral.manage_interventions`)
- [ ] `turbo test` passes with zero regressions
- [ ] `turbo lint` and `turbo type-check` pass

---

## Files Created / Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/shared/src/pastoral/schemas/intervention.schema.ts` | CREATE | Zod schemas for interventions, actions, progress notes, target outcomes |
| `packages/shared/src/pastoral/schemas/index.ts` | MODIFY | Re-export intervention schemas |
| `apps/api/src/modules/pastoral/services/intervention.service.ts` | CREATE | Intervention plan lifecycle service |
| `apps/api/src/modules/pastoral/services/intervention-action.service.ts` | CREATE | Intervention action CRUD + state machine |
| `apps/api/src/modules/pastoral/controllers/interventions.controller.ts` | CREATE | Endpoints for interventions, actions, progress |
| `apps/api/src/modules/pastoral/pastoral.module.ts` | MODIFY | Register intervention services and controller |
| `apps/worker/src/processors/pastoral/intervention-review-reminder.processor.ts` | CREATE | BullMQ processor for review reminders |
| `apps/worker/src/worker.module.ts` | MODIFY | Register intervention review reminder processor |
| `apps/api/src/modules/pastoral/services/intervention.service.spec.ts` | CREATE | Unit tests for intervention lifecycle |
| `apps/api/src/modules/pastoral/services/intervention-action.service.spec.ts` | CREATE | Unit tests for intervention actions |
| `apps/api/test/pastoral/interventions.integration.spec.ts` | CREATE | Integration tests for intervention endpoints |
| `architecture/event-job-catalog.md` | MODIFY | Add pastoral:intervention-review-reminder job |
| `architecture/state-machines.md` | MODIFY | Add intervention lifecycle and intervention action lifecycle |
| `architecture/module-blast-radius.md` | MODIFY | Add intervention service dependencies (case service, SST service) |
