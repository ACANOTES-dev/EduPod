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
    assessments?: Array<{
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

function getGradeColor(value: number): string {
  if (value >= 90) return '#059669';
  if (value >= 75) return '#2563eb';
  if (value >= 60) return '#d97706';
  return '#dc2626';
}

export function renderReportCardModernAr(data: unknown, branding: PdfBranding): string {
  const rc = data as ReportCardData;
  const primaryColor = branding.primary_color || '#1e40af';

  const subjectsRows = rc.subjects
    .map(
      (s) => {
        const gradeColor = getGradeColor(s.computed_value);
        return `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6;">
          <div style="font-weight: 500; color: #111827;">${escapeHtml(s.subject_name)}</div>
          ${s.subject_code ? `<div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">${escapeHtml(s.subject_code)}</div>` : ''}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; text-align: center;">
          <div style="display: inline-block; background: ${gradeColor}15; color: ${gradeColor}; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 13px;">
            ${s.computed_value.toFixed(1)}%
          </div>
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; text-align: center; font-weight: 700; font-size: 15px; color: ${gradeColor};">
          ${escapeHtml(s.overridden_value || s.display_value)}
        </td>
      </tr>`;
      },
    )
    .join('');

  const attendanceSection = rc.attendance_summary
    ? `
    <div style="margin-top: 28px; background: #f8fafc; border-radius: 12px; padding: 16px 20px;">
      <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 12px; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 0.5px;">ملخص الحضور</h3>
      <div style="display: flex; gap: 24px;">
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: #111827;" dir="ltr">${rc.attendance_summary.total_days}</div>
          <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">إجمالي الأيام</div>
        </div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: #059669;" dir="ltr">${rc.attendance_summary.present_days}</div>
          <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">حاضر</div>
        </div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: #dc2626;" dir="ltr">${rc.attendance_summary.absent_days}</div>
          <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">غائب</div>
        </div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: #d97706;" dir="ltr">${rc.attendance_summary.late_days}</div>
          <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">متأخر</div>
        </div>
      </div>
    </div>`
    : '';

  const commentsSection = `
    ${rc.teacher_comment ? `
    <div style="margin-top: 20px; background: #fefce8; border-radius: 8px; padding: 14px 16px; border: 1px solid #fde68a;">
      <h3 style="font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px;">ملاحظات المعلم</h3>
      <p style="font-size: 13px; color: #78350f; line-height: 1.8;">${escapeHtml(rc.teacher_comment)}</p>
    </div>` : ''}
    ${rc.principal_comment ? `
    <div style="margin-top: 12px; background: #eff6ff; border-radius: 8px; padding: 14px 16px; border: 1px solid #bfdbfe;">
      <h3 style="font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px;">ملاحظات المدير</h3>
      <p style="font-size: 13px; color: #1e3a5f; line-height: 1.8;">${escapeHtml(rc.principal_comment)}</p>
    </div>` : ''}
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
    <!-- Header with gradient -->
    <div style="background: linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd); padding: 24px 28px; border-radius: 0 0 16px 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h1 style="font-size: 24px; font-weight: 700; color: white;">
          ${escapeHtml(branding.report_card_title || 'بطاقة التقرير')}
        </h1>
        <p style="font-size: 14px; color: rgba(255,255,255,0.85); margin-top: 4px;">${escapeHtml(branding.school_name_ar || branding.school_name)}</p>
      </div>
      ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="الشعار" style="height: 56px; max-width: 110px; object-fit: contain; border-radius: 8px; background: white; padding: 4px;">` : ''}
    </div>

    <!-- Student Info Cards -->
    <div style="display: flex; gap: 12px; margin-bottom: 24px;">
      <div style="flex: 1; background: #f8fafc; border-radius: 10px; padding: 12px 16px;">
        <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">الطالب</div>
        <div style="font-size: 14px; font-weight: 600; color: #111827; margin-top: 4px;">${escapeHtml(rc.student.full_name)}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 2px;" dir="ltr">${escapeHtml(rc.student.student_number)}</div>
      </div>
      <div style="flex: 1; background: #f8fafc; border-radius: 10px; padding: 12px 16px;">
        <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">الصف</div>
        <div style="font-size: 14px; font-weight: 600; color: #111827; margin-top: 4px;">${escapeHtml(rc.student.class_homeroom)}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${escapeHtml(rc.student.year_group)}</div>
      </div>
      <div style="flex: 1; background: #f8fafc; border-radius: 10px; padding: 12px 16px;">
        <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">الفترة</div>
        <div style="font-size: 14px; font-weight: 600; color: #111827; margin-top: 4px;">${escapeHtml(rc.period.name)}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${escapeHtml(rc.period.academic_year)}</div>
      </div>
    </div>

    <!-- Grades Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; border-radius: 10px; overflow: hidden; border: 1px solid #e5e7eb;">
      <thead>
        <tr style="background: ${primaryColor}; color: white;">
          <th style="padding: 12px; text-align: right; font-weight: 600;">المادة</th>
          <th style="padding: 12px; text-align: center; font-weight: 600; width: 120px;">الدرجة</th>
          <th style="padding: 12px; text-align: center; font-weight: 600; width: 100px;">التقدير</th>
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
