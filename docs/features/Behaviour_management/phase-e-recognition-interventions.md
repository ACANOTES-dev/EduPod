# Phase E: Recognition + Interventions — Implementation Spec

> **Phase**: E of H
> **Prerequisite phases**: Phase A (schema, incidents, participants, points data)
> **Spec source**: behaviour-management-spec-v5-master.md
> **This document is self-contained. No need to open the master spec during implementation.**

---

## Prerequisites

Phase A must be complete and merged before starting Phase E. The following must exist:

- All 32 behaviour/safeguarding tables in Prisma schema with RLS policies
- `behaviour_incidents` and `behaviour_incident_participants` (with `points_awarded` column)
- `behaviour_categories` with `polarity` and `point_value`
- `behaviour_tasks` with `task_type` enum including `'guardian_restriction_review'`
- `behaviour_entity_history` with `entity_type` enum including `'publication_approval'` and `'guardian_restriction'`
- Permissions: `behaviour.log`, `behaviour.view`, `behaviour.manage`, `behaviour.admin`
- Scope enforcement in service layer
- `SequenceService` available for sequence numbers
- Redis cache client available in API app
- BullMQ producer available in API app

---

## Objectives

1. Implement the points system as a computed-not-stored aggregate with Redis caching
2. Implement configurable award types with full repeatability semantics
3. Implement house teams and house point competitions
4. Implement the recognition wall with consent + approval publication gates
5. Implement intervention plans with SEND awareness, goal/strategy tracking, and task integration
6. Implement intervention review cycles with auto-populated behaviour and attendance stats
7. Implement guardian visibility restrictions with effective dates, legal basis, review reminders, and auto-expiry

---

## Tables

All tables listed here are already in the Prisma schema from Phase A. This phase implements the business logic, services, controllers, and frontend pages that operate on them. Full definitions are reproduced here for implementer reference.

### `behaviour_recognition_awards`

Milestone awards. Append-only except for the `superseded_by_id` field.

| Column                     | Type                               | Notes                                                                                      |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `id`                       | UUID PK                            | `gen_random_uuid()`                                                                        |
| `tenant_id`                | UUID FK NOT NULL                   | RLS                                                                                        |
| `student_id`               | UUID FK NOT NULL                   | -> `students`                                                                              |
| `award_type_id`            | UUID FK NOT NULL                   | -> `behaviour_award_types`                                                                 |
| `points_at_award`          | INT NOT NULL                       | Snapshot of cumulative points at the moment of award                                       |
| `awarded_by_id`            | UUID FK NOT NULL                   | -> `users`                                                                                 |
| `awarded_at`               | TIMESTAMPTZ NOT NULL               |                                                                                            |
| `academic_year_id`         | UUID FK NOT NULL                   |                                                                                            |
| `triggered_by_incident_id` | UUID FK NULL                       | For auto-awards: which incident pushed past threshold. Used as dedup guard on worker retry |
| `superseded_by_id`         | UUID FK NULL                       | -> `behaviour_recognition_awards` — higher-tier award in the same tier_group               |
| `notes`                    | TEXT NULL                          |                                                                                            |
| `parent_notified_at`       | TIMESTAMPTZ NULL                   |                                                                                            |
| `created_at`               | TIMESTAMPTZ NOT NULL DEFAULT now() |                                                                                            |

**RLS policy**: `tenant_id = current_setting('app.current_tenant_id')::uuid`

---

### `behaviour_award_types`

Configurable per tenant with repeatability semantics. Controls when awards can be granted and how tiers interact.

