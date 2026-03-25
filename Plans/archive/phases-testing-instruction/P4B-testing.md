# Phase 4B Testing Instructions — Auto-Scheduling

---

## Section 1 — Unit Tests

### 1.1 CSP Solver (packages/shared/src/scheduler/)

Tests already exist in `__tests__/`. Extend with:

#### constraints.test.ts
- **Teacher double-booking**: Assign teacher T1 to class A at (Mon, period 1). Try assigning T1 to class B at same slot → violation.
- **Teacher double-booking with multi-teacher**: Class has teachers [T1, T2]. T2 already assigned elsewhere at same slot → violation.
- **Room double-booking (exclusive)**: Room R1 (exclusive=true) assigned to class A. Try class B in same room/slot → violation.
- **Room double-booking (non-exclusive, under capacity)**: Room R2 (exclusive=false, capacity=40). Class A (20 students) assigned. Class B (15 students) → should pass.
- **Room double-booking (non-exclusive, over capacity)**: Same room, class B has 25 students (total 45 > 40) → violation.
- **Student overlap**: Classes A and B share students. Assigned to same slot → violation.
- **Teacher availability (within)**: Teacher available Mon 08:00-14:00. Period 08:00-08:45 → should pass.
- **Teacher availability (outside)**: Period 14:00-14:45 → violation.
- **Teacher availability (no rows)**: No availability rows → fully available, should pass.
- **Teacher availability (partial coverage)**: Available 08:00-12:00. Period 11:30-12:30 → violation (not fully contained).
- **Period type match (academic → teaching)**: Academic class assigned to teaching period → pass.
- **Period type match (academic → break)**: Academic class assigned to break_supervision period → violation.
- **Period type match (supervision → break)**: Supervision class assigned to break_supervision period → pass.
- **Max consecutive**: Class has max_consecutive=2. Already assigned periods 1,2 on Monday. Try period 3 → violation.
- **Max consecutive (with gap)**: Periods 1,2 assigned, skip 3, try 4 → should pass (resets after gap).

#### solver.test.ts
- **Empty input**: No classes, no periods → returns empty entries, 0 unassigned.
- **All slots pinned**: All periods filled by pinned entries → SCHEDULER_ALL_SLOTS_PINNED, entries = pinned, unassigned = 0.
- **Small school complete solve**: 20 classes, 5 rooms, 10 teachers → all classes assigned within 30 seconds.
- **Determinism**: Same input + same seed → identical output.
- **Different seed**: Same input + different seed → potentially different assignment order.
- **Timeout returns partial**: Set max_solver_duration_seconds=0.001. Verify returns best partial result.
- **Cancellation**: Set shouldCancel to return true after 10 assignments. Verify returns partial result.
- **Pinned entries preserved**: 3 pinned entries in input. Verify all 3 appear in output with is_pinned=true.
- **Unassigned with reason**: Create impossible constraint (class needs lab, no lab room). Verify appears in unassigned with reason.
- **Supervision classes → supervision slots**: Supervision class assigned only to break_supervision/lunch_duty periods.
- **Preference satisfaction scoring**: Add high-priority preferences, verify score > 0.

#### preferences.test.ts (new)
- **Subject preference (prefer)**: Teacher prefers subject S1. Assigned to S1 classes → satisfied.
- **Subject preference (avoid)**: Teacher avoids subject S2. Assigned to S2 → not satisfied.
- **Time slot preference**: Teacher prefers period 1. Assigned to period 1 → satisfied.
- **Priority weighting**: High priority (weight 3) vs low priority (weight 1). Verify correct weights.
- **Even spread**: Class with 4 periods across 4 different days → high score. All on same day → low score.
- **Teacher gap minimization**: Teacher with periods 1,4 (2 gaps) vs periods 1,2 (0 gaps). Verify scoring.

### 1.2 PeriodGridService

- **create**: Valid period created. TIME fields stored correctly.
- **create with overlap**: Two periods with overlapping times on same day → error (exclusion constraint).
- **create with duplicate order**: Same (weekday, period_order) → error (unique constraint).
- **update**: Partial update (name only, time only, type only) all work.
- **delete**: Period deleted.
- **copyDay**: Copy Mon to Tue,Wed. Verify all periods copied. Skip existing on target.
- **getGridHash**: Same grid → same hash. Different grid → different hash.

### 1.3 ClassRequirementsService

- **create**: Valid requirement with all fields.
- **create with min > max consecutive**: Should fail validation.
- **bulkUpsert**: 5 entries — 3 new, 2 existing. Verify created=3, updated=2.
- **findAll completeness**: 10 active classes, 7 have requirements → meta.configured=7, meta.unconfigured=3.

### 1.4 StaffAvailabilityService

