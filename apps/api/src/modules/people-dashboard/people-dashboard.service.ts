import { Injectable } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Result shape ─────────────────────────────────────────────────────────────

export interface PeopleDashboardSummary {
  counts: {
    students_active: number;
    students_total: number;
    staff_active: number;
    staff_total: number;
    households_active: number;
    households_total: number;
  };
  student_teacher_ratio: number | null;
  year_group_enrollment: Array<{
    year_group_id: string;
    year_group_name: string;
    student_count: number;
    class_count: number;
  }>;
  class_enrollment: Array<{
    class_id: string;
    class_name: string;
    year_group_name: string | null;
    student_count: number;
    max_capacity: number;
  }>;
  recent_students: Array<{
    id: string;
    full_name: string;
    student_number: string | null;
    status: string;
    year_group_name: string | null;
    created_at: Date;
  }>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PeopleDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId: string): Promise<PeopleDashboardSummary> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // ── Parallel counts ──────────────────────────────────────────────
      const [
        studentsActive,
        studentsTotal,
        staffActive,
        staffTotal,
        householdsActive,
        householdsTotal,
        activeAcademicYear,
        recentStudents,
      ] = await Promise.all([
        db.student.count({ where: { tenant_id: tenantId, status: 'active' } }),
        db.student.count({ where: { tenant_id: tenantId } }),
        db.staffProfile.count({ where: { tenant_id: tenantId, employment_status: 'active' } }),
        db.staffProfile.count({ where: { tenant_id: tenantId } }),
        db.household.count({ where: { tenant_id: tenantId, status: 'active' } }),
        db.household.count({ where: { tenant_id: tenantId } }),
        db.academicYear.findFirst({
          where: { tenant_id: tenantId, status: 'active' },
          select: { id: true },
        }),
        db.student.findMany({
          where: { tenant_id: tenantId },
          orderBy: { created_at: 'desc' },
          take: 5,
          select: {
            id: true,
            full_name: true,
            student_number: true,
            status: true,
            created_at: true,
            year_group: { select: { name: true } },
          },
        }),
      ]);

      // ── Student-teacher ratio ────────────────────────────────────────
      const studentTeacherRatio =
        staffActive > 0 ? Math.round((studentsActive / staffActive) * 10) / 10 : null;

      // ── Year group enrollment ────────────────────────────────────────
      const yearGroups = await db.yearGroup.findMany({
        where: { tenant_id: tenantId },
        orderBy: { display_order: 'asc' },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              students: { where: { status: 'active' } },
              classes: activeAcademicYear
                ? { where: { academic_year_id: activeAcademicYear.id, status: 'active' } }
                : undefined,
            },
          },
        },
      });

      const yearGroupEnrollment = yearGroups.map((yg) => ({
        year_group_id: yg.id,
        year_group_name: yg.name,
        student_count: yg._count.students,
        class_count: yg._count.classes,
      }));

      // ── Class enrollment (active academic year only) ─────────────────
      let classEnrollment: PeopleDashboardSummary['class_enrollment'] = [];
      if (activeAcademicYear) {
        const classes = await db.class.findMany({
          where: {
            tenant_id: tenantId,
            academic_year_id: activeAcademicYear.id,
            status: 'active',
          },
          orderBy: [{ year_group: { display_order: 'asc' } }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            max_capacity: true,
            year_group: { select: { name: true } },
            _count: {
              select: {
                class_enrolments: { where: { status: 'active' } },
              },
            },
          },
        });

        classEnrollment = classes.map((c) => ({
          class_id: c.id,
          class_name: c.name,
          year_group_name: c.year_group?.name ?? null,
          student_count: c._count.class_enrolments,
          max_capacity: c.max_capacity,
        }));
      }

      return {
        counts: {
          students_active: studentsActive,
          students_total: studentsTotal,
          staff_active: staffActive,
          staff_total: staffTotal,
          households_active: householdsActive,
          households_total: householdsTotal,
        },
        student_teacher_ratio: studentTeacherRatio,
        year_group_enrollment: yearGroupEnrollment,
        class_enrollment: classEnrollment,
        recent_students: recentStudents.map((s) => ({
          id: s.id,
          full_name: s.full_name ?? '',
          student_number: s.student_number,
          status: s.status,
          year_group_name: s.year_group?.name ?? null,
          created_at: s.created_at,
        })),
      };
    });
  }
}
