# Wellbeing — Performance Test Specification

> **Generated:** 2026-04-21
> **Module slug:** `wellbeing`
> **Scope:** Latency budgets per endpoint, list-endpoint scale matrix, N+1 detection, load/contention, page bundle budgets, worker-job throughput, DB query health, memory/event-loop, cold-vs-warm start.
> **Companion specs:** `../admin_view/` (UI), `../integration/` (contracts), `../worker/` (queues), `../security/` (OWASP).

Every row is a **measurement with a numeric threshold**. Do NOT mark Pass based on "feels fast" — numbers only.

The wellbeing umbrella is the largest surface in the platform: ~250 endpoints, 54 tenant-scoped tables, 18 processors, 10 crons, and the `GET /v1/wellbeing/dashboard-summary` aggregate which cross-queries 5 domain services in parallel. Budgets below reflect NHQS baseline (50 concurrent users per tenant, 200 students, 100 staff). Budgets tighten 20% under `/e2e-perf` run at "peak" (100 concurrent).

---

## Summary table — measured vs. budget

Populate this table at the end of a run. Leave `—` in a fresh checkout.

| Metric                                                                  | Budget    | Measured | Pass |
| ----------------------------------------------------------------------- | --------- | -------- | ---- |
| **Aggregate & dashboard**                                               |           |          |      |
| `GET /v1/wellbeing/dashboard-summary` p95                               | < 400 ms  | —        |      |
| `GET /v1/behaviour/incidents/stats` p95                                 | < 250 ms  | —        |      |
| `GET /v1/safeguarding/dashboard` p95                                    | < 400 ms  | —        |      |
| **Behaviour reads**                                                     |           |          |      |
| `GET /v1/behaviour/incidents` (20 rows) p95                             | < 200 ms  | —        |      |
| `GET /v1/behaviour/incidents` (10k seeded) p95                          | < 300 ms  | —        |      |
| `GET /v1/behaviour/incidents/:id` p95                                   | < 150 ms  | —        |      |
| `GET /v1/behaviour/incidents/:id/history` p95                           | < 250 ms  | —        |      |
| `GET /v1/behaviour/students/:id` (profile with tabs) p95                | < 350 ms  | —        |      |
| `GET /v1/behaviour/recognition/wall` p95                                | < 250 ms  | —        |      |
| `GET /v1/behaviour/recognition/leaderboard` p95                         | < 200 ms  | —        |      |
| `GET /v1/behaviour/sanctions` p95                                       | < 200 ms  | —        |      |
| `GET /v1/behaviour/sanctions/today` p95                                 | < 200 ms  | —        |      |
| `GET /v1/behaviour/sanctions/calendar` (month) p95                      | < 400 ms  | —        |      |
| `GET /v1/behaviour/exclusion-cases` p95                                 | < 200 ms  | —        |      |
| `GET /v1/behaviour/appeals` p95                                         | < 200 ms  | —        |      |
| `GET /v1/behaviour/documents` p95                                       | < 200 ms  | —        |      |
| `GET /v1/behaviour/analytics` (charts payload) p95                      | < 500 ms  | —        |      |
| **Behaviour mutations**                                                 |           |          |      |
| `POST /v1/behaviour/incidents` p95                                      | < 400 ms  | —        |      |
| `POST /v1/behaviour/incidents/ai-parse` (AI stub) p95                   | < 800 ms  | —        |      |
| `PATCH /v1/behaviour/incidents/:id/status` p95                          | < 300 ms  | —        |      |
| `POST /v1/behaviour/sanctions/bulk-mark-served` (50 ids) p95            | < 1200 ms | —        |      |
| `POST /v1/behaviour/documents/generate` p95 (enqueue only)              | < 300 ms  | —        |      |
| **Pastoral reads**                                                      |           |          |      |
| `GET /v1/pastoral/concerns` p95                                         | < 250 ms  | —        |      |
| `GET /v1/pastoral/concerns/:id` (with versions + events) p95            | < 300 ms  | —        |      |
| `GET /v1/pastoral/cases` p95                                            | < 200 ms  | —        |      |
| `GET /v1/pastoral/cases/:id` (with linked concerns + interventions) p95 | < 400 ms  | —        |      |
| `GET /v1/pastoral/interventions` p95                                    | < 200 ms  | —        |      |
| `GET /v1/pastoral/referrals` p95                                        | < 200 ms  | —        |      |
| `GET /v1/pastoral/critical-incidents` p95                               | < 200 ms  | —        |      |
| `GET /v1/pastoral/sst/meetings/:id` (agenda + actions) p95              | < 400 ms  | —        |      |
| `GET /v1/pastoral/checkins/my` p95                                      | < 200 ms  | —        |      |
| `GET /v1/pastoral/dsar-reviews` p95                                     | < 300 ms  | —        |      |
| **Pastoral mutations**                                                  |           |          |      |
| `POST /v1/pastoral/concerns` p95                                        | < 400 ms  | —        |      |
| `POST /v1/pastoral/concerns/:id/escalate` p95                           | < 500 ms  | —        |      |
| `POST /v1/pastoral/cases/:id/transfer` p95                              | < 500 ms  | —        |      |
| `POST /v1/pastoral/critical-incidents` p95                              | < 500 ms  | —        |      |
| `POST /v1/pastoral/import/commit` (100 rows, sync) p95                  | < 3000 ms | —        |      |
| **Safeguarding**                                                        |           |          |      |
| `GET /v1/safeguarding/concerns` p95                                     | < 250 ms  | —        |      |
| `GET /v1/safeguarding/concerns/:id` p95                                 | < 250 ms  | —        |      |
| `POST /v1/safeguarding/concerns` p95                                    | < 400 ms  | —        |      |
| `POST /v1/safeguarding/concerns/:id/seal/initiate` p95                  | < 300 ms  | —        |      |
| `POST /v1/safeguarding/concerns/:id/seal/approve` p95                   | < 300 ms  | —        |      |
| `POST /v1/safeguarding/break-glass` p95                                 | < 300 ms  | —        |      |
| `POST /v1/safeguarding/concerns/:id/case-file` (sync render) p95        | < 3000 ms | —        |      |
| **Early warning**                                                       |           |          |      |
| `GET /v1/early-warnings` (500 students) p95                             | < 400 ms  | —        |      |
| `GET /v1/early-warnings/summary` p95                                    | < 300 ms  | —        |      |
| `GET /v1/early-warnings/cohort` p95                                     | < 400 ms  | —        |      |
| `GET /v1/early-warnings/:studentId` p95                                 | < 300 ms  | —        |      |
| **Staff wellbeing**                                                     |           |          |      |
| `GET /v1/staff-wellbeing/surveys` p95                                   | < 200 ms  | —        |      |
| `GET /v1/staff-wellbeing/aggregate-workload` (cached) p95               | < 100 ms  | —        |      |
| `GET /v1/staff-wellbeing/aggregate-workload` (cold) p95                 | < 1500 ms | —        |      |
| `POST /v1/staff-wellbeing/surveys` p95                                  | < 400 ms  | —        |      |
| `POST /v1/staff-wellbeing/respond/:id` p95                              | < 250 ms  | —        |      |
| **AI flags & config**                                                   |           |          |      |
| `GET /v1/ai-flags` p95                                                  | < 100 ms  | —        |      |
| `PATCH /v1/ai-flags/:moduleKey` p95                                     | < 150 ms  | —        |      |
| **Frontend pages (FCP @ 3G throttled)**                                 |           |          |      |
| `/wellbeing` FCP                                                        | < 2000 ms | —        |      |
| `/wellbeing` LCP                                                        | < 3000 ms | —        |      |
| `/wellbeing` CLS                                                        | < 0.1     | —        |      |
| `/behaviour` FCP                                                        | < 2000 ms | —        |      |
| `/behaviour/incidents` FCP                                              | < 2500 ms | —        |      |
| `/behaviour/incidents/:id` FCP                                          | < 2500 ms | —        |      |
| `/behaviour/analytics` FCP                                              | < 2500 ms | —        |      |
| `/pastoral` FCP                                                         | < 2000 ms | —        |      |
| `/safeguarding` FCP                                                     | < 2000 ms | —        |      |
| `/early-warnings` FCP                                                   | < 2500 ms | —        |      |
| `/wellbeing/staff` FCP                                                  | < 2500 ms | —        |      |
| **Worker jobs**                                                         |           |          |      |
| `pastoral:notify-concern` p95                                           | < 500 ms  | —        |      |
| `pastoral:precompute-agenda` p95                                        | < 1500 ms | —        |      |
| `pastoral:sync-behaviour-safeguarding` p95                              | < 800 ms  | —        |      |
| `safeguarding:attachment-scan` p95 (5MB)                                | < 3000 ms | —        |      |
| `safeguarding:sla-check` p95 per tenant                                 | < 500 ms  | —        |      |
| `behaviour:parent-notification` p95                                     | < 400 ms  | —        |      |
| `early-warning:compute-daily` wall-time (1000 students)                 | < 60 s    | —        |      |
| `early-warning:compute-student` p95                                     | < 600 ms  | —        |      |
| `wellbeing:moderation-scan` p95                                         | < 200 ms  | —        |      |
| `wellbeing:workload-metrics` wall-time (1000 staff)                     | < 30 s    | —        |      |
| **Document generation**                                                 |           |          |      |
| Exclusion notice PDF render p95                                         | < 5000 ms | —        |      |
| Board pack PDF render p95 (10 pages)                                    | < 12 s    | —        |      |
| Safeguarding case file PDF render p95                                   | < 8 s     | —        |      |
| Appeal evidence bundle PDF render p95 (5 attachments)                   | < 10 s    | —        |      |

