# Health Recovery Plan — Implementation Map

**Date:** 2026-04-03
**Current Score:** 7.7/10 (excluding deliberately deferred frontend test coverage)
**Target Score:** 9.5/10
**Gap:** 1.8 points across 10 weighted dimensions
**Context:** Production system handling confidential data of minors. A single breach ends the company. Every item in this plan exists because a specific audit finding demands it.

> **Frontend test coverage is excluded from scoring.** The user has confirmed frontend testing is deliberately deferred until after a UX/UI overhaul. Once the overhaul is complete, frontend E2E tests (Playwright CRUD workflows) will be implemented as a separate initiative. This plan targets 9.5/10 on all other dimensions.

---

## Scoring Model (Frontend Excluded)

| Dimension             | Current | Target | Gap  | Weight |
| --------------------- | ------- | ------ | ---- | ------ |
| Security              | 8.0     | 9.5    | +1.5 | 2x     |
| Reliability           | 8.5     | 9.5+   | +1.0 | 2x     |
| Architecture          | 7.5     | 9.5    | +2.0 | 1x     |
| Modularity            | 6.5     | 9.0    | +2.5 | 1x     |
| Code Quality          | 7.5     | 9.5    | +2.0 | 1x     |
| Maintainability       | 7.0     | 9.0    | +2.0 | 1x     |
| Backend Test Health   | 7.0     | 9.5    | +2.5 | 1.5x   |
| Worker Test Health    | 8.0     | 9.5    | +1.5 | 0.75x  |
| Developer Experience  | 8.5     | 9.5    | +1.0 | 0.75x  |
| Operational Readiness | 7.5     | 9.5    | +2.0 | 1x     |

**Target weighted:** (9.5×2 + 9.5×2 + 9.5 + 9.0 + 9.5 + 9.0 + 9.5×1.5 + 9.5×0.75 + 9.5×0.75 + 9.5) / 12.0 = **9.5**

---

## How to Read This Plan

Each **Wave** is a phase of work. Waves are sequential — Wave 2 starts after Wave 1 completes (though overlap is noted where possible).

Within each Wave, work is organized into **Buckets**. Buckets within the same wave can execute in parallel — they have no dependencies on each other. If a bucket depends on a prior bucket, it is in a later wave or explicitly marked with `AFTER:`.

Each action item includes:

- **Risk ID** — traces back to the risk ledger
- **Source** — which audit agent identified it
- **Evidence** — what was found
- **Acceptance criteria** — how to verify it's done

---

## Wave 1: Security Foundation + Critical Test Gaps

**Goal:** Close the highest-severity security and compliance gaps. These are items where a failure could directly cause a data breach or regulatory violation.

**Expected score change:** 7.7 → 8.4
**Timeline:** Weeks 1-2

### Bucket 1A — Security Quick Fixes (parallel, no dependencies)

All items in this bucket are small, high-impact changes with no dependencies.

#### 1A.1: Add 'refund' to SEQUENCE_TYPES constant

- **Risk ID:** AUD-019 | **Source:** Agent 1, Agent 6 | **Severity:** LOW-MEDIUM
- **Evidence:** `packages/shared/src/constants/sequence-types.ts` defines 8 types. `refunds.service.ts` calls `SequenceService.nextNumber('refund')` — a type NOT in the canonical list. Works today because the service doesn't validate, but adding validation breaks refunds.
- **Action:** Add `'refund'` to the `SEQUENCE_TYPES` array/constant.
- **Acceptance:** `SEQUENCE_TYPES` includes `'refund'`. Refund number generation tests still pass.

#### 1A.2: Make ENCRYPTION_KEY required in production env validation

- **Risk ID:** AUD-010 | **Source:** Agent 7 | **Severity:** MEDIUM
- **Evidence:** `apps/api/src/modules/config/env.validation.ts` makes ENCRYPTION_KEY `.optional()`. The API can start without encryption capability for Stripe keys and bank details. Runtime failure occurs when encrypted fields are accessed.
- **Action:** Change ENCRYPTION_KEY validation to `.min(64)` when `NODE_ENV === 'production'`. Keep `.optional()` for development/test.
- **Acceptance:** API refuses to start in production without ENCRYPTION_KEY. Dev/test environments still work without it.

#### 1A.3: Make pnpm audit blocking in CI

- **Risk ID:** AUD-010 | **Source:** Agent 4, Agent 7 | **Severity:** MEDIUM
- **Evidence:** `.github/workflows/ci.yml` line 56: `continue-on-error: true` on `pnpm audit --audit-level=high`. New high-severity dependency vulnerabilities do not block deployment.
- **Action:** Remove `continue-on-error: true`. If known transitive vulns block CI, add them to a `.pnpmauditignore` or equivalent allowlist with documented justification.
- **Acceptance:** `pnpm audit --audit-level=high` blocks CI on new high-severity vulns. Known exceptions are documented.

#### 1A.4: Add global request body size limit

- **Risk ID:** AUD-020 | **Source:** Agent 4 | **Severity:** LOW
- **Evidence:** `apps/api/src/main.ts` has no body-parser size limit. Large payloads could exhaust server memory.
- **Action:** Add `app.use(json({ limit: '10mb' }))` and `app.use(urlencoded({ limit: '10mb', extended: true }))` in main.ts.
- **Acceptance:** Requests with body >10MB receive 413 Payload Too Large.

#### 1A.5: AuthGuard JWT_SECRET via ConfigService

