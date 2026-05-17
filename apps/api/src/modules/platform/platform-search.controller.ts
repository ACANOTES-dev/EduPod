import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { platformGlobalSearchQuerySchema, type PlatformGlobalSearchQuery } from '@school/shared';

import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PlatformSearchService } from './platform-search.service';

@Controller('v1/admin/search')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class PlatformSearchController {
  constructor(private readonly platformSearchService: PlatformSearchService) {}

  // GET /v1/admin/search?q=...
  @Get()
  @RequiresPlatformPermission('platform.tenants.view')
  async search(
    @Query(new ZodValidationPipe(platformGlobalSearchQuerySchema))
    query: PlatformGlobalSearchQuery,
  ) {
    return this.platformSearchService.search(query.q);
  }
}
