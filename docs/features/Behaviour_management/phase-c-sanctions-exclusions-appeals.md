# Phase C: Sanctions + Exclusions + Appeals — Implementation Spec

> **Phase**: C of the Behaviour Management Module build-out
> **Depends on**: Phase A (schema, incidents, participants, entity history, attachments) and Phase B (policy engine, `create_sanction` action creates `behaviour_sanctions` rows)
> **Scope**: Full sanction lifecycle, exclusion case workflow, appeal system, and amendment workflow
> **New tables**: `behaviour_exclusion_cases`, `behaviour_appeals`, `behaviour_amendment_notices` (Phase A introduced `behaviour_sanctions`; this phase implements its full lifecycle)
> **Sequences used**: `SN-` (sanctions, Phase A), `EX-` (exclusion cases), `AP-` (appeals)
> **Controllers**: `behaviour-sanctions.controller.ts`, `behaviour-appeals.controller.ts`, `behaviour-exclusions.controller.ts`, `behaviour-amendments.controller.ts`

---

## Prerequisites

Before starting Phase C, confirm the following Phase A and Phase B deliverables are complete and merged:

- `behaviour_sanctions` table exists with all columns and indexes defined in Phase A
- `behaviour_entity_history` table exists (Phase A) — Phase C writes to it heavily
- `behaviour_tasks` table exists (Phase A) — Phase C creates `return_check_in` and `appeal_review` tasks
- `behaviour_attachments` table exists (Phase A) — Phase C links evidence to appeals and exclusion cases
- `behaviour_parent_acknowledgements` table exists (Phase A) — Phase C creates re-acknowledgement records
- `behaviour_legal_holds` table exists (Phase A) — Phase C sets holds on exclusion cases and appeals
- Policy engine (Phase B) is operational and can emit `create_sanction` actions
- The approvals module integration from Phase B is working (suspension approval flow)
- The `SequenceService` is capable of generating `EX-` and `AP-` sequences
- `behaviour.manage` permission is enforced by the auth guard

---

## Objectives

1. Implement the full sanction state machine and all operational endpoints (conflict check for detentions, bulk mark, suspension return workflow)
2. Implement exclusion case auto-creation from high-stakes sanctions, with statutory timeline tracking
3. Implement the appeal lifecycle end-to-end, including hearing scheduling, decision recording, and automatic outcome application
4. Implement the amendment workflow that fires whenever a parent-notified record is edited
5. Wire the `behaviour:suspension-return` daily worker job
6. Register all notification templates for Phase C

---

## Tables

### `behaviour_sanctions`

Defined in Phase A. Phase C implements its complete business logic and state machine. Full schema restated here for implementor reference.

| Column                    | Type                                                                                                                                                                                                          | Notes                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `id`                      | UUID PK                                                                                                                                                                                                       | `gen_random_uuid()`                                                               |
| `tenant_id`               | UUID FK NOT NULL                                                                                                                                                                                              | RLS                                                                               |
| `sanction_number`         | VARCHAR(20) NOT NULL                                                                                                                                                                                          | Sequence: `SN-000001` via `SequenceService`                                       |
| `incident_id`             | UUID FK NOT NULL                                                                                                                                                                                              | -> `behaviour_incidents`                                                          |
| `student_id`              | UUID FK NOT NULL                                                                                                                                                                                              | -> `students`                                                                     |
| `type`                    | ENUM('detention', 'suspension_internal', 'suspension_external', 'expulsion', 'community_service', 'loss_of_privilege', 'restorative_meeting', 'other') NOT NULL                                               |                                                                                   |
| `status`                  | ENUM('pending_approval', 'scheduled', 'served', 'partially_served', 'no_show', 'excused', 'cancelled', 'rescheduled', 'not_served_absent', 'appealed', 'replaced', 'superseded') NOT NULL DEFAULT 'scheduled' | See state machine below                                                           |
| `approval_status`         | ENUM('not_required', 'pending', 'approved', 'rejected') DEFAULT 'not_required'                                                                                                                                | Driven by policy engine                                                           |
| `approval_request_id`     | UUID FK NULL                                                                                                                                                                                                  | -> `approval_requests`                                                            |
| `scheduled_date`          | DATE NOT NULL                                                                                                                                                                                                 |                                                                                   |
| `scheduled_start_time`    | TIME NULL                                                                                                                                                                                                     |                                                                                   |
| `scheduled_end_time`      | TIME NULL                                                                                                                                                                                                     |                                                                                   |
| `scheduled_room_id`       | UUID FK NULL                                                                                                                                                                                                  | -> `rooms`                                                                        |
| `supervised_by_id`        | UUID FK NULL                                                                                                                                                                                                  | -> `users`                                                                        |
| `suspension_start_date`   | DATE NULL                                                                                                                                                                                                     | Required when type IN ('suspension_internal', 'suspension_external', 'expulsion') |
| `suspension_end_date`     | DATE NULL                                                                                                                                                                                                     |                                                                                   |
| `suspension_days`         | INT NULL                                                                                                                                                                                                      | Computed from start/end dates excluding school closures                           |
| `return_conditions`       | TEXT NULL                                                                                                                                                                                                     | Checklist of conditions to be met before re-admission                             |
| `parent_meeting_required` | BOOLEAN DEFAULT false                                                                                                                                                                                         |                                                                                   |
| `parent_meeting_date`     | TIMESTAMPTZ NULL                                                                                                                                                                                              |                                                                                   |
| `parent_meeting_notes`    | TEXT NULL                                                                                                                                                                                                     | Visibility class: SENSITIVE                                                       |
| `served_at`               | TIMESTAMPTZ NULL                                                                                                                                                                                              | Set when marking served                                                           |
| `served_by_id`            | UUID FK NULL                                                                                                                                                                                                  | -> `users`                                                                        |
| `replaced_by_id`          | UUID FK NULL                                                                                                                                                                                                  | -> `behaviour_sanctions` -- the alternative consequence on partial appeal         |
| `appeal_notes`            | TEXT NULL                                                                                                                                                                                                     | Notes added at time of appeal                                                     |
| `appeal_outcome`          | ENUM('upheld', 'modified', 'overturned') NULL                                                                                                                                                                 | Set when appeal is decided                                                        |
| `notes`                   | TEXT NULL                                                                                                                                                                                                     | Staff internal notes                                                              |
| `retention_status`        | ENUM('active', 'archived', 'anonymised') DEFAULT 'active'                                                                                                                                                     |                                                                                   |
| `created_at`              | TIMESTAMPTZ NOT NULL DEFAULT NOW()                                                                                                                                                                            |                                                                                   |
| `updated_at`              | TIMESTAMPTZ NOT NULL DEFAULT NOW()                                                                                                                                                                            |                                                                                   |

**Indexes** (Phase A, restated):

- `(tenant_id, student_id, status)` — student sanction list
- `(tenant_id, scheduled_date, status)` — today's sanctions dashboard
- `(tenant_id, supervised_by_id, scheduled_date)` — my supervision
- `(tenant_id, type, status)` — suspension/expulsion reporting
- `(tenant_id, suspension_end_date) WHERE suspension_end_date IS NOT NULL` — return worker query

**Sanction state machine**:

```
pending_approval -> scheduled           (approval granted via approvals module callback)
pending_approval -> cancelled           (approval rejected)

scheduled -> served                     (staff marks completed)
scheduled -> partially_served           (student left early, disruption, other)
scheduled -> no_show                    (student did not attend)
scheduled -> excused                    (legitimate absence reason accepted)
scheduled -> cancelled                  (withdrawn by management)
scheduled -> rescheduled                (date changed — this sanction -> superseded; new sanction created)
scheduled -> not_served_absent          (student absent from school on scheduled date)
scheduled -> appealed                   (formal appeal lodged)

appealed -> scheduled                   (appeal rejected, original sanction stands)
appealed -> cancelled                   (appeal upheld, sanction removed entirely)
appealed -> replaced                    (appeal partially upheld, alternative consequence issued; replaced_by_id set)

partially_served -- terminal
served -- terminal
no_show -> rescheduled | cancelled
excused -> rescheduled | cancelled
not_served_absent -> rescheduled
replaced -- terminal (replaced_by_id links to the replacement sanction)
cancelled -- terminal
superseded -- terminal (old sanction after reschedule)
```