| Column                   | Type                                                                                                | Notes                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`                     | UUID PK                                                                                             | `gen_random_uuid()`                                                                                      |
| `tenant_id`              | UUID FK NOT NULL                                                                                    | RLS                                                                                                      |
| `name`                   | VARCHAR(100) NOT NULL                                                                               |                                                                                                          |
| `name_ar`                | VARCHAR(100) NULL                                                                                   | Arabic translation                                                                                       |
| `description`            | TEXT NULL                                                                                           |                                                                                                          |
| `points_threshold`       | INT NULL                                                                                            | Auto-trigger at this cumulative total. NULL = manual-only award                                          |
| `repeat_mode`            | ENUM('once_ever', 'once_per_year', 'once_per_period', 'unlimited') NOT NULL DEFAULT 'once_per_year' |                                                                                                          |
| `repeat_max_per_year`    | INT NULL                                                                                            | Max grants per student per academic year. NULL = no cap within repeat_mode                               |
| `tier_group`             | VARCHAR(50) NULL                                                                                    | Groups related awards (e.g. `'achievement_tier'`). Awards in the same group are treated as a progression |
| `tier_level`             | INT NULL                                                                                            | Higher integer = higher tier. Bronze=1, Silver=2, Gold=3                                                 |
| `supersedes_lower_tiers` | BOOLEAN NOT NULL DEFAULT false                                                                      | If true, earning this award marks all lower-tier awards in the same tier_group as superseded             |
| `icon`                   | VARCHAR(50) NULL                                                                                    | Lucide icon name                                                                                         |
| `color`                  | VARCHAR(7) NULL                                                                                     | Hex colour                                                                                               |
| `display_order`          | INT NOT NULL DEFAULT 0                                                                              |                                                                                                          |
| `is_active`              | BOOLEAN NOT NULL DEFAULT true                                                                       |                                                                                                          |
| `created_at`             | TIMESTAMPTZ NOT NULL DEFAULT now()                                                                  |                                                                                                          |
| `updated_at`             | TIMESTAMPTZ NOT NULL DEFAULT now()                                                                  |                                                                                                          |

**UNIQUE**: `(tenant_id, name)`.

**RLS policy**: `tenant_id = current_setting('app.current_tenant_id')::uuid`

**Seed data** (provisioned on tenant creation):

| Name              | points_threshold | repeat_mode   | tier_group       | tier_level | supersedes_lower_tiers |
| ----------------- | ---------------- | ------------- | ---------------- | ---------- | ---------------------- |
| Bronze Award      | 50               | once_per_year | achievement_tier | 1          | false                  |
| Silver Award      | 100              | once_per_year | achievement_tier | 2          | true                   |
| Gold Award        | 200              | once_per_year | achievement_tier | 3          | true                   |
| Principal's Award | 500              | once_per_year | NULL             | NULL       | false                  |

---

### `behaviour_house_teams`

Optional house/team system for collective point competitions.

| Column          | Type                               | Notes                                   |
| --------------- | ---------------------------------- | --------------------------------------- |
| `id`            | UUID PK                            | `gen_random_uuid()`                     |
| `tenant_id`     | UUID FK NOT NULL                   | RLS                                     |
| `name`          | VARCHAR(100) NOT NULL              |                                         |
| `name_ar`       | VARCHAR(100) NULL                  | Arabic translation                      |
| `color`         | VARCHAR(7) NOT NULL                | Hex colour, used in leaderboard display |
| `icon`          | VARCHAR(50) NULL                   | Lucide icon name                        |
| `display_order` | INT NOT NULL DEFAULT 0             |                                         |
| `is_active`     | BOOLEAN NOT NULL DEFAULT true      |                                         |
| `created_at`    | TIMESTAMPTZ NOT NULL DEFAULT now() |                                         |
| `updated_at`    | TIMESTAMPTZ NOT NULL DEFAULT now() |                                         |

**UNIQUE**: `(tenant_id, name)`.

**RLS policy**: `tenant_id = current_setting('app.current_tenant_id')::uuid`

---

### `behaviour_house_memberships`

Assigns students to houses per academic year. A student can only be in one house per year.

| Column             | Type                               | Notes                      |
| ------------------ | ---------------------------------- | -------------------------- |
| `id`               | UUID PK                            | `gen_random_uuid()`        |
| `tenant_id`        | UUID FK NOT NULL                   | RLS                        |
| `student_id`       | UUID FK NOT NULL                   | -> `students`              |
| `house_id`         | UUID FK NOT NULL                   | -> `behaviour_house_teams` |
| `academic_year_id` | UUID FK NOT NULL                   |                            |
| `created_at`       | TIMESTAMPTZ NOT NULL DEFAULT now() |                            |

**UNIQUE**: `(tenant_id, student_id, academic_year_id)` — one house per student per year.

**Index**: `(tenant_id, house_id, academic_year_id)` — house roster and leaderboard queries.

**RLS policy**: `tenant_id = current_setting('app.current_tenant_id')::uuid`

---

### `behaviour_interventions`

Structured intervention plans linked to behaviour patterns.

| Column                  | Type                                                                                                                                                     | Notes                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `id`                    | UUID PK                                                                                                                                                  | `gen_random_uuid()`                                                                            |
| `tenant_id`             | UUID FK NOT NULL                                                                                                                                         | RLS                                                                                            |
| `intervention_number`   | VARCHAR(20) NOT NULL                                                                                                                                     | Sequence: `IV-000001` via `SequenceService`                                                    |
| `student_id`            | UUID FK NOT NULL                                                                                                                                         | -> `students`                                                                                  |
| `title`                 | VARCHAR(200) NOT NULL                                                                                                                                    |                                                                                                |
| `type`                  | ENUM('behaviour_plan', 'mentoring', 'counselling_referral', 'restorative', 'academic_support', 'parent_engagement', 'external_agency', 'other') NOT NULL |                                                                                                |
| `status`                | ENUM('planned', 'active', 'monitoring', 'completed', 'abandoned') NOT NULL DEFAULT 'planned'                                                             |                                                                                                |
| `trigger_description`   | TEXT NOT NULL                                                                                                                                            | What behaviour pattern triggered this intervention                                             |
| `goals`                 | JSONB NOT NULL DEFAULT '[]'                                                                                                                              | Zod-validated array of `{ goal: string, measurable_target: string, deadline: string \| null }` |
| `strategies`            | JSONB NOT NULL DEFAULT '[]'                                                                                                                              | Zod-validated array of `{ strategy: string, responsible_staff_id: string, frequency: string }` |
| `assigned_to_id`        | UUID FK NOT NULL                                                                                                                                         | -> `users`                                                                                     |
| `start_date`            | DATE NOT NULL                                                                                                                                            |                                                                                                |
| `target_end_date`       | DATE NULL                                                                                                                                                |                                                                                                |
| `actual_end_date`       | DATE NULL                                                                                                                                                |                                                                                                |
| `review_frequency_days` | INT NOT NULL DEFAULT 14                                                                                                                                  | How often to schedule reviews                                                                  |
| `next_review_date`      | DATE NULL                                                                                                                                                | Auto-calculated from start_date + review_frequency_days                                        |
| `outcome`               | ENUM('improved', 'no_change', 'deteriorated', 'inconclusive') NULL                                                                                       | Set on completion or abandonment                                                               |
| `outcome_notes`         | TEXT NULL                                                                                                                                                |                                                                                                |
| `send_aware`            | BOOLEAN NOT NULL DEFAULT false                                                                                                                           | Student has SEND or learning support needs                                                     |
| `send_notes`            | TEXT NULL                                                                                                                                                | Visibility class: SENSITIVE. Only users with `behaviour.view_sensitive` see this               |
| `retention_status`      | ENUM('active', 'archived', 'anonymised') NOT NULL DEFAULT 'active'                                                                                       |                                                                                                |
| `created_at`            | TIMESTAMPTZ NOT NULL DEFAULT now()                                                                                                                       |                                                                                                |
| `updated_at`            | TIMESTAMPTZ NOT NULL DEFAULT now()                                                                                                                       |                                                                                                |

**Indexes**:

- `(tenant_id, student_id, status)` — student profile tab
- `(tenant_id, assigned_to_id, status)` — "my interventions" list
- `(tenant_id, status, next_review_date)` — overdue review detection
- `(tenant_id, retention_status) WHERE retention_status = 'active'` — active queries

**RLS policy**: `tenant_id = current_setting('app.current_tenant_id')::uuid`

**Goals JSONB Zod schema**:

```typescript
const InterventionGoalSchema = z.object({
  goal: z.string().min(1),
  measurable_target: z.string().min(1),
  deadline: z.string().nullable(), // ISO date string
});
const InterventionGoalsSchema = z.array(InterventionGoalSchema);
```

**Strategies JSONB Zod schema**:

```typescript
const InterventionStrategySchema = z.object({
  strategy: z.string().min(1),
  responsible_staff_id: z.string().uuid(),
  frequency: z.string().min(1), // e.g. "Weekly check-in", "Every Monday"
});
const InterventionStrategiesSchema = z.array(InterventionStrategySchema);
```

---

### `behaviour_intervention_incidents`

Join table linking incidents that triggered or are associated with an intervention.

| Column            | Type                               | Notes                        |
| ----------------- | ---------------------------------- | ---------------------------- |
| `id`              | UUID PK                            | `gen_random_uuid()`          |
| `tenant_id`       | UUID FK NOT NULL                   | RLS                          |
| `intervention_id` | UUID FK NOT NULL                   | -> `behaviour_interventions` |
| `incident_id`     | UUID FK NOT NULL                   | -> `behaviour_incidents`     |
| `created_at`      | TIMESTAMPTZ NOT NULL DEFAULT now() |                              |

**UNIQUE**: `(intervention_id, incident_id)` — prevents duplicate links.

**RLS policy**: `tenant_id = current_setting('app.current_tenant_id')::uuid`

---

### `behaviour_intervention_reviews`

Periodic check-ins against intervention goals. Append-only — never edited after creation.

| Column                        | Type                                                                    | Notes                                                        |
| ----------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| `id`                          | UUID PK                                                                 | `gen_random_uuid()`                                          |
| `tenant_id`                   | UUID FK NOT NULL                                                        | RLS                                                          |
| `intervention_id`             | UUID FK NOT NULL                                                        | -> `behaviour_interventions`                                 |
| `reviewed_by_id`              | UUID FK NOT NULL                                                        | -> `users`                                                   |
| `review_date`                 | DATE NOT NULL                                                           |                                                              |
| `progress`                    | ENUM('on_track', 'some_progress', 'no_progress', 'regression') NOT NULL |                                                              |
| `goal_updates`                | JSONB NOT NULL DEFAULT '[]'                                             | Per-goal status updates. See schema below                    |
| `notes`                       | TEXT NOT NULL                                                           |                                                              |
| `next_review_date`            | DATE NULL                                                               | When set, updates `behaviour_interventions.next_review_date` |
| `behaviour_points_since_last` | INT NULL                                                                | Auto-populated from live data at review creation             |
| `attendance_rate_since_last`  | DECIMAL(5,2) NULL                                                       | Auto-populated from attendance module                        |
| `created_at`                  | TIMESTAMPTZ NOT NULL DEFAULT now()                                      | Append-only                                                  |

**`goal_updates` JSONB Zod schema**:

```typescript
const GoalUpdateSchema = z.object({
  goal: z.string(),
  status: z.enum(['met', 'progressing', 'not_met', 'not_assessed']),
  notes: z.string().nullable(),
});
const GoalUpdatesSchema = z.array(GoalUpdateSchema);
```

**Index**: `(tenant_id, intervention_id, created_at DESC)` — review history.

**RLS policy**: `tenant_id = current_setting('app.current_tenant_id')::uuid`

---

### `behaviour_publication_approvals`

Consent and approval gate for publicly displaying recognition content.

| Column                    | Type                                                                                                     | Notes                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `id`                      | UUID PK                                                                                                  | `gen_random_uuid()`                                                 |
| `tenant_id`               | UUID FK NOT NULL                                                                                         | RLS                                                                 |
| `publication_type`        | ENUM('recognition_wall_website', 'house_leaderboard_website', 'individual_achievement_website') NOT NULL |                                                                     |
| `entity_type`             | ENUM('incident', 'award') NOT NULL                                                                       |                                                                     |
| `entity_id`               | UUID NOT NULL                                                                                            | FK to `behaviour_incidents` or `behaviour_recognition_awards`       |
| `student_id`              | UUID FK NOT NULL                                                                                         | -> `students`                                                       |
| `requires_parent_consent` | BOOLEAN NOT NULL DEFAULT true                                                                            | Driven by tenant setting `recognition_wall_requires_consent`        |
| `parent_consent_status`   | ENUM('not_requested', 'pending', 'granted', 'denied') NOT NULL DEFAULT 'not_requested'                   |                                                                     |
| `parent_consent_at`       | TIMESTAMPTZ NULL                                                                                         |                                                                     |
| `admin_approved`          | BOOLEAN NOT NULL DEFAULT false                                                                           | Driven by tenant setting `recognition_wall_admin_approval_required` |
| `admin_approved_by_id`    | UUID FK NULL                                                                                             | -> `users`                                                          |
| `published_at`            | TIMESTAMPTZ NULL                                                                                         | Set when both gates pass                                            |
| `unpublished_at`          | TIMESTAMPTZ NULL                                                                                         | Set on unpublish                                                    |
| `created_at`              | TIMESTAMPTZ NOT NULL DEFAULT now()                                                                       |                                                                     |
| `updated_at`              | TIMESTAMPTZ NOT NULL DEFAULT now()                                                                       |                                                                     |

**Index**: `(tenant_id, student_id, publication_type)` — student publication status.

**RLS policy**: `tenant_id = current_setting('app.current_tenant_id')::uuid`

---

### `behaviour_guardian_restrictions`

Explicit, auditable guardian visibility restrictions with effective dates and legal basis. Every restriction change is recorded in `behaviour_entity_history`.

| Column             | Type                                                                                                            | Notes                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `id`               | UUID PK                                                                                                         | `gen_random_uuid()`                                 |
| `tenant_id`        | UUID FK NOT NULL                                                                                                | RLS                                                 |
| `student_id`       | UUID FK NOT NULL                                                                                                | -> `students`                                       |
| `parent_id`        | UUID FK NOT NULL                                                                                                | -> `users` (the parent/guardian being restricted)   |
| `restriction_type` | ENUM('no_behaviour_visibility', 'no_behaviour_notifications', 'no_portal_access', 'no_communications') NOT NULL |                                                     |
| `legal_basis`      | VARCHAR(200) NULL                                                                                               | e.g. `"Court order ref. 2025/FC/1234"`              |
| `reason`           | TEXT NOT NULL                                                                                                   | Internal reason for the restriction. Required.      |
| `set_by_id`        | UUID FK NOT NULL                                                                                                | -> `users`                                          |
| `approved_by_id`   | UUID FK NULL                                                                                                    | -> `users`. Optional secondary approval             |
| `effective_from`   | DATE NOT NULL                                                                                                   | First date the restriction is in effect             |
| `effective_until`  | DATE NULL                                                                                                       | Last date in effect. NULL = indefinite              |
| `review_date`      | DATE NULL                                                                                                       | When to schedule a review task for this restriction |
| `status`           | ENUM('active', 'expired', 'revoked', 'superseded') NOT NULL DEFAULT 'active'                                    |                                                     |
| `revoked_at`       | TIMESTAMPTZ NULL                                                                                                |                                                     |
| `revoked_by_id`    | UUID FK NULL                                                                                                    | -> `users`                                          |
| `revoke_reason`    | TEXT NULL                                                                                                       | Required when revoking                              |
| `created_at`       | TIMESTAMPTZ NOT NULL DEFAULT now()                                                                              |                                                     |
| `updated_at`       | TIMESTAMPTZ NOT NULL DEFAULT now()                                                                              |                                                     |

**Indexes**:

- `(tenant_id, student_id, parent_id, status) WHERE status = 'active'` — primary lookup before portal render / notification dispatch
- `(tenant_id, review_date) WHERE status = 'active' AND review_date IS NOT NULL` — daily review reminder check
- `(tenant_id, effective_until) WHERE status = 'active' AND effective_until IS NOT NULL` — daily expiry check

**RLS policy**: `tenant_id = current_setting('app.current_tenant_id')::uuid`

---

## Business Logic

### Points System

**Principle**: Points are computed, not stored. There is no `total_points` column anywhere in the schema. The running total is always derived from participant rows.

**Formula**:

```
student_points(studentId, scope) =
  SUM(behaviour_incident_participants.points_awarded)
  WHERE student_id = studentId
    AND incident.status NOT IN ('withdrawn', 'converted_to_safeguarding')
    AND incident.retention_status = 'active'
    AND [scope filter: academic_year_id or academic_period_id if points_reset_frequency != 'never']
