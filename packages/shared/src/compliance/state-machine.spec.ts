import type { ComplianceRequestStatus } from '../types/compliance';

import {
  getValidComplianceTransitions,
  isTerminalComplianceStatus,
  isValidComplianceTransition,
} from './state-machine';

describe('ComplianceRequestStatus state machine', () => {
  // ─── Valid transitions ─────────────────────────────────────────────────────

  it('should allow submitted → classified', () => {
    expect(isValidComplianceTransition('submitted', 'classified')).toBe(true);
  });

  it('should allow classified → approved', () => {
    expect(isValidComplianceTransition('classified', 'approved')).toBe(true);
  });

  it('should allow classified → rejected', () => {
    expect(isValidComplianceTransition('classified', 'rejected')).toBe(true);
  });

  it('should allow approved → completed', () => {
    expect(isValidComplianceTransition('approved', 'completed')).toBe(true);
  });

  // ─── Blocked transitions ───────────────────────────────────────────────────

  it('should block submitted → approved (skipping classify)', () => {
    expect(isValidComplianceTransition('submitted', 'approved')).toBe(false);
  });

  it('should block submitted → completed (skipping classify and approve)', () => {
    expect(isValidComplianceTransition('submitted', 'completed')).toBe(false);
  });

  it('should block submitted → rejected (must be classified first)', () => {
    expect(isValidComplianceTransition('submitted', 'rejected')).toBe(false);
  });

  it('should block submitted → submitted', () => {
    expect(isValidComplianceTransition('submitted', 'submitted')).toBe(false);
  });

  it('should block classified → submitted (no backward transition)', () => {
    expect(isValidComplianceTransition('classified', 'submitted')).toBe(false);
  });

  it('should block classified → completed (skipping approve)', () => {
    expect(isValidComplianceTransition('classified', 'completed')).toBe(false);
  });

  it('should block classified → classified', () => {
    expect(isValidComplianceTransition('classified', 'classified')).toBe(false);
  });

  it('should block approved → classified (no backward transition)', () => {
    expect(isValidComplianceTransition('approved', 'classified')).toBe(false);
  });

  it('should block approved → rejected', () => {
    expect(isValidComplianceTransition('approved', 'rejected')).toBe(false);
  });

  it('should block approved → approved', () => {
    expect(isValidComplianceTransition('approved', 'approved')).toBe(false);
  });

  it('should block rejected → submitted (terminal)', () => {
    expect(isValidComplianceTransition('rejected', 'submitted')).toBe(false);
  });

  it('should block rejected → classified (terminal)', () => {
    expect(isValidComplianceTransition('rejected', 'classified')).toBe(false);
  });

  it('should block completed → approved (terminal)', () => {
    expect(isValidComplianceTransition('completed', 'approved')).toBe(false);
  });

  it('should block completed → submitted (terminal)', () => {
    expect(isValidComplianceTransition('completed', 'submitted')).toBe(false);
  });

  // ─── Terminal statuses ─────────────────────────────────────────────────────

  it('should identify rejected as terminal', () => {
    expect(isTerminalComplianceStatus('rejected')).toBe(true);
  });

  it('should identify completed as terminal', () => {
    expect(isTerminalComplianceStatus('completed')).toBe(true);
  });

  it('should not identify submitted as terminal', () => {
    expect(isTerminalComplianceStatus('submitted')).toBe(false);
  });

  it('should not identify classified as terminal', () => {
    expect(isTerminalComplianceStatus('classified')).toBe(false);
  });

  it('should not identify approved as terminal', () => {
    expect(isTerminalComplianceStatus('approved')).toBe(false);
  });

  // ─── getValidComplianceTransitions ───────────────────────────────────────

  it('should return correct transitions for submitted', () => {
    expect(getValidComplianceTransitions('submitted')).toEqual(['classified']);
  });

  it('should return correct transitions for classified', () => {
    const transitions = getValidComplianceTransitions('classified');
    expect(transitions).toEqual(expect.arrayContaining(['approved', 'rejected']));
    expect(transitions).toHaveLength(2);
  });

  it('should return correct transitions for approved', () => {
    expect(getValidComplianceTransitions('approved')).toEqual(['completed']);
  });

  it('should return empty array for rejected (terminal)', () => {
    expect(getValidComplianceTransitions('rejected')).toEqual([]);
  });

  it('should return empty array for completed (terminal)', () => {
    expect(getValidComplianceTransitions('completed')).toEqual([]);
  });

  // ─── Type exhaustiveness ──────────────────────────────────────────────────

  it('edge: should cover all ComplianceRequestStatus values', () => {
    const allStatuses: ComplianceRequestStatus[] = [
      'submitted',
      'classified',
      'approved',
      'rejected',
      'completed',
    ];
    for (const status of allStatuses) {
      expect(() => getValidComplianceTransitions(status)).not.toThrow();
      expect(() => isTerminalComplianceStatus(status)).not.toThrow();
    }
  });
});
