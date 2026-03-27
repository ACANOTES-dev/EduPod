import type { PdfBranding } from '../pdf-rendering.service';

interface SstMember {
  name: string;
  role: string;
}

interface DesInspectionReportData {
  period: { from: string; to: string };
  pastoral_care_policy: {
    policy_title: string | null;
    last_reviewed: string | null;
    next_review_due: string | null;
  };
  sst_composition: SstMember[];
  meeting_frequency: {
    meetings_held: number;
    average_attendance_rate: number | null;
    last_meeting_date: string | null;
  };
  concern_logging_activity: {
    total_concerns: number;
    by_category: Record<string, number>;
    distinct_staff_logged: number;
  };
  intervention_quality: {
    total_interventions: number;
    with_measurable_targets: number;
    with_documented_outcomes: number;
    measurable_targets_rate: number;
    documented_outcomes_rate: number;
  };
  referral_pathways: {
    total_external_referrals: number;
    by_type: Record<string, number>;
    with_outcomes: number;
  };
  continuum_evidence: {
    level_1_count: number;
    level_2_count: number;
    level_3_count: number;
    coverage_rate: number;
  };
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderDesInspectionAr(data: unknown, branding: PdfBranding): string {
  const d = data as DesInspectionReportData;
  const primaryColor = branding.primary_color || '#1e40af';

  const sstRows = d.sst_composition
    .map(
      (m) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(m.name)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(m.role)}</td>
      </tr>`,
    )
    .join('');

  const concernCategoryRows = Object.entries(d.concern_logging_activity.by_category)
    .map(
      ([cat, count]) => `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(cat)}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${count}</td>
      </tr>`,
    )
    .join('');

  const referralTypeRows = Object.entries(d.referral_pathways.by_type)
    .map(
      ([type, count]) => `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(type)}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: end;">${count}</td>
      </tr>`,
    )
    .join('');

  const totalContinuum =
    d.continuum_evidence.level_1_count +
    d.continuum_evidence.level_2_count +
    d.continuum_evidence.level_3_count;

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
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
    .info-label { color: #6b7280; font-weight: 600; }
    .metric-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px; }
    .metric-label { font-size: 12px; color: #374151; font-weight: 600; }
    .metric-value { font-size: 16px; font-weight: 700; color: ${primaryColor}; }
    .progress-bar-bg { background: #e5e7eb; border-radius: 4px; height: 8px; overflow: hidden; flex: 1; margin-inline: 12px; }
    .progress-bar-fill { height: 100%; border-radius: 4px; background: ${primaryColor}; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .footer { margin-top: 32px; padding-block-start: 12px; border-block-start: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 20px;">
    <div>
      <h1 style="font-size: 20px; font-weight: 700; color: ${primaryColor};">تقرير الجاهزية للتفتيش</h1>
      <p style="font-size: 14px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name_ar || branding.school_name)}</p>
      <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">
        الفترة: <span dir="ltr">${escapeHtml(d.period.from)}</span> — <span dir="ltr">${escapeHtml(d.period.to)}</span>
      </p>
    </div>
    ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="الشعار" style="height: 56px; max-width: 112px; object-fit: contain;">` : ''}
  </div>

  <!-- Pastoral Care Policy -->
  <div class="section">
    <div class="section-title">ملخص سياسة الرعاية الرعوية</div>
    <div class="info-row">
      <span class="info-label">عنوان السياسة</span>
      <span>${d.pastoral_care_policy.policy_title ? escapeHtml(d.pastoral_care_policy.policy_title) : '—'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">تاريخ المراجعة الأخيرة</span>
      <span dir="ltr">${d.pastoral_care_policy.last_reviewed ? escapeHtml(d.pastoral_care_policy.last_reviewed) : '—'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">موعد المراجعة القادمة</span>
      <span dir="ltr">${d.pastoral_care_policy.next_review_due ? escapeHtml(d.pastoral_care_policy.next_review_due) : '—'}</span>
    </div>
  </div>

  <!-- SST Composition -->
  <div class="section">
    <div class="section-title">تكوين فريق دعم الطلاب (${d.sst_composition.length} أعضاء)</div>
    ${d.sst_composition.length > 0 ? `
    <table>
      <thead><tr><th>الاسم</th><th>الدور</th></tr></thead>
      <tbody>${sstRows}</tbody>
    </table>` : '<p style="color: #6b7280; font-size: 13px;">لم يتم تكوين الفريق بعد.</p>'}
  </div>

  <!-- Meeting Frequency -->
  <div class="section">
    <div class="section-title">تكرار الاجتماعات</div>
    <div class="info-row">
      <span class="info-label">عدد الاجتماعات المنعقدة</span>
      <span style="font-weight: 700;">${d.meeting_frequency.meetings_held}</span>
    </div>
    <div class="info-row">
      <span class="info-label">متوسط نسبة الحضور</span>
      <span style="font-weight: 700;">${d.meeting_frequency.average_attendance_rate !== null ? d.meeting_frequency.average_attendance_rate.toFixed(0) + '%' : '—'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">تاريخ آخر اجتماع</span>
      <span dir="ltr">${d.meeting_frequency.last_meeting_date ? escapeHtml(d.meeting_frequency.last_meeting_date) : '—'}</span>
    </div>
  </div>

  <!-- Concern Logging Activity -->
  <div class="section">
    <div class="section-title">نشاط تسجيل المخاوف</div>
    <div class="info-row">
      <span class="info-label">إجمالي المخاوف المسجلة</span>
      <span style="font-weight: 700;">${d.concern_logging_activity.total_concerns}</span>
    </div>
    <div class="info-row">
      <span class="info-label">عدد الموظفين المشاركين في التسجيل</span>
      <span style="font-weight: 700;">${d.concern_logging_activity.distinct_staff_logged}</span>
    </div>
    ${Object.keys(d.concern_logging_activity.by_category).length > 0 ? `
    <table style="margin-top: 10px;">
      <thead><tr><th>الفئة</th><th style="text-align: end;">العدد</th></tr></thead>
      <tbody>${concernCategoryRows}</tbody>
    </table>` : ''}
  </div>

  <!-- Intervention Quality -->
  <div class="section">
    <div class="section-title">جودة التدخلات</div>
    <div class="metric-row">
      <span class="metric-label">إجمالي التدخلات</span>
      <span class="metric-value">${d.intervention_quality.total_interventions}</span>
    </div>
    <div style="display: flex; align-items: center; padding: 8px 0;">
      <span style="font-size: 12px; font-weight: 600; color: #374151; min-width: 200px;">بأهداف قابلة للقياس</span>
      <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${d.intervention_quality.measurable_targets_rate.toFixed(0)}%;"></div></div>
      <span style="font-size: 13px; font-weight: 700; color: ${primaryColor}; min-width: 50px; text-align: end;">${d.intervention_quality.measurable_targets_rate.toFixed(0)}%</span>
    </div>
    <div style="display: flex; align-items: center; padding: 8px 0;">
      <span style="font-size: 12px; font-weight: 600; color: #374151; min-width: 200px;">بنتائج موثقة</span>
      <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${d.intervention_quality.documented_outcomes_rate.toFixed(0)}%;"></div></div>
      <span style="font-size: 13px; font-weight: 700; color: ${primaryColor}; min-width: 50px; text-align: end;">${d.intervention_quality.documented_outcomes_rate.toFixed(0)}%</span>
    </div>
  </div>

  <!-- Referral Pathways -->
  <div class="section">
    <div class="section-title">مسارات الإحالة</div>
    <div class="info-row">
      <span class="info-label">إجمالي الإحالات الخارجية</span>
      <span style="font-weight: 700;">${d.referral_pathways.total_external_referrals}</span>
    </div>
    <div class="info-row">
      <span class="info-label">إحالات بنتائج موثقة</span>
      <span style="font-weight: 700;">${d.referral_pathways.with_outcomes}</span>
    </div>
    ${Object.keys(d.referral_pathways.by_type).length > 0 ? `
    <table style="margin-top: 10px;">
      <thead><tr><th>نوع الإحالة</th><th style="text-align: end;">العدد</th></tr></thead>
      <tbody>${referralTypeRows}</tbody>
    </table>` : ''}
  </div>

  <!-- Continuum Evidence -->
  <div class="section">
    <div class="section-title">دليل نظام الدعم المتدرج</div>
    <div class="info-row">
      <span class="info-label">نسبة التغطية الإجمالية</span>
      <span style="font-weight: 700; font-size: 16px; color: ${primaryColor};">${d.continuum_evidence.coverage_rate.toFixed(0)}%</span>
    </div>
    <div class="two-col" style="margin-top: 12px;">
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 11px; font-weight: 700; color: #1e40af;">المستوى 1</div>
        <div style="font-size: 24px; font-weight: 700; color: #1e40af;">${d.continuum_evidence.level_1_count}</div>
        <div style="font-size: 11px; color: #3b82f6;">${totalContinuum > 0 ? ((d.continuum_evidence.level_1_count / totalContinuum) * 100).toFixed(0) : 0}%</div>
      </div>
      <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 11px; font-weight: 700; color: #9a3412;">المستوى 2</div>
        <div style="font-size: 24px; font-weight: 700; color: #9a3412;">${d.continuum_evidence.level_2_count}</div>
        <div style="font-size: 11px; color: #f97316;">${totalContinuum > 0 ? ((d.continuum_evidence.level_2_count / totalContinuum) * 100).toFixed(0) : 0}%</div>
      </div>
    </div>
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; text-align: center; margin-top: 8px;">
      <div style="font-size: 11px; font-weight: 700; color: #991b1b;">المستوى 3</div>
      <div style="font-size: 24px; font-weight: 700; color: #991b1b;">${d.continuum_evidence.level_3_count}</div>
      <div style="font-size: 11px; color: #ef4444;">${totalContinuum > 0 ? ((d.continuum_evidence.level_3_count / totalContinuum) * 100).toFixed(0) : 0}%</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>تم الإنشاء في: <span dir="ltr">${new Date().toLocaleDateString('en-GB')}</span></span>
    <span>مُعد للتقييم المدرسي الشامل — سري</span>
  </div>
</body>
</html>`;
}
