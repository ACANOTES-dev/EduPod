import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';

import type { EventTargetConfig } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

type EventTargetType = 'whole_school' | 'year_group' | 'class_group' | 'custom';

interface ListParticipantsQuery {
  page: number;
  pageSize: number;
  status?: string;
  consent_status?: string;
  payment_status?: string;
}

interface UpdateParticipantDto {
  status?: string;
  consent_status?: string;
  payment_status?: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class EventParticipantsService {
  private readonly logger = new Logger(EventParticipantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  // ─── Target Resolution ──────────────────────────────────────────────────

  async resolveTargetStudents(
    tenantId: string,
    targetType: EventTargetType,
    targetConfigJson: EventTargetConfig | null,
  ): Promise<string[]> {
    switch (targetType) {
      case 'whole_school': {
        const students = await this.prisma.student.findMany({
          where: { tenant_id: tenantId, status: 'active' },
          select: { id: true },
        });
        return students.map((s) => s.id);
      }

      case 'year_group': {
        const yearGroupIds = targetConfigJson?.year_group_ids;
        if (!yearGroupIds?.length) {
          throw new BadRequestException({
            code: 'MISSING_TARGET_CONFIG',
            message: 'year_group_ids required for year_group target type',
          });
        }
        const students = await this.prisma.student.findMany({
          where: {
            tenant_id: tenantId,
            status: 'active',
            class_enrolments: {
              some: {
                class_entity: { year_group_id: { in: yearGroupIds } },
                status: 'active',
              },
            },
          },
          select: { id: true },
        });
        return students.map((s) => s.id);
      }

      case 'class_group': {
        const classIds = targetConfigJson?.class_ids;
        if (!classIds?.length) {
          throw new BadRequestException({
            code: 'MISSING_TARGET_CONFIG',
            message: 'class_ids required for class_group target type',
          });
        }
        const students = await this.prisma.student.findMany({
          where: {
            tenant_id: tenantId,
            status: 'active',
            class_enrolments: {
              some: {
                class_id: { in: classIds },
                status: 'active',
              },
            },
          },
          select: { id: true },
        });
        return students.map((s) => s.id);
      }

      case 'custom': {
        const studentIds = targetConfigJson?.student_ids;
        if (!studentIds?.length) {
          throw new BadRequestException({
            code: 'MISSING_TARGET_CONFIG',
            message: 'student_ids required for custom target type',
          });
        }
        return studentIds;
      }

      default:
        throw new BadRequestException({
          code: 'INVALID_TARGET_TYPE',
          message: `Unknown target type: ${targetType as string}`,
        });
    }
  }

  // ─── Participant Creation ───────────────────────────────────────────────

  async createParticipantsForEvent(tenantId: string, eventId: string) {
    const event = await this.prisma.engagementEvent.findFirst({
      where: { id: eventId, tenant_id: tenantId },
    });

    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: `Event with id "${eventId}" not found`,
      });
    }

    const studentIds = await this.resolveTargetStudents(
      tenantId,
      event.target_type as EventTargetType,
      event.target_config_json as EventTargetConfig | null,
    );

    if (!studentIds.length) {
      this.logger.warn(`No students resolved for event ${eventId}`);
      return { created: 0 };
    }

    const hasFee = event.fee_amount && Number(event.fee_amount) > 0;
    const paymentStatus = hasFee ? 'pending' : 'not_required';

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;

      const result = await db.engagementEventParticipant.createMany({
        data: studentIds.map((student_id) => ({
          tenant_id: tenantId,
          event_id: eventId,
          student_id,
          status: 'invited' as const,
          consent_status: 'pending' as const,
          payment_status: paymentStatus,
        })),
        skipDuplicates: true,
      });

