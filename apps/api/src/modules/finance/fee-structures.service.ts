import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateFeeStructureDto, UpdateFeeStructureDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

interface FeeStructureFilters {
  page: number;
  pageSize: number;
  active?: boolean;
  year_group_id?: string;
  search?: string;
}

@Injectable()
export class FeeStructuresService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, filters: FeeStructureFilters) {
    const { page, pageSize, active, year_group_id, search } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (active !== undefined) {
      where.active = active;
    }
    if (year_group_id) {
      where.year_group_id = year_group_id;
    }
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.feeStructure.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          year_group: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.feeStructure.count({ where }),
    ]);

    return {
      data: data.map((fs) => ({
        ...fs,
        amount: Number(fs.amount),
      })),
      meta: { page, pageSize, total },
    };
  }

  async findOne(tenantId: string, id: string) {
    const feeStructure = await this.prisma.feeStructure.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        year_group: {
          select: { id: true, name: true },
        },
      },
    });

    if (!feeStructure) {
      throw new NotFoundException({
        code: 'FEE_STRUCTURE_NOT_FOUND',
        message: `Fee structure with id "${id}" not found`,
      });
    }

    return {
      ...feeStructure,
      amount: Number(feeStructure.amount),
    };
  }

  async create(tenantId: string, dto: CreateFeeStructureDto) {
    // Validate unique name within tenant
    const existing = await this.prisma.feeStructure.findFirst({
      where: { tenant_id: tenantId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException({
        code: 'DUPLICATE_NAME',
        message: `A fee structure with the name "${dto.name}" already exists`,
      });
    }

    // Validate year_group exists if provided
    if (dto.year_group_id) {
      const yearGroup = await this.prisma.yearGroup.findFirst({
        where: { id: dto.year_group_id, tenant_id: tenantId },
      });
      if (!yearGroup) {
        throw new BadRequestException({
          code: 'YEAR_GROUP_NOT_FOUND',
          message: `Year group with id "${dto.year_group_id}" not found`,
        });
      }
    }

    const created = await this.prisma.feeStructure.create({
      data: {
        tenant_id: tenantId,
        name: dto.name,
        year_group_id: dto.year_group_id ?? null,
        amount: dto.amount,
        billing_frequency: dto.billing_frequency,
      },
      include: {
        year_group: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      ...created,
      amount: Number(created.amount),
    };
  }

  async update(tenantId: string, id: string, dto: UpdateFeeStructureDto) {
    const existing = await this.prisma.feeStructure.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'FEE_STRUCTURE_NOT_FOUND',
        message: `Fee structure with id "${id}" not found`,
      });
    }

    // Check unique name if changed
    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.prisma.feeStructure.findFirst({
        where: { tenant_id: tenantId, name: dto.name, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `A fee structure with the name "${dto.name}" already exists`,
        });
      }
    }

    const updated = await this.prisma.feeStructure.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.year_group_id !== undefined && { year_group_id: dto.year_group_id }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.billing_frequency !== undefined && { billing_frequency: dto.billing_frequency }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
      include: {
        year_group: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      ...updated,
      amount: Number(updated.amount),
    };
  }

  async deactivate(tenantId: string, id: string) {
    const existing = await this.prisma.feeStructure.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'FEE_STRUCTURE_NOT_FOUND',
        message: `Fee structure with id "${id}" not found`,
      });
    }

    // Check no active fee assignments reference it
    const activeAssignments = await this.prisma.householdFeeAssignment.count({
      where: {
        fee_structure_id: id,
        tenant_id: tenantId,
        effective_to: null,
      },
    });
    if (activeAssignments > 0) {
      throw new BadRequestException({
        code: 'ACTIVE_ASSIGNMENTS_EXIST',
        message: `Cannot deactivate: ${activeAssignments} active fee assignment(s) reference this fee structure`,
      });
    }

    const updated = await this.prisma.feeStructure.update({
      where: { id },
      data: { active: false },
    });

    return {
      ...updated,
      amount: Number(updated.amount),
    };
  }
}
