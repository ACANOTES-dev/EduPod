# Event & Job Side-Effect Catalog

> **Purpose**: Before modifying any queue, job, or approval flow, check here for the full chain of consequences.
> **Maintenance**: Update when adding new jobs, changing job payloads, or modifying approval callbacks.
> **Last verified**: 2026-03-26

---

## Architecture Overview

- **No EventEmitter2 / @OnEvent patterns** — all async communication is via BullMQ queues
- **Hub-and-spoke**: API enqueues jobs, Worker processes them. No queue-to-queue chaining within Worker.
- **Every job payload MUST include `tenant_id`** — enforced by TenantAwareJob base class
- **11 queues**, **32 job types**, **3 cron jobs**

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
| behaviour | 3 | 5s exponential | Task reminders cron, policy evaluation |

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

## Danger Zones

1. **Compliance shares the imports queue** — `compliance:execute` jobs go through the `imports` queue. If the imports queue is backed up, compliance actions (GDPR erasure) are delayed.

2. **Approval callbacks are fire-and-forget** — If the worker processor fails after approval, the approval is marked `executed` but the domain action didn't complete. Manual intervention required.

3. **Cron jobs iterate ALL tenants** — Risk detection and report card auto-generation loop through every active tenant. Adding a tenant increases job duration linearly.

4. **Search sync is eventually consistent** — Entity mutations are indexed async. Users may see stale search results for seconds after changes.

5. **No dead-letter monitoring UI** — Failed jobs go to dead-letter queues but there's no admin interface to inspect or replay them. Must use BullMQ Dashboard or direct Redis access.

6. **Behaviour parent notification send-gate** — High-severity negative incidents can have notifications silently blocked if `parent_description` is not set. The incident stays in `parent_notification_status = 'pending'` with no automatic retry. Staff must manually add a parent description to unblock.

7. **Behaviour task reminders iterate per-tenant** — Each tenant needs its own cron trigger. Adding a tenant requires scheduling the `behaviour:task-reminders` job for that tenant.

8. **Behaviour policy evaluation runs inside a single transaction** — The entire 5-stage evaluation for all student participants runs in one Prisma $transaction. If a tenant has many rules (>50 per stage), the transaction may approach the 30s timeout. Rule hygiene warnings are logged at 50+ rules per stage.

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
