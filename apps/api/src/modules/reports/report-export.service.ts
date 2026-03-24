import { Injectable, Logger } from '@nestjs/common';

export interface ExportConfig {
  title: string;
  school_name?: string;
  date_range?: string;
  filters?: Record<string, unknown>;
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  content_type: string;
}

/**
 * Report export service — generates formatted Excel and branded PDF outputs.
 * Uses existing xlsx library for Excel and Puppeteer PDF pipeline where available.
 */
@Injectable()
export class ReportExportService {
  private readonly logger = new Logger(ReportExportService.name);

  async generateFormattedExcel(
    data: unknown[],
    config: ExportConfig,
  ): Promise<ExportResult> {
    // Dynamic require of xlsx to avoid build-time issues if not installed
    let xlsx: {
      utils: {
        book_new: () => unknown;
        json_to_sheet: (data: unknown[]) => unknown;
        book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
      };
      write: (wb: unknown, opts: Record<string, unknown>) => Buffer;
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      xlsx = require('xlsx');
    } catch {
      this.logger.warn('xlsx package not available — returning empty buffer');
      return {
        buffer: Buffer.alloc(0),
        filename: `${this.safeFilename(config.title)}.xlsx`,
        content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    const workbook = xlsx.utils.book_new();

    // Header row metadata
    const headerData = [
      { field: 'School', value: config.school_name ?? 'School' },
      { field: 'Report', value: config.title },
      { field: 'Generated', value: new Date().toISOString().slice(0, 10) },
      ...(config.date_range ? [{ field: 'Date Range', value: config.date_range }] : []),
    ];

    const headerSheet = xlsx.utils.json_to_sheet(headerData);
    xlsx.utils.book_append_sheet(workbook, headerSheet, 'Info');

    const dataSheet = xlsx.utils.json_to_sheet(data);
    xlsx.utils.book_append_sheet(workbook, dataSheet, 'Data');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return {
      buffer,
      filename: `${this.safeFilename(config.title)}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async generateBrandedPdf(
    data: unknown[],
    config: ExportConfig,
  ): Promise<ExportResult> {
    // Build simple HTML representation for Puppeteer
    const html = this.buildReportHtml(data, config);

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const puppeteer = require('puppeteer') as {
        launch: (opts: Record<string, unknown>) => Promise<{
          newPage: () => Promise<{
            setContent: (html: string, opts: Record<string, unknown>) => Promise<void>;
            pdf: (opts: Record<string, unknown>) => Promise<Buffer>;
          }>;
          close: () => Promise<void>;
        }>;
      };

      const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buffer = await page.pdf({ format: 'A4', landscape: data.length > 0 && Object.keys(data[0] as object).length > 6 });
      await browser.close();

      return {
        buffer,
        filename: `${this.safeFilename(config.title)}_${new Date().toISOString().slice(0, 10)}.pdf`,
        content_type: 'application/pdf',
      };
    } catch {
      this.logger.warn('Puppeteer not available or failed — returning HTML as fallback');
      return {
        buffer: Buffer.from(html),
        filename: `${this.safeFilename(config.title)}_${new Date().toISOString().slice(0, 10)}.html`,
        content_type: 'text/html',
      };
    }
  }

  private buildReportHtml(data: unknown[], config: ExportConfig): string {
    const rows = Array.isArray(data) && data.length > 0 ? data : [];
    const headers = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];

    const tableRows = rows.map((row) => {
      const cells = headers.map((h) => `<td>${String((row as Record<string, unknown>)[h] ?? '')}</td>`).join('');
      return `<tr>${cells}</tr>`;
    });

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; }
  h1 { color: #333; }
  .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f0f0f0; padding: 8px; border: 1px solid #ddd; text-align: left; }
  td { padding: 8px; border: 1px solid #ddd; }
  tr:nth-child(even) { background: #f9f9f9; }
</style>
</head>
<body>
<h1>${config.title}</h1>
<div class="meta">
  ${config.school_name ? `<span>${config.school_name}</span> &nbsp;|&nbsp; ` : ''}
  Generated: ${new Date().toISOString().slice(0, 10)}
  ${config.date_range ? ` &nbsp;|&nbsp; ${config.date_range}` : ''}
</div>
<table>
<thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${tableRows.join('')}</tbody>
</table>
</body>
</html>`;
  }

  private safeFilename(title: string): string {
    return title.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_').toLowerCase();
  }
}
