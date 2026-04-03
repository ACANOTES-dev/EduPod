# Phase 4B Implementation Plan — Auto-Scheduling

---

## Section 1 — Overview

Phase 4B adds intelligent timetable generation to the existing manual scheduling system built in Phase 4A. It delivers: a period grid configuration system, class scheduling requirements, teacher availability and preference management, a CSP (Constraint Satisfaction Problem) solver engine, solver execution infrastructure via BullMQ, a proposed timetable review screen with drag-and-drop adjustments, an apply/discard workflow, and a scheduling dashboard with workload analytics.

The solver is a pure TypeScript module (`packages/shared/src/scheduler/`) with zero database dependencies — it takes typed input, returns typed output. The BullMQ worker handles all DB I/O. Three operating modes are supported: **manual** (existing from P4A — unchanged), **auto** (solver generates a complete timetable), and **hybrid** (admin pins entries, solver fills the rest).

All auto-scheduling UI is conditionally visible based on `tenant_settings.scheduling.autoSchedulerEnabled`.

### Dependencies on Prior Phases

| Phase     | What's Used                                                                                                                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0–P1** | Auth, RBAC, permissions (all 11 scheduling permissions already seeded), tenant settings, approval workflows                                                                                                                                                           |
| **P2**    | `classes`, `class_staff`, `class_enrolments`, `staff_profiles`, `subjects` (with `subject_type`), `academic_years`, `year_groups`                                                                                                                                     |
| **P4A**   | `rooms` (with `room_type`, `is_exclusive`, `capacity`), `schedules` (with `is_pinned`, `source`, `scheduling_run_id`, `schedule_period_template_id`, `period_order`), `attendance_sessions`, conflict detection service, timetable grid component, workload reporting |

### Key Prior-Phase Services/Modules Imported or Extended

- `apps/api/src/modules/schedules/` — Extended with pin/unpin endpoints; `SchedulesService` used for apply flow queries
- `apps/api/src/modules/schedules/conflict-detection.service.ts` — Referenced pattern for constraint validation
- `apps/api/src/common/middleware/rls.middleware.ts` — `createRlsClient()` used in all new services
- `apps/worker/src/base/tenant-aware-job.ts` — `TenantAwareJob` base class for solver worker
- `apps/worker/src/base/queue.constants.ts` — Extended with `SCHEDULING` queue
- `packages/shared/src/schemas/tenant.schema.ts` — `tenantSettingsSchema.scheduling` already has all needed fields (`autoSchedulerEnabled`, `maxSolverDurationSeconds`, `preferenceWeights`, `globalSoftWeights`)
- `packages/shared/src/constants/permissions.ts` — All 11 permissions already defined and tier-mapped
- `apps/web/src/components/timetable-grid.tsx` — Extended/adapted for proposed timetable review

---

## Section 2 — Database Changes

### 2.1 New Enums

#### `SchedulePeriodType`

```prisma
enum SchedulePeriodType {
  teaching
  break_supervision
  assembly
  lunch_duty
  free
}
```

#### `SpreadPreference`

```prisma
enum SpreadPreference {
  spread_evenly
  cluster
  no_preference
}
```

#### `SchedulingPreferenceType`

```prisma
enum SchedulingPreferenceType {
  subject
  class_pref
  time_slot
}
```

> Note: `class_pref` instead of `class` to avoid PostgreSQL keyword collision. The API layer maps this transparently.

#### `SchedulingPreferencePriority`

```prisma
enum SchedulingPreferencePriority {
  low
  medium
  high
}
```

#### `SchedulingRunMode`

```prisma
enum SchedulingRunMode {
  auto
  hybrid
}
```

#### `SchedulingRunStatus`

```prisma
enum SchedulingRunStatus {
  queued
  running
  completed
  failed
  applied
  discarded
}
```

---

### 2.2 New Table: `schedule_period_templates`

Defines the school's time grid — named periods per weekday that classes can be placed into.

```prisma
model SchedulePeriodTemplate {
  id                   String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id            String             @db.Uuid
  academic_year_id     String             @db.Uuid
  weekday              Int                @db.SmallInt  // 0-6, 0=Monday
  period_name          String             @db.VarChar(50)
  period_name_ar       String?            @db.VarChar(50)
  period_order         Int                @db.SmallInt
  start_time           DateTime           @db.Time
  end_time             DateTime           @db.Time
  schedule_period_type SchedulePeriodType @default(teaching)
  created_at           DateTime           @default(now()) @db.Timestamptz()
  updated_at           DateTime           @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant        Tenant       @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  academic_year AcademicYear @relation(fields: [academic_year_id], references: [id], onDelete: Cascade)
  schedules     Schedule[]

  @@unique([tenant_id, academic_year_id, weekday, period_order], name: "idx_schedule_period_templates_order")
  @@unique([tenant_id, academic_year_id, weekday, start_time], name: "idx_schedule_period_templates_time")
  @@index([tenant_id, academic_year_id], name: "idx_schedule_period_templates_tenant_year")
  @@map("schedule_period_templates")
}
```

**Constraints (in `post_migrate.sql`)**:

- `CHECK (weekday >= 0 AND weekday <= 6)`
- `CHECK (end_time > start_time)`
- Time-range exclusion constraint (requires custom `timerange` type):

  ```sql
  DO $$ BEGIN
    CREATE TYPE timerange AS RANGE (subtype = time);
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  ALTER TABLE schedule_period_templates
    ADD CONSTRAINT schedule_period_templates_no_time_overlap
    EXCLUDE USING gist (
      tenant_id WITH =,
      academic_year_id WITH =,
      weekday WITH =,
      timerange(start_time, end_time) WITH &&
    );
  ```

**RLS Policy**: Standard tenant isolation.
**`set_updated_at()` trigger**: Yes — has `updated_at`.
**Seed data**: 7 periods/day for Mon–Fri (35 teaching periods + 2 breaks) per dev tenant.

---

### 2.3 New Table: `class_scheduling_requirements`

Defines how many periods per week each class needs and scheduling preferences for the solver.

```prisma
model ClassSchedulingRequirement {
  id                       String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                String           @db.Uuid
  class_id                 String           @db.Uuid
  academic_year_id         String           @db.Uuid
  periods_per_week         Int              @db.SmallInt  // >= 1
  required_room_type       RoomType?                       // NULL = any classroom
  preferred_room_id        String?          @db.Uuid
  max_consecutive_periods  Int              @db.SmallInt  // default 2
  min_consecutive_periods  Int              @db.SmallInt  // default 1
  spread_preference        SpreadPreference @default(spread_evenly)
  student_count            Int?                            // cached from enrolments
  created_at               DateTime         @default(now()) @db.Timestamptz()
  updated_at               DateTime         @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant        Tenant       @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  class_entity  Class        @relation(fields: [class_id], references: [id], onDelete: Cascade)
  academic_year AcademicYear @relation(fields: [academic_year_id], references: [id], onDelete: Cascade)
  preferred_room Room?       @relation(fields: [preferred_room_id], references: [id], onDelete: SetNull)

  @@unique([tenant_id, class_id, academic_year_id], name: "idx_class_sched_req_unique")
  @@index([tenant_id, academic_year_id], name: "idx_class_sched_req_tenant_year")
  @@map("class_scheduling_requirements")
}
```

**Constraints (in `post_migrate.sql`)**:

- `CHECK (periods_per_week >= 1)`
- `CHECK (max_consecutive_periods >= 1)`
- `CHECK (min_consecutive_periods >= 1)`
- `CHECK (min_consecutive_periods <= max_consecutive_periods)`

**Defaults**: `periods_per_week = 5`, `max_consecutive_periods = 2`, `min_consecutive_periods = 1`, `spread_preference = spread_evenly`.

**RLS Policy**: Standard tenant isolation.
**`set_updated_at()` trigger**: Yes.
**Seed data**: Requirements for each dev class (varied periods_per_week).

---

### 2.4 New Table: `staff_availability`

Defines when a teacher is available. Hard constraint — solver cannot schedule outside availability.

```prisma
model StaffAvailability {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id        String   @db.Uuid
  staff_profile_id String   @db.Uuid
  academic_year_id String   @db.Uuid
  weekday          Int      @db.SmallInt  // 0-6
  available_from   DateTime @db.Time
  available_to     DateTime @db.Time
  created_at       DateTime @default(now()) @db.Timestamptz()
  updated_at       DateTime @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant        Tenant       @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  staff_profile StaffProfile @relation(fields: [staff_profile_id], references: [id], onDelete: Cascade)
  academic_year AcademicYear @relation(fields: [academic_year_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, staff_profile_id, academic_year_id, weekday], name: "idx_staff_availability_unique")
  @@index([tenant_id, academic_year_id], name: "idx_staff_availability_tenant_year")
  @@map("staff_availability")
}
```

**Constraints (in `post_migrate.sql`)**:

- `CHECK (weekday >= 0 AND weekday <= 6)`
- `CHECK (available_to > available_from)`

**Default behaviour**: No rows = fully available all days. Once any row is created for a teacher/year, only configured days are available — others are blocked. Explicit-opt-in model.

**"Covers" semantics**: Teacher available for a period iff `available_from <= period.start_time AND available_to >= period.end_time` (strict containment).

**V1 limitation**: One window per teacher per day (enforced by unique constraint).

**RLS Policy**: Standard tenant isolation.
**`set_updated_at()` trigger**: Yes.
**Seed data**: Availability for a subset of dev teachers (e.g., 2 teachers with restricted days).

---

### 2.5 New Table: `staff_scheduling_preferences`

Soft constraints. Solver tries to honour but no guarantees.

```prisma
model StaffSchedulingPreference {
  id                 String                       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id          String                       @db.Uuid
  staff_profile_id   String                       @db.Uuid
  academic_year_id   String                       @db.Uuid
  preference_type    SchedulingPreferenceType
  preference_payload Json                          @db.JsonB
  priority           SchedulingPreferencePriority  @default(medium)
  created_at         DateTime                     @default(now()) @db.Timestamptz()
  updated_at         DateTime                     @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant        Tenant       @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  staff_profile StaffProfile @relation(fields: [staff_profile_id], references: [id], onDelete: Cascade)
  academic_year AcademicYear @relation(fields: [academic_year_id], references: [id], onDelete: Cascade)

  @@index([tenant_id, staff_profile_id, academic_year_id], name: "idx_staff_sched_prefs_tenant_staff")
  @@index([tenant_id, academic_year_id], name: "idx_staff_sched_prefs_tenant_year")
  @@map("staff_scheduling_preferences")
}
```

**Constraints (in `post_migrate.sql`)**:

- Duplicate prevention via unique index on MD5 hash:
  ```sql
  CREATE UNIQUE INDEX idx_staff_sched_prefs_unique
    ON staff_scheduling_preferences(
      tenant_id, staff_profile_id, academic_year_id,
      preference_type, md5(preference_payload::text)
    );
  ```

**`preference_payload` schemas** (Zod-validated at API layer):

```typescript
// subject — teacher prefers/avoids certain subjects
{ type: 'subject', subject_ids: string[], mode: 'prefer' | 'avoid' }

// class_pref — teacher prefers/avoids certain classes
{ type: 'class_pref', class_ids: string[], mode: 'prefer' | 'avoid' }

// time_slot — teacher prefers/avoids certain times
{ type: 'time_slot', weekday: number | null, preferred_period_orders: number[], mode: 'prefer' | 'avoid' }
```

