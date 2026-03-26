import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload, TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { BehaviourStudentsService } from './behaviour-students.service';

// ─── Local Query Schemas ─────────────────────────────────────────────────────

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class BehaviourStudentsController {
  constructor(
    private readonly studentsService: BehaviourStudentsService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // ─── Student List ──────────────────────────────────────────────────────────

  @Get('behaviour/students')
  @RequiresPermission('behaviour.view')
  async listStudents(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.studentsService.listStudents(
      tenant.tenant_id,
      user.sub,
      permissions,
      query.page,
      query.pageSize,
    );
  }

  // ─── Student Profile ───────────────────────────────────────────────────────

  @Get('behaviour/students/:studentId')
  @RequiresPermission('behaviour.view')
  async getStudentProfile(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.studentsService.getStudentProfile(
      tenant.tenant_id,
      studentId,
    );
  }

  // ─── Student Timeline ─────────────────────────────────────────────────────

  @Get('behaviour/students/:studentId/timeline')
  @RequiresPermission('behaviour.view')
  async getStudentTimeline(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.studentsService.getStudentTimeline(
      tenant.tenant_id,
      studentId,
      query.page,
      query.pageSize,
    );
  }

  // ─── Student Analytics (STUB) ─────────────────────────────────────────────

  @Get('behaviour/students/:studentId/analytics')
  @RequiresPermission('behaviour.view')
  async getStudentAnalytics(
    @Param('studentId', ParseUUIDPipe) _studentId: string,
  ) {
    // STUB: Analytics -- will be implemented in a later phase
    return { data: null, message: 'Student analytics not yet implemented' };
  }

  // ─── Student Points ───────────────────────────────────────────────────────

  @Get('behaviour/students/:studentId/points')
  @RequiresPermission('behaviour.view')
  async getStudentPoints(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.studentsService.getStudentPoints(
      tenant.tenant_id,
      studentId,
    );
  }

  // ─── Student Sanctions (STUB) ─────────────────────────────────────────────

  @Get('behaviour/students/:studentId/sanctions')
  @RequiresPermission('behaviour.view')
  async getStudentSanctions(
    @Param('studentId', ParseUUIDPipe) _studentId: string,
  ) {
    // STUB: Sanctions -- will be implemented in a later phase
    return { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
  }

  // ─── Student Interventions (STUB) ─────────────────────────────────────────

  @Get('behaviour/students/:studentId/interventions')
  @RequiresPermission('behaviour.view')
  async getStudentInterventions(
    @Param('studentId', ParseUUIDPipe) _studentId: string,
  ) {
    // STUB: Interventions -- will be implemented in a later phase
    return { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
  }

  // ─── Student Awards (STUB) ────────────────────────────────────────────────

  @Get('behaviour/students/:studentId/awards')
  @RequiresPermission('behaviour.view')
  async getStudentAwards(
    @Param('studentId', ParseUUIDPipe) _studentId: string,
  ) {
    // STUB: Awards -- will be implemented in a later phase
    return { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
  }

  // ─── Student AI Summary (STUB) ────────────────────────────────────────────

  @Get('behaviour/students/:studentId/ai-summary')
  @RequiresPermission('behaviour.ai_query')
  async getStudentAiSummary(
    @Param('studentId', ParseUUIDPipe) _studentId: string,
  ) {
    // STUB: AI summary -- will be implemented in a later phase
    return { data: null, message: 'AI summary not yet implemented' };
  }

  // ─── Student Hover Card Preview ───────────────────────────────────────────

  @Get('behaviour/students/:studentId/preview')
  @RequiresPermission('behaviour.view')
  async getStudentPreview(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.studentsService.getStudentPreview(
      tenant.tenant_id,
      studentId,
    );
  }

  // ─── Student PDF Export (STUB) ────────────────────────────────────────────

  @Get('behaviour/students/:studentId/export')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async exportStudentPdf(
    @Param('studentId', ParseUUIDPipe) _studentId: string,
  ) {
    // STUB: PDF export -- will be implemented in a later phase
    return { data: null, message: 'PDF export not yet implemented' };
  }

  // ─── Parent View (STUB) ──────────────────────────────────────────────────

  @Get('behaviour/students/:studentId/parent-view')
  @RequiresPermission('parent.view_behaviour')
  async getParentView(
    @Param('studentId', ParseUUIDPipe) _studentId: string,
  ) {
    // STUB: Parent view -- will be implemented in a later phase
    return { data: null, message: 'Parent view not yet implemented' };
  }

  // ─── Student Tasks ────────────────────────────────────────────────────────

  @Get('behaviour/students/:studentId/tasks')
  @RequiresPermission('behaviour.view')
  async getStudentTasks(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.studentsService.getStudentTasks(
      tenant.tenant_id,
      studentId,
      query.page,
      query.pageSize,
    );
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async getUserPermissions(
    membershipId: string | null,
  ): Promise<string[]> {
    if (!membershipId) return [];
    return this.permissionCacheService.getPermissions(membershipId);
  }
}
