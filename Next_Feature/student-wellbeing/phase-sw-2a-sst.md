# SW-2A: SST & Meeting Management — Implementation Spec

---
name: SST & Meeting Management
description: SST roster CRUD, meeting lifecycle, hybrid agenda generation (BullMQ pre-compute + on-demand refresh), meeting actions with overdue tracking, meeting minutes, and daily overdue-actions cron.
phase: 2A of 5
dependencies: SW-1D (cases & student chronology)
status: NOT STARTED
---

> **Sub-phase**: SW-2A
> **Depends on**: SW-1D complete (pastoral_cases, pastoral_concerns, pastoral_events, case service, concern service all working)
> **Spec source**: master-spec.md v4 -- Section 4 (SST case management), BullMQ jobs table, database tables (sst_members, sst_meetings, sst_meeting_agenda_items, sst_meeting_actions)
> **This document is self-contained. No need to open the master spec during implementation.**

---

## What This Sub-Phase Delivers

1. **SST roster management** -- add/remove/update/toggle SST members, with automatic Tier 1+2 access assurance
2. **Meeting lifecycle** -- create, start, complete, cancel meetings with attendee tracking
3. **Hybrid agenda generation** -- BullMQ pre-compute job (30 min before meeting) + manual refresh endpoint, querying 6 sources
4. **Manual agenda items** -- staff can add items not covered by auto-generation
5. **Meeting minutes** -- per-agenda-item discussion notes and decisions, plus meeting-level general notes, with edit lockout on completion
6. **Meeting actions** -- create actions from agenda items, assign to staff with due dates, track lifecycle
7. **Daily overdue-actions cron** -- marks overdue actions across both SST meeting actions and intervention actions (shared job)
8. **Immutable audit events** for all SST operations via `pastoral_events`

---

## Prerequisites

Before beginning SW-2A, verify the following are complete:

- [ ] `pastoral_cases` table exists with RLS, case lifecycle service is working (CRUD, status transitions)
- [ ] `pastoral_concerns` table exists with RLS (tiered access), concern service is working
- [ ] `pastoral_events` table exists (append-only, immutability trigger verified), `PastoralEventService` INSERT working
- [ ] `sst_members`, `sst_meetings`, `sst_meeting_agenda_items`, `sst_meeting_actions` tables exist in Prisma schema with RLS policies (created in SW-1A)
- [ ] `tenant_settings.pastoral.sst` configuration keys are defined in the Zod schema (`meeting_frequency`, `auto_agenda_sources`, `precompute_minutes_before`)
- [ ] Permissions `pastoral.manage_sst` and `pastoral.view_tier2` are registered in the RBAC system
- [ ] `SequenceService` is available
- [ ] BullMQ producer is available in the API app; `pastoral` queue is registered
- [ ] `TenantAwareJob` base class is working in the worker service

---

## Database Tables (Reference)

All tables were created in SW-1A. Reproduced here for implementer reference.

### sst_members

SST roster. Separate from RBAC roles because SST membership is pastoral-specific.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `user_id` | UUID NOT NULL FK -> users(id) | |
| `role_description` | VARCHAR(100) | e.g. 'Year Head - 1st Year', 'Guidance Counsellor', 'SENCO' |
| `active` | BOOLEAN NOT NULL DEFAULT true | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Constraints:**
- `UNIQUE (tenant_id, user_id)`
- RLS: `tenant_id = current_setting('app.current_tenant_id')::uuid`

### sst_meetings

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `scheduled_at` | TIMESTAMPTZ NOT NULL | |
| `status` | VARCHAR(20) NOT NULL DEFAULT 'scheduled' | 'scheduled', 'in_progress', 'completed', 'cancelled' |
| `attendees` | JSONB | `[{user_id, name, present: bool}]` |
| `general_notes` | TEXT | |
| `agenda_precomputed_at` | TIMESTAMPTZ | When the BullMQ pre-compute job last ran |
| `created_by_user_id` | UUID NOT NULL FK -> users(id) | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Constraints:**
- RLS: `tenant_id = current_setting('app.current_tenant_id')::uuid`
- Index: `(tenant_id, scheduled_at DESC)` -- for meeting list queries
- Index: `(tenant_id, status)` -- for filtering by status

