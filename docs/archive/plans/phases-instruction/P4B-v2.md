# PHASE 4B-v2: Auto-Scheduler Redesign

**Replaces**: Phase 4B (original auto-scheduling)
**Duration estimate**: 6–8 weeks
**Dependencies**: Phase 4A (schedule data model, conflict detection, timetable views, rooms), Phase 2 (staff profiles, year groups, subjects, classes), Phase 1 (RBAC, approval workflows)

---

## 1. Overview

This phase redesigns the auto-scheduling module from the ground up. The original Phase 4B delivered a working CSP solver and basic scheduling infrastructure, but lacks critical inputs that real schools need: per-year-group period grids, curriculum frequency requirements, teacher-subject-year competency matrices, and a proper break/supervision model.

After this phase, a school principal can:

1. See the school's weekly structure per year group (set by the tenant owner)
2. Define exactly what subjects each year group needs and how often
3. Define which teachers are eligible to teach which subjects for which year groups
4. Configure break supervision (yard breaks with year-group grouping, classroom breaks with teacher adjacency)
5. Set hard constraints (teacher unavailability, pinned entries) and soft preferences (teacher time preferences)
6. Run the solver to auto-generate a complete timetable
7. Review, manually adjust, and validate the result with clear visual feedback (red/amber cells)
8. Apply the schedule (publish it) so teachers and parents see the final timetable
9. Use advanced features: cover teacher finder, what-if comparisons, workload visibility, schedule health scoring

---

## 2. Scope

### In Scope

- Period grid configuration per year group (owner-level)
- Curriculum requirements per year group (subject frequency, max per day)
- Teacher competency matrix (subject + year group eligibility)
- 3-tier constraint model (Immutable / Hard / Soft)
- Break/supervision model (yard breaks with grouping, classroom breaks with teacher adjacency)
- CSP solver extensions (new constraint types, new input format)
- Orchestration layer (assembles SolverInput from database)
- Post-solver manual editing with validate button and red/amber cell highlighting
- Apply/discard workflow with published schedule separation
- Cover teacher / substitute finder
- What-if mode (compare solver runs side-by-side)
- Teacher workload sidebar during editing
- Schedule health score / clash report
- Template reuse across academic years
- Multi-section year groups (2A, 2B share curriculum)
- Double/linked periods (min_consecutive enforcement)
- Max teaching load per teacher (weekly + daily caps)
- Room closures / unavailability
- Print / export timetables (per teacher, room, year group)
- Notification on schedule publication
- Break duty rotation across teachers

### Out of Scope

- Exam period blocking
- AI-suggested improvements
- Auto-validate on every drag (validate via explicit button only)
- Parent/student-facing scheduler view (they see the published timetable via existing timetable views)
- Self-service school onboarding

---

## 3. Roles & Responsibilities

| Role                  | Configures                                                                                                                             | Sees                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Tenant Owner**      | Period grid per year group (days, periods, times, break placement)                                                                     | Everything                                 |
| **Principal / Admin** | Curriculum requirements, teacher competencies, constraints, preferences, break groups, solver execution, manual editing, apply/publish | Everything except owner-level config       |
| **Teacher**           | Own preferences (if permitted)                                                                                                         | Own timetable, own preference satisfaction |
| **Parent**            | Nothing                                                                                                                                | Published timetable for their child        |

---

## 4. Data Models

### 4.1 Modification: `schedule_period_templates` — Add Year Group Scope

Add `year_group_id` to scope the period grid per year group within an academic year.

| Column (new/modified) | Type                                                      | Constraints                |
| --------------------- | --------------------------------------------------------- | -------------------------- |
| year_group_id         | UUID                                                      | FK → year_groups, NOT NULL |
| supervision_mode      | ENUM('none','yard','classroom_previous','classroom_next') | NOT NULL DEFAULT 'none'    |
| break_group_id        | UUID                                                      | NULL, FK → break_groups    |

**Modified constraints**:

- `UNIQUE (tenant_id, academic_year_id, year_group_id, weekday, period_order)`
- `UNIQUE (tenant_id, academic_year_id, year_group_id, weekday, start_time)`

**Behaviour**:

- Every year group must have its own period grid. No defaults/inheritance — explicit per year group.
- The UI provides "Copy from Year Group X" to make setup fast.
- `supervision_mode = 'none'` for teaching periods, assemblies, free periods.
- `supervision_mode = 'yard'` for yard/outdoor breaks — requires `break_group_id`.
- `supervision_mode = 'classroom_previous'` — previous period's teacher stays for this break.
- `supervision_mode = 'classroom_next'` — next period's teacher arrives early for this break.

**`schedule_period_type` values** (unchanged):

- `teaching` — regular class period
- `break_supervision` — short break (used with supervision*mode = yard OR classroom*\*)
- `lunch_duty` — lunch break (used with supervision*mode = yard OR classroom*\*)
- `assembly` — blocks slot, not assigned by solver
- `free` — not schedulable

---

### 4.2 New Table: `curriculum_requirements`

Defines how many times each subject must be taught per year group per week.

| Column                     | Type        | Constraints                                                               |
| -------------------------- | ----------- | ------------------------------------------------------------------------- |
| id                         | UUID        | PK                                                                        |
| tenant_id                  | UUID        | FK → tenants, NOT NULL                                                    |
| academic_year_id           | UUID        | FK → academic_years, NOT NULL                                             |
| year_group_id              | UUID        | FK → year_groups, NOT NULL                                                |
| subject_id                 | UUID        | FK → subjects, NOT NULL                                                   |
| min_periods_per_week       | SMALLINT    | NOT NULL, CHECK (>= 1)                                                    |
| max_periods_per_day        | SMALLINT    | NOT NULL DEFAULT 1, CHECK (>= 1)                                          |
| preferred_periods_per_week | SMALLINT    | NULL (soft target, >= min_periods_per_week)                               |
| requires_double_period     | BOOLEAN     | NOT NULL DEFAULT false                                                    |
| double_period_count        | SMALLINT    | NULL (how many double periods per week, if requires_double_period = true) |
| created_at                 | TIMESTAMPTZ | NOT NULL                                                                  |
| updated_at                 | TIMESTAMPTZ | NOT NULL                                                                  |

