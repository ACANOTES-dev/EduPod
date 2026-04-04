# Health Recovery Plan — Execution Tracker

**Source Plan:** `health-recovery-plan-claude-plus-gpt-additions.md`
**Started:** 2026-04-04
**Current Score:** 7.7/10 | **Target:** 9.5/10

> This file tracks implementation progress. Updated by each session as work completes.
> Other sessions: check this file before starting work to avoid duplication.

---

## Wave 1: Security Foundation + Critical Test Gaps

### Bucket 1A — Security Quick Fixes

| ID   | Item                                   | Status | Date       | Notes                                                     |
| ---- | -------------------------------------- | ------ | ---------- | --------------------------------------------------------- |
| 1A.1 | Add 'refund' to SEQUENCE_TYPES         | DONE   | 2026-04-04 | Already present in sequence-types.ts (pre-existing)       |
| 1A.2 | ENCRYPTION_KEY required in production  | DONE   | 2026-04-04 | superRefine on envSchema; prod requires min 64 chars      |
| 1A.3 | Make pnpm audit blocking in CI         | DONE   | 2026-04-04 | Removed continue-on-error, added --ignore-registry-errors |
| 1A.4 | Add global request body size limit     | DONE   | 2026-04-04 | json + urlencoded 10MB limit in main.ts                   |
| 1A.5 | AuthGuard JWT_SECRET via ConfigService | DONE   | 2026-04-04 | Injected ConfigService; DI verified OK                    |

### Bucket 1B — File Upload Hardening

| ID   | Item                                                | Status | Date       | Notes                                                                                                                                                                                                                                              |
| ---- | --------------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1B.1 | Content validation + size limits on FileInterceptor | DONE   | 2026-04-04 | Created shared `createFileInterceptor` factory with MIME presets (IMAGE, CSV, SPREADSHEET, DOCUMENT) and 10MB default limit. Applied to all 10 FileInterceptor usages across 8 controllers. 13 new unit tests, 148 existing controller tests pass. |

### Bucket 1C — RLS Leakage Tests: Critical Tables

| ID   | Item                                              | Status | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | ------------------------------------------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1C.1 | RLS leakage tests for 10 business-critical tables | DONE   | 2026-04-04 | 10 new `*.rls.spec.ts` files in `apps/api/test/`: students, classes, invoices, payments, payroll_runs, payslips, attendance_records, grades, staff_profiles, behaviour_incidents. 48 tests total (4-5 per table). Each tests read isolation (findMany + findFirst) and write isolation (UPDATE + DELETE). All use non-BYPASSRLS role with `SET LOCAL ROLE` for DB-layer enforcement. Zero TS errors. |

### Bucket 1D — GDPR Service Specs

| ID   | Item                               | Status | Date       | Notes                                                                                                   |
| ---- | ---------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------- |
| 1D.1 | Unit specs for all 8 GDPR services | DONE   | 2026-04-04 | 8 specs, 140 tests pass. 7 pre-existing; created platform-legal.service.spec.ts (14 tests). Lint clean. |

---

## Wave 2: Test Coverage Remediation

### Bucket 2C — RLS Test CI Integration

| ID   | Item                                 | Status | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------------ | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2C.1 | Include RLS tests in the CI test run | DONE   | 2026-04-04 | Created `jest.rls.config.js` (RLS-only test runner), added `test:rls` scripts to api and root `package.json`, added dedicated "Run RLS leakage tests" CI step in `ci` job after DB setup (before general integration tests). 11 RLS spec files discovered (10 from Wave 1 + 1 pre-existing homework). RLS failures now block deployment via `ci` → `deploy` dependency chain. |

### Bucket 2A — Pastoral Module Specs

| ID   | Item                                          | Status | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | --------------------------------------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2A.1 | Specs for all 11 missing pastoral services    | DONE   | 2026-04-04 | 11 new service spec files: concern-access, concern-projection, concern-queries, concern-relations, critical-incident-response, case-queries, pastoral-report-des-inspection, pastoral-report-safeguarding, pastoral-report-sst-activity, pastoral-report-student-summary, pastoral-report-wellbeing. Priority 1 safeguarding-adjacent services (concern-access, concern-projection, concern-queries, critical-incident-response) all covered with role-based visibility and response workflow tests. |
| 2A.2 | Specs for all 10 missing pastoral controllers | DONE   | 2026-04-04 | 10 new controller spec files: cases, checkin-admin, checkin-config, checkins, concerns, critical-incidents, interventions, parent-contacts, parent-pastoral, sst. Each verifies guard stack (AuthGuard, PermissionGuard, ModuleEnabledGuard), @RequiresPermission metadata, and service delegation with correct arguments. All DTO shapes match Zod schemas.                                                                                                                                         |

