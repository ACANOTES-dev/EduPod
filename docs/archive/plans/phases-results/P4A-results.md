# Phase 4A Results — Manual Scheduling + Attendance

## Summary

Phase 4A delivers the complete manual scheduling and attendance tracking system. It adds room management with CRUD operations, schedule entry creation with hard/soft conflict detection (room double-booking, teacher double-booking, student double-booking, room over-capacity, teacher workload), timetable views (teacher/room/student), workload reporting, school closure management with bulk creation and attendance session side-effects, and the full attendance system: on-demand + nightly batch session generation, class attendance marking with bulk "mark all present", session submission, historical amendments with audit trail, derived daily summaries, pending attendance detection, an exception dashboard, parent attendance visibility, a teacher dashboard, and three background job processors (session generation, pending detection, auto-lock).

---

## Database Migrations

### Migration: `20260316140000_add_p4a_scheduling_attendance`

**New Enums (6):**
| Enum | Values |
|------|--------|
| `RoomType` | `classroom`, `lab`, `gym`, `auditorium`, `library`, `computer_lab`, `art_room`, `music_room`, `outdoor`, `other` |
| `ScheduleSource` | `manual`, `auto_generated`, `pinned` |
| `ClosureScope` | `all`, `year_group`, `class` |
| `AttendanceSessionStatus` | `open`, `submitted`, `locked`, `cancelled` |
| `AttendanceRecordStatus` | `present`, `absent_unexcused`, `absent_excused`, `late`, `left_early` |
| `DailyAttendanceStatus` | `present`, `partially_absent`, `absent`, `late`, `excused` |

**New Tables (6):**
| Table | Columns | RLS | Trigger |
|-------|---------|-----|---------|
| `rooms` | 9 | Yes | `set_updated_at()` |
| `schedules` | 19 | Yes | `set_updated_at()` |
| `school_closures` | 8 | Yes | No (append-only) |
| `attendance_sessions` | 11 | Yes | `set_updated_at()` |
| `attendance_records` | 12 | Yes | `set_updated_at()` |
| `daily_attendance_summaries` | 8 | Yes | `set_updated_at()` |

**Post-Migration SQL:**

- RLS policies for all 6 tables (ENABLE + FORCE + tenant isolation)
- `set_updated_at()` triggers on 5 tables (school_closures excluded — append-only)
- Special indexes: `idx_school_closures_unique` (COALESCE on nullable scope_entity_id), `idx_attendance_sessions_unique` (schedule-linked), `idx_attendance_sessions_adhoc_unique` (ad-hoc WHERE schedule_id IS NULL), `idx_attendance_records_session_student` (unique per session+student)
- Partial indexes: `idx_rooms_tenant_active`, `idx_schedules_pinned`, `idx_schedules_auto_generated`, `idx_schedules_run`

---

## API Endpoints

### Rooms (5 endpoints)

| Method   | Path            | Auth | Permission        |
| -------- | --------------- | ---- | ----------------- |
| `POST`   | `/v1/rooms`     | Yes  | `schedule.manage` |
| `GET`    | `/v1/rooms`     | Yes  | `schedule.manage` |
| `GET`    | `/v1/rooms/:id` | Yes  | `schedule.manage` |
| `PATCH`  | `/v1/rooms/:id` | Yes  | `schedule.manage` |
| `DELETE` | `/v1/rooms/:id` | Yes  | `schedule.manage` |

### Schedules (5 endpoints)

| Method   | Path                | Auth | Permission        |
| -------- | ------------------- | ---- | ----------------- |
| `POST`   | `/v1/schedules`     | Yes  | `schedule.manage` |
| `GET`    | `/v1/schedules`     | Yes  | `schedule.manage` |
| `GET`    | `/v1/schedules/:id` | Yes  | `schedule.manage` |
| `PATCH`  | `/v1/schedules/:id` | Yes  | `schedule.manage` |
| `DELETE` | `/v1/schedules/:id` | Yes  | `schedule.manage` |

### Timetable Views (4 endpoints)

