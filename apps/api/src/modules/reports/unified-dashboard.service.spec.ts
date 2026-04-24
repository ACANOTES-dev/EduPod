/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Test, TestingModule } from '@nestjs/testing';

import { REPORT_KPI_KEYS } from '@school/shared/reports';

// Deterministic calculator results — the service should pass these straight
// into the KpiCard list (matched by key), so we can assert the merge logic
// without touching Prisma.
const mockResults = {
  attendance_today: {
    value: '92.5%',
    value_raw: 92.5,
    delta: {
      value: 1.2,
      unit: 'percent' as const,
      direction: 'up' as const,
      better_when: 'up' as const,
    },
    sparkline: [92.5],
    severity: null,
  },
  teacher_submission_compliance: {
    value: '87.0%',
    value_raw: 87,
    delta: {
      value: -3.0,
      unit: 'percent' as const,
      direction: 'down' as const,
      better_when: 'up' as const,
    },
    sparkline: [87],
    severity: null,
  },
  at_risk_students: {
    value: 4,
    value_raw: 4,
    delta: {
      value: 1,
      unit: 'absolute' as const,
      direction: 'up' as const,
      better_when: 'down' as const,
    },
    sparkline: [4],
    severity: null,
  },
  behaviour_incidents_this_week: {
    value: 7,
    value_raw: 7,
    delta: {
      value: 0,
      unit: 'absolute' as const,
      direction: 'flat' as const,
      better_when: 'down' as const,
    },
    sparkline: [7],
    severity: null,
  },
  open_safeguarding_concerns: {
    value: '2 (3d oldest)',
    value_raw: 2,
    delta: null,
    sparkline: [2],
    severity: null,
  },
  overdue_invoices: {
    value: 5,
    value_raw: 5,
    delta: {
      value: 1,
      unit: 'absolute' as const,
      direction: 'up' as const,
      better_when: 'down' as const,
    },
    sparkline: [5],
    severity: null,
  },
  grades_submission_lag: {
    value: 3,
    value_raw: 3,
    delta: null,
    sparkline: [3],
    severity: null,
  },
  new_applications_this_week: {
    value: 6,
    value_raw: 6,
    delta: null,
    sparkline: [6],
    severity: null,
  },
  parent_escalations: {
    value: 1,
    value_raw: 1,
    delta: null,
    sparkline: [1],
    severity: null,
  },
  cover_gaps_this_week: {
    value: 0,
    value_raw: 0,
    delta: null,
    sparkline: [0],
    severity: null,
  },
};

jest.mock('./kpi-calculators', () => ({
  calculateAttendanceToday: jest.fn().mockResolvedValue(mockResults.attendance_today),
  calculateTeacherSubmissionCompliance: jest
    .fn()
    .mockResolvedValue(mockResults.teacher_submission_compliance),
  calculateAtRiskStudentsNew: jest.fn().mockResolvedValue(mockResults.at_risk_students),
  calculateBehaviourIncidentsWeek: jest
    .fn()
    .mockResolvedValue(mockResults.behaviour_incidents_this_week),
  calculateOpenSafeguardingConcerns: jest
    .fn()
    .mockResolvedValue(mockResults.open_safeguarding_concerns),
  calculateOverdueInvoices: jest.fn().mockResolvedValue(mockResults.overdue_invoices),
  calculateGradesSubmissionLag: jest.fn().mockResolvedValue(mockResults.grades_submission_lag),
  calculateNewApplicationsWeek: jest.fn().mockResolvedValue(mockResults.new_applications_this_week),
  calculateParentEscalations: jest.fn().mockResolvedValue(mockResults.parent_escalations),
  calculateCoverGapsWeek: jest.fn().mockResolvedValue(mockResults.cover_gaps_this_week),
}));

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { UnifiedDashboardService } from './unified-dashboard.service';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

type PreferencesRow = { hidden_kpi_keys: string[] } | null;

function buildTxStub(prefs: PreferencesRow) {
  return {
    reportsKpiTenantPreferences: {
      findUnique: jest.fn().mockResolvedValue(prefs),
    },
    attendanceRecord: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
    grade: {
      aggregate: jest.fn().mockResolvedValue({ _avg: { raw_score: null } }),
    },
    invoice: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { total_amount: null, balance_amount: null },
      }),
    },
  };
}

