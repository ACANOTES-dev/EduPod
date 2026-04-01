import type { PayrollRunStatus } from './state-machine';
import {
  getValidPayrollRunTransitions,
  isTerminalPayrollRunStatus,
  isValidPayrollRunTransition,
} from './state-machine';

describe('PayrollRunStatus state machine', () => {
  // ─── Valid transitions ─────────────────────────────────────────────────────

  it('should allow draft → pending_approval', () => {
    expect(isValidPayrollRunTransition('draft', 'pending_approval')).toBe(true);
  });

  it('should allow draft → cancelled', () => {
    expect(isValidPayrollRunTransition('draft', 'cancelled')).toBe(true);
  });

  it('should allow pending_approval → draft (rejection)', () => {
    expect(isValidPayrollRunTransition('pending_approval', 'draft')).toBe(true);
  });

  it('should allow pending_approval → finalised (approval)', () => {
    expect(isValidPayrollRunTransition('pending_approval', 'finalised')).toBe(true);
  });

  // ─── Blocked transitions ───────────────────────────────────────────────────

  it('should block draft → finalised (skipping approval)', () => {
    expect(isValidPayrollRunTransition('draft', 'finalised')).toBe(false);
  });

  it('should block draft → draft', () => {
    expect(isValidPayrollRunTransition('draft', 'draft')).toBe(false);
  });

  it('should block pending_approval → cancelled', () => {
    expect(isValidPayrollRunTransition('pending_approval', 'cancelled')).toBe(false);
  });

  it('should block pending_approval → pending_approval', () => {
    expect(isValidPayrollRunTransition('pending_approval', 'pending_approval')).toBe(false);
  });

  it('should block finalised → draft', () => {
    expect(isValidPayrollRunTransition('finalised', 'draft')).toBe(false);
  });

  it('should block finalised → pending_approval', () => {
    expect(isValidPayrollRunTransition('finalised', 'pending_approval')).toBe(false);
  });

  it('should block finalised → cancelled', () => {
    expect(isValidPayrollRunTransition('finalised', 'cancelled')).toBe(false);
  });

  it('should block cancelled → draft', () => {
    expect(isValidPayrollRunTransition('cancelled', 'draft')).toBe(false);
  });

  it('should block cancelled → finalised', () => {
    expect(isValidPayrollRunTransition('cancelled', 'finalised')).toBe(false);
  });

  // ─── Terminal statuses ─────────────────────────────────────────────────────

  it('should identify finalised as terminal', () => {
    expect(isTerminalPayrollRunStatus('finalised')).toBe(true);
  });

  it('should identify cancelled as terminal', () => {
    expect(isTerminalPayrollRunStatus('cancelled')).toBe(true);
  });

  it('should not identify draft as terminal', () => {
    expect(isTerminalPayrollRunStatus('draft')).toBe(false);
  });

  it('should not identify pending_approval as terminal', () => {
    expect(isTerminalPayrollRunStatus('pending_approval')).toBe(false);
  });

  // ─── getValidPayrollRunTransitions ────────────────────────────────────────

  it('should return correct transitions for draft', () => {
    const transitions = getValidPayrollRunTransitions('draft');
    expect(transitions).toEqual(expect.arrayContaining(['pending_approval', 'cancelled']));
    expect(transitions).toHaveLength(2);
  });

  it('should return correct transitions for pending_approval', () => {
    const transitions = getValidPayrollRunTransitions('pending_approval');
    expect(transitions).toEqual(expect.arrayContaining(['draft', 'finalised']));
    expect(transitions).toHaveLength(2);
  });

  it('should return empty array for finalised (terminal)', () => {
    expect(getValidPayrollRunTransitions('finalised')).toEqual([]);
  });

  it('should return empty array for cancelled (terminal)', () => {
    expect(getValidPayrollRunTransitions('cancelled')).toEqual([]);
  });

  // ─── Type exhaustiveness ──────────────────────────────────────────────────

  it('edge: should cover all PayrollRunStatus values', () => {
    const allStatuses: PayrollRunStatus[] = ['draft', 'pending_approval', 'finalised', 'cancelled'];
    for (const status of allStatuses) {
      // Should not throw
      expect(() => getValidPayrollRunTransitions(status)).not.toThrow();
      expect(() => isTerminalPayrollRunStatus(status)).not.toThrow();
    }
  });
});
