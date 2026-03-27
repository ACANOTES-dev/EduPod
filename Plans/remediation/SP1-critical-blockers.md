# SP1: Critical Blockers — Implementation Spec

> **Sub-plan**: 1 of N (Remediation)
> **Priority**: P0 — Must be completed before all other sub-plans
> **Estimated effort**: 3-4 hours
> **Dependencies**: None (this is the foundation)
> **Last updated**: 2026-03-27

---

## Overview

A 20-agent audit of the Behaviour Management module found 6 critical blockers that prevent the module from functioning correctly in production. These are not feature gaps — they are runtime failures waiting to happen. This sub-plan addresses all 6 in a single pass because they are independent and collectively foundational.

---

## Task 1: Register 11 Behaviour Cron Jobs in CronSchedulerService

### Problem

All 15 behaviour processor files exist and are registered as providers in `worker.module.ts`. However, **zero** behaviour cron jobs are registered in `CronSchedulerService`. The service currently only registers 2 gradebook cron jobs. Per the event-job-catalog, 11 behaviour jobs require cron scheduling:

| # | Job Name | Queue | Schedule | Tenant-Scoped? |
|---|----------|-------|----------|----------------|
| 1 | `behaviour:task-reminders` | behaviour | Daily 08:00 tenant TZ | Yes — per tenant |
| 2 | `behaviour:suspension-return` | behaviour | Daily 07:00 tenant TZ | Yes — per tenant |
| 3 | `behaviour:detect-patterns` | behaviour | Daily 05:00 UTC | Yes — per tenant |
| 4 | `behaviour:digest-notifications` | notifications | Tenant-configured time (default 16:00 tenant TZ) | Yes — per tenant |
| 5 | `behaviour:guardian-restriction-check` | behaviour | Daily 06:00 UTC | Yes — per tenant |
| 6 | `behaviour:refresh-mv-student-summary` | behaviour | Every 15 min (`*/15 * * * *`) | No — cross-tenant |
| 7 | `behaviour:refresh-mv-benchmarks` | behaviour | Daily 03:00 UTC (`0 3 * * *`) | No — cross-tenant |
| 8 | `behaviour:refresh-mv-exposure-rates` | behaviour | Daily 02:00 UTC (`0 2 * * *`) | No — cross-tenant |
| 9 | `behaviour:retention-check` | behaviour | Monthly 1st at 01:00 UTC (`0 1 1 * *`) | Yes — per tenant |
| 10 | `behaviour:partition-maintenance` | behaviour | Monthly 1st at 00:00 UTC (`0 0 1 * *`) | No — cross-tenant |
| 11 | `safeguarding:sla-check` | behaviour | Every 5 min (`*/5 * * * *`) | Yes — per tenant |

**Note**: The remaining 4 behaviour processors (`behaviour:parent-notification`, `behaviour:evaluate-policy`, `behaviour:check-awards`, `behaviour:attachment-scan`, `safeguarding:critical-escalation`) are event-triggered (enqueued by API services), NOT cron jobs. They do NOT need registration here.

### Design Decision: Cross-Tenant vs Per-Tenant

The existing cron pattern (gradebook) uses **cross-tenant** jobs — the cron fires once, the processor iterates all active tenants internally. This avoids needing to schedule N jobs per tenant and avoids the "new tenant = new cron scheduling" problem.

**For behaviour crons**: Items 6-8 and 10 are already cross-tenant by design (they operate on materialized views or DB schema, not tenant data). Items 1-5, 9, and 11 are documented as "per tenant" but the processors all accept `{ tenant_id }` payloads. The cleanest approach is:

- **Cross-tenant wrapper crons**: Register ONE cron job per type. The processor queries all active tenants (where behaviour module is enabled) and processes each tenant inline. This matches the existing gradebook pattern.
- **Per-tenant timezone scheduling**: For jobs that must fire at tenant-local times (task-reminders at 08:00, suspension-return at 07:00, digest-notifications at tenant-configured time), the cross-tenant wrapper iterates tenants and checks if the current UTC time matches the tenant's configured fire time in their timezone.

However, the existing processors are structured to accept a single `tenant_id` and process one tenant per invocation. Converting them to cross-tenant iterators would require refactoring each processor. The simpler approach that matches the existing architecture:

