import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import type { UpsertTeacherSchedulingConfigDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

const INCLUDE_RELATIONS = {
  staff_profile: {
    select: {
      id: true,
      user: { select: { first_name: true, last_name: true } },
    },
  },
} as const;

@Injectable()
export class TeacherSchedulingConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── List ──────────────────────────────────────────────────────────────────

  async list(tenantId: string, academicYearId: string) {
    const data = await this.prisma.teacherSchedulingConfig.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      include: INCLUDE_RELATIONS,
      orderBy: { staff_profile_id: 'asc' },
    });

    return { data };
  }

  // ─── Upsert ────────────────────────────────────────────────────────────────

  async upsert(tenantId: string, dto: UpsertTeacherSchedulingConfigDto) {
    // Validate staff profile exists
    await this.staffProfileReadFacade.existsOrThrow(tenantId, dto.staff_profile_id);

    // Validate academic year
    await this.academicReadFacade.findYearByIdOrThrow(tenantId, dto.academic_year_id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Check if config already exists for this teacher + academic year
      const existing = await db.teacherSchedulingConfig.findFirst({
        where: {
          tenant_id: tenantId,
          staff_profile_id: dto.staff_profile_id,
          academic_year_id: dto.academic_year_id,
        },
        select: { id: true },
      });

      if (existing) {
        return db.teacherSchedulingConfig.update({
          where: { id: existing.id },
          data: {
            max_periods_per_week: dto.max_periods_per_week ?? null,
            max_periods_per_day: dto.max_periods_per_day ?? null,
            max_supervision_duties_per_week: dto.max_supervision_duties_per_week ?? null,
          },
          include: INCLUDE_RELATIONS,
        });
      }

      return db.teacherSchedulingConfig.create({
        data: {
          tenant_id: tenantId,
          staff_profile_id: dto.staff_profile_id,
          academic_year_id: dto.academic_year_id,
          max_periods_per_week: dto.max_periods_per_week ?? null,
          max_periods_per_day: dto.max_periods_per_day ?? null,
          max_supervision_duties_per_week: dto.max_supervision_duties_per_week ?? null,
        },
        include: INCLUDE_RELATIONS,
      });
    });

    return result;
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async delete(tenantId: string, id: string) {
    const existing = await this.prisma.teacherSchedulingConfig.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'TEACHER_SCHEDULING_CONFIG_NOT_FOUND',
        message: `Teacher scheduling config "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.teacherSchedulingConfig.delete({ where: { id } });
    });

    return { message: 'Teacher scheduling config deleted' };
  }

  // ─── Copy from Academic Year ───────────────────────────────────────────────

  async copyFromAcademicYear(tenantId: string, sourceYearId: string, targetYearId: string) {
    await this.academicReadFacade.findYearByIdOrThrow(tenantId, sourceYearId);
    await this.academicReadFacade.findYearByIdOrThrow(tenantId, targetYearId);

    const sourceRecords = await this.prisma.teacherSchedulingConfig.findMany({
      where: { tenant_id: tenantId, academic_year_id: sourceYearId },
    });

    if (sourceRecords.length === 0) {
      throw new BadRequestException({
        code: 'NO_SOURCE_DATA',
        message: 'No teacher scheduling configs found in the source academic year',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const created = [];
      for (const src of sourceRecords) {
        const record = await db.teacherSchedulingConfig.create({
          data: {
            tenant_id: tenantId,
            academic_year_id: targetYearId,
            staff_profile_id: src.staff_profile_id,
            max_periods_per_week: src.max_periods_per_week,
            max_periods_per_day: src.max_periods_per_day,
            max_supervision_duties_per_week: src.max_supervision_duties_per_week,
          },
        });
        created.push(record);
      }

      return created;
    })) as unknown as Record<string, unknown>[];

    return { data: result, meta: { copied: result.length } };
  }
}
