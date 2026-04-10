# Implementation 08 — Payment Expiry Cron Worker

> **Wave:** 3 (parallelizable with 06, 07, 09)
> **Depends on:** 01, 03
> **Deploys:** Worker restart only

---

## Goal

Build the worker cron job that expires conditional-approval applications whose payment deadline has passed. When the cron reverts an application, it also immediately runs a waiting-list promotion pass for the same year group so the next FIFO applicant moves up into the freed seat. This is the automated enforcement mechanism that keeps the financial-gating promise reliable without requiring admin intervention.

## Why a cron and not an event-driven trigger

Deadlines are time-based, not action-based. BullMQ can schedule a delayed job per application at conditional-approval time (fire-and-forget in N days), but that approach is fragile: if the payment deadline is shortened via a tenant setting, existing scheduled jobs run with the old deadline. A cron that scans all conditional applications every 15 minutes and re-evaluates against the current deadline is robust against setting changes and easy to reason about.

## What to build

### 1. New processor — `apps/worker/src/admissions/admissions-payment-expiry.processor.ts`

```ts
@Processor(QUEUE_NAMES.ADMISSIONS)
export class AdmissionsPaymentExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(AdmissionsPaymentExpiryProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== ADMISSIONS_PAYMENT_EXPIRY_JOB) return;

    // This is a cross-tenant cron — no tenant_id in payload.
    // Find all tenants with expired conditional approvals.
    const expiredByTenant = await this.findExpiredGroupedByTenant();

    for (const [tenantId, applicationIds] of expiredByTenant) {
      // Delegate each tenant's batch to a TenantAwareJob instance
      // so RLS is set correctly per tenant.
      await this.processTenantBatch(tenantId, applicationIds);
    }
  }

  private async findExpiredGroupedByTenant(): Promise<Map<string, string[]>> {
    // Raw query that spans all tenants — allowed in the worker
    // bootstrap path because the Prisma client here is unscoped.
    // This is the only cross-tenant read in the admissions module.
    const rows = await this.prisma.$queryRaw<{ tenant_id: string; application_id: string }[]>`
      SELECT tenant_id, id AS application_id
      FROM applications
      WHERE status = 'conditional_approval'
        AND payment_deadline IS NOT NULL
        AND payment_deadline < now()
      ORDER BY tenant_id, apply_date
    `;
    const byTenant = new Map<string, string[]>();
    for (const row of rows) {
      if (!byTenant.has(row.tenant_id)) byTenant.set(row.tenant_id, []);
      byTenant.get(row.tenant_id)!.push(row.application_id);
    }
    return byTenant;
  }

  private async processTenantBatch(tenantId: string, applicationIds: string[]): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaClient;

      for (const applicationId of applicationIds) {
        try {
          // Revert to waiting_list — reuse the state machine method
          await this.stateMachine.revertToWaitingList(
            tenantId,
            applicationId,
            'payment_expired',
            db as unknown as PrismaService,
          );

          // Load the year group so we can run the promotion pass
          const app = await db.application.findFirst({
            where: { id: applicationId, tenant_id: tenantId },
            select: { target_academic_year_id: true, target_year_group_id: true },
          });

          if (app?.target_academic_year_id && app?.target_year_group_id) {
            await this.autoPromotionService.promoteYearGroup(db as unknown as PrismaService, {
              tenantId,
              academicYearId: app.target_academic_year_id,
              yearGroupId: app.target_year_group_id,
            });
          }

          // Fire a notification to the parent: "your payment window expired"
          await this.notificationsService.enqueue({
            tenantId,
            subject: 'applicant',
            subjectId: applicationId,
            template: 'admissions.payment_expired',
          });
        } catch (err) {
          this.logger.error(`Failed to expire application ${applicationId}: ${err}`);
          // Log and continue — one bad row shouldn't block the batch.
          // But the outer transaction will see the error; consider making
          // each application its own mini-transaction to isolate failures.
        }
      }
    });
  }
}
```

**Design decision — transaction granularity:** doing all applications for a tenant in one transaction is atomic but blocks other tenants if one row fails. Prefer a separate transaction per application to isolate failures. The trade-off is losing atomicity across the batch, which is acceptable here because each revert is logically independent.

### 2. Register the cron

Add to `CronSchedulerService.onModuleInit` (or wherever the project registers crons):

```ts
await this.addCron({
  jobName: ADMISSIONS_PAYMENT_EXPIRY_JOB,
  cronExpression: '*/15 * * * *', // every 15 minutes
  jobId: `cron:${ADMISSIONS_PAYMENT_EXPIRY_JOB}`,
  removeOnComplete: 10,
  removeOnFail: 50,
  data: {}, // cross-tenant, no payload
});
```

Add `ADMISSIONS_PAYMENT_EXPIRY_JOB` to `apps/worker/src/base/queue.constants.ts` if it's not already there.

### 3. Notification template

`admissions.payment_expired` — a new locale-aware email template. Body (EN):

```
Your admission payment window has expired

Dear {{parent_first_name}},

We did not receive your admission payment for {{student_first_name}} {{student_last_name}} ({{application_number}}) within the allowed window.

Your application has been returned to our waiting list. If you still wish to proceed, please contact us to request a new payment link.

Reference: {{application_number}}
Target year group: {{year_group_name}}

— {{school_name}}
```

Arabic translation required — keep it simple.

The notification processor uses the existing notifications infrastructure. Don't build a new dispatch mechanism.

### 4. Tests

- Unit: `admissions-payment-expiry.processor.spec.ts`
  - Finds expired applications across tenants.
  - Per-tenant batch isolates failures (one bad row doesn't cascade).
  - Calls state machine's `revertToWaitingList` with correct args.
  - Calls auto-promotion for the affected year group.
  - Does not touch applications that are still within the window.
  - Does not touch applications in other statuses.
  - Does not touch applications with `payment_deadline IS NULL` (defensive — should never happen but we don't want a null comparison to match).
- Integration (optional, within time budget): seed 3 tenants with mixed conditional-approval states, run the job, assert correct reverts.

### 5. Alerting

If the cron fails (uncaught exception reaches BullMQ's failed job handler), it's retried up to 3 times and then goes to the dead-letter queue. We do NOT want expired-payment logic to silently fail for days. The dead-letter queue is monitored via the existing health endpoints. Add a log line with `logger.error` on repeated failures so Sentry (if configured) picks it up.

## Deployment

1. Commit locally.
2. Patch → production.
3. Build `@school/worker`, restart worker: `pm2 restart worker --update-env`.
4. Smoke test:
   - Verify cron registered: check BullMQ repeatable jobs via an existing health endpoint or the dashboard.
   - Manually trigger one run via `pm2 logs worker` while inserting a test application with `payment_deadline = now() - interval '1 minute'` (in a staging tenant).
5. Update `IMPLEMENTATION_LOG.md`.

## Definition of done

- Processor built and unit-tested.
- Cron registered to run every 15 minutes.
- Email template added in EN + AR.
- Worker restarted on production.
- Registered cron visible in the worker logs on startup.
- Completion record added to the log.

## Notes for downstream implementations

- **11 (conditional approval page)** surfaces `payment_deadline` prominently so admins can see the countdown. When a row flips to waiting list due to expiry, it naturally disappears from this page.
- The `auto-promotion` service is defined in **09** — this impl injects it as a dependency. Order of coding doesn't matter (parallelizable) as long as both ship before deployment.
