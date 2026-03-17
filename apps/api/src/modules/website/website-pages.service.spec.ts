import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { WebsitePagesService } from './website-pages.service';
import { PrismaService } from '../prisma/prisma.service';

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
      providers: [
        WebsitePagesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<WebsitePagesService>(WebsitePagesService);
  });

  // ─── publish() ─────────────────────────────────────────────────────

  describe('publish()', () => {
    it('should publish a page and set published_at', async () => {
      const page = makePage({ status: 'draft', page_type: 'about' });
      mockPrisma.websitePage.findFirst.mockResolvedValue(page);
      const publishedPage = { ...page, status: 'published', published_at: new Date() };
      mockTx.websitePage.update.mockResolvedValue(publishedPage);

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
        return cb(mockTx);
      });

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

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
        return cb(mockTx);
      });

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

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
        return cb(mockTx);
      });

      await service.publish(TENANT_ID, PAGE_ID);

      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it('edge: publishing a non-home page should not affect existing homepage', async () => {
      const page = makePage({ status: 'draft', page_type: 'about' });
      mockPrisma.websitePage.findFirst.mockResolvedValue(page);
      mockTx.websitePage.update.mockResolvedValue({ ...page, status: 'published' });

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
        return cb(mockTx);
      });

      await service.publish(TENANT_ID, PAGE_ID);

      expect(mockTx.websitePage.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── delete() ──────────────────────────────────────────────────────

  describe('delete()', () => {
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
      } catch (err: any) {
        expect(err.getResponse()).toMatchObject({ code: 'CANNOT_DELETE_PUBLISHED' });
      }
    });
  });
});
