import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type {
  ApplyCreditNoteDto,
  ApprovePaymentPlanDto,
  BulkExportDto,
  BulkInvoiceIdsDto,
  CounterOfferPaymentPlanDto,
  CreateCreditNoteDto,
  CreateLateFeeConfigDto,
  CreateRecurringInvoiceConfigDto,
  CreateScholarshipDto,
  FinanceAuditQueryDto,
  JwtPayload,
  LateFeeConfigQueryDto,
  PaymentPlanRequestQueryDto,
  RecurringInvoiceConfigQueryDto,
  RejectPaymentPlanDto,
  RevokeScholarshipDto,
  ScholarshipQueryDto,
  TenantContext,
  UpdateLateFeeConfigDto,
  UpdateRecurringInvoiceConfigDto,
} from '@school/shared';
import {
  applyCreditNoteSchema,
  approvePaymentPlanSchema,
  bulkExportSchema,
  bulkInvoiceIdsSchema,
  counterOfferPaymentPlanSchema,
  createCreditNoteSchema,
  createLateFeeConfigSchema,
  createRecurringInvoiceConfigSchema,
  createScholarshipSchema,
  creditNoteQuerySchema,
  financeAuditQuerySchema,
  lateFeeConfigQuerySchema,
  paymentPlanRequestQuerySchema,
  recurringInvoiceConfigQuerySchema,
  rejectPaymentPlanSchema,
  revokeScholarshipSchema,
  scholarshipQuerySchema,
  updateLateFeeConfigSchema,
  updateRecurringInvoiceConfigSchema,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BulkOperationsService } from './bulk-operations.service';
import { CreditNotesService } from './credit-notes.service';
import { FinanceAuditService } from './finance-audit.service';
import type {
  AgingReport,
  CollectionByYearGroup,
  FeeStructurePerformance,
  PaymentMethodBreakdown,
  RevenuePeriodItem,
} from './financial-reports.service';
import { FinancialReportsService } from './financial-reports.service';
import { LateFeesService } from './late-fees.service';
import { PaymentPlansService } from './payment-plans.service';
import { PaymentRemindersService } from './payment-reminders.service';
import { RecurringInvoicesService } from './recurring-invoices.service';
import { ScholarshipsService } from './scholarships.service';

