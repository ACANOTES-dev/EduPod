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

import { testEmailSchema, upsertEmailConfigSchema } from '@school/shared';
import type { JwtPayload, TenantContext, TestEmailDto, UpsertEmailConfigDto } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { EmailConfigService } from './email-config.service';

@Controller('v1/email-config')
@UseGuards(AuthGuard, PermissionGuard)
export class EmailConfigController {
  constructor(private readonly emailConfigService: EmailConfigService) {}

  // GET /v1/email-config
  @Get()
  @RequiresPermission('configuration.communications.manage')
  async getConfig(@CurrentTenant() tenant: TenantContext) {
    return this.emailConfigService.getConfig(tenant.tenant_id);
  }

  // PUT /v1/email-config
  @Put()
  @RequiresPermission('configuration.communications.manage')
  async upsertConfig(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(upsertEmailConfigSchema)) dto: UpsertEmailConfigDto,
  ) {
    return this.emailConfigService.upsertConfig(tenant.tenant_id, user.sub, dto);
  }

  // DELETE /v1/email-config
  @Delete()
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('configuration.communications.manage')
  async deleteConfig(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.emailConfigService.deleteConfig(tenant.tenant_id, user.sub);
  }

  // POST /v1/email-config/test
  // STUB — Impl 09 wires real provider verification.
  @Post('test')
  @RequiresPermission('configuration.communications.manage')
  async test(
    @CurrentTenant() _tenant: TenantContext,
    @Body(new ZodValidationPipe(testEmailSchema)) _dto: TestEmailDto,
  ): Promise<never> {
    throw new NotImplementedException({
      code: 'EMAIL_TEST_NOT_IMPLEMENTED',
      message:
        'Email test send is implemented in Implementation 09. The schema validates today; the provider call lands in Impl 09.',
    });
  }
}
