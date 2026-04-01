# Module Blast Radius Map

> **Purpose**: Before modifying a module's public service API, check here to know what else breaks.
> **Maintenance**: Update when adding new cross-module imports or changing module exports.
> **Last verified**: 2026-04-01

---

## How to read this

Each module lists:

- **Exports**: Services other modules can inject
- **Consumed by**: Modules that import and call these services
- **Blast radius**: What breaks if you change the exported service interface

If a module isn't listed, it has no downstream dependents (safe to modify in isolation).

---

## Tier 1 — Global Infrastructure (change = everything breaks)

### PrismaService

- **Blast radius**: Every module. Every service. Every test.
- **Rule**: Never modify PrismaService interface without full regression.

### RedisService

- **Blast radius**: Auth, attendance, classes, communications, domains, finance reports, gradebook, households, memberships, notifications, payroll, staff-profiles, students, dashboard, website
- **Rule**: Cache key format changes require auditing all consumers.

---

### GdprTokenService (GdprModule)

- **Exports**: `GdprTokenService`
- **Consumed by**: GradebookModule (ai-comments, ai-grading, ai-progress-summary, nl-query, report-card-template), SchedulingModule (ai-substitution), AttendanceModule (attendance-scan), BehaviourModule (behaviour-ai)
- **Blast radius**: HIGH. Every AI service routes through this for tokenisation + audit. Changing the `processOutbound`/`processInbound` interface breaks all AI features.
- **Rule**: The `gdpr_anonymisation_tokens` mapping table must NEVER be exposed via any API endpoint. Token values are security-sensitive.

### AiAuditService (GdprModule)

- **Exports**: `AiAuditService`
- **Consumed by**: GradebookModule (ai-comments, ai-grading, ai-progress-summary, nl-query, report-card-template), ReportsModule (ai-report-narrator, ai-predictions), SchedulingModule (ai-substitution), AttendanceModule (attendance-scan), BehaviourModule (behaviour-ai)
- **Blast radius**: MEDIUM. All 10 AI services log through this for Article 22 compliance. Changing the `log()` interface breaks audit trail for all AI features. However, `log()` is fire-and-forget — failures do NOT break AI features.
- **Rule**: `log()` must NEVER throw. AI audit trail failures must not cascade to AI feature failures. The `ai_processing_logs` table has 24-month retention for academic appeal periods.

### ConsentService (GdprModule)

- **Exports**: `ConsentService`
- **Consumed by**: GradebookModule (ai-grading, ai-comments, ai-progress-summary), CommunicationsModule (`NotificationDispatchService`)
- **Prisma-direct consumers of `consent_records`**: RegistrationModule, AdmissionsModule, StudentsModule, Gradebook worker (`GradebookRiskDetectionProcessor`), Behaviour analytics benchmarking query
- **Blast radius**: HIGH. Consent withdrawal is synchronous and immediately changes WhatsApp delivery, AI feature availability, allergy-report visibility, risk detection eligibility, and cross-school benchmarking participation.
- **Rule**: Do not cache active-consent decisions or rely solely on background/materialized refresh paths for consent-gated processing. Parent self-service withdrawal must take effect on the next read.

### DpaService + PrivacyNoticesService + SubProcessorsService (GdprModule)

- **Exports**: `DpaService`, `PrivacyNoticesService`, `SubProcessorsService`
- **Consumed by**: Global `DpaAcceptedGuard` (`APP_GUARD`), CommunicationsModule (`NotificationsService` via `forwardRef()`), all tenant-scoped API surfaces indirectly through the guard, the legal settings UI, the parent portal privacy notice page, and the public sub-processor register page
- **Blast radius**: HIGH. `DpaAcceptedGuard` is global, so changing current-version lookup, acceptance checks, or the exempt-path allowlist can lock every tenant-scoped API surface. Privacy notice publish logic fans out notifications to every active tenant membership and resets acknowledgement requirements for users who only acknowledged older versions. Sub-processor register content is public and versioned, so changes affect both legal disclosure and tenant admin notification flows.
- **Rule**: Keep the DPA guard allowlist aligned with the frontend redirect destination `/settings/legal/dpa`, and do not relax the draft-only edit rule for privacy notices after `published_at` is set.

---

## Tier 2 — Cross-Cutting Services (change = multiple domains break)

### SequenceService (SequenceModule)

- **Module location**: `apps/api/src/modules/sequence/`
- **Consumed by**: Admissions, behaviour, credit notes, fee generation, households, imports, invoices, payments, receipts, recurring invoices, refunds, registration, staff profiles, students
- **Via TenantsModule**: TenantsModule imports and re-exports SequenceModule for backward compatibility — modules that already import TenantsModule for other reasons can continue to receive SequenceService via that path.
- **Blast radius**: HIGH. Sequence format changes affect receipt numbers, invoice numbers, application IDs, payslip numbers, student IDs, staff IDs, household references, payment references, incident numbers, sanction numbers, appeal numbers across 14 consumers.
- **Danger**: The `refund` sequence type is used in code but NOT in the canonical `SEQUENCE_TYPES` constant. If you validate against the constant, refunds break silently.

