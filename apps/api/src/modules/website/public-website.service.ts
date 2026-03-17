import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicWebsiteService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublishedPages(tenantId: string, locale: string) {
    return this.prisma.websitePage.findMany({
      where: {
        tenant_id: tenantId,
        locale,
        status: 'published',
      },
      orderBy: { nav_order: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        page_type: true,
        meta_title: true,
        meta_description: true,
        show_in_nav: true,
        nav_order: true,
      },
    });
  }

  async getPageBySlug(tenantId: string, slug: string, locale: string) {
    const page = await this.prisma.websitePage.findFirst({
      where: {
        tenant_id: tenantId,
        slug,
        locale,
        status: 'published',
      },
    });

    if (!page) {
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: `Page with slug "${slug}" not found`,
      });
    }

    return page;
  }
}
