import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import type { UpdateAcademicYearDto } from './dto/update-academic-year.dto';

type AcademicYearStatus = 'planned' | 'active' | 'closed';

const VALID_STATUS_TRANSITIONS: Record<AcademicYearStatus, AcademicYearStatus[]> = {
  planned: ['active'],
  active: ['closed'],
  closed: [],
};

interface ListAcademicYearsParams {
  status?: AcademicYearStatus;
  page: number;
  pageSize: number;
}

@Injectable()
export class AcademicYearsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateAcademicYearDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        return (tx as unknown as PrismaService).academicYear.create({
          data: {
            tenant_id: tenantId,
            name: dto.name,
            start_date: new Date(dto.start_date),
            end_date: new Date(dto.end_date),
            status: dto.status ?? 'planned',
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `An academic year with name "${dto.name}" already exists`,
        });
      }
      // PostgreSQL exclusion constraint violation comes as P2010 or raw DB error
      if (this.isExclusionConstraintError(err)) {
        throw new ConflictException({
          code: 'OVERLAPPING_ACADEMIC_YEAR',
          message: 'The date range overlaps with an existing academic year',
        });
      }
      throw err;
    }
  }

  async findAll(tenantId: string, params: ListAcademicYearsParams) {
    const { status, page, pageSize } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AcademicYearWhereInput = { tenant_id: tenantId };
    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.academicYear.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { start_date: 'desc' },
        include: {
          _count: { select: { periods: true } },
        },
      }),
      this.prisma.academicYear.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  async findOne(tenantId: string, id: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        periods: {
          orderBy: { start_date: 'asc' },
        },
      },
    });

    if (!year) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year with id "${id}" not found`,
      });
    }

    return year;
  }

  async update(tenantId: string, id: string, dto: UpdateAcademicYearDto) {
    const existing = await this.prisma.academicYear.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year with id "${id}" not found`,
      });
    }

    if (existing.status !== 'planned' && (dto.start_date || dto.end_date)) {
      throw new BadRequestException({
        error: {
          code: 'DATES_LOCKED',
          message: 'Cannot change dates on active or closed academic years',
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        const updateData: Prisma.AcademicYearUpdateInput = {};
        if (dto.name !== undefined) updateData.name = dto.name;
        if (dto.start_date !== undefined) updateData.start_date = new Date(dto.start_date);
        if (dto.end_date !== undefined) updateData.end_date = new Date(dto.end_date);

        return (tx as unknown as PrismaService).academicYear.update({
          where: { id },
          data: updateData,
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `An academic year with name "${dto.name}" already exists`,
        });
      }
      if (this.isExclusionConstraintError(err)) {
        throw new ConflictException({
          code: 'OVERLAPPING_ACADEMIC_YEAR',
          message: 'The date range overlaps with an existing academic year',
        });
      }
      throw err;
    }
  }

  async updateStatus(tenantId: string, id: string, status: AcademicYearStatus) {
    const year = await this.prisma.academicYear.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!year) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year with id "${id}" not found`,
      });
    }

    const currentStatus = year.status as AcademicYearStatus;
    const allowed = VALID_STATUS_TRANSITIONS[currentStatus];

    if (!allowed.includes(status)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${currentStatus}" to "${status}"`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      return (tx as unknown as PrismaService).academicYear.update({
        where: { id },
        data: { status },
      });
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async assertExists(tenantId: string, id: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!year) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year with id "${id}" not found`,
      });
    }
  }

  private isExclusionConstraintError(err: unknown): boolean {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2010') {
      return true;
    }
    // Raw DB error: look for exclusion constraint message
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      return msg.includes('excl_') || msg.includes('exclusion constraint');
    }
    return false;
  }
}
