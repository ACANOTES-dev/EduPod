import type { PdfBranding } from '../pdf-rendering.service';

interface LedgerEntry {
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: number | null;
  credit: number | null;
  running_balance: number;
}

interface HouseholdStatementData {
  household: {
    household_name: string;
    billing_parent_name: string | null;
  };
  currency_code: string;
  date_from: string;
  date_to: string;
  opening_balance: number;
  closing_balance: number;
  entries: LedgerEntry[];
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

function formatTypeAr(type: string): string {
  const map: Record<string, string> = {
    invoice: '\u0641\u0627\u062A\u0648\u0631\u0629',
    payment: '\u062F\u0641\u0639\u0629',
    refund: '\u0627\u0633\u062A\u0631\u062F\u0627\u062F',
    write_off: '\u0634\u0637\u0628',
    credit_note: '\u0625\u0634\u0639\u0627\u0631 \u062F\u0627\u0626\u0646',
  };
  return map[type] || type;
}

export function renderHouseholdStatementAr(data: unknown, branding: PdfBranding): string {
  const stmt = data as HouseholdStatementData;
  const primaryColor = branding.primary_color || '#1e40af';

  const entryRows = stmt.entries
    .map(
      (e) => `
      <tr>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;" dir="ltr">${escapeHtml(e.date)}</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${formatTypeAr(e.type)}</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;" dir="ltr">${escapeHtml(e.reference)}</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(e.description)}</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 12px;" dir="ltr">${e.debit !== null ? formatCurrency(e.debit, stmt.currency_code) : ''}</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 12px; color: #16a34a;" dir="ltr">${e.credit !== null ? formatCurrency(e.credit, stmt.currency_code) : ''}</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 12px; font-weight: 500;" dir="ltr">${formatCurrency(e.running_balance, stmt.currency_code)}</td>
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
    body { font-family: 'Noto Sans Arabic', 'Arial', sans-serif; color: #111827; font-size: 14px; background: white; direction: rtl; }
    @page { size: A4 landscape; margin: 0; }
  </style>
</head>
<body>
  <div style="padding: 0;">
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 24px;">
      <div>
        <h1 style="font-size: 24px; font-weight: 700; color: ${primaryColor};">\u0643\u0634\u0641 \u062D\u0633\u0627\u0628</h1>
        <p style="font-size: 16px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name_ar || branding.school_name)}</p>
      </div>
      ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="\u0627\u0644\u0634\u0639\u0627\u0631" style="height: 60px; max-width: 120px; object-fit: contain;">` : ''}
    </div>

    <!-- Household Info & Date Range -->
    <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
      <div>
        <p style="font-size: 12px; color: #6b7280; font-weight: 600; margin-bottom: 4px;">\u0635\u0627\u062D\u0628 \u0627\u0644\u062D\u0633\u0627\u0628</p>
        <p style="font-size: 14px; font-weight: 600;">${escapeHtml(stmt.household.household_name)}</p>
        ${stmt.household.billing_parent_name ? `<p style="font-size: 13px; color: #374151;">${escapeHtml(stmt.household.billing_parent_name)}</p>` : ''}
      </div>
      <div>
        <table style="font-size: 13px;">
          <tr>
            <td style="padding: 3px 0 3px 12px; color: #6b7280; font-weight: 500;">\u0627\u0644\u0641\u062A\u0631\u0629:</td>
            <td style="padding: 3px 0; font-weight: 500;" dir="ltr">${escapeHtml(stmt.date_from)} &ndash; ${escapeHtml(stmt.date_to)}</td>
          </tr>
          <tr>
            <td style="padding: 3px 0 3px 12px; color: #6b7280; font-weight: 500;">\u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u0627\u0641\u062A\u062A\u0627\u062D\u064A:</td>
            <td style="padding: 3px 0; font-weight: 600;" dir="ltr">${formatCurrency(stmt.opening_balance, stmt.currency_code)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Ledger Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <thead>
        <tr style="background: ${primaryColor}; color: white;">
          <th style="padding: 10px 8px; text-align: right; font-weight: 600; width: 90px;">\u0627\u0644\u062A\u0627\u0631\u064A\u062E</th>
          <th style="padding: 10px 8px; text-align: right; font-weight: 600; width: 90px;">\u0627\u0644\u0646\u0648\u0639</th>
          <th style="padding: 10px 8px; text-align: right; font-weight: 600; width: 120px;">\u0627\u0644\u0645\u0631\u062C\u0639</th>
          <th style="padding: 10px 8px; text-align: right; font-weight: 600;">\u0627\u0644\u0648\u0635\u0641</th>
          <th style="padding: 10px 8px; text-align: left; font-weight: 600; width: 110px;">\u0645\u062F\u064A\u0646</th>
          <th style="padding: 10px 8px; text-align: left; font-weight: 600; width: 110px;">\u062F\u0627\u0626\u0646</th>
          <th style="padding: 10px 8px; text-align: left; font-weight: 600; width: 120px;">\u0627\u0644\u0631\u0635\u064A\u062F</th>
        </tr>
      </thead>
      <tbody>
        ${entryRows}
      </tbody>
    </table>

    <!-- Closing Balance -->
    <div style="display: flex; justify-content: flex-start; margin-top: 16px;">
      <table style="font-size: 14px; min-width: 280px;">
        <tr style="border-top: 2px solid ${primaryColor};">
          <td style="padding: 10px 0 6px 16px; font-weight: 700;">\u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u062E\u062A\u0627\u0645\u064A:</td>
          <td style="padding: 10px 0 6px 0; text-align: left; font-weight: 700; font-size: 16px; color: ${stmt.closing_balance > 0 ? '#dc2626' : '#16a34a'};" dir="ltr">
            ${formatCurrency(stmt.closing_balance, stmt.currency_code)}
          </td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center;">
      <p>${escapeHtml(branding.school_name_ar || branding.school_name)} &mdash; \u0647\u0630\u0627 \u0627\u0644\u0643\u0634\u0641 \u0644\u0623\u063A\u0631\u0627\u0636 \u0625\u0639\u0644\u0627\u0645\u064A\u0629 \u0641\u0642\u0637.</p>
    </div>
  </div>
</body>
</html>`;
}
