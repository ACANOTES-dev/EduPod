# Assessment Module — Performance Test Specification

**Module:** Assessment (Gradebook + Analytics + Report Card generation)
**Surface:** API latency budgets, list-endpoint scaling, PDF render time, bundle size, cold-start.
**Execution target:** `k6` / `artillery` scripts hitting staging. Lighthouse for page budgets. `@axe-core/cli` not in scope (a11y is a separate workflow).
**Last Updated:** 2026-04-12

---

## Table of Contents

1. [Prerequisites & Harness](#1-prerequisites--harness)
2. [Endpoint Latency Budgets — p50 / p95 / p99](#2-endpoint-latency-budgets--p50--p95--p99)
3. [List Endpoint Scale Matrix](#3-list-endpoint-scale-matrix)
4. [Compute Period Grades — Scale](#4-compute-period-grades--scale)
5. [Bulk Grade Write — Throughput](#5-bulk-grade-write--throughput)
6. [Bulk Import Job — Throughput](#6-bulk-import-job--throughput)
7. [PDF Render Time (Report Card / Transcript / Results)](#7-pdf-render-time-report-card--transcript--results)
8. [Mass Report Card Generation — Throughput](#8-mass-report-card-generation--throughput)
9. [Analytics Endpoints — Response Time](#9-analytics-endpoints--response-time)
10. [Parent-Side Reads — Latency](#10-parent-side-reads--latency)
11. [Frontend Page Budgets (Lighthouse)](#11-frontend-page-budgets-lighthouse)
12. [Bundle Size](#12-bundle-size)
13. [Cold Start Times](#13-cold-start-times)
14. [Load Profiles & Soak Tests](#14-load-profiles--soak-tests)
15. [Contention Scenarios](#15-contention-scenarios)
16. [DB Query Cost — N+1 Detection](#16-db-query-cost--n1-detection)
17. [Caching Strategy Verification](#17-caching-strategy-verification)
18. [Memory Usage](#18-memory-usage)
19. [Endpoints Without Budgets — Coverage Holes](#19-endpoints-without-budgets--coverage-holes)
20. [Observations](#20-observations)
21. [Sign-Off](#21-sign-off)

---

## 1. Prerequisites & Harness

| Item               | Spec                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Staging tenant     | Seeded to realistic scale: 1 000 students, 50 classes, 15 subjects, 200 assessments, 200 000 grades, 10 000 period snapshots. |
| Second tenant      | 100 students, small-scale control.                                                                                            |
| k6 / artillery     | Scripts in `/tools/perf/assessment/*.js`. Run against staging.                                                                |
| Observer           | Datadog / Grafana for p50/p95/p99 breakdowns. Node event-loop lag metric visible.                                             |
| Measurement window | 10 min sustained load per scenario unless noted.                                                                              |
| Result aggregation | Averaged across 3 runs; reject outliers > 2σ.                                                                                 |

---

## 2. Endpoint Latency Budgets — p50 / p95 / p99

Budgets are targets; any endpoint exceeding p95 is a bug.

| #    | Endpoint                                                  | Method     | p50 budget   | p95 budget   | p99 budget    | Notes                               | Pass/Fail |
| ---- | --------------------------------------------------------- | ---------- | ------------ | ------------ | ------------- | ----------------------------------- | --------- |
| 2.1  | /api/v1/gradebook/teaching-allocations/all                | GET        | 100 ms       | 250 ms       | 500 ms        | Admin dashboard root                |           |
| 2.2  | /api/v1/gradebook/teaching-allocations                    | GET        | 60 ms        | 150 ms       | 300 ms        | Teacher dashboard                   |           |
| 2.3  | /api/v1/gradebook/classes/{id}/allocations                | GET        | 60 ms        | 150 ms       | 300 ms        |                                     |           |
| 2.4  | /api/v1/gradebook/assessments (list)                      | GET        | 80 ms        | 200 ms       | 400 ms        | With pageSize=100                   |           |
| 2.5  | /api/v1/gradebook/assessments                             | POST       | 100 ms       | 250 ms       | 500 ms        | Single create                       |           |
| 2.6  | /api/v1/gradebook/assessments/{id}                        | GET        | 40 ms        | 100 ms       | 200 ms        |                                     |           |
| 2.7  | /api/v1/gradebook/assessments/{id}/status                 | PATCH      | 80 ms        | 200 ms       | 400 ms        | State machine check + UPDATE        |           |
| 2.8  | /api/v1/gradebook/assessments/{id}/grades                 | GET        | 80 ms        | 200 ms       | 400 ms        | 30 students                         |           |
| 2.9  | /api/v1/gradebook/assessments/{id}/grades                 | PUT        | 150 ms       | 400 ms       | 800 ms        | Bulk upsert 30 grades               |           |
| 2.10 | /api/v1/gradebook/period-grades/compute                   | POST       | 500 ms       | 1 500 ms     | 3 000 ms      | 30 students × 5 assessments         |           |
| 2.11 | /api/v1/gradebook/period-grades                           | GET        | 80 ms        | 200 ms       | 400 ms        |                                     |           |
| 2.12 | /api/v1/gradebook/period-grades/{id}/override             | POST       | 80 ms        | 200 ms       | 400 ms        |                                     |           |
| 2.13 | /api/v1/gradebook/period-grades/cross-subject             | GET        | 200 ms       | 500 ms       | 1 000 ms      |                                     |           |
| 2.14 | /api/v1/gradebook/period-grades/cross-period              | GET        | 200 ms       | 500 ms       | 1 000 ms      |                                     |           |
| 2.15 | /api/v1/gradebook/period-grades/year-overview             | GET        | 300 ms       | 700 ms       | 1 500 ms      |                                     |           |
| 2.16 | /api/v1/gradebook/classes/{id}/results-matrix             | GET        | 200 ms       | 500 ms       | 1 000 ms      | 30 students × 20 assessments        |           |
| 2.17 | /api/v1/gradebook/classes/{id}/results-matrix             | PUT        | 300 ms       | 700 ms       | 1 500 ms      |                                     |           |
| 2.18 | /api/v1/gradebook/teacher-grading-weights (list)          | GET        | 80 ms        | 200 ms       | 400 ms        |                                     |           |
| 2.19 | /api/v1/gradebook/teacher-grading-weights                 | POST       | 100 ms       | 250 ms       | 500 ms        |                                     |           |
| 2.20 | /api/v1/gradebook/teacher-grading-weights/{id}/submit     | POST       | 60 ms        | 150 ms       | 300 ms        |                                     |           |
| 2.21 | /api/v1/gradebook/teacher-grading-weights/{id}/review     | POST       | 80 ms        | 200 ms       | 400 ms        |                                     |           |
| 2.22 | /api/v1/gradebook/assessment-categories                   | GET / POST | 80 / 100 ms  | 200 / 250 ms | 400 / 500 ms  |                                     |           |
| 2.23 | /api/v1/gradebook/rubric-templates                        | GET / POST | 80 / 100 ms  | 200 / 250 ms | 400 / 500 ms  |                                     |           |
| 2.24 | /api/v1/gradebook/curriculum-standards                    | GET / POST | 80 / 100 ms  | 200 / 250 ms | 400 / 500 ms  |                                     |           |
| 2.25 | /api/v1/gradebook/assessments/{id}/unlock-request         | POST       | 80 ms        | 200 ms       | 400 ms        |                                     |           |
| 2.26 | /api/v1/gradebook/unlock-requests                         | GET        | 80 ms        | 200 ms       | 400 ms        |                                     |           |
| 2.27 | /api/v1/gradebook/unlock-requests/{id}/review             | POST       | 100 ms       | 250 ms       | 500 ms        | Updates 2 tables in transaction     |           |
| 2.28 | /api/v1/gradebook/import/template                         | GET        | 200 ms       | 500 ms       | 1 000 ms      | Generates XLSX                      |           |
| 2.29 | /api/v1/gradebook/import/validate                         | POST       | 500 ms       | 1 500 ms     | 3 000 ms      | 100-row file                        |           |
| 2.30 | /api/v1/gradebook/import/process                          | POST       | 100 ms       | 250 ms       | 500 ms        | Just enqueues job                   |           |
| 2.31 | /api/v1/gradebook/weight-config/subject-weights           | GET / PUT  | 100 / 200 ms | 250 / 500 ms | 500 / 1000 ms |                                     |           |
| 2.32 | /api/v1/gradebook/weight-config/period-weights            | GET / PUT  | 80 / 150 ms  | 200 / 400 ms | 400 / 800 ms  |                                     |           |
| 2.33 | /api/v1/gradebook/weight-config/subject-weights/propagate | POST       | 1 000 ms     | 3 000 ms     | 6 000 ms      | 50 classes                          |           |
| 2.34 | /api/v1/gradebook/analytics/distribution/{assessmentId}   | GET        | 80 ms        | 200 ms       | 400 ms        |                                     |           |
| 2.35 | /api/v1/gradebook/analytics/period-distribution           | GET        | 200 ms       | 500 ms       | 1 000 ms      |                                     |           |
| 2.36 | /api/v1/gradebook/analytics/students/{id}/trend           | GET        | 100 ms       | 250 ms       | 500 ms        |                                     |           |
| 2.37 | /api/v1/gradebook/analytics/classes/{id}/trend            | GET        | 150 ms       | 400 ms       | 800 ms        |                                     |           |
| 2.38 | /api/v1/gradebook/analytics/teacher-consistency           | GET        | 300 ms       | 700 ms       | 1 500 ms      |                                     |           |
| 2.39 | /api/v1/gradebook/analytics/benchmark                     | GET        | 300 ms       | 700 ms       | 1 500 ms      |                                     |           |
| 2.40 | /api/v1/gradebook/ai/generate-comment/{reportCardId}      | POST       | 3 000 ms     | 8 000 ms     | 15 000 ms     | Blocked by OpenAI — async preferred |           |
| 2.41 | /api/v1/gradebook/ai/grade-inline                         | POST       | 3 000 ms     | 8 000 ms     | 15 000 ms     | Same                                |           |
| 2.42 | /api/v1/gradebook/ai/query                                | POST       | 2 000 ms     | 6 000 ms     | 12 000 ms     |                                     |           |
| 2.43 | /api/v1/gradebook/publishing/readiness                    | GET        | 300 ms       | 700 ms       | 1 500 ms      |                                     |           |
| 2.44 | /api/v1/gradebook/publishing/publish-period               | POST       | 1 000 ms     | 3 000 ms     | 6 000 ms      | 500 students                        |           |
| 2.45 | /api/v1/gradebook/progress-reports                        | GET / POST | 100 / 200 ms | 250 / 500 ms | 500 / 1000 ms |                                     |           |
| 2.46 | /api/v1/gradebook/progress-reports/entries/{id}           | PATCH      | 80 ms        | 200 ms       | 400 ms        |                                     |           |
| 2.47 | /api/v1/gradebook/progress-reports/send                   | POST       | 500 ms       | 1 500 ms     | 3 000 ms      | Enqueues batch                      |           |
| 2.48 | /api/v1/report-cards                                      | GET        | 150 ms       | 400 ms       | 800 ms        |                                     |           |
| 2.49 | /api/v1/report-cards/generate                             | POST       | 500 ms       | 1 500 ms     | 3 000 ms      |                                     |           |
| 2.50 | /api/v1/report-cards/{id}/pdf                             | GET        | 800 ms       | 2 000 ms     | 4 000 ms      | Streams from S3                     |           |
| 2.51 | /api/v1/transcripts/students/{id}                         | GET        | 300 ms       | 700 ms       | 1 500 ms      |                                     |           |
| 2.52 | /api/v1/transcripts/students/{id}/pdf                     | GET        | 2 000 ms     | 5 000 ms     | 10 000 ms     |                                     |           |
| 2.53 | /api/v1/parent/academic-periods                           | GET        | 80 ms        | 200 ms       | 400 ms        |                                     |           |
| 2.54 | /api/v1/parent/students/{id}/grades                       | GET        | 150 ms       | 400 ms       | 800 ms        |                                     |           |
| 2.55 | /api/v1/parent/students/{id}/report-cards                 | GET        | 100 ms       | 250 ms       | 500 ms        |                                     |           |
| 2.56 | /api/v1/parent/students/{id}/report-cards/{rcid}/pdf      | GET        | 1 000 ms     | 3 000 ms     | 6 000 ms      | S3 fetch + stream                   |           |
| 2.57 | /api/v1/parent/students/{id}/transcript/pdf               | GET        | 2 000 ms     | 5 000 ms     | 10 000 ms     |                                     |           |

---

## 3. List Endpoint Scale Matrix

For list endpoints, measure response time at various row counts.

| #   | Endpoint                                  | 100 rows | 1 000 rows | 10 000 rows | 100 000 rows | Notes                                            | Pass/Fail |
| --- | ----------------------------------------- | -------- | ---------- | ----------- | ------------ | ------------------------------------------------ | --------- |
| 3.1 | /api/v1/gradebook/assessments             | < 150 ms | < 300 ms   | < 600 ms    | < 1.5 s      | Paginated; pageSize=100; stays constant per page |           |
| 3.2 | /api/v1/gradebook/period-grades           | < 150 ms | < 300 ms   | < 600 ms    | < 1.5 s      | Same                                             |           |
| 3.3 | /api/v1/gradebook/teacher-grading-weights | < 150 ms | < 300 ms   | < 600 ms    | < 1.5 s      |                                                  |           |
| 3.4 | /api/v1/gradebook/assessment-categories   | < 150 ms | < 300 ms   | < 600 ms    | < 1.5 s      |                                                  |           |
| 3.5 | /api/v1/gradebook/rubric-templates        | < 150 ms | < 300 ms   | < 600 ms    | < 1.5 s      |                                                  |           |
| 3.6 | /api/v1/gradebook/curriculum-standards    | < 150 ms | < 300 ms   | < 600 ms    | < 1.5 s      |                                                  |           |
| 3.7 | /api/v1/gradebook/unlock-requests         | < 150 ms | < 300 ms   | < 600 ms    | < 1.5 s      |                                                  |           |
| 3.8 | /api/v1/report-cards                      | < 150 ms | < 300 ms   | < 600 ms    | < 1.5 s      |                                                  |           |

Pagination invariants: `meta.total` computed via separate COUNT query. Should use a partial covering index so cost stays logarithmic.

---

## 4. Compute Period Grades — Scale

`POST /api/v1/gradebook/period-grades/compute`.

| #   | Students | Assessments | Categories | Expected p95               | Pass/Fail |
| --- | -------- | ----------- | ---------- | -------------------------- | --------- |
| 4.1 | 10       | 5           | 3          | 500 ms                     |           |
| 4.2 | 30       | 10          | 5          | 1 500 ms                   |           |
| 4.3 | 100      | 20          | 5          | 3 000 ms                   |           |
| 4.4 | 500      | 30          | 6          | 8 000 ms                   |           |
| 4.5 | 1 000    | 30          | 6          | 15 000 ms (consider async) |           |

If compute > 10s, recommend moving to a worker queue.

---

## 5. Bulk Grade Write — Throughput

`PUT /api/v1/gradebook/assessments/{id}/grades`.

| #   | Grades in batch | Target latency p95 | Pass/Fail |
| --- | --------------- | ------------------ | --------- |
| 5.1 | 10              | 300 ms             |           |
| 5.2 | 30              | 500 ms             |           |
| 5.3 | 100             | 1 500 ms           |           |
| 5.4 | 500             | 5 000 ms           |           |
| 5.5 | 1 000           | 10 000 ms          |           |

Transaction size, audit insert overhead.

---

## 6. Bulk Import Job — Throughput

Worker-side throughput.

| #   | Rows in file | Expected job time | Pass/Fail |
| --- | ------------ | ----------------- | --------- |
| 6.1 | 100          | < 30 s            |           |
| 6.2 | 1 000        | < 60 s            |           |
| 6.3 | 10 000       | < 5 min           |           |
| 6.4 | 50 000       | < 20 min          |           |

---

## 7. PDF Render Time (Report Card / Transcript / Results)

| #   | PDF type             | Expected render time p95 | Pass/Fail |
| --- | -------------------- | ------------------------ | --------- |
| 7.1 | Report card (single) | 2 000 ms                 |           |
| 7.2 | Transcript           | 3 000 ms                 |           |
| 7.3 | Results matrix PDF   | 2 000 ms                 |           |
| 7.4 | Class analytics PDF  | 3 000 ms                 |           |

First call after cold-start may double; ensure subsequent renders fast.

---

## 8. Mass Report Card Generation — Throughput

`MASS_REPORT_CARD_PDF_JOB`.

| #   | Count | Expected completion | Throughput | Pass/Fail |
| --- | ----- | ------------------- | ---------- | --------- |
| 8.1 | 100   | < 5 min             | ≥ 20 / min |           |
| 8.2 | 500   | < 15 min            | ≥ 33 / min |           |
| 8.3 | 1 000 | < 30 min            | ≥ 33 / min |           |
| 8.4 | 5 000 | < 2 h               | ≥ 40 / min |           |

Workers ~4 concurrent; horizontally scalable.

---

## 9. Analytics Endpoints — Response Time

| #   | Endpoint                                 | Tenant size             | p95 budget | Pass/Fail |
| --- | ---------------------------------------- | ----------------------- | ---------- | --------- |
| 9.1 | `/analytics/distribution/{assessmentId}` | 30 grades / asmt        | 200 ms     |           |
| 9.2 | `/analytics/period-distribution`         | 100 assmts              | 500 ms     |           |
| 9.3 | `/analytics/students/{id}/trend`         | 100 periods             | 250 ms     |           |
| 9.4 | `/analytics/classes/{id}/trend`          | 30 students × 20 assmts | 400 ms     |           |
| 9.5 | `/analytics/teacher-consistency`         | 20 teachers             | 700 ms     |           |
| 9.6 | `/analytics/benchmark`                   | full tenant             | 700 ms     |           |
| 9.7 | `/period-grades/year-overview`           | 1 000 students          | 2 000 ms   |           |

---

## 10. Parent-Side Reads — Latency

Parent dashboards are high-traffic during report card publication. Budget tightly.

| #    | Endpoint                                      | p50   | p95   | p99    | Pass/Fail |
| ---- | --------------------------------------------- | ----- | ----- | ------ | --------- |
| 10.1 | /parent/students/{id}/grades                  | 100   | 250   | 500    |           |
| 10.2 | /parent/students/{id}/report-cards            | 80    | 200   | 400    |           |
| 10.3 | /parent/students/{id}/report-cards/{rcid}/pdf | 1 000 | 3 000 | 6 000  |           |
| 10.4 | /parent/students/{id}/transcript/pdf          | 2 000 | 5 000 | 10 000 |           |

Under load (100 concurrent parents), p95 should not degrade > 50%.

---

## 11. Frontend Page Budgets (Lighthouse)

Run against `/en/assessments`, `/en/gradebook`, `/en/analytics`, `/en/assessments/approvals`, parent pages.

| #     | Page                                                               | Performance | FCP     | LCP     | TTI     | CLS   | Pass/Fail        |
| ----- | ------------------------------------------------------------------ | ----------- | ------- | ------- | ------- | ----- | ---------------- | --- |
| 11.1  | /en/assessments (admin)                                            | ≥ 85        | < 1.5 s | < 2.5 s | < 3.5 s | < 0.1 |                  |
| 11.2  | /en/assessments (teacher)                                          | ≥ 85        | < 1.5 s | < 2.5 s | < 3.5 s | < 0.1 |                  |
| 11.3  | /en/assessments/approvals                                          | ≥ 85        | < 1.5 s | < 2.5 s | < 3.5 s | < 0.1 |                  |
| 11.4  | /en/gradebook                                                      | ≥ 85        | < 1.5 s | < 2.5 s | < 3.5 s | < 0.1 |                  |
| 11.5  | /en/gradebook/{classId}                                            | ≥ 85        | < 1.5 s | < 2.8 s | < 4.0 s | < 0.1 |                  |
| 11.6  | /en/gradebook/{classId}/assessments/new                            | ≥ 85        | < 1.5 s | < 2.5 s | < 3.5 s | < 0.1 |                  |
| 11.7  | /en/gradebook/{classId}/assessments/{aid}/grades                   | ≥ 85        | < 1.5 s | < 2.8 s | < 4.0 s | < 0.1 |                  |
| 11.8  | /en/analytics                                                      | ≥ 80        | < 1.8 s | < 3.0 s | < 4.0 s | < 0.1 | Charts are heavy |     |
| 11.9  | /en/assessments/categories / grading-weights / rubrics / standards | ≥ 85        | < 1.5 s | < 2.5 s | < 3.5 s | < 0.1 |                  |
| 11.10 | Parent dashboard                                                   | ≥ 85        | < 1.5 s | < 2.5 s | < 3.5 s | < 0.1 |                  |

---

## 12. Bundle Size

| #    | Chunk                              | Size budget (gzipped)                                                | Pass/Fail |
| ---- | ---------------------------------- | -------------------------------------------------------------------- | --------- |
| 12.1 | Assessment route group main bundle | < 200 KB                                                             |           |
| 12.2 | Gradebook route group main bundle  | < 200 KB                                                             |           |
| 12.3 | Analytics route main bundle        | < 250 KB (includes Recharts)                                         |           |
| 12.4 | Shared common chunk                | < 150 KB                                                             |           |
| 12.5 | Recharts                           | Tree-shaken; charts not on assessment pages must not import Recharts |           |
| 12.6 | XLSX lib                           | Lazy-loaded only on /import page                                     |           |

---

## 13. Cold Start Times

| #    | Scenario                                    | Target cold-start latency | Pass/Fail |
| ---- | ------------------------------------------- | ------------------------- | --------- |
| 13.1 | Fresh deploy, first request to /assessments | < 3 s                     |           |
| 13.2 | Worker container start, first job picked    | < 5 s                     |           |
| 13.3 | First PDF render after boot                 | < 5 s                     |           |
| 13.4 | Subsequent warm requests                    | per §2 budgets            |           |

---

## 14. Load Profiles & Soak Tests

| #    | Scenario                             | Pattern                                          | Duration | Expected                   | Pass/Fail |
| ---- | ------------------------------------ | ------------------------------------------------ | -------- | -------------------------- | --------- |
| 14.1 | Admin dashboard steady-state         | 10 VU (virtual users)                            | 10 min   | p95 within §2              |           |
| 14.2 | Teacher morning rush                 | Ramp 0→50 VU over 1 min; sustain 10 min          |          | No 5xx                     |           |
| 14.3 | Parent report card publication burst | 200 VU polling `/parent/...` for 5 min           |          | No 5xx; p95 ≤ +20%         |           |
| 14.4 | Admin publishing period              | 1 admin triggers publish-period for 500 students |          | Job completes < 10 min     |           |
| 14.5 | Sustained load                       | 30 VU for 30 min                                 |          | Memory stable              |           |
| 14.6 | Soak test                            | 10 VU for 8 h                                    |          | No memory leak (heap flat) |           |

---

## 15. Contention Scenarios

| #    | Scenario                                                       | Expected                                                                | Pass/Fail |
| ---- | -------------------------------------------------------------- | ----------------------------------------------------------------------- | --------- |
| 15.1 | 10 teachers PUT grades to different assessments simultaneously | All succeed; no connection starvation; PgBouncer handles.               |           |
| 15.2 | 1 teacher + 1 admin bulk import simultaneously                 | Both succeed if different assessments. If same: last-write-wins or 409. |           |
| 15.3 | Publish period + admin viewing analytics                       | Both succeed. No table locks > 1s.                                      |           |
| 15.4 | 5 parallel analytics queries                                   | All succeed; compute not duplicated if cached.                          |           |

---

## 16. DB Query Cost — N+1 Detection

Turn on query logging; identify `SELECT ... WHERE id = ?` loops that could be batched.

| #    | Endpoint                               | Expected behaviour                                                               | Pass/Fail |
| ---- | -------------------------------------- | -------------------------------------------------------------------------------- | --------- |
| 16.1 | /gradebook/assessments                 | Single SELECT + single JOIN (prisma `include`). No per-row lookup.               |           |
| 16.2 | /gradebook/period-grades               | Same.                                                                            |           |
| 16.3 | /gradebook/classes/{id}/results-matrix | Single query returns all grades joined by assessment+student. NOT N per student. |           |
| 16.4 | /analytics/distribution/{assessmentId} | Aggregate query (histogram-builder). No N per grade.                             |           |
| 16.5 | /analytics/teacher-consistency         | One aggregate query over teacher_user_id + std_dev calc.                         |           |
| 16.6 | /gradebook/teaching-allocations/all    | JOIN on staff_profiles. No loop.                                                 |           |
| 16.7 | Report card library                    | COUNT + LIST in two queries. Not N.                                              |           |

---

## 17. Caching Strategy Verification

| #    | Item                   | Expected caching                                                               | Pass/Fail |
| ---- | ---------------------- | ------------------------------------------------------------------------------ | --------- |
| 17.1 | Grading scale          | Cached in Redis per tenant; TTL 1 h.                                           |           |
| 17.2 | Year-group weight      | Cached per (tenant, year_group); TTL 15 min.                                   |           |
| 17.3 | Approved categories    | Cached per (tenant, subject, year); TTL 15 min.                                |           |
| 17.4 | Analytics distribution | Cached per (tenant, assessment) for 5 min since data rarely changes post-lock. |           |
| 17.5 | Invalidation           | Mutations invalidate cache keys (PATCH assessment invalidates distribution).   |           |

---

## 18. Memory Usage

| #    | Process             | Expected RSS             | Pass/Fail |
| ---- | ------------------- | ------------------------ | --------- |
| 18.1 | API Node process    | ≤ 500 MB steady          |           |
| 18.2 | Worker Node process | ≤ 800 MB (PDF rendering) |           |
| 18.3 | Frontend Next.js    | ≤ 300 MB                 |           |

No leak over 8-hour soak.

---

## 19. Endpoints Without Budgets — Coverage Holes

Endpoints in backend inventory with no budget assigned (flag for Phase 2):

- `/api/v1/gradebook/year-group-weights/copy` — propagate copy
- `/api/v1/gradebook/competency-scales/*` — competency config
- `/api/v1/gradebook/assessments/{id}/default-grade` — default grade application
- `/api/v1/gradebook/ai/grading-references/*` — AI refs
- `/api/v1/gradebook/ai/progress-summary` — AI summary endpoint
- `/api/v1/report-cards/generation-runs/*` — run-tracking endpoints
- `/api/v1/report-cards/library` — bulk library listing
- `/api/v1/report-card-settings/*` — tenant settings
- `/api/v1/report-comment-windows/*` — comment window configs
- `/api/v1/report-card-requests/*` — teacher requests

Each needs a budget before release. Document TODO.

---

## 20. Observations

1. **Heavy analytics endpoints** (`teacher-consistency`, `benchmark`) may benefit from materialised views. Monitor.
2. **PDF render time** dominated by fonts + image embedding. Preload assets.
3. **AI endpoints** synchronous to HTTP — any sustained usage will starve Node event loop. Move to queue.
4. **Compute period grades** > 3s under real scale. Candidate for async with callback.
5. **Bulk import 50k rows** near worker lock expiry; chunk the job.
6. **Results matrix PUT** transaction with 500+ grades — audit inserts can balloon; batch via single INSERT.
7. **Next.js bundle** growing with shadcn + Recharts + TipTap (if used in comments) — tree-shake aggressively.
8. **Cold start** — Next.js serverless-free output should keep cold starts low; Nest API cold-start likely 2s.
9. **Parent PDF downloads** spike at publish time — consider pre-warming CDN cache for common report cards.
10. **No observable budget for Progress Report generation** — verify before release.

---

## 21. Sign-Off

| Reviewer | Date | Pass | Fail | Notes |
| -------- | ---- | ---- | ---- | ----- |
|          |      |      |      |       |

Perf leg passes when §2–10 p95 all within budget under §14 load profiles, §11 Lighthouse budgets met on production-like build, §12 bundle budgets met in build output, §16 no N+1 queries detected.

---
