# Attendance Module — Performance Test Specification

**Module:** Attendance (API latency + worker throughput + frontend render budgets).
**Surface:** Endpoint latency budgets, list-endpoint scaling, worker job throughput, officer dashboard perf, bulk upload throughput, AI scan latency, bundle size, cold-start.
**Execution target:** `k6` / `artillery` scripts hitting staging. Lighthouse for page budgets. BullMQ Board + Datadog for worker throughput.
**Last Updated:** 2026-04-18

---

## Table of Contents

1. [Prerequisites & Harness](#1-prerequisites--harness)
2. [Endpoint Latency Budgets — p50 / p95 / p99](#2-endpoint-latency-budgets--p50--p95--p99)
3. [List-Endpoint Scale Matrix](#3-list-endpoint-scale-matrix)
4. [Officer Dashboard Scale](#4-officer-dashboard-scale)
5. [Mark-Page Scaling (Roster Size)](#5-mark-page-scaling-roster-size)
6. [Daily Summary Recalc Scale](#6-daily-summary-recalc-scale)
7. [Bulk Upload Throughput](#7-bulk-upload-throughput)
8. [Quick-Mark Parse Throughput](#8-quick-mark-parse-throughput)
9. [AI Scan Latency](#9-ai-scan-latency)
10. [Worker — Session Generation Throughput](#10-worker--session-generation-throughput)
11. [Worker — Auto-Lock Throughput](#11-worker--auto-lock-throughput)
12. [Worker — Pattern Detection Throughput](#12-worker--pattern-detection-throughput)
13. [Worker — Pending Detection Throughput](#13-worker--pending-detection-throughput)
14. [Worker — Parent Notification Chain](#14-worker--parent-notification-chain)
15. [Frontend Page Budgets (Lighthouse)](#15-frontend-page-budgets-lighthouse)
16. [Bundle Size](#16-bundle-size)
17. [Cold Start Times](#17-cold-start-times)
18. [Load Profiles & Soak Tests](#18-load-profiles--soak-tests)
19. [Contention Scenarios](#19-contention-scenarios)
20. [DB Query Cost — N+1 Detection](#20-db-query-cost--n1-detection)
21. [Caching Opportunities](#21-caching-opportunities)
22. [Memory Usage](#22-memory-usage)
23. [Endpoints Without Budgets — Coverage Holes](#23-endpoints-without-budgets--coverage-holes)
24. [Observations](#24-observations)
25. [Sign-Off](#25-sign-off)

---

## 1. Prerequisites & Harness

| Item               | Spec                                                                                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staging tenant     | Seeded to realistic scale: **1 200 students, 50 classes across 8 year groups, 15 subjects, 100 schedule rows, 2 000 AttendanceSession rows (60 days), 30 000 AttendanceRecord rows, 5 000 DailyAttendanceSummary rows, 50 AttendancePatternAlert rows**. |
| Second tenant      | 100 students — small-scale control.                                                                                                                                                                                                                      |
| k6 / artillery     | Scripts in `/tools/perf/attendance/*.js`. Run against staging.                                                                                                                                                                                           |
| Observer           | Datadog / Grafana for p50/p95/p99 breakdowns. Node event-loop lag visible.                                                                                                                                                                               |
| Measurement window | 10 min sustained load per scenario unless noted.                                                                                                                                                                                                         |
| Result aggregation | Averaged across 3 runs; reject outliers > 2σ.                                                                                                                                                                                                            |
| BullMQ Board       | For worker-side metrics (job duration, throughput).                                                                                                                                                                                                      |
| Lighthouse         | For page budgets. Use Chrome headless with desktop + mobile throttling presets.                                                                                                                                                                          |

---

## 2. Endpoint Latency Budgets — p50 / p95 / p99

Budgets are targets. Any endpoint exceeding p95 under sustained load is a bug.

| #    | Endpoint                                              | Method | p50 budget | p95 budget | p99 budget | Notes                                                      | Pass/Fail |
| ---- | ----------------------------------------------------- | ------ | ---------- | ---------- | ---------- | ---------------------------------------------------------- | --------- |
| 2.1  | `/api/v1/attendance-sessions`                         | GET    | 80 ms      | 200 ms     | 400 ms     | page=1 pageSize=20, 3 filters                              |           |
| 2.2  | `/api/v1/attendance-sessions`                         | POST   | 150 ms     | 400 ms     | 800 ms     | Single create + default-present bulk insert branch         |           |
| 2.3  | `/api/v1/attendance-sessions/:id`                     | GET    | 60 ms      | 150 ms     | 300 ms     | Session detail + 30-row roster                             |           |
| 2.4  | `/api/v1/attendance-sessions/:id/cancel`              | PATCH  | 50 ms      | 120 ms     | 240 ms     |                                                            |           |
| 2.5  | `/api/v1/attendance-sessions/:id/records`             | PUT    | 250 ms     | 600 ms     | 1 200 ms   | Upsert 30 records + parent-notif enqueue                   |           |
| 2.6  | `/api/v1/attendance-sessions/:id/submit`              | PATCH  | 300 ms     | 800 ms     | 1 500 ms   | + daily-summary recalc per student                         |           |
| 2.7  | `/api/v1/attendance-records/:id/amend`                | PATCH  | 150 ms     | 400 ms     | 800 ms     | + daily-summary recalc                                     |           |
| 2.8  | `/api/v1/attendance/officer-dashboard`                | GET    | 120 ms     | 300 ms     | 600 ms     | pageSize=50 on typical day (~100 sessions)                 |           |
| 2.9  | `/api/v1/attendance/daily-summaries`                  | GET    | 100 ms     | 250 ms     | 500 ms     | pageSize=20                                                |           |
| 2.10 | `/api/v1/attendance/daily-summaries/student/:id`      | GET    | 80 ms      | 200 ms     | 400 ms     | 30-day range                                               |           |
| 2.11 | `/api/v1/attendance/exceptions`                       | GET    | 150 ms     | 400 ms     | 800 ms     | Today's exceptions (~100 rows)                             |           |
| 2.12 | `/api/v1/parent/students/:id/attendance`              | GET    | 120 ms     | 300 ms     | 600 ms     | 30-day range                                               |           |
| 2.13 | `/api/v1/attendance/upload-template`                  | GET    | 300 ms     | 800 ms     | 1 600 ms   | CSV gen for 1 200 students × active sessions               |           |
| 2.14 | `/api/v1/attendance/upload`                           | POST   | 2 000 ms   | 6 000 ms   | 12 000 ms  | 1 000-row CSV upsert                                       |           |
| 2.15 | `/api/v1/attendance/exceptions-upload`                | POST   | 300 ms     | 800 ms     | 1 500 ms   | 50 exceptions                                              |           |
| 2.16 | `/api/v1/attendance/quick-mark`                       | POST   | 200 ms     | 500 ms     | 1 000 ms   | Parse + upsert ~20 entries                                 |           |
| 2.17 | `/api/v1/attendance/upload/undo`                      | POST   | 500 ms     | 1 500 ms   | 3 000 ms   | Batch of 100-500 records                                   |           |
| 2.18 | `/api/v1/attendance/scan`                             | POST   | 3 000 ms   | 8 000 ms   | 15 000 ms  | Blocked by AI vendor latency. Async preferred (see O-PF4). |           |
| 2.19 | `/api/v1/attendance/scan/confirm`                     | POST   | 300 ms     | 800 ms     | 1 500 ms   | ~20 entries                                                |           |
| 2.20 | `/api/v1/attendance/pattern-alerts`                   | GET    | 80 ms      | 200 ms     | 400 ms     | pageSize=20                                                |           |
| 2.21 | `/api/v1/attendance/pattern-alerts/:id/acknowledge`   | PATCH  | 50 ms      | 120 ms     | 240 ms     |                                                            |           |
| 2.22 | `/api/v1/attendance/pattern-alerts/:id/resolve`       | PATCH  | 50 ms      | 120 ms     | 240 ms     |                                                            |           |
| 2.23 | `/api/v1/attendance/pattern-alerts/:id/notify-parent` | POST   | 100 ms     | 250 ms     | 500 ms     | + job enqueue                                              |           |

---

## 3. List-Endpoint Scale Matrix

`GET /api/v1/attendance-sessions` at various tenant sizes.

| #   | Tenant size                                             | Result set                                  | p95 target | Pass/Fail |
| --- | ------------------------------------------------------- | ------------------------------------------- | ---------- | --------- |
| 3.1 | 100 classes, 500 students, 3 months sessions ≈ 12k      | Default query page=1 returns 20 in ≤ 200 ms | 200 ms     |           |
| 3.2 | Same with filter by class_id                            | ≤ 150 ms                                    | 150 ms     |           |
| 3.3 | Same with date range (30 days)                          | ≤ 300 ms                                    | 300 ms     |           |
| 3.4 | 5000 students, 6 months sessions ≈ 200k                 | ≤ 500 ms                                    | 500 ms     |           |
| 3.5 | Teacher-scoped (teacher_staff_id filter via controller) | ≤ 250 ms                                    | 250 ms     |           |
| 3.6 | Officer-dashboard 500 sessions today                    | ≤ 400 ms                                    | 400 ms     |           |
| 3.7 | Pattern alerts list 100 active                          | ≤ 200 ms                                    | 200 ms     |           |

Measurements should use a warm cache (3rd run) and track median across 30 requests.

---

## 4. Officer Dashboard Scale

| #   | Sessions for date                                     | Filters          | p95 target                                                        | Pass/Fail |
| --- | ----------------------------------------------------- | ---------------- | ----------------------------------------------------------------- | --------- |
| 4.1 | 50                                                    | none             | 200 ms                                                            |           |
| 4.2 | 200                                                   | status=open      | 300 ms                                                            |           |
| 4.3 | 500                                                   | year_group_id    | 400 ms                                                            |           |
| 4.4 | 1 000                                                 | class_id         | 500 ms                                                            |           |
| 4.5 | 2 000                                                 | teacher_staff_id | 600 ms                                                            |           |
| 4.6 | 100 + pageSize=100                                    | full page        | 350 ms                                                            |           |
| 4.7 | Subject resolution (cross-ref to scheduling_run) cost |                  | Adds ≤ 50 ms to p95; consider caching subject map per tenant+day. |           |

Enrolment-count subquery via `ClassesReadFacade.findEnrolmentCountsByClasses` must be batched; N+1 is a red flag.

---

## 5. Mark-Page Scaling (Roster Size)

`GET /api/v1/attendance-sessions/:id` returns the roster + records.

| #   | Roster size                            | p95 target                          | Pass/Fail |
| --- | -------------------------------------- | ----------------------------------- | --------- |
| 5.1 | 10 students                            | 80 ms                               |           |
| 5.2 | 30 students                            | 150 ms                              |           |
| 5.3 | 50 students                            | 250 ms                              |           |
| 5.4 | 100 students (large lecture)           | 500 ms                              |           |
| 5.5 | PUT `/records` with 100 records        | p95 1 200 ms                        |           |
| 5.6 | PUT `/records` with 1 record           | p95 400 ms                          |           |
| 5.7 | Frontend roster render at 100 students | TBT < 200 ms; interactive < 500 ms. |           |

---

## 6. Daily Summary Recalc Scale

Submit a session with N students: recalc fires N times.

| #   | Session records (N)                                                    | submit end-to-end p95 | Pass/Fail |
| --- | ---------------------------------------------------------------------- | --------------------- | --------- |
| 6.1 | 10                                                                     | 500 ms                |           |
| 6.2 | 30                                                                     | 1 200 ms              |           |
| 6.3 | 50                                                                     | 2 000 ms              |           |
| 6.4 | 100                                                                    | 4 000 ms              |           |
| 6.5 | 100 + cross-session (student has records in 5 other sessions that day) | 5 000 ms              |           |

If p95 > 3 000 ms at 100 students, consider:

- Batch recalc (single per-date summary computation instead of per-student).
- Move recalc to a BullMQ job (fire-and-forget on submit).

---

## 7. Bulk Upload Throughput

`POST /api/v1/attendance/upload` with a CSV body.

| #   | CSV rows                                | p95 time   | Throughput (rows/s) | Pass/Fail |
| --- | --------------------------------------- | ---------- | ------------------- | --------- |
| 7.1 | 100                                     | 500 ms     | 200 rows/s          |           |
| 7.2 | 500                                     | 2 000 ms   | 250 rows/s          |           |
| 7.3 | 1 000                                   | 4 000 ms   | 250 rows/s          |           |
| 7.4 | 5 000                                   | 20 000 ms  | 250 rows/s          |           |
| 7.5 | 10 000                                  | 45 000 ms  | 222 rows/s          |           |
| 7.6 | File parse-only (no DB) per 10 000 rows | ≤ 3 000 ms |                     |

10 MB cap stays the ceiling (see controller).

---

## 8. Quick-Mark Parse Throughput

| #   | Text lines | p95 time | Pass/Fail |
| --- | ---------- | -------- | --------- |
| 8.1 | 10         | 150 ms   |           |
| 8.2 | 100        | 400 ms   |           |
| 8.3 | 500        | 1 500 ms |           |

---

## 9. AI Scan Latency

Primary bottleneck is the AI vendor. Report the distribution, not a single value.

| #   | Image size                           | Scan p50                    | Scan p95 | Scan p99  | Pass/Fail |
| --- | ------------------------------------ | --------------------------- | -------- | --------- | --------- |
| 9.1 | 500 KB JPEG                          | 2 500 ms                    | 5 000 ms | 10 000 ms |           |
| 9.2 | 2 MB JPEG                            | 3 000 ms                    | 6 000 ms | 12 000 ms |           |
| 9.3 | 9.5 MB JPEG                          | 4 500 ms                    | 9 000 ms | 18 000 ms |           |
| 9.4 | AI vendor throttled                  | —                           | >30s     | timeout   |           |
| 9.5 | Scan + confirm combined (happy path) | p95 ≤ 9 000 ms (scan-bound) |          |

Consider moving scan to a background job with polling UI (see O-PF4).

---

## 10. Worker — Session Generation Throughput

| #    | Scenario                                                          | Expected                                                                               | Pass/Fail |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------- |
| 10.1 | 1 tenant, 100 classes, per-period mode, 8 schedules/day           | ~800 sessions generated; duration ≤ 20 s.                                              |           |
| 10.2 | 1 tenant, 100 classes, daily mode                                 | 100 sessions; duration ≤ 5 s.                                                          |           |
| 10.3 | 1 tenant, per-period + default_present, 100 classes × 30 students | 800 sessions + 24 000 records; ≤ 60 s.                                                 |           |
| 10.4 | 50 tenants, 100 classes each, per-period                          | Cron-dispatch fan-out complete in ≤ 5 s; total generation across all tenants ≤ 20 min. |           |
| 10.5 | Cron-dispatch overhead                                            | Enqueueing 50 per-tenant jobs ≤ 2 s.                                                   |           |

---

## 11. Worker — Auto-Lock Throughput

| #    | Submitted sessions past cutoff | Expected duration |
| ---- | ------------------------------ | ----------------- |
| 11.1 | 100                            | ≤ 2 s             |
| 11.2 | 1 000                          | ≤ 10 s            |
| 11.3 | 10 000                         | ≤ 60 s            |
| 11.4 | 100 000 (stress)               | ≤ 600 s           |

Single `updateMany` query — very fast. Watch for lock contention if other writes are concurrent.

---

## 12. Worker — Pattern Detection Throughput

| #    | Students in tenant                         | Runtime p95                                                   |
| ---- | ------------------------------------------ | ------------------------------------------------------------- |
| 12.1 | 100                                        | ≤ 10 s                                                        |
| 12.2 | 500                                        | ≤ 30 s                                                        |
| 12.3 | 1 000                                      | ≤ 60 s                                                        |
| 12.4 | 5 000                                      | ≤ 5 min (target); if exceeded, consider sharding — see O-PF5. |
| 12.5 | Excessive-absence fan-out with 50 students | Enqueue 50 early-warning jobs ≤ 1 s                           |

---

## 13. Worker — Pending Detection Throughput

Read-only job. Very fast.

| #    | Sessions count | Duration |
| ---- | -------------- | -------- |
| 13.1 | 100            | ≤ 100 ms |
| 13.2 | 10 000         | ≤ 500 ms |

---

## 14. Worker — Parent Notification Chain

| #    | Absent records per save       | Enqueues per save | p95 enqueue latency (before dispatch)                                       | Pass/Fail |
| ---- | ----------------------------- | ----------------- | --------------------------------------------------------------------------- | --------- |
| 14.1 | 1                             | 1                 | ≤ 50 ms                                                                     |           |
| 14.2 | 10                            | 10                | ≤ 200 ms                                                                    |           |
| 14.3 | 30                            | 30                | ≤ 500 ms                                                                    |           |
| 14.4 | Downstream dispatch (per job) | —                 | Email send ≤ 3 s p95; SMS ≤ 5 s p95. (Tracked in Communications perf spec.) |           |

---

## 15. Frontend Page Budgets (Lighthouse)

| #    | Page                            | FCP     | TBT      | LCP     | TTI     | Pass/Fail |
| ---- | ------------------------------- | ------- | -------- | ------- | ------- | --------- |
| 15.1 | `/en/attendance` (hub, desktop) | ≤ 1.2 s | ≤ 200 ms | ≤ 2.0 s | ≤ 2.5 s |           |
| 15.2 | Same on mobile Moto G           | ≤ 2.0 s | ≤ 600 ms | ≤ 3.5 s | ≤ 4.5 s |           |
| 15.3 | `/en/attendance/officer`        | ≤ 1.4 s | ≤ 300 ms | ≤ 2.2 s | ≤ 2.8 s |           |
| 15.4 | `/en/attendance/mark/{id}`      | ≤ 1.2 s | ≤ 300 ms | ≤ 2.2 s | ≤ 3.0 s |           |
| 15.5 | `/en/attendance/exceptions`     | ≤ 1.3 s | ≤ 200 ms | ≤ 2.1 s | ≤ 2.6 s |           |
| 15.6 | `/en/attendance/upload`         | ≤ 1.0 s | ≤ 150 ms | ≤ 1.8 s | ≤ 2.2 s |           |
| 15.7 | `/en/attendance/scan`           | ≤ 1.2 s | ≤ 200 ms | ≤ 2.0 s | ≤ 2.5 s |           |

Arabic locale should not regress more than 200 ms on any metric vs English.

---

## 16. Bundle Size

| #    | Measurement                                    | Target                   | Pass/Fail |
| ---- | ---------------------------------------------- | ------------------------ | --------- |
| 16.1 | `/en/attendance` route bundle (gzip)           | ≤ 80 KB                  |           |
| 16.2 | `/en/attendance/mark/{id}` (gzip)              | ≤ 100 KB                 |           |
| 16.3 | `/en/attendance/officer` (gzip)                | ≤ 90 KB                  |           |
| 16.4 | Total attendance surface delta on app shell    | ≤ 150 KB                 |           |
| 16.5 | Duplicate dependencies in the attendance chunk | Zero — Turborepo dedupe. |           |

---

## 17. Cold Start Times

| #    | Measurement                                               | Target           | Pass/Fail |
| ---- | --------------------------------------------------------- | ---------------- | --------- |
| 17.1 | Fresh api server boot → first request served              | ≤ 15 s           |           |
| 17.2 | Fresh worker boot → first job consumed                    | ≤ 20 s           |           |
| 17.3 | First attendance list request on a cold Prisma connection | + 200 ms vs warm |           |
| 17.4 | First scan request cold (vendor client lazy-init)         | + 500 ms vs warm |           |

---

## 18. Load Profiles & Soak Tests

| #    | Scenario                                                                                 | Duration | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------- | -------- | --------- |
| 18.1 | 50 concurrent teachers saving marks on their own sessions (different sessions)           | 10 min   |           |
| 18.2 | 1 officer + 50 teachers simultaneously (officer on dashboard polling + teachers marking) | 10 min   |           |
| 18.3 | Bulk upload of 5k rows while 10 teachers save on open sessions                           | 5 min    |           |
| 18.4 | Nightly worker run: cron-generate × 50 tenants simultaneously                            | 1 hour   |           |
| 18.5 | Worker soak: 24h of cron fires, no memory leak                                           | 24 h     |           |
| 18.6 | API soak: 1 req/s to each GET endpoint for 24h                                           | 24 h     |           |

---

## 19. Contention Scenarios

| #    | Scenario                                                  | Expected                                                                                  | Pass/Fail |
| ---- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| 19.1 | 20 concurrent PUT `/records` on the same session          | Last-write-wins per student; no deadlock.                                                 |           |
| 19.2 | Concurrent submit + auto-lock cron on same session        | No deadlock; cron's updateMany acquires lock after submit commits.                        |           |
| 19.3 | 100 teachers marking at 08:00 UTC start of day            | API stays within budget (p95 < 600 ms for PUT).                                           |           |
| 19.4 | Parent-notification fan-out surge (500 absences in 1 min) | `notifications` queue absorbs; no API backpressure.                                       |           |
| 19.5 | Pattern-detection mid-run + new absences arriving         | Pattern job sees data at the transaction-start snapshot; new absences appear in next run. |           |

---

## 20. DB Query Cost — N+1 Detection

| #    | Endpoint                                                      | Likely N+1 risk                                                                                          | Mitigation                                                                                                                 | Pass/Fail |
| ---- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.1 | `GET /attendance-sessions` with per-period subject resolution | Iterating rows and resolving subject per session by reading `scheduling_run.config_snapshot` per session | Batch: single resolveSubjectsForSchedules call with all schedule_ids in the page. Verified by query-count ≤ page_size + 2. |           |
| 20.2 | `GET /officer-dashboard`                                      | Enrolment count subquery                                                                                 | `ClassesReadFacade.findEnrolmentCountsByClasses` must use a single GROUP BY query.                                         |           |
| 20.3 | `PUT /records` upsert loop                                    | Per-record findFirst + upsert = 2N queries                                                               | Acceptable at 30-40 records. At 100+, consider `createMany + skipDuplicates` + `updateMany` batch approach. See O-PF6.     |           |
| 20.4 | Pattern detection per student × 3 pattern types               | 3N queries                                                                                               | Consider a single query returning absence counts by (student_id, status, day_of_week). See O-PF5.                          |           |
| 20.5 | Daily summary recalc per student                              | 1 query per student                                                                                      | Batch by session is alternative; trade off code complexity.                                                                |           |
| 20.6 | Session list meta.total                                       | Separate COUNT query                                                                                     | Standard Prisma pattern. No change.                                                                                        |           |

Verify via `EXPLAIN ANALYZE` on a representative query; target: ≤ 3 queries for list endpoints (rows + meta count + subject batch).

---

## 21. Caching Opportunities

| #    | Candidate                                                          | TTL      | Benefit                                                                              |
| ---- | ------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------ |
| 21.1 | Tenant setting `attendance` block (read on every save + every job) | 5 min    | Save 1 read per save — significant for high-write tenants.                           |
| 21.2 | Subject-by-schedule map per tenant per day                         | 24 h     | Officer dashboard + hub list subject resolution from O(1).                           |
| 21.3 | Enrolment ids per class                                            | 1 h      | Used in `saveRecords` to validate. Cached value must invalidate on enrolment change. |
| 21.4 | Pending-count per tenant per date                                  | 5 min    | For the pending-detection dashboard badge.                                           |
| 21.5 | Permission cache (already via `PermissionCacheService`)            | Existing | No change. Ensure TTL matches the rest.                                              |

---

## 22. Memory Usage

| #    | Scenario                                            | Target                                       | Pass/Fail |
| ---- | --------------------------------------------------- | -------------------------------------------- | --------- |
| 22.1 | API node RSS at idle                                | ≤ 400 MB                                     |           |
| 22.2 | API node RSS under sustained load (§18.1)           | ≤ 600 MB                                     |           |
| 22.3 | Worker RSS at idle                                  | ≤ 300 MB                                     |           |
| 22.4 | Worker RSS during pattern-detection for 5k students | ≤ 500 MB (peaks during in-memory grouping)   |           |
| 22.5 | Scan session buffer size                            | ≤ 10 MB per request (enforced by controller) |           |
| 22.6 | Bulk upload parse buffer                            | ≤ 10 MB per request (enforced)               |           |

---

## 23. Endpoints Without Budgets — Coverage Holes

Initial budget set above covers all 23 endpoints. Coverage: 23/23. No holes.

Future additions (if endpoints expand) must be added to §2 with measured baselines.

---

## 24. Observations

Seed watchpoints:

- **O-PF1 (P2)**: `GET /attendance-sessions` subject resolution may N+1 at 100+ rows. Verify the batch path; if not implemented, add.
- **O-PF2 (P2)**: `PUT /records` upsert loop is O(N) round-trips. At 100+ students on a single session, latency grows linearly. Consider `createMany` + `updateMany` split.
- **O-PF3 (P1)**: Submit's per-student daily-summary recalc can exceed 2s at 100 students. Move to async (queue) for fire-and-forget.
- **O-PF4 (P1)**: AI scan is a 5-15s blocking API call. Move to background job + polling UI. Current synchronous flow risks API timeouts under vendor latency spikes.
- **O-PF5 (P2)**: Pattern detection for 5k+ students may exceed 5min; worth sharding OR running incrementally (only students with new records).
- **O-PF6 (P2)**: Auto-lock runs on a big `updateMany`; if submitted sessions number 100k+, the query could acquire a wide lock. Consider chunking by tenant or date-range.
- **O-PF7 (P3)**: No Lighthouse run on the attendance hub currently — add to CI.

---

## 25. Sign-Off

| Field         | Value |
| ------------- | ----- |
| Reviewer      |       |
| Date          |       |
| Total Pass    |       |
| Total Fail    |       |
| Blocker count |       |
| Notes         |       |

Perf spec is signed off when every row above is Pass against the documented budget. Any endpoint exceeding its p95 under sustained load is a P1.