**Recommended approach**: Create a cross-tenant "dispatcher" that runs on a fixed cron (e.g., every 5 minutes for SLA, hourly for timezone-sensitive jobs). The dispatcher queries active tenants with the behaviour module enabled, checks timezone/schedule eligibility, and enqueues individual per-tenant jobs. This is safer because each tenant's job runs in its own transaction with proper RLS.

### Files to Change

#### 1. `apps/worker/src/cron/cron-scheduler.service.ts`

**Current state**: Only injects `gradebookQueue` and registers 2 gradebook crons.

**Changes needed**:

```typescript
// ADD these imports at the top:
import { BEHAVIOUR_DETECT_PATTERNS_JOB } from '../processors/behaviour/detect-patterns.processor';
import { BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB } from '../processors/behaviour/digest-notifications.processor';
import { BEHAVIOUR_GUARDIAN_RESTRICTION_CHECK_JOB } from '../processors/behaviour/guardian-restriction-check.processor';
import { BEHAVIOUR_PARTITION_MAINTENANCE_JOB } from '../processors/behaviour/partition-maintenance.processor';
import { REFRESH_MV_BENCHMARKS_JOB, REFRESH_MV_EXPOSURE_RATES_JOB, REFRESH_MV_STUDENT_SUMMARY_JOB } from '../processors/behaviour/refresh-mv.processor';
import { BEHAVIOUR_RETENTION_CHECK_JOB } from '../processors/behaviour/retention-check.processor';
import { SLA_CHECK_JOB } from '../processors/behaviour/sla-check.processor';
import { BEHAVIOUR_SUSPENSION_RETURN_JOB } from '../processors/behaviour/suspension-return.processor';
import { BEHAVIOUR_TASK_REMINDERS_JOB } from '../processors/behaviour/task-reminders.processor';
```

**Add constructor injection**:
```typescript
constructor(
  @InjectQueue(QUEUE_NAMES.GRADEBOOK) private readonly gradebookQueue: Queue,
  @InjectQueue(QUEUE_NAMES.BEHAVIOUR) private readonly behaviourQueue: Queue,
  @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
) {}
```

**Add to `onModuleInit()`**:
```typescript
async onModuleInit(): Promise<void> {
  await this.registerGradebookCronJobs();
  await this.registerBehaviourCronJobs();
}
```

**New method `registerBehaviourCronJobs()`**:

Register the following repeatable jobs:

1. **Cross-tenant MV refreshes** (no tenant_id, just fire and refresh):
   - `behaviour:refresh-mv-student-summary` — `*/15 * * * *` (every 15 min)
   - `behaviour:refresh-mv-exposure-rates` — `0 2 * * *` (daily 02:00 UTC)
   - `behaviour:refresh-mv-benchmarks` — `0 3 * * *` (daily 03:00 UTC)

2. **Cross-tenant schema maintenance** (no tenant_id):
   - `behaviour:partition-maintenance` — `0 0 1 * *` (monthly, 1st at 00:00 UTC)

3. **Per-tenant dispatcher crons** (iterate tenants, enqueue individual jobs):
   - `behaviour:cron-dispatch-daily` — `0 * * * *` (hourly, checks tenant TZ for daily jobs: task-reminders, suspension-return, detect-patterns, guardian-restriction-check, digest-notifications)
   - `behaviour:cron-dispatch-sla` — `*/5 * * * *` (every 5 min, for SLA checks)
   - `behaviour:cron-dispatch-monthly` — `0 1 1 * *` (monthly, for retention-check)

**Alternatively** (simpler, acceptable for 2 tenants): Register all tenant-scoped jobs with UTC-approximated schedules. Since there are only 2 confirmed tenants, timezone precision can be a future enhancement:

- `behaviour:task-reminders` dispatcher — `0 7 * * *` (07:00 UTC, approximate for both tenant TZs)
- `behaviour:suspension-return` dispatcher — `0 6 * * *` (06:00 UTC)
- `behaviour:detect-patterns` dispatcher — `0 5 * * *` (05:00 UTC)
- `behaviour:guardian-restriction-check` dispatcher — `0 6 * * *` (06:00 UTC)
- `behaviour:digest-notifications` dispatcher — `0 15 * * *` (15:00 UTC, approximate)
- `safeguarding:sla-check` dispatcher — `*/5 * * * *` (every 5 min)
- `behaviour:retention-check` dispatcher — `0 1 1 * *` (monthly)

