# People — Performance Test Specification

> **Generated:** 2026-04-12  
> **Module slug:** `people`  
> **Scope:** Latency budgets per endpoint, list-endpoint scale matrix, N+1 detection, load/contention, page bundle budgets, memory / event-loop health.  
> **Companion specs:** `../admin_view/` (UI), `../integration/` (contract), `../worker/` (queues), `../security/` (OWASP).

Every row is a measurement with a numeric threshold. Do NOT mark Pass based on "feels fast" — numbers only.

---

## Summary table — measured vs. budget

Populate this table at the end of a run. Leave blank rows `—` in a fresh checkout.

| Metric                                                 | Budget    | Measured | Pass |
| ------------------------------------------------------ | --------- | -------- | ---- |
| GET /v1/students (20 rows) p95                         | < 200 ms  | —        |      |
| GET /v1/students (10k rows, paginated) p95             | < 300 ms  | —        |      |
| GET /v1/students/:id p95                               | < 150 ms  | —        |      |
| GET /v1/students/export-data (10k rows) p95            | < 2000 ms | —        |      |
| GET /v1/students/allergy-report (500 rows) p95         | < 500 ms  | —        |      |
| POST /v1/students p95                                  | < 400 ms  | —        |      |
| PATCH /v1/students/:id p95                             | < 400 ms  | —        |      |
| PATCH /v1/students/:id/status p95                      | < 500 ms  | —        |      |
| GET /v1/households p95                                 | < 200 ms  | —        |      |
| GET /v1/households/:id (with 50 students) p95          | < 250 ms  | —        |      |
| POST /v1/households/merge p95                          | < 1000 ms | —        |      |
| POST /v1/households/split p95                          | < 1000 ms | —        |      |
| GET /v1/staff-profiles p95                             | < 200 ms  | —        |      |
| GET /v1/staff-profiles/:id/bank-details p95 (decrypts) | < 300 ms  | —        |      |
| GET /v1/parents/:id p95                                | < 200 ms  | —        |      |
| /students list page FCP (3G throttled)                 | < 2000 ms | —        |      |
| /households/:id detail page FCP                        | < 2500 ms | —        |      |
| worker search:index-entity p95                         | < 500 ms  | —        |      |
| worker search:full-reindex (10k students) wall-time    | < 30 s    | —        |      |

---

## Table of Contents

