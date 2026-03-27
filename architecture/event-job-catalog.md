# Event & Job Side-Effect Catalog

> **Purpose**: Before modifying any queue, job, or approval flow, check here for the full chain of consequences.
> **Maintenance**: Update when adding new jobs, changing job payloads, or modifying approval callbacks.
> **Last verified**: 2026-03-27

---

## Architecture Overview

- **No EventEmitter2 / @OnEvent patterns** — all async communication is via BullMQ queues
- **Hub-and-spoke**: API enqueues jobs, Worker processes them. No queue-to-queue chaining within Worker.
- **Every job payload MUST include `tenant_id`** — enforced by TenantAwareJob base class
- **13 queues**, **62 job types**, **13 cron jobs**

---

## Approval Callback System (The Most Dangerous Flow)

The `ApprovalRequestsService` is a central dispatch hub. When an approval request transitions to `approved`, it dispatches to domain-specific queues via `MODE_A_CALLBACKS`:

```
User approves request
  -> ApprovalRequestsService.approve()
    -> Checks MODE_A_CALLBACKS mapping
    -> Enqueues job to appropriate queue:

  announcement_publish  -> notifications queue -> communications:on-approval
  invoice_issue         -> finance queue      -> finance:on-approval
  payroll_finalise      -> payroll queue       -> payroll:on-approval
```

### Side effects per approval type:

**announcement_publish**:
1. Worker processor marks announcement as `published`
2. Enqueues `communications:dispatch-notifications` for all audience members
3. Notifications sent via configured channels (email/whatsapp/in_app)

**invoice_issue**:
1. Worker processor marks invoice as `issued`
2. Sets `issued_at` timestamp
3. (Overdue detection cron will later flag if unpaid)

**payroll_finalise**:
1. Worker processor marks payroll run as `finalised`
2. Generates payslip numbers via SequenceService for each entry
3. Creates individual payslip records
4. (Mass export can then be triggered separately)

### Danger: Adding a new approval type requires:
1. Add to `ApprovalActionType` enum in Prisma schema
2. Add to `MODE_A_CALLBACKS` in approval-requests.service.ts
3. Create worker processor for the callback job
4. Register processor in worker module
5. **Missing any step = approved items silently never execute**

---

## Job Flow Diagrams

### Announcement Publishing Flow
```
AnnouncementsService.publish()
  |-- if requires_approval:
  |     ApprovalRequestsService.create(announcement_publish)
  |       -> [user approves] -> notifications queue: communications:on-approval
  |         -> PublishAnnouncementProcessor
  |           -> marks published
  |           -> enqueues communications:dispatch-notifications
  |             -> DispatchNotificationsProcessor
  |               -> sends email/whatsapp/in_app per recipient
  |-- if no approval needed:
        -> notifications queue: communications:publish-announcement
          -> PublishAnnouncementProcessor (same path as above)
```

### Attendance Session Flow
```
Cron / manual trigger
  -> attendance queue: attendance:generate-sessions
    -> AttendanceSessionGenerationProcessor
      -> creates AttendanceSession records for each class period

Cron trigger
  -> attendance queue: attendance:detect-pending
    -> AttendancePendingDetectionProcessor
      -> flags classes with unmarked attendance

  -> attendance queue: attendance:auto-lock
    -> AttendanceAutoLockProcessor
      -> locks sessions past the deadline

  -> attendance queue: attendance:detect-patterns
    -> AttendancePatternDetectionProcessor
      -> creates AttendanceAlert records
      -> enqueues communications:dispatch-notifications (parent alerts)
```

### Finance Flow
```
InvoicesService.issue()
  |-- if requires_approval:
  |     ApprovalRequestsService.create(invoice_issue)
  |       -> [user approves] -> finance queue: finance:on-approval
  |         -> marks invoice issued
  |-- if no approval:
        -> marks invoice issued directly

Cron trigger
  -> finance queue: finance:overdue-detection
    -> OverdueDetectionProcessor
      -> marks invoices as overdue
      -> (payment reminders are separate, triggered by settings)
```

### Payroll Flow
```
PayrollRunsService.finalise()
  |-- if requires_approval:
  |     ApprovalRequestsService.create(payroll_finalise)
  |       -> [user approves] -> payroll queue: payroll:on-approval
  |         -> PayrollApprovalCallbackProcessor
  |           -> generates payslip numbers (SequenceService)
  |           -> creates payslip records
  |-- if no approval:
        -> finalises directly, generates payslips

PayrollRunsService (on create)
  -> payroll queue: payroll:generate-sessions
    -> PayrollSessionGenerationProcessor
      -> creates payroll entry sessions

PayslipsService.massExport()
  -> payroll queue: payroll:mass-export-payslips
    -> PayrollMassExportProcessor
      -> generates PDF payslips
      -> uploads to S3
```

### Scheduling Flow
```
SchedulerOrchestrationService.solve()
  -> scheduling queue: scheduling:solve-v2
    -> SchedulingSolverV2Processor
      -> runs CSP solver (pure TypeScript, no DB during solve)
      -> writes result_json to scheduling_runs table
      -> marks run as completed/failed

Cron trigger
  -> scheduling queue: scheduling:reap-stale-runs
    -> marks stuck runs (>30min) as failed
```

