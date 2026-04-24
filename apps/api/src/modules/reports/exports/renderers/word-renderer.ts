import { Injectable, Logger } from '@nestjs/common';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextDirection,
  TextRun,
  WidthType,
} from 'docx';

import type { ExportColumn, ExportColumnType, ExportInput } from '../report-export.types';

/** Strip the leading `#` from a hex colour to match the `docx` colour API. */
function hexColour(hex: string, fallback = '0F172A'): string {
  const cleaned = hex.startsWith('#') ? hex.slice(1) : hex;
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) return cleaned.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const [r, g, b] = cleaned.split('');
    return `${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

function formatCell(value: unknown, type: ExportColumnType, currencyCode: string): string {
  if (value === null || value === undefined) return '';
  switch (type) {
    case 'date': {
      const d = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(d.getTime())) return String(value);
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = String(d.getUTCFullYear());
      return `${dd}/${mm}/${yyyy}`;
    }
    case 'boolean':
      return value ? '✓' : '✗';
    case 'currency': {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(n)) return String(value);
      return `${currencyCode} ${n.toFixed(2)}`;
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(n)) return String(value);
      return String(n);
    }
    case 'string':
    default:
      return String(value);
  }
}

/**
 * docx-backed Word renderer. Per impl 04 spec §5, charts are NOT embedded in
 * v1 — the renderer emits the tabular data only. A later cycle can add chart
 * images via Puppeteer snapshotting.
 *
 * The document uses the tenant's primary colour for the title and table
 * header band, and flips to RTL layout when the tenant's default locale is
 * Arabic.
 */
@Injectable()
export class WordRenderer {
  private readonly logger = new Logger(WordRenderer.name);

  async render(input: ExportInput): Promise<Buffer> {
    const { report, data, branding } = input;
    const rtl = branding.locale === 'ar';
    const primaryHex = hexColour(branding.primary_color);

    const titleParagraph = new Paragraph({
      heading: HeadingLevel.TITLE,
      bidirectional: rtl,
      alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [
        new TextRun({
          text: report.name,
          bold: true,
          size: 40,
          color: primaryHex,
          rightToLeft: rtl,
        }),
      ],
    });

    const schoolLine = new Paragraph({
      bidirectional: rtl,
      alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: branding.school_name, size: 22, color: '475569', rightToLeft: rtl }),
      ],
    });

    const metaParagraphs = this.buildMetaParagraphs(report, rtl);
    const filtersParagraph = report.filters_summary
      ? new Paragraph({
          bidirectional: rtl,
          alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          spacing: { before: 120, after: 200 },
          children: [
            new TextRun({ text: 'Filters: ', bold: true, rightToLeft: rtl }),
            new TextRun({ text: report.filters_summary, rightToLeft: rtl }),
          ],
        })
      : null;

    const dataTable = this.buildTable(
      data.columns,
      data.rows,
      branding.currency_code,
      primaryHex,
      rtl,
    );

    const doc = new Document({
      creator: report.generated_by,
      title: report.name,
      description: report.description,
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 720,
                right: 720,
                bottom: 1000,
                left: 720,
              },
              textDirection: rtl ? TextDirection.TOP_TO_BOTTOM_RIGHT_TO_LEFT : undefined,
            },
          },
          children: [
            titleParagraph,
            schoolLine,
            ...metaParagraphs,
            ...(filtersParagraph ? [filtersParagraph] : []),
            dataTable,
          ],
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: 'Confidential — internal use only · Page ',
                      size: 16,
                      color: '64748B',
                    }),
                    new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64748B' }),
                    new TextRun({ text: ' of ', size: 16, color: '64748B' }),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '64748B' }),
                  ],
                }),
              ],
            }),
          },
        },
      ],
    });

    try {
      const raw = await Packer.toBuffer(doc);
      return Buffer.from(raw);
    } catch (err) {
      this.logger.error(
        `Word render failed for tenant=${input.tenantId} report="${input.report.name}": ${(err as Error).message}`,
      );
      throw err;
    }
  }

  private buildMetaParagraphs(report: ExportInput['report'], rtl: boolean): Paragraph[] {
    const lines: Array<[string, string]> = [];
    if (report.description) lines.push(['Description', report.description]);
    lines.push(['Generated at', report.generated_at.toISOString()]);
    lines.push(['Generated by', report.generated_by]);

    return lines.map(
      ([label, value]) =>
        new Paragraph({
          bidirectional: rtl,
          alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          spacing: { after: 60 },
          children: [
            new TextRun({ text: `${label}: `, bold: true, size: 20, rightToLeft: rtl }),
            new TextRun({ text: value, size: 20, rightToLeft: rtl }),
          ],
        }),
    );
  }

  private buildTable(
    columns: ExportColumn[],
    rows: Record<string, unknown>[],
    currencyCode: string,
    primaryHex: string,
    rtl: boolean,
  ): Table {
    const headerRow = new TableRow({
      tableHeader: true,
      children: columns.map(
        (col) =>
          new TableCell({
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: primaryHex },
            children: [
              new Paragraph({
                bidirectional: rtl,
                alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: col.label,
                    bold: true,
                    color: 'FFFFFF',
                    size: 20,
                    rightToLeft: rtl,
                  }),
                ],
              }),
            ],
          }),
      ),
    });

    const bodyRows = rows.map((row, idx) => {
      const stripe = idx % 2 === 0;
      return new TableRow({
        children: columns.map((col) => {
          const alignment =
            col.type === 'number' || col.type === 'currency'
              ? rtl
                ? AlignmentType.LEFT
                : AlignmentType.RIGHT
              : col.type === 'boolean'
                ? AlignmentType.CENTER
                : rtl
                  ? AlignmentType.RIGHT
                  : AlignmentType.LEFT;
          const text = formatCell(row[col.id], col.type, currencyCode);
          return new TableCell({
            shading: stripe
              ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F8FAFC' }
              : undefined,
            children: [
              new Paragraph({
                bidirectional: rtl,
                alignment,
                children: [new TextRun({ text, size: 18, rightToLeft: rtl })],
              }),
            ],
          });
        }),
      });
    });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...bodyRows],
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: primaryHex },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: primaryHex },
        left: { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
        right: { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
        insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
      },
    });
  }
}
