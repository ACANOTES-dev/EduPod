You are producing a **complete test spec pack** for the {MODULE_NAME}
module. This command runs all five legs of the spec pack sequentially
and produces one release-readiness bundle.

═══════════════════════════════════════════════════════════════════════════
WHAT /e2e-full DELIVERS
═══════════════════════════════════════════════════════════════════════════

A folder per module containing five specs:

```
E2E/{module_number}_{module_name}/
├── admin_view/{module-slug}-e2e-spec.md        ← from /E2E
├── teacher_view/{module-slug}-e2e-spec.md      ← from /E2E (if applicable)
├── parent_view/{module-slug}-e2e-spec.md       ← from /E2E (if applicable)
├── student_view/{module-slug}-e2e-spec.md      ← from /E2E (if applicable)
├── integration/{module-slug}-integration-spec.md   ← from /e2e-integration
├── worker/{module-slug}-worker-spec.md         ← from /e2e-worker-test
├── perf/{module-slug}-perf-spec.md             ← from /e2e-perf
├── security/{module-slug}-security-spec.md     ← from /e2e-security-audit
└── RELEASE-READINESS.md                        ← composite index written at the end
```

Plus an update to `E2E/COVERAGE-TRACKER.md` with all five spec rows
for this module.

Together these five specs target as close to 99.99% confidence as
specs can deliver:

| Leg                 | Catches                                                       | Blind spot filled by                    |
| ------------------- | ------------------------------------------------------------- | --------------------------------------- |
| /E2E                | UI regressions, translation gaps, state-based visibility bugs | /e2e-integration (data + API contract)  |
| /e2e-integration    | RLS leakage, webhook bugs, data corruption, race conditions   | /e2e-worker-test (async side effects)   |
| /e2e-worker-test    | Stuck jobs, retry policy bugs, cron dedup, dead-letter rot    | /e2e-perf (scale + latency)             |
| /e2e-perf           | N+1 queries, bundle bloat, slow PDF render, cold-start cliffs | /e2e-security-audit (adversarial angle) |
| /e2e-security-audit | OWASP categories, injection, auth hardening, business abuse   | The other four combined                 |

═══════════════════════════════════════════════════════════════════════════
EXECUTION MODEL
═══════════════════════════════════════════════════════════════════════════

Run the five commands **sequentially** in this order:

1. **/E2E** — UI spec. Establishes the module's page inventory, API
   endpoint map, and data-invariant baseline. Every later spec reuses
   this inventory.
2. **/e2e-integration** — API-level contract + RLS + webhooks +
   invariants. Reuses the endpoint map from /E2E.
3. **/e2e-worker-test** — Jobs + cron + async chains. Reuses the
   module's background-job inventory.
4. **/e2e-perf** — Latency + load. Reuses the endpoint map + job
   inventory and attaches a budget to each.
5. **/e2e-security-audit** — OWASP + adversarial. Reuses the full
   endpoint + role + field inventory.

Sequential is deliberate: each spec reuses the inventory from the
previous one instead of re-surveying the codebase. Parallel execution
would triple the code-reading cost with no quality win.

Between legs, the orchestrator may checkpoint by printing:

- How many rows the current leg added
- The total running row count
- Any overlap with a prior leg (should be zero — if leg B is
  duplicating leg A, one of them is documented wrong)

═══════════════════════════════════════════════════════════════════════════
PROCESS
═══════════════════════════════════════════════════════════════════════════

Step 0 — Establish scope. Confirm with the user (or infer from
`$ARGUMENTS`):

- Module name and slug
- Target folder under `E2E/`
- Which roles are applicable (admin always; teacher / parent /
  student as the module requires)
