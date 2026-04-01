import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { PermissionCacheService } from '../../common/services/permission-cache.service';

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
        { provide: SchedulingDashboardService, useValue: mockDashboardService },
        { provide: PermissionCacheService, useValue: mockPermissionCache },
      ],
    }).compile();

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