describe('UnifiedDashboardService', () => {
  let service: UnifiedDashboardService;
  let mockRedis: { get: jest.Mock; setex: jest.Mock; del: jest.Mock };
  let txStub: ReturnType<typeof buildTxStub>;

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    txStub = buildTxStub(null);

    (createRlsClient as jest.Mock).mockReturnValue({
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(txStub)),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedDashboardService,
        { provide: PrismaService, useValue: {} },
        { provide: RedisService, useValue: { getClient: () => mockRedis } },
      ],
    }).compile();

    service = module.get<UnifiedDashboardService>(UnifiedDashboardService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getKpiDashboard', () => {
    it('returns all 10 KPIs in the defined order', async () => {
      const result = await service.getKpiDashboard(TENANT_ID);

      expect(result.data.kpis).toHaveLength(10);
      expect(result.data.kpis.map((k) => k.key)).toEqual([...REPORT_KPI_KEYS]);
    });

    it('merges static KPI definitions with calculator results', async () => {
      const result = await service.getKpiDashboard(TENANT_ID);

      const attendance = result.data.kpis.find((k) => k.key === 'attendance_today');
      expect(attendance).toBeDefined();
      expect(attendance!.label_key).toBe('reports.kpis.attendance_today.label');
      expect(attendance!.tooltip_key).toBe('reports.kpis.attendance_today.tooltip');
      expect(attendance!.drill_down_href).toBe('/reports/attendance');
      expect(attendance!.value).toBe('92.5%');
      expect(attendance!.value_raw).toBe(92.5);
      expect(attendance!.delta).toEqual(mockResults.attendance_today.delta);
    });

    it('returns meta.cache_hit=false on fresh compute', async () => {
      const result = await service.getKpiDashboard(TENANT_ID);
      expect(result.meta.cache_hit).toBe(false);
    });

    it('writes the computed payload to Redis with the 5-minute TTL', async () => {
      await service.getKpiDashboard(TENANT_ID);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `reports:kpi-dashboard:${TENANT_ID}`,
        300,
        expect.any(String),
      );
    });

    it('returns cached payload with cache_hit=true when Redis has a value', async () => {
      const cached = {
        data: {
          generated_at: new Date().toISOString(),
          kpis: [],
          trends: { weeks: [], attendance: [], grades: [], collection: [] },
        },
        meta: { cache_hit: false },
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getKpiDashboard(TENANT_ID);

      expect(result.meta.cache_hit).toBe(true);
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('bypasses cache when refresh=true', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          data: {
            generated_at: new Date().toISOString(),
            kpis: [],
            trends: { weeks: [], attendance: [], grades: [], collection: [] },
          },
          meta: { cache_hit: false },
        }),
      );

      const result = await service.getKpiDashboard(TENANT_ID, true);

      expect(result.meta.cache_hit).toBe(false);
      expect(result.data.kpis).toHaveLength(10);
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('ignores corrupted cache payloads and recomputes', async () => {
      mockRedis.get.mockResolvedValue('not-valid-json');

      const result = await service.getKpiDashboard(TENANT_ID);

      expect(result.meta.cache_hit).toBe(false);
      expect(result.data.kpis).toHaveLength(10);
    });

    it('ignores cache entries that fail schema validation and recomputes', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ data: { bogus: true } }));

      const result = await service.getKpiDashboard(TENANT_ID);

      expect(result.meta.cache_hit).toBe(false);
      expect(result.data.kpis).toHaveLength(10);
    });

    it('returns a trends object with 12 weekly buckets', async () => {
      const result = await service.getKpiDashboard(TENANT_ID);

      expect(result.data.trends.weeks).toHaveLength(12);
      expect(result.data.trends.attendance).toHaveLength(12);
      expect(result.data.trends.grades).toHaveLength(12);
      expect(result.data.trends.collection).toHaveLength(12);
    });

    it('excludes hidden KPIs listed in reports_kpi_tenant_preferences', async () => {
      txStub.reportsKpiTenantPreferences.findUnique.mockResolvedValue({
        hidden_kpi_keys: ['attendance_today', 'parent_escalations'],
      });

      const result = await service.getKpiDashboard(TENANT_ID);

      expect(result.data.kpis.map((k) => k.key)).not.toContain('attendance_today');
      expect(result.data.kpis.map((k) => k.key)).not.toContain('parent_escalations');
      expect(result.data.kpis).toHaveLength(8);
    });

    it('defaults to all 10 KPIs visible when no preferences row exists', async () => {
      txStub.reportsKpiTenantPreferences.findUnique.mockResolvedValue(null);

      const result = await service.getKpiDashboard(TENANT_ID);

      expect(result.data.kpis).toHaveLength(10);
    });

    it('wraps all Prisma access in a createRlsClient transaction', async () => {
      await service.getKpiDashboard(TENANT_ID);

      expect(createRlsClient).toHaveBeenCalledWith(expect.anything(), { tenant_id: TENANT_ID });
    });
  });

  describe('invalidateCache', () => {
    it('deletes the tenant-scoped cache key', async () => {
      await service.invalidateCache(TENANT_ID);

      expect(mockRedis.del).toHaveBeenCalledWith(`reports:kpi-dashboard:${TENANT_ID}`);
    });
  });
});
