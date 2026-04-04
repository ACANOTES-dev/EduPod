import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { SchedulingReadFacade } from '../scheduling/scheduling-read.facade';
import { SchedulingRunsReadFacade } from '../scheduling-runs/scheduling-runs-read.facade';
import { StaffAvailabilityReadFacade } from '../staff-availability/staff-availability-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { SchedulingDashboardController } from './scheduling-dashboard.controller';
import { SchedulingDashboardService } from './scheduling-dashboard.service';

const TENANT: TenantContext = {
  tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const AY_ID = 'ay-uuid-0001';

describe('SchedulingDashboardController', () => {
  let controller: SchedulingDashboardController;
  let mockDashboardService: {
    overview: jest.Mock;
    workload: jest.Mock;
    unassigned: jest.Mock;
    preferences: jest.Mock;
    getStaffProfileId: jest.Mock;
    roomUtilisation: jest.Mock;
    trends: jest.Mock;
  };
  let mockPermissionCache: { getPermissions: jest.Mock };

  beforeEach(async () => {
    mockDashboardService = {
      overview: jest.fn(),
      workload: jest.fn(),
      unassigned: jest.fn(),
      preferences: jest.fn(),
      getStaffProfileId: jest.fn(),
      roomUtilisation: jest.fn(),
      trends: jest.fn(),
    };
    mockPermissionCache = {
      getPermissions: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulingDashboardController],
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
        { provide: RoomsReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
      findActiveRooms: jest.fn().mockResolvedValue([]),
      findActiveRoomBasics: jest.fn().mockResolvedValue([]),
      countActiveRooms: jest.fn().mockResolvedValue(0),
      findAllClosures: jest.fn().mockResolvedValue([]),
      findClosuresPaginated: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findClosureById: jest.fn().mockResolvedValue(null),
    } },
        { provide: SchedulesReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findCoreById: jest.fn().mockResolvedValue(null),
      existsById: jest.fn().mockResolvedValue(null),
      findBusyTeacherIds: jest.fn().mockResolvedValue(new Set()),
      countWeeklyPeriodsPerTeacher: jest.fn().mockResolvedValue(new Map()),
      findTeacherTimetable: jest.fn().mockResolvedValue([]),
      findClassTimetable: jest.fn().mockResolvedValue([]),
      findPinnedEntries: jest.fn().mockResolvedValue([]),
      countPinnedEntries: jest.fn().mockResolvedValue(0),
      findByAcademicYear: jest.fn().mockResolvedValue([]),
      findScheduledClassIds: jest.fn().mockResolvedValue([]),
      countEntriesPerClass: jest.fn().mockResolvedValue(new Map()),
      count: jest.fn().mockResolvedValue(0),
      hasRotationEntries: jest.fn().mockResolvedValue(false),
      countByRoom: jest.fn().mockResolvedValue(0),
      findTeacherScheduleEntries: jest.fn().mockResolvedValue([]),
      findTeacherWorkloadEntries: jest.fn().mockResolvedValue([]),
      countRoomAssignedEntries: jest.fn().mockResolvedValue(0),
      findByIdWithSwapContext: jest.fn().mockResolvedValue(null),
      hasConflict: jest.fn().mockResolvedValue(false),
      findByIdWithSubstitutionContext: jest.fn().mockResolvedValue(null),
      findRoomScheduleEntries: jest.fn().mockResolvedValue([]),
    } },
        { provide: SchedulingReadFacade, useValue: {
      findPeriodTemplate: jest.fn().mockResolvedValue(null),
      countTeachingPeriods: jest.fn().mockResolvedValue(0),
      findPeriodTemplates: jest.fn().mockResolvedValue([]),
      countClassRequirements: jest.fn().mockResolvedValue(0),
      findClassRequirementsWithDetails: jest.fn().mockResolvedValue([]),
      findTeacherCompetencies: jest.fn().mockResolvedValue([]),
      findTeacherConfigs: jest.fn().mockResolvedValue([]),
    } },
        { provide: SchedulingRunsReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findStatusById: jest.fn().mockResolvedValue(null),
      findActiveRun: jest.fn().mockResolvedValue(null),
      countActiveRuns: jest.fn().mockResolvedValue(0),
      findLatestCompletedRun: jest.fn().mockResolvedValue(null),
      findLatestRunWithResult: jest.fn().mockResolvedValue(null),
      findLatestAppliedRun: jest.fn().mockResolvedValue(null),
      listRuns: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findHistoricalRuns: jest.fn().mockResolvedValue([]),
      findScenarioById: jest.fn().mockResolvedValue(null),
      findScenarioStatusById: jest.fn().mockResolvedValue(null),
      listScenarios: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findScenariosForComparison: jest.fn().mockResolvedValue([]),
    } },
        { provide: StaffAvailabilityReadFacade, useValue: {
      findByAcademicYear: jest.fn().mockResolvedValue([]),
      findByStaffIds: jest.fn().mockResolvedValue([]),
      findByWeekday: jest.fn().mockResolvedValue([]),
    } },
        { provide: StaffProfileReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findByIds: jest.fn().mockResolvedValue([]),
      findByUserId: jest.fn().mockResolvedValue(null),
      findActiveStaff: jest.fn().mockResolvedValue([]),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      resolveProfileId: jest.fn().mockResolvedValue('staff-1'),
    } },
        { provide: SchedulingDashboardService, useValue: mockDashboardService },
        { provide: PermissionCacheService, useValue: mockPermissionCache },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SchedulingDashboardController>(SchedulingDashboardController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── overview ──────────────────────────────────────────────────────────────

  describe('overview', () => {
    it('should delegate to dashboard service', async () => {
      const overviewData = { total_classes: 10, configured_classes: 8 };
      mockDashboardService.overview.mockResolvedValue(overviewData);

      const result = await controller.overview(TENANT, { academic_year_id: AY_ID });

      expect(result).toEqual(overviewData);
      expect(mockDashboardService.overview).toHaveBeenCalledWith(TENANT.tenant_id, AY_ID);
    });
  });

  // ─── workload ──────────────────────────────────────────────────────────────

  describe('workload', () => {
    it('should delegate to dashboard service', async () => {
      const workloadData = { data: [], total_periods_per_week: 25 };
      mockDashboardService.workload.mockResolvedValue(workloadData);

      const result = await controller.workload(TENANT, { academic_year_id: AY_ID });

      expect(result).toEqual(workloadData);
      expect(mockDashboardService.workload).toHaveBeenCalledWith(TENANT.tenant_id, AY_ID);
    });
  });

  // ─── unassigned ────────────────────────────────────────────────────────────

  describe('unassigned', () => {
    it('should delegate to dashboard service', async () => {
      const unassignedData = { data: [], count: 0, total_classes: 10 };
      mockDashboardService.unassigned.mockResolvedValue(unassignedData);

      const result = await controller.unassigned(TENANT, { academic_year_id: AY_ID });

      expect(result).toEqual(unassignedData);
      expect(mockDashboardService.unassigned).toHaveBeenCalledWith(TENANT.tenant_id, AY_ID);
    });
  });

  // ─── roomUtilisation ──────────────────────────────────────────────────────

  describe('roomUtilisation', () => {
    it('should delegate to dashboard service', async () => {
      const roomData = { data: [{ room_id: 'r1', utilisation_pct: 50 }] };
      mockDashboardService.roomUtilisation.mockResolvedValue(roomData);

      const result = await controller.roomUtilisation(TENANT, { academic_year_id: AY_ID });

      expect(result).toEqual(roomData);
      expect(mockDashboardService.roomUtilisation).toHaveBeenCalledWith(TENANT.tenant_id, AY_ID);
    });
  });

  // ─── trends ──────────────────────────────────────────────────────────────

  describe('trends', () => {
    it('should delegate to dashboard service', async () => {
      const trendData = { data: [{ label: '01 Mar', preference_score: 80 }] };
      mockDashboardService.trends.mockResolvedValue(trendData);

      const result = await controller.trends(TENANT, { academic_year_id: AY_ID });

      expect(result).toEqual(trendData);
      expect(mockDashboardService.trends).toHaveBeenCalledWith(TENANT.tenant_id, AY_ID);
    });
  });

  // ─── preferences (permission-scoped) ───────────────────────────────────────

  describe('preferences', () => {
    const userWithFullAccess: JwtPayload = {
      sub: 'user-1',
      email: 'full@school.test',
      tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      membership_id: 'mem-1',
      type: 'access',
      iat: 0,
      exp: 0,
    };
    const userWithOwnOnly: JwtPayload = {
      sub: 'user-2',
      email: 'own@school.test',
      tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      membership_id: 'mem-2',
      type: 'access',
      iat: 0,
      exp: 0,
    };

    it('should pass staff_id from query when user has schedule.view_auto_reports', async () => {
      mockPermissionCache.getPermissions.mockResolvedValue([
        'schedule.view_auto_reports',
        'schedule.view_own_satisfaction',
      ]);
      const prefData = { run_id: 'run-1', staff_satisfaction: [] };
      mockDashboardService.preferences.mockResolvedValue(prefData);

      const result = await controller.preferences(TENANT, userWithFullAccess, {
        academic_year_id: AY_ID,
        staff_id: 'staff-specific',
      });

      expect(result).toEqual(prefData);
      expect(mockDashboardService.preferences).toHaveBeenCalledWith(
        TENANT.tenant_id,
        AY_ID,
        'staff-specific',
      );
    });

    it('should scope to own staff profile when user lacks schedule.view_auto_reports', async () => {
      mockPermissionCache.getPermissions.mockResolvedValue(['schedule.view_own_satisfaction']);
      mockDashboardService.getStaffProfileId.mockResolvedValue('staff-own');
      const prefData = { run_id: 'run-1', staff_satisfaction: [] };
      mockDashboardService.preferences.mockResolvedValue(prefData);

      const result = await controller.preferences(TENANT, userWithOwnOnly, {
        academic_year_id: AY_ID,
      });

      expect(result).toEqual(prefData);
      expect(mockDashboardService.getStaffProfileId).toHaveBeenCalledWith(
        TENANT.tenant_id,
        userWithOwnOnly.sub,
      );
      expect(mockDashboardService.preferences).toHaveBeenCalledWith(
        TENANT.tenant_id,
        AY_ID,
        'staff-own',
      );
    });

    it('should pass undefined staffId when own profile is not found', async () => {
      mockPermissionCache.getPermissions.mockResolvedValue([]);
      mockDashboardService.getStaffProfileId.mockResolvedValue(null);
      const prefData = { run_id: null, staff_satisfaction: [] };
      mockDashboardService.preferences.mockResolvedValue(prefData);

      const result = await controller.preferences(TENANT, userWithOwnOnly, {
        academic_year_id: AY_ID,
      });

      expect(result).toEqual(prefData);
      expect(mockDashboardService.preferences).toHaveBeenCalledWith(
        TENANT.tenant_id,
        AY_ID,
        undefined,
      );
    });

    it('should not call getStaffProfileId when user has full access', async () => {
      mockPermissionCache.getPermissions.mockResolvedValue(['schedule.view_auto_reports']);
      mockDashboardService.preferences.mockResolvedValue({ run_id: null, staff_satisfaction: [] });

      await controller.preferences(TENANT, userWithFullAccess, { academic_year_id: AY_ID });

      expect(mockDashboardService.getStaffProfileId).not.toHaveBeenCalled();
    });
  });
});
