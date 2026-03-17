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
  const primaryColor = branding.primary_color || '#1e40af';

  const allocationRows = r.allocations
    .map(
      (a) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(a.invoice_number)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(a.allocated_amount, r.currency_code)}</td>
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
    @page { size: A4; margin: 0; }
  </style>
</head>
<body>
  <div style="padding: 0;">
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 24px;">
      <div>
        <h1 style="font-size: 28px; font-weight: 700; color: ${primaryColor}; letter-spacing: -0.5px;">RECEIPT</h1>
        <p style="font-size: 16px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name)}</p>
      </div>
      ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="Logo" style="height: 60px; max-width: 120px; object-fit: contain;">` : ''}
    </div>

    <!-- Receipt Info -->
    <div style="display: flex; justify-content: space-between; margin-bottom: 28px;">
      <div>
        <p style="font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">Received From</p>
        <p style="font-size: 14px; font-weight: 600;">${escapeHtml(r.household.household_name)}</p>
        ${r.household.billing_parent_name ? `<p style="font-size: 13px; color: #374151;">${escapeHtml(r.household.billing_parent_name)}</p>` : ''}
      </div>
      <div style="text-align: right;">
        <table style="font-size: 13px; margin-left: auto;">
          <tr>
            <td style="padding: 3px 12px 3px 0; color: #6b7280; font-weight: 500;">Receipt #:</td>
            <td style="padding: 3px 0; font-weight: 600;">${escapeHtml(r.receipt_number)}</td>
          </tr>
          <tr>
            <td style="padding: 3px 12px 3px 0; color: #6b7280; font-weight: 500;">Date:</td>
            <td style="padding: 3px 0;">${escapeHtml(r.issued_at)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Payment Details -->
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; margin-bottom: 24px;">
      <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 12px; color: ${primaryColor};">Payment Details</h3>
      <table style="width: 100%; font-size: 13px;">
        <tr>
          <td style="padding: 4px 0; color: #6b7280; width: 160px;">Payment Reference:</td>
          <td style="padding: 4px 0; font-weight: 500;">${escapeHtml(r.payment.payment_reference)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">Payment Method:</td>
          <td style="padding: 4px 0; font-weight: 500;">${formatPaymentMethod(r.payment.payment_method)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">Date Received:</td>
          <td style="padding: 4px 0; font-weight: 500;">${escapeHtml(r.payment.received_at)}</td>
        </tr>
      </table>
    </div>

    <!-- Allocation Details -->
    ${r.allocations.length > 0 ? `
    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: ${primaryColor};">Allocation Details</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px; text-align: left; font-weight: 600; font-size: 12px;">Invoice</th>
            <th style="padding: 8px; text-align: right; font-weight: 600; font-size: 12px;">Amount Applied</th>
          </tr>
        </thead>
        <tbody>
          ${allocationRows}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Total -->
    <div style="display: flex; justify-content: flex-end; margin-top: 16px;">
      <div style="background: ${primaryColor}; color: white; padding: 16px 24px; border-radius: 6px; min-width: 260px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 14px; font-weight: 600;">Total Amount Received</span>
          <span style="font-size: 18px; font-weight: 700; margin-left: 24px;">${formatCurrency(r.payment.amount, r.currency_code)}</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center;">
      <p>${escapeHtml(branding.school_name)} &mdash; This is an official receipt of payment.</p>
    </div>
  </div>
</body>
</html>`;
}
