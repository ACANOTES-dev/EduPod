import {
  Body,
  Controller,
  Delete,
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

import {
  createRetentionHoldSchema,
  retentionHoldsQuerySchema,
  retentionPreviewRequestSchema,
  updateRetentionPolicySchema,
} from '@school/shared';
import type {
  CreateRetentionHoldDto,
  JwtPayload,
  RetentionHoldsQueryDto,
  RetentionPreviewRequestDto,
  TenantContext,
  UpdateRetentionPolicyDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { RetentionPoliciesService } from './retention-policies.service';

// ─── Retention Policies Controller ───────────────────────────────────────────

@Controller('v1/retention-policies')
@UseGuards(AuthGuard, PermissionGuard)
export class RetentionPoliciesController {
  constructor(private readonly retentionPoliciesService: RetentionPoliciesService) {}

  // GET /v1/retention-policies
  @Get()
  @RequiresPermission('compliance.manage')
  async listPolicies(@CurrentTenant() tenant: TenantContext) {
    return this.retentionPoliciesService.getEffectivePolicies(tenant.tenant_id);
  }

  // POST /v1/retention-policies/preview — static route must precede :id
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('compliance.manage')
  async previewRetention(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(retentionPreviewRequestSchema)) dto: RetentionPreviewRequestDto,
  ) {
    return this.retentionPoliciesService.previewRetention(tenant.tenant_id, dto);
  }

  // PATCH /v1/retention-policies/:id
  @Patch(':id')
  @RequiresPermission('compliance.manage')
  async overridePolicy(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRetentionPolicySchema)) dto: UpdateRetentionPolicyDto,
  ) {
    return this.retentionPoliciesService.overridePolicy(tenant.tenant_id, id, dto);
  }
}

// ─── Retention Holds Controller ───────────────────────────────────────────────

@Controller('v1/retention-holds')
@UseGuards(AuthGuard, PermissionGuard)
export class RetentionHoldsController {
  constructor(private readonly retentionPoliciesService: RetentionPoliciesService) {}

  // POST /v1/retention-holds
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('compliance.manage')
  async createHold(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createRetentionHoldSchema)) dto: CreateRetentionHoldDto,
  ) {
    return this.retentionPoliciesService.createHold(tenant.tenant_id, user.sub, dto);
  }

  // DELETE /v1/retention-holds/:id
  @Delete(':id')
  @RequiresPermission('compliance.manage')
  async releaseHold(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.retentionPoliciesService.releaseHold(tenant.tenant_id, id);
  }

  // GET /v1/retention-holds
  @Get()
  @RequiresPermission('compliance.manage')
  async listHolds(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(retentionHoldsQuerySchema)) query: RetentionHoldsQueryDto,
  ) {
    return this.retentionPoliciesService.listHolds(tenant.tenant_id, query);
  }
}