### sst_meeting_agenda_items

Auto-generated + manual items.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `meeting_id` | UUID NOT NULL FK -> sst_meetings(id) | |
| `source` | VARCHAR(30) NOT NULL | 'auto_new_concern', 'auto_case_review', 'auto_overdue_action', 'auto_early_warning', 'auto_neps', 'auto_intervention_review', 'manual' |
| `student_id` | UUID FK -> students(id) | |
| `case_id` | UUID FK -> pastoral_cases(id) | |
| `concern_id` | UUID FK -> pastoral_concerns(id) | |
| `description` | TEXT NOT NULL | |
| `discussion_notes` | TEXT | Filled during/after meeting |
| `decisions` | TEXT | |
| `display_order` | INTEGER NOT NULL DEFAULT 0 | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Constraints:**
- RLS: `tenant_id = current_setting('app.current_tenant_id')::uuid`
- Index: `(tenant_id, meeting_id, display_order)` -- for ordered agenda queries

### sst_meeting_actions

Tasks assigned from meetings.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `meeting_id` | UUID NOT NULL FK -> sst_meetings(id) | |
| `agenda_item_id` | UUID FK -> sst_meeting_agenda_items(id) | |
| `student_id` | UUID FK -> students(id) | |
| `case_id` | UUID FK -> pastoral_cases(id) | |
| `description` | TEXT NOT NULL | |
| `assigned_to_user_id` | UUID NOT NULL FK -> users(id) | |
| `due_date` | DATE NOT NULL | |
| `completed_at` | TIMESTAMPTZ | |
| `completed_by_user_id` | UUID FK -> users(id) | |
| `status` | VARCHAR(20) NOT NULL DEFAULT 'pending' | 'pending', 'in_progress', 'completed', 'overdue', 'cancelled' |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Constraints:**
- RLS: `tenant_id = current_setting('app.current_tenant_id')::uuid`
- Index: `(tenant_id, assigned_to_user_id, status)` -- for "my actions" queries
- Index: `(tenant_id, status, due_date)` -- for overdue detection cron
- Index: `(tenant_id, meeting_id)` -- for meeting-scoped action listing

---

## State Machines

### Meeting Lifecycle

```
scheduled -> in_progress        (SST lead starts the meeting)
scheduled -> cancelled          (meeting cancelled before it begins)

in_progress -> completed        (meeting concluded, minutes finalised)
in_progress -> cancelled        (meeting abandoned mid-session -- rare)

TERMINAL: completed, cancelled

EDIT LOCKOUT: When status = 'completed':
  - attendees: read-only
  - general_notes: read-only
  - agenda_items.discussion_notes: read-only
  - agenda_items.decisions: read-only
  - New agenda items: cannot be added
  - Existing agenda items: cannot be modified
  - New actions CAN still be created (post-meeting follow-ups)
  - Actions status can still be updated (actions live beyond the meeting)
```

Each transition generates a `pastoral_events` entry:
- `meeting_status_changed`: `{meeting_id, old_status, new_status, changed_by_user_id}`

### Meeting Action Lifecycle

```
pending -> in_progress          (assignee starts working on it)
pending -> completed            (assignee completes immediately)
pending -> cancelled            (action no longer needed)
pending -> overdue              (daily cron: due_date < today)

in_progress -> completed        (assignee finishes)
in_progress -> cancelled        (action no longer needed)
in_progress -> overdue          (daily cron: due_date < today)

overdue -> in_progress          (assignee resumes overdue action)
overdue -> completed            (assignee completes overdue action)
overdue -> cancelled            (action abandoned)

TERMINAL: completed, cancelled
```

Each transition generates a `pastoral_events` entry:
- `action_assigned`: `{action_id, source: 'meeting', assigned_to_user_id, description, due_date}`
- `action_completed`: `{action_id, completed_by_user_id}`
- `action_overdue`: `{action_id, assigned_to_user_id, due_date, days_overdue}`

