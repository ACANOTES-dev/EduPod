/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

// Mock child-protection module (circular ref resolved via forwardRef at runtime)
jest.mock('../../child-protection/services/cp-export.service', () => ({
  CpExportService: jest.fn(),
}));

import { PastoralEventService } from './pastoral-event.service';
import { PastoralExportService } from './pastoral-export.service';
import { PastoralReportService } from './pastoral-report.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  cpAccessGrant: { findFirst: jest.fn() },
  tenant: { findUnique: jest.fn() },
  tenantBranding: { findUnique: jest.fn() },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockRlsTx),
      ),
  }),
}));

// ─── Mock Services ──────────────────────────────────────────────────────────

const mockReportService = {
  getStudentSummary: jest.fn(),
  getSstActivity: jest.fn(),
};

const mockPdfService = {
  renderPdf: jest.fn().mockResolvedValue(Buffer.from('fake-pdf')),
};

const mockCpExportService = {
  preview: jest.fn(),
  generate: jest.fn(),
  download: jest.fn(),
};

const mockEventService = {
  write: jest.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PastoralExportService', () => {
  let service: PastoralExportService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PastoralExportService,
        { provide: PrismaService, useValue: {} },
        { provide: PastoralEventService, useValue: mockEventService },
        { provide: PastoralReportService, useValue: mockReportService },
        { provide: 'PdfRenderingService', useValue: mockPdfService },
        { provide: 'CpExportService', useValue: mockCpExportService },
      ],
    })
      .overrideProvider(PastoralExportService)
      .useFactory({
        factory: () => {
          // Manually instantiate to wire forwardRef-style injection
          return new PastoralExportService(
            {} as PrismaService,
            mockEventService as unknown as PastoralEventService,
            mockPdfService as unknown as never,
            mockReportService as unknown as PastoralReportService,
            mockCpExportService as unknown as never,
          );
        },
      })
      .compile();

    service = module.get<PastoralExportService>(PastoralExportService);
  });

  // ─── exportStudentSummary ──────────────────────────────────────────────

  describe('exportStudentSummary', () => {
    it('should call reportService, pdfService, record audit event, and return Buffer', async () => {
      const summaryData = { concerns: [], interventions: [] };
      mockReportService.getStudentSummary.mockResolvedValue(summaryData);

      mockRlsTx.tenant.findUnique.mockResolvedValue({
        name: 'Test School',
      });
      mockRlsTx.tenantBranding.findUnique.mockResolvedValue(null);

      const result = await service.exportStudentSummary(
        TENANT_ID,
        ACTOR_USER_ID,
        STUDENT_ID,
        'en',
      );

      expect(mockReportService.getStudentSummary).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        STUDENT_ID,
        {},
      );
      expect(mockPdfService.renderPdf).toHaveBeenCalledWith(
        'pastoral-summary',
        'en',
        summaryData,
        expect.objectContaining({ school_name: 'Test School' }),
      );
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should record audit event with tier=1', async () => {
      mockReportService.getStudentSummary.mockResolvedValue({});
      mockRlsTx.tenant.findUnique.mockResolvedValue({ name: 'School' });
      mockRlsTx.tenantBranding.findUnique.mockResolvedValue(null);

      await service.exportStudentSummary(
        TENANT_ID,
        ACTOR_USER_ID,
        STUDENT_ID,
        'en',
      );

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'record_exported',
          actor_user_id: ACTOR_USER_ID,
          tier: 1,
        }),
      );
    });
  });

  // ─── exportSstActivity ────────────────────────────────────────────────

  describe('exportSstActivity', () => {
    it('should generate PDF and record audit event', async () => {
      const sstData = { meetings: [], actions: [] };
      mockReportService.getSstActivity.mockResolvedValue(sstData);

      mockRlsTx.tenant.findUnique.mockResolvedValue({
        name: 'Test School',
      });
      mockRlsTx.tenantBranding.findUnique.mockResolvedValue(null);

      const filters = { from_date: '2026-01-01', to_date: '2026-03-01' };
      const result = await service.exportSstActivity(
        TENANT_ID,
        ACTOR_USER_ID,
        filters,
        'en',
      );

      expect(mockReportService.getSstActivity).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        filters,
      );
      expect(mockPdfService.renderPdf).toHaveBeenCalledWith(
        'sst-activity',
        'en',
        sstData,
        expect.objectContaining({ school_name: 'Test School' }),
      );
      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'record_exported',
          tier: 2,
        }),
      );
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  // ─── initTier3Export ──────────────────────────────────────────────────

  describe('initTier3Export', () => {
    it('should succeed when user has cp_access', async () => {
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue({
        id: 'grant-1',
        tenant_id: TENANT_ID,
        user_id: ACTOR_USER_ID,
        revoked_at: null,
      });

      const previewResult: {
        data: {
          preview_token: string;
          record_count: number;
          student_name: string;
          date_range: { from: string; to: string };
          record_types_found: string[];
        };
      } = {
        data: {
          preview_token: 'token-123',
          record_count: 5,
          student_name: 'John Doe',
          date_range: { from: '2026-01-01', to: '2026-03-01' },
          record_types_found: ['concern', 'mandated_report'],
        },
      };
      mockCpExportService.preview.mockResolvedValue(previewResult);

      const result = await service.initTier3Export(TENANT_ID, ACTOR_USER_ID, {
        purpose: 'tusla_request',
        student_id: STUDENT_ID,
        from_date: '2026-01-01',
        to_date: '2026-03-01',
      });

      expect(result).toEqual(previewResult.data);
      expect(mockCpExportService.preview).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        expect.objectContaining({
          student_id: STUDENT_ID,
          date_from: '2026-01-01',
          date_to: '2026-03-01',
        }),
        null,
      );
    });

    it('should throw ForbiddenException when user lacks cp_access', async () => {
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue(null);

      await expect(
        service.initTier3Export(TENANT_ID, ACTOR_USER_ID, {
          purpose: 'tusla_request',
          student_id: STUDENT_ID,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── confirmTier3Export ───────────────────────────────────────────────

  describe('confirmTier3Export', () => {
    it('should delegate to cpExportService.generate', async () => {
      const generateResult = {
        data: {
          download_token: 'dl-token-1',
          export_ref_id: 'CPX-202603-0001',
          filename: 'CP-Export-John-Doe-CPX-202603-0001.pdf',
        },
      };
      mockCpExportService.generate.mockResolvedValue(generateResult);

      const result = await service.confirmTier3Export(
        TENANT_ID,
        ACTOR_USER_ID,
        'some-export-id',
      );

      expect(result).toEqual(generateResult.data);
      expect(mockCpExportService.generate).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        expect.objectContaining({
          student_id: 'some-export-id',
        }),
        null,
      );
    });
  });

  // ─── downloadTier3Export ──────────────────────────────────────────────

  describe('downloadTier3Export', () => {
    it('should delegate to cpExportService.download', async () => {
      const downloadResult = {
        buffer: Buffer.from('pdf-content'),
        filename: 'CP-Export-John-Doe-CPX-202603-0001.pdf',
        contentType: 'application/pdf',
      };
      mockCpExportService.download.mockResolvedValue(downloadResult);

      const result = await service.downloadTier3Export(
        TENANT_ID,
        ACTOR_USER_ID,
        'dl-token-1',
      );

      expect(result).toEqual(downloadResult);
      expect(mockCpExportService.download).toHaveBeenCalledWith(
        'dl-token-1',
        null,
      );
    });
  });

  // ─── getTenantBranding ────────────────────────────────────────────────

  describe('getTenantBranding', () => {
    it('should return branding from tenant settings', async () => {
      mockRlsTx.tenant.findUnique.mockResolvedValue({
        name: 'St. Patrick School',
      });
      mockRlsTx.tenantBranding.findUnique.mockResolvedValue({
        school_name_display: 'St. Patrick Primary',
        school_name_ar: 'مدرسة القديس باتريك',
        logo_url: 'https://example.com/logo.png',
        primary_color: '#1E3A5F',
      });

      const result = await service.getTenantBranding(TENANT_ID);

      expect(result).toEqual({
        school_name: 'St. Patrick Primary',
        school_name_ar: 'مدرسة القديس باتريك',
        logo_url: 'https://example.com/logo.png',
        primary_color: '#1E3A5F',
      });
    });

    it('should return defaults when no branding settings exist', async () => {
      mockRlsTx.tenant.findUnique.mockResolvedValue({
        name: 'Default School',
      });
      mockRlsTx.tenantBranding.findUnique.mockResolvedValue(null);

      const result = await service.getTenantBranding(TENANT_ID);

      expect(result).toEqual({
        school_name: 'Default School',
        school_name_ar: undefined,
        logo_url: undefined,
        primary_color: undefined,
      });
    });
  });
});
