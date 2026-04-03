# SP7: Architecture Documentation — Behaviour Module

> **Status**: Spec complete, ready for execution
> **Depends on**: All other sub-plans (SP1-SP6) must be complete before execution
> **Estimated effort**: ~2 hours (documentation only, no code changes)
> **Risk level**: None (documentation-only changes)

---

## Problem Statement

The behaviour module has 209 endpoints, 29 services, 17 controllers, and 16 worker processors, making it one of the three largest modules in the codebase. Despite this, it is almost completely absent from `architecture/feature-map.md` and has material gaps in the other four architecture files. This is a direct violation of the architecture policing rules in `.claude/rules/architecture-policing.md` and creates real risk: a developer making changes to shared tables or services has no way to know the behaviour module is affected without manually grepping.

---

## 1. feature-map.md — Add Behaviour Section (Section 28)

The behaviour module is completely missing from the feature map. Add it as section 28, after Platform Admin.

### Quick Reference Table Update

Update the existing Quick Reference table. Add the behaviour row and update the TOTAL row.

```markdown
| [Behaviour](#28-behaviour) | `modules/behaviour/` | 209 | 31 | 16 |
```

Updated TOTAL row:

```markdown
| **TOTAL** | **39 modules** | **~945** | **~201** | **48 jobs** |
```

### Section 28 Content

Add the following section after section 27 (Platform Admin):