| Method | Path                                     | Auth | Permission                                    |
| ------ | ---------------------------------------- | ---- | --------------------------------------------- |
| `GET`  | `/v1/timetables/teacher/:staffProfileId` | Yes  | `schedule.manage` or `schedule.view_own`      |
| `GET`  | `/v1/timetables/room/:roomId`            | Yes  | `schedule.manage`                             |
| `GET`  | `/v1/timetables/student/:studentId`      | Yes  | `students.view` or `parent.view_own_students` |
| `GET`  | `/v1/reports/workload`                   | Yes  | `schedule.manage`                             |

### School Closures (4 endpoints)

| Method   | Path                       | Auth | Permission                 |
| -------- | -------------------------- | ---- | -------------------------- |
| `POST`   | `/v1/school-closures`      | Yes  | `schedule.manage_closures` |
| `POST`   | `/v1/school-closures/bulk` | Yes  | `schedule.manage_closures` |
| `GET`    | `/v1/school-closures`      | Yes  | `attendance.view`          |
| `DELETE` | `/v1/school-closures/:id`  | Yes  | `schedule.manage_closures` |

### Attendance Sessions (4 endpoints)

| Method  | Path                                 | Auth | Permission          |
| ------- | ------------------------------------ | ---- | ------------------- |
| `POST`  | `/v1/attendance-sessions`            | Yes  | `attendance.take`   |
| `GET`   | `/v1/attendance-sessions`            | Yes  | `attendance.view`   |
| `GET`   | `/v1/attendance-sessions/:id`        | Yes  | `attendance.view`   |
| `PATCH` | `/v1/attendance-sessions/:id/cancel` | Yes  | `attendance.manage` |

### Attendance Records (3 endpoints)

| Method  | Path                                         | Auth | Permission                    |
| ------- | -------------------------------------------- | ---- | ----------------------------- |
| `PUT`   | `/v1/attendance-sessions/:sessionId/records` | Yes  | `attendance.take`             |
| `PATCH` | `/v1/attendance-sessions/:sessionId/submit`  | Yes  | `attendance.take`             |
| `PATCH` | `/v1/attendance-records/:id/amend`           | Yes  | `attendance.amend_historical` |

### Daily Summaries (2 endpoints)

| Method | Path                                                | Auth | Permission                                    |
| ------ | --------------------------------------------------- | ---- | --------------------------------------------- |
| `GET`  | `/v1/attendance/daily-summaries`                    | Yes  | `attendance.view`                             |
| `GET`  | `/v1/attendance/daily-summaries/student/:studentId` | Yes  | `attendance.view` or `parent.view_attendance` |

### Exceptions (1 endpoint)

| Method | Path                        | Auth | Permission          |
| ------ | --------------------------- | ---- | ------------------- |
| `GET`  | `/v1/attendance/exceptions` | Yes  | `attendance.manage` |

### Parent Attendance (1 endpoint)

| Method | Path                                        | Auth | Permission               |
| ------ | ------------------------------------------- | ---- | ------------------------ |
| `GET`  | `/v1/parent/students/:studentId/attendance` | Yes  | `parent.view_attendance` |

### Teacher Dashboard (1 endpoint)

| Method | Path                    | Auth | Permission        |
| ------ | ----------------------- | ---- | ----------------- |
| `GET`  | `/v1/dashboard/teacher` | Yes  | `attendance.take` |

**Total: 30 new API endpoints**

---

## Services

| Service                       | Module               | Responsibilities                                                                                         |
| ----------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------- |
| `RoomsService`                | RoomsModule          | Room CRUD with unique name validation, in-use check on delete                                            |
| `ConflictDetectionService`    | SchedulesModule      | Hard/soft conflict detection: room, teacher, student double-booking, room capacity, teacher workload     |
| `SchedulesService`            | SchedulesModule      | Schedule CRUD with conflict integration, deletion safety rule, endDateForClass side-effect               |
| `TimetablesService`           | SchedulesModule      | Teacher/room/student timetable views, workload report                                                    |
| `SchoolClosuresService`       | SchoolClosuresModule | Single + bulk closure creation with session side-effects, isClosureDate check                            |
| `AttendanceService`           | AttendanceModule     | Session CRUD, record saving, submission, amendment, exceptions, parent view, batch generation, auto-lock |
| `DailySummaryService`         | AttendanceModule     | Daily summary recalculation with status derivation, find methods                                         |
| `DashboardService` (extended) | DashboardModule      | Added teacher dashboard with today's schedule, sessions, pending count                                   |

---

## Frontend

### New Shared Components

