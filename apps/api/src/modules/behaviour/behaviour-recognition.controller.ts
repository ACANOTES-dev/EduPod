import {
  BadRequestException,
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

import {
  approvePublicationSchema,
  behaviourSettingsSchema,
  bulkHouseAssignSchema,
  createManualAwardSchema,
  createPublicationSchema,
  leaderboardQuerySchema,
  listAwardsQuerySchema,
  wallQuerySchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourAwardService } from './behaviour-award.service';
import type { HouseMemberWithPoints } from './behaviour-house.service';
import { BehaviourHouseService } from './behaviour-house.service';
import type { HouseStanding, LeaderboardResult } from './behaviour-points.service';
import { BehaviourPointsService } from './behaviour-points.service';
import { BehaviourRecognitionService } from './behaviour-recognition.service';

// ─── Local Query Schema ─────────────────────────────────────────────────────

const publicFeedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class BehaviourRecognitionController {
  constructor(
    private readonly recognitionService: BehaviourRecognitionService,
    private readonly awardService: BehaviourAwardService,
    private readonly houseService: BehaviourHouseService,
    private readonly pointsService: BehaviourPointsService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Recognition Wall ────────────────────────────────────────────────────

  @Get('behaviour/recognition/wall')
  @RequiresPermission('behaviour.view')
  async getWall(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(wallQuerySchema))
    query: z.infer<typeof wallQuerySchema>,
  ) {
    return this.recognitionService.getWall(tenant.tenant_id, query);
  }

  // ─── Leaderboard ──────────────────────────────────────────────────────────

  @Get('behaviour/recognition/leaderboard')
  @RequiresPermission('behaviour.view')
  async getLeaderboard(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(leaderboardQuerySchema))
    query: z.infer<typeof leaderboardQuerySchema>,
  ): Promise<LeaderboardResult> {
    return this.pointsService.getLeaderboard(tenant.tenant_id, query);
  }

  // ─── House Standings ──────────────────────────────────────────────────────

  @Get('behaviour/recognition/houses')
  @RequiresPermission('behaviour.view')
  async getHouseStandings(@CurrentTenant() tenant: TenantContext): Promise<HouseStanding[]> {
    const academicYear = await this.getActiveAcademicYear(tenant.tenant_id);
    return this.pointsService.getHouseStandings(tenant.tenant_id, academicYear.id);
  }

  @Get('behaviour/recognition/houses/:id')
  @RequiresPermission('behaviour.view')
  async getHouseDetail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ id: string; name: string; members: HouseMemberWithPoints[] }> {
    const academicYear = await this.getActiveAcademicYear(tenant.tenant_id);
    return this.houseService.getHouseDetail(tenant.tenant_id, id, academicYear.id);
  }

  // ─── Awards ───────────────────────────────────────────────────────────────

  @Post('behaviour/recognition/awards')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.CREATED)
  async createManualAward(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createManualAwardSchema))
    dto: z.infer<typeof createManualAwardSchema>,
  ) {
    return this.awardService.createManualAward(tenant.tenant_id, user.sub, dto);
  }

  @Get('behaviour/recognition/awards')
  @RequiresPermission('behaviour.view')
  async listAwards(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listAwardsQuerySchema))
    query: z.infer<typeof listAwardsQuerySchema>,
  ) {
    return this.awardService.listAwards(tenant.tenant_id, query);
  }

  // ─── Publications ─────────────────────────────────────────────────────────

  @Post('behaviour/recognition/publications')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.CREATED)
  async createPublication(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createPublicationSchema))
    dto: z.infer<typeof createPublicationSchema>,
  ) {
    const settings = await this.getBehaviourSettings(tenant.tenant_id);

    return this.recognitionService.createPublicationApproval(this.prisma, tenant.tenant_id, {
      publication_type: dto.publication_type,
      entity_type: dto.entity_type,
      entity_id: dto.entity_id,
      student_id: dto.student_id,
      requires_parent_consent: settings.recognition_wall_requires_consent,
      admin_approval_required: settings.recognition_wall_admin_approval_required,
    });
  }

  @Get('behaviour/recognition/publications/:id')
  @RequiresPermission('behaviour.manage')
  async getPublicationDetail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.recognitionService.getPublicationDetail(tenant.tenant_id, id);
  }

  @Patch('behaviour/recognition/publications/:id/approve')
  @RequiresPermission('behaviour.admin')
  async approvePublication(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approvePublicationSchema))
    _dto: z.infer<typeof approvePublicationSchema>,
  ) {
    return this.recognitionService.approvePublication(tenant.tenant_id, id, user.sub);
  }

  @Patch('behaviour/recognition/publications/:id/reject')
  @RequiresPermission('behaviour.admin')
  async rejectPublication(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.recognitionService.rejectPublication(tenant.tenant_id, id, user.sub);
  }

  // ─── Public Feed ──────────────────────────────────────────────────────────

  // TODO: This endpoint should be truly public (no auth). There is no @Public()
  // or @SkipAuth() decorator in the codebase. For now it requires behaviour.view
  // permission. When a public access pattern is added, remove the guard.
  @Get('behaviour/recognition/public/feed')
  @RequiresPermission('behaviour.view')
  async getPublicFeed(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(publicFeedQuerySchema))
    query: z.infer<typeof publicFeedQuerySchema>,
  ) {
    return this.recognitionService.getPublicFeed(tenant.tenant_id, query.page, query.pageSize);
  }

  // ─── Bulk House Assignment ────────────────────────────────────────────────

  @Post('behaviour/recognition/houses/bulk-assign')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.OK)
  async bulkHouseAssign(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(bulkHouseAssignSchema))
    dto: z.infer<typeof bulkHouseAssignSchema>,
  ) {
    return this.houseService.bulkAssign(tenant.tenant_id, dto.academic_year_id, dto.assignments);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async getActiveAcademicYear(tenantId: string): Promise<{ id: string }> {
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { tenant_id: tenantId, status: 'active' },
      select: { id: true },
    });

    if (!academicYear) {
      throw new BadRequestException({
        code: 'NO_ACTIVE_ACADEMIC_YEAR',
        message: 'No active academic year found',
      });
    }

    return academicYear;
  }

  private async getBehaviourSettings(tenantId: string) {
    const tenantSetting = await this.prisma.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });
    const raw = (tenantSetting?.settings ?? {}) as Record<string, unknown>;
    const behaviour = (raw.behaviour ?? {}) as Record<string, unknown>;
    return behaviourSettingsSchema.parse(behaviour);
  }
}
