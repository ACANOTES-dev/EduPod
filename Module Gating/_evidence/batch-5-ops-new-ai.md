# Deep-Dive Evidence — Batch 5 (Operations + New Toggles + AI)

> Raw agent investigation report. Saved verbatim from the deep-dive pass on 2026-05-13.
> Modules: auto_scheduling (scheduling key), leave, school_closures, ai_functions, compliance_advanced.
> Includes the AI surfaces analysis and compliance/regulatory split recommendation.

========================================

## Module: auto_scheduling

display_name_proposal: "Automated Timetable Scheduling"
description_proposal: "Auto-scheduler, exam solver, substitution handling, and scheduling analytics."

### API

api_module_dirs: `apps/api/src/modules/scheduling/`, `apps/api/src/modules/scheduling-runs/`
controllers:

- scheduling-enhanced.controller.ts: gating=none, key=none, endpoints=53
- scheduling-public.controller.ts: gating=none, key=none, endpoints=1
- exam-scheduling-v2.controller.ts: gating=none, key=none, endpoints=12
- scheduler-orchestration.controller.ts: gating=none, key=none, endpoints=8
- scheduler-validation.controller.ts: gating=none, key=none, endpoints=1
- break-groups.controller.ts: gating=none, key=none, endpoints=4
- curriculum-requirements.controller.ts: gating=none, key=none, endpoints=8
- substitute-competencies.controller.ts: gating=none, key=none, endpoints=11
- teacher-competencies.controller.ts: gating=none, key=none, endpoints=11
- teacher-scheduling-config.controller.ts: gating=none, key=none, endpoints=4
- room-closures.controller.ts: gating=none, key=none, endpoints=3
- scheduling-dashboard.controller.ts: gating=none, key=none, endpoints=6
- scheduling-runs.controller.ts: gating=none, key=none, endpoints=14
  exported_services: [SchedulingEnhancedService, SchedulerOrchestrationService, ExamSchedulingService, SchedulingAnalyticsService, SchedulerValidationService, break-groups, curriculum-requirements, substitute-competencies, teacher-competencies]
  consumed_by_modules: [leave (cover notifications), communications (notifications), notifications]

### Frontend

routes: [/scheduling, /scheduling/auto, /scheduling/exam-schedules, /scheduling/dashboard, /scheduling/period-grid, /scheduling/curriculum, /scheduling/requirements, /scheduling/break-groups, /scheduling/teacher-config, /scheduling/my-timetable, /scheduling/my-satisfaction, /scheduling/cover-reports, /scheduling/room-closures, /scheduling/preferences]
nav_locations: [school hub/Scheduling, settings area]
module_aware_files: [no frontend enforcement found]

### Worker

queues: [SCHEDULING, EXAM_SCHEDULING]
crons: [SCHEDULING_REAP_STALE_JOB at cadence ~daily, auto-lock at 23:00 UTC]
processors: [SolverV2Processor (QUEUE_NAMES.SCHEDULING), ExamSolverProcessor (QUEUE_NAMES.EXAM_SCHEDULING), SchedulingStaleReaperProcessor]

### Data

primary_tables: [Schedule, SchedulePeriodTemplate, RoomClosure, ScheduleScenario, SchedulingRun, BreakGroup, CurriculumRequirement, SubstituteCompetency, TeacherCompetency, ExamSession, ExamSessionSlot, ExamInvigilator, ExamSubstitutionRequest]
table_count: ~15

### Permissions

permission_count: ~25 (unverified)
sample_permission_keys: [scheduling.view, scheduling.manage, scheduling.schedule_class, scheduling.manage_cover, exam_scheduling.manage]

### Notifications

notification_types: [cover.requested, cover.assigned, cover.declined, scheduling.published, exam_session.published, exam_invigilation.assigned]

### PDF

template_keys: [exam-schedule, class-timetable (unverified)]

### Current gating state

