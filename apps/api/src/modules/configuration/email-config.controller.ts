import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
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
import { VerifyRateLimitService } from './verify-rate-limit.service';

@Controller('v1/email-config')
@UseGuards(AuthGuard, PermissionGuard)
export class EmailConfigController {
  constructor(
    private readonly emailConfigService: EmailConfigService,
    private readonly verifyLimit: VerifyRateLimitService,
  ) {}

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
  @Post('test')
  @RequiresPermission('configuration.communications.manage')
  async test(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(testEmailSchema)) dto: TestEmailDto,
  ) {
    const limit = await this.verifyLimit.checkAndIncrement(tenant.tenant_id, 'email');
    if (!limit.allowed) {
      throw new HttpException(
        {
          code: 'VERIFY_RATE_LIMIT_EXCEEDED',
          message: `Verification limit reached (${limit.limit ?? 3} per hour). Try again later.`,
          retry_after_seconds: limit.retry_after_seconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.emailConfigService.verifyConfig(tenant.tenant_id, dto.recipient_email);
  }
}