---

## API Endpoints

### SST Roster

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/api/pastoral/sst/members` | `pastoral.view_tier2` | List all SST members (active + inactive) |
| `GET` | `/api/pastoral/sst/members/active` | `pastoral.view_tier2` | List active SST members only |
| `POST` | `/api/pastoral/sst/members` | `pastoral.manage_sst` | Add a user to the SST roster |
| `PATCH` | `/api/pastoral/sst/members/:id` | `pastoral.manage_sst` | Update role_description or toggle active |
| `DELETE` | `/api/pastoral/sst/members/:id` | `pastoral.manage_sst` | Remove a user from the SST roster |

### SST Meetings

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/api/pastoral/sst/meetings` | `pastoral.view_tier2` | List meetings (paginated, filterable by status) |
| `GET` | `/api/pastoral/sst/meetings/:id` | `pastoral.view_tier2` | Get meeting detail (with agenda items and actions) |
| `POST` | `/api/pastoral/sst/meetings` | `pastoral.manage_sst` | Create a new meeting |
| `PATCH` | `/api/pastoral/sst/meetings/:id` | `pastoral.manage_sst` | Update meeting (status transition, attendees, general_notes) |
| `PATCH` | `/api/pastoral/sst/meetings/:id/start` | `pastoral.manage_sst` | Transition scheduled -> in_progress |
| `PATCH` | `/api/pastoral/sst/meetings/:id/complete` | `pastoral.manage_sst` | Transition in_progress -> completed |
| `PATCH` | `/api/pastoral/sst/meetings/:id/cancel` | `pastoral.manage_sst` | Transition to cancelled |

### Meeting Agenda

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/api/pastoral/sst/meetings/:id/agenda` | `pastoral.view_tier2` | Get agenda items for a meeting |
| `POST` | `/api/pastoral/sst/meetings/:id/agenda` | `pastoral.manage_sst` | Add a manual agenda item |
| `PATCH` | `/api/pastoral/sst/meetings/:id/agenda/:itemId` | `pastoral.manage_sst` | Update discussion_notes, decisions, display_order (if meeting not completed) |
| `DELETE` | `/api/pastoral/sst/meetings/:id/agenda/:itemId` | `pastoral.manage_sst` | Remove a manual agenda item (only source='manual', only if meeting not completed) |
| `POST` | `/api/pastoral/sst/meetings/:id/agenda/refresh` | `pastoral.manage_sst` | Re-run agenda generation queries on-demand (merge, no duplicate) |

### Meeting Actions

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/api/pastoral/sst/meetings/:id/actions` | `pastoral.view_tier2` | List actions for a meeting |
| `GET` | `/api/pastoral/sst/actions` | `pastoral.view_tier2` | List all actions (paginated, filterable by status/assignee) |
| `GET` | `/api/pastoral/sst/actions/my` | `pastoral.view_tier2` | List actions assigned to current user |
| `POST` | `/api/pastoral/sst/meetings/:id/actions` | `pastoral.manage_sst` | Create an action from an agenda item |
| `PATCH` | `/api/pastoral/sst/actions/:id` | `pastoral.view_tier2` | Update action (status transition, description) |
| `PATCH` | `/api/pastoral/sst/actions/:id/complete` | `pastoral.view_tier2` | Mark action as completed |

---

## Service Method Signatures

### SstService (`sst.service.ts`)

```typescript
// Roster management
addMember(tenantId: string, userId: string, data: AddSstMemberDto, actorUserId: string): Promise<SstMember>
updateMember(tenantId: string, memberId: string, data: UpdateSstMemberDto, actorUserId: string): Promise<SstMember>
removeMember(tenantId: string, memberId: string, actorUserId: string): Promise<void>
listMembers(tenantId: string, filter?: { active?: boolean }): Promise<SstMember[]>
getActiveMemberUserIds(tenantId: string): Promise<string[]>

// Tier access assurance: called after addMember
// Ensures the user has pastoral.view_tier1 and pastoral.view_tier2 permissions.
// This is a service-layer check -- if the user's role doesn't include these permissions,
// the service logs a warning to the pastoral_events table and returns a flag
// to the controller indicating the admin should grant these permissions.
// The service does NOT auto-modify RBAC -- it raises visibility.
ensureTierAccess(tenantId: string, userId: string): Promise<{ hasTier1: boolean; hasTier2: boolean }>
```

