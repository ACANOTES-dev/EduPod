import { Test } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';

import { ReportsSettingsController } from './reports-settings.controller';
import { ReportsSettingsService } from './reports-settings.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const tenantStub: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'nhqs',
  name: 'NHQS Test',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const userStub: JwtPayload = {
  sub: USER_ID,
  email: 'owner@nhqs.test',
  tenant_id: TENANT_ID,
  membership_id: 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm',
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('ReportsSettingsController', () => {
  let controller: ReportsSettingsController;
  let service: jest.Mocked<ReportsSettingsService>;

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<ReportsSettingsService>> = {
      getSettings: jest.fn().mockResolvedValue({
        defaults: {
          default_export_format: 'pdf',
          default_schedule_timezone: 'Europe/Dublin',
          default_share_visibility: 'private',
        },
        kpi_preferences: { hidden_kpi_keys: [], updated_at: null, updated_by: null },
        ai_features: [
          {
            module_key: 'reports_narration',
            enabled: false,
            updated_at: '2026-04-25T00:00:00.000Z',
            updated_by: null,
            usage: { monthly_usage: 0, cost_estimate_usd: 0 },
          },
          {
            module_key: 'reports_ask_ai',
            enabled: false,
            updated_at: '2026-04-25T00:00:00.000Z',
            updated_by: null,
            usage: { monthly_usage: 0, cost_estimate_usd: 0 },
          },
          {
            module_key: 'reports_predictions',
            enabled: false,
            updated_at: '2026-04-25T00:00:00.000Z',
            updated_by: null,
            usage: { monthly_usage: 0, cost_estimate_usd: 0 },
          },
        ],
        snapshot_retention_days: 90,
      }),
      updateDefaults: jest.fn().mockImplementation(async (_, __, patch) => ({
        default_export_format: patch.default_export_format ?? 'pdf',
        default_schedule_timezone: patch.default_schedule_timezone ?? 'Europe/Dublin',
        default_share_visibility: patch.default_share_visibility ?? 'private',
      })),
      updateKpiVisibility: jest.fn().mockImplementation(async (_, __, hidden) => ({
        hidden_kpi_keys: hidden,
      })),
    };

    const module = await Test.createTestingModule({
      controllers: [ReportsSettingsController],
      providers: [{ provide: ReportsSettingsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ReportsSettingsController);
    service = module.get(ReportsSettingsService) as jest.Mocked<ReportsSettingsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET /v1/reports/settings', () => {
    it('returns the wrapped data envelope', async () => {
      const res = await controller.get(tenantStub);
      expect(service.getSettings).toHaveBeenCalledWith(TENANT_ID);
      expect(res.data.defaults.default_export_format).toBe('pdf');
      expect(res.data.ai_features).toHaveLength(3);
      expect(res.data.snapshot_retention_days).toBe(90);
    });
  });

  describe('PUT /v1/reports/settings/defaults', () => {
    it('forwards a partial update payload to the service', async () => {
      const res = await controller.updateDefaults(tenantStub, userStub, {
        default_export_format: 'xlsx',
      });
      expect(service.updateDefaults).toHaveBeenCalledWith(TENANT_ID, USER_ID, {
        default_export_format: 'xlsx',
      });
      expect(res.data.default_export_format).toBe('xlsx');
    });

    it('forwards full payload', async () => {
      await controller.updateDefaults(tenantStub, userStub, {
        default_export_format: 'docx',
        default_schedule_timezone: 'Asia/Riyadh',
        default_share_visibility: 'shared',
      });
      const call = service.updateDefaults.mock.calls[0]?.[2];
      expect(call?.default_export_format).toBe('docx');
      expect(call?.default_schedule_timezone).toBe('Asia/Riyadh');
      expect(call?.default_share_visibility).toBe('shared');
    });
  });

  describe('PUT /v1/reports/settings/kpi-visibility', () => {
    it('forwards the hidden list array', async () => {
      const res = await controller.updateKpiVisibility(tenantStub, userStub, {
        hidden_kpi_keys: ['attendance_today', 'parent_escalations'],
      });
      expect(service.updateKpiVisibility).toHaveBeenCalledWith(TENANT_ID, USER_ID, [
        'attendance_today',
        'parent_escalations',
      ]);
      expect(res.data.hidden_kpi_keys).toEqual([
        'attendance_today',
        'parent_escalations',
      ]);
    });

    it('accepts an empty list', async () => {
      const res = await controller.updateKpiVisibility(tenantStub, userStub, {
        hidden_kpi_keys: [],
      });
      expect(res.data.hidden_kpi_keys).toEqual([]);
    });
  });
});
