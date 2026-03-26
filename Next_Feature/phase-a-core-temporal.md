# Phase A: Core + Temporal — Implementation Spec

## Prerequisites

None. This is the foundation phase.

## Objectives

1. Create the entire database schema (all 32 tables) with migrations, RLS policies, and seed data
2. Implement incidents CRUD with full state machine
3. Implement participant management with domain constraint
4. Implement quick-log (online, idempotent)
5. Implement entity history (append-only recording)
6. Implement data classification framework
7. Implement status projection (converted_to_safeguarding -> closed)
8. Implement scope enforcement framework
9. Implement parent description send-gate and lock
10. Register all 12 permissions
11. Build the core frontend pages (incidents, students, quick-log, tasks)

---

## Database Schema

### Phase A creates ALL 32 tables via Prisma schema + migrations. This section contains:
- **Full definitions** for tables with Phase A business logic (7 tables)
- **Schema-only summaries** for tables whose business logic is built in later phases (25 tables)

### RLS Policies

Every table below (except `users`, which is platform-level) gets an RLS policy:

```sql
CREATE POLICY "tenant_isolation" ON {table_name}
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Applied via Prisma interactive transaction: `SET LOCAL app.current_tenant_id = '...'` before any query.

---

### Tables with Phase A Business Logic

#### `behaviour_categories`

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
| `benchmark_category` | ENUM('praise', 'merit', 'minor_positive', 'major_positive', 'verbal_warning', 'written_warning', 'detention', 'internal_suspension', 'external_suspension', 'expulsion', 'note', 'observation', 'other') NOT NULL | |
| `display_order` | INT NOT NULL DEFAULT 0 | |
| `is_active` | BOOLEAN DEFAULT true | |
| `is_system` | BOOLEAN DEFAULT false | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**UNIQUE**: `(tenant_id, name)`.

---

#### `behaviour_incidents`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `incident_number` | VARCHAR(20) NOT NULL | Sequence: `BH-000001` via `SequenceService` |
| `idempotency_key` | VARCHAR(36) NULL | Client-generated UUIDv4 for dedup |
| `category_id` | UUID FK NOT NULL | -> `behaviour_categories` |
| `polarity` | ENUM('positive', 'negative', 'neutral') NOT NULL | Denormalised from category |
| `severity` | INT NOT NULL | Denormalised from category at creation |
| `reported_by_id` | UUID FK NOT NULL | -> `users` |
| `description` | TEXT NOT NULL | Min 3 chars. Visibility class: STAFF |
| `parent_description` | TEXT NULL | Visibility class: PARENT |
| `parent_description_ar` | TEXT NULL | Visibility class: PARENT |
| `parent_description_locked` | BOOLEAN DEFAULT false | Locked after parent notification sent |
| `parent_description_set_by_id` | UUID FK NULL | |
| `parent_description_set_at` | TIMESTAMPTZ NULL | |
| `context_notes` | TEXT NULL | Visibility class: SENSITIVE |
| `location` | VARCHAR(100) NULL | |
| `context_type` | ENUM('class', 'break', 'before_school', 'after_school', 'lunch', 'transport', 'extra_curricular', 'off_site', 'online', 'other') NOT NULL DEFAULT 'class' | |
| `occurred_at` | TIMESTAMPTZ NOT NULL | |
| `logged_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| `academic_year_id` | UUID FK NOT NULL | |
| `academic_period_id` | UUID FK NULL | |
| `schedule_entry_id` | UUID FK NULL | |
| `subject_id` | UUID FK NULL | |
| `room_id` | UUID FK NULL | |
| `period_order` | INT NULL | |
| `weekday` | INT NULL | 0-6 |
| `status` | ENUM('draft', 'active', 'investigating', 'under_review', 'awaiting_approval', 'awaiting_parent_meeting', 'escalated', 'resolved', 'withdrawn', 'closed_after_appeal', 'superseded', 'converted_to_safeguarding') NOT NULL DEFAULT 'draft' | |
| `approval_status` | ENUM('not_required', 'pending', 'approved', 'rejected') DEFAULT 'not_required' | |
| `approval_request_id` | UUID FK NULL | |
| `parent_notification_status` | ENUM('not_required', 'pending', 'sent', 'delivered', 'failed', 'acknowledged') DEFAULT 'not_required' | |
| `follow_up_required` | BOOLEAN DEFAULT false | |
| `escalated_from_id` | UUID FK NULL | Self-referential |
| `policy_evaluation_id` | UUID FK NULL | |
| `context_snapshot` | JSONB NOT NULL DEFAULT '{}' | Frozen at creation |
| `retention_status` | ENUM('active', 'archived', 'anonymised') DEFAULT 'active' | |
| `archived_at` | TIMESTAMPTZ NULL | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Indexes**:
- `(tenant_id, occurred_at DESC)`
- `(tenant_id, polarity, occurred_at DESC)`
- `(tenant_id, status)`
- `(tenant_id, status, follow_up_required)`
- `(tenant_id, category_id, occurred_at DESC)`
- `(tenant_id, reported_by_id, occurred_at DESC)`
- `(tenant_id, subject_id, weekday, period_order)`
- `(tenant_id, context_type, weekday, period_order)`
- `(tenant_id, academic_year_id)`
- `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL` -- partial unique
- `(tenant_id, retention_status) WHERE retention_status = 'active'`