- **Risk ID:** — | **Source:** Agent 4 | **Severity:** LOW
- **Evidence:** `auth.guard.ts` reads `process.env.JWT_SECRET` directly. `TokenService` uses ConfigService. Pattern inconsistency.
- **Action:** Inject ConfigService into AuthGuard, read JWT_SECRET from there.
- **Acceptance:** AuthGuard no longer references `process.env` directly. All JWT secret access goes through ConfigService.

### Bucket 1B — File Upload Hardening (parallel with 1A)

#### 1B.1: Add content validation and size limits to all FileInterceptor usages

- **Risk ID:** AUD-011 | **Source:** Agent 4 | **Severity:** MEDIUM
- **Evidence:** S3Service accepts any Buffer and contentType. Controllers using FileInterceptor have no `fileFilter` or `limits`. Enables DoS and arbitrary file upload.
- **Action:**
  1. Audit all `@UseInterceptors(FileInterceptor(...))` usages across the codebase.
  2. Add `limits: { fileSize: 10 * 1024 * 1024 }` (10MB, adjust per use case).
  3. Add `fileFilter` with MIME type allowlist appropriate to each endpoint (e.g., images for branding, CSV for imports, PDF for documents).
  4. Consider a shared `createFileInterceptor(options)` factory to enforce defaults.
- **Acceptance:** Every FileInterceptor has explicit size limit and content type filter. Uploading a disallowed type returns 400. Uploading >limit returns 413.

### Bucket 1C — RLS Leakage Tests: Critical Tables (parallel with 1A, 1B)

#### 1C.1: Add RLS leakage tests for top 10 business-critical tables

- **Risk ID:** AUD-001 | **Source:** Agent 2, Agent 4 | **Severity:** HIGH
- **Evidence:** Only `homework.rls.spec.ts` (440 lines), `child-protection-rls.spec.ts` (949 lines), and `rls-role-integration.spec.ts` (363 lines) exist. Finance, payroll, behaviour, admissions, attendance — zero RLS leakage tests. RLS policy existence is CI-gated but policy correctness is not tested.
- **Action:** Create RLS leakage test files for these 10 tables, following the `child-protection-rls.spec.ts` pattern:
  1. `students` — student records
  2. `invoices` — financial data
  3. `payments` — financial data
  4. `payroll_runs` — payroll data
  5. `payslips` — salary data
  6. `attendance_records` — attendance data
  7. `behaviour_incidents` — behaviour/safeguarding data
  8. `grades` — academic data
  9. `staff_profiles` — staff PII + bank details
  10. `classes` — class assignments

  Each test must:
  - Create data as Tenant A (with RLS context)
  - Authenticate/set context as Tenant B
  - Attempt to read/query the data
  - Assert: empty result or 404, NEVER Tenant A's data
  - Test both `findMany` (list) and `findFirst` (detail) paths
  - Test write isolation: Tenant B cannot update/delete Tenant A's records

- **Acceptance:** 10 new `*.rls.spec.ts` files, all passing. Each tests read isolation AND write isolation.

### Bucket 1D — GDPR Service Specs (parallel with 1A, 1B, 1C)

#### 1D.1: Add unit specs for all 7 missing GDPR services

- **Risk ID:** AUD-005 | **Source:** Agent 2 | **Severity:** MEDIUM-HIGH
- **Evidence:** 7 of 8 GDPR services have no unit spec: `consent.service.ts`, `dpa.service.ts`, `privacy-notices.service.ts`, `age-gate.service.ts`, `gdpr-token.service.ts`, `ai-audit.service.ts`, `sub-processors.service.ts`, `platform-legal.service.ts`. These services control consent withdrawal (affects 6+ features), DPA acceptance (global API guard), and privacy notices.
- **Action:** Create service-level specs for all 7. Minimum coverage per service:

  **consent.service.ts** (HIGHEST PRIORITY):
  - Grant consent → record created
  - Withdraw consent → status changed to `withdrawn`, new record can be granted
  - Withdrawal takes effect synchronously (next read reflects it)
  - Partial unique index enforcement (only one active consent per type)
  - Edge: withdraw already-withdrawn consent
  - Edge: grant consent when an active one already exists

  **dpa.service.ts:**
  - Accept current DPA → immutable acceptance row created with hash/timestamp/IP
  - Stale acceptance detection when new DPA version published
  - Guard behavior: tenant without DPA acceptance gets blocked

  **privacy-notices.service.ts:**
  - Create draft → edit → publish lifecycle
  - Published notices cannot be edited
  - Publish triggers fan-out notification
  - Acknowledgement tracks per-user per-version

  **age-gate.service.ts:**
  - Age calculation for DPC guidance
  - Age-gated review trigger on compliance requests

  **gdpr-token.service.ts:**
  - Tokenization: PII → token mapping created
  - De-tokenization: token → PII resolved
  - Token table never exposed via API

  **ai-audit.service.ts:**
  - Log creation for AI processing
  - Fire-and-forget: failures must NOT throw
  - 24-month retention rule

  **sub-processors.service.ts / platform-legal.service.ts:**
  - CRUD operations, versioning, publication

- **Acceptance:** 7 new spec files, all passing. ConsentService spec tests synchronous withdrawal propagation. DpaService spec tests guard interaction.

---

## Wave 2: Test Coverage Remediation

**Goal:** Close remaining spec gaps in regulated and high-risk modules. Establish test trustworthiness for refactoring across the entire codebase.

**Expected score change:** 8.4 → 8.9
**Timeline:** Weeks 2-4 (can overlap with end of Wave 1)

### Bucket 2A — Pastoral Module Specs (parallel, largest gap)

#### 2A.1: Add specs for all 12 missing pastoral services

