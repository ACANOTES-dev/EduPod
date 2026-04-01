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

import { createRoomClosureSchema } from '@school/shared';
import type { CreateRoomClosureDto, JwtPayload } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { RoomClosuresService } from './room-closures.service';

const listQuerySchema = z.object({
  room_id: z.string().uuid().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('v1/scheduling/room-closures')
@UseGuards(AuthGuard, PermissionGuard)
export class RoomClosuresController {
  constructor(private readonly service: RoomClosuresService) {}

  @Get()
  @RequiresPermission('schedule.manage')
  async list(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listQuerySchema))
    query: z.infer<typeof listQuerySchema>,
  ) {
    return this.service.list(tenant.tenant_id, {
      page: query.page,
      pageSize: query.pageSize,
      room_id: query.room_id,
      date_from: query.date_from,
      date_to: query.date_to,
    });
  }

  @Post()
  @RequiresPermission('schedule.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createRoomClosureSchema))
    dto: CreateRoomClosureDto,
  ) {
    return this.service.create(tenant.tenant_id, user.sub, dto);
  }

  @Delete(':id')
  @RequiresPermission('schedule.manage')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.delete(tenant.tenant_id, id);
  }
}
