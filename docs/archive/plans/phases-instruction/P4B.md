# PHASE 4b: Auto-Scheduling

**Duration estimate**: 4 weeks
**Dependencies**: Phase 4a complete (schedule data model with auto-scheduling columns, conflict detection engine, timetable views, rooms with `room_type`)

**Masterplan references**: Sections 3.5 (scheduling tables), 4.8b (functional requirements), 5.4/5.11 (edge cases), 7.2 (error codes), 7.4 (domain events), 8 (Phase 4b deliverables)

**Schedule risk**: Medium-high. The solver itself is bounded in complexity (CSP with forward checking is well-understood). The risk is in the UX — visual grid editors, drag-and-drop adjustments, real-time constraint validation, and RTL support are frontend-heavy.

---

## Overview

The auto-scheduling module adds intelligent timetable generation to the existing manual scheduling system. It operates in three modes:

- **Manual** (existing from Phase 4a — no changes)
- **Auto** (solver generates a complete timetable from scratch)
- **Hybrid** (admin pins specific entries, solver fills everything else)

The solver is a CSP (Constraint Satisfaction Problem) engine using constraint propagation + backtracking. All auto-scheduling UI is hidden when `tenant_settings.scheduling.autoSchedulerEnabled = false`.

**RTL/bilingual requirement**: All auto-scheduling UIs must use Tailwind logical CSS utilities. Weekday column headers render right-to-left in Arabic locale. Period names display `period_name_ar` when user locale is `ar`, falling back to `period_name`.

---

## Data Models

### `schedule_period_templates`

Defines the school's time grid — the set of named periods per weekday that classes can be placed into. Schools often have different structures on different days (e.g., Friday is shorter in Gulf schools).

| Column               | Type                                                                | Constraints                             |
| -------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| id                   | UUID                                                                | PK                                      |
| tenant_id            | UUID                                                                | FK → tenants, NOT NULL                  |
| academic_year_id     | UUID                                                                | FK → academic_years, NOT NULL           |
| weekday              | SMALLINT                                                            | NOT NULL, CHECK (0-6, 0=Monday)         |
| period_name          | VARCHAR(50)                                                         | NOT NULL                                |
| period_name_ar       | VARCHAR(50)                                                         | NULL                                    |
| period_order         | SMALLINT                                                            | NOT NULL                                |
| start_time           | TIME                                                                | NOT NULL                                |
| end_time             | TIME                                                                | NOT NULL, CHECK (end_time > start_time) |
| schedule_period_type | ENUM('teaching','break_supervision','assembly','lunch_duty','free') | NOT NULL DEFAULT 'teaching'             |
| created_at           | TIMESTAMPTZ                                                         | NOT NULL                                |
| updated_at           | TIMESTAMPTZ                                                         | NOT NULL                                |

**Constraint**: `UNIQUE (tenant_id, academic_year_id, weekday, period_order)` — one period per order slot per day.
**Constraint**: `UNIQUE (tenant_id, academic_year_id, weekday, start_time)` — no overlapping start times on same day.
**Constraint**: Time-range non-overlap via PostgreSQL exclusion constraint using `btree_gist`: `EXCLUDE USING gist (tenant_id WITH =, academic_year_id WITH =, weekday WITH =, timerange(start_time, end_time, '[]') WITH &&)`.

**ENUM name**: Column is `schedule_period_type` (not `period_type`) to avoid collision with `academic_periods.period_type`.

**Bilingual**: `period_name` stores English/default name. `period_name_ar` stores Arabic translation. Timetable UI resolves `period_name_ar` for `ar` locale, falling back to `period_name`.

**`schedule_period_type` semantics**:

- `teaching` — regular class period. Auto-scheduler assigns classes here.
- `break_supervision` — break/recess supervision. Scheduler assigns staff same as classes. Subject is supervision-type.
- `assembly` — whole-school or year-group assembly. Not assigned by scheduler. Blocks slot.
- `lunch_duty` — lunch supervision. Same mechanics as `break_supervision`.
- `free` — defined in grid but not schedulable. Models periods that exist on other days but not this day.

---

### `class_scheduling_requirements`

