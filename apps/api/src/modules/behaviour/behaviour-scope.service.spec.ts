import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourScopeService } from './behaviour-scope.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const STAFF_PROFILE_ID = 'staff-1';

describe('BehaviourScopeService', () => {
  let service: BehaviourScopeService;
  let mockPrisma: {
    staffProfile: { findFirst: jest.Mock };
    classStaff: { findMany: jest.Mock };
    classEnrolment: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      staffProfile: { findFirst: jest.fn() },
      classStaff: { findMany: jest.fn() },
      classEnrolment: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourScopeService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BehaviourScopeService>(BehaviourScopeService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getUserScope ─────────────────────────────────────────────────────

  describe('getUserScope', () => {
    it('should return "all" scope for behaviour.admin permission', async () => {
      const result = await service.getUserScope(TENANT_ID, USER_ID, ['behaviour.admin']);

      expect(result).toEqual({ scope: 'all' });
      // Should not query staff profile — short-circuits
      expect(mockPrisma.staffProfile.findFirst).not.toHaveBeenCalled();
    });

    it('should return "all" scope for behaviour.manage permission', async () => {
      const result = await service.getUserScope(TENANT_ID, USER_ID, ['behaviour.manage']);

      expect(result).toEqual({ scope: 'all' });
    });

    it('should return "class" scope with student IDs for behaviour.view with staff profile', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockPrisma.classStaff.findMany.mockResolvedValue([
        { class_id: 'class-1' },
        { class_id: 'class-2' },
      ]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { student_id: 'student-1' },
        { student_id: 'student-2' },
        { student_id: 'student-1' }, // Duplicate — should be deduplicated
      ]);

      const result = await service.getUserScope(TENANT_ID, USER_ID, ['behaviour.view']);

      expect(result.scope).toBe('class');
      expect(result.classStudentIds).toHaveLength(2);
      expect(result.classStudentIds).toContain('student-1');
      expect(result.classStudentIds).toContain('student-2');
    });

    it('should return "own" scope for behaviour.view with staff profile but no class assignments', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockPrisma.classStaff.findMany.mockResolvedValue([]);

      const result = await service.getUserScope(TENANT_ID, USER_ID, ['behaviour.view']);

      expect(result).toEqual({ scope: 'own' });
    });

    it('should return "own" scope for behaviour.view with no staff profile', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

      const result = await service.getUserScope(TENANT_ID, USER_ID, ['behaviour.view']);

      expect(result).toEqual({ scope: 'own' });
    });

    it('should return "own" scope for behaviour.log only permission', async () => {
      const result = await service.getUserScope(TENANT_ID, USER_ID, ['behaviour.log']);

      expect(result).toEqual({ scope: 'own' });
    });

    it('should return "own" scope for empty permissions', async () => {
      const result = await service.getUserScope(TENANT_ID, USER_ID, []);

      expect(result).toEqual({ scope: 'own' });
    });

    it('should query class enrolments with active status filter', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockPrisma.classStaff.findMany.mockResolvedValue([{ class_id: 'class-1' }]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { student_id: 'student-1' },
      ]);

      await service.getUserScope(TENANT_ID, USER_ID, ['behaviour.view']);

      expect(mockPrisma.classEnrolment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            class_id: { in: ['class-1'] },
            tenant_id: TENANT_ID,
            status: 'active',
          }),
        }),
      );
    });
  });

  // ─── buildScopeFilter ────────────────────────────────────────────────

  describe('buildScopeFilter', () => {
    it('should return reported_by_id filter for "own" scope', () => {
      const filter = service.buildScopeFilter({
        userId: USER_ID,
        scope: 'own',
      });

      expect(filter).toEqual({ reported_by_id: USER_ID });
    });

    it('should return participant student_id filter for "class" scope', () => {
      const studentIds = ['student-1', 'student-2'];
      const filter = service.buildScopeFilter({
        userId: USER_ID,
        scope: 'class',
        classStudentIds: studentIds,
      });

      expect(filter).toEqual({
        behaviour_incident_participants: {
          some: {
            student_id: { in: studentIds },
            participant_type: 'student',
          },
        },
      });
    });

    it('should return year_group filter for "year_group" scope', () => {
      const yearGroupIds = ['yg-1', 'yg-2'];
      const filter = service.buildScopeFilter({
        userId: USER_ID,
        scope: 'year_group',
        yearGroupIds,
      });

      expect(filter).toEqual({
        behaviour_incident_participants: {
          some: {
            student: { year_group_id: { in: yearGroupIds } },
            participant_type: 'student',
          },
        },
      });
    });

    it('should return empty filter for "pastoral" scope', () => {
      const filter = service.buildScopeFilter({
        userId: USER_ID,
        scope: 'pastoral',
      });

      expect(filter).toEqual({});
    });

    it('should return empty filter for "all" scope', () => {
      const filter = service.buildScopeFilter({
        userId: USER_ID,
        scope: 'all',
      });

      expect(filter).toEqual({});
    });

    it('should default to empty classStudentIds when not provided for "class" scope', () => {
      const filter = service.buildScopeFilter({
        userId: USER_ID,
        scope: 'class',
      });

      expect(filter).toEqual({
        behaviour_incident_participants: {
          some: {
            student_id: { in: [] },
            participant_type: 'student',
          },
        },
      });
    });
  });
});
