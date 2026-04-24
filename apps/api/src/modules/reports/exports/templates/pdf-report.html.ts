import type { ExportColumn, ExportReportMeta } from '../report-export.types';

import type { TenantBranding } from './branding';

/**
 * Escape untrusted string values for safe interpolation into the HTML body.
 * Puppeteer renders with network blocked so the only XSS surface is the
 * generator itself, but we still escape defensively — a malicious tenant-owned
 * string (school name, filter value, row cell) must never break out of the
 * template.
 */
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCell(value: unknown, type: ExportColumn['type'], currencyCode: string): string {
  if (value === null || value === undefined) return '';

  switch (type) {
    case 'date': {
      const asDate = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(asDate.getTime())) return escapeHtml(value);
      const dd = String(asDate.getUTCDate()).padStart(2, '0');
      const mm = String(asDate.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = String(asDate.getUTCFullYear());
      return `${dd}/${mm}/${yyyy}`;
    }
    case 'boolean':
      return value ? '✓' : '✗';
    case 'currency': {
      const num = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(num)) return escapeHtml(value);
      return `${escapeHtml(currencyCode)} ${num.toFixed(2)}`;
    }
    case 'number': {
      const num = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(num)) return escapeHtml(value);
      return String(num);
    }
    case 'string':
    default:
      return escapeHtml(value);
  }
}

function formatHeaderDate(date: Date, locale: 'en' | 'ar'): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getUTCFullYear());
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  // Same ISO-like format for both locales — the redesign spec mandates
  // Western numerals even in Arabic surfaces, so no locale-dependent digit
  // shaping.
  void locale;
  return `${dd}/${mm}/${yyyy} ${hh}:${min} UTC`;
}

export interface PdfTemplateInput {
  report: ExportReportMeta;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  branding: TenantBranding;
}

/**
 * Produce the parametrised branded HTML used by the PDF renderer. Inlined
 * CSS only — Puppeteer runs with network blocked so external stylesheets or
 * fonts would fail to load.
 */
export function renderPdfReportHtml(input: PdfTemplateInput): string {
  const { report, columns, rows, branding } = input;
  const dir = branding.locale === 'ar' ? 'rtl' : 'ltr';
  const landscape = columns.length > 6;

  const logoBlock = branding.logo_url
    ? `<img src="${escapeHtml(branding.logo_url)}" alt="" class="logo" />`
    : `<div class="logo-placeholder">${escapeHtml(branding.school_name.slice(0, 1).toUpperCase())}</div>`;

  const headerCells = columns
    .map((col) => `<th scope="col">${escapeHtml(col.label)}</th>`)
    .join('');

  const bodyRows = rows
    .map((row) => {
      const cells = columns
        .map(
          (col) =>
            `<td class="cell cell-${col.type}">${formatCell(row[col.id], col.type, branding.currency_code)}</td>`,
        )
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const emptyBanner =
    rows.length === 0 ? `<div class="empty">No rows matched the report's filters.</div>` : '';

  return `<!DOCTYPE html>
<html lang="${branding.locale}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.name)}</title>
  <style>
    @page {
      size: A4 ${landscape ? 'landscape' : 'portrait'};
      margin: 16mm 14mm 18mm 14mm;
      @bottom-center {
        content: "Page " counter(page) " of " counter(pages);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 9pt;
        color: #64748b;
      }
    }
    * { box-sizing: border-box; }
    html, body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 10pt;
      color: #0f172a;
      margin: 0;
      padding: 0;
    }
    html[dir="rtl"] body { text-align: right; }
    .report {
      max-width: 100%;
    }
    .report-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 10px;
      border-bottom: 2px solid ${escapeHtml(branding.primary_color)};
      margin-bottom: 14px;
    }
    .logo, .logo-placeholder {
      width: 48px;
      height: 48px;
      border-radius: 6px;
      flex-shrink: 0;
      object-fit: contain;
    }
    .logo-placeholder {
      background: ${escapeHtml(branding.primary_color)};
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 22px;
    }
    .header-text {
      flex: 1;
    }
    .school-name {
      font-size: 11pt;
      color: #64748b;
      margin: 0 0 2px 0;
    }
    .report-title {
      font-size: 18pt;
      font-weight: 600;
      margin: 0;
      color: ${escapeHtml(branding.primary_color)};
    }
    .meta {
      font-size: 9pt;
      color: #475569;
      margin-bottom: 12px;
      line-height: 1.5;
    }
    .meta dt {
      font-weight: 600;
      margin-top: 4px;
    }
    .meta dd {
      margin: 0 0 0 0;
    }
    .filters-summary {
      background: #f1f5f9;
      border-${dir === 'rtl' ? 'right' : 'left'}: 3px solid ${escapeHtml(branding.primary_color)};
      padding: 8px 12px;
      margin-bottom: 14px;
      font-size: 9.5pt;
      color: #334155;
    }
    table.data {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    table.data th {
      background: ${escapeHtml(branding.primary_color)};
      color: #ffffff;
      text-align: ${dir === 'rtl' ? 'right' : 'left'};
      padding: 6px 8px;
      font-weight: 600;
      border-bottom: 1px solid ${escapeHtml(branding.primary_color)};
    }
    table.data td {
      padding: 5px 8px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    table.data tbody tr:nth-child(even) td {
      background: #f8fafc;
    }
    .cell-number, .cell-currency { text-align: ${dir === 'rtl' ? 'left' : 'right'}; font-variant-numeric: tabular-nums; }
    .cell-boolean { text-align: center; }
    .empty {
      text-align: center;
      padding: 24px;
      color: #64748b;
      font-style: italic;
    }
    .footer-note {
      margin-top: 18px;
      font-size: 8pt;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
    }
  </style>
</head>
<body>
  <div class="report">
    <header class="report-header">
      ${logoBlock}
      <div class="header-text">
        <p class="school-name">${escapeHtml(branding.school_name)}</p>
        <h1 class="report-title">${escapeHtml(report.name)}</h1>
      </div>
    </header>

    <dl class="meta">
      ${report.description ? `<dt>Description</dt><dd>${escapeHtml(report.description)}</dd>` : ''}
      <dt>Generated at</dt><dd>${escapeHtml(formatHeaderDate(report.generated_at, branding.locale))}</dd>
      <dt>Generated by</dt><dd>${escapeHtml(report.generated_by)}</dd>
      <dt>Rows</dt><dd>${rows.length}</dd>
    </dl>

    ${report.filters_summary ? `<div class="filters-summary"><strong>Filters:</strong> ${escapeHtml(report.filters_summary)}</div>` : ''}

    <table class="data">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    ${emptyBanner}

    <p class="footer-note">Confidential — generated for internal use only.</p>
  </div>
</body>
</html>`;
}
