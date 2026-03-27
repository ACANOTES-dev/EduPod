import type { PdfBranding } from '../pdf-rendering.service';

interface ConcernVersion {
  version: number;
  text: string;
  amended_at: string;
  amended_by: string;
  reason: string;
}

interface Concern {
  id: string;
  date: string;
  category: string;
  severity: string;
  tier: number;
  narrative: string;
  versions: ConcernVersion[];
  logged_by: string;
  actions_taken: string | null;
}

interface Case {
  id: string;
  status: string;
  case_owner: string;
  opened_at: string;
  review_date: string | null;
  linked_concern_count: number;
}

interface Intervention {
  id: string;
  type: string;
  continuum_level: number;
  status: string;
  target_outcomes: string;
  outcome: string | null;
  start_date: string;
  end_date: string | null;
}

interface Referral {
  id: string;
  referral_type: string;
  status: string;
  submitted_at: string | null;
  wait_days: number | null;
}

interface StudentPastoralSummaryData {
  student: {
    id: string;
    full_name: string;
    student_number: string;
    year_group: string;
    class_name: string;
  };
  concerns: Concern[];
  cases: Case[];
  interventions: Intervention[];
  referrals: Referral[];
  has_cp_records: boolean;
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SEVERITY_COLORS: Record<string, string> = {
  low: '#16a34a',
  medium: '#d97706',
  high: '#dc2626',
  critical: '#7c3aed',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#2563eb',
  active: '#2563eb',
  closed: '#6b7280',
  resolved: '#16a34a',
  escalated: '#dc2626',
  pending: '#d97706',
};

function severityBadge(severity: string): string {
  const color = SEVERITY_COLORS[severity.toLowerCase()] || '#6b7280';
  return `<span style="display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: ${color}20; color: ${color}; border: 1px solid ${color}40;">${escapeHtml(severity)}</span>`;
}

function statusBadge(status: string): string {
  const color = STATUS_COLORS[status.toLowerCase()] || '#6b7280';
  return `<span style="display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: ${color}20; color: ${color}; border: 1px solid ${color}40;">${escapeHtml(status)}</span>`;
}

export function renderPastoralSummaryEn(data: unknown, branding: PdfBranding): string {
  const d = data as StudentPastoralSummaryData;
  const primaryColor = branding.primary_color || '#1e40af';
  const generatedDate = new Date().toLocaleDateString('en-IE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const concernRows = d.concerns
    .map(
      (c) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; white-space: nowrap;">${escapeHtml(c.date)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(c.category)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${severityBadge(c.severity)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: center;">${c.tier}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(c.narrative)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(c.actions_taken) || '<span style="color: #9ca3af;">—</span>'}</td>
    </tr>`,
    )
    .join('');

  const caseRows = d.cases
    .map(
      (c) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${statusBadge(c.status)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(c.case_owner)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; white-space: nowrap;">${escapeHtml(c.opened_at)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; white-space: nowrap;">${escapeHtml(c.review_date) || '<span style="color: #9ca3af;">—</span>'}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: center;">${c.linked_concern_count}</td>
    </tr>`,
    )
    .join('');

  const interventionRows = d.interventions
    .map(
      (i) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(i.type)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: center;">${i.continuum_level}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${statusBadge(i.status)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(i.target_outcomes)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(i.outcome) || '<span style="color: #9ca3af;">—</span>'}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; white-space: nowrap;">${escapeHtml(i.start_date)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; white-space: nowrap;">${escapeHtml(i.end_date) || '<span style="color: #9ca3af;">Ongoing</span>'}</td>
    </tr>`,
    )
    .join('');

  const referralRows = d.referrals
    .map(
      (r) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(r.referral_type)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${statusBadge(r.status)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; white-space: nowrap;">${escapeHtml(r.submitted_at) || '<span style="color: #9ca3af;">—</span>'}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: center;">${r.wait_days !== null ? `${r.wait_days} days` : '<span style="color: #9ca3af;">—</span>'}</td>
    </tr>`,
    )
    .join('');

  const sectionHeading = (title: string): string =>
    `<h2 style="font-size: 14px; font-weight: 700; color: ${primaryColor}; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid ${primaryColor}20;">${title}</h2>`;

  const thStyle = `padding: 8px; text-align: left; font-size: 11px; font-weight: 700; color: #374151; background: #f9fafb; border-bottom: 2px solid #e5e7eb; white-space: nowrap;`;

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
      <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 4px;">Student Pastoral Summary</h1>
      <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">Generated: ${generatedDate}</p>
    </div>
    ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="Logo" style="height: 56px; max-width: 120px; object-fit: contain;">` : ''}
  </div>

  ${d.has_cp_records ? `<div style="background: #fef2f2; border: 2px solid #fca5a5; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
    <span style="font-size: 18px;">&#9888;</span>
    <span style="font-size: 13px; font-weight: 600; color: #b91c1c;">Child Protection records exist &mdash; see CP-specific reports for full details.</span>
  </div>` : ''}

  <!-- Student Info Box -->
  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px 20px; margin-bottom: 8px;">
    <div style="display: flex; gap: 40px; flex-wrap: wrap;">
      <div>
        <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">Student Name</p>
        <p style="font-size: 16px; font-weight: 700; color: #111827;">${escapeHtml(d.student.full_name)}</p>
      </div>
      <div>
        <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">Student Number</p>
        <p style="font-size: 14px; font-weight: 500; color: #111827;">${escapeHtml(d.student.student_number)}</p>
      </div>
      <div>
        <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">Year Group</p>
        <p style="font-size: 14px; font-weight: 500; color: #111827;">${escapeHtml(d.student.year_group)}</p>
      </div>
      <div>
        <p style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">Class</p>
        <p style="font-size: 14px; font-weight: 500; color: #111827;">${escapeHtml(d.student.class_name)}</p>
      </div>
    </div>
  </div>

  <!-- Concerns Section -->
  ${sectionHeading(`Concerns (${d.concerns.length})`)}
  ${d.concerns.length > 0 ? `<table>
    <thead>
      <tr>
        <th style="${thStyle}">Date</th>
        <th style="${thStyle}">Category</th>
        <th style="${thStyle}">Severity</th>
        <th style="${thStyle}; text-align: center;">Tier</th>
        <th style="${thStyle}">Narrative</th>
        <th style="${thStyle}">Actions Taken</th>
      </tr>
    </thead>
    <tbody>
      ${concernRows}
    </tbody>
  </table>` : `<p style="font-size: 13px; color: #6b7280; font-style: italic;">No concerns recorded.</p>`}

  <!-- Cases Section -->
  ${sectionHeading(`Cases (${d.cases.length})`)}
  ${d.cases.length > 0 ? `<table>
    <thead>
      <tr>
        <th style="${thStyle}">Status</th>
        <th style="${thStyle}">Case Owner</th>
        <th style="${thStyle}">Opened</th>
        <th style="${thStyle}">Review Date</th>
        <th style="${thStyle}; text-align: center;">Linked Concerns</th>
      </tr>
    </thead>
    <tbody>
      ${caseRows}
    </tbody>
  </table>` : `<p style="font-size: 13px; color: #6b7280; font-style: italic;">No cases recorded.</p>`}

  <!-- Interventions Section -->
  ${sectionHeading(`Interventions (${d.interventions.length})`)}
  ${d.interventions.length > 0 ? `<table>
    <thead>
      <tr>
        <th style="${thStyle}">Type</th>
        <th style="${thStyle}; text-align: center;">Level</th>
        <th style="${thStyle}">Status</th>
        <th style="${thStyle}">Target Outcomes</th>
        <th style="${thStyle}">Outcome</th>
        <th style="${thStyle}">Start</th>
        <th style="${thStyle}">End</th>
      </tr>
    </thead>
    <tbody>
      ${interventionRows}
    </tbody>
  </table>` : `<p style="font-size: 13px; color: #6b7280; font-style: italic;">No interventions recorded.</p>`}

  <!-- Referrals Section -->
  ${d.referrals.length > 0 ? `
  ${sectionHeading(`Referrals (${d.referrals.length})`)}
  <table>
    <thead>
      <tr>
        <th style="${thStyle}">Referral Type</th>
        <th style="${thStyle}">Status</th>
        <th style="${thStyle}">Submitted</th>
        <th style="${thStyle}; text-align: center;">Wait Days</th>
      </tr>
    </thead>
    <tbody>
      ${referralRows}
    </tbody>
  </table>` : ''}

  <!-- Footer -->
  <div style="margin-top: 40px; padding-top: 14px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
    <p style="font-size: 11px; color: #9ca3af;">Generated on ${generatedDate} &mdash; Confidential</p>
    <p style="font-size: 11px; color: #9ca3af;">${escapeHtml(branding.school_name)}</p>
  </div>

</body>
</html>`;
}
