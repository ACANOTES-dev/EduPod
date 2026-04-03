# Behaviour Management Module — Full Specification v3.0

> **Module**: `modules/behaviour/` + `modules/safeguarding/`
> **Priority**: Non-negotiable — Phase 2 launch-gate feature
> **Spec version**: 3.0 Final — 26 March 2026
> **Review history**: v1.0 → 14 findings → v2.0 → 15 findings → v3.0
> **Estimated scope**: ~135 endpoints, ~28 frontend pages, 11 worker jobs, 7 settings pages
> **Estimated implementation**: 12–13 weeks (see §14)

---

## Version History

### v1.0 → v2.0 (14 findings)

| #   | Finding                              | Resolution                                                                                         |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1   | Policy engine too shallow            | Full rule-based policy matrix with conditions, actions, and year-group/context variance            |
| 2   | No evidence layer                    | `behaviour_attachments` table with metadata, checksums, classification, visibility, retention      |
| 3   | Dual group incident model            | Removed. Single model: one incident, many participants. Participants expanded beyond students      |
| 4   | Permissions too broad                | Scope-based access (own/class/year_group/pastoral/all) + field-level visibility rules              |
| 5   | Quick-log under-specified            | Local cache, offline queue, deterministic matching first, AI as fallback, bulk logging, favourites |
| 6   | No task/action model                 | `behaviour_tasks` table — unified action tracker                                                   |
| 7   | State machines too light             | Expanded incident and sanction states                                                              |
| 8   | Analytics not exposure-adjusted      | All rate metrics normalised by contact hours. Pulse split into 5 dimensions                        |
| 9   | AI governance missing                | Confidence thresholds, fallback, audit, tenant opt-in, no diagnostic language, retention policy    |
| 10  | Safeguarding not inspection-grade    | No delete (seal only), SLA tracking, critical escalation, DLP fallback, reporter acknowledgement   |
| 11  | Parent communication not productised | Delivery logs, acknowledgement tracking, digest rules, guardian-specific visibility, consent       |
| 12  | ETB benchmarking not comparable      | Canonical benchmark taxonomy mapping with cohort thresholds and anonymity rules                    |
| 13  | Missing support tables               | All referenced entities now have explicit tables                                                   |
| 14  | Scope estimate materially off        | Revised estimate with phase breakdown                                                              |

### v2.0 → v3.0 (15 findings)

| #   | Finding                                                          | Resolution                                                                                                 |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 15  | Policy engine needs versioning and decision-level explainability | Policy rule versions, evaluation ledger with input snapshots, action execution log                         |
| 16  | Historical truth under-modelled                                  | `context_snapshot` JSONB frozen at creation; student snapshot per participant; temporal exposure snapshots |
| 17  | Offline quick-log needs idempotency and compensating actions     | Client idempotency key, server dedupe, local temp IDs, compensating withdrawal, dedup guards               |
| 18  | Participant domain boundary unclear                              | Constraint: every incident must have at least one student participant                                      |
| 19  | Parent-safe content not solved                                   | `parent_description` field with generation rules, staff review gate, redaction on render                   |
| 20  | Appeals not first-class                                          | `behaviour_appeals` table with full lifecycle, evidence, hearing, outcome, amendment tracking              |
| 21  | Alerts need ownership                                            | `behaviour_alert_recipients` table with per-user state                                                     |
| 22  | Attachment security needs hardening                              | AV scan, signed URLs, SSE-S3 encryption, object lock, version tracking, legal hold                         |
| 23  | Safeguarding privacy leak via `converted_to_safeguarding` status | Permission-projected status rendering                                                                      |
| 24  | Break-glass needs post-access governance                         | After-action review, accessed-records log, review queue                                                    |
| 25  | Awards need repeatability semantics                              | `repeat_mode`, tier groups, supersedes, auto-award dedup                                                   |
| 26  | Description templates need a real table                          | `behaviour_description_templates` first-class entity                                                       |
| 27  | Operational control-plane missing                                | Admin operations controller with recompute, rebuild, health checks, dead-letter                            |
| 28  | Timezone and school-calendar semantics unresolved                | All time logic uses tenant TZ. "Days" means school days. Holiday-aware reminders/SLAs                      |
| 29  | Search/exports/analytics need visibility-class discipline        | Formal 5-class data classification model enforced across all surfaces                                      |

---

## 1. Vision

Five design principles:

1. **Speed above all**: 5-second quick-log from phone. If it's slower than a sticky note, teachers won't use it.
2. **Positive-first culture**: Architecturally biased toward recognition. The system should change school culture, not just track behaviour.
3. **Cross-module intelligence**: Behaviour linked to attendance, scheduling, grades, and communications in the same database. Structurally impossible for siloed competitors.
4. **Safeguarding is sacred**: Separate permission domain, every access audit-logged, inspection-grade chronology.
5. **ETB-ready from day one**: Anonymous cross-school benchmarking with standardised taxonomy.

v2.0 added **institutional trust** — the hidden mechanics that make schools trust the system. v3.0 adds **forensic defensibility** — every policy decision is provable, every historical record is temporally frozen, every data surface respects formal visibility classification.

---

## 2. Data Model

### 2.1 Core Tables

#### `behaviour_categories`

Configurable per tenant. The taxonomy of everything that can be recorded.

| Column                         | Type                                                                                                                                                                                                              | Notes                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `id`                           | UUID PK                                                                                                                                                                                                           | `gen_random_uuid()`                    |
| `tenant_id`                    | UUID FK NOT NULL                                                                                                                                                                                                  | RLS                                    |
| `name`                         | VARCHAR(100) NOT NULL                                                                                                                                                                                             |                                        |
| `name_ar`                      | VARCHAR(100)                                                                                                                                                                                                      | Arabic translation                     |
| `polarity`                     | ENUM('positive', 'negative', 'neutral') NOT NULL                                                                                                                                                                  |                                        |
| `severity`                     | INT NOT NULL                                                                                                                                                                                                      | 1–10 scale                             |
| `point_value`                  | INT NOT NULL DEFAULT 0                                                                                                                                                                                            |                                        |
| `color`                        | VARCHAR(7)                                                                                                                                                                                                        | Hex                                    |
| `icon`                         | VARCHAR(50)                                                                                                                                                                                                       | Lucide icon name                       |
| `requires_follow_up`           | BOOLEAN DEFAULT false                                                                                                                                                                                             |                                        |
| `requires_parent_notification` | BOOLEAN DEFAULT false                                                                                                                                                                                             |                                        |
| `parent_visible`               | BOOLEAN DEFAULT true                                                                                                                                                                                              |                                        |
| `benchmark_category`           | ENUM('praise', 'merit', 'minor_positive', 'major_positive', 'verbal_warning', 'written_warning', 'detention', 'internal_suspension', 'external_suspension', 'expulsion', 'note', 'observation', 'other') NOT NULL | Canonical mapping for ETB benchmarking |
| `display_order`                | INT NOT NULL DEFAULT 0                                                                                                                                                                                            |                                        |
| `is_active`                    | BOOLEAN DEFAULT true                                                                                                                                                                                              |                                        |
| `is_system`                    | BOOLEAN DEFAULT false                                                                                                                                                                                             |                                        |
| `created_at`                   | TIMESTAMPTZ                                                                                                                                                                                                       |                                        |
| `updated_at`                   | TIMESTAMPTZ                                                                                                                                                                                                       |                                        |

**UNIQUE**: `(tenant_id, name)`.

**Seed categories** (on tenant provisioning):
Positive: Praise (1pt, benchmark: praise), Merit (3pt, benchmark: merit), Outstanding Achievement (5pt, benchmark: major_positive), Principal's Award (10pt, benchmark: major_positive).
Negative: Verbal Warning (-1pt), Written Warning (-3pt), Detention (-5pt), Suspension Internal (-15pt), Suspension External (-15pt), Expulsion (-50pt).
Neutral: Note to File (0pt, benchmark: note), Observation (0pt, benchmark: observation).

---

#### `behaviour_incidents`

The core event record. Every positive, negative, or neutral behaviour event.

| Column                       | Type                                                                                                                                                      | Notes                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`                         | UUID PK                                                                                                                                                   |                                                                                                             |
| `tenant_id`                  | UUID FK NOT NULL                                                                                                                                          | RLS                                                                                                         |
| `incident_number`            | VARCHAR(20) NOT NULL                                                                                                                                      | Sequence: `BH-000001` via `SequenceService`                                                                 |
| `idempotency_key`            | VARCHAR(36) NULL                                                                                                                                          | Client-generated UUIDv4 for offline dedup                                                                   |
| `category_id`                | UUID FK NOT NULL                                                                                                                                          | → `behaviour_categories`                                                                                    |
| `polarity`                   | ENUM('positive', 'negative', 'neutral') NOT NULL                                                                                                          | Denormalised from category                                                                                  |
| `severity`                   | INT NOT NULL                                                                                                                                              | Denormalised from category at creation                                                                      |
| `reported_by_id`             | UUID FK NOT NULL                                                                                                                                          | → `users`                                                                                                   |
| `description`                | TEXT NOT NULL                                                                                                                                             | Internal description. Min 3 chars. Visibility class: STAFF                                                  |
| `parent_description`         | TEXT NULL                                                                                                                                                 | Parent-safe version. If NULL, parent portal renders category name + template only. Visibility class: PARENT |
| `context_notes`              | TEXT NULL                                                                                                                                                 | Internal only. Visibility class: SENSITIVE                                                                  |
| `location`                   | VARCHAR(100) NULL                                                                                                                                         |                                                                                                             |
| `context_type`               | ENUM('class', 'break', 'before_school', 'after_school', 'lunch', 'transport', 'extra_curricular', 'off_site', 'online', 'other') NOT NULL DEFAULT 'class' |                                                                                                             |
| `occurred_at`                | TIMESTAMPTZ NOT NULL                                                                                                                                      | When the incident happened                                                                                  |
| `logged_at`                  | TIMESTAMPTZ NOT NULL DEFAULT NOW()                                                                                                                        | When entered into system                                                                                    |
| `academic_year_id`           | UUID FK NOT NULL                                                                                                                                          |                                                                                                             |
| `academic_period_id`         | UUID FK NULL                                                                                                                                              |                                                                                                             |
| `schedule_entry_id`          | UUID FK NULL                                                                                                                                              | → `schedules`                                                                                               |
| `subject_id`                 | UUID FK NULL                                                                                                                                              | Denormalised for analytics                                                                                  |
| `room_id`                    | UUID FK NULL                                                                                                                                              | Denormalised                                                                                                |
| `period_order`               | INT NULL                                                                                                                                                  |                                                                                                             |
| `weekday`                    | INT NULL                                                                                                                                                  | 0–6                                                                                                         |
| `status`                     | ENUM — see state machine below                                                                                                                            |                                                                                                             |
| `approval_status`            | ENUM('not_required', 'pending', 'approved', 'rejected') DEFAULT 'not_required'                                                                            | Set by policy engine                                                                                        |
| `approval_request_id`        | UUID FK NULL                                                                                                                                              | → `approval_requests`                                                                                       |
| `parent_notification_status` | ENUM('not_required', 'pending', 'sent', 'delivered', 'failed', 'acknowledged') DEFAULT 'not_required'                                                     |                                                                                                             |
| `follow_up_required`         | BOOLEAN DEFAULT false                                                                                                                                     |                                                                                                             |
| `escalated_from_id`          | UUID FK NULL                                                                                                                                              | → `behaviour_incidents` — escalation chain                                                                  |
| `policy_evaluation_id`       | UUID FK NULL                                                                                                                                              | → `behaviour_policy_evaluations` — full traceability to exact rule version + facts                          |
| `context_snapshot`           | JSONB NOT NULL DEFAULT '{}'                                                                                                                               | Frozen at creation — never updated. See schema below                                                        |
| `created_at`                 | TIMESTAMPTZ                                                                                                                                               |                                                                                                             |
| `updated_at`                 | TIMESTAMPTZ                                                                                                                                               |                                                                                                             |

**`context_snapshot` JSONB schema** (Zod-validated, populated at creation, immutable):

```typescript
const IncidentContextSnapshotSchema = z.object({
  category_name: z.string(),
  category_polarity: z.enum(['positive', 'negative', 'neutral']),
  category_severity: z.number(),
  category_point_value: z.number(),
  category_benchmark_category: z.string(),
  reported_by_name: z.string(),
  reported_by_role: z.string().nullable(),
  subject_name: z.string().nullable(),
  room_name: z.string().nullable(),
  academic_year_name: z.string().nullable(),
  academic_period_name: z.string().nullable(),
});
```

**Idempotency**: Partial unique index on `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL`. On receiving a create request with an existing key, return the existing incident (200 OK) with no side effects re-executed.

**State machine**:

```
draft → active                          (on submit / auto-submit)
draft → withdrawn                       (logged in error before submission)

