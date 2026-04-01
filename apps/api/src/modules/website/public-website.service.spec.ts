import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PublicWebsiteService } from './public-website.service';

const TENANT_ID = 'tenant-uuid-1';

const mockPrisma = {
  websitePage: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

describe('PublicWebsiteService', () => {
  let service: PublicWebsiteService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PublicWebsiteService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<PublicWebsiteService>(PublicWebsiteService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── getPublishedPages ──

  it('should return published pages for a tenant and locale', async () => {
    const pages = [
      { id: 'p1', slug: 'about', title: 'About', page_type: 'about' },
      { id: 'p2', slug: 'home', title: 'Home', page_type: 'home' },
    ];
    mockPrisma.websitePage.findMany.mockResolvedValueOnce(pages);

    const result = await service.getPublishedPages(TENANT_ID, 'en');
    expect(result).toEqual(pages);
    expect(mockPrisma.websitePage.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        locale: 'en',
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
  });

  it('should return empty array when no published pages exist', async () => {
    mockPrisma.websitePage.findMany.mockResolvedValueOnce([]);

    const result = await service.getPublishedPages(TENANT_ID, 'ar');
    expect(result).toEqual([]);
  });

  it('should filter by locale correctly', async () => {
    mockPrisma.websitePage.findMany.mockResolvedValueOnce([]);

    await service.getPublishedPages(TENANT_ID, 'ar');
    expect(mockPrisma.websitePage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ locale: 'ar' }),
      }),
    );
  });

  // ── getPageBySlug ──

  it('should return a page when found by slug', async () => {
    const page = { id: 'p1', slug: 'about-us', title: 'About Us', status: 'published' };
    mockPrisma.websitePage.findFirst.mockResolvedValueOnce(page);

    const result = await service.getPageBySlug(TENANT_ID, 'about-us', 'en');
    expect(result).toEqual(page);
    expect(mockPrisma.websitePage.findFirst).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        slug: 'about-us',
        locale: 'en',
        status: 'published',
      },
    });
  });

  it('should throw NotFoundException when page slug does not exist', async () => {
    mockPrisma.websitePage.findFirst.mockResolvedValueOnce(null);

    await expect(service.getPageBySlug(TENANT_ID, 'nonexistent', 'en')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should only return published pages by slug', async () => {
    mockPrisma.websitePage.findFirst.mockResolvedValueOnce(null);

    try {
      await service.getPageBySlug(TENANT_ID, 'draft-page', 'en');
    } catch (err) {
      console.error('[getPageBySlug]', err);
    }

    expect(mockPrisma.websitePage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'published' }),
      }),
    );
  });
});