### Import Flow
```
ImportService.upload()
  -> imports queue: imports:validate
    -> ImportValidationProcessor
      -> validates file format, parses rows
      -> writes preview_json to import_jobs table
      -> [if valid] enqueues imports:process

  -> imports queue: imports:process
    -> ImportProcessingProcessor
      -> creates/updates records per import type
      -> writes summary_json to import_jobs table

Cron trigger
  -> imports queue: imports:file-cleanup
    -> deletes processed files from S3
```

### Gradebook Cron Flows
```
Daily 02:00 UTC
  -> gradebook queue: gradebook:detect-risks
    -> GradebookRiskDetectionProcessor
      -> iterates ALL active tenants
      -> checks grade thresholds per student
      -> creates/updates AcademicAlert records

Daily 03:00 UTC
  -> gradebook queue: report-cards:auto-generate
    -> ReportCardAutoGenerateProcessor
      -> checks for recently ended academic periods
      -> generates draft report cards
```

### Search Sync Flow
```
Any entity mutation (create/update/delete)
  -> search-sync queue: search:index-entity
    -> SearchIndexProcessor
      -> indexes entity in Meilisearch

Admin-triggered
  -> search-sync queue: search:full-reindex
    -> SearchReindexProcessor
      -> reindexes all searchable entities for tenant
```

### Compliance Flow
```
ComplianceService.approve()
  -> imports queue: compliance:execute  (NOTE: shares imports queue)
    -> ComplianceExecutionProcessor
      -> executes erasure/anonymisation per request type
```

---

## Queue Configuration Reference

| Queue | Max Retries | Backoff | Notes |
|-------|------------|---------|-------|
| admissions | default | default | |
| attendance | 3 | 5s exponential | |
| notifications | 5 | 3s exponential | Higher retries for delivery |
| search-sync | 3 | 2s exponential | |
| scheduling | 2 | 10s exponential | Solver is expensive, fewer retries |
| gradebook | 3 | 5s exponential | |
| finance | 3 | 5s exponential | |
| payroll | 3 | 5s exponential | |
| imports | 3 | 5s exponential | Also handles compliance jobs |
| reports | 3 | 5s exponential | No processors yet (future use) |
| wellbeing | 3 | 5s exponential | 5 job types: moderation-scan (on submit), survey-open-notify (on activate), survey-closing-reminder (cron 08:00), cleanup-participation-tokens (cron 05:00), eap-refresh-check (cron 06:00) |
| behaviour | 3 | 5s exponential | 23 job types: cron dispatch (daily/SLA/monthly), policy evaluation, pattern detection, MV refreshes (3), parent notification, digest notifications, task reminders, suspension return, check awards, attachment scan, break-glass expiry, SLA check, critical escalation, guardian restriction check, retention check, partition maintenance |

---

## Behaviour Module Jobs

### `behaviour:parent-notification` (notifications queue)

**Trigger**: Enqueued by `BehaviourService.createIncident()` when the category has `requires_parent_notification = true` and the incident status is `active`.
**Payload**: `{ tenant_id, incident_id, student_ids }`
**Processor**: `apps/worker/src/processors/behaviour/parent-notification.processor.ts`

**Side effects chain**:
```
Incident created with parent notification required
  -> behaviour:parent-notification enqueued to notifications queue
  -> Worker loads incident + category + tenant settings
  -> For each student participant:
    -> Load student's parents via student_parents
    -> SEND-GATE CHECK: if negative && severity >= threshold
      -> Must have parent_description, template_id, or explicit empty string
      -> If blocked: skip, keep parent_notification_status = 'pending'
    -> Create behaviour_parent_acknowledgements record
    -> Create in-app notification for parent (if user account exists)
    -> If parent_description_auto_lock_on_send = true:
      -> Lock parent_description (parent_description_locked = true)
    -> Update incident parent_notification_status = 'sent'
```

**Danger**: The send-gate check means a notification can be SILENTLY BLOCKED if a high-severity negative incident is logged without a parent_description. The incident stays in `parent_notification_status = 'pending'` until a staff member adds a parent_description and the notification is retried.

### `behaviour:task-reminders` (behaviour queue — CRON)

**Trigger**: Daily cron, 08:00 tenant timezone (scheduled per tenant).
**Payload**: `{ tenant_id }`
**Processor**: `apps/worker/src/processors/behaviour/task-reminders.processor.ts`

**Side effects chain**:
```
Cron fires daily at 08:00 tenant TZ
  -> For each pending task with due_date <= today && reminder_sent_at IS NULL:
    -> Set reminder_sent_at = now()
    -> Create in-app notification for assigned_to_id
  -> For each pending task with due_date < yesterday && overdue_notified_at IS NULL:
    -> Update status to 'overdue'
    -> Set overdue_notified_at = now()
    -> Create in-app notification for assigned_to_id
```

**Danger**: This is a per-tenant cron job. It needs to be scheduled for each active tenant. Current implementation processes one tenant per job invocation.

---

## Staff Wellbeing Module Jobs

