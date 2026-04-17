# E2E Test Specification: Scheduling — Teacher View

> **Coverage:** This document covers the entire Scheduling module as rendered for the **teacher** role. Teachers have **strictly limited** access to scheduling: they may view their own assigned timetable, manage their own scheduling preferences, view their own preference satisfaction, submit/cancel their own absences (and respond to substitution offers), and view the substitution board they are invited to. They MUST NOT see admin scheduling configuration, run orchestration, dashboards, scenarios, exam scheduling, curriculum requirements, room closures, competencies, other teachers' timetables, or any all-school view.
>
> The teacher's main calendar and dashboard widgets MUST also surface their scheduled lessons (the calendar endpoint pulls from the timetable).
>
> **Pages exercised here (teacher-allowed):**
>
> - `/scheduling/my-timetable` — own timetable, weekly/today views, calendar subscription
> - `/scheduling/my-preferences` — own scheduling preferences (subject, class, time slot)
> - `/scheduling/my-satisfaction` — own preference-satisfaction dashboard after latest run
> - `/scheduling/substitution-board` — read-only board with the teacher's own absence/cover situation visible
> - Self-report absence (no dedicated page; surfaced via `/scheduling/my-timetable` "Report absence" CTA OR via shell utility entry)
> - Substitution offers — `/inbox` notification deeplink → accept/decline UI (no dedicated page)
> - Calendar integration — main `/calendar` and home dashboard widget show teacher's scheduled lessons
>
> **Pages explicitly DENIED for teacher (negative-assertion coverage):**
>
> - `/scheduling` (hub) — should redirect or show a teacher-scoped landing only
> - `/scheduling/auto`, `/scheduling/runs`, `/scheduling/runs/[id]/review`, `/scheduling/runs/compare`
> - `/scheduling/period-grid`, `/scheduling/curriculum`, `/scheduling/break-groups`, `/scheduling/room-closures`
> - `/scheduling/competencies`, `/scheduling/substitute-competencies`, `/scheduling/competency-coverage`, `/scheduling/teacher-config`
> - `/scheduling/availability` (admin-side staff availability tool)
> - `/scheduling/preferences` (admin-side cross-staff preference tool)
> - `/scheduling/requirements`, `/scheduling/requirements/subject-overrides`
> - `/scheduling/substitutions` (admin substitution console)
> - `/scheduling/exams`
> - `/scheduling/scenarios`
> - `/scheduling/dashboard`, `/scheduling/cover-reports`
> - `/scheduling/leave-requests` (admin/HR leave-approval tool — **NOT** teacher self-service despite name)
> - `/timetables` (cross-staff/cross-class timetable explorer)
> - `/schedules` (manual schedule CRUD)
> - `/(print)/timetables/rooms/[roomId]/print`

**Base URL:** `https://nhqs.edupod.app`
**Primary login:** **Sarah Daly** (`Sarah.daly@nhqs.test` / `Password123!`) — teacher.
**Navigation path to start:** Click **Calendar** (or "My Timetable") quick-link from the home dashboard.

**Teacher role permissions (from `permissions.constants.ts` + scheduling inventory):**

The teacher MUST have the following scheduling-related permissions and ONLY these:

- `schedule.view_own` — view own timetable, manage own calendar tokens
- `schedule.view_own_satisfaction` — view own preference satisfaction (scoped)
- `schedule.report_own_absence` — self-report absence; cancel own absence; list colleagues for nomination
- `schedule.respond_to_offer` — list/accept/decline substitution offers offered to them

The teacher MUST NOT have any of the following (asserted explicitly throughout this spec):

- `schedule.manage`
- `schedule.run_auto`, `schedule.apply_auto`, `schedule.view_auto_reports`
- `schedule.configure_requirements`, `schedule.configure_availability`
- `schedule.pin_entries`
- `schedule.manage_substitutions` (admin-tier substitution console)
- `schedule.view_reports` (admin cross-staff timetables, cover reports)
- `schedule.manage_exams`
- `schedule.manage_scenarios`

---

## Spec Pack Context

This document is the **teacher UI leg** of the `/e2e-full` release-readiness pack for the Scheduling module. The full pack includes sibling legs:

| Leg | Spec document                                | Executor                       |
| --- | -------------------------------------------- | ------------------------------ |
| 1   | `admin_view/scheduling-e2e-spec.md`          | QC engineer + Playwright       |
| 1   | `teacher_view/scheduling-e2e-spec.md` (this) | QC engineer + Playwright       |
| 1   | `parent_view/scheduling-e2e-spec.md`         | QC engineer + Playwright       |
| 1   | `student_view/scheduling-e2e-spec.md`        | QC engineer + Playwright       |
| 2   | `integration/scheduling-integration-spec.md` | Jest / Supertest harness       |
| 3   | `worker/scheduling-worker-spec.md`           | Jest + BullMQ                  |
| 4   | `perf/scheduling-perf-spec.md`               | k6 / Lighthouse                |
| 5   | `security/scheduling-security-spec.md`       | Security engineer / pen-tester |

Running ONLY this spec is a thorough teacher-shell smoke for scheduling. Running it alongside the four siblings is the full tenant-onboarding readiness check for the module.

---

## Out of Scope for This Spec

- **RLS leakage matrix (every endpoint × every role × every sibling tenant)** — this is in `integration/scheduling-integration-spec.md`. This spec exercises the UI-visible tenant-isolation path only (one cross-tenant assertion in §11).
- **Worker/BullMQ internals** (solver-v2 processor, stale-reaper cron, lock duration, retry semantics) — `worker/scheduling-worker-spec.md`.
- **Latency / throughput / p95 budgets, polling cadence under load, large-timetable rendering performance** — `perf/scheduling-perf-spec.md`.
- **OWASP / pen-test items** (CSRF, JWT replay, calendar-token forgery, XSS in subject/notes) — `security/scheduling-security-spec.md`.
- **Admin-only flows** (run lifecycle, applying runs, scenario solving, exam scheduling, room closures, curriculum requirements). Those are covered in `admin_view/scheduling-e2e-spec.md`. Here we only assert the teacher CANNOT reach them.
- **Backend integration contract tests on admin endpoints**. This spec calls them only as a teacher to assert 403; full happy-path contract is in the integration leg.
- **Calendar `.ics` file binary content correctness** beyond Content-Type / Content-Disposition / 200 — covered in the integration leg.
- **Browser / device matrix beyond desktop Chrome and 375px mobile emulation**.

---

## Prerequisites — Multi-Tenant Test Environment (MANDATORY)

Single-tenant runs are insufficient — §11 exercises tenant isolation, so the environment must satisfy the following.

### Tenants

| Slug       | Hostname                      | Notes                                                                                                                |
| ---------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `nhqs`     | `https://nhqs.edupod.app`     | Pilot tenant. Tenant ID `3ba9b02c-0339-49b8-8583-a06e05a32ac5`. Has a published timetable; teacher Sarah Daly seeded |
| `stress-a` | `https://stress-a.edupod.app` | Hostile sibling tenant. Tenant ID `965f5f8f-0d8e-4350-a589-42af2f4153ea`. Used for §11 cross-tenant assertions       |

### Users required (4 total)

| Tenant     | Role         | Name                                                                          | Login email                                          | Password          | Permissions (scheduling subset)                                                                                   |
| ---------- | ------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `nhqs`     | teacher      | Sarah Daly                                                                    | `Sarah.daly@nhqs.test`                               | `Password123!`    | `schedule.view_own`, `schedule.view_own_satisfaction`, `schedule.report_own_absence`, `schedule.respond_to_offer` |
| `nhqs`     | teacher      | (Second teacher — for negative assertion that Sarah cannot see his timetable) | `colleague.teacher@nhqs.test` (provision if missing) | `Password123!`    | Same as above                                                                                                     |
| `nhqs`     | school_owner | Yusuf Rahman                                                                  | `owner@nhqs.test`                                    | `Password123!`    | Used to seed an absence/offer FROM the admin side and confirm it surfaces to Sarah                                |
| `stress-a` | teacher      | Stress-A teacher                                                              | `teacher@stress-a.test`                              | `StressTest2026!` | Used to seed cross-tenant data for §11                                                                            |

If a second teacher account does not exist on `nhqs`, the tester MUST provision one (or substitute another teacher email already present) before running §5.x rows that assert "another teacher's timetable cannot be loaded."

### Seed data per tenant `nhqs` (minimum)

