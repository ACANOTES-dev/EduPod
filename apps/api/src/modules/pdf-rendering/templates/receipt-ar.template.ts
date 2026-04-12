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

function formatPaymentMethodAr(method: string): string {
  const map: Record<string, string> = {
    stripe: '\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A (Stripe)',
    cash: '\u0646\u0642\u062F\u064B\u0627',
    bank_transfer: '\u062A\u062D\u0648\u064A\u0644 \u0628\u0646\u0643\u064A',
    card_manual: '\u0628\u0637\u0627\u0642\u0629 (\u064A\u062F\u0648\u064A)',
  };
  return map[method] || method;
}

export function renderReceiptAr(data: unknown, branding: PdfBranding): string {
  const r = data as ReceiptData;
  const dash = '- - - - - - - - - - - - - - - - - - -';
  const doubleDash = '= = = = = = = = = = = = = = = = = = =';

  const allocationRows = r.allocations
    .map(
      (a) => `
      <tr>
        <td style="padding: 2px 0; font-size: 11px;" dir="ltr">${escapeHtml(a.invoice_number)}</td>
        <td style="padding: 2px 0; font-size: 11px; text-align: left; font-family: 'Courier New', monospace;" dir="ltr">${formatCurrency(a.allocated_amount, r.currency_code)}</td>
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
    body {
      font-family: 'Noto Sans Arabic', 'Arial', sans-serif;
      color: #111;
      font-size: 12px;
      background: white;
      direction: rtl;
      width: 80mm;
      margin: 0 auto;
    }
    @page { size: 80mm auto; margin: 4mm; }
    .receipt { padding: 2mm 0; }
    .center { text-align: center; }
    .divider { text-align: center; color: #999; font-size: 10px; margin: 6px 0; letter-spacing: 1px; overflow: hidden; white-space: nowrap; }
    .row { display: flex; justify-content: space-between; padding: 2px 0; }
    .label { color: #555; font-size: 11px; }
    .value { font-size: 11px; }
    .mono { font-family: 'Courier New', monospace; }
    .bold { font-weight: 700; }
    .big { font-size: 16px; }
  </style>
</head>
<body>
  <div class="receipt">
    <!-- School Name -->
    <div class="center" style="margin-bottom: 4px;">
      <div style="font-size: 14px; font-weight: 700;">${escapeHtml(branding.school_name_ar || branding.school_name)}</div>
    </div>

    <!-- Title -->
    <div class="center" style="margin-bottom: 2px;">
      <div style="font-size: 13px; font-weight: 600; letter-spacing: 2px;">\u0625\u064A\u0635\u0627\u0644 \u062F\u0641\u0639</div>
    </div>

    <div class="divider">${dash}</div>

    <!-- Receipt Info -->
    <div class="row">
      <span class="label">\u0631\u0642\u0645 \u0627\u0644\u0625\u064A\u0635\u0627\u0644:</span>
      <span class="value mono" dir="ltr">${escapeHtml(r.receipt_number)}</span>
    </div>
    <div class="row">
      <span class="label">\u0627\u0644\u062A\u0627\u0631\u064A\u062E:</span>
      <span class="value" dir="ltr">${formatDate(r.issued_at)}</span>
    </div>

    <div class="divider">${dash}</div>

    <!-- Household Info -->
    <div class="row">
      <span class="label">\u0627\u0644\u0639\u0627\u0626\u0644\u0629:</span>
      <span class="value">${escapeHtml(r.household.household_name)}</span>
    </div>
    <div class="row">
      <span class="label">\u0631\u0642\u0645 \u0627\u0644\u0639\u0627\u0626\u0644\u0629:</span>
      <span class="value mono" dir="ltr">${escapeHtml(r.household.household_number)}</span>
    </div>
    ${
      r.household.billing_parent_name
        ? `
    <div class="row">
      <span class="label">\u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631:</span>
      <span class="value">${escapeHtml(r.household.billing_parent_name)}</span>
    </div>`
        : ''
    }
    ${
      r.household.billing_parent_phone
        ? `
    <div class="row">
      <span class="label">\u0627\u0644\u0647\u0627\u062A\u0641:</span>
      <span class="value mono" dir="ltr">${escapeHtml(r.household.billing_parent_phone)}</span>
    </div>`
        : ''
    }

    <div class="divider">${dash}</div>

    <!-- Payment Info -->
    <div class="row">
      <span class="label">\u0645\u0631\u062C\u0639 \u0627\u0644\u062F\u0641\u0639:</span>
      <span class="value mono" dir="ltr">${escapeHtml(r.payment.payment_reference)}</span>
    </div>
    <div class="row">
      <span class="label">\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u062F\u0641\u0639:</span>
      <span class="value">${formatPaymentMethodAr(r.payment.payment_method)}</span>
    </div>

    <div class="divider">${doubleDash}</div>

    <!-- Amount Paid -->
    <div class="center" style="padding: 8px 0;">
      <div class="label" style="font-size: 11px; margin-bottom: 4px;">\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u062F\u0641\u0648\u0639</div>
      <div class="mono bold big" dir="ltr">${formatCurrency(r.payment.amount, r.currency_code)}</div>
    </div>

    <div class="divider">${dash}</div>

    <!-- Balance Summary -->
    <div class="row">
      <span class="label">\u0627\u0644\u0631\u0635\u064A\u062F \u0642\u0628\u0644:</span>
      <span class="value mono" dir="ltr">${formatCurrency(r.outstanding_before, r.currency_code)}</span>
    </div>
    <div class="row">
      <span class="label">\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u062F\u0641\u0648\u0639:</span>
      <span class="value mono" dir="ltr">-${formatCurrency(r.payment.amount, r.currency_code)}</span>
    </div>
    <div class="row bold">
      <span class="label bold">\u0627\u0644\u0631\u0635\u064A\u062F \u0628\u0639\u062F:</span>
      <span class="value mono bold" dir="ltr">${formatCurrency(r.remaining_after, r.currency_code)}</span>
    </div>

    ${
      r.allocations.length > 0
        ? `
    <div class="divider">${dash}</div>

    <!-- Allocations -->
    <div class="center" style="margin-bottom: 4px;">
      <span class="label" style="font-size: 10px; letter-spacing: 1px;">\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062A\u0648\u0632\u064A\u0639</span>
    </div>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="text-align: right; font-size: 10px; color: #555; padding: 2px 0; font-weight: 600;">\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629</th>
          <th style="text-align: left; font-size: 10px; color: #555; padding: 2px 0; font-weight: 600;">\u0627\u0644\u0645\u0628\u0644\u063A</th>
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
      <div style="font-size: 11px; color: #333;">\u0634\u0643\u0631\u064B\u0627 \u0644\u062F\u0641\u0639\u0643\u0645</div>
    </div>

    <div class="center" style="font-size: 9px; color: #999; padding-top: 4px;">
      ${escapeHtml(branding.school_name_ar || branding.school_name)}
    </div>
  </div>
</body>
</html>`;
}
