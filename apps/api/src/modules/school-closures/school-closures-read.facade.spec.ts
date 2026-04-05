import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { SchoolClosuresReadFacade } from './school-closures-read.facade';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLOSURE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Mock factory ────────────────────────────────────────────────────────────

const makeMockPrisma = () => ({
  schoolClosure: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
  },
});

describe('SchoolClosuresReadFacade', () => {
  let facade: SchoolClosuresReadFacade;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(async () => {
    mockPrisma = makeMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [SchoolClosuresReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<SchoolClosuresReadFacade>(SchoolClosuresReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // findClosuresInRange
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SchoolClosuresReadFacade — findClosuresInRange', () => {
    it('should return closures within the date range', async () => {
      const dateFrom = new Date('2026-06-01');
      const dateTo = new Date('2026-06-30');
      const mockClosures = [
        { closure_date: new Date('2026-06-15') },
        { closure_date: new Date('2026-06-20') },
      ];
      mockPrisma.schoolClosure.findMany.mockResolvedValue(mockClosures);

      const result = await facade.findClosuresInRange(TENANT_ID, dateFrom, dateTo);

      expect(result).toEqual(mockClosures);
      expect(mockPrisma.schoolClosure.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          closure_date: { gte: dateFrom, lte: dateTo },
        },
        select: { closure_date: true },
      });
    });

    it('should return empty array when no closures exist in range', async () => {
      const dateFrom = new Date('2026-07-01');
      const dateTo = new Date('2026-07-31');
      mockPrisma.schoolClosure.findMany.mockResolvedValue([]);

      const result = await facade.findClosuresInRange(TENANT_ID, dateFrom, dateTo);

      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getClosureDateSet
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SchoolClosuresReadFacade — getClosureDateSet', () => {
    it('should return a Set of YYYY-MM-DD date strings', async () => {
      const dateFrom = new Date('2026-06-01');
      const dateTo = new Date('2026-06-30');
      mockPrisma.schoolClosure.findMany.mockResolvedValue([
        { closure_date: new Date('2026-06-15T00:00:00.000Z') },
        { closure_date: new Date('2026-06-20T00:00:00.000Z') },
      ]);

      const result = await facade.getClosureDateSet(TENANT_ID, dateFrom, dateTo);

      expect(result).toBeInstanceOf(Set);
      expect(result.has('2026-06-15')).toBe(true);
      expect(result.has('2026-06-20')).toBe(true);
      expect(result.size).toBe(2);
    });

    it('should return an empty Set when no closures exist', async () => {
      const dateFrom = new Date('2026-07-01');
      const dateTo = new Date('2026-07-31');
      mockPrisma.schoolClosure.findMany.mockResolvedValue([]);

      const result = await facade.getClosureDateSet(TENANT_ID, dateFrom, dateTo);

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('should handle single closure in range', async () => {
      const dateFrom = new Date('2026-06-01');
      const dateTo = new Date('2026-06-30');
      mockPrisma.schoolClosure.findMany.mockResolvedValue([
        { closure_date: new Date('2026-06-25T00:00:00.000Z') },
      ]);

      const result = await facade.getClosureDateSet(TENANT_ID, dateFrom, dateTo);

      expect(result.size).toBe(1);
      expect(result.has('2026-06-25')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // isClosureDate
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SchoolClosuresReadFacade — isClosureDate', () => {
    it('should return true when a closure exists for the date', async () => {
      const date = new Date('2026-06-15');
      mockPrisma.schoolClosure.findFirst.mockResolvedValue({ id: CLOSURE_ID });

      const result = await facade.isClosureDate(TENANT_ID, date);

      expect(result).toBe(true);
      expect(mockPrisma.schoolClosure.findFirst).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, closure_date: date },
        select: { id: true },
      });
    });

    it('should return false when no closure exists for the date', async () => {
      const date = new Date('2026-06-15');
      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      const result = await facade.isClosureDate(TENANT_ID, date);

      expect(result).toBe(false);
    });
  });
});
