/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload } from '@school/shared';
import type { TenantContext } from '@school/shared';

import { SchedulerOrchestrationController } from './scheduler-orchestration.controller';
import { SchedulerOrchestrationService } from './scheduler-orchestration.service';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { ConfigurationReadFacade } from '../configuration/configuration-read.facade';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { SchedulingRunsReadFacade } from '../scheduling-runs/scheduling-runs-read.facade';
import { StaffAvailabilityReadFacade } from '../staff-availability/staff-availability-read.facade';
import { StaffPreferencesReadFacade } from '../staff-preferences/staff-preferences-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const USER: JwtPayload = {
  sub: 'user-uuid',
  email: 'admin@example.com',
  tenant_id: 'tenant-uuid',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};
const AY_ID = 'ay-uuid';
const RUN_ID = 'run-uuid';

const mockService = {
  checkPrerequisites: jest.fn(),
  triggerSolverRun: jest.fn(),
  listRuns: jest.fn(),
  getRun: jest.fn(),
  applyRun: jest.fn(),
  discardRun: jest.fn(),
  getRunStatus: jest.fn(),
};

describe('SchedulerOrchestrationController', () => {
  let controller: SchedulerOrchestrationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulerOrchestrationController],
      providers: [
        { provide: AcademicReadFacade, useValue: {
      findCurrentYear: jest.fn().mockResolvedValue(null),
      findCurrentYearId: jest.fn().mockResolvedValue('year-1'),
      findYearById: jest.fn().mockResolvedValue(null),
      findYearByIdOrThrow: jest.fn().mockResolvedValue('year-1'),
      findSubjectByIdOrThrow: jest.fn().mockResolvedValue('subject-1'),
      findYearGroupByIdOrThrow: jest.fn().mockResolvedValue('yg-1'),
      findYearGroupsWithActiveClasses: jest.fn().mockResolvedValue([]),
      findYearGroupsWithClassesAndCounts: jest.fn().mockResolvedValue([]),
      findAllYearGroups: jest.fn().mockResolvedValue([]),
      findSubjectsByIdsWithOrder: jest.fn().mockResolvedValue([]),
      findSubjectById: jest.fn().mockResolvedValue(null),
      findYearGroupById: jest.fn().mockResolvedValue(null),
      findPeriodById: jest.fn().mockResolvedValue(null),
    } },
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
        { provide: ConfigurationReadFacade, useValue: {
      findSettings: jest.fn().mockResolvedValue(null),
      findSettingsJson: jest.fn().mockResolvedValue(null),
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
        { provide: StaffPreferencesReadFacade, useValue: {
      findByAcademicYear: jest.fn().mockResolvedValue([]),
      findByStaffProfile: jest.fn().mockResolvedValue([]),
    } },
        { provide: StaffProfileReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findByIds: jest.fn().mockResolvedValue([]),
      findByUserId: jest.fn().mockResolvedValue(null),
      findActiveStaff: jest.fn().mockResolvedValue([]),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      resolveProfileId: jest.fn().mockResolvedValue('staff-1'),
    } },{ provide: SchedulerOrchestrationService, useValue: mockService }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<SchedulerOrchestrationController>(SchedulerOrchestrationController);
    jest.clearAllMocks();
  });

  it('should call service.checkPrerequisites with tenant_id and academic_year_id', async () => {
    const prereqs = { ready: true, missing: [] };
    mockService.checkPrerequisites.mockResolvedValue(prereqs);

    const result = await controller.checkPrerequisites(TENANT, {
      academic_year_id: AY_ID,
    });

    expect(mockService.checkPrerequisites).toHaveBeenCalledWith('tenant-uuid', AY_ID);
    expect(result).toEqual(prereqs);
  });

  it('should call service.triggerSolverRun with correct params', async () => {
    const dto = { academic_year_id: AY_ID, max_solver_duration_seconds: 120 };
    const run = { id: RUN_ID, status: 'pending' };
    mockService.triggerSolverRun.mockResolvedValue(run);

    const result = await controller.trigger(TENANT, USER, dto);

    expect(mockService.triggerSolverRun).toHaveBeenCalledWith(
      'tenant-uuid',
      AY_ID,
      'user-uuid',
      dto,
    );
    expect(result).toEqual(run);
  });

  it('should call service.listRuns with correct params', async () => {
    const mockResult = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockService.listRuns.mockResolvedValue(mockResult);

    const query = { academic_year_id: AY_ID, page: 1, pageSize: 20 };
    const result = await controller.listRuns(TENANT, query);

    expect(mockService.listRuns).toHaveBeenCalledWith('tenant-uuid', AY_ID, 1, 20);
    expect(result).toEqual(mockResult);
  });

  it('should call service.getRun with tenant_id and id', async () => {
    const run = { id: RUN_ID, status: 'completed' };
    mockService.getRun.mockResolvedValue(run);

    const result = await controller.getRun(TENANT, RUN_ID);

    expect(mockService.getRun).toHaveBeenCalledWith('tenant-uuid', RUN_ID);
    expect(result).toEqual(run);
  });

  it('should call service.applyRun with correct params', async () => {
    const applied = { id: RUN_ID, status: 'applied' };
    mockService.applyRun.mockResolvedValue(applied);

    const result = await controller.applyRun(TENANT, USER, RUN_ID, {
      acknowledged_violations: true,
    });

    expect(mockService.applyRun).toHaveBeenCalledWith('tenant-uuid', RUN_ID, 'user-uuid', true);
    expect(result).toEqual(applied);
  });

  it('should call service.discardRun with tenant_id and id', async () => {
    const discarded = { id: RUN_ID, status: 'discarded' };
    mockService.discardRun.mockResolvedValue(discarded);

    const result = await controller.discardRun(TENANT, RUN_ID);

    expect(mockService.discardRun).toHaveBeenCalledWith('tenant-uuid', RUN_ID);
    expect(result).toEqual(discarded);
  });

  it('should call service.getRunStatus with tenant_id and id', async () => {
    const status = { status: 'running', progress: 45 };
    mockService.getRunStatus.mockResolvedValue(status);

    const result = await controller.getRunStatus(TENANT, RUN_ID);

    expect(mockService.getRunStatus).toHaveBeenCalledWith('tenant-uuid', RUN_ID);
    expect(result).toEqual(status);
  });
});