### SstMeetingService (`sst-meeting.service.ts`)

```typescript
// Meeting CRUD
createMeeting(tenantId: string, data: CreateMeetingDto, actorUserId: string): Promise<SstMeeting>
getMeeting(tenantId: string, meetingId: string): Promise<SstMeetingWithDetails>
listMeetings(tenantId: string, filter: MeetingFilterDto): Promise<PaginatedResult<SstMeeting>>

// Meeting lifecycle transitions
startMeeting(tenantId: string, meetingId: string, actorUserId: string): Promise<SstMeeting>
completeMeeting(tenantId: string, meetingId: string, actorUserId: string): Promise<SstMeeting>
cancelMeeting(tenantId: string, meetingId: string, actorUserId: string, reason?: string): Promise<SstMeeting>

// Attendee management
updateAttendees(tenantId: string, meetingId: string, attendees: MeetingAttendeeDto[], actorUserId: string): Promise<SstMeeting>

// General notes
updateGeneralNotes(tenantId: string, meetingId: string, notes: string, actorUserId: string): Promise<SstMeeting>

// Meeting edit lockout check (called before any mutation)
assertMeetingEditable(meeting: SstMeeting): void  // throws HttpException if status = 'completed'

// Enqueue agenda pre-compute job for a newly created meeting
enqueueAgendaPrecompute(tenantId: string, meetingId: string, scheduledAt: Date, actorUserId: string): Promise<void>
```

**`createMeeting` implementation notes:**
- Accepts `scheduled_at` (required)
- Auto-populates `attendees` JSONB from active SST members (present: null -- to be marked during the meeting)
- Enqueues a `pastoral:precompute-agenda` delayed BullMQ job scheduled for `scheduled_at - precompute_minutes_before` (from tenant_settings.pastoral.sst)
- If `scheduled_at` is in the past or within the precompute window, runs agenda generation synchronously instead of enqueueing
- Emits `pastoral_events` entry: `meeting_created` (see audit events section)

### SstAgendaGeneratorService (`sst-agenda-generator.service.ts`)

```typescript
// Full agenda generation (used by both BullMQ job and refresh endpoint)
generateAgenda(tenantId: string, meetingId: string, actorUserId: string): Promise<SstMeetingAgendaItem[]>

// Individual source queries (called by generateAgenda)
queryNewConcerns(tenantId: string, sinceDate: Date): Promise<AgendaSourceItem[]>
queryCasesRequiringReview(tenantId: string, beforeDate: Date): Promise<AgendaSourceItem[]>
queryOverdueActions(tenantId: string): Promise<AgendaSourceItem[]>
queryEarlyWarningFlags(tenantId: string): Promise<AgendaSourceItem[]>    // placeholder -- returns [] until Phase 4
queryUpcomingNepsAppointments(tenantId: string, beforeDate: Date): Promise<AgendaSourceItem[]>
queryInterventionReviewDates(tenantId: string, beforeDate: Date): Promise<AgendaSourceItem[]>

// Merge logic: de-duplicates against existing agenda items for this meeting
mergeAgendaItems(
  meetingId: string,
  existingItems: SstMeetingAgendaItem[],
  newItems: AgendaSourceItem[],
): AgendaSourceItem[]
```

**Agenda generation algorithm:**

