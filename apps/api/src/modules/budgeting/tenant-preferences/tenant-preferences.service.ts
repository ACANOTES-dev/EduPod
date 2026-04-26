import { Injectable, Logger } from '@nestjs/common';

import {
  BUDGETING_TENANT_PREFERENCES_DEFAULTS,
  type BudgetingExportFormat,
  type BudgetingHorizonYears,
  type BudgetingKpiKey,
  type BudgetingTenantPreferences,
  type UpdateBudgetingTenantPreferencesDto,
} from '@school/shared/budgeting';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Reads / writes the per-tenant `budgeting_tenant_preferences` row.
 *
 * The row is upserted on first GET so callers always see a fully
 * populated shape — defaults come from `BUDGETING_TENANT_PREFERENCES_DEFAULTS`
 * (mirroring the schema-level defaults in impl 01's migration).
 *
 * PATCH accepts a partial of the schema; missing fields keep their
 * current value. The endpoint is gated by `budgeting.manage`.
 */
@Injectable()
export class TenantPreferencesService {
  private readonly logger = new Logger(TenantPreferencesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(tenantId: string, userId: string): Promise<BudgetingTenantPreferences> {
    const existing = await this.prisma.budgetingTenantPreferences.findUnique({
      where: { tenant_id: tenantId },
    });
    if (existing) return mapRow(existing);

    // First read — upsert defaults so subsequent calls are pure reads.
    const row = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      return tx.budgetingTenantPreferences.upsert({
        where: { tenant_id: tenantId },
        update: {},
        create: {
          tenant_id: tenantId,
          ...BUDGETING_TENANT_PREFERENCES_DEFAULTS,
        },
      });
    });
    return mapRow(row);
  }

  async update(
    tenantId: string,
    userId: string,
    dto: UpdateBudgetingTenantPreferencesDto,
  ): Promise<BudgetingTenantPreferences> {
    const updated = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      return tx.budgetingTenantPreferences.upsert({
        where: { tenant_id: tenantId },
        update: dto,
        create: {
          tenant_id: tenantId,
          ...BUDGETING_TENANT_PREFERENCES_DEFAULTS,
          ...dto,
        },
      });
    });

    this.logger.log(
      `Updated budgeting tenant preferences for tenant=${tenantId} user=${userId} ` +
        `keys=${Object.keys(dto).join(',') || '(none)'}`,
    );

    return mapRow(updated);
  }
}

interface PreferencesRow {
  default_horizon_years: number;
  default_household_share_pct: number | { toString: () => string } | null;
  default_contingency_pct: number | { toString: () => string } | null;
  default_export_format: string;
  shareable_link_max_days: number;
  hidden_kpi_keys: string[];
}

function mapRow(row: PreferencesRow): BudgetingTenantPreferences {
  return {
    default_horizon_years: row.default_horizon_years as BudgetingHorizonYears,
    default_household_share_pct: toNumber(row.default_household_share_pct),
    default_contingency_pct: toNumber(row.default_contingency_pct),
    default_export_format: row.default_export_format as BudgetingExportFormat,
    shareable_link_max_days: row.shareable_link_max_days,
    hidden_kpi_keys: row.hidden_kpi_keys as BudgetingKpiKey[],
  };
}

function toNumber(value: number | { toString: () => string } | null): number {
  if (value === null) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}
