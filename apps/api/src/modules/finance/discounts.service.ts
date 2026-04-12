import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import type { CreateDiscountDto, UpdateDiscountDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

interface DiscountFilters {
  page: number;
  pageSize: number;
  active?: boolean;
  search?: string;
}

@Injectable()
export class DiscountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, filters: DiscountFilters) {
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
      this.prisma.discount.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.discount.count({ where }),
    ]);

    return {
      data: data.map((d) => ({
        ...d,
        value: Number(d.value),
      })),
      meta: { page, pageSize, total },
    };
  }

  async findOne(tenantId: string, id: string) {
    const discount = await this.prisma.discount.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!discount) {
      throw new NotFoundException({
        code: 'DISCOUNT_NOT_FOUND',
        message: `Discount with id "${id}" not found`,
      });
    }

    return {
      ...discount,
      value: Number(discount.value),
    };
  }

  async create(tenantId: string, dto: CreateDiscountDto) {
    // Validate unique name within tenant
    const existing = await this.prisma.discount.findFirst({
      where: { tenant_id: tenantId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException({
        code: 'DUPLICATE_NAME',
        message: `A discount with the name "${dto.name}" already exists`,
      });
    }

    const created = await this.prisma.discount.create({
      data: {
        tenant_id: tenantId,
        name: dto.name,
        discount_type: dto.discount_type,
        value: dto.value,
        auto_apply: dto.auto_apply ?? false,
        auto_condition: dto.auto_condition ?? undefined,
      },
    });

    return {
      ...created,
      value: Number(created.value),
    };
  }

  async update(tenantId: string, id: string, dto: UpdateDiscountDto) {
    const existing = await this.prisma.discount.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'DISCOUNT_NOT_FOUND',
        message: `Discount with id "${id}" not found`,
      });
    }

    // Check unique name if changed
    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.prisma.discount.findFirst({
        where: { tenant_id: tenantId, name: dto.name, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `A discount with the name "${dto.name}" already exists`,
        });
      }
    }

    // If updating to percent, validate value <= 100
    const effectiveType = dto.discount_type ?? existing.discount_type;
    const effectiveValue = dto.value ?? Number(existing.value);
    if (effectiveType === 'percent' && effectiveValue > 100) {
      throw new BadRequestException({
        code: 'INVALID_PERCENT_VALUE',
        message: 'Percentage discount value must be <= 100',
      });
    }

    const updated = await this.prisma.discount.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.discount_type !== undefined && { discount_type: dto.discount_type }),
        ...(dto.value !== undefined && { value: dto.value }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.auto_apply !== undefined && { auto_apply: dto.auto_apply }),
        ...(dto.auto_condition !== undefined && {
          auto_condition: dto.auto_condition ?? undefined,
        }),
      },
    });

    return {
      ...updated,
      value: Number(updated.value),
    };
  }

  async deactivate(tenantId: string, id: string) {
    const existing = await this.prisma.discount.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'DISCOUNT_NOT_FOUND',
        message: `Discount with id "${id}" not found`,
      });
    }

    // Check no active fee assignments reference it
    const activeAssignments = await this.prisma.householdFeeAssignment.count({
      where: {
        discount_id: id,
        tenant_id: tenantId,
        effective_to: null,
      },
    });
    if (activeAssignments > 0) {
      throw new BadRequestException({
        code: 'ACTIVE_ASSIGNMENTS_EXIST',
        message: `Cannot deactivate: ${activeAssignments} active fee assignment(s) reference this discount`,
      });
    }

    const updated = await this.prisma.discount.update({
      where: { id },
      data: { active: false },
    });

    return {
      ...updated,
      value: Number(updated.value),
    };
  }
}