**Priority weighting**: `high` = 3×, `medium` = 2×, `low` = 1× — configurable via `tenant_settings.scheduling.preferenceWeights`.

**RLS Policy**: Standard tenant isolation.
**`set_updated_at()` trigger**: Yes.
**Seed data**: 2-3 preferences for dev teachers.

---

### 2.6 New Table: `scheduling_runs`

Records each solver execution for audit, comparison, and rollback.

```prisma
model SchedulingRun {
  id                        String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                 String              @db.Uuid
  academic_year_id          String              @db.Uuid
  mode                      SchedulingRunMode
  status                    SchedulingRunStatus
  config_snapshot           Json?               @db.JsonB
  result_json               Json?               @db.JsonB
  proposed_adjustments      Json?               @db.JsonB
  hard_constraint_violations Int                @default(0)
  soft_preference_score     Decimal?            @db.Decimal(8, 2)
  soft_preference_max       Decimal?            @db.Decimal(8, 2)
  entries_generated         Int                 @default(0)
  entries_pinned            Int                 @default(0)
  entries_unassigned        Int                 @default(0)
  solver_duration_ms        Int?
  solver_seed               BigInt?
  failure_reason            String?             @db.Text
  created_by_user_id        String              @db.Uuid
  applied_by_user_id        String?             @db.Uuid
  applied_at                DateTime?           @db.Timestamptz()
  created_at                DateTime            @default(now()) @db.Timestamptz()
  updated_at                DateTime            @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant        Tenant       @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  academic_year AcademicYear @relation(fields: [academic_year_id], references: [id], onDelete: Cascade)
  created_by    User         @relation("scheduling_run_created_by", fields: [created_by_user_id], references: [id])
  applied_by    User?        @relation("scheduling_run_applied_by", fields: [applied_by_user_id], references: [id])
  schedules     Schedule[]

  @@index([tenant_id, academic_year_id, status], name: "idx_scheduling_runs_tenant_year")
  @@map("scheduling_runs")
}
```

**Constraints (in `post_migrate.sql`)**:

- Partial unique index — one active run per tenant per year:
  ```sql
  CREATE UNIQUE INDEX idx_scheduling_runs_active
    ON scheduling_runs(tenant_id, academic_year_id)
    WHERE status IN ('queued', 'running');
  ```

**Status transitions** (enforced in service layer):

```
queued → running        (worker picks up)
running → completed     (solver finishes successfully)
running → failed        (solver errors/times out/cancelled)
completed → applied     (admin applies proposed timetable)
completed → discarded   (admin discards)
applied → TERMINAL
failed → TERMINAL
discarded → TERMINAL
```

**Optimistic concurrency**: `updated_at` used via `expected_updated_at` parameter on status transitions.

**JSONB size note**: `config_snapshot` and `result_json` can reach 500KB–1MB for large schools. List queries MUST exclude these columns (`select` only non-JSONB fields). Full JSONB loaded only on detail view.

**Stale run reaper**: Daily job transitions runs stuck in `running` for longer than `maxSolverDurationSeconds × 2` to `failed`.

**RLS Policy**: Standard tenant isolation.
**`set_updated_at()` trigger**: Yes.

---

### 2.7 Modified Table: `schedules`

Add Prisma relations to the two new tables. The columns `schedule_period_template_id` and `scheduling_run_id` already exist (created in P4A with comment `// FK to P4B table — no relation yet`).

**Changes to Prisma schema**:

```prisma
// Add these relations to the existing Schedule model:
schedule_period_template SchedulePeriodTemplate? @relation(fields: [schedule_period_template_id], references: [id], onDelete: SetNull)
scheduling_run           SchedulingRun?          @relation(fields: [scheduling_run_id], references: [id], onDelete: SetNull)
```

**Changes to migration SQL**: Add FK constraints:

```sql
ALTER TABLE schedules
  ADD CONSTRAINT fk_schedules_period_template
  FOREIGN KEY (schedule_period_template_id) REFERENCES schedule_period_templates(id)
  ON DELETE SET NULL;

ALTER TABLE schedules
  ADD CONSTRAINT fk_schedules_scheduling_run
  FOREIGN KEY (scheduling_run_id) REFERENCES scheduling_runs(id)
  ON DELETE SET NULL;
```

**Additional indexes** (in `post_migrate.sql`):

```sql
CREATE INDEX IF NOT EXISTS idx_schedules_pinned
  ON schedules(tenant_id, academic_year_id, is_pinned)
  WHERE is_pinned = true;

CREATE INDEX IF NOT EXISTS idx_schedules_auto_generated
  ON schedules(tenant_id, academic_year_id, source)
  WHERE source = 'auto_generated';

CREATE INDEX IF NOT EXISTS idx_schedules_run
  ON schedules(scheduling_run_id)
  WHERE scheduling_run_id IS NOT NULL;
```

> Note: These indexes are specified in P4A's spec but may not have been created since the referenced tables didn't exist. If they already exist (check before applying), use `IF NOT EXISTS`.

---

### 2.8 RLS Policies Summary

All 5 new tables get the standard tenant isolation policy in `post_migrate.sql`:

```sql
-- For each table: schedule_period_templates, class_scheduling_requirements,
-- staff_availability, staff_scheduling_preferences, scheduling_runs
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS {table}_tenant_isolation ON {table};
CREATE POLICY {table}_tenant_isolation ON {table}
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### 2.9 Triggers Summary

All 5 new tables get the `set_updated_at()` trigger (all have `updated_at`):

```sql
CREATE TRIGGER set_updated_at BEFORE UPDATE ON {table}
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## Section 3 — API Endpoints

All endpoints are prefixed with `/api/v1/`. All require authentication. Tenant context resolved from hostname.

### 3.1 Period Grid — `PeriodGridController`

#### `GET /v1/period-grid`

- **Permission**: `schedule.configure_period_grid`
- **Query**: `{ academic_year_id: uuid (required) }`
- **Response**: `{ data: SchedulePeriodTemplate[] }` — grouped by weekday, ordered by period_order
- **Service method**: `PeriodGridService.findAll(tenantId, academicYearId)`

#### `POST /v1/period-grid`

- **Permission**: `schedule.configure_period_grid`
- **Request schema**:
  ```typescript
  createPeriodTemplateSchema = z.object({
    academic_year_id: z.string().uuid(),
    weekday: z.number().int().min(0).max(6),
    period_name: z.string().min(1).max(50),
    period_name_ar: z.string().max(50).nullable().optional(),
    period_order: z.number().int().min(0),
    start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    schedule_period_type: z
      .enum(['teaching', 'break_supervision', 'assembly', 'lunch_duty', 'free'])
      .default('teaching'),
  });
  ```
- **Response**: Created `SchedulePeriodTemplate`
- **Error cases**:
  - `SCHEDULER_PERIOD_GRID_OVERLAP` — overlapping times on same day (409)
  - `SCHEDULER_PERIOD_GRID_INVALID_TIME` — end_time ≤ start_time (400)
  - P2002 unique constraint on (tenant, year, weekday, period_order) or (tenant, year, weekday, start_time) (409)
- **Service method**: `PeriodGridService.create(tenantId, dto)`

#### `PATCH /v1/period-grid/:id`

- **Permission**: `schedule.configure_period_grid`
- **Request schema**: All fields from create schema optional (partial update)
- **Response**: Updated `SchedulePeriodTemplate`
- **Error cases**: Same as create + `NOT_FOUND` (404)
- **Service method**: `PeriodGridService.update(tenantId, id, dto)`

#### `DELETE /v1/period-grid/:id`

- **Permission**: `schedule.configure_period_grid`
- **Response**: `{ success: true }`
- **Error cases**: `NOT_FOUND` (404)
- **Service method**: `PeriodGridService.delete(tenantId, id)`

#### `POST /v1/period-grid/copy-day`

- **Permission**: `schedule.configure_period_grid`
- **Request schema**:
  ```typescript
  copyDaySchema = z.object({
    academic_year_id: z.string().uuid(),
    source_weekday: z.number().int().min(0).max(6),
    target_weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  });
  ```
- **Response**: `{ data: SchedulePeriodTemplate[], meta: { created: number, skipped: number } }`
- **Logic**: Copies all periods from source day to each target day. Skips if period_order already exists on target day. Uses single transaction.
- **Service method**: `PeriodGridService.copyDay(tenantId, dto)`

---

### 3.2 Class Scheduling Requirements — `ClassRequirementsController`

#### `GET /v1/class-scheduling-requirements`

- **Permission**: `schedule.configure_requirements`
- **Query**: `{ academic_year_id: uuid (required), page?: number, pageSize?: number }`
- **Response**: `{ data: ClassSchedulingRequirement[], meta: { page, pageSize, total, configured: number, unconfigured: number } }`
  - Includes join to `classes` for name, subject, teachers (from `class_staff`)
  - `meta.configured` = count of classes with requirements
  - `meta.unconfigured` = count of active classes without requirements
- **Service method**: `ClassRequirementsService.findAll(tenantId, academicYearId, pagination)`

#### `POST /v1/class-scheduling-requirements`

- **Permission**: `schedule.configure_requirements`
- **Request schema**:
  ```typescript
  createClassRequirementSchema = z
    .object({
      class_id: z.string().uuid(),
      academic_year_id: z.string().uuid(),
      periods_per_week: z.number().int().min(1).default(5),
      required_room_type: z.nativeEnum(RoomType).nullable().optional(),
      preferred_room_id: z.string().uuid().nullable().optional(),
      max_consecutive_periods: z.number().int().min(1).default(2),
      min_consecutive_periods: z.number().int().min(1).default(1),
      spread_preference: z
        .enum(['spread_evenly', 'cluster', 'no_preference'])
        .default('spread_evenly'),
      student_count: z.number().int().nullable().optional(),
    })
    .refine((d) => d.min_consecutive_periods <= d.max_consecutive_periods, {
      message: 'min_consecutive_periods must be <= max_consecutive_periods',
    });
  ```
- **Response**: Created `ClassSchedulingRequirement`
- **Error cases**: Duplicate `(tenant, class, year)` (409), class not found (404), room not found (404)
- **Service method**: `ClassRequirementsService.create(tenantId, dto)`

#### `PATCH /v1/class-scheduling-requirements/:id`

- **Permission**: `schedule.configure_requirements`
- **Request schema**: All fields optional (partial update), same refinement applies
- **Response**: Updated `ClassSchedulingRequirement`
- **Service method**: `ClassRequirementsService.update(tenantId, id, dto)`

#### `DELETE /v1/class-scheduling-requirements/:id`

- **Permission**: `schedule.configure_requirements`
- **Response**: `{ success: true }`
- **Service method**: `ClassRequirementsService.delete(tenantId, id)`

#### `POST /v1/class-scheduling-requirements/bulk`

- **Permission**: `schedule.configure_requirements`
- **Request schema**:
  ```typescript
  bulkClassRequirementsSchema = z.object({
    academic_year_id: z.string().uuid(),
    requirements: z
      .array(
        z.object({
          class_id: z.string().uuid(),
          periods_per_week: z.number().int().min(1).default(5),
          required_room_type: z.nativeEnum(RoomType).nullable().optional(),
          preferred_room_id: z.string().uuid().nullable().optional(),
          max_consecutive_periods: z.number().int().min(1).default(2),
          min_consecutive_periods: z.number().int().min(1).default(1),
          spread_preference: z
            .enum(['spread_evenly', 'cluster', 'no_preference'])
            .default('spread_evenly'),
          student_count: z.number().int().nullable().optional(),
        }),
      )
      .min(1),
  });
  ```
