import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type {
  BulkClassRequirementsDto,
  CreateClassRequirementDto,
  UpdateClassRequirementDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';
import { SchedulingReadFacade } from '../scheduling/scheduling-read.facade';

interface PaginationParams {
  page: number;
  pageSize: number;
}

@Injectable()
export class ClassRequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulingReadFacade: SchedulingReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly roomsReadFacade: RoomsReadFacade,
  ) {}

  async findAll(tenantId: string, academicYearId: string, pagination: PaginationParams) {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const _where: Prisma.ClassSchedulingRequirementWhereInput = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
    };

    const { data, total } = await this.schedulingReadFacade.findClassRequirementsPaginated(
      tenantId,
      academicYearId,
      { skip, take: pageSize },
    );

    // Count total active classes for this academic year (to show configured vs total)
    const totalActiveClasses = await this.classesReadFacade.countByAcademicYear(
      tenantId,
      academicYearId,
      { status: 'active' },
    );

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        total_active_classes: totalActiveClasses,
        configured_count: total,
      },
    };
  }

  async create(tenantId: string, dto: CreateClassRequirementDto) {
    // Validate class exists and belongs to tenant
    await this.classesReadFacade.existsOrThrow(tenantId, dto.class_id);

    // Validate preferred_room exists if provided
    if (dto.preferred_room_id) {
      await this.roomsReadFacade.existsOrThrow(tenantId, dto.preferred_room_id);
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        return db.classSchedulingRequirement.create({
          data: {
            tenant_id: tenantId,
            class_id: dto.class_id,
            academic_year_id: dto.academic_year_id,
            periods_per_week: dto.periods_per_week ?? 5,
            required_room_type: dto.required_room_type ?? null,
            preferred_room_id: dto.preferred_room_id ?? null,
            max_consecutive_periods: dto.max_consecutive_periods ?? 2,
            min_consecutive_periods: dto.min_consecutive_periods ?? 1,
            spread_preference: dto.spread_preference ?? 'spread_evenly',
            student_count: dto.student_count ?? null,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'REQUIREMENT_ALREADY_EXISTS',
          message: `Scheduling requirement already exists for class "${dto.class_id}" in this academic year`,
        });
      }
      throw err;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateClassRequirementDto) {
    await this.assertExists(tenantId, id);

    // Validate preferred_room exists if provided
    if (dto.preferred_room_id) {
      await this.roomsReadFacade.existsOrThrow(tenantId, dto.preferred_room_id);
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const updateData: Prisma.ClassSchedulingRequirementUpdateInput = {};
      if (dto.periods_per_week !== undefined) updateData.periods_per_week = dto.periods_per_week;
      if (dto.required_room_type !== undefined)
        updateData.required_room_type = dto.required_room_type;
      if (dto.preferred_room_id !== undefined) {
        updateData.preferred_room = dto.preferred_room_id
          ? { connect: { id: dto.preferred_room_id } }
          : { disconnect: true };
      }
      if (dto.max_consecutive_periods !== undefined)
        updateData.max_consecutive_periods = dto.max_consecutive_periods;
      if (dto.min_consecutive_periods !== undefined)
        updateData.min_consecutive_periods = dto.min_consecutive_periods;
      if (dto.spread_preference !== undefined) updateData.spread_preference = dto.spread_preference;
      if (dto.student_count !== undefined) updateData.student_count = dto.student_count;

      return db.classSchedulingRequirement.update({
        where: { id },
        data: updateData,
      });
    });
  }

  async delete(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.classSchedulingRequirement.delete({ where: { id } });
    });
  }

  async bulkUpsert(tenantId: string, dto: BulkClassRequirementsDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const results = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const upserted: unknown[] = [];

      for (const entry of dto.requirements) {
        const result = await db.classSchedulingRequirement.upsert({
          where: {
            idx_class_sched_req_unique: {
              tenant_id: tenantId,
              class_id: entry.class_id,
              academic_year_id: dto.academic_year_id,
            },
          },
          update: {
            periods_per_week: entry.periods_per_week ?? 5,
            required_room_type: entry.required_room_type ?? null,
            preferred_room_id: entry.preferred_room_id ?? null,
            max_consecutive_periods: entry.max_consecutive_periods ?? 2,
            min_consecutive_periods: entry.min_consecutive_periods ?? 1,
            spread_preference: entry.spread_preference ?? 'spread_evenly',
            student_count: entry.student_count ?? null,
          },
          create: {
            tenant_id: tenantId,
            class_id: entry.class_id,
            academic_year_id: dto.academic_year_id,
            periods_per_week: entry.periods_per_week ?? 5,
            required_room_type: entry.required_room_type ?? null,
            preferred_room_id: entry.preferred_room_id ?? null,
            max_consecutive_periods: entry.max_consecutive_periods ?? 2,
            min_consecutive_periods: entry.min_consecutive_periods ?? 1,
            spread_preference: entry.spread_preference ?? 'spread_evenly',
            student_count: entry.student_count ?? null,
          },
        });
        upserted.push(result);
      }

      return upserted;
    })) as unknown[];

    return { data: results, count: results.length };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async assertExists(tenantId: string, id: string) {
    const req = await this.schedulingReadFacade.findClassRequirementById(tenantId, id);

    if (!req) {
      throw new NotFoundException({
        code: 'REQUIREMENT_NOT_FOUND',
        message: `Class scheduling requirement with id "${id}" not found`,
      });
    }

    return req;
  }
}