Each dispatcher queries active tenants with the behaviour module enabled, then enqueues per-tenant jobs:

```typescript
private async registerBehaviourCronJobs(): Promise<void> {
  // ── Cross-tenant MV refreshes ─────────────────────────────────────────
  await this.behaviourQueue.add(
    REFRESH_MV_STUDENT_SUMMARY_JOB,
    {},
    {
      repeat: { pattern: '*/15 * * * *' },
      jobId: `cron:${REFRESH_MV_STUDENT_SUMMARY_JOB}`,
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );
  this.logger.log(`Registered repeatable cron: ${REFRESH_MV_STUDENT_SUMMARY_JOB} (every 15 min)`);

  await this.behaviourQueue.add(
    REFRESH_MV_EXPOSURE_RATES_JOB,
    {},
    {
      repeat: { pattern: '0 2 * * *' },
      jobId: `cron:${REFRESH_MV_EXPOSURE_RATES_JOB}`,
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );
  this.logger.log(`Registered repeatable cron: ${REFRESH_MV_EXPOSURE_RATES_JOB} (daily 02:00 UTC)`);

  await this.behaviourQueue.add(
    REFRESH_MV_BENCHMARKS_JOB,
    {},
    {
      repeat: { pattern: '0 3 * * *' },
      jobId: `cron:${REFRESH_MV_BENCHMARKS_JOB}`,
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );
  this.logger.log(`Registered repeatable cron: ${REFRESH_MV_BENCHMARKS_JOB} (daily 03:00 UTC)`);

  // ── Cross-tenant schema maintenance ───────────────────────────────────
  await this.behaviourQueue.add(
    BEHAVIOUR_PARTITION_MAINTENANCE_JOB,
    {},
    {
      repeat: { pattern: '0 0 1 * *' },
      jobId: `cron:${BEHAVIOUR_PARTITION_MAINTENANCE_JOB}`,
      removeOnComplete: 5,
      removeOnFail: 20,
    },
  );
  this.logger.log(`Registered repeatable cron: ${BEHAVIOUR_PARTITION_MAINTENANCE_JOB} (monthly 1st 00:00 UTC)`);

  // ── Per-tenant dispatchers ────────────────────────────────────────────
  // These dispatch per-tenant jobs after querying active tenants.
  // Registered as a single "behaviour:cron-dispatch" job that runs hourly
  // and handles all tenant-scoped daily crons.
  await this.behaviourQueue.add(
    'behaviour:cron-dispatch-daily',
    {},
    {
      repeat: { pattern: '0 * * * *' },
      jobId: 'cron:behaviour:cron-dispatch-daily',
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );
  this.logger.log('Registered repeatable cron: behaviour:cron-dispatch-daily (hourly)');

  // SLA check dispatcher — every 5 minutes
  await this.behaviourQueue.add(
    'behaviour:cron-dispatch-sla',
    {},
    {
      repeat: { pattern: '*/5 * * * *' },
      jobId: 'cron:behaviour:cron-dispatch-sla',
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );
  this.logger.log('Registered repeatable cron: behaviour:cron-dispatch-sla (every 5 min)');

  // Monthly dispatch for retention-check
  await this.behaviourQueue.add(
    'behaviour:cron-dispatch-monthly',
    {},
    {
      repeat: { pattern: '0 1 1 * *' },
      jobId: 'cron:behaviour:cron-dispatch-monthly',
      removeOnComplete: 5,
      removeOnFail: 20,
    },
  );
  this.logger.log('Registered repeatable cron: behaviour:cron-dispatch-monthly (monthly 1st 01:00 UTC)');
}
```

#### 2. NEW: `apps/worker/src/processors/behaviour/cron-dispatch.processor.ts`

A new processor that handles the 3 dispatcher job types. For each:
- Queries `tenants` table for active tenants with the behaviour module enabled
- For daily dispatchers: reads each tenant's timezone from `tenant_settings`, computes local hour, and decides which jobs to enqueue for that tenant at this hour
- Enqueues individual per-tenant jobs to the appropriate queue

