# Attendance Module — Admin / Owner / Principal / Vice Principal E2E Test Specification

**Module:** Attendance (Sessions, Records, Daily Summaries, Exceptions, Pattern Alerts, AI Scan, Bulk Upload, Officer Dashboard).
**Perspective:** Admin-tier leadership — `school_owner`, `school_principal`, `school_vice_principal`, `admin`. Holds the full `attendance.*` suite: `manage`, `view`, `take`, `take_any_class`, `amend_historical`, `override_closure`, `view_pattern_reports`.
**Pages covered:** 6 authenticated school-facing routes under `/attendance` + officer dashboard, plus indirect surfaces in `/dashboard`, `/students/:id`, `/classes/:id`.
**Tester audience:** Dedicated QC engineer OR headless Playwright agent. Assume zero prior project context.
**Last Updated:** 2026-04-18

---

## Table of Contents

1. [Prerequisites & Multi-Tenant Test Data](#1-prerequisites--multi-tenant-test-data)
2. [Out of Scope — Delegated to Sibling Specs](#2-out-of-scope--delegated-to-sibling-specs)
3. [Global Environment Setup](#3-global-environment-setup)
4. [Role Gating — How `/en/attendance` Branches by Role](#4-role-gating--how-enattendance-branches-by-role)
5. [Attendance Hub — Navigation](#5-attendance-hub--navigation)
6. [Attendance Hub — Page Load & Skeletons](#6-attendance-hub--page-load--skeletons)
7. [Attendance Hub — Header & Action Buttons](#7-attendance-hub--header--action-buttons)
8. [Attendance Hub — Filter Toolbar](#8-attendance-hub--filter-toolbar)
9. [Attendance Hub — Session List Table](#9-attendance-hub--session-list-table)
10. [Attendance Hub — Pagination & Empty State](#10-attendance-hub--pagination--empty-state)
11. [Create Session Dialog](#11-create-session-dialog)
12. [Mark Page — Open Session](#12-mark-page--open-session)
13. [Mark Page — Default Present Mode](#13-mark-page--default-present-mode)
14. [Mark Page — Save, Submit, Cancel](#14-mark-page--save-submit-cancel)
15. [Mark Page — Submitted / Locked / Cancelled States](#15-mark-page--submitted--locked--cancelled-states)
16. [Amend Historical Record Flow](#16-amend-historical-record-flow)
17. [Cancel Session Flow](#17-cancel-session-flow)
18. [Officer Dashboard — Navigation & Gate](#18-officer-dashboard--navigation--gate)
19. [Officer Dashboard — KPIs, Filters, List](#19-officer-dashboard--kpis-filters-list)
20. [Officer Dashboard — Quick Jump to Marking](#20-officer-dashboard--quick-jump-to-marking)
21. [Exceptions Page — Layout](#21-exceptions-page--layout)
22. [Exceptions Page — Filters & Data](#22-exceptions-page--filters--data)
23. [Upload Page — Template Download](#23-upload-page--template-download)
24. [Upload Page — Full Spreadsheet Upload](#24-upload-page--full-spreadsheet-upload)
25. [Upload Page — Exceptions-Only Upload](#25-upload-page--exceptions-only-upload)
26. [Upload Page — Quick Mark (Paste Text)](#26-upload-page--quick-mark-paste-text)
27. [Upload Page — Undo Batch](#27-upload-page--undo-batch)
28. [Scan Page — Module Gate](#28-scan-page--module-gate)
29. [Scan Page — Image Upload](#29-scan-page--image-upload)
30. [Scan Page — Review & Confirm](#30-scan-page--review--confirm)
31. [Pattern Alerts — List (view_pattern_reports)](#31-pattern-alerts--list-view_pattern_reports)
32. [Pattern Alerts — Acknowledge / Resolve](#32-pattern-alerts--acknowledge--resolve)
33. [Pattern Alerts — Manual Parent Notification](#33-pattern-alerts--manual-parent-notification)
34. [Daily Summary — Cross-Surface Reads](#34-daily-summary--cross-surface-reads)
35. [Cross-Module Hand-Offs](#35-cross-module-hand-offs)
36. [School Closure & Academic Year Gating](#36-school-closure--academic-year-gating)
37. [Negative Assertions — What Admin Must Still NOT Do](#37-negative-assertions--what-admin-must-still-not-do)
38. [Error, Loading, Empty States](#38-error-loading-empty-states)
39. [Arabic / RTL](#39-arabic--rtl)
40. [Console & Network Health](#40-console--network-health)
41. [Mobile Responsiveness (375px)](#41-mobile-responsiveness-375px)
42. [Data Invariants](#42-data-invariants)
43. [Backend Endpoint Map](#43-backend-endpoint-map)
44. [Observations from Walkthrough](#44-observations-from-walkthrough)
45. [Sign-Off](#45-sign-off)

---

## 1. Prerequisites & Multi-Tenant Test Data

A single-tenant walkthrough cannot validate tenant isolation. Provision TWO tenants BEFORE running.

### Tenant A — `nhqs` (Nurul Huda Qur'an School)

- **URL:** `https://nhqs.edupod.app` (or `edupod.app/nhqs`). **NEVER** `nurul-huda.edupod.app`.
- **Currency / locale:** EN with Arabic toggle; Gregorian + Latin digits in both locales.
- **Academic year:** One active year spanning the test date (e.g. 2025-09-01 → 2026-08-31).
- **Classes:** ≥ 6 active classes across ≥ 3 year groups. At least 2 classes with a timetabled schedule on the test weekday; at least 1 class without a schedule (for daily-capture mode test).
- **Schedules:** ≥ 8 `schedule` rows covering the test weekday with distinct teachers per schedule. Schedule weekday uses the JS convention (0=Sunday…6=Saturday).
- **Sessions (pre-seeded for test date):** at least 10 `AttendanceSession` rows for today — mix of `open` / `submitted` / `locked` / `cancelled`. Include 1 `open` session with `default_present=true` plus pre-populated records.
- **Records:** for submitted/locked sessions, seed ≥ 5 `AttendanceRecord` rows each, mixed statuses (`present`, `absent_unexcused`, `absent_excused`, `late`, `left_early`).
- **Daily summaries:** seed ≥ 20 `DailyAttendanceSummary` rows for ≥ 10 students covering the last 14 days.
- **Pattern alerts:** seed ≥ 3 active `AttendancePatternAlert` rows — one per `alert_type` (`excessive_absences`, `recurring_day`, `chronic_tardiness`).
- **School closures:** seed 1 closure row (`affects_scope = all`) on a date ± 2 days from today for the closure test.
- **Tenant settings JSONB `attendance` block:** `{ captureMode: 'per_period', defaultPresentEnabled: true, autoLockAfterDays: 3, patternDetection: { enabled: true, ... } }`.
- **ai_functions module enabled** for scan tests. If disabled for this tenant, the scan test cases expect the module-gate 403 instead and must be recorded as such.

### Users required in Tenant A

| Email                 | Password     | Role                  | Scope                                                                              |
| --------------------- | ------------ | --------------------- | ---------------------------------------------------------------------------------- |
| `owner@nhqs.test`     | Password123! | School Owner          | full `attendance.*` (including `manage`, `take_any_class`, `amend`).               |
| `principal@nhqs.test` | Password123! | School Principal      | same.                                                                              |
| `vp@nhqs.test`        | Password123! | School Vice Principal | same.                                                                              |
| `officer@nhqs.test`   | Password123! | Attendance Officer    | `attendance.view`, `attendance.take`, `attendance.take_any_class`.                 |
| `teacher@nhqs.test`   | Password123! | Teacher               | `attendance.take`, `attendance.view` only. Own sessions only. **negative target.** |
| `parent@nhqs.test`    | Password123! | Parent (≥ 1 child)    | `parent.view_attendance` only.                                                     |
| `finance@nhqs.test`   | Password123! | Accounting            | No attendance permissions. **negative target.**                                    |

### Tenant B — `demo-b`

- **URL:** `https://demo-b.edupod.app`.
- **Distinct seed data** from Tenant A — no id collisions. ≥ 5 classes, ≥ 10 sessions in assorted statuses.
- **Users:** `owner@demo-b.test` / Password123!.
- **Hostile cross-tenant pair:** capture the UUIDs of 1 `AttendanceSession`, 1 `AttendanceRecord`, 1 `DailyAttendanceSummary`, 1 `AttendancePatternAlert`, 1 `Class` from Tenant B. The admin-in-A ↔ data-in-B hostile API matrix is exercised in §37.x here and exhaustively in `integration/attendance-integration-spec.md`.

### Browser / device matrix

Desktop Chrome (latest stable) + 375px iPhone SE emulation. Everything else deferred to manual QA.

---

## 2. Out of Scope — Delegated to Sibling Specs

This spec exercises the UI-visible surface of the Attendance module as an admin clicking through the school shell. It does NOT cover:

- **RLS leakage matrix + API contract matrix** → `integration/attendance-integration-spec.md`.
- **Full permission matrix × endpoint** for non-admin roles → `integration/` (specifically §4) and `security/attendance-security-spec.md` (§13).
- **BullMQ jobs, cron schedulers, retry policies, dead-letter, early-warning fan-out** → `worker/attendance-worker-spec.md`.
- **Latency & throughput budgets (p50/p95/p99 per endpoint, PDF render, bundle sizes)** → `perf/attendance-perf-spec.md`.
- **OWASP Top 10, IDOR, injection, encrypted fields, file-upload safety, AI prompt injection on scan** → `security/attendance-security-spec.md`.
- **Teacher own-session-only scoping and "not session teacher" flows** → `teacher_view/attendance-e2e-spec.md`.
- **Attendance Officer role** (the `attendance_officer` role_key specifically) → `officer_view/attendance-e2e-spec.md`. Admin users can ALSO hit the officer dashboard (via `take_any_class`); that admin angle is covered in §18–§20 below.
- **Parent attendance view & absence notification digest** → `parent_view/attendance-e2e-spec.md`.
- **Student perspective:** students have ZERO attendance access by design — asserted in `security/` §13 as permission-matrix rows, not a standalone spec.

A tester who runs ONLY this spec is doing a thorough admin-shell smoke + regression pass. For full release readiness, run the complete `/e2e-full` pack.

---

## 3. Global Environment Setup

| #    | What to Check                                                      | Expected Result                                                                                                                                                                                                                                       | Pass/Fail |
| ---- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1  | Open Chrome DevTools, Network + Console tabs ready                 | Both tabs populate as navigation proceeds.                                                                                                                                                                                                            |           |
| 3.2  | Clear `localStorage`, `sessionStorage`, cookies for `*.edupod.app` | Logged out on next request.                                                                                                                                                                                                                           |           |
| 3.3  | Log in as `owner@nhqs.test`                                        | `POST /api/v1/auth/login` → 200 with `{ access_token, refresh_token }`. Access token in memory (NOT localStorage). Refresh token httpOnly cookie.                                                                                                     |           |
| 3.4  | Verify JWT payload claims                                          | `role_keys` includes `school_owner`. Permission set includes `attendance.manage`, `attendance.view`, `attendance.take`, `attendance.take_any_class`, `attendance.amend_historical`, `attendance.override_closure`, `attendance.view_pattern_reports`. |           |
| 3.5  | Landing URL after login                                            | `/en/dashboard` (admin variant — NOT `/en/dashboard/teacher`).                                                                                                                                                                                        |           |
| 3.6  | Tenant slug in URL / subdomain                                     | `nhqs.edupod.app` subdomain.                                                                                                                                                                                                                          |           |
| 3.7  | Browser console                                                    | Zero uncaught errors. No red warnings.                                                                                                                                                                                                                |           |
| 3.8  | Toggle Arabic (`ar`) via profile menu                              | URL becomes `/ar/attendance`. `<html dir="rtl">`. Morph bar mirrors.                                                                                                                                                                                  |           |
| 3.9  | Toggle back to `en`                                                | `<html dir="ltr">`. Morph bar un-mirrors.                                                                                                                                                                                                             |           |
| 3.10 | Re-run §3.3 as `principal@nhqs.test` in a second browser profile   | Same JWT permission set as owner (for attendance scope). `/en/attendance` renders identically.                                                                                                                                                        |           |
| 3.11 | Re-run as `vp@nhqs.test`                                           | Same.                                                                                                                                                                                                                                                 |           |

---

## 4. Role Gating — How `/en/attendance` Branches by Role

| #   | What to Check                                                     | Expected Result                                                                                                                                                                                | Pass/Fail |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | `/en/attendance` as `owner@nhqs.test`                             | Renders the admin variant with **Officer dashboard** CTA visible next to **Upload attendance** and **Create session**. The first API call fired is `GET /api/v1/attendance-sessions?...`.      |           |
| 4.2 | `/en/attendance` as `principal@nhqs.test` and `vp@nhqs.test`      | Same admin variant. Officer CTA visible.                                                                                                                                                       |           |
| 4.3 | `/en/attendance` as `officer@nhqs.test` (attendance_officer role) | Same list view; Officer CTA also visible (`OFFICER_ROLE_KEYS` includes `attendance_officer`). Covered in detail in `officer_view/`.                                                            |           |
| 4.4 | `/en/attendance` as `teacher@nhqs.test`                           | Same list page loads BUT the list returns only the teacher's own sessions (backend filter on `teacher_staff_id` because caller lacks `attendance.take_any_class`). Covered in `teacher_view/`. |           |
| 4.5 | `/en/attendance` as `finance@nhqs.test`                           | `GET /api/v1/attendance-sessions` → 403 (lacks `attendance.view`). UI shows an empty list with an inline 403 toast, OR redirects to `/en/dashboard`.                                           |           |
| 4.6 | `/en/attendance` unauthenticated (fresh incognito)                | Redirects to `/en/login?returnTo=/en/attendance`. No attendance data leaks in network panel before redirect.                                                                                   |           |
| 4.7 | `/en/attendance/officer` as `teacher@nhqs.test`                   | Front-end role-gate shows **"You don't have access to this page"** placeholder. Backend `GET /api/v1/attendance/officer-dashboard` returns 403 (`attendance.take_any_class` missing).          |           |
| 4.8 | Deep-link `/en/attendance/mark/{someSessionId}` as admin          | Loads the mark page directly. No flash of `/attendance` before loading.                                                                                                                        |           |
| 4.9 | `ADMIN_ROLES` constant source                                     | `['school_owner', 'school_principal', 'school_vice_principal', 'admin']`. If user's `role_keys` includes any of the four (or `attendance_officer`), Officer CTA appears.                       |           |

---

## 5. Attendance Hub — Navigation

| #   | What to Check                           | Expected Result                                                                                                                                             | Pass/Fail |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Inspect the morph bar hubs              | Admin sees 9 hubs: Home, People, **Learning**, Wellbeing, Operations, Finance, Reports, Regulatory, Settings.                                               |           |
| 5.2 | Click **Learning**                      | URL becomes `/en/classes`. Learning sub-strip appears: Classes, Curriculum, Assessment, Homework, **Attendance**.                                           |           |
| 5.3 | Click **Attendance** in the sub-strip   | URL becomes `/en/attendance`. Link highlighted active. No secondary sub-strip (Attendance is a flat hub with internal routes accessed via the header CTAs). |           |
| 5.4 | Profile button (top right)              | Reads **"Yusuf Rahman"**, role **"School Owner"**, avatar initials **"YR"** in a primary-colour circle.                                                     |           |
| 5.5 | Keyboard navigation — Tab through morph | Each hub focuses in visual order; Enter activates; focus ring visible on dark + light themes.                                                               |           |
| 5.6 | Shell visual stability                  | Morph bar does NOT remount / re-animate while moving between `/attendance` → `/attendance/officer` → `/attendance/mark/{id}`. Only active pill shifts.      |           |
| 5.7 | Deep-linking from a fresh tab           | Paste `/en/attendance/officer` — officer dashboard loads without flashing the hub first.                                                                    |           |

---

## 6. Attendance Hub — Page Load & Skeletons

**URL:** `/en/attendance`

| #   | What to Check                      | Expected Result                                                                                                                                                                   | Pass/Fail |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | Initial skeleton (first ~500ms)    | LoadingSkeleton renders: header stripe, filter-row skeleton, table skeleton (5 rows × 5 columns).                                                                                 |           |
| 6.2 | After load                         | No infinite skeletons. Header, toolbar, table all render within 1–2s.                                                                                                             |           |
| 6.3 | Data fetches fired in parallel     | Three parallel requests: (a) `GET /api/v1/attendance-sessions?page=1&pageSize=20`, (b) `GET /api/v1/classes?pageSize=100`, (c) `GET /api/v1/settings`. All return 200 within ~2s. |           |
| 6.4 | Browser console                    | Zero red errors. No `console.error` from any of the three requests.                                                                                                               |           |
| 6.5 | Tenant isolation sanity            | Every response body contains ONLY Tenant A rows. No id from Tenant B seed set appears. Record three random session ids and cross-check against Tenant B's DB offline.             |           |
| 6.6 | Refresh (F5)                       | Identical set of 3 requests fires; same data renders.                                                                                                                             |           |
| 6.7 | Nav away and back via browser back | Page re-fetches. No stale table flash from a previous filter state.                                                                                                               |           |

---

## 7. Attendance Hub — Header & Action Buttons

| #   | What to Check               | Expected Result                                                                                                                                              | Pass/Fail |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 7.1 | `<h1>`                      | Text: **"Attendance"**. Class: `text-2xl font-semibold`.                                                                                                     |           |
| 7.2 | Action button order (LTR)   | From start→end: **Officer dashboard** (outline, visible only for admin-tier + officer roles), **Upload attendance** (outline), **Create session** (primary). |           |
| 7.3 | Click **Officer dashboard** | Navigates to `/en/attendance/officer`. See §18.                                                                                                              |           |
| 7.4 | Click **Upload attendance** | Navigates to `/en/attendance/upload`. See §23.                                                                                                               |           |
| 7.5 | Click **Create session**    | Opens the create dialog (client-side). See §11.                                                                                                              |           |
| 7.6 | Mobile breakpoint (375px)   | Actions collapse into a vertical stack OR a compact "Actions ▾" menu. No horizontal overflow. Every button ≥ 44×44px.                                        |           |
| 7.7 | Arabic layout               | Action buttons right-to-left mirrored; icons rotate (arrows) or stay (doc-icons) as appropriate.                                                             |           |

---

## 8. Attendance Hub — Filter Toolbar

The toolbar shows four inputs: **Date from**, **Date to**, **Class**, **Status**.

| #    | What to Check                     | Expected Result                                                                                                           | Pass/Fail |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- | ------ | ----------------------------- | --- |
| 8.1  | Date-from input                   | `<input type="date">`. Empty by default. Changing it emits `start_date=YYYY-MM-DD` on the next fetch; resets page to 1.   |           |
| 8.2  | Date-to input                     | Same as 8.1 with `end_date`.                                                                                              |           |
| 8.3  | Date-from after Date-to (reverse) | UI accepts it; backend returns empty result set. No 5xx. Consider adding client-side warning (see observations).          |           |
| 8.4  | Class select                      | Options: **All classes** + every active class alphabetically. Choosing a class emits `class_id={uuid}`; resets page to 1. |           |
| 8.5  | Status select                     | Options: **All**, **Open**, **Submitted**, **Locked**, **Cancelled**. Choosing a status emits `status=open                | submitted | locked | cancelled`; resets page to 1. |     |
| 8.6  | Combine date + class + status     | Request URL includes all three params. Result set matches. Tested by counting rows vs direct DB query.                    |           |
| 8.7  | Arabic locale — date picker       | Shows Gregorian Western numerals (project rule). No Hijri.                                                                |           |
| 8.8  | Mobile — toolbar wraps            | Inputs wrap to a grid / stack. Each input `w-full` on mobile, fixed width at `sm:` breakpoint.                            |           |
| 8.9  | Keyboard — Tab through filters    | Sequential focus: date-from → date-to → class → status. Tab order logical in both LTR and RTL.                            |           |
| 8.10 | Reset after page refresh          | Filters reset to defaults (page 1, All/All, empty dates).                                                                 |           |

---

## 9. Attendance Hub — Session List Table

| #    | What to Check                                     | Expected Result                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1  | Column headers                                    | **Date**, **Class**, **Status**, **Marked count**, **Actions**.                                                                          |           |
| 9.2  | **Date** cell                                     | Rendered via `formatDate()` (e.g. `18-04-2026`). **Never** a raw ISO string or `2026-04-18T00:00:00.000Z`.                               |           |
| 9.3  | **Class** cell (per-period session)               | Line 1: class name bold. Line 2: subject name + `·` + `start_time`–`end_time` in mono. Example: `K1B`, then `Arabic · 08:45–10:00`.      |           |
| 9.4  | **Class** cell (daily session)                    | Line 1: class name. Line 2 absent (no schedule attached, subject = null).                                                                |           |
| 9.5  | **Status** badge                                  | `AttendanceStatusBadge` component: open=primary, submitted=success, locked=neutral, cancelled=danger. Tokens only; no hardcoded hex.     |           |
| 9.6  | **Marked count** cell                             | `_count.records` integer. Zero shows `0` (not `—`).                                                                                      |           |
| 9.7  | **Actions** cell — open session                   | Button **Mark attendance** visible.                                                                                                      |           |
| 9.8  | **Actions** cell — submitted / locked / cancelled | No **Mark attendance** button (null). To amend a record, admin enters the session from another route (e.g. clicking the row).            |           |
| 9.9  | Row click (open session)                          | Navigates to `/en/attendance/mark/{id}`. Event bubbles from any cell except the explicit action button.                                  |           |
| 9.10 | Row click (submitted / locked)                    | Navigates to same mark URL in read-only + amend mode (see §16).                                                                          |           |
| 9.11 | Row click (cancelled)                             | Either navigates and shows a "Session cancelled" banner, OR is disabled. Document actual behaviour.                                      |           |
| 9.12 | Keyboard: Tab to a row, Enter                     | Same as click.                                                                                                                           |           |
| 9.13 | Arabic locale — column order mirrors              | `<table dir="rtl">`. Actions column is at the visual start; Date at the visual end.                                                      |           |
| 9.14 | Mobile — table overflow                           | Table wrapped in `overflow-x-auto`. Horizontal scroll. First column (Date) sticky. Action buttons collapse to a small icon-only variant. |           |

---

## 10. Attendance Hub — Pagination & Empty State

| #    | What to Check                                    | Expected Result                                                                                                   | Pass/Fail |
| ---- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Default page size                                | 20. Bottom of table shows `Page 1 / N` where N = ceil(total/20).                                                  |           |
| 10.2 | Click next page                                  | `page=2&pageSize=20`. New rows render. URL does NOT change (state is local).                                      |           |
| 10.3 | Page count reflects total                        | `meta.total` from API drives page count.                                                                          |           |
| 10.4 | Filter change resets page                        | Any filter change sends `page=1`.                                                                                 |           |
| 10.5 | Empty state (zero results after filter)          | Shows **"No sessions match your filters"** EmptyState with a **Clear filters** button. Button resets all filters. |           |
| 10.6 | Empty state on fresh tenant (zero sessions ever) | **"No attendance sessions yet. Create your first session."** with inline **Create session** button.               |           |

---

## 11. Create Session Dialog

Triggered by **Create session** button in §7. Manual create is the admin override; normal flow is the cron auto-generation.

| #     | What to Check                                                     | Expected Result                                                                                                                                                                                                                    | Pass/Fail |
| ----- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1  | Dialog title + description                                        | **"Create attendance session"** + short description.                                                                                                                                                                               |           |
| 11.2  | Class select                                                      | Populated from `/api/v1/classes?pageSize=100`. Required. Inline error if missing.                                                                                                                                                  |           |
| 11.3  | Date input                                                        | Defaults to today ISO date (YYYY-MM-DD). Required.                                                                                                                                                                                 |           |
| 11.4  | **Default present** toggle                                        | Visible only if tenant's `attendance.defaultPresentEnabled === true`. When ON, creates the session with `default_present = true` and (backend-side) inserts `AttendanceRecord` rows `status=present` for every active enrolment.   |           |
| 11.5  | Submit happy path                                                 | `POST /api/v1/attendance-sessions` with `{ class_id, session_date, default_present? }` → 201 `{ data: { id } }`. Dialog closes. Route to `/en/attendance/mark/{id}`.                                                               |           |
| 11.6  | Submit with missing `class_id`                                    | Client-side validation trips. Dialog stays open. No network call fired.                                                                                                                                                            |           |
| 11.7  | Submit with missing `session_date`                                | Same.                                                                                                                                                                                                                              |           |
| 11.8  | Submit with invalid date format                                   | Zod `session_date: z.string().min(1)` accepts anything non-empty. Backend service normalises. Negative dates handled as below.                                                                                                     |           |
| 11.9  | Submit for a class not in current tenant (cross-tenant id)        | Backend `findFirst` on the class with tenant filter returns null → 400 `CLASS_NOT_FOUND` OR 404. NEVER creates the session.                                                                                                        |           |
| 11.10 | Submit for a date outside the class's academic year               | 400 with a message citing academic year start/end. Dialog stays open with red inline error.                                                                                                                                        |           |
| 11.11 | Submit for a date covered by a school closure                     | 409 `CLOSURE_CONFLICT` message. UI shows the closure name + date range. Admin sees a **"Override closure"** secondary button that re-submits with `override_closure: true`. Requires `attendance.override_closure` (admin has it). |           |
| 11.12 | Submit for a weekday with no schedules AND no `class_id` homeroom | For per-period capture mode, manual create with a class that has no schedule on this weekday is allowed (admin override) — session is created with `schedule_id = null`. Subject-name cell will show `—` on the list view.         |           |
| 11.13 | Already-existing session for (class_id, session_date)             | 409 `SESSION_ALREADY_EXISTS` — dialog shows inline, stays open. User can still navigate to the existing session via **"Open existing"** link in the error.                                                                         |           |
| 11.14 | Cancel                                                            | Closes dialog; no API call.                                                                                                                                                                                                        |           |
| 11.15 | Keyboard: Esc                                                     | Closes dialog.                                                                                                                                                                                                                     |           |
| 11.16 | Keyboard: Tab order                                               | Class → Date → Default present toggle → Cancel → Create. Reversed under RTL.                                                                                                                                                       |           |
| 11.17 | After successful create, list refresh                             | If the user navigates back with browser back, the list refetches and now shows the newly-created session.                                                                                                                          |           |

---

## 12. Mark Page — Open Session

**URL:** `/en/attendance/mark/{sessionId}`

| #     | What to Check                      | Expected Result                                                                                                                                                                                                               | Pass/Fail |
| ----- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1  | Page load fires                    | `GET /api/v1/attendance-sessions/{id}` returning session detail + list of enrolled students with any existing records.                                                                                                        |           |
| 12.2  | Header subtitle                    | For per-period: `{class.name} · {subject.name} — {formatDate(date)} · {start_time}–{end_time}`. For daily: `{class.name} — {formatDate(date)}`.                                                                               |           |
| 12.3  | Date in subtitle                   | **Never** a raw ISO string. Always formatted as `DD-MM-YYYY` (or locale equivalent).                                                                                                                                          |           |
| 12.4  | Status pill in header              | `AttendanceStatusBadge status="open"` renders primary-tone "Open".                                                                                                                                                            |           |
| 12.5  | Student roster                     | Rendered in enrolment order (or alphabetical — verify in `ClassesReadFacade.findEnrolledStudentIds` contract). One row per active enrolment.                                                                                  |           |
| 12.6  | Each row controls                  | Status control (5-option segmented button or select): **Present** / **Absent (unexcused)** / **Absent (excused)** / **Late** / **Left early**. Late shows a time input. Reason free-text field appears when status ≠ present. |           |
| 12.7  | Student row identity               | Avatar initials + full name + enrolment ID. Enrolment ID forced LTR in Arabic locale (`dir="ltr"` on the span).                                                                                                               |           |
| 12.8  | Tenant isolation sanity            | Every student in the roster belongs to Tenant A. Cross-reference 2 random ids against Tenant B offline.                                                                                                                       |           |
| 12.9  | Bulk actions (if present)          | "Mark all present" / "Mark all absent" buttons toggle every row. Unsaved state indicator (e.g. "Unsaved changes") surfaces.                                                                                                   |           |
| 12.10 | Dirty-state visual                 | Edited rows show an asterisk or colour highlight until save.                                                                                                                                                                  |           |
| 12.11 | Status control — keyboard          | Arrow keys cycle the 5 options. Enter confirms selection. Visible focus ring.                                                                                                                                                 |           |
| 12.12 | Navigate away with unsaved changes | Browser beforeunload confirmation (or in-app modal) fires. Confirming abandons changes; cancelling keeps you on page.                                                                                                         |           |

---

## 13. Mark Page — Default Present Mode

| #    | What to Check                                                                                                                | Expected Result                                                                                                                                         | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Session was created with `default_present = true` (via cron or manual toggle)                                                | Every student row opens pre-marked **Present** with a subtle "Auto-marked" badge.                                                                       |           |
| 13.2 | Records list in DB shows `marked_by_user_id = '00000000-0000-0000-0000-000000000000'` (system sentinel) for auto-marked rows | Verify via direct DB inspection OR by selecting a row and confirming "Auto-marked" audit text.                                                          |           |
| 13.3 | Admin changes a student from default-Present → Absent                                                                        | Row marked "dirty". On save, record updates; `marked_by_user_id` becomes the admin user id; `amended_from_status` is NOT set (still in `open` session). |           |
| 13.4 | Admin saves without changing any default-Present row                                                                         | `PUT .../records` with an empty records array → 400 Zod `.min(1)`. UI shows "No changes to save".                                                       |           |
| 13.5 | Create session with `default_present` disabled at tenant level, toggle off                                                   | Toggle does not render in the dialog. Created session has `default_present = null`, no pre-populated records.                                           |           |

---

## 14. Mark Page — Save, Submit, Cancel

| #    | What to Check                                          | Expected Result                                                                                                                                                                                                 | Pass/Fail |
| ---- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1 | Click **Save** with 1 dirty row                        | `PUT /api/v1/attendance-sessions/{id}/records` with `{ records: [{student_id, status, reason?, arrival_time?}] }`. Returns updated records. Toast green "Attendance saved". Dirty indicator clears.             |           |
| 14.2 | Click **Save** with 30 dirty rows                      | Single request with 30 records. Happy path completes < 1.5s.                                                                                                                                                    |           |
| 14.3 | Click **Submit**                                       | `PATCH /api/v1/attendance-sessions/{id}/submit` → 200. Status badge switches to **Submitted** (success tone). Save button hides; an **Amend** mode appears (see §16).                                           |           |
| 14.4 | Submit fails due to non-enrolled student in prior save | Backend `STUDENTS_NOT_ENROLLED` 400 on save — guards against race. Admin must remove those rows. UI shows which ids are not enrolled.                                                                           |           |
| 14.5 | Submit a session with zero records                     | Backend allows submit (records are optional at submit time). Status flips to `submitted`, `DailySummaryService.recalculate` runs for all enrolled students — each gets a summary with `sessions_total`.         |           |
| 14.6 | Click **Cancel** (admin only, `attendance.manage`)     | `PATCH /api/v1/attendance-sessions/{id}/cancel` → 200 with status now `cancelled`. Shows red "Cancelled" pill. §17 elaborates.                                                                                  |           |
| 14.7 | Save while another tab submits the same session        | First save wins; second returns 409 `SESSION_NOT_OPEN`. UI shows "This session was submitted by another user — reload to amend." Reload button → re-fetches and switches to submitted/amend view.               |           |
| 14.8 | Submit then immediately navigate to `/en/attendance`   | Session row in list shows **Submitted** badge, marked-count is accurate.                                                                                                                                        |           |
| 14.9 | Triggering parent notifications on non-present saves   | Outside the save response: `communications:dispatch-notifications` enqueued for each non-present record when `AttendanceParentNotificationService.triggerAbsenceNotification` doesn't short-circuit on consent. |           |

---

## 15. Mark Page — Submitted / Locked / Cancelled States

| #    | What to Check                                                | Expected Result                                                                                                                                                                              | Pass/Fail |
| ---- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1 | Open a `submitted` session as admin                          | Roster renders read-only with per-row status shown. Status pill = success. An **Amend** button per row (or global "Edit" mode) is exposed because admin holds `attendance.amend_historical`. |           |
| 15.2 | Open a `locked` session as admin                             | Same as submitted but pill = neutral "Locked". Amend is still available (backend allows amend for `submitted` or `locked`).                                                                  |           |
| 15.3 | Open a `cancelled` session                                   | Roster hidden OR rendered with a red banner: **"This session was cancelled. No records are counted."** No edit affordances.                                                                  |           |
| 15.4 | Admin tries to call `PUT .../records` on a submitted session | 409 `SESSION_NOT_OPEN` — admin must use the amend endpoint on each record.                                                                                                                   |           |
| 15.5 | Admin tries to submit an already-submitted session           | 409 `SESSION_NOT_OPEN`.                                                                                                                                                                      |           |
| 15.6 | Admin tries to cancel an already-submitted or locked session | Document actual — likely 409 `SESSION_NOT_OPEN` or allowed. Verify.                                                                                                                          |           |

---

## 16. Amend Historical Record Flow

Requires `attendance.amend_historical`. Session must be `submitted` or `locked`.

| #     | What to Check                                                            | Expected Result                                                                                                                                                                                          | Pass/Fail |
| ----- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1  | Open a submitted session, click **Amend** on a record                    | Dialog opens with: current status, new status select, **required** reason textarea, arrival-time input (only relevant if new status = `late`).                                                           |           |
| 16.2  | Submit with empty reason                                                 | Client-side + server-side validation. 400 `amendment_reason is required` message displayed.                                                                                                              |           |
| 16.3  | Submit valid change                                                      | `PATCH /api/v1/attendance-records/{id}/amend` with `{ status, amendment_reason, arrival_time? }` → 200. Row updates. `amended_from_status` column now holds the old value. Toast green "Record amended". |           |
| 16.4  | Amend a record twice                                                     | Second amend sets `amended_from_status` to the status at the **start** of this amend (not the original). Verify behaviour matches service code.                                                          |           |
| 16.5  | Amend trigger side effects                                               | `DailySummaryService.recalculate(tenantId, student_id, session_date)` fires in the same controller flow. Verify by refreshing the student's daily-summary view — derived_status updates accordingly.     |           |
| 16.6  | Amend a record that doesn't exist                                        | 404 `RECORD_NOT_FOUND`.                                                                                                                                                                                  |           |
| 16.7  | Amend a record whose session is `open`                                   | 409 `SESSION_NOT_SUBMITTED_OR_LOCKED` — admin must use the normal save path instead.                                                                                                                     |           |
| 16.8  | Amend while caller lacks `attendance.amend_historical` (test as teacher) | 403. Covered in `teacher_view/`.                                                                                                                                                                         |           |
| 16.9  | Cross-tenant amend (admin-in-A uses a Tenant B record id)                | 404. NEVER 200.                                                                                                                                                                                          |           |
| 16.10 | Reason text with quotes / emojis / Arabic / RTL                          | Persists verbatim. `text-start` renders correctly. No escaping / double-encoding visible to user.                                                                                                        |           |

---

## 17. Cancel Session Flow

Requires `attendance.manage`.

| #    | What to Check                                                        | Expected Result                                                                                                                                                                                     | Pass/Fail |
| ---- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1 | Click **Cancel session** on an open session (admin only)             | Confirm dialog: **"Cancel this session? No records will be counted."** Confirm → `PATCH /api/v1/attendance-sessions/{id}/cancel` → 200 with status = cancelled. Toast.                              |           |
| 17.2 | Cancel on a submitted session                                        | 409 `SESSION_NOT_OPEN` OR allowed (verify). Document actual. If allowed, cascading effect on `DailyAttendanceSummary` — should summaries be recalculated to discount this session? Flag for review. |           |
| 17.3 | Cancel permission check — officer (`attendance.take_any_class`) only | 403 (cancel requires `attendance.manage`, not `take_any_class`).                                                                                                                                    |           |
| 17.4 | Audit                                                                | Audit log entry created (interceptor-driven). Row lists action `ATTENDANCE_SESSION_CANCELLED`, actor, target id, timestamp.                                                                         |           |
| 17.5 | Cross-tenant cancel (admin-in-A with a Tenant B session id)          | 404. NEVER 200.                                                                                                                                                                                     |           |

---

## 18. Officer Dashboard — Navigation & Gate

**URL:** `/en/attendance/officer`. Admin-tier and `attendance_officer` role holders both have access (via `attendance.take_any_class`).

| #    | What to Check                                             | Expected Result                                                                                                         | Pass/Fail |
| ---- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1 | Click **Officer dashboard** CTA on the hub header (admin) | URL becomes `/en/attendance/officer`. Shows skeleton ~500ms, then the list + KPIs.                                      |           |
| 18.2 | Fresh deep-link to `/en/attendance/officer` (admin)       | Renders directly; skeleton; then content.                                                                               |           |
| 18.3 | As `teacher@nhqs.test` deep-link `/en/attendance/officer` | Front-end role-gate shows an access-denied placeholder with a **Back** button. Backend `officer-dashboard` returns 403. |           |
| 18.4 | As `finance@nhqs.test` deep-link the same URL             | Access-denied placeholder. Backend returns 403 without leaking dashboard shape.                                         |           |
| 18.5 | Unauthenticated deep-link                                 | Redirect to login. No network call leaks.                                                                               |           |

---

## 19. Officer Dashboard — KPIs, Filters, List

| #     | What to Check                                               | Expected Result                                                                                                                                         | Pass/Fail |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1  | Back button                                                 | Clicks return to `/en/attendance`.                                                                                                                      |           |
| 19.2  | Header + description                                        | **"Attendance officer dashboard"** + descriptive subtitle.                                                                                              |           |
| 19.3  | Badges: **Open sessions** and **Unmarked**                  | Open = rows with status=open. Unmarked = rows with record_count=0. Warning tone if unmarked > 0.                                                        |           |
| 19.4  | Date picker                                                 | Defaults to today (UTC). Changing it refetches.                                                                                                         |           |
| 19.5  | Status select                                               | Default `open`. Options: open / submitted / locked / cancelled / all.                                                                                   |           |
| 19.6  | Year group select                                           | Populated from `/api/v1/year-groups`. "All year groups" default.                                                                                        |           |
| 19.7  | Class select                                                | Populated from `/api/v1/classes?pageSize=100`.                                                                                                          |           |
| 19.8  | GET /api/v1/attendance/officer-dashboard fetch              | Fires on mount + every filter change. Query params: `session_date`, `pageSize=100`, optional `status`, `year_group_id`, `class_id`, `teacher_staff_id`. |           |
| 19.9  | Row structure                                               | Class + year-group + teacher name + schedule time + record-count / enrolled-count + subject. Ordered by schedule start then class name.                 |           |
| 19.10 | Subject name present                                        | Same helper as the hub list — `resolveSubjectsFromRuns`. Daily-mode sessions show no subject.                                                           |           |
| 19.11 | Enrolment count sanity                                      | `record_count ≤ enrolled_count`. When equal and session is open, row visually marks "All marked".                                                       |           |
| 19.12 | Tenant isolation                                            | Every row's class + teacher belong to Tenant A.                                                                                                         |           |
| 19.13 | Page size cap                                               | Backend Zod clamps at 100. Requesting 200 returns 100 rows.                                                                                             |           |
| 19.14 | Past-date query (e.g. 2026-01-01) returns archived sessions | Rows render as expected. Badges reflect historic counts.                                                                                                |           |
| 19.15 | Empty state                                                 | **"No sessions on this date"** when no rows match.                                                                                                      |           |
| 19.16 | Arabic locale                                               | Column order mirrors. Time spans and dates remain LTR.                                                                                                  |           |
| 19.17 | Mobile (375px)                                              | Rows collapse to stacked cards. Filters wrap. Horizontal scroll if table kept.                                                                          |           |

---

## 20. Officer Dashboard — Quick Jump to Marking

| #    | What to Check                                                | Expected Result                                                                                                                | Pass/Fail |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 20.1 | Click an open session row                                    | Navigates to `/en/attendance/mark/{id}`. Same mark UI as admin (§12).                                                          |           |
| 20.2 | Admin takes attendance on behalf of a teacher via this route | `PUT /records` succeeds because admin holds `attendance.take_any_class` (resolveTeacherScope returns null — no teacher check). |           |
| 20.3 | Session becomes `submitted` after admin submit               | Officer dashboard on refresh shows it under `status=submitted` filter.                                                         |           |
| 20.4 | Unmarked badge decrements                                    | After admin marks at least 1 record and saves, the row drops from the unmarked-count aggregate on next refetch.                |           |

---

## 21. Exceptions Page — Layout

**URL:** `/en/attendance/exceptions`. Requires `attendance.manage`.

| #    | What to Check          | Expected Result                                                                                                                                         | Pass/Fail |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.1 | Page load              | `GET /api/v1/attendance/exceptions?date={today-iso}` fires. Skeleton ~500ms.                                                                            |           |
| 21.2 | Header                 | **"Attendance exceptions"** + short description.                                                                                                        |           |
| 21.3 | Tabs / filters         | **Today** / **Last 7 days** / **Date range**. Date range opens two date inputs (`start_date`, `end_date`).                                              |           |
| 21.4 | List structure         | Grouped by session. Each group: session header (class, date, schedule time, teacher) + rows of non-present records with student name + status + reason. |           |
| 21.5 | Empty state            | **"No exceptions — all students present."** with success icon.                                                                                          |           |
| 21.6 | Row click on a student | Link to `/en/students/{id}` (requires `students.view`; admin has it).                                                                                   |           |
| 21.7 | Row click on session   | Link to `/en/attendance/mark/{id}`.                                                                                                                     |           |
| 21.8 | Tenant isolation       | All rows from Tenant A.                                                                                                                                 |           |

---

## 22. Exceptions Page — Filters & Data

| #    | What to Check                                              | Expected Result                                                                                                                          | Pass/Fail |
| ---- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 22.1 | Default — Today                                            | `date={YYYY-MM-DD today}`. Only today's sessions rendered.                                                                               |           |
| 22.2 | Switch to Last 7 days                                      | `start_date=today-6, end_date=today`. Backend clamps range.                                                                              |           |
| 22.3 | Custom range                                               | Validates start ≤ end; invalid returns 400.                                                                                              |           |
| 22.4 | Range > 60 days                                            | Soft-cap warning toast OR backend rejects. Document actual behaviour.                                                                    |           |
| 22.5 | Export CSV (if present)                                    | Generates a CSV of exceptions. Content-Type text/csv. Verify header + at least 1 row matches DB.                                         |           |
| 22.6 | Data integrity                                             | No present rows. Only `absent_unexcused`, `absent_excused`, `late`, `left_early`.                                                        |           |
| 22.7 | Derived `derived_status` from `daily_attendance_summaries` | If cross-linked: for students with multiple exceptions in a day, derived status reflects aggregation (absent / partially_absent / late). |           |

---

## 23. Upload Page — Template Download

**URL:** `/en/attendance/upload`. Requires `attendance.manage`.

| #    | What to Check                               | Expected Result                                                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 23.1 | Page load                                   | Header + tabs for **Full upload**, **Exceptions only**, **Quick mark**, **Undo**.                                                                                                        |           |
| 23.2 | Download template button on **Full upload** | `GET /api/v1/attendance/upload-template?session_date={YYYY-MM-DD}` → 200 with `Content-Type: text/csv`, `Content-Disposition: attachment; filename="attendance-{date}.csv"`. CSV parses. |           |
| 23.3 | Template content                            | Columns: `student_number`, `status`, `reason`, `arrival_time`. One row per active enrolment across all classes for that date.                                                            |           |
| 23.4 | Template includes the day's sessions        | Only sessions that exist on `session_date`. Per-period sessions may appear with multiple rows per student (one per session); daily sessions a single row per student.                    |           |
| 23.5 | Template excludes cancelled sessions        | No rows for cancelled sessions.                                                                                                                                                          |           |
| 23.6 | Invalid date format in query                | 400 Zod regex rejection `session_date must be in YYYY-MM-DD format`.                                                                                                                     |           |

---

## 24. Upload Page — Full Spreadsheet Upload

| #     | What to Check                                              | Expected Result                                                                                                                        | Pass/Fail |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 24.1  | Upload the template unchanged                              | `POST /api/v1/attendance/upload` with `multipart/form-data` + `file` + `session_date`. Server reports "0 updates".                     |           |
| 24.2  | Edit status for 3 students, upload                         | Server reports 3 updates, 0 created, 0 errors. Records reflect new statuses. Batch id returned.                                        |           |
| 24.3  | Upload .xlsx (valid)                                       | Accepted. File extension check passes.                                                                                                 |           |
| 24.4  | Upload .pdf                                                | 400 `INVALID_FILE_TYPE`. UI error toast.                                                                                               |           |
| 24.5  | Upload > 10 MB                                             | 400 `FILE_TOO_LARGE`.                                                                                                                  |           |
| 24.6  | Upload with unknown `student_number`                       | Row flagged in the response's `errors` array. Others still apply.                                                                      |           |
| 24.7  | Upload without a file                                      | 400 `FILE_REQUIRED`.                                                                                                                   |           |
| 24.8  | Upload with a bad Zod field (invalid status enum)          | Parser emits per-row error. Batch remains processable for remaining rows.                                                              |           |
| 24.9  | Upload then refresh the Hub                                | The affected sessions show their updated counts.                                                                                       |           |
| 24.10 | Cross-tenant upload (admin-in-A session_date with B's CSV) | File parses; but students_number lookups happen within Tenant A only, so Tenant B student_numbers resolve to "unknown". No cross-leak. |           |

---

## 25. Upload Page — Exceptions-Only Upload

`POST /api/v1/attendance/exceptions-upload` with `{ session_date, records: [{student_number, status, reason}] }`. Default assumption: every student present unless listed.

| #    | What to Check                              | Expected Result                                                                                         | Pass/Fail |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- | --------- |
| 25.1 | Submit 3 absent students                   | 200. Response lists rows created/updated per relevant session.                                          |           |
| 25.2 | Empty `records`                            | 200 with zero updates.                                                                                  |           |
| 25.3 | `status=present` in records                | Rejected by Zod (`status` enum excludes `present` for this endpoint). 400 with the offending row index. |           |
| 25.4 | Unknown student_number                     | Row error; rest apply.                                                                                  |           |
| 25.5 | Apply on a date with no sessions generated | No-op + user-visible message "No sessions found for {date}".                                            |           |

---

## 26. Upload Page — Quick Mark (Paste Text)

`POST /api/v1/attendance/quick-mark` with `{ session_date, text }`.

| #    | What to Check                                       | Expected Result                                                                                                 | Pass/Fail |
| ---- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| 26.1 | Paste `S001 absent\nS002 late 08:45 traffic`        | Server parses, persists. 200 with affected sessions + count.                                                    |           |
| 26.2 | Empty text                                          | 400 Zod `min(1)`.                                                                                               |           |
| 26.3 | Malformed text (no student numbers)                 | 400 with parse error OR 200 with zero updates + warning. Document actual.                                       |           |
| 26.4 | Paste an RTL text (Arabic notes) with Arabic digits | Student numbers are Latin digits (rule); Arabic digits rejected or normalised. Reason free text accepted as-is. |           |
| 26.5 | Preview (if UI exposes it)                          | Shows parsed rows before committing. Cancel = no server write.                                                  |           |

---

## 27. Upload Page — Undo Batch

`POST /api/v1/attendance/upload/undo` with `{ batch_id }`.

| #    | What to Check                             | Expected Result                                                                                                                               | Pass/Fail |
| ---- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 27.1 | After a successful upload, click **Undo** | Dialog asks for confirmation. Confirm → the 3 changed records revert to their pre-batch state (or deleted if they were created in the batch). |           |
| 27.2 | Undo twice                                | Second call returns 409 `BATCH_ALREADY_REVERTED` OR 404. Idempotent.                                                                          |           |
| 27.3 | Cross-tenant undo                         | 404.                                                                                                                                          |           |
| 27.4 | Undo after session has been submitted     | 409 `SESSION_NOT_OPEN` — admin must first re-open via amend (or the undo is blocked by design). Verify actual contract.                       |           |

---

## 28. Scan Page — Module Gate

**URL:** `/en/attendance/scan`. Requires `attendance.manage` + `ai_functions` module enabled.

| #    | What to Check                                                 | Expected Result                                                                                                | Pass/Fail |
| ---- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| 28.1 | Navigate to `/en/attendance/scan` with `ai_functions` enabled | Page renders with upload zone.                                                                                 |           |
| 28.2 | Navigate with `ai_functions` disabled at tenant level         | `ModuleEnabledGuard` blocks the POSTs → 403 `MODULE_NOT_ENABLED`. UI shows a "Module not enabled" empty-state. |           |
| 28.3 | Navigate as non-admin (officer)                               | 403 (requires `attendance.manage`).                                                                            |           |

---

## 29. Scan Page — Image Upload

`POST /api/v1/attendance/scan` with multipart `image` + `session_date`.

| #    | What to Check                           | Expected Result                                                                                                           | Pass/Fail |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| 29.1 | Upload a JPEG < 10MB                    | 200. Response contains parsed entries (student_number + detected status). AI tokenisation happens via `GdprTokenService`. |           |
| 29.2 | Upload a PNG                            | Same.                                                                                                                     |           |
| 29.3 | Upload a PDF                            | 400 `INVALID_FILE_TYPE`.                                                                                                  |           |
| 29.4 | Upload > 10 MB                          | 400 `FILE_TOO_LARGE`.                                                                                                     |           |
| 29.5 | Upload with no file                     | 400 `FILE_REQUIRED`.                                                                                                      |           |
| 29.6 | Upload while `ai_functions` disabled    | 403.                                                                                                                      |           |
| 29.7 | Upload image of a whiteboard with names | Parser detects student numbers/names. UI shows matched + unmatched names. Unmatched rows excluded from final apply.       |           |
| 29.8 | Response PII handling                   | Log output (server) masks student names — confirm via server logs that no raw PII is logged. GdprToken used as proxy.     |           |

---

## 30. Scan Page — Review & Confirm

`POST /api/v1/attendance/scan/confirm` with the edited entries.

| #    | What to Check                                  | Expected Result                                                                                   | Pass/Fail |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| 30.1 | Review stage shows parsed rows                 | Admin can edit status / reason / student_number before confirming.                                |           |
| 30.2 | Confirm with 5 entries                         | `POST .../scan/confirm` → 200 (delegates to `processExceptionsUpload`). Affected sessions update. |           |
| 30.3 | Confirm with invalid student_number            | Row-level error; rest apply.                                                                      |           |
| 30.4 | Cancel stage                                   | No API call; navigates back to upload zone.                                                       |           |
| 30.5 | `ai_functions` disabled between scan + confirm | Confirm 403s. UI surfaces the same module-not-enabled message.                                    |           |

---

## 31. Pattern Alerts — List (view_pattern_reports)

**Source:** `GET /api/v1/attendance/pattern-alerts?page=1&pageSize=20`. Requires `attendance.view_pattern_reports`. Surface: likely under a sub-route like `/en/attendance/patterns` or within a side panel on the hub — document the actual entry point.

| #    | What to Check            | Expected Result                                                                                                                                          | Pass/Fail     |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------- | --- |
| 31.1 | Load pattern alerts list | Returns pattern alerts ordered by `detected_date` DESC. 3 active alerts from seed surface.                                                               |               |
| 31.2 | Status filter            | `status=active                                                                                                                                           | acknowledged  | resolved`.          |     |
| 31.3 | Alert type filter        | `alert_type=excessive_absences                                                                                                                           | recurring_day | chronic_tardiness`. |     |
| 31.4 | Alert row content        | Student name, alert type badge, details JSON summary (e.g. "5 absences in 14 days" / "Every Tuesday × 3" / "4 late arrivals in 14 days"), detected date. |               |
| 31.5 | Link to student profile  | Row click → `/en/students/{student_id}` with attendance tab open.                                                                                        |               |
| 31.6 | Tenant isolation         | All rows from Tenant A only.                                                                                                                             |               |

---

## 32. Pattern Alerts — Acknowledge / Resolve

| #    | What to Check                                        | Expected Result                                                                                                                  | Pass/Fail |
| ---- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 32.1 | Click **Acknowledge** on an active alert             | `PATCH /api/v1/attendance/pattern-alerts/{id}/acknowledge` → 200. Status becomes `acknowledged`. `acknowledged_by` = admin user. |           |
| 32.2 | Click **Resolve** on an acknowledged or active alert | `PATCH .../resolve` → 200. Status becomes `resolved`.                                                                            |           |
| 32.3 | Invalid transition                                   | Attempt resolve on an already-resolved alert — idempotent success or 409. Document actual.                                       |           |
| 32.4 | Cross-tenant (admin-in-A hits Tenant B alert id)     | 404.                                                                                                                             |           |

---

## 33. Pattern Alerts — Manual Parent Notification

| #    | What to Check                                        | Expected Result                                                                                                                                      | Pass/Fail |
| ---- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 33.1 | Tenant configured `parentNotificationMode: 'manual'` | Alerts do NOT auto-notify parents. A **Notify parent** button is surfaced on each alert card.                                                        |           |
| 33.2 | Click **Notify parent**                              | `POST /api/v1/attendance/pattern-alerts/{id}/notify-parent` → 200. Sets `parent_notified=true`, `parent_notified_at=now`. Enqueues notification job. |           |
| 33.3 | Click again after success                            | 409 `ALREADY_NOTIFIED` OR idempotent success. Document actual.                                                                                       |           |
| 33.4 | Parent notification audit                            | `NotificationDispatchService` creates a dispatch log row + sends the email / SMS / in-app. Verify via the parent's inbox in `parent_view/`.          |           |
| 33.5 | Tenant configured `parentNotificationMode: 'auto'`   | Alert creation (in worker) already triggers notification; **Notify parent** button is hidden OR disabled.                                            |           |

---

## 34. Daily Summary — Cross-Surface Reads

| #    | What to Check                                                                | Expected Result                                                                                                                                                                                               | Pass/Fail |
| ---- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 34.1 | `GET /api/v1/attendance/daily-summaries?student_id={id}&start_date&end_date` | Returns rows per summary date with `derived_status` + `derived_payload` (sessions_total, sessions_present, sessions_absent, sessions_late, sessions_excused, session_details).                                |           |
| 34.2 | `GET /api/v1/attendance/daily-summaries/student/{id}`                        | Paged convenience wrapper. Same payload shape.                                                                                                                                                                |           |
| 34.3 | Daily-summary recalculation                                                  | Triggered by `submitSession` and `amendRecord` for each unique student in the session. Verify by changing one record + observing the summary update within ~1s.                                               |           |
| 34.4 | Summary for a student with no records on a date                              | No row returned (no summary). Downstream consumers (parent digest, gradebook risk) must handle absence of a row gracefully.                                                                                   |           |
| 34.5 | Summary consumers                                                            | `regulatory` + `gradebook` risk detection + `notifications:parent-daily-digest` + `compliance` DSAR all read `daily_attendance_summaries` directly via Prisma. Schema changes cascade — flag in danger zones. |           |

---

## 35. Cross-Module Hand-Offs

| #    | Direction                    | What to Check                                                                                                     | Expected Result                                                                         | Pass/Fail |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| 35.1 | Attendance → Communications  | Save an absent record → parent notification dispatch enqueued on `notifications` queue.                           | Job visible via BullMQ Board (covered in `worker/` spec §16).                           |           |
| 35.2 | Attendance → Early Warning   | Worker detects 3rd consecutive absence → `early-warning:compute-student` enqueued.                                | See `worker/` §11.                                                                      |           |
| 35.3 | Attendance → Regulatory      | Daily summary rows consumed by regulatory module's reporting.                                                     | Regulatory page `/en/regulatory/attendance-summary` shows counts matching summary rows. |           |
| 35.4 | Attendance → Gradebook risk  | Summaries feed `gradebook.detect-risks` job's attendance trigger.                                                 | `worker/` §10 in assessment pack.                                                       |           |
| 35.5 | Attendance → Compliance DSAR | DSAR export for a student includes attendance_records + daily_attendance_summaries.                               | `GET /api/v1/gdpr/subject-access-requests/{id}/export` includes relevant rows.          |           |
| 35.6 | School closures → Attendance | Creating a closure in `/en/scheduling/closures` prevents session generation on that date (session gen job skips). | Covered in `worker/` §6.                                                                |           |
| 35.7 | Configuration → Attendance   | Changing `attendance.defaultPresentEnabled` in settings toggles the **Default present** control in §11.4 and §13. | See `docs/features/attendance.md`.                                                      |           |

---

## 36. School Closure & Academic Year Gating

| #    | What to Check                                                    | Expected Result                                                                                                                                   | Pass/Fail |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 36.1 | Try to create a session on a closed date                         | 409 `CLOSURE_CONFLICT` with name + range. See §11.11.                                                                                             |           |
| 36.2 | Admin re-submits with **Override closure**                       | `POST .../attendance-sessions` with `{ override_closure: true, override_reason: '...' }` → 201. Session created with `override_reason` persisted. |           |
| 36.3 | Override closure without `attendance.override_closure` (officer) | 403.                                                                                                                                              |           |
| 36.4 | Create session outside the class's academic year                 | 400 `OUTSIDE_ACADEMIC_YEAR` with dates.                                                                                                           |           |
| 36.5 | Worker cron skips closure dates                                  | Verified in worker spec §6.1.                                                                                                                     |           |

---

## 37. Negative Assertions — What Admin Must Still NOT Do

Admin has broad power but some actions are still bounded.

| #    | Attempt                                                                          | Expected                                                                         | Pass/Fail |
| ---- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------- |
| 37.1 | Save records on a submitted session (direct API)                                 | 409 `SESSION_NOT_OPEN`.                                                          |           |
| 37.2 | Create a session for a class not owned by current tenant (cross-tenant)          | 404.                                                                             |           |
| 37.3 | Amend a record on an open session                                                | 409 `SESSION_NOT_SUBMITTED_OR_LOCKED`.                                           |           |
| 37.4 | Cancel a submitted session (if contract is open-only)                            | 409 OR allowed — verify.                                                         |           |
| 37.5 | Deep-link `/en/attendance/scan` when `ai_functions` module disabled              | 403 on the POSTs; UI page shows module disabled.                                 |           |
| 37.6 | Acknowledge a pattern alert for a student from Tenant B                          | 404.                                                                             |           |
| 37.7 | Submit a session containing a student_id that is not enrolled in the class       | 400 `STUDENTS_NOT_ENROLLED` with the offending ids.                              |           |
| 37.8 | Admin-in-A passes a Tenant B student_id in a save payload for a Tenant A session | 400 `STUDENTS_NOT_ENROLLED` (enrolment lookup is tenant-scoped). Never persists. |           |

---

## 38. Error, Loading, Empty States

| #    | State                                | Expected                                                                                 | Pass/Fail |
| ---- | ------------------------------------ | ---------------------------------------------------------------------------------------- | --------- |
| 38.1 | Network error on hub load            | Toast red "Failed to load sessions". Skeleton cleared. Retry button in empty state.      |           |
| 38.2 | 500 on save                          | Toast red "Save failed — please try again". Dirty rows kept.                             |           |
| 38.3 | 403 (permission dropped mid-session) | Toast + redirect to dashboard. Do not silently clear unsaved changes without prompt.     |           |
| 38.4 | 404 on mark page                     | Full-page empty state **"Session not found."** with back link.                           |           |
| 38.5 | Large roster (40+ students)          | Virtualised OR paginated. Typing in status input is < 200ms response.                    |           |
| 38.6 | File-upload while offline            | Browser error caught; UI toast red "Network offline — try again". No half-applied state. |           |

---

## 39. Arabic / RTL

| #    | What to Check                       | Expected Result                                                                                                 | Pass/Fail |
| ---- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| 39.1 | Every page under `/ar/attendance/*` | `<html dir="rtl">`. Layout mirrors.                                                                             |           |
| 39.2 | Dates + times                       | Gregorian + Latin digits. No Hijri.                                                                             |           |
| 39.3 | Logical CSS                         | No `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`. Start/end replacements used.                                       |           |
| 39.4 | Icons                               | Arrow icons flip via `rtl:rotate-180` as appropriate (back arrows).                                             |           |
| 39.5 | Status badge text                   | Localised strings (`open` → `مفتوح`, etc.). All 4 statuses have translations.                                   |           |
| 39.6 | Table column order                  | Mirrors: Actions column at visual start, Date at visual end.                                                    |           |
| 39.7 | Free-text reason fields             | `text-start` + `dir="auto"` so Arabic and English input render correctly. Mixed-direction text renders cleanly. |           |

---

## 40. Console & Network Health

| #    | What to Check                 | Expected Result                                                                                 | Pass/Fail |
| ---- | ----------------------------- | ----------------------------------------------------------------------------------------------- | --------- |
| 40.1 | No red console errors         | Zero uncaught errors, zero Reacthydration warnings, zero CSP violations.                        |           |
| 40.2 | Network tab all 2xx or benign | 401 only from deliberate logged-out flows; 404 only from deliberate hostile/cross-tenant tests. |           |
| 40.3 | No `console.log` statements   | Production build strips these.                                                                  |           |
| 40.4 | Sentry breadcrumbs            | If a save fails, Sentry receives a breadcrumb but NOT PII (student names redacted; only ids).   |           |

---

## 41. Mobile Responsiveness (375px)

| #    | What to Check                      | Expected Result                                                                                         | Pass/Fail |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| 41.1 | Hub list at 375px                  | Horizontal scroll on table. Action buttons collapse.                                                    |           |
| 41.2 | Create-session dialog              | Full-screen on small devices OR modal with fluid width.                                                 |           |
| 41.3 | Mark page                          | Student rows stack. Status control buttons are 44×44px touch targets.                                   |           |
| 41.4 | Officer dashboard                  | Filter bar wraps. Each badge row wraps.                                                                 |           |
| 41.5 | Upload page                        | Tabs collapse into a scrollable row. File input full-width.                                             |           |
| 41.6 | Scan page                          | Camera-capture option (if present) uses the mobile camera via `accept="image/*" capture="environment"`. |           |
| 41.7 | No horizontal overflow on any page | `body` scrollX is zero; inspect via DevTools device mode.                                               |           |

---

## 42. Data Invariants

| #     | Invariant                                                                                                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 42.1  | Every `AttendanceSession` belongs to exactly one Class + one date; unique index on `(tenant_id, class_id, schedule_id, session_date)` (or similar — verify).                  |
| 42.2  | A `teacher_staff_id` on a session is nullable (daily-mode sessions when the class has no homeroom teacher assigned).                                                          |
| 42.3  | Session status flows: `open → submitted → locked`; `open → cancelled`. No backward transitions.                                                                               |
| 42.4  | Records can only be created / updated on `open` sessions. `submitted` / `locked` sessions accept only amend.                                                                  |
| 42.5  | Amend on an `open` session is rejected — edit via the normal save path.                                                                                                       |
| 42.6  | Default-present flag is per-session; when true, system creates one `AttendanceRecord` per active enrolment with `marked_by_user_id = '00000000-0000-0000-0000-000000000000'`. |
| 42.7  | `daily_attendance_summaries` unique on `(tenant_id, student_id, summary_date)`.                                                                                               |
| 42.8  | `attendance_pattern_alerts` unique on `(tenant_id, student_id, alert_type, detected_date)` — same-day duplicates silently skipped (P2002).                                    |
| 42.9  | Attendance alert lifecycle: `active → acknowledged → resolved`. Each transition requires `attendance.view_pattern_reports`.                                                   |
| 42.10 | RLS policies on `attendance_sessions`, `attendance_records`, `daily_attendance_summaries`, `attendance_pattern_alerts` all enabled + FORCED.                                  |
| 42.11 | Teacher scope on save/submit: caller without `attendance.take_any_class` must match `session.teacher_staff_id`.                                                               |
| 42.12 | Officer-dashboard query paginates at pageSize ≤ 100 (hard-capped by Zod).                                                                                                     |
| 42.13 | Session generation skips closure dates (any `affects_scope`) AND dates outside the class's academic year.                                                                     |
| 42.14 | Session generation uses JS weekday convention (0=Sunday…6=Saturday) matching `substitution.service.ts` and seed data.                                                         |
| 42.15 | Upload batch has an `undo` path; undo is single-shot (idempotent on re-invocation).                                                                                           |
| 42.16 | Cross-tenant id access on ANY attendance endpoint → 404 / 403, never 200 with cross-tenant data.                                                                              |

---

## 43. Backend Endpoint Map

All gated by `AuthGuard` + `PermissionGuard`; routes under `/v1`.

| #     | Method | Path                                                | Permission                                  | Notes                                                                                         |
| ----- | ------ | --------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 43.1  | POST   | `/v1/attendance-sessions`                           | `attendance.take`                           | Body: createAttendanceSessionSchema. Admin + override_closure branch.                         |
| 43.2  | GET    | `/v1/attendance-sessions`                           | `attendance.view`                           | Query: listSessionsQuerySchema. Filters by `teacher_staff_id` if caller lacks take_any_class. |
| 43.3  | GET    | `/v1/attendance/officer-dashboard`                  | `attendance.take_any_class`                 | Query: officerDashboardQuerySchema. Registered before `:id`.                                  |
| 43.4  | GET    | `/v1/attendance-sessions/:id`                       | `attendance.view`                           | Session detail + records + subject.                                                           |
| 43.5  | PATCH  | `/v1/attendance-sessions/:id/cancel`                | `attendance.manage`                         |                                                                                               |
| 43.6  | PUT    | `/v1/attendance-sessions/:sessionId/records`        | `attendance.take` + teacher-scope           | Body: saveAttendanceRecordsSchema.                                                            |
| 43.7  | PATCH  | `/v1/attendance-sessions/:sessionId/submit`         | `attendance.take` + teacher-scope           |                                                                                               |
| 43.8  | PATCH  | `/v1/attendance-records/:id/amend`                  | `attendance.amend_historical`               | Body: amendAttendanceRecordSchema.                                                            |
| 43.9  | GET    | `/v1/attendance/daily-summaries`                    | `attendance.view`                           | Query: listSummariesQuerySchema.                                                              |
| 43.10 | GET    | `/v1/attendance/daily-summaries/student/:studentId` | `attendance.view`                           |                                                                                               |
| 43.11 | GET    | `/v1/attendance/exceptions`                         | `attendance.manage`                         | Query: exceptionsQuerySchema.                                                                 |
| 43.12 | GET    | `/v1/parent/students/:studentId/attendance`         | `parent.view_attendance`                    | Parent-child link enforced.                                                                   |
| 43.13 | GET    | `/v1/attendance/upload-template`                    | `attendance.manage`                         | CSV stream.                                                                                   |
| 43.14 | POST   | `/v1/attendance/upload`                             | `attendance.manage`                         | Multipart, ≤ 10 MB, xlsx/xls/csv.                                                             |
| 43.15 | POST   | `/v1/attendance/exceptions-upload`                  | `attendance.manage`                         | Body: defaultPresentUploadSchema.                                                             |
| 43.16 | POST   | `/v1/attendance/quick-mark`                         | `attendance.manage`                         | Body: quickMarkSchema.                                                                        |
| 43.17 | POST   | `/v1/attendance/upload/undo`                        | `attendance.manage`                         | Body: uploadUndoSchema.                                                                       |
| 43.18 | POST   | `/v1/attendance/scan`                               | `attendance.manage` + `ai_functions` module | Multipart image.                                                                              |
| 43.19 | POST   | `/v1/attendance/scan/confirm`                       | `attendance.manage` + `ai_functions` module | Body: scanConfirmSchema.                                                                      |
| 43.20 | GET    | `/v1/attendance/pattern-alerts`                     | `attendance.view_pattern_reports`           | Query: listPatternAlertsQuerySchema.                                                          |
| 43.21 | PATCH  | `/v1/attendance/pattern-alerts/:id/acknowledge`     | `attendance.view_pattern_reports`           |                                                                                               |
| 43.22 | PATCH  | `/v1/attendance/pattern-alerts/:id/resolve`         | `attendance.view_pattern_reports`           |                                                                                               |
| 43.23 | POST   | `/v1/attendance/pattern-alerts/:id/notify-parent`   | `attendance.view_pattern_reports`           |                                                                                               |

---

## 44. Observations from Walkthrough

Record each observation as a bullet with: severity (P0 critical / P1 high / P2 medium / P3 info), description, repro steps, and a proposed fix. Examples to watch for:

- Date field showing an ISO string on any list / detail view (this was a regression fixed in commit `5efed767`; verify it stays fixed).
- Subject name missing on per-period rows (same regression).
- Teacher seeing other teachers' sessions (visibility scope).
- Officer dashboard returning 200 for teachers (permission-gate regression).
- `default_present` auto-marking with a user_id other than the sentinel `00000000-0000-0000-0000-000000000000`.
- Cross-tenant data leak on ANY endpoint.
- Session counts (marked / enrolled) off by one due to paging/aggregation bugs.

---

## 45. Sign-Off

| Field         | Value |
| ------------- | ----- |
| Reviewer      |       |
| Date          |       |
| Total Pass    |       |
| Total Fail    |       |
| Blocker count |       |
| Notes         |       |

The admin-view spec is signed off only when every row above is Pass with zero P0 / P1 findings and all P2 findings have a tracked ticket.
