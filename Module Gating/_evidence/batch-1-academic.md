# Deep-Dive Evidence — Batch 1 (Academic Modules)

> Raw agent investigation report. Saved verbatim from the deep-dive pass on 2026-05-13.
> Modules: admissions, gradebook, homework, sen.

========================================

## Module: admissions

display_name_proposal: "Admissions & Applications"
description_proposal: "Student application intake, processing, and capacity management"

### API

api_module_dir: apps/api/src/modules/admissions/
controllers:

- admission-forms.controller.ts: gating=none, key=N/A, endpoints=2
- admissions-dashboard.controller.ts: gating=none, key=N/A, endpoints=1
- admissions-payment.controller.ts: gating=none, key=N/A, endpoints=4
- applications.controller.ts: gating=none, key=N/A, endpoints=15
- parent-applications.controller.ts: gating=none, key=N/A, endpoints=3
- public-admissions.controller.ts: gating=none, key=N/A, endpoints=2
  exported_services: [ApplicationsService, AdmissionsPaymentService, AdmissionsCapacityService, AdmissionsAutoPromotionService, ApplicationConversionService, ApplicationStateMachineService, AdmissionsFinanceBridgeService]
  consumed_by_modules: [classes, compliance, finance, reports]

### Frontend

routes: [/admissions (admin hub), /admissions/forms, /admissions/applications, /admissions/payment-links, /admissions/applications/:id, /admissions/applications/:id/messages]
nav_locations: [nav.admissions at /admissions (nav-config.ts:171, Operations section, admin/front_office roles)]
module_aware_files: [none found]

### Worker

queues: [ADMISSIONS]
crons: [ADMISSIONS_PAYMENT_EXPIRY_JOB (daily per-tenant), admissions-payment-link-generation (per-tenant)]
processors: [admissions-application-received.processor.ts, admissions-application-withdrawn.processor.ts, admissions-payment-expiry.processor.ts, admissions-payment-link.processor.ts]

### Data

primary_tables: [Application, AdmissionFormDefinition, AdmissionFormField, AdmissionsPaymentEvent, ApplicationNote, AdmissionOverride]
table_count: ~6

### Permissions

permission_count: 2
sample_permission_keys: [admissions.manage, admissions.view]

### Notifications

notification_types: [admission.status_change]

### PDF

template_keys: [] (not found; likely uses generic invoice/receipt templates for payment links)

### Current gating state

api_enforcement: none
frontend_enforcement: none
worker_enforcement: none (crons dispatch per-tenant but do not check module state)
in_seed_module_keys: yes (admissions is in MODULE_KEYS)
default_enabled: yes

### Gaps to fix

- Add `@ModuleEnabled('admissions')` class-level to 6 controllers: admission-forms.controller.ts, admissions-dashboard.controller.ts, admissions-payment.controller.ts, applications.controller.ts, parent-applications.controller.ts, public-admissions.controller.ts. All use AuthGuard + PermissionGuard; add ModuleEnabledGuard.
- Add module state check to cron dispatchers in apps/worker/src/processors/admissions/\*.processor.ts (admissions-payment-expiry, admissions-payment-link-generation, admissions-application-received, admissions-application-withdrawn) to skip on disabled module.
- Frontend: Add `moduleKey='admissions'` to hub-tile or nav item filter in nav-config.ts (currently hardcoded to nav section without gating).

### Disable impact

hidden_when_off: [/admissions hub and sub-pages, /applications parent portal route, Admissions nav item]
data_status: Data preserved in DB (Application, payment events, form definitions remain intact and searchable). New applications cannot be submitted/processed. Existing payment links become inaccessible.
risk_if_disabled_today: medium — Active applications mid-process could be orphaned if disabled. Tenants likely have in-flight payments/approvals. Re-enabling should be safe (no data loss) but workflows resume in the middle.
risk_if_re_enabled_later: low — No data inconsistency concerns. Payment link expiry checks and state machine transitions resume normally. Household/student data intact.

========================================

## Module: gradebook

display_name_proposal: "Gradebook & Report Cards"
description_proposal: "Grade entry, assessment management, report card generation, and transcript publishing"

### API

api_module_dir: apps/api/src/modules/gradebook/
controllers:

- assessment-categories.controller.ts: gating=none, key=N/A, endpoints=7
- gradebook-advanced.controller.ts: gating=none, key=N/A, endpoints=33
- gradebook-insights.controller.ts: gating=none, key=N/A, endpoints=28
- gradebook.controller.ts: gating=none, key=N/A, endpoints=48
- grading-scales.controller.ts: gating=none, key=N/A, endpoints=5
- parent-gradebook.controller.ts: gating=none, key=N/A, endpoints=6
- transcripts.controller.ts: gating=none, key=N/A, endpoints=2
- report-card-overall-comments.controller.ts: gating=none, key=N/A, endpoints=5
- report-card-subject-comments.controller.ts: gating=none, key=N/A, endpoints=10
- report-card-teacher-requests.controller.ts: gating=none, key=N/A, endpoints=8
- report-card-tenant-settings.controller.ts: gating=none, key=N/A, endpoints=4
- report-cards-enhanced.controller.ts: gating=none, key=N/A, endpoints=44
- report-cards.controller.ts: gating=none, key=N/A, endpoints=18
- report-comment-windows.controller.ts: gating=none, key=N/A, endpoints=9
  exported_services: [GradebookReadFacade, ReportCardModule, TranscriptsService]
  consumed_by_modules: [compliance, early-warning, reports, scheduling-runs]

### Frontend

routes: [/gradebook (hub), /gradebook/class/:classId, /gradebook/settings, /gradebook/analytics, /report-cards (admin/teacher), /report-comments, /transcripts]
nav_locations: [nav.gradebook at /gradebook (nav-config.ts:95, Assessment Records section), nav.reportCards at /report-cards (nav-config.ts:97, Assessment Records section)]
module_aware_files: [none found]

### Worker

queues: [GRADEBOOK]
crons: [GRADEBOOK_DETECT_RISKS_JOB (hourly per-tenant), REPORT_CARD_AUTO_GENERATE_JOB (weekly per-tenant)]
processors: [gradebook-risk-detection.processor.ts, report-card-auto-generate.processor.ts, report-card-generation.processor.ts, mass-report-card-pdf.processor.ts, s3-report-card-storage-writer.ts]

### Data

primary_tables: [Grade, Assessment, AssessmentCategory, PeriodGradeSnapshot, YearGroupGradeWeight, RubricGrade, AssessmentTemplate, GradeThresholdConfig, GradeCurveAudit, GradeEditAudit, AssessmentUnlockRequest]
table_count: ~11

### Permissions

permission_count: 10
sample_permission_keys: [gradebook.manage, gradebook.view, gradebook.publish_report_cards, gradebook.enter_grades, gradebook.approve_ai_grading, gradebook.publish_grades_to_parents]

### Notifications

notification_types: [report_card.published]

### PDF

template_keys: [report-card, report-card-modern, transcript] (multiple locales: -en, -ar)

### Current gating state

api_enforcement: none (14 controllers, zero @ModuleEnabled)
frontend_enforcement: none (no hook/check in nav or routes)
worker_enforcement: none (crons dispatch per-tenant but do not check module state; risk: report card auto-generation runs even if disabled)
in_seed_module_keys: yes (gradebook is in MODULE_KEYS)
default_enabled: yes

### Gaps to fix

- Add `@ModuleEnabled('gradebook')` class-level to all 14 controllers + add ModuleEnabledGuard to @UseGuards. Currently only use AuthGuard + PermissionGuard.
- Add module state check to gradebook cron processors (gradebook-risk-detection, report-card-auto-generate, report-card-generation, mass-report-card-pdf, s3-report-card-storage-writer) to skip execution on disabled module.
- Frontend: Filter nav items gradebook, reportCards, reportComments based on module state via useModuleEnabled hook in nav-config/layout.

### Disable impact

