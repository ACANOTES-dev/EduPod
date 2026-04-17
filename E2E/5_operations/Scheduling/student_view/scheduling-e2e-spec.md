# E2E Test Specification: Scheduling — Student View

> **Coverage:** This document covers the entire Scheduling module as it is rendered (and gated) for the **student** role within a multi-tenant school SaaS. Students have an extremely narrow surface area in Scheduling: they may view the **published timetable for their own class** (their personal schedule of lessons) and nothing else. This spec is **heavy on negative assertions** — it explicitly verifies that every admin / teacher / scheduler / parent / oversight surface is hidden, redirected, or returns 403.
>
> **Pages documented here:**
>
> - `/[locale]/scheduling/my-timetable` — student personal timetable surface (read-only, current published schedule for the student's class)
> - Student dashboard / home calendar surface where the upcoming lessons strip is rendered
>
> **Pages explicitly tested as DENIED for student:**
>
> - `/[locale]/scheduling` (hub)
> - `/[locale]/scheduling/auto`
> - `/[locale]/scheduling/runs` (and `/runs/[id]/review`, `/runs/compare`)
> - `/[locale]/scheduling/period-grid`
> - `/[locale]/scheduling/curriculum`
> - `/[locale]/scheduling/break-groups`
> - `/[locale]/scheduling/room-closures`
> - `/[locale]/scheduling/competencies`
> - `/[locale]/scheduling/substitute-competencies`
> - `/[locale]/scheduling/competency-coverage`
> - `/[locale]/scheduling/teacher-config`
> - `/[locale]/scheduling/availability`
> - `/[locale]/scheduling/preferences`
> - `/[locale]/scheduling/requirements`
> - `/[locale]/scheduling/requirements/subject-overrides`
> - `/[locale]/scheduling/substitutions`
> - `/[locale]/scheduling/substitution-board`
> - `/[locale]/scheduling/exams`
> - `/[locale]/scheduling/scenarios`
> - `/[locale]/scheduling/dashboard`
> - `/[locale]/scheduling/cover-reports`
> - `/[locale]/scheduling/leave-requests`
> - `/[locale]/scheduling/my-preferences`
> - `/[locale]/scheduling/my-satisfaction`
> - `/[locale]/timetables` (cross-class browse)
> - `/[locale]/schedules` (manual schedule CRUD)

**Base URL:** `https://nhqs.edupod.app`
**Primary login:** **Adam Moore** (`adam.moore@nhqs.test` / `Password123!`) — Student in tenant `nhqs`, mapped to one specific class.
**Navigation path to start:** Log in as Adam, then look for the timetable surface in the student shell (home dashboard or "My Timetable" tile).

**Student role permissions in scope:** the student account holds **NONE** of the `schedule.*` permissions used by admin/teacher flows. The only access path is the controller logic in `TimetablesController.getStudentTimetable()` (`GET /v1/timetables/student/:studentId`), which permits `students.view` OR a parent-of-link OR — for our purposes — the student themselves accessing their own student row via the student-facing UI.

**Permissions explicitly NOT held by student:**

- `schedule.manage`
- `schedule.run_auto`, `schedule.apply_auto`, `schedule.view_auto_reports`
- `schedule.configure_requirements`, `schedule.configure_availability`, `schedule.pin_entries`
- `schedule.manage_substitutions`, `schedule.report_own_absence`, `schedule.respond_to_offer`
- `schedule.view_reports`, `schedule.view_own`, `schedule.view_own_satisfaction`
- `schedule.manage_exams`, `schedule.manage_scenarios`
- `schedule.view_class` (this is a teacher/admin permission — student access is via their own student row only)

---

## Spec Pack Context

This document is the **student UI leg (leg 1d)** of the `/e2e-full` release-readiness pack for the Scheduling module. The full pack includes four sibling legs that together target 99.99% release-readiness:

| Leg | Spec document                                | Executor                       |
| --- | -------------------------------------------- | ------------------------------ |
| 1a  | `admin_view/scheduling-e2e-spec.md`          | QC engineer + Playwright       |
| 1b  | `teacher_view/scheduling-e2e-spec.md`        | QC engineer + Playwright       |
| 1c  | `parent_view/scheduling-e2e-spec.md`         | QC engineer + Playwright       |
| 1d  | `student_view/scheduling-e2e-spec.md` (this) | QC engineer + Playwright       |
| 2   | `integration/scheduling-integration-spec.md` | Jest / Supertest harness       |
| 3   | `worker/scheduling-worker-spec.md`           | Jest + BullMQ                  |
| 4   | `perf/scheduling-perf-spec.md`               | k6 / Artillery / Lighthouse    |
| 5   | `security/scheduling-security-spec.md`       | Security engineer / pen-tester |

A tester running ONLY this spec is doing a thorough **student-shell smoke + permission denial pass**. They are NOT doing a full tenant-readiness check. For the latter, run the full `/e2e-full` pack.

---

## Out of Scope for This Spec

- **Worker / solver-v2 / stale-reaper / cascade jobs** → `worker/scheduling-worker-spec.md`
- **Integration RLS matrix across every endpoint × every role × every sibling tenant** → `integration/scheduling-integration-spec.md`
- **Performance / load / solver wall-clock** → `perf/scheduling-perf-spec.md`
- **Security hardening (XSS, CSRF, JWT replay, IDOR fuzz beyond the spot-checks here)** → `security/scheduling-security-spec.md`
- **Admin / teacher / parent shells** → sibling specs in this folder
- **Reading or modifying any product code** — this is a research/documentation task only

---

## Prerequisites — Multi-Tenant Test Environment (MANDATORY)

A single-tenant run is insufficient because §11 exercises the cross-tenant denial path. The environment must satisfy the following before execution begins.

### Tenants

| Slug       | Currency | Hostname                      | Notes                                                                                    |
| ---------- | -------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `nhqs`     | GBP      | `https://nhqs.edupod.app`     | Primary tenant; Adam Moore (student) lives here, mapped to one class with a published TT |
| `stress-a` | GBP      | `https://stress-a.edupod.app` | Sibling tenant; used purely to construct hostile cross-tenant URL/API tests in §11       |

Tenant `stress-a` MUST have at least one class with a published timetable so we have a real `class_id` and `student_id` to use as the hostile target.

### Users required (4 total)

| Tenant     | Role           | Name (suggested) | Login email             | Password          | Permissions                                                        |
| ---------- | -------------- | ---------------- | ----------------------- | ----------------- | ------------------------------------------------------------------ |
| `nhqs`     | student        | Adam Moore       | `adam.moore@nhqs.test`  | `Password123!`    | `students.view_own`, `inbox.read`, etc.                            |
| `nhqs`     | student (peer) | Maryam Hussain   | `maryam.h@nhqs.test`    | `Password123!`    | Same; mapped to a DIFFERENT class to Adam                          |
| `nhqs`     | school_owner   | Yusuf Rahman     | `owner@nhqs.test`       | `Password123!`    | (used only to seed/verify; not under test)                         |
| `stress-a` | student        | Stress-A Student | `student@stress-a.test` | `StressTest2026!` | Used only as a target (not logged in by the executor against nhqs) |

### Seed data required

| Entity                                         | Tenant `nhqs`                                                                         | Tenant `stress-a` |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------- |
| Adam Moore student row                         | 1, with `student_id = ADAM_STUDENT_ID`, mapped to `CLASS_8B_ID`                       | n/a               |
| Maryam Hussain student row                     | 1, with `student_id = MARYAM_STUDENT_ID`, mapped to `CLASS_9A_ID` (different to Adam) | n/a               |
| Active academic year                           | 1, with status `active`                                                               | 1                 |
| Period grid for the active year                | A complete weekly period structure (e.g. periods 1–7, Mon–Fri)                        | Same              |
| Published timetable for CLASS_8B               | ≥ 25 lesson entries spanning the working week, each with subject, teacher, room, time | n/a               |
| Published timetable for CLASS_9A               | ≥ 5 lesson entries (only for invariant test §10)                                      | n/a               |
| Published timetable in stress-a                | ≥ 5 lesson entries on at least one class (used as hostile target)                     | ≥ 5               |
| At least one absent teacher today on Adam's TT | 1 substitution row — verifies cover label renders                                     | n/a               |
| Adam's user→student link                       | `users.id`(Adam) is linked to `student.id`(ADAM_STUDENT_ID) via the standard mapping  | n/a               |

### Recorded UUIDs (capture before run)

| Symbol                | Source                                                      | Captured value |
| --------------------- | ----------------------------------------------------------- | -------------- |
| `ADAM_USER_ID`        | `SELECT id FROM users WHERE email = 'adam.moore@nhqs.test'` |                |
| `ADAM_STUDENT_ID`     | `SELECT id FROM student WHERE user_id = ADAM_USER_ID`       |                |
| `MARYAM_STUDENT_ID`   | `SELECT id FROM student WHERE user_id = MARYAM_USER_ID`     |                |
| `CLASS_8B_ID`         | Adam's `class_id`                                           |                |
| `CLASS_9A_ID`         | Maryam's `class_id`                                         |                |
| `STRESS_A_CLASS_ID`   | Any class id from `stress-a` tenant                         |                |
| `STRESS_A_STUDENT_ID` | Any student id from `stress-a` tenant                       |                |
| `STRESS_A_RUN_ID`     | Any scheduling_run id from `stress-a`                       |                |

### Hostile-pair assertions (enforced in §11)

The tester MUST execute these cross-tenant assertions at least once during the run:

1. Logged in as Adam (nhqs), `GET /api/v1/timetables/student/{STRESS_A_STUDENT_ID}` via DevTools fetch → **expected 404 or 403**, NEVER 200 with stress-a data.
2. Logged in as Adam (nhqs), `GET /api/v1/timetables/class/{STRESS_A_CLASS_ID}` → **expected 403**.
3. Logged in as Adam (nhqs), `GET /api/v1/scheduling-runs/{STRESS_A_RUN_ID}` → **expected 403**.
4. Logged in as Adam (nhqs), navigate to `https://stress-a.edupod.app/en/scheduling/my-timetable` → **expected redirect to login** (cookie/session is `nhqs`-scoped, not transferable).

---

## Table of Contents

1. [Multi-tenant prerequisites recap](#1-multi-tenant-prerequisites-recap)
2. [Seed data summary](#2-seed-data-summary)
3. [Permission matrix — student role](#3-permission-matrix--student-role)
4. [Allowed view: student's own timetable (page load + week view)](#4-allowed-view-students-own-timetable)
5. [Allowed view: lesson card content + bilingual + mobile](#5-allowed-view-lesson-card-content--bilingual--mobile)
6. [Allowed view: empty state when no published TT](#6-allowed-view-empty-state-when-no-published-tt)
7. [Allowed view: dashboard / calendar integration of scheduled lessons](#7-allowed-view-dashboard--calendar-integration)
8. [Hidden navigation — admin tiles must not appear in student shell](#8-hidden-navigation)
9. [Direct URL access denial — every admin scheduling URL](#9-direct-url-access-denial)
10. [API permission denial — every admin scheduling endpoint](#10-api-permission-denial)
11. [Cross-cutting: console errors, network 4xx/5xx, RTL, dark mode, mobile](#11-cross-cutting-console-errors-network-4xx5xx-rtl-dark-mode-mobile)
12. [Data invariants — student only sees their own class rows](#12-data-invariants)
13. [Multi-tenant RLS hostile-pair (nhqs student vs stress-a)](#13-multi-tenant-rls-hostile-pair)
14. [Observations / bugs spotted](#14-observations--bugs-spotted)
15. [Sign-off](#15-sign-off)

---

## 1. Multi-tenant prerequisites recap

| #         | Page/Endpoint | Action                                                                                                   | Expected                                                                         | Actual | Pass/Fail |
| --------- | ------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-001 | n/a (env)     | Verify both tenants `nhqs` and `stress-a` resolve over HTTPS                                             | Both hostnames return 200 on `/en/(public)/login` (or equivalent landing).       |        |           |
| SCH-S-002 | n/a (env)     | Verify Adam Moore user exists and is `student` role in nhqs                                              | Login succeeds; role visible in profile menu reads "Student" (or AR equivalent). |        |           |
| SCH-S-003 | n/a (env)     | Verify Adam is mapped to exactly one class with a published timetable                                    | `SELECT class_id FROM student WHERE id = ADAM_STUDENT_ID` returns CLASS_8B_ID.   |        |           |
| SCH-S-004 | n/a (env)     | Verify Maryam Hussain is mapped to a DIFFERENT class                                                     | Maryam's `class_id` ≠ Adam's `class_id`.                                         |        |           |
| SCH-S-005 | n/a (env)     | Verify stress-a tenant has at least one class with a published timetable                                 | `STRESS_A_CLASS_ID` resolves and has rows in `schedule`.                         |        |           |
| SCH-S-006 | n/a (env)     | Verify FORCE ROW LEVEL SECURITY is enabled on `schedule`, `student`, `scheduling_run`, `teacher_absence` | All four tables show `forcerowsecurity = t` in `pg_class`.                       |        |           |
| SCH-S-007 | n/a (env)     | Verify Adam's session cookie cannot be reused on stress-a (different host)                               | Cookie has `Domain=nhqs.edupod.app` and is NOT sent on stress-a requests.        |        |           |

---

## 2. Seed data summary

| #         | Page/Endpoint | Action                                                                       | Expected                                                | Actual | Pass/Fail |
| --------- | ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- | ------ | --------- |
| SCH-S-010 | n/a (db)      | Confirm CLASS_8B has ≥ 25 schedule rows for the active academic year         | Row count ≥ 25.                                         |        |           |
| SCH-S-011 | n/a (db)      | Confirm at least one row has a non-null `room_id`                            | Room labels are testable in §5.                         |        |           |
| SCH-S-012 | n/a (db)      | Confirm at least one row has a `teacher_staff_id`                            | Teacher labels are testable in §5.                      |        |           |
| SCH-S-013 | n/a (db)      | Confirm at least one absence/substitution affects today on CLASS_8B          | Cover label can be verified in §5.                      |        |           |
| SCH-S-014 | n/a (db)      | Confirm CLASS_9A has ≥ 5 distinct schedule rows that DO NOT overlap CLASS_8B | Used in §12 to verify Adam never sees Maryam's lessons. |        |           |

---

## 3. Permission matrix — student role

The student role MUST be denied every admin scheduling permission. The table below lists every `schedule.*` permission referenced by the controllers and asserts the expected outcome for the student.

| #         | Permission                           | Expected for student | Verified via                                                    | Actual | Pass/Fail |
| --------- | ------------------------------------ | -------------------- | --------------------------------------------------------------- | ------ | --------- |
| SCH-S-020 | `schedule.manage`                    | DENIED               | API 403 on `POST /v1/schedules`                                 |        |           |
| SCH-S-021 | `schedule.run_auto`                  | DENIED               | API 403 on `POST /v1/scheduling-runs`                           |        |           |
| SCH-S-022 | `schedule.apply_auto`                | DENIED               | API 403 on `POST /v1/scheduling-runs/:id/apply`                 |        |           |
| SCH-S-023 | `schedule.view_auto_reports`         | DENIED               | API 403 on `GET /v1/scheduling-runs`                            |        |           |
| SCH-S-024 | `schedule.configure_requirements`    | DENIED               | API 403 on `GET /v1/scheduling/curriculum-requirements`         |        |           |
| SCH-S-025 | `schedule.configure_availability`    | DENIED               | API 403 on `GET /v1/scheduling/teacher-config`                  |        |           |
| SCH-S-026 | `schedule.pin_entries`               | DENIED               | API 403 on `POST /v1/schedules/:id/pin`                         |        |           |
| SCH-S-027 | `schedule.manage_substitutions`      | DENIED               | API 403 on `POST /v1/scheduling/absences`                       |        |           |
| SCH-S-028 | `schedule.report_own_absence`        | DENIED               | API 403 on `POST /v1/scheduling/absences/self-report`           |        |           |
| SCH-S-029 | `schedule.respond_to_offer`          | DENIED               | API 403 on `GET /v1/scheduling/offers/my`                       |        |           |
| SCH-S-030 | `schedule.view_reports`              | DENIED               | API 403 on `GET /v1/scheduling/cover-reports`                   |        |           |
| SCH-S-031 | `schedule.view_own` (teacher own TT) | DENIED               | API 403 on `GET /v1/scheduling/timetable/my`                    |        |           |
| SCH-S-032 | `schedule.view_own_satisfaction`     | DENIED               | API 403 on `GET /v1/scheduling-dashboard/preferences`           |        |           |
| SCH-S-033 | `schedule.view_class` (teacher view) | DENIED               | API 403 on `GET /v1/timetables/class/{CLASS_8B_ID}`             |        |           |
| SCH-S-034 | `schedule.manage_exams`              | DENIED               | API 403 on `GET /v1/scheduling/exam-sessions`                   |        |           |
| SCH-S-035 | `schedule.manage_scenarios`          | DENIED               | API 403 on `GET /v1/scheduling/scenarios`                       |        |           |
| SCH-S-036 | `students.view` (peer)               | DENIED on peer       | API 403/404 on `GET /v1/timetables/student/{MARYAM_STUDENT_ID}` |        |           |

> **Note:** The student MAY access `GET /v1/timetables/student/{ADAM_STUDENT_ID}` because the controller's authorization includes the "self" path through `students.view` scoping (the student is the data subject). This is the ONE allowed scheduling read for the student role.

---

## 4. Allowed view: student's own timetable

**URL:** `/[locale]/scheduling/my-timetable` (or whatever route the student shell exposes for the personal TT — see §8.1; if the route is product-side rebadged for student users, capture the actual final URL in the Actual column)

**API:** `GET /api/v1/timetables/student/{ADAM_STUDENT_ID}?academic_year_id={yearId}` (per `TimetablesController.getStudentTimetable()`)

### 4.1 Page load

| #         | Page/Endpoint                                                   | Action                                                                                   | Expected                                                                                                                                                                              | Actual | Pass/Fail |
| --------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-040 | `/en/scheduling/my-timetable` (or the student-shell equivalent) | Log in as Adam, click the "My Timetable" / "Schedule" tile in the student dashboard      | Page loads under 2 s; no blank screen; no "Something went wrong" banner.                                                                                                              |        |           |
| SCH-S-041 | same                                                            | Inspect Network tab on first load                                                        | Exactly one call to `GET /api/v1/timetables/student/{ADAM_STUDENT_ID}?academic_year_id=…` returns 200. NO call to `/v1/scheduling/timetable/my` (that is teacher-only) or `/class/`.  |        |           |
| SCH-S-042 | same                                                            | Verify response shape                                                                    | Response is a timetable grid keyed by weekday + period, OR a flat list of lesson entries each with `subject`, `teacher`, `room`, `start_time`, `end_time`, `weekday`, `period_order`. |        |           |
| SCH-S-043 | same                                                            | Verify default view is "today" (or "this week", per product spec)                        | Heading shows current ISO week / today's date in the locale's calendar (Gregorian, Western numerals).                                                                                 |        |           |
| SCH-S-044 | same                                                            | Verify the displayed class label                                                         | The class name shown matches CLASS_8B exactly (e.g., "Year 8B") — never another class.                                                                                                |        |           |
| SCH-S-045 | same                                                            | Verify week navigation controls (prev / next / "this week")                              | Buttons are present, focusable, and keyboard accessible; clicking "next week" re-fetches with `week_start` query param.                                                               |        |           |
| SCH-S-046 | same                                                            | Verify each lesson cell shows time band consistent with the period grid                  | Times match the `period-grid` for the academic year (e.g., Period 1 = 08:30–09:20).                                                                                                   |        |           |
| SCH-S-047 | same                                                            | Verify there is NO admin action surface (Pin, Edit, Delete, Substitute, Swap)            | None of `Pin`, `Unpin`, `Edit`, `Swap`, `Substitute`, `Cancel period`, `Emergency change` controls are rendered inside any lesson cell.                                               |        |           |
| SCH-S-048 | same                                                            | Verify there is NO link to "Open in admin" / "Override" / "Run scheduler"                | No such CTAs exist anywhere on the page.                                                                                                                                              |        |           |
| SCH-S-049 | same                                                            | Verify the calendar-subscription URL is NOT exposed to the student                       | No "Subscribe via webcal" / "Add to Apple Calendar" link is shown (calendar tokens are gated by `schedule.view_own`, which the student does NOT hold).                                |        |           |
| SCH-S-050 | `GET /api/v1/scheduling/calendar-tokens`                        | DevTools fetch as Adam                                                                   | API returns 403.                                                                                                                                                                      |        |           |
| SCH-S-051 | `POST /api/v1/scheduling/calendar-tokens`                       | DevTools fetch as Adam with body `{entity_type:"class", entity_id: CLASS_8B_ID}`         | API returns 403.                                                                                                                                                                      |        |           |
| SCH-S-052 | same page                                                       | Reload page 5× rapidly                                                                   | No duplicate fetches per click; no console errors; no 500/503 responses; layout remains stable.                                                                                       |        |           |
| SCH-S-053 | same page                                                       | Verify no admin-only telemetry / mixpanel events fire (e.g., `scheduling.run_triggered`) | DevTools shows no analytics call referencing admin-only event names.                                                                                                                  |        |           |

### 4.2 Week navigation

| #         | Page/Endpoint | Action                                                                | Expected                                                                                                                | Actual | Pass/Fail |
| --------- | ------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-060 | week nav      | Click "Next week"                                                     | URL updates with the new `week_start` query param; new fetch returns 200; lesson cells update without full page reload. |        |           |
| SCH-S-061 | week nav      | Click "Previous week"                                                 | Same — re-fetches with the prior week's `week_start`.                                                                   |        |           |
| SCH-S-062 | week nav      | Click "This week"                                                     | Returns to the current ISO week.                                                                                        |        |           |
| SCH-S-063 | week nav      | Navigate to a future week with no published TT extension              | Empty-state cells render; no crash; banner suggests "No lessons scheduled" or equivalent.                               |        |           |
| SCH-S-064 | week nav      | Navigate to a week before the academic year start                     | Empty state OR clamp to year-start; never a 500.                                                                        |        |           |
| SCH-S-065 | URL           | Manually edit `?week_start=` to a malformed value (e.g. `not-a-date`) | API returns 400 with structured `{code,message}`; UI shows toast "Invalid date" and falls back to current week.         |        |           |

---

## 5. Allowed view: lesson card content + bilingual + mobile

### 5.1 Lesson card content

| #         | Page/Endpoint          | Action                                                                                 | Expected                                                                                                                                                                      | Actual | Pass/Fail |
| --------- | ---------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-070 | lesson cell            | Open Adam's timetable for today; click (or hover, on desktop) the first lesson cell    | Cell shows: subject name, teacher name (full name), room label/code, start time, end time. NEVER shows: teacher email, teacher phone, teacher salary, teacher absence reason. |        |           |
| SCH-S-071 | lesson cell            | Verify subject text                                                                    | Matches the subject row's `name` (locale-aware if a translated name exists).                                                                                                  |        |           |
| SCH-S-072 | lesson cell            | Verify teacher text                                                                    | Shows teacher's display name only (first + last). Does NOT show internal staff_profile_id.                                                                                    |        |           |
| SCH-S-073 | lesson cell            | Verify room text                                                                       | Shows room name/code (e.g. "Room 12" / "Lab 3"). Does NOT show capacity, building wing, equipment list, or maintenance notes.                                                 |        |           |
| SCH-S-074 | lesson cell            | Verify time format                                                                     | Times rendered as 24-hour `HH:mm` in EN and AR (per redesign — Western numerals in both locales).                                                                             |        |           |
| SCH-S-075 | lesson cell with cover | Find a period today where Adam's normal teacher is absent and a substitute is assigned | Lesson cell shows the substitute name (or a "Cover" badge); substitution reason is NOT shown to the student.                                                                  |        |           |
| SCH-S-076 | lesson cell with cover | Verify the absent teacher's reason / personal note is NOT exposed                      | Tooltip / details panel does NOT show `reason`, `cancellation_reason`, `nominated_substitute_id`.                                                                             |        |           |
| SCH-S-077 | lesson cell            | Verify pinned vs auto-generated entries are visually identical to the student          | No "pinned" lock icon, no "auto" sparkle — the student does not need to know provenance.                                                                                      |        |           |
| SCH-S-078 | break period           | Verify break/lunch periods render distinctly (greyed / labelled "Break")               | Break cells render as non-interactive; no subject/teacher/room is shown for them.                                                                                             |        |           |
| SCH-S-079 | empty period           | Verify empty (free) periods render as blank or "Free"                                  | No phantom subject/teacher; no console error.                                                                                                                                 |        |           |

### 5.2 Bilingual EN / AR

| #         | Page/Endpoint     | Action                                                                                      | Expected                                                                                                                                              | Actual | Pass/Fail |
| --------- | ----------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-080 | language switcher | Switch UI to AR (`/ar/scheduling/my-timetable`)                                             | All static strings (weekday names, "Today", "Next week", "Free", "Break") render in Arabic; numbers remain Western (0–9); calendar remains Gregorian. |        |           |
| SCH-S-081 | AR layout         | Verify document direction is `dir="rtl"` on `<html>` and the timetable grid mirrors         | Mon column is on the right, Fri column on the left; period numbers ascend right-to-left in the row header.                                            |        |           |
| SCH-S-082 | AR layout         | Inspect DOM for any `ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*` classes             | None present in the timetable view (logical `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-` only).                                                       |        |           |
| SCH-S-083 | AR layout         | Verify time band still uses LTR for the digits (`08:30 – 09:20`)                            | Times preserved as LTR in both locales.                                                                                                               |        |           |
| SCH-S-084 | AR layout         | Verify subject names with both English and Arabic translations show the locale variant      | If a subject has both `name_en` and `name_ar`, AR view shows AR.                                                                                      |        |           |
| SCH-S-085 | AR layout         | Verify teacher name renders correctly (not as `???`)                                        | Names render as stored (Arabic names render as Arabic; Latin names remain Latin).                                                                     |        |           |
| SCH-S-086 | AR layout         | Verify week-nav arrow icons are mirrored (`rtl:rotate-180`)                                 | "Next" arrow visually points left in AR; "Previous" points right.                                                                                     |        |           |
| SCH-S-087 | AR layout         | Verify there is NO untranslated `auto.*` / `v2.*` / `runs.*` translation key fragment shown | No raw `scheduling.auto.something` strings leak through.                                                                                              |        |           |

### 5.3 Mobile (375 px viewport)

| #         | Page/Endpoint    | Action                                                                                       | Expected                                                                                                                                     | Actual | Pass/Fail |
| --------- | ---------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-090 | viewport 375×812 | Resize / emulate iPhone SE                                                                   | No horizontal page scrollbar; main page width ≤ 375 px.                                                                                      |        |           |
| SCH-S-091 | viewport 375     | Verify the timetable grid uses `overflow-x-auto` and scrolls horizontally inside its wrapper | The grid is scrollable left/right within its container; the page itself does not scroll horizontally.                                        |        |           |
| SCH-S-092 | viewport 375     | Verify minimum touch targets on week-nav buttons                                             | Each button ≥ 44×44 px.                                                                                                                      |        |           |
| SCH-S-093 | viewport 375     | Verify lesson cells are readable                                                             | Subject font ≥ 12 px; time font ≥ 12 px; nothing is clipped to "…" so aggressively that the subject is unreadable.                           |        |           |
| SCH-S-094 | viewport 375     | Verify hamburger / overlay nav shows the student's nav items only                            | No "Auto Scheduler", "Curriculum", "Competencies", "Run history", "Substitutions", "Substitution Board", "Exams", "Scenarios" etc. — see §8. |        |           |
| SCH-S-095 | viewport 375     | Verify the time inputs (if any) use `text-base` (16 px) — prevents iOS Safari auto-zoom      | If any input renders, font-size ≥ 16 px.                                                                                                     |        |           |
| SCH-S-096 | viewport 375     | Rotate to landscape (812×375)                                                                | Layout adapts; no overflow.                                                                                                                  |        |           |

---

## 6. Allowed view: empty state when no published TT

| #         | Page/Endpoint                 | Action                                                                                            | Expected                                                                                                                                                   | Actual | Pass/Fail |
| --------- | ----------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-100 | n/a (db)                      | Temporarily archive (or filter out) all published schedule rows for CLASS_8B for the current week | Reload Adam's timetable                                                                                                                                    |        |           |
| SCH-S-101 | `/en/scheduling/my-timetable` | Page load                                                                                         | Empty-state copy is shown (e.g., "No timetable published yet" / "Your timetable will appear here once it has been finalised") in EN; AR equivalent exists. |        |           |
| SCH-S-102 | same                          | Verify no admin CTA leaks into the empty state                                                    | No "Run scheduler" / "Create schedule" / "Configure" buttons appear.                                                                                       |        |           |
| SCH-S-103 | same                          | Inspect Network tab                                                                               | The student endpoint still returns 200 (with empty data array), not 404.                                                                                   |        |           |
| SCH-S-104 | same                          | Verify console is clean                                                                           | No "Cannot read properties of undefined" / no React render warnings.                                                                                       |        |           |
| SCH-S-105 | n/a (db)                      | Restore the data after the empty-state test                                                       | Subsequent reload shows the full timetable again.                                                                                                          |        |           |

---

## 7. Allowed view: dashboard / calendar integration

The student's main dashboard / home calendar surface is expected to surface upcoming lessons (e.g., "Today's lessons" strip, "Next class" card, or a calendar with lesson chips overlaid on engagement events).

| #         | Page/Endpoint                  | Action                                                                                 | Expected                                                                                                                                                                      | Actual | Pass/Fail |
| --------- | ------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-110 | `/en/(home)` student dashboard | Load Adam's home dashboard                                                             | A "Today's schedule" / "Upcoming lessons" strip is visible.                                                                                                                   |        |           |
| SCH-S-111 | dashboard                      | Inspect Network tab                                                                    | The dashboard tile fetches via `GET /v1/timetables/student/{ADAM_STUDENT_ID}` (or a thin facade thereof) — never `/v1/timetables/class/...` or `/v1/scheduling/timetable/my`. |        |           |
| SCH-S-112 | dashboard                      | Verify the upcoming-lessons strip shows ≥ 1 lesson (assuming today is a school day)    | Each chip shows subject + start time; teacher and room may be truncated for space but never omitted on hover/tap.                                                             |        |           |
| SCH-S-113 | dashboard                      | Click a lesson chip                                                                    | Navigates to (or expands inline) the full timetable view for that day.                                                                                                        |        |           |
| SCH-S-114 | dashboard                      | Verify a sibling student's lessons are NOT shown                                       | Strip only shows CLASS_8B lessons.                                                                                                                                            |        |           |
| SCH-S-115 | dashboard                      | Verify no admin scheduling KPI cards are visible                                       | No "Total Slots", "Completion %", "Pinned Slots", "Latest Run" cards (these are admin hub KPIs).                                                                              |        |           |
| SCH-S-116 | dashboard                      | Verify no "Substitution Board" tile, no "Cover Reports" tile, no "Auto Scheduler" tile | None present.                                                                                                                                                                 |        |           |
| SCH-S-117 | dashboard                      | Verify the calendar surface (if present) shows lessons overlaid on the school calendar | Lesson chips are rendered for Adam's class only.                                                                                                                              |        |           |
| SCH-S-118 | dashboard                      | Verify there is NO "Subscribe to calendar (.ics)" link in the student dashboard        | Calendar token feature is admin/teacher only.                                                                                                                                 |        |           |
| SCH-S-119 | dashboard, mobile 375          | Verify "Today's schedule" strip remains usable on 375 px                               | Horizontally scrollable inside its container, never breaks the page width.                                                                                                    |        |           |

---

## 8. Hidden navigation

The student's morph bar / hamburger overlay must NOT contain any of the admin scheduling tiles. The full inventory of admin scheduling navigation items is captured in `.inventory-frontend.md` §2 "Sub-strip / Hub Configuration".

### 8.1 Morph bar hubs

| #         | Page/Endpoint            | Action                                     | Expected                                                                                                                          | Actual | Pass/Fail |
| --------- | ------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-130 | morph bar                | Inspect the hubs visible to Adam           | Student-appropriate hubs only (e.g. Home, Learning, Wellbeing, Inbox). NO "Operations" hub icon appears in the student morph bar. |        |           |
| SCH-S-131 | morph bar                | Verify there is no "Scheduling" hub button | Absent.                                                                                                                           |        |           |
| SCH-S-132 | mobile hamburger overlay | Open the hamburger on mobile               | Same set of student-appropriate hubs only; no Scheduling / Operations leak.                                                       |        |           |

### 8.2 Sub-strip / hub-tile dashboard

| #         | Page/Endpoint                        | Action                                                                                     | Expected                                                                                                                                                                                                                                                                                                                                                                                                         | Actual | Pass/Fail |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-140 | any sub-strip visible to the student | Walk through every visible sub-strip                                                       | None of the following labels appear: "Auto Scheduler", "Runs", "Period Grid", "Curriculum", "Break Groups", "Room Closures", "Competencies", "Coverage", "Teacher Config", "Requirements", "Availability", "Preferences", "Substitutions", "Substitute Competencies", "Substitution Board", "Exams", "Scenarios", "Analytics Dashboard", "Cover Reports", "Leave Requests", "My Preferences", "My Satisfaction". |        |           |
| SCH-S-141 | any sub-strip                        | Verify no "Quick Actions" strip with "Auto Scheduler / Substitutions / Substitution Board" | The admin quick-actions strip is absent for student.                                                                                                                                                                                                                                                                                                                                                             |        |           |
| SCH-S-142 | any tile dashboard                   | Verify NO admin KPI cards reach the student                                                | No "Total Slots", "Completion %", "Pinned Slots", "Latest Run".                                                                                                                                                                                                                                                                                                                                                  |        |           |

### 8.3 Search / command palette

| #         | Page/Endpoint                | Action                                  | Expected                                                                                                                                     | Actual | Pass/Fail |
| --------- | ---------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-150 | command palette (e.g. Cmd+K) | Open the palette and search "scheduler" | No "Auto Scheduler", "Runs", "Curriculum", "Substitutions" command results appear. Only the student timetable result is suggested (or none). |        |           |
| SCH-S-151 | command palette              | Search "substitution"                   | No results (or only a help article).                                                                                                         |        |           |
| SCH-S-152 | command palette              | Search "exam"                           | No "Exam Scheduling" admin result. (Student exam viewer, if any, is a separate feature outside this spec.)                                   |        |           |

---

## 9. Direct URL access denial

For every admin scheduling URL, when Adam (logged in as student) navigates directly to it, the expected outcome is one of: HTTP 403 page, redirect to `/en/(home)`, redirect to `/en/login`, or an in-app "You do not have access" panel — but NEVER a 200 with admin data. Capture the actual outcome per row.

### 9.1 Hub & top-level

| #         | Page/Endpoint                                                     | Action                       | Expected                                                   | Actual | Pass/Fail |
| --------- | ----------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------- | ------ | --------- |
| SCH-S-200 | `/en/scheduling`                                                  | Navigate directly            | 403 / redirect / "no access" panel — NEVER admin hub KPIs. |        |           |
| SCH-S-201 | `/en/scheduling/auto`                                             | Navigate directly            | 403 / redirect.                                            |        |           |
| SCH-S-202 | `/en/scheduling/runs`                                             | Navigate directly            | 403 / redirect; NEVER a list of past runs.                 |        |           |
| SCH-S-203 | `/en/scheduling/runs/00000000-0000-0000-0000-000000000001/review` | Navigate directly (any UUID) | 403 / 404 / redirect; NEVER a run-review surface.          |        |           |
| SCH-S-204 | `/en/scheduling/runs/compare`                                     | Navigate directly            | 403 / redirect.                                            |        |           |

### 9.2 Configuration

| #         | Page/Endpoint                  | Action            | Expected        | Actual | Pass/Fail |
| --------- | ------------------------------ | ----------------- | --------------- | ------ | --------- |
| SCH-S-210 | `/en/scheduling/period-grid`   | Navigate directly | 403 / redirect. |        |           |
| SCH-S-211 | `/en/scheduling/curriculum`    | Navigate directly | 403 / redirect. |        |           |
| SCH-S-212 | `/en/scheduling/break-groups`  | Navigate directly | 403 / redirect. |        |           |
| SCH-S-213 | `/en/scheduling/room-closures` | Navigate directly | 403 / redirect. |        |           |

### 9.3 Staff configuration

| #         | Page/Endpoint                            | Action            | Expected        | Actual | Pass/Fail |
| --------- | ---------------------------------------- | ----------------- | --------------- | ------ | --------- |
| SCH-S-220 | `/en/scheduling/competencies`            | Navigate directly | 403 / redirect. |        |           |
| SCH-S-221 | `/en/scheduling/substitute-competencies` | Navigate directly | 403 / redirect. |        |           |
| SCH-S-222 | `/en/scheduling/competency-coverage`     | Navigate directly | 403 / redirect. |        |           |
| SCH-S-223 | `/en/scheduling/teacher-config`          | Navigate directly | 403 / redirect. |        |           |

### 9.4 Inputs & preferences

| #         | Page/Endpoint                                   | Action            | Expected        | Actual | Pass/Fail |
| --------- | ----------------------------------------------- | ----------------- | --------------- | ------ | --------- |
| SCH-S-230 | `/en/scheduling/availability`                   | Navigate directly | 403 / redirect. |        |           |
| SCH-S-231 | `/en/scheduling/preferences`                    | Navigate directly | 403 / redirect. |        |           |
| SCH-S-232 | `/en/scheduling/requirements`                   | Navigate directly | 403 / redirect. |        |           |
| SCH-S-233 | `/en/scheduling/requirements/subject-overrides` | Navigate directly | 403 / redirect. |        |           |

### 9.5 Operations & live

| #         | Page/Endpoint                       | Action            | Expected                                                                                                                                                                                        | Actual | Pass/Fail |
| --------- | ----------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-240 | `/en/scheduling/substitutions`      | Navigate directly | 403 / redirect.                                                                                                                                                                                 |        |           |
| SCH-S-241 | `/en/scheduling/substitution-board` | Navigate directly | 403 / redirect — even though the public-board endpoint is technically un-gated, the in-app route should require an admin-tier session. The student MUST NOT see the kiosk via the in-app shell. |        |           |
| SCH-S-242 | `/en/scheduling/exams`              | Navigate directly | 403 / redirect.                                                                                                                                                                                 |        |           |
| SCH-S-243 | `/en/scheduling/scenarios`          | Navigate directly | 403 / redirect.                                                                                                                                                                                 |        |           |

### 9.6 Analytics & reporting

| #         | Page/Endpoint                  | Action            | Expected        | Actual | Pass/Fail |
| --------- | ------------------------------ | ----------------- | --------------- | ------ | --------- |
| SCH-S-250 | `/en/scheduling/dashboard`     | Navigate directly | 403 / redirect. |        |           |
| SCH-S-251 | `/en/scheduling/cover-reports` | Navigate directly | 403 / redirect. |        |           |

### 9.7 Self-service routes that exist for STAFF (must be denied to student)

| #         | Page/Endpoint                    | Action            | Expected                                                                 | Actual | Pass/Fail |
| --------- | -------------------------------- | ----------------- | ------------------------------------------------------------------------ | ------ | --------- |
| SCH-S-260 | `/en/scheduling/my-preferences`  | Navigate directly | 403 / redirect — preferences are a staff feature, not a student feature. |        |           |
| SCH-S-261 | `/en/scheduling/my-satisfaction` | Navigate directly | 403 / redirect — satisfaction dashboard is staff-only.                   |        |           |
| SCH-S-262 | `/en/scheduling/leave-requests`  | Navigate directly | 403 / redirect — leave-request review is admin/HR only.                  |        |           |

### 9.8 Cross-class browse routes (must be denied or scope-limited)

| #         | Page/Endpoint                                            | Action            | Expected                                                                  | Actual | Pass/Fail |
| --------- | -------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-270 | `/en/timetables`                                         | Navigate directly | 403 / redirect — student must not see the cross-module timetable browser. |        |           |
| SCH-S-271 | `/en/timetables?class_id={CLASS_9A_ID}` (Maryam's class) | Navigate directly | 403 / redirect; NEVER another class's TT.                                 |        |           |
| SCH-S-272 | `/en/timetables?student_id={MARYAM_STUDENT_ID}`          | Navigate directly | 403 / redirect; NEVER a peer's TT.                                        |        |           |
| SCH-S-273 | `/en/schedules`                                          | Navigate directly | 403 / redirect — manual schedule CRUD is admin-only.                      |        |           |
| SCH-S-274 | `/(print)/timetables/rooms/{ROOM_ID}/print`              | Navigate directly | 403 / redirect — room-print is operational, not a student feature.        |        |           |

---

## 10. API permission denial

For every admin scheduling endpoint, the student's bearer token must be rejected. Execute via DevTools `fetch(...)` with Adam's session cookie. Expected: 403 (or 401 if the session is not a member of the route's permission). 200 with admin data is a security failure.

> The full endpoint list lives in `.inventory-backend.md` §1. The matrix below is exhaustive for the admin-tier surface.

### 10.1 TeacherCompetenciesController

| #         | Page/Endpoint                                                            | Action                         | Expected | Actual | Pass/Fail |
| --------- | ------------------------------------------------------------------------ | ------------------------------ | -------- | ------ | --------- |
| SCH-S-300 | `GET /api/v1/scheduling/teacher-competencies`                            | DevTools fetch                 | 403.     |        |           |
| SCH-S-301 | `GET /api/v1/scheduling/teacher-competencies/coverage`                   | DevTools fetch                 | 403.     |        |           |
| SCH-S-302 | `GET /api/v1/scheduling/teacher-competencies/by-teacher/{anyStaffId}`    | DevTools fetch                 | 403.     |        |           |
| SCH-S-303 | `GET /api/v1/scheduling/teacher-competencies/by-subject`                 | DevTools fetch                 | 403.     |        |           |
| SCH-S-304 | `POST /api/v1/scheduling/teacher-competencies`                           | DevTools fetch with valid body | 403.     |        |           |
| SCH-S-305 | `POST /api/v1/scheduling/teacher-competencies/bulk`                      | DevTools fetch                 | 403.     |        |           |
| SCH-S-306 | `PATCH /api/v1/scheduling/teacher-competencies/{id}`                     | DevTools fetch                 | 403.     |        |           |
| SCH-S-307 | `DELETE /api/v1/scheduling/teacher-competencies/{id}`                    | DevTools fetch                 | 403.     |        |           |
| SCH-S-308 | `DELETE /api/v1/scheduling/teacher-competencies/by-teacher/{anyStaffId}` | DevTools fetch                 | 403.     |        |           |
| SCH-S-309 | `POST /api/v1/scheduling/teacher-competencies/copy`                      | DevTools fetch                 | 403.     |        |           |
| SCH-S-310 | `POST /api/v1/scheduling/teacher-competencies/copy-to-years`             | DevTools fetch                 | 403.     |        |           |

### 10.2 SubstituteCompetenciesController

| #         | Page/Endpoint                                            | Action         | Expected | Actual | Pass/Fail |
| --------- | -------------------------------------------------------- | -------------- | -------- | ------ | --------- |
| SCH-S-320 | `GET /api/v1/scheduling/substitute-competencies`         | DevTools fetch | 403.     |        |           |
| SCH-S-321 | `GET /api/v1/scheduling/substitute-competencies/suggest` | DevTools fetch | 403.     |        |           |
| SCH-S-322 | `POST /api/v1/scheduling/substitute-competencies`        | DevTools fetch | 403.     |        |           |
| SCH-S-323 | `PATCH /api/v1/scheduling/substitute-competencies/{id}`  | DevTools fetch | 403.     |        |           |
| SCH-S-324 | `DELETE /api/v1/scheduling/substitute-competencies/{id}` | DevTools fetch | 403.     |        |           |

### 10.3 BreakGroupsController, CurriculumRequirementsController, RoomClosuresController, TeacherSchedulingConfigController

| #         | Page/Endpoint                                                    | Action         | Expected | Actual | Pass/Fail |
| --------- | ---------------------------------------------------------------- | -------------- | -------- | ------ | --------- |
| SCH-S-330 | `GET /api/v1/scheduling/break-groups`                            | DevTools fetch | 403.     |        |           |
| SCH-S-331 | `POST /api/v1/scheduling/break-groups`                           | DevTools fetch | 403.     |        |           |
| SCH-S-332 | `PATCH /api/v1/scheduling/break-groups/{id}`                     | DevTools fetch | 403.     |        |           |
| SCH-S-333 | `DELETE /api/v1/scheduling/break-groups/{id}`                    | DevTools fetch | 403.     |        |           |
| SCH-S-334 | `GET /api/v1/scheduling/curriculum-requirements`                 | DevTools fetch | 403.     |        |           |
| SCH-S-335 | `GET /api/v1/scheduling/curriculum-requirements/matrix-subjects` | DevTools fetch | 403.     |        |           |
| SCH-S-336 | `POST /api/v1/scheduling/curriculum-requirements`                | DevTools fetch | 403.     |        |           |
| SCH-S-337 | `PATCH /api/v1/scheduling/curriculum-requirements/{id}`          | DevTools fetch | 403.     |        |           |
| SCH-S-338 | `DELETE /api/v1/scheduling/curriculum-requirements/{id}`         | DevTools fetch | 403.     |        |           |
| SCH-S-339 | `POST /api/v1/scheduling/curriculum-requirements/bulk-upsert`    | DevTools fetch | 403.     |        |           |
| SCH-S-340 | `POST /api/v1/scheduling/curriculum-requirements/copy`           | DevTools fetch | 403.     |        |           |
| SCH-S-341 | `GET /api/v1/scheduling/room-closures`                           | DevTools fetch | 403.     |        |           |
| SCH-S-342 | `POST /api/v1/scheduling/room-closures`                          | DevTools fetch | 403.     |        |           |
| SCH-S-343 | `DELETE /api/v1/scheduling/room-closures/{id}`                   | DevTools fetch | 403.     |        |           |
| SCH-S-344 | `GET /api/v1/scheduling/teacher-config`                          | DevTools fetch | 403.     |        |           |
| SCH-S-345 | `PUT /api/v1/scheduling/teacher-config`                          | DevTools fetch | 403.     |        |           |
| SCH-S-346 | `DELETE /api/v1/scheduling/teacher-config/{id}`                  | DevTools fetch | 403.     |        |           |
| SCH-S-347 | `POST /api/v1/scheduling/teacher-config/copy`                    | DevTools fetch | 403.     |        |           |

### 10.4 SchedulerOrchestrationController + SchedulingRunsController + SchedulerValidationController

| #         | Page/Endpoint                                               | Action         | Expected | Actual | Pass/Fail |
| --------- | ----------------------------------------------------------- | -------------- | -------- | ------ | --------- |
| SCH-S-360 | `POST /api/v1/scheduling/runs/prerequisites`                | DevTools fetch | 403.     |        |           |
| SCH-S-361 | `POST /api/v1/scheduling/runs/trigger`                      | DevTools fetch | 403.     |        |           |
| SCH-S-362 | `GET /api/v1/scheduling/runs`                               | DevTools fetch | 403.     |        |           |
| SCH-S-363 | `GET /api/v1/scheduling/runs/{anyId}`                       | DevTools fetch | 403.     |        |           |
| SCH-S-364 | `POST /api/v1/scheduling/runs/{anyId}/apply`                | DevTools fetch | 403.     |        |           |
| SCH-S-365 | `POST /api/v1/scheduling/runs/{anyId}/discard`              | DevTools fetch | 403.     |        |           |
| SCH-S-366 | `POST /api/v1/scheduling/runs/{anyId}/cancel`               | DevTools fetch | 403.     |        |           |
| SCH-S-367 | `GET /api/v1/scheduling/runs/{anyId}/status`                | DevTools fetch | 403.     |        |           |
| SCH-S-368 | `POST /api/v1/scheduling/runs/{anyId}/validate`             | DevTools fetch | 403.     |        |           |
| SCH-S-369 | `GET /api/v1/scheduling-runs`                               | DevTools fetch | 403.     |        |           |
| SCH-S-370 | `GET /api/v1/scheduling-runs/prerequisites`                 | DevTools fetch | 403.     |        |           |
| SCH-S-371 | `GET /api/v1/scheduling-runs/feasibility`                   | DevTools fetch | 403.     |        |           |
| SCH-S-372 | `POST /api/v1/scheduling-runs`                              | DevTools fetch | 403.     |        |           |
| SCH-S-373 | `GET /api/v1/scheduling-runs/{anyId}`                       | DevTools fetch | 403.     |        |           |
| SCH-S-374 | `GET /api/v1/scheduling-runs/{anyId}/progress`              | DevTools fetch | 403.     |        |           |
| SCH-S-375 | `GET /api/v1/scheduling-runs/{anyId}/diagnostics`           | DevTools fetch | 403.     |        |           |
| SCH-S-376 | `POST /api/v1/scheduling-runs/{anyId}/diagnostics/simulate` | DevTools fetch | 403.     |        |           |
| SCH-S-377 | `POST /api/v1/scheduling-runs/{anyId}/diagnostics/refresh`  | DevTools fetch | 403.     |        |           |
| SCH-S-378 | `POST /api/v1/scheduling-runs/{anyId}/cancel`               | DevTools fetch | 403.     |        |           |
| SCH-S-379 | `PATCH /api/v1/scheduling-runs/{anyId}/adjustments`         | DevTools fetch | 403.     |        |           |
| SCH-S-380 | `POST /api/v1/scheduling-runs/{anyId}/apply`                | DevTools fetch | 403.     |        |           |
| SCH-S-381 | `POST /api/v1/scheduling-runs/{anyId}/discard`              | DevTools fetch | 403.     |        |           |

### 10.5 SchedulingDashboardController

| #         | Page/Endpoint                                       | Action         | Expected | Actual | Pass/Fail |
| --------- | --------------------------------------------------- | -------------- | -------- | ------ | --------- |
| SCH-S-390 | `GET /api/v1/scheduling-dashboard/overview`         | DevTools fetch | 403.     |        |           |
| SCH-S-391 | `GET /api/v1/scheduling-dashboard/workload`         | DevTools fetch | 403.     |        |           |
| SCH-S-392 | `GET /api/v1/scheduling-dashboard/unassigned`       | DevTools fetch | 403.     |        |           |
| SCH-S-393 | `GET /api/v1/scheduling-dashboard/room-utilisation` | DevTools fetch | 403.     |        |           |
| SCH-S-394 | `GET /api/v1/scheduling-dashboard/trends`           | DevTools fetch | 403.     |        |           |
| SCH-S-395 | `GET /api/v1/scheduling-dashboard/preferences`      | DevTools fetch | 403.     |        |           |

### 10.6 SchedulingEnhancedController — substitution / absences / offers / swaps / emergencies / rotation / exams / scenarios / analytics

| #         | Page/Endpoint                                                       | Action         | Expected                                                                                                                                                            | Actual | Pass/Fail |
| --------- | ------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-400 | `POST /api/v1/scheduling/absences`                                  | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-401 | `POST /api/v1/scheduling/absences/self-report`                      | DevTools fetch | 403 — students cannot self-report (this permission is teacher-only).                                                                                                |        |           |
| SCH-S-402 | `GET /api/v1/scheduling/absences`                                   | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-403 | `DELETE /api/v1/scheduling/absences/{anyId}`                        | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-404 | `POST /api/v1/scheduling/absences/{anyId}/cancel`                   | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-405 | `POST /api/v1/scheduling/absences/{anyId}/cancel-own`               | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-406 | `GET /api/v1/scheduling/absences/{anyId}/substitutes`               | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-407 | `GET /api/v1/scheduling/absences/{anyId}/substitutes/ai`            | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-408 | `POST /api/v1/scheduling/substitutions`                             | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-409 | `GET /api/v1/scheduling/substitutions`                              | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-410 | `GET /api/v1/scheduling/substitution-board`                         | DevTools fetch | 403 (in the in-app context with student session). Note: the public board route works only on the kiosk path; through the in-app session it must reject the student. |        |           |
| SCH-S-411 | `GET /api/v1/scheduling/offers/my`                                  | DevTools fetch | 403 — students do not receive offers.                                                                                                                               |        |           |
| SCH-S-412 | `POST /api/v1/scheduling/offers/{anyId}/accept`                     | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-413 | `POST /api/v1/scheduling/offers/{anyId}/decline`                    | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-414 | `GET /api/v1/scheduling/colleagues`                                 | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-415 | `GET /api/v1/scheduling/teachers`                                   | DevTools fetch | 403 — student must not enumerate the teacher directory through this admin endpoint.                                                                                 |        |           |
| SCH-S-416 | `GET /api/v1/scheduling/cover-reports`                              | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-417 | `GET /api/v1/scheduling/cover-reports/fairness`                     | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-418 | `GET /api/v1/scheduling/cover-reports/by-department`                | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-419 | `POST /api/v1/scheduling/swaps/validate`                            | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-420 | `POST /api/v1/scheduling/swaps/execute`                             | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-421 | `POST /api/v1/scheduling/emergency-change`                          | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-422 | `GET /api/v1/scheduling/timetable/teacher/{anyStaffId}`             | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-423 | `GET /api/v1/scheduling/timetable/my`                               | DevTools fetch | 403 — this is the teacher-facing self-TT endpoint; students MUST use `/v1/timetables/student/:studentId` instead.                                                   |        |           |
| SCH-S-424 | `GET /api/v1/scheduling/timetable/class/{CLASS_8B_ID}`              | DevTools fetch | 403 — even for the student's own class, the admin-tier endpoint rejects.                                                                                            |        |           |
| SCH-S-425 | `POST /api/v1/scheduling/calendar-tokens`                           | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-426 | `GET /api/v1/scheduling/calendar-tokens`                            | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-427 | `DELETE /api/v1/scheduling/calendar-tokens/{anyId}`                 | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-428 | `PUT /api/v1/scheduling/rotation`                                   | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-429 | `GET /api/v1/scheduling/rotation`                                   | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-430 | `DELETE /api/v1/scheduling/rotation`                                | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-431 | `GET /api/v1/scheduling/rotation/current-week`                      | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-432 | `POST /api/v1/scheduling/exam-sessions`                             | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-433 | `GET /api/v1/scheduling/exam-sessions`                              | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-434 | `GET /api/v1/scheduling/exam-sessions/{anyId}`                      | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-435 | `PUT /api/v1/scheduling/exam-sessions/{anyId}`                      | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-436 | `DELETE /api/v1/scheduling/exam-sessions/{anyId}`                   | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-437 | `GET /api/v1/scheduling/exam-sessions/{anyId}/slots`                | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-438 | `POST /api/v1/scheduling/exam-sessions/{anyId}/slots`               | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-439 | `POST /api/v1/scheduling/exam-sessions/{anyId}/generate`            | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-440 | `POST /api/v1/scheduling/exam-sessions/{anyId}/assign-invigilators` | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-441 | `POST /api/v1/scheduling/exam-sessions/{anyId}/publish`             | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-442 | `POST /api/v1/scheduling/scenarios`                                 | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-443 | `GET /api/v1/scheduling/scenarios`                                  | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-444 | `GET /api/v1/scheduling/scenarios/{anyId}`                          | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-445 | `PUT /api/v1/scheduling/scenarios/{anyId}`                          | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-446 | `DELETE /api/v1/scheduling/scenarios/{anyId}`                       | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-447 | `POST /api/v1/scheduling/scenarios/{anyId}/solve`                   | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-448 | `POST /api/v1/scheduling/scenarios/compare`                         | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-449 | `GET /api/v1/scheduling/analytics/efficiency`                       | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-450 | `GET /api/v1/scheduling/analytics/workload`                         | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-451 | `GET /api/v1/scheduling/analytics/rooms`                            | DevTools fetch | 403.                                                                                                                                                                |        |           |
| SCH-S-452 | `GET /api/v1/scheduling/analytics/historical`                       | DevTools fetch | 403.                                                                                                                                                                |        |           |

### 10.7 SchedulesController + TimetablesController

| #         | Page/Endpoint                                                         | Action                                         | Expected                                                                                                                      | Actual | Pass/Fail |
| --------- | --------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-460 | `POST /api/v1/schedules`                                              | DevTools fetch                                 | 403.                                                                                                                          |        |           |
| SCH-S-461 | `GET /api/v1/schedules`                                               | DevTools fetch                                 | 403.                                                                                                                          |        |           |
| SCH-S-462 | `GET /api/v1/schedules/{anyId}`                                       | DevTools fetch                                 | 403.                                                                                                                          |        |           |
| SCH-S-463 | `PATCH /api/v1/schedules/{anyId}`                                     | DevTools fetch                                 | 403.                                                                                                                          |        |           |
| SCH-S-464 | `DELETE /api/v1/schedules/{anyId}`                                    | DevTools fetch                                 | 403.                                                                                                                          |        |           |
| SCH-S-465 | `POST /api/v1/schedules/bulk-pin`                                     | DevTools fetch                                 | 403.                                                                                                                          |        |           |
| SCH-S-466 | `POST /api/v1/schedules/{anyId}/pin`                                  | DevTools fetch                                 | 403.                                                                                                                          |        |           |
| SCH-S-467 | `POST /api/v1/schedules/{anyId}/unpin`                                | DevTools fetch                                 | 403.                                                                                                                          |        |           |
| SCH-S-468 | `GET /api/v1/timetables/teacher/{anyStaffId}`                         | DevTools fetch                                 | 403.                                                                                                                          |        |           |
| SCH-S-469 | `GET /api/v1/timetables/class/{CLASS_8B_ID}`                          | DevTools fetch                                 | 403 — even Adam's own class via the admin-tier endpoint must reject; the student MUST use the `/student/:studentId` endpoint. |        |           |
| SCH-S-470 | `GET /api/v1/timetables/class/{CLASS_9A_ID}`                          | DevTools fetch                                 | 403 — never reveal another class's TT.                                                                                        |        |           |
| SCH-S-471 | `GET /api/v1/timetables/room/{anyRoomId}`                             | DevTools fetch                                 | 403.                                                                                                                          |        |           |
| SCH-S-472 | `GET /api/v1/timetables/student/{ADAM_STUDENT_ID}`                    | DevTools fetch                                 | **200** — this is the ONE allowed read for the student.                                                                       |        |           |
| SCH-S-473 | `GET /api/v1/timetables/student/{MARYAM_STUDENT_ID}`                  | DevTools fetch                                 | 403 or 404 — the student MUST NOT be able to fetch a peer's timetable by guessing the student id.                             |        |           |
| SCH-S-474 | `GET /api/v1/timetables/student/00000000-0000-0000-0000-000000000000` | DevTools fetch with a random non-existent UUID | 404 — never 200; never 500.                                                                                                   |        |           |
| SCH-S-475 | `GET /api/v1/reports/workload`                                        | DevTools fetch                                 | 403.                                                                                                                          |        |           |

### 10.8 SchedulingPublicController (token-based)

| #         | Page/Endpoint                                       | Action                                         | Expected                                                              | Actual | Pass/Fail |
| --------- | --------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- | ------ | --------- |
| SCH-S-480 | `GET /api/v1/calendar/{tenantId}/{forgedToken}.ics` | DevTools fetch with a random 64-char hex token | 401 / 404 — never 200 with another tenant's TT; token is unforgeable. |        |           |

---

## 11. Cross-cutting: console errors, network 4xx/5xx, RTL, dark mode, mobile

| #         | Page/Endpoint                 | Action                                                                          | Expected                                                                                                                                                                          | Actual | Pass/Fail |
| --------- | ----------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-500 | `/en/scheduling/my-timetable` | Open DevTools console; load page; navigate weeks                                | Zero `console.error` entries; zero React render warnings; zero "key" warnings; zero `Hydration failed` warnings.                                                                  |        |           |
| SCH-S-501 | same                          | Inspect Network tab over a 5-min session                                        | All requests return 2xx or expected 4xx (per §10); zero unexpected 500/502/503; no `pending` requests left hanging > 30 s.                                                        |        |           |
| SCH-S-502 | same, AR locale               | Switch to `/ar/scheduling/my-timetable`                                         | Layout fully mirrored (RTL); week-nav arrows mirrored; no LTR leakage; clean console.                                                                                             |        |           |
| SCH-S-503 | same, dark mode               | Toggle dark mode (system or in-app)                                             | All text remains readable; lesson cells use semantic tokens (`bg-card`, `text-text-primary`); no white-on-white or black-on-black; no hardcoded hex colours visible via DevTools. |        |           |
| SCH-S-504 | same, light mode              | Toggle back                                                                     | Symmetric — same legibility.                                                                                                                                                      |        |           |
| SCH-S-505 | same, mobile 375              | Reload                                                                          | No horizontal page scroll; lesson grid scrolls inside its wrapper; week-nav buttons ≥ 44 px; bilingual day labels truncated cleanly.                                              |        |           |
| SCH-S-506 | same, mobile 375 + AR         | Reload                                                                          | RTL + mobile both work simultaneously; no class clipping; no `mr-`/`ml-` regressions detectable.                                                                                  |        |           |
| SCH-S-507 | same                          | Tab-key through the page                                                        | Focus order is logical; visible focus ring on every interactive element; no focus traps.                                                                                          |        |           |
| SCH-S-508 | same                          | Run Lighthouse accessibility audit                                              | Score ≥ 95; no critical violations; no missing labels on week-nav buttons.                                                                                                        |        |           |
| SCH-S-509 | same                          | Verify no untranslated strings (search DOM for `scheduling.` raw key fragments) | No keys leak; all strings are localized.                                                                                                                                          |        |           |
| SCH-S-510 | same                          | Verify no Sentry / error-tracker noise from this page                           | No "Tenant context not found" or "Permission denied" leaks make it to Sentry under student session.                                                                               |        |           |
| SCH-S-511 | session                       | Let the session idle for 16 min                                                 | JWT refresh quietly happens; the page does not crash, redirect to login, or show stale data; next week-nav click still works.                                                     |        |           |
| SCH-S-512 | network                       | Throttle to "Slow 3G" and reload                                                | Loading skeleton renders; eventual success; no duplicate calls.                                                                                                                   |        |           |
| SCH-S-513 | network                       | Go offline mid-session and click "Next week"                                    | Graceful toast/error: "Could not load timetable. Check your connection." — no white screen.                                                                                       |        |           |

---

## 12. Data invariants

The student is allowed to see exactly the schedule rows where the `class_id` matches the class to which the student row is mapped. Sibling, peer, room, teacher, or other class data must never leak.

| #         | Page/Endpoint                                      | Action                                                                                     | Expected                                                                              | Actual | Pass/Fail |
| --------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-600 | `GET /api/v1/timetables/student/{ADAM_STUDENT_ID}` | Inspect response                                                                           | Every entry's `class_id` === CLASS_8B_ID. No row from CLASS_9A or any other class.    |        |           |
| SCH-S-601 | response                                           | Verify there is NO `teacher_email`, `teacher_phone`, `teacher_dob`, `teacher_salary` field | Sensitive teacher PII is not exposed.                                                 |        |           |
| SCH-S-602 | response                                           | Verify there is NO `pin_reason`, `created_by_user_id`, `scheduling_run_id` exposed         | Audit / provenance fields are hidden from student.                                    |        |           |
| SCH-S-603 | response                                           | Verify there is NO `solver_seed`, `soft_preference_score`, `result_json` shape             | Solver internals are hidden.                                                          |        |           |
| SCH-S-604 | URL guess                                          | Try `GET /api/v1/timetables/student/{MARYAM_STUDENT_ID}`                                   | 403/404 — see SCH-S-473.                                                              |        |           |
| SCH-S-605 | URL guess                                          | Try with sequential nearby UUIDs (last byte ±1, ±2, …)                                     | 403/404 each time; no row leaks.                                                      |        |           |
| SCH-S-606 | URL guess                                          | Try `GET /api/v1/timetables/student/{ADAM_STUDENT_ID}` with mismatched `academic_year_id`  | 200 with empty data (or 400) — never returns rows from a different student or tenant. |        |           |
| SCH-S-607 | URL injection                                      | Try `GET /api/v1/timetables/student/{ADAM_STUDENT_ID}?include=teacher_personal`            | Unknown query params silently ignored; no expansion of fields.                        |        |           |
| SCH-S-608 | URL injection                                      | Try SQL-injection-shaped student id: `'; DROP TABLE schedule; --`                          | 400 (validation rejects non-UUID); no SQL execution.                                  |        |           |
| SCH-S-609 | UI                                                 | Inspect the rendered HTML for any `data-class-id` attributes                               | Only Adam's `CLASS_8B_ID` appears anywhere in the DOM.                                |        |           |
| SCH-S-610 | UI                                                 | Search rendered DOM for `MARYAM_STUDENT_ID`                                                | Not found.                                                                            |        |           |
| SCH-S-611 | UI                                                 | Search rendered DOM for any other `student.id` from the tenant                             | Not found.                                                                            |        |           |
| SCH-S-612 | network response                                   | Verify total payload size is small (single class week) — should be ≤ ~50 KB typically      | No accidental dump of all-classes data.                                               |        |           |

---

## 13. Multi-tenant RLS hostile-pair

Adam (nhqs student) attempts to access `stress-a` data. Every attempt MUST fail; the tenant boundary is enforced both by hostname/cookie scoping and by RLS at the DB layer.

| #         | Page/Endpoint                                                                     | Action                                                                                                                                                                                                        | Expected                                                                                                                              | Actual | Pass/Fail |
| --------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-S-700 | `https://stress-a.edupod.app/en/scheduling/my-timetable`                          | While logged in to nhqs, navigate to the stress-a hostname directly                                                                                                                                           | Redirect to stress-a login page — Adam's nhqs cookie does NOT carry over (cookie domain is `nhqs.edupod.app`).                        |        |           |
| SCH-S-701 | `GET https://nhqs.edupod.app/api/v1/timetables/student/{STRESS_A_STUDENT_ID}`     | DevTools fetch from inside Adam's nhqs session                                                                                                                                                                | 404 — student id not found within nhqs tenant context (RLS scopes to nhqs).                                                           |        |           |
| SCH-S-702 | `GET https://nhqs.edupod.app/api/v1/timetables/class/{STRESS_A_CLASS_ID}`         | DevTools fetch                                                                                                                                                                                                | 403 (admin endpoint) — and even if permission were held, RLS would 404 because the class id does not exist in the nhqs tenant.        |        |           |
| SCH-S-703 | `GET https://nhqs.edupod.app/api/v1/scheduling-runs/{STRESS_A_RUN_ID}`            | DevTools fetch                                                                                                                                                                                                | 403 — student lacks permission; even with permission, RLS would scope away the row.                                                   |        |           |
| SCH-S-704 | `GET https://nhqs.edupod.app/api/v1/calendar/{STRESS_A_TENANT_ID}/{anyToken}.ics` | DevTools fetch                                                                                                                                                                                                | 401 / 404 — the public-calendar endpoint requires the token + tenant pair to match in the DB; a guessed token never resolves.         |        |           |
| SCH-S-705 | network                                                                           | Inspect the JWT payload Adam holds                                                                                                                                                                            | The `tenant_id` claim in the JWT is the nhqs tenant UUID, never the stress-a one.                                                     |        |           |
| SCH-S-706 | network                                                                           | Attempt to spoof tenant via `X-Tenant-Id` header set to stress-a's tenant UUID                                                                                                                                | API ignores the header (tenant context is derived from JWT, not from request headers); RLS context is not switchable from the client. |        |           |
| SCH-S-707 | network                                                                           | Attempt to spoof tenant via subdomain rewrite while keeping the nhqs cookie                                                                                                                                   | Browser blocks cross-domain cookie; even if forwarded, server rejects mismatched JWT vs hostname.                                     |        |           |
| SCH-S-708 | DB-layer (run by ops, not the student)                                            | Confirm that running the actual student endpoint with Adam's `app.current_tenant_id` set to stress-a's UUID would still 404 — i.e. the controller derives tenant from JWT, never from a client-supplied value | Validated in `integration/scheduling-integration-spec.md`; cross-reference here.                                                      |        |           |

---

## 14. Observations / bugs spotted

This section is filled in DURING execution. Expected categories of finding (based on inventory review) — confirm or refute each:

| #         | Page/Endpoint                                                                       | Observation (working hypothesis)                                                                                                                                                                                                                                                       | Evidence to capture                                                                                        | Status (Confirmed / Refuted / N/A) |
| --------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| SCH-S-800 | `/scheduling/my-timetable`                                                          | The current product page may render student / teacher views from the same component. Verify the page does NOT call the teacher-only `/v1/scheduling/timetable/my` endpoint when a student is logged in (would give 403 in console).                                                    | Network tab screenshot showing `/v1/timetables/student/{id}` is called, NOT `/v1/scheduling/timetable/my`. |                                    |
| SCH-S-801 | `/scheduling/availability/page.tsx` (admin page — not directly relevant to student) | The `text-xs` violation on time inputs noted in `.inventory-frontend.md` is admin-side only. Student should never hit this page (covered by SCH-S-230).                                                                                                                                | n/a — student-side observation only: confirm SCH-S-230 returns 403, NOT a flash of the broken page.        |                                    |
| SCH-S-802 | substitution-board                                                                  | The board endpoint `GET /v1/scheduling/substitution-board` is documented as "no permission gate for internal use" but the in-app route MUST still gate the student. Check whether the student's session can reach the API and read absences (would be a leak of teacher absence info). | DevTools call to `/v1/scheduling/substitution-board` from Adam's session — must return 403.                |                                    |
| SCH-S-803 | hub                                                                                 | Confirm that the `/scheduling` hub route's "redirect non-admin to /inbox" pattern from the Communications module is mirrored here, OR the hub returns 403 cleanly for the student.                                                                                                     | Capture actual outcome.                                                                                    |                                    |
| SCH-S-804 | dashboard tile                                                                      | If the student dashboard surfaces "next lesson" via a generic tile, confirm it doesn't reuse `/v1/scheduling/timetable/my` (which would 403) and instead uses `/v1/timetables/student/{id}`.                                                                                           | Network tab snapshot.                                                                                      |                                    |
| SCH-S-805 | week-nav                                                                            | If the page caches the prior week's data in client state, verify cache is keyed by week_start AND student_id — switching tenants/users must invalidate.                                                                                                                                | Manual swap-user test.                                                                                     |                                    |
| SCH-S-806 | empty state                                                                         | If no published TT exists yet, the page must NOT show "Click here to run scheduler" (admin CTA) — that would be a permission leak in copy.                                                                                                                                             | Screenshot of empty state.                                                                                 |                                    |
| SCH-S-807 | RTL                                                                                 | Verify subject names with mixed Arabic-Latin content render correctly with `dir="auto"` on the cell text.                                                                                                                                                                              | Visual inspection.                                                                                         |                                    |
| SCH-S-808 | calendar token                                                                      | If the student dashboard accidentally exposes the iCal subscription URL (admin/teacher feature), this is a feature leak.                                                                                                                                                               | DOM inspection — no `webcal://` link.                                                                      |                                    |

---

## 15. Sign-off

This spec has been executed end-to-end against the multi-tenant test environment described in §1 and §2. All denied URLs and endpoints have been verified to reject the student session. All allowed surfaces have been verified for content, bilingual rendering, mobile usability, and cross-cutting hygiene.

| Item                                       | Value                                 |
| ------------------------------------------ | ------------------------------------- |
| Tenant under test                          | `nhqs`                                |
| Hostile-pair tenant                        | `stress-a`                            |
| Student account                            | Adam Moore (`adam.moore@nhqs.test`)   |
| Peer student account (for invariant tests) | Maryam Hussain (`maryam.h@nhqs.test`) |
| Browser / version                          |                                       |
| Viewport(s) tested                         | 1280×800, 768×1024, 375×812           |
| Locale(s) tested                           | EN, AR                                |
| Theme(s) tested                            | Light, Dark                           |
| Total rows in this spec                    | 200                                   |
| Rows passed                                |                                       |
| Rows failed                                |                                       |
| Rows blocked                               |                                       |
| Bugs raised (link)                         |                                       |
| Tester name                                |                                       |
| Tester signature / date                    |                                       |
| Reviewer (engineering)                     |                                       |
| Reviewer signature / date                  |                                       |

---

**Spec version:** 1.0
**Generated:** 2026-04-17
**Module:** Scheduling
**Role under test:** student
**Sibling specs:** `admin_view/`, `teacher_view/`, `parent_view/`, `integration/`, `worker/`, `perf/`, `security/`
