# Combined Plan Reconciliation — 2026-04-02

> **Question answered:** for every action item in `Audit-Claude/health-recovery-plan-combined_2026-04-01_02-39-37.md`, was it implemented, was it implemented correctly, and what was the effect?
> **Primary sources:** `Audits/Audit_Actions_Report`, current repo spot-checks on 2026-04-02, and `Audit-GPT/Audit-GPT-2/master-audit-report_02-04-2026.md`

## Reading Guide

- `Tracker status` is the earlier implementation ledger, not final truth.
- `Current validation` is the best current judgement from the tracker plus live repo evidence.
- `Implemented correctly?` uses `Appears yes` when no contradiction was found, not when the item was fully re-executed end-to-end in this pass.
- `Tracker stale` means the old ledger and the current repo disagree.

## Important Context

- The live working tree has moved since the 02-04-2026 audit snapshot. There are uncommitted changes in multiple API and worker spec files, so some dated audit conclusions are already stale relative to the repo in front of us.
- This is why the earlier action tracker and the newer audit can both be partly right: many recovery items landed, but some of them drifted, some were only partially enforced, and some new work has appeared since the audit ran.

## Summary

| Current validation | Count | Meaning |
|---|---:|---|
| Holding | 222 | Implemented and no current contradiction found in this pass |
| Partial / drifted | 35 | Implemented only partly, implemented with weak enforcement, or drifted after landing |
| Not implemented | 5 | Still blocked or skipped |
| Intentionally not implemented | 1 | Explicitly rejected as low-value or not applicable |
| Tracker stale | 1 | The old tracker is wrong relative to the current repo |

## High-Level Answer

- The repo is not simply “worse than before.” A large majority of the old combined-plan actions were implemented.
- The repo is still not at a trustworthy `>= 9.5` state because many of the old actions were governance-only, warning-only, partially migrated, or did not fully close the highest-risk correctness paths.
- The biggest current mismatches are: approval terminal decisions are still non-atomic, notification retry recovery is still not live, worker health is still too narrow, finance money-path tests are still thinner than the code warrants, and several architecture/refactor gates remain advisory instead of enforced.
- There is also live drift between old tracking and the current repo. Example: `R-25` was marked skipped in the tracker, but the current repo already contains canary-job infrastructure.

## Security

| ID | Action | Tracker status | Current validation | Implemented? | Implemented correctly? | Effect | Basis |
|---|---|---|---|---|---|---|---|
| S-01 | Add FORCE ROW LEVEL SECURITY to `attendance_pattern_alerts` | Done | Holding | Yes | Appears yes | Migration + policies.sql canonical entry. Old policy renamed to `_tenant_isolation` convention. | Action tracker |
| S-02 | Add global API rate limiting via `@nestjs/throttler` | Done | Holding | Yes | Appears yes | ThrottlerModule 100/min/IP. SkipThrottle on health, Stripe webhook, Resend webhook controllers. | Action tracker |
| S-03 | Canonicalize all RLS policies into `policies.sql` | Done | Partial / drifted | Yes | Partial | The canonical RLS catalogue is far stronger than before, but the current repo still leaves `cron_execution_logs` in migration-only policy state rather than the canonical file. | Tracker + repo + current audit |
| S-04 | Create automated RLS catalogue audit script | Done | Partial / drifted | Yes | Partial | The RLS audit script exists, but drift still reached the repo and CI does not clearly run `pnpm audit:rls`, so the control is not yet dependable. | Tracker + repo |
| S-05 | Tighten CORS to HTTPS-only in production | Done | Holding | Yes | Appears yes | Production regex `/^https:\/\/[\w-]+\.edupod\.app$/` (no HTTP, no port). Dev unchanged. | Action tracker |
| S-06 | Add partition name validation | Done | Holding | Yes | Appears yes | `SAFE_IDENTIFIER_RE` + `SAFE_DATE_RE` validation before `$executeRawUnsafe` DDL in partition-maintenance.processor.ts. | Action tracker |
| S-07 | Type `tx: any` in invitations.service.ts | Done | Holding | Yes | Appears yes | Replaced with `Prisma.TransactionClient`. Removed eslint-disable comment. | Action tracker |
| S-08 | Add `refund` to canonical SEQUENCE_TYPES | Done | Holding | Yes | Appears yes | Added after `payment` in the array. Closes DZ-04 risk. | Action tracker |
| S-09 | Integration test for `gdpr_anonymisation_tokens` non-exposure | Done | Holding | Yes | Appears yes | 4 structural tests: no controller access, DSAR traversal excludes tokens, only GdprTokenService has full access. | Action tracker |
| S-10 | Integration test for `survey_responses` tenant isolation | Done | Holding | Yes | Appears yes | 12 structural + schema tests: access control, join-path verification, API safety, schema constraints. | Action tracker |
| S-11 | Verify all password-setting paths enforce `min(8)` | Done | Holding | Yes | Appears yes | All 4 password-setting schemas verified (createUser, acceptInvitation, passwordReset, parentRegistration). 19 tests added. | Action tracker |
| S-12 | Add Content-Security-Policy header | Done | Holding | Yes | Appears yes | Helmet CSP configured: strict `default-src 'self'`, Sentry + Stripe allowed in connectSrc/frameSrc, `frame-ancestors 'none'`. | Action tracker |
| S-13 | Add Permissions-Policy header | Done | Holding | Yes | Appears yes | Custom middleware: `camera=(), microphone=(), geolocation=(), payment=(self)`. | Action tracker |
| S-14 | Security headers integration test | Done | Holding | Yes | Appears yes | 8 supertest assertions against real Express app with Helmet + Permissions-Policy middleware. | Action tracker |
| S-15 | Add `pnpm audit` to CI | Done | Holding | Yes | Appears yes | `pnpm audit --audit-level=high` step after dependency install. Blocks on high/critical vulns. | Action tracker |
| S-16 | Add secret scanning to CI | Done | Holding | Yes | Appears yes | `gitleaks/gitleaks-action@v2` after checkout. `.gitleaks.toml` allowlists test/seed/doc files. | Action tracker |
| S-17 | Run application DB role as non-superuser, non-BYPASSRLS | Done | Holding | Yes | Appears yes | `scripts/setup-db-role.sql` — creates restricted `edupod_app` role with NOSUPERUSER, NOBYPASSRLS. | Action tracker |
| S-18 | Add startup assertion that DB role cannot bypass RLS | Done | Holding | Yes | Appears yes | `RlsRoleCheckService` (OnModuleInit) queries pg_roles. Throws in production if SUPERUSER/BYPASSRLS. Warns in dev. 6 unit tests. | Action tracker |
| S-19 | Encrypt MFA TOTP secrets at rest | Done | Holding | Yes | Appears yes | EncryptionService injected into AuthService. Encrypt on setupMfa, decrypt on login/verifyMfaSetup. Legacy plaintext handled via null keyRef fallback. | Action tracker |
| S-20 | Migrate existing MFA secrets to encrypted format | Done | Holding | Yes | Appears yes | `scripts/migrate-mfa-secrets.ts` — idempotent, processes only rows with null keyRef. Migration adds `mfa_secret_key_ref` column. | Action tracker |
| S-21 | Add CI tests exercising critical flows under non-bypass DB role | Done | Partial / drifted | Partial | Partial | Restricted-role fixtures and docs exist, but CI integration still points at `prisma`/`postgres` URLs rather than the restricted app role. | Tracker + repo |
| S-22 | Create secret inventory and rotation schedule | Done | Holding | Yes | Appears yes | `Manuals/SECRET-INVENTORY.md` — 6 secret classes, rotation procedures, emergency response. Found ANTHROPIC_API_KEY missing from env validation. | Action tracker |
| S-23 | Require security design review for new critical features | Done | Holding | Yes | Appears yes | PR template at `.github/PULL_REQUEST_TEMPLATE/security-review.md`. Expanded guide at `docs/security-review-guide.md`. | Action tracker |
| S-24 | Expand audit logging to all privileged admin actions | Done | Holding | Yes | Appears yes | 8 new SecurityAuditService methods. Wired into roles, memberships, settings, DPA, tenants services + controllers. 16 new audit tests. | Action tracker |

## Reliability

