import type {
  Drivers,
  PerPupilEconomics,
  SnapshotPayload,
  YearTotals,
} from '@school/shared/budgeting';

/**
 * Board-pack PDF template — pure-function HTML builder for the Phase 09
 * board-pack render pipeline. No external CSS / JS / network: everything
 * is inlined so Puppeteer can render it offline. The renderer service
 * (`PdfRendererService`) blocks all network requests on the page, so any
 * `<img>` or `<link href>` would fail anyway.
 *
 * Sections per PLAN.md §11.1 — cover, executive summary, drivers, base
 * case totals, scenarios, line items by category, per-pupil economics,
 * variance summary (optional), capex appendix, methodology footer.
 */

export interface BoardPackTemplateInput {
  tenant_name: string;
  currency_code: string;
  model_name: string;
  version_number: number;
  published_at: string;
  published_by_name: string;
  fiscal_year_label: string;
  executive_summary: string | null;
  payload: SnapshotPayload;
  variance_summary?: VarianceSummary | null;
}

export interface VarianceSummary {
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

  const css = boardPackCss();
  const totals = payload.base_case.totals_by_year;
  const baseTotals = totals[0];
  const perPupil = payload.base_case.per_pupil_unit_economics[0];
  const drivers = payload.model.drivers;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model_name)} — Board Pack</title>
  <style>${css}</style>
</head>
<body>
  <section class="cover">
    <h1>${escapeHtml(tenant_name)}</h1>
    <div class="cover-sub">Annual Financial Model — ${escapeHtml(fiscal_year_label)}</div>
    <div class="meta">
      Version ${version_number} · Published ${escapeHtml(published_at)}<br>
      Prepared by ${escapeHtml(published_by_name)}
    </div>
  </section>
  <div class="pagebreak"></div>

  <h2>Executive summary</h2>
  ${baseTotals ? renderKpiGrid(baseTotals, perPupil ?? null, currency_code) : ''}
  ${
    executive_summary
      ? `<div>${escapeHtml(executive_summary)
          .split('\n')
          .map((p) => `<p>${p}</p>`)
          .join('')}</div>`
      : ''
  }

  <h2>Drivers</h2>
  ${renderDriversTable(drivers)}

  <h2>Base case — totals by year</h2>
  ${renderTotalsTable(totals, currency_code)}

  <h2>Scenarios</h2>
  ${renderScenariosTable(payload, currency_code)}

  <h2>Line items by category</h2>
  ${renderLineItemsByCategory(payload, currency_code)}

  <h2>Per-pupil unit economics</h2>
  ${renderPerPupilTable(payload.base_case.per_pupil_unit_economics, currency_code)}

  ${variance_summary ? `<h2>Variance vs plan</h2>${renderVarianceTable(variance_summary, currency_code)}` : ''}

  <h2>Capital expenditure</h2>
  ${renderCapexTable(drivers.capex_items, currency_code)}

  <h2>Methodology &amp; assumptions</h2>
  <p>This model was generated from the school's live student, staff, fee, and class data on ${escapeHtml(published_at)}. The drivers above were applied to a snapshot of the source data; line items in the income, staff costs, operations, and capital sections are derived from these drivers. Custom and locked line items are flagged in the line-item table.</p>

  <div class="footer">
    <span>Confidential — Board of Directors · ${escapeHtml(tenant_name)}</span>
    <span>Generated ${escapeHtml(new Date().toISOString())}</span>
  </div>
</body>
</html>`;
}

// ─── Helpers (pure — exported for spec coverage of edge formatting) ──────────

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function fmt(n: number, code: string): string {
  return `${code} ${n.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function boardPackCss(): string {
  return `
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Figtree', Helvetica, Arial, sans-serif; color: #0f172a; font-size: 10.5pt; line-height: 1.4; }
    h1 { font-size: 28pt; margin: 0 0 12pt; }
    h2 { font-size: 16pt; margin: 24pt 0 8pt; border-bottom: 1px solid #cbd5e1; padding-bottom: 4pt; }
    h3 { font-size: 12pt; margin: 16pt 0 6pt; }
    .cover { padding: 30mm 0 0 0; text-align: center; }
    .cover-sub { font-size: 14pt; }
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
    .footer { position: fixed; bottom: 8mm; inset-inline-start: 16mm; inset-inline-end: 16mm; font-size: 8pt; color: #64748b; display: flex; justify-content: space-between; }
    .pagebreak { page-break-after: always; }
  `;
}

function renderKpiGrid(t: YearTotals, perPupil: PerPupilEconomics | null, code: string): string {
  return `<div class="kpi-grid">
    <div class="kpi"><div class="label">Revenue</div><div class="value">${fmt(t.revenue, code)}</div></div>
    <div class="kpi"><div class="label">Expenditure</div><div class="value">${fmt(t.expenditure, code)}</div></div>
    <div class="kpi"><div class="label">Net result</div><div class="value ${t.net_result < 0 ? 'neg' : 'pos'}">${fmt(t.net_result, code)}</div></div>
    <div class="kpi"><div class="label">Per pupil</div><div class="value">${perPupil ? fmt(perPupil.revenue_per_student, code) : '—'}</div></div>
  </div>`;
}

function renderDriversTable(drivers: Drivers): string {
  const rows: Array<[string, string]> = [
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
    <tbody>${rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</tbody>
  </table>`;
}

function renderTotalsTable(totals: YearTotals[], code: string): string {
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

function renderScenariosTable(payload: SnapshotPayload, code: string): string {
  const rows = payload.scenarios
    .map(
      (s) => `<tr>
    <td>${escapeHtml(s.name)}</td>
    <td class="num">${fmt(s.computed.totals_by_year[0]?.revenue ?? 0, code)}</td>
    <td class="num">${fmt(s.computed.totals_by_year[0]?.expenditure ?? 0, code)}</td>
    <td class="num">${fmt(s.computed.totals_by_year[0]?.net_result ?? 0, code)}</td>
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

function renderLineItemsByCategory(payload: SnapshotPayload, code: string): string {
  const items = payload.base_case.line_items;
  const seen = new Set<string>();
  const orderedCategories: string[] = [];
  for (const li of items) {
    if (!seen.has(li.category)) {
      seen.add(li.category);
      orderedCategories.push(li.category);
    }
  }
  return orderedCategories
    .map((cat) => {
      const catItems = items.filter((li) => li.category === cat && li.fiscal_year === 1);
      if (catItems.length === 0) return '';
      const total = catItems.reduce((acc, li) => acc + li.amount, 0);
      const heading = cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return `<h3>${escapeHtml(heading)}</h3>
    <table>
      <thead><tr><th>Item</th><th>Source</th><th>Amount</th></tr></thead>
      <tbody>${catItems
        .map(
          (li) => `<tr>
        <td>${escapeHtml(li.name)}${li.is_locked ? ' (locked)' : ''}</td>
        <td>${escapeHtml(li.source)}</td>
        <td class="num">${fmt(li.amount, code)}</td>
      </tr>`,
        )
        .join('')}
      <tr class="total"><td>Total</td><td></td><td class="num">${fmt(total, code)}</td></tr></tbody>
    </table>`;
    })
    .join('');
}

function renderPerPupilTable(rows: PerPupilEconomics[], code: string): string {
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
