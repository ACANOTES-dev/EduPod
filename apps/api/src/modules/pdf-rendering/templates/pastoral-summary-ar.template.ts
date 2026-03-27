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

export function renderPastoralSummaryAr(data: unknown, branding: PdfBranding): string {
  const d = data as StudentPastoralSummaryData;
  const primaryColor = branding.primary_color || '#1e40af';

  const concernRows = d.concerns
    .map(
      (c) => `
      <tr style="${c.tier === 3 ? 'background: #fff5f5;' : ''}">
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;" dir="ltr">${escapeHtml(c.date)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(c.category)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(c.severity)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: center;">${c.tier}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; max-width: 300px;">${escapeHtml(c.narrative)}</td>
      </tr>`,
    )
    .join('');

  const caseRows = d.cases
    .map(
      (cs) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(cs.status)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(cs.case_owner)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;" dir="ltr">${escapeHtml(cs.opened_at)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;" dir="ltr">${cs.review_date ? escapeHtml(cs.review_date) : '—'}</td>
      </tr>`,
    )
    .join('');

  const interventionRows = d.interventions
    .map(
      (i) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(i.type)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: center;">${i.continuum_level}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(i.status)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${i.outcome ? escapeHtml(i.outcome) : '—'}</td>
      </tr>`,
    )
    .join('');

  const referralRows = d.referrals
    .map(
      (r) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(r.referral_type)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(r.status)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;" dir="ltr">${r.submitted_at ? escapeHtml(r.submitted_at) : '—'}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Noto Sans Arabic', 'Segoe UI', system-ui, sans-serif; color: #111827; font-size: 14px; background: white; direction: rtl; }
    @page { size: A4; margin: 20mm; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 14px; font-weight: 700; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}; padding-bottom: 6px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 8px; text-align: start; font-weight: 600; font-size: 12px; background: #f3f4f6; border-bottom: 2px solid #d1d5db; }
    .cp-banner { background: #fef2f2; border: 2px solid #ef4444; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; color: #991b1b; font-weight: 700; font-size: 13px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; margin-bottom: 20px; }
    .meta-item { display: flex; gap: 8px; }
    .meta-label { color: #6b7280; font-weight: 600; white-space: nowrap; }
    .footer { margin-top: 32px; padding-block-start: 12px; border-block-start: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 20px;">
    <div>
      <h1 style="font-size: 20px; font-weight: 700; color: ${primaryColor};">ملخص الرعاية الرعوية للطالب</h1>
      <p style="font-size: 14px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name_ar || branding.school_name)}</p>
    </div>
    ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="الشعار" style="height: 56px; max-width: 112px; object-fit: contain;">` : ''}
  </div>

  ${d.has_cp_records ? `<div class="cp-banner">⚠ توجد سجلات حماية الطفل — سري للغاية</div>` : ''}

  <!-- Student Info -->
  <div class="meta-grid">
    <div class="meta-item"><span class="meta-label">اسم الطالب:</span><span>${escapeHtml(d.student.full_name)}</span></div>
    <div class="meta-item"><span class="meta-label">رقم الطالب:</span><span dir="ltr">${escapeHtml(d.student.student_number)}</span></div>
    <div class="meta-item"><span class="meta-label">المجموعة السنوية:</span><span>${escapeHtml(d.student.year_group)}</span></div>
    <div class="meta-item"><span class="meta-label">الصف:</span><span>${escapeHtml(d.student.class_name)}</span></div>
  </div>

  <!-- Concerns -->
  <div class="section">
    <div class="section-title">المخاوف (${d.concerns.length})</div>
    ${d.concerns.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>التاريخ</th>
          <th>الفئة</th>
          <th>الخطورة</th>
          <th style="text-align: center;">المستوى</th>
          <th>السرد</th>
        </tr>
      </thead>
      <tbody>${concernRows}</tbody>
    </table>` : '<p style="color: #6b7280; font-size: 13px; padding: 8px 0;">لا توجد مخاوف مسجلة.</p>'}
  </div>

  <!-- Cases -->
  <div class="section">
    <div class="section-title">الحالات (${d.cases.length})</div>
    ${d.cases.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>الحالة</th>
          <th>المسؤول</th>
          <th>تاريخ الفتح</th>
          <th>تاريخ المراجعة</th>
        </tr>
      </thead>
      <tbody>${caseRows}</tbody>
    </table>` : '<p style="color: #6b7280; font-size: 13px; padding: 8px 0;">لا توجد حالات نشطة.</p>'}
  </div>

  <!-- Interventions -->
  <div class="section">
    <div class="section-title">التدخلات (${d.interventions.length})</div>
    ${d.interventions.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>النوع</th>
          <th style="text-align: center;">المستوى</th>
          <th>الحالة</th>
          <th>النتيجة</th>
        </tr>
      </thead>
      <tbody>${interventionRows}</tbody>
    </table>` : '<p style="color: #6b7280; font-size: 13px; padding: 8px 0;">لا توجد تدخلات مسجلة.</p>'}
  </div>

  <!-- Referrals -->
  <div class="section">
    <div class="section-title">الإحالات (${d.referrals.length})</div>
    ${d.referrals.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>النوع</th>
          <th>الحالة</th>
          <th>تاريخ التقديم</th>
        </tr>
      </thead>
      <tbody>${referralRows}</tbody>
    </table>` : '<p style="color: #6b7280; font-size: 13px; padding: 8px 0;">لا توجد إحالات خارجية.</p>'}
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>تم الإنشاء في: <span dir="ltr">${new Date().toLocaleDateString('en-GB')}</span></span>
    <span>سري — للاستخدام الداخلي فقط</span>
  </div>
</body>
</html>`;
}
