import type { SnapshotPayload } from '@school/shared/budgeting';

import {
  buildBoardPackHtml,
  escapeHtml,
  fmt,
  type BoardPackTemplateInput,
} from './board-pack-template';

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
      capex_items: [],
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
    ],
    totals_by_year: [
      { fiscal_year: 1, revenue: 1_200_000, expenditure: 720_000, net_result: 480_000 },
    ],
    per_pupil_unit_economics: [],
  },
  source_snapshot: {
    captured_at: '2026-04-01T00:00:00.000Z',
    tenant_id: '99999999-9999-4999-8999-999999999999',
    fiscal_year_start: '2026-09-01',
    fiscal_year_end: '2027-08-31',
    currency_code: 'EUR',
    total_active_students: 200,
    total_active_households: 150,
    students_by_year_group: [],
    fees_by_year_group: [],
    staff_by_department: [],
  },
  executive_summary: 'Strong year on track for surplus.',
  published_at: '2026-04-25T10:00:00.000Z',
  published_by: { user_id: '88888888-8888-4888-8888-888888888888', name: 'Test User' },
};

const baseInput: BoardPackTemplateInput = {
  tenant_name: 'Test School',
  currency_code: 'EUR',
  model_name: 'FY 2026',
  version_number: 1,
  published_at: '2026-04-25T10:00:00Z',
  published_by_name: 'Test User',
  fiscal_year_label: 'FY2026',
  executive_summary: 'Strong year.',
  payload: SAMPLE_PAYLOAD,
};

describe('escapeHtml', () => {
  it.each([
    ['<script>', '&lt;script&gt;'],
    ['"hello"', '&quot;hello&quot;'],
    ['A & B', 'A &amp; B'],
    ["O'Brien", 'O&#39;Brien'],
  ])('escapes %s → %s', (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });
});

describe('fmt', () => {
  it('formats integers with two decimals and locale separators', () => {
    expect(fmt(1_200_000, 'EUR')).toBe('EUR 1,200,000.00');
  });
  it('rounds to two decimals', () => {
    expect(fmt(1234.567, 'USD')).toBe('USD 1,234.57');
  });
});

describe('buildBoardPackHtml', () => {
  it('produces a non-empty document containing tenant + model + executive summary', () => {
    const html = buildBoardPackHtml(baseInput);
    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain('Test School');
    expect(html).toContain('FY 2026');
    expect(html).toContain('Strong year.');
  });

  it('renders KPI grid totals from base_case totals_by_year[0]', () => {
    const html = buildBoardPackHtml(baseInput);
    expect(html).toContain('1,200,000.00');
    expect(html).toContain('480,000.00');
  });

  it('shows the empty-scenarios fallback message when no scenarios exist', () => {
    const html = buildBoardPackHtml(baseInput);
    expect(html).toContain('No alternative scenarios');
  });

  it('shows the empty-capex fallback message when capex_items is empty', () => {
    const html = buildBoardPackHtml(baseInput);
    expect(html).toContain('No capex items');
  });

  it('escapes html entities in tenant_name', () => {
    const html = buildBoardPackHtml({
      ...baseInput,
      tenant_name: 'Test <script> School',
    });
    expect(html).not.toContain('Test <script> School');
    expect(html).toContain('Test &lt;script&gt; School');
  });

  it('renders an optional variance summary section when provided', () => {
    const html = buildBoardPackHtml({
      ...baseInput,
      variance_summary: {
        period_label: 'Sep 2026',
        rows: [
          {
            line_item_key: 'income.tuition_net',
            planned: 100_000,
            actual: 95_000,
            variance: -5_000,
            variance_pct: -5,
          },
        ],
      },
    });
    expect(html).toContain('Variance vs plan');
    expect(html).toContain('Sep 2026');
  });
});