**Context snapshot Zod schema**:

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

**Incident state machine**:

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
investigating -> resolved                (investigation concluded)
investigating -> escalated               (higher severity discovered)
investigating -> converted_to_safeguarding (concern discovered)

awaiting_approval -> active              (approval rejected -- reverts)
awaiting_approval -> resolved            (approval granted, consequence applied)

awaiting_parent_meeting -> resolved      (meeting held)
awaiting_parent_meeting -> escalated     (meeting outcome warrants escalation)

under_review -> active | escalated | resolved | withdrawn

escalated -> investigating              (investigated at escalated level)
escalated -> resolved                    (resolved at escalated level)

resolved -> closed_after_appeal          (outcome changed on appeal)
resolved -> superseded                   (replaced by later determination)

TERMINAL: withdrawn, resolved (unless appealed/superseded), closed_after_appeal, superseded, converted_to_safeguarding
PROJECTED: converted_to_safeguarding -> shown as "closed" to non-safeguarding users
```

**Status projection implementation**:
```typescript
function projectIncidentStatus(status: IncidentStatus, userHasSafeguardingView: boolean): IncidentStatus | 'closed' {
  if (status === 'converted_to_safeguarding' && !userHasSafeguardingView) {
    return 'closed';
  }
  return status;
}
```

Apply in: API responses, search indexing, entity history rendering, parent notifications.

**Idempotency**: On `POST /incidents` or `POST /incidents/quick` with `idempotency_key`:
1. Check partial unique index `(tenant_id, idempotency_key)`
2. If exists: return existing incident (200 OK), no side effects
3. If not: create normally

**Parent description send-gate**: Before dispatching parent notification for negative incidents:
```typescript
if (incident.severity >= settings.parent_notification_send_gate_severity) {
  const canSend =
    incident.parent_description !== null ||        // staff wrote safe description
    incident.description_template_id !== null ||    // template used (inherently safe)
    incident.parent_description === '';             // explicitly confirmed: category name only
  if (!canSend) {
    // Block notification, set parent_notification_status = 'pending'
    // Notification will dispatch when parent_description is set
    return;
  }
}
```

**Parent description lock**: When `parent_description_auto_lock_on_send = true` and parent notification dispatches:
```typescript
await tx.behaviour_incidents.update({
  where: { id: incidentId },
  data: { parent_description_locked: true },
});
```

Editing a locked description requires `behaviour.manage` permission + reason, and triggers the amendment workflow (Phase C).

**Domain boundary constraint**: Every incident must have at least one participant with `participant_type = 'student'`. Enforced:
1. On creation: service validates before insert
2. On participant DELETE: database trigger prevents removing last student participant

---

#### `behaviour_incident_participants`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `incident_id` | UUID FK NOT NULL | |
| `participant_type` | ENUM('student', 'staff', 'parent', 'visitor', 'unknown') NOT NULL | |
| `student_id` | UUID FK NULL | |
| `staff_id` | UUID FK NULL | |
| `parent_id` | UUID FK NULL | |
| `external_name` | VARCHAR(200) NULL | |
| `role` | ENUM('subject', 'witness', 'bystander', 'reporter', 'victim', 'instigator', 'mediator') DEFAULT 'subject' | |
| `points_awarded` | INT NOT NULL DEFAULT 0 | |
| `parent_visible` | BOOLEAN DEFAULT true | |
| `notes` | TEXT NULL | |
| `student_snapshot` | JSONB NULL | Frozen at creation. NULL for non-students |
| `created_at` | TIMESTAMPTZ | |

**Student snapshot Zod schema**:
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

**CHECK constraint**: Exactly one of `student_id`, `staff_id`, `parent_id`, `external_name` must be non-null based on `participant_type`.

**UNIQUE constraints**: `(incident_id, participant_type, student_id) WHERE student_id IS NOT NULL`. Equivalent for staff_id and parent_id.

**Snapshot population**: On participant creation, if `participant_type = 'student'`:
1. Load student's current year group, class, SEND status, house
2. Check for active interventions
3. Freeze into `student_snapshot` JSONB
4. This snapshot is NEVER updated — historical analytics use it

---

#### `behaviour_description_templates`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `category_id` | UUID FK NOT NULL | |
| `locale` | VARCHAR(5) NOT NULL DEFAULT 'en' | |
| `text` | VARCHAR(500) NOT NULL | |
| `display_order` | INT NOT NULL DEFAULT 0 | |
| `is_active` | BOOLEAN DEFAULT true | |
| `is_system` | BOOLEAN DEFAULT false | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

#### `behaviour_entity_history`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `entity_type` | ENUM('incident', 'sanction', 'intervention', 'appeal', 'task', 'exclusion_case', 'publication_approval', 'break_glass_grant', 'guardian_restriction') NOT NULL | |
| `entity_id` | UUID NOT NULL | |
| `changed_by_id` | UUID FK NOT NULL | |
| `change_type` | VARCHAR(50) NOT NULL | |
| `previous_values` | JSONB NULL | |
| `new_values` | JSONB NOT NULL | |
| `reason` | TEXT NULL | |
| `created_at` | TIMESTAMPTZ | Append-only |

**Indexes**:
- `(tenant_id, entity_type, entity_id, created_at)`
- `(tenant_id, entity_type, created_at)`

**Phase A implementation**: Record history entries for incidents and participants. Other entity types will be recorded as their respective phases are built.

```typescript
async function recordHistory(
  tx: PrismaTransaction,
  tenantId: string,
  entityType: EntityType,
  entityId: string,
  changedById: string,
  changeType: string,
  previousValues: Record<string, unknown> | null,
  newValues: Record<string, unknown>,
  reason?: string,
) {
  await tx.behaviour_entity_history.create({
    data: { tenant_id: tenantId, entity_type: entityType, entity_id: entityId,
            changed_by_id: changedById, change_type: changeType,
            previous_values: previousValues, new_values: newValues, reason },
  });
}
```

---

#### `behaviour_tasks`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `task_type` | ENUM('follow_up', 'intervention_review', 'parent_meeting', 'parent_acknowledgement', 'approval_action', 'sanction_supervision', 'return_check_in', 'safeguarding_action', 'document_requested', 'appeal_review', 'break_glass_review', 'guardian_restriction_review', 'custom') | |
| `entity_type` | ENUM('incident', 'sanction', 'intervention', 'safeguarding_concern', 'appeal', 'break_glass_grant', 'exclusion_case', 'guardian_restriction') NOT NULL | |
| `entity_id` | UUID NOT NULL | |
| `title` | VARCHAR(300) NOT NULL | |
| `description` | TEXT NULL | |
| `assigned_to_id` | UUID FK NOT NULL | |
| `created_by_id` | UUID FK NOT NULL | |
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
- `(tenant_id, assigned_to_id, status, due_date)`
- `(tenant_id, entity_type, entity_id)`
- `(tenant_id, status, due_date)`

**Phase A auto-creation**: When an incident has `follow_up_required = true`, auto-create a `follow_up` task assigned to the reporter with due_date = next school day.

---

#### `behaviour_parent_acknowledgements`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `incident_id` | UUID FK NULL | |
| `sanction_id` | UUID FK NULL | |
| `amendment_notice_id` | UUID FK NULL | |
| `parent_id` | UUID FK NOT NULL | |
| `notification_id` | UUID FK NULL | |
| `channel` | ENUM('email', 'whatsapp', 'in_app') | |
| `sent_at` | TIMESTAMPTZ NOT NULL | |
| `delivered_at` | TIMESTAMPTZ NULL | |
| `read_at` | TIMESTAMPTZ NULL | |
| `acknowledged_at` | TIMESTAMPTZ NULL | |
| `acknowledgement_method` | ENUM('in_app_button', 'email_link', 'whatsapp_reply') NULL | |
| `created_at` | TIMESTAMPTZ | |

---

### Schema-Only Tables (Business Logic in Later Phases)

These tables are created in the Prisma schema and migration during Phase A but their business logic (services, endpoints, frontend) is built in the indicated phase. Full column definitions are in the master spec and in the respective phase spec.

| Table | Phase | Key Purpose |
|-------|-------|-------------|
| `behaviour_sanctions` | C | Scheduled consequences |
| `behaviour_appeals` | C | Appeal workflow |
| `behaviour_amendment_notices` | C | Post-notification corrections |
| `behaviour_exclusion_cases` | C | High-stakes exclusion workflow |
| `behaviour_attachments` | D | Evidence files with ClamAV |
| `safeguarding_concerns` | D | Child protection records |
| `safeguarding_actions` | D | Safeguarding chronology |
| `safeguarding_concern_incidents` | D | Safeguarding-behaviour link |
| `safeguarding_break_glass_grants` | D | Emergency access |
| `behaviour_recognition_awards` | E | Milestone awards |
| `behaviour_award_types` | E | Award configuration |
| `behaviour_house_teams` | E | House system |
| `behaviour_house_memberships` | E | Student-house assignment |
| `behaviour_interventions` | E | Intervention plans |
| `behaviour_intervention_incidents` | E | Intervention triggers |
| `behaviour_intervention_reviews` | E | Intervention check-ins |
| `behaviour_publication_approvals` | E | Public display consent |
| `behaviour_guardian_restrictions` | E | Guardian visibility control |
| `behaviour_policy_rules` | B | 5-stage policy engine |
| `behaviour_policy_rule_actions` | B | Rule action definitions |
| `behaviour_policy_rule_versions` | B | Rule version snapshots |
| `behaviour_policy_evaluations` | B | Evaluation ledger |
| `behaviour_policy_action_executions` | B | Action execution log |
| `behaviour_alerts` | F | Pattern detection results |
| `behaviour_alert_recipients` | F | Per-user alert state |
| `behaviour_documents` | G | Generated formal documents |
| `behaviour_document_templates` | G | Document templates |
| `behaviour_legal_holds` | H | Legal hold tracking |

**Implementation note**: Create ALL these tables in the Prisma schema. The full column definitions for each table are in the master spec (behaviour-management-spec-v5-master.md, section 2) and in their respective phase spec. Copy them exactly when writing the Prisma models.

---

### Materialised Views (Schema Only)

Created via raw SQL migration. Business logic (refresh, query) in Phase F.

| View | Purpose |
|------|---------|
| `mv_student_behaviour_summary` | Student aggregate stats |
| `mv_behaviour_benchmarks` | ETB benchmarking aggregates |
| `mv_behaviour_exposure_rates` | Teaching hour normalisation |

---

### Sequences

Register in `tenant_sequences` table:

| Prefix | Entity |
|--------|--------|
| `BH-` | Incidents |
| `SN-` | Sanctions |
| `IV-` | Interventions |
| `CP-` | Safeguarding concerns |
| `AP-` | Appeals |
| `EX-` | Exclusion cases |

---

## Seed Data

On tenant provisioning, seed the following:

### Categories (12)

**Positive**:
| Name | Points | Severity | Benchmark |
|------|--------|----------|-----------|
| Praise | 1 | 1 | praise |
| Merit | 3 | 3 | merit |
| Outstanding Achievement | 5 | 5 | major_positive |
| Principal's Award | 10 | 8 | major_positive |

**Negative**:
| Name | Points | Severity | Benchmark |
|------|--------|----------|-----------|
| Verbal Warning | -1 | 2 | verbal_warning |
| Written Warning | -3 | 4 | written_warning |
| Detention | -5 | 5 | detention |
| Suspension Internal | -15 | 7 | internal_suspension |
| Suspension External | -15 | 8 | external_suspension |
| Expulsion | -50 | 10 | expulsion |

**Neutral**:
| Name | Points | Severity | Benchmark |
|------|--------|----------|-----------|
| Note to File | 0 | 1 | note |
| Observation | 0 | 1 | observation |

### Description Templates (~60)

2-3 templates per category per locale (en + ar). Examples:
- Praise (en): "Excellent class participation", "Helped a fellow student", "Consistent effort and improvement"
- Verbal Warning (en): "Disrupted class learning", "Late to class without valid reason", "Failed to complete homework"
- Each has an Arabic equivalent

### Award Types (4)

| Name | Threshold | Repeat Mode | Tier Group | Tier Level |
|------|-----------|-------------|------------|------------|
| Bronze Award | 50 | once_per_year | achievement_tier | 1 |
| Silver Award | 100 | once_per_year | achievement_tier | 2 |
| Gold Award | 200 | once_per_year | achievement_tier | 3 |
| Principal's Award | 500 | once_per_year | achievement_tier | 4 |

### Policy Rules (5) — Schema only, business logic in Phase B

Seed 5 default rules (details in phase-b-policy-engine.md).

### Document Templates (~20) — Schema only, business logic in Phase G

Seed 10 types x 2 locales (details in phase-g-documents-comms.md).

---

## Data Classification Framework

### Implementation in `packages/shared/`

```typescript
// packages/shared/src/behaviour/data-classification.ts

