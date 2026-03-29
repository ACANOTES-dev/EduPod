# Health Recovery Masterplan

> **Objective:** Move EduPod from "strong architecture with some active release risk" to a **world-class, tenant-ready, immediate-release** codebase without removing or regressing any current feature.
> **Date:** 2026-03-29
> **Author:** Codex health review
> **Status:** Proposed execution plan
> **Primary goal:** `10/10` for health, function, structure, engineering discipline, and immediate release readiness for high-value tenants

---

## 1. Executive Summary

EduPod is already stronger than the average SaaS monolith of this size:

- Clear architectural intent
- Strong tenancy and RLS discipline
- Serious documentation for blast radius, state machines, and danger zones
- Large, meaningful automated test suite
- Strict TypeScript and custom lint rules enforcing non-trivial invariants

However, it is **not yet at a 10/10 release posture**. The current state is better described as:

- **Architecture / structure:** very strong
- **Feature breadth:** extremely strong
- **Engineering discipline:** strong but not yet airtight
- **Immediate release readiness:** not yet acceptable for "company reputation on the line" onboarding

### Why it is not 10/10 today

The biggest issue is not lack of code or lack of tests. It is that **the final release gates are not yet uncompromising enough**:

- `turbo test` is currently failing in `@school/api`
- A real Nest DI regression exists and breaks full app boot in integration tests
- There is a cluster of time/date brittleness
- Two S3-dependent tests are skipped
- Lint still allows warnings
- A few high-risk areas are protected by convention and volume of tests rather than by dedicated release gates
- There is still no formally separated pre-launch hosted lane and launch-production lane, which is incompatible with a real `10/10` immediate-release claim until the environment split is completed

This masterplan is designed to close those gaps **without sacrificing feature completeness**.

---

## 2. Verified Baseline As Of 2026-03-29

### Current repo-health facts verified locally

- `pnpm turbo lint` passes, but with warnings
- `pnpm turbo type-check` passes cleanly
- `pnpm turbo test` fails because `@school/api` is not green
- Latest verified API suite result:
  - `445` suites total
  - `4` suites failed
  - `30` tests failed
  - `5,558` tests passed
  - `5,588` API tests executed

### Current failing areas identified

1. **DI / boot integrity regression**
   - `BehaviourSignalCollector` imports `PrismaService` as a type-only import
   - This breaks Nest dependency resolution in full app boot paths
   - Impact: integration tests fail and real boot-time regressions can slip through

2. **Date/time brittleness**
   - `SubstitutionService.getTodayBoard()`
   - `ReferralService.getWaitlist()`
   - `BehaviourExclusionCasesService.recordDecision()`
   - Symptoms: off-by-one and UTC/local-time boundary failures

3. **Integration blind spots**
   - Two S3-dependent tests are skipped
   - This means a category of release risk is currently accepted rather than closed

### Test-suite inventory verified locally

- **Tracked test files:** `569`
- **Tracked test lines:** `174,698`
- **Skipped tests:** `2`
- **Explicit `it()` / `test()` declarations counted in source:**
  - `apps/api`: `5,490`
  - `apps/worker`: `174`
  - `packages/shared`: `166`
  - `apps/web`: `115`

This means the AGENTS headline that says `5,588 distinct tests` is now stale or understated. The API package alone currently executes `5,588` tests.

---

## 3. Codebase Size Reality Check

### AGENTS.md accuracy check

`AGENTS.md` currently says:

- `~594k lines of active code`
- `2,529 files`
- `569 test files`
- `5,588 distinct tests`

### What I measured locally

#### Tracked file counts

- **Tracked files in repo:** `2,588`
- **Tracked files discoverable by `rg --files`:** `2,482`
- **Tracked test files:** `569`

#### Key tracked line counts by extension

- **TypeScript:** `382,460`
- **TSX:** `133,927`
- **TypeScript incl. TSX:** `516,387`
- **Markdown:** `141,611`
- **JSON:** `15,811`
- **YAML:** `17,017`
- **SQL:** `11,164`
- **Prisma:** `8,025`
- **HTML:** `9,752`

### Conclusion

The AGENTS size section is **partially accurate**:

- `569 test files` is accurate
- `5,588 distinct tests` is no longer reliable as a repo-wide headline
- `2,529 files` is stale; tracked files are now `2,588`
- `~594k lines of active code` is also stale by current tracked-file measurements

