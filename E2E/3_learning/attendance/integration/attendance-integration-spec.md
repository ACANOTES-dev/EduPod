# Attendance Module — Integration Test Specification

**Module:** Attendance (Sessions, Records, Daily Summaries, Pattern Alerts, Upload, Scan).
**Surface:** Backend API behaviour — RLS, cross-tenant isolation, contract adherence, state-machine transitions, invariants, concurrency, teacher-scope boundary, worker-facing side-effect chains.
**Execution target:** A Jest + `supertest` harness hitting a live Postgres + Redis + MinIO stack (the `integration` CI job on ports 5553 / 5554).
**Last Updated:** 2026-04-18

---

## Table of Contents

1. [Prerequisites & Test Harness](#1-prerequisites--test-harness)
2. [RLS Matrix — Every Tenant-Scoped Table](#2-rls-matrix--every-tenant-scoped-table)
3. [Cross-Tenant Direct-API Hostile Matrix](#3-cross-tenant-direct-api-hostile-matrix)
4. [Permission Matrix — Every Endpoint × Every Role](#4-permission-matrix--every-endpoint--every-role)
5. [Zod Validation — Boundary Cases](#5-zod-validation--boundary-cases)
6. [State-Machine Transitions — Sessions](#6-state-machine-transitions--sessions)
7. [State-Machine Transitions — Records & Amendments](#7-state-machine-transitions--records--amendments)
8. [State-Machine Transitions — Pattern Alerts](#8-state-machine-transitions--pattern-alerts)
9. [Teacher-Scope Boundary (NOT_SESSION_TEACHER)](#9-teacher-scope-boundary-not_session_teacher)
10. [NO_STAFF_PROFILE Edge](#10-no_staff_profile-edge)
11. [Override Closure Contract](#11-override-closure-contract)
12. [School Closure + Academic Year Gating](#12-school-closure--academic-year-gating)
13. [Daily Summary Derivation Correctness](#13-daily-summary-derivation-correctness)
14. [Parent Attendance Read — Scope](#14-parent-attendance-read--scope)
15. [Upload Contract (Full / Exceptions / Quick-Mark / Undo)](#15-upload-contract-full--exceptions--quick-mark--undo)
16. [Scan Contract (Module Gate + Scan + Confirm)](#16-scan-contract-module-gate--scan--confirm)
17. [Officer Dashboard Contract](#17-officer-dashboard-contract)
18. [Pattern Alerts Contract](#18-pattern-alerts-contract)
19. [Concurrency — Parallel Saves on Same Session](#19-concurrency--parallel-saves-on-same-session)
20. [Concurrency — Simultaneous Submit Attempts](#20-concurrency--simultaneous-submit-attempts)
21. [Concurrency — Cron + Manual Create Race](#21-concurrency--cron--manual-create-race)
22. [Concurrency — Amend While Auto-Locking](#22-concurrency--amend-while-auto-locking)
23. [Event / Side-Effect Chain Assertions](#23-event--side-effect-chain-assertions)
24. [Encrypted Fields (Scan — GDPR Tokenisation)](#24-encrypted-fields-scan--gdpr-tokenisation)
25. [GDPR DSAR Traversal](#25-gdpr-dsar-traversal)
26. [Data Invariants — Global](#26-data-invariants--global)
27. [Negative Authorization Tests](#27-negative-authorization-tests)
28. [Observations from Walkthrough](#28-observations-from-walkthrough)
29. [Sign-Off](#29-sign-off)

---

## 1. Prerequisites & Test Harness

| Item            | Spec                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres        | 15+, `school_platform` (or `edupod_test`), all migrations applied, RLS enabled + FORCED on attendance tables.                                  |
| Redis           | 7+, empty at start of each test.                                                                                                               |
| MinIO / S3      | Not required (attendance has no S3 writes — scan uses GDPR tokenisation, not object storage).                                                  |
| Node            | 20+.                                                                                                                                           |
| Test runner     | Jest with `supertest` + `@nestjs/testing`.                                                                                                     |
| Tenants         | 2 isolated tenants (A, B). Fixtures seed different ids.                                                                                        |
| Seed data       | Classes, students, staff profiles, enrolments, schedules, tenant settings, school closures, pattern alerts.                                    |
| Clock           | `jest.useFakeTimers('modern')` for auto-lock cutoff tests + cron fixtures. Real clock outside.                                                 |
| Auth            | `TestAuthFactory` signs tokens for every role_key (owner, principal, vp, admin, attendance_officer, teacher, teacher-orphan, parent, finance). |
| Harness cleanup | `beforeEach` starts a Postgres transaction; `afterEach` rolls back. Redis `FLUSHDB` between test files.                                        |

---

## 2. RLS Matrix — Every Tenant-Scoped Table

Every attendance table must have an RLS policy `{table}_tenant_isolation`, with `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`.

| #   | Table                        | Write as A                    | Read as B                                         | Expected | Pass/Fail |
| --- | ---------------------------- | ----------------------------- | ------------------------------------------------- | -------- | --------- |
| 2.1 | `attendance_sessions`        | INSERT AttendanceSession      | `SELECT COUNT(*) FROM attendance_sessions`        | 0        |           |
| 2.2 | `attendance_records`         | INSERT AttendanceRecord       | `SELECT COUNT(*) FROM attendance_records`         | 0        |           |
| 2.3 | `daily_attendance_summaries` | INSERT DailyAttendanceSummary | `SELECT COUNT(*) FROM daily_attendance_summaries` | 0        |           |
| 2.4 | `attendance_pattern_alerts`  | INSERT AttendancePatternAlert | `SELECT COUNT(*) FROM attendance_pattern_alerts`  | 0        |           |

For each table also verify:

| #    | Check                                                                                                                    | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 2.5  | `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'attendance_sessions'` returns `(true, true)`. |           |
| 2.6  | Same for `attendance_records`.                                                                                           |           |
| 2.7  | Same for `daily_attendance_summaries`.                                                                                   |           |
| 2.8  | Same for `attendance_pattern_alerts`.                                                                                    |           |
| 2.9  | Policy name `{table}_tenant_isolation` exists in `pg_policies`.                                                          |           |
| 2.10 | Policy USING + WITH CHECK reference `current_setting('app.current_tenant_id')::uuid`.                                    |           |
| 2.11 | Reading without setting tenant context (bare connection) returns zero rows on all 4 tables (RLS closes by default).      |           |

---

## 3. Cross-Tenant Direct-API Hostile Matrix

For every mutating endpoint: create a row in Tenant A; obtain id. Authenticate as a Tenant B admin. Hit the endpoint with Tenant A's id. Expect 404 (tenant-scoped findFirst returns null) or 403.

| #    | Endpoint                                                                | Method | Expected                                                                            | Pass/Fail |
| ---- | ----------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- | --------- |
| 3.1  | `/v1/attendance-sessions/{A.id}`                                        | GET    | 404                                                                                 |           |
| 3.2  | `/v1/attendance-sessions/{A.id}`                                        | DELETE | (no delete endpoint — not applicable)                                               |           |
| 3.3  | `/v1/attendance-sessions/{A.id}/cancel`                                 | PATCH  | 404                                                                                 |           |
| 3.4  | `/v1/attendance-sessions/{A.id}/records`                                | PUT    | 404                                                                                 |           |
| 3.5  | `/v1/attendance-sessions/{A.id}/submit`                                 | PATCH  | 404                                                                                 |           |
| 3.6  | `/v1/attendance-records/{A.id}/amend`                                   | PATCH  | 404                                                                                 |           |
| 3.7  | `/v1/attendance/daily-summaries/student/{A.studentId}`                  | GET    | 404                                                                                 |           |
| 3.8  | `/v1/parent/students/{A.studentId}/attendance`                          | GET    | 404                                                                                 |           |
| 3.9  | `/v1/attendance/pattern-alerts/{A.id}/acknowledge`                      | PATCH  | 404                                                                                 |           |
| 3.10 | `/v1/attendance/pattern-alerts/{A.id}/resolve`                          | PATCH  | 404                                                                                 |           |
| 3.11 | `/v1/attendance/pattern-alerts/{A.id}/notify-parent`                    | POST   | 404                                                                                 |           |
| 3.12 | `/v1/attendance/upload` (body references A.class_id via student_number) | POST   | Tenant B's student_number lookup on A's data returns "unknown" rows; no cross-leak. |           |
| 3.13 | `/v1/attendance/scan` (upload A-scope image)                            | POST   | Processor scoped to caller tenant; no cross-tenant lookup.                          |           |
| 3.14 | `POST /attendance-sessions` with `class_id` = Tenant A class            | POST   | 400 `CLASS_NOT_FOUND` or 404 (tenant-scoped lookup fails). NO session created.      |           |

**Zero-leak requirement:** for every row above, the response body must never contain Tenant A data. Validate the full response JSON.

---

## 4. Permission Matrix — Every Endpoint × Every Role

Roles: **Owner (O)** / **Principal (P)** / **Vice-Principal (VP)** / **Admin (A)** / **Attendance Officer (AO)** / **Teacher (T)** / **Teacher Orphan (TO — no staff profile)** / **Parent (PR)** / **Student (S)** / **Finance (F)**.

Legend: ✓ = 200/201 on happy path, ✗ = 403, - = 404 (resource-scope dependent), T-s = teacher-scope gate (200 on own sessions, 403 on others), NSP = NO_STAFF_PROFILE (403 with that code).

| #    | Endpoint                                            | O   | P   | VP  | A   | AO  | T   | TO    | PR      | S   | F   |
| ---- | --------------------------------------------------- | --- | --- | --- | --- | --- | --- | ----- | ------- | --- | --- |
| 4.1  | POST `/attendance-sessions`                         | ✓   | ✓   | ✓   | ✓   | ✓   | T-s | NSP   | ✗       | ✗   | ✗   |
| 4.2  | GET `/attendance-sessions`                          | ✓   | ✓   | ✓   | ✓   | ✓   | ✓\* | ✓\*\* | ✗       | ✗   | ✗   |
| 4.3  | GET `/attendance/officer-dashboard`                 | ✓   | ✓   | ✓   | ✓   | ✓   | ✗   | ✗     | ✗       | ✗   | ✗   |
| 4.4  | GET `/attendance-sessions/:id`                      | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓     | ✗       | ✗   | ✗   |
| 4.5  | PATCH `/attendance-sessions/:id/cancel`             | ✓   | ✓   | ✓   | ✓   | ✗   | ✗   | ✗     | ✗       | ✗   | ✗   |
| 4.6  | PUT `/attendance-sessions/:sessionId/records`       | ✓   | ✓   | ✓   | ✓   | ✓   | T-s | NSP   | ✗       | ✗   | ✗   |
| 4.7  | PATCH `/attendance-sessions/:sessionId/submit`      | ✓   | ✓   | ✓   | ✓   | ✓   | T-s | NSP   | ✗       | ✗   | ✗   |
| 4.8  | PATCH `/attendance-records/:id/amend`               | ✓   | ✓   | ✓   | ✓   | ✗   | ✗   | ✗     | ✗       | ✗   | ✗   |
| 4.9  | GET `/attendance/daily-summaries`                   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓     | ✗       | ✗   | ✗   |
| 4.10 | GET `/attendance/daily-summaries/student/:id`       | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓     | ✗       | ✗   | ✗   |
| 4.11 | GET `/attendance/exceptions`                        | ✓   | ✓   | ✓   | ✓   | ✗   | ✗   | ✗     | ✗       | ✗   | ✗   |
| 4.12 | GET `/parent/students/:id/attendance`               | ✗   | ✗   | ✗   | ✗   | ✗   | ✗   | ✗     | ✓\*\*\* | ✗   | ✗   |
| 4.13 | GET `/attendance/upload-template`                   | ✓   | ✓   | ✓   | ✓   | ✗   | ✗   | ✗     | ✗       | ✗   | ✗   |
| 4.14 | POST `/attendance/upload`                           | ✓   | ✓   | ✓   | ✓   | ✗   | ✗   | ✗     | ✗       | ✗   | ✗   |
| 4.15 | POST `/attendance/exceptions-upload`                | ✓   | ✓   | ✓   | ✓   | ✗   | ✗   | ✗     | ✗       | ✗   | ✗   |
| 4.16 | POST `/attendance/quick-mark`                       | ✓   | ✓   | ✓   | ✓   | ✗   | ✗   | ✗     | ✗       | ✗   | ✗   |
| 4.17 | POST `/attendance/upload/undo`                      | ✓   | ✓   | ✓   | ✓   | ✗   | ✗   | ✗     | ✗       | ✗   | ✗   |
| 4.18 | POST `/attendance/scan`                             | ✓†  | ✓†  | ✓†  | ✓†  | ✗   | ✗   | ✗     | ✗       | ✗   | ✗   |
| 4.19 | POST `/attendance/scan/confirm`                     | ✓†  | ✓†  | ✓†  | ✓†  | ✗   | ✗   | ✗     | ✗       | ✗   | ✗   |
| 4.20 | GET `/attendance/pattern-alerts`                    | ✓   | ✓   | ✓   | ✓   | ✗   | ✗   | ✗     | ✗       | ✗   | ✗   |
| 4.21 | PATCH `/attendance/pattern-alerts/:id/acknowledge`  | ✓   | ✓   | ✓   | ✓   | ✗   | ✗   | ✗     | ✗       | ✗   | ✗   |
| 4.22 | PATCH `/attendance/pattern-alerts/:id/resolve`      | ✓   | ✓   | ✓   | ✓   | ✗   | ✗   | ✗     | ✗       | ✗   | ✗   |
| 4.23 | POST `/attendance/pattern-alerts/:id/notify-parent` | ✓   | ✓   | ✓   | ✓   | ✗   | ✗   | ✗     | ✗       | ✗   | ✗   |

- `* Teacher` sees only sessions where `teacher_staff_id = caller.staff_profile_id`. Caller without `attendance.take_any_class` has the filter applied server-side.
- `** Teacher Orphan` sees zero rows because `staffProfileId = undefined` and the service treats that as "no match".
- `*** Parent` — scoped by `student_parents` relation; parent not linked to the student gets 403 or 404.
- `† Scan endpoints` additionally require `ai_functions` module enabled. If the module is disabled, all four admin roles hit 403 `MODULE_NOT_ENABLED`.

Write one `supertest` case per cell (~23 × 10 = 230 permission rows). Each must assert status code AND (on success) response shape.

---

## 5. Zod Validation — Boundary Cases

| #    | Endpoint                              | Field & scenario                                               | Expected                                                        | Pass/Fail |
| ---- | ------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- | --------- |
| 5.1  | POST `/attendance-sessions`           | `class_id` missing                                             | 400 Zod                                                         |           |
| 5.2  | POST `/attendance-sessions`           | `class_id` = "not-a-uuid"                                      | 400 Zod                                                         |           |
| 5.3  | POST `/attendance-sessions`           | `session_date` = ""                                            | 400 Zod `min(1)`                                                |           |
| 5.4  | POST `/attendance-sessions`           | `session_date` = "not-a-date"                                  | Accepts (Zod `min(1)`); service rejects `new Date` parse (NaN). |           |
| 5.5  | POST `/attendance-sessions`           | `schedule_id` = null                                           | Accepted.                                                       |           |
| 5.6  | POST `/attendance-sessions`           | `default_present` = null                                       | Accepted.                                                       |           |
| 5.7  | POST `/attendance-sessions`           | Unknown field (e.g. `foo: 'bar'`)                              | Zod strips or rejects (verify).                                 |           |
| 5.8  | PUT `.../records`                     | `records` = []                                                 | 400 Zod `min(1)`                                                |           |
| 5.9  | PUT `.../records`                     | `records[0].status` = 'wrong'                                  | 400 Zod enum                                                    |           |
| 5.10 | PUT `.../records`                     | `records[0].arrival_time` = '25:99'                            | 400 Zod regex                                                   |           |
| 5.11 | PUT `.../records`                     | 500-record payload                                             | 200 OR 413 if body-size capped. Verify.                         |           |
| 5.12 | PUT `.../records`                     | `records[0].student_id` = valid UUID but not enrolled in class | 400 `STUDENTS_NOT_ENROLLED` (service)                           |           |
| 5.13 | PATCH `/attendance-records/:id/amend` | `amendment_reason` = ""                                        | 400 Zod `min(1)`                                                |           |
| 5.14 | PATCH `/attendance-records/:id/amend` | `status` = 'present' + `arrival_time` set                      | Zod allows it. Service persists.                                |           |
| 5.15 | GET `/attendance/officer-dashboard`   | `session_date` = '20260418' (wrong format)                     | 400 Zod regex                                                   |           |
| 5.16 | GET `/attendance/officer-dashboard`   | `pageSize` = 200                                               | 400 Zod `max(100)`                                              |           |
| 5.17 | POST `/attendance/upload`             | `session_date` in body wrong format                            | 400 Zod                                                         |           |
| 5.18 | POST `/attendance/upload`             | No `file`                                                      | 400 `FILE_REQUIRED`                                             |           |
| 5.19 | POST `/attendance/upload`             | File 10 MB + 1 byte                                            | 400 `FILE_TOO_LARGE`                                            |           |
| 5.20 | POST `/attendance/upload`             | File mimetype text/html                                        | 400 `INVALID_FILE_TYPE`                                         |           |
| 5.21 | POST `/attendance/exceptions-upload`  | `records[0].status` = 'present'                                | 400 Zod enum excludes present                                   |           |
| 5.22 | POST `/attendance/quick-mark`         | `text` = ""                                                    | 400 Zod `min(1)`                                                |           |
| 5.23 | POST `/attendance/upload/undo`        | `batch_id` = "not-uuid"                                        | 400 Zod                                                         |           |
| 5.24 | POST `/attendance/scan`               | No image file                                                  | 400 `FILE_REQUIRED`                                             |           |
| 5.25 | POST `/attendance/scan/confirm`       | `entries` = []                                                 | Accepted (no min). Verify contract.                             |           |
| 5.26 | GET `/attendance/pattern-alerts`      | `status` = 'bogus'                                             | 400 Zod enum                                                    |           |
| 5.27 | GET `/attendance/pattern-alerts`      | `alert_type` = 'bogus'                                         | 400 Zod enum                                                    |           |

Any future schema change must update BOTH the schema AND the e2e test payloads (see CLAUDE.md "Zod Schema Changes" rule).

---

## 6. State-Machine Transitions — Sessions

Valid transitions: `open → submitted`, `open → cancelled`, `submitted → locked` (via auto-lock cron). No `locked → submitted`, `locked → open`, `submitted → open`, `cancelled → *` transitions.

| #   | From      | To                   | Allowed Via                                          | Expected Status Code                                       | Pass/Fail |
| --- | --------- | -------------------- | ---------------------------------------------------- | ---------------------------------------------------------- | --------- |
| 6.1 | open      | submitted            | PATCH `.../submit`                                   | 200                                                        |           |
| 6.2 | open      | cancelled            | PATCH `.../cancel`                                   | 200                                                        |           |
| 6.3 | open      | locked               | Cron auto-lock (invalid — session must be submitted) | Cron skips.                                                |           |
| 6.4 | submitted | locked               | Auto-lock cron when session_date ≤ cutoff            | Transition happens. Session status = 'locked'.             |           |
| 6.5 | submitted | open                 | Any endpoint                                         | Not allowed. Rejected with 409.                            |           |
| 6.6 | submitted | cancelled            | PATCH `.../cancel` on submitted                      | 409 `SESSION_NOT_OPEN` OR allowed — verify.                |           |
| 6.7 | locked    | \*                   | Any endpoint that touches `records`                  | Save/submit → 409 `SESSION_NOT_OPEN`. Amend still allowed. |           |
| 6.8 | cancelled | \*                   | Any endpoint                                         | Rejected with 409.                                         |           |
| 6.9 | any       | any (malformed enum) | Backend rejects enum at Prisma-level.                |                                                            |

---

## 7. State-Machine Transitions — Records & Amendments

| #   | From status | To status                                | Allowed via                                           | Notes / Expected                                                                                      | Pass/Fail |
| --- | ----------- | ---------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | (no record) | present / absent\_\* / late / left_early | PUT `.../records` on open session                     | Creates record. `marked_by_user_id` = caller.                                                         |           |
| 7.2 | any         | any                                      | PUT `.../records` on open session                     | Updates in-place. `marked_at` refreshed. `amended_from_status` NOT set.                               |           |
| 7.3 | any         | any                                      | PATCH `/attendance-records/:id/amend` on open session | 409 `SESSION_NOT_SUBMITTED_OR_LOCKED`. Record unchanged.                                              |           |
| 7.4 | any         | any                                      | PATCH `/attendance-records/:id/amend` on submitted    | 200. `amended_from_status` = old status. `marked_by_user_id` = amender. `amendment_reason` persisted. |           |
| 7.5 | any         | any                                      | PATCH `/attendance-records/:id/amend` on locked       | 200. Same as 7.4.                                                                                     |           |
| 7.6 | any         | any                                      | PATCH amend on cancelled session                      | 409 or 404 (session cancelled — record access undefined). Document.                                   |           |
| 7.7 | any         | same (no-op)                             | PUT `.../records` with identical status               | 200; row timestamps update. Idempotent.                                                               |           |
| 7.8 | —           | —                                        | Daily summary recalculation                           | Triggered by submit and amend. Verify `derived_status` changes reflect the amend.                     |           |

---

## 8. State-Machine Transitions — Pattern Alerts

Valid transitions: `active → acknowledged → resolved`. `active → resolved` is allowed (skip acknowledged). No reverse.

| #   | From         | To           | Allowed via                                           | Expected                                                  | Pass/Fail |
| --- | ------------ | ------------ | ----------------------------------------------------- | --------------------------------------------------------- | --------- |
| 8.1 | active       | acknowledged | PATCH `/pattern-alerts/:id/acknowledge`               | 200. `acknowledged_by` = caller, `acknowledged_at = now`. |           |
| 8.2 | acknowledged | resolved     | PATCH `/pattern-alerts/:id/resolve`                   | 200.                                                      |           |
| 8.3 | active       | resolved     | PATCH `/pattern-alerts/:id/resolve` (skip ack)        | 200.                                                      |           |
| 8.4 | resolved     | any          | PATCH `/pattern-alerts/:id/acknowledge` or `/resolve` | 409 or idempotent success — document actual.              |           |
| 8.5 | —            | —            | Manual notify while `parent_notified = true`          | 409 `ALREADY_NOTIFIED` OR idempotent — document.          |           |

---

## 9. Teacher-Scope Boundary (NOT_SESSION_TEACHER)

Test every combination of caller permission × target session ownership.

| #    | Caller      | Target session owner | Endpoint                                                 | Expected                                                                                                                    | Pass/Fail |
| ---- | ----------- | -------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1  | Teacher T1  | T1                   | PUT `.../records`                                        | 200                                                                                                                         |           |
| 9.2  | Teacher T1  | T2                   | PUT `.../records`                                        | 403 `NOT_SESSION_TEACHER`                                                                                                   |           |
| 9.3  | Teacher T1  | null (daily mode)    | PUT `.../records`                                        | 403 `NOT_SESSION_TEACHER` (session.teacher_staff_id doesn't match caller.staff_profile_id, which is T1 but session is null) |           |
| 9.4  | Teacher T1  | T1                   | PATCH `.../submit`                                       | 200                                                                                                                         |           |
| 9.5  | Teacher T1  | T2                   | PATCH `.../submit`                                       | 403                                                                                                                         |           |
| 9.6  | Admin Owner | T1                   | PUT `.../records`                                        | 200 (take_any_class lifts scope)                                                                                            |           |
| 9.7  | Admin Owner | null                 | PUT `.../records`                                        | 200                                                                                                                         |           |
| 9.8  | Officer     | T2                   | PUT `.../records`                                        | 200 (take_any_class)                                                                                                        |           |
| 9.9  | Officer     | null                 | PUT `.../records`                                        | 200                                                                                                                         |           |
| 9.10 | Teacher T1  | T1                   | POST `/attendance-sessions` with class T1 teaches        | 201                                                                                                                         |           |
| 9.11 | Teacher T1  | —                    | POST `/attendance-sessions` with class T1 DOES NOT teach | Service behaviour: verify. Likely 403 or 400.                                                                               |           |
| 9.12 | Officer     | —                    | POST `/attendance-sessions` with any class               | 201                                                                                                                         |           |
| 9.13 | Teacher T1  | T2                   | PATCH `/attendance-records/:id/amend`                    | 403 (permission gate fires before scope)                                                                                    |           |
| 9.14 | Admin       | T1                   | PATCH `/attendance-records/:id/amend`                    | 200                                                                                                                         |           |

Short-circuit performance: 9.2 / 9.5 should return within 200ms (no record-loop executed).

---

## 10. NO_STAFF_PROFILE Edge

| #    | Caller                         | Endpoint                    | Expected                                                                                           | Pass/Fail |
| ---- | ------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Teacher Orphan (no staff link) | POST `/attendance-sessions` | 403 `NO_STAFF_PROFILE` with actionable message.                                                    |           |
| 10.2 | Teacher Orphan                 | PUT `.../records`           | 403 `NO_STAFF_PROFILE`.                                                                            |           |
| 10.3 | Teacher Orphan                 | PATCH `.../submit`          | 403 `NO_STAFF_PROFILE`.                                                                            |           |
| 10.4 | Teacher Orphan                 | GET `/attendance-sessions`  | 200 with zero rows (staffProfileId=undefined, no match).                                           |           |
| 10.5 | Admin with NO staff profile    | Same endpoints              | Admin holds `attendance.take_any_class` → scope lifted; 200. Even without a staff profile. Verify. |           |

---

## 11. Override Closure Contract

| #    | Caller      | Date is closed | `override_closure` | `override_reason` | Expected                                    | Pass/Fail |
| ---- | ----------- | -------------- | ------------------ | ----------------- | ------------------------------------------- | --------- |
| 11.1 | Admin Owner | Yes            | (omit)             | —                 | 409 `CLOSURE_CONFLICT`                      |           |
| 11.2 | Admin Owner | Yes            | true               | "Emergency day"   | 201 with `override_reason` persisted.       |           |
| 11.3 | Officer     | Yes            | true               | —                 | 403 (lacks `attendance.override_closure`).  |           |
| 11.4 | Teacher     | Yes            | true               | —                 | 403.                                        |           |
| 11.5 | Admin Owner | No             | true               | "Not needed"      | 201; override_reason ignored (no conflict). |           |

---

## 12. School Closure + Academic Year Gating

| #    | Date scenario                                                                   | Scope         | Expected                    | Pass/Fail |
| ---- | ------------------------------------------------------------------------------- | ------------- | --------------------------- | --------- |
| 12.1 | Session date inside academic year, not a closure                                | -             | 201                         |           |
| 12.2 | Session date on a closure with `affects_scope='all'`                            | all tenant    | 409 `CLOSURE_CONFLICT`      |           |
| 12.3 | Session date on closure `affects_scope='year_group'` matches class's year_group | year_group    | 409                         |           |
| 12.4 | Closure `affects_scope='class'` matches the class                               | class         | 409                         |           |
| 12.5 | Closure for a different class                                                   | class (other) | 201 (no conflict)           |           |
| 12.6 | Session date before academic year start                                         | —             | 400 `OUTSIDE_ACADEMIC_YEAR` |           |
| 12.7 | Session date after academic year end                                            | —             | 400 `OUTSIDE_ACADEMIC_YEAR` |           |
| 12.8 | Session date same day as academic year start                                    | —             | 201                         |           |
| 12.9 | Session date same day as academic year end                                      | —             | 201                         |           |

---

## 13. Daily Summary Derivation Correctness

`DailySummaryService.recalculate(tenantId, studentId, sessionDate)` reads all of the student's records for that date and derives the aggregate `derived_status` + `derived_payload`.

| #     | Scenario                                                         | derived_status expected                                                                                          | Pass/Fail |
| ----- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1  | 1 session, status=present                                        | `present`                                                                                                        |           |
| 13.2  | 3 sessions all present                                           | `present`                                                                                                        |           |
| 13.3  | 3 sessions: 1 present, 1 absent_unexcused, 1 present             | `partially_absent`                                                                                               |           |
| 13.4  | All sessions absent_unexcused                                    | `absent`                                                                                                         |           |
| 13.5  | All sessions absent_excused                                      | `excused`                                                                                                        |           |
| 13.6  | Mix of late + present                                            | `late`                                                                                                           |           |
| 13.7  | Mix of left_early + present                                      | Verify — either `partially_absent` or `present`.                                                                 |           |
| 13.8  | Zero sessions + zero records                                     | No summary row created (undefined).                                                                              |           |
| 13.9  | Session amend changes 1 record                                   | Summary recalculated; derived_status reflects new aggregate.                                                     |           |
| 13.10 | `derived_payload` shape                                          | `{ sessions_total, sessions_present, sessions_absent, sessions_late, sessions_excused, session_details: [...] }` |           |
| 13.11 | Upsert unique constraint `(tenant_id, student_id, summary_date)` | Second recalc updates in place (idempotent).                                                                     |           |
| 13.12 | RLS on summaries enforced even during recalc                     | Service uses `createRlsClient($transaction)` — verify.                                                           |           |

---

## 14. Parent Attendance Read — Scope

`GET /parent/students/:studentId/attendance` — requires `parent.view_attendance` AND the parent-child link.

| #    | Caller relation                                | Expected                                                                  | Pass/Fail |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| 14.1 | Parent PR1 linked to S1                        | 200 with S1's attendance.                                                 |           |
| 14.2 | Parent PR1 NOT linked to S3                    | 403 or 404.                                                               |           |
| 14.3 | Staff user with `parent.view_attendance`       | If any, 200 only on own-linked students. Most staff don't have this key.  |           |
| 14.4 | Tenant B parent → Tenant A student             | 404.                                                                      |           |
| 14.5 | Parent with just-revoked `student_parents` row | 403 / 404 on next call.                                                   |           |
| 14.6 | Parent accesses child who was archived         | 200 with historical data OR 404 — verify contract (soft-delete approach). |           |

---

## 15. Upload Contract (Full / Exceptions / Quick-Mark / Undo)

| #     | Scenario                                                 | Expected                                                                                                     | Pass/Fail |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| 15.1  | Full upload with 10 valid rows                           | 200; 10 records created/updated; `batch_id` returned; `errors: []`.                                          |           |
| 15.2  | Full upload with 5 unknown student_numbers               | 200; remaining rows applied; `errors` lists 5 offenders.                                                     |           |
| 15.3  | Full upload on a date with zero sessions                 | 200 with no-op + "No sessions for {date}" message.                                                           |           |
| 15.4  | Full upload that affects submitted sessions              | Reject on submitted sessions (`SESSION_NOT_OPEN` per row) — only open-session rows apply.                    |           |
| 15.5  | Exceptions-upload with valid list                        | 200; default-present records stay, listed students flip to absent/late.                                      |           |
| 15.6  | Exceptions-upload with status=present                    | 400 Zod enum.                                                                                                |           |
| 15.7  | Quick-mark with valid text                               | 200; affected records updated.                                                                               |           |
| 15.8  | Quick-mark with malformed text                           | 400 or 200 with warnings — document.                                                                         |           |
| 15.9  | Undo a valid batch                                       | 200; records reverted; batch marked as reverted.                                                             |           |
| 15.10 | Undo twice                                               | 409 `BATCH_ALREADY_REVERTED` OR 404 — document.                                                              |           |
| 15.11 | Undo after session submitted                             | 409 `SESSION_NOT_OPEN` OR the undo works — document whether submits preserve the undo trail.                 |           |
| 15.12 | Cross-tenant undo (Tenant A user with Tenant B batch_id) | 404.                                                                                                         |           |
| 15.13 | Upload with mixed valid + invalid rows (50/50)           | 200; 50% applied; 50% in errors. Transaction does not roll back the 50% that applied (partial OK).           |           |
| 15.14 | Upload idempotency on re-upload of the same CSV          | Second call is a no-op (same statuses). No duplicate rows (unique on `(tenant_id, session_id, student_id)`). |           |
| 15.15 | Upload CSV with BOM                                      | Parser handles; header line detected correctly.                                                              |           |
| 15.16 | Upload XLSX with hidden sheets                           | Parser reads only the first sheet.                                                                           |           |
| 15.17 | Upload with extra columns beyond template                | Ignored — only recognised columns are processed.                                                             |           |
| 15.18 | Upload with newline in the reason field                  | Preserved.                                                                                                   |           |

---

## 16. Scan Contract (Module Gate + Scan + Confirm)

| #     | Scenario                                                          | Expected                                                             | Pass/Fail |
| ----- | ----------------------------------------------------------------- | -------------------------------------------------------------------- | --------- |
| 16.1  | POST `/attendance/scan` with `ai_functions` module enabled + JPEG | 200 with parsed entries array.                                       |           |
| 16.2  | Same with module disabled                                         | 403 `MODULE_NOT_ENABLED`.                                            |           |
| 16.3  | Scan with PDF                                                     | 400 `INVALID_FILE_TYPE`.                                             |           |
| 16.4  | Scan with image > 10MB                                            | 400 `FILE_TOO_LARGE`.                                                |           |
| 16.5  | Scan with corrupt JPEG                                            | 400 with parse error from GdprTokenService or AI client.             |           |
| 16.6  | Scan with session_date wrong format                               | 400 Zod regex.                                                       |           |
| 16.7  | Scan confirm with valid entries                                   | 200; records updated; attribution = caller.                          |           |
| 16.8  | Scan confirm after 24h (stale token)                              | 400 `SCAN_TOKEN_EXPIRED` OR still processable — document.            |           |
| 16.9  | Scan confirm with mismatched tenant                               | 404.                                                                 |           |
| 16.10 | GDPR tokenisation — student PII never logged                      | Server logs + Sentry breadcrumbs contain only token refs, not names. |           |

---

## 17. Officer Dashboard Contract

| #     | Scenario                                  | Expected                                                                                                                                  | Pass/Fail |
| ----- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1  | GET with no filters                       | 200. Today's sessions. Default pageSize 50.                                                                                               |           |
| 17.2  | With `session_date` = future date         | 200 with 0 rows.                                                                                                                          |           |
| 17.3  | With `status` filter                      | 200 filtered.                                                                                                                             |           |
| 17.4  | With `year_group_id` filter               | 200; only classes in that year group.                                                                                                     |           |
| 17.5  | With `class_id` filter                    | 200; only that class's sessions.                                                                                                          |           |
| 17.6  | With `teacher_staff_id` filter            | 200; only that teacher's sessions.                                                                                                        |           |
| 17.7  | With `pageSize = 200`                     | 400 Zod `max(100)`.                                                                                                                       |           |
| 17.8  | Cross-tenant: filter by Tenant B class_id | 200 with 0 rows (tenant-scoped).                                                                                                          |           |
| 17.9  | Response contract                         | `{ data: [{ id, session_date, status, default_present, class, teacher, schedule, subject, record_count, enrolled_count }], meta: {...} }` |           |
| 17.10 | Enrolment count source                    | `ClassesReadFacade.findEnrolmentCountsByClasses` — cross-module Prisma access is forbidden by lint; must go through facade.               |           |
| 17.11 | Subject resolution                        | Via `resolveSubjectsFromRuns` — mirrors substitution service pattern; reads `scheduling_run.config_snapshot` + `result_json`.             |           |

---

## 18. Pattern Alerts Contract

| #    | Scenario                                                       | Expected                                                                                     | Pass/Fail |
| ---- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------- |
| 18.1 | GET `/pattern-alerts?status=active`                            | 200; list.                                                                                   |           |
| 18.2 | GET `/pattern-alerts?alert_type=excessive_absences`            | 200; filtered.                                                                               |           |
| 18.3 | Acknowledge an active alert                                    | 200; status=acknowledged.                                                                    |           |
| 18.4 | Resolve an active alert                                        | 200; status=resolved.                                                                        |           |
| 18.5 | Acknowledge an already-acknowledged alert                      | Idempotent 200 OR 409 — document.                                                            |           |
| 18.6 | Notify parent manually on an alert with `parent_notified=true` | 409 `ALREADY_NOTIFIED` OR idempotent 200 — document.                                         |           |
| 18.7 | Duplicate alert creation same day                              | P2002 on unique `(tenant_id, student_id, alert_type, detected_date)`. Worker silently skips. |           |
| 18.8 | Manual notify enqueues notification job                        | Verify via BullMQ board. Job name: `communications:dispatch-notifications`.                  |           |

---

## 19. Concurrency — Parallel Saves on Same Session

| #    | Scenario                                                                | Expected                                                                                             | Pass/Fail |
| ---- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | Two concurrent PUT `.../records` with same student_id, different status | Last write wins; final row's status matches the latter request. No duplicate row.                    |           |
| 19.2 | Two concurrent PUT with disjoint student_id sets                        | Both apply; all records present post-hoc.                                                            |           |
| 19.3 | 10 concurrent PUTs with overlapping students                            | No deadlock. All requests return 200. No orphan rows. Total records ≤ enrolments.                    |           |
| 19.4 | Concurrent parent-notification enqueues                                 | Idempotent at enqueue time OR dedup at processor (by `(student_id, session_id, record_id)`). Verify. |           |

---

## 20. Concurrency — Simultaneous Submit Attempts

| #    | Scenario                                              | Expected                                                                                                                                         | Pass/Fail |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 20.1 | Two concurrent PATCH `.../submit` on the same session | Exactly one 200; the other 409 `SESSION_NOT_OPEN`. `submitted_by_user_id` reflects the winner.                                                   |           |
| 20.2 | Concurrent submit + save                              | Save wins the race → submit returns 409 (because session was submitted, wait — actually save returns data then submit happens). Document actual. |           |
| 20.3 | Submit triggers 30 daily-summary recalculations       | All 30 complete. No deadlock.                                                                                                                    |           |

---

## 21. Concurrency — Cron + Manual Create Race

| #    | Scenario                                                                                           | Expected                                                                                                                            | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.1 | Admin manually creates a session at 04:29 UTC; cron at 04:30 fires to generate for same class+date | Cron handles P2002 unique-constraint violation silently, moves on to next schedule.                                                 |           |
| 21.2 | Cron creates at 04:30; admin POST at 04:30:01                                                      | Admin POST → 409 `SESSION_ALREADY_EXISTS` with "Open existing" link.                                                                |           |
| 21.3 | Cron fires twice (dedup broken)                                                                    | Second run is a no-op — all creates hit P2002 + are silently skipped.                                                               |           |
| 21.4 | Session generation during a closure creation race                                                  | If closure is created mid-cron, generator may create a session for a now-closed date. Document whether back-compensation is needed. |           |

---

## 22. Concurrency — Amend While Auto-Locking

| #    | Scenario                                                                | Expected                                                                                               | Pass/Fail |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- |
| 22.1 | Admin amends a submitted record at 22:59; auto-lock cron fires at 23:00 | Both complete. Amend persists (submitted sessions accept amends). Cron flips submitted → locked after. |           |
| 22.2 | Amend after auto-lock but session is locked                             | Amend still allowed (contract). Row updated.                                                           |           |
| 22.3 | Concurrent amend + auto-lock race on the same record                    | No deadlock. Final state matches last write.                                                           |           |
| 22.4 | Amend on cancelled session                                              | 409 `SESSION_NOT_SUBMITTED_OR_LOCKED` — amend does not cross into cancelled.                           |           |

---

## 23. Event / Side-Effect Chain Assertions

| #     | Trigger                                                           | Downstream effects                                                                                                                                                     | Pass/Fail |
| ----- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 23.1  | PUT `.../records` with non-present records                        | For each non-present record, `AttendanceParentNotificationService.triggerAbsenceNotification` fires. Failures are swallowed (wrapped in try/catch) to not break saves. |           |
| 23.2  | PATCH `.../submit`                                                | `DailySummaryService.recalculate(tenant, student, session_date)` runs per unique student_id.                                                                           |           |
| 23.3  | PATCH `/attendance-records/:id/amend`                             | `DailySummaryService.recalculate(tenant, student, session_date)` runs for that student.                                                                                |           |
| 23.4  | `attendance:detect-patterns` cron                                 | Creates `AttendancePatternAlert` rows. For excessive-absence students, enqueues `early-warning:compute-student` job on `early-warning` queue.                          |           |
| 23.5  | Manual POST `.../pattern-alerts/:id/notify-parent`                | Enqueues `communications:dispatch-notifications` AND sets `parent_notified = true`.                                                                                    |           |
| 23.6  | `attendance:auto-lock` cron                                       | Updates submitted sessions past cutoff → locked. No other side effects.                                                                                                |           |
| 23.7  | `attendance:detect-pending` cron                                  | Logs count; no DB writes (as of current implementation). Future: Redis cache for dashboard.                                                                            |           |
| 23.8  | Admin manually creates a session with `default_present=true`      | Bulk-inserts AttendanceRecord rows with `marked_by_user_id='00000000-0000-0000-0000-000000000000'` for every active enrolment.                                         |           |
| 23.9  | School closure created on a future date                           | Future session-generation cron will skip that date. No retro-cleanup of already-generated sessions — admin must manually cancel.                                       |           |
| 23.10 | Tenant setting `captureMode` changed from `per_period` to `daily` | Next cron run generates daily sessions instead of per-period. Existing per-period sessions for future dates remain untouched.                                          |           |

---

## 24. Encrypted Fields (Scan — GDPR Tokenisation)

Attendance does not encrypt columns. Scan uses `GdprTokenService` to tokenise PII before sending to the AI vendor.

| #    | Scenario                                     | Expected                                                                                                                      | Pass/Fail |
| ---- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 24.1 | Scan image contains student names            | `GdprTokenService` issues reversible tokens. AI vendor receives tokens, not raw names.                                        |           |
| 24.2 | Scan response from AI vendor contains tokens | Service reverses tokens to real names before returning to client.                                                             |           |
| 24.3 | Server logs during scan                      | Contain tokens only; no raw PII.                                                                                              |           |
| 24.4 | Sentry breadcrumb on scan error              | Tokens only.                                                                                                                  |           |
| 24.5 | Token cache TTL                              | Tokens expire after configured TTL (e.g. 1h). After expiry, reverse-lookup fails; confirm throws or returns tokenised result. |           |

---

## 25. GDPR DSAR Traversal

For a data-subject-access-request on student S1, verify all attendance records are exported.

| #    | Scenario                                        | Expected                                                                                                                                               | Pass/Fail |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 25.1 | DSAR export for S1 (has 30 days of attendance)  | Export JSON includes: `attendance_records` (all 30+ rows), `daily_attendance_summaries`, `attendance_pattern_alerts` rows where `student_id = S1`.     |           |
| 25.2 | DSAR erase for S1                               | Records cascade-delete via FK `onDelete: Cascade` on `AttendanceRecord.student` + `DailyAttendanceSummary.student` + `AttendancePatternAlert.student`. |           |
| 25.3 | DSAR erase of a student who has amended records | All records (original + amended_from_status history) removed. No dangling FK references.                                                               |           |
| 25.4 | DSAR erase preserves non-student data           | `AttendanceSession.submitted_by_user_id` (set to a staff user) remains; FK is onDelete:SetNull.                                                        |           |
| 25.5 | DSAR traversal excludes data of other students  | Export for S1 never contains S2 rows even if they share a session.                                                                                     |           |

---

## 26. Data Invariants — Global

| #     | Invariant                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | -------------- | ----------- | ------------ |
| 26.1  | `AttendanceRecord.tenant_id = AttendanceSession.tenant_id` (always).                                                                                                           |
| 26.2  | `AttendanceRecord.attendance_session_id = AttendanceSession.id` (FK integrity).                                                                                                |
| 26.3  | `AttendanceRecord.student_id` must be an active enrolment in the session's class at time of write.                                                                             |
| 26.4  | `AttendanceSession.status` is one of `open                                                                                                                                     | submitted        | locked         | cancelled`. |
| 26.5  | `AttendanceRecord.status` is one of `present                                                                                                                                   | absent_unexcused | absent_excused | late        | left_early`. |
| 26.6  | `DailyAttendanceSummary.derived_status` is one of `present                                                                                                                     | partially_absent | absent         | late        | excused`.    |
| 26.7  | Unique on `(tenant_id, student_id, summary_date)` in `daily_attendance_summaries`.                                                                                             |
| 26.8  | Unique on `(tenant_id, session_id, student_id)` in `attendance_records` (enforced by upsert pattern in service).                                                               |
| 26.9  | Unique on `(tenant_id, class_id, schedule_id, session_date)` in `attendance_sessions` (for per-period) and `(tenant_id, class_id, session_date)` for daily (schedule_id=null). |
| 26.10 | Unique on `(tenant_id, student_id, alert_type, detected_date)` in `attendance_pattern_alerts`.                                                                                 |
| 26.11 | RLS policies exist + forced on all 4 tenant-scoped tables.                                                                                                                     |
| 26.12 | `submitted_by_user_id` is null when status ∈ {open, cancelled}; non-null when status ∈ {submitted, locked}.                                                                    |
| 26.13 | `marked_by_user_id = 00000000-0000-0000-0000-000000000000` indicates a system-generated record from default-present.                                                           |
| 26.14 | `amended_from_status` is set only when `amendment_reason` is set.                                                                                                              |
| 26.15 | Cancelled sessions have no records counted toward `daily_attendance_summaries`. (Verify — summary derivation must exclude records tied to cancelled sessions.)                 |

---

## 27. Negative Authorization Tests

| #    | Scenario                                                                                    | Expected                                                                                  | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| 27.1 | JWT with `role_keys` field tampered                                                         | 401 signature invalid.                                                                    |           |
| 27.2 | JWT expired                                                                                 | 401.                                                                                      |           |
| 27.3 | JWT signed by different secret                                                              | 401.                                                                                      |           |
| 27.4 | No Authorization header                                                                     | 401.                                                                                      |           |
| 27.5 | Authorization header with empty Bearer                                                      | 401.                                                                                      |           |
| 27.6 | Teacher's JWT with manually-added `attendance.manage` permission in `permissions` claim     | Backend re-reads permissions from DB (via `PermissionCacheService`) — claim ignored. 403. |           |
| 27.7 | Cross-tenant header spoofing (if tenant is resolved from subdomain, manipulate Host header) | Server uses verified tenant context, not spoofed Host.                                    |           |

---

## 28. Observations from Walkthrough

Seed watchpoints:

- **O-INT1 (P2)**: Session generation during concurrent closure creation could leave sessions that should not exist. Consider a retro-cleanup step (cancel sessions for newly-closed dates).
- **O-INT2 (P1)**: `amended_from_status` stores only the status prior to current amend, not the original. Reading the full amendment history requires an audit-log join. Consider a dedicated `attendance_record_amendments` table.
- **O-INT3 (P2)**: Cancel on submitted/locked sessions — verify contract. If allowed, daily summaries need retro-recalculation.
- **O-INT4 (P2)**: Parent notification service swallows errors silently on save. Means we lose visibility when email dispatch fails. Consider emitting a metric.
- **O-INT5 (P3)**: `DailySummaryService.recalculate` iterates `session_details` — consider capping the payload size (1000+ sessions per student could balloon JSON).
- **O-INT6 (P2)**: Pattern alert service reads tenant.settings each run — cache opportunity.

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

Integration spec is signed off only when every row above is Pass with zero P0 / P1 findings. The RLS matrix (§2), cross-tenant hostile matrix (§3), permission matrix (§4), and teacher-scope boundary (§9) are release blockers.
