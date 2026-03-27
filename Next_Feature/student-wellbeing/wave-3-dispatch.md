# Wave 3 Dispatch — SW-1C + SW-1D + SW-1E (16 Parallel Agents)

## Paste this into a new Claude Code session

---

Execute Wave 3 of the Student Wellbeing module: sub-phases SW-1C, SW-1D, and SW-1E simultaneously using 16 parallel Opus 4.6 agents.

## Project Context

This is EduPod — a multi-tenant school management SaaS. Read `CLAUDE.md` for full conventions. The Student Wellbeing module is being built in 13 sub-phases. The master spec is at `Next_Feature/student-wellbeing/master-spec.md`.

## What's Already Built

**SW-1A (Infrastructure):** 20 database tables with RLS, 14 enums, immutability triggers on 4 append-only tables, `app.current_user_id` in RLS middleware (optional, sentinel default), 18 permissions, 17 Zod schema files, 5 NestJS module shells, 6 worker processor stubs. All tables, RLS policies, and triggers exist. `ChildProtectionModule` already registered in `app.module.ts` as empty shell.

**SW-1B (Concerns):** `ConcernService` (8 methods), `ConcernVersionService` (3 methods), `PastoralEventService` (3 methods — the immutable audit writer), `ConcernsController` (11 endpoints). 36 tests passing. Key patterns: `createRlsClient(prisma, { tenant_id, user_id })` for RLS, `void this.eventService.write(...)` for fire-and-forget audit events, author masking as DTO transformation, category validation against tenant settings JSONB.

**Progress log:** `Next_Feature/student-wellbeing/implementation-progress.md`
**SW-1A results:** `Plans/phases-results/SW-1A-results.md`

## Specs to Read

Each agent MUST read its sub-phase spec before implementing:
- SW-1C: `Next_Feature/student-wellbeing/phase-sw-1c-child-protection.md` (950 lines)
- SW-1D: `Next_Feature/student-wellbeing/phase-sw-1d-cases.md` (842 lines)
- SW-1E: `Next_Feature/student-wellbeing/phase-sw-1e-notifications.md` (815 lines)

## Rules

1. **ALL 16 agents must be Opus 4.6** — set `model: "opus"` on every Agent invocation. Sonnet is rejected.
2. **Strict file ownership** — no two agents write to the same file. The orchestrator handles module wiring after all agents complete.
3. **You (the orchestrator) do NOT write implementation code** — you dispatch, collect, wire module files, verify, and commit.
4. Each agent also reads: `CLAUDE.md`, `.claude/rules/code-quality.md`, `.claude/rules/backend.md`, `.claude/rules/testing.md`
5. Existing service patterns to reference: `apps/api/src/modules/behaviour/behaviour.service.ts` (first 100 lines), `apps/api/src/modules/pastoral/services/concern.service.ts`, `apps/api/src/modules/pastoral/services/pastoral-event.service.ts`
6. **After all 16 agents return:** you wire `pastoral.module.ts` (add case services, notification service, chronology service, masking interceptor) and `child-protection.module.ts` (add all CP services, controllers, guard). Then run `turbo type-check`, `turbo lint`, fix issues, run tests, commit, push.
7. SSH access is granted for production verification. Follow server rules in CLAUDE.md.
8. Commit message: `feat(pastoral): SW-1C+1D+1E — child protection, cases, notifications`

---

## The 16 Agents

### SW-1C: Child Protection Fortress (7 agents)

**C1: Shared Schemas**
- Refine `packages/shared/src/pastoral/schemas/cp-record.schema.ts`, `cp-access.schema.ts`, `export.schema.ts`
- Create `packages/shared/src/pastoral/schemas/mandated-report.schema.ts` if missing
- Update `packages/shared/src/pastoral/schemas/index.ts` barrel
- Files owned: only `packages/shared/src/pastoral/schemas/cp-*.ts`, `mandated-report.schema.ts`, `export.schema.ts`, `index.ts`

