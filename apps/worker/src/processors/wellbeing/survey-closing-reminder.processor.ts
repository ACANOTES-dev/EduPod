import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { MembershipStatus, Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const SURVEY_CLOSING_REMINDER_JOB = 'wellbeing:survey-closing-reminder';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Cross-tenant cron processor.
 *
 * Does NOT extend TenantAwareJob because it iterates across all tenants.
 * For each tenant with a survey closing within 24 hours, it sets RLS context
 * manually per transaction and sends closing-reminder in-app notifications.
 *
 * Registered by CronSchedulerService to run daily at 08:00 UTC.
 */
@Processor(QUEUE_NAMES.WELLBEING, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class SurveyClosingReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(SurveyClosingReminderProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SURVEY_CLOSING_REMINDER_JOB) return;

    this.logger.log(`Processing ${SURVEY_CLOSING_REMINDER_JOB}`);

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Query active surveys closing within the next 24 hours across all tenants.
    // This is an admin-level cross-tenant query — no RLS context is set here.
    const closingSurveys = await this.prisma.staffSurvey.findMany({
      where: {
        status: 'active',
        window_closes_at: { gte: now, lte: tomorrow },
      },
      select: { id: true, tenant_id: true },
    });

    if (closingSurveys.length === 0) {
      this.logger.log('No surveys closing within 24 hours — nothing to do');
      return;
    }

    this.logger.log(`Found ${closingSurveys.length} survey(s) closing within 24 hours`);

    let totalNotifications = 0;

    for (const survey of closingSurveys) {
      const count = await this.processTenantSurvey(survey.tenant_id, survey.id);
      totalNotifications += count;
    }

    this.logger.log(
      `${SURVEY_CLOSING_REMINDER_JOB} complete — sent ${totalNotifications} reminder notification(s)`,
    );
  }

  /**
   * For a single tenant+survey, set RLS context, query active members,
   * and create in-app closing-reminder notifications.
   *
   * Returns the number of notifications created.
   */
  private async processTenantSurvey(tenantId: string, surveyId: string): Promise<number> {
    try {
      let count = 0;

      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;

        const members = await tx.tenantMembership.findMany({
          where: { tenant_id: tenantId, membership_status: MembershipStatus.active },
          select: { user_id: true },
        });

        if (members.length === 0) {
          this.logger.log(
            `No active members for tenant ${tenantId} — skipping closing reminder for survey ${surveyId}`,
          );
          return;
        }

        const now = new Date();

        await tx.notification.createMany({
          data: members.map((m) => ({
            tenant_id: tenantId,
            recipient_user_id: m.user_id,
            channel: 'in_app',
            template_key: null,
            locale: 'en',
            status: 'delivered',
            delivered_at: now,
            payload_json: {
              title: 'Survey Closing Soon',
              body: 'The current wellbeing survey closes tomorrow.',
              link: '/wellbeing/survey',
            },
            source_entity_type: 'staff_survey',
            source_entity_id: surveyId,
          })),
        });

        count = members.length;
      });

      this.logger.log(
        `Created ${count} closing-reminder notification(s) for survey ${surveyId} (tenant ${tenantId})`,
      );

      return count;
    } catch (err) {
      this.logger.error(
        `Failed to send closing reminders for survey ${surveyId} (tenant ${tenantId}): ${String(err)}`,
      );
      return 0;
    }
  }
}
