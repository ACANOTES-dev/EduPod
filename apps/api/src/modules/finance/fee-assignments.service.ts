import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateFeeAssignmentDto, UpdateFeeAssignmentDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

interface FeeAssignmentFilters {
  page: number;
  pageSize: number;
  household_id?: string;
  student_id?: string;
  fee_structure_id?: string;
  active_only?: boolean;
}

@Injectable()
export class FeeAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, filters: FeeAssignmentFilters) {
    const { page, pageSize, household_id, student_id, fee_structure_id, active_only } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (household_id) where.household_id = household_id;
    if (student_id) where.student_id = student_id;
    if (fee_structure_id) where.fee_structure_id = fee_structure_id;
    if (active_only) where.effective_to = null;

    const [data, total] = await Promise.all([
      this.prisma.householdFeeAssignment.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          fee_structure: {
            select: { id: true, name: true, amount: true, billing_frequency: true },
          },
          discount: {
            select: { id: true, name: true, discount_type: true, value: true },
          },
          household: {
            select: { id: true, household_name: true },
          },
          student: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.householdFeeAssignment.count({ where }),
    ]);

    return {
      data: data.map((a) => ({
        ...a,
        fee_structure: a.fee_structure
          ? { ...a.fee_structure, amount: Number(a.fee_structure.amount) }
          : null,
        discount: a.discount
          ? { ...a.discount, value: Number(a.discount.value) }
          : null,
      })),
      meta: { page, pageSize, total },
    };
  }

  async findOne(tenantId: string, id: string) {
    const assignment = await this.prisma.householdFeeAssignment.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        fee_structure: {
          select: { id: true, name: true, amount: true, billing_frequency: true },
        },
        discount: {
          select: { id: true, name: true, discount_type: true, value: true },
        },
        household: {
          select: { id: true, household_name: true },
        },
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException({
        code: 'FEE_ASSIGNMENT_NOT_FOUND',
        message: `Fee assignment with id "${id}" not found`,
      });
    }

    return {
      ...assignment,
      fee_structure: assignment.fee_structure
        ? { ...assignment.fee_structure, amount: Number(assignment.fee_structure.amount) }
        : null,
      discount: assignment.discount
        ? { ...assignment.discount, value: Number(assignment.discount.value) }
        : null,
    };
  }

  async create(tenantId: string, dto: CreateFeeAssignmentDto) {
    // Validate household exists
    const household = await this.prisma.household.findFirst({
      where: { id: dto.household_id, tenant_id: tenantId },
    });
    if (!household) {
      throw new BadRequestException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: `Household with id "${dto.household_id}" not found`,
      });
    }

    // Validate fee structure exists and is active
    const feeStructure = await this.prisma.feeStructure.findFirst({
      where: { id: dto.fee_structure_id, tenant_id: tenantId },
    });
    if (!feeStructure) {
      throw new BadRequestException({
        code: 'FEE_STRUCTURE_NOT_FOUND',
        message: `Fee structure with id "${dto.fee_structure_id}" not found`,
      });
    }
    if (!feeStructure.active) {
      throw new BadRequestException({
        code: 'FEE_STRUCTURE_INACTIVE',
        message: 'Cannot assign an inactive fee structure',
      });
    }

    // Validate student exists if provided
    if (dto.student_id) {
      const student = await this.prisma.student.findFirst({
        where: { id: dto.student_id, tenant_id: tenantId },
      });
      if (!student) {
        throw new BadRequestException({
          code: 'STUDENT_NOT_FOUND',
          message: `Student with id "${dto.student_id}" not found`,
        });
      }
    }

    // Validate discount exists if provided
    if (dto.discount_id) {
      const discount = await this.prisma.discount.findFirst({
        where: { id: dto.discount_id, tenant_id: tenantId },
      });
      if (!discount) {
        throw new BadRequestException({
          code: 'DISCOUNT_NOT_FOUND',
          message: `Discount with id "${dto.discount_id}" not found`,
        });
      }
    }

    // Check for duplicate active assignment
    const duplicateWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      household_id: dto.household_id,
      fee_structure_id: dto.fee_structure_id,
      effective_to: null,
    };
    if (dto.student_id) {
      duplicateWhere.student_id = dto.student_id;
    } else {
      duplicateWhere.student_id = null;
    }

    const duplicate = await this.prisma.householdFeeAssignment.findFirst({
      where: duplicateWhere,
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'DUPLICATE_ASSIGNMENT',
        message: 'An active fee assignment already exists for this household/student and fee structure',
      });
    }

    const created = await this.prisma.householdFeeAssignment.create({
      data: {
        tenant_id: tenantId,
        household_id: dto.household_id,
        student_id: dto.student_id ?? null,
        fee_structure_id: dto.fee_structure_id,
        discount_id: dto.discount_id ?? null,
        effective_from: new Date(dto.effective_from),
      },
      include: {
        fee_structure: {
          select: { id: true, name: true, amount: true, billing_frequency: true },
        },
        discount: {
          select: { id: true, name: true, discount_type: true, value: true },
        },
        household: {
          select: { id: true, household_name: true },
        },
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    return {
      ...created,
      fee_structure: created.fee_structure
        ? { ...created.fee_structure, amount: Number(created.fee_structure.amount) }
        : null,
      discount: created.discount
        ? { ...created.discount, value: Number(created.discount.value) }
        : null,
    };
  }

  async update(tenantId: string, id: string, dto: UpdateFeeAssignmentDto) {
    const existing = await this.prisma.householdFeeAssignment.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'FEE_ASSIGNMENT_NOT_FOUND',
        message: `Fee assignment with id "${id}" not found`,
      });
    }

    // Validate discount exists if changing
    if (dto.discount_id) {
      const discount = await this.prisma.discount.findFirst({
        where: { id: dto.discount_id, tenant_id: tenantId },
      });
      if (!discount) {
        throw new BadRequestException({
          code: 'DISCOUNT_NOT_FOUND',
          message: `Discount with id "${dto.discount_id}" not found`,
        });
      }
    }

    const updated = await this.prisma.householdFeeAssignment.update({
      where: { id },
      data: {
        ...(dto.discount_id !== undefined && { discount_id: dto.discount_id }),
        ...(dto.effective_to !== undefined && { effective_to: new Date(dto.effective_to) }),
      },
      include: {
        fee_structure: {
          select: { id: true, name: true, amount: true, billing_frequency: true },
        },
        discount: {
          select: { id: true, name: true, discount_type: true, value: true },
        },
        household: {
          select: { id: true, household_name: true },
        },
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    return {
      ...updated,
      fee_structure: updated.fee_structure
        ? { ...updated.fee_structure, amount: Number(updated.fee_structure.amount) }
        : null,
      discount: updated.discount
        ? { ...updated.discount, value: Number(updated.discount.value) }
        : null,
    };
  }

  async endAssignment(tenantId: string, id: string) {
    const existing = await this.prisma.householdFeeAssignment.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'FEE_ASSIGNMENT_NOT_FOUND',
        message: `Fee assignment with id "${id}" not found`,
      });
    }

    if (existing.effective_to) {
      throw new BadRequestException({
        code: 'ALREADY_ENDED',
        message: 'This fee assignment has already been ended',
      });
    }

    const updated = await this.prisma.householdFeeAssignment.update({
      where: { id },
      data: { effective_to: new Date() },
    });

    return updated;
  }
}
