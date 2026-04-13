# Report Cards — Performance Test Specification

**Module:** Report Cards + Report Comments
**Spec type:** Performance / Scale / Load
**Target audience:** Performance engineers (k6, Artillery, Lighthouse, Web Vitals)
**Last updated:** 2026-04-12
**Status:** Draft — budgets set; execution pending perf tenant provisioning

---

## 1. Purpose & How to Execute

This document defines measurable performance budgets for every page, API endpoint, worker job, and background flow in the Report Cards module. Each test row sets a concrete budget (p50 / p95 / p99, LCP / FCP / TTI, query counts, memory) that is verifiable by a single tool invocation.

### How to execute

| Test type                | Tool                          | Example invocation                                                    |
| ------------------------ | ----------------------------- | --------------------------------------------------------------------- |
| API load (sustained RPS) | k6                            | `k6 run --vus=50 --duration=2m scripts/report-cards-list.js`          |
| API burst (spike)        | k6                            | `k6 run --stages=30s:200vus,1m:200vus,30s:0 scripts/enqueue-burst.js` |
| Multi-scenario soak      | Artillery                     | `artillery run --output soak.json soak.yml`                           |
| Page load (synthetic)    | Lighthouse CI                 | `lhci autorun --collect.url=https://perf.edupod.app/en/report-cards`  |
| Field-quality Web Vitals | `web-vitals` JS lib + PostHog | instrumented in prod; scrape last 7d                                  |
| SQL query shape          | `EXPLAIN ANALYZE`             | `EXPLAIN (ANALYZE, BUFFERS) SELECT ...` against perf DB snapshot      |
| Memory/CPU               | Docker stats + pprof          | `docker stats worker-node` over 24h                                   |

### Entry gates

- Perf tenant seeded per Section 2 before any run.
- Production parity: same Postgres version (16.x), same Redis (7.x), same node size (4 vCPU / 8 GB for api; 2 vCPU / 4 GB for worker).
- Traffic origin: dedicated load-gen node on same VPC as targets — do NOT run from a laptop over the public internet; tail latency will dominate.
- Warm-up: every test first runs a 30s warm-up phase at 10% of target RPS to prime caches and JIT.

### Pass/fail policy

- A row PASSES when the measured value is ≤ the budget column across a 5-minute sustained window.
- p99 is allowed to spike to 2× the p95 budget for ≤5% of the window.
- Any row that FAILs blocks the module release gate — no waivers without a written remediation plan in `docs/governance/recovery-backlog.md`.

---

## 2. Test Infrastructure

Perf tenant (`perf-rc.edupod.app`) is seeded by the `scripts/seed-perf-report-cards.ts` script. All numbers below are baseline — scale matrices (Sections 14-18) override these.

| Entity                               | Count  | Notes                                                  |
| ------------------------------------ | ------ | ------------------------------------------------------ |
| Students                             | 500    | Spread across 20 classes, 25/class average             |
| Classes                              | 20     | Mix of grades 1-12                                     |
| Sections per class                   | 1-2    | ~30 sections total                                     |
| Teachers                             | 40     | ~2 per class average                                   |
| Subjects                             | 10     | Per class, 8-12 subject assignments each               |
| Academic periods                     | 3      | Current term, previous term, previous year             |
| Existing report cards                | 10,000 | Spread across periods and statuses                     |
| Existing report card generation runs | 200    | Mix of completed / failed / in_progress                |
| Comment windows                      | 30     | Open / closed / upcoming                               |
| Comment drafts                       | 15,000 | 30 students × 10 subjects × 50 active authors          |
| Approval requests                    | 300    | Pending / approved / rejected                          |
| PDFs in S3                           | 10,000 | Pre-rendered baseline for signed URL latency tests     |
| Verification tokens                  | 5,000  | 50% active, 50% expired                                |
| Templates                            | 15     | Varied complexity — single-page through 4-page layouts |

Prisma connection pool: 20 connections per API node; 10 per worker node. PgBouncer transaction mode is REQUIRED (matches prod).

Redis: single node, no cluster (matches prod). BullMQ `report-cards` queue with default concurrency 4.

---

## 3. Cold vs Warm Start Measurement

Every API and page budget is split into COLD and WARM to surface cache warmth effects.

| Term | Definition                                                                                                                                                       | Use                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| COLD | First request after fresh container deploy (`pm2 restart` or `kubectl rollout restart`) — Prisma pool empty, no Redis cache, no JIT data, no Next.js route cache | Shows worst-case production deploy |
| WARM | 10th consecutive hit of the same endpoint/page from the same client in a loop                                                                                    | Shows steady-state for real users  |

Cold runs execute once per test deploy. Warm runs loop 50× and the p95 of iterations 10-50 is reported.

Cold budgets are explicitly separate from warm budgets (see matrices below). Failing cold is a yellow flag; failing warm is a red flag.

---

## 4. Endpoint Budget Matrix

