# PHASE 4a: Manual Scheduling + Attendance

**Duration estimate**: 3 weeks
**Dependencies**: Phase 2 complete (classes, staff, students, enrolments)
**Requires shared context**: `00-shared-context.md`
**Adjacent phase reference if needed**: `phase-2-households-students-staff.md` (for class/staff/student/enrolment table structures)

---

## SCOPE

This phase builds room management, schedule management with conflict detection, timetable views, workload reporting, and the full attendance system (marking, submissions, amendments, daily summaries, exception dashboard). After this phase, schools have working timetables and attendance tracking.

**Note**: The `rooms` and `schedules` tables are defined in Section 3.5 alongside other academic tables that were built in Phase 2. Only `rooms` and `schedules` are new in this phase.

---

## DATA MODELS

### New tables in this phase: `rooms`, `schedules`

| year_group_id | UUID | NULL, FK → year_groups |
| subject_id | UUID | NULL, FK → subjects |
| homeroom_teacher_staff_id | UUID | NULL, FK → staff_profiles |
| name | VARCHAR(150) | NOT NULL |
| status | ENUM('active','inactive','archived') | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Side-effect of setting status to `inactive`**: All future schedule entries (effective_end_date NULL or > today) are end-dated to today.

#### `class_staff`

| Column           | Type                                                | Constraints                                   |
| ---------------- | --------------------------------------------------- | --------------------------------------------- |
| class_id         | UUID                                                | FK → classes                                  |
| staff_profile_id | UUID                                                | FK → staff_profiles                           |
| assignment_role  | ENUM('teacher','assistant','homeroom','substitute') | NOT NULL                                      |
| tenant_id        | UUID                                                | FK → tenants, NOT NULL                        |
| **PK**           |                                                     | (class_id, staff_profile_id, assignment_role) |

#### `class_enrolments`

| Column     | Type                                 | Constraints             |
| ---------- | ------------------------------------ | ----------------------- |
| id         | UUID                                 | PK                      |
| tenant_id  | UUID                                 | FK → tenants, NOT NULL  |
| class_id   | UUID                                 | FK → classes, NOT NULL  |
| student_id | UUID                                 | FK → students, NOT NULL |
| status     | ENUM('active','dropped','completed') | NOT NULL                |
| start_date | DATE                                 | NOT NULL                |
| end_date   | DATE                                 | NULL                    |
| created_at | TIMESTAMPTZ                          | NOT NULL                |
| updated_at | TIMESTAMPTZ                          | NOT NULL                |

#### `rooms`

| Column       | Type                                                                                                          | Constraints                  |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| id           | UUID                                                                                                          | PK                           |
| tenant_id    | UUID                                                                                                          | FK → tenants, NOT NULL       |
| name         | VARCHAR(100)                                                                                                  | NOT NULL                     |
| room_type    | ENUM('classroom','lab','gym','auditorium','library','computer_lab','art_room','music_room','outdoor','other') | NOT NULL DEFAULT 'classroom' |
| capacity     | INT                                                                                                           | NULL                         |
| is_exclusive | BOOLEAN                                                                                                       | NOT NULL DEFAULT true        |
| active       | BOOLEAN                                                                                                       | NOT NULL DEFAULT true        |
| created_at   | TIMESTAMPTZ                                                                                                   | NOT NULL                     |
| updated_at   | TIMESTAMPTZ                                                                                                   | NOT NULL                     |

**Note**: `room_type` and `is_exclusive` are orthogonal. `room_type` describes the physical purpose; `is_exclusive` controls scheduling conflict behaviour (exclusive rooms trigger hard conflicts on double-booking, non-exclusive rooms trigger soft warnings).

#### `schedules`

| Column                      | Type                                     | Constraints                             |
| --------------------------- | ---------------------------------------- | --------------------------------------- |
| id                          | UUID                                     | PK                                      |
| tenant_id                   | UUID                                     | FK → tenants, NOT NULL                  |
| class_id                    | UUID                                     | FK → classes, NOT NULL                  |
| academic_year_id            | UUID                                     | FK → academic_years, NOT NULL           |
| room_id                     | UUID                                     | NULL, FK → rooms                        |
| teacher_staff_id            | UUID                                     | NULL, FK → staff_profiles               |
| schedule_period_template_id | UUID                                     | NULL, FK → schedule_period_templates    |
| period_order                | SMALLINT                                 | NULL                                    |
| weekday                     | SMALLINT                                 | NOT NULL, CHECK (0-6, 0=Monday)         |
| start_time                  | TIME                                     | NOT NULL                                |
| end_time                    | TIME                                     | NOT NULL, CHECK (end_time > start_time) |
| effective_start_date        | DATE                                     | NOT NULL                                |
| effective_end_date          | DATE                                     | NULL                                    |
| is_pinned                   | BOOLEAN                                  | NOT NULL DEFAULT false                  |
| pin_reason                  | TEXT                                     | NULL                                    |
| source                      | ENUM('manual','auto_generated','pinned') | NOT NULL DEFAULT 'manual'               |
| scheduling_run_id           | UUID                                     | NULL, FK → scheduling_runs              |

