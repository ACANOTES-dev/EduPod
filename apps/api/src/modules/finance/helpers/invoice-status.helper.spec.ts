import { BadRequestException } from '@nestjs/common';

import {
  deriveInvoiceStatus,
  isPayableStatus,
  roundMoney,
  validateInvoiceTransition,
} from './invoice-status.helper';

// ─── validateInvoiceTransition ──────────────────────────────────────────────

describe('validateInvoiceTransition', () => {
  describe('valid user-initiated transitions', () => {
    it.each([
      ['draft', 'pending_approval'],
      ['draft', 'issued'],
      ['draft', 'cancelled'],
      ['pending_approval', 'issued'],
      ['pending_approval', 'cancelled'],
      ['issued', 'void'],
      ['issued', 'written_off'],
      ['overdue', 'void'],
      ['overdue', 'written_off'],
    ] as const)('should allow %s -> %s', (from, to) => {
      expect(() => validateInvoiceTransition(from, to)).not.toThrow();
    });
  });

  describe('valid system-driven transitions', () => {
    it.each([
      ['issued', 'partially_paid'],
      ['issued', 'paid'],
      ['issued', 'overdue'],
      ['partially_paid', 'paid'],
      ['partially_paid', 'written_off'],
      ['overdue', 'partially_paid'],
      ['overdue', 'paid'],
    ] as const)('should allow %s -> %s', (from, to) => {
      expect(() => validateInvoiceTransition(from, to)).not.toThrow();
    });
  });

  describe('invalid transitions from terminal states', () => {
    const terminalStatuses = ['paid', 'void', 'cancelled', 'written_off'] as const;
    const allStatuses = [
      'draft',
      'pending_approval',
      'issued',
      'partially_paid',
      'paid',
      'overdue',
      'void',
      'cancelled',
      'written_off',
    ] as const;

    for (const terminal of terminalStatuses) {
      for (const target of allStatuses) {
        it(`should block ${terminal} -> ${target}`, () => {
          expect(() => validateInvoiceTransition(terminal, target)).toThrow(BadRequestException);
        });
      }
    }
  });

  describe('invalid transitions between non-terminal states', () => {
    it.each([
      ['draft', 'partially_paid'],
      ['draft', 'paid'],
      ['draft', 'overdue'],
      ['draft', 'void'],
      ['draft', 'written_off'],
      ['pending_approval', 'partially_paid'],
      ['pending_approval', 'paid'],
      ['pending_approval', 'overdue'],
      ['pending_approval', 'void'],
      ['pending_approval', 'written_off'],
      ['issued', 'draft'],
      ['issued', 'pending_approval'],
      ['issued', 'cancelled'],
      ['partially_paid', 'draft'],
      ['partially_paid', 'issued'],
      ['partially_paid', 'overdue'],
      ['partially_paid', 'void'],
      ['partially_paid', 'cancelled'],
      ['partially_paid', 'pending_approval'],
      ['overdue', 'draft'],
      ['overdue', 'issued'],
      ['overdue', 'pending_approval'],
      ['overdue', 'cancelled'],
    ] as const)('should block %s -> %s', (from, to) => {
      expect(() => validateInvoiceTransition(from, to)).toThrow(BadRequestException);
    });
  });

  it('should include from and to statuses in error message', () => {
    try {
      validateInvoiceTransition('paid', 'draft');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error).toMatchObject({ response: { code: expect.any(String) } });
      const response = (error as BadRequestException).getResponse() as Record<string, string>;
      expect(response.code).toBe('INVALID_STATUS_TRANSITION');
      expect(response.message).toContain('paid');
      expect(response.message).toContain('draft');
    }
  });
});

// ─── deriveInvoiceStatus ────────────────────────────────────────────────────

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

  it('edge: should handle zero write-off as non-write-off', () => {
    expect(deriveInvoiceStatus('issued', 0, 500, tomorrow, 0)).toBe('paid');
  });
});

// ─── isPayableStatus ────────────────────────────────────────────────────────

describe('isPayableStatus', () => {
  it('should return true for payable statuses', () => {
    expect(isPayableStatus('issued')).toBe(true);
    expect(isPayableStatus('partially_paid')).toBe(true);
    expect(isPayableStatus('overdue')).toBe(true);
  });

  it('should return false for non-payable statuses', () => {
    expect(isPayableStatus('draft')).toBe(false);
    expect(isPayableStatus('pending_approval')).toBe(false);
    expect(isPayableStatus('paid')).toBe(false);
    expect(isPayableStatus('void')).toBe(false);
    expect(isPayableStatus('cancelled')).toBe(false);
    expect(isPayableStatus('written_off')).toBe(false);
  });
});

// ─── roundMoney ─────────────────────────────────────────────────────────────

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
