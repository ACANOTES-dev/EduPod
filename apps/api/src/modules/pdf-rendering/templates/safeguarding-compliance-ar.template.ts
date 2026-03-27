import type { PdfBranding } from '../pdf-rendering.service';

interface SafeguardingComplianceReportData {
  period: { from: string; to: string };
  concern_counts: {
    tier_1: number;
    tier_2: number;
    tier_3: number | null;
  };
  mandated_reports: {
    total: number;
    by_status: Record<string, number>;
  } | null;
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

export function renderSafeguardingComplianceAr(data: unknown, branding: PdfBranding): string {
  const d = data as SafeguardingComplianceReportData;
  const primaryColor = branding.primary_color || '#1e40af';
  const tc = d.training_compliance;
  const css = d.child_safeguarding_statement;

  const mandatedStatusRows = d.mandated_reports
    ? Object.entries(d.mandated_reports.by_status)
        .map(
          ([status, count]) => `
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(status)}</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${count}</td>
          </tr>`,
        )
        .join('')
    : '';

  const nonCompliantRows = tc.non_compliant_staff
    .map(
      (s) => `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(s.name)}</td>
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
    .tier-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 8px; }
    .tier-card { border-radius: 8px; padding: 14px 16px; text-align: center; }
    .tier-label { font-size: 11px; font-weight: 600; margin-bottom: 6px; }
    .tier-count { font-size: 28px; font-weight: 700; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
    .info-label { color: #6b7280; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .progress-bar-bg { background: #e5e7eb; border-radius: 4px; height: 10px; overflow: hidden; margin-top: 6px; }
    .progress-bar-fill { height: 100%; border-radius: 4px; background: ${primaryColor}; }
    .footer { margin-top: 32px; padding-block-start: 12px; border-block-start: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 20px;">
    <div>
      <h1 style="font-size: 20px; font-weight: 700; color: ${primaryColor};">تقرير الامتثال للحماية</h1>
      <p style="font-size: 14px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name_ar || branding.school_name)}</p>
      <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">
        الفترة: <span dir="ltr">${escapeHtml(d.period.from)}</span> — <span dir="ltr">${escapeHtml(d.period.to)}</span>
      </p>
    </div>
    ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="الشعار" style="height: 56px; max-width: 112px; object-fit: contain;">` : ''}
  </div>

  <!-- Concern Counts by Tier -->
  <div class="section">
    <div class="section-title">عدد المخاوف حسب المستوى</div>
    <div class="tier-grid">
      <div class="tier-card" style="background: #eff6ff; border: 1px solid #bfdbfe;">
        <div class="tier-label" style="color: #1e40af;">المستوى 1</div>
        <div class="tier-count" style="color: #1e40af;">${d.concern_counts.tier_1}</div>
      </div>
      <div class="tier-card" style="background: #fff7ed; border: 1px solid #fed7aa;">
        <div class="tier-label" style="color: #9a3412;">المستوى 2</div>
        <div class="tier-count" style="color: #9a3412;">${d.concern_counts.tier_2}</div>
      </div>
      <div class="tier-card" style="background: #fef2f2; border: 1px solid #fecaca;">
        <div class="tier-label" style="color: #991b1b;">المستوى 3</div>
        <div class="tier-count" style="color: #991b1b;">${d.concern_counts.tier_3 !== null ? d.concern_counts.tier_3 : '—'}</div>
        ${d.concern_counts.tier_3 === null ? '<div style="font-size: 10px; color: #9ca3af; margin-top: 2px;">يتطلب صلاحية الوصول</div>' : ''}
      </div>
    </div>
    ${d.active_cp_cases !== null ? `<p style="font-size: 12px; color: #991b1b; margin-top: 8px; font-weight: 600;">حالات حماية الطفل النشطة: ${d.active_cp_cases}</p>` : ''}
  </div>

  <!-- Mandated Reports -->
  <div class="section">
    <div class="section-title">التقارير الإلزامية</div>
    ${d.mandated_reports !== null ? `
    <div class="info-row">
      <span class="info-label">إجمالي التقارير المقدمة</span>
      <span style="font-weight: 700;">${d.mandated_reports.total}</span>
    </div>
    ${Object.keys(d.mandated_reports.by_status).length > 0 ? `
    <table style="margin-top: 10px;">
      <thead><tr><th>الحالة</th><th style="text-align: end;">العدد</th></tr></thead>
      <tbody>${mandatedStatusRows}</tbody>
    </table>` : ''}
    ` : '<p style="color: #6b7280; font-size: 13px;">يتطلب صلاحية الوصول لحماية الطفل لعرض هذه البيانات.</p>'}
  </div>

  <!-- Training Compliance -->
  <div class="section">
    <div class="section-title">الامتثال للتدريب</div>
    <div class="info-row">
      <span class="info-label">المسؤول المعيّن لحماية الطفل (DLP)</span>
      <span style="font-weight: 600;">${escapeHtml(tc.dlp_name)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">تاريخ تدريب DLP — Children First</span>
      <span dir="ltr">${tc.dlp_training_date ? escapeHtml(tc.dlp_training_date) : '<span style="color: #dc2626; font-weight: 600;">غير مدرَّب</span>'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">نائب المسؤول (Deputy DLP)</span>
      <span style="font-weight: 600;">${escapeHtml(tc.deputy_dlp_name)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">تاريخ تدريب النائب</span>
      <span dir="ltr">${tc.deputy_dlp_training_date ? escapeHtml(tc.deputy_dlp_training_date) : '<span style="color: #dc2626; font-weight: 600;">غير مدرَّب</span>'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">امتثال الموظفين</span>
      <span style="font-weight: 700;">${tc.staff_trained_count} / ${tc.staff_total_count} (${tc.staff_compliance_rate.toFixed(0)}%)</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" style="width: ${tc.staff_compliance_rate.toFixed(0)}%;"></div>
    </div>
    ${tc.non_compliant_staff.length > 0 ? `
    <div style="margin-top: 14px;">
      <p style="font-size: 12px; font-weight: 600; color: #dc2626; margin-bottom: 8px;">الموظفون غير الممتثلون (${tc.non_compliant_staff.length})</p>
      <table>
        <thead><tr><th>الاسم</th></tr></thead>
        <tbody>${nonCompliantRows}</tbody>
      </table>
    </div>` : ''}
  </div>

  <!-- Child Safeguarding Statement -->
  <div class="section">
    <div class="section-title">بيان حماية الطفل</div>
    <div class="info-row">
      <span class="info-label">تاريخ المراجعة الأخيرة</span>
      <span dir="ltr">${css.last_review_date ? escapeHtml(css.last_review_date) : '—'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">موعد المراجعة القادمة</span>
      <span dir="ltr">${css.next_review_due ? escapeHtml(css.next_review_due) : '—'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">اعتماد مجلس الإدارة</span>
      <span class="badge ${css.board_signed_off ? 'badge-green' : 'badge-red'}">${css.board_signed_off ? 'معتمد' : 'بانتظار الاعتماد'}</span>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>تم الإنشاء في: <span dir="ltr">${new Date().toLocaleDateString('en-GB')}</span></span>
    <span>مجلس الإدارة — سري</span>
  </div>
</body>
</html>`;
}