1. Determine which sources are enabled via `tenant_settings.pastoral.sst.auto_agenda_sources`
2. Find the previous completed meeting's `scheduled_at` (the "since" boundary for new concerns)
3. For each enabled source, run the corresponding query:
   - `new_concerns`: `pastoral_concerns` created since last meeting, tier <= 2 (Tier 3 concerns are never surfaced in SST agenda)
   - `case_reviews`: `pastoral_cases` where `next_review_date <= meeting.scheduled_at` AND status IN ('active', 'monitoring')
   - `overdue_actions`: `sst_meeting_actions` where `status = 'overdue'` UNION `pastoral_intervention_actions` where `status = 'overdue'`
   - `early_warning`: placeholder -- returns empty array until Phase 4 integration
   - `neps`: `pastoral_referrals` where `referral_type = 'neps'` AND `status IN ('submitted', 'acknowledged', 'assessment_scheduled')` AND next status-change expected before meeting date
   - `intervention_reviews`: `pastoral_interventions` where `next_review_date <= meeting.scheduled_at + 7 days` AND `status = 'active'`
4. Assign `display_order`: group by source type, order within each group by severity/urgency
5. Merge with existing items: de-duplicate by (source, student_id, case_id, concern_id) composite key
6. Insert new items, preserve existing manual items untouched
7. Update `sst_meetings.agenda_precomputed_at` to `now()`

**De-duplication rule:** An auto-generated item is considered a duplicate if an existing agenda item for the same meeting has the same `source` AND the same non-null reference (`concern_id`, `case_id`, or `student_id` depending on source type). Manual items are never considered duplicates.

### SstMeetingActionService (within `sst-meeting.service.ts` or separate)

```typescript
// Action CRUD
createAction(tenantId: string, meetingId: string, data: CreateMeetingActionDto, actorUserId: string): Promise<SstMeetingAction>
updateAction(tenantId: string, actionId: string, data: UpdateMeetingActionDto, actorUserId: string): Promise<SstMeetingAction>
completeAction(tenantId: string, actionId: string, actorUserId: string): Promise<SstMeetingAction>
listActionsForMeeting(tenantId: string, meetingId: string): Promise<SstMeetingAction[]>
listAllActions(tenantId: string, filter: ActionFilterDto): Promise<PaginatedResult<SstMeetingAction>>
listMyActions(tenantId: string, userId: string, filter?: ActionFilterDto): Promise<PaginatedResult<SstMeetingAction>>

// Overdue detection (called by daily cron)
markOverdueActions(tenantId: string): Promise<{ meetingActionsMarked: number; interventionActionsMarked: number }>
```

---

## Zod Schemas

All schemas defined in `packages/shared/src/pastoral/schemas/sst.schema.ts`.

```typescript
// --- Roster ---
export const addSstMemberSchema = z.object({
  user_id: z.string().uuid(),
  role_description: z.string().max(100).optional(),
});
export type AddSstMemberDto = z.infer<typeof addSstMemberSchema>;

export const updateSstMemberSchema = z.object({
  role_description: z.string().max(100).optional(),
  active: z.boolean().optional(),
});
export type UpdateSstMemberDto = z.infer<typeof updateSstMemberSchema>;

// --- Meetings ---
export const createMeetingSchema = z.object({
  scheduled_at: z.string().datetime(),
});
export type CreateMeetingDto = z.infer<typeof createMeetingSchema>;

export const meetingFilterSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type MeetingFilterDto = z.infer<typeof meetingFilterSchema>;

export const meetingAttendeeSchema = z.object({
  user_id: z.string().uuid(),
  name: z.string(),
  present: z.boolean().nullable(),
});
export type MeetingAttendeeDto = z.infer<typeof meetingAttendeeSchema>;

export const updateMeetingNotesSchema = z.object({
  general_notes: z.string(),
});

// --- Agenda ---
export const createManualAgendaItemSchema = z.object({
  description: z.string().min(1),
  student_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  display_order: z.number().int().optional(),
});
export type CreateManualAgendaItemDto = z.infer<typeof createManualAgendaItemSchema>;

export const updateAgendaItemSchema = z.object({
  discussion_notes: z.string().optional(),
  decisions: z.string().optional(),
  display_order: z.number().int().optional(),
});
export type UpdateAgendaItemDto = z.infer<typeof updateAgendaItemSchema>;

// --- Actions ---
export const createMeetingActionSchema = z.object({
  agenda_item_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  description: z.string().min(1),
  assigned_to_user_id: z.string().uuid(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type CreateMeetingActionDto = z.infer<typeof createMeetingActionSchema>;

export const updateMeetingActionSchema = z.object({
  description: z.string().min(1).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type UpdateMeetingActionDto = z.infer<typeof updateMeetingActionSchema>;

export const actionFilterSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue', 'cancelled']).optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ActionFilterDto = z.infer<typeof actionFilterSchema>;

// --- Attendees JSONB schema (for validation of sst_meetings.attendees) ---
export const meetingAttendeesJsonSchema = z.array(meetingAttendeeSchema);
```

