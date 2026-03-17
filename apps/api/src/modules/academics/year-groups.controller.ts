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
import { createYearGroupSchema, updateYearGroupSchema } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import type { CreateYearGroupDto } from './dto/create-year-group.dto';
import type { UpdateYearGroupDto } from './dto/update-year-group.dto';
import { YearGroupsService } from './year-groups.service';

@Controller('v1/year-groups')
@UseGuards(AuthGuard, PermissionGuard)
export class YearGroupsController {
  constructor(private readonly yearGroupsService: YearGroupsService) {}

  @Post()
  @RequiresPermission('students.manage')
  async create(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Body(new ZodValidationPipe(createYearGroupSchema)) dto: CreateYearGroupDto,
  ) {
    return this.yearGroupsService.create(tenantContext.tenant_id, dto);
  }

  @Get()
  @RequiresPermission('students.view')
  async findAll(@CurrentTenant() tenantContext: { tenant_id: string }) {
    return this.yearGroupsService.findAll(tenantContext.tenant_id);
  }

  @Patch(':id')
  @RequiresPermission('students.manage')
  async update(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateYearGroupSchema)) dto: UpdateYearGroupDto,
  ) {
    return this.yearGroupsService.update(tenantContext.tenant_id, id, dto);
  }

  @Delete(':id')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.yearGroupsService.remove(tenantContext.tenant_id, id);
  }
}
