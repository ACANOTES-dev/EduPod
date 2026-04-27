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
  // Optional issue date (ISO string). Falls back to "today at render time"
  // if not supplied — preserves behaviour for legacy snapshots.
  issued_at?: string;
  // Optional principal-signature block (Wave 5 — payroll settings). All
  // empty/null fields render their respective fallback (no signature
  // image, generic thank-you, no name line).
  payslip_signature?: {
    principal_name: string;
    principal_signature_url: string | null;
    footer_message: string;
  };
  // Optional gross-pay disclaimer (Wave 5 — payroll settings). Empty
  // string ⇒ section is omitted. Tenants in tax-free jurisdictions blank
  // this field deliberately.
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

// ─── Number formatting (en-GB → "5,000.00") ─────────────────────────────────
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

function formatEmploymentType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// "PSL-202604-000001" → "PSL-000001". Falls through if the format
// doesn't match (pre-rebuild payslips with shorter formats stay as-is).
function simplifyPayslipNumber(raw: string | null | undefined): string {
  if (!raw) return '';
  const match = raw.match(/^([A-Z]+)-\d{6}-(\d+)$/);
  if (!match) return raw;
  return `${match[1]}-${match[2]}`;
}

function formatIssueDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  // "27 Apr 2026"
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function renderPayslipEn(data: unknown, branding: PdfBranding): string {
  const ps = data as PayslipData;
  const primaryColor = branding.primary_color || '#1e40af';
  const currency = ps.school.currency_code;
  const refNumber = simplifyPayslipNumber(ps.payslip_number);
  const issueDate = formatIssueDate(ps.issued_at);

  // ─── Compensation breakdown rows ─────────────────────────────────────────
  // Salaried: show "days worked / total × base = pro-rated base".
  // Per-class: show "classes taught × per-class rate = total".

  const isSalaried = ps.compensation.type === 'salaried';
  const baseSalary = ps.compensation.base_salary ?? 0;
  const perClassRate = ps.compensation.per_class_rate ?? 0;
  const daysWorked = ps.inputs.days_worked ?? 0;
  const totalDays = ps.period.total_working_days;
  const classesTaught = ps.inputs.classes_taught ?? 0;
  const ratio = totalDays > 0 ? daysWorked / totalDays : 0;
  const ratioPct = (ratio * 100).toFixed(1);

  const compensationDetails = isSalaried
    ? `
        <tr>
          <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Base Salary:</td>
          <td style="padding: 6px 0; font-weight: 500;">${fmtMoney(baseSalary, currency)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Total Working Days:</td>
          <td style="padding: 6px 0;">${fmtNumber(totalDays)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Days Worked:</td>
          <td style="padding: 6px 0;">${fmtNumber(daysWorked)}</td>
        </tr>
        ${
          ps.compensation.bonus_day_multiplier != null
            ? `<tr><td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Bonus Day Multiplier:</td><td style="padding: 6px 0;">${ps.compensation.bonus_day_multiplier}×</td></tr>`
            : ''
        }`
    : `
        <tr>
          <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Per Class Rate:</td>
          <td style="padding: 6px 0; font-weight: 500;">${fmtMoney(perClassRate, currency)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Assigned Classes:</td>
          <td style="padding: 6px 0;">${fmtNumber(ps.compensation.assigned_class_count)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Classes Taught:</td>
          <td style="padding: 6px 0;">${fmtNumber(classesTaught)}</td>
        </tr>
        ${
          ps.compensation.bonus_class_rate != null
            ? `<tr><td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Bonus Class Rate:</td><td style="padding: 6px 0;">${fmtMoney(ps.compensation.bonus_class_rate, currency)}</td></tr>`
            : ''
        }`;

  // ─── "How we got here" calc breakdown ────────────────────────────────────

  const basicPayBreakdown = isSalaried
    ? `
        <p style="margin: 0; color: #4b5563; font-size: 12px;">
          ${fmtNumber(daysWorked)} / ${fmtNumber(totalDays)} days
          (${ratioPct}%) × ${fmtMoney(baseSalary, currency)}
          = <strong style="color: #111827;">${fmtMoney(ps.calculations.basic_pay, currency)}</strong>
        </p>`
    : `
        <p style="margin: 0; color: #4b5563; font-size: 12px;">
          ${fmtNumber(classesTaught)} classes × ${fmtMoney(perClassRate, currency)}
          = <strong style="color: #111827;">${fmtMoney(ps.calculations.basic_pay, currency)}</strong>
        </p>`;

  const bonusPayBreakdown =
    ps.calculations.bonus_pay > 0
      ? isSalaried && ps.compensation.bonus_day_multiplier
        ? `<p style="margin: 0; color: #4b5563; font-size: 12px;">Bonus pay applied at ${ps.compensation.bonus_day_multiplier}× multiplier = <strong style="color: #111827;">${fmtMoney(ps.calculations.bonus_pay, currency)}</strong></p>`
        : `<p style="margin: 0; color: #4b5563; font-size: 12px;">Bonus pay total = <strong style="color: #111827;">${fmtMoney(ps.calculations.bonus_pay, currency)}</strong></p>`
      : `<p style="margin: 0; color: #9ca3af; font-size: 12px; font-style: italic;">No bonus this period.</p>`;

  // ─── Bank details (legacy snapshots only) ────────────────────────────────

  const bankSection =
    ps.staff.bank_name || ps.staff.bank_account_last4 || ps.staff.bank_iban_last4
      ? `
    <div style="margin-top: 24px; padding: 14px 16px; background: #f9fafb; border-radius: 6px;">
      <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: ${primaryColor};">Bank Details</h3>
      <table style="font-size: 13px;">
        ${ps.staff.bank_name ? `<tr><td style="padding: 3px 12px 3px 0; color: #6b7280;">Bank Name:</td><td style="padding: 3px 0;">${escapeHtml(ps.staff.bank_name)}</td></tr>` : ''}
        ${ps.staff.bank_account_last4 ? `<tr><td style="padding: 3px 12px 3px 0; color: #6b7280;">Account:</td><td style="padding: 3px 0;">****${escapeHtml(ps.staff.bank_account_last4)}</td></tr>` : ''}
        ${ps.staff.bank_iban_last4 ? `<tr><td style="padding: 3px 12px 3px 0; color: #6b7280;">IBAN:</td><td style="padding: 3px 0;">****${escapeHtml(ps.staff.bank_iban_last4)}</td></tr>` : ''}
      </table>
    </div>`
      : '';

  // ─── Signature block ────────────────────────────────────────────────────

  const sig = ps.payslip_signature;
  const footerMessage =
    sig?.footer_message || 'Thank you for your dedication and hard work this period.';
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
            ? `<img src="${escapeHtml(signatureImg)}" alt="Signature" style="display: block; height: 48px; max-width: 200px; object-fit: contain; margin-bottom: -38px; margin-top: -56px;">`
            : ''
        }
        <p style="margin: 0; font-size: 13px; font-weight: 600; color: #111827;">
          ${escapeHtml(principalName) || '&nbsp;'}
        </p>
        <p style="margin: 0; font-size: 11px; color: #6b7280;">School Principal</p>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111827; font-size: 14px; background: white; }
    /* Wave 5 fix: A4 page with proper print margins (was margin: 0 → text glued to edges). */
    @page { size: A4; margin: 18mm 16mm; }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 24px;">
    <div>
      <h1 style="font-size: 28px; font-weight: 700; color: ${primaryColor}; letter-spacing: -0.5px;">PAYSLIP</h1>
      <p style="font-size: 16px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name)}</p>
    </div>
    <div style="text-align: right;">
      ${
        branding.logo_url
          ? `<img src="${escapeHtml(branding.logo_url)}" alt="Logo" style="display: block; height: 56px; max-width: 140px; object-fit: contain; margin-bottom: 6px; margin-left: auto;">`
          : ''
      }
      <p style="font-size: 13px; font-weight: 600; color: #374151;" dir="ltr">${escapeHtml(refNumber)}</p>
      <p style="font-size: 12px; color: #6b7280; margin-top: 2px;">${escapeHtml(ps.period.label)}</p>
      ${issueDate ? `<p style="font-size: 11px; color: #9ca3af; margin-top: 2px;">Issued: ${escapeHtml(issueDate)}</p>` : ''}
    </div>
  </div>

  <!-- Staff Details -->
  <div style="margin-bottom: 24px; padding: 14px 16px; background: #f9fafb; border-radius: 6px;">
    <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 10px; color: ${primaryColor}; text-transform: uppercase;">Staff Details</h3>
    <table style="width: 100%; font-size: 13px;">
      <tr>
        <td style="padding: 4px 12px 4px 0; color: #6b7280; font-weight: 500; width: 140px;">Name:</td>
        <td style="padding: 4px 0; font-weight: 600;">${escapeHtml(ps.staff.full_name)}</td>
        <td style="padding: 4px 12px 4px 0; color: #6b7280; font-weight: 500; width: 140px;">Staff Number:</td>
        <td style="padding: 4px 0;">${escapeHtml(ps.staff.staff_number) || '—'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 12px 4px 0; color: #6b7280; font-weight: 500;">Department:</td>
        <td style="padding: 4px 0;">${escapeHtml(ps.staff.department) || '—'}</td>
        <td style="padding: 4px 12px 4px 0; color: #6b7280; font-weight: 500;">Job Title:</td>
        <td style="padding: 4px 0;">${escapeHtml(ps.staff.job_title) || '—'}</td>
      </tr>
      <tr>
        <td style="padding: 4px 12px 4px 0; color: #6b7280; font-weight: 500;">Employment Type:</td>
        <td style="padding: 4px 0;" colspan="3">${formatEmploymentType(ps.staff.employment_type)}</td>
      </tr>
    </table>
  </div>

  <!-- Compensation Details -->
  <div style="margin-bottom: 24px;">
    <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 10px; color: ${primaryColor}; text-transform: uppercase;">Compensation (${isSalaried ? 'Salaried' : 'Per Class'})</h3>
    <table style="font-size: 13px;">
      ${compensationDetails}
    </table>
  </div>

  <!-- Components — show the calculation, not just the number -->
  <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
    <thead>
      <tr style="background: ${primaryColor}; color: white;">
        <th style="padding: 10px 12px; text-align: left; font-weight: 600;">Component</th>
        <th style="padding: 10px 12px; text-align: left; font-weight: 600;">How it was calculated</th>
        <th style="padding: 10px 12px; text-align: right; font-weight: 600; width: 140px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">Basic Pay</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${basicPayBreakdown}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; vertical-align: top;">${fmtMoney(ps.calculations.basic_pay, currency)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">Bonus Pay</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${bonusPayBreakdown}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; vertical-align: top;">${fmtMoney(ps.calculations.bonus_pay, currency)}</td>
      </tr>
      <tr style="background: #f0f9ff;">
        <td style="padding: 12px; font-weight: 700; font-size: 15px; border-top: 2px solid ${primaryColor};">Total Pay</td>
        <td style="padding: 12px; font-size: 12px; color: #4b5563; border-top: 2px solid ${primaryColor};">Basic Pay + Bonus Pay</td>
        <td style="padding: 12px; text-align: right; font-weight: 700; font-size: 15px; border-top: 2px solid ${primaryColor}; color: ${primaryColor};">${fmtMoney(ps.calculations.total_pay, currency)}</td>
      </tr>
    </tbody>
  </table>

  ${bankSection}

  ${
    ps.gross_pay_disclaimer && ps.gross_pay_disclaimer.trim().length > 0
      ? `
  <!-- Gross-pay disclaimer (tenant-configurable; tax jurisdictions only) -->
  <div style="margin-top: 24px; padding: 14px 16px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px; page-break-inside: avoid;">
    <p style="font-size: 12px; font-weight: 600; color: #92400e; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.4px;">Important</p>
    <p style="font-size: 12px; color: #78350f; margin: 0; line-height: 1.5;">
      ${escapeHtml(ps.gross_pay_disclaimer)}
    </p>
  </div>`
      : ''
  }

  <!-- Signature block (closing message + principal signature + name) -->
  ${signatureBlock}

  <!-- Page footer (small print only) -->
  <div style="margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center;">
    <p>${escapeHtml(branding.school_name)} · Reference ${escapeHtml(refNumber)}</p>
  </div>
</body>
</html>`;
}
