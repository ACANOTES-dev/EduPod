# Danger Zones

> **Purpose**: Non-obvious coupling and risks. Before modifying anything listed here, read the full entry.
> **Maintenance**: Add entries when you discover a non-obvious consequence. Remove when the risk is mitigated.
> **Last verified**: 2026-04-07

---

## DZ-01: Invoice Status Machine — MITIGATED

**Risk**: ~~Bugs from invalid transitions, inconsistent validation~~
**Location**: `packages/shared/src/constants/invoice-status.ts`, `apps/api/src/modules/finance/helpers/invoice-status.helper.ts`
**Status**: MITIGATED (2026-03-30)

The invoice state machine now has a single `VALID_INVOICE_TRANSITIONS` map in `packages/shared/src/constants/invoice-status.ts`, matching the pattern used by StudentStatus, ClassEnrolmentStatus, and the behaviour module state machines.

- `validateInvoiceTransition()` in the helper file enforces all user-initiated transitions (void, cancel, write-off)
- `deriveInvoiceStatus()` handles system-driven transitions (payment -> partially_paid/paid, overdue cron)
- `isPayableStatus()` consolidates the "can this invoice accept payments/credits/late-fees" check (used by credit-notes, late-fees, stripe, payments services)
- 90 transition tests cover all valid transitions, all invalid transitions from terminal states, and all invalid transitions between non-terminal states

**Remaining note**: Three transitions still happen outside the invoice service: `overdue` (cron worker), `issued` via approval (approval callback worker), `partially_paid/paid` (payment service via `deriveInvoiceStatus`). These are documented in the transition metadata and covered by the transition map.

---

## DZ-02: Prisma-Direct Cross-Module Queries — MITIGATED

**Risk**: Schema changes breaking modules that aren't visible in the NestJS dependency graph
**Location**: Throughout `apps/api/src/modules/`
**Status**: MITIGATED (2026-04-05)

**Mitigation applied**: All cross-module Prisma reads are now routed through read facades. 31+ `*-read.facade.ts` files centralise every cross-module table access with explicit typed methods. The `ReadFacadesModule` (`apps/api/src/common/read-facades.module.ts`) registers all facades globally.

**Enforcement**: The custom ESLint rule `no-cross-module-prisma-access` is set to `error` severity in `packages/eslint-config/nest.js`. CI blocks any new direct cross-module Prisma access. Zero violations remain.

**Rule**: When changing schema for any table read cross-module, update the corresponding `*-read.facade.ts` file. The lint rule will catch any attempt to bypass the facade layer.

---

## DZ-03: Approval Callback Chain — MITIGATED