Defines how many periods per week each class needs and scheduling preferences for the auto-scheduler.

| Column                  | Type                                            | Constraints                             |
| ----------------------- | ----------------------------------------------- | --------------------------------------- |
| id                      | UUID                                            | PK                                      |
| tenant_id               | UUID                                            | FK → tenants, NOT NULL                  |
| class_id                | UUID                                            | FK → classes, NOT NULL                  |
| academic_year_id        | UUID                                            | FK → academic_years, NOT NULL           |
| periods_per_week        | SMALLINT                                        | NOT NULL, CHECK (periods_per_week >= 1) |
| required_room_type      | ENUM (same as rooms.room_type)                  | NULL (NULL = any classroom)             |
| preferred_room_id       | UUID                                            | NULL, FK → rooms                        |
| max_consecutive_periods | SMALLINT                                        | NOT NULL DEFAULT 2                      |
| min_consecutive_periods | SMALLINT                                        | NOT NULL DEFAULT 1                      |
| spread_preference       | ENUM('spread_evenly','cluster','no_preference') | NOT NULL DEFAULT 'spread_evenly'        |
| student_count           | INT                                             | NULL                                    |
| created_at              | TIMESTAMPTZ                                     | NOT NULL                                |
| updated_at              | TIMESTAMPTZ                                     | NOT NULL                                |

**Constraint**: `UNIQUE (tenant_id, class_id, academic_year_id)`

**`spread_evenly`**: Distribute periods across as many distinct weekdays as possible.
**`cluster`**: Group periods on fewer days (e.g., 4 periods on 2 days = 2 per day).

**`max_consecutive_periods`**: Hard cap on back-to-back teaching-type periods of this class on the same day. Breaks do NOT break consecutiveness.
**`min_consecutive_periods`**: Minimum block size. When `min_consecutive_periods = 2` and `periods_per_week = 4`, solver places exactly 2 double-period blocks. Remainder placed as singles. Validation: `min_consecutive_periods <= max_consecutive_periods`.

**`student_count`**: Cached/denormalised count of active enrolments. Used by solver for non-exclusive room capacity checks. Updated when enrolments change. NULL = skip capacity validation.

---

### `staff_availability`

Defines when a teacher is available to be scheduled. **Hard constraint** — solver cannot schedule outside availability.

| Column           | Type        | Constraints                                     |
| ---------------- | ----------- | ----------------------------------------------- |
| id               | UUID        | PK                                              |
| tenant_id        | UUID        | FK → tenants, NOT NULL                          |
| staff_profile_id | UUID        | FK → staff_profiles, NOT NULL                   |
| academic_year_id | UUID        | FK → academic_years, NOT NULL                   |
| weekday          | SMALLINT    | NOT NULL, CHECK (0-6)                           |
| available_from   | TIME        | NOT NULL                                        |
| available_to     | TIME        | NOT NULL, CHECK (available_to > available_from) |
| created_at       | TIMESTAMPTZ | NOT NULL                                        |
| updated_at       | TIMESTAMPTZ | NOT NULL                                        |

**Constraint**: `UNIQUE (tenant_id, staff_profile_id, academic_year_id, weekday)` — one window per teacher per day per year.

**Default behaviour**: No rows = fully available all days. Once any row created, only configured days are available — others blocked. Explicit-opt-in model.

**"Covers" semantics**: Teacher available for a period if and only if `available_from <= period.start_time AND available_to >= period.end_time` (strict containment).

**V1 limitation**: One window per teacher per day. Multi-window deferred.

---

### `staff_scheduling_preferences`

Captures soft constraints. Solver tries to honour but makes no guarantees.

| Column             | Type                                | Constraints                   |
| ------------------ | ----------------------------------- | ----------------------------- |
| id                 | UUID                                | PK                            |
| tenant_id          | UUID                                | FK → tenants, NOT NULL        |
| staff_profile_id   | UUID                                | FK → staff_profiles, NOT NULL |
| academic_year_id   | UUID                                | FK → academic_years, NOT NULL |
| preference_type    | ENUM('subject','class','time_slot') | NOT NULL                      |
| preference_payload | JSONB                               | NOT NULL                      |
| priority           | ENUM('low','medium','high')         | NOT NULL DEFAULT 'medium'     |
| created_at         | TIMESTAMPTZ                         | NOT NULL                      |
| updated_at         | TIMESTAMPTZ                         | NOT NULL                      |

