# E2E Test Specification: Scheduling — Full Module (Admin View)

> **Coverage:** This document covers the entire Scheduling module as rendered for admin roles (school_owner, school_principal, school_vice_principal, admin/scheduler). It spans **30+ pages** including the Scheduling Hub, the 6 category sub-areas (Structure, Staff, Inputs, Generate, Operations, Analytics), all four timetable views (whole-school, class, teacher, room/student), the Auto-Scheduler workflow, the Solver Run lifecycle (queued → running → completed/failed → applied/discarded), Substitution Board, Exam Scheduling, Scenarios, Analytics dashboards, Cover Reports, Leave Request approval, and admin-tier surfaces of the personal/self-service pages.
>
> **Pages documented here:**
>
> - `/scheduling` — Hub Dashboard (KPI cards, quick actions, 6 category tiles)
> - `/scheduling/auto` — Auto-scheduler entry (prerequisites, feasibility, trigger)
> - `/scheduling/runs` — Run history list
> - `/scheduling/runs/[id]/review` — Run review (timetable grid, diagnostics, apply/discard)
> - `/scheduling/runs/compare` — Compare runs side-by-side
> - `/scheduling/period-grid` — Period structure / day templates
> - `/scheduling/curriculum` — Curriculum requirements matrix
> - `/scheduling/break-groups` — Break group rosters
> - `/scheduling/room-closures` — Room unavailability windows
> - `/scheduling/competencies` — Teacher competency matrix (pin/pool)
> - `/scheduling/substitute-competencies` — Substitute teacher competency matrix
> - `/scheduling/competency-coverage` — Coverage gap report
> - `/scheduling/teacher-config` — Per-teacher scheduling config
> - `/scheduling/availability` — Staff availability grid
> - `/scheduling/preferences` — Staff scheduling preferences (admin view)
> - `/scheduling/requirements` — Class scheduling requirements
> - `/scheduling/requirements/subject-overrides` — Per-class subject overrides (Zod form)
> - `/scheduling/scenarios` — What-if scenarios
> - `/scheduling/substitutions` — Absence and substitute assignment
> - `/scheduling/substitution-board` — Public kiosk board (admin admin-tier setup view)
> - `/scheduling/exams` — Exam session scheduling and invigilation
> - `/scheduling/dashboard` — Analytics dashboard
> - `/scheduling/cover-reports` — Cover duty report
> - `/scheduling/leave-requests` — Admin tool to approve/reject leave requests
> - `/scheduling/my-timetable` — Self-service timetable (admin still has one)
> - `/scheduling/my-preferences` — Self-service preferences (admin still has one)
> - `/scheduling/my-satisfaction` — Self-service satisfaction view
> - `/timetables` — Cross-module timetable view (class/teacher/student/room)
> - `/schedules` — Manual schedule CRUD (with conflict detection)
> - `/(print)/timetables/rooms/[roomId]/print` — Print-only room timetable

**Base URL:** `https://nhqs.edupod.app`
**Primary login:** **Yusuf Rahman** (`owner@nhqs.test` / `Password123!`) — School Owner (full `schedule.*` permission set).
**Navigation path to start:** Click the **Operations** hub button in the morph bar, then click the **Scheduling** tile (or navigate directly to `/en/scheduling`).

**Admin roles covered:** school_owner, school_principal, school_vice_principal, admin (all assumed to hold `schedule.manage` plus the auto-scheduling, configuration, substitution, exam, scenario and analytics permissions).

**Permissions referenced (from backend inventory §6):**

- `schedule.manage` — broadest CRUD on schedules, pin/unpin, swaps, emergency changes
- `schedule.run_auto` — trigger/cancel/monitor solver runs, prerequisites, feasibility
- `schedule.apply_auto` — apply, discard, add adjustments to a completed run
- `schedule.view_auto_reports` — list runs, view run detail, dashboards, analytics
- `schedule.configure_requirements` — curriculum requirements, teacher competencies, substitute competencies, break groups
- `schedule.configure_availability` — teacher scheduling config (staff-side constraints)
- `schedule.pin_entries` — manual pin/unpin of schedule entries
- `schedule.manage_substitutions` — report absence (admin), assign sub, view board, manage substitute competencies
- `schedule.report_own_absence` — teacher self-report (admin still has it for their own teaching periods if applicable)
- `schedule.respond_to_offer` — accept/decline substitution offers
- `schedule.view_reports` — cover reports, fairness, by-department, timetables, workload report
- `schedule.view_own` — own timetable, calendar tokens
- `schedule.view_own_satisfaction` — own preference satisfaction
- `schedule.manage_exams` — exam sessions, slots, invigilators, publish
- `schedule.manage_scenarios` — what-if scenarios, solve, compare

---

## Spec Pack Context

This document is the **admin UI leg (leg 1)** of the `/e2e-full` release-readiness pack for the Scheduling module. The full pack includes four sibling legs that together target 99.99% release-readiness:

| Leg | Spec document                                   | Executor                       |
| --- | ----------------------------------------------- | ------------------------------ |
| 1   | `admin_view/scheduling-e2e-spec.md` (this file) | QC engineer + Playwright       |
| 1   | `teacher_view/scheduling-e2e-spec.md`           | QC engineer + Playwright       |
| 1   | `parent_view/scheduling-e2e-spec.md`            | QC engineer + Playwright       |
| 1   | `student_view/scheduling-e2e-spec.md`           | QC engineer + Playwright       |
| 2   | `integration/scheduling-integration-spec.md`    | Jest / Supertest harness       |
| 3   | `worker/scheduling-worker-spec.md`              | Jest + BullMQ + CP-SAT sidecar |
| 4   | `perf/scheduling-perf-spec.md`                  | k6 / Artillery / Lighthouse    |
| 5   | `security/scheduling-security-spec.md`          | Security engineer / pen-tester |

The composite index is `RELEASE-READINESS.md` at the module folder root. Running ONLY this spec is a thorough admin-shell smoke; running it alongside the four siblings is the full tenant-onboarding readiness check for Scheduling.

---

## Prerequisites — Multi-Tenant Test Environment (MANDATORY)

A single-tenant run is insufficient; this spec exercises the UI-visible side of tenant isolation, so the environment must satisfy the following before you begin.

### Tenants — Hostile Pair

| Slug       | Currency | Hostname                      | Notes                                                              |
| ---------- | -------- | ----------------------------- | ------------------------------------------------------------------ |
| `nhqs`     | GBP      | `https://nhqs.edupod.app`     | Primary tenant — fully seeded scheduling data                      |
| `stress-a` | GBP      | `https://stress-a.edupod.app` | Hostile sibling — distinct data shapes for cross-tenant assertions |

Data differences are deliberate: a cross-tenant leak would be visibly wrong (e.g. a `stress-a` teacher appearing in the `nhqs` competency matrix dropdown, or a `stress-a` scheduling run appearing in the `nhqs` runs list).

### Users required (admin tier, both tenants)

| Tenant     | Role         | Name (suggested) | Login email             | Password          | Permissions                                                                     |
| ---------- | ------------ | ---------------- | ----------------------- | ----------------- | ------------------------------------------------------------------------------- |
| `nhqs`     | school_owner | Yusuf Rahman     | `owner@nhqs.test`       | `Password123!`    | Full `schedule.*`                                                               |
| `nhqs`     | principal    | Aisha Khan       | `principal@nhqs.test`   | `Password123!`    | Full `schedule.*`                                                               |
| `nhqs`     | teacher      | Sarah Daly       | `sarah.daly@nhqs.test`  | `Password123!`    | `schedule.view_own`, `schedule.report_own_absence`, `schedule.respond_to_offer` |
| `stress-a` | school_owner | Stress-A Owner   | `owner@stress-a.test`   | `StressTest2026!` | Full `schedule.*`                                                               |
| `stress-a` | teacher      | Stress-A Teacher | `teacher@stress-a.test` | `StressTest2026!` | `schedule.view_own`, `schedule.report_own_absence`                              |

### Seed data per tenant (minimum)

| Entity                               | Tenant `nhqs`                                    | Tenant `stress-a` |
| ------------------------------------ | ------------------------------------------------ | ----------------- |
| Academic years                       | ≥ 2 (one current, one prior)                     | ≥ 1               |
| Year groups                          | ≥ 6 (Y1–Y6 or KS1–KS5)                           | ≥ 3               |
| Classes                              | ≥ 12 (≥ 2 per year group)                        | ≥ 6               |
| Subjects                             | ≥ 10 (English, Maths, Science, Arabic, Quran, …) | ≥ 5               |
| Rooms                                | ≥ 15                                             | ≥ 5               |
| Staff (teaching)                     | ≥ 20                                             | ≥ 8               |
| Period grid (per year group)         | ≥ 5 days × ≥ 6 periods                           | ≥ 5 × 5           |
| Curriculum requirements              | ≥ 30 rows (year_group × subject)                 | ≥ 10              |
| Teacher competencies (pinned)        | ≥ 8                                              | ≥ 2               |
| Teacher competencies (pool)          | ≥ 25                                             | ≥ 8               |
| Substitute competencies              | ≥ 10                                             | ≥ 3               |
| Break groups                         | ≥ 2                                              | ≥ 1               |
| Room closures (active future window) | ≥ 2                                              | ≥ 1               |
| Teacher scheduling configs           | ≥ 10                                             | ≥ 3               |
| Staff availability records           | ≥ 30                                             | ≥ 8               |
| Staff scheduling preferences         | ≥ 15 (mix of subject/class/time)                 | ≥ 4               |
| Class scheduling requirements        | ≥ 5                                              | ≥ 2               |
| Class subject requirement overrides  | ≥ 3                                              | ≥ 1               |
| Scheduling runs (status=completed)   | ≥ 3                                              | ≥ 1               |
| Scheduling runs (status=applied)     | ≥ 1 (current published timetable)                | 0                 |
| Scheduling runs (status=failed)      | ≥ 1                                              | 0                 |
| Schedules (live, post-apply)         | ≥ 200                                            | 0                 |
| Pinned schedule entries              | ≥ 5                                              | 0                 |
| Teacher absences (open)              | ≥ 3                                              | 0                 |
| Teacher absences (cancelled)         | ≥ 1                                              | 0                 |
| Substitution records (assigned)      | ≥ 2                                              | 0                 |
| Substitution offers (pending)        | ≥ 2                                              | 0                 |
| Exam sessions (planning)             | ≥ 1                                              | 0                 |
| Exam sessions (published)            | ≥ 1                                              | 0                 |
| Scenarios                            | ≥ 2                                              | 0                 |
| Leave requests (pending)             | ≥ 2                                              | ≥ 1               |
| Leave requests (approved/rejected)   | ≥ 2                                              | 0                 |
| Calendar subscription tokens         | ≥ 1 per teacher                                  | 0                 |

### Hostile-pair assertions (enforce during execution)

The tester MUST execute these cross-tenant assertions at least once during the run (captured in §11 below). Each assertion verifies that admin in tenant A cannot see / read / write tenant B data:

1. Logged in as `nhqs` owner, navigate to `/en/scheduling/runs/{stress-a_run_id}/review` → **expected 404 or redirect to /scheduling/runs**, NEVER 200 with stress-a data.
2. Logged in as `nhqs` owner, `GET /api/v1/scheduling-runs/{stress-a_run_id}` via DevTools fetch → **expected 404**.
3. Logged in as `nhqs` owner, `GET /api/v1/scheduling/exam-sessions/{stress-a_session_id}` → **expected 404**.
4. Logged in as `nhqs` owner, `GET /api/v1/scheduling/scenarios/{stress-a_scenario_id}` → **expected 404**.
5. Logged in as `nhqs` owner, `GET /api/v1/scheduling/break-groups?academic_year_id={stress-a_year_id}` → **expected empty array** (RLS scopes by tenant; stress-a year ID is not in nhqs partition).
6. Logged in as `nhqs` owner, `GET /api/v1/staff-profiles?pageSize=200` → response contains only `nhqs` staff (verify by spot-checking absence of `Stress-A Teacher`).
7. Logged in as `nhqs` owner, `POST /api/v1/scheduling/teacher-competencies` with body referencing `staff_profile_id` belonging to `stress-a` → **expected 400/404** ("staff profile not found" or similar).
8. Logged in as `nhqs` owner, the public iCal endpoint `GET /v1/calendar/{stress-a_tenant_id}/{stress-a_token}.ics` (no auth) → token is tenant-scoped; should still succeed (token is the auth) but the assertion is that no `nhqs` token grants access to `stress-a` data and vice versa.

Full RLS matrix (every tenant-scoped endpoint × every role × every sibling tenant) is exercised in **/e2e-integration** (`integration/scheduling-integration-spec.md`); this spec exercises the UI-visible tenant-isolation path only.

### Environment flags

- `SOLVER_PY_URL` reachable from the worker (default `http://localhost:5557` locally; production sidecar address)
- BullMQ `scheduling` queue worker is online and idle (no leftover queued jobs from prior tests)
- `TenantSchedulingSettings.max_solver_duration` set to ≤ 120 s for nhqs (faster CI runs)
- RLS `FORCE ROW LEVEL SECURITY` enabled on all 22 scheduling-domain tables (see backend inventory §4)

---

### Setup runbook (one-time, before first execution)

1. **Local services up.** Ensure Postgres (5432), Redis (6379), API (3001), Web (5551), Worker (5556), Solver sidecar (5557) are all running. `pnpm dev` typically starts the first 5; the solver runs as a separate Python service.
2. **Tenants exist.** `nhqs` and `stress-a` rows in `tenants`; both have `tenant_domain` records mapping local hosts (e.g. `nhqs.localhost:5551`, `stress-a.localhost:5551`) or production hosts.
3. **Seed minimal data per tenant.** Use the seed script or manual UI:
   - Academic year (current, with start/end dates)
   - 1–2 academic periods (terms)
   - 5+ year groups (Y1–Y5 or equivalent)
   - 10+ classes spread across year groups
   - 30+ staff profiles with at least 20 marked as teachers
   - 12+ rooms (mix of classroom, lab, gym)
   - 8+ subjects
   - Period grid configured for each year group (5+ periods per weekday)
   - Curriculum requirements covering ≥80% of (year_group, subject) cells
   - Teacher competencies ensuring every (year_group, subject) has ≥1 qualified teacher
4. **Verify scheduling prerequisites pass.** Open `/scheduling/auto` in the test tenant; the prerequisite checklist should be all green.
5. **Trigger one baseline run.** This populates `scheduling_runs` with at least one completed row for use across compare/scenarios/analytics tests.
6. **Apply baseline run.** Sets the live timetable so cross-module timetable views have data.
7. **Note one stress-a run ID** for hostile-pair assertions (SCH-A-950+).

### Sample test execution timing

| Phase                                           | Estimated duration               |
| ----------------------------------------------- | -------------------------------- |
| Hub navigation + load (§3)                      | 15 min                           |
| Structure hub (§4)                              | 45 min                           |
| Staff hub (§5)                                  | 60 min                           |
| Inputs hub (§6)                                 | 30 min                           |
| Generate hub (§7) — including a real solver run | 75 min                           |
| Operations hub (§8)                             | 60 min                           |
| Analytics hub (§9)                              | 45 min                           |
| Solver lifecycle deep-dive (§10)                | 60 min (solver runtime included) |
| Cross-cutting (§11)                             | 90 min                           |
| **Total per tenant**                            | **~7 hours**                     |
| Multi-tenant repeat (stress-a sample, ~25%)     | +90 min                          |

Per CLAUDE.md verification budget rule, the tester may spot-check rather than execute every row exhaustively — but every section MUST have at least one row executed and documented.

### Reset between sessions

If a session is interrupted and re-run:

- DO NOT truncate scheduling tables — historical rows are part of the audit trail
- DO discard test runs created in the previous session by clicking **Discard** in the runs list
- DO clean up test absences/offers via cancel actions (not DB delete)
- DO preserve the baseline applied run

## Out of Scope for This Spec

This spec exercises the UI-visible surface of the Scheduling module as a human (or Playwright agent) clicking through the admin shells. It does **NOT** cover:

- **RLS leakage matrix (every endpoint × every role × every sibling tenant)** → `integration/scheduling-integration-spec.md`
- **CP-SAT solver internals, solver-input assembly correctness, deterministic seed reproducibility** → `worker/scheduling-worker-spec.md`
- **BullMQ jobs, cron schedulers, async side-effect chains** — `scheduling:solve-v2`, `scheduling:reap-stale-runs`, substitution cascade tier escalation, notification dispatch, calendar token revocation cleanup → `worker/scheduling-worker-spec.md`
- **API contract tests bypassing the UI** (every endpoint × every Zod validation edge case, every state-machine transition including invalid ones) → `integration/scheduling-integration-spec.md`
- **DB-level invariants after each flow** (machine-executable SQL) → spot-checks here as §10 AND in `integration/scheduling-integration-spec.md`
- **Concurrency / race conditions** (parallel apply on same run, parallel cancel/apply, parallel teacher-competency bulk upsert, simultaneous absence reports for same teacher/date) → `integration/scheduling-integration-spec.md`
- **Load / throughput / latency budgets** (p50/p95/p99 per endpoint, solver time on 10k schedule entries, period-grid render time on 50-period day) → `perf/scheduling-perf-spec.md`
- **Security hardening** (OWASP Top 10, XSS/SQLi injection fuzz on schedule entry fields, CSRF, JWT refresh, rate-limit abuse on iCal token endpoint, token forgery for `/v1/calendar/:tenantId/:token.ics`) → `security/scheduling-security-spec.md`
- **iCalendar (.ics) byte-level structural correctness** (VEVENT count, VTIMEZONE, RRULE for rotating cycles, UID stability across regenerations) → `integration/scheduling-integration-spec.md`
- **Solver result_json schema correctness** (every key, every nested array, every diagnostic code) → `worker/scheduling-worker-spec.md`
- **Notification template rendering** (`absence.reported`, `substitution.offered`, `substitution.accepted`, `substitution.declined`, `run.completed`, `run.failed`) → `integration/scheduling-integration-spec.md`
- **Browser / device matrix beyond desktop Chrome and 375 px mobile emulation** — deferred to manual QA cycle on Safari, Firefox, Edge, iOS Safari, Android Chrome
- **Long-lived regressions from modules outside Scheduling** that import SchedulesReadFacade, PersonalTimetableService, SchedulingReadFacade — tracked at `docs/architecture/module-blast-radius.md`, not here

A tester who runs ONLY this spec is doing a thorough admin-shell smoke + regression pass. They are NOT doing a full tenant-readiness check. For the latter, run the full `/e2e-full` pack — see `RELEASE-READINESS.md`.

---

## Table of Contents

