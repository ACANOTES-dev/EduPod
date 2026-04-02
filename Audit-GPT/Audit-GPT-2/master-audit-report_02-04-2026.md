# Master Audit Report — 02-04-2026

## 1. Executive Summary

The system is mixed-health, not broken beyond use. It has a real modular-monolith structure, credible multi-tenant isolation, and better-than-average operational scaffolding, but those strengths are offset by concentrated high-risk defects and weak guardrails in exactly the places that determine whether scaling and refactoring are safe. The most important problems are a live approval race, a dead notification retry loop, a red worker verification baseline, under-protected finance and worker flows, and hotspot modules whose internal boundaries are no longer clean enough for fast, confident change.

## 2. System Overview

This is a Turborepo monorepo with `apps/web` (Next.js App Router), `apps/api` (NestJS modular monolith), and `apps/worker` (BullMQ worker), backed by shared packages including Prisma, shared contracts, UI, ESLint config, and TS config. The Phase 1 inventory found `3,488` tracked files and `925,987` tracked lines in Git, including `3,414` TypeScript/TSX files and `702,467` TypeScript/TSX lines under `apps/` and `packages/`. Production is a single Hetzner host running PM2-managed `api`, `web`, and `worker`, with PostgreSQL plus PgBouncer, Redis, and Meilisearch.

## 3. Shared Fact Pack Summary

### Facts

- API module count: `59`.
- Frontend page count: `337` `page.tsx` files.
- Worker processor count: `93`.
- Largest API modules by non-spec TS lines:
  - `behaviour`: `23,540`
  - `pastoral`: `19,479`
  - `gradebook`: `15,229`
  - `scheduling`: `7,389`
  - `finance`: `7,239`
- Cross-module import hotspots from the API scan:
  - `gradebook`: `32`
  - `pastoral`: `22`
  - `staff-wellbeing`: `21`
  - `gdpr`: `21`
  - `behaviour`: `20`
- Test inventory from Phase 1:
  - backend spec files: `564`
  - API e2e spec files: `78`
  - worker spec files: `102`
  - package test files: `29`
- Execution results from Phase 1:
  - `apps/api`: `558/559` suites passed, `7,734/7,741` tests passed; only `school-closures.service.spec.ts` failed
  - `apps/worker`: `98/101` suites passed, `691/701` tests passed; failing suites were `redis.helpers.spec.ts`, `search.helpers.spec.ts`, and `compliance-execution.processor.spec.ts`
  - `packages/shared`: `28/28` suites passed, `746/746` tests passed
- `pnpm turbo run lint` failed in `@school/worker`.
- `pnpm turbo run type-check` failed in `@school/worker`.
- `pnpm turbo run build` passed, but web emitted deprecated Sentry/App Router warnings.
- Prisma/RLS inventory:
  - tenant-scoped Prisma models observed: `252`
  - distinct RLS-enabled tables observed across `policies.sql` plus migration `post_migrate.sql`: `253`
  - the initial apparent missing-table issue was narrowed to `cron_execution_logs`, which was later verified to have a migration-level RLS policy; the remaining problem is canonical-policy catalogue drift, not a confirmed missing live policy.
- CI and deploy shape:
  - no standalone `deploy.yml`
  - `.github/workflows/ci.yml` contains `ci`, `deploy`, `integration`, and `visual` jobs
  - deploy on `main` is gated behind the `ci` job

### Strong Signals

- Security is not paper-only. The reviewed request path has layered tenant resolution, JWT tenant checks, membership-scoped permission loading, RLS role assertions, and tenant-aware worker execution.
- The operational setup is more deliberate than typical founder-stage infrastructure. The deploy script uses exact-SHA deploys, pre-deploy backups, smoke tests, and automatic app rollback.
- The repo’s architecture docs are materially current. The danger zones and blast-radius docs still match live hotspots and couplings.
- Worker coverage breadth is substantial on paper: `92/93` processors have companion specs.

### Inferences

- The codebase’s main problem is not absence of structure; it is concentrated structural and verification debt in high-value areas.
- At current scale, the system can run, but it is not yet “safe to change quickly.”
- The strongest areas are security fundamentals and deployment intent. The weakest areas are reliability correctness, worker verification, frontend journey protection, and hotspot maintainability.