export enum DataClassification {
  PUBLIC = 'PUBLIC',
  PARENT = 'PARENT',
  STAFF = 'STAFF',
  SENSITIVE = 'SENSITIVE',
  SAFEGUARDING = 'SAFEGUARDING',
}

// Field classification map
const INCIDENT_FIELD_CLASSIFICATION: Record<string, DataClassification> = {
  id: DataClassification.PUBLIC,
  incident_number: DataClassification.STAFF,
  category_id: DataClassification.PARENT,  // category name shown to parents
  polarity: DataClassification.PARENT,
  severity: DataClassification.STAFF,
  description: DataClassification.STAFF,           // NEVER shown to parents
  parent_description: DataClassification.PARENT,
  parent_description_ar: DataClassification.PARENT,
  context_notes: DataClassification.SENSITIVE,     // pastoral/management only
  location: DataClassification.STAFF,
  context_type: DataClassification.STAFF,
  occurred_at: DataClassification.PARENT,
  status: DataClassification.STAFF,                // projected for parents
  // ... etc.
};

export function stripFieldsByClassification<T extends Record<string, unknown>>(
  data: T,
  fieldMap: Record<string, DataClassification>,
  userMaxClass: DataClassification,
): Partial<T> {
  const classOrder = [
    DataClassification.PUBLIC,
    DataClassification.PARENT,
    DataClassification.STAFF,
    DataClassification.SENSITIVE,
    DataClassification.SAFEGUARDING,
  ];
  const userLevel = classOrder.indexOf(userMaxClass);

  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(data)) {
    const fieldClass = fieldMap[key];
    if (!fieldClass || classOrder.indexOf(fieldClass) <= userLevel) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}