**Every state transition** must:

1. Write a `behaviour_entity_history` record with `entity_type = 'sanction'`, `change_type = 'status_changed'`, `previous_values = { status: oldStatus }`, `new_values = { status: newStatus }`, `reason` (required for cancellation, appeal transitions)
2. Validate the transition is permitted (throw `BadRequestException` for invalid transitions)

---

### `behaviour_exclusion_cases`

New in Phase C. Auto-created when a sanction is of type `suspension_external`, `expulsion`, or `suspension_internal` with `suspension_days >= 5` (configurable threshold). Tracks the formal, legally-governed process that runs alongside and beyond the raw sanction record.

| Column                        | Type                                                                                                                                                              | Notes                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------- | ------------------------ | --------- | --------- | ----------------- |
| `id`                          | UUID PK                                                                                                                                                           | `gen_random_uuid()`                                                     |
| `tenant_id`                   | UUID FK NOT NULL                                                                                                                                                  | RLS                                                                     |
| `case_number`                 | VARCHAR(20) NOT NULL                                                                                                                                              | Sequence: `EX-000001` via `SequenceService`                             |
| `sanction_id`                 | UUID FK NOT NULL                                                                                                                                                  | -> `behaviour_sanctions` — the triggering sanction. UNIQUE per sanction |
| `incident_id`                 | UUID FK NOT NULL                                                                                                                                                  | -> `behaviour_incidents`                                                |
| `student_id`                  | UUID FK NOT NULL                                                                                                                                                  | -> `students`                                                           |
| `type`                        | ENUM('suspension_extended', 'expulsion', 'managed_move', 'permanent_exclusion') NOT NULL                                                                          | Maps from sanction type + duration                                      |
| `status`                      | ENUM('initiated', 'notice_issued', 'hearing_scheduled', 'hearing_held', 'decision_made', 'appeal_window', 'finalised', 'overturned') NOT NULL DEFAULT 'initiated' | See lifecycle below                                                     |
| `formal_notice_issued_at`     | TIMESTAMPTZ NULL                                                                                                                                                  | Set when notice document is finalised and sent                          |
| `formal_notice_document_id`   | UUID FK NULL                                                                                                                                                      | -> `behaviour_documents`                                                |
| `hearing_date`                | TIMESTAMPTZ NULL                                                                                                                                                  |                                                                         |
| `hearing_attendees`           | JSONB NULL                                                                                                                                                        | `[{ name: string, role: string, relationship: string }]`                |
| `hearing_minutes_document_id` | UUID FK NULL                                                                                                                                                      | -> `behaviour_documents`                                                |
| `student_representation`      | TEXT NULL                                                                                                                                                         | Who represented the student at hearing                                  |
| `board_pack_generated_at`     | TIMESTAMPTZ NULL                                                                                                                                                  |                                                                         |
| `board_pack_document_id`      | UUID FK NULL                                                                                                                                                      | -> `behaviour_documents`                                                |
| `decision`                    | ENUM('exclusion_confirmed', 'exclusion_modified', 'exclusion_reversed', 'alternative_consequence') NULL                                                           |                                                                         |
| `decision_date`               | TIMESTAMPTZ NULL                                                                                                                                                  |                                                                         |
| `decision_letter_document_id` | UUID FK NULL                                                                                                                                                      | -> `behaviour_documents`                                                |
| `decision_reasoning`          | TEXT NULL                                                                                                                                                         |                                                                         |
| `decided_by_id`               | UUID FK NULL                                                                                                                                                      | -> `users`                                                              |
| `conditions_for_return`       | TEXT NULL                                                                                                                                                         | Conditions student must meet before re-admission                        |
| `conditions_for_transfer`     | TEXT NULL                                                                                                                                                         | Managed move conditions                                                 |
| `appeal_deadline`             | DATE NULL                                                                                                                                                         | Statutory: typically 15 school days from decision date                  |
| `appeal_id`                   | UUID FK NULL                                                                                                                                                      | -> `behaviour_appeals` — set when appeal is lodged                      |
| `statutory_timeline`          | JSONB NULL                                                                                                                                                        | `[{ step: string, required_by: string                                   | null, completed_at: string | null, status: 'complete' | 'pending' | 'overdue' | 'not_started' }]` |
| `linked_evidence_ids`         | UUID[] DEFAULT '{}'                                                                                                                                               | -> `behaviour_attachments` UUIDs                                        |
| `created_at`                  | TIMESTAMPTZ NOT NULL DEFAULT NOW()                                                                                                                                |                                                                         |
| `updated_at`                  | TIMESTAMPTZ NOT NULL DEFAULT NOW()                                                                                                                                |                                                                         |

**UNIQUE**: `(tenant_id, sanction_id)` — one exclusion case per sanction.

**Indexes**:

- `(tenant_id, status)` — case management list
- `(tenant_id, student_id)` — student exclusion history
- `(tenant_id, appeal_deadline) WHERE appeal_deadline IS NOT NULL` — deadline tracking
- `(tenant_id, status, appeal_deadline)` — cases in appeal window

**RLS policy**: Standard tenant isolation. Read requires `behaviour.manage`.

**Exclusion case lifecycle**:

```
initiated -> notice_issued            (formal notice generated, finalised, and sent to parent;
                                       formal_notice_issued_at set; formal_notice_document_id set)

notice_issued -> hearing_scheduled    (hearing_date set, hearing invite document generated and sent)

hearing_scheduled -> hearing_held     (hearing took place; hearing_minutes_document_id set;
                                       hearing_attendees populated; student_representation recorded)

hearing_held -> decision_made         (decision recorded; decision_date set; decision_reasoning written;
                                       decided_by_id set; decision_letter_document_id set;
                                       appeal_deadline auto-calculated = decision_date + 15 school days)

decision_made -> appeal_window        (statutory appeal period begins; auto-transition on decision record)

appeal_window -> finalised            (appeal deadline passed with no appeal, OR appeal decided and case closed)
appeal_window -> overturned           (appeal succeeded — exclusion_cases.appeal_id set to winning appeal)
```

**Every status transition** writes a `behaviour_entity_history` record with `entity_type = 'exclusion_case'`.

**Statutory timeline auto-population**: When an exclusion case is created, the service populates `statutory_timeline` based on the case type. For Irish schools, this maps to Education Act 1998 provisions:

```json
[
  {
    "step": "Written notice to parents",
    "required_by": "2025-11-15",
    "completed_at": null,
    "status": "pending"
  },
  {
    "step": "Hearing scheduled (minimum 5 school days notice to parents)",
    "required_by": "2025-11-22",
    "completed_at": null,
    "status": "not_started"
  },
  {
    "step": "Board pack assembled and distributed to attendees",
    "required_by": "2025-11-21",
    "completed_at": null,
    "status": "not_started"
  },
  {
    "step": "Hearing held",
    "required_by": null,
    "completed_at": null,
    "status": "not_started"
  },
  {
    "step": "Decision communicated to parents in writing",
    "required_by": null,
    "completed_at": null,
    "status": "not_started"
  },
  {
    "step": "Appeal window (15 school days from decision date)",
    "required_by": null,
    "completed_at": null,
    "status": "not_started"
  }
]
```

Each `required_by` date is calculated using `addSchoolDays(tenantId, fromDate, days)` from `packages/shared/`. The timeline is recalculated when `formal_notice_issued_at` is set. Timeline steps transition to `'overdue'` if `required_by` is in the past and `completed_at` is null. The `GET /exclusion-cases/:id/timeline` endpoint computes current status dynamically rather than reading stale JSON.

**Legal hold auto-set**: When an exclusion case is created, `behaviour_legal_holds` is populated for the linked sanction, incident, and all related participants, attachments, and entity history entries. The hold reason is set to `Exclusion case EX-XXXXXX`.

---

### `behaviour_appeals`

New in Phase C. First-class appeal workflow for incidents and sanctions.

