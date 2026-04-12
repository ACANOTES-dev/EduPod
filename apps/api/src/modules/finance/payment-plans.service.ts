import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

import type {
  ApprovePaymentPlanDto,
  CounterOfferPaymentPlanDto,
  CreateAdminPaymentPlanDto,
  PaymentPlanRequestQueryDto,
  RejectPaymentPlanDto,
  RequestPaymentPlanDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { serializeDecimal } from './helpers/serialize-decimal.helper';

interface ProposedInstallment {
  due_date: string;
  amount: number;
}

@Injectable()
export class PaymentPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: PaymentPlanRequestQueryDto) {
    const { page, pageSize, status } = query;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.paymentPlanRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          invoice: { select: { id: true, invoice_number: true, total_amount: true } },
          household: { select: { id: true, household_name: true } },
        },
      }),
      this.prisma.paymentPlanRequest.count({ where }),
    ]);

    return {
      data: data.map((r) => this.serialize(r)),
      meta: { page, pageSize, total },
    };
  }

  async findOne(tenantId: string, id: string) {
    const request = await this.prisma.paymentPlanRequest.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        invoice: { select: { id: true, invoice_number: true, total_amount: true, due_date: true } },
        household: { select: { id: true, household_name: true } },
      },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'PAYMENT_PLAN_REQUEST_NOT_FOUND',
        message: `Payment plan request "${id}" not found`,
      });
    }

    return this.serialize(request);
  }

  /**
   * Parent requests a payment plan for an invoice.
   */
  async requestPlan(
    tenantId: string,
    parentUserId: string,
    invoiceId: string,
    dto: RequestPaymentPlanDto,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenant_id: tenantId },
    });

    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice "${invoiceId}" not found`,
      });
    }

    if (!['issued', 'partially_paid', 'overdue'].includes(invoice.status)) {
      throw new BadRequestException({
        code: 'INVALID_INVOICE_STATUS',
        message: `Cannot request payment plan for invoice with status "${invoice.status}"`,
      });
    }

    // Check no pending request already exists
    const existingPending = await this.prisma.paymentPlanRequest.findFirst({
      where: {
        tenant_id: tenantId,
        invoice_id: invoiceId,
        status: 'pending',
      },
    });

    if (existingPending) {
      throw new BadRequestException({
        code: 'PENDING_REQUEST_EXISTS',
        message: 'A pending payment plan request already exists for this invoice',
      });
    }

    const installments = dto.proposed_installments as ProposedInstallment[];
    const totalProposed = installments.reduce((sum, i) => sum + i.amount, 0);
    const invoiceBalance = Number(invoice.balance_amount);

    if (Math.abs(totalProposed - invoiceBalance) > 0.01) {
      throw new BadRequestException({
        code: 'INSTALLMENT_SUM_MISMATCH',
        message: `Proposed installments total (${totalProposed}) must equal invoice balance (${invoiceBalance})`,
      });
    }

    const request = await this.prisma.paymentPlanRequest.create({
      data: {
        tenant_id: tenantId,
        invoice_id: invoiceId,
        household_id: invoice.household_id,
        requested_by_parent_id: parentUserId,
        proposed_installments_json: dto.proposed_installments as never,
        reason: dto.reason,
        status: 'pending',
      },
      include: {
        invoice: { select: { id: true, invoice_number: true, total_amount: true } },
        household: { select: { id: true, household_name: true } },
      },
    });

    return this.serialize(request);
  }

  async approvePlan(tenantId: string, adminUserId: string, id: string, dto: ApprovePaymentPlanDto) {
    const request = await this.prisma.paymentPlanRequest.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'PAYMENT_PLAN_REQUEST_NOT_FOUND',
        message: `Payment plan request "${id}" not found`,
      });
    }

    if (request.status !== 'pending') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot approve request with status "${request.status}"`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;

      const updatedRequest = await db.paymentPlanRequest.update({
        where: { id },
        data: {
          status: 'approved',
          admin_notes: dto.admin_notes ?? null,
          reviewed_by_user_id: adminUserId,
          reviewed_at: new Date(),
        },
      });

      // Replace invoice installments with approved plan
      const installments = request.proposed_installments_json as unknown as ProposedInstallment[];

      await db.installment.deleteMany({
        where: { invoice_id: request.invoice_id!, tenant_id: tenantId },
      });

      await db.installment.createMany({
        data: installments.map((i) => ({
          tenant_id: tenantId,
          invoice_id: request.invoice_id!,
          due_date: new Date(i.due_date),
          amount: i.amount,
          status: 'pending',
        })),
      });

      return this.serialize(updatedRequest);
    });
  }

  async rejectPlan(tenantId: string, adminUserId: string, id: string, dto: RejectPaymentPlanDto) {
    const request = await this.prisma.paymentPlanRequest.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'PAYMENT_PLAN_REQUEST_NOT_FOUND',
        message: `Payment plan request "${id}" not found`,
      });
    }

    if (!['pending', 'counter_offered'].includes(request.status)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot reject request with status "${request.status}"`,
      });
    }

    const updated = await this.prisma.paymentPlanRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        admin_notes: dto.admin_notes,
        reviewed_by_user_id: adminUserId,
        reviewed_at: new Date(),
      },
    });

    return this.serialize(updated);
  }

  async counterOffer(
    tenantId: string,
    adminUserId: string,
    id: string,
    dto: CounterOfferPaymentPlanDto,
  ) {
    const request = await this.prisma.paymentPlanRequest.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'PAYMENT_PLAN_REQUEST_NOT_FOUND',
        message: `Payment plan request "${id}" not found`,
      });
    }

    if (request.status !== 'pending') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot counter-offer request with status "${request.status}"`,
      });
    }

    const updated = await this.prisma.paymentPlanRequest.update({
      where: { id },
      data: {
        status: 'counter_offered',
        proposed_installments_json: dto.proposed_installments as never,
        admin_notes: dto.admin_notes ?? null,
        reviewed_by_user_id: adminUserId,
        reviewed_at: new Date(),
      },
    });

    return this.serialize(updated);
  }

  /**
   * Parent accepts a counter-offer from admin.
   */
  async acceptCounterOffer(tenantId: string, parentUserId: string, id: string) {
    const request = await this.prisma.paymentPlanRequest.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'PAYMENT_PLAN_REQUEST_NOT_FOUND',
        message: `Payment plan request "${id}" not found`,
      });
    }

    if (request.status !== 'counter_offered') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Request is not in counter_offered status`,
      });
    }

    if (request.requested_by_parent_id !== parentUserId) {
      throw new ForbiddenException({
        code: 'NOT_AUTHORIZED',
        message: 'Only the requesting parent can accept this counter-offer',
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;

      const updatedRequest = await db.paymentPlanRequest.update({
        where: { id },
        data: { status: 'approved' },
      });

      const installments = request.proposed_installments_json as unknown as ProposedInstallment[];

      await db.installment.deleteMany({
        where: { invoice_id: request.invoice_id!, tenant_id: tenantId },
      });

      await db.installment.createMany({
        data: installments.map((i) => ({
          tenant_id: tenantId,
          invoice_id: request.invoice_id!,
          due_date: new Date(i.due_date),
          amount: i.amount,
          status: 'pending',
        })),
      });

      return this.serialize(updatedRequest);
    });
  }

  // ─── Admin-Created Payment Plans ────────────────────────────────────────────

  /**
   * Admin creates a standalone payment plan for a household.
   * Auto-approved with status 'active'. Not tied to any specific invoice.
   */
  async createAdminPlan(tenantId: string, adminUserId: string, dto: CreateAdminPaymentPlanDto) {
    // Validate household exists via an invoice or fee assignment check
    // (Cannot access Household table directly — owned by households module)
    const hasFinanceRelation = await this.prisma.invoice.findFirst({
      where: { household_id: dto.household_id, tenant_id: tenantId },
      select: { id: true },
    });
    const hasFeeAssignment = hasFinanceRelation
      ? true
      : !!(await this.prisma.householdFeeAssignment.findFirst({
          where: { household_id: dto.household_id, tenant_id: tenantId },
          select: { id: true },
        }));
    if (!hasFinanceRelation && !hasFeeAssignment) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: `Household with id "${dto.household_id}" not found or has no finance records`,
      });
    }

    // Validate installment total equals plan total (original_balance - discount)
    const planTotal = dto.original_balance - (dto.discount_amount ?? 0);
    const installmentTotal = dto.installments.reduce((sum, i) => sum + i.amount, 0);

    if (Math.abs(installmentTotal - planTotal) > 0.01) {
      throw new BadRequestException({
        code: 'INSTALLMENT_SUM_MISMATCH',
        message: `Installments total (${installmentTotal.toFixed(2)}) must equal plan total (${planTotal.toFixed(2)})`,
      });
    }

    if (planTotal <= 0) {
      throw new BadRequestException({
        code: 'INVALID_PLAN_TOTAL',
        message: 'Plan total after discount must be positive',
      });
    }

    const plan = await this.prisma.paymentPlanRequest.create({
      data: {
        tenant_id: tenantId,
        household_id: dto.household_id,
        proposed_installments_json: dto.installments as never,
        status: 'active',
        original_balance: dto.original_balance,
        discount_amount: dto.discount_amount ?? 0,
        discount_reason: dto.discount_reason ?? null,
        admin_notes: dto.admin_notes ?? null,
        created_by_user_id: adminUserId,
      },
      include: {
        household: { select: { id: true, household_name: true } },
      },
    });

    return this.serializeAdminPlan(plan);
  }

  /**
   * Cancel an active admin-created payment plan.
   */
  async cancelPlan(tenantId: string, id: string) {
    const plan = await this.prisma.paymentPlanRequest.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!plan) {
      throw new NotFoundException({
        code: 'PAYMENT_PLAN_NOT_FOUND',
        message: `Payment plan "${id}" not found`,
      });
    }

    if (plan.status !== 'active') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot cancel plan with status "${plan.status}"`,
      });
    }

    const updated = await this.prisma.paymentPlanRequest.update({
      where: { id },
      data: { status: 'cancelled' },
      include: {
        household: { select: { id: true, household_name: true } },
      },
    });

    return this.serializeAdminPlan(updated);
  }

  // ─── Serialization ──────────────────────────────────────────────────────────

  private serialize<T>(
    r: T & { invoice?: { total_amount: Decimal; [k: string]: unknown } | null },
  ): T & {
    invoice?: Omit<{ total_amount: Decimal; [k: string]: unknown }, 'total_amount'> & {
      total_amount: number;
    };
  } {
    return {
      ...r,
      invoice: r.invoice
        ? { ...r.invoice, total_amount: serializeDecimal(r.invoice.total_amount) }
        : undefined,
    };
  }

  private serializeAdminPlan<
    T extends {
      original_balance?: Decimal | null;
      discount_amount?: Decimal | null;
    },
  >(r: T) {
    return {
      ...r,
      original_balance: r.original_balance ? serializeDecimal(r.original_balance) : 0,
      discount_amount: r.discount_amount ? serializeDecimal(r.discount_amount) : 0,
    };
  }
}
