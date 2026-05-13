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
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  parentBehaviourIncidentsQuerySchema,
  parentBehaviourStudentQuerySchema,
  parentSubmitAppealSchema,
  type ParentSubmitAppealDto,
} from '@school/shared/behaviour';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BehaviourParentService } from './behaviour-parent.service';

@Controller('v1/parent/behaviour')
@ModuleEnabled('behaviour')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BehaviourParentController {
  constructor(private readonly parentService: BehaviourParentService) {}

  @Get('summary')
  @RequiresPermission('parent.view_behaviour')
  async getSummary(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.parentService.getSummary(tenant.tenant_id, user.sub);
  }

  @Get('incidents')
  @RequiresPermission('parent.view_behaviour')
  async getIncidents(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(parentBehaviourIncidentsQuerySchema))
    query: ReturnType<typeof parentBehaviourIncidentsQuerySchema.parse>,
  ) {
    return this.parentService.getIncidents(
      tenant.tenant_id,
      user.sub,
      query.student_id,
      query.page,
      query.pageSize,
    );
  }

  @Get('points-awards')
  @RequiresPermission('parent.view_behaviour')
  async getPointsAwards(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(parentBehaviourStudentQuerySchema))
    query: ReturnType<typeof parentBehaviourStudentQuerySchema.parse>,
  ) {
    return this.parentService.getPointsAwards(tenant.tenant_id, user.sub, query.student_id);
  }

  @Get('sanctions')
  @RequiresPermission('parent.view_behaviour')
  async getSanctions(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(parentBehaviourStudentQuerySchema))
    query: ReturnType<typeof parentBehaviourStudentQuerySchema.parse>,
  ) {
    return this.parentService.getSanctions(tenant.tenant_id, user.sub, query.student_id);
  }

  @Post('acknowledge/:acknowledgementId')
  @RequiresPermission('parent.view_behaviour')
  @HttpCode(HttpStatus.OK)
  async acknowledge(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('acknowledgementId', ParseUUIDPipe) acknowledgementId: string,
  ) {
    return this.parentService.acknowledge(tenant.tenant_id, user.sub, acknowledgementId);
  }

  @Get('recognition')
  @RequiresPermission('parent.view_behaviour')
  async getRecognitionWall(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.parentService.getRecognitionWall(tenant.tenant_id, user.sub);
  }

  @Post('appeal')
  @RequiresPermission('behaviour.appeal')
  @HttpCode(HttpStatus.CREATED)
  async submitAppeal(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(parentSubmitAppealSchema))
    dto: ParentSubmitAppealDto,
  ) {
    return this.parentService.submitAppeal(tenant.tenant_id, user.sub, dto);
  }

  // ─── Pending parent-consent publications (WB-C-25) ──────────────────

  @Get('recognition/pending')
  @RequiresPermission('parent.view_behaviour')
  async getPendingPublications(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.parentService.listPendingPublications(tenant.tenant_id, user.sub);
  }

  @Patch('recognition/pending/:id/approve')
  @RequiresPermission('parent.view_behaviour')
  async approvePendingPublication(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.parentService.approvePublicationAsParent(tenant.tenant_id, user.sub, id);
  }

  @Patch('recognition/pending/:id/reject')
  @RequiresPermission('parent.view_behaviour')
  async rejectPendingPublication(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(z.object({ reason: z.string().max(500).optional() })))
    dto: { reason?: string },
  ) {
    return this.parentService.rejectPublicationAsParent(tenant.tenant_id, user.sub, id, dto.reason);
  }

  // ─── Documents (WB-C-28) ──────────────────────────────────────────────

  @Get('documents')
  @RequiresPermission('parent.view_behaviour')
  async listDocuments(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(
      new ZodValidationPipe(
        z.object({
          student_id: z.string().uuid().optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
        }),
      ),
    )
    query: { student_id?: string; page: number; pageSize: number },
  ) {
    return this.parentService.listParentDocuments(tenant.tenant_id, user.sub, query);
  }
}
