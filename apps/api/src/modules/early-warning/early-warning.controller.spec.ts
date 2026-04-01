import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { EarlyWarningCohortService } from './early-warning-cohort.service';
import { EarlyWarningConfigService } from './early-warning-config.service';
import { EarlyWarningController } from './early-warning.controller';
import { EarlyWarningService } from './early-warning.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT: TenantContext = {
  tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: 'user-uuid-1',
  tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  email: 'admin@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ─── Mock services ───────────────────────────────────────────────────────────

const mockEarlyWarningService = {
  listProfiles: jest.fn(),
  getTierSummary: jest.fn(),
  getStudentDetail: jest.fn(),
  acknowledgeProfile: jest.fn(),
  assignStaff: jest.fn(),
};

const mockConfigService = {
  getConfig: jest.fn(),
  updateConfig: jest.fn(),
};

const mockCohortService = {
  getCohortPivot: jest.fn(),
};

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('EarlyWarningController', () => {
  let controller: EarlyWarningController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EarlyWarningController],
      providers: [
        { provide: EarlyWarningService, useValue: mockEarlyWarningService },
        { provide: EarlyWarningConfigService, useValue: mockConfigService },
        { provide: EarlyWarningCohortService, useValue: mockCohortService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EarlyWarningController>(EarlyWarningController);
    jest.clearAllMocks();
  });

  // ─── GET /v1/early-warnings ─────────────────────────────────────────────

  describe('list', () => {
    it('should delegate to earlyWarningService.listProfiles with tenant, user, and query', async () => {
      const query = {
        page: 1,
        pageSize: 20,
        sort: 'composite_score' as const,
        order: 'desc' as const,
      };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockEarlyWarningService.listProfiles.mockResolvedValue(expected);

      const result = await controller.list(TENANT, USER, query as never);

      expect(mockEarlyWarningService.listProfiles).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        USER.membership_id,
        query,
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── GET /v1/early-warnings/summary ─────────────────────────────────────

  describe('summary', () => {
    it('should delegate to earlyWarningService.getTierSummary and wrap in { data }', async () => {
      const query = {};
      const summaryData = { green: 10, yellow: 5, amber: 3, red: 1, total: 19 };
      mockEarlyWarningService.getTierSummary.mockResolvedValue(summaryData);

      const result = await controller.summary(TENANT, USER, query as never);

      expect(mockEarlyWarningService.getTierSummary).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        USER.membership_id,
        query,
      );
      expect(result).toEqual({ data: summaryData });
    });
  });

  // ─── GET /v1/early-warnings/cohort ──────────────────────────────────────

  describe('cohort', () => {
    it('should delegate to cohortService.getCohortPivot', async () => {
      const query = { group_by: 'year_group' as const, period: 'current' as const };
      const expected = { data: [] };
      mockCohortService.getCohortPivot.mockResolvedValue(expected);

      const result = await controller.cohort(TENANT, USER, query as never);

      expect(mockCohortService.getCohortPivot).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        USER.membership_id,
        query,
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── GET /v1/early-warnings/config ──────────────────────────────────────

  describe('getConfig', () => {
    it('should delegate to configService.getConfig with tenant_id and wrap in { data }', async () => {
      const configData = { id: 'cfg-1', is_enabled: true, weights_json: {} };
      mockConfigService.getConfig.mockResolvedValue(configData);

      const result = await controller.getConfig(TENANT);

      expect(mockConfigService.getConfig).toHaveBeenCalledWith(TENANT.tenant_id);
      expect(result).toEqual({ data: configData });
    });
  });

  // ─── PUT /v1/early-warnings/config ──────────────────────────────────────

  describe('updateConfig', () => {
    it('should delegate to configService.updateConfig with tenant_id and dto, wrap in { data }', async () => {
      const dto = { is_enabled: true };
      const configData = { id: 'cfg-1', is_enabled: true };
      mockConfigService.updateConfig.mockResolvedValue(configData);

      const result = await controller.updateConfig(TENANT, dto as never);

      expect(mockConfigService.updateConfig).toHaveBeenCalledWith(TENANT.tenant_id, dto);
      expect(result).toEqual({ data: configData });
    });
  });

  // ─── GET /v1/early-warnings/:studentId ──────────────────────────────────

  describe('getStudentDetail', () => {
    it('should delegate to earlyWarningService.getStudentDetail and wrap in { data }', async () => {
      const detailData = { id: 'profile-1', student_id: STUDENT_ID, composite_score: 65 };
      mockEarlyWarningService.getStudentDetail.mockResolvedValue(detailData);

      const result = await controller.getStudentDetail(TENANT, USER, STUDENT_ID);

      expect(mockEarlyWarningService.getStudentDetail).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        USER.membership_id,
        STUDENT_ID,
      );
      expect(result).toEqual({ data: detailData });
    });
  });

  // ─── POST /v1/early-warnings/:studentId/acknowledge ────────────────────

  describe('acknowledge', () => {
    it('should delegate to earlyWarningService.acknowledgeProfile and return void', async () => {
      mockEarlyWarningService.acknowledgeProfile.mockResolvedValue(undefined);

      await controller.acknowledge(TENANT, USER, STUDENT_ID);

      expect(mockEarlyWarningService.acknowledgeProfile).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        STUDENT_ID,
      );
    });
  });

  // ─── POST /v1/early-warnings/:studentId/assign ─────────────────────────

  describe('assign', () => {
    it('should delegate to earlyWarningService.assignStaff and wrap in { data }', async () => {
      const dto = { assigned_to_user_id: 'staff-uuid-1' };
      const assignData = {
        id: 'profile-1',
        assigned_to_user_id: 'staff-uuid-1',
        assigned_at: '2026-03-28T10:00:00.000Z',
      };
      mockEarlyWarningService.assignStaff.mockResolvedValue(assignData);

      const result = await controller.assign(TENANT, USER, STUDENT_ID, dto as never);

      expect(mockEarlyWarningService.assignStaff).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        STUDENT_ID,
        dto,
      );
      expect(result).toEqual({ data: assignData });
    });
  });
});
