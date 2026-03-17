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

function formatType(type: string): string {
  const map: Record<string, string> = {
    invoice: 'Invoice',
    payment: 'Payment',
    refund: 'Refund',
    write_off: 'Write-off',
    credit_note: 'Credit Note',
  };
  return map[type] || type;
}

export function renderHouseholdStatementEn(data: unknown, branding: PdfBranding): string {
  const stmt = data as HouseholdStatementData;
  const primaryColor = branding.primary_color || '#1e40af';

  const entryRows = stmt.entries
    .map(
      (e) => `
      <tr>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(e.date)}</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${formatType(e.type)}</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(e.reference)}</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${escapeHtml(e.description)}</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 12px;">${e.debit !== null ? formatCurrency(e.debit, stmt.currency_code) : ''}</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 12px; color: #16a34a;">${e.credit !== null ? formatCurrency(e.credit, stmt.currency_code) : ''}</td>
        <td style="padding: 7px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 12px; font-weight: 500;">${formatCurrency(e.running_balance, stmt.currency_code)}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111827; font-size: 14px; background: white; }
    @page { size: A4 landscape; margin: 0; }
  </style>
</head>
<body>
  <div style="padding: 0;">
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 24px;">
      <div>
        <h1 style="font-size: 24px; font-weight: 700; color: ${primaryColor};">ACCOUNT STATEMENT</h1>
        <p style="font-size: 16px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name)}</p>
      </div>
      ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="Logo" style="height: 60px; max-width: 120px; object-fit: contain;">` : ''}
    </div>

    <!-- Household Info & Date Range -->
    <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
      <div>
        <p style="font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">Account Holder</p>
        <p style="font-size: 14px; font-weight: 600;">${escapeHtml(stmt.household.household_name)}</p>
        ${stmt.household.billing_parent_name ? `<p style="font-size: 13px; color: #374151;">${escapeHtml(stmt.household.billing_parent_name)}</p>` : ''}
      </div>
      <div style="text-align: right;">
        <table style="font-size: 13px; margin-left: auto;">
          <tr>
            <td style="padding: 3px 12px 3px 0; color: #6b7280; font-weight: 500;">Period:</td>
            <td style="padding: 3px 0; font-weight: 500;">${escapeHtml(stmt.date_from)} &ndash; ${escapeHtml(stmt.date_to)}</td>
          </tr>
          <tr>
            <td style="padding: 3px 12px 3px 0; color: #6b7280; font-weight: 500;">Opening Balance:</td>
            <td style="padding: 3px 0; font-weight: 600;">${formatCurrency(stmt.opening_balance, stmt.currency_code)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Ledger Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <thead>
        <tr style="background: ${primaryColor}; color: white;">
          <th style="padding: 10px 8px; text-align: left; font-weight: 600; width: 90px;">Date</th>
          <th style="padding: 10px 8px; text-align: left; font-weight: 600; width: 90px;">Type</th>
          <th style="padding: 10px 8px; text-align: left; font-weight: 600; width: 120px;">Reference</th>
          <th style="padding: 10px 8px; text-align: left; font-weight: 600;">Description</th>
          <th style="padding: 10px 8px; text-align: right; font-weight: 600; width: 110px;">Debit</th>
          <th style="padding: 10px 8px; text-align: right; font-weight: 600; width: 110px;">Credit</th>
          <th style="padding: 10px 8px; text-align: right; font-weight: 600; width: 120px;">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${entryRows}
      </tbody>
    </table>

    <!-- Closing Balance -->
    <div style="display: flex; justify-content: flex-end; margin-top: 16px;">
      <table style="font-size: 14px; min-width: 280px;">
        <tr style="border-top: 2px solid ${primaryColor};">
          <td style="padding: 10px 16px 6px 0; font-weight: 700;">Closing Balance:</td>
          <td style="padding: 10px 0 6px 0; text-align: right; font-weight: 700; font-size: 16px; color: ${stmt.closing_balance > 0 ? '#dc2626' : '#16a34a'};">
            ${formatCurrency(stmt.closing_balance, stmt.currency_code)}
          </td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center;">
      <p>${escapeHtml(branding.school_name)} &mdash; This statement is for informational purposes only.</p>
    </div>
  </div>
</body>
</html>`;
}