- Any explicit exclusions (e.g. "this module has no worker jobs,
  skip /e2e-worker-test and note it in RELEASE-READINESS.md")

Step 1 — Run /E2E. Produce every role spec. At the end, record:

- Line count per spec
- Section count per spec
- Page count
- Multi-tenant prerequisite rows added
- Data invariants declared
- Observations / bugs spotted (flagged, NOT silently fixed)

Step 2 — Run /e2e-integration. Produce the integration spec. Record:

- RLS matrix size
- Contract matrix size
- Webhook scenario count
- Invariant query count
- Concurrency row count
- Observations / gaps spotted

Step 3 — Run /e2e-worker-test. Produce the worker spec. Record:

- Queue count
- Job count
- Cron count
- Chain count
- Observations / gaps spotted

Step 4 — Run /e2e-perf. Produce the perf spec. Record:

- Endpoint-budget count
- Scale-matrix count
- Load/contention count
- Page-budget count
- Endpoints without budgets (coverage hole flag)

Step 5 — Run /e2e-security-audit. Produce the security spec. Record:

- OWASP category coverage (must be 10/10)
- Permission-matrix cell count
- Injection-fuzz row count
- Encrypted-field round-trip count
- Severity tally of findings spotted during the audit

Step 6 — Write `RELEASE-READINESS.md`. This is the composite index
at the module folder root. It contains:

```
# {Module Name} — Release Readiness Pack

**Generated:** {date}
**Commit:** {git short sha}
**Module slug:** {slug}

## Spec pack

| Leg                 | Spec document                                 | Rows | Sections | Date |
|---------------------|-----------------------------------------------|------|----------|------|
| /E2E (admin)        | admin_view/{slug}-e2e-spec.md                 | N    | N        | ...  |
| /E2E (teacher)      | teacher_view/{slug}-e2e-spec.md               | N    | N        | ...  |
| /E2E (parent)       | parent_view/{slug}-e2e-spec.md                | N    | N        | ...  |
| /E2E (student)      | student_view/{slug}-e2e-spec.md               | N    | N        | ...  |
| /e2e-integration    | integration/{slug}-integration-spec.md        | N    | N        | ...  |
| /e2e-worker-test    | worker/{slug}-worker-spec.md                  | N    | N        | ...  |
| /e2e-perf           | perf/{slug}-perf-spec.md                      | N    | N        | ...  |
| /e2e-security-audit | security/{slug}-security-spec.md              | N    | N        | ...  |

## Execution order

Run the specs in this order to achieve full confidence:
1. UI behavioural (admin, then each other role spec)
2. Integration (RLS + contracts + webhooks + invariants)
3. Worker (queues + cron + chains)
4. Perf (budgets, scale, load)
5. Security (OWASP + permission matrix + injection + hardening)

Each leg can be executed independently, but the full pack is what
achieves release-readiness.

## Coverage summary

- UI surface: N pages × M roles = K cells
- API endpoints: N (all in the Backend Endpoint Map of each spec)
- Tenant-scoped tables: N (all covered in RLS matrix)
- BullMQ jobs: N (all in worker spec)
- Cron schedules: N
- OWASP categories covered: 10/10
- Permission matrix cells: N

## Known limitations of the pack

Even the full pack does not cover:
- Long-tail Zod validation combinatorics beyond the documented
  boundary cases (combinatorically explosive; sampled not
  exhaustive)
- Real external-service behaviour (Stripe API outages, email
  provider delays) — mocked at the boundary, not live-tested
- Accessibility audits beyond structural checks — run a dedicated
  a11y tool (axe-core, Lighthouse a11y) as a sibling workflow
- Visual regression / pixel diff — run a dedicated visual tool
  (Percy, Chromatic, Playwright screenshots with visual diff)
- Browser / device matrix beyond desktop Chrome + 375px mobile —
  defer to a manual QA cycle on Safari, Firefox, edge devices
- Load-testing at production-scale volume (100k+ concurrent users)
  — the /e2e-perf spec targets realistic volume, not disaster-
  scenario peak

These gaps are acceptable for the 99.99% confidence target. 100%
confidence does not exist.

## Observations & findings from the walkthrough

From /E2E: {bug count}
From /e2e-integration: {gap count}
From /e2e-worker-test: {gap count}
From /e2e-perf: {hole count}
From /e2e-security-audit: {P0/P1/P2/P3 tally}

Full list: see the observations sections at the end of each spec.

## Tester assignment

This pack is designed to be executed by:
- **A dedicated QC engineer** working through each spec top-to-
  bottom, marking Pass/Fail per row, ideally one spec per day.
- **A headless Playwright agent** for the /E2E legs (UI behaviour
  is scriptable end-to-end).
- **A jest / supertest harness** for /e2e-integration and
  /e2e-worker-test rows (each row maps to a test case).
- **A k6 / artillery / Lighthouse script** for /e2e-perf (each
  row is a measurement).
- **A paid security consultant OR an internal security engineer**
  for /e2e-security-audit (humans still find more than tools on
  the adversarial axis).

## Sign-off

| Leg                 | Reviewer | Date | Pass | Fail | Notes |
|---------------------|----------|------|------|------|-------|
| /E2E (admin)        |          |      |      |      |       |
| /E2E (teacher)      |          |      |      |      |       |
| /E2E (parent)       |          |      |      |      |       |
| /E2E (student)      |          |      |      |      |       |
| /e2e-integration    |          |      |      |      |       |
| /e2e-worker-test    |          |      |      |      |       |
| /e2e-perf           |          |      |      |      |       |
| /e2e-security-audit |          |      |      |      |       |

**Module release-ready when all eight rows are signed off at Pass
with zero P0 / P1 findings outstanding.**
```

Step 7 — Update `E2E/COVERAGE-TRACKER.md`:

- Add a row per spec in the Completed Specifications table
- Add a dedicated "Module release readiness (date)" section at the
  bottom summarising the pack and pointing to
  `RELEASE-READINESS.md`

═══════════════════════════════════════════════════════════════════════════
DELIVERABLES
═══════════════════════════════════════════════════════════════════════════

At the end, report:

- Every file created (absolute paths)
- Total row count across the pack
- Severity tally from the security leg
- Observations spotted that need the user's decision (what to fix
  before hand-off, what to backlog)

