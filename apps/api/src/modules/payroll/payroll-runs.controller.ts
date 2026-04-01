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
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PayrollRunsService } from './payroll-runs.service';
import { PayslipsService } from './payslips.service';

@Controller('v1/payroll/runs')
@UseGuards(AuthGuard, PermissionGuard)
export class PayrollRunsController {
  constructor(
    private readonly payrollRunsService: PayrollRunsService,
    private readonly payslipsService: PayslipsService,
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

  /**
   * Simple check for school owner role.
   * In a real implementation this would look up the membership roles.
   * For now, we treat any user with the finalise_run permission as having authority
   * unless the tenant settings require explicit school_owner role check.
   */
  private async checkIsSchoolOwner(user: JwtPayload): Promise<boolean> {
    // If no membership, they can't be a school owner
    if (!user.membership_id) {
      return false;
    }

    // This is a simplified check. The full implementation would query
    // MembershipRole to see if the user has the school_owner system role.
    // For now, we return false to ensure the approval flow is always checked.
    // The approval service's hasDirectAuthority parameter controls bypass.
    return false;
  }
}
