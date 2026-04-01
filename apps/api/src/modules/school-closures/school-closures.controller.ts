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
import { z } from 'zod';

import { createClosureSchema, bulkCreateClosureSchema } from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import type { CreateClosureDto, BulkCreateClosureDto } from './dto/closure.dto';
import { SchoolClosuresService } from './school-closures.service';

const listClosuresQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  affects_scope: z.enum(['all', 'year_group', 'class']).optional(),
});

@Controller('v1/school-closures')
@UseGuards(AuthGuard, PermissionGuard)
export class SchoolClosuresController {
  constructor(private readonly closuresService: SchoolClosuresService) {}

  @Post()
  @RequiresPermission('schedule.manage_closures')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createClosureSchema)) dto: CreateClosureDto,
  ) {
    return this.closuresService.create(tenant.tenant_id, user.sub, dto);
  }

  @Post('bulk')
  @RequiresPermission('schedule.manage_closures')
  @HttpCode(HttpStatus.CREATED)
  async bulkCreate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(bulkCreateClosureSchema)) dto: BulkCreateClosureDto,
  ) {
    return this.closuresService.bulkCreate(tenant.tenant_id, user.sub, dto);
  }

  @Get()
  @RequiresPermission('attendance.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listClosuresQuerySchema))
    query: z.infer<typeof listClosuresQuerySchema>,
  ) {
    return this.closuresService.findAll(tenant.tenant_id, {
      page: query.page,
      pageSize: query.pageSize,
      start_date: query.start_date,
      end_date: query.end_date,
      affects_scope: query.affects_scope,
    });
  }

  @Delete(':id')
  @RequiresPermission('schedule.manage_closures')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.closuresService.remove(tenant.tenant_id, id);
  }
}