**Job name constants**:
```typescript
export const BEHAVIOUR_CRON_DISPATCH_DAILY_JOB = 'behaviour:cron-dispatch-daily';
export const BEHAVIOUR_CRON_DISPATCH_SLA_JOB = 'behaviour:cron-dispatch-sla';
export const BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB = 'behaviour:cron-dispatch-monthly';
```

**Daily dispatch logic** (runs every hour):
```typescript
// For each active tenant with behaviour module:
//   Get tenant timezone from tenant_settings
//   Compute current hour in tenant TZ
//   At 07:00 TZ -> enqueue behaviour:suspension-return
//   At 08:00 TZ -> enqueue behaviour:task-reminders
//   At 05:00 UTC equivalent -> enqueue behaviour:detect-patterns
//   At 06:00 UTC equivalent -> enqueue behaviour:guardian-restriction-check
//   At digest_time TZ (from settings, default 16:00) -> enqueue behaviour:digest-notifications
```

**SLA dispatch logic** (runs every 5 min):
```typescript
// For each active tenant with behaviour module:
//   Enqueue safeguarding:sla-check with { tenant_id }
//   Also enqueue behaviour:break-glass-expiry with { tenant_id }
```

**Monthly dispatch logic** (runs on 1st at 01:00):
```typescript
// For each active tenant with behaviour module:
//   Enqueue behaviour:retention-check with { tenant_id }
```

#### 3. `apps/worker/src/worker.module.ts`

**Add import**:
```typescript
import { BehaviourCronDispatchProcessor } from './processors/behaviour/cron-dispatch.processor';
```

**Add to providers array** (in the behaviour processors section):
```typescript
BehaviourCronDispatchProcessor,
```

### Acceptance Criteria

- [ ] Worker starts without errors
- [ ] `CronSchedulerService.onModuleInit()` logs registration of all 7 cron entries (4 cross-tenant + 3 dispatchers)
- [ ] Within 15 minutes of startup, `behaviour:refresh-mv-student-summary` fires
- [ ] Daily dispatcher correctly identifies tenant timezone and enqueues appropriate jobs
- [ ] SLA dispatcher enqueues `safeguarding:sla-check` every 5 minutes for each active tenant
- [ ] Monthly dispatcher enqueues `behaviour:retention-check` on 1st of month
- [ ] All per-tenant jobs include `tenant_id` in payload
- [ ] Existing gradebook crons continue to work unchanged
- [ ] No duplicate job registrations (BullMQ deduplicates by jobId)

---

## Task 2: Fix `parent.view_behaviour` Permission

### Problem

The `parent.view_behaviour` permission IS already defined in `packages/prisma/seed/permissions.ts` (line 145). The audit flagged this as missing, but it exists:

```typescript
{ permission_key: 'parent.view_behaviour', description: 'View behaviour data for linked students', permission_tier: 'parent' },
```

**Verification**: The parent controller at `apps/api/src/modules/behaviour/behaviour-parent.controller.ts` uses `@RequiresPermission('parent.view_behaviour')` on all 6 endpoints, which matches this permission exactly.

### Status: **Already Fixed / False Positive**

No code changes needed. However, the seed must have been run after this permission was added. If the production database was seeded before this permission was added, the permission row won't exist in the `permissions` table.

### Action Required

- [ ] Verify in production that `SELECT * FROM permissions WHERE permission_key = 'parent.view_behaviour'` returns a row
- [ ] If missing, run the permission seed: `npx prisma db seed`
- [ ] Verify that the "Parent" role template includes this permission in its default assignments

---

## Task 3: Add Parent Appeal Submission Endpoint

### Problem

The spec requires parents to submit appeals. The `behaviour.appeal` permission exists in the seed (line 155, tier `parent`), but:

1. The `BehaviourAppealsController` requires `behaviour.manage` (staff-only) on ALL endpoints including `POST /behaviour/appeals` (submit)
2. There is no parent-facing appeal submission endpoint
3. The `behaviour.appeal` permission is defined but never referenced by any `@RequiresPermission` decorator

### Design

Add a parent-facing appeal submission endpoint to `BehaviourParentController` (which already handles all parent endpoints at `v1/parent/behaviour/*`). The parent calls this endpoint with `@RequiresPermission('behaviour.appeal')`.