### SettingsService (ConfigurationModule)

- **Consumed by**: Attendance (service + upload + pattern + parent notification), behaviour (parent notification send-gate, quick-log defaults, points settings), finance (invoices, payment reminders, recurring invoices), payroll (runs, calendar, exports)
- **Blast radius**: HIGH. Settings shape changes affect attendance policies, behaviour module policies, finance billing rules, and payroll calculation.
- **Danger**: Settings are tenant-specific. A schema change requires migrating ALL tenants' stored JSONB settings. The `tenantSettingsSchema` in shared/ is the single source of truth.

### EncryptionService (ConfigurationModule)

- **Consumed by**: Admissions payment, finance/Stripe, payslips, staff profiles
- **Blast radius**: MEDIUM. All encrypted field access (bank details, Stripe keys).
- **Danger**: Changing encryption/decryption logic makes existing encrypted data unreadable.

### ApprovalRequestsService (ApprovalsModule)

- **Consumed by**: Admissions/applications, communications/announcements, finance/invoices, payroll/runs
- **Blast radius**: HIGH. The approval callback dispatch system (Mode A) routes approved requests to domain-specific BullMQ queues. The `MODE_A_CALLBACKS` mapping connects approval types to queue/job pairs.
- **Danger**: Adding a new approval type requires updating BOTH the callback map AND the corresponding worker processor. Missing either = approved items never execute.

### PdfRenderingService + PdfJobService (PdfRenderingModule)

- **Exports**: `PdfRenderingService` (synchronous rendering), `PdfJobService` (async queue-based rendering)
- **Consumed by**: Finance/receipts, finance/statements, payroll/reports, payslips, behaviour/documents, child-protection/export, engagement/trip-packs, gradebook/report-cards, pastoral/concern-reports
- **Queue**: `pdf-rendering` queue with `pdf:render` job processed by `PdfRenderProcessor` in worker
- **Blast radius**: MEDIUM. Template changes affect all PDF-generating domains. The async path (`PdfJobService`) stores rendered PDFs to S3 — S3 path changes affect retrieval.

### S3Service (S3Module)

- **Consumed by**: Branding, compliance, imports (service + validation + processing)
- **Blast radius**: LOW-MEDIUM. File storage path changes affect document retrieval.

### PolicyEvaluationEngine + PolicyRulesService (PolicyEngineModule)

- **Exports**: `PolicyEvaluationEngine`, `PolicyRulesService`, `PolicyReplayService`
- **Consumed by**: BehaviourModule (via `forwardRef`)
- **Circular dependency**: PolicyEngineModule ↔ BehaviourModule via `forwardRef()`. PolicyEvaluationEngine depends on `BehaviourHistoryService`, and BehaviourModule uses PolicyEvaluationEngine for incident policy evaluation.
- **Blast radius**: MEDIUM. Changes to policy evaluation logic affect behaviour incident processing, automated sanctions, and award calculations.

### SequenceService (SequenceModule)

- **Exports**: `SequenceService`
- **Consumed by**: Admissions, behaviour, child-protection, finance, households, imports, pastoral, registration, security-incidents, SEN, staff-profiles, students (12 modules)
- **Blast radius**: HIGH. Sequence format changes affect receipt numbers, invoice numbers, application IDs, payslip numbers, student IDs, staff IDs, household references, payment references, incident numbers, sanction numbers, appeal numbers across all consumers.
- **Note**: Extracted from TenantsModule. TenantsModule re-exports SequenceModule for backward compatibility.

### SearchIndexService (SearchModule)

- **Consumed by**: Various services enqueue `search:index-entity` jobs on mutations
- **Blast radius**: LOW. Search index is eventually consistent; breakage = stale search results, not data loss.

---

## Tier 3 — Domain Services (change = specific feature breaks)

### AuthService (AuthModule)

- **Consumed by**: TenantsModule
- **Blast radius**: LOW (only tenant provisioning uses it directly; auth flow is middleware-based)

### StaffProfilesService (StaffProfilesModule)

- **Consumed by**: Imported by its own controllers only, but staff data is READ by payroll, scheduling, attendance, classes via Prisma directly
- **Blast radius**: MEDIUM. Schema changes to staff_profiles table affect payroll calculations, scheduling solver, attendance marking, class assignments.
- **Danger**: Other modules query staff_profiles via Prisma, not through StaffProfilesService. A schema change won't cause import errors but WILL cause runtime query failures in payroll/scheduling/attendance.

### ClassesService + ClassEnrolmentsService (ClassesModule)

- **Consumed by**: No direct importers, but class data is READ by gradebook, attendance, scheduling, finance, report cards
- **Danger**: Same pattern as StaffProfiles — other modules query classes/class_enrolments via Prisma directly.

### InvoicesService (FinanceModule)

