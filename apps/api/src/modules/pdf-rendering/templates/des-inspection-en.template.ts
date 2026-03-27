import type { PdfBranding } from '../pdf-rendering.service';

interface DesInspectionReportData {
  period: { from: string; to: string };
  pastoral_care_policy_summary: string;
  sst_composition: Array<{ user_name: string; role: string | null }>;
  meeting_frequency: { total_meetings: number; average_per_month: number };
  concern_logging: { total: number; by_category: Record<string, number> };
  intervention_quality: {
    with_measurable_targets_percent: number;
    with_documented_outcomes_percent: number;
  };
  referral_pathways: { total: number; by_type: Record<string, number> };
  continuum_coverage: { level_1: number; level_2: number; level_3: number };
  staff_engagement: { distinct_staff_logging_concerns: number };
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderDesInspectionEn(data: unknown, branding: PdfBranding): string {
  const d = data as DesInspectionReportData;
  const primaryColor = branding.primary_color || '#1e40af';

  const thStyle = `padding: 8px; text-align: left; font-size: 11px; font-weight: 700; color: #374151; background: #f9fafb; border-bottom: 2px solid #e5e7eb;`;
  const thRight = `${thStyle} text-align: right;`;

  const sectionHeading = (title: string): string =>
    `<h2 style="font-size: 14px; font-weight: 700; color: ${primaryColor}; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid ${primaryColor}20;">${title}</h2>`;

  const metricBox = (label: string, value: string, accent?: string): string => {
    const color = accent || primaryColor;
    return `<div style="flex: 1; min-width: 140px; background: #f9fafb; border: 1px solid #e5e7eb; border-inline-start: 4px solid ${color}; border-radius: 4px; padding: 12px 16px;">
      <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 4px;">${label}</p>
      <p style="font-size: 20px; font-weight: 700; color: #111827;">${value}</p>
    </div>`;
  };

  const qualityAccent = (pct: number): string =>
    pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';

  const sstRows = d.sst_composition
    .map(
      (m) => `
    <tr>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; font-weight: 500;">${escapeHtml(m.user_name)}</td>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${escapeHtml(m.role) || '<span style="color: #9ca3af;">—</span>'}</td>
    </tr>`,
    )
    .join('');

  const concernCategoryRows = Object.entries(d.concern_logging.by_category)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([cat, count]) => `
    <tr>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(cat)}</td>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; font-weight: 600;">${count}</td>
    </tr>`,
    )
    .join('');

