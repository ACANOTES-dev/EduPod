# P4A Testing Instructions — Manual Scheduling + Attendance

---

## Section 1 — Unit Tests

### 1.1 ConflictDetectionService
- **File**: `apps/api/src/modules/schedules/conflict-detection.service.spec.ts`

| Test | Input | Expected |
|------|-------|----------|
| should detect hard conflict for exclusive room double-booking | Two schedules same room, same weekday, overlapping times | `hard` array contains `room_double_booking` |
| should detect soft conflict for non-exclusive room double-booking | Same but room.is_exclusive = false | `soft` array contains `room_shared_warning` |
| should detect hard conflict for teacher double-booking | Two schedules same teacher, overlapping times | `hard` array contains `teacher_double_booking` |
| should detect hard conflict for student double-booking | Student enrolled in two classes with overlapping schedules | `hard` array contains `student_double_booking` |
| should detect soft conflict for room over capacity | Class enrolments > room capacity | `soft` array contains `room_over_capacity` |
| should exclude self from conflict check on update | Schedule update, exclude current schedule ID | No self-conflict reported |
| should handle open-ended date ranges (null effective_end_date) | One schedule has null end date | Correctly detects overlap |
| should NOT detect conflict when time ranges don't overlap | Same weekday, different non-overlapping times | Empty hard and soft arrays |
| should NOT detect conflict on different weekdays | Same time, different weekdays | Empty arrays |
| should NOT detect conflict when date ranges don't overlap | Same weekday+time, non-overlapping date ranges | Empty arrays |

### 1.2 DailySummaryService
- **File**: `apps/api/src/modules/attendance/daily-summary.service.spec.ts`

| Test | Input | Expected |
|------|-------|----------|
| should derive status `present` when all sessions present | All records status=present | `derived_status = 'present'` |
| should derive status `absent` when all sessions absent (unexcused) | All records absent_unexcused | `derived_status = 'absent'` |
| should derive status `excused` when all absent are excused | All records absent_excused | `derived_status = 'excused'` |
| should derive status `late` when late but no absences | Records: late + present | `derived_status = 'late'` |
| should derive status `partially_absent` for mixed statuses | Records: present + absent_unexcused | `derived_status = 'partially_absent'` |
| should count `left_early` as present | Records: left_early | sessions_present includes left_early |
| should delete summary when no records exist (sessions_total = 0) | No attendance records for the day | Summary row deleted |
| should exclude cancelled sessions from summary | Session status=cancelled | Not counted in totals |
| should only count sessions where student was enrolled | Student enrolled mid-day | Only post-enrolment sessions counted |

### 1.3 SchoolClosuresService.isClosureDate
| Test | Input | Expected |
|------|-------|----------|
| should return true for `all` scope closure on the date | Closure exists with scope=all | `true` |
| should return true for `year_group` scope matching class year group | Closure with year_group matching class | `true` |
| should return true for `class` scope matching class ID | Closure with class_id matching | `true` |
| should return false when no closure exists | No closures for the date | `false` |
| should return false when closure scope doesn't match class | year_group closure, different year group | `false` |

### 1.4 AttendanceService State Machine
| Test | Input | Expected |
|------|-------|----------|
| should allow open → submitted | Submit an open session | Status changes to `submitted` |
| should allow open → cancelled | Cancel an open session | Status changes to `cancelled` |
| should allow submitted → locked (auto-lock) | Auto-lock a submitted session | Status changes to `locked` |
| should block submitted → open | Attempt to reopen | Error: `INVALID_STATUS_TRANSITION` |
| should block locked → any state | Attempt to change locked session | Error: `INVALID_STATUS_TRANSITION` |
| should block cancelled → any state | Attempt to change cancelled session | Error: `INVALID_STATUS_TRANSITION` |

---

## Section 2 — Integration Tests

### 2.1 Rooms API
- **File**: `apps/api/test/rooms.e2e-spec.ts`

| Test | Method | Path | Expected |
|------|--------|------|----------|
| should create a room | POST | `/v1/rooms` | 201, room returned |
| should reject duplicate room name | POST | `/v1/rooms` | 409 `ROOM_NAME_EXISTS` |
| should list rooms with pagination | GET | `/v1/rooms?page=1&pageSize=10` | 200, data + meta |
| should filter rooms by active status | GET | `/v1/rooms?active=true` | Only active rooms |
| should get room by ID | GET | `/v1/rooms/:id` | 200, room data |
| should return 404 for unknown room | GET | `/v1/rooms/nonexistent` | 404 |
| should update room | PATCH | `/v1/rooms/:id` | 200, updated room |
| should delete room not in use | DELETE | `/v1/rooms/:id` | 204 |
| should block delete of room in use | DELETE | `/v1/rooms/:id` | 409 `ROOM_IN_USE` |
| should return 403 without schedule.manage | POST | `/v1/rooms` | 403 |