api_enforcement: none
frontend_enforcement: none
worker_enforcement: none (queues always process)
in_seed_module_keys: yes (auto_scheduling)
default_enabled: yes

### Gaps to fix

- No @ModuleEnabled decorator on any scheduling controller
- No @ModuleEnabled on processor entry points — solver jobs run even if module is "disabled"
- No frontend check for module state — all routes visible
- CP-SAT sidecar has no way to know if scheduling is gated; jobs queue regardless
- `apps/api/src/modules/scheduling-runs/scheduling-dashboard.controller.ts` and ExamSchedulingService need gating
- `apps/worker/src/processors/scheduling/solver-v2.processor.ts` needs per-tenant module check in process()
- `apps/web/src/app/[locale]/(school)/scheduling/*` routes need dynamic visibility based on tenantModules

### Disable impact

hidden_when_off: [Scheduling hub + all sub-routes, exam scheduling UX, timetable views, cover request flows]
data_status: SchedulingRun rows + active scenarios persist; data not deleted. Re-enable at any time reads fresh state.
risk_if_disabled_today: high — 115+ endpoints across 13 controllers; exam solver + cover cascade are mission-critical in most schools. Disabling breaks school operations.
risk_if_re_enabled_later: medium — stale runs may exist; old scenarios orphaned. Reaper job + re-solves needed to catch up.

========================================

## Module: leave

display_name_proposal: "Staff Leave Management"
description_proposal: "Leave request workflows, leave type definitions, and cover coordination with scheduling."

### API

api_module_dir: `apps/api/src/modules/leave/`
controllers:

- leave-requests.controller.ts: gating=none, key=none, endpoints=13
- payroll-attendance.controller.ts: gating=none, key=none, endpoints=1
  exported_services: [LeaveRequestsService, LeaveTypesService]
  consumed_by_modules: [scheduling (cover cascade), payroll, attendance]

### Frontend

routes: [/leave, /settings/leave-types, /scheduling/leave-requests]
nav_locations: [school hub/Leave, settings area]
module_aware_files: [none found]

### Worker

queues: [COMPLIANCE queue used for leave-related audits (unverified)]
crons: [none specific to leave]
processors: [none specific to leave]

### Data

primary_tables: [LeaveRequest, LeaveType, LeaveRequestApproval]
table_count: ~3

### Permissions

permission_count: 3
sample_permission_keys: [leave.submit_request, leave.approve_requests, leave.manage_types]

### Notifications

notification_types: [leave_request.submitted, leave_request.approved, leave_request.rejected, cover.requested_for_leave]

### PDF

template_keys: [leave-form (unverified)]

### Current gating state

api_enforcement: none
frontend_enforcement: none
worker_enforcement: none
in_seed_module_keys: **NO — NOT in MODULE_KEYS seed array**
default_enabled: no (inferred — and currently blocked by guard)

### Gaps to fix

- Module key does not exist in seed (MODULE_KEYS array) at `apps/api/test/tenant-fixture.builder.ts`
- No @ModuleEnabled decorators on leave-requests.controller.ts or payroll-attendance.controller.ts
- Add 'leave' to MODULE_KEYS in seed
- Create class-level @ModuleEnabled('leave') on LeaveRequestsController
- Frontend routes /leave and /settings/leave-types need visibility gating

### Disable impact

hidden_when_off: [Leave hub, leave request forms, leave request approval dashboard, leave type management]
data_status: LeaveRequest rows persist; no data deletion. Re-enable shows historical requests.
risk_if_disabled_today: medium — leave is critical for HR/payroll teams but can run on paper fallback for short periods.
risk_if_re_enabled_later: low — re-enable allows resume of requests; existing data intact.

========================================

## Module: school_closures

display_name_proposal: "School Closures & Closures Management"
description_proposal: "Manage holiday periods, emergency closures, and scheduled school non-instructional days."

### API

