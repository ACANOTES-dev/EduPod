import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PastoralExportService } from '../services/pastoral-export.service';
import { PastoralReportService } from '../services/pastoral-report.service';

import { PastoralReportsController } from './pastoral-reports.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const EXPORT_ID = '33333333-3333-3333-3333-333333333333';

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
  email: 'test@example.com',
  tenant_id: TENANT_ID,
  membership_id: '44444444-4444-4444-4444-444444444444',
  type: 'access',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
};

// ─── Mock Services ──────────────────────────────────────────────────────────

const mockReportService = {
  getStudentSummary: jest.fn(),
  getSstActivity: jest.fn(),
  getSafeguardingCompliance: jest.fn(),
  getWellbeingProgramme: jest.fn(),
  getDesInspection: jest.fn(),
};

const mockExportService = {
  exportStudentSummary: jest.fn(),
  exportSstActivity: jest.fn(),
  renderPdf: jest.fn(),
  initTier3Export: jest.fn(),
  confirmTier3Export: jest.fn(),
  downloadTier3Export: jest.fn(),
  getTenantBranding: jest.fn(),
};

// ─── Mock Response ──────────────────────────────────────────────────────────

function createMockResponse(): Record<string, jest.Mock> {
  return {
    set: jest.fn(),
    end: jest.fn(),
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PastoralReportsController', () => {
  let controller: PastoralReportsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PastoralReportsController],
      providers: [
        { provide: PastoralReportService, useValue: mockReportService },
        { provide: PastoralExportService, useValue: mockExportService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PastoralReportsController>(PastoralReportsController);

    jest.clearAllMocks();
  });

  // ─── Guard / Decorator Metadata ─────────────────────────────────────────

  describe('class-level metadata', () => {
    it('should have @ModuleEnabled("pastoral") on the class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, PastoralReportsController);
      expect(moduleKey).toBe('pastoral');
    });
  });

  describe('report endpoint permissions', () => {
    it('should require pastoral.view_reports on getStudentSummary', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralReportsController.prototype.getStudentSummary,
      );
      expect(permission).toBe('pastoral.view_reports');
    });

    it('should require pastoral.view_reports on getStudentSummaryPdf', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralReportsController.prototype.getStudentSummaryPdf,
      );
      expect(permission).toBe('pastoral.view_reports');
    });

    it('should require pastoral.view_reports on getSstActivity', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralReportsController.prototype.getSstActivity,
      );
      expect(permission).toBe('pastoral.view_reports');
    });

    it('should require pastoral.view_reports on getSstActivityPdf', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralReportsController.prototype.getSstActivityPdf,
      );
      expect(permission).toBe('pastoral.view_reports');
    });

    it('should require pastoral.view_reports on getSafeguardingCompliance', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralReportsController.prototype.getSafeguardingCompliance,
      );
      expect(permission).toBe('pastoral.view_reports');
    });

    it('should require pastoral.view_reports on getSafeguardingCompliancePdf', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralReportsController.prototype.getSafeguardingCompliancePdf,
      );
      expect(permission).toBe('pastoral.view_reports');
    });

    it('should require pastoral.view_reports on getWellbeingProgramme', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralReportsController.prototype.getWellbeingProgramme,
      );
      expect(permission).toBe('pastoral.view_reports');
    });

    it('should require pastoral.view_reports on getWellbeingProgrammePdf', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralReportsController.prototype.getWellbeingProgrammePdf,
      );
      expect(permission).toBe('pastoral.view_reports');
    });

    it('should require pastoral.view_reports on getDesInspectionPdf', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralReportsController.prototype.getDesInspectionPdf,
      );
      expect(permission).toBe('pastoral.view_reports');
    });
  });

  describe('Tier 1/2 export endpoint permissions', () => {
    it('should require pastoral.export_tier1_2 on exportStudentSummary', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralReportsController.prototype.exportStudentSummary,
      );
      expect(permission).toBe('pastoral.export_tier1_2');
    });

    it('should require pastoral.export_tier1_2 on exportSstActivity', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralReportsController.prototype.exportSstActivity,
      );
      expect(permission).toBe('pastoral.export_tier1_2');
    });
  });

  describe('Tier 3 export endpoint permissions', () => {
    it('should require pastoral.export_tier3 on initTier3Export', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralReportsController.prototype.initTier3Export,
      );
      expect(permission).toBe('pastoral.export_tier3');
    });

    it('should require pastoral.export_tier3 on confirmTier3Export', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralReportsController.prototype.confirmTier3Export,
      );
      expect(permission).toBe('pastoral.export_tier3');
    });

    it('should require pastoral.export_tier3 on downloadTier3Export', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralReportsController.prototype.downloadTier3Export,
      );
      expect(permission).toBe('pastoral.export_tier3');
    });
  });

  // ─── Report Delegation ──────────────────────────────────────────────────

  describe('getStudentSummary', () => {
    it('should delegate to reportService.getStudentSummary', async () => {
      const mockResult = { data: { student: 'summary' } };
      mockReportService.getStudentSummary.mockResolvedValue(mockResult);

      const query = { include_resolved: false };
      const result = await controller.getStudentSummary(TENANT, USER, STUDENT_ID, query);

      expect(mockReportService.getStudentSummary).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        query,
      );
      expect(result).toBe(mockResult);
    });
  });

  describe('getStudentSummaryPdf', () => {
    it('should delegate to exportService.exportStudentSummary and set PDF headers', async () => {
      const pdfBuffer = Buffer.from('fake-pdf');
      mockExportService.exportStudentSummary.mockResolvedValue(pdfBuffer);

      const res = createMockResponse();
      await controller.getStudentSummaryPdf(
        TENANT,
        USER,
        STUDENT_ID,
        'en',
        res as unknown as import('express').Response,
      );

      expect(mockExportService.exportStudentSummary).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        'en',
      );
      expect(res.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': expect.stringContaining('.pdf'),
      });
      expect(res.end).toHaveBeenCalledWith(pdfBuffer);
    });

    it('should default locale to en for student summary PDFs', async () => {
      const pdfBuffer = Buffer.from('fake-pdf');
      mockExportService.exportStudentSummary.mockResolvedValue(pdfBuffer);

      await controller.getStudentSummaryPdf(
        TENANT,
        USER,
        STUDENT_ID,
        undefined as unknown as string,
        createMockResponse() as unknown as import('express').Response,
      );

      expect(mockExportService.exportStudentSummary).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        'en',
      );
    });
  });

  describe('getSstActivity', () => {
    it('should delegate to reportService.getSstActivity', async () => {
      const mockResult = { data: { meetings: [] } };
      mockReportService.getSstActivity.mockResolvedValue(mockResult);

      const query = { from_date: '2026-01-01' };
      const result = await controller.getSstActivity(TENANT, USER, query);

      expect(mockReportService.getSstActivity).toHaveBeenCalledWith(TENANT_ID, USER_ID, query);
      expect(result).toBe(mockResult);
    });
  });

  describe('getSstActivityPdf', () => {
    it('should delegate to exportService.exportSstActivity and set PDF headers', async () => {
      const pdfBuffer = Buffer.from('fake-pdf');
      mockExportService.exportSstActivity.mockResolvedValue(pdfBuffer);

      const res = createMockResponse();
      const query = {};
      await controller.getSstActivityPdf(
        TENANT,
        USER,
        query,
        'ar',
        res as unknown as import('express').Response,
      );

      expect(mockExportService.exportSstActivity).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        query,
        'ar',
      );
      expect(res.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': expect.stringContaining('.pdf'),
      });
      expect(res.end).toHaveBeenCalledWith(pdfBuffer);
    });

    it('should default locale to en for SST activity PDFs', async () => {
      mockExportService.exportSstActivity.mockResolvedValue(Buffer.from('fake-pdf'));

      await controller.getSstActivityPdf(
        TENANT,
        USER,
        {},
        undefined as unknown as string,
        createMockResponse() as unknown as import('express').Response,
      );

      expect(mockExportService.exportSstActivity).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        {},
        'en',
      );
    });
  });

  describe('getSafeguardingCompliance', () => {
    it('should delegate to reportService.getSafeguardingCompliance', async () => {
      const mockResult = { data: { compliance: true } };
      mockReportService.getSafeguardingCompliance.mockResolvedValue(mockResult);

      const query = {};
      const result = await controller.getSafeguardingCompliance(TENANT, USER, query);

      expect(mockReportService.getSafeguardingCompliance).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        query,
      );
      expect(result).toBe(mockResult);
    });
  });

  describe('getSafeguardingCompliancePdf', () => {
    it('should fetch data via reportService and render via exportService.renderPdf', async () => {
      const reportData = { data: { compliance: true } };
      const pdfBuffer = Buffer.from('fake-pdf');
      mockReportService.getSafeguardingCompliance.mockResolvedValue(reportData);
      mockExportService.renderPdf.mockResolvedValue(pdfBuffer);

      const res = createMockResponse();
      const query = {};
      await controller.getSafeguardingCompliancePdf(
        TENANT,
        USER,
        query,
        'en',
        res as unknown as import('express').Response,
      );

      expect(mockReportService.getSafeguardingCompliance).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        query,
      );
      expect(mockExportService.renderPdf).toHaveBeenCalledWith(
        'safeguarding-compliance',
        reportData,
        'en',
        TENANT_ID,
      );
      expect(res.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': expect.stringContaining('.pdf'),
      });
      expect(res.end).toHaveBeenCalledWith(pdfBuffer);
    });

    it('should default locale to en for safeguarding PDFs', async () => {
      mockReportService.getSafeguardingCompliance.mockResolvedValue({ data: { compliance: true } });
      mockExportService.renderPdf.mockResolvedValue(Buffer.from('fake-pdf'));

      await controller.getSafeguardingCompliancePdf(
        TENANT,
        USER,
        {},
        undefined as unknown as string,
        createMockResponse() as unknown as import('express').Response,
      );

      expect(mockExportService.renderPdf).toHaveBeenCalledWith(
        'safeguarding-compliance',
        { data: { compliance: true } },
        'en',
        TENANT_ID,
      );
    });
  });

  describe('getWellbeingProgramme', () => {
    it('should delegate to reportService.getWellbeingProgramme', async () => {
      const mockResult = { data: { programme: 'data' } };
      mockReportService.getWellbeingProgramme.mockResolvedValue(mockResult);

      const query = {};
      const result = await controller.getWellbeingProgramme(TENANT, USER, query);

      expect(mockReportService.getWellbeingProgramme).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        query,
      );
      expect(result).toBe(mockResult);
    });
  });

  describe('getWellbeingProgrammePdf', () => {
    it('should fetch data via reportService and render via exportService.renderPdf', async () => {
      const reportData = { data: { programme: 'data' } };
      const pdfBuffer = Buffer.from('fake-pdf');
      mockReportService.getWellbeingProgramme.mockResolvedValue(reportData);
      mockExportService.renderPdf.mockResolvedValue(pdfBuffer);

      const res = createMockResponse();
      const query = {};
      await controller.getWellbeingProgrammePdf(
        TENANT,
        USER,
        query,
        'en',
        res as unknown as import('express').Response,
      );

      expect(mockReportService.getWellbeingProgramme).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        query,
      );
      expect(mockExportService.renderPdf).toHaveBeenCalledWith(
        'wellbeing-programme',
        reportData,
        'en',
        TENANT_ID,
      );
      expect(res.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': expect.stringContaining('.pdf'),
      });
      expect(res.end).toHaveBeenCalledWith(pdfBuffer);
    });

    it('should default locale to en for wellbeing PDFs', async () => {
      mockReportService.getWellbeingProgramme.mockResolvedValue({ data: { programme: 'data' } });
      mockExportService.renderPdf.mockResolvedValue(Buffer.from('fake-pdf'));

      await controller.getWellbeingProgrammePdf(
        TENANT,
        USER,
        {},
        undefined as unknown as string,
        createMockResponse() as unknown as import('express').Response,
      );

      expect(mockExportService.renderPdf).toHaveBeenCalledWith(
        'wellbeing-programme',
        { data: { programme: 'data' } },
        'en',
        TENANT_ID,
      );
    });
  });

  describe('getDesInspectionPdf', () => {
    it('should render DES inspection PDF via exportService.renderPdf', async () => {
      const reportData = { data: { inspection: 'data' } };
      const pdfBuffer = Buffer.from('fake-pdf');
      mockReportService.getDesInspection.mockResolvedValue(reportData);
      mockExportService.renderPdf.mockResolvedValue(pdfBuffer);

      const res = createMockResponse();
      const query = {};
      await controller.getDesInspectionPdf(
        TENANT,
        USER,
        query,
        'en',
        res as unknown as import('express').Response,
      );

      expect(mockExportService.renderPdf).toHaveBeenCalledWith(
        'des-inspection',
        reportData,
        'en',
        TENANT_ID,
      );
      expect(res.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': expect.stringContaining('.pdf'),
      });
      expect(res.end).toHaveBeenCalledWith(pdfBuffer);
    });

    it('should default locale to en for DES inspection PDFs', async () => {
      mockReportService.getDesInspection.mockResolvedValue({ data: { inspection: 'data' } });
      mockExportService.renderPdf.mockResolvedValue(Buffer.from('fake-pdf'));

      await controller.getDesInspectionPdf(
        TENANT,
        USER,
        {},
        undefined as unknown as string,
        createMockResponse() as unknown as import('express').Response,
      );

      expect(mockExportService.renderPdf).toHaveBeenCalledWith(
        'des-inspection',
        { data: { inspection: 'data' } },
        'en',
        TENANT_ID,
      );
    });
  });

  // ─── Export Delegation ──────────────────────────────────────────────────

  describe('exportStudentSummary', () => {
    it('should delegate to exportService.exportStudentSummary', async () => {
      const mockResult = Buffer.from('pdf');
      mockExportService.exportStudentSummary.mockResolvedValue(mockResult);

      const result = await controller.exportStudentSummary(TENANT, USER, STUDENT_ID, 'en');

      expect(mockExportService.exportStudentSummary).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        'en',
      );
      expect(result).toBe(mockResult);
    });

    it('should default locale to en when exporting student summaries', async () => {
      mockExportService.exportStudentSummary.mockResolvedValue(Buffer.from('pdf'));

      await controller.exportStudentSummary(
        TENANT,
        USER,
        STUDENT_ID,
        undefined as unknown as string,
      );

      expect(mockExportService.exportStudentSummary).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        'en',
      );
    });
  });

  describe('exportSstActivity', () => {
    it('should delegate to exportService.exportSstActivity', async () => {
      const mockResult = Buffer.from('pdf');
      mockExportService.exportSstActivity.mockResolvedValue(mockResult);

      const query = {};
      const result = await controller.exportSstActivity(TENANT, USER, query, 'en');

      expect(mockExportService.exportSstActivity).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        query,
        'en',
      );
      expect(result).toBe(mockResult);
    });

    it('should default locale to en when exporting SST activity', async () => {
      mockExportService.exportSstActivity.mockResolvedValue(Buffer.from('pdf'));

      await controller.exportSstActivity(TENANT, USER, {}, undefined as unknown as string);

      expect(mockExportService.exportSstActivity).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        {},
        'en',
      );
    });
  });

  describe('initTier3Export', () => {
    it('should delegate to exportService.initTier3Export', async () => {
      const mockResult = { data: { export_id: EXPORT_ID } };
      mockExportService.initTier3Export.mockResolvedValue(mockResult);

      const body = { purpose: 'tusla_request' as const };
      const result = await controller.initTier3Export(TENANT, USER, body);

      expect(mockExportService.initTier3Export).toHaveBeenCalledWith(TENANT_ID, USER_ID, body);
      expect(result).toBe(mockResult);
    });
  });

  describe('confirmTier3Export', () => {
    it('should delegate to exportService.confirmTier3Export', async () => {
      const mockResult = { data: { confirmed: true } };
      mockExportService.confirmTier3Export.mockResolvedValue(mockResult);

      const result = await controller.confirmTier3Export(TENANT, USER, EXPORT_ID);

      expect(mockExportService.confirmTier3Export).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        EXPORT_ID,
      );
      expect(result).toBe(mockResult);
    });
  });

  describe('downloadTier3Export', () => {
    it('should delegate to exportService.downloadTier3Export', async () => {
      const mockResult = { data: { url: 'https://example.com/file.pdf' } };
      mockExportService.downloadTier3Export.mockResolvedValue(mockResult);

      const result = await controller.downloadTier3Export(TENANT, USER, EXPORT_ID);

      expect(mockExportService.downloadTier3Export).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        EXPORT_ID,
      );
      expect(result).toBe(mockResult);
    });
  });
});
