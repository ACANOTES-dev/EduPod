import type { PdfBranding } from '../pdf-rendering.service';

interface WeeklyTrend {
  week: string;
  count: number;
}

interface SstActivityReportData {
  period: { from: string; to: string };
  cases_opened: number;
  cases_closed: number;
  cases_by_severity: Record<string, number>;
  avg_resolution_days: number | null;
  concern_volume: {
    total: number;
    by_category: Record<string, number>;
    by_severity: Record<string, number>;
    weekly_trend: WeeklyTrend[];
  };
  intervention_outcomes: {
    achieved: number;
    partially_achieved: number;
    not_achieved: number;
    escalated: number;
    in_progress: number;
  };
  action_completion_rate: number;
  overdue_actions: number;
  by_year_group: Array<{
    year_group_name: string;
    student_count: number;
    concern_count: number;
    concerns_per_student: number;
  }>;
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function recordToRows(rec: Record<string, number>): string {
  return Object.entries(rec)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([key, val]) => `
    <tr>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(key)}</td>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; font-weight: 600;">${val}</td>
    </tr>`,
    )
    .join('');
}

export function renderSstActivityEn(data: unknown, branding: PdfBranding): string {
  const d = data as SstActivityReportData;
  const primaryColor = branding.primary_color || '#1e40af';

  const thStyle = `padding: 8px; text-align: left; font-size: 11px; font-weight: 700; color: #374151; background: #f9fafb; border-bottom: 2px solid #e5e7eb;`;
  const thRight = `${thStyle} text-align: right;`;

  const sectionHeading = (title: string): string =>
    `<h2 style="font-size: 14px; font-weight: 700; color: ${primaryColor}; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid ${primaryColor}20;">${title}</h2>`;

  const metricCard = (label: string, value: string, accent?: string): string => {
    const bg = accent || primaryColor;
    return `<div style="flex: 1; min-width: 130px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: 3px solid ${bg}; border-radius: 6px; padding: 14px 16px;">
      <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 6px;">${label}</p>
      <p style="font-size: 22px; font-weight: 700; color: #111827;">${value}</p>
    </div>`;
  };

  const overdueAccent = d.overdue_actions > 0 ? '#dc2626' : '#16a34a';
  const completionAccent = d.action_completion_rate >= 80 ? '#16a34a' : d.action_completion_rate >= 50 ? '#d97706' : '#dc2626';

  const yearGroupRows = d.by_year_group
    .map(
      (yg) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(yg.year_group_name)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right;">${yg.student_count}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right;">${yg.concern_count}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right;">${yg.concerns_per_student.toFixed(2)}</td>
    </tr>`,
    )
    .join('');

  const weeklyTrendRows = d.concern_volume.weekly_trend
    .map(
      (w) => `
    <tr>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(w.week)}</td>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; font-weight: 600;">${w.count}</td>
    </tr>`,
    )
    .join('');

  const outcomes = d.intervention_outcomes;
  const outcomeTotal =
    outcomes.achieved +
    outcomes.partially_achieved +
    outcomes.not_achieved +
    outcomes.escalated +
    outcomes.in_progress;

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111827; font-size: 14px; background: white; padding: 20mm; }
    @page { size: A4; margin: 0; }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>

  <!-- Header -->
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 24px;">
    <div>
      <p style="font-size: 13px; font-weight: 600; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(branding.school_name)}</p>
      <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 4px;">SST Activity Report</h1>
      <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">Period: ${escapeHtml(d.period.from)} &mdash; ${escapeHtml(d.period.to)}</p>
    </div>
    ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="Logo" style="height: 56px; max-width: 120px; object-fit: contain;">` : ''}
  </div>

  <!-- Summary Cards -->
  <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px;">
    ${metricCard('Cases Opened', String(d.cases_opened))}
    ${metricCard('Cases Closed', String(d.cases_closed))}
    ${metricCard('Avg. Resolution', d.avg_resolution_days !== null ? `${d.avg_resolution_days.toFixed(1)} days` : 'N/A')}
    ${metricCard('Action Completion', `${d.action_completion_rate.toFixed(0)}%`, completionAccent)}
    ${metricCard('Overdue Actions', String(d.overdue_actions), overdueAccent)}
  </div>

  <!-- Cases by Severity -->
  ${sectionHeading('Cases by Severity')}
  <table style="max-width: 300px;">
    <thead>
      <tr>
        <th style="${thStyle}">Severity</th>
        <th style="${thRight}">Cases</th>
      </tr>
    </thead>
    <tbody>
      ${recordToRows(d.cases_by_severity)}
    </tbody>
  </table>

  <!-- Concern Volume -->
  ${sectionHeading(`Concern Volume (Total: ${d.concern_volume.total})`)}
  <div style="display: flex; gap: 24px; flex-wrap: wrap;">
    <div style="flex: 1; min-width: 200px;">
      <h3 style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 8px; text-transform: uppercase;">By Category</h3>
      <table>
        <thead>
          <tr>
            <th style="${thStyle}">Category</th>
            <th style="${thRight}">Count</th>
          </tr>
        </thead>
        <tbody>
          ${recordToRows(d.concern_volume.by_category)}
        </tbody>
      </table>
    </div>
    <div style="flex: 1; min-width: 200px;">
      <h3 style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 8px; text-transform: uppercase;">By Severity</h3>
      <table>
        <thead>
          <tr>
            <th style="${thStyle}">Severity</th>
            <th style="${thRight}">Count</th>
          </tr>
        </thead>
        <tbody>
          ${recordToRows(d.concern_volume.by_severity)}
        </tbody>
      </table>
    </div>
    ${d.concern_volume.weekly_trend.length > 0 ? `<div style="flex: 1; min-width: 200px;">
      <h3 style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 8px; text-transform: uppercase;">Weekly Trend</h3>
      <table>
        <thead>
          <tr>
            <th style="${thStyle}">Week</th>
            <th style="${thRight}">Concerns</th>
          </tr>
        </thead>
        <tbody>
          ${weeklyTrendRows}
        </tbody>
      </table>
    </div>` : ''}
  </div>

  <!-- Intervention Outcomes -->
  ${sectionHeading(`Intervention Outcomes (Total: ${outcomeTotal})`)}
  <table style="max-width: 400px;">
    <thead>
      <tr>
        <th style="${thStyle}">Outcome</th>
        <th style="${thRight}">Count</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Achieved</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; font-weight: 600; color: #16a34a;">${outcomes.achieved}</td>
      </tr>
      <tr>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Partially Achieved</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; font-weight: 600; color: #d97706;">${outcomes.partially_achieved}</td>
      </tr>
      <tr>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Not Achieved</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; font-weight: 600; color: #dc2626;">${outcomes.not_achieved}</td>
      </tr>
      <tr>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">Escalated</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; font-weight: 600; color: #7c3aed;">${outcomes.escalated}</td>
      </tr>
      <tr>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">In Progress</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; font-weight: 600; color: #2563eb;">${outcomes.in_progress}</td>
      </tr>
    </tbody>
  </table>

  <!-- Year Group Breakdown -->
  ${sectionHeading('Year Group Breakdown')}
  <table>
    <thead>
      <tr>
        <th style="${thStyle}">Year Group</th>
        <th style="${thRight}">Students</th>
        <th style="${thRight}">Concerns</th>
        <th style="${thRight}">Concerns / Student</th>
      </tr>
    </thead>
    <tbody>
      ${yearGroupRows}
    </tbody>
  </table>

  <!-- Footer -->
  <div style="margin-top: 40px; padding-top: 14px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
    <p style="font-size: 11px; color: #9ca3af;">Period: ${escapeHtml(d.period.from)} &mdash; ${escapeHtml(d.period.to)} &mdash; Confidential</p>
    <p style="font-size: 11px; color: #9ca3af;">${escapeHtml(branding.school_name)}</p>
  </div>

</body>
</html>`;
}