| Column                 | Type                                                                                                                                              | Notes                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                   | UUID PK                                                                                                                                           | `gen_random_uuid()`                                                                                                                  |
| `tenant_id`            | UUID FK NOT NULL                                                                                                                                  | RLS                                                                                                                                  |
| `appeal_number`        | VARCHAR(20) NOT NULL                                                                                                                              | Sequence: `AP-000001` via `SequenceService`                                                                                          |
| `entity_type`          | ENUM('incident', 'sanction') NOT NULL                                                                                                             | What is being appealed                                                                                                               |
| `incident_id`          | UUID FK NOT NULL                                                                                                                                  | Always required — the root incident                                                                                                  |
| `sanction_id`          | UUID FK NULL                                                                                                                                      | Required when `entity_type = 'sanction'`                                                                                             |
| `student_id`           | UUID FK NOT NULL                                                                                                                                  | -> `students`                                                                                                                        |
| `appellant_type`       | ENUM('parent', 'student', 'staff') NOT NULL                                                                                                       | Who is lodging the appeal                                                                                                            |
| `appellant_parent_id`  | UUID FK NULL                                                                                                                                      | -> `parents`. Required when `appellant_type = 'parent'`                                                                              |
| `appellant_staff_id`   | UUID FK NULL                                                                                                                                      | -> `users`. Required when `appellant_type = 'staff'`                                                                                 |
| `status`               | ENUM('submitted', 'under_review', 'hearing_scheduled', 'decided', 'withdrawn') NOT NULL DEFAULT 'submitted'                                       |                                                                                                                                      |
| `grounds`              | TEXT NOT NULL                                                                                                                                     | Free-text statement of appeal grounds. Min 20 chars.                                                                                 |
| `grounds_category`     | ENUM('factual_inaccuracy', 'disproportionate_consequence', 'procedural_error', 'mitigating_circumstances', 'mistaken_identity', 'other') NOT NULL |                                                                                                                                      |
| `submitted_at`         | TIMESTAMPTZ NOT NULL DEFAULT NOW()                                                                                                                |                                                                                                                                      |
| `reviewer_id`          | UUID FK NULL                                                                                                                                      | -> `users` — assigned reviewer                                                                                                       |
| `hearing_date`         | TIMESTAMPTZ NULL                                                                                                                                  |                                                                                                                                      |
| `hearing_attendees`    | JSONB NULL                                                                                                                                        | `[{ name: string, role: string }]`                                                                                                   |
| `hearing_notes`        | TEXT NULL                                                                                                                                         | Visibility class: SENSITIVE                                                                                                          |
| `decision`             | ENUM('upheld_original', 'modified', 'overturned') NULL                                                                                            |                                                                                                                                      |
| `decision_reasoning`   | TEXT NULL                                                                                                                                         | Required when decision is recorded                                                                                                   |
| `decided_by_id`        | UUID FK NULL                                                                                                                                      | -> `users`                                                                                                                           |
| `decided_at`           | TIMESTAMPTZ NULL                                                                                                                                  |                                                                                                                                      |
| `resulting_amendments` | JSONB NULL                                                                                                                                        | Structured list of what changed: `[{ field: string, old_value: string, new_value: string, entity_type: string, entity_id: string }]` |
| `retention_status`     | ENUM('active', 'archived', 'anonymised') DEFAULT 'active'                                                                                         |                                                                                                                                      |
| `created_at`           | TIMESTAMPTZ NOT NULL DEFAULT NOW()                                                                                                                |                                                                                                                                      |
| `updated_at`           | TIMESTAMPTZ NOT NULL DEFAULT NOW()                                                                                                                |                                                                                                                                      |

**Indexes**:

- `(tenant_id, status)` — appeals management list
- `(tenant_id, student_id)` — student appeal history
- `(tenant_id, incident_id)` — appeals for an incident
- `(tenant_id, sanction_id) WHERE sanction_id IS NOT NULL` — appeals for a sanction
- `(tenant_id, submitted_at DESC)` — chronological list

**RLS policy**: Standard tenant isolation.

**Appeal state machine**:

```
submitted -> under_review             (reviewer assigned; reviewer_id set)
submitted -> withdrawn                (appellant withdraws before review)

under_review -> hearing_scheduled     (formal hearing warranted; hearing_date set;
                                       appeal_hearing_invite document generated and sent)
under_review -> decided               (desk review only, no hearing needed)
under_review -> withdrawn             (withdrawn during review)

hearing_scheduled -> hearing_held     (implicit — status becomes 'decided' when decision recorded
                                       after a hearing; hearing_notes captured)
hearing_scheduled -> decided          (decision recorded; hearing_notes captured; hearing_attendees set)
hearing_scheduled -> withdrawn

decided -- terminal
withdrawn -- terminal
```

**Decision auto-application** (`decided` transition): When a decision is recorded via `POST /appeals/:id/decide`, the service executes in a single interactive transaction:

1. Set `appeal.decision`, `appeal.decision_reasoning`, `appeal.decided_by_id`, `appeal.decided_at`
2. Apply outcome based on decision:
   - `upheld_original`: no changes to incident/sanction
   - `modified`: apply each amendment in the request body; update incident/sanction fields accordingly; populate `resulting_amendments`; if sanction was `appealed` -> transition to `replaced` (new sanction created) or `scheduled` (original stands but modified)
   - `overturned`: sanction -> `cancelled`; incident status -> `closed_after_appeal`; if exclusion case exists -> `overturned`
3. Write `behaviour_entity_history` for each changed entity with `change_type = 'appeal_outcome'`
4. If decision modifies parent-visible fields: auto-create `behaviour_amendment_notices` record(s)
5. Generate `appeal_decision_letter` document (queued async if board-pack complexity)
6. Enqueue `behaviour_appeal_outcome` notification to appellant
7. If `resulting_amendments` affects parent-visible data: enqueue `behaviour_correction_parent` notification; if severity >= `parent_acknowledgement_required_severity`: set `requires_parent_reacknowledgement = true` on the amendment notice
8. If appeal is linked to exclusion case (`exclusion_cases.appeal_id`): update exclusion case status to `overturned` or `finalised` accordingly

**Legal hold auto-set**: When an appeal is submitted, `behaviour_legal_holds` is populated for the linked incident, sanction (if any), and all their related entities. Hold reason: `Appeal AP-XXXXXX`.

**UNIQUE constraint**: One active appeal per sanction: `(tenant_id, sanction_id) WHERE sanction_id IS NOT NULL AND status NOT IN ('withdrawn', 'decided')`. Enforced at application layer before insert. A sanction cannot have two simultaneous open appeals.

---

### `behaviour_amendment_notices`

New in Phase C. Tracks every correction to a record after an outbound parent communication has already been sent.

| Column                              | Type                                                      | Notes                                                                                    |
| ----------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `id`                                | UUID PK                                                   | `gen_random_uuid()`                                                                      |
| `tenant_id`                         | UUID FK NOT NULL                                          | RLS                                                                                      |
| `entity_type`                       | ENUM('incident', 'sanction', 'appeal') NOT NULL           | What was amended                                                                         |
| `entity_id`                         | UUID NOT NULL                                             | FK to the amended record                                                                 |
| `amendment_type`                    | ENUM('correction', 'supersession', 'retraction') NOT NULL |                                                                                          |
| `original_notification_id`          | UUID FK NULL                                              | -> `notifications` — the original outbound notice already sent                           |
| `original_export_id`                | UUID FK NULL                                              | If a PDF export existed before the amendment                                             |
| `what_changed`                      | JSONB NOT NULL                                            | `[{ field: string, old_value: string \| null, new_value: string \| null }]`              |
| `change_reason`                     | TEXT NOT NULL                                             | Why this correction was made                                                             |
| `changed_by_id`                     | UUID FK NOT NULL                                          | -> `users`                                                                               |
| `authorised_by_id`                  | UUID FK NULL                                              | -> `users`. Required when `parent_description_locked` was true (authorisation to unlock) |
| `correction_notification_sent`      | BOOLEAN DEFAULT false                                     |                                                                                          |
| `correction_notification_id`        | UUID FK NULL                                              | -> `notifications` — the correction notice sent                                          |
| `correction_notification_sent_at`   | TIMESTAMPTZ NULL                                          |                                                                                          |
| `requires_parent_reacknowledgement` | BOOLEAN DEFAULT false                                     | True when change severity warrants re-ack                                                |
| `parent_reacknowledged_at`          | TIMESTAMPTZ NULL                                          |                                                                                          |
| `created_at`                        | TIMESTAMPTZ NOT NULL DEFAULT NOW()                        | Append-only                                                                              |