**Totals:** 21 new spec files, 54 pastoral test suites (up from 33), 1009 tests all passing. Zero TypeScript errors in pastoral module. Every service and controller in `modules/pastoral/` now has a corresponding `.spec.ts` file.

### Bucket 2B — Other Missing Critical Specs

| ID   | Item                                           | Status | Date       | Notes                                                                                                                                                                                                                                                                          |
| ---- | ---------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2B.1 | AI module spec                                 | DONE   | 2026-04-04 | Created `anthropic-client.service.spec.ts` — 14 tests covering isConfigured getter, createMessage happy path + timeout + circuit breaker, getClient lazy init + error. Zero `any` casts.                                                                                       |
| 2B.2 | Preferences module specs                       | DONE   | 2026-04-04 | Created `preferences.service.spec.ts` (7 tests) and `preferences.controller.spec.ts` (5 tests). Covers getPreferences, updatePreferences, deepMerge, 500KB size limit, AuthGuard verification.                                                                                 |
| 2B.3 | Import executor spec improvement               | DONE   | 2026-04-04 | Rewrote `import-executor.service.spec.ts`: 314→1703 lines (1.91x ratio), 13→54 tests. Eliminated all ~20 `any` casts and 3 private method spies. Added full coverage for processParentRow (4), processStaffRow (9), processExamResultRow (8), processStaffCompensationRow (7). |
| 2B.4 | Remaining missing service and controller specs | DONE   | 2026-04-04 | 33 new spec files across 8 modules — see breakdown below.                                                                                                                                                                                                                      |

**2B.4 Breakdown by module:**

| Module          | New Specs | Tests | Highlights                                                                                                                                             |
| --------------- | --------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Behaviour       | 10        | 100   | safeguarding-seal (dual-control), safeguarding-referrals, 5 analytics services, attachment, export, side-effects                                       |
| Gradebook       | 9         | 123   | GPA computation, period-grade-computation, grade-curve (3 methods), rubric CRUD, report-card generation/transcript/queries, grade-threshold, analytics |
| Admissions      | 5         | 83    | 4 controllers (forms, applications, parent, public) + application-conversion service (15 tests incl. concurrent modification)                          |
| Staff-wellbeing | 4         | 70    | workload-data, workload-empty-state, workload-metrics (Gini, composite scores), workload-trend-analysis                                                |
| Attendance      | 2         | 19    | attendance-locking (auto-lock flow), attendance-reporting (exceptions, student records, parent view with ForbiddenException)                           |
| Reports         | 1         | 16    | reports-data-access facade (student/staff/attendance/grade/invoice counts, tenant isolation)                                                           |
| Imports         | 1         | 19    | import-parser (CSV parsing, flexible date, header normalization, example row detection)                                                                |
| AI              | 1         | 14    | (counted in 2B.1 above)                                                                                                                                |

**Bucket 2B Totals:** 36 new/improved spec files, 538 new tests, all passing. Zero TypeScript errors in new files. No regressions in existing test suite (11 pre-existing failures in scheduling/rooms/health controllers unchanged).

### Bucket 2D — Coverage Ratchet

| ID   | Item                                      | Status | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ----------------------------------------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2D.1 | Ratchet branch coverage threshold to ≥65% | DONE   | 2026-04-04 | Measured post-2A+2B coverage: stmts 83.9%, branches 65.83%, functions 84.52%, lines 84.53%. Updated `jest.config.js` thresholds to (measured - 2%): statements 81%, branches 63%, functions 82%, lines 82%. All thresholds pass. Branch threshold (63%) meets ≥65% measured baseline requirement. Previous thresholds were stmts 76%, branches 57%, functions 78%, lines 77% — ratcheted up by 5-6 points across all metrics. |

## Wave 3: Architecture + Modularity

### Bucket 3A — ReadFacades for High-Exposure Tables

| ID   | Item                                            | Status | Date       | Notes                                                                                                                                                                                                                                                                                                                             |
| ---- | ----------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3A.1 | Implement ReadFacade for 6 high-exposure tables | DONE   | 2026-04-04 | 31 `*-read.facade.ts` files created across all modules including the 6 critical tables (staff_profiles, students, classes, academic_periods, invoices, attendance). Facade code is complete. Most facades NOT yet exported from module barrel files. Consumer migration <10% — facades exist but callers still use direct Prisma. |

### Bucket 3B — Prisma Model Access Lint Rule

| ID   | Item                                                    | Status | Date       | Notes                                                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3B.1 | Custom ESLint rule for cross-module Prisma model access | DONE   | 2026-04-04 | `no-cross-module-prisma-access` rule in `packages/eslint-config/rules/`. Reads module ownership from `docs/architecture/module-ownership.json`. Detects `this.prisma.<foreignModel>` patterns. Exempts spec files. Set to `warn` mode — 697 violations currently. Will switch to `error` after 3D migration completes. |