---

## Table of contents

1. [Baseline environment specification](#1-baseline-environment-specification)
2. [Fixture seeder for scale](#2-fixture-seeder-for-scale)
3. [Endpoint perf matrix — wellbeing aggregate](#3-endpoint-perf-matrix--wellbeing-aggregate)
4. [Endpoint perf matrix — behaviour incidents](#4-endpoint-perf-matrix--behaviour-incidents)
5. [Endpoint perf matrix — behaviour sanctions / exclusions / appeals](#5-endpoint-perf-matrix--behaviour-sanctions-exclusions-appeals)
6. [Endpoint perf matrix — behaviour recognition / documents / analytics](#6-endpoint-perf-matrix--behaviour-recognition-documents-analytics)
7. [Endpoint perf matrix — pastoral reads](#7-endpoint-perf-matrix--pastoral-reads)
8. [Endpoint perf matrix — pastoral mutations + workflows](#8-endpoint-perf-matrix--pastoral-mutations)
9. [Endpoint perf matrix — safeguarding](#9-endpoint-perf-matrix--safeguarding)
10. [Endpoint perf matrix — early warning](#10-endpoint-perf-matrix--early-warning)
11. [Endpoint perf matrix — staff wellbeing + ai flags](#11-endpoint-perf-matrix--staff-wellbeing--ai-flags)
12. [List-endpoint scale matrix](#12-list-endpoint-scale-matrix)
13. [N+1 detection (relation-heavy endpoints)](#13-n1-detection-relation-heavy-endpoints)
14. [Load / concurrency tests](#14-load--concurrency-tests)
15. [Frontend page bundle + FCP/LCP/CLS budgets](#15-frontend-page-bundle--fcplcpcls-budgets)
16. [Database query health (EXPLAIN ANALYZE)](#16-database-query-health-explain-analyze)
17. [Worker job perf](#17-worker-job-perf)
18. [Document generation (PDF) perf](#18-document-generation-pdf-perf)
19. [Memory / event-loop health](#19-memory--event-loop-health)
20. [Cold vs warm start + cache behaviour](#20-cold-vs-warm-start--cache-behaviour)
21. [Sign-off](#21-sign-off)

---

## 1. Baseline environment specification

| Setting             | Value                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Hardware            | Local Mac M3 Max (16 GB) with 0 other load OR AWS `c5.xlarge` (4 vCPU, 8 GB RAM) single instance |
| OS                  | Ubuntu 22.04 / macOS 14.x                                                                        |
| Node                | 20.x (match `apps/api/package.json` engines)                                                     |
| Postgres            | 15.x, `shared_buffers ≥ 512MB`, `work_mem ≥ 4MB`                                                 |
| Redis               | 7.x                                                                                              |
| Network             | API + DB + Redis co-located (same host)                                                          |
| API process         | Single instance, no PM2 cluster; warm (1000+ requests served before measurement)                 |
| Concurrency ceiling | 50 concurrent users per tenant (NHQS baseline); load tests use 100 concurrent for headroom       |

| #   | What to Check                                                                                                                                                | Expected    | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | --------- |
| 1.1 | Env recorded in `bench/env-<date>.json` at start of run (CPU model, OS, Node, PG, Redis, tenant seed counts).                                                | Recorded.   |           |
| 1.2 | All other workloads stopped on the machine (no dev server, no Chrome, no background indexer).                                                                | Clean.      |           |
| 1.3 | Postgres has indexes matching `packages/prisma/migrations/*` — `SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'idx_%'` > 200. | Indexed.    |           |
| 1.4 | Redis memory-policy `allkeys-lru` or `volatile-lru`; `maxmemory` set.                                                                                        | Configured. |           |
| 1.5 | HTTP keep-alive on all curl/autocannon runs.                                                                                                                 | Enabled.    |           |
| 1.6 | Metric harness: `k6` OR `autocannon` OR `artillery` — one chosen tool for consistency.                                                                       | Chosen.     |           |

---

## 2. Fixture seeder for scale

The seed stages used by this spec:

| Stage     | Students | Behaviour incidents | Sanctions | Exclusions | Concerns (pastoral) | Safeguarding | Surveys | EW profiles |
| --------- | -------: | ------------------: | --------: | ---------: | ------------------: | -----------: | ------: | ----------: |
| small     |       50 |                 200 |        50 |          3 |                  40 |           10 |       1 |          50 |
| realistic |      500 |               3 000 |       500 |         10 |                 400 |           50 |       3 |         500 |
| 10k       |    2 000 |              30 000 |     4 000 |         40 |               3 000 |          300 |       5 |       2 000 |

| #   | What to Check                                                                                                     | Expected    | Pass/Fail |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------- | --------- |
| 2.1 | `packages/prisma/seed/perf/*.ts` (or equivalent) reproduces the small / realistic / 10k stages deterministically. | Works.      |           |
| 2.2 | Seed includes ≥ 20 categories active, ≥ 5 award types tiered, ≥ 10 staff users, ≥ 2 tenants.                      | Present.    |           |
| 2.3 | Seed enables all module flags. `ANTHROPIC_API_KEY` set to a stub that returns instant deterministic responses.    | Configured. |           |
| 2.4 | `VACUUM ANALYZE` on all wellbeing tables post-seed before measuring.                                              | Run.        |           |

---

## 3. Endpoint perf matrix — wellbeing aggregate

### 3.1 `GET /v1/wellbeing/dashboard-summary`

| #     | What to run                                                                                                                                       | Expected                               | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------- |
| 3.1.1 | 100 warm requests, single client, realistic seed.                                                                                                 | p50 < 150ms, p95 < 400ms, p99 < 800ms. |           |
| 3.1.2 | 10k seed.                                                                                                                                         | p95 < 600ms.                           |           |
| 3.1.3 | Query count via `$on('query')` instrumentation — ≤ 10 queries per call (5 sub-modules × 1-2 queries each via Promise.allSettled).                 | Bounded.                               |           |
| 3.1.4 | Simulated single sub-module failure (e.g. block `safeguarding` table reads) — total response still completes < 500ms with zeros for that section. | Resilient and fast on partial failure. |           |
| 3.1.5 | Payload size — JSON response < 20 KB.                                                                                                             | Bounded.                               |           |

### 3.2 `GET /v1/behaviour/incidents/stats` + `/safeguarding/dashboard`

| #     | What to run                                                              | Expected        | Pass/Fail |
| ----- | ------------------------------------------------------------------------ | --------------- | --------- |
| 3.2.1 | Stats endpoint 100 warm — p95 < 250ms.                                   | Under budget.   |           |
| 3.2.2 | Stats cached 60s (if cache wired) — second call p95 < 50ms.              | Cache hit fast. |           |
| 3.2.3 | `/safeguarding/dashboard` — p95 < 400ms under realistic; < 600ms at 10k. | Under budget.   |           |

---

## 4. Endpoint perf matrix — behaviour incidents

### 4.1 `GET /v1/behaviour/incidents` list

| #     | What to run                                                  | Expected      | Pass/Fail |
| ----- | ------------------------------------------------------------ | ------------- | --------- |
| 4.1.1 | pageSize=20 realistic p50 < 80ms, p95 < 200ms.               | Under budget. |           |
| 4.1.2 | pageSize=20, 10k seed, search by student name — p95 < 300ms. | Under budget. |           |
| 4.1.3 | With filters (category + date range) — p95 < 250ms.          | Under budget. |           |
| 4.1.4 | pageSize=100 (max) — p95 < 500ms.                            | Under budget. |           |
| 4.1.5 | Offset-paginated page=100 — p95 < 400ms (no degradation).    | Consistent.   |           |
| 4.1.6 | Payload < 80 KB for 20 rows; < 400 KB for 100 rows.          | Bounded.      |           |

### 4.2 `GET /v1/behaviour/incidents/:id`

| #     | What to run                                                                   | Expected      | Pass/Fail |
| ----- | ----------------------------------------------------------------------------- | ------------- | --------- |
| 4.2.1 | Incident with 5 participants + 3 attachments + 20 history rows — p95 < 150ms. | Under budget. |           |
| 4.2.2 | Query count ≤ 5.                                                              | Bounded.      |           |
| 4.2.3 | Payload < 20 KB.                                                              | Bounded.      |           |

### 4.3 `POST /v1/behaviour/incidents`

| #     | What to run                                                                         | Expected      | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------- | ------------- | --------- |
| 4.3.1 | Happy payload — p95 < 400ms (includes tx + sequence lookup + participants inserts). | Under budget. |           |
| 4.3.2 | With 5 participants — p95 < 500ms.                                                  | Under budget. |           |
| 4.3.3 | Sequence contention (20 concurrent) — no gaps; p95 < 800ms.                         | Under budget. |           |

### 4.4 AI parse endpoint

| #     | What to run                                                              | Expected           | Pass/Fail |
| ----- | ------------------------------------------------------------------------ | ------------------ | --------- |
| 4.4.1 | With AI stub responding in 500ms — p95 < 800ms.                          | Under budget.      |           |
| 4.4.2 | With AI stub 2s slow — endpoint times out cleanly at < 10s; returns 504. | Timeout respected. |           |

### 4.5 Attachment upload

| #     | What to run                                                     | Expected        | Pass/Fail |
| ----- | --------------------------------------------------------------- | --------------- | --------- |
| 4.5.1 | 5MB JPG upload — p95 < 2000ms (network + S3 upload + DB write). | Under budget.   |           |
| 4.5.2 | 20MB PDF — p95 < 6000ms.                                        | Under budget.   |           |
| 4.5.3 | Concurrent 10 uploads — no worker lock-up.                      | No degradation. |           |

---

## 5. Endpoint perf matrix — behaviour sanctions / exclusions / appeals

| #    | Endpoint                                                               | Realistic p95 | 10k p95 | Pass/Fail |
| ---- | ---------------------------------------------------------------------- | ------------: | ------: | --------- |
| 5.1  | `GET /v1/behaviour/sanctions` (pageSize=20)                            |         200ms |   300ms |           |
| 5.2  | `GET /v1/behaviour/sanctions/today`                                    |         200ms |   250ms |           |
| 5.3  | `GET /v1/behaviour/sanctions/calendar?from&to` (month)                 |         400ms |   500ms |           |
| 5.4  | `GET /v1/behaviour/sanctions/my-supervision`                           |         200ms |   250ms |           |
| 5.5  | `POST /v1/behaviour/sanctions/bulk-mark-served` (50 ids)               |        1200ms |  1500ms |           |
| 5.6  | `GET /v1/behaviour/exclusion-cases` (pageSize=20)                      |         200ms |   250ms |           |
| 5.7  | `GET /v1/behaviour/exclusion-cases/:id/timeline` (20 events)           |         250ms |   350ms |           |
| 5.8  | `POST /v1/behaviour/exclusion-cases/:id/generate-board-pack` (enqueue) |         300ms |   300ms |           |
| 5.9  | `GET /v1/behaviour/appeals` (pageSize=20)                              |         200ms |   250ms |           |
| 5.10 | `POST /v1/behaviour/appeals/:id/decide`                                |         400ms |   500ms |           |
| 5.11 | `GET /v1/behaviour/appeals/:id/evidence-bundle` (5 attachments, sync)  |           10s |     12s |           |

---

## 6. Endpoint perf matrix — behaviour recognition / documents / analytics

| #    | Endpoint                                                       | Realistic p95 | 10k p95 | Pass/Fail |
| ---- | -------------------------------------------------------------- | ------------: | ------: | --------- |
| 6.1  | `GET /v1/behaviour/recognition/wall` (pageSize=20)             |         250ms |   350ms |           |
| 6.2  | `GET /v1/behaviour/recognition/leaderboard?limit=10`           |         200ms |   300ms |           |
| 6.3  | `GET /v1/behaviour/recognition/houses` + members               |         200ms |   300ms |           |
| 6.4  | `POST /v1/behaviour/recognition/awards`                        |         400ms |   500ms |           |
| 6.5  | `POST /v1/behaviour/recognition/houses/bulk-assign` (100 ids)  |        1500ms |  2000ms |           |
| 6.6  | `GET /v1/behaviour/documents` (pageSize=20)                    |         200ms |   250ms |           |
| 6.7  | `GET /v1/behaviour/documents/:id/download` (signed URL)        |         100ms |   100ms |           |
| 6.8  | `POST /v1/behaviour/documents/generate` (enqueue)              |         300ms |   300ms |           |
| 6.9  | `GET /v1/behaviour/analytics` (charts payload)                 |         500ms |   800ms |           |
| 6.10 | `POST /v1/behaviour/analytics/ai-query` (AI stub)              |        1500ms |  1500ms |           |
| 6.11 | `POST /v1/behaviour/policy-dry-run`                            |         300ms |   400ms |           |
| 6.12 | `POST /v1/behaviour/policies/replay/preview` (single incident) |         500ms |   600ms |           |

---

## 7. Endpoint perf matrix — pastoral reads

| #    | Endpoint                                                                       | Realistic p95 | 10k p95 | Pass/Fail |
| ---- | ------------------------------------------------------------------------------ | ------------: | ------: | --------- |
| 7.1  | `GET /v1/pastoral/concerns` (pageSize=20)                                      |         250ms |   350ms |           |
| 7.2  | `GET /v1/pastoral/concerns/:id` (with versions + events join)                  |         300ms |   400ms |           |
| 7.3  | `GET /v1/pastoral/cases` (pageSize=20)                                         |         200ms |   300ms |           |
| 7.4  | `GET /v1/pastoral/cases/:id` (with linked concerns + interventions + students) |         400ms |   500ms |           |
| 7.5  | `GET /v1/pastoral/cases/my`                                                    |         200ms |   250ms |           |
| 7.6  | `GET /v1/pastoral/cases/orphans`                                               |         200ms |   250ms |           |
| 7.7  | `GET /v1/pastoral/interventions` (pageSize=20)                                 |         200ms |   300ms |           |
| 7.8  | `GET /v1/pastoral/interventions/:id`                                           |         200ms |   250ms |           |
| 7.9  | `GET /v1/pastoral/referrals` (pageSize=20)                                     |         200ms |   300ms |           |
| 7.10 | `GET /v1/pastoral/referrals/waitlist`                                          |         200ms |   300ms |           |
| 7.11 | `GET /v1/pastoral/critical-incidents` (pageSize=20)                            |         200ms |   300ms |           |
| 7.12 | `GET /v1/pastoral/critical-incidents/:id`                                      |         250ms |   350ms |           |
| 7.13 | `GET /v1/pastoral/sst/meetings/:id` (agenda + actions join)                    |         400ms |   500ms |           |
| 7.14 | `GET /v1/pastoral/checkins/my` (pageSize=10)                                   |         200ms |   250ms |           |
| 7.15 | `GET /v1/pastoral/checkins/flagged`                                            |         200ms |   300ms |           |
| 7.16 | `GET /v1/pastoral/dsar-reviews?pageSize=50`                                    |         300ms |   400ms |           |
| 7.17 | `GET /v1/pastoral/dsar-reviews/stats`                                          |         300ms |   400ms |           |

---

## 8. Endpoint perf matrix — pastoral mutations

| #    | Endpoint                                                                             |        p95 | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------ | ---------: | --------- |
| 8.1  | `POST /v1/pastoral/concerns`                                                         |      400ms |           |
| 8.2  | `POST /v1/pastoral/concerns/:id/escalate` (with chain notify enqueue)                |      500ms |           |
| 8.3  | `PATCH /v1/pastoral/concerns/:id/narrative` (creates version row)                    |      400ms |           |
| 8.4  | `POST /v1/pastoral/cases`                                                            |      400ms |           |
| 8.5  | `POST /v1/pastoral/cases/:id/transfer` (with notifications)                          |      500ms |           |
| 8.6  | `POST /v1/pastoral/interventions` + `POST /:id/progress` + `POST /:id/review`        | 400ms each |           |
| 8.7  | `POST /v1/pastoral/referrals` → `/submit` → `/acknowledge` → ...                     | 400ms each |           |
| 8.8  | `POST /v1/pastoral/critical-incidents` (scope=whole_school, affected array 50 items) |     1000ms |           |
| 8.9  | `POST /v1/pastoral/sst/meetings/:id/agenda/refresh` (enqueues precompute)            |      300ms |           |
| 8.10 | `POST /v1/pastoral/checkins` + keyword trigger                                       |      300ms |           |
| 8.11 | `POST /v1/pastoral/checkins/:id/escalate`                                            |      500ms |           |
| 8.12 | `POST /v1/pastoral/import/dry-run` (1000 CSV rows)                                   |     2000ms |           |
| 8.13 | `POST /v1/pastoral/import/commit` (1000 CSV rows, sync)                              |     8000ms |           |
| 8.14 | `PATCH /v1/pastoral/dsar-reviews/:id`                                                |      300ms |           |

---

## 9. Endpoint perf matrix — safeguarding

| #    | Endpoint                                                        |    p95 | Pass/Fail |
| ---- | --------------------------------------------------------------- | -----: | --------- |
| 9.1  | `GET /v1/safeguarding/concerns` (pageSize=20)                   |  250ms |           |
| 9.2  | `GET /v1/safeguarding/concerns/:id`                             |  250ms |           |
| 9.3  | `POST /v1/safeguarding/concerns`                                |  400ms |           |
| 9.4  | `POST /v1/safeguarding/concerns/:id/assign`                     |  300ms |           |
| 9.5  | `POST /v1/safeguarding/concerns/:id/actions`                    |  300ms |           |
| 9.6  | `POST /v1/safeguarding/concerns/:id/tusla-referral`             |  400ms |           |
| 9.7  | `POST /v1/safeguarding/concerns/:id/attachments` (5MB)          | 3000ms |           |
| 9.8  | `POST /v1/safeguarding/concerns/:id/case-file` (async enqueue)  |  300ms |           |
| 9.9  | `POST /v1/safeguarding/concerns/:id/case-file/redacted` (async) |  300ms |           |
| 9.10 | `POST /v1/safeguarding/concerns/:id/seal/initiate`              |  300ms |           |
| 9.11 | `POST /v1/safeguarding/concerns/:id/seal/approve`               |  300ms |           |
| 9.12 | `POST /v1/safeguarding/break-glass`                             |  300ms |           |
| 9.13 | `GET /v1/safeguarding/break-glass/:id/access-log` (20 entries)  |  250ms |           |
| 9.14 | `GET /v1/safeguarding/dashboard`                                |  400ms |           |
| 9.15 | `GET /v1/safeguarding/my-reports`                               |  250ms |           |

---

## 10. Endpoint perf matrix — early warning

| #    | Endpoint                                                           | p95 realistic | p95 10k | Pass/Fail |
| ---- | ------------------------------------------------------------------ | ------------: | ------: | --------- |
| 10.1 | `GET /v1/early-warnings` (pageSize=100)                            |         400ms |   600ms |           |
| 10.2 | `GET /v1/early-warnings/summary`                                   |         300ms |   400ms |           |
| 10.3 | `GET /v1/early-warnings/cohort?year_group_id=X`                    |         400ms |   500ms |           |
| 10.4 | `GET /v1/early-warnings/:studentId` (full detail + signal history) |         300ms |   400ms |           |
| 10.5 | `POST /v1/early-warnings/:studentId/acknowledge`                   |         200ms |   200ms |           |
| 10.6 | `POST /v1/early-warnings/:studentId/assign`                        |         300ms |   300ms |           |
| 10.7 | `GET /v1/early-warnings/config`                                    |         100ms |   100ms |           |
| 10.8 | `PUT /v1/early-warnings/config`                                    |         300ms |   300ms |           |

---

## 11. Endpoint perf matrix — staff wellbeing + AI flags

| #     | Endpoint                                                             |    p95 | Pass/Fail |
| ----- | -------------------------------------------------------------------- | -----: | --------- |
| 11.1  | `GET /v1/staff-wellbeing/surveys`                                    |  200ms |           |
| 11.2  | `GET /v1/staff-wellbeing/surveys/:id` (with questions)               |  300ms |           |
| 11.3  | `POST /v1/staff-wellbeing/surveys` (multi-step create, 10 questions) |  400ms |           |
| 11.4  | `POST /v1/staff-wellbeing/surveys/:id/activate` (enqueue notify)     |  400ms |           |
| 11.5  | `POST /v1/staff-wellbeing/respond/:id` (10 answers)                  |  250ms |           |
| 11.6  | `GET /v1/staff-wellbeing/surveys/:id/results` (aggregate)            |  500ms |           |
| 11.7  | `GET /v1/staff-wellbeing/aggregate-workload` (cached)                |  100ms |           |
| 11.8  | `GET /v1/staff-wellbeing/aggregate-workload` (cold, 1000 staff)      | 1500ms |           |
| 11.9  | `GET /v1/ai-flags`                                                   |  100ms |           |
| 11.10 | `PATCH /v1/ai-flags/:moduleKey`                                      |  150ms |           |

---

## 12. List-endpoint scale matrix

For each list endpoint, measure p50/p95/p99 at row counts 0 / realistic / 10k / 50k.

| Endpoint                               | 0 p95 | realistic p95 | 10k p95 | 50k p95 | Pass/Fail |
| -------------------------------------- | ----: | ------------: | ------: | ------: | --------- |
| `GET /v1/behaviour/incidents`          |  50ms |         200ms |   300ms |   500ms |           |
| `GET /v1/behaviour/sanctions`          |  50ms |         200ms |   300ms |   500ms |           |
| `GET /v1/behaviour/appeals`            |  50ms |         200ms |   250ms |   400ms |           |
| `GET /v1/behaviour/exclusion-cases`    |  50ms |         200ms |   250ms |   400ms |           |
| `GET /v1/behaviour/interventions`      |  50ms |         200ms |   300ms |   500ms |           |
| `GET /v1/behaviour/recognition/awards` |  50ms |         250ms |   400ms |   600ms |           |
| `GET /v1/behaviour/documents`          |  50ms |         200ms |   300ms |   500ms |           |
| `GET /v1/behaviour/tasks`              |  50ms |         200ms |   300ms |   500ms |           |
| `GET /v1/pastoral/concerns`            |  50ms |         250ms |   400ms |   700ms |           |
| `GET /v1/pastoral/cases`               |  50ms |         200ms |   300ms |   500ms |           |
| `GET /v1/pastoral/interventions`       |  50ms |         200ms |   300ms |   500ms |           |
| `GET /v1/pastoral/referrals`           |  50ms |         200ms |   300ms |   500ms |           |
| `GET /v1/safeguarding/concerns`        |  50ms |         250ms |   400ms |   600ms |           |
| `GET /v1/early-warnings`               |  50ms |         400ms |   600ms |  1000ms |           |
| `GET /v1/staff-wellbeing/surveys`      |  50ms |         200ms |   250ms |   400ms |           |

Each endpoint tested at its table's natural scale. Check:

| #    | What to Check                                                                       | Expected              | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------- | --------------------- | --------- |
| 12.A | Linear or sublinear scale (no step-function degradation between realistic and 10k). | Scale curve sensible. |           |
| 12.B | Query plan uses proper indexes at all scales — see §16.                             | Confirmed.            |           |
| 12.C | Payload size grows proportional to pageSize, not total table size.                  | Confirmed.            |           |

---

## 13. N+1 detection (relation-heavy endpoints)

| #    | Endpoint                                                                                                                                        | Expected                      | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------- |
| 13.1 | `GET /v1/pastoral/cases/:id` (joins concerns, interventions, students) — query count ≤ 8 regardless of number of linked concerns/interventions. | ≤ 8 queries. No N × concerns. |           |
| 13.2 | `GET /v1/behaviour/students/:id` (profile with 7 tabs lazy-loaded) — initial fetch ≤ 5 queries; each tab open fires ≤ 3.                        | Lazy loading works.           |           |
| 13.3 | `GET /v1/pastoral/sst/meetings/:id` — agenda_items + actions joined — ≤ 6 queries.                                                              | Bounded.                      |           |
| 13.4 | `GET /v1/behaviour/incidents` (pageSize=20 with category + reporter relation) — ≤ 4 queries (1 count, 1 main, 2 relation lookups).              | Bounded.                      |           |
| 13.5 | `GET /v1/behaviour/recognition/leaderboard?limit=20` — ≤ 2 queries (single group-by with join).                                                 | Bounded.                      |           |
| 13.6 | `GET /v1/safeguarding/concerns/:id` + `/actions` nested — ≤ 5 queries.                                                                          | Bounded.                      |           |
| 13.7 | `GET /v1/early-warnings?pageSize=100` — risk_signals relation loaded via batch, not N × query. ≤ 4 queries.                                     | Bounded.                      |           |
| 13.8 | `GET /v1/wellbeing/dashboard-summary` — ≤ 10 queries regardless of data volume (Promise.allSettled of 5 sub-queries, each 1-2 queries).         | Bounded.                      |           |
| 13.9 | Instrumentation tooling: `prisma.$on('query', fn)` + counter; alternative `pg_stat_statements` snapshot diff.                                   | Tooling in place.             |           |

---

## 14. Load / concurrency tests

### 14.1 Baseline concurrency

| #      | What to run                                                                            | Expected      | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------- | ------------- | --------- |
| 14.1.1 | 50 concurrent clients × `GET /v1/behaviour/incidents` for 60s. No errors. p95 < 300ms. | Under budget. |           |
| 14.1.2 | 100 concurrent × same — p95 < 500ms. No 500s.                                          | Under budget. |           |
| 14.1.3 | 200 concurrent (peak) × mix of reads — no connection pool exhaustion; p95 < 1000ms.    | Sustained.    |           |

### 14.2 Dashboard-summary fan-out under load

| #      | What to run                                                                                                          | Expected        | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 14.2.1 | 50 concurrent × `GET /v1/wellbeing/dashboard-summary` for 60s. p95 < 800ms. p99 < 1500ms. Zero errors.               | Under budget.   |           |
| 14.2.2 | Mix with admin navigating morph bar (simulated with 20 clients hitting sub-hub landings). No contention degradation. | No degradation. |           |

### 14.3 Mutation contention

| #      | What to run                                                                                                                          | Expected          | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | --------- |
| 14.3.1 | 20 concurrent `POST /v1/behaviour/incidents` — `tenant_sequences` lock holds; no gaps; p95 < 600ms.                                  | Correct sequence. |           |
| 14.3.2 | 10 concurrent `POST /v1/safeguarding/concerns/:id/seal/initiate` on the same concern — only 1 succeeds; 9 get 409; no partial state. | Race handled.     |           |
| 14.3.3 | 50 concurrent student check-ins (50 different students) — all succeed; p95 < 400ms.                                                  | Under budget.     |           |

### 14.4 Worker backpressure

| #      | What to run                                                                                                             | Expected            | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------- | --------- |
| 14.4.1 | Enqueue 1000 `pastoral:notify-concern` jobs rapidly. Worker drains in < 5 min.                                          | Drain rate ≥ 4/sec. |           |
| 14.4.2 | Enqueue 100 `safeguarding:attachment-scan` (5MB each) — drains in < 10 min. ClamAV stub responds in 500ms; 10 parallel. | Drain rate OK.      |           |
| 14.4.3 | Enqueue 500 `behaviour:parent-notification` — drains in < 2 min.                                                        | Drain rate OK.      |           |

### 14.5 DB connection pool

| #      | What to Check                                                                                                              | Expected    | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- |
| 14.5.1 | `pgbouncer` transaction-mode. Max client connections ≥ 200. Worker + API share pool.                                       | Configured. |           |
| 14.5.2 | Under 200 concurrent API clients, pool not saturated (`SELECT count(*) FROM pg_stat_activity` remains ≤ connection limit). | Sustained.  |           |

---

## 15. Frontend page bundle + FCP/LCP/CLS budgets

Measured with Lighthouse CI mobile config, 3G throttled (1.6 Mbps down / 768 Kbps up / 150ms RTT), 4× CPU throttle.

| Page                                                  |    FCP |    LCP | CLS |    TTI | JS transfer | Pass/Fail |
| ----------------------------------------------------- | -----: | -----: | --: | -----: | ----------: | --------- |
| `/en/wellbeing` (super-hub)                           | 2000ms | 3000ms | 0.1 | 3500ms |    < 300 KB |           |
| `/en/behaviour` (sub-hub)                             | 2000ms | 3000ms | 0.1 | 3500ms |    < 300 KB |           |
| `/en/behaviour/incidents` (list)                      | 2500ms | 3500ms | 0.1 | 4000ms |    < 350 KB |           |
| `/en/behaviour/incidents/:id` (detail)                | 2500ms | 3500ms | 0.1 | 4000ms |    < 350 KB |           |
| `/en/behaviour/incidents/new` (wizard)                | 2500ms | 3500ms | 0.1 | 4000ms |    < 400 KB |           |
| `/en/behaviour/analytics` (charts)                    | 2500ms | 4000ms | 0.1 | 5000ms |    < 500 KB |           |
| `/en/behaviour/analytics/ai` (NL panel)               | 2500ms | 4000ms | 0.1 | 5000ms |    < 500 KB |           |
| `/en/behaviour/documents/:id` (preview + S3 fetch)    | 2500ms | 4000ms | 0.1 | 5000ms |    < 450 KB |           |
| `/en/pastoral` (overview)                             | 2000ms | 3000ms | 0.1 | 3500ms |    < 350 KB |           |
| `/en/pastoral/concerns/:id` (with versions)           | 2500ms | 3500ms | 0.1 | 4000ms |    < 400 KB |           |
| `/en/pastoral/critical-incidents/:id` (response plan) | 2500ms | 3500ms | 0.1 | 4000ms |    < 400 KB |           |
| `/en/safeguarding` (sub-hub)                          | 2000ms | 3000ms | 0.1 | 3500ms |    < 300 KB |           |
| `/en/safeguarding/concerns/:id` (detail)              | 2500ms | 3500ms | 0.1 | 4000ms |    < 400 KB |           |
| `/en/early-warnings` (at-risk list + heatmap)         | 2500ms | 4000ms | 0.1 | 5000ms |    < 500 KB |           |
| `/en/early-warnings/cohort` (heatmap)                 | 2500ms | 4000ms | 0.1 | 5000ms |    < 500 KB |           |
| `/en/wellbeing/staff` (folded sub-hub)                | 2500ms | 4000ms | 0.1 | 5000ms |    < 500 KB |           |
| `/en/wellbeing/surveys/:id` (results)                 | 2500ms | 4000ms | 0.1 | 5000ms |    < 450 KB |           |
| `/en/settings/ai-flags`                               | 2000ms | 3000ms | 0.1 | 3500ms |    < 250 KB |           |

Additional checks:

| #    | What to Check                                                                             | Expected                                          | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- | --------- |
| 15.A | Recharts bundle loaded lazily for analytics + staff pages, not on `/wellbeing` super-hub. | Lazy chunks.                                      |           |
| 15.B | No blocking `@import` in CSS; all fonts via `@/lib/fonts` (Figtree + JetBrains Mono).     | No blocking.                                      |           |
| 15.C | Mobile 375×812: no horizontal scroll on any page.                                         | `document.body.scrollWidth == window.innerWidth`. |           |
| 15.D | Arabic `/ar/*` pages — same budgets (no RTL regression).                                  | Parity.                                           |           |
| 15.E | `next build` output — route chunks for each wellbeing page < 50 KB gzipped per route.     | Bundle split.                                     |           |

---

## 16. Database query health (EXPLAIN ANALYZE)

For each critical read, capture `EXPLAIN (ANALYZE, BUFFERS)` output and assert:

| #     | Query                                                                                                                                                                       | Expected                                                                                                         | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1  | `SELECT * FROM behaviour_incidents WHERE tenant_id=X AND status='submitted' ORDER BY occurred_at DESC LIMIT 20`                                                             | Uses index `idx_behaviour_incidents_tenant_occurred_desc` or equivalent. Rows read ≤ 1000 (not seq scan of 30k). |           |
| 16.2  | `SELECT * FROM pastoral_concerns WHERE tenant_id=X AND tier < 3 ORDER BY created_at DESC LIMIT 50`                                                                          | Index `idx_pastoral_concerns_tenant_tier_created`.                                                               |           |
| 16.3  | `SELECT COUNT(*) FROM safeguarding_concerns WHERE tenant_id=X AND status='open' AND sla_first_response_due < now()`                                                         | Index covers (tenant_id, status, sla_first_response_due). Plan shows index scan.                                 |           |
| 16.4  | Dashboard-summary composite — 5 sub-queries with `Promise.allSettled`. Each uses index. Longest-leg p95 < 100ms.                                                            | All sub-queries indexed.                                                                                         |           |
| 16.5  | `SELECT ... FROM tenant_sequences WHERE tenant_id=X AND sequence_type='behaviour_incident_number' FOR UPDATE` — uses unique index, acquires row lock in < 5ms.              | Lock fast.                                                                                                       |           |
| 16.6  | `SELECT * FROM behaviour_recognition_awards WHERE tenant_id=X AND academic_year_id=Y GROUP BY student_id ORDER BY SUM(points_at_award) DESC LIMIT 10` (leaderboard)         | Index on `(tenant_id, academic_year_id)`; hash aggregate; cost < 1000.                                           |           |
| 16.7  | Stats endpoint `GROUP BY polarity, status` on `behaviour_incidents` — index-only scan OR bitmap + aggregate. Cost bounded.                                                  | Bounded.                                                                                                         |           |
| 16.8  | `student_risk_profiles` read with filter on `current_tier IN (2,3)` — index present; plan uses index scan.                                                                  | Index scan.                                                                                                      |           |
| 16.9  | `pg_stat_statements` top 20 by `total_exec_time` after a 5-min bench run — no unexpected queries; all map to known endpoints.                                               | No surprise queries.                                                                                             |           |
| 16.10 | Vacuum and autovacuum healthy: `pg_stat_user_tables` shows `last_autovacuum` within the last 24h for busy tables (behaviour_incidents, pastoral_events, pastoral_concerns). | Vacuumed.                                                                                                        |           |

---

## 17. Worker job perf

Measure per-job p50/p95/p99 over a 10-minute sustained run at realistic scale:

| Processor                                     |       p95 | Pass/Fail |
| --------------------------------------------- | --------: | --------- |
| `pastoral:notify-concern`                     |  < 500 ms |           |
| `pastoral:escalation-timeout` (wake)          |  < 300 ms |           |
| `pastoral:checkin-alert`                      |  < 300 ms |           |
| `pastoral:wellbeing-flag-expiry`              | < 1500 ms |           |
| `pastoral:overdue-actions` per tenant         | < 1000 ms |           |
| `pastoral:intervention-review-reminder`       |  < 300 ms |           |
| `pastoral:sync-behaviour-safeguarding`        |  < 800 ms |           |
| `pastoral:precompute-agenda`                  | < 1500 ms |           |
| `pastoral:cron-dispatch-overdue`              |  < 500 ms |           |
| `safeguarding:critical-escalation`            |  < 500 ms |           |
| `safeguarding:sla-check`                      |  < 500 ms |           |
| `safeguarding:attachment-scan` (5MB)          | < 3000 ms |           |
| `safeguarding:message-scan`                   |  < 200 ms |           |
| `safeguarding:notify-reviewers`               |  < 500 ms |           |
| `behaviour:break-glass-expiry`                | < 1000 ms |           |
| `behaviour:parent-notification`               |  < 400 ms |           |
| `behaviour:cron-dispatch-daily`               |  < 500 ms |           |
| `behaviour:cron-dispatch-sla`                 |  < 500 ms |           |
| `behaviour:cron-dispatch-monthly`             |  < 500 ms |           |
| `wellbeing:survey-open-notify`                | < 1000 ms |           |
| `wellbeing:eap-refresh-check`                 | < 2000 ms |           |
| `wellbeing:moderation-scan`                   |  < 200 ms |           |
| `wellbeing:survey-closing-reminder`           | < 1000 ms |           |
| `wellbeing:cleanup-participation-tokens`      |  < 500 ms |           |
| `wellbeing:workload-metrics` (1000 staff)     |    < 30 s |           |
| `early-warning:compute-daily` (1000 students) |    < 60 s |           |
| `early-warning:compute-student`               |  < 600 ms |           |
| `early-warning:weekly-digest`                 | < 5000 ms |           |

Checks:

| #    | What to Check                                                                                       | Expected        | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 17.A | Worker p95 does not exceed 2 × the same tenant-level endpoint p95 (reasonable overhead).            | Bounded.        |           |
| 17.B | Sustained drain rate (jobs/sec) across the 18 processors ≥ 20 jobs/sec aggregate on realistic seed. | Throughput.     |           |
| 17.C | No processor retains memory > 500MB under steady load.                                              | Memory bounded. |           |
| 17.D | CPU utilisation averaged over 1 min ≤ 70% per core.                                                 | Headroom.       |           |

---

## 18. Document generation (PDF) perf

| #    | What to run                                                                                                        | Expected        | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------ | --------------- | --------- |
| 18.1 | Exclusion notice PDF — template pull + merge + render — p95 < 5 s wall-time (end-to-end from enqueue to download). | Under budget.   |           |
| 18.2 | Board pack (10 pages, includes charts) — p95 < 12 s.                                                               | Under budget.   |           |
| 18.3 | Safeguarding case file PDF (all actions + attachments index) — p95 < 8 s.                                          | Under budget.   |           |
| 18.4 | Redacted case file — comparable budget (redaction adds < 1 s).                                                     | Under budget.   |           |
| 18.5 | Appeal evidence bundle (5 attachments, ~5 MB total) — p95 < 10 s.                                                  | Under budget.   |           |
| 18.6 | Concurrent render of 5 PDFs — pdf-rendering queue drains without p95 regression.                                   | Concurrent OK.  |           |
| 18.7 | SHA256 hash computed inline without perf hit.                                                                      | < 100 ms added. |           |
| 18.8 | S3 upload (Hetzner Object Storage) — p95 < 2 s for 2MB PDF.                                                        | Under budget.   |           |

---

## 19. Memory / event-loop health

| #    | What to Check                                                                                                        | Expected              | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------- | --------------------- | --------- |
| 19.1 | Under 50 concurrent clients for 10 min, API process RSS stays bounded — no > 10% growth beyond baseline post-warmup. | No leak.              |           |
| 19.2 | Worker process — same. Memory steady.                                                                                | No leak.              |           |
| 19.3 | Event-loop lag p99 < 50ms under 100-concurrent load (measured via `perf_hooks.monitorEventLoopDelay`).               | Smooth.               |           |
| 19.4 | No synchronous CPU hot-paths > 100ms in the request pipeline (JSON parse, zod validation, bcrypt).                   | Async where possible. |           |
| 19.5 | BullMQ worker doesn't accumulate in-memory job buffer — `redis-cli MEMORY USAGE bull:*` bounded.                     | Bounded.              |           |

---

## 20. Cold vs warm start + cache behaviour

| #    | What to run                                                                                                                             | Expected                 | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------- |
| 20.1 | API process fresh start. First `GET /v1/wellbeing/dashboard-summary` — p95 ≤ 2 × warm p95.                                              | Cold-start acceptable.   |           |
| 20.2 | After `FLUSHDB` on Redis cache, `GET /v1/staff-wellbeing/aggregate-workload` — p95 < 1500 ms cold. Subsequent calls hit cache < 100 ms. | Cache behaviour correct. |           |
| 20.3 | `wellbeing:workload-metrics` cron pre-warms the cache daily 03:30 UTC. Assert next-morning dashboard call < 100 ms.                     | Cron-warmed cache.       |           |
| 20.4 | Cache invalidation — when a survey closes, the aggregate-workload cache key is refreshed or TTLed; next call recomputes with new data.  | Correct invalidation.    |           |
| 20.5 | After 24h TTL expiry, cache refreshed on next request.                                                                                  | TTL honoured.            |           |

---

## 21. Sign-off

| Reviewer | Date | Pass / Fail | Notes |
| -------- | ---- | ----------- | ----- |
|          |      |             |       |
|          |      |             |       |
|          |      |             |       |

**All 78 endpoint budgets + 17 page budgets + 28 worker budgets + 8 PDF budgets populate in the summary table above.** Pack is release-ready when every row above is Pass and the summary table is fully measured with no budget breached.

**Known gaps (documented):**

- Tenant workload-metrics cache has 24h TTL — stale data possible up to 23h; cron at 03:30 UTC refreshes daily.
- Email/SMS provider stubs return instantly; real provider latencies not benchmarked here.
- AI endpoints benchmarked against deterministic stub; live Anthropic latency depends on tier/key and not covered.
- No 100k+ concurrent user load-test — target is realistic volume (50–100) not disaster scenario.
- Dead-letter queue depth alerting thresholds not benchmarked here; see worker spec §31.