### Recommended wording update for AGENTS.md

Do not update this automatically unless you want it changed, but the current size note should be refreshed to something like:

- "As of 2026-03-29, the repo contains ~2,588 tracked files."
- "TypeScript + TSX alone now exceeds 516k lines."
- "The repo has 569 test files, and the API package alone executes 5,588 tests."

---

## 4. Definition Of 10/10

EduPod is only `10/10 immediate-release ready` when all of the following are true:

1. **No red gates**
   - `lint`, `type-check`, `test`, and `build` are green
   - No known failing suites
   - No skipped tests in critical paths without an explicit temporary waiver and expiry date

2. **No hidden boot-time failures**
   - API app boots in integration mode
   - worker boots in integration mode
   - key route groups render/build successfully

3. **No time-boundary surprises**
   - date, timezone, DST, school-day, cron, and "today" logic are deterministic and tested

4. **No unverified high-risk workflows**
   - all key tenant workflows have true end-to-end confidence
   - external integration paths have local or CI substitutes

5. **No release-process gambling**
   - releases are blocked automatically on red gates
   - warnings are either eliminated or deliberately budgeted
   - smoke verification is standardized and fast

6. **No blind spots in security and tenant isolation**
   - RLS, permission invalidation, queue payload tenancy, and audit guarantees are continuously tested

7. **No "tribal knowledge only" critical areas**
   - architecture docs, danger zones, and operational playbooks stay synchronized with code

---

## 5. Non-Negotiable Program Rules

These rules apply throughout the recovery:

- Preserve every existing feature and user-facing workflow unless Ram explicitly approves a change.
- No schema drift or architecture drift outside the approved plan.
- Every health fix must come with tests or stronger gating.
- Every release-risk discovery must be converted into either:
  - a permanent automated test,
  - a lint/CI gate,
  - a documented danger zone,
  - or an operational playbook.
- Zero tolerance for "we’ll remember this later".
- All work is measured against tenant safety, Irish operational fit, and founder reputation risk.

---

## 6. Recovery Waves

This plan uses a wave model inspired by the repo’s orchestration style. There is no existing implementation log for this effort yet, so the wave order below is the source of truth.

### Wave 0 — Stop-Ship Recovery

**Goal:** Return the codebase to a trustworthy green baseline.

#### Required work

1. Fix all currently failing API tests.
2. Fix the Nest DI regression in `BehaviourSignalCollector`.
3. Stabilize the date/time failures and remove wall-clock brittleness from their tests.
4. Re-run full `turbo lint`, `turbo type-check`, `turbo test`, and `turbo build`.
5. Produce and store a machine-readable health snapshot:
   - test totals
   - suite totals
   - skipped tests
   - lint warnings
   - build duration

#### New tests/gates to add in Wave 0

- **API boot smoke test**
  - build a `TestingModule` from full `AppModule`
  - verifies provider graph can resolve
  - catches type-only injection mistakes immediately

- **Worker boot smoke test**
  - verifies `WorkerModule` compiles with all processors registered

- **Date/time regression tests**
  - tests for `today`, `tomorrow`, and boundary conditions near UTC midnight
  - deterministic fake clock usage where possible

- **Skipped-test policy check**
  - CI should fail if any new `.skip` is introduced outside a small allowlist file

#### Exit gate

- `0` failing tests
- `0` failing suites
- `0` unresolved boot-time dependency errors
- `0` undocumented red health issues

---

### Wave 1 — Immediate Release Readiness

**Goal:** Make the codebase safe enough for high-paying tenant onboarding.

#### Required work

1. Eliminate all critical lint warnings or convert them into hard errors where appropriate.
2. Replace the current S3-dependent skipped tests with executable integration tests using a local substitute:
   - MinIO
   - or LocalStack
3. Add a production-like smoke lane for the core tenant journeys.
4. Add explicit release checklists for:
   - API
   - worker
   - web
   - PDFs
   - queues
   - tenant-scoped data isolation

#### Must-have smoke journeys

These are the minimum flows that should be runnable before a high-stakes release:

1. Tenant login and tenant switching
2. Student creation and update
3. Household / parent linking
4. Registration flow
5. Attendance entry and attendance summary visibility
6. Grade entry and report-card generation
7. Invoice creation, payment posting, refund path
8. Payroll run creation and payslip generation
9. Behaviour incident creation through notification side effects
10. Parent inquiry submission and staff handling
11. Admissions submission and internal review
12. Import upload / validation / processing
13. Child protection access grant and isolation check
14. One public-site render path and one parent-facing render path

#### New tests/gates to add in Wave 1

- **Playwright smoke suite**
  - English and Arabic
  - at least one RTL assertion
  - role-aware shell render checks

- **PDF smoke snapshots**
  - receipt
  - invoice
  - report card
  - transcript
  - payslip
  - English and Arabic variants where supported

- **Queue contract tests**
  - every enqueued tenant-scoped job must include `tenant_id`
  - consumers reject malformed payloads

- **Release-candidate build lane**
  - `turbo build`
  - app boot smoke
  - worker boot smoke
  - core smoke flows

#### Exit gate

- All critical tenant journeys pass in automation
- No skipped tests in release-critical areas
- No lint warnings in critical packages (`api`, `worker`, `web`)
- Core PDFs render cleanly in both locales

---

### Wave 2 — Time, State, and Workflow Determinism

**Goal:** Remove the classes of bugs most likely to damage trust in a live school system.

#### Priority areas

1. **Time and timezone discipline**
   - standardize handling of local dates vs UTC instants
   - centralize date utilities
   - stop using ad hoc `toISOString().slice(0, 10)` in domain logic

2. **State-machine determinism**
   - every major lifecycle gets a single authoritative transition map
   - finance invoices are the biggest candidate

3. **Approval/reconciliation guarantees**
   - approved-but-not-executed background actions need reconciliation

4. **Cron determinism**
   - every cron job should be idempotent and testable
   - tenant timezone behavior must be explicit

#### New tests to add

- **Timezone matrix tests**
  - `Europe/Dublin`
  - UTC day rollover
  - DST start and DST end dates

- **School-day calendar tests**
  - weekends
  - school closures
  - holidays
  - cross-month and cross-term boundaries

- **State-machine meta-tests**
  - one test suite per domain asserting:
    - all valid transitions accepted
    - all invalid transitions rejected
    - all side effects asserted

- **Approval reconciliation tests**
  - simulate worker failure after approval
  - assert reconciliation job or compensating visibility behavior

- **Cron idempotency tests**
  - repeated execution should not duplicate side effects

#### Exit gate

- No domain-critical service performs date logic ad hoc
- Major state machines are explicit and tested
- Background approval actions are observable and reconcilable

---

### Wave 3 — Security, RLS, and Multi-Tenant Assurance

**Goal:** Reach "tenant trust" quality, not just "feature works".

#### Required work

1. Expand RLS leakage coverage to all high-risk tables and cross-module reads.
2. Add security tests around permission invalidation and role changes.
3. Audit and minimize every `eslint-disable` that weakens protections.
4. Create a controlled allowlist for raw SQL exceptions.
5. Add red-team style auth and access tests.

#### Tests to add

- **RLS inventory tests**
  - every tenant-scoped table should be covered by either:
    - direct RLS verification
    - or an explicit documented exemption

- **Permission cache invalidation tests**
  - role change
  - role permission change
  - membership suspension
  - user suspension

- **Raw SQL exception tests**
  - every permitted raw-SQL call must have:
    - justification
    - constrained inputs
    - dedicated tests

- **Cross-tenant API denial suite**
  - especially for:
    - reports
    - dashboards
    - background job callbacks
    - public or parent-facing lookup flows

- **Encryption round-trip tests**
  - bank details
  - tenant secrets
  - admission payment details

#### Exit gate

- High-risk tenant data paths have active isolation tests
- Permission invalidation is demonstrably correct
- Raw SQL exceptions are rare, explicit, and justified

---

### Wave 4 — Integration and External Dependency Confidence

**Goal:** Remove the "works locally, unknown under integration" problem.

#### Required work

1. Give CI usable substitutes for critical dependencies:
   - S3
   - Redis
   - email provider adapter
   - WhatsApp adapter
   - Stripe webhook simulation
2. Add provider contract tests.
3. Add failure-mode tests for retries, fallback, and partial outages.

#### Tests to add