## 4. Build / Run / Test Findings

- Build status: `pnpm turbo run build` passed. This means the repo can still produce deployable artifacts, but it does not imply the verification baseline is healthy because lint and type-check failed separately.
- Lint status: failed in `@school/worker`, with one syntactically broken spec and other spec-maintenance issues. This is not cosmetic; it blocks the repo’s own required safety gate.
- Type-check status: failed in `@school/worker` because `apps/worker/src/processors/compliance/compliance-execution.processor.spec.ts` is malformed (`TS1005: '}' expected`).
- Backend test status: broadly green, but not fully trustworthy as a refactor gate because the single failing suite is failing due to mock drift rather than crisp behavioral regression.
- Worker test status: meaningfully degraded. The broken compliance spec plus failing Redis/search helper suites reduce confidence in worker coverage beyond the individual red tests.
- Shared package status: strong. `packages/shared` is green and appears to provide dependable contract-level coverage.
- Build warnings: frontend Sentry integration is behind current App Router guidance; warnings are operationally meaningful because they can hide incomplete error/tracing coverage.

## 5. Test Health Assessment

Overall trust level for refactoring: `moderate-low`.

- Backend test health is usable but uneven. `auth` is relatively trustworthy for contained refactors; `finance` is not.
- Frontend test health is weak. Existing coverage is dominated by screenshots and mirrored logic, not authenticated user journeys.
- Worker test health is broader than frontend coverage, but current trust is undercut by red foundational suites, a broken compliance spec, and an untested cross-tenant key-rotation processor.

Key blind spots:

- `approvals`: no evidence of concurrency-focused safety tests despite a live race window in the service code.
- `finance`: the risky `confirmAllocations()` path has only two negative tests around the exact method that uses row locks, balance recalculation, and receipt creation.
- `worker/compliance`: broken spec on an irreversible erasure/anonymisation flow.
- `worker/security`: no spec at all for cross-tenant key rotation.
- `apps/web` critical flows: no authenticated create/update journey coverage for attendance, finance, or comparable school workflows.

Critical-module coverage judgment:

- `auth`: above average.
- `finance`: below the risk threshold needed for comfortable refactoring.
- `approvals`: inadequate for concurrency-sensitive correctness.
- `communications worker`: partially meaningful, but missing live retry proof.
- `frontend protected shell`: insufficient as a behavioral guardrail.

## 6. Module Health Matrix

| Module | Purpose | Risk level | Test health | Architecture health | Security / reliability concern | Refactor priority |
| --- | --- | --- | --- | --- | --- | --- |
| `auth` | Login, sessions, MFA, tenant switching | High | Strong unit coverage, concentrated hotspot | Poor | God service; email-only login throttling | Now |
| `finance` | Invoices, payments, allocations, receipts | High | Mixed / weak on money paths | Mixed | Complex row-locking allocation path lightly tested; invoice-state drift in worker | Now |
| `approvals` | Cross-domain approval workflow | Critical | Mixed | Mixed | Non-atomic decisions and callback-state drift | Now |
| `behaviour` | Incidents, sanctions, appeals | High | Mixed | Poor | Largest module; foreign-table reads; projection duplication | Next |
| `pastoral` | Cases, referrals, reports | High | Mixed | Poor | Large boundary-heavy module; report factory hotspot | Next |
| `gradebook` | Assessment and analytics | High | Unknown / mixed | Poor | Coupling through direct reads of shared academic tables | Next |
| `attendance` | Attendance orchestration | Medium | Better | Better | Healthier decomposition, but nearby test-harness drift exists | Later |
| `reports` | Cross-module reporting reads | Medium | Mixed | Improving | Good façade pattern, weak result typing | Later |
| `worker/communications` | Notification dispatch and fallback | High | Mixed-red | Mixed | Retry path unscheduled; helper suites red | Now |
| `worker/compliance` | DSAR export and erasure | High | Red | Mixed | Broken spec on irreversible work | Now |
| `worker/security` | Cross-tenant key rotation | High | Absent | Mixed | Only untested processor; one-way-risk data operations | Now |
| `ops/health/deploy` | CI, deploy, rollback, health, observability | High | N/A | Mixed | Schema rollback manual; worker health narrow; frontend Sentry outdated | Next |