- **Risk ID:** AUD-004 | **Source:** Agent 2 | **Severity:** HIGH
- **Evidence:** 38 services, only 26 have specs. Missing specs include `concern-access.service.ts`, `concern-projection.service.ts`, `concern-queries.service.ts`, `critical-incident-response.service.ts`, and 8 others. This module handles safeguarding-adjacent data.
- **Action:** Create service specs for all 12 missing services. Prioritize by risk:

  **Priority 1 (safeguarding-adjacent):**
  - `concern-access.service.ts` — who can see what concerns
  - `concern-projection.service.ts` — how concerns are projected to different roles
  - `concern-queries.service.ts` — concern data retrieval
  - `critical-incident-response.service.ts` — emergency response workflow

  **Priority 2 (data integrity):**
  - Remaining 8 services as enumerated by Agent 2

- **Acceptance:** 12 new service spec files, all passing. Concern-access spec verifies role-based visibility. Critical-incident-response spec covers the full response workflow.

#### 2A.2: Add specs for all 10 missing pastoral controllers

- **Risk ID:** AUD-004 | **Source:** Agent 2 | **Severity:** HIGH
- **Evidence:** 15 controllers, only 5 have specs. Missing: `cases.controller.ts`, `concerns.controller.ts`, `interventions.controller.ts`, `checkins.controller.ts`, and 6 others.
- **Action:** Create controller specs following the project's thin-controller delegation pattern. Each spec must verify:
  - Guard stack is applied (`AuthGuard`, `PermissionGuard`)
  - Correct permission is required (`@RequiresPermission`)
  - Service delegation with correct arguments
  - UUID param validation
- **Acceptance:** 10 new controller spec files, all passing.

### Bucket 2B — Other Missing Critical Specs (parallel with 2A)

#### 2B.1: AI module spec

- **Risk ID:** — | **Source:** Agent 2 | **Severity:** MEDIUM
- **Evidence:** `anthropic-client.service.ts` has 0 specs. This service wraps the Claude API for AI grading, comments, and progress summaries.
- **Action:** Create spec covering API call construction, error handling, and GDPR token usage.
- **Acceptance:** Spec file exists and passes.

#### 2B.2: Preferences module specs

- **Risk ID:** — | **Source:** Agent 2 | **Severity:** LOW
- **Evidence:** `preferences.service.ts` and `preferences.controller.ts` both have 0 specs.
- **Action:** Create service and controller specs.
- **Acceptance:** Both spec files exist and pass.

#### 2B.3: Import executor spec improvement

- **Risk ID:** — | **Source:** Agent 2 | **Severity:** MEDIUM
- **Evidence:** 889 service lines vs 314 spec lines (0.35x ratio). Spec uses `any` casts and spies on private methods. Tests routing, not actual import logic.
- **Action:** Replace private method spies with proper interface testing. Add tests that feed real CSV row data through `processRow()` for each entity type (parents, students, staff, exam results, fee assignments). Verify Prisma create/upsert calls match expected patterns.
- **Acceptance:** Spec ratio ≥0.7x. No `any` casts. Each entity type import path has at least one happy-path test.

#### 2B.4: Remaining missing service and controller specs

- **Risk ID:** — | **Source:** Agent 2 | **Severity:** MEDIUM
- **Evidence:** 49 services and 23 controllers total lack specs across the codebase (after subtracting pastoral and GDPR above, ~30 services and ~13 controllers remain).
- **Action:** Create specs for all remaining unspecced services and controllers. Prioritize by module risk:
  1. Compliance module services (DSAR traversal, anonymisation)
  2. Communications module (notification dispatch, WhatsApp consent)
  3. Early-warning services
  4. Regulatory services
  5. Remaining smaller modules
- **Acceptance:** Every service and controller file in `apps/api/src/modules/` has a corresponding `.spec.ts` file. 100% spec file coverage.

### Bucket 2C — RLS Test CI Integration (parallel with 2A, 2B)

#### 2C.1: Include RLS tests in the CI test run

- **Risk ID:** AUD-001 | **Source:** Agent 2 | **Severity:** MEDIUM
- **Evidence:** `jest.config.js` `testPathIgnorePatterns` excludes `*.rls.spec.ts`. RLS tests are not run in the default CI unit test step. They could silently rot.
- **Action:** Either:
  (a) Remove `*.rls.spec.ts` from `testPathIgnorePatterns` and run them in the unit test step (if they can run without a live DB — check), OR
  (b) Add a dedicated CI step `Run RLS leakage tests` that runs only `*.rls.spec.ts` files against the integration test database.
- **Acceptance:** RLS tests run in every CI pipeline. A broken RLS test blocks deployment.

### Bucket 2D — Coverage Ratchet (AFTER 2A + 2B complete)

#### 2D.1: Ratchet branch coverage threshold from 57% to 65%

- **Risk ID:** AUD-012 | **Source:** Agent 2 | **Severity:** MEDIUM
- **Evidence:** Current floor: statements 76%, branches 57%, functions 78%, lines 77%. Branch coverage is the weakest gate. Measured baseline was 63% with the threshold set 6% below.
- **Action:** After all new specs from 2A, 2B are merged, run coverage measurement. Set new threshold to (measured - 2%).
- **Acceptance:** `jest.config.js` branch threshold ≥65%. CI passes at the new threshold.

---

## Wave 3: Architecture Hardening

**Goal:** Make cross-module data coupling visible, enforceable, and testable. Reduce the blast radius of schema changes.

**Expected score change:** 8.9 → 9.2
**Timeline:** Weeks 4-6 (can start during Week 3 if Wave 2 Bucket 2A is ahead of schedule)