- **Response**: `{ data: ClassSchedulingRequirement[], meta: { created: number, updated: number } }`
- **Logic**: Upsert — creates new, updates existing. Single transaction. Validates min <= max for each entry.
- **Service method**: `ClassRequirementsService.bulkUpsert(tenantId, dto)`

---

### 3.3 Staff Availability — `StaffAvailabilityController`

#### `GET /v1/staff-availability`

- **Permission**: `schedule.configure_availability`
- **Query**: `{ academic_year_id: uuid (required), staff_profile_id?: uuid }`
- **Response**: `{ data: StaffAvailability[] }` — includes staff name join
- **Service method**: `StaffAvailabilityService.findAll(tenantId, academicYearId, staffProfileId?)`

#### `PUT /v1/staff-availability/staff/:staffProfileId/year/:academicYearId`

- **Permission**: `schedule.configure_availability`
- **Request schema**:
  ```typescript
  replaceAvailabilitySchema = z
    .object({
      entries: z
        .array(
          z.object({
            weekday: z.number().int().min(0).max(6),
            available_from: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
            available_to: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          }),
        )
        .max(7),
    })
    .refine(
      (d) => {
        const weekdays = d.entries.map((e) => e.weekday);
        return new Set(weekdays).size === weekdays.length;
      },
      { message: 'Duplicate weekdays not allowed' },
    );
  ```
- **Response**: `{ data: StaffAvailability[] }`
- **Logic**: Atomic replace — deletes all existing availability for (staff, year), inserts new entries. Empty `entries` array = delete all (fully available). Uses single RLS transaction.
- **Error cases**: Staff not found (404), `available_to <= available_from` (400)
- **Service method**: `StaffAvailabilityService.replaceForStaff(tenantId, staffProfileId, academicYearId, entries)`

#### `DELETE /v1/staff-availability/:id`

- **Permission**: `schedule.configure_availability`
- **Response**: `{ success: true }`
- **Service method**: `StaffAvailabilityService.delete(tenantId, id)`

---

### 3.4 Staff Scheduling Preferences — `StaffPreferencesController`

#### `GET /v1/staff-scheduling-preferences`

- **Permission**: `schedule.manage_preferences`
- **Query**: `{ academic_year_id: uuid (required), staff_profile_id?: uuid }`
- **Response**: `{ data: StaffSchedulingPreference[] }` — includes staff name join
- **Service method**: `StaffPreferencesService.findAll(tenantId, academicYearId, staffProfileId?)`

#### `GET /v1/staff-scheduling-preferences/own`

- **Permission**: `schedule.manage_own_preferences`
- **Query**: `{ academic_year_id: uuid (required) }`
- **Response**: `{ data: StaffSchedulingPreference[] }` — only the calling teacher's preferences
- **Logic**: Resolves `staff_profile_id` from the authenticated user's membership → staff profile link
- **Service method**: `StaffPreferencesService.findOwnPreferences(tenantId, userId, academicYearId)`

#### `POST /v1/staff-scheduling-preferences`

- **Permission**: `schedule.manage_preferences` (admin) OR `schedule.manage_own_preferences` (own only)
- **Request schema**:

  ```typescript
  const preferencePayloadSchema = z.discriminatedUnion('type', [
    z.object({
      type: z.literal('subject'),
      subject_ids: z.array(z.string().uuid()).min(1),
      mode: z.enum(['prefer', 'avoid']),
    }),
    z.object({
      type: z.literal('class_pref'),
      class_ids: z.array(z.string().uuid()).min(1),
      mode: z.enum(['prefer', 'avoid']),
    }),
    z.object({
      type: z.literal('time_slot'),
      weekday: z.number().int().min(0).max(6).nullable(),
      preferred_period_orders: z.array(z.number().int().min(0)).min(1),
      mode: z.enum(['prefer', 'avoid']),
    }),
  ]);

  createStaffPreferenceSchema = z.object({
    staff_profile_id: z.string().uuid(),
    academic_year_id: z.string().uuid(),
    preference_payload: preferencePayloadSchema,
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
  });
  ```

- **Response**: Created `StaffSchedulingPreference`
- **Validation**: `preference_type` is derived from `preference_payload.type`. Check for conflicting preferences (prefer X AND avoid X simultaneously → 400 with `SCHEDULER_PREFERENCE_CONFLICT`).
- **Error cases**: Duplicate preference (409), staff not found (404), self-service user trying to set for another teacher (403)
- **Service method**: `StaffPreferencesService.create(tenantId, userId, dto)`

#### `PATCH /v1/staff-scheduling-preferences/:id`

- **Permission**: `schedule.manage_preferences` OR `schedule.manage_own_preferences` (own only)
- **Request schema**: `priority` and `preference_payload` optional
- **Response**: Updated `StaffSchedulingPreference`
- **Service method**: `StaffPreferencesService.update(tenantId, userId, id, dto)`

#### `DELETE /v1/staff-scheduling-preferences/:id`

- **Permission**: `schedule.manage_preferences` OR `schedule.manage_own_preferences` (own only)
- **Response**: `{ success: true }`
- **Service method**: `StaffPreferencesService.delete(tenantId, userId, id)`

---

### 3.5 Scheduling Runs — `SchedulingRunsController`

#### `GET /v1/scheduling-runs/prerequisites`

- **Permission**: `schedule.run_auto`
- **Query**: `{ academic_year_id: uuid (required) }`
- **Response**:
  ```typescript
  {
    data: {
      ready: boolean,
      checks: Array<{
        key: string,          // e.g., 'period_grid_exists'
        passed: boolean,
        message: string,
        message_ar?: string,
        details?: unknown,    // e.g., list of unconfigured classes
      }>
    }
  }
  ```
- **Checks performed**:
  1. Period grid exists (at least 1 `teaching` period on 1 day)
  2. All active academic classes have scheduling requirements
  3. All academic classes have at least one assigned teacher (`class_staff` with `assignment_role` in `['teacher', 'homeroom']`)
  4. No pinned entry conflicts (teacher/room double-booking between pinned entries)
  5. No pinned entries violating teacher availability
  6. All referenced classes still `active`
- **Service method**: `SchedulingPrerequisitesService.check(tenantId, academicYearId)`

#### `POST /v1/scheduling-runs`

- **Permission**: `schedule.run_auto`
- **Request schema**:
  ```typescript
  createSchedulingRunSchema = z.object({
    academic_year_id: z.string().uuid(),
    solver_seed: z.number().int().nullable().optional(),
  });
  ```
- **Response**: Created `SchedulingRun` (status = `queued`)
- **Logic**:
  1. Run prerequisites check — if not ready, return `SCHEDULER_PREREQUISITES_INCOMPLETE` (400)
  2. Check no active run exists — if exists, return `SCHEDULER_RUN_ACTIVE` (409) with `details.existing_run_id`
  3. Auto-detect mode: pinned entries exist for this year → `hybrid`, otherwise → `auto`
  4. Create `scheduling_runs` row with status `queued`
  5. Enqueue BullMQ job `scheduling:solve` with `{ tenant_id, run_id }`
  6. Return created run
- **Service method**: `SchedulingRunsService.create(tenantId, userId, dto)`

#### `GET /v1/scheduling-runs`

- **Permission**: `schedule.view_auto_reports`
- **Query**: `{ academic_year_id: uuid (required), page?: number, pageSize?: number }`
- **Response**: `{ data: SchedulingRunListItem[], meta: { page, pageSize, total } }`
  - **MUST exclude** `config_snapshot`, `result_json`, `proposed_adjustments` from the query (large JSONB fields). Returns only scalar fields + created_by user name.
- **Service method**: `SchedulingRunsService.findAll(tenantId, academicYearId, pagination)`

#### `GET /v1/scheduling-runs/:id`

- **Permission**: `schedule.view_auto_reports`
- **Response**: Full `SchedulingRun` including `result_json` and `proposed_adjustments`
  - `config_snapshot` is included but can be fetched separately if too large
- **Service method**: `SchedulingRunsService.findById(tenantId, id)`

#### `GET /v1/scheduling-runs/:id/progress`

- **Permission**: `schedule.run_auto`
- **Response**:
  ```typescript
  {
    data: {
      status: string,
      phase: string,            // 'preparing' | 'solving' | 'complete' | 'failed'
      entries_assigned: number,
      entries_total: number,
      elapsed_ms: number,
    }
  }
  ```
- **Logic**: Reads from Redis key `scheduling:progress:{run_id}`. Falls back to DB status if Redis key doesn't exist.
- **Service method**: `SchedulingRunsService.getProgress(tenantId, id)`

#### `POST /v1/scheduling-runs/:id/cancel`

- **Permission**: `schedule.run_auto`
- **Response**: `{ success: true }`
- **Logic**: Sets Redis key `scheduling:cancel:{run_id}` = `1`. The solver wrapper checks this key periodically and stops if set. Status transitions to `failed` with `failure_reason = 'Cancelled by user'`.
- **Error cases**: Run not in `queued`/`running` status (400)
- **Service method**: `SchedulingRunsService.cancel(tenantId, id)`

#### `PATCH /v1/scheduling-runs/:id/adjustments`

- **Permission**: `schedule.apply_auto`
- **Request schema**:

  ```typescript
  const adjustmentSchema = z.discriminatedUnion('type', [
    z.object({
      type: z.literal('move'),
      class_id: z.string().uuid(),
      from_weekday: z.number().int().min(0).max(6),
      from_period_order: z.number().int().min(0),
      to_weekday: z.number().int().min(0).max(6),
      to_period_order: z.number().int().min(0),
      to_room_id: z.string().uuid().optional(),
    }),
    z.object({
      type: z.literal('swap'),
      entry_a: z.object({
        class_id: z.string().uuid(),
        weekday: z.number().int(),
        period_order: z.number().int(),
      }),
      entry_b: z.object({
        class_id: z.string().uuid(),
        weekday: z.number().int(),
        period_order: z.number().int(),
      }),
    }),
    z.object({
      type: z.literal('remove'),
      class_id: z.string().uuid(),
      weekday: z.number().int().min(0).max(6),
      period_order: z.number().int().min(0),
    }),
    z.object({
      type: z.literal('add'),
      class_id: z.string().uuid(),
      room_id: z.string().uuid(),
      teacher_staff_id: z.string().uuid(),
      weekday: z.number().int().min(0).max(6),
      period_order: z.number().int().min(0),
    }),
  ]);

  addAdjustmentSchema = z.object({
    adjustment: adjustmentSchema,
    expected_updated_at: z.string().datetime(),
  });
  ```

- **Response**: Updated `SchedulingRun` with new `proposed_adjustments` array
- **Logic**:
  1. Validate run is in `completed` status
  2. Merge `result_json` with existing `proposed_adjustments` to get current state
  3. Apply new adjustment to current state
  4. Validate full constraint set against the adjusted state
  5. If valid: append adjustment to `proposed_adjustments` array, save
  6. If invalid: return 400 with constraint violations