**Constraint**: `UNIQUE (tenant_id, staff_profile_id, academic_year_id, preference_type, md5(preference_payload::text))` — prevents exact duplicate preferences. Uses MD5 hash since PostgreSQL cannot UNIQUE on JSONB.

**`preference_payload` schemas by type** (Zod-validated):

```typescript
// subject — teacher prefers/avoids certain subjects
{ type: 'subject', subject_ids: string[], mode: 'prefer' | 'avoid' }

// class — teacher prefers/avoids certain classes
{ type: 'class', class_ids: string[], mode: 'prefer' | 'avoid' }

// time_slot — teacher prefers/avoids certain times
{ type: 'time_slot', weekday: number | null, preferred_period_orders: number[], mode: 'prefer' | 'avoid' }
```

**Priority weighting**: `high` = 3×, `medium` = 2×, `low` = 1× in solver fitness function. Configurable via `tenant_settings.scheduling.preferenceWeights`.

**Conflicting preference validation**: API catches logical contradictions (prefer X AND avoid X simultaneously).

---

### `scheduling_runs`

Records each solver execution for audit, comparison, and rollback.

| Column                     | Type                                                                | Constraints                   |
| -------------------------- | ------------------------------------------------------------------- | ----------------------------- |
| id                         | UUID                                                                | PK                            |
| tenant_id                  | UUID                                                                | FK → tenants, NOT NULL        |
| academic_year_id           | UUID                                                                | FK → academic_years, NOT NULL |
| mode                       | ENUM('auto','hybrid')                                               | NOT NULL                      |
| status                     | ENUM('queued','running','completed','failed','applied','discarded') | NOT NULL                      |
| config_snapshot            | JSONB                                                               | NOT NULL                      |
| result_json                | JSONB                                                               | NULL                          |
| proposed_adjustments       | JSONB                                                               | NULL                          |
| hard_constraint_violations | INT                                                                 | NOT NULL DEFAULT 0            |
| soft_preference_score      | NUMERIC(8,2)                                                        | NULL                          |
| soft_preference_max        | NUMERIC(8,2)                                                        | NULL                          |
| entries_generated          | INT                                                                 | NOT NULL DEFAULT 0            |
| entries_pinned             | INT                                                                 | NOT NULL DEFAULT 0            |
| entries_unassigned         | INT                                                                 | NOT NULL DEFAULT 0            |
| solver_duration_ms         | INT                                                                 | NULL                          |
| solver_seed                | BIGINT                                                              | NULL                          |
| failure_reason             | TEXT                                                                | NULL                          |
| created_by_user_id         | UUID                                                                | FK → users, NOT NULL          |
| applied_by_user_id         | UUID                                                                | NULL, FK → users              |
| applied_at                 | TIMESTAMPTZ                                                         | NULL                          |
| created_at                 | TIMESTAMPTZ                                                         | NOT NULL                      |
| updated_at                 | TIMESTAMPTZ                                                         | NOT NULL                      |

**Constraint**: `UNIQUE partial index on (tenant_id, academic_year_id) WHERE status IN ('queued', 'running')` — one active run per tenant per year.

**Optimistic concurrency**: `updated_at` used for optimistic concurrency on all status transitions.

**Status transitions**:

- `queued → running` (worker picks up)
- `running → completed` (solver finishes)
- `running → failed` (solver errors/times out)
- `completed → applied` (admin applies)
- `completed → discarded` (admin discards)
- BLOCKED: `applied → *`, `failed → *` (terminal)

**JSONB size note**: For large schools, `config_snapshot` and `result_json` can reach 500KB–1MB. Run history list query MUST exclude these columns. Full JSONB loaded only on detail view.

**Stale run reaper**: Nightly job transitions runs in `running` for longer than `maxSolverDurationSeconds × 2` to `failed`.

---

## `config_snapshot` Schema

