import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job names ───────────────────────────────────────────────────────────────

export const ADMISSIONS_PAYMENT_EXPIRY_JOB = 'admissions:payment-expiry';
export const ADMISSIONS_PAYMENT_EXPIRED_NOTIFICATION_JOB =
  'notifications:admissions-payment-expired';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExpiredApplicationRow {
  id: string;
  tenant_id: string;
  target_academic_year_id: string | null;
  target_year_group_id: string | null;
}

interface RevertOutcome {
  reverted: boolean;
  reviewerUserId: string | null;
}

interface TenantBatchResult {
  expired: number;
  promoted: number;
  failed: number;
}

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Cron-driven expiry worker for admissions payment windows.
 *
 * Scans all tenants every 15 minutes for `conditional_approval` applications
 * whose `payment_deadline` has passed and reverts them to `waiting_list`,
 * releasing the held seat. Immediately after each tenant's batch of reverts,
 * runs one FIFO waiting-list promotion pass per affected (academic_year,
 * year_group) pair so the next applicant in the queue fills the freed seat
 * without waiting for admin intervention.
 *
 * This is the automated enforcement mechanism behind the financially-gated
 * admissions pipeline described in `new-admissions/PLAN.md` §5. Without it,
 * an admin who forgets to chase an unpaid conditional approval would leave
 * the seat held indefinitely while FIFO waiting-list applicants sit behind
 * a ghost reservation.
 *
 * ## Concurrency
 *
 * Each expired application is reverted in its own interactive transaction so
 * a single bad row cannot cascade-fail an entire tenant's batch. RLS is set
 * per transaction via `set_config('app.current_tenant_id', ...)` — the
 * cross-tenant scan at the top runs outside any RLS context because the
 * worker's database role bypasses RLS for initial discovery (matching the
 * pattern used by `ApprovalCallbackReconciliationProcessor`).
 *
 * ## Attribution
 *
 * System-generated audit notes on reverted rows are attributed to the admin
 * who originally approved the application (i.e. the expired row's
 * `reviewed_by_user_id`). Auto-promoted waiting-list rows are attributed to
 * the same admin — the seat they held (and failed to finalize) is what freed
 * the space. This keeps `application_notes.author_user_id` pointing at real
 * users and avoids the FK violation the old `admissions-auto-expiry.processor`
 * would have hit in production.
 */
// Lock renewal cadence — extend the BullMQ lock every 60s so a tenant
// batch that exceeds `LOCK_DURATION_MS` (e.g. 10k+ expired rows) cannot be
// re-claimed by a second worker mid-flight. The renewer runs independently
// of BullMQ's internal renewer to give us deterministic control during long
// DB phases that block the event loop.
const LOCK_DURATION_MS = 30 * 60_000;
const LOCK_RENEW_INTERVAL_MS = 60_000;