## 7. Deep Dive: Highest-Risk Modules

### Approvals

Why it matters:

- `approvals` is a shared control plane for other critical domains. If its state machine is wrong, finance, payroll, announcements, and other callback-driven actions inherit the error.

Strengths:

- Clear status model.
- Typed exception usage.
- Callback reconciliation exists.

Weaknesses:

- `approve()`, `reject()`, and `cancel()` do a read-time status check followed by an unconditional `update({ where: { id } })`.
- Callback processors are idempotent on the target entity but do not consistently repair `approval_requests` when the business action already succeeded.

Evidence:

- `apps/api/src/modules/approvals/approval-requests.service.ts:156-241`
- `apps/api/src/modules/approvals/approval-requests.service.ts:247-366`
- `apps/worker/src/processors/approvals/callback-reconciliation.processor.ts`
- callback processors in announcements, finance, and payroll

Likely failure mode:

- Two decision-makers race; both receive successful responses; one terminal state wins in the row, but the callback side effect may already have been enqueued from the losing branch.
- A callback mutates the domain entity but fails before marking the approval request executed; reconciliation later escalates a false failure state.

Suggested remediation direction:

- Make decision transitions atomic inside one guarded transaction or conditional write.
- Treat “domain state already applied” as a recovery success and repair the approval request row.
- Add concurrency and replay/idempotency tests.

### Finance

Why it matters:

- This domain moves money and changes invoice state. It is one of the places where test shallowness is most expensive.

Strengths:

- The service is attempting to protect correctness with row locking, balance validation, and idempotent receipt creation checks.
- Sequence generation and related finance infrastructure are comparatively thoughtful.

Weaknesses:

- The most important allocation path is thinly tested.
- The implementation uses raw SQL exceptions in a high-risk path.
- Worker overdue detection currently conflicts with the shared invoice transition contract.

Evidence:

- `apps/api/src/modules/finance/payments.service.ts:266-383`
- `apps/api/src/modules/finance/payments.service.spec.ts:218-239`
- `packages/shared/src/constants/invoice-status.ts`
- `apps/worker/src/processors/finance/overdue-detection.processor.ts`

Likely failure mode:

- A refactor preserves list/find operations but breaks one of: locking, over-allocation prevention, invoice rebalance, or receipt issuance.
- Invoice status semantics drift between API helpers, workers, and documentation.

Suggested remediation direction:

- Add transaction-faithful tests around `confirmAllocations()` success and failure cases.
- Align the overdue worker with the canonical invoice transition map.
- Keep raw SQL contained to reviewed allowlisted infrastructure paths.

### Worker Communications, Compliance, and Security

Why it matters:

- The worker carries cross-tenant and irreversible side effects: notifications, DSAR export/erasure, and encrypted-secret rotation.

Strengths:

- Processor/spec pairing is broad.
- `TenantAwareJob` is a meaningful base safeguard.
- The notification processor covers multiple channels and fallback creation.

Weaknesses:

- Retry logic exists but is not registered on the cron scheduler.
- Helper suites are red.
- The compliance spec is syntactically broken and provides no working regression harness.
- Key rotation is entirely untested.

Evidence:

- `apps/worker/src/cron/cron-scheduler.service.ts:287-301`
- `apps/worker/src/processors/communications/retry-failed.processor.ts`
- `apps/worker/src/processors/notifications/dispatch-queued.processor.ts:53-68`
- `apps/worker/src/processors/communications/dispatch-notifications.processor.ts:654-725`
- `apps/worker/src/processors/compliance/compliance-execution.processor.spec.ts`
- `apps/worker/src/processors/security/key-rotation.processor.ts`

Likely failure mode:

- Notifications fail once and remain dead.
- Compliance changes ship without a functioning safety harness.
- A key-rotation change corrupts decryptability across tenants without test coverage.

Suggested remediation direction:

- Restore a green worker baseline first.
- Register retry processing and prove it via integration-style tests.
- Make compliance and key rotation mandatory safety suites, not optional completeness work.

### Architecture Hotspot Cluster: Auth, Behaviour, Pastoral

Why it matters:

- These files and modules set the effective cost of change across the repo.

Strengths:

- The repo has a real modular structure and live architecture documentation.
- Some healthier seams exist, such as `AttendanceService` decomposition and `ReportsDataAccessService`.

