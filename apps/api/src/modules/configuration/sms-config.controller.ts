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

import { testSmsSchema, upsertSmsConfigSchema } from '@school/shared';
import type { JwtPayload, TenantContext, TestSmsDto, UpsertSmsConfigDto } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { SmsConfigService } from './sms-config.service';

@Controller('v1/sms-config')
@UseGuards(AuthGuard, PermissionGuard)
export class SmsConfigController {
  constructor(private readonly smsConfigService: SmsConfigService) {}

  // GET /v1/sms-config
  @Get()
  @RequiresPermission('configuration.communications.manage')
  async getConfig(@CurrentTenant() tenant: TenantContext) {
    return this.smsConfigService.getConfig(tenant.tenant_id);
  }

  // PUT /v1/sms-config
  @Put()
  @RequiresPermission('configuration.communications.manage')
  async upsertConfig(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(upsertSmsConfigSchema)) dto: UpsertSmsConfigDto,
  ) {
    return this.smsConfigService.upsertConfig(tenant.tenant_id, user.sub, dto);
  }

  // DELETE /v1/sms-config
  @Delete()
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('configuration.communications.manage')
  async deleteConfig(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.smsConfigService.deleteConfig(tenant.tenant_id, user.sub);
  }

  // POST /v1/sms-config/test
  // STUB — Impl 09 wires real provider verification.
  @Post('test')
  @RequiresPermission('configuration.communications.manage')
  async test(
    @CurrentTenant() _tenant: TenantContext,
    @Body(new ZodValidationPipe(testSmsSchema)) _dto: TestSmsDto,
  ): Promise<never> {
    throw new NotImplementedException({
      code: 'SMS_TEST_NOT_IMPLEMENTED',
      message:
        'SMS test send is implemented in Implementation 09. The schema validates today; the provider call lands in Impl 09.',
    });
  }
}