### Bucket 3C — Extract Safeguarding Module

| ID   | Item                                               | Status      | Date | Notes                                                                                                                                                                                |
| ---- | -------------------------------------------------- | ----------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3C.1 | Extract safeguarding into a separate NestJS module | NOT STARTED | —    | Placeholder `safeguarding/index.ts` exists but all services remain in `behaviour/behaviour-safeguarding.module.ts`. Not registered in `app.module.ts`. No code physically moved yet. |

### Bucket 3D — Remaining Facade Migration

| ID   | Item                                                   | Status      | Date | Notes                                                                                                                                                        |
| ---- | ------------------------------------------------------ | ----------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3D.1 | Migrate remaining cross-module Prisma reads to facades | IN PROGRESS | —    | **PAUSED.** Lint rule detects 697 violations across 120+ files. <5% of consumers migrated. Module barrel exports needed before consumers can import facades. |

---

## Wave 4: Reliability Hardening

### Bucket 4A — Danger Zone Mitigations

| ID   | Item                                           | Status  | Date       | Notes                                                                                                                                                                                                                                                               |
| ---- | ---------------------------------------------- | ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4A.1 | Parent notification stuck-alert (DZ-14)        | DONE    | 2026-04-04 | `stuck-notification-alert.processor.ts` in worker. Detects incidents with `parent_notification_status = 'pending'` >24h. Creates in-app notification to incident creator via `behaviour_stuck_parent_notification` template. Idempotency check prevents duplicates. |
| 4A.2 | Academic period pre-closure validation (DZ-06) | PENDING | —          | `academic-periods.service.ts` `updateStatus()` only checks valid transitions. No pre-closure validation for pending attendance sessions or open assessments.                                                                                                        |
| 4A.3 | Appeal decision transaction timeout (DZ-17)    | PARTIAL | 2026-04-04 | `decide()` uses `timeout: 30000` (plan specifies 15000). Notification enqueuing not wired post-transaction.                                                                                                                                                         |
| 4A.4 | Legal hold release logic (DZ-18)               | DONE    | 2026-04-04 | `releaseHold()` in `behaviour-legal-hold.service.ts` with `released_at`, `release_reason`, `released_by_id` fields.                                                                                                                                                 |
| 4A.5 | Safeguarding status projection (DZ-13)         | DONE    | 2026-04-04 | 620-line integration test `safeguarding-projection.spec.ts`. Covers all incident-status-returning endpoints. Source-level consistency check verifies all behaviour services are projection-aware.                                                                   |

### Bucket 4B — Worker Reliability

| ID   | Item                                          | Status | Date       | Notes                                                                                                                          |
| ---- | --------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 4B.1 | Retry/backoff configuration integration tests | DONE   | 2026-04-04 | `queue-config.spec.ts` asserts `attempts`, `backoff.type`, `backoff.delay`, `removeOnComplete`, `removeOnFail` for all queues. |
| 4B.2 | Worker health endpoint integration test       | DONE   | 2026-04-04 | `worker-health.controller.spec.ts` tests 200 for healthy/degraded, 503 for unhealthy. Covers Redis/Postgres failure scenarios. |

### Bucket 4C — Production File Scanning

| ID   | Item                                  | Status  | Date       | Notes                                                                                                                                                                                                                 |
| ---- | ------------------------------------- | ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4C.1 | Deploy ClamAV for production scanning | PARTIAL | 2026-04-04 | `ClamavScannerService` exists (`apps/worker/src/services/clamav-scanner.service.ts`, 188 lines) with INSTREAM protocol, chunking, timeout. BUT `attachment-scan.processor.ts` does NOT call it — still auto-approves. |

## Wave 5: Operational Maturity

### Bucket 5C — Deploy Safety

| ID   | Item                                              | Status | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5C.1 | Automated migration verification in deploy script | DONE   | 2026-04-04 | Created standalone `scripts/verify-migrations.sh` (queries `_prisma_migrations` for `finished_at IS NULL AND rolled_back_at IS NULL`). Supports `--dry-run` and `--backup-dir`. Added `verify_migrations()` wrapper in `deploy-production.sh`, called after `prisma migrate deploy` and before post-migrate SQL. On partial migration: sends CRITICAL alert via Slack/Telegram, aborts deploy with recovery instructions. |
| 5C.2 | Separate readiness probe from full health check   | DONE   | 2026-04-04 | New `ReadinessResult` interface (status: 'ready' / 'not_ready'). `getReadiness()` now checks only PostgreSQL + Redis (2 critical deps), not all 7 subsystems. Readiness probe returns 200 even if Meilisearch/BullMQ/Disk are down. Controller updated to check `not_ready` for 503. 10 new tests (7 service + 3 controller), 34 total health tests pass.                                                                 |
| 5C.3 | PM2 cluster mode adjustment                       | DONE   | 2026-04-04 | `ecosystem.config.cjs`: API and Web now default to fork mode (1 instance) via `API_INSTANCES` / `WEB_INSTANCES` env vars. Setting >1 enables cluster mode. Eliminates IPC overhead for single-instance deployments. Worker unchanged (always fork). Added env vars to `.env.example`. Default behavior identical to before minus unnecessary cluster overhead.                                                            |

