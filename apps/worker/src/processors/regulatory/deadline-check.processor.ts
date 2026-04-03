import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient, RegulatorySubmissionStatus } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ───────────────────────────────────────────────────────────────
export const REGULATORY_DEADLINE_CHECK_JOB = 'regulatory:check-deadlines';

// ─── Constants ──────────────────────────────────────────────────────────────
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const TERMINAL_STATUSES: RegulatorySubmissionStatus[] = [
  RegulatorySubmissionStatus.reg_submitted,
  RegulatorySubmissionStatus.reg_accepted,
];

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.REGULATORY, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class RegulatoryDeadlineCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(RegulatoryDeadlineCheckProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== REGULATORY_DEADLINE_CHECK_JOB) return;

    this.logger.log('Starting regulatory deadline check');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    for (const tenant of tenants) {
      try {
        await this.checkTenantDeadlines(tenant.id);
      } catch (error) {
        this.logger.error(
          `Deadline check failed for tenant ${tenant.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(`Regulatory deadline check complete — processed ${tenants.length} tenants`);
  }

  // ─── Per-tenant deadline check ──────────────────────────────────────────

  private async checkTenantDeadlines(tenantId: string): Promise<void> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const events = await this.prisma.regulatoryCalendarEvent.findMany({
      where: {
        tenant_id: tenantId,
        status: { notIn: TERMINAL_STATUSES },
        due_date: { gte: today },
      },
      select: {
        id: true,
        title: true,
        domain: true,
        due_date: true,
        reminder_days: true,
      },
    });

    // Also check overdue events (due_date < today)
    const overdueEvents = await this.prisma.regulatoryCalendarEvent.findMany({
      where: {
        tenant_id: tenantId,
        status: { notIn: TERMINAL_STATUSES },
        due_date: { lt: today },
      },
      select: {
        id: true,
        title: true,
        domain: true,
        due_date: true,
        reminder_days: true,
      },
    });

    const adminUserIds = await this.getAdminUserIds(tenantId);

    if (adminUserIds.length === 0) {
      this.logger.warn(`Tenant ${tenantId}: no admin users found, skipping notifications`);
      return;
    }

    let reminders = 0;
    let overdue = 0;

    // Check upcoming events for reminder_days match
    for (const event of events) {
      const daysUntil = Math.ceil((event.due_date.getTime() - now.getTime()) / MS_PER_DAY);

      if (event.reminder_days.includes(daysUntil)) {
        for (const userId of adminUserIds) {
          await this.sendNotificationIfNew(
            tenantId,
            event,
            userId,
            'regulatory_deadline_reminder',
            daysUntil,
          );
        }
        reminders++;
      }
    }

    // Check overdue events
    for (const event of overdueEvents) {
      const daysUntil = Math.ceil((event.due_date.getTime() - now.getTime()) / MS_PER_DAY);

      for (const userId of adminUserIds) {
        await this.sendNotificationIfNew(
          tenantId,
          event,
          userId,
          'regulatory_deadline_overdue',
          daysUntil,
        );
      }
      overdue++;
    }

    if (events.length > 0 || overdueEvents.length > 0) {
      this.logger.log(
        `Tenant ${tenantId}: checked ${events.length + overdueEvents.length} events, ${reminders} reminders sent, ${overdue} overdue notifications sent`,
      );
    }
  }

  // ─── Admin user resolution ──────────────────────────────────────────────

  private async getAdminUserIds(tenantId: string): Promise<string[]> {
    const adminMemberships = await this.prisma.membershipRole.findMany({
      where: {
        tenant_id: tenantId,
        role: { role_tier: 'admin' },
        membership: { membership_status: 'active' },
      },
      select: {
        membership: { select: { user_id: true } },
      },
    });
    return [...new Set(adminMemberships.map((mr) => mr.membership.user_id))];
  }

  // ─── Deduplicated notification creation ─────────────────────────────────

  private async sendNotificationIfNew(
    tenantId: string,
    event: {
      id: string;
      title: string;
      domain: string;
    },
    recipientUserId: string,
    templateKey: string,
    daysUntil: number,
  ): Promise<void> {
    const existing = await this.prisma.notification.findFirst({
      where: {
        tenant_id: tenantId,
        recipient_user_id: recipientUserId,
        template_key: templateKey,
        source_entity_type: 'regulatory_calendar_event',
        source_entity_id: event.id,
      },
    });

    if (existing) return;

    await this.prisma.notification.create({
      data: {
        tenant_id: tenantId,
        recipient_user_id: recipientUserId,
        channel: 'in_app',
        template_key: templateKey,
        locale: 'en',
        status: 'delivered',
        payload_json: {
          event_id: event.id,
          event_title: event.title,
          domain: event.domain,
          days_until: daysUntil,
        },
        source_entity_type: 'regulatory_calendar_event',
        source_entity_id: event.id,
        delivered_at: new Date(),
      },
    });
  }
}