```

**Scope determination** (driven by `tenant_settings.behaviour.points_reset_frequency`):

- `'never'`: all-time total, no date filter
- `'academic_year'`: filter to current `academic_year_id`
- `'academic_period'`: filter to current `academic_period_id`

**Redis caching**:

- Cache key: `behaviour:points:{tenantId}:{studentId}:{scope}` where scope encodes the reset frequency + current period ID
- TTL: 5 minutes
- Cache population: computed on first miss, written to Redis
- Cache invalidation: on any `INSERT` or `UPDATE` to `behaviour_incident_participants` for this student, evict the key
- Cache invalidation: on incident `status` change to/from withdrawn for any incident with this student as participant, evict the key
- **Never serve stale cache for points shown in award threshold checks** — always recompute on the `behaviour:check-awards` worker path

**Service method signature**:

```typescript
async getStudentPoints(
  tx: PrismaClient,
  tenantId: string,
  studentId: string,
): Promise<{ total: number; fromCache: boolean }>
```

**House points**: Aggregate of all active member students' individual points for the current academic year, regardless of `points_reset_frequency`. Separate cache key: `behaviour:house-points:{tenantId}:{houseId}:{academicYearId}`. TTL: 5 minutes.

---

### Awards with Repeatability

**Award type semantics**:

| repeat_mode       | Rule                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `once_ever`       | Student may receive this award at most once in their entire history at this school                             |
| `once_per_year`   | Student may receive this award at most once per academic year (further capped by `repeat_max_per_year` if set) |
| `once_per_period` | Student may receive this award at most once per academic period                                                |
| `unlimited`       | No repeat restriction. Still subject to `repeat_max_per_year` if set                                           |

**Tier supersession**: When `supersedes_lower_tiers = true` on an award type with a `tier_group` and `tier_level`, earning this award:

1. Creates the new `behaviour_recognition_awards` record
2. Finds all prior awards for this student in the same `tier_group` where the award type's `tier_level` < this award's `tier_level` and `superseded_by_id IS NULL`
3. Sets `superseded_by_id` to the new award's ID on all found records

**Auto-award dedup** (critical for BullMQ retry safety): Before creating any auto-triggered award, the worker checks:

1. Has this `triggered_by_incident_id` already produced an award of this `award_type_id` for this student? If yes, skip.
2. Does the repeat_mode allow another award in this period? If no, skip.
3. Has `repeat_max_per_year` been reached this year? If yes, skip.
   Only if all checks pass does the worker insert the award record.

**Manual awards**: Staff with `behaviour.manage` can grant any award manually. Manual awards use `triggered_by_incident_id = NULL`. Dedup checks for repeat_mode and repeat_max_per_year still apply.

---

### Recognition Wall Publication

**Publication flow**:

```
Positive incident logged (severity >= recognition_wall_min_severity)
  OR award granted
  -> Check tenant settings:
     - recognition_wall_enabled = true?
     - recognition_wall_auto_populate = true?
  -> If yes: create behaviour_publication_approvals record
  -> Gate 1: Parent consent
     - If recognition_wall_requires_consent = true AND parent_consent_status != 'granted': BLOCKED
     - If recognition_wall_requires_consent = false: gate passes automatically
  -> Gate 2: Admin approval
     - If recognition_wall_admin_approval_required = true AND admin_approved = false: BLOCKED
     - If recognition_wall_admin_approval_required = false: gate passes automatically
  -> Both gates passed: set published_at = now(), item appears on recognition wall
