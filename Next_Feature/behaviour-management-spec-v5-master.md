# Behaviour Management Module — Master Specification v5.0

> **Module**: `modules/behaviour/` + `modules/safeguarding/`
> **Priority**: Non-negotiable — Phase 2 launch-gate feature
> **Spec version**: 5.0 Master — Self-contained, supersedes all prior versions
> **Scope**: ~155 endpoints, ~32 frontend pages, 13 worker jobs, 8 settings pages, 32 database tables

---

## 1. Vision

Six design principles:

1. **Speed above all**: 5-second quick-log from phone. If it's slower than a sticky note, teachers won't use it.
2. **Positive-first culture**: Architecturally biased toward recognition. The system should change school culture, not just track behaviour.
3. **Cross-module intelligence**: Behaviour linked to attendance, scheduling, grades, and communications in the same database. Structurally impossible for siloed competitors.
4. **Safeguarding is sacred**: Separate permission domain, every access audit-logged, inspection-grade chronology.
5. **ETB-ready from day one**: Anonymous cross-school benchmarking with standardised taxonomy via a dedicated platform-level ETB panel.
6. **Operational maturity**: The system is not just feature-complete but operationally self-sustaining — with lifecycle governance, scale strategy, amendment workflows, and automated trust verification.

---

## 2. Data Model

### 2.1 Core Tables

---

#### `behaviour_categories`

Configurable per tenant. The taxonomy of everything that can be recorded.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `name` | VARCHAR(100) NOT NULL | |
| `name_ar` | VARCHAR(100) | Arabic translation |
| `polarity` | ENUM('positive', 'negative', 'neutral') NOT NULL | |
| `severity` | INT NOT NULL | 1-10 scale |
| `point_value` | INT NOT NULL DEFAULT 0 | |
| `color` | VARCHAR(7) | Hex |
| `icon` | VARCHAR(50) | Lucide icon name |
| `requires_follow_up` | BOOLEAN DEFAULT false | |
| `requires_parent_notification` | BOOLEAN DEFAULT false | |
| `parent_visible` | BOOLEAN DEFAULT true | |
| `benchmark_category` | ENUM('praise', 'merit', 'minor_positive', 'major_positive', 'verbal_warning', 'written_warning', 'detention', 'internal_suspension', 'external_suspension', 'expulsion', 'note', 'observation', 'other') NOT NULL | Canonical mapping for ETB benchmarking |
| `display_order` | INT NOT NULL DEFAULT 0 | |
| `is_active` | BOOLEAN DEFAULT true | |
| `is_system` | BOOLEAN DEFAULT false | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**UNIQUE**: `(tenant_id, name)`.

**Seed categories** (on tenant provisioning):
Positive: Praise (1pt, benchmark: praise), Merit (3pt, benchmark: merit), Outstanding Achievement (5pt, benchmark: major_positive), Principal's Award (10pt, benchmark: major_positive).
Negative: Verbal Warning (-1pt), Written Warning (-3pt), Detention (-5pt), Suspension Internal (-15pt), Suspension External (-15pt), Expulsion (-50pt).
Neutral: Note to File (0pt, benchmark: note), Observation (0pt, benchmark: observation).

---

#### `behaviour_incidents`

The core event record. Every positive, negative, or neutral behaviour event.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `incident_number` | VARCHAR(20) NOT NULL | Sequence: `BH-000001` via `SequenceService` |
| `idempotency_key` | VARCHAR(36) NULL | Client-generated UUIDv4 for network retry dedup |
| `category_id` | UUID FK NOT NULL | -> `behaviour_categories` |
| `polarity` | ENUM('positive', 'negative', 'neutral') NOT NULL | Denormalised from category |
| `severity` | INT NOT NULL | Denormalised from category at creation |
| `reported_by_id` | UUID FK NOT NULL | -> `users` |
| `description` | TEXT NOT NULL | Internal description. Min 3 chars. Visibility class: STAFF |
| `parent_description` | TEXT NULL | Parent-safe version. If NULL, parent portal renders category name + template only. Visibility class: PARENT |
| `parent_description_ar` | TEXT NULL | Arabic parent-safe description. Visibility class: PARENT |
| `parent_description_locked` | BOOLEAN DEFAULT false | Locked after parent notification sent — edits require amendment workflow |
| `parent_description_set_by_id` | UUID FK NULL | Staff who wrote/approved the parent description |
| `parent_description_set_at` | TIMESTAMPTZ NULL | |
| `context_notes` | TEXT NULL | Internal only. Visibility class: SENSITIVE |
| `location` | VARCHAR(100) NULL | |
| `context_type` | ENUM('class', 'break', 'before_school', 'after_school', 'lunch', 'transport', 'extra_curricular', 'off_site', 'online', 'other') NOT NULL DEFAULT 'class' | |
| `occurred_at` | TIMESTAMPTZ NOT NULL | When the incident happened |
| `logged_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | When entered into system |
| `academic_year_id` | UUID FK NOT NULL | |
| `academic_period_id` | UUID FK NULL | |
| `schedule_entry_id` | UUID FK NULL | -> `schedules` |
| `subject_id` | UUID FK NULL | Denormalised for analytics |
| `room_id` | UUID FK NULL | Denormalised |
| `period_order` | INT NULL | |
| `weekday` | INT NULL | 0-6 |
| `status` | ENUM -- see state machine below | |
| `approval_status` | ENUM('not_required', 'pending', 'approved', 'rejected') DEFAULT 'not_required' | Set by policy engine |
| `approval_request_id` | UUID FK NULL | -> `approval_requests` |
| `parent_notification_status` | ENUM('not_required', 'pending', 'sent', 'delivered', 'failed', 'acknowledged') DEFAULT 'not_required' | |
| `follow_up_required` | BOOLEAN DEFAULT false | |
| `escalated_from_id` | UUID FK NULL | -> `behaviour_incidents` -- escalation chain |
| `policy_evaluation_id` | UUID FK NULL | -> `behaviour_policy_evaluations` -- full traceability |
| `context_snapshot` | JSONB NOT NULL DEFAULT '{}' | Frozen at creation -- never updated |
| `retention_status` | ENUM('active', 'archived', 'anonymised') DEFAULT 'active' | Record lifecycle status |
| `archived_at` | TIMESTAMPTZ NULL | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

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

**Parent description send-gate**: For negative incidents with severity >= `parent_notification_send_gate_severity` (setting, default 3), parent notification cannot dispatch until one of:
- `parent_description` is non-null (staff-written safe description), OR
- A `behaviour_description_template` was used at creation (template is inherently safe), OR
- `parent_description` is explicitly set to empty string (staff confirmed: use category name only)

This prevents accidental dispatch of thin or internal-facing content to parents.

**Idempotency**: Partial unique index on `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL`. On receiving a create request with an existing key, return the existing incident (200 OK) with no side effects re-executed.

**State machine**:

```
draft -> active                          (on submit / auto-submit)
draft -> withdrawn                       (logged in error before submission)

active -> investigating                  (management begins formal investigation)
active -> under_review                   (flagged for management review)
active -> escalated                      (auto or manual)
active -> resolved                       (follow-up completed or closed)
active -> withdrawn                      (logged in error -- audit preserved)

investigating -> awaiting_approval       (consequence requires approval per policy)
investigating -> awaiting_parent_meeting (policy or manual)
investigating -> resolved                (investigation concluded, no further action)
investigating -> escalated               (investigation reveals higher severity)
investigating -> converted_to_safeguarding (concern discovered during investigation)

awaiting_approval -> active              (approval rejected -- reverts)
awaiting_approval -> resolved            (approval granted, consequence applied)

awaiting_parent_meeting -> resolved      (meeting held, matter closed)
awaiting_parent_meeting -> escalated     (meeting outcome warrants escalation)

under_review -> active | escalated | resolved | withdrawn

escalated -> investigating              (escalated incident investigated)
escalated -> resolved                    (resolved at escalated level)

resolved -> closed_after_appeal          (outcome changed on appeal)
resolved -> superseded                   (replaced by later determination)

withdrawn -- terminal
resolved -- terminal (unless appealed/superseded)
closed_after_appeal -- terminal
superseded -- terminal
converted_to_safeguarding -- terminal
closed -- projected terminal (what behaviour-only users see instead of converted_to_safeguarding)
```

**Status projection**: The `converted_to_safeguarding` status is visible only to users with `safeguarding.view`. For all other users, the API, search index, cache, and exports render it as `closed` with reason "Referred internally". This prevents behaviour-only users from inferring the existence of a safeguarding concern.

**Indexes**:
- `(tenant_id, occurred_at DESC)` -- primary listing
- `(tenant_id, polarity, occurred_at DESC)` -- polarity filter
- `(tenant_id, status)` -- status filter
- `(tenant_id, status, follow_up_required)` -- task queries
- `(tenant_id, category_id, occurred_at DESC)` -- category drill-down
- `(tenant_id, reported_by_id, occurred_at DESC)` -- "my incidents"
- `(tenant_id, subject_id, weekday, period_order)` -- heatmap analytics
- `(tenant_id, context_type, weekday, period_order)` -- policy matching
- `(tenant_id, academic_year_id)` -- year-scoped reporting
- `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL` -- dedup
- `(tenant_id, retention_status) WHERE retention_status = 'active'` -- active record queries

**Domain boundary constraint**: Every incident must have at least one participant with `participant_type = 'student'` and `role IN ('subject', 'witness', 'bystander', 'reporter', 'victim', 'instigator')`. Enforced at application layer on creation and via database trigger on participant DELETE (prevents removing the last student participant).

---

#### `behaviour_incident_participants`

One incident, many participants. Participants can be students, staff, parents, visitors, or unknown persons. Students are the primary domain -- non-student participants are supplementary context.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `incident_id` | UUID FK NOT NULL | -> `behaviour_incidents` |
| `participant_type` | ENUM('student', 'staff', 'parent', 'visitor', 'unknown') NOT NULL | |
| `student_id` | UUID FK NULL | Required when `participant_type = 'student'` |
| `staff_id` | UUID FK NULL | Required when `participant_type = 'staff'` |
| `parent_id` | UUID FK NULL | Required when `participant_type = 'parent'` |
| `external_name` | VARCHAR(200) NULL | For visitor/unknown |
| `role` | ENUM('subject', 'witness', 'bystander', 'reporter', 'victim', 'instigator', 'mediator') DEFAULT 'subject' | |
| `points_awarded` | INT NOT NULL DEFAULT 0 | Per-participant. Only applied for students |
| `parent_visible` | BOOLEAN DEFAULT true | Per-participant override |
| `notes` | TEXT NULL | |
| `student_snapshot` | JSONB NULL | Frozen at creation. NULL for non-student participants |
| `created_at` | TIMESTAMPTZ | |

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

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `sanction_number` | VARCHAR(20) NOT NULL | Sequence: `SN-000001` |
| `incident_id` | UUID FK NOT NULL | -> `behaviour_incidents` |
| `student_id` | UUID FK NOT NULL | -> `students` |
| `type` | ENUM('detention', 'suspension_internal', 'suspension_external', 'expulsion', 'community_service', 'loss_of_privilege', 'restorative_meeting', 'other') | |
| `status` | ENUM -- see state machine below | |
| `approval_status` | ENUM('not_required', 'pending', 'approved', 'rejected') DEFAULT 'not_required' | |
| `approval_request_id` | UUID FK NULL | -> `approval_requests` |
| `scheduled_date` | DATE NOT NULL | |
| `scheduled_start_time` | TIME NULL | |
| `scheduled_end_time` | TIME NULL | |
| `scheduled_room_id` | UUID FK NULL | -> `rooms` |
| `supervised_by_id` | UUID FK NULL | -> `users` |
| `suspension_start_date` | DATE NULL | |
| `suspension_end_date` | DATE NULL | |
| `suspension_days` | INT NULL | |
| `return_conditions` | TEXT NULL | |
| `parent_meeting_required` | BOOLEAN DEFAULT false | |
| `parent_meeting_date` | TIMESTAMPTZ NULL | |
| `parent_meeting_notes` | TEXT NULL | Visibility class: SENSITIVE |
| `served_at` | TIMESTAMPTZ NULL | |
| `served_by_id` | UUID FK NULL | |
| `replaced_by_id` | UUID FK NULL | -> `behaviour_sanctions` -- alternative consequence |
| `appeal_notes` | TEXT NULL | |
| `appeal_outcome` | ENUM('upheld', 'modified', 'overturned') NULL | |
| `notes` | TEXT NULL | |
| `retention_status` | ENUM('active', 'archived', 'anonymised') DEFAULT 'active' | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Sanction state machine**:

```
pending_approval -> scheduled           (approval granted)
pending_approval -> cancelled            (approval rejected)

scheduled -> served                      (confirmed completed)
scheduled -> partially_served            (student left early, disruption)
scheduled -> no_show                     (student did not attend)
scheduled -> excused                     (legitimate reason)
scheduled -> cancelled                   (withdrawn by management)
scheduled -> rescheduled                 (date changed -- new sanction, this -> superseded)
scheduled -> not_served_absent           (student absent from school)
scheduled -> appealed                    (formal appeal lodged)

appealed -> scheduled                    (appeal rejected, original stands)
appealed -> cancelled                    (appeal upheld, sanction removed)
appealed -> replaced                     (appeal partially upheld, alternative consequence)

