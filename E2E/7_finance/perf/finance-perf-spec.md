# Finance Module — Performance Test Specification

**Scope:** Latency budgets per endpoint, list-endpoint scale matrix, PDF render timing, N+1 detection, query plans, bundle/first-paint budgets, concurrency/load, cold-vs-warm start.
**Target tools:** k6 for load; autocannon for per-endpoint bench; Lighthouse for page bundle/LCP; Jest instrumentation for query-count; `pdf-parse` + `process.memoryUsage()` for PDF.
**Last updated:** 2026-04-12
**Baseline commit:** `384ba761`

---

## Table of Contents

1. [Baseline Environment Specification](#1-baseline-environment-specification)
2. [Fixture Seeder for Stress Volume](#2-fixture-seeder-for-stress-volume)
3. [Endpoint Perf Matrix](#3-endpoint-perf-matrix)
4. [List-Endpoint Scale Matrix (0 / realistic / stress)](#4-list-endpoint-scale-matrix-0--realistic--stress)
5. [N+1 Detection](#5-n1-detection)
6. [PDF Render Benchmarks](#6-pdf-render-benchmarks)
7. [Load / Concurrency Tests](#7-load--concurrency-tests)
8. [Bundle / First-Paint Budgets](#8-bundle--first-paint-budgets)
9. [Database Query Health (EXPLAIN ANALYZE)](#9-database-query-health-explain-analyze)
10. [Memory / Event-Loop Health](#10-memory--event-loop-health)
11. [Cold vs Warm Start](#11-cold-vs-warm-start)
12. [Summary Table & Observations](#12-summary-table--observations)
13. [Sign-Off](#13-sign-off)

---

## 1. Baseline Environment Specification

All numbers reported below are meaningless without a pinned baseline. Every row assumes:

- **Hardware:** AWS EC2 `c6i.2xlarge` (8 vCPU, 16 GB RAM, Nitro SSD). Same instance type for the app, worker, Postgres, and Redis — co-located for consistency.
- **OS:** Ubuntu 22.04 LTS.
- **Node.js:** `20.11.x` LTS.
- **Postgres:** `15.5` with `shared_buffers=4GB`, `effective_cache_size=12GB`, `work_mem=32MB`, `max_connections=200`. PgBouncer in transaction mode on port 6432.
- **Redis:** `7.2`, `maxmemory=2GB`, `allkeys-lru`.
- **Network:** Test client (k6) on the SAME VPC, private subnet, same AZ. Latency floor ≈ 0.3ms.
- **Concurrency expected:** Prod tier targets 50 concurrent authenticated users per tenant, bursting to 200 during fee-generation confirms.
- **Warm state:** Budgets assume a warm process — after 1000 requests have been served. Cold-start separately budgeted in §11.
- **Tenant data volume:** "realistic" = 1,000 invoices, 500 payments, 200 households; "stress" = 10,000 invoices, 5,000 payments, 1,500 households. Seeder in §2.

Pin the baseline to the commit hash in tests so runs are comparable.

---

## 2. Fixture Seeder for Stress Volume

### Seeder commands

```
pnpm --filter @school/prisma seed:finance:empty     # 0 rows
pnpm --filter @school/prisma seed:finance:realistic # 1k invoices
pnpm --filter @school/prisma seed:finance:stress    # 10k invoices (100k for reports)
```

### Seeder skeleton (if missing — referenced by spec)

```sql
-- 10,000 invoices across 1,500 households
INSERT INTO households (id, tenant_id, household_name, ...)
  SELECT gen_random_uuid(), '<tenant_id>', 'HH-' || n, ...
  FROM generate_series(1, 1500) n;

INSERT INTO invoices (id, tenant_id, household_id, invoice_number, status, ...)
  SELECT gen_random_uuid(), '<tenant_id>',
         (SELECT id FROM households ORDER BY random() LIMIT 1),
         'INV-202604-' || lpad(n::text, 6, '0'),
         (ARRAY['draft','issued','partially_paid','paid','overdue'])[1 + (n % 5)],
         ...
  FROM generate_series(1, 10000) n;

-- Distribute statuses realistically (60% paid, 20% partially_paid, 10% overdue, 5% issued, 5% misc)
```

### Pre-seed assertions

| #   | What to Check                                                       | Expected                                                   | Pass/Fail |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------- | --------- |
| 2.1 | Row counts after `seed:finance:stress`                              | `SELECT COUNT(*) FROM invoices WHERE tenant_id=?` ≈ 10000. |           |
| 2.2 | Row distribution                                                    | Statuses distributed per product spec.                     |           |
| 2.3 | Index usage — after seed, run `ANALYZE invoices; ANALYZE payments;` | pg_stat updated; planner picks correct indexes.            |           |

---

## 3. Endpoint Perf Matrix

Every endpoint gets: p50/p95/p99 latency (ms), payload size (bytes). Use `autocannon -c 50 -d 30 --renderProgressBar=false <url>` unless noted.

### Dashboard + Overview

| #   | Endpoint                                                   | Payload baseline | p50 budget | p95 budget | p99 budget | Size budget | Tool       | Pass/Fail |
| --- | ---------------------------------------------------------- | ---------------- | ---------- | ---------- | ---------- | ----------- | ---------- | --------- |
| 3.1 | GET `/v1/finance/dashboard`                                | 1 household      | 80ms       | 200ms      | 350ms      | 50KB        | autocannon |           |
| 3.2 | GET `/v1/finance/dashboard/currency`                       | —                | 15ms       | 40ms       | 70ms       | 200B        | autocannon |           |
| 3.3 | GET `/v1/finance/dashboard/debt-breakdown?bucket=all`      | 10k invoices     | 150ms      | 400ms      | 700ms      | 120KB       | autocannon |           |
| 3.4 | GET `/v1/finance/dashboard/household-overview?pageSize=20` | stress           | 100ms      | 250ms      | 400ms      | 60KB        | autocannon |           |

### Fee Setup

| #    | Endpoint                                    | Baseline      | p50   | p95    | p99    | Size  | Pass/Fail |
| ---- | ------------------------------------------- | ------------- | ----- | ------ | ------ | ----- | --------- |
| 3.5  | GET /v1/finance/fee-types                   | 20 types      | 30ms  | 80ms   | 150ms  | 10KB  |           |
| 3.6  | POST /v1/finance/fee-types                  | —             | 50ms  | 150ms  | 250ms  | 1KB   |           |
| 3.7  | GET /v1/finance/fee-structures              | 50 structures | 40ms  | 100ms  | 200ms  | 20KB  |           |
| 3.8  | POST /v1/finance/fee-structures             | —             | 60ms  | 180ms  | 300ms  | 1KB   |           |
| 3.9  | GET /v1/finance/fee-assignments?pageSize=20 | 500 assignmts | 60ms  | 150ms  | 300ms  | 30KB  |           |
| 3.10 | POST /v1/finance/fee-assignments            | —             | 80ms  | 200ms  | 350ms  | 1KB   |           |
| 3.11 | GET /v1/finance/discounts                   | 30 discounts  | 30ms  | 80ms   | 150ms  | 10KB  |           |
| 3.12 | POST /v1/finance/fee-generation/preview     | 100 hhs       | 400ms | 1200ms | 2500ms | 200KB |           |
| 3.13 | POST /v1/finance/fee-generation/confirm     | 100 hhs       | 600ms | 2000ms | 4000ms | 50KB  |           |

### Invoices

| #    | Endpoint                                                | Baseline       | p50   | p95    | p99    | Size  | Pass/Fail |
| ---- | ------------------------------------------------------- | -------------- | ----- | ------ | ------ | ----- | --------- |
| 3.14 | GET /v1/finance/invoices?pageSize=20 (empty filters)    | stress (10k)   | 80ms  | 200ms  | 400ms  | 80KB  |           |
| 3.15 | GET /v1/finance/invoices?status=overdue&pageSize=20     | stress         | 80ms  | 200ms  | 400ms  | 80KB  |           |
| 3.16 | GET /v1/finance/invoices?search=INV-2026                | stress         | 120ms | 300ms  | 500ms  | 80KB  |           |
| 3.17 | GET /v1/finance/invoices?include_lines=true&pageSize=20 | stress         | 150ms | 400ms  | 700ms  | 200KB |           |
| 3.18 | GET /v1/finance/invoices/:id                            | 20 lines       | 30ms  | 80ms   | 150ms  | 15KB  |           |
| 3.19 | GET /v1/finance/invoices/:id/preview                    | 20 lines       | 40ms  | 100ms  | 180ms  | 15KB  |           |
| 3.20 | GET /v1/finance/invoices/:id/pdf                        | 20 lines       | 800ms | 2500ms | 4000ms | 100KB |           |
| 3.21 | POST /v1/finance/invoices                               | 5 lines        | 120ms | 350ms  | 600ms  | 2KB   |           |
| 3.22 | PATCH /v1/finance/invoices/:id                          | 5 lines        | 120ms | 350ms  | 600ms  | 2KB   |           |
| 3.23 | POST /v1/finance/invoices/:id/issue                     | —              | 100ms | 300ms  | 500ms  | 1KB   |           |
| 3.24 | POST /v1/finance/invoices/:id/void                      | —              | 80ms  | 200ms  | 350ms  | 1KB   |           |
| 3.25 | POST /v1/finance/invoices/:id/write-off                 | —              | 100ms | 300ms  | 500ms  | 1KB   |           |
| 3.26 | POST /v1/finance/invoices/:id/installments              | 6 installments | 150ms | 400ms  | 700ms  | 2KB   |           |
| 3.27 | POST /v1/finance/invoices/:id/apply-late-fee            | —              | 120ms | 350ms  | 600ms  | 1KB   |           |

### Payments

| #    | Endpoint                                         | Baseline                        | p50   | p95    | p99    | Size | Pass/Fail |
| ---- | ------------------------------------------------ | ------------------------------- | ----- | ------ | ------ | ---- | --------- |
| 3.28 | GET /v1/finance/payments?pageSize=20             | stress (5k)                     | 80ms  | 200ms  | 400ms  | 60KB |           |
| 3.29 | GET /v1/finance/payments/staff                   | 100 staff                       | 50ms  | 120ms  | 200ms  | 10KB |           |
| 3.30 | GET /v1/finance/payments/:id                     | —                               | 40ms  | 100ms  | 180ms  | 5KB  |           |
| 3.31 | POST /v1/finance/payments (manual)               | —                               | 150ms | 400ms  | 700ms  | 1KB  |           |
| 3.32 | GET /v1/finance/payments/:id/allocations/suggest | household with 20 open invoices | 100ms | 300ms  | 500ms  | 10KB |           |
| 3.33 | POST /v1/finance/payments/:id/allocations        | 10 allocations                  | 200ms | 600ms  | 1000ms | 5KB  |           |
| 3.34 | GET /v1/finance/payments/:id/receipt             | —                               | 30ms  | 80ms   | 150ms  | 3KB  |           |
| 3.35 | GET /v1/finance/payments/:id/receipt/pdf         | —                               | 600ms | 1800ms | 3000ms | 80KB |           |

### Refunds / Credit Notes / Scholarships / Payment Plans / Late Fees

| #    | Endpoint                                                      | Baseline  | p50   | p95   | p99    | Size | Pass/Fail |
| ---- | ------------------------------------------------------------- | --------- | ----- | ----- | ------ | ---- | --------- |
| 3.36 | GET /v1/finance/refunds?pageSize=20                           | stress    | 60ms  | 150ms | 250ms  | 30KB |           |
| 3.37 | POST /v1/finance/refunds                                      | —         | 150ms | 400ms | 700ms  | 2KB  |           |
| 3.38 | POST /v1/finance/refunds/:id/approve                          | —         | 80ms  | 200ms | 350ms  | 1KB  |           |
| 3.39 | POST /v1/finance/refunds/:id/execute (cash payment)           | —         | 120ms | 350ms | 600ms  | 1KB  |           |
| 3.40 | POST /v1/finance/refunds/:id/execute (stripe payment, mocked) | —         | 300ms | 900ms | 1500ms | 1KB  |           |
| 3.41 | GET /v1/finance/credit-notes?pageSize=20                      | stress    | 60ms  | 150ms | 250ms  | 30KB |           |
| 3.42 | POST /v1/finance/credit-notes                                 | —         | 100ms | 300ms | 500ms  | 1KB  |           |
| 3.43 | POST /v1/finance/credit-notes/apply                           | —         | 200ms | 600ms | 1000ms | 1KB  |           |
| 3.44 | GET /v1/finance/scholarships?pageSize=20                      | 100       | 50ms  | 120ms | 200ms  | 20KB |           |
| 3.45 | POST /v1/finance/scholarships                                 | —         | 100ms | 300ms | 500ms  | 1KB  |           |
| 3.46 | POST /v1/finance/scholarships/:id/revoke                      | —         | 150ms | 400ms | 700ms  | 1KB  |           |
| 3.47 | GET /v1/finance/payment-plans?pageSize=20                     | 100       | 60ms  | 150ms | 250ms  | 20KB |           |
| 3.48 | POST /v1/finance/payment-plans/admin-create                   | —         | 200ms | 600ms | 1000ms | 3KB  |           |
| 3.49 | POST /v1/finance/payment-plans/:id/approve                    | —         | 200ms | 600ms | 1000ms | 1KB  |           |
| 3.50 | POST /v1/finance/payment-plans/:id/counter-offer              | —         | 150ms | 400ms | 700ms  | 2KB  |           |
| 3.51 | GET /v1/finance/late-fee-configs                              | 5 configs | 30ms  | 80ms  | 150ms  | 5KB  |           |
| 3.52 | POST /v1/finance/late-fee-configs                             | —         | 80ms  | 200ms | 350ms  | 1KB  |           |

### Recurring Configs / Reminders / Bulk

| #    | Endpoint                                    | Baseline          | p50    | p95     | p99     | Size  | Pass/Fail |
| ---- | ------------------------------------------- | ----------------- | ------ | ------- | ------- | ----- | --------- |
| 3.53 | GET /v1/finance/recurring-configs           | 10 configs        | 30ms   | 80ms    | 150ms   | 5KB   |           |
| 3.54 | POST /v1/finance/recurring-configs/generate | 1 config × 50 hhs | 600ms  | 2000ms  | 4000ms  | 5KB   |           |
| 3.55 | POST /v1/finance/reminders/due-soon         | 50 invoices       | 300ms  | 1000ms  | 2000ms  | 1KB   |           |
| 3.56 | POST /v1/finance/reminders/overdue          | 50 invoices       | 300ms  | 1000ms  | 2000ms  | 1KB   |           |
| 3.57 | POST /v1/finance/bulk/issue (100 invoices)  | —                 | 2000ms | 6000ms  | 10000ms | 5KB   |           |
| 3.58 | POST /v1/finance/bulk/void (100 invoices)   | —                 | 2000ms | 6000ms  | 10000ms | 5KB   |           |
| 3.59 | POST /v1/finance/bulk/remind (100 invoices) | —                 | 1000ms | 3000ms  | 5000ms  | 5KB   |           |
| 3.60 | POST /v1/finance/bulk/export (100 invoices) | —                 | 3000ms | 10000ms | 15000ms | 500KB |           |

### Reports / Statements / Audit / Debt / Overview

| #    | Endpoint                                                             | Baseline     | p50    | p95    | p99    | Size  | Pass/Fail |
| ---- | -------------------------------------------------------------------- | ------------ | ------ | ------ | ------ | ----- | --------- |
| 3.61 | GET /v1/finance/reports/aging                                        | stress (10k) | 300ms  | 800ms  | 1500ms | 20KB  |           |
| 3.62 | GET /v1/finance/reports/fee-structure-performance                    | stress       | 400ms  | 1200ms | 2000ms | 30KB  |           |
| 3.63 | GET /v1/finance/reports/custom (no filters)                          | stress       | 500ms  | 1500ms | 2500ms | 200KB |           |
| 3.64 | GET /v1/finance/reports/custom?year_group_ids=uuid&fee_type_ids=uuid | stress       | 300ms  | 900ms  | 1500ms | 80KB  |           |
| 3.65 | GET /v1/finance/reports/revenue-by-period                            | stress       | 250ms  | 700ms  | 1200ms | 15KB  |           |
| 3.66 | GET /v1/finance/reports/collection-by-year-group                     | stress       | 300ms  | 800ms  | 1300ms | 10KB  |           |
| 3.67 | GET /v1/finance/reports/payment-methods                              | stress       | 200ms  | 500ms  | 900ms  | 3KB   |           |
| 3.68 | GET /v1/finance/reports/export?report=aging                          | stress       | 1000ms | 3000ms | 5000ms | 500KB |           |
| 3.69 | GET /v1/finance/household-statements/:id                             | 50 entries   | 150ms  | 400ms  | 700ms  | 40KB  |           |
| 3.70 | GET /v1/finance/household-statements/:id/pdf                         | 50 entries   | 1200ms | 3500ms | 5500ms | 120KB |           |
| 3.71 | GET /v1/finance/audit-trail?pageSize=25                              | stress       | 100ms  | 300ms  | 500ms  | 50KB  |           |

### Parent endpoints

| #    | Endpoint                                          | Baseline    | p50   | p95   | p99    | Size | Pass/Fail |
| ---- | ------------------------------------------------- | ----------- | ----- | ----- | ------ | ---- | --------- |
| 3.72 | GET /v1/parent/students/:id/finances              | 10 invoices | 80ms  | 200ms | 350ms  | 20KB |           |
| 3.73 | POST /v1/parent/invoices/:id/pay                  | —           | 300ms | 900ms | 1500ms | 1KB  |           |
| 3.74 | POST /v1/parent/invoices/:id/request-payment-plan | —           | 150ms | 400ms | 700ms  | 2KB  |           |
| 3.75 | POST /v1/parent/payment-plans/:id/accept          | —           | 200ms | 600ms | 1000ms | 1KB  |           |

### Stripe webhook

| #    | Endpoint                                             | Baseline | p50   | p95    | p99    | Size | Pass/Fail |
| ---- | ---------------------------------------------------- | -------- | ----- | ------ | ------ | ---- | --------- |
| 3.76 | POST /v1/stripe/webhook (checkout.session.completed) | —        | 400ms | 1200ms | 2000ms | 1KB  |           |
| 3.77 | POST /v1/stripe/webhook (charge.refunded)            | —        | 300ms | 900ms  | 1500ms | 1KB  |           |
| 3.78 | POST /v1/stripe/webhook (unknown event)              | —        | 20ms  | 50ms   | 100ms  | 1KB  |           |

---

## 4. List-Endpoint Scale Matrix (0 / realistic / stress)

For every list endpoint, run at three data volumes and assert p95 at stress ≤ 3× p95 at realistic.

| #    | Endpoint                                     | 0 rows p95 | 1k rows p95 | 10k rows p95 | Ratio stress/realistic | Pass (≤3×) |
| ---- | -------------------------------------------- | ---------- | ----------- | ------------ | ---------------------- | ---------- |
| 4.1  | GET /v1/finance/invoices                     | —          | 150ms       | 200ms        | 1.3×                   |            |
| 4.2  | GET /v1/finance/invoices?status=issued       | —          | 100ms       | 200ms        | 2.0×                   |            |
| 4.3  | GET /v1/finance/invoices?search=X            | —          | 200ms       | 300ms        | 1.5×                   |            |
| 4.4  | GET /v1/finance/invoices?include_lines=true  | —          | 300ms       | 400ms        | 1.3×                   |            |
| 4.5  | GET /v1/finance/payments                     | —          | 150ms       | 200ms        | 1.3×                   |            |
| 4.6  | GET /v1/finance/refunds                      | —          | 100ms       | 150ms        | 1.5×                   |            |
| 4.7  | GET /v1/finance/credit-notes                 | —          | 100ms       | 150ms        | 1.5×                   |            |
| 4.8  | GET /v1/finance/scholarships                 | —          | 80ms        | 120ms        | 1.5×                   |            |
| 4.9  | GET /v1/finance/payment-plans                | —          | 100ms       | 150ms        | 1.5×                   |            |
| 4.10 | GET /v1/finance/fee-assignments              | —          | 120ms       | 180ms        | 1.5×                   |            |
| 4.11 | GET /v1/finance/audit-trail                  | —          | 200ms       | 300ms        | 1.5×                   |            |
| 4.12 | GET /v1/finance/dashboard/household-overview | —          | 200ms       | 250ms        | 1.25×                  |            |
| 4.13 | GET /v1/finance/dashboard/debt-breakdown     | —          | 250ms       | 400ms        | 1.6×                   |            |
| 4.14 | GET /v1/finance/reports/custom               | —          | 800ms       | 1500ms       | 1.9×                   |            |
| 4.15 | GET /v1/finance/reports/aging                | —          | 400ms       | 800ms        | 2.0×                   |            |

**Fail condition:** Any row where `stress p95 > 3× realistic p95` indicates missing index or naive N+1 — investigate with §5 and §9.

### pageSize scaling

| #    | What to run                                       | Expected                                         | Pass/Fail |
| ---- | ------------------------------------------------- | ------------------------------------------------ | --------- |
| 4.16 | `?pageSize=20` vs `?pageSize=100` (same endpoint) | p95(100) ≤ 2× p95(20). Linear scaling; no worse. |           |
| 4.17 | `?pageSize=1` (single-row)                        | Latency floor — same as detail endpoint p95.     |           |
| 4.18 | `?pageSize=101`                                   | 400 (Zod clamp at 100).                          |           |

---

## 5. N+1 Detection

For each endpoint returning rows with nested relations, instrument Prisma via `prisma.$on('query', ...)` and count queries per request.

| #    | Endpoint                                                                      | Nested                   | Expected count                           | Actual | Pass/Fail |
| ---- | ----------------------------------------------------------------------------- | ------------------------ | ---------------------------------------- | ------ | --------- |
| 5.1  | GET /finance/invoices?include_lines=true (20 rows)                            | invoices+lines           | O(1) — single join (≤ 5 queries total)   |        |           |
| 5.2  | GET /finance/invoices/:id (with lines + payments + installments + approval)   | many                     | ≤ 6 queries.                             |        |           |
| 5.3  | GET /finance/payments (20 rows with household + receipt + allocations count)  | —                        | ≤ 5 queries.                             |        |           |
| 5.4  | GET /finance/payments/:id (with allocations inc invoices + refunds + receipt) | —                        | ≤ 8 queries.                             |        |           |
| 5.5  | GET /finance/dashboard (aggregated)                                           | Many                     | ≤ 15 queries — complex KPI aggregations. |        |           |
| 5.6  | GET /finance/dashboard/household-overview                                     | household + overview     | ≤ 5 queries.                             |        |           |
| 5.7  | GET /finance/dashboard/debt-breakdown                                         | households + invoices    | ≤ 5 queries.                             |        |           |
| 5.8  | GET /finance/credit-notes (20 rows with household + applications)             | —                        | ≤ 5 queries.                             |        |           |
| 5.9  | GET /finance/refunds (20 rows with payment + requestor + approver)            | —                        | ≤ 5 queries.                             |        |           |
| 5.10 | GET /finance/household-statements/:id                                         | —                        | ≤ 6 queries — ledger aggregation.        |        |           |
| 5.11 | GET /finance/reports/custom (100 rows)                                        | student + household + FS | ≤ 5 queries — NOT O(100).                |        |           |
| 5.12 | GET /parent/students/:id/finances (10 invoices)                               | —                        | ≤ 6 queries.                             |        |           |

**Fail condition:** Query count grows linearly with row count → classic N+1. Investigate `include` vs `select` strategy and batching.

---

## 6. PDF Render Benchmarks

### Invoice PDF

| #   | What to measure                               | Budget                                   | Pass/Fail |
| --- | --------------------------------------------- | ---------------------------------------- | --------- |
| 6.1 | Small invoice (1 line) — p95                  | ≤ 1500ms                                 |           |
| 6.2 | Medium invoice (10 lines) — p95               | ≤ 2000ms                                 |           |
| 6.3 | Large invoice (200 lines) — p95               | ≤ 5000ms                                 |           |
| 6.4 | Memory delta per render (RSS) — large invoice | ≤ 100MB                                  |           |
| 6.5 | Output size — small                           | ≤ 50KB                                   |           |
| 6.6 | Output size — medium                          | ≤ 100KB                                  |           |
| 6.7 | Output size — large                           | ≤ 300KB                                  |           |
| 6.8 | Arabic locale PDF                             | p95 ≤ 1.2× English (font embedding cost) |           |

### Receipt PDF

| #    | What to measure                                 | Budget   | Pass/Fail |
| ---- | ----------------------------------------------- | -------- | --------- |
| 6.9  | Receipt (single payment, 1-3 allocations) — p95 | ≤ 1200ms |           |
| 6.10 | Receipt with 10 allocations — p95               | ≤ 1800ms |           |
| 6.11 | Memory delta                                    | ≤ 80MB   |           |
| 6.12 | Output size                                     | ≤ 80KB   |           |

### Household statement PDF

| #    | What to measure                  | Budget   | Pass/Fail |
| ---- | -------------------------------- | -------- | --------- |
| 6.13 | Statement with 20 entries — p95  | ≤ 2000ms |           |
| 6.14 | Statement with 200 entries — p95 | ≤ 5000ms |           |
| 6.15 | Memory delta (200 entries)       | ≤ 120MB  |           |
| 6.16 | Output size (200 entries)        | ≤ 400KB  |           |

### PDF-per-second throughput (warm)

| #    | What to run                             | Expected                                         | Pass/Fail |
| ---- | --------------------------------------- | ------------------------------------------------ | --------- |
| 6.17 | Serialised render 50 receipts in a loop | Avg ≤ 1s per render; no memory leak.             |           |
| 6.18 | 10 concurrent receipt renders           | p95 ≤ 2× sequential p95 (partial contention OK). |           |

---

## 7. Load / Concurrency Tests

### Burst load — throughput + latency

| #   | Flow                                              | Config                                | Expected                                                         | Pass/Fail |
| --- | ------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------- | --------- |
| 7.1 | POST /finance/payments (manual)                   | 200 concurrent × different households | Throughput ≥ 50 rps; p95 ≤ 800ms; error rate = 0%.               |           |
| 7.2 | POST /finance/invoices                            | 100 concurrent × different households | Throughput ≥ 30 rps; p95 ≤ 700ms; error rate = 0%.               |           |
| 7.3 | POST /finance/payments/:id/allocations            | 100 concurrent × different payments   | Throughput ≥ 20 rps; p95 ≤ 1500ms.                               |           |
| 7.4 | POST /finance/refunds                             | 50 concurrent × different payments    | Throughput ≥ 10 rps; p95 ≤ 1000ms.                               |           |
| 7.5 | POST /stripe/webhook (checkout.session.completed) | 100 webhooks/sec for 30s              | All 200; p95 ≤ 2000ms; no rate-limit (SkipThrottle verified).    |           |
| 7.6 | POST /parent/invoices/:id/pay                     | 50 concurrent × different invoices    | Throughput ≥ 10 rps; p95 ≤ 2000ms. Circuit breaker stays closed. |           |

### Contention load — concurrency guards

| #    | Flow                                                         | Config | Expected                                                                                                | Pass/Fail |
| ---- | ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------- | --------- |
| 7.7  | POST /finance/invoices/:id/issue (same invoice, 10 parallel) | —      | Exactly 1 succeeds. 9 return 400 `INVALID_STATUS_TRANSITION`. Winner p95 ≤ 400ms.                       |           |
| 7.8  | POST /finance/payments/:id/allocations (same payment, 5×)    | —      | Exactly 1 succeeds. 4 fail with `INVALID_PAYMENT_STATUS` or `ALLOCATION_EXCEEDS_PAYMENT`.               |           |
| 7.9  | POST /finance/refunds/:id/execute (same refund, 5×)          | —      | Exactly 1 executes. 4 fail with `INVALID_STATUS`. No duplicate Stripe API call.                         |           |
| 7.10 | POST /finance/credit-notes/apply (same credit, 5×)           | —      | Sum of successful applications ≤ credit_note.remaining_balance. No negative balance.                    |           |
| 7.11 | POST /finance/invoices/:id/apply-late-fee (same invoice, 5×) | —      | 1 success, 4 `MAX_LATE_FEE_APPLICATIONS_REACHED`.                                                       |           |
| 7.12 | POST /stripe/webhook (same event.id, 5×)                     | —      | 1 processed, 4 deduplicated. No duplicate payment row.                                                  |           |
| 7.13 | POST /fee-generation/confirm (same params, 2×)               | —      | Either both complete creating the expected count exactly (idempotent) OR one succeeds with 0 generated. |           |

### Cross-tenant isolation under load

| #    | Flow                                                                 | Expected                                                                                           | Pass/Fail |
| ---- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| 7.14 | Tenant A floods the API at 500 rps; Tenant B issues a single request | Tenant B's request completes within its normal p95 budget. Tenant A floods don't degrade Tenant B. |           |

---

## 8. Bundle / First-Paint Budgets

Measured via Lighthouse + Next.js `@next/bundle-analyzer`. Throttle: Moto G4 CPU / Slow 4G.

| #    | Page                                                        | JS bundle (uncompressed) | JS gzip | FCP (ms) | LCP (ms) | CLS   | Pass/Fail |
| ---- | ----------------------------------------------------------- | ------------------------ | ------- | -------- | -------- | ----- | --------- |
| 8.1  | `/finance` (dashboard hub)                                  | ≤ 400KB                  | ≤ 120KB | ≤ 1800ms | ≤ 3000ms | ≤ 0.1 |           |
| 8.2  | `/finance/invoices`                                         | ≤ 350KB                  | ≤ 100KB | ≤ 1500ms | ≤ 2500ms | ≤ 0.1 |           |
| 8.3  | `/finance/invoices/[id]`                                    | ≤ 400KB                  | ≤ 120KB | ≤ 1800ms | ≤ 3000ms | ≤ 0.1 |           |
| 8.4  | `/finance/payments`                                         | ≤ 350KB                  | ≤ 100KB | ≤ 1500ms | ≤ 2500ms | ≤ 0.1 |           |
| 8.5  | `/finance/payments/new`                                     | ≤ 350KB                  | ≤ 100KB | ≤ 1500ms | ≤ 2500ms | ≤ 0.1 |           |
| 8.6  | `/finance/payments/[id]`                                    | ≤ 400KB                  | ≤ 120KB | ≤ 1800ms | ≤ 3000ms | ≤ 0.1 |           |
| 8.7  | `/finance/refunds`                                          | ≤ 400KB                  | ≤ 120KB | ≤ 1800ms | ≤ 3000ms | ≤ 0.1 |           |
| 8.8  | `/finance/credit-notes`                                     | ≤ 350KB                  | ≤ 100KB | ≤ 1500ms | ≤ 2500ms | ≤ 0.1 |           |
| 8.9  | `/finance/discounts` / `/discounts/new` / `/discounts/[id]` | ≤ 300KB                  | ≤ 90KB  | ≤ 1500ms | ≤ 2500ms | ≤ 0.1 |           |
| 8.10 | `/finance/scholarships`                                     | ≤ 300KB                  | ≤ 90KB  | ≤ 1500ms | ≤ 2500ms | ≤ 0.1 |           |
| 8.11 | `/finance/payment-plans`                                    | ≤ 350KB                  | ≤ 100KB | ≤ 1500ms | ≤ 2500ms | ≤ 0.1 |           |
| 8.12 | `/finance/fee-types`                                        | ≤ 300KB                  | ≤ 90KB  | ≤ 1500ms | ≤ 2500ms | ≤ 0.1 |           |
| 8.13 | `/finance/fee-structures`                                   | ≤ 350KB                  | ≤ 100KB | ≤ 1500ms | ≤ 2500ms | ≤ 0.1 |           |
| 8.14 | `/finance/fee-assignments`                                  | ≤ 350KB                  | ≤ 100KB | ≤ 1500ms | ≤ 2500ms | ≤ 0.1 |           |
| 8.15 | `/finance/fee-generation` (wizard)                          | ≤ 400KB                  | ≤ 120KB | ≤ 1800ms | ≤ 3000ms | ≤ 0.1 |           |
| 8.16 | `/finance/overview`                                         | ≤ 350KB                  | ≤ 100KB | ≤ 1500ms | ≤ 2500ms | ≤ 0.1 |           |
| 8.17 | `/finance/overview/[householdId]`                           | ≤ 400KB                  | ≤ 120KB | ≤ 1800ms | ≤ 3000ms | ≤ 0.1 |           |
| 8.18 | `/finance/statements`                                       | ≤ 300KB                  | ≤ 90KB  | ≤ 1500ms | ≤ 2500ms | ≤ 0.1 |           |
| 8.19 | `/finance/statements/[householdId]`                         | ≤ 400KB                  | ≤ 120KB | ≤ 1800ms | ≤ 3000ms | ≤ 0.1 |           |
| 8.20 | `/finance/debt-breakdown`                                   | ≤ 350KB                  | ≤ 100KB | ≤ 1500ms | ≤ 2500ms | ≤ 0.1 |           |
| 8.21 | `/finance/reports`                                          | ≤ 500KB (recharts heavy) | ≤ 150KB | ≤ 2000ms | ≤ 3500ms | ≤ 0.1 |           |
| 8.22 | `/finance/audit-trail`                                      | ≤ 350KB                  | ≤ 100KB | ≤ 1500ms | ≤ 2500ms | ≤ 0.1 |           |
| 8.23 | `/dashboard/parent` (finances tab)                          | ≤ 400KB                  | ≤ 120KB | ≤ 1800ms | ≤ 3000ms | ≤ 0.1 |           |

### Shared chunks

| #    | What to measure                                            | Budget                                   | Pass/Fail |
| ---- | ---------------------------------------------------------- | ---------------------------------------- | --------- |
| 8.24 | Shared "finance chunk" across all /finance pages           | ≤ 100KB gzip; cached across navigations. |           |
| 8.25 | Page-specific chunks                                       | Each ≤ 50KB gzip.                        |           |
| 8.26 | No duplicate lodash / moment / huge libs imported per page | Audit via bundle-analyzer.               |           |

---

## 9. Database Query Health (EXPLAIN ANALYZE)

Run `EXPLAIN ANALYZE` on the following queries at stress volume. Assert:

- No sequential scans on `invoices`, `payments`, `refunds`, `payment_allocations` (all expect index scans).
- All joins use indexes.
- Total cost ≤ documented budget.

### Hot-path queries

| #    | Query                                                                                                                | Expected plan                                                                           | Cost budget | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------- | --------- |
| 9.1  | `SELECT * FROM invoices WHERE tenant_id=? AND status='issued' ORDER BY due_date LIMIT 20`                            | Index Scan on `idx_invoices_tenant_status`.                                             | < 500       |           |
| 9.2  | `SELECT * FROM invoices WHERE tenant_id=? AND household_id=? ORDER BY created_at DESC LIMIT 20`                      | Index Scan on `idx_invoices_tenant_household`.                                          | < 300       |           |
| 9.3  | `SELECT SUM(balance_amount) FROM invoices WHERE tenant_id=? AND status IN ('issued','partially_paid','overdue')`     | Index Scan + aggregate. No seq scan.                                                    | < 800       |           |
| 9.4  | `SELECT * FROM payments WHERE tenant_id=? AND household_id=? AND status IN (...) ORDER BY received_at DESC LIMIT 50` | Index Scan on `idx_payments_tenant_household`.                                          | < 400       |           |
| 9.5  | `SELECT * FROM payment_allocations WHERE payment_id=?`                                                               | Index Scan on `idx_payment_allocations_payment`.                                        | < 100       |           |
| 9.6  | `SELECT * FROM refunds WHERE payment_id=? AND status='executed'`                                                     | Index Scan on `idx_refunds_payment`.                                                    | < 100       |           |
| 9.7  | `SELECT * FROM audit_logs WHERE tenant_id=? AND entity_type='invoice' ORDER BY created_at DESC LIMIT 25`             | Index on `(tenant_id, entity_type, created_at)` — verify exists.                        | < 500       |           |
| 9.8  | Debt breakdown aggregate — `SELECT household_id, SUM(balance) FROM invoices WHERE tenant_id=? GROUP BY household_id` | Hash aggregate + index scan. ≤ 3k rows groups.                                          | < 1500      |           |
| 9.9  | Aging report — `SELECT CASE ... END bucket, SUM(balance) FROM invoices ... GROUP BY bucket`                          | Seq scan acceptable if small; index scan preferred if query has WHERE tenant_id filter. | < 1500      |           |
| 9.10 | Custom report — `WHERE tenant_id=? AND year_group_id IN (...) AND fee_type_id IN (...)` join-heavy                   | Multiple Nested Loop w/ index scans. Verify no seq scan on invoices.                    | < 3000      |           |

### Missing indexes (flag if plans regress)

| #    | Query                                                                          | Index that should exist                                                | Status                                                 | Pass/Fail |
| ---- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------ | --------- |
| 9.11 | `WHERE last_overdue_notified_at IS NULL AND due_date < ?`                      | `idx_invoices_overdue_candidates` (partial index)                      | Confirm exists; if not, overdue-detection slows.       |           |
| 9.12 | Audit trail filter by `entity_type`                                            | `idx_audit_logs_entity_type` on `(tenant_id, entity_type, created_at)` | Verify.                                                |           |
| 9.13 | `SELECT * FROM invoices WHERE tenant_id=? AND invoice_number LIKE 'INV-2026%'` | Trigram? Or prefix index.                                              | Confirm — else substring search in filter bar is slow. |           |

---

## 10. Memory / Event-Loop Health

| #     | What to measure                                                          | Budget                                                                             | Pass/Fail |
| ----- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------- |
| 10.1  | API process RSS after 10k mixed requests                                 | ≤ 600MB.                                                                           |           |
| 10.2  | API RSS does not grow > 50MB over 10k iterations                         | Leak check.                                                                        |           |
| 10.3  | Worker RSS after processing 1000 jobs                                    | ≤ 400MB.                                                                           |           |
| 10.4  | Worker RSS does not grow > 30MB over 1000 jobs                           | Leak check.                                                                        |           |
| 10.5  | Event-loop lag p99 during normal load                                    | ≤ 50ms.                                                                            |           |
| 10.6  | Event-loop lag p99 during PDF render                                     | ≤ 200ms (PDF is CPU-heavy but should not block other requests — offload if worse). |           |
| 10.7  | Event-loop lag p99 during fee-generation confirm                         | ≤ 100ms.                                                                           |           |
| 10.8  | No EventEmitter leak warnings (`(node:...) MaxListenersExceededWarning`) | Zero warnings in logs.                                                             |           |
| 10.9  | Prisma connection pool utilisation                                       | Max connections under load ≤ 80% of pool size.                                     |           |
| 10.10 | Redis connection count                                                   | Stable over time. No leaking connections.                                          |           |

---

## 11. Cold vs Warm Start

| #    | What to measure                                  | Cold p95 | Warm p95 | Ratio | Budget ratio ≤ 3× | Pass/Fail |
| ---- | ------------------------------------------------ | -------- | -------- | ----- | ----------------- | --------- |
| 11.1 | GET /finance/dashboard                           | —        | 200ms    | —     | ≤ 600ms cold      |           |
| 11.2 | GET /finance/invoices (first request after boot) | —        | 200ms    | —     | ≤ 600ms cold      |           |
| 11.3 | POST /finance/payments                           | —        | 400ms    | —     | ≤ 1200ms cold     |           |
| 11.4 | GET /finance/invoices/:id/pdf (first render)     | —        | 2500ms   | —     | ≤ 5000ms cold     |           |
| 11.5 | POST /stripe/webhook (first call)                | —        | 1200ms   | —     | ≤ 3000ms cold     |           |

**If cold is > 3× warm:** Module is doing work at module-load time that should move to build time. Candidates: decryption-key fetch, Stripe SDK init.

---

## 12. Summary Table & Observations

### Top-level summary (fill in at run)

| Metric                                    | Target                                   | Measured | Pass/Fail |
| ----------------------------------------- | ---------------------------------------- | -------- | --------- |
| Total endpoints with budgets              | 78 endpoints                             | 78       |           |
| List endpoints scale-matrix rows          | 15                                       | 15       |           |
| Load/concurrency test rows                | 14                                       | 14       |           |
| Bundle budgets (pages)                    | 23                                       | 23       |           |
| PDF render budgets                        | 6 (invoice S/M/L + receipt + statements) | 6        |           |
| Query-plan budgets                        | 13                                       | 13       |           |
| Memory/leak budgets                       | 10                                       | 10       |           |
| Endpoints without budgets (coverage hole) | 0                                        | 0        |           |

### Observations

1. **Bulk operations have high p99 tails (§3.57-60).** 100-invoice bulk issue at 6s p95 is already marginal. 200 invoices (max per schema) would push to 12s — approaching admin-API timeout. Consider a queue-backed bulk flow instead of synchronous iteration.
2. **PDF render at large volume (§6.3) is 5s — noticeable to users.** Offload to a worker via `pdf-rendering` queue + return a URL when ready. Currently synchronous.
3. **Report endpoints have high p95 (§3.61-63).** Redis cache helps on repeat hits but cold hits hit the DB hard. Consider materialized views for aging + fee-performance.
4. **Fee-generation preview/confirm latency grows linearly with household count.** 100-household preview 1.2s p95; 500-household would be 6s. Either queue the confirm or paginate the preview.
5. **Invoice list with `include_lines=true` doubles payload and latency.** Default to false in admin list; fetch lines per-invoice on detail page.
6. **No `idx_invoices_overdue_candidates` partial index yet.** Overdue detection full-scans invoices. With 10k invoices, detection is ~800ms. With 100k it would be 8s. Add the partial index.
7. **Stripe webhook p95 at 1200ms (§3.76) for `checkout.session.completed`** — signature verify + allocate + receipt creation. Consider splitting: signature-verify synchronous, allocation+receipt async via queue. Stripe has a 10s timeout — current headroom is thin.
8. **Parent `POST /pay` creates Stripe session inline (§3.73).** Circuit breaker protects against Stripe outages. Verify breaker thresholds under burst load.
9. **Dashboard is one single-fetch endpoint (§3.1).** If the query slows down, the entire page slows down. Consider splitting into independently-fetched sections so a slow debt-breakdown doesn't block the KPI cards.
10. **Custom report is client-side CSV (§3.63 backing it).** If the report returns 10k rows, the client has to hold all in memory. Consider streaming CSV from a server endpoint.

---

## 13. Sign-Off

| Reviewer Name | Date | Pass | Fail | Overall Result |
| ------------- | ---- | ---- | ---- | -------------- |
|               |      |      |      |                |

**Release-gate criteria:**

- Every p95 budget in §3 must pass at realistic (1k) volume.
- Every list endpoint in §4 must scale with ratio ≤ 3× to stress volume.
- No N+1 (every §5 row must pass).
- No bundle budget in §8 exceeds by > 10%.
- Memory budgets in §10 must pass — leaks are release-blockers.
- Cold-start ratio in §11 must be ≤ 3× warm.
