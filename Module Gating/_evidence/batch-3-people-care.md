# Deep-Dive Evidence — Batch 3 (People Care)

> Raw agent investigation report. Saved verbatim from the deep-dive pass on 2026-05-13.
> Modules: pastoral, behaviour, staff_wellbeing, early_warning.
> Includes critical guard analysis: `ModuleEnabledGuard` missing-row behaviour.

## CRITICAL: ModuleEnabledGuard Missing-Row Behaviour

From `apps/api/src/common/guards/module-enabled.guard.ts` lines 70–90:

```typescript
private async getEnabledModules(tenantId: string): Promise<string[]> {
  const cached = await client.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Query tenant_modules — runs outside RLS transaction context
  const modules = await this.prisma.tenantModule.findMany({
    where: { tenant_id: tenantId, is_enabled: true },
    select: { module_key: true },
  });

  const moduleKeys = modules.map((m) => m.module_key);

  await client.setex(cacheKey, this.MODULE_CACHE_TTL, JSON.stringify(moduleKeys));

  return moduleKeys;
}
```

**Verdict:** If a module key has no `tenantModule` row (or the row has `is_enabled: false`), it **WILL NOT be in the returned array**. The guard then throws `ForbiddenException` — the module is **completely blocked**. This means `early_warning` is currently **inaccessible to all tenants** until they have an explicit `tenantModule` row with `is_enabled: true`.

**Implication for design**: missing-row behaviour is "deny." This is safer than "allow" but means every module key MUST be in the seed and every tenant MUST have a row inserted. The migration plan must be airtight.

========================================

## Module: pastoral

display_name_proposal: "Pastoral Care & Cases"
description_proposal: "Track concerns, safeguarding cases, interventions, and family contacts with multi-tier triage."

### API

api_module_dir: apps/api/src/modules/pastoral
controllers (15 total):

- cases.controller.ts: gating=class, key='pastoral', endpoints=~12
- checkin-config.controller.ts: gating=class, key='pastoral', endpoints=~6
- pastoral-import.controller.ts: gating=class, key='pastoral', endpoints=~3
- pastoral-dsar.controller.ts: gating=class, key='pastoral', endpoints=~2
- critical-incidents.controller.ts: gating=class, key='pastoral', endpoints=~8
- checkin-admin.controller.ts: gating=class, key='pastoral', endpoints=~5
- pastoral-admin.controller.ts: gating=class, key='pastoral', endpoints=~4
- parent-pastoral.controller.ts: gating=class, key='pastoral', endpoints=~3
- concerns.controller.ts: gating=class, key='pastoral', endpoints=~10
- sst.controller.ts: gating=class, key='pastoral', endpoints=~4
- pastoral-reports.controller.ts: gating=class, key='pastoral', endpoints=~5
- parent-contacts.controller.ts: gating=class, key='pastoral', endpoints=~4
- interventions.controller.ts: gating=class, key='pastoral', endpoints=~8
- referrals.controller.ts: gating=class, key='pastoral', endpoints=~6
- checkins.controller.ts: gating=class, key='pastoral', endpoints=~6
  exported_services: [CaseService, ConcernService, ReferralService, InterventionService, CheckinService, SSTService, ParentContactService, NepsVisitService]
  consumed_by_modules: [regulatory (Tusla escalations), behaviour (safeguarding sync), communications (notifications)]

### Frontend

routes: [/pastoral, /pastoral/cases*, /pastoral/concerns*, /pastoral/critical-incidents*, /pastoral/referrals*, /pastoral/sst*, /pastoral/checkins*, /pastoral/interventions*, /pastoral/import, /pastoral/dsar, /pastoral/self-referral, /pastoral/parent-contacts, /pastoral/reports]
nav_locations: [nav.behaviour section (nav.pastoral item at line 118–120 of nav-config.ts), wellbeing hub basePaths (line 315)]
module_aware_files: nav config does NOT check tenantModule state; frontend relies on API 403s

### Worker

