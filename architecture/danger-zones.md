# Danger Zones

> **Purpose**: Non-obvious coupling and risks. Before modifying anything listed here, read the full entry.
> **Maintenance**: Add entries when you discover a non-obvious consequence. Remove when the risk is mitigated.
> **Last verified**: 2026-04-02

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

## DZ-02: Prisma-Direct Cross-Module Queries — PARTIALLY MITIGATED

**Risk**: Schema changes breaking modules that aren't visible in the NestJS dependency graph
**Location**: Throughout `apps/api/src/modules/`
**Status**: PARTIALLY MITIGATED (2026-03-30)

**Mitigation applied**: ReportsModule and its 10 analytics services now route ALL cross-module reads through `ReportsDataAccessService` (`reports-data-access.service.ts`). This service centralises reads to 25+ foreign tables in one file with explicit documentation of which tables it touches. DashboardModule imports ReportsModule for this service.

**What remains direct Prisma**: DashboardService (uses RLS transactions for security — intentionally kept), other modules outside reports/dashboard (behaviour, regulatory, etc.) still have direct Prisma reads to foreign tables.

**Rule**: When changing schema for any table listed in `ReportsDataAccessService`, update THAT file. For other modules, still run:

```bash
grep -r "tableName" apps/api/src/ --include="*.ts" -l
```

Do NOT rely solely on the module import graph.

**Tables with highest cross-module read exposure**:

1. `staff_profiles` — 6+ modules read directly (reports module now via data access facade)
2. `students` — 6+ modules read directly (reports module now via data access facade)
3. `classes` / `class_enrolments` — 5+ modules
4. `academic_periods` / `academic_years` — 5+ modules
5. `invoices` / `payments` — 3+ modules
6. `attendance_records` / `attendance_sessions` — 3+ modules

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

## DZ-04: Sequence Type Mismatch

**Risk**: Refund sequence generation fails silently
**Location**: `packages/shared/src/constants/sequence-types.ts` vs `apps/api/src/modules/finance/refunds.service.ts`

The canonical `SEQUENCE_TYPES` constant defines 8 types: receipt, invoice, application, payslip, student, staff, household, payment. But the refunds service calls `SequenceService.nextNumber()` with `'refund'` — a type NOT in the canonical list.

This works because the sequence service doesn't validate against the constant — it just does a `SELECT ... FOR UPDATE` on whatever type string is passed. But if anyone adds validation against `SEQUENCE_TYPES`, refund number generation breaks.

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

## DZ-06: Academic Period Closure Triggers Cron Side Effects

**Risk**: Closing a period causes unexpected automated actions
**Location**: `apps/worker/src/cron/cron-scheduler.service.ts` + gradebook processors

The `report-cards:auto-generate` cron job (daily 03:00 UTC) checks for recently closed academic periods and auto-generates draft report cards. This means:

1. Admin closes an academic period at 14:00
2. Nothing visible happens immediately
3. At 03:00 next day, draft report cards appear for all students in classes within that period
4. If the period was closed accidentally, you now have hundreds of draft report cards to clean up

Similarly, `gradebook:detect-risks` (daily 02:00 UTC) iterates ALL active tenants and creates academic alerts based on grade thresholds.

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

## DZ-09: Encrypted Fields — One-Way Risk

**Risk**: Changing encryption logic makes existing data permanently unreadable
**Location**: `apps/api/src/modules/configuration/encryption.service.ts`

Bank details (staff profiles), Stripe keys (tenant config), and admission payment details are AES-256 encrypted at rest. The encryption key comes from environment variables.

If you:

- Change the encryption algorithm or key derivation
- Rotate the encryption key without re-encrypting existing data
- Modify the IV generation

All existing encrypted fields become unreadable garbage. There is no "decrypt with old key, re-encrypt with new key" migration mechanism built in.

**Rule**: Never modify EncryptionService without a migration plan for existing encrypted data.

---

## DZ-10: Report Card Template sections_json Has 14 Section Types

**Risk**: Adding/modifying section types breaks existing templates
**Location**: `packages/shared/src/schemas/gradebook.schema.ts` -> `templateSectionConfigSchema`

Report card templates store their layout in `sections_json` with 14 discriminated section types. Each type has its own `config` shape. Existing templates in the database reference these types by string key.

If you rename or remove a section type, existing templates become invalid and report card PDF generation will fail for those templates.

