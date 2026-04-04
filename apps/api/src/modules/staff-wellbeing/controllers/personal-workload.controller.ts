import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  coverHistoryQuerySchema,
  type PersonalTimetableQuality,
  type PersonalWorkloadSummary,
} from '@school/shared/staff-wellbeing';

import { BlockImpersonation } from '../../../common/decorators/block-impersonation.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { BlockImpersonationGuard } from '../../../common/guards/block-impersonation.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { StaffProfileReadFacade } from '../../staff-profiles/staff-profile-read.facade';
import { WorkloadCacheService } from '../services/workload-cache.service';
import { WorkloadComputeService } from '../services/workload-compute.service';

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('v1')
@ModuleEnabled('staff_wellbeing')
@BlockImpersonation()
@UseGuards(AuthGuard, ModuleEnabledGuard, BlockImpersonationGuard)
export class PersonalWorkloadController {
  constructor(
    private readonly computeService: WorkloadComputeService,
    private readonly cacheService: WorkloadCacheService,
    private readonly prisma: PrismaService,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── 1. Personal Workload Summary ──────────────────────────────────────

  @Get('staff-wellbeing/my-workload/summary')
  async getSummary(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    const staffProfileId = await this.resolveStaffProfile(tenant.tenant_id, user.sub);

    const cached = await this.cacheService.getCachedPersonal<PersonalWorkloadSummary>(
      tenant.tenant_id,
      staffProfileId,
      'summary',
    );
    if (cached) return cached;

    const result = await this.computeService.getPersonalWorkloadSummary(
      tenant.tenant_id,
      staffProfileId,
    );

    await this.cacheService.setCachedPersonal(tenant.tenant_id, staffProfileId, 'summary', result);

    return result;
  }

  // ─── 2. Cover History (paginated) ─────────────────────────────────────

  @Get('staff-wellbeing/my-workload/cover-history')
  async getCoverHistory(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(coverHistoryQuerySchema))
    query: z.infer<typeof coverHistoryQuerySchema>,
  ) {
    const staffProfileId = await this.resolveStaffProfile(tenant.tenant_id, user.sub);

    return this.computeService.getPersonalCoverHistory(
      tenant.tenant_id,
      staffProfileId,
      query.page,
      query.pageSize,
    );
  }

  // ─── 3. Timetable Quality ─────────────────────────────────────────────

  @Get('staff-wellbeing/my-workload/timetable-quality')
  async getTimetableQuality(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    const staffProfileId = await this.resolveStaffProfile(tenant.tenant_id, user.sub);

    const cached = await this.cacheService.getCachedPersonal<PersonalTimetableQuality>(
      tenant.tenant_id,
      staffProfileId,
      'timetable-quality',
    );
    if (cached) return cached;

    const result = await this.computeService.getPersonalTimetableQuality(
      tenant.tenant_id,
      staffProfileId,
    );

    await this.cacheService.setCachedPersonal(
      tenant.tenant_id,
      staffProfileId,
      'timetable-quality',
      result,
    );

    return result;
  }

  // ─── Staff Profile Resolution ─────────────────────────────────────────

  private async resolveStaffProfile(tenantId: string, userId: string): Promise<string> {
    const profile = await this.staffProfileReadFacade.findByUserId(tenantId, userId);

    if (!profile) {
      throw new NotFoundException({
        error: {
          code: 'STAFF_PROFILE_NOT_FOUND',
          message: 'No staff profile found for the current user.',
        },
      });
    }

    return profile.id;
  }
}
