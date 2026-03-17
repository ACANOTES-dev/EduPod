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

function formatEmploymentTypeAr(type: string): string {
  const map: Record<string, string> = {
    full_time: '\u062F\u0648\u0627\u0645 \u0643\u0627\u0645\u0644',
    part_time: '\u062F\u0648\u0627\u0645 \u062C\u0632\u0626\u064A',
    contract: '\u0639\u0642\u062F',
    temporary: '\u0645\u0624\u0642\u062A',
  };
  return map[type] || type;
}

export function renderPayslipAr(data: unknown, branding: PdfBranding): string {
  const ps = data as PayslipData;
  const primaryColor = branding.primary_color || '#1e40af';
  const currency = ps.school.currency_code;

  const compensationDetails =
    ps.compensation.type === 'salaried'
      ? `
        <tr>
          <td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">\u0627\u0644\u0631\u0627\u062A\u0628 \u0627\u0644\u0623\u0633\u0627\u0633\u064A:</td>
          <td style="padding: 6px 0; font-weight: 500;" dir="ltr">${ps.compensation.base_salary != null ? formatCurrency(ps.compensation.base_salary, currency) : '\u2014'}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">\u0625\u062C\u0645\u0627\u0644\u064A \u0623\u064A\u0627\u0645 \u0627\u0644\u0639\u0645\u0644:</td>
          <td style="padding: 6px 0;" dir="ltr">${ps.period.total_working_days}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">\u0623\u064A\u0627\u0645 \u0627\u0644\u0639\u0645\u0644:</td>
          <td style="padding: 6px 0;" dir="ltr">${ps.inputs.days_worked ?? '\u2014'}</td>
        </tr>
        ${ps.compensation.bonus_day_multiplier != null ? `<tr><td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">\u0645\u0639\u0627\u0645\u0644 \u0645\u0643\u0627\u0641\u0623\u0629 \u0627\u0644\u064A\u0648\u0645 \u0627\u0644\u0625\u0636\u0627\u0641\u064A:</td><td style="padding: 6px 0;" dir="ltr">${ps.compensation.bonus_day_multiplier}x</td></tr>` : ''}`
      : `
        <tr>
          <td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">\u0645\u0639\u062F\u0644 \u0627\u0644\u062D\u0635\u0629:</td>
          <td style="padding: 6px 0; font-weight: 500;" dir="ltr">${ps.compensation.per_class_rate != null ? formatCurrency(ps.compensation.per_class_rate, currency) : '\u2014'}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">\u0627\u0644\u062D\u0635\u0635 \u0627\u0644\u0645\u0639\u064A\u0646\u0629:</td>
          <td style="padding: 6px 0;" dir="ltr">${ps.compensation.assigned_class_count ?? '\u2014'}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">\u0627\u0644\u062D\u0635\u0635 \u0627\u0644\u0645\u064F\u062F\u0631\u064E\u0651\u0633\u0629:</td>
          <td style="padding: 6px 0;" dir="ltr">${ps.inputs.classes_taught ?? '\u2014'}</td>
        </tr>
        ${ps.compensation.bonus_class_rate != null ? `<tr><td style="padding: 6px 0 6px 12px; color: #6b7280; font-weight: 500;">\u0645\u0639\u062F\u0644 \u0645\u0643\u0627\u0641\u0623\u0629 \u0627\u0644\u062D\u0635\u0629 \u0627\u0644\u0625\u0636\u0627\u0641\u064A\u0629:</td><td style="padding: 6px 0;" dir="ltr">${formatCurrency(ps.compensation.bonus_class_rate, currency)}</td></tr>` : ''}`;

  const bankSection =
    ps.staff.bank_name || ps.staff.bank_account_last4 || ps.staff.bank_iban_last4
      ? `
    <div style="margin-top: 24px; padding: 14px 16px; background: #f9fafb; border-radius: 6px;">
      <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: ${primaryColor};">\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0645\u0635\u0631\u0641\u064A\u0629</h3>
      <table style="font-size: 13px;">
        ${ps.staff.bank_name ? `<tr><td style="padding: 3px 0 3px 12px; color: #6b7280;">\u0627\u0633\u0645 \u0627\u0644\u0628\u0646\u0643:</td><td style="padding: 3px 0;">${escapeHtml(ps.staff.bank_name)}</td></tr>` : ''}
        ${ps.staff.bank_account_last4 ? `<tr><td style="padding: 3px 0 3px 12px; color: #6b7280;">\u0627\u0644\u062D\u0633\u0627\u0628:</td><td style="padding: 3px 0;" dir="ltr">****${escapeHtml(ps.staff.bank_account_last4)}</td></tr>` : ''}
        ${ps.staff.bank_iban_last4 ? `<tr><td style="padding: 3px 0 3px 12px; color: #6b7280;">\u0631\u0642\u0645 \u0627\u0644\u0622\u064A\u0628\u0627\u0646:</td><td style="padding: 3px 0;" dir="ltr">****${escapeHtml(ps.staff.bank_iban_last4)}</td></tr>` : ''}
      </table>
    </div>`
      : '';

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
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 24px;">
      <div>
        <h1 style="font-size: 28px; font-weight: 700; color: ${primaryColor}; letter-spacing: -0.5px;">\u0643\u0634\u0641 \u0627\u0644\u0631\u0627\u062A\u0628</h1>
        <p style="font-size: 16px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name_ar || branding.school_name)}</p>
      </div>
      <div>
        ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="\u0627\u0644\u0634\u0639\u0627\u0631" style="height: 60px; max-width: 120px; object-fit: contain; margin-bottom: 4px;">` : ''}
        <p style="font-size: 13px; font-weight: 600; color: #374151;" dir="ltr">${escapeHtml(ps.payslip_number)}</p>
        <p style="font-size: 13px; color: #6b7280;">${escapeHtml(ps.period.label)}</p>
      </div>
    </div>

    <!-- Staff Details -->
    <div style="margin-bottom: 24px; padding: 14px 16px; background: #f9fafb; border-radius: 6px;">
      <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 10px; color: ${primaryColor};">\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0648\u0638\u0641</h3>
      <table style="width: 100%; font-size: 13px;">
        <tr>
          <td style="padding: 4px 0 4px 12px; color: #6b7280; font-weight: 500; width: 140px;">\u0627\u0644\u0627\u0633\u0645:</td>
          <td style="padding: 4px 0; font-weight: 600;">${escapeHtml(ps.staff.full_name)}</td>
          <td style="padding: 4px 0 4px 12px; color: #6b7280; font-weight: 500; width: 140px;">\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0648\u0638\u064A\u0641\u064A:</td>
          <td style="padding: 4px 0;" dir="ltr">${escapeHtml(ps.staff.staff_number) || '\u2014'}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0 4px 12px; color: #6b7280; font-weight: 500;">\u0627\u0644\u0642\u0633\u0645:</td>
          <td style="padding: 4px 0;">${escapeHtml(ps.staff.department) || '\u2014'}</td>
          <td style="padding: 4px 0 4px 12px; color: #6b7280; font-weight: 500;">\u0627\u0644\u0645\u0633\u0645\u0649 \u0627\u0644\u0648\u0638\u064A\u0641\u064A:</td>
          <td style="padding: 4px 0;">${escapeHtml(ps.staff.job_title) || '\u2014'}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0 4px 12px; color: #6b7280; font-weight: 500;">\u0646\u0648\u0639 \u0627\u0644\u062A\u0648\u0638\u064A\u0641:</td>
          <td style="padding: 4px 0;" colspan="3">${formatEmploymentTypeAr(ps.staff.employment_type)}</td>
        </tr>
      </table>
    </div>

    <!-- Compensation Details -->
    <div style="display: flex; gap: 24px; margin-bottom: 24px;">
      <div style="flex: 1;">
        <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 10px; color: ${primaryColor};">\u0627\u0644\u062A\u0639\u0648\u064A\u0636 (${ps.compensation.type === 'salaried' ? '\u0628\u0631\u0627\u062A\u0628 \u0634\u0647\u0631\u064A' : '\u0628\u0627\u0644\u062D\u0635\u0629'})</h3>
        <table style="font-size: 13px;">
          ${compensationDetails}
        </table>
      </div>
    </div>

    <!-- Calculations Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
      <thead>
        <tr style="background: ${primaryColor}; color: white;">
          <th style="padding: 10px 12px; text-align: right; font-weight: 600;">\u0627\u0644\u0628\u0646\u062F</th>
          <th style="padding: 10px 12px; text-align: left; font-weight: 600; width: 180px;">\u0627\u0644\u0645\u0628\u0644\u063A</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">\u0627\u0644\u0631\u0627\u062A\u0628 \u0627\u0644\u0623\u0633\u0627\u0633\u064A</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: left;" dir="ltr">${formatCurrency(ps.calculations.basic_pay, currency)}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">\u0627\u0644\u0645\u0643\u0627\u0641\u0623\u0629</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: left;" dir="ltr">${formatCurrency(ps.calculations.bonus_pay, currency)}</td>
        </tr>
        <tr style="background: #f0f9ff;">
          <td style="padding: 12px; font-weight: 700; font-size: 15px; border-top: 2px solid ${primaryColor};">\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0631\u0627\u062A\u0628</td>
          <td style="padding: 12px; text-align: left; font-weight: 700; font-size: 15px; border-top: 2px solid ${primaryColor}; color: ${primaryColor};" dir="ltr">${formatCurrency(ps.calculations.total_pay, currency)}</td>
        </tr>
      </tbody>
    </table>

    ${bankSection}

    <!-- Footer -->
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center;">
      <p>${escapeHtml(branding.school_name_ar || branding.school_name)} &mdash; \u0647\u0630\u0627 \u0643\u0634\u0641 \u0631\u0627\u062A\u0628 \u0635\u0627\u062F\u0631 \u0622\u0644\u064A\u0627\u064B \u0648\u0644\u0627 \u064A\u062A\u0637\u0644\u0628 \u062A\u0648\u0642\u064A\u0639\u0627\u064B.</p>
    </div>
  </div>
</body>
</html>`;
}