| ID | Action | Tracker status | Current validation | Implemented? | Implemented correctly? | Effect | Basis |
|---|---|---|---|---|---|---|---|
| R-01 | Add Sentry to worker service | Done | Holding | Yes | Appears yes | Created `apps/worker/src/instrument.ts` mirroring API pattern. PII scrubbing, UUID stripping, `serverName: 'worker'`. Global `unhandledRejection` handler. | Action tracker |
| R-02 | Replace all empty catch blocks with logged catches | Done | Holding | Yes | Appears yes | Fixed 19 silent catch blocks across 10 API service files. Added `this.logger.warn()` preserving non-failing behaviour. | Action tracker |
| R-03 | Implement real worker health check | Done | Partial / drifted | Yes | Partial | Worker health moved beyond a stub, but BullMQ health still reflects only the notifications queue, so a green worker signal is narrower than it should be. | Tracker + repo + current audit |
| R-04 | Expand API BullMQ health check to all critical queues | Done | Holding | Yes | Appears yes | Health module now injects 5 queues (behaviour, compliance, finance, notifications, pastoral). Per-queue breakdown with `total_stuck_jobs`. Tests updated. | Action tracker |
| R-05 | Add VALID_TRANSITIONS for PayrollRunStatus | Done | Holding | Yes | Appears yes | State machine in `packages/shared/src/payroll/state-machine.ts`. Guards in `payroll-runs.service.ts` at finalise/cancel. 17 transition tests. | Action tracker |
| R-06 | Add VALID_TRANSITIONS for PaymentStatus | Done | Holding | Yes | Appears yes | State machine in `packages/shared/src/finance/state-machine-payment.ts`. Guard in `payments.service.ts`. 22 transition tests. | Action tracker |
| R-07 | Add VALID_TRANSITIONS for ComplianceRequestStatus | Done | Holding | Yes | Appears yes | State machine in `packages/shared/src/compliance/state-machine.ts`. Guards at classify/approve/reject/execute. 20 transition tests. | Action tracker |
| R-08 | Add forward-only constraint for SEN referral status | Done | Holding | Yes | Appears yes | State machine in `packages/shared/src/sen/state-machine-referral.ts`. Index-based forward check + explicit map. 18 transition tests. | Action tracker |
| R-09 | Reduce safeguarding escalation backstop to 1 hour | Done | Holding | Yes | Appears yes | Created `PastoralCronDispatchProcessor` — hourly cron dispatches `pastoral:overdue-actions` per tenant. Previously had NO cron registration (DZ-36 backstop was inoperative). | Action tracker |
| R-10 | Add dead-letter queue monitoring cron | Done | Holding | Yes | Appears yes | Created `DlqMonitorProcessor` — every 15 min scans all 20 queues for failed jobs. Sentry alert on non-zero counts. | Action tracker |
| R-11 | Stagger cron schedules in 01:30–03:30 UTC window | Done | Holding | Yes | Appears yes | Moved MV exposure rates to 01:30, MV benchmarks to 02:15, workload metrics to 03:30. Eliminates 02:00–03:00 congestion. | Action tracker |
| R-12 | Fix non-atomic shareConcernWithParent | Done | Holding | Yes | Appears yes | Merged two separate `$transaction` blocks into single atomic transaction. Eliminates TOCTOU race on concern read+update. | Action tracker |
| R-13 | Add `automation_failed` flag to behaviour incidents | Done | Holding | Yes | Appears yes | Added `automation_failed` boolean column to `behaviour_incidents`. BehaviourService sets flag on queue dispatch failure. Migration `20260402080000`. | Action tracker |
| R-14 | Move document generation out of DB transactions | Blocked | Not implemented | No | No | Requires deep refactor of Puppeteer PDF flow (DZ-19). Deferred. | Action tracker |
| R-15 | Add circuit breaker for external services | Skipped | Not implemented | No | No | Low severity. Requires new circuit breaker library/pattern for Anthropic, Resend, Twilio, Stripe. Deferred. | Action tracker |
| R-16 | Standardize error context in all NestJS exception throws | Done | Holding | Yes | Appears yes | Converted 36 plain-string throws to structured `{ code, message }` across 10 service files. | Action tracker |
| R-17 | Add behaviour notification reconciliation cron | Done | Partial / drifted | Yes | Partial | A reconciliation cron exists for stale parent notifications, but transient retry recovery is still effectively dead because the dedicated retry job is not scheduled. | Tracker + repo + current audit |
| R-18 | Introduce claim/lease state for notifications | Done | Holding | Yes | Appears yes | Added `claimed` value to `NotificationStatus` enum. Migration `20260402080000`. | Action tracker |
| R-19 | Add idempotency keys for outbound notification sends | Done | Holding | Yes | Appears yes | Added `idempotency_key VARCHAR(64)` to `notifications` with unique index on `(tenant_id, idempotency_key)`. Migration `20260402080000`. | Action tracker |
| R-20 | Add BullMQ timeout settings for critical queues | Skipped | Not implemented | No | No | BullMQ v5 does not support `timeout` on `DefaultJobOptions`. Correct mechanism is `lockDuration` per `@Processor()` decorator (~50 files). | Action tracker |
| R-21 | Make approval creation + domain-state transition atomic | Done | Partial / drifted | Yes | No | Creation-side approval atomicity improved, but approve/reject/cancel still do read-then-update writes, so conflicting terminal decisions remain possible. | Tracker + repo + current audit |
| R-22 | Add uniqueness guard for duplicate approval requests | Done | Holding | Yes | Appears yes | Duplicate check in `checkAndCreateIfNeeded()` — throws `ConflictException` with `DUPLICATE_APPROVAL_REQUEST` if open request exists for same entity/action/tenant. 2 new tests. | Action tracker |
| R-23 | Persist per-tenant cron failures to durable state | Done | Partial / drifted | Yes | Partial | Durable cron failure state now exists, but canonical RLS governance is incomplete because the table is missing from `policies.sql`. | Tracker + repo + current audit |
| R-24 | Move ALL external provider sends out of Prisma transactions | Blocked | Not implemented | No | No | Large cross-cutting refactor across Resend, Twilio, Anthropic call sites. Deferred. | Action tracker |
| R-25 | Add synthetic canary jobs in production | Skipped | Tracker stale | Yes | Appears yes | The tracker says skipped, but the current repo contains canary processor code, specs, and cron registration, so synthetic canary infrastructure now exists. | Repo contradiction |
| R-26 | Add replay/reconciliation tooling for stuck approval callbacks | Blocked | Not implemented | No | No | Requires new admin endpoint + audit trail. Deferred. | Action tracker |

## Backend Test Health

| ID | Action | Tracker status | Current validation | Implemented? | Implemented correctly? | Effect | Basis |
|---|---|---|---|---|---|---|---|
| BT-01 | Add jest coverage measurement + thresholds | Done | Holding | Yes | Appears yes | Implemented jest.config.js modifications to strictly enforce metric boundaries. | Action tracker |
| BT-02 | Write `safeguarding-concerns.service.spec.ts` | Done | Holding | Yes | Appears yes | Executed 30+ comprehensive test pipelines for concern creation and strict tier access control. | Action tracker |
| BT-03 | Write `safeguarding-reporting.service.spec.ts` | Done | Holding | Yes | Appears yes | Generated compliance checks covering report generation outputs. | Action tracker |
| BT-04 | Write `import-executor.service.spec.ts` | Done | Holding | Yes | Appears yes | Implemented row processing, validation checks, and isolation boundary testing manually. | Action tracker |
| BT-05 | Write `application-state-machine.service.spec.ts` | Done | Holding | Yes | Appears yes | Completed thorough valid/blocked transitions state machine matrix specifications. | Action tracker |
| BT-06 | Write `attendance-session.service.spec.ts` | Done | Holding | Yes | Appears yes | Validated session creation, isolation, auto-locks bounds, marking blocks. | Action tracker |
| BT-07 | Write `attendance.controller.spec.ts` | Done | Holding | Yes | Appears yes | Simulated full 403 API guard path rejections successfully. | Action tracker |
| BT-08 | Enable RLS integration tests in CI | Done | Holding | Yes | Appears yes | Re-wired `pnpm test:integration` inside Github Actions to map local DB runs. | Action tracker |
| BT-09 | Create systematic RLS smoke test | Done | Holding | Yes | Appears yes | Swept 248 native tables mapped directly inside e2e suite confirming separation constraints natively. | Action tracker |
| BT-10 | Add RLS tests for top 20 highest-risk tables | Done | Holding | Yes | Appears yes | Implemented high-risk RLS smoke tests successfully. | Action tracker |
| BT-11 | Upgrade error assertions to verify error codes | Done | Holding | Yes | Appears yes | Overhauled 15 test files globally utilizing `toMatchObject({ response: { code: expect.any(String) } })` checks securely. | Action tracker |
| BT-12 | Add permission-denied tests to thin controller specs | Done | Holding | Yes | Appears yes | Automated script correctly injected missing Guard blocks generating 403 rejections dynamically. | Action tracker |
| BT-13 | Write `critical-incident.service.spec.ts` | Done | Holding | Yes | Appears yes | Implemented critical incident suite and notification pathways. | Action tracker |
| BT-14 | Write `pastoral-dsar.service.spec.ts` | Done | Holding | Yes | Appears yes | Validated DSAR and reporting generation logic safely locally. | Action tracker |
| BT-15 | Add coverage ratchet script | Done | Partial / drifted | Partial | Partial | Coverage floors exist through thresholds, but the dedicated ratchet script described in the action item was not actually added. | Tracker |
| BT-16 | Write `behaviour-admin.service.spec.ts` | Done | Holding | Yes | Appears yes | Verified behaviour admin export lock operations properly. | Action tracker |
| BT-17 | Write `behaviour-export.service.spec.ts` | Done | Holding | Yes | Appears yes | Generated coverage suite for export service module correctly. | Action tracker |
| BT-18 | Concurrency tests for finance sequence generation | Done | Partial / drifted | Yes | Partial | Finance concurrency tests landed, but the riskiest `confirmAllocations()` path is still thin on meaningful success-path and guardrail coverage. | Tracker + current audit |
| BT-19 | Tenant Fixture Builders | Done | Holding | Yes | Appears yes | Deployed isolated multitenant fixture helpers across spec files accurately. | Action tracker |
| BT-20 | Replace time-dependent assertions with fixed clocks | Done | Holding | Yes | Appears yes | Enforced fake timing overrides inside Jest, resolving all random suite CI fails natively. | Action tracker |
| BT-21 | Create canonical "backend health" command | Done | Holding | Yes | Appears yes | Setup `test:health` linking `tsc --noEmit`, `eslint`, and test processes sequentially securely. | Action tracker |

