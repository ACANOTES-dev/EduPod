import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { TimetablesController } from './timetables.controller';
import { TimetablesService } from './timetables.service';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';
const STAFF_PROFILE_ID = 'staff-uuid-1';
const ROOM_ID = 'room-uuid-1';
const STUDENT_ID = 'student-uuid-1';
const AY_ID = 'ay-uuid-1';
const MEMBERSHIP_ID = 'membership-uuid-1';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'user@school.test',
  tenant_id: TENANT_ID,
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('TimetablesController', () => {
  let controller: TimetablesController;
  let mockService: {
    getTeacherTimetable: jest.Mock;
    getRoomTimetable: jest.Mock;
    getStudentTimetable: jest.Mock;
    getWorkloadReport: jest.Mock;
  };
  let mockPermissionCache: { getPermissions: jest.Mock };
  let mockPrisma: {
    staffProfile: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockService = {
      getTeacherTimetable: jest.fn(),
      getRoomTimetable: jest.fn(),
      getStudentTimetable: jest.fn(),
      getWorkloadReport: jest.fn(),
    };
    mockPermissionCache = {
      getPermissions: jest.fn().mockResolvedValue(['schedule.manage']),
    };
    mockPrisma = {
      staffProfile: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TimetablesController],
      providers: [
        { provide: ClassesReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      findEnrolledStudentIds: jest.fn().mockResolvedValue([]),
      countEnrolledStudents: jest.fn().mockResolvedValue(0),
      findOtherClassEnrolmentsForStudents: jest.fn().mockResolvedValue([]),
      findByAcademicYear: jest.fn().mockResolvedValue([]),
      findByYearGroup: jest.fn().mockResolvedValue([]),
      findIdsByAcademicYear: jest.fn().mockResolvedValue([]),
      countByAcademicYear: jest.fn().mockResolvedValue(0),
      findClassesWithoutTeachers: jest.fn().mockResolvedValue([]),
      findClassIdsForStudent: jest.fn().mockResolvedValue([]),
      findEnrolmentPairsForAcademicYear: jest.fn().mockResolvedValue([]),
    } },
        { provide: StaffProfileReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findByIds: jest.fn().mockResolvedValue([]),
      findByUserId: jest.fn().mockResolvedValue(null),
      findActiveStaff: jest.fn().mockResolvedValue([]),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      resolveProfileId: jest.fn().mockResolvedValue('staff-1'),
    } },
        { provide: TimetablesService, useValue: mockService },
        { provide: PermissionCacheService, useValue: mockPermissionCache },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TimetablesController>(TimetablesController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getTeacherTimetable', () => {
    it('should return timetable when user has schedule.manage permission', async () => {
      const expected = [{ schedule_id: 's1', weekday: 1 }];
      mockService.getTeacherTimetable.mockResolvedValue(expected);

      const result = await controller.getTeacherTimetable(mockTenant, mockUser, STAFF_PROFILE_ID, {
        academic_year_id: AY_ID,
      });

      expect(result).toEqual(expected);
      expect(mockService.getTeacherTimetable).toHaveBeenCalledWith(TENANT_ID, STAFF_PROFILE_ID, {
        academic_year_id: AY_ID,
        week_start: undefined,
      });
    });

    it('should allow view_own when viewing own profile', async () => {
      mockPermissionCache.getPermissions.mockResolvedValue(['schedule.view_own']);
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
      });
      mockService.getTeacherTimetable.mockResolvedValue([]);

      const result = await controller.getTeacherTimetable(mockTenant, mockUser, STAFF_PROFILE_ID, {
        academic_year_id: AY_ID,
      });

      expect(result).toEqual([]);
    });

    it('should throw ForbiddenException when view_own but viewing someone else', async () => {
      mockPermissionCache.getPermissions.mockResolvedValue(['schedule.view_own']);
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

      await expect(
        controller.getTeacherTimetable(mockTenant, mockUser, 'other-staff', {
          academic_year_id: AY_ID,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user has neither permission', async () => {
      mockPermissionCache.getPermissions.mockResolvedValue([]);

      await expect(
        controller.getTeacherTimetable(mockTenant, mockUser, STAFF_PROFILE_ID, {
          academic_year_id: AY_ID,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getRoomTimetable', () => {
    it('should return room timetable', async () => {
      const expected = [{ schedule_id: 's1' }];
      mockService.getRoomTimetable.mockResolvedValue(expected);

      const result = await controller.getRoomTimetable(mockTenant, ROOM_ID, {
        academic_year_id: AY_ID,
      });

      expect(result).toEqual(expected);
    });
  });

  describe('getStudentTimetable', () => {
    it('should return student timetable', async () => {
      const expected = [{ schedule_id: 's1' }];
      mockService.getStudentTimetable.mockResolvedValue(expected);

      const result = await controller.getStudentTimetable(mockTenant, STUDENT_ID, {
        academic_year_id: AY_ID,
      });

      expect(result).toEqual(expected);
    });
  });

  describe('getWorkloadReport', () => {
    it('should return workload report', async () => {
      const expected = [{ staff_profile_id: STAFF_PROFILE_ID, total_periods: 10 }];
      mockService.getWorkloadReport.mockResolvedValue(expected);

      const result = await controller.getWorkloadReport(mockTenant, {
        academic_year_id: AY_ID,
      });

      expect(result).toEqual(expected);
    });
  });
});