- **Consumed by**: RegistrationModule (creates registration invoices)
- **Blast radius**: LOW direct, but invoice status changes trigger payment cascades.

### NotificationsService + NotificationDispatchService (CommunicationsModule)

- **Consumed by**: AttendanceModule (parent notifications)
- **Blast radius**: MEDIUM. Notification channel/template changes affect attendance alerts, GDPR legal/privacy fan-out notifications, and the parent daily digest.
- **Danger**: WhatsApp dispatch now hard-depends on `consent_records` through `ConsentService`. Missing or withdrawn `whatsapp_channel` consent marks the original notification failed and creates an SMS fallback. GDPR Phase E also introduces a `forwardRef()` cycle between `CommunicationsModule` and `GdprModule` because privacy notice publishes and sub-processor register updates notify tenant users/admins in-app.
- **Parent daily digest cross-module reads**: The `notifications:parent-daily-digest` worker processor reads data from 6+ modules via Prisma direct: `daily_attendance_summaries` (Attendance), `grades` + `assessments` (Gradebook), `behaviour_incidents` + `behaviour_recognition_awards` (Behaviour), `homework_assignments` + `class_enrolments` (Homework/Classes), `invoices` (Finance), `students` + `student_parents` (Students), and `users.preferred_locale` (platform-level). Schema changes to any of these tables affect digest content generation.

### SchoolClosuresService (SchoolClosuresModule)

- **Consumed by**: AttendanceModule
- **Blast radius**: LOW. Closure data affects attendance session generation.

### AcademicPeriodsService (AcademicsModule)

- **Consumed by**: No direct importers, but academic periods are READ by gradebook, report cards, scheduling, promotion
- **Danger**: Period status transitions (planned -> active -> closed) trigger gradebook and report card auto-generation cron jobs in the worker.

### PermissionCacheService (CommonModule — Global)

- **Consumed by**: PermissionGuard (every protected endpoint)
- **Blast radius**: CRITICAL. Cache invalidation bugs = users can't access features. Cache poisoning = permission escalation.

### AuditLogService + SecurityAuditService (AuditLogModule — Global)

- **Consumed by**: Global `AuditLogInterceptor`, `AuthService`, `TenantsService`, `PermissionGuard`, safeguarding/behaviour attachment services
- **Blast radius**: HIGH. Changes to audit metadata shape or service signatures affect mutation logging, sensitive read coverage, security event logging, and permission-denied visibility.
- **Danger**: Sensitive read logging depends on the global interceptor plus `@SensitiveDataAccess()` metadata. Breaking either side silently reduces Phase G audit coverage.

---

## Tier 4 — Isolated Modules (safe to modify independently)

These modules have NO downstream dependents. Changes are contained:

- ParentsModule
- HouseholdsModule (except reads tenant sequences)
- RoomsModule (only consumed by SchedulesModule)
- PeriodGridModule (only consumed by SchedulingRunsModule)
- PreferencesModule
- DashboardModule (imports ReportsModule for `ReportsDataAccessService`)
- HealthModule
- WebsiteModule
- ComplianceModule
- ReportsModule (exports `ReportsDataAccessService` — centralised cross-module read facade. All analytics queries to foreign tables are routed through this service instead of direct Prisma access. DashboardModule imports ReportsModule for this.)
- ParentInquiriesModule
- SecurityIncidentsModule (platform-level, no tenant scope — reads `audit_logs` for anomaly detection, writes `security_incidents` and `security_incident_events`. No downstream dependents.)

### RegulatoryModule

- **Last verified**: 2026-03-30
- **Exports**: `RegulatoryCalendarService`, `RegulatorySubmissionService`, `RegulatoryDashboardService`, `RegulatoryTuslaService`, `RegulatoryDesService`, `RegulatoryOctoberReturnsService`, `RegulatoryPpodService`, `RegulatoryCbaService`, `RegulatoryDesMappingsService`, `RegulatoryTuslaMappingsService`, `RegulatoryReducedDaysService`, `RegulatoryTransfersService`
- **Controllers**: 1 controller (RegulatoryController) — Phases A–E: calendar CRUD, submission CRUD, Tusla compliance, DES returns, October returns, PPOD/POD sync, CBA sync, transfers, dashboard
- **Imports**: `AuthModule`, `S3Module`
- **Consumed by**: None yet externally. Worker module has 5 processors on the `regulatory` queue.
- **Blast radius**: LOW. Self-contained module with no downstream dependents.
- **Cross-module Prisma-direct reads**: `students`, `daily_attendance_summaries`, `attendance_records`, `behaviour_sanctions`, `behaviour_exclusion_cases`, `staff_profiles`, `subjects`, `classes`, `class_enrolments`, `ppod_student_mappings`, `ppod_sync_logs`, `attendance_pattern_alerts`
- **Danger**: Schema changes to `daily_attendance_summaries` or `attendance_records` will affect Tusla threshold/SAR generation and the tusla-threshold-scan worker processor. Schema changes to `behaviour_sanctions` or `behaviour_exclusion_cases` will affect suspension/expulsion notification queries. Schema changes to `staff_profiles` or `subjects` will affect DES September Returns pipeline. Schema changes to `ppod_student_mappings` or `ppod_sync_logs` will affect PPOD sync/import processors.
- **Queues**: `regulatory` queue with 5 jobs: `regulatory:check-deadlines` (cron 07:00), `regulatory:scan-tusla-thresholds` (cron 06:00), `regulatory:generate-des-files` (on-demand), `regulatory:ppod-sync` (on-demand), `regulatory:ppod-import` (on-demand)