---

## BullMQ Jobs

### `pastoral:precompute-agenda`

| Property | Value |
|----------|-------|
| Queue | `pastoral` |
| Trigger | Delayed job enqueued when a meeting is created. Delay = `scheduled_at - precompute_minutes_before` |
| Payload | `{ tenant_id: string, user_id: string, meeting_id: string }` |
| Processor | `SstAgendaPrecomputeProcessor` in `apps/worker/` |
| Idempotency | If `agenda_precomputed_at` is already set and is within 5 minutes of the job execution time, skip (prevents double-compute if the job is retried) |
| Retry | 2 retries with exponential backoff |

**Processor logic:**
1. Extend `TenantAwareJob`
2. Load the meeting; verify `status = 'scheduled'` (if cancelled, skip silently)
3. Call `SstAgendaGeneratorService.generateAgenda()`
4. Update `sst_meetings.agenda_precomputed_at = now()`
5. All within a single Prisma interactive transaction with RLS context

### `pastoral:overdue-actions`

| Property | Value |
|----------|-------|
| Queue | `pastoral` |
| Trigger | Daily cron at 08:00 UTC (server time) |
| Payload | `{ tenant_id: string }` |
| Processor | `PastoralOverdueActionsProcessor` in `apps/worker/` |
| Scope | Runs once per tenant (iterate all tenants with pastoral module enabled) |
| Retry | 2 retries with exponential backoff |

**Processor logic:**
1. Extend `TenantAwareJob`
2. Query `sst_meeting_actions` WHERE `status IN ('pending', 'in_progress')` AND `due_date < today`
3. Update each to `status = 'overdue'`
4. For each newly overdue action, emit `pastoral_events` entry: `action_overdue`
5. Query `pastoral_intervention_actions` WHERE `status IN ('pending', 'in_progress')` AND `due_date < today`
6. Update each to `status = 'overdue'`
7. For each newly overdue intervention action, emit `pastoral_events` entry: `action_overdue`
8. Return count of actions marked overdue for logging

**Important:** This job is shared between SW-2A and SW-2B. Intervention actions are included here so that a single cron handles all pastoral overdue detection. If SW-2B is not yet implemented when SW-2A ships, the intervention action query returns zero rows (table exists but has no data).

---

## Audit Events

All events are written to `pastoral_events` via `PastoralEventService` (append-only, immutability trigger enforced).

| event_type | entity_type | payload |
|------------|-------------|---------|
| `sst_member_added` | `sst_member` | `{member_id, user_id, role_description, added_by_user_id}` |
| `sst_member_updated` | `sst_member` | `{member_id, user_id, changes: {field, old_value, new_value}[], updated_by_user_id}` |
| `sst_member_removed` | `sst_member` | `{member_id, user_id, removed_by_user_id}` |
| `meeting_created` | `meeting` | `{meeting_id, scheduled_at, created_by_user_id, attendee_count}` |
| `meeting_status_changed` | `meeting` | `{meeting_id, old_status, new_status, changed_by_user_id, reason?}` |
| `meeting_attendees_updated` | `meeting` | `{meeting_id, attendees_present: number, attendees_absent: number}` |
| `agenda_precomputed` | `meeting` | `{meeting_id, items_generated: number, sources_queried: string[]}` |
| `agenda_refreshed` | `meeting` | `{meeting_id, new_items_added: number, existing_items_count: number}` |
| `agenda_item_added_manual` | `meeting` | `{meeting_id, agenda_item_id, description, added_by_user_id}` |
| `agenda_item_updated` | `meeting` | `{meeting_id, agenda_item_id, fields_updated: string[]}` |
| `action_assigned` | `meeting` | `{action_id, source: 'meeting', meeting_id, assigned_to_user_id, description, due_date}` |
| `action_completed` | `meeting` | `{action_id, completed_by_user_id}` |
| `action_overdue` | `meeting` | `{action_id, assigned_to_user_id, due_date, days_overdue}` |