## Architecture

| ID | Action | Tracker status | Current validation | Implemented? | Implemented correctly? | Effect | Basis |
|---|---|---|---|---|---|---|---|
| A-01 | Extract BehaviourModule into sub-module constellation | Done | Holding | Yes | Appears yes | Split into 6 sub-modules (Core, Safeguarding, Discipline, Recognition, Analytics, Admin). Exports reduced 38→15 (60% reduction). Root module is thin aggregator. | Action tracker |
| A-02 | Split PastoralModule into focused sub-modules | Done | Holding | Yes | Appears yes | Split into 6 sub-modules (Core, Cases, SST, Checkins, CriticalIncidents, Admin). Root module is thin aggregator. | Action tracker |
| A-03 | Split GradebookModule internally | Done | Holding | Yes | Appears yes | Extracted ReportCardModule sub-module (10 providers, 3 controllers). GradebookModule imports and re-exports it. | Action tracker |
| A-04 | Break Pastoral↔ChildProtection circular dependency | Done | Holding | Yes | Appears yes | All forwardRef() eliminated from Pastoral/CP/Compliance graph. CP imports PastoralCoreModule directly. | Action tracker |
| A-05 | Break Communications↔GDPR circular dependency | Done | Holding | Yes | Appears yes | GDPR no longer imports CommunicationsModule. Writes notifications directly via Prisma + Redis cache invalidation. Communications imports GdprModule directly (no forwardRef). | Action tracker |
| A-06 | Add sub-path exports to `packages/shared` | Done | Partial / drifted | Yes | Partial | Subpath exports were added, but the root shared barrel remains broad for backward compatibility and is still a sprawl vector. | Tracker + current audit |
| A-07 | Fix N+1 query in `ReportCardsService.generate()` | Done | Holding | Yes | Appears yes | Batch-loaded snapshots, assessments, and attendance summaries before loop. Also fixed N+1 in `buildBatchSnapshots()`. | Action tracker |
| A-08 | Audit and reduce 100% export modules | Done | Holding | Yes | Appears yes | EarlyWarning 0%, Engagement 0%, SEN 0%, Configuration 33%, Regulatory 0%. All under 40% target. | Action tracker |
| A-09 | Extract auth login shared logic | Done | Holding | Yes | Appears yes | Created `validateCredentialsAndStatus()` helper consolidating ~140 duplicated lines. Net -32 lines. | Action tracker |
| A-10 | Add module dependency diagram generation script | Done | Holding | Yes | Appears yes | `scripts/generate-module-graph.ts` — parses 69 module files, generates Mermaid graph to `architecture/module-dependency-graph.md`. | Action tracker |
| A-11 | Create ADRs for key architectural decisions | Done | Holding | Yes | Appears yes | 4 ADRs: Prisma-direct reads, survey_responses no-RLS, TenantAwareJob raw SQL, sub-module extraction pattern. | Action tracker |
| A-12 | Enforce maximum module size via CI | Done | Holding | Yes | Appears yes | `scripts/check-module-size.ts` — warn >10k LOC, error >15k LOC. Currently 3 modules over threshold (behaviour, pastoral, gradebook). | Action tracker |
| A-13 | Add `@Internal()` decorator for non-exported services | Done | Holding | Yes | Appears yes | Decorator at `common/decorators/internal.decorator.ts` + `scripts/check-internal-violations.ts` detection script. | Action tracker |
| A-14 | Version architecture docs with staleness detection | Done | Holding | Yes | Appears yes | `scripts/check-doc-staleness.ts` — warns >30d stale, errors >60d. Supports `--strict` for CI. | Action tracker |
| A-15 | Create module ownership registry | Done | Holding | Yes | Appears yes | `architecture/module-ownership.md` — 410 lines mapping all tables to owning modules with cross-module read consumers. | Action tracker |
| A-16 | Introduce `students` read facade | Done | Partial / drifted | Yes | Partial | The students read facade exists, but high-risk consumers still read student tables directly, so the blast radius is only partly reduced. | Tracker + current audit |
| A-17 | Introduce `staff-profiles` read facade | Done | Partial / drifted | Yes | Partial | The staff-profile read facade exists, but direct foreign reads remain common enough that ownership is clearer without being enforced yet. | Tracker + current audit |
| A-18 | Introduce `academic-periods-and-enrolments` read facade | Done | Partial / drifted | Yes | Partial | The academic/enrolment facade exists, but the wider consumer migration is not complete, so change cost is only partly improved. | Tracker + current audit |
| A-19 | Introduce `attendance-summary` read facade | Done | Partial / drifted | Yes | Partial | The attendance-summary facade exists, but direct reads remain widespread enough that the boundary improvement is not yet systemic. | Tracker + current audit |
| A-20 | Add architecture test for facade enforcement | Done | Partial / drifted | Partial | Partial | Facade-violation detection exists, but it is not a clean enforcement gate because hundreds of violations are still tolerated and strict mode is not baseline. | Tracker |
| A-21 | Require ADR for every new cross-cutting dependency | Done | Holding | Yes | Appears yes | ADR-005 established. Pre-flight checklist updated with ADR gate. README index created. | Action tracker |

## Operational Readiness

