import { Injectable, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type { PromotionCommitDto } from './dto/promotion-commit.dto';

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface ProposedStudent {
  student_id: string;
  student_name: string;
  current_status: string;
  proposed_action: 'promote' | 'graduate' | 'hold_back';
  proposed_year_group_id: string | null;
  proposed_year_group_name: string | null;
}

export interface YearGroupGroup {
  year_group_id: string | null;
  year_group_name: string | null;
  next_year_group_id: string | null;
  next_year_group_name: string | null;
  students: ProposedStudent[];
}

export interface PreviewResponse {
  academic_year: { id: string; name: string };
  year_groups: YearGroupGroup[];
}

export interface CommitCounts {
  promoted: number;
  held_back: number;
  graduated: number;
  withdrawn: number;
  skipped: number;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class PromotionService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(tenantId: string, academicYearId: string): Promise<PreviewResponse> {
    // Load academic year — validate it exists and belongs to tenant
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: academicYearId, tenant_id: tenantId },
      select: { id: true, name: true },
    });

    if (!academicYear) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year with id "${academicYearId}" not found`,
      });
    }

    // Load all year groups for tenant, ordered by display_order
    const yearGroups = await this.prisma.yearGroup.findMany({
      where: { tenant_id: tenantId },
      orderBy: { display_order: 'asc' },
      include: {
        next_year_group: { select: { id: true, name: true } },
      },
    });

    // Build a lookup map
    const yearGroupMap = new Map(yearGroups.map((yg) => [yg.id, yg]));

    // Load all active students that have class enrolments in classes for this academic year
    const students = await this.prisma.student.findMany({
      where: {
        tenant_id: tenantId,
        status: 'active',
        class_enrolments: {
          some: {
            class_entity: { academic_year_id: academicYearId },
            status: 'active',
          },
        },
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        status: true,
        year_group_id: true,
      },
    });

    // Group students by year_group_id
    const grouped = new Map<string | null, typeof students>();

    for (const student of students) {
      const key = student.year_group_id ?? null;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(student);
    }

    // Build year_groups output
    const yearGroupsResult: YearGroupGroup[] = [];

    // Emit all year groups that have students (including null / no year_group)
    for (const [yg_id, yg_students] of grouped.entries()) {
      const yg = yg_id ? yearGroupMap.get(yg_id) : undefined;

      const proposedStudents: ProposedStudent[] = yg_students.map((s) => {
        let proposed_action: 'promote' | 'graduate' | 'hold_back';
        let proposed_year_group_id: string | null = null;
        let proposed_year_group_name: string | null = null;

        if (!yg) {
          // No year group assigned
          proposed_action = 'hold_back';
        } else if (yg.next_year_group_id) {
          proposed_action = 'promote';
          proposed_year_group_id = yg.next_year_group_id;
          proposed_year_group_name = yg.next_year_group?.name ?? null;
        } else {
          proposed_action = 'graduate';
        }

        return {
          student_id: s.id,
          student_name: `${s.first_name} ${s.last_name}`,
          current_status: s.status,
          proposed_action,
          proposed_year_group_id,
          proposed_year_group_name,
        };
      });

      yearGroupsResult.push({
        year_group_id: yg_id,
        year_group_name: yg?.name ?? null,
        next_year_group_id: yg?.next_year_group_id ?? null,
        next_year_group_name: yg?.next_year_group?.name ?? null,
        students: proposedStudents,
      });
    }

    return {
      academic_year: { id: academicYear.id, name: academicYear.name },
      year_groups: yearGroupsResult,
    };
  }

  async commit(tenantId: string, dto: PromotionCommitDto): Promise<CommitCounts> {
    // Validate academic year exists
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: dto.academic_year_id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!academicYear) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year with id "${dto.academic_year_id}" not found`,
      });
    }

    const counts: CommitCounts = {
      promoted: 0,
      held_back: 0,
      graduated: 0,
      withdrawn: 0,
      skipped: 0,
    };

    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      for (const action of dto.actions) {
        switch (action.action) {
          case 'promote': {
            await txClient.student.update({
              where: { id: action.student_id, tenant_id: tenantId },
              data: { year_group_id: action.target_year_group_id ?? null },
            });
            await txClient.classEnrolment.updateMany({
              where: {
                student_id: action.student_id,
                tenant_id: tenantId,
                status: 'active',
              },
              data: { status: 'dropped', end_date: todayDate },
            });
            counts.promoted++;
            break;
          }

          case 'hold_back': {
            // Keep year_group_id as-is, just drop active enrolments
            await txClient.classEnrolment.updateMany({
              where: {
                student_id: action.student_id,
                tenant_id: tenantId,
                status: 'active',
              },
              data: { status: 'dropped', end_date: todayDate },
            });
            counts.held_back++;
            break;
          }

          case 'skip': {
            await txClient.student.update({
              where: { id: action.student_id, tenant_id: tenantId },
              data: { year_group_id: action.target_year_group_id ?? null },
            });
            await txClient.classEnrolment.updateMany({
              where: {
                student_id: action.student_id,
                tenant_id: tenantId,
                status: 'active',
              },
              data: { status: 'dropped', end_date: todayDate },
            });
            counts.skipped++;
            break;
          }

          case 'graduate': {
            await txClient.student.update({
              where: { id: action.student_id, tenant_id: tenantId },
              data: { status: 'graduated', exit_date: todayDate },
            });
            await txClient.classEnrolment.updateMany({
              where: {
                student_id: action.student_id,
                tenant_id: tenantId,
                status: 'active',
              },
              data: { status: 'dropped', end_date: todayDate },
            });
            counts.graduated++;
            break;
          }

          case 'withdraw': {
            await txClient.student.update({
              where: { id: action.student_id, tenant_id: tenantId },
              data: { status: 'withdrawn', exit_date: todayDate },
            });
            await txClient.classEnrolment.updateMany({
              where: {
                student_id: action.student_id,
                tenant_id: tenantId,
                status: 'active',
              },
              data: { status: 'dropped', end_date: todayDate },
            });
            counts.withdrawn++;
            break;
          }
        }
      }
    });

    return counts;
  }
}