**C2: CpAccessGuard + CpAccessService + controller + tests**
- `apps/api/src/modules/child-protection/guards/cp-access.guard.ts` — checks `cp_access_grants` for current user. Returns 404 (NOT 403) for zero-discoverability. Indistinguishable from "not found".
- `apps/api/src/modules/child-protection/services/cp-access.service.ts` — grant (creates cp_access_grants row + audit event), revoke (sets revoked_at + audit event), list active grants, check access. Self-revocation blocked.
- `apps/api/src/modules/child-protection/controllers/cp-access.controller.ts` — 4 endpoints: POST grant, DELETE revoke, GET list, GET check. Permission: `pastoral.manage_cp_access` for grant/revoke/list, `AuthGuard` only for check.
- `apps/api/src/modules/child-protection/guards/cp-access.guard.spec.ts`
- `apps/api/src/modules/child-protection/services/cp-access.service.spec.ts`
- `apps/api/src/modules/child-protection/controllers/cp-access.controller.spec.ts`
- Files owned: `guards/cp-access.guard.ts`, `guards/cp-access.guard.spec.ts`, `services/cp-access.service.ts`, `services/cp-access.service.spec.ts`, `controllers/cp-access.controller.ts`, `controllers/cp-access.controller.spec.ts`

**C3: CpRecordService + controller + tests**
- `apps/api/src/modules/child-protection/services/cp-record.service.ts` — CRUD for `cp_records`. Uses own transaction with BOTH `tenant_id` AND `user_id` in RLS context. Every read logs `cp_record_accessed` audit event. Linked to tier=3 pastoral_concern.
- `apps/api/src/modules/child-protection/controllers/cp-records.controller.ts` — 4 endpoints (POST create, GET list, GET detail, PATCH update). All guarded by `CpAccessGuard`.
- `apps/api/src/modules/child-protection/services/cp-record.service.spec.ts`
- `apps/api/src/modules/child-protection/controllers/cp-records.controller.spec.ts`
- Files owned: `services/cp-record.service.ts`, `services/cp-record.service.spec.ts`, `controllers/cp-records.controller.ts`, `controllers/cp-records.controller.spec.ts`

**C4: MandatedReportService + tests**
- `apps/api/src/modules/child-protection/services/mandated-report.service.ts` — 4-state lifecycle (draft → submitted → acknowledged → outcome_received). Tusla reference tracking. Each transition → audit event.
- `apps/api/src/modules/child-protection/services/mandated-report.service.spec.ts`
- Files owned: `services/mandated-report.service.ts`, `services/mandated-report.service.spec.ts`

**C5: CpExportService + PDF templates + tests**
- `apps/api/src/modules/child-protection/services/cp-export.service.ts` — purpose selection (from controlled list), confirmation step, PDF generation via existing PdfRenderingService, watermarking (visual on every page + metadata), one-time-use download tokens via Redis (15min expiry), export audit events.
- `apps/api/src/modules/child-protection/services/cp-export.service.spec.ts`
- `apps/api/src/modules/child-protection/controllers/cp-export.controller.ts` — 3 endpoints: POST preview, POST confirm/generate, GET download (token-based).
- `apps/api/src/modules/child-protection/controllers/cp-export.controller.spec.ts`
- Files owned: `services/cp-export.service.ts`, `services/cp-export.service.spec.ts`, `controllers/cp-export.controller.ts`, `controllers/cp-export.controller.spec.ts`

**C6: Constants + module wiring placeholder**
- `apps/api/src/modules/child-protection/child-protection.constants.ts` — export purpose enum, mandated report statuses, CP record types
- Does NOT touch `child-protection.module.ts` — the orchestrator does that
- Files owned: `child-protection.constants.ts` only

**C7: RLS integration tests**
- `apps/api/test/child-protection-rls.spec.ts` — zero-discoverability tests, cross-tenant CP isolation, guard returns 404 not 403, DLP access grants enable CP record visibility, sentinel user cannot access CP records. The security verification suite.
- Files owned: `apps/api/test/child-protection-rls.spec.ts` only

### SW-1D: Cases & Student Chronology (5 agents)

**D1: Shared Schemas + State Machine**
- Refine `packages/shared/src/pastoral/schemas/case.schema.ts` — createCase (requires concern_ids[]), updateCase, caseStatusTransition (with reason), caseOwnershipTransfer, linkConcernToCase, addStudentToCase, caseFilters
- Create `packages/shared/src/pastoral/case-state-machine.ts` — transition map, `isValidCaseTransition(from, to): boolean`, valid transitions: open→active, active→monitoring/resolved, monitoring→active/resolved, resolved→closed, closed→open (reopen)
- Update barrel exports
- Files owned: `packages/shared/src/pastoral/schemas/case.schema.ts`, `packages/shared/src/pastoral/case-state-machine.ts`, `packages/shared/src/pastoral/index.ts` (add case-state-machine export ONLY)

