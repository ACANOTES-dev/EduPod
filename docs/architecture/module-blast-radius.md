# Module Blast Radius Map

> **Purpose**: Before modifying a module's public API, shared table contract, or exported service, check here to see what else breaks.
> **Maintenance**: Update when adding module exports, changing shared service interfaces, or introducing new cross-module reads/writes.
> **Last verified**: 2026-04-21 (wellbeing rebuild — Impl 24 Wave 7 sign-off)

---

## How to read this

Each entry lists:

- **Contract**: the service, facade, or table boundary other code depends on
- **Primary consumers**: the modules or workers most likely to break first
- **Blast radius**: how wide the impact is if the contract changes
- **Notes**: the non-obvious coupling to re-check before shipping

If a module is not listed individually, it is either:

- isolated enough to change locally, or
- represented through a higher-level shared contract such as a read facade, queue payload, or shared schema

---

## Current Topology

- The live API surface is wired through `AppModule` plus feature sub-modules under [apps/api/src/modules](/Users/ram/Desktop/SDB/apps/api/src/modules).
- The API-side cross-module read contract is now centered on `ReadFacadesModule` and the `31` `*-read.facade.ts` files under [apps/api/src/modules](/Users/ram/Desktop/SDB/apps/api/src/modules).
- The worker remains a separate dependency graph. Processor contracts are driven by queue names, job payloads, shared schemas, and direct table access through raw `PrismaClient`.
- The NestJS import graph is no longer the whole story. A change can be safe in Nest terms and still break workers, reports, analytics, or scheduled jobs if it changes shared tables, enums, or queue payloads.

---

## Tier 1 — Global Infrastructure

### PrismaService + request-scoped RLS context

- **Contract**: `PrismaService`, `createRlsClient()`, request context propagation, bootstrap RLS policies
- **Primary consumers**: effectively every API module; every worker processor through raw Prisma; auth bootstrap; tenant resolution
- **Blast radius**: CRITICAL
- **Notes**: changes here can break tenant isolation, plain Prisma reads, interactive transactions, worker jobs, and login/bootstrap flows simultaneously

### RedisService

- **Contract**: Redis connection, key naming, TTL behavior, queue support services
- **Primary consumers**: auth/session flows, permission cache, notifications unread counts, workload caches, assorted throttles and feature caches
- **Blast radius**: CRITICAL
- **Notes**: Redis changes affect both API behavior and BullMQ queue health

### PermissionCacheService (CommonModule)

- **Contract**: permission resolution cache invalidation
- **Primary consumers**: global `PermissionGuard`, RBAC mutations, membership/role changes, impersonation-sensitive paths
- **Blast radius**: CRITICAL
- **Notes**: stale cache entries create either privilege leakage or platform-wide lockout

### AuditLogService + SecurityAuditService (AuditLogModule)

- **Contract**: mutation audit writes, sensitive-read logging, security event logging
- **Primary consumers**: global interceptor, auth, safeguarding, child protection, behaviour, privacy/compliance flows
- **Blast radius**: HIGH
- **Notes**: the interceptor path is async via the `audit-log` queue; direct security writes remain synchronous

---

## Tier 2 — Shared Cross-Cutting Services

### ReadFacadesModule

- **Contract**: the API-side cross-module read boundary
- **Primary consumers**: compliance, reports, dashboards, behaviour, pastoral, regulatory, scheduling, parent-facing views
- **Blast radius**: HIGH
- **Notes**: schema changes must be reflected in the owning facade before consumers are updated; the lint rule blocks new API-side cross-module Prisma bypasses, but workers still read tables directly

### SequenceModule / SequenceService

- **Contract**: sequence allocation and formatting
- **Primary consumers**: admissions, behaviour, child protection, finance, payroll, households, registration, security incidents, SEN, staff profiles, students
- **Blast radius**: HIGH
- **Notes**: format changes cascade into application numbers, invoice numbers, household references, support plan numbers, incident numbers, and other externally visible identifiers

### ConfigurationModule

- **Contract**: `SettingsService`, `EncryptionService`, key-rotation behavior, module-settings schemas
- **Primary consumers**: nearly every policy-driven domain, especially attendance, behaviour, communications, finance, payroll, SEN, homework, wellbeing, regulatory
- **Blast radius**: HIGH
- **Notes**: settings are now per-module rows, but schema/default drift still affects all tenants; encryption changes remain one-way-risk territory

### ApprovalsModule / ApprovalRequestsService

- **Contract**: approval lifecycle plus callback dispatch
- **Primary consumers**: announcements, invoices, payroll finalisation, approval dashboards and callback health tooling
- **Blast radius**: HIGH
- **Notes**: approval callback mappings and worker processors must remain in sync

### GdprModule

- **Contract**: `ConsentService`, `GdprTokenService`, `AiAuditService`, DPA/privacy notice services
- **Primary consumers**: communications, gradebook AI, reports AI, attendance scan, behaviour AI, compliance exports, public legal surfaces
- **Blast radius**: HIGH
- **Notes**: consent checks are synchronous contracts, not eventual-consistency hints; DPA/privacy version checks are global access gates

### RbacModule

- **Contract**: roles, memberships, invitations, RBAC read surface
- **Primary consumers**: approvals, compliance, safeguarding, pastoral, early warning, tenants/platform flows, auth/session resolution
- **Blast radius**: HIGH
- **Notes**: this is both a domain module and a platform dependency; membership status or role-shape changes affect routing, access checks, and recipient resolution

### PdfRenderingModule

