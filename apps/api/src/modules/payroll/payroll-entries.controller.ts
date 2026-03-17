import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  calculateEntrySchema,
  updatePayrollEntrySchema,
} from '@school/shared';
import type {
  CalculateEntryDto,
  TenantContext,
  UpdatePayrollEntryDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PayrollEntriesService } from './payroll-entries.service';

@Controller('v1/payroll/entries')
@UseGuards(AuthGuard, PermissionGuard)
export class PayrollEntriesController {
  constructor(private readonly payrollEntriesService: PayrollEntriesService) {}

  @Patch(':id')
  @RequiresPermission('payroll.create_run')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePayrollEntrySchema)) dto: UpdatePayrollEntryDto,
  ) {
    return this.payrollEntriesService.updateEntry(tenant.tenant_id, id, dto);
  }

  @Post(':id/calculate')
  @RequiresPermission('payroll.view')
  @HttpCode(HttpStatus.OK)
  async calculate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(calculateEntrySchema)) dto: CalculateEntryDto,
  ) {
    return this.payrollEntriesService.calculatePreview(tenant.tenant_id, id, dto);
  }
}