ComplianceModule note: anonymisation/export flows now import `SearchModule` and `S3Module` for secondary cleanup. Failures there leave stale search/cache/export artifacts, but the transactional DB anonymisation path still completes because post-commit cleanup is logged rather than rolled back. Phase F added `DsarTraversalService` which queries ~20 Prisma models across all modules for DSAR data collection — no new module imports, uses direct Prisma reads. Student DSAR traversal now also includes gradebook `period_grade_snapshots`, `student_competency_snapshots`, and `student_academic_risk_alerts`. Access export / portability execution now writes an audit-only GDPR token usage log via `GdprTokenService` using the `never` DSAR policies before the compliance request is marked completed. `compliance:deadline-check` cron job added to worker (compliance queue). Erasure pipeline now also cleans up `consent_records` and `gdpr_anonymisation_tokens`.

---

## Tier 3 — Domain Modules with Cross-Module Dependencies

### BehaviourModule

- **Last verified**: 2026-03-30
- **Exports** (28 services): `BehaviourService`, `BehaviourConfigService`, `BehaviourStudentsService`, `BehaviourTasksService`, `BehaviourHistoryService`, `BehaviourScopeService`, `BehaviourQuickLogService`, `BehaviourPointsService`, `BehaviourAwardService`, `BehaviourRecognitionService`, `BehaviourHouseService`, `BehaviourInterventionsService`, `BehaviourGuardianRestrictionsService`, `PolicyRulesService`, `PolicyEvaluationEngine`, `PolicyReplayService`, `SafeguardingService`, `SafeguardingAttachmentService`, `SafeguardingBreakGlassService`, `BehaviourSanctionsService`, `BehaviourAppealsService`, `BehaviourExclusionCasesService`, `BehaviourExportService`, `BehaviourAmendmentsService`, `BehaviourPulseService`, `BehaviourAnalyticsService`, `BehaviourAlertsService`, `BehaviourAIService`, `BehaviourDocumentService`, `BehaviourDocumentTemplateService`, `BehaviourParentService`, `BehaviourLegalHoldService`, `BehaviourAdminService`
- **Controllers**: 17 controllers, 214 endpoints total:
  - `BehaviourController` (21) — core incident CRUD, quick-log
  - `BehaviourConfigController` (21) — categories, templates, settings
  - `BehaviourAdminController` (21) — admin ops, legal holds, data export
  - `SafeguardingController` (21) — safeguarding concerns, actions, break-glass
  - `BehaviourAnalyticsController` (20) — analytics, pulse, AI queries
  - `BehaviourSanctionsController` (14) — sanction lifecycle
  - `BehaviourStudentsController` (13) — student profiles, histories
  - `BehaviourRecognitionController` (12) — awards, award types, recognition wall
  - `BehaviourInterventionsController` (12) — intervention lifecycle
  - `BehaviourAppealsController` (10) — appeal submission, decisions, documents
  - `BehaviourExclusionsController` (10) — exclusion case lifecycle
  - `BehaviourAlertsController` (8) — alert management
  - `BehaviourTasksController` (8) — task management
  - `BehaviourParentController` (7) — parent portal (summary, incidents, sanctions, points, recognition, acknowledge, appeal)
  - `BehaviourGuardianRestrictionsController` (6) — restriction management
  - `BehaviourDocumentsController` (6) — document generation, templates
  - `BehaviourAmendmentsController` (4) — amendment trail, corrections
- **Imports**: `AuthModule` (guards, permission cache), `SequenceModule` (SequenceService for incident/sanction/appeal/exclusion numbers), `ApprovalsModule` (approval request creation from policy actions), `PdfRenderingModule` (Puppeteer PDF generation for documents), `S3Module` (S3 storage for generated documents), `BullModule.registerQueue('notifications')`, `BullModule.registerQueue('behaviour')`
- **Internal dependencies**:
  - `BehaviourPulseService` -> PrismaService, RedisService
  - `BehaviourAnalyticsService` -> PrismaService, BehaviourScopeService, BehaviourPulseService
  - `BehaviourAlertsService` -> PrismaService
  - `BehaviourAIService` -> PrismaService, BehaviourScopeService, BehaviourAnalyticsService, ConfigService, `@anthropic-ai/sdk` (Claude API)
  - `BehaviourDocumentService` -> PrismaService, S3Service, PdfRenderingService, BehaviourDocumentTemplateService, BehaviourHistoryService
  - `BehaviourParentService` -> PrismaService (reads student_parents, guardian_restrictions, incidents, sanctions, awards, publication_approvals)
  - `BehaviourSanctionsService` -> `@Optional() BehaviourDocumentService` (auto-generate detention_notice/suspension_letter)
  - `BehaviourExclusionCasesService` -> `@Optional() BehaviourDocumentService` (auto-generate exclusion_notice), reads `tenant_settings`
  - `BehaviourAppealsService` -> `@Optional() BehaviourDocumentService` (auto-generate appeal_hearing_invite/appeal_decision_letter)
  - `BehaviourAmendmentsService` -> creates correction ack rows, notifications, supersedes documents on sendCorrection()
  - `BehaviourAdminService` -> PrismaService (reads `students` for data export, cohort analysis)
  - `BehaviourAwardService` -> PrismaService (reads `academic_periods` for period date ranges)