1. [Backend Endpoint Map](#1-backend-endpoint-map)
2. [Permission Matrix (Admin)](#2-permission-matrix-admin)
3. [Hub Navigation and Landing](#3-hub-navigation-and-landing)
4. [Structure Hub: Period Grid, Curriculum, Break Groups, Room Closures](#4-structure-hub)
5. [Staff Hub: Competencies, Coverage, Teacher Config, Substitute Competencies, Requirements](#5-staff-hub)
6. [Inputs Hub: Availability, Preferences](#6-inputs-hub)
7. [Generate Hub: Auto-Scheduler, Runs, Run Review, Scenarios](#7-generate-hub)
8. [Operations Hub: Substitutions, Substitution Board, Exams, My Timetable, Leave Requests](#8-operations-hub)
9. [Analytics Hub: Dashboard, Cover Reports](#9-analytics-hub)
10. [Solver Run Lifecycle (queued → running → completed/failed → applied/discarded)](#10-solver-run-lifecycle)
11. [Cross-cutting: Console, Network, RTL, Dark Mode, Mobile, Data Invariants, Multi-tenant RLS](#11-cross-cutting)
12. [Observations and Bugs Spotted](#12-observations-and-bugs-spotted)
13. [Sign-off](#13-sign-off)

---

## 1. Backend Endpoint Map

Every endpoint exercised by the admin UI in this spec, grouped by controller. Extracted from `.inventory-backend.md`. Used to verify network calls in DevTools and to build assertions for §11.

### TeacherCompetenciesController (`/v1/scheduling/teacher-competencies`)

| Method | Path                                                             | Permission                        |
| ------ | ---------------------------------------------------------------- | --------------------------------- |
| GET    | `/v1/scheduling/teacher-competencies`                            | `schedule.configure_requirements` |
| GET    | `/v1/scheduling/teacher-competencies/coverage`                   | `schedule.configure_requirements` |
| GET    | `/v1/scheduling/teacher-competencies/by-teacher/:staffProfileId` | `schedule.configure_requirements` |
| GET    | `/v1/scheduling/teacher-competencies/by-subject`                 | `schedule.configure_requirements` |
| POST   | `/v1/scheduling/teacher-competencies`                            | `schedule.configure_requirements` |
| POST   | `/v1/scheduling/teacher-competencies/bulk`                       | `schedule.configure_requirements` |
| PATCH  | `/v1/scheduling/teacher-competencies/:id`                        | `schedule.configure_requirements` |
| DELETE | `/v1/scheduling/teacher-competencies/:id`                        | `schedule.configure_requirements` |
| DELETE | `/v1/scheduling/teacher-competencies/by-teacher/:staffProfileId` | `schedule.configure_requirements` |
| POST   | `/v1/scheduling/teacher-competencies/copy`                       | `schedule.configure_requirements` |
| POST   | `/v1/scheduling/teacher-competencies/copy-to-years`              | `schedule.configure_requirements` |

### SubstituteCompetenciesController (`/v1/scheduling/substitute-competencies`)

| Method | Path                                                                | Permission                      |
| ------ | ------------------------------------------------------------------- | ------------------------------- |
| GET    | `/v1/scheduling/substitute-competencies`                            | `schedule.manage_substitutions` |
| GET    | `/v1/scheduling/substitute-competencies/suggest`                    | `schedule.manage_substitutions` |
| GET    | `/v1/scheduling/substitute-competencies/by-teacher/:staffProfileId` | `schedule.manage_substitutions` |
| GET    | `/v1/scheduling/substitute-competencies/by-subject`                 | `schedule.manage_substitutions` |
| POST   | `/v1/scheduling/substitute-competencies`                            | `schedule.manage_substitutions` |
| POST   | `/v1/scheduling/substitute-competencies/bulk`                       | `schedule.manage_substitutions` |
| PATCH  | `/v1/scheduling/substitute-competencies/:id`                        | `schedule.manage_substitutions` |
| DELETE | `/v1/scheduling/substitute-competencies/:id`                        | `schedule.manage_substitutions` |
| DELETE | `/v1/scheduling/substitute-competencies/by-teacher/:staffProfileId` | `schedule.manage_substitutions` |
| POST   | `/v1/scheduling/substitute-competencies/copy`                       | `schedule.manage_substitutions` |
| POST   | `/v1/scheduling/substitute-competencies/copy-to-years`              | `schedule.manage_substitutions` |

### BreakGroupsController, CurriculumRequirementsController, RoomClosuresController, TeacherSchedulingConfigController

| Method                | Path                                                     | Permission                        |
| --------------------- | -------------------------------------------------------- | --------------------------------- |
| GET/POST/PATCH/DELETE | `/v1/scheduling/break-groups[/:id]`                      | `schedule.configure_requirements` |
| GET                   | `/v1/scheduling/curriculum-requirements`                 | `schedule.configure_requirements` |
| GET                   | `/v1/scheduling/curriculum-requirements/matrix-subjects` | `schedule.configure_requirements` |
| GET                   | `/v1/scheduling/curriculum-requirements/:id`             | `schedule.configure_requirements` |
| POST                  | `/v1/scheduling/curriculum-requirements`                 | `schedule.configure_requirements` |
| PATCH                 | `/v1/scheduling/curriculum-requirements/:id`             | `schedule.configure_requirements` |
| DELETE                | `/v1/scheduling/curriculum-requirements/:id`             | `schedule.configure_requirements` |
| POST                  | `/v1/scheduling/curriculum-requirements/bulk-upsert`     | `schedule.configure_requirements` |
| POST                  | `/v1/scheduling/curriculum-requirements/copy`            | `schedule.configure_requirements` |
| GET/POST/DELETE       | `/v1/scheduling/room-closures[/:id]`                     | `schedule.manage`                 |
| GET                   | `/v1/scheduling/teacher-config`                          | `schedule.configure_availability` |
| PUT                   | `/v1/scheduling/teacher-config`                          | `schedule.configure_availability` |
| DELETE                | `/v1/scheduling/teacher-config/:id`                      | `schedule.configure_availability` |
| POST                  | `/v1/scheduling/teacher-config/copy`                     | `schedule.configure_availability` |

### Scheduler Orchestration & Validation

| Method | Path                                | Permission                   |
| ------ | ----------------------------------- | ---------------------------- |
| POST   | `/v1/scheduling/runs/prerequisites` | `schedule.run_auto`          |
| POST   | `/v1/scheduling/runs/trigger`       | `schedule.run_auto`          |
| GET    | `/v1/scheduling/runs`               | `schedule.view_auto_reports` |
| GET    | `/v1/scheduling/runs/:id`           | `schedule.view_auto_reports` |
| POST   | `/v1/scheduling/runs/:id/apply`     | `schedule.apply_auto`        |
| POST   | `/v1/scheduling/runs/:id/discard`   | `schedule.run_auto`          |
| POST   | `/v1/scheduling/runs/:id/cancel`    | `schedule.run_auto`          |
| GET    | `/v1/scheduling/runs/:id/status`    | `schedule.run_auto`          |
| POST   | `/v1/scheduling/runs/:id/validate`  | `schedule.run_auto`          |

### SchedulingRunsController (preferred path used by frontend)

| Method | Path                                           | Permission                   |
| ------ | ---------------------------------------------- | ---------------------------- |
| GET    | `/v1/scheduling-runs/prerequisites`            | `schedule.run_auto`          |
| GET    | `/v1/scheduling-runs/feasibility`              | `schedule.run_auto`          |
| POST   | `/v1/scheduling-runs`                          | `schedule.run_auto`          |
| GET    | `/v1/scheduling-runs`                          | `schedule.view_auto_reports` |
| GET    | `/v1/scheduling-runs/:id`                      | `schedule.view_auto_reports` |
| GET    | `/v1/scheduling-runs/:id/progress`             | `schedule.run_auto`          |
| GET    | `/v1/scheduling-runs/:id/diagnostics`          | `schedule.view_auto_reports` |
| POST   | `/v1/scheduling-runs/:id/diagnostics/simulate` | `schedule.view_auto_reports` |
| POST   | `/v1/scheduling-runs/:id/diagnostics/refresh`  | `schedule.view_auto_reports` |
| POST   | `/v1/scheduling-runs/:id/cancel`               | `schedule.run_auto`          |
| PATCH  | `/v1/scheduling-runs/:id/adjustments`          | `schedule.apply_auto`        |
| POST   | `/v1/scheduling-runs/:id/apply`                | `schedule.apply_auto`        |
| POST   | `/v1/scheduling-runs/:id/discard`              | `schedule.apply_auto`        |

### Scheduling Enhanced Controller (substitutions, swaps, exams, scenarios, analytics)

| Method              | Path                                                   | Permission                                                 |
| ------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| POST                | `/v1/scheduling/absences`                              | `schedule.manage_substitutions`                            |
| POST                | `/v1/scheduling/absences/self-report`                  | `schedule.report_own_absence`                              |
| GET                 | `/v1/scheduling/absences`                              | `schedule.manage_substitutions`                            |
| DELETE              | `/v1/scheduling/absences/:id`                          | `schedule.manage_substitutions`                            |
| POST                | `/v1/scheduling/absences/:id/cancel`                   | `schedule.manage_substitutions`                            |
| POST                | `/v1/scheduling/absences/:id/cancel-own`               | `schedule.report_own_absence`                              |
| GET                 | `/v1/scheduling/absences/:absenceId/substitutes`       | `schedule.manage_substitutions`                            |
| GET                 | `/v1/scheduling/absences/:absenceId/substitutes/ai`    | `schedule.manage_substitutions`                            |
| POST                | `/v1/scheduling/substitutions`                         | `schedule.manage_substitutions`                            |
| GET                 | `/v1/scheduling/substitutions`                         | `schedule.manage_substitutions`                            |
| GET                 | `/v1/scheduling/substitution-board`                    | `schedule.manage_substitutions`                            |
| GET                 | `/v1/scheduling/offers/my`                             | `schedule.respond_to_offer`                                |
| POST                | `/v1/scheduling/offers/:id/accept`                     | `schedule.respond_to_offer`                                |
| POST                | `/v1/scheduling/offers/:id/decline`                    | `schedule.respond_to_offer`                                |
| GET                 | `/v1/scheduling/colleagues`                            | `schedule.report_own_absence`                              |
| GET                 | `/v1/scheduling/teachers`                              | `schedule.manage_substitutions`                            |
| GET                 | `/v1/scheduling/cover-reports`                         | `schedule.view_reports`                                    |
| GET                 | `/v1/scheduling/cover-reports/fairness`                | `schedule.view_reports`                                    |
| GET                 | `/v1/scheduling/cover-reports/by-department`           | `schedule.view_reports`                                    |
| POST                | `/v1/scheduling/swaps/validate`                        | `schedule.manage`                                          |
| POST                | `/v1/scheduling/swaps/execute`                         | `schedule.manage`                                          |
| POST                | `/v1/scheduling/emergency-change`                      | `schedule.manage`                                          |
| GET                 | `/v1/scheduling/timetable/teacher/:staffId`            | `schedule.view_reports`                                    |
| GET                 | `/v1/scheduling/timetable/my`                          | `schedule.view_own`                                        |
| GET                 | `/v1/scheduling/timetable/class/:classId`              | `schedule.view_reports`                                    |
| POST/GET/DELETE     | `/v1/scheduling/calendar-tokens[/:tokenId]`            | `schedule.view_own`                                        |
| PUT/GET/DELETE      | `/v1/scheduling/rotation`                              | `schedule.manage` (write) / `schedule.view_reports` (read) |
| GET                 | `/v1/scheduling/rotation/current-week`                 | `schedule.view_reports`                                    |
| POST                | `/v1/scheduling/exam-sessions`                         | `schedule.manage_exams`                                    |
| GET                 | `/v1/scheduling/exam-sessions`                         | `schedule.manage_exams`                                    |
| GET                 | `/v1/scheduling/exam-sessions/:id`                     | `schedule.manage_exams`                                    |
| PUT                 | `/v1/scheduling/exam-sessions/:id`                     | `schedule.manage_exams`                                    |
| DELETE              | `/v1/scheduling/exam-sessions/:id`                     | `schedule.manage_exams`                                    |
| GET                 | `/v1/scheduling/exam-sessions/:id/slots`               | `schedule.manage_exams`                                    |
| POST                | `/v1/scheduling/exam-sessions/:id/slots`               | `schedule.manage_exams`                                    |
| POST                | `/v1/scheduling/exam-sessions/:id/generate`            | `schedule.manage_exams`                                    |
| POST                | `/v1/scheduling/exam-sessions/:id/assign-invigilators` | `schedule.manage_exams`                                    |
| POST                | `/v1/scheduling/exam-sessions/:id/publish`             | `schedule.manage_exams`                                    |
| POST/GET/PUT/DELETE | `/v1/scheduling/scenarios[/:id]`                       | `schedule.manage_scenarios`                                |
| POST                | `/v1/scheduling/scenarios/:id/solve`                   | `schedule.manage_scenarios`                                |
| POST                | `/v1/scheduling/scenarios/compare`                     | `schedule.manage_scenarios`                                |
| GET                 | `/v1/scheduling/analytics/efficiency`                  | `schedule.view_reports`                                    |
| GET                 | `/v1/scheduling/analytics/workload`                    | `schedule.view_reports`                                    |
| GET                 | `/v1/scheduling/analytics/rooms`                       | `schedule.view_reports`                                    |
| GET                 | `/v1/scheduling/analytics/historical`                  | `schedule.view_reports`                                    |

### Schedules and Timetables

| Method                | Path                                     | Permission                                 |
| --------------------- | ---------------------------------------- | ------------------------------------------ |
| POST/GET/PATCH/DELETE | `/v1/schedules[/:id]`                    | `schedule.manage`                          |
| POST                  | `/v1/schedules/bulk-pin`                 | `schedule.pin_entries`                     |
| POST                  | `/v1/schedules/:id/pin`                  | `schedule.pin_entries`                     |
| POST                  | `/v1/schedules/:id/unpin`                | `schedule.pin_entries`                     |
| GET                   | `/v1/timetables/teacher/:staffProfileId` | `schedule.manage` or `schedule.view_own`   |
| GET                   | `/v1/timetables/class/:classId`          | `schedule.manage` or `schedule.view_class` |
| GET                   | `/v1/timetables/room/:roomId`            | `schedule.manage`                          |
| GET                   | `/v1/timetables/student/:studentId`      | `students.view` (admin) or parent linkage  |
| GET                   | `/v1/reports/workload`                   | `schedule.manage`                          |

### Scheduling Dashboard

| Method | Path                                        | Permission                                                       |
| ------ | ------------------------------------------- | ---------------------------------------------------------------- |
| GET    | `/v1/scheduling-dashboard/overview`         | `schedule.view_auto_reports`                                     |
| GET    | `/v1/scheduling-dashboard/workload`         | `schedule.view_auto_reports`                                     |
| GET    | `/v1/scheduling-dashboard/unassigned`       | `schedule.view_auto_reports`                                     |
| GET    | `/v1/scheduling-dashboard/room-utilisation` | `schedule.view_auto_reports`                                     |
| GET    | `/v1/scheduling-dashboard/trends`           | `schedule.view_auto_reports`                                     |
| GET    | `/v1/scheduling-dashboard/preferences`      | `schedule.view_own_satisfaction` or `schedule.view_auto_reports` |

### Public iCalendar (token-auth)

| Method | Path                                | Permission        |
| ------ | ----------------------------------- | ----------------- |
| GET    | `/v1/calendar/:tenantId/:token.ics` | NONE (token-auth) |

---

## 2. Permission Matrix (Admin)

The admin role under test (`school_owner`) holds the full `schedule.*` permission set. The matrix below maps each permission to the page(s) and primary user action(s) it gates. This drives the §-by-§ permission-denial assertions later.

| Permission                        | Pages gated                                                                                          | Primary actions                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `schedule.manage`                 | `/scheduling`, `/schedules`, `/timetables`, `/scheduling/substitutions` (swap controls)              | Manual schedule CRUD; swap; emergency change; rotation config write            |
| `schedule.run_auto`               | `/scheduling/auto`, `/scheduling/runs`, `/scheduling/runs/[id]/review`                               | Trigger run; cancel queued/running run; check prerequisites; check feasibility |
| `schedule.apply_auto`             | `/scheduling/runs/[id]/review`                                                                       | Apply run to live timetable; discard run; add adjustments                      |
| `schedule.view_auto_reports`      | `/scheduling/runs`, `/scheduling/runs/[id]/review`, `/scheduling/dashboard`                          | List runs; view run detail; dashboards; analytics                              |
| `schedule.configure_requirements` | `/scheduling/curriculum`, `/scheduling/competencies`, `/scheduling/break-groups`                     | CRUD curriculum reqs; CRUD teacher competencies; CRUD break groups             |
| `schedule.configure_availability` | `/scheduling/teacher-config`                                                                         | CRUD per-teacher scheduling config                                             |
| `schedule.pin_entries`            | `/scheduling/runs/[id]/review`, `/schedules`                                                         | Pin/unpin schedule entries (single + bulk)                                     |
| `schedule.manage_substitutions`   | `/scheduling/substitutions`, `/scheduling/substitute-competencies`, `/scheduling/substitution-board` | Report absence; assign sub; CRUD substitute competencies; view real-time board |
| `schedule.report_own_absence`     | `/scheduling/my-timetable` (self-report dialog if surfaced)                                          | Self-report own absence; cancel own absence; list colleagues                   |
| `schedule.respond_to_offer`       | (teacher pages — admin only sees if also teaching)                                                   | Accept/decline substitution offer                                              |
| `schedule.view_reports`           | `/scheduling/cover-reports`, `/timetables`, `/scheduling/dashboard` (some panels)                    | View cover, fairness, by-department, all timetables, workload report           |
| `schedule.view_own`               | `/scheduling/my-timetable`, `/scheduling/my-preferences` calendar token area                         | View own timetable; manage own iCal subscriptions                              |
| `schedule.view_own_satisfaction`  | `/scheduling/my-satisfaction`                                                                        | View own preference satisfaction                                               |
| `schedule.manage_exams`           | `/scheduling/exams`                                                                                  | CRUD exam session, slots; generate; assign invigilators; publish               |
| `schedule.manage_scenarios`       | `/scheduling/scenarios`                                                                              | CRUD scenarios; solve; compare                                                 |
| `schedule.view_class`             | `/timetables` (class tab)                                                                            | View class timetable (subset of `schedule.manage`)                             |

---

## 3. Hub Navigation and Landing

### 3.1 Navigation to the Scheduling Hub

| #         | Page                 | Action                                                | Expected                                                                                                                   | Actual | Pass/Fail |
| --------- | -------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-001 | Morph bar            | Look at the morph bar while logged in as Yusuf Rahman | Morph bar visible across full viewport with hub buttons in horizontal row                                                  |        |           |
| SCH-A-002 | Morph bar            | Identify the **Operations** hub button                | Button labelled "Operations" with appropriate icon visible in the hub row                                                  |        |           |
| SCH-A-003 | Morph bar            | Click the **Operations** hub button                   | Sub-strip appears beneath the morph bar containing the Scheduling tile/link among other operations modules                 |        |           |
| SCH-A-004 | Operations sub-strip | Click the **Scheduling** entry in the sub-strip       | Browser navigates to `/en/scheduling`. Scheduling hub dashboard loads. Operations remains visually active in the morph bar |        |           |
| SCH-A-005 | Direct URL           | Navigate directly to `/en/scheduling` via URL bar     | Hub dashboard loads without redirect. No flash of empty content                                                            |        |           |
| SCH-A-006 | Hub                  | Verify NO redirect for school_owner                   | Page loads at `/en/scheduling` and renders the dashboard (no redirect to `/inbox` or `/home`)                              |        |           |

### 3.2 Hub Page Load and Layout

| #         | Page          | Action                                  | Expected                                                                                                                                                      | Actual | Pass/Fail |
| --------- | ------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-010 | `/scheduling` | Wait for page first paint               | No blank white screen; no "Something went wrong" boundary                                                                                                     |        |           |
| SCH-A-011 | `/scheduling` | Inspect Network tab                     | Two calls fire on first load: `GET /api/v1/academic-years?pageSize=20` and `GET /api/v1/scheduling-dashboard/overview?academic_year_id={current}`             |        |           |
| SCH-A-012 | `/scheduling` | Inspect overview call response handling | If overview call 4xx/5xx, KPI cards fall back to em-dash (`—`); the page must not throw a toast for this silent fetch (per inventory: hub overview is silent) |        |           |
| SCH-A-013 | `/scheduling` | Verify back-link header                 | Header shows "Operations / Scheduling" breadcrumb (or equivalent) with arrow icon `rtl:rotate-180`                                                            |        |           |
| SCH-A-014 | `/scheduling` | Verify hub title                        | h1 reads the translated value of `scheduling.hub.title` (English: "Scheduling")                                                                               |        |           |
| SCH-A-015 | `/scheduling` | Verify hub description below title      | Translated `scheduling.hub.description` paragraph rendered                                                                                                    |        |           |

### 3.3 KPI Cards (4 cards)

| #         | Page          | Action                                                                    | Expected                                                                                                                | Actual | Pass/Fail |
| --------- | ------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-020 | `/scheduling` | Identify the 4 KPI cards                                                  | Cards appear in `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` layout: Total Slots, Completion %, Pinned Slots, Latest Run |        |           |
| SCH-A-021 | `/scheduling` | Verify Total Slots card                                                   | Card shows BookOpen icon, primary accent, label "Total Slots" (translated), numeric value from overview API             |        |           |
| SCH-A-022 | `/scheduling` | Verify Completion % card                                                  | Card shows CheckCircle2 icon, emerald accent, label "Completion %", percentage value                                    |        |           |
| SCH-A-023 | `/scheduling` | Verify Pinned Slots card                                                  | Card shows Pin icon, amber accent, label "Pinned Slots", numeric value                                                  |        |           |
| SCH-A-024 | `/scheduling` | Verify Latest Run card                                                    | Card shows Sparkles icon, violet accent, label "Latest Run", timestamp/run name                                         |        |           |
| SCH-A-025 | `/scheduling` | Force overview API to fail (DevTools network throttle/offline) and reload | All 4 KPI metrics fall back to em-dash; no error toast; page does not crash                                             |        |           |
| SCH-A-026 | `/scheduling` | Restore network and reload                                                | Cards re-populate from successful overview response                                                                     |        |           |

### 3.4 Quick Actions Strip (4 buttons)

| #         | Page          | Action                                                  | Expected                                                                                                                           | Actual | Pass/Fail |
| --------- | ------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-030 | `/scheduling` | Identify the Quick Actions strip above categories       | Strip shows 4 buttons: Auto Scheduler (Sparkles), My Timetable (Calendar), Substitutions (UserX), Substitution Board (MonitorPlay) |        |           |
| SCH-A-031 | `/scheduling` | Click **Auto Scheduler** quick action                   | Navigates to `/en/scheduling/auto`. Auto-scheduler page loads (see §7)                                                             |        |           |
| SCH-A-032 | `/scheduling` | Browser back. Click **My Timetable** quick action       | Navigates to `/en/scheduling/my-timetable`. Personal timetable loads (see §8)                                                      |        |           |
| SCH-A-033 | `/scheduling` | Browser back. Click **Substitutions** quick action      | Navigates to `/en/scheduling/substitutions`. Substitutions page loads (see §8)                                                     |        |           |
| SCH-A-034 | `/scheduling` | Browser back. Click **Substitution Board** quick action | Navigates to `/en/scheduling/substitution-board`. Public board loads (see §8)                                                      |        |           |

### 3.5 Six Category Tile Sections

The hub renders six categorized tile groups (NOT a sub-strip). Each must render its tiles in the documented order.

| #         | Page          | Action                                                                      | Expected                                                                                                           | Actual | Pass/Fail |
| --------- | ------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-A-040 | `/scheduling` | Verify **Structure** section header (emerald accent)                        | Section heading shows the translated label; 4 tiles in order: Period Grid, Curriculum, Break Groups, Room Closures |        |           |
| SCH-A-041 | `/scheduling` | Click **Period Grid** tile (Calendar icon)                                  | Navigates to `/en/scheduling/period-grid`                                                                          |        |           |
| SCH-A-042 | `/scheduling` | Browser back. Click **Curriculum** tile (BookOpen icon)                     | Navigates to `/en/scheduling/curriculum`                                                                           |        |           |
| SCH-A-043 | `/scheduling` | Browser back. Click **Break Groups** tile (Clock icon)                      | Navigates to `/en/scheduling/break-groups`                                                                         |        |           |
| SCH-A-044 | `/scheduling` | Browser back. Click **Room Closures** tile (DoorClosed icon)                | Navigates to `/en/scheduling/room-closures`                                                                        |        |           |
| SCH-A-045 | `/scheduling` | Verify **Staff** section header (sky accent)                                | 4 tiles in order: Competencies, Coverage, Teacher Config, Requirements                                             |        |           |
| SCH-A-046 | `/scheduling` | Click each Staff tile in turn and verify routes                             | `/competencies`, `/competency-coverage`, `/teacher-config`, `/requirements`                                        |        |           |
| SCH-A-047 | `/scheduling` | Verify **Inputs** section header (teal accent)                              | 2 tiles in order: Availability, Preferences                                                                        |        |           |
| SCH-A-048 | `/scheduling` | Click each Inputs tile                                                      | `/availability`, `/preferences`                                                                                    |        |           |
| SCH-A-049 | `/scheduling` | Verify **Generate** section header (violet accent)                          | 3 tiles in order: Auto Scheduler, Runs, Scenarios                                                                  |        |           |
| SCH-A-050 | `/scheduling` | Click each Generate tile                                                    | `/auto`, `/runs`, `/scenarios`                                                                                     |        |           |
| SCH-A-051 | `/scheduling` | Verify **Operations** section header (indigo accent)                        | 5 tiles in order: Substitutions, Substitute Competencies, Substitution Board, My Timetable, Exams                  |        |           |
| SCH-A-052 | `/scheduling` | Click each Operations tile                                                  | `/substitutions`, `/substitute-competencies`, `/substitution-board`, `/my-timetable`, `/exams`                     |        |           |
| SCH-A-053 | `/scheduling` | Verify **Analytics** section header (rose accent)                           | 2 tiles in order: Analytics Dashboard, Cover Reports                                                               |        |           |
| SCH-A-054 | `/scheduling` | Click each Analytics tile                                                   | `/dashboard`, `/cover-reports`                                                                                     |        |           |
| SCH-A-055 | `/scheduling` | Verify Latest Run KPI links to active run review (if any applied/completed) | Click the card → navigates to `/en/scheduling/runs/{id}/review`                                                    |        |           |

OBSERVATION: The hub is a flat tile dashboard rather than a true sub-strip; the redesign spec (frontend rule §3a) explicitly permits dashboard-of-tiles as a first-class alternative, so no violation. However, because there is no contextual sub-strip, deep-linked pages (e.g. `/scheduling/competencies`) lose hub-context cues — verify the layout.tsx back-link is always present and points to `/en/scheduling`.

### 3.5a Quick-action deep-link verification

| #          | Quick action button            | Action                                   | Expected                                                                                                                                 | Actual | Pass/Fail |
| ---------- | ------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-074a | "Run auto-scheduler"           | Click                                    | Navigates to `/en/scheduling/auto`; URL contains `auto`; page header matches translated key `auto.autoScheduler`                         |        |           |
| SCH-A-074b | "Substitution board"           | Click                                    | Navigates to `/en/scheduling/substitution-board`; opens kiosk-style page                                                                 |        |           |
| SCH-A-074c | "View analytics"               | Click                                    | Navigates to `/en/scheduling/dashboard`; KPI tiles render                                                                                |        |           |
| SCH-A-074d | "Manage exams"                 | Click                                    | Navigates to `/en/scheduling/exams`; exam sessions list visible                                                                          |        |           |
| SCH-A-074e | All quick actions in AR locale | Visit `/ar/scheduling`                   | Same buttons render with translated labels; click each to verify the destination URL switches to `/ar/scheduling/...` (locale preserved) |        |           |
| SCH-A-074f | Quick action keyboard nav      | Tab to first quick-action button → Enter | Activates as if clicked; navigation proceeds                                                                                             |        |           |

### 3.5b Hub KPI accuracy

| #          | KPI tile                           | Action                                                                                      | Expected                                                                                                   | Actual | Pass/Fail |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-075a | "Total slots"                      | Compare to live timetable cell count for current academic year                              | Tile value matches DB query: `SELECT count(*) FROM schedules WHERE academic_year_id = ? AND tenant_id = ?` |        |           |
| SCH-A-075b | "Completion %"                     | Compute from latest applied run's result_json                                               | Tile = `entries_generated / (entries_generated + entries_unassigned) * 100`, rounded to 1 decimal          |        |           |
| SCH-A-075c | "Pinned entries"                   | Compare to `SELECT count(*) FROM schedules WHERE is_pinned = true AND academic_year_id = ?` | Match                                                                                                      |        |           |
| SCH-A-075d | "Latest run"                       | Compare to most-recent row in `scheduling_runs` order by created_at desc                    | Tile shows status badge + relative time ("2h ago") matching DB                                             |        |           |
| SCH-A-075e | KPI tiles after applying a new run | Refresh hub                                                                                 | Tiles refetch; new values reflect the just-applied run                                                     |        |           |
| SCH-A-075f | KPI tile loading state             | Throttle network → page load                                                                | Skeleton placeholders visible during load; not blank                                                       |        |           |

### 3.6 Hub Permission Visibility (admin under test)

| #         | Page          | Action                                                                                        | Expected                                                                                                                                                                    | Actual | Pass/Fail |
| --------- | ------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-060 | `/scheduling` | All 6 category headers visible to school_owner                                                | Yes — admin sees every tile because tiles are unconditionally rendered (no permission gating in hub itself)                                                                 |        |           |
| SCH-A-061 | `/scheduling` | Click a tile that requires a permission the admin role lacks (none expected for school_owner) | N/A for school_owner; for `admin` role lacking `schedule.manage_exams`, clicking Exams tile lands on `/scheduling/exams`, which then surfaces a 403 toast on first API call |        |           |

---

## 4. Structure Hub

### 4.1 Period Grid (`/scheduling/period-grid`)

#### 4.1.1 Page load and selectors

| #         | Page                      | Action                                                                      | Expected                                                                                                                                                                                                    | Actual | Pass/Fail |
| --------- | ------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-100 | `/scheduling/period-grid` | Load page as Yusuf Rahman                                                   | Page renders header "Period Grid"; year-group selector at top; calls `GET /api/v1/academic-years?pageSize=20`, `GET /api/v1/year-groups?pageSize=100`, `GET /api/v1/period-grid?academic_year_id={current}` |        |           |
| SCH-A-101 | `/scheduling/period-grid` | Inspect skeletons during load                                               | Skeleton placeholders visible until API resolves (not white blank)                                                                                                                                          |        |           |
| SCH-A-102 | `/scheduling/period-grid` | Empty state: choose a year group with no periods                            | Empty-state copy visible (e.g. "No periods configured") with primary CTA "Add period" or similar                                                                                                            |        |           |
| SCH-A-103 | `/scheduling/period-grid` | Click **Add period**                                                        | Modal opens with fields: weekday dropdown, period order (numeric), start_time (HH:mm), end_time (HH:mm), period_type (lesson/break/lunch/registration), duration auto-calculated                            |        |           |
| SCH-A-104 | `/scheduling/period-grid` | Submit modal with start_time after end_time                                 | Validation error inline (e.g. "End time must be after start time"); no API call                                                                                                                             |        |           |
| SCH-A-105 | `/scheduling/period-grid` | Submit modal with valid data                                                | `POST /api/v1/period-grid` fires; success toast; modal closes; new row appears in grid                                                                                                                      |        |           |
| SCH-A-106 | `/scheduling/period-grid` | Edit existing period (click pencil icon)                                    | Modal opens prefilled; PATCH on save; row updates inline                                                                                                                                                    |        |           |
| SCH-A-107 | `/scheduling/period-grid` | Delete a period (trash icon)                                                | Confirmation dialog; on confirm: `DELETE /api/v1/period-grid/{id}`; row removed; success toast                                                                                                              |        |           |
| SCH-A-108 | `/scheduling/period-grid` | Open **Auto-generate** dialog (AutoGenerateDialog component)                | Modal lets you set first/last period times, period duration, break windows; preview updates                                                                                                                 |        |           |
| SCH-A-109 | `/scheduling/period-grid` | Submit auto-generate                                                        | API call writes batch periods; success toast; grid refreshes                                                                                                                                                |        |           |
| SCH-A-110 | `/scheduling/period-grid` | Open **Copy day** dialog (CopyDayDialog)                                    | Modal: source weekday, target weekday(s) checkbox list                                                                                                                                                      |        |           |
| SCH-A-111 | `/scheduling/period-grid` | Copy Monday → Wednesday                                                     | `POST /api/v1/period-grid/copy-day` fires; success toast; Wednesday rows appear identical to Monday                                                                                                         |        |           |
| SCH-A-112 | `/scheduling/period-grid` | Open **Copy year group** dialog (CopyYearGroupDialog)                       | Modal: target year group(s); confirmation that existing periods will be replaced                                                                                                                            |        |           |
| SCH-A-113 | `/scheduling/period-grid` | Copy from Y3 → Y4                                                           | `POST /api/v1/period-grid/copy-year-group`; success toast; Y4 grid (after switching selector) matches Y3                                                                                                    |        |           |
| SCH-A-114 | `/scheduling/period-grid` | Replace day operation                                                       | `POST /api/v1/period-grid/replace-day` clears existing periods on that day before writing new ones                                                                                                          |        |           |
| SCH-A-115 | `/scheduling/period-grid` | RTL: Switch language to Arabic                                              | Layout mirrors; all icons that need rotation (chevrons, arrows) rotate; logical CSS classes (`me-`, `ms-`) used                                                                                             |        |           |
| SCH-A-116 | `/scheduling/period-grid` | Mobile (375px)                                                              | Day columns scroll horizontally inside `overflow-x-auto`; modals fill viewport; touch targets ≥44×44px                                                                                                      |        |           |
| SCH-A-117 | `/scheduling/period-grid` | Permission denial: log in as user without `schedule.configure_requirements` | API returns 403; page renders error toast; fields disabled or page redirected to hub                                                                                                                        |        |           |

### 4.2 Curriculum (`/scheduling/curriculum`)

| #         | Page                     | Action                                                              | Expected                                                                                                                                                                    | Actual | Pass/Fail |
| --------- | ------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-120 | `/scheduling/curriculum` | Load page                                                           | Year + year-group selectors; `GET /api/v1/academic-years`, `GET /api/v1/year-groups`, `GET /api/v1/scheduling/curriculum-requirements?academic_year_id={}&year_group_id={}` |        |           |
| SCH-A-121 | `/scheduling/curriculum` | Empty state for new year group                                      | Matrix shows subjects on one axis with empty cells; CTA "Add subject" or inline editable                                                                                    |        |           |
| SCH-A-122 | `/scheduling/curriculum` | Inspect matrix subjects                                             | Calls `GET /api/v1/scheduling/curriculum-requirements/matrix-subjects` to populate subject row                                                                              |        |           |
| SCH-A-123 | `/scheduling/curriculum` | Edit min_periods_per_week for English (Y3)                          | Inline input accepts integer 1–35; on blur, stored in dirty state, not yet saved                                                                                            |        |           |
| SCH-A-124 | `/scheduling/curriculum` | Set max_periods_per_day = 11 (out of range)                         | Validation error: must be 1–10                                                                                                                                              |        |           |
| SCH-A-125 | `/scheduling/curriculum` | Set preferred < min                                                 | Refine error per Zod: "Preferred must be ≥ min"                                                                                                                             |        |           |
| SCH-A-126 | `/scheduling/curriculum` | Toggle requires_double_period without setting double_period_count   | Refine error: "Double period count required when double periods enabled"                                                                                                    |        |           |
| SCH-A-127 | `/scheduling/curriculum` | Click **Save changes**                                              | `POST /api/v1/scheduling/curriculum-requirements/bulk-upsert` fires (max 100 entries per call); success toast; matrix re-fetches                                            |        |           |
| SCH-A-128 | `/scheduling/curriculum` | Open **Copy from another year** dialog                              | Source academic_year and source year_group selectors; on confirm: `POST /api/v1/scheduling/curriculum-requirements/copy`                                                    |        |           |
| SCH-A-129 | `/scheduling/curriculum` | Delete an existing requirement (per-row trash)                      | `DELETE /api/v1/scheduling/curriculum-requirements/:id`; row resets to empty                                                                                                |        |           |
| SCH-A-130 | `/scheduling/curriculum` | RTL parity                                                          | Subject row labels right-aligned in AR; numeric inputs remain LTR (Western numerals)                                                                                        |        |           |
| SCH-A-131 | `/scheduling/curriculum` | Mobile                                                              | Matrix horizontally scrollable; year-group selector full-width                                                                                                              |        |           |
| SCH-A-132 | `/scheduling/curriculum` | Permission denial as user without `schedule.configure_requirements` | 403 toast; matrix becomes read-only or page redirects                                                                                                                       |        |           |

### 4.3 Break Groups (`/scheduling/break-groups`)

| #         | Page                       | Action                       | Expected                                                                                   | Actual | Pass/Fail |
| --------- | -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-A-140 | `/scheduling/break-groups` | Load page                    | Year + year-group context; calls `GET /api/v1/scheduling/break-groups?academic_year_id={}` |        |           |
| SCH-A-141 | `/scheduling/break-groups` | Empty state                  | Empty card with CTA "Create break group"                                                   |        |           |
| SCH-A-142 | `/scheduling/break-groups` | Click **Create break group** | Modal: name, year groups multiselect                                                       |        |           |
| SCH-A-143 | `/scheduling/break-groups` | Submit empty name            | Validation error inline; no POST                                                           |        |           |
| SCH-A-144 | `/scheduling/break-groups` | Submit valid                 | `POST /api/v1/scheduling/break-groups`; success toast; new card appears                    |        |           |
| SCH-A-145 | `/scheduling/break-groups` | Edit existing group          | PATCH; card label updates inline                                                           |        |           |
| SCH-A-146 | `/scheduling/break-groups` | Delete with confirm          | DELETE; card removed; success toast                                                        |        |           |
| SCH-A-147 | `/scheduling/break-groups` | RTL/Mobile                   | Cards stack to single column < 640 px; AR mirrors layout                                   |        |           |
| SCH-A-148 | `/scheduling/break-groups` | Permission denial            | 403 → toast                                                                                |        |           |

### 4.4 Room Closures (`/scheduling/room-closures`)

| #         | Page                        | Action                                              | Expected                                                                                           | Actual | Pass/Fail |
| --------- | --------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-150 | `/scheduling/room-closures` | Load page                                           | Calls `GET /api/v1/rooms?pageSize=100`, `GET /api/v1/scheduling/room-closures?academic_year_id={}` |        |           |
| SCH-A-151 | `/scheduling/room-closures` | Empty state                                         | "No room closures scheduled" copy with CTA                                                         |        |           |
| SCH-A-152 | `/scheduling/room-closures` | Click **Add closure**                               | Modal: room dropdown (≥15 rooms), date_from, date_to, reason                                       |        |           |
| SCH-A-153 | `/scheduling/room-closures` | Submit with date_to < date_from                     | Validation error: "End date must be on or after start date"                                        |        |           |
| SCH-A-154 | `/scheduling/room-closures` | Submit valid future closure                         | `POST /api/v1/scheduling/room-closures`; success toast; row appears in list                        |        |           |
| SCH-A-155 | `/scheduling/room-closures` | Filter by room                                      | API call refires with `room_id={uuid}` query param; table filters                                  |        |           |
| SCH-A-156 | `/scheduling/room-closures` | Filter by date range                                | API refires; table filters                                                                         |        |           |
| SCH-A-157 | `/scheduling/room-closures` | Delete a closure                                    | `DELETE /api/v1/scheduling/room-closures/:id`; row removed                                         |        |           |
| SCH-A-158 | `/scheduling/room-closures` | RTL parity                                          | Layout mirrors; date pickers respect locale                                                        |        |           |
| SCH-A-159 | `/scheduling/room-closures` | Mobile                                              | Table wrapped in `overflow-x-auto`; modal fills viewport                                           |        |           |
| SCH-A-160 | `/scheduling/room-closures` | Permission denial as user without `schedule.manage` | 403 toast; create button disabled                                                                  |        |           |

---

## 5. Staff Hub

### 5.1 Teacher Competencies (`/scheduling/competencies`)

| #         | Page                       | Action                                                                    | Expected                                                                                                                     | Actual | Pass/Fail |
| --------- | -------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-200 | `/scheduling/competencies` | Load page                                                                 | Calls academic-years, year-groups, subjects, staff-profiles, classes, teacher-competencies                                   |        |           |
| SCH-A-201 | `/scheduling/competencies` | Verify two matrix views                                                   | PinMatrix (pinned competencies, class_id IS NOT NULL) AND PoolMatrix (pool, class_id IS NULL) sub-components render          |        |           |
| SCH-A-202 | `/scheduling/competencies` | Add a pool entry: pick teacher Sarah Daly, subject English, year group Y3 | `POST /api/v1/scheduling/teacher-competencies` with class_id=null; success toast; cell populates in PoolMatrix               |        |           |
| SCH-A-203 | `/scheduling/competencies` | Add a pinned entry: pick teacher Aisha Khan, subject Maths, Y4, class 4A  | `POST` with class_id=uuid of 4A; cell populates in PinMatrix at intersection (4A, Maths)                                     |        |           |
| SCH-A-204 | `/scheduling/competencies` | Try to add duplicate pin (same teacher/subject/class)                     | API returns 409 (conflict); toast surfaces "Already exists"                                                                  |        |           |
| SCH-A-205 | `/scheduling/competencies` | Pin → unpin (PATCH class_id to null) via row action                       | `PATCH /api/v1/scheduling/teacher-competencies/:id` with class_id=null; row moves from PinMatrix to PoolMatrix               |        |           |
| SCH-A-206 | `/scheduling/competencies` | Delete a competency                                                       | `DELETE /api/v1/scheduling/teacher-competencies/:id`; success toast; cell clears                                             |        |           |
| SCH-A-207 | `/scheduling/competencies` | Open **Copy Wizard**                                                      | Multi-step modal: select source academic year → select target year(s) and target year groups → confirm                       |        |           |
| SCH-A-208 | `/scheduling/competencies` | Submit copy wizard for one target year                                    | `POST /api/v1/scheduling/teacher-competencies/copy` (single-year) or `/copy-to-years` (multi-year); success toast with count |        |           |
| SCH-A-209 | `/scheduling/competencies` | Bulk add for one teacher across multiple subjects                         | UI offers a bulk dialog → `POST /api/v1/scheduling/teacher-competencies/bulk` (max 500 in payload); success toast with count |        |           |
| SCH-A-210 | `/scheduling/competencies` | Submit bulk with 501 entries                                              | UI prevents submission with inline error (or API returns 400 — verify which)                                                 |        |           |
| SCH-A-211 | `/scheduling/competencies` | Delete all for one teacher (`DELETE /by-teacher/{staffProfileId}`)        | Confirmation dialog mentioning irreversibility; on confirm: API call; affected cells clear; success toast                    |        |           |
| SCH-A-212 | `/scheduling/competencies` | Filter by year group                                                      | Matrix repopulates from `?year_group_id=` query param                                                                        |        |           |
| SCH-A-213 | `/scheduling/competencies` | RTL parity                                                                | Matrix headers/labels right-aligned; cell hover popovers anchored correctly                                                  |        |           |
| SCH-A-214 | `/scheduling/competencies` | Mobile                                                                    | Matrices wrapped in `overflow-x-auto`; teacher names sticky on first column                                                  |        |           |
| SCH-A-215 | `/scheduling/competencies` | Permission denial                                                         | 403 toast; matrices become read-only                                                                                         |        |           |

OBSERVATION: PinMatrix and PoolMatrix components share a `types.ts` module — verify visual parity between the teacher competencies and substitute competencies views (§5.4). A divergence is a maintenance smell.

### 5.2 Competency Coverage (`/scheduling/competency-coverage`)

| #         | Page                              | Action                          | Expected                                                                                                                                            | Actual | Pass/Fail |
| --------- | --------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-220 | `/scheduling/competency-coverage` | Load page                       | Calls `GET /api/v1/scheduling/teacher-competencies/coverage?academic_year_id={}` (per backend; frontend may use a slightly different path — verify) |        |           |
| SCH-A-221 | `/scheduling/competency-coverage` | Coverage report layout          | Table or heatmap: rows = year_group × subject; column = "qualified teacher count"; severity colour scale (red/amber/green)                          |        |           |
| SCH-A-222 | `/scheduling/competency-coverage` | Cells with 0 qualified teachers | Highlighted red; tooltip explains "No teacher pinned/pooled for this subject in Y\_"                                                                |        |           |
| SCH-A-223 | `/scheduling/competency-coverage` | Click a red cell                | Navigates (or opens drawer) prefilled to add competency for that subject/year-group                                                                 |        |           |
| SCH-A-224 | `/scheduling/competency-coverage` | Empty state                     | If all coverage 100%, banner "All subjects covered" with green check                                                                                |        |           |
| SCH-A-225 | `/scheduling/competency-coverage` | RTL parity                      | Heatmap labels mirror; severity colours unchanged                                                                                                   |        |           |
| SCH-A-226 | `/scheduling/competency-coverage` | Mobile                          | Table scrolls horizontally; legend stacks below                                                                                                     |        |           |
| SCH-A-227 | `/scheduling/competency-coverage` | Permission denial               | 403 toast                                                                                                                                           |        |           |

### 5.3 Teacher Config (`/scheduling/teacher-config`)

| #         | Page                         | Action                                                              | Expected                                                                                                                        | Actual | Pass/Fail |
| --------- | ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-230 | `/scheduling/teacher-config` | Load page                                                           | `GET /api/v1/staff-profiles?pageSize=100`, `GET /api/v1/scheduling/teacher-config?academic_year_id={}`                          |        |           |
| SCH-A-231 | `/scheduling/teacher-config` | Empty state                                                         | Per-teacher rows visible with "No config" indicator and "Add config" CTA                                                        |        |           |
| SCH-A-232 | `/scheduling/teacher-config` | Add config for Sarah Daly                                           | Modal/inline form with fields: max_periods_per_week, max_periods_per_day, min_break_minutes, prefers_morning, prefers_afternoon |        |           |
| SCH-A-233 | `/scheduling/teacher-config` | Submit invalid (max_periods_per_week = 0)                           | Validation error; no POST                                                                                                       |        |           |
| SCH-A-234 | `/scheduling/teacher-config` | Submit valid                                                        | `PUT /api/v1/scheduling/teacher-config` (upsert); success toast; row populates                                                  |        |           |
| SCH-A-235 | `/scheduling/teacher-config` | Edit existing config                                                | PUT replaces values; row updates inline                                                                                         |        |           |
| SCH-A-236 | `/scheduling/teacher-config` | Delete config row                                                   | `DELETE /api/v1/scheduling/teacher-config/:id`; row resets                                                                      |        |           |
| SCH-A-237 | `/scheduling/teacher-config` | Click **Copy from prior year**                                      | `POST /api/v1/scheduling/teacher-config/copy`; success toast with count                                                         |        |           |
| SCH-A-238 | `/scheduling/teacher-config` | RTL parity                                                          | Layout mirrors                                                                                                                  |        |           |
| SCH-A-239 | `/scheduling/teacher-config` | Mobile                                                              | Per-teacher rows stack; modal full-screen                                                                                       |        |           |
| SCH-A-240 | `/scheduling/teacher-config` | Permission denial as user without `schedule.configure_availability` | 403 toast; create disabled                                                                                                      |        |           |

### 5.4 Substitute Competencies (`/scheduling/substitute-competencies`)

| #         | Page                                  | Action                                        | Expected                                                                                                                | Actual | Pass/Fail |
| --------- | ------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-250 | `/scheduling/substitute-competencies` | Load page                                     | Same shape as §5.1 but using substitute endpoints                                                                       |        |           |
| SCH-A-251 | `/scheduling/substitute-competencies` | Verify PinMatrix and PoolMatrix render        | Identical structure to teacher competencies                                                                             |        |           |
| SCH-A-252 | `/scheduling/substitute-competencies` | Add pool entry                                | `POST /api/v1/scheduling/substitute-competencies` with class_id=null                                                    |        |           |
| SCH-A-253 | `/scheduling/substitute-competencies` | Add pinned entry                              | POST with class_id=uuid                                                                                                 |        |           |
| SCH-A-254 | `/scheduling/substitute-competencies` | Update class_id (pin/unpin)                   | PATCH `:id`                                                                                                             |        |           |
| SCH-A-255 | `/scheduling/substitute-competencies` | Delete                                        | DELETE `:id`                                                                                                            |        |           |
| SCH-A-256 | `/scheduling/substitute-competencies` | Bulk create (≤500)                            | POST `/bulk`                                                                                                            |        |           |
| SCH-A-257 | `/scheduling/substitute-competencies` | Copy across years                             | POST `/copy` or `/copy-to-years`                                                                                        |        |           |
| SCH-A-258 | `/scheduling/substitute-competencies` | Suggest available substitutes (read endpoint) | If page exposes "Suggest" sub-tool, calls `GET /api/v1/scheduling/substitute-competencies/suggest?date={}&period_id={}` |        |           |
| SCH-A-259 | `/scheduling/substitute-competencies` | RTL/mobile/permission                         | Same expectations as §5.1                                                                                               |        |           |

#### 5.4.1 Substitute auto-suggest sub-flow (Substitution Picker integration)

| #         | Page                                  | Action                                                           | Expected                                                                                                                                                                                               | Actual | Pass/Fail |
| --------- | ------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-A-260 | `/scheduling/substitute-competencies` | Open the **Suggest** drawer (or trigger from Substitutions page) | Calls `GET /api/v1/scheduling/substitute-competencies/suggest?date=YYYY-MM-DD&period_order=N&subject_id={uuid}&class_id={uuid}`                                                                        |        |           |
| SCH-A-261 | `/scheduling/substitute-competencies` | Verify ranking                                                   | Each suggestion row shows substitute name, role, competency match (subject + year_group), availability flag, current week's cover load. Sorted by AI rank score where AI is on; otherwise alphabetical |        |           |
| SCH-A-262 | `/scheduling/substitute-competencies` | Pick a substitute that is unavailable on requested date          | Row shows "Unavailable" badge and is non-selectable; tooltip explains conflict                                                                                                                         |        |           |
| SCH-A-263 | `/scheduling/substitute-competencies` | Verify cross-year-group competency                               | If a substitute has Y3 English pinned but the absence is Y4 English: row shows partial-match badge "Cross year group"                                                                                  |        |           |
| SCH-A-264 | `/scheduling/substitute-competencies` | Empty suggestions                                                | If no eligible substitute, drawer shows empty-state copy with link to "Create substitute competency"                                                                                                   |        |           |

### 5.5 Class Scheduling Requirements (`/scheduling/requirements`)

| #         | Page                                         | Action                                                    | Expected                                                                                                                 | Actual | Pass/Fail |
| --------- | -------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-A-270 | `/scheduling/requirements`                   | Load page                                                 | Calls year-groups, classes, `GET /api/v1/class-scheduling-requirements/bulk?academic_year_id={}`                         |        |           |
| SCH-A-271 | `/scheduling/requirements`                   | Add requirement (e.g. "Y3 must finish by period 5")       | Inline editor; on save: `POST /api/v1/class-scheduling-requirements/bulk` upsert; success toast                          |        |           |
| SCH-A-272 | `/scheduling/requirements`                   | Edit requirement                                          | Bulk upsert again with updated value                                                                                     |        |           |
| SCH-A-273 | `/scheduling/requirements`                   | Delete requirement                                        | DELETE per-row                                                                                                           |        |           |
| SCH-A-274 | `/scheduling/requirements`                   | Click **Subject overrides** sub-link                      | Navigates to `/en/scheduling/requirements/subject-overrides` (Zod-form page)                                             |        |           |
| SCH-A-275 | `/scheduling/requirements/subject-overrides` | Load page                                                 | Calls academic-years, classes, subjects, rooms, `GET /api/v1/class-subject-requirements?academic_year_id={}&class_id={}` |        |           |
| SCH-A-276 | `/scheduling/requirements/subject-overrides` | Verify form uses react-hook-form + zodResolver            | Inspect: form is the only Zod-enforced form on the module per inventory §6                                               |        |           |
| SCH-A-277 | `/scheduling/requirements/subject-overrides` | Submit empty                                              | Inline validation per Zod schema (`createClassSubjectRequirementSchema`); errors shown beside fields                     |        |           |
| SCH-A-278 | `/scheduling/requirements/subject-overrides` | Submit valid (class_id, subject_id, periods_per_week=4)   | `POST /api/v1/class-subject-requirements`; success toast; row appears                                                    |        |           |
| SCH-A-279 | `/scheduling/requirements/subject-overrides` | Edit row                                                  | Form prefills; on save: `PATCH /api/v1/class-subject-requirements/:id`                                                   |        |           |
| SCH-A-280 | `/scheduling/requirements/subject-overrides` | Delete row                                                | `DELETE /api/v1/class-subject-requirements/:id`                                                                          |        |           |
| SCH-A-281 | `/scheduling/requirements/subject-overrides` | Toggle requires_double_period without double_period_count | Zod refine error inline                                                                                                  |        |           |
| SCH-A-282 | `/scheduling/requirements/subject-overrides` | RTL/mobile/permission                                     | Standard expectations                                                                                                    |        |           |

---

## 6. Inputs Hub

### 6.1 Availability (`/scheduling/availability`)

| #         | Page                       | Action                                                | Expected                                                                                                                                                                                                             | Actual | Pass/Fail |
| --------- | -------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-300 | `/scheduling/availability` | Load page                                             | Calls academic-years, staff-profiles, then `GET /api/v1/staff-availability/staff/{staffId}/year/{yearId}` after teacher selected                                                                                     |        |           |
| SCH-A-301 | `/scheduling/availability` | Empty state when no staff selected                    | Prompt to "Select a teacher"                                                                                                                                                                                         |        |           |
| SCH-A-302 | `/scheduling/availability` | Pick Sarah Daly                                       | Day × time grid renders; default cells "Available"; toggleable                                                                                                                                                       |        |           |
| SCH-A-303 | `/scheduling/availability` | Toggle cell to "Unavailable" with from/to time inputs | `POST /api/v1/staff-availability` if new entry; PATCH if existing                                                                                                                                                    |        |           |
| SCH-A-304 | `/scheduling/availability` | Verify time input font size                           | OBSERVATION (frontend inventory §8): the time input uses `className="h-7 w-28 text-xs"` (~12 px) on the availability page → triggers iOS Safari auto-zoom on focus. Fails the 16 px minimum mobile rule. Flag in §12 |        |           |
| SCH-A-305 | `/scheduling/availability` | Submit conflicting entry (overlapping window)         | API validation surfaces error toast; no DB write                                                                                                                                                                     |        |           |
| SCH-A-306 | `/scheduling/availability` | Save and switch teacher then back                     | Availability persists                                                                                                                                                                                                |        |           |
| SCH-A-307 | `/scheduling/availability` | RTL parity                                            | Day labels right-aligned; time inputs remain LTR (Western digits)                                                                                                                                                    |        |           |
| SCH-A-308 | `/scheduling/availability` | Mobile (375 px)                                       | Grid scrolls horizontally; time inputs cluster — note the text-xs issue above                                                                                                                                        |        |           |
| SCH-A-309 | `/scheduling/availability` | Permission denial                                     | 403 → toast                                                                                                                                                                                                          |        |           |

### 6.2 Preferences (`/scheduling/preferences`) — admin view

| #         | Page                      | Action                                         | Expected                                                                                                                                                        | Actual | Pass/Fail |
| --------- | ------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-320 | `/scheduling/preferences` | Load page                                      | Calls academic-years, staff-profiles, subjects, classes, period-grid, then prefs                                                                                |        |           |
| SCH-A-321 | `/scheduling/preferences` | Pick a staff member                            | `GET /api/v1/staff-scheduling-preferences?staff_profile_id={}&academic_year_id={}&pageSize=100`                                                                 |        |           |
| SCH-A-322 | `/scheduling/preferences` | Three pref types visible                       | Subject preference, Class preference, Time-slot preference (matches frontend §7 description of `/my-preferences`; admin sees same shape but for selected staff) |        |           |
| SCH-A-323 | `/scheduling/preferences` | Add a "Subject: prefer English, priority High" | `POST /api/v1/staff-scheduling-preferences`; success toast; row appears                                                                                         |        |           |
| SCH-A-324 | `/scheduling/preferences` | Edit priority                                  | PATCH; row updates                                                                                                                                              |        |           |
| SCH-A-325 | `/scheduling/preferences` | Delete                                         | DELETE; success toast                                                                                                                                           |        |           |
| SCH-A-326 | `/scheduling/preferences` | Sentiment toggle prefer ↔ avoid                | UI updates; PATCH writes new sentiment                                                                                                                          |        |           |
| SCH-A-327 | `/scheduling/preferences` | RTL parity                                     | Standard                                                                                                                                                        |        |           |
| SCH-A-328 | `/scheduling/preferences` | Mobile                                         | Form fields stack vertically                                                                                                                                    |        |           |
| SCH-A-329 | `/scheduling/preferences` | Permission denial                              | 403 toast                                                                                                                                                       |        |           |

---

## 7. Generate Hub

### 7.1 Auto-Scheduler (`/scheduling/auto`)

| #         | Page               | Action                                                                | Expected                                                                                                                                                                                                                              | Actual | Pass/Fail |
| --------- | ------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-400 | `/scheduling/auto` | Load page as Yusuf Rahman                                             | Calls academic-years, then for current year: `GET /api/v1/scheduling/prerequisites?academic_year_id={}`, `GET /api/v1/scheduling-runs/feasibility?academic_year_id={}`, `GET /api/v1/scheduling-runs?academic_year_id={}&pageSize=50` |        |           |
| SCH-A-401 | `/scheduling/auto` | Header                                                                | "Auto-scheduler" title (translated `auto.autoScheduler`); description copy                                                                                                                                                            |        |           |
| SCH-A-402 | `/scheduling/auto` | Prerequisite checklist                                                | List of prerequisite checks: each row `{name, passed, reason}`; passed → green check, failed → red X with reason; aggregate "All prerequisites met" / "X prerequisites failed"                                                        |        |           |
| SCH-A-403 | `/scheduling/auto` | Feasibility section                                                   | 10-point structural sweep: each capacity check listed with PASS/WARN/FAIL; recommendation copy; estimated 100% placement likelihood gauge                                                                                             |        |           |
| SCH-A-404 | `/scheduling/auto` | Run history strip                                                     | Recent runs shown with status badge (queued/running/completed/failed/applied), mode (auto/hybrid), duration, score, link to review                                                                                                    |        |           |
| SCH-A-405 | `/scheduling/auto` | **Run** button disabled when prerequisites failing                    | Button greyed out; tooltip explains "Resolve prerequisites first"; cannot click                                                                                                                                                       |        |           |
| SCH-A-406 | `/scheduling/auto` | Resolve prerequisites (return to relevant page) and refresh auto page | Run button enabled                                                                                                                                                                                                                    |        |           |
| SCH-A-407 | `/scheduling/auto` | Click **Run**                                                         | Confirmation dialog: shows config snapshot summary (year, period count, class count, constraint count); buttons Cancel / Confirm                                                                                                      |        |           |
| SCH-A-408 | `/scheduling/auto` | Confirm                                                               | `POST /api/v1/scheduling-runs` with `{ academic_year_id }`; success toast "Run queued"; auto page navigates to `/en/scheduling/runs/{id}/review` (or shows live progress card)                                                        |        |           |
| SCH-A-409 | `/scheduling/auto` | Trigger second run while one queued                                   | API returns 409 (only one active run per year per tenant per backend §5); error toast surfaces "A run is already in progress"                                                                                                         |        |           |
| SCH-A-410 | `/scheduling/auto` | Validate duplicate-trigger guard at backend (network tab)             | Status 409 with `{ code: 'RUN_ALREADY_ACTIVE', message: ... }`                                                                                                                                                                        |        |           |
| SCH-A-411 | `/scheduling/auto` | RTL parity                                                            | Checklist mirrors; status icons identical                                                                                                                                                                                             |        |           |
| SCH-A-412 | `/scheduling/auto` | Mobile                                                                | Prerequisites accordion-collapses; feasibility cards stack                                                                                                                                                                            |        |           |
| SCH-A-413 | `/scheduling/auto` | Permission denial as user without `schedule.run_auto`                 | Run button hidden or disabled; 403 on trigger attempt                                                                                                                                                                                 |        |           |

### 7.2 Runs List (`/scheduling/runs`)

| #         | Page                       | Action                                                         | Expected                                                                                                                                                     | Actual | Pass/Fail |
| --------- | -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-A-420 | `/scheduling/runs`         | Load page                                                      | Calls academic-years and `GET /api/v1/scheduling-runs?academic_year_id={}&pageSize=100`                                                                      |        |           |
| SCH-A-421 | `/scheduling/runs`         | Empty state                                                    | "No scheduling runs yet" with CTA to `/scheduling/auto`                                                                                                      |        |           |
| SCH-A-422 | `/scheduling/runs`         | Verify list rows                                               | Each row: status badge, mode, created_at, created_by, hard_constraint_violations count, soft_preference_score, entries_generated/pinned/unassigned, duration |        |           |
| SCH-A-423 | `/scheduling/runs`         | Hover row                                                      | ArrowRight chevron icon appears (`opacity-0 group-hover:opacity-100`); icon respects `rtl:rotate-180`                                                        |        |           |
| SCH-A-424 | `/scheduling/runs`         | Status badges                                                  | `queued` (grey), `running` (blue with spinner), `completed` (emerald), `failed` (red), `applied` (violet)                                                    |        |           |
| SCH-A-425 | `/scheduling/runs`         | Click row                                                      | Navigates to `/en/scheduling/runs/{id}/review`                                                                                                               |        |           |
| SCH-A-426 | `/scheduling/runs`         | Filter by year                                                 | Selector changes refetch with new academic_year_id                                                                                                           |        |           |
| SCH-A-427 | `/scheduling/runs`         | Pagination                                                     | Page size = 100; if > 100 runs, paginator visible at bottom                                                                                                  |        |           |
| SCH-A-428 | `/scheduling/runs`         | Click **Compare runs**                                         | Navigates to `/en/scheduling/runs/compare`                                                                                                                   |        |           |
| SCH-A-429 | `/scheduling/runs/compare` | Compare page                                                   | Two run pickers side-by-side; on selection: side-by-side metric/diff display (entries_generated, score, violations, unassigned)                              |        |           |
| SCH-A-430 | `/scheduling/runs`         | RTL parity                                                     | Row chevron rotates; columns mirror                                                                                                                          |        |           |
| SCH-A-431 | `/scheduling/runs`         | Mobile                                                         | Rows compact; status badges remain readable; secondary metrics hidden behind expand toggle                                                                   |        |           |
| SCH-A-432 | `/scheduling/runs`         | Permission denial as user without `schedule.view_auto_reports` | 403 → toast and empty list                                                                                                                                   |        |           |

### 7.3 Run Review (`/scheduling/runs/[id]/review`)

| #         | Page                                   | Action                                                | Expected                                                                                                                                                        | Actual | Pass/Fail |
| --------- | -------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-440 | `/scheduling/runs/{id}/review`         | Load run review for a completed run                   | Calls `GET /api/v1/scheduling-runs/{id}` (returns config_snapshot, result_json, proposed_adjustments) and `GET /api/v1/scheduling-runs/{id}/diagnostics`        |        |           |
| SCH-A-441 | `/scheduling/runs/{id}/review`         | Verify placement summary banner at top                | Shows entries_generated, entries_pinned, entries_unassigned, hard_constraint_violations, soft_preference_score, completion % (matches recent commit `c9ec9395`) |        |           |
| SCH-A-442 | `/scheduling/runs/{id}/review`         | ScheduleGrid component                                | Large timetable rendered; rows = periods, columns = weekdays; cells colour-coded by source (manual/auto_generated/pinned)                                       |        |           |
| SCH-A-443 | `/scheduling/runs/{id}/review`         | Click cell                                            | Cell expands or opens drawer with: subject, class, teacher, room, source badge, pin toggle                                                                      |        |           |
| SCH-A-444 | `/scheduling/runs/{id}/review`         | PinToggle on a cell                                   | Click pins via `POST /api/v1/schedules/{id}/pin`; success toast; cell shows pin badge                                                                           |        |           |
| SCH-A-445 | `/scheduling/runs/{id}/review`         | PinToggle (unpin)                                     | `POST /api/v1/schedules/{id}/unpin`; success toast                                                                                                              |        |           |
| SCH-A-446 | `/scheduling/runs/{id}/review`         | HealthScore widget                                    | Renders gauge or score number; tooltip explains meaning ("higher is better")                                                                                    |        |           |
| SCH-A-447 | `/scheduling/runs/{id}/review`         | WorkloadSidebar                                       | Per-teacher period count list; totals; outliers highlighted                                                                                                     |        |           |
| SCH-A-448 | `/scheduling/runs/{id}/review`         | ValidateResults panel                                 | Diagnostics from `/diagnostics` endpoint: categorised violations (capacity, double-period, room conflicts) with `recommendations[]`                             |        |           |
| SCH-A-449 | `/scheduling/runs/{id}/review`         | Click "Simulate override" on a violation              | Drawer opens; pick override (move/swap/remove/add); `POST /v1/scheduling-runs/{id}/diagnostics/simulate` returns projected impact; no data write                |        |           |
| SCH-A-450 | `/scheduling/runs/{id}/review`         | Click **Refresh diagnostics**                         | `POST /v1/scheduling-runs/{id}/diagnostics/refresh`; success toast; ValidateResults panel refreshes                                                             |        |           |
| SCH-A-451 | `/scheduling/runs/{id}/review`         | Add manual adjustment via PATCH `/adjustments`        | Discriminated union body (move/swap/remove/add); UI dialog gathers fields; on save: PATCH; success toast; ScheduleGrid updates                                  |        |           |
| SCH-A-452 | `/scheduling/runs/{id}/review`         | Add adjustment with stale `expected_updated_at`       | API returns 409 (optimistic concurrency); error toast "Run was modified — reload"                                                                               |        |           |
| SCH-A-453 | `/scheduling/runs/{id}/review`         | Click **Apply** for completed run                     | Confirmation dialog with prominent warning ("This will overwrite the live timetable for academic year X"); buttons Cancel/Confirm                               |        |           |
| SCH-A-454 | `/scheduling/runs/{id}/review`         | Confirm apply                                         | `POST /api/v1/scheduling-runs/{id}/apply` with `expected_updated_at`; success toast; run status badge → `applied`; live timetable now reflects run              |        |           |
| SCH-A-455 | `/scheduling/runs/{id}/review`         | Try to apply an already-applied run                   | Apply button hidden or returns 400 with code `RUN_ALREADY_APPLIED`                                                                                              |        |           |
| SCH-A-456 | `/scheduling/runs/{id}/review`         | Try to apply a failed run                             | Apply button hidden; only Discard available                                                                                                                     |        |           |
| SCH-A-457 | `/scheduling/runs/{id}/review`         | Click **Discard**                                     | Confirmation dialog; on confirm: `POST /api/v1/scheduling-runs/{id}/discard`; run marked discarded; success toast                                               |        |           |
| SCH-A-458 | `/scheduling/runs/{id}/review`         | Click **Cancel** for queued run                       | `POST /api/v1/scheduling-runs/{id}/cancel`; run → failed with reason "Cancelled by user"                                                                        |        |           |
| SCH-A-459 | `/scheduling/runs/{id}/review`         | Cancel running run                                    | API still accepts but worker may still complete (per backend SCHED-027); UI shows pending state until worker acknowledges                                       |        |           |
| SCH-A-460 | `/scheduling/runs/{id}/review`         | Back-to-timetable button (recent commit 24df795c)     | Sticky/fixed button visible; click navigates back to `/scheduling/runs` or hub; portal-based positioning verified by scrolling                                  |        |           |
| SCH-A-461 | `/scheduling/runs/{id}/review`         | Auto-navigate after apply                             | Recent commit c9ec9395: page may auto-navigate to a tiered completion view post-apply; verify expected behaviour                                                |        |           |
| SCH-A-462 | `/scheduling/runs/{id}/review`         | RTL parity                                            | Grid columns mirror (Sat first in Arabic week if locale dictates; otherwise English calendar weekday order); chevrons rotate                                    |        |           |
| SCH-A-463 | `/scheduling/runs/{id}/review`         | Mobile (375 px)                                       | ScheduleGrid horizontally scrollable with sticky first column (period labels); WorkloadSidebar collapses to bottom drawer                                       |        |           |
| SCH-A-464 | `/scheduling/runs/{id}/review`         | Permission denial: user without `schedule.apply_auto` | Apply/Discard/Adjustments buttons hidden or disabled; 403 on action                                                                                             |        |           |
| SCH-A-465 | `/scheduling/runs/{id}` (no `/review`) | Navigate directly                                     | Page redirects to `/review` subpage                                                                                                                             |        |           |

#### 7.3.1 Run Review — adjustments deep-dive

The PATCH `/v1/scheduling-runs/{id}/adjustments` body is a discriminated union per backend §3 (`adjustmentSchema`). Exercise each variant.

| #         | Page                           | Action                                                                                                 | Expected                                                                                                                                                                                                                                                                           | Actual | Pass/Fail |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-470 | `/scheduling/runs/{id}/review` | Adjust type=**move**: pick a generated cell, choose a new (weekday, period_order, optional to_room_id) | Adjustment dialog includes from-coords prefilled and to-coords picker; on save: PATCH with `{ adjustment: { type: 'move', class_id, from_weekday, from_period_order, to_weekday, to_period_order, to_room_id? }, expected_updated_at }`; success toast; ScheduleGrid reflects move |        |           |
| SCH-A-471 | `/scheduling/runs/{id}/review` | Adjust type=**swap**: pick two cells                                                                   | Dialog: "Swap with…" picker; on save: PATCH with `{ adjustment: { type: 'swap', entry_a, entry_b }, expected_updated_at }`                                                                                                                                                         |        |           |
| SCH-A-472 | `/scheduling/runs/{id}/review` | Adjust type=**remove**: pick one cell                                                                  | Dialog confirms removal; on save: PATCH with `{ adjustment: { type: 'remove', class_id, weekday, period_order } }`; cell clears                                                                                                                                                    |        |           |
| SCH-A-473 | `/scheduling/runs/{id}/review` | Adjust type=**add**: click an empty cell                                                               | Dialog with class_id picker, room_id picker (nullable), teacher_staff_id picker (nullable), weekday/period prefilled; on save: PATCH with `{ adjustment: { type: 'add', ... } }`                                                                                                   |        |           |
| SCH-A-474 | `/scheduling/runs/{id}/review` | Submit move with invalid weekday=7                                                                     | Frontend dropdown only allows 0–6; backend Zod rejects with 400 if bypassed                                                                                                                                                                                                        |        |           |
| SCH-A-475 | `/scheduling/runs/{id}/review` | Submit add with class_id from a different academic year                                                | Backend rejects (RLS scope ensures class belongs to the run's tenant + year)                                                                                                                                                                                                       |        |           |
| SCH-A-476 | `/scheduling/runs/{id}/review` | Submit two adjustments in quick succession                                                             | Second uses a stale `expected_updated_at` and gets 409; toast surfaces "Run modified — reload"; first succeeds                                                                                                                                                                     |        |           |
| SCH-A-477 | `/scheduling/runs/{id}/review` | Run validate after adjustments                                                                         | `POST /v1/scheduling/runs/{id}/validate` re-runs constraint checks; ValidateResults panel updates with new violation list                                                                                                                                                          |        |           |
| SCH-A-478 | `/scheduling/runs/{id}/review` | Apply after adjustments                                                                                | Apply path uses adjusted result; live timetable matches adjusted state                                                                                                                                                                                                             |        |           |

### 7.4 Scenarios (`/scheduling/scenarios`)

| #         | Page                    | Action                                                | Expected                                                                                                                                  | Actual | Pass/Fail |
| --------- | ----------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-480 | `/scheduling/scenarios` | Load page                                             | Calls academic-years, `GET /api/v1/scheduling-runs?...&pageSize=100`, `GET /api/v1/scheduling/scenarios?academic_year_id={}&pageSize=100` |        |           |
| SCH-A-481 | `/scheduling/scenarios` | Empty state                                           | "No scenarios yet" with CTA "Create scenario from a run"                                                                                  |        |           |
| SCH-A-482 | `/scheduling/scenarios` | Click **Create scenario**                             | Modal: name, description, base_run_id picker                                                                                              |        |           |
| SCH-A-483 | `/scheduling/scenarios` | Submit empty                                          | Inline validation (hand-rolled per inventory §6); cannot POST                                                                             |        |           |
| SCH-A-484 | `/scheduling/scenarios` | Submit valid                                          | `POST /api/v1/scheduling/scenarios`; success toast; row appears with status "draft"                                                       |        |           |
| SCH-A-485 | `/scheduling/scenarios` | Edit scenario constraints                             | PATCH `/api/v1/scheduling/scenarios/{id}` with config_snapshot edits                                                                      |        |           |
| SCH-A-486 | `/scheduling/scenarios` | Click **Solve**                                       | `POST /api/v1/scheduling/scenarios/{id}/solve`; status → solving; on completion: result_json populated                                    |        |           |
| SCH-A-487 | `/scheduling/scenarios` | View scenario result                                  | Inline render of result_json metrics; comparison to base run                                                                              |        |           |
| SCH-A-488 | `/scheduling/scenarios` | Click **Compare**                                     | Multi-select two scenarios → `POST /api/v1/scheduling/scenarios/compare`; side-by-side panel renders                                      |        |           |
| SCH-A-489 | `/scheduling/scenarios` | Delete scenario                                       | DELETE; success toast; row removed                                                                                                        |        |           |
| SCH-A-490 | `/scheduling/scenarios` | RTL parity                                            | Standard                                                                                                                                  |        |           |
| SCH-A-491 | `/scheduling/scenarios` | Mobile                                                | Cards stack; modal full-screen                                                                                                            |        |           |
| SCH-A-492 | `/scheduling/scenarios` | Permission denial without `schedule.manage_scenarios` | 403 toast                                                                                                                                 |        |           |

OBSERVATION: Scenario create form is hand-rolled (inventory §6), not Zod+react-hook-form. New forms should use Zod per CLAUDE.md "Forms — Hard Rule". Flag for migration in §12.

---

## 8. Operations Hub

### 8.1 Substitutions (`/scheduling/substitutions`)

| #         | Page                        | Action                                                            | Expected                                                                                                                                                               | Actual | Pass/Fail |
| --------- | --------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-500 | `/scheduling/substitutions` | Load page                                                         | Calls academic-years, staff-profiles, `GET /api/v1/scheduling/absences?date_from={}&date_to={}&academic_year_id={}`                                                    |        |           |
| SCH-A-501 | `/scheduling/substitutions` | Empty state                                                       | "No absences in selected window" with CTA "Report absence"                                                                                                             |        |           |
| SCH-A-502 | `/scheduling/substitutions` | Click **Report absence**                                          | Modal opens (HR-025 hand-rolled per inventory): fields staff_id, date, date_to (optional), full_day toggle, period_from/period_to (when partial), reason               |        |           |
| SCH-A-503 | `/scheduling/substitutions` | Submit with date_to < date                                        | Inline validation error                                                                                                                                                |        |           |
| SCH-A-504 | `/scheduling/substitutions` | Submit partial-day with period_to < period_from                   | Inline validation error                                                                                                                                                |        |           |
| SCH-A-505 | `/scheduling/substitutions` | Submit valid full-day absence                                     | `POST /api/v1/scheduling/absences` with absence_type=`admin_reported`; success toast; row appears                                                                      |        |           |
| SCH-A-506 | `/scheduling/substitutions` | Cascade triggered (network tab)                                   | After absence reported, observe cascade kicked off (notification queue receives jobs); UI shows offer count or "Notifying substitutes" indicator                       |        |           |
| SCH-A-507 | `/scheduling/substitutions` | Click row → Find substitute                                       | Calls `GET /api/v1/scheduling/absences/{id}/substitutes?schedule_id={}&date={}`                                                                                        |        |           |
| SCH-A-508 | `/scheduling/substitutions` | Click **AI rank** in sub picker                                   | `GET /api/v1/scheduling/absences/{id}/substitutes/ai`; ranked list with scoring rationale (competency match, fairness, availability)                                   |        |           |
| SCH-A-509 | `/scheduling/substitutions` | Pick substitute, optional notes, **Assign**                       | `POST /api/v1/scheduling/substitutions` with absence_id, schedule_id, substitute_staff_id, notes; success toast; SubstitutionRecord row created with status `assigned` |        |           |
| SCH-A-510 | `/scheduling/substitutions` | Filter by status (assigned/confirmed/declined/completed/revoked)  | List refetches with `?status=` query                                                                                                                                   |        |           |
| SCH-A-511 | `/scheduling/substitutions` | Cancel an absence (admin)                                         | Modal with optional cancellation_reason; on confirm: `POST /api/v1/scheduling/absences/{id}/cancel`; pending offers revoked (verify via offers list); success toast    |        |           |
| SCH-A-512 | `/scheduling/substitutions` | Permanently delete absence                                        | `DELETE /api/v1/scheduling/absences/{id}` (admin-only); confirmation; success toast                                                                                    |        |           |
| SCH-A-513 | `/scheduling/substitutions` | RTL parity                                                        | Modal mirrors; date pickers respect locale                                                                                                                             |        |           |
| SCH-A-514 | `/scheduling/substitutions` | Mobile                                                            | Modal full-screen; tables wrapped in overflow-x-auto                                                                                                                   |        |           |
| SCH-A-515 | `/scheduling/substitutions` | Permission denial as user without `schedule.manage_substitutions` | 403 → toast; report-absence button hidden                                                                                                                              |        |           |

OBSERVATION: Inventory §6 marks the substitutions form as legacy hand-rolled (HR-025) — should be migrated to Zod+react-hook-form per CLAUDE.md. Flag in §12.

#### 8.1.1 Substitution cascade — admin-side observability

The cascade is owned by the worker (out of scope for this spec) but the admin UI surfaces its state.

| #         | Page                        | Action                                                  | Expected                                                                                                                                    | Actual | Pass/Fail |
| --------- | --------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-516 | `/scheduling/substitutions` | After reporting an absence, expand the row              | Cascade tier table renders: each tier shows offered staff name, status (`pending`/`accepted`/`declined`/`revoked`), offered_at, response_at |        |           |
| SCH-A-517 | `/scheduling/substitutions` | Wait until first tier expires (test env: short timeout) | Status flips to `revoked`; next tier is auto-offered (visible as new pending rows)                                                          |        |           |
| SCH-A-518 | `/scheduling/substitutions` | One offer accepted                                      | Status `accepted`; SubstitutionRecord row created with status `confirmed`; cascade halts (no further tiers triggered)                       |        |           |
| SCH-A-519 | `/scheduling/substitutions` | Cancel absence with pending offers                      | All pending offers move to `revoked` (verify by `GET /api/v1/scheduling/offers/my` for affected staff)                                      |        |           |

#### 8.1.1a Teacher absence — full lifecycle

The teacher absence record drives the entire substitution cascade. Exercise the full state machine.

| #          | Page                        | Action                                                                                | Expected                                                                                                              | Actual | Pass/Fail |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-519a | `/scheduling/substitutions` | Report a same-day absence (date = today, full_day=true)                               | `POST /v1/scheduling/absences` returns 201; absence row in DB with status `pending` and absence_type `admin_reported` |        |           |
| SCH-A-519b | `/scheduling/substitutions` | Report a future absence (date = today + 7d)                                           | 201; absence row with status `pending` and `requires_substitute=true` (default)                                       |        |           |
| SCH-A-519c | `/scheduling/substitutions` | Report a partial-day absence (period_from=2, period_to=4)                             | 201; cascade only creates offers for affected periods 2–4, not the full day                                           |        |           |
| SCH-A-519d | `/scheduling/substitutions` | Try to report an absence that overlaps an existing absence for same teacher           | Backend may return 409 or merge — verify exact behaviour and document                                                 |        |           |
| SCH-A-519e | `/scheduling/substitutions` | Try to report a past-dated absence (date < today)                                     | Per Zod schema (date validation): if rejected, inline error; if accepted, used for retroactive logging                |        |           |
| SCH-A-519f | `/scheduling/substitutions` | Edit an existing absence (PATCH dates or reason)                                      | `PATCH /v1/scheduling/absences/{id}`; pending offers may need re-triggering — verify behaviour                        |        |           |
| SCH-A-519g | `/scheduling/substitutions` | Mark absence "no substitute needed" (toggle `requires_substitute=false`)              | All pending offers move to `revoked`; absence row `requires_substitute=false`; no further cascade                     |        |           |
| SCH-A-519h | `/scheduling/substitutions` | Cancel a fulfilled absence (after substitute confirmed)                               | Substitution record → `revoked`; substitute receives notification; offered schedule slot reverts to original teacher  |        |           |
| SCH-A-519i | `/scheduling/substitutions` | Verify state machine: pending → confirmed → completed (after the absence date passes) | Cron or scheduled task transitions completed status; row read-only                                                    |        |           |
| SCH-A-519j | `/scheduling/substitutions` | Permanently delete a completed absence                                                | DELETE may be blocked — verify whether soft-archive or hard-delete; document                                          |        |           |

#### 8.1.2 Schedule swap and emergency change

| #          | Page                                              | Action                                           | Expected                                                                                                                                                                                       | Actual | Pass/Fail |
| ---------- | ------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-525a | `/scheduling/substitutions` (or schedule context) | Trigger **Swap two slots** flow                  | Modal asks for schedule_id_a, schedule_id_b; **Validate** button calls `POST /v1/scheduling/swaps/validate`; on success: green badge "Safe to swap"; on conflict: red badge with conflict list |        |           |
| SCH-A-525b | swap modal                                        | Click **Execute swap** after successful validate | `POST /v1/scheduling/swaps/execute`; success toast; both schedules updated; teacher/room timetables reflect                                                                                    |        |           |
| SCH-A-525c | emergency change modal                            | Trigger **Emergency change**                     | Form: schedule_id, optional new_room_id, optional new_teacher_staff_id, optional cancel_period boolean, reason (1–500 chars); on save: `POST /v1/scheduling/emergency-change`; success toast   |        |           |
| SCH-A-525d | emergency change modal                            | Submit with reason length 501                    | Backend Zod rejects; inline error surfaces                                                                                                                                                     |        |           |

### 8.2 Substitution Board (`/scheduling/substitution-board`)

| #         | Page                             | Action                                                                                                      | Expected                                                                                                                                                                                                                                                                                                                                     | Actual | Pass/Fail |
| --------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-520 | `/scheduling/substitution-board` | Load page (admin authenticated)                                                                             | Calls `GET /api/v1/scheduling/substitution-board`; renders kiosk-friendly board                                                                                                                                                                                                                                                              |        |           |
| SCH-A-521 | `/scheduling/substitution-board` | Verify two sections                                                                                         | "Upcoming absences" and "Today's slots" with status indicators (unassigned/assigned/confirmed)                                                                                                                                                                                                                                               |        |           |
| SCH-A-522 | `/scheduling/substitution-board` | Auto-refresh                                                                                                | Page refreshes every 60 s; visible countdown in corner                                                                                                                                                                                                                                                                                       |        |           |
| SCH-A-523 | `/scheduling/substitution-board` | Toggle dark/light theme via the kiosk control                                                               | Theme persists in localStorage (or URL param); both themes render correctly                                                                                                                                                                                                                                                                  |        |           |
| SCH-A-524 | `/scheduling/substitution-board` | Append `?kiosk=true` to URL                                                                                 | Kiosk mode hides chrome (morph bar may collapse); designed for unattended display                                                                                                                                                                                                                                                            |        |           |
| SCH-A-525 | `/scheduling/substitution-board` | Verify school name + logo display                                                                           | Top of the board shows tenant name and logo from tenant settings                                                                                                                                                                                                                                                                             |        |           |
| SCH-A-526 | `/scheduling/substitution-board` | Empty state (no absences today)                                                                             | Friendly message "No absences today" with status emoji or icon                                                                                                                                                                                                                                                                               |        |           |
| SCH-A-527 | `/scheduling/substitution-board` | Auth: log out and reload                                                                                    | OBSERVATION: Inventory §7 says board endpoint has no permission check; verify that an unauthenticated browser can load `/api/v1/scheduling/substitution-board` and the page renders. If yes, this is a deliberate kiosk design — confirm with product. If no, RLS still scopes by tenant via host. Either way, must NOT leak across tenants. |        |           |
| SCH-A-528 | `/scheduling/substitution-board` | Cross-tenant: load `https://stress-a.edupod.app/en/scheduling/substitution-board` from same browser session | Returns stress-a board only (host header drives tenant); no nhqs data leaks                                                                                                                                                                                                                                                                  |        |           |
| SCH-A-529 | `/scheduling/substitution-board` | RTL parity                                                                                                  | Layout mirrors; status badges and timer remain readable                                                                                                                                                                                                                                                                                      |        |           |
| SCH-A-530 | `/scheduling/substitution-board` | Mobile                                                                                                      | Full-width design; cards stack                                                                                                                                                                                                                                                                                                               |        |           |

### 8.3 Exams (`/scheduling/exams`)

| #         | Page                | Action                                            | Expected                                                                                                                                                         | Actual | Pass/Fail |
| --------- | ------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-540 | `/scheduling/exams` | Load page                                         | Calls academic-years, academic-periods, `GET /api/v1/scheduling/exam-sessions?academic_year_id={}`                                                               |        |           |
| SCH-A-541 | `/scheduling/exams` | Empty state                                       | "No exam sessions yet" with CTA "Create session"                                                                                                                 |        |           |
| SCH-A-542 | `/scheduling/exams` | Click **Create session**                          | Modal (CreateSessionModal — hand-rolled per inventory): name (1–255 chars), academic_period_id picker, start_date, end_date                                      |        |           |
| SCH-A-543 | `/scheduling/exams` | Submit with end_date < start_date                 | Inline validation; backend Zod also rejects                                                                                                                      |        |           |
| SCH-A-544 | `/scheduling/exams` | Submit valid                                      | `POST /api/v1/scheduling/exam-sessions`; success toast; session appears with status `planning`                                                                   |        |           |
| SCH-A-545 | `/scheduling/exams` | Click session row → Add slot                      | Modal: subject_id, year_group_id, date, start_time HH:mm regex, end_time HH:mm regex (optional), room_id (optional), duration_minutes (15–480), student_count ≥1 |        |           |
| SCH-A-546 | `/scheduling/exams` | Submit slot with start_time = "25:00"             | Inline regex validation fails; backend Zod also rejects                                                                                                          |        |           |
| SCH-A-547 | `/scheduling/exams` | Submit valid slot                                 | `POST /api/v1/scheduling/exam-sessions/{id}/slots`; slot row appears                                                                                             |        |           |
| SCH-A-548 | `/scheduling/exams` | Click **Generate** schedule                       | `POST /api/v1/scheduling/exam-sessions/{id}/generate`; auto-assigns rooms/times for unscheduled slots; success toast; slots populate                             |        |           |
| SCH-A-549 | `/scheduling/exams` | Click **Assign invigilators**                     | `POST /api/v1/scheduling/exam-sessions/{id}/assign-invigilators`; ExamInvigilation rows created; success toast                                                   |        |           |
| SCH-A-550 | `/scheduling/exams` | Click **Publish**                                 | Confirmation dialog; on confirm: `POST /api/v1/scheduling/exam-sessions/{id}/publish`; status → `published`; schedule frozen                                     |        |           |
| SCH-A-551 | `/scheduling/exams` | Try to add slot to published session              | Edit/add controls disabled; toast "Session published — unpublish to edit"                                                                                        |        |           |
| SCH-A-552 | `/scheduling/exams` | Try to publish empty session (no slots)           | API may return 400 with code `EXAM_SESSION_EMPTY`; toast surfaces error                                                                                          |        |           |
| SCH-A-553 | `/scheduling/exams` | Delete session (planning state)                   | `DELETE /api/v1/scheduling/exam-sessions/{id}`; confirm; success toast; row removed                                                                              |        |           |
| SCH-A-554 | `/scheduling/exams` | Delete published session                          | API returns 400 (cannot delete published); toast                                                                                                                 |        |           |
| SCH-A-555 | `/scheduling/exams` | RTL parity                                        | Standard                                                                                                                                                         |        |           |
| SCH-A-556 | `/scheduling/exams` | Mobile                                            | Sessions stack as cards; slots in expandable subsection                                                                                                          |        |           |
| SCH-A-557 | `/scheduling/exams` | Permission denial without `schedule.manage_exams` | 403 → toast; create button hidden                                                                                                                                |        |           |

### 8.4 My Timetable (`/scheduling/my-timetable`) — admin's own view

| #         | Page                       | Action                                 | Expected                                                                                                                                                                 | Actual | Pass/Fail |
| --------- | -------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-A-570 | `/scheduling/my-timetable` | Load page as Yusuf Rahman              | Calls `GET /api/v1/timetables/me?academic_year_id={}&week_start={}` and `GET /api/v1/calendar/subscription-url`                                                          |        |           |
| SCH-A-571 | `/scheduling/my-timetable` | Empty state for non-teaching admin     | "No teaching assignments — viewing administrator's timetable" or graceful empty grid                                                                                     |        |           |
| SCH-A-572 | `/scheduling/my-timetable` | If admin teaches: weekly grid renders  | Period rows × weekday columns; cells show subject/class/room/cover-for indicator                                                                                         |        |           |
| SCH-A-573 | `/scheduling/my-timetable` | Cover duty alert strip                 | If admin assigned to cover duties this week, banner at top lists them with date/period/teacher-being-covered                                                             |        |           |
| SCH-A-574 | `/scheduling/my-timetable` | Week navigation prev/next              | Re-fetch with new `week_start`; grid updates; URL may update                                                                                                             |        |           |
| SCH-A-575 | `/scheduling/my-timetable` | Calendar subscription URL              | "Subscribe via webcal" button; click reveals URL; copy-to-clipboard works                                                                                                |        |           |
| SCH-A-576 | `/scheduling/my-timetable` | iCal token CRUD                        | If page exposes manage panel: `POST /api/v1/scheduling/calendar-tokens`, `GET /api/v1/scheduling/calendar-tokens`, `DELETE /api/v1/scheduling/calendar-tokens/{tokenId}` |        |           |
| SCH-A-577 | `/scheduling/my-timetable` | Loader uses `me-2` (logical CSS)       | Inventory §8 verified `me-2` instead of `mr-2` — passes RTL safety                                                                                                       |        |           |
| SCH-A-578 | `/scheduling/my-timetable` | RTL parity                             | Layout mirrors; timetable column order respects locale                                                                                                                   |        |           |
| SCH-A-579 | `/scheduling/my-timetable` | Mobile                                 | Grid scrolls horizontally; `overflow-x-auto` plus `min-w-0` per inventory                                                                                                |        |           |
| SCH-A-580 | `/scheduling/my-timetable` | Self-report absence (if surfaced here) | `POST /api/v1/scheduling/absences/self-report` with nominated_substitute_staff_id picker via `GET /api/v1/scheduling/colleagues`                                         |        |           |
| SCH-A-581 | `/scheduling/my-timetable` | Cancel own absence                     | `POST /api/v1/scheduling/absences/{id}/cancel-own`                                                                                                                       |        |           |

#### 8.4.1 Self-report absence (admin acting as teacher proxy or own absence)

| #          | Page                       | Action                                                     | Expected                                                                                                    | Actual | Pass/Fail |
| ---------- | -------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-585a | `/scheduling/my-timetable` | Click **Report my absence**                                | Modal: date, full-day toggle, period range (when partial), reason, optional `nominated_substitute_staff_id` |        |           |
| SCH-A-585b | self-report modal          | Click **Suggest colleagues**                               | `GET /api/v1/scheduling/colleagues?date=...&period_order=...&subject_id=...` returns ranked list            |        |           |
| SCH-A-585c | self-report modal          | Pick a colleague and submit                                | `POST /api/v1/scheduling/absences/self-report` with absence_type=`self_reported`; success toast             |        |           |
| SCH-A-585d | self-report modal          | Verify nominated substitute receives priority offer        | Offer for nominated substitute appears in their `/scheduling/offers/my` view as the FIRST tier              |        |           |
| SCH-A-585e | `/scheduling/my-timetable` | Click **Cancel my absence** on a still-pending self-report | `POST /api/v1/scheduling/absences/{id}/cancel-own`; success toast; pending offers revoked                   |        |           |
| SCH-A-585f | `/scheduling/my-timetable` | Try to cancel another teacher's absence via tampered URL   | 403 (only `cancel-own` permitted; admin path is `/cancel`)                                                  |        |           |

#### 8.4.2 Offers (admin observability)

| #          | Page                                     | Action                                                | Expected                                                                                                                     | Actual | Pass/Fail |
| ---------- | ---------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-585g | `/scheduling/substitutions` (drill-down) | View all offers for an absence                        | `GET /api/v1/scheduling/offers?absence_id={}` returns list across all tiers; status, offered_at, response_at, decline_reason |        |           |
| SCH-A-585h | offers panel                             | Manually revoke a pending offer                       | `POST /api/v1/scheduling/offers/{id}/revoke` (admin action); offer status → `revoked`; substitute notified                   |        |           |
| SCH-A-585i | offers panel                             | Manually re-offer to a previously declined substitute | `POST /api/v1/scheduling/offers` with override flag; new offer row with status `pending`; substitute receives push           |        |           |
| SCH-A-585j | offers panel                             | Filter by status (pending/accepted/declined/revoked)  | List refetches                                                                                                               |        |           |

### 8.5 Leave Requests (`/scheduling/leave-requests`) — admin tool

| #         | Page                         | Action                                                   | Expected                                                                                                                                 | Actual | Pass/Fail |
| --------- | ---------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-590 | `/scheduling/leave-requests` | Load page                                                | Calls `GET /api/v1/leave/requests?status=pending&pageSize=100` and `GET /api/v1/leave/requests?pageSize=100` for two tabs                |        |           |
| SCH-A-591 | `/scheduling/leave-requests` | Verify two tabs                                          | "Pending" and "Reviewed"; counts in tab labels                                                                                           |        |           |
| SCH-A-592 | `/scheduling/leave-requests` | Pending tab empty                                        | Friendly "No pending leave requests" copy                                                                                                |        |           |
| SCH-A-593 | `/scheduling/leave-requests` | Pending tab with data                                    | Each row: requester name, leave type, dates, reason, action buttons (Approve / Reject)                                                   |        |           |
| SCH-A-594 | `/scheduling/leave-requests` | Click **Approve**                                        | Optional notes textarea; on confirm: `POST /api/v1/leave/requests/{id}/approve`; success toast; row moves to Reviewed                    |        |           |
| SCH-A-595 | `/scheduling/leave-requests` | Click **Reject**                                         | Optional notes textarea; on confirm: `POST /api/v1/leave/requests/{id}/reject`; success toast; row moves to Reviewed with rejected badge |        |           |
| SCH-A-596 | `/scheduling/leave-requests` | Reviewed tab                                             | Status badges: approved, rejected, cancelled, withdrawn; reviewer name + review date/notes visible                                       |        |           |
| SCH-A-597 | `/scheduling/leave-requests` | RTL parity                                               | Standard                                                                                                                                 |        |           |
| SCH-A-598 | `/scheduling/leave-requests` | Mobile                                                   | Rows stack; action buttons full-width                                                                                                    |        |           |
| SCH-A-599 | `/scheduling/leave-requests` | Permission denial without `leave.review` (or equivalent) | 403 → toast; cards become read-only                                                                                                      |        |           |

OBSERVATION: Inventory §7 explicitly notes leave-requests is an ADMIN tool despite the path-name pattern. Confirm with product whether the URL should be `/scheduling/admin-leave-requests` to remove ambiguity.

### 8.6 Substitute Competencies (covered in §5.4)

Substitute competencies appear in the Operations sub-strip but the page itself was covered under §5.4 (Staff Hub) for matrix logic.

---

## 9. Analytics Hub

### 9.1 Analytics Dashboard (`/scheduling/dashboard`)

| #         | Page                    | Action                                                 | Expected                                                                                                                           | Actual | Pass/Fail |
| --------- | ----------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-700 | `/scheduling/dashboard` | Load page                                              | Calls academic-years, then four parallel: `GET /api/v1/scheduling-dashboard/overview`, `/workload`, `/room-utilisation`, `/trends` |        |           |
| SCH-A-701 | `/scheduling/dashboard` | KPI tiles render                                       | Total slots, Completion %, Pinned, Latest run (mirrors hub but expanded)                                                           |        |           |
| SCH-A-702 | `/scheduling/dashboard` | Workload heatmap                                       | Per-teacher heatmap (rows=teachers, cols=weekdays); cell shading by period count; legend visible                                   |        |           |
| SCH-A-703 | `/scheduling/dashboard` | Workload heatmap interaction                           | Hover cell → tooltip with exact period count; click cell → drill-down (if implemented)                                             |        |           |
| SCH-A-704 | `/scheduling/dashboard` | Room utilisation chart                                 | Per-room bar chart; usage % values; Recharts ResponsiveContainer                                                                   |        |           |
| SCH-A-705 | `/scheduling/dashboard` | Trends line chart                                      | Historical metrics across multiple runs (entries_generated, score, violations over time); X-axis = run date                        |        |           |
| SCH-A-706 | `/scheduling/dashboard` | Empty state for new tenant                             | All charts gracefully empty with "No data yet" overlay; no chart JS errors                                                         |        |           |
| SCH-A-707 | `/scheduling/dashboard` | Toggle academic year                                   | All four panels refetch and re-render                                                                                              |        |           |
| SCH-A-708 | `/scheduling/dashboard` | RTL parity                                             | Charts mirror axis direction (Recharts respects RTL via container layout); legend positions correct                                |        |           |
| SCH-A-709 | `/scheduling/dashboard` | Dark mode parity                                       | Chart background, axis colour, tooltip colour all use design tokens; no hardcoded white/black                                      |        |           |
| SCH-A-710 | `/scheduling/dashboard` | Mobile                                                 | Charts shrink to viewport; ResponsiveContainer handles resize; KPI cards stack                                                     |        |           |
| SCH-A-711 | `/scheduling/dashboard` | Permission denial without `schedule.view_auto_reports` | 403 across all four panels; page renders empty placeholders without crash                                                          |        |           |

### 9.2 Cover Reports (`/scheduling/cover-reports`)

| #         | Page                        | Action                                            | Expected                                                                                                                                           | Actual | Pass/Fail |
| --------- | --------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-720 | `/scheduling/cover-reports` | Load page                                         | Calls academic-years, `GET /api/v1/scheduling/cover-reports?date_from={}&date_to={}`                                                               |        |           |
| SCH-A-721 | `/scheduling/cover-reports` | Date range picker default                         | Defaults to current term or current month                                                                                                          |        |           |
| SCH-A-722 | `/scheduling/cover-reports` | Submit invalid range (date_to < date_from)        | Inline validation; no API call                                                                                                                     |        |           |
| SCH-A-723 | `/scheduling/cover-reports` | Verify report tabs/sections                       | (a) Cover statistics (per-period count, by-day breakdown), (b) Fairness analysis (`GET .../fairness`), (c) By department (`GET .../by-department`) |        |           |
| SCH-A-724 | `/scheduling/cover-reports` | Fairness panel                                    | Shows distribution: e.g. teachers with 0 cover this period vs teachers with >5; outliers highlighted                                               |        |           |
| SCH-A-725 | `/scheduling/cover-reports` | By-department breakdown                           | Bar chart per department; total cover hours                                                                                                        |        |           |
| SCH-A-726 | `/scheduling/cover-reports` | Empty range                                       | Friendly empty state in each panel                                                                                                                 |        |           |
| SCH-A-727 | `/scheduling/cover-reports` | RTL parity                                        | Charts mirror                                                                                                                                      |        |           |
| SCH-A-728 | `/scheduling/cover-reports` | Mobile                                            | Tables wrapped in overflow-x-auto; charts shrink                                                                                                   |        |           |
| SCH-A-729 | `/scheduling/cover-reports` | Permission denial without `schedule.view_reports` | 403 toast                                                                                                                                          |        |           |

### 9.3 Cross-module Timetables (`/timetables`)

| #         | Page          | Action                                             | Expected                                                                                                                                                       | Actual | Pass/Fail |
| --------- | ------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-740 | `/timetables` | Load page                                          | Calls academic-years, classes, staff-profiles, students, rooms (all `?pageSize=100`)                                                                           |        |           |
| SCH-A-741 | `/timetables` | Tab strip                                          | "Class", "Teacher", "Student", "Room" tabs (or selector with same modes)                                                                                       |        |           |
| SCH-A-742 | `/timetables` | Class tab                                          | Pick class → `GET /api/v1/timetables/class/{classId}?academic_year_id={}`; TimetableGrid renders                                                               |        |           |
| SCH-A-743 | `/timetables` | Teacher tab                                        | Pick teacher → `GET /api/v1/timetables/teacher/{teacherId}?academic_year_id={}`                                                                                |        |           |
| SCH-A-744 | `/timetables` | Student tab                                        | Pick student → `GET /api/v1/timetables/student/{studentId}?academic_year_id={}`; admin sees all students; parent sees only linked children (out of scope here) |        |           |
| SCH-A-745 | `/timetables` | Room tab                                           | Pick room → `GET /api/v1/timetables/room/{roomId}?academic_year_id={}`                                                                                         |        |           |
| SCH-A-746 | `/timetables` | EngagementSchoolCalendar overlay                   | Per inventory §3, an overlay shows calendar events (terms, holidays); verify on/off toggle                                                                     |        |           |
| SCH-A-747 | `/timetables` | Empty state when entity has no schedule            | Friendly empty grid copy                                                                                                                                       |        |           |
| SCH-A-748 | `/timetables` | RTL parity                                         | Grid mirrors weekday order if locale enforces; numerals stay Western                                                                                           |        |           |
| SCH-A-749 | `/timetables` | Mobile                                             | Grid `overflow-x-auto`; entity selector full-width                                                                                                             |        |           |
| SCH-A-750 | `/timetables` | Permission: viewer without `schedule.view_reports` | Class/teacher/room timetables denied (403); student timetable falls back to permission `students.view`                                                         |        |           |

### 9.4 Manual Schedules (`/schedules`)

| #         | Page         | Action                                      | Expected                                                                                                                     | Actual | Pass/Fail |
| --------- | ------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-760 | `/schedules` | Load page                                   | Calls academic-years, classes, staff-profiles, rooms, `GET /api/v1/schedules?academic_year_id={}&pageSize=20`                |        |           |
| SCH-A-761 | `/schedules` | Verify DataTable renders                    | Columns: class, teacher, room, weekday, period, source, is_pinned, actions                                                   |        |           |
| SCH-A-762 | `/schedules` | Filter by class/teacher/room                | Each filter refetches with appropriate query param                                                                           |        |           |
| SCH-A-763 | `/schedules` | Pagination                                  | 20 per page; meta `{ page, pageSize, total }`; controls work                                                                 |        |           |
| SCH-A-764 | `/schedules` | Click **New schedule** → ScheduleForm modal | Form (hand-rolled per inventory): class_id, teacher_id, room_id, weekday, start_time, end_time, effective_from, effective_to |        |           |
| SCH-A-765 | `/schedules` | Submit with overlapping teacher slot        | Conflict detection: API returns `meta.conflicts` array; ConflictAlert renders with detail; user can override or fix          |        |           |
| SCH-A-766 | `/schedules` | Override conflict                           | Form's `setOverridden(true)`; POST proceeds; row created with potential conflict warning                                     |        |           |
| SCH-A-767 | `/schedules` | Submit with no conflicts                    | `POST /api/v1/schedules`; success toast; row appears in table                                                                |        |           |
| SCH-A-768 | `/schedules` | Edit row                                    | Modal prefills; PATCH on save                                                                                                |        |           |
| SCH-A-769 | `/schedules` | Delete row                                  | DELETE; confirm; success toast                                                                                               |        |           |
| SCH-A-770 | `/schedules` | Pin entry (single, via row action)          | `POST /api/v1/schedules/{id}/pin`; row badge updates                                                                         |        |           |
| SCH-A-771 | `/schedules` | Bulk-pin (multi-select rows)                | `POST /api/v1/schedules/bulk-pin` with `{ ids: [...], reason: '...' }`; success toast                                        |        |           |
| SCH-A-772 | `/schedules` | Unpin                                       | `POST /api/v1/schedules/{id}/unpin`; badge clears                                                                            |        |           |
| SCH-A-773 | `/schedules` | RTL parity                                  | Standard                                                                                                                     |        |           |
| SCH-A-774 | `/schedules` | Mobile                                      | DataTable wraps in overflow-x-auto                                                                                           |        |           |
| SCH-A-775 | `/schedules` | Permission denial without `schedule.manage` | 403 → toast; create/edit disabled                                                                                            |        |           |

OBSERVATION: ScheduleForm is hand-rolled (no Zod) per inventory §6. Same migration target as substitutions modal and scenario modal.

### 9.5 Print Room Timetable (`/(print)/timetables/rooms/[roomId]/print`)

| #         | Page                                   | Action                | Expected                                                                                          | Actual | Pass/Fail |
| --------- | -------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-790 | `/(print)/timetables/rooms/{id}/print` | Load page             | Calls `GET /api/v1/timetables/room/{roomId}?academic_year_id={}` and `GET /api/v1/rooms/{roomId}` |        |           |
| SCH-A-791 | `/(print)/.../print`                   | Auto-print on load    | Browser print dialog opens automatically                                                          |        |           |
| SCH-A-792 | `/(print)/.../print`                   | Print preview content | Room name + photo header; weekly grid with all schedules                                          |        |           |
| SCH-A-793 | `/(print)/.../print`                   | Dark/light mode       | Page respects theme; print stylesheet forces white background                                     |        |           |
| SCH-A-794 | `/(print)/.../print`                   | RTL parity            | Print template mirrors when locale=ar                                                             |        |           |

#### 9.5.1 Print teacher and class timetables (parallel print routes)

| #          | Page                                             | Action                                                                                                      | Expected                                                                                            | Actual | Pass/Fail |
| ---------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-794a | `/(print)/timetables/teachers/{teacherId}/print` | Load page                                                                                                   | Calls `GET /api/v1/timetables/teacher/{id}` and `GET /api/v1/staff-profiles/{id}`; auto-print       |        |           |
| SCH-A-794b | `/(print)/timetables/classes/{classId}/print`    | Load page                                                                                                   | Calls `GET /api/v1/timetables/class/{id}` and `GET /api/v1/classes/{id}`; auto-print                |        |           |
| SCH-A-794c | `/(print)/timetables/students/{studentId}/print` | Load page                                                                                                   | Calls `GET /api/v1/timetables/student/{id}`; auto-print; verify privacy (no other students visible) |        |           |
| SCH-A-794d | print pages                                      | Cross-tenant probe — load `/(print)/timetables/teachers/{stress-a_teacher_id}/print` while logged into nhqs | 404; never renders stress-a teacher's grid                                                          |        |           |
| SCH-A-794e | print pages                                      | Permission denial — log in as parent and load teacher print page                                            | 403; falls back to error page                                                                       |        |           |

### 9.6 Compare Runs (`/scheduling/runs/compare`)

| #          | Page                       | Action                                                                       | Expected                                                                                                                              | Actual | Pass/Fail |
| ---------- | -------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-795  | `/scheduling/runs`         | Multi-select two completed runs (checkbox column or select-mode toggle)      | "Compare" button enables once exactly 2 are selected; disabled with 1 or >2                                                           |        |           |
| SCH-A-795a | `/scheduling/runs`         | Click **Compare**                                                            | Navigates to `/en/scheduling/runs/compare?a={runA}&b={runB}`                                                                          |        |           |
| SCH-A-795b | `/scheduling/runs/compare` | Page load                                                                    | Calls `GET /api/v1/scheduling-runs/{runA}` and `GET /api/v1/scheduling-runs/{runB}` in parallel; renders side-by-side timetable grids |        |           |
| SCH-A-795c | `/scheduling/runs/compare` | Header row                                                                   | Shows run timestamps, scenario name (if any), entries_generated, soft_preference_score, hard_constraint_violations for each           |        |           |
| SCH-A-795d | `/scheduling/runs/compare` | Diff highlighting                                                            | Cells that differ between A and B are visually flagged (border, badge, or colour)                                                     |        |           |
| SCH-A-795e | `/scheduling/runs/compare` | Toggle "Show only differences"                                               | Filters grid to differing cells; teacher/class/subject filter dropdowns also work                                                     |        |           |
| SCH-A-795f | `/scheduling/runs/compare` | Click **Apply A**                                                            | Confirmation modal naming run A; on confirm `POST /api/v1/scheduling-runs/{runA}/apply`; redirect to runs list with success toast     |        |           |
| SCH-A-795g | `/scheduling/runs/compare` | Cross-tenant param tampering — manually craft URL with `b={stress-a_run_id}` | Run B fetch returns 404; page shows "Run not found" panel for that side; never renders stress-a data                                  |        |           |

### 9.7 Workload Report (`/v1/reports/workload`)

| #          | Page                                  | Action                                                                       | Expected                                                                                                      | Actual | Pass/Fail |
| ---------- | ------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-796  | `/scheduling/dashboard` (or sub-link) | Open Workload tab/panel                                                      | Calls `GET /api/v1/reports/workload?academic_year_id={}` (alternate route on shared `/v1/reports` controller) |        |           |
| SCH-A-796a | Workload report                       | Verify columns                                                               | Teacher name, scheduled periods, max periods, utilisation %, free periods, cover load (last 30d)              |        |           |
| SCH-A-796b | Workload report                       | Sort by utilisation desc                                                     | Teachers above 90% flagged in warning colour (`text-warning` token, not red hex)                              |        |           |
| SCH-A-796c | Workload report                       | Filter by department/year group                                              | Query string updates and result narrows                                                                       |        |           |
| SCH-A-796d | Workload report                       | Click teacher row                                                            | Navigates to teacher's timetable view (`/timetables` with teacher tab pre-selected)                           |        |           |
| SCH-A-796e | Workload report                       | Export CSV                                                                   | Download triggers; CSV columns match table; numeric format uses Western numerals                              |        |           |
| SCH-A-796f | Workload report                       | Permission probe — log in as teacher and hit `/v1/reports/workload` directly | 403 (requires `schedule.view_reports`)                                                                        |        |           |

### 9.8 Calendar Tokens (admin management of public iCal tokens)

| #          | Page                                     | Action                                                                               | Expected                                                                                                                                  | Actual | Pass/Fail |
| ---------- | ---------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-797  | `/scheduling/dashboard` or settings page | Open **Calendar Tokens** panel                                                       | Lists existing tokens (label, scope: tenant/teacher/class, created_at, last_used_at, revoked status)                                      |        |           |
| SCH-A-797a | Calendar tokens panel                    | Click **Create token**                                                               | Modal with `label`, `scope`, optional `staff_profile_id` / `class_id`, `expires_at`                                                       |        |           |
| SCH-A-797b | Calendar tokens modal                    | Submit                                                                               | `POST` token-create endpoint; modal shows the raw token ONCE with copy button and warning "this is the only time you will see this token" |        |           |
| SCH-A-797c | Calendar tokens panel                    | Open generated `.ics` URL `/v1/calendar/{tenantId}/{token}.ics` in new tab (no auth) | 200 with `text/calendar` body; events match the scope                                                                                     |        |           |
| SCH-A-797d | Calendar tokens panel                    | Click **Revoke** on a token                                                          | Confirmation; on confirm token is invalidated; subsequent `.ics` fetch with that token returns 404                                        |        |           |
| SCH-A-797e | Calendar tokens panel                    | Verify `last_used_at` updates after a hit                                            | Refresh after fetching `.ics`; field updates within ~5 s                                                                                  |        |           |
| SCH-A-797f | Calendar tokens panel                    | Cross-tenant probe — fetch `/v1/calendar/{nhqs_tenant_id}/{stress-a_token}.ics`      | 404 (token not in this tenant) — see also SCH-A-959                                                                                       |        |           |
| SCH-A-797g | Calendar tokens panel                    | Permission probe — log in as teacher and try to access calendar token list           | 403 (requires `schedule.manage`)                                                                                                          |        |           |

### 9.8a What-If Planner (`/scheduling/what-if`)

Per backend §1, the `SchedulingWhatIfController` exposes a sandbox for trial scheduling without writing data.

| #          | Page                  | Action                                                                      | Expected                                                                                                                            | Actual | Pass/Fail |
| ---------- | --------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-797h | `/scheduling/what-if` | Load page                                                                   | Calls academic-years, then `GET /api/v1/scheduling/what-if?academic_year_id={}` if any saved scenarios exist                        |        |           |
| SCH-A-797i | `/scheduling/what-if` | Click **New scenario**                                                      | Modal: name, description, base_run_id (optional — defaults to current applied run)                                                  |        |           |
| SCH-A-797j | `/scheduling/what-if` | Submit valid                                                                | `POST /api/v1/scheduling/what-if`; success toast; scenario card appears                                                             |        |           |
| SCH-A-797k | `/scheduling/what-if` | Add a constraint variation (e.g. "Remove teacher Sarah's Wed availability") | Constraint editor saves to scenario JSON; scenario remains in `draft` status                                                        |        |           |
| SCH-A-797l | `/scheduling/what-if` | Click **Simulate**                                                          | `POST /api/v1/scheduling/what-if/{id}/simulate`; status → `running`; on complete: result_json populated; metrics shown vs. baseline |        |           |
| SCH-A-797m | `/scheduling/what-if` | Click **Compare to baseline**                                               | Side-by-side metric panel: entries_generated/pinned/unassigned, soft_preference_score, hard_constraint_violations diff vs. base run |        |           |
| SCH-A-797n | `/scheduling/what-if` | Click **Promote to scenario**                                               | If product flow allows: copies what-if into `/scheduling/scenarios` for further editing                                             |        |           |
| SCH-A-797o | `/scheduling/what-if` | Verify NO writes to live tables                                             | DB read: no schedule rows mutated; only what-if storage table updated                                                               |        |           |
| SCH-A-797p | `/scheduling/what-if` | Delete scenario                                                             | DELETE; success toast                                                                                                               |        |           |
| SCH-A-797q | `/scheduling/what-if` | Permission denial without `schedule.manage_scenarios`                       | 403 toast                                                                                                                           |        |           |
| SCH-A-797r | `/scheduling/what-if` | Cross-tenant probe — `GET /api/v1/scheduling/what-if/{stress-a_id}`         | 404                                                                                                                                 |        |           |

### 9.9 Rotation Config (academic-year rotation cycle)

| #          | Page                                                   | Action                                                                 | Expected                                                                                                                          | Actual | Pass/Fail |
| ---------- | ------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-798  | `/scheduling/period-grid` (or dedicated rotation page) | Locate **Rotation** section in Day Templates editor                    | Shows `rotation_type` (none/weekly/multi-week/day-letter), `cycle_length`, `start_date`, `day_labels[]` if applicable             |        |           |
| SCH-A-798a | Rotation editor                                        | Set `rotation_type=multi-week` and `cycle_length=2`                    | Saves; calendar preview shows alternating Week A / Week B labels                                                                  |        |           |
| SCH-A-798b | Rotation editor                                        | Set `rotation_type=day-letter` with labels `["A","B","C","D","E","F"]` | Saves; weekday grid relabels columns to A–F instead of Mon–Sun                                                                    |        |           |
| SCH-A-798c | Rotation editor                                        | Try to set `cycle_length=0`                                            | Zod validation rejects (positive integer); inline error                                                                           |        |           |
| SCH-A-798d | Rotation editor                                        | Try to set `start_date` after the academic year ends                   | 400 with semantic error                                                                                                           |        |           |
| SCH-A-798e | Rotation editor                                        | After save, trigger an auto-run                                        | Solver consumes rotation config; result_json schedules respect cycle (verify in run review by spot-checking different cycle days) |        |           |
| SCH-A-798f | Rotation editor                                        | Permission probe — non-admin attempts to PATCH rotation                | 403 (requires `schedule.manage`)                                                                                                  |        |           |

---

## 10. Solver Run Lifecycle

End-to-end exercise of the SchedulingRun state machine: queued → running → {completed, failed} → {applied, discarded}.

### 10.1 Happy path: queued → running → completed → applied

| #         | Page                           | Action                                                                                      | Expected                                                                                                                                  | Actual | Pass/Fail |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-800 | `/scheduling/auto`             | Confirm prerequisites all green                                                             | Prerequisites pass; Run button enabled                                                                                                    |        |           |
| SCH-A-801 | `/scheduling/auto`             | Click **Run**                                                                               | Confirmation dialog; click Confirm                                                                                                        |        |           |
| SCH-A-802 | `/scheduling/auto`             | Verify enqueue                                                                              | `POST /api/v1/scheduling-runs` returns 201 with `{ id, status: 'queued' }`; toast "Run queued"                                            |        |           |
| SCH-A-803 | `/scheduling/auto`             | Page redirects to `/scheduling/runs/{id}/review` (or shows live progress card on auto page) | URL contains the new run ID                                                                                                               |        |           |
| SCH-A-804 | `/scheduling/runs/{id}/review` | Status header shows **Queued** badge with grey colour                                       | Polls `GET /api/v1/scheduling-runs/{id}/progress` (every 1–3 s)                                                                           |        |           |
| SCH-A-805 | `/scheduling/runs/{id}/review` | Worker picks up job (within ~5 s in test env)                                               | Status flips to **Running**; phase = "preparing" then "solving"; elapsed_ms ticks up                                                      |        |           |
| SCH-A-806 | `/scheduling/runs/{id}/review` | Worker completes (≤ 120 s in test env)                                                      | Status → **Completed**; full run review renders (timetable grid, diagnostics)                                                             |        |           |
| SCH-A-807 | `/scheduling/runs/{id}/review` | Verify result_json populated                                                                | Cells fill the grid; entries_generated > 0; entries_unassigned ≥ 0; soft_preference_score visible                                         |        |           |
| SCH-A-808 | `/scheduling/runs/{id}/review` | Click **Apply** → confirm                                                                   | Status → **Applied**; live timetable now reflects this run; `applied_by_user_id` and `applied_at` recorded (verify via DB or future read) |        |           |
| SCH-A-809 | `/scheduling/runs/{id}/review` | Apply button now hidden                                                                     | Run is terminal-applied; only "View" actions remain                                                                                       |        |           |
| SCH-A-810 | `/timetables`                  | Open class tab and pick a class affected by this run                                        | Timetable matches run's result_json for that class                                                                                        |        |           |

### 10.2 Failure path: queued → running → failed

| #         | Page                           | Action                                                                                                | Expected                                                                                                            | Actual | Pass/Fail |
| --------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-820 | (test setup)                   | Seed an unsatisfiable constraint scenario (e.g. set max_periods_per_day = 1 for 5 mandatory subjects) | Forces solver to fail                                                                                               |        |           |
| SCH-A-821 | `/scheduling/auto`             | Trigger run                                                                                           | Same as 10.1 up to Running                                                                                          |        |           |
| SCH-A-822 | `/scheduling/runs/{id}/review` | Worker fails (timeout or unsat)                                                                       | Status → **Failed**; failure_reason populated (e.g. "INFEASIBLE", "TIMEOUT")                                        |        |           |
| SCH-A-823 | `/scheduling/runs/{id}/review` | Diagnostics panel (refined)                                                                           | Categorised failures with i18n recommendations: e.g. "Subject X has Y mandatory periods but only Z slots available" |        |           |
| SCH-A-824 | `/scheduling/runs/{id}/review` | Apply button hidden                                                                                   | Cannot apply a failed run                                                                                           |        |           |
| SCH-A-825 | `/scheduling/runs/{id}/review` | **Discard** button visible                                                                            | Click → POST `/discard`; row marked discarded                                                                       |        |           |

### 10.3 Cancel path: queued → cancelled

| #         | Page                           | Action                                                                 | Expected                                                                                          | Actual | Pass/Fail |
| --------- | ------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-840 | `/scheduling/runs/{id}/review` | Trigger run; while still queued (within 1–2 s window) click **Cancel** | `POST /api/v1/scheduling-runs/{id}/cancel`; status → failed; failure_reason = "Cancelled by user" |        |           |
| SCH-A-841 | `/scheduling/runs/{id}/review` | Verify worker did not process                                          | Worker logs show queued claim guard rejected the job (per backend solver-v2.processor.ts:97)      |        |           |

### 10.4 Cancel path: running → flagged but worker continues (SCHED-027)

| #         | Page                           | Action                                                   | Expected                                                                                                                                                      | Actual | Pass/Fail |
| --------- | ------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-850 | `/scheduling/runs/{id}/review` | Trigger run; wait for status = running; click **Cancel** | API returns 200; UI shows "Cancellation pending"; per backend SCHED-027, CP-SAT phase cannot be cooperatively interrupted                                     |        |           |
| SCH-A-851 | `/scheduling/runs/{id}/review` | Worker eventually completes                              | If solver finishes before timeout: result still written, but status flagged failed (cancelled). Verify exact behaviour in current code — flag if inconsistent |        |           |

### 10.5 Stale-reaper path

| #         | Page                           | Action                                                                               | Expected                                                                                                       | Actual | Pass/Fail |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-860 | (worker observation)           | Wait until cron `scheduling:reap-stale-runs` fires (every 60 s per worker inventory) | Stale runs (older than `max_solver_duration + 60s`) flipped to failed with reason "Reaped — exceeded duration" |        |           |
| SCH-A-861 | `/scheduling/runs/{id}/review` | Open a stale-failed run                                                              | Status badge → failed; failure_reason visible; diagnostics may be empty                                        |        |           |

### 10.6a Stuck job — worker crash mid-run

| #         | Page                           | Action                                                                                    | Expected                                                                                                                                               | Actual | Pass/Fail |
| --------- | ------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-A-862 | (worker observation)           | Trigger run; while solver phase running, kill the worker process (`pm2 stop` in test env) | Job lock expires after `lockDuration` (300s) per worker inventory; BullMQ marks job stalled                                                            |        |           |
| SCH-A-863 | (worker)                       | Restart worker                                                                            | Stalled job picked up by new worker if `maxStalledCount` not exceeded; otherwise moves to DLQ                                                          |        |           |
| SCH-A-864 | `/scheduling/runs/{id}/review` | Verify run status during stall                                                            | Status remains `running` until stale-reaper sweeps (within 60s of `max_solver_duration + 60s`); then `failed` with reason "Reaped — exceeded duration" |        |           |
| SCH-A-865 | `/scheduling/runs/{id}/review` | Run is recoverable: trigger a new run                                                     | Old failed run remains as audit row; new run enqueues normally                                                                                         |        |           |

### 10.6b BullMQ retry semantics

| #         | Page     | Action                                                        | Expected                                                                                               | Actual | Pass/Fail |
| --------- | -------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-A-866 | (worker) | Force solver sidecar to return 500 once                       | Worker catches; BullMQ default retry kicks in (no custom override per inventory); job retried          |        |           |
| SCH-A-867 | (worker) | Force solver to fail 3 times consecutively                    | Job lands in DLQ; run row marked `failed` with reason mentioning solver error; not auto-retried by app |        |           |
| SCH-A-868 | (worker) | Verify `removeOnComplete: 100` and `removeOnFail: 200` bounds | After many runs, completed/failed BullMQ entries are pruned                                            |        |           |

### 10.6 Discard without applying

| #         | Page                           | Action                                                    | Expected                                                                                                                                      | Actual | Pass/Fail |
| --------- | ------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-870 | `/scheduling/runs/{id}/review` | Click **Discard** on a completed run                      | Confirmation dialog; confirm → `POST /api/v1/scheduling-runs/{id}/discard`; row remains queryable for audit but excluded from "current" lists |        |           |
| SCH-A-871 | `/scheduling/runs`             | Verify discarded row shows in list with `discarded` badge | Row visible; cannot apply; can still view review for audit                                                                                    |        |           |

---

## 11. Cross-cutting

### 11.1 Console errors

| #         | Page      | Action                                                          | Expected                                                                                                                           | Actual | Pass/Fail |
| --------- | --------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-900 | All pages | Navigate through every page in §3–§9 with DevTools Console open | Zero `Error` or `Warning` entries originating from app code (third-party noise like React-DevTools messages acceptable but logged) |        |           |
| SCH-A-901 | All pages | Check for React key warnings                                    | No "Each child in a list should have a unique key" warnings                                                                        |        |           |
| SCH-A-902 | All pages | Check for hydration mismatch                                    | No "Hydration failed because the server rendered HTML didn't match" errors                                                         |        |           |
| SCH-A-903 | All pages | Check for "useState/useEffect outside component" errors         | Zero                                                                                                                               |        |           |

### 11.2 Network 4xx / 5xx audit

| #         | Page         | Action                                                         | Expected                                                                                             | Actual | Pass/Fail |
| --------- | ------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-910 | All pages    | DevTools Network filter for non-2xx responses                  | Only intentional 4xx (cross-tenant probe, validation tests, hostile-pair §11.6); zero unexpected 5xx |        |           |
| SCH-A-911 | All pages    | Verify error toast surfaces for every 4xx (not silent swallow) | Per CLAUDE.md error-handling rule: every catch must show toast or log to console                     |        |           |
| SCH-A-912 | Hub overview | Verify silent failures only on documented endpoints            | Hub overview is intentionally silent on error — no other endpoint should be silent                   |        |           |

### 11.3 RTL parity (Arabic)

| #         | Page         | Action                                                                                                           | Expected                                                                                                               | Actual | Pass/Fail |
| --------- | ------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-920 | All pages    | Switch language to Arabic via locale switcher                                                                    | All scheduling pages render with `dir="rtl"`; layout mirrors                                                           |        |           |
| SCH-A-921 | All pages    | Verify NO physical CSS classes (`ml-`, `mr-`, `pl-`, `pr-`, `text-left`, `text-right`) leaking into rendered DOM | Inspect via DevTools — zero violations. Inventory §8 already verified hub, my-timetable, runs, period-grid, print-room |        |           |
| SCH-A-922 | All pages    | Chevron / arrow icons rotate via `rtl:rotate-180`                                                                | All directional icons mirror                                                                                           |        |           |
| SCH-A-923 | All pages    | Numerals stay Western (0–9) and calendar stays Gregorian                                                         | Per CLAUDE.md i18n rule                                                                                                |        |           |
| SCH-A-924 | Translations | Spot-check 10 random keys from `scheduling.*` namespace                                                          | All present in both `messages/en.json` and `messages/ar.json` (inventory §5 verified 148 keys, no missing)             |        |           |

### 11.4 Dark mode parity

| #         | Page      | Action                                                    | Expected                                                                               | Actual | Pass/Fail |
| --------- | --------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-930 | All pages | Toggle dark mode (or `prefers-color-scheme: dark` via OS) | All pages render with dark surface tokens; text contrast WCAG AA met                   |        |           |
| SCH-A-931 | All pages | Verify no hardcoded hex colours in component output       | Inspect computed styles; all colour values come from `--color-*` CSS custom properties |        |           |
| SCH-A-932 | Charts    | Recharts elements (axes, grid, tooltip)                   | Use design tokens; no white tooltips on dark background                                |        |           |

### 11.5 Mobile (375 px)

| #         | Page               | Action                                                   | Expected                                                                                                                                | Actual | Pass/Fail |
| --------- | ------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-940 | All pages          | Resize viewport to 375 px × 812 px (iPhone SE / 12 mini) | No horizontal page scroll; all content fits                                                                                             |        |           |
| SCH-A-941 | Touch targets      | Verify all interactive elements ≥ 44 × 44 px             | Per CLAUDE.md mobile rule                                                                                                               |        |           |
| SCH-A-942 | Inputs             | Verify input font size ≥ 16 px to prevent iOS auto-zoom  | OBSERVATION: Inventory §8 found one violation on `/scheduling/availability` — time input uses `text-xs` (~12 px). Reproduce and confirm |        |           |
| SCH-A-943 | Tables / matrices  | All wide tables wrapped in `overflow-x-auto`             | Confirmed across period-grid, competencies, schedules, my-timetable per inventory                                                       |        |           |
| SCH-A-944 | Modals             | All modals fill viewport on mobile (full-screen)         | Verified for compose-style flows                                                                                                        |        |           |
| SCH-A-945 | Hub category tiles | Stack to single column at 375 px                         | Inventory §8 confirms `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`                                                                       |        |           |

### 11.3a Number and date formatting in AR

| #          | Page                                                           | Action       | Expected                                                                                 | Actual | Pass/Fail |
| ---------- | -------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-924a | Hub KPI tiles                                                  | Switch to AR | Numerals remain Western (0–9), per CLAUDE.md frontend rule                               |        |           |
| SCH-A-924b | Run created_at column                                          | Switch to AR | Dates use Gregorian calendar; format reads naturally in Arabic context                   |        |           |
| SCH-A-924c | Time inputs (period grid, availability)                        | AR locale    | Input remains LTR (`dir="ltr"` on time field) so colon-separated HH:mm renders correctly |        |           |
| SCH-A-924d | Phone numbers (if any in staff details linked from scheduling) | AR locale    | Force LTR per rule                                                                       |        |           |
| SCH-A-924e | Duration display (e.g. "15 min", "2h 30m")                     | AR locale    | Translates the unit suffix; numbers stay Western                                         |        |           |

### 11.4a Theme token audit (no hardcoded hex values)

| #          | File / area                                             | Action                                                                 | Expected                                                                                                         | Actual | Pass/Fail |
| ---------- | ------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-933a | All scheduling pages                                    | DevTools → inspect computed styles for any element with bespoke colour | Colour values resolve to `--color-*` CSS custom properties; no inline `#xxxxxx` strings on scheduling components |        |           |
| SCH-A-933b | Status badges (queued/running/completed/failed/applied) | Inspect class names                                                    | Use semantic tokens like `bg-status-queued`, `text-status-failed`, NOT raw colour utilities                      |        |           |
| SCH-A-933c | Run review timetable cells                              | Inspect `<td>` background colours                                      | Use design tokens; pinned cells visually distinct via token (`bg-pinned-subtle`)                                 |        |           |
| SCH-A-933d | Charts (Recharts) on `/scheduling/dashboard`            | Inspect chart-element colours                                          | Configured via theme tokens; legend/tooltip use foreground tokens                                                |        |           |
| SCH-A-933e | Toasts on scheduling actions                            | Trigger one of each variant                                            | Each variant uses semantic token (`success`, `destructive`, `warning`, `info`) — not hardcoded green/red         |        |           |

### 11.4b Loading & skeleton states

| #          | Page               | Action                   | Expected                                                                                 | Actual | Pass/Fail |
| ---------- | ------------------ | ------------------------ | ---------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-934a | Hub `/scheduling`  | Throttle network, reload | KPI tiles show skeleton shimmer; tile count is stable; no layout shift when data arrives |        |           |
| SCH-A-934b | Period grid        | Switch year group        | Grid shows skeleton rows during refetch                                                  |        |           |
| SCH-A-934c | Run review         | Polling running run      | Status badge animates (spinner); chart areas stable; no flicker                          |        |           |
| SCH-A-934d | Substitutions list | Search/filter change     | Rows skeleton during refetch; previous data does not flash empty                         |        |           |
| SCH-A-934e | All async modals   | Open and trigger submit  | Submit button shows spinner state and is `disabled` while pending                        |        |           |

### 11.5b Translation key audit (EN ↔ AR)

Spot-check that no string is hardcoded in JSX and that AR translations exist for every EN key in the scheduling namespace.

| #          | Page                                      | Action                                        | Expected                                                                                                                             | Actual | Pass/Fail |
| ---------- | ----------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-A-948a | `messages/en.json` and `messages/ar.json` | Diff scheduling namespace keys                | Every key in `scheduling.*` exists in both files; no orphan keys; no missing AR translations                                         |        |           |
| SCH-A-948b | Hub page `/en/scheduling`                 | Switch locale `en` → `ar` via locale switcher | All visible labels translate (no English bleed-through); KPI numbers remain Western numerals                                         |        |           |
| SCH-A-948c | Run review `/scheduling/runs/{id}/review` | Switch locale                                 | All section headers, badges (Queued/Running/Completed/Failed), buttons (Apply, Discard, Cancel), and diagnostic categories translate |        |           |
| SCH-A-948d | Substitution modal                        | Open modal in AR                              | Field labels, placeholders, validation messages, and substitute auto-suggest reasoning all in AR                                     |        |           |
| SCH-A-948e | Exam session modal                        | Open modal in AR                              | Status labels (planning/published), conflict warnings, room/invigilator pickers all in AR                                            |        |           |
| SCH-A-948f | Toast errors                              | Trigger a 4xx (e.g. invalid run)              | Toast message uses i18n key, not raw API `message` string; verify in AR                                                              |        |           |
| SCH-A-948g | Empty states                              | Empty list pages (e.g. no runs, no scenarios) | Use translated empty-state copy; not the English fallback                                                                            |        |           |

### 11.5b1 Locale-switch persistence

| #          | Page                                                                | Action                                                                              | Expected                                                                                             | Actual | Pass/Fail |
| ---------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-948u | Any scheduling page                                                 | Switch locale `en` → `ar` via locale switcher                                       | URL prefix updates from `/en/...` to `/ar/...`; cookie `NEXT_LOCALE` set; full page re-renders in AR |        |           |
| SCH-A-948v | After switch, navigate to a different scheduling page               | URL preserves `/ar/` prefix; no flicker back to EN                                  |                                                                                                      |        |
| SCH-A-948w | Open a new tab to `/scheduling/runs` (no locale prefix)             | Honours the cookie/preference and serves AR (or default EN) consistently            |                                                                                                      |        |
| SCH-A-948x | Switch locale during a long-running operation (e.g. solver running) | Polling continues; URL updates; result_json renders in new locale; no hung requests |                                                                                                      |        |

### 11.5c Accessibility (a11y) sampling

| #          | Page               | Action                                                 | Expected                                                                                          | Actual | Pass/Fail |
| ---------- | ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-948h | Hub page           | Tab through page with keyboard only                    | Focus order matches visual order; visible focus ring on every interactive element                 |        |           |
| SCH-A-948i | Period Grid editor | Use arrow keys / Enter / Esc inside the matrix         | Matrix supports keyboard nav; Esc closes any open editor; Enter confirms                          |        |           |
| SCH-A-948j | Auto page          | Run modal — keyboard-confirm                           | Enter confirms; Esc cancels; focus returns to **Run** button on close                             |        |           |
| SCH-A-948k | Run review         | Diagnostic panel                                       | Each diagnostic row reachable by keyboard; expandable details open on Enter/Space                 |        |           |
| SCH-A-948l | Substitution modal | Screen-reader labels                                   | All form controls have `<label>` or `aria-label`; modal has `role="dialog"` and `aria-labelledby` |        |           |
| SCH-A-948m | Toasts             | Trigger toast                                          | Has `role="status"` or `aria-live="polite"`; not "assertive" (would interrupt)                    |        |           |
| SCH-A-948n | Colour-only signal | Verify status badges (Queued/Running/Completed/Failed) | Convey state via icon/text in addition to colour                                                  |        |           |

### 11.5c1 Focus management on modals and drawers

| #           | Modal/Drawer                | Action              | Expected                                                                                             | Actual | Pass/Fail |
| ----------- | --------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-948y  | Run confirmation modal      | Open via Run button | Focus moves into modal; first focusable element receives focus; Tab cycles within modal (focus trap) |        |           |
| SCH-A-948z  | Substitution modal          | Open                | First field receives focus; Esc closes; focus returns to triggering button                           |        |           |
| SCH-A-948za | Compare-runs side drawer    | Open                | Drawer focus-trapped; clicking outside or pressing Esc closes                                        |        |           |
| SCH-A-948zb | Adjustment dialog           | Open from grid cell | Focus on first field; pre-filled values readable to screen reader                                    |        |           |
| SCH-A-948zc | After a destructive confirm | Close modal         | Focus returns to the row or button that triggered the action                                         |        |           |

### 11.5d Audit log coverage (mutations only)

The `AuditLogInterceptor` runs on mutating endpoints. Spot-check that scheduling actions appear in the platform audit log.

| #          | Page                 | Action                                                 | Expected                                                                               | Actual | Pass/Fail |
| ---------- | -------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-948o | Audit log (platform) | After applying a run, query log                        | Entry exists: action=`scheduling-run.apply`, user_id, tenant_id, run_id in `entity_id` |        |           |
| SCH-A-948p | Audit log            | After cancelling a run                                 | Entry: `scheduling-run.cancel`                                                         |        |           |
| SCH-A-948q | Audit log            | After creating a competency                            | Entry: `teacher-competency.create` with new row id                                     |        |           |
| SCH-A-948r | Audit log            | After publishing an exam session                       | Entry: `exam-session.publish`                                                          |        |           |
| SCH-A-948s | Audit log            | Read-only navigation (e.g. viewing `/scheduling/runs`) | NO audit log entry — reads are not audited                                             |        |           |
| SCH-A-948t | Audit log            | Failed mutation (e.g. 400 on schema violation)         | NO entry — failed actions are not audited (per AuditLogInterceptor behaviour)          |        |           |

### 11.5d1 Search and command palette

| #           | Page                            | Action                                                    | Expected                                                                 | Actual | Pass/Fail |
| ----------- | ------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ | ------ | --------- |
| SCH-A-948zd | Morph bar (any scheduling page) | Click search/command palette icon (or press `Cmd/Ctrl+K`) | Palette opens with placeholder text in active locale                     |        |           |
| SCH-A-948ze | Palette open                    | Type "subst"                                              | Suggests Substitutions page, Substitute Competencies, Substitution Board |        |           |
| SCH-A-948zf | Palette open                    | Type "run"                                                | Suggests Auto-scheduler, Runs list, current Run review                   |        |           |
| SCH-A-948zg | Palette open                    | Pick a result                                             | Navigates; palette closes; locale prefix preserved                       |        |           |
| SCH-A-948zh | Palette open in AR              | Type Arabic search                                        | Honours Arabic input; matches translated page titles                     |        |           |

### 11.5e Permission-denial sampling (negative tests across roles)

Sample a subset of endpoints with each non-admin role to ensure 403 is returned. Full matrix would be exhaustive — sample 1 endpoint per hub per non-admin role.

| #          | Role                                         | Action                                                    | Expected                                                         | Actual | Pass/Fail |
| ---------- | -------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- | ------ | --------- |
| SCH-A-949a | teacher                                      | `POST /api/v1/scheduling-runs`                            | 403 — lacks `schedule.run_auto`                                  |        |           |
| SCH-A-949b | teacher                                      | `POST /api/v1/scheduling/teacher-competencies`            | 403 — lacks `schedule.manage`                                    |        |           |
| SCH-A-949c | teacher                                      | `GET /api/v1/scheduling/timetable/my`                     | 200 — has `schedule.view_own`                                    |        |           |
| SCH-A-949d | teacher                                      | `POST /api/v1/scheduling/absences` (own)                  | 200 — has `schedule.report_own_absence`                          |        |           |
| SCH-A-949e | teacher                                      | `POST /api/v1/scheduling/offers/{id}/respond` (own offer) | 200 — has `schedule.respond_to_offer`                            |        |           |
| SCH-A-949f | teacher                                      | `POST /api/v1/scheduling/exam-sessions`                   | 403 — lacks `schedule.manage_exams`                              |        |           |
| SCH-A-949g | parent                                       | `GET /api/v1/scheduling/timetable/class/{id}`             | 200 only if their child is enrolled in that class; 403 otherwise |        |           |
| SCH-A-949h | parent                                       | `POST /api/v1/scheduling-runs`                            | 403                                                              |        |           |
| SCH-A-949i | student                                      | `GET /api/v1/timetables/student/me`                       | 200                                                              |        |           |
| SCH-A-949j | student                                      | `POST /api/v1/scheduling/teacher-config`                  | 403                                                              |        |           |
| SCH-A-949k | school_admin (if distinct from school_owner) | `POST /api/v1/scheduling-runs`                            | 200 — has `schedule.run_auto`                                    |        |           |
| SCH-A-949l | accountant                                   | All scheduling endpoints                                  | 403 across the board                                             |        |           |

### 11.5e1 Browser back/forward navigation

| #           | Page                                                   | Action                                                                                         | Expected                                                                                   | Actual | Pass/Fail |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-A-949za | `/scheduling/runs` → `/scheduling/runs/{id}/review`    | Click row, then browser Back                                                                   | Returns to runs list with prior scroll position; selected filters preserved (URL or state) |        |           |
| SCH-A-949zb | Run review → Apply, redirected to runs list, then Back | Either navigates back to a now-applied run review OR (preferred) skips the consumed apply step |                                                                                            |        |
| SCH-A-949zc | Hub → category page → Back → Forward                   | Round-trip preserves scroll and any in-flight state without re-fetch storms                    |                                                                                            |        |
| SCH-A-949zd | Compare runs page with `?a=&b=` params                 | Back to runs list, Forward returns                                                             | Picker selections rehydrated from URL params                                               |        |           |

### 11.5f API contract — response shape stability

The frontend depends on stable API response shapes. Spot-check that key endpoints conform to documented contracts.

| #          | Endpoint                                        | Expected shape                                                                                                                                                                                                                                                                               | Pass/Fail |
| ---------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| SCH-A-949m | `GET /v1/scheduling-runs`                       | `{ data: SchedulingRun[], meta: { page, pageSize, total } }`; each `SchedulingRun` has `id, status, mode, created_at, created_by_user_id, hard_constraint_violations, soft_preference_score, soft_preference_max, entries_generated, entries_pinned, entries_unassigned, solver_duration_ms` |           |
| SCH-A-949n | `GET /v1/scheduling-runs/{id}`                  | Single object including `config_snapshot` (JSONB) and `result_json` (JSONB when completed)                                                                                                                                                                                                   |           |
| SCH-A-949o | `GET /v1/scheduling-runs/{id}/progress`         | `{ status, phase, elapsed_ms, percent? }` — small payload designed for polling                                                                                                                                                                                                               |           |
| SCH-A-949p | `GET /v1/scheduling-runs/{id}/diagnostics`      | `{ violations: [{ category, severity, message, recommendations[] }], summary: {...} }`                                                                                                                                                                                                       |           |
| SCH-A-949q | `GET /v1/scheduling/prerequisites`              | `{ checks: [{ name, passed, reason? }], all_passed: boolean }`                                                                                                                                                                                                                               |           |
| SCH-A-949r | `GET /v1/scheduling-runs/feasibility`           | `{ checks: [{ name, status: 'pass'\|'warn'\|'fail', message, recommendation? }], placement_likelihood_pct: number }`                                                                                                                                                                         |           |
| SCH-A-949s | `POST /v1/scheduling-runs` (success)            | 201 with `{ id, status: 'queued', enqueued_at }`                                                                                                                                                                                                                                             |           |
| SCH-A-949t | `POST /v1/scheduling-runs` (active run exists)  | 409 with `{ code: 'RUN_ALREADY_ACTIVE', message }`                                                                                                                                                                                                                                           |           |
| SCH-A-949u | `POST /v1/scheduling-runs/{id}/apply` (success) | 200 with `{ id, status: 'applied', applied_at, applied_by_user_id }`                                                                                                                                                                                                                         |           |
| SCH-A-949v | `POST /v1/scheduling-runs/{id}/apply` (stale)   | 409 with `{ code: 'RUN_STALE', expected_updated_at, actual_updated_at }`                                                                                                                                                                                                                     |           |
| SCH-A-949w | `GET /v1/scheduling/timetable/my`               | `{ schedules: Schedule[], cover_duties: CoverDuty[], week_start, week_end }`                                                                                                                                                                                                                 |           |
| SCH-A-949x | `GET /v1/calendar/{tenantId}/{token}.ics`       | `Content-Type: text/calendar; charset=utf-8`; body starts with `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:...`                                                                                                                                                                                |           |
| SCH-A-949y | All error responses                             | `{ error: { code: 'UPPER_SNAKE_CASE', message: string, details?: object } }` per backend convention                                                                                                                                                                                          |           |
| SCH-A-949z | All paginated endpoints                         | Honour `?pageSize` up to 100; `pageSize=101` either capped at 100 or returns 400                                                                                                                                                                                                             |           |

### 11.6 Multi-tenant RLS hostile-pair assertions

Execute each at least once as `nhqs` school_owner with a valid `stress-a` UUID stolen from the stress-a tenant database:

| #         | Action                                                                                                       | Expected                                                                                                                                                         | Actual | Pass/Fail |
| --------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-950 | Navigate to `/en/scheduling/runs/{stress-a_run_id}/review`                                                   | 404 page or redirect to `/scheduling/runs`; never 200 with stress-a data visible                                                                                 |        |           |
| SCH-A-951 | DevTools fetch: `GET /api/v1/scheduling-runs/{stress-a_run_id}`                                              | 404 response                                                                                                                                                     |        |           |
| SCH-A-952 | DevTools fetch: `GET /api/v1/scheduling/exam-sessions/{stress-a_session_id}`                                 | 404 response                                                                                                                                                     |        |           |
| SCH-A-953 | DevTools fetch: `GET /api/v1/scheduling/scenarios/{stress-a_scenario_id}`                                    | 404 response                                                                                                                                                     |        |           |
| SCH-A-954 | DevTools fetch: `POST /api/v1/scheduling/teacher-competencies` with `staff_profile_id` belonging to stress-a | 400/404; never 201                                                                                                                                               |        |           |
| SCH-A-955 | DevTools fetch: `POST /api/v1/scheduling-runs` with `academic_year_id` belonging to stress-a                 | 400/404; never 201; certainly never enqueues solver job for nhqs tenant against stress-a year                                                                    |        |           |
| SCH-A-956 | DevTools fetch: `GET /api/v1/scheduling/break-groups?academic_year_id={stress-a_year_id}`                    | 200 with `[]` (empty); RLS scopes the query                                                                                                                      |        |           |
| SCH-A-957 | DevTools fetch: `GET /api/v1/staff-profiles?pageSize=200` while logged into nhqs                             | Response excludes Stress-A Teacher; visual scan confirms only nhqs staff                                                                                         |        |           |
| SCH-A-958 | Public iCal `GET /v1/calendar/{stress-a_tenant_id}/{stress-a_token}.ics` (no auth)                           | 200 with stress-a calendar (token is the auth); using a `nhqs` token against a `stress-a` tenant ID returns 404                                                  |        |           |
| SCH-A-959 | Public iCal `GET /v1/calendar/{nhqs_tenant_id}/{stress-a_token}.ics`                                         | 404 (token not in this tenant)                                                                                                                                   |        |           |
| SCH-A-960 | Substitution Board cross-host                                                                                | Loading `https://stress-a.edupod.app/en/scheduling/substitution-board` shows only stress-a data; switching to `https://nhqs.edupod.app/...` shows only nhqs data |        |           |

### 11.7 Data invariants

Spot-checked via DB read or via UI math after each major flow. Full SQL invariant suite lives in the integration spec.

| #         | Invariant                                                                                                         | Verify                                                                                                                                 | Pass/Fail |
| --------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| SCH-A-970 | After applying a run: `count(schedules where scheduling_run_id = X) == result_json.entries_generated`             | DB read, or count cells in ScheduleGrid                                                                                                |           |
| SCH-A-971 | Pinned entries always survive a new auto-run                                                                      | Pin 3 entries; trigger new run; verify those entries appear unchanged in result_json                                                   |           |
| SCH-A-972 | Total scheduled minutes per (year_group, subject) ≥ curriculum requirement min_periods_per_week × period_duration | After apply, sum schedule minutes per subject per year group; compare to curriculum_requirement                                        |           |
| SCH-A-973 | Total scheduled minutes per (year_group, subject) ≤ requirement max (where set)                                   | Same comparison                                                                                                                        |           |
| SCH-A-974 | No teacher double-booked: for any (teacher, weekday, period_order), count(schedules) ≤ 1                          | DB query or visual scan of teacher timetables                                                                                          |           |
| SCH-A-975 | No room double-booked: for any (room, weekday, period_order), count(schedules) ≤ 1                                | DB query                                                                                                                               |           |
| SCH-A-976 | No class double-booked                                                                                            | DB query                                                                                                                               |           |
| SCH-A-977 | Only one queued/running run per academic_year per tenant                                                          | Try to trigger a second run while one is queued — must 409                                                                             |           |
| SCH-A-978 | Substitution offer revocation: cancelling an absence revokes all pending offers for that absence                  | Verify via `GET /api/v1/scheduling/offers/my` for affected staff before/after cancel                                                   |           |
| SCH-A-979 | Exam session lifecycle: planning → published; cannot revert to planning without explicit unpublish flow           | Try to PATCH a published session — must reject                                                                                         |           |
| SCH-A-980 | Substitute auto-suggest never returns a suggestion that conflicts with the substitute's own existing schedule     | Pick an absent teacher; for each suggested substitute verify (substitute, weekday, period_order) does not already exist in `schedules` |           |
| SCH-A-981 | A scenario with `is_active=false` is excluded from the next solver run unless explicitly selected                 | Create active and inactive scenarios; trigger run; verify only active scenario constraints applied                                     |           |
| SCH-A-982 | Cover fairness counter increments by 1 per accepted offer; never by 0 or 2                                        | Accept an offer; check `cover_count_30d` for that teacher delta = 1                                                                    |           |
| SCH-A-983 | A pinned entry that becomes infeasible after a curriculum change surfaces a warning before next run               | Pin entry; remove the period from the day template; trigger run; verify pre-run validation flags it                                    |           |
| SCH-A-984 | Calendar token last_used_at monotonically increases                                                               | Hit `.ics` URL twice with delay; second timestamp ≥ first                                                                              |           |
| SCH-A-985 | `entries_pinned + entries_generated + entries_unassigned = total_required_entries` (derived from curriculum)      | Sum after a completed run; verify equation holds                                                                                       |           |

### 11.6a iCalendar token edge cases

| #          | Action                                                       | Expected                                                                | Pass/Fail |
| ---------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- | --------- |
| SCH-A-960a | Fetch `.ics` URL with truncated token (last char dropped)    | 404; never partial-match a valid token                                  |           |
| SCH-A-960b | Fetch with extra path segments after token                   | 404                                                                     |           |
| SCH-A-960c | Fetch revoked token                                          | 404                                                                     |           |
| SCH-A-960d | Fetch expired token (past `expires_at`)                      | 404                                                                     |           |
| SCH-A-960e | Fetch `.ics` for tenant whose subscription was suspended     | Gracefully empty calendar OR 404 — verify and document                  |           |
| SCH-A-960f | Fetch with `Accept: text/html` header                        | Still returns `text/calendar` (server ignores Accept for this endpoint) |           |
| SCH-A-960g | Fetch with conditional request headers (`If-Modified-Since`) | Either honoured (returns 304) or ignored — document behaviour           |           |

### 11.7a Failure modes and recovery

| #          | Scenario                                                                  | Expected behaviour                                                                                                                  | Pass/Fail |
| ---------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| SCH-A-985a | API down (connection refused) during page load                            | Page shows error toast "Unable to reach server"; no console errors beyond the network error; loaders eventually time out gracefully |           |
| SCH-A-985b | API returns 500 during run trigger                                        | Toast surfaces server error; UI does not enter inconsistent state; refresh restores known-good state                                |           |
| SCH-A-985c | Solver sidecar down when run dispatched                                   | Worker catches; run row marked failed with a clear failure_reason; admin can retry                                                  |           |
| SCH-A-985d | Worker offline when run enqueued                                          | Job sits in queue (status `queued`); no UI lie about progress; admin can cancel queued run                                          |           |
| SCH-A-985e | Redis connection drop mid-session                                         | API requests using cache may degrade; refreshes gracefully                                                                          |           |
| SCH-A-985f | Database connection pool exhausted                                        | API returns 503 with retry advice; UI surfaces toast                                                                                |           |
| SCH-A-985g | Auth token expires during long page session                               | Refresh token kicks in transparently; or user is bounced to login with return URL preserved                                         |           |
| SCH-A-985h | Stale browser tab (left open overnight) on `/scheduling/runs/{id}/review` | Polling gracefully handles auth expiry; no infinite loops or memory leaks                                                           |           |

### 11.8 Idempotency and concurrency

The scheduling module has several concurrency-sensitive flows. Spot-check that double-submission and race conditions are handled.

| #         | Page                           | Action                                                                           | Expected                                                                                                                 | Actual | Pass/Fail |
| --------- | ------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-A-986 | `/scheduling/auto`             | Click **Run** rapidly twice (within 100ms)                                       | Only one `POST /api/v1/scheduling-runs` request; the second is debounced or returns 409 (active run exists)              |        |           |
| SCH-A-987 | `/scheduling/runs/{id}/review` | Click **Apply** twice rapidly                                                    | Only one apply takes effect; second click either disabled, debounced, or 409                                             |        |           |
| SCH-A-988 | Two browser tabs as same admin | Tab A clicks Apply on run X; Tab B clicks Apply on different run Y for same year | Whichever lands first wins; second returns 409 ("Another run already applied for this year")                             |        |           |
| SCH-A-989 | Two browser tabs               | Tab A creates a substitution offer for absence X; Tab B accepts it               | Tab B's accept resolves; Tab A sees status update on next poll                                                           |        |           |
| SCH-A-990 | Substitution offer             | Substitute clicks Accept after offer was already revoked/cancelled by admin      | 409 with translated message "Offer no longer available"                                                                  |        |           |
| SCH-A-991 | Bulk competency import         | Click **Import** twice on the same CSV file                                      | Idempotency: either second click is blocked, or backend deduplicates based on (teacher_id, subject_id) unique constraint |        |           |
| SCH-A-992 | Run claim race                 | Two worker instances claim same job (manual race test)                           | Only one worker successfully transitions queued→running (atomic updateMany); the other no-ops cleanly                    |        |           |

### 11.8a Toast and notification UX consistency

| #          | Trigger                             | Expected toast                                                                                                          | Pass/Fail |
| ---------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| SCH-A-992a | Successful create (any resource)    | Green toast with translated success copy; auto-dismiss after ~4s                                                        |           |
| SCH-A-992b | Successful delete                   | Green toast; if irreversible, copy mentions deletion                                                                    |           |
| SCH-A-992c | Validation error (400)              | Red/destructive toast with field-level message OR inline form errors with no toast (verify which is product convention) |           |
| SCH-A-992d | Permission denied (403)             | Red toast: "You do not have permission to perform this action" (or translated equivalent)                               |           |
| SCH-A-992e | Conflict (409)                      | Red toast with the specific code's translated message                                                                   |           |
| SCH-A-992f | Server error (5xx)                  | Red toast: "Something went wrong" with optional Sentry trace ID                                                         |           |
| SCH-A-992g | Multiple toasts in quick succession | Stack vertically; do NOT cover each other; max 3 visible (older auto-dismiss)                                           |           |
| SCH-A-992h | RTL: toasts position correctly      | Toasts anchor to opposite side in AR (start vs. end); slide direction mirrors                                           |           |

### 11.9 Print, export, and download artefacts

| #         | Page                    | Action                           | Expected                                                                                            | Actual | Pass/Fail |
| --------- | ----------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-A-993 | `/timetables` (any tab) | Click **Print**                  | Opens `/(print)/timetables/...` route in new tab; print dialog auto-opens                           |        |           |
| SCH-A-994 | Run review              | Export run as PDF (if available) | Download triggers; PDF mirrors on-screen grid; AR locale produces RTL PDF                           |        |           |
| SCH-A-995 | Cover reports           | Export CSV                       | Download triggers; columns match table; numeric columns parsed cleanly by Excel/Sheets              |        |           |
| SCH-A-996 | Workload report         | Export CSV                       | Same as 995                                                                                         |        |           |
| SCH-A-997 | Calendar `.ics`         | Download for class               | File parses in Apple Calendar / Google Calendar; events have correct DTSTART/DTEND/SUMMARY/LOCATION |        |           |
| SCH-A-998 | Print room timetable    | Verify @page CSS                 | Page size A4 portrait; margins do not clip content                                                  |        |           |

---

## 12. Observations and Bugs Spotted

Flag-only — do NOT fix in this spec. Each observation references the inventory section that surfaced it.

| ID      | Severity      | Where surfaced                                                               | Observation                                                                                                                                                                                                                                                                         | Recommended action                                                                                                         |
| ------- | ------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| OBS-001 | Medium        | Frontend inventory §8                                                        | `/scheduling/availability` time input uses `className="h-7 w-28 text-xs"` (~12 px) — fails the 16 px minimum mobile rule, will cause iOS Safari auto-zoom on focus. Reproduce on iPhone SE viewport.                                                                                | Bump to `text-base` and increase the input height; add to bug log                                                          |
| OBS-002 | Low           | Frontend inventory §6 + observation in §7.1 of this spec                     | The substitution modal, exam session modal, and scenario modal are hand-rolled (`/* eslint-disable school/no-hand-rolled-forms — HR-025 */`). New forms should follow Zod + react-hook-form per CLAUDE.md "Forms — Hard Rule".                                                      | Schedule HR-025 migration                                                                                                  |
| OBS-003 | Low           | Frontend inventory §7                                                        | `/scheduling/leave-requests` is an admin tool but the URL pattern (`/scheduling/<noun>`) suggests self-service. Causes confusion for testers and non-admin users navigating directly.                                                                                               | Rename route to `/scheduling/admin/leave-requests` or move under `/operations/leave-approvals`                             |
| OBS-004 | Medium        | Backend inventory §1 (SchedulingPublicController)                            | Public iCalendar endpoint `GET /v1/calendar/:tenantId/:token.ics` has no rate limit explicitly noted. Token-based auth is sound but a leaked token + scraping could DoS.                                                                                                            | Verify there is request-rate throttling per token; add to perf/security backlog                                            |
| OBS-005 | Low           | Backend inventory §7 (Unusual Patterns)                                      | `SchedulingEnhancedController` is 766 LOC — covers absences, offers, swaps, rotation, exams, scenarios, analytics. High blast radius for any change.                                                                                                                                | Plan controller split for next refactor cycle                                                                              |
| OBS-006 | Medium        | Backend §5 (state machine) — SCHED-027                                       | A "running" run cannot be cooperatively interrupted; cancel only flags it. UI surfaces "Cancellation pending" but if solver completes, the apply path may remain available against operator expectation.                                                                            | Verify exact UI behaviour in 10.4 above and document; consider adding an explicit "cancelled-but-completed" terminal state |
| OBS-007 | Low           | Backend §1 (SchedulingEnhancedController + SchedulerOrchestrationController) | Two parallel run-control endpoint families: `/v1/scheduling/runs/...` AND `/v1/scheduling-runs/...`. Frontend uses the latter; the former exists too.                                                                                                                               | Consolidate or document deprecation                                                                                        |
| OBS-008 | Low           | Frontend §1 (timetable controllers)                                          | Two parallel timetable read paths: `/v1/scheduling/timetable/{teacher/my/class}` AND `/v1/timetables/{teacher/class/room/student}`. Slightly different shapes.                                                                                                                      | Consolidate into one canonical read path                                                                                   |
| OBS-009 | Low           | Backend §1 (TeacherCompetenciesController)                                   | `POST /v1/scheduling/teacher-competencies/bulk` and `/copy-to-years` allow up to 500 / 50 entries — verify UI prevents over-submission rather than relying on backend reject                                                                                                        | Add client-side guard in the bulk dialog                                                                                   |
| OBS-010 | Informational | Hub frontend §2                                                              | Hub uses dashboard-of-tiles instead of contextual sub-strip. Frontend rule §3a (redesign spec) explicitly allows this — not a violation, but the back-link from sub-pages must always be present (verify in §3.5 above).                                                            | None — informational for testers                                                                                           |
| OBS-011 | Medium        | Spec §10.5 stale-reaper                                                      | Stale-reaper writes failure_reason "Reaped — exceeded duration". If a real failure happens just before the reaper window, the operator sees an ambiguous reason (was the solver actually stuck, or did the worker crash?).                                                          | Add distinct reasons: `worker_crash`, `reaped_timeout`, `cooperative_cancel`                                               |
| OBS-012 | Low           | Spec §3.5b KPI accuracy                                                      | "Total slots" KPI may include archived/discarded entries depending on the dashboard query. If so, the count diverges from "live" timetable cell count. Verify and document.                                                                                                         | Either filter out non-active entries in the KPI query or rename the tile to clarify scope                                  |
| OBS-013 | Low           | Spec §11.8 idempotency                                                       | Frontend may not debounce the **Run** click reliably under high latency — a fast double-click could cause two POSTs that both pre-check empty and race. Backend's RUN_ALREADY_ACTIVE 409 saves us, but a debounce + disable on first click is cleaner UX.                           | Add `disabled={isPending}` to the Run button on click                                                                      |
| OBS-014 | Informational | Spec §9.6 compare runs                                                       | The compare-runs page assumes both runs share the same academic_year. Cross-year comparisons are nonsensical. Verify the picker UI prevents selecting runs from different years (or at least warns).                                                                                | Add picker filter                                                                                                          |
| OBS-015 | Low           | Spec §10.6a stuck-job                                                        | If `lockDuration` (300s) is shorter than a legitimate long-running solve at high tenant scale, BullMQ may consider the job stalled and re-dispatch it before the first worker truly finishes. Race risk on the conditional updateMany guard, but a wasted compute cycle either way. | Tune lockDuration based on observed P99 solver duration in production                                                      |

---

## 13. Sign-off

### Tester checklist

Before closing the run, the tester confirms:

- [ ] All 30+ pages loaded without console errors (§11.1)
- [ ] Network audit: no unexpected 5xx; every 4xx surfaced an error toast or was an intentional probe (§11.2)
- [ ] RTL parity verified on at least 8 sampled pages (§11.3)
- [ ] Dark mode parity verified on at least 6 sampled pages (§11.4)
- [ ] Mobile (375 px) parity verified on at least 8 sampled pages (§11.5); OBS-001 reproduced and logged
- [ ] Hostile-pair assertions executed and all failed-as-expected (§11.6, SCH-A-950 → SCH-A-960)
- [ ] Solver run lifecycle exercised end-to-end at least once (§10.1 happy path; §10.2 failure path; §10.3 cancel-queued; §10.6 discard)
- [ ] Permission-denial paths sampled at least once per hub (§4–§9)
- [ ] Data invariants 970–977 spot-checked (§11.7)

### Sign-off block

| Role                          | Name | Date | Result      | Notes |
| ----------------------------- | ---- | ---- | ----------- | ----- |
| QC engineer (admin shell)     |      |      | PASS / FAIL |       |
| Product owner (Scheduling)    |      |      | PASS / FAIL |       |
| Engineering lead (Scheduling) |      |      | PASS / FAIL |       |
| Release manager               |      |      | PASS / FAIL |       |

### Defect-log linkage

Each FAIL row in the test tables MUST be cross-referenced to a tracked issue:

- File the bug in the project's issue tracker with the test ID (e.g. `SCH-A-451`) in the title
- Attach the row's "Actual" column verbatim
- Tag with `module:scheduling`, `severity:{low|medium|high|critical}`, and `e2e-admin-spec`
- For OBS-001 through OBS-015, link the observation as supporting evidence

A spec session is NOT closeable while critical/high defects remain unfiled.

### Re-run policy

If any FAIL is found:

1. Engineering fixes the underlying issue and lands a code change
2. The specific failing row(s) are re-executed (not the whole spec)
3. If the fix touched a cross-cutting area (e.g. RTL utility, auth wiring, RLS middleware), the relevant cross-cutting subsection (§11.3, §11.6) is re-executed in full
4. Sign-off is updated with date of re-run and tester initials

### Pre-launch gate

Per CLAUDE.md `pre-launch-tracking`, this spec MUST be signed off PASS before the Scheduling module ships to a tenant. A FAIL on any row in §11.6 (hostile-pair) is an automatic block on launch — no exceptions.

---

**Spec version:** 1.0
**Generated:** 2026-04-17
**Source inventories:** `.inventory-backend.md`, `.inventory-frontend.md`, `.inventory-worker.md`
**Reference template:** `E2E/5_operations/communications/admin_view/communications-e2e-spec.md`

---

## Appendix Z — Translation key map (scheduling namespace)

Spot-check coverage. For each EN key the AR file MUST have a parallel entry. The full set is exhaustive — sample these per execution.

| Key path                                    | EN sample                                    | AR sample                                           | Used on                   |
| ------------------------------------------- | -------------------------------------------- | --------------------------------------------------- | ------------------------- |
| `scheduling.hub.title`                      | "Scheduling"                                 | "الجدولة"                                           | Hub header                |
| `scheduling.hub.kpis.totalSlots`            | "Total slots"                                | "إجمالي الفترات"                                    | Hub KPI                   |
| `scheduling.hub.kpis.completionPct`         | "Completion"                                 | "نسبة الإنجاز"                                      | Hub KPI                   |
| `scheduling.hub.quickActions.runAuto`       | "Run auto-scheduler"                         | "تشغيل الجدولة الآلية"                              | Hub quick action          |
| `scheduling.hub.categories.structure`       | "Structure"                                  | "البنية"                                            | Hub tile category         |
| `scheduling.hub.categories.staff`           | "Staff"                                      | "الكادر"                                            | Hub tile category         |
| `scheduling.auto.autoScheduler`             | "Auto-scheduler"                             | "الجدولة الآلية"                                    | Page title                |
| `scheduling.auto.prereq.allMet`             | "All prerequisites met"                      | "تم استيفاء جميع المتطلبات"                         | Auto page                 |
| `scheduling.auto.runButton`                 | "Run"                                        | "تشغيل"                                             | Auto page                 |
| `scheduling.runs.status.queued`             | "Queued"                                     | "في الانتظار"                                       | Runs list, run review     |
| `scheduling.runs.status.running`            | "Running"                                    | "قيد التشغيل"                                       | Runs list, run review     |
| `scheduling.runs.status.completed`          | "Completed"                                  | "مكتمل"                                             | Runs list, run review     |
| `scheduling.runs.status.failed`             | "Failed"                                     | "فشل"                                               | Runs list, run review     |
| `scheduling.runs.status.applied`            | "Applied"                                    | "مُطبَّق"                                           | Runs list, run review     |
| `scheduling.runs.applyConfirm.title`        | "Apply this run?"                            | "تطبيق هذا التشغيل؟"                                | Apply modal               |
| `scheduling.runs.applyConfirm.warning`      | "This will overwrite the live timetable."    | "سيتم استبدال الجدول الحالي."                       | Apply modal               |
| `scheduling.substitutions.reportAbsence`    | "Report absence"                             | "تسجيل غياب"                                        | Substitutions page        |
| `scheduling.substitutions.findSubstitute`   | "Find substitute"                            | "البحث عن بديل"                                     | Substitutions page        |
| `scheduling.exams.publish`                  | "Publish"                                    | "نشر"                                               | Exam session card         |
| `scheduling.exams.session.status.planning`  | "Planning"                                   | "قيد التخطيط"                                       | Exam session badge        |
| `scheduling.exams.session.status.published` | "Published"                                  | "منشور"                                             | Exam session badge        |
| `scheduling.errors.runAlreadyActive`        | "A run is already in progress."              | "يوجد تشغيل قيد التنفيذ."                           | Toast on POST 409         |
| `scheduling.errors.staleRun`                | "Run was modified by someone else — reload." | "تم تعديل التشغيل من قبل مستخدم آخر — أعد التحميل." | Toast on PATCH 409        |
| `scheduling.errors.cannotApplyFailed`       | "Cannot apply a failed run."                 | "لا يمكن تطبيق تشغيل فاشل."                         | Toast on disallowed apply |

Spot-check rule: at least 5 of the above keys must be visually verified per locale per session.

---

## Appendix A — Solver Run Lifecycle Diagram

```
                       ┌─────────┐
   POST /scheduling-runs│ queued  │
   ────────────────────▶│         │──────cancel──────┐
                       └────┬────┘                   │
                            │                        ▼
                worker      │                ┌──────────────┐
                claims      │                │ failed       │
                (atomic)    │                │ (cancelled)  │
                            ▼                └──────────────┘
                       ┌─────────┐
                       │ running │
                       │         │──────crash/timeout─────┐
                       └────┬────┘                        ▼
                            │                       ┌──────────────┐
                  solver    │                       │ failed       │
                  completes │                       │ (reaped)     │
                            ▼                       └──────────────┘
                       ┌─────────┐
                       │completed│
                       │         │──discard──┐
                       └────┬────┘           ▼
                            │           ┌──────────┐
                            │           │ discarded│
                            │           └──────────┘
                            │
                  POST /apply
                            ▼
                       ┌─────────┐
                       │ applied │
                       │ (term.) │
                       └─────────┘
```

Terminal states: `failed`, `discarded`, `applied`. Once terminal, no further transitions allowed.

---

## Appendix B — Substitution Cascade State Diagram

```
         absence reported
                │
                ▼
        ┌──────────────┐
        │ absence:     │
        │ pending      │
        └──────┬───────┘
               │
               │ requires_substitute = true
               ▼
        ┌──────────────────┐
        │ Tier 1 offers    │
        │ (status=pending) │──── all timeout / decline ────┐
        └──────┬───────────┘                                │
               │                                            ▼
               │ accepted                          ┌──────────────────┐
               ▼                                   │ Tier 2 offers    │
        ┌──────────────────┐                       │ (status=pending) │
        │ SubstitutionRec  │                       └────────┬─────────┘
        │ (status=         │                                │
        │  confirmed)      │                                │ accepted
        │ absence →        │                                ▼
        │  confirmed       │                       ┌──────────────────┐
        └────┬─────────────┘                       │ confirmed (...)  │
             │                                     └──────────────────┘
             │ absence date passes
             ▼
      ┌──────────────────┐
      │ completed        │
      └──────────────────┘
```

If admin cancels absence at any point: all pending offers → `revoked`; confirmed substitution → `revoked`.

---

## Appendix C — Permission-to-Endpoint Matrix (Quick Lookup)

| Permission                        | Endpoints requiring it                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schedule.manage`                 | All scheduling CRUD: period-grid, break-groups, room-closures, competencies, teacher-config, scheduling preferences (others), schedules CRUD, calendar tokens admin            |
| `schedule.run_auto`               | `POST /v1/scheduling-runs`, `POST /v1/scheduling-runs/{id}/cancel`                                                                                                             |
| `schedule.apply_auto`             | `POST /v1/scheduling-runs/{id}/apply`, `POST /v1/scheduling-runs/{id}/discard`, `PATCH /v1/scheduling-runs/{id}/adjustments`                                                   |
| `schedule.view_auto_reports`      | `GET /v1/scheduling-runs`, `GET /v1/scheduling-runs/{id}`, `GET /v1/scheduling-runs/{id}/diagnostics`, `GET /v1/scheduling-runs/{id}/progress`, scheduling-dashboard endpoints |
| `schedule.configure_requirements` | curriculum-requirements, class-scheduling-requirements, class-subject-requirements                                                                                             |
| `schedule.configure_availability` | staff-availability, teacher-config, staff-scheduling-preferences (own = always allowed)                                                                                        |
| `schedule.pin_entries`            | `POST /v1/schedules/{id}/pin`, `/unpin`, `/bulk-pin`                                                                                                                           |
| `schedule.manage_substitutions`   | absences (admin actions), offers (admin actions), substitutions, swaps, emergency-change                                                                                       |
| `schedule.report_own_absence`     | `POST /v1/scheduling/absences/self-report`, `/cancel-own`                                                                                                                      |
| `schedule.respond_to_offer`       | `POST /v1/scheduling/offers/{id}/respond`                                                                                                                                      |
| `schedule.view_reports`           | reports/workload, cover-reports, timetables (cross-module)                                                                                                                     |
| `schedule.view_own`               | `GET /v1/scheduling/timetable/my`, `GET /v1/timetables/me`                                                                                                                     |
| `schedule.view_own_satisfaction`  | `GET /v1/scheduling/satisfaction/my`                                                                                                                                           |
| `schedule.manage_exams`           | exam-sessions and slots CRUD, generate, assign-invigilators, publish                                                                                                           |
| `schedule.manage_scenarios`       | scenarios CRUD, solve, compare; what-if endpoints                                                                                                                              |

---

## Appendix D — Inventory Source Reference

| Spec section         | Backend inventory §                                                                              | Frontend inventory §                                                                                                          | Worker inventory §                          |
| -------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| §1 Endpoint map      | §1 (controllers)                                                                                 | §3 (API call mapping)                                                                                                         | —                                           |
| §2 Permission matrix | §2 (permission catalog)                                                                          | §5 (RBAC visibility)                                                                                                          | —                                           |
| §3 Hub               | —                                                                                                | §1, §2 (hub)                                                                                                                  | —                                           |
| §4 Structure         | §1 (period-grid, curriculum, break-groups, room-closures controllers)                            | §1, §2 (Structure tiles)                                                                                                      | —                                           |
| §5 Staff             | §1 (TeacherCompetencies, SubstituteCompetencies, TeacherSchedulingConfig)                        | §1, §2 (Staff tiles), §6 (PinMatrix/PoolMatrix)                                                                               | —                                           |
| §6 Inputs            | §1 (StaffAvailability, StaffSchedulingPreferences)                                               | §1, §2 (Inputs tiles), §8 (text-xs OBS-001)                                                                                   | —                                           |
| §7 Generate          | §1 (SchedulingRuns, SchedulerOrchestration), §3 (Zod), §5 (state machine)                        | §1, §2 (Generate tiles), §6 (ScheduleGrid, PinToggle, HealthScore)                                                            | §2 (SCHEDULING_SOLVE_V2_JOB)                |
| §8 Operations        | §1 (SchedulingEnhanced — absences, offers, swaps, exams), §5 (state machines)                    | §1, §2 (Operations tiles), §6 (substitution-board)                                                                            | §6 (cover notifications)                    |
| §9 Analytics         | §1 (SchedulingDashboard, SchedulingPublic — calendar)                                            | §1, §2 (Analytics tiles), §3 (timetables, schedules)                                                                          | §3 (cron)                                   |
| §10 Lifecycle        | §5 (state machine)                                                                               | §6 (run review)                                                                                                               | §2, §5, §7 (solver lifecycle, retries, DLQ) |
| §11 Cross-cutting    | §6 (RLS), §7 (unusual patterns)                                                                  | §8 (RTL, mobile, dark mode)                                                                                                   | §8 (solver sidecar)                         |
| §12 Observations     | OBS-002 (SCHED-027), OBS-005 (controller size), OBS-007 (parallel routes), OBS-009 (bulk limits) | OBS-001 (text-xs), OBS-002 (HR-025), OBS-003 (leave-requests path), OBS-008 (parallel timetable paths), OBS-010 (hub pattern) | OBS-011 (reaper reason ambiguity)           |