```markdown
---

## 28. Behaviour

**What it does**: Comprehensive behaviour management system covering incident logging (positive and negative), points tracking, sanctions with formal lifecycle (approval, appeals, exclusion cases), intervention plans, pattern detection with AI-powered analytics, safeguarding concern management with break-glass emergency access, parent portal with configurable notification digests, recognition wall with consent/approval gates, formal document generation (detention notices, suspension letters, appeal decisions), GDPR-compliant retention with legal holds, and admin operations (recompute, backfill, policy dry-run).

**Backend**: `apps/api/src/modules/behaviour/`

- 17 controllers, 29 services, 209 total endpoints

**Sub-features by controller**:

| Controller                                      | Endpoints | Key Features                                                                                                                                                                                                                           |
| ----------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `behaviour.controller.ts`                       | 21        | Incident CRUD, quick-log, status transitions, participants, attachments, history                                                                                                                                                       |
| `behaviour-students.controller.ts`              | 13        | Student profile, timeline, summary card, points breakdown, AI insights, comparison                                                                                                                                                     |
| `behaviour-config.controller.ts`                | 21        | Category CRUD, award type CRUD, house CRUD, policy rule CRUD, document template CRUD                                                                                                                                                   |
| `behaviour-tasks.controller.ts`                 | 8         | Task list, create, complete, cancel, reassign, my-tasks, stats                                                                                                                                                                         |
| `behaviour-recognition.controller.ts`           | 12        | Recognition wall, awards list, manual award, publication approvals, consent management                                                                                                                                                 |
| `behaviour-interventions.controller.ts`         | 12        | Intervention plan CRUD, goals, progress notes, status transitions, effectiveness review                                                                                                                                                |
| `behaviour-sanctions.controller.ts`             | 14        | Sanction CRUD, status transitions, bulk mark served, reschedule, today's sanctions                                                                                                                                                     |
| `behaviour-appeals.controller.ts`               | 10        | Appeal submit, list, detail, decide (upheld/modified/overturned), withdraw, timeline                                                                                                                                                   |
| `behaviour-exclusions.controller.ts`            | 10        | Exclusion case CRUD, timeline, statutory checks, hearing records, finalise/overturn                                                                                                                                                    |
| `behaviour-amendments.controller.ts`            | 4         | Amendment notices list, create correction, send correction, history                                                                                                                                                                    |
| `behaviour-analytics.controller.ts`             | 16        | Dashboard KPIs, trends, category breakdown, severity distribution, response times, staff analytics, year group comparison, heatmap, benchmarks, exposure rates, AI query                                                               |
| `behaviour-alerts.controller.ts`                | 8         | Alert list, detail, acknowledge, resolve, dismiss, alert recipients, config, stats                                                                                                                                                     |
| `behaviour-documents.controller.ts`             | 6         | Document generate, list, detail, finalise, send, download                                                                                                                                                                              |
| `behaviour-parent.controller.ts`                | 6         | Parent portal overview, incident detail, sanction detail, recognition wall, acknowledgements, consent                                                                                                                                  |
| `behaviour-guardian-restrictions.controller.ts` | 6         | Restriction CRUD, list by student, review, expire                                                                                                                                                                                      |
| `safeguarding.controller.ts`                    | 21        | Concern CRUD, actions, attachments, status transitions, break-glass access, seal/unseal, audit trail, DLP settings                                                                                                                     |
| `behaviour-admin.controller.ts`                 | 21        | Health check, dead-letter management, recompute points, rebuild awards, recompute pulse, backfill tasks, resend notifications, refresh views, policy dry-run, scope audit, reindex search, retention preview/execute, legal holds CRUD |

**Worker jobs** (16 processors across `behaviour` and `notifications` queues):

| Job                                    | Queue         | Trigger                              | Description                                               |
| -------------------------------------- | ------------- | ------------------------------------ | --------------------------------------------------------- |
| `behaviour:parent-notification`        | notifications | Incident created (category requires) | Parent notification with send-gate check                  |
| `behaviour:digest-notifications`       | notifications | Cron (tenant digest time)            | Batch daily digest of pending notifications               |
| `behaviour:task-reminders`             | behaviour     | Cron (daily 08:00 tenant TZ)         | Due/overdue task reminders                                |
| `behaviour:evaluate-policy`            | behaviour     | Incident created / participant added | 5-stage policy evaluation engine                          |
| `behaviour:suspension-return`          | behaviour     | Cron (daily 07:00 tenant TZ)         | Return-from-suspension check-in tasks                     |
| `behaviour:detect-patterns`            | behaviour     | Cron (daily 05:00 UTC)               | 7-algorithm pattern detection                             |
| `behaviour:check-awards`               | behaviour     | Incident created (positive)          | Auto-award threshold check with dedup                     |
| `behaviour:attachment-scan`            | behaviour     | Attachment uploaded                  | ClamAV virus scan (graceful fallback)                     |
| `behaviour:break-glass-expiry`         | behaviour     | Cron (pending registration)          | Expire break-glass grants, create review tasks            |
| `safeguarding:critical-escalation`     | behaviour     | Critical concern created             | Escalation chain notification (DLP -> deputy -> fallback) |
| `behaviour:guardian-restriction-check` | behaviour     | Cron (pending registration)          | Expire ended restrictions, create review tasks            |
| `safeguarding:sla-check`               | behaviour     | Cron (pending registration)          | Detect SLA breaches on safeguarding concerns              |
| `behaviour:refresh-mv-student-summary` | behaviour     | Cron (every 15 min)                  | Refresh mv_student_behaviour_summary                      |
| `behaviour:refresh-mv-benchmarks`      | behaviour     | Cron (daily 03:00 UTC)               | Refresh mv_behaviour_benchmarks                           |
| `behaviour:refresh-mv-exposure-rates`  | behaviour     | Cron (daily 02:00 UTC)               | Refresh mv_behaviour_exposure_rates                       |
| `behaviour:retention-check`            | behaviour     | Cron (monthly 1st, 01:00 UTC)        | Archive/anonymise/flag records per retention policy       |
| `behaviour:partition-maintenance`      | behaviour     | Cron (monthly 1st, 00:00 UTC)        | Create partitions for partitioned tables                  |

**Frontend**: 24 behaviour pages + 6 safeguarding pages + 7 settings pages = 37 pages total

`apps/web/src/app/[locale]/(school)/behaviour/`:
| Route | Description |
|-------|-------------|
| `/behaviour` | Dashboard with KPIs, recent incidents, trends chart |
| `/behaviour/incidents` | Incident list with status/category/severity filters |
| `/behaviour/incidents/new` | Create incident form |
| `/behaviour/incidents/[id]` | Detail with participants, timeline, sanctions, tasks, history |
| `/behaviour/students` | Student behaviour list with points, summaries |
| `/behaviour/students/[studentId]` | Student profile with timeline, points breakdown, interventions |
| `/behaviour/tasks` | Task list with status tabs, create, complete, reassign |
| `/behaviour/recognition` | Recognition wall with awards, consent management |
| `/behaviour/interventions` | Intervention plan list |
| `/behaviour/interventions/new` | Create intervention form |
| `/behaviour/interventions/[id]` | Detail with goals, progress notes, status transitions |
| `/behaviour/sanctions` | Sanction list with status filters |
| `/behaviour/sanctions/today` | Today's sanctions with bulk mark-served |
| `/behaviour/appeals` | Appeal list |
| `/behaviour/appeals/[id]` | Appeal detail with decision panel, timeline |
| `/behaviour/exclusions` | Exclusion case list |
| `/behaviour/exclusions/[id]` | Exclusion detail with statutory timeline, hearing records |
| `/behaviour/amendments` | Amendment notices with correction dispatch |
| `/behaviour/analytics` | Analytics dashboard: trends, breakdown, heatmap, benchmarks |
| `/behaviour/analytics/ai` | AI-powered behaviour query interface |
| `/behaviour/alerts` | Pattern alerts with acknowledge/resolve/dismiss |
| `/behaviour/documents` | Document list with generate/finalise/send actions |
| `/behaviour/parent-portal` | Parent-facing behaviour overview, incidents, sanctions |
| `/behaviour/parent-portal/recognition` | Parent-facing recognition wall |

`apps/web/src/app/[locale]/(school)/safeguarding/`:
| Route | Description |
|-------|-------------|
| `/safeguarding` | Safeguarding dashboard |
| `/safeguarding/concerns` | Concern list with status/severity filters |
| `/safeguarding/concerns/new` | Report concern form |
| `/safeguarding/concerns/[id]` | Concern detail with actions, attachments, timeline |
| `/safeguarding/my-reports` | Reporter's own submitted concerns |

`apps/web/src/app/[locale]/(school)/settings/`:
| Route | Description |
|-------|-------------|
| `/settings/behaviour-general` | General behaviour settings |
| `/settings/behaviour-categories` | Category CRUD (positive/negative, severity, points) |
| `/settings/behaviour-awards` | Award type CRUD with thresholds and tiers |
| `/settings/behaviour-houses` | House CRUD with colour and point tracking |
| `/settings/behaviour-policies` | Policy rule builder (conditions -> actions per stage) |
| `/settings/behaviour-documents` | Document template CRUD |
| `/settings/behaviour-admin` | Admin ops (retention, legal holds, reindex, health) |
| `/settings/safeguarding` | Safeguarding settings (DLP, SLA thresholds, break-glass) |

**Permissions** (11 distinct):

- `behaviour.log` — Log incidents (positive/negative)
- `behaviour.view` — View incidents, students, analytics, alerts
- `behaviour.manage` — Create/edit sanctions, appeals, exclusions, interventions, tasks
- `behaviour.admin` — Configuration, categories, awards, houses, policies, admin ops
- `behaviour.ai_query` — AI-powered natural language queries
- `behaviour.view_staff_analytics` — Staff-level analytics (sensitive)
- `safeguarding.report` — Submit safeguarding concerns
- `safeguarding.view` — View concerns and actions
- `safeguarding.manage` — Manage concerns, assign, transition status
- `safeguarding.seal` — Seal/unseal resolved concerns (irreversible)

**Shared types**: `packages/shared/src/behaviour/` — state machines (incident, sanction, appeal, exclusion, intervention, safeguarding, document), Zod schemas (incident, sanction, appeal, recognition, document, parent-behaviour)
**Constants**: `packages/shared/src/behaviour/state-machine.ts` (transition maps), `packages/shared/src/constants/behaviour-categories.ts`
**Depends on**: AuthModule (guards), TenantsModule (SequenceService), ApprovalsModule (policy action: require_approval), PdfRenderingModule (document generation), S3Module (document storage), CommunicationsModule (notification queue, not imported directly)
```