active → investigating                  (management begins formal investigation)
active → under_review                   (flagged for management review)
active → escalated                      (auto or manual)
active → resolved                       (follow-up completed or closed)
active → withdrawn                      (logged in error — audit preserved)

investigating → awaiting_approval       (consequence requires approval per policy)
investigating → awaiting_parent_meeting (policy or manual)
investigating → resolved                (investigation concluded, no further action)
investigating → escalated               (investigation reveals higher severity)
investigating → converted_to_safeguarding (concern discovered during investigation)

awaiting_approval → active              (approval rejected — reverts)
awaiting_approval → resolved            (approval granted, consequence applied)

awaiting_parent_meeting → resolved      (meeting held, matter closed)
awaiting_parent_meeting → escalated     (meeting outcome warrants escalation)

under_review → active | escalated | resolved | withdrawn

escalated → investigating              (escalated incident investigated)
escalated → resolved                    (resolved at escalated level)

resolved → closed_after_appeal          (outcome changed on appeal)
resolved → superseded                   (replaced by later determination)

withdrawn — terminal
resolved — terminal (unless appealed/superseded)
closed_after_appeal — terminal
superseded — terminal
converted_to_safeguarding — terminal
closed — projected terminal (what behaviour-only users see instead of converted_to_safeguarding)
```

**Status projection**: The `converted_to_safeguarding` status is visible only to users with `safeguarding.view`. For all other users, the API, search index, cache, and exports render it as `closed` with reason "Referred internally". This prevents behaviour-only users from inferring the existence of a safeguarding concern.

**Indexes**:

- `(tenant_id, occurred_at DESC)` — primary listing
- `(tenant_id, polarity, occurred_at DESC)` — polarity filter
- `(tenant_id, status)` — status filter
- `(tenant_id, status, follow_up_required)` — task queries
- `(tenant_id, category_id, occurred_at DESC)` — category drill-down
- `(tenant_id, reported_by_id, occurred_at DESC)` — "my incidents"
- `(tenant_id, subject_id, weekday, period_order)` — heatmap analytics
- `(tenant_id, context_type, weekday, period_order)` — policy matching
- `(tenant_id, academic_year_id)` — year-scoped reporting
- `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL` — dedup

**Domain boundary constraint**: Every incident must have at least one participant with `participant_type = 'student'` and `role IN ('subject', 'witness', 'bystander', 'reporter', 'victim', 'instigator')`. Enforced at application layer on creation and via database trigger on participant DELETE (prevents removing the last student participant).

---

#### `behaviour_incident_participants`

One incident, many participants. Participants can be students, staff, parents, visitors, or unknown persons. Students are the primary domain — non-student participants are supplementary context.

| Column             | Type                                                                                                      | Notes                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `id`               | UUID PK                                                                                                   |                                                       |
| `tenant_id`        | UUID FK NOT NULL                                                                                          | RLS                                                   |
| `incident_id`      | UUID FK NOT NULL                                                                                          | → `behaviour_incidents`                               |
| `participant_type` | ENUM('student', 'staff', 'parent', 'visitor', 'unknown') NOT NULL                                         |                                                       |
| `student_id`       | UUID FK NULL                                                                                              | Required when `participant_type = 'student'`          |
| `staff_id`         | UUID FK NULL                                                                                              | Required when `participant_type = 'staff'`            |
| `parent_id`        | UUID FK NULL                                                                                              | Required when `participant_type = 'parent'`           |
| `external_name`    | VARCHAR(200) NULL                                                                                         | For visitor/unknown                                   |
| `role`             | ENUM('subject', 'witness', 'bystander', 'reporter', 'victim', 'instigator', 'mediator') DEFAULT 'subject' |                                                       |
| `points_awarded`   | INT NOT NULL DEFAULT 0                                                                                    | Per-participant. Only applied for students            |
| `parent_visible`   | BOOLEAN DEFAULT true                                                                                      | Per-participant override                              |
| `notes`            | TEXT NULL                                                                                                 |                                                       |
| `student_snapshot` | JSONB NULL                                                                                                | Frozen at creation. NULL for non-student participants |
| `created_at`       | TIMESTAMPTZ                                                                                               |                                                       |

**`student_snapshot` JSONB** (Zod-validated, immutable):

```typescript
const StudentSnapshotSchema = z.object({
  student_name: z.string(),
  year_group_id: z.string().uuid().nullable(),
  year_group_name: z.string().nullable(),
  class_name: z.string().nullable(),
  has_send: z.boolean(),
  house_id: z.string().uuid().nullable(),
  house_name: z.string().nullable(),
  had_active_intervention: z.boolean(),
  active_intervention_ids: z.array(z.string().uuid()),
});
```

Historical analytics queries use `student_snapshot.year_group_name` rather than joining to the live students table. A student who moved year groups doesn't retroactively change their historical behaviour data.

**CHECK constraint**: Exactly one of `student_id`, `staff_id`, `parent_id`, `external_name` must be non-null, enforced based on `participant_type`.

**UNIQUE constraints**: `(incident_id, participant_type, student_id) WHERE student_id IS NOT NULL`. Equivalent for staff_id and parent_id.

---

#### `behaviour_sanctions`

Scheduled consequences linked to incidents.

| Column                    | Type                                                                                                                                                   | Notes                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `id`                      | UUID PK                                                                                                                                                |                                                   |
| `tenant_id`               | UUID FK NOT NULL                                                                                                                                       | RLS                                               |
| `sanction_number`         | VARCHAR(20) NOT NULL                                                                                                                                   | Sequence: `SN-000001`                             |
| `incident_id`             | UUID FK NOT NULL                                                                                                                                       | → `behaviour_incidents`                           |
| `student_id`              | UUID FK NOT NULL                                                                                                                                       | → `students`                                      |
| `type`                    | ENUM('detention', 'suspension_internal', 'suspension_external', 'expulsion', 'community_service', 'loss_of_privilege', 'restorative_meeting', 'other') |                                                   |
| `status`                  | ENUM — see state machine below                                                                                                                         |                                                   |
| `approval_status`         | ENUM('not_required', 'pending', 'approved', 'rejected') DEFAULT 'not_required'                                                                         |                                                   |
| `approval_request_id`     | UUID FK NULL                                                                                                                                           | → `approval_requests`                             |
| `scheduled_date`          | DATE NOT NULL                                                                                                                                          |                                                   |
| `scheduled_start_time`    | TIME NULL                                                                                                                                              |                                                   |
| `scheduled_end_time`      | TIME NULL                                                                                                                                              |                                                   |
| `scheduled_room_id`       | UUID FK NULL                                                                                                                                           | → `rooms`                                         |
| `supervised_by_id`        | UUID FK NULL                                                                                                                                           | → `users`                                         |
| `suspension_start_date`   | DATE NULL                                                                                                                                              |                                                   |
| `suspension_end_date`     | DATE NULL                                                                                                                                              |                                                   |
| `suspension_days`         | INT NULL                                                                                                                                               |                                                   |
| `return_conditions`       | TEXT NULL                                                                                                                                              |                                                   |
| `parent_meeting_required` | BOOLEAN DEFAULT false                                                                                                                                  |                                                   |
| `parent_meeting_date`     | TIMESTAMPTZ NULL                                                                                                                                       |                                                   |
| `parent_meeting_notes`    | TEXT NULL                                                                                                                                              | Visibility class: SENSITIVE                       |
| `served_at`               | TIMESTAMPTZ NULL                                                                                                                                       |                                                   |
| `served_by_id`            | UUID FK NULL                                                                                                                                           |                                                   |
| `replaced_by_id`          | UUID FK NULL                                                                                                                                           | → `behaviour_sanctions` — alternative consequence |
| `appeal_notes`            | TEXT NULL                                                                                                                                              |                                                   |
| `appeal_outcome`          | ENUM('upheld', 'modified', 'overturned') NULL                                                                                                          |                                                   |
| `notes`                   | TEXT NULL                                                                                                                                              |                                                   |
| `created_at`              | TIMESTAMPTZ                                                                                                                                            |                                                   |
| `updated_at`              | TIMESTAMPTZ                                                                                                                                            |                                                   |

**Sanction state machine**:

```
pending_approval → scheduled           (approval granted)
pending_approval → cancelled            (approval rejected)

scheduled → served                      (confirmed completed)
scheduled → partially_served            (student left early, disruption)
scheduled → no_show                     (student did not attend)
scheduled → excused                     (legitimate reason)
scheduled → cancelled                   (withdrawn by management)
scheduled → rescheduled                 (date changed — new sanction, this → superseded)
scheduled → not_served_absent           (student absent from school)
scheduled → appealed                    (formal appeal lodged)

appealed → scheduled                    (appeal rejected, original stands)
appealed → cancelled                    (appeal upheld, sanction removed)
appealed → replaced                     (appeal partially upheld, alternative consequence)