- **External dependencies**: `@anthropic-ai/sdk` (Anthropic Claude API), `handlebars` (template compilation for document generation), `puppeteer` (PDF rendering via PdfRenderingModule)
- **Queues** — 16 processors on the `behaviour` queue, plus enqueues to `notifications`:
  - _Enqueues to `behaviour` queue_: `behaviour:evaluate-policy`, `behaviour:check-awards`, `behaviour:suspension-return`, `behaviour:detect-patterns`, `behaviour:task-reminders`, `behaviour:break-glass-expiry` (constant defined but NOT dispatched — see DZ-23), `safeguarding:critical-escalation`, `safeguarding:sla-check`, `behaviour:refresh-mv-student-summary`, `behaviour:refresh-mv-benchmarks`, `behaviour:refresh-mv-exposure-rates`, `behaviour:partition-maintenance`, `behaviour:cron-dispatch-daily`, `behaviour:cron-dispatch-sla`, `behaviour:cron-dispatch-monthly`, `behaviour:guardian-restriction-check`, `behaviour:attachment-scan`, `behaviour:retention-check`
  - _Enqueues to `notifications` queue_: parent notifications, sanction notices, appeal outcomes, correction notices, `behaviour:digest-notifications`
  - _Processors (16)_: `BehaviourCronDispatchProcessor` (dispatches per-tenant daily/SLA/monthly jobs), `BehaviourParentNotificationProcessor`, `DigestNotificationsProcessor`, `BehaviourTaskRemindersProcessor`, `BehaviourCheckAwardsProcessor`, `BehaviourGuardianRestrictionCheckProcessor`, `EvaluatePolicyProcessor`, `BehaviourSuspensionReturnProcessor`, `AttachmentScanProcessor`, `BreakGlassExpiryProcessor`, `SlaCheckProcessor`, `CriticalEscalationProcessor`, `DetectPatternsProcessor`, `RefreshMVProcessor` (handles 3 MV refresh job types), `RetentionCheckProcessor`, `PartitionMaintenanceProcessor`
- **Consumed by**: None yet externally. Internally, PolicyEvaluationEngine creates tasks, sanctions, interventions. SanctionService auto-creates exclusion cases + auto-generates documents. AppealService cascades decisions to sanctions/incidents + auto-generates documents. AmendmentsService dispatches correction notifications + supersedes documents. BehaviourAnalyticsService reads from materialized views refreshed by cron jobs.
- **Blast radius**: HIGH. ApprovalsModule changes affect behaviour policy actions. Sanction lifecycle creates exclusion cases, legal holds, amendment notices, auto-generates documents. Appeal decisions cascade to sanctions, incidents, exclusion cases, and generate documents. Amendment corrections dispatch parent notifications and supersede existing documents. Document generation depends on PdfRenderingModule (Puppeteer) and S3Module. Materialized view refreshes depend on underlying tables.
- **Cross-module Prisma-direct reads**: Reads `students`, `student_parents`, `class_staff`, `class_enrolments`, `academic_years`, `academic_periods`, `subjects`, `rooms`, `schedules`, `tenant_settings`, `users`, `staff_profiles`, `parents`, `year_groups`, `notifications`, `behaviour_publication_approvals` directly via PrismaService. These are read-only lookups for context snapshots, scope resolution, student data, and parent portal rendering.
- **Danger**: Schema changes to `students`, `class_enrolments`, or `class_staff` affect scope resolution in `BehaviourScopeService`. Schema changes to `student_parents` affect parent notification dispatch in the worker and parent portal rendering. The `@anthropic-ai/sdk` dependency requires an API key configured per tenant. Puppeteer PDF generation runs synchronously in API transactions — see DZ-19. Amendment correction chain touches 5 tables — see DZ-20. Break-glass expiry processor has no dispatch mechanism — see DZ-23.

### SenModule

