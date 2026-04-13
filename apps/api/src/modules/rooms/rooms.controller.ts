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
  bulkCreateRoomsSchema,
  bulkDeleteRoomsSchema,
  createRoomSchema,
  updateRoomSchema,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import type {
  BulkCreateRoomsDto,
  BulkDeleteRoomsDto,
  CreateRoomDto,
  UpdateRoomDto,
} from './dto/room.dto';
import { RoomsService } from './rooms.service';

const listRoomsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  active: z.coerce.boolean().optional(),
  room_type: z.string().optional(),
});

@Controller('v1/rooms')
@UseGuards(AuthGuard, PermissionGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  // POST /v1/rooms/bulk — must be before :id routes
  @Post('bulk')
  @RequiresPermission('schedule.manage')
  @HttpCode(HttpStatus.CREATED)
  async bulkCreate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(bulkCreateRoomsSchema)) dto: BulkCreateRoomsDto,
  ) {
    return this.roomsService.bulkCreate(tenant.tenant_id, dto);
  }

  // POST /v1/rooms/bulk-delete
  @Post('bulk-delete')
  @RequiresPermission('schedule.manage')
  async bulkDelete(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(bulkDeleteRoomsSchema)) dto: BulkDeleteRoomsDto,
  ) {
    return this.roomsService.bulkDelete(tenant.tenant_id, dto);
  }

  // GET /v1/rooms/stats
  @Get('stats')
  @RequiresPermission('schedule.manage')
  async getStats(@CurrentTenant() tenant: { tenant_id: string }) {
    return this.roomsService.getStats(tenant.tenant_id);
  }

  // POST /v1/rooms
  @Post()
  @RequiresPermission('schedule.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createRoomSchema)) dto: CreateRoomDto,
  ) {
    return this.roomsService.create(tenant.tenant_id, dto);
  }

  // GET /v1/rooms
  @Get()
  @RequiresPermission('schedule.manage')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listRoomsQuerySchema))
    query: z.infer<typeof listRoomsQuerySchema>,
  ) {
    return this.roomsService.findAll(tenant.tenant_id, {
      page: query.page,
      pageSize: query.pageSize,
      active: query.active,
      room_type: query.room_type,
    });
  }

  // GET /v1/rooms/:id
  @Get(':id')
  @RequiresPermission('schedule.manage')
  async findOne(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.roomsService.findOne(tenant.tenant_id, id);
  }

  // PATCH /v1/rooms/:id
  @Patch(':id')
  @RequiresPermission('schedule.manage')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRoomSchema)) dto: UpdateRoomDto,
  ) {
    return this.roomsService.update(tenant.tenant_id, id, dto);
  }

  // DELETE /v1/rooms/:id
  @Delete(':id')
  @RequiresPermission('schedule.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.roomsService.remove(tenant.tenant_id, id);
  }
}