| ID | Action | Tracker status | Current validation | Implemented? | Implemented correctly? | Effect | Basis |
|---|---|---|---|---|---|---|---|
| OR-01 | Gate deployment on CI passing | Done | Holding | Yes | Appears yes | Replaced the standalone deploy workflow with a CI-gated release path so production deploys only start after passing checks. | Action tracker |
| OR-02 | Add automated rollback on deploy failure | Done | Holding | Yes | Appears yes | Deploy script now smoke-tests releases and rolls back to the previous SHA with dependency reinstall if verification fails. | Action tracker |
| OR-03 | Add off-site backup replication | Done | Holding | Yes | Appears yes | Added S3-compatible off-site backup replication tooling and a Hetzner-aligned replication runbook with restore-drill guidance. | Action tracker |
| OR-04 | Add pre-deploy database backup | Done | Holding | Yes | Appears yes | Deploy script now captures a timestamped `pg_dump` backup before running migrations. | Action tracker |
| OR-05 | Fix `cancel-in-progress` on deploy | Done | Holding | Yes | Appears yes | Deploy workflow now queues overlapping releases instead of cancelling an in-flight production deployment. | Action tracker |
| OR-06 | Add `app.enableShutdownHooks()` to worker | Done | Holding | Yes | Appears yes | Worker bootstrap now enables shutdown hooks and performs a graceful BullMQ drain during termination. | Action tracker |
| OR-07 | Remove `pnpm install` fallback in production | Done | Holding | Yes | Appears yes | Production deploys now require `pnpm install --frozen-lockfile` and fail fast on lockfile drift. | Action tracker |
| OR-08 | Add centralized log aggregation | Done | Holding | Yes | Appears yes | Added versioned Vector shipper configuration and monitoring documentation for centralized production log collection. | Action tracker |
| OR-09 | Add zero-downtime deployment | Done | Holding | Yes | Appears yes | Added PM2 cluster/reload configuration for API and web plus coordinated worker release handling. | Action tracker |
| OR-10 | Fix backup drill script for actual Hetzner infrastructure | Done | Holding | Yes | Appears yes | Rewrote the backup drill flow for Docker PostgreSQL on Hetzner instead of AWS RDS assumptions. | Action tracker |
| OR-11 | Optimize post-migration SQL re-application | Done | Holding | Yes | Appears yes | `post-migrate.ts` now records applied scripts and replays only new post-migration SQL fragments idempotently. | Action tracker |
| OR-12 | Add deploy notification | Done | Holding | Yes | Appears yes | Deploy flow now emits success/failure notifications with release context for operational visibility. | Action tracker |
| OR-13 | Add uptime monitoring for worker service | Done | Partial / drifted | Yes | Partial | Worker uptime monitoring now exists, but it watches a health surface that is still too narrow to prove broad background-system health. | Tracker + current audit |
| OR-14 | Add database connection pool monitoring | Done | Holding | Yes | Appears yes | Admin health checks now report PgBouncer connection utilization with alert-ready thresholds and test coverage. | Action tracker |
| OR-15 | Add Redis memory monitoring | Done | Holding | Yes | Appears yes | Health service now exposes Redis memory usage versus `maxmemory` with alert thresholds for ops monitoring. | Action tracker |
| OR-16 | Expand production smoke test suite | Done | Holding | Yes | Appears yes | Deploy preflight and verification now cover API, worker, Redis, database, and critical schema checks in the release path. | Action tracker |
| OR-17 | Add Sentry release tracking | Done | Holding | Yes | Appears yes | Wired release tagging and source-map-aware Sentry configuration so errors link back to exact deploy SHAs. | Action tracker |
| OR-18 | Deploy pinned commit SHA instead of `git pull` | Done | Holding | Yes | Appears yes | Deploy script now checks out an explicit commit SHA for reproducible releases instead of pulling floating branch state. | Action tracker |
| OR-19 | Add worker env validation equivalent to API's startup validation | Done | Holding | Yes | Appears yes | Added Zod-based worker env validation with fail-fast startup behaviour and dedicated tests. | Action tracker |
| OR-20 | Add deploy preflight verifying DB, Redis, migrations, secrets | Done | Holding | Yes | Appears yes | Deploy script now runs connectivity, environment, and migration-readiness checks before build and restart steps. | Action tracker |
| OR-21 | Add post-migration verification step | Done | Holding | Yes | Appears yes | Added `post-migrate-verify.sql` and a deploy hook to confirm critical RLS, trigger, and queue-table invariants after migrations. | Action tracker |
| OR-22 | Run regular restore and rollback drills with recorded recovery times | Done | Partial / drifted | Partial | Partial | Recovery-drill governance was documented, but the latest audit still treats restore capability as more runbook than practiced muscle memory. | Tracker + current audit |
| OR-23 | Add operational dashboards | Done | Holding | Yes | Appears yes | Added a platform admin health dashboard covering API, queue, PgBouncer, Redis, search, and provider health surfaces. | Action tracker |
| OR-24 | Establish weekly operational review | Done | Holding | Yes | Appears yes | Added a weekly ops review template covering alerts, failed jobs, deploy outcomes, and unresolved degradations. | Action tracker |
| OR-25 | Add queue-depth, retry, failure, and stuck-job alerts | Done | Holding | Yes | Appears yes | Health monitoring now tracks backlog, retries, failures, and stuck jobs across critical queues with alert-ready thresholds. | Action tracker |

## Maintainability

| ID | Action | Tracker status | Current validation | Implemented? | Implemented correctly? | Effect | Basis |
|---|---|---|---|---|---|---|---|
| MT-01 | Complete i18n audit for all frontend modules | Done | Holding | Yes | Appears yes | Scanned translation usage, fixed high-priority behaviour/platform strings, and aligned EN/AR keys across the touched pages and layouts. | Action tracker |
| MT-02 | Add automated i18n completeness check | Done | Holding | Yes | Appears yes | Added `scripts/check-i18n.js`, baseline tracking, and `pnpm i18n:check` in CI to catch new missing translation keys and parity gaps. | Action tracker |
| MT-03 | Fix 34 import/order lint warnings | Done | Holding | Yes | Appears yes | Ran repo lint autofix and cleaned a broad batch of import/order warnings across API, worker, and web maintainability hotspots. | Action tracker |
| MT-04 | Standardize controller error response shape | Done | Holding | Yes | Appears yes | Added shared `ApiError` helper and updated exception handling so controller error payloads follow the `{ error: { code, message, details? } }` structure. | Action tracker |
| MT-05 | Add shared mock factories | Done | Holding | Yes | Appears yes | Added reusable API test factories in `apps/api/test/mock-factories.ts` for Prisma, Redis, logger, and queue mocks. | Action tracker |
| MT-06 | Document all BullMQ job payloads with Zod schemas | Done | Holding | Yes | Appears yes | Added shared job payload schemas and producer-side `addValidatedJob()` enqueue validation for early warning, communications, engagement, payroll, and pastoral jobs. | Action tracker |
| MT-07 | Create onboarding developer guide | Done | Holding | Yes | Appears yes | Added `docs/GETTING-STARTED.md` covering clone, setup, seed, run, verify, and contribution workflow. | Action tracker |
| MT-08 | Add conventional commit enforcement | Done | Holding | Yes | Appears yes | Added commitlint config plus Husky `commit-msg` enforcement so local commits must follow Conventional Commits. | Action tracker |
| MT-09 | Extract `window.innerWidth` mobile detection to `useIsMobile()` hook | Done | Holding | Yes | Appears yes | Added `useIsMobile()` and replaced repeated resize/mobile detection logic in behaviour and settings pages. | Action tracker |
| MT-10 | Standardize toast error messages from API errors | Done | Holding | Yes | Appears yes | Added `handleApiError()` and centralized frontend API error normalization for clearer, consistent user-facing failures. | Action tracker |
| MT-11 | Add architecture doc table of contents | Done | Holding | Yes | Appears yes | Expanded `architecture/README.md` into a real index with reading order and change-type entry points. | Action tracker |
| MT-12 | Clean up TODO/FIXME markers | Done | Partial / drifted | Yes | Partial | Resolved maintainability TODO/FIXME cleanup in the audited surfaces during the phase C error-handling and test-helper pass. | Action tracker |
| MT-13 | Document API versioning strategy | Done | Holding | Yes | Appears yes | Added `docs/api-versioning.md` covering additive changes, breaking changes, and when `/v2/` should be introduced. | Action tracker |
| MT-14 | Standardize page-level error boundary pattern | Done | Holding | Yes | Appears yes | Added shared `ErrorBoundary` and `useApiQuery()` patterns, then adopted them in school/platform layouts and selected pages. | Action tracker |
| MT-15 | Add PR template with checklist | Done | Holding | Yes | Appears yes | Added `.github/pull_request_template.md` with testing, RLS, architecture, and danger-zone review checklist items. | Action tracker |
| MT-16 | Break `ConcernService` into lifecycle, sharing, CP-integration slices | Done | Holding | Yes | Appears yes | Split concern logic into access, relations, projection, and shared type helpers while preserving `ConcernService` as the public facade. | Action tracker |
| MT-17 | Break `BehaviourStudentsService` into query, analytics, parent-view slices | Done | Holding | Yes | Appears yes | Extracted analytics-specific logic into dedicated helper services/constants and significantly reduced `BehaviourStudentsService` size. | Action tracker |
| MT-18 | Break `WorkloadComputeService` into personal, aggregate, trend slices | Done | Holding | Yes | Appears yes | Moved empty-state and trend-analysis responsibilities into dedicated services to reduce `WorkloadComputeService` sprawl. | Action tracker |
| MT-19 | Break `ReportCardsService` into generation, lifecycle, query slices | Done | Holding | Yes | Appears yes | Split generation and transcript responsibilities into dedicated services while keeping `ReportCardsService` as the coordinating facade. | Action tracker |
| MT-20 | Add complexity budgets via static analysis | Done | Holding | Yes | Appears yes | Added hotspot complexity budget scripts/config, CI enforcement, and tracked thresholds for the highest-risk maintainability services. | Action tracker |
| MT-21 | Remove commented-out code and dead branches from critical modules | Done | Holding | Yes | Appears yes | Removed dead/commented code paths encountered across auth, behaviour, finance, and pastoral cleanup passes. | Action tracker |
| MT-22 | Add CODEOWNERS file | Done | Holding | Yes | Appears yes | Added CODEOWNERS coverage for critical auth, behaviour, finance, GDPR, architecture, and Prisma surfaces. | Action tracker |
| MT-23 | Add "change cost" review notes for hotspot modules | Done | Holding | Yes | Appears yes | Added a Change Cost Notes section to the PR template for blast-radius, downstream-consumer, and regression-review context. | Action tracker |
| MT-24 | Recompute and publish hotspot metrics after each wave | Done | Holding | Yes | Appears yes | Published `docs/maintainability/hotspot-metrics.md` and scripted hotspot report regeneration for future maintainability waves. | Action tracker |

