import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { AcademicPeriodsService } from './academic-periods.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PERIOD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  academicPeriod: {
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const mockPrisma = {
  academicYear: {
    findFirst: jest.fn(),
  },
  academicPeriod: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseAcademicYear = {
  id: YEAR_ID,
  tenant_id: TENANT_ID,
  name: '2024-2025',
  start_date: new Date('2024-09-01'),
  end_date: new Date('2025-06-30'),
  status: 'planned',
};

const basePeriod = {
  id: PERIOD_ID,
  tenant_id: TENANT_ID,
  academic_year_id: YEAR_ID,
  name: 'Term 1',
  period_type: 'term',
  start_date: new Date('2024-09-01'),
  end_date: new Date('2024-12-20'),
  status: 'planned',
  created_at: new Date(),
  updated_at: new Date(),
};

const createDto = {
  name: 'Term 1',
  period_type: 'term' as const,
  start_date: '2024-09-01',
  end_date: '2024-12-20',
  status: 'planned' as const,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AcademicPeriodsService', () => {
  let service: AcademicPeriodsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcademicPeriodsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AcademicPeriodsService>(AcademicPeriodsService);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create an academic period within valid date range', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(baseAcademicYear);
      mockRlsTx.academicPeriod.create.mockResolvedValueOnce(basePeriod);

      const result = await service.create(TENANT_ID, YEAR_ID, createDto);

      expect(mockRlsTx.academicPeriod.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          academic_year_id: YEAR_ID,
          name: 'Term 1',
          period_type: 'term',
          start_date: new Date('2024-09-01'),
          end_date: new Date('2024-12-20'),
          status: 'planned',
        },
      });
      expect(result).toEqual(basePeriod);
    });

    it('should throw NotFoundException if academic year does not exist', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.create(TENANT_ID, YEAR_ID, createDto);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
      });
      expect(mockRlsTx.academicPeriod.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if period dates are outside year range', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(baseAcademicYear);

      let caught: unknown;
      try {
        // Period start before year start
        await service.create(TENANT_ID, YEAR_ID, {
          ...createDto,
          start_date: '2024-08-01',
          end_date: '2024-12-20',
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'PERIOD_OUTSIDE_YEAR_RANGE',
      });
    });

    it('should throw BadRequestException if start_date >= end_date', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(baseAcademicYear);

      let caught: unknown;
      try {
        await service.create(TENANT_ID, YEAR_ID, {
          ...createDto,
          start_date: '2024-12-01',
          end_date: '2024-11-01',
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'INVALID_DATE_RANGE',
      });
    });

    it('should throw ConflictException on duplicate period name', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(baseAcademicYear);
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockRlsTx.academicPeriod.create.mockRejectedValueOnce(p2002);

      let caught: unknown;
      try {
        await service.create(TENANT_ID, YEAR_ID, createDto);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught as ConflictException).getResponse()).toMatchObject({
        code: 'DUPLICATE_NAME',
      });
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return all periods for a tenant', async () => {
      const periods = [{ ...basePeriod, academic_year: { name: '2024-2025' } }];
      mockPrisma.academicPeriod.findMany.mockResolvedValueOnce(periods);

      const result = await service.findAll(TENANT_ID);

      expect(result.data).toEqual(periods);
      expect(result.meta).toMatchObject({ page: 1 });
      expect(mockPrisma.academicPeriod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });
  });

  // ─── findAllForYear ───────────────────────────────────────────────────────

  describe('findAllForYear', () => {
    it('should return periods for a specific academic year', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce({ id: YEAR_ID });
      mockPrisma.academicPeriod.findMany.mockResolvedValueOnce([basePeriod]);

      const result = await service.findAllForYear(TENANT_ID, YEAR_ID);

      expect(result).toEqual([basePeriod]);
      expect(mockPrisma.academicPeriod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { academic_year_id: YEAR_ID, tenant_id: TENANT_ID },
        }),
      );
    });

    it('should throw NotFoundException if year does not exist in findAllForYear', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.findAllForYear(TENANT_ID, YEAR_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
      });
    });
  });

  // ─── updateStatus ─────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('should allow planned -> active status transition', async () => {
      mockPrisma.academicPeriod.findFirst.mockResolvedValueOnce({ ...basePeriod, status: 'planned' });
      const updated = { ...basePeriod, status: 'active' };
      mockRlsTx.academicPeriod.update.mockResolvedValueOnce(updated);

      const result = await service.updateStatus(TENANT_ID, PERIOD_ID, 'active');

      expect(mockRlsTx.academicPeriod.update).toHaveBeenCalledWith({
        where: { id: PERIOD_ID },
        data: { status: 'active' },
      });
      expect(result).toEqual(updated);
    });

    it('should block invalid status transitions (e.g. closed -> active)', async () => {
      mockPrisma.academicPeriod.findFirst.mockResolvedValueOnce({ ...basePeriod, status: 'closed' });

      let caught: unknown;
      try {
        await service.updateStatus(TENANT_ID, PERIOD_ID, 'active');
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'INVALID_STATUS_TRANSITION',
      });
      expect(mockRlsTx.academicPeriod.update).not.toHaveBeenCalled();
    });
  });
});