**Constraint**: `UNIQUE (tenant_id, academic_year_id, year_group_id, subject_id)`

**Semantics**:

- `min_periods_per_week`: Hard constraint (Tier 2). The solver MUST schedule at least this many. If it can't, the result flags the shortfall but still produces the best partial solution. The principal can manually add more if spare periods exist.
- `max_periods_per_day`: Hard constraint (Tier 2). The solver won't place more than N of the same subject on a single day for this year group.
- `preferred_periods_per_week`: Soft target. If set and > min, the solver tries to reach this number but won't fail if it can't.
- `requires_double_period`: If true, the solver must schedule `double_period_count` blocks of 2 consecutive periods. Remaining periods are singles.

**Validation**: The total `min_periods_per_week` across all subjects for a year group should be ≤ total teaching periods available in the week for that year group. The UI shows a warning if it exceeds capacity.

---

### 4.3 New Table: `teacher_competencies`

Defines which teachers can teach which subjects for which year groups.

| Column           | Type        | Constraints                   |
| ---------------- | ----------- | ----------------------------- |
| id               | UUID        | PK                            |
| tenant_id        | UUID        | FK → tenants, NOT NULL        |
| academic_year_id | UUID        | FK → academic_years, NOT NULL |
| staff_profile_id | UUID        | FK → staff_profiles, NOT NULL |
| subject_id       | UUID        | FK → subjects, NOT NULL       |
| year_group_id    | UUID        | FK → year_groups, NOT NULL    |
| is_primary       | BOOLEAN     | NOT NULL DEFAULT false        |
| created_at       | TIMESTAMPTZ | NOT NULL                      |
| updated_at       | TIMESTAMPTZ | NOT NULL                      |

**Constraint**: `UNIQUE (tenant_id, academic_year_id, staff_profile_id, subject_id, year_group_id)`

**Semantics**:

- One row per teacher + subject + year group combination.
- Mr. Smith teaches Maths for Years 1-4 → 4 rows (one per year group).
- Mr. Smith teaches Chemistry for Years 5-11 → 7 rows.
- `is_primary`: Indicates this teacher is the preferred/primary teacher for this subject+year combination. Used by solver for value ordering (prefers primary teachers).
- A teacher with NO competency rows is ineligible for any auto-scheduling (they can still be manually assigned by the principal).

**Solver usage**: When the solver needs to fill "Year 2 Maths, Period 3 Monday", it queries: all teachers with a competency row for (Maths, Year 2) who are available at that time and not double-booked.

---

### 4.4 New Table: `break_groups`

Defines how year groups are grouped during yard breaks and how many supervisors are needed.

| Column                    | Type         | Constraints                                           |
| ------------------------- | ------------ | ----------------------------------------------------- |
| id                        | UUID         | PK                                                    |
| tenant_id                 | UUID         | FK → tenants, NOT NULL                                |
| academic_year_id          | UUID         | FK → academic_years, NOT NULL                         |
| name                      | VARCHAR(100) | NOT NULL (e.g., "Yard 1 — Junior", "Yard 2 — Senior") |
| name_ar                   | VARCHAR(100) | NULL                                                  |
| location                  | VARCHAR(100) | NULL (e.g., "Main Yard", "Sports Field")              |
| required_supervisor_count | SMALLINT     | NOT NULL DEFAULT 1, CHECK (>= 1)                      |
| created_at                | TIMESTAMPTZ  | NOT NULL                                              |
| updated_at                | TIMESTAMPTZ  | NOT NULL                                              |

**Constraint**: `UNIQUE (tenant_id, academic_year_id, name)`

---

### 4.5 New Table: `break_group_year_groups`

Maps which year groups belong to which break group.

| Column         | Type        | Constraints                 |
| -------------- | ----------- | --------------------------- |
| id             | UUID        | PK                          |
| tenant_id      | UUID        | FK → tenants, NOT NULL      |
| break_group_id | UUID        | FK → break_groups, NOT NULL |
| year_group_id  | UUID        | FK → year_groups, NOT NULL  |
| created_at     | TIMESTAMPTZ | NOT NULL                    |

**Constraint**: `UNIQUE (tenant_id, break_group_id, year_group_id)`

**Validation**: A year group can belong to only one break group per break period time. The UI enforces this during configuration.

---

### 4.6 New Table: `room_closures`

Records periods when rooms are unavailable.

| Column             | Type         | Constraints                            |
| ------------------ | ------------ | -------------------------------------- |
| id                 | UUID         | PK                                     |
| tenant_id          | UUID         | FK → tenants, NOT NULL                 |
| room_id            | UUID         | FK → rooms, NOT NULL                   |
| date_from          | DATE         | NOT NULL                               |
| date_to            | DATE         | NOT NULL, CHECK (date_to >= date_from) |
| reason             | VARCHAR(255) | NOT NULL                               |
| created_by_user_id | UUID         | FK → users, NOT NULL                   |
| created_at         | TIMESTAMPTZ  | NOT NULL                               |

**RLS**: Standard tenant isolation.

**Solver usage**: Rooms with active closures overlapping the academic year's effective dates are excluded from the solver's room pool. For mid-year re-runs, closures filter rooms dynamically.

---

### 4.7 Modification: `staff_profiles` or New Table — Teacher Load Limits

Add teaching load limits. These can be added directly to `staff_profiles` or to a scheduling-specific profile. Adding to a new scheduling config table keeps concerns separated:

**New Table: `teacher_scheduling_config`**

