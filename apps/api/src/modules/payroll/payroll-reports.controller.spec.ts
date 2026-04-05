import { Test } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { PayrollReportsController } from './payroll-reports.controller';
import { PayrollReportsService } from './payroll-reports.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RUN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STAFF_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const tenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const mockService = {
  getCostTrend: jest.fn(),
  getYtdSummary: jest.fn(),
  getBonusAnalysis: jest.fn(),
  getMonthlySummary: jest.fn(),
  exportMonthlySummary: jest.fn(),
  exportYtdSummary: jest.fn(),
  getStaffPaymentHistory: jest.fn(),
};

describe('PayrollReportsController', () => {
  let controller: PayrollReportsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [PayrollReportsController],
      providers: [{ provide: PayrollReportsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PayrollReportsController>(PayrollReportsController);
  });

  describe('getCostTrend', () => {
    it('should delegate to service with tenant_id and optional year', async () => {
      const trend = [{ period_month: 3, period_year: 2026, total_pay: 5000 }];
      mockService.getCostTrend.mockResolvedValue(trend);

      const result = await controller.getCostTrend(tenantContext, { period_year: 2026 });

      expect(mockService.getCostTrend).toHaveBeenCalledWith(TENANT_ID, 2026);
      expect(result).toEqual(trend);
    });
  });

  describe('getYtdSummary', () => {
    it('should delegate to service with tenant_id, year, page, and pageSize', async () => {
      const summary = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockService.getYtdSummary.mockResolvedValue(summary);

      const result = await controller.getYtdSummary(tenantContext, {
        period_year: 2026,
        page: 1,
        pageSize: 20,
      });

      expect(mockService.getYtdSummary).toHaveBeenCalledWith(TENANT_ID, 2026, 1, 20);
      expect(result).toEqual(summary);
    });
  });

  describe('getBonusAnalysis', () => {
    it('should delegate to service with tenant_id and optional year', async () => {
      const analysis = [{ staff_profile_id: STAFF_ID, total_bonus_amount: 500 }];
      mockService.getBonusAnalysis.mockResolvedValue(analysis);

      const result = await controller.getBonusAnalysis(tenantContext, { period_year: 2026 });

      expect(mockService.getBonusAnalysis).toHaveBeenCalledWith(TENANT_ID, 2026);
      expect(result).toEqual(analysis);
    });
  });

  describe('getMonthlySummary', () => {
    it('should delegate to service with tenant_id and runId', async () => {
      const summary = { run: { id: RUN_ID }, entries: [] };
      mockService.getMonthlySummary.mockResolvedValue(summary);

      const result = await controller.getMonthlySummary(tenantContext, RUN_ID);

      expect(mockService.getMonthlySummary).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
      expect(result).toEqual(summary);
    });
  });

  describe('getStaffPaymentHistory', () => {
    it('should delegate to service with tenant_id, staffProfileId, page, and pageSize', async () => {
      const history = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockService.getStaffPaymentHistory.mockResolvedValue(history);

      const result = await controller.getStaffPaymentHistory(tenantContext, STAFF_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(mockService.getStaffPaymentHistory).toHaveBeenCalledWith(TENANT_ID, STAFF_ID, 1, 20);
      expect(result).toEqual(history);
    });
  });

  // ─── Export endpoints (CSV vs PDF branches) ────────────────────────────────

  describe('exportYtdSummary', () => {
    it('should set CSV headers and send content when format is csv', async () => {
      const csvResult = {
        format: 'csv',
        content: 'staff,total\nAlice,5000',
        filename: 'ytd-2026.csv',
      };
      mockService.exportYtdSummary.mockResolvedValue(csvResult);

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        json: jest.fn(),
      };

      await controller.exportYtdSummary(
        tenantContext,
        { format: 'csv' as const, period_year: 2026 },
        mockRes as unknown as import('express').Response,
      );

      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="ytd-2026.csv"',
      });
      expect(mockRes.send).toHaveBeenCalledWith('staff,total\nAlice,5000');
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should return JSON when format is pdf', async () => {
      const pdfResult = { format: 'pdf', data: { summary: [] } };
      mockService.exportYtdSummary.mockResolvedValue(pdfResult);

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        json: jest.fn(),
      };

      await controller.exportYtdSummary(
        tenantContext,
        { format: 'pdf' as const },
        mockRes as unknown as import('express').Response,
      );

      expect(mockRes.json).toHaveBeenCalledWith(pdfResult);
      expect(mockRes.send).not.toHaveBeenCalled();
    });
  });

  describe('exportMonthlySummary', () => {
    it('should set CSV headers and send content when format is csv', async () => {
      const csvResult = {
        format: 'csv',
        content: 'name,pay\nBob,3000',
        filename: 'monthly-run.csv',
      };
      mockService.exportMonthlySummary.mockResolvedValue(csvResult);

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        json: jest.fn(),
      };

      await controller.exportMonthlySummary(
        tenantContext,
        RUN_ID,
        { format: 'csv' as const },
        mockRes as unknown as import('express').Response,
      );

      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="monthly-run.csv"',
      });
      expect(mockRes.send).toHaveBeenCalledWith('name,pay\nBob,3000');
    });

    it('should return JSON when format is pdf', async () => {
      const pdfResult = { format: 'pdf', data: { entries: [] } };
      mockService.exportMonthlySummary.mockResolvedValue(pdfResult);

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        json: jest.fn(),
      };

      await controller.exportMonthlySummary(
        tenantContext,
        RUN_ID,
        { format: 'pdf' as const },
        mockRes as unknown as import('express').Response,
      );

      expect(mockRes.json).toHaveBeenCalledWith(pdfResult);
      expect(mockRes.send).not.toHaveBeenCalled();
    });
  });
});
