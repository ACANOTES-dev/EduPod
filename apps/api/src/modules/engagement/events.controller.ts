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
import type { EventStaffRole } from '@prisma/client';
import { createEngagementEventSchema, updateEngagementEventSchema } from '@school/shared';
import type {
  CreateEngagementEventDto,
  JwtPayload,
  TenantContext,
  UpdateEngagementEventDto,
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

import { EventParticipantsService } from './event-participants.service';
import { EventsService } from './events.service';

// ─── Inline Schemas ─────────────────────────────────────────────────────────

const addStaffSchema = z.object({
  staff_id: z.string().uuid(),
  role: z.enum(['organiser', 'supervisor', 'trip_leader']),
});

const updateParticipantSchema = z.object({
  status: z.string().optional(),
  consent_status: z.string().optional(),
  payment_status: z.string().optional(),
});

// ─── Controller ─────────────────────────────────────────────────────────────

@Controller('v1/engagement/events')
@ModuleEnabled('engagement')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly eventParticipantsService: EventParticipantsService,
  ) {}

  // POST /v1/engagement/events
  @Post()
  @RequiresPermission('engagement.events.create')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createEngagementEventSchema)) dto: CreateEngagementEventDto,
  ) {
    return this.eventsService.create(tenant.tenant_id, user.sub, dto);
  }

  // GET /v1/engagement/events
  @Get()
  @RequiresPermission('engagement.events.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('event_type') eventType?: string,
    @Query('academic_year_id') academicYearId?: string,
    @Query('search') search?: string,
  ) {
    return this.eventsService.findAll(tenant.tenant_id, {
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      status,
      event_type: eventType,
      academic_year_id: academicYearId,
      search,
    });
  }

  // GET /v1/engagement/events/:id
  @Get(':id')
  @RequiresPermission('engagement.events.view')
  async findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.findOne(tenant.tenant_id, id);
  }

  // PATCH /v1/engagement/events/:id
  @Patch(':id')
  @RequiresPermission('engagement.events.edit')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEngagementEventSchema)) dto: UpdateEngagementEventDto,
  ) {
    return this.eventsService.update(tenant.tenant_id, id, dto);
  }

  // DELETE /v1/engagement/events/:id
  @Delete(':id')
  @RequiresPermission('engagement.events.edit')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.eventsService.remove(tenant.tenant_id, id);
  }

  // POST /v1/engagement/events/:id/publish
  @Post(':id/publish')
  @RequiresPermission('engagement.events.publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventsService.publish(tenant.tenant_id, id, user.sub);
  }

  // POST /v1/engagement/events/:id/open
  @Post(':id/open')
  @RequiresPermission('engagement.events.edit')
  @HttpCode(HttpStatus.OK)
  async open(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventsService.open(tenant.tenant_id, id, user.sub);
  }

  // POST /v1/engagement/events/:id/close
  @Post(':id/close')
  @RequiresPermission('engagement.events.edit')
  @HttpCode(HttpStatus.OK)
  async close(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventsService.close(tenant.tenant_id, id, user.sub);
  }

  // POST /v1/engagement/events/:id/cancel
  @Post(':id/cancel')
  @RequiresPermission('engagement.events.cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventsService.cancel(tenant.tenant_id, id, user.sub);
  }

  // GET /v1/engagement/events/:id/staff
  @Get(':id/staff')
  @RequiresPermission('engagement.events.view')
  async listStaff(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.listStaff(tenant.tenant_id, id);
  }

  // POST /v1/engagement/events/:id/staff
  @Post(':id/staff')
  @RequiresPermission('engagement.events.edit')
  async addStaff(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addStaffSchema)) dto: { staff_id: string; role: string },
  ) {
    return this.eventsService.addStaff(
      tenant.tenant_id,
      id,
      dto.staff_id,
      dto.role as EventStaffRole,
    );
  }

  // DELETE /v1/engagement/events/:id/staff/:staffId
  @Delete(':id/staff/:staffId')
  @RequiresPermission('engagement.events.edit')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeStaff(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('staffId', ParseUUIDPipe) staffId: string,
  ) {
    await this.eventsService.removeStaff(tenant.tenant_id, id, staffId);
  }

  // GET /v1/engagement/events/:id/participants
  @Get(':id/participants')
  @RequiresPermission('engagement.events.view')
  async findAllParticipants(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('consent_status') consentStatus?: string,
    @Query('payment_status') paymentStatus?: string,
  ) {
    return this.eventParticipantsService.findAllForEvent(tenant.tenant_id, id, {
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      status,
      consent_status: consentStatus,
      payment_status: paymentStatus,
    });
  }

  // PATCH /v1/engagement/events/:id/participants/:participantId
  @Patch(':id/participants/:participantId')
  @RequiresPermission('engagement.events.edit')
  async updateParticipant(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body(new ZodValidationPipe(updateParticipantSchema))
    dto: { status?: string; consent_status?: string; payment_status?: string },
  ) {
    return this.eventParticipantsService.updateParticipant(
      tenant.tenant_id,
      id,
      participantId,
      dto,
    );
  }

  // GET /v1/engagement/events/:id/dashboard
  @Get(':id/dashboard')
  @RequiresPermission('engagement.events.view_dashboard')
  async getDashboard(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventsService.getDashboard(tenant.tenant_id, id);
  }

  // POST /v1/engagement/events/:id/remind-outstanding
  @Post(':id/remind-outstanding')
  @RequiresPermission('engagement.events.edit')
  @HttpCode(HttpStatus.OK)
  async remindOutstanding(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventParticipantsService.remindOutstanding(tenant.tenant_id, id);
  }
}