| #    | Endpoint                                                       | Scenario                 | Budget (p50 / p95 / p99) | Timeout @ load | Measurement                  |
| ---- | -------------------------------------------------------------- | ------------------------ | ------------------------ | -------------- | ---------------------------- |
| 4.1  | GET `/v1/report-cards` (list, page=1, pageSize=20)             | Warm, 50 VUs, 1m         | 60 / 200 / 400 ms        | 2000 ms        | `k6 run list-warm.js`        |
| 4.2  | GET `/v1/report-cards`                                         | Cold, first hit          | 300 / 500 / 900 ms       | 2000 ms        | k6 single-iter after restart |
| 4.3  | GET `/v1/report-cards/:id`                                     | Warm, 100 VUs, 1m        | 30 / 100 / 200 ms        | 1500 ms        | k6 by id                     |
| 4.4  | POST `/v1/report-cards/generate`                               | Enqueue-only, 50 VUs, 1m | 100 / 300 / 600 ms       | 3000 ms        | k6 burst                     |
| 4.5  | GET `/v1/report-cards/generation-runs`                         | Warm, 30 VUs, 1m         | 80 / 200 / 400 ms        | 2000 ms        | k6                           |
| 4.6  | GET `/v1/report-cards/library` (10k rows filter=class)         | Warm, 30 VUs, 1m         | 120 / 300 / 600 ms       | 3000 ms        | k6                           |
| 4.7  | GET `/v1/report-cards/library/grouped`                         | Warm, 20 VUs, 1m         | 150 / 400 / 800 ms       | 3000 ms        | k6                           |
| 4.8  | GET `/v1/report-cards/library/bundle-pdf` (100 cards)          | Single run               | ≤ 30 s end-to-end        | 60 s           | k6 long-poll + S3 stream     |
| 4.9  | GET `/v1/report-cards/classes/:classId/matrix` (30×10)         | Warm, 30 VUs, 1m         | 100 / 250 / 500 ms       | 2500 ms        | k6                           |
| 4.10 | POST `/v1/report-cards/:id/publish`                            | Warm, 20 VUs, 1m         | 60 / 150 / 300 ms        | 2000 ms        | k6                           |
| 4.11 | POST `/v1/report-cards/:id/revise`                             | Warm, 20 VUs, 1m         | 120 / 300 / 600 ms       | 3000 ms        | k6                           |
| 4.12 | POST `/v1/report-cards/bulk-delete` (100 ids)                  | Single call              | ≤ 500 ms                 | 5000 ms        | Postman / k6                 |
| 4.13 | GET `/v1/report-cards/:id/pdf` — first render                  | Cold PDF                 | ≤ 5 s                    | 10 s           | curl + time                  |
| 4.14 | GET `/v1/report-cards/:id/pdf` — subsequent                    | Warm S3 signed URL       | 100 / 500 / 1000 ms      | 2000 ms        | k6                           |
| 4.15 | GET `/v1/report-cards/analytics/dashboard`                     | Warm, 20 VUs, 1m         | 150 / 400 / 800 ms       | 3000 ms        | k6                           |
| 4.16 | GET `/v1/report-cards/analytics/class-comparison` (50 classes) | Warm, 10 VUs, 1m         | 250 / 600 / 1200 ms      | 4000 ms        | k6                           |
| 4.17 | POST `/v1/report-cards/templates/convert-from-image`           | Cold AI call             | ≤ 8 s                    | 15 s           | Manual + trace               |
| 4.18 | POST `/v1/report-cards/approvals/bulk-approve` (50 ids)        | Single call              | ≤ 500 ms                 | 5000 ms        | k6                           |
| 4.19 | POST `/v1/report-cards/bulk/generate`                          | Enqueue, 20 VUs, 1m      | 100 / 300 / 600 ms       | 3000 ms        | k6                           |
| 4.20 | POST `/v1/report-cards/bulk/publish` (100 ids)                 | Single call              | ≤ 500 ms                 | 5000 ms        | k6                           |
| 4.21 | POST `/v1/report-cards/bulk/deliver`                           | Enqueue, 10 VUs, 1m      | 100 / 300 / 600 ms       | 3000 ms        | k6                           |
| 4.22 | GET `/v1/report-cards/students/:id/transcript` — cold          | First call               | ≤ 5 s                    | 10 s           | curl + time                  |
| 4.23 | GET `/v1/report-cards/students/:id/transcript` — warm          | 10 VUs, 1m               | 200 / 1000 / 2000 ms     | 5000 ms        | k6                           |
| 4.24 | POST `/v1/report-cards/:id/verification-token`                 | Warm, 30 VUs, 1m         | 30 / 100 / 200 ms        | 1000 ms        | k6                           |
| 4.25 | GET `/v1/verify/:token` (public, CDN)                          | 200 RPS                  | 40 / 200 / 400 ms        | 1500 ms        | k6 w/ CDN headers            |
| 4.26 | GET `/v1/report-card-overall-comments`                         | Warm, 50 VUs, 1m         | 60 / 200 / 400 ms        | 2000 ms        | k6                           |
| 4.27 | POST `/v1/report-card-overall-comments` (upsert)               | 100 VUs autosave, 1m     | 50 / 150 / 300 ms        | 2000 ms        | k6 autosave sim              |
| 4.28 | PATCH `/v1/report-card-overall-comments/:id/finalise`          | Warm, 20 VUs, 1m         | 30 / 100 / 200 ms        | 1500 ms        | k6                           |
| 4.29 | GET `/v1/report-card-subject-comments`                         | Warm, 30 VUs, 1m         | 80 / 250 / 500 ms        | 2500 ms        | k6                           |
| 4.30 | POST `/v1/report-card-subject-comments/:id/ai-draft`           | Single call              | ≤ 8 s                    | 20 s           | k6 w/ extended timeout       |
| 4.31 | GET `/v1/report-card-teacher-requests`                         | Warm, 20 VUs, 1m         | 70 / 200 / 400 ms        | 2000 ms        | k6                           |
| 4.32 | POST `/v1/report-card-teacher-requests/:id/approve`            | Warm, 10 VUs, 1m         | 120 / 300 / 600 ms       | 3000 ms        | k6                           |
| 4.33 | GET `/v1/report-comment-windows/landing`                       | Warm, 40 VUs, 1m         | 80 / 250 / 500 ms        | 2500 ms        | k6                           |
| 4.34 | GET `/v1/report-card-tenant-settings`                          | Warm, 20 VUs, 1m         | 30 / 100 / 200 ms        | 1500 ms        | k6                           |
| 4.35 | POST `/v1/report-card-tenant-settings/principal-signature`     | Single upload 500KB      | ≤ 2 s                    | 8 s            | curl + time                  |

**Row count: 35 API endpoint rows. Every endpoint from the inventory has a budget assigned. Endpoints-without-budgets count: 0.**

---

## 5. Page Budget Matrix

LCP = Largest Contentful Paint. FCP = First Contentful Paint. TTI = Time to Interactive. SI = Speed Index. All via Lighthouse CLI running from a perf runner box on the same continent as the target.

Throttling profile: Lighthouse default "Simulated" (4× CPU slowdown, Slow 4G) unless marked "Fast" (no throttling).

