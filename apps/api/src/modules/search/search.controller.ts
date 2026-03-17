import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { SearchService } from './search.service';

// ─── Query schema ─────────────────────────────────────────────────────────────

const searchQuerySchema = z.object({
  q: z.string().default(''),
  types: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

type SearchQuery = z.infer<typeof searchQuerySchema>;

const ALL_TYPES = ['students', 'parents', 'staff', 'households'] as const;

// ─────────────────────────────────────────────────────────────────────────────

@Controller('v1/search')
@UseGuards(AuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery,
  ) {
    const typesList: string[] = query.types
      ? query.types.split(',').map((t) => t.trim()).filter(Boolean)
      : [...ALL_TYPES];

    const data = await this.searchService.search(
      tenantContext.tenant_id,
      query.q,
      typesList,
      query.page,
      query.pageSize,
    );

    return { data };
  }
}
