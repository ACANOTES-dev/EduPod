/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourAIService } from './behaviour-ai.service';
import { BehaviourAnalyticsController } from './behaviour-analytics.controller';
import { BehaviourAnalyticsService } from './behaviour-analytics.service';
import { BehaviourPulseService } from './behaviour-pulse.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  tenant_id: TENANT_ID,
  email: 'admin@test.com',
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

const PERMISSIONS = ['behaviour.view', 'behaviour.manage'];
const QUERY = { date_from: '2026-01-01', date_to: '2026-03-31' };

const mockAnalyticsService = {
  getOverview: jest.fn(),
  getHeatmap: jest.fn(),
  getHistoricalHeatmap: jest.fn(),
  getTrends: jest.fn(),
  getCategories: jest.fn(),
  getSubjects: jest.fn(),
  getStaffActivity: jest.fn(),
  getSanctions: jest.fn(),
  getInterventionOutcomes: jest.fn(),
  getRatio: jest.fn(),
  getComparisons: jest.fn(),
  getPolicyEffectiveness: jest.fn(),
  getTaskCompletion: jest.fn(),
  getBenchmarks: jest.fn(),
  getTeacherAnalytics: jest.fn(),
  getClassComparisons: jest.fn(),
  exportCsv: jest.fn(),
};

const mockPulseService = {
  getPulse: jest.fn(),
};

const mockAIService = {
  processNLQuery: jest.fn(),
  getQueryHistory: jest.fn(),
};

const mockPermissionCacheService = {
  getPermissions: jest.fn(),
};

const mockPrisma = {
  tenantSetting: {
    findFirst: jest.fn(),
  },
};

