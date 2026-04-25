import { Test, type TestingModule } from '@nestjs/testing';

import { AiFlagsService } from '../../ai-flags/ai-flags.service';
import { PrismaService } from '../../prisma/prisma.service';

import { ReportsSettingsService } from './reports-settings.service';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: (prisma: unknown) => prisma,
}));

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '550e8400-e29b-41d4-a716-446655440001';

interface MockPrismaSettingsRow {
  id?: string;
  tenant_id: string;
  default_export_format: string;
  default_schedule_timezone: string;
  default_share_visibility: 'private' | 'shared';
  updated_by: string | null;
}

interface MockPrismaKpiPrefsRow {
  hidden_kpi_keys: string[];
  updated_at: Date;
  updated_by: string | null;
}

describe('ReportsSettingsService', () => {
  let service: ReportsSettingsService;
  let prismaMock: {
    reportsTenantSettings: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
    reportsKpiTenantPreferences: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
    aiProcessingLog: {
      groupBy: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let aiFlagsMock: { list: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      reportsTenantSettings: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      reportsKpiTenantPreferences: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      aiProcessingLog: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
    };
    aiFlagsMock = { list: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsSettingsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AiFlagsService, useValue: aiFlagsMock },
      ],
    }).compile();

    service = module.get(ReportsSettingsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getSettings', () => {
    it('returns model defaults when no row exists', async () => {
      prismaMock.reportsTenantSettings.findUnique.mockResolvedValue(null);
      prismaMock.reportsKpiTenantPreferences.findUnique.mockResolvedValue(null);
      aiFlagsMock.list.mockResolvedValue([]);

      const res = await service.getSettings(TENANT_ID);

      expect(res.defaults).toEqual({
        default_export_format: 'pdf',
        default_schedule_timezone: 'Europe/Dublin',
        default_share_visibility: 'private',
      });
      expect(res.kpi_preferences).toEqual({
        hidden_kpi_keys: [],
        updated_at: null,
        updated_by: null,
      });
      expect(res.snapshot_retention_days).toBe(90);
    });

    it('returns persisted defaults when a row exists', async () => {
      const row: MockPrismaSettingsRow = {
        tenant_id: TENANT_ID,
        default_export_format: 'xlsx',
        default_schedule_timezone: 'Asia/Riyadh',
        default_share_visibility: 'shared',
        updated_by: USER_ID,
      };
      prismaMock.reportsTenantSettings.findUnique.mockResolvedValue(row);
      prismaMock.reportsKpiTenantPreferences.findUnique.mockResolvedValue(null);

      const res = await service.getSettings(TENANT_ID);

      expect(res.defaults).toEqual({
        default_export_format: 'xlsx',
        default_schedule_timezone: 'Asia/Riyadh',
        default_share_visibility: 'shared',
      });
    });

    it('falls back to pdf when persisted format is unknown', async () => {
      const row: MockPrismaSettingsRow = {
        tenant_id: TENANT_ID,
        default_export_format: 'csv', // not in REPORTS_DEFAULT_EXPORT_FORMATS
        default_schedule_timezone: 'Europe/Dublin',
        default_share_visibility: 'private',
        updated_by: null,
      };
      prismaMock.reportsTenantSettings.findUnique.mockResolvedValue(row);
      prismaMock.reportsKpiTenantPreferences.findUnique.mockResolvedValue(null);

      const res = await service.getSettings(TENANT_ID);

      expect(res.defaults.default_export_format).toBe('pdf');
    });

    it('returns hidden KPI list and timestamps when prefs row exists', async () => {
      prismaMock.reportsTenantSettings.findUnique.mockResolvedValue(null);
      const updatedAt = new Date('2026-04-25T13:00:00Z');
      const prefs: MockPrismaKpiPrefsRow = {
        hidden_kpi_keys: ['attendance_today', 'parent_escalations'],
        updated_at: updatedAt,
        updated_by: USER_ID,
      };
      prismaMock.reportsKpiTenantPreferences.findUnique.mockResolvedValue(prefs);

      const res = await service.getSettings(TENANT_ID);

      expect(res.kpi_preferences.hidden_kpi_keys).toEqual([
        'attendance_today',
        'parent_escalations',
      ]);
      expect(res.kpi_preferences.updated_at).toBe(updatedAt.toISOString());
      expect(res.kpi_preferences.updated_by).toBe(USER_ID);
    });

    it('always returns the three reports AI feature states', async () => {
      prismaMock.reportsTenantSettings.findUnique.mockResolvedValue(null);
      prismaMock.reportsKpiTenantPreferences.findUnique.mockResolvedValue(null);
      aiFlagsMock.list.mockResolvedValue([
        // Wellbeing flag — should be ignored
        {
          id: 'flag-1',
          tenant_id: TENANT_ID,
          module_key: 'behaviour',
          enabled: true,
          updated_at: '2026-04-24T10:00:00Z',
          updated_by: USER_ID,
        },
        {
          id: 'flag-2',
          tenant_id: TENANT_ID,
          module_key: 'reports_ask_ai',
          enabled: true,
          updated_at: '2026-04-25T10:00:00Z',
          updated_by: USER_ID,
        },
      ]);

      const res = await service.getSettings(TENANT_ID);

      expect(res.ai_features).toHaveLength(3);
      const askAi = res.ai_features.find((f) => f.module_key === 'reports_ask_ai');
      expect(askAi?.enabled).toBe(true);
      const narration = res.ai_features.find((f) => f.module_key === 'reports_narration');
      expect(narration?.enabled).toBe(false);
    });

    it('aggregates AI usage by ai_service for the current month', async () => {
      prismaMock.reportsTenantSettings.findUnique.mockResolvedValue(null);
      prismaMock.reportsKpiTenantPreferences.findUnique.mockResolvedValue(null);
      aiFlagsMock.list.mockResolvedValue([]);
      prismaMock.aiProcessingLog.groupBy.mockResolvedValue([
        {
          ai_service: 'reports_narration',
          _count: { _all: 12 },
          _sum: { cost_usd_estimate: '0.16' },
        },
        {
          ai_service: 'reports_ask_ai',
          _count: { _all: 7 },
          _sum: { cost_usd_estimate: '0.12' },
        },
        {
          ai_service: 'unrelated_service',
          _count: { _all: 99 },
          _sum: { cost_usd_estimate: '5' },
        },
      ]);

      const res = await service.getSettings(TENANT_ID);

      const narration = res.ai_features.find((f) => f.module_key === 'reports_narration');
      expect(narration?.usage.monthly_usage).toBe(12);
      expect(narration?.usage.cost_estimate_usd).toBeCloseTo(0.16);
      const ask = res.ai_features.find((f) => f.module_key === 'reports_ask_ai');
      expect(ask?.usage.monthly_usage).toBe(7);
      expect(ask?.usage.cost_estimate_usd).toBeCloseTo(0.12);
      const predictions = res.ai_features.find(
        (f) => f.module_key === 'reports_predictions',
      );
      expect(predictions?.usage.monthly_usage).toBe(0);
    });
  });

  describe('updateDefaults', () => {
    it('upserts the row with updated_by set to the actor', async () => {
      prismaMock.reportsTenantSettings.upsert.mockImplementation(
        ({ create }: { create: MockPrismaSettingsRow }) =>
          Promise.resolve({
            ...create,
            id: 'row-1',
          }),
      );

      const res = await service.updateDefaults(TENANT_ID, USER_ID, {
        default_export_format: 'docx',
        default_share_visibility: 'shared',
      });

      expect(prismaMock.reportsTenantSettings.upsert).toHaveBeenCalledTimes(1);
      const call = prismaMock.reportsTenantSettings.upsert.mock.calls[0][0] as {
        where: { tenant_id: string };
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      };
      expect(call.where.tenant_id).toBe(TENANT_ID);
      expect(call.update.updated_by).toBe(USER_ID);
      expect(call.update.default_export_format).toBe('docx');
      expect(call.update.default_share_visibility).toBe('shared');
      // Untouched field — not present on the update payload
      expect(call.update.default_schedule_timezone).toBeUndefined();
      expect(res.default_export_format).toBe('docx');
      expect(res.default_share_visibility).toBe('shared');
    });

    it('does not persist undefined fields', async () => {
      prismaMock.reportsTenantSettings.upsert.mockResolvedValue({
        tenant_id: TENANT_ID,
        default_export_format: 'pdf',
        default_schedule_timezone: 'Europe/Dublin',
        default_share_visibility: 'private',
        updated_by: USER_ID,
      });

      await service.updateDefaults(TENANT_ID, USER_ID, {
        default_schedule_timezone: 'Europe/London',
      });

      const call = prismaMock.reportsTenantSettings.upsert.mock.calls[0][0] as {
        update: Record<string, unknown>;
      };
      expect(call.update.default_schedule_timezone).toBe('Europe/London');
      expect(call.update.default_export_format).toBeUndefined();
      expect(call.update.default_share_visibility).toBeUndefined();
    });
  });

  describe('updateKpiVisibility', () => {
    it('upserts with the full hidden list and tracks updated_by', async () => {
      prismaMock.reportsKpiTenantPreferences.upsert.mockResolvedValue({});

      const res = await service.updateKpiVisibility(TENANT_ID, USER_ID, [
        'attendance_today',
        'open_safeguarding_concerns',
      ]);

      const call = prismaMock.reportsKpiTenantPreferences.upsert.mock.calls[0][0] as {
        where: { tenant_id: string };
        update: { hidden_kpi_keys: string[]; updated_by: string };
        create: { tenant_id: string; hidden_kpi_keys: string[] };
      };
      expect(call.where.tenant_id).toBe(TENANT_ID);
      expect(call.update.hidden_kpi_keys).toEqual([
        'attendance_today',
        'open_safeguarding_concerns',
      ]);
      expect(call.update.updated_by).toBe(USER_ID);
      expect(res.hidden_kpi_keys).toEqual([
        'attendance_today',
        'open_safeguarding_concerns',
      ]);
    });

    it('accepts an empty list (show all KPIs)', async () => {
      prismaMock.reportsKpiTenantPreferences.upsert.mockResolvedValue({});

      const res = await service.updateKpiVisibility(TENANT_ID, USER_ID, []);

      expect(res.hidden_kpi_keys).toEqual([]);
    });
  });
});
