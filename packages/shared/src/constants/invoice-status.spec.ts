import type { InvoiceStatus } from '../types/finance';

import {
  getValidInvoiceTransitions,
  isPayableInvoiceStatus,
  isTerminalInvoiceStatus,
  isValidInvoiceTransition,
} from './invoice-status';

describe('Invoice Status Transitions', () => {
  // ─── isValidInvoiceTransition ────────────────────────────────────────────────

  describe('isValidInvoiceTransition', () => {
    const validTransitions: [InvoiceStatus, InvoiceStatus][] = [
      ['draft', 'pending_approval'],
      ['draft', 'issued'],
      ['draft', 'cancelled'],
      ['pending_approval', 'issued'],
      ['pending_approval', 'cancelled'],
      ['issued', 'partially_paid'],
      ['issued', 'paid'],
      ['issued', 'overdue'],
      ['issued', 'void'],
      ['issued', 'written_off'],
      ['partially_paid', 'paid'],
      ['partially_paid', 'written_off'],
      ['overdue', 'partially_paid'],
      ['overdue', 'paid'],
      ['overdue', 'void'],
      ['overdue', 'written_off'],
    ];

    it.each(validTransitions)('should allow transition from "%s" to "%s"', (from, to) => {
      expect(isValidInvoiceTransition(from, to)).toBe(true);
    });

    const invalidTransitions: [InvoiceStatus, InvoiceStatus][] = [
      ['draft', 'partially_paid'],
      ['draft', 'paid'],
      ['draft', 'overdue'],
      ['draft', 'void'],
      ['draft', 'written_off'],
      ['pending_approval', 'draft'],
      ['pending_approval', 'partially_paid'],
      ['pending_approval', 'overdue'],
      ['issued', 'draft'],
      ['issued', 'pending_approval'],
      ['issued', 'cancelled'],
      ['partially_paid', 'draft'],
      ['partially_paid', 'issued'],
      ['partially_paid', 'overdue'],
      ['partially_paid', 'void'],
      ['partially_paid', 'cancelled'],
      ['overdue', 'draft'],
      ['overdue', 'issued'],
      ['overdue', 'cancelled'],
    ];

    it.each(invalidTransitions)('should reject transition from "%s" to "%s"', (from, to) => {
      expect(isValidInvoiceTransition(from, to)).toBe(false);
    });

    describe('terminal statuses block all outgoing transitions', () => {
      const terminalStatuses: InvoiceStatus[] = ['paid', 'void', 'cancelled', 'written_off'];

      const allStatuses: InvoiceStatus[] = [
        'draft',
        'pending_approval',
        'issued',
        'partially_paid',
        'overdue',
        'paid',
        'void',
        'cancelled',
        'written_off',
      ];

      for (const terminal of terminalStatuses) {
        it(`should block all transitions from terminal "${terminal}"`, () => {
          for (const target of allStatuses) {
            expect(isValidInvoiceTransition(terminal, target)).toBe(false);
          }
        });
      }
    });
  });

  // ─── getValidInvoiceTransitions ──────────────────────────────────────────────

  describe('getValidInvoiceTransitions', () => {
    it('should return valid targets for draft', () => {
      const targets = getValidInvoiceTransitions('draft');
      expect(targets).toEqual(expect.arrayContaining(['pending_approval', 'issued', 'cancelled']));
      expect(targets).toHaveLength(3);
    });

    it('should return valid targets for pending_approval', () => {
      const targets = getValidInvoiceTransitions('pending_approval');
      expect(targets).toEqual(expect.arrayContaining(['issued', 'cancelled']));
      expect(targets).toHaveLength(2);
    });

    it('should return valid targets for issued', () => {
      const targets = getValidInvoiceTransitions('issued');
      expect(targets).toEqual(
        expect.arrayContaining(['partially_paid', 'paid', 'overdue', 'void', 'written_off']),
      );
      expect(targets).toHaveLength(5);
    });

    it('should return valid targets for partially_paid', () => {
      const targets = getValidInvoiceTransitions('partially_paid');
      expect(targets).toEqual(expect.arrayContaining(['paid', 'written_off']));
      expect(targets).toHaveLength(2);
    });

    it('should return valid targets for overdue', () => {
      const targets = getValidInvoiceTransitions('overdue');
      expect(targets).toEqual(
        expect.arrayContaining(['partially_paid', 'paid', 'void', 'written_off']),
      );
      expect(targets).toHaveLength(4);
    });

    it('should return empty array for terminal statuses', () => {
      expect(getValidInvoiceTransitions('paid')).toEqual([]);
      expect(getValidInvoiceTransitions('void')).toEqual([]);
      expect(getValidInvoiceTransitions('cancelled')).toEqual([]);
      expect(getValidInvoiceTransitions('written_off')).toEqual([]);
    });
  });

  // ─── isTerminalInvoiceStatus ─────────────────────────────────────────────────

  describe('isTerminalInvoiceStatus', () => {
    it.each(['paid', 'void', 'cancelled', 'written_off'] as InvoiceStatus[])(
      'should return true for terminal status "%s"',
      (status) => {
        expect(isTerminalInvoiceStatus(status)).toBe(true);
      },
    );

    it.each([
      'draft',
      'pending_approval',
      'issued',
      'partially_paid',
      'overdue',
    ] as InvoiceStatus[])('should return false for non-terminal status "%s"', (status) => {
      expect(isTerminalInvoiceStatus(status)).toBe(false);
    });
  });

  // ─── isPayableInvoiceStatus ──────────────────────────────────────────────────

  describe('isPayableInvoiceStatus', () => {
    it.each(['issued', 'partially_paid', 'overdue'] as InvoiceStatus[])(
      'should return true for payable status "%s"',
      (status) => {
        expect(isPayableInvoiceStatus(status)).toBe(true);
      },
    );

    it.each([
      'draft',
      'pending_approval',
      'paid',
      'void',
      'cancelled',
      'written_off',
    ] as InvoiceStatus[])('should return false for non-payable status "%s"', (status) => {
      expect(isPayableInvoiceStatus(status)).toBe(false);
    });
  });
});
