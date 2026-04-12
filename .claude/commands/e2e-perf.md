You are producing a **performance test specification** for the {MODULE_NAME}
module. This is the latency, throughput, scale, and resource-budget layer
of our spec pack — the things that only surface when the tenant has real
volume, not test fixtures with five records.

═══════════════════════════════════════════════════════════════════════════
WHERE THIS SITS IN THE SPEC PACK
═══════════════════════════════════════════════════════════════════════════

| Command             | Covers                                                                        |
| ------------------- | ----------------------------------------------------------------------------- |
| /E2E                | UI-visible behaviour per role                                                 |
| /e2e-integration    | RLS, webhooks, API contracts, DB invariants, concurrency                      |
| /e2e-worker-test    | BullMQ, cron, async chains                                                    |
| /e2e-perf           | **This command** — latency budgets, load, list scale, PDF timing, bundle size |
| /e2e-security-audit | OWASP + hardening                                                             |
| /e2e-full           | Runs all five                                                                 |

The deliverable is a runnable benchmark spec. Every row is a measurement
with a **numeric budget**: "p95 must be < 300ms at 10k rows" — not "the
page should feel fast." If a reviewer can argue about whether the row
passed, the row is not specific enough.

═══════════════════════════════════════════════════════════════════════════
HARD RULES — NON-NEGOTIABLE
═══════════════════════════════════════════════════════════════════════════

