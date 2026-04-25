import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ScheduledReportsService } from './scheduled-reports.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const MOCK_SCHEDULED_REPORT = {
  id: 'report-1',
  tenant_id: TENANT_ID,
  name: 'Monthly Attendance',
  report_type: 'attendance',
  parameters_json: {},
  schedule_cron: '0 8 1 * *',
  recipient_emails: ['principal@school.com'],
  format: 'pdf',
  active: true,
  last_sent_at: null,
  created_by_user_id: USER_ID,
  created_at: new Date('2026-03-01'),
  updated_at: new Date('2026-03-01'),
};

const MOCK_SCHEDULED_REPORT_RUN = {
  id: 'run-1',
  tenant_id: TENANT_ID,
  scheduled_report_id: 'report-1',
  started_at: new Date('2026-04-25T08:00:00.000Z'),
  finished_at: new Date('2026-04-25T08:00:21.000Z'),
  status: 'succeeded',
  row_count: 214,
  error_message: null,
  artifact_object_key: 'tenant/aaa/reports/scheduled/report-1/run-1.pdf',
  delivered_via: ['email'],
};

const mockTx = {
  scheduledReport: {
    findMany: jest.fn().mockResolvedValue([MOCK_SCHEDULED_REPORT]),
    count: jest.fn().mockResolvedValue(1),
    findFirst: jest.fn().mockResolvedValue(MOCK_SCHEDULED_REPORT),
    create: jest.fn().mockResolvedValue(MOCK_SCHEDULED_REPORT),
    update: jest.fn().mockResolvedValue({ ...MOCK_SCHEDULED_REPORT, name: 'Updated' }),
    delete: jest.fn().mockResolvedValue(MOCK_SCHEDULED_REPORT),
  },
  scheduledReportRun: {
    findMany: jest.fn().mockResolvedValue([MOCK_SCHEDULED_REPORT_RUN]),
    count: jest.fn().mockResolvedValue(1),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('ScheduledReportsService', () => {
  let service: ScheduledReportsService;
  let mockPrisma: {
    scheduledReport: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      scheduledReport: {
        findMany: jest.fn().mockResolvedValue([MOCK_SCHEDULED_REPORT]),
        update: jest.fn().mockResolvedValue(MOCK_SCHEDULED_REPORT),
      },
    };

    // Reset tx mocks
    mockTx.scheduledReport.findMany.mockResolvedValue([MOCK_SCHEDULED_REPORT]);
    mockTx.scheduledReport.count.mockResolvedValue(1);
    mockTx.scheduledReport.findFirst.mockResolvedValue(MOCK_SCHEDULED_REPORT);
    mockTx.scheduledReport.create.mockResolvedValue(MOCK_SCHEDULED_REPORT);
    mockTx.scheduledReport.update.mockResolvedValue({ ...MOCK_SCHEDULED_REPORT, name: 'Updated' });
    mockTx.scheduledReport.delete.mockResolvedValue(MOCK_SCHEDULED_REPORT);
    mockTx.scheduledReportRun.findMany.mockResolvedValue([MOCK_SCHEDULED_REPORT_RUN]);
    mockTx.scheduledReportRun.count.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ScheduledReportsService>(ScheduledReportsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('should return paginated scheduled reports', async () => {
      const result = await service.list(TENANT_ID, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.name).toBe('Monthly Attendance');
    });
  });

  describe('get', () => {
    it('should return a scheduled report by id', async () => {
      const result = await service.get(TENANT_ID, 'report-1');

      expect(result.id).toBe('report-1');
      expect(result.schedule_cron).toBe('0 8 1 * *');
    });

    it('should throw NotFoundException when report does not exist', async () => {
      mockTx.scheduledReport.findFirst.mockResolvedValue(null);

      await expect(service.get(TENANT_ID, 'missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a scheduled report and return the row', async () => {
      const dto = {
        name: 'Monthly Attendance',
        report_type: 'attendance',
        parameters_json: {},
        schedule_cron: '0 8 1 * *',
        recipient_emails: ['principal@school.com'],
        format: 'pdf' as const,
        active: true,
      };

      const result = await service.create(TENANT_ID, USER_ID, dto);

      expect(result.name).toBe('Monthly Attendance');
      expect(result.format).toBe('pdf');
    });
  });

  describe('update', () => {
    it('should update the name and return updated row', async () => {
      const result = await service.update(TENANT_ID, 'report-1', { name: 'Updated' });

      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException for missing report', async () => {
      mockTx.scheduledReport.findFirst.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, 'missing-id', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete a report without error', async () => {
      await expect(service.delete(TENANT_ID, 'report-1')).resolves.toBeUndefined();
    });

    it('should throw NotFoundException when report does not exist', async () => {
      mockTx.scheduledReport.findFirst.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, 'missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDueReports', () => {
    it('should return all active reports for worker processing', async () => {
      const result = await service.getDueReports();

      expect(result).toHaveLength(1);
      expect(result[0]?.active).toBe(true);
    });
  });

  describe('markSent', () => {
    it('should update last_sent_at to current time', async () => {
      await service.markSent('report-1');

      expect(mockPrisma.scheduledReport.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: expect.objectContaining({ last_sent_at: expect.any(Date) }),
      });
    });
  });

  // ─── impl 17 — getRunHistory ───────────────────────────────────────────

  describe('getRunHistory', () => {
    it('should return paginated run rows with ISO timestamps', async () => {
      const result = await service.getRunHistory(TENANT_ID, 'report-1', 1, 50);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe('run-1');
      expect(result.data[0]?.status).toBe('succeeded');
      expect(result.data[0]?.row_count).toBe(214);
      expect(result.data[0]?.delivered_via).toEqual(['email']);
      expect(result.data[0]?.started_at).toBe('2026-04-25T08:00:00.000Z');
      expect(result.data[0]?.finished_at).toBe('2026-04-25T08:00:21.000Z');
      expect(result.meta).toEqual({ page: 1, pageSize: 50, total: 1 });
    });

    it('should throw NotFoundException when the schedule does not exist', async () => {
      mockTx.scheduledReport.findFirst.mockResolvedValue(null);

      await expect(service.getRunHistory(TENANT_ID, 'missing-id', 1, 50)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should default to page 1 and pageSize 50 when arguments omitted', async () => {
      const result = await service.getRunHistory(TENANT_ID, 'report-1');

      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(50);
      expect(mockTx.scheduledReportRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
    });

    it('should compute skip from page and pageSize', async () => {
      await service.getRunHistory(TENANT_ID, 'report-1', 3, 25);

      expect(mockTx.scheduledReportRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 50, take: 25 }),
      );
    });

    it('should serialise null finished_at as null in the response', async () => {
      mockTx.scheduledReportRun.findMany.mockResolvedValue([
        {
          ...MOCK_SCHEDULED_REPORT_RUN,
          finished_at: null,
          status: 'running',
          row_count: null,
          artifact_object_key: null,
        },
      ]);

      const result = await service.getRunHistory(TENANT_ID, 'report-1', 1, 50);

      expect(result.data[0]?.finished_at).toBeNull();
      expect(result.data[0]?.status).toBe('running');
      expect(result.data[0]?.row_count).toBeNull();
      expect(result.data[0]?.artifact_object_key).toBeNull();
    });

    it('should query runs scoped to both tenant and schedule', async () => {
      await service.getRunHistory(TENANT_ID, 'report-1', 1, 50);

      expect(mockTx.scheduledReportRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { scheduled_report_id: 'report-1', tenant_id: TENANT_ID },
        }),
      );
      expect(mockTx.scheduledReportRun.count).toHaveBeenCalledWith({
        where: { scheduled_report_id: 'report-1', tenant_id: TENANT_ID },
      });
    });
  });
});
