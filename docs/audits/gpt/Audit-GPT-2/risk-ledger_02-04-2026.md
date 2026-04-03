# Risk Ledger — 02-04-2026

## AUD-001 — Approval decisions are non-atomic

- Severity: Critical
- Confidence: High
- Domain: Reliability
- Affected modules: `approvals`, approval callback consumers
- Why it matters: conflicting approve/reject/cancel decisions can both succeed under concurrency
- Evidence summary: `approval-requests.service.ts` does read-then-unconditional-update for approve/reject/cancel
- Fix direction: guarded transition write or row lock inside one transaction
- Suggested priority: Now

## AUD-002 — Notification retry recovery is not scheduled

- Severity: High
- Confidence: High
- Domain: Reliability
- Affected modules: `worker/communications`, `worker/notifications`
- Why it matters: transient failures become durable failures instead of retrying
- Evidence summary: retry processor exists, but scheduler only registers `DISPATCH_QUEUED_JOB`; failures are written as `status: failed`
- Fix direction: register retry cron or merge retry scan into queued dispatch, then prove with tests
- Suggested priority: Now

## AUD-003 — Approval callback state can remain failed after successful domain mutation

- Severity: High
- Confidence: High
- Domain: Reliability
- Affected modules: `approvals`, payroll approval callback, invoice approval callback, announcement approval callback
- Why it matters: system-of-record status becomes unreliable even after real work executed
- Evidence summary: callback processors return early when target entity is already post-approval, without repairing `approval_request.callback_status`
- Fix direction: treat post-approval target state as recovery success and mark callback executed
- Suggested priority: Now

## AUD-004 — Worker verification baseline is red

- Severity: High
- Confidence: High
- Domain: Tests / Ops
- Affected modules: `worker`, shared worker helpers, compliance worker flow
- Why it matters: CI and local verification cannot be trusted as clean regression signals
- Evidence summary: Phase 1 worker test, lint, and type-check all failed; broken compliance spec plus red Redis/search helper suites
- Fix direction: restore green baseline before relying on CI as a trustworthy gate
- Suggested priority: Now

## AUD-005 — Finance allocation path is under-tested for a money-moving transaction

- Severity: High
- Confidence: High
- Domain: Tests / Maintainability
- Affected modules: `finance`
- Why it matters: row-locking allocation logic can regress without meaningful test failures
- Evidence summary: `confirmAllocations()` performs row locks, rebalance, and receipt creation, but only two negative tests cover it
- Fix direction: add happy-path and failure-path transaction-faithful tests
- Suggested priority: Now

## AUD-006 — Frontend critical-flow coverage is mostly visual and mirrored

- Severity: High
- Confidence: High
- Domain: Tests
- Affected modules: `web`, protected school flows including attendance and finance
- Why it matters: authenticated user journeys can break while the suite stays green
- Evidence summary: reviewed Playwright specs only navigate and screenshot; role/layout specs mirror route logic instead of testing live sources
- Fix direction: add seeded-auth journey tests and replace mirrored logic tests with shared-runtime/component tests
- Suggested priority: Now

## AUD-007 — Hotspot modules have outgrown clean boundaries

- Severity: High
- Confidence: High
- Domain: Architecture / Maintainability
- Affected modules: `auth`, `behaviour`, `pastoral`, shared academic tables
- Why it matters: refactor blast radius is too large and too implicit
- Evidence summary: oversized modules and services, direct foreign-table Prisma reads, shared runtime sprawl
- Fix direction: split internal bounded contexts and reduce cross-module table access through facades
- Suggested priority: Next

## AUD-008 — Cross-tenant key rotation has no safety harness

- Severity: High
- Confidence: High
- Domain: Security / Tests
- Affected modules: `worker/security`
- Why it matters: encrypted secret rotation is one-way-risk work across tenants
- Evidence summary: `key-rotation.processor.ts` is the only untested worker processor
- Fix direction: add mandatory dry-run/live-mode tests and failure-accounting assertions
- Suggested priority: Now

## AUD-009 — Production rollback is app-safe but not schema-safe

- Severity: High
- Confidence: High
- Domain: Ops
- Affected modules: deploy pipeline, Prisma migrations, production recovery path
- Why it matters: migration/data failures remain high-cost incidents in a single-production environment
- Evidence summary: automatic rollback restores previous app commit only; database restore is a separate manual runbook path
- Fix direction: use backward-compatible migrations and rehearse restore-from-backup
- Suggested priority: Next

## AUD-010 — Worker health and smoke checks are narrower than the real queue surface

- Severity: Medium
- Confidence: High
- Domain: Ops / Reliability
- Affected modules: worker health, deploy smoke, critical queues outside notifications
- Why it matters: background failure can hide behind a green worker status
- Evidence summary: worker health is based on PostgreSQL, Redis, and the notifications queue only
- Fix direction: broaden health/readiness or add synthetic per-domain worker smoke
- Suggested priority: Next

## AUD-011 — Security hardening governance has drifted

- Severity: Medium
- Confidence: Medium-High
- Domain: Security
- Affected modules: `finance`, `worker/behaviour`, `auth`, `configuration`, Prisma policy inventory
- Why it matters: core isolation is good, but governance drift increases the chance of future security regressions
- Evidence summary: raw SQL exceptions in feature code, email-only brute-force keying, env-based master-key custody, canonical RLS catalogue drift
- Fix direction: centralize raw SQL allowlisting, strengthen throttling, move production key custody out of plain env usage, enforce policy inventory sync
- Suggested priority: Next

## AUD-012 — Local environment contract drift undermines developer trust

- Severity: Medium
- Confidence: High
- Domain: DX
- Affected modules: local setup, API bootstrap, worker env validation, search config
- Why it matters: onboarding and local debugging take longer, and search can degrade silently
- Evidence summary: docs/scripts say `.env.local`, runtime expects `.env`; `.env.example` uses `MEILISEARCH_HOST`, runtime expects `MEILISEARCH_URL`
- Fix direction: standardize file and variable names and fail loudly on deprecated combinations
- Suggested priority: Next