describe('BehaviourAnalyticsController', () => {
  let controller: BehaviourAnalyticsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourAnalyticsController],
      providers: [
        { provide: BehaviourAnalyticsService, useValue: mockAnalyticsService },
        { provide: BehaviourPulseService, useValue: mockPulseService },
        { provide: BehaviourAIService, useValue: mockAIService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/module-enabled.guard').ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BehaviourAnalyticsController>(BehaviourAnalyticsController);
    mockPermissionCacheService.getPermissions.mockResolvedValue(PERMISSIONS);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Pulse ────────────────────────────────────────────────────────────────

  it('should call pulseService.getPulse when pulse is enabled', async () => {
    mockPrisma.tenantSetting.findFirst.mockResolvedValue({
      settings: { behaviour: { behaviour_pulse_enabled: true } },
    });
    mockPulseService.getPulse.mockResolvedValue({ score: 85 });

    const result = await controller.getPulse(TENANT);

    expect(mockPulseService.getPulse).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({ score: 85 });
  });

  it('should return pulse_enabled false when pulse is disabled', async () => {
    mockPrisma.tenantSetting.findFirst.mockResolvedValue({
      settings: { behaviour: { behaviour_pulse_enabled: false } },
    });

    const result = await controller.getPulse(TENANT);

    expect(mockPulseService.getPulse).not.toHaveBeenCalled();
    expect(result).toEqual({ pulse_enabled: false });
  });

  // ─── Overview ─────────────────────────────────────────────────────────────

  it('should call analyticsService.getOverview with tenant_id, user_id, permissions, query', async () => {
    mockAnalyticsService.getOverview.mockResolvedValue({ total: 100 });

    const result = await controller.getOverview(TENANT, USER, QUERY as never);

    expect(mockAnalyticsService.getOverview).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      PERMISSIONS,
      QUERY,
    );
    expect(result).toEqual({ total: 100 });
  });

  // ─── Heatmap ──────────────────────────────────────────────────────────────

  it('should call analyticsService.getHeatmap with tenant_id, user_id, permissions, query', async () => {
    mockAnalyticsService.getHeatmap.mockResolvedValue({ cells: [] });

    const result = await controller.getHeatmap(TENANT, USER, QUERY as never);

    expect(mockAnalyticsService.getHeatmap).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      PERMISSIONS,
      QUERY,
    );
    expect(result).toEqual({ cells: [] });
  });

  it('should call analyticsService.getHistoricalHeatmap with tenant_id, user_id, permissions, query', async () => {
    mockAnalyticsService.getHistoricalHeatmap.mockResolvedValue({ periods: [] });

    const result = await controller.getHistoricalHeatmap(TENANT, USER, QUERY as never);

    expect(mockAnalyticsService.getHistoricalHeatmap).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      PERMISSIONS,
      QUERY,
    );
    expect(result).toEqual({ periods: [] });
  });

  // ─── Trends ───────────────────────────────────────────────────────────────

  it('should call analyticsService.getTrends with tenant_id, user_id, permissions, query', async () => {
    mockAnalyticsService.getTrends.mockResolvedValue({ series: [] });

    const result = await controller.getTrends(TENANT, USER, QUERY as never);

    expect(mockAnalyticsService.getTrends).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      PERMISSIONS,
      QUERY,
    );
    expect(result).toEqual({ series: [] });
  });

  // ─── Categories ───────────────────────────────────────────────────────────

  it('should call analyticsService.getCategories with tenant_id, user_id, permissions, query', async () => {
    mockAnalyticsService.getCategories.mockResolvedValue({ categories: [] });

    const result = await controller.getCategories(TENANT, USER, QUERY as never);

    expect(mockAnalyticsService.getCategories).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      PERMISSIONS,
      QUERY,
    );
    expect(result).toEqual({ categories: [] });
  });

  // ─── Subjects ─────────────────────────────────────────────────────────────

  it('should call analyticsService.getSubjects with tenant_id, user_id, permissions, query', async () => {
    mockAnalyticsService.getSubjects.mockResolvedValue({ subjects: [] });

    const result = await controller.getSubjects(TENANT, USER, QUERY as never);

    expect(mockAnalyticsService.getSubjects).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      PERMISSIONS,
      QUERY,
    );
    expect(result).toEqual({ subjects: [] });
  });

  // ─── Staff Activity ──────────────────────────────────────────────────────

  it('should call analyticsService.getStaffActivity with tenant_id and query', async () => {
    mockAnalyticsService.getStaffActivity.mockResolvedValue({ staff: [] });

    const result = await controller.getStaffActivity(TENANT, QUERY as never);

    expect(mockAnalyticsService.getStaffActivity).toHaveBeenCalledWith(TENANT_ID, QUERY);
    expect(result).toEqual({ staff: [] });
  });

  // ─── Sanctions ────────────────────────────────────────────────────────────

  it('should call analyticsService.getSanctions with tenant_id, user_id, permissions, query', async () => {
    mockAnalyticsService.getSanctions.mockResolvedValue({ sanctions: [] });

    const result = await controller.getSanctions(TENANT, USER, QUERY as never);

    expect(mockAnalyticsService.getSanctions).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      PERMISSIONS,
      QUERY,
    );
    expect(result).toEqual({ sanctions: [] });
  });

  // ─── Interventions ───────────────────────────────────────────────────────

  it('should call analyticsService.getInterventionOutcomes with tenant_id and query', async () => {
    mockAnalyticsService.getInterventionOutcomes.mockResolvedValue({ outcomes: [] });

    const result = await controller.getInterventionOutcomes(TENANT, QUERY as never);

    expect(mockAnalyticsService.getInterventionOutcomes).toHaveBeenCalledWith(TENANT_ID, QUERY);
    expect(result).toEqual({ outcomes: [] });
  });

  // ─── Ratio ────────────────────────────────────────────────────────────────

  it('should call analyticsService.getRatio with tenant_id, user_id, permissions, query', async () => {
    mockAnalyticsService.getRatio.mockResolvedValue({ positive: 60, negative: 40 });

    const result = await controller.getRatio(TENANT, USER, QUERY as never);

    expect(mockAnalyticsService.getRatio).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      PERMISSIONS,
      QUERY,
    );
    expect(result).toEqual({ positive: 60, negative: 40 });
  });

  // ─── Comparisons ─────────────────────────────────────────────────────────

  it('should call analyticsService.getComparisons with tenant_id, user_id, permissions, query', async () => {
    mockAnalyticsService.getComparisons.mockResolvedValue({ comparisons: [] });

    const result = await controller.getComparisons(TENANT, USER, QUERY as never);

    expect(mockAnalyticsService.getComparisons).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      PERMISSIONS,
      QUERY,
    );
    expect(result).toEqual({ comparisons: [] });
  });

  // ─── Policy Effectiveness ─────────────────────────────────────────────────

  it('should call analyticsService.getPolicyEffectiveness with tenant_id and query', async () => {
    mockAnalyticsService.getPolicyEffectiveness.mockResolvedValue({ effectiveness: [] });

    const result = await controller.getPolicyEffectiveness(TENANT, QUERY as never);

    expect(mockAnalyticsService.getPolicyEffectiveness).toHaveBeenCalledWith(TENANT_ID, QUERY);
    expect(result).toEqual({ effectiveness: [] });
  });

  // ─── Task Completion ──────────────────────────────────────────────────────

  it('should call analyticsService.getTaskCompletion with tenant_id and query', async () => {
    mockAnalyticsService.getTaskCompletion.mockResolvedValue({ completion_rate: 0.85 });

    const result = await controller.getTaskCompletion(TENANT, QUERY as never);

    expect(mockAnalyticsService.getTaskCompletion).toHaveBeenCalledWith(TENANT_ID, QUERY);
    expect(result).toEqual({ completion_rate: 0.85 });
  });

  // ─── Benchmarks ───────────────────────────────────────────────────────────

  it('should call analyticsService.getBenchmarks with tenant_id and query', async () => {
    const benchmarkQuery = { metric: 'incidents_per_student' };
    mockAnalyticsService.getBenchmarks.mockResolvedValue({ benchmarks: [] });

    const result = await controller.getBenchmarks(TENANT, benchmarkQuery as never);

    expect(mockAnalyticsService.getBenchmarks).toHaveBeenCalledWith(TENANT_ID, benchmarkQuery);
    expect(result).toEqual({ benchmarks: [] });
  });

  // ─── Teacher Analytics ────────────────────────────────────────────────────

  it('should call analyticsService.getTeacherAnalytics with tenant_id and query', async () => {
    mockAnalyticsService.getTeacherAnalytics.mockResolvedValue({ teachers: [] });

    const result = await controller.getTeacherAnalytics(TENANT, QUERY as never);

    expect(mockAnalyticsService.getTeacherAnalytics).toHaveBeenCalledWith(TENANT_ID, QUERY);
    expect(result).toEqual({ teachers: [] });
  });

  // ─── Class Comparisons ───────────────────────────────────────────────────

  it('should call analyticsService.getClassComparisons with tenant_id, user_id, permissions, query', async () => {
    mockAnalyticsService.getClassComparisons.mockResolvedValue({ classes: [] });

    const result = await controller.getClassComparisons(TENANT, USER, QUERY as never);

    expect(mockAnalyticsService.getClassComparisons).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      PERMISSIONS,
      QUERY,
    );
    expect(result).toEqual({ classes: [] });
  });

  // ─── CSV Export ───────────────────────────────────────────────────────────

  it('should call analyticsService.exportCsv with tenant_id, user_id, permissions, query', async () => {
    const csvQuery = { format: 'csv', date_from: '2026-01-01' };
    mockAnalyticsService.exportCsv.mockResolvedValue({
      filename: 'export.csv',
      content: 'col1,col2\nval1,val2',
    });

    const mockRes = {
      set: jest.fn(),
      send: jest.fn(),
    };

    await controller.exportCsv(TENANT, USER, csvQuery as never, mockRes as never);

    expect(mockAnalyticsService.exportCsv).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      PERMISSIONS,
      csvQuery,
    );
    expect(mockRes.set).toHaveBeenCalledWith({
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="export.csv"',
    });
    expect(mockRes.send).toHaveBeenCalledWith('col1,col2\nval1,val2');
  });

  // ─── AI Query ─────────────────────────────────────────────────────────────

  it('should call aiService.processNLQuery with tenant_id, user_id, permissions, input, settings', async () => {
    const input = { query: 'Show me top offenders' };
    mockPrisma.tenantSetting.findFirst.mockResolvedValue({
      settings: { behaviour: { ai_enabled: true } },
    });
    mockAIService.processNLQuery.mockResolvedValue({ answer: 'Top 5 students...' });

    await controller.aiQuery(TENANT, USER, input as never);

    expect(mockAIService.processNLQuery).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      PERMISSIONS,
      input,
      expect.objectContaining({ ai_enabled: true }),
    );
  });

  it('should call aiService.getQueryHistory with tenant_id, user_id, page, pageSize', async () => {
    const query = { page: 1, pageSize: 10 };
    mockAIService.getQueryHistory.mockResolvedValue({ data: [] });

    const result = await controller.aiQueryHistory(TENANT, USER, query);

    expect(mockAIService.getQueryHistory).toHaveBeenCalledWith(TENANT_ID, USER_ID, 1, 10);
    expect(result).toEqual({ data: [] });
  });
});