- **Last verified**: 2026-04-01
- **Exports**: `SenProfileService`, `SenScopeService`, `SenSupportPlanService`, `SenGoalService`, `SenResourceService`, `SenSnaService`, `SenProfessionalService`, `SenAccommodationService`, `SenReportsService`, `SenTransitionService`
- **Controllers**: `SenProfileController`, `SenSupportPlanController`, `SenGoalController`, `SenResourceController`, `SenSnaController`, `SenProfessionalController`, `SenAccommodationController`, `SenReportsController`, `SenTransitionController`
- **Imports**: `AuthModule`, `SequenceModule` (`SequenceService` for support plan numbers), `ConfigurationModule` (`SettingsService` for SEN review-cycle, plan-number prefix, and `sen.sna_schedule_format`)
- **Consumed by**: No external module imports yet. Controllers use the services directly; read access also depends on `PermissionCacheService` through the global auth/permission stack.
- **Blast radius**: MEDIUM. Changing support-plan numbering impacts versioned SEN plans across tenants. Changing scope resolution affects which students class teachers can see. Changing goal/progress lifecycle behavior affects plan review workflows, stale-goal compliance reporting, and historical progress tracking. Changing resource-allocation capacity rules affects utilisation dashboards, student-hour assignment limits, SNA coordination workflows, and the NCSE return resource-hour totals. Changing transition-note or handover-pack composition affects controlled information-sharing during class/year/school transitions.
- **Cross-module Prisma-direct reads**: `students` (via `sen_profiles.student_id` scope chain, reporting, handover, and student-hour/SNA joins), `staff_profiles`, `class_staff`, `class_enrolments`, `academic_years`, `academic_periods`, `year_groups`, `users`, `pastoral_referrals` (optional FK link from professional involvements)
- **Danger**: `SenScopeService` relies on `staff_profiles`, `class_staff`, and `class_enrolments` to derive class-scoped visibility, so schema or status changes there can silently overexpose or hide SEN records. `SenSupportPlanService` depends on tenant settings defaults for `sen.default_review_cycle_weeks` and `sen.plan_number_prefix`; changing those schemas requires keeping the service behavior and shared defaults aligned. `SenReportsService` reads `students.gender`, `students.year_group_id`, `academic_years`, and goal-progress recency directly for NCSE/overview/compliance reporting, so schema changes there can silently skew statutory or operational outputs. `SenTransitionService` assembles handover packs from support plans, goals, accommodations, professional involvements, student-hours, SNA assignments, and transition notes; changes to any of those shapes can break downstream handover payloads or omit information unexpectedly. `SenSnaService` validates assignment schedules against `sen.sna_schedule_format`, so changing that shared settings schema or its defaults without updating the validator can reject legitimate assignments or accept malformed ones. `SenProfessionalService` reads `pastoral_referrals` directly via Prisma for optional referral linking — schema changes to `pastoral_referrals` can affect professional involvement creation. `SenAccommodationService.getExamReport()` joins through `sen_profiles -> students -> year_groups` — schema changes to `students.year_group_id` or `year_groups` can affect exam accommodation reporting.

---

## Cross-Module Query Pattern (Prisma Bypass)

**Critical awareness**: Many modules query other modules' tables directly via PrismaService rather than injecting the owning module's service. This means:

1. **Schema changes** to these tables break consumers that aren't visible in the NestJS module import graph
2. The NestJS dependency graph underestimates actual coupling

Known Prisma-direct consumers:
| Table | Queried directly by |
|-------|-------------------|
| `staff_profiles` | Payroll, scheduling, attendance, classes, reports, dashboard, behaviour (scope resolution), compliance (DSAR/retention/erasure), configuration (key-rotation batch re-encryption), early-warning (cohort, routing, service), engagement (conferences), regulatory (DES September Returns), schedules (conflict detection), search (index), sen (scope, SNA), staff-availability, staff-preferences |
| `students` + `student_parents` | Attendance, gradebook, report cards, finance, admissions, reports, parent-daily-digest (worker), academics (promotion, year-groups), behaviour (analytics, pulse, points, students-view), classes (assignments), communications (audience-resolution), compliance (DSAR/anonymisation/retention), early-warning (routing), engagement (event-participants, conferences, form-submissions), gdpr (age-gate, consent), homework (completions, analytics, parent, diary), imports, parent-inquiries, pastoral (notification, report), regulatory (DES, October returns, Tusla, transfers), search (index), sen |
| `classes` + `class_enrolments` | Gradebook, attendance, scheduling, report cards, parent-daily-digest (worker), behaviour (scope, comparison-analytics), communications (audience-resolution), compliance (DSAR), early-warning (cohort, routing, service), engagement (conferences, event-participants, trip-pack), homework (completions, analytics, parent), pastoral (parent-pastoral), schedules (conflict-detection, timetables), sen (scope) |
| `academic_periods` + `academic_years` | Gradebook, report cards, scheduling, promotion, attendance, behaviour (admin, award, house, points), classes (assignments, service), early-warning (cohort, service), regulatory (DES, October returns), sen (reports, resource), staff-wellbeing (board-report, workload-data) |
| `invoices` + `payments` | Finance reports, dashboard, parent portal, parent-daily-digest (worker), compliance (DSAR/retention — reads invoice count for retention eligibility checks) |
| `attendance_records` + `attendance_sessions` + `daily_attendance_summaries` | Reports, dashboard, gradebook risk detection, parent-daily-digest (worker), behaviour (behaviour-students reads `daily_attendance_summaries` for at-risk context), compliance (DSAR traversal, retention-policies), gradebook (report-cards embed daily summaries; AI services read attendance records for comment/progress context), regulatory (Tusla threshold scanning reads both `attendance_records` and `daily_attendance_summaries`), schedules (counts open sessions before allowing closure deletion), school-closures (checks for open/flagged attendance sessions before applying a closure) |
| `behaviour_incidents` + `behaviour_recognition_awards` | Behaviour module reads these via Prisma (owned), reports, dashboard, parent-daily-digest (worker), compliance (DSAR traversal reads `behaviourRecognitionAward`; retention-policies counts `behaviourIncident` for retention eligibility) |
| `grades` + `assessments` | Gradebook (owned), parent-daily-digest (worker), compliance (DSAR traversal reads grades), reports (grade-analytics, student-progress, reports-data-access read assessments) |
| `homework_assignments` | Homework (owned), parent-daily-digest (worker) |

