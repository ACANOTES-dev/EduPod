import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  checkoutSessionSchema,
  requestPaymentPlanSchema,
} from '@school/shared';
import type { JwtPayload, RequestPaymentPlanDto, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

import { InvoicesService } from './invoices.service';
import { PaymentPlansService } from './payment-plans.service';
import { StripeService } from './stripe.service';

@Controller('v1/parent')
@UseGuards(AuthGuard, PermissionGuard)
export class ParentFinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
    private readonly stripeService: StripeService,
    private readonly paymentPlansService: PaymentPlansService,
  ) {}

  /**
   * Parent views all invoices for a student (their household).
   */
  @Get('students/:studentId/finances')
  @RequiresPermission('parent.view_finances')
  async getStudentFinances(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    const household = await this.getHouseholdForParentAndStudent(
      user.sub,
      tenant.tenant_id,
      studentId,
    );

    const [invoicesResult, payments] = await Promise.all([
      this.invoicesService.findAll(
        tenant.tenant_id,
        { page: 1, pageSize: 50 },
        [household.id],
      ),
      this.prisma.payment.findMany({
        where: {
          tenant_id: tenant.tenant_id,
          household_id: household.id,
          status: { in: ['posted', 'refunded_partial', 'refunded_full'] },
        },
        select: {
          id: true,
          payment_reference: true,
          payment_method: true,
          amount: true,
          received_at: true,
          status: true,
        },
        orderBy: { received_at: 'desc' },
        take: 50,
      }),
    ]);

    const totalBalance = invoicesResult.data.reduce(
      (sum: number, inv: { balance_amount?: unknown }) => sum + Number(inv.balance_amount ?? 0),
      0,
    );

    return {
      household_id: household.id,
      household_name: household.household_name,
      total_outstanding_balance: Math.round(totalBalance * 100) / 100,
      invoices: invoicesResult.data,
      payment_history: payments.map((p) => ({
        ...p,
        amount: Number(p.amount),
      })),
    };
  }

  /**
   * Parent initiates Stripe checkout for an invoice.
   */
  @Post('invoices/:id/pay')
  @RequiresPermission('parent.make_payments')
  @HttpCode(HttpStatus.OK)
  async payInvoice(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(checkoutSessionSchema))
    dto: { success_url: string; cancel_url: string },
  ): Promise<{ session_id: string; checkout_url: string }> {
    // Verify parent owns this invoice
    await this.verifyParentInvoiceAccess(user.sub, tenant.tenant_id, id);

    return this.stripeService.createCheckoutSession(tenant.tenant_id, id, dto);
  }

  /**
   * Parent requests a payment plan for an invoice.
   */
  @Post('invoices/:id/request-payment-plan')
  @RequiresPermission('parent.view_finances')
  @HttpCode(HttpStatus.CREATED)
  async requestPaymentPlan(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(requestPaymentPlanSchema)) dto: RequestPaymentPlanDto,
  ) {
    // Verify parent owns this invoice
    await this.verifyParentInvoiceAccess(user.sub, tenant.tenant_id, id);

    return this.paymentPlansService.requestPlan(tenant.tenant_id, user.sub, id, dto);
  }

  /**
   * Parent accepts a counter-offer from admin.
   */
  @Post('payment-plans/:id/accept')
  @RequiresPermission('parent.view_finances')
  @HttpCode(HttpStatus.OK)
  async acceptCounterOffer(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentPlansService.acceptCounterOffer(tenant.tenant_id, user.sub, id);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getHouseholdForParentAndStudent(
    userId: string,
    tenantId: string,
    studentId: string,
  ) {
    const parent = await this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
    });

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent profile found for the current user',
      });
    }

    const studentParent = await this.prisma.studentParent.findUnique({
      where: {
        student_id_parent_id: {
          student_id: studentId,
          parent_id: parent.id,
        },
      },
      include: {
        student: {
          select: { household_id: true },
        },
      },
    });

    if (!studentParent || studentParent.tenant_id !== tenantId) {
      throw new ForbiddenException({
        code: 'NOT_LINKED_TO_STUDENT',
        message: 'You are not linked to this student',
      });
    }

    const household = await this.prisma.household.findFirst({
      where: { id: studentParent.student.household_id, tenant_id: tenantId },
    });

    if (!household) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found',
      });
    }

    return household;
  }

  private async verifyParentInvoiceAccess(
    userId: string,
    tenantId: string,
    invoiceId: string,
  ): Promise<void> {
    const parent = await this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
    });

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent profile found for the current user',
      });
    }

    // Get all household IDs for this parent's students
    const studentParents = await this.prisma.studentParent.findMany({
      where: { parent_id: parent.id, tenant_id: tenantId },
      include: { student: { select: { household_id: true } } },
    });

    const householdIds = studentParents.map((sp) => sp.student.household_id);

    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        tenant_id: tenantId,
        household_id: { in: householdIds },
      },
    });

    if (!invoice) {
      throw new ForbiddenException({
        code: 'INVOICE_ACCESS_DENIED',
        message: 'Invoice not found or access denied',
      });
    }
  }
}