| #    | Page                                                  | Scenario        | LCP                       | FCP       | TTI       | SI     | Measurement                                 |
| ---- | ----------------------------------------------------- | --------------- | ------------------------- | --------- | --------- | ------ | ------------------------------------------- |
| 5.1  | `/en/report-cards`                                    | Cold, Simulated | ≤ 1500 ms                 | ≤ 900 ms  | ≤ 2500 ms | ≤ 2000 | `lhci --url=.../report-cards`               |
| 5.2  | `/en/report-cards`                                    | Warm (10th hit) | ≤ 800 ms                  | ≤ 500 ms  | ≤ 1500 ms | ≤ 1200 | Lighthouse repeat-view                      |
| 5.3  | `/en/report-cards/[classId]` (30 students)            | Cold            | ≤ 1800 ms                 | ≤ 1000 ms | ≤ 2800 ms | ≤ 2400 | Lighthouse                                  |
| 5.4  | `/en/report-cards/[classId]`                          | Warm            | ≤ 1000 ms                 | ≤ 600 ms  | ≤ 1800 ms | ≤ 1500 | Lighthouse                                  |
| 5.5  | `/en/report-cards/settings`                           | Cold            | ≤ 1200 ms                 | ≤ 800 ms  | ≤ 2000 ms | ≤ 1800 | Lighthouse                                  |
| 5.6  | `/en/report-cards/settings`                           | Warm            | ≤ 700 ms                  | ≤ 450 ms  | ≤ 1200 ms | ≤ 1000 | Lighthouse                                  |
| 5.7  | `/en/report-cards/generate`                           | Cold            | ≤ 1000 ms                 | ≤ 700 ms  | ≤ 1800 ms | ≤ 1500 | Lighthouse                                  |
| 5.8  | `/en/report-cards/generate` — polling roundtrip       | Active run      | ≤ 500 ms per poll         | —         | —         | —      | Chrome DevTools network trace               |
| 5.9  | `/en/report-cards/library` (100 cards, page=1)        | Cold            | ≤ 2000 ms                 | ≤ 1100 ms | ≤ 3200 ms | ≤ 2800 | Lighthouse                                  |
| 5.10 | `/en/report-cards/library`                            | Warm            | ≤ 1200 ms                 | ≤ 700 ms  | ≤ 2000 ms | ≤ 1600 | Lighthouse                                  |
| 5.11 | `/en/report-cards/library` — page 2 navigation        | Warm            | ≤ 600 ms total round-trip | —         | —         | —      | Synthetic click + wait                      |
| 5.12 | `/en/report-cards/analytics` (50 classes)             | Cold            | ≤ 2500 ms                 | ≤ 1300 ms | ≤ 3800 ms | ≤ 3200 | Lighthouse                                  |
| 5.13 | `/en/report-cards/analytics`                          | Warm            | ≤ 1500 ms                 | ≤ 800 ms  | ≤ 2400 ms | ≤ 2000 | Lighthouse                                  |
| 5.14 | `/en/report-cards/requests`                           | Cold            | ≤ 1500 ms                 | ≤ 900 ms  | ≤ 2500 ms | ≤ 2000 | Lighthouse                                  |
| 5.15 | `/en/report-cards/requests`                           | Warm            | ≤ 900 ms                  | ≤ 550 ms  | ≤ 1600 ms | ≤ 1300 | Lighthouse                                  |
| 5.16 | `/en/report-comments`                                 | Cold            | ≤ 1500 ms                 | ≤ 900 ms  | ≤ 2400 ms | ≤ 2000 | Lighthouse                                  |
| 5.17 | `/en/report-comments`                                 | Warm            | ≤ 900 ms                  | ≤ 550 ms  | ≤ 1500 ms | ≤ 1250 | Lighthouse                                  |
| 5.18 | `/en/report-comments/overall/[classId]` (30 students) | Cold            | ≤ 1500 ms                 | ≤ 900 ms  | ≤ 2500 ms | ≤ 2100 | Lighthouse                                  |
| 5.19 | `/en/report-comments/overall/[classId]`               | Warm            | ≤ 900 ms                  | ≤ 550 ms  | ≤ 1600 ms | ≤ 1300 | Lighthouse                                  |
| 5.20 | `/en/report-comments/subject/[classId]/[subjectId]`   | Cold            | ≤ 1500 ms                 | ≤ 900 ms  | ≤ 2500 ms | ≤ 2100 | Lighthouse                                  |
| 5.21 | `/en/report-comments/subject/[classId]/[subjectId]`   | Warm            | ≤ 900 ms                  | ≤ 550 ms  | ≤ 1600 ms | ≤ 1300 | Lighthouse                                  |
| 5.22 | `/ar/report-cards` (RTL mirror of 5.1)                | Cold            | ≤ 1550 ms                 | ≤ 950 ms  | ≤ 2600 ms | ≤ 2100 | Lighthouse — must not exceed English by >5% |
| 5.23 | `/ar/report-cards/[classId]`                          | Warm            | ≤ 1050 ms                 | ≤ 650 ms  | ≤ 1900 ms | ≤ 1550 | Lighthouse                                  |
| 5.24 | `/ar/report-cards/analytics`                          | Warm            | ≤ 1550 ms                 | ≤ 850 ms  | ≤ 2500 ms | ≤ 2050 | Lighthouse                                  |
| 5.25 | Parent portal — card view (mobile, 375px)             | Warm            | ≤ 2000 ms                 | ≤ 1100 ms | ≤ 3000 ms | ≤ 2600 | Lighthouse mobile preset                    |
| 5.26 | Teacher — overall editor (mobile)                     | Warm            | ≤ 1500 ms                 | ≤ 850 ms  | ≤ 2400 ms | ≤ 2000 | Lighthouse mobile                           |
| 5.27 | `/en/report-cards/generate` wizard step transitions   | Click-to-paint  | ≤ 200 ms per step         | —         | —         | —      | CDP trace                                   |
| 5.28 | Library filter change (class dropdown)                | Interaction     | ≤ 300 ms INP              | —         | —         | —      | Web Vitals INP                              |
| 5.29 | Matrix cell click to detail panel                     | Interaction     | ≤ 150 ms                  | —         | —         | —      | DevTools timeline                           |
| 5.30 | Public verify landing `/en/verify/[token]`            | Cold            | ≤ 1200 ms                 | ≤ 700 ms  | ≤ 2000 ms | ≤ 1600 | Lighthouse                                  |

**Row count: 30 page budget rows.**

---

## 6. Network Payload Budget

Each route's initial bundle (HTML + JS + CSS shipped on first navigation, gzipped) must stay under budget. Code-split async chunks are listed explicitly; any new chunk needs a budget entry.

| #    | Route                                               | Initial gz budget | Expected async chunks                                | Measurement            |
| ---- | --------------------------------------------------- | ----------------- | ---------------------------------------------------- | ---------------------- |
| 6.1  | `/en/report-cards` (dashboard)                      | ≤ 250 KB          | `charts-recharts`, `summary-cards`                   | Chrome coverage report |
| 6.2  | `/en/report-cards/[classId]`                        | ≤ 280 KB          | `matrix-grid`, `cell-editor`                         | Webpack analyzer       |
| 6.3  | `/en/report-cards/settings`                         | ≤ 220 KB          | `file-upload`, `signature-picker`                    | Webpack analyzer       |
| 6.4  | `/en/report-cards/generate`                         | ≤ 200 KB          | `wizard-steps`, `period-picker`                      | Webpack analyzer       |
| 6.5  | `/en/report-cards/library`                          | ≤ 300 KB          | `virtual-list`, `filter-drawer`, `bulk-actions`      | Webpack analyzer       |
| 6.6  | `/en/report-cards/analytics`                        | ≤ 320 KB          | `charts-recharts`, `heatmap`, `comparison-bar`       | Webpack analyzer       |
| 6.7  | `/en/report-cards/requests`                         | ≤ 230 KB          | `request-detail-drawer`                              | Webpack analyzer       |
| 6.8  | `/en/report-comments` landing                       | ≤ 220 KB          | `window-cards`, `countdown`                          | Webpack analyzer       |
| 6.9  | `/en/report-comments/overall/[classId]`             | ≤ 280 KB          | `comment-editor-tiptap`, `ai-suggest`                | Webpack analyzer       |
| 6.10 | `/en/report-comments/subject/[classId]/[subjectId]` | ≤ 290 KB          | `comment-editor-tiptap`, `ai-suggest`, `subject-nav` | Webpack analyzer       |
| 6.11 | Public `/en/verify/[token]`                         | ≤ 120 KB          | (no async)                                           | Webpack analyzer       |
| 6.12 | Shared vendor chunk (react, react-dom, next)        | ≤ 180 KB          | —                                                    | Webpack analyzer       |
| 6.13 | TipTap editor (shared across comment pages)         | ≤ 90 KB gz        | Loaded once, cached                                  | Webpack analyzer       |
| 6.14 | Recharts (shared across dashboard + analytics)      | ≤ 85 KB gz        | Loaded once                                          | Webpack analyzer       |

**Pass gate:** `npx next build` followed by `@next/bundle-analyzer` — any chunk exceeding budget by >10% fails. Enforce via CI step `bundle-budget-check`.

---

## 7. Data Fetch Waterfall — Dashboard

Expected API calls on first paint of `/en/report-cards`. Any additional call is an N+1 regression.

