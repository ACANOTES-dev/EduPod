# P4A Implementation Plan — Manual Scheduling + Attendance

---

## Section 1 — Overview

Phase 4A delivers manual scheduling and full attendance tracking. It adds room management, schedule entry CRUD with hard/soft conflict detection, timetable views (teacher/room/student), workload reporting, school closure management, and the complete attendance system: session generation (on-demand + nightly batch), class attendance marking with bulk "mark all present", session submission, historical amendments with audit trail, derived daily summaries, pending attendance detection, an exception dashboard, parent attendance visibility, and an initial teacher dashboard.

**Dependencies from prior phases:**
- **P2**: `classes`, `class_staff`, `class_enrolments`, `students`, `staff_profiles`, `academic_years`, `year_groups`, `subjects` tables and their services
- **P1**: Auth/RBAC infrastructure, tenant resolution, permission guards, `tenant_settings` (attendance config), `tenant_modules` (attendance toggle)
- **P0**: Prisma/RLS middleware (`createRlsClient`), BullMQ worker infrastructure (`TenantAwareJob`), response envelope interceptor, Zod validation pipe

**Services/modules this phase imports or extends:**
- `ClassesService` (P2) — extended with side-effect: setting class `inactive` end-dates future schedules
- `ClassEnrolmentsService` (P2) — queried for enrolled students during attendance
- `DashboardService` (P2) — extended with teacher dashboard endpoint
- `PermissionCacheService` (P1) — used for permission-aware data scoping
- `SettingsService` (P1) — read `tenant_settings.attendance.*` and `tenant_settings.general.attendanceVisibleToParents`

---

## Section 2 — Database Changes

### New Enums (6)

#### `RoomType`
Values: `classroom`, `lab`, `gym`, `auditorium`, `library`, `computer_lab`, `art_room`, `music_room`, `outdoor`, `other`

#### `ScheduleSource`
Values: `manual`, `auto_generated`, `pinned`

#### `ClosureScope`
Values: `all`, `year_group`, `class`

#### `AttendanceSessionStatus`
Values: `open`, `submitted`, `locked`, `cancelled`

#### `AttendanceRecordStatus`
Values: `present`, `absent_unexcused`, `absent_excused`, `late`, `left_early`

#### `DailyAttendanceStatus`
Values: `present`, `partially_absent`, `absent`, `late`, `excused`

---

### New Tables (6)

#### `rooms`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, `gen_random_uuid()` |
| tenant_id | UUID | FK → tenants, NOT NULL |
| name | VARCHAR(100) | NOT NULL |
| room_type | RoomType | NOT NULL, DEFAULT `classroom` |
| capacity | INT | NULL |
| is_exclusive | BOOLEAN | NOT NULL, DEFAULT `true` |
| active | BOOLEAN | NOT NULL, DEFAULT `true` |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT `now()`, `@updatedAt` |

**RLS**: Standard tenant isolation policy.
**Trigger**: `set_updated_at()` — yes.
**Indexes**:
- `idx_rooms_tenant ON rooms(tenant_id)`
- `idx_rooms_tenant_active ON rooms(tenant_id) WHERE active = true` (partial)
- `idx_rooms_tenant_name ON rooms(tenant_id, name)` (UNIQUE)

**Relations**: `tenant → Tenant`
**Seed data**: 5 rooms per dev tenant (2 classrooms, 1 lab, 1 gym, 1 library).

---

#### `schedules`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, `gen_random_uuid()` |
| tenant_id | UUID | FK → tenants, NOT NULL |
| class_id | UUID | FK → classes, NOT NULL |
| academic_year_id | UUID | FK → academic_years, NOT NULL |
| room_id | UUID | FK → rooms, NULL |
| teacher_staff_id | UUID | FK → staff_profiles, NULL |
| schedule_period_template_id | UUID | NULL (no FK yet — P4B table) |
| period_order | SMALLINT | NULL |
| weekday | SMALLINT | NOT NULL, CHECK (0 ≤ weekday ≤ 6), 0=Monday |
| start_time | TIME | NOT NULL |
| end_time | TIME | NOT NULL, CHECK (end_time > start_time) |
| effective_start_date | DATE | NOT NULL |
| effective_end_date | DATE | NULL |
| is_pinned | BOOLEAN | NOT NULL, DEFAULT `false` |
| pin_reason | TEXT | NULL |
| source | ScheduleSource | NOT NULL, DEFAULT `manual` |
| scheduling_run_id | UUID | NULL (no FK yet — P4B table) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT `now()`, `@updatedAt` |

**RLS**: Standard tenant isolation policy.
**Trigger**: `set_updated_at()` — yes.
**Foreign keys**: `tenant → Tenant`, `class → Class`, `academic_year → AcademicYear`, `room → Room`, `teacher → StaffProfile`. Note: `schedule_period_template_id` and `scheduling_run_id` are stored as plain `String? @db.Uuid` without Prisma relations — the referenced tables (`schedule_period_templates`, `scheduling_runs`) are created in P4B.
**Indexes**:
- `idx_schedules_tenant_class ON schedules(tenant_id, class_id, weekday)`
- `idx_schedules_tenant_room ON schedules(tenant_id, room_id, weekday)`
- `idx_schedules_tenant_teacher ON schedules(tenant_id, teacher_staff_id, weekday)`
- `idx_schedules_tenant_weekday ON schedules(tenant_id, weekday, effective_start_date, effective_end_date)`
- `idx_schedules_tenant_year ON schedules(tenant_id, academic_year_id)`
- `idx_schedules_pinned ON schedules(tenant_id, academic_year_id, is_pinned) WHERE is_pinned = true` (partial)
- `idx_schedules_auto_generated ON schedules(tenant_id, academic_year_id, source) WHERE source = 'auto_generated'` (partial)
- `idx_schedules_run ON schedules(scheduling_run_id) WHERE scheduling_run_id IS NOT NULL` (partial)

**Seed data**: 6–8 schedule entries per dev tenant linking existing classes, rooms, and teachers.

---

