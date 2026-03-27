import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  parentBehaviourIncidentsQuerySchema,
  parentBehaviourStudentQuerySchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BehaviourParentService } from './behaviour-parent.service';

@Controller('v1/parent/behaviour')
@UseGuards(AuthGuard, PermissionGuard)
export class BehaviourParentController {
  constructor(
    private readonly parentService: BehaviourParentService,
  ) {}

  @Get('summary')
  @RequiresPermission('parent.view_behaviour')
  async getSummary(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
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
    return this.parentService.getPointsAwards(
      tenant.tenant_id,
      user.sub,
      query.student_id,
    );
  }

  @Get('sanctions')
  @RequiresPermission('parent.view_behaviour')
  async getSanctions(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(parentBehaviourStudentQuerySchema))
    query: ReturnType<typeof parentBehaviourStudentQuerySchema.parse>,
  ) {
    return this.parentService.getSanctions(
      tenant.tenant_id,
      user.sub,
      query.student_id,
    );
  }

  @Post('acknowledge/:acknowledgementId')
  @RequiresPermission('parent.view_behaviour')
  @HttpCode(HttpStatus.OK)
  async acknowledge(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('acknowledgementId', ParseUUIDPipe) acknowledgementId: string,
  ) {
    return this.parentService.acknowledge(
      tenant.tenant_id,
      user.sub,
      acknowledgementId,
    );
  }

  @Get('recognition')
  @RequiresPermission('parent.view_behaviour')
  async getRecognitionWall(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.parentService.getRecognitionWall(tenant.tenant_id, user.sub);
  }
}
