# Danger Zones

> **Purpose**: Non-obvious coupling and risks. Before modifying anything listed here, read the full entry.
> **Maintenance**: Add entries when you discover a non-obvious consequence. Remove when the risk is mitigated.
> **Last verified**: 2026-04-27 (Communications Overhaul rebuild — Impl 14 sign-off; six new DZ-Comms entries added covering tenant credential cache coherence, mid-flight `is_enabled` flips, webhook signature trust, suppression-list growth, WhatsApp service window staleness, and the one-way `.env` removal)

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

## DZ-35: Student → User linkage via name matching — ✅ CLOSED 2026-04-19 (Wave 3)

**Risk (historical)**: `StudentReadFacade.findByUserName(tenant, firstName, lastName)` used `prisma.student.findFirst({ where: { first_name, last_name } })` — a silent first-match-wins query. When two students in a tenant share a name (e.g., two "Jane Smith"s — guaranteed to happen in any school with more than a few hundred students), an arbitrary row was returned. Under RLS this meant student A could log in and see student B's grades, timetable, report cards, and (once Wave 3 shipped) homework submissions. Cross-student data leakage inside a tenant — the exact failure mode RLS exists to prevent.

**Status**: Resolved in the Wave 3 migration `20260418220000_add_student_user_id_and_homework_submissions`:

- Added nullable `students.user_id UUID` column with FK to `users(id) ON DELETE SET NULL`.
- Partial unique index `(tenant_id, user_id) WHERE user_id IS NOT NULL` guarantees one student per user per tenant at the database layer.
- Replaced `findByUserName` → `findByUserId` (single method). The three callers — `DashboardService.student`, `ParentTimetableService.getSelfTimetable`, and the new `HomeworkStudentService` — all resolve the student record via the FK; name matching has been removed from the codebase.
- Adam Moore (the only seeded student user to date) is backfilled in `post_migrate.sql` via an email-local-part match (idempotent, safe to re-run).
- Side effect: `ClassStudentsAudienceProvider` can now resolve student user_ids too — the inbox team's pending "Wave 4 student audience" work is partially unblocked.

## DZ-33: Homework — Dual Dispatch Paths With Payload Contract Drift — ✅ CLOSED 2026-04-18 (Wave 2)

**Status**: Resolved in the homework Wave 2 fix. `HomeworkDigestProcessor` and `HomeworkCompletionReminderProcessor` now branch on `job.data.tenant_id`: when present, they process that single tenant (behaviour-dispatch path); when absent, they iterate `tenant.findMany({ where: { status: 'active' } })` and run per tenant (direct cron path). Both dispatch paths are now valid; the repeatable cron registrations in `CronSchedulerService.registerHomeworkCronJobs()` no longer silently fail. See `apps/worker/src/processors/homework/digest-homework.processor.spec.ts` and `completion-reminder.processor.spec.ts` for regression coverage (cross-tenant fan-out + legacy direct-enqueue suites).

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

## DZ-46: Comment Window Enforcement Is The Sole AI Cost Control For Report Cards

**Risk**: `ReportCardAiDraftService` (impl 02) is gated by a single server-side check: the per-tenant comment window must be in the `open` state for the targeted academic period. Every AI draft call — single-student subject comment generation used by the Report Comments editor — passes through that check. If the check is ever bypassed, regressed, or silently weakened, an attacker (or a well-meaning frontend bug) can cause unbounded AI spend against the tenant's account. The rest of the stack (permission check, rate limits, audit logging) is secondary — the window is THE gate. The frontend also disables AI buttons when the window is closed, but the frontend gate is advisory only; the server-side enforcement is the real control.

**Why this is load-bearing**:

1. **No per-request throttle**: there is no token bucket, no daily cap, no tenant-level spend ceiling on the AI provider. A single open window with a few hundred students × 10 subjects × multiple "regenerate draft" clicks can run into the thousands of provider calls in minutes.
2. **No dry-run**: every AI call is real. There is no preview mode, no cached-response short-circuit.
3. **Window state is tenant-global**: at most one window open per tenant at a time (enforced by the partial unique index `report_comment_windows_one_open_per_tenant`). Opening a window is the explicit admin action that says "spend is authorised right now for this period."
4. **Closing a window is idempotent but not revertible mid-flight**: closing a window does not cancel in-flight AI calls that were accepted during the open state. If a window is closed mid-stream, already-enqueued calls will still complete.

**Mitigation**:

- The window check MUST live inside `ReportCardAiDraftService.generate*` methods, directly before the provider call. Do NOT move it to a guard, interceptor, or middleware — every future refactor will break guards before it breaks the service. Keep the call site local to the cost-incurring line.
- The service throws `COMMENT_WINDOW_CLOSED` with a structured error code. Frontend surfaces it as "Comments are closed" and the AI button is disabled; backend rejects anyway.
- Every AI call is audit-logged with tenant, user, student, period, and a cost estimate. If a bug ever bypasses the gate, the audit log is the detection mechanism. If an AI cost spike happens, start by querying the audit log for calls outside any known window.
- Before introducing a new AI entry point (bulk regeneration, auto-draft-on-open, etc.), re-read this entry. Any new pathway must either (a) route through the same window check, or (b) introduce a new equivalent gate and document it here.

**Code pointers**:

- `apps/api/src/modules/gradebook/report-cards/report-card-ai-draft.service.ts` — the single-student AI draft path; look for the call to `ReportCommentWindowsService.requireOpenForPeriod` (or equivalent gating helper) before the provider call.
- `apps/api/src/modules/gradebook/report-cards/report-comment-windows.service.ts` — the window open/close state machine (see `state-machines.md#CommentWindowStatus`).
- `packages/prisma/migrations/*_add_report_comment_windows_*` — the partial unique index that enforces "at most one open window per tenant".

## DZ-47: Report Card PDF Font Replacement Requires Re-Deploy, Not A Hot-Swap

**Risk**: The `ProductionReportCardRenderer` (impl 11) ships with a fixed set of font families embedded in the Handlebars templates: Fraunces + Archivo + JetBrains Mono for the editorial-academic design; Bricolage Grotesque + Source Serif 4 + JetBrains Mono for modern-editorial; Noto Naskh Arabic for the Arabic variants of both. These fonts are loaded via Google Fonts CDN `<link>` tags at render time. There is no runtime font configuration, no tenant-level font override, no per-template font swap. If a tenant or product decision later requires a different font — for branding, compliance, or accessibility — the change requires:

1. Editing the `<link>` URL in the affected `.hbs` template.
2. Verifying visual fidelity against every content scope the template supports (different subject counts, different comment lengths, Arabic vs English).
3. Re-deploying the worker.
4. Re-rendering every outstanding report card for any tenants who care about long-archive consistency (old PDFs still use the previous font).

**Mitigation**:

- Do NOT attempt to hot-swap the font by editing settings or tenant config — the system has no such pathway and adding one is a significant change. Instead, treat font selection as a build-time decision.
- Before changing a font, check whether previously-rendered PDFs need to be regenerated for consistency. If yes, schedule a regeneration run through the wizard after deploy.
- Self-hosting fonts: if the deployment environment blocks the Google Fonts CDN (airgapped, strict firewall, compliance requirement), the mitigation is to download the font files, bundle them under `apps/worker/src/report-card-templates/_shared/fonts/`, and switch the templates to `@font-face` declarations. This is a deliberate deploy-time change — do not paper over CDN failures with a runtime fallback, because the fallback will silently produce wrong-looking PDFs.
- When adding a new template design, register its fonts in both the `.hbs` file AND the test fixtures so visual regression catches font drift early.

**Code pointers**:

- `apps/worker/src/report-card-templates/editorial-academic/index.hbs` — Fraunces + Archivo + JetBrains Mono `<link>` tags.
- `apps/worker/src/report-card-templates/modern-editorial/index.hbs` — Bricolage Grotesque + Source Serif 4 + JetBrains Mono + Noto Naskh Arabic `<link>` tags.
- `apps/worker/src/processors/gradebook/report-card-production.renderer.ts` — the Puppeteer renderer that fetches the fonts via the launched Chromium instance.

## DZ-Inbox-1: Inbox Must Remain The Default Channel In Every Dispatch Path

**Risk**: The inbox rebuild (2026-04-11) makes the in-app inbox the always-on default channel in every outbound dispatch flow — announcements, notifications, direct messages, broadcasts, parent-inquiry replies. SMS / Email / WhatsApp are additive escalations, never replacements. The dispatcher bridge in `CommunicationsModule` fans every outbound message into `ConversationsService.createConversation` or `ConversationsService.sendMessage` unconditionally. Any code path that sends a message without touching the conversations service bypasses inbox delivery entirely — recipients see the SMS/email but have no inbox record, no read-receipt, no search index hit, no safeguarding scan, no audit trail for oversight.

**Mitigation**:

- Never add a dispatch path that writes to `notifications` directly without first going through `ConversationsService`. The single entry point is `ConversationsService.createConversation` / `sendMessage` for user-authored messages, and the inbox channel provider in the dispatcher for system-originated announcements.
- When adding a new channel or a new sender type, audit the fan-out: if the flow creates a `Notification` row without a corresponding `messages` row, the inbox has been bypassed. This is a bug, not an optimisation.
- The `tenant_settings_inbox.messaging_enabled` kill switch disables the entire inbox at a tenant level — when off, NO messages are sent at all (not "fall back to SMS"). This is the intended safety behaviour. Do not add a code path that routes around the kill switch.
- Safeguarding scanning (`safeguarding:scan-message`) and full-text search (`messages.body_search`) both depend on the inbox write — bypassing the inbox also bypasses safeguarding, which is a compliance violation.

**Code pointers**:

- `apps/api/src/modules/inbox/conversations/conversations.service.ts` — the single entry point
- `apps/api/src/modules/communications/dispatchers/inbox-channel.provider.ts` — the bridge from the existing announcement dispatcher into the inbox
- `CLAUDE.md` rule: "Inbox is always-on as a channel."

## DZ-Inbox-2: Tenant Messaging Policy Matrix Is Cached For 5 Minutes

**Risk**: `TenantMessagingPolicyRepository` caches each tenant's 9×9 messaging-policy matrix (81 role-pair cells) in-process for 5 minutes to avoid hitting the DB on every `canStartConversation` / `canReplyToConversation` call. When an admin updates the matrix via `PUT /v1/inbox/settings/policy`, `invalidate(tenantId)` is called — but only on the API process that handled the request. Other API processes (in a multi-replica deployment), and worker processes that also instantiate the policy service, retain their stale cache until the 5-minute TTL expires.

**Effect**: After a matrix change, for up to 5 minutes, users may see either "you cannot send this message" when they SHOULD be able to (the admin just enabled the cell) or the reverse (the admin just disabled the cell but staff can still send for a few minutes).

**Mitigation**:

- Treat the 5-minute window as a soft convergence bound. It is acceptable for non-safety-critical policy changes (edit window, retention period, cell toggles).
- For safety-critical changes — emergency kill switches, disabling parent/student initiation after an incident — the 5-minute TTL is too slow. The workaround is to flip `tenant_settings_inbox.messaging_enabled = false` (the kill switch), wait 5 minutes for the tenant-level cache to drain, then flip it back with the new matrix state. This is NOT a great UX and should be documented for admins before launch.
- Do not add a cross-process cache bust via Redis pub/sub without also adding the invariant that every process subscribes — a partial rollout would leave some processes stale indefinitely.
- Worker processes: the fallback scanner reads the matrix; if a matrix change invalidates an in-flight fallback, the scanner will use the stale view for up to 5 minutes. This is acceptable because fallback is inherently a delayed action.

**Code pointers**:

- `apps/api/src/modules/inbox/policy/tenant-messaging-policy.repository.ts` — the cache
- `apps/api/src/modules/inbox/settings/inbox-settings.service.ts` — the invalidator (called after `updatePolicyMatrix`)

## DZ-Inbox-3: Broadcast Replies Spawn New Direct Conversations, Not Replies On The Broadcast

**Risk**: When a broadcast sender ticks `allow_replies: true`, recipients who reply do NOT reply on the broadcast conversation. Instead, `ConversationsService.handleBroadcastReply` spawns a brand-new `direct` conversation between the replying recipient and the original broadcast sender. The original broadcast conversation stays one-way; every reply is a separate direct thread in both users' inboxes.

**Why this is the right design**:

- A broadcast to 2000 parents with replies enabled would otherwise create a conversation with 2001 participants, all of whom see every reply. That is a massive privacy leak and a performance disaster.
- The 1↔1 spawn-direct model gives the sender one-to-one conversations with each responder, which matches the mental model of "parent replied to my announcement" rather than "every parent saw every other parent's reply."

**The surprise**:

- Permission checks on "can this recipient reply" use `MessagingPolicyService.canReplyToConversation(broadcast_id)`, which returns `true` when `allow_replies = true`. The policy chokepoint is then re-run against the SPAWNED direct conversation's recipient role (the sender). For most senders this is fine — an admin broadcasting to parents gets direct replies from parents, and the admin→parent cell is typically true. But if the admin→parent cell is `false` in the matrix (unusual but possible), the reply is blocked and the parent sees an error even though the admin ticked `allow_replies`.
- Read receipts on the broadcast are tracked on the original broadcast conversation via `message_reads`. Read receipts on the reply thread are tracked on the NEW direct conversation. A sender who checks "who read my broadcast" sees the broadcast's read state, which is independent of which parents replied.

**Mitigation**:

- Document this behaviour in the tenant-facing inbox feature doc under "Broadcast replies".
- Never add a code path that replies in-place on a broadcast conversation — it would create the 2001-participant mega-thread described above.
- When updating the policy chokepoint, remember that broadcast replies are checked twice: once against the broadcast's `allow_replies` flag, once against the matrix cell for the spawned direct conversation.
- When adding a feature that references "reply to a broadcast", make sure you know whether you mean the literal broadcast or the spawned direct — they are different conversation rows with different IDs.

**Code pointers**:

- `apps/api/src/modules/inbox/conversations/conversations.service.ts` — `handleBroadcastReply`
- `apps/api/src/modules/inbox/policy/messaging-policy.service.ts` — the double-check

## DZ-Scheduling-1: TenantAwareJob Outer Transaction Leaks For Long-Running Processors

**Risk**: A processor that extends `TenantAwareJob` and does its DB writes via `this.prisma.$transaction(...)` internally (ignoring the passed `_tx`) silently holds an **idle outer Prisma transaction** for the full `processJob` duration. When that duration exceeds the base class's default `transactionTimeoutMs` (5 min), Prisma errors on commit with `Transaction already closed: A commit cannot be executed on an expired transaction`, and the job looks like it "failed" even though the actual work succeeded. The failure path can overwrite successful inner writes with a misleading error message.

**Location**:

- Base class: `apps/worker/src/base/tenant-aware-job.ts` — wraps `processJob` in `prisma.$transaction(...)` with default `timeout: 5 * 60_000` ms.
- Known-affected processor: `apps/worker/src/processors/scheduling/solver-v2.processor.ts` — solver runs up to 3600 s; mitigated by overriding `transactionTimeoutMs` to 3780 s.

**Status**: MITIGATED for the scheduler (Stage 9.5.1 post-close amendment, commit `fd4b1351`). Pattern is still a trap for any future long-running processor.

**How the trap works**:

1. `TenantAwareJob.execute` opens a `prisma.$transaction(async tx => processJob(data, tx), {timeout: ...})`.
2. Inside `processJob`, the subclass decides to use `this.prisma.$transaction(...)` (a separate pool connection) instead of the passed `tx` — sometimes intentionally, to release row locks between steps, sometimes by accident.
3. The outer `tx` now holds a pool connection idle for the full `processJob` duration — waiting for the final implicit commit at the end of the callback.
4. If `processJob` runs longer than `transactionTimeoutMs`, Prisma cancels the outer transaction. When the callback finally returns, `prisma.$transaction`'s implicit commit fails: `"Transaction already closed: A commit cannot be executed on an expired transaction. The timeout for this transaction was 300000 ms, however <N> ms passed since the start of the transaction."`
5. The processor's own catch block (if any) then "handles" the error — typically by writing `status: 'failed', failure_reason: <the Prisma error>` — **overwriting whatever result its own inner short txns already wrote**.

**Why it's non-obvious**:

- The inner short-txn pattern _looks_ like it correctly sidesteps long transactions (which is why it's used — to avoid row-locks during CPU-bound work). It does, but only for the inner writes; the outer wrapper transaction is still open doing nothing.
- The bug is invisible until `processJob` crosses the outer timeout. The scheduler's case was masked pre-Stage-9.5.1 because every NHQS attempt at 600 s budget failed at transport / sidecar level before reaching the worker's commit step. Once those were fixed, the latent outer-txn timeout surfaced immediately.

**Mitigation pattern**:

For any processor whose max `processJob` duration can exceed 5 min, override `transactionTimeoutMs` in the subclass:

```typescript
class MyLongRunningJob extends TenantAwareJob<MyPayload> {
  // Override if processJob can exceed the 5-min default. Calibrate to
  // (max_work_duration + network/write buffer).
  protected override readonly transactionTimeoutMs: number = 3780 * 1000;
  // ...
}
```

**Better long-term fix (filed as Stage 9.5.1 amendment follow-up #7)**:

Refactor `SchedulingSolverV2Job` to **not extend `TenantAwareJob`** at all. Every DB write already uses its own short transaction; the outer wrapper is functionally load-bearing only for tenant-id / user-id validation, which can be inlined in the processor. That eliminates the idle outer transaction entirely. Apply the same refactor to any other processor that uses the inner-short-txn pattern.

**How to detect this trap in a new processor**:

1. Read the subclass's `processJob`. Grep for `this.prisma.$transaction`.
2. Grep for `_tx` in the signature. If it's prefixed-underscore (unused), and the body opens its own transactions, this processor is at risk.
3. Sanity-check: could `processJob` take longer than 5 min in any production scenario? If yes, override `transactionTimeoutMs` with a calibrated ceiling. If no, document the upper bound so a future change doesn't silently cross it.

**Code pointers**:

- `apps/worker/src/base/tenant-aware-job.ts` — base class + `transactionTimeoutMs` override hook.
- `apps/worker/src/processors/scheduling/solver-v2.processor.ts` — reference mitigation (3780 s ceiling).
- `scheduler/OR CP-SAT/IMPLEMENTATION_LOG.md` Stage 9.5.1 post-close amendment — full incident writeup with the two NHQS smoke runs that surfaced it.

## DZ-48: Multiple `@Processor` Classes On One Queue Silently Drop Jobs

**Risk**: In `@nestjs/bullmq`, every `@Processor(queueName)` class becomes its own BullMQ `Worker` that competes for jobs on that queue. When a worker claims a job whose name its guard rejects, the convention across this codebase is `if (job.name !== MY_JOB) return;` — BullMQ then marks the job complete with no log, no error, no retry. Any queue with N `@Processor` classes dispatching by job-name has an effective hit rate of ~1/N per job; the rest of the jobs are silently consumed. Measured on NHQS production 2026-04-22: a 20-job burst on the early-warning queue (3 processors) produced 1 successful run and 19 silent drops. Symptom: "the cron fires, the queue shows completed=N, failed=0 — but nothing actually happened".

**Location**: every previously-affected queue now owns a single `@Processor` dispatcher:

- `apps/worker/src/processors/early-warning/early-warning.processor.ts` — EARLY_WARNING (3 handlers)
- `apps/worker/src/processors/behaviour/behaviour-queue.processor.ts` — BEHAVIOUR (19 handlers, including 4 safeguarding-domain handlers that publish to the behaviour queue)
- `apps/worker/src/processors/notifications/notifications-queue.processor.ts` — NOTIFICATIONS (19 handlers across admissions/behaviour/communications/inbox/monitoring/notifications directories)
- `apps/worker/src/processors/pastoral/pastoral-queue.processor.ts` — PASTORAL (9)
- `apps/worker/src/processors/engagement/engagement-queue.processor.ts` — ENGAGEMENT (8)
- `apps/worker/src/processors/wellbeing/wellbeing-queue.processor.ts` — WELLBEING (6)
- `apps/worker/src/processors/regulatory/regulatory-queue.processor.ts` — REGULATORY (5)
- `apps/worker/src/processors/homework/homework-queue.processor.ts` — HOMEWORK (4)
- `apps/worker/src/processors/imports/imports-queue.processor.ts` — IMPORTS (4)
- `apps/worker/src/processors/security/security-queue.processor.ts` — SECURITY (3)
- `apps/worker/src/processors/payroll/payroll-queue.processor.ts` — PAYROLL (3)
- `apps/worker/src/processors/finance/finance-queue.processor.ts` — FINANCE (3)
- `apps/worker/src/processors/compliance/compliance.processor.ts` — COMPLIANCE (2)
- `apps/worker/src/processors/safeguarding/safeguarding-queue.processor.ts` — SAFEGUARDING (2)
- `apps/worker/src/processors/search-sync-queue.processor.ts` — SEARCH_SYNC (2)
- Pre-existing dispatchers: `attendance-queue-dispatcher.ts`, `gradebook/gradebook-queue-dispatcher.ts`, `scheduling/solver-v2.processor.ts` (scheduling), `early-warning/early-warning.processor.ts`.

**Status**: MITIGATED 2026-04-22 across every affected queue. Every handler that used to carry `@Processor(QUEUE_NAMES.X)` is now a plain `@Injectable()` service called by its queue's dispatcher. BullMQ creates exactly one `Worker` per queue — the one bound to the dispatcher — so no race exists.

**Mitigation pattern (applied to early-warning, apply elsewhere)**:

1. Keep each job's handler class — but strip the `@Processor` decorator, drop `extends WorkerHost`, drop the `super()`, add `@Injectable()`. The class becomes a plain service whose public `process(job)` method is now called directly, not via BullMQ.
2. Add one dispatcher class per queue with the single `@Processor(queueName)` decorator. Its `process(job)` switches on `job.name` and invokes the right handler's `process()`.
3. Register the dispatcher + all handlers in the worker module. No other code changes — existing specs keep working because the handler classes retain their constructors and method signatures.

**Do not "fix" by throwing from the guard**: a non-matching processor that throws will trigger BullMQ retries with backoff. The next attempt still has a ~1/N chance per retry, so you still drop jobs after `attempts` is exhausted — just noisily instead of silently. The dispatcher pattern is the real fix.

**How to detect (new code)**: if you're about to add a second `@Processor(QUEUE_NAMES.X)` class to any queue that already has one, stop. Route the new job through the existing queue's dispatcher (or create one). The old "multiple processors share a queue" pattern in `CLAUDE.md` predates this discovery and should be read as "one dispatcher owns the queue, multiple handlers route via job name".

**Adding a new handler to an existing dispatcher**:

1. Write the handler as a plain `@Injectable()` service with a public `process(job)` method. Export a `*_JOB` constant for its job name.
2. Add a `case <JOB_CONST>:` branch to the queue's dispatcher that delegates to the new handler.
3. Register the handler in `apps/worker/src/worker.module.ts` providers (next to the queue's other handlers). No changes to the dispatcher registration are needed.

**Related**: `docs/architecture/event-job-catalog.md` lists every job → queue mapping; use it to audit queues with ≥2 `@Processor` classes when you next touch the worker.

## DZ-Wellbeing-1: Prisma `@map` Enum Values Silently Fail Lying Casts

**Risk**: Prisma enums that use `@map("legacy_value")` export the TypeScript-side name (e.g. `pc_active`), not the DB value. Writing `where: { status: filters.status as $Enums.PastoralInterventionStatus }` with `filters.status === 'active'` passes `'active'` to the Prisma client, which compares it to its own enum member list (`pc_active, achieved, …`) and throws `PrismaClientValidationError: Invalid value for argument status. Expected PastoralInterventionStatus`. The lie only surfaces at runtime — TypeScript's cast suppresses the compile-time check.

**Location**:

- `apps/api/src/modules/pastoral/services/intervention.service.ts` — `listInterventions`, `listInterventionsWithFilter` (filter translation via `toPrismaInterventionStatus` helper).
- Schema pointer: `packages/prisma/schema.prisma` — any `enum X { foo @map("bar") }` entry creates this risk.

**Affected mapped enums** (as of 2026-04-21): `PastoralInterventionStatus.pc_active → "active"`, `PastoralActionStatus.pc_*`, `PastoralReferralRecommendationStatus.rec_*`, `SstMeetingStatus.sst_*`, `CriticalIncidentType.ci_other`, `ContactFormStatus.new_submission`, `RegulatorySubmissionStatus.reg_*`, `TuslaAbsenceCategory.tusla_*`, `ReducedSchoolDayReason.rsd_other`, `PodSyncStatus.pod_*`, `PodSyncLogStatus.sync_*`, `TransferStatus.transfer_*`, `CbaSyncStatus.cba_*`, `BehaviourTaskStatus.pc_*` (if any). **Services must translate public-API values to Prisma-side values before passing them as filters.**

**Status**: MITIGATED for `PastoralInterventionStatus` (2026-04-21, impl 24 polish). Other mapped enums are currently safe because no filter paths receive public values — but the same trap will fire if a future endpoint exposes a public `status` filter on any of them.

**How to detect in new code**:

1. Grep for `as $Enums\.` in service files.
2. For each hit, check whether the value is a runtime-dynamic string (from `filters.*`, `dto.*`, `req.query.*`) or a known literal.
3. Dynamic values must be passed through a translator function that maps public names to the Prisma-side names. Literals are safe if they match the Prisma-side name.

**Mitigation pattern** (from `intervention.service.ts`):

```typescript
function toPrismaInterventionStatus(value: string): $Enums.PastoralInterventionStatus {
  return (value === 'active' ? 'pc_active' : value) as $Enums.PastoralInterventionStatus;
}
```

**Code pointers**:

- `apps/api/src/modules/pastoral/services/intervention.service.ts:125-134` — translator helper
- `packages/prisma/schema.prisma` — search `@map` for the full set of at-risk enums

## DZ-Wellbeing-2: AI Flag Disable Suspends Features Tenant-Wide

**Risk**: `AiFlagsService.setFlag(tenantId, moduleKey, false, userId)` immediately short-circuits every AI endpoint under that module with `403 AI_DISABLED`. There is **no drain window** — in-flight requests that haven't yet reached the guard will fail at the decorator, but the UI surfaces tied to the flag (AI parse modal, per-student AI summary, NL query, SST agenda refresh) stop working instantly.

**Location**: `apps/api/src/modules/ai-flags/` — `AiFlagGuard` + `@RequiresAiFlag('module_key')` decorator. Admin UI at `/settings/ai-flags`.

**Status**: ACCEPTED design. The alternative (drain window) would make billing unpredictable.

**Mitigation**:

- UI at `/settings/ai-flags` warns admins via a `DISABLE ALL AI` typed-confirmation before bulk-disable (matches impl 09's admin repair pattern).
- The 5-minute in-memory cache means multi-instance API processes converge within 5 minutes of a disable. Bulk-disable does 4 sequential PATCHes client-side so ordering is deterministic.
- Frontend handles `403 AI_DISABLED` with a friendly "AI features disabled" banner instead of an error toast.

**How to detect**:

- Adding a new AI endpoint? Add `@RequiresAiFlag('module_key')` to the controller method. Skipping the decorator silently bypasses the gate.
- Lint rule candidate: any endpoint whose name matches `*ai*|*gpt*|*llm*` but has no `@RequiresAiFlag` decorator should fail the lint.

## DZ-Wellbeing-3: Sealing Is Irreversible

**Risk**: `POST /safeguarding/concerns/:id/seal/approve` flips the concern to `sealed` status. Once sealed, the record can only be unsealed by the platform owner — and unseal is a governance-heavy manual flow (not currently an API endpoint). The UI does not warn sealers that their action cannot be undone within the normal admin surface.

**Location**: `apps/api/src/modules/safeguarding/safeguarding-seal.service.ts`.

**Status**: ACCEPTED design. The sealing concept exists specifically to make records forgery-resistant post-approval.

**Mitigation**:

- Dual-control: the approver and initiator must be different users (`safeguarding_seal_rejected` audit log on same-user attempts).
- Rejection path (`POST /:id/seal/reject`) allows aborting the seal before the approver confirms.
- Sealing audit log is immutable and all seal actions are in `safeguarding_actions` with `action_type='status_changed'`.

**How to apply**: before shipping any UI that wraps the approve endpoint, the UI MUST show an irreversibility warning plus the approver's name and require an explicit typed-confirmation (pattern: `"SEAL CONCERN"`).

## DZ-Wellbeing-4: Break-Glass Access Log Is Append-Only; Deleting Rows Breaks The Audit Chain

**Risk**: The break-glass access log is projected from `safeguarding_actions.metadata.break_glass_grant_id`. There is no dedicated `safeguarding_break_glass_access_log` table — the chain of custody lives inside the append-only actions trail. **Deleting or anonymising any `safeguarding_actions` row with `metadata.break_glass_grant_id` set breaks the break-glass audit chain for the grant it references.**

**Location**: `apps/api/src/modules/safeguarding/` — break-glass service + access-log projection.

**Status**: Intentional (keeps the schema narrow). Documented here so no one writes a migration that deletes old `safeguarding_actions` rows thinking they're tidying up.

**Mitigation**:

- Retention policy must exclude `safeguarding_actions` with `metadata.break_glass_grant_id` from any deletion window.
- The GDPR anonymisation pipeline (legal-hold respecting) must treat these rows as legal-hold-by-default.

## DZ-Wellbeing-5: Admin Repair Operations Are Dangerous And Mostly Batch-Scale

**Risk**: The behaviour admin console (`/behaviour/admin`) exposes six repair operations that each touch large swaths of data: `recompute-points`, `rebuild-awards`, `recompute-pulse`, `backfill-tasks`, `reindex-search`, `retention/execute`. They all now require a `confirm_phrase` in the request body matching a specific string (e.g. `"recompute-points-yes"`, `"retention-execute-yes"`); mismatches return `400 CONFIRMATION_PHRASE_MISMATCH`.

**Location**: `apps/api/src/modules/behaviour/behaviour-admin.controller.ts` + `behaviour-admin.service.ts`. UI: `/behaviour/admin` (Wave 6 Impl 23).

**Blast radius**:

- `recompute-points`: re-scores every active incident in the tenant. Temporary points inconsistency until the job completes.
- `rebuild-awards`: re-issues every recognition award. Can cascade into parent notifications if the award templates are configured for auto-announce — currently inert because the notification wiring for rebuild is stubbed.
- `recompute-pulse`: refreshes the behaviour-pulse KPIs. Read-only output but CPU-heavy.
- `backfill-tasks`: creates missing follow-up tasks for historical incidents. Net-new task rows.
- `reindex-search`: full-table search reindex. No data change; impacts search latency during the run.
- `retention/execute`: **the dangerous one.** Soft-anonymises incidents older than the tenant's retention window. Legal-hold flags are respected. This is the only repair op with permanent side effects.

**Mitigation**: each endpoint now requires `confirm_phrase`. The UI typed-confirmation MUST match the expected server-side phrase per operation. If a new admin op is added, the shared `admin-ops.schema.ts` MUST define its phrase and the controller MUST enforce it with `CONFIRMATION_PHRASE_MISMATCH` on mismatch.

## DZ-Wellbeing-6: In-App Notification Channel Is Always On

**Risk**: `tenant_notification_preferences.wellbeing_channels` only gates the outbound paid channels (email / SMS / WhatsApp). In-app inbox delivery is hard-coded on in `WellbeingNotificationsService.dispatch` — a tenant who expects "all wellbeing notifications suppressed" still receives in-app entries.

**Location**: `apps/api/src/modules/wellbeing-notifications/services/wellbeing-notifications.service.ts`.

**Status**: Intentional — matches the new-inbox rebuild's always-on inbox invariant (DZ-Inbox-1). **Never weaken this** — the inbox is the only channel that audit-logs for compliance export.

**Mitigation**: if a tenant asks to suppress in-app for a specific event, the right answer is "configure the event to not fire in the first place" (e.g. disable the underlying feature), not to add a channel-level off switch.

## DZ-Wellbeing-7: `safeguarding.view` Was Missing From `school_principal` + `school_vice_principal` Until 2026-04-21

**Risk**: Before the 2026-04-21 backfill migration (`20260421000000_wbr_backfill_safeguarding_admin_grants`), `school_principal` and `school_vice_principal` system roles did not carry `safeguarding.view`, `safeguarding.manage`, `safeguarding.report`, or `safeguarding.seal` on existing tenants — only `safeguarding.dedicated_view` and `safeguarding.keywords.write` (from the wellbeing foundation migration). Result: the `/safeguarding` sub-hub rendered (gated on `.dedicated_view`) but every data fetch returned `403 safeguarding.view`. The UI surfaced three "Safeguarding access denied" toasts on first load.

**Location**:

- Original seed gap: `packages/prisma/seed/system-roles.ts` (now fixed) + `packages/shared/src/constants/permissions.ts` `SYSTEM_ROLE_PERMISSIONS` (partial — only `school_owner` + `school_admin` carry full safeguarding; the rest of the TENANT_SYSTEM_ROLES roles have NO entry in that record, so new API-created tenants rely on per-module backfill inits — see below).

**Status**: MITIGATED (impl 24). Three fixes landed together:

1. Migration `20260421000000_wbr_backfill_safeguarding_admin_grants` grants the four safeguarding perms to existing tenants' principal + VP roles.
2. `packages/prisma/seed/system-roles.ts` updated so re-seeded dev / test tenants get the perms.
3. Not fixed in impl 24 but flagged: `SYSTEM_ROLE_PERMISSIONS` record is incomplete. API-created tenants still rely on legacy seed paths. A future refactor should make `SYSTEM_ROLE_PERMISSIONS` the single source for tenant-creation OR consolidate onto `SYSTEM_ROLES`. Current state: the two sources are known-divergent.

**How to detect**: if a new system role is introduced, it MUST be added to BOTH `SYSTEM_ROLES` (seed) AND `SYSTEM_ROLE_PERMISSIONS` (runtime tenant creation), OR a dedicated backfill migration + per-module init class must explicitly grant the permissions it needs. Missing perms surface as 403s on endpoints the role is expected to access.

**Per-jurisdiction note**: Principal is the Designated Safeguarding Lead in Irish / UK schools by default. The current grant (`safeguarding.view|manage|report|seal` to principal, `view|manage|report` to VP — no `seal`) reflects dual-control: sealing requires principal + owner, never two people from the same admin tier.

## DZ-Wellbeing-9: Safeguarding Report Endpoint MUST NEVER Be Rate-Limited

**Risk**: `POST /v1/safeguarding/concerns` is the primary channel for reporting child-protection concerns. Any rate-limiter added here — even a defensive "prevent spam" one — could silently drop a genuine report during a rapidly-unfolding safeguarding incident (e.g. a teacher reporting multiple students involved in the same event within minutes).

**Location**: `apps/api/src/modules/safeguarding/safeguarding.controller.ts` `reportConcern`, `apps/api/src/modules/safeguarding/safeguarding-concerns.service.ts` `reportConcern` + `checkReportVolumeAndAlert`.

**Status**: INTENTIONAL — no rate-limit, volume anomalies are monitored after the fact.

**Mitigation**: volume anomalies are detected by the post-write abuse monitor in `SafeguardingConcernsService.checkReportVolumeAndAlert` (WB-C-11). If any single user submits more than 20 concerns in a rolling 60-minute window, a `safeguarding:report-volume-alert` notification is dispatched to the DLP (NOT to the submitter). This lets every concern through while still surfacing abuse / accidental-duplicate patterns for after-the-fact review.

**How to detect**: any PR that adds `@Throttle`, express-rate-limit middleware, or a global interceptor that could short-circuit `POST /v1/safeguarding/concerns` is a violation. Flag in review.

## DZ-Wellbeing-10: Single-Admin Approval On Break-Glass + CP Grants Is Intentional

**Risk**: A future security-audit reviewer may flag the absence of dual-control on `safeguarding_break_glass_grants` (break-glass access to sealed safeguarding concerns) and `cp_grants` (child-protection elevated read grants) as a P0/P1 finding, citing OWASP "M-of-N approval" practice for sensitive resource access.

**Location**: `apps/api/src/modules/safeguarding/safeguarding-break-glass.service.ts` `grantAccess`, and the equivalent CP-grant write path in the same service. Single-admin approval is the policy.

**Status**: INTENTIONAL — no dual control required at this tenant class.

**Rationale (recorded 2026-04-21 by product/security review)**:

- Tenant population is K-12 schools with ≤50 staff. Requiring two safeguarding admins to be online simultaneously to release a sealed concern would block real incident response — most schools have one DSL and one deputy, often both off-site at training or interviews.
- The append-only `safeguarding_break_glass_access_log` (DZ-Wellbeing-4) is the primary safeguard. Every grant, every read against the grant, every revocation, and every after-action review writes a row. Platform admin queries this log cross-tenant via the audit console.
- After-action review (WB-C-19) is mandatory within 7 days of any grant — the AAR reminder cron (`safeguarding:break-glass-aar-reminder`) escalates first at T+6d, then T+6d22h, then T+7d (overdue) until completion.
- Notification dispatch on grant creation (WB-C-16) ensures both the requesting admin and the DLP/deputy DLP receive in-app + email alerts immediately — a rogue grant cannot occur silently.
- The bar for adding dual control is: (a) tenant class moves up to multi-school trust / district scale, or (b) a safeguarding incident review identifies single-admin approval as the root cause of harm. Neither is true today.

**How to detect**: any PR that adds an `approval_state` enum, second-approver column, or "two-admin gate" to `safeguarding_break_glass_grants` or `cp_grants` should reference this DZ entry and an updated product decision before landing.

**Re-evaluation trigger**: re-read this entry at the next major audit (Wave 3 or final independent re-audit per `docs/governance/re-audit-checkpoints.md`), or sooner if tenant scale grows beyond ~50 staff.

## DZ-Wellbeing-8: Wave 4 Hardening Rules Persist Beyond The Rebuild

**Risk**: Waves 4, 5, and 6 of the wellbeing rebuild introduced eleven hardened parallel-coding rules (H1–H11) in `wellbeing_new/IMPLEMENTATION_LOG.md §2b` to prevent lint-staged auto-stash from destroying concurrent sibling work. These rules are not documented anywhere else in the repo, but they apply to **every future frontend rebuild** that touches shared files (`messages/en.json`, `messages/ar.json`, `nav-config.ts`, morph-bar shell, seed files).

**Location**: `wellbeing_new/IMPLEMENTATION_LOG.md §2b` (rules H1–H11). Prior loss: the new-inbox rebuild's Wave 4 lost hours of work to `git add .` collisions.

**Status**: Established. Any future module rebuild running parallel sessions should import these rules verbatim.

**Key patterns**:

- **H3**: Stage by explicit pathspec, never `git add .` or `-A`.
- **H4**: Inspect `git status` before every commit; abort if sibling files appear.
- **H5**: Shared files (translations, nav-config) go LAST in a dedicated final commit.
- **H7**: `IMPLEMENTATION_LOG.md` always gets its own commit.
- **H8**: Translation additions stored in local scratch until the final commit window.
- **H9**: Re-read `en.json` / `ar.json` immediately before writing; deep-merge.
- **H11**: Pre-stash sibling work with `git stash push --keep-index --include-untracked` before committing.

See `wellbeing_new/IMPLEMENTATION_LOG.md §2b` for the full rules + rationale.

## DZ-Regulatory-1: Response-envelope unwrap at the call site

**Status update (2026-04-26, engagement-fix Impl 01)**: `apiClient<T>` now auto-unwraps single-key `{ data: T }` envelopes safely (see DZ-Engagement-1 below). The "do NOT modify `apiClient`" advice in this entry is superseded — the auto-unwrap was implemented conservatively and ships in production. Existing regulatory pages that type the response as `{ data: T }` and read `r.data.field` continue to work because the back-compat shim in `autoUnwrap()` installs a non-enumerable `.data` getter that returns the inner value itself. Per-call unwrapping is no longer required for new regulatory code, but it does no harm.

**Risk (historic)**: `apps/api`'s `ResponseTransformInterceptor` wraps every non-paginated, non-null response body in `{ data: ... }`. Several regulatory pages were written expecting a bare payload (`summary.calendar.upcoming_deadlines`) and crash at runtime with `Cannot read properties of undefined (reading 'calendar')` because the actual payload is `{ data: { calendar: { ... } } }`. This is the same bug commit `633b4f08` fixed for `/v1/leave/balance`.

**Convention (legacy — pre-engagement-fix Impl 01)**:

- **Unwrap at the call site.** Every regulatory page that fetches a non-paginated endpoint types the response as `{ data: T }` and unwraps in the `.then` handler:

  ```ts
  apiClient<{ data: SummaryPayload }>('/v1/regulatory/summary').then((r) => setSummary(r.data));
  ```

- ~~**Do NOT modify `apiClient` to auto-unwrap.**~~ Superseded — see status update above.
- Paginated endpoints already return `{ data, meta }` — those stay unchanged and are consumed as-is. The unwrap behaviour applies ONLY to non-paginated payloads.
- If you see a regulatory page with `setFoo(response.foo)` where `response` typed as raw `T`, suspect envelope mismatch before chasing a backend bug.

**How to detect**: grep for `apiClient<` calls in `apps/web/src/app/[locale]/(school)/regulatory/**` that do NOT destructure `.data` — historic crash sites; with auto-unwrap they now resolve correctly.

**Reference**: `regulatory-new/01-foundation.md` (Phase 1 of the regulatory redesign) and commit `633b4f08 fix(leave): unwrap /v1/leave/balance response envelope` for the precedent.

## DZ-Engagement-1: `apiClient` envelope auto-unwrap (engagement-fix Impl 01)

**Risk**: The frontend `apiClient<T>()` at `apps/web/src/lib/api-client.ts` auto-unwraps single-key `{ data: T }` response envelopes. This was added during the engagement-fix rebuild to resolve a class of bugs where pages read `response.someField` directly off a wrapped `{ data: { someField } }` envelope.

The behaviour is conservative: it only strips the wrap when the response body is a plain object with EXACTLY one key called `data` and a non-array value. Paginated responses (`{data, meta}`), error envelopes (`{error: {...}}`), raw arrays, and already-unwrapped objects all flow through unchanged.

**Implication for new code**: when calling `apiClient<T>(...)`, declare `T` as the inner shape (e.g. `apiClient<EventRecord>(...)`), not the wrapped envelope (`apiClient<{data: EventRecord}>(...)`). Reading `response.someField` will work directly on the unwrapped value.

**Back-compat shim**: for object and array inner values, the helper installs a non-enumerable `.data` getter on the unwrapped value that returns the inner itself. So legacy callsites typed `apiClient<{ data: T }>` and reading `.data.field` continue to work without per-file migration. Primitive inner values can't carry a getter — the only known callsite, `NotificationPanel.fetchUnreadCount`, was retyped to `apiClient<number>`.

**The legacy `unwrap()` helper at the same path remains available** for explicit opt-in unwrapping. It is idempotent on already-unwrapped values, so existing defensive `unwrap(await apiClient(...))` callsites continue to work after this change.

**How to detect a regression**: if a page surfaces `Cannot read properties of undefined` on a field that exists in the API response, the auto-unwrap may have been bypassed (e.g. a custom fetch instead of `apiClient`, or a primitive-returning endpoint typed as a wrapped object — see `feedback_deploy_route_choice.md` and `notifications/unread-count` precedent).

**Reference**: `engagement-fix/PLAN.md` §3.1 and `engagement-fix/IMPLEMENTATION_LOG.md` Impl 01 completion record (commit `39c30036`).

## DZ-Reports-1: AI cost spiral — flag default-off + per-call audit

**Risk**: The Reports module exposes three AI-powered features — `reports_narration` (executive summaries), `reports_ask_ai` (natural-language report builder), `reports_predictions` (student risk / attendance forecast / cash-flow forecast). Every call hits Anthropic and is billed per-token; a single tenant accidentally calling AI in a tight loop (or AI calls that don't cache) can spike daily Anthropic spend dramatically. Tenants — not the platform — pay for AI usage, but the platform owes tenants a cost ceiling and visibility.

**Convention for the reports rebuild**:

- **Every AI flag seeds `enabled: false`.** New tenants see no AI surfaces until an admin explicitly opts in via `Settings → Reports`. This is enforced in `packages/prisma/seed/ai-flags.ts` and verified by a migration check in impl 01.
- **Every AI endpoint is gated** by `@UseGuards(AiFlagGuard) @RequiresAiFlag('<flag_key>')`. A 403 is returned when the flag is off — the frontend renders a "disabled" state with a link to settings, never an error toast.
- **Per-call audit log.** `AiAuditService.log({ tenant_id, module_key, prompt_hash, response_hash, cost_usd_estimate, cached })` records every call in `ai_logs`. The Settings page's "{N} generations this month (≈ ${cost})" line reads directly from this table.
- **10-minute / 24-hour cache.** Narration is cached 10 min per `(tenant, scope, locale, hash(payload))`. Ask-AI is cached 24h. Predictions are cached 24h per subject. Caching is the primary cost control — without it a single dashboard reload loop could rack up 60+ identical calls per hour.
- **Rate limit per tenant.** 20 AI requests / hour per tenant per feature; the 21st returns `AI_RATE_LIMITED` and the panel renders a friendly "you've hit the cap, try later" message.
- **`ANTHROPIC_API_KEY` missing → 503 `AI_UNAVAILABLE`.** This is the production fallback today (April 2026); no key is configured, so tenants who flip a flag on still see a graceful "AI is not configured for this environment" message rather than a crash.

**How to detect**:

- Look for any new AI-touching service — does it `@RequiresAiFlag`? Does it write to `ai_logs`? Does it consult the cache before calling Anthropic?
- A new endpoint that bypasses `AiFlagGuard` is a regression — every flagged feature must round-trip through it.
- Check `Settings → Reports` rendered "$0.00" for a flag that was clearly used: `cost_usd_estimate` is missing on that flag's calls (impl 12 known follow-up for predictions).

**Reference**: `reports-rebuild/PLAN.md` §4 (AI features), impl 10/11/12/21 completion records in `reports-rebuild/IMPLEMENTATION_LOG.md`.

## DZ-Reports-2: Custom builder bypass — query-engine is the only execution path

**Risk**: The custom report builder exposes a Subject Registry (Student, Staff, Household, Class, Invoice, Application, Behaviour Incident, Safeguarding Concern, Attendance Record, Grade, Payroll Entry) with permission-scoped field trees. The query engine compiles the user's column / filter / group-by selections into a single Prisma query that runs through the RLS middleware, enforces a row cap (10k default), enforces a query timeout (30s), and elides fields the calling user lacks permission for. **Bypassing the engine — calling `prisma.<model>.findMany` directly with builder inputs, or writing raw SQL against builder fields — defeats RLS, permission scoping, AND the row cap.** A single ad-hoc query for "all students" in a multi-tenant prod DB is a privacy breach and a memory hazard.

**Convention for the reports rebuild**:

- **Every saved / preview / scheduled report query goes through `QueryEngineService.run()`** in `apps/api/src/modules/reports/query-engine/`. No exceptions.
- **The engine is the only place that translates `subject_key` + `field_ids` + `filters_json` to Prisma.** Anything else is "ad-hoc" and prohibited.
- **Permission-scoping happens inside the engine.** When a user lacks `students.medical.view`, the engine drops every field tagged `permission: 'students.medical.view'` from the SELECT — silently. The caller does not need to check; the engine does.
- **Row cap and timeout** are non-negotiable. The engine enforces a 10,000-row cap (configurable per subject) and a 30-second per-query timeout. Increasing these requires a code review that justifies the new ceiling.
- **No raw SQL in builder execution.** `$queryRawUnsafe` / `$executeRawUnsafe` are prohibited everywhere except the RLS middleware; the builder uses the typed Prisma builder API exclusively.
- **Scheduled-report executor reuses the engine.** The cron worker calls `QueryEngineService.run()` with `tenant_id` set explicitly; do not write a parallel "scheduled" execution path.

**How to detect**:

- A new endpoint that accepts `subject_key + field_ids` and calls Prisma directly without going through `QueryEngineService` is the violation pattern.
- Look for `prisma.student.findMany` / `prisma.application.findMany` etc. with selects that mirror the field-tree column names — those should route through the engine instead.
- Look for `$queryRawUnsafe` calls in `apps/api/src/modules/reports/**` that are not in `rls.middleware.ts`.

**Reference**: `reports-rebuild/PLAN.md` §3 (Subject registry + query engine), impl 02 completion record in `reports-rebuild/IMPLEMENTATION_LOG.md`.

## DZ-Reports-3: Prisma `not: null` on non-nullable fields

**Risk**: In Prisma 6, `WHERE field IS NOT NULL` syntax (`field: { not: null }`) is **only valid for nullable schema fields**. When applied to a non-nullable field (e.g. `Student.date_of_birth: DateTime @db.Date`), Prisma 6 raises `PrismaClientValidationError: Argument 'not' must not be null`, which surfaces to the user as an HTTP 500. The error is silent in test environments because the assertion only fires when the query reaches the DB driver. Demographics page hit this in production (impl 22 found-and-fixed precedent).

**Convention for the reports rebuild**:

- **Audit every `{ not: null }` filter.** Cross-reference the schema: if the field is non-nullable, drop the filter (the column is never null) and check at the application level for defence in depth, not at the DB level.
- **For nullable fields**, `{ not: null }` is correct and idiomatic — keep it. Examples that are correct: `raw_score: { not: null }` on `Grade.raw_score: Float?`, `submitted_at: { not: null }` on `Application.submitted_at: DateTime?`.
- **Add a defensive runtime check** in the loop: `if (!row.field) continue;` lets old / corrupt data slip through without crashing.

**How to detect**:

- `grep -rn "not: null" apps/api/src/modules/reports/`. For each match, look up the corresponding model field in `packages/prisma/schema.prisma` — `?` after the type means nullable (filter is fine), no `?` means required (filter will throw).
- Watch for a new 500 on a previously-working endpoint after a Prisma upgrade — Prisma 5 → 6 was the trigger for this class of bug.

**Reference**: `reports-rebuild/IMPLEMENTATION_LOG.md` impl 22 completion record (`fix(reports): demographics ageDistribution Prisma not-null on non-nullable field`).

## DZ-Payroll-1: Historical payslip-number format inconsistency

**Risk**: Pre-rebuild, runs finalised through the direct path produced `<PREFIX>-YYYYMM-NNNNNN` (6-digit padding) while runs finalised through the approval-callback worker produced `PS-YYYYMM-NNNNN` (5-digit padding, hardcoded `PS-` prefix). The 2026-04-26 payroll-overhaul rebuild standardised both paths to the 6-digit form via `formatPayslipNumber()` in `@school/shared/payroll`. **Pre-rebuild payslips retain their original numbers.** Tenants finalising new runs see a format change at the rebuild cutover. If a tenant queries by payslip number, the historical mix is by design.

**Convention**:

- The shared `formatPayslipNumber({prefix, periodYear, periodMonth, sequence})` is the single source of truth. Both `apps/api/src/modules/payroll/finalisation.service.ts` and `apps/worker/src/processors/payroll/approval-callback.processor.ts` MUST import and use it.
- Inline format strings (`\`PSL-${year}${month}-${seq}\``) are blocked by `apps/api/src/modules/payroll/cross-path-equivalence.spec.ts` — that spec asserts neither path constructs a payslip-number with a template literal.
- Tenant-specific prefix lives on `tenant_branding.payslip_prefix` (default `'PSL'`).

**How to detect**:

- A new finalisation path that calls `tenantSequence.upsert` directly and constructs a string without `formatPayslipNumber` — instant cross-path divergence.
- Tenant reports of payslip numbers in different shapes for runs in the same period.

**Reference**: `payrollnew/PLAN.md` §"Payslip-number unification"; `payrollnew/IMPLEMENTATION_LOG.md` impl 02 + impl 04 completion records.

## DZ-Payroll-2: Deduction two-phase application

**Risk**: Recurring deductions are applied in two phases via the `payroll_deduction_applications` table:

1. `PayrollDeductionsService.scheduleApplicationForRun(tenantId, runId, entryId, staffId, tx)` — idempotent insert into `payroll_deduction_applications` (unique key `(payroll_run_id, staff_recurring_deduction_id)` — `uniq_deduction_per_run`). Computes `applied_amount = min(monthly_amount, remaining_amount)`; multiple calls for the same (run, deduction) pair are no-ops.
2. `PayrollDeductionsService.commitApplications(tenantId, runId, tx)` — decrements `staff_recurring_deduction.remaining_amount` exactly once per scheduled application, stamps `committed_at` on the application row, marks the deduction `active = false` once `remaining_amount <= 0`.

Calling `commitApplications` BEFORE `scheduleApplicationForRun` decrements zero applications (no-op). Calling `scheduleApplicationForRun` multiple times has no effect (unique key blocks). The two MUST be called in order, and the commit MUST happen inside the same transaction as run finalisation. Calling them out of sequence in a custom code path will leave deductions un-committed and silently double-deducted on retry.

**Convention**:

- `FinalisationService.finaliseAtomic` is the only authorised caller of the schedule + commit pair. Both happen inside one `$transaction` so atomicity is guaranteed.
- `PayrollInputResolver.resolveForRun` calls `scheduleApplicationForRun` as the deduction-input source. Scheduling is intrinsic to input resolution — the commit happens later in the same transaction.
- Bypass paths (raw SQL inserts into `payroll_deduction_applications`, manual `UPDATE staff_recurring_deductions SET remaining_amount = ...`) are prohibited and broken — the two-phase contract relies on the join table.

**How to detect**:

- A new payroll service method that touches `staffRecurringDeduction.remaining_amount` directly without going through `commitApplications` — that's a regression of the pre-rebuild destructive `autoApplyForRun` (which Wave 5 dropped).
- Deduction balances drifting between expected and actual after a re-run of the same period — likely a missed `commitApplications` call.

**Reference**: `payrollnew/PLAN.md` §"Two-phase deduction application"; `payrollnew/IMPLEMENTATION_LOG.md` impl 01 (schema) + impl 02 (service wiring) completion records.

## DZ-Payroll-3: Compensation period-bracket "most-recent" rule

**Risk**: When multiple `staff_compensation` rows for the same staff member overlap a payroll-run period (data integrity issue, but possible since the schema has no overlap-prevention constraint), the engine selects the row with the most recent `effective_from`. Tenants who have multiple active compensations for the same staff member see only the latest; older overlapping rows are silently ignored. The check happens in `CompensationService.findActiveForPeriod()` — it ORDERs by `effective_from DESC` and returns the first match.

Adding a database-level partial unique constraint on `staff_compensation (staff_profile_id) WHERE effective_to IS NULL` would prevent the overlap entirely; this was not added during the rebuild because it could break tenants with existing overlapping rows. Future maintenance task: clean up overlaps then add the constraint.

**Convention**:

- `CompensationService.findActiveForPeriod(tenantId, staffProfileId, periodStart, periodEnd, tx?)` is the single API for resolving the active compensation for a payroll period. Used by `PayrollInputResolver.resolveForRun` and any future code path that needs "the comp that paid this staff member for this period".
- Frontend should warn when creating a new compensation row that overlaps an existing active one (currently advisory only).

**How to detect**:

- A staff member's payslip totals change after re-finalising a draft run AND multiple compensations for that staff exist — the engine resolved a different "most-recent" row this time.
- `SELECT staff_profile_id, COUNT(*) FROM staff_compensation WHERE effective_to IS NULL GROUP BY 1 HAVING COUNT(*) > 1;` returns rows on a tenant — that tenant has overlap and should be cleaned up before adding the constraint.

**Reference**: `payrollnew/PLAN.md` §"Period-bracketed compensation"; `payrollnew/IMPLEMENTATION_LOG.md` impl 02 completion record.

## DZ-Comms-1: Tenant Credential Cache Coherence — Redis Pub/Sub Required

**Risk**: Stale provider clients used after a tenant rotates credentials, silently sending mail from revoked Resend / Twilio keys.
**Location**: `apps/api/src/modules/communications/comms-cache-bus.service.ts`, `apps/api/src/modules/communications/providers/per-tenant-client-cache.ts`, the worker's mirror of both
**Status**: ACTIVE

The provider classes maintain a per-process `Map<tenant_id, ProviderClient>` cache to avoid re-instantiating Resend/Twilio clients on every dispatch. To stay coherent across the API process and every worker process, every credential mutation publishes `{ tenant_id, channel }` on the Redis pub/sub channel `comms:config-changed`. Both the API and the worker subscribe and call `cache.invalidate(tenant_id)` on receipt.

**Failure mode**: if Redis is unhealthy at the moment of a credential rotation, the publish silently no-ops (or the subscribe silently misses the event). The cache TTL (30-min idle eviction) eventually evicts the stale client, but for up to 30 minutes the API/worker keeps using the old credentials. From the tenant's perspective: "I rotated my Resend key but emails are still going through" — a confusing safety regression.

**Mitigations**:

1. The `CommsCacheBusService` logs every publish + receive with `tenant_id` + `channel` at INFO level. After a credential rotation, the operator can grep worker logs for the publish/receive pair to confirm propagation.
2. Manual invalidation: `pm2 restart api worker` clears every per-process cache.
3. The worker also re-reads `is_enabled` per notification (not once per batch — see DZ-Comms-2) which catches "tenant disabled the channel" within at most one notification's worth of staleness.
4. Monitoring: Prometheus counter `notifications_dispatched_total{channel, status}` should drop sharply for the affected tenant within seconds of a cache invalidation if their old credentials are revoked. Lack of a drop = cache didn't invalidate; investigate Redis pub/sub.

**Where to look first when something goes wrong**: Redis health (`redis-cli ping`), worker logs filtered by `comms:config-changed`, and the per-tenant client cache eviction events in the API logs.

**Reference**: `communicationnew/IMPLEMENTATION_LOG.md` Impl 04 (provider refactor + per-tenant client cache + Redis pub/sub).

## DZ-Comms-2: Mid-Flight `is_enabled` Flip Drops In-Batch Sends

**Risk**: A batch of N notifications is partially dispatched when a tenant disables a channel — some land, some are marked `failed:channel_disabled`. The "some land" half can confuse the user into thinking nothing was disabled.
**Location**: `apps/worker/src/processors/communications/dispatch-notifications.processor.ts`
**Status**: ACTIVE — by design

The dispatch worker batches up to 100 notification rows per tenant per tick. Inside the batch, every row re-reads `is_enabled` from the per-tenant config (NOT once per batch — Impl 05 explicitly closed that gap). If a tenant flips `is_enabled = false` at a moment when 30 of a 100-row batch have already dispatched, the next 70 rows mark `failed:channel_disabled`.

**Why this is the right behaviour**: re-reading per-batch (the alternative) would force the worker to either (a) abort the entire batch on any change — which loses the 30 already-dispatched rows' acknowledgment, or (b) continue using the stale read — which is the failure mode we're trying to avoid. Per-row re-read is the only correct compromise.

**Failure mode**: user disables a channel mid-announcement and observes "30 of 100 parents got the email; 70 didn't." The 70 are marked `failed:channel_disabled` in the `notification` table; the announcement audit log shows the partial dispatch.

**Mitigations**:

1. The frontend `(school)/settings/communications/{email,sms,whatsapp}/page.tsx` should warn when disabling a channel that there may be in-flight dispatches. (Impl 11 polish: optional toast.)
2. Operations runbook `comms-tenant-dispatch-failures.md` documents this as expected behaviour and walks through how to identify partial-dispatch incidents.
3. The `notification` table has `failure_reason='channel_disabled'`; the dashboard surfaces the count.

**Where to look first when something goes wrong**: Filter `notification` rows by `tenant_id`, `failure_reason='channel_disabled'`, and the timestamp window of the disable event. Compare against the `audit_log` event for the `tenant_*_config.update` action with `is_enabled` going false.

**Reference**: `communicationnew/IMPLEMENTATION_LOG.md` Impl 05 (worker parity + mid-flight `is_enabled` enforcement).

## DZ-Comms-3: Webhook Signature Trust Depends on Per-Tenant `webhook_secret`

**Risk**: A tenant whose `webhook_secret` is missing/null has every webhook event rejected. Notification statuses for that tenant never advance past `sent` — bounces, complaints, deliveries are never reflected.
**Location**: `apps/api/src/modules/communications/webhooks/webhook-signature-verifier.service.ts`, `apps/api/src/modules/communications/webhooks/communications-webhooks.controller.ts`
**Status**: ACTIVE

Every inbound webhook on `POST /v1/webhooks/communications/{email,sms,whatsapp}/:tenantId` verifies the per-tenant signature against the tenant's `webhook_secret_encrypted` column. If the secret is missing, the verifier fails closed (returns 401, writes `notification_webhook_events` with `signature_verified=false`).

**Why this is the right behaviour**: webhooks are public endpoints. Trusting unsigned bodies would let an attacker mark every notification as `delivered`/`bounced` for any tenant. The fail-closed posture is non-negotiable.

**Failure mode**: a tenant onboarded without a `webhook_secret` (e.g. partial Impl 13 backfill, or a manual platform-admin row insert that skipped the field) → every webhook event for that tenant is logged as `signature_verified=false` and dropped. From the tenant's perspective, all their emails show `status=sent` forever, never advancing to `delivered` / `bounced`.

**Mitigations**:

1. The Zod schema on `upsertEmailConfigSchema` / `upsertSmsConfigSchema` / `upsertWhatsAppConfigSchema` requires `webhook_secret` — any new tenant config gets one (Impl 03 enforced this).
2. Impl 13's backfill script populates `webhook_secret_encrypted` for all five test tenants.
3. The runbook `comms-webhook-debugging.md` includes the SQL query to find tenants whose `webhook_secret` is null:

```sql
SELECT t.subdomain, tec.id IS NOT NULL AS has_email_config,
       tec.webhook_secret_encrypted IS NULL AS missing_email_secret,
       tsc.webhook_secret_encrypted IS NULL AS missing_sms_secret,
       twc.webhook_secret_encrypted IS NULL AS missing_whatsapp_secret
FROM tenants t
LEFT JOIN tenant_email_configs tec ON tec.tenant_id = t.id
LEFT JOIN tenant_sms_configs tsc ON tsc.tenant_id = t.id
LEFT JOIN tenant_whatsapp_configs twc ON twc.tenant_id = t.id;
```

4. Monitoring: alert when `notifications_webhook_received_total{signature_valid="false"}` exceeds 1% of total webhook ingest for any tenant over a 1-hour window — likely a signing-secret mismatch.

**Where to look first when something goes wrong**: `notification_webhook_events` filtered by `tenant_id`, ordered by `received_at DESC`, with `signature_verified=false`. If every recent event for a tenant has `signature_verified=false`, the secret is wrong (or missing). Cross-check against the provider dashboard for the actual signing secret.

**Reference**: `communicationnew/IMPLEMENTATION_LOG.md` Impl 06 (webhooks + signature verification + suppression list).

## DZ-Comms-4: Suppression List Unbounded Growth

**Risk**: `notification_suppression_list` accumulates rows over time. Hard bounces and complaints are permanent until manually cleared (no UI for that yet — V2). For a tenant with high recipient churn, the table can grow to hundreds of thousands of rows, slowing every outbound dispatch (each consults the list) and increasing Postgres storage.
**Location**: `apps/api/src/modules/communications/suppression/suppression-list.service.ts`, `apps/worker/src/processors/communications/suppression-list-cleanup.processor.ts`
**Status**: ACTIVE

The `comms:suppression-list-cleanup` cron runs daily at 03:00 UTC and expires soft-bounce rows older than 30 days. Hard bounces, complaints, manual blocks, and unsubscribes are NEVER auto-expired — they're permanent until cleared via a future admin UI (out of scope V1).

**Failure mode**: a tenant with 10,000 recipients × monthly emails × 2% hard bounce rate over a year = ~2,400 permanent rows. With many channels and several years, a single tenant could exceed 50k rows. The Redis cache (5-minute TTL keyed on `(tenant_id, channel, recipient_address)`) hides most of the perf cost, but cold-cache lookups on a large list are slow.

**Mitigations**:

1. Index `idx_suppression_tenant_channel_expiry` (already created in Impl 01) makes the lookup O(log n) regardless of size.
2. Redis cache hides the perf for hot recipients.
3. Monitoring: alert when any tenant's row count in `notification_suppression_list` exceeds 100,000. Investigation may reveal a mailing list issue (e.g. a corrupt CSV import) rather than expected churn.
4. V2 will ship a manual-clear admin UI; until then, ad hoc SQL is the recovery path.

**Where to look first when something goes wrong**: SQL row count per tenant + per channel. If a single tenant dominates, look at their bounce rate (hint: their sender reputation is probably already damaged — investigate their domain verification status and recent send history).

**Reference**: `communicationnew/IMPLEMENTATION_LOG.md` Impl 06 (suppression list + cleanup cron).

## DZ-Comms-5: WhatsApp Service Window Staleness

**Risk**: If the inbound WhatsApp webhook fails to update `whatsapp_service_windows.last_inbound_at`, outbound free-form sends (which would otherwise be allowed within the 24-hour window) get rejected by Twilio because Twilio's view of the window doesn't match ours.
**Location**: `apps/api/src/modules/communications/whatsapp-templates/whatsapp-service-window.service.ts`, `apps/api/src/modules/communications/webhooks/twilio-webhook-handler.service.ts`
**Status**: ACTIVE

Twilio's WhatsApp Business policy enforces a 24-hour service window from the recipient's last inbound message. Within the window, free-form sends are allowed; outside, only pre-approved templates are. We mirror this state in `whatsapp_service_windows` so the worker can refuse to attempt out-of-window free-form sends without burning a Twilio API call.

**Failure mode**: Twilio sends an inbound webhook → our endpoint fails signature verification (e.g. tenant rotated their auth token without updating the webhook signature) → we return 401 → Twilio retries a few times then drops → our `whatsapp_service_windows` row never updates. The next outbound free-form send checks the table, sees `expires_at < now()`, and refuses with `failure_reason='outside_service_window_no_template'`. Twilio's view says the window is open. The tenant sees "WhatsApp says my window is open but the platform won't send."

**Mitigations**:

1. Webhook signature failures are surfaced via the `notifications_webhook_received_total{signature_valid="false"}` Prometheus counter. Per-tenant elevation is investigated.
2. The `notification_webhook_events` table preserves every event payload; a failed signature can be retroactively replayed once the secret is fixed (operator action).
3. The runbook `comms-webhook-debugging.md` includes a SQL query to find recent inbound WhatsApp webhooks per tenant and verify their signature status.
4. Outbound retry policy: a `failed:outside_service_window_no_template` row can be re-attempted after the next inbound webhook lands — the dispatch service handles this.

**Where to look first when something goes wrong**: Filter `notification_webhook_events` by `tenant_id`, `channel='whatsapp'`, `event_type` matching inbound, `signature_verified=false`. Cross-check against `whatsapp_service_windows.last_inbound_at` — if the timestamp lags real Twilio inbound, signatures aren't being verified.

**Reference**: `communicationnew/IMPLEMENTATION_LOG.md` Impl 08 (WhatsApp templates + 24-hour service window).

## DZ-Comms-6: `.env` Credential Removal Is One-Way (Post Impl 05)

**Risk**: Reverting Impl 05 is the only way to restore the `.env`-fallback dispatch path. After Impl 05, the env vars `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` are removed from env validation — re-adding them does nothing because the providers no longer read them.
**Location**: `apps/api/src/modules/communications/providers/{resend-email,twilio-sms,twilio-whatsapp}.provider.ts`, `apps/api/src/config/env.validation.ts`
**Status**: ACTIVE — by design

Pre-rebuild, every tenant shared the platform's Resend/Twilio credentials read from `.env`. Post-Impl-05, providers read tenant config first; there is no fallback. If a tenant has no config row, the provider returns `{ skipped: true, reason: 'channel_not_configured' }` and the notification is marked `failed:channel_not_configured`.

**Why this is correct**: a `.env` fallback would mean tenants without configs send from the platform's shared credentials, which is exactly the security/deliverability disaster the rebuild eliminates.

**Failure mode**: in a rollback scenario where the user wants to "temporarily fall back to the old single-tenant behaviour," they cannot — the providers won't read env vars even if they're present. The only path to send is to populate tenant config tables (or `git revert` Impl 05 entirely).

**Mitigations**:

1. The completion record for Impl 05 in `IMPLEMENTATION_LOG.md` §5 includes the exact `git revert` SHA + manual env-var restoration steps.
2. The production cutover script (`communicationnew/cutover/production-cutover.sh`) pre-populates tenant config rows for all production tenants before the merge, so the cutover is one atomic step and rollback is a `git revert + restart`, not a config migration.

**Where to look first when something goes wrong**: confirm tenant config rows exist:

```sql
SELECT t.subdomain,
       tec.id IS NOT NULL AS email_configured,
       tsc.id IS NOT NULL AS sms_configured,
       twc.id IS NOT NULL AS whatsapp_configured
FROM tenants t
LEFT JOIN tenant_email_configs tec ON tec.tenant_id = t.id
LEFT JOIN tenant_sms_configs tsc ON tsc.tenant_id = t.id
LEFT JOIN tenant_whatsapp_configs twc ON twc.tenant_id = t.id;
```

Any tenant with `_configured=false` for a channel they expect to use is the cause.

**Reference**: `communicationnew/IMPLEMENTATION_LOG.md` Impl 05 (worker parity + `.env` removal).

---

## i18n hard-error parity gate (added 2026-04-28, Multi-Language Expansion impl 02)

**Location**: `apps/web/i18n/request.ts`, `apps/web/messages/{locale}.json`, `apps/web/src/__tests__/translation-parity.spec.ts`, `scripts/check-i18n.js`
**Status**: ACTIVE once Multi-Language Expansion impl 02 ships (currently scheduled — impl 01 lands the registry + Tier 2 allowlist + schema; impl 02 flips the hard-error flag).

Pre-impl-02, `next-intl` falls back to the message KEY when a translation is missing — pages still render, only with broken-looking text. Post-impl-02, missing keys throw in development and Sentry-then-throw in production, so any unfilled key surfaces as a 500 on the page that consumed it.

**Why this is correct**: the previous silent-fallback behaviour let untranslated strings ship to production unnoticed for months. Hard-error makes parity violations impossible to ignore.

**Failure mode**: any developer who adds a new translation key to `apps/web/messages/en.json` but forgets to mirror it in **every** active locale's message file (`ar.json`, plus any locale flipped to `active: true` in `apps/web/i18n/registry.ts`) will:

- Pass local TypeScript + lint checks (Zod doesn't validate JSON message catalogues).
- Pass the unit test suite (the translation lookup happens at request time, not at compile time).
- Fail the dedicated parity test (`apps/web/src/__tests__/translation-parity.spec.ts`) which is a CI hard gate from impl 02 onward.
- If somehow merged anyway, render 500 on the page that consumes the key in production.

**Mitigations**:

1. CI parity gate runs the parity test on every push (added in impl 02). Any missing key blocks merge.
2. `scripts/check-i18n.js` scans active locales for missing/orphan keys and is wired into the same CI workflow.
3. Tier 2 locales (`it`, `ro`, `pl`) are scoped: parity is enforced only against `apps/web/i18n/tier-scopes.ts → TIER_2_NAMESPACES`. Out-of-scope namespaces fall back to the tenant default locale via the route-level guard (impl 11).
4. Adding a new locale to active is a **two-file commit**: flip `active: true` in `apps/web/i18n/registry.ts` AND add `apps/web/messages/{code}.json` in the same commit. Splitting the change across commits leaves the runtime referencing a missing file — a 500 on every route under that locale.

**Where to look first when something goes wrong**: if Sentry shows a sudden spike of `MISSING_MESSAGE` exceptions, the offending key is in the exception payload — find the file in `apps/web/messages/en.json` that owns that key and propagate to every other active locale. If the spike is on every route, the root cause is almost certainly a locale that was flipped `active: true` without its message file landing.

**Do NOT** "soften" the hard-error to silently fall back to English "for safety". That re-introduces the silent-failure bug class the hard-error was meant to eliminate.

**Reference**: `New Languages/STRATEGY.md`, `New Languages/implementations/02-arabic-cleanup-hard-error-flip.md`.
