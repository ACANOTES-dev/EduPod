import { deriveInvoiceStatus, roundMoney } from './invoice-status.helper';

describe('deriveInvoiceStatus', () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  it("should return 'void' for void invoices", () => {
    expect(deriveInvoiceStatus('void', 500, 500, tomorrow, null)).toBe('void');
  });

  it("should return 'cancelled' for cancelled invoices", () => {
    expect(deriveInvoiceStatus('cancelled', 500, 500, tomorrow, null)).toBe('cancelled');
  });

  it("should return 'pending_approval' for pending invoices", () => {
    expect(deriveInvoiceStatus('pending_approval', 500, 500, tomorrow, null)).toBe(
      'pending_approval',
    );
  });

  it("should return 'written_off' when write-off applied and balance zero", () => {
    expect(deriveInvoiceStatus('issued', 0, 500, tomorrow, 500)).toBe('written_off');
  });

  it("should return 'paid' when balance is zero", () => {
    expect(deriveInvoiceStatus('issued', 0, 500, tomorrow, null)).toBe('paid');
  });

  it("should return 'partially_paid' when balance < total", () => {
    expect(deriveInvoiceStatus('issued', 200, 500, tomorrow, null)).toBe('partially_paid');
  });

  it("should return 'overdue' when balance equals total and past due", () => {
    expect(deriveInvoiceStatus('issued', 500, 500, yesterday, null)).toBe('overdue');
  });

  it("should return 'issued' when balance equals total and not past due", () => {
    expect(deriveInvoiceStatus('issued', 500, 500, tomorrow, null)).toBe('issued');
  });

  it("edge: should handle zero write-off as non-write-off", () => {
    expect(deriveInvoiceStatus('issued', 0, 500, tomorrow, 0)).toBe('paid');
  });
});

describe('roundMoney', () => {
  it('should round to 2 decimal places', () => {
    expect(roundMoney(10.126)).toBe(10.13);
    expect(roundMoney(10.124)).toBe(10.12);
    expect(roundMoney(10.125)).toBe(10.13);
  });

  it('should handle already-rounded values', () => {
    expect(roundMoney(10)).toBe(10);
    expect(roundMoney(10.5)).toBe(10.5);
    expect(roundMoney(10.12)).toBe(10.12);
  });

  it('edge: should handle floating point arithmetic correctly', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in JS
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    // 1.005 * 100 === 100.49999999999999 in JS
    expect(roundMoney(1.005)).toBe(1);
    expect(roundMoney(0.015)).toBe(0.02);
    expect(roundMoney(-0.125)).toBe(-0.12);
  });
});
