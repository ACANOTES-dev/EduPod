import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { CreateFeeTypeDto, UpdateFeeTypeDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

interface FeeTypeFilters {
  page: number;
  pageSize: number;
  active?: boolean;
  search?: string;
}

@Injectable()
export class FeeTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, filters: FeeTypeFilters) {
    const { page, pageSize, active, search } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (active !== undefined) {
      where.active = active;
    }
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.feeType.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.feeType.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  async findOne(tenantId: string, id: string) {
    const feeType = await this.prisma.feeType.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!feeType) {
      throw new NotFoundException({
        code: 'FEE_TYPE_NOT_FOUND',
        message: `Fee type with id "${id}" not found`,
      });
    }

    return feeType;
  }

  async create(tenantId: string, dto: CreateFeeTypeDto) {
    // Validate unique name within tenant
    const existing = await this.prisma.feeType.findFirst({
      where: { tenant_id: tenantId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException({
        code: 'DUPLICATE_NAME',
        message: `A fee type with the name "${dto.name}" already exists`,
      });
    }

    const created = await this.prisma.feeType.create({
      data: {
        tenant_id: tenantId,
        name: dto.name,
        description: dto.description ?? null,
      },
    });

    return created;
  }

  async update(tenantId: string, id: string, dto: UpdateFeeTypeDto) {
    const existing = await this.prisma.feeType.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'FEE_TYPE_NOT_FOUND',
        message: `Fee type with id "${id}" not found`,
      });
    }

    // Check unique name if changed
    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.prisma.feeType.findFirst({
        where: { tenant_id: tenantId, name: dto.name, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `A fee type with the name "${dto.name}" already exists`,
        });
      }
    }

    const updated = await this.prisma.feeType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });

    return updated;
  }

  async deactivate(tenantId: string, id: string) {
    const existing = await this.prisma.feeType.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'FEE_TYPE_NOT_FOUND',
        message: `Fee type with id "${id}" not found`,
      });
    }

    // Check no fee structures reference this fee type
    const referencingStructures = await this.prisma.feeStructure.count({
      where: {
        fee_type_id: id,
        tenant_id: tenantId,
      },
    });
    if (referencingStructures > 0) {
      throw new BadRequestException({
        code: 'FEE_STRUCTURES_EXIST',
        message: `Cannot deactivate: ${referencingStructures} fee structure(s) reference this fee type`,
      });
    }

    const updated = await this.prisma.feeType.update({
      where: { id },
      data: { active: false },
    });

    return updated;
  }
}