---

## 2. event-job-catalog.md — Add 6 Missing Processor Entries

The following 6 processors are registered in `worker.module.ts` but not documented in the event-job-catalog. Add them in the "Behaviour Module Jobs" section, after the existing documented entries.

Also update the header counts:

- Change `**11 queues**, **36 job types**, **7 cron jobs**` to `**11 queues**, **42 job types**, **13 cron jobs**`

### Entry: `behaviour:attachment-scan`

```markdown
---

### `behaviour:attachment-scan` (behaviour queue)

**Trigger**: Enqueued by `SafeguardingAttachmentService.uploadAttachment()` when a file is attached to a safeguarding concern.
**Payload**: `{ tenant_id, attachment_id, file_key }`
**Processor**: `apps/worker/src/processors/behaviour/attachment-scan.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase D

**Side effects chain**:
```

Attachment uploaded to safeguarding concern
-> behaviour:attachment-scan enqueued to behaviour queue
-> Worker loads attachment by ID + tenant_id
-> Idempotency: skip if scan_status is not 'pending_scan'
-> Check ClamAV socket availability (/var/run/clamav/clamd.ctl)
-> If ClamAV unavailable (development): auto-approve as 'clean'
-> If ClamAV available (production): scan file and set status
-> Update attachment: scan_status = 'clean'/'infected', scanned_at = now()

```