partially_served -- terminal
served -- terminal
no_show -> rescheduled | cancelled
excused -> rescheduled | cancelled
not_served_absent -> rescheduled
replaced -- terminal (replaced_by_id links to alternative)
cancelled -- terminal
```

---

#### `behaviour_tasks`

Unified action/task tracker. Every required next step across the behaviour domain is a task.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `task_type` | ENUM('follow_up', 'intervention_review', 'parent_meeting', 'parent_acknowledgement', 'approval_action', 'sanction_supervision', 'return_check_in', 'safeguarding_action', 'document_requested', 'appeal_review', 'break_glass_review', 'guardian_restriction_review', 'custom') | |
| `entity_type` | ENUM('incident', 'sanction', 'intervention', 'safeguarding_concern', 'appeal', 'break_glass_grant', 'exclusion_case', 'guardian_restriction') NOT NULL | Polymorphic origin |
| `entity_id` | UUID NOT NULL | FK to origin record |
| `title` | VARCHAR(300) NOT NULL | |
| `description` | TEXT NULL | |
| `assigned_to_id` | UUID FK NOT NULL | -> `users` |
| `created_by_id` | UUID FK NOT NULL | -> `users` |
| `priority` | ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium' | |
| `status` | ENUM('pending', 'in_progress', 'completed', 'cancelled', 'overdue') DEFAULT 'pending' | |
| `due_date` | TIMESTAMPTZ NOT NULL | |
| `completed_at` | TIMESTAMPTZ NULL | |
| `completed_by_id` | UUID FK NULL | |
| `completion_notes` | TEXT NULL | |
| `reminder_sent_at` | TIMESTAMPTZ NULL | |
| `overdue_notified_at` | TIMESTAMPTZ NULL | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Indexes**:
- `(tenant_id, assigned_to_id, status, due_date)` -- "my pending tasks"
- `(tenant_id, entity_type, entity_id)` -- tasks for a record
- `(tenant_id, status, due_date)` -- overdue detection

Auto-created by: incidents with follow_up, sanctions with parent meetings, interventions at review dates, suspensions ending in 3 school days, safeguarding actions with due dates, policy rule actions, appeal submissions, break-glass expiry, guardian restriction review dates, exclusion case statutory deadlines.

---

#### `behaviour_interventions`

Structured intervention plans linked to behaviour patterns.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `intervention_number` | VARCHAR(20) NOT NULL | Sequence: `IV-000001` |
| `student_id` | UUID FK NOT NULL | -> `students` |
| `title` | VARCHAR(200) NOT NULL | |
| `type` | ENUM('behaviour_plan', 'mentoring', 'counselling_referral', 'restorative', 'academic_support', 'parent_engagement', 'external_agency', 'other') | |
| `status` | ENUM('planned', 'active', 'monitoring', 'completed', 'abandoned') | |
| `trigger_description` | TEXT NOT NULL | |
| `goals` | JSONB NOT NULL DEFAULT '[]' | `[{ goal, measurable_target, deadline }]` -- Zod validated |
| `strategies` | JSONB NOT NULL DEFAULT '[]' | `[{ strategy, responsible_staff_id, frequency }]` |
| `assigned_to_id` | UUID FK NOT NULL | -> `users` |
| `start_date` | DATE NOT NULL | |
| `target_end_date` | DATE NULL | |
| `actual_end_date` | DATE NULL | |
| `review_frequency_days` | INT DEFAULT 14 | |
| `next_review_date` | DATE NULL | |
| `outcome` | ENUM('improved', 'no_change', 'deteriorated', 'inconclusive') NULL | |
| `outcome_notes` | TEXT NULL | |
| `send_aware` | BOOLEAN DEFAULT false | Student has SEND/learning support |
| `send_notes` | TEXT NULL | Visibility class: SENSITIVE |
| `retention_status` | ENUM('active', 'archived', 'anonymised') DEFAULT 'active' | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

#### `behaviour_intervention_incidents`

Join table: incidents that triggered an intervention.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `intervention_id` | UUID FK NOT NULL | |
| `incident_id` | UUID FK NOT NULL | |
| `created_at` | TIMESTAMPTZ | |

**UNIQUE**: `(intervention_id, incident_id)`.

---

#### `behaviour_intervention_reviews`

Periodic check-ins. Append-only.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `intervention_id` | UUID FK NOT NULL | |
| `reviewed_by_id` | UUID FK NOT NULL | |
| `review_date` | DATE NOT NULL | |
| `progress` | ENUM('on_track', 'some_progress', 'no_progress', 'regression') | |
| `goal_updates` | JSONB DEFAULT '[]' | Per-goal status |
| `notes` | TEXT NOT NULL | |
| `next_review_date` | DATE NULL | |
| `behaviour_points_since_last` | INT | Auto-calculated |
| `attendance_rate_since_last` | DECIMAL(5,2) | Auto-calculated |
| `created_at` | TIMESTAMPTZ | Append-only |

---

#### `behaviour_recognition_awards`

Milestone awards. Append-only (except superseded flag).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `student_id` | UUID FK NOT NULL | |
| `award_type_id` | UUID FK NOT NULL | -> `behaviour_award_types` |
| `points_at_award` | INT NOT NULL | Snapshot of cumulative points |
| `awarded_by_id` | UUID FK NOT NULL | |
| `awarded_at` | TIMESTAMPTZ NOT NULL | |
| `academic_year_id` | UUID FK NOT NULL | |
| `triggered_by_incident_id` | UUID FK NULL | For auto-awards: which incident pushed past threshold. Dedup guard |
| `superseded_by_id` | UUID FK NULL | -> `behaviour_recognition_awards` -- higher-tier award |
| `notes` | TEXT NULL | |
| `parent_notified_at` | TIMESTAMPTZ NULL | |
| `created_at` | TIMESTAMPTZ | |

---

#### `behaviour_award_types`

Configurable per tenant with repeatability semantics.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `name` | VARCHAR(100) NOT NULL | |
| `name_ar` | VARCHAR(100) | |
| `description` | TEXT NULL | |
| `points_threshold` | INT NULL | Auto-trigger at this cumulative total (NULL = manual only) |
| `repeat_mode` | ENUM('once_ever', 'once_per_year', 'once_per_period', 'unlimited') DEFAULT 'once_per_year' | |
| `repeat_max_per_year` | INT NULL | Max per student per year. NULL = unlimited within mode |
| `tier_group` | VARCHAR(50) NULL | e.g. 'achievement_tier'. Awards in same group are related |
| `tier_level` | INT NULL | Higher = better. Bronze=1, Silver=2, Gold=3 |
| `supersedes_lower_tiers` | BOOLEAN DEFAULT false | Earning this marks lower-tier awards in same group as superseded |
| `icon` | VARCHAR(50) | |
| `color` | VARCHAR(7) | |
| `display_order` | INT DEFAULT 0 | |
| `is_active` | BOOLEAN DEFAULT true | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Auto-award dedup**: Before the worker creates an award, it checks repeat_mode, repeat_max_per_year, and `triggered_by_incident_id` to prevent duplicates from BullMQ retries.

---

#### `behaviour_house_teams`

Optional house/team system for collective point competitions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `name` | VARCHAR(100) NOT NULL | |
| `name_ar` | VARCHAR(100) | |
| `color` | VARCHAR(7) NOT NULL | |
| `icon` | VARCHAR(50) | |
| `display_order` | INT DEFAULT 0 | |
| `is_active` | BOOLEAN DEFAULT true | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

#### `behaviour_house_memberships`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `student_id` | UUID FK NOT NULL | |
| `house_id` | UUID FK NOT NULL | |
| `academic_year_id` | UUID FK NOT NULL | |
| `created_at` | TIMESTAMPTZ | |

**UNIQUE**: `(tenant_id, student_id, academic_year_id)`.

---

#### `behaviour_description_templates`

First-class entity powering quick-log speed.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `category_id` | UUID FK NOT NULL | -> `behaviour_categories` |
| `locale` | VARCHAR(5) NOT NULL DEFAULT 'en' | 'en' or 'ar' |
| `text` | VARCHAR(500) NOT NULL | |
| `display_order` | INT NOT NULL DEFAULT 0 | |
| `is_active` | BOOLEAN DEFAULT true | |
| `is_system` | BOOLEAN DEFAULT false | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

Teacher favourites stored in `user_ui_preferences` as `behaviour_template_favourites: uuid[]`.

---

#### `behaviour_alerts`

Pattern detection results from the daily worker.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `alert_type` | ENUM('escalating_student', 'disengaging_student', 'hotspot', 'logging_gap', 'overdue_review', 'suspension_return', 'policy_threshold_breach') | |
| `severity` | ENUM('info', 'warning', 'critical') | |
| `student_id` | UUID FK NULL | |
| `subject_id` | UUID FK NULL | |
| `staff_id` | UUID FK NULL | |
| `title` | VARCHAR(300) NOT NULL | |
| `description` | TEXT NOT NULL | |
| `data_snapshot` | JSONB NOT NULL | Supporting evidence |
| `status` | ENUM('active', 'resolved') DEFAULT 'active' | Aggregate: active until all recipients resolve/dismiss |
| `resolved_at` | TIMESTAMPTZ NULL | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

#### `behaviour_alert_recipients`

Per-user alert state.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `alert_id` | UUID FK NOT NULL | -> `behaviour_alerts` |
| `recipient_id` | UUID FK NOT NULL | -> `users` |
| `recipient_role` | VARCHAR(50) NULL | Role that qualified them |
| `status` | ENUM('unseen', 'seen', 'acknowledged', 'snoozed', 'resolved', 'dismissed') DEFAULT 'unseen' | |
| `seen_at` | TIMESTAMPTZ NULL | |
| `acknowledged_at` | TIMESTAMPTZ NULL | |
| `snoozed_until` | TIMESTAMPTZ NULL | |
| `resolved_at` | TIMESTAMPTZ NULL | |
| `dismissed_at` | TIMESTAMPTZ NULL | |
| `dismissed_reason` | TEXT NULL | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

Alert auto-transitions to `resolved` when last recipient resolves/dismisses.

---

#### `behaviour_parent_acknowledgements`

Tracks parent acknowledgement of behaviour notifications. Append-only.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `incident_id` | UUID FK NULL | |
| `sanction_id` | UUID FK NULL | |
| `amendment_notice_id` | UUID FK NULL | -> `behaviour_amendment_notices` -- for re-acknowledgement |
| `parent_id` | UUID FK NOT NULL | |
| `notification_id` | UUID FK NULL | -> `notifications` |
| `channel` | ENUM('email', 'whatsapp', 'in_app') | |
| `sent_at` | TIMESTAMPTZ NOT NULL | |
| `delivered_at` | TIMESTAMPTZ NULL | |
| `read_at` | TIMESTAMPTZ NULL | |
| `acknowledged_at` | TIMESTAMPTZ NULL | |
| `acknowledgement_method` | ENUM('in_app_button', 'email_link', 'whatsapp_reply') NULL | |
| `created_at` | TIMESTAMPTZ | |

---

#### `behaviour_entity_history`

Unified structured history for all high-stakes entities. Append-only audit trail.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `entity_type` | ENUM('incident', 'sanction', 'intervention', 'appeal', 'task', 'exclusion_case', 'publication_approval', 'break_glass_grant', 'guardian_restriction') NOT NULL | |
| `entity_id` | UUID NOT NULL | FK to origin |
| `changed_by_id` | UUID FK NOT NULL | |
| `change_type` | VARCHAR(50) NOT NULL | Domain-specific: 'created', 'status_changed', 'updated', 'participant_added', 'participant_removed', 'sanction_created', 'follow_up_recorded', 'escalated', 'withdrawn', 'attachment_added', 'policy_action_applied', 'appeal_outcome', 'parent_description_set', 'amendment_sent', 'legal_hold_set', 'legal_hold_released', etc. |
| `previous_values` | JSONB NULL | |
| `new_values` | JSONB NOT NULL | |
| `reason` | TEXT NULL | Required for status changes, withdrawals, amendments |
| `created_at` | TIMESTAMPTZ | Append-only |

**Indexes**:
- `(tenant_id, entity_type, entity_id, created_at)` -- entity timeline query
- `(tenant_id, entity_type, created_at)` -- global activity feed

All high-stakes entities get full structured lifecycle -- incidents, sanctions, appeals, tasks, interventions, exclusion cases, publication approvals, break-glass grants, guardian restrictions.

---

#### `behaviour_publication_approvals`

Consent and approval for public display.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `publication_type` | ENUM('recognition_wall_website', 'house_leaderboard_website', 'individual_achievement_website') | |
| `entity_type` | ENUM('incident', 'award') | |
| `entity_id` | UUID NOT NULL | |
| `student_id` | UUID FK NOT NULL | |
| `requires_parent_consent` | BOOLEAN DEFAULT true | |
| `parent_consent_status` | ENUM('not_requested', 'pending', 'granted', 'denied') DEFAULT 'not_requested' | |
| `parent_consent_at` | TIMESTAMPTZ NULL | |
| `admin_approved` | BOOLEAN DEFAULT false | |
| `admin_approved_by_id` | UUID FK NULL | |
| `published_at` | TIMESTAMPTZ NULL | |
| `unpublished_at` | TIMESTAMPTZ NULL | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

#### `behaviour_appeals`

First-class appeal workflow for incidents and sanctions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `appeal_number` | VARCHAR(20) NOT NULL | Sequence: `AP-000001` |
| `entity_type` | ENUM('incident', 'sanction') NOT NULL | |
| `incident_id` | UUID FK NOT NULL | |
| `sanction_id` | UUID FK NULL | Required when entity_type = 'sanction' |
| `student_id` | UUID FK NOT NULL | |
| `appellant_type` | ENUM('parent', 'student', 'staff') NOT NULL | |
| `appellant_parent_id` | UUID FK NULL | |
| `appellant_staff_id` | UUID FK NULL | |
| `status` | ENUM('submitted', 'under_review', 'hearing_scheduled', 'decided', 'withdrawn') | |
| `grounds` | TEXT NOT NULL | |
| `grounds_category` | ENUM('factual_inaccuracy', 'disproportionate_consequence', 'procedural_error', 'mitigating_circumstances', 'mistaken_identity', 'other') NOT NULL | |
| `submitted_at` | TIMESTAMPTZ NOT NULL | |
| `reviewer_id` | UUID FK NULL | |
| `hearing_date` | TIMESTAMPTZ NULL | |
| `hearing_attendees` | JSONB NULL | `[{ name, role }]` |
| `hearing_notes` | TEXT NULL | Visibility class: SENSITIVE |
| `decision` | ENUM('upheld_original', 'modified', 'overturned') NULL | |
| `decision_reasoning` | TEXT NULL | |
| `decided_by_id` | UUID FK NULL | |
| `decided_at` | TIMESTAMPTZ NULL | |
| `resulting_amendments` | JSONB NULL | Structured amendments -- what changed |
| `retention_status` | ENUM('active', 'archived', 'anonymised') DEFAULT 'active' | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

When a decision is made, the service automatically updates the incident/sanction, records changes in `behaviour_entity_history` with `change_type = 'appeal_outcome'`, creates follow-up tasks, generates a decision letter, and notifies the appellant.

---

#### `behaviour_amendment_notices`

Tracks corrections to records after parent notification or export has already been sent.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `entity_type` | ENUM('incident', 'sanction', 'appeal') NOT NULL | What was amended |
| `entity_id` | UUID NOT NULL | |
| `amendment_type` | ENUM('correction', 'supersession', 'retraction') NOT NULL | |
| `original_notification_id` | UUID FK NULL | -> `notifications` -- the original outbound notice |
| `original_export_id` | UUID FK NULL | If an export was generated before amendment |
| `what_changed` | JSONB NOT NULL | Structured diff: `{ field, old_value, new_value }[]` |
| `change_reason` | TEXT NOT NULL | |
| `changed_by_id` | UUID FK NOT NULL | |
| `authorised_by_id` | UUID FK NULL | If amendment requires authorisation |
| `correction_notification_sent` | BOOLEAN DEFAULT false | |
| `correction_notification_id` | UUID FK NULL | -> `notifications` |
| `correction_notification_sent_at` | TIMESTAMPTZ NULL | |
| `requires_parent_reacknowledgement` | BOOLEAN DEFAULT false | |
| `parent_reacknowledged_at` | TIMESTAMPTZ NULL | |
| `created_at` | TIMESTAMPTZ | |

**Amendment types**:
- `correction`: factual error in the record
- `supersession`: new information changes the interpretation
- `retraction`: record was made in error (distinct from withdrawal -- retraction applies after communication)

**Amendment workflow**: When a record is modified after parent notification has been sent:
1. `behaviour_entity_history` records the change
2. If the change affects parent-visible data (category, parent_description, sanction dates, appeal outcome):
   - `behaviour_amendment_notices` created
   - If `parent_description_locked = true`: unlock requires `behaviour.manage` + reason
   - Correction notification queued via comms module
   - If severity >= `parent_acknowledgement_required_severity`: `requires_parent_reacknowledgement = true`
3. If a PDF export was generated before the amendment: export marked as superseded, new export auto-generated with "Amended" watermark

---

#### `behaviour_exclusion_cases`

Bespoke workflow for suspensions and expulsions that exceed the standard sanction lifecycle.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `case_number` | VARCHAR(20) NOT NULL | Sequence: `EX-000001` |
| `sanction_id` | UUID FK NOT NULL | -> `behaviour_sanctions` -- the triggering sanction |
| `incident_id` | UUID FK NOT NULL | |
| `student_id` | UUID FK NOT NULL | |
| `type` | ENUM('suspension_extended', 'expulsion', 'managed_move', 'permanent_exclusion') NOT NULL | |
| `status` | ENUM('initiated', 'notice_issued', 'hearing_scheduled', 'hearing_held', 'decision_made', 'appeal_window', 'finalised', 'overturned') | |
| `formal_notice_issued_at` | TIMESTAMPTZ NULL | |
| `formal_notice_document_id` | UUID FK NULL | -> `behaviour_documents` |
| `hearing_date` | TIMESTAMPTZ NULL | |
| `hearing_attendees` | JSONB NULL | `[{ name, role, relationship }]` |
| `hearing_minutes_document_id` | UUID FK NULL | -> `behaviour_documents` |
| `student_representation` | TEXT NULL | Who represented the student |
| `board_pack_generated_at` | TIMESTAMPTZ NULL | |
| `board_pack_document_id` | UUID FK NULL | -> `behaviour_documents` |
| `decision` | ENUM('exclusion_confirmed', 'exclusion_modified', 'exclusion_reversed', 'alternative_consequence') NULL | |
| `decision_date` | TIMESTAMPTZ NULL | |
| `decision_letter_document_id` | UUID FK NULL | -> `behaviour_documents` |
| `decision_reasoning` | TEXT NULL | |
| `decided_by_id` | UUID FK NULL | |
| `conditions_for_return` | TEXT NULL | |
| `conditions_for_transfer` | TEXT NULL | |
| `appeal_deadline` | DATE NULL | Statutory: usually 10-15 school days from decision |
| `appeal_id` | UUID FK NULL | -> `behaviour_appeals` |
| `statutory_timeline` | JSONB NULL | `[{ step, required_by, completed_at, status }]` -- tracks compliance with statutory timelines |
| `linked_evidence_ids` | UUID[] DEFAULT '{}' | -> `behaviour_attachments` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Exclusion case lifecycle**:

```
initiated -> notice_issued            (formal notice generated and sent to parent)
notice_issued -> hearing_scheduled    (hearing date set, invite sent)
hearing_scheduled -> hearing_held     (hearing took place, minutes recorded)
hearing_held -> decision_made         (board/principal decision recorded)
decision_made -> appeal_window        (statutory appeal period begins)
appeal_window -> finalised            (appeal deadline passed, or appeal decided)
appeal_window -> overturned           (appeal succeeded)
```

**Statutory timeline tracking**: The `statutory_timeline` JSONB auto-populates based on case type with configurable deadlines. For Irish schools, this maps to Education Act provisions. Staff see a timeline checklist with green/amber/red status per step:

```json
[
  { "step": "Written notice to parents", "required_by": "2025-11-15", "completed_at": "2025-11-14", "status": "complete" },
  { "step": "Hearing scheduled (min 5 school days notice)", "required_by": "2025-11-22", "completed_at": null, "status": "pending" },
  { "step": "Board pack assembled", "required_by": "2025-11-21", "completed_at": null, "status": "pending" },
  { "step": "Decision communicated in writing", "required_by": null, "completed_at": null, "status": "not_started" },
  { "step": "Appeal window (15 school days)", "required_by": null, "completed_at": null, "status": "not_started" }
]
```

**Board pack generation**: One-click assembly of a complete evidence bundle as a single PDF:
- Incident detail with context snapshot
- All related incidents (escalation chain)
- Student behaviour profile summary
- Relevant intervention history
- All attached evidence
- Sanction history
- Chronological timeline
- Table of contents and page numbers

Generated via `behaviour_documents` with type `board_pack`.

---

#### `behaviour_documents`

Generated formal documents -- detention notices, suspension letters, appeal decisions, board packs.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `document_type` | ENUM('detention_notice', 'suspension_letter', 'return_meeting_letter', 'behaviour_contract', 'intervention_summary', 'appeal_hearing_invite', 'appeal_decision_letter', 'exclusion_notice', 'exclusion_decision_letter', 'board_pack', 'custom') NOT NULL | |
| `template_id` | UUID FK NULL | -> `behaviour_document_templates` |
| `entity_type` | ENUM('incident', 'sanction', 'intervention', 'appeal', 'exclusion_case') NOT NULL | Source entity |
| `entity_id` | UUID NOT NULL | |
| `student_id` | UUID FK NOT NULL | |
| `generated_by_id` | UUID FK NOT NULL | |
| `generated_at` | TIMESTAMPTZ NOT NULL | |
| `file_key` | VARCHAR(500) NOT NULL | S3 key (PDF) |
| `file_size_bytes` | BIGINT NOT NULL | |
| `sha256_hash` | VARCHAR(64) NOT NULL | |
| `locale` | VARCHAR(5) NOT NULL DEFAULT 'en' | |
| `data_snapshot` | JSONB NOT NULL | All merge-field values at generation time |
| `status` | ENUM('draft', 'finalised', 'sent', 'superseded') DEFAULT 'draft' | |
| `sent_at` | TIMESTAMPTZ NULL | |
| `sent_via` | ENUM('email', 'whatsapp', 'in_app', 'print') NULL | |
| `superseded_by_id` | UUID FK NULL | -> `behaviour_documents` |
| `superseded_reason` | TEXT NULL | |
| `created_at` | TIMESTAMPTZ | |

---

#### `behaviour_document_templates`

Configurable templates per tenant for formal documents.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `document_type` | ENUM -- same as `behaviour_documents.document_type` | |
| `name` | VARCHAR(200) NOT NULL | |
| `locale` | VARCHAR(5) NOT NULL DEFAULT 'en' | |
| `template_body` | TEXT NOT NULL | Handlebars template with `{{merge_field}}` placeholders |
| `merge_fields` | JSONB NOT NULL | `[{ field_name, source, description }]` -- documents available merge fields |
| `is_active` | BOOLEAN DEFAULT true | |
| `is_system` | BOOLEAN DEFAULT false | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Template engine**: Handlebars. Supports conditionals (`{{#if}}`) and loops (`{{#each}}`) for complex documents like board packs with dynamic sections, tables of contents, and evidence listings. Simple documents (detention notices, letters) use basic field replacement.

**Merge fields** include: `{{student_name}}`, `{{student_year_group}}`, `{{incident_date}}`, `{{incident_category}}`, `{{incident_description}}`, `{{parent_description}}`, `{{sanction_type}}`, `{{sanction_date}}`, `{{school_name}}`, `{{school_logo}}`, `{{principal_name}}`, `{{today_date}}`, etc.

**Seed templates**: System templates (en + ar) for each document type. Schools can customise or create their own.

---

#### `behaviour_guardian_restrictions`

Explicit, auditable guardian visibility restrictions with effective dates and legal basis.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `student_id` | UUID FK NOT NULL | |
| `parent_id` | UUID FK NOT NULL | |
| `restriction_type` | ENUM('no_behaviour_visibility', 'no_behaviour_notifications', 'no_portal_access', 'no_communications') NOT NULL | |
| `legal_basis` | VARCHAR(200) NULL | e.g. "Court order ref. 2025/FC/1234" |
| `reason` | TEXT NOT NULL | |
| `set_by_id` | UUID FK NOT NULL | |
| `approved_by_id` | UUID FK NULL | |
| `effective_from` | DATE NOT NULL | |
| `effective_until` | DATE NULL | NULL = indefinite |
| `review_date` | DATE NULL | When to review the restriction |
| `status` | ENUM('active', 'expired', 'revoked', 'superseded') DEFAULT 'active' | |
| `revoked_at` | TIMESTAMPTZ NULL | |
| `revoked_by_id` | UUID FK NULL | |
| `revoke_reason` | TEXT NULL | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

Every restriction change recorded in `behaviour_entity_history`. Worker checks daily for restrictions nearing review_date and creates reminder tasks. Expired restrictions auto-deactivate.

**Query pattern**: Before rendering parent portal or sending notification, the service checks for active restrictions:

```typescript
const hasRestriction = await tx.behaviour_guardian_restrictions.findFirst({
  where: {
    tenant_id: tenantId,
    student_id: studentId,
    parent_id: parentId,
    restriction_type: { in: ['no_behaviour_visibility', 'no_behaviour_notifications'] },
    status: 'active',
    effective_from: { lte: today },
    OR: [
      { effective_until: null },
      { effective_until: { gte: today } },
    ],
  },
});
```

---

#### `behaviour_legal_holds`

Dedicated legal hold tracking with full lifecycle. Prevents premature anonymisation of records linked to disputes, safeguarding, or exclusion cases.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `entity_type` | ENUM('incident', 'sanction', 'intervention', 'appeal', 'exclusion_case', 'task', 'attachment') NOT NULL | |
| `entity_id` | UUID NOT NULL | |
| `hold_reason` | TEXT NOT NULL | |
| `legal_basis` | VARCHAR(300) NULL | e.g. "Appeal AP-000042", "Safeguarding CP-000015", "Exclusion EX-000003" |
| `set_by_id` | UUID FK NOT NULL | |
| `set_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| `status` | ENUM('active', 'released') DEFAULT 'active' | |
| `released_by_id` | UUID FK NULL | |
| `released_at` | TIMESTAMPTZ NULL | |
| `release_reason` | TEXT NULL | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Indexes**:
- `(tenant_id, entity_type, entity_id, status) WHERE status = 'active'` -- retention worker check
- `(tenant_id, status)` -- admin overview

**Design rationale**: A dedicated table instead of booleans because:
- Multiple holds can apply to one entity (one from an appeal, one from a safeguarding concern, one from an exclusion case)
- Each hold has its own lifecycle -- who set it, why, when, and when it can be released
- Releasing one hold does not release the entity if another hold still applies
- Compliance auditors can answer "why was this record retained?" from the table alone
- Full audit trail via `behaviour_entity_history` for hold set/release events

**Propagation rules**: When a legal hold is set on any entity, the service automatically propagates holds to all linked entities:
- Incident -> participants, sanctions, tasks, attachments, policy evaluations, entity history, amendment notices, documents
- Appeal filed -> entire incident chain gets legal hold
- Safeguarding concern linked to incident -> incident and all linked entities get legal hold
- Exclusion case -> all linked entities get legal hold

**Retention worker integration**: Before anonymising any entity, the retention worker executes:
```typescript
const activeHold = await tx.behaviour_legal_holds.findFirst({
  where: {
    tenant_id: tenantId,
    entity_type: entityType,
    entity_id: entityId,
    status: 'active',
  },
});
if (activeHold) { /* skip anonymisation, log reason */ }
```

Legal holds are set by staff with `behaviour.admin`, require reason, and are logged in entity history.

---

### 2.2 Evidence & Attachments

#### `behaviour_attachments`

Unified attachment model with security hardening.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `entity_type` | ENUM('incident', 'sanction', 'intervention', 'safeguarding_concern', 'safeguarding_action', 'appeal', 'exclusion_case') NOT NULL | |
| `entity_id` | UUID NOT NULL | |
| `uploaded_by_id` | UUID FK NOT NULL | |
| `file_name` | VARCHAR(255) NOT NULL | |
| `file_key` | VARCHAR(500) NOT NULL | S3 key |
| `file_size_bytes` | BIGINT NOT NULL | |
| `mime_type` | VARCHAR(100) NOT NULL | |
| `sha256_hash` | VARCHAR(64) NOT NULL | Integrity verification |
| `classification` | ENUM('staff_statement', 'student_statement', 'parent_letter', 'meeting_minutes', 'screenshot', 'photo', 'scanned_document', 'referral_form', 'return_agreement', 'behaviour_contract', 'medical_report', 'agency_correspondence', 'other') NOT NULL | |
| `description` | VARCHAR(500) NULL | |
| `visibility` | ENUM('staff_all', 'pastoral_only', 'management_only', 'safeguarding_only') NOT NULL DEFAULT 'staff_all' | |
| `is_redactable` | BOOLEAN DEFAULT false | |
| `retention_status` | ENUM('active', 'archived', 'marked_for_deletion', 'retained_legal_hold') DEFAULT 'active' | |
| `retained_until` | DATE NULL | |
| `scan_status` | ENUM('pending', 'clean', 'infected', 'scan_failed') DEFAULT 'pending' | |
| `scanned_at` | TIMESTAMPTZ NULL | |
| `version` | INT NOT NULL DEFAULT 1 | |
| `replaced_by_id` | UUID FK NULL | -> `behaviour_attachments` |
| `created_at` | TIMESTAMPTZ | |

**S3 configuration**: SSE-S3 encryption (AES-256), Content-Disposition: attachment, ACL: private. Safeguarding entity attachments get S3 Object Lock (GOVERNANCE mode, retention per tenant config).

**AV scanning**: ClamAV daemon running on the Hetzner server (~200MB RAM). No files leave the infrastructure.

**Upload pipeline**: Validate size (<=10MB) -> allowlisted extensions -> MIME check -> magic bytes verification -> SHA-256 hash -> S3 upload with encryption -> create DB record with `scan_status = 'pending'` -> queue `behaviour:attachment-scan` job -> ClamAV stream scan -> clean files: `scan_status = 'clean'`, infected files: `scan_status = 'infected'` + quarantine to separate S3 prefix + alert to admin + audit log. **File not downloadable until `scan_status = 'clean'`**.

**Download pipeline**: Verify permissions (scope + visibility class) -> verify `scan_status = 'clean'` -> generate pre-signed URL (15-minute expiry) -> audit log -> safeguarding attachments additionally get chain-of-custody log entry and optional watermarking.

---

### 2.3 Policy Rules Engine

#### `behaviour_policy_rules` -- Staged Composition

Five-stage execution pipeline replacing single-pass first-match-wins.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `name` | VARCHAR(200) NOT NULL | |
| `description` | TEXT NULL | |
| `is_active` | BOOLEAN DEFAULT true | |
| `stage` | ENUM('consequence', 'approval', 'notification', 'support', 'alerting') NOT NULL | Execution stage |
| `priority` | INT NOT NULL DEFAULT 100 | Priority within stage. Lower = higher priority |
| `match_strategy` | ENUM('first_match', 'all_matching') NOT NULL DEFAULT 'first_match' | Per-rule override within stage |
| `stop_processing_stage` | BOOLEAN DEFAULT false | If true and this rule matches, no further rules in this stage are evaluated |
| `conditions` | JSONB NOT NULL | Zod-validated condition set |
| `current_version` | INT NOT NULL DEFAULT 1 | Incremented on every edit |
| `last_published_at` | TIMESTAMPTZ NULL | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

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
  context_types: z.array(z.enum([
    'class', 'break', 'before_school', 'after_school',
    'lunch', 'transport', 'extra_curricular', 'off_site', 'online', 'other'
  ])).optional(),
  participant_role: z.enum([
    'subject', 'witness', 'bystander', 'reporter', 'victim', 'instigator', 'mediator'
  ]).optional(),
  repeat_count_min: z.number().int().min(1).optional(),
  repeat_window_days: z.number().int().min(1).max(365).optional(),
  repeat_category_ids: z.array(z.string().uuid()).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  period_orders: z.array(z.number().int()).optional(),
});
```

All conditions optional. Omitted = wildcard. All specified must match (AND).

**Stage execution order** (always in this order):

| Stage | Purpose | Default Match |
|-------|---------|---------------|
| `consequence` | Escalation, sanction creation | `first_match` (one consequence per incident-student) |
| `approval` | Approval gating, blocking | `first_match` (one approval requirement) |
| `notification` | Parent notification, role notification | `all_matching` (multiple notification rules can fire) |
| `support` | Intervention creation, SEND tasks, pastoral alerts | `all_matching` (multiple support actions can fire) |
| `alerting` | Flag for review, analytics flagging | `all_matching` (multiple flags can fire) |

**Evaluation flow**:

```
for each stage in [consequence, approval, notification, support, alerting]:
  load rules for this stage, sorted by priority ASC
  matched_rules = []
  for each rule in stage:
    if rule.conditions match incident + student:
      matched_rules.push(rule)
      if rule.match_strategy == 'first_match' or rule.stop_processing_stage:
        break
  execute actions for all matched_rules in this stage
```

This means a single incident can trigger: one consequence rule (escalation to written warning), one approval rule (requires deputy sign-off), two notification rules (notify year head AND notify parent), one support rule (create SENCO task), and one alerting rule (flag for review). Previously this required one giant composite rule or was impossible.

---

#### `behaviour_policy_rule_actions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `rule_id` | UUID FK NOT NULL | |
| `action_type` | ENUM('auto_escalate', 'create_sanction', 'require_approval', 'require_parent_meeting', 'require_parent_notification', 'create_task', 'create_intervention', 'notify_roles', 'notify_users', 'flag_for_review', 'block_without_approval') | |
| `action_config` | JSONB NOT NULL | Type-specific config |
| `execution_order` | INT NOT NULL DEFAULT 0 | |
| `created_at` | TIMESTAMPTZ | |

---

#### `behaviour_policy_rule_versions`

Immutable snapshot of every version.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `rule_id` | UUID FK NOT NULL | |
| `version` | INT NOT NULL | |
| `name` | VARCHAR(200) NOT NULL | |
| `conditions` | JSONB NOT NULL | |
| `actions` | JSONB NOT NULL | Full snapshot: `[{ action_type, action_config, execution_order }]` |
| `stage` | ENUM -- same as rule stage | |
| `match_strategy` | ENUM -- same as rule match_strategy | |
| `priority` | INT NOT NULL | |
| `changed_by_id` | UUID FK NOT NULL | |
| `change_reason` | TEXT NULL | |
| `created_at` | TIMESTAMPTZ | Append-only |

**UNIQUE**: `(rule_id, version)`.

---

#### `behaviour_policy_evaluations`

Forensic ledger. Every policy evaluation recorded with full input snapshot. One evaluation record per stage per student per incident (up to 5 per student).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `incident_id` | UUID FK NOT NULL | |
| `student_id` | UUID FK NOT NULL | |
| `stage` | ENUM('consequence', 'approval', 'notification', 'support', 'alerting') NOT NULL | Which stage this evaluation belongs to |
| `rule_version_id` | UUID FK NULL | -> `behaviour_policy_rule_versions`. NULL if no rule matched |
| `evaluation_result` | ENUM('matched', 'no_match', 'skipped_inactive', 'error') | |
| `evaluated_input` | JSONB NOT NULL | Complete facts snapshot at evaluation time |
| `matched_conditions` | JSONB NULL | |
| `unmatched_conditions` | JSONB NULL | |
| `rules_evaluated_count` | INT NOT NULL | |
| `evaluation_duration_ms` | INT NULL | |
| `created_at` | TIMESTAMPTZ | Append-only |

**`evaluated_input` schema**: Category facts, student year group/SEND/intervention status at the moment of evaluation, participant role, repeat counts -- all frozen.

---

#### `behaviour_policy_action_executions`

One row per action per evaluation.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `evaluation_id` | UUID FK NOT NULL | |
| `action_type` | ENUM -- same as rule_actions | |
| `action_config` | JSONB NOT NULL | |
| `execution_status` | ENUM('success', 'failed', 'skipped_duplicate', 'skipped_condition') | |
| `created_entity_type` | VARCHAR(50) NULL | |
| `created_entity_id` | UUID NULL | |
| `failure_reason` | TEXT NULL | |
| `executed_at` | TIMESTAMPTZ NOT NULL | |
| `created_at` | TIMESTAMPTZ | Append-only |

---

### 2.4 Safeguarding Tables

#### `safeguarding_concerns`

No delete operation exists. Records can only be sealed.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `concern_number` | VARCHAR(20) NOT NULL | Sequence: `CP-000001` |
| `student_id` | UUID FK NOT NULL | |
| `reported_by_id` | UUID FK NOT NULL | |
| `concern_type` | ENUM('physical_abuse', 'emotional_abuse', 'sexual_abuse', 'neglect', 'self_harm', 'bullying', 'online_safety', 'domestic_violence', 'substance_abuse', 'mental_health', 'radicalisation', 'other') | |
| `severity` | ENUM('low', 'medium', 'high', 'critical') NOT NULL | |
| `status` | ENUM('reported', 'acknowledged', 'under_investigation', 'referred', 'monitoring', 'resolved', 'sealed') | |
| `description` | TEXT NOT NULL | |
| `immediate_actions_taken` | TEXT NULL | |
| `designated_liaison_id` | UUID FK NULL | |
| `assigned_to_id` | UUID FK NULL | |
| `is_tusla_referral` | BOOLEAN DEFAULT false | |
| `tusla_reference_number` | VARCHAR(50) NULL | |
| `tusla_referred_at` | TIMESTAMPTZ NULL | |
| `tusla_outcome` | TEXT NULL | |
| `is_garda_referral` | BOOLEAN DEFAULT false | |
| `garda_reference_number` | VARCHAR(50) NULL | |
| `garda_referred_at` | TIMESTAMPTZ NULL | |
| `resolution_notes` | TEXT NULL | |
| `resolved_at` | TIMESTAMPTZ NULL | |
| `reporter_acknowledgement_sent_at` | TIMESTAMPTZ NULL | |
| `reporter_acknowledgement_status` | ENUM('received', 'assigned', 'under_review') NULL | |
| `sla_first_response_due` | TIMESTAMPTZ NULL | Auto-set by severity |
| `sla_first_response_met_at` | TIMESTAMPTZ NULL | |
| `sealed_at` | TIMESTAMPTZ NULL | |
| `sealed_by_id` | UUID FK NULL | |
| `sealed_reason` | TEXT NULL | Mandatory |
| `seal_approved_by_id` | UUID FK NULL | Dual-control |
| `retention_until` | DATE NULL | Default: 25 years from student DOB |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Lifecycle**: reported -> acknowledged -> under_investigation -> referred/monitoring/resolved. Resolved is terminal -- new info creates a new linked concern. Sealed requires dual-control and is irreversible in-app. No delete operation exists in the codebase.

**Critical concern escalation**: severity = 'critical' -> immediate push to DLP -> 30min fallback to deputy DLP -> 30min to principal. SLA clocks count wall-clock hours (safeguarding doesn't pause for weekends).

---

#### `safeguarding_actions`

Chronological log. Append-only.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `concern_id` | UUID FK NOT NULL | |
| `action_by_id` | UUID FK NOT NULL | |
| `action_type` | ENUM('note_added', 'status_changed', 'assigned', 'meeting_held', 'parent_contacted', 'agency_contacted', 'tusla_referred', 'garda_referred', 'document_uploaded', 'document_downloaded', 'review_completed') | |
| `description` | TEXT NOT NULL | |
| `metadata` | JSONB DEFAULT '{}' | |
| `due_date` | TIMESTAMPTZ NULL | SLA deadline |
| `is_overdue` | BOOLEAN DEFAULT false | |
| `created_at` | TIMESTAMPTZ | |

---

#### `safeguarding_concern_incidents`

Join table. Access inherits safeguarding permissions -- invisible from behaviour side.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `concern_id` | UUID FK NOT NULL | |
| `incident_id` | UUID FK NOT NULL | |
| `linked_by_id` | UUID FK NOT NULL | |
| `created_at` | TIMESTAMPTZ | |

**UNIQUE**: `(concern_id, incident_id)`.

---

#### `safeguarding_break_glass_grants`

Break-glass access with post-access governance.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `granted_to_id` | UUID FK NOT NULL | |
| `granted_by_id` | UUID FK NOT NULL | Must be principal |
| `reason` | TEXT NOT NULL | |
| `scope` | ENUM('all_concerns', 'specific_concerns') DEFAULT 'all_concerns' | |
| `scoped_concern_ids` | UUID[] NULL | |
| `granted_at` | TIMESTAMPTZ NOT NULL | |
| `expires_at` | TIMESTAMPTZ NOT NULL | Max 72 hours |
| `revoked_at` | TIMESTAMPTZ NULL | |
| `after_action_review_required` | BOOLEAN DEFAULT true | |
| `after_action_review_completed_at` | TIMESTAMPTZ NULL | |
| `after_action_review_by_id` | UUID FK NULL | |
| `after_action_review_notes` | TEXT NULL | |
| `created_at` | TIMESTAMPTZ | |

**During access**: Every record viewed logged in `audit_logs` with `context = 'break_glass'` and grant ID.

**On expiry**: Auto-revoked (cron every 5min). Immediate notification to DLP + principal. After-action review task created -- lists all records and attachments accessed. Reviewer marks each as appropriate/inappropriate. Non-completion escalates after 7 school days.

---

### 2.5 Configuration (`tenant_settings.behaviour` JSONB)

All keys use Zod `.default()` -- no backfill needed.

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

  // Parent-safe content
  parent_notification_send_gate_severity: number = 3,
  parent_description_auto_lock_on_send: boolean = true,
  parent_description_amendment_requires_auth: boolean = true,

  // Document generation
  document_generation_enabled: boolean = true,
  document_auto_generate_detention_notice: boolean = false,
  document_auto_generate_suspension_letter: boolean = true,
  document_auto_generate_exclusion_notice: boolean = true,

  // Retention
  incident_retention_years: number = 7,
  sanction_retention_years: number = 7,
  intervention_retention_years: number = 7,
  appeal_retention_years: number = 10,
  exclusion_case_retention_years: number = 25,
  task_retention_years: number = 3,
  policy_evaluation_retention_years: number = 7,
  alert_retention_years: number = 3,
  parent_ack_retention_years: number = 7,

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

  // Admin ops
  admin_destructive_ops_dual_approval: boolean = true,
}
```

---

## 3. Feature Domains

### 3.1 Quick-Log Engine (The 5-Second Promise)

#### 3.1.1 Architecture -- Online with Idempotency

**Data pre-fetch** (refreshed every 5 minutes via `GET v1/behaviour/quick-log/context`):
- Category list (<1KB)
- Teacher's favourited categories and templates
- Recent 20 students (id, first_name, last_name, year_group)
- If during active class: full class roster
- Description templates per category per locale

**Submit flow with idempotency**:

1. Client generates `idempotency_key` (UUIDv4)
2. `POST v1/behaviour/incidents/quick` with idempotency_key
3. Server checks idempotency_key -- if already exists, returns existing incident (200 OK, no side effects re-executed)
4. Success toast: "Merit logged. Undo."
5. Undo window: 30 seconds. If tapped: `POST v1/behaviour/incidents/:id/withdraw` with reason "Undone by reporter"
6. Compensating withdrawal cascades: auto-created sanctions -> cancelled, tasks -> cancelled, escalated incidents -> withdrawn, unsent notifications -> cancelled, sent notifications -> correction notification dispatched, points auto-corrected, awards created within undo window -> cancelled

**AI natural language parsing (enhancement, never critical path)**:

1. Deterministic matching runs first (regex/fuzzy against pre-fetched data)
2. High-confidence local match -> show immediately, no API call
3. Ambiguous -> fire AI API (2s timeout) for disambiguation
4. Timeout/error -> fall back to standard quick-log, text pre-filled in description
5. AI prompt includes only: category names, student first+last names, subject names. No IDs or other PII. All data anonymised before sending (see SS3.9).
6. Confidence score per field. Below `ai_confidence_threshold` -> highlighted for manual selection
7. All AI inputs/outputs logged to `audit_logs` if `ai_audit_logging` is true

#### 3.1.2 Standard Quick-Log UX

FAB on every school page (mobile). Bottom sheet:

1. **Category picker**: Favourites row (max 6) then full grid. Positive-first. One tap.
2. **Student picker**: If during class: class roster grid with multi-select for bulk. Then recent students. Then search (type-ahead, server-side).
3. **Description**: Template chips. Tap to use as-is or edit. Teacher per-category favourites in `user_ui_preferences`.
4. **Context**: Auto-populated during class. Otherwise `context_type` picker.
5. **Submit**: Auto-submit if configured. Confirmation: "Merit logged. Undo."

**Bulk positive**: Multi-select 2-15 students, one category, one template. One incident per student. "8 merits logged. Undo."

**Tap-from-register**: On attendance marking page, each student row has quick-log icon. Pre-populates student + class context.

#### 3.1.3 Context-Aware Quick-Log

During active class: FAB -> category -> tap student from roster -> template -> done. **Four taps**.
Outside class: FAB -> category -> search student -> template -> context type -> done. **Six taps, under 10 seconds**.

---

### 3.2 Points & Recognition System

**Points are computed, not stored.** Running total = SUM of `behaviour_incident_participants.points_awarded` for non-withdrawn incidents. Redis cache with 5-minute TTL.

**Awards are permanent** (not revoked on point decrease). Repeatability governed by `repeat_mode`, `tier_group`, and `tier_level` on award types. Auto-award worker checks repeat constraints and uses `triggered_by_incident_id` for idempotency.

**Recognition wall publication**: Incident qualifies -> parent consent (if required) -> admin approval (if required) -> published. Both gates must pass.

---

### 3.3 Policy Rules Engine -- Staged Composition with Replay

#### 3.3.1 Staged Evaluation

See SS2.3 for the 5-stage pipeline. Key behaviour:

A single incident involving a SEND student during transport could trigger:
- **Consequence stage**: "Transport incident -> flag for investigation" (first_match)
- **Approval stage**: "SEND student negative -> require deputy approval" (first_match)
- **Notification stage**: "Transport incident -> notify deputy" AND "Severity >= 3 -> notify year head" (all_matching, both fire)
- **Support stage**: "SEND student with active intervention -> create SENCO review task" (all_matching)
- **Alerting stage**: "Transport context -> flag for transport review" (all_matching)

In five simple rules in different stages.

#### 3.3.2 Versioning

Every rule edit:
1. Increments `current_version`
2. Inserts snapshot into `behaviour_policy_rule_versions`
3. All future evaluations reference the version, not the mutable rule

Historical traceability: the `behaviour_policy_evaluations` table links to the exact rule version, captures all evaluated facts, records which conditions matched and which failed, and logs every action execution with success/failure status. This answers "which exact rule version fired on 12 November and why" without ambiguity.

#### 3.3.3 Historical Replay

Before activating a new or modified rule, admins can replay it against historical data:

`POST v1/behaviour/policies/replay`

Request body:
```json
{
  "rule_id": "uuid",
  "replay_period": { "from": "2025-09-01", "to": "2025-12-20" },
  "dry_run": true
}
```

The engine:
1. Loads all incidents in the replay period
2. Evaluates the candidate rule against each (in its stage, with historical student snapshots from `incident_context_snapshot` and `participant.student_snapshot`)
3. Returns: how many incidents would have matched, what actions would have fired, which students affected, which year groups, estimated sanction/task volume

Response:
```json
{
  "incidents_evaluated": 847,
  "incidents_matched": 23,
  "actions_that_would_fire": {
    "auto_escalate": 8,
    "create_task": 23,
    "notify_roles": 23
  },
  "affected_students": 18,
  "affected_year_groups": ["Year 9", "Year 10"],
  "estimated_detentions_created": 0,
  "estimated_suspensions_created": 0,
  "sample_matches": []
}
```

This answers: "If we turn on this rule, would it create 8 detentions or 80?"

#### 3.3.4 Example Rules

**"3 verbal warnings in 30 days -> written warning"**: Stage: consequence. Conditions: repeat_count_min=3, repeat_window_days=30, repeat_category_ids=[verbal-warning]. Actions: auto_escalate to written warning, notify year_head.

**"Suspension for SEND students requires approval"**: Stage: approval. Conditions: severity_min=7, student_has_send=true. Actions: require_approval, create_task for SENCO.

**"Negative incident during transport -> notify deputy"**: Stage: notification. Conditions: polarity=negative, context_types=[transport]. Actions: notify_roles[deputy_principal], flag_for_review.

#### 3.3.5 Settings UI

`/settings/behaviour-policies` -- with:
- Stage tabs (consequence / approval / notification / support / alerting)
- Per-stage rule list with priority ordering (drag-and-drop)
- Match strategy toggle per rule (first_match / all_matching)
- Stop-processing flag
- Condition builder, action builder
- Replay button: "Test against last term's data"
- Replay results view with sample matches and impact summary
- Import/export JSON for ETB policy sharing
- Test mode (dry-run against hypothetical incident)

---

### 3.4 Sanctions, Exclusions & Consequences

#### 3.4.1 Detentions & Suspensions

**Detentions**: Conflict check against timetable + existing sanctions. Parent acknowledgement tracking. Bulk mark served.

**Suspensions**: Attendance integration (auto-marked `excused_suspended`). Dual metrics: with/without suspensions. Return workflow: conditions checklist, `return_check_in` task 3 school days before end. Parent meeting tracked as `behaviour_task`.

**Document generation**: When a suspension is created and `document_auto_generate_suspension_letter = true`:
1. System generates PDF from `behaviour_document_templates` (type: `suspension_letter`)
2. Merge fields populated from incident + sanction + student context snapshot
3. Document created in `behaviour_documents` with status `draft`
4. Staff reviews, optionally edits, finalises
5. Finalised document can be sent via notification channels or printed

#### 3.4.2 High-Stakes Exclusion Cases

When a sanction involves extended suspension (>5 days), expulsion, managed move, or permanent exclusion, an exclusion case is auto-created from `behaviour_exclusion_cases`. See SS2.1 for full table and lifecycle.

#### 3.4.3 Appeals

Full first-class workflow via `behaviour_appeals`. Submit -> under_review -> hearing_scheduled -> decided. Outcomes: upheld_original, modified, overturned. See SS3.11 for expanded outcome packaging.

---

### 3.5 Safeguarding Chronicle -- Inspection-Grade

#### 3.5.1 Permission Model

| Permission | Who | What |
|------------|-----|------|
| `safeguarding.report` | All staff | Create concern. See own reports' acknowledgement status only |
| `safeguarding.view` | DLP, Deputy DLP, Principal | View all concerns (audit-logged) |
| `safeguarding.manage` | DLP, Principal | Update, record actions, referrals, uploads |
| `safeguarding.seal` | Principal + one other | Seal (dual-control, irreversible) |

Every access audit-logged at service layer. Break-glass access for emergencies with mandatory post-access review.

#### 3.5.2 Reporter Acknowledgement

Concern reported -> immediate "CP-XXXXX received" -> DLP acknowledges -> reporter sees "Assigned" -> investigation -> "Under review". Reporter sees NO case detail.

#### 3.5.3 SLA Tracking

Critical: 4h. High: 24h. Medium: 72h. Low: 7 days. SLA deadlines count wall-clock hours (child safety doesn't pause for weekends). Worker checks every 30 minutes.

#### 3.5.4 Document Chronology & Export

All actions recorded in `safeguarding_actions` with timestamps. Attachments via `behaviour_attachments`.

**Immutable export**: PDF with complete chronology, embedded documents, watermark ("Confidential -- Generated by [user] on [date]"), SHA-256 hash on final page.

**Redacted export**: Names -> reference codes, staff -> role titles, redactable attachments -> "[Document withheld]".

#### 3.5.5 Retention

Default 25 years from student DOB. After retention period: flagged for review, not auto-deleted.

#### 3.5.6 Break-Glass with Post-Access Governance

On grant: principal provides target user, reason, duration (max 72h), optional scope to specific concerns. On expiry: auto-revoked, notification to DLP + principal, after-action review task created listing all records/attachments accessed. Reviewer marks each access as appropriate/inappropriate. Non-completion escalates after 7 school days.

---

### 3.6 Intervention Tracking

**SEND-aware**: When `send_aware = true`, review form includes SEND considerations, AI avoids diagnostic language, outcome analytics track SEND vs non-SEND separately.

**Task integration**: Plan creation -> task for staff. Each review date -> intervention_review task. Overdue -> auto-escalate priority. Completion due -> reminder 7 days before target_end_date.

**Review auto-population**: At review time, auto-populate `behaviour_points_since_last` and `attendance_rate_since_last` from live data for the review period.

---

### 3.7 Student Behaviour Profile & Parent View

#### Profile Header
Student info, cumulative points with sparkline, positive/negative ratio, intervention status, house + award badges, quick-log button.

#### Tabs
**Timeline**: All incidents, sanctions, interventions, awards. Filterable. Group incidents show other participants (links to their profiles).
**Analytics**: Points trend, category donut, time heatmap (exposure-adjusted), subject correlation, teacher correlation, attendance overlay, cohort comparison.
**Interventions**: Active and historical with review histories.
**Sanctions**: Calendar view, appeal history.
**Awards**: Earned awards with tier progression.

#### Parent View -- Hardened

**Parent-safe content rendering priority**:
```
if (parent_description is not null)  -> show parent_description
else if (description_template_used)  -> show template text
else                                 -> show category_name + date only
```
No path ever shows raw `description` to a parent. Attachments invisible. Other participants' names hidden.

**`parent_description` lifecycle rules**:

| Scenario | `parent_description` status | Can send notification? |
|----------|---------------------------|----------------------|
| Quick-log with template | Auto-set to template text | Yes (template is inherently safe) |
| Quick-log with custom text | NULL | Only if severity < send_gate_severity. Otherwise blocked until staff sets parent_description |
| Standard form -- staff writes parent desc | Set by staff | Yes |
| Standard form -- no parent desc, low severity | NULL | Yes (category name only) |
| Standard form -- no parent desc, high severity | NULL | Blocked until set |
| AI-generated parent desc | Proposed, requires staff approval | Yes after approval |

**Locale-aware**: `parent_description` (en) and `parent_description_ar` (ar). If the parent's preferred locale is Arabic and `parent_description_ar` is NULL, the system falls back to `parent_description` (en). If both are NULL, falls back to template/category name.

**Locked after send**: When `parent_description_auto_lock_on_send = true`, after the parent notification dispatches, `parent_description_locked = true`. Editing a locked description triggers the amendment workflow (SS3.12).

#### Guardian Restrictions

`behaviour_guardian_restrictions` (SS2.1). Every restriction has effective dates, legal basis, and review dates. Expired restrictions auto-deactivate. Upcoming review dates create reminder tasks.

The parent portal, notification dispatcher, and digest worker all check active restrictions before rendering or sending. The check is timezone-aware and uses the effective_from/effective_until date range.

**Notification digest**: When enabled, individual notifications batched into daily digest at configured time (tenant timezone).

---

### 3.8 Behaviour Pulse -- Exposure-Adjusted

#### 3.8.1 Five-Dimension Pulse

| Dimension | Calculation |
|-----------|-------------|
| **Positive Ratio** | `positive / total` over rolling 7 days |
| **Severity Index** | Weighted avg severity of negative incidents (normalised, inverted) |
| **Serious Incident Count** | Severity >= 7 in last 7 days, per 100 students |
| **Resolution Rate** | Follow-ups completed / follow-ups required over 30 days |
| **Reporting Confidence** | Staff who logged this week / total teaching staff |

Composite score (weighted 20/25/25/15/15) only displayed when Reporting Confidence >= 50%.

#### 3.8.2 Exposure-Adjusted Analytics

All rates normalised by contact hours from scheduling module. Temporal exposure snapshots are per-academic-period with `effective_from`/`effective_until` dates. Analytics join to the exposure snapshot active at the incident's `occurred_at`, not current data.

| Metric | Normalisation |
|--------|---------------|
| Per subject | Per 100 teaching periods |
| Per teacher | Per 100 teaching periods |
| Per year group | Per 100 students |
| Per period | Per 100 active classes |
| Per context type | Per 100 hours |

---

### 3.9 AI Features -- With Governance & Anonymisation

**Provider**: Claude (Anthropic API) as primary. GPT (OpenAI API) as fallback if Claude is unavailable.

**Mandatory anonymisation pipeline**: All data sent to any AI model is anonymised before transmission:
- Student names replaced with opaque tokens (e.g. "Student-A", "Student-B")
- Staff names replaced with role titles (e.g. "Year Head", "Class Teacher")
- No UUIDs, no real names, no identifiable PII in any AI prompt
- Category names, incident descriptions (with PII stripped), and aggregate patterns only
- Anonymisation is a shared utility in `packages/shared/` -- `anonymiseForAI(data)` -- used by every AI-calling service
- AI responses are de-anonymised before display to the user
- Mapping table (token -> real identity) lives only in memory for the duration of the request, never persisted or logged

**Tenant-level controls**: `ai_insights_enabled`, `ai_narrative_enabled`, `ai_nl_query_enabled` -- each independently toggleable.

**Blocked language**: No diagnoses, no family inference, no clinical terminology. Behavioural patterns only.

**Human confirmation**: Quick-log parse -> one-tap confirm. Narrative -> labelled "AI-generated -- verify". NL query -> "Data as of [timestamp]. Verify critical findings."

**Fallback**: 2s timeout (quick-log), 10s (summaries), 15s (queries) -> graceful degradation. Below confidence threshold -> highlight for manual input.

**Retention**: AI inputs/outputs in `audit_logs` (36 months). No AI content stored as source of truth. Logged inputs contain the anonymised version only.

**Data classification in AI prompts**: Only STAFF-class data. Never `context_notes`, SEND details, or safeguarding flags. NL query enforces scope AND classification -- queries cannot return SENSITIVE fields without permission.

---

### 3.10 Analytics & ETB Benchmarking

#### School-Wide Reports
Behaviour overview, points leaderboard, heatmap analysis, category trends, staff logging activity, positive/negative ratio, sanction summary, intervention outcomes, policy rule effectiveness, task completion, parent engagement.

#### ETB Benchmarking -- Platform-Level Panel

ETB benchmarking operates via a **separate platform-level ETB panel**, not connected to any single tenant. Architecture:

1. **ETB admin panel** is a platform-tier interface (like the existing platform admin). ETB users authenticate with platform-level credentials and are assigned to an ETB entity that owns a set of tenant IDs (its network of schools).
2. **Data pull**: The panel reads from each tenant's `mv_behaviour_benchmarks` materialised view (which contains only PUBLIC-class aggregates: tenant_id, period, canonical_category, student_count, incident_count, rate_per_100). This view is tenant-scoped but the platform-level service has cross-tenant read access to materialised views only.
3. **Aggregation**: The panel aggregates across its network: per-school summaries, network-wide trends, school-to-school comparison (anonymised by default, named if the school opts in).
4. **No student-level data crosses the tenant boundary.** The ETB panel sees only pre-aggregated counts and rates. Individual incidents, students, staff, or attachments are never accessible.
5. **Opt-in per tenant**: `cross_school_benchmarking_enabled` must be true. Minimum cohort size (`benchmark_min_cohort_size`, default 10) enforced -- if a school's year group has fewer students than the threshold, that data point is suppressed.

Canonical taxonomy maps tenant categories to fixed set: praise, merit, minor_positive, major_positive, verbal_warning, written_warning, detention, internal_suspension, external_suspension, expulsion, note, observation, other.

Metrics (per 100 students, per period): ratio, incident rate by canonical category, suspension rate, detention rate, resolution rate, reporting confidence.

---

### 3.11 Appeals -- With Outcome Packaging

Appeal lifecycle: submitted -> under_review -> hearing_scheduled -> decided -> withdrawn.

**Outcome document generation**: When an appeal is decided:
1. System generates `appeal_decision_letter` from template
2. Merge fields: student name, appeal grounds, hearing date, decision, reasoning, amendments, appeal rights
3. Document created in `behaviour_documents`, reviewed by deciding staff
4. On finalisation: sent to appellant via notification
5. If decision modifies the record: amendment notice auto-created (SS3.12)

**Evidence bundle export**: One-click PDF assembly:
- Appeal submission details
- Original incident/sanction record with context snapshot
- All appeal attachments
- Hearing minutes (if hearing held)
- Decision and reasoning
- Resulting amendments

**Outcome communication chain**:
- Appellant notified of decision
- If amendments affect parent-visible data: amendment notice sent to parent
- If parent re-acknowledgement required: re-ack request sent
- All communications logged in `behaviour_parent_acknowledgements` with `amendment_notice_id` reference

---

### 3.12 Amendment Workflow

Handles corrections to records after outbound communication.

**Triggers**:
- Incident edited after parent notification sent
- Category changed after notification
- Parent description corrected after send
- Sanction modified after notification
- Appeal changes underlying record

**Process**:
1. Edit detected (service layer checks if parent notification was sent for this entity)
2. If change affects parent-visible fields:
   a. `behaviour_amendment_notices` record created
   b. Original `parent_description_locked` must be unlocked (requires `behaviour.manage` + reason)
   c. New parent_description written (or AI-generated safe version)
   d. Correction notification queued with template `behaviour_correction_parent`
   e. If severity warrants: re-acknowledgement requested
3. If a PDF document was sent before the amendment:
   a. Original document status -> `superseded`
   b. New document generated with "Amended -- [date]" watermark
   c. Both versions retained for audit

---

### 3.13 Document Generation

Formal document production integrated into behaviour workflows.

**Supported document types**:

| Type | Trigger | Auto-generate? |
|------|---------|---------------|
| `detention_notice` | Detention sanction created | Optional (setting) |
| `suspension_letter` | Suspension created | Default on |
| `return_meeting_letter` | Return meeting scheduled | Manual |
| `behaviour_contract` | Intervention with contract | Manual |
| `intervention_summary` | For parent meeting | Manual |
| `appeal_hearing_invite` | Hearing scheduled | Auto |
| `appeal_decision_letter` | Appeal decided | Auto |
| `exclusion_notice` | Exclusion case initiated | Auto |
| `exclusion_decision_letter` | Exclusion decided | Auto |
| `board_pack` | Exclusion hearing preparation | Manual |

**Generation pipeline**:
1. Template loaded (`behaviour_document_templates`) -- Handlebars engine
2. Merge fields populated from entity + student + school context snapshots
3. HTML rendered with merge fields via Handlebars
4. PDF generated via Puppeteer (existing `PdfRenderingService`; Noto Sans Arabic for RTL)
5. SHA-256 hash computed
6. PDF uploaded to S3 (encrypted, tenant-namespaced)
7. `behaviour_documents` record created with `data_snapshot` (all merge field values frozen)
8. Status: `draft` -> staff reviews -> `finalised` -> optionally `sent`

**Locale**: Templates exist per locale. Document generated in parent's preferred language when parent-facing, staff's locale when internal.

---

## 4. Data Classification Model

Five formal visibility classes enforced across all data surfaces:

| Class | Label | Scope |
|-------|-------|-------|
| `PUBLIC` | Public | Anyone (recognition wall published, house leaderboard published) |
| `PARENT` | Parent-visible | Authenticated parent for own child, respecting guardian restrictions |
| `STAFF` | General staff | Authenticated staff within behaviour scope |
| `SENSITIVE` | Pastoral/management | Staff with `behaviour.view_sensitive` |
| `SAFEGUARDING` | Safeguarding-only | Staff with `safeguarding.view` + audit log |

**Enforcement**:

| Surface | How |
|---------|-----|
| API responses | Service-layer field stripping by user's highest class |
| Search indexing | STAFF-class fields only. Safeguarding entities not indexed. `converted_to_safeguarding` indexed as `closed` |
| Hover card / preview cache | STAFF-class only. No `context_notes` |
| PDF exports | Export declares its class. Student pack = STAFF. Case file = SAFEGUARDING. Parent = PARENT |
| AI prompts | STAFF-class only, anonymised. Never `context_notes`, SEND details, or safeguarding flags |
| Report builder | Available columns filtered by user's class. SAFEGUARDING columns never in report builder |
| Materialised views | Summary = STAFF aggregates. Benchmarks = PUBLIC-equivalent aggregates |
| Notifications / digest | PARENT-class only. Uses `parent_description` or category name |

**Implementation**: `DataClassification` enum and `stripFieldsByClassification(data, userClass)` utility in `packages/shared/`.

---

## 5. Timezone & School Calendar Semantics

**Foundational rule**: All time-sensitive logic uses tenant local time from `tenant_settings.timezone`.

| Operation | Time basis |
|-----------|-----------|
| Quick-log `occurred_at` default | Tenant local time |
| Cron jobs | Evaluated per tenant in their timezone |
| Parent digest send time | Tenant timezone |
| "14 teaching days" (logging gaps) | School days only (excludes `school_closures`) |
| "Returning in 3 days" (suspension) | School days only |
| Review reminder due dates | School days. Holiday -> fires on last school day before |
| Escalation windows (repeat_window_days) | Calendar days (how schools think about repeat behaviour) |
| Safeguarding SLA deadlines | Wall-clock hours (child safety doesn't pause for weekends) |
| DST transitions | Luxon/date-fns-tz. TIMESTAMPTZ in UTC, rendered in tenant TZ |

Shared utilities in `packages/shared/`: `isSchoolDay(tenantId, date)`, `addSchoolDays(tenantId, fromDate, days)`.

---

## 6. Record Lifecycle & Retention Policy

### 6.1 Lifecycle States

| State | Meaning | Access |
|-------|---------|--------|
| `active` | Current, live record | Full access per permissions |
| `archived` | Past academic year, no longer operationally active | Read-only. Not in default list views. Accessible via "Include archived" toggle and search |
| `anonymised` | Retention period expired, PII removed | Aggregate analytics only. Student name -> "Student [hash]". Staff name -> role. Free text -> "[Archived]" |

### 6.2 Retention Rules

| Entity | Default Retention | Basis | Legal Hold Check |
|--------|------------------|-------|-----------------|
| Behaviour incidents | 7 years after student withdrawal/graduation | Irish education records guidance | Yes |
| Sanctions | 7 years | Same | Yes |
| Interventions | 7 years | Same | Yes |
| Appeals | 10 years | Dispute resolution records | Yes |
| Exclusion cases | 25 years from student DOB | Matches safeguarding | Always held |
| Tasks | 3 years from completion | Operational records | No |
| Policy evaluations | 7 years | Decision audit trail | Yes |
| Action executions | 7 years | Decision audit trail | Yes |
| Alerts | 3 years | Operational records | No |
| Parent acknowledgements | 7 years | Communication records | Yes |
| Entity history | Matches parent entity | Audit trail | Yes |
| Amendment notices | Matches parent entity | Communication records | Yes |
| Documents (generated) | Matches parent entity | Record of communication | Yes |
| Safeguarding concerns | 25 years from student DOB | Children First Act 2015 | Always held |
| Safeguarding actions | 25 years from student DOB | Same | Always held |
| Attachments | Matches parent entity | Evidence | Yes |

### 6.3 Lifecycle Operations

**Archival** (annual, after academic year close):
1. Worker identifies records for students who have left the school (withdrawn/graduated) with `left_date` + retention_years < now
2. Records transition to `archived` -- `retention_status = 'archived'`, `archived_at` set
3. Archived records excluded from default list views, search results, and analytics (but included in "All time" historical reports)
4. No data deleted. No PII removed. Full read access maintained for authorised staff.

**Anonymisation** (after full retention period):
1. Worker identifies archived records past retention deadline
2. Check `behaviour_legal_holds` for any active hold on this entity -- if active hold exists, skip and log reason
3. If no legal hold: anonymise PII fields:
   - Student names -> "Student-[first 8 chars of SHA-256(student_id)]"
   - Staff names -> role title
   - Parent names -> "Guardian"
   - Free text descriptions -> "[Archived content]"
   - Context notes -> NULL
   - Attachments -> marked for deletion (actual S3 deletion after 30 days)
4. Record status -> `anonymised`
5. Search index entries removed
6. Entity history preserved (with anonymised names)

**Parent portal visibility**: Ends when the student's status transitions to withdrawn/graduated. Configurable grace period (default: 30 days after status change).

### 6.4 Legal Hold Integration

See `behaviour_legal_holds` table (SS2.1). Key rules:
- Multiple holds per entity, each independently releasable
- Retention worker checks for ANY active hold before anonymisation
- Propagation: setting a hold on an incident cascades to all linked entities
- Setting/releasing holds requires `behaviour.admin`, reason, and is logged in entity history

---

## 7. Data Volume & Scale Strategy

### 7.1 Growth Estimates

Per school (30 teachers, 500 students, active usage):
- ~50 incidents/week -> ~2,000/year
- ~2,000 participants/year
- ~2,000 entity history records/year
- ~10,000 policy evaluations/year (5 stages x 2,000 incidents)
- ~5,000 action executions/year
- ~1,000 tasks/year
- ~500 alerts/year
- ~1,000 parent acknowledgements/year

Per ETB (15 schools, 5 years): ~150,000 incidents, ~750,000 evaluations, ~75,000 entity history records.

### 7.2 Partitioning Strategy

| Table | Partition Strategy | Key |
|-------|-------------------|-----|
| `behaviour_entity_history` | Monthly range on `created_at` | Same pattern as existing `audit_logs` |
| `behaviour_policy_evaluations` | Monthly range on `created_at` | High volume, append-only |
| `behaviour_policy_action_executions` | Monthly range on `created_at` | |
| `behaviour_parent_acknowledgements` | Monthly range on `created_at` | Append-only |
| `behaviour_alerts` | Yearly range on `created_at` | Lower volume |
| `behaviour_alert_recipients` | Yearly range on `created_at` | |

Core operational tables (`behaviour_incidents`, `behaviour_sanctions`, `behaviour_tasks`, etc.) are NOT partitioned -- they need full-table indexes for cross-date queries. Their volume is manageable with proper indexing.

**Implementation**: Partitioning requires raw SQL migrations (Prisma has limited native partition support). A partition management cron creates future partitions monthly/yearly to prevent insert failures.

### 7.3 Archival & Compaction

- Annual archival worker (SS6.3) moves stale records to `archived` status
- Materialised views refresh nightly; contention managed by refreshing `CONCURRENTLY`
- Search index pruned of archived records (reduces Meilisearch memory)
- Redis cache entries for archived students expire naturally (5-min TTL)

### 7.4 Index Maintenance

- `REINDEX CONCURRENTLY` scheduled monthly for high-write tables
- Partial indexes on `status = 'active'` or `retention_status = 'active'` for tables with lifecycle states -- most queries filter on active records
- `pg_stat_user_indexes` monitored for unused indexes (removed in quarterly review)

### 7.5 Export & View Refresh

- Materialised view refresh: `REFRESH MATERIALIZED VIEW CONCURRENTLY` -- no read locks
- Stagger refresh times: `mv_student_behaviour_summary` every 15min, `mv_behaviour_exposure_rates` at 02:00 UTC, `mv_behaviour_benchmarks` at 03:00 UTC
- Large PDF exports (board packs, case files) generated async via BullMQ, not in request cycle
- Export job has 120s timeout, 512MB memory limit

### 7.6 Dead-Letter & Queue Health

- BullMQ dead-letter threshold: 3 retries with exponential backoff
- Dead-letter queue monitored by `behaviour:admin/health` endpoint
- Alert created when dead-letter queue depth > 10
- Stale job reaper: jobs older than 24h in active state are moved to failed

---

## 8. API Endpoints

### 8.1 Core Behaviour (behaviour.controller.ts) -- ~28 endpoints

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/behaviour/incidents` | Create incident | `behaviour.log` |
| POST | `v1/behaviour/incidents/quick` | Quick-log | `behaviour.log` |
| POST | `v1/behaviour/incidents/ai-parse` | AI NL parse -> preview | `behaviour.log` + AI enabled |
| POST | `v1/behaviour/incidents/bulk-positive` | Bulk merit for multiple students | `behaviour.log` |
| GET | `v1/behaviour/incidents` | Paginated list with filters | `behaviour.view` + scope |
| GET | `v1/behaviour/incidents/:id` | Full detail | `behaviour.view` + scope |
| PATCH | `v1/behaviour/incidents/:id` | Update | `behaviour.manage` |
| PATCH | `v1/behaviour/incidents/:id/status` | Status transition | `behaviour.manage` |
| POST | `v1/behaviour/incidents/:id/withdraw` | Withdraw with reason | `behaviour.manage` |
| POST | `v1/behaviour/incidents/:id/follow-up` | Record follow-up | `behaviour.manage` |
| POST | `v1/behaviour/incidents/:id/participants` | Add participant | `behaviour.manage` |
| DELETE | `v1/behaviour/incidents/:id/participants/:pid` | Remove participant | `behaviour.manage` |
| POST | `v1/behaviour/incidents/:id/attachments` | Upload evidence | `behaviour.manage` |
| GET | `v1/behaviour/incidents/:id/attachments` | List attachments | `behaviour.view` + visibility |
| GET | `v1/behaviour/incidents/:id/attachments/:aid` | Download | `behaviour.view` + visibility + audit |
| GET | `v1/behaviour/incidents/:id/history` | Audit trail | `behaviour.manage` |
| GET | `v1/behaviour/incidents/:id/policy-evaluation` | Full policy decision trace | `behaviour.manage` |
| GET | `v1/behaviour/incidents/my` | My logged incidents | `behaviour.log` |
| GET | `v1/behaviour/incidents/feed` | Live feed for pulse | `behaviour.view` |
| GET | `v1/behaviour/quick-log/context` | Pre-fetch cache payload | `behaviour.log` |
| GET | `v1/behaviour/quick-log/templates` | Templates per category | `behaviour.log` |

Plus remaining CRUD/filter endpoints.

### 8.2 Student Behaviour (behaviour-students.controller.ts) -- 13 endpoints

Profile, timeline, analytics, points, sanctions, interventions, awards, AI summary, preview, export, parent-view, quick-context, tasks. All scope-enforced.

### 8.3 Sanctions (behaviour-sanctions.controller.ts) -- 14 endpoints

CRUD, status transitions, today's sanctions, my supervision, parent meeting scheduling, appeal lodging/outcome, calendar view, active/returning suspensions, bulk mark.

### 8.4 Interventions (behaviour-interventions.controller.ts) -- 12 endpoints

CRUD, status transitions, reviews with auto-populated stats, overdue list, my interventions, outcome analytics, complete with outcome, auto-populate data.

### 8.5 Tasks (behaviour-tasks.controller.ts) -- 8 endpoints

List, my tasks, detail, update, complete, cancel, overdue, dashboard stats.

### 8.6 Appeals (behaviour-appeals.controller.ts) -- 10 endpoints

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/behaviour/appeals` | Submit appeal | `behaviour.manage` or parent (own child) |
| GET | `v1/behaviour/appeals` | List with filters | `behaviour.manage` |
| GET | `v1/behaviour/appeals/:id` | Detail | `behaviour.manage` |
| PATCH | `v1/behaviour/appeals/:id` | Update (assign reviewer, schedule hearing) | `behaviour.manage` |
| POST | `v1/behaviour/appeals/:id/decide` | Record decision + auto-apply amendments | `behaviour.manage` |
| POST | `v1/behaviour/appeals/:id/withdraw` | Withdraw | `behaviour.manage` or appellant |
| POST | `v1/behaviour/appeals/:id/attachments` | Upload evidence | `behaviour.manage` |
| GET | `v1/behaviour/appeals/:id/attachments` | List evidence | `behaviour.manage` |
| POST | `v1/behaviour/appeals/:id/generate-decision-letter` | Generate decision letter from template | `behaviour.manage` |
| GET | `v1/behaviour/appeals/:id/evidence-bundle` | Export complete evidence bundle PDF | `behaviour.manage` |

### 8.7 Safeguarding (safeguarding.controller.ts) -- 18 endpoints

Report, my-reports, list, detail, update, status transition, assign, record action, action history, tusla referral, garda referral, upload attachment, download attachment, case file PDF (watermarked), redacted PDF, seal (dual-control), break-glass grant, dashboard.

### 8.8 Recognition & Houses (behaviour-recognition.controller.ts) -- 12 endpoints

Internal wall, leaderboard, house standings, house detail, manual award, award history, publish request, publication status, admin approve/reject, public feed, public houses, bulk house assignment.

### 8.9 Analytics & Pulse (behaviour-analytics.controller.ts) -- 16 endpoints

Pulse (5 dimensions), heatmap (rate-normalised), overview, trends, categories, historical heatmap, subjects, staff activity, sanctions, interventions, ratio, comparisons, policy effectiveness, task completion, AI query, query history.

### 8.10 Configuration (behaviour-config.controller.ts) -- 21 endpoints

Categories CRUD, award types CRUD, house CRUD, policy rules CRUD + versioning + test mode, policy evaluation log. Plus:

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `v1/behaviour/document-templates` | List templates | `behaviour.admin` |
| POST | `v1/behaviour/document-templates` | Create template | `behaviour.admin` |
| PATCH | `v1/behaviour/document-templates/:id` | Update | `behaviour.admin` |
| POST | `v1/behaviour/policies/replay` | Historical replay | `behaviour.admin` |

### 8.11 Parent Behaviour (parent-behaviour.controller.ts) -- 6 endpoints

Summary, incidents, points+awards, sanctions, acknowledge notification, recognition wall.

### 8.12 Admin Operations (behaviour-admin.controller.ts) -- 14 endpoints

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/behaviour/admin/recompute-points` | Recompute for student/year/tenant | `behaviour.admin` |
| POST | `v1/behaviour/admin/rebuild-awards` | Check and create missing threshold awards | `behaviour.admin` |
| POST | `v1/behaviour/admin/recompute-pulse` | Force recalculate pulse | `behaviour.admin` |
| POST | `v1/behaviour/admin/backfill-tasks` | Scan for missing tasks and create | `behaviour.admin` |
| POST | `v1/behaviour/admin/resend-notification` | Re-queue parent notification | `behaviour.admin` |
| POST | `v1/behaviour/admin/refresh-views` | Force refresh materialised views | `behaviour.admin` |
| POST | `v1/behaviour/admin/policy-dry-run` | Evaluate against hypothetical incident | `behaviour.admin` |
| GET | `v1/behaviour/admin/dead-letter` | Failed/stuck BullMQ jobs | `behaviour.admin` |
| POST | `v1/behaviour/admin/dead-letter/:jobId/retry` | Retry dead-letter job | `behaviour.admin` |
| GET | `v1/behaviour/admin/scope-audit` | Show exactly which students a user can see | `behaviour.admin` |
| GET | `v1/behaviour/admin/health` | Queue depths, cache rates, view freshness, scan backlog | `behaviour.admin` |
| POST | `v1/behaviour/admin/reindex-search` | Rebuild Meilisearch index | `behaviour.admin` |
| POST | `v1/behaviour/admin/*/preview` | Every destructive op gains a preview mode | `behaviour.admin` |
| POST | `v1/behaviour/admin/retention/preview` | Preview what would be archived/anonymised | `behaviour.admin` |
| POST | `v1/behaviour/admin/retention/execute` | Execute retention (dual approval if enabled) | `behaviour.admin` |

**Admin op guardrails** (all destructive operations):

```
1. POST .../preview -> returns impact summary:
   { affected_records: 847, affected_students: 234, estimated_duration: "~45s" }
2. Staff reviews impact summary
3. POST .../execute -> executes as async BullMQ job
   - If tenant_settings.admin_destructive_ops_dual_approval = true:
     creates an approval request (existing approvals module)
     job only starts after second admin approves
4. Job progress trackable via GET .../jobs/:jobId
5. Full audit log of what changed
6. Undo/rollback available for: recompute-points (cache invalidation only),
   rebuild-awards (new awards can be individually revoked),
   recompute-pulse (idempotent rerun),
   backfill-tasks (new tasks individually cancellable),
   refresh-views (idempotent), reindex-search (idempotent)
   NOT available for: retention-execute (irreversible), resend-notification (already sent)
```

**Tenant-wide dangerous operations** (recompute-points for entire tenant, retention-execute, reindex-search) always require dual approval regardless of setting.

### 8.13 Exclusion Cases (behaviour-exclusions.controller.ts) -- 10 endpoints

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/behaviour/exclusion-cases` | Create from sanction | `behaviour.manage` |
| GET | `v1/behaviour/exclusion-cases` | List with filters | `behaviour.manage` |
| GET | `v1/behaviour/exclusion-cases/:id` | Detail with timeline | `behaviour.manage` |
| PATCH | `v1/behaviour/exclusion-cases/:id` | Update | `behaviour.manage` |
| PATCH | `v1/behaviour/exclusion-cases/:id/status` | Status transition | `behaviour.manage` |
| POST | `v1/behaviour/exclusion-cases/:id/generate-notice` | Generate formal notice | `behaviour.manage` |
| POST | `v1/behaviour/exclusion-cases/:id/generate-board-pack` | Generate evidence bundle | `behaviour.manage` |
| POST | `v1/behaviour/exclusion-cases/:id/record-decision` | Record decision + letter | `behaviour.manage` |
| GET | `v1/behaviour/exclusion-cases/:id/timeline` | Statutory timeline status | `behaviour.manage` |
| GET | `v1/behaviour/exclusion-cases/:id/documents` | All generated documents | `behaviour.manage` |

### 8.14 Documents (behaviour-documents.controller.ts) -- 6 endpoints

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/behaviour/documents/generate` | Generate from template + entity | `behaviour.manage` |
| GET | `v1/behaviour/documents` | List with filters | `behaviour.view` |
| GET | `v1/behaviour/documents/:id` | Detail | `behaviour.view` |
| PATCH | `v1/behaviour/documents/:id/finalise` | Finalise draft | `behaviour.manage` |
| POST | `v1/behaviour/documents/:id/send` | Send via notification channel | `behaviour.manage` |
| GET | `v1/behaviour/documents/:id/download` | Download PDF (signed URL) | `behaviour.view` |

### 8.15 Guardian Restrictions (behaviour-guardian-restrictions.controller.ts) -- 6 endpoints

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/behaviour/guardian-restrictions` | Create restriction | `behaviour.admin` |
| GET | `v1/behaviour/guardian-restrictions` | List (filterable by student/parent) | `behaviour.admin` |
| GET | `v1/behaviour/guardian-restrictions/:id` | Detail | `behaviour.admin` |
| PATCH | `v1/behaviour/guardian-restrictions/:id` | Update (extend, modify) | `behaviour.admin` |
| POST | `v1/behaviour/guardian-restrictions/:id/revoke` | Revoke with reason | `behaviour.admin` |
| GET | `v1/behaviour/guardian-restrictions/active` | All active restrictions | `behaviour.admin` |

### 8.16 Amendment Notices (behaviour-amendments.controller.ts) -- 4 endpoints

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `v1/behaviour/amendments` | List amendment notices | `behaviour.manage` |
| GET | `v1/behaviour/amendments/:id` | Detail with diff | `behaviour.manage` |
| POST | `v1/behaviour/amendments/:id/send-correction` | Dispatch correction notice | `behaviour.manage` |
| GET | `v1/behaviour/amendments/pending` | Amendments awaiting correction send | `behaviour.manage` |

**Total: ~155 endpoints across 16 controllers.**

---

## 9. Frontend Pages

### Staff Behaviour -- `/behaviour/`

| Route | Description |
|-------|-------------|
| `/behaviour` | Pulse dashboard -- 5-dimension gauge, live feed, heatmap, task summary |
| `/behaviour/incidents` | Incident list with tabs (All/Positive/Negative/Pending/Escalated/My) |
| `/behaviour/incidents/new` | Full incident creation |
| `/behaviour/incidents/[id]` | Detail: participants, sanctions, attachments, escalation chain, policy decision, history |
| `/behaviour/students` | Student overview table (scope-filtered) |
| `/behaviour/students/[studentId]` | Profile (tabs: Timeline, Analytics, Interventions, Sanctions, Awards, Tasks) |
| `/behaviour/sanctions` | Sanctions list with calendar toggle |
| `/behaviour/sanctions/today` | Today's detentions -- bulk mark |
| `/behaviour/interventions` | Plans list (Active/Overdue/Completed) |
| `/behaviour/interventions/new` | Create with goal builder + SEND |
| `/behaviour/interventions/[id]` | Detail with reviews, auto-populated form, tasks |
| `/behaviour/appeals` | Appeals list with status tabs |
| `/behaviour/appeals/[id]` | Appeal detail with timeline, hearing notes, decision form |
| `/behaviour/exclusions` | Exclusion cases list with statutory timeline status |
| `/behaviour/exclusions/[id]` | Case detail: timeline checklist, documents, hearing, decision |
| `/behaviour/recognition` | Recognition wall + leaderboard + houses + publication management |
| `/behaviour/tasks` | Task inbox -- my pending tasks |
| `/behaviour/analytics` | Full analytics dashboard (exposure-adjusted) |
| `/behaviour/analytics/ai` | NL behaviour queries |
| `/behaviour/alerts` | Pattern alerts with per-user acknowledge/resolve/dismiss |
| `/behaviour/documents` | Document list -- generated notices, letters, packs |
| `/behaviour/amendments` | Amendment notices pending correction |

### Safeguarding -- `/safeguarding/`

| Route | Description |
|-------|-------------|
| `/safeguarding` | Dashboard: open concerns, severity, SLA compliance, tasks |
| `/safeguarding/concerns` | Concern list |
| `/safeguarding/concerns/new` | Report concern (all staff) |
| `/safeguarding/concerns/[id]` | Case file: detail, chronological actions, attachments, referrals, export |
| `/safeguarding/my-reports` | Reporter acknowledgement view |

### Parent -- `/parent/behaviour/`

| Route | Description |
|-------|-------------|
| `/parent/behaviour` | Per-child summary (guardian-filtered, parent_description rendering) |
| `/parent/behaviour/recognition` | School recognition wall |

### Settings

| Route | Description |
|-------|-------------|
| `/settings/behaviour-categories` | Category CRUD with benchmark mapping |
| `/settings/behaviour-awards` | Award types with repeatability semantics |
| `/settings/behaviour-houses` | House teams + bulk assignment |
| `/settings/behaviour-policies` | Policy rule builder with stage tabs, versioning, replay, test mode, import/export |
| `/settings/behaviour-general` | Module settings (points, notifications, pulse, AI, recognition) |
| `/settings/behaviour-documents` | Document template editor with merge field reference |
| `/settings/safeguarding` | DLP assignment, fallback chain, SLA config, retention |
| `/settings/behaviour-admin` | Operational dashboard: health, dead-letter, recompute, scope audit |

**Total: ~32 pages + 8 settings pages.**

---

## 10. Worker Jobs

| Job | Queue | Trigger | Description |
|-----|-------|---------|-------------|
| `behaviour:evaluate-policy` | `behaviour` | On incident creation / participant added | Run 5-stage policy engine with versioned evaluation ledger |
| `behaviour:check-awards` | `behaviour` | On incident creation | Check thresholds with repeat/dedup guards |
| `behaviour:detect-patterns` | `behaviour` | Cron daily 05:00 tenant TZ | Exposure-adjusted pattern detection |
| `behaviour:task-reminders` | `behaviour` | Cron daily 08:00 tenant TZ | Due today + overdue notifications |
| `behaviour:suspension-return` | `behaviour` | Cron daily 07:00 tenant TZ | Return check-in tasks (3 school days) |
| `behaviour:parent-notification` | `notifications` | On incident creation per config | Multi-channel with acknowledgement + dedup + send-gate |
| `behaviour:digest-notifications` | `notifications` | Cron at tenant-configured time | Batched parent digest |
| `behaviour:attachment-scan` | `behaviour` | On attachment upload | ClamAV stream scan, update scan_status |
| `behaviour:break-glass-expiry` | `behaviour` | Cron every 5 min | Revoke expired grants, create review tasks |
| `safeguarding:sla-check` | `behaviour` | Cron every 30 min | SLA breach detection + escalation |
| `safeguarding:critical-escalation` | `behaviour` | On critical concern creation | Immediate DLP notification + 30-min fallback chain |
| `behaviour:retention-check` | `behaviour` | Cron monthly 01:00 UTC | Identify records for archival/anonymisation, check legal holds, create review task |
| `behaviour:guardian-restriction-check` | `behaviour` | Cron daily 06:00 tenant TZ | Expire ended restrictions, create review reminders |

**Total: 13 worker jobs.**

---

## 11. Permissions & Scope

### 11.1 Permission Matrix

| Permission | Description | Default Roles |
|------------|-------------|---------------|
| `behaviour.log` | Create incidents, access quick-log | All staff |
| `behaviour.view` | View within scope | All staff (scope-limited) |
| `behaviour.manage` | Update, manage sanctions/interventions/tasks/appeals/exclusions/documents/amendments | Year heads, deputies, principal |
| `behaviour.admin` | Configure categories, policies, awards, settings, admin ops, guardian restrictions, legal holds | School admin, principal |
| `behaviour.view_sensitive` | View context_notes, meeting notes, SEND notes | Pastoral team, management |
| `behaviour.view_staff_analytics` | View staff logging activity | Deputy, principal |
| `behaviour.ai_query` | AI narrative and NL query | Staff with view + AI enabled |
| `behaviour.appeal` | Submit appeal as parent | Parent (own child) |
| `safeguarding.report` | Create concerns, view own report status | All staff |
| `safeguarding.view` | View concerns (audit-logged) | DLP, deputy DLP, principal |
| `safeguarding.manage` | Update, actions, referrals, uploads | DLP, principal |
| `safeguarding.seal` | Initiate/approve seal (dual-control) | Principal + designated |

### 11.2 Scope-Based Access

| Scope | Sees | Typical Roles |
|-------|------|---------------|
| `own` | Only incidents they logged | Teacher (default) |
| `class` | Students in classes they teach | Class/subject teacher |
| `year_group` | Students in assigned year groups | Year head, tutor |
| `pastoral` | All students + sensitive fields | Pastoral lead, SENCO |
| `all` | Everything except safeguarding | Deputy, principal |

Stored on `tenant_memberships`. Enforced server-side in service layer across all surfaces including previews, search, exports.

**Total: 12 permissions.**

---

## 12. Integration Points

| Module | Integration | Direction |
|--------|-------------|-----------|
| **Attendance** | Suspension auto-marking, attendance rates in profiles/reviews/pulse | Bidirectional |
| **Scheduling** | Context-aware quick-log, exposure data for rate normalisation | Behaviour reads |
| **Gradebook** | Grade data in student analytics, risk detection cross-reference | Bidirectional |
| **Communications** | Parent notifications via multi-channel infra, delivery webhooks, amendment correction notices, document send | Behaviour writes |
| **Search** | Incidents indexed (STAFF-class only, scope-filtered, status-projected) | Behaviour writes |
| **Approvals** | Policy-driven approval gating for suspensions/expulsions, admin dual-approval for destructive ops | Bidirectional |
| **Dashboard** | Admin: pulse + counts + tasks. Teacher: their incidents + tasks. Parent: child summary | Provides data |
| **Reports** | Cross-module insights, behaviour-specific reports | Reports reads |
| **Students** | SEND flag for policy engine, year_group for scope | Behaviour reads |

**Future**: Predictive Early Warning (primary risk signal), Smart Parent Digest (positive incidents in digest), Leave -> Substitution (hotspot data for substitute briefing).

---

## 13. Notification Templates

| Template | Trigger | Channels |
|----------|---------|----------|
| `behaviour_positive_parent` | Positive incident (if configured) | Per parent preference |
| `behaviour_negative_parent` | Negative >= severity threshold | Per parent preference |
| `behaviour_sanction_parent` | Sanction created | Preference + email |
| `behaviour_award_parent` | Award earned | Per parent preference |
| `behaviour_acknowledgement_request` | Severity >= ack threshold | In-app + email |
| `behaviour_task_reminder` | Task due today | In-app |
| `behaviour_task_overdue` | Task overdue | In-app + email |
| `behaviour_appeal_outcome` | Appeal decided | In-app + email |
| `behaviour_correction_parent` | Amendment to parent-visible data after notification sent | Per parent preference |
| `behaviour_reacknowledgement_request` | Amendment requires re-ack | In-app + email |
| `behaviour_exclusion_notice_parent` | Exclusion case formal notice | Email (always) + in-app |
| `behaviour_exclusion_decision_parent` | Exclusion decision | Email (always) + in-app |
| `behaviour_guardian_restriction_review` | Restriction approaching review date | In-app to admin |
| `safeguarding_concern_reported` | New concern | Push to DLP |
| `safeguarding_critical_escalation` | Critical, DLP no response 30min | Push to next in chain |
| `safeguarding_reporter_ack` | DLP acknowledges | In-app to reporter |
| `safeguarding_sla_breach` | SLA passed | Push + email to DLP + deputy |
| `safeguarding_break_glass_review` | Break-glass window expired | In-app + email to DLP + principal |

**Total: 18 notification templates.**

---

## 14. Materialised Views

| View | Refresh | Purpose |
|------|---------|---------|
| `mv_student_behaviour_summary` | Every 15 min | STAFF-class aggregates: student_id, year, positive/negative counts, points, ratio, last_incident_at |
| `mv_behaviour_benchmarks` | Nightly | PUBLIC-class aggregates: tenant_id, period, canonical_category, student_count, incident_count, rate_per_100. Read by ETB platform panel. |
| `mv_behaviour_exposure_rates` | Nightly | Per-subject/teacher/period teaching hours from scheduling. Per-academic-period snapshots with effective dates |

---

## 15. Testing & Release Gate Requirements

Mandatory test suites that must pass before any behaviour module release.

### 15.1 Data Classification Contract Tests

For every API endpoint that returns behaviour data:

```typescript
describe('Data Classification', () => {
  it('STAFF-scope user never receives SENSITIVE fields', () => {
    // Call endpoint as teacher with behaviour.view (no view_sensitive)
    // Assert: context_notes is absent, meeting_notes is absent, send_notes is absent
  });

  it('PARENT-scope user never receives STAFF fields', () => {
    // Call endpoint as parent
    // Assert: description (internal) is absent, only parent_description/category shown
  });

  it('Non-safeguarding user never sees converted_to_safeguarding status', () => {
    // Call endpoint as teacher without safeguarding.view
    // Assert: status shown as 'closed', not 'converted_to_safeguarding'
  });
});
```

**Required coverage**: Every endpoint, every export type, every preview payload.

### 15.2 Scope Enforcement Tests

```typescript
describe('Scope Enforcement', () => {
  it('class-scope teacher only sees students in their classes', () => {});
  it('year_group-scope year head only sees their year groups', () => {});
  it('own-scope teacher only sees incidents they logged', () => {});
  it('scope applies to search results', () => {});
  it('scope applies to hover card previews', () => {});
  it('scope applies to PDF exports', () => {});
  it('scope applies to AI query results', () => {});
});
```

### 15.3 Status Projection Tests

```typescript
describe('Status Projection', () => {
  it('converted_to_safeguarding projected as closed for behaviour users', () => {});
  it('projected status in search index', () => {});
  it('projected status in entity history for non-safeguarding users', () => {});
  it('projected status in parent notifications', () => {});
});
```

### 15.4 Parent-Safe Rendering Tests

```typescript
describe('Parent-Safe Rendering', () => {
  it('parent portal never shows raw description field', () => {});
  it('parent portal uses parent_description when available', () => {});
  it('parent portal falls back to template text, then category name', () => {});
  it('parent portal never shows attachments or their existence', () => {});
  it('parent portal never shows other participants names', () => {});
  it('parent notification respects send-gate severity', () => {});
  it('guardian restriction blocks portal and notifications', () => {});
  it('guardian restriction respects effective dates', () => {});
});
```

### 15.5 Safeguarding Isolation Tests

```typescript
describe('Safeguarding Isolation', () => {
  it('safeguarding_concern_incidents join invisible from behaviour side', () => {});
  it('safeguarding entities not in search index', () => {});
  it('safeguarding fields never in AI prompts', () => {});
  it('safeguarding data never in materialised views', () => {});
  it('break-glass grants expire correctly', () => {});
  it('every safeguarding read creates audit log entry', () => {});
});
```

### 15.6 Idempotency & Dedup Tests

```typescript
describe('Idempotency', () => {
  it('duplicate idempotency_key returns existing incident', () => {});
  it('policy evaluation not re-executed on retry', () => {});
  it('award not re-created on worker retry', () => {});
  it('parent notification not re-sent on retry', () => {});
  it('compensating withdrawal cascades correctly', () => {});
});
```

### 15.7 RLS Verification

Standard EduPod RLS test suite applied to all 32 behaviour/safeguarding tables: tenant isolation verified with cross-tenant query attempts.

---

## 16. Seed Data per Tenant

| Entity | Count |
|--------|-------|
| Categories | 12 (4 positive, 6 negative, 2 neutral) with benchmark mappings |
| Award types | 4 (Bronze 50pt, Silver 100pt, Gold 200pt, Principal's Award 500pt) |
| Description templates | ~60 (2-3 per category per locale, en + ar) |
| Policy rules | 5 (consequence: 1 escalation, approval: 2 suspension+expulsion, notification: 1 parent, alerting: 1 flag) |
| Document templates | ~20 (10 types x 2 locales, system templates) |
| Notification templates | 18 |

---

## 17. Scope Summary

| Dimension | Count |
|-----------|-------|
| Database tables | 32 (25 core + 6 new in v4/v5 + 1 legal holds) |
| Materialised views | 3 |
| API endpoints | ~155 |
| Frontend pages | ~32 + 8 settings |
| Worker jobs | 13 |
| Permissions | 12 |
| Sequences | 6 (BH-, SN-, IV-, CP-, AP-, EX-) |
| Notification templates | 18 |
| Seed data per tenant | 12 categories + 4 awards + ~60 templates + 5 rules + ~20 document templates |
| Mandatory test suites | 7 release-gate suites |

---

## 18. Implementation Phases

| Phase | Scope |
|-------|-------|
| **A: Core + Temporal** | Prisma schema (all 32 tables), migrations, RLS policies, seed data. Incidents CRUD, participants with constraint, quick-log (online, idempotent), categories, description templates, permissions with scope, state machines with status projection, data classification framework, unified entity_history, parent_description workflow with send-gate and lock |
| **B: Policy Engine** | Staged rules with 5-stage pipeline, versioning, evaluation ledger per stage, action execution with dedup, historical replay, settings UI with stage tabs + replay |
| **C: Sanctions + Exclusions + Appeals** | Sanctions full lifecycle, exclusion cases with statutory timeline + board pack, appeals with outcome packaging + document generation, amendment workflow |
| **D: Safeguarding** | Concerns, actions, SLA, DLP workflow, attachments (ClamAV + signed URLs + object lock), seal, reporter ack, break-glass with post-access governance, exports |
| **E: Recognition + Interventions** | Points (computed), awards with repeatability, houses, publication consent, interventions with SEND, reviews, guardian restrictions with effective dates |
| **F: Analytics + AI** | Pulse (5 dimensions, exposure-adjusted), all analytics, AI with anonymisation pipeline + Claude/GPT, pattern detection with alert ownership, ETB benchmarking materialised view |
| **G: Documents + Comms** | Document templates (Handlebars) + generation engine, parent portal with safe rendering, guardian visibility, notification digest, amendment correction chain |
| **H: Hardening + Ops + Scale** | Admin ops with guardrails + dual approval, retention lifecycle worker + legal holds, partition setup + management cron, integration testing, release-gate test suites (SS15), scope audit, RLS verification, classification audit, scale testing |

---

## 19. What This Delivers

Six capabilities that close the remaining gaps competitors cannot match:

1. **Staged policy composition.** Five stages fire independently: consequence, approval, notification, support, alerting. Historical replay lets schools test new policies against real data before activating them.

2. **Structured history for everything.** Not just incidents -- sanctions, appeals, tasks, exclusion cases, guardian restrictions, publication approvals, break-glass grants all get full append-only lifecycle history.

3. **Complete record lifecycle.** Every entity has explicit retention rules, archival workflow, and anonymisation path. Legal hold propagation via dedicated tracking table prevents premature purging. Parent portal access ends on student departure with configurable grace period.

4. **Amendment workflow.** When a record changes after a parent was notified, the system creates an amendment notice, generates a correction communication, optionally requires re-acknowledgement, and marks superseded documents. The school's communication history is always honest.

5. **Bespoke exclusion workflow.** Expulsion is a full case with statutory timeline tracking, formal notice generation, board pack assembly, hearing management, decision letters, and appeal integration. Every step is documented, timed, and defensible.

6. **Operational maturity.** ClamAV for attachment security. Partitioning for high-growth tables. Admin ops with preview/dual-approval guardrails. Mandatory release-gate test suites. Dead-letter monitoring. AI anonymisation pipeline. The system sustains itself across years of production use.

The competitor comparison has 45+ capability rows. Compass Chronicle checks roughly 6. VSware checks 2. EduPod checks all of them.
