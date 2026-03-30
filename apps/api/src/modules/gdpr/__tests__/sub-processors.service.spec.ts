import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { PlatformLegalService } from '../platform-legal.service';
import { SubProcessorsService } from '../sub-processors.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const REGISTER_VERSION = {
  id: 'register-id',
  version: '2026.03',
  change_summary: 'Initial register',
  published_at: new Date('2026-03-15T00:00:00Z'),
  objection_deadline: null,
  created_at: new Date('2026-03-15T00:00:00Z'),
  entries: [
    {
      id: 'entry-1',
      name: 'Vercel',
      purpose: 'Frontend hosting',
      data_categories: 'None (CDN only)',
      location: 'EU',
      transfer_mechanism: 'N/A',
      display_order: 1,
      is_planned: false,
      notes: null,
    },
  ],
};

// ─── Mock Factory ───────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    subProcessorRegisterVersion: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('SubProcessorsService', () => {
  let service: SubProcessorsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  const mockPlatformLegalService = {
    ensureSeeded: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubProcessorsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PlatformLegalService, useValue: mockPlatformLegalService },
      ],
    }).compile();

    service = module.get<SubProcessorsService>(SubProcessorsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getCurrentRegister ────────────────────────────────────────────────────

  describe('SubProcessorsService -- getCurrentRegister', () => {
    it('should return the most recent register version with entries', async () => {
      mockPrisma.subProcessorRegisterVersion.findFirst.mockResolvedValue(REGISTER_VERSION);

      const result = await service.getCurrentRegister();

      expect(result).toEqual(REGISTER_VERSION);
      expect(mockPlatformLegalService.ensureSeeded).toHaveBeenCalledTimes(1);
      expect(mockPrisma.subProcessorRegisterVersion.findFirst).toHaveBeenCalledWith({
        orderBy: [{ published_at: 'desc' }, { created_at: 'desc' }],
        include: {
          entries: { orderBy: { display_order: 'asc' } },
        },
      });
    });

    it('should throw NotFoundException when no register exists', async () => {
      mockPrisma.subProcessorRegisterVersion.findFirst.mockResolvedValue(null);

      await expect(service.getCurrentRegister()).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getHistory ────────────────────────────────────────────────────────────

  describe('SubProcessorsService -- getHistory', () => {
    it('should return all register versions ordered by published_at desc', async () => {
      const versions = [REGISTER_VERSION];
      mockPrisma.subProcessorRegisterVersion.findMany.mockResolvedValue(versions);

      const result = await service.getHistory();

      expect(result).toEqual(versions);
      expect(mockPlatformLegalService.ensureSeeded).toHaveBeenCalledTimes(1);
      expect(mockPrisma.subProcessorRegisterVersion.findMany).toHaveBeenCalledWith({
        orderBy: [{ published_at: 'desc' }, { created_at: 'desc' }],
        include: {
          entries: { orderBy: { display_order: 'asc' } },
        },
      });
    });

    it('should return empty array when no versions exist', async () => {
      mockPrisma.subProcessorRegisterVersion.findMany.mockResolvedValue([]);

      const result = await service.getHistory();

      expect(result).toEqual([]);
    });
  });
});
