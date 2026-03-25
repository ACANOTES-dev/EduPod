import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { SubjectsService } from './subjects.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SUBJECT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  subject: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  class: {
    count: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const mockPrisma = {
  subject: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  class: {
    count: jest.fn(),
  },
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseSubject = {
  id: SUBJECT_ID,
  tenant_id: TENANT_ID,
  name: 'Mathematics',
  code: 'MATH',
  subject_type: 'academic',
  active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SubjectsService', () => {
  let service: SubjectsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubjectsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SubjectsService>(SubjectsService);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a subject successfully', async () => {
      mockRlsTx.subject.create.mockResolvedValueOnce(baseSubject);

      const result = await service.create(TENANT_ID, {
        name: 'Mathematics',
        code: 'MATH',
        subject_type: 'academic',
        active: true,
      });

      expect(mockRlsTx.subject.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          name: 'Mathematics',
          code: 'MATH',
          subject_type: 'academic',
          active: true,
        },
      });
      expect(result).toEqual(baseSubject);
    });

    it('should throw ConflictException on duplicate subject name', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockRlsTx.subject.create.mockRejectedValueOnce(p2002);

      let caught: unknown;
      try {
        await service.create(TENANT_ID, { name: 'Mathematics', subject_type: 'academic', active: true });
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
    it('should return paginated subjects', async () => {
      const subjects = [baseSubject];
      mockRlsTx.subject.findMany.mockResolvedValueOnce(subjects);
      mockRlsTx.subject.count.mockResolvedValueOnce(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toEqual(subjects);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(mockRlsTx.subject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should filter subjects by type and active status', async () => {
      mockRlsTx.subject.findMany.mockResolvedValueOnce([baseSubject]);
      mockRlsTx.subject.count.mockResolvedValueOnce(1);

      await service.findAll(TENANT_ID, { subject_type: 'academic', active: true, page: 1, pageSize: 20 });

      expect(mockRlsTx.subject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, subject_type: 'academic', active: true },
        }),
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update a subject', async () => {
      // assertExists uses RLS tx
      mockRlsTx.subject.findFirst.mockResolvedValueOnce({ id: SUBJECT_ID });
      const updated = { ...baseSubject, name: 'Advanced Mathematics' };
      mockRlsTx.subject.update.mockResolvedValueOnce(updated);

      const result = await service.update(TENANT_ID, SUBJECT_ID, { name: 'Advanced Mathematics' });

      expect(mockRlsTx.subject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SUBJECT_ID },
          data: { name: 'Advanced Mathematics' },
        }),
      );
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when updating nonexistent subject', async () => {
      mockRlsTx.subject.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.update(TENANT_ID, SUBJECT_ID, { name: 'New Name' });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'SUBJECT_NOT_FOUND',
      });
      expect(mockRlsTx.subject.update).not.toHaveBeenCalled();
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete a subject not in use', async () => {
      // All inside RLS tx now
      mockRlsTx.subject.findFirst.mockResolvedValueOnce({ id: SUBJECT_ID });
      mockRlsTx.class.count.mockResolvedValueOnce(0);
      mockRlsTx.subject.delete.mockResolvedValueOnce(baseSubject);

      const result = await service.remove(TENANT_ID, SUBJECT_ID);

      expect(mockRlsTx.subject.delete).toHaveBeenCalledWith({ where: { id: SUBJECT_ID } });
      expect(result).toEqual(baseSubject);
    });

    it('should throw BadRequestException when deleting subject used by classes', async () => {
      mockRlsTx.subject.findFirst.mockResolvedValueOnce({ id: SUBJECT_ID });
      mockRlsTx.class.count.mockResolvedValueOnce(3);

      let caught: unknown;
      try {
        await service.remove(TENANT_ID, SUBJECT_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'SUBJECT_IN_USE',
      });
      expect(mockRlsTx.subject.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when deleting nonexistent subject', async () => {
      mockRlsTx.subject.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.remove(TENANT_ID, SUBJECT_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'SUBJECT_NOT_FOUND',
      });
    });
  });
});
