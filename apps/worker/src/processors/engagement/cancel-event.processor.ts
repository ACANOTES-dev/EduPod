import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job Name ─────────────────────────────────────────────────────────────────

export const CANCEL_EVENT_JOB = 'engagement:cancel-event';

// ─── Payload ──────────────────────────────────────────────────────────────────

export interface CancelEventPayload extends TenantJobPayload {
  event_id: string;
}

// ─── Processor ────────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.ENGAGEMENT)
export class CancelEventProcessor extends WorkerHost {
  private readonly logger = new Logger(CancelEventProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<CancelEventPayload>): Promise<void> {
    if (job.name !== CANCEL_EVENT_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) throw new Error('Job rejected: missing tenant_id');

    this.logger.log(
      `Processing ${CANCEL_EVENT_JOB} — tenant=${tenant_id}, event=${job.data.event_id}`,
    );

    const cancelJob = new CancelEventJob(this.prisma, this.notificationsQueue);
    await cancelJob.execute(job.data);
  }
}

// ─── TenantAwareJob Implementation ───────────────────────────────────────────

class CancelEventJob extends TenantAwareJob<CancelEventPayload> {
  private readonly logger = new Logger(CancelEventJob.name);

  constructor(
    prisma: PrismaClient,
    private readonly notificationsQueue: Queue,
  ) {
    super(prisma);
  }

  protected async processJob(data: CancelEventPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, event_id } = data;

    // ─── 1. Fetch event with participants and conference time slots ──────────

    const event = await tx.engagementEvent.findFirst({
      where: { tenant_id, id: event_id },
      select: {
        id: true,
        title: true,
        event_type: true,
        participants: {
          select: {
            id: true,
            student_id: true,
            invoice_id: true,
            payment_status: true,
            student: {
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
            },
          },
        },
        time_slots: {
          where: { status: { in: ['available', 'booked'] } },
          select: {
            id: true,
            status: true,
            booking: { select: { id: true } },
          },
        },
      },
    });

    if (!event) {
      throw new Error(`Event "${event_id}" not found for tenant ${tenant_id}`);
    }

    let notifiedCount = 0;
    let voidedCount = 0;

    // ─── 2. Notify participants and collect user IDs for batch dispatch ──────

    const recipientUserIds: string[] = [];

    for (const participant of event.participants) {
      const recipientUserId =
        participant.student?.household?.household_parents?.[0]?.parent?.user_id;

      if (recipientUserId) {
        recipientUserIds.push(recipientUserId);
        notifiedCount++;
      }

      // ─── 3. Void unpaid invoices ──────────────────────────────────────────

      if (participant.invoice_id && participant.payment_status !== 'paid') {
        await tx.invoice.update({
          where: { id: participant.invoice_id },
          data: { status: 'void' },
        });
        voidedCount++;
      }

      // ─── 4. Update participant status to withdrawn ────────────────────────

      await tx.engagementEventParticipant.update({
        where: { id: participant.id },
        data: {
          status: 'withdrawn',
          withdrawn_at: new Date(),
        },
      });
    }

    // ─── 5. Release conference time slots ───────────────────────────────────

    if (event.event_type === 'parent_conference' && event.time_slots.length > 0) {
      const bookingIds: string[] = [];

      for (const slot of event.time_slots) {
        if (slot.status === 'booked' && slot.booking) {
          bookingIds.push(slot.booking.id);
        }
      }

      // Delete bookings for booked slots
      if (bookingIds.length > 0) {
        await tx.conferenceBooking.deleteMany({
          where: {
            id: { in: bookingIds },
            tenant_id,
          },
        });
      }

      // Mark all event time slots as cancelled
      const allSlotIds = event.time_slots.map((s: { id: string }) => s.id);
      if (allSlotIds.length > 0) {
        await tx.conferenceTimeSlot.updateMany({
          where: {
            id: { in: allSlotIds },
            tenant_id,
          },
          data: { status: 'cancelled' },
        });
      }

      this.logger.log(
        `Released ${allSlotIds.length} conference slots (${bookingIds.length} bookings deleted) for event ${event_id}`,
      );
    }

    // ─── 6. Enqueue notification dispatch ───────────────────────────────────

    if (recipientUserIds.length > 0) {
      await this.notificationsQueue.add(
        'notifications:dispatch',
        {
          tenant_id,
          type: 'event_cancelled',
          event_id,
          event_title: event.title,
          recipient_user_ids: recipientUserIds,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
      );
    }

    this.logger.log(
      `Cancelled event ${event_id}: ${notifiedCount} notified, ${voidedCount} invoices voided`,
    );
  }
}