| #   | Call                                                      | Parallel or sequential | Budget | Notes                       |
| --- | --------------------------------------------------------- | ---------------------- | ------ | --------------------------- |
| 7.1 | GET `/v1/auth/session`                                    | First                  | 50 ms  | Sent once, cached in memory |
| 7.2 | GET `/v1/report-cards/analytics/dashboard`                | Parallel with 7.3, 7.4 | 400 ms | Summary counters            |
| 7.3 | GET `/v1/report-cards?pageSize=5&sort=created_desc`       | Parallel               | 200 ms | Recent runs preview         |
| 7.4 | GET `/v1/report-cards/generation-runs?status=in_progress` | Parallel               | 200 ms | Live runs strip             |
| 7.5 | GET `/v1/report-comment-windows/landing`                  | Parallel               | 250 ms | Teacher-facing only         |

**Rule:** Total wall-clock for first paint ≤ max(400 ms) + render. No sequential fan-out. The dashboard MUST NOT call `/v1/report-cards/:id` per row — use embedded summary fields.

**Measurement:** Chrome DevTools Network panel, filter XHR, record 1 full load, assert no more than 5 calls in the waterfall, all starting within 50 ms of each other.

---

## 8. Data Fetch Waterfall — Library

Library paginates. Initial render must NOT fetch all pages.

| #   | Call                                                                | When                      | Budget |
| --- | ------------------------------------------------------------------- | ------------------------- | ------ |
| 8.1 | GET `/v1/report-cards/library?page=1&pageSize=50&sort=updated_desc` | Initial                   | 300 ms |
| 8.2 | GET `/v1/report-cards/library/grouped?groupBy=class`                | If "grouped" view default | 400 ms |
| 8.3 | GET `/v1/report-cards/tenant-settings`                              | Initial (cached 5m)       | 100 ms |
| 8.4 | GET `/v1/report-cards/analytics/dashboard` (counts only)            | Initial                   | 400 ms |

**Forbidden:** initial render MUST NOT call any per-card endpoint. Opening a row triggers GET `/v1/report-cards/:id` on demand.

**Pagination:** clicking "next" triggers ONE GET with `page=2`. Prefetch page 2 is optional and must not fire until page 1 scroll > 70%.

**Measurement:** load `/en/report-cards/library`, assert exactly 4 XHR on initial paint, then click page 2 and assert exactly 1 additional XHR.

---

## 9. Data Fetch Waterfall — Analytics

Analytics aggregations are SERVER-COMPUTED. Client must not sum or group across 10k rows.

| #   | Call                                                          | Response shape                          | Budget |
| --- | ------------------------------------------------------------- | --------------------------------------- | ------ |
| 9.1 | GET `/v1/report-cards/analytics/dashboard`                    | Pre-aggregated counters                 | 400 ms |
| 9.2 | GET `/v1/report-cards/analytics/class-comparison?period_id=X` | Array of {class_id, avg, median, count} | 600 ms |
| 9.3 | GET `/v1/report-cards/analytics/distribution?class_id=Y`      | Histogram bins                          | 500 ms |

**Forbidden:** calling `/v1/report-cards?pageSize=10000` to aggregate in the browser. This is a lint-enforced failure — PR blocker.

**Backend requirement:** each analytics query is a single SQL with `GROUP BY`, `COUNT`, `AVG`. No round-trips.

**Measurement:** load analytics page, network panel should show 3 XHR max. Check `response.data.length` — it should be the aggregate count (e.g. 50 classes), not 10,000 rows.

---

## 10. N+1 Query Detection — Report Card List

`GET /v1/report-cards?pageSize=20` must return with FEW queries. Each card has a student, period, and template — these MUST be JOINed or batch-fetched.

| #    | Expected query                                                                             | Purpose                       | Index                             |
| ---- | ------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------- |
| 10.1 | `SELECT * FROM report_cards WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 20 OFFSET 0` | Main list                     | `idx_report_cards_tenant_created` |
| 10.2 | `SELECT COUNT(*) FROM report_cards WHERE tenant_id=$1`                                     | Pagination total (cached 30s) | `idx_report_cards_tenant`         |
| 10.3 | `SELECT * FROM students WHERE id IN (...)`                                                 | Batch student fetch           | PK                                |
| 10.4 | `SELECT * FROM academic_periods WHERE id IN (...)`                                         | Batch period fetch            | PK                                |

**Budget: ≤ 4 SQL queries for a list of 20 cards.**

**Forbidden:** `SELECT * FROM students WHERE id = X` in a loop. `SELECT * FROM report_card_templates WHERE id = X` per card.

**Measurement:** enable `log_statement=all` on perf Postgres for 30 s, hit the endpoint, grep log for queries containing `report_cards`/`students`/`templates`. Count must be ≤ 4.

Alternative: use `pg_stat_statements` and check calls delta for that window.

---

## 11. N+1 Query Detection — Matrix

`GET /v1/report-cards/classes/:classId/matrix` for a 30-student × 10-subject class.

| #    | Expected query                                                                                                            | Budget           |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 11.1 | `SELECT rc.*, s.name FROM report_cards rc JOIN students s ON rc.student_id=s.id WHERE rc.class_id=$1 AND rc.period_id=$2` | 1 query          |
| 11.2 | `SELECT * FROM report_card_subject_scores WHERE report_card_id IN (...)`                                                  | 1 query, batched |

**Budget: 1-2 queries total for the entire 30×10 grid.**

**Forbidden:** a query per student. A query per subject. A query per (student, subject) cell (that would be 300 queries).

**Measurement:** EXPLAIN ANALYZE the matrix controller path with query logging; assert exactly 1 or 2 SELECT statements.

---

## 12. N+1 Query Detection — Analytics

`GET /v1/report-cards/analytics/class-comparison` for a tenant with 50 classes.

| #    | Expected query                                                                                                                                           | Budget  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 12.1 | `SELECT class_id, AVG(overall_percentage), COUNT(*), STDDEV(overall_percentage) FROM report_cards WHERE tenant_id=$1 AND period_id=$2 GROUP BY class_id` | 1 query |

**Budget: 1 query. Period.**

**Forbidden:** looping over classes in Node and calling `AVG` per class.

**Measurement:** EXPLAIN ANALYZE the query. Must use `GroupAggregate` plan node, not nested loops.

---

## 13. Slow Queries — Index Coverage

Every query must hit an index. EXPLAIN ANALYZE must show `Index Scan` or `Index Only Scan`, not `Seq Scan`, for tables with >1k rows.

| #     | Query                                          | Expected plan       | Index used                                      |
| ----- | ---------------------------------------------- | ------------------- | ----------------------------------------------- |
| 13.1  | List by tenant + created_at                    | Index Scan          | `idx_report_cards_tenant_created`               |
| 13.2  | List by class_id + period_id                   | Index Scan          | `idx_report_cards_class_period`                 |
| 13.3  | Library by status + updated_at                 | Index Scan          | `idx_report_cards_tenant_status_updated`        |
| 13.4  | Matrix by class_id                             | Index Scan          | `idx_report_cards_class_period`                 |
| 13.5  | Student transcript by student_id               | Index Scan          | `idx_report_cards_student`                      |
| 13.6  | Generation runs by status                      | Index Scan          | `idx_report_card_generation_runs_tenant_status` |
| 13.7  | Comment lookup by report_card_id               | Index Scan          | `idx_report_card_overall_comments_card`         |
| 13.8  | Subject comment by report_card_id + subject_id | Index Scan          | `idx_subject_comments_card_subject`             |
| 13.9  | Verification by token                          | Index Scan (unique) | `idx_verification_tokens_token`                 |
| 13.10 | Approval by request_id + status                | Index Scan          | `idx_approvals_request_status`                  |
| 13.11 | Teacher request by tenant + status             | Index Scan          | `idx_teacher_requests_tenant_status`            |
| 13.12 | Comment window by tenant + status + end_at     | Index Scan          | `idx_windows_tenant_status_end`                 |

