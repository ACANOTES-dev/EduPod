import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { WebsitePagesService } from './website-pages.service';

jest.mock('../../common/utils/sanitise-html', () => ({
  sanitiseHtml: jest.fn((html: string) => `sanitised:${html}`),
}));

const TENANT_ID = 'tenant-aaa-111';
const USER_ID = 'user-bbb-222';
const PAGE_ID = 'page-ccc-333';

function makePage(overrides: Record<string, unknown> = {}) {
  return {
    id: PAGE_ID,
    tenant_id: TENANT_ID,
    locale: 'en',
    page_type: 'about',
    slug: 'about-us',
    title: 'About Us',
    meta_title: null,
    meta_description: null,
    body_html: '<p>About</p>',
    status: 'draft',
    show_in_nav: false,
    nav_order: 0,
    published_at: null,
    author_user_id: USER_ID,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

const mockTx = {
  websitePage: {
    updateMany: jest.fn(),
    update: jest.fn(),
  },
};

const mockPrisma = {
  websitePage: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('WebsitePagesService', () => {
  let service: WebsitePagesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [WebsitePagesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<WebsitePagesService>(WebsitePagesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── list() ──────────────────────────────────────────────────────────

  describe('WebsitePagesService — list', () => {
    it('should return paginated pages with no filters', async () => {
      const pages = [makePage()];
      mockPrisma.websitePage.findMany.mockResolvedValue(pages);
      mockPrisma.websitePage.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result).toEqual({ data: pages, meta: { page: 1, pageSize: 20, total: 1 } });
      expect(mockPrisma.websitePage.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        skip: 0,
        take: 20,
        orderBy: { created_at: 'desc' },
      });
    });

    it('should apply status filter when provided', async () => {
      mockPrisma.websitePage.findMany.mockResolvedValue([]);
      mockPrisma.websitePage.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 10, status: 'published' });

      expect(mockPrisma.websitePage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: 'published' },
        }),
      );
    });

    it('should apply locale filter when provided', async () => {
      mockPrisma.websitePage.findMany.mockResolvedValue([]);
      mockPrisma.websitePage.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 10, locale: 'ar' });

      expect(mockPrisma.websitePage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, locale: 'ar' },
        }),
      );
    });

    it('should apply page_type filter when provided', async () => {
      mockPrisma.websitePage.findMany.mockResolvedValue([]);
      mockPrisma.websitePage.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 10, page_type: 'home' });

      expect(mockPrisma.websitePage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, page_type: 'home' },
        }),
      );
    });

    it('should apply all filters simultaneously', async () => {
      mockPrisma.websitePage.findMany.mockResolvedValue([]);
      mockPrisma.websitePage.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 2,
        pageSize: 5,
        status: 'draft',
        locale: 'en',
        page_type: 'about',
      });

      expect(mockPrisma.websitePage.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, status: 'draft', locale: 'en', page_type: 'about' },
        skip: 5,
        take: 5,
        orderBy: { created_at: 'desc' },
      });
    });

    it('should calculate skip correctly for page 3', async () => {
      mockPrisma.websitePage.findMany.mockResolvedValue([]);
      mockPrisma.websitePage.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 3, pageSize: 10 });

      expect(mockPrisma.websitePage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('edge: should not add filter keys when filter values are empty strings', async () => {
      mockPrisma.websitePage.findMany.mockResolvedValue([]);
      mockPrisma.websitePage.count.mockResolvedValue(0);

      // Empty strings are falsy, so the `if (status)` check should skip them
      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 10,
        status: '',
        locale: '',
        page_type: '',
      });

      expect(mockPrisma.websitePage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });
  });

  // ─── getById() ─────────────────────────────────────────────────────

  describe('WebsitePagesService — getById', () => {
    it('should return the page when found', async () => {
      const page = makePage();
      mockPrisma.websitePage.findFirst.mockResolvedValue(page);

      const result = await service.getById(TENANT_ID, PAGE_ID);

      expect(result).toEqual(page);
      expect(mockPrisma.websitePage.findFirst).toHaveBeenCalledWith({
        where: { id: PAGE_ID, tenant_id: TENANT_ID },
      });
    });

    it('should throw NotFoundException when page does not exist', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(null);

      await expect(service.getById(TENANT_ID, 'nonexistent-id')).rejects.toThrow(NotFoundException);
    });

    it('should include PAGE_NOT_FOUND code in error response', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(null);

      try {
        await service.getById(TENANT_ID, 'bad-id');
      } catch (err: unknown) {
        expect((err as NotFoundException).getResponse()).toMatchObject({
          code: 'PAGE_NOT_FOUND',
        });
      }
    });
  });

  // ─── create() ──────────────────────────────────────────────────────

  describe('WebsitePagesService — create', () => {
    it('should create a page with all fields provided', async () => {
      const dto = {
        locale: 'ar',
        page_type: 'about',
        slug: 'about-us',
        title: 'About Us',
        meta_title: 'About | School',
        meta_description: 'Learn about us',
        body_html: '<p>About</p>',
        show_in_nav: true,
        nav_order: 5,
      };
      const created = makePage({ ...dto, body_html: 'sanitised:<p>About</p>' });
      mockPrisma.websitePage.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, USER_ID, dto);

      expect(result).toEqual(created);
      expect(mockPrisma.websitePage.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          locale: 'ar',
          page_type: 'about',
          slug: 'about-us',
          title: 'About Us',
          meta_title: 'About | School',
          meta_description: 'Learn about us',
          body_html: 'sanitised:<p>About</p>',
          status: 'draft',
          show_in_nav: true,
          nav_order: 5,
          author_user_id: USER_ID,
        },
      });
    });

    it('should default locale to en when not provided', async () => {
      const dto = {
        page_type: 'about',
        slug: 'about-us',
        title: 'About Us',
        body_html: '<p>About</p>',
      };
      mockPrisma.websitePage.create.mockResolvedValue(makePage());

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.websitePage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ locale: 'en' }),
        }),
      );
    });

    it('should default meta_title to null when not provided', async () => {
      const dto = {
        page_type: 'about',
        slug: 'about-us',
        title: 'About Us',
        body_html: '<p>About</p>',
      };
      mockPrisma.websitePage.create.mockResolvedValue(makePage());

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.websitePage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ meta_title: null }),
        }),
      );
    });

    it('should default meta_description to null when not provided', async () => {
      const dto = {
        page_type: 'about',
        slug: 'about-us',
        title: 'About Us',
        body_html: '<p>About</p>',
      };
      mockPrisma.websitePage.create.mockResolvedValue(makePage());

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.websitePage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ meta_description: null }),
        }),
      );
    });

    it('should default show_in_nav to false when not provided', async () => {
      const dto = {
        page_type: 'about',
        slug: 'about-us',
        title: 'About Us',
        body_html: '<p>About</p>',
      };
      mockPrisma.websitePage.create.mockResolvedValue(makePage());

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.websitePage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ show_in_nav: false }),
        }),
      );
    });

    it('should default nav_order to 0 when not provided', async () => {
      const dto = {
        page_type: 'about',
        slug: 'about-us',
        title: 'About Us',
        body_html: '<p>About</p>',
      };
      mockPrisma.websitePage.create.mockResolvedValue(makePage());

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.websitePage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nav_order: 0 }),
        }),
      );
    });

    it('should sanitise body_html before saving', async () => {
      const dto = {
        page_type: 'about',
        slug: 'about-us',
        title: 'About Us',
        body_html: '<p>Test<script>alert("xss")</script></p>',
      };
      mockPrisma.websitePage.create.mockResolvedValue(makePage());

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.websitePage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            body_html: 'sanitised:<p>Test<script>alert("xss")</script></p>',
          }),
        }),
      );
    });

    it('should always set status to draft', async () => {
      const dto = {
        page_type: 'home',
        slug: 'home',
        title: 'Home',
        body_html: '<p>Home</p>',
      };
      mockPrisma.websitePage.create.mockResolvedValue(makePage());

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.websitePage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'draft' }),
        }),
      );
    });

    it('should use explicit meta_title when provided as null', async () => {
      const dto = {
        page_type: 'about',
        slug: 'about-us',
        title: 'About Us',
        meta_title: null,
        body_html: '<p>About</p>',
      };
      mockPrisma.websitePage.create.mockResolvedValue(makePage());

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.websitePage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ meta_title: null }),
        }),
      );
    });
  });

  // ─── update() ──────────────────────────────────────────────────────

  describe('WebsitePagesService — update', () => {
    it('should update only the title field', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(makePage());
      const updated = makePage({ title: 'New Title' });
      mockPrisma.websitePage.update.mockResolvedValue(updated);

      const result = await service.update(TENANT_ID, PAGE_ID, { title: 'New Title' });

      expect(result.title).toBe('New Title');
      expect(mockPrisma.websitePage.update).toHaveBeenCalledWith({
        where: { id: PAGE_ID },
        data: { title: 'New Title' },
      });
    });

    it('should update only the slug field', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(makePage());
      mockPrisma.websitePage.update.mockResolvedValue(makePage({ slug: 'new-slug' }));

      await service.update(TENANT_ID, PAGE_ID, { slug: 'new-slug' });

      expect(mockPrisma.websitePage.update).toHaveBeenCalledWith({
        where: { id: PAGE_ID },
        data: { slug: 'new-slug' },
      });
    });

    it('should update meta_title when provided', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(makePage());
      mockPrisma.websitePage.update.mockResolvedValue(makePage({ meta_title: 'New Meta' }));

      await service.update(TENANT_ID, PAGE_ID, { meta_title: 'New Meta' });

      expect(mockPrisma.websitePage.update).toHaveBeenCalledWith({
        where: { id: PAGE_ID },
        data: { meta_title: 'New Meta' },
      });
    });

    it('should update meta_description when provided', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(makePage());
      mockPrisma.websitePage.update.mockResolvedValue(makePage({ meta_description: 'Desc' }));

      await service.update(TENANT_ID, PAGE_ID, { meta_description: 'Desc' });

      expect(mockPrisma.websitePage.update).toHaveBeenCalledWith({
        where: { id: PAGE_ID },
        data: { meta_description: 'Desc' },
      });
    });

    it('should sanitise body_html when updating', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(makePage());
      mockPrisma.websitePage.update.mockResolvedValue(makePage());

      await service.update(TENANT_ID, PAGE_ID, { body_html: '<p>Updated</p>' });

      expect(mockPrisma.websitePage.update).toHaveBeenCalledWith({
        where: { id: PAGE_ID },
        data: { body_html: 'sanitised:<p>Updated</p>' },
      });
    });

    it('should update show_in_nav when provided', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(makePage());
      mockPrisma.websitePage.update.mockResolvedValue(makePage({ show_in_nav: true }));

      await service.update(TENANT_ID, PAGE_ID, { show_in_nav: true });

      expect(mockPrisma.websitePage.update).toHaveBeenCalledWith({
        where: { id: PAGE_ID },
        data: { show_in_nav: true },
      });
    });

    it('should update nav_order when provided', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(makePage());
      mockPrisma.websitePage.update.mockResolvedValue(makePage({ nav_order: 10 }));

      await service.update(TENANT_ID, PAGE_ID, { nav_order: 10 });

      expect(mockPrisma.websitePage.update).toHaveBeenCalledWith({
        where: { id: PAGE_ID },
        data: { nav_order: 10 },
      });
    });

    it('should update multiple fields at once', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(makePage());
      mockPrisma.websitePage.update.mockResolvedValue(
        makePage({ title: 'Updated', slug: 'updated', show_in_nav: true, nav_order: 3 }),
      );

      await service.update(TENANT_ID, PAGE_ID, {
        title: 'Updated',
        slug: 'updated',
        show_in_nav: true,
        nav_order: 3,
      });

      expect(mockPrisma.websitePage.update).toHaveBeenCalledWith({
        where: { id: PAGE_ID },
        data: { title: 'Updated', slug: 'updated', show_in_nav: true, nav_order: 3 },
      });
    });

    it('should throw NotFoundException when page not found for update', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, 'nonexistent', { title: 'New' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('edge: should pass empty data object when no fields provided', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(makePage());
      mockPrisma.websitePage.update.mockResolvedValue(makePage());

      await service.update(TENANT_ID, PAGE_ID, {});

      expect(mockPrisma.websitePage.update).toHaveBeenCalledWith({
        where: { id: PAGE_ID },
        data: {},
      });
    });

    it('should allow setting meta_title to null (clearing it)', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(makePage({ meta_title: 'Old Meta' }));
      mockPrisma.websitePage.update.mockResolvedValue(makePage({ meta_title: null }));

      await service.update(TENANT_ID, PAGE_ID, { meta_title: null });

      expect(mockPrisma.websitePage.update).toHaveBeenCalledWith({
        where: { id: PAGE_ID },
        data: { meta_title: null },
      });
    });

    it('should allow setting meta_description to null (clearing it)', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(
        makePage({ meta_description: 'Old Desc' }),
      );
      mockPrisma.websitePage.update.mockResolvedValue(makePage({ meta_description: null }));

      await service.update(TENANT_ID, PAGE_ID, { meta_description: null });

      expect(mockPrisma.websitePage.update).toHaveBeenCalledWith({
        where: { id: PAGE_ID },
        data: { meta_description: null },
      });
    });
  });

  // ─── publish() ─────────────────────────────────────────────────────

  describe('WebsitePagesService — publish', () => {
    it('should publish a page and set published_at', async () => {
      const page = makePage({ status: 'draft', page_type: 'about' });
      mockPrisma.websitePage.findFirst.mockResolvedValue(page);
      const publishedPage = { ...page, status: 'published', published_at: new Date() };
      mockTx.websitePage.update.mockResolvedValue(publishedPage);

      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return cb(mockTx);
        },
      );

      const result = await service.publish(TENANT_ID, PAGE_ID);

      expect(result.status).toBe('published');
      expect(mockTx.websitePage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PAGE_ID },
          data: expect.objectContaining({ status: 'published' }),
        }),
      );
      // Non-home page should NOT call updateMany
      expect(mockTx.websitePage.updateMany).not.toHaveBeenCalled();
    });

    it('should unpublish existing homepage when publishing new homepage', async () => {
      const page = makePage({ status: 'draft', page_type: 'home' });
      mockPrisma.websitePage.findFirst.mockResolvedValue(page);
      const publishedPage = { ...page, status: 'published', published_at: new Date() };
      mockTx.websitePage.updateMany.mockResolvedValue({ count: 1 });
      mockTx.websitePage.update.mockResolvedValue(publishedPage);

      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return cb(mockTx);
        },
      );

      await service.publish(TENANT_ID, PAGE_ID);

      expect(mockTx.websitePage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            page_type: 'home',
            status: 'published',
            id: { not: PAGE_ID },
          }),
          data: { status: 'unpublished' },
        }),
      );
    });

    it('should use interactive transaction for homepage enforcement', async () => {
      const page = makePage({ status: 'draft', page_type: 'home' });
      mockPrisma.websitePage.findFirst.mockResolvedValue(page);
      mockTx.websitePage.updateMany.mockResolvedValue({ count: 0 });
      mockTx.websitePage.update.mockResolvedValue({ ...page, status: 'published' });

      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return cb(mockTx);
        },
      );

      await service.publish(TENANT_ID, PAGE_ID);

      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it('edge: publishing a non-home page should not affect existing homepage', async () => {
      const page = makePage({ status: 'draft', page_type: 'about' });
      mockPrisma.websitePage.findFirst.mockResolvedValue(page);
      mockTx.websitePage.update.mockResolvedValue({ ...page, status: 'published' });

      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return cb(mockTx);
        },
      );

      await service.publish(TENANT_ID, PAGE_ID);

      expect(mockTx.websitePage.updateMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when publishing nonexistent page', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(null);

      await expect(service.publish(TENANT_ID, 'missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── unpublish() ───────────────────────────────────────────────────

  describe('WebsitePagesService — unpublish', () => {
    it('should set page status to unpublished', async () => {
      const page = makePage({ status: 'published' });
      mockPrisma.websitePage.findFirst.mockResolvedValue(page);
      const unpublished = { ...page, status: 'unpublished' };
      mockPrisma.websitePage.update.mockResolvedValue(unpublished);

      const result = await service.unpublish(TENANT_ID, PAGE_ID);

      expect(result.status).toBe('unpublished');
      expect(mockPrisma.websitePage.update).toHaveBeenCalledWith({
        where: { id: PAGE_ID },
        data: { status: 'unpublished' },
      });
    });

    it('should throw NotFoundException when page does not exist', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(null);

      await expect(service.unpublish(TENANT_ID, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('should call getById for existence check before unpublish', async () => {
      const page = makePage({ status: 'published' });
      mockPrisma.websitePage.findFirst.mockResolvedValue(page);
      mockPrisma.websitePage.update.mockResolvedValue({ ...page, status: 'unpublished' });

      await service.unpublish(TENANT_ID, PAGE_ID);

      expect(mockPrisma.websitePage.findFirst).toHaveBeenCalledWith({
        where: { id: PAGE_ID, tenant_id: TENANT_ID },
      });
    });
  });

  // ─── delete() ──────────────────────────────────────────────────────

  describe('WebsitePagesService — delete', () => {
    it('should delete draft page', async () => {
      const page = makePage({ status: 'draft' });
      mockPrisma.websitePage.findFirst.mockResolvedValue(page);
      mockPrisma.websitePage.delete.mockResolvedValue(page);

      await service.delete(TENANT_ID, PAGE_ID);

      expect(mockPrisma.websitePage.delete).toHaveBeenCalledWith({ where: { id: PAGE_ID } });
    });

    it('should delete unpublished page', async () => {
      const page = makePage({ status: 'unpublished' });
      mockPrisma.websitePage.findFirst.mockResolvedValue(page);
      mockPrisma.websitePage.delete.mockResolvedValue(page);

      await service.delete(TENANT_ID, PAGE_ID);

      expect(mockPrisma.websitePage.delete).toHaveBeenCalledWith({ where: { id: PAGE_ID } });
    });

    it('should throw when deleting published page', async () => {
      const page = makePage({ status: 'published' });
      mockPrisma.websitePage.findFirst.mockResolvedValue(page);

      await expect(service.delete(TENANT_ID, PAGE_ID)).rejects.toThrow(BadRequestException);

      try {
        await service.delete(TENANT_ID, PAGE_ID);
      } catch (err: unknown) {
        expect((err as BadRequestException).getResponse()).toMatchObject({
          code: 'CANNOT_DELETE_PUBLISHED',
        });
      }
    });

    it('should throw NotFoundException when deleting nonexistent page', async () => {
      mockPrisma.websitePage.findFirst.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getNavigation() ──────────────────────────────────────────────

  describe('WebsitePagesService — getNavigation', () => {
    it('should return published nav pages for the given locale', async () => {
      const navPages = [
        { id: 'p1', slug: 'about', title: 'About', page_type: 'about', nav_order: 1 },
        { id: 'p2', slug: 'contact', title: 'Contact', page_type: 'contact', nav_order: 2 },
      ];
      mockPrisma.websitePage.findMany.mockResolvedValue(navPages);

      const result = await service.getNavigation(TENANT_ID, 'en');

      expect(result).toEqual(navPages);
      expect(mockPrisma.websitePage.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          locale: 'en',
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
    });

    it('should return empty array when no nav pages exist', async () => {
      mockPrisma.websitePage.findMany.mockResolvedValue([]);

      const result = await service.getNavigation(TENANT_ID, 'ar');

      expect(result).toEqual([]);
    });

    it('should filter by locale for Arabic pages', async () => {
      mockPrisma.websitePage.findMany.mockResolvedValue([]);

      await service.getNavigation(TENANT_ID, 'ar');

      expect(mockPrisma.websitePage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ locale: 'ar' }),
        }),
      );
    });
  });
});
