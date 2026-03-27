# Phase SW-5A: Critical Incidents — Implementation Spec

> **Phase**: 5A of 5 (Sub-phase of Phase 5 — Critical Incident Management)
> **Name**: Critical Incident Declaration, Response Plans, and Affected Tracking
> **Description**: Structured critical incident management aligned with NEPS Critical Incident Management Team guidelines. Covers incident declaration, phased response plan templates with trackable checklists, affected student/staff tagging with controlled visibility flags, external support logging, and communication coordination integration.
> **Dependencies**: SW-1B (concerns — affected students may have existing concerns), SW-1D (cases — critical incidents may trigger new cases for affected students)
> **Status**: NOT STARTED
> **Spec source**: master-spec.md section 9 (Critical incident response)
> **This document is self-contained. No need to open the master spec during implementation.**

---

## What This Sub-Phase Delivers

1. **Critical incident declaration** — principal declares an incident with type, date, description, and scope (whole_school / year_group / class / individual), linking to specific year groups or classes when scoped
2. **Response plan management** — NEPS-aligned phased response plan (immediate / short-term / medium-term / long-term) stored as trackable JSONB checklists with assignment, completion tracking, and per-item accountability
3. **Affected student tracking** — tag students as directly or indirectly affected; affected students receive a temporary Tier 1 wellbeing flag visible to all their teachers ("be aware this student may be affected by a recent event") without disclosing the event details
4. **Affected staff tracking** — tag staff as directly or indirectly affected with support-offered tracking
5. **External support log** — record NEPS CI team visits, external counsellors, and availability schedules
6. **Communication coordination** — integration point with existing communications module for parent notification drafting and delivery
7. **Incident lifecycle** — active to monitoring to closed, with full audit trail

---

## Prerequisites

SW-1B and SW-1D must be complete and merged before starting SW-5A. The following must exist:

- `pastoral_concerns` table with full CRUD and concern creation via `ConcernService.create()`
- `pastoral_cases` table with case creation and lifecycle management via `CaseService`
- `pastoral_audit_events` table with immutable append-only semantics
- `tenant_settings.pastoral` JSONB with validated schema in `packages/shared`
- Permission guards infrastructure (existing `@RequiresPermission` and `@ModuleEnabled` decorators)
- Notification infrastructure for delivering alerts to staff members
- Student and staff lookup services available
- Year group and class lookup services available
- Communications module available for parent notification integration

---

## Tenant Settings Extension

Add the following keys to the `tenant_settings.pastoral` JSONB schema:

```typescript
// In PastoralSettingsSchema (packages/shared)
critical_incident_response_plan_template: z.object({
  immediate: z.array(z.object({
    label: z.string(),
    description: z.string().optional(),
    default_assignee_role: z.string().optional(),
  })).default([
    { label: 'Convene Critical Incident Management Team' },
    { label: 'Gather and verify facts' },
    { label: 'Contact bereaved/affected family' },
    { label: 'Designate staff room and support room' },
    { label: 'Prepare statement for staff briefing' },
    { label: 'Brief all staff before school starts' },
    { label: 'Identify high-risk students' },
    { label: 'Assign staff to support identified students' },
    { label: 'Contact NEPS for support' },
    { label: 'Prepare parent notification' },
  ]),
  short_term: z.array(z.object({
    label: z.string(),
    description: z.string().optional(),
    default_assignee_role: z.string().optional(),
  })).default([
    { label: 'Daily CI Management Team briefing' },
    { label: 'Monitor affected students' },
    { label: 'Arrange external counselling support' },
    { label: 'Coordinate media response (if applicable)' },
    { label: 'Follow up with bereaved/affected family' },
    { label: 'Monitor staff wellbeing' },
    { label: 'Review and adjust support arrangements' },
  ]),
  medium_term: z.array(z.object({
    label: z.string(),
    description: z.string().optional(),
    default_assignee_role: z.string().optional(),
  })).default([
    { label: 'Review ongoing support needs' },
    { label: 'Identify students needing continued support' },
    { label: 'Liaise with external agencies' },
    { label: 'Plan memorial/commemoration (if appropriate)' },
    { label: 'Review staff support needs' },
    { label: 'Document lessons learned' },
  ]),
  long_term: z.array(z.object({
    label: z.string(),
    description: z.string().optional(),
    default_assignee_role: z.string().optional(),
  })).default([
    { label: 'Anniversary planning' },
    { label: 'Review at 3-month mark' },
    { label: 'Review at 6-month mark' },
    { label: 'Review at 12-month mark' },
    { label: 'Update CI Management Plan based on learnings' },
  ]),
}).default({}),
```

---

## Database