| Column                          | Type        | Constraints                                     |
| ------------------------------- | ----------- | ----------------------------------------------- |
| id                              | UUID        | PK                                              |
| tenant_id                       | UUID        | FK → tenants, NOT NULL                          |
| staff_profile_id                | UUID        | FK → staff_profiles, NOT NULL                   |
| academic_year_id                | UUID        | FK → academic_years, NOT NULL                   |
| max_periods_per_week            | SMALLINT    | NULL (NULL = no limit)                          |
| max_periods_per_day             | SMALLINT    | NULL (NULL = no limit)                          |
| max_supervision_duties_per_week | SMALLINT    | NULL (NULL = no limit, for break duty rotation) |
| created_at                      | TIMESTAMPTZ | NOT NULL                                        |
| updated_at                      | TIMESTAMPTZ | NOT NULL                                        |

**Constraint**: `UNIQUE (tenant_id, staff_profile_id, academic_year_id)`

**Semantics**:

- `max_periods_per_week`: Tier 2 constraint. Solver won't exceed this. Principal can override with acknowledgement.
- `max_periods_per_day`: Tier 2 constraint. Same behaviour.
- `max_supervision_duties_per_week`: Controls break duty rotation. If set to 2, this teacher won't be assigned more than 2 yard supervision duties per week.

---

### 4.8 Existing Tables Retained (with notes)

| Table                           | Status                 | Notes                                                                                                                                     |
| ------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `schedules`                     | Retained               | This is the "published" schedule. Solver draft lives in `scheduling_runs.result_json`. Only populated on "Apply".                         |
| `scheduling_runs`               | Retained               | Stores solver runs, config snapshots, results, proposed adjustments.                                                                      |
| `staff_availability`            | Retained               | Hard constraint for teacher time availability. No changes needed.                                                                         |
| `staff_scheduling_preferences`  | Retained               | Soft preferences. No changes needed.                                                                                                      |
| `class_scheduling_requirements` | Retained but secondary | The new `curriculum_requirements` table drives solver input. `class_scheduling_requirements` may still be used for per-section overrides. |
| `rooms`                         | Retained               | Room pool for solver.                                                                                                                     |
| `school_closures`               | Retained               | Used by solver to exclude closure dates.                                                                                                  |

---

## 5. Constraint Tiers

### Tier 1 — Immutable (Blocks Save)

These cannot be overridden. They represent physical impossibilities.

| Constraint             | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| Teacher double-booking | A teacher cannot be in two classrooms at the same time. Period. |

This is the ONLY Tier 1 constraint. Everything else can be overridden by the principal with acknowledgement.

### Tier 2 — Hard (Warns, Requires Acknowledgement)

Violations are highlighted in **red**. On save, an acknowledgement dialog lists all Tier 2 violations. The principal must explicitly confirm.

| Constraint                      | Description                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Teacher unavailability          | Teacher scheduled outside their availability window                                    |
| Subject minimum frequency       | Subject scheduled fewer than `min_periods_per_week`                                    |
| Subject max per day             | Subject scheduled more than `max_periods_per_day` times on a single day                |
| Teacher competency              | Teacher assigned to a subject/year they're not qualified for                           |
| Teacher max periods/week        | Teacher exceeds weekly teaching load limit                                             |
| Teacher max periods/day         | Teacher exceeds daily teaching load limit                                              |
| Room double-booking             | Two classes in the same exclusive room at the same time                                |
| Room type mismatch              | Class assigned to wrong room type                                                      |
| Student group overlap           | Classes sharing students scheduled at the same time                                    |
| Pinned entry conflict           | A pinned entry violates another constraint                                             |
| Break supervision understaffed  | A yard break has fewer supervisors than required                                       |
| Classroom break teacher missing | A classroom break has no adjacent teacher (gap in schedule)                            |
| Room closure                    | Class scheduled in a room that's closed                                                |
| Max consecutive exceeded        | Class exceeds max consecutive periods on a day                                         |
| Min consecutive violated        | Class scheduled in a block smaller than min_consecutive (when double periods required) |

### Tier 3 — Soft (Amber Indicator, No Acknowledgement)

Violations are highlighted in **amber**. Saved silently. Informational only.

| Preference                   | Description                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Teacher time slot preference | Teacher's preferred/avoided time not honoured                                 |
| Teacher subject preference   | Teacher assigned to a non-preferred subject                                   |
| Teacher class preference     | Teacher assigned to a non-preferred class                                     |
| Even subject spread          | Subject clustered on fewer days than optimal                                  |
| Teacher gaps                 | Idle periods between a teacher's classes on the same day                      |
| Room consistency             | Class not in preferred room                                                   |
| Workload imbalance           | Teaching load unevenly distributed across teachers                            |
| Subject preferred frequency  | Subject scheduled fewer than `preferred_periods_per_week` (but above minimum) |
| Break duty imbalance         | One teacher has more supervision duties than others                           |

---

## 6. Solver Architecture

### 6.1 Extended SolverInput

The solver input type is extended to support the new model. The orchestration layer assembles this from the database.

```typescript
interface SolverInputV2 {
  // Period grids per year group
  year_groups: Array<{
    year_group_id: string;
    year_group_name: string;
    sections: Array<{ class_id: string; class_name: string }>;
    period_grid: PeriodSlot[]; // scoped to this year group
  }>;

  // Curriculum requirements per year group
  curriculum: Array<{
    year_group_id: string;
    subject_id: string;
    subject_name: string;
    min_periods_per_week: number;
    max_periods_per_day: number;
    preferred_periods_per_week: number | null;
    requires_double_period: boolean;
    double_period_count: number | null;
  }>;

  // Teacher pool with competencies
  teachers: Array<{
    staff_profile_id: string;
    name: string;
    competencies: Array<{ subject_id: string; year_group_id: string; is_primary: boolean }>;
    availability: TeacherAvailability[];
    preferences: TeacherPreference[];
    max_periods_per_week: number | null;
    max_periods_per_day: number | null;
    max_supervision_duties_per_week: number | null;
  }>;

  // Rooms
  rooms: RoomInfo[];
  room_closures: Array<{ room_id: string; date_from: string; date_to: string }>;

  // Break configuration
  break_groups: Array<{
    break_group_id: string;
    year_group_ids: string[];
    required_supervisor_count: number;
  }>;

  // Pinned entries
  pinned_entries: PinnedEntry[];

  // Student overlaps (pre-computed)
  student_overlaps: StudentOverlap[];

  // Settings
  settings: SolverSettings;
}
```

