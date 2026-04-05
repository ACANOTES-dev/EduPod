import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

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
    // Reset per-test
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
      getKpiDashboard: jest.fn().mockResolvedValue({
        total_students: 100,
        active_staff_count: 20,
        attendance_rate: 75,
        fee_collection_rate: 90,
        overdue_invoices_count: 5,
        at_risk_students_count: 3,
        average_grade: 70,
        pending_applications: 12,
        scheduled_classes_today: 10,
        generated_at: new Date().toISOString(),
      }),
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
    // KPI attendance_rate = 75, alert threshold = 80, operator = lt → triggered
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

  it('should handle collection_rate metric', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'collection_rate', threshold: 80, operator: 'gt' },
    ]);

    const results = await service.checkThresholds();

    // collection_rate = 90, threshold = 80, operator gt → triggered
    expect(results[0]!.triggered).toBe(true);
  });

  it('should handle average_grade metric', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'average_grade', threshold: 80, operator: 'lt' },
    ]);

    const results = await service.checkThresholds();

    // average_grade = 70, threshold = 80, operator lt → triggered
    expect(results[0]!.triggered).toBe(true);
  });

  it('should handle staff_absence_rate metric', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'staff_absence_rate', threshold: 50, operator: 'lt' },
    ]);

    const results = await service.checkThresholds();

    // staff_absence_rate = 0 (all active), threshold 50, lt → triggered
    expect(results[0]!.triggered).toBe(true);
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
      .mockResolvedValueOnce({
        total_students: 100,
        active_staff_count: 20,
        attendance_rate: 75,
        fee_collection_rate: 90,
        overdue_invoices_count: 5,
        at_risk_students_count: 3,
        average_grade: 70,
        pending_applications: 12,
        scheduled_classes_today: 10,
        generated_at: new Date().toISOString(),
      });

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
      // active is NOT provided, so dto.active ?? true should be used
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

  // ─── Edge: staff_absence_rate with 0 active staff ─────────────────────

  it('edge: should return 0 for staff_absence_rate when active_staff_count is 0', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'staff_absence_rate', threshold: 50, operator: 'gt' },
    ]);
    mockUnifiedDashboard.getKpiDashboard.mockResolvedValue({
      total_students: 100,
      active_staff_count: 0,
      attendance_rate: 75,
      fee_collection_rate: 90,
      overdue_invoices_count: 5,
      at_risk_students_count: 3,
      average_grade: 70,
      pending_applications: 12,
      scheduled_classes_today: 10,
      generated_at: new Date().toISOString(),
    });

    const results = await service.checkThresholds();

    expect(results[0]!.current_value).toBe(0);
    expect(results[0]!.triggered).toBe(false);
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

  // ─── Edge: attendance_rate metric with null kpi ───────────────────────

  it('edge: should return 0 for attendance_rate when kpi returns null', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'attendance_rate', threshold: 80, operator: 'lt' },
    ]);
    mockUnifiedDashboard.getKpiDashboard.mockResolvedValue({
      total_students: 100,
      active_staff_count: 20,
      attendance_rate: null,
      fee_collection_rate: null,
      overdue_invoices_count: 5,
      at_risk_students_count: 3,
      average_grade: null,
      pending_applications: 12,
      scheduled_classes_today: 10,
      generated_at: new Date().toISOString(),
    });

    const results = await service.checkThresholds();

    // attendance_rate is null, ?? 0 -> current_value = 0
    expect(results[0]!.current_value).toBe(0);
  });

  it('edge: should return 0 for collection_rate when kpi returns null', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'collection_rate', threshold: 80, operator: 'gt' },
    ]);
    mockUnifiedDashboard.getKpiDashboard.mockResolvedValue({
      total_students: 100,
      active_staff_count: 20,
      attendance_rate: 75,
      fee_collection_rate: null,
      overdue_invoices_count: 5,
      at_risk_students_count: 3,
      average_grade: 70,
      pending_applications: 12,
      scheduled_classes_today: 10,
      generated_at: new Date().toISOString(),
    });

    const results = await service.checkThresholds();

    expect(results[0]!.current_value).toBe(0);
  });

  it('edge: should return 0 for average_grade when kpi returns null', async () => {
    mockPrisma.reportAlert.findMany.mockResolvedValue([
      { ...MOCK_ALERT_DB, metric: 'average_grade', threshold: 80, operator: 'lt' },
    ]);
    mockUnifiedDashboard.getKpiDashboard.mockResolvedValue({
      total_students: 100,
      active_staff_count: 20,
      attendance_rate: 75,
      fee_collection_rate: 90,
      overdue_invoices_count: 5,
      at_risk_students_count: 3,
      average_grade: null,
      pending_applications: 12,
      scheduled_classes_today: 10,
      generated_at: new Date().toISOString(),
    });

    const results = await service.checkThresholds();

    expect(results[0]!.current_value).toBe(0);
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
});