**Rule**: Section types are append-only. Deprecate by adding `deprecated: true` to the type, never remove.

---

## DZ-11: Audit Log Interceptor Is Global and Synchronous

**Risk**: Performance degradation on high-frequency mutation endpoints
**Location**: `apps/api/src/common/interceptors/audit-log.interceptor.ts`

The AuditLogInterceptor is registered as `APP_INTERCEPTOR` on every POST/PUT/PATCH/DELETE. It logs the request body, response, and user context to the database synchronously (within the request lifecycle).

For bulk operations (mass grade entry, batch invoice generation, import processing), this creates one audit log row per mutation request. A batch of 500 grade entries = 500 audit log rows, each requiring a database write within the request.

**Consideration**: For future high-volume endpoints, consider async audit logging via BullMQ.

---

## DZ-12: Household Reference Generation Uses Random Collision Checking

**Risk**: Under very high concurrent registration, reference collisions could exhaust retries
**Location**: `apps/api/src/modules/tenants/sequence.service.ts` -> `generateHouseholdReference()`

Unlike other sequences (receipt, invoice, etc.) which use `SELECT ... FOR UPDATE` row-level locking, household references are generated as random `XXX999-9` format with collision checking (max 10 attempts).

At high tenant scale with many concurrent registrations, the collision probability increases. The 10-retry limit could be exhausted.

**Probability**: Very low for current scale. Monitor if a tenant exceeds ~10,000 households.

---

## DZ-13: Behaviour Status Projection Leaks Safeguarding Info If Missed

**Risk**: Non-safeguarding users discovering that a student has a safeguarding concern
**Location**: `apps/api/src/modules/behaviour/behaviour.service.ts`, search indexing, exports, parent portal

When an incident is `converted_to_safeguarding`, it must appear as `closed` to ALL users without `safeguarding.view` permission. This projection must be applied at EVERY surface:

1. API list responses (`listIncidents`) — ✅ implemented
2. API detail responses (`getIncident`) — ✅ implemented
3. Search indexing — must index as `closed`, not `converted_to_safeguarding`
4. PDF exports / reports — must show `closed`
5. Parent portal / parent notifications — must show `closed`
6. Entity history rendering — must not reveal the safeguarding status
7. Hover cards / previews — must show `closed`

**Mitigation**: Every new surface that renders incident status MUST call `projectIncidentStatus()` from `packages/shared/src/behaviour/state-machine.ts`. Add a code review checklist item for this.

---

## DZ-14: Behaviour Parent Description Send-Gate Silently Blocks Notifications

**Risk**: Parents never notified about a negative incident because staff didn't add a parent-safe description
**Location**: `apps/worker/src/processors/behaviour/parent-notification.processor.ts`

For negative incidents with `severity >= parent_notification_send_gate_severity` (default 3), the parent notification is BLOCKED unless `parent_description` is set, a template was used, or `parent_description` is explicitly empty string. If blocked, the incident stays at `parent_notification_status = 'pending'` indefinitely with no UI alert to staff.

**Mitigation**: Phase F should add an alert rule that detects incidents stuck in `pending` notification status for >24 hours. Until then, this is a silent failure mode.

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

## DZ-17: Appeal Decision Cascades Across 6 Tables in One Transaction

**Risk**: Transaction timeout or partial failure corrupting cross-entity state
**Location**: `apps/api/src/modules/behaviour/behaviour-appeals.service.ts` → `decide()`

When an appeal decision is recorded, the `decide()` method operates on up to 6 tables in a single interactive Prisma transaction:

1. `behaviour_appeals` — update decision fields
2. `behaviour_sanctions` — transition status (appealed → scheduled/cancelled/replaced)
3. `behaviour_incidents` — transition status (→ closed_after_appeal for overturned)
4. `behaviour_exclusion_cases` — transition status (→ overturned) if linked
5. `behaviour_amendment_notices` — create correction records if parent-visible fields changed
6. `behaviour_entity_history` — create audit entries for every changed entity

A `modified` decision is the worst case: it applies field-level amendments to both incident and sanction, creates a replacement sanction, creates amendment notices, and enqueues notifications — all atomically.

**Mitigation**: If this transaction starts timing out, the first lever is to move notification enqueuing outside the transaction (currently inside with try/catch). The second lever is to move amendment notice creation to an async job triggered after the decision is committed.

---

## DZ-18: Legal Hold Cascading on Exclusion Cases and Appeals

