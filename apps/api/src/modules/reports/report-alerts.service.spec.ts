import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { KpiDashboardResponse, ReportKpiKey } from '@school/shared/reports';

import { PrismaService } from '../prisma/prisma.service';

import { ReportAlertsService } from './report-alerts.service';
import { UnifiedDashboardService } from './unified-dashboard.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ALERT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const MOCK_ALERT_DB = {
  id: ALERT_ID,
  tenant_id: TENANT_ID,
  name: 'Low Attendance Alert',
  metric: 'attendance_rate',
  operator: 'lt',
  threshold: 80,
  check_frequency: 'daily',
  notification_recipients_json: ['admin@school.com'],
  active: true,
  last_triggered_at: null,
  created_by_user_id: USER_ID,
  created_at: new Date('2026-03-01'),
  updated_at: new Date('2026-03-01'),
};

const mockTx = {
  reportAlert: {
    findMany: jest.fn().mockResolvedValue([MOCK_ALERT_DB]),
    count: jest.fn().mockResolvedValue(1),
    findFirst: jest.fn().mockResolvedValue(MOCK_ALERT_DB),
    create: jest.fn().mockResolvedValue(MOCK_ALERT_DB),
    update: jest.fn().mockResolvedValue({ ...MOCK_ALERT_DB, name: 'Updated Alert' }),
    delete: jest.fn().mockResolvedValue(MOCK_ALERT_DB),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

/**
 * Build a new-shape KPI dashboard response where each `value_raw` comes
 * from the `values` map keyed by KPI key. Any KPI not in the map gets a
 * value of 0 — alerts tests only care about the metrics they're asserting
 * on, so we keep the rest neutral.
 */
function buildDashboard(values: Partial<Record<ReportKpiKey, number>>): KpiDashboardResponse {
  const baseKpis: ReportKpiKey[] = [
    'attendance_today',
    'teacher_submission_compliance',
    'at_risk_students',
    'behaviour_incidents_this_week',
    'open_safeguarding_concerns',
    'overdue_invoices',
    'grades_submission_lag',
    'new_applications_this_week',
    'parent_escalations',
    'cover_gaps_this_week',
  ];

  return {
    data: {
      generated_at: new Date().toISOString(),
      kpis: baseKpis.map((key) => ({
        key,
        label_key: `reports.kpis.${key}.label`,
        tooltip_key: `reports.kpis.${key}.tooltip`,
        value: values[key] ?? 0,
        value_raw: values[key] ?? 0,
        delta: null,
        sparkline: [values[key] ?? 0],
        drill_down_href: '/reports',
        severity: null,
      })),
      trends: { weeks: [], attendance: [], grades: [], collection: [] },
    },
    meta: { cache_hit: false },
  };
}

describe('ReportAlertsService', () => {
  let service: ReportAlertsService;
  let mockPrisma: {
    reportAlert: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let mockUnifiedDashboard: {
    getKpiDashboard: jest.Mock;
  };

  beforeEach(async () => {
    mockTx.reportAlert.findMany.mockResolvedValue([MOCK_ALERT_DB]);
    mockTx.reportAlert.count.mockResolvedValue(1);
    mockTx.reportAlert.findFirst.mockResolvedValue(MOCK_ALERT_DB);
    mockTx.reportAlert.create.mockResolvedValue(MOCK_ALERT_DB);
    mockTx.reportAlert.update.mockResolvedValue({ ...MOCK_ALERT_DB, name: 'Updated Alert' });
    mockTx.reportAlert.delete.mockResolvedValue(MOCK_ALERT_DB);

    mockPrisma = {
      reportAlert: {
        findMany: jest.fn().mockResolvedValue([MOCK_ALERT_DB]),
        update: jest.fn().mockResolvedValue(MOCK_ALERT_DB),
      },
    };

    mockUnifiedDashboard = {
      getKpiDashboard: jest.fn().mockResolvedValue(
        buildDashboard({
          attendance_today: 75,
          overdue_invoices: 5,
          at_risk_students: 3,
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportAlertsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UnifiedDashboardService, useValue: mockUnifiedDashboard },
      ],
    }).compile();

    service = module.get<ReportAlertsService>(ReportAlertsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated list of report alerts', async () => {
    const result = await service.list(TENANT_ID, 1, 20);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.id).toBe(ALERT_ID);
    expect(result.meta.total).toBe(1);
    expect(result.meta.page).toBe(1);
  });

  it('should map alert DB record to ReportAlertRow shape', async () => {
    const result = await service.list(TENANT_ID, 1, 20);
    const row = result.data[0]!;

    expect(row.name).toBe('Low Attendance Alert');
    expect(row.metric).toBe('attendance_rate');
    expect(row.operator).toBe('lt');
    expect(row.threshold).toBe(80);
    expect(row.last_triggered_at).toBeNull();
    expect(typeof row.created_at).toBe('string');
  });

  it('should throw NotFoundException when getting a non-existent alert', async () => {
    mockTx.reportAlert.findFirst.mockResolvedValue(null);

    await expect(service.get(TENANT_ID, ALERT_ID)).rejects.toThrow(NotFoundException);
  });

  it('should return the alert row when it exists', async () => {
    const result = await service.get(TENANT_ID, ALERT_ID);

    expect(result.id).toBe(ALERT_ID);
  });

  it('should create an alert and return the row', async () => {
    const dto = {
      name: 'Low Attendance Alert',
      metric: 'attendance_rate' as const,
      operator: 'lt' as const,
      threshold: 80,
      check_frequency: 'daily' as const,
      notification_recipients_json: ['admin@school.com'],
      active: true,
    };

    const result = await service.create(TENANT_ID, USER_ID, dto);

    expect(result.id).toBe(ALERT_ID);
    expect(mockTx.reportAlert.create).toHaveBeenCalled();
  });

  it('should throw NotFoundException when updating a non-existent alert', async () => {
    mockTx.reportAlert.findFirst.mockResolvedValue(null);

    await expect(service.update(TENANT_ID, ALERT_ID, { name: 'New Name' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw NotFoundException when deleting a non-existent alert', async () => {
    mockTx.reportAlert.findFirst.mockResolvedValue(null);

    await expect(service.delete(TENANT_ID, ALERT_ID)).rejects.toThrow(NotFoundException);
  });

  it('should trigger an alert when attendance_rate falls below threshold', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([MOCK_ALERT_DB]);

    const results = await service.checkThresholds();

    const triggered = results.find((r) => r.alert_id === ALERT_ID);
    expect(triggered).toBeDefined();
    expect(triggered?.triggered).toBe(true);
  });

  it('should not trigger alert when metric is above threshold', async () => {
    // attendance_rate = 75, threshold = 50, operator = lt → not triggered (75 is not < 50)
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, threshold: 50, operator: 'lt' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.triggered).toBe(false);
  });

  it('should evaluate gt operator correctly', async () => {
    // overdue_invoice_count = 5, threshold = 3, operator = gt → triggered
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'overdue_invoice_count', threshold: 3, operator: 'gt' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.triggered).toBe(true);
  });

  it('should evaluate eq operator correctly when values match', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'at_risk_student_count', threshold: 3, operator: 'eq' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.triggered).toBe(true);
  });

  it('should not trigger eq operator when values differ', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'at_risk_student_count', threshold: 10, operator: 'eq' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.triggered).toBe(false);
  });

  it('should return false for unknown operator', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'attendance_rate', threshold: 80, operator: 'unknown_op' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.triggered).toBe(false);
  });

  // Legacy metrics that are not represented in the new 10-KPI dashboard
  // return 0 and therefore never trigger. Impl 09 (Report Alerts Worker)
  // will retire these metrics.
  it('should return 0 for legacy collection_rate metric', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'collection_rate', threshold: 80, operator: 'gt' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.current_value).toBe(0);
    expect(results[0]!.triggered).toBe(false);
  });

  it('should return 0 for legacy average_grade metric', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'average_grade', threshold: 80, operator: 'lt' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.current_value).toBe(0);
    expect(results[0]!.triggered).toBe(true); // 0 < 80 is truthy
  });

  it('should return 0 for legacy staff_absence_rate metric', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'staff_absence_rate', threshold: 50, operator: 'lt' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.current_value).toBe(0);
    expect(results[0]!.triggered).toBe(true); // 0 < 50
  });

  it('should return 0 for unknown metric', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'nonexistent_metric', threshold: 0, operator: 'gt' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.current_value).toBe(0);
    expect(results[0]!.triggered).toBe(false);
  });

  it('should continue checking other alerts when one fails', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, id: 'alert-1', metric: 'attendance_rate' },
      { ...MOCK_ALERT_DB, id: 'alert-2', metric: 'attendance_rate' },
    ]);
    mockUnifiedDashboard.getKpiDashboard
      .mockRejectedValueOnce(new Error('KPI service down'))
      .mockResolvedValueOnce(buildDashboard({ attendance_today: 75 }));

    const results = await service.checkThresholds();

    // First alert failed, second should still be processed
    expect(results).toHaveLength(1);
    expect(results[0]!.alert_id).toBe('alert-2');
  });

  it('should return empty results when no active alerts', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([]);

    const results = await service.checkThresholds();

    expect(results).toEqual([]);
  });

  it('should update the existing alert successfully', async () => {
    const result = await service.update(TENANT_ID, ALERT_ID, { name: 'New Name' });

    expect(result.name).toBe('Updated Alert');
    expect(mockTx.reportAlert.update).toHaveBeenCalled();
  });

  it('should delete an alert and return void', async () => {
    await service.delete(TENANT_ID, ALERT_ID);

    expect(mockTx.reportAlert.delete).toHaveBeenCalledWith({ where: { id: ALERT_ID } });
  });

  it('should handle alert with last_triggered_at set', async () => {
    const alertWithTriggered = {
      ...MOCK_ALERT_DB,
      last_triggered_at: new Date('2026-03-15'),
    };
    mockTx.reportAlert.findMany.mockResolvedValue([alertWithTriggered]);
    mockTx.reportAlert.count.mockResolvedValue(1);

    const result = await service.list(TENANT_ID, 1, 20);

    expect(result.data[0]!.last_triggered_at).toBe('2026-03-15T00:00:00.000Z');
  });

  // ─── Edge: create with active defaulting to true ──────────────────────

  it('edge: should default active to true when not provided in create dto', async () => {
    const dto = {
      name: 'Alert No Active',
      metric: 'attendance_rate' as const,
      operator: 'lt' as const,
      threshold: 80,
      check_frequency: 'daily' as const,
      notification_recipients_json: ['admin@school.com'],
      active: true,
    };

    await service.create(TENANT_ID, USER_ID, dto);

    expect(mockTx.reportAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ active: true }),
      }),
    );
  });

  it('edge: should respect active=false when explicitly provided in create dto', async () => {
    const dto = {
      name: 'Inactive Alert',
      metric: 'attendance_rate' as const,
      operator: 'lt' as const,
      threshold: 80,
      check_frequency: 'daily' as const,
      notification_recipients_json: ['admin@school.com'],
      active: false,
    };

    await service.create(TENANT_ID, USER_ID, dto);

    expect(mockTx.reportAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ active: false }),
      }),
    );
  });

  // ─── Edge: update with all optional fields undefined ──────────────────

  it('edge: should send empty data object when all update fields are undefined', async () => {
    await service.update(TENANT_ID, ALERT_ID, {});

    expect(mockTx.reportAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ALERT_ID },
        data: {},
      }),
    );
  });

  it('edge: should spread each defined field in update dto', async () => {
    const fullDto = {
      name: 'Full Update',
      metric: 'collection_rate' as const,
      operator: 'gt' as const,
      threshold: 95,
      check_frequency: 'weekly' as const,
      notification_recipients_json: ['cfo@school.com'],
      active: false,
    };

    await service.update(TENANT_ID, ALERT_ID, fullDto);

    expect(mockTx.reportAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Full Update',
          metric: 'collection_rate',
          operator: 'gt',
          threshold: 95,
          check_frequency: 'weekly',
          notification_recipients_json: ['cfo@school.com'],
          active: false,
        }),
      }),
    );
  });

  // ─── Edge: checkThresholds updates last_triggered_at ──────────────────

  it('edge: should update last_triggered_at when alert is triggered', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([MOCK_ALERT_DB]);

    await service.checkThresholds();

    // attendance_rate=75 < threshold=80, operator=lt -> triggered
    expect(mockPrisma.reportAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ALERT_ID },
        data: { last_triggered_at: expect.any(Date) },
      }),
    );
  });

  it('edge: should NOT update last_triggered_at when alert is not triggered', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, threshold: 50, operator: 'lt' },
    ]);

    await service.checkThresholds();

    // attendance_rate=75, threshold=50, lt -> not triggered
    expect(mockPrisma.reportAlert.update).not.toHaveBeenCalled();
  });

  // ─── Edge: pagination offset calculation ──────────────────────────────

  it('edge: should compute correct skip for page 3 with pageSize 10', async () => {
    mockTx.reportAlert.findMany.mockResolvedValue([]);
    mockTx.reportAlert.count.mockResolvedValue(0);

    const result = await service.list(TENANT_ID, 3, 10);

    expect(result.meta.page).toBe(3);
    expect(result.meta.pageSize).toBe(10);
    expect(mockTx.reportAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
      }),
    );
  });

  // ─── impl 17 — extended operators (lte / gte / ne) ────────────────────

  it('impl-17: should evaluate lte operator (75 <= 75 → triggered)', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'attendance_rate', threshold: 75, operator: 'lte' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.triggered).toBe(true);
  });

  it('impl-17: should evaluate lte operator (75 <= 70 → not triggered)', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'attendance_rate', threshold: 70, operator: 'lte' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.triggered).toBe(false);
  });

  it('impl-17: should evaluate gte operator (overdue=5 >= 5 → triggered)', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'overdue_invoice_count', threshold: 5, operator: 'gte' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.triggered).toBe(true);
  });

  it('impl-17: should evaluate gte operator (overdue=5 >= 10 → not triggered)', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'overdue_invoice_count', threshold: 10, operator: 'gte' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.triggered).toBe(false);
  });

  it('impl-17: should evaluate ne operator (at_risk=3 ≠ 5 → triggered)', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'at_risk_student_count', threshold: 5, operator: 'ne' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.triggered).toBe(true);
  });

  it('impl-17: should evaluate ne operator (at_risk=3 ≠ 3 → not triggered)', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'at_risk_student_count', threshold: 3, operator: 'ne' },
    ]);

    const results = await service.checkThresholds();

    expect(results[0]!.triggered).toBe(false);
  });

  it('impl-17: getHistory throws NotFoundException for unknown alert id', async () => {
    mockTx.reportAlert.findFirst.mockResolvedValue(null);

    await expect(service.getHistory(TENANT_ID, 'missing-id', 1, 50)).rejects.toThrow(
      NotFoundException,
    );
  });
});
