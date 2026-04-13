# Admissions Module — Performance Test Specification

**Scope:** latency budgets, list-endpoint scale, N+1 detection, load/contention, page bundle/FCP/LCP/CLS, query health, memory/event-loop, cold vs warm start
**Spec version:** 1.0 (2026-04-12)
**Audience:** a perf harness driving k6 + autocannon + Lighthouse + Prisma query instrumentation. Every row carries a numeric budget so run-to-run regressions are visible.
**Pack companion:** part of `/e2e-full admissions` — admin + parent + integration + worker + security specs alongside

---

## Table of Contents

1. [Baseline Environment](#1-baseline-env)
2. [Endpoint Perf Matrix (per route budgets)](#2-endpoint-matrix)
3. [List-Endpoint Scale Matrix](#3-scale-matrix)
4. [N+1 Detection](#4-n1-detection)
5. [Mutation Load / Concurrency](#5-load)
6. [Worker Throughput (payment-expiry cron scale)](#6-worker-perf)
7. [Frontend Page Budgets (bundle/FCP/LCP/CLS)](#7-page-budgets)
8. [Database Query Health (EXPLAIN ANALYZE)](#8-db-health)
9. [Memory / Event-loop Health](#9-memory)
10. [Cold vs Warm Start](#10-cold-warm)
11. [Fixture Seeder (large-volume data)](#11-fixtures)
12. [Summary table — measured vs budget](#12-summary)
13. [Observations](#13-observations)
14. [Sign-off](#14-signoff)

---

## 1. Baseline Environment <a id="1-baseline-env"></a>

All numbers are meaningful only against this pinned environment. Any deviation must be documented alongside the result.

| Parameter                  | Value                                                                           |
| -------------------------- | ------------------------------------------------------------------------------- |
| Hardware                   | M3 MacBook Pro, 16GB RAM (dev) — OR: c5.2xlarge EC2, 16GB RAM, gp3 (CI staging) |
| Node.js                    | 20.x LTS (match prod)                                                           |
| PostgreSQL                 | 15.x                                                                            |
| Redis                      | 7.x                                                                             |
| pgBouncer                  | transaction mode, matches prod config                                           |
| Concurrent users simulated | 50 (small-school baseline), 500 (stress)                                        |
| Client location            | Same region/VPC as API                                                          |
| Warm state                 | Process has served ≥ 1,000 requests before measurement                          |
| Cold state                 | Process freshly booted (< 5s uptime)                                            |

The Stripe SDK, email provider, and Cloudflare are mocked at the boundary — this is API latency, not network round-trip to 3rd parties.

---

## 2. Endpoint Perf Matrix <a id="2-endpoint-matrix"></a>

Per endpoint: p50, p95, p99, payload size. Measure via `autocannon --duration 30 --connections 50`.

| #    | Endpoint                                                               | p50 budget | p95 budget | p99 budget | Payload budget | Measurement                                                        | Pass/Fail |
| ---- | ---------------------------------------------------------------------- | ---------- | ---------- | ---------- | -------------- | ------------------------------------------------------------------ | --------- |
| 2.1  | `GET /v1/admissions/dashboard-summary`                                 | 80ms       | 200ms      | 400ms      | 10KB           | autocannon 50 conns, 30s, realistic fixtures                       |           |
| 2.2  | `GET /v1/applications/queues/ready-to-admit`                           | 120ms      | 300ms      | 500ms      | 50KB @ page=1  | autocannon 50 conns, 30s, 1k rows seeded                           |           |
| 2.3  | `GET /v1/applications/queues/waiting-list`                             | 120ms      | 300ms      | 500ms      | 50KB           | same                                                               |           |
| 2.4  | `GET /v1/applications/queues/conditional-approval`                     | 100ms      | 250ms      | 450ms      | 40KB           | same                                                               |           |
| 2.5  | `GET /v1/applications/queues/approved`                                 | 120ms      | 300ms      | 500ms      | 50KB           | same                                                               |           |
| 2.6  | `GET /v1/applications/queues/rejected`                                 | 100ms      | 250ms      | 450ms      | 40KB           | same                                                               |           |
| 2.7  | `GET /v1/applications/analytics?date_from=...&date_to=...`             | 200ms      | 600ms      | 1200ms     | 30KB           | autocannon 50 conns, 30s; 12-month range                           |           |
| 2.8  | `GET /v1/applications/:id` (detail)                                    | 80ms       | 200ms      | 400ms      | 30KB           | autocannon 50 conns, 30s                                           |           |
| 2.9  | `GET /v1/applications/:id/preview`                                     | 80ms       | 200ms      | 400ms      | 30KB           | same                                                               |           |
| 2.10 | `POST /v1/applications/:id/review` (approve)                           | 200ms      | 450ms      | 800ms      | 5KB            | autocannon 20 conns, 30s (mutation — lower concurrency)            |           |
| 2.11 | `POST /v1/applications/:id/payment/cash`                               | 250ms      | 600ms      | 1000ms     | 5KB            | autocannon 10 conns, 30s (finance bridge is heavier)               |           |
| 2.12 | `POST /v1/applications/:id/payment/bank-transfer`                      | 250ms      | 600ms      | 1000ms     | 5KB            | same                                                               |           |
| 2.13 | `POST /v1/applications/:id/payment/override`                           | 300ms      | 700ms      | 1200ms     | 5KB            | adds AdmissionOverride write                                       |           |
| 2.14 | `POST /v1/applications/:id/payment-link/regenerate`                    | 300ms      | 800ms      | 1500ms     | 5KB            | Stripe API mocked to respond in 100ms                              |           |
| 2.15 | `POST /v1/applications/:id/manual-promote`                             | 150ms      | 400ms      | 700ms      | 5KB            | autocannon 20 conns, 30s                                           |           |
| 2.16 | `POST /v1/applications/:id/withdraw`                                   | 150ms      | 400ms      | 700ms      | 5KB            | same                                                               |           |
| 2.17 | `GET /v1/applications/:applicationId/notes`                            | 80ms       | 200ms      | 400ms      | 20KB           | autocannon 50 conns, 30s                                           |           |
| 2.18 | `POST /v1/applications/:applicationId/notes`                           | 100ms      | 300ms      | 500ms      | 3KB            | autocannon 20 conns, 30s                                           |           |
| 2.19 | `GET /v1/admission-forms/system`                                       | 80ms       | 200ms      | 400ms      | 20KB           | autocannon 50 conns, 30s                                           |           |
| 2.20 | `POST /v1/admission-forms/system/rebuild`                              | 400ms      | 1200ms     | 2000ms     | 20KB           | autocannon 5 conns, 30s (batch field writes, infrequent)           |           |
| 2.21 | `GET /v1/admission-overrides`                                          | 80ms       | 200ms      | 400ms      | 30KB           | autocannon 50 conns, 30s                                           |           |
| 2.22 | `POST /v1/public/admissions/applications` (new_household, 1 student)   | 300ms      | 700ms      | 1200ms     | 5KB            | autocannon 10 conns, 30s (rate limiter allows up to N/hour per IP) |           |
| 2.23 | `POST /v1/public/admissions/applications` (new_household, 10 students) | 500ms      | 1200ms     | 2000ms     | 15KB           | autocannon 5 conns, 30s                                            |           |
| 2.24 | `GET /v1/public/admissions/form`                                       | 60ms       | 150ms      | 300ms      | 20KB           | autocannon 100 conns, 30s (public, CDN-cacheable once implemented) |           |
| 2.25 | `GET /v1/parent/applications`                                          | 80ms       | 200ms      | 400ms      | 20KB           | autocannon 50 conns, 30s                                           |           |
| 2.26 | `GET /v1/parent/applications/:id`                                      | 80ms       | 200ms      | 400ms      | 30KB           | same                                                               |           |
| 2.27 | `POST /v1/parent/applications/:id/withdraw`                            | 150ms      | 400ms      | 700ms      | 5KB            | same                                                               |           |
| 2.28 | `PATCH /v1/settings/admissions`                                        | 80ms       | 200ms      | 400ms      | 3KB            | autocannon 10 conns, 30s                                           |           |

**Total budgeted endpoints: 28.** Every row must have a measurement AND a pass/fail.

---

## 3. List-Endpoint Scale Matrix <a id="3-scale-matrix"></a>

For every list endpoint, measure at 3 volumes. Stress p95 must be ≤ 3× realistic p95.

| #   | Endpoint                           | 0 rows | 1,000 rows | 10,000 rows (stress) | p95 at stress (budget) | Stress ≤ 3× realistic? | Pass/Fail |
| --- | ---------------------------------- | ------ | ---------- | -------------------- | ---------------------- | ---------------------- | --------- |
| 3.1 | `ready-to-admit` queue             |        |            |                      | 900ms                  |                        |           |
| 3.2 | `waiting-list` queue               |        |            |                      | 900ms                  |                        |           |
| 3.3 | `conditional-approval` queue       |        |            |                      | 750ms                  |                        |           |
| 3.4 | `approved` archive                 |        |            |                      | 900ms                  |                        |           |
| 3.5 | `rejected` archive                 |        |            |                      | 750ms                  |                        |           |
| 3.6 | `GET /v1/applications` (main list) |        |            |                      | 900ms                  |                        |           |
| 3.7 | `GET /v1/admission-overrides`      |        |            |                      | 600ms                  |                        |           |
| 3.8 | `GET /v1/parent/applications`      |        |            | 1,000 per-parent     | 500ms                  |                        |           |
| 3.9 | Analytics (`date_from` 12 months)  |        |            | 50,000 submitted     | 1800ms                 |                        |           |

Fixture seeding: §11 has scripts for each volume.

`pageSize=100` vs `pageSize=20`: verify queue p95 scales linearly, not worse. Add a per-endpoint row comparing the two — budget is `pageSize=100` p95 ≤ 2× `pageSize=20` p95.

---

## 4. N+1 Detection <a id="4-n1-detection"></a>

Instrument Prisma with `$on('query', ...)` and count queries per request. Every relation-heavy endpoint has a bounded-query budget.

| #    | Endpoint                                                | Max queries per request (budget)                                   | Measurement                                                                    | Pass/Fail |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------- |
| 4.1  | `GET /v1/applications/queues/ready-to-admit`            | 6 (incl. group aggregation + capacity per group)                   | Verify query count = constant regardless of rows (test at 20, 200, 2,000 rows) |           |
| 4.2  | `GET /v1/applications/queues/conditional-approval`      | 5                                                                  | same                                                                           |           |
| 4.3  | `GET /v1/applications/queues/approved`                  | 5 (incl. materialised_student join)                                | same                                                                           |           |
| 4.4  | `GET /v1/applications/:id`                              | 7 (application + notes + timeline + capacity + form)               | query count bounded                                                            |           |
| 4.5  | `GET /v1/applications/:applicationId/notes`             | 2                                                                  | simple select + count                                                          |           |
| 4.6  | `GET /v1/admissions/dashboard-summary`                  | 4 (one aggregate per status, plus capacity)                        | capacity query bounded (does not iterate per year-group with a sub-query)      |           |
| 4.7  | `GET /v1/applications/analytics`                        | 8 (per-day aggregate + rejection breakdown + totals)               | bounded                                                                        |           |
| 4.8  | `POST /v1/public/admissions/applications` (10 students) | 2N + constant (N=student count — reasonable due to sequence calls) | Verify growth rate is linear; query plan optimal                               |           |
| 4.9  | `GET /v1/admission-forms/system`                        | 2 (definition + fields)                                            | bounded                                                                        |           |
| 4.10 | `GET /v1/parent/applications`                           | 3                                                                  | bounded                                                                        |           |

Measurement: set a request counter, run 3 requests at 10 rows, 3 at 1000, 3 at 10,000. Query counts must be identical (± variance of 1 for transactional-start/end).

---

## 5. Mutation Load / Concurrency <a id="5-load"></a>

For each critical mutation, measure burst load (different resources) and contention (same resource).

### 5.1 Burst load

| #     | Mutation                                                 | Concurrent requests                                  | Expected throughput (req/s) | p95 latency budget | Error rate budget                  | Pass/Fail |
| ----- | -------------------------------------------------------- | ---------------------------------------------------- | --------------------------- | ------------------ | ---------------------------------- | --------- |
| 5.1.1 | `POST /v1/applications/:id/review` (approve — diff apps) | 20                                                   | ≥ 30                        | 800ms              | 0%                                 |           |
| 5.1.2 | `POST /v1/applications/:id/payment/cash`                 | 10                                                   | ≥ 10                        | 1000ms             | 0%                                 |           |
| 5.1.3 | `POST /v1/applications/:id/payment/override`             | 5                                                    | ≥ 5                         | 1200ms             | 0%                                 |           |
| 5.1.4 | `POST /v1/public/admissions/applications`                | 5 / IP (rate-limited) — measure throttled throughput | ≥ 5 / IP / hour             | 1200ms             | 0% under threshold, 100% 429 above |           |
| 5.1.5 | `POST /v1/applications/:id/manual-promote`               | 10                                                   | ≥ 15                        | 700ms              | 0%                                 |           |

### 5.2 Contention

| #     | Mutation                                                                   | Attackers | Expected                                                                               | Pass/Fail |
| ----- | -------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------- | --------- |
| 5.2.1 | 10 concurrent approvals of SAME application (integration spec §8.1 timing) | 10        | 1 succeeds, 9 fail. Winner p95 ≤ 500ms. No partial state.                              |           |
| 5.2.2 | 50 concurrent Stripe webhook posts for SAME event.id                       | 50        | 1 processed, 49 idempotent no-ops. Winner p95 ≤ 1000ms.                                |           |
| 5.2.3 | 20 concurrent public submits from SAME IP                                  | 20        | 5 (or configured limit) succeed, rest 429 within 50ms each (rate limiter is fast).     |           |
| 5.2.4 | Capacity race: 5 approvals on 5 different apps, year_group with 1 seat     | 5         | 1 succeeds. 4 fail with `NO_AVAILABLE_SEATS`. Winner p95 ≤ 500ms. No oversubscription. |           |

---

## 6. Worker Throughput <a id="6-worker-perf"></a>

`payment-expiry` cron scale tests.

| #   | Scenario                                          | Expected                                                                                                                                                            | Pass/Fail |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | 1,000 expired applications across 2 tenants       | Cron completes in ≤ 60s. All reverted; all promotions applied. Revert throughput ≥ 20/s.                                                                            |           |
| 6.2 | 10,000 expired applications (stress)              | Cron completes in ≤ 10 min (within 5-min lockDuration a concern — see WK-01). Bumped lockDuration required for this volume.                                         |           |
| 6.3 | 50 tenants with 100 expired apps each             | Each tenant processed serially; total runtime scales linearly. Per-tenant p95 ≤ 5s.                                                                                 |           |
| 6.4 | `notifications:admissions-payment-link` processor | 100 jobs enqueued; drain in ≤ 30s with concurrency=3. p95 per job ≤ 1000ms (Stripe mocked).                                                                         |           |
| 6.5 | Stripe SDK real-world latency                     | With Stripe set to simulated 200ms response: job p95 ≤ 1500ms. (For budgets, prefer mock → isolate API perf.)                                                       |           |
| 6.6 | Queue pressure during submission burst            | Public submit → approve flow generates 1 Stripe session / email per approval. At 10 approvals/min (admin flow), notifications queue has bounded backlog < 100 jobs. |           |

---

## 7. Frontend Page Budgets <a id="7-page-budgets"></a>

Measure via Lighthouse (desktop + mobile), Next.js bundle analyzer, WebPageTest.

| #    | Page                               | Bundle uncompressed     | Bundle gzipped | FCP (mobile 3G) | LCP (mobile 3G) | CLS    | Pass/Fail |
| ---- | ---------------------------------- | ----------------------- | -------------- | --------------- | --------------- | ------ | --------- |
| 7.1  | `/admissions` (dashboard)          | ≤ 500KB                 | ≤ 150KB        | ≤ 1.8s          | ≤ 2.5s          | ≤ 0.1  |           |
| 7.2  | `/admissions/ready-to-admit`       | ≤ 500KB                 | ≤ 150KB        | ≤ 1.8s          | ≤ 2.5s          | ≤ 0.1  |           |
| 7.3  | `/admissions/conditional-approval` | ≤ 500KB                 | ≤ 150KB        | ≤ 1.8s          | ≤ 2.5s          | ≤ 0.1  |           |
| 7.4  | `/admissions/approved`             | ≤ 500KB                 | ≤ 150KB        | ≤ 1.8s          | ≤ 2.5s          | ≤ 0.1  |           |
| 7.5  | `/admissions/rejected`             | ≤ 500KB                 | ≤ 150KB        | ≤ 1.8s          | ≤ 2.5s          | ≤ 0.1  |           |
| 7.6  | `/admissions/waiting-list`         | ≤ 500KB                 | ≤ 150KB        | ≤ 1.8s          | ≤ 2.5s          | ≤ 0.1  |           |
| 7.7  | `/admissions/analytics`            | ≤ 800KB (Recharts)      | ≤ 250KB        | ≤ 2.2s          | ≤ 3.0s          | ≤ 0.1  |           |
| 7.8  | `/admissions/form-preview`         | ≤ 500KB                 | ≤ 150KB        | ≤ 1.8s          | ≤ 2.5s          | ≤ 0.1  |           |
| 7.9  | `/admissions/settings`             | ≤ 450KB                 | ≤ 140KB        | ≤ 1.8s          | ≤ 2.5s          | ≤ 0.1  |           |
| 7.10 | `/admissions/:id` (detail)         | ≤ 600KB (tabs + modals) | ≤ 180KB        | ≤ 1.8s          | ≤ 2.8s          | ≤ 0.1  |           |
| 7.11 | `/apply` (public)                  | ≤ 400KB                 | ≤ 120KB        | ≤ 1.5s          | ≤ 2.0s          | ≤ 0.05 |           |
| 7.12 | `/apply/[tenantSlug]`              | ≤ 600KB                 | ≤ 180KB        | ≤ 1.8s          | ≤ 2.5s          | ≤ 0.1  |           |
| 7.13 | `/apply/[tenantSlug]/submitted`    | ≤ 300KB                 | ≤ 100KB        | ≤ 1.2s          | ≤ 1.8s          | ≤ 0.05 |           |
| 7.14 | `/applications` (parent list)      | ≤ 400KB                 | ≤ 130KB        | ≤ 1.8s          | ≤ 2.5s          | ≤ 0.1  |           |

Every row includes Lighthouse Performance score ≥ 85 on mobile 3G. One row per page must be measured on a real device (iPhone via Xcode simulator or Android Pixel) in addition to Lighthouse emulation.

---

## 8. Database Query Health (EXPLAIN ANALYZE) <a id="8-db-health"></a>

For each critical query, assert: no sequential scans on large tables, all joins use indexes, query plan cost under budget.

| #   | Query                                                                                                                                                           | Table(s)                        | Expected plan                                                                          | Cost budget | Pass/Fail |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------- | ----------- | --------- |
| 8.1 | `SELECT * FROM applications WHERE tenant_id=? AND status=? ORDER BY apply_date ASC LIMIT 20`                                                                    | applications                    | Index scan on `idx_applications_tenant_status`; then sort; then limit                  | < 50        |           |
| 8.2 | Queue-group aggregation: `SELECT target_year_group_id, COUNT(*) FROM applications WHERE tenant_id=? AND status IN (...) GROUP BY target_year_group_id`          | applications                    | Index scan on `idx_applications_gating` (tenant_id, status, target_year_group_id, ...) | < 200       |           |
| 8.3 | Capacity computation (classes + students + applications)                                                                                                        | classes, students, applications | Nested loop with index scans; no seq scan                                              | < 400       |           |
| 8.4 | `SELECT * FROM applications WHERE tenant_id=? AND payment_deadline < now() AND status='conditional_approval'`                                                   | applications                    | Index scan on `idx_applications_expiry`                                                | < 50        |           |
| 8.5 | Analytics daily counts: `SELECT date_trunc('day', submitted_at) AS d, COUNT(*) FROM applications WHERE tenant_id=? AND submitted_at BETWEEN ? AND ? GROUP BY d` | applications                    | Index on `(tenant_id, submitted_at)` if exists; otherwise add one                      | < 500       |           |
| 8.6 | Rejection-reason breakdown                                                                                                                                      | applications                    | Index scan then aggregate                                                              | < 200       |           |
| 8.7 | Notes fetch: `SELECT * FROM application_notes WHERE tenant_id=? AND application_id=? ORDER BY created_at DESC`                                                  | application_notes               | Index scan on `idx_application_notes_application`                                      | < 30        |           |
| 8.8 | Overrides fetch: `SELECT * FROM admission_overrides WHERE tenant_id=? ORDER BY created_at DESC LIMIT 20`                                                        | admission_overrides             | Index scan on `idx_admission_overrides_tenant_time`                                    | < 30        |           |
| 8.9 | Payment-event dedupe: `SELECT 1 FROM admissions_payment_events WHERE stripe_event_id=?`                                                                         | admissions_payment_events       | Index lookup on unique index                                                           | < 10        |           |

Captures via `EXPLAIN (ANALYZE, BUFFERS, VERBOSE) <query>` at stress volume. Log the plan artefact next to each row.

---

## 9. Memory / Event-loop Health <a id="9-memory"></a>

| #   | Scenario                                                                          | Budget                                                                                                                         | Pass/Fail |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 9.1 | Worker: run `payment-expiry` cron 100 times in a loop (fixture: 100 expired apps) | RSS growth ≤ 20MB. No listener count growth > 10. Heap snapshots show no retained closures pointing at processed applications. |           |
| 9.2 | API: hit dashboard endpoint 1000 times                                            | RSS growth ≤ 20MB. Event-loop p99 lag < 50ms.                                                                                  |           |
| 9.3 | API: mutate 100 applications through approve → pay → approved                     | RSS growth ≤ 30MB (Stripe mocked).                                                                                             |           |
| 9.4 | Public submit 500 applications in 10 min                                          | RSS stable; event-loop lag < 100ms p99.                                                                                        |           |
| 9.5 | Form rebuild 50 times                                                             | Each rebuild deletes old fields + inserts new — no connection leaks; pool stays < N connections.                               |           |

---

## 10. Cold vs Warm Start <a id="10-cold-warm"></a>

| #    | Endpoint                                     | Cold p95 | Warm p95 | Cold ≤ 3× Warm? | Pass/Fail |
| ---- | -------------------------------------------- | -------- | -------- | --------------- | --------- |
| 10.1 | `GET /v1/admissions/dashboard-summary`       | 600ms    | 200ms    | 3.0             |           |
| 10.2 | `GET /v1/applications/queues/ready-to-admit` | 900ms    | 300ms    | 3.0             |           |
| 10.3 | `GET /v1/applications/:id`                   | 600ms    | 200ms    | 3.0             |           |
| 10.4 | `POST /v1/applications/:id/review`           | 1000ms   | 450ms    | 2.2             |           |
| 10.5 | `POST /v1/applications/:id/payment/cash`     | 1200ms   | 600ms    | 2.0             |           |

A cold-start > 3× warm-start indicates module-load or schema-boot work that should move to build-time.

---

## 11. Fixture Seeder <a id="11-fixtures"></a>

`scripts/perf/seed-admissions.ts` or raw SQL skeleton:

```sql
-- 10,000 waiting_list applications for Tenant A, 5 year groups
INSERT INTO applications (
  id, tenant_id, form_definition_id, application_number,
  student_first_name, student_last_name, date_of_birth,
  status, submitted_at, payload_json, payment_status, apply_date,
  target_academic_year_id, target_year_group_id,
  created_at, updated_at
)
SELECT
  gen_random_uuid(),
  '<tenant_a_id>'::uuid,
  '<form_def_id>'::uuid,
  'APP-2026-' || LPAD(i::text, 6, '0'),
  'Student' || i,
  'Family' || (i % 500),
  DATE '2015-01-01' + ((i % 1800) || ' days')::interval,
  (ARRAY['waiting_list','ready_to_admit'])[(i % 2) + 1]::applicationstatus,
  now() - ((i % 365) || ' days')::interval,
  '{}'::jsonb,
  'pending',
  now() - ((i % 365) || ' days')::interval,
  '<ay_id>'::uuid,
  (ARRAY['<yg1>','<yg2>','<yg3>','<yg4>','<yg5>'])[(i % 5) + 1]::uuid,
  now(),
  now()
FROM generate_series(1, 10000) AS i;
```

Additional seeders:

- 1,000 approved applications (with materialised Students, Invoices, Payments)
- 500 conditional_approval rows with varied deadlines
- 5,000 notes across random applications

Seeder must complete in < 2 minutes to keep the perf suite iteration fast.

---

## 12. Summary Table <a id="12-summary"></a>

Filled in by the tester after the run. Empty in the spec — human filler column per iteration.

| Endpoint / Page             | Budget (p95) | Measured (p95) | Status |
| --------------------------- | ------------ | -------------- | ------ |
| dashboard-summary           | 200ms        |                |        |
| queues/ready-to-admit       | 300ms        |                |        |
| queues/waiting-list         | 300ms        |                |        |
| queues/conditional-approval | 250ms        |                |        |
| queues/approved             | 300ms        |                |        |
| queues/rejected             | 250ms        |                |        |
| analytics                   | 600ms        |                |        |
| detail                      | 200ms        |                |        |
| review                      | 450ms        |                |        |
| payment/cash                | 600ms        |                |        |
| payment/bank-transfer       | 600ms        |                |        |
| payment/override            | 700ms        |                |        |
| payment-link/regenerate     | 800ms        |                |        |
| manual-promote              | 400ms        |                |        |
| withdraw                    | 400ms        |                |        |
| notes GET                   | 200ms        |                |        |
| notes POST                  | 300ms        |                |        |
| form GET                    | 200ms        |                |        |
| form rebuild                | 1200ms       |                |        |
| overrides GET               | 200ms        |                |        |
| public submit (1 student)   | 700ms        |                |        |
| public submit (10 students) | 1200ms       |                |        |
| public form GET             | 150ms        |                |        |
| parent applications list    | 200ms        |                |        |
| parent applications detail  | 200ms        |                |        |
| parent withdraw             | 400ms        |                |        |
| settings PATCH              | 200ms        |                |        |

---

## 13. Observations <a id="13-observations"></a>

| #     | Severity | Location                            | Observation                                                                                                                                                                                                                              |
| ----- | -------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PF-01 | P2       | `applications.service.ts` `findOne` | Detail endpoint fetches notes + timeline + capacity + form in the same call. N+1 audit in §4.4 caps at 7 queries; if any of these are accidentally eager-loaded via Prisma `include` without select, payload balloons. Verify at stress. |
| PF-02 | P2       | Analytics                           | `date_from`/`date_to` ranges > 12 months + no pagination → potentially large responses. Cap server-side to 24 months or require pagination.                                                                                              |
| PF-03 | P1       | `payment-expiry` cron               | Worker WK-01 — current 5-min lockDuration is insufficient for 10k+ expired rows. Either bump lockDuration or batch the discovery + revert phases with per-batch lock renewal.                                                            |
| PF-04 | P3       | Public form endpoint                | Form fetch is idempotent and public — should be CDN-cacheable with short TTL (e.g. 5 min) to reduce origin load. Verify `Cache-Control` header.                                                                                          |
| PF-05 | P2       | Recharts bundle                     | Analytics page bundle likely > 700KB due to Recharts. Check tree-shaking; consider dynamic import of chart components.                                                                                                                   |
| PF-06 | P3       | Capacity computation                | `AdmissionsCapacityService` likely does per-(year,yg) aggregation queries. Cache results in-request (memoise per service call) to avoid re-computing for the same pair in the same request.                                              |
| PF-07 | P2       | Full-text search on archives        | Search endpoints use ILIKE on `rejection_reason`/student names. At 10k rows, may degrade. Consider a `tsvector` column with a GIN index if search usage grows.                                                                           |
| PF-08 | P3       | Sequential number generation        | `tenant_sequences` row-level lock serialises all application_number allocations per tenant. Under 50 concurrent submits per tenant this is fine; test the upper-bound throughput.                                                        |

---

## 14. Sign-off <a id="14-signoff"></a>

| Section                 | Reviewer | Date | Pass | Fail | Notes |
| ----------------------- | -------- | ---- | ---- | ---- | ----- |
| 2 — Endpoint matrix     |          |      |      |      |       |
| 3 — Scale matrix        |          |      |      |      |       |
| 4 — N+1 detection       |          |      |      |      |       |
| 5 — Load / contention   |          |      |      |      |       |
| 6 — Worker throughput   |          |      |      |      |       |
| 7 — Page budgets        |          |      |      |      |       |
| 8 — DB query health     |          |      |      |      |       |
| 9 — Memory / event-loop |          |      |      |      |       |
| 10 — Cold vs warm start |          |      |      |      |       |
| **Overall**             |          |      |      |      |       |

**Perf release-ready when every endpoint p95 is within 10% of its budget AND the §13 P1 observation (PF-03) is addressed.**
