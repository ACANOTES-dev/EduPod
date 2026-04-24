/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import { AdmissionsAnalyticsService } from './admissions-analytics.service';
import { AiPredictionsService } from './ai-predictions.service';
import { AiReportNarratorService } from './ai-report-narrator.service';
import { AttendanceAnalyticsService } from './attendance-analytics.service';
import { BoardReportService } from './board-report.service';
import { ComplianceReportService } from './compliance-report.service';
import { CrossModuleInsightsService } from './cross-module-insights.service';
import { CustomReportBuilderService } from './custom-report-builder.service';
import { DemographicsService } from './demographics.service';
import { GradeAnalyticsService } from './grade-analytics.service';
import { ReportAlertsService } from './report-alerts.service';
import { ReportExportService } from './report-export.service';
import { ReportsEnhancedController } from './reports-enhanced.controller';
import { ScheduledReportsService } from './scheduled-reports.service';
import { StaffAnalyticsService } from './staff-analytics.service';
import { StudentProgressService } from './student-progress.service';
import { UnifiedDashboardService } from './unified-dashboard.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const userPayload = {
  sub: USER_ID,
  email: 'admin@school.com',
  tenant_id: TENANT_ID,
  membership_id: null,
  type: 'access' as const,
  iat: 0,
  exp: 9999999999,
};

