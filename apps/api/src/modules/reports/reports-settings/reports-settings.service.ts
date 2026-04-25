import { Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import {
  REPORTS_AI_MODULE_KEYS,
  REPORTS_DEFAULT_EXPORT_FORMATS,
  REPORTS_SHARE_SNAPSHOT_RETENTION_DAYS,
  type ReportKpiKey,
  type ReportsAiFeatureState,
  type ReportsAiFeatureUsage,
  type ReportsAiModuleKey,
  type ReportsDefaultExportFormat,
  type ReportsDefaultsDto,
  type ReportsDefaultShareVisibility,
  type ReportsSettingsResponse,
  type UpdateReportsDefaultsDto,
} from '@school/shared/reports';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
// AiFlagsService is exported by AiFlagsModule and re-injected via DI;
// the module is already in `ReportsModule.imports`. The path-level lint
// warning is the documented exception for cross-module DI consumers.
// eslint-disable-next-line school/no-cross-module-internal-import
import { AiFlagsService } from '../../ai-flags/ai-flags.service';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_EXPORT_FORMAT = 'pdf';
const DEFAULT_SCHEDULE_TIMEZONE = 'Europe/Dublin';
const DEFAULT_SHARE_VISIBILITY = 'private';

/**
 * Backs the `Settings → Reports` admin page (impl 21).
 *
 * Glues three storage areas behind one read-modify-write surface:
 *   - `reports_tenant_settings` (export defaults, schedule timezone, share
 *     visibility) — owned by this service.
 *   - `reports_kpi_tenant_preferences` (`hidden_kpi_keys`) — owned by impl
 *     03 / impl 14, mutated here so the settings page can write through.
 *   - `tenant_ai_flags` for the three reports modules — read-only here;
 *     the existing `PATCH /v1/ai-flags/:moduleKey` endpoint is the
 *     write path. Usage rollups (last 30 days, total cost) are queried
 *     from `ai_processing_logs` via the `ai_service` column which mirrors
 *     the module key.
 *
 * Every write goes through `createRlsClient(prisma, { tenant_id })
 * .$transaction(...)` so RLS sets `app.current_tenant_id` for the duration
 * of the operation. Reads with no mutation use `prisma.$queryRaw` only via
 * the RLS middleware path; the settings service stays on Prisma's
 * type-safe model API for every interaction.
 */
@Injectable()
export class ReportsSettingsService {
  private readonly logger = new Logger(ReportsSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiFlags: AiFlagsService,
  ) {}

  // ─── GET /v1/reports/settings ─────────────────────────────────────────────

  async getSettings(tenantId: string): Promise<ReportsSettingsResponse> {
    const [defaults, kpiPreferences, aiFeatures] = await Promise.all([
      this.readDefaults(tenantId),
      this.readKpiPreferences(tenantId),
      this.readAiFeatures(tenantId),
    ]);

    return {
      defaults,
      kpi_preferences: kpiPreferences,
      ai_features: aiFeatures,
      snapshot_retention_days: REPORTS_SHARE_SNAPSHOT_RETENTION_DAYS,
    };
  }

  // ─── PUT /v1/reports/settings/defaults ────────────────────────────────────

  async updateDefaults(
    tenantId: string,
    userId: string,
    patch: UpdateReportsDefaultsDto,
  ): Promise<ReportsDefaultsDto> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    return rls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaClient;
      const updateData: Partial<ReportsDefaultsDto> & { updated_by: string } = {
        updated_by: userId,
      };
      if (patch.default_export_format !== undefined) {
        updateData.default_export_format = patch.default_export_format;
      }
      if (patch.default_schedule_timezone !== undefined) {
        updateData.default_schedule_timezone = patch.default_schedule_timezone;
      }
      if (patch.default_share_visibility !== undefined) {
        updateData.default_share_visibility = patch.default_share_visibility;
      }

      const row = await txClient.reportsTenantSettings.upsert({
        where: { tenant_id: tenantId },
        update: updateData,
        create: {
          tenant_id: tenantId,
          default_export_format: patch.default_export_format ?? DEFAULT_EXPORT_FORMAT,
          default_schedule_timezone:
            patch.default_schedule_timezone ?? DEFAULT_SCHEDULE_TIMEZONE,
          default_share_visibility:
            patch.default_share_visibility ?? DEFAULT_SHARE_VISIBILITY,
          updated_by: userId,
        },
      });

      return {
        default_export_format: normaliseExportFormat(row.default_export_format),
        default_schedule_timezone: row.default_schedule_timezone,
        default_share_visibility: row.default_share_visibility,
      };
    });
  }

  // ─── PUT /v1/reports/settings/kpi-visibility ──────────────────────────────

  async updateKpiVisibility(
    tenantId: string,
    userId: string,
    hiddenKpiKeys: ReportKpiKey[],
  ): Promise<{ hidden_kpi_keys: ReportKpiKey[] }> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    return rls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaClient;
      await txClient.reportsKpiTenantPreferences.upsert({
        where: { tenant_id: tenantId },
        update: { hidden_kpi_keys: hiddenKpiKeys, updated_by: userId },
        create: {
          tenant_id: tenantId,
          hidden_kpi_keys: hiddenKpiKeys,
          updated_by: userId,
        },
      });
      return { hidden_kpi_keys: hiddenKpiKeys };
    });
  }

  // ─── Internal readers ─────────────────────────────────────────────────────

  private async readDefaults(tenantId: string): Promise<ReportsDefaultsDto> {
    const row = await this.prisma.reportsTenantSettings.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!row) {
      // No row yet — caller hasn't visited the page. Return the model
      // defaults; the row materialises on the first write.
      return {
        default_export_format: DEFAULT_EXPORT_FORMAT,
        default_schedule_timezone: DEFAULT_SCHEDULE_TIMEZONE,
        default_share_visibility: DEFAULT_SHARE_VISIBILITY,
      };
    }
    return {
      default_export_format: normaliseExportFormat(row.default_export_format),
      default_schedule_timezone: row.default_schedule_timezone,
      default_share_visibility: row.default_share_visibility,
    };
  }

  private async readKpiPreferences(
    tenantId: string,
  ): Promise<ReportsSettingsResponse['kpi_preferences']> {
    const row = await this.prisma.reportsKpiTenantPreferences.findUnique({
      where: { tenant_id: tenantId },
      select: {
        hidden_kpi_keys: true,
        updated_at: true,
        updated_by: true,
      },
    });
    if (!row) {
      return { hidden_kpi_keys: [], updated_at: null, updated_by: null };
    }
    return {
      hidden_kpi_keys: row.hidden_kpi_keys as ReportKpiKey[],
      updated_at: row.updated_at.toISOString(),
      updated_by: row.updated_by,
    };
  }

  private async readAiFeatures(tenantId: string): Promise<ReportsAiFeatureState[]> {
    // `AiFlagsService.list` reads every row for the tenant (wellbeing +
    // reports). We filter to the three reports keys.
    const flags = await this.aiFlags.list(tenantId);
    const usageByKey = await this.readAiUsageByKey(tenantId);

    const reportsFlagsByKey = new Map<
      ReportsAiModuleKey,
      { enabled: boolean; updated_at: string; updated_by: string | null }
    >();
    for (const flag of flags) {
      if (REPORTS_AI_MODULE_KEYS.includes(flag.module_key as ReportsAiModuleKey)) {
        reportsFlagsByKey.set(flag.module_key as ReportsAiModuleKey, {
          enabled: flag.enabled,
          updated_at: flag.updated_at,
          updated_by: flag.updated_by,
        });
      }
    }

    return REPORTS_AI_MODULE_KEYS.map((moduleKey) => {
      const flag = reportsFlagsByKey.get(moduleKey);
      const usage = usageByKey.get(moduleKey) ?? { monthly_usage: 0, cost_estimate_usd: 0 };
      return {
        module_key: moduleKey,
        enabled: flag?.enabled ?? false,
        updated_at: flag?.updated_at ?? new Date(0).toISOString(),
        updated_by: flag?.updated_by ?? null,
        usage,
      };
    });
  }

  private async readAiUsageByKey(
    tenantId: string,
  ): Promise<Map<ReportsAiModuleKey, ReportsAiFeatureUsage>> {
    // Calendar-month-to-date rollup keyed by `ai_service` (which equals the
    // module key for every reports AI service — see impls 10/11/12).
    const monthStart = monthStartUtc(new Date());

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const rows = await rls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaClient;
      return txClient.aiProcessingLog.groupBy({
        by: ['ai_service'],
        where: {
          tenant_id: tenantId,
          ai_service: { in: [...REPORTS_AI_MODULE_KEYS] },
          created_at: { gte: monthStart },
        },
        _count: { _all: true },
        _sum: { cost_usd_estimate: true },
      });
    });

    const map = new Map<ReportsAiModuleKey, ReportsAiFeatureUsage>();
    for (const row of rows) {
      const moduleKey = row.ai_service as ReportsAiModuleKey;
      if (!REPORTS_AI_MODULE_KEYS.includes(moduleKey)) continue;
      const cost = row._sum.cost_usd_estimate;
      map.set(moduleKey, {
        monthly_usage: row._count._all,
        cost_estimate_usd: cost ? Number(cost) : 0,
      });
    }
    return map;
  }
}

function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * The `default_export_format` column is stored as `TEXT` so future renderers
 * can be added without a Prisma enum migration. The Zod contract enforces a
 * closed set; on read we narrow back to it. A row that drifted out of the
 * set falls back to `'pdf'` rather than 500ing — operationally safer than
 * surfacing a corrupted value.
 */
function normaliseExportFormat(value: string): ReportsDefaultExportFormat {
  return (REPORTS_DEFAULT_EXPORT_FORMATS as readonly string[]).includes(value)
    ? (value as ReportsDefaultExportFormat)
    : 'pdf';
}

// `ReportsDefaultShareVisibility` is exported for the spec layer; the runtime
// type narrowing is handled by Prisma's enum type for `default_share_visibility`.
export type { ReportsDefaultShareVisibility };