queues: [PASTORAL]
crons: [pastoral:cron-dispatch-overdue (hourly, per-tenant dispatch), pastoral:overdue-actions (per-tenant), pastoral:notify-concern, pastoral:checkin-alert, pastoral:intervention-review-reminder, pastoral:escalation-timeout, pastoral:precompute-agenda]
processors: [PastoralCronDispatchProcessor, PastoralQueueDispatcher, NotifyConcernProcessor, CheckinAlertProcessor, InterventionReviewReminderProcessor, OverdueActionsProcessor, PrecomputeAgendaProcessor, EscalationTimeoutProcessor, WellbeingFlagExpiryProcessor, SyncBehaviourSafeguardingProcessor]

### Data

primary_tables: [PastoralConcern, PastoralConcernInvolvedStudent, PastoralConcernVersion, PastoralCase, PastoralCaseStudent, PastoralIntervention, PastoralInterventionAction, PastoralInterventionProgress, PastoralReferral, PastoralReferralRecommendation, PastoralNepsVisit, PastoralNepsVisitStudent, PastoralParentContact, PastoralEvent, PastoralDsarReview]
table_count: ~15

### Permissions

permission_count: ~23
sample_permission_keys: [pastoral.log_concern, pastoral.view_tier1, pastoral.manage_cases, pastoral.manage_interventions, pastoral.manage_referrals, pastoral.manage_sst, pastoral.manage_checkins]

### Notifications

notification_types: [concern.created, case.escalated, referral.accepted, intervention.reviewed, checkin.due]

### PDF

template_keys: [pastoral_case_summary, pastoral_referral_letter, sst_minutes, neps_visit_record]

### Current gating state

api_enforcement: full
frontend_enforcement: partial — nav shows links but does not check module state
worker_enforcement: full — cron dispatch filters by is_enabled
in_seed_module_keys: yes
default_enabled: yes

### Gaps to fix

- Frontend nav at `apps/web/src/app/[locale]/(school)/layout.tsx` does not check `tenantModule.is_enabled` before filtering nav items — relies on API 403s to block access. Hydrate tenant modules on layout load and filter nav section "nav.behaviour" before render.

### Disable impact

hidden_when_off: [/pastoral*, all sub-routes, nav.pastoral menu item]
data_status: All PastoralCase, PastoralConcern, PastoralIntervention rows remain; UI cannot query them (API 403s).
risk_if_disabled_today: high — safeguarding escalations depend on `pastoral:overdue-actions` cron. Disabling stops escalation timeout checks, potentially missing time-sensitive tier1→tier2 promotions and Tusla notifications.
risk_if_re_enabled_later: Dormant data (unprocessed overdue escalations) could resurface; manual backfill via one-time cron job needed.

========================================

## Module: behaviour

display_name_proposal: "Behaviour & Conduct"
description_proposal: "Log incidents, manage sanctions/exclusions, track awards, and monitor student behaviour patterns."

### API

api_module_dir: apps/api/src/modules/behaviour
controllers (18 total):

- behaviour.controller.ts: gating=class, key='behaviour', endpoints=~8
- behaviour-students.controller.ts: gating=class, key='behaviour', endpoints=~5
- behaviour-tasks.controller.ts: gating=class, key='behaviour', endpoints=~6
- behaviour-sanctions.controller.ts: gating=class, key='behaviour', endpoints=~4
- behaviour-recognition.controller.ts: gating=class, key='behaviour', endpoints=~3
- behaviour-parent.controller.ts: gating=class, key='behaviour', endpoints=~4
- behaviour-admin.controller.ts: gating=class, key='behaviour', endpoints=~6
- behaviour-appeals.controller.ts: gating=class, key='behaviour', endpoints=~5
- behaviour-amendments.controller.ts: gating=class, key='behaviour', endpoints=~3
- behaviour-exclusions.controller.ts: gating=class, key='behaviour', endpoints=~7
- behaviour-config.controller.ts: gating=class, key='behaviour', endpoints=~4
- behaviour-analytics.controller.ts: gating=class, key='behaviour', endpoints=~3
- behaviour-interventions.controller.ts: gating=class, key='behaviour', endpoints=~5
- behaviour-alerts.controller.ts: gating=class, key='behaviour', endpoints=~3
- behaviour-guardian-restrictions.controller.ts: gating=class, key='behaviour', endpoints=~4
- behaviour-acknowledgements.controller.ts: gating=class, key='behaviour', endpoints=~3
- behaviour-documents.controller.ts: gating=class, key='behaviour', endpoints=~4
- behaviour-ai/behaviour-ai.controller.ts: gating=class, key='behaviour', endpoints=~2
  exported_services: [BehaviourIncidentService, BehaviourPolicyService, BehaviourExclusionService, BehaviourInterventionService, BehaviourAwardService, BehaviourTaskService]
  consumed_by_modules: [pastoral (safeguarding sync), communications (parent notifications), regulatory (suspension returns), compliance (data retention)]

