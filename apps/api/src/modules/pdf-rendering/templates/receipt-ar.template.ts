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
    billing_parent_name: string | null;
  };
  payment: {
    payment_reference: string;
    payment_method: string;
    amount: number;
    received_at: string;
  };
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
  const primaryColor = branding.primary_color || '#1e40af';

  const allocationRows = r.allocations
    .map(
      (a) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;" dir="ltr">${escapeHtml(a.invoice_number)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: left;" dir="ltr">${formatCurrency(a.allocated_amount, r.currency_code)}</td>
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
    @page { size: A4; margin: 0; }
  </style>
</head>
<body>
  <div style="padding: 0;">
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 24px;">
      <div>
        <h1 style="font-size: 28px; font-weight: 700; color: ${primaryColor}; letter-spacing: -0.5px;">\u0625\u064A\u0635\u0627\u0644</h1>
        <p style="font-size: 16px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name_ar || branding.school_name)}</p>
      </div>
      ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="\u0627\u0644\u0634\u0639\u0627\u0631" style="height: 60px; max-width: 120px; object-fit: contain;">` : ''}
    </div>

    <!-- Receipt Info -->
    <div style="display: flex; justify-content: space-between; margin-bottom: 28px;">
      <div>
        <p style="font-size: 12px; color: #6b7280; font-weight: 600; margin-bottom: 4px;">\u0645\u0633\u062A\u0644\u0645 \u0645\u0646</p>
        <p style="font-size: 14px; font-weight: 600;">${escapeHtml(r.household.household_name)}</p>
        ${r.household.billing_parent_name ? `<p style="font-size: 13px; color: #374151;">${escapeHtml(r.household.billing_parent_name)}</p>` : ''}
      </div>
      <div>
        <table style="font-size: 13px;">
          <tr>
            <td style="padding: 3px 0 3px 12px; color: #6b7280; font-weight: 500;">\u0631\u0642\u0645 \u0627\u0644\u0625\u064A\u0635\u0627\u0644:</td>
            <td style="padding: 3px 0; font-weight: 600;" dir="ltr">${escapeHtml(r.receipt_number)}</td>
          </tr>
          <tr>
            <td style="padding: 3px 0 3px 12px; color: #6b7280; font-weight: 500;">\u0627\u0644\u062A\u0627\u0631\u064A\u062E:</td>
            <td style="padding: 3px 0;" dir="ltr">${escapeHtml(r.issued_at)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Payment Details -->
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; margin-bottom: 24px;">
      <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 12px; color: ${primaryColor};">\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062F\u0641\u0639</h3>
      <table style="width: 100%; font-size: 13px;">
        <tr>
          <td style="padding: 4px 0; color: #6b7280; width: 160px;">\u0645\u0631\u062C\u0639 \u0627\u0644\u062F\u0641\u0639:</td>
          <td style="padding: 4px 0; font-weight: 500;" dir="ltr">${escapeHtml(r.payment.payment_reference)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u062F\u0641\u0639:</td>
          <td style="padding: 4px 0; font-weight: 500;">${formatPaymentMethodAr(r.payment.payment_method)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0633\u062A\u0644\u0627\u0645:</td>
          <td style="padding: 4px 0; font-weight: 500;" dir="ltr">${escapeHtml(r.payment.received_at)}</td>
        </tr>
      </table>
    </div>

    <!-- Allocation Details -->
    ${r.allocations.length > 0 ? `
    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: ${primaryColor};">\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062A\u0648\u0632\u064A\u0639</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px; text-align: right; font-weight: 600; font-size: 12px;">\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629</th>
            <th style="padding: 8px; text-align: left; font-weight: 600; font-size: 12px;">\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u0637\u0628\u0642</th>
          </tr>
        </thead>
        <tbody>
          ${allocationRows}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Total -->
    <div style="display: flex; justify-content: flex-start; margin-top: 16px;">
      <div style="background: ${primaryColor}; color: white; padding: 16px 24px; border-radius: 6px; min-width: 260px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 14px; font-weight: 600;">\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u0633\u062A\u0644\u0645</span>
          <span style="font-size: 18px; font-weight: 700; margin-right: 24px;" dir="ltr">${formatCurrency(r.payment.amount, r.currency_code)}</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center;">
      <p>${escapeHtml(branding.school_name_ar || branding.school_name)} &mdash; \u0647\u0630\u0627 \u0625\u064A\u0635\u0627\u0644 \u0631\u0633\u0645\u064A \u0628\u0627\u0644\u062F\u0641\u0639.</p>
    </div>
  </div>
</body>
</html>`;
}
