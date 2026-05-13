import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { registerEmailDomainSchema } from '@school/shared';
import type { JwtPayload, RegisterEmailDomainDto, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { EmailDomainService } from './email-domain.service';

@Controller('v1/email-domains')
@UseGuards(AuthGuard, PermissionGuard, ModuleEnabledGuard)
@ModuleEnabled('communications_outbound')
export class EmailDomainController {
  constructor(private readonly emailDomain: EmailDomainService) {}

  // POST /v1/email-domains
  @Post()
  @RequiresPermission('configuration.communications.manage')
  async register(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(registerEmailDomainSchema)) dto: RegisterEmailDomainDto,
  ) {
    return this.emailDomain.registerDomain(tenant.tenant_id, user.sub, dto.domain);
  }

  // GET /v1/email-domains
  @Get()
  @RequiresPermission('configuration.communications.manage')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.emailDomain.listDomains(
      tenant.tenant_id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  // POST /v1/email-domains/:id/refresh
  @Post(':id/refresh')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('configuration.communications.manage')
  async refresh(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.emailDomain.refreshDomain(tenant.tenant_id, id);
  }

  // GET /v1/email-domains/:id
  @Get(':id')
  @RequiresPermission('configuration.communications.manage')
  async getOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.emailDomain.getDomain(tenant.tenant_id, id);
  }

  // DELETE /v1/email-domains/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPermission('configuration.communications.manage')
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.emailDomain.deleteDomain(tenant.tenant_id, id, user.sub);
  }
}
