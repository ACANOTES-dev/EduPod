import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { updateInboxSettingsSchema, updateMessagingPolicySchema } from '@school/shared/inbox';
import type { UpdateInboxSettingsDto, UpdateMessagingPolicyDto } from '@school/shared/inbox';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { InboxOutboxService } from '../common/inbox-outbox.service';

import { InboxSettingsService } from './inbox-settings.service';

@Controller('v1/inbox/settings')
@UseGuards(AuthGuard, PermissionGuard)
export class InboxSettingsController {
  constructor(
    private readonly settingsService: InboxSettingsService,
    private readonly outboxService: InboxOutboxService,
  ) {}

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

  // PUT /v1/inbox/settings/inbox
  @Put('inbox')
  @RequiresPermission('inbox.settings.write')
  async updateInboxSettings(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Body(new ZodValidationPipe(updateInboxSettingsSchema)) dto: UpdateInboxSettingsDto,
  ) {
    return this.settingsService.updateInboxSettings(tenantContext.tenant_id, dto);
  }

  // PUT /v1/inbox/settings/policy
  @Put('policy')
  @RequiresPermission('inbox.settings.write')
  async updatePolicy(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Body(new ZodValidationPipe(updateMessagingPolicySchema)) dto: UpdateMessagingPolicyDto,
  ) {
    const matrix = await this.settingsService.updatePolicyMatrix(tenantContext.tenant_id, dto);
    return { matrix };
  }

  // POST /v1/inbox/settings/policy/reset
  @Post('policy/reset')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('inbox.settings.write')
  async resetPolicy(@CurrentTenant() tenantContext: { tenant_id: string }) {
    const matrix = await this.settingsService.resetPolicyMatrix(tenantContext.tenant_id);
    return { matrix };
  }

  // POST /v1/inbox/settings/fallback/test
  //
  // Debug endpoint used by the impl 15 fallback-settings page's "Test
  // fallback now" button. Enqueues a one-shot `inbox:fallback-scan-tenant`
  // for the current tenant on the notifications queue. Gated by:
  //   1. `inbox.settings.write` — admin-tier roles only
  //   2. `INBOX_ALLOW_TEST_FALLBACK=true` env flag — off by default, so
  //      production must opt in before admins can exercise this path
  @Post('fallback/test')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequiresPermission('inbox.settings.write')
  async testFallback(@CurrentTenant() tenantContext: { tenant_id: string }) {
    if (process.env.INBOX_ALLOW_TEST_FALLBACK !== 'true') {
      throw new ForbiddenException({
        code: 'INBOX_TEST_FALLBACK_DISABLED',
        message:
          'The fallback test endpoint is disabled in this environment. Set INBOX_ALLOW_TEST_FALLBACK=true to enable it.',
      });
    }
    await this.outboxService.enqueueFallbackTestScan(tenantContext.tenant_id);
    return { enqueued: true };
  }
}
