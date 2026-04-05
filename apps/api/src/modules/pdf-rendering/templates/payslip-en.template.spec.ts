import type { PdfBranding } from '../pdf-rendering.service';

import { renderPayslipEn } from './payslip-en.template';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANDING: PdfBranding = {
  school_name: 'Test Academy',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#1e40af',
};

const PAYSLIP_DATA = {
  staff: {
    full_name: 'Sarah Connor',
    staff_number: 'STAFF-001',
    department: 'Science',
    job_title: 'Physics Teacher',
    employment_type: 'full_time',
    bank_name: 'Bank of Ireland',
    bank_account_last4: '1234',
    bank_iban_last4: '5678',
  },
  period: {
    label: 'January 2026',
    month: 1,
    year: 2026,
    total_working_days: 22,
  },
  compensation: {
    type: 'salaried' as const,
    base_salary: 4000.0,
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
    basic_pay: 4000.0,
    bonus_pay: 0,
    total_pay: 4000.0,
  },
  school: {
    name: 'Test Academy',
    name_ar: 'أكاديمية اختبار',
    logo_url: 'https://example.com/logo.png',
    currency_code: 'EUR',
  },
  payslip_number: 'PS-202601-0001',
};

describe('renderPayslipEn', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a non-empty HTML string', () => {
    const result = renderPayslipEn(PAYSLIP_DATA, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should contain valid HTML structure', () => {
    const result = renderPayslipEn(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('</html>');
  });

  it('should include payslip number', () => {
    const result = renderPayslipEn(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('PS-202601-0001');
  });

  it('should include staff info', () => {
    const result = renderPayslipEn(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('Sarah Connor');
    expect(result).toContain('STAFF-001');
    expect(result).toContain('Science');
    expect(result).toContain('Physics Teacher');
  });

  it('should include period information', () => {
    const result = renderPayslipEn(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('January 2026');
  });

  it('should include pay calculations', () => {
    const result = renderPayslipEn(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('EUR 4000.00');
  });

  it('should include bank details (last 4 only)', () => {
    const result = renderPayslipEn(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('1234');
  });

  it('should include school branding', () => {
    const result = renderPayslipEn(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('Test Academy');
  });

  it('should handle per_class compensation type', () => {
    const perClassData = {
      ...PAYSLIP_DATA,
      compensation: {
        type: 'per_class' as const,
        base_salary: null,
        per_class_rate: 50.0,
        assigned_class_count: 20,
        bonus_class_rate: 60.0,
        bonus_day_multiplier: 1.5,
      },
      inputs: {
        days_worked: null,
        classes_taught: 25,
      },
      calculations: {
        basic_pay: 1000.0,
        bonus_pay: 300.0,
        total_pay: 1300.0,
      },
    };
    const result = renderPayslipEn(perClassData, BRANDING);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle null staff fields', () => {
    const data = {
      ...PAYSLIP_DATA,
      staff: {
        ...PAYSLIP_DATA.staff,
        department: null,
        job_title: null,
        bank_name: null,
        bank_account_last4: null,
        bank_iban_last4: null,
      },
    };
    const result = renderPayslipEn(data, BRANDING);

    expect(result).toContain('Sarah Connor');
  });

  // ──��� Salaried compensation null branches ───────────────────────────────────

  it('should show dash when base_salary is null for salaried type', () => {
    const data = {
      ...PAYSLIP_DATA,
      compensation: {
        ...PAYSLIP_DATA.compensation,
        type: 'salaried' as const,
        base_salary: null,
      },
    };
    const result = renderPayslipEn(data, BRANDING);

    // Should contain the em dash (—)
    expect(result).toContain('\u2014');
  });

  it('should show dash when days_worked is null for salaried type', () => {
    const data = {
      ...PAYSLIP_DATA,
      inputs: { ...PAYSLIP_DATA.inputs, days_worked: null },
    };
    const result = renderPayslipEn(data, BRANDING);

    expect(result).toContain('\u2014');
  });

  it('should show bonus_day_multiplier when present for salaried type', () => {
    const data = {
      ...PAYSLIP_DATA,
      compensation: {
        ...PAYSLIP_DATA.compensation,
        type: 'salaried' as const,
        bonus_day_multiplier: 1.5,
      },
    };
    const result = renderPayslipEn(data, BRANDING);

    expect(result).toContain('Bonus Day Multiplier');
    expect(result).toContain('1.5x');
  });

  it('should omit bonus_day_multiplier row when null for salaried type', () => {
    const result = renderPayslipEn(PAYSLIP_DATA, BRANDING);

    expect(result).not.toContain('Bonus Day Multiplier');
  });

  // ─── Per-class compensation null branches ──────────────────────────────────

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
    const result = renderPayslipEn(data, BRANDING);

    expect(result).toContain('Per Class Rate');
    expect(result).toContain('\u2014');
  });

  it('should show bonus_class_rate when present for per_class type', () => {
    const data = {
      ...PAYSLIP_DATA,
      compensation: {
        type: 'per_class' as const,
        base_salary: null,
        per_class_rate: 50,
        assigned_class_count: 20,
        bonus_class_rate: 60,
        bonus_day_multiplier: null,
      },
      inputs: { days_worked: null, classes_taught: 25 },
      calculations: { basic_pay: 1000, bonus_pay: 300, total_pay: 1300 },
    };
    const result = renderPayslipEn(data, BRANDING);

    expect(result).toContain('Bonus Class Rate');
    expect(result).toContain('EUR 60.00');
  });

  it('should omit bonus_class_rate row when null for per_class type', () => {
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
      inputs: { days_worked: null, classes_taught: 25 },
      calculations: { basic_pay: 1000, bonus_pay: 0, total_pay: 1000 },
    };
    const result = renderPayslipEn(data, BRANDING);

    expect(result).not.toContain('Bonus Class Rate');
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
    const result = renderPayslipEn(data, BRANDING);

    expect(result).not.toContain('Bank Details');
  });

  it('should show bank section with only bank_name when others are null', () => {
    const data = {
      ...PAYSLIP_DATA,
      staff: {
        ...PAYSLIP_DATA.staff,
        bank_name: 'Test Bank',
        bank_account_last4: null,
        bank_iban_last4: null,
      },
    };
    const result = renderPayslipEn(data, BRANDING);

    expect(result).toContain('Bank Details');
    expect(result).toContain('Test Bank');
    expect(result).not.toContain('Account');
    expect(result).not.toContain('IBAN');
  });

  it('should show IBAN when present', () => {
    const result = renderPayslipEn(PAYSLIP_DATA, BRANDING);

    expect(result).toContain('IBAN');
    expect(result).toContain('****5678');
  });

  // ─── Logo and branding branches ────────────────────────────────────────────

  it('should omit logo when logo_url is undefined', () => {
    const brandingNoLogo: PdfBranding = { school_name: 'No Logo School' };
    const result = renderPayslipEn(PAYSLIP_DATA, brandingNoLogo);

    expect(result).not.toContain('<img');
  });

  it('should use default primary color when none provided', () => {
    const brandingNoColor: PdfBranding = { school_name: 'Minimal' };
    const result = renderPayslipEn(PAYSLIP_DATA, brandingNoColor);

    expect(result).toContain('#1e40af');
  });

  // ─── Staff number null branch ──────────────────────────────────────────────

  it('should show dash when staff_number is null', () => {
    const data = {
      ...PAYSLIP_DATA,
      staff: { ...PAYSLIP_DATA.staff, staff_number: null },
    };
    const result = renderPayslipEn(data, BRANDING);

    expect(result).toContain('\u2014');
  });
});