### `wellbeing:moderation-scan` (wellbeing queue)

**Trigger**: Enqueued by `SurveyService.submitResponse()` for each freeform response when moderation is enabled.
**Payload**: `{ tenant_id, survey_id, response_id }`
**Processor**: `apps/worker/src/processors/wellbeing/moderation-scan.processor.ts`
**Side effects**: Flags response (`moderation_status = 'flagged'`) if staff names, room codes, or subject names are detected in freeform text. Does NOT auto-redact.
**Danger**: `survey_responses` has NO tenant_id — response is accessed via base client, while staff/room/subject lookups use RLS-scoped tx.

### `wellbeing:survey-open-notify` (wellbeing queue)

**Trigger**: Enqueued by `SurveyService.activate()` when a survey is activated.
**Payload**: `{ tenant_id, survey_id }`
**Processor**: `apps/worker/src/processors/wellbeing/survey-open-notify.processor.ts`
**Side effects**: Creates in-app notifications for all active tenant members.

### `wellbeing:survey-closing-reminder` (wellbeing queue — CRON)

**Trigger**: Daily cron at 08:00 UTC.
**Payload**: `{}` (cross-tenant)
**Processor**: `apps/worker/src/processors/wellbeing/survey-closing-reminder.processor.ts`
**Side effects**: Sends in-app reminders to all staff for surveys closing within 24 hours. Iterates all tenants with active surveys.

### `wellbeing:cleanup-participation-tokens` (wellbeing queue — CRON)

**Trigger**: Daily cron at 05:00 UTC.
**Payload**: `{}` (cross-tenant)
**Processor**: `apps/worker/src/processors/wellbeing/cleanup-participation-tokens.processor.ts`
**Side effects**: Deletes `survey_participation_tokens` for surveys closed >7 days ago. After cleanup, anonymity is architectural — even the server cannot determine who participated.
**Danger**: Irreversible. Once tokens are deleted, double-vote detection is no longer possible for those surveys.

### `wellbeing:eap-refresh-check` (wellbeing queue — CRON)

**Trigger**: Daily cron at 06:00 UTC.
**Payload**: `{}` (cross-tenant)
**Processor**: `apps/worker/src/processors/wellbeing/eap-refresh-check.processor.ts`
**Side effects**: Sends in-app notifications to users with `wellbeing.manage_resources` permission when EAP details are >90 days stale or unverified.

---

## Danger Zones

1. **Compliance shares the imports queue** — `compliance:execute` jobs go through the `imports` queue. If the imports queue is backed up, compliance actions (GDPR erasure) are delayed.

2. **Approval callbacks are fire-and-forget** — If the worker processor fails after approval, the approval is marked `executed` but the domain action didn't complete. Manual intervention required.

3. **Cron jobs iterate ALL tenants** — Risk detection and report card auto-generation loop through every active tenant. Adding a tenant increases job duration linearly.

4. **Search sync is eventually consistent** — Entity mutations are indexed async. Users may see stale search results for seconds after changes.

5. **No dead-letter monitoring UI** — Failed jobs go to dead-letter queues but there's no admin interface to inspect or replay them. Must use BullMQ Dashboard or direct Redis access.

6. **Behaviour parent notification send-gate** — High-severity negative incidents can have notifications silently blocked if `parent_description` is not set. The incident stays in `parent_notification_status = 'pending'` with no automatic retry. Staff must manually add a parent description to unblock.

7. **Behaviour task reminders iterate per-tenant** — Each tenant needs its own cron trigger. Adding a tenant requires scheduling the `behaviour:task-reminders` job for that tenant.

8. **Behaviour policy evaluation runs inside a single transaction** — The entire 5-stage evaluation for all student participants runs in one Prisma $transaction. If a tenant has many rules (>50 per stage), the transaction may approach the 30s timeout. Rule hygiene warnings are logged at 50+ rules per stage.

9. **Behaviour materialized view refresh crons overlap with gradebook crons** — `behaviour:refresh-mv-exposure-rates` runs at 02:00, `gradebook:detect-risks` runs at 02:00, and `behaviour:refresh-mv-benchmarks` runs at 03:00 alongside `report-cards:auto-generate`. If PostgreSQL is under memory pressure, concurrent heavy aggregations may cause issues.

10. **Behaviour pattern detection creates alerts that accumulate** — `behaviour:detect-patterns` creates `behaviour_alerts` records daily. Without periodic cleanup or auto-resolution of stale alerts, the alerts table can grow unbounded. Patterns that no longer match are auto-resolved, but resolved records remain in the table.

11. **Behaviour AI service depends on external API** — `BehaviourAIService` calls the Anthropic Claude API via `@anthropic-ai/sdk`. External API downtime, rate limits, or missing API key configuration will cause AI query endpoints to fail. These are non-critical — all other analytics endpoints work without AI.

12. **Break-glass expiry cron is UNREGISTERED** — The `BreakGlassExpiryProcessor` exists and is registered as a provider in `WorkerModule`, but no cron schedule is configured in `CronSchedulerService` or dispatched by `cron-dispatch.processor.ts`. Break-glass grants will not auto-expire until this is resolved. Flagged in SP7 remediation.

