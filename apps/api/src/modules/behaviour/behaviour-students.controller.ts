import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload, TenantContext } from '@school/shared';
import type { Response } from 'express';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { BehaviourExportService } from './behaviour-export.service';
import { BehaviourStudentsService } from './behaviour-students.service';

// ─── Local Query Schemas ─────────────────────────────────────────────────────

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('v1')
@ModuleEnabled('behaviour')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BehaviourStudentsController {
  private readonly logger = new Logger(BehaviourStudentsController.name);

  constructor(
    private readonly studentsService: BehaviourStudentsService,
    private readonly exportService: BehaviourExportService,
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

  // ─── Student Analytics ───────────────────────────────────────────────────

  @Get('behaviour/students/:studentId/analytics')
  @RequiresPermission('behaviour.view')
  async getStudentAnalytics(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.studentsService.getStudentAnalytics(
      tenant.tenant_id,
      studentId,
    );
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

  // ─── Student Sanctions ───────────────────────────────────────────────────

  @Get('behaviour/students/:studentId/sanctions')
  @RequiresPermission('behaviour.view')
  async getStudentSanctions(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.studentsService.getStudentSanctions(
      tenant.tenant_id,
      studentId,
      query.page,
      query.pageSize,
    );
  }

  // ─── Student Interventions ───────────────────────────────────────────────

  @Get('behaviour/students/:studentId/interventions')
  @RequiresPermission('behaviour.view')
  async getStudentInterventions(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.studentsService.getStudentInterventions(
      tenant.tenant_id,
      studentId,
      query.page,
      query.pageSize,
    );
  }

  // ─── Student Awards ──────────────────────────────────────────────────────

  @Get('behaviour/students/:studentId/awards')
  @RequiresPermission('behaviour.view')
  async getStudentAwards(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.studentsService.getStudentAwards(
      tenant.tenant_id,
      studentId,
      query.page,
      query.pageSize,
    );
  }

  // ─── Student AI Summary ──────────────────────────────────────────────────

  @Get('behaviour/students/:studentId/ai-summary')
  @RequiresPermission('behaviour.ai_query')
  async getStudentAiSummary(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.studentsService.getStudentAiSummary(
      tenant.tenant_id,
      studentId,
    );
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

  // ─── Student PDF Export ──────────────────────────────────────────────────

  @Get('behaviour/students/:studentId/export')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async exportStudentPdf(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.generateStudentPackPdf(
      tenant.tenant_id, studentId, user.sub, 'en',
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="student-pack-${studentId.slice(0, 8)}.pdf"`,
    });
    res.send(buffer);
  }

  // ─── Parent View ─────────────────────────────────────────────────────────

  @Get('behaviour/students/:studentId/parent-view')
  @RequiresPermission('parent.view_behaviour')
  async getParentView(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.studentsService.getParentView(
      tenant.tenant_id,
      studentId,
    );
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
