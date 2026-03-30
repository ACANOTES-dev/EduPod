import type { PdfBranding } from '../pdf-rendering.service';

import { renderPayslipAr } from './payslip-ar.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  school_name_ar: 'أكاديمية اختبار',
  logo_url: 'https://example.com/logo.png',
};

const PAYSLIP_DATA = {
  staff: {
    full_name: 'فاطمة حسن',
    staff_number: 'STAFF-002',
    department: 'اللغة العربية',
    job_title: 'معلمة',
    employment_type: 'full_time',
    bank_name: 'مصرف الوحدة',
    bank_account_last4: '9876',
    bank_iban_last4: '5432',
  },
  period: {
    label: 'يناير 2026',
    month: 1,
    year: 2026,
    total_working_days: 22,
  },
  compensation: {
    type: 'salaried' as const,
    base_salary: 3500.0,
    per_class_rate: null,
    assigned_class_count: null,
    bonus_class_rate: null,
    bonus_day_multiplier: null,
  },
  inputs: {
    days_worked: 20,
    classes_taught: null,
  },
  calculations: {
    basic_pay: 3181.82,
    bonus_pay: 0,
    total_pay: 3181.82,
  },
  school: {
    name: 'Test Academy',
    name_ar: 'أكاديمية اختبار',
    logo_url: 'https://example.com/logo.png',
    currency_code: 'LYD',
  },
  payslip_number: 'PS-202601-0002',
};

describe('renderPayslipAr', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderPayslipAr(PAYSLIP_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should set RTL direction', () => {
    const result = renderPayslipAr(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('dir="rtl"');
  });

  it('should use Arabic school name', () => {
    const result = renderPayslipAr(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('أكاديمية اختبار');
  });

  it('should include payslip number', () => {
    const result = renderPayslipAr(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('PS-202601-0002');
  });

  it('should include staff info in Arabic', () => {
    const result = renderPayslipAr(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('فاطمة حسن');
    expect(result).toContain('STAFF-002');
  });

  it('should include period info', () => {
    const result = renderPayslipAr(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('يناير 2026');
  });

  it('should include Noto Sans Arabic font', () => {
    const result = renderPayslipAr(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('Noto Sans Arabic');
  });
});
