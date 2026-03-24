import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { AcademicYearsService } from './academic-years.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  academicYear: {
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
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseYear = {
  id: YEAR_ID,
  tenant_id: TENANT_ID,
  name: '2024-2025',
  start_date: new Date('2024-09-01'),
  end_date: new Date('2025-06-30'),
  status: 'planned',
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AcademicYearsService', () => {
  let service: AcademicYearsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcademicYearsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AcademicYearsService>(AcademicYearsService);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create an academic year successfully', async () => {
      mockRlsTx.academicYear.create.mockResolvedValueOnce(baseYear);

      const result = await service.create(TENANT_ID, {
        name: '2024-2025',
        start_date: '2024-09-01',
        end_date: '2025-06-30',
        status: 'planned',
      });

      expect(mockRlsTx.academicYear.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          name: '2024-2025',
          start_date: new Date('2024-09-01'),
          end_date: new Date('2025-06-30'),
          status: 'planned',
        },
      });
      expect(result).toEqual(baseYear);
    });

    it('should throw ConflictException on duplicate name', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockRlsTx.academicYear.create.mockRejectedValueOnce(p2002);

      let caught: unknown;
      try {
        await service.create(TENANT_ID, {
          name: '2024-2025',
          start_date: '2024-09-01',
          end_date: '2025-06-30',
          status: 'planned',
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught as ConflictException).getResponse()).toMatchObject({
        code: 'DUPLICATE_NAME',
      });
    });

    it('should throw ConflictException on overlapping date range (exclusion constraint)', async () => {
      const exclusionErr = new Error('excl_academic_years_date_range violated');
      mockRlsTx.academicYear.create.mockRejectedValueOnce(exclusionErr);

      let caught: unknown;
      try {
        await service.create(TENANT_ID, {
          name: '2024-2025',
          start_date: '2024-09-01',
          end_date: '2025-06-30',
          status: 'planned',
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught as ConflictException).getResponse()).toMatchObject({
        code: 'OVERLAPPING_ACADEMIC_YEAR',
      });
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated academic years with total count', async () => {
      const years = [baseYear];
      mockPrisma.academicYear.findMany.mockResolvedValueOnce(years);
      mockPrisma.academicYear.count.mockResolvedValueOnce(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toEqual(years);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(mockPrisma.academicYear.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should filter academic years by status', async () => {
      const activeYear = { ...baseYear, status: 'active' };
      mockPrisma.academicYear.findMany.mockResolvedValueOnce([activeYear]);
      mockPrisma.academicYear.count.mockResolvedValueOnce(1);

      const result = await service.findAll(TENANT_ID, { status: 'active', page: 1, pageSize: 20 });

      expect(mockPrisma.academicYear.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: 'active' },
        }),
      );
      expect(result.data[0]!.status).toBe('active');
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should throw NotFoundException when academic year not found', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.findOne(TENANT_ID, YEAR_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
      });
    });

    it('should return academic year with periods when found', async () => {
      const yearWithPeriods = { ...baseYear, periods: [] };
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(yearWithPeriods);

      const result = await service.findOne(TENANT_ID, YEAR_ID);

      expect(result).toEqual(yearWithPeriods);
      expect(mockPrisma.academicYear.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: YEAR_ID, tenant_id: TENANT_ID },
        }),
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update an academic year name', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce({
        id: YEAR_ID,
        status: 'planned',
      });
      const updated = { ...baseYear, name: 'Updated Year' };
      mockRlsTx.academicYear.update.mockResolvedValueOnce(updated);

      const result = await service.update(TENANT_ID, YEAR_ID, { name: 'Updated Year' });

      expect(mockRlsTx.academicYear.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: YEAR_ID },
          data: { name: 'Updated Year' },
        }),
      );
      expect(result).toEqual(updated);
    });

    it('should throw BadRequestException when changing dates on active year', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce({
        id: YEAR_ID,
        status: 'active',
      });

      let caught: unknown;
      try {
        await service.update(TENANT_ID, YEAR_ID, { start_date: '2024-08-01' });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        error: expect.objectContaining({ code: 'DATES_LOCKED' }),
      });
    });

    it('should throw NotFoundException when year does not exist on update', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.update(TENANT_ID, YEAR_ID, { name: 'X' });
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
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce({ ...baseYear, status: 'planned' });
      const updated = { ...baseYear, status: 'active' };
      mockRlsTx.academicYear.update.mockResolvedValueOnce(updated);

      const result = await service.updateStatus(TENANT_ID, YEAR_ID, 'active');

      expect(mockRlsTx.academicYear.update).toHaveBeenCalledWith({
        where: { id: YEAR_ID },
        data: { status: 'active' },
      });
      expect(result).toEqual(updated);
    });

    it('should block planned -> closed status transition', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce({ ...baseYear, status: 'planned' });

      let caught: unknown;
      try {
        await service.updateStatus(TENANT_ID, YEAR_ID, 'closed');
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'INVALID_STATUS_TRANSITION',
      });
      expect(mockRlsTx.academicYear.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when year not found on status update', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.updateStatus(TENANT_ID, YEAR_ID, 'active');
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
      });
    });
  });
});