```typescript
{
  period_grid: Array<{weekday, period_order, start_time, end_time, schedule_period_type}>,
  classes: Array<{
    class_id, periods_per_week, required_room_type, preferred_room_id,
    max_consecutive, min_consecutive, spread_preference, student_count,
    teachers: Array<{staff_profile_id, assignment_role}>
  }>,
  teachers: Array<{staff_profile_id, availability: Array<{weekday, from, to}>, preferences: Array<{...}>}>,
  rooms: Array<{room_id, room_type, capacity, is_exclusive}>,
  pinned_entries: Array<{schedule_id, class_id, room_id, teacher_staff_id, weekday, period_order}>,
  student_overlaps: Array<{class_id_a, class_id_b}>,
  settings: { max_solver_duration_seconds, preference_weights, solver_seed }
}
```

**Multi-teacher**: `classes[].teachers` is ALL `class_staff` rows with `assignment_role IN ('teacher', 'homeroom')`. All teachers' availability validated.

**Student overlaps**: Pre-computed pairs of classes sharing at least one active student enrolment. Computed at query time from `class_enrolments`, not stored.

## `result_json` Schema

```typescript
{
  entries: Array<{
    class_id, room_id, teacher_staff_id, weekday, period_order,
    start_time, end_time, is_pinned,
    preference_satisfaction: Array<{ preference_id, satisfied, weight }>
  }>,
  unassigned: Array<{ class_id, periods_remaining, reason: string }>
}
```

## `proposed_adjustments` Schema

Server-persisted incremental adjustments made by admin during review. Each drag-and-drop, swap, add, or remove saved via PATCH. Crash-resilient. Final timetable = `result_json` + `proposed_adjustments` merged.

---

## Indexes

```sql
-- Period grid
CREATE INDEX idx_schedule_period_templates_tenant_year ON schedule_period_templates(tenant_id, academic_year_id);
CREATE UNIQUE INDEX idx_schedule_period_templates_order ON schedule_period_templates(tenant_id, academic_year_id, weekday, period_order);
CREATE UNIQUE INDEX idx_schedule_period_templates_time ON schedule_period_templates(tenant_id, academic_year_id, weekday, start_time);

-- Class scheduling requirements
CREATE UNIQUE INDEX idx_class_sched_req_unique ON class_scheduling_requirements(tenant_id, class_id, academic_year_id);
CREATE INDEX idx_class_sched_req_tenant_year ON class_scheduling_requirements(tenant_id, academic_year_id);

-- Staff availability
CREATE UNIQUE INDEX idx_staff_availability_unique ON staff_availability(tenant_id, staff_profile_id, academic_year_id, weekday);
CREATE INDEX idx_staff_availability_tenant_year ON staff_availability(tenant_id, academic_year_id);

-- Staff preferences
CREATE INDEX idx_staff_sched_prefs_tenant_staff ON staff_scheduling_preferences(tenant_id, staff_profile_id, academic_year_id);
CREATE INDEX idx_staff_sched_prefs_tenant_year ON staff_scheduling_preferences(tenant_id, academic_year_id);

-- Scheduling runs
CREATE INDEX idx_scheduling_runs_tenant_year ON scheduling_runs(tenant_id, academic_year_id, status);
CREATE UNIQUE INDEX idx_scheduling_runs_active ON scheduling_runs(tenant_id, academic_year_id) WHERE status IN ('queued', 'running');
```

---

## Solver Architecture

The solver is a pure TypeScript module in `packages/shared/src/scheduler/`. No database dependencies — takes typed input, returns typed output. The BullMQ job wrapper handles DB I/O.

```
packages/shared/src/scheduler/
├── types.ts              # Input/output type definitions
├── solver.ts             # CSP solver (main entry point)
├── constraints.ts        # Hard constraint checkers
├── preferences.ts        # Soft preference scoring
├── domain.ts             # Domain reduction and arc consistency
├── heuristics.ts         # Variable and value ordering
└── __tests__/
    ├── solver.test.ts    # Full solver integration tests
    ├── constraints.test.ts
    └── fixtures/         # Test school configurations
```

