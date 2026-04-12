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
  return `${currency} ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return escapeHtml(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatType(type: string): string {
  const map: Record<string, string> = {
    invoice: 'Invoice',
    invoice_issued: 'Invoice',
    payment: 'Payment',
    payment_received: 'Payment',
    allocation: 'Allocation',
    refund: 'Refund',
    write_off: 'Write-off',
    credit_note: 'Credit Note',
  };
  return map[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function renderHouseholdStatementEn(data: unknown, branding: PdfBranding): string {
  const stmt = data as HouseholdStatementData;
  const primaryColor = branding.primary_color || '#1a56db';

  const entryRows = stmt.entries
    .map(
      (e, idx) => `
      <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px; white-space: nowrap;">${formatDate(e.date)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">${formatType(e.type)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px; font-family: 'Courier New', monospace; letter-spacing: -0.3px; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(e.reference)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px; color: #374151;">${escapeHtml(e.description)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 11px; font-family: 'Courier New', monospace;">${e.debit !== null ? formatCurrency(e.debit, stmt.currency_code) : ''}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 11px; font-family: 'Courier New', monospace; color: #059669;">${e.credit !== null ? formatCurrency(e.credit, stmt.currency_code) : ''}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 11px; font-family: 'Courier New', monospace; font-weight: 600;">${formatCurrency(e.running_balance, stmt.currency_code)}</td>
      </tr>`,
    )
    .join('');

  const periodFrom = formatDate(stmt.date_from);
  const periodTo = formatDate(stmt.date_to);

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      color: #111827;
      font-size: 13px;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page { size: A4; margin: 0; }
  </style>
</head>
<body>
  <!-- Header bar -->
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px;">
    <tr>
      <td style="padding: 0;">
        <div style="background: ${primaryColor}; color: white; padding: 20px 24px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="vertical-align: middle;">
                <div style="font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">ACCOUNT STATEMENT</div>
                <div style="font-size: 14px; font-weight: 400; margin-top: 4px; opacity: 0.9;">${escapeHtml(branding.school_name)}</div>
              </td>
              <td style="vertical-align: middle; text-align: right; width: 140px;">
                ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="" style="height: 50px; max-width: 120px; object-fit: contain; border-radius: 4px;" onerror="this.style.display='none'">` : ''}
              </td>
            </tr>
          </table>
        </div>
      </td>
    </tr>
  </table>

  <div style="padding: 0 24px;">
    <!-- Account holder & period info -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr>
        <td style="vertical-align: top; width: 50%;">
          <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 6px;">Account Holder</div>
          <div style="font-size: 15px; font-weight: 700; color: #111827;">${escapeHtml(stmt.household.household_name)}</div>
          ${stmt.household.billing_parent_name ? `<div style="font-size: 12px; color: #4b5563; margin-top: 2px;">c/o ${escapeHtml(stmt.household.billing_parent_name)}</div>` : ''}
        </td>
        <td style="vertical-align: top; text-align: right; width: 50%;">
          <table style="margin-left: auto; border-collapse: collapse;">
            <tr>
              <td style="padding: 3px 16px 3px 0; font-size: 11px; color: #6b7280; font-weight: 500;">Statement Period:</td>
              <td style="padding: 3px 0; font-size: 11px; font-weight: 600;">${periodFrom} &ndash; ${periodTo}</td>
            </tr>
            <tr>
              <td style="padding: 3px 16px 3px 0; font-size: 11px; color: #6b7280; font-weight: 500;">Opening Balance:</td>
              <td style="padding: 3px 0; font-size: 11px; font-weight: 700; font-family: 'Courier New', monospace;">${formatCurrency(stmt.opening_balance, stmt.currency_code)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Ledger Table -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background: ${primaryColor}; color: white;">
          <th style="padding: 10px 12px; text-align: left; font-weight: 600; font-size: 11px; width: 80px;">Date</th>
          <th style="padding: 10px 12px; text-align: left; font-weight: 600; font-size: 11px; width: 72px;">Type</th>
          <th style="padding: 10px 12px; text-align: left; font-weight: 600; font-size: 11px; width: 110px;">Reference</th>
          <th style="padding: 10px 12px; text-align: left; font-weight: 600; font-size: 11px;">Description</th>
          <th style="padding: 10px 12px; text-align: right; font-weight: 600; font-size: 11px; width: 100px;">Debit</th>
          <th style="padding: 10px 12px; text-align: right; font-weight: 600; font-size: 11px; width: 100px;">Credit</th>
          <th style="padding: 10px 12px; text-align: right; font-weight: 600; font-size: 11px; width: 100px;">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${entryRows}
      </tbody>
    </table>

    <!-- Closing Balance -->
    <table style="margin-left: auto; border-collapse: collapse; margin-bottom: 40px;">
      <tr style="border-top: 2px solid ${primaryColor}; border-bottom: 2px solid ${primaryColor};">
        <td style="padding: 12px 24px 12px 16px; font-weight: 700; font-size: 13px;">Closing Balance</td>
        <td style="padding: 12px 16px 12px 24px; text-align: right; font-weight: 700; font-size: 15px; font-family: 'Courier New', monospace; color: ${stmt.closing_balance > 0 ? '#dc2626' : '#059669'};">
          ${formatCurrency(stmt.closing_balance, stmt.currency_code)}
        </td>
      </tr>
    </table>

    <!-- Footer -->
    <div style="padding-top: 16px; border-top: 1px solid #d1d5db; font-size: 10px; color: #9ca3af; text-align: center;">
      ${escapeHtml(branding.school_name)} &mdash; This statement is for informational purposes only.
    </div>
  </div>
</body>
</html>`;
}