**Indexes**:

- `(tenant_id, entity_type, entity_id)` — amendments for a record
- `(tenant_id, correction_notification_sent) WHERE correction_notification_sent = false` — pending queue

**RLS policy**: Standard tenant isolation. Read requires `behaviour.manage`.

**Amendment types**:

- `correction`: factual error in the record (e.g., wrong date, wrong category, typo in description)
- `supersession`: new information materially changes the interpretation (e.g., witnesses found, CCTV reviewed)
- `retraction`: the record should not have existed or should not have been communicated (distinct from `withdrawal` — a retraction applies specifically after outbound communication has already occurred)

---

## Business Logic

### 1. Sanction Creation

Sanctions are created by two routes:

- **Policy engine** (Phase B): the `create_sanction` action in `behaviour_policy_action_executions` calls `SanctionService.createFromPolicy(payload)`. This is the automated path.
- **Manual creation**: `POST /sanctions` by a staff member with `behaviour.manage`. Less common but always available.

On creation:

1. Validate that the linked incident exists and is accessible within the requesting user's scope
2. Generate `sanction_number` via `SequenceService.next('SN', tenantId)`
3. Determine initial `status`:
   - If `suspension_requires_approval = true` (setting) and type is suspension: status = `pending_approval`; create approval request via approvals module
   - If `expulsion_requires_approval = true` and type is expulsion: same
   - Otherwise: status = `scheduled`
4. If type is `suspension_internal`, `suspension_external`, or `expulsion`: compute `suspension_days` using `countSchoolDays(tenantId, suspension_start_date, suspension_end_date)` from `packages/shared/` (excludes `school_closures`)
5. Write `behaviour_entity_history` with `change_type = 'sanction_created'`
6. Enqueue `behaviour_sanction_parent` notification (respects `parent_notification_negative_severity_threshold` and guardian restrictions)
7. Check if exclusion case should be auto-created (see §3 below)
8. If `document_auto_generate_suspension_letter = true` and type is a suspension: queue document generation job (async, not in request cycle)

### 2. Detention Conflict Check

Before confirming a detention sanction, the service checks for scheduling conflicts:

```typescript
// Check timetable conflict
const timetableClash = await tx.schedule_entries.findFirst({
  where: {
    tenant_id: tenantId,
    student_id: studentId,
    date: sanctionData.scheduled_date,
    start_time: { lte: sanctionData.scheduled_end_time },
    end_time: { gte: sanctionData.scheduled_start_time },
  },
});

// Check existing sanctions conflict
const sanctionClash = await tx.behaviour_sanctions.findFirst({
  where: {
    tenant_id: tenantId,
    student_id: studentId,
    scheduled_date: sanctionData.scheduled_date,
    status: { in: ['scheduled', 'pending_approval'] },
    id: { not: sanctionData.id }, // exclude self on update
  },
});
```

If `timetableClash` exists: return a **warning** (not a hard block) with `{ clash_type: 'timetable', details: { period, subject } }`. Staff can proceed with acknowledgement.
If `sanctionClash` exists: return a **warning** with `{ clash_type: 'existing_sanction', details: { sanction_number } }`. Staff can proceed with acknowledgement.
Both warnings surface as non-blocking alerts in the UI.

### 3. Exclusion Case Auto-Creation

When a sanction is created or updated with:

- `type = 'suspension_external'` and `suspension_days >= 5`, OR
- `type = 'expulsion'` or `type` equivalent to permanent exclusion

The service calls `ExclusionCaseService.createFromSanction(sanctionId)` inside the same transaction:

1. Check `behaviour_exclusion_cases` for `sanction_id = sanctionId` — if already exists, skip (idempotent)
2. Generate `case_number` via `SequenceService.next('EX', tenantId)`
3. Map sanction type to case type:
   - `suspension_external` with 5–20 days -> `suspension_extended`
   - `expulsion` -> `expulsion`
   - Manual `managed_move` type -> `managed_move`
4. Set `status = 'initiated'`
5. Auto-populate `statutory_timeline` JSON (see table definition above), computing `required_by` dates from today using `addSchoolDays`
6. Set `legal_hold` on all linked entities (incident, sanction, participants, attachments)
7. Write `behaviour_entity_history` with `change_type = 'created'` for the exclusion case
8. Create a `behaviour_task` with `task_type = 'appeal_review'` for the assigned pastoral staff member, due = first `required_by` date in the timeline, title = `Exclusion case EX-XXXXX: Issue formal notice`

The threshold `suspension_days >= 5` is a hard-coded rule (Irish Education Act threshold). It is not tenant-configurable.

### 4. Suspension Attendance Integration

When a sanction with type `suspension_internal` or `suspension_external` transitions to `scheduled` (i.e., approval granted or no approval required):

1. Call `AttendanceService.markSuspensionAbsence(studentId, suspensionStartDate, suspensionEndDate, sanctionId)`
2. This creates attendance records for each school day in the range with `attendance_code = 'excused_suspended'`
3. The attendance module's dual metrics (with/without suspensions) are unaffected by this — the `excused_suspended` code is the gate for exclusion from the "without suspensions" metric

When a sanction is cancelled or overturned:

1. Call `AttendanceService.reverseSuspensionAbsence(sanctionId)` to remove the `excused_suspended` records for future dates only (past dates are already recorded and immutable)

### 5. Suspension Return Workflow

Three school days before `suspension_end_date`, the `behaviour:suspension-return` daily worker creates a `behaviour_task` for the assigned pastoral manager:

- `task_type = 'return_check_in'`
- `entity_type = 'sanction'`
- `entity_id = sanctionId`
- `title = 'Return check-in: [Student Name] returns [date]'`
- `priority = 'high'`
- `due_date = suspension_end_date`
- `assigned_to_id` = pastoral lead or sanction `supervised_by_id` (fallback to principal)

The task completion form prompts staff to record:

- Return conditions met (checklist from `return_conditions` text)
- Parent meeting outcome (if `parent_meeting_required = true`)
- Any follow-up required

### 6. Bulk Mark Served

`POST /sanctions/bulk-mark-served` accepts `{ sanction_ids: UUID[], served_at: ISO8601, served_by_id: UUID }`.

Execution:

1. Load all sanctions in one query, verify all are `status = 'scheduled'` and belong to this tenant
2. Reject any that are not in the correct state (return partial success with `{ succeeded: [], failed: [] }`)
3. For each valid sanction: transition to `served`, set `served_at`, `served_by_id`
4. Write `behaviour_entity_history` for each
5. Return count summary

This is the primary mechanism for the "today's detentions" supervisor screen.

### 7. Appeal Submission

`POST /appeals` accepts:

```typescript
const SubmitAppealSchema = z.object({
  entity_type: z.enum(['incident', 'sanction']),
  incident_id: z.string().uuid(),
  sanction_id: z.string().uuid().optional(),
  student_id: z.string().uuid(),
  appellant_type: z.enum(['parent', 'student', 'staff']),
  appellant_parent_id: z.string().uuid().optional(),
  appellant_staff_id: z.string().uuid().optional(),
  grounds: z.string().min(20),
  grounds_category: z.enum([
    'factual_inaccuracy',
    'disproportionate_consequence',
    'procedural_error',
    'mitigating_circumstances',
    'mistaken_identity',
    'other',
  ]),
});
```

On submission:

1. Validate `entity_type = 'sanction'` implies `sanction_id` is present
2. Validate no open appeal already exists for this sanction (UNIQUE constraint check)
3. Generate `appeal_number` via `SequenceService.next('AP', tenantId)`
4. If sanction exists and is `scheduled`: transition sanction to `appealed` (write entity history)
5. Set `legal_hold` on incident, sanction, and all linked entities
6. If the appeal is for an exclusion-case sanction: set `exclusion_cases.appeal_id = appealId`
7. Create a `behaviour_task` with `task_type = 'appeal_review'` for a management staff member, due = `submitted_at + 5 school days`
8. Write entity history for appeal creation

**Permission**: `behaviour.manage` for staff-submitted appeals; parents with `behaviour.appeal` permission can submit for their own child.

### 8. Appeal Decision and Outcome Application

`POST /appeals/:id/decide` accepts:

```typescript
const RecordAppealDecisionSchema = z.object({
  decision: z.enum(['upheld_original', 'modified', 'overturned']),
  decision_reasoning: z.string().min(10),
  hearing_notes: z.string().optional(),
  hearing_attendees: z.array(z.object({ name: z.string(), role: z.string() })).optional(),
  amendments: z
    .array(
      z.object({
        entity_type: z.enum(['incident', 'sanction']),
        entity_id: z.string().uuid(),
        field: z.string(),
        new_value: z.string(),
      }),
    )
    .optional(),
});
```

Execution (all in one interactive transaction):

1. Validate appeal is in `submitted`, `under_review`, or `hearing_scheduled` status
2. Set decision fields on appeal record
3. Apply outcome:
   - **`upheld_original`**: No changes to incident or sanction. Transition sanction from `appealed` back to `scheduled` (appeal was rejected, sanction stands). Log entity history.
   - **`modified`**: Apply each amendment in `amendments[]` to the respective entity. If sanction date changed: create a new sanction (old one -> `replaced`, new one -> `scheduled`). Set `resulting_amendments` on appeal. If sanction was `appealed` -> new status depends on amendments (usually `scheduled` with modified terms).
   - **`overturned`**: Transition sanction -> `cancelled` (write entity history). Transition incident -> `closed_after_appeal` (write entity history). If exclusion case linked -> transition to `overturned`.
4. For any entity changed that has `parent_description_locked = true` or already had a notification sent: create `behaviour_amendment_notices` record(s) with `amendment_type = 'supersession'`, `what_changed` populated from amendments
5. Auto-generate `appeal_decision_letter` document from template (type: `appeal_decision_letter`). Queue as async BullMQ job: `behaviour:generate-document`. Set `appeal.status = 'decided'`.
6. Enqueue `behaviour_appeal_outcome` notification to appellant (email + in-app)
7. If amendment notices were created: enqueue `behaviour_correction_parent` notifications for affected parents
8. Release legal holds that no longer apply (if appeal is decided and no exclusion case remains open)

### 9. Amendment Workflow

The amendment workflow fires automatically whenever a mutation touches a parent-visible field on an incident or sanction that has already had a parent notification dispatched (`parent_notification_status = 'sent'` or `'delivered'` or `'acknowledged'`).

**Parent-visible fields** (any change to these triggers the workflow):

- `behaviour_incidents`: `category_id`, `parent_description`, `parent_description_ar`, `occurred_at`
- `behaviour_sanctions`: `type`, `scheduled_date`, `suspension_start_date`, `suspension_end_date`

**Three-step process**:

**Step 1 — Change detection** (in `IncidentService.update()` and `SanctionService.update()`):

```typescript
const previousValues = await tx.behaviour_incidents.findUniqueOrThrow({ where: { id } });

// Apply the update...

const notificationSent =
  previousValues.parent_notification_status !== 'not_required' &&
  previousValues.parent_notification_status !== 'pending';

const parentVisibleFieldChanged = PARENT_VISIBLE_FIELDS.some(
  (f) => payload[f] !== undefined && payload[f] !== previousValues[f],
);

if (notificationSent && parentVisibleFieldChanged) {
  await AmendmentService.createAmendmentNotice({
    entityType,
    entityId,
    changedBy,
    previousValues,
    newValues,
    reason,
  });
}
```

**Step 2 — Amendment notice creation** (`AmendmentService.createAmendmentNotice()`):

1. If `parent_description_locked = true` on the incident:
   - Require `behaviour.manage` permission AND `reason` must be non-empty
   - The unlock is the authorisation step; set `authorised_by_id` on the amendment notice
   - Unlock: set `parent_description_locked = false` temporarily. Re-lock after save.
2. Determine `amendment_type`:
   - Typo/date error -> `correction`
   - New evidence/category change -> `supersession`
   - Record should not have been communicated -> `retraction`
     Staff select this explicitly in the UI; default is `correction`.
3. Build `what_changed` JSONB diff from `previousValues` vs `newValues` for parent-visible fields only
4. Insert `behaviour_amendment_notices` record
5. Write `behaviour_entity_history` with `change_type = 'amendment_sent'`

**Step 3 — Correction notification** (dispatched from `AmendmentService.sendCorrectionNotification()`):

1. Enqueue `behaviour_correction_parent` notification (per parent preference channels)
2. Set `correction_notification_sent = true`, `correction_notification_sent_at`
3. If `requires_parent_reacknowledgement = true`: enqueue `behaviour_reacknowledgement_request` notification; create `behaviour_parent_acknowledgements` record with `amendment_notice_id` reference
4. If a PDF document was previously generated and sent (`behaviour_documents` with `status = 'sent'`): mark that document `status = 'superseded'`, set `superseded_reason = 'Amended — [date]'`; queue a new document generation with "Amended — [date]" watermark

**Parent description lock/unlock rules**:

- `parent_description_locked` is set to `true` automatically when `parent_description_auto_lock_on_send = true` (setting default: true) at the moment the parent notification dispatches
- Once locked, `parent_description` cannot be edited without the amendment workflow
- Any edit attempt on a locked description without `behaviour.manage` permission returns `403 Forbidden`
- With `behaviour.manage`: the edit proceeds through the amendment workflow, `authorised_by_id` is recorded

---

## API Endpoints

### 8.3 Sanctions — `behaviour-sanctions.controller.ts` (14 endpoints)

| Method | Route                                       | Description                                                                                            | Permission                               |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| POST   | `v1/behaviour/sanctions`                    | Create sanction manually                                                                               | `behaviour.manage`                       |
| GET    | `v1/behaviour/sanctions`                    | Paginated list with filters (student, type, status, date range)                                        | `behaviour.manage`                       |
| GET    | `v1/behaviour/sanctions/:id`                | Full sanction detail including history                                                                 | `behaviour.manage`                       |
| PATCH  | `v1/behaviour/sanctions/:id`                | Update (notes, room, supervisor, times)                                                                | `behaviour.manage`                       |
| PATCH  | `v1/behaviour/sanctions/:id/status`         | Status transition with reason                                                                          | `behaviour.manage`                       |
| GET    | `v1/behaviour/sanctions/today`              | All scheduled sanctions for today, grouped by type                                                     | `behaviour.manage`                       |
| GET    | `v1/behaviour/sanctions/my-supervision`     | Sanctions where caller is supervised_by_id                                                             | `behaviour.view`                         |
| POST   | `v1/behaviour/sanctions/:id/parent-meeting` | Schedule/record parent meeting outcome                                                                 | `behaviour.manage`                       |
| POST   | `v1/behaviour/sanctions/:id/appeal`         | Lodge appeal against this sanction (convenience route; delegates to appeals controller)                | `behaviour.manage` or `behaviour.appeal` |
| PATCH  | `v1/behaviour/sanctions/:id/appeal-outcome` | Record appeal outcome on sanction (called by appeals service on decide; not typically called directly) | `behaviour.manage`                       |
| GET    | `v1/behaviour/sanctions/calendar`           | Calendar view: sanctions by date range                                                                 | `behaviour.manage`                       |
| GET    | `v1/behaviour/sanctions/active-suspensions` | All students currently serving suspensions                                                             | `behaviour.manage`                       |
| GET    | `v1/behaviour/sanctions/returning-soon`     | Students whose suspension ends in next 5 school days                                                   | `behaviour.manage`                       |
| POST   | `v1/behaviour/sanctions/bulk-mark-served`   | Mark multiple sanctions served at once                                                                 | `behaviour.manage`                       |

**Query filters for GET /sanctions**: `student_id`, `type`, `status`, `supervised_by_id`, `date_from`, `date_to`, `incident_id`, `page`, `pageSize` (default 20, max 100).

**Response shape** (list item):

```typescript
{
  id: string;
  sanction_number: string;
  student: { id: string; name: string; year_group: string };
  type: SanctionType;
  status: SanctionStatus;
  scheduled_date: string; // ISO date
  suspension_start_date: string | null;
  suspension_end_date: string | null;
  suspension_days: number | null;
  supervised_by: { id: string; name: string } | null;
  incident: { id: string; incident_number: string; category_name: string };
  approval_status: ApprovalStatus;
  created_at: string;
}
```

---

