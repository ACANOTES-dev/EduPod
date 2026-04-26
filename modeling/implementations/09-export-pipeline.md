# Implementation 09 — Export Pipeline (PDF + Excel + Board Pack worker)

> **Wave:** 3
> **Depends on:** 01, 03, 04, 05
> **Deploys:** API + worker restart

---

## Goal

Build the three output channels promised by `PLAN.md §11`:

1. **Synchronous PDF + Excel renderers** — a `PdfRendererService` (Puppeteer + branded HTML template) and an `ExcelRendererService` (exceljs multi-sheet workbook) that the API can call inline for small models / on-demand re-renders.
2. **Async `budgeting:board-pack-render` worker** — fired when a snapshot is published or when the user clicks "Regenerate". Renders both PDF and Excel, uploads to Hetzner Object Storage, and persists the object keys back onto `financial_model_snapshots.pdf_object_key` / `excel_object_key` / `rendered_at`.
3. **API endpoints** that serve the PDF / Excel from object storage with a 1-hour signed URL and that re-trigger the worker.

The renderer services live in the API process (so the synchronous fallback works for small models) AND the worker re-uses them through the same code path (we keep the renderers in API land and call them from the worker via direct module import — see §6 below).

The renderers are the only tooling that touches Puppeteer in this rebuild. The board-pack template is owned here; per `.claude/rules/frontend.md` it's HTML-only, no React. We deliberately keep the template self-contained in `board-pack-template.ts` so it's portable to the worker process.

## What to change

### 1. `apps/api/package.json` — UPDATE deps

Confirm both `puppeteer` and `exceljs` are present. The existing `apps/api/src/modules/pdf-rendering/` already uses Puppeteer — reuse that dependency. `exceljs` is already pulled in for `apps/api/src/modules/reports/exports/renderers/excel-renderer.ts`. **No new dependency adds in `package.json`** if both exist; if either is missing add via `pnpm --filter @school/api add <dep>` and commit the resulting `pnpm-lock.yaml` change in the same commit (Rule 19).

### 2. `apps/api/src/modules/budgeting/exports/board-pack-template.ts` — NEW

Pure function that takes a `FinancialModelSnapshot.payload` and returns an HTML string ready for Puppeteer. No external CSS — embedded `<style>` tag. Branded with the tenant's `name` and `currency_code`. Sections per `PLAN.md §11.1`.

