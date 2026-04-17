import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

export interface PublishResult {
  id: string;
  status: 'published';
  published_at: string;
  slot_count: number;
}

@Injectable()
export class ExamPublishService {
  private readonly logger = new Logger(ExamPublishService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Publish ──────────────────────────────────────────────────────────────

  async publishSession(
    tenantId: string,
    sessionId: string,
    _actorUserId: string,
  ): Promise<PublishResult> {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      include: { _count: { select: { exam_slots: true } } },
    });
    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }
    if (session.status !== 'planning') {
      throw new BadRequestException({
        error: {
          code: 'SESSION_NOT_PLANNING',
          message: `Cannot publish a session in status "${session.status}"`,
        },
      });
    }
    if (session._count.exam_slots === 0) {
      throw new BadRequestException({
        error: {
          code: 'NO_SLOTS_GENERATED',
          message: 'Generate a schedule before publishing',
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.examSession.update({
        where: { id: sessionId },
        data: { status: 'published' },
      });
    });

    this.logger.log(`Published exam session ${sessionId} with ${session._count.exam_slots} slots`);

    return {
      id: sessionId,
      status: 'published',
      published_at: new Date().toISOString(),
      slot_count: session._count.exam_slots,
    };
  }

  // ─── Check if a date is in a published session window (for My Timetable) ──

  async hasActiveExamSession(tenantId: string, date: Date): Promise<boolean> {
    const session = await this.prisma.examSession.findFirst({
      where: {
        tenant_id: tenantId,
        status: 'published',
        start_date: { lte: date },
        end_date: { gte: date },
      },
      select: { id: true },
    });
    return session !== null;
  }
}
