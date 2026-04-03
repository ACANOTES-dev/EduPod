# Risk Ledger

Timestamp: `20260403T130928+0100`

## AUD-001

- Title: Search route lacks RBAC for tenant-wide directory data
- Severity: High
- Confidence: High
- Domain: Security
- Affected modules: `search`, `rbac`, `common guards`
- Why it matters: authenticated users can reach a tenant-wide directory-style search path without the permission layer that other sensitive endpoints rely on.
- Evidence summary: [`/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.ts) uses `AuthGuard` without `PermissionGuard`; [`/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.service.ts) returns student, parent, staff, and household results.
- Fix direction: add permission gating and per-entity authorization, require tighter query prerequisites, and add denial-path tests.
- Suggested priority: Now

## AUD-002

- Title: Login allows request-body tenant selection to override host-resolved tenant context
- Severity: Medium
- Confidence: High
- Domain: Security
- Affected modules: `auth`, `tenant-resolution`
- Why it matters: this weakens the intended trust model at the login boundary and makes tenant targeting less deterministic.
- Evidence summary: [`/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.controller.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.controller.ts) uses `dto.tenant_id || tenantContext?.tenant_id`; the controller spec explicitly preserves “body wins” behavior.
- Fix direction: make host-resolved tenant context the default winner and reserve explicit override for tightly controlled platform flows only.
- Suggested priority: Now

## AUD-003

- Title: Production rollback is code-only after migrations
- Severity: High
- Confidence: High
- Domain: Ops
- Affected modules: `deploy`, `packages/prisma`, production workflow
- Why it matters: a bad deploy can leave code reverted while schema or data stays advanced, which is unsafe for a push-to-production workflow.
- Evidence summary: [`/Users/ram/Desktop/SDB/scripts/deploy-production.sh`](/Users/ram/Desktop/SDB/scripts/deploy-production.sh) creates a predeploy dump and then runs migrations, but rollback restores code/build/services only and never restores the database.
- Fix direction: require reversible expand/contract migrations or automate and drill a real code-plus-database rollback path.
- Suggested priority: Now

## AUD-004

- Title: Approval callback status contract can fail on non-happy-path outcomes
- Severity: High
- Confidence: High
- Domain: Reliability
- Affected modules: `approvals`, `finance`, `payroll`, `communications`, worker callback processors
- Why it matters: the system’s self-healing and callback-reporting path can break while trying to record an unexpected callback state.
- Evidence summary: [`/Users/ram/Desktop/SDB/packages/prisma/schema.prisma`](/Users/ram/Desktop/SDB/packages/prisma/schema.prisma) limits `callback_status` to `VARCHAR(20)` while callback processors write `skipped_unexpected_state`, which is `24` characters.
- Fix direction: align schema and allowed callback vocabulary immediately, then test every callback terminal and reconciliation state.
- Suggested priority: Now

## AUD-005

- Title: Boundary checker is miswired and CI still treats a large violation budget as acceptable
- Severity: High
- Confidence: High
- Domain: Architecture
- Affected modules: boundary tooling, architecture governance, cross-module contracts
- Why it matters: the repo cannot enforce modularity credibly if the checker is broken locally and debt-budgeted in CI.
- Evidence summary: [`/Users/ram/Desktop/SDB/scripts/check-module-boundaries.ts`](/Users/ram/Desktop/SDB/scripts/check-module-boundaries.ts) still points to `architecture/module-ownership.json`; CI still runs the checker with `--max-violations 235`.
- Fix direction: repair the registry path, prove the checker works again, then ratchet the allowed-violations budget down aggressively.
- Suggested priority: Now

## AUD-006

- Title: Behaviour contains internal mini-monolith hotspots
- Severity: High
- Confidence: Medium-High
- Domain: Architecture
- Affected modules: `behaviour`, `behaviour appeals`, `behaviour sanctions`
- Why it matters: one of the largest and most change-prone domains still concentrates domain rules, orchestration, documents, and side effects in oversized services and pages.
- Evidence summary: [`/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts), [`/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts), and [`/Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx`](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx>) are all large hotspot files with mixed responsibilities.
- Fix direction: split command/query workflows, extract side-effect helpers, and break the appeal page into smaller form-driven subcomponents.
- Suggested priority: Next

## AUD-007

- Title: Gradebook analytics depends on direct cross-domain reads and looped orchestration
- Severity: High
- Confidence: High
- Domain: Architecture
- Affected modules: `gradebook`, `classes`, analytics paths
- Why it matters: the most coupled backend domain still relies on implicit read boundaries, making analytics harder to scale and change safely.
- Evidence summary: [`/Users/ram/Desktop/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts) reads class-domain data directly and issues per-row follow-up queries.
- Fix direction: replace ad hoc direct reads with a stable analytics read model or explicit cross-domain facade.
- Suggested priority: Next

