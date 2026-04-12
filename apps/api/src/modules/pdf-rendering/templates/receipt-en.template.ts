import type { PdfBranding } from '../pdf-rendering.service';

interface AllocationData {
  invoice_number: string;
  allocated_amount: number;
}

interface ReceiptData {
  receipt_number: string;
  issued_at: string;
  currency_code: string;
  household: {
    household_name: string;
    household_number: string;
    billing_parent_name: string | null;
    billing_parent_phone: string | null;
  };
  payment: {
    payment_reference: string;
    payment_method: string;
    amount: number;
    received_at: string;
  };
  outstanding_before: number;
  remaining_after: number;
  allocations: AllocationData[];
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

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatPaymentMethod(method: string): string {
  const map: Record<string, string> = {
    stripe: 'Online (Stripe)',
    cash: 'Cash',
    bank_transfer: 'Bank Transfer',
    card_manual: 'Card (Manual)',
  };
  return map[method] || method;
}

export function renderReceiptEn(data: unknown, branding: PdfBranding): string {
  const r = data as ReceiptData;
  const dash = '- - - - - - - - - - - - - - - - - - -';
  const doubleDash = '= = = = = = = = = = = = = = = = = = =';

  const allocationRows = r.allocations
    .map(
      (a) => `
      <tr>
        <td style="padding: 2px 0; font-size: 11px;">${escapeHtml(a.invoice_number)}</td>
        <td style="padding: 2px 0; font-size: 11px; text-align: right; font-family: 'Courier New', monospace;">${formatCurrency(a.allocated_amount, r.currency_code)}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      color: #111;
      font-size: 12px;
      background: white;
      width: 80mm;
      margin: 0 auto;
    }
    @page { size: 80mm auto; margin: 4mm; }
    .receipt { padding: 2mm 0; }
    .center { text-align: center; }
    .divider { text-align: center; color: #999; font-size: 10px; margin: 6px 0; letter-spacing: 1px; overflow: hidden; white-space: nowrap; }
    .row { display: flex; justify-content: space-between; padding: 2px 0; }
    .label { color: #555; font-size: 11px; }
    .value { font-size: 11px; text-align: right; }
    .mono { font-family: 'Courier New', monospace; }
    .bold { font-weight: 700; }
    .big { font-size: 16px; }
  </style>
</head>
<body>
  <div class="receipt">
    <!-- School Name -->
    <div class="center" style="margin-bottom: 4px;">
      <div style="font-size: 14px; font-weight: 700;">${escapeHtml(branding.school_name)}</div>
    </div>

    <!-- Title -->
    <div class="center" style="margin-bottom: 2px;">
      <div style="font-size: 13px; font-weight: 600; letter-spacing: 2px;">PAYMENT RECEIPT</div>
    </div>

    <div class="divider">${dash}</div>

    <!-- Receipt Info -->
    <div class="row">
      <span class="label">Receipt #:</span>
      <span class="value mono">${escapeHtml(r.receipt_number)}</span>
    </div>
    <div class="row">
      <span class="label">Date:</span>
      <span class="value">${formatDate(r.issued_at)}</span>
    </div>

    <div class="divider">${dash}</div>

    <!-- Household Info -->
    <div class="row">
      <span class="label">Household:</span>
      <span class="value">${escapeHtml(r.household.household_name)}</span>
    </div>
    <div class="row">
      <span class="label">Household #:</span>
      <span class="value mono">${escapeHtml(r.household.household_number)}</span>
    </div>
    ${
      r.household.billing_parent_name
        ? `
    <div class="row">
      <span class="label">Billing Parent:</span>
      <span class="value">${escapeHtml(r.household.billing_parent_name)}</span>
    </div>`
        : ''
    }
    ${
      r.household.billing_parent_phone
        ? `
    <div class="row">
      <span class="label">Phone:</span>
      <span class="value mono">${escapeHtml(r.household.billing_parent_phone)}</span>
    </div>`
        : ''
    }

    <div class="divider">${dash}</div>

    <!-- Payment Info -->
    <div class="row">
      <span class="label">Payment Ref:</span>
      <span class="value mono">${escapeHtml(r.payment.payment_reference)}</span>
    </div>
    <div class="row">
      <span class="label">Method:</span>
      <span class="value">${formatPaymentMethod(r.payment.payment_method)}</span>
    </div>

    <div class="divider">${doubleDash}</div>

    <!-- Amount Paid -->
    <div class="center" style="padding: 8px 0;">
      <div class="label" style="font-size: 11px; margin-bottom: 4px;">Amount Paid</div>
      <div class="mono bold big">${formatCurrency(r.payment.amount, r.currency_code)}</div>
    </div>

    <div class="divider">${dash}</div>

    <!-- Balance Summary -->
    <div class="row">
      <span class="label">Balance Before:</span>
      <span class="value mono">${formatCurrency(r.outstanding_before, r.currency_code)}</span>
    </div>
    <div class="row">
      <span class="label">Amount Paid:</span>
      <span class="value mono">-${formatCurrency(r.payment.amount, r.currency_code)}</span>
    </div>
    <div class="row bold">
      <span class="label bold">Balance After:</span>
      <span class="value mono bold">${formatCurrency(r.remaining_after, r.currency_code)}</span>
    </div>

    ${
      r.allocations.length > 0
        ? `
    <div class="divider">${dash}</div>

    <!-- Allocations -->
    <div class="center" style="margin-bottom: 4px;">
      <span class="label" style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Allocations</span>
    </div>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="text-align: left; font-size: 10px; color: #555; padding: 2px 0; font-weight: 600;">Invoice</th>
          <th style="text-align: right; font-size: 10px; color: #555; padding: 2px 0; font-weight: 600;">Applied</th>
        </tr>
      </thead>
      <tbody>
        ${allocationRows}
      </tbody>
    </table>`
        : ''
    }

    <div class="divider">${doubleDash}</div>

    <!-- Footer -->
    <div class="center" style="padding: 6px 0;">
      <div style="font-size: 11px; color: #333;">Thank you for your payment</div>
    </div>

    <div class="center" style="font-size: 9px; color: #999; padding-top: 4px;">
      ${escapeHtml(branding.school_name)}
    </div>
  </div>
</body>
</html>`;
}
