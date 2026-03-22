/**
 * PDF Template Snapshot Tests — Phase 9
 *
 * Renders every PDF template (6 types × 2 locales = 12 variants) with
 * deterministic seed data and compares the HTML output against stored
 * snapshots. CI fails on unexpected changes.
 *
 * We test HTML output (not binary PDF) because:
 *   1. HTML rendering is deterministic — no font rasterisation variance
 *   2. Snapshots are human-readable diffs
 *   3. No Puppeteer/Chromium required for snapshot comparison
 */

import { renderInvoiceEn } from '../src/modules/pdf-rendering/templates/invoice-en.template';
import { renderInvoiceAr } from '../src/modules/pdf-rendering/templates/invoice-ar.template';
import { renderReceiptEn } from '../src/modules/pdf-rendering/templates/receipt-en.template';
import { renderReceiptAr } from '../src/modules/pdf-rendering/templates/receipt-ar.template';
import { renderPayslipEn } from '../src/modules/pdf-rendering/templates/payslip-en.template';
import { renderPayslipAr } from '../src/modules/pdf-rendering/templates/payslip-ar.template';
import { renderReportCardEn } from '../src/modules/pdf-rendering/templates/report-card-en.template';
import { renderReportCardAr } from '../src/modules/pdf-rendering/templates/report-card-ar.template';
import { renderTranscriptEn } from '../src/modules/pdf-rendering/templates/transcript-en.template';
import { renderTranscriptAr } from '../src/modules/pdf-rendering/templates/transcript-ar.template';
import { renderHouseholdStatementEn } from '../src/modules/pdf-rendering/templates/household-statement-en.template';
import { renderHouseholdStatementAr } from '../src/modules/pdf-rendering/templates/household-statement-ar.template';

// ─── Deterministic test data ────────────────────────────────────────────────

const BRANDING = {
  school_name: 'Al Noor International School',
  school_name_ar: 'مدرسة النور الدولية',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#047857',
  report_card_title: 'Student Report Card',
};

const INVOICE_DATA = {
  invoice_number: 'INV-202603-0001',
  status: 'issued',
  issue_date: '2026-03-01',
  due_date: '2026-03-31',
  currency_code: 'AED',
  household: {
    household_name: 'Al-Rashid Family',
    billing_parent_name: 'Ahmed Al-Rashid',
    address_line_1: '123 Palm Jumeirah',
    address_line_2: 'Apt 4B',
    city: 'Dubai',
    country: 'UAE',
    postal_code: '12345',
  },
  lines: [
    {
      description: 'Tuition Fee — Term 1',
      quantity: 1,
      unit_amount: 15000.0,
      line_total: 15000.0,
    },
    {
      description: 'Activity Fee — Term 1',
      quantity: 1,
      unit_amount: 2000.0,
      line_total: 2000.0,
    },
  ],
  subtotal_amount: 17000.0,
  discount_amount: 500.0,
  total_amount: 16500.0,
  amount_paid: 0.0,
  balance_amount: 16500.0,
  payment_allocations: [],
};

/**
 * Receipt template expects:
 *   - receipt_number, issued_at, currency_code (top-level)
 *   - household: { household_name, billing_parent_name }
 *   - payment: { payment_reference, payment_method, amount, received_at }
 *   - allocations: Array<{ invoice_number, allocated_amount }>
 */
const RECEIPT_DATA = {
  receipt_number: 'REC-202603-0001',
  issued_at: '2026-03-15',
  currency_code: 'AED',
  household: {
    household_name: 'Al-Rashid Family',
    billing_parent_name: 'Ahmed Al-Rashid',
  },
  payment: {
    payment_reference: 'PAY-202603-0001',
    payment_method: 'bank_transfer',
    amount: 16500.0,
    received_at: '2026-03-15',
  },
  allocations: [
    {
      invoice_number: 'INV-202603-0001',
      allocated_amount: 16500.0,
    },
  ],
};

/**
 * Payslip template expects:
 *   - payslip_number (top-level)
 *   - staff: { full_name, staff_number, department, job_title, employment_type,
 *              bank_name, bank_account_last4, bank_iban_last4 }
 *   - period: { label, month, year, total_working_days }
 *   - compensation: { type, base_salary, per_class_rate, assigned_class_count,
 *                      bonus_class_rate, bonus_day_multiplier }
 *   - inputs: { days_worked, classes_taught }
 *   - calculations: { basic_pay, bonus_pay, total_pay }
 *   - school: { name, name_ar, logo_url, currency_code }
 */