**Variables**: One per (class, period_slot) pair. If class needs 5 periods/week → 5 variables.
**Domain**: Set of valid (weekday, period_order, room) tuples per variable.

**Solver steps**:

1. Load inputs (period grid, class requirements, teacher assignments, availability, rooms, pinned entries, preferences, student overlaps)
2. Pre-assign pinned entries (remove from all domains)
3. Initial domain reduction (arc consistency)
4. Variable ordering: MRV (Most Restricted Variable) — smallest remaining domain
5. Value ordering: preference-weighted — try values with highest soft preference score first
6. Forward checking: after each assignment, propagate constraints. Empty domain → backtrack.
7. Backtracking: undo last assignment, try next value
8. Timeout: configurable max duration (default 120s). Returns best partial solution.
9. Output: complete assignment + unassigned list + preference satisfaction score

### Hard Constraints

| Constraint                   | Description                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| Teacher no double-book       | A teacher cannot be in two classes in the same slot. Multi-teacher: ALL must be free.                  |
| Room no double-book          | Exclusive room: no concurrent use. Non-exclusive: concurrent OK if total `student_count` ≤ `capacity`. |
| Student group no double-book | Classes sharing students (from `student_overlaps`) cannot occupy same slot.                            |
| Teacher availability         | All assigned teachers' windows must strictly contain the period.                                       |
| Room type match              | Class with `required_room_type` can only use matching room.                                            |
| Period type match            | Academic classes → `teaching` periods only. Supervision → `break_supervision`/`lunch_duty`.            |
| Periods per week             | Each class must fill exactly `periods_per_week` slots (or max possible).                               |
| Max consecutive              | Cannot exceed `max_consecutive_periods` on same day.                                                   |
| Min consecutive              | Periods on each day must form blocks ≥ `min_consecutive_periods` (except remainder).                   |
| Pinned entries               | Pre-assigned, immovable. Block their slots for other assignments.                                      |
| Supervision distribution     | Evenly distributed across matching period-type days.                                                   |

### Soft Preferences

| Preference            | Weight       | Description                                  |
| --------------------- | ------------ | -------------------------------------------- |
| Subject preference    | Configurable | Teacher prefers/avoids subjects              |
| Class preference      | Configurable | Teacher prefers/avoids classes               |
| Time slot preference  | Configurable | Teacher prefers/avoids periods/days          |
| Even subject spread   | Global       | Distribute class across weekdays             |
| Minimise teacher gaps | Global       | Reduce idle periods between classes          |
| Room consistency      | Global       | Use `preferred_room_id` when available       |
| Workload balance      | Global       | Even distribution of periods across teachers |

**Fitness function**: `score = Σ(satisfied × weight) / Σ(all × weight)` → 0-100%

### Performance Targets

- 40 teachers, 80 classes, 15 rooms, 35 teaching periods/week → ~2,800 variables → under 30 seconds
- 100+ classes may approach 120s timeout → near-complete solution
- Worker ECS task: minimum 2GB memory

### Determinism

Seeded RNG for tie-breaking. Seed stored in `scheduling_runs.solver_seed`. All DB queries feeding solver must use `ORDER BY` for deterministic input.

---

## Functional Requirements

### 4.8b.1 Period Grid Configuration

- Admin defines period structure per weekday per academic year
- Visual grid editor: rows = periods, columns = days
- Quick actions: "Copy Monday to all weekdays", "Add period to all days"
- Break/lunch periods created with appropriate `schedule_period_type`
- Validation: no overlapping periods (DB exclusion constraint)
- Requires `schedule.configure_period_grid` permission
- Each period saved individually — partial save supported
- **Acceptance**: period grid saved, supervision periods appear as schedulable slots

### 4.8b.2 Class Requirements Setup

- For each active class, admin sets periods_per_week and constraints
- Table view: Class Name | Subject | Teacher | Periods/Week | Room Type | Preferred Room | Max/Min Consecutive | Spread | Student Count
- Bulk edit supported
- Default: 5 periods/week, no room type, max 2, min 1, spread evenly
- Completeness indicator: "45 of 52 classes configured. 7 remaining."
- Requires `schedule.configure_requirements` permission
- **Acceptance**: all academic classes must have requirements before solver runs. Supervision classes optional.

