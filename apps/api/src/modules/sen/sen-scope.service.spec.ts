import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { SenScopeService } from './sen-scope.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const STAFF_PROFILE_ID = 'staff-1';

describe('SenScopeService', () => {
  let service: SenScopeService;
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
      providers: [SenScopeService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<SenScopeService>(SenScopeService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getUserScope ─────────────────────────────────────────────────────────

  describe('getUserScope', () => {
    it('should return "all" scope for sen.admin permission', async () => {
      const result = await service.getUserScope(TENANT_ID, USER_ID, ['sen.admin']);

      expect(result).toEqual({ scope: 'all' });
      expect(mockPrisma.staffProfile.findFirst).not.toHaveBeenCalled();
    });

    it('should return "all" scope for sen.manage permission', async () => {
      const result = await service.getUserScope(TENANT_ID, USER_ID, ['sen.manage']);

      expect(result).toEqual({ scope: 'all' });
    });

    it('should return "class" scope with student IDs for sen.view with staff profile', async () => {
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

      const result = await service.getUserScope(TENANT_ID, USER_ID, ['sen.view']);

      expect(result.scope).toBe('class');
      expect(result.studentIds).toHaveLength(2);
      expect(result.studentIds).toContain('student-1');
      expect(result.studentIds).toContain('student-2');
    });

    it('should return "none" scope for sen.view with staff profile but no class assignments', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockPrisma.classStaff.findMany.mockResolvedValue([]);

      const result = await service.getUserScope(TENANT_ID, USER_ID, ['sen.view']);

      expect(result).toEqual({ scope: 'none' });
    });

    it('should return "none" scope for sen.view with no staff profile', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

      const result = await service.getUserScope(TENANT_ID, USER_ID, ['sen.view']);

      expect(result).toEqual({ scope: 'none' });
    });

    it('should return "none" scope for empty permissions', async () => {
      const result = await service.getUserScope(TENANT_ID, USER_ID, []);

      expect(result).toEqual({ scope: 'none' });
    });

    it('should return "none" scope for non-SEN permissions', async () => {
      const result = await service.getUserScope(TENANT_ID, USER_ID, [
        'students.view',
        'attendance.manage',
      ]);

      expect(result).toEqual({ scope: 'none' });
    });

    it('should query class enrolments with active status filter', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockPrisma.classStaff.findMany.mockResolvedValue([{ class_id: 'class-1' }]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([{ student_id: 'student-1' }]);

      await service.getUserScope(TENANT_ID, USER_ID, ['sen.view']);

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

    it('should deduplicate studentIds across multiple classes', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockPrisma.classStaff.findMany.mockResolvedValue([
        { class_id: 'class-1' },
        { class_id: 'class-2' },
      ]);
      // Same student in both classes
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { student_id: 'student-1' },
        { student_id: 'student-1' },
        { student_id: 'student-2' },
        { student_id: 'student-1' },
      ]);

      const result = await service.getUserScope(TENANT_ID, USER_ID, ['sen.view']);

      expect(result.scope).toBe('class');
      expect(result.studentIds).toHaveLength(2);
      expect(result.studentIds).toEqual(['student-1', 'student-2']);
    });

    it('should return "all" when both sen.admin and sen.view permissions exist', async () => {
      const result = await service.getUserScope(TENANT_ID, USER_ID, ['sen.view', 'sen.admin']);

      expect(result).toEqual({ scope: 'all' });
      expect(mockPrisma.staffProfile.findFirst).not.toHaveBeenCalled();
    });
  });
});