const mockUnifiedDashboard = { getKpiDashboard: jest.fn() };
const mockCrossModuleInsights = {
  attendanceVsGrades: jest.fn(),
  costPerStudent: jest.fn(),
  yearGroupHealthScores: jest.fn(),
  teacherEffectivenessIndex: jest.fn(),
};
const mockAttendanceAnalytics = {
  chronicAbsenteeism: jest.fn(),
  dayOfWeekHeatmap: jest.fn(),
  teacherMarkingCompliance: jest.fn(),
  attendanceTrends: jest.fn(),
  excusedVsUnexcused: jest.fn(),
  classComparison: jest.fn(),
};
const mockGradeAnalytics = {
  passFailRates: jest.fn(),
  gradeDistribution: jest.fn(),
  topBottomPerformers: jest.fn(),
  gradeTrends: jest.fn(),
  subjectDifficulty: jest.fn(),
  gpaDistribution: jest.fn(),
};
const mockDemographics = {
  nationalityBreakdown: jest.fn(),
  genderBalance: jest.fn(),
  ageDistribution: jest.fn(),
  yearGroupSizes: jest.fn(),
  enrolmentTrends: jest.fn(),
  statusDistribution: jest.fn(),
};
const mockStudentProgress = { getStudentProgress: jest.fn() };
const mockAdmissionsAnalytics = {
  pipelineFunnel: jest.fn(),
  processingTime: jest.fn(),
  rejectionReasons: jest.fn(),
  monthlyApplications: jest.fn(),
  yearGroupDemand: jest.fn(),
};
const mockStaffAnalytics = {
  headcountByDepartment: jest.fn(),
  staffStudentRatio: jest.fn(),
  tenureDistribution: jest.fn(),
  staffAttendanceRate: jest.fn(),
  qualificationCoverage: jest.fn(),
  compensationDistribution: jest.fn(),
};
const mockCustomReportBuilder = {
  listSavedReports: jest.fn(),
  getSavedReport: jest.fn(),
  createSavedReport: jest.fn(),
  updateSavedReport: jest.fn(),
  deleteSavedReport: jest.fn(),
  executeReport: jest.fn(),
};
const mockBoardReport = {
  listBoardReports: jest.fn(),
  getBoardReport: jest.fn(),
  generateBoardReport: jest.fn(),
  deleteBoardReport: jest.fn(),
};
const mockComplianceReport = {
  listTemplates: jest.fn(),
  getTemplate: jest.fn(),
  createTemplate: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
  autoPopulate: jest.fn(),
};
const mockScheduledReports = {
  list: jest.fn(),
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const mockReportAlerts = {
  list: jest.fn(),
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const mockAiNarrator = { generateNarrative: jest.fn() };
const mockAiPredictions = { predictTrend: jest.fn() };
const mockReportExport = { generateFormattedExcel: jest.fn() };

describe('ReportsEnhancedController', () => {
  let controller: ReportsEnhancedController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsEnhancedController],
      providers: [
        { provide: UnifiedDashboardService, useValue: mockUnifiedDashboard },
        { provide: CrossModuleInsightsService, useValue: mockCrossModuleInsights },
        { provide: AttendanceAnalyticsService, useValue: mockAttendanceAnalytics },
        { provide: GradeAnalyticsService, useValue: mockGradeAnalytics },
        { provide: DemographicsService, useValue: mockDemographics },
        { provide: StudentProgressService, useValue: mockStudentProgress },
        { provide: AdmissionsAnalyticsService, useValue: mockAdmissionsAnalytics },
        { provide: StaffAnalyticsService, useValue: mockStaffAnalytics },
        { provide: CustomReportBuilderService, useValue: mockCustomReportBuilder },
        { provide: BoardReportService, useValue: mockBoardReport },
        { provide: ComplianceReportService, useValue: mockComplianceReport },
        { provide: ScheduledReportsService, useValue: mockScheduledReports },
        { provide: ReportAlertsService, useValue: mockReportAlerts },
        { provide: AiReportNarratorService, useValue: mockAiNarrator },
        { provide: AiPredictionsService, useValue: mockAiPredictions },
        { provide: ReportExportService, useValue: mockReportExport },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReportsEnhancedController>(ReportsEnhancedController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── KPI Dashboard ────────────────────────────────────────────────────────

  it('should call unifiedDashboard.getKpiDashboard with tenant_id', async () => {
    const kpiData = { total_students: 100 };
    mockUnifiedDashboard.getKpiDashboard.mockResolvedValue(kpiData);

    const result = await controller.kpiDashboard(tenantContext);

    expect(mockUnifiedDashboard.getKpiDashboard).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual(kpiData);
  });

  // ─── Staff Analytics ──────────────────────────────────────────────────────

  it('should call staffAnalytics.staffStudentRatio with tenant_id', async () => {
    const ratioData = {
      active_staff: 10,
      active_students: 200,
      ratio: '1:20',
      students_per_teacher: 20,
    };
    mockStaffAnalytics.staffStudentRatio.mockResolvedValue(ratioData);

    const result = await controller.staffStudentRatio(tenantContext);

    expect(mockStaffAnalytics.staffStudentRatio).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual(ratioData);
  });

  it('should call staffAnalytics.headcountByDepartment with tenant_id', async () => {
    const headcountData = [{ department: 'Science', count: 5, active_count: 4 }];
    mockStaffAnalytics.headcountByDepartment.mockResolvedValue(headcountData);

    const result = await controller.staffHeadcount(tenantContext);

    expect(mockStaffAnalytics.headcountByDepartment).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual(headcountData);
  });

  // ─── Student Progress ─────────────────────────────────────────────────────

  it('should call studentProgress.getStudentProgress with tenant_id and student_id', async () => {
    const progressData = { student_id: 'stu-1', student_name: 'Alice', overall_progress_score: 85 };
    mockStudentProgress.getStudentProgress.mockResolvedValue(progressData);

    const result = await controller.getStudentProgress(tenantContext, { student_id: 'stu-1' });

    expect(mockStudentProgress.getStudentProgress).toHaveBeenCalledWith(TENANT_ID, 'stu-1');
    expect(result).toEqual(progressData);
  });

  // ─── Report Alerts ────────────────────────────────────────────────────────

  it('should call reportAlerts.list with pagination parameters', async () => {
    const listData = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockReportAlerts.list.mockResolvedValue(listData);

    const result = await controller.listReportAlerts(tenantContext, { page: 1, pageSize: 20 });

    expect(mockReportAlerts.list).toHaveBeenCalledWith(TENANT_ID, 1, 20);
    expect(result).toEqual(listData);
  });

  it('should call reportAlerts.create with tenant, user and dto', async () => {
    const alertRow = { id: 'alert-1', name: 'Test Alert' };
    mockReportAlerts.create.mockResolvedValue(alertRow);

    const body = {
      name: 'Test Alert',
      metric: 'attendance_rate' as const,
      operator: 'lt' as const,
      threshold: 80,
      check_frequency: 'daily' as const,
      notification_recipients_json: [] as string[],
      active: true,
    };

    const result = await controller.createReportAlert(tenantContext, userPayload, body);

    expect(mockReportAlerts.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, body);
    expect(result).toEqual(alertRow);
  });

  // ─── AI Endpoints ─────────────────────────────────────────────────────────

  it('should call aiNarrator.generateNarrative and return narrative string', async () => {
    mockAiNarrator.generateNarrative.mockResolvedValue('Attendance is improving.');

    const body = { data: { attendance_rate: 85 }, report_type: 'attendance' };
    const result = await controller.aiNarrate(tenantContext, body);

    expect(mockAiNarrator.generateNarrative).toHaveBeenCalledWith(
      TENANT_ID,
      { attendance_rate: 85 },
      'attendance',
    );
    expect(result).toBe('Attendance is improving.');
  });

  it('should call aiPredictions.predictTrend with historical data and report type', async () => {
    const prediction = { expected: [80, 82], confidence: 'high', periods_ahead: 3 };
    mockAiPredictions.predictTrend.mockResolvedValue(prediction);

    const body = { historical_data: [{ period: '2026-01', value: 78 }], report_type: 'attendance' };
    const result = await controller.aiPredict(tenantContext, body);

    expect(mockAiPredictions.predictTrend).toHaveBeenCalledWith(
      TENANT_ID,
      body.historical_data,
      'attendance',
    );
    expect(result).toEqual(prediction);
  });

  // ─── Custom Report Builder ────────────────────────────────────────────────

  it('should call customReportBuilder.listSavedReports with all required args', async () => {
    const listData = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockCustomReportBuilder.listSavedReports.mockResolvedValue(listData);

    const result = await controller.listSavedReports(tenantContext, userPayload, {
      include_shared: true,
      page: 1,
      pageSize: 20,
    });

    expect(mockCustomReportBuilder.listSavedReports).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      true,
      1,
      20,
    );
    expect(result).toEqual(listData);
  });

  // ─── Compliance ───────────────────────────────────────────────────────────

  it('should call complianceReport.listTemplates with tenant_id', async () => {
    const templates = [{ id: 'tmpl-1', name: 'Ireland DES' }];
    mockComplianceReport.listTemplates.mockResolvedValue(templates);

    const result = await controller.listComplianceTemplates(tenantContext);

    expect(mockComplianceReport.listTemplates).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual(templates);
  });

  // ─── Demographics ─────────────────────────────────────────────────────────

  it('should call demographics.genderBalance with tenant_id', async () => {
    const genderData = [{ gender: 'male', count: 60, percentage: 60 }];
    mockDemographics.genderBalance.mockResolvedValue(genderData);

    const result = await controller.genderBalance(tenantContext);

    expect(mockDemographics.genderBalance).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual(genderData);
  });

  // ─── Board Reports ────────────────────────────────────────────────────────

  it('should call boardReport.listBoardReports with pagination', async () => {
    const boardList = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockBoardReport.listBoardReports.mockResolvedValue(boardList);

    const result = await controller.listBoardReports(tenantContext, { page: 1, pageSize: 20 });

    expect(mockBoardReport.listBoardReports).toHaveBeenCalledWith(TENANT_ID, 1, 20);
    expect(result).toEqual(boardList);
  });

  // ─── Cross-Module Insights ────────────────────────────────────────────

  it('should call crossModuleInsights.attendanceVsGrades', async () => {
    mockCrossModuleInsights.attendanceVsGrades.mockResolvedValue([]);

    const result = await controller.attendanceVsGrades(tenantContext, {
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });

    expect(mockCrossModuleInsights.attendanceVsGrades).toHaveBeenCalledWith(
      TENANT_ID,
      '2025-01-01',
      '2025-12-31',
    );
    expect(result).toEqual([]);
  });

  it('should call crossModuleInsights.costPerStudent', async () => {
    mockCrossModuleInsights.costPerStudent.mockResolvedValue({ cost: 5000 });

    const result = await controller.costPerStudent(tenantContext);

    expect(mockCrossModuleInsights.costPerStudent).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({ cost: 5000 });
  });

  it('should call crossModuleInsights.yearGroupHealthScores', async () => {
    mockCrossModuleInsights.yearGroupHealthScores.mockResolvedValue([]);

    const result = await controller.yearGroupHealth(tenantContext);

    expect(mockCrossModuleInsights.yearGroupHealthScores).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual([]);
  });

  it('should call crossModuleInsights.teacherEffectivenessIndex', async () => {
    mockCrossModuleInsights.teacherEffectivenessIndex.mockResolvedValue([]);

    const result = await controller.teacherEffectiveness(tenantContext);

    expect(mockCrossModuleInsights.teacherEffectivenessIndex).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual([]);
  });

  // ─── Attendance Analytics ─────────────────────────────────────────────

  it('should call attendanceAnalytics.chronicAbsenteeism', async () => {
    mockAttendanceAnalytics.chronicAbsenteeism.mockResolvedValue([]);

    const result = await controller.chronicAbsenteeism(tenantContext, {
      threshold: 20,
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });

    expect(mockAttendanceAnalytics.chronicAbsenteeism).toHaveBeenCalledWith(
      TENANT_ID,
      20,
      '2025-01-01',
      '2025-12-31',
    );
    expect(result).toEqual([]);
  });

  it('should call attendanceAnalytics.dayOfWeekHeatmap', async () => {
    mockAttendanceAnalytics.dayOfWeekHeatmap.mockResolvedValue([]);

    const result = await controller.dayOfWeekHeatmap(tenantContext, {
      start_date: '2025-01-01',
      end_date: '2025-12-31',
      threshold: 85,
    });

    expect(mockAttendanceAnalytics.dayOfWeekHeatmap).toHaveBeenCalledWith(
      TENANT_ID,
      '2025-01-01',
      '2025-12-31',
    );
    expect(result).toEqual([]);
  });

  it('should call attendanceAnalytics.teacherMarkingCompliance', async () => {
    mockAttendanceAnalytics.teacherMarkingCompliance.mockResolvedValue([]);

    const result = await controller.teacherMarkingCompliance(tenantContext);

    expect(mockAttendanceAnalytics.teacherMarkingCompliance).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual([]);
  });

  it('should call attendanceAnalytics.attendanceTrends', async () => {
    mockAttendanceAnalytics.attendanceTrends.mockResolvedValue([]);

    const result = await controller.attendanceTrends(tenantContext, {
      start_date: '2025-01-01',
      end_date: '2025-12-31',
      threshold: 85,
    });

    expect(mockAttendanceAnalytics.attendanceTrends).toHaveBeenCalledWith(
      TENANT_ID,
      '2025-01-01',
      '2025-12-31',
    );
    expect(result).toEqual([]);
  });

  it('should call attendanceAnalytics.excusedVsUnexcused', async () => {
    mockAttendanceAnalytics.excusedVsUnexcused.mockResolvedValue([]);

    const result = await controller.excusedVsUnexcused(tenantContext, {
      start_date: '2025-01-01',
      end_date: '2025-12-31',
      year_group_id: 'yg-1',
      threshold: 85,
    });

    expect(mockAttendanceAnalytics.excusedVsUnexcused).toHaveBeenCalledWith(
      TENANT_ID,
      '2025-01-01',
      '2025-12-31',
      'yg-1',
    );
    expect(result).toEqual([]);
  });

  it('should call attendanceAnalytics.classComparison', async () => {
    mockAttendanceAnalytics.classComparison.mockResolvedValue([]);

    const result = await controller.classComparison(tenantContext, 'yg-uuid', {
      start_date: '2025-01-01',
      end_date: '2025-12-31',
      threshold: 85,
    });

    expect(mockAttendanceAnalytics.classComparison).toHaveBeenCalledWith(
      TENANT_ID,
      'yg-uuid',
      '2025-01-01',
      '2025-12-31',
    );
    expect(result).toEqual([]);
  });

  // ─── Grade Analytics ──────────────────────────────────────────────────

  it('should call gradeAnalytics.passFailRates', async () => {
    mockGradeAnalytics.passFailRates.mockResolvedValue({});

    const result = await controller.passFailRates(tenantContext, {});

    expect(mockGradeAnalytics.passFailRates).toHaveBeenCalledWith(
      TENANT_ID,
      undefined,
      undefined,
      undefined,
    );
    expect(result).toEqual({});
  });

  it('should call gradeAnalytics.gradeDistribution', async () => {
    mockGradeAnalytics.gradeDistribution.mockResolvedValue([]);

    const result = await controller.gradeDistribution(tenantContext, {
      year_group_id: 'yg-1',
      subject_id: 'sub-1',
      academic_period_id: 'ap-1',
    });

    expect(mockGradeAnalytics.gradeDistribution).toHaveBeenCalledWith(
      TENANT_ID,
      'yg-1',
      'sub-1',
      'ap-1',
    );
    expect(result).toEqual([]);
  });

  it('should call gradeAnalytics.topBottomPerformers', async () => {
    mockGradeAnalytics.topBottomPerformers.mockResolvedValue([]);

    const result = await controller.topBottomPerformers(tenantContext, {
      year_group_id: 'yg-1',
      subject_id: 'sub-1',
    });

    expect(mockGradeAnalytics.topBottomPerformers).toHaveBeenCalledWith(
      TENANT_ID,
      10,
      'yg-1',
      'sub-1',
    );
    expect(result).toEqual([]);
  });

  it('should call gradeAnalytics.gradeTrends', async () => {
    mockGradeAnalytics.gradeTrends.mockResolvedValue([]);

    const result = await controller.gradeTrends(tenantContext, {
      year_group_id: 'yg-1',
      subject_id: 'sub-1',
    });

    expect(mockGradeAnalytics.gradeTrends).toHaveBeenCalledWith(TENANT_ID, 'yg-1', 'sub-1');
    expect(result).toEqual([]);
  });

  it('should call gradeAnalytics.subjectDifficulty', async () => {
    mockGradeAnalytics.subjectDifficulty.mockResolvedValue([]);

    const result = await controller.subjectDifficulty(tenantContext, { year_group_id: 'yg-1' });

    expect(mockGradeAnalytics.subjectDifficulty).toHaveBeenCalledWith(TENANT_ID, 'yg-1');
    expect(result).toEqual([]);
  });

  it('should call gradeAnalytics.gpaDistribution', async () => {
    mockGradeAnalytics.gpaDistribution.mockResolvedValue([]);

    const result = await controller.gpaDistribution(tenantContext, { year_group_id: 'yg-1' });

    expect(mockGradeAnalytics.gpaDistribution).toHaveBeenCalledWith(TENANT_ID, 'yg-1');
    expect(result).toEqual([]);
  });

  // ─── Demographics ─────────────────────────────────────────────────────

  it('should call demographics.nationalityBreakdown', async () => {
    mockDemographics.nationalityBreakdown.mockResolvedValue([]);

    const result = await controller.nationalityBreakdown(tenantContext, { year_group_id: 'yg-1' });

    expect(mockDemographics.nationalityBreakdown).toHaveBeenCalledWith(TENANT_ID, 'yg-1');
    expect(result).toEqual([]);
  });

  it('should call demographics.ageDistribution', async () => {
    mockDemographics.ageDistribution.mockResolvedValue([]);

    const result = await controller.ageDistribution(tenantContext, {});

    expect(mockDemographics.ageDistribution).toHaveBeenCalledWith(TENANT_ID, undefined);
    expect(result).toEqual([]);
  });

  it('should call demographics.yearGroupSizes', async () => {
    mockDemographics.yearGroupSizes.mockResolvedValue([]);

    const result = await controller.yearGroupSizes(tenantContext);

    expect(mockDemographics.yearGroupSizes).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual([]);
  });

  it('should call demographics.enrolmentTrends', async () => {
    mockDemographics.enrolmentTrends.mockResolvedValue([]);

    const result = await controller.enrolmentTrends(tenantContext);

    expect(mockDemographics.enrolmentTrends).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual([]);
  });

  it('should call demographics.statusDistribution', async () => {
    mockDemographics.statusDistribution.mockResolvedValue([]);

    const result = await controller.statusDistribution(tenantContext);

    expect(mockDemographics.statusDistribution).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual([]);
  });

  // ─── Admissions Analytics ─────────────────────────────────────────────

  it('should call admissionsAnalytics.pipelineFunnel', async () => {
    mockAdmissionsAnalytics.pipelineFunnel.mockResolvedValue({});

    const result = await controller.admissionsFunnel(tenantContext, {
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });

    expect(mockAdmissionsAnalytics.pipelineFunnel).toHaveBeenCalledWith(
      TENANT_ID,
      '2025-01-01',
      '2025-12-31',
    );
    expect(result).toEqual({});
  });

  it('should call admissionsAnalytics.processingTime', async () => {
    mockAdmissionsAnalytics.processingTime.mockResolvedValue({});

    const result = await controller.admissionsProcessingTime(tenantContext, {
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });

    expect(mockAdmissionsAnalytics.processingTime).toHaveBeenCalledWith(
      TENANT_ID,
      '2025-01-01',
      '2025-12-31',
    );
    expect(result).toEqual({});
  });

  it('should call admissionsAnalytics.rejectionReasons', async () => {
    mockAdmissionsAnalytics.rejectionReasons.mockResolvedValue([]);

    const result = await controller.rejectionReasons(tenantContext, {
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });

    expect(mockAdmissionsAnalytics.rejectionReasons).toHaveBeenCalledWith(
      TENANT_ID,
      '2025-01-01',
      '2025-12-31',
    );
    expect(result).toEqual([]);
  });

  it('should call admissionsAnalytics.monthlyApplications', async () => {
    mockAdmissionsAnalytics.monthlyApplications.mockResolvedValue([]);

    const result = await controller.monthlyApplications(tenantContext, {
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });

    expect(mockAdmissionsAnalytics.monthlyApplications).toHaveBeenCalledWith(
      TENANT_ID,
      '2025-01-01',
      '2025-12-31',
    );
    expect(result).toEqual([]);
  });

  it('should call admissionsAnalytics.yearGroupDemand', async () => {
    mockAdmissionsAnalytics.yearGroupDemand.mockResolvedValue([]);

    const result = await controller.yearGroupDemand(tenantContext, {
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });

    expect(mockAdmissionsAnalytics.yearGroupDemand).toHaveBeenCalledWith(
      TENANT_ID,
      '2025-01-01',
      '2025-12-31',
    );
    expect(result).toEqual([]);
  });

  // ─── Staff Analytics (remaining endpoints) ───────────────────────────

  it('should call staffAnalytics.tenureDistribution', async () => {
    mockStaffAnalytics.tenureDistribution.mockResolvedValue([]);

    const result = await controller.tenureDistribution(tenantContext);

    expect(mockStaffAnalytics.tenureDistribution).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual([]);
  });

  it('should call staffAnalytics.staffAttendanceRate', async () => {
    mockStaffAnalytics.staffAttendanceRate.mockResolvedValue({});

    const result = await controller.staffAttendanceRate(tenantContext);

    expect(mockStaffAnalytics.staffAttendanceRate).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({});
  });

  it('should call staffAnalytics.qualificationCoverage', async () => {
    mockStaffAnalytics.qualificationCoverage.mockResolvedValue([]);

    const result = await controller.qualificationCoverage(tenantContext);

    expect(mockStaffAnalytics.qualificationCoverage).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual([]);
  });

  it('should call staffAnalytics.compensationDistribution', async () => {
    mockStaffAnalytics.compensationDistribution.mockResolvedValue([]);

    const result = await controller.compensationDistribution(tenantContext);

    expect(mockStaffAnalytics.compensationDistribution).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual([]);
  });

  // ─── Custom Report Builder (remaining endpoints) ─────────────────────

  it('should call customReportBuilder.getSavedReport', async () => {
    mockCustomReportBuilder.getSavedReport.mockResolvedValue({ id: 'r-1' });

    const result = await controller.getSavedReport(tenantContext, 'r-1');

    expect(mockCustomReportBuilder.getSavedReport).toHaveBeenCalledWith(TENANT_ID, 'r-1');
    expect(result).toEqual({ id: 'r-1' });
  });

  it('should call customReportBuilder.createSavedReport', async () => {
    mockCustomReportBuilder.createSavedReport.mockResolvedValue({ id: 'r-1' });

    const body = {
      name: 'My Report',
      data_source: 'students' as const,
      dimensions_json: ['year_group_id'],
      measures_json: [{ field: 'id', aggregation: 'count' as const }],
      filters_json: {} as Record<string, unknown>,
      is_shared: false,
    };
    const result = await controller.createSavedReport(tenantContext, userPayload, body);

    expect(mockCustomReportBuilder.createSavedReport).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      body,
    );
    expect(result).toEqual({ id: 'r-1' });
  });

  it('should call customReportBuilder.updateSavedReport', async () => {
    mockCustomReportBuilder.updateSavedReport.mockResolvedValue({ id: 'r-1' });

    const body = { name: 'Updated Report' };
    const result = await controller.updateSavedReport(tenantContext, 'r-1', body);

    expect(mockCustomReportBuilder.updateSavedReport).toHaveBeenCalledWith(TENANT_ID, 'r-1', body);
    expect(result).toEqual({ id: 'r-1' });
  });

  it('should call customReportBuilder.deleteSavedReport', async () => {
    mockCustomReportBuilder.deleteSavedReport.mockResolvedValue(undefined);

    await controller.deleteSavedReport(tenantContext, 'r-1');

    expect(mockCustomReportBuilder.deleteSavedReport).toHaveBeenCalledWith(TENANT_ID, 'r-1');
  });

  it('should call customReportBuilder.executeReport', async () => {
    mockCustomReportBuilder.executeReport.mockResolvedValue({ data: [], meta: {} });

    const result = await controller.executeReport(tenantContext, 'r-1', {
      page: 2,
      pageSize: 10,
    });

    expect(mockCustomReportBuilder.executeReport).toHaveBeenCalledWith(TENANT_ID, 'r-1', 2, 10);
    expect(result).toEqual({ data: [], meta: {} });
  });

  // ─── Board Reports (remaining endpoints) ─────────────────────────────

  it('should call boardReport.getBoardReport', async () => {
    mockBoardReport.getBoardReport.mockResolvedValue({ id: 'br-1' });

    const result = await controller.getBoardReport(tenantContext, 'br-1');

    expect(mockBoardReport.getBoardReport).toHaveBeenCalledWith(TENANT_ID, 'br-1');
    expect(result).toEqual({ id: 'br-1' });
  });

  it('should call boardReport.generateBoardReport', async () => {
    mockBoardReport.generateBoardReport.mockResolvedValue({ id: 'br-1' });

    const body = {
      title: 'Q1 Board Report',
      report_type: 'termly' as const,
      sections_json: [],
    };
    const result = await controller.generateBoardReport(tenantContext, userPayload, body);

    expect(mockBoardReport.generateBoardReport).toHaveBeenCalledWith(TENANT_ID, USER_ID, body);
    expect(result).toEqual({ id: 'br-1' });
  });

  it('should call boardReport.deleteBoardReport', async () => {
    mockBoardReport.deleteBoardReport.mockResolvedValue(undefined);

    await controller.deleteBoardReport(tenantContext, 'br-1');

    expect(mockBoardReport.deleteBoardReport).toHaveBeenCalledWith(TENANT_ID, 'br-1');
  });

  // ─── Compliance (remaining endpoints) ─────────────────────────────────

  it('should call complianceReport.getTemplate', async () => {
    mockComplianceReport.getTemplate.mockResolvedValue({ id: 'tmpl-1' });

    const result = await controller.getComplianceTemplate(tenantContext, 'tmpl-1');

    expect(mockComplianceReport.getTemplate).toHaveBeenCalledWith(TENANT_ID, 'tmpl-1');
    expect(result).toEqual({ id: 'tmpl-1' });
  });

  it('should call complianceReport.createTemplate', async () => {
    mockComplianceReport.createTemplate.mockResolvedValue({ id: 'tmpl-1' });

    const body = {
      name: 'DES Ireland',
      country_code: 'IE',
      fields_json: [{ key: 'student_name', label: 'Student Name', data_type: 'string' }],
    };
    const result = await controller.createComplianceTemplate(tenantContext, body);

    expect(mockComplianceReport.createTemplate).toHaveBeenCalledWith(TENANT_ID, body);
    expect(result).toEqual({ id: 'tmpl-1' });
  });

  it('should call complianceReport.updateTemplate', async () => {
    mockComplianceReport.updateTemplate.mockResolvedValue({ id: 'tmpl-1' });

    const body = { name: 'Updated Template' };
    const result = await controller.updateComplianceTemplate(tenantContext, 'tmpl-1', body);

    expect(mockComplianceReport.updateTemplate).toHaveBeenCalledWith(TENANT_ID, 'tmpl-1', body);
    expect(result).toEqual({ id: 'tmpl-1' });
  });

  it('should call complianceReport.deleteTemplate', async () => {
    mockComplianceReport.deleteTemplate.mockResolvedValue(undefined);

    await controller.deleteComplianceTemplate(tenantContext, 'tmpl-1');

    expect(mockComplianceReport.deleteTemplate).toHaveBeenCalledWith(TENANT_ID, 'tmpl-1');
  });

  it('should call complianceReport.autoPopulate', async () => {
    mockComplianceReport.autoPopulate.mockResolvedValue({ populated: true });

    const result = await controller.populateComplianceReport(tenantContext, 'tmpl-1');

    expect(mockComplianceReport.autoPopulate).toHaveBeenCalledWith(TENANT_ID, 'tmpl-1');
    expect(result).toEqual({ populated: true });
  });

  // ─── Scheduled Reports (remaining endpoints) ─────────────────────────

  it('should call scheduledReports.get', async () => {
    mockScheduledReports.get.mockResolvedValue({ id: 'sr-1' });

    const result = await controller.getScheduledReport(tenantContext, 'sr-1');

    expect(mockScheduledReports.get).toHaveBeenCalledWith(TENANT_ID, 'sr-1');
    expect(result).toEqual({ id: 'sr-1' });
  });

  it('should call scheduledReports.create', async () => {
    mockScheduledReports.create.mockResolvedValue({ id: 'sr-1' });

    const body = {
      name: 'Weekly Report',
      report_type: 'attendance_summary',
      parameters_json: {} as Record<string, unknown>,
      schedule_cron: '0 9 * * 1',
      recipient_emails: ['admin@school.com'],
      format: 'pdf' as const,
      active: true,
    };
    const result = await controller.createScheduledReport(tenantContext, userPayload, body);

    expect(mockScheduledReports.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, body);
    expect(result).toEqual({ id: 'sr-1' });
  });

  it('should call scheduledReports.update', async () => {
    mockScheduledReports.update.mockResolvedValue({ id: 'sr-1' });

    const body = { name: 'Updated Schedule' };
    const result = await controller.updateScheduledReport(tenantContext, 'sr-1', body);

    expect(mockScheduledReports.update).toHaveBeenCalledWith(TENANT_ID, 'sr-1', body);
    expect(result).toEqual({ id: 'sr-1' });
  });

  it('should call scheduledReports.delete', async () => {
    mockScheduledReports.delete.mockResolvedValue(undefined);

    await controller.deleteScheduledReport(tenantContext, 'sr-1');

    expect(mockScheduledReports.delete).toHaveBeenCalledWith(TENANT_ID, 'sr-1');
  });

  it('should call scheduledReports.list', async () => {
    mockScheduledReports.list.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });

    const result = await controller.listScheduledReports(tenantContext, { page: 1, pageSize: 20 });

    expect(mockScheduledReports.list).toHaveBeenCalledWith(TENANT_ID, 1, 20);
    expect(result).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
  });

  // ─── Report Alerts (remaining endpoints) ──────────────────────────────

  it('should call reportAlerts.get', async () => {
    mockReportAlerts.get.mockResolvedValue({ id: 'alert-1' });

    const result = await controller.getReportAlert(tenantContext, 'alert-1');

    expect(mockReportAlerts.get).toHaveBeenCalledWith(TENANT_ID, 'alert-1');
    expect(result).toEqual({ id: 'alert-1' });
  });

  it('should call reportAlerts.update', async () => {
    mockReportAlerts.update.mockResolvedValue({ id: 'alert-1' });

    const body = { name: 'Updated Alert' };
    const result = await controller.updateReportAlert(tenantContext, 'alert-1', body);

    expect(mockReportAlerts.update).toHaveBeenCalledWith(TENANT_ID, 'alert-1', body);
    expect(result).toEqual({ id: 'alert-1' });
  });

  it('should call reportAlerts.delete', async () => {
    mockReportAlerts.delete.mockResolvedValue(undefined);

    await controller.deleteReportAlert(tenantContext, 'alert-1');

    expect(mockReportAlerts.delete).toHaveBeenCalledWith(TENANT_ID, 'alert-1');
  });

  // ─── Export ───────────────────────────────────────────────────────────

  it('should call reportExport.generateFormattedExcel with body data and config', async () => {
    const buffer = Buffer.from('xlsx-content');
    mockReportExport.generateFormattedExcel.mockResolvedValue(buffer);

    const body = {
      data: [{ name: 'Alice', score: 90 }],
      config: { title: 'Student Report', school_name: 'Test School', date_range: '2025 Q1' },
    };
    const result = await controller.exportExcel({ format: 'xlsx' }, body);

    expect(mockReportExport.generateFormattedExcel).toHaveBeenCalledWith(body.data, body.config);
    expect(result).toEqual(buffer);
  });
});