### Bucket 3A — ReadFacades for High-Exposure Tables (foundational, parallel)

#### 3A.1: Implement ReadFacade for 6 high-exposure tables

- **Risk ID:** AUD-003 | **Source:** Agent 1 | **Severity:** HIGH
- **Evidence:** Agent 1 confirmed 6+ core tables are queried by 15-25 consumer modules via Prisma-direct. Facades already exist for compliance consumers (BehaviourReadFacade, FinanceReadFacade, GradebookReadFacade, StaffProfileReadFacade, StudentReadFacade, AcademicReadFacade, AttendanceReadFacade) but they serve only compliance/DSAR/early-warning. The producing modules (gradebook, behaviour, reports, regulatory) still bypass via Prisma-direct.
- **Action:** Extend existing facades OR create new cross-module read interfaces for these 6 tables. For each table:
  1. **staff_profiles** — Extend `StaffProfileReadFacade` with methods needed by payroll, scheduling, attendance, behaviour, classes (currently 15+ direct readers).
  2. **students** — Extend `StudentReadFacade` with methods needed by gradebook, behaviour, attendance, reports (currently 15+ readers).
  3. **classes / class_enrolments** — Create or extend facade with methods for gradebook, attendance, scheduling, finance, report cards.
  4. **academic_periods / academic_years** — Extend `AcademicReadFacade` for gradebook, report cards, scheduling, promotion.
  5. **invoices** — Extend `FinanceReadFacade` for reports, compliance, regulatory.

  For each facade method:
  - Read-only (no writes)
  - Explicit select shape (only fields the consumer needs)
  - Typed return value
  - Exported from the owning module
  - Documented consumers

  Migrate consumers ONE module at a time. Start with the module that has the most cross-module reads (gradebook: 32 imports).

- **Acceptance:** Each of the 6 tables has a documented ReadFacade. Gradebook module's foreign Prisma reads are replaced with facade calls. At least 50% of cross-module Prisma reads across the codebase are migrated.

### Bucket 3B — Prisma Model Access Lint Rule (AFTER 3A)

#### 3B.1: Create custom ESLint rule to detect cross-module Prisma model access

- **Risk ID:** AUD-003 | **Source:** Agent 1 | **Severity:** HIGH
- **Evidence:** The existing `no-cross-module-internal-import` ESLint rule catches TypeScript import violations but cannot detect Prisma model access crossing module boundaries. The CI boundary checks validate module-level imports only. This is the biggest enforcement gap.
- **Action:**
  1. Create a rule in `packages/eslint-plugin-school/` that detects `this.prisma.<modelName>` access patterns.
  2. The rule reads a configuration mapping each module to its "owned" Prisma models.
  3. If a service in module X accesses `this.prisma.foreignModel` (a model owned by module Y), the rule reports an error.
  4. Exempt spec files.
  5. Start in warning mode. After Wave 3A facade migration is complete, switch to error mode.
- **Acceptance:** Rule exists, runs in CI, reports violations. Violations trend downward with each facade migration.

### Bucket 3C — Extract Safeguarding Module (parallel with 3A)

#### 3C.1: Extract safeguarding into a separate NestJS module

- **Risk ID:** AUD-015 | **Source:** Agent 1 | **Severity:** LOW-MEDIUM
- **Evidence:** Behaviour module is 24,104 lines, 74 files, 214 endpoints, 33 exports. Internal sub-module decomposition (7 sub-modules) mitigates DI complexity but not total surface area. Safeguarding is already a distinct sub-module (SafeguardingCoreModule).
- **Action:**
  1. Create `apps/api/src/modules/safeguarding/` as a new top-level module.
  2. Move `SafeguardingService`, `SafeguardingAttachmentService`, `SafeguardingBreakGlassService`, `SafeguardingReportingService`, and related controllers.
  3. Move related worker processors (`sla-check`, `critical-escalation`, `break-glass-expiry`).
  4. Safeguarding imports from BehaviourModule what it needs (BehaviourService for incident reads).
  5. BehaviourModule no longer exports safeguarding services.
  6. Update `module-blast-radius.md`.
- **Acceptance:** SafeguardingModule is a separate top-level module. Behaviour module exports count decreases. All existing tests pass. No circular dependencies introduced.

### Bucket 3D — Remaining Facade Migration (AFTER 3A + 3B)

#### 3D.1: Migrate remaining cross-module Prisma reads to facades

- **Risk ID:** AUD-003 | **Source:** Agent 1 | **Severity:** HIGH
- **Evidence:** After 3A migrates ~50%, the remaining ~50% of cross-module reads need migration. This includes behaviour reading students/academic data, reports reading everything, regulatory reading attendance/behaviour, worker processors reading foreign tables.
- **Action:** Module by module, replace `this.prisma.foreignModel` calls with facade method calls. Order:
  1. behaviour (20 cross-module imports)
  2. attendance (14 cross-module imports)
  3. reports (10 cross-module imports)
  4. regulatory (10 cross-module imports)
  5. Worker processors (highest invisible coupling)
- **Acceptance:** Prisma model access lint rule (3B.1) reports zero errors across all production code (excluding specs). All cross-module reads go through documented facades.

---

## Wave 4: Reliability Hardening

**Goal:** Close all documented open danger zones. Harden background job safety and notification reliability.

**Expected score change:** 9.2 → 9.3
**Timeline:** Weeks 4-6 (parallel with Wave 3)

### Bucket 4A — Danger Zone Mitigations (all parallel)

#### 4A.1: Parent notification stuck-alert (DZ-14)