**D2: CaseService + controller**
- `apps/api/src/modules/pastoral/services/case.service.ts` — create (requires min 1 concern_id, generates case_number via SequenceService with prefix 'PC'), lifecycle transitions (uses state machine from shared), ownership transfer, concern linking/unlinking (cannot unlink last concern), multi-student support, case tier auto-calculation (highest tier among linked concerns), orphan case detection query.
- `apps/api/src/modules/pastoral/controllers/cases.controller.ts` — ~12 endpoints: POST create, GET list, GET detail, PATCH update, POST transition, POST transfer-ownership, POST link-concern, DELETE unlink-concern, POST add-student, DELETE remove-student, GET my-cases, GET orphans. Permission: `pastoral.manage_cases`.
- Files owned: `services/case.service.ts`, `controllers/cases.controller.ts`

**D3: Student Chronology Service**
- `apps/api/src/modules/pastoral/services/student-chronology.service.ts` — single method that returns the complete pastoral timeline for a student. Merges concerns (with version history), case events, intervention milestones, referral milestones, parent contacts. For DLP users: includes CP records (via separate query to cp_records using user_id RLS). Returns events in reverse chronological order, paginated. This is the "Tusla calls" view.
- Files owned: `services/student-chronology.service.ts`

**D4: Author Masking Interceptor**
- `apps/api/src/modules/pastoral/interceptors/author-masking.interceptor.ts` — NestJS response interceptor. Applies masking rules: if `author_masked = true` and viewer does NOT have active `cp_access_grants`, replace author info with "Author masked". DLP always sees real author. Parents never see author. Recursively transforms response DTOs. Applied to ConcernsController and CasesController.
- Files owned: `interceptors/author-masking.interceptor.ts`

**D5: All tests (case service + chronology + masking + E2E)**
- `apps/api/src/modules/pastoral/services/case.service.spec.ts` — state machine transitions (all 7 valid + blocked invalid), case creation with concern linking, orphan detection, multi-student, case number sequence, ownership transfer audit events
- `apps/api/src/modules/pastoral/services/student-chronology.service.spec.ts` — timeline merge correctness, pagination, DLP vs non-DLP view, tier 3 invisible to non-DLP
- `apps/api/src/modules/pastoral/interceptors/author-masking.interceptor.spec.ts` — masking rules table from master spec, DLP bypass, parent never sees author
- `apps/api/test/pastoral-cases.e2e-spec.ts` — RLS leakage for cases, permission enforcement
- Files owned: all 4 spec files above

### SW-1E: Tiered Notifications (4 agents)

**E1: PastoralNotificationService**
- `apps/api/src/modules/pastoral/services/pastoral-notification.service.ts` — tiered dispatch based on concern severity. Routine: in-app only. Elevated: in-app + email to year head/pastoral coordinator. Urgent: in-app + email + push to DLP/deputy principal. Critical: all channels including WhatsApp to DLP/principal. Recipient resolution reads from `tenant_settings.pastoral.notification_recipients` with role-based fallback defaults. Concern author excluded from recipients. Integrates with existing `NotificationDispatchService` from communications module.
- Files owned: `services/pastoral-notification.service.ts`

**E2: Escalation Timeout Processor**
- `apps/worker/src/processors/pastoral/escalation-timeout.processor.ts` — replace the empty stub from SW-1A. Delayed BullMQ job that fires after configurable timeout. Checks if concern was acknowledged. If not: auto-escalates urgent→critical (updates concern severity, writes `concern_auto_escalated` event, dispatches critical-level notifications). For unacknowledged critical: writes `critical_concern_unacknowledged` event, sends second notification round to principal. Deterministic job IDs (`pastoral:escalation:{tenantId}:{concernId}:{type}`) for cancellation.
- `apps/worker/src/processors/pastoral/notify-concern.processor.ts` — replace the empty stub. Dispatches notifications via PastoralNotificationService pattern (or directly via existing communications infrastructure in the worker context).
- Files owned: `apps/worker/src/processors/pastoral/escalation-timeout.processor.ts`, `apps/worker/src/processors/pastoral/notify-concern.processor.ts`

**E3: Acknowledgement + ConcernService Integration**
- Modify `apps/api/src/modules/pastoral/services/concern.service.ts` — add logic to `create()` to enqueue `pastoral:notify-concern` BullMQ job after concern creation. Add logic to `getById()` acknowledgement path to cancel pending escalation timeout jobs via deterministic job ID removal. Import and inject the BullMQ queue.
- IMPORTANT: This agent modifies an existing file from SW-1B. It must read the current file first, make minimal additions (2-3 new method calls), and not restructure existing code.
- Files owned: `services/concern.service.ts` (MODIFY ONLY — add notification dispatch + escalation job cancellation)

