import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  CreateScholarshipDto,
  RevokeScholarshipDto,
  ScholarshipQueryDto,
} from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { roundMoney } from './helpers/invoice-status.helper';
import { serializeDecimal } from './helpers/serialize-decimal.helper';

@Injectable()
export class ScholarshipsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: ScholarshipQueryDto) {
    const { page, pageSize, student_id, status } = query;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (student_id) where.student_id = student_id;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.scholarship.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          student: { select: { id: true, first_name: true, last_name: true } },
          fee_structure: { select: { id: true, name: true } },
        },
      }),
      this.prisma.scholarship.count({ where }),
    ]);

    return {
      data: data.map((s) => this.serialize(s)),
      meta: { page, pageSize, total },
    };
  }

  async findOne(tenantId: string, id: string) {
    const scholarship = await this.prisma.scholarship.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
        fee_structure: { select: { id: true, name: true } },
      },
    });

    if (!scholarship) {
      throw new NotFoundException({
        code: 'SCHOLARSHIP_NOT_FOUND',
        message: `Scholarship "${id}" not found`,
      });
    }

    return this.serialize(scholarship);
  }

  async create(tenantId: string, userId: string, dto: CreateScholarshipDto) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.student_id, tenant_id: tenantId },
    });
    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student "${dto.student_id}" not found`,
      });
    }

    if (dto.discount_type === 'percent' && dto.value > 100) {
      throw new BadRequestException({
        code: 'INVALID_PERCENT_VALUE',
        message: 'Percentage scholarship value must be <= 100',
      });
    }

    const scholarship = await this.prisma.scholarship.create({
      data: {
        tenant_id: tenantId,
        name: dto.name,
        description: dto.description ?? null,
        discount_type: dto.discount_type,
        value: dto.value,
        student_id: dto.student_id,
        awarded_by_user_id: userId,
        award_date: new Date(dto.award_date),
        renewal_date: dto.renewal_date ? new Date(dto.renewal_date) : null,
        status: 'active',
        fee_structure_id: dto.fee_structure_id ?? null,
      },
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
        fee_structure: { select: { id: true, name: true } },
      },
    });

    return this.serialize(scholarship);
  }

  async revoke(tenantId: string, id: string, dto: RevokeScholarshipDto) {
    const scholarship = await this.prisma.scholarship.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!scholarship) {
      throw new NotFoundException({
        code: 'SCHOLARSHIP_NOT_FOUND',
        message: `Scholarship "${id}" not found`,
      });
    }

    if (scholarship.status !== 'active') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot revoke scholarship with status "${scholarship.status}"`,
      });
    }

    const updated = await this.prisma.scholarship.update({
      where: { id },
      data: {
        status: 'revoked',
        revocation_reason: dto.reason,
      },
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
        fee_structure: { select: { id: true, name: true } },
      },
    });

    return this.serialize(updated);
  }

  /**
   * Find all active scholarships for a student and compute the discount to apply
   * for a given fee structure. Called during fee generation.
   */
  async getDiscountForStudent(
    tenantId: string,
    studentId: string,
    feeStructureId: string,
    feeAmount: number,
  ): Promise<number> {
    const scholarships = await this.prisma.scholarship.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: 'active',
        OR: [{ fee_structure_id: feeStructureId }, { fee_structure_id: null }],
      },
    });

    let totalDiscount = 0;

    for (const scholarship of scholarships) {
      const discount =
        scholarship.discount_type === 'percent'
          ? roundMoney(feeAmount * (Number(scholarship.value) / 100))
          : roundMoney(Number(scholarship.value));
      totalDiscount += discount;
    }

    // Cap discount at fee amount
    return roundMoney(Math.min(totalDiscount, feeAmount));
  }

  /**
   * Mark expired scholarships — called by the worker job.
   */
  async markExpired(tenantId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.prisma.scholarship.updateMany({
      where: {
        tenant_id: tenantId,
        status: 'active',
        renewal_date: { lt: today },
      },
      data: { status: 'expired' },
    });

    return result.count;
  }

  private serialize<T extends { value: Decimal }>(s: T): Omit<T, 'value'> & { value: number } {
    return { ...s, value: serializeDecimal(s.value) };
  }
}
