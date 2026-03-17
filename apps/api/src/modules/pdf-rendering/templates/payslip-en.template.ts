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
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

function formatEmploymentType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function renderPayslipEn(data: unknown, branding: PdfBranding): string {
  const ps = data as PayslipData;
  const primaryColor = branding.primary_color || '#1e40af';
  const currency = ps.school.currency_code;

  const compensationDetails =
    ps.compensation.type === 'salaried'
      ? `
        <tr>
          <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Base Salary:</td>
          <td style="padding: 6px 0; font-weight: 500;">${ps.compensation.base_salary != null ? formatCurrency(ps.compensation.base_salary, currency) : '—'}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Total Working Days:</td>
          <td style="padding: 6px 0;">${ps.period.total_working_days}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Days Worked:</td>
          <td style="padding: 6px 0;">${ps.inputs.days_worked ?? '—'}</td>
        </tr>
        ${ps.compensation.bonus_day_multiplier != null ? `<tr><td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Bonus Day Multiplier:</td><td style="padding: 6px 0;">${ps.compensation.bonus_day_multiplier}x</td></tr>` : ''}`
      : `
        <tr>
          <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Per Class Rate:</td>
          <td style="padding: 6px 0; font-weight: 500;">${ps.compensation.per_class_rate != null ? formatCurrency(ps.compensation.per_class_rate, currency) : '—'}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Assigned Classes:</td>
          <td style="padding: 6px 0;">${ps.compensation.assigned_class_count ?? '—'}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Classes Taught:</td>
          <td style="padding: 6px 0;">${ps.inputs.classes_taught ?? '—'}</td>
        </tr>
        ${ps.compensation.bonus_class_rate != null ? `<tr><td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 500;">Bonus Class Rate:</td><td style="padding: 6px 0;">${formatCurrency(ps.compensation.bonus_class_rate, currency)}</td></tr>` : ''}`;

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
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 24px;">
      <div>
        <h1 style="font-size: 28px; font-weight: 700; color: ${primaryColor}; letter-spacing: -0.5px;">PAYSLIP</h1>
        <p style="font-size: 16px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name)}</p>
      </div>
      <div style="text-align: right;">
        ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="Logo" style="height: 60px; max-width: 120px; object-fit: contain; margin-bottom: 4px;">` : ''}
        <p style="font-size: 13px; font-weight: 600; color: #374151;" dir="ltr">${escapeHtml(ps.payslip_number)}</p>
        <p style="font-size: 13px; color: #6b7280;">${escapeHtml(ps.period.label)}</p>
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
    <div style="display: flex; gap: 24px; margin-bottom: 24px;">
      <div style="flex: 1;">
        <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 10px; color: ${primaryColor}; text-transform: uppercase;">Compensation (${ps.compensation.type === 'salaried' ? 'Salaried' : 'Per Class'})</h3>
        <table style="font-size: 13px;">
          ${compensationDetails}
        </table>
      </div>
    </div>

    <!-- Calculations Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
      <thead>
        <tr style="background: ${primaryColor}; color: white;">
          <th style="padding: 10px 12px; text-align: left; font-weight: 600;">Component</th>
          <th style="padding: 10px 12px; text-align: right; font-weight: 600; width: 180px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">Basic Pay</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(ps.calculations.basic_pay, currency)}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">Bonus Pay</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(ps.calculations.bonus_pay, currency)}</td>
        </tr>
        <tr style="background: #f0f9ff;">
          <td style="padding: 12px; font-weight: 700; font-size: 15px; border-top: 2px solid ${primaryColor};">Total Pay</td>
          <td style="padding: 12px; text-align: right; font-weight: 700; font-size: 15px; border-top: 2px solid ${primaryColor}; color: ${primaryColor};">${formatCurrency(ps.calculations.total_pay, currency)}</td>
        </tr>
      </tbody>
    </table>

    ${bankSection}

    <!-- Footer -->
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center;">
      <p>${escapeHtml(branding.school_name)} &mdash; This is a computer-generated payslip and does not require a signature.</p>
    </div>
  </div>
</body>
</html>`;
}