### New Table: `pastoral_critical_incidents`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `incident_number` | VARCHAR(20) NOT NULL | Sequence: `CI-000001` via `SequenceService` |
| `incident_type` | VARCHAR(50) NOT NULL | `'bereavement'`, `'serious_accident'`, `'community_trauma'`, `'other'` |
| `incident_type_other` | VARCHAR(200) NULL | Required when `incident_type = 'other'` |
| `description` | TEXT NOT NULL | Rich text description of the incident |
| `incident_date` | DATE NOT NULL | Date the incident occurred |
| `declared_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | When the declaration was made in the system |
| `declared_by_id` | UUID FK NOT NULL | -> `users` — the principal or authorised declarer |
| `scope` | VARCHAR(20) NOT NULL | `'whole_school'`, `'year_group'`, `'class'`, `'individual'` |
| `scope_year_group_ids` | UUID[] NULL | Array of year group IDs when scope = `'year_group'` |
| `scope_class_ids` | UUID[] NULL | Array of class IDs when scope = `'class'` |
| `status` | VARCHAR(20) NOT NULL DEFAULT 'active' | `'active'`, `'monitoring'`, `'closed'` |
| `status_changed_at` | TIMESTAMPTZ NULL | Last status transition timestamp |
| `status_changed_by_id` | UUID FK NULL | -> `users` |
| `response_plan` | JSONB NOT NULL DEFAULT '{}' | Phased response plan with trackable checklist items |
| `external_support_log` | JSONB NOT NULL DEFAULT '[]' | Array of external support entries |
| `communication_notes` | TEXT NULL | Notes on parent/community communications sent |
| `linked_communication_ids` | UUID[] NULL | IDs of communications sent via comms module |
| `closure_notes` | TEXT NULL | Required when status = `'closed'` |
| `closed_at` | TIMESTAMPTZ NULL | |
| `academic_year_id` | UUID FK NOT NULL | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**UNIQUE**: `(tenant_id, incident_number)`

**Indexes**:
- `(tenant_id, status)` — active incidents dashboard
- `(tenant_id, incident_date DESC)` — chronological listing
- `(tenant_id, academic_year_id)` — year-scoped queries
- `(tenant_id, declared_by_id)` — audit queries

**RLS Policy**:
```sql
CREATE POLICY pastoral_critical_incidents_tenant_isolation ON pastoral_critical_incidents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**CHECK constraints**:
- `status IN ('active', 'monitoring', 'closed')`
- `scope IN ('whole_school', 'year_group', 'class', 'individual')`
- `incident_type IN ('bereavement', 'serious_accident', 'community_trauma', 'other')`
- When `incident_type = 'other'`: `incident_type_other IS NOT NULL`
- When `scope = 'year_group'`: `scope_year_group_ids IS NOT NULL AND array_length(scope_year_group_ids, 1) > 0`
- When `scope = 'class'`: `scope_class_ids IS NOT NULL AND array_length(scope_class_ids, 1) > 0`

---

### New Table: `pastoral_ci_affected_persons`

Tracks students and staff affected by a critical incident.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `critical_incident_id` | UUID FK NOT NULL | -> `pastoral_critical_incidents` |
| `person_type` | VARCHAR(10) NOT NULL | `'student'` or `'staff'` |
| `student_id` | UUID FK NULL | -> `students` — when person_type = `'student'` |
| `staff_id` | UUID FK NULL | -> `staff` — when person_type = `'staff'` |
| `impact_level` | VARCHAR(20) NOT NULL | `'directly_affected'` or `'indirectly_affected'` |
| `wellbeing_flag_active` | BOOLEAN NOT NULL DEFAULT true | For students: flag visible to their teachers |
| `wellbeing_flag_expires_at` | DATE NULL | Optional expiry date for the flag |
| `support_offered` | BOOLEAN NOT NULL DEFAULT false | Has support been offered to this person? |
| `support_offered_at` | TIMESTAMPTZ NULL | |
| `support_offered_by_id` | UUID FK NULL | -> `users` |
| `support_notes` | TEXT NULL | Details of support offered/accepted |
| `notes` | TEXT NULL | General notes about this person's involvement |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**UNIQUE**: `(critical_incident_id, person_type, student_id) WHERE student_id IS NOT NULL`
**UNIQUE**: `(critical_incident_id, person_type, staff_id) WHERE staff_id IS NOT NULL`

**Indexes**:
- `(tenant_id, critical_incident_id)` — list affected persons for an incident
- `(tenant_id, student_id) WHERE wellbeing_flag_active = true` — active student flags query
- `(tenant_id, staff_id, person_type) WHERE person_type = 'staff'` — staff affected lookup
- `(tenant_id, wellbeing_flag_expires_at) WHERE wellbeing_flag_active = true AND wellbeing_flag_expires_at IS NOT NULL` — expiry worker

**RLS Policy**:
```sql
CREATE POLICY pastoral_ci_affected_persons_tenant_isolation ON pastoral_ci_affected_persons
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**CHECK constraints**:
- `person_type IN ('student', 'staff')`
- `impact_level IN ('directly_affected', 'indirectly_affected')`
- When `person_type = 'student'`: `student_id IS NOT NULL AND staff_id IS NULL`
- When `person_type = 'staff'`: `staff_id IS NOT NULL AND student_id IS NULL`

---

### JSONB Schemas

**Response Plan Schema** (`response_plan` column on `pastoral_critical_incidents`):

```typescript
const ResponsePlanItemSchema = z.object({
  id: z.string().uuid(),                     // Generated on plan creation
  label: z.string(),
  description: z.string().nullable(),
  assigned_to_id: z.string().uuid().nullable(),
  assigned_to_name: z.string().nullable(),    // Snapshot at assignment time
  is_done: z.boolean().default(false),
  completed_at: z.string().nullable(),        // ISO timestamp
  completed_by_id: z.string().uuid().nullable(),
  completed_by_name: z.string().nullable(),   // Snapshot
  notes: z.string().nullable(),
});

