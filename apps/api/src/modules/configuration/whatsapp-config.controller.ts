import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { testWhatsAppSchema, upsertWhatsAppConfigSchema } from '@school/shared';
import type {
  JwtPayload,
  TenantContext,
  TestWhatsAppDto,
  UpsertWhatsAppConfigDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { WhatsAppConfigService } from './whatsapp-config.service';

@Controller('v1/whatsapp-config')
@UseGuards(AuthGuard, PermissionGuard)
@RequiresPermission('configuration.communications.manage')
export class WhatsAppConfigController {
  constructor(private readonly whatsappConfigService: WhatsAppConfigService) {}

  // GET /v1/whatsapp-config
  @Get()
  async getConfig(@CurrentTenant() tenant: TenantContext) {
    return this.whatsappConfigService.getConfig(tenant.tenant_id);
  }

  // PUT /v1/whatsapp-config
  @Put()
  async upsertConfig(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(upsertWhatsAppConfigSchema)) dto: UpsertWhatsAppConfigDto,
  ) {
    return this.whatsappConfigService.upsertConfig(tenant.tenant_id, user.sub, dto);
  }

  // DELETE /v1/whatsapp-config
  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteConfig(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.whatsappConfigService.deleteConfig(tenant.tenant_id, user.sub);
  }

  // POST /v1/whatsapp-config/test
  // STUB — Impl 09 wires real provider verification.
  @Post('test')
  async test(
    @CurrentTenant() _tenant: TenantContext,
    @Body(new ZodValidationPipe(testWhatsAppSchema)) _dto: TestWhatsAppDto,
  ): Promise<never> {
    throw new NotImplementedException({
      code: 'WHATSAPP_TEST_NOT_IMPLEMENTED',
      message:
        'WhatsApp test send is implemented in Implementation 09. The schema validates today; the provider call lands in Impl 09.',
    });
  }
}
