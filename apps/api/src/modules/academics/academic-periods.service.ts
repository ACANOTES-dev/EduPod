import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type { CreateAcademicPeriodDto } from './dto/create-academic-period.dto';
import type { UpdateAcademicPeriodDto } from './dto/update-academic-period.dto';

type AcademicPeriodStatus = 'planned' | 'active' | 'closed';

const VALID_STATUS_TRANSITIONS: Record<AcademicPeriodStatus, AcademicPeriodStatus[]> = {
  planned: ['active'],
  active: ['closed'],
  closed: [],
};

@Injectable()
export class AcademicPeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, yearId: string, dto: CreateAcademicPeriodDto) {
    // Verify the parent academic year exists and belongs to this tenant
    const year = await this.prisma.academicYear.findFirst({
      where: { id: yearId, tenant_id: tenantId },
    });

    if (!year) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year with id "${yearId}" not found`,
      });
    }

    // Validate that period dates are within the academic year range
    const periodStart = new Date(dto.start_date);
    const periodEnd = new Date(dto.end_date);
    const yearStart = new Date(year.start_date);
    const yearEnd = new Date(year.end_date);

    if (periodStart < yearStart || periodEnd > yearEnd) {
      throw new BadRequestException({
        code: 'PERIOD_OUTSIDE_YEAR_RANGE',
        message: 'Period dates must be within the academic year date range',
      });
    }

    if (periodStart >= periodEnd) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'start_date must be before end_date',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        return (tx as unknown as PrismaService).academicPeriod.create({
          data: {
            tenant_id: tenantId,
            academic_year_id: yearId,
            name: dto.name,
            period_type: dto.period_type,
            start_date: periodStart,
            end_date: periodEnd,
            status: dto.status ?? 'planned',
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `A period with name "${dto.name}" already exists in this academic year`,
        });
      }
      if (this.isExclusionConstraintError(err)) {
        throw new ConflictException({
          code: 'OVERLAPPING_PERIOD',
          message: 'The date range overlaps with an existing period in this academic year',
        });
      }
      throw err;
    }
  }

  async findAllForYear(tenantId: string, yearId: string) {
    // Verify academic year exists and belongs to this tenant
    const year = await this.prisma.academicYear.findFirst({
      where: { id: yearId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!year) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year with id "${yearId}" not found`,
      });
    }

    return this.prisma.academicPeriod.findMany({
      where: { academic_year_id: yearId, tenant_id: tenantId },
      orderBy: { start_date: 'asc' },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateAcademicPeriodDto) {
    await this.assertExists(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        const updateData: Prisma.AcademicPeriodUpdateInput = {};
        if (dto.name !== undefined) updateData.name = dto.name;
        if (dto.period_type !== undefined) updateData.period_type = dto.period_type;
        if (dto.start_date !== undefined) updateData.start_date = new Date(dto.start_date);
        if (dto.end_date !== undefined) updateData.end_date = new Date(dto.end_date);

        return (tx as unknown as PrismaService).academicPeriod.update({
          where: { id },
          data: updateData,
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `A period with name "${dto.name}" already exists in this academic year`,
        });
      }
      if (this.isExclusionConstraintError(err)) {
        throw new ConflictException({
          code: 'OVERLAPPING_PERIOD',
          message: 'The date range overlaps with an existing period in this academic year',
        });
      }
      throw err;
    }
  }

  async updateStatus(tenantId: string, id: string, status: AcademicPeriodStatus) {
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!period) {
      throw new NotFoundException({
        code: 'ACADEMIC_PERIOD_NOT_FOUND',
        message: `Academic period with id "${id}" not found`,
      });
    }

    const currentStatus = period.status as AcademicPeriodStatus;
    const allowed = VALID_STATUS_TRANSITIONS[currentStatus];

    if (!allowed.includes(status)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${currentStatus}" to "${status}"`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      return (tx as unknown as PrismaService).academicPeriod.update({
        where: { id },
        data: { status },
      });
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async assertExists(tenantId: string, id: string) {
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!period) {
      throw new NotFoundException({
        code: 'ACADEMIC_PERIOD_NOT_FOUND',
        message: `Academic period with id "${id}" not found`,
      });
    }
  }

  private isExclusionConstraintError(err: unknown): boolean {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2010') {
      return true;
    }
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      return msg.includes('excl_') || msg.includes('exclusion constraint');
    }
    return false;
  }
}
