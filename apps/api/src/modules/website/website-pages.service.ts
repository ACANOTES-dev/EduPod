import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { sanitiseHtml } from '../../common/utils/sanitise-html';

interface ListPagesFilters {
  page: number;
  pageSize: number;
  status?: string;
  locale?: string;
  page_type?: string;
}

@Injectable()
export class WebsitePagesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, filters: ListPagesFilters) {
    const { page, pageSize, status, locale, page_type } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (status) where.status = status;
    if (locale) where.locale = locale;
    if (page_type) where.page_type = page_type;

    const [pages, total] = await Promise.all([
      this.prisma.websitePage.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.websitePage.count({ where }),
    ]);

    return { data: pages, meta: { page, pageSize, total } };
  }

  async getById(tenantId: string, id: string) {
    const page = await this.prisma.websitePage.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!page) {
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: `Page with id "${id}" not found`,
      });
    }

    return page;
  }

  async create(tenantId: string, userId: string, dto: {
    locale?: string;
    page_type: string;
    slug: string;
    title: string;
    meta_title?: string | null;
    meta_description?: string | null;
    body_html: string;
    show_in_nav?: boolean;
    nav_order?: number;
  }) {
    const cleanHtml = sanitiseHtml(dto.body_html);

    return this.prisma.websitePage.create({
      data: {
        tenant_id: tenantId,
        locale: dto.locale ?? 'en',
        page_type: dto.page_type as any,
        slug: dto.slug,
        title: dto.title,
        meta_title: dto.meta_title ?? null,
        meta_description: dto.meta_description ?? null,
        body_html: cleanHtml,
        status: 'draft',
        show_in_nav: dto.show_in_nav ?? false,
        nav_order: dto.nav_order ?? 0,
        author_user_id: userId,
      },
    });
  }

  async update(tenantId: string, id: string, dto: {
    title?: string;
    slug?: string;
    meta_title?: string | null;
    meta_description?: string | null;
    body_html?: string;
    show_in_nav?: boolean;
    nav_order?: number;
  }) {
    await this.getById(tenantId, id);

    const updateData: Record<string, unknown> = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.meta_title !== undefined) updateData.meta_title = dto.meta_title;
    if (dto.meta_description !== undefined) updateData.meta_description = dto.meta_description;
    if (dto.body_html !== undefined) updateData.body_html = sanitiseHtml(dto.body_html);
    if (dto.show_in_nav !== undefined) updateData.show_in_nav = dto.show_in_nav;
    if (dto.nav_order !== undefined) updateData.nav_order = dto.nav_order;

    return this.prisma.websitePage.update({
      where: { id },
      data: updateData,
    });
  }

  async publish(tenantId: string, id: string) {
    const page = await this.getById(tenantId, id);

    return this.prisma.$transaction(async (tx) => {
      // Homepage enforcement — only one published homepage per locale
      if (page.page_type === 'home') {
        await tx.websitePage.updateMany({
          where: {
            tenant_id: tenantId,
            locale: page.locale,
            page_type: 'home',
            status: 'published',
            id: { not: id },
          },
          data: { status: 'unpublished' },
        });
      }

      return tx.websitePage.update({
        where: { id },
        data: { status: 'published', published_at: new Date() },
      });
    });
  }

  async unpublish(tenantId: string, id: string) {
    await this.getById(tenantId, id);

    return this.prisma.websitePage.update({
      where: { id },
      data: { status: 'unpublished' },
    });
  }

  async delete(tenantId: string, id: string) {
    const page = await this.getById(tenantId, id);

    if (page.status === 'published') {
      throw new BadRequestException({
        code: 'CANNOT_DELETE_PUBLISHED',
        message: 'Published pages must be unpublished before deletion',
      });
    }

    await this.prisma.websitePage.delete({ where: { id } });
  }

  async getNavigation(tenantId: string, locale: string) {
    return this.prisma.websitePage.findMany({
      where: {
        tenant_id: tenantId,
        locale,
        status: 'published',
        show_in_nav: true,
      },
      orderBy: { nav_order: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        page_type: true,
        nav_order: true,
      },
    });
  }
}
