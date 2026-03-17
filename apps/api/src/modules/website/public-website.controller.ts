import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

import { PublicWebsiteService } from './public-website.service';

@Controller('v1/public')
export class PublicWebsiteController {
  constructor(private readonly service: PublicWebsiteService) {}

  @Get('pages')
  async listPublished(
    @CurrentTenant() tenant: TenantContext,
    @Query('locale') locale: string = 'en',
  ) {
    return this.service.getPublishedPages(tenant.tenant_id, locale);
  }

  @Get('pages/:slug')
  async getBySlug(
    @CurrentTenant() tenant: TenantContext,
    @Param('slug') slug: string,
    @Query('locale') locale: string = 'en',
  ) {
    return this.service.getPageBySlug(tenant.tenant_id, slug, locale);
  }
}