### 4.8b.3 Teacher Availability Configuration

- Per teacher, per academic year
- Visual weekly grid: admin drags to set available window per day
- Default: fully available (no rows)
- Once any day set, only configured days are available
- Visual distinction: available (green), unavailable (red), not configured (neutral)
- Requires `schedule.configure_availability` permission (school_owner only by default)
- **Acceptance**: availability honoured as hard constraints

### 4.8b.4 Teacher Preferences Configuration

- Per teacher, per academic year
- Three tabs: Subject | Class | Time
- Each preference has priority (low/medium/high) and mode (prefer/avoid)
- Admin: `schedule.manage_preferences`. Teachers: `schedule.manage_own_preferences` (own data only).
- Banner: "Preferences are best-effort."
- **Acceptance**: preferences captured, priority weighting applied

### 4.8b.5 Pinned Entry Management (Hybrid Mode)

- Admin clicks existing entry → toggle "Pin this entry"
- Pinned entries show pin icon and visual border
- Sets `schedules.is_pinned = true`, `source = 'pinned'`
- Can create new entries and immediately pin
- Bulk pin supported
- Requires `schedule.pin_entries` permission
- Pin conflict detection: pinned entries validated against each other before solver runs
- **Acceptance**: pinned entries preserved during auto-scheduler runs

### 4.8b.6 Solver Prerequisites Check

Before solver can run, validate:

- Period grid exists (at least 1 `teaching` period on 1 day)
- All active academic classes have scheduling requirements
- All academic classes have at least one assigned teacher (supervision exempt)
- No pinned entry conflicts (teacher/room double-booking between pinned entries)
- No pinned entries violating teacher availability
- All referenced classes still `active`
- Missing prerequisites shown as checklist with fix links
- Solver button disabled until all met
- Requires `schedule.run_auto` permission

### 4.8b.7 Solver Execution

- Admin selects academic year → "Generate Timetable"
- Mode auto-detected: pinned entries exist → hybrid. None → auto.
- Confirmation dialog with entry counts
- BullMQ background job with progress: "Preparing constraints..." → "Solving (45s)..." → "Complete"
- Live counter: "342 of 380 class slots assigned"
- Cancel button available
- On completion: redirect to review screen
- On failure/timeout: show error with partial result

### 4.8b.8 Proposed Timetable Review

- Rendered from `result_json` + `proposed_adjustments` — NOT from `schedules` table
- "PROPOSED — Not Yet Applied" banner
- Two visual states: pinned (solid, pin icon) and auto-generated (dashed, lighter)
- Side panel: Constraint Report
  - Hard constraint violations (should be 0 for completed run)
  - Soft preference satisfaction: "87% satisfied" with per-teacher breakdown
  - Unassigned slots with blocking reasons
  - Teacher workload summary
- Requires `schedule.view_auto_reports` permission for report details
- Teachers with `schedule.view_own_satisfaction` see own preferences

**Manual adjustments**:

- Drag-and-drop: move class between slots (validated in real time)
- Swap: select two entries, swap slots
- Remove: remove auto-generated entry (leaves slot empty)
- Add: manually place class in empty slot
- Each adjustment re-validates full constraint set
- **Server-persisted incrementally** via PATCH to `proposed_adjustments`. Browser crash safe.

### 4.8b.9 Apply or Discard

**Apply**:

- Creates schedule entries in `schedules` from final proposed timetable
- Requires `schedule.apply_auto`. Non-school_owner routed through approval if `requireApprovalForNonPrincipal = true`.
- Concurrency guard: `SELECT ... FOR UPDATE` on `scheduling_runs` row
- Before insert: existing `source = 'auto_generated'` entries handled per deletion rule:
  - Without attendance sessions → hard-deleted
  - With attendance sessions → end-dated (`effective_end_date = today`)
