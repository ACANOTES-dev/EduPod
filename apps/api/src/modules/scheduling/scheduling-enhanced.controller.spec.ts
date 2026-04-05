/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload } from '@school/shared';
import type { TenantContext } from '@school/shared';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { SchedulingRunsReadFacade } from '../scheduling-runs/scheduling-runs-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { AiSubstitutionService } from './ai-substitution.service';
import { CoverTrackingService } from './cover-tracking.service';
import { ExamSchedulingService } from './exam-scheduling.service';
import { PersonalTimetableService } from './personal-timetable.service';
import { RotationService } from './rotation.service';
import { ScenarioService } from './scenario.service';
import { ScheduleSwapService } from './schedule-swap.service';
import { SchedulingAnalyticsService } from './scheduling-analytics.service';
import { SchedulingEnhancedController } from './scheduling-enhanced.controller';
import { SubstitutionService } from './substitution.service';

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

const mockSubstitutionService = {
  reportAbsence: jest.fn(),
  getAbsences: jest.fn(),
  deleteAbsence: jest.fn(),
  findEligibleSubstitutes: jest.fn(),
  assignSubstitute: jest.fn(),
  getSubstitutionRecords: jest.fn(),
  getTodayBoard: jest.fn(),
};

const mockAiSubstitutionService = {
  rankSubstitutes: jest.fn(),
};

const mockCoverTrackingService = {
  getCoverReport: jest.fn(),
  getCoverFairness: jest.fn(),
  getCoverByDepartment: jest.fn(),
};

const mockScheduleSwapService = {
  validateSwap: jest.fn(),
  executeSwap: jest.fn(),
  emergencyChange: jest.fn(),
};

const mockPersonalTimetableService = {
  getTeacherTimetable: jest.fn(),
  getTeacherTimetableByUserId: jest.fn(),
  getClassTimetable: jest.fn(),
  createSubscriptionToken: jest.fn(),
  listSubscriptionTokens: jest.fn(),
  revokeSubscriptionToken: jest.fn(),
};

const mockRotationService = {
  upsertRotationConfig: jest.fn(),
  getRotationConfig: jest.fn(),
  deleteRotationConfig: jest.fn(),
  getCurrentRotationWeek: jest.fn(),
};

const mockExamSchedulingService = {
  createExamSession: jest.fn(),
  listExamSessions: jest.fn(),
  getExamSession: jest.fn(),
  updateExamSession: jest.fn(),
  deleteExamSession: jest.fn(),
  addExamSlot: jest.fn(),
  generateExamSchedule: jest.fn(),
  assignInvigilators: jest.fn(),
  publishExamSchedule: jest.fn(),
};

const mockScenarioService = {
  createScenario: jest.fn(),
  listScenarios: jest.fn(),
  getScenario: jest.fn(),
  updateScenario: jest.fn(),
  deleteScenario: jest.fn(),
  runScenarioSolver: jest.fn(),
  compareScenarios: jest.fn(),
};

const mockAnalyticsService = {
  getEfficiencyDashboard: jest.fn(),
  getWorkloadHeatmap: jest.fn(),
  getRoomUtilization: jest.fn(),
  getHistoricalComparison: jest.fn(),
};