- **replaceForStaff**: Set 3 days of availability. Verify 3 rows created.
- **replaceForStaff (replace)**: Already has 3 days, replace with 5 → old deleted, new created.
- **replaceForStaff (clear)**: Empty entries array → all deleted (fully available).
- **replaceForStaff with duplicate weekdays**: Same weekday twice → validation error.

### 1.5 StaffPreferencesService

- **create (admin)**: Admin creates preference for any teacher.
- **create (self-service)**: Teacher creates own preference.
- **create (self-service for other)**: Teacher tries to create for another teacher → 403.
- **findOwnPreferences**: Returns only caller's preferences.

### 1.6 SchedulingPrerequisitesService

- **all checks pass**: Complete setup → ready=true.
- **no period grid**: Zero teaching periods → check fails.
- **unconfigured classes**: 3 classes without requirements → check fails with count.
- **classes without teachers**: 2 classes with no teacher assignment → check fails.
- **pinned conflicts**: Two pinned entries double-booking teacher → check fails.
- **pinned availability violation**: Pinned entry outside teacher hours → check fails.

### 1.7 SchedulingRunsService

- **create**: Creates run with status=queued. Auto-detects mode.
- **create with active run**: Returns SCHEDULER_RUN_ACTIVE error.
- **cancel**: Transitions queued/running → failed.
- **cancel terminal**: Trying to cancel applied/discarded → error.
- **addAdjustment (move)**: Appends move to proposed_adjustments.
- **addAdjustment (swap)**: Appends swap.
- **discard**: Transitions completed → discarded.

### 1.8 SchedulingApplyService

- **apply success**: Creates schedule entries, deletes old auto entries, updates run status.
- **apply with attendance**: Old auto entries with attendance sessions → end-dated not deleted.
- **apply concurrent**: Two concurrent applies → one fails with CONCURRENT_MODIFICATION.
- **apply period grid changed**: Grid hash mismatch → SCHEDULER_PERIOD_GRID_CHANGED.
- **apply inactive class**: Class deactivated during review → excluded from insertion.

---

## Section 2 — Integration Tests

### 2.1 Period Grid Endpoints

```
POST /api/v1/period-grid
  Happy: { academic_year_id, weekday: 0, period_name: "Period 1", period_order: 0, start_time: "08:00", end_time: "08:45", schedule_period_type: "teaching" } → 201
  Missing academic_year_id → 400
  Invalid time (end <= start) → 400
  Duplicate period_order → 409
  No auth → 401
  Missing permission → 403

GET /api/v1/period-grid?academic_year_id=X → 200, { data: [...] }
  Missing academic_year_id → 400

PATCH /api/v1/period-grid/:id
  { period_name: "Updated" } → 200
  Non-existent ID → 404

DELETE /api/v1/period-grid/:id → 200
  Non-existent ID → 404

POST /api/v1/period-grid/copy-day
  { academic_year_id, source_weekday: 0, target_weekdays: [1, 2] } → 200
  Source day has no periods → 200 with created=0
```

### 2.2 Class Requirements Endpoints

```
GET /api/v1/class-scheduling-requirements?academic_year_id=X → 200
  Response includes meta.configured and meta.unconfigured

POST /api/v1/class-scheduling-requirements
  Happy path → 201
  Duplicate (class_id, academic_year_id) → 409
  Non-existent class → 404

POST /api/v1/class-scheduling-requirements/bulk
  { academic_year_id, requirements: [...] } → 200 with meta.created and meta.updated

PATCH /api/v1/class-scheduling-requirements/:id
  { periods_per_week: 3 } → 200
  { min_consecutive_periods: 5, max_consecutive_periods: 2 } → 400

DELETE /api/v1/class-scheduling-requirements/:id → 200
```

### 2.3 Staff Availability Endpoints

```
GET /api/v1/staff-availability?academic_year_id=X → 200
GET /api/v1/staff-availability?academic_year_id=X&staff_profile_id=Y → 200 (filtered)

PUT /api/v1/staff-availability/staff/:id/year/:yearId
  { entries: [{ weekday: 0, available_from: "08:00", available_to: "14:00" }] } → 200
  Empty entries → 200 (clears all)
  Duplicate weekdays → 400
  Non-existent staff → 404

DELETE /api/v1/staff-availability/:id → 200
```

### 2.4 Staff Preferences Endpoints

```
GET /api/v1/staff-scheduling-preferences?academic_year_id=X → 200
GET /api/v1/staff-scheduling-preferences/own?academic_year_id=X → 200

POST /api/v1/staff-scheduling-preferences
  Happy (subject): { staff_profile_id, academic_year_id, preference_payload: { type: "subject", subject_ids: [...], mode: "prefer" }, priority: "high" } → 201
  Happy (time_slot): { ... type: "time_slot", weekday: 0, preferred_period_orders: [1,2], mode: "avoid" } → 201
  Self-service for other teacher → 403

PATCH /api/v1/staff-scheduling-preferences/:id
  { priority: "low" } → 200

DELETE /api/v1/staff-scheduling-preferences/:id → 200
```