---

## Controller Implementation Notes

### SstController (`sst.controller.ts`)

Located at `apps/api/src/modules/pastoral/controllers/sst.controller.ts`.

- Thin controller pattern: validate input with Zod -> call service -> return response
- All roster endpoints require `@RequiresPermission('pastoral.manage_sst')` except GET endpoints which require `@RequiresPermission('pastoral.view_tier2')`
- All meeting mutation endpoints require `@RequiresPermission('pastoral.manage_sst')`
- Action completion endpoint (`PATCH /actions/:id/complete`) requires only `@RequiresPermission('pastoral.view_tier2')` -- any SST member can complete their own actions
- Action status update validates the state machine (e.g., cannot go from `completed` to `pending`)
- Meeting update endpoints check `assertMeetingEditable()` before allowing mutations to notes/agenda

### Edit Lockout Enforcement

When `sst_meetings.status = 'completed'`:
- `PATCH /meetings/:id` -- rejects updates to `general_notes` and `attendees` (returns 409 Conflict)
- `PATCH /meetings/:id/agenda/:itemId` -- rejects updates to `discussion_notes` and `decisions` (returns 409 Conflict)
- `POST /meetings/:id/agenda` -- rejects new manual items (returns 409 Conflict)
- `DELETE /meetings/:id/agenda/:itemId` -- rejects deletion (returns 409 Conflict)
- `POST /meetings/:id/actions` -- ALLOWED (post-meeting follow-ups are valid)
- `PATCH /actions/:id` -- ALLOWED (actions live beyond the meeting)

### Pagination

All list endpoints use the standard EduPod pagination pattern:
```typescript
{ data: T[], meta: { page: number, pageSize: number, total: number } }
```

---

## Test Requirements

### Unit Tests

| Test file | Coverage |
|-----------|----------|
| `sst.service.spec.ts` | Roster CRUD, tier access check, duplicate member prevention |
| `sst-meeting.service.spec.ts` | Meeting CRUD, all state transitions (valid + blocked), edit lockout enforcement |
| `sst-agenda-generator.service.spec.ts` | Each source query independently, merge/dedup logic, tenant settings source filtering |
| `sst-meeting-action.service.spec.ts` | Action CRUD, all state transitions (valid + blocked), overdue marking |

### Integration Tests

| Test | Description |
|------|-------------|
| SST roster CRUD | Create member, update role, toggle active, remove, verify list |
| Meeting full lifecycle | Create -> start -> add agenda items -> add minutes -> create actions -> complete -> verify lockout |
| Agenda pre-compute | Create meeting, populate concerns/cases/overdue actions, trigger generation, verify items created from correct sources |
| Agenda refresh | Generate agenda, add new concern, call refresh, verify new item added without duplicating existing |
| Agenda de-duplication | Generate agenda, call refresh twice, verify no duplicate items |
| Action overdue cron | Create actions with past due_date, run overdue job, verify status = 'overdue' and pastoral_events emitted |
| Manual agenda item CRUD | Add manual item, verify source = 'manual', delete it, verify removal |
| Edit lockout | Complete a meeting, attempt to update notes/agenda, verify 409 |

### RLS Leakage Tests

| Test | Description |
|------|-------------|
| SST members tenant isolation | Create SST member as Tenant A, query as Tenant B, verify empty result |
| Meetings tenant isolation | Create meeting as Tenant A, query as Tenant B, verify empty result |
| Agenda items tenant isolation | Create agenda items as Tenant A, query as Tenant B, verify empty result |
| Actions tenant isolation | Create action as Tenant A, query as Tenant B, verify empty result |

### Permission Tests