- **S3 integration tests**
  - import upload
  - compliance export
  - cleanup jobs

- **Redis / BullMQ tests**
  - delayed jobs survive restart assumptions
  - job deduplication
  - repeatable cron registration correctness

- **Email/WhatsApp dispatch contract tests**
  - template resolution
  - locale selection
  - fallback ordering
  - retry behavior

- **Stripe webhook tests**
  - missing metadata
  - wrong tenant
  - duplicate events
  - replay safety

- **Search adapter tests**
  - indexing and reindex behavior when search backend is wired

#### Exit gate

- No critical integration is protected only by manual faith
- All external failure modes have deterministic expected behavior

---

### Wave 5 — Release Engineering and Operational Maturity

**Goal:** Make releases boring.

#### Required work

1. Create a proper pre-production verification lane.
2. Introduce a release scorecard with hard thresholds.
3. Add rollback and operational rehearsal docs.
4. Add backup-restore rehearsal.
5. Add deploy smoke tests against a production-like environment before tenant onboarding.

#### Environment strategy context

The founder's current environment strategy is intentional, not accidental:

- `local` is the development environment
- the current hosted environment labeled `production` is being used as a **real web-deployed proving ground**
- this current hosted environment is intended to be **renamed/repositioned as staging before launch**
- a separate, cleaner tenant-facing production environment will be created for actual launch

This is a valid strategy for avoiding a false sense of confidence from purely local development. It front-loads the pain of real deployment, real infrastructure behavior, real networking, and real process orchestration.

#### Hard truth

The hard truth is not that this strategy was wrong. The hard truth is that **until the hosted proving ground is formally split into `staging` and a new launch `production` environment**, the operational posture still behaves like direct-to-production deployment.

So the precise statement is:

- the current setup is a sensible **pre-launch hosted integration strategy**
- but it is **not yet a world-class launch architecture**
- and the codebase cannot honestly be called `10/10 immediate-release ready` for high-paying tenants until the environment split is completed

A truly world-class posture needs one of:

- a staging environment
- ephemeral preview environments with production-like dependencies
- or a blue/green release mechanism with smoke verification before traffic shift

#### Tests and checks to add

- **Release smoke checklist automation**
  - health endpoint
  - login
  - one create/update flow
  - worker heartbeat
  - queue enqueue/consume sanity

- **Backup restore rehearsal**
  - restore sanitized snapshot into a disposable environment
  - verify app boots and core flows work

- **Migration safety suite**
  - blank database migration
  - upgrade path from recent snapshot
  - RLS policy validation after migration

- **Operational chaos checks**
  - Redis restart behavior
  - worker restart behavior
  - failed cron retry behavior

#### Exit gate

- Release candidate can be verified before production exposure
- Rollback path is rehearsed
- Backup restore is proven, not assumed

---

### Wave 6 — World-Class Engineering Discipline

**Goal:** Move from "excellent solo-founder system" to "institution-grade engineering standard."

#### Required work

1. Zero-warning lint budget.
2. Health dashboard committed to repo or CI artifacts.
3. Code ownership map for top-risk domains.
4. Explicit change-control templates for:
   - schema changes
   - state-machine changes
   - queue payload changes
   - tenant settings changes
5. Mandatory architecture delta review on every cross-cutting change.

#### Additional guardrails

- **No new danger-zone entries without a mitigation owner**
- **No new TODO in critical paths without linked plan item**
- **No new raw-SQL exceptions without allowlist approval**
- **No skipped test without expiry date**
- **No release if health score is below threshold**

#### Exit gate

- Release process is self-defending
- Critical quality standards are enforced by tooling, not memory

---

## 7. Test Strategy Additions Still Needed

You already have a large test suite. The next leap is not "more tests everywhere". It is **better tests in the highest-risk seams**.

### Highest-value additions

1. **Full module/app boot tests**
   - catches DI/provider graph failures early

2. **Timezone/DST/calendar tests**
   - because school software is full of "today", deadlines, school days, and local schedules

3. **Queue contract tests**
   - because API and worker are coupled through payload shape and side effects

4. **RLS inventory coverage**
   - because tenant isolation is your most important trust boundary

5. **External integration substitutes in CI**
   - because skipped tests are silent confidence holes

6. **Production-like smoke flows**
   - because no amount of unit tests replaces a few excellent end-to-end journeys

