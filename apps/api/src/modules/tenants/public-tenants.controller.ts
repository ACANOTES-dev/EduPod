import { Controller, Get, Param } from '@nestjs/common';

import { PublicTenantsService } from './public-tenants.service';

@Controller('v1/public/tenants')
export class PublicTenantsController {
  constructor(private readonly publicTenantsService: PublicTenantsService) {}

  // GET /v1/public/tenants/by-slug/:slug
  @Get('by-slug/:slug')
  async getBySlug(@Param('slug') slug: string) {
    return this.publicTenantsService.findBySlug(slug);
  }
}
