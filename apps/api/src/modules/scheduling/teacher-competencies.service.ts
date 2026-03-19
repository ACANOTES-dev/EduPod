import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateTeacherCompetencyDto,
  BulkCreateTeacherCompetenciesDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

const INCLUDE_RELATIONS = {
  staff_profile: {
    select: {
      id: true,
      user: { select: { first_name: true, last_name: true } },
    },
  },
  subject: { select: { id: true, name: true } },
  year_group: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TeacherCompetenciesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── List All ──────────────────────────────────────────────────────────────

  async listAll(tenantId: string, academicYearId: string) {
    const data = await this.prisma.teacherCompetency.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      include: INCLUDE_RELATIONS,
      orderBy: [{ staff_profile_id: 'asc' }, { subject_id: 'asc' }],
    });
    return { data };
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: { is_primary?: boolean }) {
    const existing = await this.prisma.teacherCompetency.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Teacher competency not found' });
    }
    return this.prisma.teacherCompetency.update({
      where: { id },
      data: { is_primary: dto.is_primary },
      include: INCLUDE_RELATIONS,
    });
  }

  // ─── List by Teacher ───────────────────────────────────────────────────────

  async listByTeacher(
    tenantId: string,
    academicYearId: string,
    staffProfileId: string,
  ) {
    const data = await this.prisma.teacherCompetency.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        staff_profile_id: staffProfileId,
      },
      include: INCLUDE_RELATIONS,
      orderBy: [{ subject_id: 'asc' }, { year_group_id: 'asc' }],
    });

    return { data };
  }

  // ─── List by Subject + Year Group ─────────────────────────────────────────

  async listBySubjectYear(
    tenantId: string,
    academicYearId: string,
    subjectId: string,
    yearGroupId: string,
  ) {
    const data = await this.prisma.teacherCompetency.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        subject_id: subjectId,
        year_group_id: yearGroupId,
      },
      include: INCLUDE_RELATIONS,
      orderBy: { is_primary: 'desc' },
    });

    return { data };
  }

  // ─── Create Single ─────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateTeacherCompetencyDto) {
    await this.validateRelations(
      tenantId,
      dto.staff_profile_id,
      dto.subject_id,
      dto.year_group_id,
      dto.academic_year_id,
    );

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const record = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.teacherCompetency.create({
        data: {
          tenant_id: tenantId,
          academic_year_id: dto.academic_year_id,
          staff_profile_id: dto.staff_profile_id,
          subject_id: dto.subject_id,
          year_group_id: dto.year_group_id,
          is_primary: dto.is_primary,
        },
        include: INCLUDE_RELATIONS,
      });
    });

    return record;
  }

  // ─── Bulk Create ───────────────────────────────────────────────────────────

  async bulkCreate(tenantId: string, dto: BulkCreateTeacherCompetenciesDto) {
    // Validate staff profile exists
    const staff = await this.prisma.staffProfile.findFirst({
      where: { id: dto.staff_profile_id, tenant_id: tenantId },
      select: { id: true },
    });
    if (!staff) {
      throw new NotFoundException({
        code: 'STAFF_PROFILE_NOT_FOUND',
        message: `Staff profile "${dto.staff_profile_id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const created = [];
      for (const comp of dto.competencies) {
        const record = await db.teacherCompetency.create({
          data: {
            tenant_id: tenantId,
            academic_year_id: dto.academic_year_id,
            staff_profile_id: dto.staff_profile_id,
            subject_id: comp.subject_id,
            year_group_id: comp.year_group_id,
            is_primary: comp.is_primary,
          },
          include: INCLUDE_RELATIONS,
        });
        created.push(record);
      }

      return created;
    }) as unknown as Record<string, unknown>[];

    return { data: result, meta: { created: result.length } };
  }

  // ─── Delete Single ─────────────────────────────────────────────────────────

  async delete(tenantId: string, id: string) {
    const existing = await this.prisma.teacherCompetency.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'TEACHER_COMPETENCY_NOT_FOUND',
        message: `Teacher competency "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.teacherCompetency.delete({ where: { id } });
    });

    return { message: 'Teacher competency deleted' };
  }

  // ─── Delete All for Teacher ────────────────────────────────────────────────

  async deleteAllForTeacher(
    tenantId: string,
    academicYearId: string,
    staffProfileId: string,
  ) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.teacherCompetency.deleteMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          staff_profile_id: staffProfileId,
        },
      });
    }) as unknown as { count: number };

    return { message: 'All competencies deleted', meta: { deleted: result.count } };
  }

  // ─── Copy from Academic Year ───────────────────────────────────────────────

  async copyFromAcademicYear(
    tenantId: string,
    sourceYearId: string,
    targetYearId: string,
  ) {
    const [sourceYear, targetYear] = await Promise.all([
      this.prisma.academicYear.findFirst({
        where: { id: sourceYearId, tenant_id: tenantId },
        select: { id: true },
      }),
      this.prisma.academicYear.findFirst({
        where: { id: targetYearId, tenant_id: tenantId },
        select: { id: true },
      }),
    ]);

    if (!sourceYear) {
      throw new NotFoundException({
        code: 'SOURCE_ACADEMIC_YEAR_NOT_FOUND',
        message: `Source academic year "${sourceYearId}" not found`,
      });
    }
    if (!targetYear) {
      throw new NotFoundException({
        code: 'TARGET_ACADEMIC_YEAR_NOT_FOUND',
        message: `Target academic year "${targetYearId}" not found`,
      });
    }

    const sourceRecords = await this.prisma.teacherCompetency.findMany({
      where: { tenant_id: tenantId, academic_year_id: sourceYearId },
    });

    if (sourceRecords.length === 0) {
      throw new BadRequestException({
        code: 'NO_SOURCE_DATA',
        message: 'No teacher competencies found in the source academic year',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const created = [];
      for (const src of sourceRecords) {
        const record = await db.teacherCompetency.create({
          data: {
            tenant_id: tenantId,
            academic_year_id: targetYearId,
            staff_profile_id: src.staff_profile_id,
            subject_id: src.subject_id,
            year_group_id: src.year_group_id,
            is_primary: src.is_primary,
          },
        });
        created.push(record);
      }

      return created;
    }) as unknown as Record<string, unknown>[];

    return { data: result, meta: { copied: result.length } };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async validateRelations(
    tenantId: string,
    staffProfileId: string,
    subjectId: string,
    yearGroupId: string,
    academicYearId: string,
  ) {
    const [staff, subject, yearGroup, academicYear] = await Promise.all([
      this.prisma.staffProfile.findFirst({
        where: { id: staffProfileId, tenant_id: tenantId },
        select: { id: true },
      }),
      this.prisma.subject.findFirst({
        where: { id: subjectId, tenant_id: tenantId },
        select: { id: true },
      }),
      this.prisma.yearGroup.findFirst({
        where: { id: yearGroupId, tenant_id: tenantId },
        select: { id: true },
      }),
      this.prisma.academicYear.findFirst({
        where: { id: academicYearId, tenant_id: tenantId },
        select: { id: true },
      }),
    ]);

    if (!staff) {
      throw new NotFoundException({
        code: 'STAFF_PROFILE_NOT_FOUND',
        message: `Staff profile "${staffProfileId}" not found`,
      });
    }
    if (!subject) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: `Subject "${subjectId}" not found`,
      });
    }
    if (!yearGroup) {
      throw new NotFoundException({
        code: 'YEAR_GROUP_NOT_FOUND',
        message: `Year group "${yearGroupId}" not found`,
      });
    }
    if (!academicYear) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year "${academicYearId}" not found`,
      });
    }
  }
}