- **Contract**: synchronous render service, async PDF job service, output contract for rendered files
- **Primary consumers**: finance, payroll, gradebook/report cards, behaviour, child protection, pastoral, engagement trip packs
- **Blast radius**: HIGH
- **Notes**: output key conventions and callback contracts matter as much as the HTML-to-PDF rendering itself

### SearchModule / SearchIndexService

- **Contract**: async search indexing contract
- **Primary consumers**: students, staff, households, behaviour, search admin flows, entity mutations across the platform
- **Blast radius**: MEDIUM
- **Notes**: failures usually create stale search rather than data corruption, but search contracts are still relied on for discoverability

### ReportsModule / ReportsDataAccessService

- **Contract**: cross-domain analytics aggregation
- **Primary consumers**: dashboard, board reporting, workload/leadership reporting, compliance-style exports
- **Imports**: AdmissionsModule, SchedulesModule, AiFlagsModule (impl 10 — gates the three reports AI features `reports_narration`, `reports_ask_ai`, `reports_predictions` via `@RequiresAiFlag(...)`)
- **Blast radius**: MEDIUM-HIGH
- **Notes**: this module is where table-shape changes surface after features seem to work elsewhere

### PolicyEngineModule

- **Contract**: policy evaluation and replay
- **Primary consumers**: BehaviourModule
- **Blast radius**: MEDIUM-HIGH
- **Notes**: the dependency graph is narrow, but policy evaluation sits on automated sanctions, interventions, tasks, and alerting

---

## Tier 3 — Domain Hubs

### StudentsModule

- **Contract**: canonical student lifecycle, student read facade, parent/student linkage assumptions
- **Primary consumers**: academics, classes, attendance, gradebook, finance, behaviour, safeguarding, pastoral, regulatory, SEN, homework, reports, search
- **Blast radius**: VERY HIGH
- **Notes**: student status, parent links, and year-group relationships ripple almost everywhere

### StaffProfilesModule

- **Contract**: canonical staff record shape and staff read facade
- **Primary consumers**: classes, scheduling, attendance, payroll, behaviour, safeguarding, pastoral, SEN, wellbeing, regulatory, reports
- **Blast radius**: VERY HIGH
- **Notes**: this is the people anchor for both operational and compliance workflows

### ClassesModule

- **Contract**: classes, class enrolments, class staffing, classes read facade
- **Primary consumers**: attendance, gradebook, homework, behaviour scope, pastoral scope, scheduling, reports, parent-facing class views
- **Imports**: SchedulesModule
- **Blast radius**: VERY HIGH
- **Notes**: class enrolment shape changes hit both academic and safeguarding-style visibility rules

### AcademicsModule

- **Contract**: academic years, periods, year groups, academic read facade
- **Primary consumers**: classes, attendance, gradebook, homework, SEN, regulatory, staff wellbeing, reports
- **Blast radius**: VERY HIGH
- **Notes**: year/period status changes also trigger worker-side automation

### AttendanceModule

- **Contract**: attendance tables, attendance read facade, alert semantics, parent-notification rules
- **Primary consumers**: dashboards, reports, regulatory, early warning, gradebook risk context, parent digests
- **Imports**: SchoolClosuresModule
- **Blast radius**: HIGH
- **Notes**: worker processors and regulatory scans read the same attendance artifacts on separate codepaths

### GradebookModule