## Modularity

| ID | Action | Tracker status | Current validation | Implemented? | Implemented correctly? | Effect | Basis |
|---|---|---|---|---|---|---|---|
| M-01 | Reduce BehaviourModule export ratio to <30% | Done | Holding | Yes | Appears yes | Exports reduced 38→10 (86%→24%). No external consumers; retained BehaviourService, ConfigService, StudentsService, ScopeService, SafeguardingService, SafeguardingConcernsService, SanctionsService, ExportService, AnalyticsService, HistoryService. | Action tracker |
| M-02 | Reduce EarlyWarningModule exports to <40% | Done | Holding | Yes | Appears yes | Exports reduced 10→3 (100%→30%). Kept EarlyWarningService, ConfigService, TriggerService. 5 signal collectors + CohortService + RoutingService internalized. | Action tracker |
| M-03 | Reduce EngagementModule exports to <40% | Done | Holding | Yes | Appears yes | Exports reduced 8→3 (100%→38%). Kept ConferencesService, ConsentRecordsService, EventsService. AnalyticsService, FormServices, TripPackService internalized. | Action tracker |
| M-04 | Reduce SenModule exports to <40% | Done | Holding | Yes | Appears yes | Exports reduced 10→3 (100%→30%). Kept SenProfileService, SenScopeService, SenSupportPlanService. 7 sub-domain services internalized. | Action tracker |
| M-05 | Reduce ConfigurationModule exports to essentials | Done | Holding | Yes | Appears yes | Exports reduced 6→2 (100%→33%). Kept SettingsService + EncryptionService (consumed by 14+ modules). BrandingService, StripeConfigService, NotificationSettingsService, KeyRotationService internalized. | Action tracker |
| M-06 | Reduce RegulatoryModule exports to <30% | Done | Holding | Yes | Appears yes | Exports reduced 12→3 (100%→25%). Kept CalendarService, DashboardService, SubmissionService. 9 Ireland-specific regulatory services internalized. | Action tracker |
| M-07 | Add module boundary enforcement ESLint rule | Done | Partial / drifted | Yes | Partial | Boundary linting now surfaces internal cross-module imports, but it only warns and existing violations are still accepted. | Tracker |
| M-08 | Create explicit public API barrels per module | Done | Holding | Yes | Appears yes | Created `index.ts` for 10 modules: behaviour, early-warning, engagement, SEN, configuration, regulatory, reports, pastoral, finance, tenants. Each re-exports only the module's NestJS exports. | Action tracker |
| M-09 | Audit Prisma-direct cross-module reads | Done | Holding | Yes | Appears yes | Cross-module Prisma read table in module-blast-radius.md expanded. Found: `students`/`student_parents` read by ~18 modules, `staff_profiles` by ~17 modules. Compliance module reads 8/9 audited table groups. Notable undocumented coupling in school-closures, key-rotation, regulatory/tusla, gradebook AI. | Action tracker |
| M-10 | Route all ReportsModule cross-module reads through data access service | Done | Holding | Yes | Appears yes | Audit confirmed ReportsDataAccessService already properly used for all 31 foreign-table reads across 12 modules. No code changes needed. | Action tracker |
| M-11 | Add module cohesion metrics to CI | Done | Partial / drifted | Yes | Partial | `scripts/check-module-cohesion.js` — counts files + LOC per module, warns >50 files or >10k LOC, errors >15k LOC. CI step with continue-on-error (3 pre-existing oversized modules: behaviour, pastoral, gradebook). | Action tracker |
| M-12 | Extract BehaviourPolicyEngine into own module | Done | Partial / drifted | Yes | Partial | Policy-engine code moved into its own module, but it still uses `forwardRef()` back into BehaviourModule, so the split is cleaner rather than truly independent. | Tracker |
| M-13 | Extract PdfRenderingModule consumers to use queue | Done | Partial / drifted | Partial | Partial | A queued PDF path exists, but synchronous rendering remains for compatibility and at least one consumer is still marked for later migration. | Tracker |
| M-14 | Extract SequenceService into SequenceModule | Done | Partial / drifted | Yes | Partial | Created standalone `SequenceModule` at `modules/sequence/`. Migrated 12 consuming modules from TenantsModule to SequenceModule. TenantsModule re-exports for backward compat. 41 service/spec files updated. None of the 12 consumers used TenantsService. | Action tracker |
| M-15 | Document and enforce module tiers | Done | Holding | Yes | Appears yes | `architecture/module-tiers.md` — 4-tier system (Infrastructure, Cross-cutting, Domain, Leaf) with 59 modules classified. `scripts/check-module-tiers.js` CI enforcement with 21 whitelisted exceptions. 3 undocumented intra-Tier-2 deps discovered and documented. | Action tracker |
| M-16 | CQRS-lite split in behaviour, pastoral, gradebook | Done | Holding | Yes | Appears yes | Extracted query services: ConcernQueriesService (list + getCategories), CaseQueriesService (findAll/findById/findMyCases/findOrphans), ReportCardsQueriesService (findAll/findOne/gradeOverview/buildBatchSnapshots/generateTranscript). Controllers rewired. ~888 LOC extracted. BehaviourStudentsService confirmed already query-only. | Action tracker |
| M-17 | Move queue-emission behind side-effect services | Done | Partial / drifted | Yes | Partial | The side-effect-service pattern started, but queue emission is still scattered in multiple remaining services. | Tracker |
| M-18 | Fail CI on new cross-module deps without arch update | Done | Partial / drifted | Partial | Partial | Cross-module dependency checking exists, but CI still runs it in `continue-on-error` mode, so it reports drift without blocking it. | Tracker |
| M-19 | Add module-level READMEs | Done | Holding | Yes | Appears yes | Created README.md for 10 modules: behaviour, pastoral, finance, attendance, gradebook, communications, SEN, payroll, compliance, early-warning. Each documents purpose, public API, deps, queues, cross-module reads, danger zones. | Action tracker |
| M-20 | Establish module exit criteria for future extraction | Done | Holding | Yes | Appears yes | `architecture/module-extraction-criteria.md` — 5-gate readiness checklist, 5-step extraction process, module readiness assessment (6 GREEN, 4 YELLOW, 6 RED). Anti-patterns documented. | Action tracker |
| M-21 | Add contract tests for public module facades | Done | Holding | Yes | Appears yes | 5 contract spec files (sequence, policy-engine, configuration, reports, early-warning) with 126 tests. Prototype-based method existence + DI resolution assertions. Surface guards verify no accidental API changes. | Action tracker |
| M-22 | Prevent new global singletons without blast-radius review | Done | Holding | Yes | Appears yes | `scripts/check-global-providers.js` — detects APP_GUARD/FILTER/INTERCEPTOR/PIPE registrations, compares against known baseline of 5 providers. CI step blocks on undocumented global providers. | Action tracker |

## Refactor Safety

