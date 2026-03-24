import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { AiReportNarratorService } from './ai-report-narrator.service';
import { BoardReportService } from './board-report.service';
import { UnifiedDashboardService } from './unified-dashboard.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const MOCK_REPORT = {
  id: 'report-1',
  tenant_id: TENANT_ID,
  title: 'Q1 Board Report',
  academic_period_id: null,
  report_type: 'quarterly',
  sections_json: {},
  generated_at: new Date('2026-03-01'),
  generated_by_user_id: USER_ID,
  file_url: null,
  created_at: new Date('2026-03-01'),
  updated_at: new Date('2026-03-01'),
};

const mockTx = {
  boardReport: {
    findMany: jest.fn().mockResolvedValue([MOCK_REPORT]),
    count: jest.fn().mockResolvedValue(1),
    findFirst: jest.fn().mockResolvedValue(MOCK_REPORT),
    create: jest.fn().mockResolvedValue(MOCK_REPORT),
    delete: jest.fn().mockResolvedValue(MOCK_REPORT),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('BoardReportService', () => {
  let service: BoardReportService;
  let mockUnifiedDashboard: { getKpiDashboard: jest.Mock };
  let mockAiNarrator: { generateNarrative: jest.Mock };

  beforeEach(async () => {
    mockUnifiedDashboard = {
      getKpiDashboard: jest.fn().mockResolvedValue({
        total_students: 100,
        active_staff_count: 20,
        attendance_rate: 90,
        generated_at: new Date().toISOString(),
      }),
    };
    mockAiNarrator = {
      generateNarrative: jest.fn().mockResolvedValue('Executive summary text.'),
    };

    // Reset transaction mocks
    mockTx.boardReport.findMany.mockResolvedValue([MOCK_REPORT]);
    mockTx.boardReport.count.mockResolvedValue(1);
    mockTx.boardReport.findFirst.mockResolvedValue(MOCK_REPORT);
    mockTx.boardReport.create.mockResolvedValue(MOCK_REPORT);
    mockTx.boardReport.delete.mockResolvedValue(MOCK_REPORT);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardReportService,
        { provide: PrismaService, useValue: {} },
        { provide: UnifiedDashboardService, useValue: mockUnifiedDashboard },
        { provide: AiReportNarratorService, useValue: mockAiNarrator },
      ],
    }).compile();

    service = module.get<BoardReportService>(BoardReportService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('listBoardReports', () => {
    it('should return paginated board reports', async () => {
      const result = await service.listBoardReports(TENANT_ID, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.data[0]?.id).toBe('report-1');
    });
  });

  describe('getBoardReport', () => {
    it('should return a single board report by id', async () => {
      const result = await service.getBoardReport(TENANT_ID, 'report-1');

      expect(result.id).toBe('report-1');
      expect(result.title).toBe('Q1 Board Report');
    });

    it('should throw NotFoundException when report does not exist', async () => {
      mockTx.boardReport.findFirst.mockResolvedValue(null);

      await expect(service.getBoardReport(TENANT_ID, 'missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateBoardReport', () => {
    it('should collect KPI data and generate AI narrative', async () => {
      const dto = {
        title: 'Q1 Board Report',
        report_type: 'termly' as const,
        sections_json: ['attendance', 'grades'],
      };

      const result = await service.generateBoardReport(TENANT_ID, USER_ID, dto);

      expect(mockUnifiedDashboard.getKpiDashboard).toHaveBeenCalledWith(TENANT_ID);
      expect(mockAiNarrator.generateNarrative).toHaveBeenCalled();
      expect(result.executive_summary).toBe('Executive summary text.');
    });

    it('should still create report when AI narrator fails', async () => {
      mockAiNarrator.generateNarrative.mockRejectedValue(new Error('AI unavailable'));

      const dto = {
        title: 'Q1 Board Report',
        report_type: 'termly' as const,
        sections_json: ['attendance'],
      };

      const result = await service.generateBoardReport(TENANT_ID, USER_ID, dto);

      expect(result.id).toBe('report-1');
      expect(result.executive_summary).toBeNull();
    });
  });

  describe('deleteBoardReport', () => {
    it('should delete an existing report without error', async () => {
      await expect(service.deleteBoardReport(TENANT_ID, 'report-1')).resolves.toBeUndefined();
    });

    it('should throw NotFoundException when report does not exist', async () => {
      mockTx.boardReport.findFirst.mockResolvedValue(null);

      await expect(service.deleteBoardReport(TENANT_ID, 'missing-id')).rejects.toThrow(NotFoundException);
    });
  });
});
