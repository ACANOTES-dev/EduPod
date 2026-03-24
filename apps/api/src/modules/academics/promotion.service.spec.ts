import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PromotionService } from './promotion.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACADEMIC_YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const YEAR_GROUP_ID_1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const YEAR_GROUP_ID_2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID_1 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const STUDENT_ID_2 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const STUDENT_ID_3 = '11111111-1111-1111-1111-111111111111';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  student: {
    update: jest.fn(),
  },
  classEnrolment: {
    updateMany: jest.fn(),
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
  yearGroup: {
    findMany: jest.fn(),
  },
  student: {
    findMany: jest.fn(),
  },
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const academicYear = { id: ACADEMIC_YEAR_ID, name: '2024-2025' };

const yearGroupWithNext = {
  id: YEAR_GROUP_ID_1,
  tenant_id: TENANT_ID,
  name: 'Year 1',
  display_order: 1,
  next_year_group_id: YEAR_GROUP_ID_2,
  next_year_group: { id: YEAR_GROUP_ID_2, name: 'Year 2' },
};

const finalYearGroup = {
  id: YEAR_GROUP_ID_2,
  tenant_id: TENANT_ID,
  name: 'Year 2',
  display_order: 2,
  next_year_group_id: null,
  next_year_group: null,
};

function makeStudent(id: string, yearGroupId: string | null) {
  return {
    id,
    first_name: 'Test',
    last_name: 'Student',
    status: 'active',
    year_group_id: yearGroupId,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PromotionService', () => {
  let service: PromotionService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromotionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PromotionService>(PromotionService);
  });

  // ─── preview ──────────────────────────────────────────────────────────────

  describe('preview', () => {
    it('should throw NotFoundException if academic year not found', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.preview(TENANT_ID, ACADEMIC_YEAR_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
      });
    });

    it('should return preview with students grouped by year group', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(academicYear);
      mockPrisma.yearGroup.findMany.mockResolvedValueOnce([yearGroupWithNext, finalYearGroup]);
      mockPrisma.student.findMany.mockResolvedValueOnce([
        makeStudent(STUDENT_ID_1, YEAR_GROUP_ID_1),
        makeStudent(STUDENT_ID_2, YEAR_GROUP_ID_2),
      ]);

      const result = await service.preview(TENANT_ID, ACADEMIC_YEAR_ID);

      expect(result.academic_year).toEqual({ id: ACADEMIC_YEAR_ID, name: '2024-2025' });
      expect(result.year_groups).toHaveLength(2);
    });

    it('should propose promote for students with a next year group', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(academicYear);
      mockPrisma.yearGroup.findMany.mockResolvedValueOnce([yearGroupWithNext, finalYearGroup]);
      mockPrisma.student.findMany.mockResolvedValueOnce([makeStudent(STUDENT_ID_1, YEAR_GROUP_ID_1)]);

      const result = await service.preview(TENANT_ID, ACADEMIC_YEAR_ID);

      const group = result.year_groups.find((g) => g.year_group_id === YEAR_GROUP_ID_1);
      expect(group).toBeDefined();
      expect(group!.students[0]!.proposed_action).toBe('promote');
      expect(group!.students[0]!.proposed_year_group_id).toBe(YEAR_GROUP_ID_2);
    });

    it('should propose graduate for students in the final year group (no next)', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(academicYear);
      mockPrisma.yearGroup.findMany.mockResolvedValueOnce([yearGroupWithNext, finalYearGroup]);
      mockPrisma.student.findMany.mockResolvedValueOnce([makeStudent(STUDENT_ID_2, YEAR_GROUP_ID_2)]);

      const result = await service.preview(TENANT_ID, ACADEMIC_YEAR_ID);

      const group = result.year_groups.find((g) => g.year_group_id === YEAR_GROUP_ID_2);
      expect(group).toBeDefined();
      expect(group!.students[0]!.proposed_action).toBe('graduate');
      expect(group!.students[0]!.proposed_year_group_id).toBeNull();
    });

    it('should propose hold_back for students without a year group', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(academicYear);
      mockPrisma.yearGroup.findMany.mockResolvedValueOnce([yearGroupWithNext, finalYearGroup]);
      mockPrisma.student.findMany.mockResolvedValueOnce([makeStudent(STUDENT_ID_3, null)]);

      const result = await service.preview(TENANT_ID, ACADEMIC_YEAR_ID);

      const group = result.year_groups.find((g) => g.year_group_id === null);
      expect(group).toBeDefined();
      expect(group!.students[0]!.proposed_action).toBe('hold_back');
    });
  });

  // ─── commit ───────────────────────────────────────────────────────────────

  describe('commit', () => {
    it('should throw NotFoundException if academic year not found on commit', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.commit(TENANT_ID, {
          academic_year_id: ACADEMIC_YEAR_ID,
          actions: [
            {
              student_id: STUDENT_ID_1,
              action: 'promote',
              target_year_group_id: YEAR_GROUP_ID_2,
            },
          ],
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
      });
    });

    it('should count promoted students correctly in commit', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce({ id: ACADEMIC_YEAR_ID });
      mockRlsTx.student.update.mockResolvedValue(undefined);
      mockRlsTx.classEnrolment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.commit(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
        actions: [
          { student_id: STUDENT_ID_1, action: 'promote', target_year_group_id: YEAR_GROUP_ID_2 },
          { student_id: STUDENT_ID_2, action: 'promote', target_year_group_id: YEAR_GROUP_ID_2 },
        ],
      });

      expect(result.promoted).toBe(2);
      expect(result.graduated).toBe(0);
      expect(result.held_back).toBe(0);
      expect(result.withdrawn).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should count graduated students correctly in commit', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce({ id: ACADEMIC_YEAR_ID });
      mockRlsTx.student.update.mockResolvedValue(undefined);
      mockRlsTx.classEnrolment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.commit(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
        actions: [
          { student_id: STUDENT_ID_1, action: 'graduate' },
          { student_id: STUDENT_ID_2, action: 'graduate' },
        ],
      });

      expect(result.graduated).toBe(2);
      expect(result.promoted).toBe(0);
    });

    it('should drop active enrolments on promotion', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValueOnce({ id: ACADEMIC_YEAR_ID });
      mockRlsTx.student.update.mockResolvedValue(undefined);
      mockRlsTx.classEnrolment.updateMany.mockResolvedValue({ count: 1 });

      await service.commit(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
        actions: [
          { student_id: STUDENT_ID_1, action: 'promote', target_year_group_id: YEAR_GROUP_ID_2 },
        ],
      });

      expect(mockRlsTx.classEnrolment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID_1,
            tenant_id: TENANT_ID,
            status: 'active',
          }),
          data: expect.objectContaining({
            status: 'dropped',
          }),
        }),
      );
    });
  });
});
