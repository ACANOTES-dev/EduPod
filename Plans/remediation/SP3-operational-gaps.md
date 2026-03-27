# Sub-Plan 3: Operational Gaps

**Module**: Behaviour Management
**Scope**: 9 discrete operational gaps preventing 100% spec compliance
**Estimated total effort**: 3.5-4.5 hours
**Dependencies**: None -- all gaps are independent of each other and can be implemented in any order

---

## Table of Contents

1. [SP3-1: 30-Minute Critical Escalation Timer](#sp3-1-30-minute-critical-escalation-timer)
2. [SP3-2: Inter-Escalation Cooldown](#sp3-2-inter-escalation-cooldown)
3. [SP3-3: Overdue Intervention Review Priority Escalation](#sp3-3-overdue-intervention-review-priority-escalation)
4. [SP3-4: 7-Day Completion Reminder Task](#sp3-4-7-day-completion-reminder-task)
5. [SP3-5: Document Template Seed Data](#sp3-5-document-template-seed-data)
6. [SP3-6: Withdrawal Compensating Actions](#sp3-6-withdrawal-compensating-actions)
7. [SP3-7: BehaviourChangeType Enum](#sp3-7-behaviourchangetype-enum)
8. [SP3-8: DB-Level Student Participant Constraint](#sp3-8-db-level-student-participant-constraint)
9. [SP3-9: Task State Transition Validation](#sp3-9-task-state-transition-validation)

---

## SP3-1: 30-Minute Critical Escalation Timer

**Spec reference**: "severity = 'critical' -> immediate push to DLP -> 30min fallback to deputy DLP -> 30min to principal" (Section 3.5)

**Current state**: `safeguarding.service.ts` enqueues the job with `{ delay: 0 }` at step 0. The processor (`critical-escalation.processor.ts`) runs all steps synchronously in a single job execution -- it processes step N, records the action, then exits. There is no mechanism to schedule the *next* step after a 30-minute delay if the concern remains unacknowledged.

**Root cause**: The job runs once, processes one step, and does not re-enqueue itself with a delay for the next step.

### Changes Required

#### File: `apps/worker/src/processors/behaviour/critical-escalation.processor.ts`

**Current logic** (lines 55-148): Loads concern, checks status, builds escalation chain, processes current step, exits.

**New logic**: After successfully processing a step (sending notification + recording action), the processor must re-enqueue itself for the next step with a 30-minute delay (1,800,000 ms). The processor needs access to the BullMQ queue to enqueue follow-up jobs.

1. **Inject the BullMQ queue** into `CriticalEscalationProcessor`. The processor is already `@Processor(QUEUE_NAMES.BEHAVIOUR)` so it can inject the queue via constructor:
   ```
   constructor(
     @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
     @InjectQueue(QUEUE_NAMES.BEHAVIOUR) private readonly behaviourQueue: Queue,
   )
   ```
   Import `InjectQueue` from `@nestjs/bullmq` and `Queue` from `bullmq`.

2. **Pass the queue to the job class**. Change `CriticalEscalationJob` constructor to accept the queue:
   ```
   class CriticalEscalationJob extends TenantAwareJob<CriticalEscalationPayload> {
     constructor(prisma: PrismaClient, private readonly queue: Queue) { super(prisma); }
   }
   ```

3. **After recording the escalation action** (line 136-143), add re-enqueue logic:
   ```
   // 7. Schedule next escalation step in 30 minutes
   const nextStep = escalation_step + 1;
   if (nextStep < escalationChain.length) {
     await this.queue.add(CRITICAL_ESCALATION_JOB, {
       tenant_id,
       concern_id,
       escalation_step: nextStep,
     }, { delay: 30 * 60 * 1000 }); // 30 minutes
     this.logger.log(
       `Scheduled escalation step ${nextStep} for concern ${concern_id} in 30 minutes`,
     );
   }
   ```

4. **Note**: The `processJob` method runs inside a Prisma transaction (via `TenantAwareJob`). The queue.add must happen *outside* the transaction to avoid orphaned delayed jobs on rollback. This requires restructuring: either move the re-enqueue out of `processJob` and into `process()` in the processor (after `escalationJob.execute()` succeeds), or use a return value from `processJob` to signal re-enqueue.

   **Recommended approach**: Add a `nextStepPayload` field to `CriticalEscalationJob` that `processJob` sets, and have the processor check it after execution:
   ```
   // In CriticalEscalationProcessor.process():
   const escalationJob = new CriticalEscalationJob(this.prisma);
   await escalationJob.execute(job.data);

   if (escalationJob.nextStepPayload) {
     await this.behaviourQueue.add(
       CRITICAL_ESCALATION_JOB,
       escalationJob.nextStepPayload,
       { delay: 30 * 60 * 1000 },
     );
   }
   ```

5. **Guard against double-processing**: Before processing a step, check if a delayed job for the same concern already exists at the same or higher step. Use a job ID convention: `critical-esc-${concern_id}-step-${escalation_step}` passed as `{ jobId: ... }` to `queue.add()`. BullMQ deduplicates by jobId.

#### File: `apps/api/src/modules/behaviour/safeguarding.service.ts`

**Change**: The initial enqueue at line 260-264 should use `{ delay: 0 }` for step 0 (immediate DLP notification). This is already correct.

#### File: `apps/worker/src/worker.module.ts`

**Change**: The `CriticalEscalationProcessor` needs the queue injected. Ensure `BullModule.registerQueue({ name: QUEUE_NAMES.BEHAVIOUR })` is in the imports array -- verify it already is (it should be, since other behaviour processors use the same queue).

### Acceptance Criteria

- When a critical safeguarding concern is reported, the DLP is notified immediately (step 0, delay: 0)
- If the concern remains in `reported` status after 30 minutes, the deputy DLP is notified (step 1)
- If still `reported` after another 30 minutes, the principal is notified (step 2)
- If the concern status changes to anything other than `reported` before a delayed step fires, the job is a no-op (already implemented in lines 73-79)
- No duplicate delayed jobs for the same concern and step
- Unit test: verify re-enqueue with 30-minute delay after step 0

**Effort**: 30 minutes

---

## SP3-2: Inter-Escalation Cooldown

**Spec reference**: Implied by the policy engine architecture -- duplicate escalations of the same category within a cooldown window should be suppressed.

**Current state**: The policy engine (`evaluate-policy.processor.ts`) evaluates rules on each incident creation. If a student triggers the same category-based escalation rule twice within the same window (e.g., "3 verbal warnings in 30 days -> written warning"), it can create duplicate escalation actions.

### Changes Required

#### File: `apps/worker/src/processors/behaviour/evaluate-policy.processor.ts`

1. Before executing a matched policy action, query `BehaviourPolicyActionExecution` for the same `student_id + rule_id + action_type` combination within the configured cooldown window:
   ```
   const cooldownMs = rule.cooldown_hours ? rule.cooldown_hours * 3600 * 1000 : 24 * 3600 * 1000; // default 24h
   const cooldownStart = new Date(Date.now() - cooldownMs);

   const recentExecution = await tx.behaviourPolicyActionExecution.findFirst({
     where: {
       tenant_id,
       rule_id: rule.id,
       student_id: evaluation.student_id,
       created_at: { gte: cooldownStart },
     },
   });

   if (recentExecution) {
     logger.log(`Skipping action for rule ${rule.id} — cooldown active (last executed ${recentExecution.created_at})`);
     continue; // skip this action
   }
   ```

2. The cooldown period should be configurable per rule. Check if `BehaviourPolicyRule` already has a `cooldown_hours` column. If not, add it.

#### File: `packages/prisma/schema.prisma`

Check if `BehaviourPolicyRule` has a `cooldown_hours` field. If missing:
- Add `cooldown_hours Int? @default(24)` to the `BehaviourPolicyRule` model
- Create migration: `npx prisma migrate dev --name add-policy-rule-cooldown-hours`

### Acceptance Criteria

- A policy rule action is not executed if the same rule+student+action_type was executed within the cooldown window
- Default cooldown is 24 hours if not configured per rule
- The skipped execution is logged but no error is thrown
- Existing policy evaluations are unaffected (cooldown only applies prospectively)

**Effort**: 25 minutes

---

## SP3-3: Overdue Intervention Review Priority Escalation

**Spec reference**: "Overdue -> auto-escalate priority" (Section 3.4 Interventions)

**Current state**: The `detect-patterns.processor.ts` (lines 247-279) detects overdue intervention reviews and creates `overdue_review` alerts. The `task-reminders.processor.ts` marks tasks as `overdue` status. However, neither processor escalates the *priority* of the associated `intervention_review` task when a review becomes overdue.

### Changes Required

#### File: `apps/worker/src/processors/behaviour/task-reminders.processor.ts`

In the overdue detection loop (lines 110-153), after marking a task as `overdue`, add priority escalation logic for intervention_review tasks:

```
// After updating status to overdue:
if (task.task_type === 'intervention_review') {
  // Escalate priority: medium -> high, high -> urgent
  const currentPriority = task.priority;
  let escalatedPriority = currentPriority;
  if (currentPriority === 'low') escalatedPriority = 'medium';
  else if (currentPriority === 'medium') escalatedPriority = 'high';
  else if (currentPriority === 'high') escalatedPriority = 'urgent';

  if (escalatedPriority !== currentPriority) {
    await tx.behaviourTask.update({
      where: { id: task.id },
      data: { priority: escalatedPriority },
    });
  }
}
```

This requires the query at line 111-119 to also select `task_type` and `priority`:
```
select: { id: true, title: true, assigned_to_id: true, task_type: true, priority: true },
```

Note: The `task_type` field is a Prisma enum `BehaviourTaskType`. The query needs to include it in the select clause.

### Acceptance Criteria

- When a task with `task_type = 'intervention_review'` transitions to `overdue`, its priority is escalated one level
- Priority escalation caps at `urgent` (no further escalation)
- Non-intervention_review tasks are not affected
- Priority escalation is idempotent (running the job again does not re-escalate if already at the correct level, because the task is already in `overdue` status and won't be re-selected by the `status: 'pending'` filter)

**Effort**: 15 minutes

---

## SP3-4: 7-Day Completion Reminder Task

**Spec reference**: "Completion due -> reminder 7 days before target_end_date" (Section 3.4 Interventions)

**Current state**: No cron job or processor creates a reminder task 7 days before an intervention's `target_end_date`. The `detect-patterns.processor.ts` runs periodically but only detects overdue reviews, not approaching completion dates.

### Changes Required

#### File: `apps/worker/src/processors/behaviour/detect-patterns.processor.ts`

Add a new detection section (after section 4 "Overdue Reviews") in the `processJob` method:

```
// ─── 4b. Intervention Completion Reminders ────────────────────────
const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
const eightDaysFromNow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

// Find active interventions with target_end_date in exactly 7 days (within a 24h window)
const approachingCompletion = await tx.behaviourIntervention.findMany({
  where: {
    tenant_id: tenantId,
    status: { in: ['active_intervention', 'monitoring'] as $Enums.InterventionStatus[] },
    target_end_date: { gte: sevenDaysFromNow, lt: eightDaysFromNow },
  },
  select: {
    id: true,
    intervention_number: true,
    student_id: true,
    assigned_to_id: true,
    target_end_date: true,
  },
});

for (const iv of approachingCompletion) {
  // Check if a completion_reminder task already exists for this intervention
  const existingTask = await tx.behaviourTask.findFirst({
    where: {
      tenant_id: tenantId,
      entity_type: 'intervention' as $Enums.BehaviourTaskEntityType,
      entity_id: iv.id,
      task_type: 'follow_up' as $Enums.BehaviourTaskType,
      title: { startsWith: 'Completion reminder:' },
      status: { notIn: ['cancelled'] as $Enums.BehaviourTaskStatus[] },
    },
  });

  if (existingTask) continue;

  await tx.behaviourTask.create({
    data: {
      tenant_id: tenantId,
      task_type: 'follow_up' as $Enums.BehaviourTaskType,
      entity_type: 'intervention' as $Enums.BehaviourTaskEntityType,
      entity_id: iv.id,
      title: `Completion reminder: intervention ${iv.intervention_number} ends in 7 days`,
      assigned_to_id: iv.assigned_to_id,
      created_by_id: iv.assigned_to_id, // system-generated
      priority: 'high' as $Enums.TaskPriority,
      status: 'pending' as $Enums.BehaviourTaskStatus,
      due_date: iv.target_end_date!,
    },
  });
}
```

**Design notes**:
- Uses `follow_up` task type since there is no dedicated `completion_reminder` task type in the enum, and adding one would require a schema migration. The title prefix `Completion reminder:` disambiguates.
- Alternatively, if the team prefers a dedicated task type, add `completion_reminder` to the `BehaviourTaskType` enum in both `packages/prisma/schema.prisma` and `packages/shared/src/behaviour/enums.ts`.
- The 7-day window is checked as a 24-hour range (`gte sevenDaysFromNow, lt eightDaysFromNow`) so the cron runs once per day and catches interventions entering the 7-day window.
- Idempotency: checks for existing task with the same title prefix and entity.

### Acceptance Criteria

- When the detect-patterns cron runs, any active/monitoring intervention with `target_end_date` exactly 7 days away gets a `follow_up` task created
- The task is assigned to the intervention's `assigned_to_id`
- Priority is `high`
- Due date matches the `target_end_date`
- No duplicate tasks are created on subsequent cron runs
- Interventions without `target_end_date` are ignored (the `target_end_date` column is nullable)

**Effort**: 20 minutes

---

## SP3-5: Document Template Seed Data

**Spec reference**: "Seed data per tenant: 12 categories + 4 awards + ~60 templates + 3 rules" (Section 7 Counts). The 11 document types are defined in `DocumentType` enum.

**Current state**: The seed file `packages/prisma/seed/behaviour-seed.ts` already contains `DOCUMENT_TEMPLATE_SEEDS` with templates for 10 of the 11 document types (en + ar for each):
1. `detention_notice` -- en + ar (exists)
2. `suspension_letter` -- en + ar (exists)
3. `return_meeting_letter` -- en + ar (exists)
4. `behaviour_contract` -- en + ar (exists)
5. `intervention_summary` -- en + ar (exists)
6. `appeal_hearing_invite` -- en + ar (exists)
7. `appeal_decision_letter` -- en + ar (exists)
8. `exclusion_notice` -- en + ar (exists)
9. `exclusion_decision_letter` -- en + ar (exists)
10. `board_pack` -- en + ar (exists)
11. `custom_document` -- **MISSING** (no seed template)

Total existing: 20 templates (10 types x 2 locales). The `custom_document` type is intentionally generic -- schools create their own. However, the spec says all 11 types should have system templates.

### Changes Required

#### File: `packages/prisma/seed/behaviour-seed.ts`

Add `custom_document` en + ar templates to the `DOCUMENT_TEMPLATE_SEEDS` array (before the closing `]`):

```
// ─── Custom Document ──────────────────────────────────────────────────────
{
  document_type: 'custom_document',
  name: 'Custom Document (English)',
  locale: 'en',
  template_body: `<html lang="en"><head><style>body{font-family:sans-serif;font-size:14px;line-height:1.6;margin:0;padding:40px;}</style></head><body>${LETTERHEAD_EN}<p>Date: {{today_date}}</p><p>Dear {{parent_name}},</p><p>Re: <strong>{{student_name}}</strong> ({{student_year_group}})</p><p>[Enter document content here]</p><p>Yours sincerely,<br/>{{principal_name}}<br/>{{school_name}}</p></body></html>`,
  merge_fields: [...COMMON_MERGE],
},
{
  document_type: 'custom_document',
  name: 'Custom Document (Arabic)',
  locale: 'ar',
  template_body: `<html lang="ar" dir="rtl"><head><style>body{font-family:'Noto Sans Arabic',sans-serif;font-size:14px;line-height:1.8;margin:0;padding:40px;direction:rtl;}</style></head><body>${LETTERHEAD_AR}<p>التاريخ: {{today_date}}</p><p>عزيزي/عزيزتي {{parent_name}}،</p><p>بخصوص: <strong>{{student_name}}</strong> ({{student_year_group}})</p><p>[أدخل محتوى المستند هنا]</p><p>مع التحية،<br/>{{principal_name}}<br/>{{school_name}}</p></body></html>`,
  merge_fields: [...COMMON_MERGE],
},
```

This brings the total to 22 templates (11 types x 2 locales).

**Note on existing tenants**: The `seedDocumentTemplates` function (line 436-449) checks `existingCount > 0` and skips if templates already exist. For existing tenants that already have 20 templates, the missing `custom_document` templates will NOT be auto-seeded. A data migration or one-off script is needed:

#### File: New migration script (if needed for existing tenants)

Create a data migration that inserts the two `custom_document` templates for any tenant that has behaviour document templates but is missing the `custom_document` type. This would be a SQL migration or a seed-fixup script.

### Acceptance Criteria

- New tenants provisioned after this change receive 22 document templates (11 types x 2 locales)
- The `custom_document` template has a generic structure with letterhead, common merge fields, and a placeholder body
- Both en and ar locales are provided
- `is_system: true` for seed templates
- `is_active: true` for seed templates
- Existing tenants are not affected by the seed change (addressed separately if needed)

**Effort**: 15 minutes

---

## SP3-6: Withdrawal Compensating Actions

**Spec reference**: "Compensating withdrawal cascades: auto-created sanctions -> cancelled, tasks -> cancelled, escalated incidents -> withdrawn, unsent notifications -> cancelled, sent notifications -> correction notification dispatched, points auto-corrected, awards created within undo window -> cancelled" (Section 3.1.2, gap 17)

**Current state**: `behaviour.service.ts` `withdrawIncident()` (line 721-731) simply delegates to `transitionStatus()` with `status: 'withdrawn'`. The status transition is recorded in history, but NO compensating actions are performed:
- Pending tasks linked to the incident remain open
- Pending parent notifications are not cancelled
- Points are not invalidated in any cache
- Sanctions linked to the incident are not cancelled

### Changes Required

#### File: `apps/api/src/modules/behaviour/behaviour.service.ts`

Replace the thin `withdrawIncident()` method with a full compensating action flow:

```typescript
async withdrawIncident(
  tenantId: string,
  id: string,
  userId: string,
  dto: WithdrawIncidentDto,
) {
  const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

  return rlsClient.$transaction(async (tx) => {
    const db = tx as unknown as PrismaService;

    const incident = await db.behaviourIncident.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!incident) {
      throw new NotFoundException({
        code: 'INCIDENT_NOT_FOUND',
        message: 'Incident not found',
      });
    }

    if (!isValidTransition(incident.status as IncidentStatus, 'withdrawn')) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `Cannot withdraw from status "${incident.status}"`,
      });
    }

    // 1. Transition the incident status
    await db.behaviourIncident.update({
      where: { id },
      data: {
        status: 'withdrawn',
        parent_notification_status: incident.parent_notification_status === 'pending'
          ? 'not_required'
          : incident.parent_notification_status,
      },
    });

    // 2. Cancel all pending/in_progress tasks linked to this incident
    await db.behaviourTask.updateMany({
      where: {
        tenant_id: tenantId,
        entity_type: 'incident',
        entity_id: id,
        status: { in: ['pending', 'in_progress', 'overdue'] },
      },
      data: { status: 'cancelled' },
    });

    // 3. Cancel pending sanctions linked to this incident
    const linkedSanctions = await db.behaviourSanction.findMany({
      where: {
        tenant_id: tenantId,
        incident_id: id,
        status: { in: ['pending', 'scheduled'] },
      },
      select: { id: true },
    });
    if (linkedSanctions.length > 0) {
      await db.behaviourSanction.updateMany({
        where: {
          id: { in: linkedSanctions.map(s => s.id) },
        },
        data: { status: 'cancelled' },
      });
      // Cancel tasks linked to cancelled sanctions
      for (const sanction of linkedSanctions) {
        await db.behaviourTask.updateMany({
          where: {
            tenant_id: tenantId,
            entity_type: 'sanction',
            entity_id: sanction.id,
            status: { in: ['pending', 'in_progress', 'overdue'] },
          },
          data: { status: 'cancelled' },
        });
      }
    }

    // 4. Record history
    await this.historyService.recordHistory(
      db,
      tenantId,
      'incident',
      id,
      userId,
      'withdrawn',
      { status: incident.status },
      { status: 'withdrawn' },
      dto.reason,
    );

    // 5. Queue points cache invalidation (outside transaction)
    // The points system is compute-on-read (SUM of non-withdrawn incidents)
    // so withdrawing the incident automatically excludes its points.
    // No explicit cache invalidation needed unless Redis cache is in use.

    return db.behaviourIncident.findFirst({
      where: { id },
      include: { category: true, participants: true },
    });
  }, { timeout: 30000 });
}
```

**Key design decisions**:
- Points are computed as `SUM of points_awarded WHERE incident.status != 'withdrawn'` (per spec). Withdrawing the incident automatically excludes it from point calculations. If a Redis points cache exists with a 5-minute TTL, it will self-correct.
- Sanctions in terminal statuses (`served`, `completed`, etc.) are NOT cancelled -- only `pending` and `scheduled` sanctions.
- The `parent_notification_status` is set to `not_required` if it was `pending` (preventing the notification worker from sending).
- If notifications were already `sent`, the spec says a correction notification should be dispatched. This can be implemented as a follow-up enhancement by queuing a `behaviour:withdrawal-correction-notification` job.

### Acceptance Criteria

- When an incident is withdrawn, all linked `pending`/`in_progress`/`overdue` tasks are cancelled
- When an incident is withdrawn, all linked `pending`/`scheduled` sanctions are cancelled
- Tasks linked to cancelled sanctions are also cancelled
- If `parent_notification_status` was `pending`, it is set to `not_required`
- History records the withdrawal with reason
- Points calculations automatically exclude the withdrawn incident (verify by querying)
- The withdrawal still uses `isValidTransition()` for state machine validation

**Effort**: 35 minutes

---

## SP3-7: BehaviourChangeType Enum

**Spec reference**: Table defines `change_type` as `ENUM('created', 'status_changed', 'updated', 'participant_added', 'participant_removed', 'sanction_created', 'follow_up_recorded', 'escalated', 'withdrawn', 'attachment_added', 'policy_action_applied', 'appeal_outcome', 'parent_description_set')` -- 13 defined values.

**Current state**: `BehaviourEntityHistory.change_type` is `String @db.VarChar(50)` (line 5302 of schema.prisma). The `BehaviourHistoryService.recordHistory()` accepts `changeType: string` and writes it directly. No compile-time validation, no database-level enforcement.

### Changes Required

#### Step 1: Add Prisma enum

**File: `packages/prisma/schema.prisma`**

Add the enum definition (near the other behaviour enums, around line 4885):

```prisma
enum BehaviourChangeType {
  created
  status_changed
  updated
  participant_added
  participant_removed
  sanction_created
  follow_up_recorded
  escalated
  withdrawn
  attachment_added
  policy_action_applied
  appeal_outcome
  parent_description_set
}
```

#### Step 2: Update the model

**File: `packages/prisma/schema.prisma`**

Change line 5302 from:
```prisma
  change_type     String              @db.VarChar(50)
```
to:
```prisma
  change_type     BehaviourChangeType
```

#### Step 3: Create migration

```bash
npx prisma migrate dev --name replace-change-type-varchar-with-enum
```

The migration SQL will:
1. Create the `BehaviourChangeType` enum type
2. ALTER the `behaviour_entity_history.change_type` column from VARCHAR(50) to the new enum
3. This requires all existing values in the column to match a valid enum value. Verify with:
   ```sql
   SELECT DISTINCT change_type FROM behaviour_entity_history;
   ```

**Risk**: If any existing row has a `change_type` value not in the 13 defined values, the migration will fail. Before running, audit existing data. If there are non-conforming values, the migration must include a `UPDATE` to map them before the ALTER.

#### Step 4: Update TypeScript types

**File: `packages/shared/src/behaviour/enums.ts`**

Add:
```typescript
export const BEHAVIOUR_CHANGE_TYPE = [
  'created', 'status_changed', 'updated', 'participant_added',
  'participant_removed', 'sanction_created', 'follow_up_recorded',
  'escalated', 'withdrawn', 'attachment_added',
  'policy_action_applied', 'appeal_outcome', 'parent_description_set',
] as const;
export type BehaviourChangeType = (typeof BEHAVIOUR_CHANGE_TYPE)[number];
```

#### Step 5: Update service signature

**File: `apps/api/src/modules/behaviour/behaviour-history.service.ts`**

Change `changeType: string` to `changeType: BehaviourChangeType` (import from `@school/shared`). Update the `create` call to use `changeType` directly (Prisma will now type-check it).

Alternatively, keep the `as $Enums.BehaviourChangeType` cast pattern used elsewhere in the codebase to avoid changing all 20+ callers. The Prisma enum type will enforce correctness at the DB level regardless.

#### Step 6: Update callers (optional but recommended)

Every call to `recordHistory()` passes a string literal like `'created'`, `'status_changed'`, etc. These will continue to work if the service parameter stays `string`, but changing the parameter to the enum type provides compile-time safety. There are approximately 15-20 call sites across:
- `behaviour.service.ts`
- `behaviour-interventions.service.ts`
- `behaviour-tasks.service.ts`
- `behaviour-sanctions.service.ts`
- `behaviour-appeals.service.ts`
- `behaviour-admin.service.ts`

### Acceptance Criteria

- `change_type` column is a PostgreSQL enum, not VARCHAR(50)
- Migration runs cleanly against existing data (all existing values are valid enum members)
- TypeScript types in `packages/shared` match the 13 defined values
- `recordHistory()` accepts only valid change type values (compile-time if parameter is typed, runtime if kept as string)
- No existing tests break

**Effort**: 30 minutes

---

## SP3-8: DB-Level Student Participant Constraint

**Spec reference**: "Constraint: every incident must have at least one student participant" (Gap 18 in spec table)

**Current state**: The constraint is enforced at the application layer in two places:
1. `createIncident()` validates `students.length > 0` (line 117-122 of `behaviour.service.ts`)
2. `removeParticipant()` checks `studentCount <= 1` before allowing removal (lines 886-901)

However, there is no database-level constraint. Direct SQL or other code paths could create an incident with zero student participants.

### Changes Required

**Option A: CHECK constraint via trigger** (recommended)

PostgreSQL CHECK constraints cannot reference other tables. Since participants are in a separate table from incidents, a trigger function is needed.

#### File: New migration

```bash
npx prisma migrate dev --name add-student-participant-trigger
```

The migration SQL:

```sql
-- Function: prevent deletion of last student participant
CREATE OR REPLACE FUNCTION check_student_participant_minimum()
RETURNS TRIGGER AS $$
DECLARE
  remaining_count INT;
BEGIN
  -- Only fire for student participant deletions
  IF OLD.participant_type = 'student' THEN
    SELECT COUNT(*) INTO remaining_count
    FROM behaviour_incident_participants
    WHERE incident_id = OLD.incident_id
      AND participant_type = 'student'
      AND id != OLD.id;

    IF remaining_count = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last student participant from incident %', OLD.incident_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_student_participant_minimum
  BEFORE DELETE ON behaviour_incident_participants
  FOR EACH ROW
  EXECUTE FUNCTION check_student_participant_minimum();
```

**Option B: Deferred constraint check** (alternative)

A less intrusive approach is to add an `AFTER INSERT` trigger on `behaviour_incidents` that checks for at least one student participant. However, this doesn't work well with the current flow where the incident is created first and participants added in a loop within the same transaction.

**Recommendation**: Option A (trigger on DELETE) is the safest. The INSERT-time validation is already handled by the service layer (the service creates participants in the same transaction as the incident).

### Acceptance Criteria

- Deleting the last student participant from an incident raises a PostgreSQL error
- The trigger only fires for `participant_type = 'student'` deletions
- Non-student participant deletions are unaffected
- The application-layer check in `removeParticipant()` remains as a fast-fail guard
- The trigger fires within the same transaction, so the DELETE is rolled back

**Effort**: 15 minutes

---

## SP3-9: Task State Transition Validation

**Spec reference**: Task statuses follow a lifecycle: `pending -> in_progress -> completed/cancelled`. The `overdue` status is set by the worker, not by user action. There should be no arbitrary status changes.

**Current state**: `behaviour-tasks.service.ts` `updateTask()` (lines 131-164) accepts `dto.status` changes without any validation. The method allows setting any status directly via the DTO, bypassing lifecycle rules. The `completeTask()` and `cancelTask()` methods do validate (checking for terminal states), but `updateTask()` does not.

However, examining the `UpdateTaskDto` schema -- it accepts `priority`, `due_date`, `assigned_to_id`, and `description` but NOT `status`. The current `updateTask()` implementation does NOT update status (lines 149-163 only update `assigned_to_id`, `priority`, `due_date`, `description`).

**Re-assessment**: The `updateTask()` method does NOT actually allow arbitrary status changes -- it only updates non-status fields. The "gap" may be a false positive. However, there is still no formal task state machine defined anywhere in the shared package, unlike incidents, interventions, sanctions, and appeals which all have state machines.

### Changes Required

#### Step 1: Create task state machine

**File: `packages/shared/src/behaviour/state-machine-task.ts`** (new file)

```typescript
import type { BehaviourTaskStatus } from './enums';

const VALID_TASK_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_progress', 'completed', 'cancelled', 'overdue'],
  in_progress: ['completed', 'cancelled', 'overdue'],
  overdue: ['in_progress', 'completed', 'cancelled'],
};

const TERMINAL_TASK_STATUSES: readonly string[] = ['completed', 'cancelled'];

export function isValidTaskTransition(
  from: BehaviourTaskStatus,
  to: BehaviourTaskStatus,
): boolean {
  if (TERMINAL_TASK_STATUSES.includes(from)) {
    return false;
  }
  const allowed = VALID_TASK_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function getValidTaskTransitions(
  from: BehaviourTaskStatus,
): BehaviourTaskStatus[] {
  return (VALID_TASK_TRANSITIONS[from] ?? []) as BehaviourTaskStatus[];
}

export function isTerminalTaskStatus(status: BehaviourTaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(status);
}
```

#### Step 2: Export from index

**File: `packages/shared/src/behaviour/index.ts`**

Add:
```typescript
export * from './state-machine-task';
```

#### Step 3: Use in services

**File: `apps/api/src/modules/behaviour/behaviour-tasks.service.ts`**

Add validation in `completeTask()` (lines 169-221) to use the state machine:
```typescript
import { isValidTaskTransition } from '@school/shared';

// In completeTask(), replace the manual check at line 191:
if (!isValidTaskTransition(task.status as BehaviourTaskStatus, 'completed')) {
  throw new BadRequestException({
    code: 'INVALID_TASK_TRANSITION',
    message: `Cannot complete a task with status "${task.status}"`,
  });
}
```

Similarly in `cancelTask()` (lines 226-268):
```typescript
if (!isValidTaskTransition(task.status as BehaviourTaskStatus, 'cancelled')) {
  throw new BadRequestException({
    code: 'INVALID_TASK_TRANSITION',
    message: `Cannot cancel a task with status "${task.status}"`,
  });
}
```

#### Step 4: Add tests

**File: `packages/shared/src/behaviour/state-machine-task.spec.ts`** (new file)

Follow the pattern in `state-machine.spec.ts`:
- Test all valid transitions
- Test all invalid transitions
- Test terminal statuses block outgoing transitions
- Test `getValidTaskTransitions` returns correct targets

### Acceptance Criteria

- Task state machine is defined in `packages/shared` alongside the other state machines
- Valid transitions: pending -> {in_progress, completed, cancelled, overdue}; in_progress -> {completed, cancelled, overdue}; overdue -> {in_progress, completed, cancelled}
- Terminal statuses (completed, cancelled) block all outgoing transitions
- `completeTask()` and `cancelTask()` use the state machine for validation
- `updateTask()` continues to NOT allow status changes (confirmed as already correct)
- Tests cover all transition combinations

**Effort**: 25 minutes

---

## Implementation Order (Recommended)

Tasks are independent. Recommended order groups related changes to minimize context-switching:

| Order | Task | Effort | Risk |
|-------|------|--------|------|
| 1 | SP3-9: Task state machine | 25 min | Low (new file, additive) |
| 2 | SP3-7: BehaviourChangeType enum | 30 min | Medium (migration, must audit existing data) |
| 3 | SP3-1: Escalation timer | 30 min | Medium (BullMQ delayed job pattern) |
| 4 | SP3-6: Withdrawal compensating actions | 35 min | Medium (multi-table update in transaction) |
| 5 | SP3-3: Overdue priority escalation | 15 min | Low (small addition to existing processor) |
| 6 | SP3-4: 7-day completion reminder | 20 min | Low (addition to existing processor) |
| 7 | SP3-5: Document template seeds | 15 min | Low (additive seed data) |
| 8 | SP3-8: Student participant trigger | 15 min | Low (DB trigger, non-breaking) |
| 9 | SP3-2: Inter-escalation cooldown | 25 min | Low (guard check in processor) |

**Total estimated effort**: 3 hours 30 minutes

---

## Architecture Updates Required

After implementation, the following architecture files must be updated:

1. **`architecture/event-job-catalog.md`**: Document the delayed re-enqueue pattern for `safeguarding:critical-escalation` (SP3-1)
2. **`architecture/state-machines.md`**: Add the task state machine (SP3-9)
3. **`architecture/danger-zones.md`**: Document the BullMQ delayed job must be enqueued *outside* the Prisma transaction (SP3-1)

---

## Regression Test Scope

After all changes, run:
```bash
turbo test
turbo lint
turbo type-check
```

Specifically verify:
- `packages/shared/src/behaviour/state-machine.spec.ts` (existing -- should pass)
- `packages/shared/src/behaviour/state-machine-task.spec.ts` (new)
- `apps/api/src/modules/behaviour/safeguarding.service.spec.ts` (existing -- verify escalation delay test)
- `apps/api/src/modules/behaviour/behaviour.service.spec.ts` (if exists -- verify withdrawal)
- `apps/api/src/modules/behaviour/behaviour-tasks.service.spec.ts` (if exists -- verify transition validation)
