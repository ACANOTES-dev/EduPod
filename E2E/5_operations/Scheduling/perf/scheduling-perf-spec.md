# Performance Test Specification: Scheduling Module

> **Leg 4 of the `/e2e-full` release-readiness pack.** This spec exercises what the UI, integration, worker, and security specs cannot: request latency under load, solver wall-clock at realistic scale tiers, page bundle / cold-start budgets, and contention on shared resources (the BullMQ `scheduling` queue, the OR-Tools sidecar, and the live `schedule` table during apply). Runnable by k6 / Artillery / Lighthouse against a staging environment seeded at scale.

**Module:** Scheduling (auto-scheduler, timetables, substitutions, exams, scenarios, analytics)
**Target executor:** k6 (load), Lighthouse (page), BullMQ load script (worker), `pg_stat_statements` + EXPLAIN ANALYZE (DB), CPython sidecar profiler (solver)
**Baseline tenant:** `nhqs`, seeded per §3 **Perf Seed** below.
**Source inventories:**

- `/Users/ram/Desktop/SDB/E2E/5_operations/Scheduling/.inventory-backend.md` (14 controllers, ~140 endpoints)
- `/Users/ram/Desktop/SDB/E2E/5_operations/Scheduling/.inventory-frontend.md` (34 pages)
- `/Users/ram/Desktop/SDB/E2E/5_operations/Scheduling/.inventory-worker.md` (2 jobs, 1 cron)

**What perf failure looks like:**

