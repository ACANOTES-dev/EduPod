import type { SenReferralStatus } from './enums';
import {
  getValidReferralTransitions,
  isTerminalReferralStatus,
  isValidReferralTransition,
} from './state-machine-referral';

describe('SenReferralStatus state machine (forward-only)', () => {
  // ─── Valid transitions ─────────────────────────────────────────────────────

  it('should allow pending → scheduled', () => {
    expect(isValidReferralTransition('pending', 'scheduled')).toBe(true);
  });

  it('should allow scheduled → completed', () => {
    expect(isValidReferralTransition('scheduled', 'completed')).toBe(true);
  });

  it('should allow completed → report_received', () => {
    expect(isValidReferralTransition('completed', 'report_received')).toBe(true);
  });

  // ─── Blocked backward transitions ─────────────────────────────────────────

  it('should block scheduled → pending (backward)', () => {
    expect(isValidReferralTransition('scheduled', 'pending')).toBe(false);
  });

  it('should block completed → scheduled (backward)', () => {
    expect(isValidReferralTransition('completed', 'scheduled')).toBe(false);
  });

  it('should block completed → pending (backward)', () => {
    expect(isValidReferralTransition('completed', 'pending')).toBe(false);
  });

  it('should block report_received → completed (terminal)', () => {
    expect(isValidReferralTransition('report_received', 'completed')).toBe(false);
  });

  it('should block report_received → scheduled (terminal)', () => {
    expect(isValidReferralTransition('report_received', 'scheduled')).toBe(false);
  });

  it('should block report_received → pending (terminal)', () => {
    expect(isValidReferralTransition('report_received', 'pending')).toBe(false);
  });

  // ─── Blocked skip transitions ──────────────────────────────────────────────

  it('should block pending → completed (skipping scheduled)', () => {
    expect(isValidReferralTransition('pending', 'completed')).toBe(false);
  });

  it('should block pending → report_received (skipping two steps)', () => {
    expect(isValidReferralTransition('pending', 'report_received')).toBe(false);
  });

  it('should block scheduled → report_received (skipping completed)', () => {
    expect(isValidReferralTransition('scheduled', 'report_received')).toBe(false);
  });

  // ─── Self-transitions ──────────────────────────────────────────────────────

  it('should block pending → pending', () => {
    expect(isValidReferralTransition('pending', 'pending')).toBe(false);
  });

  it('should block scheduled → scheduled', () => {
    expect(isValidReferralTransition('scheduled', 'scheduled')).toBe(false);
  });

  it('should block completed → completed', () => {
    expect(isValidReferralTransition('completed', 'completed')).toBe(false);
  });

  it('should block report_received → report_received', () => {
    expect(isValidReferralTransition('report_received', 'report_received')).toBe(false);
  });

  // ─── Terminal statuses ─────────────────────────────────────────────────────

  it('should identify report_received as terminal', () => {
    expect(isTerminalReferralStatus('report_received')).toBe(true);
  });

  it('should not identify pending as terminal', () => {
    expect(isTerminalReferralStatus('pending')).toBe(false);
  });

  it('should not identify scheduled as terminal', () => {
    expect(isTerminalReferralStatus('scheduled')).toBe(false);
  });

  it('should not identify completed as terminal', () => {
    expect(isTerminalReferralStatus('completed')).toBe(false);
  });

  // ─── getValidReferralTransitions ──────────────────────────────────────────

  it('should return [scheduled] for pending', () => {
    expect(getValidReferralTransitions('pending')).toEqual(['scheduled']);
  });

  it('should return [completed] for scheduled', () => {
    expect(getValidReferralTransitions('scheduled')).toEqual(['completed']);
  });

  it('should return [report_received] for completed', () => {
    expect(getValidReferralTransitions('completed')).toEqual(['report_received']);
  });

  it('should return empty array for report_received (terminal)', () => {
    expect(getValidReferralTransitions('report_received')).toEqual([]);
  });

  // ─── Type exhaustiveness ──────────────────────────────────────────────────

  it('edge: should cover all SenReferralStatus values', () => {
    const allStatuses: SenReferralStatus[] = [
      'pending',
      'scheduled',
      'completed',
      'report_received',
    ];
    for (const status of allStatuses) {
      expect(() => getValidReferralTransitions(status)).not.toThrow();
      expect(() => isTerminalReferralStatus(status)).not.toThrow();
    }
  });
});
