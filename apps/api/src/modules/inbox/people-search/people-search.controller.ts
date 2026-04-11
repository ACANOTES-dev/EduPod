import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { JwtPayload } from '@school/shared';
import { inboxPeopleSearchQuerySchema } from '@school/shared/inbox';
import type { InboxPeopleSearchQueryDto, InboxPeopleSearchResult } from '@school/shared/inbox';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { InboxPeopleSearchService } from './people-search.service';

@Controller('v1/inbox/people-search')
@UseGuards(AuthGuard, PermissionGuard)
export class InboxPeopleSearchController {
  constructor(private readonly peopleSearch: InboxPeopleSearchService) {}

  // GET /v1/inbox/people-search?q=...&limit=...
  @Get()
  @RequiresPermission('inbox.send')
  async search(
    @CurrentTenant() tenantContext: { tenant_id: string } | null,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(inboxPeopleSearchQuerySchema)) query: InboxPeopleSearchQueryDto,
  ): Promise<{ data: InboxPeopleSearchResult[] }> {
    if (!tenantContext) {
      throw new BadRequestException({
        code: 'TENANT_CONTEXT_MISSING',
        message: 'No tenant context — this endpoint is tenant-scoped',
      });
    }
    const data = await this.peopleSearch.search({
      tenantId: tenantContext.tenant_id,
      senderUserId: user.sub,
      query: query.q,
      limit: query.limit,
    });
    return { data };
  }
}