| Test | Description |
|------|-------------|
| Roster management requires `pastoral.manage_sst` | Attempt POST/PATCH/DELETE without permission, verify 403 |
| Meeting management requires `pastoral.manage_sst` | Attempt POST/PATCH without permission, verify 403 |
| View endpoints require `pastoral.view_tier2` | Attempt GET without permission, verify 403 |
| Action completion by non-SST member | Attempt without `pastoral.view_tier2`, verify 403 |

---

## Verification Checklist

Before marking SW-2A as complete:

- [ ] SST roster CRUD works (add, update role, toggle active, remove, list)
- [ ] `ensureTierAccess` flags missing Tier 1/2 permissions when adding SST members
- [ ] Meeting lifecycle transitions work (scheduled -> in_progress -> completed, scheduled -> cancelled)
- [ ] Edit lockout prevents mutations on completed meetings (409 on notes, agenda; 200 on actions)
- [ ] Hybrid agenda generation queries all 6 sources (with correct filtering per source)
- [ ] Agenda respects `tenant_settings.pastoral.sst.auto_agenda_sources` configuration
- [ ] Agenda de-duplication prevents duplicate items on refresh
- [ ] Manual agenda items can be added, updated, and deleted (only when meeting not completed)
- [ ] Meeting minutes (discussion_notes, decisions) are editable per-agenda-item until meeting is completed
- [ ] General notes are editable until meeting is completed
- [ ] Meeting actions CRUD works with full state machine
- [ ] Daily overdue cron marks both SST meeting actions AND intervention actions as overdue
- [ ] BullMQ `pastoral:precompute-agenda` job fires at correct delay and generates agenda
- [ ] BullMQ `pastoral:overdue-actions` cron runs daily and marks overdue actions
- [ ] All mutations generate `pastoral_events` audit entries
- [ ] All RLS leakage tests pass (4 tests: members, meetings, agenda items, actions)
- [ ] All permission tests pass (manage_sst, view_tier2)
- [ ] `turbo test` passes with zero regressions
- [ ] `turbo lint` and `turbo type-check` pass

---

## Files Created / Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/shared/src/pastoral/schemas/sst.schema.ts` | CREATE | Zod schemas for SST roster, meetings, agenda, actions |
| `packages/shared/src/pastoral/schemas/index.ts` | MODIFY | Re-export SST schemas |
| `apps/api/src/modules/pastoral/services/sst.service.ts` | CREATE | SST roster service |
| `apps/api/src/modules/pastoral/services/sst-meeting.service.ts` | CREATE | Meeting lifecycle + attendees + notes |
| `apps/api/src/modules/pastoral/services/sst-agenda-generator.service.ts` | CREATE | Hybrid agenda generation (6 sources + merge) |
| `apps/api/src/modules/pastoral/controllers/sst.controller.ts` | CREATE | Endpoints for roster, meetings, agenda, actions |
| `apps/api/src/modules/pastoral/pastoral.module.ts` | MODIFY | Register SST services and controller |
| `apps/worker/src/processors/pastoral/sst-agenda-precompute.processor.ts` | CREATE | BullMQ processor for agenda pre-compute |
| `apps/worker/src/processors/pastoral/overdue-actions.processor.ts` | CREATE | BullMQ processor for daily overdue detection |
| `apps/worker/src/worker.module.ts` | MODIFY | Register pastoral processors |
| `apps/api/src/modules/pastoral/services/sst.service.spec.ts` | CREATE | Unit tests for SST roster |
| `apps/api/src/modules/pastoral/services/sst-meeting.service.spec.ts` | CREATE | Unit tests for meeting lifecycle |
| `apps/api/src/modules/pastoral/services/sst-agenda-generator.service.spec.ts` | CREATE | Unit tests for agenda generation |
| `apps/api/test/pastoral/sst.integration.spec.ts` | CREATE | Integration tests for SST endpoints |
| `architecture/event-job-catalog.md` | MODIFY | Add pastoral:precompute-agenda and pastoral:overdue-actions jobs |
| `architecture/state-machines.md` | MODIFY | Add meeting lifecycle and meeting action lifecycle |
| `architecture/module-blast-radius.md` | MODIFY | Add SST service dependencies |