#### `school_closures`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, `gen_random_uuid()` |
| tenant_id | UUID | FK → tenants, NOT NULL |
| closure_date | DATE | NOT NULL |
| reason | VARCHAR(255) | NOT NULL |
| affects_scope | ClosureScope | NOT NULL, DEFAULT `all` |
| scope_entity_id | UUID | NULL |
| created_by_user_id | UUID | FK → users, NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` |

**No `updated_at`** — append-only table.
**RLS**: Standard tenant isolation policy.
**Trigger**: `set_updated_at()` — **no** (no `updated_at` column).
**Unique constraint**: `UNIQUE (tenant_id, closure_date, affects_scope, COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'))`
**Scope rules**: `all` → `scope_entity_id` is NULL. `year_group` → `scope_entity_id` FK → year_groups. `class` → `scope_entity_id` FK → classes. (Polymorphic FK — application-level validation, not DB FK constraint.)
**Indexes**:
- `idx_school_closures_tenant_date ON school_closures(tenant_id, closure_date)`
- `idx_school_closures_unique ON school_closures(tenant_id, closure_date, affects_scope, COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'))` (UNIQUE)

**Seed data**: 2 closure dates per dev tenant (one `all` scope, one `year_group` scope).

---

#### `attendance_sessions`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, `gen_random_uuid()` |
| tenant_id | UUID | FK → tenants, NOT NULL |
| class_id | UUID | FK → classes, NOT NULL |
| schedule_id | UUID | FK → schedules, NULL |
| session_date | DATE | NOT NULL |
| status | AttendanceSessionStatus | NOT NULL |
| override_reason | TEXT | NULL |
| submitted_by_user_id | UUID | FK → users, NULL |
| submitted_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT `now()`, `@updatedAt` |

**RLS**: Standard tenant isolation policy.
**Trigger**: `set_updated_at()` — yes.
**`cancelled` semantics**: Session generated but class did not take place. Excluded from daily summaries, exception reports, report card attendance, and payroll class count.
**`override_reason`**: Non-null only when session created on a closure date via admin override.
**Indexes**:
- `idx_attendance_sessions_unique ON attendance_sessions(tenant_id, class_id, session_date, schedule_id)` (UNIQUE) — for schedule-linked sessions
- `idx_attendance_sessions_adhoc_unique ON attendance_sessions(tenant_id, class_id, session_date) WHERE schedule_id IS NULL` (UNIQUE) — for ad-hoc sessions
- `idx_attendance_sessions_tenant_date ON attendance_sessions(tenant_id, session_date)`
- `idx_attendance_sessions_tenant_date_status ON attendance_sessions(tenant_id, session_date, status)`
- `idx_attendance_sessions_tenant_class_status ON attendance_sessions(tenant_id, class_id, status)`

**Seed data**: None (generated at runtime).

---

#### `attendance_records`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, `gen_random_uuid()` |
| tenant_id | UUID | FK → tenants, NOT NULL |
| attendance_session_id | UUID | FK → attendance_sessions, NOT NULL |
| student_id | UUID | FK → students, NOT NULL |
| status | AttendanceRecordStatus | NOT NULL |
| reason | TEXT | NULL |
| marked_by_user_id | UUID | FK → users, NOT NULL |
| marked_at | TIMESTAMPTZ | NOT NULL |
| amended_from_status | VARCHAR(50) | NULL |
| amendment_reason | TEXT | NULL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT `now()`, `@updatedAt` |

**RLS**: Standard tenant isolation policy.
**Trigger**: `set_updated_at()` — yes.
**Amendment rule**: When `amended_from_status` is non-null, `amendment_reason` is mandatory. Only users with `attendance.amend_historical` can amend.
**Indexes**:
- `idx_attendance_records_session ON attendance_records(tenant_id, attendance_session_id)`
- `idx_attendance_records_student ON attendance_records(tenant_id, student_id)`
- `idx_attendance_records_session_student ON attendance_records(tenant_id, attendance_session_id, student_id)` (UNIQUE)

**Seed data**: None (generated at runtime).

---

#### `daily_attendance_summaries`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, `gen_random_uuid()` |
| tenant_id | UUID | FK → tenants, NOT NULL |
| student_id | UUID | FK → students, NOT NULL |
| summary_date | DATE | NOT NULL |
| derived_status | DailyAttendanceStatus | NOT NULL |
| derived_payload | JSONB | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT `now()`, `@updatedAt` |

**RLS**: Standard tenant isolation policy.
**Trigger**: `set_updated_at()` — yes.
**Unique constraint**: `UNIQUE (tenant_id, student_id, summary_date)`
**`derived_payload` Zod schema**:
```typescript
z.object({
  sessions_total: z.number().int(),
  sessions_present: z.number().int(),
  sessions_absent: z.number().int(),
  sessions_late: z.number().int(),
  sessions_excused: z.number().int(),
  session_details: z.array(z.object({
    session_id: z.string().uuid(),
    class_id: z.string().uuid(),
    status: z.string(),
  })),
})
```

**Derivation trigger**: Runs in-code (not a DB trigger) after any attendance submission or amendment. Recalculates for the affected student + date. Only counts non-cancelled sessions where the student was enrolled.
**Indexes**:
- `idx_daily_summary_unique ON daily_attendance_summaries(tenant_id, student_id, summary_date)` (UNIQUE)

**Seed data**: None (derived at runtime).

---

### New Permissions (2)

| Permission Key | Tier | Description |
|----------------|------|-------------|
| `attendance.amend_historical` | admin | Amend past attendance records |
| `attendance.override_closure` | admin | Create attendance session on a closure date |

These must be added to:
1. `packages/shared/src/constants/permissions.ts` — add to `PERMISSIONS.attendance`, `PERMISSION_TIER_MAP`, and to `SYSTEM_ROLE_PERMISSIONS.school_owner` and `SYSTEM_ROLE_PERMISSIONS.school_admin`
2. `packages/prisma/seed/permissions.ts` — add to permission seed data

---

### Prisma Schema Additions to Existing Models

**Tenant model** — add relations:
```prisma
rooms              Room[]
schedules          Schedule[]
school_closures    SchoolClosure[]
attendance_sessions AttendanceSession[]
attendance_records  AttendanceRecord[]
daily_attendance_summaries DailyAttendanceSummary[]
```

**Class model** — add relations:
```prisma
schedules           Schedule[]
attendance_sessions AttendanceSession[]
```

**Student model** — add relations:
```prisma
attendance_records         AttendanceRecord[]
daily_attendance_summaries DailyAttendanceSummary[]
```

**StaffProfile model** — add relation:
```prisma
schedules Schedule[] @relation("schedule_teacher")
```

**AcademicYear model** — add relation:
```prisma
schedules Schedule[]
```

**User model** — add relations:
```prisma
school_closures_created SchoolClosure[]
attendance_sessions_submitted AttendanceSession[] @relation("session_submitter")
attendance_records_marked AttendanceRecord[] @relation("record_marker")
```

---

## Section 3 — API Endpoints

### 3.1 Rooms

#### `POST /v1/rooms`
- **Permission**: `schedule.manage`
- **Module guard**: `@ModuleEnabled('attendance')` (rooms are part of the scheduling/attendance module)
- **Request** (Zod: `createRoomSchema`):
  ```typescript
  { name: string, room_type?: RoomType, capacity?: number | null, is_exclusive?: boolean }
  ```
- **Response**: `{ data: Room }`
- **Business logic**: Validate unique (tenant_id, name). Create room.
- **Errors**: `ROOM_NAME_EXISTS` (409)

#### `GET /v1/rooms`
- **Permission**: `schedule.manage` OR `schedule.view_own`
- **Request query**: `?page=1&pageSize=20&active=true&room_type=classroom`
- **Response**: `{ data: Room[], meta: { page, pageSize, total } }`
- **Business logic**: List rooms with optional filters. Sorted by name.

#### `GET /v1/rooms/:id`
- **Permission**: `schedule.manage` OR `schedule.view_own`
- **Response**: `{ data: Room }`
- **Errors**: `ROOM_NOT_FOUND` (404)

#### `PATCH /v1/rooms/:id`
- **Permission**: `schedule.manage`
- **Request** (Zod: `updateRoomSchema`):
  ```typescript
  { name?: string, room_type?: RoomType, capacity?: number | null, is_exclusive?: boolean, active?: boolean }
  ```
- **Response**: `{ data: Room }`
- **Business logic**: Validate unique name if changed. If setting `active = false`, no side-effects on schedules (rooms can be deactivated independently).
- **Errors**: `ROOM_NOT_FOUND` (404), `ROOM_NAME_EXISTS` (409)

#### `DELETE /v1/rooms/:id`
- **Permission**: `schedule.manage`
- **Response**: `{ data: { success: true } }`
- **Business logic**: Check if room is referenced by any schedule. If yes → 409 `ROOM_IN_USE`. If no → hard delete.
- **Errors**: `ROOM_NOT_FOUND` (404), `ROOM_IN_USE` (409)

---

### 3.2 Schedules

#### `POST /v1/schedules`
- **Permission**: `schedule.manage`
- **Request** (Zod: `createScheduleSchema`):
  ```typescript
  {
    class_id: string,           // UUID, required
    room_id?: string | null,    // UUID, optional
    teacher_staff_id?: string | null, // UUID, optional
    weekday: number,            // 0-6 (0=Monday)
    start_time: string,         // HH:mm format
    end_time: string,           // HH:mm format
    effective_start_date: string, // YYYY-MM-DD
    effective_end_date?: string | null, // YYYY-MM-DD
    override_conflicts?: boolean,
    override_reason?: string,
  }
  ```
- **Response**: `{ data: Schedule, meta?: { conflicts: Conflict[] } }`
- **Business logic**:
  1. Validate class exists and is active
  2. Derive `academic_year_id` from `class.academic_year_id`
  3. Validate room exists if provided
  4. Validate teacher (staff_profile) exists if provided
  5. Validate `end_time > start_time`
  6. Validate `effective_end_date >= effective_start_date` if provided
  7. Run `ConflictDetectionService.detectConflicts(entry)` — returns `{ hard: Conflict[], soft: Conflict[] }`
  8. If `hard.length > 0` and `!override_conflicts` → return 409 `SCHEDULE_CONFLICT` with conflict details
  9. If `hard.length > 0` and `override_conflicts` → verify user has `schedule.override_conflict` permission, require `override_reason`
  10. Create schedule entry with `source = 'manual'`
  11. Return entry with any soft conflicts as warnings in meta
- **Errors**: `CLASS_NOT_FOUND` (404), `ROOM_NOT_FOUND` (404), `STAFF_NOT_FOUND` (404), `SCHEDULE_CONFLICT` (409), `INVALID_TIME_RANGE` (400), `OVERRIDE_PERMISSION_REQUIRED` (403)

#### `GET /v1/schedules`
- **Permission**: `schedule.manage` OR `schedule.view_own`
- **Request query**: `?academic_year_id=&class_id=&teacher_staff_id=&room_id=&weekday=&page=1&pageSize=50`
- **Response**: `{ data: Schedule[], meta: { page, pageSize, total } }`
- **Business logic**: If user has `schedule.view_own` but not `schedule.manage`, filter to schedules where `teacher_staff_id` matches user's staff profile. Include class name, room name, teacher name via joins.

#### `GET /v1/schedules/:id`
- **Permission**: `schedule.manage` OR `schedule.view_own`
- **Response**: `{ data: Schedule }` (with class, room, teacher details)
- **Errors**: `SCHEDULE_NOT_FOUND` (404)

#### `PATCH /v1/schedules/:id`
- **Permission**: `schedule.manage`
- **Request** (Zod: `updateScheduleSchema`):
  ```typescript
  {
    room_id?: string | null,
    teacher_staff_id?: string | null,
    weekday?: number,
    start_time?: string,
    end_time?: string,
    effective_start_date?: string,
    effective_end_date?: string | null,
    is_pinned?: boolean,
    pin_reason?: string,
    override_conflicts?: boolean,
    override_reason?: string,
  }
  ```
- **Response**: `{ data: Schedule, meta?: { conflicts: Conflict[] } }`
- **Business logic**: Same conflict detection as create (excluding self from overlap check). `class_id` and `academic_year_id` are immutable.
- **Errors**: Same as create + `SCHEDULE_NOT_FOUND` (404)

#### `DELETE /v1/schedules/:id`
- **Permission**: `schedule.manage`
- **Response**: `{ data: { success: true, action: 'deleted' | 'end_dated' } }`
- **Business logic** (deletion safety rule):
  1. Check if any `attendance_sessions` reference this `schedule_id`
  2. If yes → set `effective_end_date = today` (soft delete)
  3. If no → hard delete
- **Errors**: `SCHEDULE_NOT_FOUND` (404)

---

### 3.3 Timetable Views

#### `GET /v1/timetables/teacher/:staffProfileId`
- **Permission**: `schedule.manage` (any teacher) OR `schedule.view_own` (self only)
- **Request query**: `?academic_year_id=&week_start=YYYY-MM-DD`
- **Response**: `{ data: TimetableEntry[] }`
- **Business logic**: If user has only `schedule.view_own`, verify `staffProfileId` matches their own staff profile. Return all effective schedule entries for the teacher, grouped by weekday with class name, room name, time.
- **Errors**: `STAFF_NOT_FOUND` (404), `PERMISSION_DENIED` (403)

#### `GET /v1/timetables/room/:roomId`
- **Permission**: `schedule.manage`
- **Request query**: `?academic_year_id=&week_start=YYYY-MM-DD`
- **Response**: `{ data: TimetableEntry[] }`
- **Business logic**: Return all effective schedule entries for the room, grouped by weekday.
- **Errors**: `ROOM_NOT_FOUND` (404)

#### `GET /v1/timetables/student/:studentId`
- **Permission**: `students.view` (admin) OR `parent.view_own_students` (parent, linked students only)
- **Request query**: `?academic_year_id=&week_start=YYYY-MM-DD`
- **Response**: `{ data: TimetableEntry[] }`
- **Business logic**: Get student's active class enrolments → get schedules for those classes → return grouped by weekday. If parent, verify student is linked to their parent record.
- **Errors**: `STUDENT_NOT_FOUND` (404), `PERMISSION_DENIED` (403)

#### `GET /v1/reports/workload`
- **Permission**: `schedule.manage`
- **Request query**: `?academic_year_id=`
- **Response**: `{ data: WorkloadEntry[] }` where `WorkloadEntry = { staff_profile_id, name, total_periods, total_hours, per_day: { [weekday]: number } }`
- **Business logic**: Aggregate schedule entries per teacher for the academic year. Compute total periods and hours per week.

---

### 3.4 School Closures

#### `POST /v1/school-closures`
- **Permission**: `schedule.manage_closures`
- **Request** (Zod: `createClosureSchema`):
  ```typescript
  {
    closure_date: string,         // YYYY-MM-DD
    reason: string,
    affects_scope: ClosureScope,  // 'all' | 'year_group' | 'class'
    scope_entity_id?: string,     // UUID, required if scope != 'all'
  }
  ```
- **Response**: `{ data: SchoolClosure, meta?: { cancelled_sessions: number, flagged_sessions: AttendanceSession[] } }`
- **Business logic**:
  1. Validate scope: if `year_group` → verify year_group exists. If `class` → verify class exists.
  2. If scope is `all` → `scope_entity_id` must be null
  3. Check unique constraint (tenant_id, closure_date, affects_scope, coalesce)
  4. Create closure with `created_by_user_id` from current user
  5. **Side-effect**: Find attendance sessions matching closure scope + date:
     - `open` sessions → set status to `cancelled`
     - `submitted`/`locked` sessions → include in response `flagged_sessions` for admin resolution
  6. Return closure + side-effect report
- **Errors**: `CLOSURE_ALREADY_EXISTS` (409), `YEAR_GROUP_NOT_FOUND` (404), `CLASS_NOT_FOUND` (404)

#### `POST /v1/school-closures/bulk`
- **Permission**: `schedule.manage_closures`
- **Request** (Zod: `bulkCreateClosureSchema`):
  ```typescript
  {
    start_date: string,           // YYYY-MM-DD
    end_date: string,             // YYYY-MM-DD
    reason: string,
    affects_scope: ClosureScope,
    scope_entity_id?: string,
    skip_weekends?: boolean,      // default true
  }
  ```
- **Response**: `{ data: SchoolClosure[], meta: { created: number, skipped: number, cancelled_sessions: number, flagged_sessions: AttendanceSession[] } }`
- **Business logic**: Generate one closure per date in range. Skip weekends if flag set. Skip dates that already have a closure matching the same scope. Apply same side-effects as single create.

#### `GET /v1/school-closures`
- **Permission**: `attendance.view` OR `schedule.manage_closures`
- **Request query**: `?start_date=&end_date=&affects_scope=&page=1&pageSize=50`
- **Response**: `{ data: SchoolClosure[], meta: { page, pageSize, total } }`

#### `DELETE /v1/school-closures/:id`
- **Permission**: `schedule.manage_closures`
- **Response**: `{ data: { success: true } }`
- **Business logic**: Hard delete. No side-effect on already-cancelled sessions (they remain cancelled — admin can manually reopen if needed).
- **Errors**: `CLOSURE_NOT_FOUND` (404)

---

### 3.5 Attendance Sessions

#### `POST /v1/attendance-sessions`
- **Permission**: `attendance.take` (own classes) OR `attendance.manage` (any class)
- **Request** (Zod: `createAttendanceSessionSchema`):
  ```typescript
  {
    class_id: string,
    schedule_id?: string | null,
    session_date: string,          // YYYY-MM-DD
    override_closure?: boolean,
    override_reason?: string,
  }
  ```
- **Response**: `{ data: AttendanceSession }`
- **Business logic** (on-demand generation):
  1. Validate class exists
  2. If `attendance.take` only → verify user is assigned to the class (via class_staff)
  3. Validate session_date is within the class's academic year date range
  4. Check for school closure on session_date affecting this class (scope check: `all`, `year_group` matching class year group, `class` matching class_id)
  5. If closure exists and `!override_closure` → return 409 `DATE_IS_CLOSURE`
  6. If closure exists and `override_closure` → verify user has `attendance.override_closure` permission, require `override_reason`
  7. Use `INSERT ... ON CONFLICT DO NOTHING RETURNING *` for race prevention
  8. If conflict (session exists) → return existing session
  9. Create session with status `open`
  10. Return session
- **Errors**: `CLASS_NOT_FOUND` (404), `DATE_IS_CLOSURE` (409), `DATE_OUTSIDE_ACADEMIC_YEAR` (400), `NOT_ASSIGNED_TO_CLASS` (403), `OVERRIDE_PERMISSION_REQUIRED` (403)

#### `GET /v1/attendance-sessions`
- **Permission**: `attendance.view` (all) OR `attendance.take` (own classes only)
- **Request query**: `?session_date=&start_date=&end_date=&class_id=&status=&page=1&pageSize=20`
- **Response**: `{ data: AttendanceSession[], meta: { page, pageSize, total } }`
- **Business logic**: If `attendance.take` only → filter to classes the teacher is assigned to. Includes class name, record counts (present/absent/total).

#### `GET /v1/attendance-sessions/:id`
- **Permission**: `attendance.view` OR `attendance.take` (own class)
- **Response**: `{ data: AttendanceSession & { records: AttendanceRecord[], enrolled_students: Student[] } }`
- **Business logic**: Return session with all records and list of enrolled students (for the marking screen to show unmarked students).
- **Errors**: `SESSION_NOT_FOUND` (404)

#### `PATCH /v1/attendance-sessions/:id/cancel`
- **Permission**: `attendance.manage`
- **Request**: `{ reason?: string }`
- **Response**: `{ data: AttendanceSession }`
- **Business logic**: Only sessions in `open` status can be cancelled. Sets status to `cancelled`.
- **Errors**: `SESSION_NOT_FOUND` (404), `INVALID_STATUS_TRANSITION` (400)

---

### 3.6 Attendance Records

#### `PUT /v1/attendance-sessions/:sessionId/records`
- **Permission**: `attendance.take` (own class) OR `attendance.manage`
- **Request** (Zod: `saveAttendanceRecordsSchema`):
  ```typescript
  {
    records: Array<{
      student_id: string,
      status: AttendanceRecordStatus,
      reason?: string,
    }>
  }
  ```
- **Response**: `{ data: AttendanceRecord[] }`
- **Business logic**:
  1. Validate session exists and status is `open`
  2. If `attendance.take` only → verify user is assigned to the class
  3. Validate all student_ids are actively enrolled in the class on the session date
  4. Upsert records: for each student, create or update `attendance_records` (INSERT ... ON CONFLICT (tenant_id, attendance_session_id, student_id) DO UPDATE)
  5. Set `marked_by_user_id` and `marked_at` on each record
  6. Return all records for the session
- **Errors**: `SESSION_NOT_FOUND` (404), `SESSION_NOT_OPEN` (400), `STUDENT_NOT_ENROLLED` (400)

#### `PATCH /v1/attendance-sessions/:sessionId/submit`
- **Permission**: `attendance.take` (own class) OR `attendance.manage`
- **Response**: `{ data: AttendanceSession }`
- **Business logic**:
  1. Validate session exists and status is `open`
  2. Check all enrolled students have records (warn if not all marked — but don't block)
  3. Set `status = 'submitted'`, `submitted_by_user_id`, `submitted_at`
  4. **Trigger daily summary recalculation**: for each student with a record in this session, call `DailySummaryService.recalculate(tenantId, studentId, sessionDate)`
  5. Return updated session
- **Errors**: `SESSION_NOT_FOUND` (404), `SESSION_NOT_OPEN` (400)

#### `PATCH /v1/attendance-records/:id/amend`
- **Permission**: `attendance.amend_historical`
- **Request** (Zod: `amendAttendanceRecordSchema`):
  ```typescript
  {
    status: AttendanceRecordStatus,
    amendment_reason: string,  // required
  }
  ```
- **Response**: `{ data: AttendanceRecord }`
- **Business logic**:
  1. Validate record exists
  2. Validate parent session is `submitted` or `locked`
  3. Store current `status` in `amended_from_status`
  4. Update `status`, `amendment_reason`, `marked_by_user_id` (amending user), `marked_at`
  5. **Trigger daily summary recalculation** for the student + date
  6. Return updated record
- **Errors**: `RECORD_NOT_FOUND` (404), `SESSION_NOT_AMENDABLE` (400, if session is `open` or `cancelled`), `AMENDMENT_REASON_REQUIRED` (400)

---

### 3.7 Daily Attendance Summaries

#### `GET /v1/attendance/daily-summaries`
- **Permission**: `attendance.view`
- **Request query**: `?student_id=&start_date=&end_date=&derived_status=&page=1&pageSize=20`
- **Response**: `{ data: DailyAttendanceSummary[], meta: { page, pageSize, total } }`

#### `GET /v1/attendance/daily-summaries/student/:studentId`
- **Permission**: `attendance.view` OR `parent.view_attendance` (linked students only, if attendance visible to parents)
- **Request query**: `?start_date=&end_date=`
- **Response**: `{ data: DailyAttendanceSummary[] }`
- **Business logic**: If parent → verify student is linked, verify `tenant_settings.general.attendanceVisibleToParents = true`. Return summaries for date range.
- **Errors**: `STUDENT_NOT_FOUND` (404), `ATTENDANCE_NOT_VISIBLE` (403)

---

### 3.8 Exception Dashboard

#### `GET /v1/attendance/exceptions`
- **Permission**: `attendance.manage`
- **Request query**: `?date=&start_date=&end_date=`
- **Response**:
  ```typescript
  {
    data: {
      pending_sessions: Array<{
        session: AttendanceSession,
        class_name: string,
        teacher_name?: string,
        session_date: string,
      }>,
      excessive_absences: Array<{
        student_id: string,
        student_name: string,
        class_homeroom: string,
        absent_count: number,
        period_start: string,
        period_end: string,
      }>,
    }
  }
  ```
- **Business logic**:
  1. **Pending sessions**: Find all sessions with status `open` for the date range (default: today). Include class name and assigned teacher.
  2. **Excessive absences**: Find students where `daily_attendance_summaries.derived_status IN ('absent', 'partially_absent')` count exceeds a threshold (configurable — default 5 in the past 30 days). Group by student.

---

### 3.9 Teacher Dashboard

#### `GET /v1/dashboard/teacher`
- **Permission**: `attendance.take`
- **Response**:
  ```typescript
  {
    data: {
      todays_schedule: TimetableEntry[],
      todays_sessions: Array<{
        session: AttendanceSession,
        class_name: string,
        marked_count: number,
        enrolled_count: number,
      }>,
      pending_submissions: number,
    }
  }
  ```
- **Business logic**:
  1. Get user's staff profile
  2. Get today's schedule entries for this teacher
  3. Get today's attendance sessions for classes this teacher is assigned to
  4. Count sessions with status `open` (pending submissions)

---

### 3.10 Parent Attendance View

#### `GET /v1/parent/students/:studentId/attendance`
- **Permission**: `parent.view_attendance`
- **Request query**: `?start_date=&end_date=`
- **Response**: `{ data: AttendanceRecord[] }` (with session details)
- **Business logic**: Verify student is linked to parent. Verify `tenant_settings.general.attendanceVisibleToParents = true`. Return attendance records for date range, only from non-cancelled submitted/locked sessions.
- **Errors**: `STUDENT_NOT_LINKED` (403), `ATTENDANCE_NOT_VISIBLE` (403)

---

## Section 4 — Service Layer

### 4.1 RoomsService

- **Class**: `RoomsService`
- **Module**: `RoomsModule`
- **File**: `apps/api/src/modules/rooms/rooms.service.ts`
- **Dependencies**: `PrismaService`

**Methods**:
- `create(tenant: TenantContext, dto: CreateRoomDto): Promise<Room>` — validate unique name, create with RLS
- `findAll(tenant: TenantContext, query: RoomListQuery): Promise<{ data: Room[], meta: PaginationMeta }>` — list with filters + pagination
- `findOne(tenant: TenantContext, id: string): Promise<Room>` — find by ID, throw `NotFoundException` if not found
- `update(tenant: TenantContext, id: string, dto: UpdateRoomDto): Promise<Room>` — validate unique name if changed
- `remove(tenant: TenantContext, id: string): Promise<void>` — check if in use by schedules, throw `ConflictException` if in use

---

### 4.2 ConflictDetectionService

- **Class**: `ConflictDetectionService`
- **Module**: `SchedulesModule`
- **File**: `apps/api/src/modules/schedules/conflict-detection.service.ts`
- **Dependencies**: `PrismaService`

**Methods**:
- `detectConflicts(tenant: TenantContext, entry: ProposedScheduleEntry, excludeId?: string): Promise<{ hard: Conflict[], soft: Conflict[] }>`

**Conflict detection logic** (step by step):
1. Build overlap filter:
   ```
   weekday = entry.weekday
   AND start_time < entry.end_time AND end_time > entry.start_time
   AND (effective_end_date IS NULL OR effective_end_date >= entry.effective_start_date)
   AND (entry.effective_end_date IS NULL OR effective_start_date <= entry.effective_end_date)
   AND id != excludeId (for updates)
   ```
2. **Room double-booking** (if room_id provided):
   - Query schedules with same room_id matching overlap filter
   - Lookup `room.is_exclusive`
   - If exclusive → add hard conflict for each match
   - If non-exclusive → add soft conflict (warning)
3. **Teacher double-booking** (if teacher_staff_id provided):
   - Query schedules with same teacher_staff_id matching overlap filter
   - Add hard conflict for each match
4. **Student double-booking**:
   - Get all student_ids actively enrolled in the proposed class
   - Get all other classes those students are enrolled in
   - Check if any of those classes have schedules matching overlap filter
   - Add hard conflict for each student with overlap (include student name + conflicting class)
5. **Room over capacity** (if room_id and room.capacity provided):
   - Count active enrolments in the class
   - If count > room.capacity → add soft conflict
6. **Teacher workload threshold** (if teacher_staff_id provided):
   - Read `tenant_settings.scheduling.teacherWeeklyMaxPeriods`
   - If set, count all effective schedule entries for this teacher in the same academic year
   - If adding this entry would exceed threshold → add soft conflict

**Conflict type**:
```typescript
interface Conflict {
  type: 'hard' | 'soft';
  category: 'room_double_booking' | 'teacher_double_booking' | 'student_double_booking'
           | 'room_over_capacity' | 'teacher_workload' | 'room_shared_warning';
  message: string;
  message_ar?: string;
  conflicting_schedule_id?: string;
  conflicting_entity?: { id: string; name: string };
}
```

---

### 4.3 SchedulesService

- **Class**: `SchedulesService`
- **Module**: `SchedulesModule`
- **File**: `apps/api/src/modules/schedules/schedules.service.ts`
- **Dependencies**: `PrismaService`, `ConflictDetectionService`

**Methods**:
- `create(tenant: TenantContext, userId: string, dto: CreateScheduleDto): Promise<{ schedule: Schedule, conflicts: Conflict[] }>` — validate FKs, derive academic_year_id from class, run conflict detection, create if allowed
- `findAll(tenant: TenantContext, query: ScheduleListQuery, userStaffProfileId?: string): Promise<{ data: Schedule[], meta: PaginationMeta }>` — list with filters, optional teacher scoping
- `findOne(tenant: TenantContext, id: string): Promise<Schedule>` — with class/room/teacher includes
- `update(tenant: TenantContext, id: string, userId: string, dto: UpdateScheduleDto): Promise<{ schedule: Schedule, conflicts: Conflict[] }>` — conflict detection excluding self
- `remove(tenant: TenantContext, id: string): Promise<{ action: 'deleted' | 'end_dated' }>` — deletion safety rule
- `endDateForClass(tenant: TenantContext, classId: string): Promise<number>` — end-date all future schedules for a class (called when class set to inactive). Returns count of entries updated.

---

### 4.4 TimetablesService

- **Class**: `TimetablesService`
- **Module**: `SchedulesModule`
- **File**: `apps/api/src/modules/schedules/timetables.service.ts`
- **Dependencies**: `PrismaService`

**Methods**:
- `getTeacherTimetable(tenant: TenantContext, staffProfileId: string, query: TimetableQuery): Promise<TimetableEntry[]>` — effective schedules for teacher, with class name, room name
- `getRoomTimetable(tenant: TenantContext, roomId: string, query: TimetableQuery): Promise<TimetableEntry[]>` — effective schedules for room, with class name, teacher name
- `getStudentTimetable(tenant: TenantContext, studentId: string, query: TimetableQuery): Promise<TimetableEntry[]>` — derive from active class enrolments → class schedules
- `getWorkloadReport(tenant: TenantContext, academicYearId: string): Promise<WorkloadEntry[]>` — aggregate hours per teacher per weekday

**TimetableEntry shape**:
```typescript
{
  schedule_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  class_id: string;
  class_name: string;
  room_id?: string;
  room_name?: string;
  teacher_staff_id?: string;
  teacher_name?: string;
  subject_name?: string;
}
```

---

### 4.5 SchoolClosuresService

- **Class**: `SchoolClosuresService`
- **Module**: `SchoolClosuresModule`
- **File**: `apps/api/src/modules/school-closures/school-closures.service.ts`
- **Dependencies**: `PrismaService`

**Methods**:
- `create(tenant: TenantContext, userId: string, dto: CreateClosureDto): Promise<{ closure: SchoolClosure, cancelled_sessions: number, flagged_sessions: AttendanceSession[] }>` — validate scope entity, check unique, create closure, apply session side-effects
- `bulkCreate(tenant: TenantContext, userId: string, dto: BulkCreateClosureDto): Promise<{ closures: SchoolClosure[], created: number, skipped: number, cancelled_sessions: number, flagged_sessions: AttendanceSession[] }>` — iterate date range, skip existing, apply side-effects
- `findAll(tenant: TenantContext, query: ClosureListQuery): Promise<{ data: SchoolClosure[], meta: PaginationMeta }>` — list with filters
- `remove(tenant: TenantContext, id: string): Promise<void>` — hard delete
- `isClosureDate(tenant: TenantContext, date: string, classId: string, yearGroupId?: string): Promise<boolean>` — check if a date is a closure for a given class (checks all three scopes: all, year_group, class). Used by AttendanceService.

---

### 4.6 AttendanceService

- **Class**: `AttendanceService`
- **Module**: `AttendanceModule`
- **File**: `apps/api/src/modules/attendance/attendance.service.ts`
- **Dependencies**: `PrismaService`, `SchoolClosuresService`, `DailySummaryService`

**Methods**:
- `createSession(tenant: TenantContext, userId: string, dto: CreateSessionDto, userPermissions: string[]): Promise<AttendanceSession>` — on-demand session generation with closure check, override flow, INSERT ON CONFLICT
- `findAllSessions(tenant: TenantContext, query: SessionListQuery, userStaffProfileId?: string): Promise<{ data: AttendanceSession[], meta: PaginationMeta }>` — list with filters, optional teacher scoping
- `findOneSession(tenant: TenantContext, id: string): Promise<AttendanceSession & { records, enrolled_students }>` — session with records and enrolled student list
- `cancelSession(tenant: TenantContext, id: string): Promise<AttendanceSession>` — validate status transition open → cancelled
- `saveRecords(tenant: TenantContext, sessionId: string, userId: string, dto: SaveRecordsDto): Promise<AttendanceRecord[]>` — upsert records for session
- `submitSession(tenant: TenantContext, sessionId: string, userId: string): Promise<AttendanceSession>` — transition open → submitted, trigger daily summary recalculation for all affected students
- `amendRecord(tenant: TenantContext, recordId: string, userId: string, dto: AmendRecordDto): Promise<AttendanceRecord>` — amend historical record, trigger daily summary recalculation
- `getExceptions(tenant: TenantContext, query: ExceptionQuery): Promise<ExceptionDashboardData>` — pending sessions + excessive absences
- `getStudentAttendance(tenant: TenantContext, studentId: string, query: DateRangeQuery): Promise<AttendanceRecord[]>` — for parent view
- `batchGenerateSessions(tenant: TenantContext, date: string): Promise<number>` — nightly batch: generate sessions for all applicable schedules on the date. Returns count created.
- `lockExpiredSessions(tenant: TenantContext): Promise<number>` — auto-lock submitted sessions older than `tenant_settings.attendance.autoLockAfterDays`. Returns count locked.

**State machine for attendance sessions**:
```
open → submitted (via submit)
open → cancelled (via cancel)
submitted → locked (via auto-lock job or manual)
```
Blocked transitions: `submitted → open`, `locked → *`, `cancelled → *`

---

### 4.7 DailySummaryService

- **Class**: `DailySummaryService`
- **Module**: `AttendanceModule`
- **File**: `apps/api/src/modules/attendance/daily-summary.service.ts`
- **Dependencies**: `PrismaService`

**Methods**:
- `recalculate(tenant: TenantContext, studentId: string, date: string): Promise<DailyAttendanceSummary>` — recalculate daily summary for a student on a date
- `findAll(tenant: TenantContext, query: SummaryListQuery): Promise<{ data: DailyAttendanceSummary[], meta: PaginationMeta }>` — list with filters
- `findForStudent(tenant: TenantContext, studentId: string, query: DateRangeQuery): Promise<DailyAttendanceSummary[]>` — for student detail view

**Recalculation logic** (step by step):
1. Get all attendance records for the student on the date, from non-cancelled sessions, where the student was actively enrolled in the session's class on the session date
2. Aggregate counts:
   - `sessions_total` = count of records
   - `sessions_present` = count where status = `present`
   - `sessions_absent` = count where status IN (`absent_unexcused`, `absent_excused`)
   - `sessions_late` = count where status = `late`
   - `sessions_excused` = count where status = `absent_excused`
   - (Note: `left_early` counts towards present for the summary — student was present)
3. Build `session_details` array
4. Derive status:
   - If `sessions_total == 0` → delete existing summary, return
   - If `sessions_absent == 0 && sessions_late == 0` → `present`
   - If `sessions_present == 0 && sessions_late == 0 && sessions_excused == sessions_absent` → `excused`
   - If `sessions_present == 0 && sessions_late == 0` → `absent`
   - If `sessions_late > 0 && sessions_absent == 0` → `late`
   - Otherwise → `partially_absent`
5. Upsert `daily_attendance_summaries` (INSERT ON CONFLICT UPDATE)

---

### 4.8 DashboardService (Extended)

- **Class**: `DashboardService` (existing)
- **File**: `apps/api/src/modules/dashboard/dashboard.service.ts`
- **Dependencies**: `PrismaService`, `RedisService`

**New method**:
- `getTeacherDashboard(tenant: TenantContext, userId: string): Promise<TeacherDashboardData>` — get staff profile, today's schedules, today's sessions, pending submission count

---

## Section 5 — Frontend Pages and Components

### 5.1 Shared Components (new)

#### `TimetableGrid`
- **File**: `apps/web/src/components/timetable-grid.tsx`
- **Type**: Client component
- **Props**: `entries: TimetableEntry[]`, `weekdays: number[]`, `onEntryClick?: (entry) => void`
- **Renders**: Weekly grid (Mon–Fri or Mon–Sat) with time rows. Each cell shows class name, room, teacher. Colour-coded by subject type. RTL-safe layout using logical CSS.

#### `AttendanceStatusBadge`
- **File**: `apps/web/src/components/attendance-status-badge.tsx`
- **Type**: Server component (pure display)
- **Props**: `status: AttendanceRecordStatus | AttendanceSessionStatus | DailyAttendanceStatus`
- **Renders**: StatusBadge with appropriate colour per status.

#### `ConflictAlert`
- **File**: `apps/web/src/components/conflict-alert.tsx`
- **Type**: Client component
- **Props**: `conflicts: Conflict[]`, `onOverride?: () => void`, `canOverride: boolean`
- **Renders**: Alert with list of hard/soft conflicts. Override button if user has permission.

---

### 5.2 Room Pages

#### Room List — `/[locale]/(school)/rooms/page.tsx`
- **Type**: Client component
- **Data**: `GET /v1/rooms`
- **UI**: DataTable (name, type badge, capacity, exclusive badge, active badge). Filter by type, active. Create button → dialog.
- **Roles**: `schedule.manage`

#### Room Create/Edit Dialog
- **File**: `apps/web/src/app/[locale]/(school)/rooms/_components/room-form.tsx`
- **Type**: Client component
- **UI**: Dialog with name input, room_type select, capacity number input, is_exclusive switch.

#### Room Detail — `/[locale]/(school)/rooms/[id]/page.tsx`
- **Type**: Client component
- **Data**: `GET /v1/rooms/:id`, `GET /v1/timetables/room/:id`
- **UI**: RecordHub with Overview tab (room info) and Timetable tab (TimetableGrid).
- **Roles**: `schedule.manage`

---

### 5.3 Schedule Pages

#### Schedule Management — `/[locale]/(school)/schedules/page.tsx`
- **Type**: Client component
- **Data**: `GET /v1/schedules`, `GET /v1/classes`, `GET /v1/rooms`, `GET /v1/staff-profiles`
- **UI**: DataTable of schedule entries (class, teacher, room, weekday, time, date range, source). Filters: academic year, class, teacher, room, weekday. Create button opens dialog.
- **Roles**: `schedule.manage`

#### Schedule Create/Edit Dialog
- **File**: `apps/web/src/app/[locale]/(school)/schedules/_components/schedule-form.tsx`
- **Type**: Client component
- **UI**: Dialog with class select, teacher select, room select, weekday select, time range pickers, date range pickers. On save → POST with conflict detection. If conflicts returned → show ConflictAlert with override option.

---

### 5.4 Timetable Page

#### Timetable Views — `/[locale]/(school)/timetables/page.tsx`
- **Type**: Client component
- **Data**: Depends on active tab — `GET /v1/timetables/teacher/:id`, `GET /v1/timetables/room/:id`, `GET /v1/timetables/student/:id`
- **UI**: Tabs (Teacher, Room, Student). Each tab has a selector dropdown (teacher list, room list, student search). Below selector: TimetableGrid. Academic year filter at top.
- **Roles**: `schedule.manage` sees all tabs. `schedule.view_own` sees Teacher tab (own only). `parent.view_own_students` sees Student tab (own children).

---

### 5.5 School Closures Page

#### Closures — `/[locale]/(school)/settings/closures/page.tsx`
- **Type**: Client component
- **Data**: `GET /v1/school-closures`
- **UI**: DataTable (date, reason, scope, scope entity name, created by). Bulk create button → dialog with date range picker, reason, scope select. Delete action per row.
- **Roles**: `schedule.manage_closures`

#### Closure Bulk Create Dialog
- **File**: `apps/web/src/app/[locale]/(school)/settings/closures/_components/closure-form.tsx`
- **Type**: Client component
- **UI**: Date range picker (start, end), reason input, scope select (all/year_group/class), entity selector if scoped, skip weekends toggle.

---

### 5.6 Workload Report Page

#### Workload — `/[locale]/(school)/reports/workload/page.tsx`
- **Type**: Client component
- **Data**: `GET /v1/reports/workload`
- **UI**: Academic year selector. Table: teacher name, Mon–Fri period counts, total periods, total hours. Sorted by total hours desc.
- **Roles**: `schedule.manage`

---

### 5.7 Attendance Pages

#### Attendance Sessions List — `/[locale]/(school)/attendance/page.tsx`
- **Type**: Client component
- **Data**: `GET /v1/attendance-sessions`
- **UI**: DataTable (date, class, status badge, teacher, marked/enrolled count). Filters: date range, class, status. "Open Marking" button per open session. "Create Session" button.
- **Roles**: `attendance.view` sees all. `attendance.take` sees own classes.

#### Attendance Marking — `/[locale]/(school)/attendance/mark/[sessionId]/page.tsx`
- **Type**: Client component
- **Data**: `GET /v1/attendance-sessions/:sessionId` (includes records + enrolled students)
- **UI**:
  - Session header: class name, date, schedule time, status
  - "Mark All Present" button → sets all students to `present`
  - Student list: each row has student name, status radio group (present/absent_unexcused/absent_excused/late/left_early), optional reason textarea (shown for non-present)
  - "Save" button → `PUT /v1/attendance-sessions/:id/records`
  - "Submit" button → `PATCH /v1/attendance-sessions/:id/submit` (only after save)
  - Toast confirmation on submit
- **Roles**: `attendance.take` (own class) or `attendance.manage`

#### Attendance Exceptions — `/[locale]/(school)/attendance/exceptions/page.tsx`
- **Type**: Client component
- **Data**: `GET /v1/attendance/exceptions`
- **UI**: Two sections:
  1. **Pending Sessions**: Cards showing class name, date, teacher, time since session opened. Click to open marking screen.
  2. **Excessive Absences**: Table of students with absence count, class, link to student record.
- **Roles**: `attendance.manage`

---

### 5.8 Teacher Dashboard Update

#### Dashboard — `/[locale]/(school)/dashboard/page.tsx` (modified)
- **Data**: Existing school admin data + new `GET /v1/dashboard/teacher` for teachers
- **UI change**: If user has `attendance.take` role, show a "Today's Schedule" section with:
  - Today's timetable entries
  - Today's sessions with quick-action to "Mark Attendance" (links to marking page)
  - Pending submission count badge

---

### 5.9 Parent Attendance View

#### Parent Dashboard — `/[locale]/(school)/dashboard/parent/page.tsx` (modified)
- **Data**: Existing parent data + new `GET /v1/parent/students/:studentId/attendance` + `GET /v1/attendance/daily-summaries/student/:studentId`
- **UI change**: Add "Attendance" section per student (if `attendanceVisibleToParents` enabled):
  - Summary row: present %, absent count, late count for current period
  - Expandable daily detail with session-by-session breakdown
  - AttendanceStatusBadge for each entry

---

### 5.10 Sidebar Navigation Updates

Add to school sidebar (`apps/web/src/app/[locale]/(school)/layout.tsx`):
- **Rooms** link (under Scheduling section) — visible if `schedule.manage`
- **Schedules** link — visible if `schedule.manage`
- **Timetables** link — visible if `schedule.manage` OR `schedule.view_own`
- **Attendance** link — visible if `attendance.view` OR `attendance.take`
- **Closures** link (under Settings section) — visible if `schedule.manage_closures`
- **Workload** link (under Reports section) — visible if `schedule.manage`

---

## Section 6 — Background Jobs

### 6.1 Attendance Session Generation Job

- **Job name**: `attendance:generate-sessions`
- **Queue**: `attendance` (new queue)
- **Processor file**: `apps/worker/src/processors/attendance-session-generation.processor.ts`
- **Trigger**: Scheduled cron job running at `tenant_settings.attendance.pendingAlertTimeHour` (default 14:00). A dispatcher job runs hourly, checks each tenant's configured hour, and enqueues per-tenant generation jobs.
- **Payload**: `{ tenant_id: string, date: string }`
- **Processing logic**:
  1. Set RLS context for tenant
  2. Get all active schedules for today's weekday
  3. For each schedule:
     a. Check if session already exists (skip if yes)
     b. Check date is within academic year range
     c. Check for school closure (skip if closure)
     d. Create session with status `open` via `INSERT ... ON CONFLICT DO NOTHING`
  4. Log count of sessions created
- **Retry**: 3 attempts with exponential backoff. DLQ on failure.

### 6.2 Pending Attendance Detection Job

- **Job name**: `attendance:detect-pending`
- **Queue**: `attendance`
- **Processor file**: `apps/worker/src/processors/attendance-pending-detection.processor.ts`
- **Trigger**: Runs daily at 18:00 (6 PM) for each tenant (configurable later).
- **Payload**: `{ tenant_id: string, date: string }`
- **Processing logic**:
  1. Set RLS context
  2. Find all sessions for the date with status `open`
  3. These are already surfaced via the exception dashboard endpoint — this job is primarily for future notification integration (P6)
  4. Optionally: cache count in Redis for dashboard quick-display
- **Retry**: 2 attempts. Low priority — informational only.

### 6.3 Auto-Lock Sessions Job

- **Job name**: `attendance:auto-lock`
- **Queue**: `attendance`
- **Processor file**: `apps/worker/src/processors/attendance-auto-lock.processor.ts`
- **Trigger**: Runs daily at 02:00 for each tenant.
- **Payload**: `{ tenant_id: string }`
- **Processing logic**:
  1. Set RLS context
  2. Read `tenant_settings.attendance.autoLockAfterDays`
  3. If NULL → skip (auto-lock disabled)
  4. Find all `submitted` sessions where `submitted_at < now() - autoLockAfterDays`
  5. Update status to `locked`
  6. Log count of sessions locked
- **Retry**: 3 attempts.

---

## Section 7 — Implementation Order

### Step 1: Database Migration + Seed
1. Add 6 new enums to Prisma schema
2. Add 6 new models (rooms, schedules, school_closures, attendance_sessions, attendance_records, daily_attendance_summaries) with all columns, types, constraints
3. Add relations to existing models (Tenant, Class, Student, StaffProfile, AcademicYear, User)
4. Generate migration: `npx prisma migrate dev --name add-p4a-scheduling-attendance`
5. Write `post_migrate.sql`: RLS policies (6 tables), `set_updated_at()` triggers (5 tables, not school_closures), unique indexes with COALESCE
6. Update seed: add 2 new permissions, add to system role defaults, add dev rooms and schedules

### Step 2: Shared Types and Zod Schemas
1. Create types: `room.ts`, `schedule.ts`, `school-closure.ts`, `attendance.ts`
2. Create schemas: `room.schema.ts`, `schedule.schema.ts`, `school-closure.schema.ts`, `attendance.schema.ts`
3. Update `permissions.ts`: add `attendance.amend_historical`, `attendance.override_closure` to PERMISSIONS, PERMISSION_TIER_MAP, SYSTEM_ROLE_PERMISSIONS
4. Export all from `packages/shared/src/index.ts`

### Step 3: Backend — Rooms Module
1. Create `RoomsModule`, `RoomsController`, `RoomsService`
2. CRUD endpoints: create, list, get, update, delete
3. Register module in `app.module.ts`

### Step 4: Backend — Schedules Module (core)
1. Create `SchedulesModule`
2. Create `ConflictDetectionService` with all conflict checks
3. Create `SchedulesService` with CRUD + conflict integration
4. Create `SchedulesController`

### Step 5: Backend — Schedules Module (timetables + workload)
1. Create `TimetablesService` with teacher/room/student views
2. Create `TimetablesController` with 3 view endpoints
3. Add workload report method to `TimetablesService` (or separate `WorkloadService`)
4. Add workload endpoint to `TimetablesController`

### Step 6: Backend — School Closures Module
1. Create `SchoolClosuresModule`, `SchoolClosuresController`, `SchoolClosuresService`
2. Single + bulk create with side-effects (session cancellation)
3. List + delete

### Step 7: Backend — Attendance Module (sessions + records)
1. Create `AttendanceModule`
2. Create `DailySummaryService` with recalculation logic
3. Create `AttendanceService` with session CRUD, record saving, submission, amendment
4. Create `AttendanceController` covering sessions, records, summaries

### Step 8: Backend — Attendance Module (exceptions + parent + dashboard)
1. Add exception dashboard endpoint to `AttendanceController`
2. Add parent attendance endpoints
3. Add teacher dashboard endpoint to `DashboardController`/`DashboardService`

### Step 9: Backend — Cross-Module Wiring
1. Modify `ClassesService`: when setting class to `inactive`, call `SchedulesService.endDateForClass()`
2. Wire `SchedulesModule` export so `ClassesModule` can import it

### Step 10: Background Jobs
1. Add `attendance` queue to queue constants
2. Create `AttendanceSessionGenerationProcessor`
3. Create `AttendancePendingDetectionProcessor`
4. Create `AttendanceAutoLockProcessor`
5. Register processors in `worker.module.ts`

### Step 11: Frontend — Components
1. Create `TimetableGrid` component
2. Create `AttendanceStatusBadge` component
3. Create `ConflictAlert` component

### Step 12: Frontend — Rooms Pages
1. Room list page with create/edit dialog
2. Room detail page with timetable tab

### Step 13: Frontend — Schedule + Timetable Pages
1. Schedule management page with create/edit dialog + conflict UI
2. Timetable views page with tabs

### Step 14: Frontend — Closures + Workload Pages
1. School closures page with bulk create dialog
2. Workload report page

### Step 15: Frontend — Attendance Pages
1. Attendance sessions list page
2. Attendance marking page
3. Attendance exceptions page

### Step 16: Frontend — Dashboard + Navigation Updates
1. Update teacher dashboard with today's schedule + sessions
2. Update parent dashboard with attendance section
3. Update sidebar navigation with new links
4. Add i18n keys for all new pages (en + ar)

---

## Section 8 — Files to Create

### Database (2 files)
- `packages/prisma/migrations/{timestamp}_add_p4a_scheduling_attendance/migration.sql`
- `packages/prisma/migrations/{timestamp}_add_p4a_scheduling_attendance/post_migrate.sql`

### Shared Types (4 files)
- `packages/shared/src/types/room.ts`
- `packages/shared/src/types/schedule.ts`
- `packages/shared/src/types/school-closure.ts`
- `packages/shared/src/types/attendance.ts`

### Shared Schemas (4 files)
- `packages/shared/src/schemas/room.schema.ts`
- `packages/shared/src/schemas/schedule.schema.ts`
- `packages/shared/src/schemas/school-closure.schema.ts`
- `packages/shared/src/schemas/attendance.schema.ts`

### Backend — Rooms Module (4 files)
- `apps/api/src/modules/rooms/rooms.module.ts`
- `apps/api/src/modules/rooms/rooms.controller.ts`
- `apps/api/src/modules/rooms/rooms.service.ts`
- `apps/api/src/modules/rooms/dto/room.dto.ts`

### Backend — Schedules Module (8 files)
- `apps/api/src/modules/schedules/schedules.module.ts`
- `apps/api/src/modules/schedules/schedules.controller.ts`
- `apps/api/src/modules/schedules/schedules.service.ts`
- `apps/api/src/modules/schedules/conflict-detection.service.ts`
- `apps/api/src/modules/schedules/timetables.controller.ts`
- `apps/api/src/modules/schedules/timetables.service.ts`
- `apps/api/src/modules/schedules/dto/schedule.dto.ts`
- `apps/api/src/modules/schedules/dto/timetable.dto.ts`

### Backend — School Closures Module (4 files)
- `apps/api/src/modules/school-closures/school-closures.module.ts`
- `apps/api/src/modules/school-closures/school-closures.controller.ts`
- `apps/api/src/modules/school-closures/school-closures.service.ts`
- `apps/api/src/modules/school-closures/dto/closure.dto.ts`

### Backend — Attendance Module (6 files)
- `apps/api/src/modules/attendance/attendance.module.ts`
- `apps/api/src/modules/attendance/attendance.controller.ts`
- `apps/api/src/modules/attendance/attendance.service.ts`
- `apps/api/src/modules/attendance/daily-summary.service.ts`
- `apps/api/src/modules/attendance/dto/attendance.dto.ts`
- `apps/api/src/modules/attendance/dto/exception.dto.ts`

### Worker Processors (3 files)
- `apps/worker/src/processors/attendance-session-generation.processor.ts`
- `apps/worker/src/processors/attendance-pending-detection.processor.ts`
- `apps/worker/src/processors/attendance-auto-lock.processor.ts`

### Frontend — Components (3 files)
- `apps/web/src/components/timetable-grid.tsx`
- `apps/web/src/components/attendance-status-badge.tsx`
- `apps/web/src/components/conflict-alert.tsx`

### Frontend — Room Pages (3 files + 1 component)
- `apps/web/src/app/[locale]/(school)/rooms/page.tsx`
- `apps/web/src/app/[locale]/(school)/rooms/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/rooms/_components/room-form.tsx`

### Frontend — Schedule Pages (2 files + 1 component)
- `apps/web/src/app/[locale]/(school)/schedules/page.tsx`
- `apps/web/src/app/[locale]/(school)/schedules/_components/schedule-form.tsx`

### Frontend — Timetable Page (1 file)
- `apps/web/src/app/[locale]/(school)/timetables/page.tsx`

### Frontend — Closures Page (2 files + 1 component)
- `apps/web/src/app/[locale]/(school)/settings/closures/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/closures/_components/closure-form.tsx`

### Frontend — Workload Page (1 file)
- `apps/web/src/app/[locale]/(school)/reports/workload/page.tsx`

### Frontend — Attendance Pages (3 files)
- `apps/web/src/app/[locale]/(school)/attendance/page.tsx`
- `apps/web/src/app/[locale]/(school)/attendance/mark/[sessionId]/page.tsx`
- `apps/web/src/app/[locale]/(school)/attendance/exceptions/page.tsx`

**Total: ~54 new files**

---

## Section 9 — Files to Modify

| File | Changes |
|------|---------|
| `packages/prisma/schema.prisma` | Add 6 enums, 6 models, relations on Tenant, Class, Student, StaffProfile, AcademicYear, User |
| `packages/shared/src/constants/permissions.ts` | Add `attendance.amend_historical`, `attendance.override_closure` to PERMISSIONS, PERMISSION_TIER_MAP, SYSTEM_ROLE_PERMISSIONS (school_owner, school_admin) |
| `packages/shared/src/index.ts` | Export all new types, schemas |
| `packages/prisma/seed/permissions.ts` | Add 2 new permission seed entries |
| `packages/prisma/seed/dev-data.ts` | Add dev rooms and schedule entries per tenant |
| `apps/api/src/app.module.ts` | Import RoomsModule, SchedulesModule, SchoolClosuresModule, AttendanceModule |
| `apps/api/src/modules/classes/classes.service.ts` | Add call to `SchedulesService.endDateForClass()` when setting class status to `inactive` |
| `apps/api/src/modules/classes/classes.module.ts` | Import SchedulesModule for cross-module service access |
| `apps/api/src/modules/dashboard/dashboard.controller.ts` | Add `GET /v1/dashboard/teacher` endpoint |
| `apps/api/src/modules/dashboard/dashboard.service.ts` | Add `getTeacherDashboard()` method |
| `apps/api/src/modules/dashboard/dashboard.module.ts` | Import AttendanceModule, SchedulesModule |
| `apps/worker/src/base/queue.constants.ts` | Add `attendance` queue |
| `apps/worker/src/worker.module.ts` | Register 3 new attendance processors |
| `apps/web/src/app/[locale]/(school)/layout.tsx` | Add sidebar links: Rooms, Schedules, Timetables, Attendance, Closures, Workload |
| `apps/web/src/app/[locale]/(school)/dashboard/page.tsx` | Add teacher dashboard section |
| `apps/web/src/app/[locale]/(school)/dashboard/parent/page.tsx` | Add attendance section per student |
| `apps/web/messages/en.json` | Add all P4A translation keys |
| `apps/web/messages/ar.json` | Add all P4A Arabic translation keys |

---

## Section 10 — Key Context for Executor

### Patterns to Follow (with file path examples)

1. **Controller pattern**: See `apps/api/src/modules/classes/classes.controller.ts` — thin controllers with `@UseGuards(AuthGuard, PermissionGuard)`, `@RequiresPermission()`, `@CurrentTenant()`, `ZodValidationPipe`.

2. **Service pattern**: See `apps/api/src/modules/classes/classes.service.ts` — all business logic, uses `createRlsClient(this.prisma, tenant)` for RLS transactions, throws NestJS typed exceptions with `{ code, message }`.

3. **RLS middleware**: See `apps/api/src/common/middleware/rls.middleware.ts` — `createRlsClient()` wraps interactive transactions with `SET LOCAL app.current_tenant_id`.

4. **Zod schema pattern**: See `packages/shared/src/schemas/class.schema.ts` — export schema + inferred type.

5. **Module registration**: See `apps/api/src/app.module.ts` — add new modules to imports array.

6. **Worker job pattern**: See `apps/worker/src/processors/search-index.processor.ts` — extends `TenantAwareJob`, implements `processJob(data, tx)`.

7. **Frontend page pattern**: See `apps/web/src/app/[locale]/(school)/classes/page.tsx` — client component with `useTranslations()`, `apiClient()`, DataTable.

8. **Response envelope**: The `ResponseTransformInterceptor` auto-wraps in `{ data }`. Services return raw data; paginated responses return `{ data, meta }` which the interceptor preserves.

### Gotchas

1. **`schedule_period_template_id` and `scheduling_run_id`**: These reference P4B tables that don't exist yet. Model them as `String? @db.Uuid` in Prisma **without** `@relation()`. P4B will add the relations when those tables are created.

2. **`school_closures` unique constraint uses COALESCE**: The unique index `(tenant_id, closure_date, affects_scope, COALESCE(scope_entity_id, '00000000-...'))` cannot be expressed in Prisma's `@@unique`. Add it in `post_migrate.sql` as raw SQL.

3. **`attendance_sessions` has TWO unique indexes**: One for schedule-linked (includes schedule_id), one partial for ad-hoc (WHERE schedule_id IS NULL). Both need raw SQL in `post_migrate.sql`.

4. **`school_closures` has no `updated_at`**: Do NOT add `@updatedAt` or the `set_updated_at()` trigger. It's append-only.

5. **Conflict detection student overlap**: This requires a multi-step query — get enrolled students, get their other classes, check schedule overlap. Use a single RLS transaction for all queries. May be slow for large classes; consider limiting the student check to active enrolments only.

6. **INSERT ... ON CONFLICT for sessions**: Prisma doesn't natively support `INSERT ON CONFLICT DO NOTHING RETURNING *`. Use `$executeRaw` within the RLS middleware transaction for this specific case, or use Prisma's `upsert` as an approximation (create + conflictCheck).

7. **Daily summary recalculation**: Must happen inside the same transaction as the attendance submission/amendment to avoid race conditions. Pass the transaction client (`tx`) to `DailySummaryService.recalculate()`.

8. **Cross-module dependency**: `ClassesService` needs `SchedulesService` for the inactive side-effect. Use NestJS module exports: `SchedulesModule` exports `SchedulesService`, `ClassesModule` imports `SchedulesModule`.

9. **Permission-aware data scoping**: For endpoints that accept multiple permissions (e.g., `attendance.view` OR `attendance.take`), the controller should pass the user's permission set to the service, which scopes the query accordingly (all data vs. own classes only).

10. **Time columns in Prisma**: Prisma doesn't have a native `TIME` type. Use `String` with `@db.Time` annotation. Validate HH:mm format in Zod schemas.

### Cross-Module Wiring

```
SchedulesModule
  ├── exports: SchedulesService (for ClassesModule cross-module call)
  ├── imports: RoomsModule (for room lookup in conflict detection)
  └── imports: PrismaModule, RedisModule

SchoolClosuresModule
  ├── exports: SchoolClosuresService (for AttendanceModule closure check)
  └── imports: PrismaModule

AttendanceModule
  ├── imports: SchoolClosuresModule (for closure check during session creation)
  ├── imports: SchedulesModule (for schedule lookup)
  └── imports: PrismaModule, RedisModule

ClassesModule (existing — modified)
  └── imports: SchedulesModule (for endDateForClass side-effect)

DashboardModule (existing — modified)
  └── imports: SchedulesModule, AttendanceModule (for teacher dashboard)
```