describe('SchedulingEnhancedController', () => {
  let controller: SchedulingEnhancedController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulingEnhancedController],
      providers: [
        {
          provide: SchedulesReadFacade,
          useValue: {
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
          },
        },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
            findByIds: jest.fn().mockResolvedValue([]),
            findByUserId: jest.fn().mockResolvedValue(null),
            findActiveStaff: jest.fn().mockResolvedValue([]),
            existsOrThrow: jest.fn().mockResolvedValue(undefined),
            resolveProfileId: jest.fn().mockResolvedValue('staff-1'),
          },
        },
        {
          provide: AcademicReadFacade,
          useValue: {
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
          },
        },
        {
          provide: RoomsReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
            existsOrThrow: jest.fn().mockResolvedValue(undefined),
            exists: jest.fn().mockResolvedValue(false),
            findActiveRooms: jest.fn().mockResolvedValue([]),
            findActiveRoomBasics: jest.fn().mockResolvedValue([]),
            countActiveRooms: jest.fn().mockResolvedValue(0),
            findAllClosures: jest.fn().mockResolvedValue([]),
            findClosuresPaginated: jest.fn().mockResolvedValue({ data: [], total: 0 }),
            findClosureById: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: SchedulingRunsReadFacade,
          useValue: {
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
          },
        },
        { provide: SubstitutionService, useValue: mockSubstitutionService },
        { provide: AiSubstitutionService, useValue: mockAiSubstitutionService },
        { provide: CoverTrackingService, useValue: mockCoverTrackingService },
        { provide: ScheduleSwapService, useValue: mockScheduleSwapService },
        {
          provide: PersonalTimetableService,
          useValue: mockPersonalTimetableService,
        },
        { provide: RotationService, useValue: mockRotationService },
        { provide: ExamSchedulingService, useValue: mockExamSchedulingService },
        { provide: ScenarioService, useValue: mockScenarioService },
        {
          provide: SchedulingAnalyticsService,
          useValue: mockAnalyticsService,
        },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<SchedulingEnhancedController>(SchedulingEnhancedController);
    jest.clearAllMocks();
  });

  // ─── Substitution ─────────────────────────────────────────────────────

  it('should call substitutionService.reportAbsence with correct params', async () => {
    const dto = {
      staff_id: 'sp1',
      date: '2025-03-10',
      full_day: true,
    };
    const created = { id: 'abs-1', ...dto };
    mockSubstitutionService.reportAbsence.mockResolvedValue(created);

    const result = await controller.reportAbsence(TENANT, USER, dto);

    expect(mockSubstitutionService.reportAbsence).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
      dto,
    );
    expect(result).toEqual(created);
  });

  it('should call substitutionService.getTodayBoard', async () => {
    const board = { absences: [], substitutions: [] };
    mockSubstitutionService.getTodayBoard.mockResolvedValue(board);

    const result = await controller.getTodayBoard(TENANT);

    expect(mockSubstitutionService.getTodayBoard).toHaveBeenCalledWith('tenant-uuid');
    expect(result).toEqual(board);
  });

  // ─── Cover Reports ────────────────────────────────────────────────────

  it('should call coverTrackingService.getCoverReport with correct params', async () => {
    const query = { academic_year_id: AY_ID, date_from: '2025-01-01', date_to: '2025-06-30' };
    const report = { total_covers: 25, teachers: [] };
    mockCoverTrackingService.getCoverReport.mockResolvedValue(report);

    const result = await controller.getCoverReport(TENANT, query);

    expect(mockCoverTrackingService.getCoverReport).toHaveBeenCalledWith('tenant-uuid', query);
    expect(result).toEqual(report);
  });

  // ─── Schedule Swap ────────────────────────────────────────────────────

  it('should call scheduleSwapService.validateSwap with correct params', async () => {
    const dto = {
      schedule_id_a: 'sched-a',
      schedule_id_b: 'sched-b',
      date: '2025-03-10',
    };
    const validation = {
      valid: true,
      violations: [],
      impact: { teachers_affected: [], rooms_changed: false, description: 'OK' },
    };
    mockScheduleSwapService.validateSwap.mockResolvedValue(validation);

    const result = await controller.validateSwap(TENANT, dto);

    expect(mockScheduleSwapService.validateSwap).toHaveBeenCalledWith('tenant-uuid', dto);
    expect(result).toEqual(validation);
  });

  // ─── Timetable ────────────────────────────────────────────────────────

  it('should call personalTimetableService.getTeacherTimetable with correct params', async () => {
    const staffId = 'staff-uuid';
    const query = { rotation_week: 1 };
    const timetable = { entries: [], teacher_name: 'Teacher A' };
    mockPersonalTimetableService.getTeacherTimetable.mockResolvedValue(timetable);

    const result = await controller.getTeacherTimetable(TENANT, staffId, query);

    expect(mockPersonalTimetableService.getTeacherTimetable).toHaveBeenCalledWith(
      'tenant-uuid',
      staffId,
      query,
    );
    expect(result).toEqual(timetable);
  });

  // ─── Exam Sessions ────────────────────────────────────────────────────

  it('should call examSchedulingService.createExamSession with correct params', async () => {
    const dto = {
      academic_period_id: AY_ID,
      name: 'Final Exams',
      start_date: '2025-06-01',
      end_date: '2025-06-15',
    };
    const created = { id: 'exam-1', ...dto };
    mockExamSchedulingService.createExamSession.mockResolvedValue(created);

    const result = await controller.createExamSession(TENANT, dto);

    expect(mockExamSchedulingService.createExamSession).toHaveBeenCalledWith('tenant-uuid', dto);
    expect(result).toEqual(created);
  });

  // ─── Scenarios ────────────────────────────────────────────────────────

  it('should call scenarioService.createScenario with correct params', async () => {
    const dto = {
      academic_year_id: AY_ID,
      name: 'What-if scenario',
      adjustments: {},
    };
    const created = { id: 'scen-1', ...dto };
    mockScenarioService.createScenario.mockResolvedValue(created);

    const result = await controller.createScenario(TENANT, USER, dto);

    expect(mockScenarioService.createScenario).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
      dto,
    );
    expect(result).toEqual(created);
  });

  // ─── Analytics ────────────────────────────────────────────────────────

  it('should call analyticsService.getEfficiencyDashboard with correct params', async () => {
    const query = { academic_year_id: AY_ID };
    const dashboard = { utilization: 0.85, gap_periods: 12 };
    mockAnalyticsService.getEfficiencyDashboard.mockResolvedValue(dashboard);

    const result = await controller.getEfficiencyDashboard(TENANT, query);

    expect(mockAnalyticsService.getEfficiencyDashboard).toHaveBeenCalledWith('tenant-uuid', query);
    expect(result).toEqual(dashboard);
  });

  it('should call analyticsService.getRoomUtilization with correct params', async () => {
    const query = { academic_year_id: AY_ID };
    const rooms = [{ room_id: 'r1', room_name: 'Lab', utilization_rate: 0.9 }];
    mockAnalyticsService.getRoomUtilization.mockResolvedValue(rooms);

    const result = await controller.getRoomUtilization(TENANT, query);

    expect(mockAnalyticsService.getRoomUtilization).toHaveBeenCalledWith('tenant-uuid', query);
    expect(result).toEqual(rooms);
  });

  // ─── Absences — remaining delegation ────────────────────────────────

  it('should call substitutionService.getAbsences with correct params', async () => {
    const query = { page: 1, pageSize: 20 };
    const absences = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockSubstitutionService.getAbsences.mockResolvedValue(absences);

    const result = await controller.getAbsences(TENANT, query);

    expect(mockSubstitutionService.getAbsences).toHaveBeenCalledWith('tenant-uuid', query);
    expect(result).toEqual(absences);
  });

  it('should call substitutionService.deleteAbsence with correct params', async () => {
    mockSubstitutionService.deleteAbsence.mockResolvedValue({ deleted: true });

    const result = await controller.deleteAbsence(TENANT, 'abs-1');

    expect(mockSubstitutionService.deleteAbsence).toHaveBeenCalledWith('tenant-uuid', 'abs-1');
    expect(result).toEqual({ deleted: true });
  });

  it('should call substitutionService.findEligibleSubstitutes with correct params', async () => {
    const query = { schedule_id: 'sched-1', date: '2025-03-10' };
    const subs = { data: [] };
    mockSubstitutionService.findEligibleSubstitutes.mockResolvedValue(subs);

    const result = await controller.findEligibleSubstitutes(TENANT, 'abs-1', query);

    expect(mockSubstitutionService.findEligibleSubstitutes).toHaveBeenCalledWith(
      'tenant-uuid',
      'sched-1',
      '2025-03-10',
    );
    expect(result).toEqual(subs);
  });

  it('should call aiSubstitutionService.rankSubstitutes with correct params', async () => {
    const query = { schedule_id: 'sched-1', date: '2025-03-10' };
    const ranked = { data: [] };
    mockAiSubstitutionService.rankSubstitutes.mockResolvedValue(ranked);

    const result = await controller.aiRankSubstitutes(TENANT, query);

    expect(mockAiSubstitutionService.rankSubstitutes).toHaveBeenCalledWith(
      'tenant-uuid',
      'sched-1',
      '2025-03-10',
    );
    expect(result).toEqual(ranked);
  });

  it('should call substitutionService.assignSubstitute with correct params', async () => {
    const dto = {
      absence_id: 'abs-1',
      schedule_id: 'sched-1',
      substitute_staff_id: 'staff-2',
      date: '2025-03-10',
    };
    const created = { id: 'sub-rec-1', ...dto };
    mockSubstitutionService.assignSubstitute.mockResolvedValue(created);

    const result = await controller.assignSubstitute(TENANT, USER, dto);

    expect(mockSubstitutionService.assignSubstitute).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
      dto,
    );
    expect(result).toEqual(created);
  });

  it('should call substitutionService.getSubstitutionRecords with correct params', async () => {
    const query = { page: 1, pageSize: 20 };
    const records = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockSubstitutionService.getSubstitutionRecords.mockResolvedValue(records);

    const result = await controller.getSubstitutionRecords(TENANT, query);

    expect(mockSubstitutionService.getSubstitutionRecords).toHaveBeenCalledWith(
      'tenant-uuid',
      query,
    );
    expect(result).toEqual(records);
  });

  // ─── Cover Reports — remaining delegation ──────────────────────────

  it('should call coverTrackingService.getCoverFairness with correct params', async () => {
    const query = { academic_year_id: AY_ID, date_from: '2025-01-01', date_to: '2025-06-30' };
    const fairness = { gini_coefficient: 0.3, teacher_stats: [] };
    mockCoverTrackingService.getCoverFairness.mockResolvedValue(fairness);

    const result = await controller.getCoverFairness(TENANT, query);

    expect(mockCoverTrackingService.getCoverFairness).toHaveBeenCalledWith('tenant-uuid', query);
    expect(result).toEqual(fairness);
  });

  it('should call coverTrackingService.getCoverByDepartment with correct params', async () => {
    const query = { academic_year_id: AY_ID, date_from: '2025-01-01', date_to: '2025-06-30' };
    const dept = { departments: [] };
    mockCoverTrackingService.getCoverByDepartment.mockResolvedValue(dept);

    const result = await controller.getCoverByDepartment(TENANT, query);

    expect(mockCoverTrackingService.getCoverByDepartment).toHaveBeenCalledWith(
      'tenant-uuid',
      query,
    );
    expect(result).toEqual(dept);
  });

  // ─── Schedule Swap — remaining delegation ──────────────────────────

  it('should call scheduleSwapService.executeSwap with correct params', async () => {
    const dto = { schedule_id_a: 'sched-a', schedule_id_b: 'sched-b', date: '2025-03-10' };
    const swapResult = { success: true };
    mockScheduleSwapService.executeSwap.mockResolvedValue(swapResult);

    const result = await controller.executeSwap(TENANT, USER, dto);

    expect(mockScheduleSwapService.executeSwap).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
      dto,
    );
    expect(result).toEqual(swapResult);
  });

  it('should call scheduleSwapService.emergencyChange with correct params', async () => {
    const dto = { schedule_id: 'sched-1', changes: { room_id: 'room-2' }, reason: 'emergency' };
    const changeResult = { id: 'change-1' };
    mockScheduleSwapService.emergencyChange.mockResolvedValue(changeResult);

    const result = await controller.emergencyChange(TENANT, USER, dto);

    expect(mockScheduleSwapService.emergencyChange).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
      dto,
    );
    expect(result).toEqual(changeResult);
  });

  // ─── Personal Timetable — remaining delegation ─────────────────────

  it('should call personalTimetableService.getTeacherTimetableByUserId for my timetable', async () => {
    const query = { rotation_week: 1 };
    const timetable = { data: [] };
    mockPersonalTimetableService.getTeacherTimetableByUserId.mockResolvedValue(timetable);

    const result = await controller.getMyTimetable(TENANT, USER, query);

    expect(mockPersonalTimetableService.getTeacherTimetableByUserId).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
      query,
    );
    expect(result).toEqual(timetable);
  });

  it('should call personalTimetableService.getClassTimetable with correct params', async () => {
    const query = {};
    const timetable = { data: [] };
    mockPersonalTimetableService.getClassTimetable.mockResolvedValue(timetable);

    const result = await controller.getClassTimetable(TENANT, 'class-1', query);

    expect(mockPersonalTimetableService.getClassTimetable).toHaveBeenCalledWith(
      'tenant-uuid',
      'class-1',
      query,
    );
    expect(result).toEqual(timetable);
  });

  it('should call personalTimetableService.createSubscriptionToken with correct params', async () => {
    const dto = { entity_type: 'teacher' as const, entity_id: 'staff-1' };
    const token = { id: 'token-1', token: 'abc123' };
    mockPersonalTimetableService.createSubscriptionToken.mockResolvedValue(token);

    const result = await controller.createCalendarToken(TENANT, USER, dto);

    expect(mockPersonalTimetableService.createSubscriptionToken).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
      dto,
    );
    expect(result).toEqual(token);
  });

  it('should call personalTimetableService.listSubscriptionTokens with correct params', async () => {
    const tokens = { data: [] };
    mockPersonalTimetableService.listSubscriptionTokens.mockResolvedValue(tokens);

    const result = await controller.listCalendarTokens(TENANT, USER);

    expect(mockPersonalTimetableService.listSubscriptionTokens).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
    );
    expect(result).toEqual(tokens);
  });

  it('should call personalTimetableService.revokeSubscriptionToken with correct params', async () => {
    const revoked = { revoked: true };
    mockPersonalTimetableService.revokeSubscriptionToken.mockResolvedValue(revoked);

    const result = await controller.revokeCalendarToken(TENANT, USER, 'token-1');

    expect(mockPersonalTimetableService.revokeSubscriptionToken).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
      'token-1',
    );
    expect(result).toEqual(revoked);
  });

  // ─── Rotation — remaining delegation ───────────────────────────────

  it('should call rotationService.upsertRotationConfig with correct params', async () => {
    const dto = {
      academic_year_id: AY_ID,
      cycle_length: 2,
      week_labels: ['Week 1', 'Week 2'],
      effective_start_date: '2025-09-01',
    };
    const config = { id: 'rot-1', ...dto };
    mockRotationService.upsertRotationConfig.mockResolvedValue(config);

    const result = await controller.upsertRotation(TENANT, dto);

    expect(mockRotationService.upsertRotationConfig).toHaveBeenCalledWith('tenant-uuid', dto);
    expect(result).toEqual(config);
  });

  it('should call rotationService.getRotationConfig with correct params', async () => {
    const query = { academic_year_id: AY_ID };
    const config = { total_weeks: 2 };
    mockRotationService.getRotationConfig.mockResolvedValue(config);

    const result = await controller.getRotationConfig(TENANT, query);

    expect(mockRotationService.getRotationConfig).toHaveBeenCalledWith('tenant-uuid', AY_ID);
    expect(result).toEqual(config);
  });

  it('should call rotationService.deleteRotationConfig with correct params', async () => {
    const query = { academic_year_id: AY_ID };
    mockRotationService.deleteRotationConfig.mockResolvedValue({ deleted: true });

    const result = await controller.deleteRotationConfig(TENANT, query);

    expect(mockRotationService.deleteRotationConfig).toHaveBeenCalledWith('tenant-uuid', AY_ID);
    expect(result).toEqual({ deleted: true });
  });

  it('should call rotationService.getCurrentRotationWeek with correct params', async () => {
    const query = { academic_year_id: AY_ID, date: '2025-03-10' };
    const week = { current_week: 1 };
    mockRotationService.getCurrentRotationWeek.mockResolvedValue(week);

    const result = await controller.getCurrentRotationWeek(TENANT, query);

    expect(mockRotationService.getCurrentRotationWeek).toHaveBeenCalledWith(
      'tenant-uuid',
      AY_ID,
      '2025-03-10',
    );
    expect(result).toEqual(week);
  });

  it('should call rotationService.getCurrentRotationWeek without date when not provided', async () => {
    const query = { academic_year_id: AY_ID };
    const week = { current_week: 1 };
    mockRotationService.getCurrentRotationWeek.mockResolvedValue(week);

    const result = await controller.getCurrentRotationWeek(TENANT, query);

    expect(mockRotationService.getCurrentRotationWeek).toHaveBeenCalledWith(
      'tenant-uuid',
      AY_ID,
      undefined,
    );
    expect(result).toEqual(week);
  });

  // ─── Exam Sessions — remaining delegation ──────────────────────────

  it('should call examSchedulingService.listExamSessions with correct params', async () => {
    const query = { academic_period_id: AY_ID, page: 1, pageSize: 20 };
    const sessions = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockExamSchedulingService.listExamSessions.mockResolvedValue(sessions);

    const result = await controller.listExamSessions(TENANT, query);

    expect(mockExamSchedulingService.listExamSessions).toHaveBeenCalledWith('tenant-uuid', query);
    expect(result).toEqual(sessions);
  });

  it('should call examSchedulingService.getExamSession with correct params', async () => {
    const session = { id: 'exam-1', name: 'Finals' };
    mockExamSchedulingService.getExamSession.mockResolvedValue(session);

    const result = await controller.getExamSession(TENANT, 'exam-1');

    expect(mockExamSchedulingService.getExamSession).toHaveBeenCalledWith('tenant-uuid', 'exam-1');
    expect(result).toEqual(session);
  });

  it('should call examSchedulingService.updateExamSession with correct params', async () => {
    const dto = { name: 'Updated Finals' };
    const updated = { id: 'exam-1', ...dto };
    mockExamSchedulingService.updateExamSession.mockResolvedValue(updated);

    const result = await controller.updateExamSession(TENANT, 'exam-1', dto);

    expect(mockExamSchedulingService.updateExamSession).toHaveBeenCalledWith(
      'tenant-uuid',
      'exam-1',
      dto,
    );
    expect(result).toEqual(updated);
  });

  it('should call examSchedulingService.deleteExamSession with correct params', async () => {
    mockExamSchedulingService.deleteExamSession.mockResolvedValue({ deleted: true });

    const result = await controller.deleteExamSession(TENANT, 'exam-1');

    expect(mockExamSchedulingService.deleteExamSession).toHaveBeenCalledWith(
      'tenant-uuid',
      'exam-1',
    );
    expect(result).toEqual({ deleted: true });
  });

  it('should call examSchedulingService.addExamSlot with correct params', async () => {
    const dto = {
      date: '2025-06-05',
      start_time: '09:00',
      end_time: '11:00',
      subject_id: 's1',
      year_group_id: 'yg-1',
      student_count: 30,
      duration_minutes: 120,
    };
    const slot = { id: 'slot-1', ...dto };
    mockExamSchedulingService.addExamSlot.mockResolvedValue(slot);

    const result = await controller.addExamSlot(TENANT, 'exam-1', dto);

    expect(mockExamSchedulingService.addExamSlot).toHaveBeenCalledWith(
      'tenant-uuid',
      'exam-1',
      dto,
    );
    expect(result).toEqual(slot);
  });

  it('should call examSchedulingService.generateExamSchedule with correct params', async () => {
    const generated = { slots: [] };
    mockExamSchedulingService.generateExamSchedule.mockResolvedValue(generated);

    const result = await controller.generateExamSchedule(TENANT, 'exam-1');

    expect(mockExamSchedulingService.generateExamSchedule).toHaveBeenCalledWith(
      'tenant-uuid',
      'exam-1',
    );
    expect(result).toEqual(generated);
  });

  it('should call examSchedulingService.assignInvigilators with correct params', async () => {
    const assigned = { assigned_count: 5 };
    mockExamSchedulingService.assignInvigilators.mockResolvedValue(assigned);

    const result = await controller.assignInvigilators(TENANT, 'exam-1');

    expect(mockExamSchedulingService.assignInvigilators).toHaveBeenCalledWith(
      'tenant-uuid',
      'exam-1',
    );
    expect(result).toEqual(assigned);
  });

  it('should call examSchedulingService.publishExamSchedule with correct params', async () => {
    const published = { published: true };
    mockExamSchedulingService.publishExamSchedule.mockResolvedValue(published);

    const result = await controller.publishExamSchedule(TENANT, 'exam-1');

    expect(mockExamSchedulingService.publishExamSchedule).toHaveBeenCalledWith(
      'tenant-uuid',
      'exam-1',
    );
    expect(result).toEqual(published);
  });

  // ─── Scenarios — remaining delegation ──────────────────────────────

  it('should call scenarioService.listScenarios with correct params', async () => {
    const query = { academic_year_id: AY_ID, page: 1, pageSize: 20 };
    const scenarios = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockScenarioService.listScenarios.mockResolvedValue(scenarios);

    const result = await controller.listScenarios(TENANT, query);

    expect(mockScenarioService.listScenarios).toHaveBeenCalledWith('tenant-uuid', query);
    expect(result).toEqual(scenarios);
  });

  it('should call scenarioService.getScenario with correct params', async () => {
    const scenario = { id: 'scen-1', name: 'Test' };
    mockScenarioService.getScenario.mockResolvedValue(scenario);

    const result = await controller.getScenario(TENANT, 'scen-1');

    expect(mockScenarioService.getScenario).toHaveBeenCalledWith('tenant-uuid', 'scen-1');
    expect(result).toEqual(scenario);
  });

  it('should call scenarioService.updateScenario with correct params', async () => {
    const dto = { name: 'Updated' };
    const updated = { id: 'scen-1', ...dto };
    mockScenarioService.updateScenario.mockResolvedValue(updated);

    const result = await controller.updateScenario(TENANT, 'scen-1', dto);

    expect(mockScenarioService.updateScenario).toHaveBeenCalledWith('tenant-uuid', 'scen-1', dto);
    expect(result).toEqual(updated);
  });

  it('should call scenarioService.deleteScenario with correct params', async () => {
    mockScenarioService.deleteScenario.mockResolvedValue({ deleted: true });

    const result = await controller.deleteScenario(TENANT, 'scen-1');

    expect(mockScenarioService.deleteScenario).toHaveBeenCalledWith('tenant-uuid', 'scen-1');
    expect(result).toEqual({ deleted: true });
  });

  it('should call scenarioService.runScenarioSolver with correct params', async () => {
    const solverResult = { status: 'queued' };
    mockScenarioService.runScenarioSolver.mockResolvedValue(solverResult);

    const result = await controller.runScenarioSolver(TENANT, 'scen-1');

    expect(mockScenarioService.runScenarioSolver).toHaveBeenCalledWith('tenant-uuid', 'scen-1');
    expect(result).toEqual(solverResult);
  });

  it('should call scenarioService.compareScenarios with correct params', async () => {
    const dto = { scenario_ids: ['scen-1', 'scen-2'] };
    const comparison = { differences: [] };
    mockScenarioService.compareScenarios.mockResolvedValue(comparison);

    const result = await controller.compareScenarios(TENANT, dto);

    expect(mockScenarioService.compareScenarios).toHaveBeenCalledWith('tenant-uuid', dto);
    expect(result).toEqual(comparison);
  });

  // ─── Analytics — remaining delegation ──────────────────────────────

  it('should call analyticsService.getWorkloadHeatmap with correct params', async () => {
    const query = { academic_year_id: AY_ID };
    const heatmap = { teachers: [] };
    mockAnalyticsService.getWorkloadHeatmap.mockResolvedValue(heatmap);

    const result = await controller.getWorkloadHeatmap(TENANT, query);

    expect(mockAnalyticsService.getWorkloadHeatmap).toHaveBeenCalledWith('tenant-uuid', query);
    expect(result).toEqual(heatmap);
  });

  it('should call analyticsService.getHistoricalComparison with correct params', async () => {
    const query = { year_id_a: AY_ID, year_id_b: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
    const comparison = { periods: [] };
    mockAnalyticsService.getHistoricalComparison.mockResolvedValue(comparison);

    const result = await controller.getHistoricalComparison(TENANT, query);

    expect(mockAnalyticsService.getHistoricalComparison).toHaveBeenCalledWith('tenant-uuid', query);
    expect(result).toEqual(comparison);
  });
});
