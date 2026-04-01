import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import type { z } from 'zod';

import {
  promotionRolloverQuerySchema,
  feeGenerationRunsQuerySchema,
  writeOffQuerySchema,
  notificationDeliveryQuerySchema,
} from '@school/shared';
import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { SensitiveDataAccess } from '../../common/decorators/sensitive-data-access.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ReportsService } from './reports.service';

@Controller('v1/reports')
@UseGuards(AuthGuard, PermissionGuard)
@SensitiveDataAccess('analytics')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('promotion-rollover')
  @RequiresPermission('analytics.view')
  async promotionRollover(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(promotionRolloverQuerySchema))
    query: z.infer<typeof promotionRolloverQuerySchema>,
  ) {
    return this.reportsService.promotionRollover(tenant.tenant_id, query.academic_year_id);
  }

  @Get('fee-generation-runs')
  @RequiresPermission('finance.view')
  async feeGenerationRuns(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(feeGenerationRunsQuerySchema))
    query: z.infer<typeof feeGenerationRunsQuerySchema>,
  ) {
    return this.reportsService.feeGenerationRuns(tenant.tenant_id, {
      academic_year_id: query.academic_year_id,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('write-offs')
  @RequiresPermission('finance.view')
  async writeOffs(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(writeOffQuerySchema))
    query: z.infer<typeof writeOffQuerySchema>,
  ) {
    return this.reportsService.writeOffs(tenant.tenant_id, {
      start_date: query.start_date,
      end_date: query.end_date,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('notification-delivery')
  @RequiresPermission('analytics.view')
  async notificationDelivery(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(notificationDeliveryQuerySchema))
    query: z.infer<typeof notificationDeliveryQuerySchema>,
  ) {
    return this.reportsService.notificationDelivery(tenant.tenant_id, {
      start_date: query.start_date,
      end_date: query.end_date,
      channel: query.channel,
      template_key: query.template_key,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('student-export/:studentId')
  @RequiresPermission('students.view')
  @SensitiveDataAccess('full_export')
  async studentExportPack(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.reportsService.studentExportPack(tenant.tenant_id, studentId);
  }

  @Get('household-export/:householdId')
  @RequiresPermission('finance.view')
  @SensitiveDataAccess('full_export')
  async householdExportPack(
    @CurrentTenant() tenant: TenantContext,
    @Param('householdId', ParseUUIDPipe) householdId: string,
  ) {
    return this.reportsService.householdExportPack(tenant.tenant_id, householdId);
  }
}