- Pinned entries preserved — never deleted or modified
- New entries: `source = 'auto_generated'`, `is_pinned = false`, `scheduling_run_id` set, `effective_start_date` = later of today or academic year start, `effective_end_date = NULL`
- Single transaction: delete/end-date old + insert new + update run status to `applied`
- **Period grid drift guard**: Validate grid unchanged since run (`SCHEDULER_PERIOD_GRID_CHANGED` error)
- **Class status guard**: Inactive classes excluded with warning

**Discard**: Run status → `discarded`. No schedule changes.

### 4.8b.10 Re-Run After Changes

- After applying, if admin changes availability/requirements/preferences, can re-run
- Previous applied run preserved as historical record
- Staleness detection: tracks changes since last applied run, surfaces banner

### 4.8b.11 Scheduling Dashboard

**Assignment Overview**: Total slots, pinned, auto, unassigned, completion %, last run info, staleness indicator.

**Teacher Workload View**: Table with Total Periods | Teaching | Supervision | Max Capacity | Utilisation %. Colour coded: green/amber/red.

**Unassigned Classes View**: Class | Subject | Periods Needed | Assigned | Remaining | Blocking Reason. Click → highlights available slots.

**Preference Satisfaction Report**: Per-teacher breakdown. Expand for each preference outcome. Admin: `schedule.view_auto_reports`. Teacher: `schedule.view_own_satisfaction`.

**Run History**: Table of all runs. Excludes `config_snapshot` and `result_json` from listing query. Click for detail view.

---

## Permissions (seeded in Phase 1)

**Admin tier** (default to `school_owner` and `school_admin` unless noted):

- `schedule.configure_period_grid`
- `schedule.configure_requirements`
- `schedule.configure_availability` (school_owner only)
- `schedule.manage_preferences`
- `schedule.run_auto`
- `schedule.apply_auto`
- `schedule.pin_entries`
- `schedule.view_auto_reports`

**Staff tier** (default to `teacher`):

- `schedule.view_own`
- `schedule.manage_own_preferences`
- `schedule.view_own_satisfaction`

---

## Error Codes

| Code                                 | Meaning                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `SCHEDULER_PREREQUISITES_INCOMPLETE` | Not all classes have requirements or period grid missing. `details.missing`.           |
| `SCHEDULER_RUN_ACTIVE`               | Run already queued/running for this year. `details.existing_run_id`.                   |
| `SCHEDULER_PINNED_CONFLICT`          | Two pinned entries conflict. `details.entry_a`, `details.entry_b`.                     |
| `SCHEDULER_PINNED_AVAILABILITY`      | Pinned entry outside teacher availability. `details.entry_id`, `details.teacher_name`. |
| `SCHEDULER_TIMEOUT`                  | Solver exceeded max duration. Partial result available.                                |
| `SCHEDULER_NO_SOLUTION`              | Zero valid assignments (extremely rare).                                               |
| `SCHEDULER_RUN_NOT_COMPLETED`        | Cannot apply/adjust a run not in `completed` status.                                   |
| `SCHEDULER_PERIOD_GRID_CHANGED`      | Period grid modified since run. Re-run required.                                       |
| `SCHEDULER_PERIOD_GRID_OVERLAP`      | Two periods on same day have overlapping times.                                        |
| `SCHEDULER_PERIOD_GRID_INVALID_TIME` | Period end_time ≤ start_time.                                                          |
| `SCHEDULER_ALL_SLOTS_PINNED`         | All slots occupied by pinned entries. No variables for solver.                         |
| `SCHEDULER_CLASS_INACTIVE`           | Class deactivated since run. `details.class_ids[]`.                                    |

---

## Domain Events

| Event                              | Trigger                                                                      | Consumer(s)                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `scheduling.run_completed`         | Solver finishes (success or partial)                                         | In-app notification to initiating admin (entries assigned, unassigned, preference %) |
| `scheduling.run_failed`            | Solver errors                                                                | In-app + email notification with `failure_reason`                                    |
| `scheduling.run_applied`           | Admin applies proposed timetable                                             | Audit log with run ID and entry counts. Meilisearch re-index for schedules.          |
| `scheduling.configuration_changed` | Availability, requirements, preferences, or `class_staff` change after apply | Dashboard staleness indicator updated. No auto re-run.                               |

---

## Edge Cases

