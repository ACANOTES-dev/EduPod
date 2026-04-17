# Integration Test Specification: Scheduling Module

> **Leg 2 of the `/e2e-full` release-readiness pack for Scheduling.** This spec exercises everything the UI specs (leg 1) structurally cannot validate: Row-Level Security isolation, API contract (every endpoint × every role × every Zod boundary), solver-sidecar integration, DB invariants in machine-executable form, concurrency / race conditions on the run lifecycle, and cron interactions (stale-reaper). Runnable by a Jest + Supertest harness against a staging API with three provisioned tenants and direct DB + Redis access.

**Module:** Scheduling (curriculum, competencies, periods, runs, schedules, timetables, substitutions, exams, scenarios)
**Target executor:** Jest / Supertest / pg-promise scripts with direct DB + Redis access
**Base API URL:** `https://api-staging.edupod.app` (or local `http://localhost:3001`)
**Tenants required:** `nhqs` (A), `stress-a` (B), `stress-b` (C — hostile pair with B) — see `admin_view/scheduling-e2e-spec.md` Prerequisites for full seed requirements.
**Spec date:** 2026-04-17

---

## Table of Contents

1. [Header — Purpose, scope vs other legs](#1-header--purpose-scope-vs-other-legs)
2. [Test environment](#2-test-environment)
3. [Seed data](#3-seed-data)
4. [Backend endpoint contract matrix](#4-backend-endpoint-contract-matrix)
5. [RLS leakage matrix — tenant-scoped scheduling tables](#5-rls-leakage-matrix)
6. [Cross-module data invariants](#6-cross-module-data-invariants)
7. [Concurrency / race conditions](#7-concurrency--race-conditions)
8. [Webhook / external integrations — solver sidecar](#8-webhook--external-integrations)
9. [Cron interactions — stale-reaper](#9-cron-interactions)
10. [Permission contract matrix — endpoint × role](#10-permission-contract-matrix)
11. [Encrypted / sensitive field handling](#11-encrypted--sensitive-field-handling)
12. [Observations / gaps spotted](#12-observations--gaps-spotted)
13. [Sign-off](#13-sign-off)

---

## 1. Header — Purpose, scope vs other legs

### 1.1 Purpose

Validate the Scheduling backend at the **integration layer**: Postgres RLS isolation, Zod schema enforcement at controller boundaries, NestJS guard stack (AuthGuard + PermissionGuard + AdminTierOnlyGuard where relevant), BullMQ enqueue contract, conditional-claim patterns on `scheduling_run.status`, the Python OR-Tools solver sidecar HTTP contract, and the cross-tenant stale-reaper cron.

This leg owns **API contract + RLS + invariants + concurrency + sidecar I/O + cron**. Every numbered row is one Jest/supertest test case.

### 1.2 What this spec does NOT cover

| Concern                                                       | Lives in                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| UI behaviour, translations, RTL, mobile widths                | Leg 1 — `admin_view/`, `teacher_view/`, etc.                 |
| Solver sidecar internals (CP-SAT modelling, OR-Tools tuning)  | Out of scope (Python repo)                                   |
| Worker job retry semantics, lock duration, DLQ replay         | `worker/scheduling-worker-spec.md`                           |
| Latency / throughput / load                                   | `perf/scheduling-perf-spec.md`                               |
| OWASP top 10, CSP/HSTS, JWT entropy, encryption-key leakage   | `security/scheduling-security-spec.md`                       |
| Pure-TS solver assembly logic in `packages/shared/scheduler/` | Solver assembly unit tests (co-located in `packages/shared`) |

---

## 2. Test environment

### 2.1 Tenants & base URLs

Three provisioned tenants are required. The hostile pair (B + C) is used for adversarial RLS reads where one stress tenant tries to query the other.

| Tenant slug | Tenant ID symbol | Purpose                                                            |
| ----------- | ---------------- | ------------------------------------------------------------------ |
| `nhqs`      | `<A>`            | Pilot tenant — most realistic seed, used for happy-path rows       |
| `stress-a`  | `<B>`            | Hostile actor 1 — attempts to read `<C>`'s scheduling data         |
| `stress-b`  | `<C>`            | Hostile actor 2 — attempts to read `<A>` and `<B>` scheduling data |

**Hostnames** (per `feedback_tenant_urls`): `nhqs.edupod.app`, `stress-a.edupod.app`, `stress-b.edupod.app`. NEVER use legacy `nurul-huda.edupod.app`.

### 2.2 Infra requirements

- Postgres reachable to harness with both `app.current_tenant_id = '<A>'` and `app.current_tenant_id = '<B>'` set; `FORCE ROW LEVEL SECURITY` on every table in §5
- Redis / BullMQ reachable on the same instance as the API; harness reads `bull:scheduling:*` keys to assert enqueue
- A reachable solver sidecar (`SOLVER_PY_URL`, default `http://localhost:5557`) and a way to point the API at a test double for §8 (env override or feature flag)
- Test harness has credentials for `pg_dump`, `psql`, and direct `SELECT` queries with both tenant contexts
- JWT signing secrets identical between API and test harness so the harness can mint role-scoped tokens
- `MAX_SOLVER_DURATION_MS` (or `tenant_scheduling_settings.max_solver_duration`) configurable per test to exercise stale-reaper

### 2.3 Endpoints under test (controller → endpoint counts)

| #         | Controller                            | Endpoint count |
| --------- | ------------------------------------- | -------------- |
| 1         | `TeacherCompetenciesController`       | 11             |
| 2         | `SubstituteCompetenciesController`    | 11             |
| 3         | `BreakGroupsController`               | 4              |
| 4         | `CurriculumRequirementsController`    | 8              |
| 5         | `RoomClosuresController`              | 3              |
| 6         | `TeacherSchedulingConfigController`   | 4              |
| 7         | `SchedulerOrchestrationController`    | 8              |
| 8         | `SchedulerValidationController`       | 1              |
| 9         | `SchedulingEnhancedController`        | 39             |
| 10        | `SchedulingPublicController` (public) | 1              |
| 11        | `SchedulesController`                 | 8              |
| 12        | `TimetablesController`                | 5              |
| 13        | `SchedulingRunsController`            | 13             |
| 14        | `SchedulingDashboardController`       | 6              |
| **Total** |                                       | **122**        |

---

## 3. Seed data

Each tenant must include the following before the harness runs. Any seed gap is itself a test failure.

### 3.1 Common seed (per tenant A, B, C)

| #     | Entity                                                                               | Count               |
| ----- | ------------------------------------------------------------------------------------ | ------------------- |
| 3.1.1 | Active `academic_year` row with `status = 'active'`                                  | 1                   |
| 3.1.2 | `year_groups`                                                                        | ≥ 3                 |
| 3.1.3 | `classes` per year group                                                             | ≥ 2 (so 6+ classes) |
| 3.1.4 | `subjects`                                                                           | ≥ 5                 |
| 3.1.5 | `rooms` (mix of `general` and one with `room_type` constraint)                       | ≥ 4                 |
| 3.1.6 | `staff_profiles` linked to `users` (active)                                          | ≥ 6                 |
| 3.1.7 | `schedule_period_template` rows for the active year (8 periods × 5 weekdays)         | 40                  |
| 3.1.8 | `curriculum_requirement` rows covering every (year_group, subject) pair              | ≥ 15                |
| 3.1.9 | `teacher_competency` rows pinning at least one teacher to each (subject, year_group) | ≥ 15                |

### 3.2 Roles seeded per tenant

For each tenant, the following users (with permission grants matching seed):

| Role symbol                  | Permission set (scheduling-relevant)                                                                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `O` (school_owner)           | All `schedule.*` permissions; admin-tier                                                                                                                                                                                                            |
| `P` (school_principal)       | All `schedule.*` permissions; admin-tier                                                                                                                                                                                                            |
| `VP` (school_vice_principal) | All `schedule.*` permissions; admin-tier                                                                                                                                                                                                            |
| `R` (registrar)              | `schedule.manage`, `schedule.configure_requirements`, `schedule.configure_availability`, `schedule.pin_entries`, `schedule.run_auto`, `schedule.apply_auto`, `schedule.view_auto_reports`, `schedule.manage_substitutions`, `schedule.view_reports` |
| `T` (teacher)                | `schedule.view_own`, `schedule.view_own_satisfaction`, `schedule.report_own_absence`, `schedule.respond_to_offer`                                                                                                                                   |
| `PA` (parent)                | (no scheduling permission; access via parent-link to student timetable only)                                                                                                                                                                        |
| `ST` (student)               | `schedule.view_own`                                                                                                                                                                                                                                 |
| `U` (unauthenticated)        | none                                                                                                                                                                                                                                                |

### 3.3 Cross-tenant negative seed

| #     | Pre-condition                                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 3.3.1 | One `scheduling_run` exists in tenant `<A>` in `status='completed'`                                                                      |
| 3.3.2 | One `scheduling_run` exists in tenant `<B>` in `status='queued'`                                                                         |
| 3.3.3 | One `teacher_absence` exists in tenant `<A>` with at least one `substitution_offer` row in `status='pending'`                            |
| 3.3.4 | One `calendar_subscription_token` exists in tenant `<A>` (for the public `.ics` endpoint cross-tenant tests)                             |
| 3.3.5 | One `room_closure` row exists in each tenant for an overlapping date — so RLS leakage tests cannot mistake a missing row for "RLS works" |

---

## 4. Backend endpoint contract matrix

For every endpoint, this section documents: HTTP method, path, controlling permission, request shape (Zod schema), response shape, status codes, idempotency expectations, and rate-limit notes. Each row maps to one or more contract tests in the harness.

### 4.1 Curriculum requirements — `/v1/scheduling/curriculum-requirements`

| #     | Method | Path                                                     | Permission                        | Request schema                                   | Response shape                                                       | Status codes (happy / err) | Idempotent?                                                                       | Rate limit |
| ----- | ------ | -------------------------------------------------------- | --------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------- | ---------- |
| 4.1.1 | GET    | `/v1/scheduling/curriculum-requirements`                 | `schedule.configure_requirements` | `listCurriculumRequirementsQuerySchema`          | `{ data: CurriculumRequirement[], meta: { page, pageSize, total } }` | 200 / 401 403 422          | yes (read)                                                                        | global     |
| 4.1.2 | GET    | `/v1/scheduling/curriculum-requirements/matrix-subjects` | `schedule.configure_requirements` | query: `academic_year_id`, `year_group_id`       | `{ subjects: [...] }`                                                | 200 / 401 403 422          | yes                                                                               | global     |
| 4.1.3 | GET    | `/v1/scheduling/curriculum-requirements/:id`             | `schedule.configure_requirements` | `ParseUUIDPipe`                                  | `CurriculumRequirement`                                              | 200 / 401 403 404          | yes                                                                               | global     |
| 4.1.4 | POST   | `/v1/scheduling/curriculum-requirements`                 | `schedule.configure_requirements` | `createCurriculumRequirementSchema`              | `CurriculumRequirement` (created row)                                | 201 / 401 403 409 422      | NO (creates new row)                                                              | global     |
| 4.1.5 | PATCH  | `/v1/scheduling/curriculum-requirements/:id`             | `schedule.configure_requirements` | `updateCurriculumRequirementSchema`              | `CurriculumRequirement`                                              | 200 / 401 403 404 422      | yes (same body → same row state)                                                  | global     |
| 4.1.6 | DELETE | `/v1/scheduling/curriculum-requirements/:id`             | `schedule.configure_requirements` | —                                                | `{ deleted: true }`                                                  | 200 / 401 403 404          | yes                                                                               | global     |
| 4.1.7 | POST   | `/v1/scheduling/curriculum-requirements/bulk-upsert`     | `schedule.configure_requirements` | array (max 100)                                  | `{ created: number, updated: number }`                               | 200 / 401 403 422          | yes (upsert keyed by `tenant_id`+`academic_year_id`+`year_group_id`+`subject_id`) | global     |
| 4.1.8 | POST   | `/v1/scheduling/curriculum-requirements/copy`            | `schedule.configure_requirements` | `{ from_academic_year_id, to_academic_year_id }` | `{ copied: number }`                                                 | 200 / 401 403 404 422      | yes (idempotent if target already populated — should report `skipped`)            | global     |

### 4.2 Teacher competencies — `/v1/scheduling/teacher-competencies`

| #      | Method | Path                                                             | Permission                        | Request schema                                    | Response shape                        | Status codes          | Idempotent?               | Rate limit |
| ------ | ------ | ---------------------------------------------------------------- | --------------------------------- | ------------------------------------------------- | ------------------------------------- | --------------------- | ------------------------- | ---------- |
| 4.2.1  | GET    | `/v1/scheduling/teacher-competencies`                            | `schedule.configure_requirements` | `listTeacherCompetenciesQuerySchema`              | `{ data: TeacherCompetency[], meta }` | 200 / 401 403 422     | yes                       | global     |
| 4.2.2  | GET    | `/v1/scheduling/teacher-competencies/coverage`                   | `schedule.configure_requirements` | query: `academic_year_id`                         | `{ coverage: [...] }`                 | 200 / 401 403 422     | yes                       | global     |
| 4.2.3  | GET    | `/v1/scheduling/teacher-competencies/by-teacher/:staffProfileId` | `schedule.configure_requirements` | `ParseUUIDPipe`                                   | `TeacherCompetency[]`                 | 200 / 401 403 404     | yes                       | global     |
| 4.2.4  | GET    | `/v1/scheduling/teacher-competencies/by-subject`                 | `schedule.configure_requirements` | query: `subject_id`, `year_group_id`              | `TeacherCompetency[]`                 | 200 / 401 403 422     | yes                       | global     |
| 4.2.5  | POST   | `/v1/scheduling/teacher-competencies`                            | `schedule.configure_requirements` | `createTeacherCompetencySchema`                   | `TeacherCompetency`                   | 201 / 401 403 409 422 | NO                        | global     |
| 4.2.6  | POST   | `/v1/scheduling/teacher-competencies/bulk`                       | `schedule.configure_requirements` | `bulkCreateTeacherCompetenciesSchema` (max 500)   | `{ created: number }`                 | 201 / 401 403 422     | partially (skip-existing) | global     |
| 4.2.7  | PATCH  | `/v1/scheduling/teacher-competencies/:id`                        | `schedule.configure_requirements` | `updateTeacherCompetencySchema` (only `class_id`) | `TeacherCompetency`                   | 200 / 401 403 404 422 | yes                       | global     |
| 4.2.8  | DELETE | `/v1/scheduling/teacher-competencies/:id`                        | `schedule.configure_requirements` | —                                                 | `{ deleted: true }`                   | 200 / 401 403 404     | yes                       | global     |
| 4.2.9  | DELETE | `/v1/scheduling/teacher-competencies/by-teacher/:staffProfileId` | `schedule.configure_requirements` | —                                                 | `{ deleted: number }`                 | 200 / 401 403 404     | yes                       | global     |
| 4.2.10 | POST   | `/v1/scheduling/teacher-competencies/copy`                       | `schedule.configure_requirements` | `{ from_academic_year_id, to_academic_year_id }`  | `{ copied: number, skipped: number }` | 200 / 401 403 422     | yes                       | global     |
| 4.2.11 | POST   | `/v1/scheduling/teacher-competencies/copy-to-years`              | `schedule.configure_requirements` | `copyCompetenciesToYearsSchema` (max 50 targets)  | `{ copied: number }`                  | 200 / 401 403 422     | yes                       | global     |

### 4.3 Substitute competencies — `/v1/scheduling/substitute-competencies`

| #      | Method | Path                                                                | Permission                      | Request schema                                             | Response shape                  | Status codes          | Idempotent? |
| ------ | ------ | ------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------- | ------------------------------- | --------------------- | ----------- |
| 4.3.1  | GET    | `/v1/scheduling/substitute-competencies`                            | `schedule.manage_substitutions` | `listSubstituteTeacherCompetenciesQuerySchema`             | `{ data, meta }`                | 200 / 401 403 422     | yes         |
| 4.3.2  | GET    | `/v1/scheduling/substitute-competencies/suggest`                    | `schedule.manage_substitutions` | query: `subject_id`, `year_group_id`, `date`               | `{ suggestions: [...] }`        | 200 / 401 403 422     | yes         |
| 4.3.3  | GET    | `/v1/scheduling/substitute-competencies/by-teacher/:staffProfileId` | `schedule.manage_substitutions` | `ParseUUIDPipe`                                            | `SubstituteTeacherCompetency[]` | 200 / 401 403 404     | yes         |
| 4.3.4  | GET    | `/v1/scheduling/substitute-competencies/by-subject`                 | `schedule.manage_substitutions` | query: `subject_id`, `year_group_id`                       | `SubstituteTeacherCompetency[]` | 200 / 401 403 422     | yes         |
| 4.3.5  | POST   | `/v1/scheduling/substitute-competencies`                            | `schedule.manage_substitutions` | `createSubstituteTeacherCompetencySchema`                  | `SubstituteTeacherCompetency`   | 201 / 401 403 409 422 | NO          |
| 4.3.6  | POST   | `/v1/scheduling/substitute-competencies/bulk`                       | `schedule.manage_substitutions` | `bulkCreateSubstituteTeacherCompetenciesSchema` (max 500)  | `{ created: number }`           | 201 / 401 403 422     | partial     |
| 4.3.7  | PATCH  | `/v1/scheduling/substitute-competencies/:id`                        | `schedule.manage_substitutions` | `updateSubstituteTeacherCompetencySchema`                  | `SubstituteTeacherCompetency`   | 200 / 401 403 404 422 | yes         |
| 4.3.8  | DELETE | `/v1/scheduling/substitute-competencies/:id`                        | `schedule.manage_substitutions` | —                                                          | `{ deleted: true }`             | 200 / 401 403 404     | yes         |
| 4.3.9  | DELETE | `/v1/scheduling/substitute-competencies/by-teacher/:staffProfileId` | `schedule.manage_substitutions` | —                                                          | `{ deleted: number }`           | 200 / 401 403 404     | yes         |
| 4.3.10 | POST   | `/v1/scheduling/substitute-competencies/copy`                       | `schedule.manage_substitutions` | `{ from_academic_year_id, to_academic_year_id }`           | `{ copied, skipped }`           | 200 / 401 403 422     | yes         |
| 4.3.11 | POST   | `/v1/scheduling/substitute-competencies/copy-to-years`              | `schedule.manage_substitutions` | `copySubstituteCompetenciesToYearsSchema` (max 50 targets) | `{ copied: number }`            | 200 / 401 403 422     | yes         |

### 4.4 Break groups — `/v1/scheduling/break-groups`

| #     | Method | Path                              | Permission                        | Request schema            | Response shape      | Status codes          | Idempotent? |
| ----- | ------ | --------------------------------- | --------------------------------- | ------------------------- | ------------------- | --------------------- | ----------- |
| 4.4.1 | GET    | `/v1/scheduling/break-groups`     | `schedule.configure_requirements` | query: `academic_year_id` | `BreakGroup[]`      | 200 / 401 403 422     | yes         |
| 4.4.2 | POST   | `/v1/scheduling/break-groups`     | `schedule.configure_requirements` | `createBreakGroupSchema`  | `BreakGroup`        | 201 / 401 403 422     | NO          |
| 4.4.3 | PATCH  | `/v1/scheduling/break-groups/:id` | `schedule.configure_requirements` | `updateBreakGroupSchema`  | `BreakGroup`        | 200 / 401 403 404 422 | yes         |
| 4.4.4 | DELETE | `/v1/scheduling/break-groups/:id` | `schedule.configure_requirements` | —                         | `{ deleted: true }` | 200 / 401 403 404     | yes         |

### 4.5 Room closures — `/v1/scheduling/room-closures`

| #     | Method | Path                               | Permission        | Request schema                              | Response shape      | Status codes          | Idempotent? |
| ----- | ------ | ---------------------------------- | ----------------- | ------------------------------------------- | ------------------- | --------------------- | ----------- |
| 4.5.1 | GET    | `/v1/scheduling/room-closures`     | `schedule.manage` | query: `room_id?`, `date_from?`, `date_to?` | `RoomClosure[]`     | 200 / 401 403 422     | yes         |
| 4.5.2 | POST   | `/v1/scheduling/room-closures`     | `schedule.manage` | `createRoomClosureSchema`                   | `RoomClosure`       | 201 / 401 403 409 422 | NO          |
| 4.5.3 | DELETE | `/v1/scheduling/room-closures/:id` | `schedule.manage` | —                                           | `{ deleted: true }` | 200 / 401 403 404     | yes         |

### 4.6 Teacher scheduling config — `/v1/scheduling/teacher-config`

| #     | Method | Path                                 | Permission                        | Request schema            | Response shape              | Status codes      | Idempotent?         |
| ----- | ------ | ------------------------------------ | --------------------------------- | ------------------------- | --------------------------- | ----------------- | ------------------- |
| 4.6.1 | GET    | `/v1/scheduling/teacher-config`      | `schedule.configure_availability` | query: `academic_year_id` | `TeacherSchedulingConfig[]` | 200 / 401 403 422 | yes                 |
| 4.6.2 | PUT    | `/v1/scheduling/teacher-config`      | `schedule.configure_availability` | upsert payload            | `TeacherSchedulingConfig`   | 200 / 401 403 422 | yes (PUT semantics) |
| 4.6.3 | DELETE | `/v1/scheduling/teacher-config/:id`  | `schedule.configure_availability` | —                         | `{ deleted: true }`         | 200 / 401 403 404 | yes                 |
| 4.6.4 | POST   | `/v1/scheduling/teacher-config/copy` | `schedule.configure_availability` | `{ from_year, to_year }`  | `{ copied: number }`        | 200 / 401 403 422 | yes                 |

### 4.7 Scheduler orchestration — `/v1/scheduling/runs/*` (legacy/parallel path)

| #     | Method | Path                                | Permission                   | Request schema                                | Response shape                             | Status codes              | Idempotent?                                       |
| ----- | ------ | ----------------------------------- | ---------------------------- | --------------------------------------------- | ------------------------------------------ | ------------------------- | ------------------------------------------------- |
| 4.7.1 | POST   | `/v1/scheduling/runs/prerequisites` | `schedule.run_auto`          | `{ academic_year_id }`                        | `{ checks: [{name, passed, reason}] }`     | 200 / 401 403 422         | yes                                               |
| 4.7.2 | POST   | `/v1/scheduling/runs/trigger`       | `schedule.run_auto`          | `createSchedulingRunSchema`                   | `{ run_id, status: 'queued' }`             | 202 / 401 403 409 422     | NO; 409 if active run exists                      |
| 4.7.3 | GET    | `/v1/scheduling/runs`               | `schedule.view_auto_reports` | query: `academic_year_id`, `page`, `pageSize` | `{ data, meta }`                           | 200 / 401 403 422         | yes                                               |
| 4.7.4 | GET    | `/v1/scheduling/runs/:id`           | `schedule.view_auto_reports` | `ParseUUIDPipe`                               | `SchedulingRun` (full incl. `result_json`) | 200 / 401 403 404         | yes                                               |
| 4.7.5 | POST   | `/v1/scheduling/runs/:id/apply`     | `schedule.apply_auto`        | `applyRunSchema` (`expected_updated_at`)      | `{ applied: true, applied_at }`            | 200 / 401 403 404 409 422 | optimistic; 409 on `expected_updated_at` mismatch |
| 4.7.6 | POST   | `/v1/scheduling/runs/:id/discard`   | `schedule.run_auto`          | `discardRunSchema`                            | `{ discarded: true }`                      | 200 / 401 403 404 409 422 | optimistic; 409 on stale `expected_updated_at`    |
| 4.7.7 | POST   | `/v1/scheduling/runs/:id/cancel`    | `schedule.run_auto`          | —                                             | `{ cancelled: true, status: 'failed' }`    | 200 / 401 403 404 409     | conditional; 409 if not in queued/running         |
| 4.7.8 | GET    | `/v1/scheduling/runs/:id/status`    | `schedule.run_auto`          | `ParseUUIDPipe`                               | `{ status, phase, elapsed_ms }`            | 200 / 401 403 404         | yes                                               |

### 4.8 Scheduler validation — `/v1/scheduling/runs/:id/validate`

| #     | Method | Path                               | Permission          | Request schema | Response shape                           | Status codes      | Idempotent? |
| ----- | ------ | ---------------------------------- | ------------------- | -------------- | ---------------------------------------- | ----------------- | ----------- |
| 4.8.1 | POST   | `/v1/scheduling/runs/:id/validate` | `schedule.run_auto` | —              | `{ violations: [...], warnings: [...] }` | 200 / 401 403 404 | yes         |

### 4.9 Scheduling-runs (canonical) — `/v1/scheduling-runs`

| #      | Method | Path                                           | Permission                   | Request schema                                | Response shape                                       | Status codes              | Idempotent?                                                           |
| ------ | ------ | ---------------------------------------------- | ---------------------------- | --------------------------------------------- | ---------------------------------------------------- | ------------------------- | --------------------------------------------------------------------- |
| 4.9.1  | GET    | `/v1/scheduling-runs/prerequisites`            | `schedule.run_auto`          | query: `academic_year_id`                     | `{ checks: [...] }`                                  | 200 / 401 403 422         | yes                                                                   |
| 4.9.2  | GET    | `/v1/scheduling-runs/feasibility`              | `schedule.run_auto`          | query: `academic_year_id`                     | `{ checks: [10 entries], score }`                    | 200 / 401 403 422         | yes                                                                   |
| 4.9.3  | POST   | `/v1/scheduling-runs`                          | `schedule.run_auto`          | `createSchedulingRunSchema`                   | `{ id, status: 'queued', enqueued_at }`              | 201 / 401 403 409 422     | NO; **conditional create** — fails 409 if a queued/running run exists |
| 4.9.4  | GET    | `/v1/scheduling-runs`                          | `schedule.view_auto_reports` | query: `academic_year_id`, `page`, `pageSize` | `{ data, meta }` (excludes `result_json`)            | 200 / 401 403 422         | yes                                                                   |
| 4.9.5  | GET    | `/v1/scheduling-runs/:id`                      | `schedule.view_auto_reports` | `ParseUUIDPipe`                               | full row incl. `result_json`, `proposed_adjustments` | 200 / 401 403 404         | yes                                                                   |
| 4.9.6  | GET    | `/v1/scheduling-runs/:id/progress`             | `schedule.run_auto`          | `ParseUUIDPipe`                               | `{ phase, elapsed_ms, percent }`                     | 200 / 401 403 404         | yes                                                                   |
| 4.9.7  | GET    | `/v1/scheduling-runs/:id/diagnostics`          | `schedule.view_auto_reports` | `ParseUUIDPipe`                               | `{ categories: [...], recommendations }`             | 200 / 401 403 404         | yes                                                                   |
| 4.9.8  | POST   | `/v1/scheduling-runs/:id/diagnostics/simulate` | `schedule.view_auto_reports` | override payload                              | `{ projected_violations, projected_score }`          | 200 / 401 403 404 422     | yes (no DB write)                                                     |
| 4.9.9  | POST   | `/v1/scheduling-runs/:id/diagnostics/refresh`  | `schedule.view_auto_reports` | —                                             | `{ refreshed: true }`                                | 200 / 401 403 404         | yes (overwrites cached diagnostics)                                   |
| 4.9.10 | POST   | `/v1/scheduling-runs/:id/cancel`               | `schedule.run_auto`          | —                                             | `{ cancelled: true }`                                | 200 / 401 403 404 409     | conditional; 409 if not in queued/running                             |
| 4.9.11 | PATCH  | `/v1/scheduling-runs/:id/adjustments`          | `schedule.apply_auto`        | `addAdjustmentSchema`                         | updated run                                          | 200 / 401 403 404 409 422 | optimistic; 409 on `expected_updated_at` mismatch                     |
| 4.9.12 | POST   | `/v1/scheduling-runs/:id/apply`                | `schedule.apply_auto`        | `applyRunSchema`                              | `{ applied: true }`                                  | 200 / 401 403 404 409 422 | optimistic                                                            |
| 4.9.13 | POST   | `/v1/scheduling-runs/:id/discard`              | `schedule.apply_auto`        | `discardRunSchema`                            | `{ discarded: true }`                                | 200 / 401 403 404 409 422 | optimistic                                                            |

### 4.10 Scheduling enhanced — substitution flow

| #       | Method | Path                                                | Permission                      | Request schema                  | Response shape                      | Status codes              | Idempotent?                                  |
| ------- | ------ | --------------------------------------------------- | ------------------------------- | ------------------------------- | ----------------------------------- | ------------------------- | -------------------------------------------- |
| 4.10.1  | POST   | `/v1/scheduling/absences`                           | `schedule.manage_substitutions` | `reportAbsenceSchema`           | `{ absence }`                       | 201 / 401 403 422         | NO (creates row + may enqueue cascade)       |
| 4.10.2  | POST   | `/v1/scheduling/absences/self-report`               | `schedule.report_own_absence`   | `selfReportAbsenceSchema`       | `{ absence }`                       | 201 / 401 403 422         | NO                                           |
| 4.10.3  | GET    | `/v1/scheduling/absences`                           | `schedule.manage_substitutions` | `absenceQuerySchema`            | `{ data, meta }`                    | 200 / 401 403 422         | yes                                          |
| 4.10.4  | DELETE | `/v1/scheduling/absences/:id`                       | `schedule.manage_substitutions` | —                               | `{ deleted: true }`                 | 200 / 401 403 404         | yes                                          |
| 4.10.5  | POST   | `/v1/scheduling/absences/:id/cancel`                | `schedule.manage_substitutions` | `cancelAbsenceSchema`           | `{ cancelled_at, revoked_offers }`  | 200 / 401 403 404 422     | yes (subsequent cancels are no-ops)          |
| 4.10.6  | POST   | `/v1/scheduling/absences/:id/cancel-own`            | `schedule.report_own_absence`   | `cancelAbsenceSchema`           | `{ cancelled_at }`                  | 200 / 401 403 404 422     | yes; 403 if absence not owned by caller      |
| 4.10.7  | GET    | `/v1/scheduling/absences/:absenceId/substitutes`    | `schedule.manage_substitutions` | query: `schedule_id`, `date`    | `{ candidates: [...] }`             | 200 / 401 403 404 422     | yes                                          |
| 4.10.8  | GET    | `/v1/scheduling/absences/:absenceId/substitutes/ai` | `schedule.manage_substitutions` | query: `schedule_id`, `date`    | `{ ranked: [...] }`                 | 200 / 401 403 404 422     | yes                                          |
| 4.10.9  | POST   | `/v1/scheduling/substitutions`                      | `schedule.manage_substitutions` | `assignSubstituteSchema`        | `SubstitutionRecord`                | 201 / 401 403 404 409 422 | NO; 409 if substitute already booked         |
| 4.10.10 | GET    | `/v1/scheduling/substitutions`                      | `schedule.manage_substitutions` | `substitutionRecordQuerySchema` | `{ data, meta }`                    | 200 / 401 403 422         | yes                                          |
| 4.10.11 | GET    | `/v1/scheduling/substitution-board`                 | `schedule.manage_substitutions` | —                               | `{ today: [...], upcoming: [...] }` | 200 / 401 403             | yes                                          |
| 4.10.12 | GET    | `/v1/scheduling/offers/my`                          | `schedule.respond_to_offer`     | —                               | `SubstitutionOffer[]`               | 200 / 401 403             | yes                                          |
| 4.10.13 | POST   | `/v1/scheduling/offers/:id/accept`                  | `schedule.respond_to_offer`     | —                               | `{ accepted: true, record_id }`     | 200 / 401 403 404 409     | NO; 409 if already accepted/declined/revoked |
| 4.10.14 | POST   | `/v1/scheduling/offers/:id/decline`                 | `schedule.respond_to_offer`     | `{ reason?: string }`           | `{ declined: true }`                | 200 / 401 403 404 409     | NO                                           |
| 4.10.15 | GET    | `/v1/scheduling/colleagues`                         | `schedule.report_own_absence`   | —                               | `Colleague[]`                       | 200 / 401 403             | yes                                          |
| 4.10.16 | GET    | `/v1/scheduling/teachers`                           | `schedule.manage_substitutions` | —                               | `Teacher[]`                         | 200 / 401 403             | yes                                          |

### 4.11 Cover reports

| #      | Method | Path                                         | Permission              | Request schema           | Response shape             | Status codes      | Idempotent? |
| ------ | ------ | -------------------------------------------- | ----------------------- | ------------------------ | -------------------------- | ----------------- | ----------- |
| 4.11.1 | GET    | `/v1/scheduling/cover-reports`               | `schedule.view_reports` | `coverReportQuerySchema` | `{ stats: [...] }`         | 200 / 401 403 422 | yes         |
| 4.11.2 | GET    | `/v1/scheduling/cover-reports/fairness`      | `schedule.view_reports` | `coverReportQuerySchema` | `{ fairness: [...] }`      | 200 / 401 403 422 | yes         |
| 4.11.3 | GET    | `/v1/scheduling/cover-reports/by-department` | `schedule.view_reports` | `coverReportQuerySchema` | `{ by_department: [...] }` | 200 / 401 403 422 | yes         |

### 4.12 Schedule swap & emergency change

| #      | Method | Path                              | Permission        | Request schema          | Response shape                              | Status codes              | Idempotent?                                         |
| ------ | ------ | --------------------------------- | ----------------- | ----------------------- | ------------------------------------------- | ------------------------- | --------------------------------------------------- |
| 4.12.1 | POST   | `/v1/scheduling/swaps/validate`   | `schedule.manage` | `validateSwapSchema`    | `{ valid: boolean, conflicts: [...] }`      | 200 / 401 403 422         | yes                                                 |
| 4.12.2 | POST   | `/v1/scheduling/swaps/execute`    | `schedule.manage` | `executeSwapSchema`     | `{ swapped: true, schedule_a, schedule_b }` | 200 / 401 403 404 409 422 | NO; 409 if either entry was modified mid-validation |
| 4.12.3 | POST   | `/v1/scheduling/emergency-change` | `schedule.manage` | `emergencyChangeSchema` | `{ updated: true }`                         | 200 / 401 403 404 409 422 | NO                                                  |

### 4.13 Personal timetable & calendar

| #      | Method | Path                                        | Permission              | Request schema                  | Response shape                | Status codes      | Idempotent? |
| ------ | ------ | ------------------------------------------- | ----------------------- | ------------------------------- | ----------------------------- | ----------------- | ----------- |
| 4.13.1 | GET    | `/v1/scheduling/timetable/teacher/:staffId` | `schedule.view_reports` | `timetableQuerySchema`          | `{ grid: [...] }`             | 200 / 401 403 404 | yes         |
| 4.13.2 | GET    | `/v1/scheduling/timetable/my`               | `schedule.view_own`     | `timetableQuerySchema`          | `{ grid: [...] }`             | 200 / 401 403     | yes         |
| 4.13.3 | GET    | `/v1/scheduling/timetable/class/:classId`   | `schedule.view_reports` | `timetableQuerySchema`          | `{ grid: [...] }`             | 200 / 401 403 404 | yes         |
| 4.13.4 | POST   | `/v1/scheduling/calendar-tokens`            | `schedule.view_own`     | `createSubscriptionTokenSchema` | `{ token, url }`              | 201 / 401 403 422 | NO          |
| 4.13.5 | GET    | `/v1/scheduling/calendar-tokens`            | `schedule.view_own`     | —                               | `CalendarSubscriptionToken[]` | 200 / 401 403     | yes         |
| 4.13.6 | DELETE | `/v1/scheduling/calendar-tokens/:tokenId`   | `schedule.view_own`     | —                               | `{ deleted: true }`           | 200 / 401 403 404 | yes         |

### 4.14 Rotation config

| #      | Method | Path                                   | Permission              | Request schema               | Response shape          | Status codes      | Idempotent? |
| ------ | ------ | -------------------------------------- | ----------------------- | ---------------------------- | ----------------------- | ----------------- | ----------- |
| 4.14.1 | PUT    | `/v1/scheduling/rotation`              | `schedule.manage`       | `upsertRotationConfigSchema` | `RotationConfig`        | 200 / 401 403 422 | yes (PUT)   |
| 4.14.2 | GET    | `/v1/scheduling/rotation`              | `schedule.view_reports` | query: `academic_year_id`    | `RotationConfig`        | 200 / 401 403 404 | yes         |
| 4.14.3 | DELETE | `/v1/scheduling/rotation`              | `schedule.manage`       | query: `academic_year_id`    | `{ deleted: true }`     | 200 / 401 403 404 | yes         |
| 4.14.4 | GET    | `/v1/scheduling/rotation/current-week` | `schedule.view_reports` | query: `date?`               | `{ week_label, index }` | 200 / 401 403 404 | yes         |

### 4.15 Exam scheduling

| #       | Method | Path                                                   | Permission              | Request schema            | Response shape            | Status codes          | Idempotent?                   |
| ------- | ------ | ------------------------------------------------------ | ----------------------- | ------------------------- | ------------------------- | --------------------- | ----------------------------- |
| 4.15.1  | POST   | `/v1/scheduling/exam-sessions`                         | `schedule.manage_exams` | `createExamSessionSchema` | `ExamSession`             | 201 / 401 403 422     | NO                            |
| 4.15.2  | GET    | `/v1/scheduling/exam-sessions`                         | `schedule.manage_exams` | query: `academic_year_id` | `ExamSession[]`           | 200 / 401 403 422     | yes                           |
| 4.15.3  | GET    | `/v1/scheduling/exam-sessions/:id`                     | `schedule.manage_exams` | `ParseUUIDPipe`           | `ExamSession`             | 200 / 401 403 404     | yes                           |
| 4.15.4  | PUT    | `/v1/scheduling/exam-sessions/:id`                     | `schedule.manage_exams` | `updateExamSessionSchema` | `ExamSession`             | 200 / 401 403 404 422 | yes                           |
| 4.15.5  | DELETE | `/v1/scheduling/exam-sessions/:id`                     | `schedule.manage_exams` | —                         | `{ deleted: true }`       | 200 / 401 403 404 409 | yes; 409 if `published`       |
| 4.15.6  | GET    | `/v1/scheduling/exam-sessions/:id/slots`               | `schedule.manage_exams` | `ParseUUIDPipe`           | `ExamSlot[]`              | 200 / 401 403 404     | yes                           |
| 4.15.7  | POST   | `/v1/scheduling/exam-sessions/:id/slots`               | `schedule.manage_exams` | `addExamSlotSchema`       | `ExamSlot`                | 201 / 401 403 404 422 | NO                            |
| 4.15.8  | POST   | `/v1/scheduling/exam-sessions/:id/generate`            | `schedule.manage_exams` | —                         | `{ generated: number }`   | 200 / 401 403 404 409 | NO; 409 if `published`        |
| 4.15.9  | POST   | `/v1/scheduling/exam-sessions/:id/assign-invigilators` | `schedule.manage_exams` | `{ assignments: [...] }`  | `{ assigned: number }`    | 200 / 401 403 404 422 | yes (overwrites assignments)  |
| 4.15.10 | POST   | `/v1/scheduling/exam-sessions/:id/publish`             | `schedule.manage_exams` | —                         | `{ status: 'published' }` | 200 / 401 403 404 409 | yes; 409 if not in `planning` |

### 4.16 Scenarios (what-if)

| #      | Method | Path                                 | Permission                  | Request schema          | Response shape          | Status codes          | Idempotent? |
| ------ | ------ | ------------------------------------ | --------------------------- | ----------------------- | ----------------------- | --------------------- | ----------- |
| 4.16.1 | POST   | `/v1/scheduling/scenarios`           | `schedule.manage_scenarios` | `createScenarioSchema`  | `Scenario`              | 201 / 401 403 422     | NO          |
| 4.16.2 | GET    | `/v1/scheduling/scenarios`           | `schedule.manage_scenarios` | `scenarioQuerySchema`   | `{ data, meta }`        | 200 / 401 403 422     | yes         |
| 4.16.3 | GET    | `/v1/scheduling/scenarios/:id`       | `schedule.manage_scenarios` | `ParseUUIDPipe`         | `Scenario`              | 200 / 401 403 404     | yes         |
| 4.16.4 | PUT    | `/v1/scheduling/scenarios/:id`       | `schedule.manage_scenarios` | `updateScenarioSchema`  | `Scenario`              | 200 / 401 403 404 422 | yes         |
| 4.16.5 | DELETE | `/v1/scheduling/scenarios/:id`       | `schedule.manage_scenarios` | —                       | `{ deleted: true }`     | 200 / 401 403 404     | yes         |
| 4.16.6 | POST   | `/v1/scheduling/scenarios/:id/solve` | `schedule.manage_scenarios` | —                       | `{ scenario, result }`  | 200 / 401 403 404 422 | NO          |
| 4.16.7 | POST   | `/v1/scheduling/scenarios/compare`   | `schedule.manage_scenarios` | `compareScenarioSchema` | `{ comparison: [...] }` | 200 / 401 403 422     | yes         |

### 4.17 Analytics

| #      | Method | Path                                  | Permission              | Request schema                              | Response shape       | Status codes      | Idempotent? |
| ------ | ------ | ------------------------------------- | ----------------------- | ------------------------------------------- | -------------------- | ----------------- | ----------- |
| 4.17.1 | GET    | `/v1/scheduling/analytics/efficiency` | `schedule.view_reports` | `schedulingAnalyticsQuerySchema`            | `{ metrics: [...] }` | 200 / 401 403 422 | yes         |
| 4.17.2 | GET    | `/v1/scheduling/analytics/workload`   | `schedule.view_reports` | `schedulingAnalyticsQuerySchema`            | `{ heatmap: [...] }` | 200 / 401 403 422 | yes         |
| 4.17.3 | GET    | `/v1/scheduling/analytics/rooms`      | `schedule.view_reports` | `schedulingAnalyticsQuerySchema`            | `{ rooms: [...] }`   | 200 / 401 403 422 | yes         |
| 4.17.4 | GET    | `/v1/scheduling/analytics/historical` | `schedule.view_reports` | `schedulingHistoricalComparisonQuerySchema` | `{ trends: [...] }`  | 200 / 401 403 422 | yes         |

### 4.18 Schedules — `/v1/schedules`

| #      | Method | Path                      | Permission             | Request schema            | Response shape               | Status codes              | Idempotent? |
| ------ | ------ | ------------------------- | ---------------------- | ------------------------- | ---------------------------- | ------------------------- | ----------- |
| 4.18.1 | POST   | `/v1/schedules`           | `schedule.manage`      | `createScheduleSchema`    | `{ schedule, conflicts? }`   | 201 / 401 403 409 422     | NO          |
| 4.18.2 | GET    | `/v1/schedules`           | `schedule.manage`      | query: paginated          | `{ data, meta }`             | 200 / 401 403 422         | yes         |
| 4.18.3 | GET    | `/v1/schedules/:id`       | `schedule.manage`      | `ParseUUIDPipe`           | `Schedule`                   | 200 / 401 403 404         | yes         |
| 4.18.4 | PATCH  | `/v1/schedules/:id`       | `schedule.manage`      | `updateScheduleSchema`    | `{ schedule, conflicts? }`   | 200 / 401 403 404 409 422 | yes         |
| 4.18.5 | DELETE | `/v1/schedules/:id`       | `schedule.manage`      | —                         | `{ deleted: true }`          | 200 / 401 403 404         | yes         |
| 4.18.6 | POST   | `/v1/schedules/bulk-pin`  | `schedule.pin_entries` | `{ ids: [], pin_reason }` | `{ pinned: number }`         | 200 / 401 403 422         | yes         |
| 4.18.7 | POST   | `/v1/schedules/:id/pin`   | `schedule.pin_entries` | `{ pin_reason? }`         | `Schedule` (is_pinned=true)  | 200 / 401 403 404 422     | yes         |
| 4.18.8 | POST   | `/v1/schedules/:id/unpin` | `schedule.pin_entries` | —                         | `Schedule` (is_pinned=false) | 200 / 401 403 404         | yes         |

### 4.19 Timetables — `/v1/timetables`

| #      | Method | Path                                     | Permission                                     | Request schema            | Response shape    | Status codes      | Idempotent? |
| ------ | ------ | ---------------------------------------- | ---------------------------------------------- | ------------------------- | ----------------- | ----------------- | ----------- |
| 4.19.1 | GET    | `/v1/timetables/teacher/:staffProfileId` | `schedule.manage` OR `schedule.view_own` (own) | query: `academic_year_id` | `{ grid: [...] }` | 200 / 401 403 404 | yes         |
| 4.19.2 | GET    | `/v1/timetables/class/:classId`          | `schedule.manage` OR `schedule.view_class`     | query                     | `{ grid: [...] }` | 200 / 401 403 404 | yes         |
| 4.19.3 | GET    | `/v1/timetables/room/:roomId`            | `schedule.manage`                              | query                     | `{ grid: [...] }` | 200 / 401 403 404 | yes         |
| 4.19.4 | GET    | `/v1/timetables/student/:studentId`      | `students.view` OR parent-link                 | query                     | `{ grid: [...] }` | 200 / 401 403 404 | yes         |
| 4.19.5 | GET    | `/v1/reports/workload`                   | `schedule.manage`                              | query: `academic_year_id` | `{ rows: [...] }` | 200 / 401 403 422 | yes         |

### 4.20 Scheduling dashboard — `/v1/scheduling-dashboard`

| #      | Method | Path                                        | Permission                                                       | Request schema            | Response shape       | Status codes      | Idempotent?                                                        |
| ------ | ------ | ------------------------------------------- | ---------------------------------------------------------------- | ------------------------- | -------------------- | ----------------- | ------------------------------------------------------------------ |
| 4.20.1 | GET    | `/v1/scheduling-dashboard/overview`         | `schedule.view_auto_reports`                                     | query: `academic_year_id` | `{ kpis: [...] }`    | 200 / 401 403 422 | yes                                                                |
| 4.20.2 | GET    | `/v1/scheduling-dashboard/workload`         | `schedule.view_auto_reports`                                     | query                     | `{ rows: [...] }`    | 200 / 401 403 422 | yes                                                                |
| 4.20.3 | GET    | `/v1/scheduling-dashboard/unassigned`       | `schedule.view_auto_reports`                                     | query                     | `{ classes: [...] }` | 200 / 401 403 422 | yes                                                                |
| 4.20.4 | GET    | `/v1/scheduling-dashboard/room-utilisation` | `schedule.view_auto_reports`                                     | query                     | `{ rooms: [...] }`   | 200 / 401 403 422 | yes                                                                |
| 4.20.5 | GET    | `/v1/scheduling-dashboard/trends`           | `schedule.view_auto_reports`                                     | query                     | `{ trends: [...] }`  | 200 / 401 403 422 | yes                                                                |
| 4.20.6 | GET    | `/v1/scheduling-dashboard/preferences`      | `schedule.view_own_satisfaction` OR `schedule.view_auto_reports` | query                     | `{ rows: [...] }`    | 200 / 401 403 422 | yes; rows scoped to own staff_id when only `view_own_satisfaction` |

### 4.21 Public iCalendar — `/v1/calendar/:tenantId/:token.ics`

| #      | Method | Path                                | Permission              | Request schema | Response shape  | Status codes  | Idempotent? | Rate limit                                            |
| ------ | ------ | ----------------------------------- | ----------------------- | -------------- | --------------- | ------------- | ----------- | ----------------------------------------------------- |
| 4.21.1 | GET    | `/v1/calendar/:tenantId/:token.ics` | none (token-based auth) | path params    | `text/calendar` | 200 / 404 410 | yes         | per-token rate limit (>100 req/min/token returns 429) |

### 4.22 Response shape assertions (universal)

| #      | Endpoint group                 | Assertion                                                                                               |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 4.22.1 | List endpoints                 | `{ data: [], meta: { page, pageSize, total } }` — three meta keys present, no extras                    |
| 4.22.2 | Detail endpoints               | Always include `id`, `tenant_id`, `created_at`, `updated_at`; `tenant_id` matches caller's tenant       |
| 4.22.3 | Error responses                | `{ error: { code: 'UPPER_SNAKE_CASE', message: string, details?: object } }`                            |
| 4.22.4 | `scheduling_run` GET response  | `result_json` is `null` for non-completed runs; populated for `completed` and `applied`                 |
| 4.22.5 | `scheduling_run` LIST response | `result_json` and `proposed_adjustments` are **excluded** (large JSONB); only summary metrics surface   |
| 4.22.6 | Public `.ics` response         | Content-Type `text/calendar; charset=utf-8`; first line `BEGIN:VCALENDAR`; ends `END:VCALENDAR`         |
| 4.22.7 | `substitution_offer` GET       | Includes `status`, `staff_profile_id`, `absence_id`; never includes other staff's offers in `offers/my` |
| 4.22.8 | Diagnostics response           | `categories[].code` is `UPPER_SNAKE_CASE`; localised `message` if `Accept-Language` set                 |

---

## 5. RLS leakage matrix — tenant-scoped scheduling tables

For every scheduling table, the harness executes the four assertions below. Because all 22 tables are tenant-scoped (only `users` is exempt platform-wide), every row must pass the standard 4-assertion pattern.

### 5.1 Standard RLS pattern (baseline per table)

| #     | Assertion                                                                                                       | Expected                              |
| ----- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 5.1.1 | Insert row via service layer with `app.current_tenant_id = '<A>'`; verify persisted row has `tenant_id = '<A>'` | Row persists with correct `tenant_id` |
| 5.1.2 | With `SET app.current_tenant_id = '<B>'`, `SELECT * FROM <table> WHERE id = '<row_from_5.1.1>'` returns 0 rows  | Empty result                          |
| 5.1.3 | With tenant `<B>` context, `UPDATE <table> SET <col> = ... WHERE id = '<A_row>'` affects 0 rows                 | 0 rows updated                        |
| 5.1.4 | With tenant `<B>` context, `DELETE FROM <table> WHERE id = '<A_row>'` affects 0 rows                            | 0 rows deleted                        |

### 5.2 Per-table RLS assertion rows

| #      | Table                           | Notes                                                          | 5.1.1 | 5.1.2 | 5.1.3 | 5.1.4 |
| ------ | ------------------------------- | -------------------------------------------------------------- | ----- | ----- | ----- | ----- |
| 5.2.1  | `schedule`                      | Baseline; `is_pinned` column too                               |       |       |       |       |
| 5.2.2  | `scheduling_run`                | `result_json` JSONB never leaks                                |       |       |       |       |
| 5.2.3  | `teacher_absence`               | Baseline; `nominated_substitute_id` FK doesn't bypass RLS      |       |       |       |       |
| 5.2.4  | `substitution_record`           | `absence_id` FK doesn't bypass RLS                             |       |       |       |       |
| 5.2.5  | `substitution_offer`            | Baseline; per-offer `status` invisible across tenants          |       |       |       |       |
| 5.2.6  | `teacher_competency`            | Pin (`class_id` UUID) and pool (`class_id` NULL) both isolated |       |       |       |       |
| 5.2.7  | `substitute_teacher_competency` | Same as above                                                  |       |       |       |       |
| 5.2.8  | `break_group`                   | Baseline                                                       |       |       |       |       |
| 5.2.9  | `break_group_year_group`        | Join table; tenant_id required                                 |       |       |       |       |
| 5.2.10 | `teacher_scheduling_config`     | JSONB preferences never leak                                   |       |       |       |       |
| 5.2.11 | `exam_session`                  | `status` enum invisible across tenants                         |       |       |       |       |
| 5.2.12 | `exam_slot`                     | `room_id` FK does not bypass RLS                               |       |       |       |       |
| 5.2.13 | `exam_invigilation`             | `staff_profile_id` FK does not bypass RLS                      |       |       |       |       |
| 5.2.14 | `scheduling_scenario`           | `config_snapshot` and `result_json` JSONB never leak           |       |       |       |       |
| 5.2.15 | `rotation_config`               | `week_labels` array isolation                                  |       |       |       |       |
| 5.2.16 | `class_scheduling_requirement`  | Baseline                                                       |       |       |       |       |
| 5.2.17 | `staff_scheduling_preference`   | `preference_type` enum / `priority` invisible                  |       |       |       |       |
| 5.2.18 | `calendar_subscription_token`   | **Critical** — token enumeration check (see 5.4)               |       |       |       |       |
| 5.2.19 | `tenant_scheduling_settings`    | `max_solver_duration` cannot be read across tenants            |       |       |       |       |
| 5.2.20 | `schedule_period_template`      | Baseline                                                       |       |       |       |       |
| 5.2.21 | `class_subject_requirement`     | Baseline                                                       |       |       |       |       |
| 5.2.22 | `curriculum_requirement`        | Baseline                                                       |       |       |       |       |

### 5.3 RLS enforcement on foreign-key chain endpoints

A Tenant `<B>` user attempting to read a child entity via its Tenant `<A>` parent's UUID must be denied at every level. The expectation is **404** (row invisible due to RLS), not 403.

| #      | Endpoint                                                          | Caller        | Expected                               |
| ------ | ----------------------------------------------------------------- | ------------- | -------------------------------------- |
| 5.3.1  | `GET /v1/scheduling/curriculum-requirements/{A_id}`               | `<B>` admin   | 404                                    |
| 5.3.2  | `PATCH /v1/scheduling/curriculum-requirements/{A_id}`             | `<B>` admin   | 404                                    |
| 5.3.3  | `DELETE /v1/scheduling/curriculum-requirements/{A_id}`            | `<B>` admin   | 404                                    |
| 5.3.4  | `GET /v1/scheduling/teacher-competencies/by-teacher/{A_staff_id}` | `<B>` admin   | 200 with empty array (staff invisible) |
| 5.3.5  | `PATCH /v1/scheduling/teacher-competencies/{A_id}`                | `<B>` admin   | 404                                    |
| 5.3.6  | `DELETE /v1/scheduling/break-groups/{A_id}`                       | `<B>` admin   | 404                                    |
| 5.3.7  | `DELETE /v1/scheduling/room-closures/{A_id}`                      | `<B>` admin   | 404                                    |
| 5.3.8  | `DELETE /v1/scheduling/teacher-config/{A_id}`                     | `<B>` admin   | 404                                    |
| 5.3.9  | `GET /v1/scheduling/runs/{A_run_id}`                              | `<B>` admin   | 404                                    |
| 5.3.10 | `POST /v1/scheduling/runs/{A_run_id}/apply`                       | `<B>` admin   | 404                                    |
| 5.3.11 | `POST /v1/scheduling/runs/{A_run_id}/cancel`                      | `<B>` admin   | 404                                    |
| 5.3.12 | `GET /v1/scheduling-runs/{A_run_id}`                              | `<B>` admin   | 404                                    |
| 5.3.13 | `GET /v1/scheduling-runs/{A_run_id}/diagnostics`                  | `<B>` admin   | 404                                    |
| 5.3.14 | `POST /v1/scheduling-runs/{A_run_id}/diagnostics/simulate`        | `<B>` admin   | 404                                    |
| 5.3.15 | `PATCH /v1/scheduling-runs/{A_run_id}/adjustments`                | `<B>` admin   | 404                                    |
| 5.3.16 | `POST /v1/scheduling-runs/{A_run_id}/apply`                       | `<B>` admin   | 404                                    |
| 5.3.17 | `DELETE /v1/scheduling/absences/{A_absence_id}`                   | `<B>` admin   | 404                                    |
| 5.3.18 | `POST /v1/scheduling/absences/{A_absence_id}/cancel`              | `<B>` admin   | 404                                    |
| 5.3.19 | `GET /v1/scheduling/absences/{A_absence_id}/substitutes`          | `<B>` admin   | 404                                    |
| 5.3.20 | `POST /v1/scheduling/offers/{A_offer_id}/accept`                  | `<B>` teacher | 404                                    |
| 5.3.21 | `POST /v1/scheduling/offers/{A_offer_id}/decline`                 | `<B>` teacher | 404                                    |
| 5.3.22 | `GET /v1/scheduling/timetable/teacher/{A_staff_id}`               | `<B>` admin   | 404                                    |
| 5.3.23 | `GET /v1/scheduling/timetable/class/{A_class_id}`                 | `<B>` admin   | 404                                    |
| 5.3.24 | `DELETE /v1/scheduling/calendar-tokens/{A_token_id}`              | `<B>` teacher | 404                                    |
| 5.3.25 | `GET /v1/timetables/teacher/{A_staff_id}`                         | `<B>` admin   | 404                                    |
| 5.3.26 | `GET /v1/timetables/class/{A_class_id}`                           | `<B>` admin   | 404                                    |
| 5.3.27 | `GET /v1/timetables/room/{A_room_id}`                             | `<B>` admin   | 404                                    |
| 5.3.28 | `GET /v1/timetables/student/{A_student_id}`                       | `<B>` admin   | 404                                    |
| 5.3.29 | `GET /v1/scheduling/exam-sessions/{A_session_id}`                 | `<B>` admin   | 404                                    |
| 5.3.30 | `DELETE /v1/scheduling/exam-sessions/{A_session_id}`              | `<B>` admin   | 404                                    |
| 5.3.31 | `POST /v1/scheduling/exam-sessions/{A_session_id}/publish`        | `<B>` admin   | 404                                    |
| 5.3.32 | `GET /v1/scheduling/scenarios/{A_scenario_id}`                    | `<B>` admin   | 404                                    |
| 5.3.33 | `POST /v1/scheduling/scenarios/{A_scenario_id}/solve`             | `<B>` admin   | 404                                    |
| 5.3.34 | `GET /v1/schedules/{A_schedule_id}`                               | `<B>` admin   | 404                                    |
| 5.3.35 | `POST /v1/schedules/{A_schedule_id}/pin`                          | `<B>` admin   | 404                                    |
| 5.3.36 | `POST /v1/scheduling/swaps/execute` with `<A>` schedule IDs       | `<B>` admin   | 404 or 422                             |

### 5.4 Public iCalendar token cross-tenant attack

The public `/v1/calendar/:tenantId/:token.ics` endpoint deserves special scrutiny because it is unauthenticated.

| #     | Scenario                                                                             | Expected                                                            |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 5.4.1 | `GET /v1/calendar/<A_tenant_id>/<A_token>.ics` — valid pair                          | 200 + valid VCALENDAR                                               |
| 5.4.2 | `GET /v1/calendar/<B_tenant_id>/<A_token>.ics` — token belongs to A but URL claims B | 404                                                                 |
| 5.4.3 | `GET /v1/calendar/<A_tenant_id>/<random_64_hex>.ics` — random token in A's namespace | 404                                                                 |
| 5.4.4 | `GET /v1/calendar/<A_tenant_id>/<revoked_token>.ics` — token was revoked via DELETE  | 404 or 410                                                          |
| 5.4.5 | `GET /v1/calendar/not-a-uuid/<A_token>.ics` — malformed tenantId path param          | 400 (ParseUUIDPipe failure)                                         |
| 5.4.6 | `GET /v1/calendar/<A_tenant_id>/<A_token>.ics` 200 times in 60s                      | first ~100 succeed; rest 429                                        |
| 5.4.7 | Token from Tenant A used after the underlying staff profile is deactivated           | 200 with empty calendar OR 404 (define + lock the chosen behaviour) |

### 5.5 RLS bypass attempts via SQL injection / payload smuggling

| #     | Attempt                                                                                                               | Expected                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 5.5.1 | `GET /v1/scheduling/runs?academic_year_id='; DROP TABLE scheduling_run;--`                                            | 422 (Zod UUID failure); DB untouched                                                                                    |
| 5.5.2 | `GET /v1/scheduling/curriculum-requirements?sort=name%20UNION%20SELECT%20*%20FROM%20users`                            | 422 or 200 with `sort` ignored; never executes UNION                                                                    |
| 5.5.3 | `POST /v1/scheduling-runs` body containing `tenant_id: { in: [<A>, <B>] }` (Prisma relation-filter injection attempt) | Zod strips unknown fields; row created with caller's tenant only                                                        |
| 5.5.4 | Direct `$queryRawUnsafe`/`$executeRawUnsafe` outside RLS middleware                                                   | `grep -r '$executeRawUnsafe\|$queryRawUnsafe' apps/api/src/modules/` returns only `common/middleware/rls.middleware.ts` |
| 5.5.5 | `POST /v1/scheduling/teacher-competencies` body with `tenant_id` field set to `<B>`                                   | Zod strips field; row inserted with caller's tenant                                                                     |
| 5.5.6 | Forged JWT with `tenant_id` claim swapped to `<B>` while signed with `<A>`'s secret                                   | 401 (signature verification fails)                                                                                      |
| 5.5.7 | Valid JWT for `<A>` paired with `X-Tenant-Id: <B>` header                                                             | Header ignored; tenant context comes from JWT only                                                                      |

---

## 6. Cross-module data invariants

These are machine-executable assertions on the database state after a successful run is applied. Each row is one Jest test that runs SQL after the fixture is in place.

### 6.1 Curriculum coverage

| #     | Invariant                                                                                                                                                                | SQL / check                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1.1 | After applying a completed run, total scheduled minutes per `(class, subject)` ≥ `curriculum_requirement.min_periods_per_week × period_duration`                         | Group `schedule` JOIN `schedule_period_template` by `class_id, subject_id`; SUM minutes; LEFT JOIN `curriculum_requirement`; assert no row violates ≥ |
| 6.1.2 | `preferred_periods_per_week` is a soft preference: violations are reported in `scheduling_run.soft_preference_score`, never reduce coverage below `min_periods_per_week` | Cross-check `result_json.metrics.soft_preference_score` against actual coverage gaps                                                                  |
| 6.1.3 | `max_periods_per_day` per `(class, subject)` is never exceeded                                                                                                           | Group by `class_id, subject_id, weekday`; assert COUNT ≤ `max_periods_per_day`                                                                        |
| 6.1.4 | If `requires_double_period = true`, at least `double_period_count` adjacent same-subject pairs exist for that class                                                      | Window function over `weekday, period_order`; count adjacent same-subject pairs; assert ≥ requirement                                                 |

### 6.2 Teacher non-collision

| #     | Invariant                                                                                                                                                                    | SQL / check                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 6.2.1 | No teacher is in two places at the same `(weekday, period_order)`                                                                                                            | `SELECT teacher_staff_id, weekday, period_order, COUNT(*) FROM schedule GROUP BY ... HAVING COUNT(*) > 1` returns 0 |
| 6.2.2 | Teacher absences during a period MUST resolve to either: (a) a confirmed `substitution_record`, or (b) the original `schedule.teacher_staff_id` swapped via emergency change | LEFT JOIN `teacher_absence` to `schedule` on overlapping periods; assert covered                                    |
| 6.2.3 | A teacher accepting a `substitution_offer` for `(absence, schedule)` MUST NOT already be teaching another class at the same period                                           | Pre-accept conflict check; if violated, the accept endpoint must return 409                                         |

### 6.3 Room non-collision

| #     | Invariant                                                                                                   | SQL / check                                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 6.3.1 | No room is in two places at the same `(weekday, period_order)`                                              | `SELECT room_id, weekday, period_order, COUNT(*) FROM schedule WHERE room_id IS NOT NULL GROUP BY ... HAVING COUNT(*) > 1` returns 0 |
| 6.3.2 | A `room_closure` for a date+period prevents any `schedule` from being applied with that room on that period | LEFT JOIN `room_closure` to `schedule` (date intersection); assert no overlap when `is_pinned = false`                               |
| 6.3.3 | When `room_closure` is added AFTER a run is applied, future emergency-changes must respect it               | POST `/v1/scheduling/emergency-change` with the closed room → 409 with `code='ROOM_CLOSED'`                                          |

### 6.4 Class non-collision

| #     | Invariant                                                                                          | SQL / check                                                                                                 |
| ----- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 6.4.1 | No class is booked into two rooms at the same `(weekday, period_order)`                            | `SELECT class_id, weekday, period_order, COUNT(*) FROM schedule GROUP BY ... HAVING COUNT(*) > 1` returns 0 |
| 6.4.2 | A class never has overlapping `(weekday, period_order)` with itself even across different subjects | Same group-by check                                                                                         |

### 6.5 Pinned-entry preservation

| #     | Invariant                                                                                                                                                                                | SQL / check                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 6.5.1 | All `schedule` rows with `is_pinned = true` BEFORE a run is triggered MUST appear identically in `scheduling_run.result_json.entries` (same class, weekday, period_order, room, teacher) | Pre-run snapshot of pinned entries; post-solve, every entry must match |
| 6.5.2 | After applying a run, the pinned `schedule` rows still exist with `is_pinned = true` and `source = 'pinned'`                                                                             | Snapshot pinned set pre-run; assert identical set post-apply           |
| 6.5.3 | Unpin before re-run releases the constraint: solver may choose a different placement                                                                                                     | Two-run test — unpin between runs; verify diff in placement is allowed |
| 6.5.4 | A pinned entry whose period was deleted (period template removed) BEFORE the run causes a 409 on `POST /v1/scheduling-runs` with `code='PINNED_ENTRY_INVALID'`                           | Delete period template; trigger run; assert 409                        |

### 6.6 Soft-preference scoring

| #     | Invariant                                                                                                    | SQL / check                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 6.6.1 | `scheduling_run.soft_preference_score ≤ scheduling_run.soft_preference_max`                                  | Direct column check                                                                           |
| 6.6.2 | `soft_preference_score = 0` when no `staff_scheduling_preference` rows exist                                 | Delete prefs; trigger run; assert score = 0                                                   |
| 6.6.3 | A staff preference of `priority='high'` weighs ≥ a `priority='low'` preference of the same kind in the score | Synthetic test: same conflict, different priorities → high-priority unmet costs more in score |

### 6.7 Run-to-timetable consistency

| #     | Invariant                                                                                                                                                                                       | SQL / check                                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.7.1 | After `POST /v1/scheduling-runs/:id/apply` succeeds, the count of `schedule` rows where `scheduling_run_id = :id` equals `scheduling_run.entries_generated - scheduling_run.entries_unassigned` | `COUNT(*) FROM schedule WHERE scheduling_run_id = :id` matches metric                                                                                   |
| 6.7.2 | Only ONE `scheduling_run` per `(tenant_id, academic_year_id)` may have `status = 'applied'` AND be the latest                                                                                   | Domain rule: there is no enum for "current_applied", but the latest `applied_at` is treated as the live timetable. Older `applied` runs are historical. |
| 6.7.3 | Discarding a run does NOT delete its `schedule` rows if it was never applied (they should never have existed); test by snapshotting `schedule` count before/after discard                       | `COUNT(*) FROM schedule` pre-discard == post-discard                                                                                                    |
| 6.7.4 | Applying a SECOND run for the same academic year replaces the first applied run's entries: `schedule` rows from the first run are deleted, second run's are inserted (transactionally)          | Two-run sequence with same year_id; assert old `scheduling_run_id` rows are gone, new ones present                                                      |

### 6.8 Substitution invariants

| #     | Invariant                                                                                                                               | SQL / check                                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6.8.1 | At most one `substitution_record.status='confirmed'` per `(absence_id, schedule_id)`                                                    | `SELECT absence_id, schedule_id, COUNT(*) FROM substitution_record WHERE status='confirmed' GROUP BY ... HAVING COUNT(*) > 1` returns 0          |
| 6.8.2 | A `substitution_offer.status='accepted'` always has a sibling `substitution_record.status='confirmed'` with the same `staff_profile_id` | Cross-table check                                                                                                                                |
| 6.8.3 | When `teacher_absence.cancelled_at` is set, ALL related `substitution_offer` rows transition to `revoked`                               | `SELECT COUNT(*) FROM substitution_offer WHERE absence_id IN (cancelled absences) AND status NOT IN ('revoked','declined','accepted')` returns 0 |
| 6.8.4 | Self-reported absence with `nominated_substitute_staff_id` creates exactly one `substitution_offer` to that staff first                 | Trace: post `selfReportAbsence` → first offer goes to nominee                                                                                    |

### 6.9 Calendar token invariants

| #     | Invariant                                                                                                                             | SQL / check                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 6.9.1 | `calendar_subscription_token.token` is unique within `tenant_id`; collisions across tenants permitted (none should occur in practice) | `CREATE UNIQUE INDEX` check; insert attempt to dupe within tenant fails                                        |
| 6.9.2 | `calendar_subscription_token.token` is exactly 64 hex chars                                                                           | Regex `/^[0-9a-f]{64}$/`                                                                                       |
| 6.9.3 | A token can be revoked but not resurrected                                                                                            | DELETE then GET `.ics` → 404; POST same token explicitly → endpoint generates a new random token, never reuses |

### 6.10 Exam invariants

| #      | Invariant                                                                        | SQL / check                           |
| ------ | -------------------------------------------------------------------------------- | ------------------------------------- |
| 6.10.1 | `exam_session.status='published'` cannot transition back to `planning`           | Direct PATCH attempt → 409            |
| 6.10.2 | `exam_slot.start_time < end_time`                                                | DB-level check or assertion at insert |
| 6.10.3 | Two `exam_slot` rows for the same `(date, room_id, time-overlap)` cannot coexist | Group-by check                        |
| 6.10.4 | `exam_invigilation` for the same `staff_profile_id` cannot overlap two slots     | Group-by check                        |

---

## 7. Concurrency / race conditions

Each row below describes a real race that the harness must reproduce by issuing concurrent requests via a parallel HTTP client (e.g., `Promise.all` of 2-N supertest calls). The expected outcome documents which request wins / which 409s.

### 7.1 Run lifecycle races

| #     | Scenario                                                                                                               | Expected outcome                                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1.1 | Two admins call `POST /v1/scheduling-runs` for the same `academic_year_id` simultaneously                              | Exactly ONE returns 201; the other returns 409 with `code='ACTIVE_RUN_EXISTS'`. Verified via DB: only one new row created.                                                               |
| 7.1.2 | Worker dequeues job for `run_X`; meanwhile a second worker (impossibly, but simulated) tries to claim the same run     | Conditional `updateMany(where: { id: run_X, status: 'queued' })` returns count=0 for the second claim — the second worker does NO work.                                                  |
| 7.1.3 | Two admins call `POST /v1/scheduling-runs/:id/apply` on a `completed` run simultaneously                               | Both pass `expected_updated_at` on the way in; the first wins (200). The second returns 409 `code='STALE_VERSION'` because `updated_at` advanced.                                        |
| 7.1.4 | Admin calls `POST /v1/scheduling-runs/:id/discard` while the run is being applied by another admin                     | The discard returns 409 if the apply already mutated `status` to `applied`; otherwise the apply succeeds and discard 409s on `expected_updated_at` mismatch.                             |
| 7.1.5 | Apply timetable from a completed run while another `queued` run exists for the SAME academic year                      | Apply succeeds for the first run (transactional); the queued run remains queued, will overwrite when applied later (per 6.7.4).                                                          |
| 7.1.6 | Cancel while running: admin issues `POST /v1/scheduling-runs/:id/cancel` while the worker is in the CP-SAT solve phase | 200 OK; `status` flipped to `failed`, `failure_reason='Cancelled by user'`. CP-SAT phase cannot be cooperatively interrupted (SCHED-027) — the worker discards its result on completion. |
| 7.1.7 | Cancel a `queued` run that has not started yet                                                                         | 200 OK; status flipped to `failed`; the worker, when it dequeues, sees status != `queued` (per the conditional claim) and exits without solving.                                         |
| 7.1.8 | Cancel a `completed` run (not allowed)                                                                                 | 409 `code='RUN_NOT_CANCELLABLE'`                                                                                                                                                         |

### 7.2 Stale-reaper races

| #     | Scenario                                                                                                                                                                       | Expected outcome                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.2.1 | Worker writes `status='completed'` to `run_X` at the exact moment the stale-reaper cron tries to fail it for being older than `max_solver_duration + 60s`                      | Conditional `updateMany(where: { id: run_X, status: 'running' })` from the reaper returns count=0; the completed status is preserved. **No silent overwrite.**                                |
| 7.2.2 | Stale-reaper picks up `run_Y` that was already in `failed` status                                                                                                              | Reaper's conditional update is a no-op (count=0). No second failure_reason write.                                                                                                             |
| 7.2.3 | Stale-reaper runs every minute; if `run_Z` has been running for `max_solver_duration + 60s + 1s`, it is marked `failed` with `failure_reason='Stale solver — exceeded budget'` | Single observed failure; worker (still running) cannot un-fail the row because its conditional updateMany still uses `where: { status: 'running' }` and finds count=0 after the reaper's win. |

### 7.3 Schedule mutation races

| #     | Scenario                                                                                                                                           | Expected outcome                                                                                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7.3.1 | Two admins call `POST /v1/schedules` with conflicting `(class_id, weekday, period_order)` simultaneously                                           | One succeeds (201); the other returns 201 too IF conflict-detection is advisory; OR 409 IF the unique index enforces it. Verify which the codebase chose; lock the spec to that behaviour. |
| 7.3.2 | Admin pins `schedule_X` while another admin is unpinning it                                                                                        | Both PATCHes succeed; final `is_pinned` reflects the LATER `updated_at` (last-write-wins). No 409 (no optimistic lock on pin/unpin).                                                       |
| 7.3.3 | `POST /v1/scheduling/swaps/execute` for `(A, B)` while another admin deletes `B`                                                                   | If delete wins first: swap returns 404 for `B`. If swap wins: delete returns 404 (row no longer matches expected state).                                                                   |
| 7.3.4 | `POST /v1/scheduling/emergency-change` setting `new_room_id` to a room that is being closed via `POST /v1/scheduling/room-closures` simultaneously | Race outcome depends on transaction order: one wins; the other returns 409 `code='ROOM_CLOSED'` or 422.                                                                                    |

### 7.4 Substitution races

| #     | Scenario                                                                                                                             | Expected outcome                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 7.4.1 | Two teachers `POST /v1/scheduling/offers/:id/accept` for the same offer simultaneously                                               | One returns 200; the other returns 409 `code='OFFER_ALREADY_RESPONDED'`. Conditional updateMany on `status='pending'` enforces this. |
| 7.4.2 | Admin assigns substitute X to absence A while teacher X simultaneously accepts a different offer that conflicts with the same period | Whichever transaction commits second fails with 409 `code='SUBSTITUTE_DOUBLE_BOOKED'`.                                               |
| 7.4.3 | `POST /v1/scheduling/absences/:id/cancel` mid-cascade: the cascade is creating the next-tier offers when the cancel arrives          | All `pending` offers (including just-created ones) flip to `revoked`; cascade aborts on the next iteration check.                    |

### 7.5 Configuration races

| #     | Scenario                                                                                                                             | Expected outcome                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.5.1 | Two admins `POST /v1/scheduling/curriculum-requirements/bulk-upsert` for overlapping `(year_group, subject)` pairs                   | Last writer wins per upsert; harness asserts no row is half-written (transactional).                                                                             |
| 7.5.2 | Admin `POST /v1/scheduling/teacher-competencies/copy` for academic_year B while another admin is adding individual competencies to B | Copy uses a transaction with `INSERT ... ON CONFLICT DO NOTHING`; new individual rows are preserved if added before the copy commits, or skipped if added after. |
| 7.5.3 | `PUT /v1/scheduling/rotation` upsert race                                                                                            | Standard last-write-wins; no 409 (PUT semantics).                                                                                                                |

---

## 8. Webhook / external integrations

The Scheduling module has ONE outbound external dependency: the Python OR-Tools solver sidecar at `SOLVER_PY_URL`. There are NO inbound webhooks (no Resend / Twilio / Stripe). Calendar `.ics` is a public READ endpoint, not a webhook receiver.

### 8.1 Solver sidecar HTTP timeout

| #     | Scenario                                                                                  | Expected outcome                                                                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1.1 | Sidecar accepts the POST but never responds within `max(120s, max_solver_duration + 60s)` | Worker aborts; conditional `updateMany(where: { id, status: 'running' })` writes `status='failed'`, `failure_reason='Solver timeout after Xs'`, `solver_duration_ms` populated. |
| 8.1.2 | Sidecar returns response body 1 second AFTER the worker has already aborted on timeout    | Worker discards the late response; row remains `failed`.                                                                                                                        |
| 8.1.3 | Worker `lockDuration=300_000ms` covers the longest sidecar response window                | Job lock NEVER expires while solver is still working; assert lock extension every 60s.                                                                                          |
| 8.1.4 | Sidecar response time exactly equal to `max_solver_duration` (boundary case)              | Job completes successfully; row status = `completed` not `failed`.                                                                                                              |

### 8.2 Solver sidecar network failure

| #     | Scenario                                                         | Expected outcome                                                                                                                                                              |
| ----- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.2.1 | `SOLVER_PY_URL` host is unreachable (TCP RST / no route to host) | Worker catches `ECONNREFUSED`/`EHOSTUNREACH`; row → `failed`, `failure_reason='Solver unreachable: <error>'`. Job is NOT retried indefinitely (BullMQ retry budget honoured). |
| 8.2.2 | DNS lookup for `SOLVER_PY_URL` fails                             | Same as 8.2.1; `failure_reason` includes the underlying DNS error code.                                                                                                       |
| 8.2.3 | Sidecar accepts TCP connection, then drops mid-stream            | Worker treats as failure; row → `failed`; partial response is discarded.                                                                                                      |
| 8.2.4 | TLS handshake fails (if sidecar is HTTPS)                        | Same as 8.2.1.                                                                                                                                                                |

### 8.3 Solver sidecar 4xx / 5xx responses

| #     | Scenario                                                                           | Expected outcome                                                                                                                                                 |
| ----- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.3.1 | Sidecar returns 500 with a JSON error body                                         | Worker → `status='failed'`; `failure_reason` includes the upstream error message (truncated to 1000 chars).                                                      |
| 8.3.2 | Sidecar returns 502 (bad gateway upstream)                                         | Same as 8.3.1.                                                                                                                                                   |
| 8.3.3 | Sidecar returns 400 with `{ "error": "INFEASIBLE_INPUT" }`                         | Worker → `status='failed'`; `failure_reason='Solver rejected input: INFEASIBLE_INPUT'`. Diagnostics service produces a `categories` entry of `INFEASIBLE_INPUT`. |
| 8.3.4 | Sidecar returns 200 with malformed JSON                                            | Worker → `status='failed'`; `failure_reason='Solver returned invalid JSON'`.                                                                                     |
| 8.3.5 | Sidecar returns 200 with valid JSON that fails the SchedulingResultJson Zod schema | Worker → `status='failed'`; `failure_reason='Solver returned response that failed schema validation: <Zod errors>'`.                                             |

### 8.4 SOLVER_PY_URL unset / API behaviour

| #     | Scenario                                                                            | Expected outcome                                                                             |
| ----- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 8.4.1 | API: `POST /v1/scheduling-runs` succeeds — enqueue does NOT depend on solver health | 201 returned; row `status='queued'`; BullMQ key present.                                     |
| 8.4.2 | Worker: with `SOLVER_PY_URL` empty / undefined                                      | Worker → `status='failed'`; `failure_reason='SOLVER_PY_URL not configured'`. No retry storm. |
| 8.4.3 | Worker: with `SOLVER_PY_URL=http://nonexistent.invalid:5557`                        | DNS failure → 8.2.2.                                                                         |

### 8.5 Outbound request shape contract

| #     | Assertion                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| 8.5.1 | Worker sends POST to `SOLVER_PY_URL/solve` (or whatever path `cp-sat-client-v3.ts` defines) with `Content-Type: application/json` |
| 8.5.2 | Request body matches `SolverInputV3` Zod schema: `period_slots`, `demand`, `pinned`, `preferences`, `constraints` all present     |
| 8.5.3 | Request body NEVER includes `tenant_id` plaintext (the sidecar is tenant-blind by design)                                         |
| 8.5.4 | Request body NEVER includes user PII (staff names, student names, emails) — only opaque IDs                                       |
| 8.5.5 | Request body NEVER includes encrypted columns or secrets                                                                          |
| 8.5.6 | Request includes a per-call timeout matching `max(120000, max_solver_duration_ms + 60000)`                                        |

---

## 9. Cron interactions

### 9.1 Stale-reaper cron — `cron:scheduling:reap-stale-runs`

| #     | Scenario                                                                                                                                     | Expected outcome                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 9.1.1 | A `running` run with `started_at < NOW() - INTERVAL '<max_solver_duration + 60s>'` exists                                                    | The reaper flips it to `failed` with `failure_reason='Stale solver — exceeded budget'` within the next minute.                  |
| 9.1.2 | A `running` run that is younger than the budget is NOT touched                                                                               | Status remains `running`.                                                                                                       |
| 9.1.3 | A `failed` run that is older than the budget is NOT re-failed (idempotency)                                                                  | Conditional updateMany returns count=0; no `failure_reason` rewrite.                                                            |
| 9.1.4 | A `completed` run is NEVER touched, regardless of age                                                                                        | Conditional updateMany filters on `status='running'` only.                                                                      |
| 9.1.5 | The cron is registered with `jobId='cron:scheduling:reap-stale-runs'` so BullMQ deduplicates on restart                                      | Inspect Redis `bull:scheduling:repeat:*` and assert exactly one repeat key exists per worker restart.                           |
| 9.1.6 | The cron payload is `{}` (cross-tenant) — the processor itself iterates all tenants                                                          | Inspect job data via BullMQ admin; payload has no `tenant_id` field.                                                            |
| 9.1.7 | When the reaper iterates tenants, it MUST set `app.current_tenant_id` per tenant before issuing the conditional update                       | Spy on the RLS middleware / pg.pool to assert `SET LOCAL app.current_tenant_id` is issued per tenant in a separate transaction. |
| 9.1.8 | On worker startup, a 30-second grace period is enforced before the first reaper sweep so currently-running solver work isn't unfairly killed | Restart worker; first reaper invocation occurs ≥ 30s after boot.                                                                |
| 9.1.9 | Stale-reaper retention: `removeOnComplete: 10`, `removeOnFail: 50`                                                                           | Inspect job options via BullMQ admin.                                                                                           |

### 9.2 Tenant iteration safety

| #     | Scenario                                                                                                      | Expected outcome                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 9.2.1 | If tenant `<X>`'s tenant row is `status='inactive'`, the reaper SKIPS that tenant                             | Inactive tenant's stale runs are NOT reaped (or are reaped — define + lock the chosen behaviour).                  |
| 9.2.2 | One tenant's reap throws an error; the cron continues to the next tenant rather than aborting the whole sweep | Test by injecting a poison row in tenant `<A>`; assert tenants `<B>` and `<C>` still get reaped.                   |
| 9.2.3 | Reaper DOES NOT bypass RLS by using a privileged DB role                                                      | Inspect connection role; per-tenant reaps run with the same `edupod_app` role + `SET LOCAL app.current_tenant_id`. |

---

## 10. Permission contract matrix — endpoint × role

This is the canonical authorisation matrix. Every endpoint × every role must be exercised by the harness, expecting the status code in the cell. The role legend is in §3.2.

**Cell legend:** `✓` = expected 2xx, `X` = expected 403, `404` = expected 404 (RLS), `401` = unauthenticated, `+` = passes only when the request scope matches caller's identity (e.g., teacher viewing own timetable).

### 10.1 Curriculum requirements

| #      | Method | Path                                                 | O   | P   | VP  | R   | T   | ST  | PA  | U   |
| ------ | ------ | ---------------------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10.1.1 | GET    | `/v1/scheduling/curriculum-requirements`             | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.1.2 | GET    | `/v1/scheduling/curriculum-requirements/:id`         | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.1.3 | POST   | `/v1/scheduling/curriculum-requirements`             | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.1.4 | PATCH  | `/v1/scheduling/curriculum-requirements/:id`         | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.1.5 | DELETE | `/v1/scheduling/curriculum-requirements/:id`         | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.1.6 | POST   | `/v1/scheduling/curriculum-requirements/bulk-upsert` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.1.7 | POST   | `/v1/scheduling/curriculum-requirements/copy`        | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |

### 10.2 Teacher competencies

| #      | Method | Path                                                             | O   | P   | VP  | R   | T   | ST  | PA  | U   |
| ------ | ------ | ---------------------------------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10.2.1 | GET    | `/v1/scheduling/teacher-competencies`                            | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.2.2 | GET    | `/v1/scheduling/teacher-competencies/coverage`                   | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.2.3 | GET    | `/v1/scheduling/teacher-competencies/by-teacher/:staffProfileId` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.2.4 | POST   | `/v1/scheduling/teacher-competencies`                            | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.2.5 | POST   | `/v1/scheduling/teacher-competencies/bulk`                       | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.2.6 | PATCH  | `/v1/scheduling/teacher-competencies/:id`                        | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.2.7 | DELETE | `/v1/scheduling/teacher-competencies/:id`                        | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.2.8 | POST   | `/v1/scheduling/teacher-competencies/copy`                       | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.2.9 | POST   | `/v1/scheduling/teacher-competencies/copy-to-years`              | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |

### 10.3 Substitute competencies

| #      | Method | Path                                             | O   | P   | VP  | R   | T   | ST  | PA  | U   |
| ------ | ------ | ------------------------------------------------ | --- | --- | --- | --- | --- | --- | --- | --- |
| 10.3.1 | GET    | `/v1/scheduling/substitute-competencies`         | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.3.2 | GET    | `/v1/scheduling/substitute-competencies/suggest` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.3.3 | POST   | `/v1/scheduling/substitute-competencies`         | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.3.4 | POST   | `/v1/scheduling/substitute-competencies/bulk`    | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.3.5 | PATCH  | `/v1/scheduling/substitute-competencies/:id`     | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.3.6 | DELETE | `/v1/scheduling/substitute-competencies/:id`     | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.3.7 | POST   | `/v1/scheduling/substitute-competencies/copy`    | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |

### 10.4 Break groups & room closures & teacher config

| #       | Method | Path                                | O   | P   | VP  | R   | T   | ST  | PA  | U   |
| ------- | ------ | ----------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10.4.1  | GET    | `/v1/scheduling/break-groups`       | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.4.2  | POST   | `/v1/scheduling/break-groups`       | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.4.3  | PATCH  | `/v1/scheduling/break-groups/:id`   | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.4.4  | DELETE | `/v1/scheduling/break-groups/:id`   | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.4.5  | GET    | `/v1/scheduling/room-closures`      | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.4.6  | POST   | `/v1/scheduling/room-closures`      | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.4.7  | DELETE | `/v1/scheduling/room-closures/:id`  | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.4.8  | GET    | `/v1/scheduling/teacher-config`     | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.4.9  | PUT    | `/v1/scheduling/teacher-config`     | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.4.10 | DELETE | `/v1/scheduling/teacher-config/:id` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |

### 10.5 Scheduler orchestration & runs

| #       | Method | Path                                           | O   | P   | VP  | R   | T   | ST  | PA  | U   |
| ------- | ------ | ---------------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10.5.1  | POST   | `/v1/scheduling/runs/prerequisites`            | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.2  | POST   | `/v1/scheduling/runs/trigger`                  | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.3  | GET    | `/v1/scheduling/runs`                          | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.4  | GET    | `/v1/scheduling/runs/:id`                      | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.5  | POST   | `/v1/scheduling/runs/:id/apply`                | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.6  | POST   | `/v1/scheduling/runs/:id/discard`              | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.7  | POST   | `/v1/scheduling/runs/:id/cancel`               | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.8  | GET    | `/v1/scheduling/runs/:id/status`               | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.9  | POST   | `/v1/scheduling/runs/:id/validate`             | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.10 | GET    | `/v1/scheduling-runs`                          | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.11 | POST   | `/v1/scheduling-runs`                          | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.12 | GET    | `/v1/scheduling-runs/feasibility`              | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.13 | GET    | `/v1/scheduling-runs/:id`                      | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.14 | GET    | `/v1/scheduling-runs/:id/diagnostics`          | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.15 | POST   | `/v1/scheduling-runs/:id/diagnostics/simulate` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.16 | POST   | `/v1/scheduling-runs/:id/cancel`               | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.17 | PATCH  | `/v1/scheduling-runs/:id/adjustments`          | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.18 | POST   | `/v1/scheduling-runs/:id/apply`                | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.5.19 | POST   | `/v1/scheduling-runs/:id/discard`              | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |

### 10.6 Substitution flow

| #       | Method | Path                                                | O   | P   | VP  | R   | T   | ST  | PA  | U   |
| ------- | ------ | --------------------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10.6.1  | POST   | `/v1/scheduling/absences`                           | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.6.2  | POST   | `/v1/scheduling/absences/self-report`               | X   | X   | X   | X   | ✓   | X   | X   | 401 |
| 10.6.3  | GET    | `/v1/scheduling/absences`                           | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.6.4  | DELETE | `/v1/scheduling/absences/:id`                       | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.6.5  | POST   | `/v1/scheduling/absences/:id/cancel`                | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.6.6  | POST   | `/v1/scheduling/absences/:id/cancel-own`            | X   | X   | X   | X   | ✓+  | X   | X   | 401 |
| 10.6.7  | GET    | `/v1/scheduling/absences/:absenceId/substitutes`    | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.6.8  | GET    | `/v1/scheduling/absences/:absenceId/substitutes/ai` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.6.9  | POST   | `/v1/scheduling/substitutions`                      | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.6.10 | GET    | `/v1/scheduling/substitutions`                      | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.6.11 | GET    | `/v1/scheduling/substitution-board`                 | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.6.12 | GET    | `/v1/scheduling/offers/my`                          | X   | X   | X   | X   | ✓   | X   | X   | 401 |
| 10.6.13 | POST   | `/v1/scheduling/offers/:id/accept`                  | X   | X   | X   | X   | ✓+  | X   | X   | 401 |
| 10.6.14 | POST   | `/v1/scheduling/offers/:id/decline`                 | X   | X   | X   | X   | ✓+  | X   | X   | 401 |
| 10.6.15 | GET    | `/v1/scheduling/colleagues`                         | X   | X   | X   | X   | ✓   | X   | X   | 401 |
| 10.6.16 | GET    | `/v1/scheduling/teachers`                           | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |

### 10.7 Cover reports

| #      | Method | Path                                         | O   | P   | VP  | R   | T   | ST  | PA  | U   |
| ------ | ------ | -------------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10.7.1 | GET    | `/v1/scheduling/cover-reports`               | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.7.2 | GET    | `/v1/scheduling/cover-reports/fairness`      | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.7.3 | GET    | `/v1/scheduling/cover-reports/by-department` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |

### 10.8 Swap & emergency change

| #      | Method | Path                              | O   | P   | VP  | R   | T   | ST  | PA  | U   |
| ------ | ------ | --------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10.8.1 | POST   | `/v1/scheduling/swaps/validate`   | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.8.2 | POST   | `/v1/scheduling/swaps/execute`    | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.8.3 | POST   | `/v1/scheduling/emergency-change` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |

### 10.9 Personal timetable & calendar tokens

| #      | Method | Path                                        | O   | P   | VP  | R   | T   | ST  | PA  | U   |
| ------ | ------ | ------------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10.9.1 | GET    | `/v1/scheduling/timetable/teacher/:staffId` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.9.2 | GET    | `/v1/scheduling/timetable/my`               | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | X   | 401 |
| 10.9.3 | GET    | `/v1/scheduling/timetable/class/:classId`   | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.9.4 | POST   | `/v1/scheduling/calendar-tokens`            | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | X   | 401 |
| 10.9.5 | GET    | `/v1/scheduling/calendar-tokens`            | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | X   | 401 |
| 10.9.6 | DELETE | `/v1/scheduling/calendar-tokens/:tokenId`   | ✓   | ✓   | ✓   | ✓   | ✓+  | ✓+  | X   | 401 |

### 10.10 Rotation, exams, scenarios

| #        | Method | Path                                       | O   | P   | VP  | R   | T   | ST  | PA  | U   |
| -------- | ------ | ------------------------------------------ | --- | --- | --- | --- | --- | --- | --- | --- |
| 10.10.1  | PUT    | `/v1/scheduling/rotation`                  | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.10.2  | GET    | `/v1/scheduling/rotation`                  | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.10.3  | DELETE | `/v1/scheduling/rotation`                  | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.10.4  | GET    | `/v1/scheduling/rotation/current-week`     | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.10.5  | POST   | `/v1/scheduling/exam-sessions`             | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.10.6  | GET    | `/v1/scheduling/exam-sessions`             | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.10.7  | DELETE | `/v1/scheduling/exam-sessions/:id`         | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.10.8  | POST   | `/v1/scheduling/exam-sessions/:id/publish` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.10.9  | POST   | `/v1/scheduling/scenarios`                 | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.10.10 | POST   | `/v1/scheduling/scenarios/:id/solve`       | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.10.11 | POST   | `/v1/scheduling/scenarios/compare`         | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |

### 10.11 Schedules & timetables

| #        | Method | Path                                     | O   | P   | VP  | R   | T   | ST  | PA  | U   |
| -------- | ------ | ---------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10.11.1  | POST   | `/v1/schedules`                          | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.11.2  | GET    | `/v1/schedules`                          | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.11.3  | PATCH  | `/v1/schedules/:id`                      | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.11.4  | DELETE | `/v1/schedules/:id`                      | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.11.5  | POST   | `/v1/schedules/:id/pin`                  | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.11.6  | POST   | `/v1/schedules/:id/unpin`                | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.11.7  | GET    | `/v1/timetables/teacher/:staffProfileId` | ✓   | ✓   | ✓   | ✓   | ✓+  | X   | X   | 401 |
| 10.11.8  | GET    | `/v1/timetables/class/:classId`          | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.11.9  | GET    | `/v1/timetables/room/:roomId`            | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.11.10 | GET    | `/v1/timetables/student/:studentId`      | ✓   | ✓   | ✓   | ✓   | X   | X   | ✓+  | 401 |
| 10.11.11 | GET    | `/v1/reports/workload`                   | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |

### 10.12 Dashboard

| #       | Method | Path                                        | O   | P   | VP  | R   | T   | ST  | PA  | U   |
| ------- | ------ | ------------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10.12.1 | GET    | `/v1/scheduling-dashboard/overview`         | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.12.2 | GET    | `/v1/scheduling-dashboard/workload`         | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.12.3 | GET    | `/v1/scheduling-dashboard/unassigned`       | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.12.4 | GET    | `/v1/scheduling-dashboard/room-utilisation` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.12.5 | GET    | `/v1/scheduling-dashboard/trends`           | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | 401 |
| 10.12.6 | GET    | `/v1/scheduling-dashboard/preferences`      | ✓   | ✓   | ✓   | ✓   | ✓+  | X   | X   | 401 |

### 10.13 Public iCalendar

| #       | Method | Path                                | O   | P   | VP  | R   | T   | ST  | PA  | U   |
| ------- | ------ | ----------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10.13.1 | GET    | `/v1/calendar/:tenantId/:token.ics` | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |

(The public endpoint accepts unauthenticated requests; the token IS the auth.)

### 10.14 Negative-permission edge cases

| #        | Scenario                                                                                                     | Expected                                             |
| -------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 10.14.1  | Teacher with `schedule.view_own` only calls `GET /v1/scheduling/timetable/teacher/<other_staff>`             | 403                                                  |
| 10.14.2  | Teacher with `schedule.view_own` calls `GET /v1/scheduling/timetable/teacher/<own_staff_id>`                 | 200 with own grid                                    |
| 10.14.3  | Teacher with `schedule.view_own` calls `GET /v1/scheduling/timetable/my`                                     | 200                                                  |
| 10.14.4  | Teacher with NO `schedule.view_own_satisfaction` calls `GET /v1/scheduling-dashboard/preferences`            | 403                                                  |
| 10.14.5  | Teacher with `schedule.view_own_satisfaction` only — response rows are filtered to own staff_id              | 200 with rows where `staff_profile_id = caller`      |
| 10.14.6  | Teacher with `schedule.respond_to_offer` calls `POST /v1/scheduling/offers/<other_teacher_offer_id>/accept`  | 404 (offer not visible to caller)                    |
| 10.14.7  | Teacher self-cancels another teacher's absence via `POST /v1/scheduling/absences/<other_absence>/cancel-own` | 403 `code='ABSENCE_NOT_OWNED'` or 404                |
| 10.14.8  | Parent calls `GET /v1/scheduling/timetable/my`                                                               | 403 (no `schedule.view_own` for parents in the seed) |
| 10.14.9  | Parent calls `GET /v1/timetables/student/<linked_child_id>`                                                  | 200                                                  |
| 10.14.10 | Parent calls `GET /v1/timetables/student/<unlinked_child_id>`                                                | 403 or 404 — lock the chosen behaviour               |
| 10.14.11 | Student calls `POST /v1/scheduling/calendar-tokens` with `entity_type='class'` and `entity_id=<own_class>`   | 201 with token                                       |
| 10.14.12 | Student calls `POST /v1/scheduling/calendar-tokens` with `entity_type='teacher'` and `entity_id=<any_staff>` | 403                                                  |

---

## 11. Encrypted / sensitive field handling

The Scheduling module has **no AES-256-encrypted columns**. Per the inventory, `teacher_scheduling_config.preferences` is JSONB with non-secret preference data (max periods, day-off requests). Nothing in the module touches Stripe keys, bank details, or other secrets. This section verifies that fact and that nothing leaks accidentally.

| #      | Assertion                                                                                                                                                                           | Method                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 11.1.1 | No scheduling table column is registered in the encryption interceptor / encrypted-fields registry                                                                                  | Inspect `EncryptionService` registry; assert no `schedule.*` model entries.                                  |
| 11.1.2 | `teacher_scheduling_config.preferences` JSONB does NOT contain user passwords, API keys, or Stripe identifiers                                                                      | Synthetic seed; PUT a config; verify only allowlisted fields persist.                                        |
| 11.1.3 | `scheduling_run.config_snapshot` JSONB contains tenant data (subjects, teachers, periods) but NEVER includes user passwords, JWT secrets, encryption keys, or PII beyond opaque IDs | Trigger a run; SELECT `config_snapshot::text`; grep for `password`, `secret`, `api_key`, `@`; assert empty.  |
| 11.1.4 | `scheduling_run.result_json` JSONB never includes encryption keys or secrets from upstream env                                                                                      | Same grep approach.                                                                                          |
| 11.1.5 | Solver sidecar request body (per §8.5) never includes encrypted fields                                                                                                              | Tap the outbound HTTP via mock sidecar; assert payload is encryption-free.                                   |
| 11.1.6 | Audit log entries for scheduling actions do NOT serialise `config_snapshot` or `result_json` in full (size + privacy)                                                               | Inspect `audit_log.payload` for run-related actions; assert summary fields only (run_id, status, who, when). |
| 11.1.7 | API list responses (`GET /v1/scheduling-runs`) exclude `result_json`, `config_snapshot`, `proposed_adjustments`, and `diagnostics_refined_report` JSONB columns                     | Schema-assert response shape per 4.22.5.                                                                     |
| 11.1.8 | `GET /v1/calendar/:tenantId/:token.ics` response body never includes user emails, phone numbers, or any PII beyond names + class/subject names                                      | Generate an .ics for a teacher; grep for `@`, `BEGIN:VEVENT`...`END:VEVENT` blocks for sensitive fields.     |
| 11.1.9 | Diagnostics reports never include staff names in plain text — only `staff_id` references that the frontend resolves                                                                 | Inspect `diagnostics_refined_report.categories[*].entries`; assert `staff_id` opaque, not name strings.      |

---

## 12. Observations / gaps spotted

The following deserve discussion with the engineering team. None are integration-test rows; they are observations made while writing this spec.

### 12.1 Two parallel run controllers

Both `SchedulerOrchestrationController` (`/v1/scheduling/runs/*`) AND `SchedulingRunsController` (`/v1/scheduling-runs/*`) expose run lifecycle endpoints. The frontend inventory shows the canonical path is `/v1/scheduling-runs`, but the legacy `/v1/scheduling/runs/*` is still wired. Decision needed: deprecate one path, or document that they coexist and which is primary.

### 12.2 Optimistic concurrency only on `apply` and `discard` and `adjustments`

`expected_updated_at` is enforced on `apply`, `discard`, and `addAdjustment` per the schemas, but NOT on `cancel`. Two simultaneous cancels could race; current behaviour is "first wins, second is a no-op." Confirm this is intended (it likely is — cancels are inherently idempotent — but the spec authors should confirm).

### 12.3 Stale-reaper cross-tenant policy for inactive tenants

§9.2.1 flags a defensible-either-way decision: should the reaper skip tenants whose `tenants.status='inactive'`? If a tenant goes inactive while a run is queued, the run will sit forever. Lock the chosen policy in code and reflect in this spec.

### 12.4 Calendar token revocation semantics

§5.4.4 calls for either 404 or 410 when a revoked token is used. Pick one and stick to it (410 Gone is more correct semantically; 404 is more privacy-preserving since it doesn't confirm the token ever existed).

### 12.5 Unique-index vs advisory conflict detection on `schedule`

§7.3.1 currently allows two outcomes (both-succeed vs one-409). The codebase needs a definitive answer: is conflict detection in the create path advisory (returns warnings, allows save) or enforced (rejects with 409)? The frontend's `ConflictAlert` UI suggests advisory, but for integration testing this should be locked.

### 12.6 No tenant-level rate limit visible for `/v1/scheduling-runs`

A poorly-behaved tenant could trigger 1000 runs and queue them all. The conditional create (`only one active run per academic_year_id`) limits queue depth to `n_academic_years`, but no per-tenant rate limit on run creation appears in the inventory. Pre-launch consideration.

### 12.7 Public `.ics` endpoint rate limiting

§4.21.1 and §5.4.6 assume a per-token rate limit. The inventory does not confirm one is wired. If absent, document as a gap and either implement or accept the risk pre-launch.

### 12.8 `SchedulingEnhancedController` size

766 LOC monolith. Cross-references the danger-zones document. Splitting it is post-launch refactor; for testing purposes this spec treats each method as independent.

---

## 13. Sign-off

| Item                                   | Signer            | Date       | Notes                                 |
| -------------------------------------- | ----------------- | ---------- | ------------------------------------- |
| Spec author                            | Claude (Opus 4.7) | 2026-04-17 | Generated from Scheduling inventories |
| Backend lead review                    |                   |            |                                       |
| Solver / worker review                 |                   |            |                                       |
| QA harness implementation owner        |                   |            |                                       |
| Security review (RLS, public endpoint) |                   |            |                                       |
| Final approval to run as gating leg    |                   |            |                                       |

**Total numbered rows in this spec:** see report.

**Spec status:** Draft — pending review.
