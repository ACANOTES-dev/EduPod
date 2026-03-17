import type { PdfBranding } from '../pdf-rendering.service';

interface ReportCardData {
  student: {
    full_name: string;
    student_number: string | null;
    year_group: string;
    class_homeroom: string | null;
  };
  period: {
    name: string;
    academic_year: string;
    start_date: string;
    end_date: string;
  };
  subjects: Array<{
    subject_name: string;
    subject_code: string | null;
    computed_value: number;
    display_value: string;
    overridden_value: string | null;
    assessments: Array<{
      title: string;
      category: string;
      max_score: number;
      raw_score: number | null;
      is_missing: boolean;
    }>;
  }>;
  attendance_summary?: {
    total_days: number;
    present_days: number;
    absent_days: number;
    late_days: number;
  };
  teacher_comment: string | null;
  principal_comment: string | null;
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderReportCardAr(data: unknown, branding: PdfBranding): string {
  const rc = data as ReportCardData;
  const primaryColor = branding.primary_color || '#1e40af';

  const subjectsRows = rc.subjects
    .map(
      (s) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">
          ${escapeHtml(s.subject_name)}
          ${s.subject_code ? `<span style="color: #6b7280; font-weight: 400;"> (${escapeHtml(s.subject_code)})</span>` : ''}
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          ${s.computed_value.toFixed(1)}%
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center; font-weight: 600;">
          ${escapeHtml(s.overridden_value || s.display_value)}
        </td>
      </tr>`,
    )
    .join('');

  const attendanceSection = rc.attendance_summary
    ? `
    <div style="margin-top: 24px;">
      <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 8px; color: ${primaryColor};">ملخص الحضور</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr>
          <td style="padding: 6px 8px; background: #f9fafb;">إجمالي الأيام</td>
          <td style="padding: 6px 8px; text-align: center;" dir="ltr">${rc.attendance_summary.total_days}</td>
          <td style="padding: 6px 8px; background: #f9fafb;">حاضر</td>
          <td style="padding: 6px 8px; text-align: center;" dir="ltr">${rc.attendance_summary.present_days}</td>
          <td style="padding: 6px 8px; background: #f9fafb;">غائب</td>
          <td style="padding: 6px 8px; text-align: center;" dir="ltr">${rc.attendance_summary.absent_days}</td>
          <td style="padding: 6px 8px; background: #f9fafb;">متأخر</td>
          <td style="padding: 6px 8px; text-align: center;" dir="ltr">${rc.attendance_summary.late_days}</td>
        </tr>
      </table>
    </div>`
    : '';

  const commentsSection = `
    ${rc.teacher_comment ? `<div style="margin-top: 16px;"><h3 style="font-size: 14px; font-weight: 600; margin-bottom: 4px; color: ${primaryColor};">ملاحظات المعلم</h3><p style="font-size: 13px; color: #374151; line-height: 1.8;">${escapeHtml(rc.teacher_comment)}</p></div>` : ''}
    ${rc.principal_comment ? `<div style="margin-top: 16px;"><h3 style="font-size: 14px; font-weight: 600; margin-bottom: 4px; color: ${primaryColor};">ملاحظات المدير</h3><p style="font-size: 13px; color: #374151; line-height: 1.8;">${escapeHtml(rc.principal_comment)}</p></div>` : ''}
  `;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Noto Sans Arabic', 'Arial', sans-serif; color: #111827; font-size: 14px; background: white; direction: rtl; }
    @page { size: A4; margin: 0; }
  </style>
</head>
<body>
  <div style="padding: 0;">
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 24px;">
      <div>
        <h1 style="font-size: 22px; font-weight: 700; color: ${primaryColor};">
          ${escapeHtml(branding.report_card_title || 'بطاقة التقرير')}
        </h1>
        <p style="font-size: 16px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name_ar || branding.school_name)}</p>
      </div>
      ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="الشعار" style="height: 60px; max-width: 120px; object-fit: contain;">` : ''}
    </div>

    <!-- Student Info -->
    <table style="width: 100%; font-size: 13px; margin-bottom: 20px;">
      <tr>
        <td style="padding: 4px 0;"><strong>الطالب:</strong> ${escapeHtml(rc.student.full_name)}</td>
        <td style="padding: 4px 0;"><strong>رقم الطالب:</strong> <span dir="ltr">${escapeHtml(rc.student.student_number)}</span></td>
      </tr>
      <tr>
        <td style="padding: 4px 0;"><strong>المرحلة:</strong> ${escapeHtml(rc.student.year_group)}</td>
        <td style="padding: 4px 0;"><strong>الصف:</strong> ${escapeHtml(rc.student.class_homeroom)}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0;"><strong>العام الدراسي:</strong> ${escapeHtml(rc.period.academic_year)}</td>
        <td style="padding: 4px 0;"><strong>الفترة:</strong> ${escapeHtml(rc.period.name)} (<span dir="ltr">${escapeHtml(rc.period.start_date)} – ${escapeHtml(rc.period.end_date)}</span>)</td>
      </tr>
    </table>

    <!-- Grades Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <thead>
        <tr style="background: ${primaryColor}; color: white;">
          <th style="padding: 10px 8px; text-align: right; font-weight: 600;">المادة</th>
          <th style="padding: 10px 8px; text-align: center; font-weight: 600; width: 100px;">الدرجة (%)</th>
          <th style="padding: 10px 8px; text-align: center; font-weight: 600; width: 100px;">التقدير</th>
        </tr>
      </thead>
      <tbody>
        ${subjectsRows}
      </tbody>
    </table>

    ${attendanceSection}
    ${commentsSection}
  </div>
</body>
</html>`;
}
