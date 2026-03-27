import type { PdfBranding } from '../pdf-rendering.service';

interface WellbeingYearGroupBreakdown {
  year_group_name: string;
  student_count: number;
  students_with_support: number;
  coverage_rate: number;
}

interface WellbeingProgrammeReportData {
  period: { from: string; to: string };
  total_students: number;
  students_with_level2_plus: number;
  coverage_rate: number;
  referral_rate: number;
  concern_to_case_conversion_rate: number;
  continuum_distribution: {
    level_1: number;
    level_2: number;
    level_3: number;
  };
  intervention_type_distribution: Record<string, number>;
  by_year_group: WellbeingYearGroupBreakdown[];
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderWellbeingProgrammeAr(data: unknown, branding: PdfBranding): string {
  const d = data as WellbeingProgrammeReportData;
  const primaryColor = branding.primary_color || '#1e40af';

  const totalInterventions =
    d.continuum_distribution.level_1 +
    d.continuum_distribution.level_2 +
    d.continuum_distribution.level_3;

  const interventionTypeRows = Object.entries(d.intervention_type_distribution)
    .map(
      ([type, count]) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(type)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${count}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${totalInterventions > 0 ? ((count / totalInterventions) * 100).toFixed(0) : 0}%</td>
      </tr>`,
    )
    .join('');

  const yearGroupRows = d.by_year_group
    .map(
      (yg) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(yg.year_group_name)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${yg.student_count}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${yg.students_with_support}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${yg.coverage_rate.toFixed(0)}%</td>
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
    .kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
    .kpi-label { font-size: 11px; color: #6b7280; font-weight: 600; margin-bottom: 4px; }
    .kpi-value { font-size: 22px; font-weight: 700; color: ${primaryColor}; }
    .continuum-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .continuum-card { border-radius: 8px; padding: 14px 16px; text-align: center; }
    .progress-bar-bg { background: #e5e7eb; border-radius: 4px; height: 10px; overflow: hidden; margin-top: 6px; }
    .progress-bar-fill { height: 100%; border-radius: 4px; background: ${primaryColor}; }
    .footer { margin-top: 32px; padding-block-start: 12px; border-block-start: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 20px;">
    <div>
      <h1 style="font-size: 20px; font-weight: 700; color: ${primaryColor};">تقرير برنامج الرفاهية</h1>
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
      <div class="kpi-label">إجمالي الطلاب</div>
      <div class="kpi-value">${d.total_students}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">نسبة التغطية (المستوى 2+)</div>
      <div class="kpi-value">${d.coverage_rate.toFixed(0)}%</div>
      <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${d.coverage_rate.toFixed(0)}%;"></div></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">معدل الإحالة</div>
      <div class="kpi-value">${d.referral_rate.toFixed(1)}%</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">معدل تحويل المخاوف إلى حالات</div>
      <div class="kpi-value">${d.concern_to_case_conversion_rate.toFixed(0)}%</div>
    </div>
  </div>

  <!-- Continuum Distribution -->
  <div class="section">
    <div class="section-title">توزيع مستويات الدعم</div>
    <div class="continuum-grid">
      <div class="continuum-card" style="background: #eff6ff; border: 1px solid #bfdbfe;">
        <div style="font-size: 11px; font-weight: 700; color: #1e40af; margin-bottom: 6px;">المستوى 1 — الدعم العام</div>
        <div style="font-size: 26px; font-weight: 700; color: #1e40af;">${d.continuum_distribution.level_1}</div>
        <div style="font-size: 11px; color: #3b82f6; margin-top: 4px;">${totalInterventions > 0 ? ((d.continuum_distribution.level_1 / totalInterventions) * 100).toFixed(0) : 0}%</div>
      </div>
      <div class="continuum-card" style="background: #fff7ed; border: 1px solid #fed7aa;">
        <div style="font-size: 11px; font-weight: 700; color: #9a3412; margin-bottom: 6px;">المستوى 2 — دعم مستهدف</div>
        <div style="font-size: 26px; font-weight: 700; color: #9a3412;">${d.continuum_distribution.level_2}</div>
        <div style="font-size: 11px; color: #f97316; margin-top: 4px;">${totalInterventions > 0 ? ((d.continuum_distribution.level_2 / totalInterventions) * 100).toFixed(0) : 0}%</div>
      </div>
      <div class="continuum-card" style="background: #fef2f2; border: 1px solid #fecaca;">
        <div style="font-size: 11px; font-weight: 700; color: #991b1b; margin-bottom: 6px;">المستوى 3 — دعم مكثف</div>
        <div style="font-size: 26px; font-weight: 700; color: #991b1b;">${d.continuum_distribution.level_3}</div>
        <div style="font-size: 11px; color: #ef4444; margin-top: 4px;">${totalInterventions > 0 ? ((d.continuum_distribution.level_3 / totalInterventions) * 100).toFixed(0) : 0}%</div>
      </div>
    </div>
  </div>

  <!-- Intervention Types -->
  ${Object.keys(d.intervention_type_distribution).length > 0 ? `
  <div class="section">
    <div class="section-title">أنواع التدخلات</div>
    <table>
      <thead>
        <tr>
          <th>نوع التدخل</th>
          <th style="text-align: end;">العدد</th>
          <th style="text-align: end;">النسبة</th>
        </tr>
      </thead>
      <tbody>${interventionTypeRows}</tbody>
    </table>
  </div>` : ''}

  <!-- By Year Group -->
  ${d.by_year_group.length > 0 ? `
  <div class="section">
    <div class="section-title">التغطية حسب المجموعة السنوية</div>
    <table>
      <thead>
        <tr>
          <th>المجموعة السنوية</th>
          <th style="text-align: end;">عدد الطلاب</th>
          <th style="text-align: end;">يتلقون دعماً</th>
          <th style="text-align: end;">نسبة التغطية</th>
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
