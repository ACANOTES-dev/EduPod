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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createStaffPreferenceSchema,
  updateStaffPreferenceSchema,
} from '@school/shared';
import type {
  CreateStaffPreferenceDto,
  JwtPayload,
  UpdateStaffPreferenceDto,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { StaffPreferencesService } from './staff-preferences.service';

const listPreferencesQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  staff_profile_id: z.string().uuid().optional(),
});

const ownPreferencesQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
});

@Controller('v1/staff-scheduling-preferences')
@UseGuards(AuthGuard, PermissionGuard)
export class StaffPreferencesController {
  constructor(
    private readonly staffPreferencesService: StaffPreferencesService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  @Get()
  @RequiresPermission('schedule.manage_preferences')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listPreferencesQuerySchema))
    query: z.infer<typeof listPreferencesQuerySchema>,
  ) {
    return this.staffPreferencesService.findAll(
      tenant.tenant_id,
      query.academic_year_id,
      query.staff_profile_id,
    );
  }

  @Get('own')
  @RequiresPermission('schedule.manage_own_preferences')
  async findOwn(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(ownPreferencesQuerySchema))
    query: z.infer<typeof ownPreferencesQuerySchema>,
  ) {
    return this.staffPreferencesService.findOwnPreferences(
      tenant.tenant_id,
      user.sub,
      query.academic_year_id,
    );
  }

  @Post()
  @RequiresPermission('schedule.manage_preferences')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createStaffPreferenceSchema)) dto: CreateStaffPreferenceDto,
  ) {
    const permissions = user.membership_id
      ? await this.permissionCacheService.getPermissions(user.membership_id)
      : [];

    return this.staffPreferencesService.create(tenant.tenant_id, user.sub, dto, permissions);
  }

  @Patch(':id')
  @RequiresPermission('schedule.manage_preferences')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStaffPreferenceSchema)) dto: UpdateStaffPreferenceDto,
  ) {
    const permissions = user.membership_id
      ? await this.permissionCacheService.getPermissions(user.membership_id)
      : [];

    return this.staffPreferencesService.update(tenant.tenant_id, user.sub, id, dto, permissions);
  }

  @Delete(':id')
  @RequiresPermission('schedule.manage_preferences')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const permissions = user.membership_id
      ? await this.permissionCacheService.getPermissions(user.membership_id)
      : [];

    return this.staffPreferencesService.delete(tenant.tenant_id, user.sub, id, permissions);
  }
}