**Column notes**:

- `academic_year_id`: Direct FK for efficient scoping. Must match `classes.academic_year_id`.
- `schedule_period_template_id`: NULL for manual entries, links to period grid for auto-generated.
- `period_order`: NULL for manual entries, from template for auto-generated.
- `is_pinned`: When true, immovable by auto-scheduler.
- `source`: Tracks how the entry was created.
- `scheduling_run_id`: Links auto-generated entries to their run.

**Deletion safety rule**: Entries with existing attendance sessions can only be end-dated (`effective_end_date = today`), not hard-deleted. Entries without attendance sessions can be hard-deleted.

### New tables in this phase: `school_closures`, `attendance_sessions`, `attendance_records`, `daily_attendance_summaries`

### 3.6 Attendance

#### `school_closures`

| Column             | Type                             | Constraints            |
| ------------------ | -------------------------------- | ---------------------- |
| id                 | UUID                             | PK                     |
| tenant_id          | UUID                             | FK → tenants, NOT NULL |
| closure_date       | DATE                             | NOT NULL               |
| reason             | VARCHAR(255)                     | NOT NULL               |
| affects_scope      | ENUM('all','year_group','class') | NOT NULL DEFAULT 'all' |
| scope_entity_id    | UUID                             | NULL                   |
| created_by_user_id | UUID                             | FK → users, NOT NULL   |
| created_at         | TIMESTAMPTZ                      | NOT NULL               |

**Constraint**: `UNIQUE (tenant_id, closure_date, affects_scope, COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'))`

**Scope rules**: `all` → entire school, scope_entity_id NULL. `year_group` → FK → year_groups. `class` → FK → classes.

**Note**: No `updated_at` — append-only table.

#### `attendance_sessions`

| Column               | Type                                          | Constraints            |
| -------------------- | --------------------------------------------- | ---------------------- |
| id                   | UUID                                          | PK                     |
| tenant_id            | UUID                                          | FK → tenants, NOT NULL |
| class_id             | UUID                                          | FK → classes, NOT NULL |
| schedule_id          | UUID                                          | NULL, FK → schedules   |
| session_date         | DATE                                          | NOT NULL               |
| status               | ENUM('open','submitted','locked','cancelled') | NOT NULL               |
| override_reason      | TEXT                                          | NULL                   |
| submitted_by_user_id | UUID                                          | NULL, FK → users       |
| submitted_at         | TIMESTAMPTZ                                   | NULL                   |
| created_at           | TIMESTAMPTZ                                   | NOT NULL               |
| updated_at           | TIMESTAMPTZ                                   | NOT NULL               |

**`cancelled` semantics**: The session was generated but the class did not take place. Excluded from daily summaries, exception reports, report card attendance, and payroll class count auto-population.

**`override_reason`**: Non-null only when session created on a closure date via admin override.

#### `attendance_records`

| Column                | Type                                                                    | Constraints                        |
| --------------------- | ----------------------------------------------------------------------- | ---------------------------------- |
| id                    | UUID                                                                    | PK                                 |
| tenant_id             | UUID                                                                    | FK → tenants, NOT NULL             |
| attendance_session_id | UUID                                                                    | FK → attendance_sessions, NOT NULL |
| student_id            | UUID                                                                    | FK → students, NOT NULL            |
| status                | ENUM('present','absent_unexcused','absent_excused','late','left_early') | NOT NULL                           |
| reason                | TEXT                                                                    | NULL                               |
| marked_by_user_id     | UUID                                                                    | FK → users, NOT NULL               |
| marked_at             | TIMESTAMPTZ                                                             | NOT NULL                           |
| amended_from_status   | VARCHAR(50)                                                             | NULL                               |
| amendment_reason      | TEXT                                                                    | NULL                               |
| created_at            | TIMESTAMPTZ                                                             | NOT NULL                           |
| updated_at            | TIMESTAMPTZ                                                             | NOT NULL                           |

**Amendment rule**: When `amended_from_status` is non-null, this is a historical amendment. `amendment_reason` is mandatory in that case. Only users with `attendance.amend_historical` permission can amend.

#### `daily_attendance_summaries`

