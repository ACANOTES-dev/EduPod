import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
  cacheFlushSchema,
  createMaintenanceWindowSchema,
  createTenantSchema,
  listAuditActionsQuerySchema,
  listMaintenanceWindowsQuerySchema,
  listUsersQuerySchema,
  maintenanceToggleSchema,
  paginationQuerySchema,
  toggleModuleSchema,
  transferOwnershipSchema,
  updateSupportedLocalesSchema,
  updateTenantSchema,
} from '@school/shared';
import type {
  CacheFlushDto,
  CreateMaintenanceWindowDto,
  JwtPayload,
  ListAuditActionsQuery,
  ListMaintenanceWindowsQuery,
  ListUsersQuery,
  MaintenanceToggleDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { SensitiveDataAccess } from '../../common/decorators/sensitive-data-access.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';
import { PlatformUsersService } from '../platform-users/platform-users.service';

import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import type { UpdateTenantDto } from './dto/update-tenant.dto';
import { MaintenanceService } from './maintenance.service';
import { PlatformCacheService } from './platform-cache.service';
import { PlatformSessionService } from './platform-session.service';
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
    private readonly platformSessionService: PlatformSessionService,
    private readonly platformCacheService: PlatformCacheService,
    private readonly maintenanceService: MaintenanceService,
    private readonly platformSupportService: PlatformSupportService,
    private readonly platformUsersService: PlatformUsersService,
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

  @Get('sessions')
  @RequiresPlatformPermission('platform.tenants.view')
  async listSessions() {
    return this.platformSessionService.listSessions();
  }

  @Delete('sessions/tenant/:tenantId')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.sessions.force_logout_tenant')
  async forceLogoutTenant(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.platformSessionService.forceLogoutTenant(
      tenantId,
      auditContextFromRequest(user, request),
    );
  }

  @Delete('sessions/user/:userId')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.sessions.force_logout_user')
  async forceLogoutUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.platformSessionService.forceLogoutUser(
      userId,
      auditContextFromRequest(user, request),
    );
  }

  @Get('cache/stats')
  @RequiresPlatformPermission('platform.tenants.view')
  async getCacheStats() {
    return this.platformCacheService.getCacheStats();
  }

  @Post('cache/flush')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.cache.flush_tenant')
  async flushCache(
    @Body(new ZodValidationPipe(cacheFlushSchema)) dto: CacheFlushDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    await this.assertCacheFlushPermission(user.sub, dto);
    return this.platformCacheService.flushCache(dto, auditContextFromRequest(user, request));
  }

  @Patch('tenants/:id/maintenance')
  @RequiresPlatformPermission('platform.maintenance.toggle')
  async toggleMaintenance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(maintenanceToggleSchema)) dto: MaintenanceToggleDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.maintenanceService.toggleMaintenanceMode(
      id,
      dto.enabled,
      dto.message,
      auditContextFromRequest(user, request),
    );
  }

  @Get('maintenance-windows')
  @RequiresPlatformPermission('platform.tenants.view')
  async listMaintenanceWindows(
    @Query(new ZodValidationPipe(listMaintenanceWindowsQuerySchema))
    query: ListMaintenanceWindowsQuery,
  ) {
    return this.maintenanceService.listMaintenanceWindows(query.tenant_id);
  }

  @Post('maintenance-windows')
  @RequiresPlatformPermission('platform.maintenance.toggle')
  async createMaintenanceWindow(
    @Body(new ZodValidationPipe(createMaintenanceWindowSchema)) dto: CreateMaintenanceWindowDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.maintenanceService.createMaintenanceWindow(
      dto,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }

  @Delete('maintenance-windows/:id')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.maintenance.toggle')
  async deleteMaintenanceWindow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.maintenanceService.deleteMaintenanceWindow(
      id,
      auditContextFromRequest(user, request),
    );
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

  private async assertCacheFlushPermission(userId: string, dto: CacheFlushDto): Promise<void> {
    if (dto.tenant_id) {
      return;
    }

    const hasGlobalPermission = await this.platformUsersService.hasPermission(
      userId,
      'platform.cache.flush_global',
    );
    if (!hasGlobalPermission) {
      throw new NotFoundException({
        code: 'PLATFORM_PERMISSION_DENIED',
        permission: 'platform.cache.flush_global',
        message: 'You do not have permission to perform this action.',
      });
    }
  }
}