### Frontend

routes: [/behaviour and ~16 sub-routes]
nav_locations: [nav.behaviour section at lines 106–122 of nav-config.ts, wellbeing hub basePaths]
module_aware_files: nav config does NOT check module state

### Worker

queues: [BEHAVIOUR]
crons: [behaviour:cron-dispatch-daily (daily, per-tenant), behaviour:cron-dispatch-sla (every 5 min, per-tenant), behaviour:cron-dispatch-monthly (monthly, per-tenant)]
processors: [BehaviourCronDispatchProcessor (3 dispatch jobs), BehaviourQueueDispatcher, BehaviourAckRemindersProcessor, BehaviourCheckAwardsProcessor, BehaviourTaskRemindersProcessor, DigestNotificationsProcessor, BehaviourExclusionDeadlineCheckProcessor, BehaviourGuardianRestrictionCheckProcessor, DetectPatternsProcessor, BehaviourSuspensionReturnProcessor, PartitionMaintenanceProcessor, RefreshMVProcessor, StuckNotificationAlertProcessor, NotificationReconciliationProcessor, RetentionCheckProcessor, DocumentReadyProcessor, EvaluatePolicyProcessor, BehaviourParentNotificationProcessor]

### Data

primary_tables: [BehaviourCategory, BehaviourIncident, BehaviourIncidentParticipant, BehaviourDescriptionTemplate, BehaviourEntityHistory, BehaviourTask, BehaviourParentAcknowledgement, BehaviourSanction, BehaviourAppeal, BehaviourAmendmentNotice, BehaviourExclusionCase, BehaviourAttachment, BehaviourIntervention, BehaviourInterventionIncident, BehaviourInterventionReview, BehaviourRecognitionAward, BehaviourAwardType, BehaviourHouseTeam, BehaviourHouseMembership, BehaviourPolicyRule, BehaviourPolicyRuleAction, BehaviourPolicyRuleVersion, BehaviourPolicyEvaluation, BehaviourPolicyActionExecution, BehaviourAlert, BehaviourAlertRecipient, BehaviourDocument, BehaviourDocumentTemplate, BehaviourGuardianRestriction, BehaviourPublicationApproval, BehaviourLegalHold, BehaviourAiQueryHistory]
table_count: ~32

### Permissions

permission_count: ~9
sample_permission_keys: [behaviour.log, behaviour.view, behaviour.manage, behaviour.admin, behaviour.view_sensitive, behaviour.view_staff_analytics, behaviour.ai_query, behaviour.appeal, behaviour.amend]

### Notifications

notification_types: [incident.logged, exclusion.initiated, award.granted, task.reminder, acknowledgement.requested, suspension.return_reminder]

### PDF

template_keys: [behaviour_incident_report, exclusion_letter, appeal_decision, amendment_notice]

### Current gating state

api_enforcement: full
frontend_enforcement: partial — same as pastoral
worker_enforcement: full — three cron dispatches per-tenant
in_seed_module_keys: yes
default_enabled: yes

### Gaps to fix

- Same as pastoral: frontend nav filtering does not check module state.
- Behaviour worker has 3 cron dispatch jobs (daily, SLA, monthly) — verify all three check tenant module state before enqueuing per-tenant jobs.

### Disable impact

hidden_when_off: [/behaviour* and all sub-routes, nav.behaviour menu section]
data_status: All BehaviourIncident, BehaviourExclusionCase, BehaviourTask rows remain; UI cannot query them (API 403s).
risk_if_disabled_today: high — behaviour cron dispatch checks 3 times daily (exclusion deadlines, award checks, task reminders, digest notifications, ack reminders, SLA checks, pattern detection). Disabling stops all real-time behaviour monitoring and escalation tracking.
risk_if_re_enabled_later: Dormant data (unprocessed tasks, overdue SLA checks, unacknowledged incidents) could cause sudden re-notification spikes; manual audit of `BehaviourTask` and `BehaviourAlertRecipient` recommended before re-enabling.

