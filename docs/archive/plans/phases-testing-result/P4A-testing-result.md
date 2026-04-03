# P4A Testing Results — Manual Scheduling + Attendance

## Test Run Summary

| Category                | Total  | Passed | Fixed | Failed | Unresolved |
| ----------------------- | ------ | ------ | ----- | ------ | ---------- |
| Unit Tests              | 30     | 30     | 0     | 0      | 0          |
| Integration Tests (E2E) | 43     | 43     | 0     | 0      | 0          |
| RLS Leakage Tests       | 7      | 7      | 0     | 0      | 0          |
| **Total**               | **80** | **80** | **0** | **0**  | **0**      |

---

## Unit Test Results

### 1.1 ConflictDetectionService (10/10 PASS)

**File**: `apps/api/src/modules/schedules/conflict-detection.service.spec.ts`

| #   | Test                                                              | Status |
| --- | ----------------------------------------------------------------- | ------ |
| 1   | should detect hard conflict for exclusive room double-booking     | PASS   |
| 2   | should detect soft conflict for non-exclusive room double-booking | PASS   |
| 3   | should detect hard conflict for teacher double-booking            | PASS   |
| 4   | should detect hard conflict for student double-booking            | PASS   |
| 5   | should detect soft conflict for room over capacity                | PASS   |
| 6   | should exclude self from conflict check on update                 | PASS   |
| 7   | should handle open-ended date ranges (null effective_end_date)    | PASS   |
| 8   | should NOT detect conflict when time ranges do not overlap        | PASS   |
| 9   | should NOT detect conflict on different weekdays                  | PASS   |
| 10  | should NOT detect conflict when date ranges do not overlap        | PASS   |

### 1.2 DailySummaryService (9/9 PASS)

**File**: `apps/api/src/modules/attendance/daily-summary.service.spec.ts`

| #   | Test                                                           | Status |
| --- | -------------------------------------------------------------- | ------ |
| 1   | should derive status present when all sessions present         | PASS   |
| 2   | should derive status absent when all sessions absent unexcused | PASS   |
| 3   | should derive status excused when all absent are excused       | PASS   |
| 4   | should derive status late when late but no absences            | PASS   |
| 5   | should derive status partially_absent for mixed statuses       | PASS   |
| 6   | should count left_early as present                             | PASS   |
| 7   | should delete summary when no records exist                    | PASS   |
| 8   | should exclude cancelled sessions from summary                 | PASS   |
| 9   | should only count sessions where student was enrolled          | PASS   |

### 1.3 SchoolClosuresService.isClosureDate (5/5 PASS)

**File**: `apps/api/src/modules/school-closures/school-closures.service.spec.ts`

| #   | Test                                                              | Status |
| --- | ----------------------------------------------------------------- | ------ |
| 1   | should return true for all scope closure on the date              | PASS   |
| 2   | should return true for year_group scope matching class year group | PASS   |
| 3   | should return true for class scope matching class ID              | PASS   |
| 4   | should return false when no closure exists                        | PASS   |
| 5   | should return false when closure scope does not match class       | PASS   |

### 1.4 AttendanceService State Machine (6/6 PASS)

**File**: `apps/api/src/modules/attendance/attendance.service.spec.ts`

| #   | Test                                                           | Status |
| --- | -------------------------------------------------------------- | ------ |
| 1   | should allow open → submitted (submitSession)                  | PASS   |
| 2   | should allow open → cancelled (cancelSession)                  | PASS   |
| 3   | should allow submitted → locked (lockExpiredSessions)          | PASS   |
| 4   | should block submitted → open (cancelSession rejects non-open) | PASS   |
| 5   | should block locked → any state                                | PASS   |
| 6   | should block cancelled → any state                             | PASS   |

---

## Integration Test Results (E2E)

### 2.1 Rooms API (10/10 PASS)

**File**: `apps/api/test/p4a-rooms.e2e-spec.ts`

| #   | Test                                                         | Status |
| --- | ------------------------------------------------------------ | ------ |
| 1   | should create a room (POST /api/v1/rooms → 201)              | PASS   |
| 2   | should reject duplicate room name (POST → 409)               | PASS   |
| 3   | should list rooms with pagination (GET → 200)                | PASS   |
| 4   | should filter rooms by active status                         | PASS   |
| 5   | should get room by ID                                        | PASS   |
| 6   | should return 404 for unknown room                           | PASS   |
| 7   | should update a room                                         | PASS   |
| 8   | should delete an unused room (DELETE → 204)                  | PASS   |
| 9   | should block deletion of room assigned to a schedule (→ 409) | PASS   |
| 10  | should return 403 for parent user lacking schedule.manage    | PASS   |

### 2.2 Schedules API (8/8 PASS)

**File**: `apps/api/test/p4a-schedules.e2e-spec.ts`

| #   | Test                                                                       | Status |
| --- | -------------------------------------------------------------------------- | ------ |
| 1   | should create a schedule (POST → 201)                                      | PASS   |
| 2   | should detect hard conflict for overlapping exclusive room+time (→ 409)    | PASS   |
| 3   | should allow override with schedule.override_conflict permission           | PASS   |
| 4   | should handle soft conflicts for non-exclusive room overlap (→ 201)        | PASS   |
| 5   | should list schedules with filters                                         | PASS   |
| 6   | should update a schedule                                                   | PASS   |
| 7   | should end-date a schedule with attendance sessions (action=end_dated)     | PASS   |
| 8   | should hard-delete a schedule without attendance sessions (action=deleted) | PASS   |

