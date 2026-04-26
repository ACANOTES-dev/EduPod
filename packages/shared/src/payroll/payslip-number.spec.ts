import { formatPayslipNumber } from './payslip-number';

describe('formatPayslipNumber', () => {
  it('formats a basic value with 6-digit zero-padded sequence', () => {
    expect(
      formatPayslipNumber({ prefix: 'PSL', periodYear: 2026, periodMonth: 4, sequence: 1 }),
    ).toBe('PSL-202604-000001');
  });

  it('zero-pads single-digit months to two digits', () => {
    expect(
      formatPayslipNumber({ prefix: 'PSL', periodYear: 2026, periodMonth: 1, sequence: 42 }),
    ).toBe('PSL-202601-000042');
  });

  it('handles December (month=12) without truncation', () => {
    expect(
      formatPayslipNumber({ prefix: 'PSL', periodYear: 2026, periodMonth: 12, sequence: 7 }),
    ).toBe('PSL-202612-000007');
  });

  it('keeps the canonical 6-digit width when sequence is exactly 999999', () => {
    expect(
      formatPayslipNumber({ prefix: 'PSL', periodYear: 2026, periodMonth: 4, sequence: 999_999 }),
    ).toBe('PSL-202604-999999');
  });

  it('grows beyond 6 digits without truncation when sequence overflows the pad width', () => {
    expect(
      formatPayslipNumber({ prefix: 'PSL', periodYear: 2026, periodMonth: 4, sequence: 1_000_000 }),
    ).toBe('PSL-202604-1000000');
  });

  it('honours a tenant-specific prefix', () => {
    expect(
      formatPayslipNumber({ prefix: 'NHQS', periodYear: 2026, periodMonth: 6, sequence: 17 }),
    ).toBe('NHQS-202606-000017');
  });
});
