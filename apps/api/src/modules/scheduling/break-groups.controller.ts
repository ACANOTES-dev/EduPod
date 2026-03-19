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
  createBreakGroupSchema,
  updateBreakGroupSchema,
} from '@school/shared';
import type {
  CreateBreakGroupDto,
  UpdateBreakGroupDto,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BreakGroupsService } from './break-groups.service';

const listQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
});

@Controller('v1/scheduling/break-groups')
@UseGuards(AuthGuard, PermissionGuard)
export class BreakGroupsController {
  constructor(private readonly service: BreakGroupsService) {}

  @Get()
  @RequiresPermission('schedule.configure_requirements')
  async list(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listQuerySchema))
    query: z.infer<typeof listQuerySchema>,
  ) {
    return this.service.list(tenant.tenant_id, query.academic_year_id);
  }

  @Post()
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createBreakGroupSchema))
    dto: CreateBreakGroupDto,
  ) {
    return this.service.create(tenant.tenant_id, dto);
  }

  @Patch(':id')
  @RequiresPermission('schedule.configure_requirements')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBreakGroupSchema))
    dto: UpdateBreakGroupDto,
  ) {
    return this.service.update(tenant.tenant_id, id, dto);
  }

  @Delete(':id')
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.delete(tenant.tenant_id, id);
  }
}