@Processor(QUEUE_NAMES.ADMISSIONS, {
  lockDuration: LOCK_DURATION_MS,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class AdmissionsPaymentExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(AdmissionsPaymentExpiryProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== ADMISSIONS_PAYMENT_EXPIRY_JOB) {
      return;
    }

    this.logger.log(`[${ADMISSIONS_PAYMENT_EXPIRY_JOB}] starting scan`);

    // Periodic lock renewal so a long batch (10k+ expired rows) can't be
    // stolen by a second worker. Cleared in the `finally` block below.
    const renewer = setInterval(() => {
      const token = job.token;
      if (!token) return;
      job.extendLock(token, LOCK_DURATION_MS).catch((err) => {
        this.logger.warn(
          `[${ADMISSIONS_PAYMENT_EXPIRY_JOB}] failed to extend lock: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    }, LOCK_RENEW_INTERVAL_MS);

    try {
      const expiredByTenant = await this.findExpiredGroupedByTenant();

      if (expiredByTenant.size === 0) {
        this.logger.log(
          `[${ADMISSIONS_PAYMENT_EXPIRY_JOB}] no expired conditional approvals found`,
        );
        return;
      }

      let totalExpired = 0;
      let totalPromoted = 0;
      let totalFailed = 0;

      for (const [tenantId, applications] of expiredByTenant) {
        const result = await this.processTenantBatch(tenantId, applications);
        totalExpired += result.expired;
        totalPromoted += result.promoted;
        totalFailed += result.failed;
      }

      this.logger.log(
        `[${ADMISSIONS_PAYMENT_EXPIRY_JOB}] complete — expired=${totalExpired} promoted=${totalPromoted} failed=${totalFailed} tenants=${expiredByTenant.size}`,
      );
    } finally {
      clearInterval(renewer);
    }
  }

  // ─── Discovery ───────────────────────────────────────────────────────────

  private async findExpiredGroupedByTenant(): Promise<Map<string, ExpiredApplicationRow[]>> {
    // Cross-tenant scan — runs outside any RLS context on the worker's
    // unscoped PrismaClient. The defensive `payment_deadline IS NOT NULL`
    // guard keeps null comparisons out of the result set. Reverts and
    // promotions below run inside per-tenant RLS transactions.
    const rows = await this.prisma.$queryRaw<ExpiredApplicationRow[]>`
      SELECT id, tenant_id, target_academic_year_id, target_year_group_id
      FROM applications
      WHERE status = 'conditional_approval'
        AND payment_deadline IS NOT NULL
        AND payment_deadline < now()
      ORDER BY tenant_id, apply_date
    `;

    const byTenant = new Map<string, ExpiredApplicationRow[]>();
    for (const row of rows) {
      const bucket = byTenant.get(row.tenant_id);
      if (bucket) {
        bucket.push(row);
      } else {
        byTenant.set(row.tenant_id, [row]);
      }
    }
    return byTenant;
  }

  // ─── Per-tenant batch ─────────────────────────────────────────────────────

  private async processTenantBatch(
    tenantId: string,
    applications: ExpiredApplicationRow[],
  ): Promise<TenantBatchResult> {
    let expired = 0;
    let failed = 0;

    // Track one reviewer per (academic_year, year_group) pair — used below to
    // attribute the promotion notes to the admin whose expired approval freed
    // the seat.
    const yearGroupReviewers = new Map<string, string>();

    // Phase 1 — revert each expired row in its own transaction for failure
    // isolation. A bad row logs and continues; the next row is unaffected.
    for (const app of applications) {
      try {
        const outcome = await this.revertApplication(tenantId, app.id);
        if (!outcome.reverted) {
          continue;
        }
        expired++;

        if (app.target_academic_year_id && app.target_year_group_id && outcome.reviewerUserId) {
          const key = this.yearGroupKey(app.target_academic_year_id, app.target_year_group_id);
          if (!yearGroupReviewers.has(key)) {
            yearGroupReviewers.set(key, outcome.reviewerUserId);
          }
        }

        await this.enqueueExpiredNotification(tenantId, app.id);
      } catch (err) {
        failed++;
        this.logger.error(
          `[${ADMISSIONS_PAYMENT_EXPIRY_JOB}] tenant=${tenantId} app=${app.id} revert failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // Phase 2 — one promotion pass per unique (year_group, academic_year)
    // affected by this tenant's reverts. Running per-group (rather than
    // per-application) means a batch of N reverts in the same year group
    // still emits one promotion transaction.
    let promoted = 0;
    for (const [key, reviewerUserId] of yearGroupReviewers) {
      const [academicYearId, yearGroupId] = key.split(':');
      if (!academicYearId || !yearGroupId) {
        continue;
      }
      try {
        promoted += await this.promoteYearGroup(
          tenantId,
          academicYearId,
          yearGroupId,
          reviewerUserId,
        );
      } catch (err) {
        this.logger.error(
          `[${ADMISSIONS_PAYMENT_EXPIRY_JOB}] tenant=${tenantId} year_group=${yearGroupId} promotion failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return { expired, promoted, failed };
  }

  // ─── Revert one application ──────────────────────────────────────────────

  private async revertApplication(tenantId: string, applicationId: string): Promise<RevertOutcome> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.setRlsContext(tx, tenantId);

        const current = await tx.application.findFirst({
          where: {
            id: applicationId,
            tenant_id: tenantId,
            status: 'conditional_approval',
          },
          select: {
            id: true,
            reviewed_by_user_id: true,
            payment_deadline: true,
          },
        });

        // Another path may have finalised the payment or force-approved the
        // row between the scan and the per-row transaction. Treat as a
        // successful idempotent skip — do NOT raise.
        if (!current) {
          return { reverted: false, reviewerUserId: null };
        }

        // Defensive re-check: the cron's initial scan saw the deadline as
        // past, but if the deadline was extended between the scan and this
        // transaction we must not revert a row whose window is now in the
        // future.
        if (!current.payment_deadline || current.payment_deadline >= new Date()) {
          return { reverted: false, reviewerUserId: null };
        }

        await tx.application.update({
          where: { id: applicationId },
          data: {
            status: 'waiting_list',
            waiting_list_substatus: null,
            payment_amount_cents: null,
            payment_deadline: null,
          },
        });

        if (current.reviewed_by_user_id) {
          await tx.applicationNote.create({
            data: {
              tenant_id: tenantId,
              application_id: applicationId,
              author_user_id: current.reviewed_by_user_id,
              note: 'Reverted to waiting list (reason: payment_expired). Seat released.',
              is_internal: true,
            },
          });
        }

        return { reverted: true, reviewerUserId: current.reviewed_by_user_id };
      },
      { maxWait: 30_000, timeout: 60_000 },
    );
  }

  // ─── Promote waiting list FIFO ───────────────────────────────────────────

  private async promoteYearGroup(
    tenantId: string,
    academicYearId: string,
    yearGroupId: string,
    attributionUserId: string,
  ): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.setRlsContext(tx, tenantId);

        // Compute available seats inline — mirrors
        // `AdmissionsCapacityService.fetchCapacityRows` without importing
        // from the API module. Clamps to zero so any historical over-
        // consumption is absorbed, matching the service's contract.
        const classes = await tx.class.findMany({
          where: {
            tenant_id: tenantId,
            academic_year_id: academicYearId,
            year_group_id: yearGroupId,
            status: 'active',
          },
          select: { id: true, max_capacity: true },
        });

        if (classes.length === 0) {
          return 0;
        }

        const totalCapacity = classes.reduce((sum, c) => sum + c.max_capacity, 0);
        const classIds = classes.map((c) => c.id);

        const enrolledRows = await tx.classEnrolment.findMany({
          where: {
            tenant_id: tenantId,
            class_id: { in: classIds },
            status: 'active',
          },
          select: { student_id: true },
          distinct: ['student_id'],
        });
        const enrolledCount = enrolledRows.length;

        const conditionalCount = await tx.application.count({
          where: {
            tenant_id: tenantId,
            target_academic_year_id: academicYearId,
            target_year_group_id: yearGroupId,
            status: 'conditional_approval',
          },
        });

        const availableSeats = Math.max(0, totalCapacity - enrolledCount - conditionalCount);
        if (availableSeats === 0) {
          return 0;
        }

        // FIFO waiting list promotion. `waiting_list_substatus: null` skips
        // the `awaiting_year_setup` cohort — those rows have no active
        // classes yet and belong to the year-setup hook, not this one.
        const candidates = await tx.application.findMany({
          where: {
            tenant_id: tenantId,
            target_academic_year_id: academicYearId,
            target_year_group_id: yearGroupId,
            status: 'waiting_list',
            waiting_list_substatus: null,
          },
          orderBy: { apply_date: 'asc' },
          take: availableSeats,
          select: { id: true },
        });

        for (const candidate of candidates) {
          await tx.application.update({
            where: { id: candidate.id },
            data: { status: 'ready_to_admit' },
          });
          await tx.applicationNote.create({
            data: {
              tenant_id: tenantId,
              application_id: candidate.id,
              author_user_id: attributionUserId,
              note: 'Auto-promoted to Ready to Admit (seat freed by payment window expiry).',
              is_internal: true,
            },
          });
        }

        return candidates.length;
      },
      { maxWait: 30_000, timeout: 60_000 },
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async setRlsContext(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;
  }

  private yearGroupKey(academicYearId: string, yearGroupId: string): string {
    return `${academicYearId}:${yearGroupId}`;
  }

  private async enqueueExpiredNotification(tenantId: string, applicationId: string): Promise<void> {
    try {
      await this.notificationsQueue.add(
        ADMISSIONS_PAYMENT_EXPIRED_NOTIFICATION_JOB,
        {
          tenant_id: tenantId,
          application_id: applicationId,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
        },
      );
    } catch (err) {
      this.logger.warn(
        `[${ADMISSIONS_PAYMENT_EXPIRY_JOB}] tenant=${tenantId} app=${applicationId} failed to enqueue notification: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