1. [Baseline environment specification](#1-baseline-environment-specification)
2. [Fixture seeder for scale](#2-fixture-seeder-for-scale)
3. [Endpoint perf matrix — students](#3-endpoint-perf-matrix--students)
4. [Endpoint perf matrix — staff](#4-endpoint-perf-matrix--staff)
5. [Endpoint perf matrix — households](#5-endpoint-perf-matrix--households)
6. [Endpoint perf matrix — parents](#6-endpoint-perf-matrix--parents)
7. [List-endpoint scale matrix](#7-list-endpoint-scale-matrix)
8. [N+1 detection (relation-heavy endpoints)](#8-n1-detection-relation-heavy-endpoints)
9. [Load / concurrency tests](#9-load--concurrency-tests)
10. [Frontend page bundle + FCP/LCP/CLS budgets](#10-frontend-page-bundle--fcplcpcls-budgets)
11. [Database query health (EXPLAIN ANALYZE)](#11-database-query-health-explain-analyze)
12. [Worker job perf](#12-worker-job-perf)
13. [Memory / event-loop health](#13-memory--event-loop-health)
14. [Cold vs warm start](#14-cold-vs-warm-start)
15. [Sign-off](#15-sign-off)

---

## 1. Baseline environment specification

All measurements MUST be taken in this environment; numbers from a different machine are not comparable.

| Setting             | Value                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Hardware            | `c5.xlarge` (4 vCPU, 8 GB RAM) AWS instance OR local Mac M3 Max (16GB) with 0 other load                |
| OS                  | Ubuntu 22.04 or macOS 14.x                                                                              |
| Node                | 20.x (match `apps/api/package.json` engines)                                                            |
| Postgres            | 15.x                                                                                                    |
| Redis               | 7.x                                                                                                     |
| Network             | API + DB + Redis co-located (same host for local bench; same AZ for cloud bench)                        |
| API process         | Single instance, no PM2 cluster multi-process; warm (1000+ requests served before measurement)          |
| Concurrency ceiling | Designed for 50 concurrent users per tenant (NHQS baseline); load tests use 100 concurrent for headroom |

| #   | What to Check                                                                                                                                                                             | Expected  | Pass/Fail |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------- |
| 1.1 | Environment recorded in a `bench/env-${date}.json` file at the start of each run, including CPU model, OS version, Node version, Postgres version, Redis version, test tenant row counts. | Recorded. |           |
| 1.2 | All other workloads stopped on the machine (no dev server, no Chrome, no background indexer).                                                                                             | Clean.    |           |
| 1.3 | Postgres has `shared_buffers >= 512MB`, `work_mem >= 4MB`.                                                                                                                                | Set.      |           |

---

## 2. Fixture seeder for scale

The perf suite needs tenants at realistic and stress volumes. Current seed gives NHQS ~200 students; stress tests need 10k+.

| #   | What to Check                                                                                                                                        | Expected                       | Pass/Fail |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------- |
| 2.1 | `packages/prisma/seed/perf/seed-perf.ts` (or equivalent) can seed a tenant with N students where N ∈ {0, 100, 1000, 10000}.                          | Seeder exists or can be added. |           |
| 2.2 | Seed approach: bulk `createMany` with raw SQL `INSERT INTO students (...) SELECT generate_series(...)` for speed. 10k students should seed in < 30s. | Fast.                          |           |
| 2.3 | Student-to-household ratio: ~3:1 (typical school family size). For 10k students, seed ~3500 households, ~4000 parents, ~50 staff.                    | Correct ratios.                |           |
| 2.4 | Seed includes `class_enrolments` for the students — typical student has 6-8 active enrolments (subjects).                                            | Present.                       |           |
| 2.5 | `gdpr_consent_records` seeded: ~50% of students have granted health-data consent (realistic adoption rate).                                          | Correct.                       |           |

---

## 3. Endpoint perf matrix — students

Measurement tool: `autocannon` (Node load tool) for HTTP load. Percentiles computed from 1000 samples per endpoint per data volume.

### 3.1 GET /v1/students (list)

| #     | Volume                                                                              | Budget (p50 / p95 / p99) | Payload size budget         | Tool + command                                                                                  | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------- | ------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------- | --------- |
| 3.1.1 | Empty tenant (0 rows)                                                               | 30 / 80 / 150 ms         | < 1 KB                      | `autocannon -c 10 -d 10 -H "Authorization: Bearer <token>" https://api/v1/students?pageSize=20` |           |
| 3.1.2 | Realistic (200 rows, page 1)                                                        | 50 / 200 / 400 ms        | < 40 KB                     | same                                                                                            |           |
| 3.1.3 | Stress (10k rows, page 1)                                                           | 70 / 300 / 600 ms        | < 40 KB (page 1 fixed size) | same                                                                                            |           |
| 3.1.4 | Stress + filters (`?status=active&year_group_id=<uuid>`)                            | 70 / 300 / 600 ms        | < 40 KB                     | filter query                                                                                    |           |
| 3.1.5 | Deep pagination (page 500 of 10k, pageSize=20)                                      | 80 / 350 / 700 ms        | < 40 KB                     | ensure index covers `(tenant_id, last_name, id)` for OFFSET efficiency                          |           |
| 3.1.6 | pageSize=100 vs pageSize=20 on realistic volume — scales linearly (p95 ratio ≤ 5x). | linear                   | —                           | autocannon per pageSize                                                                         |           |

### 3.2 GET /v1/students/:id

| #     | What to measure                                                       | Budget       | Pass/Fail |
| ----- | --------------------------------------------------------------------- | ------------ | --------- |
| 3.2.1 | Student with 0 enrolments, 1 parent                                   | p95 < 100 ms |           |
| 3.2.2 | Student with 10 enrolments, 2 parents                                 | p95 < 150 ms |           |
| 3.2.3 | Student with 50 enrolments (edge case — over their career), 4 parents | p95 < 250 ms |           |

### 3.3 GET /v1/students/export-data

| #     | Volume                                 | Budget                                        | Payload        | Pass/Fail |
| ----- | -------------------------------------- | --------------------------------------------- | -------------- | --------- |
| 3.3.1 | 200 students                           | p95 < 400 ms                                  | < 200 KB       |           |
| 3.3.2 | 1000 students                          | p95 < 800 ms                                  | < 1 MB         |           |
| 3.3.3 | 10k students                           | p95 < 2000 ms                                 | < 10 MB (JSON) |           |
| 3.3.4 | 10k students + filter `?status=active` | p95 < 2000 ms (tighter filter = faster query) | —              |           |

### 3.4 GET /v1/students/allergy-report

| #     | Volume                                          | Budget                       | Pass/Fail |
| ----- | ----------------------------------------------- | ---------------------------- | --------- |
| 3.4.1 | 200 allergy students with 100 consented         | p95 < 200 ms                 |           |
| 3.4.2 | 1000 allergy students with 500 consented        | p95 < 500 ms                 |           |
| 3.4.3 | 10k allergy students with 5000 consented        | p95 < 2000 ms                |           |
| 3.4.4 | With `class_id` filter (joins class_enrolments) | p95 within 1.5x of no-filter |           |

### 3.5 GET /v1/students/:id/preview (Redis cached)

| #     | What to measure         | Budget                                      | Pass/Fail |
| ----- | ----------------------- | ------------------------------------------- | --------- |
| 3.5.1 | Cache miss (first call) | p95 < 100 ms                                |           |
| 3.5.2 | Cache hit               | p95 < 20 ms                                 |           |
| 3.5.3 | Cache hit throughput    | > 5000 req/s with `autocannon -c 100 -d 30` |           |

### 3.6 POST /v1/students

| #     | What to measure                  | Budget                                       | Pass/Fail |
| ----- | -------------------------------- | -------------------------------------------- | --------- |
| 3.6.1 | Happy create (no parent_links)   | p95 < 300 ms                                 |           |
| 3.6.2 | Happy create with 4 parent_links | p95 < 400 ms (extra student_parents inserts) |           |

### 3.7 PATCH /v1/students/:id

| #     | What to measure  | Budget       | Pass/Fail |
| ----- | ---------------- | ------------ | --------- |
| 3.7.1 | Update 1 field   | p95 < 200 ms |           |
| 3.7.2 | Update 10 fields | p95 < 250 ms |           |

### 3.8 PATCH /v1/students/:id/status

| #     | What to measure                                      | Budget                                   | Pass/Fail |
| ----- | ---------------------------------------------------- | ---------------------------------------- | --------- |
| 3.8.1 | applicant → active (no enrolments side-effect)       | p95 < 150 ms                             |           |
| 3.8.2 | active → withdrawn (drops enrolments via updateMany) | p95 < 300 ms (with 10 active enrolments) |           |
| 3.8.3 | active → withdrawn with 100 active enrolments        | p95 < 500 ms                             |           |

### 3.9 GET /v1/students/:id/export-pack

| #     | What to measure | Budget       | Pass/Fail |
| ----- | --------------- | ------------ | --------- |
| 3.9.1 | Simple student  | p95 < 300 ms |           |

---

## 4. Endpoint perf matrix — staff

### 4.1 GET /v1/staff-profiles

| #     | Volume              | Budget       | Pass/Fail |
| ----- | ------------------- | ------------ | --------- |
| 4.1.1 | 20 staff            | p95 < 150 ms |           |
| 4.1.2 | 200 staff           | p95 < 200 ms |           |
| 4.1.3 | 1000 staff (stress) | p95 < 400 ms |           |

### 4.2 GET /v1/staff-profiles/:id

| #     | What to measure                       | Budget       | Pass/Fail |
| ----- | ------------------------------------- | ------------ | --------- |
| 4.2.1 | Staff with 10 class_staff assignments | p95 < 200 ms |           |

### 4.3 GET /v1/staff-profiles/:id/bank-details (decrypts)

| #     | What to measure                               | Budget                                                    | Pass/Fail |
| ----- | --------------------------------------------- | --------------------------------------------------------- | --------- |
| 4.3.1 | Staff with bank fields set (decrypt 2 fields) | p95 < 300 ms (AES-256 decrypt is cheap but adds overhead) |           |
| 4.3.2 | Staff with no bank fields                     | p95 < 150 ms                                              |           |

### 4.4 POST /v1/staff-profiles

| #     | What to measure                                                            | Budget       | Pass/Fail |
| ----- | -------------------------------------------------------------------------- | ------------ | --------- |
| 4.4.1 | Create with new user + membership + role + staff_profile + bank encryption | p95 < 500 ms |           |
| 4.4.2 | Create with existing user (reuse)                                          | p95 < 400 ms |           |

### 4.5 PATCH /v1/staff-profiles/:id

| #     | What to measure                  | Budget       | Pass/Fail |
| ----- | -------------------------------- | ------------ | --------- |
| 4.5.1 | Update non-bank field            | p95 < 200 ms |           |
| 4.5.2 | Update bank fields (re-encrypts) | p95 < 300 ms |           |

---

## 5. Endpoint perf matrix — households

### 5.1 GET /v1/households

| #     | Volume                    | Budget       | Pass/Fail |
| ----- | ------------------------- | ------------ | --------- |
| 5.1.1 | 50 households             | p95 < 150 ms |           |
| 5.1.2 | 1000 households           | p95 < 300 ms |           |
| 5.1.3 | 10000 households (stress) | p95 < 500 ms |           |

### 5.2 GET /v1/households/:id

| #     | What to measure                                   | Budget                                           | Pass/Fail |
| ----- | ------------------------------------------------- | ------------------------------------------------ | --------- |
| 5.2.1 | Household with 3 students, 2 parents, 2 contacts  | p95 < 200 ms                                     |           |
| 5.2.2 | Household with 10 students, 4 parents, 3 contacts | p95 < 250 ms                                     |           |
| 5.2.3 | Household with 50 students (edge)                 | p95 < 400 ms — watch for N+1 on students.include |           |

### 5.3 GET /v1/households/next-number

| #     | What to measure | Budget      | Pass/Fail |
| ----- | --------------- | ----------- | --------- |
| 5.3.1 | Simple preview  | p95 < 80 ms |           |

### 5.4 POST /v1/households

| #     | What to measure                 | Budget       | Pass/Fail |
| ----- | ------------------------------- | ------------ | --------- |
| 5.4.1 | Create with 1 emergency contact | p95 < 300 ms |           |
| 5.4.2 | Create with 3 contacts          | p95 < 400 ms |           |

### 5.5 PATCH /v1/households/:id

| #     | What to measure | Budget       | Pass/Fail |
| ----- | --------------- | ------------ | --------- |
| 5.5.1 | Simple update   | p95 < 200 ms |           |

### 5.6 PATCH /v1/households/:id/status

| #     | Budget       | Pass/Fail |
| ----- | ------------ | --------- |
| 5.6.1 | p95 < 150 ms |           |

### 5.7 PUT /v1/households/:id/billing-parent

| #     | Budget                                                    | Pass/Fail |
| ----- | --------------------------------------------------------- | --------- |
| 5.7.1 | p95 < 200 ms (lookups + update + needs_completion recalc) |           |

### 5.8 Emergency contact CRUD

| #     | Endpoint                       | Budget       | Pass/Fail |
| ----- | ------------------------------ | ------------ | --------- |
| 5.8.1 | POST /emergency-contacts       | p95 < 200 ms |           |
| 5.8.2 | PATCH /emergency-contacts/:id  | p95 < 200 ms |           |
| 5.8.3 | DELETE /emergency-contacts/:id | p95 < 200 ms |           |

### 5.9 Parent link endpoints

| #     | Endpoint             | Budget       | Pass/Fail |
| ----- | -------------------- | ------------ | --------- |
| 5.9.1 | POST /parents (link) | p95 < 200 ms |           |
| 5.9.2 | DELETE /parents/:id  | p95 < 200 ms |           |

### 5.10 POST /v1/households/:id/students

| #      | Budget                                          | Pass/Fail |
| ------ | ----------------------------------------------- | --------- |
| 5.10.1 | p95 < 500 ms (delegates to RegistrationService) |           |

### 5.11 POST /v1/households/merge

| #      | What to measure                                  | Budget        | Pass/Fail |
| ------ | ------------------------------------------------ | ------------- | --------- |
| 5.11.1 | Small: 3 students, 2 parents, 2 contacts on each | p95 < 600 ms  |           |
| 5.11.2 | Medium: 10 students, 4 parents, 3 contacts       | p95 < 800 ms  |           |
| 5.11.3 | Large: 50 students, 8 parents, 3 contacts        | p95 < 1500 ms |           |

### 5.12 POST /v1/households/split

| #      | What to measure                        | Budget        | Pass/Fail |
| ------ | -------------------------------------- | ------------- | --------- |
| 5.12.1 | Move 3 students, 2 parents, 2 contacts | p95 < 600 ms  |           |
| 5.12.2 | Move 20 students                       | p95 < 1200 ms |           |

### 5.13 GET /v1/households/:id/preview (Redis cached)

| #      | What to measure | Budget       | Pass/Fail |
| ------ | --------------- | ------------ | --------- |
| 5.13.1 | Cache miss      | p95 < 150 ms |           |
| 5.13.2 | Cache hit       | p95 < 20 ms  |           |

---

## 6. Endpoint perf matrix — parents

### 6.1 GET /v1/parents

| #     | Volume       | Budget       | Pass/Fail |
| ----- | ------------ | ------------ | --------- |
| 6.1.1 | 30 parents   | p95 < 150 ms |           |
| 6.1.2 | 1000 parents | p95 < 300 ms |           |

### 6.2 GET /v1/parents/:id

| #     | What to measure                              | Budget       | Pass/Fail |
| ----- | -------------------------------------------- | ------------ | --------- |
| 6.2.1 | Parent with 2 households, 3 children         | p95 < 200 ms |           |
| 6.2.2 | Parent with 5 households, 10 children (edge) | p95 < 300 ms |           |

### 6.3 POST /v1/parents

| #     | What to measure               | Budget       | Pass/Fail |
| ----- | ----------------------------- | ------------ | --------- |
| 6.3.1 | Create without household link | p95 < 200 ms |           |
| 6.3.2 | Create with household link    | p95 < 300 ms |           |

### 6.4 PATCH /v1/parents/:id

| #     | Budget       | Pass/Fail |
| ----- | ------------ | --------- |
| 6.4.1 | p95 < 200 ms |           |

### 6.5 POST/DELETE /v1/parents/:id/students

| #     | Budget                    | Pass/Fail |
| ----- | ------------------------- | --------- |
| 6.5.1 | POST link: p95 < 250 ms   |           |
| 6.5.2 | DELETE link: p95 < 200 ms |           |

---

## 7. List-endpoint scale matrix

All list endpoints at three volumes. The rule: p95 at stress volume MUST be within 3x of p95 at realistic volume. A larger ratio indicates a missing index or O(N) operation.

| Endpoint               | Empty (p95) | Realistic (p95) | Stress (p95)  | Realistic→Stress ratio | Budget (≤ 3x)             |
| ---------------------- | ----------- | --------------- | ------------- | ---------------------- | ------------------------- |
| GET /v1/students       | —           | 200ms @ 200     | 300ms @ 10000 | —                      | ≤ 3x                      |
| GET /v1/households     | —           | 150ms @ 50      | 500ms @ 10000 | —                      | ≤ 3.5x (slightly relaxed) |
| GET /v1/staff-profiles | —           | 150ms @ 20      | 400ms @ 1000  | —                      | ≤ 3x                      |
| GET /v1/parents        | —           | 150ms @ 30      | 300ms @ 1000  | —                      | ≤ 3x                      |

| #   | What to measure                                                              | Expected | Pass/Fail |
| --- | ---------------------------------------------------------------------------- | -------- | --------- |
| 7.1 | Run each endpoint at all three volumes. Record measured values.              | Filled.  |           |
| 7.2 | Any ratio > 3x is a coverage hole — investigate via `EXPLAIN ANALYZE` (§11). | —        |           |

---

## 8. N+1 detection (relation-heavy endpoints)

Instrument Prisma with `$on('query')` to count queries per HTTP request. Most list endpoints should be 2-3 queries (data + count + optional RLS SET). Detail endpoints should be 1-2.

| #   | Endpoint                                                                                                                                           | Query count budget                                                                      | Pass/Fail |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| 8.1 | GET /v1/students (20 rows, includes year_group + household)                                                                                        | ≤ 3 (SET + data + count). The `include` is a JOIN in one query, NOT per-row.            |           |
| 8.2 | GET /v1/students/:id (with parents + enrolments + year_group + homeroom_class + household)                                                         | ≤ 2 (SET + one findFirst with nested includes)                                          |           |
| 8.3 | GET /v1/households/:id (with billing_parent + contacts + parents + students)                                                                       | ≤ 2                                                                                     |           |
| 8.4 | GET /v1/staff-profiles (20 rows with user.memberships.membership_roles.role)                                                                       | ≤ 3. The nested `include` is a LEFT JOIN. Confirm Prisma does NOT issue 20 sub-queries. |           |
| 8.5 | GET /v1/staff-profiles/:id (with user + class_staff.class_entity.{academic_year,subject})                                                          | ≤ 2                                                                                     |           |
| 8.6 | GET /v1/parents/:id (with household_parents.household + student_parents.student)                                                                   | ≤ 2                                                                                     |           |
| 8.7 | GET /v1/households (20 rows with \_count.students + billing_parent)                                                                                | ≤ 3 (SET + data + count). `_count` is part of the data query.                           |           |
| 8.8 | GET /v1/students/export-data (N rows, no pagination) — if query count is O(N), that's a critical N+1. Must be O(1) — one query fetches everything. | ≤ 2                                                                                     |           |
| 8.9 | Allergy report — includes year_group, homeroom_class, consent lookup. Count: 1 student query + 1 consent_records query = 2.                        | ≤ 3                                                                                     |           |

Failing any row here is a release blocker — scale will degrade exponentially.

---

## 9. Load / concurrency tests

Tool: `k6` or `autocannon`. Load = N parallel users × M requests each.

### 9.1 Read burst

| #     | What to measure                           | Load                         | Budget                                              | Pass/Fail |
| ----- | ----------------------------------------- | ---------------------------- | --------------------------------------------------- | --------- |
| 9.1.1 | GET /v1/students list with 200 students   | 100 users × 30s steady state | p95 < 300 ms, error rate 0%, throughput > 500 req/s |           |
| 9.1.2 | GET /v1/students/:id on 200 distinct ids  | 100 users × 30s              | p95 < 200 ms                                        |           |
| 9.1.3 | GET /v1/households/:id on 50 distinct ids | 100 users × 30s              | p95 < 300 ms                                        |           |

### 9.2 Mutation burst

| #     | What to measure                        | Load           | Budget                  | Pass/Fail |
| ----- | -------------------------------------- | -------------- | ----------------------- | --------- |
| 9.2.1 | POST /v1/students (unique payloads)    | 20 users × 30s | p95 < 500 ms, no errors |           |
| 9.2.2 | PATCH /v1/students/:id (different ids) | 20 users × 30s | p95 < 400 ms            |           |

### 9.3 Contention (single resource)

| #     | What to measure                                                            | Load        | Budget                                                                   | Pass/Fail |
| ----- | -------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------ | --------- |
| 9.3.1 | PATCH /v1/students/{id}/status (same id, parallel)                         | 10 parallel | 1 succeeds, 9 return 400 `INVALID_STATUS_TRANSITION` within p95 < 300 ms |           |
| 9.3.2 | POST /v1/households/merge (same source + target)                           | 10 parallel | 1 succeeds, 9 return 400 or see archived state within p95 < 1500 ms      |           |
| 9.3.3 | POST /v1/households/{id}/emergency-contacts on a household with 2 contacts | 10 parallel | 1 succeeds (reaches cap 3), 9 return 400 `CONTACTS_LIMIT_REACHED`        |           |

### 9.4 Cross-tenant isolation under load

| #     | What to measure                                                                                                                   | Load | Budget                       | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------- | --------- |
| 9.4.1 | Tenant B floods `GET /v1/students` at 500 req/s. Tenant A's list latency during this is unchanged (no cross-tenant perf leakage). | —    | A p95 within 10% of baseline |           |

---

## 10. Frontend page bundle + FCP/LCP/CLS budgets

Measure via Lighthouse on a 3G-throttled profile (150 kB/s throughput, 100ms RTT). Record per-route.

| #     | Route                       | JS bundle (gzipped)                     | FCP       | LCP       | CLS   | Pass/Fail |
| ----- | --------------------------- | --------------------------------------- | --------- | --------- | ----- | --------- |
| 10.1  | /en/students                | < 250 KB                                | < 2000 ms | < 2500 ms | < 0.1 |           |
| 10.2  | /en/students/new            | < 300 KB (form heavier)                 | < 2500 ms | < 3000 ms | < 0.1 |           |
| 10.3  | /en/students/:id            | < 250 KB                                | < 2000 ms | < 2500 ms | < 0.1 |           |
| 10.4  | /en/students/:id/edit       | < 300 KB                                | < 2500 ms | < 3000 ms | < 0.1 |           |
| 10.5  | /en/students/allergy-report | < 200 KB                                | < 2000 ms | < 2500 ms | < 0.1 |           |
| 10.6  | /en/staff                   | < 250 KB                                | < 2000 ms | < 2500 ms | < 0.1 |           |
| 10.7  | /en/staff/new               | < 300 KB                                | < 2500 ms | < 3000 ms | < 0.1 |           |
| 10.8  | /en/staff/:id               | < 250 KB                                | < 2000 ms | < 2500 ms | < 0.1 |           |
| 10.9  | /en/staff/:id/edit          | < 300 KB                                | < 2500 ms | < 3000 ms | < 0.1 |           |
| 10.10 | /en/households              | < 200 KB                                | < 2000 ms | < 2500 ms | < 0.1 |           |
| 10.11 | /en/households/new          | < 300 KB                                | < 2500 ms | < 3000 ms | < 0.1 |           |
| 10.12 | /en/households/:id          | < 300 KB (tabbed with multiple dialogs) | < 2500 ms | < 3000 ms | < 0.1 |           |
| 10.13 | /en/households/:id/edit     | < 300 KB                                | < 2500 ms | < 3000 ms | < 0.1 |           |
| 10.14 | /en/parents/:id             | < 200 KB                                | < 2000 ms | < 2500 ms | < 0.1 |           |

Additional:

| #     | What to measure                                                                                            | Expected                        | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- | --------- |
| 10.15 | Per-route `next build` output shows no unexpectedly large chunks.                                          | Inspect `.next/analyze` report. |           |
| 10.16 | No shared chunks > 500 KB gzipped across the module.                                                       | Clean.                          |           |
| 10.17 | XLSX + jsPDF libraries loaded ONLY when the export dialog opens (lazy import). Verify via bundle analyzer. | Lazy.                           |           |
| 10.18 | Household detail's merge/split dialogs lazy-loaded.                                                        | Lazy.                           |           |

---

## 11. Database query health (EXPLAIN ANALYZE)

For each query issued at stress volume. Take the query text from Prisma's query log, append `EXPLAIN ANALYZE`, run in `psql`.

| #     | Query                                                                                                                  | Expected plan                                                                   | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------- |
| 11.1  | List students with `tenant_id=? ORDER BY last_name ASC LIMIT 20 OFFSET 0`                                              | Index Scan on `idx_students_tenant` + sort; cost < 500; no seq scan.            |           |
| 11.2  | Same with `status=?` filter                                                                                            | Index Scan on `idx_students_tenant_status`.                                     |           |
| 11.3  | Same with `year_group_id=?`                                                                                            | Index Scan on `idx_students_tenant_year_group`.                                 |           |
| 11.4  | Same with `household_id=?`                                                                                             | Index Scan on `idx_students_tenant_household`.                                  |           |
| 11.5  | `SELECT COUNT(*) FROM students WHERE tenant_id=?`                                                                      | Index-only scan (if stats allow); fallback to Index Scan. Cost < 100.           |           |
| 11.6  | Student detail query with nested includes (`findFirst` with `student_parents`, `class_enrolments`, `year_group`, etc.) | Multiple Index Scans joined. No seq scan on any large table. Total cost < 2000. |           |
| 11.7  | List households with `_count.students`                                                                                 | `LATERAL` subquery or equivalent; cost reasonable; no seq scan.                 |           |
| 11.8  | List staff_profiles with nested `user.memberships.membership_roles`                                                    | Multiple index scans; cost reasonable.                                          |           |
| 11.9  | Allergy-report with `class_id` filter (joins class_enrolments)                                                         | Indexed join on `class_enrolments(class_id, status)`.                           |           |
| 11.10 | Merge's `UPDATE students SET household_id=? WHERE household_id=? AND tenant_id=?`                                      | Index scan + update; cost proportional to rows moved.                           |           |

**Failure criteria**: any `Seq Scan on students` or `Seq Scan on households` at stress volume is a release blocker (missing or unused index).

---

## 12. Worker job perf

### 12.1 search:index-entity

| #      | What to measure                                  | Budget                                                   | Pass/Fail |
| ------ | ------------------------------------------------ | -------------------------------------------------------- | --------- |
| 12.1.1 | Single upsert for a student (DB read + stub log) | p95 < 200 ms                                             |           |
| 12.1.2 | Single upsert for a household                    | p95 < 150 ms                                             |           |
| 12.1.3 | Single upsert for staff (reads `staff.user`)     | p95 < 200 ms                                             |           |
| 12.1.4 | Throughput: 1000 jobs in the queue               | 100 jobs/s (concurrency 1) or 500 jobs/s (concurrency 5) |           |
| 12.1.5 | Delete job (no DB read)                          | p95 < 50 ms                                              |           |

### 12.2 search:full-reindex

| #      | What to measure                                                                     | Budget           | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------- | ---------------- | --------- |
| 12.2.1 | Tenant with 200 students (209 NHQS baseline)                                        | wall-time < 2 s  |           |
| 12.2.2 | Tenant with 1000 students                                                           | wall-time < 5 s  |           |
| 12.2.3 | Tenant with 10000 students                                                          | wall-time < 30 s |           |
| 12.2.4 | Memory usage during 10k reindex: RSS delta < 200 MB (batch of 200 × 4 entity types) | Under cap        |           |

---

## 13. Memory / event-loop health

| #    | What to measure                                                                            | Budget                                               | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | --------- |
| 13.1 | Process RSS after 10k GET /v1/students requests                                            | < 600 MB                                             |           |
| 13.2 | Process RSS after 1k POST /v1/students requests                                            | < 600 MB (no leak)                                   |           |
| 13.3 | Event-loop lag during 500 req/s steady state                                               | p99 < 50 ms (via `perf_hooks.monitorEventLoopDelay`) |           |
| 13.4 | After the whole perf run, RSS returns to < 1.5x baseline within 30s idle (no sticky leaks) | Correct.                                             |           |
| 13.5 | No unbounded Redis connection growth — pool saturates then stabilises.                     | Correct.                                             |           |
| 13.6 | Prisma connection pool max 10 (default). Under 500 req/s, no `connection timeout` errors.  | Clean.                                               |           |

---

## 14. Cold vs warm start

| #    | What to measure                                  | Budget                                              | Pass/Fail |
| ---- | ------------------------------------------------ | --------------------------------------------------- | --------- |
| 14.1 | First GET /v1/students after `pnpm start`        | < 3x the warm p95 (a reasonable bootstrapping cost) |           |
| 14.2 | First POST /v1/students after boot               | < 3x warm p95                                       |           |
| 14.3 | Cold start for the worker (first job after boot) | < 3x warm p95                                       |           |

---

## 15. Sign-off

| Section                 | Reviewer | Date | Measured Pass | Budget Misses | Notes |
| ----------------------- | -------- | ---- | ------------- | ------------- | ----- |
| 1. Environment          |          |      |               |               |       |
| 2. Fixture              |          |      |               |               |       |
| 3. Students perf        |          |      |               |               |       |
| 4. Staff perf           |          |      |               |               |       |
| 5. Households perf      |          |      |               |               |       |
| 6. Parents perf         |          |      |               |               |       |
| 7. Scale matrix         |          |      |               |               |       |
| 8. N+1 detection        |          |      |               |               |       |
| 9. Load / concurrency   |          |      |               |               |       |
| 10. Frontend bundles    |          |      |               |               |       |
| 11. Query EXPLAIN       |          |      |               |               |       |
| 12. Worker perf         |          |      |               |               |       |
| 13. Memory / event loop |          |      |               |               |       |
| 14. Cold/warm           |          |      |               |               |       |

**Release-ready when:**

- All p95 budgets in the summary table pass, AND
- Zero Seq Scans on large tables at stress volume (§11), AND
- Every N+1 row (§8) within budget, AND
- Memory is flat over the full run (§13.4).

**Endpoints without budgets (coverage holes — fill in next iteration):**

- None currently — every documented endpoint has a budget row in §3–§6.

---

**End of Perf Spec.**
