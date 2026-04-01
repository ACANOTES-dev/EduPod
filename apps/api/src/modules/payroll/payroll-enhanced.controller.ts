import {
  Body,
  Controller,
  Delete,
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

import {
  autoPopulateDeliverySchema,
  bulkMarkAttendanceSchema,
  calculateClassesTaughtSchema,
  calculateDaysWorkedSchema,
  classDeliveryQuerySchema,
  confirmDeliverySchema,
  createAdjustmentSchema,
  createAllowanceTypeSchema,
  createExportTemplateSchema,
  createOneOffItemSchema,
  createRecurringDeductionSchema,
  createStaffAllowanceSchema,
  emailToAccountantSchema,
  generateExportSchema,
  markAttendanceSchema,
  payrollAnalyticsQuerySchema,
  payrollCalendarQuerySchema,
  staffAttendanceQuerySchema,
  updateAdjustmentSchema,
  updateAllowanceTypeSchema,
  updateExportTemplateSchema,
  updateOneOffItemSchema,
  updateRecurringDeductionSchema,
  updateStaffAllowanceSchema,
} from '@school/shared';
import type {
  AutoPopulateDeliveryDto,
  BulkMarkAttendanceDto,
  CalculateClassesTaughtDto,
  CalculateDaysWorkedDto,
  ClassDeliveryQueryDto,
  ConfirmDeliveryDto,
  CreateAdjustmentDto,
  CreateAllowanceTypeDto,
  CreateExportTemplateDto,
  CreateOneOffItemDto,
  CreateRecurringDeductionDto,
  CreateStaffAllowanceDto,
  EmailToAccountantDto,
  GenerateExportDto,
  JwtPayload,
  MarkAttendanceDto,
  StaffAttendanceQueryDto,
  TenantContext,
  UpdateAdjustmentDto,
  UpdateAllowanceTypeDto,
  UpdateExportTemplateDto,
  UpdateOneOffItemDto,
  UpdateRecurringDeductionDto,
  UpdateStaffAllowanceDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ClassDeliveryService } from './class-delivery.service';
import { PayrollAdjustmentsService } from './payroll-adjustments.service';
import { PayrollAllowancesService } from './payroll-allowances.service';
import { PayrollAnalyticsService } from './payroll-analytics.service';
import { PayrollAnomalyService } from './payroll-anomaly.service';
import { PayrollCalendarService } from './payroll-calendar.service';
import { PayrollDeductionsService } from './payroll-deductions.service';
import { PayrollExportsService } from './payroll-exports.service';
import { PayrollOneOffsService } from './payroll-one-offs.service';
import { StaffAttendanceService } from './staff-attendance.service';

@Controller('v1/payroll')
@UseGuards(AuthGuard, PermissionGuard)
export class PayrollEnhancedController {
  constructor(
    private readonly staffAttendanceService: StaffAttendanceService,
    private readonly classDeliveryService: ClassDeliveryService,
    private readonly adjustmentsService: PayrollAdjustmentsService,
    private readonly exportsService: PayrollExportsService,
    private readonly allowancesService: PayrollAllowancesService,
    private readonly oneOffsService: PayrollOneOffsService,
    private readonly deductionsService: PayrollDeductionsService,
    private readonly analyticsService: PayrollAnalyticsService,
    private readonly anomalyService: PayrollAnomalyService,
    private readonly calendarService: PayrollCalendarService,
  ) {}

  // ─── Staff Attendance ────────────────────────────────────────────────────────

  @Post('attendance')
  @RequiresPermission('payroll.create_run')
  @HttpCode(HttpStatus.CREATED)
  async markAttendance(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(markAttendanceSchema)) dto: MarkAttendanceDto,
  ) {
    return this.staffAttendanceService.markAttendance(tenant.tenant_id, user.sub, dto);
  }

  @Post('attendance/bulk')
  @RequiresPermission('payroll.create_run')
  @HttpCode(HttpStatus.OK)
  async bulkMarkAttendance(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(bulkMarkAttendanceSchema)) dto: BulkMarkAttendanceDto,
  ) {
    return this.staffAttendanceService.bulkMarkAttendance(tenant.tenant_id, user.sub, dto);
  }

  @Get('attendance/daily')
  @RequiresPermission('payroll.view')
  async getDailyAttendance(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(staffAttendanceQuerySchema))
    query: z.infer<typeof staffAttendanceQuerySchema>,
  ) {
    return this.staffAttendanceService.getDailyAttendance(
      tenant.tenant_id,
      query as StaffAttendanceQueryDto,
    );
  }

  @Get('attendance/monthly')
  @RequiresPermission('payroll.view')
  async getMonthlyAttendance(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(staffAttendanceQuerySchema))
    query: z.infer<typeof staffAttendanceQuerySchema>,
  ) {
    return this.staffAttendanceService.getMonthlyAttendance(
      tenant.tenant_id,
      query as StaffAttendanceQueryDto,
    );
  }

  @Get('attendance/:id')
  @RequiresPermission('payroll.view')
  async getAttendanceRecord(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staffAttendanceService.getRecord(tenant.tenant_id, id);
  }

  @Delete('attendance/:id')
  @RequiresPermission('payroll.create_run')
  @HttpCode(HttpStatus.OK)
  async deleteAttendanceRecord(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staffAttendanceService.deleteRecord(tenant.tenant_id, id);
  }

  @Post('attendance/calculate-days-worked')
  @RequiresPermission('payroll.view')
  @HttpCode(HttpStatus.OK)
  async calculateDaysWorked(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(calculateDaysWorkedSchema)) dto: CalculateDaysWorkedDto,
  ) {
    return this.staffAttendanceService.calculateDaysWorked(tenant.tenant_id, dto);
  }

  // ─── Class Delivery ──────────────────────────────────────────────────────────

  @Post('class-delivery/auto-populate')
  @RequiresPermission('payroll.create_run')
  @HttpCode(HttpStatus.OK)
  async autoPopulateDelivery(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(autoPopulateDeliverySchema)) dto: AutoPopulateDeliveryDto,
  ) {
    return this.classDeliveryService.autoPopulateFromSchedule(tenant.tenant_id, user.sub, dto);
  }

  @Get('class-delivery')
  @RequiresPermission('payroll.view')
  async getDeliveryRecords(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(classDeliveryQuerySchema))
    query: z.infer<typeof classDeliveryQuerySchema>,
  ) {
    return this.classDeliveryService.getDeliveryRecords(
      tenant.tenant_id,
      query as ClassDeliveryQueryDto,
    );
  }

  @Put('class-delivery/:id/confirm')
  @RequiresPermission('payroll.create_run')
  async confirmDelivery(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(confirmDeliverySchema)) dto: ConfirmDeliveryDto,
  ) {
    return this.classDeliveryService.confirmDelivery(tenant.tenant_id, id, user.sub, dto);
  }

  @Post('class-delivery/calculate-classes-taught')
  @RequiresPermission('payroll.view')
  @HttpCode(HttpStatus.OK)
  async calculateClassesTaught(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(calculateClassesTaughtSchema)) dto: CalculateClassesTaughtDto,
  ) {
    return this.classDeliveryService.calculateClassesTaught(tenant.tenant_id, dto);
  }

  // ─── Adjustments ─────────────────────────────────────────────────────────────

  @Post('runs/:runId/adjustments')
  @RequiresPermission('payroll.create_run')
  @HttpCode(HttpStatus.CREATED)
  async createAdjustment(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body(new ZodValidationPipe(createAdjustmentSchema)) dto: CreateAdjustmentDto,
  ) {
    return this.adjustmentsService.createAdjustment(tenant.tenant_id, runId, user.sub, dto);
  }

  @Get('entries/:entryId/adjustments')
  @RequiresPermission('payroll.view')
  async listAdjustments(
    @CurrentTenant() tenant: TenantContext,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.adjustmentsService.listAdjustments(tenant.tenant_id, entryId);
  }

  @Put('adjustments/:id')
  @RequiresPermission('payroll.create_run')
  async updateAdjustment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAdjustmentSchema)) dto: UpdateAdjustmentDto,
  ) {
    return this.adjustmentsService.updateAdjustment(tenant.tenant_id, id, dto);
  }

  @Delete('adjustments/:id')
  @RequiresPermission('payroll.create_run')
  @HttpCode(HttpStatus.OK)
  async deleteAdjustment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adjustmentsService.deleteAdjustment(tenant.tenant_id, id);
  }

  // ─── Export Templates ────────────────────────────────────────────────────────

  @Post('export-templates')
  @RequiresPermission('payroll.generate_payslips')
  @HttpCode(HttpStatus.CREATED)
  async createExportTemplate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createExportTemplateSchema)) dto: CreateExportTemplateDto,
  ) {
    return this.exportsService.createTemplate(tenant.tenant_id, user.sub, dto);
  }

  @Get('export-templates')
  @RequiresPermission('payroll.view')
  async listExportTemplates(@CurrentTenant() tenant: TenantContext) {
    return this.exportsService.listTemplates(tenant.tenant_id);
  }

  @Get('export-templates/:id')
  @RequiresPermission('payroll.view')
  async getExportTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exportsService.getTemplate(tenant.tenant_id, id);
  }

  @Put('export-templates/:id')
  @RequiresPermission('payroll.generate_payslips')
  async updateExportTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateExportTemplateSchema)) dto: UpdateExportTemplateDto,
  ) {
    return this.exportsService.updateTemplate(tenant.tenant_id, id, dto);
  }

  @Delete('export-templates/:id')
  @RequiresPermission('payroll.generate_payslips')
  @HttpCode(HttpStatus.OK)
  async deleteExportTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exportsService.deleteTemplate(tenant.tenant_id, id);
  }

  @Post('runs/:runId/export')
  @RequiresPermission('payroll.generate_payslips')
  @HttpCode(HttpStatus.OK)
  async generateExport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body(new ZodValidationPipe(generateExportSchema)) dto: GenerateExportDto,
  ) {
    return this.exportsService.generateExport(tenant.tenant_id, runId, user.sub, dto);
  }

  @Get('runs/:runId/export-history')
  @RequiresPermission('payroll.view')
  async getExportHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.exportsService.getExportHistory(tenant.tenant_id, runId);
  }

  @Post('runs/:runId/email-to-accountant')
  @RequiresPermission('payroll.generate_payslips')
  @HttpCode(HttpStatus.OK)
  async emailToAccountant(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body(new ZodValidationPipe(emailToAccountantSchema)) dto: EmailToAccountantDto,
  ) {
    return this.exportsService.emailToAccountant(tenant.tenant_id, runId, user.sub, dto);
  }

  // ─── Allowance Types ─────────────────────────────────────────────────────────

  @Post('allowance-types')
  @RequiresPermission('payroll.manage_compensation')
  @HttpCode(HttpStatus.CREATED)
  async createAllowanceType(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createAllowanceTypeSchema)) dto: CreateAllowanceTypeDto,
  ) {
    return this.allowancesService.createAllowanceType(tenant.tenant_id, dto);
  }

  @Get('allowance-types')
  @RequiresPermission('payroll.view')
  async listAllowanceTypes(@CurrentTenant() tenant: TenantContext) {
    return this.allowancesService.listAllowanceTypes(tenant.tenant_id);
  }

  @Get('allowance-types/:id')
  @RequiresPermission('payroll.view')
  async getAllowanceType(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.allowancesService.getAllowanceType(tenant.tenant_id, id);
  }

  @Put('allowance-types/:id')
  @RequiresPermission('payroll.manage_compensation')
  async updateAllowanceType(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAllowanceTypeSchema)) dto: UpdateAllowanceTypeDto,
  ) {
    return this.allowancesService.updateAllowanceType(tenant.tenant_id, id, dto);
  }

  @Delete('allowance-types/:id')
  @RequiresPermission('payroll.manage_compensation')
  @HttpCode(HttpStatus.OK)
  async deleteAllowanceType(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.allowancesService.deleteAllowanceType(tenant.tenant_id, id);
  }

  // ─── Staff Allowances ─────────────────────────────────────────────────────────

  @Post('staff-allowances')
  @RequiresPermission('payroll.manage_compensation')
  @HttpCode(HttpStatus.CREATED)
  async createStaffAllowance(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createStaffAllowanceSchema)) dto: CreateStaffAllowanceDto,
  ) {
    return this.allowancesService.createStaffAllowance(tenant.tenant_id, dto);
  }

  @Get('staff-allowances')
  @RequiresPermission('payroll.view')
  async listStaffAllowances(
    @CurrentTenant() tenant: TenantContext,
    @Query('staff_profile_id', ParseUUIDPipe) staffProfileId: string,
  ) {
    return this.allowancesService.listStaffAllowances(tenant.tenant_id, staffProfileId);
  }

  @Put('staff-allowances/:id')
  @RequiresPermission('payroll.manage_compensation')
  async updateStaffAllowance(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStaffAllowanceSchema)) dto: UpdateStaffAllowanceDto,
  ) {
    return this.allowancesService.updateStaffAllowance(tenant.tenant_id, id, dto);
  }

  @Delete('staff-allowances/:id')
  @RequiresPermission('payroll.manage_compensation')
  @HttpCode(HttpStatus.OK)
  async deleteStaffAllowance(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.allowancesService.deleteStaffAllowance(tenant.tenant_id, id);
  }

  // ─── One-Off Items ───────────────────────────────────────────────────────────

  @Post('entries/:entryId/one-offs')
  @RequiresPermission('payroll.create_run')
  @HttpCode(HttpStatus.CREATED)
  async createOneOffItem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body(new ZodValidationPipe(createOneOffItemSchema)) dto: CreateOneOffItemDto,
  ) {
    return this.oneOffsService.createOneOffItem(tenant.tenant_id, entryId, user.sub, dto);
  }

  @Get('entries/:entryId/one-offs')
  @RequiresPermission('payroll.view')
  async listOneOffItems(
    @CurrentTenant() tenant: TenantContext,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.oneOffsService.listOneOffItems(tenant.tenant_id, entryId);
  }

  @Put('one-offs/:id')
  @RequiresPermission('payroll.create_run')
  async updateOneOffItem(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateOneOffItemSchema)) dto: UpdateOneOffItemDto,
  ) {
    return this.oneOffsService.updateOneOffItem(tenant.tenant_id, id, dto);
  }

  @Delete('one-offs/:id')
  @RequiresPermission('payroll.create_run')
  @HttpCode(HttpStatus.OK)
  async deleteOneOffItem(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.oneOffsService.deleteOneOffItem(tenant.tenant_id, id);
  }

  // ─── Recurring Deductions ────────────────────────────────────────────────────

  @Post('deductions')
  @RequiresPermission('payroll.manage_compensation')
  @HttpCode(HttpStatus.CREATED)
  async createDeduction(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createRecurringDeductionSchema)) dto: CreateRecurringDeductionDto,
  ) {
    return this.deductionsService.createDeduction(tenant.tenant_id, user.sub, dto);
  }

  @Get('deductions')
  @RequiresPermission('payroll.view')
  async listDeductions(
    @CurrentTenant() tenant: TenantContext,
    @Query('staff_profile_id', ParseUUIDPipe) staffProfileId: string,
  ) {
    return this.deductionsService.listDeductions(tenant.tenant_id, staffProfileId);
  }

  @Get('deductions/:id')
  @RequiresPermission('payroll.view')
  async getDeduction(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deductionsService.getDeduction(tenant.tenant_id, id);
  }

  @Put('deductions/:id')
  @RequiresPermission('payroll.manage_compensation')
  async updateDeduction(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRecurringDeductionSchema)) dto: UpdateRecurringDeductionDto,
  ) {
    return this.deductionsService.updateDeduction(tenant.tenant_id, id, dto);
  }

  @Delete('deductions/:id')
  @RequiresPermission('payroll.manage_compensation')
  @HttpCode(HttpStatus.OK)
  async deleteDeduction(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deductionsService.deleteDeduction(tenant.tenant_id, id);
  }

  // ─── Analytics ───────────────────────────────────────────────────────────────

  @Get('analytics/cost-dashboard')
  @RequiresPermission('payroll.view_reports')
  async getCostDashboard(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(payrollAnalyticsQuerySchema))
    query: z.infer<typeof payrollAnalyticsQuerySchema>,
  ) {
    return this.analyticsService.getCostDashboard(tenant.tenant_id, query.months);
  }

  @Get('analytics/variance-report/:runId')
  @RequiresPermission('payroll.view_reports')
  async getVarianceReport(
    @CurrentTenant() tenant: TenantContext,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.analyticsService.getVarianceReport(tenant.tenant_id, runId);
  }

  @Get('analytics/month-over-month/:runId')
  @RequiresPermission('payroll.view_reports')
  async getMonthOverMonth(
    @CurrentTenant() tenant: TenantContext,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.analyticsService.getMonthOverMonth(tenant.tenant_id, runId);
  }

  @Get('analytics/forecast')
  @RequiresPermission('payroll.view_reports')
  async getStaffCostForecast(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(payrollAnalyticsQuerySchema))
    query: z.infer<typeof payrollAnalyticsQuerySchema>,
  ) {
    return this.analyticsService.getStaffCostForecast(tenant.tenant_id, query.months);
  }

  // ─── Anomaly Detection ───────────────────────────────────────────────────────

  @Post('runs/:runId/scan-anomalies')
  @RequiresPermission('payroll.view')
  @HttpCode(HttpStatus.OK)
  async scanForAnomalies(
    @CurrentTenant() tenant: TenantContext,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.anomalyService.scanForAnomalies(tenant.tenant_id, runId);
  }

  // ─── Payroll Calendar ────────────────────────────────────────────────────────

  @Get('calendar')
  @RequiresPermission('payroll.view')
  async getPayrollCalendar(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(payrollCalendarQuerySchema))
    query: z.infer<typeof payrollCalendarQuerySchema>,
  ) {
    return this.calendarService.getPayrollCalendar(tenant.tenant_id, query.year);
  }

  @Get('calendar/next-pay-date')
  @RequiresPermission('payroll.view')
  async getNextPayDate(@CurrentTenant() tenant: TenantContext) {
    return this.calendarService.getNextPayDate(tenant.tenant_id);
  }

  @Get('calendar/check-preparation-deadline')
  @RequiresPermission('payroll.view')
  async checkPreparationDeadline(@CurrentTenant() tenant: TenantContext) {
    return this.calendarService.checkPreparationDeadline(tenant.tenant_id);
  }
}
