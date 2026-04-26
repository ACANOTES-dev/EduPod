import ExcelJS from 'exceljs';

import type { SnapshotPayload } from '@school/shared/budgeting';

import { ExcelRendererService } from './excel-renderer.service';

const SAMPLE_PAYLOAD: SnapshotPayload = {
  schema_version: 1,
  model: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'FY 2026',
    description: null,
    fiscal_year_start: '2026-09-01',
    fiscal_year_end: '2027-08-31',
    horizon_years: 1,
    drivers: {
      enrollment_growth_pct_by_year_group: {},
      fee_uplift_pct_by_year_group: {},
      staff_headcount_delta_by_department: {},
      salary_uplift_pct: 3,
      discount_capture_pct: 4,
      scholarship_capture_pct: 2,
      utilities_inflation_pct: 4,
      materials_inflation_pct: 3,
      capex_items: [
        {
          id: 'boiler-replacement',
          name: 'Boiler',
          fiscal_year: 1,
          amount: 25_000,
          notes: 'urgent replacement',
        },
      ],
      donations_forecast: 5000,
      grants_forecast: 0,
      custom: {},
    },
  },
  scenarios: [],
  base_case: {
    line_items: [
      {
        id: '22222222-2222-4222-8222-aaaaaaaaaaaa',
        category: 'income',
        subcategory: 'tuition_net',
        name: 'Tuition (net)',
        fiscal_year: 1,
        source: 'driver_derived',
        amount: 1_200_000,
        is_locked: false,
        notes: null,
        references_event_budget_id: null,
      },
      {
        id: '22222222-2222-4222-8222-bbbbbbbbbbbb',
        category: 'staff_costs',
        subcategory: 'teaching',
        name: 'Teaching staff',
        fiscal_year: 1,
        source: 'driver_derived',
        amount: 720_000,
        is_locked: false,
        notes: null,
        references_event_budget_id: null,
      },
    ],
    totals_by_year: [
      {
        fiscal_year: 1,
        revenue: 1_205_000,
        expenditure: 720_000,
        net_result: 485_000,
      },
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
  },
  source_snapshot: {
    captured_at: '2026-04-01T00:00:00.000Z',
    tenant_id: '99999999-9999-4999-8999-999999999999',
    fiscal_year_start: '2026-09-01',
    fiscal_year_end: '2027-08-31',
    currency_code: 'USD',
    total_active_students: 200,
    total_active_households: 150,
    students_by_year_group: [],
    fees_by_year_group: [],
    staff_by_department: [],
  },
  executive_summary: 'Test summary.',
  published_at: '2026-04-25T10:00:00.000Z',
  published_by: { user_id: '88888888-8888-4888-8888-888888888888', name: 'Test User' },
};

const baseInput = {
  tenant_name: 'Test School',
  currency_code: 'EUR',
  model_name: 'FY 2026',
  version_number: 1,
  published_at: '2026-04-25T10:00:00Z',
  fiscal_year_label: 'FY2026',
  payload: SAMPLE_PAYLOAD,
};

describe('ExcelRendererService', () => {
  let service: ExcelRendererService;

  beforeEach(() => {
    service = new ExcelRendererService();
  });

  it('produces a workbook with the expected sheets', async () => {
    const buf = await service.renderBoardPackExcel(baseInput);
    expect(buf.byteLength).toBeGreaterThan(2000);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    expect(wb.getWorksheet('Info')).toBeDefined();
    expect(wb.getWorksheet('Drivers')).toBeDefined();
    expect(wb.getWorksheet('Base Case')).toBeDefined();
    expect(wb.getWorksheet('Capex')).toBeDefined();
    expect(wb.getWorksheet('Per-Pupil')).toBeDefined();
  });

  it('Base Case totals row reflects payload net_result', async () => {
    const buf = await service.renderBoardPackExcel(baseInput);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const baseCase = wb.getWorksheet('Base Case')!;
    // Column 6 is "Amount" — `name` keys are stripped on workbook reload.
    const lastRow = baseCase.getRow(baseCase.rowCount);
    expect(lastRow.getCell(6).value).toBe(SAMPLE_PAYLOAD.base_case.totals_by_year[0]!.net_result);
  });

  it('Capex sheet contains an item row for each capex entry', async () => {
    const buf = await service.renderBoardPackExcel(baseInput);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const capex = wb.getWorksheet('Capex')!;
    // Header + 1 capex row.
    expect(capex.rowCount).toBe(2);
    // Column 1 is "Item" — `name` keys are stripped on workbook reload.
    expect(capex.getRow(2).getCell(1).value).toBe('Boiler');
  });

  it('creates a tab per scenario when payload has scenarios', async () => {
    const payloadWithScenario: SnapshotPayload = {
      ...SAMPLE_PAYLOAD,
      scenarios: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          name: 'Best Case',
          position: 0,
          driver_overrides: { custom: {} },
          merged_drivers: SAMPLE_PAYLOAD.model.drivers,
          notes: null,
          computed: {
            line_items: [
              {
                category: 'income',
                subcategory: 'tuition_net',
                name: 'Tuition (best)',
                fiscal_year: 1,
                amount: 1_300_000,
              },
            ],
            totals_by_year: [
              {
                fiscal_year: 1,
                revenue: 1_300_000,
                expenditure: 720_000,
                net_result: 580_000,
              },
            ],
            per_pupil_unit_economics: [],
          },
        },
      ],
    };

    const buf = await service.renderBoardPackExcel({
      ...baseInput,
      payload: payloadWithScenario,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    expect(wb.getWorksheet('Best Case')).toBeDefined();
  });
});
