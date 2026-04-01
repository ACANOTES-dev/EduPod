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
import { z } from 'zod';

import {
  createScheduleSchema,
  updateScheduleSchema,
  pinScheduleSchema,
  bulkPinSchema,
} from '@school/shared';
import type { JwtPayload } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import type { CreateScheduleDto, UpdateScheduleDto } from './dto/schedule.dto';
import { SchedulesService } from './schedules.service';

const listSchedulesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  academic_year_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
  teacher_staff_id: z.string().uuid().optional(),
  room_id: z.string().uuid().optional(),
  weekday: z.coerce.number().int().min(0).max(6).optional(),
});

@Controller('v1/schedules')
@UseGuards(AuthGuard, PermissionGuard)
export class SchedulesController {
  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  @Post()
  @RequiresPermission('schedule.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createScheduleSchema)) dto: CreateScheduleDto,
  ) {
    const permissions = user.membership_id
      ? await this.permissionCacheService.getPermissions(user.membership_id)
      : [];

    const result = await this.schedulesService.create(tenant.tenant_id, user.sub, dto, permissions);

    if (result.conflicts.length > 0) {
      return { data: result.schedule, meta: { conflicts: result.conflicts } };
    }

    return result.schedule;
  }

  @Get()
  @RequiresPermission('schedule.manage')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listSchedulesQuerySchema))
    query: z.infer<typeof listSchedulesQuerySchema>,
  ) {
    return this.schedulesService.findAll(tenant.tenant_id, {
      page: query.page,
      pageSize: query.pageSize,
      academic_year_id: query.academic_year_id,
      class_id: query.class_id,
      teacher_staff_id: query.teacher_staff_id,
      room_id: query.room_id,
      weekday: query.weekday,
    });
  }

  @Get(':id')
  @RequiresPermission('schedule.manage')
  async findOne(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schedulesService.findOne(tenant.tenant_id, id);
  }

  @Patch(':id')
  @RequiresPermission('schedule.manage')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateScheduleSchema)) dto: UpdateScheduleDto,
  ) {
    const permissions = user.membership_id
      ? await this.permissionCacheService.getPermissions(user.membership_id)
      : [];

    const result = await this.schedulesService.update(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
      permissions,
    );

    if (result.conflicts.length > 0) {
      return { data: result.schedule, meta: { conflicts: result.conflicts } };
    }

    return result.schedule;
  }

  @Delete(':id')
  @RequiresPermission('schedule.manage')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schedulesService.remove(tenant.tenant_id, id);
  }

  @Post('bulk-pin')
  @RequiresPermission('schedule.pin_entries')
  async bulkPin(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(bulkPinSchema))
    dto: { schedule_ids: string[]; pin_reason?: string },
  ) {
    return this.schedulesService.bulkPin(tenant.tenant_id, dto);
  }

  @Post(':id/pin')
  @RequiresPermission('schedule.pin_entries')
  async pin(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(pinScheduleSchema)) dto: { pin_reason?: string },
  ) {
    return this.schedulesService.pin(tenant.tenant_id, id, dto);
  }

  @Post(':id/unpin')
  @RequiresPermission('schedule.pin_entries')
  async unpin(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schedulesService.unpin(tenant.tenant_id, id);
  }
}
