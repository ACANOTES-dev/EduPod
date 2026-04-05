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

  // ─── Compensation type branches ────────────────────────────────────────────

  it('should render per_class compensation details', () => {
    const perClassData = {
      ...PAYSLIP_DATA,
      compensation: {
        type: 'per_class' as const,
        base_salary: null,
        per_class_rate: 50.0,
        assigned_class_count: 20,
        bonus_class_rate: 60.0,
        bonus_day_multiplier: null,
      },
      inputs: { days_worked: null, classes_taught: 25 },
      calculations: { basic_pay: 1000, bonus_pay: 300, total_pay: 1300 },
    };
    const result = renderPayslipAr(perClassData, BRANDING);

    expect(result).toContain('\u0628\u0627\u0644\u062D\u0635\u0629');
    expect(result).toContain('LYD 60.00');
  });

  it('should show dash when per_class_rate is null', () => {
    const data = {
      ...PAYSLIP_DATA,
      compensation: {
        type: 'per_class' as const,
        base_salary: null,
        per_class_rate: null,
        assigned_class_count: null,
        bonus_class_rate: null,
        bonus_day_multiplier: null,
      },
      inputs: { days_worked: null, classes_taught: null },
      calculations: { basic_pay: 0, bonus_pay: 0, total_pay: 0 },
    };
    const result = renderPayslipAr(data, BRANDING);

    expect(result).toContain('\u2014');
  });

  it('should omit bonus_class_rate row when null for per_class', () => {
    const data = {
      ...PAYSLIP_DATA,
      compensation: {
        type: 'per_class' as const,
        base_salary: null,
        per_class_rate: 50,
        assigned_class_count: 20,
        bonus_class_rate: null,
        bonus_day_multiplier: null,
      },
      inputs: { days_worked: null, classes_taught: 20 },
      calculations: { basic_pay: 1000, bonus_pay: 0, total_pay: 1000 },
    };
    const result = renderPayslipAr(data, BRANDING);

    expect(result).not.toContain(
      '\u0645\u0639\u062F\u0644 \u0645\u0643\u0627\u0641\u0623\u0629 \u0627\u0644\u062D\u0635\u0629',
    );
  });

  it('should show bonus_day_multiplier when present for salaried', () => {
    const data = {
      ...PAYSLIP_DATA,
      compensation: {
        ...PAYSLIP_DATA.compensation,
        bonus_day_multiplier: 2.0,
      },
    };
    const result = renderPayslipAr(data, BRANDING);

    expect(result).toContain('2x');
    expect(result).toContain('\u0645\u0639\u0627\u0645\u0644 \u0645\u0643\u0627\u0641\u0623\u0629');
  });

  it('should show dash when base_salary is null for salaried', () => {
    const data = {
      ...PAYSLIP_DATA,
      compensation: {
        ...PAYSLIP_DATA.compensation,
        base_salary: null,
      },
    };
    const result = renderPayslipAr(data, BRANDING);

    expect(result).toContain('\u2014');
  });

  it('should show dash when days_worked is null', () => {
    const data = {
      ...PAYSLIP_DATA,
      inputs: { ...PAYSLIP_DATA.inputs, days_worked: null },
    };
    const result = renderPayslipAr(data, BRANDING);

    expect(result).toContain('\u2014');
  });

  // ─── Bank details branches ─────────────────────────────────────────────────

  it('should hide bank section when all bank fields are null', () => {
    const data = {
      ...PAYSLIP_DATA,
      staff: {
        ...PAYSLIP_DATA.staff,
        bank_name: null,
        bank_account_last4: null,
        bank_iban_last4: null,
      },
    };
    const result = renderPayslipAr(data, BRANDING);

    expect(result).not.toContain(
      '\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0645\u0635\u0631\u0641\u064A\u0629',
    );
  });

  it('should show bank section with only bank_name', () => {
    const data = {
      ...PAYSLIP_DATA,
      staff: {
        ...PAYSLIP_DATA.staff,
        bank_account_last4: null,
        bank_iban_last4: null,
      },
    };
    const result = renderPayslipAr(data, BRANDING);

    expect(result).toContain(
      '\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0645\u0635\u0631\u0641\u064A\u0629',
    );
    expect(result).toContain('مصرف الوحدة');
  });

  // ─── Logo and branding branches ────────────────────────────────────────────

  it('should omit logo when logo_url is undefined', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'No Logo' };
    const result = renderPayslipAr(PAYSLIP_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  it('should fall back to school_name when school_name_ar is undefined', () => {
    const brandingNoAr: PdfBranding = { school_name: 'English Only' };
    const result = renderPayslipAr(PAYSLIP_DATA, brandingNoAr);

    expect(result).toContain('English Only');
  });

  it('should use default primary color when none provided', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Minimal' };
    const result = renderPayslipAr(PAYSLIP_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });

  // ─── Employment type formatting branches ───────────────────────────────────

  it('should format full_time employment type in Arabic', () => {
    const result = renderPayslipAr(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('\u062F\u0648\u0627\u0645 \u0643\u0627\u0645\u0644');
  });

  it('should fall back to raw employment type for unknown types', () => {
    const data = {
      ...PAYSLIP_DATA,
      staff: { ...PAYSLIP_DATA.staff, employment_type: 'freelance' },
    };
    const result = renderPayslipAr(data, BRANDING);

    expect(result).toContain('freelance');
  });

  // ─── Null staff fields ─────────────────────────────────────────────────────

  it('should show dash for null department', () => {
    const data = {
      ...PAYSLIP_DATA,
      staff: { ...PAYSLIP_DATA.staff, department: null },
    };
    const result = renderPayslipAr(data, BRANDING);

    expect(result).toContain('\u2014');
  });

  it('should show dash for null job_title', () => {
    const data = {
      ...PAYSLIP_DATA,
      staff: { ...PAYSLIP_DATA.staff, job_title: null },
    };
    const result = renderPayslipAr(data, BRANDING);

    expect(result).toContain('\u2014');
  });

  it('should show dash for null staff_number', () => {
    const data = {
      ...PAYSLIP_DATA,
      staff: { ...PAYSLIP_DATA.staff, staff_number: null },
    };
    const result = renderPayslipAr(data, BRANDING);

    expect(result).toContain('\u2014');
  });
});
