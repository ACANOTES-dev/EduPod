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
  tax_amount: number;
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

function formatStatusAr(status: string): string {
  const map: Record<string, string> = {
    draft: '\u0645\u0633\u0648\u062F\u0629',
    pending_approval: '\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629',
    issued: '\u0635\u0627\u062F\u0631\u0629',
    partially_paid: '\u0645\u062F\u0641\u0648\u0639\u0629 \u062C\u0632\u0626\u064A\u0627\u064B',
    paid: '\u0645\u062F\u0641\u0648\u0639\u0629',
    overdue: '\u0645\u062A\u0623\u062E\u0631\u0629',
    void: '\u0645\u0644\u063A\u0627\u0629',
    cancelled: '\u0645\u0644\u063A\u0627\u0629',
    written_off: '\u0645\u0634\u0637\u0648\u0628\u0629',
  };
  return map[status] || status;
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

export function renderInvoiceAr(data: unknown, branding: PdfBranding): string {
  const inv = data as InvoiceData;
  const primaryColor = branding.primary_color || '#1e40af';

  const lineRows = inv.lines
    .map(
      (line) => `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(line.description)}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;" dir="ltr">${line.quantity}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: left;" dir="ltr">${formatCurrency(line.unit_amount, inv.currency_code)}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-weight: 500;" dir="ltr">${formatCurrency(line.line_total, inv.currency_code)}</td>
      </tr>`,
    )
    .join('');

  const paymentRows =
    inv.payment_allocations.length > 0
      ? inv.payment_allocations
          .map(
            (pa) => `
        <tr>
          <td style="padding: 6px 8px; font-size: 12px; border-bottom: 1px solid #f3f4f6;" dir="ltr">${escapeHtml(pa.payment_reference)}</td>
          <td style="padding: 6px 8px; font-size: 12px; border-bottom: 1px solid #f3f4f6;" dir="ltr">${escapeHtml(pa.received_at)}</td>
          <td style="padding: 6px 8px; font-size: 12px; border-bottom: 1px solid #f3f4f6; text-align: left;" dir="ltr">${formatCurrency(pa.allocated_amount, inv.currency_code)}</td>
        </tr>`,
          )
          .join('')
      : '';

  const paymentSection =
    paymentRows
      ? `
    <div style="margin-top: 24px;">
      <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: ${primaryColor};">\u0633\u062C\u0644 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0627\u062A</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px; text-align: right; font-weight: 600; font-size: 12px;">\u0627\u0644\u0645\u0631\u062C\u0639</th>
            <th style="padding: 8px; text-align: right; font-weight: 600; font-size: 12px;">\u0627\u0644\u062A\u0627\u0631\u064A\u062E</th>
            <th style="padding: 8px; text-align: left; font-weight: 600; font-size: 12px;">\u0627\u0644\u0645\u0628\u0644\u063A</th>
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
        <h1 style="font-size: 28px; font-weight: 700; color: ${primaryColor}; letter-spacing: -0.5px;">\u0641\u0627\u062A\u0648\u0631\u0629</h1>
        <p style="font-size: 16px; font-weight: 600; margin-top: 4px;">${escapeHtml(branding.school_name_ar || branding.school_name)}</p>
      </div>
      ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="\u0627\u0644\u0634\u0639\u0627\u0631" style="height: 60px; max-width: 120px; object-fit: contain;">` : ''}
    </div>

    <!-- Invoice Meta + Billing Info -->
    <div style="display: flex; justify-content: space-between; margin-bottom: 28px;">
      <div>
        <p style="font-size: 12px; color: #6b7280; font-weight: 600; margin-bottom: 4px;">\u0641\u0627\u062A\u0648\u0631\u0629 \u0625\u0644\u0649</p>
        <p style="font-size: 14px; font-weight: 600;">${escapeHtml(inv.household.household_name)}</p>
        ${inv.household.billing_parent_name ? `<p style="font-size: 13px; color: #374151;">\u0639\u0646\u0627\u064A\u0629: ${escapeHtml(inv.household.billing_parent_name)}</p>` : ''}
        ${addressLines ? `<p style="font-size: 13px; color: #374151; line-height: 1.8; margin-top: 4px;">${addressLines}</p>` : ''}
      </div>
      <div>
        <table style="font-size: 13px;">
          <tr>
            <td style="padding: 3px 0 3px 12px; color: #6b7280; font-weight: 500;">\u0631\u0642\u0645 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629:</td>
            <td style="padding: 3px 0; font-weight: 600;" dir="ltr">${escapeHtml(inv.invoice_number)}</td>
          </tr>
          ${inv.issue_date ? `<tr><td style="padding: 3px 0 3px 12px; color: #6b7280; font-weight: 500;">\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0625\u0635\u062F\u0627\u0631:</td><td style="padding: 3px 0;" dir="ltr">${escapeHtml(inv.issue_date)}</td></tr>` : ''}
          <tr>
            <td style="padding: 3px 0 3px 12px; color: #6b7280; font-weight: 500;">\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642:</td>
            <td style="padding: 3px 0;" dir="ltr">${escapeHtml(inv.due_date)}</td>
          </tr>
          <tr>
            <td style="padding: 3px 0 3px 12px; color: #6b7280; font-weight: 500;">\u0627\u0644\u062D\u0627\u0644\u0629:</td>
            <td style="padding: 3px 0;"><span style="color: ${statusColor(inv.status)}; font-weight: 600;">${formatStatusAr(inv.status)}</span></td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Line Items -->
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <thead>
        <tr style="background: ${primaryColor}; color: white;">
          <th style="padding: 10px 8px; text-align: right; font-weight: 600;">\u0627\u0644\u0648\u0635\u0641</th>
          <th style="padding: 10px 8px; text-align: center; font-weight: 600; width: 80px;">\u0627\u0644\u0643\u0645\u064A\u0629</th>
          <th style="padding: 10px 8px; text-align: left; font-weight: 600; width: 120px;">\u0633\u0639\u0631 \u0627\u0644\u0648\u062D\u062F\u0629</th>
          <th style="padding: 10px 8px; text-align: left; font-weight: 600; width: 120px;">\u0627\u0644\u0645\u0628\u0644\u063A</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>

    <!-- Totals -->
    <div style="display: flex; justify-content: flex-start; margin-top: 16px;">
      <table style="font-size: 13px; min-width: 280px;">
        <tr>
          <td style="padding: 6px 0 6px 16px; color: #6b7280;">\u0627\u0644\u0645\u062C\u0645\u0648\u0639 \u0627\u0644\u0641\u0631\u0639\u064A:</td>
          <td style="padding: 6px 0; text-align: left;" dir="ltr">${formatCurrency(inv.subtotal_amount, inv.currency_code)}</td>
        </tr>
        ${inv.discount_amount > 0 ? `<tr><td style="padding: 6px 0 6px 16px; color: #6b7280;">\u0627\u0644\u062E\u0635\u0645:</td><td style="padding: 6px 0; text-align: left; color: #16a34a;" dir="ltr">-${formatCurrency(inv.discount_amount, inv.currency_code)}</td></tr>` : ''}
        ${inv.tax_amount > 0 ? `<tr><td style="padding: 6px 0 6px 16px; color: #6b7280;">\u0627\u0644\u0636\u0631\u064A\u0628\u0629:</td><td style="padding: 6px 0; text-align: left;" dir="ltr">${formatCurrency(inv.tax_amount, inv.currency_code)}</td></tr>` : ''}
        <tr style="border-top: 2px solid ${primaryColor};">
          <td style="padding: 10px 0 6px 16px; font-weight: 700; font-size: 15px;">\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A:</td>
          <td style="padding: 10px 0 6px 0; text-align: left; font-weight: 700; font-size: 15px;" dir="ltr">${formatCurrency(inv.total_amount, inv.currency_code)}</td>
        </tr>
        ${inv.amount_paid > 0 ? `<tr><td style="padding: 6px 0 6px 16px; color: #6b7280;">\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u062F\u0641\u0648\u0639:</td><td style="padding: 6px 0; text-align: left; color: #16a34a;" dir="ltr">${formatCurrency(inv.amount_paid, inv.currency_code)}</td></tr>` : ''}
        ${inv.balance_amount > 0 ? `<tr><td style="padding: 6px 0 6px 16px; font-weight: 600; color: #dc2626;">\u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u0645\u0633\u062A\u062D\u0642:</td><td style="padding: 6px 0; text-align: left; font-weight: 600; color: #dc2626;" dir="ltr">${formatCurrency(inv.balance_amount, inv.currency_code)}</td></tr>` : ''}
      </table>
    </div>

    ${paymentSection}

    <!-- Footer -->
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center;">
      <p>${escapeHtml(branding.school_name_ar || branding.school_name)} &mdash; \u0634\u0643\u0631\u0627\u064B \u0644\u0633\u062F\u0627\u062F\u0643\u0645 \u0641\u064A \u0627\u0644\u0645\u0648\u0639\u062F.</p>
    </div>
  </div>
</body>
</html>`;
}