**Danger**: ClamAV graceful fallback auto-approves ALL attachments as 'clean' when the socket is unavailable. In development this is fine, but if ClamAV crashes in production, malware could slip through undetected. Monitor ClamAV uptime. The actual ClamAV scanning implementation is marked TODO — currently auto-approves even when the socket exists.
```

### Entry: `behaviour:break-glass-expiry`

```markdown
---

### `behaviour:break-glass-expiry` (behaviour queue — CRON)

**Trigger**: Cron job (registration pending — not yet registered in CronSchedulerService).
**Payload**: `{ tenant_id }`
**Processor**: `apps/worker/src/processors/behaviour/break-glass-expiry.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase D

**Side effects chain**:
```

Cron fires (schedule TBD)
-> behaviour:break-glass-expiry enqueued per tenant
-> Worker queries safeguarding_break_glass_grants WHERE:
revoked_at IS NULL AND expires_at < now()
-> For each expired grant:
-> Atomically revoke (updateMany WHERE revoked_at IS NULL — race-safe)
-> Create behaviour_task: - task_type = 'break_glass_review' - entity_type = 'break_glass_grant' - assigned_to = granted_by_id - due_date = 7 days from now - priority = 'high'

```

**Danger**: Uses `updateMany` with `revoked_at: null` as a concurrent-safe guard — if two jobs run simultaneously, only one will match the grant. The review task is assigned to the person who granted the break-glass access (granted_by_id), which is correct for accountability. If the cron is not registered, expired break-glass grants remain active indefinitely — a safeguarding risk.
```

### Entry: `behaviour:check-awards`

```markdown
---

### `behaviour:check-awards` (behaviour queue)

**Trigger**: Enqueued by `BehaviourService.createIncident()` when an active incident has positive points.
**Payload**: `{ tenant_id, incident_id, student_ids, academic_year_id, academic_period_id }`
**Processor**: `apps/worker/src/processors/behaviour/check-awards.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase E

**Side effects chain**:
```

Positive incident created
-> behaviour:check-awards enqueued to behaviour queue
-> Worker loads active award types with non-null points_threshold (ordered by tier DESC, threshold DESC)
-> For each student:
-> Compute fresh total points (aggregate from behaviour_incident_participants)
-> For each award type where totalPoints >= threshold:
-> Dedup guard: skip if award already exists for this incident + award type
-> Repeat mode check (once_ever, once_per_year, once_per_period, unlimited)
-> repeat_max_per_year cap check
-> Create behaviour_recognition_award record
-> Tier supersession: if supersedes_lower_tiers, mark lower-tier awards
-> For each parent with active user account:
-> Guardian restriction check (skip if no_behaviour_notifications or no_communications)
-> Create in_app notification (template: behaviour.award_parent)
-> If recognition_wall_auto_populate enabled:
-> Create behaviour_publication_approval record
-> Respect requires_consent and requires_admin_approval gates

```

**Danger**: This processor runs inside a single transaction per student. If a student qualifies for many awards simultaneously (tier cascade), the transaction grows. The dedup guard checks `triggered_by_incident_id` — if two incidents trigger award checks concurrently for the same student, both may create awards (no global dedup across incidents). Guardian restriction check queries are N+1 (one per parent per student) — for students with many parents this adds up.
```

### Entry: `safeguarding:critical-escalation`

```markdown
---

### `safeguarding:critical-escalation` (behaviour queue)

**Trigger**: Enqueued by `SafeguardingService.createConcern()` when severity is `critical`.
**Payload**: `{ tenant_id, concern_id, escalation_step }`
**Processor**: `apps/worker/src/processors/behaviour/critical-escalation.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase D

**Side effects chain**:
```

Critical safeguarding concern created
-> safeguarding:critical-escalation enqueued with escalation_step = 0
-> Worker loads the concern
-> Termination check: if concern status is NOT 'reported', stop (already acknowledged)
-> Load tenant settings for escalation chain:
[designated_liaison_user_id, deputy_designated_liaison_user_id, ...dlp_fallback_chain]
-> If escalation_step >= chain length:
-> Chain exhausted — create safeguarding_action note: "Manual intervention required"
-> STOP (no further escalation)
-> Create safeguarding_action: "Critical escalation step N — notified user X"
-> (Notification dispatch is logged but not yet implemented via communications queue)