api_module_dir: `apps/api/src/modules/school-closures/`
controllers:

- school-closures.controller.ts: gating=none, key=none, endpoints=4
  exported_services: [SchoolClosuresService]
  consumed_by_modules: [scheduling (timetable generation), attendance, finance (term calendars)]

### Frontend

routes: [/settings/school-closures (inferred)]
nav_locations: [settings area/Calendar & Closures]
module_aware_files: [none found]

### Worker

queues: [none specific]
crons: [none specific]
processors: [none specific]

### Data

primary_tables: [SchoolClosure]
table_count: ~1

### Permissions

permission_count: ~2 (unverified)
sample_permission_keys: [school_closures.manage, school_closures.view]

### Notifications

notification_types: [school_closure.announced (unverified)]

### PDF

template_keys: [none]

### Current gating state

api_enforcement: none
frontend_enforcement: none
worker_enforcement: none
in_seed_module_keys: **NO — NOT in MODULE_KEYS seed array**
default_enabled: no (inferred)

### Gaps to fix

- Module key does not exist in seed (MODULE_KEYS array)
- No @ModuleEnabled decorators on school-closures.controller.ts
- Add 'school_closures' to MODULE_KEYS
- Add @ModuleEnabled('school_closures') to SchoolClosuresController class level
- Frontend route for school closures management needs visibility gating
- **Decision**: closures are READ by scheduling/attendance services. Disabling school_closures hides UI but doesn't stop scheduling from honouring previously-set closures. Document this.

### Disable impact

hidden_when_off: [School closures settings/management UI]
data_status: SchoolClosure rows persist; no deletion. Re-enable shows historical closures used by scheduling engine.
risk_if_disabled_today: low to medium — disabling hides the UI but doesn't stop scheduling from reading closures.
risk_if_re_enabled_later: low — re-enable restores UI access; data intact.

========================================

## Module: ai_functions

display_name_proposal: "AI-Powered Features Across Modules"
description_proposal: "Toggles AI across reports (ask-ai, predictions, narration), behaviour/pastoral analysis, and scheduling AI substitution."

### API

ai_module_dir: Not a single module. AI surfaces live in:

- `apps/api/src/modules/ai/` (Anthropic client)
- `apps/api/src/modules/ai-flags/` (per-tenant AI flags + guard)
- `apps/api/src/modules/reports/ai-ask-ai/`, `ai-narration/`, `ai-predictions/`
- `apps/api/src/modules/behaviour/ai/`
- `apps/api/src/modules/pastoral/` (SST AI)
- `apps/api/src/modules/scheduling/ai-substitution.service.ts`
- `apps/api/src/modules/gradebook/ai/` (AI comments, grading, progress summary)
- `apps/api/src/modules/gdpr/ai-audit.service.ts`
- `apps/api/src/modules/attendance/attendance-scan.service.ts` (AI-assisted scan)

ai_controllers_with_flags:

- ai-ask-ai.controller.ts: @RequiresAiFlag('reports_ask_ai'), endpoints=3
- ai-predictions.controller.ts: @RequiresAiFlag('reports_predictions'), endpoints=4
- behaviour-ai.controller.ts: @RequiresAiFlag('behaviour'), endpoints=4
- pastoral/sst.controller.ts: @RequiresAiFlag('pastoral'), endpoints=N (unverified)
- ai-flags.controller.ts: @RequiresPermission('ai_flag.manage'), endpoints=2

### Frontend

routes: [/reports/ask-ai, /reports/predictions, /reports/narration, /settings/ai-flags]
nav_locations: [reports hub/AI features, settings/AI management]
module_aware_files: [`apps/web/src/hooks/use-ai-flag.ts` (hook for checking per-AI-surface flags)]

### Worker

queues: [REPORTS (for AI report generation)]
crons: [none specific]
processors: [none specific]

### Data

primary_tables: [tenant_ai_flag (per-tenant, per-surface toggle), ai_audit_log (GDPR compliance for AI access)]
table_count: ~2

