import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Browser } from 'puppeteer';

import { buildBoardPackHtml, type BoardPackTemplateInput } from './board-pack-template';

/**
 * PdfRendererService — Puppeteer-backed renderer for the budgeting board
 * pack PDF. Mirrors the Chromium launch flags used by the existing
 * `PdfRenderingService` (income / receipt / report-card templates) so we
 * stay in lock-step with the rest of the platform's PDF tooling.
 *
 * Network requests are blocked on the rendered page — the board-pack
 * template inlines all CSS / HTML and never references external assets,
 * so blocking is safe and prevents SSRF-style escapes from a future
 * change that accidentally adds an `<img src="…">` to the template.
 */
@Injectable()
export class PdfRendererService {
  private readonly logger = new Logger(PdfRendererService.name);

  async renderBoardPackPdf(input: BoardPackTemplateInput): Promise<Buffer> {
    const html = buildBoardPackHtml(input);
    let browser: Browser | null = null;
    try {
      const puppeteer = await import('puppeteer');
      browser = await puppeteer.default.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=NetworkService',
          '--disable-dev-shm-usage',
        ],
      });
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        if (url.startsWith('data:') || url.startsWith('about:')) {
          void req.continue();
        } else {
          void req.abort('blockedbyclient');
        }
      });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15_000 });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
        displayHeaderFooter: false,
      });
      this.logger.log(`Rendered board pack PDF (${pdfBuffer.byteLength} bytes)`);
      return Buffer.from(pdfBuffer);
    } catch (err) {
      this.logger.error(`PDF render failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException({
        code: 'BOARD_PACK_PDF_RENDER_FAILED',
        message: 'Board pack PDF rendering failed. Try again or contact support.',
      });
    } finally {
      if (browser) await browser.close();
    }
  }
}
