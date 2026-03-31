import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { SenReportsController } from './sen-reports.controller';
import { SenReportsService } from './sen-reports.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const YEAR_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  email: 'teacher@test.com',
  tenant_id: TENANT_ID,
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('SenReportsController', () => {
  let controller: SenReportsController;

  const mockService = {
    getNcseReturn: jest.fn(),
    getOverviewReport: jest.fn(),
    getResourceUtilisation: jest.fn(),
    getPlanCompliance: jest.fn(),
    getProfessionalInvolvementReport: jest.fn(),
  };

  const mockPermissionCacheService = {
    getPermissions: jest.fn().mockResolvedValue(['sen.view', 'sen.manage']),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenReportsController],
      providers: [
        { provide: SenReportsService, useValue: mockService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SenReportsController>(SenReportsController);

    jest.clearAllMocks();
    mockPermissionCacheService.getPermissions.mockResolvedValue(['sen.view', 'sen.manage']);
  });

  afterEach(() => jest.clearAllMocks());

  it('has module-enabled metadata', () => {
    expect(Reflect.getMetadata(MODULE_ENABLED_KEY, SenReportsController)).toBe('sen');
  });

  it('delegates admin-only report routes directly', async () => {
    mockService.getNcseReturn.mockResolvedValue({ academic_year: '2025/2026' });
    mockService.getResourceUtilisation.mockResolvedValue({ totals: {} });
    mockService.getProfessionalInvolvementReport.mockResolvedValue({ summary: {} });

    await controller.getNcseReturn(TENANT, { academic_year_id: YEAR_ID });
    await controller.getResourceUtilisation(TENANT, { academic_year_id: YEAR_ID });
    await controller.getProfessionalInvolvementReport(TENANT, {});

    expect(mockService.getNcseReturn).toHaveBeenCalledWith(TENANT_ID, {
      academic_year_id: YEAR_ID,
    });
    expect(mockService.getResourceUtilisation).toHaveBeenCalledWith(TENANT_ID, {
      academic_year_id: YEAR_ID,
    });
    expect(mockService.getProfessionalInvolvementReport).toHaveBeenCalledWith(TENANT_ID);
  });

  it('delegates sen.view routes with cached permissions', async () => {
    mockService.getOverviewReport.mockResolvedValue({ total_sen_students: 0 });
    mockService.getPlanCompliance.mockResolvedValue({ stale_goals: [] });

    await controller.getOverviewReport(TENANT, USER, {});
    await controller.getPlanCompliance(TENANT, USER, {
      overdue: true,
      due_within_days: 14,
      stale_goal_weeks: 4,
    });

    expect(mockPermissionCacheService.getPermissions).toHaveBeenCalledWith(MEMBERSHIP_ID);
    expect(mockService.getOverviewReport).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      ['sen.view', 'sen.manage'],
      {},
    );
    expect(mockService.getPlanCompliance).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      ['sen.view', 'sen.manage'],
      { overdue: true, due_within_days: 14, stale_goal_weeks: 4 },
    );
  });

  it('declares the expected permissions on each route', () => {
    expect(
      Reflect.getMetadata(REQUIRES_PERMISSION_KEY, SenReportsController.prototype.getNcseReturn),
    ).toBe('sen.admin');
    expect(
      Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenReportsController.prototype.getOverviewReport,
      ),
    ).toBe('sen.view');
    expect(
      Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenReportsController.prototype.getResourceUtilisation,
      ),
    ).toBe('sen.admin');
    expect(
      Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenReportsController.prototype.getPlanCompliance,
      ),
    ).toBe('sen.view');
    expect(
      Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenReportsController.prototype.getProfessionalInvolvementReport,
      ),
    ).toBe('sen.admin');
  });
});