```

**Publication states**: An item is visible on the public/internal recognition wall only when `published_at IS NOT NULL AND unpublished_at IS NULL`.

**Unpublishing**: Any admin can unpublish (`behaviour.admin`). Sets `unpublished_at`. Does not delete the approval record (full audit trail preserved).

**Re-publication**: After unpublish, admin can re-approve (clears `unpublished_at`, sets new `published_at`).

---

### House Teams

**Membership management**: One house per student per academic year (UNIQUE constraint enforced). Bulk assignment endpoint accepts `[{ studentId, houseId }]` and executes as a single transaction: delete existing memberships for those students in the academic year, insert new memberships. Full rollback on any failure.

**House leaderboard**: Ordered by aggregate house points (sum of all active member students' points in the academic year). Served from Redis cache (`TTL: 5min`). Optionally public (`house_leaderboard_public` setting) — if public, the unauthenticated `GET v1/behaviour/recognition/public/houses` endpoint returns it.

**House points visibility**: Controlled by `house_points_visible_to_students` setting. If false, the parent portal and student-facing views omit house totals.

---

### Intervention Tracking

**Plan lifecycle**:

```
planned -> active         (plan activated, work begins)
planned -> abandoned      (plan abandoned before starting)
active -> monitoring      (goals met, monitoring phase)
active -> completed       (fully resolved)
active -> abandoned       (plan discontinued)
monitoring -> completed   (monitoring period complete)
monitoring -> active      (regression — back to active)
```

**SEND awareness**:

- When `send_aware = true`, the review form renders additional SEND-specific considerations
- `send_notes` is visibility class SENSITIVE — only users with `behaviour.view_sensitive` receive this field in API responses
- AI features (if used for intervention summaries) are blocked from including `send_notes` content and avoid diagnostic/clinical language for SEND students (enforced in the `anonymiseForAI` utility — SEND flag stripped before AI prompt, SEND details never included)
- Outcome analytics segregate SEND vs non-SEND for reporting purposes

**Task integration**: The following tasks are auto-created by the intervention service:

| Event                                                         | Task type                          | Assigned to      | Due date           |
| ------------------------------------------------------------- | ---------------------------------- | ---------------- | ------------------ |
| Intervention plan created                                     | `follow_up`                        | `assigned_to_id` | `start_date`       |
| Intervention status -> active                                 | `intervention_review`              | `assigned_to_id` | `next_review_date` |
| Review recorded with `next_review_date`                       | `intervention_review`              | `assigned_to_id` | `next_review_date` |
| `target_end_date` is 7 calendar days away                     | `follow_up`                        | `assigned_to_id` | `target_end_date`  |
| Review task becomes overdue (past due_date, status = pending) | auto-escalate priority to `urgent` | —                | —                  |

**Review auto-population**: When a review is being created, the service pre-populates:

- `behaviour_points_since_last`: SUM of points_awarded for this student since the previous review's `review_date` (or plan `start_date` for first review), excluding withdrawn incidents
- `attendance_rate_since_last`: fetched from attendance module (`AttendanceService.getStudentAttendanceRate(studentId, fromDate, toDate)`). Returns `null` if attendance module unavailable.

Both values are written to the review record as-is. Staff can override the notes but these calculated fields are read-only after creation (append-only table).

---

### Guardian Restrictions

**Restriction types and their effect**:

| restriction_type             | Effect                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `no_behaviour_visibility`    | Parent cannot see any behaviour data in the portal. Behaviour tab hidden.                                                      |
| `no_behaviour_notifications` | No behaviour-related push/email/WhatsApp notifications sent to this parent                                                     |
| `no_portal_access`           | Full portal access removed (this is a broader restriction — handled by auth/access module, but behaviour module checks it too) |
| `no_communications`          | No communications of any kind sent to this parent via the behaviour module                                                     |

**Prisma query pattern** (used before every parent portal render and before every notification dispatch):

```typescript
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD in tenant timezone

