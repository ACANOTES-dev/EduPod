import { Injectable, NotFoundException } from '@nestjs/common';

import type { SetInvigilatorPoolDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InvigilatorPoolMember {
  staff_profile_id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string | null;
}

@Injectable()
export class ExamInvigilatorPoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── Get pool ──────────────────────────────────────────────────────────────

  async getPool(tenantId: string, sessionId: string): Promise<InvigilatorPoolMember[]> {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }

    const rows = await this.prisma.examInvigilatorPool.findMany({
      where: { tenant_id: tenantId, exam_session_id: sessionId },
      include: {
        staff_profile: {
          select: {
            id: true,
            job_title: true,
            user: { select: { first_name: true, last_name: true, email: true } },
          },
        },
      },
    });

    return rows.map((r) => ({
      staff_profile_id: r.staff_profile.id,
      first_name: r.staff_profile.user.first_name,
      last_name: r.staff_profile.user.last_name,
      email: r.staff_profile.user.email,
      job_title: r.staff_profile.job_title,
    }));
  }

  // ─── Replace entire pool ───────────────────────────────────────────────────

  async setPool(
    tenantId: string,
    sessionId: string,
    dto: SetInvigilatorPoolDto,
  ): Promise<{ count: number }> {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }

    const uniqueIds = Array.from(new Set(dto.staff_profile_ids));

    if (uniqueIds.length > 0) {
      const valid = await this.staffProfileReadFacade.findByIds(tenantId, uniqueIds);
      if (valid.length !== uniqueIds.length) {
        throw new NotFoundException({
          error: {
            code: 'STAFF_PROFILE_NOT_FOUND',
            message: 'One or more staff profile ids do not exist in this tenant',
          },
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.examInvigilatorPool.deleteMany({
        where: { tenant_id: tenantId, exam_session_id: sessionId },
      });

      for (const staffId of uniqueIds) {
        await db.examInvigilatorPool.create({
          data: {
            tenant_id: tenantId,
            exam_session_id: sessionId,
            staff_profile_id: staffId,
          },
        });
      }
    });

    return { count: uniqueIds.length };
  }
}
