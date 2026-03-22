import {
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Browser } from 'puppeteer';

import { renderHouseholdStatementAr } from './templates/household-statement-ar.template';
import { renderHouseholdStatementEn } from './templates/household-statement-en.template';
import { renderInvoiceAr } from './templates/invoice-ar.template';
import { renderInvoiceEn } from './templates/invoice-en.template';
import { renderPayslipAr } from './templates/payslip-ar.template';
import { renderPayslipEn } from './templates/payslip-en.template';
import { renderReceiptAr } from './templates/receipt-ar.template';
import { renderReceiptEn } from './templates/receipt-en.template';
import { renderReportCardAr } from './templates/report-card-ar.template';
import { renderReportCardEn } from './templates/report-card-en.template';
import { renderReportCardModernAr } from './templates/report-card-modern-ar.template';
import { renderReportCardModernEn } from './templates/report-card-modern-en.template';
import { renderTranscriptAr } from './templates/transcript-ar.template';
import { renderTranscriptEn } from './templates/transcript-en.template';

export interface PdfBranding {
  school_name: string;
  school_name_ar?: string;
  logo_url?: string;
  primary_color?: string;
  report_card_title?: string;
}

type TemplateFn = (data: unknown, branding: PdfBranding) => string;

const TEMPLATES: Record<string, Record<string, TemplateFn>> = {
  'report-card': {
    en: renderReportCardEn as TemplateFn,
    ar: renderReportCardAr as TemplateFn,
  },
  'transcript': {
    en: renderTranscriptEn as TemplateFn,
    ar: renderTranscriptAr as TemplateFn,
  },
  'invoice': {
    en: renderInvoiceEn as TemplateFn,
    ar: renderInvoiceAr as TemplateFn,
  },
  'receipt': {
    en: renderReceiptEn as TemplateFn,
    ar: renderReceiptAr as TemplateFn,
  },
  'household-statement': {
    en: renderHouseholdStatementEn as TemplateFn,
    ar: renderHouseholdStatementAr as TemplateFn,
  },
  'payslip': {
    en: renderPayslipEn as TemplateFn,
    ar: renderPayslipAr as TemplateFn,
  },
  'report-card-modern': {
    en: renderReportCardModernEn as TemplateFn,
    ar: renderReportCardModernAr as TemplateFn,
  },
};

@Injectable()
export class PdfRenderingService implements OnModuleDestroy {
  private browser: Browser | null = null;

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Render a PDF from a registered template.
   *
   * @param templateKey - Template identifier (e.g., 'report-card', 'transcript')
   * @param locale - Locale code ('en' or 'ar')
   * @param data - Payload data for the template
   * @param branding - School branding info
   * @returns PDF as a Buffer
   */
  async renderPdf(
    templateKey: string,
    locale: string,
    data: unknown,
    branding: PdfBranding,
  ): Promise<Buffer> {
    const templateFn = this.getTemplate(templateKey, locale);
    const html = templateFn(data, branding);

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 5000 });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      });

      return Buffer.from(pdfBuffer);
    } catch (_err) {
      // Retry once on timeout
      try {
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 5000 });
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
        });
        return Buffer.from(pdfBuffer);
      } catch {
        throw new ServiceUnavailableException({
          code: 'RENDER_TIMEOUT',
          message: 'PDF rendering timed out. Please try again.',
        });
      }
    } finally {
      await page.close();
    }
  }

  /**
   * Render HTML string from a registered template without creating a PDF.
   * Used for batch PDF generation where multiple pages are combined.
   */
  renderHtml(
    templateKey: string,
    locale: string,
    data: unknown,
    branding: PdfBranding,
  ): string {
    const templateFn = this.getTemplate(templateKey, locale);
    return templateFn(data, branding);
  }

  /**
   * Render a PDF from raw HTML content. Used for combined multi-page rendering.
   */
  async renderFromHtml(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      });

      return Buffer.from(pdfBuffer);
    } catch (_err) {
      try {
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
        });
        return Buffer.from(pdfBuffer);
      } catch {
        throw new ServiceUnavailableException({
          code: 'RENDER_TIMEOUT',
          message: 'PDF rendering timed out. Please try again.',
        });
      }
    } finally {
      await page.close();
    }
  }

  private getTemplate(templateKey: string, locale: string): TemplateFn {
    const localeTemplates = TEMPLATES[templateKey];
    if (!localeTemplates) {
      throw new InternalServerErrorException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `PDF template "${templateKey}" not found`,
      });
    }

    const templateFn = localeTemplates[locale];
    if (!templateFn) {
      throw new InternalServerErrorException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `PDF template "${templateKey}" not available for locale "${locale}"`,
      });
    }

    return templateFn;
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    const puppeteer = await import('puppeteer');
    this.browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    return this.browser;
  }
}