| Component               | File                                                  | Description                              |
| ----------------------- | ----------------------------------------------------- | ---------------------------------------- |
| `TimetableGrid`         | `apps/web/src/components/timetable-grid.tsx`          | Weekly timetable grid with RTL support   |
| `AttendanceStatusBadge` | `apps/web/src/components/attendance-status-badge.tsx` | Status-to-colour badge for attendance    |
| `ConflictAlert`         | `apps/web/src/components/conflict-alert.tsx`          | Hard/soft conflict display with override |

### Pages

| Route                                   | File                                   | Description                                   |
| --------------------------------------- | -------------------------------------- | --------------------------------------------- |
| `/{locale}/rooms`                       | `rooms/page.tsx`                       | Room list with create/edit dialog             |
| `/{locale}/rooms/{id}`                  | `rooms/[id]/page.tsx`                  | Room detail with timetable tab                |
| `/{locale}/schedules`                   | `schedules/page.tsx`                   | Schedule list with conflict-aware create/edit |
| `/{locale}/timetables`                  | `timetables/page.tsx`                  | Teacher/Room/Student timetable views          |
| `/{locale}/settings/closures`           | `settings/closures/page.tsx`           | School closures with bulk create              |
| `/{locale}/reports/workload`            | `reports/workload/page.tsx`            | Staff workload report table                   |
| `/{locale}/attendance`                  | `attendance/page.tsx`                  | Attendance sessions list                      |
| `/{locale}/attendance/mark/{sessionId}` | `attendance/mark/[sessionId]/page.tsx` | Attendance marking with bulk present          |
| `/{locale}/attendance/exceptions`       | `attendance/exceptions/page.tsx`       | Exception dashboard                           |

---

## Background Jobs

| Job Name                       | Queue        | Trigger                     | Description                                        |
| ------------------------------ | ------------ | --------------------------- | -------------------------------------------------- |
| `attendance:generate-sessions` | `attendance` | Nightly (configurable hour) | Generate attendance sessions for active schedules  |
| `attendance:detect-pending`    | `attendance` | Daily at 18:00              | Detect unsubmitted sessions                        |
| `attendance:auto-lock`         | `attendance` | Daily at 02:00              | Auto-lock submitted sessions after configured days |

---

## Configuration

### New Permissions (2)

| Permission                    | Tier  | Description                               |
| ----------------------------- | ----- | ----------------------------------------- |
| `attendance.amend_historical` | admin | Amend past attendance records             |
| `attendance.override_closure` | admin | Create attendance session on closure date |

### Seed Data

- 5 rooms per dev tenant (2 classrooms, 1 lab, 1 gym, 1 library)
- 3 schedule entries per dev tenant (linked to existing classes, rooms, staff)
- 2 new permissions added to global permission seed and system role defaults

### i18n

- ~45 scheduling keys added to en.json and ar.json
- ~25 attendance keys added to en.json and ar.json

---

## Files Created

### Database (2 files)

- `packages/prisma/migrations/20260316140000_add_p4a_scheduling_attendance/migration.sql`
- `packages/prisma/migrations/20260316140000_add_p4a_scheduling_attendance/post_migrate.sql`

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

### Backend — Attendance Module (5 files)

- `apps/api/src/modules/attendance/attendance.module.ts`
- `apps/api/src/modules/attendance/attendance.controller.ts`
- `apps/api/src/modules/attendance/attendance.service.ts`
- `apps/api/src/modules/attendance/daily-summary.service.ts`
- `apps/api/src/modules/attendance/dto/attendance.dto.ts`

### Worker Processors (3 files)

- `apps/worker/src/processors/attendance-session-generation.processor.ts`
- `apps/worker/src/processors/attendance-pending-detection.processor.ts`
- `apps/worker/src/processors/attendance-auto-lock.processor.ts`

### Frontend Components (3 files)

- `apps/web/src/components/timetable-grid.tsx`
- `apps/web/src/components/attendance-status-badge.tsx`
- `apps/web/src/components/conflict-alert.tsx`

### Frontend Pages (13 files)