### 6.2 Solver Variable Generation

Variables are generated differently from the original solver:

1. **Teaching variables**: For each year group section (e.g., Year 2A) × each subject in its curriculum × `min_periods_per_week` → one variable per required period slot. E.g., Year 2A needs Maths 4x/week → 4 variables: `year2a-maths-0`, `year2a-maths-1`, `year2a-maths-2`, `year2a-maths-3`.

2. **Yard supervision variables**: For each yard break slot × each break group → `required_supervisor_count` variables. E.g., Yard 1 break on Monday needs 2 supervisors → 2 variables: `yard1-mon-break-sup0`, `yard1-mon-break-sup1`.

3. **Classroom break variables**: NOT generated. Instead, classroom breaks create **extended availability constraints** on adjacent teaching variables (see Section 7).

### 6.3 Domain Values

For teaching variables: `(weekday, period_order, teacher_staff_id, room_id)` — now includes teacher selection.

For yard supervision variables: `(teacher_staff_id)` — the slot is fixed (the break is at a known time), only the teacher varies.

### 6.4 New Hard Constraints (added to existing set)

| Constraint                 | Check                                                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teacher competency         | Teacher must have a competency row for (subject, year_group)                                                                                                                                         |
| Subject max per day        | Count of same subject for same year group on same weekday ≤ `max_periods_per_day`                                                                                                                    |
| Subject min per week       | After all variables assigned, verify count ≥ `min_periods_per_week`                                                                                                                                  |
| Teacher weekly load        | Total assigned periods for teacher across all days ≤ `max_periods_per_week`                                                                                                                          |
| Teacher daily load         | Total assigned periods for teacher on this day ≤ `max_periods_per_day`                                                                                                                               |
| Classroom break adjacency  | If a teaching period is adjacent to a `classroom_next` break, the assigned teacher must also be available during the break time. If adjacent to a `classroom_previous` break, same logic in reverse. |
| Break supervision staffing | Each yard break slot must have exactly `required_supervisor_count` teachers assigned                                                                                                                 |
| Break duty weekly cap      | Teacher's total yard supervision assignments ≤ `max_supervision_duties_per_week`                                                                                                                     |
| Double period enforcement  | If `requires_double_period`, the solver must place `double_period_count` blocks of 2 consecutive periods                                                                                             |

### 6.5 Solver Algorithm

The core algorithm remains CSP with constraint propagation (forward checking) + backtracking, as implemented in the original solver. Extensions:

1. **Variable ordering (MRV)**: Priority order: (1) yard supervision variables (most constrained — few eligible teachers), (2) double-period teaching variables (harder to place), (3) single-period teaching variables.

2. **Value ordering**: Prefer (a) primary teachers for this subject+year, (b) teachers with fewer existing assignments (load balancing), (c) values satisfying more soft preferences.

3. **Teacher selection**: The original solver assumed teachers were pre-assigned to classes. The new solver SELECTS teachers from the competency pool as part of domain value generation.

4. **Two-pass approach**: The solver can optionally run two passes:
   - Pass 1: Assign all teaching periods (using min_periods_per_week).
   - Pass 2: Fill remaining empty teaching slots with additional subject periods (up to preferred_periods_per_week) where possible.

---

## 7. Break / Supervision Model

This is the most complex new feature. There are two fundamentally different types of breaks.

### 7.1 Yard Breaks (Big Break / Main Break)

**What happens**: Students leave their classrooms and go to a shared outdoor area (yard, sports field, etc.). Multiple year groups share the same space. Teachers from the pool are assigned to supervise.

**Configuration**:

1. Principal creates **break groups** (e.g., "Junior Yard — Years 1-5", "Senior Yard — Years 6-11")
2. For each break group, specifies:
   - Which year groups are included
   - How many supervisors are required (e.g., 2 teachers)
   - A name and optional location
3. In the period grid, yard break periods are created with `supervision_mode = 'yard'` and linked to a `break_group_id`

**Solver behaviour**:

- Yard supervision is a separate variable type. The solver assigns N teachers to each yard break slot.
- Eligible teachers: any teacher who (a) is available at that time, (b) is not teaching or supervising elsewhere, (c) hasn't exceeded their `max_supervision_duties_per_week`.
- Break duty rotation: the solver distributes yard duties across teachers, respecting the weekly cap. The `workload_balance` and `break_duty_imbalance` soft constraints encourage even distribution.

**Multi-yard, same time**: Two yards can have breaks at the same time (e.g., Yard 1 and Yard 2 both at 10:30). The solver assigns different teachers to each. This is handled naturally by the teacher double-booking constraint.

### 7.2 Classroom Breaks (Small Lunch / Short Break)

**What happens**: Students stay in their classroom. They eat or rest at their desks. A teacher supervises them, but it's not a separate assignment — it's an extension of an adjacent teaching period.

**Two modes**:

**Mode A — Previous Teacher Stays** (`supervision_mode = 'classroom_previous'`):

- The teacher who taught the period BEFORE the break stays for the duration of the break.
- E.g., Mr. Smith teaches Maths 10:00-11:00, then the break is 11:00-11:15. Mr. Smith supervises 11:00-11:15.
- **Solver impact**: When assigning a teacher to the period before a `classroom_previous` break, the solver must verify the teacher is available from `period_start` through `break_end` (not just `period_end`). It must also verify the teacher is not double-booked during the break time.