7. **Migration and rollback tests**
   - because prod safety matters more than developer convenience

8. **PDF and bilingual visual verification**
   - because your product promises English/Arabic + RTL, and document output is a real customer deliverable

### Tests that should exist per domain

Every major module should have these layers where relevant:

- schema validation tests
- service tests
- controller tests
- state-machine tests
- cross-tenant isolation tests
- queue payload/processor tests
- smoke workflow tests
- locale/RTL tests where user-facing
- PDF/snapshot tests where document output exists

---

## 8. Release Gates To Enforce

These should become hard release gates, not aspirations:

### Gate A — Code Health

- `turbo lint`
- `turbo type-check`
- `turbo build`
- zero errors
- zero warnings in critical packages

### Gate B — Automated Verification

- `turbo test`
- smoke E2E suite
- boot smoke
- queue contract tests
- PDF smoke

### Gate C — Tenant Safety

- RLS suite
- permission invalidation suite
- cross-tenant denial suite

### Gate D — Operational Confidence

- migration dry run
- rollback plan validated
- release smoke checklist complete

### Gate E — Documentation Integrity

- affected architecture docs updated
- danger zones updated if new coupling discovered
- operational notes updated for any new release hazard

---

## 9. Scorecard

Use this scorecard to measure progress honestly:

| Dimension | Current | Target |
|---|---:|---:|
| Lint health | 8/10 | 10/10 |
| Type safety | 9/10 | 10/10 |
| Test quantity | 9/10 | 10/10 |
| Test trustworthiness | 6/10 | 10/10 |
| Boot integrity | 6/10 | 10/10 |
| Date/time determinism | 6/10 | 10/10 |
| RLS / security confidence | 8/10 | 10/10 |
| External integration confidence | 6/10 | 10/10 |
| Release engineering maturity | 4/10 | 10/10 |
| Immediate release readiness | 5/10 | 10/10 |

### Health KPIs to track weekly

- failing suites
- failing tests
- skipped tests
- lint warnings
- raw-SQL exceptions
- `eslint-disable` count by rule
- boot smoke pass/fail
- smoke E2E pass/fail
- RLS inventory completion percentage
- migration rehearsal pass/fail
- release smoke pass/fail

---

## 10. Suggested Execution Order

If you want the highest leverage path:

1. Wave 0 immediately
2. Wave 1 immediately after green baseline
3. Wave 2 and Wave 3 in parallel where possible
4. Wave 4 after the core platform is deterministic
5. Wave 5 before calling the platform "tenant-ready at premium risk tolerance"
6. Wave 6 as the permanent operating standard

---

## 11. What Must Be True Before Onboarding A High-Paying Tenant

Before premium onboarding, the following should be considered mandatory:

- zero failing tests
- zero critical warnings
- no unresolved DI/boot regressions
- no skipped critical-path integration tests
- local or CI substitute for S3 and other critical providers
- release smoke suite green
- RLS and permission regression suites green
- PDF and bilingual smoke checks green
- migration and rollback path rehearsed
- production-like pre-release verification lane in place

If any of these are missing, the codebase may still be strong, but it is not honestly at the bar you set.

---

## 12. First 10 Concrete Actions

1. Fix the `BehaviourSignalCollector` DI regression.
2. Fix the three known date/time-related failing areas.
3. Get `turbo test` green.
4. Add API boot smoke test.
5. Add worker boot smoke test.
6. Replace the two S3-skipped tests with executable integration tests using MinIO or LocalStack.
7. Remove or fix all current lint warnings in `api`, `worker`, and `web`.
8. Add a "no new skipped tests" CI rule.
9. Create a production-like smoke suite for the 14 must-have tenant journeys.
10. Stand up a pre-production verification lane before premium tenant onboarding.

---

## 13. Final Recommendation

EduPod does **not** need a rewrite. It needs a **hardening campaign**.

The foundations are already good enough to justify that effort:

- the architecture is serious
- the codebase is documented
- the tenancy model is disciplined
- the test culture is real

The path to world class is therefore not "change everything". It is:

- close the red gates
- remove nondeterminism
- harden the seams between modules and services
- stop accepting blind spots in release verification
- make the release process self-defending

That is how this codebase becomes worthy of carrying the whole company reputation.
