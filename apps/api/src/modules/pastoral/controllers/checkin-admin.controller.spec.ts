import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { CheckinAnalyticsService } from '../services/checkin-analytics.service';
import { CheckinService } from '../services/checkin.service';

import { CheckinAdminController } from './checkin-admin.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const YEAR_GROUP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

// ─── Mock Services ──────────────────────────────────────────────────────────

const mockCheckinService = {
  getFlaggedCheckins: jest.fn(),
  getStudentCheckins: jest.fn(),
};

const mockAnalyticsService = {
  getYearGroupMoodTrends: jest.fn(),
  getSchoolMoodTrends: jest.fn(),
  getDayOfWeekPatterns: jest.fn(),
  getExamPeriodComparison: jest.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CheckinAdminController', () => {
  let controller: CheckinAdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckinAdminController],
      providers: [
        { provide: CheckinService, useValue: mockCheckinService },
        { provide: CheckinAnalyticsService, useValue: mockAnalyticsService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CheckinAdminController>(CheckinAdminController);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DECORATOR / GUARD METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level decorators', () => {
    it('should have @ModuleEnabled("pastoral") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, CheckinAdminController);
      expect(moduleKey).toBe('pastoral');
    });

    it('should have @UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard) on the class', () => {
      const guards = Reflect.getMetadata('__guards__', CheckinAdminController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(ModuleEnabledGuard);
      expect(guards).toContain(PermissionGuard);
    });
  });

  describe('monitoring endpoint permissions', () => {
    const monitoringMethods: Array<keyof CheckinAdminController> = ['flagged', 'studentHistory'];

    it.each(monitoringMethods)(
      'should have @RequiresPermission("pastoral.view_checkin_monitoring") on %s',
      (method) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe('pastoral.view_checkin_monitoring');
      },
    );
  });

  describe('aggregate endpoint permissions', () => {
    const aggregateMethods: Array<keyof CheckinAdminController> = [
      'moodTrends',
      'dayOfWeekPatterns',
      'examComparison',
    ];

    it.each(aggregateMethods)(
      'should have @RequiresPermission("pastoral.view_checkin_aggregate") on %s',
      (method) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe('pastoral.view_checkin_aggregate');
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('flagged', () => {
    it('should delegate to checkinService.getFlaggedCheckins', async () => {
      const filters = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockCheckinService.getFlaggedCheckins.mockResolvedValue(expected);

      const result = await controller.flagged(TENANT, filters as never);

      expect(mockCheckinService.getFlaggedCheckins).toHaveBeenCalledWith(
        TENANT_ID,
        filters,
        filters.page,
        filters.pageSize,
      );
      expect(result).toBe(expected);
    });
  });

  describe('studentHistory', () => {
    it('should delegate to checkinService.getStudentCheckins', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockCheckinService.getStudentCheckins.mockResolvedValue(expected);

      const result = await controller.studentHistory(TENANT, STUDENT_ID, query);

      expect(mockCheckinService.getStudentCheckins).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
        query.page,
        query.pageSize,
      );
      expect(result).toBe(expected);
    });
  });

  describe('moodTrends', () => {
    it('should delegate to analyticsService.getYearGroupMoodTrends when year_group_id is present', async () => {
      const query = {
        group_by: 'day' as const,
        date_from: '2026-01-01',
        date_to: '2026-03-31',
        year_group_id: YEAR_GROUP_ID,
      };
      const expected = { data: [] };
      mockAnalyticsService.getYearGroupMoodTrends.mockResolvedValue(expected);

      const result = await controller.moodTrends(TENANT, query as never);

      expect(mockAnalyticsService.getYearGroupMoodTrends).toHaveBeenCalledWith(
        TENANT_ID,
        YEAR_GROUP_ID,
        { from: '2026-01-01', to: '2026-03-31' },
        'weekly',
      );
      expect(mockAnalyticsService.getSchoolMoodTrends).not.toHaveBeenCalled();
      expect(result).toBe(expected);
    });

    it('should delegate to analyticsService.getSchoolMoodTrends when year_group_id is absent', async () => {
      const query = {
        group_by: 'month' as const,
        date_from: '2026-01-01',
        date_to: '2026-03-31',
      };
      const expected = { data: [] };
      mockAnalyticsService.getSchoolMoodTrends.mockResolvedValue(expected);

      const result = await controller.moodTrends(TENANT, query as never);

      expect(mockAnalyticsService.getSchoolMoodTrends).toHaveBeenCalledWith(
        TENANT_ID,
        { from: '2026-01-01', to: '2026-03-31' },
        'monthly',
      );
      expect(mockAnalyticsService.getYearGroupMoodTrends).not.toHaveBeenCalled();
      expect(result).toBe(expected);
    });

    it('should map group_by "week" to "weekly" granularity', async () => {
      const query = {
        group_by: 'week' as const,
        date_from: '2026-01-01',
        date_to: '2026-03-31',
      };
      mockAnalyticsService.getSchoolMoodTrends.mockResolvedValue({ data: [] });

      await controller.moodTrends(TENANT, query as never);

      expect(mockAnalyticsService.getSchoolMoodTrends).toHaveBeenCalledWith(
        TENANT_ID,
        { from: '2026-01-01', to: '2026-03-31' },
        'weekly',
      );
    });
  });

  describe('dayOfWeekPatterns', () => {
    it('should delegate to analyticsService.getDayOfWeekPatterns with year_group_id', async () => {
      const query = {
        group_by: 'day' as const,
        date_from: '2026-01-01',
        date_to: '2026-03-31',
        year_group_id: YEAR_GROUP_ID,
      };
      const expected = { data: [] };
      mockAnalyticsService.getDayOfWeekPatterns.mockResolvedValue(expected);

      const result = await controller.dayOfWeekPatterns(TENANT, query as never);

      expect(mockAnalyticsService.getDayOfWeekPatterns).toHaveBeenCalledWith(
        TENANT_ID,
        YEAR_GROUP_ID,
        { from: '2026-01-01', to: '2026-03-31' },
      );
      expect(result).toBe(expected);
    });

    it('should pass null for year_group_id when absent', async () => {
      const query = {
        group_by: 'day' as const,
        date_from: '2026-01-01',
        date_to: '2026-03-31',
      };
      mockAnalyticsService.getDayOfWeekPatterns.mockResolvedValue({ data: [] });

      await controller.dayOfWeekPatterns(TENANT, query as never);

      expect(mockAnalyticsService.getDayOfWeekPatterns).toHaveBeenCalledWith(TENANT_ID, null, {
        from: '2026-01-01',
        to: '2026-03-31',
      });
    });
  });

  describe('examComparison', () => {
    it('should delegate to analyticsService.getExamPeriodComparison', async () => {
      const query = {
        exam_start: '2026-05-01',
        exam_end: '2026-05-15',
        year_group_id: YEAR_GROUP_ID,
      };
      const expected = { data: [] };
      mockAnalyticsService.getExamPeriodComparison.mockResolvedValue(expected);

      const result = await controller.examComparison(TENANT, query as never);

      expect(mockAnalyticsService.getExamPeriodComparison).toHaveBeenCalledWith(
        TENANT_ID,
        YEAR_GROUP_ID,
        { start: '2026-05-01', end: '2026-05-15' },
      );
      expect(result).toBe(expected);
    });

    it('should pass null for year_group_id when absent', async () => {
      const query = {
        exam_start: '2026-05-01',
        exam_end: '2026-05-15',
      };
      mockAnalyticsService.getExamPeriodComparison.mockResolvedValue({ data: [] });

      await controller.examComparison(TENANT, query as never);

      expect(mockAnalyticsService.getExamPeriodComparison).toHaveBeenCalledWith(TENANT_ID, null, {
        start: '2026-05-01',
        end: '2026-05-15',
      });
    });
  });
});