**E4: All tests**
- `apps/api/src/modules/pastoral/services/pastoral-notification.service.spec.ts` — dispatch by severity (4 tests, one per level), recipient resolution from tenant settings, fallback to role defaults, author excluded from recipients, deduplication
- `apps/worker/src/processors/pastoral/escalation-timeout.processor.spec.ts` — timeout fires and escalates, acknowledged concern cancels escalation, second-round notification for unacknowledged critical, chain terminates after second round
- `apps/api/test/pastoral-notifications.e2e-spec.ts` — integration test for the full flow (create concern → notification dispatched → acknowledgement → escalation cancelled)
- Files owned: all 3 spec files above

---

## Orchestrator Responsibilities (after all 16 return)

1. **Wire `child-protection.module.ts`:** Add imports (AuthModule, PastoralModule, TenantsModule, PdfRenderingModule, RedisModule), controllers (CpRecordsController, CpAccessController, CpExportController), providers (CpRecordService, CpAccessService, CpExportService, MandatedReportService, CpAccessGuard), exports (CpRecordService, CpAccessService).

2. **Wire `pastoral.module.ts`:** Add CaseService, StudentChronologyService, PastoralNotificationService to providers/exports. Add CasesController to controllers. Add AuthorMaskingInterceptor to providers. Import ChildProtectionModule (for CpAccessService needed by chronology). Import TenantsModule (for SequenceService).

3. **Run verification:** `turbo type-check`, `turbo lint`, fix any integration issues (missing imports, type mismatches between agents). Run `turbo test` — all new + existing tests must pass.

4. **Commit:** `feat(pastoral): SW-1C+1D+1E — child protection fortress, cases & chronology, tiered notifications`

5. **Update progress log:** Mark SW-1C, SW-1D, SW-1E as completed in `Next_Feature/student-wellbeing/implementation-progress.md`. Write handover summaries for each.

6. **Push and monitor CI.** Iterate until green.

---

## File Ownership Matrix (verify no overlaps)

| File | Agent |
|------|-------|
| `packages/shared/src/pastoral/schemas/cp-*.ts, mandated-report.schema.ts, export.schema.ts` | C1 |
| `child-protection/guards/cp-access.guard*` | C2 |
| `child-protection/services/cp-access.service*` | C2 |
| `child-protection/controllers/cp-access.controller*` | C2 |
| `child-protection/services/cp-record.service*` | C3 |
| `child-protection/controllers/cp-records.controller*` | C3 |
| `child-protection/services/mandated-report.service*` | C4 |
| `child-protection/services/cp-export.service*` | C5 |
| `child-protection/controllers/cp-export.controller*` | C5 |
| `child-protection/child-protection.constants.ts` | C6 |
| `apps/api/test/child-protection-rls.spec.ts` | C7 |
| `packages/shared/src/pastoral/schemas/case.schema.ts` | D1 |
| `packages/shared/src/pastoral/case-state-machine.ts` | D1 |
| `pastoral/services/case.service.ts` | D2 |
| `pastoral/controllers/cases.controller.ts` | D2 |
| `pastoral/services/student-chronology.service.ts` | D3 |
| `pastoral/interceptors/author-masking.interceptor.ts` | D4 |
| `pastoral/services/case.service.spec.ts` | D5 |
| `pastoral/services/student-chronology.service.spec.ts` | D5 |
| `pastoral/interceptors/author-masking.interceptor.spec.ts` | D5 |
| `apps/api/test/pastoral-cases.e2e-spec.ts` | D5 |
| `pastoral/services/pastoral-notification.service.ts` | E1 |
| `apps/worker/src/processors/pastoral/escalation-timeout.processor.ts` | E2 |
| `apps/worker/src/processors/pastoral/notify-concern.processor.ts` | E2 |
| `pastoral/services/concern.service.ts` | E3 (MODIFY) |
| `pastoral/services/pastoral-notification.service.spec.ts` | E4 |
| `apps/worker/.../escalation-timeout.processor.spec.ts` | E4 |
| `apps/api/test/pastoral-notifications.e2e-spec.ts` | E4 |
| `child-protection/child-protection.module.ts` | **ORCHESTRATOR** |
| `pastoral/pastoral.module.ts` | **ORCHESTRATOR** |

Zero overlaps confirmed. E3 is the only agent modifying an existing file (concern.service.ts).

---

Now dispatch all 16 agents and begin.