**Mode B — Next Teacher Arrives Early** (`supervision_mode = 'classroom_next'`):

- The teacher who will teach the period AFTER the break arrives early and supervises.
- E.g., The break is 11:00-11:15, then Miss Kavanagh teaches English 11:15-12:00. Miss Kavanagh supervises 11:00-11:15.
- **Solver impact**: When assigning a teacher to the period after a `classroom_next` break, the solver must verify the teacher is available from `break_start` through `period_end`. It must also verify the teacher is not double-booked during the break time.
- This is the default for ~99% of schools.

**Key implementation detail**: Classroom breaks are NOT separate solver variables. They are constraints on adjacent teaching period assignments. The solver extends the availability window check:

```
For a teaching period adjacent to a classroom break:
  If break is classroom_next (before this period):
    teacher must be available from break.start_time to period.end_time
    teacher must not be booked elsewhere during break.start_time to break.end_time
  If break is classroom_previous (after this period):
    teacher must be available from period.start_time to break.end_time
    teacher must not be booked elsewhere during break.start_time to break.end_time
```

**Edge case — no adjacent teaching period**: If a classroom break is the first or last period of the day, or if the adjacent teaching slot is empty (unassigned), the break has no supervisor. This is flagged as a Tier 2 violation: "Classroom break at [time] has no supervising teacher."

**Edge case — both sides specified**: A period could be adjacent to a `classroom_previous` break before it AND a `classroom_next` break after it. In this case, the teacher's effective availability window extends in both directions.

### 7.3 Year Groups and Breaks

Different year groups can have breaks at different times. Year 1 might have a short break at 9:50 while Year 6 has theirs at 10:15. This is naturally handled because each year group has its own period grid.

However, yard breaks that group multiple year groups together require those year groups to have a break at the same time. The UI validates this: if Yard 1 includes Years 1-5, all of those year groups must have a break period at the same time on the same weekday.

---

## 8. Functional Requirements

### 8.1 Period Grid Configuration (Tenant Owner)

- Owner selects a year group → visual grid editor appears (rows = periods, columns = weekdays)
- For each weekday, owner can:
  - Mark the day as a teaching day or non-teaching day
  - Add/remove period slots
  - Set start time, end time, period name, period type for each slot
  - Insert breaks: choose type (short break, lunch), choose supervision mode (yard, classroom_previous, classroom_next)
  - For yard breaks: link to a break group
- Quick actions:
  - "Copy Monday to all weekdays"
  - "Copy from [Year Group X]" (template reuse)
  - "Add period to all days at [time]"
- Validation:
  - No overlapping periods on the same day
  - End time > start time
  - At least 1 teaching period on at least 1 day
- Permission: `schedule.configure_period_grid`
- **Acceptance**: Period grid saved per year group, breaks configured with correct supervision mode

### 8.2 Curriculum Requirements Configuration (Principal/Admin)

- Principal selects a year group → sees total teaching periods available per week (read from period grid)
- Table view: Subject | Min Periods/Week | Max Per Day | Preferred/Week | Double Period? | Double Count
- Principal fills in requirements for each subject
- Running total at bottom: "18 of 25 teaching periods allocated. 7 remaining."
- Warning if total min exceeds available: "Curriculum requires 28 periods but only 25 available."
- Bulk entry supported
- Quick action: "Copy from [previous academic year]" / "Copy from [Year Group X]"
- Permission: `schedule.configure_requirements`
- **Acceptance**: All subjects for a year group have frequencies defined. Solver respects minimums and max-per-day.

### 8.3 Teacher Competency Matrix Configuration (Principal/Admin)

- Two views:
  - **By teacher**: Select Mr. Smith → see/edit all his subject+year competencies
  - **By subject+year**: Select "Maths, Year 2" → see/edit all eligible teachers
- Mark teachers as "primary" (preferred) for specific combinations
- Quick action: "Copy competencies from [previous academic year]"
- Completeness indicator: "Year 2 Maths: 3 eligible teachers. Year 2 English: 1 eligible teacher (⚠️ low coverage)"
- Warning when a subject+year has zero eligible teachers
- Permission: `schedule.configure_requirements`
- **Acceptance**: Solver only assigns teachers from the competency matrix. No competency = not selected.

### 8.4 Break Group Configuration (Principal/Admin)

- Principal creates break groups: name, location, required supervisor count
- Assigns year groups to break groups
- Validation: each year group can belong to only one break group per break time slot
- Break groups are linked to yard-type break periods in the period grid
- Permission: `schedule.configure_requirements`
- **Acceptance**: Yard breaks have correct year-group grouping and supervisor count.

### 8.5 Teacher Scheduling Config (Principal/Admin)

- Per teacher, per academic year:
  - Max periods per week (NULL = no limit)
  - Max periods per day (NULL = no limit)
  - Max supervision duties per week (NULL = no limit)
- Table view of all teachers with their limits
- Permission: `schedule.configure_availability`
- **Acceptance**: Solver respects load limits. Violations flagged as Tier 2.

### 8.6 Room Closures (Principal/Admin)

- CRUD for room closures: room, date range, reason
- Calendar view showing room availability
- Solver excludes rooms with active closures
- Permission: `schedule.manage` (existing)
- **Acceptance**: Closed rooms not assigned by solver.

### 8.7 Teacher Availability (existing, no changes)

Per Phase 4B original. Visual weekly grid, hard constraint.

### 8.8 Teacher Preferences (existing, no changes)

Per Phase 4B original. Subject/class/time preferences with priority.

### 8.9 Pinned Entry Management (existing, enhanced)

Per Phase 4B original. Enhanced: pinned entries now display in the context of the 3-tier constraint model. If a pinned entry violates a Tier 2 constraint, it's highlighted in red before the solver even runs.

### 8.10 Solver Prerequisites Check

Before the solver can run, validate:

- Period grid exists for all year groups that have classes
- Curriculum requirements defined for all year groups
- Every subject+year in curriculum has at least one eligible teacher in competency matrix
- Yard break groups have at least `required_supervisor_count` total available teachers
- No pinned entry conflicts (teacher double-booking between pinned entries)
- No pinned entries violating teacher availability
- All referenced classes still active
- Missing prerequisites shown as checklist with fix links
- Solver button disabled until all met
- Permission: `schedule.run_auto`

### 8.11 Solver Execution

- Principal selects academic year → "Generate Timetable"
- Mode auto-detected: pinned entries exist → hybrid. None → auto.
- BullMQ background job with progress reporting
- Live counter: "342 of 380 class slots assigned"
- Cancel button available
- On completion: redirect to review screen
- On failure/timeout: show error with best partial result
- Permission: `schedule.run_auto`

### 8.12 Proposed Timetable Review & Manual Editing

- Rendered from `result_json` + `proposed_adjustments`
- "PROPOSED — Not Yet Applied" banner
- Visual states:
  - Pinned entries: solid background, pin icon
  - Auto-generated: dashed border, lighter background
  - Manual additions: different border style
- **Manual operations**:
  - Drag entry to different slot
  - Swap two entries
  - Remove auto-generated entry (leaves slot empty)
  - Add entry to empty slot (select subject + teacher from eligible pool)
  - Each operation saved to `proposed_adjustments` via PATCH (crash-safe)
- **Validate button**: Runs full constraint check across the entire schedule. Results:
  - **Red cells**: Tier 1 or Tier 2 violations. Tooltip shows violation details.
  - **Amber cells**: Tier 3 preference violations. Tooltip shows details.
  - **Clean cells**: No violations.
  - **Summary banner**: "2 hard violations, 5 preference issues. Schedule health: 82/100"
- Validation is explicit — only runs when button is clicked, NOT on every drag.
- Permission: `schedule.run_auto` for editing, `schedule.view_auto_reports` for detailed reports

### 8.13 Apply or Discard

**Apply**:

- Writes schedule entries from final proposed timetable into `schedules` table
- Old `source = 'auto_generated'` entries: without attendance → deleted. With attendance → end-dated.
- Pinned entries preserved
- New entries: `source = 'auto_generated'`, `scheduling_run_id` set, `effective_start_date` = today or academic year start
- Atomic transaction
- Period grid drift guard (grid changed since run → error, must re-run)
- Permission: `schedule.apply_auto`. Non-school_owner may require approval.

**Discard**: Run status → `discarded`. No schedule changes.

### 8.14 Post-Apply: Save Confirmation

On save (apply):

- Tier 1 violations → **blocked**. Cannot save. Error message.
- Tier 2 violations → **acknowledgement dialog** listing all violations with details. Principal must click "I understand, save anyway."
- Tier 3 violations → saved silently. Info shown in the health score but no prompt.

---

## 9. Enhancements

### 9.1 Cover Teacher / Substitute Finder

When a teacher is absent, the principal needs to quickly find a replacement for each of that teacher's periods.

- "Find Cover" button on any scheduled slot
- System queries: teachers who are (a) not scheduled at that time, (b) competent for that subject+year, (c) available at that time
- Results sorted by: primary competency first, then fewest existing periods that day (least disruption)
- One-click assignment: select a cover teacher → creates a temporary schedule entry with `source = 'manual'` and an end date
- Permission: `schedule.manage`
- **Acceptance**: Shows only eligible available teachers, sorted by suitability.

### 9.2 What-If Mode

Allow the principal to compare different solver configurations side-by-side.

- "What If" button creates a new solver run without discarding the current one
- Principal can modify inputs (add a teacher, change a requirement) and re-run
- Side-by-side comparison view: two timetable grids with differences highlighted
- Diff summary: "What-if has 3 more assigned slots, 2 fewer preference violations, Mr. Smith has 4 fewer periods"
- Multiple what-if runs stored as `scheduling_runs` in `completed` status
- Permission: `schedule.run_auto`
- **Acceptance**: Two runs displayed side-by-side with clear diff indicators.

### 9.3 Teacher Workload Sidebar

During manual editing, a collapsible sidebar shows live teacher workload:

- List of all teachers sorted by total assigned periods (descending)
- Per teacher: total periods, periods per day breakdown, supervision duties
- Colour coding: green (normal), amber (approaching limit), red (at/over limit)
- Updates live as the principal drags entries around (recalculated from current draft state)
- Click a teacher → highlights all their assignments on the grid
- **Acceptance**: Sidebar reflects current draft state accurately. Updates on each manual change.

### 9.4 Schedule Health Score

After validation (or after solver completes), display a health dashboard:

- Overall score: 0–100 (based on constraint satisfaction)
- Breakdown:
  - Hard constraint violations: count and list
  - Preference satisfaction: percentage and per-teacher details
  - Unassigned slots: count with reasons
  - Workload balance: rating
- Each item is clickable → navigates to the relevant cell(s) on the grid
- Health score is recalculated on every "Validate" click
- **Acceptance**: Score accurately reflects all constraint tiers. Clickable navigation works.

### 9.5 Template Reuse Across Academic Years

When setting up a new academic year:

- "Copy from [Previous Academic Year]" button on:
  - Period grid configuration
  - Curriculum requirements
  - Teacher competencies
  - Break group configuration
  - Teacher scheduling config
- Copies all records with the new academic year ID
- Principal reviews and adjusts deltas
- **Acceptance**: Copy creates complete duplicate, all fields correct for new year.

### 9.6 Multi-Section Year Groups

Year groups with multiple sections (Year 2A, Year 2B) share curriculum requirements:

- Curriculum requirements are defined at the year group level (not per section)
- All sections under a year group inherit the same subject frequencies
- The solver schedules each section independently (different teachers, potentially different times)
- Sections CAN share teachers — if Mr. Smith teaches Year 2A Maths periods 1-2, he can also teach Year 2B Maths periods 3-4 (as long as no double-booking)
- The `Class` model already supports this: each section is a `Class` with the same `year_group_id` and `subject_id`
- **Acceptance**: Curriculum requirements defined once per year group, applied to all sections.

