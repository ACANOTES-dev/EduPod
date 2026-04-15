import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type {
  BulkClassSubjectRequirementsDto,
  CreateClassSubjectRequirementDto,
  ListClassSubjectRequirementsQuery,
  UpdateClassSubjectRequirementDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';

/**
 * CRUD + bulk upsert for `class_subject_requirements` — the per-(class, subject)
 * override layer on top of year-group curriculum. See SCHED-023.
 *
 * The service deliberately does NOT validate that the (class, subject) pair
 * makes sense against the year-group curriculum — whether a mismatch is
 * allowed depends on the tenant setting
 * `scheduling.strict_class_subject_override`, which is enforced at the
 * scheduling-run pre-flight stage so admins can author overrides freely and
 * the orchestration layer fails the solve if policy demands strictness.
 */
@Injectable()
export class ClassSubjectRequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly roomsReadFacade: RoomsReadFacade,
  ) {}

  // ─── List ────────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: ListClassSubjectRequirementsQuery) {
    const { academic_year_id, class_id, subject_id, page, pageSize } = query;

    const where: Prisma.ClassSubjectRequirementWhereInput = {
      tenant_id: tenantId,
      academic_year_id,
    };
    if (class_id) where.class_id = class_id;
    if (subject_id) where.subject_id = subject_id;

    const [data, total] = await Promise.all([
      this.prisma.classSubjectRequirement.findMany({
        where,
        orderBy: [{ class_id: 'asc' }, { subject_id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: this.defaultSelect(),
      }),
      this.prisma.classSubjectRequirement.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── Create ──────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateClassSubjectRequirementDto) {
    await this.classesReadFacade.existsOrThrow(tenantId, dto.class_id);
    if (dto.preferred_room_id) {
      await this.roomsReadFacade.existsOrThrow(tenantId, dto.preferred_room_id);
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        return db.classSubjectRequirement.create({
          data: {
            tenant_id: tenantId,
            academic_year_id: dto.academic_year_id,
            class_id: dto.class_id,
            subject_id: dto.subject_id,
            periods_per_week: dto.periods_per_week,
            max_periods_per_day: dto.max_periods_per_day ?? null,
            preferred_room_id: dto.preferred_room_id ?? null,
            required_room_type: dto.required_room_type ?? null,
            requires_double_period: dto.requires_double_period ?? false,
            double_period_count: dto.double_period_count ?? null,
            notes: dto.notes ?? null,
          },
          select: this.defaultSelect(),
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'CLASS_SUBJECT_REQUIREMENT_EXISTS',
          message: `Override already exists for class "${dto.class_id}" and subject "${dto.subject_id}" in this academic year`,
        });
      }
      throw err;
    }
  }

  // ─── Update ──────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateClassSubjectRequirementDto) {
    await this.assertExists(tenantId, id);
    if (dto.preferred_room_id) {
      await this.roomsReadFacade.existsOrThrow(tenantId, dto.preferred_room_id);
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const updateData: Prisma.ClassSubjectRequirementUpdateInput = {};
      if (dto.periods_per_week !== undefined) updateData.periods_per_week = dto.periods_per_week;
      if (dto.max_periods_per_day !== undefined)
        updateData.max_periods_per_day = dto.max_periods_per_day;
      if (dto.preferred_room_id !== undefined) {
        updateData.preferred_room = dto.preferred_room_id
          ? { connect: { id: dto.preferred_room_id } }
          : { disconnect: true };
      }
      if (dto.required_room_type !== undefined)
        updateData.required_room_type = dto.required_room_type;
      if (dto.requires_double_period !== undefined)
        updateData.requires_double_period = dto.requires_double_period;
      if (dto.double_period_count !== undefined)
        updateData.double_period_count = dto.double_period_count;
      if (dto.notes !== undefined) updateData.notes = dto.notes;

      return db.classSubjectRequirement.update({
        where: { id },
        data: updateData,
        select: this.defaultSelect(),
      });
    });
  }

  // ─── Delete ──────────────────────────────────────────────────────────────

  async delete(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.classSubjectRequirement.delete({ where: { id } });
    });
  }

  // ─── Bulk upsert ─────────────────────────────────────────────────────────

  async bulkUpsert(tenantId: string, dto: BulkClassSubjectRequirementsDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const results = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const upserted: unknown[] = [];
      for (const entry of dto.requirements) {
        const row = await db.classSubjectRequirement.upsert({
          where: {
            idx_class_subject_req_unique: {
              tenant_id: tenantId,
              academic_year_id: dto.academic_year_id,
              class_id: entry.class_id,
              subject_id: entry.subject_id,
            },
          },
          update: {
            periods_per_week: entry.periods_per_week,
            max_periods_per_day: entry.max_periods_per_day ?? null,
            preferred_room_id: entry.preferred_room_id ?? null,
            required_room_type: entry.required_room_type ?? null,
            requires_double_period: entry.requires_double_period ?? false,
            double_period_count: entry.double_period_count ?? null,
            notes: entry.notes ?? null,
          },
          create: {
            tenant_id: tenantId,
            academic_year_id: dto.academic_year_id,
            class_id: entry.class_id,
            subject_id: entry.subject_id,
            periods_per_week: entry.periods_per_week,
            max_periods_per_day: entry.max_periods_per_day ?? null,
            preferred_room_id: entry.preferred_room_id ?? null,
            required_room_type: entry.required_room_type ?? null,
            requires_double_period: entry.requires_double_period ?? false,
            double_period_count: entry.double_period_count ?? null,
            notes: entry.notes ?? null,
          },
          select: this.defaultSelect(),
        });
        upserted.push(row);
      }
      return upserted;
    })) as unknown[];

    return { data: results, count: results.length };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async assertExists(tenantId: string, id: string) {
    const row = await this.prisma.classSubjectRequirement.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'CLASS_SUBJECT_REQUIREMENT_NOT_FOUND',
        message: `Class-subject requirement "${id}" not found`,
      });
    }
    return row;
  }

  private defaultSelect() {
    return {
      id: true,
      tenant_id: true,
      academic_year_id: true,
      class_id: true,
      subject_id: true,
      periods_per_week: true,
      max_periods_per_day: true,
      preferred_room_id: true,
      required_room_type: true,
      requires_double_period: true,
      double_period_count: true,
      notes: true,
      created_at: true,
      updated_at: true,
    } satisfies Prisma.ClassSubjectRequirementSelect;
  }
}
