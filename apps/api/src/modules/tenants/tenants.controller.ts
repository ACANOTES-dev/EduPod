import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import {
  createTenantSchema,
  listAuditActionsQuerySchema,
  listUsersQuerySchema,
  paginationQuerySchema,
  toggleModuleSchema,
  transferOwnershipSchema,
  updateSupportedLocalesSchema,
  updateTenantSchema,
} from '@school/shared';
import type { JwtPayload, ListAuditActionsQuery, ListUsersQuery } from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { SensitiveDataAccess } from '../../common/decorators/sensitive-data-access.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import type { UpdateTenantDto } from './dto/update-tenant.dto';
import { PlatformSupportService } from './platform-support.service';
import { TenantsService } from './tenants.service';

const impersonateSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

type ImpersonateDto = z.infer<typeof impersonateSchema>;

const listTenantsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['active', 'suspended', 'archived']).optional(),
  search: z.string().optional(),
});

@Controller('v1/admin')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly platformSupportService: PlatformSupportService,
  ) {}

  @Post('tenants')
  @RequiresPlatformPermission('platform.tenants.create')
  @UsePipes(new ZodValidationPipe(createTenantSchema))
  async createTenant(
    @Body() dto: CreateTenantDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.tenantsService.createTenant(dto, auditContextFromRequest(user, request));
  }

  @Get('tenants')
  @RequiresPlatformPermission('platform.tenants.view')
  async listTenants(
    @Query(new ZodValidationPipe(listTenantsQuerySchema))
    query: z.infer<typeof listTenantsQuerySchema>,
  ) {
    const { page, pageSize, sort, order, status, search } = query;
    return this.tenantsService.listTenants({ page, pageSize, sort, order }, { status, search });
  }

  @Get('tenants/:id')
  @RequiresPlatformPermission('platform.tenants.view')
  async getTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.getTenant(id);
  }

  @Patch('tenants/:id')
  @RequiresPlatformPermission('platform.tenants.create')
  async updateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTenantSchema)) dto: UpdateTenantDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.tenantsService.updateTenant(id, dto, auditContextFromRequest(user, request));
  }

  @Patch('tenants/:id/supported-locales')
  @RequiresPlatformPermission('platform.tenants.create')
  async updateSupportedLocales(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSupportedLocalesSchema))
    dto: { supported_locales: string[] },
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.tenantsService.updateSupportedLocales(
      id,
      dto.supported_locales,
      auditContextFromRequest(user, request),
    );
  }

  @Post('tenants/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.tenants.suspend')
  async suspendTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.tenantsService.suspendTenant(id, user.sub, auditContextFromRequest(user, request));
  }

  @Post('tenants/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.tenants.suspend')
  async reactivateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.tenantsService.reactivateTenant(
      id,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }

  @Post('tenants/:id/archive')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.tenants.archive')
  async archiveTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.tenantsService.archiveTenant(id, user.sub, auditContextFromRequest(user, request));
  }

  @Get('dashboard')
  @RequiresPlatformPermission('platform.tenants.view')
  async getDashboard() {
    return this.tenantsService.getDashboard();
  }

  @Get('users')
  @RequiresPlatformPermission('platform.users.reset_password')
  async listUsers(@Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery) {
    return this.platformSupportService.listUsers(query);
  }

  @Get('users/:id')
  @RequiresPlatformPermission('platform.users.reset_password')
  async getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformSupportService.getUser(id);
  }

  @Get('audit-actions')
  @RequiresPlatformPermission('platform.audit_log.view')
  async listAuditActions(
    @Query(new ZodValidationPipe(listAuditActionsQuerySchema)) query: ListAuditActionsQuery,
  ) {
    return this.platformSupportService.listAuditActions(query);
  }

  @Post('impersonate')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.tenants.impersonate')
  @SensitiveDataAccess('cross_tenant', {
    entityIdField: 'user_id',
    entityType: 'impersonation',
  })
  async impersonate(
    @Body(new ZodValidationPipe(impersonateSchema)) dto: ImpersonateDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.tenantsService.impersonate(
      dto.tenant_id,
      dto.user_id,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }

  @Post('users/:id/reset-mfa')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.users.reset_mfa')
  async resetUserMfa(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.tenantsService.resetUserMfa(id, user.sub, auditContextFromRequest(user, request));
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.users.reset_password')
  async resetUserPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.platformSupportService.resetPassword(
      id,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }

  @Post('users/:id/resend-invite')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.users.resend_invite')
  async resendUserInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.platformSupportService.resendInvite(
      id,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }

  @Post('users/:id/unlock')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.users.unlock_account')
  async unlockUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.platformSupportService.unlockAccount(
      id,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }

  @Post('users/:id/disable')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.users.disable')
  async disableUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.platformSupportService.disableUser(
      id,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }

  @Post('users/:id/enable')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.users.disable')
  async enableUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.platformSupportService.enableUser(
      id,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }

  @Post('tenants/:id/transfer-ownership')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.users.transfer_ownership')
  async transferOwnership(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transferOwnershipSchema)) dto: TransferOwnershipDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.platformSupportService.transferOwnership(
      id,
      dto.new_owner_user_id,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }

  @Get('tenants/:id/modules')
  @RequiresPlatformPermission('platform.tenants.view')
  async listModules(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.listModules(id);
  }

  @Patch('tenants/:id/modules/:key')
  @RequiresPlatformPermission('platform.modules.toggle')
  async toggleModule(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('key') key: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Body(new ZodValidationPipe(toggleModuleSchema)) dto: { is_enabled: boolean },
  ) {
    return this.tenantsService.toggleModule(
      id,
      key,
      dto.is_enabled,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }
}