const ResponsePlanSchema = z.object({
  immediate: z.array(ResponsePlanItemSchema).default([]),
  short_term: z.array(ResponsePlanItemSchema).default([]),
  medium_term: z.array(ResponsePlanItemSchema).default([]),
  long_term: z.array(ResponsePlanItemSchema).default([]),
});

export type ResponsePlanItem = z.infer<typeof ResponsePlanItemSchema>;
export type ResponsePlan = z.infer<typeof ResponsePlanSchema>;
```

**External Support Log Schema** (`external_support_log` column on `pastoral_critical_incidents`):

```typescript
const ExternalSupportEntrySchema = z.object({
  id: z.string().uuid(),
  provider_type: z.enum(['neps_ci_team', 'external_counsellor', 'other']),
  provider_name: z.string(),
  contact_person: z.string().nullable(),
  contact_details: z.string().nullable(),
  visit_date: z.string().nullable(),           // ISO date
  visit_time_start: z.string().nullable(),     // HH:mm
  visit_time_end: z.string().nullable(),       // HH:mm
  availability_notes: z.string().nullable(),   // e.g., "Available to students 10am-2pm in Room 14"
  students_seen: z.array(z.string().uuid()).default([]),  // student IDs seen during visit
  outcome_notes: z.string().nullable(),
  recorded_by_id: z.string().uuid(),
  recorded_at: z.string(),                     // ISO timestamp
});

const ExternalSupportLogSchema = z.array(ExternalSupportEntrySchema);

export type ExternalSupportEntry = z.infer<typeof ExternalSupportEntrySchema>;
```

---

## State Machine: Critical Incident Lifecycle

```
active -> monitoring      (CI Management Team determines immediate phase is complete)
active -> closed          (Incident resolved without monitoring period — rare, requires closure_notes)

monitoring -> active      (Situation re-escalates, requires reason)
monitoring -> closed      (Monitoring period complete, all support in place, requires closure_notes)

closed -> monitoring      (Re-opened — new information, anniversary reaction, requires reason)

TERMINAL: None (any status can technically transition, though closed is the expected end state)
```

Every status transition is recorded as an immutable `pastoral_audit_event` with:
- `event_type`: `'critical_incident_status_changed'`
- `payload`: `{ from_status, to_status, reason, changed_by_id, changed_by_name }`

---

## Services

### 1. `critical-incident.service.ts`

Core incident declaration, lifecycle, and response plan management.

```typescript
interface DeclareIncidentDto {
  incident_type: 'bereavement' | 'serious_accident' | 'community_trauma' | 'other';
  incident_type_other?: string;
  description: string;
  incident_date: string;        // ISO date
  scope: 'whole_school' | 'year_group' | 'class' | 'individual';
  scope_year_group_ids?: string[];
  scope_class_ids?: string[];
}

interface UpdateIncidentDto {
  description?: string;
  communication_notes?: string;
}

interface TransitionStatusDto {
  new_status: 'active' | 'monitoring' | 'closed';
  reason: string;
  closure_notes?: string;       // Required when new_status = 'closed'
}

interface UpdateResponsePlanItemDto {
  phase: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  item_id: string;
  assigned_to_id?: string;
  is_done?: boolean;
  notes?: string;
}

interface AddResponsePlanItemDto {
  phase: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  label: string;
  description?: string;
  assigned_to_id?: string;
}

class CriticalIncidentService {
  /**
   * Declare a new critical incident.
   * - Generates incident_number via SequenceService ('CI-' prefix)
   * - Validates scope: year_group requires scope_year_group_ids, class requires scope_class_ids
   * - Initialises response_plan from tenant's template (with UUIDs generated per item)
   * - Records 'critical_incident_declared' audit event
   * - Status set to 'active'
   */
  async declare(
    tx: PrismaTransaction,
    tenantId: string,
    declaredById: string,
    dto: DeclareIncidentDto,
  ): Promise<CriticalIncident>;

  /**
   * Get a critical incident by ID with full detail.
   * Includes response plan, affected persons count, external support log.
   */
  async getById(
    tx: PrismaTransaction,
    tenantId: string,
    incidentId: string,
  ): Promise<CriticalIncidentDetail>;

