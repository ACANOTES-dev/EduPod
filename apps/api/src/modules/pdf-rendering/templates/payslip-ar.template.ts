import type { PdfBranding } from '../pdf-rendering.service';

interface PayslipData {
  staff: {
    full_name: string;
    staff_number: string | null;
    department: string | null;
    job_title: string | null;
    employment_type: string;
    bank_name: string | null;
    bank_account_last4: string | null;
    bank_iban_last4: string | null;
  };
  period: {
    label: string;
    month: number;
    year: number;
    total_working_days: number;
  };
  compensation: {
    type: 'salaried' | 'per_class';
    base_salary: number | null;
    per_class_rate: number | null;
    assigned_class_count: number | null;
    bonus_class_rate: number | null;
    bonus_day_multiplier: number | null;
  };
  inputs: {
    days_worked: number | null;
    classes_taught: number | null;
  };
  calculations: {
    basic_pay: number;
    bonus_pay: number;
    total_pay: number;
  };
  school: {
    name: string;
    name_ar: string | null;
    logo_url: string | null;
    currency_code: string;
  };
  payslip_number: string;
  issued_at?: string;
  payslip_signature?: {
    principal_name: string;
    principal_signature_url: string | null;
    footer_message: string;
  };
  gross_pay_disclaimer?: string;
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Number formatting ──────────────────────────────────────────────────────
//
// We keep Western digits (0-9) inside Arabic UI throughout the rest of the
// platform per CLAUDE.md frontend rules. To keep payslip numbers consistent
// with the in-app experience we use 'en-GB' locale grouping ("5,000.00")
// rather than ar-EG's "٥٬٠٠٠٫٠٠". The amount cell itself is wrapped in
// dir="ltr" so the comma+period read left-to-right inside the otherwise RTL
// document.

const numberFormatter = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integerFormatter = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

function fmtMoney(amount: number | null | undefined, currency: string): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return `${currency} ${numberFormatter.format(amount)}`;
}

function fmtNumber(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return integerFormatter.format(n);
}

function formatEmploymentTypeAr(type: string): string {
  const map: Record<string, string> = {
    full_time: 'دوام كامل',
    part_time: 'دوام جزئي',
    contract: 'عقد',
    temporary: 'مؤقت',
  };
  return map[type] || type;
}

function simplifyPayslipNumber(raw: string | null | undefined): string {
  if (!raw) return '';
  const match = raw.match(/^([A-Z]+)-\d{6}-(\d+)$/);
  if (!match) return raw;
  return `${match[1]}-${match[2]}`;
}

function formatIssueDateAr(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  // Use the Arabic-Latin variant ("27 أبريل 2026") so the digits stay
  // Western per the frontend rule but the month name is Arabic.
  return new Intl.DateTimeFormat('ar', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    numberingSystem: 'latn',
  }).format(d);
}

