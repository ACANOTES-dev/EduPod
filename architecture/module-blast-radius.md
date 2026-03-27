# Module Blast Radius Map

> **Purpose**: Before modifying a module's public service API, check here to know what else breaks.
> **Maintenance**: Update when adding new cross-module imports or changing module exports.
> **Last verified**: 2026-03-27

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

## Tier 2 — Cross-Cutting Services (change = multiple domains break)

### SequenceService (TenantsModule)
- **Consumed by**: Admissions, behaviour, credit notes, fee generation, households, imports, invoices, payments, receipts, recurring invoices, refunds, registration, staff profiles, students
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

### PdfRenderingService (PdfRenderingModule)
- **Consumed by**: Finance/receipts, finance/statements, payroll/reports, payslips
- **Blast radius**: MEDIUM. Template changes affect all PDF-generating domains.

### S3Service (S3Module)
- **Consumed by**: Branding, compliance, imports (service + validation + processing)
- **Blast radius**: LOW-MEDIUM. File storage path changes affect document retrieval.

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
- **Blast radius**: MEDIUM. Notification channel/template changes affect attendance alerts.

### SchoolClosuresService (SchoolClosuresModule)
- **Consumed by**: AttendanceModule
- **Blast radius**: LOW. Closure data affects attendance session generation.

### AcademicPeriodsService (AcademicsModule)
- **Consumed by**: No direct importers, but academic periods are READ by gradebook, report cards, scheduling, promotion
- **Danger**: Period status transitions (planned -> active -> closed) trigger gradebook and report card auto-generation cron jobs in the worker.

### PermissionCacheService (CommonModule — Global)
- **Consumed by**: PermissionGuard (every protected endpoint)
- **Blast radius**: CRITICAL. Cache invalidation bugs = users can't access features. Cache poisoning = permission escalation.

---

## Tier 4 — Isolated Modules (safe to modify independently)

These modules have NO downstream dependents. Changes are contained:

- ParentsModule
- HouseholdsModule (except reads tenant sequences)
- RoomsModule (only consumed by SchedulesModule)
- PeriodGridModule (only consumed by SchedulingRunsModule)
- PreferencesModule
- DashboardModule
- HealthModule
- WebsiteModule
- ComplianceModule
- ReportsModule (queries everything via Prisma, but nothing depends on it)
- ParentInquiriesModule

---

## Tier 3 — Domain Modules with Cross-Module Dependencies

### BehaviourModule
- **Last verified**: 2026-03-27
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
- **Imports**: `AuthModule` (guards, permission cache), `TenantsModule` (SequenceService for incident/sanction/appeal/exclusion numbers), `ApprovalsModule` (approval request creation from policy actions), `PdfRenderingModule` (Puppeteer PDF generation for documents), `S3Module` (S3 storage for generated documents), `BullModule.registerQueue('notifications')`, `BullModule.registerQueue('behaviour')`
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
  - *Enqueues to `behaviour` queue*: `behaviour:evaluate-policy`, `behaviour:check-awards`, `behaviour:suspension-return`, `behaviour:detect-patterns`, `behaviour:task-reminders`, `behaviour:break-glass-expiry` (constant defined but NOT dispatched — see DZ-23), `safeguarding:critical-escalation`, `safeguarding:sla-check`, `behaviour:refresh-mv-student-summary`, `behaviour:refresh-mv-benchmarks`, `behaviour:refresh-mv-exposure-rates`, `behaviour:partition-maintenance`, `behaviour:cron-dispatch-daily`, `behaviour:cron-dispatch-sla`, `behaviour:cron-dispatch-monthly`, `behaviour:guardian-restriction-check`, `behaviour:attachment-scan`, `behaviour:retention-check`
  - *Enqueues to `notifications` queue*: parent notifications, sanction notices, appeal outcomes, correction notices, `behaviour:digest-notifications`
  - *Processors (16)*: `BehaviourCronDispatchProcessor` (dispatches per-tenant daily/SLA/monthly jobs), `BehaviourParentNotificationProcessor`, `DigestNotificationsProcessor`, `BehaviourTaskRemindersProcessor`, `BehaviourCheckAwardsProcessor`, `BehaviourGuardianRestrictionCheckProcessor`, `EvaluatePolicyProcessor`, `BehaviourSuspensionReturnProcessor`, `AttachmentScanProcessor`, `BreakGlassExpiryProcessor`, `SlaCheckProcessor`, `CriticalEscalationProcessor`, `DetectPatternsProcessor`, `RefreshMVProcessor` (handles 3 MV refresh job types), `RetentionCheckProcessor`, `PartitionMaintenanceProcessor`
- **Consumed by**: None yet externally. Internally, PolicyEvaluationEngine creates tasks, sanctions, interventions. SanctionService auto-creates exclusion cases + auto-generates documents. AppealService cascades decisions to sanctions/incidents + auto-generates documents. AmendmentsService dispatches correction notifications + supersedes documents. BehaviourAnalyticsService reads from materialized views refreshed by cron jobs.
- **Blast radius**: HIGH. ApprovalsModule changes affect behaviour policy actions. Sanction lifecycle creates exclusion cases, legal holds, amendment notices, auto-generates documents. Appeal decisions cascade to sanctions, incidents, exclusion cases, and generate documents. Amendment corrections dispatch parent notifications and supersede existing documents. Document generation depends on PdfRenderingModule (Puppeteer) and S3Module. Materialized view refreshes depend on underlying tables.
- **Cross-module Prisma-direct reads**: Reads `students`, `student_parents`, `class_staff`, `class_enrolments`, `academic_years`, `academic_periods`, `subjects`, `rooms`, `schedules`, `tenant_settings`, `users`, `staff_profiles`, `parents`, `year_groups`, `notifications`, `behaviour_publication_approvals` directly via PrismaService. These are read-only lookups for context snapshots, scope resolution, student data, and parent portal rendering.
- **Danger**: Schema changes to `students`, `class_enrolments`, or `class_staff` affect scope resolution in `BehaviourScopeService`. Schema changes to `student_parents` affect parent notification dispatch in the worker and parent portal rendering. The `@anthropic-ai/sdk` dependency requires an API key configured per tenant. Puppeteer PDF generation runs synchronously in API transactions — see DZ-19. Amendment correction chain touches 5 tables — see DZ-20. Break-glass expiry processor has no dispatch mechanism — see DZ-23.

---

## Cross-Module Query Pattern (Prisma Bypass)

**Critical awareness**: Many modules query other modules' tables directly via PrismaService rather than injecting the owning module's service. This means:

1. **Schema changes** to these tables break consumers that aren't visible in the NestJS module import graph
2. The NestJS dependency graph underestimates actual coupling

Known Prisma-direct consumers:
| Table | Queried directly by |
|-------|-------------------|
| `staff_profiles` | Payroll, scheduling, attendance, classes, reports, dashboard |
| `students` | Attendance, gradebook, report cards, finance, admissions, reports |
| `classes` + `class_enrolments` | Gradebook, attendance, scheduling, report cards |
| `academic_periods` + `academic_years` | Gradebook, report cards, scheduling, promotion, attendance |
| `invoices` + `payments` | Finance reports, dashboard, parent portal |
| `attendance_records` + `attendance_sessions` | Reports, dashboard, gradebook risk detection |
| `behaviour_incidents` + `behaviour_incident_participants` | Behaviour module reads these via Prisma (owned), future: reports, dashboard, scheduling analytics |

**Rule**: When changing schema for any table in the left column, grep for that table name across ALL modules, not just the owning module.
