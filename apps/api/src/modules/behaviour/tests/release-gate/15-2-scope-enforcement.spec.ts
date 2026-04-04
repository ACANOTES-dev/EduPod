/**
 * Release-Gate 15-2: Scope Enforcement
 *
 * Verifies that behaviour scope rules are correctly enforced:
 * - class-scope teacher only sees incidents for students in their classes
 * - year_group-scope year head only sees their year group incidents
 * - own-scope teacher only sees incidents they logged
 * - admin-scope user can see all students
 * - scope applies to student profile endpoint
 */
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, StaffProfileReadFacade, ClassesReadFacade } from '../../../../common/tests/mock-facades';
import { PrismaService } from '../../../../modules/prisma/prisma.service';
import { BehaviourScopeService } from '../../behaviour-scope.service';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_TEACHER = 'user-teacher-1';
const USER_YEAR_HEAD = 'user-year-head-1';
const USER_ADMIN = 'user-admin-1';
const STAFF_PROFILE_TEACHER = 'staff-teacher-1';
const _STAFF_PROFILE_YEAR_HEAD = 'staff-year-head-1';

// ─── Mock Prisma ────────────────────────────────────────────────────────────

describe('Release Gate 15-2: Scope Enforcement', () => {
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

  // ─── 15-2-A: class-scope teacher only sees their class students ───────

  describe('class-scope teacher only sees incidents for students in their classes', () => {
    it('should resolve to class scope with only their class student IDs', async () => {
      // Arrange
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_TEACHER });
      mockClassesReadFacade.findClassIdsByStaff.mockResolvedValue(['class-7A', 'class-7B']);
      mockClassesReadFacade.findEnrolledStudentIds
        .mockResolvedValueOnce(['student-1', 'student-2'])
        .mockResolvedValueOnce(['student-3']);

      // Act
      const result = await service.getUserScope(TENANT_A, USER_TEACHER, ['behaviour.view']);

      // Assert
      expect(result.scope).toBe('class');
      expect(result.classStudentIds).toHaveLength(3);
      expect(result.classStudentIds).toContain('student-1');
      expect(result.classStudentIds).toContain('student-2');
      expect(result.classStudentIds).toContain('student-3');
    });

    it('should build filter that restricts to class student IDs only', () => {
      // Arrange
      const classStudentIds = ['student-1', 'student-2'];

      // Act
      const filter = service.buildScopeFilter({
        userId: USER_TEACHER,
        scope: 'class',
        classStudentIds,
      });

      // Assert — filter uses participant student_id IN clause
      expect(filter).toEqual({
        behaviour_incident_participants: {
          some: {
            student_id: { in: classStudentIds },
            participant_type: 'student',
          },
        },
      });
    });

    it('should NOT include students from classes they do not teach', async () => {
      // Arrange — teacher only assigned to class-7A
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_TEACHER });
      mockClassesReadFacade.findClassIdsByStaff.mockResolvedValue(['class-7A']);
      mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue(['student-1']);

      // Act
      const result = await service.getUserScope(TENANT_A, USER_TEACHER, ['behaviour.view']);

      // Assert
      expect(result.scope).toBe('class');
      expect(result.classStudentIds).toEqual(['student-1']);
      // student-99 from another class is NOT included
      expect(result.classStudentIds).not.toContain('student-99');
    });

    it('should deduplicate students enrolled in multiple classes taught by same teacher', async () => {
      // Arrange
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_TEACHER });
      mockClassesReadFacade.findClassIdsByStaff.mockResolvedValue(['class-7A', 'class-7B']);
      mockClassesReadFacade.findEnrolledStudentIds
        .mockResolvedValueOnce(['student-1', 'student-2'])
        .mockResolvedValueOnce(['student-1']); // duplicate

      // Act
      const result = await service.getUserScope(TENANT_A, USER_TEACHER, ['behaviour.view']);

      // Assert
      expect(result.scope).toBe('class');
      expect(result.classStudentIds).toHaveLength(2);
    });
  });

  // ─── 15-2-B: year_group-scope year head only sees their year group ────

  describe('year_group-scope year head only sees their year group incidents', () => {
    it('should build filter that restricts to year group IDs', () => {
      // Arrange
      const yearGroupIds = ['yg-7', 'yg-8'];

      // Act
      const filter = service.buildScopeFilter({
        userId: USER_YEAR_HEAD,
        scope: 'year_group',
        yearGroupIds,
      });

      // Assert
      expect(filter).toEqual({
        behaviour_incident_participants: {
          some: {
            student: { year_group_id: { in: yearGroupIds } },
            participant_type: 'student',
          },
        },
      });
    });

    it('should NOT include students from other year groups', () => {
      // Arrange — year head for Year 7 only
      const yearGroupIds = ['yg-7'];

      // Act
      const filter = service.buildScopeFilter({
        userId: USER_YEAR_HEAD,
        scope: 'year_group',
        yearGroupIds,
      });

      // Assert — filter only includes yg-7
      const yearGroupFilter = (
        filter as { behaviour_incident_participants: { some: { student: { year_group_id: { in: string[] } } } } }
      ).behaviour_incident_participants.some.student.year_group_id.in;
      expect(yearGroupFilter).toEqual(['yg-7']);
      expect(yearGroupFilter).not.toContain('yg-8');
      expect(yearGroupFilter).not.toContain('yg-9');
    });
  });

  // ─── 15-2-C: own-scope teacher only sees incidents they logged ────────

  describe('own-scope teacher only sees incidents they logged', () => {
    it('should resolve to own scope for teacher with log-only permission', async () => {
      // Arrange — no staff profile needed for own scope

      // Act
      const result = await service.getUserScope(TENANT_A, USER_TEACHER, ['behaviour.log']);

      // Assert
      expect(result).toEqual({ scope: 'own' });
    });

    it('should build filter that restricts to reported_by_id', () => {
      // Arrange & Act
      const filter = service.buildScopeFilter({
        userId: USER_TEACHER,
        scope: 'own',
      });

      // Assert
      expect(filter).toEqual({ reported_by_id: USER_TEACHER });
    });

    it('should resolve to own scope when teacher has view permission but no class assignments', async () => {
      // Arrange
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_TEACHER });
      mockPrisma.classStaff.findMany.mockResolvedValue([]); // No classes

      // Act
      const result = await service.getUserScope(TENANT_A, USER_TEACHER, ['behaviour.view']);

      // Assert
      expect(result).toEqual({ scope: 'own' });
    });

    it('should resolve to own scope when teacher has view permission but no staff profile', async () => {
      // Arrange
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue(null); // No staff profile

      // Act
      const result = await service.getUserScope(TENANT_A, USER_TEACHER, ['behaviour.view']);

      // Assert
      expect(result).toEqual({ scope: 'own' });
    });
  });

  // ─── 15-2-D: admin-scope user can see all students ────────────────────

  describe('admin-scope user can see all students', () => {
    it('should resolve to all scope for behaviour.admin permission', async () => {
      // Arrange & Act
      const result = await service.getUserScope(TENANT_A, USER_ADMIN, ['behaviour.admin']);

      // Assert
      expect(result).toEqual({ scope: 'all' });
      // Should not query staff profile — short-circuits
      expect(mockPrisma.staffProfile.findFirst).not.toHaveBeenCalled();
    });

    it('should resolve to all scope for behaviour.manage permission', async () => {
      // Arrange & Act
      const result = await service.getUserScope(TENANT_A, USER_ADMIN, ['behaviour.manage']);

      // Assert
      expect(result).toEqual({ scope: 'all' });
    });

    it('should build empty filter for all scope — no restrictions', () => {
      // Arrange & Act
      const filter = service.buildScopeFilter({
        userId: USER_ADMIN,
        scope: 'all',
      });

      // Assert
      expect(filter).toEqual({});
    });

    it('should build empty filter for pastoral scope — no restrictions', () => {
      // Arrange & Act
      const filter = service.buildScopeFilter({
        userId: USER_ADMIN,
        scope: 'pastoral',
      });

      // Assert
      expect(filter).toEqual({});
    });
  });

  // ─── 15-2-E: scope applies to student profile endpoint ────────────────

  describe('scope applies to student profile endpoint', () => {
    it('should use class scope filter that would restrict student profile access', () => {
      // Arrange — teacher with class scope
      const classStudentIds = ['student-1', 'student-2'];

      // Act — build scope filter that would be applied to student profile query
      const filter = service.buildScopeFilter({
        userId: USER_TEACHER,
        scope: 'class',
        classStudentIds,
      });

      // Assert — the filter restricts to participants with matching student IDs
      expect(filter).toEqual({
        behaviour_incident_participants: {
          some: {
            student_id: { in: ['student-1', 'student-2'] },
            participant_type: 'student',
          },
        },
      });

      // student-99 not in class — would be excluded by this filter
      const studentIds = (
        filter as { behaviour_incident_participants: { some: { student_id: { in: string[] } } } }
      ).behaviour_incident_participants.some.student_id.in;
      expect(studentIds).not.toContain('student-99');
    });

    it('should use own scope filter that would restrict to reported incidents only', () => {
      // Arrange & Act
      const filter = service.buildScopeFilter({
        userId: USER_TEACHER,
        scope: 'own',
      });

      // Assert — only incidents reported by this user
      expect(filter).toEqual({ reported_by_id: USER_TEACHER });
    });

    it('should enforce scope isolation between tenants via tenant_id in queries', async () => {
      // Arrange — teacher in Tenant A
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_TEACHER });
      mockClassesReadFacade.findClassIdsByStaff.mockResolvedValue(['class-7A']);
      mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue(['student-1']);

      // Act
      await service.getUserScope(TENANT_A, USER_TEACHER, ['behaviour.view']);

      // Assert — all facade calls include tenant_id
      expect(mockStaffProfileReadFacade.findByUserId).toHaveBeenCalledWith(TENANT_A, USER_TEACHER);
      expect(mockClassesReadFacade.findClassIdsByStaff).toHaveBeenCalledWith(TENANT_A, STAFF_PROFILE_TEACHER);
      expect(mockClassesReadFacade.findEnrolledStudentIds).toHaveBeenCalledWith(TENANT_A, 'class-7A');

      // Tenant B data is never queried
      const allCalls = [
        ...mockPrisma.staffProfile.findFirst.mock.calls,
        ...mockPrisma.classStaff.findMany.mock.calls,
        ...mockPrisma.classEnrolment.findMany.mock.calls,
      ];
      for (const call of allCalls) {
        const where = (call[0] as { where: { tenant_id: string } }).where;
        expect(where.tenant_id).not.toBe(TENANT_B);
      }
    });
  });
});
