import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { S3Service } from '../../s3/s3.service';
import { TenantReadFacade } from '../../tenants/tenant-read.facade';

import { ExcelRenderer } from './renderers/excel-renderer';
import { PdfRenderer } from './renderers/pdf-renderer';
import { WordRenderer } from './renderers/word-renderer';
import { ReportExportService } from './report-export.service';
import type { ExportInput } from './report-export.types';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

const BASE_INPUT: Omit<ExportInput, 'branding'> = {
  tenantId: TENANT_ID,
  report: {
    name: 'Year 10 Attendance Snapshot',
    description: 'Weekly attendance by year group',
    filters_summary: 'Year 10 · this term',
    generated_by: 'owner@nhqs.test',
    generated_at: new Date('2026-04-24T09:00:00Z'),
  },
  data: {
    columns: [
      { id: 'student', label: 'Student', type: 'string' },
      { id: 'rate', label: 'Attendance rate', type: 'number' },
      { id: 'paid', label: 'Fees paid', type: 'currency' },
      { id: 'last_seen', label: 'Last seen', type: 'date' },
      { id: 'at_risk', label: 'At risk', type: 'boolean' },
    ],
    rows: [
      {
        student: 'Alice Andrews',
        rate: 0.94,
        paid: 1200.5,
        last_seen: new Date('2026-04-22T13:00:00Z'),
        at_risk: false,
      },
      {
        student: 'Bashir Bokova',
        rate: 0.82,
        paid: 0,
        last_seen: new Date('2026-04-23T08:00:00Z'),
        at_risk: true,
      },
    ],
  },
};

const EN_BRANDING = {
  tenant_id: TENANT_ID,
  school_name: 'NHQS Academy',
  logo_url: null,
  primary_color: '#1d4ed8',
  secondary_color: '#64748b',
  locale: 'en' as const,
  currency_code: 'EUR',
};