```

**Danger**: The escalation chain is built from tenant settings at runtime. If settings change between escalation steps, the chain may skip or repeat users. The processor does NOT re-enqueue the next escalation step — it is a single-step job. For multi-step escalation, the triggering code must enqueue multiple delayed jobs (step 0 immediately, step 1 after delay, etc.). If the escalation chain is empty (no DLP configured), the processor creates an "exhausted" note on step 0 — this is a configuration gap, not a bug. Actual notification dispatch is logged but not implemented — staff are notified only via safeguarding_action records.
```

### Entry: `behaviour:guardian-restriction-check`

```markdown
---

### `behaviour:guardian-restriction-check` (behaviour queue — CRON)

**Trigger**: Cron job (registration pending — not yet registered in CronSchedulerService).
**Payload**: `{ tenant_id }`
**Processor**: `apps/worker/src/processors/behaviour/guardian-restriction-check.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase E

**Side effects chain**:
```

Cron fires (schedule TBD)
-> behaviour:guardian-restriction-check enqueued per tenant
-> Step 1: Expire ended restrictions
-> Query behaviour_guardian_restrictions WHERE:
status = 'active_restriction' AND effective_until < today
-> For each: update status to 'expired', create entity_history entry
-> Step 2: Create review reminder tasks
-> Query active restrictions with review_date <= 14 days from now
-> For each (if no existing open review task):
-> Create behaviour_task: - task_type = 'guardian_restriction_review' - assigned_to = set_by_id - priority = 'high' if <=3 days, 'medium' otherwise - due_date = review_date

```

**Danger**: The restriction expiry uses date comparison (effective_until < today) computed as UTC midnight. If the tenant is in a timezone significantly offset from UTC, restrictions may expire a day early or late from the user's perspective. The review task is idempotent — checks for existing tasks before creating. If the cron is not registered, expired restrictions remain active and review tasks are never created.
```

### Entry: `safeguarding:sla-check`

```markdown
---

### `safeguarding:sla-check` (behaviour queue — CRON)

**Trigger**: Cron job (registration pending — not yet registered in CronSchedulerService).
**Payload**: `{ tenant_id }`
**Processor**: `apps/worker/src/processors/behaviour/sla-check.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase D

**Side effects chain**:
```

Cron fires (schedule TBD)
-> safeguarding:sla-check enqueued per tenant
-> Query safeguarding_concerns WHERE:
sla_first_response_met_at IS NULL
AND sla_first_response_due < now()
AND status NOT IN ('sg_resolved', 'sealed')
-> For each breached concern:
-> Idempotency: skip if breach task already exists (title STARTS WITH 'SLA BREACH')
-> Create behaviour_task: - task_type = 'safeguarding_action' - entity_type = 'safeguarding_concern' - title = 'SLA BREACH: {concern_number} — acknowledgement overdue' - priority = 'urgent' - assigned_to = designated_liaison_id ?? reported_by_id - due_date = now()

```

**Danger**: The idempotency check relies on task title prefix matching ('SLA BREACH') — if someone manually creates a task with that prefix, it could suppress a real breach alert. The SLA thresholds are stored on the concern at creation time (from tenant settings). If thresholds are later relaxed, existing concerns still use the old thresholds — they are not retroactively updated. If the cron is not registered, SLA breaches go undetected.
```

---

## 3. state-machines.md — Add InterventionStatus and SafeguardingStatus

Add these two entries to the "Behaviour Module Lifecycles" section, after the existing DocumentStatus entry.

### InterventionStatus

```markdown
### InterventionStatus
```

planned -> [active_intervention, abandoned]
active_intervention -> [monitoring, completed_intervention, abandoned]
monitoring -> [completed_intervention, active_intervention]
completed_intervention*
abandoned*

```
- **Guarded by**: `packages/shared/src/behaviour/state-machine-intervention.ts` -> `isValidInterventionTransition()` + `behaviour-interventions.service.ts`
- **Side effects**:
  - `planned -> active_intervention`: Sets `started_at`. Records entity history.
  - `active_intervention -> monitoring`: Indicates student progress is being tracked post-intervention. Can return to `active_intervention` if regression.
  - `* -> completed_intervention`: Sets `completed_at`, `completed_by_id`, `outcome` (improved/stable/no_change/worsened). Records entity history.
  - `* -> abandoned`: Sets `abandoned_reason`. Records entity history. Typically when student leaves school or intervention is no longer appropriate.
  - Any transition: Creates `behaviour_entity_history` entry with `change_type = 'status_changed'`.
- **Note**: `monitoring -> active_intervention` is intentional — allows returning to active intervention if a student regresses during the monitoring phase. This is a cyclical transition, not a bug.
- **Prisma enum mapping**: `active_intervention` -> DB `"active"`, `completed_intervention` -> DB `"completed"`.
```