const PAYSLIP_DATA = {
  payslip_number: 'PSL-202603-0001',
  staff: {
    full_name: 'Sarah Johnson',
    staff_number: 'EMP-001',
    department: 'Mathematics',
    job_title: 'Senior Teacher',
    employment_type: 'full_time',
    bank_name: 'Emirates NBD',
    bank_account_last4: '3456',
    bank_iban_last4: '7890',
  },
  period: {
    label: 'March 2026',
    month: 3,
    year: 2026,
    total_working_days: 22,
  },
  compensation: {
    type: 'salaried' as const,
    base_salary: 12000.0,
    per_class_rate: null,
    assigned_class_count: null,
    bonus_class_rate: null,
    bonus_day_multiplier: null,
  },
  inputs: {
    days_worked: 22,
    classes_taught: null,
  },
  calculations: {
    basic_pay: 12000.0,
    bonus_pay: 0.0,
    total_pay: 12000.0,
  },
  school: {
    name: 'Al Noor International School',
    name_ar: 'مدرسة النور الدولية',
    logo_url: 'https://example.com/logo.png',
    currency_code: 'AED',
  },
};

/**
 * Report Card template expects:
 *   - student: { full_name, student_number, year_group, class_homeroom }
 *   - period: { name, academic_year, start_date, end_date }
 *   - subjects: Array<{
 *       subject_name, subject_code, computed_value, display_value,
 *       overridden_value,
 *       assessments: Array<{ title, category, max_score, raw_score, is_missing }>
 *     }>
 *   - attendance_summary?: { total_days, present_days, absent_days, late_days }
 *   - teacher_comment, principal_comment
 */
const REPORT_CARD_DATA = {
  student: {
    full_name: 'Fatima Al-Rashid',
    student_number: 'ENR-2026-0042',
    year_group: 'Year 9',
    class_homeroom: '9A',
  },
  period: {
    name: 'Term 1',
    academic_year: '2025-2026',
    start_date: '2025-09-01',
    end_date: '2025-12-15',
  },
  subjects: [
    {
      subject_name: 'Mathematics',
      subject_code: 'MATH9',
      computed_value: 92,
      display_value: 'A',
      overridden_value: null,
      assessments: [
        {
          title: 'Mid-Term Exam',
          category: 'exam',
          max_score: 100,
          raw_score: 94,
          is_missing: false,
        },
        {
          title: 'Homework Average',
          category: 'homework',
          max_score: 100,
          raw_score: 90,
          is_missing: false,
        },
      ],
    },
    {
      subject_name: 'English Language',
      subject_code: 'ENG9',
      computed_value: 87,
      display_value: 'B+',
      overridden_value: null,
      assessments: [
        {
          title: 'Essay Assignment',
          category: 'coursework',
          max_score: 50,
          raw_score: 44,
          is_missing: false,
        },
        {
          title: 'Oral Presentation',
          category: 'presentation',
          max_score: 50,
          raw_score: 42,
          is_missing: false,
        },
      ],
    },
    {
      subject_name: 'Science',
      subject_code: 'SCI9',
      computed_value: 90,
      display_value: 'A-',
      overridden_value: null,
      assessments: [
        {
          title: 'Lab Report',
          category: 'lab',
          max_score: 100,
          raw_score: 92,
          is_missing: false,
        },
        {
          title: 'Theory Test',
          category: 'exam',
          max_score: 100,
          raw_score: 88,
          is_missing: false,
        },
      ],
    },
  ],
  attendance_summary: {
    total_days: 65,
    present_days: 62,
    absent_days: 2,
    late_days: 1,
  },
  teacher_comment:
    'Fatima is a dedicated and hardworking student who consistently achieves high standards.',
  principal_comment: null,
};

/**
 * Transcript template expects:
 *   - student: { id, full_name, student_number, year_group }
 *   - years: Array<{
 *       academic_year,
 *       periods: Array<{
 *         period_name,
 *         subjects: Array<{
 *           subject_name, subject_code, computed_value,
 *           display_value, overridden_value
 *         }>
 *       }>
 *     }>
 */