```typescript
import type {
  Drivers,
  EngineOutputs,
  FinancialModelSnapshotPayload,
} from '@school/shared/budgeting';

export interface BoardPackTemplateInput {
  tenant_name: string;
  currency_code: string;
  model_name: string;
  version_number: number;
  published_at: string;
  published_by_name: string;
  fiscal_year_label: string;
  executive_summary: string | null;
  payload: FinancialModelSnapshotPayload;
  variance_summary?: VarianceSummary | null; // optional — included when current variance cache exists
}

interface VarianceSummary {
  period_label: string;
  rows: Array<{
    line_item_key: string;
    planned: number;
    actual: number;
    variance: number;
    variance_pct: number;
  }>;
}

export function buildBoardPackHtml(input: BoardPackTemplateInput): string {
  const {
    tenant_name,
    currency_code,
    model_name,
    version_number,
    published_at,
    published_by_name,
    fiscal_year_label,
    executive_summary,
    payload,
    variance_summary,
  } = input;

  const css = `
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Figtree', sans-serif; color: #0f172a; font-size: 10.5pt; line-height: 1.4; }
    h1 { font-size: 28pt; margin: 0 0 12pt; }
    h2 { font-size: 16pt; margin: 24pt 0 8pt; border-bottom: 1px solid #cbd5e1; padding-bottom: 4pt; }
    h3 { font-size: 12pt; margin: 16pt 0 6pt; }
    .cover { padding: 30mm 0 0 0; text-align: center; }
    .cover .meta { color: #475569; margin-top: 12pt; font-size: 11pt; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin: 12pt 0; }
    .kpi { padding: 10pt; border: 1px solid #cbd5e1; border-radius: 6pt; }
    .kpi .label { font-size: 9pt; color: #475569; text-transform: uppercase; letter-spacing: 0.5pt; }
    .kpi .value { font-size: 16pt; font-weight: 600; margin-top: 4pt; font-family: 'JetBrains Mono', monospace; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    th, td { padding: 4pt 6pt; border-bottom: 1px solid #e2e8f0; text-align: start; }
    th { background: #f1f5f9; font-weight: 600; }
    tr.total td { font-weight: 600; border-top: 2px solid #0f172a; }
    .num { font-family: 'JetBrains Mono', monospace; text-align: end; }
    .pos { color: #166534; }
    .neg { color: #991b1b; }
    .footer { position: fixed; bottom: 8mm; left: 16mm; right: 16mm; font-size: 8pt; color: #64748b; display: flex; justify-content: space-between; }
    .pagebreak { page-break-after: always; }
  `;

  const totals = payload.totals_by_year ?? [];
  const baseTotals = totals[0];
  const perPupil = (payload.per_pupil_unit_economics ?? [])[0];
  const drivers = payload.drivers;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model_name)} — Board Pack</title>
  <style>${css}</style>
</head>
<body>
  <!-- 1. Cover ------------------------------------------------------------- -->
  <section class="cover">
    <h1>${escapeHtml(tenant_name)}</h1>
    <div style="font-size: 14pt;">Annual Financial Model — ${escapeHtml(fiscal_year_label)}</div>
    <div class="meta">
      Version ${version_number} · Published ${escapeHtml(published_at)}<br>
      Prepared by ${escapeHtml(published_by_name)}
    </div>
  </section>
  <div class="pagebreak"></div>

  <!-- 2. Executive summary ------------------------------------------------ -->
  <h2>Executive summary</h2>
  ${baseTotals ? renderKpiGrid(baseTotals, perPupil, currency_code) : ''}
  ${
    executive_summary
      ? `<div>${escapeHtml(executive_summary)
          .split('\n')
          .map((p) => `<p>${p}</p>`)
          .join('')}</div>`
      : ''
  }

  <!-- 3. Drivers ---------------------------------------------------------- -->
  <h2>Drivers</h2>
  ${renderDriversTable(drivers)}

  <!-- 4. Base case totals ------------------------------------------------- -->
  <h2>Base case — totals by year</h2>
  ${renderTotalsTable(totals, currency_code)}

  <!-- 5. Scenarios -------------------------------------------------------- -->
  <h2>Scenarios</h2>
  ${renderScenariosTable(payload, currency_code)}

  <!-- 6. Line items ------------------------------------------------------- -->
  <h2>Line items by category</h2>
  ${renderLineItemsByCategory(payload.line_items ?? [], currency_code)}

  <!-- 7. Per-pupil economics ---------------------------------------------- -->
  <h2>Per-pupil unit economics</h2>
  ${renderPerPupilTable(payload.per_pupil_unit_economics ?? [], currency_code)}

  <!-- 8. Variance summary (optional) -------------------------------------- -->
  ${variance_summary ? `<h2>Variance vs plan</h2>${renderVarianceTable(variance_summary, currency_code)}` : ''}

  <!-- 9. Capex appendix --------------------------------------------------- -->
  <h2>Capital expenditure</h2>
  ${renderCapexTable(drivers.capex_items, currency_code)}

  <!-- 10. Methodology ----------------------------------------------------- -->
  <h2>Methodology &amp; assumptions</h2>
  <p>This model was generated from the school's live student, staff, fee, and class data on ${escapeHtml(published_at)}. The 11 canonical drivers above were applied to a snapshot of the source data; line items in the "Income", "Staff costs", "Operations", and "Capital" sections are derived from these drivers. Custom and locked line items are flagged in the line-item table.</p>

  <!-- 11. Footer (printed) ------------------------------------------------- -->
  <div class="footer">
    <span>Confidential — Board of Directors · ${escapeHtml(tenant_name)}</span>
    <span>Generated ${escapeHtml(new Date().toISOString())}</span>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] as string,
  );
}

function fmt(n: number, code: string): string {
  return `${code} ${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Renderers (unit-tested via the spec) ─────────────────────────────────────

function renderKpiGrid(
  t: { revenue: number; expenditure: number; net_result: number },
  perPupil: { revenue_per_student: number } | undefined,
  code: string,
): string {
  return `<div class="kpi-grid">
    <div class="kpi"><div class="label">Revenue</div><div class="value">${fmt(t.revenue, code)}</div></div>
    <div class="kpi"><div class="label">Expenditure</div><div class="value">${fmt(t.expenditure, code)}</div></div>
    <div class="kpi"><div class="label">Net result</div><div class="value ${t.net_result < 0 ? 'neg' : 'pos'}">${fmt(t.net_result, code)}</div></div>
    <div class="kpi"><div class="label">Per pupil</div><div class="value">${perPupil ? fmt(perPupil.revenue_per_student, code) : '—'}</div></div>
  </div>`;
}

function renderDriversTable(drivers: Drivers): string {
  const rows = [
    ['Salary uplift', `${drivers.salary_uplift_pct}%`],
    ['Discount capture', `${drivers.discount_capture_pct}%`],
    ['Scholarship capture', `${drivers.scholarship_capture_pct}%`],
    ['Utilities inflation', `${drivers.utilities_inflation_pct}%`],
    ['Materials inflation', `${drivers.materials_inflation_pct}%`],
    ['Donations forecast', String(drivers.donations_forecast)],
    ['Grants forecast', String(drivers.grants_forecast)],
    ['Capex items', String(drivers.capex_items.length)],
  ];
  return `<table>
    <thead><tr><th>Driver</th><th>Value</th></tr></thead>
    <tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody>
  </table>`;
}

function renderTotalsTable(totals: EngineOutputs['totals_by_year'], code: string): string {
  if (totals.length === 0) return '<p>No totals available.</p>';
  return `<table>
    <thead><tr><th>Year</th><th>Revenue</th><th>Expenditure</th><th>Net</th></tr></thead>
    <tbody>${totals
      .map(
        (t) => `<tr>
      <td>Year ${t.fiscal_year}</td>
      <td class="num">${fmt(t.revenue, code)}</td>
      <td class="num">${fmt(t.expenditure, code)}</td>
      <td class="num ${t.net_result < 0 ? 'neg' : 'pos'}">${fmt(t.net_result, code)}</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table>`;
}

function renderScenariosTable(payload: FinancialModelSnapshotPayload, code: string): string {
  // payload.scenarios is the array stored in the snapshot — base case + alternatives
  const rows = (payload.scenarios ?? [])
    .map(
      (s) => `<tr>
    <td>${escapeHtml(s.name)}</td>
    <td class="num">${fmt(s.totals_by_year[0]?.revenue ?? 0, code)}</td>
    <td class="num">${fmt(s.totals_by_year[0]?.expenditure ?? 0, code)}</td>
    <td class="num">${fmt(s.totals_by_year[0]?.net_result ?? 0, code)}</td>
  </tr>`,
    )
    .join('');
  return rows
    ? `<table>
    <thead><tr><th>Scenario</th><th>Revenue</th><th>Expenditure</th><th>Net</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
    : '<p>No alternative scenarios configured.</p>';
}

function renderLineItemsByCategory(items: EngineOutputs['line_items'], code: string): string {
  const categories: Array<EngineOutputs['line_items'][number]['category']> = [
    'income',
    'staff_costs',
    'operations',
    'capital',
    'reserves_and_adjustments',
  ];
  return categories
    .map((cat) => {
      const catItems = items.filter((li) => li.category === cat && li.fiscal_year === 1);
      if (catItems.length === 0) return '';
      const total = catItems.reduce((acc, li) => acc + li.amount, 0);
      return `<h3>${cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</h3>
    <table>
      <thead><tr><th>Item</th><th>Amount</th></tr></thead>
      <tbody>${catItems
        .map(
          (li) => `<tr>
        <td>${escapeHtml(li.name)}</td>
        <td class="num">${fmt(li.amount, code)}</td>
      </tr>`,
        )
        .join('')}
      <tr class="total"><td>Total</td><td class="num">${fmt(total, code)}</td></tr></tbody>
    </table>`;
    })
    .join('');
}

function renderPerPupilTable(
  rows: EngineOutputs['per_pupil_unit_economics'],
  code: string,
): string {
  if (rows.length === 0) return '<p>—</p>';
  return `<table>
    <thead><tr><th>Year</th><th>Revenue / pupil</th><th>Expenditure / pupil</th><th>Net / pupil</th><th>Breakeven students</th></tr></thead>
    <tbody>${rows
      .map(
        (r) => `<tr>
      <td>Year ${r.fiscal_year}</td>
      <td class="num">${fmt(r.revenue_per_student, code)}</td>
      <td class="num">${fmt(r.expenditure_per_student, code)}</td>
      <td class="num ${r.net_per_student < 0 ? 'neg' : 'pos'}">${fmt(r.net_per_student, code)}</td>
      <td class="num">${r.breakeven_students ?? '—'}</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table>`;
}

function renderVarianceTable(v: VarianceSummary, code: string): string {
  return `<p><strong>Period:</strong> ${escapeHtml(v.period_label)}</p>
  <table>
    <thead><tr><th>Line</th><th>Planned</th><th>Actual</th><th>Variance</th><th>%</th></tr></thead>
    <tbody>${v.rows
      .map(
        (r) => `<tr>
      <td>${escapeHtml(r.line_item_key)}</td>
      <td class="num">${fmt(r.planned, code)}</td>
      <td class="num">${fmt(r.actual, code)}</td>
      <td class="num ${r.variance < 0 ? 'neg' : 'pos'}">${fmt(r.variance, code)}</td>
      <td class="num">${r.variance_pct.toFixed(1)}%</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table>`;
}

function renderCapexTable(items: Drivers['capex_items'], code: string): string {
  if (items.length === 0) return '<p>No capex items.</p>';
  return `<table>
    <thead><tr><th>Item</th><th>Year</th><th>Amount</th></tr></thead>
    <tbody>${items
      .map(
        (i) => `<tr>
      <td>${escapeHtml(i.name)}</td>
      <td>Year ${i.fiscal_year}</td>
      <td class="num">${fmt(i.amount, code)}</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table>`;
}
```

### 3. `apps/api/src/modules/budgeting/exports/pdf-renderer.service.ts` — NEW

Wraps Puppeteer. `renderBoardPackPdf(snapshotPayload, opts)` returns a `Buffer`. Reuses the same Chromium launch tuning as `apps/worker/src/processors/gradebook/report-card-production.renderer.ts` (read that file for the existing Puppeteer launch flags — keep this in lock-step).

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import puppeteer, { Browser } from 'puppeteer';

import { BoardPackTemplateInput, buildBoardPackHtml } from './board-pack-template';

@Injectable()
export class PdfRendererService {
  private readonly logger = new Logger(PdfRendererService.name);

  async renderBoardPackPdf(input: BoardPackTemplateInput): Promise<Buffer> {
    const html = buildBoardPackHtml(input);
    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
        displayHeaderFooter: false,
      });
      this.logger.log(`Rendered board pack PDF (${pdfBuffer.byteLength} bytes)`);
      return Buffer.from(pdfBuffer);
    } finally {
      if (browser) await browser.close();
    }
  }
}
```

### 4. `apps/api/src/modules/budgeting/exports/excel-renderer.service.ts` — NEW

`exceljs` workbook with the sheets from `PLAN.md §11.3`. Each sheet is its own helper.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';

import type { FinancialModelSnapshotPayload } from '@school/shared/budgeting';

export interface ExcelRendererInput {
  tenant_name: string;
  currency_code: string;
  model_name: string;
  version_number: number;
  published_at: string;
  fiscal_year_label: string;
  payload: FinancialModelSnapshotPayload;
}

@Injectable()
export class ExcelRendererService {
  private readonly logger = new Logger(ExcelRendererService.name);

  async renderBoardPackExcel(input: ExcelRendererInput): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EduPod Budgeting';
    wb.created = new Date();

    this.addInfoSheet(wb, input);
    this.addDriversSheet(wb, input);
    this.addBaseCaseSheet(wb, input);
    this.addScenarioSheets(wb, input);
    this.addCapexSheet(wb, input);
    this.addPerPupilSheet(wb, input);

    const arr = await wb.xlsx.writeBuffer();
    const buf = Buffer.from(arr as ArrayBuffer);
    this.logger.log(`Rendered board pack Excel (${buf.byteLength} bytes)`);
    return buf;
  }

  private addInfoSheet(wb: ExcelJS.Workbook, input: ExcelRendererInput): void {
    const sheet = wb.addWorksheet('Info');
    sheet.addRows([
      ['Tenant', input.tenant_name],
      ['Model', input.model_name],
      ['Version', input.version_number],
      ['Published at', input.published_at],
      ['Fiscal year', input.fiscal_year_label],
      ['Currency', input.currency_code],
      ['Scenarios', (input.payload.scenarios ?? []).map((s) => s.name).join(', ') || '—'],
    ]);
    sheet.getColumn(1).width = 22;
    sheet.getColumn(2).width = 40;
    sheet.getColumn(1).font = { bold: true };
  }

  private addDriversSheet(wb: ExcelJS.Workbook, input: ExcelRendererInput): void {
    const sheet = wb.addWorksheet('Drivers');
    sheet.columns = [
      { header: 'Driver', key: 'name', width: 36 },
      { header: 'Value', key: 'value', width: 16 },
      { header: 'Description', key: 'desc', width: 60 },
    ];
    const d = input.payload.drivers;
    sheet.addRow({
      name: 'salary_uplift_pct',
      value: d.salary_uplift_pct,
      desc: 'Annual salary increase across all staff',
    });
    sheet.addRow({
      name: 'discount_capture_pct',
      value: d.discount_capture_pct,
      desc: '% of gross tuition lost to discounts',
    });
    sheet.addRow({
      name: 'scholarship_capture_pct',
      value: d.scholarship_capture_pct,
      desc: '% of gross tuition lost to scholarships',
    });
    sheet.addRow({
      name: 'utilities_inflation_pct',
      value: d.utilities_inflation_pct,
      desc: 'Year-over-year utilities inflation',
    });
    sheet.addRow({
      name: 'materials_inflation_pct',
      value: d.materials_inflation_pct,
      desc: 'Year-over-year materials inflation',
    });
    sheet.addRow({
      name: 'donations_forecast',
      value: d.donations_forecast,
      desc: 'Other income — donations',
    });
    sheet.addRow({
      name: 'grants_forecast',
      value: d.grants_forecast,
      desc: 'Other income — grants',
    });
    this.styleHeader(sheet);
  }

  private addBaseCaseSheet(wb: ExcelJS.Workbook, input: ExcelRendererInput): void {
    const sheet = wb.addWorksheet('Base Case');
    sheet.columns = [
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Subcategory', key: 'subcategory', width: 28 },
      { header: 'Name', key: 'name', width: 40 },
      { header: 'Year', key: 'fy', width: 6 },
      { header: 'Source', key: 'source', width: 16 },
      { header: 'Amount', key: 'amount', width: 16 },
    ];
    for (const li of input.payload.line_items ?? []) {
      const row = sheet.addRow({
        category: li.category,
        subcategory: li.subcategory,
        name: li.name,
        fy: li.fiscal_year,
        source: li.source ?? 'driver_derived',
        amount: Number(li.amount),
      });
      row.getCell('amount').numFmt = `"${input.currency_code}" #,##0.00`;
    }
    this.styleHeader(sheet);
    this.appendTotalsRow(sheet, input);
  }

  private addScenarioSheets(wb: ExcelJS.Workbook, input: ExcelRendererInput): void {
    for (const scenario of input.payload.scenarios ?? []) {
      const sheet = wb.addWorksheet(scenario.name.slice(0, 31)); // Excel limit
      sheet.columns = [
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Subcategory', key: 'subcategory', width: 28 },
        { header: 'Name', key: 'name', width: 40 },
        { header: 'Year', key: 'fy', width: 6 },
        { header: 'Amount', key: 'amount', width: 16 },
      ];
      for (const li of scenario.line_items ?? []) {
        const row = sheet.addRow({
          category: li.category,
          subcategory: li.subcategory,
          name: li.name,
          fy: li.fiscal_year,
          amount: Number(li.amount),
        });
        row.getCell('amount').numFmt = `"${input.currency_code}" #,##0.00`;
      }
      this.styleHeader(sheet);
    }
  }

  private addCapexSheet(wb: ExcelJS.Workbook, input: ExcelRendererInput): void {
    const sheet = wb.addWorksheet('Capex');
    sheet.columns = [
      { header: 'Item', key: 'name', width: 40 },
      { header: 'Year', key: 'fy', width: 6 },
      { header: 'Amount', key: 'amount', width: 16 },
      { header: 'Notes', key: 'notes', width: 50 },
    ];
    for (const item of input.payload.drivers.capex_items) {
      const row = sheet.addRow({
        name: item.name,
        fy: item.fiscal_year,
        amount: Number(item.amount),
        notes: item.notes ?? '',
      });
      row.getCell('amount').numFmt = `"${input.currency_code}" #,##0.00`;
    }
    this.styleHeader(sheet);
  }

  private addPerPupilSheet(wb: ExcelJS.Workbook, input: ExcelRendererInput): void {
    const sheet = wb.addWorksheet('Per-Pupil');
    sheet.columns = [
      { header: 'Year', key: 'fy', width: 8 },
      { header: 'Revenue / pupil', key: 'rps', width: 18 },
      { header: 'Expenditure / pupil', key: 'eps', width: 18 },
      { header: 'Net / pupil', key: 'nps', width: 18 },
      { header: 'Breakeven students', key: 'be', width: 18 },
    ];
    for (const r of input.payload.per_pupil_unit_economics ?? []) {
      const row = sheet.addRow({
        fy: r.fiscal_year,
        rps: r.revenue_per_student,
        eps: r.expenditure_per_student,
        nps: r.net_per_student,
        be: r.breakeven_students ?? '—',
      });
      ['rps', 'eps', 'nps'].forEach((k) => {
        row.getCell(k).numFmt = `"${input.currency_code}" #,##0.00`;
      });
    }
    this.styleHeader(sheet);
  }

  private styleHeader(sheet: ExcelJS.Worksheet): void {
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  }

  private appendTotalsRow(sheet: ExcelJS.Worksheet, input: ExcelRendererInput): void {
    const totals = input.payload.totals_by_year ?? [];
    if (totals.length === 0) return;
    const row = sheet.addRow({});
    row.getCell('name').value = 'TOTAL — base case year 1';
    row.getCell('amount').value = totals[0].net_result;
    row.getCell('amount').numFmt = `"${input.currency_code}" #,##0.00`;
    row.font = { bold: true };
  }
}
```

### 5. `apps/api/src/modules/budgeting/exports/exports.controller.ts` — NEW

Three routes under `/v1/budgeting/financial-models/:id/snapshots/:snapshotId/exports`.

```typescript
import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import type { TenantContext } from '../../../common/types/tenant-context';

import { ExportsService } from './exports.service';

@Controller('v1/budgeting/financial-models/:id/snapshots/:snapshotId/exports')
@UseGuards(AuthGuard, PermissionGuard)
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  // GET — serves the PDF; returns 202 with job id if not yet rendered, otherwise redirects to a 1h-signed URL
  @Get('pdf')
  @RequiresPermission('budgeting.view')
  async getPdf(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.exportsService.serveSnapshotArtifact(
      ctx.tenant_id,
      modelId,
      snapshotId,
      'pdf',
    );
    if (result.status === 'rendered') {
      res.redirect(HttpStatus.FOUND, result.signed_url);
      return;
    }
    res.status(HttpStatus.ACCEPTED).json({
      status: 'rendering',
      job_id: result.job_id,
      message: 'Board pack is rendering. Try again in a few seconds.',
    });
  }

  @Get('excel')
  @RequiresPermission('budgeting.view')
  async getExcel(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.exportsService.serveSnapshotArtifact(
      ctx.tenant_id,
      modelId,
      snapshotId,
      'excel',
    );
    if (result.status === 'rendered') {
      res.redirect(HttpStatus.FOUND, result.signed_url);
      return;
    }
    res.status(HttpStatus.ACCEPTED).json({
      status: 'rendering',
      job_id: result.job_id,
      message: 'Excel export is rendering. Try again in a few seconds.',
    });
  }

  @Post('regenerate')
  @RequiresPermission('budgeting.publish')
  async regenerate(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
  ): Promise<{ job_id: string; status: 'enqueued' }> {
    const job_id = await this.exportsService.enqueueBoardPackRender(
      ctx.tenant_id,
      modelId,
      snapshotId,
      'all',
    );
    return { job_id, status: 'enqueued' };
  }
}
```

### 6. `apps/api/src/modules/budgeting/exports/exports.service.ts` — NEW

Service responsibilities:

- Verify the snapshot belongs to the model and the tenant (RLS-bound `findFirst`).
- For `serveSnapshotArtifact`: read `pdf_object_key` / `excel_object_key` off the snapshot. If present, mint a 1h signed URL via the existing `s3.helpers.ts` (or whatever the API uses for object-storage signing). If absent, enqueue a render job and return `{ status: 'pending', job_id }`.
- For `enqueueBoardPackRender`: push `{ tenant_id, snapshot_id, format }` onto the budgeting queue and return the BullMQ job id.

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { ObjectStorageService } from '../../../common/services/object-storage.service';

interface ServeArtifactResult {
  status: 'rendered' | 'pending';
  signed_url?: string;
  job_id?: string;
}

const BUDGETING_QUEUE = 'budgeting';
const BUDGETING_BOARD_PACK_RENDER_JOB = 'budgeting:board-pack-render';

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorage: ObjectStorageService,
    @InjectQueue(BUDGETING_QUEUE) private readonly budgetingQueue: Queue,
  ) {}

  async serveSnapshotArtifact(
    tenantId: string,
    modelId: string,
    snapshotId: string,
    format: 'pdf' | 'excel',
  ): Promise<ServeArtifactResult> {
    const snapshot = await this.prisma.financialModelSnapshot.findFirst({
      where: { id: snapshotId, parent_model_id: modelId, tenant_id: tenantId },
      select: { id: true, pdf_object_key: true, excel_object_key: true, rendered_at: true },
    });
    if (!snapshot) {
      throw new NotFoundException({
        code: 'SNAPSHOT_NOT_FOUND',
        message: `Snapshot "${snapshotId}" not found on model "${modelId}".`,
      });
    }
    const key = format === 'pdf' ? snapshot.pdf_object_key : snapshot.excel_object_key;
    if (!key) {
      const job_id = await this.enqueueBoardPackRender(tenantId, modelId, snapshotId, format);
      return { status: 'pending', job_id };
    }
    const signed_url = await this.objectStorage.signGetUrl(key, { expiresInSeconds: 3600 });
    return { status: 'rendered', signed_url };
  }

  async enqueueBoardPackRender(
    tenantId: string,
    modelId: string,
    snapshotId: string,
    format: 'pdf' | 'excel' | 'all',
  ): Promise<string> {
    // Verify snapshot exists in this tenant before enqueueing — protects the
    // worker from cross-tenant leakage if the controller chain ever drops a guard.
    const exists = await this.prisma.financialModelSnapshot.findFirst({
      where: { id: snapshotId, parent_model_id: modelId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException({
        code: 'SNAPSHOT_NOT_FOUND',
        message: `Snapshot "${snapshotId}" not found on model "${modelId}".`,
      });
    }
    const job = await this.budgetingQueue.add(
      BUDGETING_BOARD_PACK_RENDER_JOB,
      { tenant_id: tenantId, snapshot_id: snapshotId, format },
      {
        removeOnComplete: 50,
        removeOnFail: 200,
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
    return String(job.id);
  }
}
```

If `ObjectStorageService` does not yet exist with `signGetUrl()`, fall back to the existing `s3.helpers.ts` `getSignedUrl` pattern; this implementation can be sub-classed in the same commit.

### 7. `apps/api/src/modules/budgeting/exports/exports.service.spec.ts` — NEW

Co-located tests:

```typescript
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { ObjectStorageService } from '../../../common/services/object-storage.service';

import { ExcelRendererService } from './excel-renderer.service';
import { ExportsService } from './exports.service';
import { PdfRendererService } from './pdf-renderer.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const MODEL_ID = '22222222-2222-2222-2222-222222222222';
const SNAPSHOT_ID = '33333333-3333-3333-3333-333333333333';

describe('ExportsService — serveSnapshotArtifact', () => {
  let service: ExportsService;
  let prisma: { financialModelSnapshot: { findFirst: jest.Mock } };
  let queue: { add: jest.Mock };
  let objectStorage: { signGetUrl: jest.Mock };

  beforeEach(async () => {
    prisma = { financialModelSnapshot: { findFirst: jest.fn() } };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    objectStorage = { signGetUrl: jest.fn().mockResolvedValue('https://signed/url') };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ObjectStorageService, useValue: objectStorage },
        { provide: getQueueToken('budgeting'), useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(ExportsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns rendered + signed URL when pdf_object_key is set', async () => {
    prisma.financialModelSnapshot.findFirst.mockResolvedValue({
      id: SNAPSHOT_ID,
      pdf_object_key: 'tenants/A/key.pdf',
      excel_object_key: null,
      rendered_at: new Date(),
    });
    const out = await service.serveSnapshotArtifact(TENANT_A, MODEL_ID, SNAPSHOT_ID, 'pdf');
    expect(out.status).toBe('rendered');
    expect(out.signed_url).toBe('https://signed/url');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues render and returns pending when key is missing', async () => {
    prisma.financialModelSnapshot.findFirst.mockResolvedValue({
      id: SNAPSHOT_ID,
      pdf_object_key: null,
      excel_object_key: null,
      rendered_at: null,
    });
    const out = await service.serveSnapshotArtifact(TENANT_A, MODEL_ID, SNAPSHOT_ID, 'pdf');
    expect(out.status).toBe('pending');
    expect(out.job_id).toBe('job-1');
    expect(queue.add).toHaveBeenCalledWith(
      'budgeting:board-pack-render',
      { tenant_id: TENANT_A, snapshot_id: SNAPSHOT_ID, format: 'pdf' },
      expect.any(Object),
    );
  });

  it('throws NotFoundException when snapshot does not belong to tenant', async () => {
    prisma.financialModelSnapshot.findFirst.mockResolvedValue(null);
    await expect(
      service.serveSnapshotArtifact(TENANT_A, MODEL_ID, SNAPSHOT_ID, 'pdf'),
    ).rejects.toThrow(/SNAPSHOT_NOT_FOUND|not found/);
  });
});

describe('PdfRendererService', () => {
  it('produces a non-empty PDF buffer for a sample snapshot', async () => {
    const svc = new PdfRendererService();
    const buf = await svc.renderBoardPackPdf({
      tenant_name: 'Test School',
      currency_code: 'EUR',
      model_name: 'FY 2026',
      version_number: 1,
      published_at: '2026-04-25T10:00:00Z',
      published_by_name: 'Test User',
      fiscal_year_label: 'FY2026',
      executive_summary: 'Test summary.',
      payload: SAMPLE_SNAPSHOT_PAYLOAD,
    });
    expect(buf.byteLength).toBeGreaterThan(1000);
    // PDF magic number
    expect(buf.subarray(0, 4).toString('ascii')).toBe('%PDF');
  }, 30_000);
});

describe('ExcelRendererService', () => {
  it('produces a workbook with the expected sheets', async () => {
    const svc = new ExcelRendererService();
    const buf = await svc.renderBoardPackExcel({
      tenant_name: 'Test School',
      currency_code: 'EUR',
      model_name: 'FY 2026',
      version_number: 1,
      published_at: '2026-04-25T10:00:00Z',
      fiscal_year_label: 'FY2026',
      payload: SAMPLE_SNAPSHOT_PAYLOAD,
    });
    expect(buf.byteLength).toBeGreaterThan(2000);

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.getWorksheet('Info')).toBeDefined();
    expect(wb.getWorksheet('Drivers')).toBeDefined();
    expect(wb.getWorksheet('Base Case')).toBeDefined();
    expect(wb.getWorksheet('Capex')).toBeDefined();
    expect(wb.getWorksheet('Per-Pupil')).toBeDefined();
    // Base Case totals row reflects payload net_result.
    const baseCase = wb.getWorksheet('Base Case')!;
    const lastRow = baseCase.getRow(baseCase.rowCount);
    expect(lastRow.getCell('amount').value).toBe(
      SAMPLE_SNAPSHOT_PAYLOAD.totals_by_year[0].net_result,
    );
  });
});

const SAMPLE_SNAPSHOT_PAYLOAD = {
  drivers: {
    enrollment_growth_pct_by_year_group: {},
    fee_uplift_pct_by_year_group: {},
    staff_headcount_delta_by_department: {},
    salary_uplift_pct: 3,
    discount_capture_pct: 4,
    scholarship_capture_pct: 2,
    utilities_inflation_pct: 4,
    materials_inflation_pct: 3,
    capex_items: [],
    donations_forecast: 5000,
    grants_forecast: 0,
    custom: {},
  },
  line_items: [
    {
      category: 'income',
      subcategory: 'tuition_net',
      name: 'Tuition (net)',
      fiscal_year: 1,
      source: 'driver_derived',
      amount: 1_200_000,
      computed_from: {},
    },
    {
      category: 'staff_costs',
      subcategory: 'total',
      name: 'Staff costs',
      fiscal_year: 1,
      source: 'driver_derived',
      amount: 720_000,
      computed_from: {},
    },
  ],
  totals_by_year: [
    { fiscal_year: 1, revenue: 1_205_000, expenditure: 720_000, net_result: 485_000 },
  ],
  per_pupil_unit_economics: [
    {
      fiscal_year: 1,
      revenue_per_student: 6000,
      expenditure_per_student: 3600,
      net_per_student: 2400,
      revenue_per_household: 7000,
      breakeven_students: 120,
    },
  ],
  scenarios: [],
};
```

### 8. `apps/worker/src/processors/budgeting/board-pack-render.processor.ts` — NEW

Worker side. Listens for `budgeting:board-pack-render`. Loads the snapshot, renders both PDF and Excel (via the same renderer services — see §9 below for sharing strategy), uploads to object storage, updates the snapshot row.

Job name + payload:

```typescript
export const BUDGETING_BOARD_PACK_RENDER_JOB = 'budgeting:board-pack-render';

interface BoardPackRenderPayload extends TenantJobPayload {
  snapshot_id: string;
  format: 'pdf' | 'excel' | 'all';
}
```

The worker re-imports `PdfRendererService`, `ExcelRendererService`, and `buildBoardPackHtml` from the **API workspace** (`@school/api/...`) — this is acceptable because Puppeteer + exceljs are already required in the API process and adding them to the worker would duplicate the chromium binary on the deploy server. If the existing repo doesn't have a published API export, the alternative is to hoist these three files into a small `packages/budgeting-renderer/` workspace; see §10.

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';
import { uploadBufferToS3 } from '../../base/s3.helpers';

// Renderer imports — see §10 for package strategy.
import { ExcelRendererService, PdfRendererService } from '@school/budgeting-renderer';

export const BUDGETING_BOARD_PACK_RENDER_JOB = 'budgeting:board-pack-render';

interface BoardPackRenderPayload extends TenantJobPayload {
  snapshot_id: string;
  format: 'pdf' | 'excel' | 'all';
}

@Injectable()
export class BoardPackRenderProcessor {
  private readonly logger = new Logger(BoardPackRenderProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async process(job: Job<BoardPackRenderPayload>): Promise<void> {
    if (job.name !== BUDGETING_BOARD_PACK_RENDER_JOB) return;
    const { tenant_id, snapshot_id, format } = job.data;
    if (!tenant_id) {
      this.logger.warn(`${BUDGETING_BOARD_PACK_RENDER_JOB} rejected — missing tenant_id`);
      return;
    }
    const renderJob = new BoardPackRenderJob(this.prisma);
    await renderJob.execute({ tenant_id, snapshot_id, format });
  }
}

class BoardPackRenderJob extends TenantAwareJob<BoardPackRenderPayload> {
  private readonly logger = new Logger(BoardPackRenderJob.name);
  private readonly pdfRenderer = new PdfRendererService();
  private readonly excelRenderer = new ExcelRendererService();

  protected async processJob(data: BoardPackRenderPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, snapshot_id, format } = data;

    const snapshot = await tx.financialModelSnapshot.findFirst({
      where: { id: snapshot_id, tenant_id },
      include: {
        tenant: { select: { name: true, currency_code: true } },
        publisher: { select: { full_name: true, email: true } },
        parent_model: { select: { name: true, fiscal_year_start: true, fiscal_year_end: true } },
      },
    });
    if (!snapshot) {
      this.logger.warn(`Snapshot ${snapshot_id} not found in tenant ${tenant_id}`);
      return;
    }

    const fyLabel = formatFy(
      snapshot.parent_model.fiscal_year_start,
      snapshot.parent_model.fiscal_year_end,
    );
    const baseInput = {
      tenant_name: snapshot.tenant.name,
      currency_code: snapshot.tenant.currency_code,
      model_name: snapshot.parent_model.name,
      version_number: snapshot.version_number,
      published_at: snapshot.published_at.toISOString(),
      fiscal_year_label: fyLabel,
      payload: snapshot.payload as never,
    };

    const update: { pdf_object_key?: string; excel_object_key?: string; rendered_at: Date } = {
      rendered_at: new Date(),
    };

    if (format === 'pdf' || format === 'all') {
      const pdfBuf = await this.pdfRenderer.renderBoardPackPdf({
        ...baseInput,
        executive_summary: snapshot.executive_summary,
        published_by_name: snapshot.publisher.full_name ?? snapshot.publisher.email,
      });
      const key = `tenants/${tenant_id}/budgeting/snapshots/${snapshot_id}/board-pack-v${snapshot.version_number}.pdf`;
      await uploadBufferToS3(key, pdfBuf, 'application/pdf');
      update.pdf_object_key = key;
      this.logger.log(`Uploaded PDF for snapshot ${snapshot_id} → ${key}`);
    }

    if (format === 'excel' || format === 'all') {
      const xlsBuf = await this.excelRenderer.renderBoardPackExcel(baseInput);
      const key = `tenants/${tenant_id}/budgeting/snapshots/${snapshot_id}/board-pack-v${snapshot.version_number}.xlsx`;
      await uploadBufferToS3(
        key,
        xlsBuf,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      update.excel_object_key = key;
      this.logger.log(`Uploaded Excel for snapshot ${snapshot_id} → ${key}`);
    }

    await tx.financialModelSnapshot.update({
      where: { id: snapshot_id },
      data: update,
    });
  }
}

function formatFy(start: Date, end: Date): string {
  const sy = start.getUTCFullYear(),
    ey = end.getUTCFullYear();
  return sy === ey ? String(sy) : `${sy}/${String(ey).slice(2)}`;
}
```

### 9. `apps/worker/src/processors/budgeting/board-pack-render.processor.spec.ts` — NEW

```typescript
import { Job } from 'bullmq';

import {
  BUDGETING_BOARD_PACK_RENDER_JOB,
  BoardPackRenderProcessor,
} from './board-pack-render.processor';

jest.mock('@school/budgeting-renderer', () => ({
  PdfRendererService: jest.fn().mockImplementation(() => ({
    renderBoardPackPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock')),
  })),
  ExcelRendererService: jest.fn().mockImplementation(() => ({
    renderBoardPackExcel: jest.fn().mockResolvedValue(Buffer.from('PK\x03\x04 mock')),
  })),
}));

jest.mock('../../base/s3.helpers', () => ({
  uploadBufferToS3: jest.fn().mockResolvedValue(undefined),
}));

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const SNAPSHOT_ID = '22222222-2222-2222-2222-222222222222';

function buildMockTx() {
  return {
    financialModelSnapshot: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockPrisma(tx: ReturnType<typeof buildMockTx>) {
  return {
    $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };
}

describe('BoardPackRenderProcessor', () => {
  it('renders both pdf and excel when format=all and updates the row', async () => {
    const tx = buildMockTx();
    tx.financialModelSnapshot.findFirst.mockResolvedValue({
      id: SNAPSHOT_ID,
      version_number: 1,
      executive_summary: 's',
      published_at: new Date('2026-04-01'),
      payload: {
        drivers: {},
        line_items: [],
        totals_by_year: [],
        per_pupil_unit_economics: [],
        scenarios: [],
      },
      tenant: { name: 'Acme', currency_code: 'EUR' },
      publisher: { full_name: 'Pub', email: 'p@a' },
      parent_model: {
        name: 'FY26',
        fiscal_year_start: new Date('2026-09-01'),
        fiscal_year_end: new Date('2027-06-30'),
      },
    });
    const prisma = buildMockPrisma(tx);
    const proc = new BoardPackRenderProcessor(prisma as never);
    await proc.process({
      id: 'job',
      name: BUDGETING_BOARD_PACK_RENDER_JOB,
      data: { tenant_id: TENANT_ID, snapshot_id: SNAPSHOT_ID, format: 'all' },
    } as unknown as Job);
    expect(tx.financialModelSnapshot.update).toHaveBeenCalledWith({
      where: { id: SNAPSHOT_ID },
      data: expect.objectContaining({
        pdf_object_key: expect.stringContaining(
          `tenants/${TENANT_ID}/budgeting/snapshots/${SNAPSHOT_ID}`,
        ),
        excel_object_key: expect.stringContaining(
          `tenants/${TENANT_ID}/budgeting/snapshots/${SNAPSHOT_ID}`,
        ),
        rendered_at: expect.any(Date),
      }),
    });
  });

  it('skips silently when snapshot not found in tenant', async () => {
    const tx = buildMockTx();
    tx.financialModelSnapshot.findFirst.mockResolvedValue(null);
    const proc = new BoardPackRenderProcessor(buildMockPrisma(tx) as never);
    await proc.process({
      id: 'job',
      name: BUDGETING_BOARD_PACK_RENDER_JOB,
      data: { tenant_id: TENANT_ID, snapshot_id: SNAPSHOT_ID, format: 'all' },
    } as unknown as Job);
    expect(tx.financialModelSnapshot.update).not.toHaveBeenCalled();
  });
});
```

### 10. Renderer sharing strategy — `packages/budgeting-renderer/` (NEW workspace)

Creating a dedicated workspace package keeps Puppeteer + exceljs out of the worker's general dependency surface and lets both the API service `ExportsService` and the worker processor reuse the exact same code. Three files:

```
packages/budgeting-renderer/
├── package.json                               # name: "@school/budgeting-renderer"
├── tsconfig.json
└── src/
    ├── index.ts                               # barrel
    ├── pdf-renderer.service.ts                # moved from apps/api/src/modules/budgeting/exports/
    ├── excel-renderer.service.ts              # moved from apps/api/src/modules/budgeting/exports/
    └── board-pack-template.ts                 # moved from apps/api/src/modules/budgeting/exports/
```

`package.json` declares deps on `puppeteer` and `exceljs` only; the API and worker workspaces add `@school/budgeting-renderer` as a dep (no separate puppeteer/exceljs dep needed in either consumer). The `ExportsService` in apps/api re-imports from the package.

If Wave-3 schedule pressure makes that workspace add too risky, an acceptable shortcut is to keep the renderers in `apps/api/...` and have the worker import via a relative path: `import { PdfRendererService } from '../../../../api/src/modules/budgeting/exports/pdf-renderer.service';`. This works because Turborepo's symlinked node_modules resolve cross-app imports during build. The shared-package route is preferred — note the choice in the completion record.

### 11. `apps/api/src/modules/budgeting/budgeting.module.ts` — UPDATE

Add the exports controller + service + the two renderer services as providers (or import the shared package's providers, depending on §10). Inject `BullModule.registerQueue({ name: 'budgeting' })` so `@InjectQueue('budgeting')` resolves.

### 12. `apps/worker/src/worker.module.ts` — UPDATE

Append `BoardPackRenderProcessor` to providers and append the case to `BudgetingQueueDispatcher` (created in Phase 08):

```typescript
// In budgeting-queue.processor.ts case statement, add:
case BUDGETING_BOARD_PACK_RENDER_JOB:
  await this.boardPackRender.process(job);
  return;

// In the dispatcher constructor, inject:
private readonly boardPackRender: BoardPackRenderProcessor,
```

### 13. Architecture docs — UPDATE

- `docs/architecture/event-job-catalog.md` — append `budgeting:board-pack-render` (queue: budgeting; trigger: snapshot publish + manual regenerate; payload: `{ tenant_id, snapshot_id, format }`; side-effects: writes `financial_model_snapshots.pdf_object_key`, `excel_object_key`, `rendered_at`; uploads to Hetzner `tenants/<tenant_id>/budgeting/snapshots/<snapshot_id>/`).
- `docs/architecture/module-blast-radius.md` — note the new dependency on `ObjectStorageService` / `s3.helpers`.

## Testing requirements

- **`pdf-renderer.service.spec.ts`** — produces a valid PDF buffer (`%PDF-` magic number, byte length ≥ 1000) for a sample snapshot.
- **`excel-renderer.service.ts`** — produces a workbook with sheets Info / Drivers / Base Case / Capex / Per-Pupil; the Base Case totals row equals `payload.totals_by_year[0].net_result`.
- **`exports.service.spec.ts`** — see §7. Covers: rendered → returns signed URL; missing key → enqueues + returns pending; cross-tenant snapshot returns NotFoundException.
- **`board-pack-render.processor.spec.ts`** — see §9. Covers: format=all renders both and updates the row; missing snapshot → silent no-op; tenant_id required.
- **AppModule DI smoke** — required because new providers and a new queue are wired.
- **Regression** — `pnpm turbo run test --filter=@school/api --filter=@school/worker --filter=@school/budgeting-renderer` (or just api/worker if §10 chose the shortcut path).

## Post-deploy verification

1. Rsync to production. SSH in. `pnpm install` if `pnpm-lock.yaml` changed (renderer package added). `chown -R edupod:edupod`. Build api + worker. `pm2 restart api worker`.
2. Confirm `pm2 logs api --lines 100` shows the new module loaded with no errors.
3. Confirm `pm2 logs worker --lines 100` shows `BudgetingQueueDispatcher` registered (it will log on its first job).
4. Take a published snapshot in NHQS (e.g. one created during Phase 05's verification) and call:
   ```bash
   curl -X POST https://nhqs.edupod.app/api/v1/budgeting/financial-models/<id>/snapshots/<snapId>/exports/regenerate \
     -H "Authorization: Bearer <owner-jwt>"
   ```
   Within ~30 seconds, `pm2 logs worker` should show `Uploaded PDF for snapshot ...` and `Uploaded Excel for snapshot ...`.
5. Issue:
   ```bash
   curl -L https://nhqs.edupod.app/api/v1/budgeting/financial-models/<id>/snapshots/<snapId>/exports/pdf \
     -H "Authorization: Bearer <owner-jwt>" -o /tmp/board-pack.pdf
   ```
   Confirm `/tmp/board-pack.pdf` is a valid PDF (`file /tmp/board-pack.pdf`).
6. In psql:
   ```sql
   SELECT pdf_object_key, excel_object_key, rendered_at
     FROM financial_model_snapshots WHERE id = '<snapId>';
   ```
   All three columns populated.

## Follow-ups for subsequent waves

- Phase 16 (Snapshots & Version History UI) calls `GET /exports/pdf` and `/exports/excel` to fetch download links. The 202 + retry pattern is documented in this phase; the UI handles it via a `useEffect` retry loop (max 5 attempts, 5s backoff) before falling back to a "Generation failed — try again" toast.
- Phase 20 (Outputs UI / Settings page) wires the `POST /regenerate` button.
- A future cycle may move the PDF render to a queue with concurrency=1 if Puppeteer memory pressure becomes an issue at scale; currently each board pack is small enough to render in <10s.
- Excel sheets currently lack an explicit "Variance" sheet. Phase 09 stops short of the variance sheet because the variance summary lives in the API (Phase 06 service) and would force a cross-API call from the worker. Add as a v1.5 follow-up: enrich the snapshot payload with `variance_summary` at publish time so the worker doesn't need a live variance fetch.

## Rollback

`git revert <commit-sha>`. The new tables / columns from Phase 01 stay (the snapshot's `pdf_object_key` / `excel_object_key` columns become NULL again — harmless). Stale objects in Hetzner under `tenants/*/budgeting/snapshots/*/` can be left for the next cleanup cycle; a later phase can add an explicit lifecycle policy if needed.