```

### Enforcement Points (Phase A)

| Surface | Implementation |
|---------|---------------|
| API responses | Service layer calls `stripFieldsByClassification` before returning |
| Search indexing | Only STAFF-class fields indexed. Safeguarding entities excluded. `converted_to_safeguarding` indexed as `closed` |

Other enforcement points (hover cards, exports, AI prompts, reports, notifications) are implemented in their respective phases.

---

## Scope Enforcement Framework

### Implementation

Scope is stored on `tenant_memberships` as `behaviour_scope: 'own' | 'class' | 'year_group' | 'pastoral' | 'all'`.

```typescript
// packages/shared/src/behaviour/scope.ts

export type BehaviourScope = 'own' | 'class' | 'year_group' | 'pastoral' | 'all';

// In the behaviour service, build a Prisma WHERE clause based on scope:
function buildScopeFilter(
  userId: string,
  scope: BehaviourScope,
  tenantId: string,
): Prisma.behaviour_incidentsWhereInput {
  switch (scope) {
    case 'own':
      return { reported_by_id: userId };
    case 'class':
      // Students in classes the user teaches (join through scheduling)
      return {
        behaviour_incident_participants: {
          some: {
            student_id: { in: /* studentIds from user's classes */ },
            participant_type: 'student',
          },
        },
      };
    case 'year_group':
      // Students in year groups the user is assigned to
      return {
        behaviour_incident_participants: {
          some: {
            student: { year_group_id: { in: /* user's year_group_ids */ } },
            participant_type: 'student',
          },
        },
      };
    case 'pastoral':
    case 'all':
      return {}; // No filter — sees everything
  }
}
```

**Enforced on**: All list endpoints, detail endpoints (404 if out of scope), search results, exports.

---

## Timezone & Calendar Utilities

### Implementation in `packages/shared/`

```typescript
// packages/shared/src/behaviour/school-calendar.ts