**Measurement:** for each query in the list, run `EXPLAIN (ANALYZE, BUFFERS) <query>` against the 10k-card tenant. Assert no `Seq Scan`, `Rows Removed by Filter` < 1000, and Total Execution Time < 50 ms for paginated queries.

**Pass gate:** all 12 rows PASS. Any `Seq Scan` on a >1k table = red flag, add an index, re-run.

---

## 14. Scale Matrix — 1k report cards (baseline)

Baseline tenant: 100 students, 5 classes, 2 periods, 1,000 cards. Confirms the module works at a small school.

| #    | Test                                          | Budget                   | Measurement  |
| ---- | --------------------------------------------- | ------------------------ | ------------ |
| 14.1 | Library list p95                              | ≤ 150 ms                 | k6 50 VUs 1m |
| 14.2 | Analytics dashboard p95                       | ≤ 250 ms                 | k6 20 VUs 1m |
| 14.3 | Matrix load p95 (5 classes, 20 students each) | ≤ 200 ms                 | k6           |
| 14.4 | Bulk publish 50 cards                         | ≤ 300 ms                 | Single call  |
| 14.5 | Transcript (20 cards)                         | ≤ 2 s cold / 500 ms warm | Single call  |

---

## 15. Scale Matrix — 10k report cards

Realistic mid-size school. Matches the default perf tenant.

| #    | Test                                    | Budget   | Measurement  |
| ---- | --------------------------------------- | -------- | ------------ |
| 15.1 | Library list page 1 p95                 | ≤ 300 ms | k6 30 VUs 1m |
| 15.2 | Library list page 100 p95 (offset 4950) | ≤ 500 ms | k6           |
| 15.3 | Filter by status + class + period p95   | ≤ 350 ms | k6           |
| 15.4 | Analytics dashboard p95                 | ≤ 400 ms | k6           |
| 15.5 | Class comparison (20 classes) p95       | ≤ 500 ms | k6           |
| 15.6 | Bulk delete 100 ids                     | ≤ 500 ms | Single call  |
| 15.7 | Bulk publish 100 ids                    | ≤ 500 ms | Single call  |

---

## 16. Scale Matrix — 100k report cards

Large multi-campus school scenario OR multi-year archive. Library must still be usable.

| #    | Test                                  | Budget                        | Measurement      |
| ---- | ------------------------------------- | ----------------------------- | ---------------- |
| 16.1 | Library page 1 p95                    | ≤ 500 ms                      | k6               |
| 16.2 | Library page 1000 (offset 49,950) p95 | ≤ 2 s (known offset weakness) | k6               |
| 16.3 | Cursor pagination p95 (RECOMMENDED)   | ≤ 500 ms at any depth         | k6 cursor script |
| 16.4 | Analytics dashboard p95               | ≤ 700 ms                      | k6               |
| 16.5 | Class comparison (50 classes) p95     | ≤ 1 s                         | k6               |
| 16.6 | Student transcript 200 cards          | ≤ 5 s cold / 1 s warm         | Single call      |
| 16.7 | Bundle PDF — 500 cards                | ≤ 2 min                       | Background       |

**Action item:** if offset pagination (16.2) fails, implement keyset/cursor pagination on the library endpoint. Row 16.3 defines the acceptable alternative.

---

## 17. Scale Matrix — 500 concurrent teachers editing comments

Autosave under real concurrency. Each teacher is editing a different `(report_card_id, subject_id)` row.

| #    | Test                                                      | Budget                                                  | Measurement               |
| ---- | --------------------------------------------------------- | ------------------------------------------------------- | ------------------------- |
| 17.1 | POST `/v1/report-card-overall-comments` (upsert) autosave | 500 VUs, 0.5 req/s each (debounced) → 250 RPS sustained | k6                        |
| 17.2 | Throughput — successful upserts per second                | ≥ 250 RPS sustained                                     | k6 checks                 |
| 17.3 | p95 autosave latency                                      | ≤ 200 ms                                                | k6                        |
| 17.4 | Error rate                                                | < 0.1%                                                  | k6 error rate             |
| 17.5 | Postgres deadlocks (pg_stat_database)                     | 0                                                       | Postgres pg_stat_database |
| 17.6 | Connection pool saturation (PgBouncer)                    | < 80% peak                                              | PgBouncer SHOW POOLS      |
| 17.7 | Redis ops/s (if autosave touches cache)                   | < 1k ops/s                                              | INFO stats                |

**Failure signal:** if deadlocks > 0, investigate row locking strategy. Upsert on `(report_card_id, subject_id)` must use `ON CONFLICT DO UPDATE`, not `SELECT FOR UPDATE` + `UPDATE`.

---

## 18. Scale Matrix — 20 concurrent generation runs

20 admins enqueue "generate all cards for class" simultaneously. PDF rendering is CPU-bound.

| #    | Test                 | Budget                                                             | Measurement         |
| ---- | -------------------- | ------------------------------------------------------------------ | ------------------- |
| 18.1 | Enqueue 20 runs      | All accepted in ≤ 3 s                                              | k6 parallel         |
| 18.2 | Worker concurrency   | 4 workers default, tunable                                         | Config check        |
| 18.3 | All 20 runs complete | ≤ 10 min wall-clock (assuming 4 workers × 5 jobs each × ~30s each) | Redis monitoring    |
| 18.4 | Worker memory peak   | ≤ 1.5 GB per worker (Puppeteer overhead)                           | Docker stats        |
| 18.5 | Worker CPU peak      | ≤ 100% per worker (one full core)                                  | Docker stats        |
| 18.6 | Failed jobs          | 0                                                                  | BullMQ failed queue |
| 18.7 | Stalled jobs         | 0                                                                  | BullMQ              |

**Capacity planning:** if tenant volume grows, scale workers horizontally. One worker pod handles ~2 runs/minute at current PDF sizes.

---

## 19. Load Matrix — Dashboard under 100 RPS

Simulates peak report-card-season traffic on the dashboard.

| #    | Test                        | Budget                          | Measurement                |
| ---- | --------------------------- | ------------------------------- | -------------------------- |
| 19.1 | 100 RPS sustained for 5 min | p95 ≤ 500 ms, error rate < 0.5% | k6 --rps=100 --duration=5m |
| 19.2 | API CPU at 100 RPS          | < 70% average                   | Grafana                    |
| 19.3 | Database CPU                | < 50% average                   | pg_stat_activity + OS      |
| 19.4 | No request queuing > 100 ms | p99 ≤ 1 s                       | k6                         |
| 19.5 | Memory steady               | < 1 GB per API node             | Docker stats               |

---

## 20. Load Matrix — Generation enqueue burst 50 RPS

Admin kicks off bulk generation from the library.

