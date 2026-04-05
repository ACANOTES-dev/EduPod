import { InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { PdfBranding } from './pdf-rendering.service';
import { PdfRenderingService } from './pdf-rendering.service';

// Mock all template imports to avoid loading real template modules
jest.mock('./templates/household-statement-ar.template', () => ({
  renderHouseholdStatementAr: jest.fn().mockReturnValue('<html>ar-hs</html>'),
}));
jest.mock('./templates/household-statement-en.template', () => ({
  renderHouseholdStatementEn: jest.fn().mockReturnValue('<html>en-hs</html>'),
}));
jest.mock('./templates/invoice-ar.template', () => ({
  renderInvoiceAr: jest.fn().mockReturnValue('<html>ar-inv</html>'),
}));
jest.mock('./templates/invoice-en.template', () => ({
  renderInvoiceEn: jest.fn().mockReturnValue('<html>en-inv</html>'),
}));
jest.mock('./templates/payslip-ar.template', () => ({
  renderPayslipAr: jest.fn().mockReturnValue('<html>ar-pay</html>'),
}));
jest.mock('./templates/payslip-en.template', () => ({
  renderPayslipEn: jest.fn().mockReturnValue('<html>en-pay</html>'),
}));
jest.mock('./templates/receipt-ar.template', () => ({
  renderReceiptAr: jest.fn().mockReturnValue('<html>ar-rec</html>'),
}));
jest.mock('./templates/receipt-en.template', () => ({
  renderReceiptEn: jest.fn().mockReturnValue('<html>en-rec</html>'),
}));
jest.mock('./templates/report-card-ar.template', () => ({
  renderReportCardAr: jest.fn().mockReturnValue('<html>ar-rc</html>'),
}));
jest.mock('./templates/report-card-en.template', () => ({
  renderReportCardEn: jest.fn().mockReturnValue('<html>en-rc</html>'),
}));
jest.mock('./templates/report-card-modern-ar.template', () => ({
  renderReportCardModernAr: jest.fn().mockReturnValue('<html>ar-rcm</html>'),
}));
jest.mock('./templates/report-card-modern-en.template', () => ({
  renderReportCardModernEn: jest.fn().mockReturnValue('<html>en-rcm</html>'),
}));
jest.mock('./templates/transcript-ar.template', () => ({
  renderTranscriptAr: jest.fn().mockReturnValue('<html>ar-tr</html>'),
}));
jest.mock('./templates/transcript-en.template', () => ({
  renderTranscriptEn: jest.fn().mockReturnValue('<html>en-tr</html>'),
}));
jest.mock('./templates/pastoral-summary-ar.template', () => ({
  renderPastoralSummaryAr: jest.fn().mockReturnValue('<html>ar-ps</html>'),
}));
jest.mock('./templates/pastoral-summary-en.template', () => ({
  renderPastoralSummaryEn: jest.fn().mockReturnValue('<html>en-ps</html>'),
}));
jest.mock('./templates/sst-activity-ar.template', () => ({
  renderSstActivityAr: jest.fn().mockReturnValue('<html>ar-sst</html>'),
}));
jest.mock('./templates/sst-activity-en.template', () => ({
  renderSstActivityEn: jest.fn().mockReturnValue('<html>en-sst</html>'),
}));
jest.mock('./templates/safeguarding-compliance-ar.template', () => ({
  renderSafeguardingComplianceAr: jest.fn().mockReturnValue('<html>ar-sg</html>'),
}));
jest.mock('./templates/safeguarding-compliance-en.template', () => ({
  renderSafeguardingComplianceEn: jest.fn().mockReturnValue('<html>en-sg</html>'),
}));
jest.mock('./templates/wellbeing-programme-ar.template', () => ({
  renderWellbeingProgrammeAr: jest.fn().mockReturnValue('<html>ar-wp</html>'),
}));
jest.mock('./templates/wellbeing-programme-en.template', () => ({
  renderWellbeingProgrammeEn: jest.fn().mockReturnValue('<html>en-wp</html>'),
}));
jest.mock('./templates/des-inspection-ar.template', () => ({
  renderDesInspectionAr: jest.fn().mockReturnValue('<html>ar-des</html>'),
}));
jest.mock('./templates/des-inspection-en.template', () => ({
  renderDesInspectionEn: jest.fn().mockReturnValue('<html>en-des</html>'),
}));
jest.mock('./templates/trip-leader-pack-ar.template', () => ({
  renderTripLeaderPackAr: jest.fn().mockReturnValue('<html>ar-tlp</html>'),
}));
jest.mock('./templates/trip-leader-pack-en.template', () => ({
  renderTripLeaderPackEn: jest.fn().mockReturnValue('<html>en-tlp</html>'),
}));

// Mock puppeteer
const mockPdf = jest.fn().mockResolvedValue(Buffer.from('pdf-bytes'));
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockSetContent = jest.fn().mockResolvedValue(undefined);
const mockNewPage = jest.fn().mockResolvedValue({
  setContent: mockSetContent,
  pdf: mockPdf,
  close: mockClose,
});
const mockBrowserClose = jest.fn().mockResolvedValue(undefined);

jest.mock('puppeteer', () => ({
  __esModule: true,
  default: {
    launch: jest.fn().mockResolvedValue({
      newPage: mockNewPage,
      close: mockBrowserClose,
    }),
  },
}));

const BRANDING: PdfBranding = {
  school_name: 'Test School',
  school_name_ar: 'مدرسة اختبار',
  logo_url: 'https://example.com/logo.png',
};

describe('PdfRenderingService', () => {
  let service: PdfRenderingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfRenderingService],
    }).compile();

    service = module.get<PdfRenderingService>(PdfRenderingService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // Reset browser state between tests
    await service.onModuleDestroy();
  });

  // ─── renderHtml ─────────────────────────────────────────────────────────────

  it('should render HTML for a registered template and locale', () => {
    const result = service.renderHtml('invoice', 'en', { amount: 100 }, BRANDING);

    expect(typeof result).toBe('string');
    expect(result).toContain('en-inv');
  });

  it('should throw InternalServerErrorException for unknown template key', () => {
    expect(() => service.renderHtml('nonexistent', 'en', {}, BRANDING)).toThrow(
      InternalServerErrorException,
    );
  });

  it('should throw InternalServerErrorException for unsupported locale', () => {
    expect(() => service.renderHtml('invoice', 'fr', {}, BRANDING)).toThrow(
      InternalServerErrorException,
    );
  });

  // ─── renderPdf ──────────────────────────────────────────────────────────────

  it('should render a PDF buffer from a registered template', async () => {
    const result = await service.renderPdf('report-card', 'en', { grades: [] }, BRANDING);

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(mockNewPage).toHaveBeenCalled();
    expect(mockSetContent).toHaveBeenCalled();
    expect(mockPdf).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'A4', printBackground: true }),
    );
  });

  it('should retry once and throw ServiceUnavailableException on double timeout', async () => {
    mockSetContent.mockRejectedValue(new Error('Timeout'));

    await expect(service.renderPdf('invoice', 'en', {}, BRANDING)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  // ─── renderFromHtml ─────────────────────────────────────────────────────────

  it('should render a PDF from raw HTML', async () => {
    mockSetContent.mockResolvedValue(undefined);

    const result = await service.renderFromHtml('<html><body>Test</body></html>');

    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('should retry once and throw ServiceUnavailableException on renderFromHtml timeout', async () => {
    mockSetContent.mockRejectedValue(new Error('Timeout'));

    await expect(service.renderFromHtml('<html><body>Test</body></html>')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  // ─── renderPdf retry branch ─────────────────────────────────────────────────

  it('should succeed on retry after first attempt fails for renderPdf', async () => {
    // First setContent fails, second succeeds
    mockSetContent.mockRejectedValueOnce(new Error('Timeout')).mockResolvedValueOnce(undefined);

    const result = await service.renderPdf('report-card', 'en', { grades: [] }, BRANDING);

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(mockSetContent).toHaveBeenCalledTimes(2);
  });

  // ─── renderFromHtml retry branch ──────────────────────────────────────────

  it('should succeed on retry after first attempt fails for renderFromHtml', async () => {
    mockSetContent.mockRejectedValueOnce(new Error('Timeout')).mockResolvedValueOnce(undefined);

    const result = await service.renderFromHtml('<html><body>Retry Test</body></html>');

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(mockSetContent).toHaveBeenCalledTimes(2);
  });

  // ─── getBrowser caching branch ─────────────────────────────────────────────

  it('should reuse browser instance on subsequent calls', async () => {
    const puppeteer = await import('puppeteer');
    mockSetContent.mockResolvedValue(undefined);

    // First render creates the browser
    await service.renderPdf('invoice', 'en', {}, BRANDING);
    // Second render should reuse the same browser
    await service.renderPdf('receipt', 'en', {}, BRANDING);

    // puppeteer.default.launch should only be called once
    expect(puppeteer.default.launch).toHaveBeenCalledTimes(1);
  });

  // ─── onModuleDestroy ────────────────────────────────────────────────────────

  it('should close the browser on module destroy', async () => {
    // Trigger browser creation by rendering
    mockSetContent.mockResolvedValue(undefined);
    await service.renderPdf('receipt', 'en', {}, BRANDING);

    await service.onModuleDestroy();

    expect(mockBrowserClose).toHaveBeenCalled();
  });

  it('should do nothing on module destroy when browser is null', async () => {
    // Don't trigger any rendering, so browser remains null
    await service.onModuleDestroy();

    expect(mockBrowserClose).not.toHaveBeenCalled();
  });

  // ─── renderHtml additional template coverage ───────────────────────────────

  it('should render HTML for each registered template', () => {
    const templates = [
      'report-card',
      'transcript',
      'invoice',
      'receipt',
      'household-statement',
      'payslip',
      'report-card-modern',
      'pastoral-summary',
      'sst-activity',
      'safeguarding-compliance',
      'wellbeing-programme',
      'des-inspection',
      'trip-leader-pack',
    ];
    const locales = ['en', 'ar'];

    for (const tmpl of templates) {
      for (const locale of locales) {
        const result = service.renderHtml(tmpl, locale, {}, BRANDING);
        expect(typeof result).toBe('string');
      }
    }
  });

  // ─── page.close is always called (finally block) ──────────────────────────

  it('should close page even when rendering succeeds for renderPdf', async () => {
    mockSetContent.mockResolvedValue(undefined);
    await service.renderPdf('invoice', 'en', {}, BRANDING);

    expect(mockClose).toHaveBeenCalled();
  });

  it('should close page even when rendering fails for renderFromHtml', async () => {
    mockSetContent.mockRejectedValue(new Error('Timeout'));

    await expect(service.renderFromHtml('<html>fail</html>')).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(mockClose).toHaveBeenCalled();
  });
});