### 2.2 Schedules API
- **File**: `apps/api/test/schedules.e2e-spec.ts`

| Test | Method | Path | Expected |
|------|--------|------|----------|
| should create schedule entry | POST | `/v1/schedules` | 201, schedule returned |
| should detect and block hard conflict | POST | `/v1/schedules` | 409 `SCHEDULE_CONFLICT` with conflicts |
| should allow override with permission + reason | POST | `/v1/schedules` | 201 with override_conflicts=true |
| should return soft conflicts as warnings | POST | `/v1/schedules` | 201 with meta.conflicts containing soft warnings |
| should list schedules with filters | GET | `/v1/schedules` | 200, filtered data |
| should update schedule with conflict check | PATCH | `/v1/schedules/:id` | 200, excludes self from conflict |
| should end-date schedule with attendance sessions (not delete) | DELETE | `/v1/schedules/:id` | 200 `action: 'end_dated'` |
| should hard-delete schedule without attendance sessions | DELETE | `/v1/schedules/:id` | 200 `action: 'deleted'` |

### 2.3 Timetable Views
- **File**: `apps/api/test/timetables.e2e-spec.ts`

| Test | Method | Path | Expected |
|------|--------|------|----------|
| should return teacher timetable | GET | `/v1/timetables/teacher/:id` | 200, TimetableEntry[] |
| should return room timetable | GET | `/v1/timetables/room/:id` | 200, TimetableEntry[] |
| should return student timetable (derived from enrolments) | GET | `/v1/timetables/student/:id` | 200, TimetableEntry[] |
| should return workload report | GET | `/v1/reports/workload` | 200, WorkloadEntry[] |

### 2.4 School Closures API
- **File**: `apps/api/test/school-closures.e2e-spec.ts`

| Test | Method | Path | Expected |
|------|--------|------|----------|
| should create single closure | POST | `/v1/school-closures` | 201, closure data |
| should cancel open sessions on closure creation | POST | `/v1/school-closures` | Existing open sessions cancelled |
| should flag submitted sessions | POST | `/v1/school-closures` | Response includes flagged_sessions |
| should bulk create closures for date range | POST | `/v1/school-closures/bulk` | 201, multiple closures |
| should skip weekends in bulk create | POST | `/v1/school-closures/bulk` | Weekend dates not created |
| should reject duplicate closure | POST | `/v1/school-closures` | 409 `CLOSURE_ALREADY_EXISTS` |
| should list closures with date filter | GET | `/v1/school-closures` | 200, filtered data |
| should hard delete closure | DELETE | `/v1/school-closures/:id` | 204 |

### 2.5 Attendance Sessions API
- **File**: `apps/api/test/attendance.e2e-spec.ts`

| Test | Method | Path | Expected |
|------|--------|------|----------|
| should create attendance session | POST | `/v1/attendance-sessions` | 201, session with status=open |
| should block session on closure date | POST | `/v1/attendance-sessions` | 409 `DATE_IS_CLOSURE` |
| should allow closure override with permission | POST | `/v1/attendance-sessions` | 201 with override_reason |
| should handle race condition (return existing) | POST (duplicate) | `/v1/attendance-sessions` | Returns existing session |
| should save attendance records | PUT | `/v1/attendance-sessions/:id/records` | 200, records array |
| should submit session and trigger daily summary | PATCH | `/v1/attendance-sessions/:id/submit` | 200, status=submitted, summaries created |
| should reject save on non-open session | PUT | `/v1/attendance-sessions/:id/records` | 400 `SESSION_NOT_OPEN` |
| should amend historical record | PATCH | `/v1/attendance-records/:id/amend` | 200, amended_from_status set |
| should require amendment_reason | PATCH | `/v1/attendance-records/:id/amend` | 400 if no reason |
| should cancel open session | PATCH | `/v1/attendance-sessions/:id/cancel` | 200, status=cancelled |

### 2.6 Exception Dashboard
| Test | Method | Path | Expected |
|------|--------|------|----------|
| should return pending sessions | GET | `/v1/attendance/exceptions` | pending_sessions array with open sessions |
| should return excessive absences | GET | `/v1/attendance/exceptions` | excessive_absences array |

### 2.7 Teacher Dashboard
| Test | Method | Path | Expected |
|------|--------|------|----------|
| should return today's schedule and sessions | GET | `/v1/dashboard/teacher` | todays_schedule, todays_sessions, pending_submissions |

### 2.8 Parent Attendance
| Test | Method | Path | Expected |
|------|--------|------|----------|
| should return linked student attendance | GET | `/v1/parent/students/:id/attendance` | Attendance records |
| should return 403 for unlinked student | GET | `/v1/parent/students/:id/attendance` | 403 `STUDENT_NOT_LINKED` |
| should return 403 if attendance not visible to parents | GET | `/v1/parent/students/:id/attendance` | 403 `ATTENDANCE_NOT_VISIBLE` |

---

## Section 3 — RLS Leakage Tests

