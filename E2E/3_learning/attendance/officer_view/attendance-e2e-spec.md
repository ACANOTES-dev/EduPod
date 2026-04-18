# Attendance Module — Attendance Officer E2E Test Specification

**Module:** Attendance — Officer-scoped surface (list view + officer dashboard + mark page on any class).
**Perspective:** **Attendance Officer** — the `attendance_officer` role_key, staff tier. Holds `attendance.view`, `attendance.take`, `attendance.take_any_class`, `students.view`, `schedule.view_class`. **Does NOT hold** `attendance.manage`, `attendance.amend_historical`, `attendance.override_closure`, `attendance.view_pattern_reports`, any finance / payroll / gradebook keys.
**Why this role exists:** front-office staff who collect attendance across the whole school without being the class teacher. Consolidates exception sheets, processes slip drop-offs, covers teachers who forgot to submit, staffs the front desk during morning roll-call.
**Pages covered:** `/en/attendance`, `/en/attendance/officer`, `/en/attendance/mark/{id}` (for any session).
**Tester audience:** QC engineer OR headless Playwright agent.
**Last Updated:** 2026-04-18

---

## Table of Contents

1. [Prerequisites & Multi-Tenant Test Data](#1-prerequisites--multi-tenant-test-data)
2. [Out of Scope — Sibling Specs](#2-out-of-scope--sibling-specs)
3. [Global Environment Setup](#3-global-environment-setup)
4. [Role Gating — Officer Branch](#4-role-gating--officer-branch)
5. [Hub — Officer View](#5-hub--officer-view)
6. [Hub — Session List (Unscoped View)](#6-hub--session-list-unscoped-view)
7. [Officer Dashboard — Navigation & Gate](#7-officer-dashboard--navigation--gate)
8. [Officer Dashboard — Filters & KPIs](#8-officer-dashboard--filters--kpis)
9. [Officer Dashboard — Triage Flow](#9-officer-dashboard--triage-flow)
10. [Create Session — Officer (Any Class)](#10-create-session--officer-any-class)
11. [Mark Page — Officer Marks Any Session](#11-mark-page--officer-marks-any-session)
12. [Mark Page — Save & Submit (No Teacher-Scope Gate)](#12-mark-page--save--submit-no-teacher-scope-gate)
13. [Default-Present Mode — Officer View](#13-default-present-mode--officer-view)
14. [Cancel — Officer is Blocked](#14-cancel--officer-is-blocked)
15. [Amend — Officer is Blocked](#15-amend--officer-is-blocked)
16. [Exceptions — Officer is Blocked](#16-exceptions--officer-is-blocked)
17. [Upload / Quick-Mark / Scan — Officer is Blocked](#17-upload--quick-mark--scan--officer-is-blocked)
18. [Pattern Alerts — Officer is Blocked](#18-pattern-alerts--officer-is-blocked)
19. [Override Closure — Officer is Blocked](#19-override-closure--officer-is-blocked)
20. [Cross-Tenant Hostile Attempts](#20-cross-tenant-hostile-attempts)
21. [Officer-vs-Teacher Race Scenarios](#21-officer-vs-teacher-race-scenarios)
22. [Data Invariants — Officer Scope](#22-data-invariants--officer-scope)
23. [Error, Loading, Empty States](#23-error-loading-empty-states)
24. [Arabic / RTL](#24-arabic--rtl)
25. [Console & Network Health](#25-console--network-health)
26. [Mobile Responsiveness (375px)](#26-mobile-responsiveness-375px)
27. [Backend Endpoint Map — Officer](#27-backend-endpoint-map--officer)
28. [Observations from Walkthrough](#28-observations-from-walkthrough)
29. [Sign-Off](#29-sign-off)

---

## 1. Prerequisites & Multi-Tenant Test Data

### Tenant A — `nhqs`

- **User:** `officer@nhqs.test` / `Password123!`. Role: `attendance_officer` (staff tier).
- **Staff profile:** Officer is linked to a `StaffProfile` row. This is informational — officer's teacher-scope check is lifted because they hold `attendance.take_any_class`.
- **Sessions (test date):** ≥ 20 sessions across ≥ 4 different teachers' allocations — mix of statuses (open, submitted, locked). At least 5 unmarked open sessions.
- **Patterns to verify:**
  - Unmarked open sessions that the teacher has not touched since auto-generation (for officer triage flow).
  - Already-submitted sessions (officer should see them but no action possible).
  - A cancelled session (officer sees the cancel badge but cannot re-open).

### Tenant B — `demo-b`

- Minimal — one officer + one session for cross-tenant hostile tests.

---

## 2. Out of Scope — Sibling Specs

- Admin view → `admin_view/`.
- Teacher own-session-only view → `teacher_view/`.
- API contract + RLS matrix → `integration/`.
- BullMQ + cron → `worker/`.
- Latency → `perf/`.
- OWASP + IDOR → `security/`.
- Parent view → `parent_view/`.

---

## 3. Global Environment Setup

| #   | What to Check             | Expected                                                                                                                                                                                              | Pass/Fail |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | Login `officer@nhqs.test` | `POST /api/v1/auth/login` → 200. Access token in memory.                                                                                                                                              |           |
| 3.2 | JWT claims                | `role_keys: ['attendance_officer']`. Permissions include `attendance.view`, `attendance.take`, `attendance.take_any_class`, `students.view`, `schedule.view_class`. **Not** `attendance.manage`, etc. |           |
| 3.3 | Landing URL               | `/en/dashboard` (staff variant). If a dedicated officer landing exists, verify.                                                                                                                       |           |
| 3.4 | Browser console           | Zero errors.                                                                                                                                                                                          |           |
| 3.5 | Toggle Arabic / English   | Works.                                                                                                                                                                                                |           |

---

## 4. Role Gating — Officer Branch

| #   | What to Check                                   | Expected Result                                                                                                          | Pass/Fail |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 4.1 | `/en/attendance` as officer                     | Hub renders. Session list returns ALL tenant sessions (officer has `take_any_class`). **Officer dashboard** CTA visible. |           |
| 4.2 | `/en/attendance/officer` as officer             | Officer dashboard loads. Not blocked by the front-end role-gate (OFFICER_ROLE_KEYS includes `attendance_officer`).       |           |
| 4.3 | `/en/attendance/mark/{anySessionId}` as officer | Mark page renders. Save + Submit buttons are active regardless of which teacher owns the session.                        |           |
| 4.4 | `/en/attendance/exceptions` as officer          | 403 on the backend (lacks `attendance.manage`). UI shows access-denied.                                                  |           |
| 4.5 | `/en/attendance/scan` as officer                | 403 on the POSTs (manage+module). UI shows access-denied or module-disabled page.                                        |           |
| 4.6 | `/en/attendance/upload` as officer              | 403 on the POSTs. Verify if the UI gates the link or not.                                                                |           |
| 4.7 | Deep-link a pattern-alerts page                 | 403.                                                                                                                     |           |

---

## 5. Hub — Officer View

| #   | What to Check             | Expected                                                                                                                     | Pass/Fail |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Morph bar 9 hubs          | Officer sees the Learning hub sub-strip; Attendance link lights up.                                                          |           |
| 5.2 | Page header `<h1>`        | **"Attendance"**.                                                                                                            |           |
| 5.3 | Action buttons            | **Officer dashboard** (outline, visible), **Upload attendance** (outline — but clicking 403s), **Create session** (primary). |           |
| 5.4 | **Officer dashboard** CTA | Visible (officer is in OFFICER_ROLE_KEYS). Clicking navigates to `/en/attendance/officer`.                                   |           |
| 5.5 | **Create session** button | Visible. Dialog workflow in §10.                                                                                             |           |

---

## 6. Hub — Session List (Unscoped View)

| #   | What to Check                                | Expected                                                                                                                       | Pass/Fail |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 6.1 | `GET /api/v1/attendance-sessions` as officer | Returns ALL tenant sessions. `staffProfileId = undefined` passed to service because officer holds `attendance.take_any_class`. |           |
| 6.2 | Row count                                    | Matches tenant-wide count (NOT just officer's own allocations — officer has no own allocations).                               |           |
| 6.3 | Rows visible across all teachers             | Sessions for T1, T2, T3, T4 all appear.                                                                                        |           |
| 6.4 | **Mark attendance** button on open sessions  | Visible. Navigates to the mark page.                                                                                           |           |
| 6.5 | Submitted / locked rows                      | No Mark button.                                                                                                                |           |
| 6.6 | Filter by class                              | Shows all sessions for that class across all teachers.                                                                         |           |
| 6.7 | Filter by teacher (via URL param)            | List endpoint does not support filter by teacher_staff_id (admin/officer dashboard does). Verify actual.                       |           |
| 6.8 | Tenant isolation                             | All rows from Tenant A only.                                                                                                   |           |

---

## 7. Officer Dashboard — Navigation & Gate

**URL:** `/en/attendance/officer`

| #   | What to Check                                   | Expected                                                            | Pass/Fail |
| --- | ----------------------------------------------- | ------------------------------------------------------------------- | --------- |
| 7.1 | Click **Officer dashboard** from hub            | Navigates. Skeleton ~500ms. Content renders.                        |           |
| 7.2 | Fresh deep-link                                 | Same.                                                               |           |
| 7.3 | `GET /api/v1/attendance/officer-dashboard` call | 200 with sessions for the selected date.                            |           |
| 7.4 | Backend permission                              | `@RequiresPermission('attendance.take_any_class')`. Officer passes. |           |
| 7.5 | Unauthenticated                                 | Redirect to login.                                                  |           |

---

## 8. Officer Dashboard — Filters & KPIs

| #    | What to Check             | Expected                                                                                                                 | Pass/Fail |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 8.1  | Default date              | Today (UTC).                                                                                                             |           |
| 8.2  | KPI badges                | **Open sessions** count (neutral tone) + **Unmarked** count (warning if > 0).                                            |           |
| 8.3  | KPIs accurate             | Open = rows with status=open. Unmarked = rows with record_count=0.                                                       |           |
| 8.4  | Date picker               | Changes refetch. Past dates show historic sessions.                                                                      |           |
| 8.5  | Status filter             | Default `open`. Options open/submitted/locked/cancelled/all.                                                             |           |
| 8.6  | Year group filter         | Options from `/api/v1/year-groups`. Filters on backend.                                                                  |           |
| 8.7  | Class filter              | Options from `/api/v1/classes?pageSize=100`. Filters backend.                                                            |           |
| 8.8  | Combine filters           | Request URL includes all chosen params. Result correct.                                                                  |           |
| 8.9  | `teacher_staff_id` filter | Backend supports it; UI may or may not expose. If exposed, verify result scopes to that teacher's sessions (any status). |           |
| 8.10 | pageSize cap              | Hard-cap at 100. Sending 200 → server returns 100.                                                                       |           |
| 8.11 | Row content               | Class + year group + teacher first/last + schedule start-end + record_count + enrolled_count + subject.                  |           |
| 8.12 | Sort                      | Backend sorts by schedule start time then class name.                                                                    |           |
| 8.13 | Empty state               | "No sessions on this date".                                                                                              |           |

---

## 9. Officer Dashboard — Triage Flow

Typical use case: officer scans for unmarked sessions near end-of-day and marks them on behalf of absent teachers.

| #   | Flow step                             | Expected                                                                                                                            | Pass/Fail |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | Filter: status=open, class=(All)      | List of open sessions surfaces.                                                                                                     |           |
| 9.2 | Sort by unmarked first                | If UI exposes sort, unmarked rows float up. Otherwise backend order by schedule start.                                              |           |
| 9.3 | Click an unmarked row                 | Navigates to `/en/attendance/mark/{id}`.                                                                                            |           |
| 9.4 | Officer marks all absent students     | Save succeeds (take_any_class lifts the teacher-scope check).                                                                       |           |
| 9.5 | Officer submits                       | 200. Session flips to submitted. Back on dashboard, row drops under `status=submitted`.                                             |           |
| 9.6 | Officer marks on behalf of teacher T1 | Audit: `marked_by_user_id = officer.user_id`, `submitted_by_user_id = officer.user_id`. NOT T1's id.                                |           |
| 9.7 | Officer's audit log rows              | Auditable trail attributed to officer. `AuditLogInterceptor` should create an `ATTENDANCE_SESSION_SUBMITTED` entry.                 |           |
| 9.8 | Teacher T1 logs in later              | T1's own-sessions list shows the session as submitted (by officer). Teacher cannot re-open. If needed, admin amends on T1's behalf. |           |

---

## 10. Create Session — Officer (Any Class)

| #    | What to Check                                                               | Expected                                                                                                                                                   | Pass/Fail |
| ---- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Click **Create session** on hub                                             | Dialog opens.                                                                                                                                              |           |
| 10.2 | Submit with any class (including one not taught by officer)                 | 201. Backend service does not enforce teacher-scope on create for `take_any_class` callers. `teacher_staff_id` set from schedule if one exists, else null. |           |
| 10.3 | Submit on a school closure date                                             | 409 `CLOSURE_CONFLICT`. **No override option for officer** (lacks `attendance.override_closure`).                                                          |           |
| 10.4 | Submit for a date outside the class's academic year                         | 400 `OUTSIDE_ACADEMIC_YEAR`.                                                                                                                               |           |
| 10.5 | Submit for a (class, date) pair that already has a session (auto-generated) | 409 `SESSION_ALREADY_EXISTS`. UI offers "Open existing".                                                                                                   |           |
| 10.6 | Manual create with `default_present: true`                                  | Tenant setting gate applies. If enabled, pre-populates records as system (marked_by_user_id = sentinel).                                                   |           |

---

## 11. Mark Page — Officer Marks Any Session

**URL:** `/en/attendance/mark/{sessionId}` for any session in tenant.

| #    | What to Check                                   | Expected                                                                                                      | Pass/Fail |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Open a T1-owned session                         | 200. Page renders with roster.                                                                                |           |
| 11.2 | Save + Submit buttons are active                | Yes. `resolveTeacherScope` returns null for officer → service skips `session.teacher_staff_id` check.         |           |
| 11.3 | Open a session with no teacher_staff_id (daily) | 200. Officer can still save + submit.                                                                         |           |
| 11.4 | Header subtitle                                 | Same formatter as admin + teacher. Date formatted (not raw ISO). Per-period subtitle includes subject + time. |           |
| 11.5 | Roster                                          | All active enrolments for that class.                                                                         |           |

---

## 12. Mark Page — Save & Submit (No Teacher-Scope Gate)

| #     | What to Check                         | Expected                                                                                                                                                                                                                             | Pass/Fail |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 12.1  | Save with 1 dirty row on T1's session | 200. Records persist. `marked_by_user_id = officer.user_id`.                                                                                                                                                                         |           |
| 12.2  | Submit T1's session                   | 200. `submitted_by_user_id = officer.user_id`, `submitted_at = now`. DailySummaryService.recalculate fires per student.                                                                                                              |           |
| 12.3  | Parent notifications fire             | For non-present records, `AttendanceParentNotificationService.triggerAbsenceNotification` enqueues. Attribution in the notification payload is the officer (not T1). Verify message wording respects this — see `parent_view/` spec. |           |
| 12.4  | Save on a cancelled session           | 409 `SESSION_NOT_OPEN`.                                                                                                                                                                                                              |           |
| 12.5  | Save on a submitted session           | 409 `SESSION_NOT_OPEN`. To amend, officer must ask admin — officer lacks `attendance.amend_historical`.                                                                                                                              |           |
| 12.6  | Save with student not enrolled        | 400 `STUDENTS_NOT_ENROLLED`.                                                                                                                                                                                                         |           |
| 12.7  | Submit an empty session (no records)  | Allowed per contract. Daily summaries recalculated for all students. Verify.                                                                                                                                                         |           |
| 12.8  | Attribution                           | `marked_by_user_id` on created records = officer.user_id (not T1's or the system sentinel). Audit log entry attributed to officer.                                                                                                   |           |
| 12.9  | Idempotency                           | Second save with same payload is a no-op update.                                                                                                                                                                                     |           |
| 12.10 | Rate-limit check (if any)             | Rapid consecutive save clicks debounced. No double-fire. See `security/` for DoS tests.                                                                                                                                              |           |

---

## 13. Default-Present Mode — Officer View

| #    | What to Check                                           | Expected                                                                             | Pass/Fail |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- |
| 13.1 | Open a session auto-generated with default_present=true | All students pre-marked Present, Auto-marked badge.                                  |           |
| 13.2 | Officer flips students to Absent and saves              | Rows update; `marked_by_user_id` becomes officer.user_id.                            |           |
| 13.3 | Manually create a session with default_present          | If tenant setting enabled, the option is available in the dialog.                    |           |
| 13.4 | Check who sees the auto-marked badge                    | Anyone viewing the session. Badge indicates system-generated record vs human-marked. |           |

---

## 14. Cancel — Officer is Blocked

| #    | Attempt                                                  | Expected                           | Pass/Fail |
| ---- | -------------------------------------------------------- | ---------------------------------- | --------- |
| 14.1 | Call `PATCH /attendance-sessions/{id}/cancel` as officer | 403 — `attendance.manage` missing. |           |
| 14.2 | UI surfaces a Cancel button                              | Must NOT.                          |           |

---

## 15. Amend — Officer is Blocked

| #    | Attempt                                                | Expected                                                                                                       | Pass/Fail |
| ---- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1 | Call `PATCH /attendance-records/{id}/amend` as officer | 403 — `attendance.amend_historical` missing.                                                                   |           |
| 15.2 | Any UI Amend button                                    | Must NOT.                                                                                                      |           |
| 15.3 | Need-to-amend scenario                                 | Officer must ask an admin. Document in on-screen hint next to submitted records: "To amend, contact an admin." |           |

---

## 16. Exceptions — Officer is Blocked

| #    | Attempt                                        | Expected                   | Pass/Fail |
| ---- | ---------------------------------------------- | -------------------------- | --------- |
| 16.1 | `GET /api/v1/attendance/exceptions` as officer | 403.                       |           |
| 16.2 | Deep-link `/en/attendance/exceptions`          | 403 state / access-denied. |           |

---

## 17. Upload / Quick-Mark / Scan — Officer is Blocked

| #    | Attempt                                                   | Expected | Pass/Fail |
| ---- | --------------------------------------------------------- | -------- | --------- |
| 17.1 | `POST /api/v1/attendance/upload` as officer               | 403.     |           |
| 17.2 | `POST /api/v1/attendance/exceptions-upload`               | 403.     |           |
| 17.3 | `POST /api/v1/attendance/quick-mark`                      | 403.     |           |
| 17.4 | `POST /api/v1/attendance/upload/undo`                     | 403.     |           |
| 17.5 | `POST /api/v1/attendance/scan`                            | 403.     |           |
| 17.6 | `POST /api/v1/attendance/scan/confirm`                    | 403.     |           |
| 17.7 | `GET /api/v1/attendance/upload-template?session_date=...` | 403.     |           |

---

## 18. Pattern Alerts — Officer is Blocked

| #    | Attempt                                              | Expected         | Pass/Fail |
| ---- | ---------------------------------------------------- | ---------------- | --------- |
| 18.1 | `GET /api/v1/attendance/pattern-alerts`              | 403.             |           |
| 18.2 | Acknowledge / Resolve / Notify endpoints             | 403.             |           |
| 18.3 | UI on hub: pattern-alerts banner visible to officer? | **Not visible.** |           |

---

## 19. Override Closure — Officer is Blocked

| #    | Attempt                                                                      | Expected                                         | Pass/Fail |
| ---- | ---------------------------------------------------------------------------- | ------------------------------------------------ | --------- |
| 19.1 | `POST /attendance-sessions` with `override_closure: true` for a closure date | 403 on the override branch. Session NOT created. |           |
| 19.2 | UI **Override closure** affordance                                           | Must NOT appear in the officer's create dialog.  |           |

---

## 20. Cross-Tenant Hostile Attempts

| #    | Attempt (officer in Tenant A, Tenant B id)                          | Expected                       | Pass/Fail |
| ---- | ------------------------------------------------------------------- | ------------------------------ | --------- |
| 20.1 | `GET /api/v1/attendance-sessions/{sessionB.id}`                     | 404.                           |           |
| 20.2 | `PUT /api/v1/attendance-sessions/{sessionB.id}/records`             | 404 / 403.                     |           |
| 20.3 | `PATCH /api/v1/attendance-sessions/{sessionB.id}/submit`            | Same.                          |           |
| 20.4 | `GET /api/v1/attendance/officer-dashboard?...&class_id={classB.id}` | Empty result (filter ignored). |           |
| 20.5 | Any Tenant B id                                                     | No cross-leak.                 |           |

---

## 21. Officer-vs-Teacher Race Scenarios

| #    | Scenario                                                         | Expected                                                                                                                                          | Pass/Fail |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.1 | Teacher T1 and officer both open the mark page for T1's session. | Both see open state.                                                                                                                              |           |
| 21.2 | T1 saves. Officer saves after.                                   | Officer's save overwrites the fields T1 updated (last-write-wins) for shared students. marked_by_user_id reflects officer on those rows.          |           |
| 21.3 | T1 submits. Officer then clicks submit.                          | Officer 409 `SESSION_NOT_OPEN`.                                                                                                                   |           |
| 21.4 | Officer submits. T1 then clicks save.                            | T1 gets 409. UI shows "Submitted by another user" banner with officer attribution.                                                                |           |
| 21.5 | Parent notification deduplication                                | If both T1 and officer save non-present records for same student in same save window, ensure no duplicate parent notifications fire (idempotent). |           |

---

## 22. Data Invariants — Officer Scope

| #    | Invariant                                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| 22.1 | Officer's `GET /attendance-sessions` returns all tenant sessions (no teacher_staff_id filter).                               |
| 22.2 | Officer's save/submit on any tenant session is accepted without teacher-scope error.                                         |
| 22.3 | Officer cannot cancel / amend / override closure / access exceptions, pattern-alerts, upload, or scan.                       |
| 22.4 | `marked_by_user_id` on any officer-authored record = officer.user_id. NEVER the system sentinel and NEVER another user's id. |
| 22.5 | Audit log row attribution follows `marked_by_user_id` for records and `submitted_by_user_id` for sessions.                   |
| 22.6 | Cross-tenant ids are rejected via tenant-scoped findFirst → 404.                                                             |
| 22.7 | Officer CANNOT appear as `teacher_staff_id` on a session (unless they also have a staff allocation bound separately).        |

---

## 23. Error, Loading, Empty States

| #    | State                                | Expected                                                                             | Pass/Fail |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------ | --------- |
| 23.1 | Officer dashboard with zero unmarked | Green success banner + Empty state "All sessions have records."                      |           |
| 23.2 | Network error                        | Red toast + retry button.                                                            |           |
| 23.3 | 403 on blocked endpoint              | Backend returns `{ error: { code, message } }`. UI shows toast + access-denied view. |           |
| 23.4 | 500 on save                          | Red toast. Dirty state retained.                                                     |           |

---

## 24. Arabic / RTL

| #    | What to Check                        | Expected                                                       | Pass/Fail |
| ---- | ------------------------------------ | -------------------------------------------------------------- | --------- |
| 24.1 | `/ar/attendance/officer` renders RTL | `<html dir="rtl">`. Filter bar mirrors.                        |           |
| 24.2 | Status badge labels translated       | All 4 states (open/submitted/locked/cancelled) have ar locale. |           |
| 24.3 | Teacher name column                  | First+last ordering follows Arabic name conventions.           |           |
| 24.4 | Time window                          | Stays LTR (e.g. `08:45–10:00`).                                |           |

---

## 25. Console & Network Health

| #    | What to Check                              | Expected                                         | Pass/Fail |
| ---- | ------------------------------------------ | ------------------------------------------------ | --------- |
| 25.1 | Zero red console errors                    | Yes.                                             |           |
| 25.2 | All officer requests 2xx / 4xx as expected | 403 only on deliberate negative tests.           |           |
| 25.3 | Response body 403 shape                    | `{ error: { code, message } }`. No stack traces. |           |

---

## 26. Mobile Responsiveness (375px)

| #    | What to Check              | Expected                                                            | Pass/Fail |
| ---- | -------------------------- | ------------------------------------------------------------------- | --------- |
| 26.1 | Officer dashboard at 375px | Filters wrap. Rows become stacked cards or horizontal-scroll table. |           |
| 26.2 | Badges                     | Visible, not clipped.                                               |           |
| 26.3 | Mark page at 375px         | Same as teacher spec §32.                                           |           |

---

## 27. Backend Endpoint Map — Officer

| #    | Method | Path                                                | Result                      |
| ---- | ------ | --------------------------------------------------- | --------------------------- |
| 27.1 | GET    | `/v1/attendance-sessions`                           | 200 — all tenant sessions.  |
| 27.2 | GET    | `/v1/attendance/officer-dashboard`                  | 200.                        |
| 27.3 | GET    | `/v1/attendance-sessions/:id`                       | 200 for any tenant session. |
| 27.4 | POST   | `/v1/attendance-sessions`                           | 201 on any class in tenant. |
| 27.5 | PUT    | `/v1/attendance-sessions/:sessionId/records`        | 200.                        |
| 27.6 | PATCH  | `/v1/attendance-sessions/:sessionId/submit`         | 200.                        |
| 27.7 | GET    | `/v1/attendance/daily-summaries`                    | 200.                        |
| 27.8 | GET    | `/v1/attendance/daily-summaries/student/:studentId` | 200 / 404.                  |

All others return 403 for officer.

---

## 28. Observations from Walkthrough

Seed watchpoints:

- **O-OV1 (P2)**: `/en/attendance/upload` link rendered but 403s on click — consider gating the link on `attendance.manage`.
- **O-OV2 (P2)**: "Unmarked" badge on officer dashboard may double-count if record-count aggregation races with concurrent saves. Verify aggregation strategy.
- **O-OV3 (P3)**: No attribution label on the submitted badge when officer submitted on a teacher's behalf. Consider surfacing "Submitted by Aisha Officer" on the mark page subtitle.
- **O-OV4 (P3)**: Officer role has `students.view` — they can see the full student directory. May be broader than necessary for the attendance flow (they really only need to see students in the class they're currently marking). Scope review candidate.
- **O-OV5 (P2)**: Officer has no way to "un-submit" a session that they submitted by mistake. Requires admin amend workflow.
- **O-OV6 (P3)**: Officer could accidentally submit a partially-marked session. Consider a "X of Y students marked — are you sure?" confirmation if <80% coverage.

---

## 29. Sign-Off

| Field         | Value |
| ------------- | ----- |
| Reviewer      |       |
| Date          |       |
| Total Pass    |       |
| Total Fail    |       |
| Blocker count |       |
| Notes         |       |

Officer spec is signed off only when every row above is Pass with zero P0 / P1 findings. The "blocked from manage/amend/override" boundary is a release blocker: any single Fail there is P0.