Weaknesses:

- `AuthService` is a 1,128-line security-critical god service.
- `behaviour` and `pastoral` are effectively sub-platforms inside single modules.
- Direct Prisma reads remain the main boundary leak, so schema coupling is broader than the Nest import graph suggests.

Evidence:

- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/behaviour/behaviour-sanctions.service.ts`
- `apps/api/src/modules/behaviour/behaviour.service.ts`
- `apps/api/src/modules/pastoral/services/pastoral-report.service.ts`
- `architecture/module-blast-radius.md`
- `architecture/danger-zones.md`

Likely failure mode:

- Refactors in one workflow produce hidden effects in documents, queues, notifications, safeguarding-related logic, or reporting.

Suggested remediation direction:

- Split these modules internally into bounded contexts with thin facades.
- Expand typed read façades for high-shared tables.
- Promote the most important maintainability rules from warnings to errors in hotspot areas.

## 8. Cross-Cutting Architectural Risks

- Direct Prisma access to foreign tables is still the main boundary leak. This keeps schema blast radius larger than the module graph implies.
- Runtime and contract concerns are too mixed inside `packages/shared`, which lowers clarity around dependency direction.
- The danger zones are still live. They should now be treated as candidates for executable architecture checks rather than documentation only.
- There is visible drift between documented policy and implementation in several places: raw SQL exceptions, frontend Sentry integration, environment naming, and canonical RLS catalogue maintenance.
- Single-production deployment plus manual schema/data rollback means every migration still carries outsized operational risk.

## 9. Top 10 Most Important Issues

### 1. Approval request decisions are non-atomic

- Severity: Critical
- Confidence: High
- Why it matters: A shared approval engine that allows conflicting terminal decisions is unsafe for finance, payroll, and other callback-driven domains.
- Evidence: `approval-requests.service.ts` reads the row, checks status, then performs unconditional `update({ where: { id } })` for approve, reject, and cancel.
- Subagents supporting it: `06-reliability`
- Fix direction: Guard the transition in the write itself and enqueue callbacks only after that guarded transition succeeds.

### 2. Notification retry recovery is effectively dead

- Severity: High
- Confidence: High
- Why it matters: Transient notification failures are converted into durable operational failures instead of recovering automatically.
- Evidence: failures are written as `status: 'failed'` with `next_retry_at`, but the cron scheduler only registers `dispatch-queued`; the separate retry processor is never scheduled.
- Subagents supporting it: `06-reliability`
- Fix direction: Register `RETRY_FAILED_NOTIFICATIONS_JOB` or merge its scan into the queued-dispatch path, then add proof tests.

### 3. Approval callback tracking can mark already-executed work as failed

- Severity: High
- Confidence: High
- Why it matters: The system can tell operators a callback failed permanently even though the domain action already happened, undermining trust in approval status and replay behavior.
- Evidence: callback processors return early when the target entity is already in the post-approval state, without repairing the corresponding `approval_request`.
- Subagents supporting it: `06-reliability`
- Fix direction: Treat post-approval target state as an idempotent success and update `callback_status` to `executed`.

### 4. The worker verification baseline is red

- Severity: High
- Confidence: High
- Why it matters: CI cannot be trusted as a dependable regression signal while worker tests, lint, and type-check are already failing.
- Evidence: failing worker suites in Redis helpers, search helpers, and compliance execution; lint and type-check both blocked by worker spec issues.
- Subagents supporting it: `03-frontend-worker-tests`, `07-ops-dx`
- Fix direction: Restore a green worker baseline before treating any new change as safely verified.

### 5. Finance `confirmAllocations()` is a high-risk money path with thin tests

- Severity: High
- Confidence: High
- Why it matters: The exact method that locks rows, validates balances, recalculates invoices, and creates receipts is not protected by proportionate tests.
- Evidence: `payments.service.spec.ts` has only two negative tests for `confirmAllocations()`, while `payments.service.ts:266-383` contains the full transaction-critical logic.
- Subagents supporting it: `02-backend-tests`
- Fix direction: Add transaction-faithful tests covering success, over-allocation, household mismatch, rebalance calls, and duplicate-receipt prevention.

### 6. Frontend critical-flow coverage is mostly screenshots and mirrored logic

- Severity: High
- Confidence: High
- Why it matters: The frontend test suite can pass while authenticated teacher/admin workflows are broken.
- Evidence: reviewed Playwright specs only navigate, wait, and screenshot; no auth state is configured even though protected school routes are wrapped in `RequireAuth`; high-value unit specs mirror runtime route logic instead of importing/rendering the real sources.
- Subagents supporting it: `03-frontend-worker-tests`
- Fix direction: Add a small number of true journey tests and replace mirrored rule-table tests with tests against shared runtime constants or live components.

### 7. `auth`, `behaviour`, and `pastoral` have outgrown maintainable module boundaries

- Severity: High
- Confidence: High
- Why it matters: These hotspots raise the cost and unpredictability of almost every meaningful change.
- Evidence: `AuthService` is 1,128 lines with 24 public methods; `behaviour` and `pastoral` are the largest API modules; direct foreign-table reads remain widespread.
- Subagents supporting it: `01-architecture`, `05-code-quality`
- Fix direction: Split internal bounded contexts, narrow facades, and reduce foreign-table access through typed read seams.

### 8. Cross-tenant key rotation has no test harness

- Severity: High
- Confidence: High
- Why it matters: This is a one-way-risk processor operating across tenants on encrypted secrets and bank data, and it currently has no companion spec.
- Evidence: `key-rotation.processor.ts` is the only processor without a spec and explicitly bypasses tenant-scoped worker base logic because it runs cross-tenant.
- Subagents supporting it: `03-frontend-worker-tests`
- Fix direction: Add mandatory dry-run/live-mode safety tests and failure-accounting assertions before further changes to rotation logic.

### 9. Production rollback is app-safe but not schema-safe

- Severity: High
- Confidence: High
- Why it matters: In a single-production-environment setup, migration failures or data-shape regressions remain the most expensive class of deployment failure.
- Evidence: deploy script applies migrations before smoke tests, but automatic rollback restores the previous app commit only; the rollback runbook treats database restore as a separate manual recovery path.
- Subagents supporting it: `07-ops-dx`
- Fix direction: Require expand/contract migration discipline and rehearse restore-from-backup as a real operational capability.

### 10. Security hardening drift remains in implementation governance

- Severity: Medium
- Confidence: Medium-High
- Why it matters: Core tenant isolation is credible, but implementation drift around raw SQL, key custody, login throttling, and policy inventory weakens long-term safety and auditability.
- Evidence: raw SQL exceptions in finance and partition maintenance; login throttling keyed only by email; encryption master keys read from environment variables; `cron_execution_logs` policy present in a migration but missing from canonical `policies.sql`.
- Subagents supporting it: `04-security-rls`
- Fix direction: centralize raw SQL allowlisting, strengthen throttling dimensions, move production key custody out of plain env usage, and keep canonical RLS inventory in sync by CI.

## 10. Quick Wins

- Register the failed-notification retry job and add one integration-style proof test.
- Make approval transitions conditional on `status = 'pending_approval'`.
- Repair `compliance-execution.processor.spec.ts`, `redis.helpers.spec.ts`, and `search.helpers.spec.ts` to restore a green worker baseline.
- Add a focused spec for `key-rotation.processor.ts`.
- Add successful-path tests for `finance.confirmAllocations()`.
- Standardize local env expectations: `.env` versus `.env.local`, and `MEILISEARCH_URL` versus `MEILISEARCH_HOST`.
- Update frontend Sentry integration to the current App Router model and make warning-free builds the target.

## 11. Strategic Refactor Opportunities

### 1. Stabilize correctness before structural refactors

Prerequisites:

- Approval race fixed
- Notification retries fixed
- Worker baseline green

Why this sequence matters:

- Without a trustworthy baseline, structural cleanup will create more uncertainty than safety.

### 2. Add narrow, high-value guardrails in the highest-blast-radius paths

Prerequisites:

- Step 1 complete

Scope:

- finance transaction tests
- approvals concurrency/replay tests
- compliance and key-rotation worker safety suites
- a handful of authenticated frontend journey tests

Why this sequence matters:

- These tests raise refactor safety faster than adding broad low-signal coverage.

### 3. Carve hotspot modules into internal bounded contexts

Prerequisites:

- Step 2 complete

Scope:

- split `AuthService`
- split `behaviour` into sanctions, safeguarding-adjacent logic, documents, parent flows, analytics
- split `pastoral` reporting and case-management concerns

Why this sequence matters:

- Once high-value guardrails exist, internal extraction becomes materially safer.

### 4. Tighten governance and boundary enforcement

Prerequisites:

- Step 3 underway

Scope:

- typed read facades for shared tables
- narrower `packages/shared` surface
- stronger maintainability lint rules
- canonical RLS inventory CI
- raw SQL allowlist enforcement

Why this sequence matters:

- It converts current best-effort conventions into enforceable architectural constraints.

### 5. Improve release and observability maturity

Prerequisites:

- Step 1 complete

Scope:

- worker health broadened beyond notifications
- synthetic post-deploy worker smoke
- modernized frontend Sentry
- practiced backup/restore drills

Why this sequence matters:

- These changes reduce change risk as tenant count and background-load surface increase.

## 12. Scorecard

| Dimension | Score | Justification |
| --- | --- | --- |
| Architecture | `5.5/10` | Real modular-monolith skeleton, but several hotspot modules and boundary leaks keep change impact hard to predict. |
| Code Quality | `6.0/10` | Strong defensive backend patterns exist, but not enough to offset hotspot files and frontend drift. |
| Modularity | `5.0/10` | Folder/module structure exists, but direct foreign-table reads and oversized shared/runtime surfaces weaken real modularity. |
| Backend Test Health | `6.0/10` | Useful and meaningful in selected areas, especially `auth`, but not strong enough for high-risk finance refactors. |
| Frontend Test Health | `3.0/10` | Mostly visual coverage and mirrored logic, with little proof that authenticated journeys still work. |
| Worker Test Health | `6.0/10` | Broad pairing and several meaningful specs, but current red suites and major blind spots keep it below healthy. |
| Maintainability | `5.0/10` | Debt is concentrated rather than universal, but the hotspot concentration is serious. |
| Reliability | `5.0/10` | Several direct reliability defects exist in approvals and notifications, despite decent surrounding infrastructure. |
| Security | `7.5/10` | Core tenant isolation and RBAC are credibly strong, but hardening and governance drift remain. |
| Developer Experience | `5.0/10` | Tooling and docs exist, but trust is undermined by a red baseline and inconsistent env contracts. |
| Operational Readiness | `6.0/10` | Deploy/runbook/health foundations are solid, but schema rollback and observability/health gaps keep it out of the strong band. |
| Refactor Safety | `4.5/10` | Weak frontend flow protection, hotspot maintainability issues, and a red worker baseline make broad refactors unsafe. |
| Overall Health | `5.8/10` | The system is operable and partially strong, but too many material risks remain for confident fast change. |

## 13. Final Verdict

- Is this monolith healthy?  
  Mixed. It has solid foundations in security and operational intent, but enough material reliability, verification, and hotspot-architecture issues to keep it out of the healthy band.

- Is it safe to scale?  
  Safe to scale cautiously at low speed and with close operational attention; not safe to scale casually or on the assumption that current tests and health checks will catch the important failures.

- Is it safe to extend?  
  Safe to extend selectively in healthier areas. High-risk domains such as approvals, finance, worker side effects, and hotspot modules need additional guardrails first.

- Is it safe to refactor?  
  Not broadly. Small, well-contained refactors are possible, but large cross-cutting refactors are currently high-risk.

- What should be done first?  
  Fix live correctness and verification gaps before structural cleanup: approval atomicity, notification retries, worker baseline, finance transaction tests, key rotation/compliance safety tests, then internal hotspot decomposition.

## 14. Review Limitations

- This audit is evidence-backed but not exhaustive. Subagents used targeted file sampling, not full file-by-file review across the entire repo.
- No production server inspection or live traffic validation was performed.
- No live database verification was run beyond code/config inspection and command-output inventory.
- The approval race and similar findings were established by code-path analysis, not reproduced with concurrent execution in a runtime harness.
- The environment would not permit seven concurrent subagents at once; six were launched in one batch and the seventh immediately after a slot freed.
- The RLS gap initially surfaced by grep heuristics was challenged and narrowed to policy-catalogue drift, which reduced severity and changed the framing.
