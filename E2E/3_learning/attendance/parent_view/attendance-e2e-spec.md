# Attendance Module — Parent E2E Test Specification

**Module:** Attendance — Parent-scoped view of child attendance + absence notifications.
**Perspective:** **Parent** — user with `parent.view_attendance`, `parent.view_own_students`. NO `attendance.*` school-staff permissions. Scoping is enforced through the `student_parents` relation, not through tenant-wide visibility.
**Pages covered:** Parent-facing surfaces only — `/en/dashboard/parent` (attendance section) + `/en/students/{childId}` (attendance tab, parent variant) + `/en/announcements` (absence notification feed). Direct `/en/attendance/*` school routes must all block.
**Tester audience:** QC engineer OR headless Playwright agent.
**Last Updated:** 2026-04-18

---

## Table of Contents

1. [Prerequisites & Multi-Tenant Test Data](#1-prerequisites--multi-tenant-test-data)
2. [Out of Scope — Sibling Specs](#2-out-of-scope--sibling-specs)
3. [Global Environment Setup](#3-global-environment-setup)
4. [Role Gating — Parent Branch](#4-role-gating--parent-branch)
5. [Parent Dashboard — Attendance Section](#5-parent-dashboard--attendance-section)
6. [Child Profile — Attendance Tab](#6-child-profile--attendance-tab)
7. [Daily Summary — Parent Read](#7-daily-summary--parent-read)
8. [Multi-Child Parent Flow](#8-multi-child-parent-flow)
9. [Absence Notification — Inbox / Announcement Feed](#9-absence-notification--inbox--announcement-feed)
10. [Absence Notification — Delivery Channel (Email / SMS)](#10-absence-notification--delivery-channel-email--sms)
11. [Pattern Alert — Parent Notification (auto / manual)](#11-pattern-alert--parent-notification-auto--manual)
12. [Parent Communication Preferences](#12-parent-communication-preferences)
13. [Parent — Never Sees Other Children](#13-parent--never-sees-other-children)
14. [Parent — All School Attendance Routes Blocked](#14-parent--all-school-attendance-routes-blocked)
15. [Cross-Tenant Hostile Attempts](#15-cross-tenant-hostile-attempts)
16. [Data Invariants — Parent Scope](#16-data-invariants--parent-scope)
17. [Error, Loading, Empty States](#17-error-loading-empty-states)
18. [Arabic / RTL](#18-arabic--rtl)
19. [Console & Network Health](#19-console--network-health)
20. [Mobile Responsiveness (375px)](#20-mobile-responsiveness-375px)
21. [Backend Endpoint Map — Parent](#21-backend-endpoint-map--parent)
22. [Observations from Walkthrough](#22-observations-from-walkthrough)
23. [Sign-Off](#23-sign-off)

---

## 1. Prerequisites & Multi-Tenant Test Data

### Tenant A — `nhqs`

- **User:** `parent@nhqs.test` / `Password123!`. Role: `parent`. Permissions include `parent.view_attendance`, `parent.view_own_students`, `parent.view_announcements`.
- **Linked children:** ≥ 2 `student_parents` rows linking this parent to 2 students (S1, S2) in different classes / year groups.
- **Another parent:** `parent-other@nhqs.test` — linked to a DIFFERENT student (S3). Used for cross-parent isolation.
- **Attendance data for S1:**
  - Today: S1 is marked absent_unexcused in 1 session (triggers absence notification).
  - Last 14 days: mix of present + late + one excused-absence + one recurring Monday absence → pattern alert candidate.
  - ≥ 14 `DailyAttendanceSummary` rows.
- **Attendance data for S2:** perfect attendance, 14 days of summaries = all present.
- **Pattern alert:** an active `AttendancePatternAlert` of type `recurring_day` for S1, already with `parent_notified = true`, acknowledged.
- **Communication preferences:** parent has opted-in to Email + In-app for `attendance_absence` category; opted out of SMS.
- **Teacher-side absence save triggers notification pipeline to fire** — ensure `AttendanceParentNotificationService` and `NotificationDispatchService` are wired and settings are on.

### Tenant B — `demo-b`

- Seed one parent + one student for cross-tenant hostile tests. Capture `studentB.id` + `summaryB.id`.

---

## 2. Out of Scope — Sibling Specs

- School-staff attendance workflows → `admin_view/`, `teacher_view/`, `officer_view/`.
- Full API contract + RLS matrix → `integration/`.
- BullMQ + cron + notification dispatch internals → `worker/`.
- Latency budgets for parent reads → `perf/`.
- OWASP / IDOR / CSRF for parent surface → `security/`.
- Student view: **students have zero attendance visibility by design** — tested as a permission-matrix row in `security/`.

---

## 3. Global Environment Setup

| #   | What to Check            | Expected                                                                                                                                                                        | Pass/Fail |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | Login `parent@nhqs.test` | 200. Access token in memory. Refresh token in httpOnly cookie.                                                                                                                  |           |
| 3.2 | JWT claims               | `role_keys` = `['parent']`. Permissions include `parent.view_attendance`, `parent.view_announcements`, `parent.view_own_students`. **Not any `attendance.*` admin/staff keys.** |           |
| 3.3 | Landing URL              | `/en/dashboard/parent` (parent portal variant) OR `/en/dashboard` with the parent shell. Verify.                                                                                |           |
| 3.4 | Browser console          | Zero errors.                                                                                                                                                                    |           |
| 3.5 | Toggle Arabic / English  | Works. `<html dir="rtl">` in Arabic.                                                                                                                                            |           |

---

## 4. Role Gating — Parent Branch

| #   | What to Check                             | Expected                                                                                                                        | Pass/Fail |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | Parent hits `/en/dashboard/parent`        | Parent shell renders. Hubs relevant to parents: My Children, Attendance (read-only), Grades, Finance, Announcements, Inquiries. |           |
| 4.2 | Parent hits `/en/attendance`              | Redirect to `/en/dashboard` OR 403 full-page. Parent has no `attendance.view` — admin endpoint rejects.                         |           |
| 4.3 | Parent hits `/en/attendance/mark/{anyId}` | 403 / access-denied.                                                                                                            |           |
| 4.4 | Parent hits `/en/attendance/officer`      | 403 / access-denied.                                                                                                            |           |
| 4.5 | Parent hits `/en/attendance/exceptions`   | 403.                                                                                                                            |           |
| 4.6 | Parent hits `/en/attendance/upload`       | 403.                                                                                                                            |           |
| 4.7 | Parent hits `/en/attendance/scan`         | 403.                                                                                                                            |           |
| 4.8 | Unauthenticated deep-link                 | Redirect to login.                                                                                                              |           |

---

## 5. Parent Dashboard — Attendance Section

| #   | What to Check                  | Expected                                                                                                         | Pass/Fail |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Parent dashboard loads         | Multi-child selector at top; attendance card per child showing last 7 days summary.                              |           |
| 5.2 | Attendance card content for S1 | Badge: "1 absence this week" (warning tone). Count of days present / absent / late.                              |           |
| 5.3 | Attendance card content for S2 | Badge: "Perfect attendance" (success tone).                                                                      |           |
| 5.4 | Data source                    | `GET /api/v1/parent/students/{S1.id}/attendance?start_date=today-6&end_date=today` and similar for S2. Both 200. |           |
| 5.5 | Each card is a link            | Clicking navigates to `/en/students/{id}` with the Attendance tab active.                                        |           |
| 5.6 | Tenant isolation               | Every child shown belongs to this parent in Tenant A. No child from Tenant B appears.                            |           |

---

## 6. Child Profile — Attendance Tab

**URL:** `/en/students/{childId}` → Attendance tab.

| #    | What to Check                                                 | Expected                                                                                                                                                       | Pass/Fail |
| ---- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1  | Navigate to S1's profile → Attendance tab                     | Tab header shows "Attendance". Loads summary + daily detail.                                                                                                   |           |
| 6.2  | Date range picker                                             | Defaults to last 30 days. Custom range supported (max 90 days soft-cap).                                                                                       |           |
| 6.3  | Fetch                                                         | `GET /api/v1/parent/students/{S1.id}/attendance?start_date&end_date` → 200 with `data.summaries[]` (or similar) + `data.records[]`.                            |           |
| 6.4  | Summary strip                                                 | Counts: Present / Absent / Late / Excused / Partial. Percentages.                                                                                              |           |
| 6.5  | Daily list                                                    | Rows per day with `derived_status` + per-session breakdown (class, subject, status).                                                                           |           |
| 6.6  | Absence reason visibility                                     | Parent sees the reason text if `reason` is present. Verify — reason text is not PII-sensitive but may contain notes teacher wrote. Document actual visibility. |           |
| 6.7  | Navigate to S2's profile → Attendance tab                     | Full-present summary. Zero absences.                                                                                                                           |           |
| 6.8  | Attempt to navigate to `/en/students/{S3.id}` (not own child) | 403 OR 404 — `parent.view_own_students` check rejects. No PII leak on S3.                                                                                      |           |
| 6.9  | Arabic locale                                                 | Column headers translated. Dates Gregorian + Latin digits.                                                                                                     |           |
| 6.10 | Mobile                                                        | Tab content stacks; horizontal scroll for breakdown table.                                                                                                     |           |

---

## 7. Daily Summary — Parent Read

Parent calls `GET /api/v1/parent/students/{studentId}/attendance` — the only parent-side attendance endpoint.

| #   | What to Check                             | Expected                                                                                                                                                     | Pass/Fail        |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------ | ---- | --------- | --- |
| 7.1 | Default query (no dates)                  | Returns last 30 days of summaries + records for the child.                                                                                                   |                  |
| 7.2 | Explicit date range                       | Respects `start_date` + `end_date`.                                                                                                                          |                  |
| 7.3 | Invalid date range (start > end)          | 400 or empty result set. Document.                                                                                                                           |                  |
| 7.4 | Foreign studentId (not a child of caller) | 403 or 404. Service enforces parent-child relation via `student_parents` join.                                                                               |                  |
| 7.5 | Cross-tenant student id                   | 404.                                                                                                                                                         |                  |
| 7.6 | Response shape                            | `{ data: [...] }` with per-day rows or a structured `{ summaries: [...], records: [...] }`. Verify service contract.                                         |                  |
| 7.7 | Derived status integrity                  | Every `derived_status` is one of `present                                                                                                                    | partially_absent | absent | late | excused`. |     |
| 7.8 | No cross-child leak                       | Only S1's data in S1 response. Never S3's.                                                                                                                   |                  |
| 7.9 | Record-level visibility                   | Parent sees class + subject names, session time, teacher name (or redacted initial), status, reason, arrival_time. No `marked_by_user_id` or audit metadata. |                  |

---

## 8. Multi-Child Parent Flow

| #   | What to Check                        | Expected                                                                                                   | Pass/Fail |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Dashboard shows multi-child selector | Switch between S1 and S2 without reload.                                                                   |           |
| 8.2 | Selector updates attendance card     | Switching to S2 refreshes the card's 7-day summary.                                                        |           |
| 8.3 | Deep-linking preserves selection     | `/en/dashboard/parent?child={S1.id}` (if supported) lands with S1 selected.                                |           |
| 8.4 | Dropped child (relationship removed) | If `student_parents` row deleted, the child no longer shows in selector. Dashboard re-fetches on next nav. |           |

---

## 9. Absence Notification — Inbox / Announcement Feed

| #   | What to Check                                                     | Expected                                                                                                                                                                                                                          | Pass/Fail |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | Teacher marks S1 absent today, saves, session submits             | Backend pipeline: `AttendanceParentNotificationService.triggerAbsenceNotification` → `NotificationDispatchService`. A notification record appears in the parent's in-app inbox within ~30s.                                       |           |
| 9.2 | Inbox / announcements page shows the notification                 | Route `/en/announcements` or `/en/inbox`. Parent sees: "Absence: {S1 name} was marked absent on {date} in {class.name} — {subject}."                                                                                              |           |
| 9.3 | Notification links to child's attendance tab                      | Click → `/en/students/{S1.id}?tab=attendance`.                                                                                                                                                                                    |           |
| 9.4 | Dedup: multiple absences same day                                 | If S1 is absent in 3 periods today, parent receives a digest OR 3 separate notifications. Document which. Spec should ensure no infinite loop / duplicate fires.                                                                  |           |
| 9.5 | Saving the same record twice does NOT re-notify                   | Service idempotency. Verify by resaving + checking inbox count doesn't increment.                                                                                                                                                 |           |
| 9.6 | Notification respects opt-out                                     | If parent has opted out of email for `attendance_absence`, no email sent. In-app still shows (unless opted out there too). Managed in `/en/profile/communications`.                                                               |           |
| 9.7 | Amend (present → absent) after submit triggers retro-notification | Verify spec contract — some modules suppress retro-notifications; attendance module's behaviour must be documented. Current: amend calls `DailySummaryService.recalculate` but does NOT re-trigger absence notification. Confirm. |           |

---

## 10. Absence Notification — Delivery Channel (Email / SMS)

| #    | What to Check         | Expected                                                                                                                          | Pass/Fail |
| ---- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Email channel enabled | Parent receives a Resend email within ~60s of a teacher's absence save.                                                           |           |
| 10.2 | Email content         | Subject: "Absence notice — {child name} — {date}". Body includes class + subject + time. RTL-safe template for Arabic preference. |           |
| 10.3 | SMS channel opted-out | No SMS sent even if Twilio is configured.                                                                                         |           |
| 10.4 | Email deliverability  | Resend webhook `delivered` fires. `NotificationDispatchLog` row created with `delivered_at` set.                                  |           |
| 10.5 | Bounce handling       | Bounced email marks the recipient status as invalid; future sends suppressed.                                                     |           |
| 10.6 | Quiet hours           | Notification respects tenant's quiet-hours window (e.g. no sends between 22:00-07:00). Queued jobs delay until window opens.      |           |
| 10.7 | Template locale       | If parent's preferred locale is `ar`, template is Arabic. RTL `dir="rtl"` in the HTML email. Western numerals.                    |           |

---

## 11. Pattern Alert — Parent Notification (auto / manual)

| #    | What to Check                                                                   | Expected                                                                                                                                                    | Pass/Fail |
| ---- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Tenant `parentNotificationMode = 'auto'` + worker detects recurring-day pattern | `attendance:detect-patterns` creates the alert + enqueues parent notification. Parent receives: "Attendance pattern: {S1} absent every Monday for 3 weeks." |           |
| 11.2 | Tenant mode = `'manual'`                                                        | No auto-notification. Admin must click **Notify parent** on the alert card (admin spec §33.2).                                                              |           |
| 11.3 | Parent views acknowledged alert                                                 | If the alert has `parent_notified_at` set, a small "You were notified on {date}" pill appears on the attendance tab.                                        |           |
| 11.4 | Parent never sees the alert internals                                           | Parent cannot acknowledge / resolve. No API access (`attendance.view_pattern_reports` missing).                                                             |           |
| 11.5 | Pattern notification dedup                                                      | Same alert not re-notified if `parent_notified = true`.                                                                                                     |           |

---

## 12. Parent Communication Preferences

| #    | What to Check                             | Expected                                                                                                | Pass/Fail |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Navigate to `/en/profile/communications`  | Parent sees checkboxes per category + channel: Email / SMS / In-app.                                    |           |
| 12.2 | Toggle off email for `attendance_absence` | Future absences send in-app only.                                                                       |           |
| 12.3 | Toggle off ALL channels                   | Future absences send NONE. Parent still has access to in-app attendance via dashboard (pull, not push). |           |
| 12.4 | Re-enable                                 | Next absence dispatches as configured.                                                                  |           |
| 12.5 | Preference persistence                    | Preference survives logout + login. Backed by `communication_preferences` (or similar) table.           |           |

---

## 13. Parent — Never Sees Other Children

| #    | Attempt                                                              | Expected                                             | Pass/Fail |
| ---- | -------------------------------------------------------------------- | ---------------------------------------------------- | --------- |
| 13.1 | Direct API `GET /parent/students/{S3.id}/attendance` (not own child) | 403 or 404. Service enforces `student_parents` join. |           |
| 13.2 | `GET /parent/students/{S3.id}` (profile)                             | 403 or 404.                                          |           |
| 13.3 | Deep-link `/en/students/{S3.id}`                                     | Same — forbidden state / not found.                  |           |
| 13.4 | Parent dashboard child selector                                      | Only S1 + S2 visible. S3 never appears.              |           |
| 13.5 | IDOR: swap last 8 chars of S1's id for S3's                          | 404. No PII leak.                                    |           |

---

## 14. Parent — All School Attendance Routes Blocked

| #     | Endpoint                                               | Expected                           | Pass/Fail |
| ----- | ------------------------------------------------------ | ---------------------------------- | --------- |
| 14.1  | POST `/v1/attendance-sessions`                         | 403.                               |           |
| 14.2  | GET `/v1/attendance-sessions`                          | 403 (no `attendance.view`).        |           |
| 14.3  | GET `/v1/attendance/officer-dashboard`                 | 403.                               |           |
| 14.4  | GET `/v1/attendance-sessions/:id`                      | 403.                               |           |
| 14.5  | PUT `/v1/attendance-sessions/:id/records`              | 403.                               |           |
| 14.6  | PATCH `/v1/attendance-sessions/:id/submit`             | 403.                               |           |
| 14.7  | PATCH `/v1/attendance-records/:id/amend`               | 403.                               |           |
| 14.8  | PATCH `/v1/attendance-sessions/:id/cancel`             | 403.                               |           |
| 14.9  | GET `/v1/attendance/daily-summaries`                   | 403 (it's a staff-level endpoint). |           |
| 14.10 | GET `/v1/attendance/daily-summaries/student/:id`       | 403.                               |           |
| 14.11 | GET `/v1/attendance/exceptions`                        | 403.                               |           |
| 14.12 | Upload / scan / quick-mark / undo / template endpoints | 403.                               |           |
| 14.13 | Pattern-alerts endpoints                               | 403.                               |           |

---

## 15. Cross-Tenant Hostile Attempts

| #    | Attempt (parent in Tenant A, Tenant B id)              | Expected   | Pass/Fail |
| ---- | ------------------------------------------------------ | ---------- | --------- |
| 15.1 | `GET /api/v1/parent/students/{studentB.id}/attendance` | 404.       |           |
| 15.2 | `GET /api/v1/students/{studentB.id}`                   | 404.       |           |
| 15.3 | Any Tenant B id in any payload                         | Never 200. |           |

---

## 16. Data Invariants — Parent Scope

| #    | Invariant                                                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16.1 | Parent reads are scoped via `student_parents` join. Any attempt on a non-linked student → 403 / 404.                                               |
| 16.2 | Parent never sees `marked_by_user_id`, `submitted_by_user_id`, or any other staff PII on attendance records.                                       |
| 16.3 | Parent's `parent.view_attendance` is the ONLY permission gating the parent attendance endpoint. No admin keys involved.                            |
| 16.4 | Cross-tenant id access → 404.                                                                                                                      |
| 16.5 | Parent cannot write to any attendance surface. All writes require admin/officer/teacher keys.                                                      |
| 16.6 | In-app notification payloads exclude the absence reason text if the teacher's note contains PHI / SEN markers (redacted). Verify service contract. |
| 16.7 | Pattern-alert auto-notifications respect the tenant's `quiet hours` and the parent's opt-out preferences.                                          |

---

## 17. Error, Loading, Empty States

| #    | State                                   | Expected                                                                                | Pass/Fail |
| ---- | --------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| 17.1 | No children linked                      | Dashboard empty state: "No children linked to your account. Contact the school office." |           |
| 17.2 | Zero attendance records (new enrolment) | Attendance card: "No attendance recorded yet."                                          |           |
| 17.3 | Network error                           | Red toast + retry. No stale skeleton.                                                   |           |
| 17.4 | 403 on a blocked endpoint               | Toast + soft redirect.                                                                  |           |

---

## 18. Arabic / RTL

| #    | What to Check                             | Expected                                                                 | Pass/Fail |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------ | --------- |
| 18.1 | `/ar/dashboard/parent` renders RTL        | `<html dir="rtl">`. Layout mirrors.                                      |           |
| 18.2 | Attendance badges translated              | `present` → `حاضر`; `absent_unexcused` → `غائب بدون عذر`, etc.           |           |
| 18.3 | Absence notification in Arabic preference | Email + in-app both render RTL + Arabic. Gregorian dates + Latin digits. |           |
| 18.4 | Logical CSS                               | No `ml-`/`mr-`/`pl-`/`pr-` on parent pages.                              |           |
| 18.5 | Mixed-language reason text                | `dir="auto"` ensures correct per-paragraph direction.                    |           |

---

## 19. Console & Network Health

| #    | What to Check                                                       | Expected                                                 | Pass/Fail |
| ---- | ------------------------------------------------------------------- | -------------------------------------------------------- | --------- |
| 19.1 | Zero red console errors                                             | Yes.                                                     |           |
| 19.2 | All parent requests 2xx / 4xx as expected                           | 403 only on deliberate negative tests.                   |           |
| 19.3 | No staff-level endpoint URLs show in Network Panel (front-end gate) | UI never calls `/v1/attendance-sessions` etc. as parent. |           |

---

## 20. Mobile Responsiveness (375px)

| #    | What to Check                  | Expected                                          | Pass/Fail |
| ---- | ------------------------------ | ------------------------------------------------- | --------- |
| 20.1 | Parent dashboard at 375px      | Child cards stack. Attendance card full-width.    |           |
| 20.2 | Child attendance tab           | Date range picker stacks. Summary strip 2×2 grid. |           |
| 20.3 | Inbox notification view        | Full-width. Reply / mark-read actions visible.    |           |
| 20.4 | Communication preferences page | Toggles full-width. Save button sticky at bottom. |           |
| 20.5 | Email template on mobile       | Readable at 375px. Buttons touchable.             |           |

---

## 21. Backend Endpoint Map — Parent

| #    | Method | Path                                        | Permission               | Notes                                                          |
| ---- | ------ | ------------------------------------------- | ------------------------ | -------------------------------------------------------------- |
| 21.1 | GET    | `/v1/parent/students/:studentId/attendance` | `parent.view_attendance` | Query: `dateRangeQuerySchema`. Parent-child relation enforced. |

All other attendance endpoints return 403 for parents.

---

## 22. Observations from Walkthrough

Seed watchpoints:

- **O-PV1 (P2)**: Verify amend (present → absent post-submit) does NOT trigger a retro-notification — current service does not. If tenant wants retro-notify, surface as a tenant setting.
- **O-PV2 (P2)**: Multi-period absences today — confirm daily digest vs. per-session notifications. 3-per-day spam is a top complaint vector; consolidation preferred.
- **O-PV3 (P3)**: In-app absence notification may contain teacher's free-text reason. Medical/SEN notes could leak. Consider auto-redaction of keywords (illness, medication, etc.).
- **O-PV4 (P2)**: Email template RTL behaviour — Resend template renderer must respect `dir` attribute. Test in Apple Mail, Gmail web, Outlook.
- **O-PV5 (P3)**: Quiet-hours window not aligned with parent's timezone; uses tenant timezone. Consider parent-local.
- **O-PV6 (P2)**: Pattern-alert auto-notification may fire outside school hours. Verify quiet-hours gate covers the auto path too.

---

## 23. Sign-Off

| Field         | Value |
| ------------- | ----- |
| Reviewer      |       |
| Date          |       |
| Total Pass    |       |
| Total Fail    |       |
| Blocker count |       |
| Notes         |       |

Parent spec is signed off only when every row above is Pass with zero P0 / P1 findings. The "never sees other children" boundary (§13) and "school routes all blocked" (§14) are release blockers.
