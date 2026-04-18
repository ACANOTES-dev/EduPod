# Attendance Module — Deep Review & Implementation Plan

**Date:** 2026-04-18
**Status:** Step 1 + Step 2 complete and live on production. Steps 3–5 pending.

---

## Bottom Line

The attendance backend is substantially built — 22 routes, 12 services, 4 worker processors, rich schema, RLS on every table, 4 bulk-entry mechanisms, pattern detection, GDPR hooks. It "doesn't feel finished" because of three concrete wiring defects, not because the logic is missing.

---

## What's Actually Built

### Backend (`apps/api/src/modules/attendance/`)

- 22 controller routes across 12 services, all wired, all with co-located spec files
- Session lifecycle: `open → submitted → locked → cancelled`
- Per-student records: `present | absent_unexcused | absent_excused | late | left_early`
- Daily summaries derived per student per date
- Pattern alerts (excessive absences, recurring day, chronic tardiness) with acknowledge/resolve + parent notification
- **Four bulk-entry mechanisms already built**:
  - `default_present` flag — session opens with everyone present, teacher only taps absences
  - CSV/XLSX upload
  - AI image scan of paper registers
  - Quick-mark text parser
- Bulk undo, exceptions workflow

### Worker (`apps/worker/src/processors/`)

Four processors exist and are registered in `worker.module.ts`:

- `attendance:generate-sessions`
- `attendance:detect-pending`
- `attendance:auto-lock`
- `attendance:detect-patterns`

### Schema (`packages/prisma/schema.prisma`)

- `AttendanceSession` has nullable `schedule_id` FK to `Schedule`
- `Schedule` carries `class_id`, `teacher_staff_id`, `weekday`, `start_time`, `end_time`, `effective_start_date/end_date`
- `ClassEnrolment` provides the class roster
- Generation processor correctly joins Schedule + ClassEnrolment to materialize sessions per date
- RLS + `FORCE ROW LEVEL SECURITY` on all 4 attendance tables

### Frontend

Four of five pages hit real APIs:

- `/attendance` — list + create sessions
- `/attendance/mark/[sessionId]` — per-session marking
- `/attendance/exceptions` — exceptions + pattern alerts
- `/attendance/upload` — CSV/XLSX flow
- `/attendance/scan` — AI image scan

Attendance is in the morph shell nav.

---

## The Three Wiring Defects

### 1. Cron registration is missing

All four processors exist, but `CronSchedulerService` has no `registerAttendanceCronJobs` method and no `@InjectQueue(QUEUE_NAMES.ATTENDANCE)`. Sessions will never auto-generate, auto-lock never runs, pattern detection never fires. Everything works if you manually enqueue, nothing runs on a schedule.

### 2. Permission used but not seeded

`attendance.view_pattern_reports` is required on 3 controller routes (`/v1/attendance/pattern-alerts/*`) but does not exist in `permissions.ts` or any role seed. Those routes are functionally dead — every user fails the permission check.

### 3. Reports page is a mock

`apps/web/src/app/[locale]/(school)/reports/attendance/page.tsx` contains hardcoded `CHRONIC_ABSENTEES`, `HEATMAP_DATA`, `COMPLIANCE_DATA` arrays with no `apiClient` import. The other attendance pages are real; this one is a façade.

---

## Mapping The Four Product Asks

### 1. Auto-generated attendance sheets from the schedule

**Status: 90% built, 10% blocking.** The generation processor already:

- Takes a tenant + date
- Queries `Schedule` filtered by weekday within effective date range
- Reads `ClassEnrolment` for the roster
- Creates one `AttendanceSession` per schedule row with `schedule_id` set
- Respects `settings.attendance.defaultPresentEnabled` to pre-fill records

**Gap:** the cron that calls it every night doesn't exist. One-line fix in `CronSchedulerService`: register a tenant-fanout cron at ~05:00 local that enqueues a job per tenant for that day.

### 2. "Teacher of this class fills it out"

**Status: partially enforced, blunt.** The permission `attendance.take` is role-wide. A teacher with this permission can mark any class. There's no check that the user is the teacher assigned to the `Schedule` row the session came from.

`Schedule.teacher_staff_id` exists but the generation processor does not copy it to `AttendanceSession`. Fix: add a `teacher_staff_id` column to `attendance_sessions`, copy it during generation, scope the PUT/PATCH record endpoints:

> "If user has `attendance.take_any_class` → allow; else require `session.teacher_staff_id = currentUser.staff_id`."

### 3. Dedicated attendance-taker role (non-teacher)

**Status: not modeled at all.** Recommended approach:

- New permission `attendance.take_any_class`
- New role `attendance_officer` that gets `attendance.view` + `attendance.take_any_class`
- Teachers keep the scoped `attendance.take`
- The officer gets a dashboard listing every open session for the day

This matches existing RBAC patterns rather than adding a profile flag.

### 4. Per-period vs once-daily capture mode (tenant config)

**Status: not modeled.** The generation processor currently always fans out one session per Schedule row.

Config lives at `settings.attendance.captureMode: 'per_period' | 'daily'` as a JSONB key inside `TenantSetting.settings` (matches how `autoLockAfterDays` and `defaultPresentEnabled` already live there).

Generation branch:

- `per_period` — current behaviour
- `daily` — one session per class per day, `schedule_id` null, bound to a homeroom teacher concept

Needs:

- A settings controller endpoint for admins to toggle it
- Marking UI reads the mode
- For `daily` mode: confirm whether `Class.homeroom_teacher_id` exists; if not, add it (small schema addition)

Pattern alerts and daily summaries already operate on `AttendanceRecord`, so they work unchanged under either mode.

### Bulk entry UX ("don't make teachers tick 40 students")

Four mechanisms already exist. The killer feature is **default-present**: the session opens with everyone present, teacher only taps absences. It's already implemented via the `default_present` flag — the marking UI just needs to surface it prominently.

Suggested UI additions (all additive, no schema changes):

- Swipe-absent gesture on mobile
- Keyboard shortcuts on desktop (A/L/P/E keys)
- Search/jump-to-student for big classes

---

## Recommended Sequence

Cheapest first.

### Step 1 — Fix the three wiring defects (½ day)

1. Register the four attendance crons in `CronSchedulerService`
2. Seed `attendance.view_pattern_reports` + grant to appropriate roles
3. Replace the `reports/attendance` mock with a real endpoint-backed page

### Step 2 — Add capture-mode config ✓ DONE (2026-04-18)

- `settings.attendance.captureMode: 'per_period' | 'daily'` added to the shared Zod schema and the frontend settings types. Default is `per_period`.
- Existing `/v1/settings` + `/v1/settings/attendance` endpoints pick it up automatically via the per-module schema registry — no new controller needed.
- Generation processor branches on the mode. The `daily` branch iterates active classes directly, copies nothing from `Schedule`, and relies on the pre-existing `idx_attendance_sessions_adhoc_unique` partial index for idempotence. The per-period branch is unchanged.
- Admin UI toggle lives at Settings › General › Attendance. Saves round-trip through `/v1/settings/attendance` and survives reload.
- Marking UI now shows the schedule's start/end times when the session is bound to a period, and falls back to "Daily Register" framing for schedule_id=null sessions.
- No schema migration — `captureMode` lives inside the existing JSONB blob. Teacher-of-class copying onto `attendance_sessions` is deferred to Step 3 as originally planned.
- 10 unit tests on the generation processor (5 new daily-mode tests), 25 settings service tests, 880 shared tests, 398 attendance module tests — all green. E2E-verified on nhqs.edupod.app: toggle switches, save persists, full page reload restores the correct mode, zero console errors.

### Step 3 — Teacher scoping (1 day)

- Add `teacher_staff_id` to `attendance_sessions`
- Copy it during generation
- Scope mark/submit endpoints
- Add `attendance.take_any_class` permission
- Add `attendance_officer` role

### Step 4 — Dedicated-taker dashboard (1 day)

- New page listing every open session for today across the tenant
- Filters by year group, class, status
- Accessible to users with `attendance.take_any_class`

### Step 5 — Marking UX polish (½ day)

- Keyboard shortcuts
- Swipe gestures
- Search

**Total: 3–4 days of focused work** from "backend exists but not wired" to "production-ready attendance across both capture modes with three user personas."

---

## Current Work

Step 1 (three wiring defects) and Step 2 (capture-mode config) are complete and live. Steps 3–5 remain. This document is the source of truth for the remaining plan.
