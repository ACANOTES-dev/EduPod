import type { PdfBranding } from '../pdf-rendering.service';

interface SafeguardingComplianceReportData {
  period: { from: string; to: string };
  concern_counts: { tier_1: number; tier_2: number; tier_3: number | null };
  mandated_reports: { total: number; by_status: Record<string, number> } | null;
  training_compliance: {
    dlp_name: string;
    dlp_training_date: string | null;
    deputy_dlp_name: string;
    deputy_dlp_training_date: string | null;
    staff_trained_count: number;
    staff_total_count: number;
    staff_compliance_rate: number;
    non_compliant_staff: Array<{ name: string; user_id: string }>;
  };
  child_safeguarding_statement: {
    last_review_date: string | null;
    next_review_due: string | null;
    board_signed_off: boolean;
  };
  active_cp_cases: number | null;
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderSafeguardingComplianceEn(data: unknown, branding: PdfBranding): string {
  const d = data as SafeguardingComplianceReportData;
  const primaryColor = branding.primary_color || '#1e40af';

  const thStyle = `padding: 8px; text-align: left; font-size: 11px; font-weight: 700; color: #374151; background: #f9fafb; border-bottom: 2px solid #e5e7eb;`;
  const thRight = `${thStyle} text-align: right;`;

  const sectionHeading = (title: string): string =>
    `<h2 style="font-size: 14px; font-weight: 700; color: ${primaryColor}; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid ${primaryColor}20;">${title}</h2>`;

  const infoRow = (label: string, value: string): string =>
    `<tr>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; font-weight: 500; width: 220px;">${label}</td>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; font-weight: 500;">${value}</td>
    </tr>`;

  const training = d.training_compliance;
  const css = d.child_safeguarding_statement;

  const complianceRate = training.staff_compliance_rate;
  const complianceColor =
    complianceRate >= 90 ? '#16a34a' : complianceRate >= 70 ? '#d97706' : '#dc2626';

  const mandatedStatusRows =
    d.mandated_reports !== null
      ? Object.entries(d.mandated_reports.by_status)
          .map(
            ([status, count]) => `
    <tr>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(status)}</td>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: right; font-weight: 600;">${count}</td>
    </tr>`,
          )
          .join('')
      : '';

  const nonCompliantRows = training.non_compliant_staff
    .map(
      (s) => `
    <tr>
      <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #b91c1c;">${escapeHtml(s.name)}</td>
    </tr>`,
    )
    .join('');

  const tierBadge = (label: string, count: number, color: string): string =>
    `<div style="flex: 1; min-width: 130px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: 3px solid ${color}; border-radius: 6px; padding: 14px 16px; text-align: center;">
      <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 6px;">${label}</p>
      <p style="font-size: 28px; font-weight: 700; color: #111827;">${count}</p>
    </div>`;

  const boolBadge = (value: boolean): string => {
    const color = value ? '#16a34a' : '#dc2626';
    const text = value ? 'Yes' : 'No';
    return `<span style="display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; background: ${color}20; color: ${color}; border: 1px solid ${color}40;">${text}</span>`;
  };

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
      <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 4px;">Safeguarding Compliance Report</h1>
      <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">Period: ${escapeHtml(d.period.from)} &mdash; ${escapeHtml(d.period.to)}</p>
    </div>
    ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="Logo" style="height: 56px; max-width: 120px; object-fit: contain;">` : ''}
  </div>

  <!-- Concern Counts by Tier -->
  ${sectionHeading('Concern Counts by Tier')}
  <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px;">
    ${tierBadge('Tier 1', d.concern_counts.tier_1, '#16a34a')}
    ${tierBadge('Tier 2', d.concern_counts.tier_2, '#d97706')}
    ${d.concern_counts.tier_3 !== null ? tierBadge('Tier 3', d.concern_counts.tier_3, '#dc2626') : ''}
  </div>

  <!-- Mandated Reports -->
  ${d.mandated_reports !== null ? `
  ${sectionHeading(`Mandated Reports (Total: ${d.mandated_reports.total})`)}
  <table style="max-width: 320px;">
    <thead>
      <tr>
        <th style="${thStyle}">Status</th>
        <th style="${thRight}">Count</th>
      </tr>
    </thead>
    <tbody>
      ${mandatedStatusRows}
    </tbody>
  </table>` : ''}

  <!-- Training Compliance -->
  ${sectionHeading('Training Compliance')}
  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px 20px; margin-bottom: 16px;">
    <div style="display: flex; gap: 32px; flex-wrap: wrap; margin-bottom: 16px;">
      <div>
        <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">Designated Liaison Person</p>
        <p style="font-size: 14px; font-weight: 600;">${escapeHtml(training.dlp_name)}</p>
        <p style="font-size: 12px; color: #6b7280; margin-top: 2px;">Trained: ${escapeHtml(training.dlp_training_date) || '<em>Not recorded</em>'}</p>
      </div>
      <div>
        <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">Deputy DLP</p>
        <p style="font-size: 14px; font-weight: 600;">${escapeHtml(training.deputy_dlp_name)}</p>
        <p style="font-size: 12px; color: #6b7280; margin-top: 2px;">Trained: ${escapeHtml(training.deputy_dlp_training_date) || '<em>Not recorded</em>'}</p>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 20px;">
      <div>
        <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 4px;">Staff Training Rate</p>
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="background: #e5e7eb; border-radius: 4px; height: 12px; width: 180px; overflow: hidden;">
            <div style="background: ${complianceColor}; height: 100%; width: ${Math.min(complianceRate, 100)}%;"></div>
          </div>
          <span style="font-size: 16px; font-weight: 700; color: ${complianceColor};">${complianceRate.toFixed(0)}%</span>
          <span style="font-size: 12px; color: #6b7280;">(${training.staff_trained_count} / ${training.staff_total_count})</span>
        </div>
      </div>
    </div>
  </div>

  ${training.non_compliant_staff.length > 0 ? `
  <div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; padding: 12px 16px;">
    <p style="font-size: 12px; font-weight: 700; color: #b91c1c; margin-bottom: 8px;">Staff Without Completed Training (${training.non_compliant_staff.length})</p>
    <table>
      <thead>
        <tr>
          <th style="padding: 6px 8px; text-align: left; font-size: 11px; font-weight: 700; color: #b91c1c; background: #fee2e2; border-bottom: 1px solid #fca5a5;">Staff Name</th>
        </tr>
      </thead>
      <tbody>
        ${nonCompliantRows}
      </tbody>
    </table>
  </div>` : `<div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 12px 16px;">
    <p style="font-size: 12px; font-weight: 600; color: #16a34a;">All staff have completed safeguarding training.</p>
  </div>`}

  <!-- Child Safeguarding Statement -->
  ${sectionHeading('Child Safeguarding Statement')}
  <table style="max-width: 500px;">
    <tbody>
      ${infoRow('Last Review Date', escapeHtml(css.last_review_date) || '<span style="color: #9ca3af;">Not recorded</span>')}
      ${infoRow('Next Review Due', escapeHtml(css.next_review_due) || '<span style="color: #9ca3af;">Not scheduled</span>')}
      ${infoRow('Board Sign-Off', boolBadge(css.board_signed_off))}
    </tbody>
  </table>

  <!-- Active CP Cases -->
  ${d.active_cp_cases !== null ? `
  ${sectionHeading('Active Child Protection Cases')}
  <div style="background: ${d.active_cp_cases > 0 ? '#fef2f2' : '#f0fdf4'}; border: 1px solid ${d.active_cp_cases > 0 ? '#fca5a5' : '#86efac'}; border-radius: 6px; padding: 16px 20px; display: flex; align-items: center; gap: 16px;">
    <p style="font-size: 32px; font-weight: 700; color: ${d.active_cp_cases > 0 ? '#b91c1c' : '#16a34a'};">${d.active_cp_cases}</p>
    <p style="font-size: 13px; color: ${d.active_cp_cases > 0 ? '#b91c1c' : '#16a34a'}; font-weight: 500;">active child protection ${d.active_cp_cases === 1 ? 'case' : 'cases'} as of report date</p>
  </div>` : ''}

  <!-- Footer -->
  <div style="margin-top: 40px; padding-top: 14px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
    <p style="font-size: 11px; color: #9ca3af;">Board of Management &mdash; Confidential</p>
    <p style="font-size: 11px; color: #9ca3af;">${escapeHtml(branding.school_name)}</p>
  </div>

</body>
</html>`;
}
