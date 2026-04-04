import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, StaffProfileReadFacade, ClassesReadFacade } from '../../common/tests/mock-facades';
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
  let mockStaffProfileReadFacade: { findByUserId: jest.Mock };
  let mockClassesReadFacade: { findClassIdsByStaff: jest.Mock; findEnrolledStudentIds: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      staffProfile: { findFirst: jest.fn() },
      classStaff: { findMany: jest.fn() },
      classEnrolment: { findMany: jest.fn() },
    };

    mockStaffProfileReadFacade = {
      findByUserId: jest.fn().mockResolvedValue(null),
    };

    mockClassesReadFacade = {
      findClassIdsByStaff: jest.fn().mockResolvedValue([]),
      findEnrolledStudentIds: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        BehaviourScopeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StaffProfileReadFacade, useValue: mockStaffProfileReadFacade },
        { provide: ClassesReadFacade, useValue: mockClassesReadFacade },
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
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockClassesReadFacade.findClassIdsByStaff.mockResolvedValue(['class-1', 'class-2']);
      mockClassesReadFacade.findEnrolledStudentIds
        .mockResolvedValueOnce(['student-1', 'student-2'])
        .mockResolvedValueOnce(['student-1']); // Duplicate — should be deduplicated

      const result = await service.getUserScope(TENANT_ID, USER_ID, ['behaviour.view']);

      expect(result.scope).toBe('class');
      expect(result.classStudentIds).toHaveLength(2);
      expect(result.classStudentIds).toContain('student-1');
      expect(result.classStudentIds).toContain('student-2');
    });

    it('should return "own" scope for behaviour.view with staff profile but no class assignments', async () => {
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockClassesReadFacade.findClassIdsByStaff.mockResolvedValue([]);

      const result = await service.getUserScope(TENANT_ID, USER_ID, ['behaviour.view']);

      expect(result).toEqual({ scope: 'own' });
    });

    it('should return "own" scope for behaviour.view with no staff profile', async () => {
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue(null);

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
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockClassesReadFacade.findClassIdsByStaff.mockResolvedValue(['class-1']);
      mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue(['student-1']);

      await service.getUserScope(TENANT_ID, USER_ID, ['behaviour.view']);

      expect(mockClassesReadFacade.findEnrolledStudentIds).toHaveBeenCalledWith(TENANT_ID, 'class-1');
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
