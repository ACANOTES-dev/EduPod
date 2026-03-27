import type { PdfBranding } from '../pdf-rendering.service';

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
    weekly_trend: Array<{ week: string; count: number }>;
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

export function renderSstActivityAr(data: unknown, branding: PdfBranding): string {
  const d = data as SstActivityReportData;
  const primaryColor = branding.primary_color || '#1e40af';

  const categoryRows = Object.entries(d.concern_volume.by_category)
    .map(
      ([cat, count]) => `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(cat)}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${count}</td>
      </tr>`,
    )
    .join('');

  const severityRows = Object.entries(d.concern_volume.by_severity)
    .map(
      ([sev, count]) => `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(sev)}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${count}</td>
      </tr>`,
    )
    .join('');

  const yearGroupRows = d.by_year_group
    .map(
      (yg) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(yg.year_group_name)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${yg.student_count}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${yg.concern_count}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${yg.concerns_per_student.toFixed(2)}</td>
      </tr>`,
    )
    .join('');

  const totalOutcomes =
    d.intervention_outcomes.achieved +
    d.intervention_outcomes.partially_achieved +
    d.intervention_outcomes.not_achieved +
    d.intervention_outcomes.escalated +
    d.intervention_outcomes.in_progress;

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
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
    .kpi-label { font-size: 11px; color: #6b7280; font-weight: 600; margin-bottom: 4px; }
    .kpi-value { font-size: 22px; font-weight: 700; color: ${primaryColor}; }
    .kpi-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .footer { margin-top: 32px; padding-block-start: 12px; border-block-start: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 20px;">
    <div>
      <h1 style="font-size: 20px; font-weight: 700; color: ${primaryColor};">تقرير نشاط فريق دعم الطلاب</h1>
      <p style="font-size: 14px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name_ar || branding.school_name)}</p>
      <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">
        الفترة: <span dir="ltr">${escapeHtml(d.period.from)}</span> — <span dir="ltr">${escapeHtml(d.period.to)}</span>
      </p>
    </div>
    ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="الشعار" style="height: 56px; max-width: 112px; object-fit: contain;">` : ''}
  </div>

  <!-- KPIs -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">الحالات المفتوحة</div>
      <div class="kpi-value">${d.cases_opened}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">الحالات المغلقة</div>
      <div class="kpi-value">${d.cases_closed}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">متوسط أيام الحل</div>
      <div class="kpi-value">${d.avg_resolution_days !== null ? d.avg_resolution_days.toFixed(1) : '—'}</div>
      ${d.avg_resolution_days !== null ? '<div class="kpi-sub">يوم</div>' : ''}
    </div>
    <div class="kpi-card">
      <div class="kpi-label">معدل إنجاز الإجراءات</div>
      <div class="kpi-value">${d.action_completion_rate.toFixed(0)}%</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">إجمالي المخاوف</div>
      <div class="kpi-value">${d.concern_volume.total}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">الإجراءات المتأخرة</div>
      <div class="kpi-value" style="${d.overdue_actions > 0 ? 'color: #dc2626;' : ''}">${d.overdue_actions}</div>
    </div>
  </div>

  <!-- Concern Volume -->
  <div class="section">
    <div class="section-title">حجم المخاوف</div>
    <div class="two-col">
      <div>
        <p style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 8px;">حسب الفئة</p>
        ${Object.keys(d.concern_volume.by_category).length > 0 ? `
        <table>
          <thead><tr><th>الفئة</th><th style="text-align: end;">العدد</th></tr></thead>
          <tbody>${categoryRows}</tbody>
        </table>` : '<p style="color: #6b7280; font-size: 12px;">لا توجد بيانات.</p>'}
      </div>
      <div>
        <p style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 8px;">حسب الخطورة</p>
        ${Object.keys(d.concern_volume.by_severity).length > 0 ? `
        <table>
          <thead><tr><th>الخطورة</th><th style="text-align: end;">العدد</th></tr></thead>
          <tbody>${severityRows}</tbody>
        </table>` : '<p style="color: #6b7280; font-size: 12px;">لا توجد بيانات.</p>'}
      </div>
    </div>
  </div>

  <!-- Intervention Outcomes -->
  <div class="section">
    <div class="section-title">نتائج التدخلات${totalOutcomes > 0 ? ` (${totalOutcomes})` : ''}</div>
    <table>
      <thead>
        <tr>
          <th>النتيجة</th>
          <th style="text-align: end;">العدد</th>
          <th style="text-align: end;">النسبة</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">تحقق</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${d.intervention_outcomes.achieved}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${totalOutcomes > 0 ? ((d.intervention_outcomes.achieved / totalOutcomes) * 100).toFixed(0) : 0}%</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">تحقق جزئياً</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${d.intervention_outcomes.partially_achieved}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${totalOutcomes > 0 ? ((d.intervention_outcomes.partially_achieved / totalOutcomes) * 100).toFixed(0) : 0}%</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">لم يتحقق</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${d.intervention_outcomes.not_achieved}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${totalOutcomes > 0 ? ((d.intervention_outcomes.not_achieved / totalOutcomes) * 100).toFixed(0) : 0}%</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">تصعيد</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${d.intervention_outcomes.escalated}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${totalOutcomes > 0 ? ((d.intervention_outcomes.escalated / totalOutcomes) * 100).toFixed(0) : 0}%</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-size: 12px;">جارٍ</td>
          <td style="padding: 8px; font-size: 12px; text-align: end;">${d.intervention_outcomes.in_progress}</td>
          <td style="padding: 8px; font-size: 12px; text-align: end;">${totalOutcomes > 0 ? ((d.intervention_outcomes.in_progress / totalOutcomes) * 100).toFixed(0) : 0}%</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- By Year Group -->
  ${d.by_year_group.length > 0 ? `
  <div class="section">
    <div class="section-title">حسب المجموعة السنوية</div>
    <table>
      <thead>
        <tr>
          <th>المجموعة السنوية</th>
          <th style="text-align: end;">عدد الطلاب</th>
          <th style="text-align: end;">عدد المخاوف</th>
          <th style="text-align: end;">المخاوف لكل طالب</th>
        </tr>
      </thead>
      <tbody>${yearGroupRows}</tbody>
    </table>
  </div>` : ''}

  <!-- Footer -->
  <div class="footer">
    <span>تم الإنشاء في: <span dir="ltr">${new Date().toLocaleDateString('en-GB')}</span></span>
    <span>سري — للاستخدام الداخلي فقط</span>
  </div>
</body>
</html>`;
}
