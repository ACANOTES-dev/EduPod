import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import { feeGenerationConfirmSchema, feeGenerationPreviewSchema } from '@school/shared';
import type {
  FeeGenerationConfirmDto,
  FeeGenerationPreviewDto,
  JwtPayload,
  TenantContext,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { FeeGenerationService } from './fee-generation.service';

@Controller('v1/finance/fee-generation')
@UseGuards(AuthGuard, PermissionGuard)
export class FeeGenerationController {
  constructor(private readonly feeGenerationService: FeeGenerationService) {}

  @Post('preview')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async preview(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(feeGenerationPreviewSchema)) dto: FeeGenerationPreviewDto,
  ) {
    return this.feeGenerationService.preview(tenant.tenant_id, dto);
  }

  @Post('confirm')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.CREATED)
  async confirm(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(feeGenerationConfirmSchema)) dto: FeeGenerationConfirmDto,
  ) {
    return this.feeGenerationService.confirm(tenant.tenant_id, user.sub, dto);
  }
}
