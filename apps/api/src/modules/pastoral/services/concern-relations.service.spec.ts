import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import { ConcernRelationsService } from './concern-relations.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONCERN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PRIMARY_STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID_1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const STUDENT_ID_3 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── Mock DB ───────────────────────────────────────────────────────────────

const buildMockDb = () => ({
  student: {
    findMany: jest.fn(),
  },
  pastoralConcernInvolvedStudent: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  pastoralConcern: {
    findUnique: jest.fn(),
  },
});

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('ConcernRelationsService', () => {
  let service: ConcernRelationsService;
  let mockDb: ReturnType<typeof buildMockDb>;

  beforeEach(() => {
    service = new ConcernRelationsService();
    mockDb = buildMockDb();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── extractInvolvedStudentIds ─────────────────────────────────────────────

  describe('ConcernRelationsService — extractInvolvedStudentIds', () => {
    it('should return student IDs from array', () => {
      const result = service.extractInvolvedStudentIds([
        { student_id: STUDENT_ID_1 },
        { student_id: STUDENT_ID_2 },
      ]);

      expect(result).toEqual([STUDENT_ID_1, STUDENT_ID_2]);
    });

    it('should return empty array when undefined', () => {
      const result = service.extractInvolvedStudentIds(undefined);

      expect(result).toEqual([]);
    });
  });

  // ─── assertInvolvedStudentsExist ───────────────────────────────────────────

  describe('ConcernRelationsService — assertInvolvedStudentsExist', () => {
    it('should succeed when all students exist', async () => {
      mockDb.student.findMany.mockResolvedValue([{ id: STUDENT_ID_1 }, { id: STUDENT_ID_2 }]);

      await expect(
        service.assertInvolvedStudentsExist(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          PRIMARY_STUDENT_ID,
          [STUDENT_ID_1, STUDENT_ID_2],
        ),
      ).resolves.toBeUndefined();

      expect(mockDb.student.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          id: { in: [STUDENT_ID_1, STUDENT_ID_2] },
        },
        select: { id: true },
      });
    });

    it('should throw PRIMARY_STUDENT_DUPLICATED when primary student is in involved list', async () => {
      await expect(
        service.assertInvolvedStudentsExist(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          PRIMARY_STUDENT_ID,
          [PRIMARY_STUDENT_ID, STUDENT_ID_1],
        ),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.assertInvolvedStudentsExist(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          PRIMARY_STUDENT_ID,
          [PRIMARY_STUDENT_ID],
        );
      } catch (err) {
        expect((err as BadRequestException).getResponse()).toEqual(
          expect.objectContaining({ code: 'PRIMARY_STUDENT_DUPLICATED' }),
        );
      }
    });

    it('should throw INVALID_INVOLVED_STUDENT_IDS for missing students', async () => {
      mockDb.student.findMany.mockResolvedValue([{ id: STUDENT_ID_1 }]);

      await expect(
        service.assertInvolvedStudentsExist(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          PRIMARY_STUDENT_ID,
          [STUDENT_ID_1, STUDENT_ID_2],
        ),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.assertInvolvedStudentsExist(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          PRIMARY_STUDENT_ID,
          [STUDENT_ID_1, STUDENT_ID_2],
        );
      } catch (err) {
        expect((err as BadRequestException).getResponse()).toEqual(
          expect.objectContaining({ code: 'INVALID_INVOLVED_STUDENT_IDS' }),
        );
      }
    });

    it('should do nothing for empty array', async () => {
      await expect(
        service.assertInvolvedStudentsExist(
          mockDb as unknown as PrismaService,
          TENANT_ID,
          PRIMARY_STUDENT_ID,
          [],
        ),
      ).resolves.toBeUndefined();

      expect(mockDb.student.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── syncInvolvedStudents ──────────────────────────────────────────────────

  describe('ConcernRelationsService — syncInvolvedStudents', () => {
    it('should create new links and delete removed ones', async () => {
      // Existing: STUDENT_ID_1, STUDENT_ID_2. Next: STUDENT_ID_2, STUDENT_ID_3.
      // Should create STUDENT_ID_3, delete STUDENT_ID_1.
      mockDb.pastoralConcernInvolvedStudent.findMany.mockResolvedValue([
        { student_id: STUDENT_ID_1 },
        { student_id: STUDENT_ID_2 },
      ]);
      mockDb.pastoralConcernInvolvedStudent.deleteMany.mockResolvedValue({ count: 1 });
      mockDb.pastoralConcernInvolvedStudent.createMany.mockResolvedValue({ count: 1 });

      await service.syncInvolvedStudents(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        CONCERN_ID,
        [STUDENT_ID_2, STUDENT_ID_3],
      );

      expect(mockDb.pastoralConcernInvolvedStudent.deleteMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          student_id: { in: [STUDENT_ID_1] },
        },
      });

      expect(mockDb.pastoralConcernInvolvedStudent.createMany).toHaveBeenCalledWith({
        data: [
          {
            concern_id: CONCERN_ID,
            student_id: STUDENT_ID_3,
            tenant_id: TENANT_ID,
          },
        ],
      });
    });

    it('should handle no changes', async () => {
      mockDb.pastoralConcernInvolvedStudent.findMany.mockResolvedValue([
        { student_id: STUDENT_ID_1 },
      ]);

      await service.syncInvolvedStudents(
        mockDb as unknown as PrismaService,
        TENANT_ID,
        CONCERN_ID,
        [STUDENT_ID_1],
      );

      expect(mockDb.pastoralConcernInvolvedStudent.deleteMany).not.toHaveBeenCalled();
      expect(mockDb.pastoralConcernInvolvedStudent.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── loadConcernWithRelations ──────────────────────────────────────────────

  describe('ConcernRelationsService — loadConcernWithRelations', () => {
    it('should return concern with relations', async () => {
      const concern = {
        id: CONCERN_ID,
        tenant_id: TENANT_ID,
        student_id: PRIMARY_STUDENT_ID,
        student: { id: PRIMARY_STUDENT_ID, first_name: 'John', last_name: 'Smith' },
        logged_by: { first_name: 'Jane', last_name: 'Teacher' },
        involved_students: [],
        versions: [],
      };
      mockDb.pastoralConcern.findUnique.mockResolvedValue(concern);

      const result = await service.loadConcernWithRelations(
        mockDb as unknown as PrismaService,
        CONCERN_ID,
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe(CONCERN_ID);
      expect(mockDb.pastoralConcern.findUnique).toHaveBeenCalledWith({
        where: { id: CONCERN_ID },
        include: {
          student: { select: { id: true, first_name: true, last_name: true } },
          logged_by: { select: { first_name: true, last_name: true } },
          involved_students: {
            include: {
              student: { select: { id: true, first_name: true, last_name: true } },
            },
            orderBy: { added_at: 'asc' },
          },
          versions: { orderBy: { version_number: 'asc' } },
        },
      });
    });

    it('should return null when not found', async () => {
      mockDb.pastoralConcern.findUnique.mockResolvedValue(null);

      const result = await service.loadConcernWithRelations(
        mockDb as unknown as PrismaService,
        CONCERN_ID,
      );

      expect(result).toBeNull();
    });
  });
});
