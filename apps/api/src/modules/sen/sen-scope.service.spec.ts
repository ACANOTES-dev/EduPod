import { Test, TestingModule } from '@nestjs/testing';

import {
  ClassesReadFacade,
  MOCK_FACADE_PROVIDERS,
  StaffProfileReadFacade,
} from '../../common/tests/mock-facades';

import { SenScopeService } from './sen-scope.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const STAFF_PROFILE_ID = 'staff-1';

describe('SenScopeService', () => {
  let service: SenScopeService;

  const mockStaffProfileReadFacade = {
    findByUserId: jest.fn(),
  };

  const mockClassesReadFacade = {
    findClassIdsByStaff: jest.fn(),
    findEnrolledStudentIds: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        SenScopeService,
        { provide: StaffProfileReadFacade, useValue: mockStaffProfileReadFacade },
        { provide: ClassesReadFacade, useValue: mockClassesReadFacade },
      ],
    }).compile();

    service = module.get<SenScopeService>(SenScopeService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getUserScope ─────────────────────────────────────────────────────────

  describe('getUserScope', () => {
    it('should return "all" scope for sen.admin permission', async () => {
      const result = await service.getUserScope(TENANT_ID, USER_ID, ['sen.admin']);

      expect(result).toEqual({ scope: 'all' });
      expect(mockStaffProfileReadFacade.findByUserId).not.toHaveBeenCalled();
    });

    it('should return "all" scope for sen.manage permission', async () => {
      const result = await service.getUserScope(TENANT_ID, USER_ID, ['sen.manage']);

      expect(result).toEqual({ scope: 'all' });
    });

    it('should return "class" scope with student IDs for sen.view with staff profile', async () => {
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockClassesReadFacade.findClassIdsByStaff.mockResolvedValue(['class-1', 'class-2']);
      mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue([
        'student-1',
        'student-2',
      ]);

      const result = await service.getUserScope(TENANT_ID, USER_ID, ['sen.view']);

      expect(result.scope).toBe('class');
      expect(result.studentIds).toHaveLength(2);
      expect(result.studentIds).toContain('student-1');
      expect(result.studentIds).toContain('student-2');
    });

    it('should return "none" scope for sen.view with staff profile but no class assignments', async () => {
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockClassesReadFacade.findClassIdsByStaff.mockResolvedValue([]);

      const result = await service.getUserScope(TENANT_ID, USER_ID, ['sen.view']);

      expect(result).toEqual({ scope: 'none' });
    });

    it('should return "none" scope for sen.view with no staff profile', async () => {
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue(null);

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
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockClassesReadFacade.findClassIdsByStaff.mockResolvedValue(['class-1']);
      mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue(['student-1']);

      await service.getUserScope(TENANT_ID, USER_ID, ['sen.view']);

      expect(mockClassesReadFacade.findEnrolledStudentIds).toHaveBeenCalledWith(
        TENANT_ID,
        'class-1',
      );
    });

    it('should deduplicate studentIds across multiple classes', async () => {
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockClassesReadFacade.findClassIdsByStaff.mockResolvedValue(['class-1', 'class-2']);
      // Same student in both classes — facade is called per class, each returns overlapping IDs
      mockClassesReadFacade.findEnrolledStudentIds
        .mockResolvedValueOnce(['student-1', 'student-2'])
        .mockResolvedValueOnce(['student-1']);

      const result = await service.getUserScope(TENANT_ID, USER_ID, ['sen.view']);

      expect(result.scope).toBe('class');
      expect(result.studentIds).toHaveLength(2);
      expect(result.studentIds).toEqual(['student-1', 'student-2']);
    });

    it('should return "all" when both sen.admin and sen.view permissions exist', async () => {
      const result = await service.getUserScope(TENANT_ID, USER_ID, ['sen.view', 'sen.admin']);

      expect(result).toEqual({ scope: 'all' });
      expect(mockStaffProfileReadFacade.findByUserId).not.toHaveBeenCalled();
    });
  });
});
