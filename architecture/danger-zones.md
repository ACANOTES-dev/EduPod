# Danger Zones

> **Purpose**: Non-obvious coupling and risks. Before modifying anything listed here, read the full entry.
> **Maintenance**: Add entries when you discover a non-obvious consequence. Remove when the risk is mitigated.
> **Last verified**: 2026-03-26

---

## DZ-01: Invoice Status Machine Has No Single Transition Map

**Risk**: Bugs from invalid transitions, inconsistent validation
**Location**: `apps/api/src/modules/finance/invoices.service.ts`

The invoice lifecycle is the most complex state machine in the codebase (9 states, multiple paths) but unlike StudentStatus or AssessmentStatus, it has NO single `VALID_TRANSITIONS` map. Transition validation is scattered across individual methods:
- `issue()` checks `draft` or `pending_approval`
- `void()` checks `issued` or `overdue`
- Payment posting implicitly transitions `issued -> partially_paid -> paid`
- Overdue detection cron transitions `issued -> overdue`

Three of the transitions happen OUTSIDE the invoice service (in the worker or payment service). Any refactor that moves invoice status logic must account for all entry points.

**Mitigation**: Consider extracting a `VALID_TRANSITIONS` map like students/enrolments have.

---

## DZ-02: Prisma-Direct Cross-Module Queries

**Risk**: Schema changes breaking modules that aren't visible in the NestJS dependency graph
**Location**: Throughout `apps/api/src/modules/`

The ReportsModule, DashboardModule, and several other modules query tables they don't "own" directly via PrismaService. NestJS module imports won't show these dependencies. Example: ReportsModule has 15 services that query attendance, grades, admissions, demographics, staff data — but imports ZERO other modules.

**Rule**: When changing any table schema, always run:
```bash
grep -r "tableName" apps/api/src/ --include="*.ts" -l
```
Do NOT rely solely on the module import graph.

**Tables with highest cross-module read exposure**:
1. `staff_profiles` — 6+ modules read directly
2. `students` — 6+ modules read directly
3. `classes` / `class_enrolments` — 5+ modules
4. `academic_periods` / `academic_years` — 5+ modules
5. `invoices` / `payments` — 3+ modules
6. `attendance_records` / `attendance_sessions` — 3+ modules

---

## DZ-03: Approval Callback Chain is Fire-and-Forget

**Risk**: Approved items that never execute their domain action
**Location**: `apps/api/src/modules/approvals/approval-requests.service.ts` -> worker processors

When a user approves a request, the approval is immediately marked `approved` and a BullMQ job is enqueued. If the worker processor fails:
- The approval shows as `approved` in the UI
- But the domain action (publish announcement / issue invoice / finalise payroll) never happened
- There is no automatic reconciliation

**Impact scenarios**:
- Announcement approved but never published — users wonder why it's not visible
- Invoice approved but never issued — finance reports show wrong totals
- Payroll approved but payslips never generated — staff not paid

**Mitigation**: Consider adding a reconciliation check that detects `approved` requests without corresponding `executed` status after a timeout.

---

## DZ-04: Sequence Type Mismatch

**Risk**: Refund sequence generation fails silently
**Location**: `packages/shared/src/constants/sequence-types.ts` vs `apps/api/src/modules/finance/refunds.service.ts`

The canonical `SEQUENCE_TYPES` constant defines 8 types: receipt, invoice, application, payslip, student, staff, household, payment. But the refunds service calls `SequenceService.nextNumber()` with `'refund'` — a type NOT in the canonical list.

This works because the sequence service doesn't validate against the constant — it just does a `SELECT ... FOR UPDATE` on whatever type string is passed. But if anyone adds validation against `SEQUENCE_TYPES`, refund number generation breaks.

---

## DZ-05: TenantSettings JSONB Is a God Object

**Risk**: Settings schema changes require migrating ALL tenants' stored data
**Location**: `packages/shared/src/schemas/tenant.schema.ts` -> `tenantSettingsSchema`

The `tenant_settings.settings` JSONB field contains configuration for attendance, gradebook, admissions, finance, communications, payroll, general, scheduling, approvals, compliance, and AI — everything in one bag.

Adding a new required field means every existing tenant's stored JSON is now invalid against the schema. The schema uses `.optional()` / `.default()` extensively to handle this, but:
- If you add a required field without a default, all existing tenants break on next settings read
- If you rename a field, existing values are silently lost
- There is no migration mechanism for JSONB — unlike Prisma migrations for columns

**Rule**: Every new settings field MUST have a `.default()` value. Never rename a field — deprecate and add a new one.

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