1. DEFINE THE BASELINE ENVIRONMENT. Every performance number is
   meaningless without knowing where it was taken. The spec must
   specify:
   - Hardware (CPU class, memory, disk type — "c5.large EC2", "M3
     Macbook Pro", etc.)
   - Node.js version, Postgres version, Redis version
   - Expected concurrency (how many parallel users the prod tier
     supports)
   - Network location (test client same region as API? different
     continent?)
   - Cold vs warm start state (is the process freshly booted, or
     has it served 1000 requests first?)
     Without this, comparing a run today to a run in six months is
     pointless.

2. NUMERIC BUDGETS PER ENDPOINT. Every GET/POST the module exposes
   gets a perf row specifying:
   - p50 budget (ms)
   - p95 budget (ms)
   - p99 budget (ms)
   - Payload-size budget (bytes)
     Budgets are derived from the product requirement, not from "what
     it happens to be right now". Typical starting points:
   - List endpoints (20 rows): p95 < 200ms
   - Detail endpoints: p95 < 150ms
   - Report endpoints: p95 < 1000ms
   - PDF render: p95 < 3000ms
   - Mutations: p95 < 400ms
     Tune per endpoint based on what the UI flow requires.

3. SCALE TESTS. For every list endpoint, run at three data volumes:
   - Empty (0 rows)
   - Realistic (100-1,000 rows)
   - Stress (10,000+ rows, sometimes 100,000 for reports)
     Assert that p95 at stress volume is **within 3x** of p95 at
     realistic volume — anything worse indicates a missing index or a
     naive N+1. If the endpoint uses pagination, also verify that
     `pageSize=100` vs `pageSize=20` scales linearly, not worse.

4. N+1 DETECTION. For every endpoint that returns rows with nested
   relations (e.g. invoices with household + lines + allocations),
   assert that the query count per request is bounded:
   - Either instrument Prisma to log queries and count them in the
     test harness
   - Or use `prisma.$on('query', ...)` to accumulate a counter
   - Pass criteria: query count is O(1) regardless of row count,
     NOT O(N)
     A row with 50 invoices that makes 50 + 1 = 51 queries is a
     textbook N+1 and must fail this test.

5. PDF RENDER BENCHMARK. For every PDF endpoint:
   - Render an invoice / receipt / statement with the smallest
     realistic payload (1 line) → p95 budget
   - Render with the largest realistic payload (200+ lines) →
     p95 budget (usually 2x-3x the small budget)
   - Memory footprint during render (RSS delta from baseline) <
     budget
   - Output size (bytes) < budget

6. LOAD / CONCURRENCY TESTS. For each critical mutation flow (issue
   invoice, record payment, confirm allocation, execute refund):
   - Burst load: N concurrent requests against N different resources
     → throughput (req/sec), p95 latency, error rate (should be 0%)
   - Contention load: N concurrent requests against 1 resource →
     exactly one succeeds (concurrency guard), N-1 return the
     documented race-loser error. p95 latency for winners < budget.
     Use k6, artillery, or Jest `test.concurrent` — name the tool in
     the spec and include the script (or a pointer to it).

7. BUNDLE / FIRST-PAINT BUDGETS. For every page the module ships:
   - JS bundle size per route (uncompressed + gzipped)
   - First-contentful-paint budget (ms, on a 3G-throttled profile)
   - Largest-contentful-paint budget
   - Cumulative-layout-shift budget
     Measure via Lighthouse, WebPageTest, or the Next.js build-time
     bundle analyzer. Assert hard numbers, not subjective quality.

8. DATABASE QUERY HEALTH. For every service-layer method that issues
   more than one query:
   - Run `EXPLAIN ANALYZE` on each query at stress volume
   - Assert no sequential scans on large tables
   - Assert all joins use indexes
   - Assert query plan cost is below a documented budget
     The spec lists the expected query plan shape in the Expected
     Result column — if the plan regresses to a seq scan, the test
     fails visibly.

9. MEMORY LEAKS. For every long-running process endpoint (worker
   jobs, report generators, bulk exports):
   - Run N iterations
   - Assert RSS does not grow beyond a documented ceiling
   - Assert event-loop lag stays under 50ms p99
     A leak that shows 10MB growth over 100 iterations is unacceptable
     and must fail the test.

10. COLD vs WARM START. For endpoints that are on a hot path:
    - Measure first-request latency after process boot
    - Measure p95 latency after 1000 warm requests
    - Assert cold-start is within 3x of warm
      If cold-start is 10x worse, the module is hiding work in
      module-load time that needs to move to build time.

11. FORMAT. Four-column table:
    | # | What to measure | Budget + measurement method | Pass/Fail |
    Numbered rows, TOC, sign-off. Include a summary table at the
    top showing current-run measured values vs budgets so a reader
    can eyeball pass/fail at a glance.

═══════════════════════════════════════════════════════════════════════════
PROCESS
═══════════════════════════════════════════════════════════════════════════

Step 1 — Survey:

- Every controller route in the module
- Every service-layer method called by those routes
- Every frontend route under the module's directory
- Every `EXPLAIN`-worthy Prisma query (anything using `include`
  with nested relations, raw SQL, or aggregates)
- Every PDF template in `packages/pdf-rendering` (or equivalent)
- Any known slow endpoints (grep the repo for `// SLOW` or
  performance-related TODOs)

Step 2 — Map. Produce:

- Endpoint inventory with baseline budgets (p50/p95/p99/payload)
- List-endpoint scale matrix (0 / realistic / stress)
- Mutation flow inventory with load/contention tests
- Page inventory with bundle/FCP/LCP/CLS budgets
- Query-plan inventory

Step 3 — Fixture seeder. The spec must point to a seeder that can
produce a tenant with N invoices, M payments, etc. at scale. If one
doesn't exist, the spec documents the need and includes a skeleton
(SQL `INSERT INTO ... SELECT generate_series(...)`) the harness can
use. Without large-volume fixtures, perf tests are meaningless.

Step 4 — Outline. Suggested section layout:

1. Baseline environment specification
2. Endpoint perf matrix (per route)
3. List-endpoint scale matrix (per list route × data volume)
4. N+1 detection per relation-heavy route
5. PDF render benchmarks
6. Load / concurrency tests
7. Bundle / first-paint budgets
8. Database query health (EXPLAIN ANALYZE per critical query)
9. Memory / event-loop health
10. Cold vs warm start
11. Summary table + sign-off

Step 5 — Write. Every row specifies:

- Tool (k6 / autocannon / Jest / Playwright / Lighthouse)
- Command or script snippet
- Measurement method (p50 via percentile calculation, RSS via
  `process.memoryUsage()`, query count via Prisma `$on`)
- Pass threshold (numeric)

Step 6 — Self-review. Walk the endpoint inventory. Every route must
have at least one perf row. Every list route must have at least three
(empty / realistic / stress). Every relation-heavy route must have at
least one N+1 row. Every mutating endpoint must have at least one
contention row. Any gap is a coverage hole — flag it.

Step 7 — Coverage tracker. Update alongside the other legs.

═══════════════════════════════════════════════════════════════════════════
DELIVERABLES
═══════════════════════════════════════════════════════════════════════════

Save the file to:
{FOLDER_PATH}/perf/{module-slug}-perf-spec.md

Update:
E2E/COVERAGE-TRACKER.md

At the end, report:

- Endpoint count with budgets defined
- Scale-matrix row count
- Load/contention test count
- Page count with bundle budgets
- Any endpoints without budgets (coverage hole) — list them so the
  next iteration can fill them in

═══════════════════════════════════════════════════════════════════════════
ANTI-PATTERNS TO AVOID
═══════════════════════════════════════════════════════════════════════════

- Do NOT write "page should load fast". Numbers only.
- Do NOT report averages. Averages hide tail latency. Use p50 / p95
  / p99 minimum.
- Do NOT measure on a different machine each time. Pin the baseline
  environment so runs are comparable.
- Do NOT skip the cold/warm distinction. The first request after
  boot is the one that breaks during a deploy.
- Do NOT benchmark on test fixtures with 5 rows. You are measuring
  best-case, not real-case. Insist on stress-volume fixtures.
- Do NOT measure only happy paths. Validation failures, permission
  denials, and 404s all have perf budgets too — and a slow 404 is
  a DoS vector.
- Do NOT trust synthetic benchmarks alone. Every spec must include
  at least one real-browser Lighthouse row for the top pages.
- Do NOT conflate throughput and latency. A burst of 1000 rps can
  still have a p95 of 2000ms and be unacceptable. Measure both.

═══════════════════════════════════════════════════════════════════════════
WHEN IN DOUBT
═══════════════════════════════════════════════════════════════════════════

The bar for this spec is: if the budgets pass, a tenant with
realistic data volume and reasonable concurrent users has a
responsive UI with no N+1 queries, no memory leaks, and no
unexpectedly slow endpoints. Regression tracking between runs is the
whole point — if the numbers aren't specific and environment-pinned,
the next team will have no idea if performance improved or regressed.

Begin with Step 1. At the end, confirm deliverables and report.