export async function isSchoolDay(tenantId: string, date: Date): Promise<boolean> {
  // Check against school_closures table
  // Returns false for weekends (configurable) and closure dates
}

export async function addSchoolDays(
  tenantId: string,
  fromDate: Date,
  days: number,
): Promise<Date> {
  // Skip non-school days when counting forward
}
```

All time-sensitive logic uses tenant timezone from `tenant_settings.timezone`. TIMESTAMPTZ stored in UTC, rendered in tenant TZ via Luxon.

---

## Quick-Log Engine

### Architecture (Online with Idempotency)

**Pre-fetch endpoint**: `GET v1/behaviour/quick-log/context` returns:
```typescript
{
  categories: Category[],       // <1KB
  favourites: UUID[],           // user's favourited categories
  recent_students: StudentBrief[], // last 20 (id, first_name, last_name, year_group)
  current_class?: {             // if during active class
    roster: StudentBrief[],
    subject_name: string,
    room_name: string,
    schedule_entry_id: string,
  },
  templates: Record<string, DescriptionTemplate[]>, // by category_id
}
```

Refreshed every 5 minutes by the frontend.

**Submit flow**:
1. Client generates `idempotency_key` (UUIDv4)
2. `POST v1/behaviour/incidents/quick` with key
3. Server dedup check -> create if new, return existing if duplicate
4. Populate `context_snapshot` from live data (frozen)
5. Populate `student_snapshot` per participant (frozen)
6. Apply parent notification rules (send-gate check)
7. Queue `behaviour:parent-notification` if applicable
8. Record `behaviour_entity_history` entry (change_type: 'created')
9. Return incident with success
10. Frontend shows "Merit logged. Undo." toast (30s window)

**Undo**: `POST v1/behaviour/incidents/:id/withdraw` with reason "Undone by reporter". Cascading withdrawal handled in Phase C (sanctions) and later phases.

**Bulk positive**: `POST v1/behaviour/incidents/bulk-positive`:
```typescript
{
  category_id: string,
  student_ids: string[],        // 2-15 students
  template_id?: string,
  description?: string,
  context_type: string,
  schedule_entry_id?: string,
}
```
Creates one incident per student. Each gets its own idempotency_key (server-generated). Returns array of created incidents. "8 merits logged. Undo."

### Frontend — Quick-Log FAB

Floating action button on every school page. Bottom sheet with:
1. **Category picker**: Favourites row (max 6) then full grid. Positive-first.
2. **Student picker**: During class -> class roster grid with multi-select. Then recent. Then type-ahead search.
3. **Description**: Template chips per category. Tap to use, or edit.
4. **Context**: Auto-populated during class. Otherwise `context_type` picker.
5. **Submit**: Auto-submit if `quick_log_auto_submit = true`. Toast with undo.

Minimum touch target: 44x44px. Mobile-first layout.

---

## API Endpoints

### 8.1 Core Behaviour — ~28 endpoints

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/behaviour/incidents` | Create incident (standard form) | `behaviour.log` |
| POST | `v1/behaviour/incidents/quick` | Quick-log | `behaviour.log` |
| POST | `v1/behaviour/incidents/ai-parse` | AI NL parse -> preview (STUB — logic in Phase F) | `behaviour.log` |
| POST | `v1/behaviour/incidents/bulk-positive` | Bulk merit for multiple students | `behaviour.log` |
| GET | `v1/behaviour/incidents` | Paginated list with filters | `behaviour.view` + scope |
| GET | `v1/behaviour/incidents/:id` | Full detail | `behaviour.view` + scope |
| PATCH | `v1/behaviour/incidents/:id` | Update | `behaviour.manage` |
| PATCH | `v1/behaviour/incidents/:id/status` | Status transition | `behaviour.manage` |
| POST | `v1/behaviour/incidents/:id/withdraw` | Withdraw with reason | `behaviour.manage` |
| POST | `v1/behaviour/incidents/:id/follow-up` | Record follow-up | `behaviour.manage` |
| POST | `v1/behaviour/incidents/:id/participants` | Add participant | `behaviour.manage` |
| DELETE | `v1/behaviour/incidents/:id/participants/:pid` | Remove participant | `behaviour.manage` |
| POST | `v1/behaviour/incidents/:id/attachments` | Upload evidence (STUB — full pipeline in Phase D) | `behaviour.manage` |
| GET | `v1/behaviour/incidents/:id/attachments` | List attachments | `behaviour.view` + visibility |
| GET | `v1/behaviour/incidents/:id/attachments/:aid` | Download | `behaviour.view` + visibility |
| GET | `v1/behaviour/incidents/:id/history` | Entity history timeline | `behaviour.manage` |
| GET | `v1/behaviour/incidents/:id/policy-evaluation` | Policy decision trace (STUB — logic in Phase B) | `behaviour.manage` |
| GET | `v1/behaviour/incidents/my` | My logged incidents | `behaviour.log` |
| GET | `v1/behaviour/incidents/feed` | Live feed | `behaviour.view` |
| GET | `v1/behaviour/quick-log/context` | Pre-fetch cache payload | `behaviour.log` |
| GET | `v1/behaviour/quick-log/templates` | Templates per category | `behaviour.log` |