13. **Critical escalation re-enqueue is outside transaction** — `CriticalEscalationProcessor` re-enqueues the next escalation step AFTER the Prisma transaction commits (SP3 fix). If the worker crashes between commit and re-enqueue, the escalation chain silently stops. The concern remains in `reported` status with no further notifications.

14. **SLA check runs every 5 minutes without dedup jobId** — The `cron-dispatch-sla` dispatcher does not use dedup jobIds, so concurrent SLA check jobs for the same tenant can run simultaneously. The SLA check processor is idempotent, so this is safe but creates unnecessary load.

15. **Check-awards queue failure is swallowed** — When `BehaviourService.createIncident()` enqueues `behaviour:check-awards`, the queue add is wrapped in try/catch with an empty catch block. If the queue is down, no auto-awards are checked and no error is surfaced to the user or logged.

16. **ClamAV scanning is a TODO** — `AttachmentScanProcessor` has a development fallback that marks all attachments as `clean` when ClamAV is unavailable. Even when ClamAV IS available, the actual scanning integration is a TODO — it currently marks files as clean unconditionally.

---

### `behaviour:evaluate-policy` (behaviour queue)

**Trigger**: Enqueued by `BehaviourService.createIncident()` when status is `active`, and by `BehaviourService.addParticipant()` when participant type is `student`.
**Payload**: `{ tenant_id, incident_id, trigger: 'incident_created' | 'participant_added', triggered_at }`
**Processor**: `apps/worker/src/processors/behaviour/evaluate-policy.processor.ts`
**Retries**: 3 with exponential backoff (5s, 10s, 20s)
**Timeout**: 30s

**Side effects chain**:
```
Incident created / participant added
  -> behaviour:evaluate-policy enqueued to behaviour queue
  -> Worker loads incident + student participants
  -> Skip if incident status is withdrawn/draft
  -> For each student participant:
    -> Check existing evaluations (idempotency: skip already-evaluated stages)
    -> For each of 5 stages (consequence -> approval -> notification -> support -> alerting):
      -> Load active rules for stage, sorted by priority ASC
      -> For each rule: parse conditions, build evaluated input from snapshots, evaluate
      -> Record evaluation in behaviour_policy_evaluations (append-only)
      -> Execute matched rule actions with dedup guards:
        -> auto_escalate: create new escalated incident, transition original to 'escalated'
        -> create_sanction: create behaviour_sanctions record
        -> require_approval: set incident.approval_status = 'pending'
        -> require_parent_meeting: create behaviour_tasks (parent_meeting type)
        -> require_parent_notification: set incident.parent_notification_status = 'pending'
        -> create_task: create behaviour_tasks record
        -> create_intervention: create behaviour_interventions record
        -> flag_for_review: set incident.status = 'under_review'
        -> block_without_approval: set incident.approval_status = 'pending'
        -> notify_roles / notify_users: recorded as success (actual dispatch deferred)
      -> Record action execution in behaviour_policy_action_executions (append-only)
    -> Link consequence stage evaluation ID to incident.policy_evaluation_id
```

**Danger**: A single failed action does NOT abort the pipeline — it's recorded as `execution_status = 'failed'` and processing continues. The pipeline runs entirely within one Prisma transaction, so if the transaction times out, ALL evaluations for that incident are lost and the job will retry from scratch (idempotent — already-evaluated stages are skipped).

---

### `behaviour:suspension-return` (behaviour queue)

**Trigger**: Daily cron at 07:00 per tenant timezone (one job per tenant).
**Payload**: `{ tenant_id }`
**Processor**: `apps/worker/src/processors/behaviour/suspension-return.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase C

**Side effects chain**:
```
Daily cron fires at 07:00
  -> behaviour:suspension-return enqueued per tenant
  -> Worker computes target_date = today + 3 school days (respects school_closures)
  -> Queries behaviour_sanctions WHERE suspension_end_date = target_date
     AND status IN (scheduled, not_served_absent)
     AND type IN (suspension_internal, suspension_external)
  -> For each matching sanction:
    -> Idempotency: check if return_check_in task already exists for this sanction
    -> If no existing task: create behaviour_task with:
       - task_type = 'return_check_in'
       - assigned_to_id = supervised_by_id -> principal fallback
       - priority = 'high', due_date = suspension_end_date
```

**Danger**: The 3 school day lookahead uses `addSchoolDays()` from shared package, which queries `school_closures`. If closures are not up-to-date, tasks may be created on wrong dates. Idempotent — safe to retry.

---

### `behaviour:detect-patterns` (behaviour queue — CRON)

**Trigger**: Daily cron at 05:00 UTC.
**Payload**: `{ tenant_id }`
**Processor**: `apps/worker/src/processors/behaviour/detect-patterns.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase F

**Side effects chain**:
```
Daily cron fires at 05:00 UTC
  -> behaviour:detect-patterns enqueued per tenant
  -> Worker runs 7 pattern detection algorithms:
    -> frequency spike, escalation trajectory, peer cluster,
       time-of-day concentration, category shift, response effectiveness, chronic low-level
  -> For each detected pattern:
    -> Upsert behaviour_alerts record (idempotent by pattern signature)
    -> Create behaviour_alert_recipients for relevant staff
  -> Patterns that no longer match are auto-resolved (status -> resolved)
```

