import {
  Body,
  Controller,
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
  bulkMarkServedSchema,
  createSanctionSchema,
  recordParentMeetingSchema,
  sanctionCalendarQuerySchema,
  sanctionListQuerySchema,
  sanctionStatusTransitionSchema,
  updateSanctionSchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BehaviourSanctionsService } from './behaviour-sanctions.service';

@Controller('v1')
@ModuleEnabled('behaviour')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BehaviourSanctionsController {
  constructor(
    private readonly sanctionsService: BehaviourSanctionsService,
  ) {}

  // ─── Create ─────────────────────────────────────────────────────────────────

  @Post('behaviour/sanctions')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createSanctionSchema))
    dto: z.infer<typeof createSanctionSchema>,
  ) {
    return this.sanctionsService.create(tenant.tenant_id, user.sub, dto);
  }

  // ─── List ───────────────────────────────────────────────────────────────────

  @Get('behaviour/sanctions')
  @RequiresPermission('behaviour.manage')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(sanctionListQuerySchema))
    query: z.infer<typeof sanctionListQuerySchema>,
  ) {
    return this.sanctionsService.list(tenant.tenant_id, query);
  }

  // ─── Static routes ABOVE :id param routes ───────────────────────────────────

  @Get('behaviour/sanctions/today')
  @RequiresPermission('behaviour.manage')
  async getTodaySanctions(
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.sanctionsService.getTodaySanctions(tenant.tenant_id);
  }

  @Get('behaviour/sanctions/my-supervision')
  @RequiresPermission('behaviour.view')
  async getMySupervision(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.sanctionsService.getMySupervision(
      tenant.tenant_id,
      user.sub,
    );
  }

  @Get('behaviour/sanctions/calendar')
  @RequiresPermission('behaviour.manage')
  async getCalendarView(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(sanctionCalendarQuerySchema))
    query: z.infer<typeof sanctionCalendarQuerySchema>,
  ) {
    return this.sanctionsService.getCalendarView(tenant.tenant_id, query);
  }

  @Get('behaviour/sanctions/active-suspensions')
  @RequiresPermission('behaviour.manage')
  async getActiveSuspensions(
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.sanctionsService.getActiveSuspensions(tenant.tenant_id);
  }

  @Get('behaviour/sanctions/returning-soon')
  @RequiresPermission('behaviour.manage')
  async getReturningSoon(
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.sanctionsService.getReturningSoon(tenant.tenant_id);
  }

  @Post('behaviour/sanctions/bulk-mark-served')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async bulkMarkServed(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(bulkMarkServedSchema))
    dto: z.infer<typeof bulkMarkServedSchema>,
  ) {
    return this.sanctionsService.bulkMarkServed(
      tenant.tenant_id,
      dto,
      user.sub,
    );
  }

  // ─── Parameterised :id routes ───────────────────────────────────────────────

  @Get('behaviour/sanctions/:id')
  @RequiresPermission('behaviour.manage')
  async getById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sanctionsService.getById(tenant.tenant_id, id);
  }

  @Patch('behaviour/sanctions/:id')
  @RequiresPermission('behaviour.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSanctionSchema))
    dto: z.infer<typeof updateSanctionSchema>,
  ) {
    return this.sanctionsService.update(
      tenant.tenant_id,
      id,
      dto,
      user.sub,
    );
  }

  @Patch('behaviour/sanctions/:id/status')
  @RequiresPermission('behaviour.manage')
  async transitionStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sanctionStatusTransitionSchema))
    dto: z.infer<typeof sanctionStatusTransitionSchema>,
  ) {
    return this.sanctionsService.transitionStatus(
      tenant.tenant_id,
      id,
      dto.status,
      dto.reason,
      user.sub,
    );
  }

  @Post('behaviour/sanctions/:id/parent-meeting')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async recordParentMeeting(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordParentMeetingSchema))
    dto: z.infer<typeof recordParentMeetingSchema>,
  ) {
    return this.sanctionsService.recordParentMeeting(
      tenant.tenant_id,
      id,
      dto,
    );
  }

  @Post('behaviour/sanctions/:id/appeal')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async submitAppeal(
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return { message: 'Use POST /appeals endpoint' };
  }

  @Patch('behaviour/sanctions/:id/appeal-outcome')
  @RequiresPermission('behaviour.manage')
  async appealOutcome(
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return { message: 'Handled by appeals service — use PATCH /appeals/:id/outcome' };
  }
}