### 2.3 Timetable Views (4/4 PASS)

**File**: `apps/api/test/p4a-timetables.e2e-spec.ts`

| #   | Test                         | Status |
| --- | ---------------------------- | ------ |
| 1   | should get teacher timetable | PASS   |
| 2   | should get room timetable    | PASS   |
| 3   | should get student timetable | PASS   |
| 4   | should get workload report   | PASS   |

### 2.4 School Closures API (8/8 PASS)

**File**: `apps/api/test/p4a-closures.e2e-spec.ts`

| #   | Test                                                             | Status |
| --- | ---------------------------------------------------------------- | ------ |
| 1   | should create a single closure (POST → 201)                      | PASS   |
| 2   | should cancel open attendance sessions when closure is created   | PASS   |
| 3   | should flag submitted sessions when closure created on that date | PASS   |
| 4   | should bulk create closures (POST /bulk → 201)                   | PASS   |
| 5   | should skip weekends with skip_weekends=true                     | PASS   |
| 6   | should reject duplicate closure for same date+scope (→ 409)      | PASS   |
| 7   | should list closures with date filter                            | PASS   |
| 8   | should delete a closure (DELETE → 204)                           | PASS   |

### 2.5 Attendance Sessions & Records (10/10 PASS)

**File**: `apps/api/test/p4a-attendance.e2e-spec.ts`

| #   | Test                                                               | Status |
| --- | ------------------------------------------------------------------ | ------ |
| 1   | should create an attendance session (POST → 201 status=open)       | PASS   |
| 2   | should block session creation on a closure date (→ 409)            | PASS   |
| 3   | should return 403 for override_closure without required permission | PASS   |
| 4   | should return existing session on duplicate POST (race condition)  | PASS   |
| 5   | should save attendance records (PUT → 200)                         | PASS   |
| 6   | should submit a session (PATCH /submit → 200)                      | PASS   |
| 7   | should reject saving records on a non-open session (→ 409)         | PASS   |
| 8   | should require attendance.amend_historical permission to amend     | PASS   |
| 9   | should require amendment_reason for amend                          | PASS   |
| 10  | should cancel an open session (PATCH /cancel → 200)                | PASS   |

### 2.6–2.8 Dashboard, Exceptions, Parent Attendance (3/3 PASS)

**File**: `apps/api/test/p4a-dashboard-exceptions.e2e-spec.ts`

| #   | Test                                                                 | Status |
| --- | -------------------------------------------------------------------- | ------ |
| 1   | should get attendance exceptions (GET /exceptions → 200)             | PASS   |
| 2   | should get teacher dashboard (GET /dashboard/teacher → 200)          | PASS   |
| 3   | should return 403/404 for parent viewing unlinked student attendance | PASS   |

---

## RLS Leakage Test Results (7/7 PASS)

**File**: `apps/api/test/p4a-rls.e2e-spec.ts`

| #   | Test                                                                | Status |
| --- | ------------------------------------------------------------------- | ------ |
| 1   | Al Noor room should NOT appear in Cedar rooms list                  | PASS   |
| 2   | Al Noor room should return 404 when queried by Cedar                | PASS   |
| 3   | Al Noor schedule should NOT appear in Cedar schedules list          | PASS   |
| 4   | Al Noor closure should NOT appear in Cedar closures list            | PASS   |
| 5   | Al Noor attendance session should NOT appear in Cedar sessions list | PASS   |
| 6   | Al Noor session should return 404 when queried by Cedar             | PASS   |
| 7   | Al Noor daily summaries should NOT appear in Cedar summaries list   | PASS   |

---

## Bugs Found and Fixed

### 1. SchoolClosuresService TypeScript Error

- **Test exposed**: Build check before test execution
- **Root cause**: `closures.push(closure)` — `closure` was type `unknown` from `$transaction` return
- **Fix**: Changed `closures: Array<Record<string, unknown>>` to `closures: unknown[]`
- **File**: `apps/api/src/modules/school-closures/school-closures.service.ts`

### 2. Seed Script Time Formatting Bug

- **Test exposed**: Seed execution failed with Invalid Date
- **Root cause**: `0${9+1}` produced `"010"` which is not a valid hour
- **Fix**: Changed to `String(8+i).padStart(2, '0')` and `String(9+i).padStart(2, '0')`
- **File**: `packages/prisma/seed.ts`

### 3. Seed Script TypeScript Strict Null

- **Test exposed**: Seed compilation with tsx
- **Root cause**: `classes[i]` could be `undefined` per strict null checks
- **Fix**: Added non-null assertion `classes[i]!`
- **File**: `packages/prisma/seed.ts`

---

## Bugs Found and Unresolved

None.

---

## Regressions

No prior phase regressions detected. The API builds cleanly after P4A changes.

---

## Manual QA Notes

Manual QA checklist items are documented in `plans/phases-testing-instruction/P4A-testing.md` Section 4. These require a running frontend application and manual browser testing, which is deferred to the next QA pass.

Programmatic verification completed:

- Build passes (NestJS `nest build` succeeds)
- Database migration applied and verified
- RLS policies confirmed active on all 6 new tables
- Seed data populated (20 rooms, 3 schedules, 5 attendance permissions)
- All 80 tests pass (30 unit + 43 integration + 7 RLS)
- No cross-tenant data leakage detected in any RLS test
