import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';

import { upsertStripeConfigSchema } from '@school/shared';
import type { JwtPayload, TenantContext, UpsertStripeConfigDto } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { StripeConfigService } from './stripe-config.service';

@Controller('v1/stripe-config')
@UseGuards(AuthGuard, PermissionGuard)
export class StripeConfigController {
  constructor(private readonly stripeConfigService: StripeConfigService) {}

  @Get()
  @RequiresPermission('stripe.manage')
  async getConfig(@CurrentTenant() tenant: TenantContext) {
    return this.stripeConfigService.getConfig(tenant.tenant_id);
  }

  @Put()
  @RequiresPermission('stripe.manage')
  async upsertConfig(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(upsertStripeConfigSchema)) dto: UpsertStripeConfigDto,
  ) {
    return this.stripeConfigService.upsertConfig(tenant.tenant_id, user.sub, dto);
  }
}
