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
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload, TenantContext } from '@school/shared';
import { createBookingSchema, type CreateBookingDto } from '@school/shared/engagement';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ConferencesService } from './conferences.service';

// ─── Controller ─────────────────────────────────────────────────────────────

@Controller('v1/parent/engagement/conferences')
@ModuleEnabled('engagement')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class ParentConferencesController {
  constructor(private readonly conferencesService: ConferencesService) {}

  // GET /v1/parent/engagement/conferences/:eventId/available-slots
  @Get(':eventId/available-slots')
  @RequiresPermission('parent.view_engagement')
  async getAvailableSlots(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.conferencesService.getAvailableSlots(tenant.tenant_id, eventId, user.sub);
  }

  // POST /v1/parent/engagement/conferences/:eventId/book
  @Post(':eventId/book')
  @RequiresPermission('parent.manage_engagement')
  async book(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(new ZodValidationPipe(createBookingSchema)) dto: CreateBookingDto,
  ) {
    return this.conferencesService.parentBook(tenant.tenant_id, eventId, user.sub, dto);
  }

  // GET /v1/parent/engagement/conferences/:eventId/my-bookings
  @Get(':eventId/my-bookings')
  @RequiresPermission('parent.view_engagement')
  async getMyBookings(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.conferencesService.getParentBookings(tenant.tenant_id, eventId, user.sub);
  }

  // DELETE /v1/parent/engagement/conferences/:eventId/bookings/:bookingId
  @Delete(':eventId/bookings/:bookingId')
  @RequiresPermission('parent.manage_engagement')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelBooking(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    await this.conferencesService.parentCancelBooking(
      tenant.tenant_id,
      eventId,
      bookingId,
      user.sub,
    );
  }
}