### 9.7 Double / Linked Periods

Some subjects require consecutive periods (Science labs, Art, PE):

- `curriculum_requirements.requires_double_period = true` and `double_period_count = N`
- Solver places N blocks of 2 consecutive teaching periods for this subject on the same day
- Remaining periods (if `min_periods_per_week > double_period_count * 2`) are placed as singles
- Hard constraint: double periods must be on consecutive teaching slots (breaks between them do NOT break consecutiveness if they are `classroom_*` type, but DO break consecutiveness if they are `yard` type)
- The existing `max_consecutive_periods` and `min_consecutive_periods` fields in `class_scheduling_requirements` are repurposed for this
- **Acceptance**: Solver correctly places double-period blocks. Validated on manual editing.

---

## 10. Print / Export

After the schedule is applied (or during review), the principal can export timetables.

### Supported views:

- **Per teacher**: Mr. Smith's weekly timetable
- **Per room**: Lab 1's weekly timetable
- **Per year group / class section**: Year 2A's weekly timetable
- **Full school**: All year groups, all days (large format)

### Supported formats:

- **PDF**: Rendered via Puppeteer (same infrastructure as payslips/report cards). Landscape A4. Locale-aware (English/Arabic with RTL).
- **Excel/CSV**: Tabular export with columns: Day | Period | Time | Subject | Teacher | Room | Year Group

### API:

- `GET /api/v1/scheduling/export/teacher/:staffProfileId?format=pdf|csv&academic_year_id=X`
- `GET /api/v1/scheduling/export/room/:roomId?format=pdf|csv&academic_year_id=X`
- `GET /api/v1/scheduling/export/year-group/:yearGroupId?format=pdf|csv&academic_year_id=X`
- `GET /api/v1/scheduling/export/full?format=pdf|csv&academic_year_id=X`

### Permission: `schedule.manage` for admin exports, `schedule.view_own` for teacher's own PDF.

---

## 11. Notifications

### On schedule publication (apply):

- **Teachers**: "Your timetable has been updated for [Academic Year/Term]. View it here." (in-app notification + optional email)
- **Parents**: Optional — "The class schedule for [Year Group] has been updated." (in-app notification if enabled)

### On solver completion:

- **Initiating admin**: "Timetable generation complete. [N] slots assigned, [M] unassigned. Preference satisfaction: [X]%." (in-app notification)

### On solver failure:

- **Initiating admin**: "Timetable generation failed: [reason]. Partial result available." (in-app + email)

### Uses existing notification infrastructure (domain events → notification dispatch).

---

## 12. Edge Cases

| Edge Case                                                            | Handling                                                                                                                                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Year group has no period grid                                        | Solver prerequisites check blocks run. "Year Group X has no period grid configured."                                                                                               |
| Subject has zero eligible teachers                                   | Solver prerequisites check warns. Solver lists in `unassigned` with reason "No eligible teachers for [Subject] in [Year Group]."                                                   |
| Only 1 teacher for a subject + multiple sections                     | Solver schedules sections at different times. If impossible (not enough slots), partially assigns and flags.                                                                       |
| Teacher load limit hit mid-solve                                     | Solver respects limit — remaining slots for that teacher's subjects assigned to other eligible teachers or left unassigned.                                                        |
| Classroom break with no adjacent teaching period                     | Flagged as Tier 2: "Break at [time] has no supervising teacher."                                                                                                                   |
| Classroom break — teacher before/after is different section          | The constraint applies to the actual assigned teacher, not the class. If Year 2A has the break at 11:00, the teacher for Year 2A's next period supervises — not Year 2B's teacher. |
| Two yard breaks at same time, different groups                       | Normal operation. Different teachers assigned to each. Teacher double-booking prevents overlap.                                                                                    |
| Year groups in same break group have different break times           | UI validation prevents this. Break groups require all member year groups to have yard breaks at the same time.                                                                     |
| Room under renovation + active closure                               | Solver excludes room from pool. If a pinned entry uses that room, prerequisites check flags it.                                                                                    |
| Teacher has competencies but no availability rows                    | Treated as "fully available" (existing behaviour). Competency check passes.                                                                                                        |
| Template copy from previous year — subjects changed                  | Copy brings all records. New subjects have no requirements. Removed subjects have orphan requirements that the principal should clean up. UI shows warning.                        |
| Solver timeout                                                       | Returns best partial solution. All assigned entries are valid (no hard constraint violations). Unassigned list has reasons.                                                        |
| Mid-year re-run after manual changes                                 | Manual entries (`source = 'manual'`) are treated as pinned for the re-run. Only `auto_generated` entries are replaced.                                                             |
| Principal drags entry creating Tier 1 violation                      | On "Validate" click, red cell appears. On "Save" attempt, blocked with error: "Cannot save: [teacher] is in two places at [time]."                                                 |
| Principal drags entry creating Tier 2 violation                      | On "Validate" click, red cell appears. On "Save" attempt, acknowledgement dialog: "The following issues were found: [list]. Do you want to save anyway?"                           |
| Double period — no 2 consecutive teaching slots available on any day | Solver places as 2 singles (violating min_consecutive). Flagged as Tier 2 violation.                                                                                               |
| Break duty rotation — not enough teachers for all supervision slots  | Solver assigns what it can. Remaining slots unassigned with reason "Insufficient teachers available for supervision."                                                              |
| What-if run while current run is being edited                        | What-if creates a new `scheduling_run`. Both can exist in `completed` status. Only one can be `applied`.                                                                           |
| Concurrent solver runs                                               | Blocked by UNIQUE partial index on `(tenant_id, academic_year_id) WHERE status IN ('queued', 'running')`.                                                                          |

---

## 13. Error Codes

