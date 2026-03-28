import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  classifyComplianceRequestSchema,
  complianceDecisionSchema,
  complianceFilterSchema,
  complianceOverdueFilterSchema,
  confirmAgeGateSchema,
  createComplianceRequestSchema,
  dsarExportFormatSchema,
  extendComplianceRequestSchema,
} from '@school/shared';
import type {
  ClassifyComplianceRequestDto,
  ComplianceDecisionDto,
  ComplianceFilterDto,
  ComplianceOverdueFilterDto,
  ConfirmAgeGateDto,
  CreateComplianceRequestDto,
  DsarExportFormatDto,
  ExtendComplianceRequestDto,
  JwtPayload,
  TenantContext,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { SensitiveDataAccess } from '../../common/decorators/sensitive-data-access.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ComplianceService } from './compliance.service';

@Controller('v1/compliance-requests')
@UseGuards(AuthGuard, PermissionGuard)
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Post()
  @RequiresPermission('compliance.manage')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createComplianceRequestSchema))
    dto: CreateComplianceRequestDto,
  ) {
    return this.complianceService.create(tenant.tenant_id, user.sub, dto);
  }

  @Get()
  @RequiresPermission('compliance.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(complianceFilterSchema))
    query: ComplianceFilterDto,
  ) {
    return this.complianceService.list(tenant.tenant_id, query);
  }

  // GET /v1/compliance-requests/overdue
  @Get('overdue')
  @RequiresPermission('compliance.manage')
  async listOverdue(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(complianceOverdueFilterSchema))
    query: ComplianceOverdueFilterDto,
  ) {
    return this.complianceService.listOverdue(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('compliance.view')
  async get(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.complianceService.get(tenant.tenant_id, id);
  }

  @Post(':id/classify')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('compliance.manage')
  async classify(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(classifyComplianceRequestSchema))
    dto: ClassifyComplianceRequestDto,
  ) {
    return this.complianceService.classify(tenant.tenant_id, id, dto);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('compliance.manage')
  async approve(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(complianceDecisionSchema))
    dto: ComplianceDecisionDto,
  ) {
    return this.complianceService.approve(tenant.tenant_id, id, dto);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('compliance.manage')
  async reject(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(complianceDecisionSchema))
    dto: ComplianceDecisionDto,
  ) {
    return this.complianceService.reject(tenant.tenant_id, id, dto);
  }

  @Post(':id/execute')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('compliance.manage')
  async execute(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(dsarExportFormatSchema)) query: DsarExportFormatDto,
  ) {
    return this.complianceService.execute(tenant.tenant_id, id, query.format);
  }

  // POST /v1/compliance-requests/:id/extend
  @Post(':id/extend')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('compliance.manage')
  async extend(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(extendComplianceRequestSchema))
    dto: ExtendComplianceRequestDto,
  ) {
    return this.complianceService.extend(tenant.tenant_id, id, dto);
  }

  // POST /v1/compliance-requests/:id/confirm-age-gate
  @Post(':id/confirm-age-gate')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('compliance.manage')
  async confirmAgeGate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(confirmAgeGateSchema))
    dto: ConfirmAgeGateDto,
  ) {
    return this.complianceService.confirmAgeGate(
      tenant.tenant_id,
      id,
      user.sub,
      dto.confirmation_notes,
    );
  }

  @Get(':id/export')
  @RequiresPermission('compliance.manage')
  @SensitiveDataAccess('dsar_response')
  async getExportUrl(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.complianceService.getExportUrl(tenant.tenant_id, id);
  }
}