### Permissions

permission_count: ~6
sample_permission_keys: [ai_flag.manage, reports.ai.ask_ai, reports.ai.predictions, behaviour.ai, pastoral.ai.sst]

### Notifications

notification_types: [none found]

### PDF

template_keys: [none — AI features are UX-time, not PDF-time]

### Current gating state

api_enforcement: partial — **AI-specific surfaces (@RequiresAiFlag) already have per-surface gating**. But non-decorated AI (gradebook comments, substitution, attendance scan) have no gating.
frontend_enforcement: partial — /reports/ask-ai, /predictions, /behaviour routes check useAiFlag hook
worker_enforcement: none
in_seed_module_keys: yes (ai_functions)
default_enabled: yes

### AI-Surface Breakdown (Recommendation: ONE big toggle vs. per-surface)

**Current architecture:** 5 separate `tenant_ai_flag` rows per tenant (reports_ask_ai, reports_predictions, reports_narration, behaviour, pastoral). Each can be toggled independently.

**Recommendation for ai_functions toggle:** **UNIFY UNDER ONE ai_functions TOGGLE** at the module-gating layer, while keeping the existing per-surface AI flags as a finer-grained admin tool. This gives:

- Tenant-level: `ai_functions` ON/OFF — controls whether AI is available at all (admin console)
- Sub-tenant: ai-flags table — controls which specific AI surfaces are enabled when ai_functions is ON
- Disabling ai_functions globally turns off AI regardless of per-surface flags
- This is simpler for the admin console UI; per-surface tuning stays in the existing settings page

**Undecorated AI surfaces (HIGH RISK — no gating):**

1. `apps/api/src/modules/gradebook/ai/` (ai-comments, ai-grading, ai-progress-summary) — no @RequiresAiFlag or @ModuleEnabled
2. `apps/api/src/modules/scheduling/ai-substitution.service.ts` — used by solver; no gating
3. `apps/api/src/modules/attendance/attendance-scan.service.ts` — no gating
4. `apps/api/src/modules/gdpr/ai-audit.service.ts` — reads AI access logs; minimal enforcement

**Recommendation:** Add @ModuleEnabled('ai_functions') guard to all AI-touching controllers (or wrap their callable services with a check). The existing @RequiresAiFlag remains for finer per-surface control.

### Gaps to fix

- `apps/api/src/modules/gradebook/ai/*.service.ts`: NO @RequiresAiFlag decorators; AI is called by non-gated gradebook controllers
- `apps/api/src/modules/scheduling/ai-substitution.service.ts`: called during solve() without AI flag check
- `apps/api/src/modules/attendance/attendance-scan.service.ts`: no AI flag validation
- `apps/api/src/modules/ai/anthropic-client.service.ts`: rate limit + credit check exists but no module state awareness — RECOMMEND adding a top-level check here as a safety net

### Disable impact

hidden_when_off: [Reports/ask-ai, predictions, narration routes; behaviour-ai summary routes; pastoral-ai SST; gradebook AI features once gated]
data_status: AI audit logs, saved predictions persist. Re-enable shows historical AI results.
risk_if_disabled_today: low to medium — AI features are "nice-to-have" not critical; disabling removes recommendations but doesn't break core flows. **Exception:** if gradebook AI is wired without gating, disabling ai_functions doesn't actually stop gradebook AI from running.
risk_if_re_enabled_later: low — AI surfaces stateless; re-enable resumes generation.

========================================

## Module: compliance_advanced

display_name_proposal: "Advanced Compliance & Regulatory Reporting"
description_proposal: "Regulatory submission (DES, TUSLA, PPOD, CBA, calendar events), advanced audit, retention policies, and optional GDPR features beyond core consent."

### API

api_module_dirs:

- `apps/api/src/modules/compliance/` (core DSAR, retention policies)
- `apps/api/src/modules/regulatory/` (DES, TUSLA, PPOD, CBA, calendar, submissions)
- `apps/api/src/modules/gdpr/` (consent, privacy notices, AI audit, DPA acceptance)

compliance_controllers:

- compliance.controller.ts: gating=none, key=none, endpoints=11 (DSAR, compliance requests, classifications)
- retention-policies.controller.ts: gating=none, key=none, endpoints=6
- regulatory.controller.ts: gating=none, key=none, endpoints=67 (DES, TUSLA, PPOD, CBA, calendar, transfers, staff vetting)
- gdpr/\*.controller.ts (7 controllers): endpoints=27 total (consent, privacy notices, legal DPA, parent consent, AI audit, etc.)

exported_services: [ComplianceService, RetentionPoliciesService, GdprTokenService, RegulatoryService (10+ regulatory-* services)]
consumed_by_modules: [reports (compliance reports), security (audit logs), notifications]

### Frontend

routes: [/reports/compliance, /settings/compliance, /settings/retention, /settings/regulatory]
nav_locations: [settings/Compliance & Regulatory, reports/Compliance]
module_aware_files: [none found]

### Worker

queues: [COMPLIANCE, REGULATORY]
crons: [regulatory calendar sync, DSAR data retrieval batches, retention policy execution]
processors: [regulatory submission processors, DSAR traversal]

### Data

primary_tables: [ComplianceRequest, ComplianceReportTemplate, ComplianceReportGeneration, RetentionPolicy, RegulatorySubmission, RegulatoryCalendarEvent, DpaAgreement, ConsentRecord, PrivacyNotice, AiAuditLog, SubProcessorAgreement]
table_count: ~15

### Permissions

permission_count: ~15 (unverified)
sample_permission_keys: [compliance.manage, compliance.view, analytics.manage_compliance, gdpr.view, gdpr.manage, regulatory.manage, regulatory.submit]

### Notifications

notification_types: [compliance_request.due_soon, compliance_request.overdue, submission.ready_for_review, dsar.data_ready]

### PDF

template_keys: [safeguarding-compliance, dpa-agreement (unverified)]

### Current gating state

api_enforcement: none — **all compliance/regulatory/GDPR controllers undecorated**
frontend_enforcement: none
worker_enforcement: none
in_seed_module_keys: no — only 'compliance' exists; no 'compliance_advanced' key
default_enabled: no (inferred for advanced)

### LEGAL ANALYSIS: Core vs Advanced

**ALWAYS-ON (Core Compliance — NOT gateable for legal reasons):**

1. DPA acceptance (legal requirement in EU/UK)
2. Consent records (GDPR Art. 7)
3. Privacy notices (GDPR Art. 14, 13)
4. AI audit logging (GDPR + emerging AI regulation)
5. DSAR handling (GDPR Art. 15+)
6. Data retention policies (basic — GDPR Art. 5(1)(e))
7. Sub-processor list (GDPR Art. 28 + DPA Schedules)

**OPTIONAL ADD-ONS (Can be gated — regulatory reporting for specific regions):**

1. DES (Irish school inspections) — only schools in Ireland
2. TUSLA (Irish child protection reporting) — only schools in Ireland
3. PPOD (Irish payroll data) — only schools with payroll
4. CBA (Competency-based assessment) — optional curriculum feature
5. Regulatory calendar events — optional
6. Advanced retention policies (beyond GDPR minimums) — can be "basic retention" (always on) vs "advanced policies" (gateable)

**Recommendation — Split as follows:**