### 8.6 Appeals — `behaviour-appeals.controller.ts` (10 endpoints)

| Method | Route                                               | Description                                                                    | Permission                                                       |
| ------ | --------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| POST   | `v1/behaviour/appeals`                              | Submit appeal                                                                  | `behaviour.manage` or parent with `behaviour.appeal` (own child) |
| GET    | `v1/behaviour/appeals`                              | Paginated list with filters (status, grounds_category, student_id, date range) | `behaviour.manage`                                               |
| GET    | `v1/behaviour/appeals/:id`                          | Full appeal detail with timeline, hearing notes, resulting amendments          | `behaviour.manage`                                               |
| PATCH  | `v1/behaviour/appeals/:id`                          | Update (assign reviewer, schedule hearing, add hearing attendees)              | `behaviour.manage`                                               |
| POST   | `v1/behaviour/appeals/:id/decide`                   | Record decision + auto-apply amendments to incident/sanction                   | `behaviour.manage`                                               |
| POST   | `v1/behaviour/appeals/:id/withdraw`                 | Withdraw appeal (by management or appellant)                                   | `behaviour.manage` or appellant                                  |
| POST   | `v1/behaviour/appeals/:id/attachments`              | Upload evidence for the appeal                                                 | `behaviour.manage`                                               |
| GET    | `v1/behaviour/appeals/:id/attachments`              | List appeal evidence                                                           | `behaviour.manage`                                               |
| POST   | `v1/behaviour/appeals/:id/generate-decision-letter` | Generate decision letter from template                                         | `behaviour.manage`                                               |
| GET    | `v1/behaviour/appeals/:id/evidence-bundle`          | Export complete evidence bundle as PDF (async; returns job ID)                 | `behaviour.manage`                                               |

**Evidence bundle contents** (assembled by async job, delivered as single PDF):

- Appeal submission details (grounds, grounds category, submitted at, appellant)
- Original incident record with `context_snapshot`
- Original sanction record (if applicable)
- All appeal attachments with classification labels
- Hearing minutes (if hearing was held)
- Decision and full reasoning
- Resulting amendments list
- Timeline of all status changes (from `behaviour_entity_history`)

**Query filters for GET /appeals**: `status`, `grounds_category`, `student_id`, `entity_type`, `date_from`, `date_to`, `reviewer_id`, `page`, `pageSize`.

---

### 8.13 Exclusion Cases — `behaviour-exclusions.controller.ts` (10 endpoints)

| Method | Route                                                  | Description                                                                      | Permission         |
| ------ | ------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------ |
| POST   | `v1/behaviour/exclusion-cases`                         | Create manually from a sanction                                                  | `behaviour.manage` |
| GET    | `v1/behaviour/exclusion-cases`                         | Paginated list with filters (status, type, student_id)                           | `behaviour.manage` |
| GET    | `v1/behaviour/exclusion-cases/:id`                     | Full case detail with statutory timeline and linked documents                    | `behaviour.manage` |
| PATCH  | `v1/behaviour/exclusion-cases/:id`                     | Update case fields (hearing date, attendees, conditions, student representation) | `behaviour.manage` |
| PATCH  | `v1/behaviour/exclusion-cases/:id/status`              | Status transition with reason                                                    | `behaviour.manage` |
| POST   | `v1/behaviour/exclusion-cases/:id/generate-notice`     | Generate and dispatch formal exclusion notice (exclusion_notice document)        | `behaviour.manage` |
| POST   | `v1/behaviour/exclusion-cases/:id/generate-board-pack` | Assemble board pack evidence bundle (queued async job)                           | `behaviour.manage` |
| POST   | `v1/behaviour/exclusion-cases/:id/record-decision`     | Record hearing decision and generate decision letter                             | `behaviour.manage` |
| GET    | `v1/behaviour/exclusion-cases/:id/timeline`            | Statutory timeline steps with current computed status (green/amber/red)          | `behaviour.manage` |
| GET    | `v1/behaviour/exclusion-cases/:id/documents`           | All generated documents for this case                                            | `behaviour.manage` |

**Generate board pack** (`POST /exclusion-cases/:id/generate-board-pack`):
The service enqueues a `behaviour:generate-document` job with `document_type = 'board_pack'`. The job assembles the following as a single PDF:

1. Case summary sheet (case number, type, student, dates, current status)
2. Incident detail with `context_snapshot` (category, severity, description)
3. Escalation chain — all linked incidents (`escalated_from_id` chain)
4. Student behaviour profile summary (last 12 months: incident count by category, points trend, sanctions history)
5. Active and recent intervention history with latest review notes
6. All attached evidence (`behaviour_attachments` linked to incident + sanction), each with classification label and upload date
7. Sanction history (full list for this student, current academic year)
8. Chronological timeline (from `behaviour_entity_history`) with timestamps and actors
9. Table of contents with page numbers

The job response includes `document_id`. The client polls `GET /documents/:id` for status. When `status = 'draft'`, the document is available for review before finalising.

**Record decision** (`POST /exclusion-cases/:id/record-decision`) accepts:

```typescript
const RecordExclusionDecisionSchema = z.object({
  decision: z.enum([
    'exclusion_confirmed',
    'exclusion_modified',
    'exclusion_reversed',
    'alternative_consequence',
  ]),
  decision_reasoning: z.string().min(10),
  decided_by_id: z.string().uuid(),
  conditions_for_return: z.string().optional(),
  conditions_for_transfer: z.string().optional(),
});
```

On execution:

1. Set decision fields, compute `appeal_deadline = addSchoolDays(tenantId, today, 15)`
2. Transition case status: `hearing_held -> decision_made -> appeal_window` (both transitions applied)
3. Generate `exclusion_decision_letter` document
4. Enqueue `behaviour_exclusion_decision_parent` notification (always email + in-app)
5. Update `statutory_timeline`: mark "Decision communicated to parents in writing" step as complete, populate "Appeal window" step's `required_by` date
6. If decision is `exclusion_reversed`: transition linked sanction to `cancelled`; create amendment notice if notification was already sent

**Query filters for GET /exclusion-cases**: `status`, `type`, `student_id`, `has_appeal`, `appeal_deadline_before`, `page`, `pageSize`.

---

### 8.16 Amendment Notices — `behaviour-amendments.controller.ts` (4 endpoints)

| Method | Route                                         | Description                                                                                      | Permission         |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| GET    | `v1/behaviour/amendments`                     | Paginated list of all amendment notices (filter by entity_type, amendment_type, correction_sent) | `behaviour.manage` |
| GET    | `v1/behaviour/amendments/:id`                 | Detail with full `what_changed` diff and linked entity summary                                   | `behaviour.manage` |
| POST   | `v1/behaviour/amendments/:id/send-correction` | Dispatch the correction notification now (if not yet sent)                                       | `behaviour.manage` |
| GET    | `v1/behaviour/amendments/pending`             | All amendment notices where `correction_notification_sent = false`                               | `behaviour.manage` |

The `/amendments/pending` endpoint is the primary driver of the `/behaviour/amendments` frontend page — it shows the work queue of corrections that still need to be communicated to parents.

---

## Frontend Pages

### `/behaviour/sanctions`

**Purpose**: Full sanction management list for pastoral/management staff.

**Layout**:

- Filter bar: type (all / detention / suspension / expulsion), status (all / scheduled / served / pending / appealed / cancelled), date range, student search
- List: sanction_number, student name + year group, type badge, status badge, scheduled_date, supervised_by, incident link
- Quick action: "Mark Served" inline for `scheduled` detentions
- Calendar toggle: switch between list view and calendar view (day/week/month)
- "Today" shortcut button -> navigates to `/behaviour/sanctions/today`

**Permissions**: `behaviour.manage`

---

### `/behaviour/sanctions/today`

**Purpose**: Supervisor screen for today's detentions. Optimised for bulk operations.

**Layout**:

- Header: date, total scheduled, total served / remaining
- Grouped by room then by time slot
- Each student row: name, year group, incident category, notes
- Per-row status toggle: scheduled -> served / no_show / partially_served / excused
- Bulk select + "Mark All Selected as Served" button
- No-show count badge (creates rescheduling task automatically)

**Permissions**: `behaviour.manage` or `behaviour.view` (read-only for view-only users)

---

### `/behaviour/appeals`