- **Risk ID:** AUD-008 | **Source:** Agent 6 | **Severity:** MEDIUM
- **Evidence:** For negative incidents with `severity >= parent_notification_send_gate_severity`, notification is blocked unless `parent_description` is set. Incidents sit at `parent_notification_status = 'pending'` indefinitely with no staff alert.
- **Action:**
  1. Add a detection rule in the behaviour cron dispatch that flags incidents stuck in `pending` notification status for >24 hours.
  2. Create an in-app notification to the incident creator: "Incident #X is awaiting parent description before notification can be sent."
  3. Surface these in the admin dashboard as an action item.
- **Acceptance:** After 24 hours of pending notification status, staff receives an alert. Alert is visible in admin dashboard.

#### 4A.2: Academic period pre-closure validation (DZ-06)

- **Risk ID:** AUD-014 | **Source:** Agent 6 | **Severity:** MEDIUM
- **Evidence:** Closing a period while classes still have unmarked attendance or open assessments triggers downstream cron effects (auto-generated report cards at 03:00 UTC). No pre-closure validation exists.
- **Action:**
  1. In `academic-periods.service.ts`, add pre-closure checks:
     - Count pending attendance sessions for the period
     - Count open/draft assessments for the period
  2. Return a warning (not hard block) with counts to the frontend.
  3. Frontend shows confirmation dialog with the warnings.
- **Acceptance:** Closing a period with pending items shows a warning. Admin can proceed after acknowledging. No accidental closures with unresolved items.

#### 4A.3: Appeal decision transaction timeout guard (DZ-17)

- **Risk ID:** AUD-013 | **Source:** Agent 6 | **Severity:** MEDIUM
- **Evidence:** `behaviour-appeals.service.ts` `decide()` operates on up to 6 tables in a single interactive Prisma transaction. No explicit timeout. Under load, could hit PgBouncer query_timeout.
- **Action:**
  1. Add explicit `timeout: 15000` (15s) to the `$transaction()` call in `decide()`.
  2. Move notification enqueuing OUTSIDE the transaction (currently inside with try/catch). Enqueue after commit.
  3. This is safe because notification dispatch is idempotent.
- **Acceptance:** Transaction has explicit 15s timeout. Notification enqueuing happens after successful commit. Appeal decision tests still pass.

#### 4A.4: Legal hold release logic (DZ-18)

- **Risk ID:** — | **Source:** Agent 6 | **Severity:** MEDIUM
- **Evidence:** Both exclusion case creation and appeal submission set `behaviour_legal_holds` on linked entities. These prevent GDPR anonymisation. No release mechanism exists — legal holds accumulate.
- **Action:**
  1. When an appeal is decided (upheld, overturned, or modified) AND no open exclusion case remains, release the legal hold on the incident and sanction.
  2. When an exclusion case is finalised/overturned AND no pending appeal exists, release the legal hold.
  3. Add a `release_reason` and `released_at` timestamp to legal holds.
- **Acceptance:** Legal holds are released when their triggering conditions resolve. GDPR anonymisation can proceed on released holds. Tests cover both release paths.

#### 4A.5: Safeguarding status projection enforcement (DZ-13)

- **Risk ID:** — | **Source:** Agent 1, Agent 6 | **Severity:** HIGH
- **Evidence:** When an incident is `converted_to_safeguarding`, it must appear as `closed` to users without `safeguarding.view` permission. This projection must be applied at EVERY rendering surface. A missed surface = safeguarding info leak.
- **Action:**
  1. Add an integration test that verifies all incident-status-returning endpoints call `projectIncidentStatus()` when the user lacks `safeguarding.view`.
  2. Consider a custom ESLint rule or code reviewer checklist: any new endpoint that returns incident status must use the projection function.
- **Acceptance:** Integration test exists and passes. New endpoints returning incident data are caught by the test if they skip projection.

### Bucket 4B — Worker Reliability (parallel with 4A)

#### 4B.1: Retry/backoff configuration integration tests

- **Risk ID:** — | **Source:** Agent 3 | **Severity:** MEDIUM
- **Evidence:** All 21 queues have explicit retry/backoff configuration, but no test verifies the configuration matches expectations. Configuration drift would be invisible.
- **Action:** Create an integration test that:
  1. Reads the queue registration in `worker.module.ts`
  2. Asserts each queue's `attempts`, `backoff.type`, and `backoff.delay` match documented values
  3. Verifies `removeOnComplete` and `removeOnFail` are set on all queues
- **Acceptance:** Test exists, passes, and would catch any queue configuration change.

#### 4B.2: Worker health endpoint integration test

- **Risk ID:** — | **Source:** Agent 7 | **Severity:** LOW
- **Evidence:** Worker health check monitors 10 queues. No test verifies the health endpoint returns correct degraded/unhealthy status.
- **Action:** Create a test that mocks Redis/Postgres failures and verifies the health endpoint returns appropriate status codes.
- **Acceptance:** Test exists and passes.

### Bucket 4C — Production File Scanning (parallel with 4A, 4B)

#### 4C.1: Deploy ClamAV for production file scanning

- **Risk ID:** — | **Source:** Agent 6 | **Severity:** MEDIUM (critical at launch)
- **Evidence:** `attachment-scan.processor.ts` auto-approves all files as "clean" when ClamAV socket is not found. This is a development stub. In production with student documents and safeguarding attachments, this must be real.
- **Action:**
  1. Install ClamAV on the production server (or use a cloud scanning service).
  2. Configure the ClamAV socket path in production environment.
  3. Verify the attachment-scan processor connects and scans files.
  4. Files that fail scanning should be quarantined, not served.
