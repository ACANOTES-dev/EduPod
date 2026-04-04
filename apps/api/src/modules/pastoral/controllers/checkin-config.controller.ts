import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import type { TenantContext } from '@school/shared';
import { pastoralTenantSettingsSchema } from '@school/shared/pastoral';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ConfigurationReadFacade } from '../../configuration/configuration-read.facade';

import { PrismaService } from '../../prisma/prisma.service';
import { CheckinPrerequisiteService } from '../services/checkin-prerequisite.service';

// ─── Config update schema ───────────────────────────────────────────────────

const checkinConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  frequency: z.enum(['daily', 'weekly']).optional(),
  monitoring_owner_user_ids: z.array(z.string().uuid()).optional(),
  monitoring_hours_start: z.string().optional(),
  monitoring_hours_end: z.string().optional(),
  monitoring_days: z.array(z.number().min(0).max(6)).optional(),
  flagged_keywords: z.array(z.string()).optional(),
  consecutive_low_threshold: z.number().min(2).optional(),
  min_cohort_for_aggregate: z.number().min(5).optional(),
  prerequisites_acknowledged: z.boolean().optional(),
});

// ─── Controller ─────────────────────────────────────────────────────────────

@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class CheckinConfigController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationReadFacade: ConfigurationReadFacade,
    private readonly prerequisiteService: CheckinPrerequisiteService,
  ) {}

  // ─── 1. Prerequisite Status ─────────────────────────────────────────────

  @Get('pastoral/checkins/config')
  @RequiresPermission('pastoral.admin')
  async getConfig(@CurrentTenant() tenant: TenantContext) {
    const record = await this.configurationReadFacade.findSettings(tenant.tenant_id);

    const existingSettings = (record?.settings as Record<string, unknown>) ?? {};
    const existingPastoral = (existingSettings.pastoral as Record<string, unknown>) ?? {};
    const parsed = pastoralTenantSettingsSchema.parse(existingPastoral);

    return { data: parsed.checkins };
  }

  // ─── 2. Prerequisite Status ─────────────────────────────────────────────

  @Get('pastoral/checkins/config/prerequisites')
  @RequiresPermission('pastoral.admin')
  async prerequisites(@CurrentTenant() tenant: TenantContext) {
    return this.prerequisiteService.getPrerequisiteStatus(tenant.tenant_id);
  }

  // ─── 3. Update Checkin Config ───────────────────────────────────────────

  @Patch('pastoral/checkins/config')
  @RequiresPermission('pastoral.admin')
  async updateConfig(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(checkinConfigUpdateSchema))
    dto: z.infer<typeof checkinConfigUpdateSchema>,
  ) {
    // If enabling check-ins, validate prerequisites first
    if (dto.enabled === true) {
      await this.prerequisiteService.validatePrerequisites(tenant.tenant_id);
    }

    // Load current settings
    const record = await this.configurationReadFacade.findSettings(tenant.tenant_id);

    const existingSettings = (record?.settings as Record<string, unknown>) ?? {};
    const existingPastoral = (existingSettings.pastoral as Record<string, unknown>) ?? {};
    const existingCheckins = (existingPastoral.checkins as Record<string, unknown>) ?? {};

    // Merge only provided fields into checkins config
    const mergedCheckins: Record<string, unknown> = { ...existingCheckins };

    if (dto.enabled !== undefined) {
      mergedCheckins.enabled = dto.enabled;
    }
    if (dto.frequency !== undefined) {
      mergedCheckins.frequency = dto.frequency;
    }
    if (dto.monitoring_owner_user_ids !== undefined) {
      mergedCheckins.monitoring_owner_user_ids = dto.monitoring_owner_user_ids;
    }
    if (dto.monitoring_hours_start !== undefined) {
      mergedCheckins.monitoring_hours_start = dto.monitoring_hours_start;
    }
    if (dto.monitoring_hours_end !== undefined) {
      mergedCheckins.monitoring_hours_end = dto.monitoring_hours_end;
    }
    if (dto.monitoring_days !== undefined) {
      mergedCheckins.monitoring_days = dto.monitoring_days;
    }
    if (dto.flagged_keywords !== undefined) {
      mergedCheckins.flagged_keywords = dto.flagged_keywords;
    }
    if (dto.consecutive_low_threshold !== undefined) {
      mergedCheckins.consecutive_low_threshold = dto.consecutive_low_threshold;
    }
    if (dto.min_cohort_for_aggregate !== undefined) {
      mergedCheckins.min_cohort_for_aggregate = dto.min_cohort_for_aggregate;
    }
    if (dto.prerequisites_acknowledged !== undefined) {
      mergedCheckins.prerequisites_acknowledged = dto.prerequisites_acknowledged;
    }

    const mergedPastoral = { ...existingPastoral, checkins: mergedCheckins };
    const mergedSettings = { ...existingSettings, pastoral: mergedPastoral };

    await this.prisma.tenantSetting.upsert({
      where: { tenant_id: tenant.tenant_id },
      create: {
        tenant_id: tenant.tenant_id,
        settings: JSON.parse(JSON.stringify(mergedSettings)),
      },
      update: {
        settings: JSON.parse(JSON.stringify(mergedSettings)),
      },
    });

    // Return the freshly-parsed config so Zod defaults are applied
    const parsed = pastoralTenantSettingsSchema.parse(mergedPastoral);

    return { data: parsed.checkins };
  }
}