========================================

## Module: staff_wellbeing

display_name_proposal: "Staff Wellbeing"
description_proposal: "Track staff workload, survey sentiment, aggregate analytics, and support resources."

### API

api_module_dir: apps/api/src/modules/staff-wellbeing
controllers:

- survey.controller.ts: gating=class, key='staff_wellbeing', endpoints=~6
- survey-results.controller.ts: gating=class, key='staff_wellbeing', endpoints=~3
- personal-workload.controller.ts: gating=class, key='staff_wellbeing', endpoints=~2
- board-report.controller.ts: gating=class, key='staff_wellbeing', endpoints=~2
- resource.controller.ts: gating=class, key='staff_wellbeing', endpoints=~2
- aggregate-workload.controller.ts: gating=class, key='staff_wellbeing', endpoints=~2
  exported_services: [SurveyService, SurveyResultService, WorkloadService, ResourceService]
  consumed_by_modules: [communications (survey invitations), notifications (workload alerts)]

### Frontend

routes: [/wellbeing, /wellbeing/dashboard, /wellbeing/my-workload, /wellbeing/survey, /wellbeing/surveys, /wellbeing/surveys/[id], /wellbeing/staff, /wellbeing/resources, /wellbeing/reports, /wellbeing/settings]
nav_locations: [nav.wellbeing section at lines 125–147 of nav-config.ts, wellbeing hub basePaths (line 313)]
module_aware_files: frontend nav does NOT check tenantModule.is_enabled

### Worker

queues: [WELLBEING]
crons: (unverified — likely one per-tenant job for workload computation or survey reminders)
processors: (unverified — no dedicated cron-dispatch processor found; may be one-shot on-demand)

### Data

primary_tables: (unverified — likely StaffWellbeingSurvey, StaffWellbeingSurveyQuestion, StaffWellbeingSurveyResponse, StaffWellbeingResourceCategory, StaffWellbeingResource, StaffWorkloadAggregate, StaffWorkloadForecast)
table_count: ~8–10 (unverified)

### Permissions

permission_count: 9
sample_permission_keys: [staff_wellbeing.view_my_workload, staff_wellbeing.manage_surveys, staff_wellbeing.view_dashboard, staff_wellbeing.manage_resources, staff_wellbeing.export_analytics]

### Notifications

notification_types: [survey.invitation, survey.reminder, workload.alert, resource.published]

### PDF

template_keys: [workload_report, survey_summary]

### Current gating state

api_enforcement: full
frontend_enforcement: partial — nav checks role but NOT module state
worker_enforcement: full (unverified — may not have per-tenant cron dispatch, could be on-demand)
in_seed_module_keys: yes
default_enabled: yes

### Gaps to fix

