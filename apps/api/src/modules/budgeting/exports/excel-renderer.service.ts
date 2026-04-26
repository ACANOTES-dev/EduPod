import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';

import type { SnapshotPayload } from '@school/shared/budgeting';

export interface ExcelRendererInput {
  tenant_name: string;
  currency_code: string;
  model_name: string;
  version_number: number;
  published_at: string;
  fiscal_year_label: string;
  payload: SnapshotPayload;
}

/**
 * ExcelRendererService — produces the multi-sheet board-pack workbook
 * promised by PLAN.md §11.3. Sheets:
 *
 *   - Info        : tenant + model metadata
 *   - Drivers     : the 11 canonical drivers + descriptions
 *   - Base Case   : flat line-item table with category / amount + total
 *   - Scenarios   : one sheet per published scenario (capped to 3)
 *   - Capex       : capex appendix
 *   - Per-Pupil   : unit economics by year
 *
 * Each sheet has a styled header row (white text on dark slate). Numeric
 * columns get the tenant's currency-code format string (`USD #,##0.00`).
 */
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
      ['Scenarios', input.payload.scenarios.map((s) => s.name).join(', ') || '—'],
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
    const d = input.payload.model.drivers;
    const rows: Array<{ name: string; value: number | string; desc: string }> = [
      {
        name: 'salary_uplift_pct',
        value: d.salary_uplift_pct,
        desc: 'Annual salary increase across all staff',
      },
      {
        name: 'discount_capture_pct',
        value: d.discount_capture_pct,
        desc: '% of gross tuition lost to discounts',
      },
      {
        name: 'scholarship_capture_pct',
        value: d.scholarship_capture_pct,
        desc: '% of gross tuition lost to scholarships',
      },
      {
        name: 'utilities_inflation_pct',
        value: d.utilities_inflation_pct,
        desc: 'Year-over-year utilities inflation',
      },
      {
        name: 'materials_inflation_pct',
        value: d.materials_inflation_pct,
        desc: 'Year-over-year materials inflation',
      },
      {
        name: 'donations_forecast',
        value: d.donations_forecast,
        desc: 'Other income — donations',
      },
      {
        name: 'grants_forecast',
        value: d.grants_forecast,
        desc: 'Other income — grants',
      },
    ];
    rows.forEach((row) => sheet.addRow(row));
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
    const fmt = `"${input.currency_code}" #,##0.00`;
    for (const li of input.payload.base_case.line_items) {
      const row = sheet.addRow({
        category: li.category,
        subcategory: li.subcategory,
        name: li.name,
        fy: li.fiscal_year,
        source: li.source,
        amount: Number(li.amount),
      });
      row.getCell('amount').numFmt = fmt;
    }
    this.styleHeader(sheet);
    this.appendTotalsRow(sheet, input);
  }

  private addScenarioSheets(wb: ExcelJS.Workbook, input: ExcelRendererInput): void {
    for (const scenario of input.payload.scenarios) {
      const sheet = wb.addWorksheet(scenario.name.slice(0, 31)); // Excel limit
      sheet.columns = [
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Subcategory', key: 'subcategory', width: 28 },
        { header: 'Name', key: 'name', width: 40 },
        { header: 'Year', key: 'fy', width: 6 },
        { header: 'Amount', key: 'amount', width: 16 },
      ];
      const fmt = `"${input.currency_code}" #,##0.00`;
      for (const li of scenario.computed.line_items) {
        const row = sheet.addRow({
          category: li.category,
          subcategory: li.subcategory,
          name: li.name,
          fy: li.fiscal_year,
          amount: Number(li.amount),
        });
        row.getCell('amount').numFmt = fmt;
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
    const fmt = `"${input.currency_code}" #,##0.00`;
    for (const item of input.payload.model.drivers.capex_items) {
      const row = sheet.addRow({
        name: item.name,
        fy: item.fiscal_year,
        amount: Number(item.amount),
        notes: item.notes ?? '',
      });
      row.getCell('amount').numFmt = fmt;
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
    const fmt = `"${input.currency_code}" #,##0.00`;
    for (const r of input.payload.base_case.per_pupil_unit_economics) {
      const row = sheet.addRow({
        fy: r.fiscal_year,
        rps: r.revenue_per_student,
        eps: r.expenditure_per_student,
        nps: r.net_per_student,
        be: r.breakeven_students ?? '—',
      });
      ['rps', 'eps', 'nps'].forEach((k) => {
        row.getCell(k).numFmt = fmt;
      });
    }
    this.styleHeader(sheet);
  }

  private styleHeader(sheet: ExcelJS.Worksheet): void {
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };
  }

  private appendTotalsRow(sheet: ExcelJS.Worksheet, input: ExcelRendererInput): void {
    const totals = input.payload.base_case.totals_by_year;
    if (totals.length === 0) return;
    const fmt = `"${input.currency_code}" #,##0.00`;
    const row = sheet.addRow({});
    row.getCell('name').value = 'TOTAL — base case year 1';
    row.getCell('amount').value = totals[0]!.net_result;
    row.getCell('amount').numFmt = fmt;
    row.font = { bold: true };
  }
}