  /**
   * List critical incidents with filters.
   * Filterable by: status, incident_type, date range, academic_year_id.
   * Paginated.
   */
  async list(
    tx: PrismaTransaction,
    tenantId: string,
    filters: CriticalIncidentFilters,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<CriticalIncidentSummary>>;

  /**
   * Update incident description or communication notes.
   * Records 'critical_incident_updated' audit event with previous/new values.
   */
  async update(
    tx: PrismaTransaction,
    tenantId: string,
    incidentId: string,
    updatedById: string,
    dto: UpdateIncidentDto,
  ): Promise<CriticalIncident>;

  /**
   * Transition incident status.
   * Validates transition is valid per state machine.
   * closure_notes required when transitioning to 'closed'.
   * Records 'critical_incident_status_changed' audit event.
   */
  async transitionStatus(
    tx: PrismaTransaction,
    tenantId: string,
    incidentId: string,
    changedById: string,
    dto: TransitionStatusDto,
  ): Promise<CriticalIncident>;

  /**
   * Update a single response plan checklist item.
   * Sets assigned_to, marks done/undone, adds notes.
   * When marking done: records completed_at and completed_by.
   * Records 'response_plan_item_updated' audit event.
   */
  async updateResponsePlanItem(
    tx: PrismaTransaction,
    tenantId: string,
    incidentId: string,
    updatedById: string,
    dto: UpdateResponsePlanItemDto,
  ): Promise<ResponsePlan>;

  /**
   * Add a new item to a response plan phase.
   * Generates a UUID for the new item.
   * Records 'response_plan_item_added' audit event.
   */
  async addResponsePlanItem(
    tx: PrismaTransaction,
    tenantId: string,
    incidentId: string,
    addedById: string,
    dto: AddResponsePlanItemDto,
  ): Promise<ResponsePlan>;

  /**
   * Get response plan progress summary.
   * Returns per-phase counts: total items, completed items, percentage.
   */
  async getResponsePlanProgress(
    tx: PrismaTransaction,
    tenantId: string,
    incidentId: string,
  ): Promise<ResponsePlanProgress>;
}
```

---

### 2. `affected-tracking.service.ts`

Manages affected students and staff, including visibility flag logic.

```typescript
interface AddAffectedPersonDto {
  person_type: 'student' | 'staff';
  student_id?: string;
  staff_id?: string;
  impact_level: 'directly_affected' | 'indirectly_affected';
  wellbeing_flag_expires_at?: string;  // ISO date — optional expiry for student flags
  notes?: string;
}

interface UpdateAffectedPersonDto {
  impact_level?: 'directly_affected' | 'indirectly_affected';
  wellbeing_flag_active?: boolean;
  wellbeing_flag_expires_at?: string | null;
  support_offered?: boolean;
  support_notes?: string;
  notes?: string;
}

interface StudentWellbeingFlag {
  student_id: string;
  flag_message: string;   // Always: "Be aware this student may be affected by a recent event"
  since: string;          // ISO date — when the flag was created
  expires_at: string | null;
}

class AffectedTrackingService {
  /**
   * Add a person (student or staff) as affected by a critical incident.
   * - Validates person exists in tenant
   * - For students: sets wellbeing_flag_active = true
   * - Records 'affected_person_added' audit event
   * - If student: enqueues flag visibility update
   */
  async addAffectedPerson(
    tx: PrismaTransaction,
    tenantId: string,
    incidentId: string,
    addedById: string,
    dto: AddAffectedPersonDto,
  ): Promise<AffectedPerson>;

  /**
   * Bulk add affected persons (e.g., all students in a year group).
   * Accepts array of student_ids or staff_ids.
   * Skips duplicates (already-tagged persons).
   */
  async bulkAddAffected(
    tx: PrismaTransaction,
    tenantId: string,
    incidentId: string,
    addedById: string,
    persons: AddAffectedPersonDto[],
  ): Promise<{ added: number; skipped: number }>;

  /**
   * Update an affected person record.
   * Used for: changing impact level, toggling wellbeing flag,
   * recording support offered, adding notes.
   * Records 'affected_person_updated' audit event.
   */
  async updateAffectedPerson(
    tx: PrismaTransaction,
    tenantId: string,
    affectedPersonId: string,
    updatedById: string,
    dto: UpdateAffectedPersonDto,
  ): Promise<AffectedPerson>;

  /**
   * Remove an affected person from the incident.
   * Deactivates wellbeing flag if active.
   * Records 'affected_person_removed' audit event.
   */
  async removeAffectedPerson(
    tx: PrismaTransaction,
    tenantId: string,
    affectedPersonId: string,
    removedById: string,
    reason: string,
  ): Promise<void>;

  /**
   * List affected persons for a critical incident.
   * Filterable by: person_type, impact_level, support_offered.
   */
  async listAffectedPersons(
    tx: PrismaTransaction,
    tenantId: string,
    incidentId: string,
    filters: AffectedPersonFilters,
  ): Promise<AffectedPerson[]>;

  /**
   * Get active wellbeing flags for a specific student.
   * Called by the student profile/teacher view to show the flag.
   * Returns flags from ALL active/monitoring critical incidents where
   * this student is tagged and wellbeing_flag_active = true.
   * Flag message is GENERIC — does not disclose the incident.
   */
  async getStudentWellbeingFlags(
    tx: PrismaTransaction,
    tenantId: string,
    studentId: string,
  ): Promise<StudentWellbeingFlag[]>;

  /**
   * Check if a student has any active wellbeing flags.
   * Lightweight boolean check for student profile badges/indicators.
   */
  async hasActiveWellbeingFlag(
    tx: PrismaTransaction,
    tenantId: string,
    studentId: string,
  ): Promise<boolean>;