**Purpose**: Appeal management list.

**Layout**:

- Status tabs: All / Submitted / Under Review / Hearing Scheduled / Decided / Withdrawn
- Filter: grounds_category, date range, student
- List: appeal_number, student, entity_type badge, grounds_category badge, submitted_at, status badge, reviewer (if assigned), hearing_date (if set), decision badge (if decided)
- "Assign Reviewer" quick action on submitted appeals

**Permissions**: `behaviour.manage`

---

### `/behaviour/appeals/[id]`

**Purpose**: Full appeal detail and management.

**Sections**:

1. **Header**: appeal_number, status badge, student name, entity linked (incident or sanction with link)
2. **Appellant**: name, role, submitted_at, grounds (full text), grounds_category
3. **Status timeline**: visual step progress (submitted -> under review -> hearing scheduled -> decided)
4. **Reviewer assignment**: assign/reassign reviewer; current reviewer shown
5. **Hearing**: schedule hearing (date + time picker); attendees (add/remove); hearing notes (SENSITIVE — only shown to users with `behaviour.view_sensitive`)
6. **Decision form** (shown when status allows): decision selector, reasoning textarea, amendments table (for `modified` decision — add field/old/new rows), hearing notes capture, generate decision letter button
7. **Resulting amendments**: shown after decision; structured diff table
8. **Evidence**: attachment upload, attachment list with download links
9. **Entity history**: full audit trail for this appeal

**Actions**:

- Withdraw appeal (with reason)
- Generate decision letter (after decision recorded)
- Download evidence bundle (async job; progress indicator)

---

### `/behaviour/exclusions`

**Purpose**: Exclusion case list with statutory compliance overview.

**Layout**:

- Status tabs: All / Initiated / Notice Issued / Hearing Scheduled / Decision Made / Appeal Window / Finalised / Overturned
- Compliance indicator: per-row amber/red badge if any `statutory_timeline` step is overdue
- List: case_number, student, type badge, status badge, formal_notice_issued_at, hearing_date, decision badge, appeal_deadline (with days-remaining counter in amber/red when < 3 days)

**Permissions**: `behaviour.manage`

---

### `/behaviour/exclusions/[id]`

**Purpose**: Full exclusion case management.

**Sections**:

1. **Header**: case_number, type badge, status badge, student link, linked sanction link, linked incident link
2. **Statutory timeline checklist**: step-by-step progress with required_by dates; green (complete), amber (due soon), red (overdue), grey (not started). Each step has a "Mark complete" button where applicable.
3. **Formal notice**: generate notice button (triggers document generation); notice status (draft / finalised / sent); send button; sent_at timestamp
4. **Hearing**: schedule hearing form (date, attendees, student representation); hearing minutes upload; mark hearing held
5. **Board pack**: generate button (async; progress indicator); view/download when ready
6. **Decision**: form to record decision (decision enum, reasoning, conditions for return, conditions for transfer); decided_by; decision date; generate decision letter
7. **Appeal**: appeal_deadline counter; linked appeal (if any) with status and link; "Mark finalised" (if deadline passed with no appeal)
8. **Documents**: all `behaviour_documents` for this case (notices, minutes, board pack, decision letter)
9. **Entity history**: full audit trail

**Permissions**: `behaviour.manage`

---

### `/behaviour/amendments`

**Purpose**: Amendment work queue — corrections pending communication to parents.

**Layout**:

- Tab: Pending (correction not yet sent) / All
- List: entity reference (e.g., incident BH-000123), amendment_type badge, what_changed summary (e.g., "Category changed from Verbal Warning to Written Warning"), changed_by, changed_at, requires_parent_reacknowledgement badge
- Per-row action: "Send Correction" button for pending amendments (confirmation dialog showing what will be sent)
- On send: dispatches `behaviour_correction_parent` notification; if re-ack required, also dispatches `behaviour_reacknowledgement_request`
- Empty state when no pending items

**Permissions**: `behaviour.manage`

---

## Worker Jobs

### `behaviour:suspension-return`

| Attribute | Value                                |
| --------- | ------------------------------------ |
| Queue     | `behaviour`                          |
| Trigger   | Cron, daily at 07:00 tenant timezone |
| Class     | Extends `TenantAwareJob`             |
| Job name  | `behaviour:suspension-return`        |

**Algorithm**:

For each tenant:

1. Load the tenant's timezone from `tenant_settings`
2. Compute `target_date = addSchoolDays(tenantId, today, 3)` — school days only, respects `school_closures`
3. Query:
   ```prisma
   behaviour_sanctions.findMany({
     where: {
       tenant_id: tenantId,
       status: { in: ['scheduled', 'not_served_absent'] },
       type: { in: ['suspension_internal', 'suspension_external'] },
       suspension_end_date: target_date,
       retention_status: 'active',
     }
   })
   ```
4. For each result, check if a `return_check_in` task already exists for this sanction (prevents duplicate task creation on retry):
   ```prisma
   behaviour_tasks.findFirst({
     where: {
       tenant_id: tenantId,
       entity_type: 'sanction',
       entity_id: sanctionId,
       task_type: 'return_check_in',
       status: { not: 'cancelled' },
     }
   })
   ```
5. If no existing task: create `behaviour_task` with:
   - `task_type = 'return_check_in'`
   - `entity_type = 'sanction'`, `entity_id = sanction.id`
   - `title = 'Return check-in: {student_name} returns on {suspension_end_date}'`
   - `description = 'Student is returning from suspension. Verify return conditions are met.'`
   - `assigned_to_id` = `sanction.supervised_by_id` if set; otherwise lookup pastoral lead for student's year group; otherwise principal user_id
   - `priority = 'high'`
   - `due_date = suspension_end_date`
   - `created_by_id` = system user ID
6. Log total tasks created in job result

**Idempotency**: The task existence check (step 4) ensures the job can be retried safely without creating duplicate tasks.

**Payload** (job must include `tenant_id` per worker rules):

```typescript
interface SuspensionReturnJobPayload {
  tenant_id: string;
}
```

The cron schedules one job per tenant at their 07:00 local time.

---

## Notification Templates

The following templates must be registered in the notifications module seed for Phase C. All templates exist in English and Arabic (`locale: 'en'` and `locale: 'ar'`).

| Template Key                          | Trigger                                                          | Channels                       | Content Summary                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `behaviour_sanction_parent`           | Sanction created (all types)                                     | Per parent preference + email  | Informs parent that a sanction (detention / suspension / other) has been issued. Includes: student name, sanction type, date, and a brief reason derived from `parent_description` or category name. For suspensions: includes start date, end date, and return conditions if set. Subject: "Behaviour Notice: [Sanction Type] for [Student Name]"                                                  |
| `behaviour_appeal_outcome`            | Appeal decided                                                   | In-app + email                 | Informs appellant of the decision. Includes: appeal number, decision (upheld/modified/overturned), decision reasoning summary, resulting amendments (if any), and next steps. Subject: "Appeal [AP-XXXXXX] Decision"                                                                                                                                                                                |
| `behaviour_exclusion_notice_parent`   | Exclusion case formal notice generated and sent                  | Email (always) + in-app        | Formal statutory notice to parents. Includes: student name, exclusion type, suspension dates, reason (parent_description), right to representation, hearing date (if known), contact details for queries. Sent as both in-app notification and email attachment (the generated PDF is attached). Subject: "Important: Formal Exclusion Notice for [Student Name]"                                   |
| `behaviour_exclusion_decision_parent` | Exclusion decision recorded                                      | Email (always) + in-app        | Communicates the board/principal's decision following hearing. Includes: decision outcome, any modified terms, appeal rights, appeal deadline date. Subject: "Exclusion Decision: [Student Name]"                                                                                                                                                                                                   |
| `behaviour_correction_parent`         | Amendment notice created (correction notification step 3)        | Per parent preference channels | Notifies parent that a previous communication about their child has been corrected. Includes: what was corrected (from `what_changed` diff rendered as human-readable text), the original date of the initial communication, the reason for the correction. Does NOT include internal staff names or descriptions beyond the parent-safe fields. Subject: "Correction to Previous Behaviour Notice" |
| `behaviour_reacknowledgement_request` | Amendment notice with `requires_parent_reacknowledgement = true` | In-app + email                 | Requests parent to re-acknowledge updated behaviour record. Includes: what changed, link to parent portal acknowledgement button. Subject: "Please Re-Confirm: Updated Behaviour Notice for [Student Name]"                                                                                                                                                                                         |

