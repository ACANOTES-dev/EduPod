import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const CLEANUP_PARTICIPATION_TOKENS_JOB = 'wellbeing:cleanup-participation-tokens';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Cross-tenant cron job — runs at 05:00 UTC daily.
 *
 * Deletes participation tokens for surveys that have been closed for more than
 * 7 days. This makes anonymity architectural: after cleanup, the server cannot
 * determine who participated in those surveys.
 *
 * NOTE: survey_participation_tokens has NO tenant_id and NO RLS. It is queried
 * directly on the base prisma client. The surveys table DOES have tenant_id and
 * is queried without RLS context (cross-tenant sweep).
 */
@Processor(QUEUE_NAMES.WELLBEING, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class CleanupParticipationTokensProcessor extends WorkerHost {
  private readonly logger = new Logger(CleanupParticipationTokensProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== CLEANUP_PARTICIPATION_TOKENS_JOB) return;

    this.logger.log(`Processing ${CLEANUP_PARTICIPATION_TOKENS_JOB}`);

    // Find all surveys closed more than 7 days ago
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const closedSurveys = await this.prisma.staffSurvey.findMany({
      where: {
        status: 'closed',
        window_closes_at: { lt: cutoff },
      },
      select: { id: true, tenant_id: true },
    });

    if (closedSurveys.length === 0) {
      this.logger.log('No surveys eligible for token cleanup');
      return;
    }

    this.logger.log(`Found ${closedSurveys.length} closed survey(s) eligible for token cleanup`);

    // Group by tenant to process each in its own transaction with RLS context
    const byTenant = new Map<string, string[]>();
    for (const survey of closedSurveys) {
      const ids = byTenant.get(survey.tenant_id) ?? [];
      ids.push(survey.id);
      byTenant.set(survey.tenant_id, ids);
    }

    for (const [tenantId, surveyIds] of byTenant) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;

        // survey_participation_tokens has no tenant_id and no RLS —
        // delete directly by survey_id using the composite PK's survey_id column
        const result = await tx.surveyParticipationToken.deleteMany({
          where: { survey_id: { in: surveyIds } },
        });

        this.logger.log(
          `Tenant ${tenantId}: deleted ${result.count} participation token(s) across ${surveyIds.length} survey(s)`,
        );
      });
    }

    this.logger.log(`${CLEANUP_PARTICIPATION_TOKENS_JOB} complete`);
  }
}
