import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { AdmissionsReadFacade } from './admissions-read.facade';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const APP_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

const mockPrisma = {
  application: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  applicationNote: {
    findMany: jest.fn(),
  },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AdmissionsReadFacade', () => {
  let facade: AdmissionsReadFacade;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AdmissionsReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get(AdmissionsReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── existsOrThrow ───────────────────────────────────────────────────────

  describe('AdmissionsReadFacade — existsOrThrow', () => {
    it('should resolve when application exists', async () => {
      mockPrisma.application.findFirst.mockResolvedValue({ id: APP_ID });
      await expect(facade.existsOrThrow(TENANT_ID, APP_ID)).resolves.toBeUndefined();
    });

    it('should throw NotFoundException when application not found', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);
      await expect(facade.existsOrThrow(TENANT_ID, APP_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findApplicationsByParentOrStudentName ───────────────────────────────

  describe('AdmissionsReadFacade — findApplicationsByParentOrStudentName', () => {
    it('should return empty when no filters match', async () => {
      const result = await facade.findApplicationsByParentOrStudentName(TENANT_ID, {});
      expect(result).toEqual([]);
      expect(mockPrisma.application.findMany).not.toHaveBeenCalled();
    });

    it('should build OR clause for parentIds only', async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);
      await facade.findApplicationsByParentOrStudentName(TENANT_ID, {
        parentIds: ['p1'],
      });
      expect(mockPrisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ submitted_by_parent_id: { in: ['p1'] } }],
          }),
        }),
      );
    });

    it('should build OR clause for student name only', async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);
      await facade.findApplicationsByParentOrStudentName(TENANT_ID, {
        studentFirstName: 'John',
        studentLastName: 'Doe',
      });
      expect(mockPrisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ student_first_name: 'John', student_last_name: 'Doe' }],
          }),
        }),
      );
    });

    it('should build OR clause for both parentIds and student name', async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);
      await facade.findApplicationsByParentOrStudentName(TENANT_ID, {
        parentIds: ['p1'],
        studentFirstName: 'John',
        studentLastName: 'Doe',
      });
      const call = mockPrisma.application.findMany.mock.calls[0]![0] as Record<string, unknown>;
      const where = call.where as Record<string, unknown>;
      const orClauses = where.OR as unknown[];
      expect(orClauses).toHaveLength(2);
    });

    it('edge: should skip empty parentIds array', async () => {
      const result = await facade.findApplicationsByParentOrStudentName(TENANT_ID, {
        parentIds: [],
      });
      expect(result).toEqual([]);
    });

    it('edge: should skip partial student name (first only)', async () => {
      const result = await facade.findApplicationsByParentOrStudentName(TENANT_ID, {
        studentFirstName: 'John',
      });
      expect(result).toEqual([]);
    });
  });

  // ─── countByStatus ───────────────────────────────────────────────────────

  describe('AdmissionsReadFacade — countByStatus', () => {
    it('should count without beforeDate', async () => {
      mockPrisma.application.count.mockResolvedValue(5);
      const result = await facade.countByStatus(TENANT_ID, 'submitted' as never);
      expect(result).toBe(5);
    });

    it('should count with beforeDate filter', async () => {
      mockPrisma.application.count.mockResolvedValue(2);
      const before = new Date('2026-01-01');
      await facade.countByStatus(TENANT_ID, 'submitted' as never, before);
      expect(mockPrisma.application.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          updated_at: { lt: before },
        }),
      });
    });
  });

  // ─── findApplicationsGeneric ─────────────────────────────────────────────

  describe('AdmissionsReadFacade — findApplicationsGeneric', () => {
    it('should pass all optional fields when provided', async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);
      await facade.findApplicationsGeneric(TENANT_ID, {
        where: { status: 'submitted' },
        select: { id: true },
        orderBy: { created_at: 'desc' },
        skip: 10,
        take: 5,
      });
      expect(mockPrisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true },
          orderBy: { created_at: 'desc' },
          skip: 10,
          take: 5,
        }),
      );
    });

    it('should not include optional fields when not provided', async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);
      await facade.findApplicationsGeneric(TENANT_ID, {});
      const call = mockPrisma.application.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.select).toBeUndefined();
      expect(call.orderBy).toBeUndefined();
      expect(call.skip).toBeUndefined();
      expect(call.take).toBeUndefined();
    });

    it('edge: should include skip=0 when explicitly provided', async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);
      await facade.findApplicationsGeneric(TENANT_ID, { skip: 0, take: 10 });
      expect(mockPrisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });
  });

  // ─── countApplicationsGeneric ────────────────────────────────────────────

  describe('AdmissionsReadFacade — countApplicationsGeneric', () => {
    it('should count with additional where clause', async () => {
      mockPrisma.application.count.mockResolvedValue(3);
      await facade.countApplicationsGeneric(TENANT_ID, { status: 'submitted' });
      expect(mockPrisma.application.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, status: 'submitted' },
      });
    });

    it('should count with no additional where clause', async () => {
      mockPrisma.application.count.mockResolvedValue(10);
      const result = await facade.countApplicationsGeneric(TENANT_ID);
      expect(result).toBe(10);
    });
  });
});