**Rule**: When changing schema for any table in the left column, grep for that table name across ALL modules, not just the owning module.

---

## StaffWellbeingModule

- **Exports**: `HmacService`, `WorkloadComputeService`, `WorkloadCacheService`
- **Reads from** (read-only, no writes):
  - `SchedulingModule` → Schedule, SchedulePeriodTemplate (teaching load, timetable quality, room changes)
  - `SubstitutionModule` / Scheduling → SubstitutionRecord (cover duties, absence proxy, fairness analysis)
  - `StaffProfilesModule` → staff_profiles (staff metadata, DOB for aggregate workforce transition in V2)
  - `PayrollModule` → compensation_records (compensation context for V2 reports)
  - `CommunicationsModule` → notification infrastructure (survey open/close notifications)
  - `ConfigurationModule` → EncryptionService (HMAC secret encryption), SettingsService (tenant settings)
- **Blast radius**: None downstream. Changes to StaffWellbeingModule cannot break any other module.
- **Reverse blast radius** (changes to these modules affect wellbeing):
  - Schedule model changes affect workload computation
  - SubstitutionRecord model changes affect cover fairness and absence trends
  - EncryptionService interface changes affect HMAC secret management
- **Special risk**: `survey_responses` table has NO tenant_id and NO RLS — see DZ-27 in danger-zones.md

---

## EarlyWarningModule

**Location**: `apps/api/src/modules/early-warning/early-warning.module.ts`

- **Exports**: `EarlyWarningService`, `EarlyWarningConfigService`, `EarlyWarningCohortService`, `EarlyWarningTriggerService`, `EarlyWarningRoutingService`, 5× signal collectors (`AttendanceSignalCollector`, `BehaviourSignalCollector`, `EngagementSignalCollector`, `GradesSignalCollector`, `WellbeingSignalCollector`)
- **Consumed by**:
  - Worker: `evaluate-policy.processor.ts` (behaviour module), `notify-concern.processor.ts` (pastoral module), `attendance-pattern-detection.processor.ts` (attendance module) — all enqueue `early-warning:compute-student` jobs directly onto the EARLY_WARNING queue
  - API: `EarlyWarningController` and `EarlyWarningService` are IMPLEMENTED (not upcoming) — the controller and service are registered in the module
- **Consumes**:
  - `PrismaModule` → `PrismaService` (DB access for signal collectors, routing resolution, trigger config checks)
  - `BullModule` → `early-warning` queue (for `EarlyWarningTriggerService` to enqueue compute-student jobs)
  - Reads from: `early_warning_configs`, `student_risk_profiles`, `student_risk_signals`, `early_warning_tier_transitions`, `class_enrolments`, `class_staff`, `staff_profiles`, `membership_roles`, `students`, `notifications`, `pastoral_cases`, `pastoral_interventions`
- **Blast radius**: Changes to `EarlyWarningTriggerService` interface affect any module that calls `triggerStudentRecompute()`. Changes to routing resolution logic affect notification delivery for tier changes.
- **Reverse blast radius** (changes to these modules affect early-warning):
  - `attendance` module: `daily_attendance_summaries`, `attendance_pattern_alerts` are read by the attendance signal collector
  - `gradebook` module: assessment data read by the grades signal collector
  - `behaviour` module: incident data read by the behaviour signal collector
  - `pastoral` module: concern/case data read by the wellbeing signal collector; `pastoral_interventions` table written to on red-tier entries
  - Schema changes to `class_staff`, `staff_profiles`, `membership_roles` affect recipient routing resolution

---

### HomeworkModule

**Location**: `apps/api/src/modules/homework/homework.module.ts`
**Registered in**: `apps/api/src/app.module.ts`

**Exports**: HomeworkService, HomeworkCompletionsService, HomeworkDiaryService, HomeworkAnalyticsService, HomeworkParentService