const TRANSCRIPT_DATA = {
  student: {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    full_name: 'Fatima Al-Rashid',
    student_number: 'ENR-2026-0042',
    year_group: 'Year 9',
  },
  years: [
    {
      academic_year: '2024-2025',
      periods: [
        {
          period_name: 'Term 1',
          subjects: [
            {
              subject_name: 'Mathematics',
              subject_code: 'MATH8',
              computed_value: 89,
              display_value: 'A-',
              overridden_value: null,
            },
            {
              subject_name: 'English',
              subject_code: 'ENG8',
              computed_value: 85,
              display_value: 'B+',
              overridden_value: null,
            },
            {
              subject_name: 'Science',
              subject_code: 'SCI8',
              computed_value: 93,
              display_value: 'A',
              overridden_value: null,
            },
          ],
        },
        {
          period_name: 'Term 2',
          subjects: [
            {
              subject_name: 'Mathematics',
              subject_code: 'MATH8',
              computed_value: 91,
              display_value: 'A',
              overridden_value: null,
            },
            {
              subject_name: 'English',
              subject_code: 'ENG8',
              computed_value: 88,
              display_value: 'A-',
              overridden_value: null,
            },
            {
              subject_name: 'Science',
              subject_code: 'SCI8',
              computed_value: 94,
              display_value: 'A',
              overridden_value: null,
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Household Statement template expects:
 *   - household: { household_name, billing_parent_name }
 *   - currency_code, date_from, date_to, opening_balance, closing_balance
 *   - entries: Array<{
 *       date, type, reference, description,
 *       debit (number | null), credit (number | null), running_balance
 *     }>
 */
const HOUSEHOLD_STATEMENT_DATA = {
  household: {
    household_name: 'Al-Rashid Family',
    billing_parent_name: 'Ahmed Al-Rashid',
  },
  currency_code: 'AED',
  date_from: '2025-09-01',
  date_to: '2026-03-16',
  opening_balance: 0.0,
  closing_balance: 16500.0,
  entries: [
    {
      date: '2025-09-15',
      type: 'invoice',
      reference: 'INV-202509-0001',
      description: 'Tuition Fee — Term 1',
      debit: 15000.0,
      credit: null,
      running_balance: 15000.0,
    },
    {
      date: '2025-10-01',
      type: 'payment',
      reference: 'REC-202510-0001',
      description: 'Bank transfer payment',
      debit: null,
      credit: 15000.0,
      running_balance: 0.0,
    },
    {
      date: '2026-01-15',
      type: 'invoice',
      reference: 'INV-202601-0001',
      description: 'Tuition Fee — Term 2',
      debit: 16500.0,
      credit: null,
      running_balance: 16500.0,
    },
  ],
};

// ─── Snapshot tests ─────────────────────────────────────────────────────────

describe('PDF Template Snapshots', () => {
  describe('Invoice', () => {
    it('EN: renders deterministic HTML', () => {
      const html = renderInvoiceEn(INVOICE_DATA, BRANDING);
      expect(html).toMatchSnapshot();
    });

    it('AR: renders deterministic HTML', () => {
      const html = renderInvoiceAr(INVOICE_DATA, BRANDING);
      expect(html).toMatchSnapshot();
    });
  });

  describe('Receipt', () => {
    it('EN: renders deterministic HTML', () => {
      const html = renderReceiptEn(RECEIPT_DATA, BRANDING);
      expect(html).toMatchSnapshot();
    });

    it('AR: renders deterministic HTML', () => {
      const html = renderReceiptAr(RECEIPT_DATA, BRANDING);
      expect(html).toMatchSnapshot();
    });
  });

  describe('Payslip', () => {
    it('EN: renders deterministic HTML', () => {
      const html = renderPayslipEn(PAYSLIP_DATA, BRANDING);
      expect(html).toMatchSnapshot();
    });

    it('AR: renders deterministic HTML', () => {
      const html = renderPayslipAr(PAYSLIP_DATA, BRANDING);
      expect(html).toMatchSnapshot();
    });
  });

  describe('Report Card', () => {
    it('EN: renders deterministic HTML', () => {
      const html = renderReportCardEn(REPORT_CARD_DATA, BRANDING);
      expect(html).toMatchSnapshot();
    });

    it('AR: renders deterministic HTML', () => {
      const html = renderReportCardAr(REPORT_CARD_DATA, BRANDING);
      expect(html).toMatchSnapshot();
    });
  });

  describe('Transcript', () => {
    it('EN: renders deterministic HTML', () => {
      const html = renderTranscriptEn(TRANSCRIPT_DATA, BRANDING);
      expect(html).toMatchSnapshot();
    });

    it('AR: renders deterministic HTML', () => {
      const html = renderTranscriptAr(TRANSCRIPT_DATA, BRANDING);
      expect(html).toMatchSnapshot();
    });
  });

  describe('Household Statement', () => {
    it('EN: renders deterministic HTML', () => {
      const html = renderHouseholdStatementEn(HOUSEHOLD_STATEMENT_DATA, BRANDING);
      expect(html).toMatchSnapshot();
    });

    it('AR: renders deterministic HTML', () => {
      const html = renderHouseholdStatementAr(HOUSEHOLD_STATEMENT_DATA, BRANDING);
      expect(html).toMatchSnapshot();
    });
  });
});