| Column          | Type                                                         | Constraints             |
| --------------- | ------------------------------------------------------------ | ----------------------- |
| id              | UUID                                                         | PK                      |
| tenant_id       | UUID                                                         | FK → tenants, NOT NULL  |
| student_id      | UUID                                                         | FK → students, NOT NULL |
| summary_date    | DATE                                                         | NOT NULL                |
| derived_status  | ENUM('present','partially_absent','absent','late','excused') | NOT NULL                |
| derived_payload | JSONB                                                        | NOT NULL                |
| created_at      | TIMESTAMPTZ                                                  | NOT NULL                |
| updated_at      | TIMESTAMPTZ                                                  | NOT NULL                |

**Constraint**: `UNIQUE (tenant_id, student_id, summary_date)`

**`derived_payload` schema**:

```typescript
{
  sessions_total: number,
  sessions_present: number,
  sessions_absent: number,
  sessions_late: number,
  sessions_excused: number,
  session_details: Array<{
    session_id: string,
    class_id: string,
    status: string
  }>
}
```

**Derivation trigger**: Runs after any attendance submission or amendment for the affected student + date. Only counts sessions where the student was enrolled at the time.

**Indexes (Section 3.5 — rooms and schedules)**:

```sql
CREATE INDEX idx_rooms_tenant ON rooms(tenant_id);
CREATE INDEX idx_rooms_tenant_active ON rooms(tenant_id) WHERE active = true;
CREATE UNIQUE INDEX idx_rooms_tenant_name ON rooms(tenant_id, name);
CREATE INDEX idx_schedules_tenant_class ON schedules(tenant_id, class_id, weekday);
CREATE INDEX idx_schedules_tenant_room ON schedules(tenant_id, room_id, weekday);
CREATE INDEX idx_schedules_tenant_teacher ON schedules(tenant_id, teacher_staff_id, weekday);
CREATE INDEX idx_schedules_tenant_weekday ON schedules(tenant_id, weekday, effective_start_date, effective_end_date);
CREATE INDEX idx_schedules_tenant_year ON schedules(tenant_id, academic_year_id);
CREATE INDEX idx_schedules_pinned ON schedules(tenant_id, academic_year_id, is_pinned) WHERE is_pinned = true;
CREATE INDEX idx_schedules_auto_generated ON schedules(tenant_id, academic_year_id, source) WHERE source = 'auto_generated';
CREATE INDEX idx_schedules_run ON schedules(scheduling_run_id) WHERE scheduling_run_id IS NOT NULL;
```

**Indexes (Section 3.6 — attendance)**:

```sql
CREATE INDEX idx_school_closures_tenant_date ON school_closures(tenant_id, closure_date);
CREATE UNIQUE INDEX idx_school_closures_unique ON school_closures(tenant_id, closure_date, affects_scope, COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'));
CREATE UNIQUE INDEX idx_attendance_sessions_unique ON attendance_sessions(tenant_id, class_id, session_date, schedule_id);
CREATE UNIQUE INDEX idx_attendance_sessions_adhoc_unique ON attendance_sessions(tenant_id, class_id, session_date) WHERE schedule_id IS NULL;
CREATE INDEX idx_attendance_sessions_tenant_date ON attendance_sessions(tenant_id, session_date);
CREATE INDEX idx_attendance_sessions_tenant_date_status ON attendance_sessions(tenant_id, session_date, status);
CREATE INDEX idx_attendance_sessions_tenant_class_status ON attendance_sessions(tenant_id, class_id, status);
CREATE INDEX idx_attendance_records_session ON attendance_records(tenant_id, attendance_session_id);
CREATE INDEX idx_attendance_records_student ON attendance_records(tenant_id, student_id);
CREATE UNIQUE INDEX idx_attendance_records_session_student ON attendance_records(tenant_id, attendance_session_id, student_id);
CREATE UNIQUE INDEX idx_daily_summary_unique ON daily_attendance_summaries(tenant_id, student_id, summary_date);
```

---

## FUNCTIONAL REQUIREMENTS

### 4.8 Scheduling

**4.8.1 Manual Schedule Management**

- Create schedule entries: class + room + teacher + weekday + time + date range
- No auto-scheduling
- **Acceptance**: schedule entries created and visible in timetable views

**4.8.2 Conflict Detection**

- Hard conflicts (block save unless override permission + reason): room double-booking (when `rooms.is_exclusive = true`), teacher double-booking, student double-booking
- Soft conflicts (warn only): room over capacity, teacher workload threshold, room double-booking when `rooms.is_exclusive = false` (shared-use rooms)
- Override requires `schedule.override_conflict` permission + mandatory reason
- **Overlap query logic**: Two schedules overlap when weekday matches AND `start_time < other.end_time AND end_time > other.start_time` AND date ranges overlap. NULL `effective_end_date` means open-ended — must be handled as unbounded in overlap checks.
- **Acceptance**: hard conflicts blocked by default, override audit-logged

