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
  CreatePeriodTemplateDto,
  UpdatePeriodTemplateDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PeriodGridService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, academicYearId: string) {
    const data = await this.prisma.schedulePeriodTemplate.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
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
            weekday: dto.weekday,
            period_name: dto.period_name,
            period_name_ar: dto.period_name_ar ?? null,
            period_order: dto.period_order,
            start_time: this.timeToDate(dto.start_time),
            end_time: this.timeToDate(dto.end_time),
            schedule_period_type: dto.schedule_period_type ?? 'teaching',
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

        const updateData: Prisma.SchedulePeriodTemplateUpdateInput = {};
        if (dto.period_name !== undefined) updateData.period_name = dto.period_name;
        if (dto.period_name_ar !== undefined) updateData.period_name_ar = dto.period_name_ar;
        if (dto.period_order !== undefined) updateData.period_order = dto.period_order;
        if (dto.start_time !== undefined) updateData.start_time = this.timeToDate(dto.start_time);
        if (dto.end_time !== undefined) updateData.end_time = this.timeToDate(dto.end_time);
        if (dto.schedule_period_type !== undefined)
          updateData.schedule_period_type = dto.schedule_period_type;

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

  async delete(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedulePeriodTemplate.delete({ where: { id } });
    });
  }

  async copyDay(tenantId: string, dto: CopyDayDto) {
    // Read source day's periods
    const sourcePeriods = await this.prisma.schedulePeriodTemplate.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: dto.academic_year_id,
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

    const results = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const created: Array<Record<string, unknown>> = [];
      const skipped: number[] = [];

      for (const targetWeekday of dto.target_weekdays) {
        for (const period of sourcePeriods) {
          try {
            const newPeriod = await db.schedulePeriodTemplate.create({
              data: {
                tenant_id: tenantId,
                academic_year_id: dto.academic_year_id,
                weekday: targetWeekday,
                period_name: period.period_name,
                period_name_ar: period.period_name_ar,
                period_order: period.period_order,
                start_time: period.start_time,
                end_time: period.end_time,
                schedule_period_type: period.schedule_period_type,
              },
            });
            created.push(this.formatPeriod(newPeriod));
          } catch (err) {
            if (
              err instanceof Prisma.PrismaClientKnownRequestError &&
              err.code === 'P2002'
            ) {
              // Skip on unique conflict
              skipped.push(targetWeekday);
            } else {
              throw err;
            }
          }
        }
      }

      return { created, skipped: [...new Set(skipped)] };
    });

    return results;
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
