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
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
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

    await expect(
      service.update(TENANT_ID, ALERT_ID, { name: 'New Name' }),
    ).rejects.toThrow(NotFoundException);
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
});