| Code                                    | Meaning                                                                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `SCHEDULER_PREREQUISITES_INCOMPLETE`    | Not all year groups have period grids, or curriculum requirements missing, or subjects without eligible teachers. `details.missing[]`. |
| `SCHEDULER_RUN_ACTIVE`                  | A run is already queued/running for this year. `details.existing_run_id`.                                                              |
| `SCHEDULER_PINNED_CONFLICT`             | Two pinned entries create a Tier 1 conflict. `details.entry_a`, `details.entry_b`.                                                     |
| `SCHEDULER_PINNED_AVAILABILITY`         | Pinned entry outside teacher availability.                                                                                             |
| `SCHEDULER_TIMEOUT`                     | Solver exceeded max duration. Partial result available.                                                                                |
| `SCHEDULER_NO_SOLUTION`                 | Zero valid assignments (extremely rare).                                                                                               |
| `SCHEDULER_RUN_NOT_COMPLETED`           | Cannot apply/adjust a run not in `completed` status.                                                                                   |
| `SCHEDULER_PERIOD_GRID_CHANGED`         | Period grid modified since run. Re-run required.                                                                                       |
| `SCHEDULER_TIER1_VIOLATION`             | Cannot save: teacher double-booking detected. `details.violations[]`.                                                                  |
| `SCHEDULER_BREAK_GROUP_TIME_MISMATCH`   | Year groups in a break group have breaks at different times.                                                                           |
| `SCHEDULER_CURRICULUM_EXCEEDS_CAPACITY` | Total minimum periods exceed available teaching slots. `details.year_group_id`, `details.required`, `details.available`.               |

---

## 14. Permissions

### Admin tier (school_owner, school_admin):

- `schedule.configure_period_grid` — period grid per year group
- `schedule.configure_requirements` — curriculum requirements, teacher competencies, break groups
- `schedule.configure_availability` — teacher availability, load limits (school_owner only)
- `schedule.manage_preferences` — manage any teacher's preferences
- `schedule.run_auto` — execute solver, review, manually adjust
- `schedule.apply_auto` — apply proposed timetable (publish)
- `schedule.pin_entries` — pin/unpin entries
- `schedule.view_auto_reports` — view detailed constraint/preference reports
- `schedule.manage` — manual CRUD on schedule entries, room closures, cover teacher

### Staff tier (teacher):

- `schedule.view_own` — view own timetable
- `schedule.manage_own_preferences` — manage own preferences
- `schedule.view_own_satisfaction` — view own preference satisfaction

---

## 15. Deliverables

### Database

- Modified: `schedule_period_templates` (add `year_group_id`, `supervision_mode`, `break_group_id`)
- New: `curriculum_requirements`
- New: `teacher_competencies`
- New: `break_groups`
- New: `break_group_year_groups`
- New: `room_closures`
- New: `teacher_scheduling_config`
- Migration + RLS policies + triggers for all new/modified tables

### Shared Package

- Extended solver types (`SolverInputV2`, new constraint types)
- New constraint functions (competency, subject frequency, max-per-day, load limits, break adjacency, double periods)
- Modified solver to handle teacher selection (not pre-assigned)
- New validation service types (3-tier constraint results)

### Backend (NestJS)

- Curriculum requirements CRUD (controller + service)
- Teacher competencies CRUD (controller + service)
- Break groups CRUD (controller + service)
- Room closures CRUD (controller + service)
- Teacher scheduling config CRUD (controller + service)
- Modified period grid endpoints (year group scope)
- Orchestration service (assembles `SolverInputV2` from database)
- Validation service (3-tier constraint check, returns violations per cell)
- Cover teacher finder service + endpoint
- What-if mode (multiple draft runs)
- Export endpoints (PDF + CSV per teacher/room/year-group/full)
- Notification triggers on apply/complete/fail
- Modified BullMQ solver job (handles new input format)

### Frontend (Next.js)

- Period grid editor per year group (owner view)
- Curriculum requirements editor
- Teacher competency matrix (by-teacher and by-subject views)
- Break group configuration
- Teacher scheduling config editor
- Room closures management
- Solver review screen with manual editing (drag/drop/swap/add/remove)
- Validate button with red/amber cell painting
- Tier 2 acknowledgement dialog on save
- Teacher workload sidebar
- Schedule health score dashboard
- Cover teacher finder dialog
- What-if comparison view
- Template reuse ("Copy from") on all config screens
- Export buttons (PDF/CSV) on timetable views
- All screens bilingual (en/ar) with RTL logical CSS

### Testing

- Solver integration tests: small (10 teachers), medium (30 teachers), large (60 teachers)
- New constraint tests: competency, subject frequency, max-per-day, load limits, break adjacency, double periods
- Break model tests: yard break assignment, classroom break adjacency (both modes), edge cases
- Validation service tests: all 3 tiers, cell-level violation mapping
- RLS leakage tests: all new tables
- Performance benchmarks: target <30s for 40-teacher school
- Print/export snapshot tests in both locales

---

## 16. Implementation Priority

The implementation should follow this order to maximise early testability:

1. **Database migration** — new tables + modified tables + RLS + indexes
2. **Shared types** — extended solver input/output types, validation types
3. **Solver core changes** — teacher selection, new constraints, break adjacency
4. **Solver tests** — verify correctness with new constraint types
5. **Backend CRUD** — curriculum requirements, competencies, break groups, room closures, teacher config
6. **Orchestration service** — assembles SolverInput from DB, triggers solver
7. **Validation service** — 3-tier constraint checking, cell-level violations
8. **Backend enhancements** — cover teacher, what-if, export
9. **Frontend — config screens** — period grid, curriculum, competencies, break groups
10. **Frontend — solver review** — grid view, manual editing, validate button, health score
11. **Frontend — enhancements** — workload sidebar, what-if, cover teacher, export
12. **Notifications** — on apply, complete, fail
13. **Template reuse** — copy-from actions across all config screens