  const referralTypeRows = Object.entries(d.referral_pathways.by_type)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([type, count]) => `
    <tr>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(type)}</td>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; font-weight: 600;">${count}</td>
    </tr>`,
    )
    .join('');

  const continuum = d.continuum_coverage;
  const continuumTotal = continuum.level_1 + continuum.level_2 + continuum.level_3;
  const continuumPct = (n: number): string =>
    continuumTotal > 0 ? `${((n / continuumTotal) * 100).toFixed(0)}%` : '0%';

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
      <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 4px;">DES Inspection Readiness Report</h1>
      <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">Period: ${escapeHtml(d.period.from)} &mdash; ${escapeHtml(d.period.to)}</p>
    </div>
    ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="Logo" style="height: 56px; max-width: 120px; object-fit: contain;">` : ''}
  </div>

  <!-- Pastoral Care Policy Summary -->
  ${sectionHeading('Pastoral Care Policy Summary')}
  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px 20px;">
    <p style="font-size: 13px; color: #374151; line-height: 1.6;">${escapeHtml(d.pastoral_care_policy_summary)}</p>
  </div>

  <!-- SST Composition -->
  ${sectionHeading(`SST Composition (${d.sst_composition.length} members)`)}
  <table style="max-width: 480px;">
    <thead>
      <tr>
        <th style="${thStyle}">Name</th>
        <th style="${thStyle}">Role</th>
      </tr>
    </thead>
    <tbody>
      ${sstRows}
    </tbody>
  </table>

  <!-- Meeting Frequency -->
  ${sectionHeading('Meeting Frequency')}
  <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px;">
    ${metricBox('Total Meetings', String(d.meeting_frequency.total_meetings))}
    ${metricBox('Average per Month', d.meeting_frequency.average_per_month.toFixed(1))}
  </div>

  <!-- Concern Logging Activity -->
  ${sectionHeading(`Concern Logging Activity (Total: ${d.concern_logging.total})`)}
  <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 8px;">
    <div style="flex: 1; min-width: 200px;">
      ${metricBox('Total Concerns Logged', String(d.concern_logging.total))}
    </div>
    <div style="flex: 1; min-width: 200px;">
      ${metricBox('Staff Logging Concerns', String(d.staff_engagement.distinct_staff_logging_concerns), primaryColor)}
    </div>
  </div>
  ${Object.keys(d.concern_logging.by_category).length > 0 ? `
  <div style="margin-top: 12px;">
    <h3 style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 8px; text-transform: uppercase;">Breakdown by Category</h3>
    <table style="max-width: 380px;">
      <thead>
        <tr>
          <th style="${thStyle}">Category</th>
          <th style="${thRight}">Count</th>
        </tr>
      </thead>
      <tbody>
        ${concernCategoryRows}
      </tbody>
    </table>
  </div>` : ''}

  <!-- Intervention Quality -->
  ${sectionHeading('Intervention Quality Metrics')}
  <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px;">
    ${metricBox('With Measurable Targets', `${d.intervention_quality.with_measurable_targets_percent.toFixed(0)}%`, qualityAccent(d.intervention_quality.with_measurable_targets_percent))}
    ${metricBox('With Documented Outcomes', `${d.intervention_quality.with_documented_outcomes_percent.toFixed(0)}%`, qualityAccent(d.intervention_quality.with_documented_outcomes_percent))}
  </div>

  <!-- Referral Pathways -->
  ${sectionHeading(`Referral Pathways (Total: ${d.referral_pathways.total})`)}
  ${Object.keys(d.referral_pathways.by_type).length > 0 ? `<table style="max-width: 380px;">
    <thead>
      <tr>
        <th style="${thStyle}">Referral Type</th>
        <th style="${thRight}">Count</th>
      </tr>
    </thead>
    <tbody>
      ${referralTypeRows}
    </tbody>
  </table>` : `<p style="font-size: 13px; color: #6b7280; font-style: italic;">No referrals recorded in this period.</p>`}

  <!-- Continuum Coverage -->
  ${sectionHeading('Continuum of Support Coverage')}
  <table style="max-width: 480px;">
    <thead>
      <tr>
        <th style="${thStyle}">Level</th>
        <th style="${thStyle}">Description</th>
        <th style="${thRight}">Interventions</th>
        <th style="${thRight}">Share</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; font-weight: 700; color: #16a34a;">Level 1</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">Universal / Whole-school</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; font-weight: 600;">${continuum.level_1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; color: #6b7280;">${continuumPct(continuum.level_1)}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; font-weight: 700; color: #d97706;">Level 2</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">Targeted / Small group</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; font-weight: 600;">${continuum.level_2}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; color: #6b7280;">${continuumPct(continuum.level_2)}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; font-weight: 700; color: #dc2626;">Level 3</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">Intensive / Individual</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; font-weight: 600;">${continuum.level_3}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; color: #6b7280;">${continuumPct(continuum.level_3)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Staff Engagement -->
  ${sectionHeading('Staff Engagement')}
  <div style="display: flex; gap: 12px; flex-wrap: wrap;">
    ${metricBox('Staff Logging Concerns', String(d.staff_engagement.distinct_staff_logging_concerns), '#7c3aed')}
  </div>

  <!-- Footer -->
  <div style="margin-top: 40px; padding-top: 14px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
    <p style="font-size: 11px; color: #9ca3af;">Prepared for Whole-School Evaluation &mdash; Confidential</p>
    <p style="font-size: 11px; color: #9ca3af;">${escapeHtml(branding.school_name)}</p>
  </div>

</body>
</html>`;
}