**Danger**: Runs 7 algorithms sequentially per tenant. For tenants with large incident volumes (>1000 active incidents), this job may approach timeout. Each algorithm queries behaviour_incidents and related tables — performance depends on proper indexing.

---

### `behaviour:digest-notifications` (notifications queue — CRON)

**Trigger**: Cron at tenant-configured time (`parent_notification_digest_time` setting, default `16:00`), evaluated per tenant in tenant timezone. Only active when `parent_notification_digest_enabled = true`.
**Payload**: `{ tenant_id }`
**Processor**: `apps/worker/src/processors/behaviour/digest-notifications.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase G

**Side effects chain**:
```
Cron fires at tenant digest time
  -> behaviour:digest-notifications enqueued per tenant
  -> Worker loads all incidents with parent_notification_status = 'pending' and category.parent_visible = true
  -> Groups incidents by student, then builds per-parent digest
  -> For each parent across all their linked students:
    -> Guardian restriction check per student (skip restricted)
    -> Dedup check (skip if ack already exists in last 24h)
    -> Apply parent-safe rendering priority chain to each incident (parent_description → template text → category+date)
    -> Compose ONE batch digest with all rendered entries
    -> Create notifications via parent's preferred channels (in_app always + email/whatsapp from preferred_contact_channels)
    -> Create behaviour_parent_acknowledgements row per incident in batch
  -> Update all processed incidents parent_notification_status to 'sent'
```

**Danger**: Processes all pending incidents for a tenant in one batch. For tenants with high incident volumes and many parents, this job may be slow. Individual parent failures don't abort the batch — errors are logged and other parents continue. The preferred channel resolution reads `preferred_contact_channels` from the parent record — if this field is stale or empty, only in_app notifications are created.

---

### `behaviour:attachment-scan` (behaviour queue)

**Trigger**: Enqueued by `BehaviourAttachmentService` when an attachment is uploaded to a behaviour entity (incident, sanction, appeal, etc.).
**Payload**: `{ tenant_id, attachment_id, file_key }`
**Processor**: `apps/worker/src/processors/behaviour/attachment-scan.processor.ts`
**Retries**: 3 with exponential backoff (5s, 10s, 20s)
**Added in**: Phase D

**Side effects chain**:
```
Attachment uploaded
  -> behaviour:attachment-scan enqueued to behaviour queue
  -> Worker loads attachment record by id + tenant_id
  -> Idempotency: skip if scan_status is not 'pending_scan'
  -> Check ClamAV socket at /var/run/clamav/clamd.ctl
  -> If ClamAV unavailable (dev/staging):
    -> Auto-approve as 'clean' (development fallback)
    -> Set scanned_at = now()
  -> If ClamAV available (production):
    -> Scan file via unix socket (TODO: actual integration pending)
    -> Update scan_status to 'clean' or 'infected'
    -> Set scanned_at = now()
```

**Danger**: ClamAV fallback auto-approves all attachments as clean when the socket is not found. This is safe for development but means ALL attachments pass scanning in non-ClamAV environments. The actual ClamAV scanning integration is a TODO — currently marks all files as clean even in production if ClamAV is installed.

---

### `behaviour:break-glass-expiry` (behaviour queue — CRON, registration pending)

**Trigger**: Designed as a cron job (spec: every 5 min per tenant). Processor exists but cron registration is NOT present in `CronSchedulerService`. Not dispatched by `cron-dispatch.processor.ts` either. Currently a dead processor awaiting cron registration.
**Payload**: `{ tenant_id }`
**Processor**: `apps/worker/src/processors/behaviour/break-glass-expiry.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase D

**Side effects chain**:
```
Cron would fire per tenant (REGISTRATION PENDING)
  -> behaviour:break-glass-expiry enqueued per tenant
  -> Worker queries safeguarding_break_glass_grants WHERE:
     revoked_at IS NULL AND expires_at < NOW()
  -> For each expired grant:
    -> Atomically revoke: set revoked_at = now() (WHERE revoked_at IS NULL guard)
    -> Create behaviour_task with:
       - task_type = 'break_glass_review'
       - entity_type = 'break_glass_grant'
       - assigned_to_id = granted_by_id
       - priority = 'high', due_date = 7 days from now
    -> Create notifications for granted_by_id (in_app: delivered immediately, email: queued)
       - template_key = 'safeguarding.break_glass_expired'
```

**Danger**: This processor is UNREGISTERED as a cron job. Break-glass grants will NOT auto-expire until the cron is registered in `CronSchedulerService` or added to `cron-dispatch.processor.ts` as a daily dispatch. This is a known remediation gap (flagged in SP7).

---

### `behaviour:check-awards` (behaviour queue)