### 8.2 Student Behaviour — 13 endpoints

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `v1/behaviour/students` | Student overview list (scope-filtered) | `behaviour.view` |
| GET | `v1/behaviour/students/:studentId` | Student profile header | `behaviour.view` |
| GET | `v1/behaviour/students/:studentId/timeline` | All events timeline | `behaviour.view` |
| GET | `v1/behaviour/students/:studentId/analytics` | Analytics (STUB — full in Phase F) | `behaviour.view` |
| GET | `v1/behaviour/students/:studentId/points` | Cumulative points | `behaviour.view` |
| GET | `v1/behaviour/students/:studentId/sanctions` | Sanction list (STUB — full in Phase C) | `behaviour.view` |
| GET | `v1/behaviour/students/:studentId/interventions` | Intervention list (STUB — full in Phase E) | `behaviour.view` |
| GET | `v1/behaviour/students/:studentId/awards` | Award list (STUB — full in Phase E) | `behaviour.view` |
| GET | `v1/behaviour/students/:studentId/ai-summary` | AI summary (STUB — full in Phase F) | `behaviour.ai_query` |
| GET | `v1/behaviour/students/:studentId/preview` | Hover card preview (STAFF-class only) | `behaviour.view` |
| GET | `v1/behaviour/students/:studentId/export` | PDF export (STUB — full in Phase G) | `behaviour.manage` |
| GET | `v1/behaviour/students/:studentId/parent-view` | Parent-safe view (STUB — full in Phase G) | parent |
| GET | `v1/behaviour/students/:studentId/tasks` | Tasks for this student | `behaviour.view` |

### 8.5 Tasks — 8 endpoints

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `v1/behaviour/tasks` | List with filters | `behaviour.view` |
| GET | `v1/behaviour/tasks/my` | My pending tasks | `behaviour.view` |
| GET | `v1/behaviour/tasks/:id` | Detail | `behaviour.view` |
| PATCH | `v1/behaviour/tasks/:id` | Update (reassign, change priority) | `behaviour.manage` |
| POST | `v1/behaviour/tasks/:id/complete` | Complete with notes | `behaviour.view` (own) / `behaviour.manage` (any) |
| POST | `v1/behaviour/tasks/:id/cancel` | Cancel with reason | `behaviour.manage` |
| GET | `v1/behaviour/tasks/overdue` | Overdue tasks | `behaviour.manage` |
| GET | `v1/behaviour/tasks/stats` | Dashboard stats | `behaviour.view` |