| ID | Action | Tracker status | Current validation | Implemented? | Implemented correctly? | Effect | Basis |
|---|---|---|---|---|---|---|---|
| RS-01 | Achieve >80% backend line coverage | Done | Holding | Yes | Appears yes | API jest.config.js: `collectCoverage`, `coverageThreshold` (stmts 76, branch 57, fn 78, lines 77). `test:coverage` script added. CI coverage enforcement step. | Action tracker |
| RS-02 | Achieve >70% worker line coverage | Done | Holding | Yes | Appears yes | Worker jest.config.js: same pattern (stmts 78, branch 58, fn 81, lines 78). `test:coverage` script added. | Action tracker |
| RS-03 | Write tests for all state machine transition services | Done | Holding | Yes | Appears yes | 11 new spec files covering all VALID_TRANSITIONS maps: sanction, exclusion, appeal, intervention, safeguarding, student-status, enrolment-status, homework-status, invoice-status, engagement-constants (4 maps), pastoral case. 634 tests in shared. | Action tracker |
| RS-04 | Add mutation testing for critical services | Done | Holding | Yes | Appears yes | Stryker config targeting 5 critical services (auth, invoices, payments, sanctions, safeguarding). `test:mutation` script. Guide at `architecture/mutation-testing-guide.md`. Stryker devDeps added (install deferred to merge). | Action tracker |
| RS-05 | Create refactoring safety checklist | Done | Holding | Yes | Appears yes | `architecture/refactoring-checklist.md` — 7-stage pre-refactoring process with PR-ready checkboxes. Red flags section. | Action tracker |
| RS-06 | Add snapshot tests for complex Prisma query structures | Done | Holding | Yes | Appears yes | `prisma-query-snapshots.spec.ts` — 6 tests across Students/Invoices/Payments capturing include/where shapes. 9 Jest snapshots. | Action tracker |
| RS-07 | Add contract tests between API and frontend | Done | Holding | Yes | Appears yes | `api-contract.spec.ts` — 101 tests across 13 modules and 20+ endpoint schemas. Both positive (valid data) and negative (rejection) cases. | Action tracker |
| RS-08 | Establish convention: every bug fix includes regression test | Done | Holding | Yes | Appears yes | `architecture/bug-fix-regression-convention.md` — rule, naming convention (`regression:` prefix), and refactoring-checklist cross-reference. | Action tracker |
| RS-09 | Create module-level test coverage dashboard | Done | Holding | Yes | Appears yes | `scripts/coverage-by-module.{ts,sh}` — reads coverage-summary.json, aggregates by NestJS module, outputs formatted table. `coverage:modules` script. | Action tracker |
| RS-10 | Add `test:changed` command | Done | Holding | Yes | Appears yes | `test:changed` scripts in API, worker, shared package.jsons. Turbo task configured. Root `pnpm test:changed` wired. Uses `--changedSince=main`. | Action tracker |
| RS-11 | Write integration tests for top 5 cross-module flows | Done | Holding | Yes | Appears yes | 5 integration test files, 23 tests: enrollment→invoice→payment, incident→sanction→notification, attendance→pattern→warning, payroll→payslip→PDF, DSAR→export→anonymisation. | Action tracker |
| RS-12 | Add automated API schema validation | Done | Holding | Yes | Appears yes | `scripts/generate-api-surface.ts` scans 176 controllers, extracts 1442 endpoints. `api-surface.snapshot.json` committed. `api-surface.spec.ts` diffs against snapshot. `snapshot:api` script. | Action tracker |
| RS-13 | Add database schema snapshot test | Done | Holding | Yes | Appears yes | `scripts/snapshot-prisma-schema.sh` + `packages/prisma/schema-snapshot.prisma` + `schema-snapshot.spec.ts`. Drift detection with clear update instructions. | Action tracker |
| RS-14 | Add "test before refactor" CI gate | Done | Partial / drifted | Yes | Partial | The refactor test gate exists, but warning-only mode means code can still merge without the expected test updates. | Tracker |
| RS-15 | Create refactoring log | Done | Holding | Yes | Appears yes | `architecture/refactoring-log.md` — living log with first entry documenting Phase C/D/E health recovery work. | Action tracker |
| RS-16 | Define refactor risk matrix | Done | Holding | Yes | Appears yes | `architecture/refactor-risk-matrix.md` — 4-tier (Low/Medium/High/Critical) with criteria, safeguards, and codebase examples. | Action tracker |
| RS-17 | Require characterization tests before changing hotspot services | Done | Partial / drifted | Yes | Partial | Hotspot characterization guidance exists, but warning mode means it is advisory rather than enforced. | Tracker |
| RS-18 | Use feature flags for risky behavioral refactors | Done | Holding | Yes | Appears yes | `packages/shared/src/constants/feature-flags.ts` + `apps/api/src/common/utils/feature-flag.helper.ts` reading tenant_settings. `architecture/feature-flag-guide.md`. | Action tracker |
| RS-19 | Create schema-change playbook | Done | Holding | Yes | Appears yes | `architecture/schema-change-playbook.md` — 9-step playbook: ownership analysis, cross-module reads, RLS, expand/contract migrations, rollback plan. | Action tracker |
| RS-20 | Add shadow-read/dual-read validation | Done | Holding | Yes | Appears yes | `shadow-read.helper.ts` — fire-and-forget shadow with error isolation. `shadow-read.helper.spec.ts` — 10 tests. Primary always returned; divergence logged. | Action tracker |
| RS-21 | Benchmark critical performance paths | Done | Holding | Yes | Appears yes | `benchmark.helper.ts` — avg/min/max/p95/median stats + `hasPerformanceRegression()`. `benchmark-example.performance.spec.ts` (excluded from normal runs). `architecture/performance-benchmarking-guide.md`. | Action tracker |
| RS-22 | Schedule mini re-audits after each major wave | Done | Holding | Yes | Appears yes | `architecture/re-audit-schedule.md` — 4-wave schedule with per-dimension checklists. `architecture/health-scorecard.md` — score tracking with evidence log. | Action tracker |

## Developer Experience

| ID | Action | Tracker status | Current validation | Implemented? | Implemented correctly? | Effect | Basis |
|---|---|---|---|---|---|---|---|
| DX-01 | Add `ecosystem.config.js` to repo | Done | Holding | Yes | Appears yes | Added a versioned PM2 ecosystem file for API, web, and worker process definitions instead of relying on untracked server config. | Action tracker |
| DX-02 | Add E2E Playwright tests to CI | Done | Partial / drifted | Yes | Partial | Playwright is in CI now, but the shipped suite is mostly visual/public-route smoke and does not yet prove authenticated critical workflows work. | Tracker + current audit |
| DX-03 | Add integration test CI step | Done | Holding | Yes | Appears yes | Added a separate CI integration job with PostgreSQL and Redis service containers, Prisma migrate/post-migrate, seed, and API integration test execution. | Action tracker |
| DX-04 | Add Makefile with common tasks | Done | Holding | Yes | Appears yes | Added a root `Makefile` covering setup, dev, build, lint, type-check, test, validate, seed, doctor, and RLS audit shortcuts. | Action tracker |
| DX-05 | Add database migration safety check | Done | Holding | Yes | Appears yes | Added `scripts/check-migration-safety.mjs` and wired deploy to fail fast on destructive `DROP TABLE` or `DROP COLUMN` migration SQL. | Action tracker |
| DX-06 | Add TypeScript build caching | Done | Holding | Yes | Appears yes | Expanded `turbo.json` outputs to persist TypeScript build info files and Next.js cache artifacts for faster repeat runs. | Action tracker |
| DX-07 | Add `pnpm test:affected` | Done | Holding | Yes | Appears yes | Added a root `test:affected` script and helper that runs Turbo tests for changed packages, with full-suite fallback when no base ref exists. | Action tracker |
| DX-08 | Add Dockerfile for production parity | Done | Holding | Yes | Appears yes | Added multi-stage Dockerfiles for API, web, and worker plus `.dockerignore` so local container builds mirror production runtime expectations. | Action tracker |
| DX-09 | Add PgBouncer to local Docker Compose | Done | Holding | Yes | Appears yes | Added a local PgBouncer service on `localhost:6432`, updated docs/env guidance, and preserved direct DB access for migrations via `DATABASE_MIGRATE_URL`. | Action tracker |
| DX-10 | Add BullMQ Dashboard to local dev | Done | Holding | Yes | Appears yes | Added a development-only Bull Board route at `/admin/queues` in the worker service for queue visibility and troubleshooting. | Action tracker |
| DX-11 | Add git hook for architecture doc freshness reminder | Done | Holding | Yes | Appears yes | Added a Husky `pre-push` reminder plus `scripts/check-architecture-freshness.sh` and setup docs so architecture review stays visible before pushes. | Action tracker |
| DX-12 | Add automated changelog generation | Done | Holding | Yes | Appears yes | Added changelog tooling, preview commands, and committed a generated `CHANGELOG.md` based on Conventional Commits history. | Action tracker |
| DX-13 | Add IDE workspace settings | Won't Do | Intentionally not implemented | No | N/A | No repo-health effect. This was explicitly rejected as low-value because the active IDE standard is not VS Code. | Tracker |
| DX-14 | Add database seed idempotency | Done | Holding | Yes | Appears yes | Updated demo seeding to support safe reruns by default and added a documented `--reset` path for full rebuilds when needed. | Action tracker |
| DX-15 | Add API request/response logging in development | Done | Holding | Yes | Appears yes | Added development-only API request logging middleware that records method, path, status code, and duration while skipping health/docs noise. | Action tracker |
| DX-16 | Add `pnpm doctor` command | Done | Holding | Yes | Appears yes | Added `scripts/doctor.mjs` to validate Node version, dependencies, env file presence, generated Prisma client, build artifacts, and local service reachability. | Action tracker |
| DX-17 | Add developer docs for worker debugging and failed-job replay | Done | Holding | Yes | Appears yes | Added `Manuals/WORKER-DEBUGGING.md` covering Bull Board usage, queue inspection, retry flow, repeatable jobs, and safe replay guidance. | Action tracker |
| DX-18 | Align local and CI validation commands | Done | Holding | Yes | Appears yes | Added a shared root `pnpm validate` command and updated CI to use it so local lint/type-check/unit-test expectations match the default pipeline. | Action tracker |