const hasRestriction = await tx.behaviour_guardian_restrictions.findFirst({
  where: {
    tenant_id: tenantId,
    student_id: studentId,
    parent_id: parentId,
    restriction_type: {
      in: ['no_behaviour_visibility', 'no_behaviour_notifications'],
      // Use appropriate subset: ['no_behaviour_visibility'] for portal render,
      // ['no_behaviour_notifications'] for notification dispatch
    },
    status: 'active',
    effective_from: { lte: today },
    OR: [{ effective_until: null }, { effective_until: { gte: today } }],
  },
});

if (hasRestriction) {
  // Block portal render or skip notification dispatch
}
```

**Important**: The date comparison is performed in the **tenant's local timezone**, not UTC. Use `toLocaleDateString('en-CA', { timeZone: tenantTimezone })` to get the YYYY-MM-DD local date before running the query.

**Auto-expiry**: The daily `behaviour:guardian-restriction-check` worker identifies restrictions where `effective_until < today AND status = 'active'` and transitions them to `status = 'expired'`. This is recorded in `behaviour_entity_history` with `change_type = 'status_changed'` and `new_values = { status: 'expired' }`.

**Review reminders**: The same daily worker checks for restrictions where `review_date` is within the next 14 calendar days AND no open `guardian_restriction_review` task already exists for this restriction. If not, creates a `behaviour_tasks` record:

- `task_type = 'guardian_restriction_review'`
- `entity_type = 'guardian_restriction'`
- `entity_id = restriction.id`
- `assigned_to_id = set_by_id` (or fallback to behaviour admin)
- `priority = 'medium'` (escalates to `'high'` if `review_date` is within 3 days)
- `due_date = review_date`

**Every restriction change** (create, update effective dates, revoke, expire) writes a record to `behaviour_entity_history`:

- `entity_type = 'guardian_restriction'`
- `entity_id = restriction.id`
- `change_type = 'created' | 'updated' | 'revoked' | 'status_changed'`
- `changed_by_id = actor's user ID`
- `reason` = required for revocations