hidden_when_off: [/gradebook hub, /gradebook/*, /report-cards, /report-comments, nav items for "Gradebook" and "Report Cards"]
data_status: All grades, assessments, report cards, transcripts remain in DB. Read-only access via direct DB queries, but API endpoints 403. Report card PDF generation paused (already-generated PDFs remain in S3). Existing grades inaccessible via API/UI.
risk_if_disabled_today: high — Teachers mid-grading period lose access to enter grades; report card deadlines could be missed. Tenants typically have active grading cycles (assignments in progress, pending publishing). End-of-term disruption likely.
risk_if_re_enabled_later: low — Grades intact, no state machine to resume. Risk: stale cache in GradePublishingService or dangling unlock requests if re-enabled after expiry window. Report card auto-generation may trigger backlog on re-enable (batch processing safeguard needed).

========================================

## Module: homework

display_name_proposal: "Homework & Assignments"
description_proposal: "Set, submit, and track homework assignments; analytics and completion monitoring"

### API

api_module_dir: apps/api/src/modules/homework/
controllers:

- homework-analytics.controller.ts: gating=none, key=N/A, endpoints=10
- homework-completions.controller.ts: gating=none, key=N/A, endpoints=8
- homework-diary.controller.ts: gating=none, key=N/A, endpoints=6
- homework-parent.controller.ts: gating=none, key=N/A, endpoints=6
- homework-student.controller.ts: gating=none, key=N/A, endpoints=8
- homework.controller.ts: gating=none, key=N/A, endpoints=20
  exported_services: [HomeworkService, HomeworkCompletionsService]
  consumed_by_modules: [none found directly; likely imported by academics/classes for integration]

### Frontend

routes: [/homework (hub), /homework/assignments, /homework/assigned-to-me, /homework/set, /homework/analytics, /homework/diary, /learning/homework (student)]
nav_locations: [nav.homework at /homework (nav-config.ts:96, Assessment Records section)]
module_aware_files: [none found]

### Worker

queues: [HOMEWORK]
crons: [HOMEWORK_COMPLETION_REMINDER_JOB (daily per-tenant), HOMEWORK_DIGEST_JOB (weekly per-tenant), HOMEWORK_GENERATE_RECURRING_JOB (daily per-tenant), HOMEWORK_OVERDUE_DETECTION_JOB (daily per-tenant)]
processors: [completion-reminder.processor.ts, digest-homework.processor.ts, generate-recurring.processor.ts, homework-queue.processor.ts, overdue-detection.processor.ts]

### Data

primary_tables: [HomeworkAssignment, HomeworkSubmission, HomeworkCompletion, HomeworkSubmissionAttachment, HomeworkAttachment, HomeworkRecurrenceRule]
table_count: ~6

### Permissions

permission_count: 7
sample_permission_keys: [homework.view, homework.manage, homework.mark_own, homework.view_diary, homework.write_diary, homework.view_analytics, homework.submit.own]

### Notifications

notification_types: [] (unverified; likely homework.assigned, homework.overdue, homework.submitted)

### PDF

template_keys: [] (homework PDFs not found in pdf-rendering/templates/)

### Current gating state

api_enforcement: none (6 controllers, zero @ModuleEnabled)
frontend_enforcement: none
worker_enforcement: none (crons run per-tenant without module check; risk: reminders/digests send even if disabled)
in_seed_module_keys: yes (homework is in MODULE_KEYS)
default_enabled: yes

### Gaps to fix

- Add `@ModuleEnabled('homework')` class-level to all 6 controllers + add ModuleEnabledGuard to @UseGuards.
- Add module state check to all homework cron processors (completion-reminder, digest-homework, generate-recurring, homework-queue, overdue-detection) to skip on disabled module.
- Frontend: Filter nav item homework via useModuleEnabled hook.

### Disable impact

hidden_when_off: [/homework hub and sub-pages, /learning/homework, nav item "Homework"]
data_status: All homework assignments, submissions, attachments remain in DB. API 403 on access. Recurring rules paused (no new assignments auto-generated). Student submissions trapped in pending state. Read-only DB access via direct queries only.
risk_if_disabled_today: medium — Teachers cannot assign new homework; in-flight submissions cannot be marked. Students cannot submit or view assigned work. Recurring weekly assignments skip. Active learning disrupted.
risk_if_re_enabled_later: low — Data intact. Risk: orphaned submissions if submission window closes while disabled (stale records marked manually overdue). Recurring generation resumes on re-enable (backlog of missed dates possible, but safe).

========================================

## Module: sen

display_name_proposal: "Special Educational Needs"
description_proposal: "SEN profile management, support plans, professional involvement, resource allocation, and transition planning"

### API

api_module_dir: apps/api/src/modules/sen/
controllers:

- sen-accommodation.controller.ts: gating=class, key='sen', endpoints=5
- sen-goal.controller.ts: gating=class, key='sen', endpoints=10
- sen-professional.controller.ts: gating=class, key='sen', endpoints=4
- sen-profile.controller.ts: gating=class, key='sen', endpoints=6
- sen-reports.controller.ts: gating=class, key='sen', endpoints=5
- sen-resource.controller.ts: gating=class, key='sen', endpoints=7
- sen-sna.controller.ts: gating=class, key='sen', endpoints=6
- sen-support-plan.controller.ts: gating=class, key='sen', endpoints=6
- sen-transition.controller.ts: gating=class, key='sen', endpoints=3
  exported_services: [SenProfileService, SenScopeService, SenSupportPlanService, SenReadFacade]
  consumed_by_modules: [pastoral (via SenModule import)]

### Frontend

routes: [/sen (hub), /sen/students, /sen/profiles, /sen/support-plans, /sen/resource-allocation, /sen/sna-assignments, /sen/reports, /parent/sen (parent portal)]
nav_locations: [nav.sen at /sen (nav-config.ts:149, staff roles), nav.senParent at /parent/sen (nav-config.ts:55, parent role)]
module_aware_files: [/settings/sen (settings page exists; unverified if gated)]

### Worker

queues: [] (no dedicated SEN queue found)
crons: [] (no SEN-specific cron jobs found)
processors: [] (no SEN-specific processors in apps/worker/src/processors/sen/)

### Data

primary_tables: [SenProfile, SenSupportPlan, SenGoal, SenGoalStrategy, SenGoalProgress, SenResourceAllocation, SenSnaAssignment, SenProfessionalInvolvement, SenAccommodation, SenTransitionNote]
table_count: ~10

### Permissions

permission_count: 5
sample_permission_keys: [sen.view, sen.manage, sen.manage_resources, sen.view_sensitive, sen.admin]

### Notifications

notification_types: [] (unverified)

### PDF

template_keys: [] (no SEN-specific PDF templates found)

### Current gating state

api_enforcement: full (all 9 controllers have @ModuleEnabled('sen') at class level + ModuleEnabledGuard in @UseGuards)
frontend_enforcement: partial (nav items present but no useModuleEnabled hook check found; routes may be inaccessible at 403 but nav rendered)
worker_enforcement: none (no crons to gate; manual processes only via API)
in_seed_module_keys: yes (sen is in MODULE_KEYS)
default_enabled: no (sen is explicitly set default_enabled=false in tenant fixture, line 115 of tenant-fixture.builder.ts)

### Gaps to fix

- Frontend: Add `moduleKey='sen'` to useModuleEnabled hook check in nav-config filtering for nav.sen and nav.senParent items. Currently nav renders but routes 403; improve UX by hiding nav items when disabled.
- Optional: Add PDF template keys for SEN reports if report generation is added later.

### Disable impact

hidden_when_off: [/sen hub and sub-pages, /parent/sen, nav items "SEN" (staff)]
data_status: All SEN profiles, support plans, goals, accommodations, resource allocations remain in DB (RLS-protected). API 403 on all endpoints. Reports become ungenerable. Parent portal SEN access blocked.
risk_if_disabled_today: low — SEN is disabled by default in fixture (opt-in module). Schools using it actively have it enabled. Disabling removes access to active support plans (workflow disruption). Risk of stale goals/progress records if plans remain in mid-review.
risk_if_re_enabled_later: low — No data loss or inconsistency. SEN profiles, plans, and goals persist. Progress records remain intact for audit/historical review. Re-enable should be seamless.

========================================

## Summary table (batch 1)

| Module     | API Enforcement | Frontend Enforcement | Worker Enforcement | Seed Status | Default | Risk Level |
| ---------- | --------------- | -------------------- | ------------------ | ----------- | ------- | ---------- |
| admissions | none            | none                 | none               | yes         | yes     | medium     |
| gradebook  | none            | none                 | none               | yes         | yes     | high       |
| homework   | none            | none                 | none               | yes         | yes     | medium     |
| sen        | full            | partial              | none               | yes         | no      | low        |

**Key patterns:**

- Admissions, gradebook, homework: zero API gating (all 27 controllers undecorated). Zero frontend checks. Crons dispatch per-tenant but skip module state.
- SEN: fully gated at API (all 9 controllers decorated). Frontend nav renders but routes 403 (missing hook). No crons (manual only).
- Workers: None of the 4 modules check module state in cron dispatchers; risk of sending notifications, auto-generating reports, etc. even when disabled.
- Fixture: SEN is the only module with default_enabled=false, confirming it's opt-in. Admissions/gradebook/homework are on by default.