- **Contract**: assessments, grades, report-card state, gradebook read facade, weight configuration, cross-subject/period aggregation
- **Primary consumers**: report cards, parent views, compliance export, early warning, reports, AI comment flows
- **Imports**: AcademicsModule, AiModule, AttendanceModule, AuthModule, ClassesModule, CommunicationsModule, ConfigurationModule, GdprModule, ParentsModule, PdfRenderingModule, SchedulingModule, StaffProfilesModule, StudentsModule, TenantsModule
- **Blast radius**: HIGH
- **Notes**:
  - Period closure, assessment status, and report-card lifecycle changes have worker consequences
  - Imports `SchedulingModule` for `TeachingAllocationsService` derivation (resolves which teachers teach which classes/subjects)
  - Imports `AiModule` for AI-assisted grading and comment generation
  - Imports `TenantsModule` for tenant settings resolution (formative weight caps, missing grade policy)
  - New services: `TeachingAllocationsService`, `TeacherGradingWeightsService`, `WeightConfigService`
  - `WeightConfigService` manages subject-period and period-year weight configuration for cross-aggregation
  - `PeriodGradeComputationService` extended with cross-subject, cross-period, and year-overview aggregation
  - Config approval workflow on: `AssessmentCategoriesService`, `RubricService`, `StandardsService`
  - **Report Cards Redesign (impl 04)**: `ReportCardGenerationService` is now a NestJS provider that depends on `ReportCardTemplateService`, `ReportCardTenantSettingsService`, the `BullModule` `gradebook` queue, and the existing read facades (`AcademicReadFacade`, `ClassesReadFacade`, `StudentReadFacade`, `AttendanceReadFacade`, `TenantReadFacade`). It is exported from `ReportCardModule` so impl 05's teacher requests can call `generateRun` directly when auto-executing an approved `regenerate_reports` request.
  - **Report Cards Redesign (impl 04)**: enqueues a new `report-cards:generate` BullMQ job (queue `gradebook`). See `event-job-catalog.md` for payload and processor details. The worker hosts the new `ReportCardGenerationProcessor` plus two DI bindings — `REPORT_CARD_RENDERER_TOKEN` (bound to `ProductionReportCardRenderer` as of impl 11 — Handlebars + Puppeteer) and `REPORT_CARD_STORAGE_WRITER_TOKEN` (null writer today, S3-backed writer in production bootstrap).
  - **Report Cards Redesign (impl 05)**: `ReportCardModule` now imports `CommunicationsModule` (for `NotificationsService.createBatch` — admin fan-out on new requests, author notification on approve/reject) and `RbacModule` (for `RbacReadFacade.findMembershipsWithPermissionAndUser` — resolving the set of users with `report_cards.manage` to notify). The new `ReportCardTeacherRequestsService` calls `ReportCommentWindowsService.open` and `ReportCardGenerationService.generateRun` on the auto-execute path — both are already providers of `ReportCardModule`, so the cross-service wiring is intra-module and does not add a new inter-module edge.
  - **Report Cards Redesign (impl 06)**: `ReportCardModule` now imports `StaffProfilesModule` (for `StaffProfileReadFacade.resolveProfileId` — mapping teacher user IDs to staff profile IDs for library scoping) and `SchedulingModule` (for `SchedulingReadFacade.findTeacherCompetencies` — resolving teaching competencies so the library can expand from the teacher's set of classes to the corresponding students). `ReportCardsQueriesService` gained two new methods: `getClassMatrix` (class-first matrix endpoint, shares data sources with `PeriodGradeComputationService` — see danger-zone **DZ-44**) and `listReportCardLibrary` (signed-URL-backed document listing). No new BullMQ jobs, no new cron tasks, no new outgoing calls to other domain modules — library scoping walks `ClassesReadFacade.findClassesGeneric` and `ClassesReadFacade.findEnrolmentsGeneric` via the already-imported `ClassesModule`.
  - **Report Cards Redesign (impl 12 — cleanup)**: deleted the legacy flat `GET /v1/report-cards/overview` endpoint plus `ReportCardsQueriesService.gradeOverview` and `buildBatchSnapshots` (both sites — queries service and generation service), deleted the legacy synchronous `POST /v1/report-cards/generate-batch` endpoint and its controller helpers, removed the `generateBatchReportCardsSchema` / `reportCardOverviewQuerySchema` Zod schemas, deleted the orphaned `report-cards/_components/{generate-dialog,pdf-preview-modal}.tsx` frontend helpers, and removed the `PlaceholderReportCardRenderer` worker binding now that the production renderer is the sole implementation.

### FinanceModule

- **Contract**: invoices, payments, refunds, credit notes, fee assignment rules, finance read facade
- **Primary consumers**: registration, payroll context, parent finance surfaces, compliance, reports, parent digests
- **Blast radius**: HIGH
- **Notes**: finance state changes are consumed by both user flows and recurring/background processes

### PayrollModule

- **Contract**: payroll runs, payroll read surface, payslip generation contract
- **Primary consumers**: approvals, wellbeing board/workload reports, exports, staff self-service
- **Imports**: SchedulesModule, SchoolClosuresModule
- **Blast radius**: HIGH
- **Notes**: payroll finalisation crosses approvals, sequences, and PDF/export flows

### CommunicationsModule

- **Contract**: announcement publishing, notification record contract, dispatch semantics, audience resolution
- **Primary consumers**: announcements, parent inquiries, attendance alerts, behaviour/pastoral fan-out, legal/privacy notices, digests
- **Blast radius**: VERY HIGH
- **Notes**: this is the delivery backbone for multiple modules, not a standalone feature silo
- **Inbox bridge (2026-04-11)**: the dispatcher now fans messages into the new `InboxModule` as its default channel via the inbox channel provider (impl 06). Every announcement, notification, and parent-inquiry message lands in recipient inboxes; SMS / Email / WhatsApp remain additive escalations. Removing the inbox provider from the fan-out chain is a hard-blocked change — see `danger-zones.md` **DZ-Inbox-1**.

### InboxModule

- **Contract**: first-class in-app messaging — conversations / messages / participants / reads / edits / attachments / broadcast snapshots, saved audiences, tenant messaging-policy matrix, inbox tenant settings, safeguarding keywords, message flags, oversight audit log. Exposes `MessagingPolicyService.canStartConversation` / `canReplyToConversation`, `AudienceResolutionService.resolve` / `previewCount`, `ConversationsService` (direct / group / broadcast), `InboxOversightService`, and `InboxSettingsService`
- **Primary consumers**:
  - `CommunicationsModule` — imports `ConversationsService` via the dispatcher bridge to fan outbound messages into recipient inboxes as the always-on default channel (impl 06)
  - `FinanceModule` — exposes `FeesInArrearsProvider` (registered into the process-wide `AudienceProviderRegistry` at boot) so broadcast audiences can target households with overdue invoices (impl 03)
  - `EventsModule` / `TripsModule` — placeholder stubs that register `EventAttendeesProvider` / `TripRosterProvider` as `wired: false` entries. When a real events/trips domain lands these are the single touch points to replace (impl 03)
  - `SafeguardingModule` — indirect, via the `safeguarding:scan-message` BullMQ job. The scanner worker (impl 08) reads safeguarding keywords per tenant and writes message flags + oversight audit entries when a match is found
  - `RbacReadFacade` (new batch methods `findActiveMembershipRolesByUserIds` and `searchActiveMembersByName`) — used by `RoleMappingService` to fold platform roles into the 9-bucket `MessagingRole` and by the people-picker for policy-filtered search
  - Worker (`inbox-fallback-check` cron, `safeguarding:scan-message` processor) — share tables directly via raw `PrismaClient`
- **Imports**: `RbacModule`, `FinanceModule`, `EventsModule` (stub), `TripsModule` (stub), `PrismaModule`, `RedisModule`
- **Blast radius**: HIGH
- **Notes**:
  - The tenant messaging-policy matrix (9×9 role grid, 81 cells) is cached per-tenant for 5 minutes in `TenantMessagingPolicyRepository`. Updates to a tenant's policy call `invalidate(tenantId)` but in-flight requests can still see stale state for up to 5 minutes — see `danger-zones.md` **DZ-Inbox-2**
  - Hard-coded relational scopes in `RelationalScopeResolver` (teacher→parent via taught-class rosters, parent→teacher via child-class staff) are privacy invariants; weakening them is a CLAUDE.md hard-blocked change
  - Default tenant matrix seeds parents and students entirely OFF — this is a safety baseline, not an empty config waiting to be filled. Do not change defaults without explicit user instruction
  - `messages.body_search` is a generated `tsvector STORED` column with GIN index (simple dictionary so Arabic tokenises). The only consumer is impl 09's full-text search — it uses raw SQL inside `runWithRlsContext` because Prisma cannot read `Unsupported("tsvector")` columns
  - Broadcast replies do NOT land as replies on the broadcast thread — they spawn a new direct 1↔1 conversation between the replying recipient and the original sender. See `danger-zones.md` **DZ-Inbox-3**
  - Permissions are seeded at boot (`InboxPermissionsInit`) inside `runWithRlsContext` because `roles` / `role_permissions` RLS policies cast `current_setting('app.current_tenant_id')::uuid` even with `missing_ok=true` — a bare `$transaction` without tenant context fails with Postgres 22P02 (empty uuid cast)

### BehaviourModule

- **Contract**: incidents, sanctions, tasks, interventions, appeals, exclusions, behaviour read facade, policy engine coupling
- **Primary consumers**: safeguarding, pastoral sync, parent portal, reports, early warning triggers, approval-driven discipline flows, `WellbeingAggregateModule` (via `BehaviourReadFacade`)
- **Dependencies added (wellbeing rebuild, 2026-04-20)**: `WellbeingNotificationsService` (imported via `WellbeingNotificationsModule`) for post-commit dispatch on sanction serve, exclusion named transitions, amendment sent, document sent, appeal decided. `AiFlagGuard` gates `POST /incidents/ai-parse`, `GET /students/:id/ai-summary`, `POST /analytics/ai-query` via `@RequiresAiFlag('behaviour')`. `StudentReadFacade.findActiveParentUserIdsForStudent` added (avoids cross-module Prisma reads to `student_parent` from behaviour). `BehaviourAIModule` under `behaviour/ai/` owns the four AI endpoints + rate limiter + audit trail.
- **Blast radius**: VERY HIGH
- **Notes**: this is one of the densest modules in the codebase; lifecycle and worker changes fan out quickly. **The `BehaviourExclusionDeadlineCheckProcessor` and `BehaviourAckRemindersProcessor` write in-app notifications directly via `tx.notification.create` rather than going through `WellbeingNotificationsService` — they don't import the Nest module in the worker graph (impl 07 follow-up).**

### SafeguardingModule

- **Contract**: safeguarding concern lifecycle, sealing, break-glass, referrals, safeguarding SLA/escalation jobs, new `POST /concerns/:id/seal/reject` + `GET /:id/seal-status` + `GET /break-glass/:id` + `GET /break-glass/:id/access-log`
- **Primary consumers**: pastoral sync, audit/security coverage, child protection-style downstream workflows, `WellbeingAggregateModule` (via new `SafeguardingReadFacade` exposing concern counts + SLA bucket + sealed-this-year + critical-by-severity)
- **Dependencies added (wellbeing rebuild)**: `SafeguardingReadFacade` registered in `ReadFacadesModule`; safeguarding dashboard endpoint now renders with or without school_owner. The `listActiveGrants` contract widened to include 30-day window + `active` / `review_completed_at` / `review_overdue` flags.
- **Blast radius**: VERY HIGH
- **Notes**: status-projection and sealed-record access rules are safety-critical contracts. `safeguarding.view` + `.manage` + `.report` + `.seal` permissions are now granted to `school_principal` and `school_vice_principal` on existing tenants (2026-04-21 migration `20260421000000_wbr_backfill_safeguarding_admin_grants`). Previously only `school_owner` and legacy-seed tenants had these.

### PastoralModule

- **Contract**: concerns, cases, referrals, SST, critical incidents, check-ins, pastoral reporting, DSAR review, import, flagged queue actions, critical-incident support log
- **Primary consumers**: child protection links, early warning signals, parent-facing pastoral views, PDF exports, `WellbeingAggregateModule` (via `PastoralReadFacade`)
- **Dependencies added (wellbeing rebuild)**: `PastoralReadFacade` extended with open-case + recent concern + critical count getters for aggregate. `SstAgendaGeneratorService.generateAgenda` gated by `@RequiresAiFlag('pastoral')`.
- **Blast radius**: VERY HIGH
- **Notes**: `PastoralModule` is the live implementation surface; the top-level `PastoralCheckinsModule` and `PastoralDsarModule` wrappers remain empty stubs. **`PastoralInterventionStatus` Prisma enum uses `pc_active @map("active")` — services MUST translate public API value `'active'` → Prisma `'pc_active'` before passing to queries (see `toPrismaInterventionStatus` helper in `intervention.service.ts`). Same pattern applies to `PastoralActionStatus`, `PastoralReferralRecommendationStatus`, `SstMeetingStatus` if they ever take filter values from public APIs — currently safe because they don't.**

### ChildProtectionModule

- **Contract**: CP records, CP access, CP exports, mandated report lifecycle
- **Primary consumers**: pastoral escalation/linking, PDF export, access guard flows
- **Blast radius**: HIGH
- **Notes**: tightly coupled to Pastoral via `forwardRef()` and shared concern linkage

### EarlyWarningModule

- **Contract**: student risk profiles, risk signals, config-driven tiering, trigger semantics
- **Primary consumers**: attendance/behaviour/pastoral worker triggers, dashboards, routing/assignment flows, `WellbeingAggregateModule` (via new `EarlyWarningReadFacade` exposing amber/red counts)
- **Dependencies added (wellbeing rebuild)**: `EarlyWarningReadFacade` registered in `ReadFacadesModule` for aggregate KPI composition.
- **Blast radius**: HIGH
- **Notes**: no other API module imports its services directly, but many processors feed it indirectly through queue jobs and shared signal tables. The flagship `/early-warnings` sub-hub (impl 16) is a top consumer of `GET /early-warnings?pageSize=100&tier=amber|red`, `GET /summary`, and the intervene-multiselect probe of `GET /pastoral/interventions?status=active&pageSize=1`.

### HomeworkModule

- **Contract**: homework assignments/completions, diary notes, student submissions, parent homework visibility, teacher class-authority gating for assignment writes, in-app notifications on publish/submit/return/grade
- **Primary consumers**: parent digests, behaviour daily dispatch, class/student read paths, analytics, student self-submission surface
- **Dependencies added (Wave 1, 2026-04-18)**: `SchedulesReadFacade` (teacher-class authority via Schedule table) + `PermissionCacheService` (owner/principal/VP bypass) + `ClassesReadFacade.findById` (subject cross-check) + `AcademicReadFacade.findCurrentYearId` (resolve current year). `HomeworkAuthorityService.assertCanAssignHomework` gates `POST /v1/homework`, `PATCH /v1/homework/:id` (class/subject changes), `POST /v1/homework/:id/copy`, and `POST /v1/homework/bulk-create`.
- **Dependencies added (Wave 2, 2026-04-18)**: `CommunicationsModule` (for `NotificationsService.createBatch`) + `InboxModule` (for `AudienceResolutionService` — resolves `class_parents` leaf). `HomeworkNotificationService.notifyOnPublish` writes in-app Notification rows for every parent of every enrolled student on every `draft → published` transition. No email / SMS / WhatsApp — paid third-party channels were intentionally removed from the module's scope for per-message cost discipline. Also wires `POST /v1/homework/:id/notify` (teacher-triggered re-notify) and `GET /v1/homework/:id/notification-preview` (parent count for confirmation dialogs).
- **Dependencies added (Wave 3, 2026-04-19)**: `StudentReadFacade.findByUserId` (NEW, replaces broken `findByUserName` — requires `Student.user_id` FK added in the same migration). `HomeworkStudentController` (`v1/student/homework`) is the student-facing surface for listing + submitting work; gated by new `homework.submit.own` permission. `HomeworkCompletionsController` gains `GET /v1/homework/:id/submissions` and `POST /v1/homework/:id/submissions/:submissionId/{grade,return}` for the teacher grading grid. `HomeworkNotificationService` gains `notifyOnSubmit` (→ teacher), `notifyOnReturn` (→ student + parents), `notifyOnGrade` (→ student + parents) — all in-app.
- **Blast radius**: MEDIUM-HIGH
- **Notes**: exports are narrow, but worker automation and parent-facing surfaces depend on its table contracts. New `GET /v1/homework/my-classes` endpoint is the teacher-facing entry point backed by `SchedulesReadFacade.findClassesTaughtByTeacher`. **Wave 3 schema** adds `HomeworkSubmission` + `HomeworkSubmissionAttachment` tables, plus `Student.user_id` FK (fixes a latent cross-student data-leakage bug — see Live Drift notes below).

### RegulatoryModule

- **Contract**: calendar, submissions, Tusla, DES/October returns, PPOD/POD, transfers
- **Primary consumers**: worker processors on the `regulatory` queue, academic/attendance/behaviour/staff data contracts
- **Imports**: SchedulesModule, **ComplianceModule (Phase 10)** — needed so `RegulatoryGdprService` can pull `RetentionPoliciesService.countItemsPastRetention` for the GDPR sub-hub dashboard KPI.
- **Read-facade dependencies**:
  - `AttendanceReadFacade` — Tusla threshold scans, SAR/AAR absence pulls.
  - `BehaviourReadFacade` — `findSanctionsForTusla` / `countSanctionsForTusla` (Phase 3 Tusla sub-hub KPI).
  - `AcademicReadFacade` — `findAllYears` feeds the Tusla wizard academic-year dropdown.
  - `SafeguardingReadFacade` — open concern count for `/regulatory` super-hub GDPR/safeguarding tiles. **Phase 9** extends with `countPendingTuslaReferrals`, `findRecentTuslaReferrals`, and `listTuslaReferrals` for the `/regulatory/safeguarding` sub-hub dashboard and mandatory-reporting page.
  - `ComplianceReadFacade` — open DSAR count for the GDPR tile. **Phase 10** extends with `countOverdueDsarRequests` (GDPR-standard 30-day window) and `findRecentDsarRequests(tenantId, limit)` for the new `/regulatory/gdpr` sub-hub.
  - `GdprReadFacade` (Phase 10) — `findActivePrivacyNoticeVersion` and `findDpaAcceptanceStatus` feed the GDPR sub-hub KPIs and audit footer.
- **Blast radius**: HIGH
- **Notes**: exports are limited, but the module is a wide reader of other domain data. Tusla SAR/AAR generation now persists a `regulatory_submissions` row (`domain=tusla_attendance`, `submission_type=sar|aar`) so the dashboard can surface last-submission metadata; CSV export regenerates from live data via `exportSarCsv` / `exportAarCsv`. **Phase 9** owns three new tenant-scoped registers (`dlp_register_entries`, `staff_vetting_records`, `child_protection_reviews`) under the regulatory module — no cross-module writes; DLP/vetting/CP-review CRUD is gated by `safeguarding.view` (read) and `safeguarding.manage` (write) so the existing safeguarding RBAC tier applies. **Phase 10** consolidates DSAR / DPA / data-retention / privacy-notices into `/regulatory/gdpr` (sub-hub + 4 sub-pages); no new tables — the module composes existing `compliance_requests`, `retention_policies`, `privacy_notice_versions`, and `data_processing_agreements` reads via `RegulatoryGdprService`. Legacy paths (`/regulatory/compliance|dpa|data-retention|privacy-notices`) stay alive as temporary 307 redirects in `next.config.mjs` (90-day window before flipping to permanent).

### SchedulingModule

- **Contract**: solver inputs/outputs, generated timetable application
- **Primary consumers**: classes, staff availability/preferences, rooms, closures, staff wellbeing metrics, personal timetables
- **Imports**: RoomsModule, StaffProfilesModule
- **Blast radius**: HIGH
- **Notes**: solver result shape and run-status semantics matter to multiple user surfaces and workers

### SchedulingRunsModule

- **Contract**: run status, solver execution lifecycle
- **Primary consumers**: scheduling UI, staff wellbeing metrics
- **Imports**: SchedulesModule
- **Blast radius**: HIGH
- **Notes**: run-status semantics and solver execution state matter to scheduling surfaces and worker processors

### SenModule

- **Contract**: SEN profiles, support plans, goals, referrals, accommodations, SNA/resource allocation
- **Primary consumers**: pastoral linkage, staff/class scope rules, reports, transition/handover packs
- **Blast radius**: HIGH
- **Notes**: scope resolution depends on staff/class contracts outside the module

### StaffWellbeingModule

- **Contract**: workload metrics, surveys, resource directory, board-report aggregation
- **Primary consumers**: leadership reporting, wellbeing dashboards, survey moderation jobs, `WellbeingAggregateModule` (via new `StaffWellbeingReadFacade`)
- **Dependencies added (wellbeing rebuild)**: `StaffWellbeingReadFacade` registered in `ReadFacadesModule` exposing survey count + cover-fairness Gini for hub counters. `PersonalWorkloadController.resolveStaffProfile` throws `STAFF_PROFILE_NOT_FOUND` for users without a `staff_profiles` row (principals / admins) — frontend at `/wellbeing/staff` now catches this specifically and shows a "No teaching profile" empty state instead of surfacing it as an error toast.
- **Blast radius**: MEDIUM
- **Notes**: downstream breakage is limited, but upstream schedule/substitution/staff-data changes can distort outputs quickly

### WellbeingAggregateModule (NEW — wellbeing rebuild Impl 03)

- **Contract**: `GET /api/v1/wellbeing/dashboard-summary` — single composed payload for the `/wellbeing` super-hub. Returns KPIs (`students_at_risk`, `open_incidents`, `open_pastoral_cases`, `overdue_actions`) + `pending_attention[]` + `hub_counts` (per-module counts for tile badges) + `recent_activity[]`.
- **Primary consumers**: `/wellbeing` frontend super-hub (impl 13)
- **Imports**: `ReadFacadesModule` (uses 5 read facades — behaviour / pastoral / safeguarding / early-warning / staff-wellbeing)
- **Blast radius**: LOW (additive; does not mutate)
- **Notes**: Per-module sub-queries run via `Promise.allSettled` so a failing facade yields zero counts + logged warning instead of a 500. Module-flag-disabled sources (via `tenant_modules`) contribute zero. Gated by `wellbeing.view_dashboard`.

### AiFlagsModule (NEW — wellbeing rebuild Impl 04)

- **Contract**: per-tenant per-module AI feature gate. Table `tenant_ai_flags` (`tenant_id, module_key, enabled, updated_at, updated_by`). Service methods: `list(tenantId)`, `setFlag(tenantId, moduleKey, enabled, userId)`, `isEnabled(tenantId, moduleKey)` (with 5-minute in-memory TTL cache, invalidated on setFlag). Controller at `/v1/ai-flags` (GET list + PATCH `:moduleKey`). Global `AiFlagGuard` via `APP_GUARD` reads the `@RequiresAiFlag('moduleKey')` decorator metadata and throws `403 AI_DISABLED` when the flag is off. The decorator currently gates 4 endpoints (behaviour AI parse, behaviour per-student summary, behaviour NL query, pastoral SST agenda refresh).
- **Primary consumers**: `BehaviourAIModule`, `SstAgendaGeneratorService`, tenant admin UI at `/settings/ai-flags`
- **Blast radius**: HIGH (any new AI surface must add the decorator or expose unbilled AI calls)
- **Notes**: cache is per-process; multi-instance deploys see at most 5 minutes of staleness. `AiFlagsService.invalidate()` is public for hot-reload integrations. Module-level flag uses `module_key` values `behaviour | pastoral | staff_wellbeing | early_warning` matching the existing `tenant_modules` keys. Default state: all off at tenant create (opt-in billing model).

### WellbeingNotificationsModule (NEW — wellbeing rebuild Impl 04)

- **Contract**: `WellbeingNotificationsService.dispatch(event, recipients)` — in-app notification fan-out + optional email/SMS/WhatsApp routing per-tenant `tenant_notification_preferences.wellbeing_channels`. `safeDispatch()` wraps dispatch with exception swallowing so callers never 500 on provider failure. Event keys are strongly typed via `WELLBEING_NOTIFICATION_EVENT_KEYS` in `@school/shared/wellbeing` (18 events: incident._, concern._, sanction._, sla.breach, critical.declared, appeal._, recognition.awarded, document.sent_to_parent, amendment.sent, reminder.acknowledgement, etc.).
- **Primary consumers**: behaviour (sanctions, exclusions, amendments, documents, appeals, acknowledgements); pastoral (concerns, critical incidents); safeguarding (break-glass, sealing); staff-wellbeing (surveys).
- **Imports**: `CommunicationsModule` (uses `NotificationsService.createBatch` for in-app), `BullMQ` (stub-provider queues), `PrismaModule`
- **Blast radius**: HIGH (central chokepoint for wellbeing-side notifications; must remain in every dispatch path)
- **Notes**: Provider implementations (email/SMS/WhatsApp) are SCAFFOLDED — they throw `NotImplementedException({ code: 'PROVIDER_NOT_WIRED' })`. `safeDispatch` swallows these. Per-event channel preferences cascade: per-event override → tenant default → false. In-app is always-on. Recipients resolution stays in callers (they pass concrete user_ids). **Invariant: in-app channel cannot be disabled — the always-on inbox guarantee from the new-inbox rebuild carries through here.**

### AdmissionsModule

- **Contract**: application lifecycle (financially-gated), capacity gating, FIFO waiting list, Stripe checkout + cash/bank/override payment paths, admissions dashboard summary, public apply form
- **Primary consumers**: registration, compliance, reports, search, parent-facing application views, finance webhook router, classes (auto-promotion hook)
- **Imports**: ApprovalsModule, SearchModule, SequenceModule, AcademicsModule, FinanceModule (forwardRef for Stripe service), TenantsModule, RbacModule, HouseholdsModule, BullModule (`notifications` queue)
- **Exports**: ApplicationsService, ApplicationStateMachineService, ApplicationConversionService, AdmissionsCapacityService, AdmissionsAutoPromotionService, AdmissionsPaymentService
- **Blast radius**: HIGH
- **Notes**: application state changes feed registration, finance, compliance workflows, and the classes service (auto-promotion). Auto-promotion hooks run inside the caller's RLS transaction — any module creating classes or activating a year group calls `AdmissionsAutoPromotionService.onClassAdded`/`onYearGroupActivated`.
- **Batch applications (household-numbers rebuild):** the public apply path now creates N Application rows per submission, bundled by `submission_batch_id`. Each flows through its own state machine independently. Conversion of the first approval in a `new_household` batch materialises the household and retro-links the rest of the batch.
- **Sibling priority:** auto-promotion runs tiered FIFO — `ORDER BY is_sibling_application DESC, apply_date ASC`. Siblings always promote from the waiting list ahead of non-siblings.

### Cross-module dependencies added by the new-admissions rebuild

- **classes → admissions**: `ClassesService.create` calls `AdmissionsAutoPromotionService.onClassAdded` / `onYearGroupActivated` from within its RLS transaction so a newly-added class retroactively promotes waiting-list applicants into any freed seats.
- **finance → admissions** (forwardRef): `StripeService.handleCheckoutCompleted` routes `metadata.purpose === 'admissions'` events to `handleAdmissionsCheckoutCompleted`, which loads the application, verifies amounts, and calls `ApplicationConversionService.convertToStudent` + `ApplicationStateMachineService.markApproved` inside a single interactive RLS transaction.
- **admissions → finance** (forwardRef): `FinanceFeesFacade` wraps `FinanceReadFacade` + `TenantReadFacade` so admissions can resolve the annual fee schedule and tenant Stripe configuration without reaching into finance internals.
- **admissions → tenants / rbac**: override role gating reads membership permissions via `RbacReadFacade.findMembershipByUserWithPermissions`; tenant settings (`admissions.upfront_percentage`, `payment_window_days`, `max_application_horizon_years`, `allow_cash`, `allow_bank_transfer`, `bank_iban`, `require_override_approval_role`) resolved via `TenantReadFacade`.

### ComplianceModule

- **Contract**: compliance audits, data exports, cross-domain compliance aggregation, open-DSAR read surface (via `ComplianceReadFacade`)
- **Primary consumers**: regulatory, GDPR/DPA, leadership dashboards
- **Imports**: AdmissionsModule, AttendanceModule, BehaviourModule, ClassesModule, CommunicationsModule, FinanceModule, GdprModule, GradebookModule, HouseholdsModule, ParentInquiriesModule, ParentsModule, PayrollModule, SearchModule, StaffProfilesModule, StudentsModule, WebsiteModule
- **Exports (read)**: `ComplianceReadFacade` — registered in the global `ReadFacadesModule`; exposes `countOpenDsarRequests(tenantId)`, `countOverdueDsarRequests(tenantId)` (30-day GDPR window), and `findRecentDsarRequests(tenantId, limit)` for the regulatory GDPR sub-hub. Owns the `complianceRequest` Prisma model.
- **Exports (service)**: `RetentionPoliciesService` — `countItemsPastRetention(tenantId)` (Phase 10) sums the affected-records preview across all retention categories; consumed by `RegulatoryGdprService`.
- **New consumer**: `RegulatoryModule` now imports `ComplianceModule` directly (Phase 10) to wire `RetentionPoliciesService` into the GDPR sub-hub dashboard.
- **Blast radius**: HIGH
- **Notes**: widest reader module in the codebase; any domain schema change may affect compliance exports

### EngagementModule

- **Contract**: engagement tracking, trip management, parent engagement surfaces
- **Primary consumers**: pastoral, parent-facing views, PDF exports
- **Imports**: ClassesModule, ParentsModule, PdfRenderingModule, StaffProfilesModule, StudentsModule, TenantsModule
- **Blast radius**: MEDIUM
- **Notes**: imports multiple domain modules for trip/engagement context resolution

### RegistrationModule

- **Contract**: registration workflows, post-admissions enrolment processing
- **Primary consumers**: finance, compliance, student lifecycle
- **Imports**: FinanceModule, SequenceModule
- **Blast radius**: MEDIUM-HIGH
- **Notes**: bridges admissions into finance and student record creation

### SchoolClosuresModule

- **Contract**: school closure definitions, closure impact resolution
- **Primary consumers**: attendance, payroll, scheduling, regulatory
- **Imports**: AcademicsModule, AttendanceModule, ClassesModule
- **Blast radius**: MEDIUM
- **Notes**: closure changes affect attendance marking, payroll calculations, and schedule validity

---

## Tier 4 — Low-Dependency Modules

These modules are comparatively safe to change in isolation as long as their shared schemas and queues stay stable:

### HouseholdsModule

- **Contract**: household grouping, household references, household number generation via `HouseholdNumberService`
- **Imports**: RegistrationModule
- **Exports**: `HouseholdNumberService` (consumed by StudentsModule, AdmissionsModule, RegistrationModule)
- **Blast radius**: MEDIUM
- **Notes**: primarily a grouping construct; registration import adds enrolment-time household linkage
- **Contract (extended 2026):** household_number generation via `HouseholdNumberService` — per-tenant unique 6-char alphanumeric identifier (AAA999 format, random, crypto-generated), capped at 99 students per household. Methods: `generateUniqueForTenant`, `previewForTenant`, `incrementStudentCounter`, `generateStudentNumber`.
- **New consumers:**
  - `StudentsModule` — reads `household_number` at student-create time to assemble `{household_number}-{nn}` student numbers
  - `AdmissionsModule` — `ApplicationConversionService` generates household numbers when materialising a new household from an approved new-family batch, and increments `student_counter` when creating any student under a household with a number
  - `RegistrationModule` — `RegistrationService.registerFamily` uses `HouseholdNumberService` to assign household numbers at walk-in registration

### RoomsModule

- **Contract**: room definitions, room availability
- **Imports**: SchedulesModule
- **Blast radius**: LOW
- **Notes**: scheduling import adds timetable-aware room conflict checking

Other low-dependency modules:

- `HealthModule`
- `MetricsModule`
- `PreferencesModule`
- `ParentsModule`
- `ParentInquiriesModule`
- `WebsiteModule`
- `PeriodGridModule`
- `ClassRequirementsModule`
- `StaffAvailabilityModule`
- `StaffPreferencesModule`
- `ImportsModule`
- `SecurityIncidentsModule`
- `DashboardModule` (mostly a reader/aggregator over other module contracts)

These still need regression testing if their tables, shared DTOs, or queue payloads change, but they do not currently sit at the center of the platform's dependency graph.

---

## Worker-Side Reverse Blast Radius

The worker is where blast radius often hides after API refactors appear safe.

### Shared tables with heavy worker dependence

- `notifications`: communications dispatch, retries, digests, pastoral fan-out, behaviour fan-out, legal/privacy notifications
- `tenant_settings` / `tenant_module_settings`: behaviour, homework, wellbeing, regulatory, early warning, communications, payroll
- `students`, `student_parents`, `class_enrolments`, `class_staff`, `staff_profiles`: attendance, homework, early warning, pastoral, wellbeing, regulatory
- `approval_requests`: approval callback processors plus reconciliation
- `security_incidents` and `audit_logs`: anomaly scan, breach deadline, platform security workflows

### Shared queue semantics

- Queue name changes are wide-impact changes because API modules, worker processors, cron registration, and tests all reference the same constants or job names.
- Job payload shape changes are cross-process breaking changes. They must be treated like API contract changes.

---

## Stub Wrappers To Treat Carefully

These modules are still present in `AppModule`, but the live functionality sits elsewhere:

- [apps/api/src/modules/pastoral-checkins/pastoral-checkins.module.ts](/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral-checkins/pastoral-checkins.module.ts)
- [apps/api/src/modules/pastoral-dsar/pastoral-dsar.module.ts](/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral-dsar/pastoral-dsar.module.ts)
- [apps/api/src/modules/critical-incidents/critical-incidents.module.ts](/Users/ram/Desktop/SDB/apps/api/src/modules/critical-incidents/critical-incidents.module.ts)

Do not document these as live functional surfaces. The implemented pastoral and critical-incident behavior is under [apps/api/src/modules/pastoral](/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral).

---

## Practical Rule

Before changing any exported service, shared enum, queue payload, or core table:

1. check the owning module
2. check the relevant read facade
3. check worker processors touching the same table or job
4. check architecture docs for matching state-machine and danger-zone entries

If a change touches any of those layers, it is not a local refactor.

---

## Recent Additions (documented edges)

### ClassSubjectRequirementsModule

Owner of per-class/per-subject scheduling requirements (Stage 6 of the solver).

- **Imports**: ClassesModule, RoomsModule (needs class metadata and room availability when validating requirements)
- **Consumed by**: SchedulingModule (the solver reads aggregated requirements)

### LeaveModule

Staff leave request lifecycle (apply → approve → coverage planning) plus
tenant-configurable leave-type catalogue and per-staff balance aggregator.

- **Imports**: StaffProfilesModule (staff identity + facade-backed reads), SchedulingModule (generates substitution coverage when leave is approved), AcademicsModule (AcademicReadFacade.findCurrentYear drives the balance window)
- **Consumed by**: HR/payroll workflows (payroll reads approved leave days via `GET /v1/payroll/absence-periods`; month-end UI at `/payroll/absences` consumes it directly)