- **Acceptance:** In production, uploaded files are scanned. Infected files are quarantined. The dev fallback still works locally.

---

## Wave 5: Operational Maturity

**Goal:** Close observability gaps, add operational tooling, and harden the deployment pipeline.

**Expected score change:** 9.3 → 9.4
**Timeline:** Weeks 4-8 (parallel with Waves 3-4)

### Bucket 5A — Observability (all parallel)

#### 5A.1: Centralized log aggregation

- **Risk ID:** AUD-009 | **Source:** Agent 7 | **Severity:** MEDIUM
- **Evidence:** Structured JSON logs with correlation IDs are produced but persist only in PM2 log files. `LOKI_PUSH_URL` placeholder exists in `.env.example` but no ingestion code was found. Incident investigation requires SSH.
- **Action:**
  1. Implement log shipping from PM2 JSON logs to a centralized service (CloudWatch Logs, Loki, or equivalent).
  2. Configure separate log groups/streams per service (api, web, worker).
  3. Set up log retention policies (90 days minimum for compliance).
  4. Configure basic alerting on error rate spikes.
- **Acceptance:** Logs from all 3 services are visible in a centralized dashboard. Logs include tenant_id, user_id, and correlation_id. Error rate alerts are configured.

#### 5A.2: Production request logging

- **Risk ID:** — | **Source:** Agent 7 | **Severity:** LOW-MEDIUM
- **Evidence:** `RequestLoggingMiddleware` is development-only (skipped in production). No HTTP access log in production.
- **Action:** Enable request logging in production with structured JSON: method, path, status code, response time, tenant_id, user_id. Exclude health check endpoints to reduce noise.
- **Acceptance:** Production request logs are generated and shipped to the centralized log service.

#### 5A.3: Prometheus metrics endpoint

- **Risk ID:** — | **Source:** Agent 7 | **Severity:** LOW
- **Evidence:** No `/metrics` endpoint exists. Health checks are HTTP-based but no scraping for trends.
- **Action:** Add a `/metrics` endpoint with key metrics: request count by endpoint, response time histogram, queue depths, error rates, active DB connections, Redis memory usage. Use `prom-client` or equivalent.
- **Acceptance:** `/metrics` endpoint returns Prometheus-compatible metrics. Optionally connected to Grafana.

### Bucket 5B — Encryption Operations (parallel with 5A)

#### 5B.1: Build encryption key rotation tooling

- **Risk ID:** AUD-007 | **Source:** Agent 4 | **Severity:** MEDIUM
- **Evidence:** `encryption.service.ts` supports versioned keys (V1-V100) with `ENCRYPTION_CURRENT_VERSION`. But no re-encryption migration script exists (DZ-09). A compromised key means permanently unreadable data.
- **Action:**
  1. Create `scripts/rotate-encryption-key.ts` that:
     a. Reads `ENCRYPTION_CURRENT_VERSION` (old) and `ENCRYPTION_NEW_VERSION` (target)
     b. For each tenant, scans all encrypted fields (staff_profiles bank details, tenant_stripe_config, payslips, MFA secrets)
     c. Decrypts each field with the old version key
     d. Re-encrypts with the new version key
     e. Updates the `keyRef` on each record
     f. Runs in a transaction per tenant
  2. Add a dry-run mode that reports which records would be rotated.
  3. Document the rotation procedure in runbooks.
- **Acceptance:** Script exists, has a dry-run mode, and is tested against a non-production database. Documentation describes the full rotation procedure.

### Bucket 5C — Deploy Safety (parallel with 5A, 5B)

#### 5C.1: Automated migration verification in deploy script

- **Risk ID:** AUD-016 | **Source:** Agent 7 | **Severity:** MEDIUM
- **Evidence:** If `prisma migrate deploy` partially fails, the DB is in an inconsistent state. The pg_dump backup is the safety net but recovery is manual.
- **Action:**
  1. After `prisma migrate deploy`, run a verification query that checks `_prisma_migrations` table for any migration with `finished_at IS NULL`.
  2. If found, abort deploy, send alert, and provide instructions for manual recovery from the pg_dump backup.
  3. Do NOT attempt automated rollback of partial migrations (Prisma migrations are forward-only; automatic rollback is dangerous).
- **Acceptance:** Deploy script detects partial migration failure and aborts with clear instructions. Alert is sent via Slack/Telegram.

#### 5C.2: Separate readiness probe from full health check

- **Risk ID:** — | **Source:** Agent 7 | **Severity:** LOW
- **Evidence:** `GET /health/ready` returns the full health check (all 7 subsystems). A non-critical service failure (Meilisearch) could pull the instance from rotation.
- **Action:** Make readiness probe check only critical dependencies (PostgreSQL, Redis). Full health check remains on `GET /health`.
- **Acceptance:** Readiness probe returns 200 even if Meilisearch is down. Full health check reports degraded.

#### 5C.3: PM2 cluster mode adjustment

- **Risk ID:** — | **Source:** Agent 7 | **Severity:** LOW
- **Evidence:** `ecosystem.config.cjs` has `exec_mode: 'cluster'` with `instances: 1` for api and web. Cluster mode with 1 instance adds overhead without multi-worker benefit.
- **Action:** Either set `instances: 2` (if server has capacity) or change to `exec_mode: 'fork'` to reduce overhead. Consider making instances configurable via env var.
- **Acceptance:** PM2 configuration is intentional and documented.

### Bucket 5D — Security Governance (parallel with 5A-5C)

#### 5D.1: Permission cache invalidation integration test