### 2.5 Pin Management Endpoints

```
POST /api/v1/schedules/:id/pin
  { pin_reason: "Fixed by principal" } → 200, is_pinned=true, source=pinned
  Non-existent ID → 404
  No permission → 403

POST /api/v1/schedules/:id/unpin → 200, is_pinned=false, source=manual

POST /api/v1/schedules/bulk-pin
  { schedule_ids: [id1, id2], pin_reason: "Block A" } → 200, meta.pinned=2
  Unknown ID in list → 404
```

### 2.6 Scheduling Runs Endpoints

```
GET /api/v1/scheduling-runs/prerequisites?academic_year_id=X → 200
  Verify checks array with pass/fail

POST /api/v1/scheduling-runs
  Happy: { academic_year_id } → 201, status=queued
  Prerequisites not met → 400
  Active run exists → 409

GET /api/v1/scheduling-runs?academic_year_id=X → 200 (excludes JSONB)
GET /api/v1/scheduling-runs/:id → 200 (includes result_json)

POST /api/v1/scheduling-runs/:id/cancel → 200
  Cancel applied run → 400

PATCH /api/v1/scheduling-runs/:id/adjustments
  { adjustment: { type: "move", ... }, expected_updated_at: "..." } → 200
  Wrong expected_updated_at → 409

POST /api/v1/scheduling-runs/:id/apply
  { expected_updated_at: "..." } → 200
  Run not completed → 400
  Concurrent apply → 409

POST /api/v1/scheduling-runs/:id/discard
  { expected_updated_at: "..." } → 200
```

### 2.7 Dashboard Endpoints

```
GET /api/v1/scheduling-dashboard/overview?academic_year_id=X → 200
GET /api/v1/scheduling-dashboard/workload?academic_year_id=X → 200
GET /api/v1/scheduling-dashboard/unassigned?scheduling_run_id=X → 200
GET /api/v1/scheduling-dashboard/preferences?scheduling_run_id=X → 200
```

---

## Section 3 — RLS Leakage Tests

For each of the 5 new tables, follow this pattern:
1. Create data as Tenant A
2. Authenticate as Tenant B
3. Attempt to read → expect empty result

### 3.1 schedule_period_templates
- Tenant A creates period grid → Tenant B queries → empty data array

### 3.2 class_scheduling_requirements
- Tenant A creates class requirement → Tenant B queries → empty data array

### 3.3 staff_availability
- Tenant A creates availability → Tenant B queries → empty data array

### 3.4 staff_scheduling_preferences
- Tenant A creates preference → Tenant B queries → empty data array

### 3.5 scheduling_runs
- Tenant A creates scheduling run → Tenant B queries → empty data array
- Tenant B attempts to apply Tenant A's run by ID → 404

### 3.6 Cross-tenant endpoint access
- Tenant B tries to PATCH Tenant A's period grid ID → 404
- Tenant B tries to DELETE Tenant A's class requirement ID → 404
- Tenant B tries to pin Tenant A's schedule entry → 404
- Tenant B tries to cancel Tenant A's scheduling run → 404

---

## Section 4 — Manual QA Checklist

### 4.1 Period Grid Configuration (Admin)

1. Navigate to `/scheduling/period-grid`
2. Select an academic year from the dropdown
3. Verify empty state message shown when no periods exist
4. Click "Add Period" under Monday column
5. Enter: name "Period 1", time 08:00-08:45, type "Teaching" → Save
6. Verify period card appears with correct details and blue color coding
7. Add a break period: name "Break", time 10:00-10:15, type "Break Supervision" → verify amber color
8. Add periods for remaining slots on Monday
9. Click "Copy Day" → select Tuesday and Wednesday as targets → Save
10. Verify all Monday periods appear on Tuesday and Wednesday
11. Click a period card to edit → change name → Save → verify updated
12. Delete a period → confirm → verify removed
13. Switch to Arabic locale → verify weekday headers render RTL, period names show Arabic variants

### 4.2 Class Requirements (Admin)

1. Navigate to `/scheduling/requirements`
2. Select academic year
3. Verify completeness banner: "X of Y classes configured"
4. Click "Configure All Remaining" → verify all classes get default requirements (5 periods/week)
5. Edit a class requirement: change periods_per_week to 3, set room type to "Lab"
6. Verify inline edit saves immediately
7. Switch to Arabic locale → verify table renders RTL

### 4.3 Staff Availability (Admin)