- **Error cases**: `SCHEDULER_RUN_NOT_COMPLETED` (400), `CONCURRENT_MODIFICATION` (409)
- **Service method**: `SchedulingRunsService.addAdjustment(tenantId, id, dto)`

#### `POST /v1/scheduling-runs/:id/apply`

- **Permission**: `schedule.apply_auto`
- **Request schema**:
  ```typescript
  applyRunSchema = z.object({
    expected_updated_at: z.string().datetime(),
  });
  ```
- **Response**: `{ data: { entries_created: number, entries_deleted: number, entries_end_dated: number } }`
- **Logic** (single transaction):
  1. `SELECT ... FOR UPDATE` on `scheduling_runs` row — concurrency guard
  2. Verify status is `completed`
  3. Optimistic concurrency check via `expected_updated_at`
  4. **Period grid drift guard**: Compare current period grid hash with `config_snapshot` period grid hash. If different → return `SCHEDULER_PERIOD_GRID_CHANGED` (409)
  5. **Class status guard**: Filter out inactive classes from proposed entries, log warning
  6. Merge `result_json` + `proposed_adjustments` → final entries
  7. Find existing `source = 'auto_generated'` entries for this year:
     - Without attendance sessions → hard-delete
     - With attendance sessions → set `effective_end_date = today`
  8. Insert new entries: `source = 'auto_generated'`, `is_pinned = false`, `scheduling_run_id` set, `effective_start_date` = later of today or academic year start, `effective_end_date = NULL`
  9. Update run: `status = 'applied'`, `applied_by_user_id`, `applied_at = now()`
  10. Pinned entries are NEVER deleted or modified
- **Approval integration**: If `tenant_settings.scheduling.requireApprovalForNonPrincipal = true` AND user is not `school_owner`, route through approval workflow. The endpoint checks for an existing approved approval request before proceeding.
- **Error cases**: `SCHEDULER_RUN_NOT_COMPLETED` (400), `SCHEDULER_PERIOD_GRID_CHANGED` (409), `CONCURRENT_MODIFICATION` (409)
- **Service method**: `SchedulingApplyService.apply(tenantId, userId, id, dto)`

#### `POST /v1/scheduling-runs/:id/discard`

- **Permission**: `schedule.apply_auto`
- **Request schema**: `{ expected_updated_at: z.string().datetime() }`
- **Response**: `{ success: true }`
- **Logic**: Update status to `discarded`. No schedule changes.
- **Error cases**: `SCHEDULER_RUN_NOT_COMPLETED` (400), `CONCURRENT_MODIFICATION` (409)
- **Service method**: `SchedulingRunsService.discard(tenantId, id, dto)`

---

### 3.6 Pin Management — Extends `SchedulesController`

#### `POST /v1/schedules/:id/pin`

- **Permission**: `schedule.pin_entries`
- **Request schema**: `{ pin_reason?: z.string() }`
- **Response**: Updated `Schedule`
- **Logic**: Sets `is_pinned = true`, `source = 'pinned'`, `pin_reason`. Validates against teacher availability. Returns warning if conflict with other pinned entries.
- **Service method**: `SchedulesService.pin(tenantId, id, dto)`

#### `POST /v1/schedules/:id/unpin`

- **Permission**: `schedule.pin_entries`
- **Response**: Updated `Schedule`
- **Logic**: Sets `is_pinned = false`, `source = 'manual'`, clears `pin_reason`
- **Service method**: `SchedulesService.unpin(tenantId, id)`

#### `POST /v1/schedules/bulk-pin`

- **Permission**: `schedule.pin_entries`
- **Request schema**: `{ schedule_ids: z.array(z.string().uuid()).min(1), pin_reason?: z.string() }`
- **Response**: `{ data: Schedule[], meta: { pinned: number, warnings: Conflict[] } }`
- **Logic**: Pin multiple entries in single transaction. Validate all against each other and availability. Return warnings for any issues (but still pin).
- **Service method**: `SchedulesService.bulkPin(tenantId, dto)`

---

### 3.7 Scheduling Dashboard — `SchedulingDashboardController`

#### `GET /v1/scheduling-dashboard/overview`

- **Permission**: `schedule.view_auto_reports`
- **Query**: `{ academic_year_id: uuid (required) }`
- **Response**:
  ```typescript
  {
    data: {
      total_slots: number,         // total class-period slots needed
      slots_assigned: number,      // currently assigned in schedules table
      slots_pinned: number,
      slots_auto: number,
      slots_manual: number,
      slots_unassigned: number,
      completion_pct: number,
      last_run: { id, status, created_at, mode, preference_score_pct } | null,
      is_stale: boolean,           // config changed since last applied run
    }
  }
  ```
- **Service method**: `SchedulingDashboardService.getOverview(tenantId, academicYearId)`

#### `GET /v1/scheduling-dashboard/workload`

- **Permission**: `schedule.view_auto_reports`
- **Query**: `{ academic_year_id: uuid (required) }`
- **Response**:
  ```typescript
  {
    data: Array<{
      staff_profile_id: string;
      staff_name: string;
      total_periods: number;
      teaching_periods: number;
      supervision_periods: number;
      max_capacity: number | null; // from tenant_settings.scheduling.teacherWeeklyMaxPeriods
      utilisation_pct: number;
      status: 'green' | 'amber' | 'red'; // green < 80%, amber 80-95%, red > 95%
    }>;
  }
  ```
- **Service method**: `SchedulingDashboardService.getWorkload(tenantId, academicYearId)`

#### `GET /v1/scheduling-dashboard/unassigned`

- **Permission**: `schedule.view_auto_reports`
- **Query**: `{ scheduling_run_id: uuid (required) }`
- **Response**:
  ```typescript
  {
    data: Array<{
      class_id: string;
      class_name: string;
      subject_name: string;
      periods_needed: number;
      periods_assigned: number;
      periods_remaining: number;
      blocking_reason: string;
    }>;
  }
  ```
- **Logic**: Reads from `result_json.unassigned` of the specified run, enriched with current class names
- **Service method**: `SchedulingDashboardService.getUnassigned(tenantId, runId)`

#### `GET /v1/scheduling-dashboard/preferences`

- **Permission**: `schedule.view_auto_reports` (admin) or `schedule.view_own_satisfaction` (own only)
- **Query**: `{ scheduling_run_id: uuid (required), staff_profile_id?: uuid }`
- **Response**:
  ```typescript
  {
    data: {
      overall_satisfaction_pct: number,
      per_teacher: Array<{
        staff_profile_id: string,
        staff_name: string,
        satisfaction_pct: number,
        preferences: Array<{
          preference_id: string,
          preference_type: string,
          satisfied: boolean,
          weight: number,
        }>
      }>
    }
  }
  ```
- **Logic**: Reads from `result_json.entries[].preference_satisfaction` and aggregates. If teacher calling with `view_own_satisfaction`, filter to own staff_profile_id.
- **Service method**: `SchedulingDashboardService.getPreferenceSatisfaction(tenantId, userId, runId, staffProfileId?)`

---

## Section 4 — Service Layer

### 4.1 `PeriodGridService`

- **Class**: `PeriodGridService`
- **Module**: `PeriodGridModule`
- **File**: `apps/api/src/modules/period-grid/period-grid.service.ts`
- **Dependencies**: `PrismaService`

**Public methods**:

| Method        | Signature                                                                                        | Responsibility                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findAll`     | `(tenantId: string, academicYearId: string) → Promise<SchedulePeriodTemplate[]>`                 | Query all period templates for tenant+year, ordered by weekday asc, period_order asc. Format TIME fields to HH:mm strings.                                                                                          |
| `create`      | `(tenantId: string, dto: CreatePeriodTemplateDto) → Promise<SchedulePeriodTemplate>`             | Validate end_time > start_time. Create in RLS transaction. Catch P2002 for unique violations → throw `SCHEDULER_PERIOD_GRID_OVERLAP`. Catch exclusion constraint violation → throw `SCHEDULER_PERIOD_GRID_OVERLAP`. |
| `update`      | `(tenantId: string, id: string, dto: UpdatePeriodTemplateDto) → Promise<SchedulePeriodTemplate>` | Find existing, verify tenant ownership, apply partial update. Same validation as create.                                                                                                                            |
| `delete`      | `(tenantId: string, id: string) → Promise<void>`                                                 | Find existing, verify tenant ownership, hard-delete.                                                                                                                                                                |
| `copyDay`     | `(tenantId: string, dto: CopyDayDto) → Promise<{ data: SchedulePeriodTemplate[], meta }>`        | Read source day's periods. For each target day, attempt create. Skip on unique conflict (count skipped). Return all created + skip count. Single transaction.                                                       |
| `getGridHash` | `(tenantId: string, academicYearId: string) → Promise<string>`                                   | Compute deterministic hash of period grid for drift detection. MD5 of sorted `(weekday, period_order, start_time, end_time, type)` tuples. Used by apply flow.                                                      |

---

### 4.2 `ClassRequirementsService`

- **Class**: `ClassRequirementsService`
- **Module**: `ClassRequirementsModule`
- **File**: `apps/api/src/modules/class-requirements/class-requirements.service.ts`
- **Dependencies**: `PrismaService`

**Public methods**:

| Method       | Signature                                                                           | Responsibility                                                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findAll`    | `(tenantId: string, academicYearId: string, pagination) → Promise<PaginatedResult>` | Query requirements with class join (name, subject, teachers from class_staff). Also count total active classes vs configured classes for completeness indicator. |
| `create`     | `(tenantId: string, dto) → Promise<ClassSchedulingRequirement>`                     | Validate class exists and belongs to tenant. Validate preferred_room exists if provided. Validate min <= max consecutive. Create in RLS transaction.             |
| `update`     | `(tenantId: string, id: string, dto) → Promise<ClassSchedulingRequirement>`         | Find existing, verify ownership, partial update. Re-validate min <= max if either changes.                                                                       |
| `delete`     | `(tenantId: string, id: string) → Promise<void>`                                    | Find existing, verify ownership, hard-delete.                                                                                                                    |
| `bulkUpsert` | `(tenantId: string, dto) → Promise<{ data, meta }>`                                 | For each entry: check if requirement exists for (class, year). If yes, update. If no, create. Single transaction. Count created vs updated.                      |

---

### 4.3 `StaffAvailabilityService`

- **Class**: `StaffAvailabilityService`
- **Module**: `StaffAvailabilityModule`
- **File**: `apps/api/src/modules/staff-availability/staff-availability.service.ts`
- **Dependencies**: `PrismaService`

**Public methods**:

| Method            | Signature                                                                                                                         | Responsibility                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `findAll`         | `(tenantId: string, academicYearId: string, staffProfileId?: string) → Promise<StaffAvailability[]>`                              | Query availability records with staff name join. Optional filter by staff. Order by staff name, weekday.                                                                             |
| `replaceForStaff` | `(tenantId: string, staffProfileId: string, academicYearId: string, entries: AvailabilityEntry[]) → Promise<StaffAvailability[]>` | Validate staff exists. Validate all available_to > available_from. Validate no duplicate weekdays. In single transaction: delete all existing for (staff, year), insert new entries. |
| `delete`          | `(tenantId: string, id: string) → Promise<void>`                                                                                  | Find existing, verify ownership, hard-delete.                                                                                                                                        |