### 8.10 Configuration (Phase A portion) — 6 endpoints

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `v1/behaviour/categories` | List categories | `behaviour.view` |
| POST | `v1/behaviour/categories` | Create category | `behaviour.admin` |
| PATCH | `v1/behaviour/categories/:id` | Update | `behaviour.admin` |
| GET | `v1/behaviour/description-templates` | List templates | `behaviour.view` |
| POST | `v1/behaviour/description-templates` | Create template | `behaviour.admin` |
| PATCH | `v1/behaviour/description-templates/:id` | Update | `behaviour.admin` |

---

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/behaviour` | Pulse dashboard — placeholder in Phase A (shows task summary + live feed + basic stats). Full pulse in Phase F |
| `/behaviour/incidents` | Incident list with tabs: All / Positive / Negative / Pending / Escalated / My. Paginated, scope-filtered. Mobile responsive. |
| `/behaviour/incidents/new` | Full incident creation form: category, students, description (with template chips), context, parent description |
| `/behaviour/incidents/[id]` | Incident detail: header, participants list, description, context, status history, follow-up recording. Placeholders for sanctions/attachments/policy (later phases) |
| `/behaviour/students` | Student overview table: name, year group, points, positive/negative count, last incident. Scope-filtered. |
| `/behaviour/students/[studentId]` | Profile page: header with points sparkline + ratio + badges. Tabs: Timeline (incidents chronologically), stubs for Analytics/Interventions/Sanctions/Awards/Tasks |
| `/behaviour/tasks` | Task inbox: my pending tasks, overdue indicator, complete/cancel actions |
| `/settings/behaviour-categories` | Category CRUD: name (en/ar), polarity, severity, point_value, color, icon, benchmark mapping, display order. Drag-to-reorder. |
| `/settings/behaviour-general` | Module settings form: quick-log settings, points settings, parent notification settings, AI toggles. Maps to `tenant_settings.behaviour` JSONB |

Quick-log FAB component appears on all `/behaviour/*` pages.

---

## Worker Jobs

### `behaviour:parent-notification`

**Trigger**: On incident creation, if parent notification is configured for this category/severity.
**Queue**: `notifications`
**Payload**:
```typescript
{
  tenant_id: string,
  incident_id: string,
  student_ids: string[],  // participants to notify parents for
}
```
**Logic**:
1. Load incident + participants
2. For each student participant with `parent_visible = true`:
   a. Load guardians
   b. Check guardian restrictions (STUB — full in Phase E; for now, skip restriction check)
   c. Check send-gate (if negative + severity >= threshold, must have parent_description)
   d. If blocked by send-gate: skip, keep `parent_notification_status = 'pending'`
   e. Resolve notification template (positive vs negative)
   f. Dispatch via communications module (existing multi-channel infra)
   g. Create `behaviour_parent_acknowledgements` record
   h. Update incident `parent_notification_status`
   i. If `parent_description_auto_lock_on_send`: lock the parent_description

### `behaviour:task-reminders`

**Trigger**: Cron daily 08:00 tenant TZ
**Queue**: `behaviour`
**Logic**:
1. Find tasks with `status = 'pending'` and `due_date <= today` and `reminder_sent_at IS NULL`
2. Send `behaviour_task_reminder` notification to `assigned_to_id`
3. Set `reminder_sent_at`
4. Find tasks with `status = 'pending'` and `due_date < today - 1 day` and `overdue_notified_at IS NULL`
5. Update status to `overdue`
6. Send `behaviour_task_overdue` notification
7. Set `overdue_notified_at`

---

## Permissions

Register ALL 12 permissions in the global permissions table on module initialisation:

| Key | Description | Tier |
|-----|-------------|------|
| `behaviour.log` | Create incidents, access quick-log | staff |
| `behaviour.view` | View incidents within scope | staff |
| `behaviour.manage` | Manage sanctions/interventions/tasks/appeals | staff |
| `behaviour.admin` | Configure module, admin operations | admin |
| `behaviour.view_sensitive` | View context_notes, SEND notes | staff |
| `behaviour.view_staff_analytics` | View staff logging activity | admin |
| `behaviour.ai_query` | AI narrative and NL query | staff |
| `behaviour.appeal` | Submit appeal as parent | parent |
| `safeguarding.report` | Report concerns | staff |
| `safeguarding.view` | View concerns | admin |
| `safeguarding.manage` | Manage concerns | admin |
| `safeguarding.seal` | Seal concerns | admin |

---

## Configuration

Full `tenant_settings.behaviour` JSONB as defined in the master spec section 2.5. All keys use Zod `.default()` — no backfill needed. Implementation: extend the existing `TenantSettingsSchema` in `packages/shared/`.

---

## Acceptance Criteria

- [ ] All 32 tables created via Prisma migration
- [ ] RLS policies applied and verified (cross-tenant query returns empty)
- [ ] Seed data (12 categories, ~60 templates, 4 award types) created on tenant provisioning
- [ ] All 6 sequences registered
- [ ] All 12 permissions registered
- [ ] Incident CRUD works: create, read, update, status transitions, withdraw
- [ ] Incident state machine enforced: invalid transitions return 400
- [ ] Quick-log creates incident in < 200ms (happy path)
- [ ] Idempotency: duplicate idempotency_key returns existing incident
- [ ] Participant management: add, remove, domain constraint enforced (last student participant cannot be removed)
- [ ] Context snapshot frozen at creation and never updated
- [ ] Student snapshot frozen per participant at creation
- [ ] Entity history records all incident changes
- [ ] Data classification: SENSITIVE fields stripped for non-pastoral users
- [ ] Status projection: converted_to_safeguarding shown as 'closed' to non-safeguarding users
- [ ] Scope enforcement: 'own' scope only sees own incidents, 'class' sees class students, etc.
- [ ] Parent description send-gate blocks notification for high-severity without parent_description
- [ ] Parent description locks after notification sent
- [ ] Task auto-creation on follow_up_required incident
- [ ] Task reminder worker sends notifications at 08:00 tenant TZ
- [ ] Bulk positive creates one incident per student
- [ ] Category CRUD works with benchmark mapping
- [ ] Settings page writes to tenant_settings.behaviour JSONB
- [ ] All endpoints return proper pagination `{ data, meta: { page, pageSize, total } }`
- [ ] RTL-safe frontend: all logical properties (ms-, me-, ps-, pe-, start-, end-)
- [ ] Mobile responsive: usable at 375px

## Test Requirements

### Unit Tests
- Incident service: CRUD, state machine transitions (valid + blocked), idempotency, context snapshot
- Participant service: add, remove, domain constraint, student snapshot
- Task service: auto-creation, completion, overdue detection
- Data classification: stripFieldsByClassification for all visibility levels
- Status projection: converted_to_safeguarding -> closed
- Scope enforcement: filter generation for all 5 scope levels
- Send-gate: blocked/allowed scenarios

### RLS Leakage Tests
- behaviour_incidents: Tenant A data invisible to Tenant B
- behaviour_incident_participants: same
- behaviour_categories: same
- behaviour_description_templates: same
- behaviour_entity_history: same
- behaviour_tasks: same
- behaviour_parent_acknowledgements: same

### Permission Tests
- `behaviour.log` can create but not update
- `behaviour.view` can read within scope but not manage
- `behaviour.manage` can update, transition, withdraw
- `behaviour.admin` can configure categories and settings
- `behaviour.view_sensitive` sees context_notes; without it, field is stripped

### Integration Tests
- Quick-log end-to-end: POST -> incident created -> participant created -> snapshot frozen -> history recorded -> notification queued
- Bulk positive: 5 students -> 5 incidents -> 5 history entries
- Status transition chain: draft -> active -> investigating -> resolved
- Parent notification flow: incident created -> notification queued -> acknowledgement created

---

## Files to Create

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
├── behaviour-scope.service.ts
├── dto/
│   ├── create-incident.dto.ts
│   ├── quick-log.dto.ts
│   ├── bulk-positive.dto.ts
│   ├── update-incident.dto.ts
│   ├── status-transition.dto.ts
│   ├── create-participant.dto.ts
│   ├── create-category.dto.ts
│   └── create-template.dto.ts
├── guards/
│   └── behaviour-scope.guard.ts
└── enums/
    ├── incident-status.enum.ts
    ├── data-classification.enum.ts
    └── behaviour-scope.enum.ts

packages/shared/src/behaviour/
├── data-classification.ts
├── scope.ts
├── school-calendar.ts
├── schemas/
│   ├── incident-context-snapshot.schema.ts
│   ├── student-snapshot.schema.ts
│   ├── create-incident.schema.ts
│   ├── quick-log.schema.ts
│   └── behaviour-settings.schema.ts
└── enums/
    └── index.ts

apps/web/app/(school)/behaviour/
├── page.tsx                    # Pulse dashboard (basic)
├── incidents/
│   ├── page.tsx               # Incident list
│   ├── new/page.tsx           # Create incident
│   └── [id]/page.tsx          # Incident detail
├── students/
│   ├── page.tsx               # Student overview
│   └── [studentId]/page.tsx   # Student profile
└── tasks/page.tsx             # Task inbox

apps/web/app/(school)/settings/
├── behaviour-categories/page.tsx
└── behaviour-general/page.tsx

apps/web/components/behaviour/
├── quick-log-fab.tsx
├── quick-log-sheet.tsx
├── incident-card.tsx
├── incident-status-badge.tsx
├── student-behaviour-header.tsx
└── category-picker.tsx
```
