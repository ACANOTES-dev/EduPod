/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload } from '@school/shared';
import type { TenantContext } from '@school/shared';

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
});