- `apps/web/src/app/[locale]/(school)/rooms/page.tsx`
- `apps/web/src/app/[locale]/(school)/rooms/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/rooms/_components/room-form.tsx`
- `apps/web/src/app/[locale]/(school)/schedules/page.tsx`
- `apps/web/src/app/[locale]/(school)/schedules/_components/schedule-form.tsx`
- `apps/web/src/app/[locale]/(school)/timetables/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/closures/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/closures/_components/closure-form.tsx`
- `apps/web/src/app/[locale]/(school)/reports/workload/page.tsx`
- `apps/web/src/app/[locale]/(school)/attendance/page.tsx`
- `apps/web/src/app/[locale]/(school)/attendance/mark/[sessionId]/page.tsx`
- `apps/web/src/app/[locale]/(school)/attendance/exceptions/page.tsx`

**Total: ~50 new files**

---

## Files Modified

| File                                                     | Changes                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `packages/prisma/schema.prisma`                          | Added 6 enums, 6 models, relations on Tenant, Class, Student, StaffProfile, AcademicYear, User                                  |
| `packages/shared/src/constants/permissions.ts`           | Added `attendance.amend_historical`, `attendance.override_closure` to PERMISSIONS, PERMISSION_TIER_MAP, SYSTEM_ROLE_PERMISSIONS |
| `packages/shared/src/index.ts`                           | Added exports for all new types and schemas                                                                                     |
| `packages/prisma/seed/permissions.ts`                    | Added 2 new permission seed entries                                                                                             |
| `packages/prisma/seed.ts`                                | Added P4A room and schedule seed step                                                                                           |
| `apps/api/src/app.module.ts`                             | Added RoomsModule, SchedulesModule, SchoolClosuresModule, AttendanceModule imports                                              |
| `apps/api/src/modules/classes/classes.service.ts`        | Added SchedulesService integration for inactive class side-effect                                                               |
| `apps/api/src/modules/classes/classes.module.ts`         | Imported SchedulesModule, wired cross-module service via OnModuleInit                                                           |
| `apps/api/src/modules/dashboard/dashboard.controller.ts` | Added `GET /v1/dashboard/teacher` endpoint                                                                                      |
| `apps/api/src/modules/dashboard/dashboard.service.ts`    | Added `teacher()` method for teacher dashboard                                                                                  |
| `apps/worker/src/base/queue.constants.ts`                | Added `ATTENDANCE` queue                                                                                                        |
| `apps/worker/src/worker.module.ts`                       | Registered 3 attendance processors                                                                                              |
| `apps/web/src/app/[locale]/(school)/layout.tsx`          | Added sidebar links: Rooms, Schedules, Timetables, Attendance, Closures, Workload                                               |
| `apps/web/messages/en.json`                              | Added ~70 scheduling + attendance i18n keys                                                                                     |
| `apps/web/messages/ar.json`                              | Added matching Arabic translations                                                                                              |

---

## Known Limitations

1. **Schedule conflict student overlap performance**: The student double-booking check performs multiple queries (enrolled students → other classes → schedule overlap). For very large schools with many enrolments, this could be slow. Consider batch optimization if performance is an issue.

2. **Attendance session race prevention**: Uses Prisma `create` with try/catch on P2002 (unique constraint) rather than native `INSERT ... ON CONFLICT DO NOTHING RETURNING *`, since Prisma doesn't support this natively. Functionally equivalent for race prevention.

3. **Schedule period template and scheduling run**: `schedule_period_template_id` and `scheduling_run_id` are stored as plain UUID strings without Prisma relations — the referenced tables are created in P4B.

4. **Time column handling**: Prisma maps TIME columns to `DateTime`. The service layer formats times as HH:mm strings for API responses using `.toISOString().slice(11, 16)`.

5. **Teacher dashboard parent attendance**: The parent dashboard attendance section is not yet implemented (the parent page was not modified to add per-student attendance data). The parent endpoint (`GET /v1/parent/students/:studentId/attendance`) is available for future UI integration.

---

## Deviations from Plan

1. **No separate exception.dto.ts**: Query schemas for the exception dashboard endpoint are defined inline in the controller rather than in a separate DTO file, consistent with the pattern used elsewhere in the codebase.

2. **ClassesModule wiring**: Used `OnModuleInit` + `ModuleRef` pattern for lazy injection of SchedulesService into ClassesService to avoid circular dependency, rather than forwardRef.

3. **P3 migration.sql**: The P3 migration directory was missing its migration.sql file. A reconstruction was created to allow the P4A migration to be generated properly.