| #    | Test                                      | Budget                                            | Measurement    |
| ---- | ----------------------------------------- | ------------------------------------------------- | -------------- |
| 20.1 | 50 RPS burst for 30 s (1,500 enqueues)    | All 1,500 accepted                                | k6             |
| 20.2 | Enqueue p95                               | ≤ 400 ms                                          | k6             |
| 20.3 | BullMQ adds rate                          | 50 jobs/s sustained                               | Redis monitor  |
| 20.4 | Zero dropped jobs                         | `failedCount == 0`, `waiting == 1500 - completed` | BullMQ inspect |
| 20.5 | `batch_jobs` row creation scales linearly | 1 INSERT per enqueue                              | Postgres log   |
| 20.6 | Redis memory bump                         | < 50 MB for 1500 queued jobs                      | Redis INFO     |

---

## 21. Load Matrix — PDF download 20 RPS

Parent traffic during report-card release.

| #    | Test                                   | Budget                                | Measurement        |
| ---- | -------------------------------------- | ------------------------------------- | ------------------ |
| 21.1 | 20 RPS sustained for 2 min, warm cards | p95 ≤ 500 ms                          | k6                 |
| 21.2 | Cache-miss fallback render             | p95 ≤ 6 s (includes Puppeteer render) | k6 w/ cache-bust   |
| 21.3 | S3 signed-URL latency                  | p95 ≤ 150 ms                          | CloudFront metrics |
| 21.4 | API CPU                                | < 30% (most work in S3)               | Grafana            |
| 21.5 | Puppeteer worker CPU on miss           | Scales to renderer pool, not API      | Worker metrics     |

---

## 22. Load Matrix — Public `/verify/:token` 200 RPS

Public verification page is CDN-cacheable. High hit rate is the key metric.

| #    | Test                    | Budget                         | Measurement                    |
| ---- | ----------------------- | ------------------------------ | ------------------------------ |
| 22.1 | 200 RPS for 2 min       | p95 ≤ 300 ms                   | k6                             |
| 22.2 | CDN cache hit rate      | ≥ 90%                          | CloudFront hit-ratio dashboard |
| 22.3 | Origin RPS (after CDN)  | ≤ 20 RPS                       | API access log                 |
| 22.4 | Cache TTL               | ≥ 5 min (tokens are immutable) | `Cache-Control` header check   |
| 22.5 | Cache-miss p95 (origin) | ≤ 200 ms                       | k6 with `Pragma: no-cache`     |

**Pass gate:** CDN cache hit rate ≥ 90% is the primary metric. Without it, origin will melt under 200 RPS.

---

## 23. Contention — Two admins generate same class

Race: admin A and admin B both click "generate all" for `class_id=X` in the same 500 ms window.

| #    | Test                                                        | Expected behaviour                                              | Budget                                 |
| ---- | ----------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------- |
| 23.1 | 2 parallel POST `/v1/report-cards/bulk/generate` same class | First succeeds (202 + run_id), second gets 409 or queues behind | Either outcome acceptable; no deadlock |
| 23.2 | Postgres deadlock count                                     | 0                                                               | pg_stat_database                       |
| 23.3 | Worker duplicate PDF generation                             | 0 duplicates in S3                                              | List s3 objects with class_id prefix   |
| 23.4 | `report_card_generation_runs` row count for the race        | ≤ 2 (not more)                                                  | SELECT count                           |

**Remediation if 23.3 fails:** add a unique constraint on `(class_id, period_id, status='in_progress')` partial index.

---

## 24. Contention — Bulk-delete + concurrent publish

Admin deletes 100 cards while another admin publishes cards in the same class.

| #    | Test                                                          | Expected                                     | Budget                      |
| ---- | ------------------------------------------------------------- | -------------------------------------------- | --------------------------- |
| 24.1 | Parallel bulk-delete (100) + bulk-publish (100) on same class | Both complete OR one errors cleanly          | No deadlock                 |
| 24.2 | Postgres deadlock count                                       | 0                                            | pg_stat_database            |
| 24.3 | Row lock wait events                                          | p99 < 500 ms                                 | `pg_stat_activity` sampling |
| 24.4 | Final state consistency                                       | No card in both deleted and published states | SQL verification            |

**Remediation if deadlocks:** order locks consistently. Always lock `report_cards` before `report_card_approvals`, never the reverse.

---

## 25. Contention — Autosave debounce under rapid typing

Teacher types 10 keystrokes/s into the comment editor. Autosave must debounce.

| #    | Test                                                       | Expected                                                | Budget                   |
| ---- | ---------------------------------------------------------- | ------------------------------------------------------- | ------------------------ |
| 25.1 | Simulated typing 10 keystrokes/s for 10 s (100 keystrokes) | ≤ 20 POST `/v1/.../comments` requests (debounced ~2 Hz) | Playwright + network log |
| 25.2 | Final comment content matches last keystroke               | 100% match                                              | DOM vs DB diff           |
| 25.3 | Server p95 under debounced autosave                        | ≤ 200 ms                                                | k6 autosave sim          |
| 25.4 | No duplicate rows                                          | Upsert dedupes on `(report_card_id, subject_id)`        | SELECT count check       |

**Debounce budget:** autosave fires at ≤ 2 Hz per row. If it fires more, it is a client bug.

---

## 26. PDF Render Performance — Single card

| #    | Test                                            | Budget             | Measurement    |
| ---- | ----------------------------------------------- | ------------------ | -------------- |
| 26.1 | Single card render — warm Puppeteer             | ≤ 1 s              | Worker timer   |
| 26.2 | Single card render — cold Puppeteer (first job) | ≤ 5 s              | Worker timer   |
| 26.3 | Rendering failure rate                          | < 0.1%             | Worker logs    |
| 26.4 | Output PDF size                                 | 100-500 KB typical | S3 object size |
| 26.5 | Puppeteer launch time (browser startup)         | ≤ 3 s              | Worker logs    |

**Warm strategy:** Puppeteer browser instance is kept alive in the worker process. Pool size = 2 browsers per worker.

---

## 27. PDF Render Performance — Bundle (100 cards)

Admin downloads "All cards for class" as a merged PDF.

| #    | Test                       | Budget                              | Measurement              |
| ---- | -------------------------- | ----------------------------------- | ------------------------ |
| 27.1 | 100-card bundle end-to-end | ≤ 30 s                              | Timer, start-to-complete |
| 27.2 | Parallel render phase      | ≤ 20 s (using 4 concurrent renders) | Worker logs              |
| 27.3 | PDF concat phase           | ≤ 5 s                               | Worker logs              |
| 27.4 | S3 upload of final bundle  | ≤ 3 s for 20 MB bundle              | S3 API timer             |
| 27.5 | Memory peak during bundle  | ≤ 2 GB worker process               | Docker stats             |
| 27.6 | Bundle failure rate        | < 0.5%                              | Worker logs              |

---

## 28. PDF Render Performance — Arabic/RTL

Arabic cards must NOT be dramatically slower than English. RTL layout, Arabic fonts, and number shaping add some cost but >20% overrun is unacceptable.