**Risk**: Legal holds prevent GDPR anonymisation from completing
**Location**: `behaviour-exclusion-cases.service.ts`, `behaviour-appeals.service.ts`

Both exclusion case creation and appeal submission automatically set `behaviour_legal_holds` on the linked incident, sanction, and all related entities. These holds prevent the GDPR retention/anonymisation module (Phase H) from processing those records. If a school creates many exclusion cases or appeals, the legal hold backlog can grow silently.

**Mitigation**: Phase H's GDPR module must check for legal holds before anonymisation and surface them in the admin dashboard. Legal holds should be released when: (1) appeal is decided and no exclusion case remains open, (2) exclusion case is finalised/overturned.

---

## DZ-19: Document Generation Runs Puppeteer Inside API Transaction — RESOLVED

**Risk**: ~~Puppeteer PDF rendering is slow (1-5s) and runs inside an interactive Prisma transaction, holding a DB connection. Under concurrency this can exhaust the connection pool or hit transaction timeouts.~~
**Location**: `behaviour-document.service.ts` -> `generateDocument()` and `autoGenerateDocument()`
**Status**: RESOLVED (2026-04-02, reliability hardening R-14)

Resolved in reliability hardening. PDF rendering now enqueued via BullMQ with `generating` -> `draft_doc` callback pattern. The API transaction creates a document record with `status: 'generating'` and enqueues the PDF render job. `PdfRenderProcessor` handles rendering and S3 upload outside any DB transaction, then dispatches `behaviour:document-ready` which transitions the document to `draft_doc`.

**Remaining note**: See DZ-37 for the new `generating` status contract that callers must respect.

---

## DZ-20: Amendment Correction Chain Touches 5 Tables in sendCorrection

**Risk**: The amendment correction dispatch creates ack rows, notifications, updates amendment notice flags, and supersedes documents — all within one transaction.
**Location**: `behaviour-amendments.service.ts` -> `sendCorrection()`

When a correction is sent, the method: (1) resolves student/incident/sanction IDs, (2) creates `behaviour_parent_acknowledgements` rows per parent, (3) creates `notification` rows per parent, (4) updates `behaviour_amendment_notices.correction_notification_sent`, (5) supersedes any sent `behaviour_documents`. If many parents are linked (e.g., divorced/remarried households with 4+ guardians), the transaction can be slow.

**Mitigation**: Monitor transaction durations. If timeouts occur, split into: (a) flag update + document supersession in transaction, (b) parent notifications enqueued to worker.

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
**Location**: `apps/worker/src/processors/behaviour/break-glass-expiry.processor.ts`

