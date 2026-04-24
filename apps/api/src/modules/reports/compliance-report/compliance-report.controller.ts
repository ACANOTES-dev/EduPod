import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  complianceHistoryQuerySchema,
  generateComplianceReportSchema,
} from '@school/shared/reports';
import type {
  ComplianceHistoryQueryDto,
  GenerateComplianceReportDto,
} from '@school/shared/reports';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { SensitiveDataAccess } from '../../../common/decorators/sensitive-data-access.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { ComplianceGenerationService } from './compliance-generation.service';

/**
 * Compliance-report generation endpoints (impl 07 of the Reports rebuild).
 * Sits in its own controller under `apps/api/src/modules/reports/
 * compliance-report/` so parallel Wave 2 impls (05 domain services, 06
 * board report) don't collide on
 * `reports-enhanced.controller.ts`. Existing compliance-template CRUD
 * stays on the enhanced controller untouched.
 *
 * Both routes are tenant-scoped, behind `AuthGuard + PermissionGuard`,
 * and require the pre-existing `compliance.view` permission. The
 * permission was already registered by the regulatory / compliance
 * modules; no new permission key is introduced here.
 */
@Controller('v1/reports/compliance')
@UseGuards(AuthGuard, PermissionGuard)
@SensitiveDataAccess('analytics')
export class ComplianceReportController {
  constructor(private readonly generation: ComplianceGenerationService) {}

  // POST /v1/reports/compliance/generate
  @Post('generate')
  @RequiresPermission('compliance.view')
  async generate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(generateComplianceReportSchema))
    body: GenerateComplianceReportDto,
  ) {
    return this.generation.generate(tenant.tenant_id, user.sub, body);
  }

  // GET /v1/reports/compliance/history
  @Get('history')
  @RequiresPermission('compliance.view')
  async history(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(complianceHistoryQuerySchema))
    query: ComplianceHistoryQueryDto,
  ) {
    return this.generation.history(tenant.tenant_id, query);
  }
}