- Frontend nav filtering does NOT check module state.
- Worker registration unclear — verify WELLBEING queue has per-tenant cron dispatch (or document why it doesn't need one).
- Table schema unverified — confirm `StaffWellbeing*` model names in prisma/schema.prisma.

### Disable impact

hidden_when_off: [/wellbeing* and sub-routes, nav.wellbeing section items]
data_status: Survey responses and workload snapshots remain; UI cannot query them (API 403s).
risk_if_disabled_today: medium — wellbeing surveys are typically one-off (or annual) events. Disabling stops in-flight survey administration and workload analytics but does not break critical operations.
risk_if_re_enabled_later: Low; historical survey data will still be present but stale. Resume and audit pending surveys.

========================================

## Module: early_warning

display_name_proposal: "Early Warning System"
description_proposal: "Predictive risk scoring for students across academic, behavioural, and pastoral domains."

### API

api_module_dir: apps/api/src/modules/early-warning
controllers:

- early-warning.controller.ts: gating=class, key='early_warning', endpoints=~8
  exported_services: [EarlyWarningService, EarlyWarningCohortService, EarlyWarningConfigService]
  consumed_by_modules: [communications (risk alerts), pastoral (escalation routing), behaviour (risk flags)]

### Frontend

routes: [/early-warnings, /early-warnings/page, /early-warnings/settings, /early-warnings/cohort, /early-warnings/intervene, /early-warnings/_components/* (tier transition, risk tier badge, at-risk list, student detail panel, kpi tiles, insights panel)]
nav_locations: NOT in nav-config.ts — early-warnings is only reachable via wellbeing hub dashboard, not in nav section sidebars
module_aware_files: frontend nav does NOT check tenantModule.is_enabled

### Worker

queues: [EARLY_WARNING]
crons: [early_warning:compute-daily (daily, cross-tenant dispatch per-tenant), early_warning:compute-student (student-level re-compute), early_warning:weekly-digest (weekly parent/staff digests)]
processors: [EarlyWarningProcessor (cross-tenant dispatcher), ComputeDailyProcessor (per-tenant daily compute), ComputeStudentProcessor (on-demand student re-compute), WeeklyDigestProcessor]

### Data

primary_tables: [EarlyWarningTierTransition, EarlyWarningConfig, (unverified: likely EarlyWarningScore, EarlyWarningSignal, EarlyWarningSummary)]
table_count: ~2–5 (unverified; core compute tables not confirmed)

### Permissions

permission_count: 4
sample_permission_keys: [early_warning.view, early_warning.manage_config, early_warning.export_reports]

### Notifications

notification_types: [risk_tier.promoted, risk_tier.demoted, intervention.assigned]

### PDF

template_keys: [early_warning_report, student_risk_profile]

### Current gating state

api_enforcement: full
frontend_enforcement: none — nav config does NOT mention early_warning, routes only accessible via wellbeing hub dashboard (no guard)
worker_enforcement: full — cron dispatcher and per-tenant processors check module state
in_seed_module_keys: **NO — CRITICAL: `early_warning` is missing from MODULE_KEYS in tenant-fixture.builder.ts**
default_enabled: **no — missing seed row means `tenantModule.findFirst` returns null for all tenants; guard throws 403 for every request**

### Gaps to fix

- **CRITICAL**: Add `'early_warning'` to `MODULE_KEYS` array in `apps/api/test/tenant-fixture.builder.ts` line 29–46.
- **CRITICAL**: Seed script must insert `early_warning` tenantModule row with `is_enabled: true` for all active tenants (or via default in seed.ts). Migration must backfill existing tenants.
- Frontend: add early_warning to nav-config.ts `nav.wellbeing` section OR document that it is dashboard-only (no sidebar menu).
- Worker: verify all three cron dispatchers (daily, weekly, student) correctly filter for `is_enabled: true` on tenantModule.

### Disable impact

hidden_when_off: [/early-warnings* and all sub-routes; early warning risk scores not computed; student detail panel on /wellbeing/dashboard shows zero risk]
data_status: EarlyWarningTierTransition and config remain; all compute queues stall (no per-tenant dispatch).
risk_if_disabled_today: **HIGH — early warning is a feature schools likely enabled expecting it to work. Currently it IS blocked (missing seed). Discovering it is blocked would be a support emergency.**
risk_if_re_enabled_later: Moderate — backfill missing `EarlyWarningScore` and `EarlyWarningTierTransition` snapshots from the compute window to restore tier history.

---

## Summary table (batch 3)

| Module          | API Enforcement | Frontend Enforcement | Worker Enforcement   | Seed Status | In seed_module_keys | Default Enabled |
| --------------- | --------------- | -------------------- | -------------------- | ----------- | ------------------- | --------------- |
| pastoral        | full            | none (relies on 403) | full                 | yes         | yes                 | yes             |
| behaviour       | full            | none (relies on 403) | full (3 crons)       | yes         | yes                 | yes             |
| staff_wellbeing | full            | none (relies on 403) | partial (unverified) | yes         | yes                 | yes             |
| early_warning   | full            | none                 | full (3 crons)       | **NO**      | **NO**              | **NO**          |

**Critical Cross-Cutting Issue:** Frontend nav config (`nav-config.ts`) does **not** check `tenantModule.is_enabled` before filtering nav sections. All four modules rely on backend 403s to block access. This is risky for bad UX (user sees link, clicks, gets 403) and requires a fix in the school layout to hydrate and filter nav at render time.

**Critical Migration Risk:** `early_warning` is currently completely blocked for all tenants because its seed row is missing AND the guard throws 403 on missing rows.