## AUD-008

- Title: Payroll coverage confidence is overstated relative to business risk
- Severity: High
- Confidence: High
- Domain: Tests
- Affected modules: `payroll`, backend coverage tooling
- Why it matters: payroll is business-critical, but its highest-risk orchestration paths are not characterized deeply enough to support confident refactors.
- Evidence summary: payroll coverage artifacts trail strong modules, [`/Users/ram/Desktop/SDB/apps/api/jest.config.js`](/Users/ram/Desktop/SDB/apps/api/jest.config.js) lacks `collectCoverageFrom`, and [`/Users/ram/Desktop/SDB/scripts/check-test-coverage-gate.sh`](/Users/ram/Desktop/SDB/scripts/check-test-coverage-gate.sh) only checks changed spec presence.
- Fix direction: make coverage accounting truthful and add characterization tests for payroll run finalization, approvals, entry refresh, queue dispatch, and calendar boundaries.
- Suggested priority: Now

## AUD-009

- Title: Frontend critical workflows are under-protected by current tests
- Severity: High
- Confidence: High
- Domain: Tests
- Affected modules: `apps/web` critical school flows
- Why it matters: UI regressions in save, validation, permissions, and async wiring can slip through while smoke and visual suites stay green.
- Evidence summary: fact-pack count of `337` route pages versus `32` frontend test files; sampled journeys are thin outside login; frontend specs do not use React Testing Library.
- Fix direction: add seeded state-changing Playwright journeys for attendance, student creation/editing, behaviour, finance, and payroll, plus a small RTL layer for high-value forms and components.
- Suggested priority: Now

## AUD-010

- Title: Worker telemetry and readiness signals are incomplete
- Severity: Medium
- Confidence: High
- Domain: Ops
- Affected modules: `worker`, `health`, `cron`, monitoring
- Why it matters: background failures and partial degradation are harder to detect and reason about than the API health surface implies.
- Evidence summary: [`/Users/ram/Desktop/SDB/apps/worker/src/instrument.ts`](/Users/ram/Desktop/SDB/apps/worker/src/instrument.ts) is not imported by [`/Users/ram/Desktop/SDB/apps/worker/src/main.ts`](/Users/ram/Desktop/SDB/apps/worker/src/main.ts); readiness reuses broad health; worker health does not cover the full queue estate.
- Fix direction: initialize worker telemetry on boot, distinguish readiness from health, and align queue/scheduler health checks with the actual worker fleet.
- Suggested priority: Next

## AUD-011

- Title: Shared-contract sprawl and docs/tooling drift reduce maintainability
- Severity: Medium
- Confidence: High
- Domain: Maintainability
- Affected modules: `packages/shared`, architecture docs, local tooling
- Why it matters: broad shared barrels and stale documentation/tool paths make boundaries less trustworthy and developer navigation more expensive.
- Evidence summary: [`/Users/ram/Desktop/SDB/packages/shared/src/index.ts`](/Users/ram/Desktop/SDB/packages/shared/src/index.ts) exports a wide root barrel; architecture docs and checker paths have drifted; [`/Users/ram/Desktop/SDB/scripts/doctor.mjs`](/Users/ram/Desktop/SDB/scripts/doctor.mjs) expects a stale API build artifact path.
- Fix direction: freeze new root-barrel exports, push domain imports onto subpaths, and treat architecture docs and bootstrap tooling as release artifacts that must stay synchronized.
- Suggested priority: Next

## AUD-012

- Title: Anonymous survey exception relies on discipline rather than strong structural guardrails
- Severity: Medium
- Confidence: Medium
- Domain: Security
- Affected modules: `staff-wellbeing`, survey response isolation
- Why it matters: the exception appears intentional, but intentional exceptions are still fragile if safety depends mainly on developers remembering special handling.
- Evidence summary: [`/Users/ram/Desktop/SDB/packages/prisma/rls/policies.sql`](/Users/ram/Desktop/SDB/packages/prisma/rls/policies.sql) and related migration comments document the exception for anonymous survey data; the current protection model relies on careful app-layer routing and dedicated tests.
- Fix direction: keep the exception explicit, document it as a special-case threat surface, and add stronger lint/test/runtime guardrails around every survey-response access path.
- Suggested priority: Later