**Trigger**: Enqueued by `BehaviourService.createIncident()` when the incident status is `active` AND the category polarity is `positive`.
**Payload**: `{ tenant_id, incident_id, student_ids, academic_year_id, academic_period_id }`
**Processor**: `apps/worker/src/processors/behaviour/check-awards.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase E

**Side effects chain**:
```
Positive incident created with status = active
  -> behaviour:check-awards enqueued to behaviour queue
  -> Worker loads active award types with non-null points_threshold (sorted by tier_level DESC, threshold DESC)
  -> For each student in student_ids:
    -> Aggregate total points from all active non-withdrawn incidents
    -> For each eligible award type (totalPoints >= threshold):
      -> Dedup guard: skip if award already exists for same student + award_type + incident
      -> Repeat eligibility check (once_ever, once_per_year, once_per_period, unlimited, max_per_year cap)
      -> If eligible: create behaviour_recognition_award record
      -> Tier supersession: if award type supersedes lower tiers in same tier_group,
         mark lower-tier awards with superseded_by_id = new award
      -> For each parent of the student:
        -> Guardian restriction check (skip if no_behaviour_notifications or no_communications)
        -> Resolve notification channels from parent.preferred_contact_channels
        -> Create notifications per channel (in_app: delivered, email/whatsapp/sms: queued)
        -> template_key = 'behaviour.award_parent'
      -> Auto-populate recognition wall if tenant setting recognition_wall_auto_populate = true:
        -> Create behaviour_publication_approval record
        -> Consent + admin approval gates determine if published_at is set immediately
```

**Danger**: The points aggregation is computed fresh from the database (no cache). For students with very high incident counts, this aggregation query may be slow. The parent notification does NOT go through the parent-notification processor — it creates notifications directly in the same transaction. If the queue add fails during incident creation, the failure is swallowed silently (try/catch with empty catch block).

---

### `safeguarding:critical-escalation` (behaviour queue)

**Trigger**: Enqueued by `SafeguardingService.reportConcern()` when `severity = 'critical'` (initial step 0, no delay). Self-re-enqueues with 30-minute delay for subsequent steps (SP3 fix: re-enqueue happens OUTSIDE the Prisma transaction).
**Payload**: `{ tenant_id, concern_id, escalation_step }`
**Processor**: `apps/worker/src/processors/behaviour/critical-escalation.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase D, fixed in SP3

**Side effects chain**:
```
Critical concern reported OR previous escalation step completed
  -> safeguarding:critical-escalation enqueued to behaviour queue
  -> Worker loads safeguarding_concern by id + tenant_id
  -> TERMINATION CHECK: if concern status !== 'reported', stop escalation chain
  -> Load escalation chain from tenant settings:
     [designated_liaison_user_id, deputy_designated_liaison_user_id, ...dlp_fallback_chain]
  -> If escalation_step >= chain length:
    -> Record 'chain exhausted' action in safeguarding_actions
    -> STOP (no re-enqueue)
  -> Record escalation action in safeguarding_actions
  -> Create notifications for target user (in_app: delivered, email: queued)
    -> template_key = 'safeguarding.critical_escalation'
  -> If next step < chain length:
    -> Set nextEscalationStep on job instance (signal for re-enqueue)
  -> AFTER transaction commits (outside Prisma $transaction):
    -> Re-enqueue with 30-minute delay and dedup jobId = 'critical-esc-{concern_id}-step-{nextStep}'
```

**Danger**: The re-enqueue happens OUTSIDE the transaction boundary (SP3 fix). If the worker crashes between transaction commit and re-enqueue, the escalation chain stops. The dedup jobId prevents duplicate escalation steps. Once the concern is acknowledged (status !== 'reported'), the entire escalation chain terminates — a late acknowledgement kills all pending delayed jobs when they fire.

---

### `behaviour:guardian-restriction-check` (behaviour queue — dispatched by daily cron)

**Trigger**: Dispatched by `behaviour:cron-dispatch-daily` at 06:00 UTC for each active behaviour tenant.
**Payload**: `{ tenant_id }`
**Processor**: `apps/worker/src/processors/behaviour/guardian-restriction-check.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase G

**Side effects chain**:
```
Daily cron dispatch at 06:00 UTC
  -> behaviour:guardian-restriction-check enqueued per tenant
  -> Step 1: Expire ended restrictions
    -> Query active restrictions WHERE effective_until < today (UTC midnight)
    -> For each: update status to 'expired'
    -> Record entity history: change_type = 'status_changed', reason = 'Auto-expired'
  -> Step 2: Create review reminder tasks
    -> Query active restrictions WHERE review_date <= 14 days from now
    -> For each with upcoming review:
      -> Idempotency: skip if open review task already exists (pending or in_progress)
      -> Calculate priority: 'high' if <= 3 days, 'medium' otherwise
      -> Create behaviour_task with:
        - task_type = 'guardian_restriction_review'
        - entity_type = 'guardian_restriction'
        - assigned_to_id = set_by_id
        - due_date = review_date
```

**Danger**: The review task creation uses the restriction's `set_by_id` as the assignee. If that staff member has left the school, the task is assigned to an inactive user. Date comparison uses UTC midnight — timezone edge cases may cause off-by-one day issues for tenants far from UTC.

---

### `safeguarding:sla-check` (behaviour queue — dispatched by SLA cron)

**Trigger**: Dispatched by `behaviour:cron-dispatch-sla` every 5 minutes for each active behaviour tenant.
**Payload**: `{ tenant_id }`
**Processor**: `apps/worker/src/processors/behaviour/sla-check.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase D

