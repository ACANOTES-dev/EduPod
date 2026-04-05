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

describe('AdmissionsReadFacade — branches', () => {
  let facade: AdmissionsReadFacade;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AdmissionsReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get(AdmissionsReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findById ───────────────────────────────────────────────────────────
  describe('AdmissionsReadFacade — findById', () => {
    it('should return application when found', async () => {
      const app = { id: APP_ID, tenant_id: TENANT_ID, application_number: 'APP-001' };
      mockPrisma.application.findFirst.mockResolvedValue(app);
      const result = await facade.findById(TENANT_ID, APP_ID);
      expect(result).toEqual(app);
    });

    it('should return null when not found', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);
      const result = await facade.findById(TENANT_ID, APP_ID);
      expect(result).toBeNull();
    });
  });

  // ─── countAll ───────────────────────────────────────────────────────────
  describe('AdmissionsReadFacade — countAll', () => {
    it('should count all applications for tenant', async () => {
      mockPrisma.application.count.mockResolvedValue(42);
      const result = await facade.countAll(TENANT_ID);
      expect(result).toBe(42);
      expect(mockPrisma.application.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
    });
  });

  // ─── findNotesForApplication ────────────────────────────────────────────
  describe('AdmissionsReadFacade — findNotesForApplication', () => {
    it('should return notes sorted by created_at desc', async () => {
      const notes = [
        { id: 'n1', note: 'First note' },
        { id: 'n2', note: 'Second note' },
      ];
      mockPrisma.applicationNote.findMany.mockResolvedValue(notes);
      const result = await facade.findNotesForApplication(TENANT_ID, APP_ID);
      expect(result).toHaveLength(2);
      expect(mockPrisma.applicationNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { created_at: 'desc' } }),
      );
    });

    it('should return empty when no notes', async () => {
      mockPrisma.applicationNote.findMany.mockResolvedValue([]);
      const result = await facade.findNotesForApplication(TENANT_ID, APP_ID);
      expect(result).toEqual([]);
    });
  });

  // ─── findApplicationsByParentOrStudentName — edge cases ────────────────
  describe('AdmissionsReadFacade — findApplicationsByParentOrStudentName', () => {
    it('edge: should skip studentLastName only (no first)', async () => {
      const result = await facade.findApplicationsByParentOrStudentName(TENANT_ID, {
        studentLastName: 'Doe',
      });
      expect(result).toEqual([]);
      expect(mockPrisma.application.findMany).not.toHaveBeenCalled();
    });

    it('should combine parentIds and student name into OR clauses', async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);
      await facade.findApplicationsByParentOrStudentName(TENANT_ID, {
        parentIds: ['p1', 'p2'],
        studentFirstName: 'Jane',
        studentLastName: 'Doe',
      });
      const call = mockPrisma.application.findMany.mock.calls[0]![0] as Record<string, unknown>;
      const where = call.where as Record<string, unknown>;
      const orClauses = where.OR as unknown[];
      expect(orClauses).toHaveLength(2);
    });
  });

  // ─── countByStatus — no beforeDate / with beforeDate ───────────────────
  describe('AdmissionsReadFacade — countByStatus branches', () => {
    it('should not add updated_at filter when no beforeDate', async () => {
      mockPrisma.application.count.mockResolvedValue(3);
      await facade.countByStatus(TENANT_ID, 'submitted' as never);
      const call = mockPrisma.application.count.mock.calls[0]![0] as Record<string, unknown>;
      const where = call.where as Record<string, unknown>;
      expect(where.updated_at).toBeUndefined();
    });
  });

  // ─── countApplicationsGeneric — with/without where ─────────────────────
  describe('AdmissionsReadFacade — countApplicationsGeneric', () => {
    it('should merge where with tenant_id', async () => {
      mockPrisma.application.count.mockResolvedValue(7);
      await facade.countApplicationsGeneric(TENANT_ID, { status: 'approved' });
      expect(mockPrisma.application.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, status: 'approved' },
      });
    });
  });

  // ─── findApplicationsGeneric — partial options ─────────────────────────
  describe('AdmissionsReadFacade — findApplicationsGeneric — partial', () => {
    it('should include only select when provided alone', async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);
      await facade.findApplicationsGeneric(TENANT_ID, { select: { id: true } });
      const call = mockPrisma.application.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.select).toEqual({ id: true });
      expect(call.orderBy).toBeUndefined();
      expect(call.skip).toBeUndefined();
      expect(call.take).toBeUndefined();
    });

    it('should include only orderBy when provided alone', async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);
      await facade.findApplicationsGeneric(TENANT_ID, { orderBy: { created_at: 'asc' } });
      const call = mockPrisma.application.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.orderBy).toEqual({ created_at: 'asc' });
      expect(call.select).toBeUndefined();
    });

    it('should include skip and take when provided', async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);
      await facade.findApplicationsGeneric(TENANT_ID, { skip: 5, take: 10 });
      const call = mockPrisma.application.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.skip).toBe(5);
      expect(call.take).toBe(10);
    });

    it('should merge where clause with tenant_id', async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);
      await facade.findApplicationsGeneric(TENANT_ID, { where: { status: 'draft' } });
      const call = mockPrisma.application.findMany.mock.calls[0]![0] as Record<string, unknown>;
      const where = call.where as Record<string, unknown>;
      expect(where.tenant_id).toBe(TENANT_ID);
      expect(where.status).toBe('draft');
    });
  });

  // ─── existsOrThrow — error shape ───────────────────────────────────────
  describe('AdmissionsReadFacade — existsOrThrow — error shape', () => {
    it('should throw NotFoundException with correct code', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);
      try {
        await facade.existsOrThrow(TENANT_ID, APP_ID);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        const response = (err as NotFoundException).getResponse() as Record<string, unknown>;
        expect(response.code).toBe('APPLICATION_NOT_FOUND');
      }
    });
  });
});