For EVERY new tenant-scoped table, run the following pattern:

### Test Pattern
1. Authenticate as Tenant A (owner/admin)
2. Create test data in Tenant A
3. Authenticate as Tenant B (owner/admin)
4. Attempt to read Tenant A's data
5. Assert: data NOT returned (empty array or 404)

### Tables to Test

| Table | Create as Tenant A | Query as Tenant B | Assert |
|-------|-------------------|-------------------|--------|
| `rooms` | Create room via POST /v1/rooms | GET /v1/rooms | Room not in list |
| `rooms` | Create room | GET /v1/rooms/:id (Tenant A's room ID) | 404 |
| `schedules` | Create schedule via POST /v1/schedules | GET /v1/schedules | Schedule not in list |
| `school_closures` | Create closure | GET /v1/school-closures | Closure not in list |
| `attendance_sessions` | Create session | GET /v1/attendance-sessions | Session not in list |
| `attendance_records` | Save records | GET /v1/attendance-sessions/:id | 404 (session not found for Tenant B) |
| `daily_attendance_summaries` | Submit session (triggers summary) | GET /v1/attendance/daily-summaries | Summary not in list |

- **File**: `apps/api/test/p4a-rls.e2e-spec.ts`

---

## Section 4 — Manual QA Checklist

### 4.1 Room Management (en + ar)
- [ ] Navigate to Rooms page from sidebar
- [ ] Create a new room with all fields
- [ ] Verify room appears in list
- [ ] Edit room name and type
- [ ] Try to delete a room that has schedules → should show error
- [ ] Delete a room with no schedules → should succeed
- [ ] Verify RTL layout for Arabic locale

### 4.2 Schedule Management (en + ar)
- [ ] Navigate to Schedules page
- [ ] Create a schedule entry with class, teacher, room, time
- [ ] Verify conflict detection: create overlapping schedule for same room → hard conflict shown
- [ ] Override conflict with permission and reason
- [ ] Create overlapping schedule for non-exclusive room → soft warning shown
- [ ] Edit schedule entry
- [ ] Delete schedule entry with no attendance → hard deleted
- [ ] Delete schedule entry with attendance → end-dated

### 4.3 Timetable Views (en + ar)
- [ ] Navigate to Timetables page
- [ ] Switch between Teacher, Room, Student tabs
- [ ] Select a teacher → verify timetable grid shows their schedule
- [ ] Select a room → verify grid shows room schedule
- [ ] Select a student → verify grid shows derived schedule from enrolments

### 4.4 School Closures (en + ar)
- [ ] Navigate to Settings → Closures
- [ ] Create a single closure date
- [ ] Create a bulk closure (date range) with skip weekends
- [ ] Verify closures appear in list
- [ ] Delete a closure

### 4.5 Workload Report (en + ar)
- [ ] Navigate to Reports → Workload
- [ ] Select academic year
- [ ] Verify table shows teachers with period counts per day

### 4.6 Attendance Marking (en + ar)
- [ ] Navigate to Attendance page
- [ ] Create a new session for a class
- [ ] Click "Open Marking" to go to marking page
- [ ] Click "Mark All Present" → verify all students set to present
- [ ] Change one student to absent (unexcused) and add reason
- [ ] Save records → verify success toast
- [ ] Submit attendance → verify session status changes to submitted
- [ ] Verify daily summary was created for affected students

### 4.7 Historical Amendment
- [ ] As admin, find a submitted session
- [ ] Amend a record: change status and provide reason
- [ ] Verify amended_from_status and amendment_reason saved
- [ ] Verify daily summary recalculated

### 4.8 Exception Dashboard (en + ar)
- [ ] Navigate to Attendance → Exceptions
- [ ] Verify pending sessions section shows open sessions
- [ ] Verify excessive absences section shows students with high absence count

### 4.9 Closure + Attendance Interaction
- [ ] Create a school closure for today
- [ ] Try to create attendance session for today → should be blocked
- [ ] Override with permission + reason → should succeed with override_reason

### 4.10 Teacher Dashboard
- [ ] Log in as teacher
- [ ] Navigate to Dashboard
- [ ] Verify "Today's Schedule" section shows schedule entries
- [ ] Verify "Today's Sessions" with quick action to mark attendance
- [ ] Verify pending submissions count

### 4.11 Parent Attendance View
- [ ] Log in as parent
- [ ] Navigate to parent dashboard
- [ ] Verify attendance section shows linked student attendance data
- [ ] (Only if tenant_settings.general.attendanceVisibleToParents = true)

### 4.12 Role-Based Access
- [ ] As teacher (schedule.view_own): can only see own timetable, not others
- [ ] As teacher (attendance.take): can only mark attendance for assigned classes
- [ ] As parent: cannot access admin attendance endpoints
- [ ] Without schedule.manage_closures: cannot create/delete closures
- [ ] Without attendance.amend_historical: cannot amend records
