import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import type { TenantContext } from '@school/shared';
import {
  pastoralTenantSettingsSchema,
  updateEscalationSettingsSchema,
} from '@school/shared/pastoral';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Validation Schema ──────────────────────────────────────────────────────
// updateEscalationSettingsSchema is now imported from @school/shared/pastoral

// ─── Response Types ──────────────────────────────────────────────────────────

interface EscalationSettingsResponse {
  escalation_enabled: boolean;
  escalation_urgent_timeout_minutes: number;
  escalation_critical_timeout_minutes: number;
  escalation_urgent_recipients: string[];
  escalation_critical_recipients: string[];
}

interface OldestUnacknowledged {
  concern_id: string;
  created_at: string;
  minutes_elapsed: number;
}

interface EscalationDashboardResponse {
  unacknowledged_urgent: number;
  unacknowledged_critical: number;
  oldest_unacknowledged_urgent: OldestUnacknowledged | null;
  oldest_unacknowledged_critical: OldestUnacknowledged | null;
  escalations_last_7d: number;
  escalations_last_30d: number;
}

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class PastoralAdminController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── 1. Get Escalation Settings ──────────────────────────────────────────

  @Get('pastoral/admin/escalation-settings')
  @RequiresPermission('pastoral.manage_sst')
  async getEscalationSettings(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<{ data: EscalationSettingsResponse }> {
    const raw = await this.loadPastoralRaw(tenant.tenant_id);
    const parsed = pastoralTenantSettingsSchema.parse(raw);

    return {
      data: this.buildEscalationSettingsResponse(raw, parsed),
    };
  }

  // ─── 2. Update Escalation Settings ───────────────────────────────────────

  @Patch('pastoral/admin/escalation-settings')
  @RequiresPermission('pastoral.manage_sst')
  async updateEscalationSettings(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(updateEscalationSettingsSchema))
    dto: z.infer<typeof updateEscalationSettingsSchema>,
  ): Promise<{ data: EscalationSettingsResponse }> {
    const record = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenant.tenant_id },
    });

    const existingSettings = (record?.settings as Record<string, unknown>) ?? {};
    const existingPastoral = (existingSettings.pastoral as Record<string, unknown>) ?? {};
    const existingEscalation = (existingPastoral.escalation as Record<string, unknown>) ?? {};

    // Merge escalation sub-object fields (timeout minutes)
    const mergedEscalation: Record<string, unknown> = { ...existingEscalation };
    if (dto.escalation_urgent_timeout_minutes !== undefined) {
      mergedEscalation.urgent_timeout_minutes = dto.escalation_urgent_timeout_minutes;
    }
    if (dto.escalation_critical_timeout_minutes !== undefined) {
      mergedEscalation.critical_timeout_minutes = dto.escalation_critical_timeout_minutes;
    }

    // Merge top-level pastoral fields
    const mergedPastoral: Record<string, unknown> = { ...existingPastoral };
    mergedPastoral.escalation = mergedEscalation;

    if (dto.escalation_enabled !== undefined) {
      mergedPastoral.escalation_enabled = dto.escalation_enabled;
    }
    if (dto.escalation_urgent_recipients !== undefined) {
      mergedPastoral.escalation_urgent_recipients = dto.escalation_urgent_recipients;
    }
    if (dto.escalation_critical_recipients !== undefined) {
      mergedPastoral.escalation_critical_recipients = dto.escalation_critical_recipients;
    }

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

    // Return freshly-parsed settings so Zod defaults are applied
    const parsed = pastoralTenantSettingsSchema.parse(mergedPastoral);

    return {
      data: this.buildEscalationSettingsResponse(mergedPastoral as Record<string, unknown>, parsed),
    };
  }

  // ─── 3. Escalation Dashboard ─────────────────────────────────────────────

  @Get('pastoral/admin/escalation-dashboard')
  @RequiresPermission('pastoral.view_tier2')
  async getEscalationDashboard(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<{ data: EscalationDashboardResponse }> {
    const tenantId = tenant.tenant_id;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel for performance
    const [
      unacknowledgedUrgent,
      unacknowledgedCritical,
      oldestUrgent,
      oldestCritical,
      escalations7d,
      escalations30d,
    ] = await Promise.all([
      // Count of urgent concerns where acknowledged_at IS NULL
      this.prisma.pastoralConcern.count({
        where: {
          tenant_id: tenantId,
          severity: 'urgent',
          acknowledged_at: null,
        },
      }),

      // Count of critical concerns where acknowledged_at IS NULL
      this.prisma.pastoralConcern.count({
        where: {
          tenant_id: tenantId,
          severity: 'critical',
          acknowledged_at: null,
        },
      }),

      // Oldest unacknowledged urgent concern
      this.prisma.pastoralConcern.findFirst({
        where: {
          tenant_id: tenantId,
          severity: 'urgent',
          acknowledged_at: null,
        },
        orderBy: { created_at: 'asc' },
        select: { id: true, created_at: true },
      }),

      // Oldest unacknowledged critical concern
      this.prisma.pastoralConcern.findFirst({
        where: {
          tenant_id: tenantId,
          severity: 'critical',
          acknowledged_at: null,
        },
        orderBy: { created_at: 'asc' },
        select: { id: true, created_at: true },
      }),

      // Count of concern_auto_escalated events in last 7 days
      this.prisma.pastoralEvent.count({
        where: {
          tenant_id: tenantId,
          event_type: 'concern_auto_escalated',
          created_at: { gte: sevenDaysAgo },
        },
      }),

      // Count of concern_auto_escalated events in last 30 days
      this.prisma.pastoralEvent.count({
        where: {
          tenant_id: tenantId,
          event_type: 'concern_auto_escalated',
          created_at: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    const formatOldest = (
      record: { id: string; created_at: Date } | null,
    ): OldestUnacknowledged | null => {
      if (!record) return null;
      const minutesElapsed = Math.round((now.getTime() - record.created_at.getTime()) / 60_000);
      return {
        concern_id: record.id,
        created_at: record.created_at.toISOString(),
        minutes_elapsed: minutesElapsed,
      };
    };

    return {
      data: {
        unacknowledged_urgent: unacknowledgedUrgent,
        unacknowledged_critical: unacknowledgedCritical,
        oldest_unacknowledged_urgent: formatOldest(oldestUrgent),
        oldest_unacknowledged_critical: formatOldest(oldestCritical),
        escalations_last_7d: escalations7d,
        escalations_last_30d: escalations30d,
      },
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Loads the raw pastoral JSONB sub-object from tenant settings.
   */
  private async loadPastoralRaw(tenantId: string): Promise<Record<string, unknown>> {
    const record = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    const settingsJson = (record?.settings as Record<string, unknown>) ?? {};
    return (settingsJson.pastoral as Record<string, unknown>) ?? {};
  }

  /**
   * Builds the escalation settings response from raw JSONB + parsed schema.
   *
   * The `escalation_enabled` and recipient override arrays are stored as
   * top-level keys in the pastoral JSONB (not yet in the Zod schema).
   * Timeout minutes come from the parsed `escalation` sub-object.
   */
  private buildEscalationSettingsResponse(
    raw: Record<string, unknown>,
    parsed: z.infer<typeof pastoralTenantSettingsSchema>,
  ): EscalationSettingsResponse {
    return {
      escalation_enabled:
        typeof raw.escalation_enabled === 'boolean' ? raw.escalation_enabled : true, // Default: enabled
      escalation_urgent_timeout_minutes: parsed.escalation.urgent_timeout_minutes,
      escalation_critical_timeout_minutes: parsed.escalation.critical_timeout_minutes,
      escalation_urgent_recipients: Array.isArray(raw.escalation_urgent_recipients)
        ? (raw.escalation_urgent_recipients as string[])
        : [],
      escalation_critical_recipients: Array.isArray(raw.escalation_critical_recipients)
        ? (raw.escalation_critical_recipients as string[])
        : [],
    };
  }
}
