import type { PdfBranding } from '../pdf-rendering.service';

interface TranscriptData {
  student: {
    id: string;
    full_name: string;
    student_number: string | null;
    year_group: string;
  };
  years: Array<{
    academic_year: string;
    periods: Array<{
      period_name: string;
      subjects: Array<{
        subject_name: string;
        subject_code: string | null;
        computed_value: number;
        display_value: string;
        overridden_value: string | null;
      }>;
    }>;
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

export function renderTranscriptEn(data: unknown, branding: PdfBranding): string {
  const t = data as TranscriptData;
  const primaryColor = branding.primary_color || '#1e40af';

  const yearsHtml = t.years
    .map(
      (year) => `
      <div style="margin-bottom: 24px;">
        <h3 style="font-size: 15px; font-weight: 600; color: ${primaryColor}; margin-bottom: 8px; border-bottom: 2px solid ${primaryColor}; padding-bottom: 4px;">
          ${escapeHtml(year.academic_year)}
        </h3>
        ${year.periods
          .map(
            (period) => `
          <div style="margin-bottom: 16px;">
            <h4 style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">${escapeHtml(period.period_name)}</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <thead>
                <tr style="background: #f3f4f6;">
                  <th style="padding: 6px 8px; text-align: left; font-weight: 600; border-bottom: 1px solid #d1d5db;">Subject</th>
                  <th style="padding: 6px 8px; text-align: center; font-weight: 600; width: 80px; border-bottom: 1px solid #d1d5db;">Score (%)</th>
                  <th style="padding: 6px 8px; text-align: center; font-weight: 600; width: 80px; border-bottom: 1px solid #d1d5db;">Grade</th>
                </tr>
              </thead>
              <tbody>
                ${period.subjects
                  .map(
                    (s) => `
                  <tr>
                    <td style="padding: 5px 8px; border-bottom: 1px solid #e5e7eb;">
                      ${escapeHtml(s.subject_name)}
                      ${s.subject_code ? `<span style="color: #6b7280;"> (${escapeHtml(s.subject_code)})</span>` : ''}
                    </td>
                    <td style="padding: 5px 8px; text-align: center; border-bottom: 1px solid #e5e7eb;">${s.computed_value.toFixed(1)}%</td>
                    <td style="padding: 5px 8px; text-align: center; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${escapeHtml(s.overridden_value || s.display_value)}</td>
                  </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>`,
          )
          .join('')}
      </div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111827; font-size: 14px; background: white; }
    @page { size: A4; margin: 0; }
  </style>
</head>
<body>
  <div style="padding: 0;">
    <!-- Header -->
    <div style="border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h1 style="font-size: 22px; font-weight: 700; color: ${primaryColor};">Academic Transcript</h1>
          <p style="font-size: 16px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name)}</p>
        </div>
        ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="Logo" style="height: 60px; max-width: 120px; object-fit: contain;">` : ''}
      </div>
    </div>

    <!-- Student Info -->
    <table style="width: 100%; font-size: 13px; margin-bottom: 20px;">
      <tr>
        <td style="padding: 4px 0;"><strong>Student:</strong> ${escapeHtml(t.student.full_name)}</td>
        <td style="padding: 4px 0;"><strong>Student Number:</strong> ${escapeHtml(t.student.student_number)}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0;"><strong>Year Group:</strong> ${escapeHtml(t.student.year_group)}</td>
        <td style="padding: 4px 0;"><strong>Generated:</strong> ${new Date().toLocaleDateString('en-GB')}</td>
      </tr>
    </table>

    <!-- Academic Records -->
    ${yearsHtml}

    ${t.years.length === 0 ? '<p style="color: #6b7280; text-align: center; padding: 40px 0;">No academic records available.</p>' : ''}
  </div>
</body>
</html>`;
}
