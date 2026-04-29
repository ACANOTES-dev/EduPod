import {
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Browser } from 'puppeteer';

import { renderDesInspection } from './templates/des-inspection.template';
import { renderHouseholdStatement } from './templates/household-statement.template';
import { renderInvoice } from './templates/invoice.template';
import { renderPastoralSummary } from './templates/pastoral-summary.template';
import { renderPayslip } from './templates/payslip.template';
import { renderReceipt } from './templates/receipt.template';
import { renderReportCardModern } from './templates/report-card-modern.template';
import { renderReportCard } from './templates/report-card.template';
import { renderSafeguardingCompliance } from './templates/safeguarding-compliance.template';
import { renderSstActivity } from './templates/sst-activity.template';
import { renderTranscript } from './templates/transcript.template';
import { renderTripLeaderPack } from './templates/trip-leader-pack.template';
import { renderWellbeingProgramme } from './templates/wellbeing-programme.template';

export interface PdfBranding {
  school_name: string;
  school_name_ar?: string;
  logo_url?: string;
  primary_color?: string;
  report_card_title?: string;
}

type TemplateFn = (data: unknown, branding: PdfBranding, locale: string) => string;

const TEMPLATES: Record<string, TemplateFn> = {
  'des-inspection': renderDesInspection,
  'household-statement': renderHouseholdStatement,
  invoice: renderInvoice,
  'pastoral-summary': renderPastoralSummary,
  payslip: renderPayslip,
  receipt: renderReceipt,
  'report-card': renderReportCard,
  'report-card-modern': renderReportCardModern,
  'safeguarding-compliance': renderSafeguardingCompliance,
  'sst-activity': renderSstActivity,
  transcript: renderTranscript,
  'trip-leader-pack': renderTripLeaderPack,
  'wellbeing-programme': renderWellbeingProgramme,
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
   * @param locale - Locale code ('en', 'ar', or 'fr')
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
    const html = templateFn(data, branding, locale);

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Block all network requests from rendered content to prevent SSRF
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        if (url.startsWith('data:') || url.startsWith('about:')) {
          void req.continue();
        } else {
          void req.abort('blockedbyclient');
        }
      });
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
  renderHtml(templateKey: string, locale: string, data: unknown, branding: PdfBranding): string {
    const templateFn = this.getTemplate(templateKey, locale);
    return templateFn(data, branding, locale);
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
    const templateFn = TEMPLATES[templateKey];
    if (!templateFn) {
      throw new InternalServerErrorException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `PDF template "${templateKey}" not found`,
      });
    }

    if (!['en', 'ar', 'fr', 'es'].includes(locale)) {
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
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=NetworkService',
        '--disable-dev-shm-usage',
      ],
    });

    return this.browser;
  }
}
