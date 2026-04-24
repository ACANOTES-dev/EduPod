import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import type { Browser } from 'puppeteer';

import type { ExportInput } from '../report-export.types';
import { renderPdfReportHtml } from '../templates/pdf-report.html';

/**
 * Shared Puppeteer-backed PDF renderer for the reports export pipeline.
 *
 * Mirrors the long-running-browser pattern used by `PdfRenderingService` for
 * report cards: one headless Chromium per process, page-per-render, network
 * interception blocks every request (the HTML is fully self-contained so any
 * outbound fetch would be unexpected and is treated as an SSRF attempt).
 *
 * The browser is launched lazily on the first render to keep cold startup
 * fast. `onModuleDestroy` closes it on shutdown.
 */
@Injectable()
export class PdfRenderer implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRenderer.name);
  private browser: Browser | null = null;

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (err) {
        // Log but do not throw — module shutdown must not be blocked by a
        // misbehaving browser handle.
        this.logger.warn(`Failed to close Puppeteer browser cleanly: ${(err as Error).message}`);
      }
      this.browser = null;
    }
  }

  /** Render the given export input to a PDF buffer. */
  async render(input: ExportInput): Promise<Buffer> {
    const html = renderPdfReportHtml({
      report: input.report,
      columns: input.data.columns,
      rows: input.data.rows,
      branding: input.branding,
    });

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        // The HTML is self-contained — only inline data URLs (embedded base64
        // images) and `about:` URLs are expected. Every other request is
        // treated as an SSRF attempt and aborted.
        if (url.startsWith('data:') || url.startsWith('about:')) {
          void req.continue();
        } else {
          void req.abort('blockedbyclient');
        }
      });

      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15_000 });

      const landscape = input.data.columns.length > 6;
      const rawBuffer = await page.pdf({
        format: 'A4',
        landscape,
        printBackground: true,
        margin: { top: '16mm', right: '14mm', bottom: '18mm', left: '14mm' },
        displayHeaderFooter: false,
      });

      return Buffer.from(rawBuffer);
    } catch (err) {
      this.logger.error(
        `PDF render failed for tenant=${input.tenantId} report="${input.report.name}": ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException({
        code: 'PDF_RENDER_FAILED',
        message: 'PDF rendering failed. Please try again or use a different format.',
      });
    } finally {
      await page.close();
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;

    const puppeteer = await import('puppeteer');
    this.browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    return this.browser;
  }
}