      this.logger.log(`Created ${result.count} participants for event ${eventId}`);
      return { created: result.count };
    });
  }

  // ─── Participant Queries ────────────────────────────────────────────────

  async findAllForEvent(tenantId: string, eventId: string, filters: ListParticipantsQuery) {
    const { page, pageSize, status, consent_status, payment_status } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      event_id: eventId,
    };
    if (status) where.status = status;
    if (consent_status) where.consent_status = consent_status;
    if (payment_status) where.payment_status = payment_status;

    const [data, total] = await Promise.all([
      this.prisma.engagementEventParticipant.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              class_enrolments: {
                where: { status: 'active' },
                take: 1,
                select: {
                  class_entity: {
                    select: {
                      id: true,
                      name: true,
                      year_group: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.engagementEventParticipant.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Participant Updates ────────────────────────────────────────────────

  async updateParticipant(
    tenantId: string,
    eventId: string,
    participantId: string,
    dto: UpdateParticipantDto,
  ) {
    const existing = await this.prisma.engagementEventParticipant.findFirst({
      where: { id: participantId, event_id: eventId, tenant_id: tenantId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'PARTICIPANT_NOT_FOUND',
        message: `Participant with id "${participantId}" not found`,
      });
    }

    const updateData: Record<string, unknown> = {};
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.consent_status !== undefined) updateData.consent_status = dto.consent_status;
    if (dto.payment_status !== undefined) updateData.payment_status = dto.payment_status;

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;
      return db.engagementEventParticipant.update({
        where: { id: participantId },
        data: updateData,
      });
    });
  }

  // ─── Registration ─────────────────────────────────────────────────────────

  async register(tenantId: string, eventId: string, studentId: string, _userId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;

      // Lock event row for capacity check
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- SELECT FOR UPDATE within RLS transaction
      const events = await db.$queryRaw<{ id: string; capacity: number | null; status: string }[]>`
        SELECT id, capacity, status FROM engagement_events
        WHERE id = ${eventId}::uuid AND tenant_id = ${tenantId}::uuid
        FOR UPDATE
      `;

      const event = events[0];
      if (!event) {
        throw new NotFoundException({
          code: 'EVENT_NOT_FOUND',
          message: `Event with id "${eventId}" not found`,
        });
      }

      if (event.status !== 'open') {
        throw new BadRequestException({
          code: 'EVENT_NOT_OPEN',
          message: 'Can only register for open events',
        });
      }

      // Check capacity
      if (event.capacity !== null) {
        const capacityUsed = await db.engagementEventParticipant.count({
          where: {
            event_id: eventId,
            tenant_id: tenantId,
            status: {
              in: [
                'registered',
                'consent_pending',
                'consent_granted',
                'payment_pending',
                'confirmed',
                'attended',
              ],
            },
          },
        });

        if (capacityUsed >= event.capacity) {
          throw new ConflictException({
            code: 'EVENT_FULL',
            message: 'Event has reached maximum capacity',
          });
        }
      }

      // Check for existing participant record
      const existing = await db.engagementEventParticipant.findFirst({
        where: { event_id: eventId, student_id: studentId, tenant_id: tenantId },
      });

      if (existing) {
        if (existing.status === 'withdrawn') {
          // Re-register withdrawn participant
          return db.engagementEventParticipant.update({
            where: { id: existing.id },
            data: {
              status: 'registered',
              registered_at: new Date(),
              withdrawn_at: null,
            },
          });
        }

        // Update existing invited participant to registered
        return db.engagementEventParticipant.update({
          where: { id: existing.id },
          data: {
            status: 'registered',
            registered_at: new Date(),
          },
        });
      }

      // Create new participant
      return db.engagementEventParticipant.create({
        data: {
          tenant_id: tenantId,
          event_id: eventId,
          student_id: studentId,
          status: 'registered',
          consent_status: 'pending',
          payment_status: 'not_required',
          registered_at: new Date(),
        },
      });
    });
  }

  // ─── Withdrawal ───────────────────────────────────────────────────────────

  async withdraw(tenantId: string, eventId: string, studentId: string) {
    const participant = await this.prisma.engagementEventParticipant.findFirst({
      where: { event_id: eventId, student_id: studentId, tenant_id: tenantId },
    });

    if (!participant) {
      throw new NotFoundException({
        code: 'PARTICIPANT_NOT_FOUND',
        message: 'Participant not found for this event',
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;
      return db.engagementEventParticipant.update({
        where: { id: participant.id },
        data: {
          status: 'withdrawn',
          withdrawn_at: new Date(),
        },
      });
    });
  }

  // ─── Reminders ────────────────────────────────────────────────────────────

  async remindOutstanding(tenantId: string, eventId: string) {
    const event = await this.prisma.engagementEvent.findFirst({
      where: { id: eventId, tenant_id: tenantId },
    });

    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: `Event with id "${eventId}" not found`,
      });
    }

    // Find participants with pending consent or payment
    const pendingParticipants = await this.prisma.engagementEventParticipant.findMany({
      where: {
        event_id: eventId,
        tenant_id: tenantId,
        OR: [{ consent_status: 'pending' }, { payment_status: 'pending' }],
      },
      select: {
        student_id: true,
        student: {
          select: {
            student_parents: {
              select: {
                parent: { select: { user_id: true } },
              },
            },
          },
        },
      },
    });

    // Collect unique parent user IDs
    const parentUserIds = new Set<string>();
    for (const p of pendingParticipants) {
      for (const sp of p.student.student_parents) {
        if (sp.parent.user_id) {
          parentUserIds.add(sp.parent.user_id);
        }
      }
    }

    if (parentUserIds.size === 0) {
      return { reminded: 0 };
    }

    await this.notificationsQueue.add('notifications:dispatch', {
      tenant_id: tenantId,
      type: 'engagement_reminder',
      recipient_ids: [...parentUserIds],
      payload: { event_id: eventId, event_title: event.title },
    });

    this.logger.log(`Enqueued reminders for ${parentUserIds.size} parents for event ${eventId}`);

    return { reminded: parentUserIds.size };
  }
}
