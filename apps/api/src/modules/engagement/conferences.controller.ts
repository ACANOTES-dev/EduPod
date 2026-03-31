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
import { createBookingSchema, generateTimeSlotsSchema } from '@school/shared';
import type {
  CreateBookingDto,
  GenerateTimeSlotsDto,
  JwtPayload,
  TenantContext,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ConferencesService } from './conferences.service';

// ─── Inline Schemas ─────────────────────────────────────────────────────────

const updateTimeSlotSchema = z.object({
  status: z.enum(['available', 'blocked']),
});

// ─── Controller ─────────────────────────────────────────────────────────────

@Controller('v1/engagement/conferences')
@ModuleEnabled('engagement')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class ConferencesController {
  constructor(private readonly conferencesService: ConferencesService) {}

  // POST /v1/engagement/conferences/:eventId/time-slots/generate
  @Post(':eventId/time-slots/generate')
  @RequiresPermission('engagement.conferences.manage')
  async generateTimeSlots(
    @CurrentTenant() tenant: TenantContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(new ZodValidationPipe(generateTimeSlotsSchema)) dto: GenerateTimeSlotsDto,
  ) {
    return this.conferencesService.generateTimeSlots(tenant.tenant_id, eventId, dto);
  }

  // GET /v1/engagement/conferences/:eventId/time-slots
  @Get(':eventId/time-slots')
  @RequiresPermission('engagement.conferences.manage')
  async findAllTimeSlots(
    @CurrentTenant() tenant: TenantContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('teacher_id') teacherId?: string,
    @Query('status') status?: string,
  ) {
    return this.conferencesService.findAllTimeSlots(tenant.tenant_id, eventId, {
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      teacher_id: teacherId,
      status,
    });
  }

  // GET /v1/engagement/conferences/:eventId/my-schedule
  @Get(':eventId/my-schedule')
  @RequiresPermission('engagement.conferences.view_schedule')
  async getTeacherSchedule(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.conferencesService.getTeacherSchedule(tenant.tenant_id, eventId, user.sub);
  }

  // GET /v1/engagement/conferences/:eventId/stats
  @Get(':eventId/stats')
  @RequiresPermission('engagement.conferences.manage')
  async getBookingStats(
    @CurrentTenant() tenant: TenantContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.conferencesService.getBookingStats(tenant.tenant_id, eventId);
  }

  // GET /v1/engagement/conferences/:eventId/bookings
  @Get(':eventId/bookings')
  @RequiresPermission('engagement.conferences.manage')
  async findAllBookings(
    @CurrentTenant() tenant: TenantContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.conferencesService.findAllBookings(tenant.tenant_id, eventId, {
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  // POST /v1/engagement/conferences/:eventId/bookings
  @Post(':eventId/bookings')
  @RequiresPermission('engagement.conferences.manage')
  async createBooking(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(new ZodValidationPipe(createBookingSchema)) dto: CreateBookingDto,
  ) {
    return this.conferencesService.createBooking(tenant.tenant_id, eventId, user.sub, dto);
  }

  // PATCH /v1/engagement/conferences/:eventId/my-slots/:slotId
  @Patch(':eventId/my-slots/:slotId')
  @RequiresPermission('engagement.conferences.view_schedule')
  async updateOwnTimeSlot(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body(new ZodValidationPipe(updateTimeSlotSchema)) dto: { status: 'available' | 'blocked' },
  ) {
    return this.conferencesService.updateOwnTimeSlot(
      tenant.tenant_id,
      eventId,
      slotId,
      user.sub,
      dto.status,
    );
  }

  // PATCH /v1/engagement/conferences/:eventId/time-slots/:slotId
  @Patch(':eventId/time-slots/:slotId')
  @RequiresPermission('engagement.conferences.manage')
  async updateTimeSlot(
    @CurrentTenant() tenant: TenantContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body(new ZodValidationPipe(updateTimeSlotSchema)) dto: { status: 'available' | 'blocked' },
  ) {
    return this.conferencesService.updateTimeSlot(tenant.tenant_id, eventId, slotId, dto);
  }

  // DELETE /v1/engagement/conferences/:eventId/bookings/:bookingId
  @Delete(':eventId/bookings/:bookingId')
  @RequiresPermission('engagement.conferences.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelBooking(
    @CurrentTenant() tenant: TenantContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    await this.conferencesService.cancelBooking(tenant.tenant_id, eventId, bookingId);
  }
}
