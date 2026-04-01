import type { PaymentStatus } from '../types/finance';

import {
  getValidPaymentTransitions,
  isTerminalPaymentStatus,
  isValidPaymentTransition,
} from './state-machine-payment';

describe('PaymentStatus state machine', () => {
  // ─── Valid transitions ─────────────────────────────────────────────────────

  it('should allow pending → posted', () => {
    expect(isValidPaymentTransition('pending', 'posted')).toBe(true);
  });

  it('should allow pending → failed', () => {
    expect(isValidPaymentTransition('pending', 'failed')).toBe(true);
  });

  it('should allow pending → voided', () => {
    expect(isValidPaymentTransition('pending', 'voided')).toBe(true);
  });

  it('should allow posted → refunded_partial', () => {
    expect(isValidPaymentTransition('posted', 'refunded_partial')).toBe(true);
  });

  it('should allow posted → refunded_full', () => {
    expect(isValidPaymentTransition('posted', 'refunded_full')).toBe(true);
  });

  it('should allow posted → voided', () => {
    expect(isValidPaymentTransition('posted', 'voided')).toBe(true);
  });

  it('should allow failed → pending (retry)', () => {
    expect(isValidPaymentTransition('failed', 'pending')).toBe(true);
  });

  it('should allow refunded_partial → refunded_full', () => {
    expect(isValidPaymentTransition('refunded_partial', 'refunded_full')).toBe(true);
  });

  // ─── Blocked transitions ───────────────────────────────────────────────────

  it('should block pending → pending', () => {
    expect(isValidPaymentTransition('pending', 'pending')).toBe(false);
  });

  it('should block pending → refunded_partial', () => {
    expect(isValidPaymentTransition('pending', 'refunded_partial')).toBe(false);
  });

  it('should block pending → refunded_full', () => {
    expect(isValidPaymentTransition('pending', 'refunded_full')).toBe(false);
  });

  it('should block posted → pending', () => {
    expect(isValidPaymentTransition('posted', 'pending')).toBe(false);
  });

  it('should block posted → failed', () => {
    expect(isValidPaymentTransition('posted', 'failed')).toBe(false);
  });

  it('should block posted → posted', () => {
    expect(isValidPaymentTransition('posted', 'posted')).toBe(false);
  });

  it('should block failed → posted', () => {
    expect(isValidPaymentTransition('failed', 'posted')).toBe(false);
  });

  it('should block failed → voided', () => {
    expect(isValidPaymentTransition('failed', 'voided')).toBe(false);
  });

  it('should block failed → failed', () => {
    expect(isValidPaymentTransition('failed', 'failed')).toBe(false);
  });

  it('should block refunded_partial → pending', () => {
    expect(isValidPaymentTransition('refunded_partial', 'pending')).toBe(false);
  });

  it('should block refunded_partial → voided', () => {
    expect(isValidPaymentTransition('refunded_partial', 'voided')).toBe(false);
  });

  it('should block voided → pending (terminal)', () => {
    expect(isValidPaymentTransition('voided', 'pending')).toBe(false);
  });

  it('should block voided → posted (terminal)', () => {
    expect(isValidPaymentTransition('voided', 'posted')).toBe(false);
  });

  it('should block refunded_full → pending (terminal)', () => {
    expect(isValidPaymentTransition('refunded_full', 'pending')).toBe(false);
  });

  it('should block refunded_full → refunded_partial (terminal)', () => {
    expect(isValidPaymentTransition('refunded_full', 'refunded_partial')).toBe(false);
  });

  // ─── Terminal statuses ─────────────────────────────────────────────────────

  it('should identify voided as terminal', () => {
    expect(isTerminalPaymentStatus('voided')).toBe(true);
  });

  it('should identify refunded_full as terminal', () => {
    expect(isTerminalPaymentStatus('refunded_full')).toBe(true);
  });

  it('should not identify pending as terminal', () => {
    expect(isTerminalPaymentStatus('pending')).toBe(false);
  });

  it('should not identify posted as terminal', () => {
    expect(isTerminalPaymentStatus('posted')).toBe(false);
  });

  it('should not identify failed as terminal', () => {
    expect(isTerminalPaymentStatus('failed')).toBe(false);
  });

  it('should not identify refunded_partial as terminal', () => {
    expect(isTerminalPaymentStatus('refunded_partial')).toBe(false);
  });

  // ─── getValidPaymentTransitions ───────────────────────────────────────────

  it('should return correct transitions for pending', () => {
    const transitions = getValidPaymentTransitions('pending');
    expect(transitions).toEqual(expect.arrayContaining(['posted', 'failed', 'voided']));
    expect(transitions).toHaveLength(3);
  });

  it('should return correct transitions for posted', () => {
    const transitions = getValidPaymentTransitions('posted');
    expect(transitions).toEqual(
      expect.arrayContaining(['refunded_partial', 'refunded_full', 'voided']),
    );
    expect(transitions).toHaveLength(3);
  });

  it('should return correct transitions for failed', () => {
    const transitions = getValidPaymentTransitions('failed');
    expect(transitions).toEqual(['pending']);
  });

  it('should return correct transitions for refunded_partial', () => {
    const transitions = getValidPaymentTransitions('refunded_partial');
    expect(transitions).toEqual(['refunded_full']);
  });

  it('should return empty array for voided (terminal)', () => {
    expect(getValidPaymentTransitions('voided')).toEqual([]);
  });

  it('should return empty array for refunded_full (terminal)', () => {
    expect(getValidPaymentTransitions('refunded_full')).toEqual([]);
  });

  // ─── Type exhaustiveness ──────────────────────────────────────────────────

  it('edge: should cover all PaymentStatus values', () => {
    const allStatuses: PaymentStatus[] = [
      'pending',
      'posted',
      'failed',
      'voided',
      'refunded_partial',
      'refunded_full',
    ];
    for (const status of allStatuses) {
      expect(() => getValidPaymentTransitions(status)).not.toThrow();
      expect(() => isTerminalPaymentStatus(status)).not.toThrow();
    }
  });
});
