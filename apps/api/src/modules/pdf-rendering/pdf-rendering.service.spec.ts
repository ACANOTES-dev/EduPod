import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
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

    await expect(
      service.renderPdf('invoice', 'en', {}, BRANDING),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  // ─── renderFromHtml ─────────────────────────────────────────────────────────

  it('should render a PDF from raw HTML', async () => {
    mockSetContent.mockResolvedValue(undefined);

    const result = await service.renderFromHtml('<html><body>Test</body></html>');

    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('should retry once and throw ServiceUnavailableException on renderFromHtml timeout', async () => {
    mockSetContent.mockRejectedValue(new Error('Timeout'));

    await expect(
      service.renderFromHtml('<html><body>Test</body></html>'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  // ─── onModuleDestroy ────────────────────────────────────────────────────────

  it('should close the browser on module destroy', async () => {
    // Trigger browser creation by rendering
    mockSetContent.mockResolvedValue(undefined);
    await service.renderPdf('receipt', 'en', {}, BRANDING);

    await service.onModuleDestroy();

    expect(mockBrowserClose).toHaveBeenCalled();
  });
});
