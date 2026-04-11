import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { JwtPayload } from '@school/shared';
import { inboxSearchQuerySchema } from '@school/shared/inbox';
import type { InboxSearchQueryDto } from '@school/shared/inbox';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { InboxSearchService } from './inbox-search.service';

/**
 * InboxSearchController — user-scope search.
 *
 * The `scope` is hardcoded to `'user'` here. There is no request
 * parameter that can widen the scope — tenant-wide search is only
 * reachable via the oversight controller (which layers
 * `AdminTierOnlyGuard` on top of `inbox.oversight.read`).
 */
@Controller('v1/inbox')
@UseGuards(AuthGuard, PermissionGuard)
export class InboxSearchController {
  constructor(private readonly searchService: InboxSearchService) {}

  // GET /v1/inbox/search
  @Get('search')
  @RequiresPermission('inbox.read')
  async search(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(inboxSearchQuerySchema)) query: InboxSearchQueryDto,
  ) {
    return this.searchService.search({
      tenantId: tenantContext.tenant_id,
      userId: user.sub,
      query: query.q,
      scope: 'user',
      pagination: { page: query.page, pageSize: query.pageSize },
    });
  }
}