The parent appeal schema should be a subset of the staff `submitAppealSchema` — the parent provides grounds and grounds_category, but the `appellant_type` is always `'parent'` and `appellant_parent_id` is resolved from the authenticated user.

### Files to Change

#### 1. NEW Zod schema: `packages/shared/src/behaviour/schemas/appeal.schema.ts`

Add a parent-specific appeal submission schema after the existing schemas:

```typescript
export const parentSubmitAppealSchema = z.object({
  entity_type: z.enum(APPEAL_ENTITY_TYPE_VALUES),
  incident_id: z.string().uuid(),
  sanction_id: z.string().uuid().optional(),
  student_id: z.string().uuid(),
  grounds: z.string().min(20).max(5000),
  grounds_category: z.enum(GROUNDS_CATEGORY_VALUES),
});

export type ParentSubmitAppealDto = z.infer<typeof parentSubmitAppealSchema>;
```

No changes needed to `packages/shared/src/behaviour/schemas/index.ts` — the barrel export at `export * from './appeal.schema'` already re-exports everything from this file.

#### 2. `apps/api/src/modules/behaviour/behaviour-parent.controller.ts`

Add the appeal submission endpoint:

```typescript
// ADD to imports:
import { Body } from '@nestjs/common';
import { parentSubmitAppealSchema } from '@school/shared';

// ADD new endpoint after the existing acknowledge endpoint:

@Post('appeal')
@RequiresPermission('behaviour.appeal')
@HttpCode(HttpStatus.CREATED)
async submitAppeal(
  @CurrentTenant() tenant: TenantContext,
  @CurrentUser() user: JwtPayload,
  @Body(new ZodValidationPipe(parentSubmitAppealSchema))
  dto: z.infer<typeof parentSubmitAppealSchema>,
) {
  return this.parentService.submitAppeal(tenant.tenant_id, user.sub, dto);
}
```

