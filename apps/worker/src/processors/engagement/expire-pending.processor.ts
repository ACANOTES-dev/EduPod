import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job Name ─────────────────────────────────────────────────────────────────

export const EXPIRE_PENDING_JOB = 'engagement:expire-pending';

// ─── Processor ────────────────────────────────────────────────────────────────

/**
 * Cross-tenant cron processor — runs daily at 00:00 UTC.
 * Expires pending consent and form submissions that have passed their deadline.
 *
 * For each active tenant:
 * 1. Finds open events where consent_deadline < today
 * 2. Transitions pending participants to consent_declined
 * 3. Transitions pending form submissions to expired
 */
@Processor(QUEUE_NAMES.ENGAGEMENT, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class ExpirePendingProcessor extends WorkerHost {
  private readonly logger = new Logger(ExpirePendingProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== EXPIRE_PENDING_JOB) return;

    this.logger.log('Running expire-pending across all tenants...');

    // ─── Fetch all active tenants (cross-tenant, no RLS) ──────────────────────

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    let totalExpiredParticipants = 0;
    let totalExpiredSubmissions = 0;

    for (const tenant of tenants) {
      try {
        const result = await this.expireForTenant(tenant.id);
        totalExpiredParticipants += result.participants;
        totalExpiredSubmissions += result.submissions;
      } catch (err) {
        this.logger.error(
          `Expire-pending failed for tenant ${tenant.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `Expire-pending complete: ${totalExpiredParticipants} participants declined, ` +
        `${totalExpiredSubmissions} submissions expired across ${tenants.length} tenant(s)`,
    );
  }

  // ─── Per-tenant processing ────────────────────────────────────────────────────

  private async expireForTenant(
    tenantId: string,
  ): Promise<{ participants: number; submissions: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let expiredParticipants = 0;
    let expiredSubmissions = 0;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;

      const txClient = tx as unknown as PrismaClient;

      // ─── 1. Find events with expired consent deadlines ──────────────────────

      const expiredEvents = await txClient.engagementEvent.findMany({
        where: {
          tenant_id: tenantId,
          status: { in: ['open', 'published'] },
          consent_deadline: { lt: today },
        },
        select: { id: true, title: true },
      });

      // ─── 2. Expire pending participants ─────────────────────────────────────

      for (const event of expiredEvents) {
        const pendingParticipants = await txClient.engagementEventParticipant.findMany({
          where: {
            tenant_id: tenantId,
            event_id: event.id,
            consent_status: 'pending',
          },
          select: { id: true },
        });

        if (pendingParticipants.length === 0) continue;

        const participantIds = pendingParticipants.map((p: { id: string }) => p.id);

        await txClient.engagementEventParticipant.updateMany({
          where: {
            id: { in: participantIds },
            tenant_id: tenantId,
          },
          data: {
            consent_status: 'declined',
            status: 'consent_declined',
          },
        });

        expiredParticipants += participantIds.length;

        this.logger.log(
          `Tenant ${tenantId}: expired ${participantIds.length} pending participants for event "${event.title}" (${event.id})`,
        );
      }

      // ─── 3. Expire pending form submissions past their event deadline ───────

      const now = new Date();

      const pendingSubmissions = await txClient.engagementFormSubmission.findMany({
        where: {
          tenant_id: tenantId,
          status: 'pending',
          event: {
            consent_deadline: { lt: today },
          },
        },
        select: { id: true },
      });

      if (pendingSubmissions.length > 0) {
        const submissionIds = pendingSubmissions.map((s: { id: string }) => s.id);

        await txClient.engagementFormSubmission.updateMany({
          where: {
            id: { in: submissionIds },
            tenant_id: tenantId,
          },
          data: {
            status: 'expired',
            expired_at: now,
          },
        });

        expiredSubmissions += submissionIds.length;

        this.logger.log(
          `Tenant ${tenantId}: expired ${submissionIds.length} pending form submissions`,
        );
      }
    });

    return { participants: expiredParticipants, submissions: expiredSubmissions };
  }
}
