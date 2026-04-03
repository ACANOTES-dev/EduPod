import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { engagementConfigSchema } from '@school/shared/engagement';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job Name ─────────────────────────────────────────────────────────────────

export const CHASE_OUTSTANDING_JOB = 'engagement:chase-outstanding';

// ─── Processor ────────────────────────────────────────────────────────────────

/**
 * Cross-tenant cron processor — runs daily at 09:00 UTC.
 * Iterates all active tenants, reads engagement config from tenant settings,
 * and creates reminder notifications for pending consent/form submissions
 * approaching their deadlines.
 */
@Processor(QUEUE_NAMES.ENGAGEMENT, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class ChaseOutstandingProcessor extends WorkerHost {
  private readonly logger = new Logger(ChaseOutstandingProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== CHASE_OUTSTANDING_JOB) return;

    this.logger.log('Running chase-outstanding across all tenants...');

    // ─── Fetch all active tenants (cross-tenant, no RLS) ──────────────────────

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    let totalReminders = 0;

    for (const tenant of tenants) {
      try {
        const count = await this.chaseForTenant(tenant.id);
        totalReminders += count;
      } catch (err) {
        this.logger.error(
          `Chase-outstanding failed for tenant ${tenant.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `Chase-outstanding complete: ${totalReminders} reminders across ${tenants.length} tenant(s)`,
    );
  }

  // ─── Per-tenant processing ────────────────────────────────────────────────────

  private async chaseForTenant(tenantId: string): Promise<number> {
    // ─── 1. Read engagement config from tenant settings ───────────────────────

    const config = await this.loadEngagementConfig(tenantId);

    const { default_reminder_days, max_reminders_per_form } = config;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let reminderCount = 0;

    // ─── 2. Set RLS context and process within transaction ────────────────────

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;

      const txClient = tx as unknown as PrismaClient;

      // ─── 3. Find open events with consent deadlines ─────────────────────────

      const events = await txClient.engagementEvent.findMany({
        where: {
          tenant_id: tenantId,
          status: { in: ['open', 'published'] },
          consent_deadline: { not: null },
        },
        select: {
          id: true,
          title: true,
          consent_deadline: true,
        },
      });

      for (const event of events) {
        if (!event.consent_deadline) continue;

        const deadline = new Date(event.consent_deadline);
        deadline.setHours(0, 0, 0, 0);
        const daysUntilDeadline = Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000);

        // Only send reminders when days_until_deadline matches a configured threshold
        if (daysUntilDeadline < 0) continue;
        if (!default_reminder_days.includes(daysUntilDeadline)) continue;

        // ─── 4. Find pending participants ───────────────────────────────────────

        const pendingParticipants = await txClient.engagementEventParticipant.findMany({
          where: {
            tenant_id: tenantId,
            event_id: event.id,
            consent_status: 'pending',
          },
          select: {
            id: true,
            student_id: true,
          },
        });

        for (const participant of pendingParticipants) {
          // ─── 5. Check reminder count for this participant ───────────────────

          const existingReminders = await txClient.notification.count({
            where: {
              tenant_id: tenantId,
              source_entity_type: 'engagement_event_participant',
              source_entity_id: participant.id,
              template_key: 'engagement_consent_reminder',
            },
          });

          if (existingReminders >= max_reminders_per_form) continue;

          // ─── 6. Resolve recipient — find a parent user for this student ─────

          const studentRecord = await txClient.student.findFirst({
            where: { tenant_id: tenantId, id: participant.student_id },
            select: {
              household: {
                select: {
                  household_parents: {
                    select: { parent: { select: { user_id: true } } },
                    take: 1,
                  },
                },
              },
            },
          });

          const recipientUserId = studentRecord?.household?.household_parents?.[0]?.parent?.user_id;

          if (!recipientUserId) {
            this.logger.warn(
              `No parent user found for student ${participant.student_id} — skipping reminder`,
            );
            continue;
          }

          // ─── 7. Create in-app notification ──────────────────────────────────

          await txClient.notification.create({
            data: {
              tenant_id: tenantId,
              recipient_user_id: recipientUserId,
              channel: 'in_app',
              template_key: 'engagement_consent_reminder',
              locale: 'en',
              status: 'queued',
              payload_json: {
                event_id: event.id,
                event_title: event.title,
                days_until_deadline: daysUntilDeadline,
                student_id: participant.student_id,
              },
              source_entity_type: 'engagement_event_participant',
              source_entity_id: participant.id,
            },
          });

          reminderCount++;
        }
      }

      // ─── 8. Chase pending form submissions approaching deadline ─────────────

      const pendingSubmissions = await txClient.engagementFormSubmission.findMany({
        where: {
          tenant_id: tenantId,
          status: 'pending',
          event: {
            consent_deadline: { not: null },
            status: { in: ['open', 'published'] },
          },
        },
        select: {
          id: true,
          student_id: true,
          event: {
            select: {
              id: true,
              title: true,
              consent_deadline: true,
            },
          },
        },
      });

      for (const submission of pendingSubmissions) {
        if (!submission.event?.consent_deadline) continue;

        const deadline = new Date(submission.event.consent_deadline);
        deadline.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000);

        if (daysUntil < 0 || !default_reminder_days.includes(daysUntil)) continue;

        const existingReminders = await txClient.notification.count({
          where: {
            tenant_id: tenantId,
            source_entity_type: 'engagement_form_submission',
            source_entity_id: submission.id,
            template_key: 'engagement_form_reminder',
          },
        });

        if (existingReminders >= max_reminders_per_form) continue;

        const student = await txClient.student.findFirst({
          where: { tenant_id: tenantId, id: submission.student_id },
          select: {
            household: {
              select: {
                household_parents: {
                  select: { parent: { select: { user_id: true } } },
                  take: 1,
                },
              },
            },
          },
        });

        const recipientUserId = student?.household?.household_parents?.[0]?.parent?.user_id;

        if (!recipientUserId) continue;

        await txClient.notification.create({
          data: {
            tenant_id: tenantId,
            recipient_user_id: recipientUserId,
            channel: 'in_app',
            template_key: 'engagement_form_reminder',
            locale: 'en',
            status: 'queued',
            payload_json: {
              event_id: submission.event.id,
              event_title: submission.event.title,
              days_until_deadline: daysUntil,
              submission_id: submission.id,
              student_id: submission.student_id,
            },
            source_entity_type: 'engagement_form_submission',
            source_entity_id: submission.id,
          },
        });

        reminderCount++;
      }
    });

    if (reminderCount > 0) {
      this.logger.log(`Tenant ${tenantId}: sent ${reminderCount} consent/form reminders`);
    }

    return reminderCount;
  }

  // ─── Config Loader ──────────────────────────────────────────────────────────

  private async loadEngagementConfig(tenantId: string) {
    const tenantSettings = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    const settingsJson = (tenantSettings?.settings as Record<string, unknown>) ?? {};
    const engagementRaw = (settingsJson.engagement as Record<string, unknown>) ?? {};

    return engagementConfigSchema.parse(engagementRaw);
  }
}