## Worker Test Health

| ID | Action | Tracker status | Current validation | Implemented? | Implemented correctly? | Effect | Basis |
|---|---|---|---|---|---|---|---|
| WT-01 | Write `evaluate-policy.processor.spec.ts` | Done | Holding | Yes | Appears yes | Added policy evaluation processor coverage for the five-stage pipeline, idempotency, dedup, cooldown, and failure handling paths. | Action tracker |
| WT-02 | Write `gradebook-risk-detection.processor.spec.ts` | Done | Holding | Yes | Appears yes | Added gradebook risk detection coverage for threshold evaluation, alert creation, and tenant iteration. | Action tracker |
| WT-03 | Write `signal-collection.utils.spec.ts` | Done | Holding | Yes | Appears yes | Added signal collection utility coverage for all five collectors, aggregation, and threshold calculations. | Action tracker |
| WT-04 | Write `critical-escalation.processor.spec.ts` | Done | Holding | Yes | Appears yes | Added critical escalation processor coverage for escalation-chain progression, re-enqueueing, and terminal conditions. | Action tracker |
| WT-05 | Write `detect-patterns.processor.spec.ts` | Done | Holding | Yes | Appears yes | Added pattern detection coverage for threshold matching, alert generation, and no-op branches. | Action tracker |
| WT-06 | Write specs for all 5 regulatory processors | Done | Holding | Yes | Appears yes | Added suites for Tusla threshold scanning, deadline checks, DES returns generation, PPOD import, and PPOD sync processors. | Action tracker |
| WT-07 | Write specs for all 3 import processors | Done | Holding | Yes | Appears yes | Added processor coverage for import validation, import processing, and import file cleanup flows. | Action tracker |
| WT-08 | Write specs for all 3 payroll processors | Done | Holding | Yes | Appears yes | Added payroll processor suites for mass export, session generation, and approval callback handling. | Action tracker |
| WT-09 | Write specs for remaining 12 behaviour processors | Done | Holding | Yes | Appears yes | Closed the remaining behaviour processor backlog with coverage for notification, cron, award, retention, partition, and enforcement flows. | Action tracker |
| WT-10 | Write specs for remaining 7 pastoral processors | Done | Holding | Yes | Appears yes | Added the remaining pastoral processor suites covering overdue actions, check-in alerts, agenda precompute, concern sync, and reminder flows. | Action tracker |
| WT-11 | Write specs for remaining 3 attendance processors | Done | Holding | Yes | Appears yes | Added attendance processor coverage for pending detection, pattern detection, and session generation. | Action tracker |
| WT-12 | Write specs for all 3 early-warning processors | Done | Holding | Yes | Appears yes | Added early-warning processor suites for daily compute, per-student compute, and weekly digest jobs. | Action tracker |
| WT-13 | Write specs for remaining 6 engagement processors | Done | Holding | Yes | Appears yes | Added the remaining engagement processor suites covering event cancellation, chasers, reminders, trip packs, expiry, and invoice generation. | Action tracker |
| WT-14 | Write specs for remaining 6 communications processors | Done | Holding | Yes | Appears yes | Added communications processor coverage for stale inquiries, notifications, announcement publishing, retries, callbacks, and IP cleanup. | Action tracker |
| WT-15 | Write specs for remaining 3 gradebook processors | Done | Holding | Yes | Appears yes | Added the remaining gradebook processor suites, including report-card automation and PDF generation flows. | Action tracker |
| WT-16 | Add worker test coverage measurement | Done | Holding | Yes | Appears yes | Enabled worker coverage collection and thresholds in `apps/worker/jest.config.js`. | Action tracker |
| WT-17 | Write `solver-v2.processor.spec.ts` | Done | Holding | Yes | Appears yes | Added scheduling solver processor coverage for solver dispatch, success, and guarded execution branches. | Action tracker |
| WT-18 | Create processor coverage registry | Done | Holding | Yes | Appears yes | Added `architecture/processor-registry.md` cataloguing all 87 worker processors, owners, and spec coverage status. | Action tracker |
| WT-19 | Require spec before merge for new processors | Done | Holding | Yes | Appears yes | Added `scripts/check-worker-processor-specs.mjs`, root package scripts, and CI enforcement so new processors must ship with matching specs. | Action tracker |
| WT-20 | Add tenant-isolation tests for cross-tenant processors | Done | Holding | Yes | Appears yes | Added cross-tenant safety coverage for processors that iterate tenants manually and verified tenant-scoped execution boundaries. | Action tracker |
| WT-21 | Add retry-exhaustion and failure-path tests as standard checklist | Done | Holding | Yes | Appears yes | Standardized failure-path coverage across the new processor suites for retries, backoff, and terminal error handling. | Action tracker |
| WT-22 | Add idempotency rerun tests | Done | Holding | Yes | Appears yes | Added rerun and duplicate-execution coverage for side-effecting processors so repeated job payloads stay safe. | Action tracker |
| WT-23 | Add worker integration tests against real Redis/Postgres | Done | Holding | Yes | Appears yes | Added real Redis/Postgres worker integration coverage for critical notifications, behaviour, and compliance queue flows. | Action tracker |

## Overall Health & Governance

| ID | Action | Tracker status | Current validation | Implemented? | Implemented correctly? | Effect | Basis |
|---|---|---|---|---|---|---|---|
| OH-01 | Turn risk ledger into tracked recovery backlog | Done | Holding | Yes | Appears yes | Created the tracked recovery backlog with owners, due dates, retirement plans, and evidence-of-done rules. Canonical doc later moved into `Governance/` in `4b4c8cd`. | Action tracker |
| OH-02 | Re-rank roadmap work against health backlog | Done | Holding | Yes | Appears yes | Added roadmap execution policy that puts health backlog work ahead of expansion work while `NOW` items remain open. | Action tracker |
| OH-03 | Reserve fixed delivery capacity for health work | Done | Holding | Yes | Appears yes | Added the reserved-capacity rule with a practical solo-founder default of protecting the first two weekly build sessions for health work. | Action tracker |
| OH-04 | Publish monthly scorecard update | Done | Holding | Yes | Appears yes | Published the first evidence-based monthly scorecard and recorded the current health band, baseline gates, and backlog counts. | Action tracker |
| OH-05 | Re-run static health audit after Wave 1, Wave 3, and final completion | Partial | Partial / drifted | Partial | Partial | The checkpoint policy exists, but the actual scheduled re-audits were not yet executed. | Tracker |
| OH-06 | Add "no new debt without written tradeoff" rule | Done | Holding | Yes | Appears yes | Added the written-tradeoff rule and made the architecture pre-flight checklist point to it before shortcuts can be treated as accepted. | Action tracker |
| OH-07 | Require every critical/high risk to have retirement plan + due date | Done | Holding | Yes | Appears yes | Added the retirement guard requiring named owner, due date, retirement plan, and evidence before critical/high risks can close. | Action tracker |
| OH-08 | Track time-to-detect and time-to-recover as health KPIs | Done | Holding | Yes | Appears yes | Added `TTD` and `TTR` to the KPI registry and scorecard with an explicit note that the baseline is not yet recorded because no versioned drill history exists yet. | Action tracker |
| OH-09 | Track hotspot count, queue-failure count, flaky-test count, direct-foreign-read count | Done | Holding | Yes | Appears yes | Added the headline health metrics to the KPI registry and scorecard, including current values where available and explicit baseline gaps where evidence is still missing. | Action tracker |
| OH-10 | Block major expansion work until Phase A and B items complete | Done | Holding | Yes | Appears yes | Added the expansion execution gate so major roadmap implementation stays blocked until the early health/governance foundation is in place. | Action tracker |
| OH-11 | Require proof of regression protection before declaring any risk retired | Done | Holding | Yes | Appears yes | Added the rule that risks cannot be marked retired without regression proof tied to the closing work. | Action tracker |
| OH-12 | Hold weekly health review until system exits high-risk band | Done | Holding | Yes | Appears yes | Added the weekly health review cadence and the condition for ending the review loop. | Action tracker |
| OH-13 | Treat every new critical workflow as incomplete until code + tests + ops + docs + rollback all exist | Done | Holding | Yes | Appears yes | Added the critical-workflow completeness rule and surfaced it in the architecture pre-flight checklist. | Action tracker |
| OH-14 | Run final independent re-audit only after all Now/Next items verified | Partial | Partial / drifted | Partial | Partial | The independence rule exists, but the final independent re-audit is still a future milestone rather than a completed closure step. | Tracker |
| OH-15 | Keep architecture docs, runbooks, scorecard in repo | Done | Holding | Yes | Appears yes | Governance docs were committed into the repo and then centralized into a visible top-level `Governance/` home with a `.claude/rules/health-governance.md` loader in `4b4c8cd`. | Action tracker |