| Entity                                                | Quantity / state                                                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Active academic year                                  | ≥ 1 (status=active)                                                                                                   |
| Sarah Daly schedule entries (this week)               | ≥ 5 (e.g. Mon p1, Mon p3, Tue p2, Wed p4, Thu p1) covering ≥ 2 distinct subjects and ≥ 2 distinct classes             |
| Sarah Daly schedule entries (next week)               | ≥ 5 (to test week navigation)                                                                                         |
| Other teacher schedule entries (same week)            | ≥ 5 (used to assert Sarah's `/timetable/my` does NOT include them)                                                    |
| Sarah Daly scheduling preferences                     | ≥ 3 (one each of: subject preference, class preference, time-slot preference; mix of prefer/avoid; mix of priorities) |
| Calendar subscription token for Sarah                 | 0 initially (test creation in §2.5)                                                                                   |
| Sarah Daly absence (self-reported, future, full-day)  | 0 initially (test creation in §4)                                                                                     |
| Substitution offer pending for Sarah (offered as sub) | ≥ 1 — admin-seeded absence on a colleague where Sarah is in the candidate pool                                        |
| Substitution offer accepted by Sarah (historical)     | ≥ 1 (historical, status=accepted)                                                                                     |
| Substitution offer declined by Sarah (historical)     | ≥ 1 (historical, status=declined)                                                                                     |
| Latest scheduling run                                 | 1 with status=applied; result_json populated; preference satisfaction data computed for Sarah                         |
| RotationConfig                                        | optional; if present, week_labels visible in timetable header                                                         |
| Absence on a colleague where Sarah was nominated      | 1 (seed via admin self-report nomination flow OR direct DB) so Sarah sees it on her substitution-board                |

### Seed data per tenant `stress-a` (minimum, for cross-tenant assertions)

| Entity                                    | Quantity / state                           |
| ----------------------------------------- | ------------------------------------------ |
| Schedule entry IDs for `stress-a` teacher | ≥ 1 (record the UUID — used in §11)        |
| Substitution offer ID on `stress-a`       | ≥ 1 (record the UUID — used in §11)        |
| Calendar subscription token on `stress-a` | 1 (record entity_id + token — used in §11) |
| Absence record on `stress-a`              | ≥ 1 (record the UUID — used in §11)        |

### Hostile-pair assertions enforced in §11

Sarah Daly (`nhqs` teacher) MUST NOT, via UI or DevTools, see ANY `stress-a` data. Each assertion in §11 expects 403 / 404 / empty list — never a leak.

### Environment flags

- The `nhqs` tenant must have the `scheduling` module enabled.
- Cover/substitution notifications enabled (so the offer notification surfaces in Sarah's inbox).
- iCal subscription endpoint reachable from the worker / public route (`/v1/calendar/:tenantId/:token.ics`).

---

## Permission Matrix — Teacher Role vs Scheduling Permissions

This table is the contract. Every row that says **DENIED** is exercised as a 403 (or hidden navigation) test in §6, §7, §8.

| #    | Permission                        | Teacher has it? | Test row(s) that prove it                  |
| ---- | --------------------------------- | --------------- | ------------------------------------------ |
| P-01 | `schedule.view_own`               | **GRANTED**     | SCH-T-010, SCH-T-011, SCH-T-040, SCH-T-041 |
| P-02 | `schedule.view_own_satisfaction`  | **GRANTED**     | SCH-T-080, SCH-T-081, SCH-T-082            |
| P-03 | `schedule.report_own_absence`     | **GRANTED**     | SCH-T-100, SCH-T-101, SCH-T-110            |
| P-04 | `schedule.respond_to_offer`       | **GRANTED**     | SCH-T-120, SCH-T-121, SCH-T-122, SCH-T-130 |
| P-05 | `schedule.manage`                 | **DENIED**      | SCH-T-300, SCH-T-301, SCH-T-302, SCH-T-303 |
| P-06 | `schedule.run_auto`               | **DENIED**      | SCH-T-310, SCH-T-311, SCH-T-312            |
| P-07 | `schedule.apply_auto`             | **DENIED**      | SCH-T-313, SCH-T-314                       |
| P-08 | `schedule.view_auto_reports`      | **DENIED**      | SCH-T-315, SCH-T-316, SCH-T-330, SCH-T-331 |
| P-09 | `schedule.configure_requirements` | **DENIED**      | SCH-T-320, SCH-T-321, SCH-T-322, SCH-T-323 |
| P-10 | `schedule.configure_availability` | **DENIED**      | SCH-T-324                                  |
| P-11 | `schedule.pin_entries`            | **DENIED**      | SCH-T-325                                  |
| P-12 | `schedule.manage_substitutions`   | **DENIED**      | SCH-T-340, SCH-T-341, SCH-T-342            |
| P-13 | `schedule.view_reports`           | **DENIED**      | SCH-T-350, SCH-T-351, SCH-T-352            |
| P-14 | `schedule.manage_exams`           | **DENIED**      | SCH-T-360, SCH-T-361                       |
| P-15 | `schedule.manage_scenarios`       | **DENIED**      | SCH-T-370, SCH-T-371                       |

---

## Table of Contents

1. [Login and Shell Verification](#1-login-and-shell-verification)
2. [`/scheduling/my-timetable` — Own Timetable](#2-schedulingmy-timetable--own-timetable)
3. [`/scheduling/my-preferences` — Own Preferences](#3-schedulingmy-preferences--own-preferences)
4. [Self-Report Absence Flow](#4-self-report-absence-flow)
5. [Negative Visibility — Other Teachers' Data](#5-negative-visibility--other-teachers-data)
6. [Hidden Navigation — Admin Scheduling Hubs](#6-hidden-navigation--admin-scheduling-hubs)
7. [Direct URL Access Denial — Admin Scheduling Pages](#7-direct-url-access-denial--admin-scheduling-pages)
8. [API Permission Denial — Admin Scheduling Endpoints](#8-api-permission-denial--admin-scheduling-endpoints)
9. [`/scheduling/my-satisfaction` — Own Satisfaction](#9-schedulingmy-satisfaction--own-satisfaction)
10. [Substitution Board (Read-Only) and Substitution Offers (Accept/Decline)](#10-substitution-board-read-only-and-substitution-offers-acceptdecline)
11. [Calendar Integration — Lessons Surface in Main Calendar / Dashboard](#11-calendar-integration--lessons-surface-in-main-calendar--dashboard)
12. [Multi-Tenant RLS — Hostile Sibling (`stress-a`)](#12-multi-tenant-rls--hostile-sibling-stress-a)
13. [Cross-Cutting — Console / Network Health](#13-cross-cutting--console--network-health)
14. [Cross-Cutting — RTL Parity (Arabic)](#14-cross-cutting--rtl-parity-arabic)
15. [Cross-Cutting — Dark Mode Parity](#15-cross-cutting--dark-mode-parity)
16. [Cross-Cutting — Mobile (375 px)](#16-cross-cutting--mobile-375-px)
17. [Data Invariants (DB-Level Spot-Checks)](#17-data-invariants-db-level-spot-checks)
18. [Backend Endpoint Map (Teacher-Touched)](#18-backend-endpoint-map-teacher-touched)
19. [Observations / Bugs Spotted](#19-observations--bugs-spotted)
20. [Sign-off](#20-sign-off)

---

## 1. Login and Shell Verification

| #         | Page/Endpoint    | Action                                                                         | Expected                                                                                                                                                                                                                        | Actual | Pass/Fail |
| --------- | ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-001 | `/en/login`      | Log in as Sarah Daly (`Sarah.daly@nhqs.test` / `Password123!`).                | Login succeeds. Browser lands on `/en/` (home dashboard). JWT issued. No console errors.                                                                                                                                        |        |           |
| SCH-T-002 | Morph bar        | Inspect the morph bar after login.                                             | Morph bar is visible across full width. Hub buttons appear. The teacher does NOT see admin-only hubs. **No "Scheduling" admin hub button appears for the teacher** (admin scheduling hub is gated by `schedule.manage` family). |        |           |
| SCH-T-003 | Morph bar        | Locate the **Calendar** / **My Timetable** entry point.                        | A teacher-visible entry exists for "My Timetable" (either as a sub-strip item beneath a hub or as a dashboard widget link). Hover label is the translated "My Timetable" string (`scheduling.myTimetable.navTitle`).            |        |           |
| SCH-T-004 | Home dashboard   | Look for a "Today's lessons" or "My next lesson" widget on the home dashboard. | A widget surfaces Sarah's next 1–3 scheduled lessons (subject, class, period time, room). Data sourced from `GET /api/v1/timetables/me`.                                                                                        |        |           |
| SCH-T-005 | Home dashboard   | Click the "View full timetable" CTA on the lessons widget.                     | Browser navigates to `/en/scheduling/my-timetable`. The page loads (see §2).                                                                                                                                                    |        |           |
| SCH-T-006 | `/en/scheduling` | Direct-navigate to `/en/scheduling` (the admin hub URL) via URL bar.           | Teacher is **redirected** to `/en/scheduling/my-timetable` (or to home with a toast: "You don't have access to scheduling administration"). NO admin hub dashboard renders. NO 4-KPI grid renders.                              |        |           |
| SCH-T-007 | Console          | Throughout §1, watch the browser console.                                      | Zero uncaught JavaScript errors. Zero `Failed to fetch`. The expected 403s (admin overview/dashboard probes) are caught and logged via `console.error('[funcName]', err)` — never raw uncaught errors.                          |        |           |
| SCH-T-008 | Network          | Throughout §1, watch the Network tab.                                          | No 5xx responses. The home widget's `GET /api/v1/timetables/me?academic_year_id=...` returns 200. No 401 (auth still valid). No request to admin-only endpoints from the home dashboard widget.                                 |        |           |
| SCH-T-009 | Shell stability  | Repeatedly navigate Home → My Timetable → Home (5 cycles).                     | Morph bar does not flicker, remount, or jump. The shell remains visually stable (per redesign spec). No layout shift in the morph bar height.                                                                                   |        |           |

---

## 2. `/scheduling/my-timetable` — Own Timetable

**URL:** `/en/scheduling/my-timetable`
**Permission:** `schedule.view_own`
**Primary API call:** `GET /api/v1/timetables/me?academic_year_id={yearId}&week_start={iso}`

### 2.1 Page Load and Layout

| #         | Page/Endpoint                 | Action                                                                 | Expected                                                                                                                                                                                                                                       | Actual | Pass/Fail |
| --------- | ----------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-010 | `/en/scheduling/my-timetable` | Navigate to the page from the dashboard widget.                        | Page loads without errors. PageHeader title reads "My Timetable" (or AR equivalent). The current academic year is auto-selected. A weekly grid renders.                                                                                        |        |           |
| SCH-T-011 | Network                       | Inspect XHR on initial load.                                           | Three calls fire in this order: `GET /api/v1/academic-years?pageSize=20` (200), `GET /api/v1/timetables/me?academic_year_id={yearId}&week_start={current_monday_iso}` (200), `GET /api/v1/calendar/subscription-url` (200 or 404 if no token). |        |           |
| SCH-T-012 | Loading state                 | Hard-refresh the page; observe the timetable area before XHR resolves. | A loading skeleton or `Loader2` spinner is shown with `me-2` margin spacing (RTL-safe). No flash of empty grid.                                                                                                                                |        |           |
| SCH-T-013 | Empty state                   | If the active week has no scheduled lessons, observe the grid.         | An empty-state message appears (e.g. "No lessons scheduled this week"). The grid still renders the days and period rows, just with empty cells. NO admin-style "Generate timetable" CTA appears.                                               |        |           |
| SCH-T-014 | Error state                   | Block `GET /api/v1/timetables/me` (DevTools network-block); reload.    | A red error message renders inline. Page does NOT crash. Morph bar remains intact. No white screen.                                                                                                                                            |        |           |
| SCH-T-015 | Today indicator               | View the current weekday column.                                       | Today's column is visually highlighted (border, bg tint, or a "Today" pill).                                                                                                                                                                   |        |           |

### 2.2 Grid Cell Content

| #         | Page/Endpoint | Action                                                                  | Expected                                                                                                                                                               | Actual | Pass/Fail |
| --------- | ------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-016 | Cell          | Inspect a populated cell (e.g. Mon period 1).                           | Cell shows: subject name, class name (e.g. "Year 7 — Maths · 7M1"), room name, period start–end time. Font sizes ≥ 14px on desktop.                                    |        |           |
| SCH-T-017 | Cell          | Inspect a cell where Sarah is the **substitute** (cover_for indicator). | Cell shows a small "Cover for {teacher_name}" badge / strip. Visually distinct from a regular lesson (e.g. amber border or icon). The original teacher's name renders. |        |           |
| SCH-T-018 | Cell          | Inspect a free period cell.                                             | Cell shows the period label (e.g. "Period 3") with no subject/class — visually muted. NO "Add lesson" CTA (only admins can add).                                       |        |           |
| SCH-T-019 | Cell          | Click a populated cell.                                                 | A read-only details popover opens (subject, class, room, period, teacher). NO edit/delete buttons. NO pin toggle. NO "swap" button.                                    |        |           |
| SCH-T-020 | Cell          | Inspect a cell that falls inside a break group window.                  | Cell renders as "Break" with no class assigned. Visually distinct (e.g. striped or muted bg).                                                                          |        |           |

### 2.3 Week Navigation and Today / Week Toggle

| #         | Page/Endpoint        | Action                                                       | Expected                                                                                                                                                                               | Actual | Pass/Fail |
| --------- | -------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-021 | Prev week            | Click the "Previous week" arrow.                             | A new XHR fires: `GET /api/v1/timetables/me?academic_year_id={yearId}&week_start={prev_monday_iso}`. Grid updates to the previous week. URL may include `?week_start=...` query param. |        |           |
| SCH-T-022 | Next week            | Click "Next week" arrow.                                     | Same as 2.21 with next week's monday ISO. Grid updates.                                                                                                                                |        |           |
| SCH-T-023 | Today                | Click "Today".                                               | Grid resets to current week. XHR fires with current monday.                                                                                                                            |        |           |
| SCH-T-024 | Week vs Today toggle | If a "Today" / "Week" view toggle exists, switch to "Today". | Single-day view renders showing only today's periods in a vertical list. If no such toggle exists, log this row as a deferred enhancement (not a fail).                                |        |           |
| SCH-T-025 | RTL arrow direction  | Switch locale to AR (top-right locale switcher). Re-load.    | Prev/Next arrows use `rtl:rotate-180` and remain semantically correct (Prev still goes back in time). No `ml-`/`mr-` class on the arrow icons.                                         |        |           |
| SCH-T-026 | Rotation week label  | If the tenant has a `RotationConfig`, inspect the header.    | Current rotation week label appears (e.g. "Week A"). For tenants without rotation config, no label appears.                                                                            |        |           |

### 2.4 Calendar Subscription (iCal)

| #         | Page/Endpoint       | Action                                             | Expected                                                                                                                                                                                                              | Actual | Pass/Fail |
| --------- | ------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-027 | Subscribe button    | Locate the "Subscribe" / "Add to calendar" CTA.    | A button is visible on desktop (icon: download or Calendar). On mobile, button collapses or is in an overflow menu but remains accessible.                                                                            |        |           |
| SCH-T-028 | Create token        | Click the button when no token has been created.   | A modal or panel opens with the `webcal://` subscription URL. Behind the scenes, `POST /v1/scheduling/calendar-tokens` is called with `{ entity_type: 'teacher', entity_id: <staff_profile_id> }`; response 201.      |        |           |
| SCH-T-029 | Token list          | List existing tokens.                              | `GET /v1/scheduling/calendar-tokens` returns 200 with array containing the token row. Token visible (last 8 chars or full, per UI).                                                                                   |        |           |
| SCH-T-030 | Public ICS endpoint | Copy the URL. Open it in a new tab.                | `GET /v1/calendar/{tenantId}/{token}.ics` returns 200 with `Content-Type: text/calendar; charset=utf-8` and `Content-Disposition: attachment; filename="..."`. The body contains `BEGIN:VCALENDAR`. NO auth required. |        |           |
| SCH-T-031 | Wrong token         | Tamper the token (change one character). Re-fetch. | Returns 404. NO leak of any other teacher's calendar.                                                                                                                                                                 |        |           |
| SCH-T-032 | Revoke token        | Click "Revoke" on the token in the UI.             | `DELETE /v1/scheduling/calendar-tokens/{tokenId}` returns 204. Token removed from list. Re-fetching the public URL returns 404.                                                                                       |        |           |

### 2.5 Data Boundary — Sarah Sees Only Her Lessons

| #         | Page/Endpoint | Action                                                                              | Expected                                                                                                                                                      | Actual | Pass/Fail |
| --------- | ------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-033 | DevTools      | Inspect the JSON response of `/api/v1/timetables/me`.                               | Every entry has `teacher_staff_id === <Sarah's staff_profile_id>` OR is a cover slot where Sarah is the substitute. Zero entries belonging to other teachers. |        |           |
| SCH-T-034 | DevTools      | Inspect for any other teacher's name in the response.                               | The original-teacher name appears ONLY on cover slots (and only as a label). Sarah's name appears as the active assignee on her own slots.                    |        |           |
| SCH-T-035 | URL probe     | Try `GET /api/v1/timetables/teacher/{another_teacher_staff_id}` via DevTools fetch. | Returns **403** (teacher lacks `schedule.manage`/`schedule.view_reports`). Body: `{ error: { code: ..., message: ... } }`.                                    |        |           |

### 2.6 Mobile (375 px) and RTL

| #         | Page/Endpoint    | Action                                         | Expected                                                                                                                                                                 | Actual | Pass/Fail |
| --------- | ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-T-036 | 375 px viewport  | Resize to 375 px (iPhone SE). Reload.          | Grid wraps inside an `overflow-x-auto` container. Period column remains sticky-left. No body horizontal scroll. No content cut off.                                      |        |           |
| SCH-T-037 | 375 px touch     | Tap any cell.                                  | The popover opens; tap target ≥ 44×44 px. Popover does not overflow viewport.                                                                                            |        |           |
| SCH-T-038 | 375 px subscribe | Open subscribe modal on mobile.                | Modal is full-screen. URL field uses `text-base` (≥ 16 px) to prevent iOS auto-zoom.                                                                                     |        |           |
| SCH-T-039 | RTL Arabic       | Switch locale to AR. Inspect grid orientation. | Days flow right-to-left. Period column is on the right. All padding/margin uses logical properties (`ms-`/`me-`). NO `ml-`/`mr-` class found in DOM via DevTools search. |        |           |

---

## 3. `/scheduling/my-preferences` — Own Preferences

**URL:** `/en/scheduling/my-preferences`
**Permission:** `schedule.view_own` (for read), self-service preference write via `/own/` endpoints

### 3.1 Page Load and Tabs

| #         | Page/Endpoint                   | Action                       | Expected                                                                                                                                                                                                                                                                  | Actual | Pass/Fail |
| --------- | ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-040 | `/en/scheduling/my-preferences` | Navigate to the page.        | Page loads. Three tabs visible: **Subject**, **Class**, **Time Slot**.                                                                                                                                                                                                    |        |           |
| SCH-T-041 | Network                         | Inspect XHR on initial load. | Calls fire: `GET /api/v1/academic-years?pageSize=20`, `GET /api/v1/subjects?pageSize=100`, `GET /api/v1/classes?pageSize=100`, `GET /api/v1/period-grid?academic_year_id=...`, `GET /api/v1/staff-scheduling-preferences/own?academic_year_id=...&pageSize=100`. All 200. |        |           |
| SCH-T-042 | Default tab                     | Observe the active tab.      | "Subject" tab is active by default. Active styling distinct.                                                                                                                                                                                                              |        |           |
| SCH-T-043 | Tab switch                      | Click "Class".               | Class tab becomes active. List of class preferences renders.                                                                                                                                                                                                              |        |           |
| SCH-T-044 | Tab switch                      | Click "Time Slot".           | Time Slot tab becomes active.                                                                                                                                                                                                                                             |        |           |

### 3.2 Reading Existing Preferences

| #         | Page/Endpoint | Action                                                       | Expected                                                                                                                                                | Actual | Pass/Fail |
| --------- | ------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-045 | List render   | View seeded preferences in the Subject tab.                  | Each preference shows: subject name, sentiment chip ("Prefer" or "Avoid"), priority chip ("Low"/"Med"/"High"). Numeric priority 1–3 is mapped to label. |        |           |
| SCH-T-046 | DevTools      | Verify response body of `/staff-scheduling-preferences/own`. | Every record has `staff_profile_id === <Sarah's staff_profile_id>`. NO other staff's preferences in the payload.                                        |        |           |

### 3.3 Create / Edit / Delete Own Preference

| #         | Page/Endpoint      | Action                                                                                           | Expected                                                                                                                                                                                                | Actual | Pass/Fail |
| --------- | ------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-047 | Add subject pref   | On Subject tab, click "Add preference". Choose a subject, sentiment=Prefer, priority=High. Save. | `POST /api/v1/staff-scheduling-preferences/own` fires with body `{ academic_year_id, subject_id, sentiment: 'prefer', priority: 3 }`. Returns 201. New chip appears in list. Toast: "Preference added". |        |           |
| SCH-T-048 | Edit pref          | Click an existing preference, change sentiment to "Avoid".                                       | `PATCH /api/v1/staff-scheduling-preferences/own/{id}` fires. Returns 200. Chip updates inline. Toast: "Preference updated".                                                                             |        |           |
| SCH-T-049 | Delete pref        | Click delete (trash icon) on a preference.                                                       | Confirm dialog, then `DELETE /api/v1/staff-scheduling-preferences/own/{id}`. Returns 204. Chip removed. Toast: "Preference removed".                                                                    |        |           |
| SCH-T-050 | Add class pref     | Switch to Class tab. Add a class preference (sentiment=Avoid, priority=Low).                     | POST fires with `class_id`. 201. Chip appears.                                                                                                                                                          |        |           |
| SCH-T-051 | Add time-slot pref | Switch to Time Slot tab. Add a slot (e.g. weekday=Mon, period_order=1, sentiment=Avoid).         | POST fires with weekday + period_order fields. 201. Chip appears.                                                                                                                                       |        |           |

### 3.4 Negative — Cannot Edit Other Staff's Prefs

| #         | Page/Endpoint | Action                                                                                                                                | Expected                                                                              | Actual | Pass/Fail |
| --------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-052 | URL probe     | Via DevTools fetch, `POST /api/v1/staff-scheduling-preferences` (admin endpoint, not `/own`) with body containing another staff's id. | Returns **403** (teacher lacks admin permission required by the non-`/own` endpoint). |        |           |
| SCH-T-053 | URL probe     | `PATCH /api/v1/staff-scheduling-preferences/{id_of_another_staff_pref}`.                                                              | Returns **403** or **404**. NEVER 200.                                                |        |           |
| SCH-T-054 | URL probe     | `DELETE /api/v1/staff-scheduling-preferences/{id_of_another_staff_pref}`.                                                             | Returns **403** or **404**. NEVER 204.                                                |        |           |
| SCH-T-055 | URL probe     | `GET /api/v1/staff-scheduling-preferences?staff_profile_id={another_staff_id}` (admin list endpoint).                                 | Returns **403**.                                                                      |        |           |

### 3.5 Form Validation (Zod surfaced via API errors)

| #         | Page/Endpoint        | Action                                                | Expected                                                                                                                                       | Actual | Pass/Fail |
| --------- | -------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-056 | Save with no subject | On Subject tab, try to save with no subject selected. | Save button disabled OR API returns 400 with field-level error toast.                                                                          |        |           |
| SCH-T-057 | Save duplicate       | Try to add a preference identical to an existing one. | Either prevented client-side (button disabled) OR API returns a 409/400 with toast: "Preference already exists" or similar. NO silent failure. |        |           |

### 3.6 RTL / Mobile

| #         | Page/Endpoint | Action                             | Expected                                                                                                                                                | Actual | Pass/Fail |
| --------- | ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-058 | RTL           | Switch to AR. Inspect tab order.   | Tabs render right-to-left. Selected tab highlight uses `border-s-` not `border-l-`.                                                                     |        |           |
| SCH-T-059 | 375 px        | At 375 px, verify the form inputs. | All inputs `w-full`. Subject/class selectors collapse to full-width dropdowns. Priority/sentiment radio buttons stack vertically. No horizontal scroll. |        |           |
| SCH-T-060 | 375 px font   | Tap a text input.                  | iOS Safari does NOT auto-zoom (input has `text-base` ≥ 16 px).                                                                                          |        |           |

---

## 4. Self-Report Absence Flow

The teacher self-reports absence via the `POST /v1/scheduling/absences/self-report` endpoint. UI surface is either a "Report absence" CTA on the timetable page, on the dashboard, or in a profile menu. The cascade engine then offers cover to colleagues.

### 4.1 Locating the Entry Point

| #         | Page/Endpoint | Action                                                                            | Expected                                                                                                                                                                                                   | Actual | Pass/Fail |
| --------- | ------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-100 | UI scan       | From `/en/scheduling/my-timetable`, locate a "Report absence" / "I'm absent" CTA. | A CTA is visible somewhere stable (page header, sub-header, or contextual menu on a future-day cell). Label uses i18n key (translated in EN and AR).                                                       |        |           |
| SCH-T-101 | Click CTA     | Click "Report absence".                                                           | A modal (or dedicated page) opens with the absence form: date, optional date_to, full_day toggle, period_from/period_to (only when full_day=false), reason textarea, optional nominated substitute picker. |        |           |

### 4.2 Form Validation

| #         | Page/Endpoint                  | Action                                                | Expected                                                                                                                                 | Actual | Pass/Fail |
| --------- | ------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-102 | Empty date                     | Submit with no date.                                  | Save disabled OR 400 with toast.                                                                                                         |        |           |
| SCH-T-103 | date_to before date            | Set date=2026-04-20 and date_to=2026-04-18. Submit.   | Validation error: "End date must be on or after start date" (Zod refine in `selfReportAbsenceSchema`). 400 from API if client missed it. |        |           |
| SCH-T-104 | full_day=false, no period_from | Toggle full_day off, leave period_from empty. Submit. | Validation error from Zod refine. 400.                                                                                                   |        |           |
| SCH-T-105 | period_to before period_from   | Set period_from=4, period_to=2.                       | Validation error. 400.                                                                                                                   |        |           |
| SCH-T-106 | Reason length                  | Enter reason longer than 500 chars.                   | Either textarea blocks input OR API returns 400 with toast.                                                                              |        |           |

### 4.3 Nominate Substitute

| #         | Page/Endpoint      | Action                                                                  | Expected                                                                                                                                                               | Actual | Pass/Fail |
| --------- | ------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-107 | Colleague picker   | Open the nomination picker.                                             | `GET /api/v1/scheduling/colleagues` fires (permission: `schedule.report_own_absence`). Returns 200 with a list of active colleagues. Sarah herself is NOT in the list. |        |           |
| SCH-T-108 | Other-tenant probe | `GET /api/v1/scheduling/colleagues` while logged in as Sarah on `nhqs`. | Response contains ONLY `nhqs` staff. No `stress-a` staff. No `users` table data leaked.                                                                                |        |           |
| SCH-T-109 | Pick & nominate    | Pick a colleague.                                                       | Selected colleague displayed. Form's `nominated_substitute_staff_id` populated.                                                                                        |        |           |

### 4.4 Successful Self-Report

| #         | Page/Endpoint        | Action                                                                                  | Expected                                                                                                                                                                                                    | Actual | Pass/Fail |
| --------- | -------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-110 | Submit               | Fill date=tomorrow, full_day=true, reason="Sick", optional nominated colleague. Submit. | `POST /api/v1/scheduling/absences/self-report` fires with body matching `selfReportAbsenceSchema` (no `staff_id` — derived from auth). Returns 201 with the created absence row. Toast: "Absence reported". |        |           |
| SCH-T-111 | Cascade trigger      | After creation, observe network for cascade activity.                                   | `SubstitutionCascadeService.runCascade()` runs. If async, no immediate offer in UI. If sync, an offer record is created. Either way, no UI blocking error.                                                  |        |           |
| SCH-T-112 | Timetable reflection | Re-load `/en/scheduling/my-timetable` for tomorrow.                                     | Tomorrow's lessons display an "Absent" or "Cover pending" banner. Cells show muted state.                                                                                                                   |        |           |

### 4.5 Cancel Own Absence

| #         | Page/Endpoint        | Action                                                                                         | Expected                                                                                                                                                                     | Actual | Pass/Fail |
| --------- | -------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-113 | Cancel own           | Locate "Cancel" on the absence (in timetable popover or in a "My Absences" section). Click it. | `POST /api/v1/scheduling/absences/{id}/cancel-own` fires (permission `schedule.report_own_absence`). Returns 200. Toast: "Absence cancelled". Offers revoked (cascade-side). |        |           |
| SCH-T-114 | Cancel another's     | Via DevTools, `POST /api/v1/scheduling/absences/{another_teacher_absence_id}/cancel-own`.      | Returns **403** (or 404). The endpoint enforces same-actor check. NEVER 200.                                                                                                 |        |           |
| SCH-T-115 | Admin cancel attempt | Via DevTools, `POST /api/v1/scheduling/absences/{any_id}/cancel` (admin endpoint).             | Returns **403** (teacher lacks `schedule.manage_substitutions`).                                                                                                             |        |           |
| SCH-T-116 | Admin delete attempt | Via DevTools, `DELETE /api/v1/scheduling/absences/{any_id}`.                                   | Returns **403**.                                                                                                                                                             |        |           |

### 4.6 Listing Own Absences

| #         | Page/Endpoint    | Action                                                                                                                                    | Expected                                                                                                                                                     | Actual | Pass/Fail |
| --------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-T-117 | List endpoint    | Via DevTools, `GET /api/v1/scheduling/absences` (admin list).                                                                             | Returns **403** (teacher lacks `schedule.manage_substitutions`).                                                                                             |        |           |
| SCH-T-118 | Own-only surface | Verify the UI does NOT call the admin list. Sarah's "My Absences" card uses a teacher-scoped read OR filters her own from a derived view. | If a "My Absences" UI surface exists, it calls a teacher-scoped endpoint OR is built into the timetable. Document whichever applies. NO admin endpoint used. |        |           |

### 4.7 RTL / Mobile

| #         | Page/Endpoint | Action                       | Expected                                                                                                          | Actual | Pass/Fail |
| --------- | ------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-119 | RTL           | Open absence form in AR.     | Date pickers render with AR labels. Western numerals retained for dates per CLAUDE.md. Calendar widget flows RTL. |        |           |
| SCH-T-120 | 375 px        | Open absence form on mobile. | Form is full-screen modal. Single-column layout. Inputs ≥ 16px font. Save / Cancel buttons stick to bottom.       |        |           |

---

## 5. Negative Visibility — Other Teachers' Data

Sarah MUST NEVER see another teacher's full timetable, preferences, satisfaction, or absences.

| #         | Page/Endpoint                                                            | Action                                       | Expected                                                                                                                         | Actual | Pass/Fail |
| --------- | ------------------------------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-200 | `/en/scheduling/my-timetable`                                            | Inspect the JSON of `/api/v1/timetables/me`. | Every entry's `teacher_staff_id` matches Sarah's. Cover slots show original teacher's name as a label only.                      |        |           |
| SCH-T-201 | `GET /api/v1/timetables/teacher/{another_teacher_id}`                    | DevTools fetch.                              | **403**. NO data returned.                                                                                                       |        |           |
| SCH-T-202 | `GET /api/v1/scheduling/timetable/teacher/{another_teacher_id}`          | DevTools fetch.                              | **403**.                                                                                                                         |        |           |
| SCH-T-203 | `GET /api/v1/timetables/class/{any_class_id}`                            | DevTools fetch.                              | **403** (lacks `schedule.view_class`/`schedule.manage`).                                                                         |        |           |
| SCH-T-204 | `GET /api/v1/scheduling/timetable/class/{any_class_id}`                  | DevTools fetch.                              | **403**.                                                                                                                         |        |           |
| SCH-T-205 | `GET /api/v1/timetables/room/{any_room_id}`                              | DevTools fetch.                              | **403**.                                                                                                                         |        |           |
| SCH-T-206 | `GET /api/v1/timetables/student/{any_student_id}`                        | DevTools fetch.                              | **403** unless Sarah is also that student's parent (not the case for Sarah). For Sarah: 403.                                     |        |           |
| SCH-T-207 | `GET /api/v1/staff-scheduling-preferences?staff_profile_id={another_id}` | DevTools fetch.                              | **403**.                                                                                                                         |        |           |
| SCH-T-208 | `GET /api/v1/scheduling/teacher-config?academic_year_id=...`             | DevTools fetch.                              | **403** (lacks `schedule.configure_availability`).                                                                               |        |           |
| SCH-T-209 | `GET /api/v1/staff-availability/staff/{another_id}/year/{yearId}`        | DevTools fetch.                              | **403**.                                                                                                                         |        |           |
| SCH-T-210 | `GET /api/v1/reports/workload?academic_year_id=...`                      | DevTools fetch.                              | **403** (lacks `schedule.manage`).                                                                                               |        |           |
| SCH-T-211 | `GET /api/v1/scheduling/cover-reports?date_from=...&date_to=...`         | DevTools fetch.                              | **403** (lacks `schedule.view_reports`).                                                                                         |        |           |
| SCH-T-212 | `GET /api/v1/scheduling-dashboard/workload?academic_year_id=...`         | DevTools fetch.                              | **403** (lacks `schedule.view_auto_reports`).                                                                                    |        |           |
| SCH-T-213 | `GET /api/v1/scheduling-dashboard/preferences?academic_year_id=...`      | DevTools fetch.                              | **200** but scoped to Sarah only (this is the `view_own_satisfaction` endpoint). Response payload contains ONLY her preferences. |        |           |
| SCH-T-214 | DevTools                                                                 | Inspect 5.13 response payload.               | Every record's `staff_profile_id === Sarah's`. NO other staff IDs. Aggregate fields are her totals only.                         |        |           |

---

## 6. Hidden Navigation — Admin Scheduling Hubs

Each admin scheduling hub item MUST be hidden from the teacher's morph-bar / nav. If the navigation framework still renders them but disables them, log as a partial fail (we want them HIDDEN, not greyed out).

| #         | Hub item                                                                      | Expected for teacher                                                                | Actual | Pass/Fail |
| --------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-220 | Top morph bar — "Scheduling" admin hub                                        | NOT VISIBLE (admin-only hub)                                                        |        |           |
| SCH-T-221 | Sub-strip — "Auto Scheduler" link (`/scheduling/auto`)                        | NOT VISIBLE                                                                         |        |           |
| SCH-T-222 | Sub-strip — "Runs" link (`/scheduling/runs`)                                  | NOT VISIBLE                                                                         |        |           |
| SCH-T-223 | Sub-strip — "Scenarios" link (`/scheduling/scenarios`)                        | NOT VISIBLE                                                                         |        |           |
| SCH-T-224 | Sub-strip — "Period Grid" (`/scheduling/period-grid`)                         | NOT VISIBLE                                                                         |        |           |
| SCH-T-225 | Sub-strip — "Curriculum" (`/scheduling/curriculum`)                           | NOT VISIBLE                                                                         |        |           |
| SCH-T-226 | Sub-strip — "Break Groups" (`/scheduling/break-groups`)                       | NOT VISIBLE                                                                         |        |           |
| SCH-T-227 | Sub-strip — "Room Closures" (`/scheduling/room-closures`)                     | NOT VISIBLE                                                                         |        |           |
| SCH-T-228 | Sub-strip — "Competencies" (`/scheduling/competencies`)                       | NOT VISIBLE                                                                         |        |           |
| SCH-T-229 | Sub-strip — "Substitute Competencies" (`/scheduling/substitute-competencies`) | NOT VISIBLE                                                                         |        |           |
| SCH-T-230 | Sub-strip — "Coverage" (`/scheduling/competency-coverage`)                    | NOT VISIBLE                                                                         |        |           |
| SCH-T-231 | Sub-strip — "Teacher Config" (`/scheduling/teacher-config`)                   | NOT VISIBLE                                                                         |        |           |
| SCH-T-232 | Sub-strip — "Availability" (`/scheduling/availability`)                       | NOT VISIBLE (this is admin-side; teacher's own availability is in `my-preferences`) |        |           |
| SCH-T-233 | Sub-strip — "Preferences" (`/scheduling/preferences`)                         | NOT VISIBLE (admin-side; teacher's own is in `my-preferences`)                      |        |           |
| SCH-T-234 | Sub-strip — "Requirements" (`/scheduling/requirements`)                       | NOT VISIBLE                                                                         |        |           |
| SCH-T-235 | Sub-strip — "Substitutions" (admin) (`/scheduling/substitutions`)             | NOT VISIBLE                                                                         |        |           |
| SCH-T-236 | Sub-strip — "Exams" (`/scheduling/exams`)                                     | NOT VISIBLE                                                                         |        |           |
| SCH-T-237 | Sub-strip — "Analytics Dashboard" (`/scheduling/dashboard`)                   | NOT VISIBLE                                                                         |        |           |
| SCH-T-238 | Sub-strip — "Cover Reports" (`/scheduling/cover-reports`)                     | NOT VISIBLE                                                                         |        |           |
| SCH-T-239 | Sub-strip — "Leave Requests" (`/scheduling/leave-requests`)                   | NOT VISIBLE (admin/HR tool, NOT teacher self-service)                               |        |           |
| SCH-T-240 | Sub-strip — "Timetables" (`/timetables` cross-staff explorer)                 | NOT VISIBLE                                                                         |        |           |
| SCH-T-241 | Sub-strip — "Schedules" (`/schedules` manual CRUD)                            | NOT VISIBLE                                                                         |        |           |
| SCH-T-242 | Quick action — "Auto Scheduler"                                               | NOT VISIBLE                                                                         |        |           |
| SCH-T-243 | Quick action — "Substitutions" (admin)                                        | NOT VISIBLE                                                                         |        |           |
| SCH-T-244 | Quick action — "Substitution Board"                                           | VISIBLE (read-only kiosk view; teacher allowed)                                     |        |           |
| SCH-T-245 | Quick action — "My Timetable"                                                 | VISIBLE                                                                             |        |           |
| SCH-T-246 | Settings → "Messaging Policy" (cross-domain)                                  | Out of scope (covered in comms spec)                                                |        | n/a       |
| SCH-T-247 | Page-level CTA — "Generate timetable"                                         | NOT VISIBLE on `/scheduling/my-timetable`                                           |        |           |
| SCH-T-248 | Page-level CTA — "Apply run"                                                  | NOT VISIBLE anywhere                                                                |        |           |
| SCH-T-249 | Page-level CTA — "Pin / Unpin" on a schedule cell                             | NOT VISIBLE                                                                         |        |           |

---

## 7. Direct URL Access Denial — Admin Scheduling Pages

For each admin URL, navigate via the URL bar (cold load) and assert the teacher gets a 403 page, a redirect, or a "permission denied" splash. NEVER the actual admin page content. Inspect the URL after navigation, and verify no admin-only API call returned 200 in the Network tab.

| #         | URL                                                | Expected behaviour                                                                                                                                                                                                                   | Actual | Pass/Fail |
| --------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-T-300 | `/en/scheduling`                                   | Redirect to `/en/scheduling/my-timetable` (or splash). NO admin KPI grid. NO admin overview API call returns 200.                                                                                                                    |        |           |
| SCH-T-301 | `/en/scheduling/auto`                              | Redirect or 403 splash. NO `/api/v1/scheduling/prerequisites` 200. NO `/api/v1/scheduling/feasibility` 200.                                                                                                                          |        |           |
| SCH-T-302 | `/en/scheduling/runs`                              | Redirect or 403 splash. NO `/api/v1/scheduling-runs` 200.                                                                                                                                                                            |        |           |
| SCH-T-303 | `/en/scheduling/runs/{any_run_id}`                 | Redirect or 403 splash. NO `/api/v1/scheduling-runs/{id}` 200.                                                                                                                                                                       |        |           |
| SCH-T-304 | `/en/scheduling/runs/{any_run_id}/review`          | Redirect or 403 splash. NO review payload returned.                                                                                                                                                                                  |        |           |
| SCH-T-305 | `/en/scheduling/runs/compare`                      | Redirect or 403 splash.                                                                                                                                                                                                              |        |           |
| SCH-T-306 | `/en/scheduling/period-grid`                       | Redirect or 403. NO `/api/v1/period-grid` 200 (admin-side).                                                                                                                                                                          |        |           |
| SCH-T-307 | `/en/scheduling/curriculum`                        | Redirect or 403. NO `/api/v1/scheduling/curriculum-requirements` 200.                                                                                                                                                                |        |           |
| SCH-T-308 | `/en/scheduling/break-groups`                      | Redirect or 403. NO `/api/v1/scheduling/break-groups` 200.                                                                                                                                                                           |        |           |
| SCH-T-309 | `/en/scheduling/room-closures`                     | Redirect or 403. NO `/api/v1/scheduling/room-closures` 200.                                                                                                                                                                          |        |           |
| SCH-T-310 | `/en/scheduling/competencies`                      | Redirect or 403. NO `/api/v1/scheduling/teacher-competencies` 200.                                                                                                                                                                   |        |           |
| SCH-T-311 | `/en/scheduling/substitute-competencies`           | Redirect or 403. NO `/api/v1/scheduling/substitute-competencies` 200.                                                                                                                                                                |        |           |
| SCH-T-312 | `/en/scheduling/competency-coverage`               | Redirect or 403.                                                                                                                                                                                                                     |        |           |
| SCH-T-313 | `/en/scheduling/teacher-config`                    | Redirect or 403. NO `/api/v1/scheduling/teacher-config` 200.                                                                                                                                                                         |        |           |
| SCH-T-314 | `/en/scheduling/availability`                      | Redirect or 403 (admin-side staff availability tool).                                                                                                                                                                                |        |           |
| SCH-T-315 | `/en/scheduling/preferences`                       | Redirect or 403 (admin-side cross-staff preference tool — NOT `my-preferences`).                                                                                                                                                     |        |           |
| SCH-T-316 | `/en/scheduling/requirements`                      | Redirect or 403.                                                                                                                                                                                                                     |        |           |
| SCH-T-317 | `/en/scheduling/requirements/subject-overrides`    | Redirect or 403.                                                                                                                                                                                                                     |        |           |
| SCH-T-318 | `/en/scheduling/substitutions`                     | Redirect or 403 (admin substitution console). NO `/api/v1/scheduling/absences` 200 from this page.                                                                                                                                   |        |           |
| SCH-T-319 | `/en/scheduling/exams`                             | Redirect or 403. NO `/api/v1/scheduling/exam-sessions` 200.                                                                                                                                                                          |        |           |
| SCH-T-320 | `/en/scheduling/scenarios`                         | Redirect or 403. NO `/api/v1/scheduling/scenarios` 200.                                                                                                                                                                              |        |           |
| SCH-T-321 | `/en/scheduling/dashboard`                         | Redirect or 403. NO dashboard payloads.                                                                                                                                                                                              |        |           |
| SCH-T-322 | `/en/scheduling/cover-reports`                     | Redirect or 403. NO `/api/v1/scheduling/cover-reports` 200.                                                                                                                                                                          |        |           |
| SCH-T-323 | `/en/scheduling/leave-requests`                    | Redirect or 403 (admin/HR tool — NOT a teacher self-service page).                                                                                                                                                                   |        |           |
| SCH-T-324 | `/en/timetables`                                   | Either redirect to `/en/scheduling/my-timetable` OR show a teacher-restricted version showing only Sarah's own data (and certainly NOT the admin tabs for class/teacher/student/room). Confirm which behaviour applies and document. |        |           |
| SCH-T-325 | `/en/schedules`                                    | Redirect or 403. NO `/api/v1/schedules` admin list 200.                                                                                                                                                                              |        |           |
| SCH-T-326 | `/en/(print)/timetables/rooms/{any_room_id}/print` | Redirect or 403. The print page calls admin endpoints; teacher must not access it.                                                                                                                                                   |        |           |
| SCH-T-327 | `/en/scheduling/substitution-board`                | **Page LOADS** (kiosk-style, public-style read-only). See §10.                                                                                                                                                                       |        |           |

---

## 8. API Permission Denial — Admin Scheduling Endpoints

For each admin endpoint, call it via DevTools `fetch()` from a tab logged in as Sarah Daly. Assert **403** body has `{ error: { code, message } }` shape (per backend rules). Where the endpoint legitimately returns 404 for a missing/unscoped resource, document so.

### 8.1 Run orchestration

| #         | Method/Endpoint                                          | Permission required          | Expected | Actual | Pass/Fail |
| --------- | -------------------------------------------------------- | ---------------------------- | -------- | ------ | --------- |
| SCH-T-400 | `POST /v1/scheduling/runs/prerequisites`                 | `schedule.run_auto`          | 403      |        |           |
| SCH-T-401 | `POST /v1/scheduling/runs/trigger`                       | `schedule.run_auto`          | 403      |        |           |
| SCH-T-402 | `GET /v1/scheduling/runs`                                | `schedule.view_auto_reports` | 403      |        |           |
| SCH-T-403 | `GET /v1/scheduling/runs/{any_id}`                       | `schedule.view_auto_reports` | 403      |        |           |
| SCH-T-404 | `POST /v1/scheduling/runs/{any_id}/apply`                | `schedule.apply_auto`        | 403      |        |           |
| SCH-T-405 | `POST /v1/scheduling/runs/{any_id}/discard`              | `schedule.run_auto`          | 403      |        |           |
| SCH-T-406 | `POST /v1/scheduling/runs/{any_id}/cancel`               | `schedule.run_auto`          | 403      |        |           |
| SCH-T-407 | `GET /v1/scheduling/runs/{any_id}/status`                | `schedule.run_auto`          | 403      |        |           |
| SCH-T-408 | `POST /v1/scheduling/runs/{any_id}/validate`             | `schedule.run_auto`          | 403      |        |           |
| SCH-T-409 | `GET /v1/scheduling-runs/prerequisites`                  | `schedule.run_auto`          | 403      |        |           |
| SCH-T-410 | `GET /v1/scheduling-runs/feasibility`                    | `schedule.run_auto`          | 403      |        |           |
| SCH-T-411 | `POST /v1/scheduling-runs`                               | `schedule.run_auto`          | 403      |        |           |
| SCH-T-412 | `GET /v1/scheduling-runs`                                | `schedule.view_auto_reports` | 403      |        |           |
| SCH-T-413 | `GET /v1/scheduling-runs/{any_id}`                       | `schedule.view_auto_reports` | 403      |        |           |
| SCH-T-414 | `GET /v1/scheduling-runs/{any_id}/progress`              | `schedule.run_auto`          | 403      |        |           |
| SCH-T-415 | `GET /v1/scheduling-runs/{any_id}/diagnostics`           | `schedule.view_auto_reports` | 403      |        |           |
| SCH-T-416 | `POST /v1/scheduling-runs/{any_id}/diagnostics/simulate` | `schedule.view_auto_reports` | 403      |        |           |
| SCH-T-417 | `POST /v1/scheduling-runs/{any_id}/diagnostics/refresh`  | `schedule.view_auto_reports` | 403      |        |           |
| SCH-T-418 | `POST /v1/scheduling-runs/{any_id}/cancel`               | `schedule.run_auto`          | 403      |        |           |
| SCH-T-419 | `PATCH /v1/scheduling-runs/{any_id}/adjustments`         | `schedule.apply_auto`        | 403      |        |           |
| SCH-T-420 | `POST /v1/scheduling-runs/{any_id}/apply`                | `schedule.apply_auto`        | 403      |        |           |
| SCH-T-421 | `POST /v1/scheduling-runs/{any_id}/discard`              | `schedule.apply_auto`        | 403      |        |           |

### 8.2 Configuration tier

| #         | Method/Endpoint                                                 | Permission required               | Expected                           | Actual | Pass/Fail |
| --------- | --------------------------------------------------------------- | --------------------------------- | ---------------------------------- | ------ | --------- |
| SCH-T-430 | `GET /v1/scheduling/teacher-competencies`                       | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-431 | `GET /v1/scheduling/teacher-competencies/coverage`              | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-432 | `GET /v1/scheduling/teacher-competencies/by-teacher/{Sarah_id}` | `schedule.configure_requirements` | 403 (even her own — this is admin) |        |           |
| SCH-T-433 | `POST /v1/scheduling/teacher-competencies`                      | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-434 | `POST /v1/scheduling/teacher-competencies/bulk`                 | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-435 | `PATCH /v1/scheduling/teacher-competencies/{any_id}`            | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-436 | `DELETE /v1/scheduling/teacher-competencies/{any_id}`           | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-437 | `POST /v1/scheduling/teacher-competencies/copy`                 | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-438 | `POST /v1/scheduling/teacher-competencies/copy-to-years`        | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-439 | `GET /v1/scheduling/substitute-competencies`                    | `schedule.manage_substitutions`   | 403                                |        |           |
| SCH-T-440 | `POST /v1/scheduling/substitute-competencies`                   | `schedule.manage_substitutions`   | 403                                |        |           |
| SCH-T-441 | `GET /v1/scheduling/break-groups`                               | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-442 | `POST /v1/scheduling/break-groups`                              | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-443 | `PATCH /v1/scheduling/break-groups/{any_id}`                    | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-444 | `DELETE /v1/scheduling/break-groups/{any_id}`                   | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-445 | `GET /v1/scheduling/curriculum-requirements`                    | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-446 | `POST /v1/scheduling/curriculum-requirements`                   | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-447 | `PATCH /v1/scheduling/curriculum-requirements/{any_id}`         | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-448 | `DELETE /v1/scheduling/curriculum-requirements/{any_id}`        | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-449 | `POST /v1/scheduling/curriculum-requirements/bulk-upsert`       | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-450 | `POST /v1/scheduling/curriculum-requirements/copy`              | `schedule.configure_requirements` | 403                                |        |           |
| SCH-T-451 | `GET /v1/scheduling/room-closures`                              | `schedule.manage`                 | 403                                |        |           |
| SCH-T-452 | `POST /v1/scheduling/room-closures`                             | `schedule.manage`                 | 403                                |        |           |
| SCH-T-453 | `DELETE /v1/scheduling/room-closures/{any_id}`                  | `schedule.manage`                 | 403                                |        |           |
| SCH-T-454 | `GET /v1/scheduling/teacher-config`                             | `schedule.configure_availability` | 403                                |        |           |
| SCH-T-455 | `PUT /v1/scheduling/teacher-config`                             | `schedule.configure_availability` | 403                                |        |           |
| SCH-T-456 | `DELETE /v1/scheduling/teacher-config/{any_id}`                 | `schedule.configure_availability` | 403                                |        |           |
| SCH-T-457 | `POST /v1/scheduling/teacher-config/copy`                       | `schedule.configure_availability` | 403                                |        |           |

### 8.3 Schedule CRUD / pinning

| #         | Method/Endpoint                            | Permission required     | Expected | Actual | Pass/Fail |
| --------- | ------------------------------------------ | ----------------------- | -------- | ------ | --------- |
| SCH-T-460 | `POST /v1/schedules`                       | `schedule.manage`       | 403      |        |           |
| SCH-T-461 | `GET /v1/schedules`                        | `schedule.manage`       | 403      |        |           |
| SCH-T-462 | `GET /v1/schedules/{any_id}`               | `schedule.manage`       | 403      |        |           |
| SCH-T-463 | `PATCH /v1/schedules/{any_id}`             | `schedule.manage`       | 403      |        |           |
| SCH-T-464 | `DELETE /v1/schedules/{any_id}`            | `schedule.manage`       | 403      |        |           |
| SCH-T-465 | `POST /v1/schedules/bulk-pin`              | `schedule.pin_entries`  | 403      |        |           |
| SCH-T-466 | `POST /v1/schedules/{any_id}/pin`          | `schedule.pin_entries`  | 403      |        |           |
| SCH-T-467 | `POST /v1/schedules/{any_id}/unpin`        | `schedule.pin_entries`  | 403      |        |           |
| SCH-T-468 | `POST /v1/scheduling/swaps/validate`       | `schedule.manage`       | 403      |        |           |
| SCH-T-469 | `POST /v1/scheduling/swaps/execute`        | `schedule.manage`       | 403      |        |           |
| SCH-T-470 | `POST /v1/scheduling/emergency-change`     | `schedule.manage`       | 403      |        |           |
| SCH-T-471 | `PUT /v1/scheduling/rotation`              | `schedule.manage`       | 403      |        |           |
| SCH-T-472 | `GET /v1/scheduling/rotation`              | `schedule.view_reports` | 403      |        |           |
| SCH-T-473 | `DELETE /v1/scheduling/rotation`           | `schedule.manage`       | 403      |        |           |
| SCH-T-474 | `GET /v1/scheduling/rotation/current-week` | `schedule.view_reports` | 403      |        |           |

### 8.4 Substitution admin

| #         | Method/Endpoint                                       | Permission required             | Expected | Actual | Pass/Fail |
| --------- | ----------------------------------------------------- | ------------------------------- | -------- | ------ | --------- |
| SCH-T-480 | `POST /v1/scheduling/absences`                        | `schedule.manage_substitutions` | 403      |        |           |
| SCH-T-481 | `GET /v1/scheduling/absences`                         | `schedule.manage_substitutions` | 403      |        |           |
| SCH-T-482 | `DELETE /v1/scheduling/absences/{any_id}`             | `schedule.manage_substitutions` | 403      |        |           |
| SCH-T-483 | `POST /v1/scheduling/absences/{any_id}/cancel`        | `schedule.manage_substitutions` | 403      |        |           |
| SCH-T-484 | `GET /v1/scheduling/absences/{any_id}/substitutes`    | `schedule.manage_substitutions` | 403      |        |           |
| SCH-T-485 | `GET /v1/scheduling/absences/{any_id}/substitutes/ai` | `schedule.manage_substitutions` | 403      |        |           |
| SCH-T-486 | `POST /v1/scheduling/substitutions`                   | `schedule.manage_substitutions` | 403      |        |           |
| SCH-T-487 | `GET /v1/scheduling/substitutions`                    | `schedule.manage_substitutions` | 403      |        |           |
| SCH-T-488 | `GET /v1/scheduling/teachers`                         | `schedule.manage_substitutions` | 403      |        |           |
| SCH-T-489 | `GET /v1/scheduling/cover-reports`                    | `schedule.view_reports`         | 403      |        |           |
| SCH-T-490 | `GET /v1/scheduling/cover-reports/fairness`           | `schedule.view_reports`         | 403      |        |           |
| SCH-T-491 | `GET /v1/scheduling/cover-reports/by-department`      | `schedule.view_reports`         | 403      |        |           |

### 8.5 Exams

| #         | Method/Endpoint                                                  | Permission required     | Expected | Actual | Pass/Fail |
| --------- | ---------------------------------------------------------------- | ----------------------- | -------- | ------ | --------- |
| SCH-T-500 | `POST /v1/scheduling/exam-sessions`                              | `schedule.manage_exams` | 403      |        |           |
| SCH-T-501 | `GET /v1/scheduling/exam-sessions`                               | `schedule.manage_exams` | 403      |        |           |
| SCH-T-502 | `GET /v1/scheduling/exam-sessions/{any_id}`                      | `schedule.manage_exams` | 403      |        |           |
| SCH-T-503 | `PUT /v1/scheduling/exam-sessions/{any_id}`                      | `schedule.manage_exams` | 403      |        |           |
| SCH-T-504 | `DELETE /v1/scheduling/exam-sessions/{any_id}`                   | `schedule.manage_exams` | 403      |        |           |
| SCH-T-505 | `GET /v1/scheduling/exam-sessions/{any_id}/slots`                | `schedule.manage_exams` | 403      |        |           |
| SCH-T-506 | `POST /v1/scheduling/exam-sessions/{any_id}/slots`               | `schedule.manage_exams` | 403      |        |           |
| SCH-T-507 | `POST /v1/scheduling/exam-sessions/{any_id}/generate`            | `schedule.manage_exams` | 403      |        |           |
| SCH-T-508 | `POST /v1/scheduling/exam-sessions/{any_id}/assign-invigilators` | `schedule.manage_exams` | 403      |        |           |
| SCH-T-509 | `POST /v1/scheduling/exam-sessions/{any_id}/publish`             | `schedule.manage_exams` | 403      |        |           |

### 8.6 Scenarios

| #         | Method/Endpoint                                | Permission required         | Expected | Actual | Pass/Fail |
| --------- | ---------------------------------------------- | --------------------------- | -------- | ------ | --------- |
| SCH-T-510 | `POST /v1/scheduling/scenarios`                | `schedule.manage_scenarios` | 403      |        |           |
| SCH-T-511 | `GET /v1/scheduling/scenarios`                 | `schedule.manage_scenarios` | 403      |        |           |
| SCH-T-512 | `GET /v1/scheduling/scenarios/{any_id}`        | `schedule.manage_scenarios` | 403      |        |           |
| SCH-T-513 | `PUT /v1/scheduling/scenarios/{any_id}`        | `schedule.manage_scenarios` | 403      |        |           |
| SCH-T-514 | `DELETE /v1/scheduling/scenarios/{any_id}`     | `schedule.manage_scenarios` | 403      |        |           |
| SCH-T-515 | `POST /v1/scheduling/scenarios/{any_id}/solve` | `schedule.manage_scenarios` | 403      |        |           |
| SCH-T-516 | `POST /v1/scheduling/scenarios/compare`        | `schedule.manage_scenarios` | 403      |        |           |

### 8.7 Analytics / Dashboard

| #         | Method/Endpoint                                 | Permission required                                                       | Expected                                                                                                     | Actual | Pass/Fail |
| --------- | ----------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-T-520 | `GET /v1/scheduling/analytics/efficiency`       | `schedule.view_reports`                                                   | 403                                                                                                          |        |           |
| SCH-T-521 | `GET /v1/scheduling/analytics/workload`         | `schedule.view_reports`                                                   | 403                                                                                                          |        |           |
| SCH-T-522 | `GET /v1/scheduling/analytics/rooms`            | `schedule.view_reports`                                                   | 403                                                                                                          |        |           |
| SCH-T-523 | `GET /v1/scheduling/analytics/historical`       | `schedule.view_reports`                                                   | 403                                                                                                          |        |           |
| SCH-T-524 | `GET /v1/scheduling-dashboard/overview`         | `schedule.view_auto_reports`                                              | 403                                                                                                          |        |           |
| SCH-T-525 | `GET /v1/scheduling-dashboard/workload`         | `schedule.view_auto_reports`                                              | 403                                                                                                          |        |           |
| SCH-T-526 | `GET /v1/scheduling-dashboard/unassigned`       | `schedule.view_auto_reports`                                              | 403                                                                                                          |        |           |
| SCH-T-527 | `GET /v1/scheduling-dashboard/room-utilisation` | `schedule.view_auto_reports`                                              | 403                                                                                                          |        |           |
| SCH-T-528 | `GET /v1/scheduling-dashboard/trends`           | `schedule.view_auto_reports`                                              | 403                                                                                                          |        |           |
| SCH-T-529 | `GET /v1/scheduling-dashboard/preferences`      | `schedule.view_own_satisfaction` (own scope) OR `view_auto_reports` (all) | **200** scoped to Sarah only                                                                                 |        |           |
| SCH-T-530 | DevTools                                        | Inspect SCH-T-529 payload.                                                | Every record's staff id is Sarah's. Aggregates are her totals only. NO other staff data. NO admin breakdown. |        |           |

### 8.8 Timetables admin

| #         | Method/Endpoint                                     | Permission required                        | Expected                                                            | Actual | Pass/Fail |
| --------- | --------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- | ------ | --------- |
| SCH-T-540 | `GET /v1/timetables/teacher/{another_id}`           | `schedule.manage`                          | 403                                                                 |        |           |
| SCH-T-541 | `GET /v1/timetables/teacher/{Sarah_id}`             | `schedule.view_own` (own only)             | **200** (Sarah's own) — verify response contains only her schedule. |        |           |
| SCH-T-542 | `GET /v1/timetables/class/{any_class_id}`           | `schedule.manage` or `schedule.view_class` | 403                                                                 |        |           |
| SCH-T-543 | `GET /v1/timetables/room/{any_room_id}`             | `schedule.manage`                          | 403                                                                 |        |           |
| SCH-T-544 | `GET /v1/timetables/student/{any_student_id}`       | `students.view` or parent-of               | 403                                                                 |        |           |
| SCH-T-545 | `GET /v1/reports/workload`                          | `schedule.manage`                          | 403                                                                 |        |           |
| SCH-T-546 | `GET /v1/scheduling/timetable/teacher/{another_id}` | `schedule.view_reports`                    | 403                                                                 |        |           |
| SCH-T-547 | `GET /v1/scheduling/timetable/my`                   | `schedule.view_own`                        | 200 (own data)                                                      |        |           |
| SCH-T-548 | `GET /v1/scheduling/timetable/class/{any_class_id}` | `schedule.view_reports`                    | 403                                                                 |        |           |

### 8.9 Calendar tokens

| #         | Method/Endpoint                                                                                          | Permission required | Expected                                                            | Actual | Pass/Fail |
| --------- | -------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------- | ------ | --------- |
| SCH-T-560 | `POST /v1/scheduling/calendar-tokens` body `{ entity_type: 'teacher', entity_id: <Sarah_id> }`           | `schedule.view_own` | 201                                                                 |        |           |
| SCH-T-561 | `POST /v1/scheduling/calendar-tokens` body `{ entity_type: 'teacher', entity_id: <another_teacher_id> }` | `schedule.view_own` | 403 OR 400 — Sarah cannot create a token scoped to another teacher. |        |           |
| SCH-T-562 | `POST /v1/scheduling/calendar-tokens` body `{ entity_type: 'class', entity_id: <any_class_id> }`         | `schedule.view_own` | 403 — class tokens require admin permission.                        |        |           |
| SCH-T-563 | `GET /v1/scheduling/calendar-tokens`                                                                     | `schedule.view_own` | 200 — returns ONLY tokens Sarah owns.                               |        |           |
| SCH-T-564 | `DELETE /v1/scheduling/calendar-tokens/{another_users_token_id}`                                         | `schedule.view_own` | 403 OR 404. NEVER 204.                                              |        |           |

---

## 9. `/scheduling/my-satisfaction` — Own Satisfaction

**URL:** `/en/scheduling/my-satisfaction`
**Permission:** `schedule.view_own_satisfaction`

| #         | Page/Endpoint                    | Action                                                                                                                | Expected                                                                                                                                                                                                 | Actual | Pass/Fail |
| --------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-080 | `/en/scheduling/my-satisfaction` | Navigate to the page.                                                                                                 | Page loads. Hero shows overall satisfaction percentage. Below: total preferences, satisfied vs unsatisfied counts.                                                                                       |        |           |
| SCH-T-081 | Network                          | Inspect XHR.                                                                                                          | `GET /api/v1/academic-years?pageSize=1&status=active` (200), then `GET /api/v1/scheduling-dashboard/preferences?academic_year_id={yearId}` (200).                                                        |        |           |
| SCH-T-082 | DevTools                         | Inspect response body.                                                                                                | Every record `staff_profile_id === Sarah's`. Aggregate fields are her totals. NO other staff appear. NO breakdown by department.                                                                         |        |           |
| SCH-T-083 | Empty / no data                  | If no run has produced satisfaction data, observe the UI.                                                             | An empty-state message renders (e.g. "No satisfaction data yet — once a scheduling run is applied, your data will appear"). NOT a crash.                                                                 |        |           |
| SCH-T-084 | Detailed list                    | Scroll to the per-preference list.                                                                                    | Each preference row shows: subject/class/time-slot label, sentiment, priority, "Satisfied"/"Not satisfied" badge, possibly a reason ("conflict with X period"). NO other teacher's preferences visible.  |        |           |
| SCH-T-085 | Read-only                        | Look for any edit / change buttons.                                                                                   | NONE. This page is read-only. Editing happens at `/scheduling/my-preferences`.                                                                                                                           |        |           |
| SCH-T-086 | Active year guard                | If no active academic year exists (test by toggling status off), reload.                                              | Page renders an error/empty state ("No active academic year"). Does NOT crash. Console error logged via `console.error('[funcName]', err)`.                                                              |        |           |
| SCH-T-087 | Cross-staff probe                | Via DevTools, `GET /api/v1/scheduling-dashboard/preferences?academic_year_id={yearId}&staff_profile_id={another_id}`. | Returns 200 but **scoped to Sarah** (server ignores the staff_profile_id param when caller has only `view_own_satisfaction`) OR returns **403**. EITHER is acceptable; document which behaviour applies. |        |           |
| SCH-T-088 | RTL                              | Switch to AR.                                                                                                         | Numbers stay Western (per CLAUDE.md). Layout flips. No `ml-`/`mr-`. Doughnut/pie chart (if any) flips correctly.                                                                                         |        |           |
| SCH-T-089 | 375 px                           | Resize.                                                                                                               | Hero stacks. Cards collapse to single column. Lists scroll vertically. No horizontal overflow.                                                                                                           |        |           |
| SCH-T-090 | Dark mode                        | Toggle theme.                                                                                                         | Backgrounds, text, chart colours all use design tokens. No hardcoded white/black hex.                                                                                                                    |        |           |

---

## 10. Substitution Board (Read-Only) and Substitution Offers (Accept/Decline)

### 10.1 Substitution Board (`/scheduling/substitution-board`)

The substitution board is a **kiosk-style read-only view**. It is technically public (no auth check on the public board endpoint), but it is also reachable as Sarah (logged in).

| #         | Page/Endpoint                       | Action                                                                            | Expected                                                                                                                                                                                                          | Actual | Pass/Fail |
| --------- | ----------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-120 | `/en/scheduling/substitution-board` | Navigate as Sarah.                                                                | Page loads. Two sections: upcoming absences, today's slots. Status indicators: unassigned / assigned / confirmed.                                                                                                 |        |           |
| SCH-T-121 | Network                             | Inspect XHR.                                                                      | `GET /api/v1/scheduling/substitution-board` returns 200. Auto-refresh fires every 60s with countdown timer. NO other admin endpoints called.                                                                      |        |           |
| SCH-T-122 | Visibility                          | Check that Sarah sees only relevant rows.                                         | Board shows the tenant's school-wide today/upcoming absences (this is the kiosk view). The data is school-wide, not personal — but it does NOT expose admin-only fields like internal notes, cancellation_reason. |        |           |
| SCH-T-123 | Sarah's own absence                 | If Sarah has reported an absence (from §4), verify it appears here.               | Yes, with status reflecting cascade state.                                                                                                                                                                        |        |           |
| SCH-T-124 | Sarah as substitute                 | If Sarah has accepted a cover, verify she appears as the substitute on that slot. | Yes, "Cover by Sarah Daly" or similar label.                                                                                                                                                                      |        |           |
| SCH-T-125 | Read-only                           | Look for any "Assign substitute", "Edit", "Delete" buttons.                       | NONE on this view (read-only).                                                                                                                                                                                    |        |           |
| SCH-T-126 | Auto-refresh                        | Wait 70 seconds.                                                                  | Board re-fetches automatically. Countdown timer resets. No 429.                                                                                                                                                   |        |           |
| SCH-T-127 | Theme toggle                        | If a dark/light theme toggle exists, click it.                                    | Theme switches. Saved in localStorage. No layout break.                                                                                                                                                           |        |           |
| SCH-T-128 | Mobile 375 px                       | Resize.                                                                           | Sections stack. School name/logo wrap. Tap targets ≥ 44 px.                                                                                                                                                       |        |           |
| SCH-T-129 | RTL                                 | Switch locale.                                                                    | Layout flips. Date/time formatting respects locale.                                                                                                                                                               |        |           |

### 10.2 Substitution Offers — Accept / Decline

Sarah receives offer notifications (in-app via inbox / notification bell). She can accept or decline. There is no dedicated `/scheduling/offers` page; offers are surfaced in the notification stream and via `GET /v1/scheduling/offers/my`.

| #         | Page/Endpoint                  | Action                                                                          | Expected                                                                                                                                                                                                                          | Actual | Pass/Fail |
| --------- | ------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-130 | `GET /v1/scheduling/offers/my` | DevTools fetch.                                                                 | Returns 200 with an array of pending offers for Sarah. Each offer has: absence_id, schedule snippet (subject/class/period/date), reason for offer (e.g. "primary tier"), expiry timestamp. RLS-scoped to her tenant.              |        |           |
| SCH-T-131 | Notification                   | Open the inbox / notification stream.                                           | A notification card surfaces the pending offer with a deep-link / "Respond" CTA.                                                                                                                                                  |        |           |
| SCH-T-132 | Accept                         | Click "Accept" on a pending offer.                                              | `POST /v1/scheduling/offers/{id}/accept` fires. Returns 200. Offer status → accepted. SubstitutionRecord created with status=confirmed. Toast: "Offer accepted". The slot now appears in Sarah's `/my-timetable` as a cover slot. |        |           |
| SCH-T-133 | Decline                        | Click "Decline" on another pending offer; provide an optional reason.           | `POST /v1/scheduling/offers/{id}/decline` fires with `{ reason: '...' }`. Returns 200. Offer status → declined. Cascade escalates to next tier.                                                                                   |        |           |
| SCH-T-134 | Already-handled offer          | Try to accept an offer that has already been revoked.                           | API returns 4xx (409 conflict or 400) with a meaningful error message. UI shows toast: "Offer no longer available". NO crash.                                                                                                     |        |           |
| SCH-T-135 | Cross-tenant                   | Via DevTools, `POST /v1/scheduling/offers/{stress-a_offer_id}/accept`.          | Returns **404** (RLS hides the row). NEVER 200. NO data leak in error body.                                                                                                                                                       |        |           |
| SCH-T-136 | Cross-user                     | Via DevTools, attempt to accept an offer made to a different teacher in `nhqs`. | Returns **403** or **404**. NEVER 200.                                                                                                                                                                                            |        |           |
| SCH-T-137 | Listing scope                  | DevTools — `GET /v1/scheduling/offers/my`.                                      | Response contains ONLY offers where `staff_profile_id === Sarah's`. NO other staff's offers leak.                                                                                                                                 |        |           |

---

## 11. Calendar Integration — Lessons Surface in Main Calendar / Dashboard

The teacher's main calendar (e.g. `/calendar` or `/engagement-calendar`) and dashboard widgets MUST source from the timetable so Sarah's lessons appear there too. This is critical: the teacher should not have to remember to open `/scheduling/my-timetable` separately.

| #         | Page/Endpoint                           | Action                                                                                           | Expected                                                                                                                                             | Actual | Pass/Fail |
| --------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-150 | `/en/calendar` (or main calendar route) | Navigate to Sarah's main calendar.                                                               | Calendar loads. Today's view shows scheduled lesson events alongside any non-academic events (assemblies, term dates, etc.).                         |        |           |
| SCH-T-151 | Network                                 | Inspect XHR.                                                                                     | A call to a calendar aggregation endpoint OR `GET /api/v1/timetables/me` is made and rendered as events. Confirm the source.                         |        |           |
| SCH-T-152 | Event content                           | Click a lesson event.                                                                            | Event detail shows subject, class, period, room. Same content as on `/scheduling/my-timetable`. Same `schedule_id` referenced.                       |        |           |
| SCH-T-153 | Cover events                            | If Sarah has accepted a cover, verify it appears.                                                | A cover event renders, distinguishable visually (badge or differently-coloured chip).                                                                |        |           |
| SCH-T-154 | Other-teacher events                    | Inspect the calendar for any event NOT belonging to Sarah.                                       | Only Sarah's events (and tenant-level non-personal events like school holidays) render. NO other teachers' lessons appear.                           |        |           |
| SCH-T-155 | Home dashboard widget                   | Go to `/en/`. Inspect "Today's lessons" / "Next lesson" widget.                                  | Widget pulls from `/api/v1/timetables/me` (or an aggregated equivalent). Shows next 1–3 lessons. "View all" CTA leads to `/scheduling/my-timetable`. |        |           |
| SCH-T-156 | Stale data                              | Trigger an admin run apply (out-of-band) that changes Sarah's Mon p1 room. Reload her dashboard. | Dashboard reflects the new room (after the cache window). NO stale data persists indefinitely.                                                       |        |           |
| SCH-T-157 | iCal external client                    | Add the iCal subscription URL (from §2.4) to an external calendar client (e.g. macOS Calendar).  | Lessons sync. VEVENT entries match the in-app timetable. Time zone handled correctly (UTC vs school TZ).                                             |        |           |

---

## 12. Multi-Tenant RLS — Hostile Sibling (`stress-a`)

Sarah is a `nhqs` teacher. She MUST never see `stress-a` data, even if she guesses the URL or UUID. These six assertions catch RLS regressions at the UI/API edge.

| #         | Assertion                                                                                                                                     | Observed Result                                                                                                                                                                                      | Pass/Fail |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --- |
| SCH-T-180 | Direct URL `/en/scheduling/my-timetable` after manually swapping host header to `stress-a.edupod.app` (browser-side N/A; conceptual API test) | Cookies are domain-scoped to `nhqs.edupod.app`; cross-host attempt prompts re-login. NO data leak.                                                                                                   |           |     |
| SCH-T-181 | `GET /api/v1/timetables/teacher/{stress-a_teacher_staff_id}` from Sarah's `nhqs` session                                                      | **403** (or 404 if RLS hides). NEVER 200 with data.                                                                                                                                                  |           |     |
| SCH-T-182 | `GET /api/v1/scheduling/offers/my?staff_profile_id={stress-a_teacher_id}` (param injection)                                                   | Returns Sarah's offers only — server ignores the injected param OR returns 400. NO `stress-a` offers.                                                                                                |           |     |
| SCH-T-183 | `POST /v1/scheduling/offers/{stress-a_offer_id}/accept` from `nhqs` session                                                                   | **404** (RLS hides) or **403**. NEVER 200.                                                                                                                                                           |           |     |
| SCH-T-184 | `GET /v1/calendar/{stress-a_tenant_id}/{stress-a_token}.ics` from any browser                                                                 | Returns 200 (public endpoint), but the response is `stress-a`'s data, NOT `nhqs` data. This is intentional — the token IS the auth. NO `nhqs` data leak via this URL even if the token is malformed. |           |     |
| SCH-T-185 | `GET /v1/scheduling/timetable/my` from `nhqs` session                                                                                         | Response contains ONLY `nhqs` schedule entries. Verify no row's `tenant_id` is `stress-a`.                                                                                                           |           |     |

---

## 13. Cross-Cutting — Console / Network Health

| #         | Page/Endpoint     | Action                                                                         | Expected                                                                                                                                                                                     | Actual | Pass/Fail |
| --------- | ----------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-600 | All teacher pages | F12 → Console; navigate through every teacher-allowed page (§§2, 3, 4, 9, 10). | Zero uncaught JS errors. Warnings ok. Expected 403s (e.g. dashboard/admin probes that the UI defensively makes) are caught and logged via `console.error('[fn]', err)` — never raw uncaught. |        |           |
| SCH-T-601 | Network           | Watch Network tab for the same flow.                                           | NO 5xx. NO unexpected 401 (no silent token expiry mid-session). 403s are limited to admin endpoints accidentally probed, and those calls are NOT triggered by teacher-facing UI. NO 429.     |        |           |
| SCH-T-602 | Polling cadence   | Stay on `/en/scheduling/my-timetable` for 3 minutes.                           | If the page polls for offer updates, the cadence is reasonable (≥ 30s interval). NO duplicate parallel requests. NO request flood.                                                           |        |           |
| SCH-T-603 | CORS              | Inspect any cross-origin request.                                              | NO CORS errors. All API calls go to same origin or known allowed origins.                                                                                                                    |        |           |
| SCH-T-604 | Failed fetch      | Watch for `Failed to fetch` errors.                                            | NONE during normal navigation. Network failures are surfaced via toast/inline error, not console crashes.                                                                                    |        |           |
| SCH-T-605 | Chunk load        | Rapidly navigate between teacher pages.                                        | NO "ChunkLoadError". NO white screen between transitions. The morph bar is stable.                                                                                                           |        |           |
| SCH-T-606 | Memory            | Open and close the absence form modal 10 times.                                | NO memory leak warnings. NO duplicate event-listener buildup (verifiable via Chrome DevTools Memory profiler if needed).                                                                     |        |           |

---

## 14. Cross-Cutting — RTL Parity (Arabic)

Switch locale to AR via the locale switcher. Re-test every teacher-allowed page.

| #         | Page                                                       | Expected behaviour                                                                                                                                                                          | Actual | Pass/Fail |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-700 | `/ar/scheduling/my-timetable`                              | Page direction = RTL. Day columns flow R→L. Period column on the right. All margin/padding uses `ms-`/`me-`. NO `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-` found via DevTools Element search. |        |           |
| SCH-T-701 | `/ar/scheduling/my-preferences`                            | Tabs render R→L. Sentiment / priority labels in AR (translated). Numerals Western per CLAUDE.md.                                                                                            |        |           |
| SCH-T-702 | `/ar/scheduling/my-satisfaction`                           | Hero / chart layout flips. Percentages shown with Western numerals.                                                                                                                         |        |           |
| SCH-T-703 | `/ar/scheduling/substitution-board`                        | Sections flip. School name in AR. Auto-refresh continues.                                                                                                                                   |        |           |
| SCH-T-704 | Self-report absence form                                   | Date pickers use AR labels. Calendar widget flows RTL. Buttons (Save / Cancel) order swapped.                                                                                               |        |           |
| SCH-T-705 | Calendar subscription URL                                  | URL field always LTR (forced via `dir="ltr"` on the input). NO bidi flip in the URL itself.                                                                                                 |        |           |
| SCH-T-706 | Email-style fields (e.g. teacher's email in profile)       | Always LTR.                                                                                                                                                                                 |        |           |
| SCH-T-707 | Mixed-script content (subject names in EN inside AR shell) | Renders correctly with no garbled bidi. Subject "Maths" appears LTR inside the AR cell.                                                                                                     |        |           |
| SCH-T-708 | Prev/Next week arrows                                      | Use `rtl:rotate-180` so they remain semantically correct (Prev still goes back in time).                                                                                                    |        |           |

---

## 15. Cross-Cutting — Dark Mode Parity

Toggle the theme via the user menu (or system preference).

| #         | Page                                | Expected behaviour                                                                                                    | Actual | Pass/Fail |
| --------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-720 | `/en/scheduling/my-timetable`       | Background, cell tints, text all use design tokens. NO hardcoded hex. Today indicator and cover badge remain visible. |        |           |
| SCH-T-721 | `/en/scheduling/my-preferences`     | Sentiment / priority chips remain readable. Form controls themed.                                                     |        |           |
| SCH-T-722 | `/en/scheduling/my-satisfaction`    | Charts use themed colours. Hero text contrast ≥ 4.5:1.                                                                |        |           |
| SCH-T-723 | `/en/scheduling/substitution-board` | Kiosk page already supports light/dark; verify both look right and the theme persists across auto-refresh.            |        |           |
| SCH-T-724 | Self-report absence modal           | Modal background, inputs, calendar all themed.                                                                        |        |           |
| SCH-T-725 | Toast notifications                 | Toasts (success / error) themed correctly.                                                                            |        |           |

---

## 16. Cross-Cutting — Mobile (375 px)

Set viewport to 375 px (iPhone SE). Re-test every teacher-allowed page. Confirm mobile-first compliance per `frontend.md`.

| #         | Page                                | Expected behaviour                                                                                                                                                                                                                         | Actual | Pass/Fail |
| --------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-T-740 | `/en/scheduling/my-timetable`       | Grid wraps in `overflow-x-auto`. Period column sticky-left. NO body horizontal scroll. Tap targets ≥ 44 px.                                                                                                                                |        |           |
| SCH-T-741 | `/en/scheduling/my-preferences`     | Single-column layout. Tabs collapse if needed (≤ 4 = inline; 5+ = scroll). Inputs `w-full` and ≥ 16 px font.                                                                                                                               |        |           |
| SCH-T-742 | `/en/scheduling/my-satisfaction`    | Cards stack. Charts use `ResponsiveContainer`. NO overflow.                                                                                                                                                                                |        |           |
| SCH-T-743 | `/en/scheduling/substitution-board` | Sections stack. Auto-refresh continues. Logo/title wrap.                                                                                                                                                                                   |        |           |
| SCH-T-744 | Self-report absence modal           | Full-screen modal. Single-column. Save/Cancel sticky at bottom.                                                                                                                                                                            |        |           |
| SCH-T-745 | Hamburger nav                       | Mobile nav opens hamburger overlay. Teacher-only items visible (My Timetable, My Preferences, etc.). Admin items absent.                                                                                                                   |        |           |
| SCH-T-746 | Long subject / class names          | Long strings break with `break-all` or truncate with ellipsis. NO horizontal overflow.                                                                                                                                                     |        |           |
| SCH-T-747 | Time inputs                         | If a time input is rendered (e.g. period_from for partial absence), font ≥ 16 px (no iOS auto-zoom). NB: `availability/page.tsx` line 96 has `text-xs` on a time input — that page is admin-only so teacher won't see it; document anyway. |        |           |

---

## 17. Data Invariants (DB-Level Spot-Checks)

Run these read-only queries (or verify via DevTools network responses) after major flows. The spec author MUST have read access to a query console (psql, Prisma Studio, or admin SQL tool) with appropriate tenant context.

| #         | Invariant                                                                                                                                                                             | How to verify                                                                                                                                                  | Actual | Pass/Fail |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-T-800 | Every row returned by `/api/v1/timetables/me` has `tenant_id = nhqs` AND `teacher_staff_id = Sarah's id` (or is a substitution where `substitute_staff_id = Sarah's`).                | Inspect JSON. SUM should equal expected lesson count for the week.                                                                                             |        |           |
| SCH-T-801 | Every row in `/api/v1/staff-scheduling-preferences/own` has `staff_profile_id = Sarah's id` AND `tenant_id = nhqs`.                                                                   | Inspect JSON.                                                                                                                                                  |        |           |
| SCH-T-802 | Every row in `/api/v1/scheduling/offers/my` has `staff_profile_id = Sarah's id` AND `tenant_id = nhqs`.                                                                               | Inspect JSON.                                                                                                                                                  |        |           |
| SCH-T-803 | A teacher self-report absence created via UI has `absence_type = 'self_reported'`, `reported_by_user_id = Sarah's user_id`.                                                           | Verify via admin dashboard or DB query (admin role).                                                                                                           |        |           |
| SCH-T-804 | Cancelling an absence via `cancel-own` sets `cancelled_at` and `cancelled_by_user_id = Sarah's user_id` AND triggers `revokeOffersForAbsence()`.                                      | Re-fetch offers after cancellation; previously-pending offers for this absence should be `status = 'revoked'`.                                                 |        |           |
| SCH-T-805 | Accepting an offer creates a `substitution_record` with `substitute_staff_id = Sarah's id` AND `status = 'confirmed'` AND the related schedule cell now shows Sarah on her timetable. | Verify both API responses and `/api/v1/timetables/me` reflection.                                                                                              |        |           |
| SCH-T-806 | A calendar subscription token created by Sarah has `entity_type = 'teacher'` AND `entity_id = Sarah's staff_profile_id` AND `tenant_id = nhqs`.                                       | Inspect token row.                                                                                                                                             |        |           |
| SCH-T-807 | When Sarah revokes a token, the row is deleted (or status flagged); subsequent fetches of the public ICS URL return 404.                                                              | Verify via subsequent GET on the public URL.                                                                                                                   |        |           |
| SCH-T-808 | No row in any scheduling table accessed during this session has `tenant_id = stress-a's tenant_id`.                                                                                   | If admin DB access available, run `SELECT count(*) FROM teacher_absence WHERE tenant_id = '<stress-a>' AND id IN (<ids seen in Sarah's session>)` — must be 0. |        |           |

---

## 18. Backend Endpoint Map (Teacher-Touched)

Complete reference of every API endpoint the teacher-facing UI calls (or which the teacher's session may legitimately invoke). Endpoints marked **DENIED** are exercised in §8 to confirm the teacher receives 403.

| #      | Method | Path                                                        | Permission required                          | Teacher access                   | Used in §       |
| ------ | ------ | ----------------------------------------------------------- | -------------------------------------------- | -------------------------------- | --------------- |
| 18.01  | GET    | `/api/v1/academic-years`                                    | Authenticated                                | Allowed                          | 2, 3, 9         |
| 18.02  | GET    | `/api/v1/timetables/me`                                     | `schedule.view_own`                          | Allowed (own only)               | 2, 11           |
| 18.03  | GET    | `/api/v1/scheduling/timetable/my`                           | `schedule.view_own`                          | Allowed                          | 2, 8.8          |
| 18.04  | GET    | `/api/v1/timetables/teacher/{Sarah_id}`                     | `schedule.view_own` (own scope)              | Allowed (own only)               | 8.8             |
| 18.05  | GET    | `/api/v1/timetables/teacher/{another_id}`                   | `schedule.manage`                            | **DENIED**                       | 5, 8.8          |
| 18.06  | GET    | `/api/v1/timetables/class/{any}`                            | `schedule.manage` / view_class               | **DENIED**                       | 5, 8.8          |
| 18.07  | GET    | `/api/v1/timetables/room/{any}`                             | `schedule.manage`                            | **DENIED**                       | 5, 8.8          |
| 18.08  | GET    | `/api/v1/timetables/student/{any}`                          | `students.view` / parent                     | **DENIED** (Sarah is not parent) | 5, 8.8          |
| 18.09  | GET    | `/api/v1/reports/workload`                                  | `schedule.manage`                            | **DENIED**                       | 5, 8.8          |
| 18.10  | GET    | `/api/v1/staff-scheduling-preferences/own`                  | `schedule.view_own`                          | Allowed                          | 3               |
| 18.11  | POST   | `/api/v1/staff-scheduling-preferences/own`                  | `schedule.view_own`                          | Allowed                          | 3               |
| 18.12  | PATCH  | `/api/v1/staff-scheduling-preferences/own/{id}`             | `schedule.view_own`                          | Allowed (own only)               | 3               |
| 18.13  | DELETE | `/api/v1/staff-scheduling-preferences/own/{id}`             | `schedule.view_own`                          | Allowed (own only)               | 3               |
| 18.14  | GET    | `/api/v1/staff-scheduling-preferences`                      | admin                                        | **DENIED**                       | 5, 8.8          |
| 18.15  | POST   | `/api/v1/staff-scheduling-preferences`                      | admin                                        | **DENIED**                       | 5, 8.8          |
| 18.16  | GET    | `/api/v1/scheduling-dashboard/preferences`                  | `schedule.view_own_satisfaction` (own scope) | Allowed (own only)               | 9, 8.7          |
| 18.17  | POST   | `/api/v1/scheduling/absences/self-report`                   | `schedule.report_own_absence`                | Allowed                          | 4               |
| 18.18  | POST   | `/api/v1/scheduling/absences/{id}/cancel-own`               | `schedule.report_own_absence`                | Allowed (own only)               | 4               |
| 18.19  | GET    | `/api/v1/scheduling/colleagues`                             | `schedule.report_own_absence`                | Allowed                          | 4               |
| 18.20  | GET    | `/api/v1/scheduling/offers/my`                              | `schedule.respond_to_offer`                  | Allowed                          | 10              |
| 18.21  | POST   | `/api/v1/scheduling/offers/{id}/accept`                     | `schedule.respond_to_offer`                  | Allowed                          | 10              |
| 18.22  | POST   | `/api/v1/scheduling/offers/{id}/decline`                    | `schedule.respond_to_offer`                  | Allowed                          | 10              |
| 18.23  | GET    | `/api/v1/scheduling/substitution-board`                     | None (kiosk/public)                          | Allowed                          | 10              |
| 18.24  | POST   | `/api/v1/scheduling/calendar-tokens`                        | `schedule.view_own`                          | Allowed (own only scope)         | 2.4             |
| 18.25  | GET    | `/api/v1/scheduling/calendar-tokens`                        | `schedule.view_own`                          | Allowed (own only)               | 2.4             |
| 18.26  | DELETE | `/api/v1/scheduling/calendar-tokens/{tokenId}`              | `schedule.view_own`                          | Allowed (own only)               | 2.4             |
| 18.27  | GET    | `/api/v1/calendar/{tenantId}/{token}.ics`                   | None (token-auth)                            | Allowed (anyone with token)      | 2.4             |
| 18.28  | POST   | `/api/v1/scheduling/absences`                               | `schedule.manage_substitutions`              | **DENIED**                       | 8.4             |
| 18.29  | GET    | `/api/v1/scheduling/absences`                               | `schedule.manage_substitutions`              | **DENIED**                       | 4.6, 8.4        |
| 18.30  | DELETE | `/api/v1/scheduling/absences/{id}`                          | `schedule.manage_substitutions`              | **DENIED**                       | 4.5, 8.4        |
| 18.31  | POST   | `/api/v1/scheduling/absences/{id}/cancel`                   | `schedule.manage_substitutions`              | **DENIED**                       | 4.5, 8.4        |
| 18.32  | GET    | `/api/v1/scheduling/absences/{id}/substitutes`              | `schedule.manage_substitutions`              | **DENIED**                       | 8.4             |
| 18.33  | GET    | `/api/v1/scheduling/absences/{id}/substitutes/ai`           | `schedule.manage_substitutions`              | **DENIED**                       | 8.4             |
| 18.34  | POST   | `/api/v1/scheduling/substitutions`                          | `schedule.manage_substitutions`              | **DENIED**                       | 8.4             |
| 18.35  | GET    | `/api/v1/scheduling/substitutions`                          | `schedule.manage_substitutions`              | **DENIED**                       | 8.4             |
| 18.36  | GET    | `/api/v1/scheduling/teachers`                               | `schedule.manage_substitutions`              | **DENIED**                       | 8.4             |
| 18.37  | GET    | `/api/v1/scheduling/cover-reports`                          | `schedule.view_reports`                      | **DENIED**                       | 8.4             |
| 18.38  | GET    | `/api/v1/scheduling/cover-reports/fairness`                 | `schedule.view_reports`                      | **DENIED**                       | 8.4             |
| 18.39  | GET    | `/api/v1/scheduling/cover-reports/by-department`            | `schedule.view_reports`                      | **DENIED**                       | 8.4             |
| 18.40  | POST   | `/api/v1/scheduling/runs/prerequisites`                     | `schedule.run_auto`                          | **DENIED**                       | 8.1             |
| 18.41  | POST   | `/api/v1/scheduling/runs/trigger`                           | `schedule.run_auto`                          | **DENIED**                       | 8.1             |
| 18.42  | GET    | `/api/v1/scheduling/runs`                                   | `schedule.view_auto_reports`                 | **DENIED**                       | 8.1             |
| 18.43  | GET    | `/api/v1/scheduling/runs/{id}`                              | `schedule.view_auto_reports`                 | **DENIED**                       | 8.1             |
| 18.44  | POST   | `/api/v1/scheduling/runs/{id}/apply`                        | `schedule.apply_auto`                        | **DENIED**                       | 8.1             |
| 18.45  | POST   | `/api/v1/scheduling/runs/{id}/discard`                      | `schedule.run_auto`                          | **DENIED**                       | 8.1             |
| 18.46  | POST   | `/api/v1/scheduling/runs/{id}/cancel`                       | `schedule.run_auto`                          | **DENIED**                       | 8.1             |
| 18.47  | POST   | `/api/v1/scheduling-runs`                                   | `schedule.run_auto`                          | **DENIED**                       | 8.1             |
| 18.48  | GET    | `/api/v1/scheduling-runs`                                   | `schedule.view_auto_reports`                 | **DENIED**                       | 8.1             |
| 18.49  | GET    | `/api/v1/scheduling-runs/{id}`                              | `schedule.view_auto_reports`                 | **DENIED**                       | 8.1             |
| 18.50  | GET    | `/api/v1/scheduling-runs/{id}/progress`                     | `schedule.run_auto`                          | **DENIED**                       | 8.1             |
| 18.51  | GET    | `/api/v1/scheduling-runs/{id}/diagnostics`                  | `schedule.view_auto_reports`                 | **DENIED**                       | 8.1             |
| 18.52  | POST   | `/api/v1/scheduling-runs/{id}/cancel`                       | `schedule.run_auto`                          | **DENIED**                       | 8.1             |
| 18.53  | PATCH  | `/api/v1/scheduling-runs/{id}/adjustments`                  | `schedule.apply_auto`                        | **DENIED**                       | 8.1             |
| 18.54  | POST   | `/api/v1/scheduling-runs/{id}/apply`                        | `schedule.apply_auto`                        | **DENIED**                       | 8.1             |
| 18.55  | POST   | `/api/v1/scheduling-runs/{id}/discard`                      | `schedule.apply_auto`                        | **DENIED**                       | 8.1             |
| 18.56  | GET    | `/api/v1/scheduling/teacher-competencies`                   | `schedule.configure_requirements`            | **DENIED**                       | 8.2             |
| 18.57  | POST   | `/api/v1/scheduling/teacher-competencies`                   | `schedule.configure_requirements`            | **DENIED**                       | 8.2             |
| 18.58  | PATCH  | `/api/v1/scheduling/teacher-competencies/{id}`              | `schedule.configure_requirements`            | **DENIED**                       | 8.2             |
| 18.59  | DELETE | `/api/v1/scheduling/teacher-competencies/{id}`              | `schedule.configure_requirements`            | **DENIED**                       | 8.2             |
| 18.60  | GET    | `/api/v1/scheduling/substitute-competencies`                | `schedule.manage_substitutions`              | **DENIED**                       | 8.2             |
| 18.61  | GET    | `/api/v1/scheduling/break-groups`                           | `schedule.configure_requirements`            | **DENIED**                       | 8.2             |
| 18.62  | POST   | `/api/v1/scheduling/break-groups`                           | `schedule.configure_requirements`            | **DENIED**                       | 8.2             |
| 18.63  | GET    | `/api/v1/scheduling/curriculum-requirements`                | `schedule.configure_requirements`            | **DENIED**                       | 8.2             |
| 18.64  | POST   | `/api/v1/scheduling/curriculum-requirements`                | `schedule.configure_requirements`            | **DENIED**                       | 8.2             |
| 18.65  | POST   | `/api/v1/scheduling/curriculum-requirements/bulk-upsert`    | `schedule.configure_requirements`            | **DENIED**                       | 8.2             |
| 18.66  | GET    | `/api/v1/scheduling/room-closures`                          | `schedule.manage`                            | **DENIED**                       | 8.2             |
| 18.67  | POST   | `/api/v1/scheduling/room-closures`                          | `schedule.manage`                            | **DENIED**                       | 8.2             |
| 18.68  | GET    | `/api/v1/scheduling/teacher-config`                         | `schedule.configure_availability`            | **DENIED**                       | 8.2             |
| 18.69  | PUT    | `/api/v1/scheduling/teacher-config`                         | `schedule.configure_availability`            | **DENIED**                       | 8.2             |
| 18.70  | POST   | `/api/v1/schedules`                                         | `schedule.manage`                            | **DENIED**                       | 8.3             |
| 18.71  | GET    | `/api/v1/schedules`                                         | `schedule.manage`                            | **DENIED**                       | 8.3             |
| 18.72  | PATCH  | `/api/v1/schedules/{id}`                                    | `schedule.manage`                            | **DENIED**                       | 8.3             |
| 18.73  | DELETE | `/api/v1/schedules/{id}`                                    | `schedule.manage`                            | **DENIED**                       | 8.3             |
| 18.74  | POST   | `/api/v1/schedules/{id}/pin`                                | `schedule.pin_entries`                       | **DENIED**                       | 8.3             |
| 18.75  | POST   | `/api/v1/schedules/{id}/unpin`                              | `schedule.pin_entries`                       | **DENIED**                       | 8.3             |
| 18.76  | POST   | `/api/v1/schedules/bulk-pin`                                | `schedule.pin_entries`                       | **DENIED**                       | 8.3             |
| 18.77  | POST   | `/api/v1/scheduling/swaps/validate`                         | `schedule.manage`                            | **DENIED**                       | 8.3             |
| 18.78  | POST   | `/api/v1/scheduling/swaps/execute`                          | `schedule.manage`                            | **DENIED**                       | 8.3             |
| 18.79  | POST   | `/api/v1/scheduling/emergency-change`                       | `schedule.manage`                            | **DENIED**                       | 8.3             |
| 18.80  | PUT    | `/api/v1/scheduling/rotation`                               | `schedule.manage`                            | **DENIED**                       | 8.3             |
| 18.81  | GET    | `/api/v1/scheduling/rotation`                               | `schedule.view_reports`                      | **DENIED**                       | 8.3             |
| 18.82  | DELETE | `/api/v1/scheduling/rotation`                               | `schedule.manage`                            | **DENIED**                       | 8.3             |
| 18.83  | POST   | `/api/v1/scheduling/exam-sessions`                          | `schedule.manage_exams`                      | **DENIED**                       | 8.5             |
| 18.84  | GET    | `/api/v1/scheduling/exam-sessions`                          | `schedule.manage_exams`                      | **DENIED**                       | 8.5             |
| 18.85  | DELETE | `/api/v1/scheduling/exam-sessions/{id}`                     | `schedule.manage_exams`                      | **DENIED**                       | 8.5             |
| 18.86  | POST   | `/api/v1/scheduling/exam-sessions/{id}/generate`            | `schedule.manage_exams`                      | **DENIED**                       | 8.5             |
| 18.87  | POST   | `/api/v1/scheduling/exam-sessions/{id}/assign-invigilators` | `schedule.manage_exams`                      | **DENIED**                       | 8.5             |
| 18.88  | POST   | `/api/v1/scheduling/exam-sessions/{id}/publish`             | `schedule.manage_exams`                      | **DENIED**                       | 8.5             |
| 18.89  | POST   | `/api/v1/scheduling/scenarios`                              | `schedule.manage_scenarios`                  | **DENIED**                       | 8.6             |
| 18.90  | GET    | `/api/v1/scheduling/scenarios`                              | `schedule.manage_scenarios`                  | **DENIED**                       | 8.6             |
| 18.91  | POST   | `/api/v1/scheduling/scenarios/{id}/solve`                   | `schedule.manage_scenarios`                  | **DENIED**                       | 8.6             |
| 18.92  | POST   | `/api/v1/scheduling/scenarios/compare`                      | `schedule.manage_scenarios`                  | **DENIED**                       | 8.6             |
| 18.93  | GET    | `/api/v1/scheduling/analytics/efficiency`                   | `schedule.view_reports`                      | **DENIED**                       | 8.7             |
| 18.94  | GET    | `/api/v1/scheduling/analytics/workload`                     | `schedule.view_reports`                      | **DENIED**                       | 8.7             |
| 18.95  | GET    | `/api/v1/scheduling/analytics/rooms`                        | `schedule.view_reports`                      | **DENIED**                       | 8.7             |
| 18.96  | GET    | `/api/v1/scheduling/analytics/historical`                   | `schedule.view_reports`                      | **DENIED**                       | 8.7             |
| 18.97  | GET    | `/api/v1/scheduling-dashboard/overview`                     | `schedule.view_auto_reports`                 | **DENIED**                       | 8.7             |
| 18.98  | GET    | `/api/v1/scheduling-dashboard/workload`                     | `schedule.view_auto_reports`                 | **DENIED**                       | 8.7             |
| 18.99  | GET    | `/api/v1/scheduling-dashboard/unassigned`                   | `schedule.view_auto_reports`                 | **DENIED**                       | 8.7             |
| 18.100 | GET    | `/api/v1/scheduling-dashboard/room-utilisation`             | `schedule.view_auto_reports`                 | **DENIED**                       | 8.7             |
| 18.101 | GET    | `/api/v1/scheduling-dashboard/trends`                       | `schedule.view_auto_reports`                 | **DENIED**                       | 8.7             |
| 18.102 | GET    | `/api/v1/scheduling-runs/prerequisites`                     | `schedule.run_auto`                          | **DENIED**                       | 8.1             |
| 18.103 | GET    | `/api/v1/scheduling-runs/feasibility`                       | `schedule.run_auto`                          | **DENIED**                       | 8.1             |
| 18.104 | GET    | `/api/v1/period-grid`                                       | admin                                        | **DENIED**                       | 7               |
| 18.105 | GET    | `/api/v1/staff-availability/staff/{id}/year/{yearId}`       | admin or self                                | **DENIED** for non-self IDs      | 5               |
| 18.106 | GET    | `/api/v1/leave/requests`                                    | admin/HR                                     | **DENIED**                       | 7 (page denial) |

---

## 19. Observations / Bugs Spotted

Use this section to record anything noticed during execution that does not fit a specific row above. Each entry should include: location (page or endpoint), what was observed, expected vs actual, severity (P0/P1/P2/P3), and a one-line repro hint.

| #         | Location                     | Observation                                                                                                                                                                                                                                                                                                                                    | Severity | Logged in BUG-LOG.md? |
| --------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------- |
| OBS-T-001 | `/scheduling/leave-requests` | Despite the URL implying self-service, this is in fact an admin/HR approval tool. Teacher access must be denied. Naming is confusing — consider renaming to `/scheduling/leave-approvals` to avoid teachers landing here by accident. (Frontend inventory line 605 explicitly flags this.)                                                     | P2       |                       |
| OBS-T-002 | `/scheduling/availability`   | This is the admin-side staff availability tool, not Sarah's own availability surface. Teacher's own availability lives on `/scheduling/my-preferences` (Time Slot tab). Document the distinction in user-facing help.                                                                                                                          | P3       |                       |
| OBS-T-003 | Time-input font size         | Inventory frontend §8 flags `availability/page.tsx` line 96 as having `text-xs` (12 px) on a time input, violating mobile 16 px minimum. Teacher does not reach this page (admin-only), so it is out of scope for teacher fail — but if a similar pattern is replicated on the absence form's `period_from`/`period_to` time inputs, escalate. | P2       |                       |
| OBS-T-004 | Substitution offer surface   | There is no dedicated `/scheduling/offers` page in the inventory. Offers are implicitly surfaced via inbox notification + `/scheduling/offers/my` API. Consider adding a discoverable "My substitution offers" page so a teacher who dismissed an inbox notification can still find pending offers.                                            | P2       |                       |
| OBS-T-005 | (open)                       |                                                                                                                                                                                                                                                                                                                                                |          |                       |
| OBS-T-006 | (open)                       |                                                                                                                                                                                                                                                                                                                                                |          |                       |
| OBS-T-007 | (open)                       |                                                                                                                                                                                                                                                                                                                                                |          |                       |
| OBS-T-008 | (open)                       |                                                                                                                                                                                                                                                                                                                                                |          |                       |

---

## 20. Sign-off

| #     | Check                                                  | Expected                                                                                                                                 | Pass/Fail |
| ----- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.1  | All sections 1-17 have been completed                  | Every row in every table has been checked and marked Pass or Fail.                                                                       |           |
| 20.2  | All Fail items logged in `BUG-LOG.md`                  | Any row marked Fail has a corresponding BUG-LOG entry with steps to reproduce and expected vs actual.                                    |           |
| 20.3  | All §6 hidden-nav rows verified visually               | A screenshot or DOM dump confirms admin nav items are absent (not just disabled).                                                        |           |
| 20.4  | All §7 direct-URL rows verified                        | Each admin URL was navigated cold and the response captured (redirect or 403 splash).                                                    |           |
| 20.5  | All §8 API permission rows verified via DevTools fetch | A network log (HAR or screenshot) captures the 403 response body and `{ error: { code, message } }` shape.                               |           |
| 20.6  | §11 cross-tenant rows verified                         | All six hostile-pair assertions returned 403/404. Document any deviation immediately.                                                    |           |
| 20.7  | RTL parity (§14) complete                              | All teacher-allowed pages render correctly in AR with no `ml-`/`mr-` violations and correct directional flow.                            |           |
| 20.8  | Dark mode parity (§15) complete                        | All teacher-allowed pages render correctly in dark mode using design tokens.                                                             |           |
| 20.9  | Mobile 375 px (§16) complete                           | All teacher-allowed pages usable at 375 px with no horizontal overflow and 44 px tap targets.                                            |           |
| 20.10 | Console / network health (§13) clean                   | Zero uncaught JS errors during the full teacher-flow walkthrough.                                                                        |           |
| 20.11 | Data invariants (§17) verified                         | All eight invariants confirmed via API response inspection or DB query.                                                                  |           |
| 20.12 | Substitution flow end-to-end                           | Sarah self-reported, was assigned cover, accepted an offer, and the result reflected in her timetable + main calendar within one minute. |           |

**Tester Name:** **************\_\_\_**************
**Date:** **************\_\_\_**************
**Environment:** Production (`https://nhqs.edupod.app`)
**Browser:** **************\_\_\_**************
**Viewport(s) Tested:** **************\_\_\_**************
**Locale(s) Tested:** EN + AR
**Theme(s) Tested:** Light + Dark

---

_End of E2E Test Specification: Scheduling — Teacher View_