- **Risk ID:** AUD-018 | **Source:** Agent 4, Agent 6 | **Severity:** LOW-MEDIUM
- **Evidence:** Permissions cached in Redis with 60-second TTL (DZ-08). `invalidate()` and `invalidateAllForTenant()` methods exist. But no integration test verifies all mutation paths trigger invalidation.
- **Action:** Create an integration test that:
  1. Grants a permission to a role
  2. Verifies cache is populated
  3. Removes the permission
  4. Verifies cache is invalidated (not just expired)
  5. Tests: role permission change, membership status change, role assignment change
- **Acceptance:** Integration test exists and passes. Each critical mutation path triggers cache invalidation.

---

## Wave 6: Code Quality & Maintainability

**Goal:** Fix code quality issues that affect daily development velocity and long-term maintainability.

**Expected score change:** 9.4 → 9.5
**Timeline:** Weeks 6-8

### Bucket 6A — Mechanical Fixes (all parallel)

#### 6A.1: Fix 358 frontend catch blocks missing diagnostic logging

- **Risk ID:** AUD-006 | **Source:** Agent 5 | **Severity:** MEDIUM
- **Evidence:** 358 `catch {}` blocks across 182 frontend files have no error parameter. Users see toasts but developers get zero diagnostic info.
- **Action:** Scriptable fix across all files:
  1. `catch {}` → `catch (err) { console.error('[ComponentName]', err); }`
  2. `catch (_) {}` → `catch (err) { console.error('[ComponentName]', err); }`
  3. Preserve existing toast calls.
- **Acceptance:** Zero `catch {}` blocks without `console.error` in frontend source. Lint rule or grep confirms.

#### 6A.2: Fix frontend i18n hardcoded strings

- **Risk ID:** — | **Source:** Agent 5 | **Severity:** MEDIUM
- **Evidence:** ESLint `school/no-untranslated-strings` reports warnings in gradebook, homework, and other newer pages. 29+ hardcoded strings in the appeals detail page alone.
- **Action:** Extract all hardcoded strings to `messages/{locale}.json` translation files. Add Arabic translations.
- **Acceptance:** `pnpm turbo run lint` reports zero i18n warnings.

#### 6A.3: Fix payroll entry creation duplication

- **Risk ID:** AUD-017 | **Source:** Agent 5 | **Severity:** LOW-MEDIUM
- **Evidence:** Same ~20-field entry creation block copy-pasted 3 times in `payroll-runs.service.ts` with 24 identical Decimal-to-Number null-guard conversions.
- **Action:** Extract a shared `buildPayrollEntry(source: StaffPayrollData): PayrollEntryCreateInput` helper.
- **Acceptance:** Single definition used in all 3 call sites. Existing payroll tests pass.

#### 6A.4: Fix settings retrieval error guard duplication

- **Risk ID:** — | **Source:** Agent 5 | **Severity:** LOW
- **Evidence:** Same 8-line type-guard pattern for handling missing tenant settings repeated 3 times in one file.
- **Action:** Extract a helper function.
- **Acceptance:** Single definition. Tests pass.

### Bucket 6B — God-File Decomposition (parallel with 6A)

#### 6B.1: Decompose largest backend services exceeding 1,000 lines

- **Risk ID:** — | **Source:** Agent 5 | **Severity:** LOW-MEDIUM
- **Evidence:** 24 backend services exceed 800 lines. The largest: workload-compute (1,161), households (1,122), homework-analytics (1,088), behaviour-sanctions (1,078), safeguarding-concerns (1,070), pastoral-dsar (1,055), attendance-upload (1,040), behaviour (1,011).
- **Action:** For the top 5 largest services, extract logical sub-services:
  1. `households.service.ts` (1,122) → Split CRUD vs financial aggregation vs emergency contacts
  2. `attendance-upload.service.ts` (1,040) �� Split parsing vs validation vs processing
  3. `homework-analytics.service.ts` (1,088) → Split computation vs data retrieval
  4. (behaviour and safeguarding addressed by Wave 3C extraction)
- **Acceptance:** No backend service exceeds 800 lines (aligning with the ESLint max-lines warning). Extracted services follow single responsibility. All tests pass.

### Bucket 6C — Extended RLS Leakage Tests (parallel with 6A, 6B)

#### 6C.1: RLS leakage tests for remaining high-value tables

- **Risk ID:** AUD-001 | **Source:** Agent 2, Agent 4 | **Severity:** MEDIUM
- **Evidence:** Wave 1 added tests for top 10 tables. ~243 tenant-scoped tables remain. Prioritize the next 20 by data sensitivity.
- **Action:** Add RLS leakage tests for:
  1. `applications` — admissions data
  2. `approval_requests` — workflow data
  3. `consent_records` — GDPR consent
  4. `notifications` — communications
  5. `report_cards` — academic records
  6. `safeguarding_concerns` — highly sensitive
  7. `pastoral_cases` — sensitive
  8. `payroll_adjustments` — financial
  9. `credit_notes` — financial
  10. `engagement_form_submissions` — student activity
  11. `diary_notes` — personal notes
  12. `sen_support_plans` — SEN data (highly regulated)
  13. `homework_assignments` — academic
  14. `scheduling_runs` — operational
  15. `staff_attendance_records` — HR data
  16. `behaviour_sanctions` — student records
  17. `behaviour_appeals` — student records
  18. `gdpr_anonymisation_tokens` — security-critical
  19. `import_jobs` — data import
  20. `parent_inquiries` — communications
- **Acceptance:** 20 additional RLS leakage test files, all passing. Total RLS test coverage: 33 tables (10 from Wave 1 + 3 existing + 20 new).