export function renderPayslipAr(data: unknown, branding: PdfBranding): string {
  const ps = data as PayslipData;
  const primaryColor = branding.primary_color || '#1e40af';
  const currency = ps.school.currency_code;
  const refNumber = simplifyPayslipNumber(ps.payslip_number);
  const issueDate = formatIssueDateAr(ps.issued_at);
  const schoolName = branding.school_name_ar || branding.school_name;

  const isSalaried = ps.compensation.type === 'salaried';
  const baseSalary = ps.compensation.base_salary ?? 0;
  const perClassRate = ps.compensation.per_class_rate ?? 0;
  const daysWorked = ps.inputs.days_worked ?? 0;
  const totalDays = ps.period.total_working_days;
  const classesTaught = ps.inputs.classes_taught ?? 0;
  const ratio = totalDays > 0 ? daysWorked / totalDays : 0;
  const ratioPct = (ratio * 100).toFixed(1);

  // ─── Compensation breakdown rows ─────────────────────────────────────────

  const compensationDetails = isSalaried
    ? `
        <tr>
          <td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">الراتب الأساسي:</td>
          <td style="padding: 6px 0; font-weight: 500;" dir="ltr">${fmtMoney(baseSalary, currency)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">إجمالي أيام العمل:</td>
          <td style="padding: 6px 0;" dir="ltr">${fmtNumber(totalDays)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">أيام العمل الفعلية:</td>
          <td style="padding: 6px 0;" dir="ltr">${fmtNumber(daysWorked)}</td>
        </tr>
        ${
          ps.compensation.bonus_day_multiplier != null
            ? `<tr><td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">معامل المكافأة لليوم الإضافي:</td><td style="padding: 6px 0;" dir="ltr">${ps.compensation.bonus_day_multiplier}×</td></tr>`
            : ''
        }`
    : `
        <tr>
          <td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">معدل الحصة:</td>
          <td style="padding: 6px 0; font-weight: 500;" dir="ltr">${fmtMoney(perClassRate, currency)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">الحصص المعيّنة:</td>
          <td style="padding: 6px 0;" dir="ltr">${fmtNumber(ps.compensation.assigned_class_count)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">الحصص المُدرَّسة:</td>
          <td style="padding: 6px 0;" dir="ltr">${fmtNumber(classesTaught)}</td>
        </tr>
        ${
          ps.compensation.bonus_class_rate != null
            ? `<tr><td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">معدل مكافأة الحصة الإضافية:</td><td style="padding: 6px 0;" dir="ltr">${fmtMoney(ps.compensation.bonus_class_rate, currency)}</td></tr>`
            : ''
        }`;

  // ─── "How we got here" calc breakdown ────────────────────────────────────
  // Mirrors the EN template — every numeric expression stays in dir="ltr"
  // so the math reads left-to-right inside otherwise-RTL Arabic prose.

  const basicPayBreakdown = isSalaried
    ? `
        <p style="margin: 0; color: #4b5563; font-size: 12px;">
          <span dir="ltr">${fmtNumber(daysWorked)} / ${fmtNumber(totalDays)}</span> يوم
          (<span dir="ltr">${ratioPct}%</span>) ×
          <span dir="ltr">${fmtMoney(baseSalary, currency)}</span>
          = <strong style="color: #111827;" dir="ltr">${fmtMoney(ps.calculations.basic_pay, currency)}</strong>
        </p>`
    : `
        <p style="margin: 0; color: #4b5563; font-size: 12px;">
          <span dir="ltr">${fmtNumber(classesTaught)}</span> حصة ×
          <span dir="ltr">${fmtMoney(perClassRate, currency)}</span>
          = <strong style="color: #111827;" dir="ltr">${fmtMoney(ps.calculations.basic_pay, currency)}</strong>
        </p>`;

  const bonusPayBreakdown =
    ps.calculations.bonus_pay > 0
      ? isSalaried && ps.compensation.bonus_day_multiplier
        ? `<p style="margin: 0; color: #4b5563; font-size: 12px;">تطبيق معامل المكافأة <span dir="ltr">${ps.compensation.bonus_day_multiplier}×</span> = <strong style="color: #111827;" dir="ltr">${fmtMoney(ps.calculations.bonus_pay, currency)}</strong></p>`
        : `<p style="margin: 0; color: #4b5563; font-size: 12px;">إجمالي المكافأة = <strong style="color: #111827;" dir="ltr">${fmtMoney(ps.calculations.bonus_pay, currency)}</strong></p>`
      : `<p style="margin: 0; color: #9ca3af; font-size: 12px; font-style: italic;">لا توجد مكافأة لهذه الفترة.</p>`;

  // ─── Bank details (legacy snapshots only) ────────────────────────────────

  const bankSection =
    ps.staff.bank_name || ps.staff.bank_account_last4 || ps.staff.bank_iban_last4
      ? `
    <div style="margin-top: 24px; padding: 14px 16px; background: #f9fafb; border-radius: 6px;">
      <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: ${primaryColor};">التفاصيل المصرفية</h3>
      <table style="font-size: 13px;">
        ${ps.staff.bank_name ? `<tr><td style="padding: 3px 0 3px 12px; color: #6b7280;">اسم البنك:</td><td style="padding: 3px 0;">${escapeHtml(ps.staff.bank_name)}</td></tr>` : ''}
        ${ps.staff.bank_account_last4 ? `<tr><td style="padding: 3px 0 3px 12px; color: #6b7280;">رقم الحساب:</td><td style="padding: 3px 0;" dir="ltr">****${escapeHtml(ps.staff.bank_account_last4)}</td></tr>` : ''}
        ${ps.staff.bank_iban_last4 ? `<tr><td style="padding: 3px 0 3px 12px; color: #6b7280;">رقم الآيبان:</td><td style="padding: 3px 0;" dir="ltr">****${escapeHtml(ps.staff.bank_iban_last4)}</td></tr>` : ''}
      </table>
    </div>`
      : '';

  // ─── Signature block ────────────────────────────────────────────────────

  const sig = ps.payslip_signature;
  const footerMessage = sig?.footer_message || 'نشكركم على تفانيكم وعطائكم خلال هذه الفترة.';
  const principalName = sig?.principal_name || '';
  const signatureImg = sig?.principal_signature_url || '';

  const signatureBlock = `
    <div style="margin-top: 36px; page-break-inside: avoid;">
      <p style="font-size: 13px; color: #374151; line-height: 1.55; margin-bottom: 28px;">
        ${escapeHtml(footerMessage)}
      </p>
      <div style="display: inline-block; min-width: 200px; padding-top: 6px; border-top: 1px solid #d1d5db;">
        ${
          signatureImg
            ? `<img src="${escapeHtml(signatureImg)}" alt="التوقيع" style="display: block; height: 48px; max-width: 200px; object-fit: contain; margin-bottom: -38px; margin-top: -56px;">`
            : ''
        }
        <p style="margin: 0; font-size: 13px; font-weight: 600; color: #111827;">
          ${escapeHtml(principalName) || '&nbsp;'}
        </p>
        <p style="margin: 0; font-size: 11px; color: #6b7280;">مدير المدرسة</p>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Noto Sans Arabic', 'Arial', sans-serif; color: #111827; font-size: 14px; background: white; direction: rtl; }
    /* Wave 5 fix: A4 page with proper print margins (was margin: 0). */
    @page { size: A4; margin: 18mm 16mm; }
  </style>
</head>
<body>
  <!-- Header — RTL means the title/school go on the right, logo+ref on the left -->
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 24px;">
    <div>
      <h1 style="font-size: 28px; font-weight: 700; color: ${primaryColor}; letter-spacing: -0.5px;">كشف الراتب</h1>
      <p style="font-size: 16px; font-weight: 600; margin-top: 4px;">${escapeHtml(schoolName)}</p>
    </div>
    <div style="text-align: left;">
      ${
        branding.logo_url
          ? `<img src="${escapeHtml(branding.logo_url)}" alt="الشعار" style="display: block; height: 56px; max-width: 140px; object-fit: contain; margin-bottom: 6px; margin-right: auto;">`
          : ''
      }
      <p style="font-size: 13px; font-weight: 600; color: #374151;" dir="ltr">${escapeHtml(refNumber)}</p>
      <p style="font-size: 12px; color: #6b7280; margin-top: 2px;">${escapeHtml(ps.period.label)}</p>
      ${issueDate ? `<p style="font-size: 11px; color: #9ca3af; margin-top: 2px;">تاريخ الإصدار: ${escapeHtml(issueDate)}</p>` : ''}
    </div>
  </div>

  <!-- Staff Details -->
  <div style="margin-bottom: 24px; padding: 14px 16px; background: #f9fafb; border-radius: 6px;">
    <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 10px; color: ${primaryColor};">بيانات الموظف</h3>
    <table style="width: 100%; font-size: 13px;">
      <tr>
        <td style="padding: 4px 0 4px 12px; color: #6b7280; font-weight: 500; width: 140px;">الاسم:</td>
        <td style="padding: 4px 0; font-weight: 600;">${escapeHtml(ps.staff.full_name)}</td>
        <td style="padding: 4px 0 4px 12px; color: #6b7280; font-weight: 500; width: 140px;">الرقم الوظيفي:</td>
        <td style="padding: 4px 0;" dir="ltr">${escapeHtml(ps.staff.staff_number) || '—'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0 4px 12px; color: #6b7280; font-weight: 500;">القسم:</td>
        <td style="padding: 4px 0;">${escapeHtml(ps.staff.department) || '—'}</td>
        <td style="padding: 4px 0 4px 12px; color: #6b7280; font-weight: 500;">المسمى الوظيفي:</td>
        <td style="padding: 4px 0;">${escapeHtml(ps.staff.job_title) || '—'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0 4px 12px; color: #6b7280; font-weight: 500;">نوع التوظيف:</td>
        <td style="padding: 4px 0;" colspan="3">${formatEmploymentTypeAr(ps.staff.employment_type)}</td>
      </tr>
    </table>
  </div>

  <!-- Compensation Details -->
  <div style="margin-bottom: 24px;">
    <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 10px; color: ${primaryColor};">التعويض (${isSalaried ? 'براتب شهري' : 'بالحصة'})</h3>
    <table style="font-size: 13px;">
      ${compensationDetails}
    </table>
  </div>

  <!-- Components — show how the calculation was derived -->
  <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
    <thead>
      <tr style="background: ${primaryColor}; color: white;">
        <th style="padding: 10px 12px; text-align: right; font-weight: 600;">البند</th>
        <th style="padding: 10px 12px; text-align: right; font-weight: 600;">طريقة الاحتساب</th>
        <th style="padding: 10px 12px; text-align: left; font-weight: 600; width: 140px;">المبلغ</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">الراتب الأساسي</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${basicPayBreakdown}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top;" dir="ltr">${fmtMoney(ps.calculations.basic_pay, currency)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">المكافأة</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${bonusPayBreakdown}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top;" dir="ltr">${fmtMoney(ps.calculations.bonus_pay, currency)}</td>
      </tr>
      <tr style="background: #f0f9ff;">
        <td style="padding: 12px; font-weight: 700; font-size: 15px; border-top: 2px solid ${primaryColor};">إجمالي الراتب</td>
        <td style="padding: 12px; font-size: 12px; color: #4b5563; border-top: 2px solid ${primaryColor};">الراتب الأساسي + المكافأة</td>
        <td style="padding: 12px; text-align: left; font-weight: 700; font-size: 15px; border-top: 2px solid ${primaryColor}; color: ${primaryColor};" dir="ltr">${fmtMoney(ps.calculations.total_pay, currency)}</td>
      </tr>
    </tbody>
  </table>

  ${bankSection}

  ${
    ps.gross_pay_disclaimer && ps.gross_pay_disclaimer.trim().length > 0
      ? `
  <!-- Gross-pay disclaimer (tenant-configurable; tax jurisdictions only) -->
  <div style="margin-top: 24px; padding: 14px 16px; background: #fffbeb; border-right: 4px solid #f59e0b; border-radius: 4px; page-break-inside: avoid;">
    <p style="font-size: 12px; font-weight: 600; color: #92400e; margin: 0 0 4px 0; letter-spacing: 0.4px;">تنبيه مهم</p>
    <p style="font-size: 12px; color: #78350f; margin: 0; line-height: 1.7;">
      ${escapeHtml(ps.gross_pay_disclaimer)}
    </p>
  </div>`
      : ''
  }

  <!-- Signature block (closing message + principal signature + name) -->
  ${signatureBlock}

  <!-- Page footer (small print only) -->
  <div style="margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center;">
    <p>${escapeHtml(schoolName)} · المرجع <span dir="ltr">${escapeHtml(refNumber)}</span></p>
  </div>
</body>
</html>`;
}