**Side effects chain**:
```
SLA cron dispatch every 5 minutes
  -> safeguarding:sla-check enqueued per tenant
  -> Worker queries safeguarding_concerns WHERE:
     sla_first_response_met_at IS NULL
     AND sla_first_response_due < NOW()
     AND status NOT IN ('sg_resolved', 'sealed')
  -> For each breached concern:
    -> Idempotency: skip if breach task already exists (title starts with 'SLA BREACH', status pending/in_progress)
    -> Create behaviour_task with:
      - task_type = 'safeguarding_action'
      - entity_type = 'safeguarding_concern'
      - title = 'SLA BREACH: {concern_number} — acknowledgement overdue'
      - priority = 'urgent', due_date = now
      - assigned_to_id = designated_liaison_id ?? reported_by_id
    -> Create notifications for assignee (in_app: delivered, email: queued)
      - template_key = 'safeguarding.sla_breach'
```

**Danger**: Runs every 5 minutes across all tenants. If a tenant has many unacknowledged safeguarding concerns with breached SLAs, each run checks and creates tasks for all of them. The idempotency check (title prefix match) is string-based — if the title format changes, dedup breaks and duplicate tasks are created.

---

### `behaviour:cron-dispatch-daily` (behaviour queue — CRON)

**Trigger**: Repeatable cron, runs hourly (`0 * * * *`).
**Payload**: None (cross-tenant dispatcher — no tenant_id).
**Processor**: `apps/worker/src/processors/behaviour/cron-dispatch.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: SP1

**Side effects chain**:
```
Hourly cron fires
  -> Query all active tenants with behaviour module enabled
  -> For each tenant, based on current hour in tenant's timezone:
    -> 07:00 TZ: enqueue behaviour:suspension-return (behaviour queue)
    -> 08:00 TZ: enqueue behaviour:task-reminders (behaviour queue)
    -> Digest time TZ (default 16:00): enqueue behaviour:digest-notifications (notifications queue)
  -> For each tenant, based on current UTC hour:
    -> 05:00 UTC: enqueue behaviour:detect-patterns (behaviour queue)
    -> 06:00 UTC: enqueue behaviour:guardian-restriction-check (behaviour queue)
  -> Each enqueued job includes dedup jobId: 'daily:{job_name}:{tenant_id}'
```

**Danger**: This is a cross-tenant processor — it queries tenants WITHOUT RLS context (system-level read). It injects the `notificationsQueue` for digest dispatch. Invalid timezone strings fall back to UTC silently. If a tenant's timezone is misconfigured, their daily jobs fire at the wrong local hour.

---

### `behaviour:cron-dispatch-sla` (behaviour queue — CRON)

**Trigger**: Repeatable cron, runs every 5 minutes (`*/5 * * * *`).
**Payload**: None (cross-tenant dispatcher — no tenant_id).
**Processor**: `apps/worker/src/processors/behaviour/cron-dispatch.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: SP1

**Side effects chain**:
```
Every 5 minutes cron fires
  -> Query all active tenants with behaviour module enabled
  -> For each tenant: enqueue safeguarding:sla-check (behaviour queue)
  -> No dedup jobId (each 5-min tick creates new jobs)
```

**Danger**: No dedup jobId means if the previous batch of SLA checks is still processing when the next tick fires, multiple SLA check jobs may run concurrently for the same tenant. The SLA check processor itself is idempotent (dedup on existing tasks), so this is safe but wasteful.

---

### `behaviour:cron-dispatch-monthly` (behaviour queue — CRON)

**Trigger**: Repeatable cron, monthly on the 1st at 01:00 UTC (`0 1 1 * *`).
**Payload**: None (cross-tenant dispatcher — no tenant_id).
**Processor**: `apps/worker/src/processors/behaviour/cron-dispatch.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: SP1

**Side effects chain**:
```
Monthly cron fires on 1st at 01:00 UTC
  -> Query all active tenants with behaviour module enabled
  -> For each tenant: enqueue behaviour:retention-check (behaviour queue)
  -> No dedup jobId
```

**Danger**: Runs at 01:00, one hour after `behaviour:partition-maintenance` (00:00). The retention check processor itself has `retries: 1` (no retry), so if it fails it goes directly to dead-letter. The monthly dispatch creates one retention-check job per tenant — for tenants with large datasets, these jobs may run for extended periods.

---

### `notifications:dispatch-queued` (notifications queue — CRON)

**Trigger**: Repeatable cron, runs every 30 seconds (`every: 30_000`).
**Payload**: None (cross-tenant dispatcher — no tenant_id).
**Processor**: `apps/worker/src/processors/notifications/dispatch-queued.processor.ts`
**Retries**: 5 with exponential backoff (3s, notifications queue defaults)
**Added in**: SP2

**Side effects chain**:
```
Every 30 seconds cron fires
  -> Cross-tenant query (no RLS): find notifications WHERE
     status = 'queued' AND channel != 'in_app'
     AND (next_retry_at IS NULL OR next_retry_at <= NOW())
  -> Limit to 50 per batch (FIFO by created_at)
  -> Group by tenant_id
  -> For each tenant batch:
    -> Set RLS context within interactive transaction
    -> Clear next_retry_at on matched notifications
    -> Enqueue communications:dispatch-notifications with { tenant_id, notification_ids }