partially_served — terminal
served — terminal
no_show → rescheduled | cancelled
excused → rescheduled | cancelled
not_served_absent → rescheduled
replaced — terminal (replaced_by_id links to alternative)
cancelled — terminal
```

---

#### `behaviour_tasks`

Unified action/task tracker. Every required next step across the behaviour domain is a task.

| Column                | Type                                                                                                                                                                                                                                             | Notes               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `id`                  | UUID PK                                                                                                                                                                                                                                          |                     |
| `tenant_id`           | UUID FK NOT NULL                                                                                                                                                                                                                                 | RLS                 |
| `task_type`           | ENUM('follow_up', 'intervention_review', 'parent_meeting', 'parent_acknowledgement', 'approval_action', 'sanction_supervision', 'return_check_in', 'safeguarding_action', 'document_requested', 'appeal_review', 'break_glass_review', 'custom') |                     |
| `entity_type`         | ENUM('incident', 'sanction', 'intervention', 'safeguarding_concern', 'appeal', 'break_glass_grant') NOT NULL                                                                                                                                     | Polymorphic origin  |
| `entity_id`           | UUID NOT NULL                                                                                                                                                                                                                                    | FK to origin record |
| `title`               | VARCHAR(300) NOT NULL                                                                                                                                                                                                                            |                     |
| `description`         | TEXT NULL                                                                                                                                                                                                                                        |                     |
| `assigned_to_id`      | UUID FK NOT NULL                                                                                                                                                                                                                                 | → `users`           |
| `created_by_id`       | UUID FK NOT NULL                                                                                                                                                                                                                                 | → `users`           |
| `priority`            | ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium'                                                                                                                                                                                         |                     |
| `status`              | ENUM('pending', 'in_progress', 'completed', 'cancelled', 'overdue') DEFAULT 'pending'                                                                                                                                                            |                     |
| `due_date`            | TIMESTAMPTZ NOT NULL                                                                                                                                                                                                                             |                     |
| `completed_at`        | TIMESTAMPTZ NULL                                                                                                                                                                                                                                 |                     |
| `completed_by_id`     | UUID FK NULL                                                                                                                                                                                                                                     |                     |
| `completion_notes`    | TEXT NULL                                                                                                                                                                                                                                        |                     |
| `reminder_sent_at`    | TIMESTAMPTZ NULL                                                                                                                                                                                                                                 |                     |
| `overdue_notified_at` | TIMESTAMPTZ NULL                                                                                                                                                                                                                                 |                     |
| `created_at`          | TIMESTAMPTZ                                                                                                                                                                                                                                      |                     |
| `updated_at`          | TIMESTAMPTZ                                                                                                                                                                                                                                      |                     |

**Indexes**:

- `(tenant_id, assigned_to_id, status, due_date)` — "my pending tasks"
- `(tenant_id, entity_type, entity_id)` — tasks for a record
- `(tenant_id, status, due_date)` — overdue detection

Auto-created by: incidents with follow_up, sanctions with parent meetings, interventions at review dates, suspensions ending in 3 school days, safeguarding actions with due dates, policy rule actions, appeal submissions, break-glass expiry.

---

#### `behaviour_interventions`

Structured intervention plans linked to behaviour patterns.

| Column                  | Type                                                                                                                                            | Notes                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `id`                    | UUID PK                                                                                                                                         |                                                           |
| `tenant_id`             | UUID FK NOT NULL                                                                                                                                | RLS                                                       |
| `intervention_number`   | VARCHAR(20) NOT NULL                                                                                                                            | Sequence: `IV-000001`                                     |
| `student_id`            | UUID FK NOT NULL                                                                                                                                | → `students`                                              |
| `title`                 | VARCHAR(200) NOT NULL                                                                                                                           |                                                           |
| `type`                  | ENUM('behaviour_plan', 'mentoring', 'counselling_referral', 'restorative', 'academic_support', 'parent_engagement', 'external_agency', 'other') |                                                           |
| `status`                | ENUM('planned', 'active', 'monitoring', 'completed', 'abandoned')                                                                               |                                                           |
| `trigger_description`   | TEXT NOT NULL                                                                                                                                   |                                                           |
| `goals`                 | JSONB NOT NULL DEFAULT '[]'                                                                                                                     | `[{ goal, measurable_target, deadline }]` — Zod validated |
| `strategies`            | JSONB NOT NULL DEFAULT '[]'                                                                                                                     | `[{ strategy, responsible_staff_id, frequency }]`         |
| `assigned_to_id`        | UUID FK NOT NULL                                                                                                                                | → `users`                                                 |
| `start_date`            | DATE NOT NULL                                                                                                                                   |                                                           |
| `target_end_date`       | DATE NULL                                                                                                                                       |                                                           |
| `actual_end_date`       | DATE NULL                                                                                                                                       |                                                           |
| `review_frequency_days` | INT DEFAULT 14                                                                                                                                  |                                                           |
| `next_review_date`      | DATE NULL                                                                                                                                       |                                                           |
| `outcome`               | ENUM('improved', 'no_change', 'deteriorated', 'inconclusive') NULL                                                                              |                                                           |
| `outcome_notes`         | TEXT NULL                                                                                                                                       |                                                           |
| `send_aware`            | BOOLEAN DEFAULT false                                                                                                                           | Student has SEND/learning support                         |
| `send_notes`            | TEXT NULL                                                                                                                                       | Visibility class: SENSITIVE                               |
| `created_at`            | TIMESTAMPTZ                                                                                                                                     |                                                           |
| `updated_at`            | TIMESTAMPTZ                                                                                                                                     |                                                           |

---

#### `behaviour_intervention_incidents`

Join table: incidents that triggered an intervention.

| Column            | Type             | Notes |
| ----------------- | ---------------- | ----- |
| `id`              | UUID PK          |       |
| `tenant_id`       | UUID FK NOT NULL | RLS   |
| `intervention_id` | UUID FK NOT NULL |       |
| `incident_id`     | UUID FK NOT NULL |       |
| `created_at`      | TIMESTAMPTZ      |       |

**UNIQUE**: `(intervention_id, incident_id)`.

---

#### `behaviour_intervention_reviews`

Periodic check-ins. Append-only.

| Column                        | Type                                                           | Notes           |
| ----------------------------- | -------------------------------------------------------------- | --------------- |
| `id`                          | UUID PK                                                        |                 |
| `tenant_id`                   | UUID FK NOT NULL                                               | RLS             |
| `intervention_id`             | UUID FK NOT NULL                                               |                 |
| `reviewed_by_id`              | UUID FK NOT NULL                                               |                 |
| `review_date`                 | DATE NOT NULL                                                  |                 |
| `progress`                    | ENUM('on_track', 'some_progress', 'no_progress', 'regression') |                 |
| `goal_updates`                | JSONB DEFAULT '[]'                                             | Per-goal status |
| `notes`                       | TEXT NOT NULL                                                  |                 |
| `next_review_date`            | DATE NULL                                                      |                 |
| `behaviour_points_since_last` | INT                                                            | Auto-calculated |
| `attendance_rate_since_last`  | DECIMAL(5,2)                                                   | Auto-calculated |
| `created_at`                  | TIMESTAMPTZ                                                    | Append-only     |

---

#### `behaviour_recognition_awards`

Milestone awards. Append-only (except superseded flag).

| Column                     | Type                 | Notes                                                              |
| -------------------------- | -------------------- | ------------------------------------------------------------------ |
| `id`                       | UUID PK              |                                                                    |
| `tenant_id`                | UUID FK NOT NULL     | RLS                                                                |
| `student_id`               | UUID FK NOT NULL     |                                                                    |
| `award_type_id`            | UUID FK NOT NULL     | → `behaviour_award_types`                                          |
| `points_at_award`          | INT NOT NULL         | Snapshot of cumulative points                                      |
| `awarded_by_id`            | UUID FK NOT NULL     |                                                                    |
| `awarded_at`               | TIMESTAMPTZ NOT NULL |                                                                    |
| `academic_year_id`         | UUID FK NOT NULL     |                                                                    |
| `triggered_by_incident_id` | UUID FK NULL         | For auto-awards: which incident pushed past threshold. Dedup guard |
| `superseded_by_id`         | UUID FK NULL         | → `behaviour_recognition_awards` — higher-tier award               |
| `notes`                    | TEXT NULL            |                                                                    |
| `parent_notified_at`       | TIMESTAMPTZ NULL     |                                                                    |
| `created_at`               | TIMESTAMPTZ          |                                                                    |

---

#### `behaviour_award_types`

Configurable per tenant with repeatability semantics.

| Column                   | Type                                                                                       | Notes                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `id`                     | UUID PK                                                                                    |                                                                  |
| `tenant_id`              | UUID FK NOT NULL                                                                           | RLS                                                              |
| `name`                   | VARCHAR(100) NOT NULL                                                                      |                                                                  |
| `name_ar`                | VARCHAR(100)                                                                               |                                                                  |
| `description`            | TEXT NULL                                                                                  |                                                                  |
| `points_threshold`       | INT NULL                                                                                   | Auto-trigger at this cumulative total (NULL = manual only)       |
| `repeat_mode`            | ENUM('once_ever', 'once_per_year', 'once_per_period', 'unlimited') DEFAULT 'once_per_year' |                                                                  |
| `repeat_max_per_year`    | INT NULL                                                                                   | Max per student per year. NULL = unlimited within mode           |
| `tier_group`             | VARCHAR(50) NULL                                                                           | e.g. 'achievement_tier'. Awards in same group are related        |
| `tier_level`             | INT NULL                                                                                   | Higher = better. Bronze=1, Silver=2, Gold=3                      |
| `supersedes_lower_tiers` | BOOLEAN DEFAULT false                                                                      | Earning this marks lower-tier awards in same group as superseded |
| `icon`                   | VARCHAR(50)                                                                                |                                                                  |
| `color`                  | VARCHAR(7)                                                                                 |                                                                  |
| `display_order`          | INT DEFAULT 0                                                                              |                                                                  |
| `is_active`              | BOOLEAN DEFAULT true                                                                       |                                                                  |
| `created_at`             | TIMESTAMPTZ                                                                                |                                                                  |
| `updated_at`             | TIMESTAMPTZ                                                                                |                                                                  |

**Auto-award dedup**: Before the worker creates an award, it checks repeat_mode, repeat_max_per_year, and `triggered_by_incident_id` to prevent duplicates from BullMQ retries.

---

#### `behaviour_house_teams`

Optional house/team system for collective point competitions.

| Column          | Type                  | Notes |
| --------------- | --------------------- | ----- |
| `id`            | UUID PK               |       |
| `tenant_id`     | UUID FK NOT NULL      | RLS   |
| `name`          | VARCHAR(100) NOT NULL |       |
| `name_ar`       | VARCHAR(100)          |       |
| `color`         | VARCHAR(7) NOT NULL   |       |
| `icon`          | VARCHAR(50)           |       |
| `display_order` | INT DEFAULT 0         |       |
| `is_active`     | BOOLEAN DEFAULT true  |       |
| `created_at`    | TIMESTAMPTZ           |       |
| `updated_at`    | TIMESTAMPTZ           |       |

---

#### `behaviour_house_memberships`

| Column             | Type             | Notes |
| ------------------ | ---------------- | ----- |
| `id`               | UUID PK          |       |
| `tenant_id`        | UUID FK NOT NULL | RLS   |
| `student_id`       | UUID FK NOT NULL |       |
| `house_id`         | UUID FK NOT NULL |       |
| `academic_year_id` | UUID FK NOT NULL |       |
| `created_at`       | TIMESTAMPTZ      |       |

**UNIQUE**: `(tenant_id, student_id, academic_year_id)`.

---

#### `behaviour_description_templates`

First-class entity powering quick-log speed.

| Column          | Type                             | Notes                    |
| --------------- | -------------------------------- | ------------------------ |
| `id`            | UUID PK                          |                          |
| `tenant_id`     | UUID FK NOT NULL                 | RLS                      |
| `category_id`   | UUID FK NOT NULL                 | → `behaviour_categories` |
| `locale`        | VARCHAR(5) NOT NULL DEFAULT 'en' | 'en' or 'ar'             |
| `text`          | VARCHAR(500) NOT NULL            |                          |
| `display_order` | INT NOT NULL DEFAULT 0           |                          |
| `is_active`     | BOOLEAN DEFAULT true             |                          |
| `is_system`     | BOOLEAN DEFAULT false            |                          |
| `created_at`    | TIMESTAMPTZ                      |                          |
| `updated_at`    | TIMESTAMPTZ                      |                          |

Teacher favourites stored in `user_ui_preferences` as `behaviour_template_favourites: uuid[]`.

---

#### `behaviour_alerts`

Pattern detection results from the daily worker.

| Column          | Type                                                                                                                                          | Notes                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `id`            | UUID PK                                                                                                                                       |                                                        |
| `tenant_id`     | UUID FK NOT NULL                                                                                                                              | RLS                                                    |
| `alert_type`    | ENUM('escalating_student', 'disengaging_student', 'hotspot', 'logging_gap', 'overdue_review', 'suspension_return', 'policy_threshold_breach') |                                                        |
| `severity`      | ENUM('info', 'warning', 'critical')                                                                                                           |                                                        |
| `student_id`    | UUID FK NULL                                                                                                                                  |                                                        |
| `subject_id`    | UUID FK NULL                                                                                                                                  |                                                        |
| `staff_id`      | UUID FK NULL                                                                                                                                  |                                                        |
| `title`         | VARCHAR(300) NOT NULL                                                                                                                         |                                                        |
| `description`   | TEXT NOT NULL                                                                                                                                 |                                                        |
| `data_snapshot` | JSONB NOT NULL                                                                                                                                | Supporting evidence                                    |
| `status`        | ENUM('active', 'resolved') DEFAULT 'active'                                                                                                   | Aggregate: active until all recipients resolve/dismiss |
| `resolved_at`   | TIMESTAMPTZ NULL                                                                                                                              |                                                        |
| `created_at`    | TIMESTAMPTZ                                                                                                                                   |                                                        |
| `updated_at`    | TIMESTAMPTZ                                                                                                                                   |                                                        |

---

#### `behaviour_alert_recipients`

Per-user alert state. Replaces global status model.

| Column             | Type                                                                                        | Notes                    |
| ------------------ | ------------------------------------------------------------------------------------------- | ------------------------ |
| `id`               | UUID PK                                                                                     |                          |
| `tenant_id`        | UUID FK NOT NULL                                                                            | RLS                      |
| `alert_id`         | UUID FK NOT NULL                                                                            | → `behaviour_alerts`     |
| `recipient_id`     | UUID FK NOT NULL                                                                            | → `users`                |
| `recipient_role`   | VARCHAR(50) NULL                                                                            | Role that qualified them |
| `status`           | ENUM('unseen', 'seen', 'acknowledged', 'snoozed', 'resolved', 'dismissed') DEFAULT 'unseen' |                          |
| `seen_at`          | TIMESTAMPTZ NULL                                                                            |                          |
| `acknowledged_at`  | TIMESTAMPTZ NULL                                                                            |                          |
| `snoozed_until`    | TIMESTAMPTZ NULL                                                                            |                          |
| `resolved_at`      | TIMESTAMPTZ NULL                                                                            |                          |
| `dismissed_at`     | TIMESTAMPTZ NULL                                                                            |                          |
| `dismissed_reason` | TEXT NULL                                                                                   |                          |
| `created_at`       | TIMESTAMPTZ                                                                                 |                          |
| `updated_at`       | TIMESTAMPTZ                                                                                 |                          |

Alert auto-transitions to `resolved` when last recipient resolves/dismisses.

---

#### `behaviour_parent_acknowledgements`

Tracks parent acknowledgement of behaviour notifications. Append-only.

| Column                   | Type                                                       | Notes             |
| ------------------------ | ---------------------------------------------------------- | ----------------- |
| `id`                     | UUID PK                                                    |                   |
| `tenant_id`              | UUID FK NOT NULL                                           | RLS               |
| `incident_id`            | UUID FK NULL                                               |                   |
| `sanction_id`            | UUID FK NULL                                               |                   |
| `parent_id`              | UUID FK NOT NULL                                           |                   |
| `notification_id`        | UUID FK NULL                                               | → `notifications` |
| `channel`                | ENUM('email', 'whatsapp', 'in_app')                        |                   |
| `sent_at`                | TIMESTAMPTZ NOT NULL                                       |                   |
| `delivered_at`           | TIMESTAMPTZ NULL                                           |                   |
| `read_at`                | TIMESTAMPTZ NULL                                           |                   |
| `acknowledged_at`        | TIMESTAMPTZ NULL                                           |                   |
| `acknowledgement_method` | ENUM('in_app_button', 'email_link', 'whatsapp_reply') NULL |                   |
| `created_at`             | TIMESTAMPTZ                                                |                   |

---

#### `behaviour_incident_history`

Append-only audit trail for incident changes.

| Column            | Type                                                                                                                                                                                                                                                  | Notes                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `id`              | UUID PK                                                                                                                                                                                                                                               |                                             |
| `tenant_id`       | UUID FK NOT NULL                                                                                                                                                                                                                                      | RLS                                         |
| `incident_id`     | UUID FK NOT NULL                                                                                                                                                                                                                                      |                                             |
| `changed_by_id`   | UUID FK NOT NULL                                                                                                                                                                                                                                      |                                             |
| `change_type`     | ENUM('created', 'status_changed', 'updated', 'participant_added', 'participant_removed', 'sanction_created', 'follow_up_recorded', 'escalated', 'withdrawn', 'attachment_added', 'policy_action_applied', 'appeal_outcome', 'parent_description_set') |                                             |
| `previous_values` | JSONB NULL                                                                                                                                                                                                                                            |                                             |
| `new_values`      | JSONB NOT NULL                                                                                                                                                                                                                                        |                                             |
| `reason`          | TEXT NULL                                                                                                                                                                                                                                             | Required for status changes and withdrawals |
| `created_at`      | TIMESTAMPTZ                                                                                                                                                                                                                                           |                                             |

---

#### `behaviour_publication_approvals`

Consent and approval for public display.

| Column                    | Type                                                                                            | Notes |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ----- |
| `id`                      | UUID PK                                                                                         |       |
| `tenant_id`               | UUID FK NOT NULL                                                                                | RLS   |
| `publication_type`        | ENUM('recognition_wall_website', 'house_leaderboard_website', 'individual_achievement_website') |       |
| `entity_type`             | ENUM('incident', 'award')                                                                       |       |
| `entity_id`               | UUID NOT NULL                                                                                   |       |
| `student_id`              | UUID FK NOT NULL                                                                                |       |
| `requires_parent_consent` | BOOLEAN DEFAULT true                                                                            |       |
| `parent_consent_status`   | ENUM('not_requested', 'pending', 'granted', 'denied') DEFAULT 'not_requested'                   |       |
| `parent_consent_at`       | TIMESTAMPTZ NULL                                                                                |       |
| `admin_approved`          | BOOLEAN DEFAULT false                                                                           |       |
| `admin_approved_by_id`    | UUID FK NULL                                                                                    |       |
| `published_at`            | TIMESTAMPTZ NULL                                                                                |       |
| `unpublished_at`          | TIMESTAMPTZ NULL                                                                                |       |
| `created_at`              | TIMESTAMPTZ                                                                                     |       |
| `updated_at`              | TIMESTAMPTZ                                                                                     |       |

---

#### `behaviour_appeals`

First-class appeal workflow for incidents and sanctions.

| Column                 | Type                                                                                                                                              | Notes                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `id`                   | UUID PK                                                                                                                                           |                                        |
| `tenant_id`            | UUID FK NOT NULL                                                                                                                                  | RLS                                    |
| `appeal_number`        | VARCHAR(20) NOT NULL                                                                                                                              | Sequence: `AP-000001`                  |
| `entity_type`          | ENUM('incident', 'sanction') NOT NULL                                                                                                             |                                        |
| `incident_id`          | UUID FK NOT NULL                                                                                                                                  |                                        |
| `sanction_id`          | UUID FK NULL                                                                                                                                      | Required when entity_type = 'sanction' |
| `student_id`           | UUID FK NOT NULL                                                                                                                                  |                                        |
| `appellant_type`       | ENUM('parent', 'student', 'staff') NOT NULL                                                                                                       |                                        |
| `appellant_parent_id`  | UUID FK NULL                                                                                                                                      |                                        |
| `appellant_staff_id`   | UUID FK NULL                                                                                                                                      |                                        |
| `status`               | ENUM('submitted', 'under_review', 'hearing_scheduled', 'decided', 'withdrawn')                                                                    |                                        |
| `grounds`              | TEXT NOT NULL                                                                                                                                     |                                        |
| `grounds_category`     | ENUM('factual_inaccuracy', 'disproportionate_consequence', 'procedural_error', 'mitigating_circumstances', 'mistaken_identity', 'other') NOT NULL |                                        |
| `submitted_at`         | TIMESTAMPTZ NOT NULL                                                                                                                              |                                        |
| `reviewer_id`          | UUID FK NULL                                                                                                                                      |                                        |
| `hearing_date`         | TIMESTAMPTZ NULL                                                                                                                                  |                                        |
| `hearing_attendees`    | JSONB NULL                                                                                                                                        | `[{ name, role }]`                     |
| `hearing_notes`        | TEXT NULL                                                                                                                                         | Visibility class: SENSITIVE            |
| `decision`             | ENUM('upheld_original', 'modified', 'overturned') NULL                                                                                            |                                        |
| `decision_reasoning`   | TEXT NULL                                                                                                                                         |                                        |
| `decided_by_id`        | UUID FK NULL                                                                                                                                      |                                        |
| `decided_at`           | TIMESTAMPTZ NULL                                                                                                                                  |                                        |
| `resulting_amendments` | JSONB NULL                                                                                                                                        | Structured amendments — what changed   |
| `created_at`           | TIMESTAMPTZ                                                                                                                                       |                                        |
| `updated_at`           | TIMESTAMPTZ                                                                                                                                       |                                        |

When a decision is made, the service automatically updates the incident/sanction, records changes in `behaviour_incident_history` with `change_type = 'appeal_outcome'`, creates follow-up tasks, and notifies the appellant.

---

### 2.2 Evidence & Attachments

#### `behaviour_attachments`

Unified attachment model with security hardening.

| Column                 | Type                                                                                                                                                                                                                                                | Notes                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `id`                   | UUID PK                                                                                                                                                                                                                                             |                                |
| `tenant_id`            | UUID FK NOT NULL                                                                                                                                                                                                                                    | RLS                            |
| `entity_type`          | ENUM('incident', 'sanction', 'intervention', 'safeguarding_concern', 'safeguarding_action', 'appeal') NOT NULL                                                                                                                                      |                                |
| `entity_id`            | UUID NOT NULL                                                                                                                                                                                                                                       |                                |
| `uploaded_by_id`       | UUID FK NOT NULL                                                                                                                                                                                                                                    |                                |
| `file_name`            | VARCHAR(255) NOT NULL                                                                                                                                                                                                                               |                                |
| `file_key`             | VARCHAR(500) NOT NULL                                                                                                                                                                                                                               | S3 key                         |
| `file_size_bytes`      | BIGINT NOT NULL                                                                                                                                                                                                                                     |                                |
| `mime_type`            | VARCHAR(100) NOT NULL                                                                                                                                                                                                                               |                                |
| `sha256_hash`          | VARCHAR(64) NOT NULL                                                                                                                                                                                                                                | Integrity verification         |
| `classification`       | ENUM('staff_statement', 'student_statement', 'parent_letter', 'meeting_minutes', 'screenshot', 'photo', 'scanned_document', 'referral_form', 'return_agreement', 'behaviour_contract', 'medical_report', 'agency_correspondence', 'other') NOT NULL |                                |
| `description`          | VARCHAR(500) NULL                                                                                                                                                                                                                                   |                                |
| `visibility`           | ENUM('staff_all', 'pastoral_only', 'management_only', 'safeguarding_only') NOT NULL DEFAULT 'staff_all'                                                                                                                                             |                                |
| `is_redactable`        | BOOLEAN DEFAULT false                                                                                                                                                                                                                               |                                |
| `retention_status`     | ENUM('active', 'archived', 'marked_for_deletion', 'retained_legal_hold') DEFAULT 'active'                                                                                                                                                           |                                |
| `retained_until`       | DATE NULL                                                                                                                                                                                                                                           |                                |
| `scan_status`          | ENUM('pending', 'clean', 'infected', 'scan_failed', 'not_scanned') DEFAULT 'not_scanned'                                                                                                                                                            |                                |
| `scanned_at`           | TIMESTAMPTZ NULL                                                                                                                                                                                                                                    |                                |
| `version`              | INT NOT NULL DEFAULT 1                                                                                                                                                                                                                              |                                |
| `replaced_by_id`       | UUID FK NULL                                                                                                                                                                                                                                        | → `behaviour_attachments`      |
| `legal_hold`           | BOOLEAN DEFAULT false                                                                                                                                                                                                                               | Prevents retention-based purge |
| `legal_hold_set_by_id` | UUID FK NULL                                                                                                                                                                                                                                        |                                |
| `legal_hold_set_at`    | TIMESTAMPTZ NULL                                                                                                                                                                                                                                    |                                |
| `legal_hold_reason`    | TEXT NULL                                                                                                                                                                                                                                           |                                |
| `created_at`           | TIMESTAMPTZ                                                                                                                                                                                                                                         |                                |

**S3 configuration**: SSE-S3 encryption (AES-256), Content-Disposition: attachment, ACL: private. Safeguarding entity attachments get S3 Object Lock (GOVERNANCE mode, retention per tenant config).

**Upload pipeline**: Validate size (≤10MB) → allowlisted extensions → MIME check → magic bytes verification → SHA-256 hash → S3 upload with encryption → create DB record → queue AV scan (if enabled) → file not downloadable until `scan_status = 'clean'`.

**Download pipeline**: Verify permissions (scope + visibility class) → verify scan_status → generate pre-signed URL (15-minute expiry) → audit log → safeguarding attachments additionally get chain-of-custody log entry and optional watermarking.

---

### 2.3 Policy Rules Engine

#### `behaviour_policy_rules`

| Column              | Type                     | Notes                                             |
| ------------------- | ------------------------ | ------------------------------------------------- |
| `id`                | UUID PK                  |                                                   |
| `tenant_id`         | UUID FK NOT NULL         | RLS                                               |
| `name`              | VARCHAR(200) NOT NULL    |                                                   |
| `description`       | TEXT NULL                |                                                   |
| `is_active`         | BOOLEAN DEFAULT true     |                                                   |
| `priority`          | INT NOT NULL DEFAULT 100 | Lower = higher priority. First matching rule wins |
| `conditions`        | JSONB NOT NULL           | Zod-validated condition set                       |
| `current_version`   | INT NOT NULL DEFAULT 1   | Incremented on every edit                         |
| `last_published_at` | TIMESTAMPTZ NULL         |                                                   |
| `created_at`        | TIMESTAMPTZ              |                                                   |
| `updated_at`        | TIMESTAMPTZ              |                                                   |

**Conditions JSONB schema**:

```typescript
const PolicyConditionSchema = z.object({
  category_ids: z.array(z.string().uuid()).optional(),
  polarity: z.enum(['positive', 'negative', 'neutral']).optional(),
  severity_min: z.number().int().min(1).max(10).optional(),
  severity_max: z.number().int().min(1).max(10).optional(),
  year_group_ids: z.array(z.string().uuid()).optional(),
  student_has_send: z.boolean().optional(),
  student_has_active_intervention: z.boolean().optional(),
  context_types: z
    .array(
      z.enum([
        'class',
        'break',
        'before_school',
        'after_school',
        'lunch',
        'transport',
        'extra_curricular',
        'off_site',
        'online',
        'other',
      ]),
    )
    .optional(),
  participant_role: z
    .enum(['subject', 'witness', 'bystander', 'reporter', 'victim', 'instigator', 'mediator'])
    .optional(),
  repeat_count_min: z.number().int().min(1).optional(),
  repeat_window_days: z.number().int().min(1).max(365).optional(),
  repeat_category_ids: z.array(z.string().uuid()).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  period_orders: z.array(z.number().int()).optional(),
});
```

All conditions optional. Omitted = wildcard. All specified must match (AND). First fully matching rule wins by priority.

---

#### `behaviour_policy_rule_actions`

| Column            | Type                                                                                                                                                                                                                                     | Notes                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `id`              | UUID PK                                                                                                                                                                                                                                  |                      |
| `tenant_id`       | UUID FK NOT NULL                                                                                                                                                                                                                         | RLS                  |
| `rule_id`         | UUID FK NOT NULL                                                                                                                                                                                                                         |                      |
| `action_type`     | ENUM('auto_escalate', 'create_sanction', 'require_approval', 'require_parent_meeting', 'require_parent_notification', 'create_task', 'create_intervention', 'notify_roles', 'notify_users', 'flag_for_review', 'block_without_approval') |                      |
| `action_config`   | JSONB NOT NULL                                                                                                                                                                                                                           | Type-specific config |
| `execution_order` | INT NOT NULL DEFAULT 0                                                                                                                                                                                                                   |                      |
| `created_at`      | TIMESTAMPTZ                                                                                                                                                                                                                              |                      |

---

#### `behaviour_policy_rule_versions`

Immutable snapshot of every version.

| Column          | Type                  | Notes                                                              |
| --------------- | --------------------- | ------------------------------------------------------------------ |
| `id`            | UUID PK               |                                                                    |
| `tenant_id`     | UUID FK NOT NULL      | RLS                                                                |
| `rule_id`       | UUID FK NOT NULL      |                                                                    |
| `version`       | INT NOT NULL          |                                                                    |
| `name`          | VARCHAR(200) NOT NULL |                                                                    |
| `conditions`    | JSONB NOT NULL        |                                                                    |
| `actions`       | JSONB NOT NULL        | Full snapshot: `[{ action_type, action_config, execution_order }]` |
| `priority`      | INT NOT NULL          |                                                                    |
| `changed_by_id` | UUID FK NOT NULL      |                                                                    |
| `change_reason` | TEXT NULL             |                                                                    |
| `created_at`    | TIMESTAMPTZ           | Append-only                                                        |

**UNIQUE**: `(rule_id, version)`.

---

#### `behaviour_policy_evaluations`

Forensic ledger. Every policy evaluation recorded with full input snapshot.

| Column                   | Type                                                     | Notes                                                       |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------------------- |
| `id`                     | UUID PK                                                  |                                                             |
| `tenant_id`              | UUID FK NOT NULL                                         | RLS                                                         |
| `incident_id`            | UUID FK NOT NULL                                         |                                                             |
| `student_id`             | UUID FK NOT NULL                                         |                                                             |
| `rule_version_id`        | UUID FK NULL                                             | → `behaviour_policy_rule_versions`. NULL if no rule matched |
| `evaluation_result`      | ENUM('matched', 'no_match', 'skipped_inactive', 'error') |                                                             |
| `evaluated_input`        | JSONB NOT NULL                                           | Complete facts snapshot at evaluation time                  |
| `matched_conditions`     | JSONB NULL                                               |                                                             |
| `unmatched_conditions`   | JSONB NULL                                               |                                                             |
| `rules_evaluated_count`  | INT NOT NULL                                             |                                                             |
| `evaluation_duration_ms` | INT NULL                                                 |                                                             |
| `created_at`             | TIMESTAMPTZ                                              | Append-only                                                 |

**`evaluated_input` schema**: Category facts, student year group/SEND/intervention status at the moment of evaluation, participant role, repeat counts — all frozen.

---

#### `behaviour_policy_action_executions`

One row per action per evaluation.

| Column                | Type                                                                | Notes       |
| --------------------- | ------------------------------------------------------------------- | ----------- |
| `id`                  | UUID PK                                                             |             |
| `tenant_id`           | UUID FK NOT NULL                                                    | RLS         |
| `evaluation_id`       | UUID FK NOT NULL                                                    |             |
| `action_type`         | ENUM — same as rule_actions                                         |             |
| `action_config`       | JSONB NOT NULL                                                      |             |
| `execution_status`    | ENUM('success', 'failed', 'skipped_duplicate', 'skipped_condition') |             |
| `created_entity_type` | VARCHAR(50) NULL                                                    |             |
| `created_entity_id`   | UUID NULL                                                           |             |
| `failure_reason`      | TEXT NULL                                                           |             |
| `executed_at`         | TIMESTAMPTZ NOT NULL                                                |             |
| `created_at`          | TIMESTAMPTZ                                                         | Append-only |

---

### 2.4 Safeguarding Tables

#### `safeguarding_concerns`

No delete operation exists. Records can only be sealed.

| Column                             | Type                                                                                                                                                                                               | Notes                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `id`                               | UUID PK                                                                                                                                                                                            |                                    |
| `tenant_id`                        | UUID FK NOT NULL                                                                                                                                                                                   | RLS                                |
| `concern_number`                   | VARCHAR(20) NOT NULL                                                                                                                                                                               | Sequence: `CP-000001`              |
| `student_id`                       | UUID FK NOT NULL                                                                                                                                                                                   |                                    |
| `reported_by_id`                   | UUID FK NOT NULL                                                                                                                                                                                   |                                    |
| `concern_type`                     | ENUM('physical_abuse', 'emotional_abuse', 'sexual_abuse', 'neglect', 'self_harm', 'bullying', 'online_safety', 'domestic_violence', 'substance_abuse', 'mental_health', 'radicalisation', 'other') |                                    |
| `severity`                         | ENUM('low', 'medium', 'high', 'critical') NOT NULL                                                                                                                                                 |                                    |
| `status`                           | ENUM('reported', 'acknowledged', 'under_investigation', 'referred', 'monitoring', 'resolved', 'sealed')                                                                                            |                                    |
| `description`                      | TEXT NOT NULL                                                                                                                                                                                      |                                    |
| `immediate_actions_taken`          | TEXT NULL                                                                                                                                                                                          |                                    |
| `designated_liaison_id`            | UUID FK NULL                                                                                                                                                                                       |                                    |
| `assigned_to_id`                   | UUID FK NULL                                                                                                                                                                                       |                                    |
| `is_tusla_referral`                | BOOLEAN DEFAULT false                                                                                                                                                                              |                                    |
| `tusla_reference_number`           | VARCHAR(50) NULL                                                                                                                                                                                   |                                    |
| `tusla_referred_at`                | TIMESTAMPTZ NULL                                                                                                                                                                                   |                                    |
| `tusla_outcome`                    | TEXT NULL                                                                                                                                                                                          |                                    |
| `is_garda_referral`                | BOOLEAN DEFAULT false                                                                                                                                                                              |                                    |
| `garda_reference_number`           | VARCHAR(50) NULL                                                                                                                                                                                   |                                    |
| `garda_referred_at`                | TIMESTAMPTZ NULL                                                                                                                                                                                   |                                    |
| `resolution_notes`                 | TEXT NULL                                                                                                                                                                                          |                                    |
| `resolved_at`                      | TIMESTAMPTZ NULL                                                                                                                                                                                   |                                    |
| `reporter_acknowledgement_sent_at` | TIMESTAMPTZ NULL                                                                                                                                                                                   |                                    |
| `reporter_acknowledgement_status`  | ENUM('received', 'assigned', 'under_review') NULL                                                                                                                                                  |                                    |
| `sla_first_response_due`           | TIMESTAMPTZ NULL                                                                                                                                                                                   | Auto-set by severity               |
| `sla_first_response_met_at`        | TIMESTAMPTZ NULL                                                                                                                                                                                   |                                    |
| `sealed_at`                        | TIMESTAMPTZ NULL                                                                                                                                                                                   |                                    |
| `sealed_by_id`                     | UUID FK NULL                                                                                                                                                                                       |                                    |
| `sealed_reason`                    | TEXT NULL                                                                                                                                                                                          | Mandatory                          |
| `seal_approved_by_id`              | UUID FK NULL                                                                                                                                                                                       | Dual-control                       |
| `retention_until`                  | DATE NULL                                                                                                                                                                                          | Default: 25 years from student DOB |
| `created_at`                       | TIMESTAMPTZ                                                                                                                                                                                        |                                    |
| `updated_at`                       | TIMESTAMPTZ                                                                                                                                                                                        |                                    |

**Lifecycle**: reported → acknowledged → under_investigation → referred/monitoring/resolved. Resolved is terminal — new info creates a new linked concern. Sealed requires dual-control and is irreversible in-app. No delete operation exists in the codebase.

**Critical concern escalation**: severity = 'critical' → immediate push to DLP → 30min fallback to deputy DLP → 30min to principal. SLA clocks count wall-clock hours (safeguarding doesn't pause for weekends).

---

#### `safeguarding_actions`

Chronological log. Append-only.

| Column         | Type                                                                                                                                                                                                         | Notes        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `id`           | UUID PK                                                                                                                                                                                                      |              |
| `tenant_id`    | UUID FK NOT NULL                                                                                                                                                                                             | RLS          |
| `concern_id`   | UUID FK NOT NULL                                                                                                                                                                                             |              |
| `action_by_id` | UUID FK NOT NULL                                                                                                                                                                                             |              |
| `action_type`  | ENUM('note_added', 'status_changed', 'assigned', 'meeting_held', 'parent_contacted', 'agency_contacted', 'tusla_referred', 'garda_referred', 'document_uploaded', 'document_downloaded', 'review_completed') |              |
| `description`  | TEXT NOT NULL                                                                                                                                                                                                |              |
| `metadata`     | JSONB DEFAULT '{}'                                                                                                                                                                                           |              |
| `due_date`     | TIMESTAMPTZ NULL                                                                                                                                                                                             | SLA deadline |
| `is_overdue`   | BOOLEAN DEFAULT false                                                                                                                                                                                        |              |
| `created_at`   | TIMESTAMPTZ                                                                                                                                                                                                  |              |

---

#### `safeguarding_concern_incidents`

Join table. Access inherits safeguarding permissions — invisible from behaviour side.

| Column         | Type             | Notes |
| -------------- | ---------------- | ----- |
| `id`           | UUID PK          |       |
| `tenant_id`    | UUID FK NOT NULL | RLS   |
| `concern_id`   | UUID FK NOT NULL |       |
| `incident_id`  | UUID FK NOT NULL |       |
| `linked_by_id` | UUID FK NOT NULL |       |
| `created_at`   | TIMESTAMPTZ      |       |

**UNIQUE**: `(concern_id, incident_id)`.

---

#### `safeguarding_break_glass_grants`

Break-glass access with post-access governance.

| Column                             | Type                                                             | Notes             |
| ---------------------------------- | ---------------------------------------------------------------- | ----------------- |
| `id`                               | UUID PK                                                          |                   |
| `tenant_id`                        | UUID FK NOT NULL                                                 | RLS               |
| `granted_to_id`                    | UUID FK NOT NULL                                                 |                   |
| `granted_by_id`                    | UUID FK NOT NULL                                                 | Must be principal |
| `reason`                           | TEXT NOT NULL                                                    |                   |
| `scope`                            | ENUM('all_concerns', 'specific_concerns') DEFAULT 'all_concerns' |                   |
| `scoped_concern_ids`               | UUID[] NULL                                                      |                   |
| `granted_at`                       | TIMESTAMPTZ NOT NULL                                             |                   |
| `expires_at`                       | TIMESTAMPTZ NOT NULL                                             | Max 72 hours      |
| `revoked_at`                       | TIMESTAMPTZ NULL                                                 |                   |
| `after_action_review_required`     | BOOLEAN DEFAULT true                                             |                   |
| `after_action_review_completed_at` | TIMESTAMPTZ NULL                                                 |                   |
| `after_action_review_by_id`        | UUID FK NULL                                                     |                   |
| `after_action_review_notes`        | TEXT NULL                                                        |                   |
| `created_at`                       | TIMESTAMPTZ                                                      |                   |

**During access**: Every record viewed logged in `audit_logs` with `context = 'break_glass'` and grant ID.

**On expiry**: Auto-revoked (cron every 5min). Immediate notification to DLP + principal. After-action review task created — lists all records and attachments accessed. Reviewer marks each as appropriate/inappropriate. Non-completion escalates after 7 school days.

---

### 2.5 Configuration (`tenant_settings.behaviour` JSONB)

All keys use Zod `.default()` — no backfill needed.

```typescript
behaviour: {
  // Quick-log
  quick_log_default_polarity: 'positive' | 'negative' = 'positive',
  quick_log_auto_submit: boolean = true,
  quick_log_recent_students_count: number = 5,
  quick_log_show_favourites: boolean = true,

  // Points
  points_enabled: boolean = true,
  points_reset_frequency: 'never' | 'academic_year' | 'academic_period' = 'academic_year',

  // House teams
  house_teams_enabled: boolean = false,
  house_points_visible_to_students: boolean = true,
  house_leaderboard_public: boolean = false,

  // Awards
  auto_awards_enabled: boolean = true,

  // Sanctions
  detention_default_duration_minutes: number = 30,
  suspension_requires_approval: boolean = true,
  expulsion_requires_approval: boolean = true,

  // Parent visibility & communication
  parent_portal_behaviour_enabled: boolean = true,
  parent_notification_channels: ('email' | 'whatsapp' | 'in_app')[] = ['in_app'],
  parent_notification_negative_severity_threshold: number = 3,
  parent_notification_positive_always: boolean = true,
  parent_notification_digest_enabled: boolean = false,
  parent_notification_digest_time: string = '16:00',
  parent_acknowledgement_required_severity: number = 5,
  parent_visibility_show_teacher_name: boolean = false,
  guardian_specific_visibility_enabled: boolean = false,

  // Recognition wall
  recognition_wall_enabled: boolean = true,
  recognition_wall_public: boolean = false,
  recognition_wall_requires_consent: boolean = true,
  recognition_wall_auto_populate: boolean = true,
  recognition_wall_min_severity: number = 3,
  recognition_wall_admin_approval_required: boolean = true,

  // Safeguarding
  designated_liaison_user_id: string | null = null,
  deputy_designated_liaison_user_id: string | null = null,
  dlp_fallback_chain: string[] = [],
  safeguarding_sla_critical_hours: number = 4,
  safeguarding_sla_high_hours: number = 24,
  safeguarding_sla_medium_hours: number = 72,
  safeguarding_sla_low_hours: number = 168,
  safeguarding_retention_years: number = 25,

  // Analytics & AI
  behaviour_pulse_enabled: boolean = true,
  ai_insights_enabled: boolean = true,
  ai_narrative_enabled: boolean = true,
  ai_nl_query_enabled: boolean = true,
  ai_confidence_threshold: number = 0.85,
  ai_diagnostic_language_blocked: boolean = true,
  ai_audit_logging: boolean = true,
  cross_school_benchmarking_enabled: boolean = false,
  benchmark_min_cohort_size: number = 10,
}
```

---

## 3. Feature Domains

### 3.1 Quick-Log Engine (The 5-Second Promise)

#### 3.1.1 Architecture — Three Layers

**Layer 1 — Local-first deterministic matching (no network required)**

PWA shell caches (refreshed every 5 minutes via `GET v1/behaviour/quick-log/context`):

- Category list (<1KB)
- Teacher's favourited categories and templates
- Recent 20 students (id, first_name, last_name, year_group)
- If during active class: full class roster
- Description templates per category per locale

**Layer 2 — Optimistic submit with offline queue and idempotency**

On submit:

1. Client generates `idempotency_key` (UUIDv4) and assigns `local-{uuid}` temporary ID
2. Immediate success toast (optimistic)
3. Request queued in IndexedDB via service worker
4. Queue attempts delivery immediately
5. If network fails: retry with exponential backoff (5s, 15s, 45s, 2min, 5min)
6. Server deduplicates on idempotency_key — if already exists, returns existing incident (200 OK, no side effects)
7. Undo window: 30 seconds. If tapped before sync: cancel queued request. If tapped after sync: send compensating `POST /withdraw` with reason "Undone by reporter"
8. Compensating withdrawal cascades: auto-created sanctions → cancelled, tasks → cancelled, escalated incidents → withdrawn, unsent notifications → cancelled, sent notifications → correction notification dispatched, points auto-corrected, awards created within undo window → cancelled
9. Queue status: subtle badge on FAB showing pending count

**Layer 3 — AI natural language parsing (enhancement, never critical path)**

AI is off the critical path:

1. Local deterministic matching runs first (regex/fuzzy against cached data)
2. High-confidence local match → show immediately, no API call
3. Ambiguous → fire Sonnet API (2s timeout) for disambiguation
4. Timeout/error → fall back to standard quick-log, text pre-filled in description
5. AI prompt includes only: category names, student first+last names, subject names. No IDs or other PII.
6. Confidence score per field. Below `ai_confidence_threshold` → highlighted for manual selection
7. All AI inputs/outputs logged to `audit_logs` if `ai_audit_logging` is true

#### 3.1.2 Standard Quick-Log UX

FAB on every school page (mobile). Bottom sheet:

1. **Category picker**: Favourites row (max 6) then full grid. Positive-first. One tap.
2. **Student picker**: If during class: class roster grid with multi-select for bulk. Then recent students. Then search (type-ahead against cache, then server).
3. **Description**: Template chips. Tap to use as-is or edit. Teacher per-category favourites in `user_ui_preferences`.
4. **Context**: Auto-populated during class. Otherwise `context_type` picker.
5. **Submit**: Auto-submit if configured. Confirmation: "Merit logged ✓. Undo."

**Bulk positive**: Multi-select 2–15 students, one category, one template. One incident per student. "8 merits logged. Undo."

**Tap-from-register**: On attendance marking page, each student row has quick-log icon. Pre-populates student + class context.

#### 3.1.3 Context-Aware Quick-Log

During active class: FAB → category → tap student from roster → template → done. **Four taps**.
Outside class: FAB → category → search student → template → context type → done. **Six taps, under 10 seconds**.

---

### 3.2 Points & Recognition System

**Points are computed, not stored.** Running total = SUM of `behaviour_incident_participants.points_awarded` for non-withdrawn incidents. Redis cache with 5-minute TTL.

**Awards are permanent** (not revoked on point decrease). Repeatability governed by `repeat_mode`, `tier_group`, and `tier_level` on award types. Auto-award worker checks repeat constraints and uses `triggered_by_incident_id` for idempotency.

**Recognition wall publication**: Incident qualifies → parent consent (if required) → admin approval (if required) → published. Both gates must pass.

---

### 3.3 Policy Rules Engine

#### 3.3.1 Evaluation Flow

1. Incident created or participant added
2. Load active rules sorted by priority ASC
3. For each student participant, evaluate rules against incident + participant + student context
4. First fully matching rule wins
5. Snapshot the evaluation in `behaviour_policy_evaluations` with full input facts
6. Execute actions in order, recording each in `behaviour_policy_action_executions`
7. Dedup guards: before creating escalated incidents, sanctions, or tasks, check if same rule version already created one for this student in the evaluation window

#### 3.3.2 Versioning

Every rule edit:

1. Increments `current_version`
2. Inserts snapshot into `behaviour_policy_rule_versions`
3. All future evaluations reference the version, not the mutable rule

Historical traceability: the `behaviour_policy_evaluations` table links to the exact rule version, captures all evaluated facts, records which conditions matched and which failed, and logs every action execution with success/failure status. This answers "which exact rule version fired on 12 November and why" without ambiguity.

#### 3.3.3 Example Rules

**"3 verbal warnings in 30 days → written warning"**: conditions: repeat_count_min=3, repeat_window_days=30, repeat_category_ids=[verbal-warning]. Actions: auto_escalate to written warning, notify year_head.

**"Suspension for SEND students requires approval"**: conditions: severity_min=7, student_has_send=true. Actions: require_approval, create_task for SENCO.

**"Negative incident during transport → notify deputy"**: conditions: polarity=negative, context_types=[transport]. Actions: notify_roles[deputy_principal], flag_for_review.

#### 3.3.4 Settings UI

`/settings/behaviour-policies` — drag-and-drop priority ordering, condition builder, action builder, test mode (dry-run), import/export JSON for ETB policy sharing.

---

### 3.4 Sanctions & Consequences

**Detentions**: Conflict check against timetable + existing sanctions. Parent acknowledgement tracking. Bulk mark served.

**Suspensions**: Attendance integration (auto-marked `excused_suspended`). Dual metrics: with/without suspensions. Return workflow: conditions checklist, `return_check_in` task 3 school days before end. Parent meeting tracked as `behaviour_task`.

**Appeals**: Full first-class workflow via `behaviour_appeals`. Submit → under_review → hearing_scheduled → decided. Outcomes: upheld_original, modified, overturned. Auto-applies amendments to incident/sanction.

---

### 3.5 Safeguarding Chronicle — Inspection-Grade

#### 3.5.1 Permission Model

| Permission            | Who                        | What                                                         |
| --------------------- | -------------------------- | ------------------------------------------------------------ |
| `safeguarding.report` | All staff                  | Create concern. See own reports' acknowledgement status only |
| `safeguarding.view`   | DLP, Deputy DLP, Principal | View all concerns (audit-logged)                             |
| `safeguarding.manage` | DLP, Principal             | Update, record actions, referrals, uploads                   |
| `safeguarding.seal`   | Principal + one other      | Seal (dual-control, irreversible)                            |

Every access audit-logged at service layer. Break-glass access for emergencies with mandatory post-access review.

#### 3.5.2 Reporter Acknowledgement

Concern reported → immediate "CP-XXXXX received" → DLP acknowledges → reporter sees "Assigned" → investigation → "Under review". Reporter sees NO case detail.

#### 3.5.3 SLA Tracking

Critical: 4h. High: 24h. Medium: 72h. Low: 7 days. SLA deadlines count wall-clock hours (child safety doesn't pause for weekends). Worker checks every 30 minutes.

#### 3.5.4 Document Chronology & Export

All actions recorded in `safeguarding_actions` with timestamps. Attachments via `behaviour_attachments`.

**Immutable export**: PDF with complete chronology, embedded documents, watermark ("Confidential — Generated by [user] on [date]"), SHA-256 hash on final page.

**Redacted export**: Names → reference codes, staff → role titles, redactable attachments → "[Document withheld]".

#### 3.5.5 Retention

Default 25 years from student DOB. After retention period: flagged for review, not auto-deleted.

#### 3.5.6 Break-Glass with Post-Access Governance

On grant: principal provides target user, reason, duration (max 72h), optional scope to specific concerns. On expiry: auto-revoked, notification to DLP + principal, after-action review task created listing all records/attachments accessed. Reviewer marks each access as appropriate/inappropriate. Non-completion escalates after 7 school days.

---

### 3.6 Intervention Tracking

**SEND-aware**: When `send_aware = true`, review form includes SEND considerations, AI avoids diagnostic language, outcome analytics track SEND vs non-SEND separately.

**Task integration**: Plan creation → task for staff. Each review date → intervention_review task. Overdue → auto-escalate priority. Completion due → reminder 7 days before target_end_date.

---

### 3.7 Student Behaviour Profile

#### Profile Header

Student info, cumulative points with sparkline, positive/negative ratio, intervention status, house + award badges, quick-log button.

#### Tabs

**Timeline**: All incidents, sanctions, interventions, awards. Filterable. Group incidents show other participants (links to their profiles).
**Analytics**: Points trend, category donut, time heatmap (exposure-adjusted), subject correlation, teacher correlation, attendance overlay, cohort comparison.
**Interventions**: Active and historical with review histories.
**Sanctions**: Calendar view, appeal history.
**Awards**: Earned awards with tier progression.

#### Parent View — Hardened

**Guardian-specific visibility**: Per-student control of which guardian sees behaviour data. Restricted guardians see no behaviour section, receive no notifications, and are excluded from digests.

**Parent-safe content rendering priority**:

```
if (parent_description is not null)  → show parent_description
else if (description_template_used)  → show template text
else                                 → show category_name + date only
```

No path ever shows raw `description` to a parent. Attachments invisible. Other participants' names hidden.

**Notification digest**: When enabled, individual notifications batched into daily digest at configured time (tenant timezone).

---

### 3.8 Behaviour Pulse — Exposure-Adjusted

#### 3.8.1 Five-Dimension Pulse

| Dimension                  | Calculation                                                        |
| -------------------------- | ------------------------------------------------------------------ |
| **Positive Ratio**         | `positive / total` over rolling 7 days                             |
| **Severity Index**         | Weighted avg severity of negative incidents (normalised, inverted) |
| **Serious Incident Count** | Severity ≥ 7 in last 7 days, per 100 students                      |
| **Resolution Rate**        | Follow-ups completed / follow-ups required over 30 days            |
| **Reporting Confidence**   | Staff who logged this week / total teaching staff                  |

Composite score (weighted 20/25/25/15/15) only displayed when Reporting Confidence ≥ 50%.

#### 3.8.2 Exposure-Adjusted Analytics

All rates normalised by contact hours from scheduling module. Temporal exposure snapshots are per-academic-period with `effective_from`/`effective_until` dates. Analytics join to the exposure snapshot active at the incident's `occurred_at`, not current data.

| Metric           | Normalisation            |
| ---------------- | ------------------------ |
| Per subject      | Per 100 teaching periods |
| Per teacher      | Per 100 teaching periods |
| Per year group   | Per 100 students         |
| Per period       | Per 100 active classes   |
| Per context type | Per 100 hours            |

---

### 3.9 AI Features — With Governance

**Tenant-level controls**: `ai_insights_enabled`, `ai_narrative_enabled`, `ai_nl_query_enabled` — each independently toggleable.

**Blocked language**: No diagnoses, no family inference, no clinical terminology. Behavioural patterns only.

**Human confirmation**: Quick-log parse → one-tap confirm. Narrative → labelled "AI-generated — verify". NL query → "Data as of [timestamp]. Verify critical findings."

**Fallback**: 2s timeout (quick-log), 10s (summaries), 15s (queries) → graceful degradation. Below confidence threshold → highlight for manual input.

**Retention**: AI inputs/outputs in `audit_logs` (36 months). No AI content stored as source of truth.

**Data classification in AI prompts**: Only STAFF-class data. Never `context_notes`, SEND details, or safeguarding flags. NL query enforces scope AND classification — queries cannot return SENSITIVE fields without permission.

---

### 3.10 Analytics & ETB Benchmarking

#### School-Wide Reports

Behaviour overview, points leaderboard, heatmap analysis, category trends, staff logging activity, positive/negative ratio, sanction summary, intervention outcomes, policy rule effectiveness, task completion, parent engagement.

#### ETB Benchmarking

Canonical taxonomy maps tenant categories to fixed set: praise, merit, minor_positive, major_positive, verbal_warning, written_warning, detention, internal_suspension, external_suspension, expulsion, note, observation, other.

Metrics (per 100 students, per period): ratio, incident rate by canonical category, suspension rate, detention rate, resolution rate, reporting confidence.

Anonymity rules: opt-in per tenant, minimum cohort size (default 10), no student-level data crosses tenant boundary. Materialised view `mv_behaviour_benchmarks` contains only aggregates.

---

## 4. Data Classification Model

Five formal visibility classes enforced across all data surfaces:

| Class          | Label               | Scope                                                                |
| -------------- | ------------------- | -------------------------------------------------------------------- |
| `PUBLIC`       | Public              | Anyone (recognition wall published, house leaderboard published)     |
| `PARENT`       | Parent-visible      | Authenticated parent for own child, respecting guardian restrictions |
| `STAFF`        | General staff       | Authenticated staff within behaviour scope                           |
| `SENSITIVE`    | Pastoral/management | Staff with `behaviour.view_sensitive`                                |
| `SAFEGUARDING` | Safeguarding-only   | Staff with `safeguarding.view` + audit log                           |

**Enforcement**:

| Surface                    | How                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| API responses              | Service-layer field stripping by user's highest class                                                       |
| Search indexing            | STAFF-class fields only. Safeguarding entities not indexed. `converted_to_safeguarding` indexed as `closed` |
| Hover card / preview cache | STAFF-class only. No `context_notes`                                                                        |
| PDF exports                | Export declares its class. Student pack = STAFF. Case file = SAFEGUARDING. Parent = PARENT                  |
| AI prompts                 | STAFF-class only. Never `context_notes`, SEND details, or safeguarding flags                                |
| Report builder             | Available columns filtered by user's class. SAFEGUARDING columns never in report builder                    |
| Materialised views         | Summary = STAFF aggregates. Benchmarks = PUBLIC-equivalent aggregates                                       |
| Notifications / digest     | PARENT-class only. Uses `parent_description` or category name                                               |

**Implementation**: `DataClassification` enum and `stripFieldsByClassification(data, userClass)` utility in `packages/shared/`.

---

## 5. Timezone & School Calendar Semantics

**Foundational rule**: All time-sensitive logic uses tenant local time from `tenant_settings.timezone`.

| Operation                               | Time basis                                                   |
| --------------------------------------- | ------------------------------------------------------------ |
| Quick-log `occurred_at` default         | Tenant local time                                            |
| Cron jobs                               | Evaluated per tenant in their timezone                       |
| Parent digest send time                 | Tenant timezone                                              |
| "14 teaching days" (logging gaps)       | School days only (excludes `school_closures`)                |
| "Returning in 3 days" (suspension)      | School days only                                             |
| Review reminder due dates               | School days. Holiday → fires on last school day before       |
| Escalation windows (repeat_window_days) | Calendar days (how schools think about repeat behaviour)     |
| Safeguarding SLA deadlines              | Wall-clock hours (child safety doesn't pause for weekends)   |
| DST transitions                         | Luxon/date-fns-tz. TIMESTAMPTZ in UTC, rendered in tenant TZ |

Shared utilities in `packages/shared/`: `isSchoolDay(tenantId, date)`, `addSchoolDays(tenantId, fromDate, days)`.

---

## 6. API Endpoints

### 6.1 Core Behaviour (behaviour.controller.ts) — ~28 endpoints

| Method | Route                                          | Description                      | Permission                            |
| ------ | ---------------------------------------------- | -------------------------------- | ------------------------------------- |
| POST   | `v1/behaviour/incidents`                       | Create incident                  | `behaviour.log`                       |
| POST   | `v1/behaviour/incidents/quick`                 | Quick-log                        | `behaviour.log`                       |
| POST   | `v1/behaviour/incidents/ai-parse`              | AI NL parse → preview            | `behaviour.log` + AI enabled          |
| POST   | `v1/behaviour/incidents/bulk-positive`         | Bulk merit for multiple students | `behaviour.log`                       |
| GET    | `v1/behaviour/incidents`                       | Paginated list with filters      | `behaviour.view` + scope              |
| GET    | `v1/behaviour/incidents/:id`                   | Full detail                      | `behaviour.view` + scope              |
| PATCH  | `v1/behaviour/incidents/:id`                   | Update                           | `behaviour.manage`                    |
| PATCH  | `v1/behaviour/incidents/:id/status`            | Status transition                | `behaviour.manage`                    |
| POST   | `v1/behaviour/incidents/:id/withdraw`          | Withdraw with reason             | `behaviour.manage`                    |
| POST   | `v1/behaviour/incidents/:id/follow-up`         | Record follow-up                 | `behaviour.manage`                    |
| POST   | `v1/behaviour/incidents/:id/participants`      | Add participant                  | `behaviour.manage`                    |
| DELETE | `v1/behaviour/incidents/:id/participants/:pid` | Remove participant               | `behaviour.manage`                    |
| POST   | `v1/behaviour/incidents/:id/attachments`       | Upload evidence                  | `behaviour.manage`                    |
| GET    | `v1/behaviour/incidents/:id/attachments`       | List attachments                 | `behaviour.view` + visibility         |
| GET    | `v1/behaviour/incidents/:id/attachments/:aid`  | Download                         | `behaviour.view` + visibility + audit |
| GET    | `v1/behaviour/incidents/:id/history`           | Audit trail                      | `behaviour.manage`                    |
| GET    | `v1/behaviour/incidents/:id/policy-evaluation` | Full policy decision trace       | `behaviour.manage`                    |
| GET    | `v1/behaviour/incidents/my`                    | My logged incidents              | `behaviour.log`                       |
| GET    | `v1/behaviour/incidents/feed`                  | Live feed for pulse              | `behaviour.view`                      |
| GET    | `v1/behaviour/quick-log/context`               | Pre-fetch cache payload          | `behaviour.log`                       |
| GET    | `v1/behaviour/quick-log/templates`             | Templates per category           | `behaviour.log`                       |

Plus remaining CRUD/filter endpoints.

### 6.2 Student Behaviour (behaviour-students.controller.ts) — 13 endpoints

Profile, timeline, analytics, points, sanctions, interventions, awards, AI summary, preview, export, parent-view, quick-context, tasks. All scope-enforced.

### 6.3 Sanctions (behaviour-sanctions.controller.ts) — 14 endpoints

CRUD, status transitions, today's sanctions, my supervision, parent meeting scheduling, appeal lodging/outcome, calendar view, active/returning suspensions, bulk mark.

### 6.4 Interventions (behaviour-interventions.controller.ts) — 12 endpoints

CRUD, status transitions, reviews with auto-populated stats, overdue list, my interventions, outcome analytics, complete with outcome, auto-populate data.

### 6.5 Tasks (behaviour-tasks.controller.ts) — 8 endpoints

List, my tasks, detail, update, complete, cancel, overdue, dashboard stats.

### 6.6 Appeals (behaviour-appeals.controller.ts) — 8 endpoints

| Method | Route                                  | Description                                | Permission                               |
| ------ | -------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| POST   | `v1/behaviour/appeals`                 | Submit appeal                              | `behaviour.manage` or parent (own child) |
| GET    | `v1/behaviour/appeals`                 | List with filters                          | `behaviour.manage`                       |
| GET    | `v1/behaviour/appeals/:id`             | Detail                                     | `behaviour.manage`                       |
| PATCH  | `v1/behaviour/appeals/:id`             | Update (assign reviewer, schedule hearing) | `behaviour.manage`                       |
| POST   | `v1/behaviour/appeals/:id/decide`      | Record decision + auto-apply amendments    | `behaviour.manage`                       |
| POST   | `v1/behaviour/appeals/:id/withdraw`    | Withdraw                                   | `behaviour.manage` or appellant          |
| POST   | `v1/behaviour/appeals/:id/attachments` | Upload evidence                            | `behaviour.manage`                       |
| GET    | `v1/behaviour/appeals/:id/attachments` | List evidence                              | `behaviour.manage`                       |

### 6.7 Safeguarding (safeguarding.controller.ts) — 18 endpoints

Report, my-reports, list, detail, update, status transition, assign, record action, action history, tusla referral, garda referral, upload attachment, download attachment, case file PDF (watermarked), redacted PDF, seal (dual-control), break-glass grant, dashboard.

### 6.8 Recognition & Houses (behaviour-recognition.controller.ts) — 12 endpoints

Internal wall, leaderboard, house standings, house detail, manual award, award history, publish request, publication status, admin approve/reject, public feed, public houses, bulk house assignment.

### 6.9 Analytics & Pulse (behaviour-analytics.controller.ts) — 16 endpoints

Pulse (5 dimensions), heatmap (rate-normalised), overview, trends, categories, historical heatmap, subjects, staff activity, sanctions, interventions, ratio, comparisons, policy effectiveness, task completion, AI query, query history.

### 6.10 Configuration (behaviour-config.controller.ts) — 17 endpoints

Categories CRUD, award types CRUD, house CRUD, policy rules CRUD + versioning + test mode, policy evaluation log.

### 6.11 Parent Behaviour (parent-behaviour.controller.ts) — 6 endpoints

Summary, incidents, points+awards, sanctions, acknowledge notification, recognition wall.

### 6.12 Admin Operations (behaviour-admin.controller.ts) — 12 endpoints

| Method | Route                                         | Description                                             | Permission        |
| ------ | --------------------------------------------- | ------------------------------------------------------- | ----------------- |
| POST   | `v1/behaviour/admin/recompute-points`         | Recompute for student/year/tenant                       | `behaviour.admin` |
| POST   | `v1/behaviour/admin/rebuild-awards`           | Check and create missing threshold awards               | `behaviour.admin` |
| POST   | `v1/behaviour/admin/recompute-pulse`          | Force recalculate pulse                                 | `behaviour.admin` |
| POST   | `v1/behaviour/admin/backfill-tasks`           | Scan for missing tasks and create                       | `behaviour.admin` |
| POST   | `v1/behaviour/admin/resend-notification`      | Re-queue parent notification                            | `behaviour.admin` |
| POST   | `v1/behaviour/admin/refresh-views`            | Force refresh materialised views                        | `behaviour.admin` |
| POST   | `v1/behaviour/admin/policy-dry-run`           | Evaluate against hypothetical incident                  | `behaviour.admin` |
| GET    | `v1/behaviour/admin/dead-letter`              | Failed/stuck BullMQ jobs                                | `behaviour.admin` |
| POST   | `v1/behaviour/admin/dead-letter/:jobId/retry` | Retry dead-letter job                                   | `behaviour.admin` |
| GET    | `v1/behaviour/admin/scope-audit`              | Show exactly which students a user can see              | `behaviour.admin` |
| GET    | `v1/behaviour/admin/health`                   | Queue depths, cache rates, view freshness, scan backlog | `behaviour.admin` |
| POST   | `v1/behaviour/admin/reindex-search`           | Rebuild Meilisearch index                               | `behaviour.admin` |

**Total: ~135 endpoints across 12 controllers.**

---

## 7. Frontend Pages

### Staff Behaviour — `/behaviour/`

| Route                             | Description                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `/behaviour`                      | Pulse dashboard — 5-dimension gauge, live feed, heatmap, task summary                    |
| `/behaviour/incidents`            | Incident list with tabs (All/Positive/Negative/Pending/Escalated/My)                     |
| `/behaviour/incidents/new`        | Full incident creation                                                                   |
| `/behaviour/incidents/[id]`       | Detail: participants, sanctions, attachments, escalation chain, policy decision, history |
| `/behaviour/students`             | Student overview table (scope-filtered)                                                  |
| `/behaviour/students/[studentId]` | Profile (tabs: Timeline, Analytics, Interventions, Sanctions, Awards, Tasks)             |
| `/behaviour/sanctions`            | Sanctions list with calendar toggle                                                      |
| `/behaviour/sanctions/today`      | Today's detentions — bulk mark                                                           |
| `/behaviour/interventions`        | Plans list (Active/Overdue/Completed)                                                    |
| `/behaviour/interventions/new`    | Create with goal builder + SEND                                                          |
| `/behaviour/interventions/[id]`   | Detail with reviews, auto-populated form, tasks                                          |
| `/behaviour/appeals`              | Appeals list with status tabs                                                            |
| `/behaviour/appeals/[id]`         | Appeal detail with timeline, hearing notes, decision form                                |
| `/behaviour/recognition`          | Recognition wall + leaderboard + houses + publication management                         |
| `/behaviour/tasks`                | Task inbox — my pending tasks                                                            |
| `/behaviour/analytics`            | Full analytics dashboard (exposure-adjusted)                                             |
| `/behaviour/analytics/ai`         | NL behaviour queries                                                                     |
| `/behaviour/alerts`               | Pattern alerts with per-user acknowledge/resolve/dismiss                                 |

### Safeguarding — `/safeguarding/`

| Route                         | Description                                                              |
| ----------------------------- | ------------------------------------------------------------------------ |
| `/safeguarding`               | Dashboard: open concerns, severity, SLA compliance, tasks                |
| `/safeguarding/concerns`      | Concern list                                                             |
| `/safeguarding/concerns/new`  | Report concern (all staff)                                               |
| `/safeguarding/concerns/[id]` | Case file: detail, chronological actions, attachments, referrals, export |
| `/safeguarding/my-reports`    | Reporter acknowledgement view                                            |

### Parent — `/parent/behaviour/`

| Route                           | Description                                                         |
| ------------------------------- | ------------------------------------------------------------------- |
| `/parent/behaviour`             | Per-child summary (guardian-filtered, parent_description rendering) |
| `/parent/behaviour/recognition` | School recognition wall                                             |

### Settings

| Route                            | Description                                                        |
| -------------------------------- | ------------------------------------------------------------------ |
| `/settings/behaviour-categories` | Category CRUD with benchmark mapping                               |
| `/settings/behaviour-awards`     | Award types with repeatability semantics                           |
| `/settings/behaviour-houses`     | House teams + bulk assignment                                      |
| `/settings/behaviour-policies`   | Policy rule builder with versioning, test mode, import/export      |
| `/settings/behaviour-general`    | Module settings (points, notifications, pulse, AI, recognition)    |
| `/settings/safeguarding`         | DLP assignment, fallback chain, SLA config, retention              |
| `/settings/behaviour-admin`      | Operational dashboard: health, dead-letter, recompute, scope audit |

**Total: ~28 pages + 7 settings pages.**

---

## 8. Worker Jobs

| Job                                | Queue           | Trigger                                  | Description                                        |
| ---------------------------------- | --------------- | ---------------------------------------- | -------------------------------------------------- |
| `behaviour:evaluate-policy`        | `behaviour`     | On incident creation / participant added | Run policy engine with versioned evaluation ledger |
| `behaviour:check-awards`           | `behaviour`     | On incident creation                     | Check thresholds with repeat/dedup guards          |
| `behaviour:detect-patterns`        | `behaviour`     | Cron daily 05:00 tenant TZ               | Exposure-adjusted pattern detection                |
| `behaviour:task-reminders`         | `behaviour`     | Cron daily 08:00 tenant TZ               | Due today + overdue notifications                  |
| `behaviour:suspension-return`      | `behaviour`     | Cron daily 07:00 tenant TZ               | Return check-in tasks (3 school days)              |
| `behaviour:parent-notification`    | `notifications` | On incident creation per config          | Multi-channel with acknowledgement + dedup         |
| `behaviour:digest-notifications`   | `notifications` | Cron at tenant-configured time           | Batched parent digest                              |
| `behaviour:attachment-scan`        | `behaviour`     | On attachment upload                     | AV scan, update scan_status                        |
| `behaviour:break-glass-expiry`     | `behaviour`     | Cron every 5 min                         | Revoke expired grants, create review tasks         |
| `safeguarding:sla-check`           | `behaviour`     | Cron every 30 min                        | SLA breach detection + escalation                  |
| `safeguarding:critical-escalation` | `behaviour`     | On critical concern creation             | Immediate DLP notification + 30-min fallback chain |

---

## 9. Permissions & Scope

### 9.1 Permission Matrix

| Permission                       | Description                                                 | Default Roles                   |
| -------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| `behaviour.log`                  | Create incidents, access quick-log                          | All staff                       |
| `behaviour.view`                 | View within scope                                           | All staff (scope-limited)       |
| `behaviour.manage`               | Update, manage sanctions/interventions/tasks                | Year heads, deputies, principal |
| `behaviour.admin`                | Configure categories, policies, awards, settings, admin ops | School admin, principal         |
| `behaviour.view_sensitive`       | View context_notes, meeting notes, SEND notes               | Pastoral team, management       |
| `behaviour.view_staff_analytics` | View staff logging activity                                 | Deputy, principal               |
| `behaviour.ai_query`             | AI narrative and NL query                                   | Staff with view + AI enabled    |
| `behaviour.appeal`               | Submit appeal as parent                                     | Parent (own child)              |
| `safeguarding.report`            | Create concerns, view own report status                     | All staff                       |
| `safeguarding.view`              | View concerns (audit-logged)                                | DLP, deputy DLP, principal      |
| `safeguarding.manage`            | Update, actions, referrals, uploads                         | DLP, principal                  |
| `safeguarding.seal`              | Initiate/approve seal (dual-control)                        | Principal + designated          |

### 9.2 Scope-Based Access

| Scope        | Sees                             | Typical Roles         |
| ------------ | -------------------------------- | --------------------- |
| `own`        | Only incidents they logged       | Teacher (default)     |
| `class`      | Students in classes they teach   | Class/subject teacher |
| `year_group` | Students in assigned year groups | Year head, tutor      |
| `pastoral`   | All students + sensitive fields  | Pastoral lead, SENCO  |
| `all`        | Everything except safeguarding   | Deputy, principal     |

Stored on `tenant_memberships`. Enforced server-side in service layer across all surfaces including previews, search, exports.

---

## 10. Integration Points

| Module             | Integration                                                                            | Direction        |
| ------------------ | -------------------------------------------------------------------------------------- | ---------------- |
| **Attendance**     | Suspension auto-marking, attendance rates in profiles/reviews/pulse                    | Bidirectional    |
| **Scheduling**     | Context-aware quick-log, exposure data for rate normalisation                          | Behaviour reads  |
| **Gradebook**      | Grade data in student analytics, risk detection cross-reference                        | Bidirectional    |
| **Communications** | Parent notifications via multi-channel infra, delivery webhooks                        | Behaviour writes |
| **Search**         | Incidents indexed (STAFF-class only, scope-filtered, status-projected)                 | Behaviour writes |
| **Approvals**      | Policy-driven approval gating for suspensions/expulsions                               | Bidirectional    |
| **Dashboard**      | Admin: pulse + counts + tasks. Teacher: their incidents + tasks. Parent: child summary | Provides data    |
| **Reports**        | Cross-module insights, behaviour-specific reports                                      | Reports reads    |
| **Students**       | SEND flag for policy engine, year_group for scope                                      | Behaviour reads  |

**Future**: Predictive Early Warning (primary risk signal), Smart Parent Digest (positive incidents in digest), Leave → Substitution (hotspot data for substitute briefing).

---

## 11. Notification Templates

| Template                            | Trigger                           | Channels                          |
| ----------------------------------- | --------------------------------- | --------------------------------- |
| `behaviour_positive_parent`         | Positive incident (if configured) | Per parent preference             |
| `behaviour_negative_parent`         | Negative ≥ severity threshold     | Per parent preference             |
| `behaviour_sanction_parent`         | Sanction created                  | Preference + email                |
| `behaviour_award_parent`            | Award earned                      | Per parent preference             |
| `behaviour_acknowledgement_request` | Severity ≥ ack threshold          | In-app + email                    |
| `behaviour_task_reminder`           | Task due today                    | In-app                            |
| `behaviour_task_overdue`            | Task overdue                      | In-app + email                    |
| `behaviour_appeal_outcome`          | Appeal decided                    | In-app + email                    |
| `safeguarding_concern_reported`     | New concern                       | Push to DLP                       |
| `safeguarding_critical_escalation`  | Critical, DLP no response 30min   | Push to next in chain             |
| `safeguarding_reporter_ack`         | DLP acknowledges                  | In-app to reporter                |
| `safeguarding_sla_breach`           | SLA passed                        | Push + email to DLP + deputy      |
| `safeguarding_break_glass_review`   | Break-glass window expired        | In-app + email to DLP + principal |

---

## 12. Materialised Views

| View                           | Refresh      | Purpose                                                                                                       |
| ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `mv_student_behaviour_summary` | Every 15 min | STAFF-class aggregates: student_id, year, positive/negative counts, points, ratio, last_incident_at           |
| `mv_behaviour_benchmarks`      | Nightly      | PUBLIC-class aggregates: tenant, period, canonical_category, student_count, incident_count, rate_per_100      |
| `mv_behaviour_exposure_rates`  | Nightly      | Per-subject/teacher/period teaching hours from scheduling. Per-academic-period snapshots with effective dates |

---

## 13. Seed Data per Tenant

| Entity                 | Count                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| Categories             | 12 (4 positive, 6 negative, 2 neutral) with benchmark mappings     |
| Award types            | 4 (Bronze 50pt, Silver 100pt, Gold 200pt, Principal's Award 500pt) |
| Description templates  | ~60 (2-3 per category per locale, en + ar)                         |
| Policy rules           | 3 (escalation, suspension approval, expulsion approval)            |
| Notification templates | 13                                                                 |

---

## 14. Scope Summary & Implementation Estimate

### Scope

| Dimension              | Count                                              |
| ---------------------- | -------------------------------------------------- |
| Database tables        | 25                                                 |
| Materialised views     | 3                                                  |
| API endpoints          | ~135                                               |
| Frontend pages         | ~28 + 7 settings                                   |
| Worker jobs            | 11                                                 |
| Permissions            | 12                                                 |
| Sequences              | 5 (BH-, SN-, IV-, CP-, AP-)                        |
| Notification templates | 13                                                 |
| Seed data per tenant   | 12 categories + 4 awards + ~60 templates + 3 rules |

### Implementation

| Phase                              | Scope                                                                                                                                                                                                                                                 | Duration  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **A: Core + Temporal**             | Data model with snapshots, incidents CRUD, participants with constraint, quick-log (deterministic + idempotency + offline), categories, templates table, permissions with scope, state machines with status projection, data classification framework | 2.5 weeks |
| **B: Policy Engine**               | Rules with versioning, evaluation ledger, action execution log, condition evaluator, action executor with dedup, settings UI with test mode                                                                                                           | 1.5 weeks |
| **C: Sanctions + Appeals + Tasks** | Sanctions full lifecycle, appeals (table, API, UI), task engine, approval integration                                                                                                                                                                 | 1.5 weeks |
| **D: Safeguarding**                | Concerns, actions, SLA, DLP workflow, attachments (AV + signed URLs + object lock), seal, reporter ack, break-glass with post-access governance, exports (watermarked + redacted)                                                                     | 2 weeks   |
| **E: Recognition + Interventions** | Points (computed), awards with repeatability, houses, publication consent, interventions with SEND, reviews                                                                                                                                           | 1 week    |
| **F: Analytics + AI**              | Pulse (5 dimensions, exposure-adjusted), all analytics, AI with governance, pattern detection with alert ownership, ETB benchmarking                                                                                                                  | 1.5 weeks |
| **G: Hardening + Ops**             | Parent portal with parent_description, guardian visibility, digest, admin operations controller, calendar-aware timing, integration testing, scope audit, RLS verification, classification audit                                                      | 1.5 weeks |

**Total: ~12 weeks. Budget 12–13 weeks.**

This is EduPod's largest module — larger than gradebook (148 endpoints but simpler domain mechanics) and scheduling (128 endpoints but narrower trust surface). The estimate reflects the depth of trust mechanics, not just feature breadth.

---

## 15. What Makes This the Complete Product

v1.0 had wow factor. v2.0 had institutional trust. v3.0 has forensic defensibility.

**Provable policy decisions.** Every auto-escalation, sanction, and approval gate traces to a versioned rule, a complete facts snapshot, matched/unmatched conditions, and action execution log. A parent, board, or court can follow the exact decision path.

**Temporal truth.** Context snapshots freeze student year group, SEND status, class, house, and intervention state at incident creation. Exposure data is snapshotted per period. Analytics don't drift when students change context.

**Complete data governance.** Five formal visibility classes (PUBLIC → PARENT → STAFF → SENSITIVE → SAFEGUARDING) enforced at every surface: API, search, cache, export, AI, reports, notifications. The system structurally cannot leak data across class boundaries.

**Forensic safeguarding.** No delete (seal with dual-control only). SLA tracking on wall-clock hours. Watermarked exports with SHA-256 integrity. Reporter acknowledgement without case access. Break-glass with mandatory post-access review. 25-year retention.

**Full accountability.** The task engine makes every required action visible. Appeals give parents a first-class dispute channel. The admin operations controller gives staff the tools to maintain the system in production.

The competitor comparison has 40+ capability rows. Compass Chronicle checks roughly 6. VSware checks 2. EduPod checks all of them.

This is a school climate operating system with forensic-grade mechanics underneath the impressive surface. Schools will demo it for the pulse dashboard. They'll buy it for the policy engine and the safeguarding chronology. They'll renew because the analytics helped them make better decisions, the task engine made sure nothing fell through the cracks, and the policy ledger proved their consistency when challenged.