- Keep `compliance` key for ALWAYS-ON (core GDPR, DPA, consent, privacy notices, DSAR, data retention, audit logs, sub-processors). Remove from MODULE_KEYS toggle list (it's core, not gateable).
- Add `compliance_advanced` key for OPTIONAL (DES, TUSLA, PPOD, CBA, regulatory submissions, regulatory calendar, advanced audit trails)
- Gate all DES/TUSLA/PPOD/CBA controllers under @ModuleEnabled('compliance_advanced')
- Gate regulatory.controller.ts endpoints by operation type (DES = advanced, basic submissions = core)

### Gaps to fix

- No @ModuleEnabled decorators on compliance.controller.ts, retention-policies.controller.ts, or regulatory.controller.ts
- regulatory.controller.ts has 67 endpoints — need per-endpoint gating: DES/TUSLA/PPOD under 'compliance_advanced', core under always-on
- `apps/api/src/modules/regulatory/regulatory.controller.ts`: split into two routes or use per-method gating
- `apps/api/src/modules/gdpr/`: all 7 controllers must remain ungated (legal requirement)
- Add 'compliance_advanced' to MODULE_KEYS in seed
- Frontend: /settings/compliance, /settings/regulatory must be visible always; sub-sections (DES, TUSLA) conditional on compliance_advanced

### Disable impact

hidden_when_off: [DES/TUSLA/PPOD submission UI, regulatory calendar management, CBA features, advanced compliance reports]
data_status: ComplianceRequest, AiAuditLog, PrivacyNotice, ConsentRecord rows persist (core GDPR data — cannot delete). RegulatorySubmission rows persist for archive.
risk_if_disabled_today: HIGH — **If you disable and someone asks "show me our GDPR audit logs" or "export consent records," you cannot — core compliance features become inaccessible.** Only safe to disable if you remove the permission gates too (separate act). Hence the split.
risk_if_re_enabled_later: medium — old regulatory submissions orphaned unless backfilled; DSAR queries may be stale.

========================================

## AI SURFACES ANALYSIS & RECOMMENDATION

**Current state:** AI flag system (`@RequiresAiFlag`) exists in 5 controllers with per-surface gating (reports_ask_ai, reports_predictions, reports_narration, behaviour, pastoral). The `ai_functions` module key exists in seed but is NOT used by any @ModuleEnabled decorator.

**Problem:** Gradebook AI, scheduling AI substitution, attendance scan AI, and GDPR audit AI run without any gating. If you add @ModuleEnabled('ai_functions') to something, it won't stop these undecorated surfaces.

**Recommendation: Layer the gates.**

1. Top layer: @ModuleEnabled('ai_functions') on every AI-touching controller. This is the admin console toggle — "AI on/off for this tenant."
2. Inner layer: existing @RequiresAiFlag stays — finer-grained per-surface control inside the AI flags settings page (this is for tenant admins to disable specific AI features without disabling all AI).
3. Service-layer fallback: AnthropicClientService.beforeRequest() checks tenant module state as a safety net for any AI call that bypassed both layers (gradebook, scheduling AI substitution).

This way the admin console gets a clean single AI toggle while preserving the existing per-surface configurability for power-user tenants.

========================================

## COMPLIANCE SPLIT RECOMMENDATION

**Split `compliance` into two keys:**

1. **`compliance` (core, always-on, no module toggle):** DSAR, consent records, privacy notices, DPA acceptance, data retention (basic level), audit logs, sub-processor list, AI audit logging. **Remove from gateable list — promote to core.**
2. **`compliance_advanced` (optional, gateable):** DES, TUSLA, PPOD, CBA, advanced retention policies, regulatory submissions, regulatory calendar sync, advanced audit trails

**Implementation:**

- Keep all GDPR/DPA controllers ungated (`/gdpr/*` undecorated)
- Gate DES/TUSLA/PPOD/CBA routes in regulatory.controller.ts with @ModuleEnabled('compliance_advanced') at method level
- Gate advanced retention policy routes with @ModuleEnabled('compliance_advanced')
- Add frontend route guards to hide DES/TUSLA/PPOD management when compliance_advanced=off

This way, schools can't accidentally delete core GDPR data by disabling the module, but they can turn off optional regional reporting if not relevant.