const reportQuerySchema = z.object({
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

@Controller('v1/finance')
@UseGuards(AuthGuard, PermissionGuard)
export class FinanceEnhancedController {
  constructor(
    private readonly creditNotesService: CreditNotesService,
    private readonly lateFeesService: LateFeesService,
    private readonly scholarshipsService: ScholarshipsService,
    private readonly paymentRemindersService: PaymentRemindersService,
    private readonly recurringInvoicesService: RecurringInvoicesService,
    private readonly financialReportsService: FinancialReportsService,
    private readonly paymentPlansService: PaymentPlansService,
    private readonly financeAuditService: FinanceAuditService,
    private readonly bulkOperationsService: BulkOperationsService,
  ) {}

  // ─── Credit Notes ─────────────────────────────────────────────────────────

  @Get('credit-notes')
  @RequiresPermission('finance.view')
  async getCreditNotes(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(creditNoteQuerySchema))
    query: z.infer<typeof creditNoteQuerySchema>,
  ) {
    return this.creditNotesService.findAll(tenant.tenant_id, query);
  }

  @Get('credit-notes/:id')
  @RequiresPermission('finance.view')
  async getCreditNote(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.creditNotesService.findOne(tenant.tenant_id, id);
  }

  @Post('credit-notes')
  @RequiresPermission('finance.manage_credit_notes')
  @HttpCode(HttpStatus.CREATED)
  async createCreditNote(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createCreditNoteSchema)) dto: CreateCreditNoteDto,
  ) {
    return this.creditNotesService.create(tenant.tenant_id, user.sub, dto);
  }

  @Post('credit-notes/apply')
  @RequiresPermission('finance.manage_credit_notes')
  @HttpCode(HttpStatus.OK)
  async applyCreditNote(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(applyCreditNoteSchema)) dto: ApplyCreditNoteDto,
  ) {
    return this.creditNotesService.applyToInvoice(tenant.tenant_id, user.sub, dto);
  }

  // ─── Late Fees ────────────────────────────────────────────────────────────

  @Get('late-fee-configs')
  @RequiresPermission('finance.view')
  async getLateFeeConfigs(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(lateFeeConfigQuerySchema)) query: LateFeeConfigQueryDto,
  ) {
    return this.lateFeesService.findAllConfigs(tenant.tenant_id, query);
  }

  @Get('late-fee-configs/:id')
  @RequiresPermission('finance.view')
  async getLateFeeConfig(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.lateFeesService.findOneConfig(tenant.tenant_id, id);
  }

  @Post('late-fee-configs')
  @RequiresPermission('finance.manage_late_fees')
  @HttpCode(HttpStatus.CREATED)
  async createLateFeeConfig(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createLateFeeConfigSchema)) dto: CreateLateFeeConfigDto,
  ) {
    return this.lateFeesService.createConfig(tenant.tenant_id, dto);
  }

  @Put('late-fee-configs/:id')
  @RequiresPermission('finance.manage_late_fees')
  async updateLateFeeConfig(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLateFeeConfigSchema)) dto: UpdateLateFeeConfigDto,
  ) {
    return this.lateFeesService.updateConfig(tenant.tenant_id, id, dto);
  }

  @Post('invoices/:id/apply-late-fee')
  @RequiresPermission('finance.manage_late_fees')
  @HttpCode(HttpStatus.OK)
  async applyLateFee(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('config_id') configId?: string,
  ) {
    return this.lateFeesService.applyLateFee(tenant.tenant_id, id, configId);
  }

  // ─── Scholarships ─────────────────────────────────────────────────────────

  @Get('scholarships')
  @RequiresPermission('finance.view')
  async getScholarships(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(scholarshipQuerySchema)) query: ScholarshipQueryDto,
  ) {
    return this.scholarshipsService.findAll(tenant.tenant_id, query);
  }

  @Get('scholarships/:id')
  @RequiresPermission('finance.view')
  async getScholarship(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.scholarshipsService.findOne(tenant.tenant_id, id);
  }

  @Post('scholarships')
  @RequiresPermission('finance.manage_scholarships')
  @HttpCode(HttpStatus.CREATED)
  async createScholarship(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createScholarshipSchema)) dto: CreateScholarshipDto,
  ) {
    return this.scholarshipsService.create(tenant.tenant_id, user.sub, dto);
  }

  @Post('scholarships/:id/revoke')
  @RequiresPermission('finance.manage_scholarships')
  @HttpCode(HttpStatus.OK)
  async revokeScholarship(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(revokeScholarshipSchema)) dto: RevokeScholarshipDto,
  ) {
    return this.scholarshipsService.revoke(tenant.tenant_id, id, dto);
  }

  // ─── Payment Reminders ────────────────────────────────────────────────────

  @Post('reminders/due-soon')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async sendDueSoonReminders(@CurrentTenant() tenant: TenantContext) {
    const count = await this.paymentRemindersService.sendDueSoonReminders(tenant.tenant_id);
    return { sent: count };
  }

  @Post('reminders/overdue')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async sendOverdueReminders(@CurrentTenant() tenant: TenantContext) {
    const count = await this.paymentRemindersService.sendOverdueReminders(tenant.tenant_id);
    return { sent: count };
  }

  @Post('reminders/final-notice')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async sendFinalNotices(@CurrentTenant() tenant: TenantContext) {
    const count = await this.paymentRemindersService.sendFinalNotices(tenant.tenant_id);
    return { sent: count };
  }

  // ─── Recurring Invoices ───────────────────────────────────────────────────

  @Get('recurring-configs')
  @RequiresPermission('finance.view')
  async getRecurringConfigs(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(recurringInvoiceConfigQuerySchema))
    query: RecurringInvoiceConfigQueryDto,
  ) {
    return this.recurringInvoicesService.findAllConfigs(tenant.tenant_id, query);
  }

  @Get('recurring-configs/:id')
  @RequiresPermission('finance.view')
  async getRecurringConfig(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.recurringInvoicesService.findOneConfig(tenant.tenant_id, id);
  }

  @Post('recurring-configs')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.CREATED)
  async createRecurringConfig(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createRecurringInvoiceConfigSchema))
    dto: CreateRecurringInvoiceConfigDto,
  ) {
    return this.recurringInvoicesService.createConfig(tenant.tenant_id, dto);
  }

  @Put('recurring-configs/:id')
  @RequiresPermission('finance.manage')
  async updateRecurringConfig(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRecurringInvoiceConfigSchema))
    dto: UpdateRecurringInvoiceConfigDto,
  ) {
    return this.recurringInvoicesService.updateConfig(tenant.tenant_id, id, dto);
  }

  @Post('recurring-configs/generate')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async generateDueInvoices(@CurrentTenant() tenant: TenantContext) {
    const count = await this.recurringInvoicesService.generateDueInvoices(tenant.tenant_id);
    return { generated: count };
  }

  // ─── Financial Reports ────────────────────────────────────────────────────

  @Get('reports/aging')
  @RequiresPermission('finance.view_reports')
  async getAgingReport(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: z.infer<typeof reportQuerySchema>,
  ): Promise<AgingReport> {
    return this.financialReportsService.agingReport(tenant.tenant_id, query);
  }

  @Get('reports/revenue-by-period')
  @RequiresPermission('finance.view_reports')
  async getRevenueByPeriod(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: z.infer<typeof reportQuerySchema>,
  ): Promise<RevenuePeriodItem[]> {
    return this.financialReportsService.revenueByPeriod(tenant.tenant_id, query);
  }

  @Get('reports/collection-by-year-group')
  @RequiresPermission('finance.view_reports')
  async getCollectionByYearGroup(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: z.infer<typeof reportQuerySchema>,
  ): Promise<CollectionByYearGroup[]> {
    return this.financialReportsService.collectionByYearGroup(tenant.tenant_id, query);
  }

  @Get('reports/payment-methods')
  @RequiresPermission('finance.view_reports')
  async getPaymentMethodBreakdown(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: z.infer<typeof reportQuerySchema>,
  ): Promise<PaymentMethodBreakdown[]> {
    return this.financialReportsService.paymentMethodBreakdown(tenant.tenant_id, query);
  }

  @Get('reports/fee-structure-performance')
  @RequiresPermission('finance.view_reports')
  async getFeeStructurePerformance(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: z.infer<typeof reportQuerySchema>,
  ): Promise<FeeStructurePerformance[]> {
    return this.financialReportsService.feeStructurePerformance(tenant.tenant_id, query);
  }

  // ─── Payment Plans ────────────────────────────────────────────────────────

  @Get('payment-plans')
  @RequiresPermission('finance.view')
  async getPaymentPlans(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(paymentPlanRequestQuerySchema)) query: PaymentPlanRequestQueryDto,
  ) {
    return this.paymentPlansService.findAll(tenant.tenant_id, query);
  }

  @Get('payment-plans/:id')
  @RequiresPermission('finance.view')
  async getPaymentPlan(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentPlansService.findOne(tenant.tenant_id, id);
  }

  @Post('payment-plans/:id/approve')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async approvePlan(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approvePaymentPlanSchema)) dto: ApprovePaymentPlanDto,
  ) {
    return this.paymentPlansService.approvePlan(tenant.tenant_id, user.sub, id, dto);
  }

  @Post('payment-plans/:id/reject')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async rejectPlan(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectPaymentPlanSchema)) dto: RejectPaymentPlanDto,
  ) {
    return this.paymentPlansService.rejectPlan(tenant.tenant_id, user.sub, id, dto);
  }

  @Post('payment-plans/:id/counter-offer')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async counterOffer(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(counterOfferPaymentPlanSchema)) dto: CounterOfferPaymentPlanDto,
  ) {
    return this.paymentPlansService.counterOffer(tenant.tenant_id, user.sub, id, dto);
  }

  // ─── Audit Trail ──────────────────────────────────────────────────────────

  @Get('audit-trail')
  @RequiresPermission('finance.view')
  async getAuditTrail(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(financeAuditQuerySchema)) query: FinanceAuditQueryDto,
  ) {
    return this.financeAuditService.getAuditTrail(tenant.tenant_id, query);
  }

  // ─── Bulk Operations ──────────────────────────────────────────────────────

  @Post('bulk/issue')
  @RequiresPermission('finance.bulk_operations')
  @HttpCode(HttpStatus.OK)
  async bulkIssue(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(bulkInvoiceIdsSchema)) dto: BulkInvoiceIdsDto,
  ) {
    return this.bulkOperationsService.bulkIssue(tenant.tenant_id, user.sub, dto);
  }

  @Post('bulk/void')
  @RequiresPermission('finance.bulk_operations')
  @HttpCode(HttpStatus.OK)
  async bulkVoid(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(bulkInvoiceIdsSchema)) dto: BulkInvoiceIdsDto,
  ) {
    return this.bulkOperationsService.bulkVoid(tenant.tenant_id, dto);
  }

  @Post('bulk/remind')
  @RequiresPermission('finance.bulk_operations')
  @HttpCode(HttpStatus.OK)
  async bulkRemind(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(bulkInvoiceIdsSchema)) dto: BulkInvoiceIdsDto,
  ) {
    return this.bulkOperationsService.bulkRemind(tenant.tenant_id, dto);
  }

  @Post('bulk/export')
  @RequiresPermission('finance.bulk_operations')
  @HttpCode(HttpStatus.OK)
  async bulkExport(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(bulkExportSchema)) dto: BulkExportDto,
  ) {
    return this.bulkOperationsService.bulkExport(tenant.tenant_id, dto);
  }
}