  /**
   * Record that support was offered to an affected person.
   * Sets support_offered = true, support_offered_at, support_offered_by_id.
   * Records 'support_offered' audit event.
   */
  async recordSupportOffered(
    tx: PrismaTransaction,
    tenantId: string,
    affectedPersonId: string,
    offeredById: string,
    notes: string,
  ): Promise<AffectedPerson>;

  /**
   * Get summary statistics for a critical incident.
   * Returns: total_students, total_staff, directly_affected_count,
   * indirectly_affected_count, support_offered_count, support_pending_count.
   */
  async getAffectedSummary(
    tx: PrismaTransaction,
    tenantId: string,
    incidentId: string,
  ): Promise<AffectedSummary>;
}
```

**Wellbeing flag visibility rules:**
- The flag is Tier 1: visible to ALL teachers of the affected student
- The flag message is always the generic string: "Be aware this student may be affected by a recent event"
- The flag does NOT disclose the incident type, description, date, or any details
- The flag does NOT link to the critical incident record (teachers cannot navigate to the incident from the flag)
- The flag appears on the student's profile, class roster view, and any teacher-facing student list
- Parents do NOT see the wellbeing flag

---

### 3. External Support Log (within `critical-incident.service.ts`)

External support is stored as JSONB on the `pastoral_critical_incidents` record. Management methods:

```typescript
interface AddExternalSupportDto {
  provider_type: 'neps_ci_team' | 'external_counsellor' | 'other';
  provider_name: string;
  contact_person?: string;
  contact_details?: string;
  visit_date?: string;
  visit_time_start?: string;
  visit_time_end?: string;
  availability_notes?: string;
  students_seen?: string[];
  outcome_notes?: string;
}

// Methods on CriticalIncidentService:

/**
 * Add an external support entry to the incident's log.
 * Generates UUID, records timestamp and recording user.
 * Records 'external_support_added' audit event.
 */
async addExternalSupport(
  tx: PrismaTransaction,
  tenantId: string,
  incidentId: string,
  recordedById: string,
  dto: AddExternalSupportDto,
): Promise<ExternalSupportEntry>;

/**
 * Update an external support entry.
 * Records 'external_support_updated' audit event.
 */
async updateExternalSupport(
  tx: PrismaTransaction,
  tenantId: string,
  incidentId: string,
  entryId: string,
  updatedById: string,
  dto: Partial<AddExternalSupportDto>,
): Promise<ExternalSupportEntry>;

/**
 * List external support entries for an incident.
 * Ordered by visit_date DESC, then recorded_at DESC.
 */
async listExternalSupport(
  tx: PrismaTransaction,
  tenantId: string,
  incidentId: string,
): Promise<ExternalSupportEntry[]>;
```

---

### 4. Communication Coordination (integration point)

This is an integration point, not a new service. The critical incident UI provides:

- A "Send Parent Notification" button that opens the existing communications module's compose flow, pre-filled with:
  - Recipients: parents of students in the incident's scope (year group / class / whole school)
  - Subject line template: "Important school update — {date}"
  - Body: empty (the school drafts the message — EduPod does not auto-generate incident notifications to parents)
- The communication ID is stored in `linked_communication_ids` on the critical incident record
- A "Communications Sent" section on the incident detail page listing all linked communications with their delivery status

No new communication service or endpoints are created. The frontend composes a link/redirect to the existing communications compose page with pre-populated parameters.

---

## API Endpoints

### Critical Incidents Controller: `critical-incidents.controller.ts`

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/pastoral/critical-incidents` | Declare a critical incident | `pastoral.manage_critical_incidents` |
| GET | `v1/pastoral/critical-incidents` | List incidents (paginated, filtered) | `pastoral.manage_critical_incidents` |
| GET | `v1/pastoral/critical-incidents/:id` | Get incident detail | `pastoral.manage_critical_incidents` |
| PATCH | `v1/pastoral/critical-incidents/:id` | Update incident description/notes | `pastoral.manage_critical_incidents` |
| POST | `v1/pastoral/critical-incidents/:id/status` | Transition status | `pastoral.manage_critical_incidents` |
| GET | `v1/pastoral/critical-incidents/:id/response-plan` | Get response plan with progress | `pastoral.manage_critical_incidents` |
| PATCH | `v1/pastoral/critical-incidents/:id/response-plan/items/:itemId` | Update a plan item | `pastoral.manage_critical_incidents` |
| POST | `v1/pastoral/critical-incidents/:id/response-plan/items` | Add a plan item | `pastoral.manage_critical_incidents` |
| GET | `v1/pastoral/critical-incidents/:id/affected` | List affected persons | `pastoral.manage_critical_incidents` |
| POST | `v1/pastoral/critical-incidents/:id/affected` | Add affected person | `pastoral.manage_critical_incidents` |
| POST | `v1/pastoral/critical-incidents/:id/affected/bulk` | Bulk add affected persons | `pastoral.manage_critical_incidents` |
| PATCH | `v1/pastoral/critical-incidents/:id/affected/:personId` | Update affected person | `pastoral.manage_critical_incidents` |
| DELETE | `v1/pastoral/critical-incidents/:id/affected/:personId` | Remove affected person | `pastoral.manage_critical_incidents` |
| POST | `v1/pastoral/critical-incidents/:id/affected/:personId/support` | Record support offered | `pastoral.manage_critical_incidents` |
| GET | `v1/pastoral/critical-incidents/:id/affected/summary` | Affected persons summary stats | `pastoral.manage_critical_incidents` |
| GET | `v1/pastoral/critical-incidents/:id/external-support` | List external support entries | `pastoral.manage_critical_incidents` |
| POST | `v1/pastoral/critical-incidents/:id/external-support` | Add external support entry | `pastoral.manage_critical_incidents` |
| PATCH | `v1/pastoral/critical-incidents/:id/external-support/:entryId` | Update external support entry | `pastoral.manage_critical_incidents` |

### Student Wellbeing Flag (read-only, teacher-facing)

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `v1/pastoral/students/:studentId/wellbeing-flags` | Get active wellbeing flags for a student | `pastoral.view` (Tier 1 — all teachers) |

**Total: 19 endpoints**

---

## Permissions

Register the following new permission:

| Key | Description | Tier |
|-----|-------------|------|
| `pastoral.manage_critical_incidents` | Declare, manage, and close critical incidents; manage affected persons and response plans | admin |

**Access control notes:**
- Only users with `pastoral.manage_critical_incidents` can view or manage critical incident records
- Wellbeing flags are visible to any teacher of the affected student (via `pastoral.view` which is Tier 1)
- Parents do NOT see wellbeing flags or critical incident data
- The wellbeing flag endpoint returns only the generic message, never incident details

---

## Zod Schemas (`packages/shared/src/pastoral/schemas/`)

### `critical-incident.schema.ts`

```typescript
export const declareIncidentSchema = z.object({
  incident_type: z.enum(['bereavement', 'serious_accident', 'community_trauma', 'other']),
  incident_type_other: z.string().max(200).optional(),
  description: z.string().min(10).max(5000),
  incident_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scope: z.enum(['whole_school', 'year_group', 'class', 'individual']),
  scope_year_group_ids: z.array(z.string().uuid()).optional(),
  scope_class_ids: z.array(z.string().uuid()).optional(),
}).refine(
  (data) => data.incident_type !== 'other' || (data.incident_type_other && data.incident_type_other.length > 0),
  { message: 'incident_type_other is required when incident_type is other', path: ['incident_type_other'] },
).refine(
  (data) => data.scope !== 'year_group' || (data.scope_year_group_ids && data.scope_year_group_ids.length > 0),
  { message: 'scope_year_group_ids required when scope is year_group', path: ['scope_year_group_ids'] },
).refine(
  (data) => data.scope !== 'class' || (data.scope_class_ids && data.scope_class_ids.length > 0),
  { message: 'scope_class_ids required when scope is class', path: ['scope_class_ids'] },
);

export const updateIncidentSchema = z.object({
  description: z.string().min(10).max(5000).optional(),
  communication_notes: z.string().max(5000).optional(),
});

export const transitionStatusSchema = z.object({
  new_status: z.enum(['active', 'monitoring', 'closed']),
  reason: z.string().min(5).max(1000),
  closure_notes: z.string().min(10).max(5000).optional(),
}).refine(
  (data) => data.new_status !== 'closed' || (data.closure_notes && data.closure_notes.length >= 10),
  { message: 'closure_notes required when closing an incident', path: ['closure_notes'] },
);

export const addAffectedPersonSchema = z.object({
  person_type: z.enum(['student', 'staff']),
  student_id: z.string().uuid().optional(),
  staff_id: z.string().uuid().optional(),
  impact_level: z.enum(['directly_affected', 'indirectly_affected']),
  wellbeing_flag_expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
}).refine(
  (data) => data.person_type !== 'student' || data.student_id,
  { message: 'student_id required when person_type is student', path: ['student_id'] },
).refine(
  (data) => data.person_type !== 'staff' || data.staff_id,
  { message: 'staff_id required when person_type is staff', path: ['staff_id'] },
);

export const bulkAddAffectedSchema = z.object({
  persons: z.array(addAffectedPersonSchema).min(1).max(500),
});

export const updateAffectedPersonSchema = z.object({
  impact_level: z.enum(['directly_affected', 'indirectly_affected']).optional(),
  wellbeing_flag_active: z.boolean().optional(),
  wellbeing_flag_expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  support_offered: z.boolean().optional(),
  support_notes: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});

export const recordSupportOfferedSchema = z.object({
  notes: z.string().min(5).max(2000),
});

export const updateResponsePlanItemSchema = z.object({
  phase: z.enum(['immediate', 'short_term', 'medium_term', 'long_term']),
  item_id: z.string().uuid(),
  assigned_to_id: z.string().uuid().optional(),
  is_done: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});

export const addResponsePlanItemSchema = z.object({
  phase: z.enum(['immediate', 'short_term', 'medium_term', 'long_term']),
  label: z.string().min(3).max(300),
  description: z.string().max(1000).optional(),
  assigned_to_id: z.string().uuid().optional(),
});

export const addExternalSupportSchema = z.object({
  provider_type: z.enum(['neps_ci_team', 'external_counsellor', 'other']),
  provider_name: z.string().min(2).max(200),
  contact_person: z.string().max(200).optional(),
  contact_details: z.string().max(500).optional(),
  visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  visit_time_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  visit_time_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  availability_notes: z.string().max(1000).optional(),
  students_seen: z.array(z.string().uuid()).optional(),
  outcome_notes: z.string().max(2000).optional(),
});

export type DeclareIncidentDto = z.infer<typeof declareIncidentSchema>;
export type UpdateIncidentDto = z.infer<typeof updateIncidentSchema>;
export type TransitionStatusDto = z.infer<typeof transitionStatusSchema>;
export type AddAffectedPersonDto = z.infer<typeof addAffectedPersonSchema>;
export type BulkAddAffectedDto = z.infer<typeof bulkAddAffectedSchema>;
export type UpdateAffectedPersonDto = z.infer<typeof updateAffectedPersonSchema>;
export type RecordSupportOfferedDto = z.infer<typeof recordSupportOfferedSchema>;
export type UpdateResponsePlanItemDto = z.infer<typeof updateResponsePlanItemSchema>;
export type AddResponsePlanItemDto = z.infer<typeof addResponsePlanItemSchema>;
export type AddExternalSupportDto = z.infer<typeof addExternalSupportSchema>;
```

---

## Worker Jobs

### `pastoral:wellbeing-flag-expiry`

**Trigger**: Cron daily at 00:05 tenant timezone.
**Queue**: `pastoral`
**Payload**:
```typescript
{
  tenant_id: string;
}
```
**Logic**:
1. Query `pastoral_ci_affected_persons` where `wellbeing_flag_active = true` AND `wellbeing_flag_expires_at <= today`
2. For each: set `wellbeing_flag_active = false`
3. Record `wellbeing_flag_expired` audit event per student

---

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/pastoral/critical-incidents` | List of critical incidents: status badges, type, date, scope, affected count. Filterable by status and type. |
| `/pastoral/critical-incidents/declare` | Declaration form: incident type, date, description, scope selector (whole school / year group picker / class picker / individual). |
| `/pastoral/critical-incidents/[id]` | Incident detail page with tabs: Overview, Response Plan, Affected Persons, External Support, Communications. |
| `/pastoral/critical-incidents/[id]/response-plan` | Response plan view: four collapsible phases (immediate / short-term / medium-term / long-term). Each item shows checkbox, label, assignee, completion status. Progress bar per phase. |
| `/pastoral/critical-incidents/[id]/affected` | Affected persons list: tabs for Students / Staff. Each row shows name, impact level, flag status, support status. Bulk add button for year group or class. |
| `/pastoral/critical-incidents/[id]/external-support` | External support log: chronological list of visits/contacts. Add entry form. |

**Student profile wellbeing flag display:**
- On the student profile page (existing), if the student has active wellbeing flags, display a subtle banner: "Be aware this student may be affected by a recent event"
- Banner is Tier 1 visible (all teachers see it)
- Banner does NOT link to the critical incident
- Banner displays on class roster views and teacher-facing student lists as a small icon/indicator

---

## Test Requirements

### Unit Tests

**CriticalIncidentService:**
- Declaration creates incident with correct sequence number
- Declaration validates scope constraints (year_group requires IDs, class requires IDs)
- Declaration initialises response plan from tenant template
- Declaration records 'critical_incident_declared' audit event
- `incident_type = 'other'` requires `incident_type_other`
- Status transition: active -> monitoring succeeds
- Status transition: active -> closed requires closure_notes
- Status transition: monitoring -> closed succeeds with closure_notes
- Status transition: closed -> monitoring succeeds (re-open)
- Invalid status transition: monitoring -> active -> records reason
- Status transition records audit event with from/to/reason
- Update incident records previous/new values in audit event
- Response plan item update: mark as done sets completed_at and completed_by
- Response plan item update: assign to user sets assigned_to fields
- Response plan item add: new item appears in correct phase
- Response plan progress: correct counts per phase
- External support add: entry stored in JSONB array with UUID
- External support update: entry updated in JSONB array

**AffectedTrackingService:**
- Add student as affected: creates record with wellbeing_flag_active = true
- Add staff as affected: creates record correctly
- Duplicate add (same student, same incident): returns error or skips
- Bulk add: adds multiple persons, skips duplicates, returns counts
- Update affected person: changes impact level
- Toggle wellbeing flag: deactivate/reactivate
- Record support offered: sets all support fields
- Remove affected person: deactivates wellbeing flag
- Remove records audit event with reason
- `getStudentWellbeingFlags()`: returns active flags from active/monitoring incidents
- `getStudentWellbeingFlags()`: does NOT return flags from closed incidents where flag was deactivated
- `getStudentWellbeingFlags()`: returns generic message, not incident details
- `hasActiveWellbeingFlag()`: returns true when student has active flag
- `hasActiveWellbeingFlag()`: returns false when no flags or all expired
- Affected summary: correct counts for students/staff/directly/indirectly/support

**Wellbeing Flag Visibility:**
- Teacher can see wellbeing flag for their student via `pastoral.view` permission
- Flag message is always the generic string, never incident-specific
- Flag response does NOT include incident_id, incident_type, or description
- Parent CANNOT see wellbeing flags (endpoint returns empty for parent role)
- User without `pastoral.view` gets 403 on wellbeing flags endpoint

**Wellbeing Flag Expiry Worker:**
- Expired flags are deactivated by daily job
- Non-expired flags are not affected
- Flags without expiry date are not affected
- Audit event recorded for each expired flag

### RLS Leakage Tests
- `pastoral_critical_incidents`: Tenant A incident invisible to Tenant B
- `pastoral_ci_affected_persons`: Tenant A affected persons invisible to Tenant B
- Wellbeing flags: Tenant A student flags invisible to Tenant B teacher

### Permission Tests
- User with `pastoral.manage_critical_incidents` can declare, update, transition, manage affected
- User without `pastoral.manage_critical_incidents` gets 403 on all CI endpoints
- User with `pastoral.view` can see wellbeing flags (Tier 1)
- User without `pastoral.view` cannot see wellbeing flags
- Parent role gets empty result on wellbeing flags endpoint

### Integration Tests
- End-to-end: declare incident -> add affected students -> teachers see wellbeing flag on student profile
- End-to-end: declare incident -> complete response plan items -> transition to monitoring -> transition to closed
- End-to-end: add affected student with expiry -> daily job expires flag -> flag no longer visible
- Bulk add: scope to year group -> bulk add all students in year group -> all have active flags
- External support: add NEPS visit -> list shows visit -> update with outcome

---

## Verification Checklist

- [ ] Critical incident declaration generates correct sequence number (CI-XXXXXX)
- [ ] Scope validation enforced: year_group requires IDs, class requires IDs
- [ ] Response plan initialised from tenant template on declaration
- [ ] Response plan items are individually trackable (assign, complete, notes)
- [ ] Custom items can be added to any response plan phase
- [ ] Status transitions follow state machine (active/monitoring/closed)
- [ ] Closure requires closure_notes
- [ ] Re-opening (closed -> monitoring) requires reason
- [ ] Affected students get wellbeing flag visible to all their teachers
- [ ] Wellbeing flag message is ALWAYS generic — never discloses incident details
- [ ] Wellbeing flag does NOT link to the critical incident
- [ ] Parents cannot see wellbeing flags
- [ ] Affected staff can be tagged and support tracked
- [ ] Bulk add works for year groups and classes
- [ ] External support log stores NEPS visits, counsellors, availability
- [ ] Communication coordination links to existing comms module
- [ ] Every mutation records immutable audit event
- [ ] Wellbeing flag expiry worker deactivates expired flags daily
- [ ] All endpoints return proper pagination `{ data, meta: { page, pageSize, total } }`
- [ ] RTL-safe frontend: all logical properties (ms-, me-, ps-, pe-, start-, end-)
- [ ] Mobile responsive: usable at 375px
- [ ] RLS leakage test passes (cross-tenant isolation)
- [ ] Regression suite passes (`turbo test`)

---

## Files to Create

```
apps/api/src/modules/pastoral/critical-incidents/
├── critical-incident.module.ts
├── critical-incident.service.ts
├── affected-tracking.service.ts
├── critical-incidents.controller.ts
├── critical-incident.service.spec.ts
└── affected-tracking.service.spec.ts

packages/shared/src/pastoral/
└── schemas/
    └── critical-incident.schema.ts

apps/web/src/app/[locale]/(school)/pastoral/
└── critical-incidents/
    ├── page.tsx                                  # Incident list
    ├── declare/page.tsx                          # Declaration form
    └── [id]/
        ├── page.tsx                              # Incident detail (overview tab)
        ├── response-plan/page.tsx                # Response plan management
        ├── affected/page.tsx                     # Affected persons management
        └── external-support/page.tsx             # External support log

apps/web/src/components/pastoral/
├── critical-incident-card.tsx
├── critical-incident-status-badge.tsx
├── response-plan-checklist.tsx
├── response-plan-progress.tsx
├── affected-persons-table.tsx
├── affected-bulk-add-dialog.tsx
├── external-support-form.tsx
├── external-support-list.tsx
└── wellbeing-flag-banner.tsx

apps/worker/src/processors/pastoral/
└── wellbeing-flag-expiry.processor.ts
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/prisma/schema.prisma` | Add `pastoral_critical_incidents` and `pastoral_ci_affected_persons` tables |
| `packages/prisma/migrations/` | New migration for critical incident tables |
| `packages/shared/src/pastoral/schemas/index.ts` | Export critical incident schemas |
| `packages/prisma/seed/permissions.ts` | Add `pastoral.manage_critical_incidents` |
| `packages/prisma/seed/sequences.ts` | Add `CI-` sequence prefix |
| `apps/api/src/modules/pastoral/pastoral.module.ts` | Import `CriticalIncidentModule` |
| `apps/worker/src/worker.module.ts` | Register `pastoral:wellbeing-flag-expiry` processor |
| Tenant settings schema (`packages/shared`) | Add `critical_incident_response_plan_template` to `PastoralSettingsSchema` |
| Student profile component (existing) | Add wellbeing flag banner display |
| Class roster component (existing) | Add wellbeing flag indicator icon |
