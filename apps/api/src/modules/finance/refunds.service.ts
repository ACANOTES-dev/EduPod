import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateRefundDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

import { roundMoney } from './helpers/invoice-status.helper';
import { InvoicesService } from './invoices.service';

interface RefundFilters {
  page: number;
  pageSize: number;
  status?: string;
  payment_id?: string;
}

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async findAll(tenantId: string, filters: RefundFilters) {
    const { page, pageSize, status, payment_id } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (status) where.status = status;
    if (payment_id) where.payment_id = payment_id;

    const [data, total] = await Promise.all([
      this.prisma.refund.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          payment: {
            select: {
              id: true,
              payment_reference: true,
              amount: true,
              household: {
                select: { id: true, household_name: true },
              },
            },
          },
          requested_by: {
            select: { id: true, first_name: true, last_name: true },
          },
          approved_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.refund.count({ where }),
    ]);

    return {
      data: data.map((r) => ({
        ...r,
        amount: Number(r.amount),
        payment: {
          ...r.payment,
          amount: Number(r.payment.amount),
        },
      })),
      meta: { page, pageSize, total },
    };
  }

  async create(tenantId: string, userId: string, dto: CreateRefundDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: dto.payment_id, tenant_id: tenantId },
      include: {
        refunds: true,
        allocations: {
          include: {
            invoice: { select: { id: true, status: true } },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: `Payment with id "${dto.payment_id}" not found`,
      });
    }

    if (payment.status !== 'posted') {
      throw new BadRequestException({
        code: 'INVALID_PAYMENT_STATUS',
        message: `Cannot refund a payment with status "${payment.status}"`,
      });
    }

    // Calculate unrefunded portion
    const totalRefunded = payment.refunds
      .filter((r) => r.status !== 'rejected' && r.status !== 'failed')
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const unrefunded = roundMoney(Number(payment.amount) - totalRefunded);

    if (dto.amount > unrefunded + 0.01) {
      throw new BadRequestException({
        code: 'REFUND_EXCEEDS_AVAILABLE',
        message: `Refund amount (${dto.amount}) exceeds available amount (${unrefunded})`,
      });
    }

    // Check refund guards: cannot refund if invoices are void/written-off
    for (const alloc of payment.allocations) {
      if (['void', 'written_off'].includes(alloc.invoice.status)) {
        throw new BadRequestException({
          code: 'INVOICE_VOID_OR_WRITTEN_OFF',
          message: `Cannot refund: payment is allocated to a ${alloc.invoice.status} invoice`,
        });
      }
    }

    // Generate refund reference
    const branding = await this.prisma.tenantBranding.findUnique({
      where: { tenant_id: tenantId },
    });
    const prefix = branding?.receipt_prefix ? `REF-${branding.receipt_prefix}` : 'REF';
    const refundReference = await this.sequenceService.nextNumber(tenantId, 'refund', undefined, prefix);

    const refund = await this.prisma.refund.create({
      data: {
        tenant_id: tenantId,
        payment_id: dto.payment_id,
        refund_reference: refundReference,
        amount: dto.amount,
        status: 'pending_approval',
        reason: dto.reason,
        requested_by_user_id: userId,
      },
      include: {
        payment: {
          select: {
            id: true,
            payment_reference: true,
            amount: true,
          },
        },
        requested_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    return {
      ...refund,
      amount: Number(refund.amount),
      payment: {
        ...refund.payment,
        amount: Number(refund.payment.amount),
      },
    };
  }

  async approve(tenantId: string, refundId: string, approverUserId: string, comment?: string) {
    const refund = await this.prisma.refund.findFirst({
      where: { id: refundId, tenant_id: tenantId },
    });
    if (!refund) {
      throw new NotFoundException({
        code: 'REFUND_NOT_FOUND',
        message: `Refund with id "${refundId}" not found`,
      });
    }

    if (refund.status !== 'pending_approval') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot approve a refund with status "${refund.status}"`,
      });
    }

    if (refund.requested_by_user_id === approverUserId) {
      throw new BadRequestException({
        code: 'SELF_APPROVAL_BLOCKED',
        message: 'Cannot approve your own refund request',
      });
    }

    const updated = await this.prisma.refund.update({
      where: { id: refundId },
      data: {
        status: 'approved',
        approved_by_user_id: approverUserId,
      },
    });

    return {
      ...updated,
      amount: Number(updated.amount),
    };
  }

  async reject(tenantId: string, refundId: string, approverUserId: string, comment: string) {
    const refund = await this.prisma.refund.findFirst({
      where: { id: refundId, tenant_id: tenantId },
    });
    if (!refund) {
      throw new NotFoundException({
        code: 'REFUND_NOT_FOUND',
        message: `Refund with id "${refundId}" not found`,
      });
    }

    if (refund.status !== 'pending_approval') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot reject a refund with status "${refund.status}"`,
      });
    }

    const updated = await this.prisma.refund.update({
      where: { id: refundId },
      data: {
        status: 'rejected',
        approved_by_user_id: approverUserId,
        failure_reason: comment,
      },
    });

    return {
      ...updated,
      amount: Number(updated.amount),
    };
  }

  async execute(tenantId: string, refundId: string) {
    const refund = await this.prisma.refund.findFirst({
      where: { id: refundId, tenant_id: tenantId },
    });
    if (!refund) {
      throw new NotFoundException({
        code: 'REFUND_NOT_FOUND',
        message: `Refund with id "${refundId}" not found`,
      });
    }

    if (refund.status !== 'approved') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot execute a refund with status "${refund.status}"`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const prisma = tx as unknown as typeof this.prisma;

      // Perform LIFO allocation reversal
      await this.reverseAllocationsLifo(tenantId, refund.payment_id, Number(refund.amount), prisma);

      // Update refund status
      const updated = await prisma.refund.update({
        where: { id: refundId },
        data: {
          status: 'executed',
          executed_at: new Date(),
        },
      });

      // Update payment status
      const payment = await prisma.payment.findUnique({
        where: { id: refund.payment_id },
        include: { refunds: true },
      });
      if (payment) {
        const totalRefunded = payment.refunds
          .filter((r) => r.status === 'executed')
          .reduce((sum, r) => sum + Number(r.amount), 0);

        const paymentAmount = Number(payment.amount);
        let newStatus: string;
        if (totalRefunded >= paymentAmount - 0.01) {
          newStatus = 'refunded_full';
        } else if (totalRefunded > 0) {
          newStatus = 'refunded_partial';
        } else {
          newStatus = 'posted';
        }

        await prisma.payment.update({
          where: { id: refund.payment_id },
          data: { status: newStatus as never },
        });
      }

      return {
        ...updated,
        amount: Number(updated.amount),
      };
    });
  }

  /**
   * LIFO allocation reversal: reverse allocations starting from the most recent,
   * deducting from unallocated first, then reversing allocations.
   */
  private async reverseAllocationsLifo(
    tenantId: string,
    paymentId: string,
    refundAmount: number,
    prisma: typeof this.prisma,
  ) {
    // Get allocations sorted by created_at DESC (LIFO)
    const allocations = await prisma.paymentAllocation.findMany({
      where: { payment_id: paymentId },
      orderBy: { created_at: 'desc' },
    });

    let remaining = refundAmount;

    // Calculate total allocated
    const totalAllocated = allocations.reduce(
      (sum, a) => sum + Number(a.allocated_amount),
      0,
    );
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) return;

    const unallocated = roundMoney(Number(payment.amount) - totalAllocated);

    // Deduct from unallocated portion first
    if (unallocated > 0) {
      const deductFromUnallocated = Math.min(remaining, unallocated);
      remaining = roundMoney(remaining - deductFromUnallocated);
    }

    // Reverse allocations LIFO
    for (const alloc of allocations) {
      if (remaining <= 0) break;

      const allocAmount = Number(alloc.allocated_amount);
      const reverseAmount = roundMoney(Math.min(remaining, allocAmount));

      if (reverseAmount >= allocAmount - 0.01) {
        // Fully reverse this allocation
        await prisma.paymentAllocation.delete({
          where: { id: alloc.id },
        });
      } else {
        // Partially reverse
        await prisma.paymentAllocation.update({
          where: { id: alloc.id },
          data: { allocated_amount: roundMoney(allocAmount - reverseAmount) },
        });
      }

      remaining = roundMoney(remaining - reverseAmount);

      // Recalculate affected invoice balance
      await this.invoicesService.recalculateBalance(tenantId, alloc.invoice_id, prisma);
    }
  }
}
