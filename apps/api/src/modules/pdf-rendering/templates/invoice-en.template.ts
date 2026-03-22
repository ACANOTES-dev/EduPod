import type { PdfBranding } from '../pdf-rendering.service';

interface InvoiceLineData {
  description: string;
  quantity: number;
  unit_amount: number;
  line_total: number;
}

interface PaymentAllocationData {
  payment_reference: string;
  allocated_amount: number;
  received_at: string;
}

interface InvoiceData {
  invoice_number: string;
  status: string;
  issue_date: string | null;
  due_date: string;
  currency_code: string;
  household: {
    household_name: string;
    billing_parent_name: string | null;
    address_line_1: string | null;
    address_line_2: string | null;
    city: string | null;
    country: string | null;
    postal_code: string | null;
  };
  lines: InvoiceLineData[];
  subtotal_amount: number;
  discount_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_amount: number;
  payment_allocations: PaymentAllocationData[];
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

function formatStatus(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function statusColor(status: string): string {
  switch (status) {
    case 'paid':
      return '#16a34a';
    case 'overdue':
      return '#dc2626';
    case 'void':
    case 'cancelled':
      return '#6b7280';
    case 'partially_paid':
      return '#d97706';
    default:
      return '#2563eb';
  }
}

export function renderInvoiceEn(data: unknown, branding: PdfBranding): string {
  const inv = data as InvoiceData;
  const primaryColor = branding.primary_color || '#1e40af';

  const lineRows = inv.lines
    .map(
      (line) => `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(line.description)}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${line.quantity}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(line.unit_amount, inv.currency_code)}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 500;">${formatCurrency(line.line_total, inv.currency_code)}</td>
      </tr>`,
    )
    .join('');

  const paymentRows =
    inv.payment_allocations.length > 0
      ? inv.payment_allocations
          .map(
            (pa) => `
        <tr>
          <td style="padding: 6px 8px; font-size: 12px; border-bottom: 1px solid #f3f4f6;">${escapeHtml(pa.payment_reference)}</td>
          <td style="padding: 6px 8px; font-size: 12px; border-bottom: 1px solid #f3f4f6;">${escapeHtml(pa.received_at)}</td>
          <td style="padding: 6px 8px; font-size: 12px; border-bottom: 1px solid #f3f4f6; text-align: right;">${formatCurrency(pa.allocated_amount, inv.currency_code)}</td>
        </tr>`,
          )
          .join('')
      : '';

  const paymentSection =
    paymentRows
      ? `
    <div style="margin-top: 24px;">
      <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: ${primaryColor};">Payment History</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px; text-align: left; font-weight: 600; font-size: 12px;">Reference</th>
            <th style="padding: 8px; text-align: left; font-weight: 600; font-size: 12px;">Date</th>
            <th style="padding: 8px; text-align: right; font-weight: 600; font-size: 12px;">Amount</th>
          </tr>
        </thead>
        <tbody>${paymentRows}</tbody>
      </table>
    </div>`
      : '';

  const addressLines = [
    inv.household.address_line_1,
    inv.household.address_line_2,
    [inv.household.city, inv.household.postal_code].filter(Boolean).join(' '),
    inv.household.country,
  ]
    .filter(Boolean)
    .map((line) => escapeHtml(line))
    .join('<br>');

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
        <h1 style="font-size: 28px; font-weight: 700; color: ${primaryColor}; letter-spacing: -0.5px;">INVOICE</h1>
        <p style="font-size: 16px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name)}</p>
      </div>
      ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="Logo" style="height: 60px; max-width: 120px; object-fit: contain;">` : ''}
    </div>

    <!-- Invoice Meta + Billing Info -->
    <div style="display: flex; justify-content: space-between; margin-bottom: 28px;">
      <div>
        <p style="font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">Bill To</p>
        <p style="font-size: 14px; font-weight: 600;">${escapeHtml(inv.household.household_name)}</p>
        ${inv.household.billing_parent_name ? `<p style="font-size: 13px; color: #374151;">Attn: ${escapeHtml(inv.household.billing_parent_name)}</p>` : ''}
        ${addressLines ? `<p style="font-size: 13px; color: #374151; line-height: 1.5; margin-top: 4px;">${addressLines}</p>` : ''}
      </div>
      <div style="text-align: right;">
        <table style="font-size: 13px; margin-left: auto;">
          <tr>
            <td style="padding: 3px 12px 3px 0; color: #6b7280; font-weight: 500;">Invoice #:</td>
            <td style="padding: 3px 0; font-weight: 600;">${escapeHtml(inv.invoice_number)}</td>
          </tr>
          ${inv.issue_date ? `<tr><td style="padding: 3px 12px 3px 0; color: #6b7280; font-weight: 500;">Issue Date:</td><td style="padding: 3px 0;">${escapeHtml(inv.issue_date)}</td></tr>` : ''}
          <tr>
            <td style="padding: 3px 12px 3px 0; color: #6b7280; font-weight: 500;">Due Date:</td>
            <td style="padding: 3px 0;">${escapeHtml(inv.due_date)}</td>
          </tr>
          <tr>
            <td style="padding: 3px 12px 3px 0; color: #6b7280; font-weight: 500;">Status:</td>
            <td style="padding: 3px 0;"><span style="color: ${statusColor(inv.status)}; font-weight: 600;">${formatStatus(inv.status)}</span></td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Line Items -->
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <thead>
        <tr style="background: ${primaryColor}; color: white;">
          <th style="padding: 10px 8px; text-align: left; font-weight: 600;">Description</th>
          <th style="padding: 10px 8px; text-align: center; font-weight: 600; width: 80px;">Qty</th>
          <th style="padding: 10px 8px; text-align: right; font-weight: 600; width: 120px;">Unit Price</th>
          <th style="padding: 10px 8px; text-align: right; font-weight: 600; width: 120px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>

    <!-- Totals -->
    <div style="display: flex; justify-content: flex-end; margin-top: 16px;">
      <table style="font-size: 13px; min-width: 280px;">
        <tr>
          <td style="padding: 6px 16px 6px 0; color: #6b7280;">Subtotal:</td>
          <td style="padding: 6px 0; text-align: right;">${formatCurrency(inv.subtotal_amount, inv.currency_code)}</td>
        </tr>
        ${inv.discount_amount > 0 ? `<tr><td style="padding: 6px 16px 6px 0; color: #6b7280;">Discount:</td><td style="padding: 6px 0; text-align: right; color: #16a34a;">-${formatCurrency(inv.discount_amount, inv.currency_code)}</td></tr>` : ''}
        <tr style="border-top: 2px solid ${primaryColor};">
          <td style="padding: 10px 16px 6px 0; font-weight: 700; font-size: 15px;">Total:</td>
          <td style="padding: 10px 0 6px 0; text-align: right; font-weight: 700; font-size: 15px;">${formatCurrency(inv.total_amount, inv.currency_code)}</td>
        </tr>
        ${inv.amount_paid > 0 ? `<tr><td style="padding: 6px 16px 6px 0; color: #6b7280;">Amount Paid:</td><td style="padding: 6px 0; text-align: right; color: #16a34a;">${formatCurrency(inv.amount_paid, inv.currency_code)}</td></tr>` : ''}
        ${inv.balance_amount > 0 ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: 600; color: #dc2626;">Balance Due:</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #dc2626;">${formatCurrency(inv.balance_amount, inv.currency_code)}</td></tr>` : ''}
      </table>
    </div>

    ${paymentSection}

    <!-- Footer -->
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center;">
      <p>${escapeHtml(branding.school_name)} &mdash; Thank you for your prompt payment.</p>
    </div>
  </div>
</body>
</html>`;
}