### SafeguardingStatus

```markdown
### SafeguardingStatus
```

reported -> [acknowledged]
acknowledged -> [under_investigation]
under_investigation -> [referred, monitoring, resolved]
referred -> [monitoring, resolved]
monitoring -> [resolved]
resolved -> [sealed]
sealed\*

```
- **Guarded by**: `packages/shared/src/behaviour/safeguarding-state-machine.ts` -> `isValidSafeguardingTransition()` + `safeguarding.service.ts`
- **Side effects**:
  - `reported -> acknowledged`: Sets `acknowledged_at`, `acknowledged_by_id`. Terminates critical escalation chain (processor checks status). Records safeguarding_action.
  - `acknowledged -> under_investigation`: Creates investigation tasks. Records safeguarding_action.
  - `under_investigation -> referred`: Records referral agency (Tusla, Garda, etc.). Creates safeguarding_action with external reference.
  - `* -> resolved`: Sets `resolved_at`, `resolution_summary`. Records safeguarding_action.
  - `resolved -> sealed`: IRREVERSIBLE. Encrypts sensitive fields, restricts access to `safeguarding.seal` permission only. Records safeguarding_action. Creates entity_history entry.
- **Visibility**: ALL safeguarding data requires `safeguarding.view` permission. Sealed concerns require `safeguarding.seal`. No safeguarding data is visible to parents or the parent portal.
- **SLA**: `sla_first_response_due` is computed at creation (now + tenant SLA hours). `safeguarding:sla-check` cron creates breach tasks if not acknowledged by deadline.
- **Critical escalation**: If severity = `critical`, `safeguarding:critical-escalation` job is enqueued at creation with escalation_step = 0, walking the DLP chain until the concern is acknowledged.
- **Concern types**: physical_abuse, emotional_abuse, sexual_abuse, neglect, self_harm, bullying, online_safety, domestic_violence, substance_abuse, mental_health, radicalisation, other.
- **Danger**: The `sealed` status is terminal and irreversible. Once sealed, the concern data is encrypted at rest and only accessible to users with `safeguarding.seal` permission. There is no unseal — if a concern is incorrectly sealed, it requires database-level intervention. The break-glass mechanism provides emergency temporary access to sealed concerns but creates audit obligations.
```

---

## 4. danger-zones.md — Add 4 New Entries (DZ-23 through DZ-26)

Add after the existing DZ-22 entry.

### DZ-23: Break-Glass Expiry Race Condition

```markdown
---

## DZ-23: Break-Glass Expiry Cron Not Registered

**Risk**: Expired break-glass grants remain active indefinitely, allowing continued access to sealed safeguarding data without audit accountability
**Location**: `apps/worker/src/processors/behaviour/break-glass-expiry.processor.ts`

The `BreakGlassExpiryProcessor` is registered in `worker.module.ts` but the cron trigger is NOT registered in `CronSchedulerService`. This means the processor exists but is never invoked. Break-glass grants with `expires_at` in the past remain un-revoked.

The processor itself is race-safe (uses `updateMany WHERE revoked_at IS NULL`), so concurrent executions are safe. The real risk is that the cron is never triggered at all.

**Impact**: A staff member granted emergency break-glass access to sealed safeguarding concerns retains that access after the time window expires. No review task is created. The after-action review audit obligation is not fulfilled.

**Mitigation**: Register the cron in `CronSchedulerService` (recommended: every 15 minutes per tenant). Until then, manually trigger via the admin endpoint. Also: the `updateMany` atomic guard prevents double-revocation if the cron fires twice, but does not prevent duplicate review tasks — add an idempotency check for task creation.
```

### DZ-24: Check-Awards Mass Grant Under Concurrent Incidents

```markdown
---

## DZ-24: Check-Awards Mass Grant Under Concurrent Incidents

**Risk**: Duplicate awards granted when multiple positive incidents for the same student are processed concurrently
**Location**: `apps/worker/src/processors/behaviour/check-awards.processor.ts`

The award dedup guard checks `triggered_by_incident_id` — it only prevents the same incident from granting the same award type twice. If two positive incidents are logged for the same student within seconds, both jobs may compute the same total points and both may create awards of the same type, because neither sees the other's in-flight transaction.

**Impact**: A student may receive duplicate awards (e.g., two "Bronze Star" awards from two concurrent incidents that both push them over the 100-point threshold). The tier supersession mechanism may also double-process, marking lower-tier awards as superseded twice.

**Mitigation**: The `once_ever` and `once_per_year` repeat modes catch this on the second check (they query all existing awards, not just the incident-specific ones). The risk is primarily with `unlimited` or `once_per_period` modes. For high-value awards, use `once_per_year` or `once_ever` repeat mode. A stricter fix would be to add a unique constraint on `(tenant_id, student_id, award_type_id, academic_year_id)` for `once_per_year` awards.
```