Note: `Body` is already imported (check — actually it's NOT imported yet in the parent controller). Add it to the `@nestjs/common` import destructure.

#### 3. `apps/api/src/modules/behaviour/behaviour-parent.service.ts`

Add the `submitAppeal` method:

```typescript
// ADD to imports:
import type { ParentSubmitAppealDto } from '@school/shared';

// In the BehaviourParentService class, inject BehaviourAppealsService:
constructor(
  private readonly prisma: PrismaService,
  private readonly appealsService: BehaviourAppealsService,
) {}

// ADD method:
async submitAppeal(tenantId: string, userId: string, dto: ParentSubmitAppealDto) {
  const parent = await this.resolveParent(tenantId, userId);

  // Verify parent-student link
  const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
  await rlsClient.$transaction(async (tx) => {
    const db = tx as unknown as PrismaService;
    await this.verifyParentStudentLink(db, tenantId, parent.id, dto.student_id);
  });

  // Delegate to the appeals service with parent context
  const staffDto: SubmitAppealDto = {
    ...dto,
    appellant_type: 'parent',
    appellant_parent_id: parent.id,
  };

  return this.appealsService.submit(tenantId, userId, staffDto);
}
```

This requires importing `BehaviourAppealsService` and wiring the dependency in `behaviour.module.ts`.

#### 4. `apps/api/src/modules/behaviour/behaviour.module.ts`

Ensure `BehaviourAppealsService` is available to `BehaviourParentService`. Check if it's already in the same module (it should be — both are part of `BehaviourModule`). If `BehaviourParentService` doesn't already have `BehaviourAppealsService` injected, add it to the constructor.

### Acceptance Criteria

- [ ] `POST /api/v1/parent/behaviour/appeal` endpoint exists
- [ ] Endpoint requires `behaviour.appeal` permission (parent tier)
- [ ] Parent must have active parent profile and be linked to the student
- [ ] Appeal is created with `appellant_type = 'parent'` and `appellant_parent_id` set
- [ ] Parent cannot submit appeal for unlinked student (403)
- [ ] Staff `behaviour.manage` endpoint continues to work unchanged
- [ ] Guardian restrictions do NOT block appeal submission (appeal is a right)
- [ ] Input validated via `parentSubmitAppealSchema`

---

## Task 4: Wire `behaviour.appeal` Permission to Parent Appeal Endpoint

### Problem

`behaviour.appeal` is defined in the seed but never used in any `@RequiresPermission()` decorator.

### Resolution

This is resolved by Task 3 above. The new parent appeal endpoint uses `@RequiresPermission('behaviour.appeal')`. After Task 3 is complete, this permission is no longer dead code.

### Status: **Resolved by Task 3**

---

## Task 5: Add `behaviour.amend` Permission

### Problem

The spec calls for a granular `behaviour.amend` permission for incident corrections/amendments. Currently, all amendment endpoints use `behaviour.manage`, which is the same permission used for sanctions, interventions, tasks, appeals, etc. This means you cannot grant amendment access without also granting full management access.

### Analysis

Looking at the existing amendment controller (`behaviour-amendments.controller.ts`), it has 4 endpoints all guarded by `behaviour.manage`:

1. `GET /behaviour/amendments` — list
2. `GET /behaviour/amendments/pending` — pending list
3. `GET /behaviour/amendments/:id` — get by ID
4. `POST /behaviour/amendments/:id/send-correction` — send correction notice

The amendment creation itself happens internally (via the incident edit flow in `BehaviourService` or via appeal decision cascades in `BehaviourAppealsService`), not through a dedicated "create amendment" endpoint. Amendments are audit records created when parent-visible fields are modified on incidents or sanctions.

### Design Decision

Adding `behaviour.amend` as a separate permission makes sense for the _correction sending_ flow — the ability to trigger a correction notice to parents is a sensitive action that should be separately permissioned. However, viewing amendment history can stay under `behaviour.manage` (anyone who can manage behaviour should be able to see the amendment trail).

### Files to Change

#### 1. `packages/prisma/seed/permissions.ts`

Add after the existing behaviour permissions:

```typescript
{ permission_key: 'behaviour.amend', description: 'Send correction notices for incident amendments', permission_tier: 'staff' },
```

Place it after `behaviour.appeal` (line 155), keeping the behaviour section grouped.

#### 2. `apps/api/src/modules/behaviour/behaviour-amendments.controller.ts`

Change the `sendCorrection` endpoint permission from `behaviour.manage` to `behaviour.amend`:

```typescript
@Post('behaviour/amendments/:id/send-correction')
@RequiresPermission('behaviour.amend')  // Changed from 'behaviour.manage'
@HttpCode(HttpStatus.OK)
async sendCorrection(...)
```

The read endpoints (`list`, `getPending`, `getById`) remain under `behaviour.manage` — viewing amendment history is part of general behaviour management.

### Acceptance Criteria

- [ ] `behaviour.amend` permission exists in the seed
- [ ] `POST /behaviour/amendments/:id/send-correction` requires `behaviour.amend`
- [ ] Read endpoints still require `behaviour.manage`
- [ ] Permission seed runs without errors
- [ ] Users with `behaviour.manage` but NOT `behaviour.amend` can view amendments but cannot send corrections
- [ ] Users with `behaviour.amend` can send corrections

---

## Task 6: Fix Endpoint Count in Blast Radius Documentation

### Problem

`architecture/module-blast-radius.md` documents the BehaviourModule with partial endpoint counts:
```
**Controllers**: `BehaviourController`, `BehaviourAnalyticsController` (16 endpoints), `BehaviourAlertsController` (8 endpoints), `BehaviourDocumentsController` (6 endpoints), `BehaviourParentController` (6 endpoints)
```

This lists only 5 controllers with approximate counts (36 total). The actual count per `grep` is **209 endpoint decorators** across **17 controllers**:

| Controller | File | Endpoint Count |
|-----------|------|---------------|
| `BehaviourAdminController` | `behaviour-admin.controller.ts` | 21 |
| `BehaviourController` | `behaviour.controller.ts` | 21 |
| `BehaviourConfigController` | `behaviour-config.controller.ts` | 21 |
| `BehaviourAnalyticsController` | `behaviour-analytics.controller.ts` | 16 |
| `BehaviourSanctionsController` | `behaviour-sanctions.controller.ts` | 14 |
| `BehaviourStudentsController` | `behaviour-students.controller.ts` | 13 |
| `BehaviourRecognitionController` | `behaviour-recognition.controller.ts` | 12 |
| `BehaviourInterventionsController` | `behaviour-interventions.controller.ts` | 12 |
| `SafeguardingController` | `safeguarding.controller.ts` | 21 |
| `BehaviourAppealsController` | `behaviour-appeals.controller.ts` | 10 |
| `BehaviourExclusionsController` | `behaviour-exclusions.controller.ts` | 10 |
| `BehaviourAlertsController` | `behaviour-alerts.controller.ts` | 8 |
| `BehaviourTasksController` | `behaviour-tasks.controller.ts` | 8 |
| `BehaviourGuardianRestrictionsController` | `behaviour-guardian-restrictions.controller.ts` | 6 |
| `BehaviourDocumentsController` | `behaviour-documents.controller.ts` | 6 |
| `BehaviourParentController` | `behaviour-parent.controller.ts` | 6 (+1 after Task 3) |
| `BehaviourAmendmentsController` | `behaviour-amendments.controller.ts` | 4 |
| **Total** | | **209 (+1 = 210)** |

### Files to Change

#### 1. `architecture/module-blast-radius.md`

Replace the `Controllers` line in the BehaviourModule section with:

```markdown
- **Controllers**: 17 controllers, ~210 endpoints total:
  - `BehaviourController` (21) — core incident CRUD, quick-log
  - `BehaviourConfigController` (21) — categories, templates, settings
  - `BehaviourAdminController` (21) — admin ops, legal holds, data export
  - `SafeguardingController` (21) — concerns, actions, break-glass
  - `BehaviourAnalyticsController` (16) — analytics, pulse, AI queries
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
```

Also update the header counts in `event-job-catalog.md` if it references total endpoint counts.

### Acceptance Criteria

- [ ] Blast radius document lists all 17 controllers with correct endpoint counts
- [ ] Total count matches actual `@Get/@Post/@Patch/@Put/@Delete` decorator count
- [ ] Document reflects the new parent appeal endpoint from Task 3

---

## Execution Order

All 6 tasks are independent and can be executed in any order. However, the recommended order is:

1. **Task 5** (add `behaviour.amend` permission) — seed-only change, no risk
2. **Task 3** (parent appeal endpoint) — resolves Tasks 3 and 4 together
3. **Task 1** (cron registration) — largest change, new processor file
4. **Task 6** (blast radius docs) — documentation, do after Task 3 so count includes new endpoint
5. **Task 2** (verify `parent.view_behaviour`) — verification only, may require seed run

---

## Files Summary

| File | Action | Tasks |
|------|--------|-------|
| `apps/worker/src/cron/cron-scheduler.service.ts` | EDIT — add behaviour queue injection + cron registrations | 1 |
| `apps/worker/src/processors/behaviour/cron-dispatch.processor.ts` | NEW — cross-tenant dispatcher processor | 1 |
| `apps/worker/src/worker.module.ts` | EDIT — add dispatcher processor to providers | 1 |
| `packages/prisma/seed/permissions.ts` | EDIT — add `behaviour.amend` permission | 5 |
| `packages/shared/src/behaviour/schemas/appeal.schema.ts` | EDIT — add `parentSubmitAppealSchema` | 3 |
| `apps/api/src/modules/behaviour/behaviour-parent.controller.ts` | EDIT — add appeal endpoint, add Body import | 3 |
| `apps/api/src/modules/behaviour/behaviour-parent.service.ts` | EDIT — add `submitAppeal` method, inject BehaviourAppealsService | 3 |
| `apps/api/src/modules/behaviour/behaviour.module.ts` | EDIT — ensure BehaviourAppealsService available to BehaviourParentService (verify) | 3 |
| `apps/api/src/modules/behaviour/behaviour-amendments.controller.ts` | EDIT — change sendCorrection permission | 5 |
| `architecture/module-blast-radius.md` | EDIT — fix endpoint counts | 6 |

---

## What This Does NOT Cover

- Registering event-triggered jobs (`behaviour:check-awards`, `behaviour:attachment-scan`, etc.) — these are already correctly enqueued by API services
- Adding `behaviour:check-awards`, `safeguarding:critical-escalation`, `behaviour:attachment-scan` to the event-job-catalog (these are event-triggered, not crons, and are tracked separately)
- Frontend changes for parent appeal submission UI
- Test coverage for new endpoints (covered by separate testing sub-plan)
- Timezone-precise cron scheduling per tenant (future enhancement)
