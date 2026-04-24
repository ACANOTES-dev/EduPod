import type { KpiDashboardResponse } from '@school/shared/reports';

import {
  buildDashboardPrompt,
  buildReportPrompt,
  buildSavedReportPrompt,
  DASHBOARD_NARRATION_PROMPT_VERSION,
  REPORT_NARRATION_PROMPT_VERSION,
  SAVED_REPORT_NARRATION_PROMPT_VERSION,
} from './index';

function dashboard(): KpiDashboardResponse {
  return {
    data: {
      generated_at: '2026-04-24T20:00:00.000Z',
      kpis: [
        {
          key: 'attendance_today',
          label_key: 'reports.kpi.attendance_today.label',
          tooltip_key: 'reports.kpi.attendance_today.tooltip',
          value: '94.2%',
          value_raw: 0.942,
          delta: { value: 1.5, unit: 'percent', direction: 'up', better_when: 'up' },
          sparkline: [],
          drill_down_href: '/reports/attendance',
          severity: 'normal',
        },
        {
          key: 'overdue_invoices',
          label_key: 'reports.kpi.overdue_invoices.label',
          tooltip_key: 'reports.kpi.overdue_invoices.tooltip',
          value: 7,
          value_raw: 7,
          delta: { value: 2, unit: 'absolute', direction: 'up', better_when: 'down' },
          sparkline: [],
          drill_down_href: '/finance/invoices?status=overdue',
          severity: 'warning',
        },
      ],
      trends: { weeks: [], attendance: [], grades: [], collection: [] },
    },
    meta: { cache_hit: false },
  };
}

describe('buildDashboardPrompt', () => {
  it('embeds every KPI with its value and delta direction', () => {
    const prompt = buildDashboardPrompt(dashboard());
    expect(prompt).toContain('attendance_today: 94.2% ↑');
    expect(prompt).toContain('overdue_invoices: 7 ↑');
    expect(prompt).toContain('exactly 3 sentences');
  });

  it('embeds the dashboard generated_at timestamp so the prompt evolves with the data', () => {
    const prompt = buildDashboardPrompt(dashboard());
    expect(prompt).toContain('2026-04-24T20:00:00.000Z');
  });

  it('exposes a monotonic prompt version', () => {
    expect(typeof DASHBOARD_NARRATION_PROMPT_VERSION).toBe('number');
    expect(DASHBOARD_NARRATION_PROMPT_VERSION).toBeGreaterThan(0);
  });
});

describe('buildReportPrompt', () => {
  it('uses a friendly label for known report keys', () => {
    const prompt = buildReportPrompt('attendance', { rate: 0.94 });
    expect(prompt).toContain('Attendance Analytics');
  });

  it('falls back to "Report (<key>)" for unknown keys', () => {
    const prompt = buildReportPrompt('unknown-report-key', {});
    expect(prompt).toContain('Report (unknown-report-key)');
  });

  it('includes a stable JSON serialisation of the data', () => {
    const prompt = buildReportPrompt('grades', { avg_score: 72 });
    expect(prompt).toContain('"avg_score": 72');
  });

  it('exposes a monotonic prompt version', () => {
    expect(REPORT_NARRATION_PROMPT_VERSION).toBeGreaterThan(0);
  });
});

describe('buildSavedReportPrompt', () => {
  it('renders columns, row count, and sample rows', () => {
    const prompt = buildSavedReportPrompt({
      reportName: 'Year 10 outstanding fees',
      subjectLabel: 'student',
      columns: [
        {
          id: 'student.identity.last_name',
          label_key: 'reports.fields.student.identity.last_name',
          type: 'string',
        },
        {
          id: 'student.finance_summary.outstanding_balance',
          label_key: 'reports.fields.student.finance_summary.outstanding_balance',
          type: 'currency',
        },
      ],
      rowCount: 42,
      sampleRows: [
        { 'student.identity.last_name': 'Doe', 'student.finance_summary.outstanding_balance': 250 },
      ],
    });

    expect(prompt).toContain('Year 10 outstanding fees');
    expect(prompt).toContain('Total matching records: 42');
    expect(prompt).toContain('student.identity.last_name');
    expect(prompt).toContain('student.finance_summary.outstanding_balance');
    expect(prompt).toContain('"Doe"');
  });

  it('exposes a monotonic prompt version', () => {
    expect(SAVED_REPORT_NARRATION_PROMPT_VERSION).toBeGreaterThan(0);
  });
});