describe('ReportExportService', () => {
  let service: ReportExportService;
  let pdfRenderer: jest.Mocked<Pick<PdfRenderer, 'render'>>;
  let excelRenderer: jest.Mocked<Pick<ExcelRenderer, 'render'>>;
  let wordRenderer: jest.Mocked<Pick<WordRenderer, 'render'>>;
  let tenantReadFacade: jest.Mocked<Pick<TenantReadFacade, 'findById' | 'findBranding'>>;
  let s3: jest.Mocked<Pick<S3Service, 'getPresignedUrl'>>;

  beforeEach(async () => {
    pdfRenderer = { render: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4\n...')) };
    excelRenderer = { render: jest.fn().mockResolvedValue(Buffer.from('PKfake-xlsx')) };
    wordRenderer = { render: jest.fn().mockResolvedValue(Buffer.from('PKfake-docx')) };
    tenantReadFacade = {
      findById: jest.fn().mockResolvedValue({
        id: TENANT_ID,
        name: 'NHQS Academy',
        slug: 'nhqs',
        status: 'active',
        default_locale: 'en',
        supported_locales: ['en', 'ar'],
        timezone: 'Europe/Dublin',
        date_format: 'dd/MM/yyyy',
        currency_code: 'EUR',
        academic_year_start_month: 9,
      }),
      findBranding: jest.fn().mockResolvedValue(null),
    };
    s3 = { getPresignedUrl: jest.fn().mockResolvedValue('https://s3.signed/logo.png') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportExportService,
        { provide: PdfRenderer, useValue: pdfRenderer },
        { provide: ExcelRenderer, useValue: excelRenderer },
        { provide: WordRenderer, useValue: wordRenderer },
        { provide: TenantReadFacade, useValue: tenantReadFacade },
        { provide: S3Service, useValue: s3 },
      ],
    }).compile();

    service = module.get<ReportExportService>(ReportExportService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('exportByFormat', () => {
    it('routes pdf requests to the PDF renderer', async () => {
      await service.exportByFormat('pdf', { ...BASE_INPUT, branding: EN_BRANDING });
      expect(pdfRenderer.render).toHaveBeenCalledTimes(1);
      expect(excelRenderer.render).not.toHaveBeenCalled();
      expect(wordRenderer.render).not.toHaveBeenCalled();
    });

    it('routes excel requests to the Excel renderer', async () => {
      await service.exportByFormat('excel', { ...BASE_INPUT, branding: EN_BRANDING });
      expect(excelRenderer.render).toHaveBeenCalledTimes(1);
    });

    it('routes word requests to the Word renderer', async () => {
      await service.exportByFormat('word', { ...BASE_INPUT, branding: EN_BRANDING });
      expect(wordRenderer.render).toHaveBeenCalledTimes(1);
    });

    it('exportPdf delegates directly to the PDF renderer', async () => {
      await service.exportPdf({ ...BASE_INPUT, branding: EN_BRANDING });
      expect(pdfRenderer.render).toHaveBeenCalledTimes(1);
    });

    it('exportExcel delegates directly to the Excel renderer', async () => {
      await service.exportExcel({ ...BASE_INPUT, branding: EN_BRANDING });
      expect(excelRenderer.render).toHaveBeenCalledTimes(1);
    });

    it('exportWord delegates directly to the Word renderer', async () => {
      await service.exportWord({ ...BASE_INPUT, branding: EN_BRANDING });
      expect(wordRenderer.render).toHaveBeenCalledTimes(1);
    });

    it('exportByFormat throws on an unsupported format', async () => {
      await expect(
        service.exportByFormat('csv' as unknown as Parameters<typeof service.exportByFormat>[0], {
          ...BASE_INPUT,
          branding: EN_BRANDING,
        }),
      ).rejects.toThrow(/Unsupported export format/);
    });
  });

  describe('getTenantBranding', () => {
    it('falls back to platform defaults when no TenantBranding row exists', async () => {
      const branding = await service.getTenantBranding(TENANT_ID);
      expect(branding.primary_color).toBe('#0f172a');
      expect(branding.secondary_color).toBe('#64748b');
      expect(branding.logo_url).toBeNull();
      expect(branding.school_name).toBe('NHQS Academy');
      expect(branding.currency_code).toBe('EUR');
      expect(branding.locale).toBe('en');
    });

    it('uses tenant branding fields when present and presigns the logo', async () => {
      tenantReadFacade.findBranding.mockResolvedValueOnce({
        id: 'brand-1',
        tenant_id: TENANT_ID,
        primary_color: '#ff6600',
        secondary_color: '#333333',
        logo_url: 'logos/logo.png',
        school_name_display: 'Nurul Huda Academy',
        school_name_ar: 'أكاديمية نور الهدى',
        email_from_name: null,
        email_from_name_ar: null,
        support_email: null,
        support_phone: null,
        receipt_prefix: 'RCPT',
        invoice_prefix: 'INV',
        report_card_title: null,
        payslip_prefix: 'PSL',
      });

      const branding = await service.getTenantBranding(TENANT_ID);
      expect(branding.school_name).toBe('Nurul Huda Academy');
      expect(branding.primary_color).toBe('#ff6600');
      expect(branding.logo_url).toBe('https://s3.signed/logo.png');
      expect(s3.getPresignedUrl).toHaveBeenCalledWith('logos/logo.png', 3600, { inline: true });
    });

    it('switches school_name to Arabic when tenant locale is ar', async () => {
      tenantReadFacade.findById.mockResolvedValueOnce({
        id: TENANT_ID,
        name: 'NHQS Academy',
        slug: 'nhqs',
        status: 'active',
        default_locale: 'ar',
        supported_locales: ['en', 'ar'],
        timezone: 'Europe/Dublin',
        date_format: 'dd/MM/yyyy',
        currency_code: 'EUR',
        academic_year_start_month: 9,
      });
      tenantReadFacade.findBranding.mockResolvedValueOnce({
        id: 'brand-1',
        tenant_id: TENANT_ID,
        primary_color: null,
        secondary_color: null,
        logo_url: null,
        school_name_display: 'NHQS',
        school_name_ar: 'المدرسة',
        email_from_name: null,
        email_from_name_ar: null,
        support_email: null,
        support_phone: null,
        receipt_prefix: 'RCPT',
        invoice_prefix: 'INV',
        report_card_title: null,
        payslip_prefix: 'PSL',
      });

      const branding = await service.getTenantBranding(TENANT_ID);
      expect(branding.locale).toBe('ar');
      expect(branding.school_name).toBe('المدرسة');
    });

    it('caches branding for 10 minutes per tenant', async () => {
      await service.getTenantBranding(TENANT_ID);
      await service.getTenantBranding(TENANT_ID);
      expect(tenantReadFacade.findById).toHaveBeenCalledTimes(1);
      expect(tenantReadFacade.findBranding).toHaveBeenCalledTimes(1);
    });

    it('invalidateBrandingCache drops the cache for a tenant', async () => {
      await service.getTenantBranding(TENANT_ID);
      service.invalidateBrandingCache(TENANT_ID);
      await service.getTenantBranding(TENANT_ID);
      expect(tenantReadFacade.findById).toHaveBeenCalledTimes(2);
    });

    it('throws NotFoundException when the tenant does not exist', async () => {
      tenantReadFacade.findById.mockResolvedValueOnce(null);
      await expect(service.getTenantBranding(TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('silently drops the logo when the signed URL lookup fails', async () => {
      tenantReadFacade.findBranding.mockResolvedValueOnce({
        id: 'brand-1',
        tenant_id: TENANT_ID,
        primary_color: null,
        secondary_color: null,
        logo_url: 'logos/missing.png',
        school_name_display: null,
        school_name_ar: null,
        email_from_name: null,
        email_from_name_ar: null,
        support_email: null,
        support_phone: null,
        receipt_prefix: 'RCPT',
        invoice_prefix: 'INV',
        report_card_title: null,
        payslip_prefix: 'PSL',
      });
      s3.getPresignedUrl.mockRejectedValueOnce(new Error('no such key'));

      const branding = await service.getTenantBranding(TENANT_ID);
      expect(branding.logo_url).toBeNull();
    });
  });
});