**4.8.3 Timetable Views**

- Teacher timetable: all schedule entries for a teacher
- Room timetable: all entries for a room
- Student timetable: derived from student's active class enrolments → class schedules
- Only shows currently effective entries (date range check)
- **Acceptance**: views are accurate and reflect current schedules only

**4.8.4 Workload Reporting**

- Report showing teaching hours per staff member per week
- **Acceptance**: report reflects active schedule entries

### 4.8.5 School Closure Management

- Bulk creation: date range → one closure per date
- Closures prevent attendance session generation
- Existing open sessions auto-cancelled on closure creation; submitted/locked sessions flagged for admin resolution
- Override: `attendance.override_closure` permission + mandatory reason allows creating an attendance session on a closure date
- **Acceptance**: closures block session generation, override flow works with audit trail

### 4.9 Attendance

**4.9.0 Attendance Session Generation**

- On-demand: when teacher opens marking screen (check closures → check schedule → create session → pre-populate records)
- Nightly batch: runs at `tenant_settings.attendance.pendingAlertTimeHour`, generates for all applicable schedules not already generated, skips closure dates
- Sessions not generated for dates outside academic year
- Race prevention: `INSERT ... ON CONFLICT DO NOTHING RETURNING *`
- **Acceptance**: sessions generated correctly, closures respected, no duplicates under concurrency

**4.9.1 Class Attendance Marking**

- Teacher marks attendance for assigned class sessions
- Bulk "mark all present" + adjust exceptions
- Submit session
- **Acceptance**: attendance recorded per student per session

**4.9.2 Historical Amendments**

- Admin amends past attendance records
- Requires `attendance.amend_historical` permission
- Mandatory amendment reason
- Original status preserved in `amended_from_status`
- **Acceptance**: amendment audit trail complete, original status visible

**4.9.3 Derived Daily Summaries**

- Computed after any attendance submission or amendment
- Aggregates all sessions for a student on a date
- Only counts sessions where student was enrolled
- **Acceptance**: summaries accurate, handle partial attendance

**4.9.4 Exception Dashboard**

- Surfaces: pending attendance (sessions not yet submitted), students with excessive absences
- Daily background job identifies unsubmitted sessions
- **Acceptance**: operational visibility into attendance gaps

**4.9.5 Parent Attendance Visibility**

- If `tenant_settings.general.attendanceVisibleToParents = true`:
  - Parent can view their student's attendance records and daily summaries
- **Acceptance**: parent sees only their linked students' attendance

---

## EDGE CASES

### 5.4 Scheduling

| Edge Case                                   | Handling                                                 |
| ------------------------------------------- | -------------------------------------------------------- |
| Room double-booking (exclusive)             | Hard conflict: block unless override permission + reason |
| Room double-booking (non-exclusive)         | Soft conflict: warn only, not blocking                   |
| Teacher double-booking                      | Hard conflict: block unless override permission + reason |
| Student in overlapping classes              | Hard conflict: block unless override permission + reason |
| Room over capacity                          | Soft conflict: warn only                                 |
| Invalid time range (end before start)       | Hard-blocked at validation                               |
| Class set to inactive with future schedules | Auto-end-date all future schedule entries to today       |

### 5.5 Attendance

| Edge Case                  | Handling                                                      |
| -------------------------- | ------------------------------------------------------------- |
| Teacher forgets submission | Daily job detects, surfaces on exception dashboard            |
| Late submission            | Allowed, submission time recorded for reporting               |
| Historical amendment       | Requires permission + reason, original status preserved       |
| Student enrolled mid-day   | Daily summary only counts sessions where student was enrolled |
| No auto-absence            | Confirmed: never auto-mark absent                             |

---

## DELIVERABLES

### Phase 4a: Manual Scheduling + Attendance

**Duration estimate**: 3 weeks
**Dependencies**: Phase 2 complete (classes, staff, students, enrolments)

**Deliverables**:

- `rooms`, `schedules`, `school_closures` — full CRUD
- Conflict detection engine (hard/soft)
- Override flow with permission and reason
- Timetable views: teacher, room, student
- Workload reporting
- `attendance_sessions`, `attendance_records`, `daily_attendance_summaries` — full CRUD
- Teacher attendance marking with bulk "mark all present"
- Historical amendment flow
- Daily summary derivation (triggered by submission/amendment)
- Pending attendance detection (daily background job)
- Exception dashboard
- Parent attendance visibility (if enabled)
- Teacher dashboard (initial)