**Risk**: Approved items that never execute their domain action
**Location**: `apps/api/src/modules/approvals/approval-requests.service.ts` -> worker processors
**Status**: MITIGATED (Batch 3 -- Issue #3.2)

When a user approves a request, the approval is marked `approved` and a BullMQ job is enqueued. Previously fire-and-forget -- now tracked with `callback_status`, `callback_error`, and `callback_attempts` fields on `approval_requests`.

**Tracking mechanism**:

- `callback_status = 'pending'` set when approval creates a callback-eligible action type
- `callback_status = 'executed'` set by each callback processor on success (alongside `status = 'executed'` and `executed_at`)
- `callback_status = 'failed'` set when enqueue fails or reconciliation exhausts retries

**Reconciliation cron**: `approvals:callback-reconciliation` runs daily at 04:30 UTC. Scans for approved requests where `callback_status` is `pending` or `failed` and `decided_at` is older than 30 minutes. Re-enqueues the callback job up to 5 attempts. After 5 attempts, marks as permanently failed (manual intervention required).

**Remaining edge case**: If a callback processor throws after executing the domain action but before setting `callback_status = 'executed'`, the reconciliation cron will retry. The callback processors are designed to be idempotent (they check the target entity's status before acting), so a duplicate re-enqueue is safe.

---

## DZ-04: Sequence Type Mismatch — RESOLVED

**Risk**: ~~Refund sequence generation fails silently~~
**Location**: `packages/shared/src/constants/sequence-types.ts` vs `apps/api/src/modules/finance/refunds.service.ts`
**Status**: RESOLVED (2026-04-05)

The `'refund'` type is now included in the canonical `SEQUENCE_TYPES` array in `packages/shared/src/constants/sequence-types.ts`. No mismatch remains.

---

## DZ-05: TenantSettings JSONB Is a God Object — RESOLVED

**Risk**: ~~Settings schema changes require migrating ALL tenants' stored data~~
**Location**: `packages/shared/src/schemas/tenant.schema.ts` -> `tenantSettingsSchema`, `packages/prisma/schema.prisma` -> `TenantModuleSetting`
**Status**: RESOLVED (2026-03-31, Batch 9.1)

The monolithic `tenant_settings.settings` JSONB blob has been decomposed into a relational `tenant_module_settings` table with one row per (tenant, module_key) pair. Each row stores only that module's configuration in its `settings` JSONB column, validated through the per-module Zod schema.

**What changed:**

- New `tenant_module_settings` table with `ModuleKey` enum, `(tenant_id, module_key)` unique constraint, and RLS policy
- `SettingsService.getModuleSettings()` reads from the per-module row first, falls back to the legacy blob
- `SettingsService.updateModuleSettings()` upserts the per-module row via RLS transaction and syncs the legacy blob for backward compatibility
- `SettingsService.getSettings()` merges per-module rows over the legacy blob, so both sources are honoured during transition

**Remaining rule**: Every new settings field MUST still have a `.default()` value. The per-module decomposition eliminates the cross-module corruption risk but doesn't change the need for safe schema evolution within each module.

---

## DZ-06: Academic Period Closure Triggers Cron Side Effects — MITIGATED

**Risk**: Closing a period causes unexpected automated actions
**Location**: `apps/worker/src/cron/cron-scheduler.service.ts` + gradebook processors, `apps/api/src/modules/academics/academic-periods.service.ts`
**Status**: MITIGATED (2026-04-05)

The `gatherClosureWarnings()` method in `academic-periods.service.ts` now checks for pending attendance and open assessments before closing a period. Warnings are returned to the caller (and surfaced in the UI) so admins can make an informed decision. The cron side effects (report-cards:auto-generate, gradebook:detect-risks) still run, but accidental closures are prevented by the warning mechanism.

**Remaining note**: The cron side effects are still fire-and-forget after closure. If an admin closes a period despite warnings, the cron will generate draft report cards the next morning. This is by design — the warning is the mitigation, not a hard block.

---

## DZ-07: Classes-Schedules Circular Dependency

**Risk**: Naive refactoring breaks the lazy injection pattern
**Location**: `apps/api/src/modules/classes/classes.module.ts`

ClassesModule and SchedulesModule have a potential circular dependency. It's broken by ClassesModule using `ModuleRef` lazy injection to get `SchedulesService` in `OnModuleInit`. If someone:

- Adds a direct import of SchedulesService in a classes constructor
- Or removes the `forwardRef` / lazy injection

NestJS will throw a circular dependency error at startup.

---

## DZ-08: PermissionCache Invalidation

**Risk**: Stale permissions = security vulnerability or access denial
**Location**: `apps/api/src/common/common.module.ts` -> PermissionCacheService

Permissions are cached in Redis. If a role's permissions are changed:

- The cache must be invalidated for ALL users with that role
- If invalidation fails or is missed, users have stale permissions until cache TTL expires
- Stale elevated permissions = security risk
- Stale reduced permissions = users locked out of features they should access

**Rule**: After any change to roles, permissions, or membership status, verify cache invalidation is triggered.

---

## DZ-09: Encrypted Fields — One-Way Risk (MITIGATED)

**Risk**: Changing encryption logic makes existing data permanently unreadable
**Location**: `apps/api/src/modules/configuration/encryption.service.ts`
**Mitigation**: Key rotation tooling now exists — see `docs/operations/key-rotation-runbook.md`

Bank details (staff profiles), Stripe keys (tenant config), MFA TOTP secrets (users), and admission payment details are AES-256 encrypted at rest. The encryption key comes from environment variables.

If you:

- Change the encryption algorithm or key derivation
- Rotate the encryption key without re-encrypting existing data
- Modify the IV generation

All existing encrypted fields become unreadable garbage.

**Mitigation in place**: `KeyRotationService` (API), `KeyRotationProcessor` (Worker), and `scripts/rotate-encryption-key.ts` (CLI) handle decrypt-old → re-encrypt-new for all three encrypted field categories (Stripe configs, staff bank details, MFA secrets). Dry-run mode available. See runbook for procedure.

**Rule**: Never modify EncryptionService without a migration plan for existing encrypted data. Run key rotation after any key change.

---

## DZ-10: Report Card Template sections_json Has 14 Section Types

**Risk**: Adding/modifying section types breaks existing templates
**Location**: `packages/shared/src/schemas/gradebook.schema.ts` -> `templateSectionConfigSchema`

Report card templates store their layout in `sections_json` with 14 discriminated section types. Each type has its own `config` shape. Existing templates in the database reference these types by string key.

If you rename or remove a section type, existing templates become invalid and report card PDF generation will fail for those templates.

**Rule**: Section types are append-only. Deprecate by adding `deprecated: true` to the type, never remove.

---

## DZ-11: Audit Log Interceptor Is Global and Synchronous — MITIGATED

**Risk**: Performance degradation on high-frequency mutation endpoints
**Location**: `apps/api/src/common/interceptors/audit-log.interceptor.ts`, `apps/worker/src/processors/audit-log/audit-log-write.processor.ts`
**Status**: MITIGATED (2026-04-05)

The `AuditLogInterceptor` now enqueues audit log writes via BullMQ (`audit-log` queue) instead of writing to the database inline. The `AuditLogWriteProcessor` in the worker handles the actual DB write. Mutation response latency is no longer affected by audit log write time.

**What changed**:

- `AuditLogService.enqueue()` puts the write payload on the `audit-log` queue
- Interceptor calls `enqueue()` instead of `write()`
- `AuditLogService.write()` still exists for direct callers (SecurityAuditService, track())
- `AuditLogWriteProcessor` in the worker writes the log entry

**Remaining note**: `AuditLogService.write()` is still synchronous for callers that need immediate audit persistence (security audit events). Only the interceptor path is async.

---

## DZ-12: Household Reference Generation Uses Random Collision Checking — MITIGATED

**Risk**: ~~Under very high concurrent registration, reference collisions could exhaust retries~~
**Location**: `apps/api/src/modules/sequence/sequence.service.ts` -> `generateHouseholdReference()`
**Status**: MITIGATED (2026-04-05)

Household references now use the same `SELECT ... FOR UPDATE` sequence-based approach as other sequence types (invoices, receipts, etc.). Format changed from random `XXX999-9` to sequential `HH-YYYYMM-000001`. Collision-free by design — no retry loop needed.

---

## DZ-13: Behaviour Status Projection Leaks Safeguarding Info If Missed — MITIGATED

**Risk**: Non-safeguarding users discovering that a student has a safeguarding concern
**Location**: `apps/api/src/modules/behaviour/behaviour.service.ts`, search indexing, exports, parent portal
**Status**: MITIGATED (2026-04-05)

When an incident is `converted_to_safeguarding`, it must appear as `closed` to ALL users without `safeguarding.view` permission. `projectIncidentStatus()` from `packages/shared/src/behaviour/state-machine.ts` handles this projection.

**Evidence**: `apps/api/src/modules/behaviour/tests/safeguarding-projection.spec.ts` validates that the projection is applied correctly across all surfaces.

**Remaining rule**: Every new surface that renders incident status MUST call `projectIncidentStatus()`. This is a permanent constraint, not something that can be removed.

---

## DZ-14: Behaviour Parent Description Send-Gate Silently Blocks Notifications — MITIGATED

**Risk**: Parents never notified about a negative incident because staff didn't add a parent-safe description
**Location**: `apps/worker/src/processors/behaviour/parent-notification.processor.ts`, `apps/worker/src/processors/behaviour/stuck-notification-alert.processor.ts`
**Status**: MITIGATED (2026-04-05)

For negative incidents with `severity >= parent_notification_send_gate_severity` (default 3), the parent notification is BLOCKED unless `parent_description` is set, a template was used, or `parent_description` is explicitly empty string.

**Mitigation applied**: `stuck-notification-alert.processor.ts` detects incidents stuck in `pending` notification status for >24 hours and alerts staff. Test coverage in `stuck-notification-alert.processor.spec.ts`.

---

## DZ-19a: useApiQuery Option Identity Caused Global Request Storm — RESOLVED

**Risk**: Re-render loops can spam a shared API endpoint until the global throttler locks out the whole UI
**Location**: `apps/web/src/hooks/use-api-query.ts`, `apps/web/src/components/legal/privacy-notice-banner.tsx`
**Status**: RESOLVED (2026-04-05)

`useApiQuery()` originally rebuilt its `refetch()` callback whenever inline `onError`, `onSuccess`, `select`, or `requestInit` options changed identity. Because the hook's auto-fetch effect depended on that callback, any component that passed inline options could re-request on every render.

The production incident on 2026-04-05 came from `PrivacyNoticeBanner`, which is mounted in the school layout on every authenticated page and passed an inline `onError` callback. That created a tight loop on `GET /api/v1/privacy-notices/current`, which quickly exceeded the global `ThrottlerGuard` limit and surfaced as generic "unexpected error" toasts across the app.

**Mitigation applied**: `useApiQuery()` now reads the latest option values from a ref while keeping its auto-fetch effect keyed to `path` and `enabled`. Inline callbacks/options no longer trigger automatic refetches on every render.

---

## DZ-15: Behaviour Domain Constraint — Last Student Participant

**Risk**: Application-level constraint can be bypassed if someone uses raw SQL or a different service
**Location**: `apps/api/src/modules/behaviour/behaviour.service.ts` -> `removeParticipant()`, database trigger on `behaviour_incident_participants`

Every incident MUST have at least one student participant. This is enforced at two levels:

1. Application: `removeParticipant()` checks count before DELETE
2. Database: `trg_prevent_last_student_participant` trigger on `behaviour_incident_participants`

The database trigger is the safety net. If the trigger is ever dropped or disabled (e.g., during a migration), the constraint becomes application-only and can be bypassed.

**Mitigation**: Never drop the `trg_prevent_last_student_participant` trigger without adding an equivalent constraint.

---

## DZ-16: Behaviour Scope Resolution Depends on Class Assignments

**Risk**: Scope filter returns wrong results if class assignments are stale or missing
**Location**: `apps/api/src/modules/behaviour/behaviour-scope.service.ts`

For users with `class` scope, the service resolves visible students by querying `ClassStaff` (which classes the user teaches) then `ClassEnrolment` (which students are in those classes). If a teacher is not assigned to their classes in the system, or enrolments are not up to date, they will see NO students in the behaviour module.

**Mitigation**: When troubleshooting "teacher can't see any behaviour data", first check `ClassStaff` assignments and `ClassEnrolment` records for that teacher.

---

## DZ-17: Appeal Decision Cascades Across 6 Tables in One Transaction — MITIGATED

**Risk**: Transaction timeout or partial failure corrupting cross-entity state
**Location**: `apps/api/src/modules/behaviour/behaviour-appeals.service.ts` → `decide()`
**Status**: MITIGATED (2026-04-05)

When an appeal decision is recorded, the `decide()` method operates on up to 6 tables in a single interactive Prisma transaction. Explicit transaction timeouts are now in place:

- `decide()` uses `{ timeout: 15000 }` (15s guard)
- Other multi-table operations use `{ timeout: 30000 }` (30s guard)

**Evidence**: `behaviour-appeals.service.spec.ts` includes test `'should use 15s transaction timeout guard (DZ-17)'` verifying the timeout is passed.

**Remaining note**: Notification enqueuing remains inside the transaction with try/catch. If timeout issues recur under load, the next lever is to move notification enqueuing outside the transaction.

---

## DZ-18: Legal Hold Cascading on Exclusion Cases and Appeals — MITIGATED

**Risk**: Legal holds prevent GDPR anonymisation from completing
**Location**: `behaviour-exclusion-cases.service.ts`, `behaviour-appeals.service.ts`, `behaviour-legal-hold.service.ts`
**Status**: MITIGATED (2026-04-05)

Both exclusion case creation and appeal submission automatically set `behaviour_legal_holds` on the linked incident, sanction, and all related entities.

**Mitigation applied**: `behaviour-legal-hold.service.ts` implements `releaseHold()` which releases holds when: (1) appeal is decided and no exclusion case remains open, (2) exclusion case is finalised/overturned. The retention worker checks for legal holds before anonymisation. The admin dashboard surfaces active holds. Test coverage in `behaviour-legal-hold.service.spec.ts`.

---

## DZ-19: Document Generation Runs Puppeteer Inside API Transaction — RESOLVED

**Risk**: ~~Puppeteer PDF rendering is slow (1-5s) and runs inside an interactive Prisma transaction, holding a DB connection. Under concurrency this can exhaust the connection pool or hit transaction timeouts.~~
**Location**: `behaviour-document.service.ts` -> `generateDocument()` and `autoGenerateDocument()`
**Status**: RESOLVED (2026-04-02, reliability hardening R-14)

Resolved in reliability hardening. PDF rendering now enqueued via BullMQ with `generating` -> `draft_doc` callback pattern. The API transaction creates a document record with `status: 'generating'` and enqueues the PDF render job. `PdfRenderProcessor` handles rendering and S3 upload outside any DB transaction, then dispatches `behaviour:document-ready` which transitions the document to `draft_doc`.

**Remaining note**: See DZ-37 for the new `generating` status contract that callers must respect.

---

## DZ-20: Amendment Correction Chain Touches 5 Tables in sendCorrection — MITIGATED

**Risk**: The amendment correction dispatch creates ack rows, notifications, updates amendment notice flags, and supersedes documents — all within one transaction.
**Location**: `behaviour-amendments.service.ts` -> `sendCorrection()`
**Status**: MITIGATED (2026-04-05)

**What changed**:

- Transaction now has explicit `{ timeout: 15000 }` (15s guard, matching DZ-17 pattern)
- BullMQ notification enqueuing (`behaviour:correction-parent`, `behaviour:parent-reacknowledgement`) moved outside the transaction as post-commit side effects
- DB mutations (acknowledgement rows, notification rows, flag update, document supersession, history) remain in the transaction for atomicity

**Remaining note**: For tenants with large multi-guardian households, the transaction may still be slower than average. The timeout guard prevents indefinite blocking.

---

## DZ-21: Anonymisation Is Irreversible — Legal Hold Is the Only Gate

**Risk**: Once the retention worker anonymises a record (PII replaced, retention_status → 'anonymised'), there is NO undo mechanism. The only safety gate is the legal hold check in `behaviour_legal_holds`.
**Location**: `apps/worker/src/processors/behaviour/retention-check.processor.ts`

If a legal hold is incorrectly released or never created, the retention worker will anonymise the record on its next monthly run. There is no "un-anonymise" API.

**Mitigation**: (1) Always require dual approval for manual retention execution. (2) Legal hold propagation creates holds on all linked entities — releasing the anchor hold alone does NOT release propagated holds unless `releaseLinked=true`. (3) The retention worker supports `dry_run=true` mode — always preview before executing. (4) Exclusion cases and safeguarding concerns are NEVER auto-anonymised — they are flagged for manual review.

---

## DZ-22: Partition Maintenance Uses $executeRawUnsafe for DDL

**Risk**: The partition maintenance processor uses `$executeRawUnsafe` to create table partitions. This bypasses Prisma's query parameterisation.
**Location**: `apps/worker/src/processors/behaviour/partition-maintenance.processor.ts`

Table and partition names are derived from constants (not user input), so SQL injection risk is minimal. However, if the `PARTITIONED_TABLES` constant is ever modified to include user-controlled values, this becomes a vulnerability.

**Mitigation**: Table names are hardcoded in the `PARTITIONED_TABLES` constant array. Never derive partition names from user input or job payloads.

---

## DZ-23: Break-Glass Expiry Has No Dispatch Mechanism — RESOLVED

**Risk**: Expired break-glass grants remain active indefinitely because nothing enqueues the expiry job
**Location**: `apps/worker/src/processors/safeguarding/break-glass-expiry.processor.ts`

**Status**: RESOLVED in Batch 3 (issue #3.3). `behaviour:break-glass-expiry` is now dispatched daily at 00:00 UTC via `BehaviourCronDispatchProcessor.dispatchDaily()`. Uses `jobId: daily:behaviour:break-glass-expiry:{tenant_id}` for per-tenant dedup. Processor was previously also dispatched from `dispatchSla()` (every 5 min) without dedup — that unnecessary dispatch has been removed.

---

## DZ-24: Check-Awards Concurrent Duplicate — MITIGATED

**Risk**: Duplicate awards when multiple positive incidents for the same student are processed concurrently
**Location**: `apps/worker/src/processors/behaviour/check-awards.processor.ts`
**Status**: MITIGATED (2026-04-05)

**Mitigation applied**: The processor now acquires a `SELECT ... FOR UPDATE` lock on the `behaviour_award_types` row before the dedup check. This serializes concurrent jobs checking the same award type, ensuring the second job's `checkRepeatEligibility()` sees the first job's award before it commits. Test coverage in `check-awards.processor.spec.ts`.

**Remaining note**: `unlimited` repeat mode still allows multiple awards from different incidents by design — the lock ensures they are created sequentially, not that they are prevented.

---

## DZ-25: SLA Threshold Changes Are Not Retroactive

**Risk**: Relaxing SLA thresholds does not relieve existing safeguarding concerns that have already breached
**Location**: `apps/worker/src/processors/safeguarding/sla-check.processor.ts`, `apps/api/src/modules/safeguarding/safeguarding.service.ts`

The SLA check processor queries `sla_first_response_due < now()` to detect breaches. The `sla_first_response_due` timestamp is set at concern creation time based on the tenant's configured SLA threshold at that moment. If a tenant later relaxes the SLA (e.g., from 1 hour to 4 hours):

1. Existing concerns that already breached under the old threshold remain breached
2. Breach tasks already created are not auto-resolved
3. The `sla_first_response_due` column on existing concerns is not recalculated

This is **intentional design** — retroactive SLA relaxation could mask genuine failures to respond. Once a breach is recorded, it must be addressed, not quietly forgiven by config change.

**Status**: BY DESIGN — no fix needed. Document for support teams: if a tenant asks why breach alerts persist after relaxing SLA settings, the answer is that existing concerns are unaffected. Only new concerns use the updated SLA threshold.

---

## DZ-26: Critical Escalation Self-Chaining With Re-Enqueue

**Risk**: Originally a single-step problem — escalation fired once and stopped. Now MITIGATED.
**Location**: `apps/worker/src/processors/safeguarding/critical-escalation.processor.ts`

The `CriticalEscalationProcessor` re-enqueues itself with a 30-minute delay after each step (line ~56). The pattern:

1. Job fires for `escalation_step: 0` — notifies DLP (designated liaison person)
2. If concern is still `reported` status, sets `nextEscalationStep = 1` on the inner job object
3. Outer processor reads `nextEscalationStep` AFTER the Prisma transaction commits
4. Enqueues `{ concern_id, escalation_step: 1 }` with `delay: 30 * 60 * 1000`
5. Each step uses `jobId: critical-esc-{concern_id}-step-{nextStep}` for dedup

Termination conditions:

- Concern status is no longer `reported` (acknowledged/resolved) — step 2 in `processJob()` returns early
- Escalation chain exhausted (`escalation_step >= chain.length`) — logs "chain exhausted" and creates a manual-intervention note
- No target user at the current step — returns early

The re-enqueue happens OUTSIDE the Prisma transaction (line ~52 comment), preventing orphaned delayed jobs if the transaction rolls back.

**Status**: MITIGATED. The `jobId` dedup guard prevents duplicate jobs for the same concern + step. The escalation terminates correctly when the concern is acknowledged or the chain is exhausted. Monitor for edge case: if the escalation chain is modified (users removed from DLP config) between steps, a step may target a user that no longer exists in the chain — this is handled by the null check at line ~158.

---

## DZ-27: Anonymous Survey Response Tables (surveyResponse, surveyParticipationToken) — MITIGATED

**Risk**: Cross-tenant response leakage or anonymity breach if queried without survey join
**Location**: `packages/prisma/schema.prisma` — `SurveyResponse` + `SurveyParticipationToken` models, `apps/api/src/modules/staff-wellbeing/`
**Severity**: CRITICAL
**Status**: MITIGATED (2026-04-05)

**Threat:** These tables intentionally have NO `tenant_id` and NO `user_id` to enforce survey anonymity. This means:

1. RLS cannot isolate them — isolation depends on joining through `staff_surveys.tenant_id`
2. Any new access path could break anonymity guarantees
3. Freeform response text may contain PII that respondents included voluntarily

**Also absent from these tables (by design):**

- No `user_id` or `staff_profile_id` — no link to any person
- No `session_id` or `ip_address` — no network traceability
- No `created_at` TIMESTAMPTZ — only `submitted_date DATE` to prevent timing inference
- No foreign key to ANY user-related table

**Current Defenses:**

- No identity columns on the tables (architectural anonymity)
- Date-only timestamps (`@db.Date`) prevent timing-based deanonymization
- One-way HMAC participation tokens (non-reversible)
- Automatic token cleanup 7 days after survey close
- ESLint rule `no-unguarded-survey-access` restricts access to allowlisted files (CI enforcement)
- Static isolation test `survey-responses-isolation.spec.ts` verifies allowlist + query patterns
- API-layer access always goes through `createRlsClient()` joining via `staff_surveys.tenant_id`
- Worker access is constrained to specific findUnique patterns (no broad queries)

**Allowed Access Files:**

- `surveyResponse`: survey.service.ts, survey-results.service.ts, moderation-scan.processor.ts
- `surveyParticipationToken`: survey.service.ts, survey-results.service.ts, cleanup-participation-tokens.processor.ts

**Mitigation for new access sites:**

1. ESLint `no-unguarded-survey-access` will block the build
2. Add the file to the rule's allowlist ONLY after security review confirming:
   - Tenant isolation via staff_surveys join
   - No user-to-response linkage
   - No broad queries (findMany without survey_id scope)
3. Update the isolation spec's allowlist to match

**HMAC reversibility window:**

- During the 7 days between survey close and token deletion, the HMAC is theoretically reversible by someone with the tenant's HMAC secret AND the full staff list
- After token cleanup (7-day cron), participation data is permanently unlinkable
- Per-tenant secrets limit blast radius — compromise of one tenant's secret does not affect others

---

## DZ-28: GDPR Token Mapping Table Must Never Be Exposed

**Risk**: Re-identification of anonymised AI data if token mappings leak
**Location**: `gdpr_anonymisation_tokens` table, `GdprTokenService`
**Severity**: CRITICAL

The `gdpr_anonymisation_tokens` table maps random tokens back to real student/staff identifiers. If this table is ever exposed via an API endpoint, query, or export, the entire tokenisation layer is defeated.

**Rules:**

- No API endpoint may return rows from `gdpr_anonymisation_tokens`
- No DSAR export may include this table's data
- The only way to interact with tokens is through `GdprTokenService.processOutbound` / `processInbound`
- Token deletion (via `deleteTokensForEntity`) is the erasure mechanism for DSAR right-to-erasure
- The `gdpr_export_policies` table is platform-level with no RLS — policies are shared across all tenants. Do not add tenant_id to it.

**What makes this dangerous:**

- A well-meaning developer adding a "view tokens" admin endpoint would create a PII exposure
- Logging the token map (e.g., in audit logs or error traces) would leak the mapping
- The `processInbound` method operates on the token map in-memory only — it must never be persisted alongside AI responses

---

## DZ-29: Consent Withdrawal Must Bypass Cached Or Deferred Paths

**Risk**: Withdrawn consent still affecting live processing after the user has opted out
**Location**: `apps/api/src/modules/gdpr/consent.service.ts`, communications dispatch, gradebook AI services, `gradebook-risk-detection.processor.ts`, `behaviour-analytics.service.ts`

Consent changes are user-facing and must take effect immediately. This means consent-gated features cannot rely only on cron propagation, stale caches, or materialized-view refresh timing. The current contract is:

- notifications read `consent_records` before WhatsApp dispatch
- AI services read `consent_records` before processing
- gradebook risk detection reads `consent_records` inside the worker job
- cross-school benchmarking uses a live consent-aware query, not just the benchmark MV

**Mitigation**: Any optimisation around consent-gated features must preserve a synchronous active-consent check on the request/job path, or do synchronous invalidation before returning success to the user.

---

## DZ-30: Global DPA Guard Allowlist Drift

**Risk**: Schools get hard-locked out of tenant-scoped API access before they can reach the legal remediation path
**Location**: `apps/api/src/modules/gdpr/dpa-accepted.guard.ts`, `apps/web/src/app/[locale]/(school)/layout.tsx`

`DpaAcceptedGuard` is registered as a global `APP_GUARD` and blocks all tenant-scoped API traffic unless the tenant has accepted the current DPA version. This is safe only if three things stay aligned:

1. The guard exempt allowlist still includes `/api/v1/legal` and `/api/v1/public`
2. The frontend global API error handler still redirects `DPA_NOT_ACCEPTED` users to `/settings/legal/dpa`
3. Any new onboarding/legal remediation endpoints that must remain reachable pre-acceptance are explicitly added to the allowlist

There is a second coupling inside the remediation path itself: `DpaService.getCurrentVersion()` calls `PlatformLegalService.ensureSeeded()`, and that seed path also writes sub-processor update notifications. The notification row's `source_entity_id` column is UUID-typed, so those writes must store the register version record UUID, not the human-readable version string. If legal seeding crashes here, `/api/v1/legal/dpa/*` fails and every DPA-gated page stays locked out.

Bootstrap RLS reads for `/auth/*` and `/legal/*` are also brittle if any UUID-backed app settings are left unset. Policies on `tenant_domains`, `tenant_memberships`, `membership_roles`, and `role_permissions` cast `app.current_tenant_id`, `app.current_user_id`, and `app.current_membership_id` to UUID even during fallback reads, so bootstrap transactions must populate valid sentinel UUIDs for missing settings rather than leaving them empty.

There is also a Jest-only bypass (`NODE_ENV === 'test' || JEST_WORKER_ID`) so legacy suites are not globally bricked by the new guard. Tests that need real guard behaviour must explicitly unset those env vars inside the spec.

**Mitigation**: Treat guard allowlist edits as cross-cutting changes. When adding tenant-scoped endpoints used during onboarding or legal recovery, verify they remain reachable before DPA acceptance. Keep legal seed side effects schema-safe, and regression-test the notification write path whenever `PlatformLegalService` changes. When writing guard-specific tests, temporarily disable the test env bypass inside the test process.

---

## DZ-31: Production Deploys Share One Mutable Worktree

**Risk**: Parallel GitHub Actions deploys corrupting live builds on the server
**Location**: `.github/workflows/deploy.yml`, `/opt/edupod/app`

Production deploys build directly inside a single shared checkout on the server. That checkout contains mutable build outputs (`apps/web/.next`, `apps/api/dist`, `apps/worker/dist`). If two deploy jobs touch it at the same time, one job can delete output directories while the other is still building.

The failure mode is non-deterministic and server-only. The same commit may pass CI and still fail deploy with errors such as:

- Next.js missing `pages-manifest.json` during `Collecting page data`
- NestJS `ENOTEMPTY` / `rmdir` failures while clearing `dist`

**Mitigation**:

- `Deploy to Production` must stay serialized via GitHub Actions `concurrency`
- The remote deploy script must take a server-side lock before mutating `/opt/edupod/app`
- Smoke checks must fail the workflow and print PM2 diagnostics if the web or API process is not actually serving
- Any future manual deploy script must respect the same lock or it can reintroduce the race

---

## DZ-32: Early Warning Intraday Triggers From Worker Processors

**Risk**: Silent data desync if early warning queue is down; unbounded fan-out for large behaviour incidents
**Location**: `apps/worker/src/processors/behaviour/evaluate-policy.processor.ts`, `apps/worker/src/processors/pastoral/notify-concern.processor.ts`, `apps/worker/src/processors/attendance-pattern-detection.processor.ts`

Three worker processors (evaluate-policy, notify-concern, attendance-pattern-detection) enqueue `early-warning:compute-student` jobs onto the EARLY_WARNING queue as fire-and-forget side effects. If the EARLY_WARNING queue is down or backlogged, the original processor still completes ��� the student's risk profile just won't be recomputed until the next daily cron run.

The compute-student processor validates `early_warning_configs.is_enabled` and `high_severity_events_json` before processing. If the tenant has early warning disabled, the job is a silent no-op.

**Specific risks**:

- **evaluate-policy** tracks `exclusionAffectedStudentIds` — if a behaviour incident has many student participants receiving exclusion-type actions, each one enqueues a separate compute job. A mass incident could generate dozens of recompute jobs simultaneously.
- **notify-concern** only triggers for `severity === 'critical'`, limiting fan-out.
- **attendance-pattern-detection** only triggers for excessive absence alerts, limiting fan-out.

**Mitigation**:

- The daily cron at 01:00 UTC provides a backstop — even if intraday triggers fail, profiles are refreshed nightly
- BullMQ deduplication via `jobId` is NOT used for compute-student (each trigger is independently valuable), so the same student may be recomputed multiple times in a day — this is safe but wasteful
- If queue backlog becomes an issue, consider adding a dedup window (e.g., skip if student was recomputed within the last 5 minutes)

---

## DZ-33: Homework — Dual Dispatch Paths With Payload Contract Drift

**Risk**: noisy failing cron jobs, duplicate scheduling paths, and false assumptions about which automation path is actually live
**Location**: `apps/worker/src/cron/cron-scheduler.service.ts`, `apps/worker/src/processors/behaviour/cron-dispatch.processor.ts`, `apps/worker/src/processors/homework/digest-homework.processor.ts`, `apps/worker/src/processors/homework/completion-reminder.processor.ts`

The homework reminder/digest automation now has two different dispatch paths:

1. `CronSchedulerService.registerHomeworkCronJobs()` registers repeatable jobs for:
   - `homework:generate-recurring`
   - `homework:overdue-detection`
   - `homework:digest-homework`
   - `homework:completion-reminder`
2. `BehaviourCronDispatchProcessor.dispatchDaily()` also enqueues:
   - `homework:digest-homework`
   - `homework:completion-reminder`
     per tenant with valid `tenant_id` payloads

The problem is that the `HomeworkDigestProcessor` and `HomeworkCompletionReminderProcessor` both reject missing `tenant_id`, but the direct cron registrations in `CronSchedulerService` enqueue those jobs with `{}`.

That means the current codebase contains:

- one valid per-tenant dispatch path for digest/reminder jobs
- one invalid repeatable dispatch path for the same jobs
- two different architectural “sources of truth” for the same automation

**Mitigation**: Treat the per-tenant behaviour-dispatch path as the only payload-compatible path for `homework:digest-homework` and `homework:completion-reminder` unless the direct cron registrations are fixed to iterate tenants explicitly. Do not document `registerHomeworkCronJobs()` as the sole source of truth for homework automation in its current form.

---

## DZ-34: Homework — Performance Test Method Drift

**Risk**: Test silently breaks if analytics service method names change
**Location**: `apps/api/src/modules/homework/homework.performance.spec.ts`

`homework.performance.spec.ts` calls analytics service methods by name. If method names change, the test silently breaks (it won't compile). This test requires a real database and is not part of the CI unit test suite.

**Mitigation**: Run `tsc --noEmit` on test files as part of CI to catch method name drift.

---

## DZ-35: PastoralModule ↔ ChildProtectionModule Circular Dependency

**Risk**: Naive refactoring breaks NestJS startup if `forwardRef()` is removed
**Location**: `apps/api/src/modules/pastoral/pastoral.module.ts`, `apps/api/src/modules/child-protection/child-protection.module.ts`

`PastoralModule` and `ChildProtectionModule` have a deliberate circular dependency broken by `forwardRef()` in both modules. If a developer:

- Removes `forwardRef()` and uses a direct import in either module
- Adds a constructor-injected service from the other module without `forwardRef()`
- Moves shared services between the two modules without updating `forwardRef()` wrappers

NestJS will throw a circular dependency error at startup.

**The cycle exists because**:

- CP records reference pastoral concerns (CP module needs Pastoral module)
- Pastoral concerns can escalate to CP records (Pastoral module needs CP module)
- Both access the other module's services during escalation/linking flows

**Mitigation**: Do NOT break this cycle by extracting shared concerns into a third module without careful analysis. The `forwardRef()` approach is intentional. When adding new cross-module calls between these two modules, always use constructor injection with `@Optional() @Inject(forwardRef(() => XModule)) private readonly xService: XService`.

---

## DZ-36: Pastoral Concern Escalation Self-Chain (notify-concern → escalation-timeout)

**Risk**: If escalation timeout processor crashes between commit and re-enqueue, the escalation chain silently terminates
**Location**: `apps/worker/src/processors/pastoral/notify-concern.processor.ts`, `apps/worker/src/processors/pastoral/escalation-timeout.processor.ts`

The `pastoral:notify-concern` job enqueues `pastoral:escalation-timeout` for critical concerns. The escalation-timeout processor re-enqueues itself with a delay for subsequent escalation steps — same pattern as `safeguarding:critical-escalation` (see DZ-26). Re-enqueue happens OUTSIDE the Prisma transaction.

**Failure scenario**: Worker crashes between transaction commit (escalation step recorded) and BullMQ enqueue (next step scheduled). The concern stays in an escalated state but no one is notified at the next step.

**Mitigation**: The daily `pastoral:overdue-actions` cron provides a backstop — it detects unacknowledged high-severity concerns and re-escalates if needed. However, this backstop only runs once per day, meaning up to 24 hours of missed escalation in the crash scenario.

---

## DZ-37: Document `generating` Status — Callers Must Not Assume PDF Exists

**Risk**: Code that calls `autoGenerateDocument()` or `generateDocument()` and immediately accesses the returned document's PDF file will fail — the document is returned with `status: 'generating'` and no `file_key`.
**Location**: `apps/api/src/modules/behaviour/behaviour-document.service.ts`

Since reliability hardening (R-14), document generation is asynchronous. The API creates a document record with `status: 'generating'` and enqueues a BullMQ job for PDF rendering. The document transitions to `draft_doc` only after `PdfRenderProcessor` completes and the `behaviour:document-ready` callback fires.

**What this means for callers**:

- Any code that calls `autoGenerateDocument()` (sanctions, exclusions, appeals auto-generation triggers) receives a document with `status: 'generating'` and `file_key: null`
- Any code that calls `generateDocument()` (manual generation) receives the same
- UI components rendering document lists must handle the `generating` status (show a spinner/pending indicator, not a download link)
- The `behaviour:document-ready` callback creates an in-app notification when the PDF is ready

**Mitigation**: Do not add code that reads `file_key` from the return value of `autoGenerateDocument()` or `generateDocument()` without checking `status !== 'generating'` first. The PDF is only available after the callback transitions the document to `draft_doc`.

---

## DZ-38: Auth And Tenant Resolution Bootstrap Depend On Special RLS Policies

**Risk**: Login, `/auth/me`, permission caching, or hostname-based tenant resolution can fail in production even when tenant data exists, because these flows execute before a full tenant-scoped RLS context is available.
**Location**: `apps/api/src/common/middleware/rls.middleware.ts`, `apps/api/src/common/middleware/tenant-resolution.middleware.ts`, `apps/api/src/modules/auth/auth.service.ts`, `apps/api/src/common/services/permission-cache.service.ts`, `packages/prisma/rls/policies.sql`

The normal RLS model assumes `app.current_tenant_id` is already set. Auth bootstrap is the exception. Before that tenant-scoped context exists, the platform still needs to:

- resolve a tenant from `tenant_domains` using the request hostname
- find a user's memberships during login or `/auth/me`
- resolve role links and effective permissions for the active membership

Those reads now rely on bootstrap RLS context keys instead of raw bypass queries:

- `app.current_tenant_domain` for `tenant_domains`
- `app.current_user_id` for self-membership reads
- `app.current_membership_id` for membership-linked `membership_roles`, `roles`, and `role_permissions`

If a migration removes or narrows these bootstrap policies, or if middleware/service code stops setting the matching context keys, production symptoms are subtle but severe:

- valid hostnames return tenant-resolution failures or 404s
- valid users get `INVALID_CREDENTIALS` or empty membership lists
- authenticated users lose permissions because the cache refresh path cannot read role grants
- proxied `/api/*` requests from the Next.js web server can blank whole school pages if middleware tries `tenant_domains` lookup on `localhost` or the platform domain before falling back to JWT tenant resolution
- refresh/login on tenant subdomains can silently create tenant-less browser sessions if proxy-aware hostname recovery is lost, causing school pages to render empty after reload while dashboard cards still show fallback placeholders

**Mitigation**: Treat bootstrap-readable RLS policies as an auth contract, not just schema boilerplate. Any change to `tenant_domains`, `tenant_memberships`, `membership_roles`, `roles`, or `role_permissions` policies must be regression-tested with real login, `/auth/me`, permission-cache refresh, hostname-based tenant resolution, and the proxied `localhost`/platform-domain API path used by Next.js rewrites.

## DZ-39: Cross-Tenant Cron Jobs Must Not Use Prisma Relation Filters on RLS Tables

**Risk**: Cross-tenant cron dispatchers (no tenant context) that use Prisma relation filters like `modules: { some: { module_key: 'x' } }` generate subqueries against `tenant_modules`, which has RLS. Without `app.current_tenant_id` set, `current_setting()` throws `unrecognized configuration parameter`, crashing the job.

**Location**: Any processor doing `prisma.tenant.findMany({ where: { modules: { some: ... } } })` without prior `SET LOCAL app.current_tenant_id`.

**Rule**: Cross-tenant dispatchers must query only the `tenants` table (no RLS). Module enablement checks belong in the per-tenant jobs that run with RLS context via `TenantAwareJob`. If no data exists for a tenant without the module, the per-tenant job returns zero rows safely.

**Mitigation**: Fixed in pastoral-cron-dispatch, homework-overdue-detection, homework-generate-recurring, and behaviour-notification-reconciliation. Search for `modules: { some:` in `apps/worker/` if adding new cross-tenant dispatchers.

---

## DZ-40: Plain Prisma Reads Need Request-Scoped RLS Context

**Risk**: Any authenticated school request that hits plain `this.prisma.*` reads can fail with `22P02 invalid input syntax for type uuid: ""` or silently return empty datasets if the database session does not already have the active tenant/user context. In production this can blank whole sections like People, Dashboard, Finance, and Reports even when login succeeds and DPA gates are cleared.

**Location**: `apps/api/src/modules/prisma/prisma.service.ts`, `apps/api/src/common/services/request-context.service.ts`, `apps/api/src/common/middleware/request-context.middleware.ts`, `apps/api/src/common/guards/auth.guard.ts`

This repo has many tenant-scoped read paths that intentionally use plain Prisma delegates with `where: { tenant_id }` filters instead of manually wrapping every read in `createRlsClient(...).$transaction(...)`. That only remains safe if the Prisma layer itself injects the request's RLS context before the query executes.

The production failure mode is nasty because PgBouncer can hand the app pooled sessions where `app.current_tenant_id`, `app.current_user_id`, and `app.current_membership_id` exist but are empty strings. Once a policy casts those values to UUID, even a simple `findMany()` or `count()` explodes before the explicit `tenant_id` filter can help.

**Mitigation**:

- Keep request-scoped tenant/user/membership context in AsyncLocalStorage for the lifetime of each HTTP request.
- Update that context again in `AuthGuard` after decoding the JWT so authenticated reads carry `tenant_id`, `user_id`, and `membership_id`.
- Route plain Prisma model operations through `runWithRlsContext(...)` inside `PrismaService` whenever request context contains a tenant.
- Regression-test login, `/auth/me`, DPA acceptance, and at least one plain Prisma read endpoint (for example `/students` or `/year-groups`) whenever Prisma session handling or middleware order changes.

---

## DZ-41: Import Processor S3 I/O Was Inside Transaction — RESOLVED

**Risk**: `ImportProcessingProcessor` and `ImportValidationProcessor` performed S3 downloads and deletes inside the `TenantAwareJob` Prisma transaction. S3 network failures could deadlock the transaction, and inconsistent rollback could leave orphan S3 files or missing data.

**Resolution**: S3 download now runs before the transaction; S3 delete runs after the transaction commits. `processJob()` receives a pre-fetched buffer. If S3 download fails, no transaction is opened. If S3 delete fails after commit, the import data is safely persisted and the file can be cleaned up later by the file cleanup cron.

---

## DZ-42: Report Card Regeneration Deletes Previous PDFs

**Risk**: `ReportCardGenerationProcessor` (impl 04) implements "run overwrite" semantics: every regeneration run upserts the `ReportCard` row keyed by `(tenant_id, student_id, academic_period_id, template_id, template_locale)` and deletes the previous `pdf_storage_key` in the same transaction. There is no document-level version history — the previously-generated PDF is permanently destroyed the moment a new run completes.

This is a deliberate product choice (see `design-spec.md` §7.3), but it creates two risks:

1. **Audit trail loss** — if a tenant disputes the content of an earlier report card (e.g., before a grade correction), the old PDF cannot be recovered. The `ReportCardBatchJob` log preserves run metadata, but not the rendered output.
2. **Partial-run PDF delete on reruns** — a rerun that replaces student A's PDF successfully but fails on student B leaves A with the new bytes and B still pointing at the previous `pdf_storage_key`. Because the upsert + delete run inside the same per-student interactive transaction, this is the correct "atomic per student" behaviour, but it means batch-level rollback is NOT available.

**Mitigation**:

- The wizard's comment-gate dry-run + admin confirmation flow makes unintended regenerations hard to trigger.
- Regeneration is gated on `report_cards.manage` (admin-only).
- `ReportCardBatchJob` preserves `requested_by_user_id`, `created_at`, scope, and counters — enough to reconstruct WHO ran WHAT and WHEN even if the PDF is gone.
- If the product later requires immutable document history, revisit by adding an `archived_pdf_storage_key` column + an append-only `ReportCardVersion` table. Do NOT change the overwrite behaviour without updating `design-spec.md` first.

**Code pointers**:

- `apps/worker/src/processors/gradebook/report-card-generation.processor.ts` — `renderAndUpsert` is the single place that deletes the previous PDF.
- `apps/api/src/modules/gradebook/report-cards/report-card-generation.service.ts` — `generateRun` is the entrypoint that enqueues the job.

## DZ-43: Teacher Request Auto-Execute Bypasses The Wizard Review Step

**Risk**: When an admin approves a `regenerate_reports` teacher request with `auto_execute = true`, `ReportCardTeacherRequestsService.approve` calls `ReportCardGenerationService.generateRun` directly, skipping the wizard's 6-step review UX (scope confirmation, comment-gate dry-run, personal-info field override, explicit force-generate toggle). The approver is committing to a real generation run at the moment of approval — there is no "preview what will happen" step on the auto-execute path.

This matters because:

1. **Comment gate is still enforced** but with `override_comment_gate = false` — if any required comment is missing/unfinalised the run fails fast with `COMMENT_GATE_BLOCKING`, which is recoverable but surprising if the approver expected an immediate run.
2. **PDFs get deleted** on auto-execute of a regenerate request — every caveat on DZ-42 still applies. The approver does not see a "this will delete N existing PDFs" warning.
3. **Scope mismatch is possible** — the teacher submits a `target_scope_json` shape; the service translates it into the generation scope discriminated union. Any silent scope drift between the two shapes would fan out without human review.

**Mitigation**:

- The default for `auto_execute` is `false` (explicit opt-in required from the admin). The design spec §10.3 prefers the human-in-the-loop path where approval just pre-fills the wizard.
- `auto_execute = true` still runs inside the same permission check — only users with `report_cards.manage` can hit this path.
- The side-effect call runs BEFORE the state transition, so any downstream failure leaves the request in `pending` for a clean retry.
- The frontend (impl 10) is expected to show a double-confirm modal when the admin selects `auto_execute = true`.

**Code pointers**:

- `apps/api/src/modules/gradebook/report-cards/report-card-teacher-requests.service.ts` — `approve` is the single entrypoint; the auto-execute path is in `autoExecuteOpenWindow` and `autoExecuteRegenerate`.
- `packages/shared/src/report-cards/teacher-request.schema.ts` — `approveTeacherRequestSchema` exposes the `auto_execute` flag.

## DZ-44: Report Card Matrix Reuses Gradebook Aggregation — Silent Drift Risk

**Risk**: `ReportCardsQueriesService.getClassMatrix` (impl 06) powers the new class-first report cards matrix view. It reuses the **same** data source (`PeriodGradeSnapshot`) and the **same** weighting tables (`SubjectPeriodWeight`, `PeriodYearWeight`) as the gradebook's own matrix aggregation inside `PeriodGradeComputationService.computeCrossSubject` / `computeYearOverview`. This is intentional — the design spec requires that the report card matrix and the gradebook matrix show IDENTICAL numbers — but it creates a silent coupling: any future change to gradebook aggregation semantics (e.g., a tweak to how equal-weight fallback works, or a change to how period weights combine) will silently shift report card numbers too, with no build failure, no test failure, and no obvious breadcrumb.

**Mitigation**:

- The two implementations share their data source but do NOT share code (the report cards service intentionally inlines the weighted-average math rather than pulling in `PeriodGradeComputationService` via a circular module dep). Treat both sites as "tied by contract": a change to either MUST be mirrored in the other.
- The e2e coverage in `apps/api/test/report-cards/matrix.e2e-spec.ts` exercises the full snapshot → weighted average → rank pipeline with real seed data. Any semantic drift in gradebook aggregation will surface there if the test fixtures are kept in sync.
- If the product later wants to diverge — e.g., report cards should use a different rounding rule than the gradebook — deliberately fork the code and document the divergence here. Do NOT quietly edit only one side.

**Code pointers**:

- `apps/api/src/modules/gradebook/report-cards/report-cards-queries.service.ts` — `getClassMatrix`, `computePeriodOverall`, `combinePeriodsWithWeights`, `resolveSubjectWeightsForClass`, `resolvePeriodWeightsForClass`, `applyGradingScale`.
- `apps/api/src/modules/gradebook/grading/period-grade-computation.service.ts` — `computeCrossSubject`, `computeYearOverview`, `weightedAverage`, `applyGradingScale` (the original implementations).
- `apps/api/src/modules/gradebook/weight-config.service.ts` — `resolveSubjectWeightsForClass`, `resolvePeriodWeightsForClass` (the canonical helpers that both sites ultimately mirror).

## DZ-45: Report Card Template Assets Are Not TypeScript — Silent Deploy Drift If Build Config Breaks

**Risk**: `ProductionReportCardRenderer` (impl 11) renders the Handlebars template source files located at `apps/worker/src/report-card-templates/{editorial-academic,modern-editorial}/index.hbs`. These `.hbs` files are NOT TypeScript and are NOT picked up by `nest build` / `tsc` on their own — they're copied to `dist/` only because `nest-cli.json` now has an explicit `assets` entry for `report-card-templates/**/*.hbs`. If anyone edits `nest-cli.json` and drops the assets rule, the build will still succeed, `turbo test` will still pass (Jest runs against `src/`, not `dist/`), and `turbo type-check` will still be green — but the deployed worker will hit a `ENOENT` when it tries to `fs.readFile` the template at runtime, and every report card generation job will fail with the same error.

Google Fonts are loaded via CDN `<link>` tags inside each template's `<head>`. Puppeteer fetches them when rendering. Two failure modes follow:

1. **Font CDN blocked**: in airgapped or firewalled deployments Puppeteer will silently fall back to system fonts and the output will look nothing like the reference designs. There is no warning — only visual drift on the delivered PDF.
2. **Font file replaced upstream**: if Google Fonts ever redefines the metrics for Fraunces / Bricolage Grotesque / Noto Naskh Arabic, previously-rendered PDFs and newly-rendered PDFs will differ subtly. This is a low-probability risk but a real one for long-archive correctness.

**Mitigation**:

- Never remove the `assets` entries from `apps/worker/nest-cli.json` without a matching code change (e.g., bundling templates into a `.ts` module as exported string literals).
- The template path resolution in `ProductionReportCardRenderer` uses `path.resolve(__dirname, '..', '..', 'report-card-templates')` which correctly resolves in both dev (`src/`) and prod (`dist/apps/worker/src/`) layouts because the relative path is identical — keep this invariant when moving files.
- Unit tests for the renderer (`report-card-production.renderer.spec.ts`) exercise the real template-loading path via the source directory, so any missing or renamed template file fails tests loudly.
- If the product moves to airgapped deployment, the font loading strategy must switch to self-hosted `@font-face` with the font files bundled under `_shared/fonts/`. That's a deliberate deploy-time change, not something to paper over with a runtime fallback.

**Code pointers**:

- `apps/worker/src/processors/gradebook/report-card-production.renderer.ts` — `loadTemplateSource`, `TEMPLATE_ROOT`, `getCompiledTemplate`.
- `apps/worker/src/report-card-templates/{editorial-academic,modern-editorial}/index.hbs` — the templates themselves.
- `apps/worker/nest-cli.json` — `compilerOptions.assets` — the config that copies `.hbs` files into `dist/`.
- `apps/worker/src/report-card-templates/_shared/template-helpers.ts` — the view-model adapter that funnels `ReportCardRenderPayload` into the template.