---

## API Endpoints

### Recognition & Houses (behaviour-recognition.controller.ts) — 12 endpoints

| Method | Route                                               | Description                                      | Permission                                   |
| ------ | --------------------------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| GET    | `v1/behaviour/recognition/wall`                     | Internal recognition wall (published items)      | `behaviour.view`                             |
| GET    | `v1/behaviour/recognition/leaderboard`              | Student points leaderboard (scope-filtered)      | `behaviour.view`                             |
| GET    | `v1/behaviour/recognition/houses`                   | House standings with aggregate points            | `behaviour.view`                             |
| GET    | `v1/behaviour/recognition/houses/:id`               | House detail: members, points, history           | `behaviour.view`                             |
| POST   | `v1/behaviour/recognition/awards`                   | Create manual award                              | `behaviour.manage`                           |
| GET    | `v1/behaviour/recognition/awards`                   | Award history (filterable by student/type/year)  | `behaviour.view`                             |
| POST   | `v1/behaviour/recognition/publications`             | Create publish request (consent + approval gate) | `behaviour.manage`                           |
| GET    | `v1/behaviour/recognition/publications/:id`         | Publication approval status                      | `behaviour.manage`                           |
| PATCH  | `v1/behaviour/recognition/publications/:id/approve` | Admin approve publish                            | `behaviour.admin`                            |
| PATCH  | `v1/behaviour/recognition/publications/:id/reject`  | Admin reject publish                             | `behaviour.admin`                            |
| GET    | `v1/behaviour/recognition/public/feed`              | Unauthenticated public recognition feed          | Public (if `recognition_wall_public = true`) |
| POST   | `v1/behaviour/recognition/houses/bulk-assign`       | Bulk assign students to houses                   | `behaviour.admin`                            |

### Interventions (behaviour-interventions.controller.ts) — 12 endpoints

| Method | Route                                          | Description                                                                   | Permission         |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------- | ------------------ |
| POST   | `v1/behaviour/interventions`                   | Create intervention plan                                                      | `behaviour.manage` |
| GET    | `v1/behaviour/interventions`                   | List (Active/Overdue/Completed, scope-filtered)                               | `behaviour.manage` |
| GET    | `v1/behaviour/interventions/:id`               | Detail: goals, strategies, reviews, tasks                                     | `behaviour.manage` |
| PATCH  | `v1/behaviour/interventions/:id`               | Update plan, goals, strategies                                                | `behaviour.manage` |
| PATCH  | `v1/behaviour/interventions/:id/status`        | Status transition (planned->active, active->completed, etc.)                  | `behaviour.manage` |
| POST   | `v1/behaviour/interventions/:id/reviews`       | Record review (auto-populates stats)                                          | `behaviour.manage` |
| GET    | `v1/behaviour/interventions/:id/reviews`       | Review history (append-only)                                                  | `behaviour.manage` |
| GET    | `v1/behaviour/interventions/:id/auto-populate` | Pre-fetch auto-population data before review creation                         | `behaviour.manage` |
| POST   | `v1/behaviour/interventions/:id/complete`      | Complete with outcome + notes                                                 | `behaviour.manage` |
| GET    | `v1/behaviour/interventions/overdue`           | Interventions with overdue next_review_date                                   | `behaviour.manage` |
| GET    | `v1/behaviour/interventions/my`                | Interventions assigned to current user                                        | `behaviour.manage` |
| GET    | `v1/behaviour/interventions/outcomes`          | Outcome analytics (improved/no_change/deteriorated by type, year group, SEND) | `behaviour.manage` |

### Guardian Restrictions (behaviour-guardian-restrictions.controller.ts) — 6 endpoints

| Method | Route                                           | Description                                                    | Permission        |
| ------ | ----------------------------------------------- | -------------------------------------------------------------- | ----------------- |
| POST   | `v1/behaviour/guardian-restrictions`            | Create restriction (legal basis, effective dates, review date) | `behaviour.admin` |
| GET    | `v1/behaviour/guardian-restrictions`            | List (filterable by student, parent, status)                   | `behaviour.admin` |
| GET    | `v1/behaviour/guardian-restrictions/:id`        | Detail with full entity history                                | `behaviour.admin` |
| PATCH  | `v1/behaviour/guardian-restrictions/:id`        | Update (extend dates, add legal basis, change review date)     | `behaviour.admin` |
| POST   | `v1/behaviour/guardian-restrictions/:id/revoke` | Revoke with mandatory reason                                   | `behaviour.admin` |
| GET    | `v1/behaviour/guardian-restrictions/active`     | All currently active restrictions across tenant                | `behaviour.admin` |

---

## Frontend Pages

### `/behaviour/recognition`

**Purpose**: Recognition wall, points leaderboard, house standings, and publication management.

**Layout**: Tabs — Wall | Leaderboard | Houses | Pending Approvals

**Wall tab**:

- Grid of published recognition items (awards + qualifying positive incidents)
- Each card: student first name + initial, award/category name, date, icon/colour
- Filter: academic year, year group, award type
- Staff view includes unpublish action and publication status badge

**Leaderboard tab**:

- Ranked list of students by cumulative points (scope-filtered to user's scope)
- Columns: rank, student name, year group, points total, house badge
- Period selector (this year / this period / all time)
- Export to PDF/CSV

**Houses tab** (only visible if `house_teams_enabled = true`):

- House cards with name, colour, icon, total points, rank
- Click into house: member list with individual points, house-level trend chart

**Pending Approvals tab** (only visible with `behaviour.admin`):

- Items awaiting admin approval: student name, achievement, date, consent status
- One-tap approve/reject with optional note
- Consent request status for each item

---

### `/behaviour/interventions`

**Purpose**: List all intervention plans assigned to or visible by the current user.

**Layout**: Filter bar + list. Tabs: Active | Overdue | Monitoring | Completed | All

**Each row**: student name, intervention title, type badge, assigned staff, start date, next review date (red if overdue), status badge.

**Quick actions**: View, mark reviewed (opens side panel), complete.

---

### `/behaviour/interventions/new`

**Purpose**: Create a new intervention plan.

**Form sections**:

1. Student (searchable, shows existing active interventions as warning)
2. Type and title
3. Trigger description (what behaviour pattern prompted this)
4. SEND awareness toggle (if true: reveals SEND notes field, marked SENSITIVE)
5. Goals builder: add/remove goals with measurable target and optional deadline
6. Strategies builder: add/remove strategies with responsible staff and frequency
7. Dates: start, target end, review frequency, first review date (auto-calculated)
8. Assign to staff (defaults to current user)
9. Link to incidents (optional: search and attach triggering incidents)

**Validation**:

- At least one goal required
- At least one strategy required
- start_date must not be in the past by more than 30 days

---

### `/behaviour/interventions/[id]`

**Purpose**: Full intervention detail with review history and task list.

**Tabs**: Overview | Reviews | Tasks | Incidents | History

**Overview tab**: All plan fields, goal/strategy cards with status indicators, next review date (with countdown), SEND notes if permitted.

**Reviews tab**: Chronological list of all reviews (append-only). Each review: date, reviewer, progress badge, goal update statuses, points since last, attendance rate since last, notes, next review date set.

- "Add Review" button opens a form pre-populated with auto-populated stats (fetched from `auto-populate` endpoint). Points since last and attendance rate shown read-only; staff fills in progress, goal updates, notes.

**Tasks tab**: All `behaviour_tasks` linked to this intervention. Status, due date, assigned to.

**Incidents tab**: All linked incidents with link/unlink action.

**History tab**: `behaviour_entity_history` for this intervention in reverse chronological order.

---

### `/settings/behaviour-awards`

**Purpose**: Configure award types with repeatability semantics.

**List**: All award types with name, threshold, repeat_mode, tier_group/level, active status.

**Create/Edit form**:

- Name (en + ar)
- Points threshold (optional — if blank, manual-only)
- Repeat mode: radio buttons with plain-English descriptions ("Once ever", "Once per year", "Once per academic period", "Unlimited")
- Max per year (optional integer, only visible if repeat_mode is not once_ever)
- Tier group (text input, optional) and tier level (integer, optional)
- Supersedes lower tiers toggle (only visible if tier_group + tier_level are set)
- Icon picker + colour picker
- Display order (drag-and-drop reorder on list)
- Active toggle

---

### `/settings/behaviour-houses`

**Purpose**: Configure house teams and manage memberships.

**Houses list**: Active houses with colour swatches, member count, current points.

**Create/Edit house form**: Name (en + ar), colour picker, icon picker, display order.

**Membership tab**: Current academic year. Shows unassigned students and house rosters.

- Drag students between houses or use "Assign to house" dropdown
- Bulk import via CSV: `student_number, house_name` format
- Bulk assign by year group: "Assign Year 7 to houses randomly / evenly"

---

## Worker Jobs

### `behaviour:check-awards`

**Queue**: `behaviour`
**Trigger**: On incident creation (enqueued by `BehaviourIncidentService.create` after the incident and participants are persisted)
**Payload**: `{ tenantId: string, incidentId: string, studentIds: string[] }`

**Logic**:

```
for each studentId in payload.studentIds:
  1. Recompute student's current total points (do NOT use cache — compute fresh)
  2. Load all active award types for tenant where points_threshold IS NOT NULL
  3. For each award type ordered by tier_level DESC (higher tiers first):
     a. Does the student's points total >= award_type.points_threshold?
     b. Check repeat_mode:
        - once_ever: does student have ANY award of this type? If yes, skip.
        - once_per_year: does student have an award of this type in current academic year? If yes, skip.
        - once_per_period: does student have an award of this type in current academic period? If yes, skip.
        - unlimited: always eligible
     c. Check repeat_max_per_year: if set, count awards of this type this year. If at max, skip.
     d. Dedup guard: does an award of this type already exist with triggered_by_incident_id = incidentId? If yes, skip.
     e. If all checks pass: INSERT behaviour_recognition_awards
        - points_at_award = current computed total
        - triggered_by_incident_id = incidentId
        - awarded_by_id = system user (or incident reporter)
        - academic_year_id = current year
     f. If supersedes_lower_tiers = true: UPDATE lower-tier awards in same tier_group to set superseded_by_id
     g. Enqueue behaviour:parent-notification for behaviour_award_parent template
     h. If recognition_wall_auto_populate = true: create behaviour_publication_approvals record
```

**Idempotency**: Step 3d ensures the job is fully safe to retry. BullMQ retry after worker crash will find the existing award (same `triggered_by_incident_id`) and skip.

---

### `behaviour:guardian-restriction-check`

**Queue**: `behaviour`
**Trigger**: Cron, daily at 06:00 in each tenant's configured timezone
**Payload**: `{ tenantId: string }`

**Logic**:

```
const today = localDate(tenantTimezone); // YYYY-MM-DD

// Step 1: Expire ended restrictions
UPDATE behaviour_guardian_restrictions
SET status = 'expired', updated_at = now()
WHERE tenant_id = tenantId
  AND status = 'active'
  AND effective_until IS NOT NULL
  AND effective_until < today;

// For each expired restriction: insert into behaviour_entity_history
//   change_type = 'status_changed', new_values = { status: 'expired' }

// Step 2: Create review reminder tasks
const upcoming = await tx.behaviour_guardian_restrictions.findMany({
  where: {
    tenant_id: tenantId,
    status: 'active',
    review_date: { not: null, lte: addDays(today, 14) },
  },
});

for each restriction in upcoming:
  // Check if a guardian_restriction_review task already exists and is not completed/cancelled
  const existingTask = await tx.behaviour_tasks.findFirst({
    where: {
      tenant_id: tenantId,
      entity_type: 'guardian_restriction',
      entity_id: restriction.id,
      task_type: 'guardian_restriction_review',
      status: { in: ['pending', 'in_progress'] },
    },
  });

  if (!existingTask):
    priority = differenceInDays(restriction.review_date, today) <= 3 ? 'high' : 'medium';
    INSERT behaviour_tasks (
      task_type = 'guardian_restriction_review',
      entity_type = 'guardian_restriction',
      entity_id = restriction.id,
      title = `Guardian restriction review due: ${student name}`,
      assigned_to_id = restriction.set_by_id,
      priority = priority,
      due_date = restriction.review_date,
    )
```

---

## Notification Templates

### `behaviour_award_parent`

**Trigger**: Auto-award created by `behaviour:check-awards` worker, or manual award created by staff
**Channels**: Per parent preference (in_app, email, WhatsApp)
**Audience**: All active, non-restricted parents/guardians of the student

**Template variables**:

- `student_first_name`
- `award_name` (localised to parent's preferred locale: `name` or `name_ar`)
- `award_description` (localised)
- `points_at_award`
- `school_name`
- `awarded_at` (formatted in tenant timezone, localised)

**Restriction check**: Before dispatching, check `behaviour_guardian_restrictions` for `no_behaviour_notifications` or `no_communications` restriction active on the effective date for this parent + student combination. Skip the notification if any such restriction is active.

---

## Acceptance Criteria

### Points System

- [ ] `GET v1/behaviour/students/:id` returns `points.total` computed live (or from 5-min Redis cache)
- [ ] Points total decreases when an incident is withdrawn
- [ ] Points reset correctly based on `points_reset_frequency` setting
- [ ] Points reset to 0 at academic year boundary (or period boundary)
- [ ] House leaderboard reflects sum of member points
- [ ] Cache is invalidated when a participant's `points_awarded` changes

### Awards

- [ ] Award auto-created when student's points cross `points_threshold`
- [ ] `once_per_year`: second award of same type in same year is NOT created
- [ ] `once_ever`: second award ever is NOT created
- [ ] `supersedes_lower_tiers`: lower-tier awards get `superseded_by_id` set
- [ ] Worker retry does not create duplicate award (dedup by `triggered_by_incident_id`)
- [ ] Manual award respects repeat_mode checks
- [ ] Award notification sent to parent (subject to restrictions)
- [ ] Award appears in recognition wall approval queue (if auto-populate enabled)

### Recognition Wall

- [ ] Item appears on wall only when both gates (consent + admin) pass
- [ ] If `recognition_wall_requires_consent = false`: consent gate passes automatically
- [ ] If `recognition_wall_admin_approval_required = false`: admin gate passes automatically
- [ ] Unpublished items disappear immediately
- [ ] Public endpoint returns empty if `recognition_wall_public = false`

### Houses

- [ ] Student can only be in one house per academic year (UNIQUE constraint)
- [ ] Bulk assignment replaces existing memberships atomically
- [ ] House leaderboard is sorted by total points
- [ ] House points not visible in parent portal if `house_points_visible_to_students = false`

### Interventions

- [ ] Plan creation auto-creates initial review task
- [ ] Review recording auto-populates `behaviour_points_since_last` and `attendance_rate_since_last`
- [ ] Review recording creates next review task (if `next_review_date` set)
- [ ] `send_notes` field absent in API response for users without `behaviour.view_sensitive`
- [ ] Overdue interventions (past `next_review_date`, status = active/monitoring) appear in overdue list
- [ ] Intervention status transitions follow the defined state machine

### Guardian Restrictions

- [ ] Parent portal behaviour tab hidden when `no_behaviour_visibility` restriction is active
- [ ] Notification not dispatched when `no_behaviour_notifications` restriction is active
- [ ] Restriction with `effective_until` in the past does not block portal/notifications
- [ ] Restriction with `effective_from` in the future does not block portal/notifications yet
- [ ] Daily worker sets status = 'expired' for restrictions with `effective_until < today`
- [ ] Review reminder task created 14 days before `review_date`
- [ ] Review reminder task priority escalates to 'high' within 3 days
- [ ] Every restriction change creates a `behaviour_entity_history` record

---

## Test Requirements

All tests must follow the RLS leakage pattern from `architecture/testing.md`.

### Unit Tests

**`BehaviourPointsService`**:

- `should return sum of non-withdrawn participant points`
- `should exclude participants on withdrawn incidents`
- `should scope to academic year when points_reset_frequency = academic_year`
- `should scope to academic period when points_reset_frequency = academic_period`
- `should return points from cache when cache hit`
- `should invalidate cache on incident withdrawal`

**`BehaviourAwardService`**:

- `should create award when student crosses threshold`
- `should not create duplicate award for same incident (dedup guard)`
- `should not create award if repeat_mode = once_per_year and already awarded this year`
- `should not create award if repeat_mode = once_ever and already awarded`
- `should set superseded_by_id on lower-tier awards when supersedes_lower_tiers = true`
- `should not exceed repeat_max_per_year`

**`GuardianRestrictionService`**:

- `should return true when active restriction matches effective date range`
- `should return false when restriction.effective_until < today`
- `should return false when restriction.effective_from > today`
- `should return false when restriction.status = expired`
- `should create review task when review_date is within 14 days`
- `should not create duplicate review task`
- `should escalate task priority to high within 3 days of review_date`

### Integration Tests

- `should block parent portal behaviour render for restricted parent`
- `should not send award notification to restricted parent`
- `edge: restriction with null effective_until is indefinite — should block for all future dates`
- `edge: student in two concurrent interventions — overdue check returns both`
- `RLS: house memberships from tenant A not visible to tenant B query`
- `RLS: guardian restrictions from tenant A not accessible to tenant B`

### Permission Tests

- `should return 403 when creating award without behaviour.manage`
- `should return 403 when creating guardian restriction without behaviour.admin`
- `should return 403 when approving publication without behaviour.admin`
- `should return 403 when revoking guardian restriction without behaviour.admin`
