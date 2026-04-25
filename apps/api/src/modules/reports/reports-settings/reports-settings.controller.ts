import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  updateReportsDefaultsSchema,
  updateReportsKpiVisibilitySchema,
  type ReportsDefaultsDto,
  type ReportsSettingsResponse,
  type UpdateReportsDefaultsDto,
  type UpdateReportsKpiVisibilityDto,
} from '@school/shared/reports';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { ReportsSettingsService } from './reports-settings.service';

/**
 * `GET    /v1/reports/settings`                  — full read (defaults, KPI
 *                                                  prefs, AI feature state).
 * `PUT    /v1/reports/settings/defaults`         — upsert defaults.
 * `PUT    /v1/reports/settings/kpi-visibility`   — upsert hidden_kpi_keys.
 *
 * Every route is gated on:
 *   - `AuthGuard` — JWT
 *   - `PermissionGuard` + `@RequiresPermission('reports.settings')`
 *
 * AI flag mutations are not exposed here — clients reuse the existing
 * `PATCH /v1/ai-flags/:moduleKey` endpoint under the `ai_flag.manage`
 * permission. The response from `GET /v1/reports/settings` denormalises
 * the AI flag state so the UI can render the toggles in one round-trip.
 */
@Controller('v1/reports/settings')
@UseGuards(AuthGuard, PermissionGuard)
@RequiresPermission('reports.settings')
export class ReportsSettingsController {
  constructor(private readonly settings: ReportsSettingsService) {}

  // GET /v1/reports/settings
  @Get()
  async get(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<{ data: ReportsSettingsResponse }> {
    const data = await this.settings.getSettings(tenant.tenant_id);
    return { data };
  }

  // PUT /v1/reports/settings/defaults
  @Put('defaults')
  async updateDefaults(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateReportsDefaultsSchema))
    body: UpdateReportsDefaultsDto,
  ): Promise<{ data: ReportsDefaultsDto }> {
    const data = await this.settings.updateDefaults(tenant.tenant_id, user.sub, body);
    return { data };
  }

  // PUT /v1/reports/settings/kpi-visibility
  @Put('kpi-visibility')
  async updateKpiVisibility(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateReportsKpiVisibilitySchema))
    body: UpdateReportsKpiVisibilityDto,
  ): Promise<{ data: { hidden_kpi_keys: UpdateReportsKpiVisibilityDto['hidden_kpi_keys'] } }> {
    const data = await this.settings.updateKpiVisibility(
      tenant.tenant_id,
      user.sub,
      body.hidden_kpi_keys,
    );
    return { data };
  }
}