```

**Danger**: The 50-per-batch limit means at most 50 notifications are dispatched per 30-second tick. If a tenant generates a burst of queued notifications (e.g., mass digest), it may take multiple ticks to drain the queue. The cross-tenant query runs without RLS — it reads notification IDs across all tenants, then sets RLS per tenant for the update. This is intentional for the dispatch pattern.

---

### `behaviour:refresh-mv-student-summary` (behaviour queue — CRON)

**Trigger**: Cron every 15 minutes (`*/15 * * * *`).
**Payload**: None (runs for all tenants — materialized view is cross-tenant, filtered by RLS at query time).
**Processor**: `apps/worker/src/processors/behaviour/refresh-mv-student-summary.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase F

**Side effects chain**:
```
Cron fires every 15 minutes
  -> REFRESH MATERIALIZED VIEW CONCURRENTLY mv_student_behaviour_summary
  -> No other side effects (read-only refresh)
```

**Danger**: `CONCURRENTLY` requires a unique index on the materialized view. If the unique index is missing, the refresh will fail. The 15-minute interval means analytics data can be up to 15 minutes stale.

---

### `behaviour:refresh-mv-benchmarks` (behaviour queue — CRON)

**Trigger**: Daily cron at 03:00 UTC (`0 3 * * *`).
**Payload**: None (runs for all tenants).
**Processor**: `apps/worker/src/processors/behaviour/refresh-mv-benchmarks.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase F

**Side effects chain**:
```
Daily cron fires at 03:00 UTC
  -> REFRESH MATERIALIZED VIEW CONCURRENTLY mv_behaviour_benchmarks
  -> No other side effects (read-only refresh)
```

**Danger**: Runs at 03:00, one hour after `behaviour:refresh-mv-exposure-rates` (02:00). Both are heavy aggregations — stagger is intentional to avoid concurrent load on PostgreSQL.

---

### `behaviour:refresh-mv-exposure-rates` (behaviour queue — CRON)

**Trigger**: Daily cron at 02:00 UTC (`0 2 * * *`).
**Payload**: None (runs for all tenants).
**Processor**: `apps/worker/src/processors/behaviour/refresh-mv-exposure-rates.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase F

**Side effects chain**:
```
Daily cron fires at 02:00 UTC
  -> REFRESH MATERIALIZED VIEW CONCURRENTLY mv_behaviour_exposure_rates
  -> No other side effects (read-only refresh)
```

**Danger**: Earliest of the nightly behaviour crons (02:00). Must complete before `refresh-mv-benchmarks` at 03:00 if benchmarks depend on exposure rate data.

---

### `behaviour:retention-check` (behaviour queue — CRON)

**Trigger**: Monthly cron, 1st of month at 01:00 UTC (`0 1 1 * *`), or manual via admin ops.
**Payload**: `{ tenant_id: string, dry_run?: boolean }`
**Processor**: `apps/worker/src/processors/behaviour/retention-check.processor.ts`
**Retries**: 1 (no retry — long-running, should not auto-retry)
**Added in**: Phase H

**Side effects chain**:
```
Monthly cron or admin trigger
  -> Pass 1: Archival — marks records for left students as 'archived' (retention_status)
  -> Pass 2: Anonymisation — strips PII from archived records past retention deadline
    -> Checks behaviour_legal_holds before each entity (skips if held)
    -> Logs 'anonymised' in behaviour_entity_history
  -> Pass 3: Flags exclusion_cases and safeguarding_concerns for manual review
  -> Pass 4: Expires guardian_restrictions where effective_until < today
```

**Danger**: Anonymisation is IRREVERSIBLE. Legal hold check is the only safety gate. If `dry_run=true`, no DB changes are made. Always require dual approval for manual execution.

---

### `behaviour:partition-maintenance` (behaviour queue — CRON)

**Trigger**: Monthly cron, 1st of month at 00:00 UTC (`0 0 1 * *`).
**Payload**: None (schema management, not tenant-scoped).
**Processor**: `apps/worker/src/processors/behaviour/partition-maintenance.processor.ts`
**Retries**: 3 with exponential backoff
**Added in**: Phase H

**Side effects chain**:
```
Monthly cron fires at 00:00 UTC
  -> Creates next 3 months of partitions for monthly-partitioned tables
  -> Creates next 2 years of partitions for yearly-partitioned tables
  -> Tables: behaviour_entity_history, behaviour_policy_evaluations,
     behaviour_policy_action_executions, behaviour_parent_acknowledgements,
     behaviour_alerts, behaviour_alert_recipients
```

**Danger**: Not tenant-aware — runs at DB schema level. Uses `$executeRawUnsafe` for DDL — table/partition names derived from constants, not user input. Must complete before any inserts into new month's partitions.
