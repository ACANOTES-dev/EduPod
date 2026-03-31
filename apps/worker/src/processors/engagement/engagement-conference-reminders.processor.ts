import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job Name ─────────────────────────────────────────────────────────────────

export const CONFERENCE_REMINDERS_JOB = 'engagement:conference-reminders';

// ─── Processor ────────────────────────────────────────────────────────────────

/**
 * Cross-tenant cron processor — runs daily at 08:00 UTC.
 * Iterates all active tenants, finds confirmed conference bookings
 * with time slots starting within the next 24 hours, and creates
 * reminder notifications for the booking owners.
 */
@Processor(QUEUE_NAMES.ENGAGEMENT)
export class EngagementConferenceRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(EngagementConferenceRemindersProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== CONFERENCE_REMINDERS_JOB) return;

    this.logger.log('Running conference-reminders across all tenants...');

    // ─── Fetch all active tenants (cross-tenant, no RLS) ──────────────────────

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    let totalReminders = 0;

    for (const tenant of tenants) {
      try {
        const count = await this.remindForTenant(tenant.id);
        totalReminders += count;
      } catch (err) {
        this.logger.error(
          `Conference-reminders failed for tenant ${tenant.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `Conference-reminders complete: ${totalReminders} reminders across ${tenants.length} tenant(s)`,
    );
  }

  // ─── Per-tenant processing ────────────────────────────────────────────────────

  private async remindForTenant(tenantId: string): Promise<number> {
    let reminderCount = 0;

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;

      const txClient = tx as unknown as PrismaClient;

      // ─── Find confirmed bookings with time slots in the next 24 hours ───────

      const bookings = await txClient.conferenceBooking.findMany({
        where: {
          tenant_id: tenantId,
          status: 'confirmed',
          time_slot: {
            start_time: {
              gte: now,
              lte: in24h,
            },
          },
        },
        include: {
          time_slot: true,
          student: {
            select: {
              first_name: true,
              last_name: true,
            },
          },
        },
      });

      // ─── Create reminder notifications ──────────────────────────────────────

      for (const booking of bookings) {
        await txClient.notification.create({
          data: {
            tenant_id: tenantId,
            recipient_user_id: booking.booked_by_user_id,
            channel: 'in_app',
            template_key: 'conference_reminder',
            locale: 'en',
            status: 'delivered',
            payload_json: {
              booking_id: booking.id,
              teacher_name: `Teacher ${booking.time_slot.teacher_id}`,
              start_time: booking.time_slot.start_time.toISOString(),
              end_time: booking.time_slot.end_time.toISOString(),
              student_name: `${booking.student.first_name} ${booking.student.last_name}`,
            },
          },
        });

        reminderCount++;
      }
    });

    if (reminderCount > 0) {
      this.logger.log(`Tenant ${tenantId}: sent ${reminderCount} conference reminders`);
    }

    return reminderCount;
  }
}