| Edge Case                                      | Handling                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| No valid timetable (constraints too tight)     | Partial result with `entries_unassigned > 0`. Each unassigned slot has reason.                                          |
| Solver timeout                                 | Returns best partial solution. Admin can increase `maxSolverDurationSeconds`.                                           |
| Pinned entry conflicts with availability       | Warning on pin creation. Hard block on solver run.                                                                      |
| Pinned entry conflicts with another pinned     | Blocked with `SCHEDULER_PINNED_CONFLICT`.                                                                               |
| Teacher has no availability rows               | Treated as "fully available".                                                                                           |
| Class has no assigned teacher                  | Listed in unassigned. Prerequisites check flags this.                                                                   |
| Class has multiple teachers (co-teaching)      | All teachers must be free. Primary teacher (first `assignment_role = 'teacher'`) used for `schedules.teacher_staff_id`. |
| Room shortage                                  | Classes listed as unassigned with specific reason.                                                                      |
| Non-exclusive room over capacity               | Solver checks `student_count` vs `capacity`. NULL student_count = skip check.                                           |
| Mid-year schedule change (re-run)              | Old auto entries handled per deletion semantics. Attendance preserved.                                                  |
| Concurrent solver runs                         | Blocked by UNIQUE partial index. `SCHEDULER_RUN_ACTIVE` error.                                                          |
| Worker crash during run                        | Stale run reaper + BullMQ `stalledInterval`.                                                                            |
| Period grid changed between complete and apply | `SCHEDULER_PERIOD_GRID_CHANGED` error.                                                                                  |
| Class deactivated during run                   | Excluded from insertion with warning on apply.                                                                          |
| All slots pinned                               | Solver returns immediately. `SCHEDULER_ALL_SLOTS_PINNED`.                                                               |
| Browser crash during adjustments               | Server-persisted via PATCH. All prior adjustments intact on return.                                                     |
| `autoSchedulerEnabled` toggled off             | UI hidden. Data preserved. Toggle back restores functionality.                                                          |
| Supervision subjects in gradebook              | Gradebook queries filter to `subject_type = 'academic'`. Never appear in assessments/grades/report cards.               |

---

## Testing Requirements

- **Solver integration tests**: Fixture schools — small (10 teachers, 20 classes), medium (30 teachers, 60 classes), large (60 teachers, 120 classes)
- **Performance benchmarks**: Target <30s for 40-teacher school
- **Memory profiling**: Target <2GB for 100-class school
- **Constraint tests**: Each hard constraint tested in isolation
- **Preference tests**: Verify weighting affects value ordering
- **Apply flow tests**: Atomic transaction, concurrent apply prevention, attendance-safe deletion
- **RLS leakage tests**: All 5 new tables

---

## Deliverables Summary

- `schedule_period_templates` — CRUD + visual grid editor with RTL support
- Supervision subject creation (using `subjects.subject_type` from Phase 4a)
- `class_scheduling_requirements` — CRUD + table editor + bulk edit
- `staff_availability` — CRUD + visual weekly grid
- `staff_scheduling_preferences` — CRUD + preference UI (3 tabs)
- Pin/unpin UI for schedule entries
- `scheduling_runs` — solver execution infrastructure
- CSP solver implementation (`packages/shared/src/scheduler/`)
- BullMQ job wrapper for solver with stale-run reaper
- Prerequisites validation check
- Proposed timetable review screen (from `result_json`, not `schedules`)
- Manual adjustment UI with server-persisted incremental saves
- Apply/discard flow with atomic transaction, concurrency guard, period-grid-drift check, attendance-safe deletion
- Approval workflow integration for non-school_owner apply (using approval engine from Phase 1)
- Scheduling dashboard: assignment overview, teacher workload, unassigned classes, preference satisfaction, run history
- Teacher self-service preference UI (`schedule.manage_own_preferences`)
- Teacher preference satisfaction view (`schedule.view_own_satisfaction`)
- Permissions seeding (8 admin-tier, 3 staff-tier — seeded in Phase 1, functional in Phase 4b)
- Staleness detection for post-apply configuration changes
- Solver integration tests with fixture schools
- Performance benchmarks and memory profiling