- A solver run that exceeds the tenant's `max_solver_duration` cap and is reaped silently while the user stares at "running…" in the UI.
- The substitution board on a kiosk display slowing past its 60-second auto-refresh because `GET /v1/scheduling/substitution-board` p95 has crept above 800 ms.
- 700 parents fetching their child's timetable at 07:50 and the timetable API saturating the connection pool, blocking unrelated traffic.
- The `scheduling-runs` history page taking 3+ seconds to first byte because `result_json` (which can be 3-5 MB) is being returned in the list endpoint instead of being excluded.
- The OR-Tools sidecar dying mid-solve, the worker not retrying, and the run sitting at `running` until the stale-reaper cron kills it 60s after `max_solver_duration`.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Out of Scope](#2-out-of-scope)
3. [Perf Seed Baseline](#3-perf-seed-baseline)
4. [Endpoint Latency Budgets](#4-endpoint-latency-budgets)
5. [Solver Budgets — Wall-Clock per Scale Tier](#5-solver-budgets)
6. [Scale Matrix — Classes × Teachers × Periods × Weeks](#6-scale-matrix)
7. [Concurrency / Contention Scenarios](#7-concurrency--contention)
8. [Page Bundle & Cold-Start Budgets](#8-page-bundle--cold-start)
9. [N+1 Query Budgets](#9-n1-query-budgets)
10. [Cache Strategy](#10-cache-strategy)
11. [Solver Sidecar Performance](#11-solver-sidecar)
12. [BullMQ / Redis Footprint](#12-bullmq--redis-footprint)
13. [DB Query Analysis](#13-db-query-analysis)
14. [Coverage Holes](#14-coverage-holes)
15. [Observations / Gaps Spotted](#15-observations--gaps)
16. [Sign-off](#16-sign-off)

---

## 1. Prerequisites

- Staging environment: 1 API instance (2 vCPU, 4 GB), 1 worker (2 vCPU, 2 GB), 1 OR-Tools sidecar (4 vCPU, 4 GB), Postgres (2 vCPU, 4 GB, `pg_stat_statements` ON), Redis (1 GB memory)
- Seeded to match §3 across three tenants: `nhqs` (medium baseline), `stress-a` (large), `stress-d` (small)
- k6 ≥ 0.49 or Artillery installed locally
- Lighthouse CI available (`npx @lhci/cli`)
- Playwright with `--trace on` for per-page network + CPU profiling
- Direct DB access for `EXPLAIN ANALYZE` and `pg_stat_statements` queries
- Redis access for BullMQ size / lag measurements
- HTTP client able to call `SOLVER_PY_URL` directly for solver-only benchmarking
- Seeder script: `apps/api/scripts/perf-seed-scheduling.ts` (build if absent; documented target)

---

## 2. Out of Scope

This spec covers performance. It does **NOT** cover:

- Functional correctness — see leg-1 UI specs (admin/teacher/parent/student views)
- API contract / RLS — see `integration/scheduling-integration-spec.md`
- Worker correctness — see `worker/scheduling-worker-spec.md`
- Security (token tampering on `.ics` endpoints, IDOR on competency CRUD) — see `security/scheduling-security-spec.md`
- Production-peak simulation (multiple tenants solving simultaneously across the cluster) — deferred to pre-launch load-testing cycle
- CP-SAT solver internal tuning (heuristics, search strategies) — owned by `packages/shared/src/scheduler/`

---

## 3. Perf Seed Baseline

For the `nhqs` tenant (medium tier — see §6), seed the DB with:

| Entity                          | Count                                | Notes                                                        |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| academic_year (active)          | 1                                    | + 2 historical years for copy-from operations                |
| year_groups                     | 13                                   | Reception → Year 12                                          |
| classes                         | 30                                   | ~2-3 classes per year group                                  |
| subjects                        | 12                                   | English, Math, Science, etc.                                 |
| rooms                           | 35                                   | Mix of standard + 5 specialist (lab, gym, art)               |
| staff_profiles (teaching)       | 60                                   | + 15 substitute-eligible                                     |
| students                        | 750                                  | ~25 per class                                                |
| schedule_period_template        | 8 periods × 5 days = 40 / year group |                                                              |
| curriculum_requirement          | 156                                  | 13 year groups × 12 subjects                                 |
| teacher_competency              | 600                                  | mix of pinned (class_id != null) and pool (class_id = null)  |
| substitute_teacher_competency   | 200                                  |                                                              |
| break_group                     | 8                                    | Lower / Middle / Upper school × Snack / Lunch                |
| room_closure                    | 25                                   | mix of past / future                                         |
| teacher_scheduling_config       | 60                                   | one per teacher                                              |
| staff_scheduling_preference     | 600                                  | ~10 per teacher                                              |
| class_scheduling_requirement    | 30                                   |                                                              |
| class_subject_requirement       | 360                                  | 30 classes × 12 subjects                                     |
| schedule (live, applied)        | 1,200                                | ~30 classes × 40 periods/wk = ~1,200 weekly slots            |
| scheduling_run (historical)     | 50                                   | 40 completed/applied, 5 failed, 5 discarded                  |
| scheduling_run (latest applied) | 1                                    | full `result_json` ~3 MB, `proposed_adjustments` ~500 KB     |
| teacher_absence                 | 200                                  | 150 historical (cancelled/closed), 50 active in next 14 days |
| substitution_record             | 180                                  |                                                              |
| substitution_offer              | 350                                  | mix of accepted / declined / pending                         |
| exam_session                    | 4                                    | 2 planning, 1 published, 1 completed                         |
| exam_slot                       | 80                                   | ~20 per session                                              |
| exam_invigilation               | 80                                   |                                                              |
| scheduling_scenario             | 10                                   | mix of solved / unsolved                                     |
| rotation_config                 | 1 active                             | 2-week cycle (Week A / Week B)                               |
| calendar_subscription_token     | 70                                   | ~60 staff + 10 class-anchored                                |
| tenant_scheduling_settings      | 1                                    | `max_solver_duration_seconds = 600`                          |

`stress-a` (large tier): 2× `nhqs` across all entities.
`stress-d` (small tier): 0.3× `nhqs` across all entities.

Seeder script path: `apps/api/scripts/perf-seed-scheduling.ts` (build this if absent; documented target).

---

## 4. Endpoint Latency Budgets

Test each endpoint at p50 / p95 / p99 using k6 with **10 virtual users for 60 s** at the `nhqs` baseline. Numbering scheme: `SCH-PERF-NNN`.

### 4.1 Teacher Competencies (`/v1/scheduling/teacher-competencies`)

| #            | Surface | Operation                                                               | p50 ≤  | p95 ≤  | p99 ≤  | Notes                                           | Pass/Fail |
| ------------ | ------- | ----------------------------------------------------------------------- | ------ | ------ | ------ | ----------------------------------------------- | --------- |
| SCH-PERF-001 | API     | `GET /v1/scheduling/teacher-competencies` (yearId only, ~600 rows)      | 150 ms | 350 ms | 700 ms | Index `(tenant_id, academic_year_id)` mandatory |           |
| SCH-PERF-002 | API     | `GET /v1/scheduling/teacher-competencies?year_group_id={yg}`            | 100 ms | 250 ms | 500 ms | Smaller slice (~50 rows)                        |           |
| SCH-PERF-003 | API     | `GET /v1/scheduling/teacher-competencies/coverage`                      | 250 ms | 500 ms | 1 s    | Aggregation across competencies + curriculum    |           |
| SCH-PERF-004 | API     | `GET /v1/scheduling/teacher-competencies/by-teacher/:staffProfileId`    | 100 ms | 250 ms | 500 ms | ~10 rows per teacher                            |           |
| SCH-PERF-005 | API     | `GET /v1/scheduling/teacher-competencies/by-subject?...`                | 120 ms | 280 ms | 600 ms |                                                 |           |
| SCH-PERF-006 | API     | `POST /v1/scheduling/teacher-competencies` (single)                     | 150 ms | 350 ms | 700 ms | Single insert + uniqueness check                |           |
| SCH-PERF-007 | API     | `POST /v1/scheduling/teacher-competencies/bulk` (500 rows max)          | 1.2 s  | 2.5 s  | 4 s    | Bulk insert with conflict resolution            |           |
| SCH-PERF-008 | API     | `PATCH /v1/scheduling/teacher-competencies/:id`                         | 100 ms | 250 ms | 500 ms | class_id flip (pin/unpin)                       |           |
| SCH-PERF-009 | API     | `DELETE /v1/scheduling/teacher-competencies/:id`                        | 100 ms | 250 ms | 500 ms |                                                 |           |
| SCH-PERF-010 | API     | `DELETE /v1/scheduling/teacher-competencies/by-teacher/:staffProfileId` | 200 ms | 400 ms | 800 ms | ~10 rows deleted                                |           |
| SCH-PERF-011 | API     | `POST /v1/scheduling/teacher-competencies/copy`                         | 800 ms | 1.5 s  | 3 s    | Copy ~600 rows year-to-year                     |           |
| SCH-PERF-012 | API     | `POST /v1/scheduling/teacher-competencies/copy-to-years` (50 targets)   | 1.2 s  | 2.5 s  | 4 s    | Fan-out copy, max 50 target year-groups         |           |

### 4.2 Substitute Competencies (`/v1/scheduling/substitute-competencies`)

| #            | Surface | Operation                                                                  | p50 ≤  | p95 ≤  | p99 ≤  | Notes                                              | Pass/Fail |
| ------------ | ------- | -------------------------------------------------------------------------- | ------ | ------ | ------ | -------------------------------------------------- | --------- |
| SCH-PERF-013 | API     | `GET /v1/scheduling/substitute-competencies` (~200 rows)                   | 120 ms | 280 ms | 600 ms |                                                    |           |
| SCH-PERF-014 | API     | `GET /v1/scheduling/substitute-competencies/suggest?date=...&schedule_id=` | 250 ms | 600 ms | 1.2 s  | Eligibility match across competency + availability |           |
| SCH-PERF-015 | API     | `GET /v1/scheduling/substitute-competencies/by-teacher/:staffProfileId`    | 100 ms | 250 ms | 500 ms |                                                    |           |
| SCH-PERF-016 | API     | `GET /v1/scheduling/substitute-competencies/by-subject?...`                | 120 ms | 280 ms | 600 ms |                                                    |           |
| SCH-PERF-017 | API     | `POST /v1/scheduling/substitute-competencies` (single)                     | 150 ms | 350 ms | 700 ms |                                                    |           |
| SCH-PERF-018 | API     | `POST /v1/scheduling/substitute-competencies/bulk` (500 max)               | 1.2 s  | 2.5 s  | 4 s    |                                                    |           |
| SCH-PERF-019 | API     | `PATCH /v1/scheduling/substitute-competencies/:id`                         | 100 ms | 250 ms | 500 ms |                                                    |           |
| SCH-PERF-020 | API     | `DELETE /v1/scheduling/substitute-competencies/:id`                        | 100 ms | 250 ms | 500 ms |                                                    |           |
| SCH-PERF-021 | API     | `DELETE /v1/scheduling/substitute-competencies/by-teacher/:staffProfileId` | 200 ms | 400 ms | 800 ms |                                                    |           |
| SCH-PERF-022 | API     | `POST /v1/scheduling/substitute-competencies/copy`                         | 600 ms | 1.2 s  | 2.5 s  |                                                    |           |
| SCH-PERF-023 | API     | `POST /v1/scheduling/substitute-competencies/copy-to-years`                | 1 s    | 2 s    | 3.5 s  |                                                    |           |

### 4.3 Break Groups (`/v1/scheduling/break-groups`)

| #            | Surface | Operation                                   | p50 ≤  | p95 ≤  | p99 ≤  | Notes      | Pass/Fail |
| ------------ | ------- | ------------------------------------------- | ------ | ------ | ------ | ---------- | --------- |
| SCH-PERF-024 | API     | `GET /v1/scheduling/break-groups` (~8 rows) | 80 ms  | 200 ms | 400 ms | Tiny table |           |
| SCH-PERF-025 | API     | `POST /v1/scheduling/break-groups`          | 150 ms | 350 ms | 700 ms |            |           |
| SCH-PERF-026 | API     | `PATCH /v1/scheduling/break-groups/:id`     | 100 ms | 250 ms | 500 ms |            |           |
| SCH-PERF-027 | API     | `DELETE /v1/scheduling/break-groups/:id`    | 100 ms | 250 ms | 500 ms |            |           |

### 4.4 Curriculum Requirements (`/v1/scheduling/curriculum-requirements`)

| #            | Surface | Operation                                                            | p50 ≤  | p95 ≤  | p99 ≤  | Notes                          | Pass/Fail |
| ------------ | ------- | -------------------------------------------------------------------- | ------ | ------ | ------ | ------------------------------ | --------- |
| SCH-PERF-028 | API     | `GET /v1/scheduling/curriculum-requirements` (page 1)                | 150 ms | 350 ms | 700 ms | ~156 rows total                |           |
| SCH-PERF-029 | API     | `GET /v1/scheduling/curriculum-requirements/matrix-subjects?...`     | 120 ms | 280 ms | 600 ms |                                |           |
| SCH-PERF-030 | API     | `GET /v1/scheduling/curriculum-requirements/:id`                     | 80 ms  | 200 ms | 400 ms |                                |           |
| SCH-PERF-031 | API     | `POST /v1/scheduling/curriculum-requirements`                        | 150 ms | 350 ms | 700 ms |                                |           |
| SCH-PERF-032 | API     | `PATCH /v1/scheduling/curriculum-requirements/:id`                   | 100 ms | 250 ms | 500 ms |                                |           |
| SCH-PERF-033 | API     | `DELETE /v1/scheduling/curriculum-requirements/:id`                  | 100 ms | 250 ms | 500 ms |                                |           |
| SCH-PERF-034 | API     | `POST /v1/scheduling/curriculum-requirements/bulk-upsert` (100 rows) | 600 ms | 1.2 s  | 2.5 s  | Used by curriculum matrix save |           |
| SCH-PERF-035 | API     | `POST /v1/scheduling/curriculum-requirements/copy`                   | 800 ms | 1.5 s  | 3 s    | Year-to-year copy              |           |

### 4.5 Room Closures (`/v1/scheduling/room-closures`)

| #            | Surface | Operation                                     | p50 ≤  | p95 ≤  | p99 ≤  | Notes | Pass/Fail |
| ------------ | ------- | --------------------------------------------- | ------ | ------ | ------ | ----- | --------- |
| SCH-PERF-036 | API     | `GET /v1/scheduling/room-closures` (~25 rows) | 100 ms | 250 ms | 500 ms |       |           |
| SCH-PERF-037 | API     | `POST /v1/scheduling/room-closures`           | 150 ms | 350 ms | 700 ms |       |           |
| SCH-PERF-038 | API     | `DELETE /v1/scheduling/room-closures/:id`     | 100 ms | 250 ms | 500 ms |       |           |

### 4.6 Teacher Scheduling Config (`/v1/scheduling/teacher-config`)

| #            | Surface | Operation                                      | p50 ≤  | p95 ≤  | p99 ≤  | Notes        | Pass/Fail |
| ------------ | ------- | ---------------------------------------------- | ------ | ------ | ------ | ------------ | --------- |
| SCH-PERF-039 | API     | `GET /v1/scheduling/teacher-config` (~60 rows) | 120 ms | 280 ms | 600 ms |              |           |
| SCH-PERF-040 | API     | `PUT /v1/scheduling/teacher-config` (upsert)   | 150 ms | 350 ms | 700 ms |              |           |
| SCH-PERF-041 | API     | `DELETE /v1/scheduling/teacher-config/:id`     | 100 ms | 250 ms | 500 ms |              |           |
| SCH-PERF-042 | API     | `POST /v1/scheduling/teacher-config/copy`      | 600 ms | 1.2 s  | 2.5 s  | ~60-row copy |           |

### 4.7 Scheduler Orchestration — Runs (legacy `/v1/scheduling/runs/*`)

| #            | Surface | Operation                                            | p50 ≤  | p95 ≤  | p99 ≤  | Notes                                          | Pass/Fail |
| ------------ | ------- | ---------------------------------------------------- | ------ | ------ | ------ | ---------------------------------------------- | --------- |
| SCH-PERF-043 | API     | `POST /v1/scheduling/runs/prerequisites`             | 250 ms | 500 ms | 1 s    | Aggregates competency + requirement + staffing |           |
| SCH-PERF-044 | API     | `POST /v1/scheduling/runs/trigger`                   | 350 ms | 700 ms | 1.2 s  | Includes assembleSolverInputV3 (~300 ms)       |           |
| SCH-PERF-045 | API     | `GET /v1/scheduling/runs?academic_year_id=` (page 1) | 200 ms | 400 ms | 800 ms | MUST exclude `result_json` from list           |           |
| SCH-PERF-046 | API     | `GET /v1/scheduling/runs/:id`                        | 400 ms | 800 ms | 1.5 s  | Full row with `result_json` (3 MB)             |           |
| SCH-PERF-047 | API     | `POST /v1/scheduling/runs/:id/apply`                 | 1.5 s  | 3 s    | 5 s    | Bulk-write ~1,200 schedule rows in transaction |           |
| SCH-PERF-048 | API     | `POST /v1/scheduling/runs/:id/discard`               | 200 ms | 400 ms | 800 ms |                                                |           |
| SCH-PERF-049 | API     | `POST /v1/scheduling/runs/:id/cancel`                | 200 ms | 400 ms | 800 ms | Conditional update + queue removal             |           |
| SCH-PERF-050 | API     | `GET /v1/scheduling/runs/:id/status`                 | 80 ms  | 200 ms | 400 ms | Polled every 2 s during run                    |           |
| SCH-PERF-051 | API     | `POST /v1/scheduling/runs/:id/validate`              | 600 ms | 1.2 s  | 2 s    | Re-runs constraint checks against result_json  |           |

### 4.8 Scheduling Runs (`/v1/scheduling-runs/*`)

| #            | Surface | Operation                                                      | p50 ≤  | p95 ≤  | p99 ≤  | Notes                                    | Pass/Fail |
| ------------ | ------- | -------------------------------------------------------------- | ------ | ------ | ------ | ---------------------------------------- | --------- |
| SCH-PERF-052 | API     | `GET /v1/scheduling-runs/prerequisites?academic_year_id=`      | 250 ms | 500 ms | 1 s    | Same as 043 via newer surface            |           |
| SCH-PERF-053 | API     | `GET /v1/scheduling-runs/feasibility?academic_year_id=`        | 400 ms | 900 ms | 1.5 s  | 10-point structural sweep                |           |
| SCH-PERF-054 | API     | `POST /v1/scheduling-runs` (create)                            | 350 ms | 700 ms | 1.2 s  | Quick enqueue path                       |           |
| SCH-PERF-055 | API     | `GET /v1/scheduling-runs?page=1` (50 historical runs)          | 200 ms | 400 ms | 800 ms | MUST exclude JSONB columns               |           |
| SCH-PERF-056 | API     | `GET /v1/scheduling-runs/:id` (with result_json + adjustments) | 500 ms | 1 s    | 2 s    | Returns 3-5 MB; gzip MUST be on          |           |
| SCH-PERF-057 | API     | `GET /v1/scheduling-runs/:id/progress`                         | 80 ms  | 200 ms | 400 ms | Polled every 2 s                         |           |
| SCH-PERF-058 | API     | `GET /v1/scheduling-runs/:id/diagnostics`                      | 400 ms | 800 ms | 1.5 s  | Categorised failure analysis             |           |
| SCH-PERF-059 | API     | `POST /v1/scheduling-runs/:id/diagnostics/simulate`            | 800 ms | 1.5 s  | 3 s    | Projects override impact without writing |           |
| SCH-PERF-060 | API     | `POST /v1/scheduling-runs/:id/diagnostics/refresh`             | 1.2 s  | 2.5 s  | 4 s    | Force recompute                          |           |
| SCH-PERF-061 | API     | `POST /v1/scheduling-runs/:id/cancel`                          | 200 ms | 400 ms | 800 ms |                                          |           |
| SCH-PERF-062 | API     | `PATCH /v1/scheduling-runs/:id/adjustments`                    | 250 ms | 500 ms | 1 s    | Append to JSONB `proposed_adjustments`   |           |
| SCH-PERF-063 | API     | `POST /v1/scheduling-runs/:id/apply`                           | 1.5 s  | 3 s    | 5 s    | Same write profile as 047                |           |
| SCH-PERF-064 | API     | `POST /v1/scheduling-runs/:id/discard`                         | 200 ms | 400 ms | 800 ms |                                          |           |

### 4.9 Scheduling Dashboard (`/v1/scheduling-dashboard/*`)

| #            | Surface | Operation                                                         | p50 ≤  | p95 ≤  | p99 ≤  | Notes                                       | Pass/Fail |
| ------------ | ------- | ----------------------------------------------------------------- | ------ | ------ | ------ | ------------------------------------------- | --------- |
| SCH-PERF-065 | API     | `GET /v1/scheduling-dashboard/overview?academic_year_id=`         | 200 ms | 400 ms | 800 ms | Hub KPI; called silently from `/scheduling` |           |
| SCH-PERF-066 | API     | `GET /v1/scheduling-dashboard/workload?academic_year_id=`         | 300 ms | 600 ms | 1.2 s  | Per-teacher period count (~60 rows)         |           |
| SCH-PERF-067 | API     | `GET /v1/scheduling-dashboard/unassigned?academic_year_id=`       | 250 ms | 500 ms | 1 s    | Classes missing coverage                    |           |
| SCH-PERF-068 | API     | `GET /v1/scheduling-dashboard/room-utilisation?academic_year_id=` | 300 ms | 600 ms | 1.2 s  | Per-room utilisation (~35 rows)             |           |
| SCH-PERF-069 | API     | `GET /v1/scheduling-dashboard/trends?academic_year_id=`           | 350 ms | 700 ms | 1.5 s  | Cross-run trend; aggregates 50 runs         |           |
| SCH-PERF-070 | API     | `GET /v1/scheduling-dashboard/preferences?academic_year_id=`      | 250 ms | 500 ms | 1 s    | Staff satisfaction; can be self-scoped      |           |

### 4.10 Substitution / Absence Flow

| #            | Surface | Operation                                                   | p50 ≤  | p95 ≤  | p99 ≤  | Notes                                      | Pass/Fail |
| ------------ | ------- | ----------------------------------------------------------- | ------ | ------ | ------ | ------------------------------------------ | --------- |
| SCH-PERF-071 | API     | `POST /v1/scheduling/absences` (admin reports)              | 300 ms | 600 ms | 1.2 s  | Insert + cascade trigger (sync portion)    |           |
| SCH-PERF-072 | API     | `POST /v1/scheduling/absences/self-report`                  | 400 ms | 800 ms | 1.5 s  | Insert + immediate cascade run             |           |
| SCH-PERF-073 | API     | `GET /v1/scheduling/absences?page=1` (~50 active in window) | 200 ms | 400 ms | 800 ms |                                            |           |
| SCH-PERF-074 | API     | `DELETE /v1/scheduling/absences/:id`                        | 200 ms | 400 ms | 800 ms | Hard-delete + offer revoke                 |           |
| SCH-PERF-075 | API     | `POST /v1/scheduling/absences/:id/cancel` (admin)           | 250 ms | 500 ms | 1 s    | Cancel + revoke offers                     |           |
| SCH-PERF-076 | API     | `POST /v1/scheduling/absences/:id/cancel-own`               | 250 ms | 500 ms | 1 s    |                                            |           |
| SCH-PERF-077 | API     | `GET /v1/scheduling/absences/:absenceId/substitutes`        | 300 ms | 600 ms | 1.2 s  | Eligibility scan                           |           |
| SCH-PERF-078 | API     | `GET /v1/scheduling/absences/:absenceId/substitutes/ai`     | 600 ms | 1.5 s  | 3 s    | AI ranker; CPU-bound                       |           |
| SCH-PERF-079 | API     | `POST /v1/scheduling/substitutions` (assign)                | 250 ms | 500 ms | 1 s    | Insert SubstitutionRecord + offer          |           |
| SCH-PERF-080 | API     | `GET /v1/scheduling/substitutions?page=1`                   | 200 ms | 400 ms | 800 ms |                                            |           |
| SCH-PERF-081 | API     | `GET /v1/scheduling/substitution-board`                     | 200 ms | 500 ms | 1 s    | **Public, polled every 60 s** — keep tight |           |

### 4.11 Substitution Offers (Cascade)

| #            | Surface | Operation                                | p50 ≤  | p95 ≤  | p99 ≤  | Notes                           | Pass/Fail |
| ------------ | ------- | ---------------------------------------- | ------ | ------ | ------ | ------------------------------- | --------- |
| SCH-PERF-082 | API     | `GET /v1/scheduling/offers/my`           | 150 ms | 350 ms | 700 ms | Teacher polls; small result set |           |
| SCH-PERF-083 | API     | `POST /v1/scheduling/offers/:id/accept`  | 250 ms | 500 ms | 1 s    | Halts cascade                   |           |
| SCH-PERF-084 | API     | `POST /v1/scheduling/offers/:id/decline` | 200 ms | 400 ms | 800 ms | Escalates to next tier          |           |

### 4.12 Staff Lookup

| #            | Surface | Operation                       | p50 ≤  | p95 ≤  | p99 ≤  | Notes                 | Pass/Fail |
| ------------ | ------- | ------------------------------- | ------ | ------ | ------ | --------------------- | --------- |
| SCH-PERF-085 | API     | `GET /v1/scheduling/colleagues` | 150 ms | 350 ms | 700 ms | Nomination picker     |           |
| SCH-PERF-086 | API     | `GET /v1/scheduling/teachers`   | 200 ms | 400 ms | 800 ms | Admin-tier sub picker |           |

### 4.13 Cover Reports

| #            | Surface | Operation                                                              | p50 ≤  | p95 ≤  | p99 ≤ | Notes                                  | Pass/Fail |
| ------------ | ------- | ---------------------------------------------------------------------- | ------ | ------ | ----- | -------------------------------------- | --------- |
| SCH-PERF-087 | API     | `GET /v1/scheduling/cover-reports?date_from=&date_to=` (30-day window) | 350 ms | 700 ms | 1.5 s | Aggregation across substitution_record |           |
| SCH-PERF-088 | API     | `GET /v1/scheduling/cover-reports/fairness`                            | 400 ms | 800 ms | 1.5 s | Fairness math across staff             |           |
| SCH-PERF-089 | API     | `GET /v1/scheduling/cover-reports/by-department`                       | 350 ms | 700 ms | 1.5 s | GROUP BY department                    |           |

### 4.14 Schedule Swap & Emergency

| #            | Surface | Operation                              | p50 ≤  | p95 ≤  | p99 ≤  | Notes                       | Pass/Fail |
| ------------ | ------- | -------------------------------------- | ------ | ------ | ------ | --------------------------- | --------- |
| SCH-PERF-090 | API     | `POST /v1/scheduling/swaps/validate`   | 200 ms | 400 ms | 800 ms | Conflict + competency check |           |
| SCH-PERF-091 | API     | `POST /v1/scheduling/swaps/execute`    | 300 ms | 600 ms | 1.2 s  | 2-row update in transaction |           |
| SCH-PERF-092 | API     | `POST /v1/scheduling/emergency-change` | 300 ms | 600 ms | 1.2 s  | Single update + audit       |           |

### 4.15 Personal Timetable & Calendar

| #            | Surface | Operation                                        | p50 ≤  | p95 ≤  | p99 ≤  | Notes                                                  | Pass/Fail |
| ------------ | ------- | ------------------------------------------------ | ------ | ------ | ------ | ------------------------------------------------------ | --------- |
| SCH-PERF-093 | API     | `GET /v1/scheduling/timetable/teacher/:staffId`  | 200 ms | 400 ms | 800 ms | ~25 schedule rows                                      |           |
| SCH-PERF-094 | API     | `GET /v1/scheduling/timetable/my`                | 150 ms | 350 ms | 700 ms | High-frequency; staff/teacher home tile                |           |
| SCH-PERF-095 | API     | `GET /v1/scheduling/timetable/class/:classId`    | 200 ms | 400 ms | 800 ms | ~40 schedule rows                                      |           |
| SCH-PERF-096 | API     | `POST /v1/scheduling/calendar-tokens`            | 200 ms | 400 ms | 800 ms | Token gen + insert                                     |           |
| SCH-PERF-097 | API     | `GET /v1/scheduling/calendar-tokens`             | 100 ms | 250 ms | 500 ms |                                                        |           |
| SCH-PERF-098 | API     | `DELETE /v1/scheduling/calendar-tokens/:tokenId` | 100 ms | 250 ms | 500 ms |                                                        |           |
| SCH-PERF-099 | API     | `GET /v1/calendar/:tenantId/:token.ics` (public) | 200 ms | 500 ms | 1 s    | **Polled by external calendar clients every 5–60 min** |           |

### 4.16 Rotation Config

| #            | Surface | Operation                                  | p50 ≤  | p95 ≤  | p99 ≤  | Notes          | Pass/Fail |
| ------------ | ------- | ------------------------------------------ | ------ | ------ | ------ | -------------- | --------- |
| SCH-PERF-100 | API     | `PUT /v1/scheduling/rotation`              | 150 ms | 350 ms | 700 ms | Upsert one row |           |
| SCH-PERF-101 | API     | `GET /v1/scheduling/rotation`              | 80 ms  | 200 ms | 400 ms |                |           |
| SCH-PERF-102 | API     | `DELETE /v1/scheduling/rotation`           | 100 ms | 250 ms | 500 ms |                |           |
| SCH-PERF-103 | API     | `GET /v1/scheduling/rotation/current-week` | 80 ms  | 200 ms | 400 ms | Date math      |           |

### 4.17 Exam Scheduling

| #            | Surface | Operation                                                   | p50 ≤  | p95 ≤  | p99 ≤  | Notes                                        | Pass/Fail |
| ------------ | ------- | ----------------------------------------------------------- | ------ | ------ | ------ | -------------------------------------------- | --------- |
| SCH-PERF-104 | API     | `POST /v1/scheduling/exam-sessions`                         | 150 ms | 350 ms | 700 ms |                                              |           |
| SCH-PERF-105 | API     | `GET /v1/scheduling/exam-sessions?academic_year_id=`        | 150 ms | 350 ms | 700 ms | ~4 rows per year                             |           |
| SCH-PERF-106 | API     | `GET /v1/scheduling/exam-sessions/:id`                      | 100 ms | 250 ms | 500 ms |                                              |           |
| SCH-PERF-107 | API     | `PUT /v1/scheduling/exam-sessions/:id`                      | 150 ms | 350 ms | 700 ms |                                              |           |
| SCH-PERF-108 | API     | `DELETE /v1/scheduling/exam-sessions/:id`                   | 200 ms | 400 ms | 800 ms | Cascade-delete slots + invigilations         |           |
| SCH-PERF-109 | API     | `GET /v1/scheduling/exam-sessions/:id/slots` (~20 slots)    | 150 ms | 350 ms | 700 ms |                                              |           |
| SCH-PERF-110 | API     | `POST /v1/scheduling/exam-sessions/:id/slots`               | 150 ms | 350 ms | 700 ms |                                              |           |
| SCH-PERF-111 | API     | `POST /v1/scheduling/exam-sessions/:id/generate`            | 800 ms | 2 s    | 4 s    | Auto-generation; constraint solve over slots |           |
| SCH-PERF-112 | API     | `POST /v1/scheduling/exam-sessions/:id/assign-invigilators` | 600 ms | 1.5 s  | 3 s    | Bulk assignment                              |           |
| SCH-PERF-113 | API     | `POST /v1/scheduling/exam-sessions/:id/publish`             | 300 ms | 600 ms | 1.2 s  | Status flip + notification fan-out           |           |

### 4.18 Scenarios (What-If)

| #            | Surface | Operation                                 | p50 ≤  | p95 ≤  | p99 ≤  | Notes                                   | Pass/Fail |
| ------------ | ------- | ----------------------------------------- | ------ | ------ | ------ | --------------------------------------- | --------- |
| SCH-PERF-114 | API     | `POST /v1/scheduling/scenarios`           | 300 ms | 600 ms | 1.2 s  | Snapshots config from a base run        |           |
| SCH-PERF-115 | API     | `GET /v1/scheduling/scenarios`            | 200 ms | 400 ms | 800 ms |                                         |           |
| SCH-PERF-116 | API     | `GET /v1/scheduling/scenarios/:id`        | 250 ms | 500 ms | 1 s    | Includes config_snapshot + result_json  |           |
| SCH-PERF-117 | API     | `PUT /v1/scheduling/scenarios/:id`        | 200 ms | 400 ms | 800 ms |                                         |           |
| SCH-PERF-118 | API     | `DELETE /v1/scheduling/scenarios/:id`     | 150 ms | 350 ms | 700 ms |                                         |           |
| SCH-PERF-119 | API     | `POST /v1/scheduling/scenarios/:id/solve` | 350 ms | 700 ms | 1.2 s  | Quick enqueue (delegates to solver job) |           |
| SCH-PERF-120 | API     | `POST /v1/scheduling/scenarios/compare`   | 400 ms | 800 ms | 1.5 s  | Diff two result_json blobs              |           |

### 4.19 Analytics

| #            | Surface | Operation                                                   | p50 ≤  | p95 ≤  | p99 ≤ | Notes                             | Pass/Fail |
| ------------ | ------- | ----------------------------------------------------------- | ------ | ------ | ----- | --------------------------------- | --------- |
| SCH-PERF-121 | API     | `GET /v1/scheduling/analytics/efficiency?academic_year_id=` | 300 ms | 600 ms | 1.2 s | Period placement + violation rate |           |
| SCH-PERF-122 | API     | `GET /v1/scheduling/analytics/workload?academic_year_id=`   | 350 ms | 700 ms | 1.5 s | Heatmap matrix                    |           |
| SCH-PERF-123 | API     | `GET /v1/scheduling/analytics/rooms?academic_year_id=`      | 300 ms | 600 ms | 1.2 s | Room utilisation                  |           |
| SCH-PERF-124 | API     | `GET /v1/scheduling/analytics/historical?academic_year_id=` | 400 ms | 800 ms | 1.5 s | Cross-run trend, ~50 runs         |           |

### 4.20 Schedules CRUD (`/v1/schedules`)

| #            | Surface | Operation                                             | p50 ≤  | p95 ≤  | p99 ≤  | Notes                        | Pass/Fail |
| ------------ | ------- | ----------------------------------------------------- | ------ | ------ | ------ | ---------------------------- | --------- |
| SCH-PERF-125 | API     | `POST /v1/schedules` (create with conflict detection) | 250 ms | 500 ms | 1 s    | Conflict scan adds ~80 ms    |           |
| SCH-PERF-126 | API     | `GET /v1/schedules` (page 1, 20 rows)                 | 150 ms | 350 ms | 700 ms |                              |           |
| SCH-PERF-127 | API     | `GET /v1/schedules/:id`                               | 80 ms  | 200 ms | 400 ms |                              |           |
| SCH-PERF-128 | API     | `PATCH /v1/schedules/:id`                             | 200 ms | 400 ms | 800 ms |                              |           |
| SCH-PERF-129 | API     | `DELETE /v1/schedules/:id`                            | 100 ms | 250 ms | 500 ms |                              |           |
| SCH-PERF-130 | API     | `POST /v1/schedules/bulk-pin` (100 rows)              | 500 ms | 1 s    | 2 s    | Bulk update is_pinned/source |           |
| SCH-PERF-131 | API     | `POST /v1/schedules/:id/pin`                          | 100 ms | 250 ms | 500 ms |                              |           |
| SCH-PERF-132 | API     | `POST /v1/schedules/:id/unpin`                        | 100 ms | 250 ms | 500 ms |                              |           |

### 4.21 Timetables (`/v1/timetables/*`, `/v1/reports/workload`)

| #            | Surface | Operation                                    | p50 ≤  | p95 ≤  | p99 ≤  | Notes                                    | Pass/Fail |
| ------------ | ------- | -------------------------------------------- | ------ | ------ | ------ | ---------------------------------------- | --------- |
| SCH-PERF-133 | API     | `GET /v1/timetables/teacher/:staffProfileId` | 150 ms | 300 ms | 600 ms | High-frequency; teacher home & morph bar |           |
| SCH-PERF-134 | API     | `GET /v1/timetables/class/:classId`          | 150 ms | 300 ms | 600 ms | High-frequency; parent/student facing    |           |
| SCH-PERF-135 | API     | `GET /v1/timetables/room/:roomId`            | 150 ms | 300 ms | 600 ms | Print page polls this                    |           |
| SCH-PERF-136 | API     | `GET /v1/timetables/student/:studentId`      | 150 ms | 300 ms | 600 ms | **Parent-spike candidate (08:00)**       |           |
| SCH-PERF-137 | API     | `GET /v1/reports/workload?academic_year_id=` | 400 ms | 800 ms | 1.5 s  | Workload aggregation                     |           |

**Endpoint count (§4): 137 budgeted endpoints.**

---

## 5. Solver Budgets — Wall-Clock per Scale Tier

The CP-SAT solver runs in the OR-Tools sidecar (`SOLVER_PY_URL`). Each tier defines a hard wall-clock cap that the worker passes as `timeout = max(120s, max_solver_duration + 60s)`. Failure to complete within the cap → `failed` (after the stale-reaper sweeps).

Numbering: SCH-PERF-S001…

### 5.1 Solver scale tiers

| #             | Tier       | Classes | Teachers | Subjects | Periods/wk | Weeks (rotation) | Pinned | Demand-rows | `max_solver_duration` (tenant cap) | Solver wall-clock target | Pass/Fail |
| ------------- | ---------- | ------- | -------- | -------- | ---------- | ---------------- | ------ | ----------- | ---------------------------------- | ------------------------ | --------- |
| SCH-PERF-S001 | XS         | 5       | 10       | 5        | 30         | 1                | 0      | ~150        | 120 s                              | < 10 s                   |           |
| SCH-PERF-S002 | Small      | 10      | 20       | 5        | 35         | 1                | 0      | ~350        | 180 s                              | < 30 s                   |           |
| SCH-PERF-S003 | Small+pin  | 10      | 20       | 5        | 35         | 1                | 50     | ~300        | 180 s                              | < 25 s                   |           |
| SCH-PERF-S004 | Medium     | 30      | 60       | 12       | 40         | 1                | 100    | ~1,200      | 300 s                              | < 120 s                  |           |
| SCH-PERF-S005 | Medium+rot | 30      | 60       | 12       | 40         | 2                | 100    | ~2,400      | 420 s                              | < 240 s                  |           |
| SCH-PERF-S006 | Large      | 60      | 120      | 18       | 40         | 1                | 200    | ~2,400      | 600 s                              | < 600 s                  |           |
| SCH-PERF-S007 | Large+rot  | 60      | 120      | 18       | 40         | 2                | 200    | ~4,800      | 900 s                              | < 900 s                  |           |
| SCH-PERF-S008 | XL         | 100     | 200      | 20       | 40         | 2                | 300    | ~8,000      | 1,800 s                            | < 1,800 s                |           |

### 5.2 Solver cap enforcement

| #             | Surface | Assertion                                                                                       | Expected                                                    | Pass/Fail |
| ------------- | ------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| SCH-PERF-S009 | Worker  | Job timeout = `max(120s, max_solver_duration + 60s)`                                            | Verified per processor logic                                |           |
| SCH-PERF-S010 | Worker  | When solver exceeds cap, sidecar HTTP times out and worker writes `status='failed'` with reason | No row left in `running` indefinitely                       |           |
| SCH-PERF-S011 | Worker  | Stale-reaper picks up runs older than `max_solver_duration + 60s` still in `running`            | Sweep happens within ≤ 60 s of expiry (cron is `* * * * *`) |           |
| SCH-PERF-S012 | Worker  | Lock duration (300 s) ≥ shortest tier's expected solve time                                     | No premature stall events for tiers ≤ Medium                |           |
| SCH-PERF-S013 | API     | Tenant `max_solver_duration_seconds` setting honoured at trigger time                           | Reject create with 422 if config missing                    |           |

### 5.3 Solver phase breakdown (Medium tier reference)

| #             | Phase                                               | Wall-clock target | Notes                                           | Pass/Fail |
| ------------- | --------------------------------------------------- | ----------------- | ----------------------------------------------- | --------- |
| SCH-PERF-S014 | `assembleSolverInputV3` (API-side, before enqueue)  | < 500 ms          | Reads competencies, requirements, periods, pins |           |
| SCH-PERF-S015 | Enqueue → worker pickup                             | < 2 s             | Includes BullMQ poll latency                    |           |
| SCH-PERF-S016 | Worker → CP-SAT HTTP request (serialise input JSON) | < 1 s             | JSON ~500 KB to ~2 MB                           |           |
| SCH-PERF-S017 | CP-SAT solve (Medium tier)                          | < 110 s           | 90% of `max_solver_duration`                    |           |
| SCH-PERF-S018 | Worker → write `result_json` to `scheduling_run`    | < 2 s             | JSONB write, ~3 MB                              |           |
| SCH-PERF-S019 | Worker → compute `proposed_adjustments`             | < 5 s             | Post-solve resolution & adjustment generation   |           |

---

## 6. Scale Matrix — Classes × Teachers × Periods × Weeks

Each row tested with the corresponding solver tier from §5. DB read/write counts captured via `pg_stat_statements` deltas across the run lifecycle. Memory measured as worker peak RSS during solve.

| #             | Tier            | Solver duration target | DB reads (config_snapshot assembly) | DB writes (apply phase) | Worker peak RSS | Sidecar peak RSS | `result_json` size | Apply payload | Pass/Fail |
| ------------- | --------------- | ---------------------- | ----------------------------------- | ----------------------- | --------------- | ---------------- | ------------------ | ------------- | --------- |
| SCH-PERF-M001 | XS              | < 10 s                 | < 50                                | < 200                   | < 200 MB        | < 300 MB         | < 200 KB           | < 100 KB      |           |
| SCH-PERF-M002 | Small           | < 30 s                 | < 100                               | < 500                   | < 250 MB        | < 400 MB         | < 500 KB           | < 250 KB      |           |
| SCH-PERF-M003 | Medium          | < 120 s                | < 250                               | < 1,500                 | < 400 MB        | < 1 GB           | < 3 MB             | < 1 MB        |           |
| SCH-PERF-M004 | Medium+rotation | < 240 s                | < 300                               | < 3,000                 | < 500 MB        | < 1.5 GB         | < 5 MB             | < 2 MB        |           |
| SCH-PERF-M005 | Large           | < 600 s                | < 500                               | < 3,000                 | < 600 MB        | < 2 GB           | < 6 MB             | < 2 MB        |           |
| SCH-PERF-M006 | Large+rotation  | < 900 s                | < 600                               | < 6,000                 | < 800 MB        | < 3 GB           | < 12 MB            | < 4 MB        |           |
| SCH-PERF-M007 | XL              | < 1,800 s              | < 1,000                             | < 10,000                | < 1.2 GB        | < 4 GB           | < 20 MB            | < 7 MB        |           |

### 6.1 Apply-phase write profile

| #             | Tier   | Apply transaction wall-clock | Lock-hold time on `schedule` | Pass/Fail |
| ------------- | ------ | ---------------------------- | ---------------------------- | --------- |
| SCH-PERF-M008 | XS     | < 500 ms                     | < 300 ms                     |           |
| SCH-PERF-M009 | Small  | < 1 s                        | < 700 ms                     |           |
| SCH-PERF-M010 | Medium | < 3 s                        | < 2 s                        |           |
| SCH-PERF-M011 | Large  | < 8 s                        | < 5 s                        |           |
| SCH-PERF-M012 | XL     | < 25 s                       | < 15 s                       |           |

**Scale matrix count (§6): 7 tier rows + 5 apply rows = 12 scale-matrix rows.**

---

## 7. Concurrency / Contention Scenarios

### 7.1 Read contention — admin dashboards

| #             | Scenario                                                                                   | Expected                                                    | Pass/Fail |
| ------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------- |
| SCH-PERF-C001 | 5 admins simultaneously open `/scheduling` hub (calls `dashboard/overview`)                | All p95 within budget; no degradation > 30%                 |           |
| SCH-PERF-C002 | 5 admins simultaneously open `/scheduling/dashboard` (overview + workload + room + trends) | API p95 stays within budgets in §4.9; no DB pool exhaustion |           |
| SCH-PERF-C003 | 5 admins poll `runs/:id/progress` every 2 s while another solver is running                | Progress endpoint p95 ≤ 200 ms; no impact on solver         |           |

### 7.2 Solver-vs-readers

| #             | Scenario                                                                            | Expected                                                    | Pass/Fail |
| ------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| SCH-PERF-C004 | 1 Medium-tier solver running, 50 students fetch `/v1/timetables/student/:studentId` | Student timetable p95 stays within §4.21 budget             |           |
| SCH-PERF-C005 | 1 Medium-tier solver running, 100 staff poll `/v1/scheduling/timetable/my`          | `my` endpoint p95 ≤ 400 ms                                  |           |
| SCH-PERF-C006 | Solver `apply` phase (writes ~1,200 schedule rows) overlapping 30 timetable reads   | Reads queue but eventually return; no read-as-of stale risk |           |

### 7.3 Parent spike — 08:00 school start

| #             | Scenario                                                                 | Expected                                                           | Pass/Fail |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------- |
| SCH-PERF-C007 | 100 parents call `/v1/timetables/student/:studentId` over 30 s           | p95 ≤ 600 ms; no 5xx                                               |           |
| SCH-PERF-C008 | 700 parents (entire `nhqs` parent base) over 5 min ramp                  | Sustained throughput ≥ 2.5 req/s; p95 ≤ 800 ms; pool not exhausted |           |
| SCH-PERF-C009 | Substitution board kiosk auto-refresh (60 s) coincides with parent spike | Board p95 stays under §4.10 (1 s)                                  |           |

### 7.4 Cron + active solvers

| #             | Scenario                                                                              | Expected                                                  | Pass/Fail |
| ------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------- |
| SCH-PERF-C010 | Stale-reaper cron fires (`* * * * *`) while 3 solvers queued / running across tenants | Reaper completes ≤ 5 s; no false-positive `failed` writes |           |
| SCH-PERF-C011 | Stale-reaper iterates all tenants at scale (50+ active tenants in cluster)            | Per-tenant scan ≤ 200 ms; total ≤ 30 s per minute         |           |

### 7.5 Single-flight enforcement

| #             | Scenario                                                                       | Expected                                                              | Pass/Fail |
| ------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | --------- |
| SCH-PERF-C012 | 5 admins simultaneously call `POST /v1/scheduling-runs` for same academic_year | Only 1 run created (status=queued); 4 receive 422 with active-run msg |           |
| SCH-PERF-C013 | Worker concurrency=1 verified — no two solvers run simultaneously per worker   | Verified via lock contention metric                                   |           |
| SCH-PERF-C014 | Cancel issued during a Medium-tier solve at t=30s                              | API responds ≤ 800 ms; sidecar request times out within 5 s           |           |

### 7.6 Calendar polling

| #             | Scenario                                                                         | Expected                                      | Pass/Fail |
| ------------- | -------------------------------------------------------------------------------- | --------------------------------------------- | --------- |
| SCH-PERF-C015 | 100 external calendar clients hit `/v1/calendar/:tenantId/:token.ics` every 60 s | API throughput ≥ 1.5 req/s/host; p95 ≤ 500 ms |           |
| SCH-PERF-C016 | iCal cache (5 min TTL) prevents DB hammering                                     | DB queries per minute ≤ tenants × 1           |           |

### 7.7 Substitution cascade fan-out

| #             | Scenario                                                             | Expected                                                                     | Pass/Fail |
| ------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| SCH-PERF-C017 | Self-report absence at 07:30, cascade triggers 8 offers across tiers | Cascade synchronous portion ≤ 1.5 s; notifications enqueued, not awaited     |           |
| SCH-PERF-C018 | 5 absences self-reported in 60 s window                              | All cascades complete; no offer table contention; teacher offer reads stable |           |

---

## 8. Page Bundle & Cold-Start Budgets

Lighthouse runs against `https://staging.edupod.app` for the `nhqs` admin user (and parent / teacher users where noted).

### 8.1 Performance scores

| #             | Page                                         | Performance ≥ | LCP ≤ | CLS ≤ | TBT ≤  | Notes                              | Pass/Fail |
| ------------- | -------------------------------------------- | ------------- | ----- | ----- | ------ | ---------------------------------- | --------- |
| SCH-PERF-P001 | `/scheduling` (hub)                          | 85            | 2.5 s | 0.1   | 200 ms | KPI cards + 6 category tiles       |           |
| SCH-PERF-P002 | `/scheduling/auto`                           | 85            | 2.5 s | 0.1   | 200 ms | Prerequisites + feasibility panels |           |
| SCH-PERF-P003 | `/scheduling/runs`                           | 85            | 2.5 s | 0.1   | 200 ms | Run history list                   |           |
| SCH-PERF-P004 | `/scheduling/runs/[id]/review`               | 80            | 3 s   | 0.1   | 350 ms | Heavy: full timetable grid + diags |           |
| SCH-PERF-P005 | `/scheduling/runs/[id]` (redirect)           | n/a           | n/a   | n/a   | n/a    | Redirect-only                      |           |
| SCH-PERF-P006 | `/scheduling/runs/compare`                   | 80            | 3 s   | 0.1   | 350 ms | Side-by-side diff                  |           |
| SCH-PERF-P007 | `/scheduling/period-grid`                    | 85            | 2.5 s | 0.1   | 200 ms | CRUD grid + dialogs                |           |
| SCH-PERF-P008 | `/scheduling/curriculum`                     | 85            | 2.5 s | 0.1   | 200 ms | Matrix UI                          |           |
| SCH-PERF-P009 | `/scheduling/break-groups`                   | 90            | 2 s   | 0.1   | 150 ms | Small list                         |           |
| SCH-PERF-P010 | `/scheduling/room-closures`                  | 90            | 2 s   | 0.1   | 150 ms | Small list                         |           |
| SCH-PERF-P011 | `/scheduling/competencies`                   | 80            | 3 s   | 0.1   | 350 ms | Pin/Pool matrices, copy wizard     |           |
| SCH-PERF-P012 | `/scheduling/substitute-competencies`        | 80            | 3 s   | 0.1   | 350 ms | Same structure                     |           |
| SCH-PERF-P013 | `/scheduling/competency-coverage`            | 85            | 2.5 s | 0.1   | 200 ms | Coverage report                    |           |
| SCH-PERF-P014 | `/scheduling/teacher-config`                 | 85            | 2.5 s | 0.1   | 200 ms |                                    |           |
| SCH-PERF-P015 | `/scheduling/availability`                   | 85            | 2.5 s | 0.1   | 200 ms | Time-input grid                    |           |
| SCH-PERF-P016 | `/scheduling/preferences`                    | 85            | 2.5 s | 0.1   | 200 ms |                                    |           |
| SCH-PERF-P017 | `/scheduling/requirements`                   | 85            | 2.5 s | 0.1   | 200 ms |                                    |           |
| SCH-PERF-P018 | `/scheduling/requirements/subject-overrides` | 85            | 2.5 s | 0.1   | 200 ms | Zod-validated form                 |           |
| SCH-PERF-P019 | `/scheduling/substitutions`                  | 80            | 3 s   | 0.1   | 350 ms | Hand-rolled form (HR-025)          |           |
| SCH-PERF-P020 | `/scheduling/substitution-board`             | 90            | 2 s   | 0.1   | 150 ms | **Kiosk; 60s auto-refresh**        |           |
| SCH-PERF-P021 | `/scheduling/exams`                          | 85            | 2.5 s | 0.1   | 200 ms |                                    |           |
| SCH-PERF-P022 | `/scheduling/scenarios`                      | 85            | 2.5 s | 0.1   | 200 ms |                                    |           |
| SCH-PERF-P023 | `/scheduling/dashboard`                      | 80            | 3 s   | 0.1   | 350 ms | Recharts heavy                     |           |
| SCH-PERF-P024 | `/scheduling/cover-reports`                  | 85            | 2.5 s | 0.1   | 200 ms |                                    |           |
| SCH-PERF-P025 | `/scheduling/my-timetable`                   | 90            | 2 s   | 0.1   | 150 ms | Personal; heavy traffic            |           |
| SCH-PERF-P026 | `/scheduling/my-preferences`                 | 85            | 2.5 s | 0.1   | 200 ms |                                    |           |
| SCH-PERF-P027 | `/scheduling/my-satisfaction`                | 85            | 2.5 s | 0.1   | 200 ms |                                    |           |
| SCH-PERF-P028 | `/scheduling/leave-requests`                 | 85            | 2.5 s | 0.1   | 200 ms |                                    |           |
| SCH-PERF-P029 | `/timetables`                                | 85            | 2.5 s | 0.1   | 200 ms | Multi-filter timetable view        |           |
| SCH-PERF-P030 | `/schedules`                                 | 85            | 2.5 s | 0.1   | 200 ms | Manual CRUD                        |           |
| SCH-PERF-P031 | `/(print)/timetables/rooms/[roomId]/print`   | 90            | 2 s   | 0.1   | 100 ms | Print-only; minimal JS             |           |

### 8.2 Bundle budgets (JS per route, gzipped)

| #             | Route group                                        | JS budget (gz) | Notes                                         | Pass/Fail |
| ------------- | -------------------------------------------------- | -------------- | --------------------------------------------- | --------- |
| SCH-PERF-B001 | `/scheduling` (hub) initial JS                     | ≤ 250 KB       | Lucide icons + Tailwind, no charts            |           |
| SCH-PERF-B002 | `/scheduling/auto`                                 | ≤ 220 KB       |                                               |           |
| SCH-PERF-B003 | `/scheduling/runs`                                 | ≤ 200 KB       |                                               |           |
| SCH-PERF-B004 | `/scheduling/runs/[id]/review`                     | ≤ 350 KB       | ScheduleGrid + diagnostics + workload sidebar |           |
| SCH-PERF-B005 | `/scheduling/runs/compare`                         | ≤ 300 KB       |                                               |           |
| SCH-PERF-B006 | `/scheduling/period-grid`                          | ≤ 220 KB       |                                               |           |
| SCH-PERF-B007 | `/scheduling/curriculum`                           | ≤ 250 KB       |                                               |           |
| SCH-PERF-B008 | `/scheduling/break-groups`                         | ≤ 180 KB       |                                               |           |
| SCH-PERF-B009 | `/scheduling/room-closures`                        | ≤ 180 KB       |                                               |           |
| SCH-PERF-B010 | `/scheduling/competencies`                         | ≤ 280 KB       | Matrix interaction layer                      |           |
| SCH-PERF-B011 | `/scheduling/substitute-competencies`              | ≤ 280 KB       |                                               |           |
| SCH-PERF-B012 | `/scheduling/competency-coverage`                  | ≤ 220 KB       |                                               |           |
| SCH-PERF-B013 | `/scheduling/teacher-config`                       | ≤ 220 KB       |                                               |           |
| SCH-PERF-B014 | `/scheduling/availability`                         | ≤ 220 KB       |                                               |           |
| SCH-PERF-B015 | `/scheduling/preferences`                          | ≤ 220 KB       |                                               |           |
| SCH-PERF-B016 | `/scheduling/requirements`                         | ≤ 200 KB       |                                               |           |
| SCH-PERF-B017 | `/scheduling/requirements/subject-overrides`       | ≤ 240 KB       | react-hook-form + zod                         |           |
| SCH-PERF-B018 | `/scheduling/substitutions`                        | ≤ 260 KB       |                                               |           |
| SCH-PERF-B019 | `/scheduling/substitution-board`                   | ≤ 150 KB       | **Kiosk-light**                               |           |
| SCH-PERF-B020 | `/scheduling/exams`                                | ≤ 240 KB       |                                               |           |
| SCH-PERF-B021 | `/scheduling/scenarios`                            | ≤ 240 KB       |                                               |           |
| SCH-PERF-B022 | `/scheduling/dashboard`                            | ≤ 320 KB       | Recharts                                      |           |
| SCH-PERF-B023 | `/scheduling/cover-reports`                        | ≤ 220 KB       |                                               |           |
| SCH-PERF-B024 | `/scheduling/my-timetable`                         | ≤ 200 KB       |                                               |           |
| SCH-PERF-B025 | `/scheduling/my-preferences`                       | ≤ 200 KB       |                                               |           |
| SCH-PERF-B026 | `/scheduling/my-satisfaction`                      | ≤ 200 KB       |                                               |           |
| SCH-PERF-B027 | `/scheduling/leave-requests`                       | ≤ 200 KB       |                                               |           |
| SCH-PERF-B028 | `/timetables`                                      | ≤ 250 KB       | Includes engagement-school-calendar overlay   |           |
| SCH-PERF-B029 | `/schedules`                                       | ≤ 240 KB       |                                               |           |
| SCH-PERF-B030 | `/(print)/timetables/rooms/[roomId]/print`         | ≤ 120 KB       | **Print-only; auto-print on load**            |           |
| SCH-PERF-B031 | Shared vendor chunk (across all scheduling routes) | ≤ 380 KB       | React + Next + Radix + lucide                 |           |

### 8.3 Mobile / network budgets

| #             | Page                                            | Network            | Metric | Target  | Pass/Fail |
| ------------- | ----------------------------------------------- | ------------------ | ------ | ------- | --------- |
| SCH-PERF-N001 | `/scheduling/my-timetable`                      | Slow 3G (400 kbps) | FCP    | ≤ 2.5 s |           |
| SCH-PERF-N002 | `/scheduling/my-timetable`                      | Slow 3G            | TTI    | ≤ 5 s   |           |
| SCH-PERF-N003 | `/timetables` (parent fetching child timetable) | Slow 3G            | FCP    | ≤ 2.5 s |           |
| SCH-PERF-N004 | `/scheduling/substitution-board` (kiosk)        | Wifi               | FCP    | ≤ 1.5 s |           |
| SCH-PERF-N005 | `/scheduling/runs/[id]/review`                  | 4G                 | FCP    | ≤ 2.5 s |           |
| SCH-PERF-N006 | `/scheduling/dashboard`                         | 4G                 | FCP    | ≤ 2.5 s |           |

### 8.4 Real-time / polling overhead

| #             | Page                                                | Polling pattern               | Steady-state overhead | Pass/Fail |
| ------------- | --------------------------------------------------- | ----------------------------- | --------------------- | --------- |
| SCH-PERF-N007 | `/scheduling/runs/[id]/review` while solver running | `progress` every 2 s          | ≤ 5 KB/s              |           |
| SCH-PERF-N008 | `/scheduling/auto` while solver queued              | `runs/:id/status` every 2 s   | ≤ 3 KB/s              |           |
| SCH-PERF-N009 | `/scheduling/substitution-board` (kiosk)            | full board refresh every 60 s | ≤ 50 KB / refresh     |           |
| SCH-PERF-N010 | `/scheduling/my-timetable`                          | None (on-load only)           | 0                     |           |

### 8.5 Cold-start

| #             | Assertion                                                                               | Expected                                       | Pass/Fail |
| ------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- | --------- |
| SCH-PERF-N011 | First request to `/v1/scheduling-dashboard/overview` after API boot                     | ≤ 1.5 s (vs steady-state p50 200 ms)           |           |
| SCH-PERF-N012 | Worker cold-start: first scheduling job picked up                                       | ≤ 5 s of worker boot                           |           |
| SCH-PERF-N013 | Sidecar cold-start: first solve after sidecar boot                                      | ≤ Tier-target wall-clock + 3 s warmup overhead |           |
| SCH-PERF-N014 | PgBouncer transaction-mode: no `current transaction is aborted` errors during 1 hr load | Zero occurrences                               |           |

**Page-budget count (§8): 31 page rows + 31 bundle rows + 6 mobile rows + 4 polling rows + 4 cold-start rows.**

---

## 9. N+1 Query Budgets

Endpoints that aggregate or join MUST use bulk fetches, not loops. Verified via `pg_stat_statements` deltas across a single request.

### 9.1 Read aggregations

| #             | Endpoint                                                 | Target ≤ queries | Notes                                                     | Pass/Fail |
| ------------- | -------------------------------------------------------- | ---------------- | --------------------------------------------------------- | --------- |
| SCH-PERF-Q001 | `GET /v1/scheduling-dashboard/overview`                  | ≤ 5              | Aggregates runs + schedules + counts in single query each |           |
| SCH-PERF-Q002 | `GET /v1/scheduling-dashboard/workload`                  | ≤ 4              | One GROUP BY teacher per metric                           |           |
| SCH-PERF-Q003 | `GET /v1/scheduling-dashboard/unassigned`                | ≤ 4              |                                                           |           |
| SCH-PERF-Q004 | `GET /v1/scheduling-dashboard/room-utilisation`          | ≤ 4              |                                                           |           |
| SCH-PERF-Q005 | `GET /v1/scheduling-dashboard/trends`                    | ≤ 5              | Aggregates 50 runs                                        |           |
| SCH-PERF-Q006 | `GET /v1/scheduling-dashboard/preferences`               | ≤ 4              |                                                           |           |
| SCH-PERF-Q007 | `GET /v1/timetables/class/:classId`                      | ≤ 3              | schedules + class meta + period template                  |           |
| SCH-PERF-Q008 | `GET /v1/timetables/teacher/:staffProfileId`             | ≤ 3              | schedules + teacher meta + period template                |           |
| SCH-PERF-Q009 | `GET /v1/timetables/room/:roomId`                        | ≤ 3              |                                                           |           |
| SCH-PERF-Q010 | `GET /v1/timetables/student/:studentId`                  | ≤ 4              | extra join via class enrolment                            |           |
| SCH-PERF-Q011 | `GET /v1/scheduling-runs` (list)                         | ≤ 2              | runs (excluding JSONB) + total count                      |           |
| SCH-PERF-Q012 | `GET /v1/scheduling-runs/:id`                            | ≤ 2              | run + tenant_settings                                     |           |
| SCH-PERF-Q013 | `GET /v1/scheduling-runs/:id/diagnostics`                | ≤ 4              |                                                           |           |
| SCH-PERF-Q014 | `GET /v1/scheduling-runs/:id/progress`                   | ≤ 1              | Single row read (status + progress fields)                |           |
| SCH-PERF-Q015 | `GET /v1/scheduling/cover-reports`                       | ≤ 4              | One aggregate per report dimension                        |           |
| SCH-PERF-Q016 | `GET /v1/scheduling/cover-reports/fairness`              | ≤ 4              |                                                           |           |
| SCH-PERF-Q017 | `GET /v1/scheduling/cover-reports/by-department`         | ≤ 4              |                                                           |           |
| SCH-PERF-Q018 | `GET /v1/scheduling/teacher-competencies/coverage`       | ≤ 5              | competencies + curriculum + staff joined                  |           |
| SCH-PERF-Q019 | `GET /v1/scheduling-runs/feasibility`                    | ≤ 12             | 10-point sweep, ≤ 1 query per check                       |           |
| SCH-PERF-Q020 | `GET /v1/scheduling/substitution-board`                  | ≤ 4              |                                                           |           |
| SCH-PERF-Q021 | `GET /v1/scheduling/absences/:absenceId/substitutes`     | ≤ 4              | Eligibility resolves with joins, not loops                |           |
| SCH-PERF-Q022 | `GET /v1/scheduling/exam-sessions/:id/slots`             | ≤ 2              |                                                           |           |
| SCH-PERF-Q023 | `GET /v1/scheduling-dashboard/preferences` (self-scoped) | ≤ 3              | Own staff filter                                          |           |
| SCH-PERF-Q024 | `GET /v1/calendar/:tenantId/:token.ics`                  | ≤ 3              | token resolve + entity meta + schedule fetch              |           |

### 9.2 Bulk write paths

| #             | Endpoint                                                    | Pattern                                            | Pass/Fail |
| ------------- | ----------------------------------------------------------- | -------------------------------------------------- | --------- |
| SCH-PERF-Q025 | `POST /v1/scheduling-runs/:id/apply` (Medium)               | Single `createMany` + `updateMany`, NOT row-by-row |           |
| SCH-PERF-Q026 | `POST /v1/scheduling/teacher-competencies/bulk` (500)       | Single `createMany`                                |           |
| SCH-PERF-Q027 | `POST /v1/scheduling/substitute-competencies/bulk` (500)    | Single `createMany`                                |           |
| SCH-PERF-Q028 | `POST /v1/scheduling/curriculum-requirements/bulk-upsert`   | Single bulk upsert, not 100 individual upserts     |           |
| SCH-PERF-Q029 | `POST /v1/schedules/bulk-pin` (100)                         | Single `updateMany`                                |           |
| SCH-PERF-Q030 | `POST /v1/scheduling/exam-sessions/:id/assign-invigilators` | Single `createMany`                                |           |

---

## 10. Cache Strategy

Document what is cacheable and what is not. Cache invalidation rules apply.

### 10.1 Cacheable surfaces

| #             | Surface                                                  | TTL    | Invalidation trigger                                | Pass/Fail |
| ------------- | -------------------------------------------------------- | ------ | --------------------------------------------------- | --------- |
| SCH-PERF-K001 | `GET /v1/timetables/class/:classId` (published)          | 5 min  | On `apply` of any run for tenant + academic_year    |           |
| SCH-PERF-K002 | `GET /v1/timetables/teacher/:staffProfileId` (published) | 5 min  | On `apply` or any `schedule` row update for teacher |           |
| SCH-PERF-K003 | `GET /v1/timetables/room/:roomId`                        | 5 min  | On `apply` or any `schedule` row update for room    |           |
| SCH-PERF-K004 | `GET /v1/timetables/student/:studentId`                  | 5 min  | On `apply` or class enrolment change                |           |
| SCH-PERF-K005 | `GET /v1/calendar/:tenantId/:token.ics`                  | 5 min  | On `apply` for tenant + entity                      |           |
| SCH-PERF-K006 | `GET /v1/scheduling/break-groups`                        | 60 min | On any break-group mutation                         |           |
| SCH-PERF-K007 | `GET /v1/scheduling/rotation`                            | 60 min | On rotation mutation                                |           |
| SCH-PERF-K008 | `GET /v1/scheduling/rotation/current-week`               | 5 min  | On rotation mutation OR midnight rollover           |           |
| SCH-PERF-K009 | `GET /v1/scheduling-dashboard/overview`                  | 60 s   | On `apply` of any run                               |           |
| SCH-PERF-K010 | `GET /v1/scheduling/colleagues`                          | 30 min | On staff profile change                             |           |

### 10.2 Non-cacheable (real-time / mutation-sensitive)

| #             | Surface                                              | Reason                                            | Pass/Fail |
| ------------- | ---------------------------------------------------- | ------------------------------------------------- | --------- |
| SCH-PERF-K011 | `GET /v1/scheduling-runs/:id/progress`               | Real-time polling                                 |           |
| SCH-PERF-K012 | `GET /v1/scheduling-runs/:id/status`                 | Real-time polling                                 |           |
| SCH-PERF-K013 | `GET /v1/scheduling/substitution-board`              | Real-time kiosk; 60s server-side cache acceptable |           |
| SCH-PERF-K014 | `GET /v1/scheduling/offers/my`                       | Polled by teacher; must be fresh                  |           |
| SCH-PERF-K015 | `GET /v1/scheduling/absences/:absenceId/substitutes` | Eligibility depends on live availability          |           |
| SCH-PERF-K016 | `GET /v1/scheduling-dashboard/preferences` (self)    | Personal data; tenant-isolated                    |           |
| SCH-PERF-K017 | `POST /v1/scheduling-runs/:id/diagnostics/simulate`  | What-if; no caching                               |           |
| SCH-PERF-K018 | `GET /v1/scheduling/scenarios/:id`                   | Scenario state changes per solve                  |           |

### 10.3 Cache invariants

| #             | Assertion                                                                                                  | Expected                                         | Pass/Fail |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------- |
| SCH-PERF-K019 | After `POST /v1/scheduling-runs/:id/apply`, all 5-min cached timetables for that academic_year are evicted | Next read returns fresh data (cache miss header) |           |
| SCH-PERF-K020 | Cache keys include `tenant_id` to prevent cross-tenant bleed                                               | No shared cache keys across tenants              |           |
| SCH-PERF-K021 | `.ics` cache respects `If-None-Match` / `ETag`                                                             | 304 response when client has fresh ETag          |           |

---

## 11. Solver Sidecar Performance

The OR-Tools sidecar runs on `SOLVER_PY_URL`. Test the sidecar in isolation (HTTP-only) plus end-to-end via the worker.

### 11.1 Sidecar HTTP latency (isolation)

| #             | Scenario                                              | Wall-clock target                            | Notes                               | Pass/Fail |
| ------------- | ----------------------------------------------------- | -------------------------------------------- | ----------------------------------- | --------- |
| SCH-PERF-X001 | XS input (500 KB JSON), trivial solve                 | ≤ 5 s                                        |                                     |           |
| SCH-PERF-X002 | Medium input (1.5 MB JSON), mid-tier solve            | ≤ 110 s                                      | 90% of `max_solver_duration` (300s) |           |
| SCH-PERF-X003 | Large input (3 MB JSON)                               | ≤ 540 s                                      | 90% of 600s cap                     |           |
| SCH-PERF-X004 | Sidecar HTTP timeout aligns with worker timeout       | Verified                                     |                                     |           |
| SCH-PERF-X005 | Sidecar handles concurrent request from second worker | Reject with 503 OR queue (depending on impl) |                                     |
| SCH-PERF-X006 | Sidecar memory does not grow across sequential solves | Steady RSS over 10 solves                    |                                     |

### 11.2 Sidecar resource budgets

| #             | Resource              | Steady-state | Peak (during Large solve)                                 | Pass/Fail |
| ------------- | --------------------- | ------------ | --------------------------------------------------------- | --------- |
| SCH-PERF-X007 | CPU                   | < 5%         | 80–100% of one core (CP-SAT is single-process by default) |           |
| SCH-PERF-X008 | RSS                   | < 200 MB     | < 4 GB (XL tier)                                          |           |
| SCH-PERF-X009 | File descriptors      | < 50         | < 100                                                     |           |
| SCH-PERF-X010 | Open HTTP connections | 0–1          | 1                                                         |           |

---

## 12. BullMQ / Redis Footprint

| #             | Assertion                                                    | Expected                                         | Pass/Fail |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------ | --------- |
| SCH-PERF-R001 | `bull:scheduling:wait` size at steady state                  | ≤ 5 (single-tenant) or ≤ tenants count           |           |
| SCH-PERF-R002 | `bull:scheduling:active` size                                | ≤ 1 (worker concurrency = 1)                     |           |
| SCH-PERF-R003 | `bull:scheduling:completed` size                             | ≤ 100 (retention policy `removeOnComplete: 100`) |           |
| SCH-PERF-R004 | `bull:scheduling:failed` size                                | ≤ 200 (retention policy `removeOnFail: 200`)     |           |
| SCH-PERF-R005 | Job payload size for `scheduling:solve-v2`                   | < 1 KB (just `{tenant_id, run_id}`)              |           |
| SCH-PERF-R006 | Job payload size for `scheduling:reap-stale-runs`            | < 100 B (empty `{}`)                             |           |
| SCH-PERF-R007 | Total Redis memory for scheduling queue                      | ≤ 10 MB in steady state                          |           |
| SCH-PERF-R008 | No orphaned locks (`bull:scheduling:<jobId>:lock` past TTL)  | Zero after 24 h                                  |           |
| SCH-PERF-R009 | Lock-extension renewals during long Medium solve (5-min cap) | Lock renewed every ≤ 60 s (stalledInterval)      |           |
| SCH-PERF-R010 | Scheduling-canary SLA metric (5 min)                         | No alert during steady state                     |           |

---

## 13. DB Query Analysis

### 13.1 Required indexes

| #             | Table + columns                                                              | Index name                                         | Used by planner? | Pass/Fail |
| ------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- | ---------------- | --------- |
| SCH-PERF-D001 | `schedule(tenant_id, scheduling_run_id)`                                     | `idx_schedule_tenant_run`                          | Yes              |           |
| SCH-PERF-D002 | `schedule(tenant_id, class_id, weekday, period_order)`                       | `idx_schedule_class_grid`                          | Yes              |           |
| SCH-PERF-D003 | `schedule(tenant_id, teacher_staff_id, weekday, period_order)`               | `idx_schedule_teacher_grid`                        | Yes              |           |
| SCH-PERF-D004 | `schedule(tenant_id, room_id, weekday, period_order)`                        | `idx_schedule_room_grid`                           | Yes              |           |
| SCH-PERF-D005 | `schedule(tenant_id, is_pinned)`                                             | `idx_schedule_pinned`                              | Yes              |           |
| SCH-PERF-D006 | `scheduling_run(tenant_id, academic_year_id, status)`                        | `idx_scheduling_run_year_status`                   | Yes              |           |
| SCH-PERF-D007 | `scheduling_run(tenant_id, status, started_at)`                              | `idx_scheduling_run_status_started` (stale-reaper) | Yes              |           |
| SCH-PERF-D008 | `teacher_competency(tenant_id, academic_year_id, year_group_id)`             | `idx_teacher_comp_year_yg`                         | Yes              |           |
| SCH-PERF-D009 | `teacher_competency(tenant_id, staff_profile_id)`                            | `idx_teacher_comp_staff`                           | Yes              |           |
| SCH-PERF-D010 | `substitute_teacher_competency(tenant_id, academic_year_id)`                 | `idx_sub_comp_year`                                | Yes              |           |
| SCH-PERF-D011 | `teacher_absence(tenant_id, date, date_to)`                                  | `idx_absence_date_range`                           | Yes              |           |
| SCH-PERF-D012 | `teacher_absence(tenant_id, staff_id, date)`                                 | `idx_absence_staff_date`                           | Yes              |           |
| SCH-PERF-D013 | `substitution_offer(tenant_id, staff_profile_id, status)`                    | `idx_sub_offer_staff_status`                       | Yes              |           |
| SCH-PERF-D014 | `substitution_record(tenant_id, schedule_id)`                                | `idx_sub_rec_schedule`                             | Yes              |           |
| SCH-PERF-D015 | `curriculum_requirement(tenant_id, academic_year_id, year_group_id)`         | `idx_curriculum_year_yg`                           | Yes              |           |
| SCH-PERF-D016 | `staff_scheduling_preference(tenant_id, staff_profile_id, academic_year_id)` | `idx_staff_pref`                                   | Yes              |           |
| SCH-PERF-D017 | `calendar_subscription_token(tenant_id, token)`                              | `uniq_cal_token`                                   | Yes              |           |
| SCH-PERF-D018 | `exam_session(tenant_id, academic_period_id)`                                | `idx_exam_session_period`                          | Yes              |           |
| SCH-PERF-D019 | `exam_slot(tenant_id, exam_session_id)`                                      | `idx_exam_slot_session`                            | Yes              |           |
| SCH-PERF-D020 | `room_closure(tenant_id, room_id, closure_date)`                             | `idx_room_closure_date`                            | Yes              |           |

### 13.2 pg_stat_statements top-10 (after 1 hr load)

| #             | Assertion                                                                     | Expected                               | Pass/Fail |
| ------------- | ----------------------------------------------------------------------------- | -------------------------------------- | --------- |
| SCH-PERF-D021 | Top-10 by `total_time` contains no unbounded `SELECT *` without WHERE         | All have `tenant_id` filter at minimum |           |
| SCH-PERF-D022 | No single query represents > 40% of total_time                                | Balanced workload                      |           |
| SCH-PERF-D023 | Avg execution time of top-10 ≤ 500 ms                                         | Verified                               |           |
| SCH-PERF-D024 | No `result_json` column projected in `GET /v1/scheduling-runs` (list)         | EXPLAIN does not show JSONB extraction |           |
| SCH-PERF-D025 | `apply` transaction uses `COPY` or single `INSERT … VALUES (…), (…)` for bulk | Verified                               |           |
| SCH-PERF-D026 | Stale-reaper query uses index `idx_scheduling_run_status_started`             | EXPLAIN confirms index scan            |           |

---

## 14. Coverage Holes

Endpoints from §4 that have explicit budgets are listed there. The following endpoints/surfaces have **no explicit budget** in this spec — flag for resolution before launch.

| #             | Endpoint / Surface                                                           | Reason for no explicit budget                                                            | Action           | Pass/Fail |
| ------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------- | --------- |
| SCH-PERF-H001 | Frontend route `/scheduling/runs/[id]` (redirect)                            | Redirect-only, zero work; no budget needed                                               | Documented       |           |
| SCH-PERF-H002 | `/api/v1/period-grid?academic_year_id=`                                      | Period-grid API lives outside the scheduling module backend inventory; tracked elsewhere | Cross-ref needed |           |
| SCH-PERF-H003 | `/api/v1/period-grid` POST/PATCH/DELETE/copy-day/copy-year-group/replace-day | Same as H002 — outside scheduling backend module                                         | Cross-ref needed |           |
| SCH-PERF-H004 | `/api/v1/staff-availability/staff/:staffId/year/:yearId` GET/POST/PATCH      | Staff-availability owned by separate module; cross-reference perf spec                   | Cross-ref needed |           |
| SCH-PERF-H005 | `/api/v1/staff-scheduling-preferences/*` GET/POST/PATCH/DELETE               | Owned by staff-preferences module                                                        | Cross-ref needed |           |
| SCH-PERF-H006 | `/api/v1/staff-scheduling-preferences/own/*`                                 | Same                                                                                     | Cross-ref needed |           |
| SCH-PERF-H007 | `/api/v1/class-subject-requirements/*`                                       | Owned by class-requirements module                                                       | Cross-ref needed |           |
| SCH-PERF-H008 | `/api/v1/class-scheduling-requirements/bulk` GET/POST                        | Same                                                                                     | Cross-ref needed |           |
| SCH-PERF-H009 | `/api/v1/scheduling/competency-coverage` GET                                 | Frontend calls this but it is not in the backend inventory; verify endpoint exists       | Inventory gap    |           |
| SCH-PERF-H010 | `/api/v1/scheduling/class-requirements` GET                                  | Frontend calls this; verify the path against backend                                     | Inventory gap    |           |
| SCH-PERF-H011 | `/api/v1/leave/requests` GET/POST/approve/reject                             | Leave module is separate; admin tool only                                                | Cross-ref needed |           |
| SCH-PERF-H012 | `/api/v1/timetables/me` GET                                                  | Frontend uses this naming; backend has `/v1/scheduling/timetable/my` — alias?            | Inventory gap    |           |
| SCH-PERF-H013 | `/api/v1/calendar/subscription-url` GET                                      | Helper endpoint to render subscription URL; verify implementation                        | Inventory gap    |           |
| SCH-PERF-H014 | `POST /v1/scheduling-runs/:id/diagnostics/refresh` (cold cache)              | Budget given (≤ 4 s) but cache state not modelled; revisit                               | Future spec      |           |
| SCH-PERF-H015 | Solver behaviour with > 10 simultaneous tenants triggering runs              | Cluster-level scheduling not modelled here                                               | Pre-launch load  |           |
| SCH-PERF-H016 | iCalendar generation under `.ics` cache miss with 5,000 schedule rows        | Worst-case cold ICS render not benchmarked                                               | Future spec      |           |
| SCH-PERF-H017 | Timetables print pages other than rooms (no per-class print page benchmark)  | Only room print exists; if class/teacher print is added, budget needed                   | Tracked          |           |
| SCH-PERF-H018 | Scheduling-runs/compare frontend page bundle when comparing 4+ runs          | Compare UI only benchmarked for 2 runs                                                   | Future spec      |           |

**Endpoints without explicit budget: 18 holes flagged.** Of these, 11 are owned by adjacent modules (period-grid, staff-availability, staff-scheduling-preferences, class-subject-requirements, leave) and need cross-reference; 4 are inventory gaps (frontend ↔ backend path mismatches that need verification); 3 are future-spec items.

---

## 15. Observations / Gaps Spotted

1. **`result_json` column risk on the runs list endpoint.** The history page (`/scheduling/runs`) loads up to 100 runs; `findAll` MUST exclude `result_json` and `proposed_adjustments` (both can be multi-MB). The inventory confirms the backend does this ("excludes JSONB fields") — perf tests must verify it stays excluded as the codebase evolves. A regression here turns a 200 ms call into a 30 MB payload at p99.

2. **Stale-reaper / max_solver_duration coupling is fragile.** The reaper runs every minute and only kicks runs older than `max_solver_duration + 60s`. If the tenant raises `max_solver_duration` mid-run, the reaper still measures against the old value (cached at enqueue time)? This is worth verifying as a perf-adjacent correctness issue — flagged here because it surfaces under load.

3. **Single-flight on `scheduling-runs` POST is the only thing keeping the worker concurrency=1 from being saturated.** If the active-run check ever has a race window, two solvers could fight over the sidecar. The sidecar's behaviour under concurrent requests (test SCH-PERF-X005) is the safety net — make sure the sidecar rejects rather than queues.

4. **Frontend / backend path mismatches.** The frontend inventory lists several routes (`/api/v1/timetables/me`, `/api/v1/scheduling/competency-coverage`, `/api/v1/scheduling/class-requirements`, `/api/v1/calendar/subscription-url`) that don't appear in the backend inventory. Either the backend inventory is incomplete or the frontend is calling the wrong paths — the SCH-PERF-H009/H010/H012/H013 holes flag this for resolution before perf tests can run end-to-end.

5. **Substitution board kiosk is the single most exposed read endpoint.** It is public (no auth), polls every 60 s, and is rendered on physical displays where slowness is highly visible. The 1 s p99 budget (SCH-PERF-081) is intentionally tight; the cache strategy in §10 (60 s server-side cache via SCH-PERF-K013) should be implemented if not already.

6. **Hand-rolled forms degrade tested perf paths.** The frontend inventory notes that `/scheduling/substitutions`, `/scheduling/exams`, and `/scheduling/scenarios` use hand-rolled forms (HR-025). Hand-rolled forms have a tendency to fire extra API calls per keystroke or per-field validation; perf tests on these pages should explicitly count network requests during user input and flag if the count exceeds 1 per submit action.

---

## 16. Sign-off

| Role                    | Name | Date | Signature |
| ----------------------- | ---- | ---- | --------- |
| Module engineering lead |      |      |           |
| Performance lead        |      |      |           |
| QA lead                 |      |      |           |
| Operations / on-call    |      |      |           |

**Pre-launch acceptance criteria:**

- All endpoint budgets (§4) measured at `nhqs` scale and passing.
- Solver tiers SCH-PERF-S001 through SCH-PERF-S006 measured and passing (XL S007/S008 deferred to post-launch).
- All 31 page Lighthouse runs (§8) passing.
- All N+1 budgets (§9) verified via `pg_stat_statements`.
- Cache invariants (§10.3) verified.
- All 20 required indexes (§13.1) present in production schema.
- Coverage holes (§14) either resolved (cross-ref or inventory fix) or explicitly accepted by sign-off.

**End of spec.**
