import { Controller, Get, UseGuards } from '@nestjs/common';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';

import { PrivacyNoticesService } from './privacy-notices.service';

@Controller('v1/parent-portal/privacy-notice')
@UseGuards(AuthGuard)
export class ParentPrivacyNoticeController {
  constructor(private readonly privacyNoticesService: PrivacyNoticesService) {}

  @Get()
  async getCurrent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.privacyNoticesService.getParentPortalCurrent(tenant.tenant_id, user.sub);
  }
}
