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
  UseGuards,
} from '@nestjs/common';

import {
  invitePlatformUserSchema,
  type InvitePlatformUserDto,
  updatePlatformUserRolesSchema,
  type UpdatePlatformUserRolesDto,
  type JwtPayload,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PlatformUsersService } from './platform-users.service';

@Controller('v1/admin/platform-users')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class PlatformUsersController {
  constructor(private readonly platformUsersService: PlatformUsersService) {}

  // GET /v1/admin/platform-users
  @Get()
  @RequiresPlatformPermission('platform.platform_users.view')
  async list() {
    return this.platformUsersService.listUsers();
  }

  // GET /v1/admin/platform-users/:id
  @Get(':id')
  @RequiresPlatformPermission('platform.platform_users.view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformUsersService.getUser(id);
  }

  // POST /v1/admin/platform-users/invite
  @Post('invite')
  @RequiresPlatformPermission('platform.platform_users.invite')
  async invite(
    @Body(new ZodValidationPipe(invitePlatformUserSchema)) dto: InvitePlatformUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.platformUsersService.invite(dto, user.sub);
  }

  // PATCH /v1/admin/platform-users/:id/roles
  @Patch(':id/roles')
  @RequiresPlatformPermission('platform.platform_users.assign_roles')
  async updateRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePlatformUserRolesSchema)) dto: UpdatePlatformUserRolesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.platformUsersService.updateRoles(id, dto, user.sub);
  }

  // DELETE /v1/admin/platform-users/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPlatformPermission('platform.platform_users.revoke')
  async revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    await this.platformUsersService.revoke(id, user.sub);
  }
}

@Controller('v1/admin/platform-permissions')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class PlatformPermissionsController {
  constructor(private readonly platformUsersService: PlatformUsersService) {}

  // GET /v1/admin/platform-permissions
  @Get()
  @RequiresPlatformPermission('platform.platform_users.view')
  async list() {
    return this.platformUsersService.listPermissions();
  }
}
