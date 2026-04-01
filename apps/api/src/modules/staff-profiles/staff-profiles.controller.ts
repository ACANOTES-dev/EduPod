import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  createStaffProfileSchema,
  staffProfileQuerySchema,
  updateStaffProfileSchema,
} from '@school/shared';
import type {
  CreateStaffProfileDto,
  StaffProfileQueryDto,
  TenantContext,
  UpdateStaffProfileDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { SensitiveDataAccess } from '../../common/decorators/sensitive-data-access.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { StaffProfilesService } from './staff-profiles.service';

@Controller('v1/staff-profiles')
@UseGuards(AuthGuard, PermissionGuard)
export class StaffProfilesController {
  constructor(private readonly staffProfilesService: StaffProfilesService) {}

  @Post()
  @RequiresPermission('users.manage')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createStaffProfileSchema))
    dto: CreateStaffProfileDto,
  ) {
    return this.staffProfilesService.create(tenant.tenant_id, dto);
  }

  @Get()
  @RequiresPermission('users.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(staffProfileQuerySchema))
    query: StaffProfileQueryDto,
  ) {
    return this.staffProfilesService.findAll(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('users.view')
  async findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.staffProfilesService.findOne(tenant.tenant_id, id);
  }

  @Patch(':id')
  @RequiresPermission('users.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStaffProfileSchema))
    dto: UpdateStaffProfileDto,
  ) {
    return this.staffProfilesService.update(tenant.tenant_id, id, dto);
  }

  @Get(':id/bank-details')
  @RequiresPermission('payroll.view_bank_details')
  @SensitiveDataAccess('financial')
  async getBankDetails(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staffProfilesService.getBankDetails(tenant.tenant_id, id);
  }

  @Get(':id/preview')
  @RequiresPermission('users.view')
  async preview(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.staffProfilesService.preview(tenant.tenant_id, id);
  }
}