**Status**: RESOLVED in Batch 3 (issue #3.3). `behaviour:break-glass-expiry` is now dispatched daily at 00:00 UTC via `BehaviourCronDispatchProcessor.dispatchDaily()`. Uses `jobId: daily:behaviour:break-glass-expiry:{tenant_id}` for per-tenant dedup. Processor was previously also dispatched from `dispatchSla()` (every 5 min) without dedup — that unnecessary dispatch has been removed.

---

## DZ-24: Check-Awards Concurrent Duplicate

**Risk**: Duplicate awards when multiple positive incidents for the same student are processed concurrently
**Location**: `apps/worker/src/processors/behaviour/check-awards.processor.ts`

The `BehaviourCheckAwardsJob` dedup guard (line ~166) only checks for an existing award with the same `triggered_by_incident_id` + `award_type_id` + `student_id` combination. It does NOT check for a global "award already exists for this student + award type in this period" before creating.

Race scenario: two incidents for the same student are logged seconds apart. Both are enqueued as `behaviour:check-awards` jobs. Both jobs compute `totalPoints >= threshold` and both pass the dedup guard (different `incident_id`). Both create the same award type for the same student.

The `checkRepeatEligibility()` method (line ~339) mitigates this for `once_ever` and `once_per_year` repeat modes — but only if the first job's transaction commits before the second job reads. Under true concurrency with `unlimited` repeat mode, duplicates are possible.

**Mitigation**: Use `once_per_year` or `once_ever` repeat modes for high-value awards (gold stars, certificates). The `unlimited` repeat mode should only be used for low-stakes awards where duplicates are acceptable. For strict dedup, add a unique partial index on `(tenant_id, student_id, award_type_id, academic_year_id)` for `once_per_year` types.

---

## DZ-25: SLA Threshold Changes Are Not Retroactive

**Risk**: Relaxing SLA thresholds does not relieve existing safeguarding concerns that have already breached
**Location**: `apps/worker/src/processors/behaviour/sla-check.processor.ts`, `apps/api/src/modules/behaviour/safeguarding.service.ts`

The SLA check processor queries `sla_first_response_due < now()` to detect breaches. The `sla_first_response_due` timestamp is set at concern creation time based on the tenant's configured SLA threshold at that moment. If a tenant later relaxes the SLA (e.g., from 1 hour to 4 hours):

1. Existing concerns that already breached under the old threshold remain breached
2. Breach tasks already created are not auto-resolved
3. The `sla_first_response_due` column on existing concerns is not recalculated

This is **intentional design** — retroactive SLA relaxation could mask genuine failures to respond. Once a breach is recorded, it must be addressed, not quietly forgiven by config change.

**Status**: BY DESIGN — no fix needed. Document for support teams: if a tenant asks why breach alerts persist after relaxing SLA settings, the answer is that existing concerns are unaffected. Only new concerns use the updated SLA threshold.

---

## DZ-26: Critical Escalation Self-Chaining With Re-Enqueue

**Risk**: Originally a single-step problem — escalation fired once and stopped. Now MITIGATED.
**Location**: `apps/worker/src/processors/behaviour/critical-escalation.processor.ts`

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

## DZ-27: survey_responses Has No tenant_id and No RLS

**Risk**: Cross-tenant response leakage if queried without survey join
**Location**: `packages/prisma/schema.prisma` — `SurveyResponse` model, `apps/api/src/modules/staff-wellbeing/`
**Severity**: CRITICAL

The `survey_responses` table is the ONLY table in the entire codebase that intentionally has NO `tenant_id` column and NO RLS policy. This is an anonymity-by-architecture decision for the Staff Wellbeing module — survey responses must not be traceable to any user.

**What makes this dangerous:**

- A direct query against `survey_responses` without joining through `staff_surveys` will return responses from ALL tenants
- There is no database-layer protection — tenant isolation is enforced purely at the application layer
- Only `StaffWellbeingSurveyService` may query this table — no other service, no raw queries

**Also absent from this table (by design):**

- No `user_id` or `staff_profile_id` — no link to any person
- No `session_id` or `ip_address` — no network traceability
- No `created_at` TIMESTAMPTZ — only `submitted_date DATE` to prevent timing inference
- No foreign key to ANY user-related table

**Mitigation:**

- All queries MUST join through `staff_surveys.tenant_id` to enforce tenant isolation
- Only the wellbeing survey service may access this table
- Integration tests (Phase G) specifically verify no API path can return responses from another tenant's surveys
- The `survey_participation_tokens` table follows the same pattern (no tenant_id, no RLS) — same mitigations apply

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

There is also a Jest-only bypass (`NODE_ENV === 'test' || JEST_WORKER_ID`) so legacy suites are not globally bricked by the new guard. Tests that need real guard behaviour must explicitly unset those env vars inside the spec.

**Mitigation**: Treat guard allowlist edits as cross-cutting changes. When adding tenant-scoped endpoints used during onboarding or legal recovery, verify they remain reachable before DPA acceptance. When writing guard-specific tests, temporarily disable the test env bypass inside the test process.

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

## DZ-33: Homework — Cross-Module Cron Dispatch

**Risk**: Silent job cessation if cron scheduler configuration changes or homework queue name is modified
**Location**: `apps/worker/src/cron/cron-scheduler.service.ts`, `apps/worker/src/base/queue.constants.ts`

The `homework:digest-homework` and `homework:completion-reminder` jobs are per-tenant jobs dispatched from the cross-tenant cron scheduler. If the cron scheduler configuration changes or the homework queue name is modified, these jobs will silently stop running. There is no health check to detect missing cron registrations.

**Mitigation**: Verify all 4 homework cron jobs appear in the BullMQ dashboard after each deploy. The `registerHomeworkCronJobs()` method in `CronSchedulerService` is the single source of truth for cron registration.

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

**Mitigation**: Treat bootstrap-readable RLS policies as an auth contract, not just schema boilerplate. Any change to `tenant_domains`, `tenant_memberships`, `membership_roles`, `roles`, or `role_permissions` policies must be regression-tested with real login, `/auth/me`, permission-cache refresh, and hostname-based tenant resolution.