**Controllers** (5): HomeworkController (17 endpoints), HomeworkCompletionsController (5), HomeworkDiaryController (6), HomeworkParentController (6), HomeworkAnalyticsController (10) — 44 total

**Tables**: homework_assignments, homework_attachments, homework_completions, homework_recurrence_rules, diary_notes, diary_parent_notes

**Queue**: `homework` (4 jobs: overdue-detection, generate-recurring, digest-homework, completion-reminder)

**Permissions**: homework.view, homework.manage, homework.mark_own, homework.view_diary, homework.write_diary, homework.view_analytics, parent.homework

**Tenant Module Key**: `homework` in tenant_settings

**Imports**: AuthModule, S3Module, BullModule

**Reverse Blast Radius**:

- Changes to `classes`, `students`, `subjects`, `academic_years`, `academic_periods` schema affect homework queries
- Changes to `student_parents` affect parent portal visibility
- Changes to `tenant_settings` schema affect homework settings
- Communications queue changes affect digest/reminder notifications

---

## PastoralModule

**Location**: `apps/api/src/modules/pastoral/pastoral.module.ts`

- **Exports** (17 services): `AffectedTrackingService`, `CaseService`, `CheckinService`, `ConcernService`, `ConcernVersionService`, `CriticalIncidentService`, `InterventionService`, `NepsVisitService`, `ParentContactService`, `PastoralDsarService`, `PastoralEventService`, `PastoralNotificationService`, `PastoralReportService`, `ReferralService`, `SstService`, `StudentChronologyService`
- **Controllers** (14): `CasesController`, `CheckinAdminController`, `CheckinConfigController`, `CheckinsController`, `ConcernsController`, `CriticalIncidentsController`, `InterventionsController`, `ParentContactsController`, `ParentPastoralController`, `PastoralAdminController`, `PastoralDsarController`, `PastoralImportController`, `PastoralReportsController`, `ReferralsController`, `SstController`
- **Imports**: `AuthModule`, `forwardRef(() => ChildProtectionModule)` (circular — CP module imports Pastoral), `CommunicationsModule`, `PdfRenderingModule`, `SequenceModule`, `BullModule.registerQueue('pastoral')`, `BullModule.registerQueue('notifications')`
- **Consumed by**:
  - `EarlyWarningModule` worker processors read `pastoral_cases` and `pastoral_interventions` via Prisma direct
  - `ChildProtectionModule` uses `forwardRef(PastoralModule)` for CP record linking to pastoral concerns
- **Blast radius**: HIGH. PastoralModule contains the full pastoral care system — concerns, cases, SST meetings, referrals, child protection liaison, check-ins, critical incidents, and DSAR traversal. Changes to exported services affect CP records, early-warning signal collection, and Pastoral DSAR export.
- **Cross-module Prisma-direct reads**: `students`, `student_parents`, `parents`, `class_enrolments`, `class_staff`, `staff_profiles`, `academic_years`, `academic_periods`, `school_closures`, `tenant_settings`, `memberships`, `behaviour_incidents`, `behaviour_sanctions`, `safeguarding_concerns`
- **Queues**: `pastoral` queue (8 job processors): `pastoral:notify-concern`, `pastoral:escalation-timeout`, `pastoral:checkin-alert`, `pastoral:intervention-review-reminder`, `pastoral:overdue-actions`, `pastoral:precompute-agenda`, `pastoral:sync-behaviour-safeguarding`, `pastoral:wellbeing-flag-expiry`
- **Circular dependency**: `PastoralModule` ↔ `ChildProtectionModule` via `forwardRef()`. This is intentional — CP records link to pastoral concerns, and pastoral concerns can escalate to CP. If either module removes `forwardRef`, NestJS will throw a circular dependency error at startup.
- **State machines**: CaseStatus (`open → active → monitoring → resolved → closed`), ReferralStatus (8 states), SstMeetingStatus, CriticalIncidentStatus, PastoralInterventionStatus, ReferralRecommendationStatus — all guarded within respective service files.

---

## ChildProtectionModule

**Location**: `apps/api/src/modules/child-protection/child-protection.module.ts`

- **Exports**: `CpAccessService`, `CpExportService`, `CpRecordService`
- **Controllers** (3): `CpAccessController`, `CpExportController`, `CpRecordsController`
- **Imports**: `AuthModule`, `forwardRef(() => PastoralModule)`, `PdfRenderingModule`, `SequenceModule`
- **Consumed by**: None externally — self-contained child protection record system
- **Blast radius**: MEDIUM. Changes to `CpRecordService` affect CP record creation/linking from pastoral concerns. Changes to `CpAccessService` affect the break-glass style CP access guard (`CpAccessGuard`).
- **Cross-module Prisma-direct reads**: `pastoral_concerns` (via PastoralModule forwardRef), `staff_profiles`, `students`, `memberships`
- **Circular dependency**: See PastoralModule entry above — `ChildProtectionModule` ↔ `PastoralModule` via `forwardRef()`.