═══════════════════════════════════════════════════════════════════════════
ANTI-PATTERNS TO AVOID
═══════════════════════════════════════════════════════════════════════════

- Do NOT run the legs in parallel. Each leg reuses the previous
  leg's inventory; running them in parallel triples the code-
  reading cost and causes inventory drift between specs.
- Do NOT fold legs into each other. /e2e-integration rows do NOT
  belong in /E2E. Keep them separate so the execution audience
  (human / Playwright / Jest / k6 / security consultant) can run
  the leg designed for them.
- Do NOT produce RELEASE-READINESS.md before all five legs are
  complete. The composite only makes sense once every row count
  and finding tally is finalised.
- Do NOT silently skip a leg that doesn't apply (e.g. a module
  with no worker jobs). Instead produce the leg's spec with an
  explicit "Not applicable — no BullMQ jobs in this module"
  justification so the tracker shows coverage was considered and
  consciously excluded.
- Do NOT promise 100%. The pack targets 99.99% and acknowledges
  the residual gaps explicitly in RELEASE-READINESS.md. That's
  honest and keeps future-you from chasing an impossible
  perfection.

═══════════════════════════════════════════════════════════════════════════
WHEN IN DOUBT
═══════════════════════════════════════════════════════════════════════════

The bar for /e2e-full is: after the pack is executed and all rows
pass, you can onboard a new tenant to this module with confidence
that the only remaining failure modes are (a) real-world scale
quirks, (b) novel attack vectors that didn't exist at spec-write
time, (c) regressions introduced by subsequent commits. Everything
reasonably knowable at spec-write time should have been surfaced.

Begin with Step 0. When you're done, confirm the full deliverables
list plus the RELEASE-READINESS.md summary.