### Bucket 6D — Final Coverage Ratchet (AFTER 6A-6C)

#### 6D.1: Ratchet branch coverage to 70%

- **Risk ID:** AUD-012 | **Source:** Agent 2 | **Severity:** MEDIUM
- **Evidence:** After all spec additions across Waves 1-6, branch coverage should be well above 65%.
- **Action:** Measure actual coverage. Set new threshold to (measured - 2%). Target: ≥70%.
- **Acceptance:** `jest.config.js` branch threshold ≥70%. CI passes.

---

## Dependency Map

```
WAVE 1 (no dependencies — start immediately)
├── Bucket 1A: Security quick fixes ──────────────────── parallel ─┐
├── Bucket 1B: File upload hardening ─��───────────────── parallel ─���
├── Bucket 1C: RLS leakage tests (10 tables) ─────────── parallel ─┤
└── Bucket 1D: GDPR service specs ───────��────────────── parallel ─┘
     │
     ▼ (Wave 1 complete)
WAVE 2 (start after Wave 1, or overlap last week)
├── Bucket 2A: Pastoral specs (22 files) ──────────────── parallel ─┐
├── Bucket 2B: Other missing specs (~45 files) ───���────── parallel ─┤
├── Bucket 2C: RLS tests in CI ────────────────────────── parallel ─┤
│                                                                    │
│   Bucket 2D: Coverage ratchet to 65% ─── AFTER 2A + 2B complete ──┘
     │
     ▼ (Wave 2 complete)
WAVE 3 (can start during Wave 2 if 2A is ahead)
├── Bucket 3A: ReadFacades (6 tables) ─────────────────── parallel ─┐
├── Bucket 3C: Extract safeguarding module ────────────── parallel ─┤
│                                                                    │
│   Bucket 3B: Prisma model access lint rule ── AFTER 3A ───────────┤
│   Bucket 3D: Remaining facade migration ──── AFTER 3A + 3B ──────┘
     │
     ▼
WAVE 4 (parallel with Wave 3)
├── Bucket 4A: DZ mitigations (5 items) ───────────────── parallel ─┐
├── Bucket 4B: Worker reliability tests ───────────────── parallel ─┤
└── Bucket 4C: ClamAV deployment ──────────────────────── parallel ─┘
     │
     ▼
WAVE 5 (parallel with Waves 3-4)
├── Bucket 5A: Observability (3 items) ────────────────── parallel ─┐
├── Bucket 5B: Key rotation tooling ───────────────────── parallel ─┤
├── Bucket 5C: Deploy safety (3 items) ────────────────── parallel ─┤
└── Bucket 5D: Security governance ────────────────────── parallel ─┘
     │
     ▼ (Waves 3-5 complete)
WAVE 6 (final push)
├── Bucket 6A: Mechanical fixes (4 items) ─────────────── parallel ─┐
├── Bucket 6B: God-file decomposition ─────────────────── parallel ─┤
├── Bucket 6C: Extended RLS tests (20 tables) ─────────── parallel ─┤
│                                                                    │
│   Bucket 6D: Final coverage ratchet to 70% ─ AFTER 6A-6C ────────┘
```

---

## Expected Score Progression

| Milestone      | Completed Waves                         | Expected Score |
| -------------- | --------------------------------------- | -------------- |
| Baseline       | —                                       | 7.7            |
| Wave 1 done    | Security fixes + RLS tests + GDPR specs | 8.4            |
| Wave 2 done    | All test gaps closed                    | 8.9            |
| Waves 3+4 done | Architecture + reliability hardened     | 9.2-9.3        |
| Wave 5 done    | Ops maturity                            | 9.3-9.4        |
| Wave 6 done    | Code quality + final push               | 9.5            |

---

## Total Action Item Count

| Wave      | Buckets | Action Items | New Test Files                | New/Modified Source Files  |
| --------- | ------- | ------------ | ----------------------------- | -------------------------- |
| 1         | 4       | 8            | 17 (10 RLS + 7 GDPR)          | ~10                        |
| 2         | 4       | 5            | ~55 (22 pastoral + ~33 other) | ~5                         |
| 3         | 4       | 4            | ~10 facade specs              | ~30 (facades + migrations) |
| 4         | 3       | 7            | ~8                            | ~15                        |
| 5         | 4       | 7            | ~5                            | ~15                        |
| 6         | 4       | 6            | ~22 (20 RLS + 2)              | ~25                        |
| **Total** | **23**  | **37**       | **~117**                      | **~100**                   |

---

## Verification Protocol

After each wave, verify:

1. `pnpm turbo run test` — all tests pass
2. `pnpm turbo run lint` — no new errors
3. `pnpm turbo run type-check` — clean
4. `pnpm check:test-gate` — coverage maintained or improved
5. `npx tsx scripts/audit-rls.ts` — RLS audit still passing
6. `pnpm check:boundaries` — violations decreasing
7. `node scripts/check-cross-module-deps.js` — violations decreasing

After Wave 6, commission a fresh 7-agent audit to verify the 9.5 target.

---

## What This Plan Does NOT Cover (Deliberately Deferred)

1. **Frontend E2E / CRUD workflow tests** — Deferred until after UX/UI overhaul. Will be implemented as Playwright recordings by the user.
2. **Multi-server deployment / containerization** — Out of scope for this health recovery.
3. **Blue-green / canary deployment** — Requires multi-server infrastructure.
4. **DAST scanning** — Considered in Wave 5D but not included as a hard requirement.
5. **License scanning** — Not a health blocker.