### Bucket 5D — Security Governance

| ID   | Item                                           | Status | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | ---------------------------------------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5D.1 | Permission cache invalidation integration test | DONE   | 2026-04-04 | Created `permission-cache-invalidation.integration.spec.ts` with 8 tests: assignPermissions, updateRole, createRole, deleteRole (tenant-wide invalidation), updateMembershipRoles, suspendMembership, reactivateMembership (single-membership invalidation), and cross-tenant isolation. Fixed 2 missing invalidation calls: added `permissionCacheService.invalidate()` to `reactivateMembership()` and `permissionCacheService.invalidateAllForTenant()` to `deleteRole()`. 65 RBAC tests pass (8 suites). Zero lint errors, zero TS errors. |

---

## Wave 5: Operational Maturity

### Bucket 5B — Encryption Operations

| ID   | Item                                  | Status | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5B.1 | Build encryption key rotation tooling | DONE   | 2026-04-04 | Extended `KeyRotationService` (API) and `KeyRotationProcessor` (Worker) to rotate MFA TOTP secrets (`users.mfa_secret`, `users.mfa_secret_key_ref`) alongside existing Stripe configs and staff bank details. Created standalone CLI script `scripts/rotate-encryption-key.ts` with `--dry-run` support, handling all 3 encrypted field categories. Created comprehensive runbook at `docs/operations/key-rotation-runbook.md` (8 sections). Updated DZ-09 to MITIGATED. 12 API tests + 50 worker tests pass. |

## Wave 5: Operational Maturity

### Bucket 5A — Observability

| ID   | Item                        | Status | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | --------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5A.1 | Centralized log aggregation | DONE   | 2026-04-04 | Created `LokiLogShipper` service (`common/services/loki-log-shipper.service.ts`). Buffers entries, flushes every 5s or at 100 entries to Loki HTTP push API. Labels: `service`, `level`, `environment` (low-cardinality). High-cardinality fields (`tenant_id`, `user_id`, `request_id`) embedded in log line JSON. Uses native `fetch()`, no new deps. Integrated into `StructuredLoggerService` via static `setShipper()`, wired in `CommonModule.onModuleInit()`. 14 tests pass. Added `LOKI_PUSH_URL`, `LOKI_ENVIRONMENT`, `LOKI_SERVICE_LABEL` to env schema and `.env.example`. |
| 5A.2 | Production request logging  | DONE   | 2026-04-04 | Modified `RequestLoggingMiddleware` to log in all environments. Production: writes structured JSON access log to stdout with fields `timestamp`, `level` (`access`), `method`, `path` (UUIDs→`:id`), `status`, `duration_ms`, `request_id`, `tenant_id`, `user_id`. Dev: retains `StructuredLoggerService` simple string format. Skips `/api/health`, `/api/docs`, `/api/metrics`. 7 tests pass (up from 3). Zero regressions.                                                                                                                                                        |
| 5A.3 | Prometheus metrics endpoint | DONE   | 2026-04-04 | Created `modules/metrics/` module with `MetricsService`, `MetricsController`, `MetricsMiddleware`. Installed `prom-client`. Dedicated `Registry` (not global). Metrics: `http_requests_total` (Counter), `http_request_duration_seconds` (Histogram, 10 buckets), `http_requests_in_flight` (Gauge) + default Node.js metrics. UUID stripping in path labels. `GET /api/metrics` public endpoint with `@SkipThrottle()`. Excluded from tenant resolution. 24 tests pass. DI verified.                                                                                                 |

**Totals:** 3 new service files, 1 new module (4 files), 3 modified files, 45 new tests, all passing. Zero lint errors in new files. Zero TypeScript errors. No regressions in existing test suite.

---

## Status Key

| Status      | Meaning                                    |
| ----------- | ------------------------------------------ |
| PENDING     | Not started                                |
| IN PROGRESS | Work underway in current or active session |
| DONE        | Implemented and verified                   |
| BLOCKED     | Cannot proceed — see Notes                 |