| #    | Test                        | Budget                                 | Measurement          |
| ---- | --------------------------- | -------------------------------------- | -------------------- |
| 28.1 | Arabic single-card render   | ≤ 1.2 × English time (so ≤ 1.2 s warm) | Worker timer         |
| 28.2 | Arabic bundle 100 cards     | ≤ 36 s (1.2 × 30 s)                    | Worker timer         |
| 28.3 | Arabic font subset size     | < 200 KB                               | Font file inspection |
| 28.4 | Glyph rendering correctness | Visual diff vs baseline                | Pixelmatch           |

**Fail if:** Arabic time > 1.2 × English. Root causes to check: font subsetting, Harfbuzz shaping, emoji font fallback.

---

## 29. Cold Start — First request after deployment

Fresh container, no caches.

| #    | Test                                   | Budget                                 | Measurement                          |
| ---- | -------------------------------------- | -------------------------------------- | ------------------------------------ |
| 29.1 | NestJS module init time                | ≤ 1.5 s                                | App log timestamps                   |
| 29.2 | Prisma connection pool warm            | ≤ 500 ms (10 connections)              | Prisma logs                          |
| 29.3 | First `/healthz` response              | ≤ 200 ms (no DB)                       | curl + time                          |
| 29.4 | First authenticated `/v1/report-cards` | ≤ 800 ms (module + pool + RLS + query) | curl + time                          |
| 29.5 | Total container-start-to-ready         | ≤ 8 s                                  | Kubernetes readiness probe timestamp |

**Pass gate:** rolling deploys stay invisible to users. A slow cold start cascades into 502s behind a load balancer.

---

## 30. Memory Budget — Worker container

Worker runs Puppeteer + NestJS. Steady-state memory must stay flat over 24 h — no leaks.

| #    | Test                                 | Budget                  | Measurement                      |
| ---- | ------------------------------------ | ----------------------- | -------------------------------- |
| 30.1 | Idle memory (no jobs)                | ≤ 300 MB                | Docker stats                     |
| 30.2 | Active (4 concurrent PDF jobs)       | ≤ 1.5 GB                | Docker stats                     |
| 30.3 | Post-burst return to idle            | ≤ 500 MB within 5 min   | Docker stats                     |
| 30.4 | 24 h soak with 1 job/min             | Steady-state flat ± 10% | Grafana memory panel             |
| 30.5 | Heap snapshot before/after 1000 jobs | Growth < 50 MB          | Node --inspect + Chrome DevTools |
| 30.6 | Browser instances not leaked         | Pool size constant      | Puppeteer page count check       |

**Failure:** if memory grows linearly with job count, it's a leak — likely unclosed Puppeteer pages. Remediation: assert `browser.pages().length <= 3` after every job.

---

## 31. CPU Budget — PDF rendering processor

Puppeteer is CPU-bound. We budget ONE full CPU core per rendering job.

| #    | Test                          | Budget                      | Measurement  |
| ---- | ----------------------------- | --------------------------- | ------------ |
| 31.1 | CPU per job (during render)   | ≤ 100% of one core          | Docker stats |
| 31.2 | CPU idle between jobs         | < 5%                        | Docker stats |
| 31.3 | Worker with 4 concurrent jobs | ≤ 400% (4 cores fully used) | Docker stats |
| 31.4 | API CPU during render burst   | Unaffected (< 30%)          | Grafana      |

**Capacity planning:** worker pod sized at 4 vCPU handles exactly 4 concurrent PDF jobs. Any more and jobs queue on CPU.

---

## 32. Background Job Latency — Enqueue to start

Time from API accepting the enqueue to worker picking up the job.

| #    | Test                                             | Budget                              | Measurement                                        |
| ---- | ------------------------------------------------ | ----------------------------------- | -------------------------------------------------- |
| 32.1 | Idle queue — enqueue-to-pickup                   | ≤ 200 ms                            | Custom timer, `job.timestamp` to `job.processedOn` |
| 32.2 | 100 jobs in queue                                | ≤ 500 ms pickup after enqueue       | Same                                               |
| 32.3 | 1000 jobs in queue                               | ≤ 5 s pickup                        | Same                                               |
| 32.4 | Worker at saturation (4 in progress + 10 queued) | ≤ 30 s pickup (jobs take ~30s each) | Same                                               |

**Pass gate:** user-visible "queued" status lasts < 1 s under normal load.

---

## 33. Background Job Throughput — Generation

Sustained generation throughput.

| #    | Test                                         | Budget                                 | Measurement       |
| ---- | -------------------------------------------- | -------------------------------------- | ----------------- |
| 33.1 | Single worker throughput                     | ≥ 2 reports/min (30 s each)            | Worker metrics    |
| 33.2 | 4-worker fleet throughput                    | ≥ 8 reports/min                        | Worker metrics    |
| 33.3 | Burst — 100 cards enqueued                   | Complete ≤ 13 min (4 workers × 2/min)  | End-to-end timer  |
| 33.4 | Sustained — tenant generates 100 reports/min | Matches fleet size (needs ~50 workers) | Capacity plan doc |
| 33.5 | Redis queue size does not grow unbounded     | Queue depth < 1000 steady state        | BullMQ inspect    |

**Scaling note:** if tenants demand > 8 reports/min sustained, scale worker pod count horizontally. Cost projection goes in capacity plan.

---

## 34. Bundle Size — Per-route budgets

Next.js `next build` output per route. Hard limits; CI fails on exceedance.

| #     | Route                                               | First Load JS | Route JS   | Measurement         |
| ----- | --------------------------------------------------- | ------------- | ---------- | ------------------- |
| 34.1  | `/en/report-cards`                                  | ≤ 250 KB gz   | ≤ 50 KB gz | `next build` output |
| 34.2  | `/en/report-cards/[classId]`                        | ≤ 280 KB gz   | ≤ 60 KB gz | Build output        |
| 34.3  | `/en/report-cards/settings`                         | ≤ 220 KB gz   | ≤ 40 KB gz | Build output        |
| 34.4  | `/en/report-cards/generate`                         | ≤ 200 KB gz   | ≤ 35 KB gz | Build output        |
| 34.5  | `/en/report-cards/library`                          | ≤ 300 KB gz   | ≤ 70 KB gz | Build output        |
| 34.6  | `/en/report-cards/analytics`                        | ≤ 320 KB gz   | ≤ 80 KB gz | Build output        |
| 34.7  | `/en/report-cards/requests`                         | ≤ 230 KB gz   | ≤ 50 KB gz | Build output        |
| 34.8  | `/en/report-comments`                               | ≤ 220 KB gz   | ≤ 45 KB gz | Build output        |
| 34.9  | `/en/report-comments/overall/[classId]`             | ≤ 280 KB gz   | ≤ 60 KB gz | Build output        |
| 34.10 | `/en/report-comments/subject/[classId]/[subjectId]` | ≤ 290 KB gz   | ≤ 65 KB gz | Build output        |
| 34.11 | Public `/en/verify/[token]`                         | ≤ 120 KB gz   | ≤ 15 KB gz | Build output        |

**CI enforcement:** `.github/workflows/bundle-budget.yml` fails the build if any route exceeds its budget by >10%.

---

## 35. Lighthouse Scores — Per route

Run Lighthouse CI on every listed route, both en and ar. All targets must PASS.