## Code Quality

| ID | Action | Tracker status | Current validation | Implemented? | Implemented correctly? | Effect | Basis |
|---|---|---|---|---|---|---|---|
| CQ-01 | Add ESLint rule for empty catch blocks | Done | Holding | Yes | Appears yes | Created `no-empty-catch` custom rule + 8 tests. Registered in plugin and base config at `error` level. Fixed 175 empty catch blocks across web and API with `console.error`/`this.logger.error`. | Action tracker |
| CQ-02 | Fix all `as any` casts in production code | Done | Holding | Yes | Appears yes | Replaced 12 `as any` casts with proper Prisma enum types (`NotificationChannel`, `AnnouncementScope`, `WebsitePageType`, `ContactFormStatus`, `Prisma.InputJsonValue`, `Prisma.StaffProfileUpdateInput`). | Action tracker |
| CQ-03 | Create typed `withRls()` helper | Done | Holding | Yes | Appears yes | Created `apps/api/src/common/helpers/with-rls.ts` encapsulating `createRlsClient` + `$transaction` + the one permitted cast. Migrated 5 services as demonstration. | Action tracker |
| CQ-04 | Migrate guardian-restrictions page to `react-hook-form` | Done | Holding | Yes | Appears yes | Migrated `create-restriction-sheet.tsx` from 7 individual `useState` calls to `useForm` + `zodResolver(createGuardianRestrictionSchema)`. Reviewer caught incomplete migration post-extraction; remediated. | Action tracker |
| CQ-05 | Create react-hook-form migration guide | Done | Holding | Yes | Appears yes | Created `docs/conventions/form-migration.md` (168 lines) with before/after examples, step-by-step checklist, common patterns, and do's/don'ts. | Action tracker |
| CQ-06 | Migrate top forms to `react-hook-form` | Partial | Partial / drifted | Partial | Partial | Form migration started and produced useful reference implementations, but the top-10 migration target is still unfinished. | Tracker |
| CQ-07 | Fix i18n gaps in behaviour module frontend | Done | Holding | Yes | Appears yes | Extracted 26 hardcoded English strings across 5 behaviour pages (interventions, exclusions, sanctions, appeals, new intervention). Added keys to `en.json` and `ar.json`. | Action tracker |
| CQ-08 | Fix i18n gaps in engagement module frontend | Done | Holding | Yes | Appears yes | Extracted 15 hardcoded strings in 2 engagement components (completion dashboard, event participants CSV headers). Added keys to `en.json` and `ar.json`. | Action tracker |
| CQ-09 | Standardize `formatDate` usage | Done | Holding | Yes | Appears yes | Renamed 8 local `formatDate` redefinitions to avoid shadowing shared `@/lib/format-date` (`formatDateLocale`, `formatDateShort`, `formatDateForExport`, `formatDateTimeLocale`). Backend definitions kept (different purpose). | Action tracker |
| CQ-10 | Tighten `no-console` to error level | Done | Holding | Yes | Appears yes | Promoted from `warn` to `error`. `console.error` and `console.warn` remain allowed. Added `eslint-disable-line` to 4 performance spec `console.log` calls. | Action tracker |
| CQ-11 | Extract large frontend pages into sub-components | Done | Holding | Yes | Appears yes | Extracted 3 pages: SEN reports (1248→93 lines, 6 components), wellbeing surveys (1056→173, 4 components), guardian-restrictions (1050→392, 5 components). | Action tracker |
| CQ-12 | Add JSDoc to exported service methods | Done | Holding | Yes | Appears yes | Added JSDoc to 4 key services: invoices (9 methods), permission-cache (3), s3 (4), reports-data-access (3). Focused on non-obvious behavior and side effects. | Action tracker |
| CQ-13 | Eliminate notification template `as any` duplication | Done | Holding | Yes | Appears yes | Created `toNotificationChannel()` helper in `packages/shared/src/helpers/notification.ts`. Used in 3 API services + 1 worker processor. Barrel-exported from `@school/shared`. | Action tracker |
| CQ-14 | Verify `strict: true` in all tsconfig files | Done | Holding | Yes | Appears yes | All configs inherit `strict: true` from `packages/tsconfig/base.json`. Removed redundant `strictNullChecks: true` from `apps/web/tsconfig.json` and `apps/web/tsconfig.test.json`. | Action tracker |
| CQ-15 | Enforce maximum file length via ESLint | Done | Partial / drifted | Partial | Partial | File-length governance was added as warnings, but the planned error thresholds were not enforced. | Tracker |
| CQ-16 | Promote `import/order` from warning to error | Done | Holding | Yes | Appears yes | Changed severity from `warn` to `error`. Added `pathGroups` for `@school/**` (internal, before) and `@/**` (internal, after). Auto-fixed all existing violations. | Action tracker |
| CQ-17 | Expand raw-SQL ESLint rule to cover `$queryRaw` and `$executeRaw` | Done | Holding | Yes | Appears yes | Expanded from 2 to 4 methods. Added `TaggedTemplateExpression` visitor. Expanded allowlist for processors, rules, scripts, test files. Added `eslint-disable-next-line` with reasons to 26 legitimate API usages. | Action tracker |
| CQ-18 | Add lint gate blocking new hand-rolled forms | Done | Partial / drifted | Yes | Partial | The hand-rolled-form lint rule exists, but at warn level it nudges rather than blocks new drift. | Tracker |
| CQ-19 | Add lint gate for untranslated human-facing strings | Done | Partial / drifted | Yes | Partial | The untranslated-string lint rule exists, but it is warn-only and the frontend still has enough drift that it is not yet a hard guardrail. | Tracker + current audit |
| CQ-20 | Standardize logger naming and structured context fields | Done | Holding | Yes | Appears yes | Added NestJS `Logger` to 13 API services + 1 controller. Replaced `console.error` with `this.logger.error`. Fixed `TenantAwareJob` from string literal to `ClassName.name`. | Action tracker |
| CQ-21 | Add public-method-count budget for services | Done | Partial / drifted | Yes | Partial | The public-method budget exists, but warning-only budgets do not stop god services from continuing to grow. | Tracker |
| CQ-22 | Move complex mapping/projection logic into dedicated helpers | Done | Holding | Yes | Appears yes | Extracted 764 lines into 3 helper files: `concern.helpers.ts` (191 lines), `behaviour-students.helpers.ts` (518 lines), `households.helpers.ts` (55 lines). | Action tracker |
| CQ-23 | Add hotspot-focused code review checklists | Done | Holding | Yes | Appears yes | Created `docs/code-review-checklists.md` (112 lines) covering behaviour, pastoral, auth, finance. Each item references danger zone IDs for traceability. | Action tracker |

## Issues The Old Plan Did Not Fully Close

- `R-21` improved approval-request creation, but it did not make approve/reject/cancel writes atomic, which is why the live approval race can still exist.
- Notification reconciliation work landed, but the specific failed-notification retry path still is not scheduled, so recovery is weaker than the tracker implies.
- Many architecture and maintainability actions were landed as warnings, `continue-on-error` checks, or scaffolding for later migration. Those are real improvements, but they do not behave like hard quality gates yet.
- Some current repo work has moved ahead of the dated audit bundle, so the next program plan should start with a baseline-alignment gate before using the audit score as an execution truth source.