---

### 4.4 `StaffPreferencesService`

- **Class**: `StaffPreferencesService`
- **Module**: `StaffPreferencesModule`
- **File**: `apps/api/src/modules/staff-preferences/staff-preferences.service.ts`
- **Dependencies**: `PrismaService`

**Public methods**:

| Method               | Signature                                                                                                    | Responsibility                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `findAll`            | `(tenantId: string, academicYearId: string, staffProfileId?: string) → Promise<StaffSchedulingPreference[]>` | Query preferences with staff name join. Optional filter by staff.                                                                                                                                                                                                              |
| `findOwnPreferences` | `(tenantId: string, userId: string, academicYearId: string) → Promise<StaffSchedulingPreference[]>`          | Resolve staff_profile_id from user's membership. Query own preferences only.                                                                                                                                                                                                   |
| `create`             | `(tenantId: string, userId: string, dto) → Promise<StaffSchedulingPreference>`                               | Derive `preference_type` from `preference_payload.type`. Validate staff exists. Validate conflicting preferences (prefer X AND avoid X). For self-service: verify staff_profile_id matches caller. Validate referenced subject_ids/class_ids exist. Create in RLS transaction. |
| `update`             | `(tenantId: string, userId: string, id: string, dto) → Promise<StaffSchedulingPreference>`                   | Find existing, verify ownership (admin or own). Partial update with same validations.                                                                                                                                                                                          |
| `delete`             | `(tenantId: string, userId: string, id: string) → Promise<void>`                                             | Find existing, verify ownership (admin or own), hard-delete.                                                                                                                                                                                                                   |

---

### 4.5 `SchedulingPrerequisitesService`

- **Class**: `SchedulingPrerequisitesService`
- **Module**: `SchedulingRunsModule`
- **File**: `apps/api/src/modules/scheduling-runs/scheduling-prerequisites.service.ts`
- **Dependencies**: `PrismaService`, `ConflictDetectionService` (from schedules module)

**Public methods**:

| Method  | Signature                                                                   | Responsibility                                                                                                                                           |
| ------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check` | `(tenantId: string, academicYearId: string) → Promise<PrerequisitesResult>` | Run all 6 prerequisite checks (see Section 3.5). Each check returns a pass/fail result with message and details. `ready = true` only if all checks pass. |

**Check implementations**:

1. **Period grid exists**: `COUNT(*) FROM schedule_period_templates WHERE schedule_period_type = 'teaching'` ≥ 1
2. **All classes configured**: Compare active academic classes count vs class_scheduling_requirements count. Return unconfigured class names in details.
3. **All classes have teachers**: Check `class_staff` for each active academic class has at least one row with `assignment_role IN ('teacher', 'homeroom')`. Return unassigned class names.
4. **No pinned entry conflicts**: Query all pinned entries for the year. Run pairwise conflict detection (teacher double-booking, room double-booking) using same overlap logic as `ConflictDetectionService`.
5. **No pinned entries violate availability**: For each pinned entry, check if teacher's availability covers the period time. Return violations with entry and teacher details.
6. **All referenced classes active**: Check class status for all classes with requirements or pinned entries.

---

### 4.6 `SchedulingRunsService`

- **Class**: `SchedulingRunsService`
- **Module**: `SchedulingRunsModule`
- **File**: `apps/api/src/modules/scheduling-runs/scheduling-runs.service.ts`
- **Dependencies**: `PrismaService`, `SchedulingPrerequisitesService`, Redis client (via `@Inject('REDIS')`)

**Public methods**:

| Method          | Signature                                                                           | Responsibility                                                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create`        | `(tenantId: string, userId: string, dto) → Promise<SchedulingRun>`                  | Run prerequisites check. Verify no active run. Auto-detect mode (check for pinned entries). Create DB row with `status = 'queued'`. Enqueue BullMQ job. Return created run.                                    |
| `findAll`       | `(tenantId: string, academicYearId: string, pagination) → Promise<PaginatedResult>` | List runs excluding large JSONB fields. Include created_by user name. Order by created_at desc.                                                                                                                |
| `findById`      | `(tenantId: string, id: string) → Promise<SchedulingRun>`                           | Full detail including result_json and proposed_adjustments.                                                                                                                                                    |
| `getProgress`   | `(tenantId: string, id: string) → Promise<ProgressResult>`                          | Read from Redis key `scheduling:progress:{id}`. Fall back to DB status.                                                                                                                                        |
| `cancel`        | `(tenantId: string, id: string) → Promise<void>`                                    | Verify status is `queued` or `running`. Set Redis key `scheduling:cancel:{id}` = `1` with 5-minute TTL.                                                                                                        |
| `addAdjustment` | `(tenantId: string, id: string, dto) → Promise<SchedulingRun>`                      | Verify status is `completed`. Optimistic concurrency check. Merge result_json + existing adjustments → current state. Validate new adjustment against constraints. Append to proposed_adjustments array. Save. |
| `discard`       | `(tenantId: string, id: string, dto) → Promise<void>`                               | Verify status is `completed`. Optimistic concurrency check. Update status to `discarded`.                                                                                                                      |

**Adjustment constraint validation** (within `addAdjustment`):
The method reconstructs the full timetable from `result_json + proposed_adjustments`, applies the new adjustment, then validates:

- Teacher not double-booked
- Room not double-booked (exclusive rooms)
- Student group overlap check
- Teacher availability check
- Room type match
- Max/min consecutive constraints

This uses a lightweight in-memory validation function (not the full solver), similar to the solver's constraint module but operating on the fully-assigned timetable.

---

### 4.7 `SchedulingApplyService`

- **Class**: `SchedulingApplyService`
- **Module**: `SchedulingRunsModule`
- **File**: `apps/api/src/modules/scheduling-runs/scheduling-apply.service.ts`
- **Dependencies**: `PrismaService`, `PeriodGridService`

**Public methods**:

| Method  | Signature                                                                    | Responsibility                                                                                                             |
| ------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apply` | `(tenantId: string, userId: string, id: string, dto) → Promise<ApplyResult>` | Full apply transaction (see Section 3.5 apply endpoint logic). Single Prisma interactive transaction with FOR UPDATE lock. |

**Apply transaction steps** (all within one `prisma.$transaction`):

1. `SELECT * FROM scheduling_runs WHERE id = :id FOR UPDATE` — lock the row
2. Verify `status = 'completed'`
3. Optimistic concurrency check (`updated_at = expected_updated_at`)
4. Period grid drift guard: call `PeriodGridService.getGridHash()` and compare with hash of `config_snapshot.period_grid`
5. Merge `result_json.entries` + `proposed_adjustments` → final entry list
6. Filter out entries for inactive classes (log warning, count excluded)
7. Query existing `schedules WHERE source = 'auto_generated' AND academic_year_id = :yearId`
8. For each existing auto entry:
   - Check if linked to any `attendance_session`
   - If no attendance → `DELETE`
   - If has attendance → `UPDATE effective_end_date = today`
9. Insert new entries from final list:
   - `source = 'auto_generated'`
   - `is_pinned = false`
   - `scheduling_run_id = run.id`
   - `schedule_period_template_id` = matching period template ID
   - `period_order` = from entry
   - `effective_start_date` = max(today, academic_year.start_date)
   - `effective_end_date = NULL`
   - `teacher_staff_id` = from entry
   - `room_id` = from entry
10. Update run: `status = 'applied'`, `applied_by_user_id`, `applied_at = now()`
11. Return counts: `entries_created`, `entries_deleted`, `entries_end_dated`

---

### 4.8 `SchedulingDashboardService`

- **Class**: `SchedulingDashboardService`
- **Module**: `SchedulingRunsModule`
- **File**: `apps/api/src/modules/scheduling-runs/scheduling-dashboard.service.ts`
- **Dependencies**: `PrismaService`

**Public methods**:

| Method                      | Signature                                                              | Responsibility                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getOverview`               | `(tenantId, academicYearId) → Promise<OverviewData>`                   | Aggregate: total slots needed (sum of all class requirements' periods_per_week), actual schedule entries by source, latest run info. Staleness: check if any `staff_availability`, `class_scheduling_requirements`, `staff_scheduling_preferences`, or `class_staff` has `updated_at` > latest applied run's `applied_at`. |
| `getWorkload`               | `(tenantId, academicYearId) → Promise<WorkloadData[]>`                 | Group schedule entries by teacher. Count teaching vs supervision periods. Calculate utilisation against `tenant_settings.scheduling.teacherWeeklyMaxPeriods`.                                                                                                                                                              |
| `getUnassigned`             | `(tenantId, runId) → Promise<UnassignedData[]>`                        | Read from `scheduling_runs.result_json.unassigned`. Enrich with current class/subject names.                                                                                                                                                                                                                               |
| `getPreferenceSatisfaction` | `(tenantId, userId, runId, staffProfileId?) → Promise<PreferenceData>` | Read from `result_json.entries[].preference_satisfaction`. Aggregate per teacher. If teacher (non-admin), filter to own profile.                                                                                                                                                                                           |

---

### 4.9 Extensions to `SchedulesService`

Add to existing `apps/api/src/modules/schedules/schedules.service.ts`:

| Method    | Signature                                  | Responsibility                                                                                                                                                           |
| --------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pin`     | `(tenantId, id, dto) → Promise<Schedule>`  | Find schedule, verify ownership. Set `is_pinned = true`, `source = 'pinned'`, `pin_reason`. Check teacher availability for the pinned time — return warning if conflict. |
| `unpin`   | `(tenantId, id) → Promise<Schedule>`       | Find schedule, verify ownership. Set `is_pinned = false`, `source = 'manual'`, clear `pin_reason`.                                                                       |
| `bulkPin` | `(tenantId, dto) → Promise<BulkPinResult>` | Pin multiple in single transaction. Run pairwise conflict check between all entries being pinned. Return warnings.                                                       |

---

## Section 5 — Frontend Pages and Components

All new pages live under `apps/web/src/app/[locale]/(school)/scheduling/`. All use Tailwind logical CSS utilities exclusively. All UI is hidden when `autoSchedulerEnabled = false` (checked in layout).

### 5.1 Scheduling Layout

- **File**: `apps/web/src/app/[locale]/(school)/scheduling/layout.tsx`
- **Type**: Server component
- **Responsibility**: Sub-navigation for scheduling section with tabs: Period Grid, Requirements, Availability, Preferences, Auto-Scheduler, Dashboard. Checks `autoSchedulerEnabled` from tenant settings — if false, redirects to schedules page.

---

### 5.2 Period Grid Editor

- **File**: `apps/web/src/app/[locale]/(school)/scheduling/period-grid/page.tsx`
- **Type**: Client component (visual editor)
- **Route**: `/scheduling/period-grid`
- **Permission**: `schedule.configure_period_grid`
- **Data fetching**: `GET /v1/period-grid?academic_year_id=X` + `GET /v1/academic-years` for year selector
- **UI**:
  - Academic year selector dropdown
  - Visual grid: columns = weekdays (Mon-Sun, respects RTL), rows = period slots ordered by `period_order`
  - Each cell shows: period name, time range, type badge (teaching/break/etc.)
  - Click cell → inline edit form (name, name_ar, time, type)
  - "Add Period" button at bottom of each day column
  - "Copy Day" action: select source day → checkboxes for target days → submit
  - Delete button per period (with confirmation)
  - Period types color-coded: teaching (blue), break_supervision (amber), assembly (purple), lunch_duty (orange), free (gray)
  - Empty state with "Create your first period grid" CTA
- **Calls**: `POST /v1/period-grid`, `PATCH /v1/period-grid/:id`, `DELETE /v1/period-grid/:id`, `POST /v1/period-grid/copy-day`

---

### 5.3 Class Requirements Editor

- **File**: `apps/web/src/app/[locale]/(school)/scheduling/requirements/page.tsx`
- **Type**: Client component (table editor)
- **Route**: `/scheduling/requirements`
- **Permission**: `schedule.configure_requirements`
- **Data fetching**: `GET /v1/class-scheduling-requirements?academic_year_id=X`
- **UI**:
  - Academic year selector
  - Completeness banner: "45 of 52 classes configured. 7 remaining." with progress bar
  - Data table columns: Class Name | Subject | Teacher(s) | Periods/Week | Room Type | Preferred Room | Max Consecutive | Min Consecutive | Spread | Student Count | Actions
  - Inline editing for each row (click cell to edit)
  - "Configure All Remaining" bulk action → fills defaults for unconfigured classes
  - Bulk edit: select rows → edit shared fields
  - Room type dropdown uses existing `RoomType` enum values
  - Preferred room dropdown filtered by selected room type
- **Calls**: `POST /v1/class-scheduling-requirements`, `PATCH /v1/class-scheduling-requirements/:id`, `DELETE /v1/class-scheduling-requirements/:id`, `POST /v1/class-scheduling-requirements/bulk`

---

### 5.4 Staff Availability Editor

- **File**: `apps/web/src/app/[locale]/(school)/scheduling/availability/page.tsx`
- **Type**: Client component (visual grid)
- **Route**: `/scheduling/availability`
- **Permission**: `schedule.configure_availability`
- **Data fetching**: `GET /v1/staff-availability?academic_year_id=X` + staff list
- **UI**:
  - Academic year selector
  - Staff list panel (left/start side): searchable list of teachers
  - Select a teacher → shows weekly availability grid (right/end side)
  - Grid: columns = weekdays, single row = time range per day
  - Per-day: time range picker (available_from, available_to)
  - Visual states: green = available (row exists), red = unavailable (no row for that day), neutral = not configured (no rows at all = fully available)
  - "Default: Fully Available" info banner when no rows exist
  - Save button saves all 7 days atomically via PUT endpoint
  - Clear all button removes all rows (resets to fully available)
- **Calls**: `GET /v1/staff-availability`, `PUT /v1/staff-availability/staff/:id/year/:yearId`

---

### 5.5 Staff Preferences (Admin)

- **File**: `apps/web/src/app/[locale]/(school)/scheduling/preferences/page.tsx`
- **Type**: Client component (tabbed form)
- **Route**: `/scheduling/preferences`
- **Permission**: `schedule.manage_preferences`
- **Data fetching**: `GET /v1/staff-scheduling-preferences?academic_year_id=X` + staff list + subjects + classes
- **UI**:
  - Academic year selector
  - Staff selector (dropdown or list)
  - Banner: "Preferences are best-effort. The solver tries to honour them but makes no guarantees."
  - Three tabs for selected teacher:
    - **Subject**: List of subject preferences. Each row: subject multi-select, prefer/avoid toggle, priority (low/medium/high).
    - **Class**: List of class preferences. Each row: class multi-select, prefer/avoid toggle, priority.
    - **Time Slot**: List of time preferences. Each row: weekday selector (or "any day"), period order multi-select, prefer/avoid toggle, priority.
  - Add/remove preference rows per tab
  - Save per preference (individual CRUD)
- **Calls**: `POST /v1/staff-scheduling-preferences`, `PATCH /v1/staff-scheduling-preferences/:id`, `DELETE /v1/staff-scheduling-preferences/:id`

---

### 5.6 Teacher Self-Service Preferences

- **File**: `apps/web/src/app/[locale]/(school)/scheduling/my-preferences/page.tsx`
- **Type**: Client component
- **Route**: `/scheduling/my-preferences`
- **Permission**: `schedule.manage_own_preferences`
- **UI**: Same three-tab layout as admin preferences (5.5) but:
  - No staff selector — shows only own preferences
  - Uses `GET /v1/staff-scheduling-preferences/own` for data
  - Banner: "Preferences are best-effort."
- **Calls**: `GET /v1/staff-scheduling-preferences/own`, `POST /v1/staff-scheduling-preferences` (with own staff_profile_id), `PATCH ...`, `DELETE ...`

---

### 5.7 Auto-Scheduler Launch

- **File**: `apps/web/src/app/[locale]/(school)/scheduling/auto/page.tsx`
- **Type**: Client component
- **Route**: `/scheduling/auto`
- **Permission**: `schedule.run_auto`
- **Data fetching**: `GET /v1/scheduling-runs/prerequisites?academic_year_id=X` + `GET /v1/scheduling-runs?academic_year_id=X` (last run)
- **UI**:
  - Academic year selector
  - **Prerequisites checklist**: Each check shown as pass/fail with description and "Fix" link navigating to relevant config page
  - "Generate Timetable" button — disabled until all prerequisites pass
  - Mode indicator: "Mode: Hybrid (15 pinned entries detected)" or "Mode: Auto (no pinned entries)"
  - Confirmation dialog: "This will generate a timetable for 52 classes across 35 weekly slots. Pinned entries will be preserved. Continue?"
  - On submit → creates run → shows **Solver Progress Dialog**
  - **Solver Progress Dialog** (modal):
    - Phase indicator: "Preparing constraints..." → "Solving..." → "Complete"
    - Live counter: "342 of 380 class slots assigned" (polls `/progress` every 2s)
    - Elapsed time
    - Cancel button → calls `POST /cancel`
    - On completion → redirects to review page
    - On failure → shows error with "View Partial Results" link if available
  - **Run History** section below: table of past runs (from list endpoint)
- **Calls**: `GET /v1/scheduling-runs/prerequisites`, `POST /v1/scheduling-runs`, `GET /v1/scheduling-runs/:id/progress`, `POST /v1/scheduling-runs/:id/cancel`

---

### 5.8 Proposed Timetable Review

- **File**: `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/review/page.tsx`
- **Type**: Client component (drag-and-drop grid)
- **Route**: `/scheduling/runs/[id]/review`
- **Permission**: `schedule.apply_auto`
- **Data fetching**: `GET /v1/scheduling-runs/:id`
- **UI**:
  - **"PROPOSED — Not Yet Applied" banner** at top (yellow/warning variant)
  - Timetable grid rendered from `result_json + proposed_adjustments` (NOT from schedules table)
  - Two visual states for entries:
    - Pinned: solid background, pin icon, thicker border
    - Auto-generated: dashed border, lighter background
  - **Drag-and-drop**: Move entries between slots. On drop → calls `PATCH /adjustments` with `move` type. If constraint violation → shows error toast, reverts position.
  - **Swap**: Click entry A → click entry B → swap dialog → confirm → `PATCH /adjustments` with `swap` type
  - **Remove**: Right-click or action menu → "Remove" → `PATCH /adjustments` with `remove` type
  - **Add**: Click empty slot → "Add class" picker → select class, room, teacher → `PATCH /adjustments` with `add` type
  - Each adjustment validated in real-time server-side
  - **Side panel — Constraint Report**:
    - Hard constraint violations (should be 0)
    - Soft preference satisfaction: "87% satisfied" with expandable per-teacher breakdown
    - Unassigned slots with blocking reasons
    - Teacher workload summary
  - **Action bar**:
    - "Apply Timetable" button → confirmation dialog → calls `POST /apply`
    - "Discard" button → confirmation dialog → calls `POST /discard`
    - "Back to Solver" button → navigate to auto page
- **Calls**: `GET /v1/scheduling-runs/:id`, `PATCH /v1/scheduling-runs/:id/adjustments`, `POST /v1/scheduling-runs/:id/apply`, `POST /v1/scheduling-runs/:id/discard`

---

### 5.9 Scheduling Dashboard

- **File**: `apps/web/src/app/[locale]/(school)/scheduling/dashboard/page.tsx`
- **Type**: Mixed server/client components
- **Route**: `/scheduling/dashboard`
- **Permission**: `schedule.view_auto_reports`
- **Data fetching**: Multiple dashboard endpoints
- **UI**:
  - Academic year selector
  - **Tab 1 — Overview**: KPI cards (total slots, assigned, pinned, auto, unassigned, completion %). Last run info. Staleness banner if config changed since last apply.
  - **Tab 2 — Teacher Workload**: Data table with columns from workload endpoint. Color-coded utilisation. Sortable.
  - **Tab 3 — Unassigned Classes**: Requires a completed/applied run selection. Table with unassigned class details and blocking reasons.
  - **Tab 4 — Preference Satisfaction**: Requires a completed/applied run selection. Expandable per-teacher preference breakdown.
  - **Tab 5 — Run History**: Table of all runs. Click → navigate to review page (if completed) or detail view.
- **Calls**: `GET /v1/scheduling-dashboard/overview`, `GET /v1/scheduling-dashboard/workload`, `GET /v1/scheduling-dashboard/unassigned`, `GET /v1/scheduling-dashboard/preferences`, `GET /v1/scheduling-runs`

---

### 5.10 Teacher Satisfaction View

- **File**: `apps/web/src/app/[locale]/(school)/scheduling/my-satisfaction/page.tsx`
- **Type**: Client component
- **Route**: `/scheduling/my-satisfaction`
- **Permission**: `schedule.view_own_satisfaction`
- **Data fetching**: `GET /v1/scheduling-dashboard/preferences?scheduling_run_id=X` (filtered to own)
- **UI**: Shows the teacher's own preference satisfaction from the latest applied run. Each preference shown with satisfied/unsatisfied indicator and weight.
- **Calls**: `GET /v1/scheduling-dashboard/preferences`

---

### 5.11 Shared Components

| Component                | File                                                              | Type   | Description                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `PeriodGridEditor`       | `apps/web/src/components/scheduling/period-grid-editor.tsx`       | Client | The visual weekday grid with inline editing used by the period grid page                                                                |
| `ClassRequirementsTable` | `apps/web/src/components/scheduling/class-requirements-table.tsx` | Client | Editable data table for class requirements with inline editing and bulk actions                                                         |
| `AvailabilityWeekGrid`   | `apps/web/src/components/scheduling/availability-week-grid.tsx`   | Client | Weekly availability grid with time range pickers per day                                                                                |
| `PreferenceTabs`         | `apps/web/src/components/scheduling/preference-tabs.tsx`          | Client | Three-tab preference editor (subject/class/time)                                                                                        |
| `PrerequisitesChecklist` | `apps/web/src/components/scheduling/prerequisites-checklist.tsx`  | Client | Checklist of prerequisite checks with pass/fail badges and fix links                                                                    |
| `SolverProgressDialog`   | `apps/web/src/components/scheduling/solver-progress-dialog.tsx`   | Client | Modal with progress bar, live counter, cancel button                                                                                    |
| `ProposedTimetableGrid`  | `apps/web/src/components/scheduling/proposed-timetable-grid.tsx`  | Client | Drag-and-drop timetable grid for review. Extends TimetableGrid pattern with drop zones, pin indicators, dashed borders for auto entries |
| `ConstraintReportPanel`  | `apps/web/src/components/scheduling/constraint-report-panel.tsx`  | Client | Side panel showing constraint violations, preference satisfaction, unassigned list                                                      |
| `RunHistoryTable`        | `apps/web/src/components/scheduling/run-history-table.tsx`        | Client | Data table for scheduling run history with status badges                                                                                |
| `PinToggle`              | `apps/web/src/components/scheduling/pin-toggle.tsx`               | Client | Button/toggle for pinning/unpinning schedule entries                                                                                    |

---

## Section 6 — Background Jobs

### 6.1 Solver Execution Job

- **Job name**: `scheduling:solve`
- **Queue**: `SCHEDULING` (new queue)
- **Processor file**: `apps/worker/src/processors/scheduling-solver.processor.ts`
- **Trigger**: `SchedulingRunsService.create()` enqueues job after creating the run row
- **Payload**:
  ```typescript
  interface SchedulingSolverPayload extends TenantJobPayload {
    tenant_id: string;
    run_id: string;
  }
  ```
- **Processing logic**:
  1. Update run status: `queued → running`
  2. Load all data from DB:
     - Period grid (`schedule_period_templates`)
     - Class requirements (`class_scheduling_requirements`) with class details
     - Class-teacher assignments (`class_staff`)
     - Teacher availability (`staff_availability`)
     - Teacher preferences (`staff_scheduling_preferences`)
     - Rooms (active only)
     - Pinned schedule entries (`schedules WHERE is_pinned = true`)
     - Student overlaps (computed from `class_enrolments` — find pairs of classes sharing students)
     - Tenant scheduling settings
  3. Build `config_snapshot` from loaded data. Save to run row.
  4. Transform data into solver input format (`SolverInput` from `packages/shared/src/scheduler/types.ts`)
  5. Call solver with:
     - `onProgress` callback: updates Redis `scheduling:progress:{run_id}` every 1 second
     - `shouldCancel` callback: checks Redis `scheduling:cancel:{run_id}` every 500 iterations
     - `maxDuration`: from tenant settings `maxSolverDurationSeconds`
     - `seed`: from run's `solver_seed` or generate random
  6. On success:
     - Save `result_json` to run row
     - Update scalar fields: `entries_generated`, `entries_pinned`, `entries_unassigned`, `hard_constraint_violations`, `soft_preference_score`, `soft_preference_max`, `solver_duration_ms`, `solver_seed`
     - Set status to `completed`
     - Delete Redis progress key
     - Emit `scheduling.run_completed` domain event → in-app notification to initiating admin
  7. On failure/timeout:
     - Save partial `result_json` if available
     - Set `failure_reason`
     - Set status to `failed`
     - Delete Redis progress key
     - Emit `scheduling.run_failed` domain event → in-app + email notification
  8. On cancellation (Redis cancel key detected):
     - Save best partial result
     - Set `failure_reason = 'Cancelled by user'`
     - Set status to `failed`

- **Retry/DLQ**: Max 1 attempt (no retry — solver is deterministic, same input = same failure). Failed jobs go to DLQ for investigation.
- **Job options**: `{ timeout: maxSolverDurationSeconds * 1000 * 2, removeOnComplete: 100, removeOnFail: 100 }`

### 6.2 Stale Run Reaper Job

- **Job name**: `scheduling:reap-stale-runs`
- **Queue**: `SCHEDULING`
- **Processor file**: `apps/worker/src/processors/scheduling-stale-reaper.processor.ts`
- **Trigger**: BullMQ repeatable job — runs daily at 03:00 UTC
- **Payload**:
  ```typescript
  interface StaleReaperPayload extends TenantJobPayload {
    tenant_id: string; // Set to a special "system" value for cross-tenant job
  }
  ```
  > Note: This job operates across tenants. It queries WITHOUT RLS (uses a system-level Prisma client or iterates per-tenant). The reaper finds runs stuck in `running` and fails them.
- **Processing logic**:
  1. Query `scheduling_runs WHERE status = 'running'`
  2. For each: check if `updated_at` is older than `maxSolverDurationSeconds × 2` (from the run's `config_snapshot.settings` or a global default of 300s)
  3. If stale: update status to `failed`, set `failure_reason = 'Stale run reaped — worker likely crashed'`
  4. Log count of reaped runs
- **Retry/DLQ**: Max 3 attempts with exponential backoff.

---

## Section 7 — Implementation Order

### Step 1: Database Migration & Seed Data

1. Add 6 new enums to Prisma schema
2. Add 5 new models to Prisma schema
3. Add relations from `Schedule` to `SchedulePeriodTemplate` and `SchedulingRun`
4. Add reverse relations on `Tenant`, `AcademicYear`, `StaffProfile`, `Class`, `Room`, `User` models
5. Run `npx prisma migrate dev --name add-p4b-auto-scheduling`
6. Create `post_migrate.sql`:
   - Create `timerange` custom type
   - CHECK constraints on all 5 tables
   - Exclusion constraint on `schedule_period_templates`
   - MD5-based unique index on `staff_scheduling_preferences`
   - Partial unique index on `scheduling_runs` (active runs)
   - Partial indexes on `schedules` (pinned, auto_generated, run)
   - FK constraints from `schedules` to new tables
   - RLS policies for all 5 tables
   - `set_updated_at()` triggers for all 5 tables
7. Update seed data: add dev fixtures for period grid, class requirements, staff availability, preferences

### Step 2: Shared Types & Zod Schemas

1. Create type files in `packages/shared/src/types/`:
   - `schedule-period-template.ts`
   - `class-scheduling-requirement.ts`
   - `staff-availability.ts`
   - `staff-scheduling-preference.ts`
   - `scheduling-run.ts`
2. Create schema files in `packages/shared/src/schemas/`:
   - `schedule-period-template.schema.ts`
   - `class-scheduling-requirement.schema.ts`
   - `staff-availability.schema.ts`
   - `staff-scheduling-preference.schema.ts`
   - `scheduling-run.schema.ts`
3. Export from `packages/shared/src/types/index.ts` and `packages/shared/src/schemas/index.ts`

### Step 3: CSP Solver

1. Create `packages/shared/src/scheduler/types.ts` — solver input/output types
2. Create `packages/shared/src/scheduler/constraints.ts` — hard constraint checkers
3. Create `packages/shared/src/scheduler/preferences.ts` — soft preference scoring
4. Create `packages/shared/src/scheduler/domain.ts` — domain reduction, arc consistency
5. Create `packages/shared/src/scheduler/heuristics.ts` — MRV variable ordering, preference-weighted value ordering
6. Create `packages/shared/src/scheduler/solver.ts` — main solver entry point
7. Create `packages/shared/src/scheduler/index.ts` — public exports
8. Create solver tests:
   - `packages/shared/src/scheduler/__tests__/constraints.test.ts`
   - `packages/shared/src/scheduler/__tests__/solver.test.ts`
   - `packages/shared/src/scheduler/__tests__/fixtures/` — small, medium, large school configs

### Step 4: Backend CRUD Services

1. `PeriodGridModule`: module, controller, service
2. `ClassRequirementsModule`: module, controller, service
3. `StaffAvailabilityModule`: module, controller, service
4. `StaffPreferencesModule`: module, controller, service

### Step 5: Backend Scheduling Runs & Dashboard

1. `SchedulingRunsModule`: module, controller
2. `SchedulingPrerequisitesService`
3. `SchedulingRunsService`
4. `SchedulingApplyService`
5. `SchedulingDashboardController` + `SchedulingDashboardService`

### Step 6: Pin Management Extensions

1. Add `pin`, `unpin`, `bulkPin` to `SchedulesService`
2. Add pin/unpin/bulk-pin endpoints to `SchedulesController`

### Step 7: Worker Processors

1. Add `SCHEDULING` to `QUEUE_NAMES`
2. Create `SchedulingSolverProcessor` + `SchedulingSolverJob`
3. Create `SchedulingStaleReaperProcessor` + `SchedulingStaleReaperJob`
4. Register processors in worker module
5. Register stale reaper as repeatable job

### Step 8: Frontend — Configuration Pages

1. Scheduling layout with sub-navigation
2. Period grid editor page + component
3. Class requirements editor page + component
4. Staff availability editor page + component
5. Staff preferences admin page + component
6. Teacher self-service preferences page

### Step 9: Frontend — Solver & Review

1. Prerequisites checklist component
2. Solver progress dialog component
3. Auto-scheduler launch page
4. Proposed timetable grid component (drag-and-drop)
5. Constraint report panel component
6. Proposed timetable review page
7. Pin toggle component

### Step 10: Frontend — Dashboard & Navigation

1. Dashboard overview tab
2. Dashboard workload tab
3. Dashboard unassigned tab
4. Dashboard preference satisfaction tab
5. Dashboard run history tab
6. Teacher satisfaction view page
7. Update sidebar navigation with scheduling sub-items
8. Add all i18n keys (en + ar)

---

## Section 8 — Files to Create

### Prisma & Migrations

```
packages/prisma/migrations/YYYYMMDDHHMMSS_add_p4b_auto_scheduling/migration.sql      (auto-generated)
packages/prisma/migrations/YYYYMMDDHHMMSS_add_p4b_auto_scheduling/post_migrate.sql
```

### Shared Types

```
packages/shared/src/types/schedule-period-template.ts
packages/shared/src/types/class-scheduling-requirement.ts
packages/shared/src/types/staff-availability.ts
packages/shared/src/types/staff-scheduling-preference.ts
packages/shared/src/types/scheduling-run.ts
```

### Shared Schemas

```
packages/shared/src/schemas/schedule-period-template.schema.ts
packages/shared/src/schemas/class-scheduling-requirement.schema.ts
packages/shared/src/schemas/staff-availability.schema.ts
packages/shared/src/schemas/staff-scheduling-preference.schema.ts
packages/shared/src/schemas/scheduling-run.schema.ts
```

### CSP Solver

```
packages/shared/src/scheduler/types.ts
packages/shared/src/scheduler/constraints.ts
packages/shared/src/scheduler/preferences.ts
packages/shared/src/scheduler/domain.ts
packages/shared/src/scheduler/heuristics.ts
packages/shared/src/scheduler/solver.ts
packages/shared/src/scheduler/index.ts
packages/shared/src/scheduler/__tests__/constraints.test.ts
packages/shared/src/scheduler/__tests__/solver.test.ts
packages/shared/src/scheduler/__tests__/fixtures/small-school.ts
packages/shared/src/scheduler/__tests__/fixtures/medium-school.ts
packages/shared/src/scheduler/__tests__/fixtures/large-school.ts
```

### Backend — Period Grid

```
apps/api/src/modules/period-grid/period-grid.module.ts
apps/api/src/modules/period-grid/period-grid.controller.ts
apps/api/src/modules/period-grid/period-grid.service.ts
```

### Backend — Class Requirements

```
apps/api/src/modules/class-requirements/class-requirements.module.ts
apps/api/src/modules/class-requirements/class-requirements.controller.ts
apps/api/src/modules/class-requirements/class-requirements.service.ts
```

### Backend — Staff Availability

```
apps/api/src/modules/staff-availability/staff-availability.module.ts
apps/api/src/modules/staff-availability/staff-availability.controller.ts
apps/api/src/modules/staff-availability/staff-availability.service.ts
```

### Backend — Staff Preferences

```
apps/api/src/modules/staff-preferences/staff-preferences.module.ts
apps/api/src/modules/staff-preferences/staff-preferences.controller.ts
apps/api/src/modules/staff-preferences/staff-preferences.service.ts
```

### Backend — Scheduling Runs

```
apps/api/src/modules/scheduling-runs/scheduling-runs.module.ts
apps/api/src/modules/scheduling-runs/scheduling-runs.controller.ts
apps/api/src/modules/scheduling-runs/scheduling-runs.service.ts
apps/api/src/modules/scheduling-runs/scheduling-apply.service.ts
apps/api/src/modules/scheduling-runs/scheduling-prerequisites.service.ts
apps/api/src/modules/scheduling-runs/scheduling-dashboard.controller.ts
apps/api/src/modules/scheduling-runs/scheduling-dashboard.service.ts
```

### Worker Processors

```
apps/worker/src/processors/scheduling-solver.processor.ts
apps/worker/src/processors/scheduling-stale-reaper.processor.ts
```

### Frontend — Pages

```
apps/web/src/app/[locale]/(school)/scheduling/layout.tsx
apps/web/src/app/[locale]/(school)/scheduling/period-grid/page.tsx
apps/web/src/app/[locale]/(school)/scheduling/requirements/page.tsx
apps/web/src/app/[locale]/(school)/scheduling/availability/page.tsx
apps/web/src/app/[locale]/(school)/scheduling/preferences/page.tsx
apps/web/src/app/[locale]/(school)/scheduling/my-preferences/page.tsx
apps/web/src/app/[locale]/(school)/scheduling/my-satisfaction/page.tsx
apps/web/src/app/[locale]/(school)/scheduling/auto/page.tsx
apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/review/page.tsx
apps/web/src/app/[locale]/(school)/scheduling/dashboard/page.tsx
```

### Frontend — Components

```
apps/web/src/components/scheduling/period-grid-editor.tsx
apps/web/src/components/scheduling/class-requirements-table.tsx
apps/web/src/components/scheduling/availability-week-grid.tsx
apps/web/src/components/scheduling/preference-tabs.tsx
apps/web/src/components/scheduling/prerequisites-checklist.tsx
apps/web/src/components/scheduling/solver-progress-dialog.tsx
apps/web/src/components/scheduling/proposed-timetable-grid.tsx
apps/web/src/components/scheduling/constraint-report-panel.tsx
apps/web/src/components/scheduling/run-history-table.tsx
apps/web/src/components/scheduling/pin-toggle.tsx
```

---

## Section 9 — Files to Modify

### Prisma Schema

- **`packages/prisma/schema.prisma`** — Add 6 enums, 5 models, relations from Schedule to SchedulePeriodTemplate and SchedulingRun, reverse relations on Tenant, AcademicYear, StaffProfile, Class, Room, User

### Shared Package Exports

- **`packages/shared/src/types/index.ts`** — Export new type modules
- **`packages/shared/src/schemas/index.ts`** — Export new schema modules

### Backend App Module

- **`apps/api/src/app.module.ts`** — Import PeriodGridModule, ClassRequirementsModule, StaffAvailabilityModule, StaffPreferencesModule, SchedulingRunsModule

### Backend Schedules Module (Pin Management)

- **`apps/api/src/modules/schedules/schedules.controller.ts`** — Add pin, unpin, bulkPin endpoints
- **`apps/api/src/modules/schedules/schedules.service.ts`** — Add pin, unpin, bulkPin methods

### Worker

- **`apps/worker/src/base/queue.constants.ts`** — Add `SCHEDULING: 'scheduling'` to `QUEUE_NAMES`
- **`apps/worker/src/worker.module.ts`** — Register SchedulingSolverProcessor and SchedulingStaleReaperProcessor

### Frontend Navigation

- **`apps/web/src/app/[locale]/(school)/layout.tsx`** — Add scheduling sub-section items to sidebar nav (Period Grid, Requirements, Availability, Preferences, Auto-Scheduler, Dashboard). Conditionally show based on `autoSchedulerEnabled`.

### i18n

- **`apps/web/messages/en.json`** — Add ~100 keys under `scheduling.auto.*` namespace
- **`apps/web/messages/ar.json`** — Add Arabic translations for all new keys

### Seed Data

- **`packages/prisma/seed/dev-data.ts`** — Add dev fixtures for period grid (7 periods × 5 days), class requirements, staff availability, preferences

---

## Section 10 — Key Context for Executor

### Pattern References (with file paths)

1. **Controller pattern**: Follow `apps/api/src/modules/schedules/schedules.controller.ts`
   - `@Controller('v1/...')` + `@UseGuards(AuthGuard, PermissionGuard)`
   - `@RequiresPermission('...')` per endpoint
   - `@Body(new ZodValidationPipe(schema))` for request validation
   - `@CurrentTenant()` and `@CurrentUser()` parameter decorators
   - `@Query(new ZodValidationPipe(querySchema))` for query params

2. **Service RLS pattern**: Follow `apps/api/src/modules/schedules/schedules.service.ts`
   - `createRlsClient(this.prisma, { tenant_id: tenantId })` for RLS-scoped client
   - `prismaWithRls.$transaction(async (tx) => { ... })` for writes
   - Direct `this.prisma.model.findMany()` acceptable for reads (RLS still applies via middleware)
   - TIME fields arrive as `Date` objects from Prisma → format to `HH:mm` strings for API responses using `date.toISOString().slice(11, 16)`
   - Date fields arrive as `Date` → format to `YYYY-MM-DD` strings using `date.toISOString().slice(0, 10)`

3. **Worker pattern**: Follow `apps/worker/src/processors/attendance-session-generation.processor.ts`
   - Processor extends `WorkerHost`, job class extends `TenantAwareJob`
   - `@Processor(QUEUE_NAMES.SCHEDULING)` decorator
   - `@Inject('PRISMA_CLIENT')` for Prisma client
   - Job name check: `if (job.name !== JOB_NAME) return;`

4. **Module pattern**: Follow `apps/api/src/modules/schedules/schedules.module.ts`
   - `@Module({ controllers: [...], providers: [...], exports: [...] })`

5. **Zod schema pattern**: Follow `packages/shared/src/schemas/schedule.schema.ts`
   - TIME regex: `/^([01]\d|2[0-3]):[0-5]\d$/`
   - UUID: `z.string().uuid()`
   - Export both schema and inferred type

6. **Frontend page pattern**: Follow `apps/web/src/app/[locale]/(school)/schedules/page.tsx`
   - `useTranslations('scheduling')` for i18n
   - `PageHeader` component for page title
   - `DataTable` component for list views

7. **TimetableGrid pattern**: Follow `apps/web/src/components/timetable-grid.tsx`
   - Subject-based color coding
   - Weekday column headers using i18n
   - Logical CSS only (`text-start`, no `text-left`)

### Gotchas and Non-Obvious Requirements

1. **TIME column handling in Prisma**: Prisma stores TIME as `DateTime` (with a dummy 1970-01-01 date). When reading, extract time string: `date.toISOString().slice(11, 16)`. When writing, convert: `new Date(\`1970-01-01T${timeStr}:00.000Z\`)`.

2. **Exclusion constraint for period templates**: Requires creating a custom PostgreSQL `timerange` type. This must go in `post_migrate.sql` and be idempotent (`DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$`).

3. **MD5-based unique index for preferences**: Prisma cannot express this. Created in `post_migrate.sql` as a raw SQL unique index.

4. **Partial unique index for active runs**: Prisma cannot express `WHERE status IN (...)`. Created in `post_migrate.sql`.

5. **Large JSONB exclusion**: The `findAll` method for scheduling runs MUST use Prisma `select` to exclude `config_snapshot`, `result_json`, and `proposed_adjustments`. These can be 500KB+ each.

6. **Solver is pure TypeScript**: The solver module (`packages/shared/src/scheduler/`) has ZERO database dependencies. All data is passed in as typed objects. This makes it independently testable. The BullMQ job wrapper does all DB I/O.

7. **Solver progress via Redis**: The solver reports progress to a Redis key, not the database. This avoids hammering the DB with rapid writes during solving. The progress endpoint reads from Redis and falls back to DB status.

8. **Solver cancellation via Redis**: A Redis key `scheduling:cancel:{run_id}` is checked by the solver periodically. The solver accepts a `shouldCancel: () => boolean` callback.

9. **Apply transaction must be atomic**: The entire apply flow (delete old auto entries + insert new + update run status) MUST be in a single Prisma interactive transaction with `SELECT ... FOR UPDATE` on the run row.

10. **Attendance-safe deletion**: When applying, existing auto-generated entries that have linked attendance sessions cannot be hard-deleted. They must be end-dated (`effective_end_date = today`). Only entries without any attendance sessions are hard-deleted.

11. **Period grid drift detection**: Before applying, hash the current period grid and compare with the `config_snapshot` period grid hash. If different, return `SCHEDULER_PERIOD_GRID_CHANGED` error. The hash function must be deterministic (sort by weekday, period_order).

12. **Proposed adjustments are server-persisted**: Every drag-and-drop, swap, add, or remove during review is immediately persisted via PATCH to the DB. This makes the review crash-resilient. The merged timetable = `result_json` entries + `proposed_adjustments` operations applied sequentially.

13. **Student overlap computation**: Done at query time from `class_enrolments` — find all pairs of classes that share at least one student with `status = 'active'`. Not stored. Query: self-join `class_enrolments` on `student_id` where `class_id` differs.

14. **Multi-teacher handling**: `config_snapshot.classes[].teachers` includes ALL `class_staff` rows with `assignment_role IN ('teacher', 'homeroom')`. The solver must check ALL teachers' availability for each class. The primary teacher (first `teacher` role) is used for `schedules.teacher_staff_id`.

15. **Supervision subjects**: The `subjects.subject_type` enum already includes `supervision`, `duty`, `other` values. The period grid's `schedule_period_type` (`break_supervision`, `lunch_duty`) determines which periods supervision classes can be assigned to. The solver matches period type to class type.

16. **RTL weekday rendering**: In Arabic locale, weekday columns render right-to-left. The existing `TimetableGrid` component already handles this via Tailwind logical utilities. The proposed timetable grid must follow the same pattern.

17. **Approval workflow for non-school_owner apply**: If `tenant_settings.scheduling.requireApprovalForNonPrincipal = true` and the user doesn't have the `school_owner` system role, the apply action should check for an approved approval request. Use the existing approval workflow from Phase 1. The approval request type would be `scheduling_apply` with the run ID in metadata.

18. **`autoSchedulerEnabled` toggle**: All auto-scheduling UI (the entire `/scheduling/` route group) is hidden when this setting is `false`. Data is preserved — toggling back restores functionality. The sidebar nav items should also be conditionally shown.

19. **The `config_snapshot` serves as an immutable record**: Once the solver starts, the config_snapshot captures the exact state used for solving. This allows comparing what was assumed vs what currently exists (for drift detection, historical review, and debugging).

20. **Domain events**: After apply, emit `scheduling.run_applied`. After any config change (availability, requirements, preferences, class_staff), emit `scheduling.configuration_changed`. These update the staleness indicator on the dashboard. Domain events use the existing event pattern if established, or simple service-level method calls if not.
