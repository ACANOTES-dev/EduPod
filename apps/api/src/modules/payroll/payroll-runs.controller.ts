import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import {
  createPayrollRunSchema,
  finaliseRunSchema,
  massExportSchema,
  payrollRunQuerySchema,
  updatePayrollRunSchema,
} from '@school/shared';
import type {
  CreatePayrollRunDto,
  FinaliseRunDto,
  JwtPayload,
  MassExportDto,
  TenantContext,
  UpdatePayrollRunDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { PayrollAdjustmentsService } from './payroll-adjustments.service';
import { PayrollAllowancesService } from './payroll-allowances.service';
import { PayrollAnomalyService } from './payroll-anomaly.service';
import { PayrollReportsService } from './payroll-reports.service';
import { PayrollRunsService } from './payroll-runs.service';
import { PayslipsService } from './payslips.service';

@Controller('v1/payroll/runs')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
@ModuleEnabled('payroll')
export class PayrollRunsController {
  constructor(
    private readonly payrollRunsService: PayrollRunsService,
    private readonly payslipsService: PayslipsService,
    private readonly allowancesService: PayrollAllowancesService,
    private readonly adjustmentsService: PayrollAdjustmentsService,
    private readonly anomalyService: PayrollAnomalyService,
    private readonly reportsService: PayrollReportsService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  @Get()
  @RequiresPermission('payroll.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(payrollRunQuerySchema))
    query: z.infer<typeof payrollRunQuerySchema>,
  ) {
    return this.payrollRunsService.listRuns(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('payroll.view')
  async get(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.payrollRunsService.getRun(tenant.tenant_id, id);
  }

  @Post()
  @RequiresPermission('payroll.create_run')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createPayrollRunSchema)) dto: CreatePayrollRunDto,
  ) {
    return this.payrollRunsService.createRun(tenant.tenant_id, user.sub, dto);
  }

  @Patch(':id')
  @RequiresPermission('payroll.create_run')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePayrollRunSchema)) dto: UpdatePayrollRunDto,
  ) {
    return this.payrollRunsService.updateRun(tenant.tenant_id, id, dto);
  }

  @Get(':id/entries')
  @RequiresPermission('payroll.view')
  async listEntries(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payrollRunsService.listEntries(tenant.tenant_id, id);
  }

  @Post(':id/refresh-entries')
  @RequiresPermission('payroll.create_run')
  @HttpCode(HttpStatus.OK)
  async refreshEntries(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payrollRunsService.refreshEntries(tenant.tenant_id, id);
  }

  @Post(':id/trigger-session-generation')
  @RequiresPermission('payroll.create_run')
  @HttpCode(HttpStatus.OK)
  async triggerSessionGeneration(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payrollRunsService.triggerSessionGeneration(tenant.tenant_id, id);
  }

  @Get(':id/session-generation-status')
  @RequiresPermission('payroll.view')
  async getSessionGenerationStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payrollRunsService.getSessionGenerationStatus(tenant.tenant_id, id);
  }

  @Post(':id/finalise')
  @RequiresPermission('payroll.finalise_run')
  @HttpCode(HttpStatus.OK)
  async finalise(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(finaliseRunSchema)) dto: FinaliseRunDto,
  ) {
    // Determine if the user is a school owner by checking their membership role
    // The JwtPayload contains the membership_id; we check if they have the school_owner role
    const isSchoolOwner = await this.checkIsSchoolOwner(user);
    return this.payrollRunsService.finalise(tenant.tenant_id, id, user.sub, dto, isSchoolOwner);
  }

  @Post(':id/cancel')
  @RequiresPermission('payroll.create_run')
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.payrollRunsService.cancelRun(tenant.tenant_id, id);
  }

  @Post(':id/mass-export')
  @RequiresPermission('payroll.generate_payslips')
  @HttpCode(HttpStatus.OK)
  async massExport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(massExportSchema)) dto: MassExportDto,
  ) {
    return this.payslipsService.triggerMassExport(tenant.tenant_id, id, dto.locale, user.sub);
  }

  @Get(':id/mass-export-status')
  @RequiresPermission('payroll.generate_payslips')
  async getMassExportStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payslipsService.getMassExportStatus(tenant.tenant_id, id);
  }

  // ─── Run sub-resources (Wave 3) ─────────────────────────────────────────
  //
  // Endpoints the redesigned run-detail page already calls. Each delegates
  // to the owning service's `listForRun` / `getRunComparison` helper so
  // controller stays thin.

  @Get(':runId/allowances')
  @RequiresPermission('payroll.view')
  async listRunAllowances(
    @CurrentTenant() tenant: TenantContext,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.allowancesService.listForRun(tenant.tenant_id, runId);
  }

  @Get(':runId/adjustments')
  @RequiresPermission('payroll.view')
  async listRunAdjustments(
    @CurrentTenant() tenant: TenantContext,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.adjustmentsService.listForRun(tenant.tenant_id, runId);
  }

  @Get(':runId/anomalies')
  @RequiresPermission('payroll.view')
  async listRunAnomalies(
    @CurrentTenant() tenant: TenantContext,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    // Wave 3 surfaces the in-memory anomaly scan as a GET. Wave 5 may
    // add a `payroll_anomalies` table for ack/resolve workflows.
    return this.anomalyService.scanForAnomalies(tenant.tenant_id, runId);
  }

  @Get(':runId/comparison')
  @RequiresPermission('payroll.view')
  async getRunComparison(
    @CurrentTenant() tenant: TenantContext,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.reportsService.getRunComparison(tenant.tenant_id, runId);
  }

  // ─── Aliases for the redesigned frontend (Wave 3) ────────────────────────

  @Post(':id/auto-populate-classes')
  @RequiresPermission('payroll.create_run')
  @HttpCode(HttpStatus.OK)
  async autoPopulateClasses(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payrollRunsService.triggerSessionGeneration(tenant.tenant_id, id);
  }

  @Post(':id/send-payslips')
  @RequiresPermission('payroll.generate_payslips')
  @HttpCode(HttpStatus.OK)
  async sendPayslips(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(massExportSchema)) dto: MassExportDto,
  ) {
    return this.payslipsService.triggerMassExport(tenant.tenant_id, id, dto.locale, user.sub);
  }

  /**
   * Resolve whether the actor holds an owner-tier membership role.
   * Wave 3 wires this to the same `PermissionCacheService.isOwner`
   * helper used by `InboxAdminTierOnlyGuard`. The pre-rebuild method
   * returned a hardcoded `false`, forcing every finalisation through
   * the approval flow regardless of role.
   */
  private async checkIsSchoolOwner(user: JwtPayload): Promise<boolean> {
    if (!user.membership_id) {
      return false;
    }
    return this.permissionCache.isOwner(user.membership_id);
  }
}