1. Navigate to `/scheduling/availability`
2. Select academic year
3. Select a teacher from the staff list
4. Verify default state: "Fully Available" banner
5. Set Monday availability: 08:00-14:00 → green indicator
6. Set Tuesday: unavailable (don't configure) → neutral
7. Click "Save Availability"
8. Reload page → verify saved correctly
9. Click "Clear All" → verify returns to fully available

### 4.4 Staff Preferences (Admin)

1. Navigate to `/scheduling/preferences`
2. Select academic year and a teacher
3. Verify "Preferences are best-effort" banner
4. Go to Subject tab → Add preference: prefer Math, priority High → Save
5. Go to Time Slot tab → Add preference: avoid Friday periods 1-3, priority Low → Save
6. Switch to Arabic locale → verify all tabs and labels render correctly

### 4.5 Teacher Self-Service Preferences

1. Log in as a teacher
2. Navigate to `/scheduling/my-preferences`
3. Verify only own preferences shown (no staff selector)
4. Add a preference → verify saved
5. Try to access `/scheduling/preferences` (admin page) → verify redirected or forbidden

### 4.6 Auto-Scheduler Launch (Admin)

1. Navigate to `/scheduling/auto`
2. Verify prerequisites checklist shows:
   - Period grid exists ✓
   - All classes configured ✓ (or ✗ with fix link)
   - All classes have teachers ✓
   - No pinned conflicts ✓
   - No availability violations ✓
3. If any check fails, click "Fix" link → navigate to correct page
4. When all pass, click "Generate Timetable"
5. Verify confirmation dialog with mode (Auto/Hybrid) and class count
6. Confirm → verify progress modal:
   - Phase: "Preparing" → "Solving"
   - Live counter updates
   - Elapsed time increases
7. Wait for completion → verify redirect to review page
8. Verify run appears in Run History table

### 4.7 Proposed Timetable Review (Admin)

1. On the review page, verify "PROPOSED — Not Yet Applied" yellow banner
2. Verify timetable grid shows entries:
   - Pinned: solid background with pin icon
   - Auto-generated: dashed border
3. Click an entry → verify selected state
4. Click another slot → verify swap dialog or move occurs
5. Verify side panel shows constraint report:
   - Hard violations (should be 0)
   - Preference satisfaction percentage
   - Unassigned count
6. Click "Apply Timetable" → confirm → verify success
7. Navigate to schedules page → verify new schedule entries with source=auto_generated
8. Alternatively: test "Discard" → verify run marked as discarded, no schedule changes

### 4.8 Pin Management

1. Navigate to schedules list
2. Select an entry → click "Pin" → verify pin icon appears
3. Verify entry shows source=pinned
4. Click "Unpin" → verify returns to manual source
5. Select multiple entries → "Bulk Pin" → verify all pinned

### 4.9 Scheduling Dashboard (Admin)

1. Navigate to `/scheduling/dashboard`
2. **Overview tab**: Verify KPI cards (total slots, assigned, pinned, auto, completion %)
3. **Workload tab**: Verify teacher table with periods and utilisation %
4. **Unassigned tab**: Select a completed run → verify unassigned classes shown with reasons
5. **Satisfaction tab**: Select a run → verify per-teacher satisfaction breakdown
6. **History tab**: Verify all past runs listed with status badges

### 4.10 Teacher Satisfaction View

1. Log in as a teacher
2. Navigate to `/scheduling/my-satisfaction`
3. Verify own preference satisfaction from latest applied run
4. Verify only own data shown (not other teachers)

### 4.11 RTL Testing (Arabic Locale)

1. Switch to Arabic locale
2. Navigate through all scheduling pages:
   - Period grid: weekday columns RTL
   - Requirements table: text-start alignment
   - Availability grid: time pickers function correctly
   - Preferences tabs: tab bar RTL
   - Dashboard: all cards and tables RTL
3. Verify all labels use Arabic translations
4. Verify numbers remain Western (0-9)

### 4.12 Permission Testing

| Action | school_owner | school_admin | teacher | parent |
|--------|-------------|--------------|---------|--------|
| Configure period grid | ✓ | ✓ | ✗ | ✗ |
| Configure requirements | ✓ | ✓ | ✗ | ✗ |
| Configure availability | ✓ | ✗ | ✗ | ✗ |
| Manage all preferences | ✓ | ✓ | ✗ | ✗ |
| Manage own preferences | ✗ | ✗ | ✓ | ✗ |
| Run auto-scheduler | ✓ | ✓ | ✗ | ✗ |
| Apply auto results | ✓ | ✓ | ✗ | ✗ |
| Pin entries | ✓ | ✓ | ✗ | ✗ |
| View reports | ✓ | ✓ | ✗ | ✗ |
| View own schedule | ✗ | ✗ | ✓ | ✗ |
| View own satisfaction | ✗ | ✗ | ✓ | ✗ |

Test each role against each action. Verify 403 for unauthorized access.