**Template merge fields available** for all Phase C templates:

- `{{student_name}}`, `{{student_year_group}}`, `{{school_name}}`, `{{school_logo}}`, `{{principal_name}}`, `{{today_date}}`
- `{{sanction_type}}`, `{{sanction_date}}`, `{{suspension_start_date}}`, `{{suspension_end_date}}`, `{{return_conditions}}`
- `{{appeal_number}}`, `{{appeal_decision}}`, `{{appeal_reasoning}}`, `{{resulting_amendments}}`
- `{{exclusion_case_number}}`, `{{exclusion_type}}`, `{{hearing_date}}`, `{{appeal_deadline}}`
- `{{correction_what_changed}}` — rendered as: "The [field name] was updated from '[old value]' to '[new value]'"
- `{{original_notification_date}}` — date of the original parent notification

---

## Acceptance Criteria

### Sanction Lifecycle

- [ ] Policy engine's `create_sanction` action creates a `behaviour_sanctions` record with the correct initial status (`pending_approval` or `scheduled`) based on tenant settings
- [ ] Approval flow: when `approval_status = 'pending'`, the sanction is blocked from transition to `scheduled` until the approvals module callback fires
- [ ] Detention conflict check: creating a detention on a date/time that clashes with timetable or existing sanction returns warnings in the response (not a hard block)
- [ ] Suspension attendance: when a suspension sanction is confirmed (`scheduled`), attendance records are created for each school day in range with `excused_suspended` code
- [ ] Bulk mark served: `POST /sanctions/bulk-mark-served` with 10 sanction IDs marks all 10 served in one transaction; partial failures do not roll back successes
- [ ] Rescheduling: transitioning a sanction to `rescheduled` sets the current sanction to `superseded` and creates a new sanction linked to the same incident
- [ ] All state transitions write `behaviour_entity_history` records
- [ ] Invalid state transitions (e.g., `served -> appealed`) return `400 Bad Request`

### Exclusion Cases

- [ ] Exclusion case auto-created when suspension_days >= 5 on `suspension_external` sanction
- [ ] `EX-` sequence number generated correctly
- [ ] Statutory timeline populated with correct calculated dates on case creation
- [ ] Timeline step status computed dynamically (overdue if `required_by` is past and `completed_at` is null)
- [ ] Legal hold auto-set on all linked entities when exclusion case is created
- [ ] Board pack generation queued as async job; returns document_id for polling
- [ ] Decision recording transitions case status through `decision_made -> appeal_window` and calculates `appeal_deadline = today + 15 school days`
- [ ] `behaviour_exclusion_decision_parent` notification dispatched on decision record

### Appeals

- [ ] Appeal submission validates no open appeal already exists for the sanction
- [ ] `AP-` sequence number generated correctly
- [ ] Sanction transitions to `appealed` status when appeal is submitted for a `scheduled` sanction
- [ ] Legal hold set on all linked entities on appeal submission
- [ ] `decide` endpoint in a single transaction: updates appeal, applies outcome to incident/sanction, creates amendment notices if needed, enqueues notifications
- [ ] `upheld_original` decision: sanction transitions from `appealed` back to `scheduled`
- [ ] `overturned` decision: sanction transitions to `cancelled`; incident transitions to `closed_after_appeal`
- [ ] Evidence bundle download returns a single PDF containing all required sections
- [ ] Decision letter generated from template and linked to appeal record

### Amendment Workflow

- [ ] Editing `category_id` on an incident with `parent_notification_status = 'sent'` auto-creates an amendment notice
- [ ] Editing a `parent_description_locked = true` field without `behaviour.manage` returns `403 Forbidden`
- [ ] With `behaviour.manage`: edit proceeds through amendment workflow, `authorised_by_id` recorded
- [ ] `POST /amendments/:id/send-correction` dispatches `behaviour_correction_parent` notification
- [ ] When `requires_parent_reacknowledgement = true`: `behaviour_reacknowledgement_request` also dispatched
- [ ] Superseded PDF: existing sent document marked `superseded`; new document generated with "Amended" watermark
- [ ] `/amendments/pending` returns only amendment notices where `correction_notification_sent = false`

### Worker Job

- [ ] `behaviour:suspension-return` runs daily at 07:00 tenant timezone
- [ ] Creates `return_check_in` task exactly 3 school days before `suspension_end_date`
- [ ] Does not create duplicate tasks if re-run on the same day (idempotent)
- [ ] Respects `school_closures` when counting 3 school days
- [ ] `assigned_to_id` resolved: `supervised_by_id` -> pastoral lead -> principal fallback

---

## Test Requirements

### Unit Tests

**`SanctionService`** (`behaviour-sanctions.service.spec.ts`):

- `should create sanction with pending_approval status when suspension_requires_approval is true`
- `should create sanction with scheduled status when approval not required`
- `should return conflict warning when detention clashes with timetable entry`
- `should not block detention creation despite conflict (warning only)`
- `should compute suspension_days excluding school closures`
- `should transition scheduled -> served and write entity history`
- `should throw BadRequestException for invalid state transition (served -> appealed)`
- `edge: should handle bulk-mark-served with mix of valid and invalid sanction IDs (partial success)`
- `should trigger exclusion case creation when suspension_days >= 5 on external suspension`
- `should not create duplicate exclusion case if one already exists for sanction`

**`ExclusionCaseService`** (`behaviour-exclusion-cases.service.spec.ts`):

- `should generate EX- sequence number on creation`
- `should populate statutory_timeline with correctly calculated dates`
- `should mark timeline step overdue when required_by is past and completed_at is null`
- `should set legal hold on incident, sanction, and all linked entities`
- `should transition status through notice_issued -> hearing_scheduled -> hearing_held -> decision_made -> appeal_window`
- `should throw BadRequestException for invalid exclusion case transition`
- `should calculate appeal_deadline as 15 school days from decision_date`

**`AppealService`** (`behaviour-appeals.service.spec.ts`):

- `should generate AP- sequence number on submission`
- `should transition linked sanction to appealed on submission`
- `should reject submission if open appeal already exists for the sanction`
- `should set legal hold on incident and sanction on submission`
- `should apply upheld_original: revert sanction from appealed to scheduled`
- `should apply overturned: cancel sanction and set incident to closed_after_appeal`
- `should apply modified: create replacement sanction and set original to replaced`
- `should auto-create amendment notices when decision modifies parent-visible fields`
- `edge: decide endpoint must be atomic — if amendment notice creation fails, entire transaction rolls back`

**`AmendmentService`** (`behaviour-amendments.service.spec.ts`):

- `should create amendment notice when parent-notified incident category is changed`
- `should create amendment notice when parent-notified sanction date is changed`
- `should not create amendment notice if notification was not yet sent`
- `should throw 403 when editing parent_description_locked=true without behaviour.manage`
- `should record authorised_by_id when behaviour.manage unlocks locked description`
- `should mark original document superseded and queue new document with watermark`
- `should set requires_parent_reacknowledgement=true when severity >= threshold`

**`SuspensionReturnWorker`** (`behaviour-suspension-return.processor.spec.ts`):

- `should create return_check_in task 3 school days before suspension_end_date`
- `should not create duplicate task if one already exists for the sanction`
- `should skip school_closures when counting 3 school days`
- `should fall back to pastoral lead if supervised_by_id is null`
- `should fall back to principal if pastoral lead also not found`

### Integration Tests (RLS)

- `should not return exclusion cases belonging to another tenant`
- `should not return appeals belonging to another tenant`
- `should not return amendment notices belonging to another tenant`
- `Tenant A's sanction cannot be retrieved by Tenant B via GET /sanctions/:id`

### Permission Tests

- `GET /sanctions without behaviour.manage returns 403`
- `POST /appeals/:id/decide without behaviour.manage returns 403`
- `Parent with behaviour.appeal can submit appeal for own child`
- `Parent with behaviour.appeal cannot submit appeal for a different student`
- `GET /amendments without behaviour.manage returns 403`
- `PATCH incident with locked parent_description without behaviour.manage returns 403`