| #     | Route                                               | Performance   | Best Practices | Accessibility | SEO  |
| ----- | --------------------------------------------------- | ------------- | -------------- | ------------- | ---- |
| 35.1  | `/en/report-cards`                                  | ≥ 85          | ≥ 90           | ≥ 90          | ≥ 90 |
| 35.2  | `/en/report-cards/[classId]`                        | ≥ 85          | ≥ 90           | ≥ 90          | ≥ 90 |
| 35.3  | `/en/report-cards/settings`                         | ≥ 85          | ≥ 90           | ≥ 90          | ≥ 90 |
| 35.4  | `/en/report-cards/generate`                         | ≥ 85          | ≥ 90           | ≥ 90          | ≥ 90 |
| 35.5  | `/en/report-cards/library`                          | ≥ 85          | ≥ 90           | ≥ 90          | ≥ 90 |
| 35.6  | `/en/report-cards/analytics`                        | ≥ 80 (charts) | ≥ 90           | ≥ 90          | ≥ 90 |
| 35.7  | `/en/report-cards/requests`                         | ≥ 85          | ≥ 90           | ≥ 90          | ≥ 90 |
| 35.8  | `/en/report-comments`                               | ≥ 85          | ≥ 90           | ≥ 90          | ≥ 90 |
| 35.9  | `/en/report-comments/overall/[classId]`             | ≥ 85          | ≥ 90           | ≥ 95          | ≥ 90 |
| 35.10 | `/en/report-comments/subject/[classId]/[subjectId]` | ≥ 85          | ≥ 90           | ≥ 95          | ≥ 90 |
| 35.11 | `/en/verify/[token]`                                | ≥ 90 (simple) | ≥ 95           | ≥ 95          | ≥ 95 |

**Measurement:** `lhci autorun --collect.numberOfRuns=3 --assert.preset=lighthouse:recommended`.

---

## 36. Web Vitals — Field metrics

Field data from real users via `web-vitals` JS library, sampled 10% and shipped to PostHog. Evaluated over a 7-day rolling window.

| #    | Metric                          | Budget       | Routes covered                                             |
| ---- | ------------------------------- | ------------ | ---------------------------------------------------------- |
| 36.1 | LCP (Largest Contentful Paint)  | ≤ 2.5 s p75  | All report-card routes                                     |
| 36.2 | CLS (Cumulative Layout Shift)   | ≤ 0.1 p75    | All routes — zero tolerance for skeleton-to-content jank   |
| 36.3 | INP (Interaction to Next Paint) | ≤ 200 ms p75 | All interactive surfaces (matrix, editor, library filters) |
| 36.4 | FID (First Input Delay, legacy) | ≤ 100 ms p75 | All routes                                                 |
| 36.5 | TTFB (Time to First Byte)       | ≤ 800 ms p75 | All routes                                                 |
| 36.6 | FCP                             | ≤ 1.8 s p75  | All routes                                                 |

**Pass gate:** all Web Vitals green in PostHog dashboard over a 7-day window after deployment.

**Measurement:** `web-vitals` v4 with `onLCP`, `onCLS`, `onINP`, `onFCP`, `onTTFB` — ship to PostHog as events, query via SQL-like interface for p75.

---

## 37. Observations & Gaps Flagged

Concerns identified during spec authoring — each requires a remediation decision before launch.

| #     | Concern                                                     | Risk                                                             | Remediation / Action                                                                    |
| ----- | ----------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 37.1  | Mass-report-card-pdf with 500+ cards may OOM the worker     | High — single tenant with multi-grade bundle could kill pod      | Cap bundle size at 200; for larger, use multi-part zip. Worker memory alert at 1.8 GB.  |
| 37.2  | Auto-generate cron scans all tenants serially               | Medium — unbounded runtime as tenant count grows                 | Parallelise with worker fan-out, cap at N tenants/minute, document in event-job-catalog |
| 37.3  | Library offset pagination degrades at depth (>page 100)     | Medium — 100k-row tenants will hit it                            | Implement cursor pagination (see row 16.3); keep offset for page 1-20 only              |
| 37.4  | Client-side sorting on library when column not indexed      | Low — manifests as frozen UI on 500+ rows                        | Force server-side sort; client sort only within page                                    |
| 37.5  | Arabic PDF font file not subset                             | Medium — adds ~800 KB to every PDF                               | Subset Arabic font to glyphs used; run at build time                                    |
| 37.6  | Puppeteer page leaks under error paths                      | High — latent OOM after weeks of uptime                          | `try/finally` around every page open; assert pool size at end of job                    |
| 37.7  | Verification token CDN cache TTL too short                  | Medium — reduced cache hit ratio at 200 RPS                      | Raise TTL to 1 h (tokens are immutable; revocation flushes CDN via tag)                 |
| 37.8  | Analytics endpoint does `COUNT(*)` on full table every call | Low now, high at scale                                           | Cache counts for 60 s per tenant in Redis                                               |
| 37.9  | No perf regression gate in CI                               | High — silent regressions ship                                   | Add a nightly k6 run in CI against a staging tenant; fail if budgets regress            |
| 37.10 | AI draft latency variance (30.2 below)                      | Medium — OpenAI p99 can be 20 s                                  | Set client-side timeout at 15 s, show progress, retry once                              |
| 37.11 | `report_card_generation_runs` table never archived          | Medium — grows forever                                           | Archive rows > 1 y old to cold storage monthly                                          |
| 37.12 | Autosave upsert count could explode                         | Low — each teacher autosaves ~every 2 s × 500 teachers = 250 RPS | Row 17.1 covers this; debounce client-side ensures ceiling                              |
| 37.13 | Bundle PDF concat uses `pdf-lib` (JS) — CPU heavy           | Medium — slow for 500+ cards                                     | Switch to `pdftk` native binary for bundles > 100 cards                                 |
| 37.14 | No CDN on student transcript PDFs                           | Low — downloads are rare but can spike around term end           | Add CloudFront with 24h TTL, invalidate on revise                                       |
| 37.15 | BullMQ dashboard not restricted in prod                     | Security + perf — public dashboard can enumerate jobs            | Lock behind admin auth; rate-limit /admin/queues                                        |

---

## 38. Sign-Off

This spec is approved for execution once the following sign-offs are collected.

| Role                         | Name  | Date | Signature |
| ---------------------------- | ----- | ---- | --------- |
| Perf lead                    | _tbd_ |      |           |
| Backend tech lead            | _tbd_ |      |           |
| Frontend tech lead           | _tbd_ |      |           |
| SRE / on-call owner          | _tbd_ |      |           |
| Product owner (Report Cards) | _tbd_ |      |           |

**Execution schedule:**

1. Week 1 — perf tenant provisioning + seed script runs clean
2. Week 2 — sections 4-13 (endpoint + page + query budgets)
3. Week 3 — sections 14-22 (scale + load matrices)
4. Week 4 — sections 23-33 (contention + render + worker)
5. Week 5 — sections 34-36 (bundle + Lighthouse + Web Vitals)
6. Week 6 — remediation sprint on any RED rows
7. Final — independent re-audit against section 37

**Release gate:** every numbered row in sections 4-36 must be GREEN. Section 37 items must each have a dated remediation in `docs/governance/recovery-backlog.md`.

**Review cadence after launch:** nightly k6 smoke (subset of 4.x + 5.x); weekly full re-run of sections 14-22; quarterly full-suite re-run.

---

_End of spec — Report Cards performance budgets._
