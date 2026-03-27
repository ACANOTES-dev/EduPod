import type { PdfBranding } from '../pdf-rendering.service';

interface WellbeingProgrammeReportData {
  period: { from: string; to: string };
  intervention_coverage_percent: number;
  continuum_distribution: { level_1: number; level_2: number; level_3: number };
  referral_rate: number;
  concern_to_case_conversion_rate: number;
  intervention_type_distribution: Record<string, number>;
  by_year_group: Array<{
    year_group_name: string;
    intervention_count: number;
    student_count: number;
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

export function renderWellbeingProgrammeEn(data: unknown, branding: PdfBranding): string {
  const d = data as WellbeingProgrammeReportData;
  const primaryColor = branding.primary_color || '#1e40af';

  const thStyle = `padding: 8px; text-align: left; font-size: 11px; font-weight: 700; color: #374151; background: #f9fafb; border-bottom: 2px solid #e5e7eb;`;
  const thRight = `${thStyle} text-align: right;`;

  const sectionHeading = (title: string): string =>
    `<h2 style="font-size: 14px; font-weight: 700; color: ${primaryColor}; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid ${primaryColor}20;">${title}</h2>`;

  const metricCard = (label: string, value: string, sub?: string, accent?: string): string => {
    const bg = accent || primaryColor;
    return `<div style="flex: 1; min-width: 140px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: 3px solid ${bg}; border-radius: 6px; padding: 14px 16px;">
      <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 6px;">${label}</p>
      <p style="font-size: 24px; font-weight: 700; color: #111827;">${value}</p>
      ${sub ? `<p style="font-size: 11px; color: #9ca3af; margin-top: 2px;">${sub}</p>` : ''}
    </div>`;
  };

  const continuumLevel = (
    level: string,
    count: number,
    color: string,
    description: string,
  ): string =>
    `<div style="flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; text-align: center;">
      <div style="display: inline-block; width: 40px; height: 40px; border-radius: 50%; background: ${color}20; border: 2px solid ${color}; line-height: 36px; font-weight: 700; font-size: 18px; color: ${color}; margin-bottom: 8px;">${level}</div>
      <p style="font-size: 22px; font-weight: 700; color: #111827;">${count}</p>
      <p style="font-size: 11px; color: #6b7280; margin-top: 4px;">${description}</p>
    </div>`;

  const typeRows = Object.entries(d.intervention_type_distribution)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([type, count]) => `
    <tr>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(type)}</td>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; font-weight: 600;">${count}</td>
    </tr>`,
    )
    .join('');

  const yearGroupRows = d.by_year_group
    .map(
      (yg) => {
        const rate =
          yg.student_count > 0
            ? ((yg.intervention_count / yg.student_count) * 100).toFixed(1)
            : '0.0';
        return `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(yg.year_group_name)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right;">${yg.student_count}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right;">${yg.intervention_count}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right;">${rate}%</td>
    </tr>`;
      },
    )
    .join('');

  const coverageAccent =
    d.intervention_coverage_percent >= 80
      ? '#16a34a'
      : d.intervention_coverage_percent >= 50
        ? '#d97706'
        : primaryColor;

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
      <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 4px;">Wellbeing Programme Report</h1>
      <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">Period: ${escapeHtml(d.period.from)} &mdash; ${escapeHtml(d.period.to)}</p>
    </div>
    ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="Logo" style="height: 56px; max-width: 120px; object-fit: contain;">` : ''}
  </div>

  <!-- Key Metrics -->
  <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px;">
    ${metricCard('Intervention Coverage', `${d.intervention_coverage_percent.toFixed(1)}%`, 'of student population', coverageAccent)}
    ${metricCard('Referral Rate', `${d.referral_rate.toFixed(1)}%`, 'concerns referred externally')}
    ${metricCard('Concern → Case Rate', `${d.concern_to_case_conversion_rate.toFixed(1)}%`, 'concerns escalated to case')}
  </div>

  <!-- Continuum Distribution -->
  ${sectionHeading('Continuum of Support Distribution')}
  <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px;">
    ${continuumLevel('1', d.continuum_distribution.level_1, '#16a34a', 'Universal / Whole-school')}
    ${continuumLevel('2', d.continuum_distribution.level_2, '#d97706', 'Targeted / Small group')}
    ${continuumLevel('3', d.continuum_distribution.level_3, '#dc2626', 'Intensive / Individual')}
  </div>

  <!-- Intervention Types -->
  ${sectionHeading('Intervention Type Distribution')}
  ${Object.keys(d.intervention_type_distribution).length > 0 ? `<table style="max-width: 400px;">
    <thead>
      <tr>
        <th style="${thStyle}">Intervention Type</th>
        <th style="${thRight}">Count</th>
      </tr>
    </thead>
    <tbody>
      ${typeRows}
    </tbody>
  </table>` : `<p style="font-size: 13px; color: #6b7280; font-style: italic;">No intervention type data available.</p>`}

  <!-- Year Group Breakdown -->
  ${sectionHeading('Year Group Breakdown')}
  <table>
    <thead>
      <tr>
        <th style="${thStyle}">Year Group</th>
        <th style="${thRight}">Students</th>
        <th style="${thRight}">Interventions</th>
        <th style="${thRight}">Coverage Rate</th>
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
