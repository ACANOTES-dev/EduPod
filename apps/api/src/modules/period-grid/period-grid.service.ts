import { createHash } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CopyDayDto,
  CopyYearGroupDto,
  CreatePeriodTemplateDto,
  ReplaceDayDto,
  UpdatePeriodTemplateDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PeriodGridService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, academicYearId: string, yearGroupId?: string) {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
    };
    if (yearGroupId) {
      where['year_group_id'] = yearGroupId;
    }
    const data = await this.prisma.schedulePeriodTemplate.findMany({
      where,
      orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
    });

    return data.map((p) => this.formatPeriod(p));
  }

  async create(tenantId: string, dto: CreatePeriodTemplateDto) {
    // Validate end_time > start_time
    if (dto.start_time >= dto.end_time) {
      throw new BadRequestException({
        code: 'INVALID_TIME_RANGE',
        message: 'end_time must be after start_time',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      const result = await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        return db.schedulePeriodTemplate.create({
          data: {
            tenant_id: tenantId,
            academic_year_id: dto.academic_year_id,
            year_group_id: dto.year_group_id,
            weekday: dto.weekday,
            period_name: dto.period_name,
            period_name_ar: dto.period_name_ar ?? null,
            period_order: dto.period_order,
            start_time: this.timeToDate(dto.start_time),
            end_time: this.timeToDate(dto.end_time),
            schedule_period_type: dto.schedule_period_type ?? 'teaching',
            supervision_mode: dto.supervision_mode ?? 'none',
            break_group_id: dto.break_group_id ?? null,
          },
        });
      });

      return this.formatPeriod(result as Record<string, unknown>);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'PERIOD_TEMPLATE_CONFLICT',
          message: 'A period with the same order or start time already exists for this weekday',
        });
      }
      throw err;
    }
  }

  async update(tenantId: string, id: string, dto: UpdatePeriodTemplateDto) {
    const existing = await this.assertExists(tenantId, id);

    // If both times are provided, validate order
    const newStartTime = dto.start_time ?? this.formatTime(existing.start_time);
    const newEndTime = dto.end_time ?? this.formatTime(existing.end_time);

    if (newStartTime >= newEndTime) {
      throw new BadRequestException({
        code: 'INVALID_TIME_RANGE',
        message: 'end_time must be after start_time',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      const result = await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        const updateData: Prisma.SchedulePeriodTemplateUncheckedUpdateInput = {};
        if (dto.period_name !== undefined) updateData.period_name = dto.period_name;
        if (dto.period_name_ar !== undefined) updateData.period_name_ar = dto.period_name_ar;
        if (dto.period_order !== undefined) updateData.period_order = dto.period_order;
        if (dto.start_time !== undefined) updateData.start_time = this.timeToDate(dto.start_time);
        if (dto.end_time !== undefined) updateData.end_time = this.timeToDate(dto.end_time);
        if (dto.schedule_period_type !== undefined)
          updateData.schedule_period_type = dto.schedule_period_type;
        if (dto.supervision_mode !== undefined) updateData.supervision_mode = dto.supervision_mode;
        if (dto.break_group_id !== undefined) updateData.break_group_id = dto.break_group_id;

        return db.schedulePeriodTemplate.update({
          where: { id },
          data: updateData,
        });
      });

      return this.formatPeriod(result as Record<string, unknown>);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'PERIOD_TEMPLATE_CONFLICT',
          message: 'A period with the same order or start time already exists for this weekday',
        });
      }
      throw err;
    }
  }

  async getTeachingCount(tenantId: string, academicYearId: string, yearGroupId?: string): Promise<number> {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
      schedule_period_type: 'teaching',
    };
    if (yearGroupId) {
      where['year_group_id'] = yearGroupId;
    }
    return this.prisma.schedulePeriodTemplate.count({ where });
  }

  async delete(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedulePeriodTemplate.delete({ where: { id } });
    });
  }

  async copyDay(tenantId: string, dto: CopyDayDto) {
    const sourcePeriods = await this.prisma.schedulePeriodTemplate.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: dto.academic_year_id,
        year_group_id: dto.year_group_id,
        weekday: dto.source_weekday,
      },
      orderBy: { period_order: 'asc' },
    });

    if (sourcePeriods.length === 0) {
      throw new NotFoundException({
        code: 'SOURCE_DAY_EMPTY',
        message: `No periods found for weekday ${dto.source_weekday}`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const created: Array<Record<string, unknown>> = [];

      for (const targetWeekday of dto.target_weekdays) {
        await db.schedulePeriodTemplate.deleteMany({
          where: {
            tenant_id: tenantId,
            academic_year_id: dto.academic_year_id,
            year_group_id: dto.year_group_id,
            weekday: targetWeekday,
          },
        });

        for (const period of sourcePeriods) {
          const newPeriod = await db.schedulePeriodTemplate.create({
            data: {
              tenant_id: tenantId,
              academic_year_id: dto.academic_year_id,
              year_group_id: dto.year_group_id,
              weekday: targetWeekday,
              period_name: period.period_name,
              period_name_ar: period.period_name_ar,
              period_order: period.period_order,
              start_time: period.start_time,
              end_time: period.end_time,
              schedule_period_type: period.schedule_period_type,
              supervision_mode: period.supervision_mode,
              break_group_id: period.break_group_id,
            },
          });
          created.push(this.formatPeriod(newPeriod));
        }
      }

      return { created, skipped: [] as number[] };
    });
  }

  async replaceDay(tenantId: string, dto: ReplaceDayDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      await db.schedulePeriodTemplate.deleteMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: dto.academic_year_id,
          year_group_id: dto.year_group_id,
          weekday: dto.weekday,
        },
      });

      const created: Array<Record<string, unknown>> = [];
      for (let i = 0; i < dto.periods.length; i++) {
        const p = dto.periods[i]!;

        if (p.start_time >= p.end_time) {
          throw new BadRequestException({
            code: 'INVALID_TIME_RANGE',
            message: `Period ${i + 1}: end_time must be after start_time`,
          });
        }

        const record = await db.schedulePeriodTemplate.create({
          data: {
            tenant_id: tenantId,
            academic_year_id: dto.academic_year_id,
            year_group_id: dto.year_group_id,
            weekday: dto.weekday,
            period_name: p.period_name,
            period_order: i + 1,
            start_time: this.timeToDate(p.start_time),
            end_time: this.timeToDate(p.end_time),
            schedule_period_type: p.schedule_period_type,
          },
        });
        created.push(this.formatPeriod(record));
      }

      return { created, count: created.length };
    });
  }

  async copyYearGroup(tenantId: string, dto: CopyYearGroupDto) {
    const whereSource: Record<string, unknown> = {
      tenant_id: tenantId,
      academic_year_id: dto.academic_year_id,
      year_group_id: dto.source_year_group_id,
    };
    if (dto.weekdays && dto.weekdays.length > 0) {
      whereSource['weekday'] = { in: dto.weekdays };
    }

    const sourcePeriods = await this.prisma.schedulePeriodTemplate.findMany({
      where: whereSource,
      orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
    });

    if (sourcePeriods.length === 0) {
      throw new NotFoundException({
        code: 'SOURCE_YEAR_GROUP_EMPTY',
        message: 'No periods found for the source year group',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      let totalCreated = 0;

      for (const targetYgId of dto.target_year_group_ids) {
        const deleteWhere: Record<string, unknown> = {
          tenant_id: tenantId,
          academic_year_id: dto.academic_year_id,
          year_group_id: targetYgId,
        };
        if (dto.weekdays && dto.weekdays.length > 0) {
          deleteWhere['weekday'] = { in: dto.weekdays };
        }
        await db.schedulePeriodTemplate.deleteMany({ where: deleteWhere });

        for (const period of sourcePeriods) {
          await db.schedulePeriodTemplate.create({
            data: {
              tenant_id: tenantId,
              academic_year_id: dto.academic_year_id,
              year_group_id: targetYgId,
              weekday: period.weekday,
              period_name: period.period_name,
              period_name_ar: period.period_name_ar,
              period_order: period.period_order,
              start_time: period.start_time,
              end_time: period.end_time,
              schedule_period_type: period.schedule_period_type,
              supervision_mode: period.supervision_mode,
              break_group_id: period.break_group_id,
            },
          });
          totalCreated++;
        }
      }

      return { copied: totalCreated, target_year_groups: dto.target_year_group_ids.length };
    });
  }

  async getGridHash(tenantId: string, academicYearId: string): Promise<string> {
    const periods = await this.prisma.schedulePeriodTemplate.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
      select: {
        weekday: true,
        period_order: true,
        start_time: true,
        end_time: true,
        schedule_period_type: true,
      },
    });

    const hashInput = periods
      .map(
        (p) =>
          `${p.weekday}|${p.period_order}|${this.formatTime(p.start_time)}|${this.formatTime(p.end_time)}|${p.schedule_period_type}`,
      )
      .join(',');

    return createHash('md5').update(hashInput).digest('hex');
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private timeToDate(timeStr: string): Date {
    return new Date(`1970-01-01T${timeStr}:00.000Z`);
  }

  private formatTime(date: Date): string {
    return date.toISOString().slice(11, 16);
  }

  private formatPeriod(period: Record<string, unknown>): Record<string, unknown> {
    const result = { ...period };
    if (result['start_time'] instanceof Date) {
      result['start_time'] = this.formatTime(result['start_time'] as Date);
    }
    if (result['end_time'] instanceof Date) {
      result['end_time'] = this.formatTime(result['end_time'] as Date);
    }
    return result;
  }

  private async assertExists(tenantId: string, id: string) {
    const period = await this.prisma.schedulePeriodTemplate.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!period) {
      throw new NotFoundException({
        code: 'PERIOD_TEMPLATE_NOT_FOUND',
        message: `Period template with id "${id}" not found`,
      });
    }

    return period;
  }
}