### DZ-25: SLA Threshold Changes Causing False Alerts

```markdown
---

## DZ-25: SLA Threshold Changes Do Not Retroactively Update Existing Concerns

**Risk**: Relaxing SLA thresholds in settings does not relieve existing concerns, leading to false breach alerts
**Location**: `apps/worker/src/processors/behaviour/sla-check.processor.ts`, `apps/api/src/modules/behaviour/safeguarding.service.ts`

When a safeguarding concern is created, `sla_first_response_due` is computed as `created_at + sla_hours` using the tenant's SLA threshold setting at creation time. This date is stored on the concern record and never recalculated.

If a school admin later relaxes the SLA threshold (e.g., from 4 hours to 24 hours), existing concerns still use the old 4-hour deadline. The `safeguarding:sla-check` cron will continue to flag these as breached.

Conversely, tightening the threshold does not retroactively apply stricter deadlines to existing concerns — they keep their original, more lenient deadline.

**Impact**: False breach alerts after threshold relaxation, or missed breaches after tightening.

**Mitigation**: This is intentional — SLA commitments are made at the time a concern is reported, not retroactively. Document this behaviour in the settings UI. If a school needs to clear false breach alerts after relaxing SLAs, they can manually resolve the breach tasks.
```

### DZ-26: Critical Escalation Does Not Self-Chain

```markdown
---

## DZ-26: Critical Escalation Is Single-Step, Not Self-Chaining

**Risk**: Only the first person in the DLP escalation chain is notified
**Location**: `apps/worker/src/processors/behaviour/critical-escalation.processor.ts`, `apps/api/src/modules/behaviour/safeguarding.service.ts`

The `safeguarding:critical-escalation` processor handles ONE step per job invocation. It does NOT enqueue the next step. The triggering code in `SafeguardingService.createConcern()` enqueues only step 0.

This means: if the designated liaison person does not acknowledge a critical concern, the deputy and fallback contacts are NEVER notified. The escalation chain is effectively single-step.

For multi-step escalation to work, either:

1. The processor must re-enqueue itself with `escalation_step + 1` after a delay (currently does not do this)
2. Or a separate cron job must check for unacknowledged critical concerns and advance the escalation step

**Impact**: Critical safeguarding concerns may go unacknowledged if the designated liaison is unavailable. The deputy and fallback chain contacts are never reached.

**Mitigation**: Implement option 1: after recording the escalation action, check if the concern is still `reported`, and if so, enqueue `safeguarding:critical-escalation` with `escalation_step + 1` and a configurable delay (e.g., 30 minutes). Add a max_escalation_attempts guard to prevent infinite loops.
```

---

## 5. module-blast-radius.md — Correct Counts and Processor References

### Fix the BehaviourModule entry

The existing BehaviourModule entry at line 125+ needs these corrections:

1. **Controller count**: Change `(16 endpoints)` for BehaviourAnalyticsController to `(16 endpoints)` -- this is actually correct. But the controller LIST is incomplete. Update the Controllers line to list all 17:

```markdown
- **Controllers**: `BehaviourController` (21 endpoints), `BehaviourStudentsController` (13 endpoints), `BehaviourConfigController` (21 endpoints), `BehaviourTasksController` (8 endpoints), `BehaviourRecognitionController` (12 endpoints), `BehaviourInterventionsController` (12 endpoints), `BehaviourGuardianRestrictionsController` (6 endpoints), `SafeguardingController` (21 endpoints), `BehaviourSanctionsController` (14 endpoints), `BehaviourAppealsController` (10 endpoints), `BehaviourExclusionsController` (10 endpoints), `BehaviourAmendmentsController` (4 endpoints), `BehaviourAnalyticsController` (16 endpoints), `BehaviourAlertsController` (8 endpoints), `BehaviourDocumentsController` (6 endpoints), `BehaviourParentController` (6 endpoints), `BehaviourAdminController` (21 endpoints) — **209 total endpoints**
```

