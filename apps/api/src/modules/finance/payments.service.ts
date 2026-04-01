import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AllocationSuggestion, ConfirmAllocationsDto, CreatePaymentDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { roundMoney } from './helpers/invoice-status.helper';
import { InvoicesService } from './invoices.service';
import { ReceiptsService } from './receipts.service';

interface PaymentFilters {
  page: number;
  pageSize: number;
  household_id?: string;
  status?: string;
  payment_method?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  accepted_by_user_id?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
    private readonly receiptsService: ReceiptsService,
    private readonly sequenceService: SequenceService,
  ) {}

  async findAll(tenantId: string, filters: PaymentFilters) {
    const {
      page,
      pageSize,
      household_id,
      status,
      payment_method,
      date_from,
      date_to,
      search,
      accepted_by_user_id,
    } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (household_id) where.household_id = household_id;
    if (status) where.status = status;
    if (payment_method) where.payment_method = payment_method;
    if (search) where.payment_reference = { contains: search, mode: 'insensitive' };
    if (accepted_by_user_id) where.posted_by_user_id = accepted_by_user_id;
    if (date_from || date_to) {
      const dateFilter: Record<string, unknown> = {};
      if (date_from) dateFilter.gte = new Date(date_from);
      if (date_to) dateFilter.lte = new Date(date_to);
      where.received_at = dateFilter;
    }

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { received_at: 'desc' },
        include: {
          household: {
            select: { id: true, household_name: true },
          },
          posted_by: {
            select: { id: true, first_name: true, last_name: true },
          },
          receipt: {
            select: { id: true, receipt_number: true },
          },
          _count: {
            select: { allocations: true },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: data.map((p) => ({
        ...p,
        amount: Number(p.amount),
      })),
      meta: { page, pageSize, total },
    };
  }

  async findOne(tenantId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        household: {
          select: { id: true, household_name: true },
        },
        posted_by: {
          select: { id: true, first_name: true, last_name: true },
        },
        allocations: {
          include: {
            invoice: {
              select: {
                id: true,
                invoice_number: true,
                total_amount: true,
                balance_amount: true,
                status: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        },
        receipt: true,
        refunds: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: `Payment with id "${id}" not found`,
      });
    }

    return {
      ...payment,
      amount: Number(payment.amount),
      allocations: payment.allocations.map((a) => ({
        ...a,
        allocated_amount: Number(a.allocated_amount),
        invoice: {
          ...a.invoice,
          total_amount: Number(a.invoice.total_amount),
          balance_amount: Number(a.invoice.balance_amount),
        },
      })),
      refunds: payment.refunds.map((r) => ({
        ...r,
        amount: Number(r.amount),
      })),
    };
  }

  async createManual(tenantId: string, userId: string, dto: CreatePaymentDto) {
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

    // Get tenant for currency
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }

    // Auto-generate payment reference
    const paymentReference = await this.sequenceService.nextNumber(
      tenantId,
      'payment',
      undefined,
      'PAY',
    );

    const payment = await this.prisma.payment.create({
      data: {
        tenant_id: tenantId,
        household_id: dto.household_id,
        payment_reference: paymentReference,
        payment_method: dto.payment_method,
        amount: dto.amount,
        currency_code: tenant.currency_code,
        status: 'posted',
        received_at: new Date(dto.received_at),
        posted_by_user_id: userId,
        reason: dto.reason ?? null,
      },
      include: {
        household: {
          select: { id: true, household_name: true },
        },
      },
    });

    return {
      ...payment,
      amount: Number(payment.amount),
    };
  }

  async suggestAllocations(tenantId: string, paymentId: string): Promise<AllocationSuggestion[]> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenant_id: tenantId },
    });
    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: `Payment with id "${paymentId}" not found`,
      });
    }

    // Calculate unallocated amount
    const existingAllocations = await this.prisma.paymentAllocation.findMany({
      where: { payment_id: paymentId },
    });
    const allocatedTotal = existingAllocations.reduce(
      (sum, a) => sum + Number(a.allocated_amount),
      0,
    );
    let remaining = roundMoney(Number(payment.amount) - allocatedTotal);

    if (remaining <= 0) {
      return [];
    }

    // FIFO: sort unpaid invoices by due_date ASC, created_at ASC
    const unpaidInvoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        household_id: payment.household_id,
        status: { in: ['issued', 'partially_paid', 'overdue'] },
        balance_amount: { gt: 0 },
      },
      orderBy: [{ due_date: 'asc' }, { created_at: 'asc' }],
    });

    const suggestions: AllocationSuggestion[] = [];

    for (const invoice of unpaidInvoices) {
      if (remaining <= 0) break;

      const invoiceBalance = Number(invoice.balance_amount);
      const suggestedAmount = roundMoney(Math.min(remaining, invoiceBalance));

      suggestions.push({
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        invoice_due_date: invoice.due_date.toISOString().split('T')[0] as string,
        invoice_balance: invoiceBalance,
        suggested_amount: suggestedAmount,
      });

      remaining = roundMoney(remaining - suggestedAmount);
    }

    return suggestions;
  }

  async confirmAllocations(
    tenantId: string,
    paymentId: string,
    userId: string,
    dto: ConfirmAllocationsDto,
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenant_id: tenantId },
    });
    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: `Payment with id "${paymentId}" not found`,
      });
    }

    if (payment.status !== 'posted') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot allocate from a payment with status "${payment.status}"`,
      });
    }

    const newTotal = dto.allocations.reduce((sum, a) => sum + a.amount, 0);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (tx) => {
      const prisma = tx as unknown as typeof this.prisma;

      // Re-fetch payment inside transaction to prevent stale amount/status reads
      const txPayment = await prisma.payment.findFirst({
        where: { id: paymentId, tenant_id: tenantId },
      });
      if (!txPayment || txPayment.status !== 'posted') {
        throw new BadRequestException({
          code: 'INVALID_STATUS',
          message: 'Payment status changed concurrently',
        });
      }

      // Re-fetch existing allocations INSIDE the transaction to prevent race conditions
      const existingAllocations = await prisma.paymentAllocation.findMany({
        where: { payment_id: paymentId },
      });
      const allocatedTotal = existingAllocations.reduce(
        (sum, a) => sum + Number(a.allocated_amount),
        0,
      );
      const remaining = roundMoney(Number(txPayment.amount) - allocatedTotal);
      if (roundMoney(newTotal) > remaining + 0.01) {
        throw new BadRequestException({
          code: 'ALLOCATION_EXCEEDS_PAYMENT',
          message: `Total allocations (${roundMoney(newTotal)}) exceed remaining payment amount (${remaining})`,
        });
      }

      // Validate each allocation against invoice balance INSIDE the transaction
      for (const alloc of dto.allocations) {
        const invoice = await prisma.invoice.findFirst({
          where: { id: alloc.invoice_id, tenant_id: tenantId },
        });
        if (!invoice) {
          throw new BadRequestException({
            code: 'INVOICE_NOT_FOUND',
            message: `Invoice "${alloc.invoice_id}" not found`,
          });
        }
        if (invoice.household_id !== txPayment.household_id) {
          throw new BadRequestException({
            code: 'HOUSEHOLD_MISMATCH',
            message: `Invoice "${alloc.invoice_id}" belongs to a different household`,
          });
        }
        if (roundMoney(alloc.amount) > Number(invoice.balance_amount) + 0.01) {
          throw new BadRequestException({
            code: 'ALLOCATION_EXCEEDS_BALANCE',
            message: `Allocation amount (${alloc.amount}) exceeds invoice balance (${Number(invoice.balance_amount)}) for invoice "${invoice.invoice_number}"`,
          });
        }
      }

      // Create allocation records
      for (const alloc of dto.allocations) {
        await prisma.paymentAllocation.create({
          data: {
            tenant_id: tenantId,
            payment_id: paymentId,
            invoice_id: alloc.invoice_id,
            allocated_amount: alloc.amount,
          },
        });
      }

      // Recalculate invoice balances
      for (const alloc of dto.allocations) {
        await this.invoicesService.recalculateBalance(tenantId, alloc.invoice_id, prisma);
      }

      // Generate receipt if none exists
      const existingReceipt = await prisma.receipt.findFirst({
        where: { payment_id: paymentId },
      });
      if (!existingReceipt) {
        await this.receiptsService.createForPayment(tenantId, paymentId, userId, 'en', tx);
      }
    });

    // Read after commit so allocations are visible
    return this.findOne(tenantId, paymentId);
  }

  async getAcceptingStaff(tenantId: string) {
    const payments = await this.prisma.payment.findMany({
      where: {
        tenant_id: tenantId,
        posted_by_user_id: { not: null },
      },
      distinct: ['posted_by_user_id'],
      select: {
        posted_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    return payments
      .filter((p) => p.posted_by !== null)
      .map((p) => ({
        id: p.posted_by!.id,
        name: `${p.posted_by!.first_name} ${p.posted_by!.last_name}`,
      }));
  }
}
