import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';

import { InboxSettingsService } from './inbox-settings.service';

/**
 * Read-only controller for Wave 2. The mutation endpoints
 * (`PATCH /v1/inbox/settings/policy`, `PATCH /v1/inbox/settings/inbox`)
 * land in Wave 4 impl 13 and use the same service + repository pair.
 */
@Controller('v1/inbox/settings')
@UseGuards(AuthGuard, PermissionGuard)
export class InboxSettingsController {
  constructor(private readonly settingsService: InboxSettingsService) {}

  // GET /v1/inbox/settings/policy
  @Get('policy')
  @RequiresPermission('inbox.settings.read')
  async getPolicy(@CurrentTenant() tenantContext: { tenant_id: string }) {
    const matrix = await this.settingsService.getPolicyMatrix(tenantContext.tenant_id);
    return { matrix };
  }

  // GET /v1/inbox/settings/inbox
  @Get('inbox')
  @RequiresPermission('inbox.settings.read')
  async getInboxSettings(@CurrentTenant() tenantContext: { tenant_id: string }) {
    return this.settingsService.getInboxSettings(tenantContext.tenant_id);
  }
}