2. **Exports list update**: The Exports list should match what `behaviour.module.ts` actually exports. Add missing services:
   - `BehaviourAdminService`
   - `BehaviourPointsService`
   - `BehaviourAwardService`
   - `BehaviourRecognitionService`
   - `BehaviourHouseService`
   - `BehaviourInterventionsService`
   - `BehaviourGuardianRestrictionsService`
   - `SafeguardingService`
   - `SafeguardingAttachmentService`
   - `SafeguardingBreakGlassService`
   - `BehaviourLegalHoldService`

3. **Queues line update**: Add the 6 undocumented processors to the "processes from behaviour" list:

```markdown
- **Queues**: Enqueues to `notifications` (parent notifications, digest notifications) and `behaviour` (policy evaluation, check-awards, attachment-scan, critical-escalation). Processes from `behaviour` queue: task reminders, policy evaluation, suspension-return, detect-patterns, check-awards, attachment-scan, break-glass-expiry, guardian-restriction-check, sla-check, critical-escalation, refresh-mv-student-summary, refresh-mv-benchmarks, refresh-mv-exposure-rates, retention-check, partition-maintenance — **16 processors total**
```

4. **Cross-module Prisma-direct reads**: Add `guardian_restrictions` to the direct-read table list in the Cross-Module Query Pattern table at the bottom:

```markdown
| `behaviour_incidents` + related | Behaviour module (owned), future: reports, dashboard |
```

---

## 6. Post-Sub-Plan Verification — Cross-Module Dependency Audit

After all other sub-plans (SP1-SP6) are complete, perform a final verification pass:

### Verification Steps

1. **Re-count endpoints**: Run `grep -cE '@(Get|Post|Patch|Put|Delete)\(' apps/api/src/modules/behaviour/*.controller.ts` and sum. Verify the count matches what is documented in feature-map.md.

2. **Re-count services**: Run `ls apps/api/src/modules/behaviour/*.service.ts | wc -l`. Verify against the module registration in `behaviour.module.ts`.

3. **Re-count processors**: Run `ls apps/worker/src/processors/behaviour/*.processor.ts | wc -l`. Verify all are registered in `worker.module.ts` and documented in event-job-catalog.md.

4. **Verify all cron jobs are registered**: Check `CronSchedulerService` for behaviour cron registrations. Flag any processors designed as crons (payload is just `{ tenant_id }`) that are not registered.

5. **Verify NestJS module imports**: Read `behaviour.module.ts` imports and cross-reference with module-blast-radius.md. The blast-radius entry currently lists `CommonModule` as an import — verify whether this is actually imported or if it was an error.

6. **Verify cross-module Prisma reads**: The blast-radius entry lists tables that behaviour reads directly. After any SP1-SP6 changes, grep for new Prisma model references in behaviour services:

   ```bash
   grep -rE 'tx\.(student|parent|class|academic|user|staff|notification)' apps/api/src/modules/behaviour/ --include='*.ts' -l
   ```

7. **Update "Last verified" dates**: Set all five architecture files to the date of SP7 execution.

---

## Acceptance Criteria

- [ ] `architecture/feature-map.md` contains a complete Behaviour section (section 28) with all 17 controllers, 209 endpoints, 37 frontend pages, 16 worker jobs, and 11 permissions documented
- [ ] Quick Reference table updated with behaviour row and corrected TOTAL row
- [ ] `architecture/event-job-catalog.md` contains full entries for all 6 previously undocumented processors: attachment-scan, break-glass-expiry, check-awards, critical-escalation, guardian-restriction-check, sla-check
- [ ] Header job/cron counts updated to reflect actual totals
- [ ] `architecture/state-machines.md` contains InterventionStatus and SafeguardingStatus entries with full transition maps, side effects, and danger notes
- [ ] `architecture/danger-zones.md` contains DZ-23 through DZ-26 with risk descriptions and mitigations
- [ ] `architecture/module-blast-radius.md` BehaviourModule entry updated with correct endpoint count (209), all 17 controllers listed, all exports listed, all 16 processors listed
- [ ] All "Last verified" dates updated to execution date
- [ ] All content matches the existing document style (headings, tables, code blocks, danger callouts)
- [ ] No code changes — documentation only

---

## Execution Notes

- This sub-plan should execute LAST after all code changes from SP1-SP6 are complete
- Before writing, re-verify all counts against the actual codebase (endpoints may have changed during remediation)
- The feature-map section number (28) may need to change if another module is added before execution
- The danger zone numbers (DZ-23 through DZ-26) may need to change if other sub-plans add danger zones
- The three cron jobs marked "registration pending" (break-glass-expiry, guardian-restriction-check, sla-check) should be flagged as a remediation gap if they are still unregistered after SP1-SP6
