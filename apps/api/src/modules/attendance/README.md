# Attendance

## Purpose

Tracks student attendance at session level: session generation, mark submission, locking, pattern detection, parent notifications, daily summaries, scan-based marking, and GDPR-aware reporting.

## Public API (Exports)

- `AttendanceService` — session management, mark submission, reporting queries
- `DailySummaryService` — daily attendance summary aggregation (read by parent-daily-digest worker, regulatory module, gradebook risk detection)

## Inbound Dependencies (What this module imports)

- `AuthModule` — guards and permission cache
- `SchoolClosuresModule` — school closure data gates session generation; `SchoolClosuresService` is a direct consumer
- `ConfigurationModule` — attendance policy settings (auto-lock deadline, session duration defaults)
- `CommunicationsModule` — `NotificationDispatchService` for parent absence notifications
- `GdprModule` — `GdprTokenService` for AI tokenisation in scan-based marking, consent checks
- BullMQ queue: `notifications`

## Outbound Consumers (Who imports this module)

- No NestJS module imports AttendanceModule directly
- Worker processors on the `attendance` queue enqueue `early-warning:compute-student` as a side effect of pattern detection
- `regulatory` module reads `attendance_records` and `daily_attendance_summaries` via Prisma direct
- `gradebook` risk detection reads `daily_attendance_summaries` via Prisma direct
- `notifications:parent-daily-digest` worker reads `daily_attendance_summaries` via Prisma direct
- `compliance` DSAR traversal reads `attendance_records` via Prisma direct

## BullMQ Queues

**Queue: `attendance`** (3 retries, 5s exponential)

- `attendance:generate-sessions` — cron: creates `AttendanceSession` records for each class period
- `attendance:detect-pending` — cron: flags classes with unmarked attendance
- `attendance:auto-lock` — cron: locks sessions past the configured deadline
- `attendance:detect-patterns` — cron: analyses absence patterns; creates `AttendanceAlert` records; enqueues `communications:dispatch-notifications` for parent alerts; enqueues `early-warning:compute-student` for at-risk students

**Queue: `notifications`** — parent absence alerts dispatched by `AttendanceParentNotificationService`

## Cross-Module Prisma Reads

`students`, `student_parents`, `class_enrolments`, `class_staff`, `academic_periods`, `academic_years`, `school_closures`, `subjects`, `rooms`, `schedules`

## Key Danger Zones

- **DZ-06**: Academic period closure triggers the `report-cards:auto-generate` cron at 03:00 UTC next day. Accidental period closure = hundreds of draft report cards to clean up.
- `DailySummaryService` is a shared export read by 4+ consumer modules via Prisma direct. Schema changes to `daily_attendance_summaries` cascade broadly — always grep before modifying.
- `AttendanceScanService` uses `GdprTokenService` for AI tokenisation. Changes to that interface break scan-based AI marking.
